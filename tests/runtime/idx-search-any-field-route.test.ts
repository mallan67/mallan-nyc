/// <reference types="jest" />
/**
 * GET /api/idx/search with `fieldFilters`: the route applies the filters Cotality can evaluate in $filter, selects the extra fields it
 * needs, expands CustomProperty only when a CustomFields / CustomProperty filter is present, and filters the fetched page for the
 * fields Cotality cannot filter. Cotality itself is stubbed; the route, filter builder and post filters are the real code.
 */
import { NextRequest } from 'next/server';

const fetchMock = jest.fn();
jest.mock('@/lib/auth', () => ({ requireAgentOrBroker: jest.fn(async () => ({ ok: true })), isAuthError: () => false }));
jest.mock('@/lib/idx/auth', () => ({ hasCredentials: () => true, getAccessToken: async () => 'token' }));
jest.mock('@/lib/idx/fetch', () => ({ fetchFromTrestle: (o: unknown) => fetchMock(o) }));
jest.mock('@/lib/idx/logger', () => ({ logFetchAttempt: () => ({ complete: () => undefined }) }));
jest.mock('@/lib/buildings/upsert', () => ({ upsertBuildingFromSearchResult: async () => undefined }));

import { GET } from '@/app/api/idx/search/route';
import filterableDoc from '@/data/cotality-filterable.live.json';

const baseRecord = (n: number, extra: Record<string, unknown> = {}) => ({
  ListingKey: `K${n}`, ListingId: `RLS${n}`, SourceSystemKey: `K${n}`, StandardStatus: 'Active', PropertyType: 'Residential',
  PropertySubType: 'Apartment', ListPrice: 1000000 + n, StreetNumber: '1', StreetName: 'Main', City: 'New York City', CityRegion: 'Manhattan',
  StateOrProvince: 'NY', PostalCode: '10001', BedroomsTotal: 2, ModificationTimestamp: '2026-10-15T00:00:00Z',
  InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: null, Permission: 'IDX', ListAgentFullName: 'A B', ListOfficeName: 'Office',
  ...extra,
});

const call = async (qs: Record<string, string>) => {
  process.env.IDX_ENABLED = 'true';
  const url = new URL('https://mallan.nyc/api/idx/search');
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  const res = await GET(new NextRequest(url));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => fetchMock.mockReset());

describe('/api/idx/search fieldFilters', () => {
  it('puts a field Cotality filters into $filter and fetches normally', async () => {
    fetchMock.mockResolvedValue({ records: [baseRecord(1)], hasMore: false, totalFetched: 1, odataCount: 1 });
    const r = await call({ type: 'sale', fieldFilters: JSON.stringify([{ f: 'FireplaceYN', op: 'eq', v: true }]) });
    expect(r.status).toBe(200);
    const opts = fetchMock.mock.calls[0][0];
    expect(opts.filter).toContain('FireplaceYN eq true');
    expect(opts.expandCustomProperty).toBe(false);
    expect(r.body._meta.fieldFilters).toEqual({ rejected: [], pageFilters: 0, pageFiltered: 0 });
  });

  it('filters the fetched page for a CustomFields key, expands CustomProperty, and counts what it dropped', async () => {
    const cf = (o: object) => [{ CustomFields: JSON.stringify(o) }];
    fetchMock.mockResolvedValue({
      records: [baseRecord(1, { CustomProperty: cf({ TaxMonthlyAmount: 1500 }) }), baseRecord(2, { CustomProperty: cf({ TaxMonthlyAmount: 400 }) }), baseRecord(3)],
      hasMore: false, totalFetched: 3, odataCount: 3,
    });
    const r = await call({ type: 'sale', fieldFilters: JSON.stringify([{ f: 'TaxMonthlyAmount', op: 'ge', v: 1000 }]) });
    expect(fetchMock.mock.calls[0][0].expandCustomProperty).toBe(true);
    expect(fetchMock.mock.calls[0][0].filter).not.toContain('TaxMonthlyAmount');
    expect(r.body.listings).toHaveLength(1);
    expect(r.body._meta.fieldFilters).toMatchObject({ pageFilters: 1, pageFiltered: 2 });
  });

  it('selects a provider-blocked Property field so the page can be filtered on it', async () => {
    const blocked = filterableDoc.provider_blocked[0];
    fetchMock.mockResolvedValue({ records: [baseRecord(1, { [blocked]: 'x' }), baseRecord(2)], hasMore: false, totalFetched: 2, odataCount: 2 });
    const r = await call({ type: 'sale', fieldFilters: JSON.stringify([{ f: blocked, op: 'notnull' }]) });
    expect(fetchMock.mock.calls[0][0].select).toContain(blocked);
    expect(fetchMock.mock.calls[0][0].filter).not.toContain(blocked);
    expect(r.body.listings).toHaveLength(1);
  });

  it('reports a filter it refuses instead of silently ignoring it, and never sends it to Cotality', async () => {
    fetchMock.mockResolvedValue({ records: [baseRecord(1)], hasMore: false, totalFetched: 1, odataCount: 1 });
    const r = await call({ type: 'sale', fieldFilters: JSON.stringify([{ f: 'IDXEntireListingDisplayYN', op: 'eq', v: true }, { f: 'PetsAllowed', op: 'in', v: ['CatsOK'] }]) });
    expect(fetchMock.mock.calls[0][0].filter).not.toMatch(/IDXEntire|PetsAllowed/);
    expect(r.body._meta.fieldFilters.rejected.map((x: { field: string }) => x.field)).toEqual(['IDXEntireListingDisplayYN', 'PetsAllowed']);
  });

  it('without fieldFilters the request is the same as before', async () => {
    fetchMock.mockResolvedValue({ records: [baseRecord(1)], hasMore: false, totalFetched: 1, odataCount: 1 });
    await call({ type: 'sale' });
    expect(fetchMock.mock.calls[0][0].expandCustomProperty).toBe(false);
    expect(fetchMock.mock.calls[0][0].filter).not.toContain('FireplaceYN');
  });
});
