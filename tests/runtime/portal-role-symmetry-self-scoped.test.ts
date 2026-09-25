/// <reference types="jest" />
/**
 * A CLIENT MAY ALWAYS SEE THEIR OWN RECORD, WHATEVER SIDE OF THE DEAL THEY ARE ON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * Two portal routes return NOTHING BUT the caller's own row:
 *
 *   /api/portal/offer-status   prisma.lead.findUnique({ where: { id: auth.userId } })
 *                              → that lead's own `actions`, each with the
 *                                address/price/type/status of the listing they
 *                                themselves inquired on. No agent name, no
 *                                internal note, no other lead.
 *
 *   /api/portal/attorney       prisma.lead.findUnique({ where: { id: auth.userId } })
 *                              → that lead's own four attorney fields. PUT writes
 *                                the same row.
 *
 * Both were gated `requirePortalRole(req, "buyer", "seller")`. So a RENTER and a
 * LANDLORD were refused 403 — on their own data.
 *
 * That is not a privacy boundary. Nothing in either response belongs to anyone
 * else, so the gate was not protecting anything; it was withholding a client's
 * record from the client. A renter who has inquired on listings — the portal
 * listings route is gated ("buyer","renter"), so they certainly can — could not
 * see the status of their own inquiries. A landlord signing a lease could not
 * record their own attorney, though the buyer on a sale could.
 *
 * The four portal roles are the canonical vocabulary already used elsewhere:
 * /api/portal/family gates on all four. No second role system is introduced
 * here — these two routes are brought onto the one that exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY WIDENING A ROLE GATE IS SAFE **HERE** SPECIFICALLY
 *
 * It is only safe because the query is self-scoped, and that is asserted below
 * rather than assumed: the test checks the `where` each route actually sends to
 * Prisma and fails if it is anything other than the caller's own id. A route
 * that joined another party's data would have to keep its narrower gate, and
 * this test would say so.
 */
process.env.READONLY_MODE = 'false';

const mockValidateSession = jest.fn();
const mockLeadFindUnique = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { lead: { findUnique: (a: unknown) => mockLeadFindUnique(a) } },
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
import { PORTAL_ROLE_VALUES } from '@/lib/api/schemas/client';

const CLIENT_ID = 501n;

/** The four real deal-side roles. "uncategorized" is a placeholder, not a side. */
const DEAL_SIDE_ROLES = ['buyer', 'renter', 'seller', 'landlord'] as const;

function asClient(portalRole: string) {
  mockValidateSession.mockResolvedValue({
    userId: CLIENT_ID,
    userType: 'lead',
    role: portalRole,
    sessionId: 's',
  });
  // requirePortalRole re-reads portal_role from the Lead row; the same mock
  // serves both that lookup and the route's own query.
  mockLeadFindUnique.mockResolvedValue({
    portal_role: portalRole,
    first_name: 'A',
    actions: [],
    attorney_name: null,
    attorney_email: null,
    attorney_phone: null,
    attorney_firm: null,
  });
}

function req(path: string) {
  const r = new NextRequest(`https://x.test${path}`);
  r.cookies.set('session_token', 'tok');
  return r;
}

async function get(mod: string, path: string) {
  const { GET } = await import(mod);
  return GET(req(path));
}

beforeEach(() => {
  jest.resetModules();
  mockValidateSession.mockReset();
  mockLeadFindUnique.mockReset();
});

describe('the deal-side roles are the canonical ones', () => {
  it.each(DEAL_SIDE_ROLES)('%s is a real portal role', (role) => {
    // Guard the guard — if the vocabulary drifts, these cases are meaningless.
    expect(PORTAL_ROLE_VALUES).toContain(role);
  });
});

describe('/api/portal/offer-status — your own inquiries', () => {
  it.each(DEAL_SIDE_ROLES)('a %s is not refused', async (role) => {
    asClient(role);
    const res = await get('@/app/api/portal/offer-status/route', '/api/portal/offer-status');
    expect(res.status).not.toBe(403);
  });

  it('and the query is scoped to the caller, which is why widening is safe', async () => {
    asClient('landlord');
    await get('@/app/api/portal/offer-status/route', '/api/portal/offer-status');
    // Every findUnique this request made must be keyed on the caller's own id.
    for (const call of mockLeadFindUnique.mock.calls) {
      expect(call[0].where).toEqual({ id: CLIENT_ID });
    }
  });
});

describe('/api/portal/attorney — your own counsel', () => {
  it.each(DEAL_SIDE_ROLES)('a %s is not refused', async (role) => {
    asClient(role);
    const res = await get('@/app/api/portal/attorney/route', '/api/portal/attorney');
    expect(res.status).not.toBe(403);
  });

  it('and the query is scoped to the caller', async () => {
    asClient('renter');
    await get('@/app/api/portal/attorney/route', '/api/portal/attorney');
    for (const call of mockLeadFindUnique.mock.calls) {
      expect(call[0].where).toEqual({ id: CLIENT_ID });
    }
  });
});

describe('the gate still exists — this is a widening, not a removal', () => {
  it.each([
    ['@/app/api/portal/offer-status/route', '/api/portal/offer-status'],
    ['@/app/api/portal/attorney/route', '/api/portal/attorney'],
  ])('%s still refuses a role outside the portal vocabulary', async (mod, path) => {
    // A lead whose portal_role is something else entirely must still be denied.
    // If the gate had simply been deleted, this would pass with a 200.
    asClient('attorney_of_record');
    const res = await get(mod, path);
    expect(res.status).toBe(403);
  });
});
