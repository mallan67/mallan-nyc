/// <reference types="jest" />
/**
 * dev-login EthicsTrainingExpiredError catch (UCBA Art. III §6, C4c).
 *
 * Without this catch, when a broker's ethics training is expired,
 * `createSession()` throws and the dev-login route returns a generic
 * 500. This test pins down the contract that mirrors what the real
 * /api/auth/login and /api/auth/mfa/verify routes already do — surface
 * the error as a 403 with code, reason, and a retraining URL the UI
 * can show.
 */

import { NextResponse } from 'next/server';
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

// Stand-in for EthicsTrainingExpiredError. The route imports the real
// class from @/lib/auth — we provide a mock module that re-exports a
// constructor matching its shape so `instanceof` checks work.
class FakeEthicsTrainingExpiredError extends Error {
  readonly code = 'ETHICS_TRAINING_EXPIRED' as const;
  readonly reason: 'missing' | 'expired';
  readonly expiredAt: Date | null;
  readonly retrainingUrl: string;
  constructor(reason: 'missing' | 'expired', expiredAt: Date | null) {
    super(
      reason === 'missing'
        ? 'Ethics training has not been recorded for this agent. Complete training to access RLS.'
        : `Ethics training expired on ${expiredAt?.toISOString().slice(0, 10)}. Re-train to restore RLS access.`
    );
    this.name = 'EthicsTrainingExpiredError';
    this.reason = reason;
    this.expiredAt = expiredAt;
    this.retrainingUrl = 'https://example.test/retraining';
  }
}

const createSessionMock = jest.fn();
const SESSION_COOKIE_VALUE = 'session_token';

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  createSession: (...args: unknown[]) => createSessionMock(...args),
  SESSION_COOKIE: SESSION_COOKIE_VALUE,
  EthicsTrainingExpiredError: FakeEthicsTrainingExpiredError,
}));

beforeAll(() => {
  process.env.ALLOW_DEV_LOGIN = 'true';
  // Force NODE_ENV away from production for the route guard.
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'test',
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  createSessionMock.mockReset();
});

function get(): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GET } = require('@/app/api/auth/dev-login/route') as {
    GET: (req: Request) => Promise<NextResponse>;
  };
  return GET(
    new Request('http://localhost/api/auth/dev-login', { method: 'GET' })
  );
}

function post(): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { POST } = require('@/app/api/auth/dev-login/route') as {
    POST: (req: Request) => Promise<NextResponse>;
  };
  return POST(
    new Request('http://localhost/api/auth/dev-login', { method: 'POST' })
  );
}

describe('dev-login — EthicsTrainingExpiredError catch', () => {
  it('POST returns 403 (not 500) with code + retraining_url when broker training is expired', async () => {
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
    createSessionMock.mockImplementationOnce(async () => {
      throw new FakeEthicsTrainingExpiredError(
        'expired',
        new Date('2024-01-01')
      );
    });

    const res = await post();
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: string;
      code?: string;
      retraining_url?: string;
      reason?: string;
    };
    expect(body.code).toBe('ETHICS_TRAINING_EXPIRED');
    expect(body.retraining_url).toMatch(/^https?:\/\//);
    expect(body.reason).toBe('expired');
    expect(body.error).toMatch(/ethics/i);
  });

  it('GET returns 403 (not 500) with code + retraining_url when broker training is missing', async () => {
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
    createSessionMock.mockImplementationOnce(async () => {
      throw new FakeEthicsTrainingExpiredError('missing', null);
    });

    const res = await get();
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: string;
      code?: string;
      retraining_url?: string;
      reason?: string;
    };
    expect(body.code).toBe('ETHICS_TRAINING_EXPIRED');
    expect(body.retraining_url).toMatch(/^https?:\/\//);
    expect(body.reason).toBe('missing');
  });

  it('still returns 200 + sets cookie on the happy path (no ethics error)', async () => {
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
