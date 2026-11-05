/// <reference types="jest" />
/**
 * Defect A — broker password reset must not mint an authenticated broker
 * session.
 *
 * Before this fix the route validated a reset token, changed the password,
 * wrote an AuditEvent, and then called createSession(... role=BROKER ...) and
 * set the session cookie — with no MFA challenge anywhere. Possession of a
 * reset token proves control of a mailbox, not completion of broker MFA.
 *
 * The legitimate reset workflow is preserved for everyone: password still
 * changes through the canonical hash function and the AuditEvent is still
 * written. Only the broker SESSION is withheld.
 */

import { buildPrismaMock, makeRequest, readJson } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// The helper returns a dynamic Proxy, so give the models a concrete shape for
// the assertions below rather than threading `unknown` through every call.
type MockModel = { findUnique: jest.Mock; update: jest.Mock };
const db = prismaMock as unknown as { agent: MockModel; lead: MockModel };

type ResetBody = {
  success?: boolean;
  requires_signin?: boolean;
  user?: { userType?: string; role?: string };
};

const createSessionMock = jest.fn(async () => 'session-token-abc');
const logAuditEventMock = jest.fn(async () => undefined);

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  hashPassword: jest.fn(async (s: string) => `hashed:${s}`),
  createSession: createSessionMock,
  logAuditEvent: logAuditEventMock,
  // Real semantics: exact match, ASSOCIATE_BROKER excluded.
  isPrincipalBrokerRole: (role: string) => role === 'BROKER' || role === 'broker',
  SESSION_COOKIE: 'session_token',
}));

jest.mock('@/lib/auth/reset-token', () => ({
  __esModule: true,
  validateResetToken: jest.fn(() => ({ userId: 1n, userType: 'agent' })),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

jest.mock('@/lib/auth/cookie-config', () => ({
  __esModule: true,
  getSessionCookieConfig: () => ({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }),
}));

import { POST } from '@/app/api/auth/reset-password/route';

// 5 colon-separated parts, as the route's decoder requires.
function tokenFor(id: string, userType: 'agent' | 'lead') {
  return Buffer.from(`${id}:${userType}:abcd1234:9999999999999:sig`).toString('base64url');
}

function agentRow(id: bigint, role: string) {
  return {
    id,
    password_hash: 'abcd1234-existing',
    full_name: 'Test Person',
    first_name: 'Test',
    last_name: 'Person',
    email: 'person@mallan.nyc',
    role,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

async function resetAs(role: string, userType: 'agent' | 'lead' = 'agent') {
  if (userType === 'agent') {
    db.agent.findUnique = jest.fn(async () => agentRow(18n, role));
  } else {
    db.lead.findUnique = jest.fn(async () => ({
      id: 5n,
      password_hash: 'abcd1234-existing',
      first_name: 'Client',
      last_name: 'Person',
      email: 'client@example.com',
      portal_role: role,
    }));
  }
  db.agent.update = jest.fn(async (a: unknown) => a);
  db.lead.update = jest.fn(async (a: unknown) => a);

  const res = await POST(
    makeRequest({
      body: { token: tokenFor(userType === 'agent' ? '18' : '5', userType), password: 'newpassword123' },
    }),
  );
  return { res, body: await readJson<ResetBody>(res) };
}

describe('BROKER password reset — no session, no cookie', () => {
  it('changes the password and writes an AuditEvent', async () => {
    await resetAs('BROKER');
    expect(db.agent.update).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
  });

  it('creates ZERO sessions', async () => {
    await resetAs('BROKER');
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('sets ZERO authentication cookies', async () => {
    const { res } = await resetAs('BROKER');
    expect(res.cookies.get('session_token')).toBeUndefined();
  });

  it('signals that a normal sign-in (and therefore MFA) is required', async () => {
    const { body } = await resetAs('BROKER');
    expect(body.success).toBe(true);
    expect(body.requires_signin).toBe(true);
  });

  it('applies to the legacy lowercase broker role too', async () => {
    const { body } = await resetAs('broker');
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(body.requires_signin).toBe(true);
  });
});

describe('non-broker resets keep their existing behaviour', () => {
  it('SALESPERSON still receives a session and cookie', async () => {
    const { res, body } = await resetAs('SALESPERSON');
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(res.cookies.get('session_token')).toBeDefined();
    expect(body.requires_signin).toBeUndefined();
  });

  it('ASSOCIATE_BROKER is NOT treated as a principal broker', async () => {
    const { res, body } = await resetAs('ASSOCIATE_BROKER');
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(res.cookies.get('session_token')).toBeDefined();
    expect(body.requires_signin).toBeUndefined();
  });

  it('lead/client reset is unaffected', async () => {
    const { res } = await resetAs('buyer', 'lead');
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(res.cookies.get('session_token')).toBeDefined();
  });
});
