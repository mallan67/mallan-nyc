/// <reference types="jest" />
/**
 * The seller pitch packet says the REBNY Listing Service statistical disclaimer (UCBA 2026 Art. VIII Sec. 4) with the period its statistics cover.
 *
 * Found 2026-10-09 (an independent read of every surface that shows statistics drawn from the RLS): the pitch-packet JSON, the PDF packet's data, the packet email and the hook email each built
 * their own sentence, "for the period <a year ago> through <today>", without the UCBA's second sentence, whatever dates the comparable sales really had (a curated comparable sale from two years ago
 * was still "the last year"); the hook email's footer carried one date range as a string; and the PDF packet (renderPitchPacketHTML) carried no disclaimer at all, though it prints recent sales.
 * lib/compliance/rls-statistical-disclaimer.ts is the one wording; each route asks it for the period: the year before today, further back when a curated comparable sale is older, through today.
 *
 * The REAL route handlers run, with the database, the mailer and Cotality stubbed.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import { rlsStatisticalDisclaimer } from '@/lib/compliance/rls-statistical-disclaimer';
import { renderPitchPacketHTML } from '@/lib/pitch-packet/template';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

const AUTH_CONTEXT = { userId: 1n, userType: 'agent' as const, role: 'BROKER', sessionId: 's1' };
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => AUTH_CONTEXT),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: jest.fn(async () => 'token') }));
const sendEmailMock = jest.fn(async (..._args: unknown[]) => ({ success: true, messageId: 'm-1' }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: (...args: unknown[]) => sendEmailMock(...args) }));

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prismaMock as any;
const TODAY = new Date('2026-10-09T16:00:00Z');           // New York: October 9, 2026
const CONSUMERS = " This information is provided for consumers' personal, non-commercial use.";
const sentence = (start: string, end: string) => rlsStatisticalDisclaimer(start, end);
const OLD_WORDING = /for the period indicated|for the period ending|Based on information from the REBNY Listing Service\. /;

const comp = (address: string, close_date: string | null, extra: Record<string, unknown> = {}) => ({ address, unit: '4D', close_price: 1_200_000, close_date, beds: 2, baths: 2, sqft: 1000, ...extra });
const prospect = (comps: unknown[] | undefined) => ({
  id: 7n, owner_name: 'Jane Owner', owner_email: 'jane@example.test', consent_opt_out_at: null, address: '400 East 90th Street', unit: '12A', borough: '1', neighborhood: 'Yorkville',
  property_type: 'Condo', beds: 2, baths: 2, sqft: 1000, building_name: null, postal_code: '10128', last_purchase_price: 800_000, last_purchase_date: new Date('2015-05-01T12:00:00Z'),
  pitch_data: comps ? { comps } : null, signals: [], assigned_agent_id: 1n,
});
const params = { params: Promise.resolve({ id: '7' }) } as never;

beforeAll(() => {
  // only the clock is faked: the routes' timers, promises and the stubs keep running
  jest.useFakeTimers({ now: TODAY, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'hrtime', 'performance'] });
});
afterAll(() => { jest.useRealTimers(); });
beforeEach(() => {
  jest.clearAllMocks();
  db.agent.findUnique = jest.fn(async () => ({ first_name: 'Maya', last_name: 'Allan', email: 'maya@example.test' }));
  db.lead.count = jest.fn(async () => 120);
  db.sellerLead.update = jest.fn(async (arg: unknown) => arg);
  db.outreachEvent.create = jest.fn(async (arg: unknown) => arg);
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ value: [{ ListingId: 'X1', UnparsedAddress: '410 East 90th Street', UnitNumber: '3B', ClosePrice: 1_100_000, CloseDate: '2026-03-12', BedroomsTotal: 2, BathroomsTotalInteger: 2, LivingArea: 950, ListPrice: 1_250_000 }] }) }));
});

// ── GET /api/crm/sales/prospects/[id]/pitch-packet ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('GET pitch-packet', () => {
  const attributionOf = async (comps: unknown[] | undefined) => {
    db.sellerLead.findFirst = jest.fn(async () => prospect(comps));
    const route = await import('@/app/api/crm/sales/prospects/[id]/pitch-packet/route');
    const res = await route.GET(makeRequest({ method: 'GET' }), params);
    expect(res.status).toBe(200);
    return (await readJson<{ attribution: string }>(res)).attribution;
  };

  it('curated comparable sales of the last year: the year before today, through today, and the UCBA\'s two sentences', async () => {
    const attribution = await attributionOf([comp('410 East 90th Street', '2026-03-12'), comp('420 East 90th Street', '2025-12-01')]);
    expect(attribution).toBe(sentence('2025-10-09', '2026-10-09') + CONSUMERS);
    expect(attribution).toContain('for the period October 9, 2025 through October 9, 2026. The REBNY Listing Service makes no representations or warranties');
    expect(attribution).not.toMatch(OLD_WORDING);
  });

  it('a curated comparable sale older than the year moves the start back to its close date', async () => {
    const attribution = await attributionOf([comp('410 East 90th Street', '2026-03-12'), comp('300 East 90th Street', '2024-03-02')]);
    expect(attribution).toBe(sentence('2024-03-02', '2026-10-09') + CONSUMERS);
  });

  it('comparable sales with no close date, or none: the year before today', async () => {
    expect(await attributionOf([comp('410 East 90th Street', null)])).toBe(sentence('2025-10-09', '2026-10-09') + CONSUMERS);
    expect(await attributionOf([comp('410 East 90th Street', 'n/a')])).toBe(sentence('2025-10-09', '2026-10-09') + CONSUMERS);
  });

  it('no curated comps: the sales are asked of Cotality for the year before today, and that is the period (not the day of the one sale it found)', async () => {
    const attribution = await attributionOf(undefined);
    expect((global as any).fetch).toHaveBeenCalled();
    expect(attribution).toBe(sentence('2025-10-09', '2026-10-09') + CONSUMERS);
  });
});

// ── GET /api/crm/sales/prospects/[id]/pdf ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('GET pdf (the printable packet)', () => {
  const htmlOf = async () => {
    db.sellerLead.findFirst = jest.fn(async () => prospect(undefined));
    const route = await import('@/app/api/crm/sales/prospects/[id]/pdf/route');
    const res = await route.GET(makeRequest({ method: 'GET' }), params);
    expect(res.status).toBe(200);
    return res.text();
  };

  it('prints the disclaimer in its legal block, for the year the sales were asked for, through today', async () => {
    const html = await htmlOf();
    expect(html).toContain(`<div class="legal">\n  <p>${sentence('2025-10-09', '2026-10-09')} This information is provided for consumers' personal, non-commercial use.</p>`);
    expect(html).not.toMatch(OLD_WORDING);
  });
});

describe('renderPitchPacketHTML', () => {
  const minimal = (attribution: string) => renderPitchPacketHTML({
    address: '400 East 90th Street', recentSales: [], activeCompetition: [], buyerCount: 10, agentNetwork: 17000, firms: 570, agentName: 'Maya Allan', generatedAt: TODAY.toISOString(), attribution,
  });

  it('puts the attribution it is given first in the legal block, escaped', () => {
    const html = minimal('A & B <i>');
    expect(html).toContain('<div class="legal">\n  <p>A &amp; B &lt;i&gt;</p>\n  <p style="margin-top:8px">This proposal is intended');
  });
});

// ── POST /api/crm/sales/prospects/[id]/send-packet ────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('POST send-packet (the packet email)', () => {
  const sent = async (comps: unknown[]) => {
    db.sellerLead.findFirst = jest.fn(async () => prospect(comps));
    const route = await import('@/app/api/crm/sales/prospects/[id]/send-packet/route');
    const res = await route.POST(makeRequest({ method: 'POST', body: {} }), params);
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    return String(sendEmailMock.mock.calls[0][2]);
  };

  it('says the disclaimer for the year before today through today, in the comparable-sales line and in the footer', async () => {
    const html = await sent([comp('410 East 90th Street', '2026-03-12')]);
    expect(html).toContain(sentence('2025-10-09', '2026-10-09'));
    expect(html).toMatch(/This information is provided for consumers(?:'|&#39;|&#x27;|&apos;) personal, non-commercial use\./);          // what the footer always said after it
    expect(html).not.toMatch(OLD_WORDING);
  });

  it('a curated comparable sale older than the year moves the start back', async () => {
    const html = await sent([comp('410 East 90th Street', '2026-03-12'), comp('300 East 90th Street', '2024-03-02')]);
    expect(html).toContain(sentence('2024-03-02', '2026-10-09'));
    expect(html).not.toContain('for the period October 9, 2025');
  });
});

// ── POST /api/crm/sales/prospects/[id]/hook-email ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('POST hook-email', () => {
  const sent = async (comps: unknown[]) => {
    db.sellerLead.findFirst = jest.fn(async () => prospect(comps));
    const route = await import('@/app/api/crm/sales/prospects/[id]/hook-email/route');
    const res = await route.POST(makeRequest({ method: 'POST', body: {} }), params);
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    return String(sendEmailMock.mock.calls[0][2]);
  };

  it('the footer says the UCBA sentence pair for the year before today through today, and then what it always said about consumers\' use', async () => {
    const html = await sent([comp('410 East 90th Street', '2026-03-12'), comp('420 East 90th Street', '2025-12-01'), comp('430 East 90th Street', '2026-01-20')]);
    expect(html).toContain(`${sentence('2025-10-09', '2026-10-09')} This information is provided for consumers&rsquo; personal, non-commercial use and may not be used for any purpose other than`);
    expect(html).not.toMatch(OLD_WORDING);
  });

  it('a comparable sale older than the year moves the start back, even when it is not one of the three shown', async () => {
    const html = await sent([comp('410 East 90th Street', '2026-03-12'), comp('420 East 90th Street', '2025-12-01'), comp('430 East 90th Street', '2026-01-20'), comp('300 East 90th Street', '2023-06-30')]);
    expect(html).toContain(sentence('2023-06-30', '2026-10-09'));
  });
});
