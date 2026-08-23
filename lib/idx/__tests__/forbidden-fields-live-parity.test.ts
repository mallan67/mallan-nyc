import { readFileSync } from 'fs';
import { resolve } from 'path';
import { allFieldNames } from '@/lib/cotality/verified-contract';
import {
  FORBIDDEN_FIELDS,
  FORBIDDEN_LIVE_ALLOWLIST,
} from '../../../scripts/trestle-forbidden-fields';

/**
 * SNAPSHOT parity guard for the FORBIDDEN_FIELDS list (the server-code phantom
 * guard that `npm run trestle:audit-server` enforces).
 *
 * Scope: this checks the list against the CAPTURED $metadata snapshot in
 * artifacts/metadata.xml — a fast, creds-free SNAPSHOT guard, NOT a live-drift
 * guard. Fresh vendor drift (Cotality adding a forbidden name to the live feed)
 * is caught by `detectForbiddenNowLive` in the audit, run daily against the live
 * feed by .github/workflows/trestle-live-audit.yml — see
 * forbidden-now-live-drift.test.ts for that logic.
 *
 * Invariant: every forbidden field must be EITHER absent from the snapshot (a
 * genuine phantom) OR a documented live-but-intentional exception
 * (ResourceRecordID — exists but is NOT unique across MLOs).
 *
 * 2026-06-04 reconciliation: MoveInCostsAmount + MoveInCostsComments were removed
 * from FORBIDDEN_FIELDS — the live $metadata exposes both as Property fields.
 *
 * FORBIDDEN_FIELDS is imported from scripts/trestle-forbidden-fields.ts (a pure,
 * side-effect-free module); the audit script itself self-executes a network IIFE
 * + process.exit on load and cannot be imported.
 */
describe('FORBIDDEN_FIELDS snapshot parity (server phantom guard)', () => {
  const forbiddenKeys = Object.keys(FORBIDDEN_FIELDS);

  const snapshotNames = allFieldNames();

  it('parsed a non-trivial FORBIDDEN_FIELDS list and a populated snapshot', () => {
    expect(forbiddenKeys.length).toBeGreaterThanOrEqual(14);
    expect(snapshotNames.size).toBeGreaterThan(500);
  });

  it('every forbidden field is phantom in the snapshot OR a documented live exception', () => {
    const liveButUndocumented = forbiddenKeys.filter(
      (f) => snapshotNames.has(f) && !FORBIDDEN_LIVE_ALLOWLIST.has(f)
    );
    expect(liveButUndocumented).toEqual([]);
  });

  it('the guarded media + social-media phantoms are present and genuinely absent from the snapshot', () => {
    for (const f of [
      'VideoURL', 'FloorPlanURL', 'MatterportURL', 'InteractiveFloorPlanURL',
      'ListingSocialMediaURL', 'BuildingSocialMediaURL',
    ]) {
      expect(forbiddenKeys).toContain(f);
      expect(snapshotNames.has(f)).toBe(false);
    }
  });

  it('MoveInCostsAmount + MoveInCostsComments are NOT forbidden and ARE live', () => {
    for (const f of ['MoveInCostsAmount', 'MoveInCostsComments']) {
      expect(forbiddenKeys).not.toContain(f);
      expect(snapshotNames.has(f)).toBe(true);
    }
    // MoveInCostsAmountTotal stays forbidden + phantom.
    expect(forbiddenKeys).toContain('MoveInCostsAmountTotal');
    expect(snapshotNames.has('MoveInCostsAmountTotal')).toBe(false);
  });

  it('ResourceRecordID is the lone live-but-forbidden field and its hint documents why', () => {
    expect(snapshotNames.has('ResourceRecordID')).toBe(true);
    expect(forbiddenKeys).toContain('ResourceRecordID');
    expect(FORBIDDEN_LIVE_ALLOWLIST.has('ResourceRecordID')).toBe(true);
    const hint = FORBIDDEN_FIELDS['ResourceRecordID'];
    expect(hint).toMatch(/not unique across MLOs/i);
    expect(hint).toMatch(/ResourceRecordKey/);
  });
});
