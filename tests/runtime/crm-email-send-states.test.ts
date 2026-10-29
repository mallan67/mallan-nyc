/// <reference types="jest" />
/**
 * /api/crm/email — the one client-send pathway, its kinds and its actual result states
 * (Maya, 2026-10-28: "Logged, drafted, blocked, failed and delivered-to-provider are different states.
 * Never display 'sent' merely because an audit entry was created." Master §3.2.)
 *
 *   correspondence (email | reply)  no consent gate; unsubscribe suppression honoured and reported
 *   bulk (eblast | campaign | >10)   consent on record required; blocked otherwise
 *   sms                              its own consent; logged only when no provider; never "sent"
 */

import { makeRequest } from './helpers';

const auditEventCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 1n }));
const leadFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const agentFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc' }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    auditEvent: { create: auditEventCreateMock },
    lead: { findMany: leadFindManyMock },
    agent: { findUnique: agentFindUniqueMock },
  },
}));
const AUTH = { userId: 1n, userType: 'agent', role: 'BROKER', email: 'maya@mallan.nyc' };
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => AUTH),
  isAuthError: (v: unknown) => v instanceof Response,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/crm/access', () => ({ __esModule: true, assertLeadIdsAccess: jest.fn(async () => ({})) }));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));

type SendEmailResult = { success: boolean; messageId?: string; error?: string; _devMode?: boolean; _suppressed?: boolean };
const sendEmailMock = jest.fn<Promise<SendEmailResult>, unknown[]>(async () => ({ success: true, messageId: 'smtp-1' }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));

const DIEGO = { id: 56n, first_name: 'Diego', last_name: 'Gomez', email: 'dagjd@example.com', phone: '2125550100', consent_captured_at: null };
const CONSENTED = { id: 60n, first_name: 'Cara', last_name: 'Consent', email: 'cara@example.com', phone: '2125550101', consent_captured_at: new Date('2026-01-01') };

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/crm/email/route');
  const res = await POST(makeRequest({ url: 'http://localhost/api/crm/email', body }));
  return { status: res.status, body: JSON.parse(await res.text()) };
}
const audits = () => auditEventCreateMock.mock.calls.map((c) => (c[0] as { data: { action: string; entity_id: string; changes: Record<string, unknown> } }).data);

beforeEach(() => {
  jest.clearAllMocks();
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'smtp-1' });
  delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_PHONE_NUMBER;
});

describe('/api/crm/email — kinds and actual states', () => {
  it('individual correspondence to an existing client without a consent timestamp is delivered (no consent gate), audited email:sent with the provider message id', async () => {
    leadFindManyMock.mockResolvedValue([DIEGO]);
    const r = await post({ type: 'email', client_ids: ['56'], subject: 'Your renewal', body: 'Hi Diego' });
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe('correspondence');
    expect(r.body.delivered).toBe(1);
    expect(r.body.results[0]).toEqual(expect.objectContaining({ clientId: '56', state: 'delivered_to_provider', channel: 'email', message_id: 'smtp-1', success: true }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect((sendEmailMock.mock.calls[0][4] as { channel: string }).channel).toBe('agent');
    const a = audits().find((x) => x.action === 'email:sent');
    expect(a).toBeDefined();
    expect(a!.changes.delivered_to_provider).toBe(true);
    expect(a!.changes.message_id).toBe('smtp-1');
    expect(r.body.sent).toBe(1); // compat field = delivered, never logged
  });

  it('an unsubscribed client is suppressed by the pipeline and reported as suppressed_unsubscribed, never sent', async () => {
    leadFindManyMock.mockResolvedValue([DIEGO]);
    sendEmailMock.mockResolvedValue({ success: false, _suppressed: true, error: 'Recipient has unsubscribed' });
    const r = await post({ type: 'email', client_ids: ['56'], subject: 's', body: 'b' });
    expect(r.body.delivered).toBe(0);
    expect(r.body.suppressed).toBe(1);
    expect(r.body.results[0].state).toBe('suppressed_unsubscribed');
    expect(audits().map((x) => x.action)).toContain('email:suppressed');
    expect(audits().map((x) => x.action)).not.toContain('email:sent');
  });

  it('a provider failure is failed, with the reason, not sent', async () => {
    leadFindManyMock.mockResolvedValue([DIEGO]);
    sendEmailMock.mockResolvedValue({ success: false, _devMode: true, error: 'SMTP not configured' });
    const r = await post({ type: 'email', client_ids: ['56'], subject: 's', body: 'b' });
    expect(r.body.failed).toBe(1);
    expect(r.body.results[0]).toEqual(expect.objectContaining({ state: 'failed', error: 'Mail provider not configured' }));
    expect(r.body.errors).toHaveLength(1);
    expect(audits().map((x) => x.action)).toContain('email:failed');
  });

  it('bulk (eblast) requires consent on record: blocked for the unconsented client, delivered for the consented one, listings@ channel', async () => {
    leadFindManyMock.mockResolvedValue([DIEGO, CONSENTED]);
    const r = await post({ type: 'eblast', client_ids: ['56', '60'], subject: 'News', body: 'Listings' });
    expect(r.body.kind).toBe('bulk');
    expect(r.body.blocked).toBe(1);
    expect(r.body.delivered).toBe(1);
    const diego = r.body.results.find((x: { clientId: string }) => x.clientId === '56');
    expect(diego.state).toBe('blocked_no_consent');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toBe('cara@example.com');
    expect((sendEmailMock.mock.calls[0][4] as { channel: string }).channel).toBe('listings');
    expect(audits().map((x) => x.action)).toContain('email:blocked');
    expect(r.body.skipped).toEqual([{ clientId: '56', name: 'Diego Gomez', reason: expect.stringMatching(/consent/) }]);
  });

  it('more than 10 recipients is bulk even when typed "email"; more than 200 is refused', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...CONSENTED, id: BigInt(100 + i), email: `c${i}@example.com` }));
    leadFindManyMock.mockResolvedValue(many);
    const r = await post({ type: 'email', client_ids: many.map((m) => String(m.id)), subject: 's', body: 'b' });
    expect(r.body.kind).toBe('bulk');
    const tooMany = await post({ type: 'email', client_ids: Array.from({ length: 201 }, (_, i) => String(i + 1)), subject: 's', body: 'b' });
    expect(tooMany.status).toBe(400);
  });

  it('SMS without a provider is logged only (never "sent"); SMS needs its own consent; a consented SMS with Twilio configured goes to the provider', async () => {
    leadFindManyMock.mockResolvedValue([CONSENTED]);
    const logged = await post({ type: 'sms', client_ids: ['60'], body: 'Hello' });
    expect(logged.body.kind).toBe('sms');
    expect(logged.body.logged).toBe(1);
    expect(logged.body.delivered).toBe(0);
    expect(logged.body.sent).toBe(0);
    expect(logged.body.results[0]).toEqual(expect.objectContaining({ state: 'logged_only', channel: 'sms', success: false }));
    expect(audits().find((x) => x.action === 'sms:logged')!.changes.delivered).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();

    jest.clearAllMocks();
    leadFindManyMock.mockResolvedValue([DIEGO]);
    const blocked = await post({ type: 'sms', client_ids: ['56'], body: 'Hello' });
    expect(blocked.body.results[0].state).toBe('blocked_no_consent');
    expect(audits().map((x) => x.action)).toContain('sms:blocked');

    jest.clearAllMocks();
    process.env.TWILIO_ACCOUNT_SID = 'AC'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_PHONE_NUMBER = '+12125550000';
    jest.doMock('twilio', () => () => ({ messages: { create: async () => ({ sid: 'SM123' }) } }), { virtual: true });
    leadFindManyMock.mockResolvedValue([CONSENTED]);
    const sent = await post({ type: 'sms', client_ids: ['60'], body: 'Hello' });
    expect(sent.body.results[0]).toEqual(expect.objectContaining({ state: 'delivered_to_provider', channel: 'sms', message_id: 'SM123' }));
    expect(audits().find((x) => x.action === 'sms:sent')!.changes.delivered).toBe(true);
  });

  it('a client without an address is blocked_no_address, not failed and not sent', async () => {
    leadFindManyMock.mockResolvedValue([{ ...DIEGO, email: null }]);
    const r = await post({ type: 'email', client_ids: ['56'], subject: 's', body: 'b' });
    expect(r.body.blocked).toBe(1);
    expect(r.body.results[0].state).toBe('blocked_no_address');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
