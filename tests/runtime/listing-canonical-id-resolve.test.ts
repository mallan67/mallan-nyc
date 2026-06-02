/// <reference types="jest" />
/**
 * Branch A — sitewide P0 hotfix (2026-06-02).
 *
 * The canonical listing URL is `/listing/{address-slug}/{listing-id-LOWERCASED}`.
 * `resolveLookupKey` turns the catch-all segments back into a single lookup key
 * that the detail route + /api/listings/[id] feed to Trestle (`ListingId eq …`,
 * case-SENSITIVE) and Prisma (findUnique, case-sensitive). REBNY/CRM ids are
 * stored UPPERCASE (RLS20059088, RBNY12345678, SL-0004), so a lowercased
 * trailing segment must be normalized back to uppercase before lookup or every
 * pure-IDX detail page 404s ("Listing Not Found"). See the 2026-06-02 audit.
 *
 * Guardrails proved here:
 *   1. /listing/{address}/rls20059088  → resolves as RLS20059088
 *   2. lowercase id is normalized to the stored uppercase before any lookup
 *   3. single-segment legacy hybrid (…-rls20059088) is left intact
 *   4. DB-backed SL-/RL- exclusives still resolve (and are uppercased)
 *   5. UCBA-suppressed `listing-xxx` paths are NOT altered
 */

import { normalizeListingIdCase, resolveLookupKey } from '@/lib/listing-canonical-url';

describe('normalizeListingIdCase — restore stored uppercase for case-sensitive lookups', () => {
  it('uppercases a lowercased RLS listing id (the canonical 2nd segment)', () => {
    expect(normalizeListingIdCase('rls20059088')).toBe('RLS20059088');
  });

  it('is idempotent on already-uppercase ids', () => {
    expect(normalizeListingIdCase('RLS20059088')).toBe('RLS20059088');
  });

  it('uppercases hyphenated CRM exclusive ids (SL-/RL-)', () => {
    expect(normalizeListingIdCase('sl-0004')).toBe('SL-0004');
    expect(normalizeListingIdCase('rl-0099')).toBe('RL-0099');
  });

  it('uppercases RBNY ids in both hyphenated and bare forms', () => {
    expect(normalizeListingIdCase('rbny-12345678')).toBe('RBNY-12345678');
    expect(normalizeListingIdCase('rbny12345678')).toBe('RBNY12345678');
  });

  it('LEAVES an address slug untouched (never uppercases an address)', () => {
    const addr = '217-w-57th-street-apt-127-128-new-york-city-ny-10019';
    expect(normalizeListingIdCase(addr)).toBe(addr);
  });

  it('LEAVES a UCBA-suppressed `listing-xxx` slug untouched', () => {
    expect(normalizeListingIdCase('listing-rls20061539')).toBe('listing-rls20061539');
  });

  it('LEAVES a numeric Trestle ListingKey (mlsId) untouched', () => {
    expect(normalizeListingIdCase('1146011469')).toBe('1146011469');
  });
});

describe('resolveLookupKey — catch-all segments → case-correct lookup key', () => {
  // Guardrail 1 + 2: the canonical two-segment IDX URL resolves as the stored id.
  it('canonical /listing/{address}/rls20059088 → RLS20059088', () => {
    expect(
      resolveLookupKey(['217-w-57th-street-apt-127-128-new-york-city-ny-10019', 'rls20059088']),
    ).toBe('RLS20059088');
  });

  // Guardrail 4: DB-backed Mallan exclusive (SL-/RL-) still resolves, uppercased.
  it('canonical /listing/{address}/sl-0004 → SL-0004', () => {
    expect(resolveLookupKey(['333-east-46th-street-2g', 'sl-0004'])).toBe('SL-0004');
  });

  // Guardrail 3: single-segment legacy hybrid is NOT mangled — the embedded-id
  // extractor (downstream) handles the case round-trip for this shape.
  it('single-segment legacy hybrid is left intact', () => {
    const hybrid = '217-w-57th-street-apt-127-128-new-york-city-ny-10019-rls20059088';
    expect(resolveLookupKey([hybrid])).toBe(hybrid);
  });

  // Guardrail 5: UCBA-suppressed id-only path is left intact for isMlsIdSlug().
  it('single-segment UCBA-suppressed `listing-xxx` is left intact', () => {
    expect(resolveLookupKey(['listing-rls20061539'])).toBe('listing-rls20061539');
  });

  // A bare raw-id URL (single segment) still benefits from normalization.
  it('single-segment raw id is normalized to uppercase', () => {
    expect(resolveLookupKey(['rls20059088'])).toBe('RLS20059088');
  });

  it('legacy address-only slug (no id) is left intact', () => {
    const addrOnly = '400-east-90th-street-apt-17c-new-york-ny-10128';
    expect(resolveLookupKey([addrOnly])).toBe(addrOnly);
  });

  it('handles string and empty inputs defensively', () => {
    expect(resolveLookupKey('rls20059088')).toBe('RLS20059088');
    expect(resolveLookupKey([])).toBe('');
    expect(resolveLookupKey(undefined)).toBe('');
  });
});
