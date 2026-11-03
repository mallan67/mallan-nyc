/**
 * /api/buildings/search — a building the classifier calls a house carries no ownership tag (Codex review of #688).
 *
 * lib/buildings/classify-building.ts reads a building from ALL of its listings and says "a house is a house whatever one listing's ownership tag says" (152 W 121st Street: StructureType
 * Townhouse, PropertySubType MultiFamily, and a Condominium tag on one listing). The route sent the house kind AND kept the tag the first listing carried, so the payload said both
 * "MultiFamilyTownhouse" and "Condominium". A house has no ownership tag; an apartment building keeps the one the classifier votes.
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

let id = 0;
const listing = (over: Record<string, unknown>) => ({
  ListingId: `RLS3000000${++id}`, StreetNumber: '152', StreetDirPrefix: 'W', StreetName: '121ST', StreetSuffix: 'Street', City: 'New York City', StateOrProvince: 'NY',
  CityRegion: 'Manhattan', PostalCode: '10027', StandardStatus: 'Active', SubdivisionName: 'Harlem', BuildingName: '', ...over,
});
const townhouse = { StructureType: ['Townhouse'], PropertySubType: 'MultiFamily' };

function stubCotality(records: Record<string, unknown>[]) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: records }) })) as unknown as typeof fetch;
}

let callerSeq = 0;
async function search(q: string) {
  const res = await GET(new NextRequest(`http://localhost/api/buildings/search?q=${encodeURIComponent(q)}`, { headers: { 'x-forwarded-for': `10.3.${Math.floor(++callerSeq / 250)}.${callerSeq % 250}` } }));
  return (await res.json()) as { buildings: Array<Record<string, unknown>> };
}

describe('house kind and ownership tag', () => {
  it('a townhouse with one listing tagged Condominium is a MultiFamilyTownhouse and carries no ownership tag', async () => {
    stubCotality([listing({ ...townhouse, CommonInterest: 'Condominium' }), listing({ ...townhouse, CommonInterest: 'None' }), listing({ ...townhouse })]);
    const { buildings } = await search('152 W 121st St');
    expect(buildings).toHaveLength(1);
    expect(buildings[0].building_kind).toBe('MultiFamilyTownhouse');
    expect(buildings[0].common_interest).toBe('');
  });

  it('an apartment building keeps its ownership tag and says what kind it is', async () => {
    const tower = { StructureType: ['HighRise'], PropertySubType: 'Apartment' };
    stubCotality([listing({ ...tower, CommonInterest: 'StockCooperative' }), listing({ ...tower, CommonInterest: 'StockCooperative' })]);
    const { buildings } = await search('152 W 121st St');
    expect(buildings[0].common_interest).toBe('StockCooperative');
    expect(buildings[0].building_kind).toBe('Coop');
  });
});
