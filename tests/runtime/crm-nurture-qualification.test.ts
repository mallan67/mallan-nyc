/// <reference types="jest" />
/**
 * SUBSTANTIVE NURTURE QUALIFICATION — intent is necessary and not sufficient.
 *
 * Packet 1 computed `qualifies_nurture = requestedPurpose === 'nurture'` and stored it as metadata.
 * As metadata that was arguable debt. Packet 2 made the flag a SCHEDULING AUTHORITY — it is the
 * anchor lib/crm/nurture-due.ts reads to decide when a client's next report is due — so the same
 * line became load-bearing: an authenticated agent could post arbitrary HTML with purpose
 * 'nurture' and reset a six-month relationship clock, because nothing on the server looked at what
 * was actually sent.
 *
 * The report vocabulary here is CENSUSED, not invented. report_type is reportState.format in
 * public/crm/js/output/reports.js; its complete value set is the nine format tiles in
 * public/crm/html/modals/reports.html. The substantive subset excludes the ones that are listing
 * shares or logistics rather than relationship reports: grid and list are search-result layouts,
 * images is a photo gallery, and openHouse is event logistics — event-driven work being a separate
 * workflow from the nurture cadence by owner ruling.
 *
 * The audience check is a compliance boundary rather than tidiness. reports.js forces the public
 * audience for the duration of any client delivery whatever version the report was built as, so a
 * caller declaring 'member' is either broken or routing member-only content to a client.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEAD = {
  id: 7n, email: 'jane@example.com', first_name: 'Jane', last_name: 'Buyer',
  status: 'active', pipeline_stage: 'nurturing', agent_id: 'agent-1', roles: ['buyer'],
};

let leadRow: Record<string, unknown> | null = { ...LEAD };
let sendResult: Record<string, unknown> = { success: true, messageId: 'MSG-1' };

const leadFindUnique = jest.fn(async () => leadRow);
const activityLogCreate = jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 1n, ...a.data }));
const listingFindMany = jest.fn(async () => [
  { listing_id: 'L1', idx_display_yn: true, internet_entire_listing_display_yn: true, owner_opt_out: false, participant_only: false },
]);

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findUnique: leadFindUnique },
  activityLog: { create: activityLogCreate },
  auditEvent: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 2n })) },
  agent: { findUnique: jest.fn(async () => ({ id: 'agent-1', full_name: 'Maya Allan', email: 'maya@mallan.nyc' })) },
  listing: { findMany: listingFindMany },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
const sendEmailMock = jest.fn(async () => sendResult);
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));

async function post(body: Record<string, unknown>) {
  jest.resetModules();
  const { POST } = await import('@/app/api/crm/clients/[id]/report-send/route');
  const res = await POST(
    makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/7/report-send', body }) as never,
    { params: Promise.resolve({ id: '7' }) } as never,
  );
  return { res, json: await readJson<any>(res) };
}

/** A well-formed substantive nurture send. Individual tests vary one field at a time. */
const BASE = {
  purpose: 'nurture',
  report_type: 'cma',
  report_version: 'customer',
  audience: 'public',
  subject: 'Your market update',
  html: '<html><body>A real report</body></html>',
  listing_ids: ['L1'],
};

/** The qualification flag as it reaches durable history. */
function recordedQualification() {
  const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> } | undefined;
  return call?.data?.metadata?.qualifies_nurture;
}

beforeEach(() => {
  leadRow = { ...LEAD };
  sendResult = { success: true, messageId: 'MSG-1' };
  activityLogCreate.mockClear();
  sendEmailMock.mockClear();
});

// ═════════════════════════════════════════════════════════════════════════════
// A — the positive case
// ═════════════════════════════════════════════════════════════════════════════
describe('A · a substantive report with nurture intent qualifies', () => {
  it.each(['cma', 'comparison', 'detail', 'factSheet', 'summary'])(
    '%s qualifies',
    async (report_type) => {
      const { res, json } = await post({ ...BASE, report_type });
      expect(res.status).toBe(200);
      expect(json.qualifies_nurture).toBe(true);
      expect(recordedQualification()).toBe(true);
    },
  );

  it('the accepted send is still what carries it — a refused send cannot qualify', async () => {
    sendResult = { success: false, error: 'smtp down' };
    const { json } = await post(BASE);
    expect(json.qualifies_nurture).toBeUndefined();
    // The failure branch records history, never a qualifying one.
    const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
    expect(call.data.metadata.qualifies_nurture).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — arbitrary content cannot buy nurture credit
// ═════════════════════════════════════════════════════════════════════════════
describe('B · intent alone does not advance the clock', () => {
  it('arbitrary HTML with purpose=nurture and NO report type does not qualify', async () => {
    // This is the exact exposure: authenticated agent, real client, accepted send, arbitrary body.
    const { res, json } = await post({
      purpose: 'nurture',
      subject: 'hello',
      html: '<p>hi</p>',
      audience: 'public',
    });
    expect(res.status).toBe(200);
    expect(json.qualifies_nurture).toBe(false);
    expect(recordedQualification()).toBe(false);
  });

  it('an UNKNOWN report_type does not qualify, and is not stored verbatim', async () => {
    const { json } = await post({ ...BASE, report_type: 'market_update' });
    expect(json.qualifies_nurture).toBe(false);
    // Normalised to null rather than recorded: it is not a value this product can emit.
    expect(json.report_type).toBeNull();
    const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
    expect(call.data.metadata.report_type).toBeNull();
    expect(call.data.metadata.nurture_declined_reason).toBe('unrecognized_report_type');
  });

  it.each(['grid', 'list', 'images', 'openHouse'])(
    '%s is a real report type but not substantive, so it does not qualify',
    async (report_type) => {
      const { json } = await post({ ...BASE, report_type });
      expect(json.qualifies_nurture).toBe(false);
      // It IS recognised, so it is recorded — only the qualification is withheld.
      expect(json.report_type).toBe(report_type);
      const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
      expect(call.data.metadata.nurture_declined_reason).toBe('report_type_not_substantive');
    },
  );

  it('an ordinary send does not qualify even with a substantive report attached', async () => {
    const { json } = await post({ ...BASE, purpose: 'other' });
    expect(json.qualifies_nurture).toBe(false);
    expect(recordedQualification()).toBe(false);
  });

  it('a declined nurture request records WHY, so the agent can learn the rule', async () => {
    const { json } = await post({ ...BASE, report_type: 'grid' });
    expect(json.qualifies_nurture).toBe(false);
    const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
    expect(call.data.metadata.requested_report_type).toBe('grid');
  });

  it('an ordinary send records no decline reason — there was nothing to decline', async () => {
    await post({ ...BASE, purpose: 'other' });
    const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
    expect(call.data.metadata.nurture_declined_reason).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — the audience boundary
// ═════════════════════════════════════════════════════════════════════════════
describe('C · a client delivery is served under the public audience', () => {
  it('refuses a send that declares the member audience', async () => {
    const { res, json } = await post({ ...BASE, audience: 'member' });
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/public audience/i);
    // Refused before the send, not after it.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('refuses any other audience token too', async () => {
    // 'customer' is from the VERSION vocabulary, not the audience one. Packet 1's own fixture used
    // it here, and nothing caught that because the value was never validated.
    const { res } = await post({ ...BASE, audience: 'customer' });
    expect(res.status).toBe(400);
  });

  it('accepts an omitted audience — the browser is not required to declare one', async () => {
    const body = { ...BASE };
    delete (body as Record<string, unknown>).audience;
    const { res, json } = await post(body);
    expect(res.status).toBe(200);
    expect(json.qualifies_nurture).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — version is validated but does not gate qualification
// ═════════════════════════════════════════════════════════════════════════════
describe('D · report_version is normalised, not trusted', () => {
  it('an unknown version is stored as null', async () => {
    const { json } = await post({ ...BASE, report_version: '1' });
    expect(json.qualifies_nurture).toBe(true);
    const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
    expect(call.data.metadata.report_version).toBeNull();
  });

  it('the agent version still qualifies — the delivery audience is what is gated', async () => {
    // reports.js forces the public audience for a client delivery whatever version the report was
    // built as, so gating qualification on the version would refuse a legitimate flow.
    const { json } = await post({ ...BASE, report_version: 'agent' });
    expect(json.qualifies_nurture).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — QUALIFICATION RESPECTS CURRENT NURTURE MEMBERSHIP
// ═════════════════════════════════════════════════════════════════════════════
describe('E · only a client currently in Nurture can have their clock advanced', () => {
  it.each(['new', 'contacted', 'past', 'active_buyer', 'deal', 'closed'])(
    'a client in %s does not qualify, even on an identical substantive payload',
    async (pipeline_stage) => {
      // Without this, an agent could enrol any client in a six-month cadence by ticking one
      // box on one send. The canonical Nurture state is pipeline_stage 'nurturing'.
      leadRow = { ...LEAD, pipeline_stage };
      const { res, json } = await post(BASE);
      expect(res.status).toBe(200);
      expect(json.qualifies_nurture).toBe(false);
      const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
      expect(call.data.metadata.nurture_declined_reason).toBe('client_not_in_canonical_nurture');
    },
  );

  it('the send itself still succeeds — this withholds credit, it does not refuse the report', async () => {
    leadRow = { ...LEAD, pipeline_stage: 'active_buyer' };
    const { res } = await post(BASE);
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalled();
  });

  it('a client in nurturing with the same payload DOES qualify', async () => {
    leadRow = { ...LEAD, pipeline_stage: 'nurturing' };
    const { json } = await post(BASE);
    expect(json.qualifies_nurture).toBe(true);
  });

  it('membership is reported as the reason ahead of report class', async () => {
    // Both are wrong here; the more fundamental one is named, so the agent is told the
    // useful thing rather than sent to fix the report type first.
    leadRow = { ...LEAD, pipeline_stage: 'new' };
    await post({ ...BASE, report_type: 'grid' });
    const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> };
    expect(call.data.metadata.nurture_declined_reason).toBe('client_not_in_canonical_nurture');
  });
});
