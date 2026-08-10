/**
 * COMMIT 11 — the address-suppressed public slug must use the PUBLIC ROUTE KEY.
 *
 * Live identity truth for RLS20105333 (measured 2026-08-08):
 *
 *   Property.ListingId              RLS20105333   <- public route identity
 *   Property.ListingKey             1178013994    <- provider / media identity
 *   DB listing_id                   RLS20105333
 *   DB mls_id                       1178013994
 *   Media ResourceRecordKey         1178013994
 *
 * THE DEFECT: `generateListingSlug` fell back to `mlsId || id`. Because
 * `mapTrestleToPrisma` sets `mls_id = ListingKey`, an address-suppressed RLS
 * listing emitted `listing-1178013994` — but the detail page resolves a
 * `listing-*` suffix as a DB `listing_id`, which is `RLS20105333`. The
 * compliance fallback URL could never resolve its own row.
 *
 * These identities have different responsibilities and must never be swapped.
 */

import { generateListingSlug, extractMlsIdFromSlug, isMlsIdSlug } from '@/lib/listing-slug';

const LISTING_ID = 'RLS20105333';
const PROVIDER_KEY = '1178013994';

const SUPPRESSED = {
  address: {
    streetNumber: '519',
    streetName: 'MONROE',
    unitNumber: null,
    city: 'New York City',
    stateOrProvince: 'NY',
    postalCode: '11221',
  },
  id: LISTING_ID,
  mlsId: PROVIDER_KEY,
  internetAddressDisplayYN: false,
};

describe('address-suppressed slug uses the public route key, not the provider key', () => {
  it('emits listing-rls20105333, NOT listing-1178013994', () => {
    const slug = generateListingSlug(SUPPRESSED);
    expect(slug).toBe('listing-rls20105333');
    expect(slug).not.toBe(`listing-${PROVIDER_KEY}`);
  });

  it('round-trips through the resolver back to the DB listing_id', () => {
    const slug = generateListingSlug(SUPPRESSED);
    expect(isMlsIdSlug(slug)).toBe(true);
    // The detail page resolves this suffix as a DB `listing_id`.
    const resolved = extractMlsIdFromSlug(slug);
    expect(resolved?.toUpperCase()).toBe(LISTING_ID);
  });

  it('the provider ListingKey never appears in the canonical URL', () => {
    const slug = generateListingSlug(SUPPRESSED);
    expect(slug).not.toContain(PROVIDER_KEY);
  });

  it('leaks no street, unit, city or postal code when address display is false', () => {
    const slug = generateListingSlug(SUPPRESSED);
    expect(slug).not.toMatch(/519/);
    expect(slug).not.toMatch(/monroe/i);
    expect(slug).not.toMatch(/11221/);
    expect(slug).not.toMatch(/new-york/i);
  });

  it('falls back to the provider key ONLY when no public id exists', () => {
    const slug = generateListingSlug({ ...SUPPRESSED, id: undefined });
    expect(slug).toBe(`listing-${PROVIDER_KEY}`);
  });
});

describe('sitemap / page / API canonical parity', () => {
  it('the same inputs yield one canonical slug for every caller', () => {
    // The sitemap passes id = listing_id and mlsId = mls_id — the exact shape
    // that previously diverged from the page. One helper, one answer.
    const fromPage = generateListingSlug(SUPPRESSED);
    const fromSitemap = generateListingSlug({
      address: SUPPRESSED.address,
      id: LISTING_ID,
      mlsId: PROVIDER_KEY,
      internetAddressDisplayYN: false,
    });
    expect(fromSitemap).toBe(fromPage);
    expect(fromSitemap).toBe('listing-rls20105333');
  });

  it('address-displayable listings are unaffected by this rule', () => {
    // Guard against "fixing" the fallback by widening address exposure.
    const slug = generateListingSlug({ ...SUPPRESSED, internetAddressDisplayYN: true });
    expect(slug).not.toBe('listing-rls20105333');
    expect(slug).toContain('monroe');
  });
});
