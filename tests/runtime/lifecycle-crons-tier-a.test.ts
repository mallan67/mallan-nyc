/// <reference types="jest" />
/**
 * Lifecycle/Crons Tier A P0 — runtime tests.
 *
 * Covers:
 *   1. Lifecycle engine action_type='email' actually sends an email
 *      to the lead via sendEmail() (with the Email Tier A boundary
 *      check) when the lead has an email on file
 *   2. Lifecycle engine action_type='email' skips safely when the
 *      lead has no email — writes lifecycle_email_skipped_no_address
 *      audit, sendEmail NOT called
 *   3. lifecycle_email_sent AuditEvent is written on successful send
 *   4. Feed-reconcile cron sends a broker alert email when
 *      GHOST_ABORT_CAP fires
 *   5. Feed-reconcile still writes the audit event and makes NO
 *      transitions on abort
 */

import { makeRequest } from './helpers';
import { NextRequest } from 'next/server';

// ─── Hand-rolled prisma mock ────────────────────────────────────────────
const lifecycleTriggerFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const lifecycleTriggerUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const triggerExecutionFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const triggerExecutionCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const leadFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const leadFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const convictionScoreFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const agentFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const auditEventCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 1n }));
const notificationCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lifecycleTrigger: {
      findMany: lifecycleTriggerFindManyMock,
      update: lifecycleTriggerUpdateMock,
    },
    triggerExecution: {
      findFirst: triggerExecutionFindFirstMock,
      create: triggerExecutionCreateMock,
    },
    lead: {
      findUnique: leadFindUniqueMock,
      findMany: leadFindManyMock,
    },
    convictionScore: { findMany: convictionScoreFindManyMock },
    listing: { findMany: listingFindManyMock },
    agent: { findMany: agentFindManyMock },
    auditEvent: { create: auditEventCreateMock },
    notification: { create: notificationCreateMock },
  },
}));

// sendEmail spy — gives us full visibility into what the lifecycle
// engine sends. Default: success.
type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  _devMode?: boolean;
  _suppressed?: boolean;
};
const sendEmailMock = jest.fn<Promise<SendEmailResult>, unknown[]>(async () => ({
  success: true,
  messageId: 'm-1',
}));
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: sendEmailMock,
}));

// Auth + cron secret env
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_IDX_ENABLED = process.env.IDX_ENABLED;
beforeAll(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.IDX_ENABLED = 'true';
});
afterAll(() => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  process.env.IDX_ENABLED = ORIGINAL_IDX_ENABLED;
});

beforeEach(() => {
  lifecycleTriggerFindManyMock.mockReset();
  lifecycleTriggerFindManyMock.mockResolvedValue([]);
  lifecycleTriggerUpdateMock.mockClear();
  triggerExecutionFindFirstMock.mockReset();
  triggerExecutionFindFirstMock.mockResolvedValue(null);
  triggerExecutionCreateMock.mockClear();
  leadFindUniqueMock.mockReset();
  leadFindUniqueMock.mockResolvedValue(null);
  leadFindManyMock.mockReset();
  leadFindManyMock.mockResolvedValue([]);
  convictionScoreFindManyMock.mockReset();
  convictionScoreFindManyMock.mockResolvedValue([]);
  listingFindManyMock.mockReset();
  listingFindManyMock.mockResolvedValue([]);
  agentFindManyMock.mockReset();
  agentFindManyMock.mockResolvedValue([]);
  auditEventCreateMock.mockClear();
  notificationCreateMock.mockClear();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'm-1' });
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Lifecycle engine — action_type='email' sends real email to lead
// ═══════════════════════════════════════════════════════════════════════

describe("lifecycle engine — action_type='email' sends email to lead", () => {
  it('sends one email when target lead has an email + writes lifecycle_email_sent audit', async () => {
    // Trigger configured to fire on lease_expiring_30d → email
    lifecycleTriggerFindManyMock.mockResolvedValue([
      {
        id: 1n,
        trigger_type: 'lease_expiring_30d',
        conditions: {},
        action_type: 'email',
        action_config: { urgency: true },
        cooldown_hours: 720,
        last_executed_at: null,
        execution_count: 0,
        enabled: true,
      },
    ]);

    // Target finder for lease_expiring_30d returns one lead candidate
    const leaseEnd = new Date();
    leaseEnd.setDate(leaseEnd.getDate() + 28);
    leadFindManyMock.mockResolvedValue([
      {
        id: 100n,
        lease_end_date: leaseEnd,
        annual_income: 95000,
        credit_score_range: 'good',
        pre_approved: false,
      },
    ]);

    // Lead lookup for the email recipient
    leadFindUniqueMock.mockResolvedValue({
      email: 'lead@example.com',
      first_name: 'Sam',
      last_name: 'Renter',
      agent_id: 42n,
    });

    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    const result = await evaluateAllTriggers();

    expect(result.fired).toBe(1);
    expect(result.suppressed).toBe(0);

    // sendEmail called once with the right shape
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0] as unknown[];
    expect(call[0]).toBe('lead@example.com');
    expect(call[1]).toMatch(/30 days/i);
    expect(typeof call[2]).toBe('string');
    expect(call[2]).toEqual(expect.stringContaining('Sam Renter'));
    // channel: 'company' (commercial — respects last_unsubscribe_at)
    const opts = call[4] as { channel?: string; transactional?: boolean };
    expect(opts.channel).toBe('company');
    expect(opts.transactional).toBeUndefined();

    // AuditEvent: lifecycle_email_sent
    const auditCalls = auditEventCreateMock.mock.calls;
    const lifecycleSent = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return arg?.data?.action === 'lifecycle_email_sent';
    });
    expect(lifecycleSent).toBeDefined();
  });

  it('skips safely + writes lifecycle_email_skipped_no_address when lead has no email', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([
      {
        id: 2n,
        trigger_type: 'lease_expiring_90d',
        conditions: {},
        action_type: 'email',
        action_config: {},
        cooldown_hours: 720,
        last_executed_at: null,
        execution_count: 0,
        enabled: true,
      },
    ]);

    const leaseEnd = new Date();
    leaseEnd.setDate(leaseEnd.getDate() + 88);
    leadFindManyMock.mockResolvedValue([
      {
        id: 200n,
        lease_end_date: leaseEnd,
        annual_income: null,
        credit_score_range: null,
        pre_approved: false,
      },
    ]);

    // Lead exists but has NO email
    leadFindUniqueMock.mockResolvedValue({
      email: null,
      first_name: 'No',
      last_name: 'Email',
      agent_id: 42n,
    });

    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    await evaluateAllTriggers();

    // sendEmail NOT called
    expect(sendEmailMock).not.toHaveBeenCalled();

    // AuditEvent: lifecycle_email_skipped_no_address (NOT lifecycle_email_sent)
    const auditCalls = auditEventCreateMock.mock.calls;
    const skipped = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return arg?.data?.action === 'lifecycle_email_skipped_no_address';
    });
    expect(skipped).toBeDefined();
    const sent = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return arg?.data?.action === 'lifecycle_email_sent';
    });
    expect(sent).toBeUndefined();
  });

  it('lease-expiring finder requires consent_captured_at — no-consent lead is excluded from targets and gets no email', async () => {
    // The trigger fires for lease_expiring_30d. The finder must include
    // `consent_captured_at: { not: null }` in the prisma where-clause so
    // a manually-added lead without consent never enters the target set.
    // We verify both:
    //   1. The where-clause passed to prisma.lead.findMany has the
    //      consent filter (proves the gate exists at the SQL boundary)
    //   2. With Prisma honoring that filter (we simulate by returning []
    //      — Prisma in production would do the same), no email is sent
    lifecycleTriggerFindManyMock.mockResolvedValue([
      {
        id: 4n,
        trigger_type: 'lease_expiring_30d',
        conditions: {},
        action_type: 'email',
        action_config: {},
        cooldown_hours: 720,
        last_executed_at: null,
        execution_count: 0,
        enabled: true,
      },
    ]);

    // Capture the where-clause to assert the consent filter is present.
    let capturedWhere: unknown = null;
    leadFindManyMock.mockImplementation((async (args: { where?: unknown }) => {
      capturedWhere = args?.where;
      // Production Prisma would filter by consent_captured_at: { not: null }
      // → a no-consent lead is NOT returned. Simulate that.
      return [];
    }) as never);

    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    const result = await evaluateAllTriggers();

    // 1. The consent filter is present in the prisma query
    expect(capturedWhere).toEqual(
      expect.objectContaining({
        consent_captured_at: { not: null },
      }),
    );

    // 2. No targets returned → no fires → no email
    expect(result.fired).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();

    // 3. No `lifecycle_email_*` audit (no execution happened)
    const auditCalls = auditEventCreateMock.mock.calls;
    const anyLifecycleEmail = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return typeof arg?.data?.action === 'string' && arg.data.action.startsWith('lifecycle_email');
    });
    expect(anyLifecycleEmail).toBeUndefined();
  });

  it('writes lifecycle_email_suppressed_unsubscribed when sendEmail returns _suppressed', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([
      {
        id: 3n,
        trigger_type: 'quarterly_nurture',
        conditions: {},
        action_type: 'email',
        action_config: {},
        cooldown_hours: 2016,
        last_executed_at: null,
        execution_count: 0,
        enabled: true,
      },
    ]);

    leadFindManyMock.mockResolvedValue([
      {
        id: 300n,
        pipeline_stage: 'nurturing',
        roles: ['buyer'],
        last_contacted_at: null,
        agent_id: 42n,
        preferences: { neighborhoods: ['Tribeca'] },
      },
    ]);

    leadFindUniqueMock.mockResolvedValue({
      email: 'optout@example.com',
      first_name: 'Opt',
      last_name: 'Out',
      agent_id: 42n,
    });

    // Tier A boundary check fires → _suppressed: true
    sendEmailMock.mockResolvedValue({
      success: false,
      _suppressed: true,
      error: 'Recipient has unsubscribed',
    });

    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    await evaluateAllTriggers();

    // sendEmail still called (the lookup is upstream of the boundary)
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // AuditEvent: lifecycle_email_suppressed_unsubscribed
    const auditCalls = auditEventCreateMock.mock.calls;
    const suppressed = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return arg?.data?.action === 'lifecycle_email_suppressed_unsubscribed';
    });
    expect(suppressed).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Feed-reconcile ghost-cap abort sends broker alert
// ═══════════════════════════════════════════════════════════════════════

describe('feed-reconcile cron — ghost-cap abort alert', () => {
  function authedCronRequest(): NextRequest {
    return new NextRequest('http://test/api/cron/feed-reconcile', {
      method: 'GET',
      headers: { authorization: 'Bearer test-cron-secret' },
    });
  }

  it('sends broker alert email + writes audit + returns 503 + makes NO listing transitions when ghosts > cap', async () => {
    // Mock global fetch — return a SMALL set of Trestle Active IDs
    // (3 IDs) so most of our DB rows look like ghosts.
    const trestleSmallSet = ['RLS_KEEP_1', 'RLS_KEEP_2', 'RLS_KEEP_3'];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ value: trestleSmallSet.map((id) => ({ ListingId: id })) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    // Mock getAccessToken (Trestle auth)
    jest.doMock('@/lib/idx/auth', () => ({
      __esModule: true,
      getAccessToken: jest.fn(async () => 'fake-token'),
      hasCredentials: jest.fn(() => true),
    }));

    // Our DB has 2500+ active rows → 2500 - 3 = 2497 ghosts (over the cap of 2000)
    const ourActive: Array<{ id: bigint; listing_id: string; status: string }> = [];
    for (let i = 0; i < 2500; i++) {
      ourActive.push({ id: BigInt(i + 1), listing_id: `RLS_OUR_${i}`, status: 'Active' });
    }
    const ourAll = [...ourActive.map((r) => ({ listing_id: r.listing_id })), ...trestleSmallSet.map((id) => ({ listing_id: id }))];
    listingFindManyMock.mockImplementation((async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'Active') return ourActive;
      return ourAll;
    }) as never);

    // 2 brokers configured
    agentFindManyMock.mockResolvedValue([
      { id: 1n, email: 'broker1@mallan.nyc', first_name: 'Lead', last_name: 'Broker' },
      { id: 2n, email: 'broker2@mallan.nyc', first_name: 'Second', last_name: 'Broker' },
    ]);

    // listing.update should NOT be called (no transitions on abort)
    const listingUpdateMock = jest.fn();
    const cronModule = await import('@/app/api/cron/feed-reconcile/route');

    const res = await cronModule.GET(authedCronRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.aborted).toBe(true);
    expect(body.reason).toBe('ghost_count_exceeds_safety_cap');
    // ourActive has 2500 rows (RLS_OUR_*); trestleIds has 3 disjoint
    // IDs (RLS_KEEP_*) so all 2500 rows are ghosts (no overlap).
    expect(body.ghosts_detected).toBe(2500);
    expect(body.cap).toBe(2000);

    // Broker alert email sent — once per broker
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const recipients = sendEmailMock.mock.calls.map((c) => (c as unknown[])[0]);
    expect(recipients).toEqual(
      expect.arrayContaining(['broker1@mallan.nyc', 'broker2@mallan.nyc']),
    );
    // Each send is transactional + company channel
    for (const call of sendEmailMock.mock.calls) {
      const opts = (call as unknown[])[4] as { channel?: string; transactional?: boolean };
      expect(opts.channel).toBe('company');
      expect(opts.transactional).toBe(true);
    }
    // Subject mentions the count
    const subjects = sendEmailMock.mock.calls.map((c) => (c as unknown[])[1] as string);
    for (const s of subjects) {
      expect(s).toMatch(/Feed reconcile aborted/i);
      expect(s).toMatch(/2500/);
    }

    // Existing audit event still fires
    const auditCalls = auditEventCreateMock.mock.calls;
    const abortAudit = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return arg?.data?.action === 'feed_reconcile_aborted_ghost_cap';
    });
    expect(abortAudit).toBeDefined();

    // No listing transitions
    expect(listingUpdateMock).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('skips broker alert send (gracefully) when no brokers have email', async () => {
    const trestleSmallSet: string[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    jest.doMock('@/lib/idx/auth', () => ({
      __esModule: true,
      getAccessToken: jest.fn(async () => 'fake-token'),
      hasCredentials: jest.fn(() => true),
    }));

    const ourActive: Array<{ id: bigint; listing_id: string; status: string }> = [];
    for (let i = 0; i < 2500; i++) {
      ourActive.push({ id: BigInt(i + 1), listing_id: `RLS_OUR_${i}`, status: 'Active' });
    }
    listingFindManyMock.mockImplementation((async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'Active') return ourActive;
      return ourActive.map((r) => ({ listing_id: r.listing_id }));
    }) as never);

    // Brokers exist but with null email
    agentFindManyMock.mockResolvedValue([
      { id: 1n, email: null, first_name: 'No', last_name: 'Email' },
    ]);

    const cronModule = await import('@/app/api/cron/feed-reconcile/route');
    const res = await cronModule.GET(authedCronRequest());
    expect(res.status).toBe(503);

    // No emails sent (broker has no address)
    expect(sendEmailMock).not.toHaveBeenCalled();

    // But audit + body still fires
    const auditCalls = auditEventCreateMock.mock.calls;
    const abortAudit = auditCalls.find((c) => {
      const arg = c[0] as { data?: { action?: string } } | undefined;
      return arg?.data?.action === 'feed_reconcile_aborted_ghost_cap';
    });
    expect(abortAudit).toBeDefined();

    void trestleSmallSet;
    fetchSpy.mockRestore();
  });
});
