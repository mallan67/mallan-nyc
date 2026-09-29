/// <reference types="jest" />
/**
 * AN INVITE MUST BE SCOPED TO THE AGENT'S OWN CLIENT.
 *
 * `POST /api/auth/invite` guarded with requireAgentOrBroker — a ROLE check —
 * and then loaded the target lead by raw id:
 *
 *     prisma.lead.findUnique({ where: { id: BigInt(leadId) } })
 *
 * with no `agent_id` filter and no broker branch. It then rewrote that lead's
 * portal_role and sent a portal-invite email carrying a working 72-hour
 * credential to them.
 *
 * So any authenticated agent could repoint and invite ANOTHER AGENT'S CLIENT.
 *
 * Stated precisely: the acting agent never sees the raw token — it is not in
 * the response — so this is not credential theft. It is an unauthorised
 * mutation of another agent's client record plus unsolicited contact with that
 * client, which is a brokerage-conduct surface as much as a technical one.
 *
 * The sibling route `app/api/crm/clients/[id]/invite` already scoped exactly
 * this way. This one simply never did.
 */
process.env.READONLY_MODE = 'false';

const mockValidateSession = jest.fn();
const mockLeadFindUnique = jest.fn();
const mockLeadUpdate = jest.fn();
const mockAgentFindUnique = jest.fn();
const mockSendEmail = jest.fn();
const mockLogAuditEvent = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: {
      findUnique: (a: unknown) => mockLeadFindUnique(a),
      update: (a: unknown) => mockLeadUpdate(a),
    },
    agent: { findUnique: (a: unknown) => mockAgentFindUnique(a) },
  },
}));

jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
}));

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (t: string) => mockValidateSession(t),
  };
});

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    __esModule: true,
    ...actual,
    logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a),
  };
});

import { NextRequest } from 'next/server';

const AGENT_A = 1n;
const AGENT_B = 2n;

function asAgent(userId: bigint, role = 'AGENT') {
  mockValidateSession.mockResolvedValue({ userId, userType: 'agent', role, sessionId: 's' });
}

/** A lead belonging to `ownerAgentId`. */
function leadOwnedBy(ownerAgentId: bigint) {
  mockLeadFindUnique.mockResolvedValue({
    id: 99n,
    agent_id: ownerAgentId,
    email: 'client@x.test',
    first_name: 'A',
    last_name: 'B',
  });
}

async function invite(portalRole = 'buyer') {
  const { POST } = await import('@/app/api/auth/invite/route');
  const req = new NextRequest('https://x.test/api/auth/invite', {
    method: 'POST',
    body: JSON.stringify({ leadId: '99', portalRole }),
    headers: { 'content-type': 'application/json' },
  });
  req.cookies.set('session_token', 'tok');
  return POST(req);
}

beforeEach(() => {
  jest.resetModules();
  for (const m of [
    mockValidateSession,
    mockLeadFindUnique,
    mockLeadUpdate,
    mockAgentFindUnique,
    mockSendEmail,
    mockLogAuditEvent,
  ]) {
    m.mockReset();
  }
  mockLeadUpdate.mockResolvedValue({});
  mockAgentFindUnique.mockResolvedValue({ first_name: 'Ag', last_name: 'Ent' });
  mockSendEmail.mockResolvedValue({ ok: true });
  mockLogAuditEvent.mockResolvedValue(undefined);
});

describe("an agent cannot invite another agent's client", () => {
  it('is refused with 403', async () => {
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_B);
    expect((await invite()).status).toBe(403);
  });

  it("and the victim's portal_role is NOT rewritten", async () => {
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_B);
    await invite();
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it('and NO email reaches the client — no unsolicited contact', async () => {
    // The part that is a conduct problem, not only a data problem.
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_B);
    await invite();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('legitimate invites still work', () => {
  it('an agent may invite their OWN client', async () => {
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_A);
    const res = await invite();
    expect(res.status).not.toBe(403);
    expect(mockLeadUpdate).toHaveBeenCalled();
  });

  it('a BROKER has brokerage scope', async () => {
    asAgent(AGENT_A, 'BROKER');
    leadOwnedBy(AGENT_B);
    const res = await invite();
    expect(res.status).not.toBe(403);
  });
});

describe('the portal vocabulary is the canonical one', () => {
  it('renter is accepted — its own list used to omit it', async () => {
    // requirePortalRole normalises tenant -> renter and both spellings exist on
    // real rows, so a renter client could not be invited to their own portal.
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_A);
    expect((await invite('renter')).status).not.toBe(400);
  });

  it('tenant is still accepted — the legacy spelling is not broken', async () => {
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_A);
    expect((await invite('tenant')).status).not.toBe(400);
  });

  it.each([['BROKER'], ['AGENT'], ['superuser']])('%s is refused', async (bad) => {
    asAgent(AGENT_A);
    leadOwnedBy(AGENT_A);
    expect((await invite(bad)).status).toBe(400);
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });
});
