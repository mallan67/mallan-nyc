/// <reference types="jest" />
/**
 * /api/crm/reports/email — the Reports modal's Email output, server-authoritative.
 *
 * Before 2026-10-27 the modal's "Generate & Send" with output Email ran a client-side
 * EmailJS call that was never configured, showed "Email sent (simulated)" and left no
 * server record: no report ever reached a client. The route sends the rendered report
 * through lib/email/sendgrid.ts (Microsoft 365 SMTP) from the agent's address and
 * writes an AuditEvent on every attempt, like /api/crm/agent-inquiry.
 *
 * Test surface:
 *   - Unauthenticated → 401, nothing sent, nothing audited
 *   - Missing to_email / subject / html → 400
 *   - Oversized html → 413
 *   - Valid body + sendEmail success → 200, sendEmail called with the report HTML on the
 *     agent channel (From = the agent), AuditEvent action='report_emailed'
 *   - sendEmail _devMode in production → 503 SMTP_NOT_CONFIGURED + audit 'report_email_failed'
 *   - sendEmail _devMode outside production → 503 too (never "sent (simulated)")
 *   - sendEmail _suppressed (recipient unsubscribed) → 409
 *   - sendEmail transient failure → 502
 *   - The CRM page calls the route through MallanAPI.reports.email and no longer simulates
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { makeRequest } from './helpers';
import type { SessionUser } from '@/lib/auth/session';

const auditEventCreateMock = jest.fn(async () => ({ id: 1n }));
const agentFindUniqueMock = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    auditEvent: { create: auditEventCreateMock },
    agent: { findUnique: agentFindUniqueMock },
  },
}));

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

type SendEmailResult = { success: boolean; messageId?: string; error?: string; _devMode?: boolean; _suppressed?: boolean };
type SendEmailCallArgs = [string, string, string, unknown?, unknown?];
const sendEmailMock = jest.fn<Promise<SendEmailResult>, SendEmailCallArgs>(async () => ({ success: true, messageId: 'msg-1' }));
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: sendEmailMock,
}));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
function setEnv(key: 'NODE_ENV' | 'VERCEL_ENV', value: string | undefined) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

const AGENT_RECORD = { full_name: 'Maya Allan', email: 'maya@mallan.nyc' };

function authedSession(overrides: Partial<SessionUser> = {}): SessionUser {
  return { userId: 42n, userType: 'agent', role: 'BROKER', sessionId: 'sess-test-1', ...overrides };
}

const REPORT_HTML = '<!DOCTYPE html><html><body><h1>Property Report</h1><p>1060 PARK AVENUE, 11A</p><img src="https://mallan.nyc/api/media/proxy?url=x"></body></html>';

const validBody = () => ({
  to_email: 'buyer@example.invalid',
  to_name: 'Test Buyer',
  subject: 'Property Report — Mallan Real Estate',
  html: REPORT_HTML,
  title: 'Property Report',
  format: 'grid',
  version: 'customer',
  listing_ids: ['RLS20110568', 'RLS20095486', 'RLS20086084'],
  client_id: 'c-1001',
});

async function post(body: unknown) {
  const { POST } = await import('@/app/api/crm/reports/email/route');
  return POST(makeRequest({ url: 'http://test/api/crm/reports/email', body }));
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'msg-1' });
  auditEventCreateMock.mockClear();
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue(authedSession());
  agentFindUniqueMock.mockReset();
  agentFindUniqueMock.mockResolvedValue(AGENT_RECORD);
  setEnv('NODE_ENV', 'test');
  setEnv('VERCEL_ENV', undefined);
});

afterEach(() => {
  setEnv('NODE_ENV', ORIGINAL_NODE_ENV);
  setEnv('VERCEL_ENV', ORIGINAL_VERCEL_ENV);
});

describe('POST /api/crm/reports/email — gating and validation', () => {
  it('returns 401 when unauthenticated and sends nothing', async () => {
    requireAgentOrBrokerMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }));
    const res = await post(validBody());
    expect(res.status).toBe(401);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(auditEventCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['to_email', { to_email: 'not-an-email' }],
    ['subject', { subject: '' }],
    ['html', { html: '   ' }],
  ])('returns 400 when %s is missing or invalid', async (field, patch) => {
    const res = await post({ ...validBody(), ...patch });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain(field);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 413 for a report larger than the mail limit', async () => {
    const res = await post({ ...validBody(), html: '<p>' + 'x'.repeat(1_600_000) + '</p>' });
    expect(res.status).toBe(413);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/reports/email — delivery', () => {
  it('sends the report HTML from the agent and audits report_emailed', async () => {
    const res = await post(validBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, recipientEmail: 'buyer@example.invalid', recipientName: 'Test Buyer', listingCount: 3, messageId: 'msg-1' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [to, subject, html, , opts] = sendEmailMock.mock.calls[0];
    expect(to).toBe('buyer@example.invalid');
    expect(subject).toBe('Property Report — Mallan Real Estate');
    expect(html).toBe(REPORT_HTML);
    expect(opts).toMatchObject({ channel: 'agent', from: { email: 'maya@mallan.nyc', name: 'Maya Allan' }, replyTo: 'maya@mallan.nyc' });
    // a report to a client is not a transactional (suppression-bypassing) send
    expect((opts as { transactional?: boolean }).transactional).not.toBe(true);

    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const audit = (auditEventCreateMock.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(audit).toMatchObject({ action: 'report_emailed', entity_type: 'report', entity_id: 'RLS20110568', user_type: 'broker', user_id: 42n });
    expect(audit.changes).toMatchObject({ recipient_email_domain: 'example.invalid', client_id: 'c-1001', format: 'grid', version: 'customer', listing_count: 3, success: true, error_class: null, source: 'crm_reports_modal' });
    // the recipient address itself is not written to the audit row
    expect(JSON.stringify(audit.changes)).not.toContain('buyer@example.invalid');
  });

  it('falls back to the company channel when the agent record has no email', async () => {
    agentFindUniqueMock.mockResolvedValue(null);
    const res = await post(validBody());
    expect(res.status).toBe(200);
    const opts = sendEmailMock.mock.calls[0][4] as { channel?: string; from?: unknown };
    expect(opts.channel).toBe('company');
    expect(opts.from).toBeUndefined();
  });

  it('returns 503 SMTP_NOT_CONFIGURED in production when SMTP is missing, and audits the failure', async () => {
    setEnv('NODE_ENV', 'production');
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });
    const res = await post(validBody());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SMTP_NOT_CONFIGURED');
    const audit = (auditEventCreateMock.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(audit.action).toBe('report_email_failed');
    expect(audit.changes).toMatchObject({ success: false, error_class: 'smtp_not_configured' });
  });

  it('never pretends: outside production an unconfigured SMTP is also a 503', async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });
    const res = await post(validBody());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it('returns 409 when the recipient has unsubscribed', async () => {
    sendEmailMock.mockResolvedValue({ success: false, _suppressed: true, error: 'suppressed' });
    const res = await post(validBody());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('RECIPIENT_UNSUBSCRIBED');
  });

  it('returns 502 on a transient send failure', async () => {
    sendEmailMock.mockResolvedValue({ success: false, error: 'ECONNRESET' });
    const res = await post(validBody());
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('SEND_FAILED');
  });
});

describe('the CRM Reports modal uses the route', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r/g, '');
  const reports = read('public/crm/js/output/reports.js');
  const api = read('public/crm/js/core/api-client.js');

  it('MallanAPI.reports.email posts to /api/crm/reports/email with credentials', () => {
    expect(api).toMatch(/var reports = \{[\s\S]*?email: function \(data\) \{\s*return _fetch\('\/api\/crm\/reports\/email', \{\s*method: 'POST'/);
    expect(api).toMatch(/reports: reports,/);
  });

  it('sendEmailDirect sends through the server and no longer simulates or uses EmailJS', () => {
    expect(reports).toMatch(/MallanAPI\.reports\.email\(\{/);
    expect(reports).not.toMatch(/sendViaEmailJS/);
    expect(reports).not.toMatch(/Not configured — simulate/);
    expect(reports).not.toMatch(/'simulated'/);
    expect(reports).toMatch(/method: 'server'/);
  });

  it('the Shareable Link output is refused visibly instead of copying a dead link', () => {
    expect(reports).not.toMatch(/mallan\.nyc\/reports\/view/);
    expect(reports).toMatch(/Shareable links are not available yet/);
    expect(reports).toMatch(/if \(generateShareableLink\(\) === false\) return;/);
  });

  it('the printable report anchors relative photo paths and the email makes them absolute', () => {
    expect(reports).toMatch(/html \+= '<base href="' \+ location\.origin \+ '\/">';/);
    expect(reports).toMatch(/reportBody = String\(reportBody \|\| ''\)\.replace\(\/\(src\|href\)="\\\/\(api\|crm\)\\\/\/g/);
  });

  it('Detail and Open House render every listing, and the photo selector decides their photos', () => {
    expect(reports).toMatch(/var d = headerBlock\(\) \+ agentClientBar\(\);\s*listings\.forEach\(function\(first, detailIdx\) \{/);
    expect(reports).toMatch(/var detShowPhotos = Math\.min\(detailImgs\.length, detPhotoCount\);/);
    expect(reports).toMatch(/var showPhotos = Math\.min\(photos\.length, fsPhotoCount\);/);
    expect(reports).toMatch(/listings\.forEach\(function\(ohFirst, ohIdx\) \{/);
    expect(reports).not.toMatch(/var first = listings\[0\] \|\| \{\};/);
    expect(reports).not.toMatch(/var ohFirst = listings\[0\] \|\| \{\};/);
  });
});
