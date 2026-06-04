import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  RAW_DATA_KEEP_FIELDS,
  RAW_DATA_KEEP_SET,
} from '@/lib/compliance/raw-data-keep-fields';

/**
 * Live-parity guard for the raw_data keep-field set.
 *
 * The keep-list must never retain a field that does NOT exist on the live
 * Cotality/Trestle feed. Keeping a phantom is harmless for storage (the feed
 * never returns it) but it is a stale-truth landmine: future readers assume the
 * field is real, and `trestle:audit-server` flags it. The single source of field
 * truth is the live `$metadata` (captured in artifacts/metadata.xml); static
 * snapshots/docs are not authoritative.
 *
 * Phantoms removed 2026-06-04 (PR-live-2): MoveInCostsAmountTotal,
 * MoveInCostsComments, FirstShowingDate. None exists on live Trestle; the real
 * fields are MoveInCosts (picklist) + CustomProperty.AdditionalFee* (B30) for
 * FARE Act fees, and ActivationDate for the activation timestamp.
 *
 * The forbidden set mirrors FORBIDDEN_FIELDS in
 * scripts/audit-server-trestle-coverage.ts — the live-audit source of truth.
 */
describe('RAW_DATA_KEEP_FIELDS live-parity (no phantom Cotality fields kept)', () => {
  const xml = readFileSync(
    resolve(__dirname, '../../../artifacts/metadata.xml'),
    'utf-8'
  );
  const liveNames = new Set(
    [...xml.matchAll(/Name="([A-Za-z0-9_]+)"/g)].map((m) => m[1])
  );

  // Known phantoms / forbidden field names per the live server-coverage audit.
  const FORBIDDEN_PHANTOMS = [
    'IDXEntireListingDisplayYN',
    'SyndicateYN',
    'VOWEntireListingDisplayYN',
    'VOWAutomatedValuationDisplayYN',
    'VOWConsumerCommentYN',
    'MoveInCostsAmountTotal',
    'MoveInCostsComments',
    'FirstShowingDate',
    'PossessionDate',
    'YearRenovated',
    'ResourceRecordID',
  ];

  it('artifacts/metadata.xml parsed and non-empty', () => {
    expect(liveNames.size).toBeGreaterThan(500);
  });

  it('the three removed fields are genuinely phantom on live Trestle', () => {
    for (const f of ['MoveInCostsAmountTotal', 'MoveInCostsComments', 'FirstShowingDate']) {
      expect(liveNames.has(f)).toBe(false);
    }
  });

  it('keep-list retains NO forbidden/phantom field', () => {
    const kept = FORBIDDEN_PHANTOMS.filter((f) => RAW_DATA_KEEP_SET.has(f));
    expect(kept).toEqual([]);
  });

  it('ActivationDate (the live activation field) is kept and exists live', () => {
    expect(RAW_DATA_KEEP_SET.has('ActivationDate')).toBe(true);
    expect(liveNames.has('ActivationDate')).toBe(true);
  });

  it('every kept field name is unique (no accidental duplicate)', () => {
    expect(RAW_DATA_KEEP_FIELDS.length).toBe(new Set(RAW_DATA_KEEP_FIELDS).size);
  });
});
