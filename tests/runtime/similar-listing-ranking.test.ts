/// <reference types="jest" />
/**
 * Similar-listing ranking helper (lib/listings/similar-listing-ranking.ts) and its
 * wiring into GET /api/listings/similar.
 *
 * Behavioral coverage for the ranking rules: bedroom match, price band, price/location
 * proximity scoring, and the top-N ordering. Plus a source guard proving the endpoint
 * actually USES the helper (previously it ordered by list_price DESC and ignored beds).
 */
import fs from 'fs';
import path from 'path';
import {
  getSimilarityPriceBand,
  isBedroomMatch,
  similarityScore,
  rankSimilarListings,
  normalizePropertyClass,
  classifyPropertyClass,
  collapseForRental,
  isPropertyClassMatch,
  type SimilarityTarget,
  type SimilarityCandidate,
} from '@/lib/listings/similar-listing-ranking';

describe('getSimilarityPriceBand', () => {
  it('sale band is 0.7x–1.3x, rounded, min 1', () => {
    expect(getSimilarityPriceBand(1_000_000, false)).toEqual({ min: 700_000, max: 1_300_000 });
  });
  it('rental band is tighter (0.75x–1.25x)', () => {
    expect(getSimilarityPriceBand(4_000, true)).toEqual({ min: 3_000, max: 5_000 });
  });
  it('never returns a min below 1', () => {
    expect(getSimilarityPriceBand(0, false).min).toBeGreaterThanOrEqual(1);
  });
});

describe('isBedroomMatch', () => {
  it('studio (0) matches only 0 or 1 bed', () => {
    expect(isBedroomMatch(0, 0)).toBe(true);
    expect(isBedroomMatch(0, 1)).toBe(true);
    expect(isBedroomMatch(0, 2)).toBe(false);
  });
  it('otherwise matches within ±1 bed', () => {
    expect(isBedroomMatch(2, 1)).toBe(true);
    expect(isBedroomMatch(2, 3)).toBe(true);
    expect(isBedroomMatch(2, 4)).toBe(false);
  });
  it('null candidate beds never match', () => {
    expect(isBedroomMatch(2, null)).toBe(false);
  });
});

describe('similarityScore', () => {
  const target: SimilarityTarget = { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' };

  it('returns +Infinity for a bedroom mismatch (excluded from results)', () => {
    expect(similarityScore(target, { beds: 5, price: 1_000_000, postalCode: '10011' })).toBe(Number.POSITIVE_INFINITY);
  });
  it('returns +Infinity for a null/zero/invalid price', () => {
    expect(similarityScore(target, { beds: 2, price: 0, postalCode: '10011' })).toBe(Number.POSITIVE_INFINITY);
  });
  it('a closer price scores lower than a farther price', () => {
    const near = similarityScore(target, { beds: 2, price: 1_050_000, postalCode: '10011' });
    const far = similarityScore(target, { beds: 2, price: 1_250_000, postalCode: '10011' });
    expect(near).toBeLessThan(far);
  });
  it('same ZIP scores lower than same neighborhood, which scores lower than neither', () => {
    const sameZip = similarityScore(target, { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' });
    const sameHood = similarityScore(target, { beds: 2, price: 1_000_000, postalCode: '10003', neighborhood: 'Chelsea' });
    const neither = similarityScore(target, { beds: 2, price: 1_000_000, postalCode: '10003', neighborhood: 'Tribeca' });
    expect(sameZip).toBeLessThan(sameHood);
    expect(sameHood).toBeLessThan(neither);
  });
});

describe('rankSimilarListings', () => {
  const target: SimilarityTarget = { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' };
  const cand = (over: Partial<SimilarityCandidate> & { id: string }): SimilarityCandidate & { id: string } => ({
    beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea', ...over,
  });

  it('orders by ascending similarity score (closest first)', () => {
    const ranked = rankSimilarListings(
      [
        cand({ id: 'far', price: 1_290_000 }),
        cand({ id: 'exact', price: 1_000_000 }),
        cand({ id: 'near', price: 1_050_000 }),
      ],
      target,
    );
    expect(ranked.map((c) => c.id)).toEqual(['exact', 'near', 'far']);
  });

  it('drops bedroom-mismatches and null-beds entirely', () => {
    const ranked = rankSimilarListings(
      [
        cand({ id: 'match', beds: 2 }),
        cand({ id: 'mismatch', beds: 5 }),
        cand({ id: 'nullbeds', beds: null }),
      ],
      target,
    );
    expect(ranked.map((c) => c.id)).toEqual(['match']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => cand({ id: `c${i}`, price: 1_000_000 + i * 1000 }));
    expect(rankSimilarListings(many, target, 6)).toHaveLength(6);
  });

  it('a same-ZIP 2-bed outranks a different-ZIP 2-bed at the same price', () => {
    const ranked = rankSimilarListings(
      [
        cand({ id: 'otherZip', postalCode: '10003', neighborhood: 'Tribeca' }),
        cand({ id: 'sameZip', postalCode: '10011' }),
      ],
      target,
    );
    expect(ranked[0].id).toBe('sameZip');
  });
});

describe('GET /api/listings/similar wires the ranking helper', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/listings/similar/route.ts'),
    'utf8',
  );
  it('imports the ranking helper', () => {
    expect(src).toMatch(/from '@\/lib\/listings\/similar-listing-ranking'/);
  });
  it('reads the beds param and builds a SimilarityTarget', () => {
    expect(src).toMatch(/searchParams\.get\('beds'\)/);
    expect(src).toMatch(/const target: SimilarityTarget/);
  });
  it('orders both the DB and Trestle candidate sets via rankSimilarListings', () => {
    const uses = src.match(/rankSimilarListings\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
  it('uses the helper price band instead of the old crude 0.3x–1.7x window', () => {
    expect(src).toMatch(/getSimilarityPriceBand\(price, isRental\)/);
    expect(src).not.toMatch(/price \* 0\.3|price \* 1\.7/);
  });

  it('excludes the SUBJECT listing on BOTH the DB and Cotality paths', () => {
    expect(src).toMatch(/listing_id: \{ not: excludeId \}/); // DB path
    expect(src).toMatch(/id !== excludeId/);                 // Cotality path
  });

  it('preserves display/compliance + address-suppression gates on both paths', () => {
    expect(src).toMatch(/SEARCH_DISPLAY_GATE/);                       // DB display gate
    expect(src).toMatch(/checkDistributionGates\(r\)\.displayable/);  // Cotality display gate
    expect(src).toMatch(/maskAddressIfRestricted/);                   // address suppression
  });

  it('filters Cotality by StandardStatus, NOT the provider-suppressed MlsStatus (which 400s the feed)', () => {
    // The Cotality API rejects filtering/ordering on MlsStatus (→ HTTP 400), which silently killed the
    // whole live-feed path. Both Cotality query sites must use StandardStatus.
    const std = src.match(/StandardStatus eq 'Active'/g) || [];
    expect(std.length).toBeGreaterThanOrEqual(2); // ZIP query + neighborhood-widening query
    expect(src).not.toMatch(/MlsStatus eq 'Active'/); // never filter on MlsStatus
  });

  it('fetches a WIDE in-band Cotality candidate pool so the ranker can reach nearby-priced comps', () => {
    // $top: 7 + ListPrice desc only returned the priciest in-band units, starving the ranker of the
    // closer/cheaper studios. Fetch the full band and let rankSimilarListings pick the closest.
    expect(src).not.toMatch(/\$top: '7'/);
    expect(src).toMatch(/\$top: '50'/);
  });

  it('threads property class through the target and BOTH candidate sets (like-with-like)', () => {
    expect(src).toMatch(/searchParams\.get\('propertyType'\)/);    // reads subject class signals
    expect(src).toMatch(/searchParams\.get\('propertySubType'\)/);
    expect(src).toMatch(/propertyClass: subjectClass/);            // onto the target
    const owned = src.match(/propertyClass:/g) || [];
    expect(owned.length).toBeGreaterThanOrEqual(3);                // target + DB candidate + Cotality candidate
    // rentals collapse apartment-style so the classification is comp-correct for both DB + Cotality
    const collapsed = src.match(/collapseForRental\(/g) || [];
    expect(collapsed.length).toBeGreaterThanOrEqual(3);
  });
});

describe('regression — #4D case (400 E 90th St, Apt 4D): studio never returns 2-bedroom comps', () => {
  const studioTarget: SimilarityTarget = { beds: 0, price: 560_000, postalCode: '10128', neighborhood: 'Upper East Side' };
  type C = SimilarityCandidate & { id: string };

  it('a ~$560K studio ranks above $925K–$950K 2-bedrooms — and the 2-beds are EXCLUDED, not just ranked lower', () => {
    const candidates: C[] = [
      { id: 'twoBed925', beds: 2, price: 925_000, postalCode: '10021', neighborhood: 'Upper East Side' },
      { id: 'studio555', beds: 0, price: 555_000, postalCode: '10128', neighborhood: 'Upper East Side' },
      { id: 'twoBed950', beds: 2, price: 950_000, postalCode: '10128', neighborhood: 'Upper East Side' },
      { id: 'oneBed575', beds: 1, price: 575_000, postalCode: '10128', neighborhood: 'Upper East Side' },
    ];
    const ids = rankSimilarListings(candidates, studioTarget).map((c) => c.id);
    expect(ids).not.toContain('twoBed925'); // bedroom-incompatible → dropped
    expect(ids).not.toContain('twoBed950'); // bedroom-incompatible → dropped
    expect(ids[0]).toBe('studio555');       // closest studio ranks first
    expect(ids).toContain('oneBed575');     // a 1-bed is an allowed studio neighbor
  });

  it('the $560K sale price band excludes $925K–$950K entirely (second line of defense)', () => {
    const { min, max } = getSimilarityPriceBand(560_000, false); // 392,000 – 728,000
    expect(925_000).toBeGreaterThan(max);
    expect(950_000).toBeGreaterThan(max);
    expect(555_000).toBeGreaterThanOrEqual(min);
    expect(555_000).toBeLessThanOrEqual(max);
  });
});

describe('regression — price-band boundaries are inclusive', () => {
  it('sale: exactly 0.7x and 1.3x are the boundaries', () => {
    expect(getSimilarityPriceBand(1_000_000, false)).toEqual({ min: 700_000, max: 1_300_000 });
  });
  it('rental: exactly 0.75x and 1.25x are the boundaries', () => {
    expect(getSimilarityPriceBand(4_000, true)).toEqual({ min: 3_000, max: 5_000 });
  });
});

describe('regression — deterministic, stable ordering on score ties', () => {
  const target: SimilarityTarget = { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' };
  type C = SimilarityCandidate & { id: string };
  it('identical-score candidates keep their input order (stable sort → deterministic output)', () => {
    const tied: C[] = [
      { id: 'a', beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' },
      { id: 'b', beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' },
      { id: 'c', beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' },
    ];
    expect(rankSimilarListings(tied, target).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('property-class matching — condo / co-op / condop / townhouse / apartment', () => {
  it('normalizePropertyClass collapses RESO enums AND display strings, and round-trips its own output', () => {
    expect(normalizePropertyClass('Condominium')).toBe('condo');
    expect(normalizePropertyClass('Condo')).toBe('condo');
    expect(normalizePropertyClass('StockCooperative')).toBe('coop');
    expect(normalizePropertyClass('Co-op')).toBe('coop');
    expect(normalizePropertyClass('Condop')).toBe('condop');            // NOT misread as condo
    // NYC townhouses: the feed labels them SingleFamilyResidence / MultiFamily / Duplex(CI=None),
    // never 'Townhouse' — all fee-simple whole-building homes fold into ONE 'townhouse' class.
    expect(normalizePropertyClass('Townhouse')).toBe('townhouse');
    expect(normalizePropertyClass('SingleFamilyResidence')).toBe('townhouse');
    expect(normalizePropertyClass('Detached')).toBe('townhouse');
    expect(normalizePropertyClass('MultiFamily')).toBe('townhouse');
    expect(normalizePropertyClass('Triplex')).toBe('townhouse');
    expect(normalizePropertyClass('Loft')).toBe('loft');
    expect(normalizePropertyClass('Apartment')).toBe('apartment');
    expect(normalizePropertyClass('Residential')).toBe('');
    expect(normalizePropertyClass(null)).toBe('');
    // round-trip (isPropertyClassMatch normalizes its inputs)
    for (const c of ['condo', 'coop', 'condop', 'townhouse', 'loft', 'apartment']) {
      expect(normalizePropertyClass(c)).toBe(c);
    }
  });

  it('classifyPropertyClass: CommonInterest wins, then PropertySubType, then PropertyType', () => {
    // a townhouse has NO CommonInterest → classified from PropertySubType
    expect(classifyPropertyClass(null, 'Townhouse', 'Residential')).toBe('townhouse');
    // a condo unit → CommonInterest wins even if sub-type says Apartment
    expect(classifyPropertyClass('Condominium', 'Apartment', 'Residential')).toBe('condo');
    // a DUPLEX condo unit is an apartment, NOT a townhouse (CommonInterest wins)
    expect(classifyPropertyClass('Condominium', 'Duplex', 'Residential')).toBe('condo');
    // fee-simple single-family / multi-family (CI=None) → townhouse
    expect(classifyPropertyClass('None', 'SingleFamilyResidence', 'Residential')).toBe('townhouse');
    expect(classifyPropertyClass('None', 'MultiFamily', 'Residential')).toBe('townhouse');
  });

  it('isPropertyClassMatch: same matches, different KNOWN classes do not, unknown is permissive', () => {
    expect(isPropertyClassMatch('Townhouse', 'Townhouse')).toBe(true);
    expect(isPropertyClassMatch('SingleFamilyResidence', 'MultiFamily')).toBe(true); // both townhouses
    expect(isPropertyClassMatch('Townhouse', 'Condominium')).toBe(false);            // townhouse ≠ condo
    expect(isPropertyClassMatch('Condominium', 'StockCooperative')).toBe(false);
    expect(isPropertyClassMatch('Condo', null)).toBe(true);
    expect(isPropertyClassMatch(null, 'Townhouse')).toBe(true);
  });

  it('similarityScore excludes a property-class mismatch (Infinity)', () => {
    const t: SimilarityTarget = { beds: 3, price: 4_000_000, postalCode: '10128', propertyClass: 'townhouse' };
    expect(similarityScore(t, { beds: 3, price: 4_000_000, postalCode: '10128', propertyClass: 'condo' })).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isFinite(similarityScore(t, { beds: 3, price: 4_000_000, postalCode: '10128', propertyClass: 'townhouse' }))).toBe(true);
  });

  it('collapseForRental: rentals fold apartment-style into one bucket; townhouse stays distinct; sales unchanged', () => {
    expect(collapseForRental('condo', true)).toBe('apartment');
    expect(collapseForRental('coop', true)).toBe('apartment');
    expect(collapseForRental('loft', true)).toBe('apartment');
    expect(collapseForRental('townhouse', true)).toBe('townhouse'); // still distinct for rentals
    expect(collapseForRental('condo', false)).toBe('condo');        // sales unchanged
    expect(collapseForRental('coop', false)).toBe('coop');
  });
});

describe('regression — #4D is a CONDO: comps are condos only, no co-ops', () => {
  type C = SimilarityCandidate & { id: string };
  it('a condo studio returns only condo studios; co-op studios are excluded', () => {
    const target: SimilarityTarget = { beds: 0, price: 560_000, postalCode: '10128', neighborhood: 'Upper East Side', propertyClass: 'condo' };
    const candidates: C[] = [
      { id: 'condo539', beds: 0, price: 539_000, postalCode: '10128', propertyClass: 'condo' },
      { id: 'coop479',  beds: 0, price: 479_000, postalCode: '10128', propertyClass: 'coop' },
      { id: 'condo599', beds: 0, price: 599_000, postalCode: '10128', propertyClass: 'condo' },
      { id: 'coop620',  beds: 0, price: 620_000, postalCode: '10128', propertyClass: 'coop' },
    ];
    const ids = rankSimilarListings(candidates, target).map((c) => c.id);
    expect(ids).toEqual(['condo539', 'condo599']); // closest condos; co-ops excluded entirely
    expect(ids).not.toContain('coop479');
    expect(ids).not.toContain('coop620');
  });
});

describe('regression — TOWNHOUSE subject: comps are townhouses only (no condo/co-op apartments)', () => {
  type C = SimilarityCandidate & { id: string };
  it('a townhouse returns fee-simple townhouses (single- AND multi-family); condo/co-op are excluded', () => {
    const target: SimilarityTarget = { beds: 4, price: 5_000_000, postalCode: '10021', neighborhood: 'Upper East Side', propertyClass: 'townhouse' };
    const candidates: C[] = [
      { id: 'sfr4.9m',  beds: 4, price: 4_900_000, postalCode: '10021', propertyClass: 'SingleFamilyResidence' }, // → townhouse
      { id: 'condo5m',  beds: 4, price: 5_000_000, postalCode: '10021', propertyClass: 'Condominium' },
      { id: 'multi5.1m',beds: 5, price: 5_100_000, postalCode: '10021', propertyClass: 'MultiFamily' },           // → townhouse
      { id: 'coop4.8m', beds: 4, price: 4_800_000, postalCode: '10021', propertyClass: 'StockCooperative' },
    ];
    const ids = rankSimilarListings(candidates, target).map((c) => c.id);
    // single-family + multi-family both count as townhouses and are included; apartments excluded
    expect(ids).toContain('sfr4.9m');
    expect(ids).toContain('multi5.1m');
    expect(ids).not.toContain('condo5m');
    expect(ids).not.toContain('coop4.8m');
  });
});

describe('regression — RENTALS collapse apartment-style but keep townhouse distinct', () => {
  type C = SimilarityCandidate & { id: string };
  it('a rental condo apartment matches other rental apartments (condo/co-op) but NOT a rental townhouse', () => {
    // route applies collapseForRental → target + candidates are pre-collapsed ('apartment'/'townhouse')
    const target: SimilarityTarget = { beds: 1, price: 4_000, postalCode: '10128', propertyClass: 'apartment' };
    const candidates: C[] = [
      { id: 'aptA', beds: 1, price: 3_950, postalCode: '10128', propertyClass: 'apartment' }, // was a condo rental
      { id: 'aptB', beds: 1, price: 4_100, postalCode: '10128', propertyClass: 'apartment' }, // was a co-op rental
      { id: 'townhouseRental', beds: 1, price: 4_000, postalCode: '10128', propertyClass: 'townhouse' },
    ];
    const ids = rankSimilarListings(candidates, target).map((c) => c.id);
    expect(ids).toContain('aptA');
    expect(ids).toContain('aptB');
    expect(ids).not.toContain('townhouseRental'); // townhouse rental excluded from apartment comps
  });
});

describe('regression — listing-detail page feeds SimilarListings an OWNERSHIP-aware type', () => {
  const PAGE = fs.readFileSync(path.resolve(__dirname, '../../app/listing/[...slug]/page.tsx'), 'utf8');
  it('derives propertyType via mapPropertyTypeToDisplay (CommonInterest-first), not the raw sub-type', () => {
    // A condo unit's PropertySubType is "Apartment"; keying off the sub-type alone classified the
    // subject as a generic apartment and EMPTIED Similar Properties (studio condo → no condo comps).
    // CONTRACT MOVED (DTO collapse): the detail page delegates to
    // dbListingToPublicDTO, which owns the CommonInterest-first derivation.
    // The invariant is unchanged and now asserted at that owner; the page is
    // checked for delegation and for not regrowing the raw sub-type keying.
    const DTO = fs.readFileSync(
      path.resolve(__dirname, '../../lib/idx/db-to-public-dto.ts'),
      'utf8',
    );
    expect(DTO).toMatch(/propertyType: mapPropertyTypeToDisplay\(/);
    expect(PAGE).toMatch(/dbListingToPublicDTO\(dbListing[,)]/);
    expect(PAGE).not.toMatch(/propertyType: dbListing\.property_sub_type \|\| dbListing\.property_type/);
  });
  it('passes propertyType + propertySubType into SimilarListings', () => {
    expect(PAGE).toMatch(/<SimilarListings[\s\S]*?propertyType=\{listing\.propertyType\}/);
    expect(PAGE).toMatch(/<SimilarListings[\s\S]*?propertySubType=\{listing\.propertySubType\}/);
  });
});
