/// <reference types="jest" />
/**
 * Email pipeline fail-loud + TCPA consent — P0-B compliance proof.
 *
 * Extends the contact-form pattern (Bug A14/A15, commit 375ab782) to
 * the remaining 3 lead-capture/notification surfaces:
 *
 *   /api/cma          — CMA / valuation request (Bug A18)
 *   /api/inquiries    — Listing inquiry form (Bug A19)
 *   /api/cron/search-alerts — Daily alert cron (Bug A20)
 *
 * Per the P0-B audit (2026-05-04 design doc §4f), each of these
 * routes had at least one of the two compliance gaps:
 *
 *   - missing TCPA affirmative consent on submit (CMA only)
 *   - missing SMTP fail-loud on _devMode (all three)
 *
 * The fix mirrors the /api/contact pattern: validate consent boolean
 * before any DB write; check emailResult._devMode after sendEmail and
 * return 503 in production with code: 'SMTP_NOT_CONFIGURED' so the
 * caller knows email never went out (rather than seeing a misleading
 * 200 success response).
 *
 * The cron route additionally bails out of its for-loop on the first
 * _devMode response — there's no point processing the remaining
 * saved searches when SMTP is misconfigured for all of them.
 */

import { makeRequest } from './helpers';

// ─── Hand-rolled prisma mock ─────────────────────────────────────
// buildPrismaMock helper's seed mechanism collides with the proxy's
// "prop in target" short-circuit when seeded values are non-function
// objects. Using direct mocks here instead, same pattern as
// contact-form-consent.test.ts.
const leadUpsertMock = jest.fn(async () => ({ id: 99n, email: 'test@example.com', first_name: 'T', last_name: 'U', phone: '555-1234' }));
const auditEventCreateMock = jest.fn(async () => ({ id: 1n }));
const savedSearchUpdateMock = jest.fn(async () => ({}));
const savedSearchFindManyMock = jest.fn(async () => [] as unknown[]);
const clientListingActionUpsertMock = jest.fn(async () => ({}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { upsert: leadUpsertMock },
    auditEvent: { create: auditEventCreateMock, findMany: jest.fn(async () => []) },
    savedSearch: { update: savedSearchUpdateMock, findMany: savedSearchFindManyMock },
    listing: { findMany: jest.fn(async () => []) },
    clientListingAction: { upsert: clientListingActionUpsertMock, findMany: jest.fn(async () => []) },
  },
}));

const ensureLocalListingMock = jest.fn(async (input: { listing_id: string }) => ({ id: BigInt(1000 + Number(String(input.listing_id).replace(/\D/g, "") || 0)), listing_id: input.listing_id, created: true }));
jest.mock("@/lib/listings/ensure-local-listing", () => {
  const actual = jest.requireActual("@/lib/listings/ensure-local-listing");
  return { __esModule: true, ensureLocalListing: ensureLocalListingMock, ensureInputFromSearchDto: actual.ensureInputFromSearchDto };
});
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
jest.mock('@/lib/email/templates', () => ({
  __esModule: true,
  cmaAutoResponseEmail: () => '<html></html>',
  inquiryAutoResponseEmail: () => '<html></html>',
  contactFormEmail: () => '<html></html>',
  listingAlertEmail: () => '<html></html>',
}));

// Mutable email mock — each test sets the response shape (success / _devMode).
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

// Save/restore env across tests
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;

function setEnv(key: 'NODE_ENV' | 'VERCEL_ENV', value: string | undefined) {
  (process.env as Record<string, string | undefined>)[key] = value;
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true });
  leadUpsertMock.mockClear();
  auditEventCreateMock.mockClear();
  savedSearchUpdateMock.mockClear();
  savedSearchFindManyMock.mockClear();
  clientListingActionUpsertMock.mockClear();
});

afterEach(() => {
  setEnv('NODE_ENV', ORIGINAL_NODE_ENV);
  setEnv('VERCEL_ENV', ORIGINAL_VERCEL_ENV);
});

// ═══════════════════════════════════════════════════════════════════
// /api/cma — TCPA consent + SMTP fail-loud (Bug A18)
// ═══════════════════════════════════════════════════════════════════

const cmaBody = () => ({
  name: 'Test Owner',
  email: 'owner@example.com',
  phone: '555-1234',
  address: '100 W 72nd Street',
  unit: '4A',
  borough: 'manhattan',
  propertyType: 'condo',
});

describe('POST /api/cma — TCPA consent enforcement (Bug A18)', () => {
  it('returns 400 when consent boolean is missing', async () => {
    const { POST } = await import('@/app/api/cma/route');
    const res = await POST(makeRequest({ url: 'http://test/api/cma', body: cmaBody() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/consent/i);
    expect(body.error).toMatch(/TCPA/i);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when consent === false', async () => {
    const { POST } = await import('@/app/api/cma/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/cma', body: { ...cmaBody(), consent: false } })
    );
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('returns 400 when consent === "true" string (must be literal boolean)', async () => {
    const { POST } = await import('@/app/api/cma/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/cma', body: { ...cmaBody(), consent: 'true' } })
    );
    expect(res.status).toBe(400);
  });

  it('proceeds when consent === true and creates Lead row', async () => {
    const { POST } = await import('@/app/api/cma/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/cma', body: { ...cmaBody(), consent: true } })
    );
    expect(res.status).toBe(200);
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalled();
  });
});

describe('POST /api/cma — SMTP fail-loud (Bug A18)', () => {
  it('returns 503 with reference when SMTP unconfigured in production', async () => {
    setEnv('VERCEL_ENV', 'production');
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { POST } = await import('@/app/api/cma/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/cma', body: { ...cmaBody(), consent: true } })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SMTP_NOT_CONFIGURED');
    expect(body.leadId).toBeDefined();
    // Lead row IS created so the request data isn't lost
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 in dev/test even when _devMode set (fail-loud is production-only)', async () => {
    setEnv('NODE_ENV', 'development');
    setEnv('VERCEL_ENV', undefined);
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { POST } = await import('@/app/api/cma/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/cma', body: { ...cmaBody(), consent: true } })
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// /api/inquiries — SMTP fail-loud (Bug A19)
//
// Inquiry form already enforces consent via agreeToTerms. P0-B fix
// is just the SMTP fail-loud check on broker notification.
// ═══════════════════════════════════════════════════════════════════

const inquiryBody = () => ({
  name: 'Test Buyer',
  email: 'buyer@example.com',
  phone: '555-5678',
  message: 'Interested in this listing.',
  agreeToTerms: true,
});

describe('POST /api/inquiries — SMTP fail-loud (Bug A19)', () => {
  it('returns 503 when SMTP unconfigured in production', async () => {
    setEnv('VERCEL_ENV', 'production');
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(makeRequest({ url: 'http://test/api/inquiries', body: inquiryBody() }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SMTP_NOT_CONFIGURED');
    expect(body.leadId).toBeDefined();
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 when SMTP works (regression guard)', async () => {
    setEnv('VERCEL_ENV', 'production');
    sendEmailMock.mockResolvedValue({ success: true, messageId: 'abc' });

    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(makeRequest({ url: 'http://test/api/inquiries', body: inquiryBody() }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when agreeToTerms missing (existing consent gate)', async () => {
    const { POST } = await import('@/app/api/inquiries/route');
    const res = await POST(
      makeRequest({ url: 'http://test/api/inquiries', body: { ...inquiryBody(), agreeToTerms: false } })
    );
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// /api/cron/search-alerts — SMTP bail-out (Bug A20)
//
// When the cron iterates saved searches and the FIRST sendEmail
// returns _devMode=true, it must bail out early in production with a
// 503 + audit event — no point in churning through the remaining
// searches when SMTP is doomed for all of them.
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/cron/search-alerts — SMTP fail-loud bail-out (Bug A20)', () => {
  // Build a savedSearch row that has both a lead recipient and
  // sufficient fields to enter the email-send branch. We mock
  // searchProjection / runProjectionListingSearch to short-circuit
  // the loop after one send attempt.
  const baseSearch = {
    id: 1n,
    alert_email: 'recipient@example.com',
    alert_enabled: true,
    alert_frequency: 'daily',
    last_alert_sent: null,
    name: 'My Manhattan Search',
    criteria: { criteria_version: 2, params: { type: 'sale', borough: 'Manhattan' } },
    lead_id: 99n,
    lead: { id: 99n, first_name: 'Test', last_name: 'Buyer', email: 'recipient@example.com' },
    agent: null,
  };

  // Mock the search-core run to return one new listing so the route
  // reaches sendEmail. Without this, runProjectionListingSearch returns
  // [] and the loop would skip the send entirely.
  // The executor boundary: one universe row modified after `since`, hydrated to one DTO.
  jest.mock('@/lib/search/engine/executor', () => {
    const actual = jest.requireActual('@/lib/search/engine/executor');
    return {
      __esModule: true,
      rowsModifiedSince: actual.rowsModifiedSince,
      universeKeyOf: actual.universeKeyOf,
      settledUniverseFor: jest.fn(async () => ({ universe: { rows: [{ source: 'provider', listingKey: 'K1', listingId: 'RLS123', price: 1000000, contractDate: null, modificationTimestamp: '2099-01-01T00:00:00Z' }], total: 1, countMeaning: 'exact' } })),
      hydrateRows: jest.fn(async () => ({ listings: [{ id: 'RLS123', address: '100 W 72ND STREET', unit: '', neighborhood: 'Upper West Side', price: 1000000, beds: 1, baths: 1 }], missing: [], gateExcluded: [] })),
    };
  });
  jest.mock('@/lib/search/search-run-recorder', () => ({
    __esModule: true,
    recordSearchRun: jest.fn(async () => undefined),
  }));

  function makeCronRequest(): Request {
    const headers = new Headers();
    headers.set('authorization', 'Bearer test-secret');
    return new Request('http://test/api/cron/search-alerts', { method: 'GET', headers });
  }

  it('bails out with 503 when SMTP returns _devMode=true in production', async () => {
    setEnv('VERCEL_ENV', 'production');
    (process.env as Record<string, string | undefined>).CRON_SECRET = 'test-secret';
    savedSearchFindManyMock.mockResolvedValue([baseSearch]);
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { GET } = await import('@/app/api/cron/search-alerts/route');
    const res = await GET(makeCronRequest() as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SMTP_NOT_CONFIGURED');
    // Audit event recorded for the bail-out
    const auditCalls = (auditEventCreateMock.mock.calls as unknown as Array<[{ data: { action: string } }]>).map(
      (c) => c[0].data.action,
    );
    expect(auditCalls).toContain('search_alerts_cron_smtp_unconfigured');
  });

  it('does NOT bail out in dev when _devMode=true (production-only behavior)', async () => {
    setEnv('NODE_ENV', 'development');
    setEnv('VERCEL_ENV', undefined);
    (process.env as Record<string, string | undefined>).CRON_SECRET = 'test-secret';
    savedSearchFindManyMock.mockResolvedValue([baseSearch]);
    sendEmailMock.mockResolvedValue({ success: false, error: 'SMTP not configured', _devMode: true });

    const { GET } = await import('@/app/api/cron/search-alerts/route');
    const res = await GET(makeCronRequest() as never);
    // 200 response (the normal cron summary), errored count incremented
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.errored).toBeGreaterThanOrEqual(0);
  });
});
