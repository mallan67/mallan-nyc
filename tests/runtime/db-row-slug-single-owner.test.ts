/**
 * ONE OWNER for the DB-row canonical slug.
 *
 * The RLS return-copy redirect must land on EXACTLY the URL the public DTO and
 * the sitemap emit for the local twin. Before this extraction the slug was
 * derived inline inside `dbListingToPublicDTO`, so the redirect would have had
 * to re-derive it — a second formula, and a fresh way for the canonical URL and
 * the redirect target to drift apart. That is the same class of bug the
 * `composeSlugStreetName` extraction (SEO-001) was created to end.
 */

import { buildListingSlugFromDbRow } from '@/lib/listing-slug';

const baseRow = (over: Record<string, unknown> = {}) => ({
  listing_id: 'SL-0004',
  rls_eligible: false,
  borough: 'Manhattan',
  address: {
    StreetNumber: '333',
    StreetDirPrefix: 'E',
    StreetName: '46th',
    StreetSuffix: 'Street',
    UnitNumber: '2G',
    City: 'New York',
    PostalCode: '10017',
  },
  ...over,
});

describe('address-based slug', () => {
  it('includes street, unit and ZIP', () => {
    const slug = buildListingSlugFromDbRow(baseRow());
    expect(slug).toContain('333');
    expect(slug).toContain('46th');
    expect(slug).toContain('10017');
    expect(slug).not.toMatch(/^listing-/);
  });

  it('reads camelCase address JSON too', () => {
    // Legacy/mixed rows store camelCase; a PascalCase-only read silently dropped
    // the street number and ZIP, so the DTO and the sitemap emitted different
    // URLs for the same listing.
    const slug = buildListingSlugFromDbRow(
      baseRow({
        address: {
          streetNumber: '333',
          StreetName: '46th',
          StreetSuffix: 'Street',
          unitNumber: '2G',
          city: 'New York',
          postalCode: '10017',
        },
      }),
    );
    expect(slug).toContain('333');
    expect(slug).toContain('10017');
  });
});

describe('address suppression is preserved', () => {
  it('an RLS-backed opt-out row gets the non-address fallback', () => {
    const slug = buildListingSlugFromDbRow(
      baseRow({
        listing_id: 'RLS20093870',
        rls_eligible: true,
        internet_address_display_yn: false,
        internet_entire_listing_display_yn: true,
        idx_display_yn: true,
        status: 'Active',
      }),
    );
    expect(slug).toMatch(/^listing-/);
    expect(slug).not.toContain('46th');
  });

  it('a website-only row (outside RLS) may use its address', () => {
    // `rls_eligible === false` is genuinely outside RLS, so the IDX address gate
    // does not apply. A PREFIX alone must never grant this — that bypass
    // published opt-out addresses and was reverted.
    const slug = buildListingSlugFromDbRow(
      baseRow({ rls_eligible: false, internet_address_display_yn: false }),
    );
    expect(slug).toContain('46th');
  });

  it('an RLS-eligible SL- row still honours the opt-out', () => {
    const slug = buildListingSlugFromDbRow(
      baseRow({
        listing_id: 'SL-0099',
        rls_eligible: true,
        internet_address_display_yn: false,
        internet_entire_listing_display_yn: true,
        idx_display_yn: true,
        status: 'Active',
      }),
    );
    expect(slug).toMatch(/^listing-/);
  });
});

describe('the DTO consumes the same owner', () => {
  it('db-to-public-dto does not re-derive the slug locally', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/idx/db-to-public-dto.ts'),
      'utf8',
    ) as string;
    // A second `generateListingSlug({...})` call here would mean two formulas.
    expect(src).toMatch(/buildListingSlugFromDbRow\(/);
    expect(src).not.toMatch(/generateListingSlug\(\{/);
  });
});
