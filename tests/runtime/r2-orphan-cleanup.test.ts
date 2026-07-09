/// <reference types="jest" />
/**
 * R2 orphan cleanup — SAFETY CONTRACT.
 *
 * Every deletion guard is exercised against the pure planner
 * (lib/ops/r2-orphan-plan.ts) so a regression that would delete the wrong thing
 * fails the build. Plus a source-level guard that the CLI defaults to dry-run
 * and only reaches deleteFromR2 behind the confirmation phrase. (2026-07-08)
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import {
  planOrphanDeletions,
  CONFIRM_PHRASE,
  SANITY_THRESHOLD,
  type PlanInput,
  type R2ObjectMeta,
} from '../../lib/ops/r2-orphan-plan';

const NOW = new Date('2026-07-08T00:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z'); // > 30d before NOW
const RECENT = new Date('2026-07-01T00:00:00Z'); // < 30d before NOW

function obj(key: string, lastModified: Date | null = OLD, size = 1000): R2ObjectMeta {
  return { key, size, lastModified };
}

/** A fully-valid execute input with a single old, in-scope, unreferenced orphan. */
function baseExecuteInput(overrides: Partial<PlanInput> = {}): PlanInput {
  const orphan = obj('photos/RLS1/1.jpg', OLD);
  return {
    bucketObjects: [orphan],
    listComplete: true,
    dbRefKeys: new Set<string>(),
    now: NOW,
    olderThanDays: 30,
    execute: true,
    confirm: CONFIRM_PHRASE,
    manifestKeys: new Set([orphan.key]),
    maxDelete: 100,
    ...overrides,
  };
}

describe('r2-orphan-plan — deletion safety filters', () => {
  it('sanity: a fully-valid execute input DOES plan a deletion (control)', () => {
    const p = planOrphanDeletions(baseExecuteInput());
    expect(p.aborted).toBe(false);
    expect(p.willDelete).toBe(true);
    expect(p.candidates.map((c) => c.key)).toEqual(['photos/RLS1/1.jpg']);
  });

  it('1. dry-run is the default — execute=false never deletes', () => {
    const p = planOrphanDeletions(baseExecuteInput({ execute: false }));
    expect(p.willDelete).toBe(false);
    // Candidates are still reported (for the inventory) but nothing deletes.
    expect(p.candidates.length).toBe(1);
  });

  it('2. execute requires the exact confirmation string', () => {
    expect(planOrphanDeletions(baseExecuteInput({ confirm: null })).willDelete).toBe(false);
    expect(planOrphanDeletions(baseExecuteInput({ confirm: 'delete listing media orphans' })).willDelete).toBe(false);
    expect(planOrphanDeletions(baseExecuteInput({ confirm: 'DELETE ALL' })).willDelete).toBe(false);
    const bad = planOrphanDeletions(baseExecuteInput({ confirm: 'nope' }));
    expect(bad.aborted).toBe(true);
    expect(bad.abortReasons.join(' ')).toContain(CONFIRM_PHRASE);
  });

  it('3. never deletes objects outside listing-media prefixes', () => {
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [obj('agents/maya.jpg', OLD), obj('documents/contract.pdf', OLD)],
        manifestKeys: new Set(['agents/maya.jpg', 'documents/contract.pdf']),
      }),
    );
    expect(p.candidates.length).toBe(0);
    expect(p.willDelete).toBe(false);
    expect(p.outOfScope).toBe(2);
  });

  it('4. never deletes when the DB reference query failed (dbRefKeys=null)', () => {
    const p = planOrphanDeletions(baseExecuteInput({ dbRefKeys: null }));
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/DB reference query failed/i);
  });

  it('5. never deletes when the R2 list is partial/incomplete', () => {
    const p = planOrphanDeletions(baseExecuteInput({ listComplete: false }));
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/partial|incomplete/i);
  });

  it('6. never deletes without a manifest under --execute', () => {
    const p = planOrphanDeletions(baseExecuteInput({ manifestKeys: null }));
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/manifest/i);
  });

  it('6b. deletes only keys present in the reviewed manifest', () => {
    const inManifest = obj('photos/RLS1/1.jpg', OLD);
    const notInManifest = obj('photos/RLS2/1.jpg', OLD);
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [inManifest, notInManifest],
        manifestKeys: new Set([inManifest.key]), // only the first is approved
      }),
    );
    expect(p.candidates.map((c) => c.key)).toEqual(['photos/RLS1/1.jpg']);
  });

  it('7. never deletes a candidate still referenced by the DB', () => {
    const referenced = obj('photos/RLS1/1.jpg', OLD);
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [referenced],
        dbRefKeys: new Set([referenced.key]), // still referenced (r2_key/primary/cached)
      }),
    );
    expect(p.candidates.length).toBe(0);
    expect(p.willDelete).toBe(false);
  });

  it('8. never deletes an object newer than the safety window (or of unknown age)', () => {
    const recent = planOrphanDeletions(
      baseExecuteInput({ bucketObjects: [obj('photos/RLS1/1.jpg', RECENT)], manifestKeys: new Set(['photos/RLS1/1.jpg']) }),
    );
    expect(recent.candidates.length).toBe(0);

    const unknownAge = planOrphanDeletions(
      baseExecuteInput({ bucketObjects: [obj('photos/RLS1/1.jpg', null)], manifestKeys: new Set(['photos/RLS1/1.jpg']) }),
    );
    expect(unknownAge.candidates.length).toBe(0);
  });

  it('extra: candidate count over --max-delete aborts', () => {
    const many = Array.from({ length: 5 }, (_, i) => obj(`photos/RLS/${i}.jpg`, OLD));
    const p = planOrphanDeletions(
      baseExecuteInput({ bucketObjects: many, manifestKeys: new Set(many.map((o) => o.key)), maxDelete: 3 }),
    );
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/max-delete/i);
  });

  it('extra: candidate count over the sanity threshold aborts even within max-delete', () => {
    const many = Array.from({ length: SANITY_THRESHOLD + 1 }, (_, i) => obj(`photos/RLS/${i}.jpg`, OLD));
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: many,
        manifestKeys: new Set(many.map((o) => o.key)),
        maxDelete: SANITY_THRESHOLD + 100, // generous cap, but sanity still trips
      }),
    );
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/sanity threshold/i);
  });
});

describe('r2-orphan-cleanup.ts — CLI source safety guard', () => {
  const src = readFileSync(path.resolve(__dirname, '../../scripts/r2-orphan-cleanup.ts'), 'utf8');

  it('defaults to dry-run (execute only when --execute present)', () => {
    expect(src).toMatch(/const execute = has\('--execute'\)/);
  });

  it('only calls deleteFromR2 after the planner authorizes willDelete', () => {
    // The single deleteFromR2 call must be positioned AFTER the `if (!plan.willDelete)`
    // early-return guard.
    const guardIdx = src.indexOf('if (!plan.willDelete)');
    const delIdx = src.indexOf('deleteFromR2(batch)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(delIdx).toBeGreaterThan(guardIdx);
  });

  it('requires the exact confirmation phrase constant', () => {
    expect(src).toMatch(/CONFIRM_PHRASE/);
  });
});
