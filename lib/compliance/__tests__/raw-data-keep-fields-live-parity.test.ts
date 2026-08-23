import { readFileSync } from 'fs';
import { resolve } from 'path';
import { allFieldNames } from '@/lib/cotality/live-contract';
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
 * Still phantom (kept out): MoveInCostsAmountTotal, FirstShowingDate — neither is
 * on live Trestle (use MoveInCosts picklist; ActivationDate for activation).
 *
 * Restored 2026-06-04: MoveInCostsAmount + MoveInCostsComments. The live Cotality
 * $metadata exposes both as Property fields (Edm.Decimal / Edm.String); #340 had
 * removed them based on a stale snapshot. The snapshot is refreshed in the same
 * PR. Live feed wins over the cached snapshot.
 *
 * The forbidden set mirrors FORBIDDEN_FIELDS in
 * scripts/audit-server-trestle-coverage.ts — the live-audit source of truth.
 */
describe('RAW_DATA_KEEP_FIELDS live-parity (no phantom Cotality fields kept)', () => {
  const liveNames = allFieldNames();

  // Known phantoms / forbidden field names per the live server-coverage audit.
  // NOTE: MoveInCostsComments is NO LONGER here — it went live (Property field)
  // and is now kept (see below). MoveInCostsAmountTotal remains phantom.
  const FORBIDDEN_PHANTOMS = [
    'IDXEntireListingDisplayYN',
    'SyndicateYN',
    'VOWEntireListingDisplayYN',
    'VOWAutomatedValuationDisplayYN',
    'VOWConsumerCommentYN',
    'MoveInCostsAmountTotal',
    'FirstShowingDate',
    'PossessionDate',
    'YearRenovated',
    'ResourceRecordID',
  ];

  it('the Cotality contract is loaded and non-empty', () => {
    expect(liveNames.size).toBeGreaterThan(500);
  });

  it('the still-phantom fields are genuinely absent from live Trestle', () => {
    for (const f of ['MoveInCostsAmountTotal', 'FirstShowingDate']) {
      expect(liveNames.has(f)).toBe(false);
    }
  });

  it('MoveInCostsAmount + MoveInCostsComments are now live and kept', () => {
    for (const f of ['MoveInCostsAmount', 'MoveInCostsComments']) {
      expect(liveNames.has(f)).toBe(true);   // live Property fields
      expect(RAW_DATA_KEEP_SET.has(f)).toBe(true); // and retained
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
