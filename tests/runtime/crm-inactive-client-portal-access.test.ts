/// <reference types="jest" />
/**
 * AN INACTIVE CLIENT LOSES PORTAL ACCESS — at every door, including the side doors.
 *
 * THE DEFECT. app/api/auth/login/route.ts:58 already refused an inactive AGENT
 * (`if (agent.status !== "active")` -> 403 "Account is inactive or suspended"). Seventy-five lines below,
 * the LEAD branch (:133-153) checked `password_hash` and the password — and never once referenced
 * `lead.status`. The safety concept existed in the same handler, applied to one principal type only.
 *
 * And it was not one door but six. The Lane 3A census found that an explicitly inactive client could:
 *   1. log in normally;
 *   2. keep an existing session — which validateSession SELF-EXTENDS (lib/auth/session.ts:110-117)
 *      without ever re-reading the Lead;
 *   3. receive a forgot-password email;
 *   4. reset the password AND be handed a fresh session ("so user is logged in immediately");
 *   5. be issued a brand-new portal invite;
 *   6. accept an outstanding invite — which writes `status: "active"`, silently REACTIVATING the client
 *      through an authentication endpoint;
 *   7. and be handed a session by that acceptance.
 *
 * Point 6 is the one that makes the others insufficient on their own: closing login alone would leave a
 * path that both restores access and rewrites the lifecycle state, with no licensee decision anywhere.
 *
 * SCOPE — ONE TOKEN. This packet reacts only to the explicit string "inactive". It does NOT define the
 * status vocabulary, does not treat "closed" as inactive, does not touch pipeline_stage, does not filter
 * client populations, and does not suppress automation (Safety Packet 2). The production distinct-value
 * census is still OWED — the read-only query has been refused twice — so inferring behaviour for any
 * other stored token would be encoding a guess about production data as an access control.
 *
 * WHAT MUST SURVIVE: deactivation is not deletion. Group F proves the client's identity and entire
 * history are untouched; only sessions and an outstanding invite token are revoked.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const ACTIVE_LEAD = {
  id: 7n,
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Buyer',
  password_hash: 'hashed',
  portal_role: 'buyer',
  roles: ['buyer'],
  status: 'active',
  pipeline_stage: 'active_buyer',
  agent_id: 'agent-1',
  portal_token: 'tokenhash',
  portal_token_expires_at: new Date('2099-01-01'),
};

let leadRow: Record<string, unknown> | null = { ...ACTIVE_LEAD };
let agentRow: Record<string, unknown> | null = null;

const leadFindUnique = jest.fn(async (_a?: unknown) => leadRow);
const leadFindFirst = jest.fn(async (_a?: unknown) => leadRow);
const leadUpdate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...ACTIVE_LEAD, ...args.data }));
const agentFindUnique = jest.fn(async (_a?: unknown) => agentRow);
const sessionDeleteMany = jest.fn(async (_a?: unknown) => ({ count: 1 }));
const sessionDelete = jest.fn(async (_a?: unknown) => ({}));
const sessionFindUnique = jest.fn(async (_a?: unknown) => sessionRow);
const sessionUpdate = jest.fn(async (_a?: unknown) => ({}));
const sessionCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 1n, ...args.data }));
const auditCreate = jest.fn(async (_a?: unknown) => ({ id: 1n }));

let sessionRow: Record<string, unknown> | null = null;

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findUnique: leadFindUnique, findFirst: leadFindFirst, update: leadUpdate },
  agent: { findUnique: agentFindUnique },
  session: {
    findUnique: sessionFindUnique, update: sessionUpdate, create: sessionCreate,
    delete: sessionDelete, deleteMany: sessionDeleteMany,
  },
  auditEvent: { create: auditCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

const sendEmailMock = jest.fn(async (..._a: unknown[]) => ({ success: true }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));
jest.mock('@/lib/email/templates', () => ({ __esModule: true, passwordResetEmail: () => '<html></html>' }));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));

// READONLY_MODE defaults ON (lib/auth/readonly-guard.ts:5), so every one of these routes would return 403
// before reaching the code under test. Allowing writes here is what makes the red-first fingerprint real
// rather than a guard artefact.
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

// The reset token is validated against the CURRENT password hash, so a hand-written token can never pass.
// Accepting it here is what lets the test reach the lifecycle decision instead of stopping at token
// validation — the difference between proving the defect and proving the token check works.
jest.mock('@/lib/auth/reset-token', () => ({
  __esModule: true,
  generateResetToken: () => 'reset-token',
  validateResetToken: () => ({ userId: 7n, userType: 'lead' }),
}));
jest.mock('@/lib/auth/portal-token', () => ({
  __esModule: true,
  hashPortalToken: (t: string) => t,
  isPortalTokenExpired: () => false,
  generatePortalToken: () => ({ rawToken: 'raw', tokenHash: 'tokenhash', expiresAt: new Date('2099-01-01') }),
}));

const createSessionMock = jest.fn(async (..._a: unknown[]) => 'session-token');
const verifyPasswordMock = jest.fn(async (..._a: unknown[]) => false);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  hashPassword: jest.fn(async () => 'new-hash'),
  verifyPassword: verifyPasswordMock,
  createSession: createSessionMock,
  SESSION_COOKIE: 'session_token',
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  requireAuth: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));

import { isLeadPortalAccessAllowed, isLeadExplicitlyInactive } from '@/lib/auth/lead-access';

function reset(leadOver: Record<string, unknown> = {}) {
  leadRow = { ...ACTIVE_LEAD, ...leadOver };
  agentRow = null;
  sessionRow = null;
  [leadFindUnique, leadFindFirst, leadUpdate, agentFindUnique, sessionDeleteMany, sessionDelete,
   sessionFindUnique, sessionUpdate, sessionCreate, auditCreate, sendEmailMock,
   createSessionMock, verifyPasswordMock].forEach((m) => m.mockClear());
}

const INACTIVE = { status: 'inactive' };

// reset-password decodes the token ITSELF before any lookup (route:37-52): base64url, five colon-separated
// parts, userType in {agent,lead}. A hand-written string 400s there, which would make every assertion below
// pass without ever reaching the lifecycle decision — a vacuous green. This is a correctly shaped token.
const RESET_TOKEN = Buffer.from('7:lead:ts:nonce:sig').toString('base64url');

// ─────────────────────────────────────────────────────────────────────────────
// A — the canonical decision itself
// ─────────────────────────────────────────────────────────────────────────────
describe('A · one canonical access decision, deliberately one token wide', () => {
  it('"inactive" revokes access', () => {
    expect(isLeadPortalAccessAllowed('inactive')).toBe(false);
    expect(isLeadExplicitlyInactive('inactive')).toBe(true);
  });

  it('harmless casing and whitespace do not defeat it', () => {
    for (const v of ['INACTIVE', ' Inactive ', 'Inactive', '  inactive']) {
      expect({ v, allowed: isLeadPortalAccessAllowed(v) }).toEqual({ v, allowed: false });
    }
  });

  it('NO other value is inferred — "closed" is NOT treated as inactive', () => {
    // The census showed status, pipeline_stage, transaction completion, portal access and retention are
    // already conflated in several places. Deciding "closed" here would add another assumption to
    // untangle later, and the stored distribution is still unknown.
    for (const v of ['closed', 'past', 'new', 'contacted', 'nurturing', 'active', 'archived', 'converted']) {
      expect({ v, allowed: isLeadPortalAccessAllowed(v) }).toEqual({ v, allowed: true });
    }
  });

  it('absence is not deactivation', () => {
    for (const v of [null, undefined, '', 0, {}]) {
      expect(isLeadPortalAccessAllowed(v)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — door 1: normal login
// ─────────────────────────────────────────────────────────────────────────────
describe('B · login refuses an inactive client and mints no session', () => {
  it('an inactive lead is refused 403 with NO session created', async () => {
    jest.resetModules();
    reset(INACTIVE);
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeRequest({
      method: 'POST', url: 'http://localhost/api/auth/login',
      body: { email: 'jane@example.com', password: 'pw', portalType: 'client' },
    }) as never);
    expect(res.status).toBe(403);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('POSITIVE CONTROL — a non-inactive lead is not blocked by the lifecycle veto', async () => {
    jest.resetModules();
    reset({ status: 'active' });
    const { POST } = await import('@/app/api/auth/login/route');
    const res = await POST(makeRequest({
      method: 'POST', url: 'http://localhost/api/auth/login',
      body: { email: 'jane@example.com', password: 'pw', portalType: 'client' },
    }) as never);
    // Password verification is real, so this is 401 (wrong password) — NOT the 403 lifecycle refusal.
    expect(res.status).not.toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — door 2: an existing session must not survive, and must not self-extend
// ─────────────────────────────────────────────────────────────────────────────
describe('C · a stale session for an inactive client fails closed', () => {
  const nearExpiry = () => ({
    id: 5n, token: 'sess', user_id: 7n, user_type: 'lead', role: 'buyer',
    expires_at: new Date(Date.now() + 60_000), // inside the refresh threshold
  });

  it('validateSession returns null, deletes the session, and does NOT extend it', async () => {
    jest.resetModules();
    reset(INACTIVE);
    sessionRow = nearExpiry();
    const { validateSession } = await import('@/lib/auth/session');
    const out = await validateSession('sess');
    expect(out).toBeNull();
    expect(sessionUpdate).not.toHaveBeenCalled();   // no refresh for a revoked client
    expect(sessionDelete).toHaveBeenCalled();       // and the stale session is destroyed
  });

  it('a session whose Lead no longer exists also fails closed', async () => {
    jest.resetModules();
    reset();
    leadRow = null;
    sessionRow = nearExpiry();
    const { validateSession } = await import('@/lib/auth/session');
    expect(await validateSession('sess')).toBeNull();
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it('NON-VACUITY — an active lead session still validates AND still reaches the refresh path', async () => {
    jest.resetModules();
    reset({ status: 'active' });
    sessionRow = nearExpiry();
    const { validateSession } = await import('@/lib/auth/session');
    const out = await validateSession('sess');
    expect(out).not.toBeNull();
    expect(sessionUpdate).toHaveBeenCalled();       // the refresh path is genuinely reachable
    expect(sessionDelete).not.toHaveBeenCalled();
  });

  it('AGENT session semantics are unchanged — the veto is lead-only', async () => {
    jest.resetModules();
    reset();
    sessionRow = { ...nearExpiry(), user_type: 'agent', role: 'BROKER' };
    const { validateSession } = await import('@/lib/auth/session');
    const out = await validateSession('sess');
    expect(out).not.toBeNull();
    expect(leadFindUnique).not.toHaveBeenCalled();  // no lead lookup on an agent session
    expect(sessionUpdate).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — doors 3 and 4: the password side doors
// ─────────────────────────────────────────────────────────────────────────────
describe('D · forgot-password and reset-password refuse, without leaking existence', () => {
  it('forgot-password sends NO email for an inactive lead but returns the SAME generic success', async () => {
    jest.resetModules();
    reset(INACTIVE);
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const res = await POST(makeRequest({
      method: 'POST', url: 'http://localhost/api/auth/forgot-password', body: { email: 'jane@example.com' },
    }) as never);
    // Anti-enumeration preserved: the caller cannot tell an inactive account from a missing one.
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('POSITIVE CONTROL — a non-inactive lead with a password still gets the reset email', async () => {
    jest.resetModules();
    reset({ status: 'active' });
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    await POST(makeRequest({
      method: 'POST', url: 'http://localhost/api/auth/forgot-password', body: { email: 'jane@example.com' },
    }) as never);
    expect(sendEmailMock).toHaveBeenCalled();
  });

  it('reset-password changes NO password and mints NO session for an inactive lead', async () => {
    jest.resetModules();
    reset(INACTIVE);
    const { POST } = await import('@/app/api/auth/reset-password/route');
    const res = await POST(makeRequest({
      method: 'POST', url: 'http://localhost/api/auth/reset-password',
      body: { token: RESET_TOKEN, password: 'NewPassw0rd!' },
    }) as never);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const wrotePassword = leadUpdate.mock.calls.some(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.password_hash !== undefined
    );
    expect({ wrotePassword, sessions: createSessionMock.mock.calls.length }).toEqual({ wrotePassword: false, sessions: 0 });
  });

  it('reset-password does NOT reactivate the lead as a side effect', async () => {
    jest.resetModules();
    reset(INACTIVE);
    const { POST } = await import('@/app/api/auth/reset-password/route');
    await POST(makeRequest({
      method: 'POST', url: 'http://localhost/api/auth/reset-password',
      body: { token: RESET_TOKEN, password: 'NewPassw0rd!' },
    }) as never);
    const wroteStatus = leadUpdate.mock.calls.some(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.status !== undefined
    );
    expect(wroteStatus).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — doors 5, 6 and 7: the invite paths, including the silent reactivation
// ─────────────────────────────────────────────────────────────────────────────
describe('E · invites cannot be issued to, or accepted by, an inactive client', () => {
  it('invite ISSUANCE refuses and writes no portal token', async () => {
    jest.resetModules();
    reset(INACTIVE);
    const { POST } = await import('@/app/api/crm/clients/[id]/invite/route');
    const res = await POST(
      makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/7/invite', body: {} }) as never,
      { params: Promise.resolve({ id: '7' }) } as never
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const wroteToken = leadUpdate.mock.calls.some(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.portal_token !== undefined
    );
    expect(wroteToken).toBe(false);
  });

  it('invite ACCEPTANCE refuses — and critically writes NO status:"active"', async () => {
    // This is the door that made closing login insufficient: acceptance both restored access AND
    // rewrote the lifecycle state, with no licensee decision anywhere in the path.
    jest.resetModules();
    reset(INACTIVE);
    const { POST } = await import('@/app/api/auth/invite/[token]/route');
    const res = await POST(
      makeRequest({
        method: 'POST', url: 'http://localhost/api/auth/invite/raw', body: { password: 'NewPassw0rd!' },
      }) as never,
      { params: Promise.resolve({ token: 'raw' }) } as never
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const reactivated = leadUpdate.mock.calls.some(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.status === 'active'
    );
    expect({ reactivated, sessions: createSessionMock.mock.calls.length }).toEqual({ reactivated: false, sessions: 0 });
  });

  it('invite GET validation also refuses an inactive lead', async () => {
    jest.resetModules();
    reset(INACTIVE);
    const { GET } = await import('@/app/api/auth/invite/[token]/route');
    const res = await GET(
      makeRequest({ method: 'GET', url: 'http://localhost/api/auth/invite/raw' }) as never,
      { params: Promise.resolve({ token: 'raw' }) } as never
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POSITIVE CONTROL — a non-inactive invited lead keeps the existing successful flow', async () => {
    jest.resetModules();
    reset({ status: 'new' });
    const { POST } = await import('@/app/api/auth/invite/[token]/route');
    const res = await POST(
      makeRequest({
        method: 'POST', url: 'http://localhost/api/auth/invite/raw', body: { password: 'NewPassw0rd!' },
      }) as never,
      { params: Promise.resolve({ token: 'raw' }) } as never
    );
    expect(res.status).toBeLessThan(400);
    // Its current activation behaviour is preserved, not redefined by this packet.
    const reactivated = leadUpdate.mock.calls.some(
      (c) => (c[0] as { data?: Record<string, unknown> })?.data?.status === 'active'
    );
    expect({ reactivated, sessions: createSessionMock.mock.calls.length }).toEqual({ reactivated: true, sessions: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F — deactivation revokes access and NOTHING else
// ─────────────────────────────────────────────────────────────────────────────
describe('F · setting status=inactive revokes sessions and the invite token, and preserves all history', () => {
  async function deactivate() {
    jest.resetModules();
    reset({ status: 'active' });
    jest.doMock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
    jest.doMock('@/lib/compliance/rls-enforcement', () => ({ __esModule: true, scanTextForFairHousing: () => [] }));
    jest.doMock('@/lib/lead-distribution/assign', () => ({ __esModule: true, assignLeadToAgent: jest.fn(async () => undefined) }));
    const { PATCH } = await import('@/app/api/crm/clients/[id]/route');
    return PATCH(
      makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/clients/7', body: { status: 'inactive' } }) as never,
      { params: Promise.resolve({ id: '7' }) } as never
    );
  }

  it('all sessions for that client are destroyed', async () => {
    await deactivate();
    expect(sessionDeleteMany).toHaveBeenCalled();
    const arg = sessionDeleteMany.mock.calls[0][0] as { where?: Record<string, unknown> };
    expect(arg.where).toEqual(expect.objectContaining({ user_id: 7n, user_type: 'lead' }));
  });

  it('any outstanding portal invite token is cleared', async () => {
    await deactivate();
    const cleared = leadUpdate.mock.calls.some((c) => {
      const d = (c[0] as { data?: Record<string, unknown> })?.data || {};
      return d.portal_token === null && d.portal_token_expires_at === null;
    });
    expect(cleared).toBe(true);
  });

  it('NEGATIVE PROOF — deactivation deletes no history and touches no workflow state', async () => {
    await deactivate();
    const written = leadUpdate.mock.calls.flatMap((c) =>
      Object.keys((c[0] as { data?: Record<string, unknown> })?.data || {})
    );
    // pipeline_stage is NOT changed merely because status became inactive — they are separate dimensions.
    for (const forbidden of ['pipeline_stage', 'roles', 'agent_id', 'password_hash', 'archived_at']) {
      expect({ forbidden, written: written.includes(forbidden) }).toEqual({ forbidden, written: false });
    }
    // And nothing anywhere deletes the client's records.
    const p = prismaMock as unknown as Record<string, Record<string, jest.Mock>>;
    for (const model of ['clientListingAction', 'savedSearch', 'showing', 'showingFeedback', 'comment', 'activityLog']) {
      const del = p[model] && p[model].deleteMany;
      if (del) expect({ model, calls: del.mock.calls.length }).toEqual({ model, calls: 0 });
    }
    expect((p.lead.delete && p.lead.delete.mock.calls.length) || 0).toBe(0);
  });
});
