/// <reference types="jest" />
/**
 * Criteria contract — Mallan input → live provider tokens, or an explicit refusal.
 * These tests pin the MAPPING; they do not verify the provider.
 */
import {
  criteriaFromParams, resolveMember, displayOf,
  COMMON_INTEREST_MEMBERS, STRUCTURE_TYPE_MEMBERS, STANDARD_STATUS_MEMBERS, CITY_REGION_VALUES, MAX_PAGE, DEFAULT_PAGE,
} from '@/lib/search/engine/criteria';

const P = (q: string) => new URLSearchParams(q);
const ok = (q: string) => { const r = criteriaFromParams(P(q)); if (!r.ok) throw new Error(JSON.stringify(r.refusal)); return r.criteria; };
const refused = (q: string) => { const r = criteriaFromParams(P(q)); if (r.ok) throw new Error('expected refusal'); return r.refusal; };

describe('workflow', () => {
  test('sale and rental are distinct contracts; default is sale + Active', () => {
    expect(ok('type=sale').workflow).toBe('sale');
    expect(ok('type=rent').workflow).toBe('rental');
    expect(ok('').workflow).toBe('sale');
    expect(ok('').standardStatus).toEqual(['Active']);
  });
});

describe('members resolve by LookupValue or StandardLookupValue and are executed as LookupValue', () => {
  test('StandardStatus', () => {
    expect(ok('status=active,Coming Soon,Pending').standardStatus).toEqual(['Active', 'ComingSoon', 'Pending']);
    expect(refused('status=Sold').invalid[0].param).toBe('status');
  });
  test('CommonInterest via the CRM wire name and the provider name', () => {
    expect(ok('ownership=Condominium,Stock Cooperative').commonInterest).toEqual(['Condominium', 'StockCooperative']);
    expect(ok('CommonInterest=Rental Building,condop').commonInterest).toEqual(['RentalBuilding', 'Condop']);
    expect(refused('ownership=Loft').invalid[0]).toMatchObject({ param: 'ownership', value: 'Loft' });
  });
  test('StructureType', () => {
    expect(ok('StructureType=Townhouse,High Rise').structureType).toEqual(['Townhouse', 'HighRise']);
    expect(refused('StructureType=Brownstone').invalid[0].param).toBe('StructureType');
  });
  test('display forms come from the live Lookup, not from Mallan', () => {
    expect(displayOf('StockCooperative', COMMON_INTEREST_MEMBERS)).toBe('Stock Cooperative');
    expect(displayOf('HighRise', STRUCTURE_TYPE_MEMBERS)).toBe('High Rise');
    expect(displayOf('ComingSoon', STANDARD_STATUS_MEMBERS)).toBe('Coming Soon');
    expect(resolveMember('stock-cooperative', COMMON_INTEREST_MEMBERS)).toBe('StockCooperative');
  });
});

describe('CityRegion', () => {
  test('Mallan labels map to the live values; the space in Staten Island is removed', () => {
    expect(ok('borough=Staten Island,manhattan,The Bronx').cityRegion).toEqual(['StatenIsland', 'Manhattan', 'Bronx']);
    expect(CITY_REGION_VALUES).toContain('StatenIsland');
  });
  test('an unknown value is refused, never sent (the provider would return 0 silently)', () => {
    expect(refused('borough=Jersey City').invalid[0]).toMatchObject({ param: 'borough', value: 'Jersey City' });
  });
});

describe('numbers and baths', () => {
  test('baths round to half-steps', () => {
    const c = ok('minBaths=1.3&maxBaths=2.7');
    expect(c.bathsMin).toBe(1.5);
    expect(c.bathsMax).toBe(2.5);
  });
  test('min above max is refused, not swapped', () => {
    expect(refused('minPrice=900000&maxPrice=500000').invalid[0].param).toBe('minPrice');
    expect(refused('beds=3&maxBeds=1').invalid[0].param).toBe('beds');
    expect(refused('minBaths=3&maxBaths=1').invalid[0].param).toBe('minBaths');
  });
  test('non-numeric values are refused', () => {
    expect(refused('minPrice=abc').invalid[0].param).toBe('minPrice');
  });
});

describe('criteria outside the checkpoint are refused by name, never ignored', () => {
  test('a present, non-blank unsupported parameter', () => {
    expect(refused('type=sale&minSqft=800').unsupported).toEqual(['minSqft']);
  });
  test('blank or empty-object values do not count', () => {
    expect(ok('type=sale&checkboxFilters={}&keyword=').workflow).toBe('sale');
  });
  test('transport keys are ignored', () => {
    expect(ok('type=sale&_t=123&page=2').workflow).toBe('sale');
  });
});

describe('paging and sort', () => {
  test('limit clamps to the page cap and defaults', () => {
    expect(ok('limit=500').limit).toBe(MAX_PAGE);
    expect(ok('').limit).toBe(DEFAULT_PAGE);
  });
  test('sort accepts canonical keys and the CRM wire forms; other keys are refused', () => {
    expect(ok('sort=newest').sort).toBe('newest');
    expect(ok('sort=ListPrice asc').sort).toBe('price_asc');
    expect(refused('sort=ModificationTimestamp desc').invalid[0].param).toBe('sort');
  });
});
