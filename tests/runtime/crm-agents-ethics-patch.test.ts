/// <reference types="jest" />
/**
 * PATCH /api/crm/agents/:id/ethics-training (UCBA Art. III §6, Workstream C4c).
 *
 * Broker-only endpoint to set/update an agent's ethics-training dates.
 * Without these tests the endpoint could silently accept invalid dates,
 * skip the audit-event write, or — worst case — let a non-broker mutate
 * a broker's compliance status.
 *
 * Coverage:
 *   - 401 on no auth
 *   - 403 on agent (non-broker) auth
 *   - 400 on empty body / both fields missing
 *   - 400 on expires_at < completed_at
 *   - 400 on expires_at > now() + 5 years
 *   - 200 + AuditEvent write on happy path
 *   - 200 with null clears + AuditEvent write
 */

import { NextResponse } from 'next/server';
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock, calls: prismaCalls } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

// Toggle-able auth mock: tests reassign these to simulate
// unauthenticated / agent / broker callers.
const requireBrokerMock: jest.Mock = jest.fn();
const isAuthErrorMock: jest.Mock = jest.fn();
const logAuditEventMock: jest.Mock = jest.fn();

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: (req: unknown): Promise<unknown> => requireBrokerMock(req),
  isAuthError: (v: unknown): boolean => Boolean(isAuthErrorMock(v)),
  logAuditEvent: (
    action: string,
    entityType: string,
    entityId: string,
    user: unknown,
    changes: unknown,
    ip?: string
  ): Promise<void> =>
    logAuditEventMock(action, entityType, entityId, user, changes, ip),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

beforeEach(() => {
  requireBrokerMock.mockReset();
  isAuthErrorMock.mockReset();
  logAuditEventMock.mockClear();
  for (const k of Object.keys(prismaCalls)) delete prismaCalls[k];
});

type AnyReq = Request;

function jsonReq(body: unknown): AnyReq {
  return new Request('http://localhost/api/crm/agents/42/ethics-training', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPatch(
  body: unknown,
  params: { id: string } = { id: '42' }
): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/agents/[id]/ethics-training/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(jsonReq(body), { params: Promise.resolve(params) });
}

describe('PATCH /api/crm/agents/:id/ethics-training', () => {
  it('returns 401 when no auth (broker gate refuses)', async () => {
    requireBrokerMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    isAuthErrorMock.mockReturnValueOnce(true);

    const res = await callPatch({ completed_at: '2025-01-01T00:00:00Z' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is an agent, not a broker', async () => {
    requireBrokerMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    );
    isAuthErrorMock.mockReturnValueOnce(true);

    const res = await callPatch({ completed_at: '2025-01-01T00:00:00Z' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when body has neither completed_at nor expires_at', async () => {
    requireBrokerMock.mockResolvedValueOnce({
      userId: 1n,
      userType: 'agent',
      role: 'BROKER',
      sessionId: 'test',
    });
    isAuthErrorMock.mockReturnValueOnce(false);

    const res = await callPatch({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when expires_at < completed_at', async () => {
    requireBrokerMock.mockResolvedValueOnce({
      userId: 1n,
      userType: 'agent',
      role: 'BROKER',
      sessionId: 'test',
    });
    isAuthErrorMock.mockReturnValueOnce(false);

    const res = await callPatch({
      completed_at: '2025-06-01T00:00:00Z',
      expires_at: '2025-01-01T00:00:00Z',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/earlier|before/i);
  });

  it('returns 400 when expires_at is more than 5 years in the future', async () => {
    requireBrokerMock.mockResolvedValueOnce({
      userId: 1n,
      userType: 'agent',
      role: 'BROKER',
      sessionId: 'test',
    });
    isAuthErrorMock.mockReturnValueOnce(false);

    const sixYears = new Date(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000);
    const res = await callPatch({
      completed_at: new Date().toISOString(),
      expires_at: sixYears.toISOString(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/5 years|five years/i);
  });

  it('returns 200 with updated agent on happy path AND writes audit event', async () => {
    requireBrokerMock.mockResolvedValueOnce({
      userId: 7n,
      userType: 'agent',
      role: 'BROKER',
      sessionId: 'test',
    });
    isAuthErrorMock.mockReturnValueOnce(false);

    const completed = new Date('2025-06-15T00:00:00Z');
    const expires = new Date('2027-06-15T00:00:00Z');
    (prismaMock as { agent: { update: jest.Mock } }).agent.update = jest.fn(
      async () => ({
        id: 42n,
        ethics_training_completed_at: completed,
        ethics_training_expires_at: expires,
      })
    );

    const res = await callPatch({
      completed_at: completed.toISOString(),
      expires_at: expires.toISOString(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: {
        id: string;
        ethics_training_completed_at: string;
        ethics_training_expires_at: string;
      };
    };
    expect(body.agent.id).toBe('42');
    expect(body.agent.ethics_training_completed_at).toBe(completed.toISOString());
    expect(body.agent.ethics_training_expires_at).toBe(expires.toISOString());

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    const auditCall = logAuditEventMock.mock.calls[0] as unknown as [
      string,
      string,
      string,
      unknown,
      Record<string, unknown>,
      unknown
    ];
    expect(auditCall[0]).toBe('ethics_training_updated');
    expect(auditCall[1]).toBe('agent');
    expect(auditCall[2]).toBe('42');
    expect(auditCall[4]).toMatchObject({
      completed_at: completed.toISOString(),
      expires_at: expires.toISOString(),
    });
  });

  it('accepts null to clear a field', async () => {
    requireBrokerMock.mockResolvedValueOnce({
      userId: 1n,
      userType: 'agent',
      role: 'BROKER',
      sessionId: 'test',
    });
    isAuthErrorMock.mockReturnValueOnce(false);

    (prismaMock as { agent: { update: jest.Mock } }).agent.update = jest.fn(
      async () => ({
        id: 42n,
        ethics_training_completed_at: null,
        ethics_training_expires_at: null,
      })
    );

    const res = await callPatch({ completed_at: null, expires_at: null });
    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on invalid ISO date string', async () => {
    requireBrokerMock.mockResolvedValueOnce({
      userId: 1n,
      userType: 'agent',
      role: 'BROKER',
      sessionId: 'test',
    });
    isAuthErrorMock.mockReturnValueOnce(false);

    const res = await callPatch({ completed_at: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
