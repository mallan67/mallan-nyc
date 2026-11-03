/**
 * /api/buildings/search — the TEXT "null" is no value (Maya, 2026-11-03: "the simulation should be with cotality api live").
 *
 * Walking the Sale form against the live Cotality answers showed what the fixtures never had: for 34 E 70th Street the building's TaxBlock and BuildingTaxLot came back as the text "null"
 * and the form typed "null" into the Building window's Tax Block and Tax Lot; 770 Park Avenue and 150 Charles Street answered ZoningDescription "null". The route already cleaned the text
 * "null" out of the building NAME and neighbourhood; every other text field passed it through. It is now cleaned once, for every field of every building. "0.0 x 0.0" (a lot size nobody
 * measured) is cleaned the same way. A real value is never touched.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { $queryRawUnsafe: jest.fn(async () => []), listing: { findMany: jest.fn(async () => []) } },
}));
jest.mock('@/lib/auth', () => ({
  requireAgentOrBroker: jest.fn(async () => ({ role: 'BROKER' })),
  isAuthError: () => false,
}));
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'test-token') }));

import { GET } from '@/app/api/buildings/search/route';

// The live shape of the 34 E 70th Street record (a house: no CommonInterest), with the "null" text it carries.
const house = (over: Record<string, unknown>) => ({
  ListingId: 'RLS20000001', StreetNumber: '34', StreetDirPrefix: 'E', StreetName: '70TH', StreetSuffix: 'Street', City: 'New York City', StateOrProvince: 'NY',
  CityRegion: 'Manhattan', PostalCode: '10021', StandardStatus: 'Active', SubdivisionName: 'Upper East Side', BuildingName: '', ...over,
});

function stubCotality(records: Record<string, unknown>[]) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: records }) })) as unknown as typeof fetch;
}

let callerSeq = 0;
async function search(q: string) {
  const res = await GET(new NextRequest(`http://localhost/api/buildings/search?q=${encodeURIComponent(q)}`, { headers: { 'x-forwarded-for': `10.2.${Math.floor(++callerSeq / 250)}.${callerSeq % 250}` } }));
  return (await res.json()) as { buildings: Array<Record<string, unknown>> };
}

describe('the text "null" in a Cotality record is no value', () => {
  it('TaxBlock, BuildingTaxLot (a REBNY custom key) and ZoningDescription answer as empty, not as the word', async () => {
    stubCotality([house({ TaxBlock: 'null', ZoningDescription: 'null', CustomProperty: [{ CustomFields: JSON.stringify({ BuildingTaxLot: 'null' }) }] })]);
    const { buildings } = await search('34 E 70th St');
    expect(buildings).toHaveLength(1);
    expect(buildings[0].tax_block).toBe('');
    expect(buildings[0].building_tax_lot).toBe('');
    expect(buildings[0].zoning_description).toBe('');
  });

  it('"undefined" and a lot size nobody measured ("0.0 x 0.0") are cleaned the same way', async () => {
    stubCotality([house({ TaxBlock: 'undefined', LotSizeDimensions: '0.0 x 0.0' })]);
    const { buildings } = await search('34 E 70th St');
    expect(buildings[0].tax_block).toBe('');
    expect(buildings[0].lot_size_dimensions).toBe('');
  });

  it('a real value is never touched: block, lot, zoning and a measured lot size come through as they are', async () => {
    stubCotality([house({ TaxBlock: '01335', ZoningDescription: 'C5-2', LotSizeDimensions: '25.0 x 100.5', CustomProperty: [{ CustomFields: JSON.stringify({ BuildingTaxLot: '7501' }) }] })]);
    const { buildings } = await search('34 E 70th St');
    expect(buildings[0].tax_block).toBe('01335');
    expect(buildings[0].building_tax_lot).toBe('7501');
    expect(buildings[0].zoning_description).toBe('C5-2');
    expect(buildings[0].lot_size_dimensions).toBe('25.0 x 100.5');
  });
});
