/// <reference types="jest" />
/**
 * IMPERSONATION IS THE ESCALATION AMPLIFIER.
 *
 * Every other broker-only route lets a forged principal READ or WRITE as a
 * broker. This one differs in kind: it calls
 *
 *     createSession("agent", agent.id, agent.role)
 *
 * and hands back a GENUINE staff session. A principal that reaches it stops
 * impersonating a broker and simply becomes staff — without passing the Broker
 * MFA path, because MFA guards the login it never used.
 *
 * Two defects were proven here:
 *
 *   1. It trusted requireBroker alone, which — before the identity-domain fix —
 *      accepted a lead session whose role string read "BROKER".
 *   2. The TARGET was unrestricted by role, only `status === "active"` and
 *      not-self, so a broker could mint a session as ANOTHER BROKER: a lateral
 *      move into a peer's staff identity with no separate authorisation.
 *
 * The caller check is deliberately duplicated in the route rather than left
 * entirely to the guard. If requireRole is ever weakened again, this boundary
 * still holds on its own.
 */
const mockValidateSession = jest.fn();
const mockAgentFindUnique = jest.fn();
const mockCreateSession = jest.fn();
const mockLogAuditEvent = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    agent: { findUnique: (args: unknown) => mockAgentFindUnique(args) },
  },
}));

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (token: string) => mockValidateSession(token),
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  };
});

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    __esModule: true,
    ...actual,
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
  };
});

import { NextRequest } from 'next/server';

function post(agentId: string): NextRequest {
  const r = new NextRequest(`https://x.test/api/crm/agents/${agentId}/impersonate`, {
    method: 'POST',
  });
  r.cookies.set('session_token', 'tok');
  return r;
}

function asCaller(userType: 'agent' | 'lead', role: string) {
  mockValidateSession.mockResolvedValue({ userId: 1n, userType, role, sessionId: 's1' });
}

function targetAgent(role: string, status = 'active', id = 42n) {
  mockAgentFindUnique.mockResolvedValue({ id, role, status, email: 't@x.test' });
}

async function callImpersonate(agentId = '42') {
  const { POST } = await import('@/app/api/crm/agents/[id]/impersonate/route');
  return POST(post(agentId), { params: Promise.resolve({ id: agentId }) } as never);
}

beforeEach(() => {
  jest.resetModules();
  mockValidateSession.mockReset();
  mockAgentFindUnique.mockReset();
  mockCreateSession.mockReset();
  mockLogAuditEvent.mockReset();
  mockCreateSession.mockResolvedValue('new-session-token');
  mockLogAuditEvent.mockResolvedValue(undefined);
});

describe('a forged lead/BROKER cannot mint a staff session', () => {
  it('is refused with 403', async () => {
    asCaller('lead', 'BROKER');
    targetAgent('AGENT');
    expect((await callImpersonate()).status).toBe(403);
  });

  it('and no session is created — the amplifier never fires', async () => {
    // The assertion that actually matters. A 403 that still minted a token
    // would be worthless.
    asCaller('lead', 'BROKER');
    targetAgent('AGENT');
    await callImpersonate();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('the same holds for a lead carrying role AGENT', async () => {
    asCaller('lead', 'AGENT');
    targetAgent('AGENT');
    expect((await callImpersonate()).status).toBe(403);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe('the target must be an AGENT', () => {
  it('a BROKER target is refused, failing closed', async () => {
    // No product rule in this repo establishes that broker->broker
    // impersonation is required, and inferring the permission from the absence
    // of a check is how the original defect happened.
    asCaller('agent', 'BROKER');
    targetAgent('BROKER');
    expect((await callImpersonate()).status).toBe(403);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('an inactive agent is still refused', async () => {
    asCaller('agent', 'BROKER');
    targetAgent('AGENT', 'inactive');
    expect((await callImpersonate()).status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});

describe('legitimate broker impersonation still works', () => {
  it('a real BROKER impersonating an AGENT succeeds', async () => {
    asCaller('agent', 'BROKER');
    targetAgent('AGENT');
    expect((await callImpersonate()).status).toBe(200);
  });

  it('and mints the session as the TARGET agent', async () => {
    asCaller('agent', 'BROKER');
    targetAgent('AGENT');
    await callImpersonate();
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    const [userType, id, role] = mockCreateSession.mock.calls[0];
    expect(userType).toBe('agent');
    expect(id).toBe(42n);
    expect(role).toBe('AGENT');
  });

  it('and the audit event is still written — logging is not weakened', async () => {
    asCaller('agent', 'BROKER');
    targetAgent('AGENT');
    await callImpersonate();
    expect(mockLogAuditEvent).toHaveBeenCalled();
    expect(String(mockLogAuditEvent.mock.calls[0][0])).toBe('impersonate_start');
  });

  it('a plain AGENT caller cannot impersonate at all', async () => {
    // requireBroker still does its job inside the staff domain.
    asCaller('agent', 'AGENT');
    targetAgent('AGENT');
    expect((await callImpersonate()).status).toBe(403);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
