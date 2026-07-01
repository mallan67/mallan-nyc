/// <reference types="jest" />
/**
 * Trestle/Cotality open houses also carry a normalized `addressKey` (twin-safe matching), computed
 * from the same normalizeAddressKey used by the local path + banner resolver. Mocks the Cotality
 * OData feed so the /api/open-houses Trestle path returns one Public open house for RLS20099289.
 */
const getAccessTokenMock = jest.fn(async (..._a: unknown[]) => 'tok');
jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: (...a: unknown[]) => getAccessTokenMock(...a) }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { showing: { findMany: jest.fn(async () => []) } } })); // no local OHs
jest.mock('@/lib/listings/agent-info-resolver', () => ({ __esModule: true, resolveListingAgentInfo: () => ({ officeName: 'Mallan Real Estate Inc.' }), AGENT_TYPED_SELECT: {} }));
jest.mock('@/lib/idx/fetch', () => ({ __esModule: true, fetchListingMedia: jest.fn(async () => []) }));
jest.mock('@/lib/media/listing-media-resolver', () => ({ __esModule: true, resolveListingMedia: () => [] }));

import { GET } from '@/app/api/open-houses/route';

const ohRecord = {
  OpenHouseKey: 'oh1', ListingId: 'RLS20099289', ListingKey: '123',
  OpenHouseDate: '2099-07-02', OpenHouseStartTime: '2099-07-02T17:00:00-04:00', OpenHouseEndTime: '2099-07-02T18:00:00-04:00',
  OpenHouseType: 'Public',
  Property: [{
    StreetNumber: '400', StreetDirPrefix: 'E', StreetName: '90TH', StreetSuffix: 'Street', UnitNumber: '4D',
    City: 'New York', PostalCode: '10128', ListPrice: 560000, BedroomsTotal: 0, BathroomsFull: 1, BathroomsHalf: 0, LivingArea: 476,
    PropertyType: 'Residential', CommonInterest: 'Condominium', ListOfficeName: 'Mallan Real Estate Inc.', PublicRemarks: '',
    InternetEntireListingDisplayYN: null, InternetAddressDisplayYN: null, StandardStatus: 'Active', MlsStatus: 'Active', CloseDate: null,
  }],
};

beforeEach(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/odata/Property')) return { ok: true, json: async () => ({ value: [{ ListingId: 'RLS20099289', ListingKey: '123' }] }) } as unknown as Response;
    if (u.includes('/odata/OpenHouse')) return { ok: true, json: async () => ({ value: [ohRecord] }) } as unknown as Response;
    return { ok: false, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});

describe('/api/open-houses — Trestle open houses include addressKey', () => {
  it('a Cotality/Trestle open house carries a non-empty normalized addressKey', async () => {
    const res = await GET();
    const json = (await res.json()) as { openHouses: Array<Record<string, unknown>> };
    const t = json.openHouses.find((o) => o.source === 'trestle');
    expect(t).toBeTruthy();
    expect(t!.listingId).toBe('RLS20099289');
    const key = t!.addressKey as string;
    expect(key.length).toBeGreaterThan(0);
    expect(key).toContain('400');
    expect(key).toContain('90th'); // normalizeAddressKey lowercases "90TH"
  });
});
