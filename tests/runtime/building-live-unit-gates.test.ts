/// <reference types="jest" />
/**
 * The building page also reads units LIVE from Cotality. Compliance review 2026-10-30 (gaps G1 and G3): that query never requested the
 * display flags, Permission or ListOfficeMlsId, so the gates saw every flag as absent, an explicit "do not display" never blocked a unit,
 * and Mallan's own listing returned through Cotality showed as a separate unit next to the local canonical listing.
 *
 * Driven through the real payload builder with a mocked provider response:
 *   - the live query now requests the four fields the gates read (production precedent: app/api/listings/building and the sync;
 *     all four are in data/cotality-enums.live.json, pulled from the live $metadata);
 *   - a unit is shown only if its display flags allow it (explicit false blocks, null passes: the IDX Plus convention), its address may
 *     be shown, and it is not Mallan's own RLS return-copy;
 *   - if the provider ever rejects the extended select, live units FAIL CLOSED (database units only) while building facts survive.
 */
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>) => (...args: unknown[]) => fn(...args),
  revalidateTag: jest.fn(),
}));
const findMany = jest.fn();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { listing: { findMany: (...a: unknown[]) => findMany(...a) } } }));
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: async () => 'test-token' }));
jest.mock('@/lib/buildings/acris-building-sales', () => ({
  lookupBBL: async () => null,
  fetchAcrisSales: async () => [],
  boroughFromPostalCode: () => null,
}));

import { getBuildingDataCached } from '@/lib/buildings/public-building-data';

type Rec = Record<string, unknown>;
const rec = (id: string, over: Rec = {}): Rec => ({
  ListingId: id, ListingKey: `K${id}`, StandardStatus: 'Active', ListPrice: 1_000_000, BedroomsTotal: 2, BathroomsFull: 1, BathroomsHalf: 0,
  LivingArea: 900, UnitNumber: `U${id}`, PropertyType: 'Residential', PropertySubType: 'Condominium', ListOfficeName: 'Some Office',
  ListOfficeMlsId: '4321', YearBuilt: 1931, StoriesTotal: 30, BuildingName: 'Test Tower', ...over,
});

const realFetch = global.fetch;
let propertyUrls: string[];
let scenario: (url: string) => { ok: boolean; status: number; value: Rec[] };

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  propertyUrls = [];
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/odata/Property')) propertyUrls.push(url);
    const r = url.includes('/odata/Property') ? scenario(url) : { ok: true, status: 200, value: [] };
    return { ok: r.ok, status: r.status, json: async () => ({ value: r.value }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { global.fetch = realFetch; });

const ask = () => getBuildingDataCached({ streetNumber: '15', streetName: 'Central Park West', postalCode: '10023' });
const ids = (p: { activeUnits: Array<{ mlsId: string }> }) => p.activeUnits.map((u) => u.mlsId).sort();

describe('building page: live Cotality units', () => {
  it('requests the four fields the display gates read', async () => {
    scenario = () => ({ ok: true, status: 200, value: [] });
    await ask();
    expect(propertyUrls.length).toBeGreaterThan(0);
    for (const field of ['Permission', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'ListOfficeMlsId']) {
      expect(decodeURIComponent(propertyUrls[0])).toContain(field);
    }
  });

  it('shows a unit only if its flags allow it, its address may be shown, and it is not a Mallan return-copy', async () => {
    scenario = () => ({
      ok: true, status: 200,
      value: [
        rec('RLS1'),                                                                     // flags absent (null): the IDX Plus survivor shape -> shown
        rec('RLS2', { InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true }), // explicitly allowed -> shown
        rec('RLS3', { InternetAddressDisplayYN: false }),                                // seller switched address display off -> hidden
        rec('RLS4', { InternetEntireListingDisplayYN: false }),                          // entire listing not for internet display -> hidden
        rec('RLS5', { Permission: 'Private' }),                                          // participant-only -> hidden
        rec('RLS6', { ListOfficeMlsId: '7041' }),                                        // Mallan's own listing returned through Cotality -> hidden
        rec('RLS7', { Permission: 'IDX,Public' }),                                       // ordinary multi-value permission -> shown
      ],
    });
    expect(ids(await ask())).toEqual(['RLS1', 'RLS2', 'RLS7']);
  });

  it('still builds the building facts from every record, including units it will not show', async () => {
    scenario = () => ({ ok: true, status: 200, value: [rec('RLS3', { InternetAddressDisplayYN: false, YearBuilt: 1931 })] });
    const p = await ask();
    expect(p.activeUnits).toEqual([]);
    expect(p.building.yearBuilt).toBe(1931);
  });

  it('FAILS CLOSED if the provider rejects the extended select: no live units, building facts kept, database units kept', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    findMany.mockResolvedValue([
      {
        id: 9001, listing_id: 'RLS9001', status: 'Active', list_price: 2_000_000, bedrooms_total: 3, bathrooms_full: 2, bathrooms_half: 0,
        living_area: 1500, property_type: 'Residential', property_sub_type: 'Condominium', listing_type: 'sale', features: {},
        address: { StreetNumber: '15', StreetName: 'Central Park West', PostalCode: '10023', UnitNumber: '9A', BuildingName: '' },
        primary_photo_url: null, primary_photo_r2_key: null,
      },
    ]);
    scenario = (url) =>
      decodeURIComponent(url).includes('InternetAddressDisplayYN')
        ? { ok: false, status: 400, value: [] }
        : { ok: true, status: 200, value: [rec('RLS1', { YearBuilt: 1931 }), rec('RLS3', { InternetAddressDisplayYN: false })] };
    const p = await ask();
    quiet.mockRestore();
    expect(ids(p)).toEqual(['RLS9001']);          // only the gated database unit
    expect(p.building.yearBuilt).toBe(1931);      // building facts survive from the legacy-select response
    // the second Property request is the legacy select: it does not ask for the gate fields
    expect(propertyUrls.some((u) => !decodeURIComponent(u).includes('InternetAddressDisplayYN'))).toBe(true);
  });

  it('does not use the legacy-select fallback for anything but building facts when only some requests are rejected', async () => {
    scenario = (url) =>
      decodeURIComponent(url).includes('InternetAddressDisplayYN')
        ? { ok: true, status: 200, value: [rec('RLS1')] }
        : { ok: true, status: 200, value: [rec('RLS8')] };
    expect(ids(await ask())).toEqual(['RLS1']); // extended select accepted: the legacy path is never taken
  });
});
