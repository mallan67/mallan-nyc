/// <reference types="jest" />
/**
 * CORRECTION 3 / STEP 3 — what /api/crm/clients/[id]/actions OWNS.
 *
 * This route is the licensee-side writer for a client's listing REACTIONS. It accepted five action values,
 * two of which have canonical owners elsewhere:
 *
 *   schedule -> POST /api/crm/showings      (creates a real Showing row, a follow-up task and an email)
 *   offer    -> POST /api/portal/offers     (the client's own submission; separate Offer-lifecycle defect)
 *
 * Accepting them here fragmented showing state across two tables and created a third storage path for
 * offers. Step 3 removes that ownership. It is ROUTE OWNERSHIP convergence, nothing else.
 *
 * WHY THIS COULD NOT HAPPEN EARLIER — the ordering matters and is the point of the whole lane.
 * Until REG-7 (8ea3f79d), this dormant route held the ONLY server-side ComingSoon no-transact rule
 * covering both schedule and offer: /api/crm/showings had no block at all and /api/portal/offers had only
 * isListingDisplayable(), which cannot express the rule because Coming Soon is deliberately displayable.
 * Narrowing first would have deleted the only implementation of a compliance rule before its canonical
 * owners enforced it. REG-7 moved the rule onto the live writers; only then did this become safe.
 *
 * THESE TESTS USE **Active** DELIBERATELY. The question here is not "is this listing transactable?" — it is
 * "does this route own this verb?" A refusal must not depend on listing status at all. The ComingSoon rule
 * now lives with the live writers and is proven in coming-soon-transaction-parity.test.ts.
 *
 * NOT A GLOBAL VOCABULARY CHANGE. "schedule", "offer" and "sent" remain legitimate stored
 * ClientListingAction.action values written by other canonical writers — portal offers
 * (portal/offers/route.ts:281), listing-sends (:242) and search-alert delivery history
 * (alert-delivery-history.ts:146). Group E below proves those writers are untouched. The Prisma schema
 * comment and every other writer's vocabulary are out of scope.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const activeListing = {
  id: 7n,
  listing_id: 'LIST-001',
  address: { full: '123 Main St, Apt 4B, New York, NY' },
  list_price: 1500000,
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Condo',
  // Permissive: every refusal below must be about route ownership, never the distribution gate.
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
};

let listingRow: Record<string, unknown> = { ...activeListing };

const listingFindUnique = jest.fn(async () => listingRow);
const leadFindUnique = jest.fn(async () => ({ id: 99n, agent_id: 'agent-1', first_name: 'Jane', last_name: 'Buyer', email: 'jane@example.com' }));
const clientListingActionUpsert = jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 201n, ...args.create }));
const auditEventCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 100n, created_at: new Date(), ...args.data }));

const { prisma: prismaMock } = buildPrismaMock({
  listing: { findUnique: listingFindUnique },
  lead: { findUnique: leadFindUnique },
  clientListingAction: { upsert: clientListingActionUpsert },
  auditEvent: { create: auditEventCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

// Held by reference so a refusal is proven to leave NO audit trace, not merely no row.
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAuth: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'AGENT' })),
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'AGENT' })),
  isAuthError: () => false,
  logAuditEvent: logAuditEventMock,
}));
// Ownership is proven against the real predicate in crm-actions-licensee-only.test.ts; granting here
// isolates the vocabulary under test.
jest.mock('@/lib/crm/access', () => ({
  __esModule: true,
  assertLeadAccess: jest.fn(async () => null),
  assertLeadIdsAccess: jest.fn(async () => ({ response: null })),
}));

import { POST } from '@/app/api/crm/clients/[id]/actions/route';

const OWNED = ['liked', 'disliked', 'discuss'] as const;
const DISOWNED = ['schedule', 'offer'] as const;

function reset(over: Record<string, unknown> = {}) {
  listingRow = { ...activeListing, ...over };
  [listingFindUnique, clientListingActionUpsert, auditEventCreate, logAuditEventMock].forEach((m) => m.mockClear());
}

const req = (body: Record<string, unknown>) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/99/actions', body });
const params = { params: Promise.resolve({ id: '99' }) };

// ─────────────────────────────────────────────────────────────────────────────
// A — the two disowned verbs are refused as unknown, on a perfectly transactable listing
// ─────────────────────────────────────────────────────────────────────────────
describe('A · schedule and offer are no longer this route\'s vocabulary', () => {
  it.each(DISOWNED)('%s is rejected with 400 on an ACTIVE, fully eligible listing', async (action) => {
    reset();
    const res = await POST(req({ action, listing_id: 'LIST-001' }), params);
    // 400 (unknown verb), NOT 422 (a transaction rule). The distinction is the whole point: this route
    // does not refuse because the listing cannot be transacted on, but because it does not own the verb.
    expect({ action, status: res.status }).toEqual({ action, status: 400 });
  });

  it.each(DISOWNED)('a rejected %s creates NO ClientListingAction and NO audit event', async (action) => {
    reset();
    await POST(req({ action, listing_id: 'LIST-001' }), params);
    expect({
      row: clientListingActionUpsert.mock.calls.length,
      auditHelper: logAuditEventMock.mock.calls.length,
      auditRow: auditEventCreate.mock.calls.length,
    }).toEqual({ row: 0, auditHelper: 0, auditRow: 0 });
  });

  it('the accepted-action contract it advertises names only liked, disliked and discuss', async () => {
    reset();
    const res = await POST(req({ action: 'schedule', listing_id: 'LIST-001' }), params);
    const json = (await readJson(res)) as { error?: string };
    const error = String(json.error ?? '');
    expect(error).toContain('liked');
    expect(error).toContain('disliked');
    expect(error).toContain('discuss');
    // A route that still advertises a verb it refuses is a worse contract than one that never offered it.
    expect(error).not.toContain('schedule');
    expect(error).not.toContain('offer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the three it does own still work, and really persist
// ─────────────────────────────────────────────────────────────────────────────
describe('B · liked, disliked and discuss remain owned here and still persist', () => {
  it.each(OWNED)('%s succeeds on an eligible Active listing', async (action) => {
    reset();
    const res = await POST(req({ action, listing_id: 'LIST-001' }), params);
    expect({ action, status: res.status }).toEqual({ action, status: 201 });
  });

  // NON-VACUITY: proves the mocked writers fire when the verb is owned, so the zeros in group A are a
  // refusal rather than a harness that never wrote anything.
  it.each(OWNED)('NON-VACUITY — %s writes exactly one row and exactly one audit event', async (action) => {
    reset();
    await POST(req({ action, listing_id: 'LIST-001' }), params);
    expect({
      row: clientListingActionUpsert.mock.calls.length,
      audit: logAuditEventMock.mock.calls.length,
    }).toEqual({ row: 1, audit: 1 });
    expect(clientListingActionUpsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({ action, lead_id: 99n, listing_id: 7n })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — Step 3 must not have made ComingSoon globally non-interactable
// ─────────────────────────────────────────────────────────────────────────────
describe('C · a Coming Soon listing is still REACTABLE, only not transactable', () => {
  it.each(['ComingSoon', 'Coming Soon', 'COMING_SOON'])('liked is permitted on %s', async (status) => {
    reset({ status });
    const res = await POST(req({ action: 'liked', listing_id: 'LIST-001' }), params);
    expect({ status, code: res.status }).toEqual({ status, code: 201 });
    expect(clientListingActionUpsert.mock.calls.length).toBe(1);
  });

  it.each(OWNED)('%s is permitted on a Coming Soon listing', async (action) => {
    reset({ status: 'ComingSoon' });
    expect((await POST(req({ action, listing_id: 'LIST-001' }), params)).status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — the gates this packet must NOT have disturbed
// ─────────────────────────────────────────────────────────────────────────────
describe('D · the client distribution gate is untouched by the narrowing', () => {
  it.each([
    ['owner_opt_out', { owner_opt_out: true }],
    ['participant_only', { participant_only: true }],
    ['idx_display_yn', { idx_display_yn: false }],
    ['internet_entire_listing_display_yn', { internet_entire_listing_display_yn: false }],
  ] as const)('%s still blocks an owned action with 400 and no write', async (_flag, over) => {
    reset(over as Record<string, unknown>);
    const res = await POST(req({ action: 'liked', listing_id: 'LIST-001' }), params);
    expect(res.status).toBe(400);
    expect(clientListingActionUpsert).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — the global vocabulary is NOT what changed
// ─────────────────────────────────────────────────────────────────────────────
describe('E · schedule, offer and sent remain valid ClientListingAction values elsewhere', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const ROOT = resolve(__dirname, '../..');
  const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

  it('the portal still writes action="offer" as a real client submission', () => {
    expect(read('app/api/portal/offers/route.ts')).toContain('action: "offer"');
  });

  it('the delivery-history writers still use action="sent"', () => {
    expect(read('app/api/crm/listing-sends/route.ts')).toContain('"sent"');
    expect(read('lib/search/alert-delivery-history.ts')).toContain('"sent"');
  });

  it('the Prisma schema comment still documents the wider vocabulary', () => {
    // Narrowing ONE route must not rewrite the table's meaning. The schema comment being stale about
    // "sent" is REG-5 and is fixed there, not here.
    const schema = read('prisma/schema.prisma');
    expect(schema).toMatch(/schedule/);
    expect(schema).toMatch(/offer/);
  });

  it('the canonical showing writer still exists and is the owner of scheduling', () => {
    expect(read('app/api/crm/showings/route.ts')).toContain('prisma.showing.create');
  });

  it('the portal reaction route keeps its own independent vocabulary', () => {
    // The client-side counterpart is a different actor on a different boundary; Step 3 does not touch it.
    const portal = read('app/api/portal/listings/[id]/react/route.ts');
    expect(portal).toMatch(/liked/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F — public/crm is under hold: Step 5 has not happened
// ─────────────────────────────────────────────────────────────────────────────
describe('F · MallanAPI.clients.recordAction has since been retired (Step 5)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const ROOT = resolve(__dirname, '../..');

  // When this file was written, Step 5 was held and the wrapper had to survive Step 3 untouched. It has
  // since been deleted in Orphan Client Retirement Packet A, together with the rest of the Search-side
  // Client subsystem. The assertion is inverted rather than removed: what mattered then was that Step 3
  // did not quietly take the wrapper with it, and what matters now is that its removal was wrapper-only.
  it('the wrapper is gone, while the route it wrapped is untouched', () => {
    const src = readFileSync(resolve(ROOT, 'public/crm/js/core/api-client.js'), 'utf8');
    expect(src).not.toContain('recordAction');
    expect(src).toContain('listAll:');
    const route = readFileSync(resolve(ROOT, 'app/api/crm/clients/[id]/actions/route.ts'), 'utf8');
    expect(route).toContain('VALID_ACTIONS');
  });
});
