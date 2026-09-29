/// <reference types="jest" />
/**
 * BEHAVIOURAL PROOF THAT AN OWNERLESS LISTING CANNOT GO LIVE.
 *
 * The companion file asserts the code shape; this one runs the real status
 * route against real listing rows and checks what it actually returns. A source
 * assertion cannot tell the difference between a guard that is present and a
 * guard that is reachable.
 *
 * Why the rule exists: the owner portal resolves a listing through
 * `Listing.owner_client_id` and fails closed on null. Activating an ownerless
 * Mallan listing therefore publishes a property whose seller or landlord can
 * never see it, comment on it, or be shown its activity.
 */
// Writes are globally disabled unless READONLY_MODE is explicitly "false"
// (lib/auth/readonly-guard.ts:5 — fail-safe by default). Without this every
// mutation 403s before reaching any route logic, which would make this suite
// pass for entirely the wrong reason.
process.env.READONLY_MODE = "false";

const mockValidateSession = jest.fn();
const mockListingFindUnique = jest.fn();
const mockListingUpdate = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (args: unknown) => mockListingFindUnique(args),
      update: (args: unknown) => mockListingUpdate(args),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditEvent: { create: (args: unknown) => mockAuditCreate(args) },
    listingAudit: { create: jest.fn().mockResolvedValue({}) },
    $transaction: async (fn: unknown) =>
      typeof fn === 'function' ? (fn as (tx: unknown) => unknown)({}) : fn,
  },
}));

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (t: string) => mockValidateSession(t),
  };
});

import { NextRequest } from 'next/server';

/** A Mallan-authored listing (mls_id null) in Draft. */
function mallanListing(over: Record<string, unknown> = {}) {
  return {
    id: 7n,
    listing_id: 'SL-0007',
    mls_id: null,
    owner_client_id: null,
    status: 'Draft',
    listing_type: 'sale',
    agent_id: 1n,
    raw_data: {},
    address: {},
    features: {},
    compliance: {},
    ...over,
  };
}

function asAgent(role = 'AGENT') {
  mockValidateSession.mockResolvedValue({ userId: 1n, userType: 'agent', role, sessionId: 's' });
}

async function setStatus(status: string) {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/status/route');
  const req = new NextRequest('https://x.test/api/crm/listings/7/status', {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    headers: { 'content-type': 'application/json' },
  });
  req.cookies.set('session_token', 'tok');
  return PATCH(req, { params: Promise.resolve({ id: '7' }) } as never);
}

beforeEach(() => {
  jest.resetModules();
  mockValidateSession.mockReset();
  mockListingFindUnique.mockReset();
  mockListingUpdate.mockReset();
  mockAuditCreate.mockReset();
  mockListingUpdate.mockResolvedValue(mallanListing({ status: 'Active' }));
  mockAuditCreate.mockResolvedValue({});
  asAgent();
});

describe('an ownerless Mallan listing is refused activation', () => {
  it.each([['Active'], ['ComingSoon']])('%s is refused with 409', async (target) => {
    mockListingFindUnique.mockResolvedValue(mallanListing());
    const res = await setStatus(target);
    expect(res.status).toBe(409);
  });

  it('the refusal names the reason a client can act on', async () => {
    mockListingFindUnique.mockResolvedValue(mallanListing());
    const body = await (await setStatus('Active')).json();
    expect(body.code).toBe('OWNER_REQUIRED_BEFORE_PUBLICATION');
    expect(body.error).toMatch(/seller or landlord/i);
  });

  it('and NOTHING is written — the listing stays in Draft', async () => {
    // A 409 that still updated the row would be worthless.
    mockListingFindUnique.mockResolvedValue(mallanListing());
    await setStatus('Active');
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });
});

describe('an owned Mallan listing activates normally', () => {
  it('Active is allowed once the owner is resolved', async () => {
    mockListingFindUnique.mockResolvedValue(mallanListing({ owner_client_id: 55n }));
    const res = await setStatus('Active');
    expect(res.status).not.toBe(409);
  });

  it('and the update actually runs', async () => {
    mockListingFindUnique.mockResolvedValue(mallanListing({ owner_client_id: 55n }));
    await setStatus('Active');
    expect(mockListingUpdate).toHaveBeenCalled();
  });
});

describe('provider-sourced listings are not gated by the owner rule', () => {
  it('a Cotality row with no Mallan owner still transitions', async () => {
    // It has no Mallan owner client by design. Gating it would block routine
    // status work on inventory Mallan does not own.
    mockListingFindUnique.mockResolvedValue(
      mallanListing({ mls_id: 'RLS123', owner_client_id: null }),
    );
    const res = await setStatus('Active');
    expect(res.status).not.toBe(409);
  });
});

describe('the guard does not displace the existing rules', () => {
  it('an owned listing still needs a broker for Sold', async () => {
    mockListingFindUnique.mockResolvedValue(
      mallanListing({ owner_client_id: 55n, status: 'Active' }),
    );
    asAgent('AGENT');
    const res = await setStatus('Sold');
    // Either the terminal broker rule or a transition rule refuses it — what
    // must NOT happen is a plain agent closing a sale.
    expect([403, 422, 400]).toContain(res.status);
  });
});
