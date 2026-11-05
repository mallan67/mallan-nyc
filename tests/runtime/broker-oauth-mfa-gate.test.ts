/// <reference types="jest" />
/**
 * Defect B — OAuth identity alone must not mint a broker session.
 *
 * Google, Facebook and LinkedIn callbacks all funnel through the single shared
 * helper handleOAuthLogin(). Before this fix it found the Agent by email,
 * checked only `status`, then called createSession("agent", id, agent.role) —
 * so a principal broker signing in with Google received a full BROKER session
 * with no OTP challenge.
 *
 * Correcting the shared authority fixes all three providers at once, which is
 * why the invariant is tested here rather than three times over.
 */

import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// The helper returns a dynamic Proxy, so give the models a concrete shape for
// the assertions below rather than threading `unknown` through every call.
type MockModel = { findUnique: jest.Mock; update: jest.Mock };
const db = prismaMock as unknown as { agent: MockModel; lead: MockModel };

const createSessionMock = jest.fn(async () => 'session-token-abc');

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  createSession: createSessionMock,
  isPrincipalBrokerRole: (role: string) => role === 'BROKER' || role === 'broker',
  SESSION_COOKIE: 'session_token',
}));

import { handleOAuthLogin } from '@/lib/auth/oauth';

const PROFILE = {
  email: 'Person@Mallan.NYC',
  firstName: 'Test',
  lastName: 'Person',
  provider: 'google',
};

function seedAgent(role: string, status = 'active') {
  db.agent.findUnique = jest.fn(async () => ({
    id: 18n,
    email: 'person@mallan.nyc',
    role,
    status,
  }));
  db.agent.update = jest.fn(async (a: unknown) => a);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BROKER OAuth — fail closed, no session', () => {
  it('creates ZERO sessions for a principal broker', async () => {
    seedAgent('BROKER');
    await handleOAuthLogin(PROFILE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('redirects the broker to the standard sign-in path', async () => {
    seedAgent('BROKER');
    const res = await handleOAuthLogin(PROFILE);
    const location = res.headers.get('location') || '';
    expect(location).toContain('/sign-in');
  });

  it('never places a session token in the redirect URL', async () => {
    seedAgent('BROKER');
    const res = await handleOAuthLogin(PROFILE);
    const location = res.headers.get('location') || '';
    expect(location).not.toContain('session-token-abc');
    expect(location).not.toMatch(/token=/i);
  });

  it('sets no authentication cookie for a broker', async () => {
    seedAgent('BROKER');
    const res = await handleOAuthLogin(PROFILE);
    expect(res.cookies.get('session_token')).toBeUndefined();
  });

  it('applies to the legacy lowercase broker role', async () => {
    seedAgent('broker');
    await handleOAuthLogin(PROFILE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('holds for every provider, since all three share this helper', async () => {
    for (const provider of ['google', 'facebook', 'linkedin']) {
      jest.clearAllMocks();
      seedAgent('BROKER');
      const res = await handleOAuthLogin({ ...PROFILE, provider });
      expect(createSessionMock).not.toHaveBeenCalled();
      expect(res.headers.get('location') || '').toContain('/sign-in');
    }
  });
});

describe('non-broker OAuth remains functional', () => {
  it('SALESPERSON still receives a session', async () => {
    seedAgent('SALESPERSON');
    await handleOAuthLogin(PROFILE);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });

  it('ASSOCIATE_BROKER still receives a session — not a principal broker', async () => {
    seedAgent('ASSOCIATE_BROKER');
    await handleOAuthLogin(PROFILE);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });

  it('inactive agent gets no session regardless of role', async () => {
    seedAgent('SALESPERSON', 'suspended');
    await handleOAuthLogin(PROFILE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('existing lead/client OAuth still signs in', async () => {
    db.agent.findUnique = jest.fn(async () => null);
    db.lead.findUnique = jest.fn(async () => ({
      id: 5n,
      email: 'client@example.com',
      portal_role: 'buyer',
      phone: '555',
    }));
    await handleOAuthLogin({ ...PROFILE, email: 'client@example.com' });
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });
});
