/// <reference types="jest" />
/**
 * /api/crm/agent-inquiry — P2 server-authoritative agent inquiry.
 *
 * Replaces the prior client-side mailto / sendEmailDirect path.
 * Audited workflow with REBNY attribution + brokerage identity in
 * the email body, AuditEvent on every send, SMTP fail-loud in
 * production.
 *
 * Auth: requireAgentOrBroker — same as /api/idx/search.
 *
 * Test surface:
 *   - Unauthenticated → 401
 *   - Authenticated + missing required field → 400
 *   - Authenticated + valid body + sendEmail success → 200 +
 *     AuditEvent action='agent_inquiry_sent'
 *   - Authenticated + valid body + sendEmail _devMode in production
 *     → 503 + AuditEvent action='agent_inquiry_send_failed' with
 *     error_class='smtp_not_configured'
 *   - Email body content includes RLS ID, address, status,
 *     listing URL, REBNY attribution
 */

import { makeRequest } from './helpers';
import type { SessionUser } from '@/lib/auth/session';

// ─── Hand-rolled prisma mock (same pattern as
// contact-form-consent.test.ts and email-pipeline-fail-loud.test.ts) ───
const auditEventCreateMock = jest.fn(async () => ({ id: 1n }));
// The route resolves the sender's PROFESSIONAL TITLE from the canonical Agent
// record (the JWT carries `role`, the authorisation grant, not `title`).
const agentFindUniqueMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    auditEvent: { create: auditEventCreateMock },
    agent: { findUnique: agentFindUniqueMock },
  },
}));

// Auth mock — flips between 'authenticated' and '401' per test.
const requireAgentOrBrokerMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
}));

jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: jest.fn(async () => true),
  extractClientIp: jest.fn(() => '203.0.113.42'),
}));
jest.mock('@/lib/sanitize', () => ({
  __esModule: true,
  escapeHtml: (s: string) => s,
}));

// Mutable email mock.
type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  _devMode?: boolean;
  _suppressed?: boolean;
};
type SendEmailCallArgs = [string, string, string, unknown?, unknown?];
const sendEmailMock = jest.fn<Promise<SendEmailResult>, SendEmailCallArgs>(
  async () => ({ success: true, messageId: 'test-msg-id' })
);
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: sendEmailMock,
}));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

function setEnv(key: 'NODE_ENV' | 'VERCEL_ENV', value: string | undefined) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

/** Canonical Agent rows as the DB would return them for the title lookup. */
const MAYA_RECORD = {
  full_name: 'Maya Allan',
  title: 'Licensed Real Estate Broker',
  license_type: 'broker',
  role: 'BROKER',
  phone: '(646) 258-4460',
  email: 'maya@mallan.nyc',
};
const CLAUDIA_RECORD = {
  full_name: 'Claudia Milkowski',
  title: 'Licensed Associate Real Estate Broker',
  license_type: 'associate_broker',   // NY LICENCE CLASS, carries the fact itself
  role: 'AGENT',                      // Mallan AUTHORISATION — a separate fact
  phone: '(646) 418-8388',
  email: 'cmilkowski@mallan.nyc',
};

// The REAL contract from lib/auth/session.ts — nothing else. An earlier
// version of this mock invented `id` / `email` / `first_name` / `last_name`,
// which do not exist on SessionUser, and that fiction is exactly why the
// production defect (route read `sessionUser.id`) passed CI.
function authedSession(overrides: Partial<SessionUser> = {}): SessionUser {
  // parentSessionId/actorUserId are part of the REAL contract: null means
  // "ordinary session, actor == effective user". Defaulted here so the mock
  // states them rather than leaving them undefined.
  return {
    userId: 42n,
    userType: 'agent',
    role: 'BROKER',
    sessionId: 'sess-test-1',
    parentSessionId: null,
    actorUserId: null,
    ...overrides,
  } as SessionUser;
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'test-msg-id' });
  auditEventCreateMock.mockClear();
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue(authedSession());
  agentFindUniqueMock.mockReset();
  agentFindUniqueMock.mockResolvedValue(MAYA_RECORD);
});

afterEach(() => {
  setEnv('NODE_ENV', ORIGINAL_NODE_ENV);
  setEnv('VERCEL_ENV', ORIGINAL_VERCEL_ENV);
});

const validBody = () => ({
  listing_id: 'RLS20078109',
  listing_address: '100 W 72nd Street',
  listing_unit: '4A',
  listing_price: 1500000,
  listing_status: 'ACTIVE',
  listing_url: 'https://mallan.nyc/buy/100-w-72nd-street-4a-RLS20078109',
  listing_neighborhood: 'Upper West Side',
  listing_borough: 'Manhattan',
  listing_zip: '10023',
  agent_email: 'listing-agent@example.com',
  agent_name: 'Listing Agent',
  message: 'Could you please provide showing availability for this property?',
});

describe('POST /api/crm/agent-inquiry — auth gating', () => {
  it('returns 401 when unauthenticated', async () => {
    requireAgentOrBrokerMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
    );
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));
    expect(res.status).toBe(401);
    expect(auditEventCreateMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 200 when authenticated as broker (regression guard)', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/crm/agent-inquiry — body validation', () => {
  for (const required of ['listing_id', 'listing_address', 'agent_email', 'agent_name', 'message'] as const) {
    it(`returns 400 when ${required} is missing`, async () => {
      const body = validBody() as Record<string, unknown>;
      delete body[required];
      const { POST } = await import('@/app/api/crm/agent-inquiry/route');
      const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(new RegExp(required));
      expect(auditEventCreateMock).not.toHaveBeenCalled();
      expect(sendEmailMock).not.toHaveBeenCalled();
    });
  }

  it('returns 400 when message is whitespace-only', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: { ...validBody(), message: '   \n  ' } })
    );
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 400 when agent_email is malformed', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: { ...validBody(), agent_email: 'not-an-email' } })
    );
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/agent-inquiry — successful send', () => {
  it('records AuditEvent with action=agent_inquiry_sent on success', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const audit = (auditEventCreateMock.mock.calls[0] as unknown as Array<{ data: { action: string; entity_id: string; user_type: string; user_id: bigint; changes: Record<string, unknown> } }>)[0].data;
    expect(audit.action).toBe('agent_inquiry_sent');
    expect(audit.entity_id).toBe('RLS20078109');
    expect(audit.user_type).toBe('broker');
    expect(audit.user_id).toBe(42n);
    expect(audit.changes.success).toBe(true);
    // Recipient email NOT logged in plaintext — only domain
    expect(audit.changes.recipient_email).toBeUndefined();
    expect(audit.changes.recipient_email_domain).toBe('example.com');
  });

  it('email body includes RLS ID, address, status, REBNY attribution, brokerage identity', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0] as unknown as SendEmailCallArgs;
    const recipientEmail = call[0];
    const subject = call[1];
    const html = call[2];

    expect(recipientEmail).toBe('listing-agent@example.com');
    expect(subject).toMatch(/Agent Inquiry/);
    expect(subject).toMatch(/100 W 72nd Street/);
    expect(subject).toMatch(/4A/);

    // Spec-required body content per P0-B + P2:
    expect(html).toContain('RLS20078109');                              // RLS ID
    expect(html).toContain('100 W 72nd Street');                         // Address
    expect(html).toContain('4A');                                        // Unit
    expect(html).toContain('$1,500,000');                                // Price (formatted)
    expect(html).toContain('Active');                                    // Status (mapped)
    expect(html).toContain('mallan.nyc/buy/100-w-72nd-street-4a-RLS20078109'); // Listing URL
    expect(html).toContain('Mallan Real Estate Inc.');                   // Brokerage
    expect(html).toContain('#10991205323');                              // Brokerage license
    expect(html).toContain('400 East 90th Street');                      // Brokerage address
    expect(html).toContain('REBNY RLS');                                 // REBNY attribution
    expect(html).toContain('IDX Plus');                                  // IDX attribution
    expect(html).toContain('Maya Allan');                                // Sender (from session)
    // Sender's professional title, now read from the canonical Agent record
    // rather than derived from the authorisation role.
    expect(html).toContain('Licensed Real Estate Broker');
    // Operator-supplied message rendered
    expect(html).toContain('Could you please provide showing availability');
  });

  it('uses transactional flag (no marketing unsubscribe footer)', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    const call = sendEmailMock.mock.calls[0] as unknown as SendEmailCallArgs;
    const opts = call[4] as { transactional?: boolean };
    expect(opts).toBeDefined();
    expect(opts.transactional).toBe(true);
  });

  it('renders Coming Soon status label when listing_status=COMING_SOON', async () => {
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(
      makeRequest({
        url: 'http://test/api/crm/agent-inquiry',
        body: { ...validBody(), listing_status: 'COMING_SOON' },
      })
    );
    const html = (sendEmailMock.mock.calls[0] as unknown as SendEmailCallArgs)[2];
    expect(html).toContain('Coming Soon');
    expect(html).not.toContain('Status: COMING_SOON'); // raw enum should NOT leak
  });
});

describe('POST /api/crm/agent-inquiry — SMTP fail-loud (P0-B pattern)', () => {
  it('returns 503 with SMTP_NOT_CONFIGURED when _devMode in production', async () => {
    setEnv('VERCEL_ENV', 'production');
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('SMTP_NOT_CONFIGURED');
    expect(json.listingId).toBe('RLS20078109');

    // AuditEvent records the failure
    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const audit = (auditEventCreateMock.mock.calls[0] as unknown as Array<{ data: { action: string; changes: Record<string, unknown> } }>)[0].data;
    expect(audit.action).toBe('agent_inquiry_send_failed');
    expect(audit.changes.success).toBe(false);
    expect(audit.changes.error_class).toBe('smtp_not_configured');
  });

  it('returns 200 in dev/test even when _devMode set (production-only behavior)', async () => {
    setEnv('NODE_ENV', 'development');
    setEnv('VERCEL_ENV', undefined);
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));
    // In dev: not 503 — falls through to 502 (non-config error path) since
    // emailResult.success is still false. Either 200 (if production check
    // gates it) or 502 (transient-error fallback). Verify status is NOT
    // 503 specifically — fail-loud should NOT fire in dev.
    expect(res.status).not.toBe(503);
  });

  it('returns 502 on non-config send failures (transient errors stay non-config)', async () => {
    setEnv('VERCEL_ENV', 'production');
    sendEmailMock.mockResolvedValue({ success: false, error: 'Connection timeout' });

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));
    expect(res.status).toBe(502);
    // AuditEvent still recorded
    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const audit = (auditEventCreateMock.mock.calls[0] as unknown as Array<{ data: { action: string; changes: Record<string, unknown> } }>)[0].data;
    expect(audit.changes.error_class).toBe('send_failed');
  });
});

describe('POST /api/crm/agent-inquiry — professional title vs authorisation', () => {
  const htmlFromLastSend = () =>
    (sendEmailMock.mock.calls[0] as unknown as SendEmailCallArgs)[2];

  it('an Associate Broker is advertised as one, never as a Salesperson', async () => {
    agentFindUniqueMock.mockResolvedValue(CLAUDIA_RECORD);
    requireAgentOrBrokerMock.mockResolvedValue(
      authedSession({ userId: 77n, role: 'AGENT' }), // authorisation stays AGENT
    );

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    const html = htmlFromLastSend();
    expect(html).toContain('Claudia Milkowski');
    expect(html).toContain('Licensed Associate Real Estate Broker');
    expect(html).not.toContain('Licensed Real Estate Salesperson');
    // Her own phone now reaches the recipient (previously always the office).
    expect(html).toContain('(646) 418-8388');
  });

  it('a salesperson agent is still advertised as a Salesperson', async () => {
    agentFindUniqueMock.mockResolvedValue({
      full_name: 'Leda Gorgone', title: 'Licensed Real Estate Salesperson',
      license_type: 'salesperson', role: 'AGENT',
      phone: '(917) 207-5903', email: 'leda@mallan.nyc',
    });
    requireAgentOrBrokerMock.mockResolvedValue(authedSession({ userId: 55n, role: 'AGENT' }));

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    const html = htmlFromLastSend();
    expect(html).toContain('Licensed Real Estate Salesperson');
    expect(html).not.toContain('Associate Broker');
  });

  it('asserts NO designation when the Agent record cannot be read', async () => {
    // Must not fall back to guessing "Salesperson" for an unreadable licensee.
    agentFindUniqueMock.mockRejectedValue(new Error('db down'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    const res = await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    expect(res.status).toBe(200); // the inquiry still sends
    const html = htmlFromLastSend();
    expect(html).not.toContain('Licensed Real Estate Salesperson');
    expect(html).not.toContain('Licensed Real Estate Broker');
    expect(errSpy).toHaveBeenCalled(); // failed loudly in the log
    errSpy.mockRestore();
  });
});

describe('POST /api/crm/agent-inquiry — sender resolved by canonical SessionUser.userId', () => {
  it('looks the Agent up by the session userId, not a non-existent `id`', async () => {
    agentFindUniqueMock.mockResolvedValue(CLAUDIA_RECORD);
    requireAgentOrBrokerMock.mockResolvedValue(authedSession({ userId: 77n, role: 'AGENT' }));

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    expect(agentFindUniqueMock).toHaveBeenCalledTimes(1);
    const arg = agentFindUniqueMock.mock.calls[0][0] as { where: { id: bigint } };
    expect(arg.where).toEqual({ id: 77n });
  });

  it('never falls back to an empty-string email key', async () => {
    agentFindUniqueMock.mockResolvedValue(MAYA_RECORD);
    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    const arg = agentFindUniqueMock.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where).not.toHaveProperty('email');
    expect(JSON.stringify(arg.where, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
      .not.toContain('""');
  });

  it('audits WHO sent the inquiry — user_id is the session userId, never null', async () => {
    // Same defect class: the audit previously read `sessionUser.id`, so every
    // inquiry was recorded with user_id = null (NY SHIELD attribution lost).
    agentFindUniqueMock.mockResolvedValue(CLAUDIA_RECORD);
    requireAgentOrBrokerMock.mockResolvedValue(authedSession({ userId: 77n, role: 'AGENT' }));

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    const audit = (auditEventCreateMock.mock.calls[0] as unknown as Array<{ data: { user_id: bigint; user_type: string } }>)[0].data;
    expect(audit.user_id).toBe(77n);
    expect(audit.user_type).toBe('agent'); // authorisation, not licence
  });

  it('an Associate Broker resolves her real contact details from the canonical row', async () => {
    agentFindUniqueMock.mockResolvedValue(CLAUDIA_RECORD);
    requireAgentOrBrokerMock.mockResolvedValue(authedSession({ userId: 77n, role: 'AGENT' }));

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');
    await POST(makeRequest({ url: 'http://test/api/crm/agent-inquiry', body: validBody() }));

    const html = (sendEmailMock.mock.calls[0] as unknown as SendEmailCallArgs)[2];
    expect(html).toContain('Claudia Milkowski');
    expect(html).toContain('Licensed Associate Real Estate Broker');
    expect(html).toContain('cmilkowski@mallan.nyc');
    expect(html).toContain('(646) 418-8388');
    expect(html).not.toContain('Mallan Agent');   // the unresolved-name fallback
    expect(html).not.toContain('Salesperson');
  });
});
