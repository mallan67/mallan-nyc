/**
 * ONE STREET-COMPOSITION OWNER — output parity, not source-greps.
 *
 * `composeSlugStreetName` exists precisely so the sitemap and the canonical DB
 * DTO cannot produce different canonical URLs for the same listing. But the DTO
 * had grown a SECOND composition:
 *
 *   helper : StreetDirPrefix + StreetName + StreetSuffix
 *            (PascalCase -> camelCase fallback)
 *   DTO    : StreetName + StreetSuffix + StreetDirSuffix, PascalCase ONLY,
 *            with StreetDirPrefix passed separately to generateListingSlug
 *
 * Neither was a superset of the other: the helper dropped StreetDirSuffix, the
 * DTO dropped the camelCase fallback. So they diverged in BOTH directions.
 *
 * These tests compare ACTUAL OUTPUT from the two real call paths. A source-grep
 * cannot catch a divergence like this — both files would have "passed" while
 * emitting different URLs.
 */

import { generateListingSlug, composeSlugStreetName } from '@/lib/listing-slug';
import { dbListingToPublicDTO } from '@/lib/idx/db-to-public-dto';

const LISTING_ID = 'RLS20105333';

/** The sitemap's real call shape (app/sitemap.ts). */
function sitemapSlug(addr: Record<string, unknown>, opts: { suppressed?: boolean } = {}) {
  return generateListingSlug({
    address: {
      streetNumber: String(addr.StreetNumber ?? addr.streetNumber ?? ''),
      streetName: composeSlugStreetName(addr),
      unitNumber: (addr.UnitNumber ?? addr.unitNumber ?? null) as string | null,
      city: String(addr.City ?? addr.city ?? ''),
      stateOrProvince: 'NY',
      postalCode: String(addr.PostalCode ?? addr.postalCode ?? ''),
    },
    id: LISTING_ID,
    mlsId: LISTING_ID,
    internetAddressDisplayYN: !opts.suppressed,
  });
}

/** The canonical DB DTO's real output for the same address. */
function dtoSlug(addr: Record<string, unknown>, opts: { suppressed?: boolean } = {}) {
  return dbListingToPublicDTO({
    id: 1n,
    listing_id: LISTING_ID,
    mls_id: '1178013994',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'MultiFamily',
    list_price: '2295000',
    bedrooms_total: null,
    bathrooms_full: null,
    bathrooms_half: null,
    living_area: null,
    borough: null,
    neighborhood: null,
    address: addr,
    features: {},
    media: [],
    raw_data: {},
    created_at: new Date('2026-07-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-07T00:00:00.000Z'),
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: !opts.suppressed,
    rls_eligible: true,
  } as never).slug;
}

describe('sitemap and canonical DTO produce the SAME slug', () => {
  it('A. StreetDirPrefix + StreetName + StreetSuffix', () => {
    const addr = { StreetNumber: '12', StreetDirPrefix: 'W', StreetName: '20th', StreetSuffix: 'Street', City: 'New York', PostalCode: '10011' };
    expect(dtoSlug(addr)).toBe(sitemapSlug(addr));
    expect(dtoSlug(addr)).toContain('w-20th-street');
  });

  it('B. StreetDirSuffix is included, exactly ONCE, by both', () => {
    // The divergence that source-greps missed: the helper omitted DirSuffix.
    const addr = { StreetNumber: '5', StreetDirPrefix: 'N', StreetName: 'Main', StreetSuffix: 'Street', StreetDirSuffix: 'NW', City: 'New York', PostalCode: '10011' };
    const a = dtoSlug(addr);
    expect(a).toBe(sitemapSlug(addr));
    expect(a).toContain('nw');
    expect((a.match(/-nw/g) || []).length).toBe(1);
    // ...and the prefix is not doubled by passing it twice.
    expect((a.match(/(^|-)n-/g) || []).length).toBe(1);
  });

  it('C. PascalCase address keys', () => {
    const addr = { StreetNumber: '400', StreetName: 'East 90th', StreetSuffix: 'Street', City: 'New York', PostalCode: '10128' };
    expect(dtoSlug(addr)).toBe(sitemapSlug(addr));
  });

  it('D. legacy camelCase address keys', () => {
    const addr = { streetNumber: '400', streetName: 'East 90th', streetSuffix: 'Street', city: 'New York', postalCode: '10128' };
    expect(dtoSlug(addr)).toBe(sitemapSlug(addr));
  });

  it('E. blank PascalCase key falls through to the camelCase value — in BOTH', () => {
    // The other half of the divergence: the DTO route was PascalCase-only, so a
    // trimmed-blank PascalCase key silently dropped the street on one path.
    const addr = { StreetNumber: '400', StreetName: '   ', streetName: 'East 90th', StreetSuffix: '', streetSuffix: 'Street', City: 'New York', PostalCode: '10128' };
    const a = dtoSlug(addr);
    expect(a).toBe(sitemapSlug(addr));
    expect(a).toContain('east-90th-street');
  });

  it('F. address suppressed — public-id slug, ZERO address components leak', () => {
    const addr = { StreetNumber: '519', StreetDirPrefix: 'W', StreetName: 'MONROE', StreetSuffix: 'Street', City: 'Brooklyn', PostalCode: '11221' };
    const a = dtoSlug(addr, { suppressed: true });
    expect(a).toBe(sitemapSlug(addr, { suppressed: true }));
    expect(a).toBe('listing-rls20105333');
    for (const leak of ['519', 'monroe', '11221', 'brooklyn', 'w-']) {
      expect(a.toLowerCase()).not.toContain(leak);
    }
  });

  it('G. RLS20105333 live-shaped address yields one identical path', () => {
    const addr = { StreetNumber: '519', StreetName: 'MONROE', StreetSuffix: 'Street', City: 'New York City', StateOrProvince: 'NY', PostalCode: '11221' };
    const a = dtoSlug(addr);
    expect(a).toBe(sitemapSlug(addr));
    expect(a).toContain('rls20105333');
    // The provider key must never appear in a canonical URL.
    expect(a).not.toContain('1178013994');
  });
});

describe('the helper is the ONE composition', () => {
  it('composes all four canonical street components', () => {
    expect(
      composeSlugStreetName({ StreetDirPrefix: 'N', StreetName: 'Main', StreetSuffix: 'Street', StreetDirSuffix: 'NW' }),
    ).toBe('N Main Street NW');
  });

  it('keeps the case-tolerant fallback while adding DirSuffix', () => {
    expect(
      composeSlugStreetName({ StreetName: '  ', streetName: 'Main', streetSuffix: 'Street', streetDirSuffix: 'SE' }),
    ).toBe('Main Street SE');
  });
});
