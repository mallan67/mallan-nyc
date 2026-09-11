/// <reference types="jest" />
/**
 * Provider query builder — exact filter text and an exhaustive bath truth table.
 * Pins what the executor SENDS. Whether the provider accepts each form was
 * established live on 2026-09-05 and is re-verified by the Runtime/Integration
 * Validator, not here.
 */
import { buildProviderQuery, bathsAtLeastFilter, bathsAtMostFilter, orderbyFor } from '@/lib/search/engine/provider-query';
import { criteriaFromParams } from '@/lib/search/engine/criteria';
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';

function crit(q: string) {
  const r = criteriaFromParams(new URLSearchParams(q));
  if (!r.ok) throw new Error(JSON.stringify(r.refusal));
  return r.criteria;
}

describe('universe and gates', () => {
  test('sale is positive membership, Active by default, IDX permission, Mallan office suppressed in-query', () => {
    const q = buildProviderQuery(crit('type=sale'));
    expect(q.filter).toContain("PropertyType eq 'Residential'");
    expect(q.filter).not.toContain("ne 'ResidentialLease'");
    expect(q.filter).toContain("StandardStatus eq 'Active'");
    expect(q.filter).toContain("Permission has 'IDX'");
    for (const id of MALLAN_LIST_OFFICE_MLS_IDS) expect(q.filter).toContain(`ListOfficeMlsId ne '${id}'`);
  });
  test('rental is the lease universe', () => {
    expect(buildProviderQuery(crit('type=rent')).filter).toContain("PropertyType eq 'ResidentialLease'");
  });
});

describe('criteria → filter text', () => {
  test('price, beds, CityRegion, SubdivisionName (lowercased), PostalCode, ListingId', () => {
    const q = buildProviderQuery(crit('type=sale&minPrice=500000&maxPrice=1000000&beds=2&maxBeds=3&borough=Staten Island&neighborhood=TriBeCa&zip=10007&listingId=RLS20112785'));
    expect(q.filter).toContain('ListPrice ge 500000');
    expect(q.filter).toContain('ListPrice le 1000000');
    expect(q.filter).toContain('BedroomsTotal ge 2');
    expect(q.filter).toContain('BedroomsTotal le 3');
    expect(q.filter).toContain("CityRegion eq 'StatenIsland'");
    expect(q.filter).toContain("tolower(SubdivisionName) eq 'tribeca'");
    expect(q.filter).toContain("PostalCode eq '10007'");
    expect(q.filter).toContain("ListingId eq 'RLS20112785'");
  });
  test('CommonInterest uses eq, StructureType uses has; PropertySubType is never used', () => {
    const q = buildProviderQuery(crit('type=sale&ownership=Condominium,Stock Cooperative&StructureType=Townhouse'));
    expect(q.filter).toContain("CommonInterest eq 'Condominium'");
    expect(q.filter).toContain("CommonInterest eq 'StockCooperative'");
    expect(q.filter).toContain("StructureType has 'Townhouse'");
    expect(q.filter).not.toContain('PropertySubType');
  });
  test('apostrophes are escaped', () => {
    expect(buildProviderQuery(crit("type=sale&neighborhood=Hell's Kitchen")).filter).toContain("tolower(SubdivisionName) eq 'hell''s kitchen'");
  });
  test('sort → two-term orderby with the ListingKey tie-break', () => {
    expect(orderbyFor('price_desc')).toBe('ListPrice desc,ListingKey asc');
    expect(orderbyFor('price_asc')).toBe('ListPrice asc,ListingKey asc');
    expect(orderbyFor('newest')).toBe('ListingContractDate desc,ListingKey asc');
  });
});

// Bath truth table: the disjunction must equal 2·Full + Half ≥ / ≤ n for EVERY row.
function evalTerm(term: string, full: number, half: number): boolean {
  const expr = term
    .replace(/BathroomsFull/g, String(full)).replace(/BathroomsHalf/g, String(half))
    .replace(/\bge\b/g, '>=').replace(/\ble\b/g, '<=').replace(/\beq\b/g, '===')
    .replace(/\band\b/g, '&&').replace(/\bor\b/g, '||');
  // eslint-disable-next-line no-new-func
  return Boolean(new Function(`return (${expr});`)());
}

describe('bath filters are exact against the canonical rule', () => {
  const fulls = [0, 1, 2, 3, 4, 5, 6, 8, 12];
  const halfs = [0, 1, 2, 3, 4, 8, 9, 12];
  const thresholds = [0.5, 1, 1.5, 2, 2.5, 3, 4.5, 5, 6];
  test.each(thresholds)('at least %s baths', (b) => {
    const f = bathsAtLeastFilter(b) as string;
    expect(f).toBeTruthy();
    for (const full of fulls) for (const half of halfs) expect(evalTerm(f, full, half)).toBe(full + 0.5 * half >= b);
  });
  test.each(thresholds)('at most %s baths', (b) => {
    const f = bathsAtMostFilter(b) as string;
    expect(f).toBeTruthy();
    for (const full of fulls) for (const half of halfs) expect(evalTerm(f, full, half)).toBe(full + 0.5 * half <= b);
  });
  test('a zero minimum adds no filter', () => {
    expect(bathsAtLeastFilter(0)).toBeNull();
  });
});
