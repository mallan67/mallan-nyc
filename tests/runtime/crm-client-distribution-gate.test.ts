/// <reference types="jest" />
/**
 * ONE canonical client-facing distribution boundary, TWO proven consumers.
 *
 * PROVEN DEFECT (orphan-Client convergence census, adjudicated 2026-09-15): the four-flag REBNY check that
 * decides whether a listing may reach a CLIENT lived inline in exactly one route, and a second route that
 * also performs a client-facing write had no such check at all.
 *
 *   app/api/crm/listing-sends/route.ts       — checked all four inline
 *   app/api/crm/clients/[id]/actions/route.ts — checked NONE of them
 *
 * That mattered because `/actions` is the named migration destination for the old Search-side
 * selection / like / dislike behaviour, and the code being retired DOES gate
 * (public/crm/js/listing/listing-selection.js:232-241, :299-303). Migrating as originally proposed would
 * have moved a REBNY gate from present to absent.
 *
 * A wording correction worth keeping, because it changes the size of the fix: an earlier report claimed the
 * actions route "does not even select" the gate fields. It does. Both lookups are
 * prisma.listing.findUnique({ where: … }) with NO select, so Prisma returns every scalar column and all four
 * flags were already on the object. The route simply never read them — no plumbing change was needed.
 *
 * The interpretation is now defined once in lib/compliance/client-distribution.ts and imported by both
 * routes, rather than copied. Two hand-written copies of one rule is the shape that already produced two
 * disagreeing `Permission` interpreters in this repository.
 *
 * SCOPE — deliberately two callers only. getReportListings(), the CSV/XLSX/print/preview emitters, the
 * MAX_EXPORT_ROWS attribution and the Search-universe membership correction are their own registered lanes
 * and are NOT touched here.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const cleanListing = {
  id: 7n,
  listing_id: 'LIST-001',
  address: { full: '123 Main St, Apt 4B, New York, NY' },
  list_price: 1500000,
  bedrooms_total: 2,
  bathrooms_full: 2,
  living_area: 1100,
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Condo',
  media: [{ url: 'https://example.com/photo.jpg' }],
  // REBNY distribution gates — permissive by default.
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
};

let listingRow: Record<string, unknown> = { ...cleanListing };

const listingFindUnique = jest.fn(async () => listingRow);
// agent_id must match the authed agent: the actions route refuses with 403 at :65-68 unless the caller
// is a BROKER or owns the lead. Without this the tests would 403 before ever reaching the gate under test.
const leadFindUnique = jest.fn(async () => ({ id: 99n, agent_id: 'agent-1', first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com' }));
const leadFindMany = jest.fn(async () => [{ id: 99n, first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com' }]);
const agentFindUnique = jest.fn(async () => ({ first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc' }));
const clientListingActionUpsert = jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 200n, listing_id: 7n, action: 'liked', ...args.create }));
const auditEventCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 100n, created_at: new Date(), ...args.data }));
const auditEventFindFirst = jest.fn(async () => null);
const followUpTaskCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 300n, ...args.data }));

const { prisma: prismaMock } = buildPrismaMock({
  listing: { findUnique: listingFindUnique },
  agent: { findUnique: agentFindUnique },
  lead: { findMany: leadFindMany, findUnique: leadFindUnique },
  auditEvent: { create: auditEventCreate, findFirst: auditEventFindFirst },
  clientListingAction: { upsert: clientListingActionUpsert },
  followUpTask: { create: followUpTaskCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

// Held by reference so a refusal can be proven to leave NO audit trace, not merely no row.
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAuth: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'AGENT' })),
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'AGENT' })),
  isAuthError: () => false,
  logAuditEvent: logAuditEventMock,
}));

const sendEmailMock = jest.fn(async () => ({ success: true }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));
jest.mock('@/lib/email/templates', () => ({ __esModule: true, listingSendEmail: () => '<html>body</html>' }));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));
jest.mock('@/lib/tracking/listing-token', () => ({ __esModule: true, generateTrackingToken: () => 'tok_test' }));
jest.mock('@/lib/crm/access', () => ({ __esModule: true, assertLeadIdsAccess: jest.fn(async () => ({ response: null })) }));

// Imported AFTER the mocks.
import { POST as ACTIONS_POST } from '@/app/api/crm/clients/[id]/actions/route';
import { POST as SENDS_POST } from '@/app/api/crm/listing-sends/route';

const BLOCKING = [
  ['idx_display_yn', { idx_display_yn: false }],
  ['internet_entire_listing_display_yn', { internet_entire_listing_display_yn: false }],
  ['owner_opt_out', { owner_opt_out: true }],
  ['participant_only', { participant_only: true }],
] as const;

function reset(over: Record<string, unknown> = {}) {
  listingRow = { ...cleanListing, ...over };
  [listingFindUnique, clientListingActionUpsert, auditEventCreate, sendEmailMock, followUpTaskCreate, logAuditEventMock].forEach((m) => m.mockClear());
}

const actionsReq = (body: Record<string, unknown>) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/99/actions', body });

const actionsParams = { params: Promise.resolve({ id: '99' }) };

// ─────────────────────────────────────────────────────────────────────────────
// B — /actions, red-first: the four negative cases must block
// ─────────────────────────────────────────────────────────────────────────────
describe('B · POST /api/crm/clients/[id]/actions applies the client distribution gate', () => {
  it.each(BLOCKING)('%s blocks the action', async (_flag, over) => {
    reset(over as Record<string, unknown>);
    const res = await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    expect({ status: res.status, why: 'a listing the client may not receive may not be acted on for them' })
      .toEqual({ status: 400, why: expect.any(String) });
  });

  it.each(BLOCKING)('%s writes NO ClientListingAction and NO audit event', async (_flag, over) => {
    reset(over as Record<string, unknown>);
    await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    expect({
      upserts: clientListingActionUpsert.mock.calls.length,
      audits: logAuditEventMock.mock.calls.length,
      why: 'a refused action must leave no trace of having happened — no row AND no audit entry',
    }).toEqual({ upserts: 0, audits: 0, why: expect.any(String) });
  });

  it('a fully permissive listing still reaches the existing action logic', async () => {
    reset();
    const res = await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    expect(res.status).toBe(201);
    expect(clientListingActionUpsert).toHaveBeenCalledTimes(1);
    // Non-vacuity guard for the refusal test above: the audit DOES fire on the success path, so asserting
    // `audits: 0` on a refusal is a meaningful claim rather than a count that is always zero.
    expect({ audits: logAuditEventMock.mock.calls.length, why: 'proves the zero-audit assertion is not vacuous' })
      .toEqual({ audits: 1, why: expect.any(String) });
  });

  it('the refusal names the violated gate, so an operator can fix the listing', async () => {
    reset({ owner_opt_out: true });
    const res = await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    const json = await readJson(res) as { error?: string };
    expect(String(json.error ?? '')).toMatch(/REBNY|distribution/i);
  });
});

describe('B · ComingSoon D3/D4 stays a SEPARATE business rule, not conflated with the gate', () => {
  it('ComingSoon still blocks offer and schedule on an otherwise permissive listing', async () => {
    for (const action of ['offer', 'schedule']) {
      reset({ status: 'ComingSoon' });
      const res = await ACTIONS_POST(actionsReq({ action, listing_id: 'LIST-001' }), actionsParams);
      expect({ action, status: res.status, why: 'UCBA D3/D4 is its own rule with its own status code' })
        .toEqual({ action, status: 422, why: expect.any(String) });
    }
  });

  it('ComingSoon still ALLOWS liked — the D3/D4 rule is scoped to offer/schedule only', async () => {
    reset({ status: 'ComingSoon' });
    const res = await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    expect(res.status).toBe(201);
  });

  it('a distribution-gated ComingSoon listing is refused by the DISTRIBUTION gate (400), not D3/D4 (422)', async () => {
    reset({ status: 'ComingSoon', owner_opt_out: true });
    const res = await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A — listing-sends equivalence: extraction must change nothing
// ─────────────────────────────────────────────────────────────────────────────
describe('A · POST /api/crm/listing-sends behaviour is unchanged by the extraction', () => {
  const sendsReq = () =>
    makeRequest({
      method: 'POST',
      url: 'http://localhost/api/crm/listing-sends',
      // `client_ids`, not `lead_ids` — the route destructures client_ids and 400s without it. Getting this
      // wrong made the blocking cases pass for the WRONG reason (missing-body 400, not the gate).
      body: { listing_id: 'LIST-001', client_ids: ['99'], sent_via: 'email' },
    });

  it.each(BLOCKING)('%s still blocks the send with 400', async (_flag, over) => {
    reset(over as Record<string, unknown>);
    const res = await SENDS_POST(sendsReq());
    expect(res.status).toBe(400);
  });

  it.each(BLOCKING)('%s sends NO email', async (_flag, over) => {
    reset(over as Record<string, unknown>);
    await SENDS_POST(sendsReq());
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('all four permissive → the send is still allowed', async () => {
    reset();
    const res = await SENDS_POST(sendsReq());
    expect({ ok: res.status < 400, why: 'the extraction must not tighten a working path' })
      .toEqual({ ok: true, why: expect.any(String) });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Both routes import the ONE definition
// ─────────────────────────────────────────────────────────────────────────────
describe('one definition, two consumers', () => {
  it('neither route hand-writes the four-flag condition any more', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve } = require('path') as typeof import('path');
    const ROOT = resolve(__dirname, '../..');
    for (const f of ['app/api/crm/listing-sends/route.ts', 'app/api/crm/clients/[id]/actions/route.ts']) {
      const src = readFileSync(resolve(ROOT, f), 'utf8');
      expect(src).toContain('evaluateClientDistributionEligibility');
      // The inline copy is gone: no route re-spells the owner_opt_out === true arm itself.
      const code = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      expect(code).not.toMatch(/listing\.owner_opt_out\s*===\s*true/);
      expect(code).not.toMatch(/listing\.participant_only\s*===\s*true/);
    }
  });
});
