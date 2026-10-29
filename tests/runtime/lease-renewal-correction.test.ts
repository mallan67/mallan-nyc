/// <reference types="jest" />
/**
 * The three corrections of PR #668's review (Codex, 2026-10-28), on the REAL route code with Prisma mocked:
 *
 *   1. A renewal starts after the prior term ends: the prior term's last day is the prior term's, the earliest start is
 *      the next day (a consecutive term is accepted); a start on or inside the prior term is refused with the prior
 *      term's end date.
 *   2. The duplicate check runs INSIDE the renewal's transaction, after the tenancy's advisory lock
 *      (pg_advisory_xact_lock) and before the insert — the order is asserted here; that two concurrent requests
 *      create one row is proven on a real PostgreSQL in lease-renewal.integration.test.ts.
 *   3. The signed-lease read follows every @odata.nextLink page (the provider-fetch foundation), the agent's own REBNY
 *      member id is part of the query so the agent's leases are found however many the office has, and nothing about
 *      owners, tenants or clients is sent to Cotality.
 */
import { NextRequest } from 'next/server';
import { makeRequest } from './helpers';

const activeLeaseFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const activeLeaseFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const activeLeaseFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const activeLeaseCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const activeLeaseUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const agentFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const executeRawMock = jest.fn<Promise<number>, unknown[]>(async () => 0);
const transactionMock = jest.fn<Promise<unknown>, unknown[]>();

function txClient() {
  return {
    activeLease: { findMany: activeLeaseFindManyMock, findFirst: activeLeaseFindFirstMock, findUnique: activeLeaseFindUniqueMock, create: activeLeaseCreateMock, update: activeLeaseUpdateMock },
    $executeRaw: executeRawMock,
  };
}
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    activeLease: { findMany: activeLeaseFindManyMock, findFirst: activeLeaseFindFirstMock, findUnique: activeLeaseFindUniqueMock, create: activeLeaseCreateMock, update: activeLeaseUpdateMock },
    agent: { findUnique: agentFindUniqueMock },
    listing: { findMany: listingFindManyMock },
    $transaction: (arg: unknown) => { transactionMock(arg); return Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(txClient()); },
  },
}));

const BROKER = { userId: 1n, role: 'BROKER', email: 'maya@mallan.nyc' };
const AGENT = { userId: 7n, role: 'AGENT', email: 'agent@mallan.nyc' };
const requireAgentOrBrokerMock = jest.fn<Promise<unknown>, unknown[]>(async () => BROKER);
const logAuditEventMock = jest.fn<Promise<void>, unknown[]>(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: jest.fn(async () => 'test-token'), invalidateToken: jest.fn() }));

const DAY = 86_400_000;
const PRIOR_START = new Date('2025-07-01T00:00:00Z');
const PRIOR_END = new Date('2026-06-30T00:00:00Z');
function prior(over: Record<string, unknown> = {}) {
  return {
    id: 5n, status: 'active', address: '425 Park Avenue South', unit: '4D', borough: 'Manhattan', neighborhood: null, zip: null, building_type: null,
    landlord_lead_id: 10n, tenant_lead_id: 20n, tenant_name: null, tenant_email: null, tenant_phone: null,
    monthly_rent: 4200, lease_start_date: PRIOR_START, lease_end_date: PRIOR_END, lease_type: 'standard_1yr', security_deposit: null,
    pets_allowed: false, furnished: 'unfurnished', renewal_status: 'unknown', original_rent: 4200, last_rent_increase_date: null,
    last_rent_increase_pct: null, board_required: false, agent_id: 1n, notes: null, custom_fields: null, ...over,
  };
}
const params = () => ({ params: Promise.resolve({ id: '5' }) });
const json = async (res: Response) => JSON.parse(await res.text());
const renew = async (body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/crm/active-leases/[id]/renew/route');
  return POST(makeRequest({ url: 'http://localhost/api/crm/active-leases/5/renew', body }), params());
};

beforeEach(() => {
  jest.clearAllMocks();
  activeLeaseFindFirstMock.mockResolvedValue(prior());
  activeLeaseFindManyMock.mockResolvedValue([]);
  activeLeaseFindUniqueMock.mockResolvedValue(null);
  activeLeaseCreateMock.mockImplementation(async (args: unknown) => ({ ...prior(), ...((args as { data: object }).data), id: 77n }));
  activeLeaseUpdateMock.mockImplementation(async (args: unknown) => ({ ...prior(), ...((args as { data: object }).data) }));
  requireAgentOrBrokerMock.mockResolvedValue(BROKER);
});

describe('1. a renewal starts after the prior term ends', () => {
  it('a consecutive term (the day after the prior end) is accepted: 201, the prior term closed', async () => {
    const res = await renew({ lease_start_date: '2026-07-01', lease_end_date: '2027-06-30', monthly_rent: 4400 });
    expect(res.status).toBe(201);
    const out = await json(res);
    expect(out.deduplicated).toBe(false);
    expect(out.lease.lease_start_date).toBe('2026-07-01T00:00:00.000Z');
    expect(activeLeaseUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5n }, data: expect.objectContaining({ status: 'historical', renewal_status: 'renewing' }) }));
  });

  it.each([
    ['inside the prior term', '2026-03-01', '2027-02-28'],
    ['on the prior term\'s last day', '2026-06-30', '2027-06-29'],
    ['the day the prior term began', '2025-07-01', '2026-06-30'],
  ])('a start %s is refused with the prior term\'s end date, and nothing is written', async (_what, start, end) => {
    const res = await renew({ lease_start_date: start, lease_end_date: end, monthly_rent: 4400 });
    expect(res.status).toBe(400);
    const out = await json(res);
    expect(out.prior_lease_end_date).toBe('2026-06-30');
    expect(out.error).toContain('2026-06-30');
    expect(transactionMock).not.toHaveBeenCalled();
    expect(activeLeaseCreateMock).not.toHaveBeenCalled();
    expect(activeLeaseUpdateMock).not.toHaveBeenCalled();
  });

  it('a renewal a year later (a gap between the terms) is still a term after the prior one', async () => {
    const res = await renew({ lease_start_date: '2027-09-01', lease_end_date: '2028-08-31' });
    expect(res.status).toBe(201);
  });
});

describe('2. the duplicate check is inside the locked transaction', () => {
  it('the tenancy lock is taken first, the duplicate check read inside the same transaction, then the insert', async () => {
    const res = await renew({ lease_start_date: '2026-07-01', lease_end_date: '2027-06-30', monthly_rent: 4400 });
    expect(res.status).toBe(201);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(typeof transactionMock.mock.calls[0][0]).toBe('function');                                   // an interactive transaction, not a batch
    const lockSql = String((executeRawMock.mock.calls[0]?.[0] as TemplateStringsArray | undefined)?.join('?') ?? '');
    expect(lockSql).toContain('pg_advisory_xact_lock(');
    const [lockClass, lockKey] = executeRawMock.mock.calls[0].slice(1) as [number, number];
    expect(lockClass).toBe(20261028);
    expect(Number.isInteger(lockKey)).toBe(true);
    expect(lockKey).toBeGreaterThanOrEqual(-2147483648); expect(lockKey).toBeLessThanOrEqual(2147483647);   // an int4 key
    const order = (m: jest.Mock) => m.mock.invocationCallOrder[0];
    expect(order(executeRawMock)).toBeLessThan(order(activeLeaseFindManyMock));
    expect(order(activeLeaseFindManyMock)).toBeLessThan(order(activeLeaseCreateMock));
  });

  it('the lock key is the tenancy (landlord + normalised address + unit), the same whatever the spelling', async () => {
    const { tenancyLockKey } = await import('@/lib/crm/leases');
    const a = tenancyLockKey({ landlord_lead_id: 10n, address: '425 Park Avenue South', unit: '4D' });
    expect(tenancyLockKey({ landlord_lead_id: 10n, address: '  425  park avenue south ', unit: '#4d' })).toBe(a);
    expect(tenancyLockKey({ landlord_lead_id: 10n, address: '425 Park Avenue South', unit: '4E' })).not.toBe(a);
    expect(tenancyLockKey({ landlord_lead_id: 11n, address: '425 Park Avenue South', unit: '4D' })).not.toBe(a);
  });

  it('a retry that finds the term already recorded returns it (200, deduplicated) and inserts nothing', async () => {
    activeLeaseFindManyMock.mockResolvedValue([{ id: 77n, status: 'active', address: '425 Park Avenue South', unit: '4D' }]);
    activeLeaseFindUniqueMock.mockResolvedValue({ ...prior(), id: 77n, lease_start_date: new Date('2026-07-01T00:00:00Z'), lease_end_date: new Date('2027-06-30T00:00:00Z') });
    const res = await renew({ lease_start_date: '2026-07-01', lease_end_date: '2027-06-30', monthly_rent: 4400 });
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(out.deduplicated).toBe(true);
    expect(out.lease.id).toBe('77');
    expect(activeLeaseCreateMock).not.toHaveBeenCalled();
    expect(executeRawMock).toHaveBeenCalledTimes(1);                                                    // the check ran under the lock
    expect(logAuditEventMock).toHaveBeenCalledWith('lease_renew_deduplicated', 'active_lease', '77', expect.anything(), expect.anything(), undefined);
  });
});

describe('3. the signed-lease read: every page, the agent\'s own rows, nothing about clients sent', () => {
  const row = (i: number, agent = '39361') => ({
    ListingId: `RLS${i}`, ListingKey: `${1000 + i}`, StandardStatus: 'Closed', UnparsedAddress: `${i} Park Avenue South 4D`, UnitNumber: '4D',
    ClosePrice: 4000 + i, CloseDate: '2026-06-01', ListAgentMlsId: agent, ListOfficeMlsId: '7041',
  });
  const urls: string[] = [];
  const pages = (sizes: number[], agentOfRow: (i: number) => string) => {
    let n = 0;
    const bodies = sizes.map((size, p) => {
      const value = Array.from({ length: size }, () => row(++n, agentOfRow(n)));
      const next = p < sizes.length - 1 ? `https://api.cotality.com/trestle/odata/Property?$skiptoken=page${p + 2}` : undefined;
      return { value, '@odata.count': sizes.reduce((a, b) => a + b, 0), ...(next ? { '@odata.nextLink': next } : {}) };
    });
    let served = 0;
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
      urls.push(String(url));
      const body = bodies[served++] ?? { value: [] };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    });
  };
  const get = async () => {
    const { GET } = await import('@/app/api/crm/lease-tracker/rebny-leases/route');
    return GET(new NextRequest('http://localhost/api/crm/lease-tracker/rebny-leases'));
  };
  const decoded = (u: string) => decodeURIComponent(u.replace(/\+/g, ' '));   // URLSearchParams writes a space as +
  beforeEach(() => { urls.length = 0; });

  it('the broker gets every page: 200 + 200 + 50 rows become 450 leases, with the count and has_more from the provider', async () => {
    pages([200, 200, 50], () => '39361');
    const res = await get();
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(out.count).toBe(450);
    expect(out.total).toBe(450);
    expect(out.has_more).toBe(false);
    expect(out.leases.map((l: { listing_id: string }) => l.listing_id)).toEqual(expect.arrayContaining(['RLS1', 'RLS201', 'RLS450']));
    expect(urls).toHaveLength(3);
    expect(decoded(urls[0])).toContain('$top=200');
    expect(decoded(urls[0])).toMatch(/ListOfficeMlsId eq '7041'/);
    expect(decoded(urls[0])).not.toMatch(/ListAgentMlsId eq/);                       // the broker's filter carries no agent clause (the field is only selected)
    expect(urls[1]).toContain('$skiptoken=page2');
    expect(urls[2]).toContain('$skiptoken=page3');
  });

  it('an agent\'s own member id is in the query, the agent\'s rows are found past the office\'s first page, and other agents\' rows never shown', async () => {
    requireAgentOrBrokerMock.mockResolvedValue(AGENT);
    agentFindUniqueMock.mockResolvedValue({ trestle_mls_id: '39361' });
    pages([200, 30], (i) => (i > 200 ? '39361' : '55501'));      // the provider is asked for the agent's rows; the stub still answers two pages
    const res = await get();
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(decoded(urls[0])).toMatch(/ListAgentMlsId eq '39361'/);
    expect(out.count).toBe(30);                                       // the 200 rows of another agent are not the agent's
    expect(out.leases.every((l: { list_agent: { mls_id: string } }) => l.list_agent.mls_id === '39361')).toBe(true);
    for (const u of urls) expect(decoded(u).toLowerCase()).not.toMatch(/owner|client|tenant_name|landlord|lead/);
  });

  it('an agent without a REBNY member id gets an empty answer and nothing is asked of Cotality', async () => {
    requireAgentOrBrokerMock.mockResolvedValue(AGENT);
    agentFindUniqueMock.mockResolvedValue({ trestle_mls_id: null });
    pages([5], () => '39361');
    const res = await get();
    expect(res.status).toBe(200);
    const out = await json(res);
    expect(out.count).toBe(0);
    expect(urls).toHaveLength(0);
  });

  it('a provider error is answered as 502 with the status', async () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => 'busy' }));
    const res = await get();
    expect(res.status).toBe(502);
    expect((await json(res)).error).toBe('Cotality answered 503');
  });
});
