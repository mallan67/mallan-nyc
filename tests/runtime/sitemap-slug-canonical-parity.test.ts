/// <reference types="jest" />
/**
 * SEO-001 — sitemap slug ↔ page canonical slug parity (registry SEO-001, P0).
 *
 * Full-population live audit 2026-07-01: 10,069 of 10,239 sitemap listing URLs
 * (98.3%) omitted StreetSuffix ("Street"/"Avenue") and StreetDirPrefix ("W"/"E")
 * because app/sitemap.ts passed addr.StreetName ALONE into generateListingSlug,
 * while app/listing/[...slug]/page.tsx composes DirPrefix + Name + Suffix. The
 * wrong URLs serve HTTP 200 thin soft-redirect pages, so Google was given
 * ~10,000 non-canonical URLs and never the canonical ones.
 *
 * Permanent fix: ONE shared composition helper — composeSlugStreetName() in
 * lib/listing-slug.ts — used by BOTH call sites, so the two URLs cannot
 * diverge again. These tests are the regression lock:
 *   1. behavioral: the helper composes DirPrefix + Name + Suffix
 *      (PascalCase-first, camelCase legacy fallback — same case-tolerance
 *      precedent as pickAddressParts).
 *   2. parity: sitemap-style composition produces the EXACT slug the page
 *      canonical serves live (verified live fixture: RLS20084568 →
 *      /listing/434-w-20th-street-apt-7-new-york-city-ny-10011/rls20084568).
 *   3. wiring: both app/sitemap.ts and the listing page use the helper and
 *      the sitemap no longer passes bare StreetName.
 *
 * Compliance unchanged: InternetAddressDisplayYN=false still yields the
 * anonymous listing-{id} slug (suppression path re-asserted here).
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { generateListingSlug, composeSlugStreetName } from '@/lib/listing-slug';

// Live-verified Cotality address components (RLS20084568, pulled from
// api.cotality.com 2026-07-01): StreetNumber=434, StreetDirPrefix=W,
// StreetName=20th, StreetSuffix=Street, UnitNumber=7, City=New York City.
const LIVE_ADDR = {
  StreetNumber: '434',
  StreetDirPrefix: 'W',
  StreetName: '20th',
  StreetSuffix: 'Street',
  UnitNumber: '7',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10011',
} as Record<string, string>;

// The canonical the live page serves for that listing (captured 2026-07-01).
const LIVE_CANONICAL_SLUG = '434-w-20th-street-apt-7-new-york-city-ny-10011-rls20084568';

describe('composeSlugStreetName — single source of street composition (SEO-001)', () => {
  it('composes DirPrefix + Name + Suffix (PascalCase)', () => {
    expect(composeSlugStreetName(LIVE_ADDR)).toBe('W 20th Street');
  });

  it('omits absent parts without extra spaces (no suffix / no dir)', () => {
    expect(composeSlugStreetName({ StreetName: 'Broadway' })).toBe('Broadway');
    expect(composeSlugStreetName({ StreetName: 'PARK', StreetSuffix: 'Avenue' })).toBe('PARK Avenue');
  });

  it('falls back to camelCase legacy keys (PascalCase wins when both present)', () => {
    expect(composeSlugStreetName({ streetDirPrefix: 'E', streetName: '63rd', streetSuffix: 'Street' })).toBe('E 63rd Street');
    expect(composeSlugStreetName({ StreetName: 'Carroll', streetName: 'STALE', StreetSuffix: 'Street' })).toBe('Carroll Street');
  });

  it('BLANK PascalCase falls through to populated camelCase (Codex #468: ?? kept the empty string — mixed legacy JSON would lose the street and emit partial or listing-{id} slugs)', () => {
    expect(composeSlugStreetName({ StreetName: '', streetName: 'Carroll', StreetSuffix: '', streetSuffix: 'Street' })).toBe('Carroll Street');
    expect(composeSlugStreetName({ StreetName: '   ', streetName: 'Broadway' })).toBe('Broadway');
    expect(composeSlugStreetName({ StreetDirPrefix: '', streetDirPrefix: 'W', StreetName: '20th', StreetSuffix: 'Street' })).toBe('W 20th Street');
  });

  it('empty address → empty string (caller falls through to MLS-ID slug)', () => {
    expect(composeSlugStreetName({})).toBe('');
  });
});

describe('sitemap-style slug == live page canonical (parity lock)', () => {
  it('generateListingSlug fed by composeSlugStreetName reproduces the live canonical exactly', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: LIVE_ADDR.StreetNumber,
        streetName: composeSlugStreetName(LIVE_ADDR),
        unitNumber: LIVE_ADDR.UnitNumber,
        city: LIVE_ADDR.City,
        stateOrProvince: LIVE_ADDR.StateOrProvince,
        postalCode: LIVE_ADDR.PostalCode,
      },
      id: 'RLS20084568',
      mlsId: 'RLS20084568',
      internetAddressDisplayYN: true,
    });
    expect(slug).toBe(LIVE_CANONICAL_SLUG);
  });

  it('suppressed address (InternetAddressDisplayYN=false) still yields the anonymous MLS-ID slug', () => {
    const slug = generateListingSlug({
      address: { streetNumber: '434', streetName: composeSlugStreetName(LIVE_ADDR) },
      id: 'RLS20084568',
      mlsId: 'RLS20084568',
      internetAddressDisplayYN: false,
    });
    expect(slug).toBe('listing-rls20084568');
  });
});

describe('wiring — both call sites share the helper (SUPPORTING source-grep)', () => {
  const sitemapSrc = readFileSync(path.resolve(__dirname, '../../app/sitemap.ts'), 'utf8');
  const pageSrc = readFileSync(path.resolve(__dirname, '../../app/listing/[...slug]/page.tsx'), 'utf8');

  it('app/sitemap.ts composes the street via composeSlugStreetName (not bare StreetName)', () => {
    expect(sitemapSrc).toMatch(/streetName:\s*composeSlugStreetName\(/);
    expect(sitemapSrc).not.toMatch(/streetName:\s*addr\.StreetName\s*\|\|\s*addr\.streetName\s*\|\|\s*''/);
  });

  it('listing page composes the street via composeSlugStreetName (both DTO paths)', () => {
    // CONTRACT MOVED (DTO collapse). The page previously composed the street
    // TWICE — once for its own DB-path DTO slug and once for the Trestle-direct
    // path — hence the ">= 2" count. The DB-path slug now comes from
    // dbListingToPublicDTO, so one of those uses is gone BY DESIGN.
    //
    // What this test actually guards is PARITY: sitemap, canonical DB DTO and
    // page must compose the street identically. That is now asserted across the
    // owners rather than by counting occurrences inside one file.
    const dtoSrc = readFileSync(
      path.resolve(__dirname, '../../lib/idx/db-to-public-dto.ts'),
      'utf8',
    );
    // COTALITYLVED. The earlier revision of this test recorded that the canonical
    // builder did NOT use composeSlugStreetName and that output equivalence was
    // therefore unproven. That gap is now closed: the builder consumes the
    // helper, and OUTPUT parity between the two real compositions is proven
    // directly in tests/runtime/slug-street-composition-parity.test.ts
    // (fixtures A–G, including StreetDirSuffix and legacy camelCase keys).
    //
    // The page composes NO street at all now — composeSlugStreetName lived only
    // in the deleted DB block, so its import was dead and was removed.
    expect(pageSrc).not.toMatch(/composeSlugStreetName\(/);
    expect(dtoSrc).toMatch(/composeSlugStreetName\(/); // display address still uses THE owner

    // MOVED AGAIN (2026-08-09). The DB-row SLUG composition now lives in
    // `buildListingSlugFromDbRow` (lib/listing-slug.ts) so the RLS return-copy
    // redirect reuses the identical formula instead of re-deriving it. The
    // parity guarantee is unchanged — it is asserted at the new owner, and the
    // DTO must DELEGATE rather than keep its own `generateListingSlug` call
    // (two calls would be two formulas again).
    const slugOwnerSrc = readFileSync(
      path.resolve(__dirname, '../../lib/listing-slug.ts'),
      'utf8',
    );
    expect(slugOwnerSrc).toMatch(/composeSlugStreetName\(/);
    expect(slugOwnerSrc).toMatch(/generateListingSlug\(\{/);
    expect(dtoSrc).toMatch(/buildListingSlugFromDbRow\(/);
    expect(dtoSrc).not.toMatch(/generateListingSlug\(\{/);
    expect(pageSrc).toMatch(/dbListingToPublicDTO\(dbListing[,)]/);
    // Neither owner may hand-roll the street parts again.
    expect(pageSrc).not.toMatch(/\[addr\.StreetDirPrefix,\s*addr\.StreetName,\s*addr\.StreetSuffix\]/);
  });
});
