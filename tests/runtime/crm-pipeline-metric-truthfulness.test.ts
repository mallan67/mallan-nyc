/// <reference types="jest" />
/**
 * /api/crm/pipeline REPORTS FACTS, OR IT REPORTS NOTHING.
 *
 * `6d1699f9` made the per-stage buckets truthful: all 33 shipped stages bucket as themselves, and an
 * unrecognized stored token surfaces as `unrecognized` instead of being relabelled "new". The SUMMARY in
 * the same file was left on pre-convergence assumptions and was therefore still fabricating:
 *
 *     conversion_rate = pipeline_stage === "deal" || pipeline_stage === "closed"     (route:74)
 *     active          = !["closed", "past"].includes(pipeline_stage || "new")        (route:81)
 *
 * Measured against the canonical contract, `active` counted 31 of 33 stages — including eight that are
 * ladder-terminal or not a pipeline pursuit at all: post_sale, rented, lease_signed, moved_in,
 * active_tenant, current_tenant, viewed_not_rent and referral. A landlord whose unit is rented read as
 * an active pursuit; so did a lead explicitly marked viewed_not_rent.
 *
 * `conversion_rate` was worse, because of what it CANNOT see. `deal` exists only in the generic board and
 * `closed` in generic and seller, so NEITHER the Landlord ladder NOR the Tenant ladder has any conversion
 * end-point the metric recognises — `rented`, `lease_signed`, `moved_in` and `active_tenant` never count.
 * A rental brokerage's completed work was structurally invisible in that percentage.
 *
 * THE FIX IS SUBTRACTION, NOT A BETTER GUESS. "Active" and "conversion" are business definitions, not code
 * vocabulary: whether a tenancy is an active relationship or a finished pursuit, and which of three
 * distinct rental moments marks a placement, are questions for the brokerage — and a global
 * Lead.pipeline_stage cannot answer them for four differently-shaped ladders at once. A real conversion
 * KPI should be built from transaction/role facts later. Until then the endpoint reports only what it can
 * count, and the per-stage buckets remain the authoritative detail.
 *
 * NOTE ON WHAT IS **NOT** ASSERTED: nothing here pins a replacement definition of active or conversion.
 * Encoding one would make the right definition harder to adopt later, which is the same reason no test
 * was added for the legacy metric when the buckets were fixed.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import {
  CANONICAL_PIPELINE_STAGES, UNRECOGNIZED_STAGE_BUCKET,
} from '@/lib/crm/client-pipeline-stage';

let leadsForPipeline: Record<string, unknown>[] = [];
const leadFindMany = jest.fn(async (_a?: unknown) => leadsForPipeline);

const { prisma: prismaMock } = buildPrismaMock({ lead: { findMany: leadFindMany } });
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));

type Body = {
  pipeline?: Array<{ stage: string; count: number }>;
  stats?: Record<string, unknown>;
};

async function pipeline(stages: Array<unknown>): Promise<Body> {
  leadsForPipeline = stages.map((s, i) => ({
    id: BigInt(i + 1), first_name: 'A', last_name: 'B', email: 'a@b.c', pipeline_stage: s,
  }));
  leadFindMany.mockClear();
  const { GET } = await import('@/app/api/crm/pipeline/route');
  const res = await GET(makeRequest({ method: 'GET', url: 'http://localhost/api/crm/pipeline' }) as never);
  return (await readJson(res)) as Body;
}

const bucket = (b: Body, stage: string) => (b.pipeline || []).find((p) => p.stage === stage)?.count ?? 0;

// ─────────────────────────────────────────────────────────────────────────────
// A — the fabricated metrics are gone
// ─────────────────────────────────────────────────────────────────────────────
describe('A · no global active or conversion_rate is manufactured', () => {
  it('stats exposes neither key', async () => {
    const body = await pipeline(['new', 'rented', 'post_sale']);
    expect(Object.keys(body.stats || {}).sort()).toEqual(
      ['recognized', 'total', 'unrecognized', 'unstaged']
    );
  });

  it('the route source no longer computes them', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve } = require('path') as typeof import('path');
    const code = readFileSync(resolve(__dirname, '../../app/api/crm/pipeline/route.ts'), 'utf8')
      .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(code).not.toContain('conversion_rate');
    expect(code).not.toContain('conversionRate');
    expect(code).not.toMatch(/\bactive:/);
    expect(code).not.toContain('"deal" ||');
    expect(code).not.toMatch(/\["closed",\s*"past"\]/);
  });

  it('the eight stages the old rule miscounted as active are no longer summarised at all', async () => {
    // post_sale, rented, lease_signed, moved_in, active_tenant, current_tenant, viewed_not_rent, referral.
    const body = await pipeline(['post_sale', 'rented', 'viewed_not_rent', 'current_tenant']);
    expect(body.stats).not.toHaveProperty('active');
    // They are still COUNTED — precisely, in their own buckets. Removing a wrong summary must not remove
    // the underlying facts.
    for (const s of ['post_sale', 'rented', 'viewed_not_rent', 'current_tenant']) {
      expect({ s, n: bucket(body, s) }).toEqual({ s, n: 1 });
    }
  });

  it('no rental end-point is silently treated as a conversion, because nothing claims conversions', async () => {
    const body = await pipeline(['rented', 'lease_signed', 'moved_in', 'active_tenant']);
    expect(body.stats).not.toHaveProperty('conversion_rate');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the replacement counts are exact and factual
// ─────────────────────────────────────────────────────────────────────────────
describe('B · total, recognized, unrecognized and unstaged are exact', () => {
  it('a book of every canonical stage is fully recognized', async () => {
    const body = await pipeline([...CANONICAL_PIPELINE_STAGES]);
    expect(body.stats).toEqual({
      total: CANONICAL_PIPELINE_STAGES.length,
      recognized: CANONICAL_PIPELINE_STAGES.length,
      unrecognized: 0,
      unstaged: 0,
    });
  });

  it('unset stages count as unstaged AND as recognized — an empty column genuinely means not yet staged', async () => {
    const body = await pipeline([null, undefined, '']);
    expect(body.stats).toEqual({ total: 3, recognized: 3, unrecognized: 0, unstaged: 3 });
    expect(bucket(body, 'new')).toBe(3);
  });

  it('a mixed book adds up, with every lead counted exactly once', async () => {
    const body = await pipeline(['listed', 'rented', null, 'some_historic_token', 'another_old_value']);
    expect(body.stats).toEqual({ total: 5, recognized: 3, unrecognized: 2, unstaged: 1 });
    const bucketed = (body.pipeline || []).reduce((n, p) => n + p.count, 0);
    expect(bucketed).toBe(5);
  });

  it('recognized + unrecognized always equals total', async () => {
    for (const set of [
      ['new'], ['some_historic_token'], [null, 'listed', 'x'], [...CANONICAL_PIPELINE_STAGES, 'zzz'],
    ]) {
      const body = await pipeline(set);
      const s = body.stats as { total: number; recognized: number; unrecognized: number };
      expect({ set: set.length, sum: s.recognized + s.unrecognized }).toEqual({ set: set.length, sum: s.total });
    }
  });

  it('an empty book reports zeroes, not absent keys', async () => {
    const body = await pipeline([]);
    expect(body.stats).toEqual({ total: 0, recognized: 0, unrecognized: 0, unstaged: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — the bucketing from 6d1699f9 is untouched
// ─────────────────────────────────────────────────────────────────────────────
describe('C · all 33 canonical buckets survive, and unknown truth is preserved', () => {
  it('every canonical stage still has its own bucket with an exact count', async () => {
    const body = await pipeline([...CANONICAL_PIPELINE_STAGES]);
    const missing = CANONICAL_PIPELINE_STAGES.filter((s) => bucket(body, s) !== 1);
    expect({ missing }).toEqual({ missing: [] });
  });

  it('an unknown historic stage stays in the unrecognized bucket — never new, active, closed or converted', async () => {
    const body = await pipeline(['some_historic_token']);
    expect(bucket(body, UNRECOGNIZED_STAGE_BUCKET)).toBe(1);
    expect(bucket(body, 'new')).toBe(0);
    expect(bucket(body, 'closed')).toBe(0);
  });

  it('several distinct unknown tokens all count, and none is discarded', async () => {
    const body = await pipeline(['old_a', 'old_b', 'old_c']);
    expect(bucket(body, UNRECOGNIZED_STAGE_BUCKET)).toBe(3);
    expect((body.stats as { unrecognized: number }).unrecognized).toBe(3);
  });
});
