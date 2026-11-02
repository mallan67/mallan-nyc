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

// The route limits a caller to 20 searches a minute: every call here comes from its own address, so the number of tests in this file never trips it.
let callerSeq = 0;
async function search(q: string) {
  const res = await GET(new NextRequest(`http://localhost/api/buildings/search?q=${encodeURIComponent(q)}`, { headers: { 'x-forwarded-for': `10.1.${Math.floor(++callerSeq / 250)}.${callerSeq % 250}` } }));
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
  const urlsAsked = () => (global.fetch as unknown as jest.Mock).mock.calls.map((c) => decodeURIComponent(String(c[0]).replace(/\+/g, ' ')));

  it('"800 Second Avenue" finds 800 2ND Avenue (it found nothing before)', async () => {
    queryRaw.mockResolvedValue([storedRow({ ...STORED_800_2ND, SubdivisionName: 'Turtle Bay' })]);
    stubCotality([liveRecord({}), ...NEIGHBOURS]);
    const { buildings } = await search('800 Second Avenue');
    expect(buildings.map((b) => b.address)).toEqual(['800 2ND Avenue']);
    // the stored rows are searched for the whole street under both spellings (also with the direction inside the name: "E 2ND")
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(['800', '2nd', '% 2nd', 'second', '% second']);
  });

  it('asks Cotality for both spellings and accepts either, never 15TH for 5th', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([
      liveRecord({ StreetNumber: '1030', StreetName: 'Fifth', StreetSuffix: 'Avenue', PostalCode: '10028' }),
      liveRecord({ StreetNumber: '1030', StreetName: '5TH', StreetSuffix: 'Avenue', PostalCode: '10028' }),
      liveRecord({ StreetNumber: '1030', StreetName: '15TH', StreetSuffix: 'Street', CityRegion: 'Brooklyn', PostalCode: '11230' }),
    ]);
    const { buildings } = await search('1030 5th Avenue');
    expect(urlsAsked().join('\n')).toContain("(tolower(StreetName) eq '5th' or tolower(StreetName) eq 'fifth')");
    expect(buildings.map((b) => b.streetName).sort()).toEqual(['5TH', 'Fifth']);
  });

  it('a numbered street with no spelled-out form is asked for by its exact ordinal only', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([liveRecord({ StreetNumber: '10', StreetName: '21st' })]);
    await search('10 21st Street');
    const asked = urlsAsked().join('\n');
    expect(asked).toContain("tolower(StreetName) eq '21st'");
    expect(asked).not.toContain("tolower(StreetName) eq '21st' or");
  });
});

// Codex P1 on #676: a filter applied AFTER Cotality's top-20 cap can drop the building ("1 5th Avenue" is 12,673 rows by prefix/contains, 89 exact: live 2026-11-02).
describe('the exact number and the exact street are asked of Cotality, not filtered after its 20-row cap', () => {
  const asked = () => (global.fetch as unknown as jest.Mock).mock.calls.map((c) => decodeURIComponent(String(c[0]).replace(/\+/g, ' ')));

  it('asks for StreetNumber eq (never startswith) with the exact numbered street, in one request', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([liveRecord({})]);
    await search('800 2nd Ave');
    const property = asked().filter((u) => u.includes('/odata/Property?') && u.includes('$top=20&'));
    expect(property).toHaveLength(1);
    expect(property[0]).toContain("StreetNumber eq '800'");
    expect(property[0]).toContain("(tolower(StreetName) eq '2nd' or tolower(StreetName) eq 'second')");
    expect(property[0]).not.toContain('startswith(StreetNumber');
    expect(property[0]).not.toContain('contains(tolower(StreetName)');
  });

  it('a street that is not a numbered one is still asked for by name', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([liveRecord({ StreetNumber: '400', StreetName: 'PARK', PostalCode: '10022' })]);
    await search('400 Park Avenue');
    const u = asked().find((x) => x.includes('/odata/Property?') && x.includes('$top=20&'))!;
    expect(u).toContain("StreetNumber eq '400'");
    expect(u).toContain("contains(tolower(StreetName),'park')");
  });
});

// Maya, 2026-11-02: "use the one Cotality uses as the true address". Live: every past listing of 800 2nd Avenue is StreetName "2ND", StreetSuffix "Avenue", no direction.
describe('the address is the one Cotality holds', () => {
  it('a building stored with an agent\'s spelling takes the street atoms and address line of its Cotality record', async () => {
    queryRaw.mockResolvedValue([storedRow({ ...STORED_800_2ND, StreetName: '2nd', StreetSuffix: 'Ave' })]);
    stubCotality([liveRecord({ StreetName: '2ND', StreetSuffix: 'Avenue' })]);
    const { buildings } = await search('800 Second Ave');
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toMatchObject({ address: '800 2ND Avenue', streetNumber: '800', streetDirPrefix: '', streetName: '2ND', streetSuffix: 'Avenue', streetDirSuffix: '' });
  });

  it('a building with no Cotality record keeps its stored address', async () => {
    queryRaw.mockResolvedValue([storedRow({ ...STORED_800_2ND, StreetName: '2nd' })]);
    stubCotality([]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0]).toMatchObject({ address: '800 2nd Avenue', streetName: '2nd' });
  });
});

// Live Cotality rows of 800 2nd Avenue #806 (read directly 2026-11-02): the listing agent's current Active RLS20123633 says "Turtle Bay"; her older Closed rental RLS10612741 says "Midtown East".
describe('the current listing names the neighborhood, not an older record of the same building', () => {
  const OLD_CLOSED = { ListingId: 'RLS10612741', StandardStatus: 'Closed', SubdivisionName: 'Midtown East', ModificationTimestamp: '2026-08-05T18:00:47.463-00:00' };
  const ACTIVE = { ListingId: 'RLS20123633', StandardStatus: 'Active', SubdivisionName: 'Turtle Bay', ModificationTimestamp: '2026-11-02T06:17:29.450-00:00' };

  it('Active "Turtle Bay" wins over the older Closed "Midtown East", whichever order Cotality answers in', async () => {
    for (const records of [[liveRecord(OLD_CLOSED), liveRecord(ACTIVE)], [liveRecord(ACTIVE), liveRecord(OLD_CLOSED)]]) {
      queryRaw.mockResolvedValue([]);
      stubCotality(records);
      const { buildings } = await search('800 2nd Ave');
      expect(buildings).toHaveLength(1);
      expect(buildings[0].neighborhood).toBe('Turtle Bay');
    }
  });

  it('with no Active record, the most recently modified one wins', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([
      liveRecord({ ...OLD_CLOSED, SubdivisionName: 'Older Area', ModificationTimestamp: '2026-05-14T17:28:04.523-00:00' }),
      liveRecord({ ...OLD_CLOSED, ListingId: 'RLS-NEWER', SubdivisionName: 'Newer Area', ModificationTimestamp: '2026-08-05T18:00:47.463-00:00' }),
    ]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0].neighborhood).toBe('Newer Area');
  });

  it('the stored rows are read Active first, then newest first', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([]);
    await search('800 2nd Ave');
    expect(String(queryRaw.mock.calls[0][0])).toContain("ORDER BY (status = 'Active') DESC, modification_timestamp DESC");
  });
});

// Maya, 2026-11-02: "the building has its own and unit has its own". A record's Property.TaxLot is ONE UNIT's lot (live: 50 Henry Street 7B is 1218); the building's is the
// REBNY custom key BuildingTaxLot (7502).
describe('the building\'s own tax lot', () => {
  it('is returned as building_tax_lot from the record\'s custom field, not taken from a unit\'s TaxLot', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([liveRecord({ TaxLot: '1218', TaxBlock: '00277', CustomProperty: [{ CustomFields: JSON.stringify({ BuildingTaxLot: '7502' }) }] })]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0]).toMatchObject({ tax_lot: '1218', building_tax_lot: '7502' });
  });

  it('is blank when Cotality has none (the unit\'s lot is never offered as the building\'s)', async () => {
    queryRaw.mockResolvedValue([]);
    stubCotality([liveRecord({ TaxLot: '1218' })]);
    const { buildings } = await search('800 2nd Ave');
    expect(buildings[0].building_tax_lot).toBe('');
  });
});
