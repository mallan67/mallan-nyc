/// <reference types="jest" />
/**
 * PR-S.1d (2026-05-15) — pin `SUGGEST_SELECT_FIELDS` gate-field coverage.
 *
 * Background: PR #127 added a minimal `$select` to the suggest endpoint
 * (`SUGGEST_SELECT_FIELDS`, 17 fields vs 902 default). Codex review on PR
 * #127 caught that the field list was missing `CloseDate`, which is
 * required by `lib/compliance/gates.ts` `isClosedPast24Hours` and
 * `isClosedWithin24Hours` to evaluate the §2.05 24-hour terminal-status
 * grace window. Without `CloseDate` in the select, Trestle returns the
 * field as `undefined`, the gate logic treats the row as "not closed at
 * all," and recently-closed listing-id suggestions are mis-classified.
 *
 * These tests pin the contract so a future trim of `SUGGEST_SELECT_FIELDS`
 * cannot silently drop a gate-input field.
 *
 * If `lib/compliance/gates.ts` ever adds a new raw field to its
 * `readFirst(...)` calls, the corresponding test below should be added
 * here in the same PR.
 */

import { SUGGEST_SELECT_FIELDS } from '@/app/api/listings/suggest/route';

describe('SUGGEST_SELECT_FIELDS · gate-input field coverage (PR-S.1d)', () => {
  // Every raw Trestle field name accessed by `evaluateDisplayGate` and its
  // helpers in `lib/compliance/gates.ts`. Keep in sync with the gate file.
  const GATE_REQUIRED_FIELDS = [
    'Permission',
    'StandardStatus',
    'MlsStatus',
    'InternetEntireListingDisplayYN',
    'InternetAddressDisplayYN',
    'CloseDate',
  ] as const;

  it.each(GATE_REQUIRED_FIELDS)('includes %s (required by evaluateDisplayGate)', (field) => {
    expect(SUGGEST_SELECT_FIELDS).toContain(field);
  });

  it('regression: includes CloseDate (Codex review on PR #127)', () => {
    // The single field this PR was authored to add. Calling it out
    // explicitly so a future PR that accidentally drops it triggers a
    // descriptive failure even if `GATE_REQUIRED_FIELDS` is also reduced.
    expect(SUGGEST_SELECT_FIELDS).toContain('CloseDate');
  });

  it('includes the listing identifier fields used in display', () => {
    expect(SUGGEST_SELECT_FIELDS).toContain('ListingId');
    expect(SUGGEST_SELECT_FIELDS).toContain('ListingKey');
  });

  it('includes the address components needed to build a suggestion label', () => {
    // Used in the suggest route's `fullAddress` construction in §3 + §4.
    for (const field of [
      'StreetNumber',
      'StreetDirPrefix',
      'StreetName',
      'StreetSuffix',
      'StreetDirSuffix',
      'PostalCode',
      'CountyOrParish',
      'CityRegion',
    ]) {
      expect(SUGGEST_SELECT_FIELDS).toContain(field);
    }
  });

  it('still stays minimal — fewer than 25 fields total', () => {
    // The whole point of this select is to avoid the 902-field default.
    // If the list ever grows past 25 we have probably drifted away from
    // the "gate inputs + identifiers + label" charter — review the cause.
    expect(SUGGEST_SELECT_FIELDS.length).toBeLessThan(25);
  });

  it('contains no duplicate field names', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const field of SUGGEST_SELECT_FIELDS) {
      if (seen.has(field)) dupes.push(field);
      seen.add(field);
    }
    expect(dupes).toEqual([]);
  });
});
