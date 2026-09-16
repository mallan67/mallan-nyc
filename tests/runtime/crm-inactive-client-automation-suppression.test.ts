/// <reference types="jest" />
/**
 * AN INACTIVE CLIENT RECEIVES NO AUTOMATED CLIENT-FACING EMAIL.
 *
 * Safety Packet 1 closed the six authentication doors: an explicitly inactive Lead cannot log in, cannot
 * hold a session, cannot reset a password and cannot be invited or silently reactivated. It did NOT touch
 * automation, and the Lane 3A census proved the gap precisely: NO lifecycle predicate existed anywhere on
 * any automated client-facing send path. A deactivated client kept receiving mail.
 *
 * TWO canonical paths, and only two, belong in this slice:
 *   1. app/api/cron/search-alerts/route.ts — emails a Saved Search audience, which may be Lead-linked
 *   2. lib/lifecycle/engine.ts executeAction 'email' — sends directly to a Lead
 *
 * Everything else that calls sendEmail() is deliberately untouched: manual CRM email, listing sends,
 * showings, lease-tracker outreach, seller-prospect flows (a different model entirely), listing campaigns,
 * agent inquiries, MFA and other transactional mail. Their recipients are agents, listing owners or
 * manually chosen, and each needs its own ownership analysis before a lifecycle rule applies. In
 * particular the rule is NOT pushed into sendEmail() itself — that boundary does not reliably know who the
 * canonical recipient is, and a status lookup there would guess.
 *
 * SUPPRESSION IS NOT CANCELLATION — the load-bearing design point. The run is skipped at the EXECUTION
 * boundary; nothing about the client's configuration is destroyed. `alert_enabled` stays on,
 * `last_alert_sent` is NOT advanced, `result_count` is not rewritten, and no listing is recorded as
 * delivered. Reactivating a client therefore restores exactly the behaviour they had — rather than
 * resuming into a state where the alert window silently closed and inventory was marked already-sent
 * while nothing was ever sent.
 *
 * AND IT SUPPRESSES COMMUNICATION TO THE CLIENT, NOT AWARENESS ABOUT THEM. Lifecycle `notification` and
 * `agent_alert` actions stay live for an inactive Lead: the brokerage may still need follow-up,
 * compliance work or retention review on a deactivated client.
 *
 * ONE TOKEN, reused. Every check below routes through isLeadExplicitlyInactive() from Safety Packet 1.
 * No cron-local inactive set, no second normalizer, no widening: the production stored-value census
 * (SELECT status, pipeline_stage, COUNT(*) FROM leads GROUP BY 1,2) is still OWED — refused twice — so
 * every other status keeps its current behaviour.
 */
import { NextRequest } from 'next/server';

// ── Search-alert cron harness (same shape as search-alert-idempotency.test.ts) ──
const savedSearchFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const savedSearchUpdateMock = jest.fn(async () => ({}));
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const clientActionFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const clientActionUpsertMock = jest.fn(async () => ({}));
const auditFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const auditCreateMock = jest.fn<Promise<{ id: bigint }>, [unknown]>(async () => ({ id: 1n }));

// ── Lifecycle engine mocks ──
const lifecycleTriggerFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const leadFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const leadFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const triggerExecutionFindFirstMock = jest.fn(async () => null);
const triggerExecutionCreateMock = jest.fn(async () => ({}));
const notificationCreateMock = jest.fn(async () => ({}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    savedSearch: { findMany: savedSearchFindManyMock, update: savedSearchUpdateMock },
    listing: { findMany: listingFindManyMock },
    clientListingAction: { findMany: clientActionFindManyMock, upsert: clientActionUpsertMock },
    auditEvent: { findMany: auditFindManyMock, create: auditCreateMock },
    lifecycleTrigger: { findMany: lifecycleTriggerFindManyMock },
    lead: { findMany: leadFindManyMock, findUnique: leadFindUniqueMock },
    triggerExecution: { findFirst: triggerExecutionFindFirstMock, create: triggerExecutionCreateMock },
    notification: { create: notificationCreateMock },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        clientListingAction: { upsert: clientActionUpsertMock },
        auditEvent: { create: auditCreateMock },
        savedSearch: { update: savedSearchUpdateMock },
      })
    ),
  },
}));

const ensureLocalListingMock = jest.fn(async (input: { listing_id: string }) => ({
  id: BigInt(1000 + Number(input.listing_id.replace(/\D/g, '') || 0)),
  listing_id: input.listing_id,
  created: true,
}));
jest.mock('@/lib/listings/ensure-local-listing', () => {
  const actual = jest.requireActual('@/lib/listings/ensure-local-listing');
  return { __esModule: true, ensureLocalListing: ensureLocalListingMock, ensureInputFromSearchDto: actual.ensureInputFromSearchDto };
});

const sendEmailMock = jest.fn<Promise<{ success: boolean }>, unknown[]>(async () => ({ success: true }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));
const recordSearchRunMock = jest.fn(async () => undefined);
jest.mock('@/lib/search/search-run-recorder', () => ({ __esModule: true, recordSearchRun: recordSearchRunMock }));

const settledUniverseForMock = jest.fn();
const hydrateRowsMock = jest.fn();
jest.mock('@/lib/search/engine/executor', () => {
  const actual = jest.requireActual('@/lib/search/engine/executor');
  return {
    __esModule: true,
    settledUniverseFor: settledUniverseForMock,
    hydrateRows: hydrateRowsMock,
    rowsModifiedSince: actual.rowsModifiedSince,
    universeKeyOf: actual.universeKeyOf,
  };
});

// Relative to NOW on purpose: the cron's delta window is `since = last_alert_sent || now - 24h`, so a
// hard-coded date drifts out of the window as the calendar moves and silently produces an empty delta —
// which would make every "no email was sent" assertion below pass without proving anything.
const NEW_TS = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const urow = (id: string, ts: string) => ({
  source: 'provider' as const, listingKey: 'K-' + id, listingId: id,
  price: 1000000, contractDate: null, modificationTimestamp: ts,
});
const universe = (rows: unknown[]) => ({ universe: { rows, total: rows.length, countMeaning: 'exact', providerPages: 1 } });
const dto = (id: string) => ({ id, address: '217 W 57TH ST', unit: '', neighborhood: 'Tribeca', price: 1850000, beds: 2, baths: 2, images: [] });

/** A Lead-linked saved search. `leadStatus` is the only thing under test. */
const alertRow = (leadStatus: string | null, over: Record<string, unknown> = {}) => ({
  id: 5n, agent_id: 42n, lead_id: 77n, name: 'Tribeca 2BR',
  criteria: { criteria_version: 2, params: { type: 'sale', neighborhood: 'Tribeca' } },
  alert_enabled: true, alert_frequency: 'daily', alert_email: 'client@example.com', last_alert_sent: null,
  lead: { id: 77n, first_name: 'Test', last_name: 'Buyer', email: 'client@example.com', status: leadStatus },
  agent: null,
  ...over,
});

const cron = async () => {
  const { GET } = await import('@/app/api/cron/search-alerts/route');
  return GET(new NextRequest('http://test/api/cron/search-alerts', { headers: { authorization: 'Bearer test-cron-secret' } }));
};

const auditActions = () =>
  (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string } }]>).map((c) => c[0].data.action);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  savedSearchFindManyMock.mockResolvedValue([]);
  listingFindManyMock.mockResolvedValue([]);
  clientActionFindManyMock.mockResolvedValue([]);
  auditFindManyMock.mockResolvedValue([]);
  settledUniverseForMock.mockResolvedValue(universe([urow('ID1', NEW_TS)]));
  hydrateRowsMock.mockImplementation(async (rows: Array<{ listingId: string }>) => ({
    listings: rows.map((r) => dto(r.listingId)), missing: [], gateExcluded: [],
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════
// B/H — SEARCH ALERTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('B · a Lead-linked saved search is suppressed when its canonical Lead is inactive', () => {
  it('sends NO email, and reports the run as skipped rather than errored', async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow('inactive')]);
    const res = await cron();
    const body = (await res.json()) as { sent: number; skipped: number; errored: number };
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect({ sent: body.sent, errored: body.errored }).toEqual({ sent: 0, errored: 0 });
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });

  it('J · NOTHING is persisted — no delivery history, no clock advance, no result_count rewrite', async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow('inactive')]);
    await cron();
    // Suppression is not cancellation: reactivation must not find the window closed and the inventory
    // already marked delivered.
    expect({
      sentHistory: clientActionUpsertMock.mock.calls.length,
      savedSearchWrites: savedSearchUpdateMock.mock.calls.length,
      searchRuns: recordSearchRunMock.mock.calls.length,
      localised: ensureLocalListingMock.mock.calls.length,
    }).toEqual({ sentHistory: 0, savedSearchWrites: 0, searchRuns: 0, localised: 0 });
    expect(auditActions()).not.toContain('search_alert_delivered');
  });

  it('records ONE durable suppression audit event, carrying the ids and no recipient PII', async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow('inactive')]);
    await cron();
    const calls = (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string; entity_id: string; changes: Record<string, unknown> } }]>)
      .filter((c) => c[0].data.action === 'search_alert_suppressed_inactive_lead');
    expect(calls.length).toBe(1);
    expect(calls[0][0].data.changes).toEqual(expect.objectContaining({ lead_id: '77' }));
    expect(JSON.stringify(calls[0][0].data.changes)).not.toContain('client@example.com');
  });

  it('C · an alert_email OVERRIDE cannot bypass it — the canonical Lead relationship decides', async () => {
    // The reason for suppression is the Lead link, not whichever email string the cron happens to pick.
    savedSearchFindManyMock.mockResolvedValue([alertRow('inactive', { alert_email: 'someone-else@example.com' })]);
    await cron();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('casing/whitespace variants are suppressed too — one canonical decision, not a local compare', async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow(' Inactive ')]);
    await cron();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('C · audiences that are NOT an inactive canonical Lead keep their existing behaviour', () => {
  it('POSITIVE CONTROL — a Lead-linked search with an active Lead still sends and still records history', async () => {
    savedSearchFindManyMock.mockResolvedValue([alertRow('active')]);
    const res = await cron();
    expect((await res.json()).sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(savedSearchUpdateMock).toHaveBeenCalled();   // the clock DOES advance when a send happened
  });

  it('an AGENT-ONLY saved search is untouched — agent automation is not client automation', async () => {
    savedSearchFindManyMock.mockResolvedValue([
      alertRow(null, { lead_id: null, lead: null, agent: { id: 42n, first_name: 'A', last_name: 'B', email: 'a@example.com' } }),
    ]);
    const res = await cron();
    expect((await res.json()).sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('a Lead with an unknown/other status keeps current behaviour — no vocabulary is invented', async () => {
    for (const s of ['closed', 'past', 'nurturing', null]) {
      jest.clearAllMocks();
      settledUniverseForMock.mockResolvedValue(universe([urow('ID1', NEW_TS)]));
      hydrateRowsMock.mockImplementation(async (rows: Array<{ listingId: string }>) => ({
        listings: rows.map((r) => dto(r.listingId)), missing: [], gateExcluded: [],
      }));
      savedSearchFindManyMock.mockResolvedValue([alertRow(s)]);
      auditFindManyMock.mockResolvedValue([]);
      clientActionFindManyMock.mockResolvedValue([]);
      await cron();
      expect({ status: s, sends: sendEmailMock.mock.calls.length }).toEqual({ status: s, sends: 1 });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D/I — LIFECYCLE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const emailTrigger = (actionType = 'email') => ({
  id: 9n, name: 'Quarterly Nurture', trigger_type: 'quarterly_nurture',
  conditions: {}, action_type: actionType, action_config: {}, cooldown_hours: 72, enabled: true,
});

const lifecycle = async () => {
  const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
  return evaluateAllTriggers();
};

/** A candidate the quarterly-nurture finder will return, plus the lead the email action re-reads. */
function seedLifecycle(status: string | null) {
  lifecycleTriggerFindManyMock.mockResolvedValue([emailTrigger()]);
  leadFindManyMock.mockResolvedValue([
    {
      id: 77n, pipeline_stage: 'nurturing', roles: ['buyer'], last_contacted_at: null, agent_id: 42n,
      // findQuarterlyNurtureTargets filters in JS on `preferences.neighborhoods.length > 0`; without it
      // the finder returns zero targets and the email action is never reached at all.
      preferences: { neighborhoods: ['Tribeca'] },
    },
  ]);
  leadFindUniqueMock.mockResolvedValue({
    email: 'client@example.com', first_name: 'Test', last_name: 'Buyer', agent_id: 42n, status,
  });
}

describe('D · the lifecycle email action is suppressed for an inactive Lead', () => {
  it('sends NO email', async () => {
    seedLifecycle('inactive');
    await lifecycle();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('K · records NO TriggerExecution, so cooldown does not advance as a success', async () => {
    seedLifecycle('inactive');
    await lifecycle();
    expect(triggerExecutionCreateMock).not.toHaveBeenCalled();
  });

  it('writes the suppression audit event with the lead and trigger, and no unnecessary PII', async () => {
    seedLifecycle('inactive');
    await lifecycle();
    const calls = (auditCreateMock.mock.calls as unknown as Array<[{ data: { action: string; entity_id: string; changes: Record<string, unknown> } }]>)
      .filter((c) => c[0].data.action === 'lifecycle_email_suppressed_inactive');
    expect(calls.length).toBe(1);
    expect(calls[0][0].data.entity_id).toBe('77');
    expect(JSON.stringify(calls[0][0].data.changes)).not.toContain('client@example.com');
  });

  it('POSITIVE CONTROL — an active Lead still receives the lifecycle email and records the execution', async () => {
    seedLifecycle('active');
    await lifecycle();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(triggerExecutionCreateMock).toHaveBeenCalledTimes(1);
  });

  it('a Lead with no email keeps its EXISTING skipped state — not relabelled as a lifecycle suppression', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([emailTrigger()]);
    leadFindManyMock.mockResolvedValue([
      { id: 77n, pipeline_stage: 'nurturing', roles: ['buyer'], last_contacted_at: null, agent_id: 42n, preferences: { neighborhoods: ['Tribeca'] } },
    ]);
    leadFindUniqueMock.mockResolvedValue({ email: null, first_name: 'Test', last_name: 'Buyer', agent_id: 42n, status: 'active' });
    await lifecycle();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(auditActions()).toContain('lifecycle_email_skipped_no_address');
    expect(auditActions()).not.toContain('lifecycle_email_suppressed_inactive');
  });
});

describe('E · agent-facing lifecycle actions are NOT suppressed for an inactive Lead', () => {
  it.each(['notification', 'agent_alert'])('%s still fires — this controls communication TO the client, not awareness ABOUT them', async (actionType) => {
    lifecycleTriggerFindManyMock.mockResolvedValue([emailTrigger(actionType)]);
    leadFindManyMock.mockResolvedValue([
      { id: 77n, pipeline_stage: 'nurturing', roles: ['buyer'], last_contacted_at: null, agent_id: 42n, preferences: { neighborhoods: ['Tribeca'] } },
    ]);
    leadFindUniqueMock.mockResolvedValue({
      email: 'client@example.com', first_name: 'Test', last_name: 'Buyer', agent_id: 42n, status: 'inactive',
    });
    await lifecycle();
    // A deactivated client may still need brokerage follow-up, compliance work or retention review.
    expect(auditActions()).not.toContain('lifecycle_email_suppressed_inactive');
    expect(sendEmailMock).not.toHaveBeenCalled(); // these actions do not email the client anyway
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F/G/L — the boundaries this packet deliberately did not cross
// ═══════════════════════════════════════════════════════════════════════════════
describe('F/G/L · scope guards', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolve } = require('path') as typeof import('path');
  const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');

  it('the tenant-nurture cron is untouched — it notifies the AGENT and never emails the client', () => {
    expect(read('app/api/cron/tenant-nurture/route.ts')).not.toContain('isLeadExplicitlyInactive');
  });

  it('generic sendEmail carries NO Lead.status lookup — that boundary cannot know the canonical recipient', () => {
    const src = read('lib/email/sendgrid.ts');
    expect(src).not.toContain('isLeadExplicitlyInactive');
    expect(src).not.toContain('prisma.lead');
  });

  it.each([
    'app/api/crm/listing-sends/route.ts',
    'app/api/cron/tenant-nurture/route.ts',
  ])('%s is not swept in merely because it calls sendEmail()', (rel) => {
    expect(read(rel)).not.toContain('isLeadExplicitlyInactive');
  });

  it('L · deactivation does NOT switch off the client\'s retained automation configuration', () => {
    // Suppression lives at the execution boundary precisely so reactivation restores prior behaviour.
    const patch = read('app/api/crm/clients/[id]/route.ts');
    for (const flag of ['sales_drip_on', 'rental_drip_on', 'renewal_drip_on', 'alert_enabled']) {
      expect({ flag, present: patch.includes(flag + ': false') }).toEqual({ flag, present: false });
    }
  });

  it('A · one canonical decision — no automation defines its own inactive set', () => {
    for (const rel of ['app/api/cron/search-alerts/route.ts', 'lib/lifecycle/engine.ts']) {
      const code = read(rel)
        .split(/\r?\n/)
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
      expect(code).toContain('isLeadExplicitlyInactive');
      expect(code).not.toMatch(/===\s*['"`]inactive['"`]/);
    }
  });
});
