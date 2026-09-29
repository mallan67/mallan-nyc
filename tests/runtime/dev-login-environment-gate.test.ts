/// <reference types="jest" />
/**
 * dev-login is an intentional development tool and is NOT removed by the
 * broker-session invariant. It is the one permitted exception, and the
 * exception must be impossible in Production.
 *
 * Three independent layers now guard it:
 *   1. the GET handler env check (route.ts)
 *   2. the POST handler env check (route.ts)
 *   3. createSession's own defensive re-check of the same two variables
 *
 * This file proves layers 1 and 2 at route level. Layer 3 is proven in
 * lib/auth/__tests__/broker-session-assurance.test.ts.
 */

import { buildPrismaMock, makeRequest } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

type MockModel = { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
const db = prismaMock as unknown as { agent: MockModel };

const createSessionMock = jest.fn(async () => 'session-token-abc');

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  createSession: createSessionMock,
  SESSION_COOKIE: 'session_token',
}));

import { GET, POST } from '@/app/api/auth/dev-login/route';

function setEnv(nodeEnv: string, allowDevLogin?: string) {
  // Direct assignment, not Object.defineProperty: defineProperty does not take
  // effect on Node's process.env, which silently left NODE_ENV as "test" and
  // made the production case appear to pass the route guard.
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = nodeEnv;
  if (allowDevLogin === undefined) {
    delete env.ALLOW_DEV_LOGIN;
  } else {
    env.ALLOW_DEV_LOGIN = allowDevLogin;
  }
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_FLAG = process.env.ALLOW_DEV_LOGIN;

beforeEach(() => {
  jest.clearAllMocks();
  db.agent.findFirst = jest.fn(async () => ({
    id: 18n,
    email: 'maya@mallan.nyc',
    full_name: 'Maya Allan',
    first_name: 'Maya',
    role: 'BROKER',
    status: 'active',
  }));
  db.agent.findUnique = jest.fn(async () => ({
    id: 18n,
    email: 'maya@mallan.nyc',
    full_name: 'Maya Allan',
    first_name: 'Maya',
    role: 'BROKER',
    status: 'active',
  }));
  db.agent.update = jest.fn(async (a: unknown) => a);
});

afterAll(() => {
  setEnv(ORIGINAL_NODE_ENV || 'test', ORIGINAL_FLAG);
});

const req = () => makeRequest({ method: 'GET', url: 'http://localhost/api/auth/dev-login' });

describe('dev-login is blocked in production', () => {
  it('GET returns 404 in production even with the flag set', async () => {
    setEnv('production', 'true');
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('POST returns 404 in production even with the flag set', async () => {
    setEnv('production', 'true');
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe('dev-login is blocked without the exact flag', () => {
  it('GET returns 404 outside production when the flag is absent', async () => {
    setEnv('development', undefined);
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('GET returns 404 when the flag is not exactly "true"', async () => {
    setEnv('development', '1');
    const res = await GET(req());
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('POST returns 404 when the flag is not exactly "true"', async () => {
    setEnv('development', '1');
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});

describe('the explicitly permitted development path still works', () => {
  it('POST mints the development broker session when enabled', async () => {
    setEnv('development', 'true');
    const res = await POST(req());
    expect(res.status).not.toBe(404);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    // The dev_login assurance must be supplied, or the session authority
    // would refuse this broker session.
    expect(createSessionMock).toHaveBeenCalledWith(
      'agent',
      expect.anything(),
      'BROKER',
      undefined,
      undefined,
      { kind: 'dev_login' },
    );
  });
});
