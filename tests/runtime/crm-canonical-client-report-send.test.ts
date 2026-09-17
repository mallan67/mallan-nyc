/// <reference types="jest" />
/**
 * LANE 3 PACKET 1 — A CLIENT REPORT BECOMES DURABLE BROKERAGE HISTORY, AND NURTURE STOPS SENDING ITSELF.
 *
 * TWO DEFECTS, ONE PACKET, because the second cannot be corrected without the first.
 *
 * 1. AGENT-SENT CLIENT REPORTS LEFT NO SERVER RECORD AT ALL.
 *    reports.js sendEmailDirect -> email-service.js:47 sendViaEmailJS -> emailjs.send(...) went from the
 *    BROWSER straight to EmailJS. The message never touched Mallan infrastructure, and its "audit" was
 *    logAuditEntry writing localStorage (compliance-gates-and-output.js:182) - per-browser, per-agent,
 *    lost on a cache clear. A git grep for report_send_to_client / report_email across app/ and lib/
 *    returns nothing. So the brokerage could not answer "what did this agent send this client, and when?"
 *    That is a history defect in its own right, quite apart from nurture.
 *
 *    It also meant the send bypassed lib/email/sendgrid.ts, and therefore bypassed the canonical
 *    suppression check - an agent could email a client who had unsubscribed. The report's only
 *    unsubscribe handling was footer prose asking the client to reply "Unsubscribe".
 *
 * 2. NURTURE SENT ITSELF, WITH NO AGENT IN THE LOOP.
 *    vercel.json:29 -> /api/cron/lifecycle-triggers -> auto-seeds the trigger when the table is empty ->
 *    findQuarterlyNurtureTargets picks up to 50 leads -> a HARDCODED subject (engine.ts:654) and a
 *    HARDCODED body (templates.ts:823-827) go out. The seeded include_matching_listings /
 *    include_market_stats are never read, and no Notification is created, so the responsible agent is
 *    never told. The owner's rule is the inverse: the system finds that attention is DUE, the agent
 *    chooses what is worth sending.
 *
 * WHY THE GUARD IS IN THE ENGINE AND NOT ONLY IN THE SEED. DEFAULT_TRIGGERS is applied only when
 * lifecycleTrigger.count() === 0, so editing the seed corrects a fresh database and leaves every existing
 * one sending exactly as before. The refusal therefore lives at the action dispatch, where a stored
 * action_type of 'email' cannot override it.
 *
 * WHAT "SUCCESS" MEANS HERE, deliberately narrow. lib/email/sendgrid.ts is nodemailer against
 * smtp.office365.com; a resolved send means the SMTP service ACCEPTED the message. There is no
 * delivery/bounce webhook in this repository, so nothing here may claim the client received it. The record
 * says delivery_status: 'accepted', and the owner's ruling is explicit that we do not fake that certainty.
 *
 * QUALIFICATION IS SERVER-COMPUTED. The browser may REQUEST purpose 'nurture'; it may never assert
 * qualifies_nurture. The server grants it only for an authenticated responsible agent, an authorised
 * canonical client, a substantive client-facing report, the governed C4C population, a communication that
 * is not suppressed, and an accepted send. A password email, a listing alert or a one-line message must
 * not reset a six-month relationship clock.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEAD = {
  id: 7n, email: 'jane@example.com', first_name: 'Jane', last_name: 'Buyer',
  status: 'active', pipeline_stage: 'nurturing', agent_id: 'agent-1', roles: ['buyer'],
};

let leadRow: Record<string, unknown> | null = { ...LEAD };
let authPrincipal: Record<string, unknown> = { userId: 'agent-1', userType: 'agent', role: 'BROKER' };
let sendResult: Record<string, unknown> = { success: true, messageId: 'MSG-1' };

const leadFindUnique = jest.fn(async () => leadRow);
const activityLogCreate = jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 1n, ...a.data }));
const auditFindFirst = jest.fn(async () => null);
const auditCreate = jest.fn(async () => ({ id: 2n }));
const agentFindUnique = jest.fn(async () => ({ id: 'agent-1', full_name: 'Maya Allan', email: 'maya@mallan.nyc' }));
let listingRows: Record<string, unknown>[] = [
  { listing_id: 'L1', idx_display_yn: true, internet_entire_listing_display_yn: true, owner_opt_out: false, participant_only: false },
];
const listingFindMany = jest.fn(async () => listingRows);

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findUnique: leadFindUnique },
  activityLog: { create: activityLogCreate },
  auditEvent: { findFirst: auditFindFirst, create: auditCreate },
  agent: { findUnique: agentFindUnique },
  listing: { findMany: listingFindMany },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));

const sendEmailMock = jest.fn(async () => sendResult);
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => authPrincipal),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));

function reset(lead: Record<string, unknown> | null, principal?: Record<string, unknown>, send?: Record<string, unknown>) {
  leadRow = lead;
  authPrincipal = principal ?? { userId: 'agent-1', userType: 'agent', role: 'BROKER' };
  sendResult = send ?? { success: true, messageId: 'MSG-1' };
  activityLogCreate.mockClear(); auditCreate.mockClear(); sendEmailMock.mockClear();
  listingRows = [{ listing_id: 'L1', idx_display_yn: true, internet_entire_listing_display_yn: true, owner_opt_out: false, participant_only: false }];
  auditFindFirst.mockReset(); auditFindFirst.mockResolvedValue(null as never);
}

async function post(body: Record<string, unknown>, id = '7', headers?: Record<string, string>) {
  jest.resetModules();
  const { POST } = await import('@/app/api/crm/clients/[id]/report-send/route');
  const res = await POST(
    makeRequest({ method: 'POST', url: `http://localhost/api/crm/clients/${id}/report-send`, body, headers }) as never,
    { params: Promise.resolve({ id }) } as never,
  );
  return { res, json: await readJson<any>(res) };
}

/**
 * THE REAL VOCABULARY, CENSUSED FROM THE UI THAT EMITS IT.
 *
 * This fixture originally read report_type 'market_update', report_version '1' and audience
 * 'customer'. None of those values can be produced by the product. report_type is
 * reportState.format, whose complete set is the nine format tiles in html/modals/reports.html;
 * report_version is 'agent' or 'customer'; and the audience vocabulary is 'public' or 'member' —
 * 'customer' belongs to the VERSION vocabulary, not the audience one. The fixture passed anyway
 * because nothing on the server validated any of the three, which is precisely the gap Lane 3
 * Packet 2 closes now that qualifies_nurture decides a six-month clock.
 */
const REPORT = {
  purpose: 'nurture',
  report_type: 'cma',
  report_version: 'customer',
  audience: 'public',
  subject: 'Your Q3 Market Update',
  html: '<html><body>Report body</body></html>',
  listing_ids: ['L1'],
};

/** The ActivityLog row this call wrote, if any. */
const logged = () => (activityLogCreate.mock.calls[0]?.[0] as { data?: any })?.data;

// ═════════════════════════════════════════════════════════════════════════════
// A — the canonical send, and the history it must leave
// ═════════════════════════════════════════════════════════════════════════════
describe('A · a successful agent report becomes durable brokerage history', () => {
  it('sends through the governed email service, not the browser', async () => {
    reset({ ...LEAD });
    const { res } = await post(REPORT);
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('writes exactly ONE ActivityLog bound to the canonical Lead and the responsible Agent', async () => {
    reset({ ...LEAD });
    await post(REPORT);
    expect(activityLogCreate).toHaveBeenCalledTimes(1);
    const d = logged();
    expect({ type: d.activity_type, lead: String(d.lead_id), actorType: d.actor_type })
      .toEqual({ type: 'client_report_sent', lead: '7', actorType: 'agent' });
  });

  it('records provenance — and says ACCEPTED, never delivered', async () => {
    reset({ ...LEAD });
    await post(REPORT);
    const m = logged().metadata;
    expect({
      purpose: m.purpose, qualifies: m.qualifies_nurture, type: m.report_type,
      channel: m.delivery_channel, status: m.delivery_status, msg: m.message_id,
    }).toEqual({
      purpose: 'nurture', qualifies: true, type: 'cma',
      channel: 'email', status: 'accepted', msg: 'MSG-1',
    });
    // There is no bounce/delivery webhook in this repo; nothing may claim the client received it.
    expect(JSON.stringify(logged().metadata)).not.toMatch(/delivered/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — qualification is the server's decision, never the browser's
// ═════════════════════════════════════════════════════════════════════════════
describe('B · the browser may request a purpose; it may not assert qualification', () => {
  it('a browser-supplied qualifies_nurture:true is IGNORED, not trusted', async () => {
    reset({ ...LEAD });
    // The hostile case: a caller asserts the business outcome directly.
    await post({ ...REPORT, purpose: 'other', qualifies_nurture: true });
    expect(logged().metadata.qualifies_nurture).toBe(false);
  });

  it('a non-nurture purpose does not advance the clock even on a successful send', async () => {
    reset({ ...LEAD });
    const { res } = await post({ ...REPORT, purpose: 'listing_share' });
    expect(res.status).toBe(200);
    expect(logged().metadata.qualifies_nurture).toBe(false);
  });

  it('a SUPPRESSED recipient blocks the send and writes no qualifying history', async () => {
    reset({ ...LEAD }, undefined, { success: false, _suppressed: true, error: 'Recipient has unsubscribed' });
    const { res } = await post(REPORT);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const d = logged();
    if (d) expect(d.metadata.qualifies_nurture).toBe(false);
  });

  it('an SMTP failure writes no qualifying history', async () => {
    reset({ ...LEAD }, undefined, { success: false, error: 'smtp refused' });
    const { res } = await post(REPORT);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const d = logged();
    if (d) expect(d.metadata.qualifies_nurture).toBe(false);
  });

  it('a fail-closed suppression LOOKUP error also blocks — availability is not consent', async () => {
    reset({ ...LEAD }, undefined, { success: false, _suppressionError: true, error: 'Suppression check unavailable' });
    const { res } = await post(REPORT);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — authorization and lifecycle boundaries hold
// ═════════════════════════════════════════════════════════════════════════════
describe('C · ownership, lifecycle and input handling', () => {
  it('an unassigned agent is refused, and nothing is sent', async () => {
    reset({ ...LEAD, agent_id: 'agent-2' }, { userId: 'agent-3', userType: 'agent', role: 'AGENT' });
    const { res } = await post(REPORT);
    expect(res.status).toBe(403);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('a BROKER may send for any client', async () => {
    reset({ ...LEAD, agent_id: 'agent-9' }, { userId: 'agent-1', userType: 'agent', role: 'BROKER' });
    expect((await post(REPORT)).res.status).toBe(200);
  });

  it('an INACTIVE client cannot receive a report — Safety Packet 1 is not weakened', async () => {
    reset({ ...LEAD, status: 'inactive' });
    const { res } = await post(REPORT);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(activityLogCreate).not.toHaveBeenCalled();
  });

  it('a listing id that does not resolve REFUSES the send — no silent drop', async () => {
    // Checking only the rows that came back would let an unverifiable listing ride along in a client
    // report without ever passing the eligibility gate. At a compliance boundary, not-found is not fine.
    reset({ ...LEAD });
    listingRows = [];
    const { res, json } = await post(REPORT);
    expect(res.status).toBe(400);
    expect(json.missing).toEqual(['L1']);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('a malformed client id fails closed', async () => {
    reset(null);
    const { res } = await post(REPORT, 'not-a-number');
    expect(res.status).toBe(404);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — one click, one email, one history record
// ═════════════════════════════════════════════════════════════════════════════
describe('D · a retry cannot produce two business effects', () => {
  it('a repeated idempotency-key does not send twice or log twice', async () => {
    reset({ ...LEAD });
    const headers = { 'idempotency-key': 'KEY-1' };
    const first = await post(REPORT, '7', headers);
    expect(first.res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // The browser retries after a timeout: the same key must replay, not re-send.
    auditFindFirst.mockResolvedValue({ id: 99n, created_at: new Date() } as never);
    sendEmailMock.mockClear(); activityLogCreate.mockClear();
    const second = await post(REPORT, '7', headers);
    expect(second.res.status).toBe(200);
    expect(second.json.deduplicated).toBe(true);
    expect({ sends: sendEmailMock.mock.calls.length, logs: activityLogCreate.mock.calls.length })
      .toEqual({ sends: 0, logs: 0 });
  });

  it('without a key the route still works — idempotency is opt-in, mirroring listing-sends', async () => {
    reset({ ...LEAD });
    expect((await post(REPORT)).res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — nurture no longer sends itself
// ═════════════════════════════════════════════════════════════════════════════
describe('E · quarterly_nurture cannot email a client automatically', () => {
  it('the engine refuses a client-facing email for the nurture trigger', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/lifecycle/engine.ts'), 'utf8');
    // The refusal must be at the action dispatch, because DEFAULT_TRIGGERS only seeds an EMPTY table -
    // an existing database still holds action_type 'email' and would otherwise keep sending.
    expect(src).toMatch(/quarterly_nurture/);
    expect(src).toMatch(/NURTURE_IS_AGENT_DIRECTED|nurture_requires_agent/);
  });

  it('the seed no longer configures a client email for it', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/lifecycle/engine.ts'), 'utf8');
    const seed = src.slice(src.indexOf("name: 'Quarterly Nurture Report'"), src.indexOf("name: 'Quarterly Nurture Report'") + 400);
    expect(seed).not.toMatch(/action_type:\s*'email'/);
  });

  it('target detection is KEPT — the system still finds who is due', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../lib/lifecycle/engine.ts'), 'utf8');
    expect(src).toContain('findQuarterlyNurtureTargets');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// F — the browser no longer sends client reports itself
// ═════════════════════════════════════════════════════════════════════════════
describe('F · the EmailJS client-report path is gone', () => {
  const read = (rel: string) =>
    require('fs').readFileSync(require('path').resolve(__dirname, '../..', rel), 'utf8');

  it('reports.js no longer calls sendViaEmailJS', () => {
    const src = read('public/crm/js/output/reports.js')
      .split(/\r?\n/).filter((l: string) => !l.trim().startsWith('//')).join('\n');
    expect(src).not.toContain('sendViaEmailJS');
  });

  it('the report send targets the canonical server route', () => {
    expect(read('public/crm/js/output/reports.js')).toContain('/report-send');
  });

  it('the shipped artifact carries the change', () => {
    expect(read('public/crm/index-built.html')).toContain('/report-send');
  });
});
