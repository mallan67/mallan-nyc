/// <reference types="jest" />
/**
 * Email Tier A P0 — runtime route tests.
 *
 * Covers the three Tier A fixes:
 *   1. Listing-expiration cron sends an email AND in-app notification on
 *      the 7-day urgent branch (Task 2) and the deadline-passed branch
 *      (Task 4a).
 *   2. sendEmail() suppresses non-transactional sends when the recipient
 *      Lead has last_unsubscribe_at set (CAN-SPAM 15 USC 7704(a)(4)(A)).
 *   3. sendEmail() allows transactional sends through to SMTP even when
 *      last_unsubscribe_at is set (the CAN-SPAM transactional exception
 *      at 15 USC 7702(2)(B)).
 *
 * Static-source guard for the legacy sendTemplatedEmail stub deletion
 * lives in lib/search/__tests__/email-tier-a.test.ts (this file's
 * companion) so that one regression alarm fires via the existing
 * lib/search jest config alongside the alert-gate parity guard.
 */

import { makeRequest } from './helpers';

// ─── Hand-rolled prisma mock ────────────────────────────────────────────
// Variadic `unknown[]` arg type so jest.Mock.mockImplementation accepts
// callbacks with typed args. Same pattern as
// tests/runtime/codex-risk-p0.test.ts.
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const listingUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const protectedPeriodFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const protectedPeriodUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const protectedPeriodCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const agentFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const auditEventCreateMock = jest.fn<Promise<{ id: bigint }>, unknown[]>(async () => ({ id: 1n }));
// findEmailSuppression (lib/email/suppression.ts) also reads the AuditEvent opt-out ledger.
const auditEventFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const leadFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findMany: listingFindManyMock, update: listingUpdateMock },
    protectedPeriod: {
      findMany: protectedPeriodFindManyMock,
      update: protectedPeriodUpdateMock,
      create: protectedPeriodCreateMock,
    },
    agent: { findMany: agentFindManyMock },
    auditEvent: { create: auditEventCreateMock, findFirst: auditEventFindFirstMock },
    lead: { findUnique: leadFindUniqueMock },
  },
}));

const createNotificationMock = jest.fn(async () => ({ id: 1n }));
jest.mock('@/lib/notifications/engine', () => ({
  __esModule: true,
  createNotification: createNotificationMock,
}));

// Keep the real templates so the test asserts wrapping into the actual
// HTML output the cron will send. wrapEmail / FOOTER pull from the
// templates module which has no DB side effects.
jest.mock('@/lib/email/templates', () => {
  const actual = jest.requireActual('@/lib/email/templates') as Record<string, unknown>;
  return { __esModule: true, ...actual };
});

const sendEmailRouteSpy = jest.fn<Promise<{ success: boolean; messageId?: string; error?: string; _devMode?: boolean }>, unknown[]>(
  async () => ({ success: true, messageId: 'm-1' }),
);
jest.mock('@/lib/email/sendgrid', () => {
  // Re-export every symbol from the real module, but override sendEmail
  // with a spy so the cron's call shape can be asserted. The boundary
  // check tests below import the REAL sendEmail directly via
  // jest.requireActual — they don't go through this mock.
  const actual = jest.requireActual('@/lib/email/sendgrid') as Record<string, unknown>;
  return { __esModule: true, ...actual, sendEmail: sendEmailRouteSpy };
});

beforeEach(() => {
  listingFindManyMock.mockReset();
  listingFindManyMock.mockResolvedValue([]);
  listingUpdateMock.mockClear();
  protectedPeriodFindManyMock.mockReset();
  protectedPeriodFindManyMock.mockResolvedValue([]);
  protectedPeriodUpdateMock.mockClear();
  protectedPeriodCreateMock.mockClear();
  agentFindManyMock.mockReset();
  agentFindManyMock.mockResolvedValue([]);
  auditEventCreateMock.mockClear();
  createNotificationMock.mockClear();
  sendEmailRouteSpy.mockReset();
  sendEmailRouteSpy.mockResolvedValue({ success: true, messageId: 'm-1' });
  leadFindUniqueMock.mockReset();
  auditEventFindFirstMock.mockClear(); // keeps the default (resolves null = no AuditEvent opt-out)
});

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
beforeAll(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
});
afterAll(() => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
});

function authedCronRequest() {
  return makeRequest({
    url: 'http://test/api/cron/listing-expiration',
    method: 'GET',
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

// ─── OWNERSHIP-AWARE listing.findMany mock ──────────────────────────────
//
// The previous mock returned its fixture whenever `where.expiration_7d_notified
// === false`, IGNORING the rest of the query. Once Tasks 1 and 2 gained
// `AND: [buildMallanOwnedListingWhere()]`, that seam let the test pass while
// modelling a row Production Prisma would now reject — and the positive
// "exclusive" fixtures were in fact third-party `RLS*` ids. A false-positive
// seam on the exact predicate under test.
//
// The mock now evaluates the fixture against the ACTUAL `where` the route
// supplies. Ownership rules are never restated here: `matchesWhere` is a
// generic Prisma-where interpreter, so if the route ever stopped sending the
// predicate the negative tests below would fail.

/** Generic interpreter for the Prisma operators these queries use. */
function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as Record<string, unknown>[]).every((c) => matchesWhere(row, c))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((c) => matchesWhere(row, c))) return false;
      continue;
    }
    // Only identity/ownership keys are enforced. The window keys (status,
    // expiration_date, notified flag) are the fixture's own premise and are
    // asserted by the surrounding test rather than re-derived here.
    if (!['listing_id', 'rls_eligible', 'agent_id'].includes(key)) continue;
    const value = row[key];
    if (cond === null) {
      if (value != null) return false;
      continue;
    }
    if (cond !== null && typeof cond === 'object') {
      const c = cond as Record<string, unknown>;
      if ('startsWith' in c) {
        if (!(typeof value === 'string' && value.startsWith(c.startsWith as string))) return false;
      } else if ('not' in c) {
        if (c.not === null ? value == null : value === c.not) return false;
      } else if ('in' in c) {
        if (!(c.in as unknown[]).includes(value)) return false;
      }
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

/** Capture of the `where` each expiration task actually issued. */
const capturedWheres: Record<string, unknown>[] = [];

/**
 * Serve `row` to the task whose `where` carries `flagKey: false`, but ONLY when
 * the row satisfies the REAL query — ownership included.
 */
function serveIfOwned(
  flagKey: 'expiration_7d_notified' | 'expiration_30d_notified',
  row: Record<string, unknown>,
) {
  return (async (args: { where?: Record<string, unknown> }) => {
    const where = (args?.where ?? {}) as Record<string, unknown>;
    capturedWheres.push(where);
    if (where[flagKey] !== false) return [];
    return matchesWhere(row, where) ? [row] : [];
  }) as never;
}

/** A genuinely Mallan-owned listing: `SL-` prefix AND website-only. */
const MALLAN_OWNED = { listing_id: 'SL-0421', rls_eligible: false } as const;
/**
 * A third-party feed row satisfying EVERY other warning requirement — active
 * window, flag false, agent_id present, agent email present. Ownership is the
 * ONLY reason it must be excluded.
 */
const THIRD_PARTY_FEED = { listing_id: 'RLS20078109', rls_eligible: true } as const;

// ═══════════════════════════════════════════════════════════════════════
// 1. Listing-expiration cron — 7-day urgent branch
// ═══════════════════════════════════════════════════════════════════════

describe('listing-expiration cron — 7-day urgent branch', () => {
  it('sends email AND creates in-app notification when an exclusive expires within 7 days', async () => {
    const expirationDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    // Mallan-OWNED fixture: only such a row can be an "exclusive" at all.
    listingFindManyMock.mockImplementation(
      serveIfOwned('expiration_7d_notified', {
        id: 100n,
        ...MALLAN_OWNED,
        address: { StreetNumber: '400', StreetName: 'East 90th Street' },
        expiration_date: expirationDate,
        agent_id: 42n,
        agent: {
          email: 'agent@mallan.nyc',
          first_name: 'Maya',
          last_name: 'Allan',
        },
      }),
    );

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    const res = await GET(authedCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings_7d).toBe(1);

    // In-app notification created
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_type: 'agent',
        recipient_id: 42n,
        type: 'listing_expiration',
        title: 'Listing expires in 7 days',
      }),
    );

    // Email also sent (Tier A P0 contract)
    expect(sendEmailRouteSpy).toHaveBeenCalledTimes(1);
    const [to, subject, html, , opts] = sendEmailRouteSpy.mock.calls[0];
    expect(to).toBe('agent@mallan.nyc');
    expect(subject).toMatch(/expires in 7 days/i);
    expect(html).toContain('400 East 90th Street');
    expect(html).toContain('SL-0421');
    expect(html).toMatch(/UCBA Art\. I/i);
    // Sent transactional + company channel
    expect(opts).toEqual(expect.objectContaining({ channel: 'company', transactional: true }));
  });

  it('does NOT send email when listing has agent_id but no email on the agent record', async () => {
    listingFindManyMock.mockImplementation(
      serveIfOwned('expiration_7d_notified', {
        id: 101n,
        listing_id: 'RL-0102',
        rls_eligible: false,
        address: { StreetNumber: '432', StreetName: 'Park Avenue' },
        expiration_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        agent_id: 99n,
        agent: { email: null, first_name: 'X', last_name: 'Y' },
      }),
    );

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    await GET(authedCronRequest());

    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendEmailRouteSpy).not.toHaveBeenCalled();
  });

  it('does NOT mark expiration_7d_notified when the 7-day email send fails', async () => {
    listingFindManyMock.mockImplementation(
      serveIfOwned('expiration_7d_notified', {
        id: 102n,
        listing_id: 'SL-0511',
        rls_eligible: false,
        address: { StreetNumber: '500', StreetName: 'West End Avenue' },
        expiration_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        agent_id: 42n,
        agent: { email: 'agent@mallan.nyc', first_name: 'Maya', last_name: 'Allan' },
      }),
    );
    sendEmailRouteSpy.mockResolvedValue({ success: false, error: 'SMTP send failed' });

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    const res = await GET(authedCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings_7d).toBe(0);
    expect(body.email_failures).toBe(1);

    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendEmailRouteSpy).toHaveBeenCalledTimes(1);
    expect(listingUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 102n },
        data: { expiration_7d_notified: true },
      }),
    );
    expect(auditEventCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'listing_expiration_email_failed',
          entity_type: 'listing',
          entity_id: '102',
        }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 1b. Listing-expiration cron — OWNERSHIP AUTHORITY (route execution)
//
// `syncAgentHistory` stamps `agent_id` on third-party feed rows (it matches
// BuyerAgentMlsId as well as ListAgentMlsId) and feed rows carry their own
// `expiration_date`. Association is therefore NOT ownership, and these tasks
// tell an agent "Your exclusive on {address} expires" — Task 2 by EMAIL — and
// write `expiration_*_notified` onto the row. These are real route executions,
// not source-string checks.
// ═══════════════════════════════════════════════════════════════════════

describe('listing-expiration cron — ownership authority', () => {
  const WINDOW_7D = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const WINDOW_30D = () => new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

  it('the route sends the PRODUCTION ownership predicate on both warning tasks', async () => {
    capturedWheres.length = 0;
    listingFindManyMock.mockImplementation(serveIfOwned('expiration_7d_notified', {}));

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    await GET(authedCronRequest());

    const { buildMallanOwnedListingWhere } = await import('@/lib/idx/media-sync');
    const expected = buildMallanOwnedListingWhere();

    const warningWheres = capturedWheres.filter(
      (w) => 'expiration_30d_notified' in w || 'expiration_7d_notified' in w,
    );
    expect(warningWheres.length).toBeGreaterThanOrEqual(2);
    for (const w of warningWheres) {
      expect(w.AND).toEqual(expect.arrayContaining([expected]));
      // agent_id survives only as the recipient data requirement.
      expect(w.agent_id).toEqual({ not: null });
    }
  });

  it('NEGATIVE 30-day: third-party feed row with agent_id produces NO side effects', async () => {
    listingFindManyMock.mockImplementation(
      serveIfOwned('expiration_30d_notified', {
        id: 900n,
        ...THIRD_PARTY_FEED,
        address: { StreetNumber: '1', StreetName: 'Third Party Way' },
        expiration_date: WINDOW_30D(),
        agent_id: 42n,
        agent: { email: 'agent@mallan.nyc', first_name: 'Maya', last_name: 'Allan' },
      }),
    );

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    const res = await GET(authedCronRequest());
    const body = await res.json();

    expect(body.warnings_30d).toBe(0);
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(listingUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { expiration_30d_notified: true } }),
    );
  });

  it('NEGATIVE 7-day: third-party feed row with agent_id sends NO email and NO notification', async () => {
    listingFindManyMock.mockImplementation(
      serveIfOwned('expiration_7d_notified', {
        id: 901n,
        ...THIRD_PARTY_FEED,
        address: { StreetNumber: '2', StreetName: 'Third Party Way' },
        expiration_date: WINDOW_7D(),
        agent_id: 42n,
        agent: { email: 'agent@mallan.nyc', first_name: 'Maya', last_name: 'Allan' },
      }),
    );

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    const res = await GET(authedCronRequest());
    const body = await res.json();

    expect(body.warnings_7d).toBe(0);
    expect(sendEmailRouteSpy).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(listingUpdateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { expiration_7d_notified: true } }),
    );
  });

  it('POSITIVE 30-day: a Mallan-owned row still notifies and marks the flag', async () => {
    listingFindManyMock.mockImplementation(
      serveIfOwned('expiration_30d_notified', {
        id: 910n,
        ...MALLAN_OWNED,
        address: { StreetNumber: '400', StreetName: 'East 90th Street' },
        expiration_date: WINDOW_30D(),
        agent_id: 42n,
        agent: { email: 'agent@mallan.nyc', first_name: 'Maya', last_name: 'Allan' },
      }),
    );

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    const res = await GET(authedCronRequest());
    const body = await res.json();

    expect(body.warnings_30d).toBe(1);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'listing_expiration', recipient_id: 42n }),
    );
    expect(listingUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 910n }, data: { expiration_30d_notified: true } }),
    );
  });

  it('the ONLY difference between the positive and negative fixtures is ownership', () => {
    // Same shape, same window, same agent, same email — so a passing negative
    // test cannot be explained by a missing unrelated property.
    expect(Object.keys(MALLAN_OWNED).sort()).toEqual(Object.keys(THIRD_PARTY_FEED).sort());
    expect(MALLAN_OWNED.rls_eligible).toBe(false);
    expect(THIRD_PARTY_FEED.rls_eligible).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Listing-expiration cron — deadline-passed branch (Task 4a)
// ═══════════════════════════════════════════════════════════════════════

describe('listing-expiration cron — deadline-passed branch', () => {
  it('sends email AND creates in-app notification to each active broker when names deadline missed', async () => {
    protectedPeriodFindManyMock.mockImplementation((async (args: { where?: { status?: string } }) => {
      // Task 4a is the only query that uses status: "pending_names"
      if (args?.where?.status === 'pending_names') {
        return [
          {
            id: 5n,
            agent_id: 42n,
            names_deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            listing: {
              listing_id: 'SL-0421',
              address: { StreetNumber: '400', StreetName: 'East 90th Street' },
            },
          },
        ];
      }
      // 90-day expiry branch (Task 4b) has its own query
      return [];
    }) as never);

    agentFindManyMock.mockImplementation((async (args: { where?: { role?: string } }) => {
      if (args?.where?.role === 'BROKER') {
        return [
          { id: 1n, email: 'broker@mallan.nyc', first_name: 'Lead', last_name: 'Broker' },
          { id: 2n, email: 'broker2@mallan.nyc', first_name: 'Second', last_name: 'Broker' },
        ];
      }
      return [];
    }) as never);

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    const res = await GET(authedCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deadlines_missed).toBe(1);

    // 2 brokers → 2 in-app notifications + 2 emails
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendEmailRouteSpy).toHaveBeenCalledTimes(2);

    const subjects = sendEmailRouteSpy.mock.calls.map((c) => c[1]);
    expect(subjects.every((s) => /deadline missed/i.test(s as string))).toBe(true);
    const tos = sendEmailRouteSpy.mock.calls.map((c) => c[0]);
    expect(tos).toEqual(expect.arrayContaining(['broker@mallan.nyc', 'broker2@mallan.nyc']));

    // Both transactional + company channel
    for (const call of sendEmailRouteSpy.mock.calls) {
      expect(call[4]).toEqual(expect.objectContaining({ channel: 'company', transactional: true }));
    }

    // Body contains the missed-deadline UCBA framing
    const html = sendEmailRouteSpy.mock.calls[0][2] as string;
    expect(html).toMatch(/deadline.*missed/i);
    expect(html).toMatch(/UCBA Art\. I/i);
    expect(html).toContain('SL-0421');
  });

  it('skips brokers with no email on record (transient missing-data state)', async () => {
    protectedPeriodFindManyMock.mockImplementation((async (args: { where?: { status?: string } }) => {
      if (args?.where?.status === 'pending_names') {
        return [
          {
            id: 6n,
            agent_id: 42n,
            names_deadline: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
            listing: { listing_id: 'RL-0102', address: { StreetNumber: '1', StreetName: 'X' } },
          },
        ];
      }
      return [];
    }) as never);
    agentFindManyMock.mockImplementation((async (args: { where?: { role?: string } }) => {
      if (args?.where?.role === 'BROKER') {
        return [{ id: 1n, email: null, first_name: 'No', last_name: 'Email' }];
      }
      return [];
    }) as never);

    const { GET } = await import('@/app/api/cron/listing-expiration/route');
    await GET(authedCronRequest());

    // In-app notification still fires (DB-only); email skipped (no address)
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendEmailRouteSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. sendEmail() boundary check — last_unsubscribe_at suppression
// ═══════════════════════════════════════════════════════════════════════

describe('sendEmail() boundary check — Lead.last_unsubscribe_at suppression', () => {
  // These tests use the REAL sendEmail() (jest.requireActual) so we
  // exercise the actual code path. The route-level spy mock above is
  // bypassed for this describe block.

  let realSendEmail: typeof import('@/lib/email/sendgrid')['sendEmail'];

  beforeAll(async () => {
    const real = jest.requireActual('@/lib/email/sendgrid') as typeof import('@/lib/email/sendgrid');
    realSendEmail = real.sendEmail;
  });

  beforeEach(() => {
    leadFindUniqueMock.mockReset();
  });

  it('suppresses a non-transactional send when Lead.last_unsubscribe_at is set', async () => {
    leadFindUniqueMock.mockResolvedValue({
      last_unsubscribe_at: new Date('2026-04-01T00:00:00Z'),
    });

    const result = await realSendEmail(
      'optout@example.com',
      'Test subject',
      '<p>body</p>',
    );

    expect(result.success).toBe(false);
    expect((result as { _suppressed?: boolean })._suppressed).toBe(true);
    expect(result.error).toMatch(/unsubscribed/i);

    // The lookup happened (lower-cased + trimmed)
    expect(leadFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'optout@example.com' },
        select: { last_unsubscribe_at: true },
      }),
    );

    // AuditEvent for the suppression
    expect(auditEventCreateMock).toHaveBeenCalled();
    const calls = auditEventCreateMock.mock.calls;
    const lastCall = calls[calls.length - 1] as unknown;
    const lastArgs = lastCall as unknown[];
    const firstArg = lastArgs[0] as { data?: { action?: string } } | undefined;
    expect(firstArg?.data?.action).toBe('email:send_suppressed_unsubscribed');
  });

  it('lower-cases + trims the recipient email before lookup', async () => {
    leadFindUniqueMock.mockResolvedValue({
      last_unsubscribe_at: new Date('2026-04-01T00:00:00Z'),
    });

    await realSendEmail('  Mixed@Example.COM  ', 'subj', '<p>b</p>');

    expect(leadFindUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'mixed@example.com' },
        select: { last_unsubscribe_at: true },
      }),
    );
  });

  it('ALLOWS a transactional send through to SMTP even when Lead.last_unsubscribe_at is set', async () => {
    leadFindUniqueMock.mockResolvedValue({
      last_unsubscribe_at: new Date('2026-04-01T00:00:00Z'),
    });

    const result = await realSendEmail(
      'optout@example.com',
      'Your password reset link',
      '<p>reset</p>',
      undefined,
      { transactional: true },
    );

    // SMTP not configured in test env → _devMode true (the boundary
    // check did NOT fire — the lookup wasn't called). This proves the
    // transactional path bypassed the suppression.
    expect(result.success).toBe(false);
    expect((result as { _devMode?: boolean })._devMode).toBe(true);
    expect((result as { _suppressed?: boolean })._suppressed).toBeUndefined();
    // Lookup must NOT have been called for transactional sends
    expect(leadFindUniqueMock).not.toHaveBeenCalled();
  });

  it('proceeds to SMTP when Lead exists but last_unsubscribe_at is null', async () => {
    leadFindUniqueMock.mockResolvedValue({ last_unsubscribe_at: null });

    const result = await realSendEmail('subscribed@example.com', 'subj', '<p>b</p>');

    // Lookup happened, returned no opt-out, proceeded to send → _devMode
    // because SMTP is not configured in tests.
    expect(leadFindUniqueMock).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect((result as { _devMode?: boolean })._devMode).toBe(true);
    expect((result as { _suppressed?: boolean })._suppressed).toBeUndefined();
  });

  it('proceeds to SMTP when no Lead exists for the recipient (e.g. agent email, broker, info@)', async () => {
    leadFindUniqueMock.mockResolvedValue(null);

    const result = await realSendEmail('info@mallan.nyc', 'subj', '<p>b</p>');

    expect(leadFindUniqueMock).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect((result as { _devMode?: boolean })._devMode).toBe(true);
    expect((result as { _suppressed?: boolean })._suppressed).toBeUndefined();
  });

  it('FAIL-CLOSED: BLOCKS the send if the Lead suppression lookup throws (must not risk emailing an opt-out)', async () => {
    leadFindUniqueMock.mockRejectedValue(new Error('connection timeout'));

    const result = await realSendEmail('any@example.com', 'subj', '<p>b</p>');

    expect(leadFindUniqueMock).toHaveBeenCalled();
    // Hardened contract (#502): a suppression-lookup outage BLOCKS the send — for
    // commercial mail we cannot prove the recipient hasn't opted out, so we must
    // not deliver. It returns EARLY (never reaching the SMTP/_devMode path) and
    // surfaces the DISTINCT `_suppressionError` sentinel — an infra outage, NOT a
    // verified unsubscribe (`_suppressed`). Transactional sends bypass this block.
    expect(result.success).toBe(false);
    expect((result as { _suppressionError?: boolean })._suppressionError).toBe(true);
    expect((result as { _devMode?: boolean })._devMode).toBeUndefined();
    expect((result as { _suppressed?: boolean })._suppressed).toBeUndefined();
  });
});
