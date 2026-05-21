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
// A3 (2026-05-20): the contact route now calls lead.findUnique BEFORE
// upsert to additively merge roles. Default = no prior lead (first-time
// contact); the intent-routing describe block overrides per-test.
const leadFindUniqueMock = jest.fn(async () => null as null | { roles: string[] });

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { upsert: leadUpsertMock, findUnique: leadFindUniqueMock },
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
  leadFindUniqueMock.mockReset();
  // Default = first-time lead, no prior roles. Per-test overrides
  // simulate a returning lead.
  leadFindUniqueMock.mockResolvedValue(null);
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

// ── A3 (2026-05-20): intent routing ────────────────────────────────────
//
// The public site exposes CTAs that carry `?intent=` (e.g. an exclusive
// townhouse landing-page CTA → /contact?intent=townhouse-seller). Prior to
// this PR the value was DROPPED between URL → form → API → lead, so a
// high-intent seller was treated as a generic buyer lead.
//
// Audit pointer:
//   docs/audits/exclusive-launch-readiness-audit-2026-05-20.md → A3.
//
// These cases assert:
//   (a) the closed allowlist behavior — only the 8 known values map to
//       roles other than ["buyer"];
//   (b) the additive role merge — a returning lead's prior roles are
//       NEVER overwritten;
//   (c) the AuditEvent shape — `intent`, `intent_raw`, and
//       `roles_after_merge` are recorded for forensic and routing review;
//   (d) the source-pin contract — INTENT_ALLOWLIST, classifyIntent, and
//       mergeRoles are exported by the route module so future refactors
//       that rename or remove them red-light this suite.
describe('POST /api/contact — intent routing (A3 2026-05-20)', () => {
  type AuditChanges = {
    intent?: string;
    intent_raw?: string | null;
    roles_after_merge?: string[];
  };
  const lastAuditChanges = (): AuditChanges => {
    expect(auditEventCreateMock).toHaveBeenCalled();
    const lastCall = auditEventCreateMock.mock.calls[
      auditEventCreateMock.mock.calls.length - 1
    ] as unknown as [{ data: { changes: AuditChanges } }];
    return lastCall[0].data.changes;
  };
  const lastUpsertRoles = (): string[] => {
    expect(leadUpsertMock).toHaveBeenCalled();
    const lastCall = leadUpsertMock.mock.calls[
      leadUpsertMock.mock.calls.length - 1
    ] as unknown as [
      {
        create: { roles: string[] };
        update: { roles?: string[] };
      },
    ];
    // The route writes the same merged-roles array into both create.roles
    // and update.roles, so either side is authoritative for the assertion.
    return lastCall[0].create.roles;
  };

  // For the merge tests below we let the route's normal production code
  // path run (consent=true), which is verified separately by the consent
  // suite above. We also force VERCEL_ENV out of production so the SMTP
  // fail-loud branch can't intercept the 200 response.
  beforeEach(() => {
    (process.env as Record<string, string | undefined>).VERCEL_ENV = undefined;
  });

  it('case 1 — no intent field → roles default to ["buyer"] (non-regression)', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true },
      })
    );
    expect(res.status).toBe(200);
    expect(lastUpsertRoles()).toEqual(['buyer']);
    const changes = lastAuditChanges();
    expect(changes.intent).toBe('general');
    expect(changes.intent_raw).toBeNull();
    expect(changes.roles_after_merge).toEqual(['buyer']);
  });

  it('case 2 — intent=general → roles = ["buyer"] (non-regression)', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: 'general' },
      })
    );
    expect(res.status).toBe(200);
    expect(lastUpsertRoles()).toEqual(['buyer']);
    expect(lastAuditChanges().intent).toBe('general');
    expect(lastAuditChanges().intent_raw).toBe('general');
  });

  it('case 3 — intent=seller (first contact) → roles includes "seller", NOT "buyer"', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: 'seller' },
      })
    );
    expect(res.status).toBe(200);
    const roles = lastUpsertRoles();
    expect(roles).toContain('seller');
    expect(roles).not.toContain('buyer');
    expect(lastAuditChanges().intent).toBe('seller');
    expect(lastAuditChanges().roles_after_merge).toEqual(['seller']);
  });

  it('case 4 — intent=exclusive-seller → roles includes "seller", audit records exclusive-seller', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: 'exclusive-seller' },
      })
    );
    expect(res.status).toBe(200);
    expect(lastUpsertRoles()).toEqual(['seller']);
    expect(lastAuditChanges().intent).toBe('exclusive-seller');
    expect(lastAuditChanges().intent_raw).toBe('exclusive-seller');
  });

  it('case 5 — intent=international-seller → roles includes "seller", audit records international-seller', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: 'international-seller' },
      })
    );
    expect(res.status).toBe(200);
    expect(lastUpsertRoles()).toEqual(['seller']);
    expect(lastAuditChanges().intent).toBe('international-seller');
  });

  it('case 6 — XSS-style raw intent → normalized to "general", raw kept (truncated) for forensics', async () => {
    const xssPayload = '<script>alert(1)</script>';
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: xssPayload },
      })
    );
    expect(res.status).toBe(200);
    // Defaults to buyer because the value is not in the allowlist.
    expect(lastUpsertRoles()).toEqual(['buyer']);
    const changes = lastAuditChanges();
    expect(changes.intent).toBe('general');
    // intent_raw preserves the raw payload (under the 128-char cap) so a
    // human reviewer can spot abuse patterns without the value ever
    // touching business logic.
    expect(changes.intent_raw).toBe(xssPayload);
  });

  it('case 6b — overly-long raw intent → truncated to 128 chars in intent_raw', async () => {
    const huge = 'a'.repeat(500);
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: huge },
      })
    );
    expect(res.status).toBe(200);
    expect(lastAuditChanges().intent_raw?.length).toBe(128);
    expect(lastAuditChanges().intent).toBe('general');
  });

  it('case 7 — returning lead with prior ["buyer","seller"], intent=tenant → merged ["buyer","seller","tenant"], no role lost', async () => {
    leadFindUniqueMock.mockResolvedValueOnce({ roles: ['buyer', 'seller'] });
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: 'tenant' },
      })
    );
    expect(res.status).toBe(200);
    const roles = lastUpsertRoles();
    expect(roles).toEqual(['buyer', 'seller', 'tenant']);
    expect(lastAuditChanges().roles_after_merge).toEqual([
      'buyer',
      'seller',
      'tenant',
    ]);
  });

  it('case 7b — case-insensitive: intent=" SELLER " → normalizes to "seller"', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/contact',
        body: { ...baseBody(), consent: true, intent: '  SELLER  ' },
      })
    );
    expect(res.status).toBe(200);
    expect(lastAuditChanges().intent).toBe('seller');
    expect(lastUpsertRoles()).toEqual(['seller']);
  });

  // Source-pin: a future refactor that renames or removes any of these
  // exports will red-light this suite immediately. This catches the
  // "well-meaning rename" failure mode that a black-box test cannot.
  it('source-pin — exports INTENT_ALLOWLIST, classifyIntent, mergeRoles', async () => {
    const mod: Record<string, unknown> = await import('@/app/api/contact/route');
    expect(typeof mod.classifyIntent).toBe('function');
    expect(typeof mod.mergeRoles).toBe('function');
    expect(mod.INTENT_ALLOWLIST).toBeInstanceOf(Set);
    // The exact membership of the allowlist is asserted as well — adding
    // a value WITHOUT updating this assertion forces a deliberate review
    // (especially for any value that could collide with Fair Housing).
    const allowlist = mod.INTENT_ALLOWLIST as Set<string>;
    expect(allowlist.has('general')).toBe(true);
    expect(allowlist.has('buyer')).toBe(true);
    expect(allowlist.has('seller')).toBe(true);
    expect(allowlist.has('exclusive-seller')).toBe(true);
    expect(allowlist.has('townhouse-seller')).toBe(true);
    expect(allowlist.has('international-seller')).toBe(true);
    expect(allowlist.has('landlord')).toBe(true);
    expect(allowlist.has('tenant')).toBe(true);
    expect(allowlist.size).toBe(8);
  });
});
