/// <reference types="jest" />
/**
 * /api/crm/clients/[id]/actions is a CRM / LICENSEE route. It is not the Client Portal reaction endpoint.
 *
 * OWNER RULING 2026-09-15, after the Correction 1 census. Portal route ownership is resolved:
 *
 *   Portal clients react through  /api/portal/listings/[id]/react
 *     — app/portal/buyer/page.tsx:420 and app/portal/tenant/page.tsx:353 both call it directly;
 *     — it enforces the portal boundary with requirePortalRole(req, "buyer", "renter") and writes
 *       ClientListingAction using the lead's own session identity.
 *   CRM agents / licensees act through  /api/crm/clients/[id]/actions
 *
 * So lead-session access to the CRM route was never load-bearing: its only repo-level caller is the
 * MallanAPI.clients.recordAction() wrapper (public/crm/js/core/api-client.js:420), which has ZERO call
 * sites. Preserving portal access "because it theoretically supports it" would have kept a dual-purpose
 * write endpoint alive for no consumer.
 *
 * TWO DEFECTS THIS CLOSES
 *
 * 1. FAIL-OPEN AUTHORIZATION. The route branched on auth.userType with NO else arm — :65 handled 'agent',
 *    :69 handled 'lead', and any third value fell through to the write with no access check at all.
 *    SessionUser.userType is typed "agent" | "lead" and createSession() accepts only those, so the branch
 *    was unreachable in practice — but validateSession() CASTS the persisted session.user_type to that
 *    union rather than validating it, so a legacy or unexpected database value could cross the boundary.
 *    requireAgentOrBroker (lib/auth/middleware.ts:114) tests `userType !== "agent"` and refuses, which
 *    closes the hole by construction rather than by adding another branch.
 *
 * 2. A LOCAL RESTATEMENT OF AN ACCESS RULE. The route spelled out `auth.role !== "BROKER" &&
 *    lead.agent_id !== auth.userId` itself — one of TEN inline copies of that predicate in the repo. It
 *    now calls the canonical assertLeadAccess() (lib/crm/access.ts:10) instead.
 *
 * DELIBERATELY UNCHANGED HERE
 *   - the shared client-distribution gate added in 02ad8e99 — still applied, still proven below;
 *   - the ComingSoon D3/D4 rule — at the time, still a SEPARATE business rule here with its own 422.
 *     SUPERSEDED: Step 3 removed "schedule" and "offer" from this route's vocabulary, so it no longer
 *     enforces that rule and cannot reach it. The rule is owned by the live writers (REG-7, 8ea3f79d) and
 *     proven in coming-soon-transaction-parity.test.ts. What this route still owns is reactions;
 *   - app/api/portal/listings/[id]/react/route.ts — NOT touched in this packet.
 *
 * REGISTERED SEPARATELY, NOT FIXED HERE: validateSession() trusts session.user_type through a TypeScript
 * cast. That is an authentication-hardening concern deserving its own bounded invariant — reject any
 * persisted session whose user_type is not exactly "agent" or "lead" — and it is not folded into this
 * batch.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import { NextResponse } from 'next/server';
import { isLicenseeAccessRole } from '@/lib/agents/brokerage-role';

const cleanListing = {
  id: 7n,
  listing_id: 'LIST-001',
  status: 'Active',
  listing_type: 'sale',
  list_price: 1500000,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
};

/** The session the route will see. Mutated per test. */
let session: { userId: string; userType: string; role: string } = { userId: 'agent-1', userType: 'agent', role: 'AGENT' };
/** The lead the access helper will find. `agent_id` decides ownership. */
let leadRow: Record<string, unknown> | null = { id: 99n, agent_id: 'agent-1' };
let listingRow: Record<string, unknown> = { ...cleanListing };

const listingFindUnique = jest.fn(async () => listingRow);
const leadFindUnique = jest.fn(async () => leadRow);
const clientListingActionUpsert = jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 200n, listing_id: 7n, action: 'liked', ...args.create }));

const { prisma: prismaMock } = buildPrismaMock({
  listing: { findUnique: listingFindUnique },
  lead: { findUnique: leadFindUnique },
  clientListingAction: { upsert: clientListingActionUpsert },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  // A FAITHFUL stand-in for the real boundary, not a permissive stub: it applies the same predicate as
  // lib/auth/middleware.ts:114 — userType must be exactly "agent" AND the role must be a licensee role —
  // using the REAL isLicenseeAccessRole. The source pins below prove the route wires up the real helper.
  requireAgentOrBroker: jest.fn(async () => {
    if (session.userType !== 'agent' || !isLicenseeAccessRole(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    return session;
  }),
  requireAuth: jest.fn(async () => session),
  isAuthError: (v: unknown) => v instanceof NextResponse,
  logAuditEvent: logAuditEventMock,
}));

import { POST } from '@/app/api/crm/clients/[id]/actions/route';

const req = (body: Record<string, unknown> = { action: 'liked', listing_id: 'LIST-001' }) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/99/actions', body });
const params = { params: Promise.resolve({ id: '99' }) };

function reset(opts: { session?: typeof session; lead?: Record<string, unknown> | null; listing?: Record<string, unknown> } = {}) {
  session = opts.session ?? { userId: 'agent-1', userType: 'agent', role: 'AGENT' };
  leadRow = opts.lead === undefined ? { id: 99n, agent_id: 'agent-1' } : opts.lead;
  listingRow = { ...cleanListing, ...(opts.listing ?? {}) };
  [listingFindUnique, leadFindUnique, clientListingActionUpsert, logAuditEventMock].forEach((m) => m.mockClear());
}

describe('the CRM action route is licensee-only', () => {
  it('a LEAD / portal session is refused — the portal has its own route', async () => {
    reset({ session: { userId: 'lead-99', userType: 'lead', role: 'BUYER' } });
    const res = await POST(req(), params);
    expect({ status: res.status, why: 'portal clients react through /api/portal/listings/[id]/react' })
      .toEqual({ status: 403, why: expect.any(String) });
  });

  it('a lead session writes NOTHING', async () => {
    reset({ session: { userId: 'lead-99', userType: 'lead', role: 'BUYER' } });
    await POST(req(), params);
    expect({ upserts: clientListingActionUpsert.mock.calls.length, audits: logAuditEventMock.mock.calls.length })
      .toEqual({ upserts: 0, audits: 0 });
  });

  it('an UNEXPECTED userType is refused — the fail-open else arm is closed by construction', async () => {
    // validateSession() casts the persisted user_type rather than validating it, so a legacy or unexpected
    // database value could once have reached the write with no access check at all.
    for (const userType of ['admin', 'service', '', 'AGENT']) {
      reset({ session: { userId: 'x-1', userType, role: 'AGENT' } });
      const res = await POST(req(), params);
      expect({ userType, status: res.status, why: 'anything that is not exactly "agent" is refused' })
        .toEqual({ userType, status: 403, why: expect.any(String) });
      expect(clientListingActionUpsert).not.toHaveBeenCalled();
    }
  });

  it('a non-licensee role is refused even with userType agent', async () => {
    reset({ session: { userId: 'agent-1', userType: 'agent', role: 'VIEWER' } });
    expect((await POST(req(), params)).status).toBe(403);
  });
});

describe('ownership comes from the canonical helper, not a local restatement', () => {
  it('an agent who OWNS the client may act', async () => {
    reset();
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(clientListingActionUpsert).toHaveBeenCalledTimes(1);
  });

  it('an agent who does NOT own the client is refused 403', async () => {
    reset({ lead: { id: 99n, agent_id: 'agent-OTHER' } });
    const res = await POST(req(), params);
    expect({ status: res.status, why: 'assertLeadAccess refuses a client that is not this agent\'s' })
      .toEqual({ status: 403, why: expect.any(String) });
    expect(clientListingActionUpsert).not.toHaveBeenCalled();
  });

  it('a BROKER may act on any client, including an unassigned one', async () => {
    reset({ session: { userId: 'broker-1', userType: 'agent', role: 'BROKER' }, lead: { id: 99n, agent_id: null } });
    expect((await POST(req(), params)).status).toBe(201);
  });

  it('a missing client is 404, not 403 — behaviour preserved from the canonical helper', async () => {
    reset({ lead: null });
    expect((await POST(req(), params)).status).toBe(404);
  });
});

describe('the other two gates are untouched by this change', () => {
  it('the client distribution gate from 02ad8e99 still applies', async () => {
    for (const over of [{ owner_opt_out: true }, { participant_only: true }, { idx_display_yn: false }, { internet_entire_listing_display_yn: false }]) {
      reset({ listing: over });
      const res = await POST(req(), params);
      expect({ over, status: res.status }).toEqual({ over, status: 400 });
      expect(clientListingActionUpsert).not.toHaveBeenCalled();
    }
  });

  // Step 3: these two verbs are no longer this route's to accept. The refusal is 400 (unknown vocabulary),
  // NOT 422 (a transaction rule) — this route stopped being a schedule/offer writer, it did not become a
  // stricter one. Their canonical owners are /api/crm/showings and /api/portal/offers.
  it('schedule and offer are refused as unknown vocabulary, with no write', async () => {
    for (const action of ['offer', 'schedule']) {
      reset({ listing: { status: 'Active' } });
      const res = await POST(req({ action, listing_id: 'LIST-001' }), params);
      expect({ action, status: res.status }).toEqual({ action, status: 400 });
      expect(clientListingActionUpsert).not.toHaveBeenCalled();
    }
  });

  it('ComingSoon still allows liked — reacting was never the prohibited act', async () => {
    reset({ listing: { status: 'ComingSoon' } });
    expect((await POST(req(), params)).status).toBe(201);
  });
});

describe('source: the real helpers are wired in, and the local restatement is gone', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const ROOT = resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
  const stripComments = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

  it('the CRM action route uses requireAgentOrBroker and assertLeadAccess', () => {
    const code = stripComments(read('app/api/crm/clients/[id]/actions/route.ts'));
    expect(code).toContain('requireAgentOrBroker');
    expect(code).toContain('assertLeadAccess');
  });

  it('it no longer restates the broker/ownership predicate itself', () => {
    const code = stripComments(read('app/api/crm/clients/[id]/actions/route.ts'));
    expect(code).not.toMatch(/auth\.role\s*!==\s*["']BROKER["']/);
    expect(code).not.toMatch(/auth\.userType\s*===\s*["']lead["']/);
  });

  it('the PORTAL reaction route is unchanged and still enforces the portal boundary', () => {
    const portal = read('app/api/portal/listings/[id]/react/route.ts');
    expect(portal).toContain('requirePortalRole');
    // Both portals still call it directly — the CRM route is not their writer.
    expect(read('app/portal/buyer/page.tsx')).toContain('/react');
    expect(read('app/portal/tenant/page.tsx')).toContain('/react');
  });
});
