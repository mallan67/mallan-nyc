/// <reference types="jest" />
/**
 * CLIENT HARD-DELETE FAIL-CLOSED — canonical Client history must not be physically destroyed by a UI.
 *
 * WHAT THE ROUTE DID. DELETE /api/crm/clients/[id] ran a single prisma.$transaction containing FIFTEEN
 * deleteMany calls followed by prisma.lead.delete. It destroyed, among others:
 *
 *   - ClientListingAction — which carries the client's portal OFFER submissions (action "offer",
 *     app/api/portal/offers/route.ts:281) and the listing-send / search-alert delivery history
 *     (action "sent", listing-sends/route.ts:247,254 and lib/search/alert-delivery-history.ts:146)
 *   - Showing and ShowingFeedback, SavedSearch, Comment, FollowUpTask, ActivityLog, sessions, scores
 *
 * WHY THAT IS A COMPLIANCE DEFECT, not merely a data-loss risk. The canonical retention schedule
 * (docs/compliance/COMPLIANCE-CANONICAL-INDEX.md §14, NY SHIELD §899-bb) says lead PII inactive 3 years is
 * ARCHIVED, not deleted, and holds transaction records for 6 years under NY DOS. UCBA Art. II §11 requires
 * a Participant to verify to a seller, on request, that an offer was transmitted — the evidence for that
 * lives in the rows this transaction destroyed.
 *
 * THE FIX IS NOT "MAKE DELETION WORK". Two required Lead relations absent from the cascade list —
 * ActiveLease.landlord (prisma/schema.prisma:1071) and BuyerIntentProfile.lead (:1495) — are FK RESTRICT,
 * so the transaction already rolls back as a 500 for any client holding those rows. Adding the missing
 * cascades would have made destruction MORE reliable. It is disabled instead.
 *
 * THE DELETE EXPORT SURVIVES DELIBERATELY. Removing the handler would turn a stale caller's request into a
 * 405 from the framework; keeping it makes the boundary explicit and auditable, so an old bookmarklet, a
 * cached build or a direct HTTP client gets a reasoned 409 and changes nothing.
 *
 * SCOPE. No schema change, no archive implementation, no FK weakening. The lifecycle question — archived_at
 * vs status vs anonymisation — is Lane 3 and is NOT decided here.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const LEAD = { id: 42n, email: 'jane@example.com', first_name: 'Jane', last_name: 'Buyer', agent_id: 'agent-1' };

let leadRow: Record<string, unknown> | null = { ...LEAD };

const leadFindUnique = jest.fn(async () => leadRow);
const leadDelete = jest.fn(async (_args?: unknown) => ({ ...LEAD }));

/** Every destructive call the old transaction made, held by reference so silence is provable. */
const destructive: Record<string, jest.Mock> = {};
for (const model of [
  'clientPreference', 'clientListingAction', 'session', 'activityLog', 'followUpTask',
  'showingFeedback', 'showing', 'notification', 'leadScore', 'convictionScore',
  'savedSearch', 'comment', 'intentEvent', 'behavioralEvent', 'familyMember',
]) {
  destructive[model] = jest.fn(async (_args?: unknown) => ({ count: 1 }));
}

const seed: Record<string, Record<string, unknown>> = {
  lead: { findUnique: leadFindUnique, delete: leadDelete },
};
for (const [model, fn] of Object.entries(destructive)) seed[model] = { deleteMany: fn };

const { prisma: prismaMock } = buildPrismaMock(seed);
// $transaction must actually resolve the array it is handed, or the destructive calls would never be
// observed and every "no write happened" assertion below would pass vacuously.
(prismaMock as unknown as { $transaction: unknown }).$transaction = jest.fn(async (ops: unknown) =>
  Array.isArray(ops) ? Promise.all(ops) : ops
);
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

let readonlyBlocked: unknown = null;
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => readonlyBlocked,
}));

let authRole = 'BROKER';
const logAuditEventMock = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAuth: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: authRole })),
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: authRole })),
  isAuthError: () => false,
  logAuditEvent: logAuditEventMock,
}));
jest.mock('@/lib/compliance/rls-enforcement', () => ({ __esModule: true, scanTextForFairHousing: () => [] }));
jest.mock('@/lib/lead-distribution/assign', () => ({ __esModule: true, assignLeadToAgent: jest.fn(async () => undefined) }));

import { DELETE } from '@/app/api/crm/clients/[id]/route';

const req = () => makeRequest({ method: 'DELETE', url: 'http://localhost/api/crm/clients/42' });
const params = { params: Promise.resolve({ id: '42' }) };

function reset(over: { role?: string; lead?: Record<string, unknown> | null; readonly?: unknown } = {}) {
  authRole = over.role ?? 'BROKER';
  leadRow = over.lead === undefined ? { ...LEAD } : over.lead;
  readonlyBlocked = over.readonly ?? null;
  leadFindUnique.mockClear();
  leadDelete.mockClear();
  logAuditEventMock.mockClear();
  Object.values(destructive).forEach((m) => m.mockClear());
}

/** Total destructive calls observed across every model, plus the parent delete. */
function destructionCensus() {
  const perModel = Object.entries(destructive)
    .filter(([, m]) => m.mock.calls.length > 0)
    .map(([name]) => name);
  return { deleteManyModels: perModel, leadDelete: leadDelete.mock.calls.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// A — the boundary now refuses, non-destructively
// ─────────────────────────────────────────────────────────────────────────────
describe('A · an authorised broker DELETE is refused without destroying anything', () => {
  it('returns 409 Conflict', async () => {
    reset();
    const res = await DELETE(req(), params);
    expect(res.status).toBe(409);
  });

  it('the refusal says WHY, and points at the governed lifecycle rather than implying a bug', async () => {
    reset();
    const json = (await readJson(await DELETE(req(), params))) as { error?: string };
    const msg = String(json.error ?? '');
    expect(msg).toMatch(/history/i);
    expect(msg).toMatch(/deactivat|archiv/i);
  });

  it('NOT ONE history row is deleted — no deleteMany fires on any of the fifteen models', async () => {
    reset();
    await DELETE(req(), params);
    expect(destructionCensus()).toEqual({ deleteManyModels: [], leadDelete: 0 });
  });

  it('prisma.lead.delete never fires', async () => {
    reset();
    await DELETE(req(), params);
    expect(leadDelete).not.toHaveBeenCalled();
  });

  it('no delete audit event is written — nothing happened, so nothing is recorded as having happened', async () => {
    reset();
    await DELETE(req(), params);
    const deletes = logAuditEventMock.mock.calls.filter((c) => c[0] === 'delete');
    expect(deletes).toEqual([]);
  });

  it('the client-facing history the transaction used to destroy is specifically untouched', async () => {
    // Named explicitly because these are the compliance-bearing ones: portal offers and delivery history
    // both live in ClientListingAction, and showings/feedback are UCBA transaction evidence.
    reset();
    await DELETE(req(), params);
    expect({
      clientListingAction: destructive.clientListingAction.mock.calls.length,
      showing: destructive.showing.mock.calls.length,
      showingFeedback: destructive.showingFeedback.mock.calls.length,
      savedSearch: destructive.savedSearch.mock.calls.length,
      activityLog: destructive.activityLog.mock.calls.length,
    }).toEqual({ clientListingAction: 0, showing: 0, showingFeedback: 0, savedSearch: 0, activityLog: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the gates that already existed are still authoritative, and still come FIRST
// ─────────────────────────────────────────────────────────────────────────────
describe('B · the pre-existing refusals are unchanged and still precede the new one', () => {
  it('a non-broker licensee still gets 403, not 409 — the role gate runs first', async () => {
    reset({ role: 'AGENT' });
    const res = await DELETE(req(), params);
    expect(res.status).toBe(403);
    expect(destructionCensus()).toEqual({ deleteManyModels: [], leadDelete: 0 });
  });

  it('a missing client still gets 404, not 409 — existence is still checked', async () => {
    reset({ lead: null });
    const res = await DELETE(req(), params);
    expect(res.status).toBe(404);
  });

  it('the readonly guard remains authoritative and short-circuits before everything', async () => {
    const guard = { status: 503, __guard: true };
    reset({ readonly: guard });
    const res = await DELETE(req(), params);
    expect(res).toBe(guard as unknown as Response);
    expect(leadFindUnique).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — NON-VACUITY: prove the mocks would have caught a destructive handler
// ─────────────────────────────────────────────────────────────────────────────
describe('C · the destruction census is not silent by construction', () => {
  it('the harness observes destructive calls when they actually happen', async () => {
    // Before the correction this exact harness recorded all fifteen deleteMany models plus
    // leadDelete: 1 on a broker DELETE. Group A above asserts that same census is now empty, so the
    // empty result has to be a refusal rather than a harness that never watches anything. This test
    // drives the mocks directly through the same $transaction the handler used.
    reset();
    await (prismaMock as unknown as { $transaction: (o: unknown) => Promise<unknown> }).$transaction([
      destructive.clientListingAction({ where: { lead_id: 42n } }),
      destructive.showing({ where: { lead_id: 42n } }),
      leadDelete({ where: { id: 42n } }),
    ]);
    expect(destructionCensus()).toEqual({
      deleteManyModels: ['clientListingAction', 'showing'],
      leadDelete: 1,
    });
  });

  it('the DELETE export still exists — the boundary is explicit, not an accidental 405', async () => {
    expect(typeof DELETE).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — the FK constraints that already block some deletions must NOT be weakened
// ─────────────────────────────────────────────────────────────────────────────
describe('D · no FK cascade was added to make destruction more reliable', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

  it.each([
    ['ActiveLease.landlord', /landlord\s+Lead\s+@relation\("LandlordActiveLeases"[^)]*\)/],
    ['BuyerIntentProfile.lead', /lead\s+Lead\s+@relation\([^)]*\)/],
  ])('%s still has NO onDelete cascade', (_label, pattern) => {
    const m = schema.match(pattern);
    expect(m).not.toBeNull();
    expect(String(m && m[0])).not.toMatch(/onDelete:\s*Cascade/);
  });

  it('the route no longer contains a $transaction at all', () => {
    const src = readFileSync(resolve(__dirname, '../../app/api/crm/clients/[id]/route.ts'), 'utf8');
    const stripped = src
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toContain('$transaction');
    expect(stripped).not.toContain('prisma.lead.delete');
  });
});
