/// <reference types="jest" />
/**
 * THE ADDRESS DETERMINES THE FORM: typing the address in the Sale form finds the building and fills the neighborhood, borough, zip and the property type.
 *
 * Found against the live building index (2026-11-02): "800 2nd Ave" found the building but
 *   - Building Name came back as the TEXT "null",
 *   - the neighborhood was empty (another listing of the same building knows it: Turtle Bay), so nothing was picked,
 *   - two unrelated Brooklyn buildings (8001 12th Avenue, 8002 21st Avenue) came with it: three candidates, so the form applied none,
 *   - "800 Second Avenue" and "800 2nd Avenue 806" (unit typed in the address box) found nothing.
 * Pinned here: the rules (pure), the route against rows shaped like the live ones, and the real Sale form.
 */
import { NextRequest } from 'next/server';
import { cleanBuildingText, normalizeBuildingQuery, numberedStreetMatches, backfillBuildingIdentity, ordinalToNumber } from '@/lib/buildings/building-lookup-clean';
import { bootAddForm, sleep } from './add-form-harness';

/* eslint-disable @typescript-eslint/no-explicit-any */
jest.setTimeout(240000);

// ── the route's collaborators ──────────────────────────────────────────────────────────────────────────────────────────────────────
const mockQueryRaw = jest.fn();
const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { $queryRawUnsafe: (...a: unknown[]) => mockQueryRaw(...a), listing: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));
jest.mock('@/lib/auth', () => ({
  requireAgentOrBroker: jest.fn(async () => ({ userId: 1n, role: 'BROKER' })),
  isAuthError: (a: any) => !!a && 'status' in a && typeof a.json === 'function',
}));
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'token') }));

import { GET, parseAddressQuery } from '@/app/api/buildings/search/route';

const A_2ND = { StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', City: 'New York', StateOrProvince: 'NY', PostalCode: '10017', CityRegion: 'Manhattan' };
// What the live index held for the building: the first listing carries the text "null" as its building name and no neighborhood; another listing (the active one) knows it.
const ROW_OLD = { address: { ...A_2ND, UnitNumber: '806', BuildingName: 'null' }, features: { YearBuilt: 1957, CommonInterest: 'Condominium' }, raw_data: {}, custom_fields: null, property_type: 'Residential', property_sub_type: 'Apartment', neighborhood: null };
const ROW_NEW = { address: { ...A_2ND, UnitNumber: '806' }, features: { YearBuilt: 1957, CommonInterest: 'Condominium' }, raw_data: {}, custom_fields: null, property_type: 'Residential', property_sub_type: 'Apartment', neighborhood: 'Turtle Bay' };
const COTALITY_NOISE = [
  { StreetNumber: '8001', StreetName: '12TH', StreetSuffix: 'Avenue', CityRegion: 'Brooklyn', PostalCode: '11228', SubdivisionName: 'Dyker Heights', City: 'Brooklyn', StateOrProvince: 'NY', BuildingName: '' },
  { StreetNumber: '8002', StreetName: '21st', StreetSuffix: 'Avenue', CityRegion: 'Brooklyn', PostalCode: '11214', SubdivisionName: 'Bensonhurst', City: 'Brooklyn', StateOrProvince: 'NY', BuildingName: 'Ruth Garden' },
];

async function lookup(q: string): Promise<any> {
  const res = await GET(new NextRequest(`https://mallan.nyc/api/buildings/search?q=${encodeURIComponent(q)}`, { headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` } }));
  return res.json();
}

describe('the rules', () => {
  it('cleanBuildingText: a stringified missing value is not a name', () => {
    expect(cleanBuildingText('null')).toBe('');
    expect(cleanBuildingText(' NULL ')).toBe('');
    expect(cleanBuildingText('undefined')).toBe('');
    expect(cleanBuildingText(null)).toBe('');
    expect(cleanBuildingText(undefined)).toBe('');
    expect(cleanBuildingText('The Plaza Tower')).toBe('The Plaza Tower');
    expect(cleanBuildingText('Nullsburg Court')).toBe('Nullsburg Court');
  });

  it.each([
    ['800 2nd Ave', '800 2nd Ave'],
    ['800 Second Avenue', '800 2 Avenue'],
    ['800 2nd Ave #806', '800 2nd Ave'],
    ['800 2nd Avenue, Apt 806', '800 2nd Avenue'],
    ['800 2nd Avenue unit 806', '800 2nd Avenue'],
    ['333 East 46th Street 2G', '333 East 46th Street'],
    ['333 E 46th St #2G', '333 E 46th St'],
    ['425 Park Avenue South', '425 Park Avenue South'],
    ['200 East 66th Street', '200 East 66th Street'],
    ['The Plaza Tower', 'The Plaza Tower'],
    ['Second Avenue Deli', 'Second Avenue Deli'],
  ])('normalizeBuildingQuery(%j) -> %j', (input, expected) => {
    expect(normalizeBuildingQuery(input)).toBe(expected);
  });

  it('ordinalToNumber reads words and suffixes alike', () => {
    expect([ordinalToNumber('Second'), ordinalToNumber('2nd'), ordinalToNumber('2ND'), ordinalToNumber('46th'), ordinalToNumber('Park')]).toEqual(['2', '2', '2', '46', 'park']);
  });

  it('a numbered street names ONE street: 2nd matches 2nd, never 12th or 21st; a named street is left to the index', () => {
    expect(numberedStreetMatches('2ND', '2')).toBe(true);
    expect(numberedStreetMatches('2nd', '2')).toBe(true);
    expect(numberedStreetMatches('12TH', '2')).toBe(false);
    expect(numberedStreetMatches('21st', '2')).toBe(false);
    expect(numberedStreetMatches('PARK', 'park')).toBe(true);
    expect(numberedStreetMatches('PARK AVENUE', 'park')).toBe(true);
    expect(numberedStreetMatches('anything', undefined)).toBe(true);
  });

  it('backfill fills a blank name / neighborhood from another unit of the building, and never overwrites one', () => {
    const b: Record<string, unknown> = { name: '', neighborhood: '', subdivisionName: '' };
    backfillBuildingIdentity(b, { name: 'The Plaza', neighborhood: 'Turtle Bay' });
    expect(b).toEqual({ name: 'The Plaza', neighborhood: 'Turtle Bay', subdivisionName: 'Turtle Bay' });
    backfillBuildingIdentity(b, { name: 'Other', neighborhood: 'Elsewhere' });
    expect(b.name).toBe('The Plaza');
    expect(b.neighborhood).toBe('Turtle Bay');
  });
});

describe('parseAddressQuery reads what the agent actually types', () => {
  it.each(['800 2nd Ave', '800 2nd Avenue', '800 Second Avenue', '800 2nd Ave #806', '800 Second Avenue, Apt 806', '800 2nd Avenue 806'])('%j -> number 800, street 2', (q) => {
    expect(parseAddressQuery(q)).toEqual({ streetNumber: '800', streetName: '2' });
  });
  it('333 East 46th Street 2G still reads as east / 46', () => {
    expect(parseAddressQuery('333 East 46th Street 2G')).toEqual({ streetNumber: '333', streetDirPrefix: 'E', streetName: '46' });
  });
  it('a name with no number is a building name, unchanged', () => {
    expect(parseAddressQuery('The Plaza Tower')).toEqual({ buildingName: 'The Plaza Tower' });
  });
});

describe('GET /api/buildings/search on rows shaped like the live index', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockFindMany.mockReset();
    mockQueryRaw.mockResolvedValue([ROW_OLD, ROW_NEW]);
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ value: COTALITY_NOISE }), text: async () => '' }));
  });

  it('one building: no "null" name, the neighborhood comes from the unit that knows it, and the look-alike Brooklyn streets are gone', async () => {
    const j = await lookup('800 2nd Ave');
    expect(j.buildings).toHaveLength(1);
    expect(j.buildings[0]).toMatchObject({ address: '800 2ND Avenue', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', subdivisionName: 'Turtle Bay', common_interest: 'Condominium' });
    expect(JSON.stringify(j.buildings)).not.toMatch(/8001|8002|Brooklyn|"null"/);
  });

  it.each(['800 Second Avenue', '800 2nd Avenue 806', '800 2nd Ave #806'])('%j finds the same building', async (q) => {
    const j = await lookup(q);
    expect(j.buildings).toHaveLength(1);
    expect(j.buildings[0].neighborhood).toBe('Turtle Bay');
    // the unit and the ordinal word never reach the database filter
    const params = mockQueryRaw.mock.calls[0].slice(1);
    expect(params[0]).toBe('800');
    expect(params.some((p: string) => /806|second/i.test(p))).toBe(false);
  });

  it('a building the index has no neighborhood for anywhere stays blank (nothing is invented)', async () => {
    mockQueryRaw.mockResolvedValue([ROW_OLD]);
    const j = await lookup('800 2nd Ave');
    expect(j.buildings[0].neighborhood).toBe('');
    expect(j.buildings[0].name).toBe('');
  });

  // The LIVE Cotality API is the authority for the area. These answer the Cotality query with the building's own record.
  const LIVE_800_2ND = { StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', CityRegion: 'Manhattan', PostalCode: '10017', SubdivisionName: 'Turtle Bay', City: 'New York', StateOrProvince: 'NY', BuildingName: '' };
  const cotalityAnswers = (rows: unknown[]) => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ value: rows }), text: async () => '' }));
  };

  it('the live Cotality record names the neighborhood when the stored copy of the building has none', async () => {
    mockQueryRaw.mockResolvedValue([ROW_OLD]);                                  // stored copy: no area, name "null"
    cotalityAnswers([LIVE_800_2ND, ...COTALITY_NOISE]);
    const j = await lookup('800 2nd Ave');
    expect(j.buildings).toHaveLength(1);
    expect(j.buildings[0]).toMatchObject({ address: '800 2ND Avenue', name: '', neighborhood: 'Turtle Bay', subdivisionName: 'Turtle Bay' });
  });

  it('the live area wins over an older stored one', async () => {
    mockQueryRaw.mockResolvedValue([{ ...ROW_OLD, address: { ...ROW_OLD.address, SubdivisionName: 'Midtown East' } }]);
    cotalityAnswers([LIVE_800_2ND]);
    const j = await lookup('800 2nd Ave');
    expect(j.buildings[0].neighborhood).toBe('Turtle Bay');
  });

  it('a building only the live API knows is built from it: neighborhood from SubdivisionName, no database row needed', async () => {
    mockQueryRaw.mockResolvedValue([]);
    cotalityAnswers([LIVE_800_2ND, ...COTALITY_NOISE]);
    const j = await lookup('800 Second Avenue');
    expect(j.buildings).toHaveLength(1);
    expect(j.buildings[0]).toMatchObject({ address: '800 2ND Avenue', neighborhood: 'Turtle Bay', borough: 'Manhattan', zip: '10017', source: 'cotality' });
  });

  it('a live record with no area changes nothing the stored copy knows', async () => {
    mockQueryRaw.mockResolvedValue([ROW_NEW]);                                  // stored copy knows Turtle Bay (listing column)
    cotalityAnswers([{ ...LIVE_800_2ND, SubdivisionName: '' }]);
    const j = await lookup('800 2nd Ave');
    expect(j.buildings[0].neighborhood).toBe('Turtle Bay');
  });
});

// ── the real Sale form ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BUILDING = {
  address: '800 2ND Avenue', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', common_interest: 'Condominium', structure_type: 'HighRise', year_built: 1957,
};
const LOOKALIKES = [
  { ...BUILDING, address: '8001 12TH Avenue', borough: 'Brooklyn', zip: '11228', neighborhood: 'Dyker Heights', common_interest: 'None' },
  { ...BUILDING, address: '8002 21st Avenue', borough: 'Brooklyn', zip: '11214', neighborhood: 'Bensonhurst', common_interest: '' },
];

describe('the Sale form applies the building the typed address IS, even among look-alikes', () => {
  const typeAddress = async (buildings: any[], text: string) => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings, settle: 800 });
    const el = f.d.getElementById('saleStreetAddress') as HTMLInputElement;
    el.value = text;
    el.dispatchEvent(new (f.w as any).Event('input', { bubbles: true }));
    el.dispatchEvent(new (f.w as any).Event('blur'));
    await sleep(1500);
    return f;
  };
  const val = (f: any, id: string) => (f.d.getElementById(id) as HTMLInputElement | null)?.value ?? '';

  it.each(['800 2nd Ave', '800 2nd Avenue', '800 Second Avenue'])('%j with two look-alikes in the answer: the neighborhood, borough, zip and type are filled', async (text) => {
    const f = await typeAddress([BUILDING, ...LOOKALIKES], text);
    try {
      expect(val(f, 'saleNeighborhoodFromAddress')).toBe('Turtle Bay');
      // BOTH neighborhood fields: the address area AND the Building tab's list (its option is the compact "TurtleBay"), and what the form submits (Cotality SubdivisionName)
      const hood = f.d.getElementById('saleBldgNeighborhood') as HTMLSelectElement;
      expect(hood.options[hood.selectedIndex]?.text).toBe('Turtle Bay');
      expect((f.w as any).collectSaleFormData().SubdivisionName).toMatch(/^Turtle ?Bay$/);
      expect(val(f, 'saleBorough')).toBe('Manhattan');
      expect(val(f, 'saleZipCode')).toBe('10017');
      expect((f.d.querySelector('input[name="salePropertyType"]:checked') as HTMLInputElement).value).toBe('Condo');   // from the building's Cotality CommonInterest
      expect(val(f, 'saleCountyOrParish')).toBe('New York');
      expect([...new Set(f.errors)]).toEqual([]);
    } finally { f.close(); }
  });

  it('with only look-alikes (none is the typed address) it lists them and applies none', async () => {
    const f = await typeAddress(LOOKALIKES, '800 2nd Ave');
    try {
      expect(val(f, 'saleNeighborhoodFromAddress')).toBe('');
      expect(f.d.getElementById('saleBuildingSearchResults')!.classList.contains('hidden')).toBe(false);
    } finally { f.close(); }
  });
});
