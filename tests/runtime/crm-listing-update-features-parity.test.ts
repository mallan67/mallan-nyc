/// <reference types="jest" />
/**
 * An EDIT of a listing (PATCH /api/crm/listings/[id]) writes the same keys into the `features` bucket that the CREATE writes.
 *
 * Found 2026-10-09 by an independent read-only review of the pets / View change: the public listing page reads `features` (the pet policy, the view, the fireplace, the taxes ...). POST /api/crm/listings builds that
 * bucket from REBNY_FIELD_TABLES.persistenceMap (buildPersistenceRecord): every key the map marks `features: true` (66 of them). PATCH wrote it from a hand-written list of 21 keys, so a pet policy, a view, a
 * fireplace, a condition, a monthly tax ... changed after the listing was created reached raw_data only, and the public page kept the answer the listing was created with (for a listing created with the
 * earlier "UnitYes" pet words it kept those words, whatever the agent did next). The route now takes the same map.
 *
 * The real PATCH handler runs against a mocked Prisma, and the row the update would write is read.
 */
import { buildPrismaMock } from './helpers';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

const requireAgentOrBrokerMock: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> => requireAgentOrBrokerMock(req),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', realPlusUrl: 'https://realplus/x' }) }));

const FEATURE_KEYS = Object.entries(REBNY_FIELD_TABLES.persistenceMap as Record<string, { features?: boolean; removed?: boolean }>)
  .filter(([, target]) => target.features && !target.removed)
  .map(([key]) => key);

/** A Mallan-authored local draft (SL- prefix, no mls_id): the RLS gate does not run on it, so what is observed is the bucket and nothing else. */
function localListing(features: Record<string, unknown> = {}) {
  return {
    id: 101n, listing_id: 'SL-FEAT-1', mls_id: null, status: 'Draft', rls_eligible: true, listing_type: 'sale', agent_id: null, list_office_mls_id: null, last_synced_from_trestle: null,
    raw_data: {} as Record<string, unknown>, address: {}, features, agent_info: {}, internet_address_display_yn: false,
  };
}
async function patch(body: Record<string, unknown>, features: Record<string, unknown> = {}) {
  const listing = prismaMock as { listing: { findUnique: jest.Mock; update: jest.Mock } };
  listing.listing.findUnique = jest.fn(async () => localListing(features));
  listing.listing.update = jest.fn(async () => localListing(features));
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request('http://localhost/api/crm/listings/101', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: Response = await (PATCH as any)(req, { params: Promise.resolve({ id: '101' }) });
  const written = listing.listing.update.mock.calls[0]?.[0] as { data: { features?: Record<string, unknown>; raw_data?: Record<string, unknown> } } | undefined;
  return { res, written };
}

beforeEach(() => { requireAgentOrBrokerMock.mockReset().mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 'test' }); });

describe('PATCH /api/crm/listings/[id] writes every key the create route routes to features', () => {
  it('has keys to hold it to: the persistence map routes dozens of keys to the features bucket, among them the pet policy and the view', () => {
    expect(FEATURE_KEYS.length).toBeGreaterThan(50);
    for (const key of ['PetsAllowed', 'View', 'FireplaceYN', 'PropertyCondition', 'TaxMonthlyAmount', 'GarageYN', 'NewDevelopmentYN', 'SponsorUnitYN']) expect(FEATURE_KEYS).toContain(key);
  });

  it.each(FEATURE_KEYS)('%s: an edit that carries it reaches the features bucket (and raw_data)', async (key) => {
    const marker = `marker ${key}`;
    const { res, written } = await patch({ [key]: marker });
    expect(res.status).toBe(200);
    expect(written?.data.features?.[key]).toBe(marker);
    expect(written?.data.raw_data?.[key]).toBe(marker);
  });

  it('a pet policy and a view edited after creation replace the stored ones, including the earlier "Unit" words and a cleared list', async () => {
    const stored = { PetsAllowed: ['UnitYes', 'UnitCatsOK'], View: ['Park'], YearBuilt: 1985 };
    const { res, written } = await patch({ PetsAllowed: ['Yes', 'CatsOk'], View: [] }, stored);
    expect(res.status).toBe(200);
    expect(written?.data.features).toMatchObject({ PetsAllowed: ['Yes', 'CatsOk'], View: [], YearBuilt: 1985 });
  });

  it('an edit that does not carry a key leaves the stored feature as it was', async () => {
    const stored = { PetsAllowed: ['Yes'], View: ['Park'], FireplaceYN: true };
    const { res, written } = await patch({ ListPrice: 999000 }, stored);
    expect(res.status).toBe(200);
    expect(written?.data.features).toMatchObject(stored);
  });

  it('the keys the route has always carried are still carried (the map is added to them, not substituted)', async () => {
    const legacy = ['Rooms', 'ParkingFeatures', 'LaundryFeatures', 'RealEstateTax'];
    const body = Object.fromEntries(legacy.map((key) => [key, `marker ${key}`]));
    const { res, written } = await patch(body);
    expect(res.status).toBe(200);
    for (const key of legacy) expect(written?.data.features?.[key]).toBe(`marker ${key}`);
  });
});
