/// <reference types="jest" />
/**
 * THE STAFF IDENTITY DOMAIN IS A BOUNDARY, NOT A STRING.
 *
 * Mallan keeps two kinds of principal in one `Session.role` field: staff roles
 * (AGENT/BROKER) and client portal roles (buyer/renter/seller/landlord).
 * `Session.userType` separately knows which domain a principal belongs to —
 * "agent" or "lead" — and the staff guards used to ignore it completely:
 *
 *     const normalizedRole = result.role.toUpperCase();
 *     if (!allowedRoles.map(r => r.toUpperCase()).includes(normalizedRole)) 403
 *
 * `Lead.portal_role` is copied verbatim into `Session.role` by EVERY login path
 * — password login, invite acceptance, password reset, OAuth — and it was an
 * unconstrained string writable by any agent on their own client. The proven
 * chain was:
 *
 *   agent sets own client's portal_role = "BROKER"
 *     -> client signs in -> Session(userType="lead", role="BROKER")
 *     -> requireBroker() passes
 *     -> POST /api/crm/agents/[id]/impersonate
 *     -> createSession("agent", target.id, target.role)
 *     -> a GENUINE staff session, bypassing the Broker MFA path
 *
 * These are BEHAVIOURAL tests. They execute the real guards against real
 * session shapes. A source-grep would have passed against the vulnerable code,
 * because the vulnerable code also contained the string "BROKER".
 */
const mockValidateSession = jest.fn();
const mockLeadFindUnique = jest.fn();

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (token: string) => mockValidateSession(token),
  };
});

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { findUnique: (args: unknown) => mockLeadFindUnique(args) },
  },
}));

import { NextRequest, NextResponse } from 'next/server';
import {
  requireAgentOrBroker,
  requireBroker,
  requirePortalRole,
  requireRole,
} from '@/lib/auth/middleware';
import { getSessionCookieConfig } from '@/lib/auth/cookie-config';
import { PORTAL_ROLE_VALUES, isPortalRole } from '@/lib/api/schemas/client';

/** A request carrying a session cookie — the guards only need it to be present. */
function req(): NextRequest {
  const r = new NextRequest('https://x.test/api/crm/anything');
  r.cookies.set('session_token', 'tok');
  return r;
}

/** Pretend the cookie resolves to this principal. */
function asPrincipal(userType: 'agent' | 'lead', role: string) {
  mockValidateSession.mockResolvedValue({
    userId: 1n,
    userType,
    role,
    sessionId: 's1',
  });
}

const status = (r: unknown) => (r instanceof NextResponse ? r.status : 200);

beforeEach(() => {
  mockValidateSession.mockReset();
  mockLeadFindUnique.mockReset();
});

describe('a LEAD can never hold staff authority, whatever its role string says', () => {
  it.each([
    ['BROKER', 'the exact escalation value'],
    ['broker', 'lower case'],
    ['BrOkEr', 'mixed case — the guard upper-cases before comparing'],
  ])('lead + role "%s" is refused by requireBroker (%s)', async (role) => {
    asPrincipal('lead', role);
    expect(status(await requireBroker(req()))).toBe(403);
  });

  it.each([['AGENT'], ['agent'], ['BROKER']])(
    'lead + role "%s" is refused by requireAgentOrBroker',
    async (role) => {
      asPrincipal('lead', role);
      expect(status(await requireAgentOrBroker(req()))).toBe(403);
    },
  );

  it('a STALE session already carrying role BROKER is powerless immediately', async () => {
    // The reason the boundary belongs in the guard and not only at the writers:
    // rows written before this fix need no migration and no backfill to become
    // harmless.
    asPrincipal('lead', 'BROKER');
    expect(status(await requireBroker(req()))).toBe(403);
    expect(status(await requireAgentOrBroker(req()))).toBe(403);
    expect(status(await requireRole(req(), 'BROKER'))).toBe(403);
  });

  it('the refusal says nothing about which role would have worked', async () => {
    // A 403 that names the expected role is a probe oracle for the vocabulary.
    asPrincipal('lead', 'BROKER');
    const res = await requireBroker(req());
    const body = await (res as NextResponse).json();
    expect(body.error).toBe('Insufficient permissions');
    expect(JSON.stringify(body)).not.toMatch(/agent|userType/i);
  });
});

describe('genuine staff access is preserved', () => {
  it('a real BROKER still passes requireBroker', async () => {
    asPrincipal('agent', 'BROKER');
    expect(status(await requireBroker(req()))).toBe(200);
  });

  it('a real AGENT still passes requireAgentOrBroker', async () => {
    asPrincipal('agent', 'AGENT');
    expect(status(await requireAgentOrBroker(req()))).toBe(200);
  });

  it('a real BROKER still passes requireAgentOrBroker', async () => {
    asPrincipal('agent', 'BROKER');
    expect(status(await requireAgentOrBroker(req()))).toBe(200);
  });

  it('a real AGENT is still refused a BROKER-only route', async () => {
    // The role check must still do its job inside the staff domain.
    asPrincipal('agent', 'AGENT');
    expect(status(await requireBroker(req()))).toBe(403);
  });
});

describe('normal client portal access is untouched', () => {
  it.each([
    ['buyer', ['buyer']],
    ['renter', ['renter']],
    ['tenant', ['renter']],
    ['seller', ['seller', 'landlord']],
    ['landlord', ['seller', 'landlord']],
  ])('a lead with portal role %s still reaches its own portal', async (portalRole, allowed) => {
    // The fix must not cost real clients their portals. requirePortalRole is a
    // different path from requireRole and was deliberately left alone.
    asPrincipal('lead', portalRole);
    mockLeadFindUnique.mockResolvedValue({ portal_role: portalRole });
    expect(status(await requirePortalRole(req(), ...allowed))).toBe(200);
  });

  it('a buyer still cannot reach the seller portal', async () => {
    asPrincipal('lead', 'buyer');
    mockLeadFindUnique.mockResolvedValue({ portal_role: 'buyer' });
    expect(status(await requirePortalRole(req(), 'seller'))).toBe(403);
  });

  it('staff still bypass portal role checks', async () => {
    asPrincipal('agent', 'AGENT');
    expect(status(await requirePortalRole(req(), 'seller'))).toBe(200);
  });
});

describe('the cookie policy classifies by identity domain, not role text', () => {
  it('a lead carrying role BROKER does not get broker cookie treatment', async () => {
    // It read `role === "BROKER"` with no userType, so a client was handed
    // strict sameSite and the 24-hour broker TTL.
    const leadCfg = getSessionCookieConfig('lead', 'BROKER');
    const brokerCfg = getSessionCookieConfig('agent', 'BROKER');
    expect(leadCfg.maxAge).not.toBe(brokerCfg.maxAge);
    expect(leadCfg.sameSite).not.toBe('strict');
  });

  it('a real broker still gets the broker policy', () => {
    const cfg = getSessionCookieConfig('agent', 'BROKER');
    expect(cfg.sameSite).toBe('strict');
    expect(cfg.maxAge).toBe(24 * 60 * 60);
  });

  it('a real agent still gets the agent policy', () => {
    const agent = getSessionCookieConfig('agent', 'AGENT');
    const broker = getSessionCookieConfig('agent', 'BROKER');
    expect(agent.maxAge).not.toBe(broker.maxAge);
  });
});

describe('the client portal vocabulary excludes staff roles', () => {
  it.each([['BROKER'], ['broker'], ['AGENT'], ['agent'], ['admin'], ['']])(
    '%p is not a portal role',
    (value) => {
      expect(isPortalRole(value)).toBe(false);
    },
  );

  it.each([...PORTAL_ROLE_VALUES])('%s is a portal role', (value) => {
    expect(isPortalRole(value)).toBe(true);
  });

  it('tenant is accepted, because requirePortalRole normalises it to renter', () => {
    // Excluding the legacy spelling would lock real clients out of their portal.
    expect(isPortalRole('tenant')).toBe(true);
    expect(isPortalRole('renter')).toBe(true);
  });

  it('the vocabulary contains no staff role at all', () => {
    for (const v of PORTAL_ROLE_VALUES) {
      expect(v.toUpperCase()).not.toBe('BROKER');
      expect(v.toUpperCase()).not.toBe('AGENT');
    }
  });
});
