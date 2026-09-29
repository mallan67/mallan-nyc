/// <reference types="jest" />
/**
 * Downstream adaptation of the impersonation consumer to the new central
 * broker-session invariant.
 *
 * The centralized session authority refuses to mint a principal-broker session
 * without MFA assurance. app/api/crm/agents/[id]/impersonate/route.ts calls the
 * ordinary primitive, so a principal-BROKER target would otherwise throw and
 * surface as an unhandled 500. It must instead be a CONTROLLED authorization
 * rejection: no session, no cookie, and no impersonate_start audit event.
 *
 * This is NOT an implementation of the separate delegated-access architecture
 * (branch edab58bb), which is untouched. ASSOCIATE_BROKER and SALESPERSON
 * delegated behaviour is unchanged and is pinned here to prove it.
 */

import { buildPrismaMock, makeRequest, readJson } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

type MockModel = { findUnique: jest.Mock; update: jest.Mock };
const db = prismaMock as unknown as { agent: MockModel };

const BROKER_CALLER = { userId: 18n, userType: 'agent', role: 'BROKER', sessionId: 's1' };

const createSessionMock = jest.fn(async () => 'session-token-abc');
const logAuditEventMock = jest.fn(async () => undefined);

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: jest.fn(async () => BROKER_CALLER),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
  createSession: createSessionMock,
  isPrincipalBrokerRole: (role: string) => role === 'BROKER' || role === 'broker',
  SESSION_COOKIE: 'session_token',
}));

jest.mock('@/lib/auth/cookie-config', () => ({
  __esModule: true,
  getSessionCookieConfig: () => ({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }),
}));

import { POST } from '@/app/api/crm/agents/[id]/impersonate/route';

function seedTarget(role: string) {
  db.agent.findUnique = jest.fn(async () => ({
    id: 21n,
    email: 'target@mallan.nyc',
    full_name: 'Target Person',
    first_name: 'Target',
    last_name: 'Person',
    role,
    status: 'active',
  }));
}

async function impersonate(role: string) {
  seedTarget(role);
  const res = await POST(makeRequest({ url: 'http://localhost/api/crm/agents/21/impersonate' }), {
    params: Promise.resolve({ id: '21' }),
  });
  return { res, body: await readJson<{ error?: string; success?: boolean }>(res) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('principal BROKER impersonation target — controlled rejection, not a 500', () => {
  it('returns a controlled 403, not a server error', async () => {
    const { res } = await impersonate('BROKER');
    expect(res.status).toBe(403);
    expect(res.status).not.toBe(500);
  });

  it('names the reason', async () => {
    const { body } = await impersonate('BROKER');
    expect(body.error).toMatch(/principal broker/i);
  });

  it('creates ZERO sessions', async () => {
    await impersonate('BROKER');
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('writes ZERO impersonate_start audit events', async () => {
    await impersonate('BROKER');
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('sets ZERO cookies', async () => {
    const { res } = await impersonate('BROKER');
    expect(res.cookies.get('session_token')).toBeUndefined();
  });

  it('applies to the legacy lowercase broker role', async () => {
    const { res } = await impersonate('broker');
    expect(res.status).toBe(403);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe('non-principal delegated targets are UNCHANGED', () => {
  it('SALESPERSON target still gets a delegated session and audit event', async () => {
    const { res } = await impersonate('SALESPERSON');
    expect(res.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(res.cookies.get('session_token')).toBeDefined();
  });

  it('ASSOCIATE_BROKER target still gets a delegated session — not broadened', async () => {
    const { res } = await impersonate('ASSOCIATE_BROKER');
    expect(res.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(res.cookies.get('session_token')).toBeDefined();
  });
});
