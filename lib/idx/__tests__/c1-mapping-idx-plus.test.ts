/**
 * C1 fix (2026-05-13) — `mapCotalityToInternal` must honor IDX Plus pre-filter
 * semantics on `InternetEntireListingDisplayYN` and `InternetAddressDisplayYN`.
 *
 * Before the fix:
 *   - Writer (`lib/idx/trestle-mapper.ts:706-707`) used `!== false` →
 *     null upstream became `true` in DB columns.
 *   - Reader (`lib/idx/mapping.ts:368-372`) used `affirmPermission(...)` →
 *     null upstream became `false` on the IDXListing.
 *
 * The reader/writer disagreement is the root cause of the list/detail
 * address divergence reported on RLS20059088. Aligning the reader with the
 * writer (and with the upstream pre-filter convention REBNY/Cotality
 * documented) closes the divergence. Explicit `false` continues to block
 * — this fix is about treating MISSING flags the right way, not about
 * weakening explicit opt-outs.
 *
 * Per-row opt-out flags (AVM, ConsumerComment) remain fail-closed and are
 * not touched here.
 */

import { mapCotalityToInternal } from '../mapping';

const BASE_RAW: Record<string, unknown> = {
  ListingId: 'RLS20059088',
  ListingKey: 'RLS20059088',
  StandardStatus: 'Active',
  StreetNumber: '217',
  StreetName: 'W 57th Street',
  UnitNumber: '127/128',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10019',
  CountyOrParish: 'New York',
  PropertyType: 'Residential',
  ListPrice: 128000000,
  BedroomsTotal: 8,
  BathroomsFull: 9,
  BathroomsHalf: 1,
  ListingContractDate: '2026-04-01',
  ModificationTimestamp: '2026-05-05T16:21:52Z',
  ListAgentMlsId: '74001',
  ListAgentFullName: 'Carl Gambino',
  ListOfficeMlsId: '7222',
  ListOfficeName: 'Compass',
};

describe('mapCotalityToInternal — IDX Plus pre-filter parity (C1)', () => {
  it('treats null InternetAddressDisplayYN as displayable', () => {
    // The common case on the IDX Plus feed: REBNY/Cotality pre-filters
    // non-displayable rows out, so survivors arrive with this field null.
    const raw = {
      ...BASE_RAW,
      InternetEntireListingDisplayYN: null,
      InternetAddressDisplayYN: null,
    };
    const result = mapCotalityToInternal(raw);
    expect(result).not.toBeNull();
    expect(result!.internetAddressDisplayYN).toBe(true);
    expect(result!.internetEntireListingDisplayYN).toBe(true);
  });

  it('treats undefined InternetAddressDisplayYN as displayable', () => {
    // Same pre-filter semantics — undefined is also "REBNY said nothing".
    const raw = { ...BASE_RAW };
    // No explicit assignment leaves the keys missing.
    delete (raw as Record<string, unknown>).InternetEntireListingDisplayYN;
    delete (raw as Record<string, unknown>).InternetAddressDisplayYN;
    const result = mapCotalityToInternal(raw);
    expect(result).not.toBeNull();
    expect(result!.internetAddressDisplayYN).toBe(true);
    expect(result!.internetEntireListingDisplayYN).toBe(true);
  });

  it('treats explicit false InternetAddressDisplayYN as suppressed (per-row override)', () => {
    // The rare per-row override — REBNY pre-filters most opt-outs but some
    // rows still carry an explicit false. That MUST suppress.
    const raw = {
      ...BASE_RAW,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: false,
    };
    const result = mapCotalityToInternal(raw);
    expect(result).not.toBeNull();
    expect(result!.internetAddressDisplayYN).toBe(false);
    expect(result!.internetEntireListingDisplayYN).toBe(true);
  });

  it('treats explicit false InternetEntireListingDisplayYN as suppressed', () => {
    const raw = {
      ...BASE_RAW,
      InternetEntireListingDisplayYN: false,
      InternetAddressDisplayYN: true,
    };
    const result = mapCotalityToInternal(raw);
    expect(result).not.toBeNull();
    expect(result!.internetEntireListingDisplayYN).toBe(false);
  });

  it('treats explicit true on both flags as displayable', () => {
    const raw = {
      ...BASE_RAW,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
    };
    const result = mapCotalityToInternal(raw);
    expect(result).not.toBeNull();
    expect(result!.internetAddressDisplayYN).toBe(true);
    expect(result!.internetEntireListingDisplayYN).toBe(true);
  });

  it('legacy idxEntireListingDisplayYN mirrors InternetEntireListingDisplayYN under IDX Plus parity', () => {
    // The IDXEntireListingDisplayYN field does not exist on live Trestle
    // (verified 2026-04-19). The mapper falls back to InternetEntireListingDisplayYN.
    // C1 fix: that fallback now uses the same !== false convention.
    const raw = {
      ...BASE_RAW,
      InternetEntireListingDisplayYN: null,
    };
    const result = mapCotalityToInternal(raw);
    expect(result).not.toBeNull();
    expect(result!.idxEntireListingDisplayYN).toBe(true);
  });
});
