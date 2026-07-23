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
    url: '/listing/foo-bar/rls00000000',
    status: 'Active',
    listingType: 'sale',
    ownershipLabel: 'Condo',
    transactionLabel: 'For Sale',
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

describe('annotateCoListedSiblings (PR-FE.2 Option C + PR-A Mallan-only gating)', () => {
  // A Mallan exclusive sibling makes a group "Mallan-relevant" (SL-/RL- id or
  // _source='exclusive'); only then does the badge render. See PR-A.
  function mallanExclusive(overrides: Partial<PublicListingDTO> = {}): PublicListingDTO {
    return listingFixture({
      id: 'SL-1001',
      slug: '50-w-66-sl-1001',
      listOfficeName: 'Mallan Real Estate Inc.',
      _source: 'exclusive',
      ...overrides,
    });
  }

  it('returns _coListedCount=0 / undefined for a single-source listing (no siblings)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '400-east-90th-street-apt-17c-new-york-ny-10128-rls001', listOfficeName: 'Acme Realty' }),
    ];
    const out = annotateCoListedSiblings(input);
    expect(out).toHaveLength(1);
    expect(out[0]._coListedCount).toBeFalsy();
    expect(out[0]._coListedBrokerages).toBeUndefined();
  });

  // PR-A core: a pure third-party-vs-third-party same-unit group must NOT be
  // annotated, so the yellow "Additional listing source" banner does not show
  // on ordinary non-Mallan RLS listings (e.g. Compass + Corcoran of the same unit).
  it('PR-A: third-party-only same-unit group is NOT annotated (no badge)', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'Compass' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'Corcoran' }),
      listingFixture({ id: 'RLS003', slug: '50-w-66-rls003', listOfficeName: 'Douglas Elliman' }),
    ];
    const out = annotateCoListedSiblings(input);
    expect(out).toHaveLength(3);
    for (const row of out) {
      expect(row._coListedCount).toBeFalsy();
      expect(row._coListedBrokerages).toBeUndefined();
    }
  });

  // PR-A: a Mallan exclusive (SL-/RL- id) in the same-unit group makes it
  // Mallan-relevant → every member is annotated (self OR sibling is Mallan).
  it('PR-A: Mallan exclusive (SL- id) + third-party siblings → group IS annotated', () => {
    const input = [
      mallanExclusive({ id: 'SL-1001', slug: '50-w-66-sl-1001', listOfficeName: 'Mallan Real Estate Inc.' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'Corcoran' }),
      listingFixture({ id: 'RLS003', slug: '50-w-66-rls003', listOfficeName: 'Douglas Elliman' }),
    ];
    const out = annotateCoListedSiblings(input);
    for (const row of out) {
      expect(row._coListedCount).toBe(2);
      expect(row._coListedBrokerages).toBeDefined();
      expect(row._coListedBrokerages).not.toContain(row.listOfficeName);
    }
    // The Mallan card names the third-party siblings; a third-party card names
    // Mallan + the other third-party.
    const byId = Object.fromEntries(out.map(l => [l.id, l]));
    expect(new Set(byId['SL-1001']._coListedBrokerages)).toEqual(new Set(['Corcoran', 'Douglas Elliman']));
    expect(new Set(byId.RLS002._coListedBrokerages)).toEqual(new Set(['Mallan Real Estate Inc.', 'Douglas Elliman']));
  });

  // PR-A: the _source='exclusive' signal also makes a group Mallan-relevant,
  // even when the id is not an SL-/RL- slug.
  it('PR-A: _source="exclusive" sibling → group IS annotated', () => {
    const input = [
      listingFixture({ id: 'RLS001', slug: '50-w-66-rls001', listOfficeName: 'Mallan Real Estate Inc.', _source: 'exclusive' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'Corcoran' }),
    ];
    const out = annotateCoListedSiblings(input);
    for (const row of out) expect(row._coListedCount).toBe(1);
  });

  // PR-A: a third-party RL... id (e.g. RLS-prefixed) must NOT be mistaken for a
  // Mallan rental exclusive (RL- with hyphen). A third-party-only group stays
  // unannotated even when ids start with "RLS".
  it('PR-A: third-party "RLS…" ids do not match the RL- Mallan prefix', () => {
    const input = [
      listingFixture({ id: 'RLS101', slug: '50-w-66-rls101', listOfficeName: 'Compass' }),
      listingFixture({ id: 'RLS102', slug: '50-w-66-rls102', listOfficeName: 'Corcoran' }),
    ];
    const out = annotateCoListedSiblings(input);
    for (const row of out) expect(row._coListedCount).toBeFalsy();
  });

  it('does NOT remove or merge any rows (preserves distinct listing_id count)', () => {
    const input = [
      mallanExclusive({ id: 'SL-1001', slug: '50-w-66-sl-1001', listOfficeName: 'Mallan' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'B' }),
      listingFixture({ id: 'RLS003', slug: '50-w-66-rls003', listOfficeName: 'C' }),
      listingFixture({ id: 'RLS004', slug: 'somewhere-else-rls004', listOfficeName: 'D' }),
    ];
    const out = annotateCoListedSiblings(input);
    expect(out).toHaveLength(4);
    expect(out.map(l => l.id)).toEqual(['SL-1001', 'RLS002', 'RLS003', 'RLS004']);
  });

  it('only the Mallan-relevant group is annotated when mixed with a third-party group', () => {
    const input = [
      // Mallan-relevant group at 50-w-66
      mallanExclusive({ id: 'SL-1001', slug: '50-w-66-sl-1001', listOfficeName: 'Mallan' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'B' }),
      // separate third-party-only group at 10-park
      listingFixture({ id: 'RLS003', slug: '10-park-ave-rls003', listOfficeName: 'C' }),
      listingFixture({ id: 'RLS004', slug: '10-park-ave-rls004', listOfficeName: 'D' }),
    ];
    const out = annotateCoListedSiblings(input);
    const byId = Object.fromEntries(out.map(l => [l.id, l]));
    expect(byId['SL-1001']._coListedCount).toBe(1);
    expect(byId.RLS002._coListedCount).toBe(1);
    // third-party-only group → not annotated
    expect(byId.RLS003._coListedCount).toBeFalsy();
    expect(byId.RLS004._coListedCount).toBeFalsy();
  });

  it('skips MLS-ID fallback slugs (address-suppressed listings cannot have co-listed siblings via slug)', () => {
    const input = [
      mallanExclusive({ id: 'SL-1001', slug: 'listing-sl-1001', listOfficeName: 'Mallan' }),
      listingFixture({ id: 'RLS002', slug: 'listing-rls002', listOfficeName: 'B' }),
    ];
    const out = annotateCoListedSiblings(input);
    for (const row of out) {
      expect(row._coListedCount).toBeFalsy();
    }
  });

  it('dedupes the "REBNY RLS" fallback office name in a Mallan-relevant group', () => {
    const input = [
      mallanExclusive({ id: 'SL-1001', slug: '50-w-66-sl-1001', listOfficeName: 'Mallan' }),
      listingFixture({ id: 'RLS002', slug: '50-w-66-rls002', listOfficeName: 'REBNY RLS' }),
    ];
    const out = annotateCoListedSiblings(input);
    const mallan = out.find(l => l.id === 'SL-1001');
    expect(mallan?._coListedCount).toBe(1);
    // "REBNY RLS" is the neutral fallback when the source row omits a real
    // brokerage — it must not render as a sibling brokerage name.
    expect(mallan?._coListedBrokerages).toEqual([]);
  });

  it('is pure (does not mutate input array or its elements)', () => {
    const input = [
      mallanExclusive({ id: 'SL-1001', slug: '50-w-66-sl-1001', listOfficeName: 'Mallan' }),
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

  // PR-A render guard: when the annotator leaves _coListedCount absent (the
  // third-party-only case), the badge must not render. formatCoListedBadge
  // early-returns null on a falsy/<=0 count, and the JSX renders it only when
  // truthy — so absent metadata ⇒ no yellow banner.
  it('SearchListingCard suppresses the badge when _coListedCount is absent/<=0', () => {
    expect(searchCardSrc).toMatch(/if\s*\(!count\s*\|\|\s*count\s*<=\s*0\)\s*return null/);
    // The badge JSX is gated on a truthy formatCoListedBadge(...) result.
    expect(searchCardSrc).toMatch(/formatCoListedBadge\(listing\)\s*&&/);
  });
});
