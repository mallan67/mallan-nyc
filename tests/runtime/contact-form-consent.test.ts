/// <reference types="jest" />
/**
 * Contact form consent + SMTP fail-loud — P0 compliance proof.
 *
 * Bug A14 (TCPA affirmative consent):
 *   Prior to 2026-05-04 the contact route accepted body.consentTimestamp
 *   without verifying body.consent === true. Frontend sent the timestamp
 *   on every submit regardless of whether the user actually checked the
 *   consent box. Result: consent timestamp recorded without proof of
 *   affirmative consent — TCPA 47 CFR 64.1200(f)(8) requires "prior
 *   express written consent."
 *
 * Bug A15 (SMTP fail-loud):
 *   Prior to 2026-05-04 the contact route returned 200 OK even when the
 *   email send silently failed because SMTP_USER / SMTP_PASS env vars
 *   were missing in production (lib/email/sendgrid.ts:93 returns
 *   _devMode: true). User saw "success" but no email sent. Now the
 *   route returns 503 in production when emailResult._devMode === true.
 */

import { makeRequest } from './helpers';

// Direct minimal prisma mock — buildPrismaMock seed mechanism collides
// with the proxy's "prop in target" short-circuit when seeded values are
// non-function objects, so we use a hand-rolled mock here. Each method
// is a real jest.fn so we can assert call counts and overrides.
const leadUpsertMock = jest.fn(async () => ({ id: 99n, email: 'test@example.com' }));
const auditEventCreateMock = jest.fn(async () => ({ id: 1n }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { upsert: leadUpsertMock },
    auditEvent: { create: auditEventCreateMock },
  },
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: jest.fn(async () => true),
  extractClientIp: jest.fn(() => '203.0.113.42'),
}));
jest.mock('@/lib/sanitize', () => ({
  __esModule: true,
  escapeHtml: (s: string) => s,
  sanitizeUserInput: (s: string) => s,
}));
jest.mock('@/lib/inquiries/create', () => ({
  __esModule: true,
  createInquiry: jest.fn(async () => 12345n),
}));
jest.mock('@/lib/behavioral/session-link', () => ({
  __esModule: true,
  extractBehavioralSessionId: jest.fn(() => null),
  linkBehavioralSessionToLead: jest.fn(async () => undefined),
}));

// Mutable email mock — each test sets the response shape (success / _devMode).
// Type-annotate the resolved-value shape so mockResolvedValue accepts the
// full lib/email/sendgrid.ts return contract (messageId, error, _devMode,
// _suppressed are all optional fields on the actual signature).
type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  _devMode?: boolean;
  _suppressed?: boolean;
};
const sendEmailMock = jest.fn<Promise<SendEmailResult>, unknown[]>(async () => ({ success: true }));
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: sendEmailMock,
}));

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true });
  leadUpsertMock.mockClear();
  auditEventCreateMock.mockClear();
});

const baseBody = () => ({
  name: 'Test User',
  email: 'test@example.com',
  message: 'I have a question about a listing.',
  consentTimestamp: new Date().toISOString(),
});

describe('POST /api/contact — TCPA consent enforcement (Bug A14)', () => {
  it('returns 400 when consent boolean is missing', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(makeRequest({ url: 'http://test/api/contact', body: baseBody() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/consent/i);
    expect(body.error).toMatch(/TCPA/i);
    // Lead row is NOT created when consent fails.
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when consent is explicitly false', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/contact', body: { ...baseBody(), consent: false } })
    );
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when consent is the string "true" (must be literal boolean)', async () => {
    // Catches sloppy frontend that sends consent: "true" (string) — TCPA
    // requires affirmative checkbox state, which serializes as boolean
    // not string.
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/contact', body: { ...baseBody(), consent: 'true' } })
    );
    expect(res.status).toBe(400);
  });

  it('proceeds when consent === true and creates Lead row', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/contact', body: { ...baseBody(), consent: true } })
    );
    expect(res.status).toBe(200);
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/contact — SMTP fail-loud in production (Bug A15)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

  afterEach(() => {
    // TypeScript treats process.env entries as readonly Record<string, string>,
    // so we cast to a writable shape to assign undefined (runtime-equivalent
    // to delete for our isProd check, which uses strict equality with 'production').
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = ORIGINAL_NODE_ENV;
    env.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  });

  it('returns 503 with reference when SMTP unconfigured in production', async () => {
    (process.env as Record<string, string>).VERCEL_ENV = 'production';
    sendEmailMock.mockResolvedValue({
      success: false,
      error: 'SMTP not configured',
      _devMode: true,
    });

    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/contact', body: { ...baseBody(), consent: true } })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SMTP_NOT_CONFIGURED');
    expect(body.leadId).toBeDefined();
    // Lead row IS created so the inquiry data isn't lost
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 even when SMTP fails for non-config reasons (transient errors are still non-fatal)', async () => {
    (process.env as Record<string, string>).VERCEL_ENV = 'production';
    sendEmailMock.mockResolvedValue({
      success: false,
      error: 'Connection timeout',
      // No _devMode flag — this is a transient network error, not a
      // missing-config error. Don't fail-loud on transient.
    });

    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/contact', body: { ...baseBody(), consent: true } })
    );
    expect(res.status).toBe(200);
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 in dev/test even when _devMode is set (fail-loud is production-only)', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    // TypeScript treats process.env entries as readonly; assign undefined
    // (the runtime equivalent of delete for our isProd check, which uses
    // strict equality with 'production').
    (process.env as Record<string, string | undefined>).VERCEL_ENV = undefined;
    sendEmailMock.mockResolvedValue({
      success: false,
      error: 'SMTP not configured',
      _devMode: true,
    });

    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/contact', body: { ...baseBody(), consent: true } })
    );
    expect(res.status).toBe(200);
  });
});
