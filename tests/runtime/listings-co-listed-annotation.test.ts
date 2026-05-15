/// <reference types="jest" />
/**
 * PR-FE.2 Option C (2026-05-15) — annotateCoListedSiblings.
 *
 * Background: when multiple distinct REBNY listings (different
 * listing_id, different listOfficeName) publish for the SAME physical
 * apartment (typical NYC luxury new-development pattern), users see
 * what looks like duplicate cards on /search?tab=buy-residential.
 * Option C surfaces a small "Also listed by …" badge so the user
 * understands the cards represent different brokers' listings of the
 * same property, not a glitch.
 *
 * `annotateCoListedSiblings(listings)` walks the array once, groups by
 * canonical address slug (the listing.slug stripped of the Option D
 * `-rlsXXX` id suffix), and stamps every member of a multi-member
 * group with `_coListedCount` (siblings, NOT including self) and
 * `_coListedBrokerages` (their listOfficeName values, deduped).
 */
import { annotateCoListedSiblings, type PublicListingDTO } from '@/lib/idx/public-dto';

function listingFixture(overrides: Partial<PublicListingDTO> = {}): PublicListingDTO {
  // Minimal valid DTO for the annotation function. Fields not relevant
  // to co-listed grouping are filled with placeholders.
  return {
    id: 'RLS00000000',
    mlsId: '0',
    slug: 'foo-bar-rls00000000',
    status: 'Active',
    listingType: 'sale',
    address: {
      streetNumber: '0',
      streetName: '',
      unitNumber: null,
      city: '',
      stateOrProvince: 'NY',
      postalCode: '',
      county: '',
    },
    listPrice: 0,
    originalListPrice: 0,
    closePrice: null,
    propertyType: '',
    propertySubType: null,
    bedroomsTotal: 0,
    bathroomsFull: 0,
    bathroomsHalf: 0,
    livingArea: null,
    lotSizeArea: null,
    yearBuilt: null,
    listOfficeName: '',
    media: [],
    listingContractDate: '2026-01-01',
    modificationTimestamp: '2026-01-01T00:00:00Z',
    auction: null,
    _source: 'db+idx',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: '',
      disclaimerRequired: true,
    },
    ...overrides,
  };
}

describe('annotateCoListedSiblings (PR-FE.2 Option C)', () => {
  it('returns _coListedCount=0 / undefined for a single-source listing (no siblings)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '400-east-90th-street-apt-17c-new-york-ny-10128-rls001', listOfficeName: 'Acme Realty' }),
    ];
    const out = annotateCoListedSiblings(input);
    expect(out).toHaveLength(1);
    expect(out[0]._coListedCount).toBeFalsy();
    expect(out[0]._coListedBrokerages).toBeUndefined();
  });

  it('annotates 3 co-listed siblings with count=2 each (siblings, not self)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'Extell Marketing' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'Corcoran' }),
      listingFixture({ id: 'RLS003', slug: '50-w-66-rls003', listOfficeName: 'Douglas Elliman' }),
    ];
    const out = annotateCoListedSiblings(input);
    expect(out).toHaveLength(3);
    for (const row of out) {
      expect(row._coListedCount).toBe(2);
      // Each row's badge should name the OTHER 2 brokerages, not itself.
      expect(row._coListedBrokerages).toBeDefined();
      expect(row._coListedBrokerages).not.toContain(row.listOfficeName);
      expect(row._coListedBrokerages!).toHaveLength(2);
    }
  });

  it('produces correct sibling brokerage lists per row', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'Extell' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'Corcoran' }),
      listingFixture({ id: 'RLS003', slug: '50-w-66-rls003', listOfficeName: 'Elliman' }),
    ];
    const out = annotateCoListedSiblings(input);
    const byId = Object.fromEntries(out.map(l => [l.id, l]));
    expect(new Set(byId.RLS001._coListedBrokerages)).toEqual(new Set(['Corcoran', 'Elliman']));
    expect(new Set(byId.RLS002._coListedBrokerages)).toEqual(new Set(['Extell', 'Elliman']));
    expect(new Set(byId.RLS003._coListedBrokerages)).toEqual(new Set(['Extell', 'Corcoran']));
  });

  it('does NOT remove or merge any rows (preserves distinct listing_id count)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'A' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'B' }),
      listingFixture({ id: 'RLS003', slug: '50-w-66-rls003', listOfficeName: 'C' }),
      listingFixture({ id: 'RLS004', slug: 'somewhere-else-rls004', listOfficeName: 'D' }),
    ];
    const out = annotateCoListedSiblings(input);
    expect(out).toHaveLength(4);
    expect(out.map(l => l.id)).toEqual(['RLS001', 'RLS002', 'RLS003', 'RLS004']);
  });

  it('leaves single-source listings unannotated when mixed with a co-listed group', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'A' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'B' }),
      listingFixture({ id: 'RLS003', slug: 'somewhere-else-rls003', listOfficeName: 'C' }),
    ];
    const out = annotateCoListedSiblings(input);
    const single = out.find(l => l.id === 'RLS003');
    expect(single?._coListedCount).toBeFalsy();
    expect(single?._coListedBrokerages).toBeUndefined();
    const colisted = out.filter(l => l.id !== 'RLS003');
    for (const row of colisted) {
      expect(row._coListedCount).toBe(1);
    }
  });

  it('skips MLS-ID fallback slugs (address-suppressed listings cannot have co-listed siblings via slug)', () => {
    // Two address-suppressed listings cannot be safely grouped — their
    // slugs are listing-rls00X with no shared address key.
    const input = [
      listingFixture({ id: 'RLS001', slug: 'listing-rls001', listOfficeName: 'A' }),
      listingFixture({ id: 'RLS002', slug: 'listing-rls002', listOfficeName: 'B' }),
    ];
    const out = annotateCoListedSiblings(input);
    for (const row of out) {
      expect(row._coListedCount).toBeFalsy();
    }
  });

  it('dedupes the "REBNY RLS" fallback office name (it is not a real brokerage)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'Acme' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'REBNY RLS' }),
    ];
    const out = annotateCoListedSiblings(input);
    const row1 = out.find(l => l.id === 'RLS001');
    expect(row1?._coListedCount).toBe(1);
    // "REBNY RLS" is the neutral fallback when the source row omits a
    // real brokerage — it would be misleading to render it as a
    // sibling brokerage name on the other row's badge.
    expect(row1?._coListedBrokerages).toEqual([]);
  });

  it('is pure (does not mutate input array or its elements)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'A' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'B' }),
    ];
    const snapshot = JSON.stringify(input);
    annotateCoListedSiblings(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

/**
 * PR-FE.2 Option C badge copy regression — Maya's 2026-05-15 decision
 * to use "Additional listing source" wording instead of "Also listed
 * by" for legal neutrality (avoids implying co-brokerage / partnership
 * between distinct REBNY listing brokerages).
 *
 * Source-level guard. If a future refactor or copy edit reverts the
 * wording back to "Also listed by" without explicit policy review,
 * this test fails and surfaces it before merge.
 */
describe('Co-listed badge copy (PR-FE.2 Option C, post-Codex copy review)', () => {
  let searchCardSrc: string;
  let featuredSrc: string;
  beforeAll(() => {
    const fs = require('fs');
    const path = require('path');
    searchCardSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/components/SearchListingCard.tsx'),
      'utf8'
    );
    featuredSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/components/FeaturedListings.tsx'),
      'utf8'
    );
  });

  it('SearchListingCard uses "Additional listing source" template (all 3 count branches)', () => {
    // 1-sibling
    expect(searchCardSrc).toMatch(/Additional listing source:\s*\$\{first\}/);
    // 2-siblings
    expect(searchCardSrc).toMatch(/Additional listing source:\s*\$\{first\}\s*\+\s*1\s*other/);
    // N-siblings
    expect(searchCardSrc).toMatch(/Additional listing source:\s*\$\{first\}\s*\+\s*\$\{count\s*-\s*1\}\s*others/);
  });

  it('SearchListingCard does NOT use the legally-ambiguous "Also listed by" wording', () => {
    // The phrase may appear in JSDoc explaining the history; the regex
    // matches the actual `formatCoListedBadge` template-literal pattern
    // (`Also listed by ${first}`), not the prose. Specifically: an
    // occurrence INSIDE a template literal with a `${first}` interpolation.
    expect(searchCardSrc).not.toMatch(/`Also listed by\s*\$\{first\}/);
  });

  it('FeaturedListings uses "Additional listing source" template', () => {
    expect(featuredSrc).toMatch(/Additional listing source:\s*\$\{listing\._coListedBrokerages\[0\]\}/);
  });

  it('FeaturedListings does NOT use the legally-ambiguous "Also listed by" wording', () => {
    expect(featuredSrc).not.toMatch(/`Also listed by\s*\$\{listing\._coListedBrokerages/);
  });

  it('Both files preserve the "Multiple listing sources" fallback for nameless siblings', () => {
    expect(searchCardSrc).toMatch(/'Multiple listing sources'/);
    expect(featuredSrc).toMatch(/'Multiple listing sources'/);
  });
});
