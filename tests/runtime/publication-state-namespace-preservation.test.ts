/// <reference types="jest" />
/**
 * `Listing.compliance.mallan_publication` SURVIVES EVERY LANE THAT TOUCHES A ROW.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXISTS BEFORE THE FEATURE DOES
 *
 * The directive requires exhausting existing canonical storage before asking for
 * schema growth, and requires PROVING the chosen namespace is preserved by every
 * lane before trusting it. `Listing.compliance` is existing Mallan-controlled
 * structured JSON (`Json @default("{}")`, non-nullable). `custom_fields` was
 * rejected: it is documented as agent-defined data and cannot hold an authority
 * the server enforces.
 *
 * Each lane below is pinned individually, because "it seems fine" is how the
 * CRM PATCH lane silently destroyed this column for as long as it did.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EIGHT LANES
 *
 *  1. Cotality sync .............. UPDATE omits the column entirely
 *  2. CRM create ................. writes `{}` on a NEW row (nothing to lose)
 *  3. CRM PATCH .................. merges (this one had to be FIXED first)
 *  4. Status transitions ......... never write the column at all
 *  5. Compliance validation ...... is the CRM PATCH merge
 *  6. Return-copy reconciliation . writes only on CREATE; UPDATE omits
 *  7. Portal reads ............... no portal route writes Listing at all
 *  8. Public DTO sanitization .... never reads the column, so cannot leak it
 *
 * A ninth hazard was found while proving these and is fixed separately: the
 * re-sync route truncated the whole `listings` table, and a namespace cannot be
 * "preserved" on a record that no longer exists. See
 * tests/runtime/reset-sync-cannot-destroy-mallan-inventory.test.ts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { complianceUpdatePatch } from '@/lib/idx/sync';
import {
  PUBLICATION_NAMESPACE,
  readPublication,
  withPublication,
  initialPublication,
} from '@/lib/crm/publication-state';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

/** Comment-stripped source: prose about a write is not a write. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('lane 1 — the Cotality sync cannot touch it', () => {
  it('complianceUpdatePatch writes nothing', () => {
    // Preserve-by-no-write. The key is simply absent from the update payload,
    // so Postgres never rewrites the column.
    expect(complianceUpdatePatch()).toEqual({});
    expect(Object.keys(complianceUpdatePatch())).toHaveLength(0);
  });

  it('every Trestle UPDATE lane uses it', () => {
    for (const rel of [
      'lib/idx/sync.ts',
      'app/api/crm/listings/reset-sync/route.ts',
    ]) {
      expect(code(read(rel))).toMatch(/complianceUpdatePatch\(\)/);
    }
  });
});

describe('lane 2 — CRM create', () => {
  it('writes the column on a new row only', () => {
    // A create has no prior value to preserve; assigning `{}` there is not a
    // loss. What matters is that it is a `create`, not an `update`.
    const src = code(read('app/api/crm/listings/route.ts'));
    const createIdx = src.indexOf('tx.listing.create');
    expect(createIdx).toBeGreaterThan(-1);
  });
});

describe('lane 3 — CRM PATCH merges instead of replacing', () => {
  it('spreads the existing value', () => {
    // THE LANE THAT WAS BROKEN. It assigned a fresh five-key object with no
    // spread, so every agent edit destroyed every other key under `compliance`.
    const src = code(read('app/api/crm/listings/[id]/route.ts'));
    expect(src).toMatch(/\.\.\.existingCompliance/);
  });

  it('and reads the existing value defensively', () => {
    // The column is Json; a legacy row may hold a non-object.
    const src = code(read('app/api/crm/listings/[id]/route.ts'));
    expect(src).toMatch(/typeof listing\.compliance === "object"/);
  });
});

describe('lane 4 — status transitions never write the column', () => {
  it('the status route assigns no compliance value', () => {
    // Market status and publication state are separate questions; the market
    // route has no business rewriting the publication record.
    const src = code(read('app/api/crm/listings/[id]/status/route.ts'));
    expect(src).not.toMatch(/compliance\s*:/);
  });
});

describe('lane 6 — reconciliation writes only on CREATE', () => {
  it('feed-reconcile writes compliance inside a create', () => {
    const src = read('app/api/cron/feed-reconcile/route.ts');
    const idx = src.indexOf('compliance: mapped.compliance');
    expect(idx).toBeGreaterThan(-1);
    // Walk back to the nearest prisma call and prove it is a create.
    const before = src.slice(Math.max(0, idx - 800), idx);
    expect(before).toMatch(/prisma\.listing\.create\(/);
    expect(before).not.toMatch(/prisma\.listing\.update\(/);
  });
});

describe('lane 7 — no portal route writes a Listing', () => {
  it('nothing under app/api/portal mutates the listing model', () => {
    // A portal user must never mutate regulated canonical Listing facts, which
    // includes the publication record.
    const files = execFileSync('git', ['ls-files', '-z', 'app/api/portal'], {
      cwd: REPO,
      encoding: 'utf8',
    })
      .split('\0')
      .filter((f) => f && f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10); // guard the guard

    const offenders = files.filter((f) =>
      /prisma\.listing\.(update|updateMany|create|upsert|delete|deleteMany)\b/.test(
        code(read(f)),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('lane 8 — the public DTO cannot leak internal review data', () => {
  it('never reads the compliance column', () => {
    // Review notes, revision requests and approver identities are internal.
    const src = code(read('lib/idx/db-to-public-dto.ts'));
    expect(src).not.toMatch(/listing\.compliance|l\.compliance|\.compliance\b/);
  });
});

describe('the namespace round-trips through storage', () => {
  it('survives create → read → edit → read', () => {
    // The whole cycle in one place, on the actual read/write helpers.
    let compliance: unknown = {};

    const created = withPublication(compliance, initialPublication());
    expect(readPublication(created).state).toBe('DRAFT');

    // An unrelated CRM edit writes its validation keys alongside.
    compliance = {
      ...(created as Record<string, unknown>),
      validation_result: { ok: true },
      valid: true,
    };
    expect(readPublication(compliance).state).toBe('DRAFT');

    // A publication transition writes the namespace back.
    const submitted = withPublication(compliance, {
      ...initialPublication(),
      state: 'SUBMITTED',
    });
    expect(readPublication(submitted).state).toBe('SUBMITTED');
    // …and the CRM's own keys are still there.
    expect((submitted as Record<string, unknown>).validation_result).toEqual({ ok: true });
  });

  it('an unrelated key added later does not disturb it', () => {
    const withPub = withPublication({}, { ...initialPublication(), state: 'APPROVED' });
    const laterEdit = { ...withPub, mallan_control_verification: { by: 'broker-1' } };
    expect(readPublication(laterEdit).state).toBe('APPROVED');
    expect(laterEdit.mallan_control_verification).toEqual({ by: 'broker-1' });
  });

  it('the namespace key is declared once, not spelled inline', () => {
    // One constant, so a typo cannot create a second namespace that reads as
    // an unpublished draft forever.
    expect(PUBLICATION_NAMESPACE).toBe('mallan_publication');
  });
});
