/// <reference types="jest" />
/**
 * EVERY SHIPPED PIPELINE STAGE PERSISTS, AND NO READER SILENTLY DROPS ONE.
 *
 * THE DEFECT, exactly. app/api/crm/clients/[id]/route.ts held a route-local nine-value array and did:
 *
 *     if (validStages.includes(stage)) update.pipeline_stage = stage;
 *
 * No else. An unsupported stage was dropped SILENTLY and the PATCH still answered 200. So the Sales
 * seller ladder past `listed`, eight of nine rungs of the Rentals landlord ladder, every cross-role
 * conversion stage and the Address Book's own controls all toasted success, moved local state, and left
 * the database exactly as it was. "Advanced to In Contract" meant nothing.
 *
 * Two more halves of the same defect:
 *   - workspace.js::_moveStage sent `{ stage: … }`, a property the route has no branch for at all, so
 *     eight stage-bar buttons saved nothing under any vocabulary;
 *   - app/api/crm/pipeline/route.ts grouped by the same stale nine and bucketed everything else with
 *     `(l.pipeline_stage || "new")`, which does not just omit shipped stages — it RELABELS those leads as
 *     "new", inventing a workflow position for a real person.
 *
 * WHAT THIS PACKET REFUSES TO DO. It reconciles the EXISTING vocabulary and consolidates nothing.
 * `exclusive` vs `exclusive_signed`, `contract` vs `deal`, `post_sale` vs `past`, `active_tenant` vs
 * `current_tenant` look duplicative and are not — each belongs to a different shipped ladder with a
 * different meaning. Merging them would silently rewrite what an agent's click means, and that is a
 * business decision for after the stored census.
 *
 * STORED DATA IS UNTOUCHED AND UNGUESSED. The production census (SELECT status, pipeline_stage, COUNT(*)
 * FROM leads GROUP BY 1,2) is still OWED — refused. So an unrecognized stored token is surfaced as
 * `unrecognized`, never rewritten and never discarded. Group E is the assertion that protects those rows.
 *
 * pipeline_stage is workflow position; Lead.status is lifecycle and access. Group F proves Safety
 * Packets 1 and 2 are untouched by this.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import {
  CANONICAL_PIPELINE_STAGES, GENERIC_STAGES, SELLER_STAGES, LANDLORD_STAGES, TENANT_STAGES,
  CROSS_ROLE_STAGES, isCanonicalPipelineStage, bucketStoredStage, UNRECOGNIZED_STAGE_BUCKET,
} from '@/lib/crm/client-pipeline-stage';

const LEAD = {
  id: 7n, email: 'jane@example.com', first_name: 'Jane', last_name: 'Buyer',
  agent_id: 'agent-1', status: 'active', pipeline_stage: 'new', roles: ['buyer'],
};

let leadRow: Record<string, unknown> | null = { ...LEAD };
let leadsForPipeline: Record<string, unknown>[] = [];

const leadFindUnique = jest.fn(async (_a?: unknown) => leadRow);
const leadFindMany = jest.fn(async (_a?: unknown) => leadsForPipeline);
const leadUpdate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...LEAD, ...args.data }));
const sessionDeleteMany = jest.fn(async (_a?: unknown) => ({ count: 0 }));
const auditCreate = jest.fn(async (_a?: unknown) => ({ id: 1n }));

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findUnique: leadFindUnique, findMany: leadFindMany, update: leadUpdate },
  session: { deleteMany: sessionDeleteMany },
  auditEvent: { create: auditCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
const logAuditEventMock = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  requireAuth: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  isAuthError: () => false,
  logAuditEvent: logAuditEventMock,
}));
jest.mock('@/lib/compliance/rls-enforcement', () => ({ __esModule: true, scanTextForFairHousing: () => [] }));
jest.mock('@/lib/lead-distribution/assign', () => ({ __esModule: true, assignLeadToAgent: jest.fn(async () => undefined) }));

import { PATCH } from '@/app/api/crm/clients/[id]/route';

function reset(over: Record<string, unknown> = {}) {
  leadRow = { ...LEAD, ...over };
  [leadFindUnique, leadFindMany, leadUpdate, auditCreate, logAuditEventMock, sessionDeleteMany]
    .forEach((m) => m.mockClear());
}

const patch = (body: Record<string, unknown>) =>
  PATCH(
    makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/clients/7', body }) as never,
    { params: Promise.resolve({ id: '7' }) } as never
  );

/** What actually reached the database for pipeline_stage, if anything. */
function persistedStage(): string | undefined {
  for (const c of leadUpdate.mock.calls) {
    const d = (c[0] as { data?: Record<string, unknown> })?.data || {};
    if (d.pipeline_stage !== undefined) return String(d.pipeline_stage);
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// A — the contract itself
// ─────────────────────────────────────────────────────────────────────────────
describe('A · the canonical contract covers every shipped ladder, and consolidates nothing', () => {
  it('holds 33 tokens — the union of five shipped vocabularies', () => {
    expect(CANONICAL_PIPELINE_STAGES.length).toBe(33);
  });

  it.each([
    ['generic board', GENERIC_STAGES],
    ['seller ladder', SELLER_STAGES],
    ['landlord ladder', LANDLORD_STAGES],
    ['tenant ladder', TENANT_STAGES],
    ['cross-role writers', CROSS_ROLE_STAGES],
  ])('every %s stage is canonical', (_label, group) => {
    const missing = (group as readonly string[]).filter((s) => !isCanonicalPipelineStage(s));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('look-alike pairs from DIFFERENT ladders are both kept, not merged', () => {
    // Each pair means something different in its own workflow. Consolidation is a later business call.
    for (const [a, b] of [
      ['exclusive', 'exclusive_signed'], ['contract', 'deal'],
      ['post_sale', 'past'], ['active_tenant', 'current_tenant'],
    ]) {
      expect({ a, b, both: isCanonicalPipelineStage(a) && isCanonicalPipelineStage(b) })
        .toEqual({ a, b, both: true });
    }
  });

  it('includes active_seller and active_landlord — live server writers the packet list omitted', () => {
    // app/api/crm/convert/route.ts:249 and sales/prospects/[id]/convert/route.ts:92,121.
    expect(isCanonicalPipelineStage('active_seller')).toBe(true);
    expect(isCanonicalPipelineStage('active_landlord')).toBe(true);
  });

  it('rejects an arbitrary token, and does not coerce', () => {
    for (const v of ['not-a-stage', 'NEW', ' new ', '', null, undefined, 42]) {
      expect({ v, ok: isCanonicalPipelineStage(v) }).toEqual({ v, ok: false });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — every shipped stage now round-trips through the canonical PATCH route
// ─────────────────────────────────────────────────────────────────────────────
describe('B · the PATCH route persists every shipped stage exactly as sent', () => {
  it.each([...CANONICAL_PIPELINE_STAGES])('%s persists', async (stage) => {
    reset();
    const res = await patch({ pipeline_stage: stage });
    expect({ stage, status: res.status, persisted: persistedStage() })
      .toEqual({ stage, status: 200, persisted: stage });
  });
});

describe('D/E/F · the shipped ladders advance end to end', () => {
  async function ladder(order: readonly string[]) {
    const persisted: string[] = [];
    for (const stage of order) {
      reset();
      const res = await patch({ pipeline_stage: stage });
      persisted.push(res.status === 200 ? String(persistedStage()) : `HTTP ${res.status}`);
    }
    return persisted;
  }

  it('SELLER: prospect → pitching → exclusive → listed → showing → offer → contract → closed → post_sale', async () => {
    expect(await ladder(SELLER_STAGES)).toEqual([...SELLER_STAGES]);
  });

  it('LANDLORD: prospect → pitching → exclusive_signed → listed → showing → application → lease_out → lease_signed → rented', async () => {
    expect(await ladder(LANDLORD_STAGES)).toEqual([...LANDLORD_STAGES]);
  });

  it('TENANT ladder advances end to end', async () => {
    expect(await ladder(TENANT_STAGES)).toEqual([...TENANT_STAGES]);
  });

  it('cross-role and Address Book writers persist', async () => {
    expect(await ladder(CROSS_ROLE_STAGES)).toEqual([...CROSS_ROLE_STAGES]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C/K — fail loudly, and never partially
// ─────────────────────────────────────────────────────────────────────────────
describe('C/K · an unsupported stage is a 400, and writes nothing at all', () => {
  it('returns 400 rather than a misleading 200', async () => {
    reset();
    const res = await patch({ pipeline_stage: 'INVALID_STAGE' });
    expect(res.status).toBe(400);
    const json = (await readJson(res)) as { error?: string };
    expect(String(json.error ?? '')).toMatch(/pipeline_stage/i);
  });

  it('NO PARTIAL SUCCESS — a valid sibling field in the same request is not applied either', async () => {
    // Validation must happen BEFORE the update object is assembled and applied, or the request half-lands
    // and reports success.
    reset();
    const res = await patch({ roles: ['buyer', 'renter'], pipeline_stage: 'INVALID_STAGE' });
    expect(res.status).toBe(400);
    expect({
      updates: leadUpdate.mock.calls.length,
      audits: logAuditEventMock.mock.calls.length,
    }).toEqual({ updates: 0, audits: 0 });
  });

  it('POSITIVE CONTROL — the same sibling field DOES apply when the stage is valid', async () => {
    reset();
    const res = await patch({ roles: ['buyer', 'renter'], pipeline_stage: 'listed' });
    expect(res.status).toBe(200);
    expect(leadUpdate.mock.calls.length).toBeGreaterThan(0);
    const data = (leadUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toEqual(expect.objectContaining({ pipeline_stage: 'listed', roles: ['buyer', 'renter'] }));
  });

  it('a PATCH with no pipeline_stage at all is unaffected', async () => {
    reset();
    const res = await patch({ roles: ['buyer'] });
    expect(res.status).toBe(200);
    expect(persistedStage()).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G/H — the pipeline reader stops relabelling
// ─────────────────────────────────────────────────────────────────────────────
describe('G/H · /api/crm/pipeline buckets every shipped stage and never invents one', () => {
  async function pipeline(rows: Array<{ pipeline_stage: unknown }>) {
    leadsForPipeline = rows.map((r, i) => ({ id: BigInt(i + 1), first_name: 'A', last_name: 'B', ...r }));
    const { GET } = await import('@/app/api/crm/pipeline/route');
    const res = await GET(makeRequest({ method: 'GET', url: 'http://localhost/api/crm/pipeline' }) as never);
    return (await readJson(res)) as { pipeline?: Array<{ stage: string; count: number }> };
  }

  it('gives every canonical stage a bucket', async () => {
    const body = await pipeline(CANONICAL_PIPELINE_STAGES.map((s) => ({ pipeline_stage: s })));
    const buckets = (body.pipeline || []).map((p) => p.stage);
    const missing = CANONICAL_PIPELINE_STAGES.filter((s) => !buckets.includes(s));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('counts are exact — one lead per shipped stage', async () => {
    const body = await pipeline(CANONICAL_PIPELINE_STAGES.map((s) => ({ pipeline_stage: s })));
    const total = (body.pipeline || []).reduce((n, p) => n + p.count, 0);
    expect(total).toBe(CANONICAL_PIPELINE_STAGES.length);
  });

  it('an UNRECOGNIZED stored value is surfaced as unrecognized — never relabelled "new"', async () => {
    // This is what protects historic rows while the stored census is still unavailable.
    const body = await pipeline([{ pipeline_stage: 'some_historic_token' }]);
    const newBucket = (body.pipeline || []).find((p) => p.stage === 'new');
    const unknown = (body.pipeline || []).find((p) => p.stage === UNRECOGNIZED_STAGE_BUCKET);
    expect({ relabelledAsNew: newBucket?.count ?? 0, unrecognized: unknown?.count ?? 0 })
      .toEqual({ relabelledAsNew: 0, unrecognized: 1 });
  });

  it('an unrecognized row is never discarded — it is still counted somewhere', async () => {
    const body = await pipeline([{ pipeline_stage: 'some_historic_token' }, { pipeline_stage: 'listed' }]);
    const total = (body.pipeline || []).reduce((n, p) => n + p.count, 0);
    expect(total).toBe(2);
  });

  it('H · a null/empty stage still takes the legacy default, which an unset column genuinely means', async () => {
    expect(bucketStoredStage(null)).toBe('new');
    expect(bucketStoredStage('')).toBe('new');
    expect(bucketStoredStage('some_historic_token')).toBe(UNRECOGNIZED_STAGE_BUCKET);
    const body = await pipeline([{ pipeline_stage: null }]);
    expect((body.pipeline || []).find((p) => p.stage === 'new')?.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// L — the source contract guard, plus the workspace wrong-key fix
// ─────────────────────────────────────────────────────────────────────────────
describe('L · every live writer literal is recognized by the contract', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');

  it('C · workspace._moveStage sends pipeline_stage, not the ignored `stage` key', () => {
    const src = read('public/crm/js/dashboard/workspace.js');
    expect(src).toContain('pipeline_stage: newStage');
    expect(src).not.toMatch(/clients\.update\(_clientId,\s*\{\s*stage:/);
  });

  it('the ladder orders in the shipped panels are all canonical', () => {
    // Structural, and paired with the behavioural round-trips above rather than standing alone.
    for (const [rel, marker] of [
      ['public/crm/js/dashboard/panels/sales-crm/index.js', "var order = ['prospect'"],
      ['public/crm/js/dashboard/panels/rentals-crm/index.js', "var order = ['prospect'"],
    ] as const) {
      const src = read(rel);
      const at = src.indexOf(marker);
      expect(at).toBeGreaterThan(-1);
      const line = src.slice(at, src.indexOf('\n', at));
      const tokens = Array.from(line.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
      const unknown = tokens.filter((t) => !isCanonicalPipelineStage(t));
      expect({ rel, unknown }).toEqual({ rel, unknown: [] });
    }
  });

  it('no route keeps its own private stage allowlist any more', () => {
    for (const rel of ['app/api/crm/clients/[id]/route.ts', 'app/api/crm/pipeline/route.ts']) {
      const code = read(rel).split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      expect(code).toContain('client-pipeline-stage');
      expect(code).not.toContain('"nurturing", "active", "showing"');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M — status and the safety packets are untouched
// ─────────────────────────────────────────────────────────────────────────────
describe('M · Lead.status and Safety Packets 1 and 2 are not coupled to this', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');

  it('the pipeline contract module never reads or writes Lead.status', () => {
    const src = read('lib/crm/client-pipeline-stage.ts');
    const code = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(code).not.toContain('isLeadExplicitlyInactive');
    expect(code).not.toMatch(/\bstatus\b\s*[:=]/);
  });

  it('the portal-access helper is unchanged in meaning — still exactly one token', async () => {
    const { isLeadPortalAccessAllowed } = await import('@/lib/auth/lead-access');
    expect(isLeadPortalAccessAllowed('inactive')).toBe(false);
    for (const s of ['closed', 'past', 'active', 'listed']) {
      expect({ s, allowed: isLeadPortalAccessAllowed(s) }).toEqual({ s, allowed: true });
    }
  });

  it('a stage PATCH does not touch status, and a status PATCH does not touch stage', async () => {
    reset();
    await patch({ pipeline_stage: 'listed' });
    const stageWrite = (leadUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(stageWrite.status).toBeUndefined();

    reset();
    await patch({ status: 'active' });
    const statusWrite = (leadUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(statusWrite.pipeline_stage).toBeUndefined();
  });
});
