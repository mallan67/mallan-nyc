/// <reference types="jest" />
/**
 * GET /api/cron/rls-follow — a Mallan listing follows the Cotality record of its RLS ID (Maya, 2026-11-04: "please connect it to the rls number ... realplus is feeding to cotality and cotality
 * to me").
 *
 * The Cotality record below is the live one for RLS20123633 (read with the cron's own $select): bedrooms 8, full baths 3. SL-0010, linked to it, still held the numbers of the first pull.
 */
import { NextRequest } from 'next/server';

const findMany = jest.fn();
const updateMany = jest.fn();
const auditCreate = jest.fn(async () => ({}));
const safeRevalidateTags = jest.fn();
const dualWrite = jest.fn(async () => undefined);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (...a: unknown[]) => updateMany(...a) }, auditEvent: { create: (...a: unknown[]) => auditCreate(...(a as [])) } },
}));
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'test-token') }));
jest.mock('@/lib/idx/media-sync', () => ({ buildMallanOwnedListingWhere: () => ({ OR: [{ listing_id: { startsWith: 'SL-' } }, { listing_id: { startsWith: 'RL-' } }] }) }));
jest.mock('@/lib/cache/public-cache', () => ({
  SEARCH_CACHE_TAG: 'search',
  listingCacheTag: (id: string) => `listing:${id}`,
  buildingAndManifestInvalidationTags: () => ['building:800-2nd-10017'],
  safeRevalidateTags: (...a: unknown[]) => safeRevalidateTags(...a),
}));
jest.mock('@/lib/search/listing-search-projection', () => ({ dualWriteProjectionForListingId: (...a: unknown[]) => dualWrite(...(a as [])) }));

import { GET } from '@/app/api/cron/rls-follow/route';

const LIVE = {
  BathroomsFull: 3, LivingArea: 1482, RoomsTotal: 8, BedroomsTotal: 8, BuildingName: null, AssociationFeeFrequency: 'Monthly', ListOfficeMlsId: '7041', BathroomsHalf: 0,
  ListPrice: 1200000, StandardStatus: 'Active', TaxAnnualAmount: null, ListingId: 'RLS20123633', AssociationFee: 1588, StoriesTotal: 18, YearBuilt: 1957, ListingKey: '1194314473',
};
const SAVED_AT = new Date('2026-11-03T16:28:40.683Z');
const sl0010 = (over: Record<string, unknown> = {}) => ({
  id: BigInt(7), listing_id: 'SL-0010', status: 'Active', modification_timestamp: SAVED_AT,
  list_price: '1200000', bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0, living_area: '1482',
  features: { YearBuilt: 1957, StoriesTotal: 18, RoomsTotal: 8, AssociationFee: 1588, AssociationFeeFrequency: 'Monthly' },
  address: { StreetNumber: '800', StreetName: '2ND', PostalCode: '10017' },
  raw_data: { saleRlsId: 'RLS20123633', saleBedrooms: '0', BedroomsTotal: 0, PublicRemarks: 'Our own description.', saleStatus: 'Active' },
  ...over,
});

let asked: string[] = [];
function cotality(rows: Array<Record<string, unknown>> | Error | number) {
  asked = [];
  global.fetch = jest.fn(async (url: string) => {
    asked.push(decodeURIComponent(String(url).replace(/\+/g, ' ')));
    if (rows instanceof Error) throw rows;
    if (typeof rows === 'number') return { ok: false, status: rows, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ value: rows }) };
  }) as unknown as typeof fetch;
}
const run = async (secret: string | null = 's3cret') => {
  const res = await GET(new NextRequest('http://localhost/api/cron/rls-follow', { headers: secret === null ? {} : { authorization: `Bearer ${secret}` } }));
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret';
  for (const m of [findMany, updateMany, auditCreate, safeRevalidateTags, dualWrite]) m.mockClear();
  findMany.mockReset().mockResolvedValue([sl0010()]);
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  cotality([LIVE]);
});

describe('who may run it', () => {
  it.each([[null], ['wrong'], ['']])('refuses a caller with the secret %j, and reads nothing', async (secret) => {
    const { status } = await run(secret);
    expect(status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
  });
});

describe('SL-0010 follows RLS20123633', () => {
  it('takes bedrooms 0 -> 8 and full baths 2 -> 3, leaves everything else, and says what it did', async () => {
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ linked: 1, changed: 1, unchanged: 0, skipped: [], failed: [] });
    expect(updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: BigInt(7), modification_timestamp: SAVED_AT });          // compare-and-set: only the record that was read
    expect(data.bedrooms_total).toBe(8);
    expect(data.bathrooms_full).toBe(3);
    for (const untouched of ['list_price', 'bathrooms_half', 'living_area', 'features', 'address', 'status', 'property_type', 'rls_eligible', 'agent_id']) expect(data).not.toHaveProperty(untouched);
    expect(data.raw_data).toEqual({ saleRlsId: 'RLS20123633', saleBedrooms: 8, BedroomsTotal: 8, saleFullBaths: 3, BathroomsFull: 3, PublicRemarks: 'Our own description.', saleStatus: 'Active' });
    expect(data.modification_timestamp).toBeInstanceOf(Date);
    expect(data.modification_timestamp.getTime()).toBeGreaterThan(SAVED_AT.getTime());
  });

  it('asks Cotality, live, for the RLS ID as ListingId and for the facts only, and finds the listings it follows by their RLS link (not Draft, not closed)', async () => {
    await run();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/\/odata\/Property\?/);
    expect(asked[0]).toContain("$filter=ListingId eq 'RLS20123633'");
    const select = (asked[0].match(/\$select=([^&]+)/)?.[1] ?? '').split(',');
    expect(select).toEqual(expect.arrayContaining(['ListingId', 'ListOfficeMlsId', 'StandardStatus', 'ListPrice', 'BedroomsTotal', 'BathroomsFull']));
    for (const never of ['PublicRemarks', 'PrivateRemarks', 'ListAgentFullName', 'Permission']) expect(select).not.toContain(never);
    const where = findMany.mock.calls[0][0].where;
    expect(where.raw_data).toEqual({ path: ['saleRlsId'], string_starts_with: 'RLS' });
    expect(where.status.in).toEqual(['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']);
    expect(where.AND[0].OR.map((c: { listing_id: { startsWith: string } }) => c.listing_id.startsWith)).toEqual(['SL-', 'RL-']);
  });

  it('records the change (old and new) as an audit event, expires the public caches, and refreshes the search projection', async () => {
    await run();
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const audit = (auditCreate.mock.calls[0] as unknown as [{ data: Record<string, any> }])[0].data;
    expect(audit).toMatchObject({ action: 'rls_follow', entity_type: 'listing', entity_id: '7', user_type: 'system', user_id: null });
    expect(audit.changes).toEqual({ listing_id: 'SL-0010', rls_id: 'RLS20123633', source: 'cotality', changes: [{ field: 'BedroomsTotal', from: 0, to: 8 }, { field: 'BathroomsFull', from: 2, to: 3 }] });
    expect(safeRevalidateTags).toHaveBeenCalledTimes(1);
    expect(safeRevalidateTags.mock.calls[0][0]).toEqual(expect.arrayContaining(['listing:SL-0010', 'building:800-2nd-10017', 'search']));
    expect(dualWrite).toHaveBeenCalledWith(expect.anything(), 'SL-0010');
  });

  it('a price, a fee and a name that changed go where the Sale form puts them: price to its column, the fee to the features bucket, the name to the address bucket', async () => {
    cotality([{ ...LIVE, ListPrice: 1150000, AssociationFee: 1700, BuildingName: 'The Tudor' }]);
    await run();
    const { data } = updateMany.mock.calls[0][0];
    expect(data.list_price).toBe(1150000);
    expect(data.features).toEqual({ YearBuilt: 1957, StoriesTotal: 18, RoomsTotal: 8, AssociationFee: 1700, AssociationFeeFrequency: 'Monthly' });
    expect(data.address).toEqual({ StreetNumber: '800', StreetName: '2ND', PostalCode: '10017', BuildingName: 'The Tudor' });
    expect(data.raw_data).toMatchObject({ ListPrice: 1150000, salePrice: 1150000, AssociationFee: 1700, saleMaintCC: 1700, BuildingName: 'The Tudor', saleBldgName: 'The Tudor' });
  });

  it('a listing that already agrees with Cotality is not written, audited or revalidated (it runs every 10 minutes)', async () => {
    findMany.mockResolvedValue([sl0010({ bedrooms_total: 8, bathrooms_full: 3 })]);
    const { body } = await run();
    expect(body).toMatchObject({ linked: 1, changed: 0, unchanged: 1 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(safeRevalidateTags).not.toHaveBeenCalled();
  });

  it('with no linked listing it does not ask Cotality at all', async () => {
    findMany.mockResolvedValue([]);
    const { body } = await run();
    expect(body).toMatchObject({ linked: 0, changed: 0 });
    expect(asked).toEqual([]);
  });
});

describe('what it refuses to do', () => {
  it('Cotality unreachable (network, or HTTP 503): nothing is written, and the answer says so (502)', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);     // the job reports the failure in its log, as it should
    for (const failure of [new Error('network down'), 503]) {
      cotality(failure);
      updateMany.mockClear();
      const { status, body } = await run();
      expect(status).toBe(502);
      expect(body.written).toBe(false);
      expect(String(body.error)).toMatch(/Cotality/);
      expect(updateMany).not.toHaveBeenCalled();
      expect(safeRevalidateTags).not.toHaveBeenCalled();
    }
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it('a record that is not Mallan\'s (another listing office) never moves into a Mallan listing', async () => {
    cotality([{ ...LIVE, ListOfficeMlsId: '9999' }]);
    const { body } = await run();
    expect(body.changed).toBe(0);
    expect(body.skipped).toEqual([{ listing_id: 'SL-0010', reason: expect.stringMatching(/not a Mallan listing \(office 9999\)/) }]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('two records for one RLS ID, or none, are refused with the reason', async () => {
    cotality([LIVE, { ...LIVE, ListingKey: '1' }]);
    expect((await run()).body.skipped[0].reason).toMatch(/more than one/);
    cotality([]);
    expect((await run()).body.skipped[0].reason).toMatch(/no listing with this RLS ID/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('a listing Cotality no longer says is live (Closed, Withdrawn, Canceled, Expired) is not followed', async () => {
    for (const status of ['Closed', 'Withdrawn', 'Canceled', 'Expired']) {
      cotality([{ ...LIVE, StandardStatus: status }]);
      const { body } = await run();
      expect(body.skipped[0].reason).toMatch(new RegExp(`Cotality says the listing is ${status}`));
    }
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('a listing saved in the CRM since it was read is left alone, and is not audited or revalidated as changed', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { body } = await run();
    expect(body).toMatchObject({ changed: 0 });
    expect(body.skipped).toEqual([{ listing_id: 'SL-0010', reason: expect.stringMatching(/saved meanwhile/) }]);
    expect(auditCreate).not.toHaveBeenCalled();
    expect(safeRevalidateTags).not.toHaveBeenCalled();
  });

  it('one listing failing to write does not stop the others, and is reported', async () => {
    findMany.mockResolvedValue([sl0010(), sl0010({ id: BigInt(8), listing_id: 'SL-0011', raw_data: { saleRlsId: 'RLS20123634' } })]);
    cotality([LIVE, { ...LIVE, ListingId: 'RLS20123634', BedroomsTotal: 3 }]);
    updateMany.mockRejectedValueOnce(new Error('connection reset')).mockResolvedValueOnce({ count: 1 });
    const { body } = await run();
    expect(body.failed).toEqual([{ listing_id: 'SL-0010', error: 'connection reset' }]);
    expect(body.changed).toBe(1);
  });

  it('a stored link that is not an RLS ID is skipped, not sent to Cotality', async () => {
    findMany.mockResolvedValue([sl0010({ raw_data: { saleRlsId: 'RLSabc' } })]);
    const { body } = await run();
    expect(body.skipped).toEqual([{ listing_id: 'SL-0010', reason: 'the RLS link is not an RLS ID' }]);
    expect(asked).toEqual([]);
  });
});

describe('the schedule', () => {
  it('is registered in vercel.json every 10 minutes (the sync\'s own cadence)', () => {
    const crons = (require('../../vercel.json') as { crons: Array<{ path: string; schedule: string }> }).crons;
    expect(crons).toContainEqual({ path: '/api/cron/rls-follow', schedule: '*/10 * * * *' });
  });
});
