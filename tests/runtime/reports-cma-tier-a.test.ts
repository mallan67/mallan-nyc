/// <reference types="jest" />
/**
 * Reports/CMA Tier A P0 — runtime route tests.
 *
 * Covers:
 *   1. /api/crm/cma POST returns 422 + does NOT create a CmaReport when
 *      findComps returns []
 *   2. /api/crm/cma POST returns 201 + creates a CmaReport when comps
 *      are found (happy path regression guard)
 *   3. /api/crm/market-report POST returns the report with
 *      ai_draft_disclaimer + ai_meta + writes an AuditEvent with
 *      action=ai_narrative_generated
 *   4. /api/crm/1099 GET returns warning when agent has deals but zero
 *      paid agent_split CommissionPayment rows
 *   5. /api/crm/1099 GET returns NO warning when agent has zero deals
 *      (correct early-return)
 *   6. /api/crm/1099 GET returns NO warning when payments are present
 *      (happy path)
 */

import { makeRequest } from './helpers';
import { NextRequest } from 'next/server';

/** Build a real NextRequest so handlers that read req.nextUrl.searchParams
 *  work. (The makeRequest helper returns a plain Request without
 *  next-augmented fields.) */
function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// ─── Hand-rolled prisma mock ────────────────────────────────────────────
const cmaReportCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({
  id: 1n,
  agent_id: 42n,
  property_address: '400 East 90th St',
  borough: 'Manhattan',
  neighborhood: 'Yorkville',
  estimated_value: 1500000,
  price_range_low: 1425000,
  price_range_high: 1575000,
  status: 'draft',
  created_at: new Date(),
  notes: null,
  subject_details: {},
  comps: [],
  adjustments: [],
}));
const auditEventCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 1n }));
const agentFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({
  id: 42n,
  full_name: 'Maya Allan',
  first_name: 'Maya',
  last_name: 'Allan',
}));
const agentFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => [
  { id: 42n, full_name: 'Maya Allan' },
]);
const dealFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const commissionPaymentFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    cmaReport: { create: cmaReportCreateMock },
    auditEvent: { create: auditEventCreateMock },
    agent: {
      findUnique: agentFindUniqueMock,
      findMany: agentFindManyMock,
    },
    deal: { findMany: dealFindManyMock },
    commissionPayment: { findMany: commissionPaymentFindManyMock },
  },
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

// Auth mocks
const requireAgentOrBrokerMock = jest.fn();
const requireBrokerMock = jest.fn();
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  requireBroker: requireBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
}));

// CMA engine mock — controls the comps return shape per test
const findCompsMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const estimateValueMock = jest.fn<unknown, unknown[]>(() => ({ estimated: 1500000, low: 1425000, high: 1575000 }));
jest.mock('@/lib/cma/engine', () => ({
  __esModule: true,
  findComps: findCompsMock,
  estimateValue: estimateValueMock,
}));

// Market-report generator mock — returns the new shape with ai_meta
const generateMarketReportMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({
  title: 'Manhattan Sale Market Report',
  period: 'Q2 2026',
  generated_at: '2026-05-06T12:00:00.000Z',
  sections: [],
  narrative: 'Mock narrative',
  total_listings: 100,
  disclaimer: 'REBNY disclaimer',
  ai_draft_disclaimer: 'AI-generated draft — broker review recommended before distribution.',
  ai_meta: {
    prompt_hash: 'a'.repeat(64),
    response_hash: 'b'.repeat(64),
    prompt_chars: 1500,
    response_chars: 800,
    model: 'claude-sonnet-4-20250514',
    ai_failed: false,
    fallback_used: false,
  },
}));
jest.mock('@/lib/market-report/generator', () => ({
  __esModule: true,
  generateMarketReport: generateMarketReportMock,
}));

beforeEach(() => {
  cmaReportCreateMock.mockClear();
  auditEventCreateMock.mockClear();
  agentFindUniqueMock.mockClear();
  agentFindManyMock.mockClear();
  dealFindManyMock.mockReset();
  dealFindManyMock.mockResolvedValue([]);
  commissionPaymentFindManyMock.mockReset();
  commissionPaymentFindManyMock.mockResolvedValue([]);
  findCompsMock.mockReset();
  findCompsMock.mockResolvedValue([]);
  estimateValueMock.mockClear();
  generateMarketReportMock.mockClear();
  requireAgentOrBrokerMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue({
    userId: 42n,
    userType: 'agent',
    role: 'AGENT',
    sessionId: 's-1',
  });
  requireBrokerMock.mockReset();
  requireBrokerMock.mockResolvedValue({
    userId: 1n,
    userType: 'broker',
    role: 'BROKER',
    sessionId: 's-broker',
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 1. CMA empty-comps fail-loud (Tier A Fix #2)
// ═══════════════════════════════════════════════════════════════════════

describe('POST /api/crm/cma — empty-comps fail-loud', () => {
  it('returns 422 + does NOT create a CmaReport when findComps returns []', async () => {
    findCompsMock.mockResolvedValue([]);

    const { POST } = await import('@/app/api/crm/cma/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/crm/cma',
        body: {
          property_address: '400 East 90th St',
          borough: 'Manhattan',
          neighborhood: 'Yorkville',
          listing_type: 'sale',
          property_type: 'Condo',
          bedrooms: 2,
        },
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/insufficient comparable data/i);
    expect(body.code).toBe('INSUFFICIENT_COMPS');
    expect(body.subject).toEqual(
      expect.objectContaining({
        property_address: '400 East 90th St',
        borough: 'Manhattan',
      }),
    );

    // Critical: no CmaReport written
    expect(cmaReportCreateMock).not.toHaveBeenCalled();
    // estimateValue should also NOT be called (no point computing $0)
    expect(estimateValueMock).not.toHaveBeenCalled();
  });

  it('returns 201 + creates CmaReport when findComps returns >0 comps (happy path)', async () => {
    findCompsMock.mockResolvedValue([
      {
        listing_id: 'RLS1',
        address: '402 East 90th St',
        list_price: 1500000,
        bedrooms: 2,
        bathrooms: 2,
        living_area: 1100,
        status: 'Closed',
        days_on_market: 45,
        similarity_score: 90,
        adjustments: [],
        adjusted_price: 1500000,
      },
    ]);

    const { POST } = await import('@/app/api/crm/cma/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/crm/cma',
        body: {
          property_address: '400 East 90th St',
          borough: 'Manhattan',
          neighborhood: 'Yorkville',
          listing_type: 'sale',
          property_type: 'Condo',
          bedrooms: 2,
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(cmaReportCreateMock).toHaveBeenCalledTimes(1);
    expect(estimateValueMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Market-report AI narrative audit + disclaimer (Tier A Fix #1)
// ═══════════════════════════════════════════════════════════════════════

describe('POST /api/crm/market-report — AI narrative audit', () => {
  it('returns the report with ai_draft_disclaimer + ai_meta and writes an AuditEvent', async () => {
    const { POST } = await import('@/app/api/crm/market-report/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/crm/market-report',
        body: { report_type: 'sale', borough: 'Manhattan' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Disclaimer surfaced
    expect(body.report.ai_draft_disclaimer).toBe(
      'AI-generated draft — broker review recommended before distribution.',
    );

    // AI meta surfaced (hashes + counts + model)
    expect(body.report.ai_meta).toEqual(
      expect.objectContaining({
        prompt_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        response_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        prompt_chars: expect.any(Number),
        response_chars: expect.any(Number),
        model: 'claude-sonnet-4-20250514',
        ai_failed: false,
        fallback_used: false,
      }),
    );

    // AuditEvent written with the right action + ai_meta in changes
    expect(auditEventCreateMock).toHaveBeenCalledTimes(1);
    const auditCalls = auditEventCreateMock.mock.calls;
    const lastCall = auditCalls[auditCalls.length - 1] as unknown;
    const lastArgs = lastCall as unknown[];
    const firstArg = lastArgs[0] as {
      data?: { action?: string; entity_type?: string; changes?: Record<string, unknown> };
    } | undefined;
    expect(firstArg?.data?.action).toBe('ai_narrative_generated');
    expect(firstArg?.data?.entity_type).toBe('market_report');
    expect(firstArg?.data?.changes).toEqual(
      expect.objectContaining({
        report_type: 'sale',
        borough: 'Manhattan',
        ai_meta: expect.objectContaining({
          prompt_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          response_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          model: 'claude-sonnet-4-20250514',
        }),
      }),
    );
  });

  it('rejects invalid report_type with 400 (existing contract)', async () => {
    const { POST } = await import('@/app/api/crm/market-report/route');
    const res = await POST(
      makeRequest({
        url: 'http://test/api/crm/market-report',
        body: { report_type: 'invalid' },
      }),
    );
    expect(res.status).toBe(400);
    expect(generateMarketReportMock).not.toHaveBeenCalled();
    expect(auditEventCreateMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. 1099 enum-mismatch warning (Tier A Fix #3)
// ═══════════════════════════════════════════════════════════════════════

describe('GET /api/crm/1099 — enum-mismatch warning', () => {
  it('returns warning when agent has deals but zero paid agent_split CommissionPayment rows', async () => {
    // Single broker query returns one agent
    agentFindManyMock.mockResolvedValue([
      { id: 42n, full_name: 'Maya Allan' },
    ]);
    // Agent has 3 Deals
    dealFindManyMock.mockResolvedValue([
      { id: 1n },
      { id: 2n },
      { id: 3n },
    ]);
    // But zero matching CommissionPayments
    commissionPaymentFindManyMock.mockResolvedValue([]);

    const { GET } = await import('@/app/api/crm/1099/route');
    const res = await GET(makeGetRequest('http://test/api/crm/1099?year=2026'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(2026);
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.agents).toHaveLength(1);
    const ag = body.agents[0];
    expect(ag.status).toBe('no_payments');
    expect(ag.warning).toBeDefined();
    expect(ag.warning.code).toBe('ZERO_PAID_AGENT_SPLIT_FOR_DEALS');
    expect(ag.warning.deal_count).toBe(3);
    expect(ag.warning.message).toMatch(/payment_type='agent_split'/);
    expect(ag.warning.message).toMatch(/status='paid'/);
  });

  it('returns NO warning when agent has zero deals (correct early-return)', async () => {
    agentFindManyMock.mockResolvedValue([
      { id: 99n, full_name: 'Newer Agent' },
    ]);
    // Zero deals
    dealFindManyMock.mockResolvedValue([]);
    commissionPaymentFindManyMock.mockResolvedValue([]);

    const { GET } = await import('@/app/api/crm/1099/route');
    const res = await GET(makeGetRequest('http://test/api/crm/1099?year=2026'));

    expect(res.status).toBe(200);
    const body = await res.json();
    const ag = body.agents[0];
    expect(ag.status).toBe('no_payments');
    expect(ag.warning).toBeUndefined();
  });

  it('returns NO warning when payments are present (happy path)', async () => {
    agentFindManyMock.mockResolvedValue([
      { id: 42n, full_name: 'Maya Allan' },
    ]);
    dealFindManyMock.mockResolvedValue([{ id: 1n }, { id: 2n }]);
    commissionPaymentFindManyMock.mockResolvedValue([
      {
        amount: 12500,
        date: new Date('2026-03-15'),
        deal_id: 1n,
        payment_type: 'agent_split',
      },
      {
        amount: 8400,
        date: new Date('2026-04-22'),
        deal_id: 2n,
        payment_type: 'agent_split',
      },
    ]);

    const { GET } = await import('@/app/api/crm/1099/route');
    const res = await GET(makeGetRequest('http://test/api/crm/1099?year=2026'));

    expect(res.status).toBe(200);
    const body = await res.json();
    const ag = body.agents[0];
    expect(ag.status).toBe('generated');
    expect(ag.totalCompensation).toBe(20900);
    expect(ag.paymentCount).toBe(2);
    expect(ag.warning).toBeUndefined();
  });
});
