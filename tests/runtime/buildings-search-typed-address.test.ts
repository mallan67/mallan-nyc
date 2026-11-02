/**
 * /api/buildings/search — the typed address finds ONE building and fills what Cotality knows.
 *
 * Live production response for "800 2nd Ave" (debug=1, 2026-11-02): Cotality answered HTTP 200 with 8 records, and the route returned THREE buildings:
 * the right one (800 2ND Avenue, Manhattan, name "null", neighborhood blank), 8001 12TH Avenue and 8002 21st Avenue (Brooklyn). "2nd" is parsed to "2", so
 * `startswith(StreetNumber,'800') and contains(tolower(StreetName),'2')` matched the neighbours; with three candidates the form applied none.
 *
 * The rows below have the live shape; the neighborhood value of the 800 2nd Avenue record is a synthetic fixture (it tests the fill, it is not Cotality data).
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { $queryRawUnsafe: jest.fn(), listing: { findMany: jest.fn() } },
}));
jest.mock('@/lib/auth', () => ({
  requireAgentOrBroker: jest.fn(async () => ({ role: 'BROKER' })),
  isAuthError: () => false,
}));
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'test-token') }));

import prisma from '@/lib/prisma';
import { GET } from '@/app/api/buildings/search/route';

const queryRaw = prisma.$queryRawUnsafe as unknown as jest.Mock;

const storedRow = (address: Record<string, unknown>) => ({
  address, features: {}, raw_data: {}, custom_fields: {}, property_type: 'Residential', property_sub_type: 'Condominium',
});

let seq = 0;
const liveRecord = (over: Record<string, unknown>) => ({
  ListingId: `L${++seq}`, StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', City: 'New York City', StateOrProvince: 'NY',
  CityRegion: 'Manhattan', PostalCode: '10017', StandardStatus: 'Active', SubdivisionName: '', BuildingName: '', ...over,
});

function stubCotality(records: Record<string, unknown>[]) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: records }) })) as unknown as typeof fetch;
}

async function search(q: string) {
  const res = await GET(new NextRequest(`http://localhost/api/buildings/search?q=${encodeURIComponent(q)}`));
  return (await res.json()) as { buildings: Array<Record<string, unknown>> };
}

const STORED_800_2ND = { StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', City: 'New York City', CityRegion: 'Manhattan', PostalCode: '10017', BuildingName: 'null', CrossStreet: 'East 42nd Street/East 43rd Street' };
const NEIGHBOURS = [
  liveRecord({ StreetNumber: '8001', StreetName: '12TH', CityRegion: 'Brooklyn', PostalCode: '11228', SubdivisionName: 'Dyker Heights' }),
  liveRecord({ StreetNumber: '8002', StreetName: '21st', CityRegion: 'Brooklyn', PostalCode: '11214', SubdivisionName: 'Bensonhurst' }),
];

beforeEach(() => {
  queryRaw.mockReset();
  (prisma.listing.findMany as unknown as jest.Mock).mockReset();
});

describe('typed "800 2nd Ave"', () => {
  it('returns the one building, not 8001 12TH Avenue or 8002 21st Avenue', async () => {
    queryRaw.mockResolvedValue([storedRow(STORED_800_2ND), storedRow(STORED_800_2ND)]);
    stubCotality([liveRecord({}), ...NEIGHBOURS, liveRecord({})]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings.map((b) => b.address)).toEqual(['800 2ND Avenue']);
  });

  it('never shows the stored text "null" as the building name', async () => {
    queryRaw.mockResolvedValue([storedRow(STORED_800_2ND)]);
    stubCotality([liveRecord({}), ...NEIGHBOURS]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0].name).toBe('');
  });

  it('fills a blank neighborhood and name from the live Cotality record', async () => {
    queryRaw.mockResolvedValue([storedRow(STORED_800_2ND)]);
    stubCotality([liveRecord({ SubdivisionName: 'Fixture Neighborhood', BuildingName: 'Fixture Tower' }), ...NEIGHBOURS]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toMatchObject({ neighborhood: 'Fixture Neighborhood', subdivisionName: 'Fixture Neighborhood', name: 'Fixture Tower' });
  });

  it('keeps a stored neighborhood and name: the live record only fills blanks', async () => {
    queryRaw.mockResolvedValue([storedRow({ ...STORED_800_2ND, BuildingName: 'Stored Name', SubdivisionName: 'Stored Area' })]);
    stubCotality([liveRecord({ SubdivisionName: 'Other Area', BuildingName: 'Other Name' })]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0]).toMatchObject({ neighborhood: 'Stored Area', name: 'Stored Name' });
  });

  it('leaves the neighborhood blank when Cotality has none (nothing is invented)', async () => {
    queryRaw.mockResolvedValue([storedRow(STORED_800_2ND)]);
    stubCotality([liveRecord({}), ...NEIGHBOURS]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0].neighborhood).toBe('');
  });
});

describe('other typed addresses are unchanged', () => {
  it('"333 East 46th Street" keeps E 46TH and drops E 146TH', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([
      liveRecord({ StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'Street', PostalCode: '10017' }),
      liveRecord({ StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '146TH', StreetSuffix: 'Street', CityRegion: 'Bronx', PostalCode: '10451' }),
    ]);
    const { buildings } = await search('333 East 46th Street');
    expect(buildings.map((b) => b.streetName)).toEqual(['46TH']);
  });

  it('"400 Park Avenue" (not a numbered street) keeps every served PARK record of that number', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([
      liveRecord({ StreetNumber: '400', StreetName: 'PARK', PostalCode: '10022' }),
      liveRecord({ StreetNumber: '4000', StreetName: 'PARK', CityRegion: 'Bronx', PostalCode: '10471' }),
    ]);
    const { buildings } = await search('400 Park Avenue');
    expect(buildings.map((b) => b.streetNumber)).toEqual(['400']);
  });
});

// Live stored rows of 800 2nd Avenue #806 (CRM, 2026-11-02): the OLD Closed record (RLS10612741) has no area and BuildingName "null"; the Active one (RLS20123633) carries SubdivisionName "Turtle Bay".
describe('the stored row met first is an old closed record', () => {
  const CLOSED_FIRST = storedRow({ ...STORED_800_2ND, BuildingName: 'null' });
  const ACTIVE_SECOND = storedRow({ ...STORED_800_2ND, BuildingName: '', SubdivisionName: 'Turtle Bay' });

  it('takes the neighborhood from the Active stored row, even if Cotality returns nothing', async () => {
    queryRaw.mockResolvedValue([CLOSED_FIRST, ACTIVE_SECOND]);
    stubCotality([]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toMatchObject({ neighborhood: 'Turtle Bay', subdivisionName: 'Turtle Bay', name: '' });
  });
});

describe('a numbered street is spelled out or in digits (live: "1030 Fifth Avenue" and "16 5TH Avenue" are both served)', () => {
  const urlsAsked = () => (global.fetch as unknown as jest.Mock).mock.calls.map((c) => decodeURIComponent(String(c[0])));

  it('"800 Second Avenue" finds 800 2ND Avenue (it found nothing before)', async () => {
    queryRaw.mockResolvedValue([storedRow({ ...STORED_800_2ND, SubdivisionName: 'Turtle Bay' })]);
    stubCotality([liveRecord({}), ...NEIGHBOURS]);
    const { buildings } = await search('800 Second Avenue');
    expect(buildings.map((b) => b.address)).toEqual(['800 2ND Avenue']);
    // the stored rows are searched under both spellings
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(['800', '%2%', '%second%']);
  });

  it('asks Cotality for both spellings and accepts either, never 15TH for 5th', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([
      liveRecord({ StreetNumber: '1030', StreetName: 'Fifth', StreetSuffix: 'Avenue', PostalCode: '10028' }),
      liveRecord({ StreetNumber: '1030', StreetName: '5TH', StreetSuffix: 'Avenue', PostalCode: '10028' }),
      liveRecord({ StreetNumber: '1030', StreetName: '15TH', StreetSuffix: 'Street', CityRegion: 'Brooklyn', PostalCode: '11230' }),
    ]);
    const { buildings } = await search('1030 5th Avenue');
    const asked = urlsAsked().join('\n');
    expect(asked).toContain("contains(tolower(StreetName),'5')");
    expect(asked).toContain("contains(tolower(StreetName),'fifth')");
    expect(buildings.map((b) => b.streetName).sort()).toEqual(['5TH', 'Fifth']);
  });

  it('a street with no spelled-out form is asked for once', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([liveRecord({ StreetNumber: '10', StreetName: '21st' })]);
    await search('10 21st Street');
    expect(urlsAsked().filter((u) => u.includes('/odata/Property?') && u.includes('tolower(StreetName)')).some((u) => u.includes("'second'"))).toBe(false);
  });
});
