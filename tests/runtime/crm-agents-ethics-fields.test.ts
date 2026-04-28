/// <reference types="jest" />
/**
 * GET /api/crm/agents — ethics-training fields exposure (UCBA Art. III §6, C4c).
 *
 * Verifies the broker-only agent roster includes both
 * `ethics_training_completed_at` and `ethics_training_expires_at` so the
 * broker admin panel can render them. Without this, the panel can't show
 * compliance status and expired agents go undetected.
 */

import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

// Bypass auth — we're asserting the response shape, not the gate.
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: jest.fn(async () => ({
    userId: 1n,
    userType: 'agent',
    role: 'BROKER',
    sessionId: 'test',
  })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => {}),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

describe('GET /api/crm/agents — ethics fields', () => {
  it('asks Prisma to select the two ethics-training columns (panel cannot render without them)', async () => {
    const findManyMock = jest.fn(async () => []);
    (prismaMock as { agent: { findMany: jest.Mock } }).agent.findMany = findManyMock;

    const { GET } = await import('@/app/api/crm/agents/route');
    const req = new Request('http://localhost/api/crm/agents', { method: 'GET' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(req as any);

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const calls = findManyMock.mock.calls as unknown as Array<
      [{ select?: Record<string, boolean> }]
    >;
    const args = calls[0][0];
    expect(args.select).toBeDefined();
    expect(args.select?.ethics_training_completed_at).toBe(true);
    expect(args.select?.ethics_training_expires_at).toBe(true);
  });

  it('returns ethics_training_completed_at + ethics_training_expires_at for each agent', async () => {
    const completed = new Date('2025-06-15T00:00:00Z');
    const expires = new Date('2027-06-15T00:00:00Z');
    (prismaMock as { agent: { findMany: jest.Mock } }).agent.findMany = jest.fn(async () => [
      {
        id: 42n,
        first_name: 'Maya',
        last_name: 'Allan',
        full_name: 'Maya Allan',
        email: 'maya@mallan.nyc',
        phone: null,
        license_no: '10311201806',
        license_type: 'salesperson',
        license_expiry: null,
        sale_split: null,
        rental_split: null,
        role: 'BROKER',
        status: 'active',
        last_login: null,
        created_at: new Date(),
        title: null,
        bio: null,
        photo: null,
        public_slug: 'maya-allan',
        featured: false,
        specialties: [],
        languages: [],
        ethics_training_completed_at: completed,
        ethics_training_expires_at: expires,
      },
    ]);

    const { GET } = await import('@/app/api/crm/agents/route');
    const req = new Request('http://localhost/api/crm/agents', { method: 'GET' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: Array<Record<string, unknown>> };
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents.length).toBe(1);
    expect(body.agents[0].ethics_training_completed_at).toBe(completed.toISOString());
    expect(body.agents[0].ethics_training_expires_at).toBe(expires.toISOString());
  });

  it('returns null for agents without ethics dates recorded', async () => {
    (prismaMock as { agent: { findMany: jest.Mock } }).agent.findMany = jest.fn(async () => [
      {
        id: 99n,
        first_name: 'New',
        last_name: 'Agent',
        full_name: 'New Agent',
        email: 'new@mallan.nyc',
        phone: null,
        license_no: null,
        license_type: null,
        license_expiry: null,
        sale_split: null,
        rental_split: null,
        role: 'AGENT',
        status: 'active',
        last_login: null,
        created_at: new Date(),
        title: null,
        bio: null,
        photo: null,
        public_slug: 'new-agent',
        featured: false,
        specialties: [],
        languages: [],
        ethics_training_completed_at: null,
        ethics_training_expires_at: null,
      },
    ]);

    const { GET } = await import('@/app/api/crm/agents/route');
    const req = new Request('http://localhost/api/crm/agents', { method: 'GET' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(req as any);
    const body = (await res.json()) as { agents: Array<Record<string, unknown>> };
    expect(body.agents[0].ethics_training_completed_at).toBeNull();
    expect(body.agents[0].ethics_training_expires_at).toBeNull();
  });
});
