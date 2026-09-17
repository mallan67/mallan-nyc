/// <reference types="jest" />
/**
 * REG-7 — ComingSoon TRANSACTION parity across the four live writers.
 *
 * PROVEN DEFECT (Correction 4 census, adjudicated 2026-09-15): UCBA Art. I §16 forbids showings on a
 * Coming Soon listing and D3/D4 forbid offers, but of the four server writers that can create one, only
 * the DORMANT route enforced the rule for both actions:
 *
 *   POST /api/crm/showings              — NO ComingSoon block at all
 *   POST /api/portal/offers             — only isListingDisplayable(); see below for why that is not it
 *   POST /api/portal/showings           — had a block, but raw-literal
 *   POST /api/crm/clients/[id]/actions  — the ONLY one covering BOTH schedule and offer (dormant)
 *
 * That ordering is why Step 3 (narrowing VALID_ACTIONS) was held: removing schedule/offer from the dormant
 * route first would have deleted the only implementation of a compliance rule before its canonical owners
 * enforced it.
 *
 * SINCE SUPERSEDED, and the fourth row above is now history rather than current behaviour. Once this file
 * went green, Step 3 removed "schedule" and "offer" from that route's vocabulary entirely, so it no longer
 * enforces — or needs — a ComingSoon rule: it cannot reach one. Group D below was therefore rewritten from
 * a ComingSoon gate into a NEGATIVE OWNERSHIP proof, and the live-writer count in group E dropped from four
 * to three. The ComingSoon rule for schedule and offer is now held exclusively by the three live writers.
 *
 * TWO AXES, NOT ONE — the load-bearing distinction in this file.
 * ComingSoon is DELIBERATELY displayable: lib/compliance/status.ts:141 lists COMING_SOON in
 * ACTIVE_DISPLAY_VALUES and :133 states it outright. So isListingDisplayable() neither does nor should
 * refuse a Coming Soon listing, and an offer route holding only that check holds no transaction rule at
 * all. Visibility and transaction permission are separate axes. Test group E proves the display axis was
 * left alone — a "fix" that made ComingSoon non-displayable would be the 2026-04-30 fail-open/fail-closed
 * error repeated on a new field.
 *
 * SPELLING — why every case runs three times.
 * normalizeStatus()'s INPUT_TO_CANONICAL accepts 'ComingSoon' (status.ts:65), 'Coming Soon' (:82) and
 * 'COMING_SOON' (:87). A raw `status === "ComingSoon"` comparison therefore catches one of three, and a row
 * stored as "Coming Soon" transacted freely. status.ts:22 already warns against comparing against such
 * literals outside the module. All four routes now route this decision through isComingSoonStatus().
 *
 * SCOPE — REG-7 only. Step 3 (VALID_ACTIONS narrowing), Step 5 (recordAction deletion), REG-8 (the
 * output-test toString() defect), the portal-offer -> Offer model convergence, actor provenance and the
 * orphan deletion packet are all separate lanes and are NOT touched here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPrismaMock, makeRequest, readJson } from './helpers';

// Every spelling normalizeStatus() folds to COMING_SOON. A route that blocks only the first is the defect.
const COMING_SOON_SPELLINGS = ['ComingSoon', 'Coming Soon', 'COMING_SOON'] as const;

const cleanListing = {
  id: 7n,
  listing_id: 'LIST-001',
  address: { full: '123 Main St, Apt 4B, New York, NY' },
  list_price: 1500000,
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Condo',
  // Distribution gates permissive: the listing IS displayable in every case below, so a refusal can only
  // come from the ComingSoon transaction rule and never from the display gate.
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
};

let listingRow: Record<string, unknown> = { ...cleanListing };

const listingFindUnique = jest.fn(async () => listingRow);
const leadFindUnique = jest.fn(async () => ({
  id: 99n,
  agent_id: 'agent-1',
  portal_role: 'buyer',
  primary_portal_role: 'buyer',
  roles: ['buyer'],
  first_name: 'Jane',
  last_name: 'Buyer',
  email: 'jane@example.com',
  buyer_rep_agreement: true,
  buyer_rep_agreement_date: new Date('2026-01-01'),
}));
const agentFindUnique = jest.fn(async () => ({ first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc' }));

const showingCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 500n, ...args.data }));
const followUpTaskCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 300n, ...args.data }));
const clientListingActionCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 200n, ...args.data }));
const clientListingActionUpsert = jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 201n, ...args.create }));
const clientListingActionFindUnique = jest.fn(async () => null);
const auditEventCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: 100n, created_at: new Date(), ...args.data }));

const { prisma: prismaMock } = buildPrismaMock({
  listing: { findUnique: listingFindUnique },
  agent: { findUnique: agentFindUnique },
  lead: { findUnique: leadFindUnique },
  showing: { create: showingCreate },
  followUpTask: { create: followUpTaskCreate },
  clientListingAction: {
    create: clientListingActionCreate,
    upsert: clientListingActionUpsert,
    findUnique: clientListingActionFindUnique,
  },
  auditEvent: { create: auditEventCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

// Held by reference so a refusal can be proven to leave NO audit trace, not merely no row.
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  // Portal routes gate on userType === 'lead'; CRM routes use requireAgentOrBroker. Separate functions,
  // so one mock module serves all four routes without either boundary being weakened.
  requireAuth: jest.fn(async () => ({ userId: 99n, userType: 'lead', role: 'LEAD' })),
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'AGENT' })),
  isAuthError: () => false,
  logAuditEvent: logAuditEventMock,
}));

const sendEmailMock = jest.fn(async () => ({ success: true }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));
jest.mock('@/lib/email/templates', () => ({
  __esModule: true,
  showingConfirmEmail: () => '<html>confirm</html>',
  listingSendEmail: () => '<html>body</html>',
}));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));

const recordPortalEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/portal/events', () => ({ __esModule: true, recordPortalEvent: recordPortalEventMock }));

// Ownership/licensee boundaries are proven in crm-actions-licensee-only.test.ts against the real predicate;
// granting here isolates the ComingSoon rule under test.
jest.mock('@/lib/crm/access', () => ({
  __esModule: true,
  assertLeadIdsAccess: jest.fn(async () => ({ response: null })),
  assertLeadAccess: jest.fn(async () => null),
}));

// Imported AFTER the mocks.
import { POST as CRM_SHOWINGS_POST } from '@/app/api/crm/showings/route';
import { POST as PORTAL_OFFERS_POST } from '@/app/api/portal/offers/route';
import { POST as PORTAL_SHOWINGS_POST } from '@/app/api/portal/showings/route';
import { POST as ACTIONS_POST } from '@/app/api/crm/clients/[id]/actions/route';
import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { isComingSoonStatus } from '@/lib/compliance/status';

const ALL_WRITERS = [
  showingCreate,
  followUpTaskCreate,
  clientListingActionCreate,
  clientListingActionUpsert,
  auditEventCreate,
  logAuditEventMock,
  sendEmailMock,
  recordPortalEventMock,
];

function reset(over: Record<string, unknown> = {}) {
  listingRow = { ...cleanListing, ...over };
  [...ALL_WRITERS, listingFindUnique, clientListingActionFindUnique].forEach((m) => m.mockClear());
}

// Far-future so /api/portal/showings' "must be in the future" guard never masks the rule under test.
const FUTURE = '2027-01-15T10:00:00.000Z';

const crmShowingReq = (body: Record<string, unknown>) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/crm/showings', body });
const portalOfferReq = (body: Record<string, unknown>) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/portal/offers', body });
const portalShowingReq = (body: Record<string, unknown>) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/portal/showings', body });
const actionsReq = (body: Record<string, unknown>) =>
  makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/99/actions', body });
const actionsParams = { params: Promise.resolve({ id: '99' }) };

/** Every durable side effect must be absent. "No row" alone is not a refusal. */
function expectNoPersistentSideEffect() {
  expect({
    showing: showingCreate.mock.calls.length,
    followUpTask: followUpTaskCreate.mock.calls.length,
    clientListingActionCreate: clientListingActionCreate.mock.calls.length,
    clientListingActionUpsert: clientListingActionUpsert.mock.calls.length,
    auditEventRow: auditEventCreate.mock.calls.length,
    auditEventHelper: logAuditEventMock.mock.calls.length,
    email: sendEmailMock.mock.calls.length,
    portalEvent: recordPortalEventMock.mock.calls.length,
  }).toEqual({
    showing: 0,
    followUpTask: 0,
    clientListingActionCreate: 0,
    clientListingActionUpsert: 0,
    auditEventRow: 0,
    auditEventHelper: 0,
    email: 0,
    portalEvent: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A — CRM showings (agent-created). Had NO block at all.
// ─────────────────────────────────────────────────────────────────────────────
describe('A · POST /api/crm/showings refuses a Coming Soon listing', () => {
  it.each(COMING_SOON_SPELLINGS)('blocks status %s', async (status) => {
    reset({ status });
    const res = await CRM_SHOWINGS_POST(crmShowingReq({ listing_id: '7', lead_id: '99', date: FUTURE }));
    expect(res.status).toBe(422);
    expectNoPersistentSideEffect();
  });

  it('a blocked request writes NO Showing, NO follow-up task, NO audit event and sends NO confirmation email', async () => {
    reset({ status: 'Coming Soon' });
    await CRM_SHOWINGS_POST(crmShowingReq({ listing_id: '7', lead_id: '99', date: FUTURE }));
    expectNoPersistentSideEffect();
  });

  // NON-VACUITY: proves the mocked writers really do fire when the rule permits, so the zeros above are a
  // refusal and not a broken harness.
  it('NON-VACUITY — an Active listing still creates the showing, the task, the audit event and the email', async () => {
    reset({ status: 'Active' });
    const res = await CRM_SHOWINGS_POST(crmShowingReq({ listing_id: '7', lead_id: '99', date: FUTURE }));
    expect(res.status).toBe(201);
    expect({
      showing: showingCreate.mock.calls.length,
      followUpTask: followUpTaskCreate.mock.calls.length,
      audit: logAuditEventMock.mock.calls.length,
      email: sendEmailMock.mock.calls.length,
    }).toEqual({ showing: 1, followUpTask: 1, audit: 1, email: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — Portal offers. Had only isListingDisplayable(), which does not refuse ComingSoon.
// ─────────────────────────────────────────────────────────────────────────────
describe('B · POST /api/portal/offers refuses a Coming Soon listing', () => {
  it.each(COMING_SOON_SPELLINGS)('blocks status %s', async (status) => {
    reset({ status });
    const res = await PORTAL_OFFERS_POST(portalOfferReq({ listing_id: '7', amount: 1500000 }));
    expect(res.status).toBe(422);
    expectNoPersistentSideEffect();
  });

  it('a blocked request creates NO ClientListingAction, NO audit event and NO portal event', async () => {
    reset({ status: 'COMING_SOON' });
    await PORTAL_OFFERS_POST(portalOfferReq({ listing_id: '7', amount: 1500000 }));
    expectNoPersistentSideEffect();
  });

  it('NON-VACUITY — an Active listing still records the offer, the audit event and the portal event', async () => {
    reset({ status: 'Active' });
    const res = await PORTAL_OFFERS_POST(portalOfferReq({ listing_id: '7', amount: 1500000 }));
    expect(res.status).toBeLessThan(400);
    expect({
      offer: clientListingActionCreate.mock.calls.length,
      audit: logAuditEventMock.mock.calls.length,
    }).toEqual({ offer: 1, audit: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — Portal showings. Had the rule, but only for one spelling.
// ─────────────────────────────────────────────────────────────────────────────
describe('C · POST /api/portal/showings keeps its prohibition for every spelling', () => {
  it.each(COMING_SOON_SPELLINGS)('blocks status %s', async (status) => {
    reset({ status });
    const res = await PORTAL_SHOWINGS_POST(portalShowingReq({ listing_id: '7', date: FUTURE }));
    expect(res.status).toBe(422);
    expectNoPersistentSideEffect();
  });

  it('NON-VACUITY — an Active listing still creates the showing', async () => {
    reset({ status: 'Active' });
    const res = await PORTAL_SHOWINGS_POST(portalShowingReq({ listing_id: '7', date: FUTURE }));
    expect(res.status).toBeLessThan(400);
    expect(showingCreate.mock.calls.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — The dormant route. Its rule must survive normalization unchanged, and must not widen.
// ─────────────────────────────────────────────────────────────────────────────
describe('D · the CRM action route cannot reach a ComingSoon decision, because it no longer owns the verbs', () => {
  // NOT a ComingSoon gate — deliberately. After Step 3 this route refuses "schedule" and "offer" as unknown
  // vocabulary (400), before listing status is ever consulted. Asserting 422 here again would re-describe
  // it as a transaction-rule owner, which is exactly the ownership confusion the lane removed.
  // The transaction rule itself is proven on the live writers in groups A, B and C above.
  it.each(['schedule', 'offer'] as const)('%s is refused as unknown vocabulary, not as a ComingSoon block', async (action) => {
    reset({ status: 'ComingSoon' });
    const res = await ACTIONS_POST(actionsReq({ action, listing_id: 'LIST-001' }), actionsParams);
    expect({ action, status: res.status }).toEqual({ action, status: 400 });
    expectNoPersistentSideEffect();
  });

  it.each(['schedule', 'offer'] as const)('%s is refused on an ACTIVE listing too, proving status is irrelevant here', async (action) => {
    reset({ status: 'Active' });
    const res = await ACTIONS_POST(actionsReq({ action, listing_id: 'LIST-001' }), actionsParams);
    expect({ action, status: res.status }).toEqual({ action, status: 400 });
    expectNoPersistentSideEffect();
  });

  // Reacting to a Coming Soon listing was always legal and still is: the rule bars transacting, not
  // touching. A Step 3 that broke this would have over-corrected.
  it.each(COMING_SOON_SPELLINGS)('liked remains ALLOWED on %s', async (status) => {
    reset({ status });
    const res = await ACTIONS_POST(actionsReq({ action: 'liked', listing_id: 'LIST-001' }), actionsParams);
    expect(res.status).toBeLessThan(400);
    expect(clientListingActionUpsert.mock.calls.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — Negative architecture proof. The display axis must be untouched.
// ─────────────────────────────────────────────────────────────────────────────
describe('E · the DISPLAY axis was not altered to achieve the TRANSACTION rule', () => {
  it.each(COMING_SOON_SPELLINGS)('a Coming Soon listing (%s) remains DISPLAYABLE', (status) => {
    // If this ever goes false, the fix suppressed Coming Soon listings from IDX rather than making them
    // non-transactable — the 2026-04-30 incident shape on a different field.
    expect(isListingDisplayable({ ...cleanListing, status } as never)).toBe(true);
  });

  it('isComingSoonStatus folds every accepted spelling, which raw equality does not', () => {
    for (const s of COMING_SOON_SPELLINGS) expect(isComingSoonStatus(s)).toBe(true);
    // The exact gap the raw comparison left open.
    expect(COMING_SOON_SPELLINGS.filter((s) => s === 'ComingSoon').length).toBe(1);
    expect(isComingSoonStatus('Active')).toBe(false);
  });

  it('ACTIVE_DISPLAY_VALUES still contains ComingSoon', async () => {
    const { ACTIVE_DISPLAY_VALUES } = await import('@/lib/compliance/status');
    expect(ACTIVE_DISPLAY_VALUES).toContain('ComingSoon');
  });

  // SECONDARY proof only — the behavioural cases above are what actually establish the rule. This exists to
  // catch a regression that reintroduces a route-local status interpreter, which behaviour alone would not
  // distinguish from a correct fix until someone stored a different spelling.
  it('all three LIVE writer routes decide this rule through isComingSoonStatus(), never raw equality', () => {
    // Comments are stripped first: this file's own explanatory prose names the literals it bans, and an
    // unstripped scan would flag the documentation rather than the code. Split on a CR-optional newline —
    // this tree is CRLF, and a trailing CR terminates the line, so a `.*$` comment strip silently fails.
    const strip = (s: string) =>
      s
        .split(/\r?\n/)
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    // The CRM action route is deliberately absent: Step 3 removed "schedule" and "offer" from it, so it
    // holds no ComingSoon decision to make. Requiring the helper there would demand a rule the route can no
    // longer reach — and would quietly reinstate it as a transaction-rule owner.
    const ROUTES = [
      'app/api/crm/showings/route.ts',
      'app/api/portal/showings/route.ts',
      'app/api/portal/offers/route.ts',
    ];

    const report = ROUTES.map((rel) => {
      const src = strip(readFileSync(join(process.cwd(), rel), 'utf8'));
      return {
        route: rel,
        usesHelper: src.includes('isComingSoonStatus('),
        rawEquality: /===\s*["'`]Coming\s?Soon["'`]/i.test(src),
      };
    });

    expect(report).toEqual(
      ROUTES.map((route) => ({ route, usesHelper: true, rawEquality: false }))
    );
  });

  it('the display predicate holds no ComingSoon special case of its own', () => {
    // If isListingDisplayable() ever grows a ComingSoon branch, the two axes have been merged again.
    const src = readFileSync(join(process.cwd(), 'lib/search/listing-access-decision.ts'), 'utf8');
    expect(/Coming\s?Soon/i.test(src)).toBe(false);
  });
});
