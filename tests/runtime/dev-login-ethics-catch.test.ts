/// <reference types="jest" />
/**
 * dev-login runtime test.
 *
 * Verifies the dev-login route creates a session and sets the cookie
 * on the happy path. Ethics training tracking remains in the DB and
 * admin panel but no longer blocks session creation.
 */

import { NextResponse } from 'next/server';
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

const createSessionMock = jest.fn();
const SESSION_COOKIE_VALUE = 'session_token';

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  createSession: (...args: unknown[]) => createSessionMock(...args),
  SESSION_COOKIE: SESSION_COOKIE_VALUE,
}));

beforeAll(() => {
  process.env.ALLOW_DEV_LOGIN = 'true';
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'test',
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  createSessionMock.mockReset();
});

function post(): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { POST } = require('@/app/api/auth/dev-login/route') as {
    POST: (req: Request) => Promise<NextResponse>;
  };
  return POST(
    new Request('http://localhost/api/auth/dev-login', { method: 'POST' })
  );
}

describe('dev-login — session creation', () => {
  it('returns 200 + sets cookie on the happy path', async () => {
    (
      prismaMock as { agent: { findFirst: jest.Mock } }
    ).agent.findFirst = jest.fn(async () => ({
      id: 1n,
      role: 'BROKER',
      status: 'active',
      first_name: 'Maya',
      last_name: 'Allan',
      full_name: 'Maya Allan',
      email: 'maya@mallan.nyc',
    }));
    (
      prismaMock as { agent: { update: jest.Mock } }
    ).agent.update = jest.fn(async () => ({}));
    createSessionMock.mockResolvedValueOnce('happy-path-token');

    const res = await post();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(new RegExp(SESSION_COOKIE_VALUE));
  });
});
