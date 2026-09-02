/**
 * MALLAN-AUTHORED LISTINGS ARE A CANONICAL SEARCH SOURCE — UNDER THE SAME CRITERIA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS ENFORCES
 *
 * A Mallan listing may not skip a criterion merely because it came out of
 * Mallan storage instead of the feed. If the broker asked for 2+ beds under
 * $2M in Yorkville, a local row that fails any of those must not appear — and
 * a criterion this source cannot express must REFUSE THE SEARCH BY NAME rather
 * than be quietly dropped.
 *
 * Dropping it is the worse failure and the tempting one: the local half would
 * silently widen while the provider half stayed narrow, so the same search
 * would apply different rules to different listings and look entirely normal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A `where` BUILDER AND NOT A QUERY
 *
 * The builder is pure, so every criterion and every refusal is proven without a
 * database. That matters here specifically: the standing instruction forbids
 * Production Neon, and none of this needs it.
 *
 * `buildPublicListingDbSearch` is deliberately NOT reused. It carries
 * public-audience restrictions, and the Search visibility contract says agent
 * Search has full lifecycle intelligence — importing the public gates would
 * quietly narrow what a broker can see. The LOW-LEVEL canonical contracts are
 * reused instead: bath semantics come from `bath-contract`, identity from the
 * canonical Mallan identity rule.
 */
import {
  buildMallanLocalWhere,
  UnsupportedLocalCriterionError,
  MALLAN_LOCAL_SUPPORTED_CRITERIA,
} from '../mallan-local-source';

const params = (o: Record<string, string>) => new URLSearchParams(o);

describe('only Mallan-AUTHORED listings are ever candidates', () => {
  it('the base where restricts to Mallan-owned local inventory', () => {
    const { where } = buildMallanLocalWhere(params({}));
    // Either an SL-/RL- identity or rls_eligible false — the same rule the
    // open-house readers already use, not a second opinion about ownership.
    expect(JSON.stringify(where)).toMatch(/rls_eligible|SL-|RL-/);
  });
});

describe('every supported criterion actually narrows the local half', () => {
  it('price bounds map to list_price', () => {
    const { where } = buildMallanLocalWhere(params({ minPrice: '1000000', maxPrice: '2000000' }));
    expect(where.list_price).toEqual({ gte: 1_000_000, lte: 2_000_000 });
  });

  it('bed bounds map to bedrooms_total', () => {
    const { where } = buildMallanLocalWhere(params({ minBeds: '2', maxBeds: '4' }));
    expect(where.bedrooms_total).toEqual({ gte: 2, lte: 4 });
  });

  it('baths reuse the canonical bath contract, not a second interpretation', () => {
    // Half-baths are the case a naive `bathrooms_full >= n` gets wrong, and the
    // contract already encodes it. A local reimplementation would make 1.5
    // baths mean two different things in one result set.
    const { where } = buildMallanLocalWhere(params({ minBaths: '1.5' }));
    const s = JSON.stringify(where);
    expect(s).toMatch(/bathrooms_half/);
    expect(s).toMatch(/bathrooms_full/);
  });

  it('sqft bounds map to living_area', () => {
    const { where } = buildMallanLocalWhere(params({ minSqft: '800' }));
    expect(where.living_area).toEqual({ gte: 800 });
  });

  it('the sale/rental workflow selects listing_type', () => {
    expect(buildMallanLocalWhere(params({ type: 'sale' })).where.listing_type).toBe('sale');
    expect(buildMallanLocalWhere(params({ type: 'rental' })).where.listing_type).toBe('rent');
  });

  it('geography maps to borough and neighborhood', () => {
    const { where } = buildMallanLocalWhere(params({ borough: 'Manhattan' }));
    expect(JSON.stringify(where)).toMatch(/borough/);
    const n = buildMallanLocalWhere(params({ neighborhood: 'Yorkville' }));
    expect(JSON.stringify(n.where)).toMatch(/Yorkville/i);
  });

  it('status maps to the status column', () => {
    const { where } = buildMallanLocalWhere(params({ status: 'Active' }));
    expect(JSON.stringify(where)).toMatch(/Active/);
  });

  it('property sub type maps to property_sub_type', () => {
    const { where } = buildMallanLocalWhere(params({ propertySubType: 'Condominium' }));
    expect(JSON.stringify(where)).toMatch(/Condominium/);
  });
});

describe('an unmapped criterion REFUSES the search, by name', () => {
  it.each([
    'buildingName',
    'managementCompany',
    'keyword',
    'unit',
    'checkboxFilters',
  ])('%s is refused rather than silently ignored', (criterion) => {
    // The failure this prevents: the local half widens while the provider half
    // stays narrow, so one search applies two different rules and looks normal.
    expect(() => buildMallanLocalWhere(params({ [criterion]: 'anything' })))
      .toThrow(UnsupportedLocalCriterionError);
  });

  it('the refusal NAMES the criterion, so the broker learns which one', () => {
    try {
      buildMallanLocalWhere(params({ keyword: 'prewar' }));
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedLocalCriterionError);
      expect((e as UnsupportedLocalCriterionError).criterion).toBe('keyword');
      expect(String(e)).toMatch(/keyword/);
    }
  });

  it('the supported set is DECLARED, so adding one is a deliberate edit', () => {
    // An allowlist, not a denylist. A new criterion added to the executor is
    // unsupported here until someone maps it, which fails loud instead of
    // leaking an unfiltered local row.
    expect(MALLAN_LOCAL_SUPPORTED_CRITERIA.size).toBeGreaterThan(0);
    expect(MALLAN_LOCAL_SUPPORTED_CRITERIA.has('minPrice')).toBe(true);
    expect(MALLAN_LOCAL_SUPPORTED_CRITERIA.has('keyword')).toBe(false);
  });

  it('pagination and sort params are NOT criteria and do not refuse', () => {
    // These arrive on every request. Treating them as unmapped criteria would
    // refuse every mixed search.
    expect(() => buildMallanLocalWhere(params({
      page: '2', limit: '50', skip: '0', sort: 'price_desc', exactCount: 'true',
    }))).not.toThrow();
  });
});

describe('a Mallan identity never becomes a provider identity', () => {
  it('the where never contains a ListingKey field', () => {
    const { where } = buildMallanLocalWhere(params({ minPrice: '500000' }));
    expect(JSON.stringify(where)).not.toMatch(/ListingKey|ResourceRecordKey/);
  });
});
