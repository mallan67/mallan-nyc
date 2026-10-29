/// <reference types="jest" />
/**
 * Lease renewal — REAL PostgreSQL concurrency test (PR #668 review, finding 2).
 *
 * lease-renewal-correction.test.ts proves, with Prisma mocked, that the duplicate check runs inside the renewal's
 * transaction after the tenancy's advisory lock. Only a real database can prove that two overlapping identical
 * requests end with ONE new term: this runs the REAL route handler twice at once against a real, migrated Postgres
 * (the pg_advisory_xact_lock serialises the two transactions; the second reads after the first committed). The test's client holds each insert for
 * 400 ms so the race is certain, not a matter of timing: without the lock both requests insert (verified by removing the lock line: this test fails).
 *
 * Gating: runs ONLY when ONE_CYCLE_DB_INTEGRATION_URL is set (CI points it at the ephemeral PostgreSQL service). It
 * never connects to production Neon. Everything it writes carries a unique landlord e-mail and is deleted afterwards.
 */
import { makeRequest } from './helpers';

const integrationUrl = process.env.ONE_CYCLE_DB_INTEGRATION_URL;

// The route's prisma is the real client on the integration database (built inside the factory: jest hoists mocks).
jest.mock('@/lib/prisma', () => {
  const url = process.env.ONE_CYCLE_DB_INTEGRATION_URL;
  if (!url) return { __esModule: true, default: {} };
  const { PrismaClient } = require('@prisma/client');
  // The test's own client holds every ActiveLease insert for 400 ms, the way a slow disk or a busy server would. On a fast local database the
  // two requests of the race rarely interleave, so without this the test would pass even with no lock at all (checked: removing the lock
  // line leaves an undelayed run green). With the hold, a renewal that does not serialise on the tenancy's lock inserts twice, every run.
  const HOLD_MS = 400;
  const client = new PrismaClient({ datasources: { db: { url } } }).$extends({
    query: { activeLease: { async create({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) { await new Promise((r) => setTimeout(r, HOLD_MS)); return query(args); } } },
  });
  return { __esModule: true, default: client };
});
const AUTH = { userId: 1n, role: 'BROKER', email: 'maya@mallan.nyc' };
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => AUTH),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

if (!integrationUrl) {
  describe.skip('lease renewal — real Postgres concurrency', () => {
    it('requires ONE_CYCLE_DB_INTEGRATION_URL (set in CI / local harness)', () => { /* skipped without the URL */ });
  });
} else {
  describe('lease renewal — real Postgres concurrency', () => {
    jest.setTimeout(60000);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let prisma: any;
    let POST: (req: any, ctx: any) => Promise<Response>;
    const email = `lease-renewal-itest+${Date.now()}@example.test`;
    let landlordId: bigint;
    let agentId: bigint;
    const agentEmail = `lease-renewal-itest-agent+${Date.now()}@example.test`;
    let priorId: bigint;
    const PRIOR_START = new Date('2025-07-01T00:00:00Z');
    const PRIOR_END = new Date('2026-06-30T00:00:00Z');
    const json = async (res: Response) => JSON.parse(await res.text());
    const renew = (body: Record<string, unknown>) =>
      POST(makeRequest({ url: `http://localhost/api/crm/active-leases/${priorId}/renew`, body }), { params: Promise.resolve({ id: String(priorId) }) });

    beforeAll(async () => {
      prisma = (await import('@/lib/prisma')).default;
      ({ POST } = await import('@/app/api/crm/active-leases/[id]/renew/route'));
      const agent = await prisma.agent.create({
        data: { first_name: 'Test', last_name: 'Agent', email: agentEmail, password_hash: 'x' },
        select: { id: true },
      });
      agentId = agent.id;
      const landlord = await prisma.lead.create({
        data: { first_name: 'Lena', last_name: 'Landlord', email, phone: '212-555-0100', roles: ['landlord'] },
        select: { id: true },
      });
      landlordId = landlord.id;
      const prior = await prisma.activeLease.create({
        data: {
          status: 'active', address: '425 Park Avenue South', unit: '4D', landlord_lead_id: landlordId, tenant_name: 'Tom Tenant',
          monthly_rent: 4200, lease_start_date: PRIOR_START, lease_end_date: PRIOR_END, lease_type: 'standard_1yr', agent_id: agentId,
        },
        select: { id: true },
      });
      priorId = prior.id;
    });

    afterAll(async () => {
      if (prisma?.activeLease) {
        await prisma.activeLease.deleteMany({ where: { landlord_lead_id: landlordId } });
        await prisma.lead.deleteMany({ where: { email } });
        await prisma.agent.deleteMany({ where: { email: agentEmail } });
        await prisma.$disconnect();
      }
    });

    it('two simultaneous identical renewals ⇒ ONE new term: one 201 and one 200 (deduplicated) naming the same row', async () => {
      const body = { lease_start_date: '2026-07-01', lease_end_date: '2027-06-30', monthly_rent: 4400 };
      const [a, b] = await Promise.all([renew(body), renew(body)]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 201]);
      const [first, second] = a.status === 201 ? [await json(a), await json(b)] : [await json(b), await json(a)];
      expect(first.deduplicated).toBe(false);
      expect(second.deduplicated).toBe(true);
      expect(second.lease.id).toBe(first.lease.id);
      const terms = await prisma.activeLease.findMany({ where: { landlord_lead_id: landlordId, lease_start_date: new Date('2026-07-01T00:00:00Z') } });
      expect(terms).toHaveLength(1);
      const prior = await prisma.activeLease.findUnique({ where: { id: priorId } });
      expect(prior.status).toBe('historical');
      expect(prior.renewal_status).toBe('renewing');
    });

    it('the same renewal sent again later is the recorded term (200, deduplicated), still one row', async () => {
      const res = await renew({ lease_start_date: '2026-07-01', lease_end_date: '2027-06-30', monthly_rent: 4400 });
      expect(res.status).toBe(200);
      expect((await json(res)).deduplicated).toBe(true);
      const terms = await prisma.activeLease.findMany({ where: { landlord_lead_id: landlordId, lease_start_date: new Date('2026-07-01T00:00:00Z') } });
      expect(terms).toHaveLength(1);
    });

    it('a renewal that starts inside the prior term is refused on the real row, with the prior term\'s end date', async () => {
      const res = await renew({ lease_start_date: '2026-03-01', lease_end_date: '2027-02-28', monthly_rent: 4400 });
      expect(res.status).toBe(400);
      expect((await json(res)).prior_lease_end_date).toBe('2026-06-30');
      const all = await prisma.activeLease.findMany({ where: { landlord_lead_id: landlordId } });
      expect(all).toHaveLength(2);                                                                  // the prior term and the one renewal
    });
  });
}
