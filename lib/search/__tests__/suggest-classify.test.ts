/// <reference types="jest" />
/**
 * PR-S.1 — Suggest API correctness regression tests.
 *
 * Locks in the three classifier fixes:
 *   1. "425" is NOT a listing ID (was: bug — 3+ digit pure numerics matched).
 *   2. "10001" IS a ZIP; "425" / "4259" are NOT (was: bug — 3–5 digit range).
 *   3. InternetAddressDisplayYN=null is displayable (was: bug — fail-closed
 *      affirmPermission stripped all REBNY-IDX-Plus suggestions per the
 *      2026-04-30 incident).
 */

import {
  classifySuggestQuery,
  isAddressDisplayablePerSuggest,
} from '@/lib/search/suggest-classify';

describe('classifySuggestQuery', () => {
  // ─── Listing-ID detection ──────────────────────────────────────────────

  it('classifies a real RLS-prefixed listing ID as a listing ID', () => {
    expect(classifySuggestQuery('RLS20059088')).toEqual({
      isListingId: true,
      isZip: false,
      isPureNumeric: false,
    });
  });

  it('classifies lowercase rls prefix as a listing ID (case-insensitive)', () => {
    expect(classifySuggestQuery('rls20059088').isListingId).toBe(true);
  });

  it('classifies an alphanumeric Web # as a listing ID', () => {
    expect(classifySuggestQuery('WEB12345').isListingId).toBe(true);
    expect(classifySuggestQuery('XYZ987').isListingId).toBe(true);
  });

  it('does NOT classify "425" as a listing ID (the documented R-425 bug)', () => {
    const c = classifySuggestQuery('425');
    expect(c.isListingId).toBe(false);
  });

  it('does NOT classify other 3-digit pure numerics as listing IDs', () => {
    expect(classifySuggestQuery('100').isListingId).toBe(false);
    expect(classifySuggestQuery('999').isListingId).toBe(false);
  });

  it('does NOT classify too-short ID-shaped strings as listing IDs', () => {
    // "RLS" alone or with very few digits: not a listing ID.
    expect(classifySuggestQuery('RLS').isListingId).toBe(false);
    expect(classifySuggestQuery('RLS1').isListingId).toBe(false);
    expect(classifySuggestQuery('RLS12').isListingId).toBe(false);
    // The minimum length the route will treat as a listing ID is the
    // alphanumeric regex `^[A-Z]{2,}\d{3,}$` — 2+ letters + 3+ digits.
    // "RLS123" matches (3 letters + 3 digits). "RLS1234" matches the
    // RLS-prefix alternative too. Both produce 0 Trestle hits if the
    // actual ID doesn't exist, which is the correct fail-soft behavior.
    expect(classifySuggestQuery('RLS123').isListingId).toBe(true);
    expect(classifySuggestQuery('RLS1234').isListingId).toBe(true);
  });

  // ─── ZIP detection ─────────────────────────────────────────────────────

  it('classifies "10001" as a ZIP (exact 5 digits)', () => {
    expect(classifySuggestQuery('10001')).toEqual({
      isListingId: false,
      isZip: true,
      isPureNumeric: false,
    });
  });

  it('preserves ZIP behavior across other valid 5-digit NYC ZIPs', () => {
    expect(classifySuggestQuery('11201').isZip).toBe(true); // Brooklyn Heights
    expect(classifySuggestQuery('11697').isZip).toBe(true); // Breezy Point
  });

  it('does NOT classify "425" or "4259" as a ZIP (was the R-425 over-match bug)', () => {
    expect(classifySuggestQuery('425').isZip).toBe(false);
    expect(classifySuggestQuery('4259').isZip).toBe(false);
  });

  it('does NOT classify 6+ digit numerics as a ZIP', () => {
    expect(classifySuggestQuery('100012').isZip).toBe(false);
    expect(classifySuggestQuery('12345678').isZip).toBe(false);
  });

  // ─── Pure-numeric pass-through ─────────────────────────────────────────

  it('classifies "425" as pureNumeric (eligible for street-number search)', () => {
    expect(classifySuggestQuery('425')).toEqual({
      isListingId: false,
      isZip: false,
      isPureNumeric: true,
    });
  });

  it('classifies "4259" as pureNumeric (4-digit street number)', () => {
    expect(classifySuggestQuery('4259').isPureNumeric).toBe(true);
  });

  it('classifies "1" as pureNumeric (single-digit street number)', () => {
    expect(classifySuggestQuery('1').isPureNumeric).toBe(true);
  });

  it('does NOT set pureNumeric for 5-digit ZIPs (they take the ZIP branch)', () => {
    expect(classifySuggestQuery('10001').isPureNumeric).toBe(false);
  });

  it('does NOT set pureNumeric for queries with non-digit characters', () => {
    expect(classifySuggestQuery('425 park').isPureNumeric).toBe(false);
    expect(classifySuggestQuery('Carnegie').isPureNumeric).toBe(false);
    expect(classifySuggestQuery('425a').isPureNumeric).toBe(false);
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  it('handles whitespace-padded input correctly', () => {
    expect(classifySuggestQuery('  RLS20059088  ').isListingId).toBe(true);
    expect(classifySuggestQuery(' 10001 ').isZip).toBe(true);
    expect(classifySuggestQuery('  425  ').isPureNumeric).toBe(true);
  });

  it('handles empty / null-ish input without throwing', () => {
    expect(classifySuggestQuery('')).toEqual({
      isListingId: false,
      isZip: false,
      isPureNumeric: false,
    });
    expect(classifySuggestQuery('   ')).toEqual({
      isListingId: false,
      isZip: false,
      isPureNumeric: false,
    });
  });

  it('text queries set all three flags to false', () => {
    expect(classifySuggestQuery('Carnegie')).toEqual({
      isListingId: false,
      isZip: false,
      isPureNumeric: false,
    });
    expect(classifySuggestQuery('Park Avenue')).toEqual({
      isListingId: false,
      isZip: false,
      isPureNumeric: false,
    });
    expect(classifySuggestQuery('Upper East Side')).toEqual({
      isListingId: false,
      isZip: false,
      isPureNumeric: false,
    });
  });
});

describe('isAddressDisplayablePerSuggest (the 2026-04-30 IDX-Plus fix)', () => {
  it('returns TRUE for null (REBNY pre-filter passed — vast majority of records)', () => {
    expect(isAddressDisplayablePerSuggest(null)).toBe(true);
  });

  it('returns TRUE for undefined (missing field — treated same as null)', () => {
    expect(isAddressDisplayablePerSuggest(undefined)).toBe(true);
  });

  it('returns TRUE for explicit true', () => {
    expect(isAddressDisplayablePerSuggest(true)).toBe(true);
  });

  it('returns FALSE only for explicit false (the suppression case)', () => {
    expect(isAddressDisplayablePerSuggest(false)).toBe(false);
  });

  it('returns TRUE for unexpected truthy values (defensive — gate is on explicit false)', () => {
    expect(isAddressDisplayablePerSuggest('false')).toBe(true);  // string, not boolean false
    expect(isAddressDisplayablePerSuggest(0)).toBe(true);         // numeric — explicitly NOT the suppression sentinel
    expect(isAddressDisplayablePerSuggest('')).toBe(true);
  });

  // Anchors the policy difference from the OLD affirmPermission behavior:
  //
  //   affirmPermission(null)      → false  (would suppress)
  //   affirmPermission(true)      → true
  //   affirmPermission(false)     → false
  //
  // After fix:
  //
  //   isAddressDisplayablePerSuggest(null)  → true  (REBNY pre-filter passed)
  //   isAddressDisplayablePerSuggest(true)  → true
  //   isAddressDisplayablePerSuggest(false) → false
  it('matches the trestle-mapper writer policy at lib/idx/trestle-mapper.ts:834', () => {
    // Writer: const internetAddress = raw.InternetAddressDisplayYN !== false;
    // This function: same semantics.
    const samples = [null, undefined, true, false];
    const writerEquivalent = (v: unknown) => v !== false;
    for (const v of samples) {
      expect(isAddressDisplayablePerSuggest(v)).toBe(writerEquivalent(v));
    }
  });
});
