/// <reference types="jest" />
/**
 * /api/auth/login — MFA delivery fail-closed, at the ROUTE level.
 *
 * Complements auth-login-flow.test.ts (which proves the happy MFA challenge) and
 * lib/auth mfa-delivery.test.ts (which proves the delivery helper). This proves the
 * ROUTE wiring: when no OTP channel delivers, the route deletes the just-created
 * mfa_sessions row, returns 503, and does NOT return mfa_required — so a broken SMTP
 * config can never look like a valid login with a missing code. And when email
 * delivers, the MFA challenge still proceeds and the row is NOT deleted.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const { prisma: prismaMock, calls } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  verifyPassword: jest.fn(async (plain: string) => plain === 'right'),
  hashPassword: jest.fn(async (s: string) => `hashed:${s}`),
  createSession: jest.fn(async () => 'session-token-abc'),
  SESSION_COOKIE: 'session_token',
}));

// mock-prefixed so the jest.mock factory may reference them (out-of-scope rule).
const mockSendOtpEmail = jest.fn(async (..._a: unknown[]) => true);
const mockSendOtpSms = jest.fn(async (..._a: unknown[]) => true);
jest.mock('@/lib/auth/mfa', () => ({
  __esModule: true,
  MFA_SESSION_TTL_MS: 5 * 60 * 1000,
  generateOtpCode: jest.fn(() => '123456'),
  sendOtpEmail: (...a: unknown[]) => mockSendOtpEmail(...a),
  sendOtpSms: (...a: unknown[]) => mockSendOtpSms(...a),
}));
// NOTE: @/lib/auth/mfa-delivery is intentionally NOT mocked — the real
// deliverMfaCode runs so the route's fail-closed decision is exercised end to end.

jest.mock('@/lib/auth/cookie-config', () => ({
  __esModule: true,
  getSessionCookieConfig: () => ({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }),
}));

const ACTIVE_BROKER = {
  id: 1n,
  email: 'broker@mallan.nyc',
  password_hash: 'bcrypted',
  status: 'active',
  role: 'BROKER',
  first_name: 'Maya',
  last_name: 'Allan',
  full_name: 'Maya Allan',
  phone: '+15555550100',
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(calls)) delete calls[k];
  // Only override agent.findUnique (proxy default returns null). Leave
  // mfaSession.create/delete to the proxy's built-in fns so their call args are
  // recorded into `calls` (a plain jest.fn override would bypass that recorder).
  (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ACTIVE_BROKER);
});

async function callLogin(body: object) {
  const route = await import('@/app/api/auth/login/route');
  const req = makeRequest({ url: 'http://localhost/api/auth/login', body });
  return route.POST(req);
}

describe('/api/auth/login MFA fail-closed', () => {
  it('no channel delivers (email false + SMS false) → 503, deletes the session, no mfa_required', async () => {
    mockSendOtpEmail.mockResolvedValue(false);
    mockSendOtpSms.mockResolvedValue(false); // resolves false; must not count as delivered

    const res = await callLogin({ email: 'broker@mallan.nyc', password: 'right', portalType: 'broker' });

    expect(res.status).toBe(503);
    const body = await readJson<{ error?: string; mfa_required?: boolean; mfa_session?: string }>(res);
    expect(body.mfa_required).toBeUndefined();
    expect(body.mfa_session).toBeUndefined();
    expect(body.error).toMatch(/MFA delivery unavailable/i);

    // The just-created MFA session is deleted with the SAME token.
    const createArgs = (calls['mfaSession.create'] ?? [])[0]?.[0] as { data?: { token?: string } } | undefined;
    const deleteArgs = (calls['mfaSession.delete'] ?? [])[0]?.[0] as { where?: { token?: string } } | undefined;
    expect(calls['mfaSession.create']).toHaveLength(1);
    expect(calls['mfaSession.delete']).toHaveLength(1);
    expect(deleteArgs?.where?.token).toBe(createArgs?.data?.token);
  });

  it('email delivers → 200 mfa_required, session NOT deleted', async () => {
    mockSendOtpEmail.mockResolvedValue(true);
    mockSendOtpSms.mockResolvedValue(false);

    const res = await callLogin({ email: 'broker@mallan.nyc', password: 'right', portalType: 'broker' });

    expect(res.status).toBe(200);
    const body = await readJson<{ mfa_required?: boolean; mfa_session?: string }>(res);
    expect(body.mfa_required).toBe(true);
    expect(body.mfa_session).toBeTruthy();
    expect(calls['mfaSession.delete']).toBeUndefined();
  });
});
