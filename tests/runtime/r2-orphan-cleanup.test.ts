/// <reference types="jest" />
/**
 * R2 orphan cleanup — SAFETY CONTRACT.
 *
 * Every deletion guard is exercised against the pure planner
 * (lib/ops/r2-orphan-plan.ts) so a regression that would delete the wrong thing
 * fails the build. Plus a source-level guard that the CLI defaults to dry-run
 * and only reaches deleteFromR2 behind the confirmation phrase.
 *
 * Batch-cap (2026-07-09): --batch-size selects up to N candidates (oldest-first,
 * then key asc); --max-delete is the hard ceiling on that selected batch.
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import {
  planOrphanDeletions,
  resolveExecute,
  isValidGuardNumber,
  CONFIRM_PHRASE,
  type PlanInput,
  type R2ObjectMeta,
} from '../../lib/ops/r2-orphan-plan';

const NOW = new Date('2026-07-08T00:00:00Z');
const OLD = new Date('2026-01-01T00:00:00Z'); // > 30d before NOW
const OLDER = new Date('2025-12-01T00:00:00Z'); // even older
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
    batchSize: 100,
    ...overrides,
  };
}

describe('r2-orphan-plan — deletion safety filters', () => {
  it('control: a fully-valid execute input DOES plan a deletion', () => {
    const p = planOrphanDeletions(baseExecuteInput());
    expect(p.aborted).toBe(false);
    expect(p.willDelete).toBe(true);
    expect(p.candidates.map((c) => c.key)).toEqual(['photos/RLS1/1.jpg']);
    expect(p.selected.map((c) => c.key)).toEqual(['photos/RLS1/1.jpg']);
  });

  it('1. dry-run is the default — execute=false never deletes', () => {
    const p = planOrphanDeletions(baseExecuteInput({ execute: false }));
    expect(p.willDelete).toBe(false);
    // Candidates are still reported (for the inventory) but nothing is selected.
    expect(p.candidates.length).toBe(1);
    expect(p.selected.length).toBe(0);
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
    expect(p.selected.length).toBe(0);
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

  it('6b. selects only keys present in the reviewed manifest', () => {
    const inManifest = obj('photos/RLS1/1.jpg', OLD);
    const notInManifest = obj('photos/RLS2/1.jpg', OLD);
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [inManifest, notInManifest],
        manifestKeys: new Set([inManifest.key]), // only the first is approved
      }),
    );
    expect(p.candidates.map((c) => c.key)).toEqual(['photos/RLS1/1.jpg']);
    expect(p.selected.map((c) => c.key)).toEqual(['photos/RLS1/1.jpg']);
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
    expect(p.selected.length).toBe(0);
    expect(p.willDelete).toBe(false);
  });

  it('8. never deletes an object newer than the safety window (or of unknown age)', () => {
    const recent = planOrphanDeletions(
      baseExecuteInput({ bucketObjects: [obj('photos/RLS1/1.jpg', RECENT)], manifestKeys: new Set(['photos/RLS1/1.jpg']) }),
    );
    expect(recent.candidates.length).toBe(0);
    expect(recent.selected.length).toBe(0);

    const unknownAge = planOrphanDeletions(
      baseExecuteInput({ bucketObjects: [obj('photos/RLS1/1.jpg', null)], manifestKeys: new Set(['photos/RLS1/1.jpg']) }),
    );
    expect(unknownAge.candidates.length).toBe(0);
    expect(unknownAge.selected.length).toBe(0);
  });

  // ── Batch-cap behaviour ──────────────────────────────────────────────────
  it('B1. --execute requires --batch-size', () => {
    const p = planOrphanDeletions(baseExecuteInput({ batchSize: null }));
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/--batch-size N is required/i);
  });

  it('B2. --batch-size must be a positive integer', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      const p = planOrphanDeletions(baseExecuteInput({ batchSize: bad }));
      expect(p.willDelete).toBe(false);
      expect(p.aborted).toBe(true);
      expect(p.abortReasons.join(' ')).toMatch(/--batch-size must be a positive integer/i);
    }
  });

  it('B3. --batch-size=100 selects EXACTLY 100 when more candidates exist', () => {
    const many = Array.from({ length: 250 }, (_, i) => obj(`photos/RLS/${String(i).padStart(4, '0')}.jpg`, OLD));
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: many,
        manifestKeys: new Set(many.map((o) => o.key)),
        batchSize: 100,
        maxDelete: 100,
      }),
    );
    expect(p.aborted).toBe(false);
    expect(p.candidates.length).toBe(250); // full inventory preserved
    expect(p.selected.length).toBe(100); // capped batch
    expect(p.willDelete).toBe(true);
  });

  it('B4. --max-delete still aborts if the selected batch exceeds it', () => {
    const many = Array.from({ length: 250 }, (_, i) => obj(`photos/RLS/${String(i).padStart(4, '0')}.jpg`, OLD));
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: many,
        manifestKeys: new Set(many.map((o) => o.key)),
        batchSize: 200, // would select 200…
        maxDelete: 100, // …but hard ceiling is 100 → abort
      }),
    );
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.selected.length).toBe(0);
    expect(p.abortReasons.join(' ')).toMatch(/selected batch 200 exceeds --max-delete 100/i);
  });

  it('B5. dry-run still reports the FULL candidate inventory (selects nothing)', () => {
    const many = Array.from({ length: 250 }, (_, i) => obj(`photos/RLS/${String(i).padStart(4, '0')}.jpg`, OLD));
    const p = planOrphanDeletions(
      baseExecuteInput({ execute: false, bucketObjects: many, manifestKeys: new Set(many.map((o) => o.key)) }),
    );
    expect(p.candidates.length).toBe(250);
    expect(p.selected.length).toBe(0);
    expect(p.willDelete).toBe(false);
  });

  it('B6. no referenced / too-new / out-of-scope object can enter the selected batch', () => {
    const good1 = obj('photos/good1.jpg', OLD);
    const good2 = obj('photos/good2.jpg', OLD);
    const referenced = obj('photos/ref.jpg', OLD);
    const tooNew = obj('photos/new.jpg', RECENT);
    const outOfScope = obj('agents/x.jpg', OLD);
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [good1, good2, referenced, tooNew, outOfScope],
        manifestKeys: new Set([good1.key, good2.key, referenced.key, tooNew.key, outOfScope.key]),
        dbRefKeys: new Set([referenced.key]),
        batchSize: 100,
        maxDelete: 100,
      }),
    );
    const selKeys = p.selected.map((o) => o.key).sort();
    expect(selKeys).toEqual(['photos/good1.jpg', 'photos/good2.jpg']);
    expect(selKeys).not.toContain('photos/ref.jpg');
    expect(selKeys).not.toContain('photos/new.jpg');
    expect(selKeys).not.toContain('agents/x.jpg');
  });

  it('B7. selected batch is ordered oldest LastModified first (then key asc)', () => {
    const newer = obj('photos/aaa.jpg', OLD); // key sorts first, but newer
    const older = obj('photos/zzz.jpg', OLDER); // key sorts last, but oldest
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [newer, older],
        manifestKeys: new Set([newer.key, older.key]),
        batchSize: 1, // only the single oldest should be selected
        maxDelete: 1,
      }),
    );
    expect(p.selected.map((o) => o.key)).toEqual(['photos/zzz.jpg']); // oldest wins over key order
  });

  it('P1: malformed --max-delete (NaN) fails closed, never bypasses the ceiling', () => {
    const many = Array.from({ length: 5 }, (_, i) => obj(`photos/RLS/${i}.jpg`, OLD));
    const p = planOrphanDeletions(
      baseExecuteInput({ bucketObjects: many, manifestKeys: new Set(many.map((o) => o.key)), maxDelete: NaN }),
    );
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/--max-delete must be a positive integer/i);
  });

  it('P1: malformed --older-than-days (NaN) fails closed → zero candidates', () => {
    const p = planOrphanDeletions(
      baseExecuteInput({
        bucketObjects: [obj('photos/RLS1/1.jpg', OLD)],
        manifestKeys: new Set(['photos/RLS1/1.jpg']),
        olderThanDays: NaN,
      }),
    );
    expect(p.candidates.length).toBe(0);
    expect(p.selected.length).toBe(0);
    expect(p.aborted).toBe(true);
    expect(p.willDelete).toBe(false);
    expect(p.abortReasons.join(' ')).toMatch(/older-than-days must be a finite non-negative integer/i);
  });

  it('P2: explicit --dry-run overrides --execute (resolveExecute)', () => {
    expect(resolveExecute(true, false)).toBe(true); // execute, no dry-run → run
    expect(resolveExecute(true, true)).toBe(false); // both → dry-run wins, no delete
    expect(resolveExecute(false, false)).toBe(false); // default dry-run
    expect(resolveExecute(false, true)).toBe(false);
  });

  it('isValidGuardNumber accepts only finite non-negative integers', () => {
    expect(isValidGuardNumber(0)).toBe(true);
    expect(isValidGuardNumber(500)).toBe(true);
    expect(isValidGuardNumber(null)).toBe(false);
    expect(isValidGuardNumber(NaN)).toBe(false);
    expect(isValidGuardNumber(-1)).toBe(false);
    expect(isValidGuardNumber(1.5)).toBe(false);
    expect(isValidGuardNumber(Infinity)).toBe(false);
  });
});

describe('r2-orphan-cleanup.ts — CLI source safety guard', () => {
  const src = readFileSync(path.resolve(__dirname, '../../scripts/r2-orphan-cleanup.ts'), 'utf8');

  it('defaults to dry-run (execute derived via resolveExecute, not a bare --execute check)', () => {
    expect(src).toMatch(/const execute = resolveExecute\(/);
    expect(src).not.toMatch(/const execute = has\('--execute'\);/);
  });

  it('deletes ONLY the planner-selected batch, after the willDelete guard', () => {
    const guardIdx = src.indexOf('if (!plan.willDelete)');
    const delIdx = src.indexOf('deleteFromR2(batch)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(delIdx).toBeGreaterThan(guardIdx);
    // The delete loop must operate on plan.selected, never plan.candidates.
    expect(src).toMatch(/const keys = plan\.selected\.map\(/);
    expect(src).not.toMatch(/const keys = plan\.candidates\.map\(/);
  });

  it('requires the exact confirmation phrase constant', () => {
    expect(src).toMatch(/CONFIRM_PHRASE/);
  });

  it('parses and validates --batch-size (positive integer, fail closed)', () => {
    expect(src).toMatch(/--batch-size/);
    expect(src).toMatch(/--batch-size must be a positive integer/);
    expect(src).toMatch(/batchSize,/); // passed into PlanInput
  });

  it('validates numeric guard flags (fails closed on malformed --max-delete/--older-than-days)', () => {
    expect(src).toMatch(/isValidGuardNumber/);
    expect(src).toMatch(/--max-delete must be a non-negative integer/);
    expect(src).toMatch(/--older-than-days must be a non-negative integer/);
  });
});
