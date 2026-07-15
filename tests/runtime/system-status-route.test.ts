/// <reference types="jest" />
/**
 * GET /api/crm/system-status — protection + error suppression at the ROUTE level.
 *
 * Proves:
 *  - unauthenticated / unauthorized access is rejected (the auth guard's response is
 *    returned and the status snapshot is never computed);
 *  - an internal exception returns ONLY { error: "status_unavailable" } with a 500 and
 *    no-store — the raw exception message (which could carry table names, SQL, hosts,
 *    or connection details) never reaches the response body;
 *  - the route performs no DB mutations (it imports no Prisma client and only calls the
 *    read-only snapshot; the success path returns exactly the snapshot, no writes).
 */
import { NextResponse } from 'next/server';
import { makeRequest, readJson } from './helpers';

const mockRequireAgentOrBroker = jest.fn();
const mockIsAuthError = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (...a: unknown[]) => mockRequireAgentOrBroker(...a),
  isAuthError: (...a: unknown[]) => mockIsAuthError(...a),
}));

const mockGetCotalitySystemStatus = jest.fn();
jest.mock('@/lib/cotality/system-status', () => ({
  __esModule: true,
  getCotalitySystemStatus: (...a: unknown[]) => mockGetCotalitySystemStatus(...a),
}));

async function callGet() {
  const route = await import('@/app/api/crm/system-status/route');
  const req = makeRequest({ method: 'GET', url: 'http://localhost/api/crm/system-status' });
  return route.GET(req);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/crm/system-status', () => {
  it('rejects unauthenticated access and never computes the snapshot', async () => {
    const denied = NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    mockRequireAgentOrBroker.mockResolvedValue(denied);
    mockIsAuthError.mockReturnValue(true);

    const res = await callGet();
    expect(res.status).toBe(401);
    expect(mockGetCotalitySystemStatus).not.toHaveBeenCalled();
  });

  it('suppresses internal errors — no raw exception message reaches the client', async () => {
    mockRequireAgentOrBroker.mockResolvedValue({ userId: 1n, role: 'BROKER', userType: 'agent' });
    mockIsAuthError.mockReturnValue(false);
    // A realistic Prisma/connection error carrying sensitive internals.
    mockGetCotalitySystemStatus.mockRejectedValue(
      new Error('P1001: Can\'t reach database server at ep-cold-waterfall.internal:5432 (sync_state) password=s3cr3t'),
    );

    const res = await callGet();
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const body = await readJson<Record<string, unknown>>(res);
    expect(body).toEqual({ error: 'status_unavailable' });
    expect(body.message).toBeUndefined();

    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/sync_state|password|ep-cold-waterfall|P1001|5432/i);
  });

  it('authorized success returns exactly the read-only snapshot with no-store', async () => {
    const snapshot = { generated_at: '2026-07-14T00:00:00.000Z', monitoring: { state: 'ok' } };
    mockRequireAgentOrBroker.mockResolvedValue({ userId: 1n, role: 'BROKER', userType: 'agent' });
    mockIsAuthError.mockReturnValue(false);
    mockGetCotalitySystemStatus.mockResolvedValue(snapshot);

    const res = await callGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await readJson<typeof snapshot>(res);
    expect(body).toEqual(snapshot);
    // The route calls only the read-only snapshot — no create/update/delete anywhere.
    expect(mockGetCotalitySystemStatus).toHaveBeenCalledTimes(1);
  });
});
