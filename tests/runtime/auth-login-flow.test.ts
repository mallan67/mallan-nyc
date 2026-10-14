/// <reference types="jest" />
/**
 * Full auth login flow runtime test.
 *
 * Covers four branches:
 *   1. Valid agent + valid password → MFA challenge issued (broker)
 *   2. Valid agent + invalid password → 401 "Invalid email or password"
 *   3. Inactive agent → 403 "Account is inactive or suspended"
 *   4. Valid lead + valid password → session cookie set with userType:lead
 *
 * Ethics training is tracked in the DB and admin panel but does NOT
 * block session creation. Compliance is enforced at listing submission.
 */

import { buildPrismaMock, makeRequest, readJson } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

const verifyPasswordMock = jest.fn(async (plain: string, hash: string) => plain === 'right');
const hashPasswordMock = jest.fn(async (s: string) => `hashed:${s}`);
const createSessionMock = jest.fn(async () => 'session-token-abc');

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  verifyPassword: verifyPasswordMock,
  hashPassword: hashPasswordMock,
  createSession: createSessionMock,
  SESSION_COOKIE: 'session_token',
}));

jest.mock('@/lib/auth/mfa', () => ({
  __esModule: true,
  MFA_SESSION_TTL_MS: 5 * 60 * 1000,
  generateOtpCode: jest.fn(() => '123456'),
  sendOtpEmail: jest.fn(async () => true),
  sendOtpSms: jest.fn(async () => true),
}));

jest.mock('@/lib/auth/cookie-config', () => ({
  __esModule: true,
  getSessionCookieConfig: () => ({ httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

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

async function callLogin(body: object) {
  const route = await import('@/app/api/auth/login/route');
  const req = makeRequest({ url: 'http://localhost/api/auth/login', body });
  return route.POST(req);
}

describe('auth login full flow', () => {
  it('case 1: valid agent + valid password → MFA challenge issued', async () => {
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ACTIVE_BROKER);
    (prismaMock as { mfaSession: { create: jest.Mock } }).mfaSession.create = jest.fn(async (args: object) => args);

    const res = await callLogin({ email: 'broker@mallan.nyc', password: 'right', portalType: 'broker' });
    expect(res.status).toBe(200);
    const body = await readJson<{ mfa_required: boolean; mfa_session: string }>(res);
    expect(body.mfa_required).toBe(true);
    expect(body.mfa_session).toBeTruthy();

    // Session cookie should NOT be set yet — MFA is required first
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('case 2: valid agent + invalid password → 401', async () => {
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ACTIVE_BROKER);
    const res = await callLogin({ email: 'broker@mallan.nyc', password: 'wrong', portalType: 'broker' });
    expect(res.status).toBe(401);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toMatch(/Invalid email or password/i);
  });

  it('case 3: inactive agent → 403', async () => {
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => ({
      ...ACTIVE_BROKER, status: 'suspended',
    }));
    const res = await callLogin({ email: 'broker@mallan.nyc', password: 'right', portalType: 'broker' });
    expect(res.status).toBe(403);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toMatch(/inactive|suspended/i);
  });

  it('case 4: valid lead + valid password → session cookie set with userType:lead', async () => {
    // No matching agent
    (prismaMock as { agent: { findUnique: jest.Mock } }).agent.findUnique = jest.fn(async () => null);
    (prismaMock as { lead: { findUnique: jest.Mock } }).lead.findUnique = jest.fn(async () => ({
      id: 99n,
      email: 'client@gmail.com',
      password_hash: 'bcrypted',
      first_name: 'Client',
      last_name: 'User',
      portal_role: 'buyer',
    }));

    const res = await callLogin({ email: 'client@gmail.com', password: 'right' });
    expect(res.status).toBe(200);
    const body = await readJson<{ user: { userType: string; role: string } }>(res);
    expect(body.user.userType).toBe('lead');
    expect(body.user.role).toBe('buyer');
    // ip + ua may be undefined in the test environment — assert positional args 1-3
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const callArgs = createSessionMock.mock.calls[0] as unknown as [string, bigint, string, ...unknown[]];
    expect(callArgs[0]).toBe('lead');
    expect(callArgs[1]).toBe(99n);
    expect(callArgs[2]).toBe('buyer');

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/session_token=session-token-abc/);
  });
});


/**
 * Server-auth redirects to /crm/login.html?id=SL-0004&redirect=%2Fcrm%2Fsale-listing.
 * The LOGIN UI must preserve the ID on its permitted same-origin return route.
 * Execute the exact production helper, not a reimplementation.
 */
describe('CRM existing-listing post-login deep link', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { resolve } = require('node:path') as typeof import('node:path');
  const html = readFileSync(resolve(__dirname, '../../public/crm/login.html'), 'utf8');
  const begin = html.indexOf('function getRedirectTarget() {');
  const end = html.indexOf('function redirectAfterLogin() {', begin);
  const source = html.slice(begin, end);
  const targetFor = (search: string): string => {
    const run = new Function('window', 'URLSearchParams', 'URL', source + '\nreturn getRedirectTarget();');
    return run({ location: { origin: 'https://mallan.nyc', search } }, URLSearchParams, URL) as string;
  };

  it('keeps SL-0004 on the Sale editor through login', () => {
    expect(targetFor('?id=SL-0004&redirect=%2Fcrm%2Fsale-listing'))
      .toBe('/crm/sale-listing?id=SL-0004');
  });
  it('does not override an already explicit listing ID', () => {
    expect(targetFor('?id=SL-0004&redirect=%2Fcrm%2Fsale-listing%3Fid%3DSL-0009'))
      .toBe('/crm/sale-listing?id=SL-0009');
  });
  it('preserves Rental editor ID but never leaks it to the dashboard', () => {
    expect(targetFor('?id=RL-0044&redirect=%2Fcrm%2Frental-listing'))
      .toBe('/crm/rental-listing?id=RL-0044');
    expect(targetFor('?id=SL-0004&redirect=%2Fcrm%2Fdashboard'))
      .toBe('/crm/dashboard');
  });
  it('rejects external URLs, path tricks, and invalid identifier characters', () => {
    expect(targetFor('?redirect=https%3A%2F%2Fevil.example')).toBe('/crm/dashboard');
    expect(targetFor('?redirect=%2F%2Fevil.example')).toBe('/crm/dashboard');
    expect(targetFor('?id=SL-0004%2Fedit&redirect=%2Fcrm%2Fsale-listing'))
      .toBe('/crm/sale-listing');
  });
  it('does not turn a failed existing-record load into an empty create workflow', () => {
    const form = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    expect(form).toContain("function loginKeepingEditorId()");
    expect(form).toContain("saleExistingEditGate");
    expect(form).toContain("failEditLoad(message)");
    expect(form).toContain("if (editGate) editGate.style.display = 'none'");
  });
});
