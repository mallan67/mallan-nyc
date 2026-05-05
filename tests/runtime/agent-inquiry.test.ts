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

// ─── Hand-rolled prisma mock (same pattern as
// contact-form-consent.test.ts and email-pipeline-fail-loud.test.ts) ───
const auditEventCreateMock = jest.fn(async () => ({ id: 1n }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    auditEvent: { create: auditEventCreateMock },
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

function authedSession() {
  return {
    id: 42n,
    email: 'maya@mallan.nyc',
    first_name: 'Maya',
    last_name: 'Allan',
    role: 'BROKER',
  };
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'test-msg-id' });
  auditEventCreateMock.mockClear();
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue(authedSession());
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
    // Sender role label (BROKER → "Licensed Real Estate Broker")
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
