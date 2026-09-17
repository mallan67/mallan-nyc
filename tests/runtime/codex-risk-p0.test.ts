/// <reference types="jest" />
/**
 * Codex Risk P0 — runtime route tests.
 *
 * Covers the route-level fixes that need a live request/response
 * round-trip to prove. Static source guards live in
 * lib/search/__tests__/codex-risk-p0.test.ts.
 *
 * Tests in this file:
 *   1. Saved-search PATCH validation (null / array / non-object → 400)
 *   2. Inquiries strict boolean consent (string "true" / 1 / "yes" rejected;
 *      boolean true accepted)
 *   3. Agent-inquiry ip_hash is keyed-SHA-256 hex, not base64 of raw IP
 */

import { makeRequest } from './helpers';

// ─── Hand-rolled prisma mock ────────────────────────────────────────────
// Each method is a real jest.fn so we can assert call shapes per-test.
const savedSearchFindUniqueMock = jest.fn();
const savedSearchUpdateMock = jest.fn(async () => ({
  id: 1n,
  name: 'Test',
  criteria: { listing_type: 'sale' },
  updated_at: new Date(),
}));
const leadUpsertMock = jest.fn(async () => ({
  id: 77n,
  email: 'buyer@test.com',
  first_name: 'Test',
  last_name: 'Buyer',
  phone: '',
}));
const auditEventCreateMock = jest.fn(async () => ({ id: 1n }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    savedSearch: {
      findUnique: savedSearchFindUniqueMock,
      update: savedSearchUpdateMock,
    },
    lead: {
      upsert: leadUpsertMock,
    },
    auditEvent: { create: auditEventCreateMock },
  },
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

const requireAgentOrBrokerMock = jest.fn();
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
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

jest.mock('@/lib/inquiries/create', () => {
  // Re-export the real hashIp so the agent-inquiry test can verify
  // the route uses the keyed-SHA-256 implementation.
  const actual = jest.requireActual('@/lib/inquiries/create') as {
    hashIp: (ip: string | null | undefined) => string | null;
  };
  return {
    __esModule: true,
    createInquiry: jest.fn(async () => 12345n),
    hashIp: actual.hashIp,
  };
});

jest.mock('@/lib/behavioral/session-link', () => ({
  __esModule: true,
  extractBehavioralSessionId: jest.fn(() => null),
  linkBehavioralSessionToLead: jest.fn(async () => undefined),
}));

jest.mock('@/lib/crm/access', () => ({
  __esModule: true,
  assertLeadIdStringAccess: jest.fn(async () => ({ leadId: null, response: null })),
}));

type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  _devMode?: boolean;
};
const sendEmailMock = jest.fn<Promise<SendEmailResult>, unknown[]>(
  async () => ({ success: true, messageId: 'm-1' }),
);
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: sendEmailMock,
}));

beforeEach(() => {
  savedSearchFindUniqueMock.mockReset();
  savedSearchUpdateMock.mockClear();
  leadUpsertMock.mockClear();
  auditEventCreateMock.mockClear();
  requireAgentOrBrokerMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'm-1' });

  // Default authed user — most tests need this
  requireAgentOrBrokerMock.mockResolvedValue({
    userId: 42n,
    userType: 'agent',
    role: 'AGENT',
    sessionId: 's-1',
  });

  // Default existing saved-search row — most PATCH tests need this
  savedSearchFindUniqueMock.mockResolvedValue({
    id: 1n,
    name: 'Existing',
    criteria: { listing_type: 'sale' },
    agent_id: 42n,
    alert_frequency: null,
    alert_enabled: false,
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Saved-search PATCH criteria validation (Codex Risk P0 fix #2)
// ═══════════════════════════════════════════════════════════════════════

describe('PATCH /api/crm/saved-searches/[id] — criteria validation', () => {
  async function patch(criteria: unknown) {
    const { PATCH } = await import('@/app/api/crm/saved-searches/[id]/route');
    return PATCH(
      makeRequest({
        url: 'http://test/api/crm/saved-searches/1',
        method: 'PATCH',
        body: { criteria },
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
  }

  it('rejects criteria: null with 400', async () => {
    const res = await patch(null);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/plain JSON object/i);
    expect(body.error).toMatch(/not null/i);
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects criteria: [] (array) with 400', async () => {
    const res = await patch([]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/plain JSON object/i);
    expect(body.error).toMatch(/not an array/i);
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects criteria: ["a","b"] (non-empty array) with 400', async () => {
    const res = await patch(['a', 'b']);
    expect(res.status).toBe(400);
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects criteria: "string" (non-object) with 400', async () => {
    const res = await patch('not an object');
    expect(res.status).toBe(400);
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects criteria: 42 (number) with 400', async () => {
    const res = await patch(42);
    expect(res.status).toBe(400);
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });

  it('accepts the canonical executor-parameter object and updates the row', async () => {
    savedSearchUpdateMock.mockResolvedValueOnce({
      id: 1n, agent_id: 42n, lead_id: null, name: 'Existing', criteria: { criteria_version: 2, params: { type: 'sale', minPrice: '1000' } },
      last_run: null, result_count: null, alert_frequency: null, alert_enabled: false, last_alert_sent: null, alert_email: null,
      created_at: new Date(), updated_at: new Date(),
    } as never);
    const res = await patch({ criteria_version: 2, params: { type: 'sale', minPrice: '1000' } });
    expect(res.status).toBe(200);
    expect(savedSearchUpdateMock).toHaveBeenCalledTimes(1);
  });
  it('refuses the retired browser dialect as a plain object with 400 criteria_contract (Packet 2)', async () => {
    const res = await patch({ listing_type: 'sale', min_price: 1000 });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('criteria_contract');
    expect(savedSearchUpdateMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Inquiries strict boolean consent (Codex Risk P0 fix #5)
// ═══════════════════════════════════════════════════════════════════════

describe('POST /api/inquiries — strict boolean consent', () => {
  async function postInquiry(agreeToTerms: unknown) {
    const { POST } = await import('@/app/api/inquiries/route');
    return POST(
      makeRequest({
        url: 'http://test/api/inquiries',
        body: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '5551234',
          message: 'Interested',
          agreeToTerms,
        },
      }),
    );
  }

  it('rejects agreeToTerms: "true" (string) with 400', async () => {
    const res = await postInquiry('true');
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects agreeToTerms: 1 (number) with 400', async () => {
    const res = await postInquiry(1);
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects agreeToTerms: "yes" with 400', async () => {
    const res = await postInquiry('yes');
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects agreeToTerms: {} (object) with 400', async () => {
    const res = await postInquiry({});
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects agreeToTerms: false with 400', async () => {
    const res = await postInquiry(false);
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('rejects agreeToTerms: undefined with 400', async () => {
    const res = await postInquiry(undefined);
    expect(res.status).toBe(400);
    expect(leadUpsertMock).not.toHaveBeenCalled();
  });

  it('accepts agreeToTerms: true (literal boolean) with 200', async () => {
    const res = await postInquiry(true);
    expect(res.status).toBe(200);
    expect(leadUpsertMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Agent-inquiry ip_hash is keyed-SHA-256 hex, not base64 (fix #6)
// ═══════════════════════════════════════════════════════════════════════

describe('POST /api/crm/agent-inquiry — ip_hash is non-reversible', () => {
  it('writes ip_hash as 64-char hex (SHA-256), not base64-of-raw-IP', async () => {
    requireAgentOrBrokerMock.mockResolvedValue({
      id: 42n,
      email: 'maya@mallan.nyc',
      first_name: 'Maya',
      last_name: 'Allan',
      role: 'BROKER',
    });

    const { POST } = await import('@/app/api/crm/agent-inquiry/route');

    await POST(
      makeRequest({
        url: 'http://test/api/crm/agent-inquiry',
        body: {
          listing_id: 'RLS20078109',
          listing_address: '400 East 90th Street',
          agent_email: 'other@agent.com',
          agent_name: 'Other Agent',
          message: 'I am writing to inquire',
        },
      }),
    );

    expect(auditEventCreateMock).toHaveBeenCalled();
    const calls = auditEventCreateMock.mock.calls;
    const lastCall = calls[calls.length - 1] as unknown;
    expect(Array.isArray(lastCall)).toBe(true);
    const lastArgs = lastCall as unknown[];
    const firstArg = lastArgs[0] as { data?: { changes?: Record<string, unknown> } } | undefined;
    const ipHash = firstArg?.data?.changes?.ip_hash;
    expect(typeof ipHash).toBe('string');

    // SHA-256 hex digest is 64 lowercase hex chars
    expect(ipHash).toMatch(/^[a-f0-9]{64}$/);

    // The prior implementation produced a base64 substring (16 chars)
    // of the raw IP. The new keyed hash MUST NOT match that shape.
    const ipB64 = Buffer.from('203.0.113.42').toString('base64').slice(0, 16);
    expect(ipHash).not.toBe(ipB64);

    // The hash MUST NOT contain the raw IP as a substring (hex of an
    // ASCII IP cannot accidentally encode the IP itself; this is a
    // belt-and-suspenders check).
    expect(ipHash).not.toContain('203');
    expect(ipHash).not.toContain('113');
  });
});
