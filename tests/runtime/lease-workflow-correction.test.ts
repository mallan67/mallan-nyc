/// <reference types="jest" />
/**
 * Lease workflow correction (2026-10-27) — grouped tests.
 *
 *   A. Serialization  — every ActiveLease reader/writer answers JSON-safe (BigInt ids, nested
 *                       landlord/tenant ids, post-insert / post-update responses).
 *   B. Idempotency    — both creation routes and the renewal route resolve the tenancy's natural
 *                       key (landlord + normalised unit + term) before inserting; a retry after a
 *                       failed response returns the existing row (200, deduplicated: true).
 *   C. Term history   — a date change on an open tenancy is refused (409 lease_term_locked) unless
 *                       declared a correction; a renewal is a new row and the prior row becomes
 *                       historical — never an overwrite.
 *   D. Outreach       — preview first, then an explicit confirmation bound to the preview; the
 *                       gates: unsupported type, missing recipient, unsubscribed, declined
 *                       buying/selling outreach, ended lease, historical lease; dry run.
 *   E. Lifecycle      — lease triggers read ActiveLease (not Lead.lease_end_date), never email a
 *                       client, and create Agent-review checkpoints (FollowUpTask + Notification).
 *   F. CRM wiring     — Lease Tracker menus use the route's real types; nothing sends outside the
 *                       confirmation; the clients PATCH accepts the declined flag; the API client
 *                       keeps a 403's reason.
 */

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { makeRequest } from './helpers';

// ─── Prisma mock ───────────────────────────────────────────────────────────
const activeLeaseFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const activeLeaseFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const activeLeaseFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const activeLeaseCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const activeLeaseUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const leadFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 10n }));
const leadFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 10n, first_name: 'Lena', last_name: 'Landlord' }));
const leadFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const agentFindUniqueMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ full_name: 'Maya Allan', email: 'maya@mallan.nyc', phone: '(646) 258-4460' }));
const listingFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const auditEventCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 1n }));
const followUpTaskFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const followUpTaskCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 900n }));
const notificationCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const lifecycleTriggerFindManyMock = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
const lifecycleTriggerUpdateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));
const triggerExecutionFindFirstMock = jest.fn<Promise<unknown>, unknown[]>(async () => null);
const triggerExecutionCreateMock = jest.fn<Promise<unknown>, unknown[]>(async () => ({}));

const executeRawMock = jest.fn<Promise<number>, unknown[]>(async () => 0);
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    activeLease: {
      findMany: activeLeaseFindManyMock,
      findFirst: activeLeaseFindFirstMock,
      findUnique: activeLeaseFindUniqueMock,
      create: activeLeaseCreateMock,
      update: activeLeaseUpdateMock,
    },
    lead: { findFirst: leadFindFirstMock, findUnique: leadFindUniqueMock, findMany: leadFindManyMock },
    agent: { findUnique: agentFindUniqueMock },
    listing: { findMany: listingFindManyMock },
    auditEvent: { create: auditEventCreateMock },
    followUpTask: { findFirst: followUpTaskFindFirstMock, create: followUpTaskCreateMock },
    notification: { create: notificationCreateMock },
    lifecycleTrigger: { findMany: lifecycleTriggerFindManyMock, update: lifecycleTriggerUpdateMock },
    triggerExecution: { findFirst: triggerExecutionFindFirstMock, create: triggerExecutionCreateMock },
    // the array form (a batch) and the function form (an interactive transaction: the renewal's lock + check + insert)
    $transaction: async (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => Array.isArray(arg) ? Promise.all(arg) : arg(prismaTxMock()),
  },
}));
function prismaTxMock() {
  return {
    activeLease: { findMany: activeLeaseFindManyMock, findFirst: activeLeaseFindFirstMock, findUnique: activeLeaseFindUniqueMock, create: activeLeaseCreateMock, update: activeLeaseUpdateMock },
    $executeRaw: executeRawMock,
  };
}

// ─── Auth / guards / email mocks ───────────────────────────────────────────
const AUTH = { userId: 1n, role: 'BROKER', email: 'maya@mallan.nyc' };
const requireAgentOrBrokerMock = jest.fn<Promise<unknown>, unknown[]>(async () => AUTH);
const logAuditEventMock = jest.fn<Promise<void>, unknown[]>(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: requireAgentOrBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: logAuditEventMock,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/crm/access', () => ({ __esModule: true, assertLeadAccess: jest.fn(async () => null) }));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));
jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: jest.fn(async () => 'test-token') }));

type SendEmailResult = { success: boolean; messageId?: string; error?: string; _dryRun?: boolean; _suppressed?: boolean };
const sendEmailMock = jest.fn<Promise<SendEmailResult>, unknown[]>(async () => ({ success: true, messageId: 'm-1' }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: sendEmailMock }));

// ─── Fixtures ──────────────────────────────────────────────────────────────
const DAY = 86_400_000;
const PARTY = { id: 10n, first_name: 'Lena', last_name: 'Landlord', email: 'lena@example.com', phone: null, last_unsubscribe_at: null, nurture_paused: false };
const TENANT = { id: 20n, first_name: 'Tom', last_name: 'Tenant', email: 'tom@example.com', phone: null, last_unsubscribe_at: null, nurture_paused: false };

function leaseRow(over: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 5n,
    status: 'active',
    address: '425 Park Avenue South',
    unit: '4D',
    borough: 'Manhattan',
    neighborhood: null,
    zip: null,
    building_type: null,
    landlord_lead_id: 10n,
    tenant_lead_id: 20n,
    tenant_name: null,
    tenant_email: null,
    tenant_phone: null,
    monthly_rent: 4200,
    lease_start_date: new Date(now - 300 * DAY),
    lease_end_date: new Date(now + 65 * DAY),
    lease_type: 'standard_1yr',
    security_deposit: null,
    pets_allowed: false,
    furnished: 'unfurnished',
    renewal_status: 'unknown',
    original_rent: 4200,
    last_rent_increase_date: null,
    last_rent_increase_pct: null,
    board_required: false,
    agent_id: 1n,
    notes: null,
    custom_fields: null,
    outreach_90d_sent_at: null,
    outreach_60d_sent_at: null,
    outreach_30d_sent_at: null,
    seller_comps_6mo_sent_at: null,
    landlord: { ...PARTY },
    tenant: { ...TENANT },
    ...over,
  };
}

function params(id = '5') { return { params: Promise.resolve({ id }) }; }
async function json(res: Response) { return JSON.parse(await res.text()); }

beforeEach(() => {
  jest.clearAllMocks();
  activeLeaseFindManyMock.mockResolvedValue([]);
  activeLeaseFindFirstMock.mockResolvedValue(null);
  activeLeaseFindUniqueMock.mockResolvedValue(null);
  activeLeaseCreateMock.mockImplementation(async (args: unknown) => ({ ...leaseRow(), ...((args as { data: object }).data), id: 77n }));
  activeLeaseUpdateMock.mockImplementation(async (args: unknown) => ({ ...leaseRow(), ...((args as { data: object }).data) }));
  leadFindFirstMock.mockResolvedValue({ id: 10n });
  leadFindUniqueMock.mockResolvedValue({ id: 10n, first_name: 'Lena', last_name: 'Landlord', agent_id: 1n });
  followUpTaskFindFirstMock.mockResolvedValue(null);
  followUpTaskCreateMock.mockResolvedValue({ id: 900n });
  triggerExecutionFindFirstMock.mockResolvedValue(null);
  sendEmailMock.mockResolvedValue({ success: true, messageId: 'm-1' });
  requireAgentOrBrokerMock.mockResolvedValue(AUTH);
});

// ═══════════════════════════════════════════════════════════════════════
// A. Serialization
// ═══════════════════════════════════════════════════════════════════════
describe('A. ActiveLease serialization — every reader and writer answers JSON-safe', () => {
  it('serializeLease converts BigInt ids (own and nested) and adds days_to_expiry / urgency / ended_but_open', async () => {
    const { serializeLease } = await import('@/lib/crm/leases');
    const out = serializeLease(leaseRow());
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(out.id).toBe('5');
    expect(out.landlord_lead_id).toBe('10');
    expect((out as unknown as { landlord: { id: string } }).landlord.id).toBe('10');
    expect((out as unknown as { tenant: { id: string } }).tenant.id).toBe('20');
    expect(out.days_to_expiry).toBe(65);
    expect(out.urgency).toBe('medium');
    expect(out.ended_but_open).toBe(false);
    const ended = serializeLease(leaseRow({ lease_end_date: new Date(Date.now() - 10 * DAY) }));
    expect(ended.urgency).toBe('expired');
    expect(ended.ended_but_open).toBe(true);
  });

  it('GET /api/crm/active-leases answers 200 with nested landlord.id / tenant.id as strings', async () => {
    activeLeaseFindManyMock.mockResolvedValue([leaseRow()]);
    const { GET } = await import('@/app/api/crm/active-leases/route');
    const res = await GET(new NextRequest('http://localhost/api/crm/active-leases?expiring_days=90'));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.total).toBe(1);
    expect(body.leases[0].landlord.id).toBe('10');
    expect(body.leases[0].tenant.id).toBe('20');
    expect(body.leases[0].days_to_expiry).toBe(65);
  });

  it('POST /api/crm/active-leases answers 201 after the insert (landlord_lead_id / agent_id are BigInt on the row)', async () => {
    const { POST } = await import('@/app/api/crm/active-leases/route');
    const res = await POST(makeRequest({
      url: 'http://localhost/api/crm/active-leases',
      body: { landlord_lead_id: '10', address: '425 Park Avenue South', unit: '4D', monthly_rent: 4200, lease_start_date: '2026-11-01', lease_end_date: '2027-10-31' },
    }));
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.deduplicated).toBe(false);
    expect(body.lease.id).toBe('77');
    expect(body.lease.landlord_lead_id).toBe('10');
    expect(activeLeaseCreateMock).toHaveBeenCalledTimes(1);
  });

  it('GET and PATCH /api/crm/active-leases/[id] answer 200 (nested ids, post-update response)', async () => {
    activeLeaseFindFirstMock.mockResolvedValue(leaseRow({ agent: { id: 1n, first_name: 'Maya', last_name: 'Allan' } }));
    const { GET, PATCH } = await import('@/app/api/crm/active-leases/[id]/route');
    const g = await GET(makeRequest({ method: 'GET', url: 'http://localhost/api/crm/active-leases/5' }), params());
    expect(g.status).toBe(200);
    const gb = await json(g);
    expect(gb.lease.landlord.id).toBe('10');
    expect(gb.lease.agent.id).toBe('1');
    const p = await PATCH(makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/active-leases/5', body: { notes: 'keys handed over' } }), params());
    expect(p.status).toBe(200);
    const pb = await json(p);
    expect(pb.lease.id).toBe('5');
    expect(pb.corrected).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// B. Idempotency
// ═══════════════════════════════════════════════════════════════════════
describe('B. Idempotency — the same landlord, unit and term is one tenancy', () => {
  it('findExistingTenancy matches on normalised address and unit ("#4d", spacing, case) within the day bounds of both dates', async () => {
    const { findExistingTenancy, normalizeUnit, normalizeAddress } = await import('@/lib/crm/leases');
    expect(normalizeUnit('#4D')).toBe('4d');
    expect(normalizeUnit('  ')).toBeNull();
    expect(normalizeAddress('425  Park Avenue South ')).toBe('425 park avenue south');
    activeLeaseFindManyMock.mockResolvedValue([
      { id: 5n, status: 'active', address: '425 Park Avenue South', unit: '4D' },
      { id: 6n, status: 'active', address: '425 Park Avenue South', unit: '5A' },
    ]);
    const hit = await findExistingTenancy({ landlord_lead_id: 10n, address: ' 425 park  avenue south', unit: '#4d', lease_start_date: new Date('2026-11-01'), lease_end_date: new Date('2027-10-31') });
    expect(hit).toEqual({ id: 5n, status: 'active' });
    const where = (activeLeaseFindManyMock.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.landlord_lead_id).toBe(10n);
    expect(where.lease_start_date).toEqual({ gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-11-02T00:00:00Z') });
    const miss = await findExistingTenancy({ landlord_lead_id: 10n, address: '425 Park Avenue South', unit: '7B', lease_start_date: new Date('2026-11-01'), lease_end_date: new Date('2027-10-31') });
    expect(miss).toBeNull();
  });

  it('POST /api/crm/active-leases: a retry of the same tenancy returns 200 deduplicated:true and inserts nothing', async () => {
    const body = { landlord_lead_id: '10', address: '425 Park Avenue South', unit: '#4d', monthly_rent: 4200, lease_start_date: '2026-11-01', lease_end_date: '2027-10-31' };
    const { POST } = await import('@/app/api/crm/active-leases/route');
    // First submission: no existing tenancy → insert
    const first = await POST(makeRequest({ url: 'http://localhost/api/crm/active-leases', body }));
    expect(first.status).toBe(201);
    // Retry (the first response was lost): the tenancy now exists
    activeLeaseFindManyMock.mockResolvedValue([{ id: 77n, status: 'active', address: '425 Park Avenue South', unit: '4D' }]);
    activeLeaseFindUniqueMock.mockResolvedValue(leaseRow({ id: 77n }));
    const second = await POST(makeRequest({ url: 'http://localhost/api/crm/active-leases', body }));
    expect(second.status).toBe(200);
    const sb = await json(second);
    expect(sb.deduplicated).toBe(true);
    expect(sb.lease.id).toBe('77');
    expect(activeLeaseCreateMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith('lease_create_deduplicated', 'active_lease', '77', AUTH, expect.any(Object), undefined);
  });

  it('POST /api/crm/rentals/leases (the second creation route) dedupes the same way', async () => {
    leadFindUniqueMock.mockResolvedValue({ id: 10n, first_name: 'Lena', last_name: 'Landlord' });
    activeLeaseFindManyMock.mockResolvedValue([{ id: 5n, status: 'active', address: '425 Park Avenue South', unit: '4D' }]);
    activeLeaseFindUniqueMock.mockResolvedValue(leaseRow());
    const { POST } = await import('@/app/api/crm/rentals/leases/route');
    const res = await POST(makeRequest({
      url: 'http://localhost/api/crm/rentals/leases',
      body: { landlord_lead_id: '10', address: '425 park avenue south', unit: '4d', monthly_rent: 4200, lease_start_date: '2026-11-01', lease_end_date: '2027-10-31' },
    }));
    expect(res.status).toBe(200);
    expect((await json(res)).deduplicated).toBe(true);
    expect(activeLeaseCreateMock).not.toHaveBeenCalled();
  });

  it('POST /api/crm/active-leases/[id]/renew twice records one new term', async () => {
    const prior = leaseRow({ lease_end_date: new Date('2026-12-31T00:00:00Z') });   // the prior term ends the day before the renewal starts
    activeLeaseFindFirstMock.mockResolvedValue(prior);
    const { POST } = await import('@/app/api/crm/active-leases/[id]/renew/route');
    const body = { lease_start_date: '2027-01-01', lease_end_date: '2027-12-31', monthly_rent: 4400 };
    const first = await POST(makeRequest({ url: 'http://localhost/api/crm/active-leases/5/renew', body }), params());
    expect(first.status).toBe(201);
    const fb = await json(first);
    expect(fb.deduplicated).toBe(false);
    expect(fb.lease.id).toBe('77');
    expect(fb.prior.status).toBe('historical');
    expect(activeLeaseCreateMock).toHaveBeenCalledTimes(1);
    // Retry: the new term exists
    activeLeaseFindManyMock.mockResolvedValue([{ id: 77n, status: 'active', address: prior.address, unit: prior.unit }]);
    activeLeaseFindUniqueMock.mockResolvedValue(leaseRow({ id: 77n }));
    const second = await POST(makeRequest({ url: 'http://localhost/api/crm/active-leases/5/renew', body }), params());
    expect(second.status).toBe(200);
    expect((await json(second)).deduplicated).toBe(true);
    expect(activeLeaseCreateMock).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// C. Term history
// ═══════════════════════════════════════════════════════════════════════
describe('C. The recorded term is history — renewals are new terms, corrections are declared', () => {
  it('PATCH /api/crm/active-leases/[id] with a changed end date on an open tenancy → 409 lease_term_locked', async () => {
    activeLeaseFindFirstMock.mockResolvedValue(leaseRow());
    const { PATCH } = await import('@/app/api/crm/active-leases/[id]/route');
    const res = await PATCH(makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/active-leases/5', body: { lease_end_date: '2028-01-31' } }), params());
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('lease_term_locked');
    expect(body.change.lease_end_date.to).toBe('2028-01-31');
    expect(activeLeaseUpdateMock).not.toHaveBeenCalled();
  });

  it('… the same change with correction:true → 200 corrected:true and an audited lease_dates_corrected', async () => {
    activeLeaseFindFirstMock.mockResolvedValue(leaseRow());
    const { PATCH } = await import('@/app/api/crm/active-leases/[id]/route');
    const res = await PATCH(makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/active-leases/5', body: { lease_end_date: '2028-01-31', correction: true } }), params());
    expect(res.status).toBe(200);
    expect((await json(res)).corrected).toBe(true);
    expect(activeLeaseUpdateMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock.mock.calls[0][0]).toBe('lease_dates_corrected');
  });

  it('… an unchanged date (same day) is not a change', async () => {
    const row = leaseRow();
    activeLeaseFindFirstMock.mockResolvedValue(row);
    const { PATCH } = await import('@/app/api/crm/active-leases/[id]/route');
    const sameDay = row.lease_end_date.toISOString().slice(0, 10);
    const res = await PATCH(makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/active-leases/5', body: { lease_end_date: sameDay, notes: 'x' } }), params());
    expect(res.status).toBe(200);
    expect((await json(res)).corrected).toBe(false);
  });

  it('PATCH /api/crm/lease-tracker/[id] (the Lease Tracker edit modal) applies the same rule', async () => {
    activeLeaseFindUniqueMock.mockResolvedValue({ id: 5n, agent_id: 1n, status: 'active', lease_start_date: new Date('2026-01-01'), lease_end_date: new Date('2026-12-31') });
    const { PATCH } = await import('@/app/api/crm/lease-tracker/[id]/route');
    const locked = await PATCH(makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/lease-tracker/5', body: { lease_end_date: '2027-12-31' } }), params());
    expect(locked.status).toBe(409);
    expect((await json(locked)).code).toBe('lease_term_locked');
    const ok = await PATCH(makeRequest({ method: 'PATCH', url: 'http://localhost/api/crm/lease-tracker/5', body: { lease_end_date: '2027-12-31', correction: true } }), params());
    expect(ok.status).toBe(200);
    const ob = await json(ok);
    expect(ob.corrected).toBe(true);
    expect(ob.lease.id).toBe('5');
  });

  it('the renewal keeps the prior row (historical, renewing) and creates the new term with original_rent and the increase', async () => {
    activeLeaseFindFirstMock.mockResolvedValue(leaseRow({ lease_end_date: new Date('2026-12-31T00:00:00Z') }));   // consecutive: the renewal starts 2027-01-01
    const { POST } = await import('@/app/api/crm/active-leases/[id]/renew/route');
    const res = await POST(makeRequest({ url: 'http://localhost/api/crm/active-leases/5/renew', body: { lease_start_date: '2027-01-01', lease_end_date: '2027-12-31', monthly_rent: 4410 } }), params());
    expect(res.status).toBe(201);
    const created = (activeLeaseCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(created.status).toBe('active');
    expect(created.landlord_lead_id).toBe(10n);
    expect(created.tenant_lead_id).toBe(20n);
    expect(created.original_rent).toBe(4200);
    expect(created.monthly_rent).toBe(4410);
    expect(created.last_rent_increase_pct).toBe(5);
    expect(created.custom_fields).toEqual({ renewed_from_lease_id: '5', rent_carried_over: false });
    // A renewal without a rent carries the prior rent over and records that it is not a confirmed rent
    activeLeaseCreateMock.mockClear();
    const noRent = await POST(makeRequest({ url: 'http://localhost/api/crm/active-leases/5/renew', body: { lease_start_date: '2028-01-01', lease_end_date: '2028-12-31' } }), params());
    expect(noRent.status).toBe(201);
    const carried = (activeLeaseCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(carried.monthly_rent).toBe(4200);
    expect(carried.custom_fields).toEqual({ renewed_from_lease_id: '5', rent_carried_over: true });
    const closed = (activeLeaseUpdateMock.mock.calls[0][0] as { where: { id: bigint }; data: Record<string, unknown> });
    expect(closed.where.id).toBe(5n);
    expect(closed.data.status).toBe('historical');
    expect(closed.data.renewal_status).toBe('renewing');
    expect(closed.data).not.toHaveProperty('lease_end_date');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// D. Outreach — preview, confirmation, gates
// ═══════════════════════════════════════════════════════════════════════
describe('D. Lease outreach — explicit preview and confirmation; the gates', () => {
  async function outreach(body: Record<string, unknown>, row: Record<string, unknown> = leaseRow()) {
    activeLeaseFindUniqueMock.mockResolvedValue(row);
    const { POST } = await import('@/app/api/crm/lease-tracker/[id]/outreach/route');
    const res = await POST(makeRequest({ url: 'http://localhost/api/crm/lease-tracker/5/outreach', body }), params());
    return { status: res.status, body: await json(res) };
  }

  it('preview returns the exact recipient, subject, html and a preview_token — nothing is sent', async () => {
    const r = await outreach({ target: 'tenant', type: 'buy_inquiry', mode: 'preview' });
    expect(r.status).toBe(200);
    expect(r.body.sent).toBe(false);
    expect(r.body.recipient.email).toBe('tom@example.com');
    expect(r.body.subject).toMatch(/buying/i);
    expect(r.body.html).toContain('Tom Tenant');
    expect(r.body.html).toContain('Fair Housing');
    expect(typeof r.body.preview_token).toBe('string');
    expect(r.body.gates).toEqual({ lease: 'ok', recipient: 'ok', unsubscribed: 'ok', declined: 'ok' });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(logAuditEventMock.mock.calls[0][0]).toBe('lease_tracker_outreach_previewed');
  });

  it('send without confirm / without the preview_token → 400 confirmation_required; no mode → 400', async () => {
    const a = await outreach({ target: 'tenant', type: 'buy_inquiry', mode: 'send' });
    expect(a.status).toBe(400);
    expect(a.body.gate).toBe('confirmation_required');
    const b = await outreach({ target: 'tenant', type: 'buy_inquiry', mode: 'send', confirm: true });
    expect(b.status).toBe(400);
    const c = await outreach({ target: 'tenant', type: 'buy_inquiry' });
    expect(c.status).toBe(400);
    expect(c.body.gate).toBe('confirmation_required');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('send with a token that does not match the previewed email → 409 preview_mismatch', async () => {
    const r = await outreach({ target: 'tenant', type: 'buy_inquiry', mode: 'send', confirm: true, preview_token: 'deadbeef' });
    expect(r.status).toBe(409);
    expect(r.body.gate).toBe('preview_mismatch');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('confirmed send of the previewed email sends once, stamps the tracking field and audits lease_tracker_outreach_sent', async () => {
    const p = await outreach({ target: 'landlord', type: '90d_checkin', mode: 'preview' });
    const s = await outreach({ target: 'landlord', type: '90d_checkin', mode: 'send', confirm: true, preview_token: p.body.preview_token });
    expect(s.status).toBe(200);
    expect(s.body.sent).toBe(true);
    expect(s.body.tracking_updated).toBe('outreach_90d_sent_at');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0] as unknown[];
    expect(call[0]).toBe('lena@example.com');
    expect(call[1]).toBe(p.body.subject);
    expect((call[4] as { dryRun?: boolean; channel?: string }).channel).toBe('agent');
    expect((call[4] as { dryRun?: boolean }).dryRun).toBe(false);
    expect(activeLeaseUpdateMock).toHaveBeenCalledWith({ where: { id: 5n }, data: { outreach_90d_sent_at: expect.any(Date) } });
    const actions = logAuditEventMock.mock.calls.map((c) => c[0]);
    expect(actions).toEqual(['lease_tracker_outreach_previewed', 'lease_tracker_outreach_sent']);
    const sentChanges = logAuditEventMock.mock.calls[1][4] as Record<string, unknown>;
    expect(sentChanges.confirmed).toBe(true);
    expect(sentChanges.dry_run).toBe(false);
  });

  it('dry_run:true goes through sendEmail({dryRun}) and stamps nothing', async () => {
    sendEmailMock.mockResolvedValue({ success: true, _dryRun: true });
    const p = await outreach({ target: 'landlord', type: 'sell_inquiry', mode: 'preview' });
    const s = await outreach({ target: 'landlord', type: 'sell_inquiry', mode: 'send', confirm: true, dry_run: true, preview_token: p.body.preview_token });
    expect(s.status).toBe(200);
    expect(s.body.sent).toBe(false);
    expect(s.body.dry_run).toBe(true);
    expect(s.body.tracking_updated).toBeNull();
    expect((sendEmailMock.mock.calls[0][4] as { dryRun?: boolean }).dryRun).toBe(true);
    expect(activeLeaseUpdateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock.mock.calls[1][0]).toBe('lease_tracker_outreach_dryrun');
  });

  it('unsupported email type (the old tenant menu keys) → 400 unsupported_type with the supported list', async () => {
    for (const type of ['buy_opportunity', 'renewal_reminder', 'new_listings']) {
      const r = await outreach({ target: 'tenant', type, mode: 'preview' });
      expect(r.status).toBe(400);
      expect(r.body.gate).toBe('unsupported_type');
      expect(r.body.supported).toContain('buy_inquiry');
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('missing recipient address → 400 missing_recipient (linked client without email; raw tenant without email)', async () => {
    const a = await outreach({ target: 'landlord', type: 'sell_inquiry', mode: 'preview' }, leaseRow({ landlord: { ...PARTY, email: '  ' } }));
    expect(a.status).toBe(400);
    expect(a.body.gate).toBe('missing_recipient');
    const b = await outreach({ target: 'tenant', type: 'renewal', mode: 'preview' }, leaseRow({ tenant: null, tenant_lead_id: null, tenant_name: 'Walk In', tenant_email: null }));
    expect(b.status).toBe(400);
    expect(b.body.gate).toBe('missing_recipient');
  });

  it('unsubscribed client → 403 unsubscribed (preview and send alike)', async () => {
    const r = await outreach({ target: 'tenant', type: 'renewal', mode: 'preview' }, leaseRow({ tenant: { ...TENANT, last_unsubscribe_at: new Date('2026-10-01') } }));
    expect(r.status).toBe(403);
    expect(r.body.gate).toBe('unsubscribed');
    expect(r.body.unsubscribed_at).toBe('2026-10-01T00:00:00.000Z');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('client who declined buying / selling outreach → 403 declined_outreach for buy/sell/market types; renewal and check-ins still preview', async () => {
    const declined = leaseRow({ tenant: { ...TENANT, nurture_paused: true }, landlord: { ...PARTY, nurture_paused: true } });
    for (const [target, type] of [['tenant', 'buy_inquiry'], ['landlord', 'sell_inquiry'], ['landlord', 'market_update']]) {
      const r = await outreach({ target, type, mode: 'preview' }, declined);
      expect(r.status).toBe(403);
      expect(r.body.gate).toBe('declined_outreach');
    }
    for (const [target, type] of [['tenant', 'renewal'], ['tenant', '30d_checkin'], ['landlord', '60d_checkin']]) {
      const r = await outreach({ target, type, mode: 'preview' }, declined);
      expect(r.status).toBe(200);
      expect(r.body.gates.declined).toBe('declined_but_not_applicable');
    }
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('expired lease (term ended, outcome not recorded) → 409 lease_ended; historical term → 409 lease_historical', async () => {
    const a = await outreach({ target: 'landlord', type: '30d_checkin', mode: 'preview' }, leaseRow({ lease_end_date: new Date(Date.now() - 3 * DAY) }));
    expect(a.status).toBe(409);
    expect(a.body.gate).toBe('lease_ended');
    expect(a.body.days_to_expiry).toBeLessThan(0);
    const b = await outreach({ target: 'landlord', type: '30d_checkin', mode: 'preview' }, leaseRow({ status: 'historical' }));
    expect(b.status).toBe(409);
    expect(b.body.gate).toBe('lease_historical');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('a changed lease date invalidates the preview (the token binds the body that quotes the date)', async () => {
    const p = await outreach({ target: 'tenant', type: 'renewal', mode: 'preview' });
    const s = await outreach({ target: 'tenant', type: 'renewal', mode: 'send', confirm: true, preview_token: p.body.preview_token }, leaseRow({ lease_end_date: new Date(Date.now() + 120 * DAY) }));
    expect(s.status).toBe(409);
    expect(s.body.gate).toBe('preview_mismatch');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E. Lifecycle engine — checkpoints from the canonical tenancy
// ═══════════════════════════════════════════════════════════════════════
describe('E. Lifecycle lease triggers — read ActiveLease, never email, create Agent-review checkpoints', () => {
  function trigger(type: string, action_type = 'email') {
    return { id: 1n, trigger_type: type, conditions: {}, action_type, action_config: {}, cooldown_hours: 720, last_executed_at: null, execution_count: 0, enabled: true };
  }

  it('finder reads prisma.activeLease (status active, term inside the milestone window), not Lead.lease_end_date', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([trigger('lease_expiring_30d')]);
    let captured: Record<string, unknown> | null = null;
    activeLeaseFindManyMock.mockImplementation((async (args: { where: Record<string, unknown> }) => { captured = args.where; return []; }) as never);
    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    await evaluateAllTriggers();
    expect(captured).not.toBeNull();
    expect(captured!.status).toBe('active');
    const range = captured!.lease_end_date as { gte: Date; lte: Date };
    const days = (d: Date) => Math.round((d.getTime() - Date.now()) / DAY);
    expect(days(range.gte)).toBe(23);
    expect(days(range.lte)).toBe(37);
    expect(leadFindManyMock).not.toHaveBeenCalled();
  });

  it('a stored action_type of "email" still produces checkpoints, not emails: FollowUpTask + Notification per party, audit email_sent:false', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([trigger('lease_expiring_90d', 'email')]);
    activeLeaseFindManyMock.mockResolvedValue([leaseRow({ lease_end_date: new Date(Date.now() + 88 * DAY), landlord: { ...PARTY, agent_id: 1n }, tenant: { ...TENANT, agent_id: 1n } })]);
    leadFindUniqueMock.mockImplementation((async (args: { where: { id: bigint } }) => (
      args.where.id === 10n ? { agent_id: 1n, first_name: 'Lena', last_name: 'Landlord' } : { agent_id: 1n, first_name: 'Tom', last_name: 'Tenant' }
    )) as never);
    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    const result = await evaluateAllTriggers();
    expect(result.fired).toBe(2);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(followUpTaskCreateMock).toHaveBeenCalledTimes(2);
    const tasks = followUpTaskCreateMock.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(tasks.map((t) => t.task_type).sort()).toEqual(['buyer_conversion', 'renewal_check']);
    expect(tasks.every((t) => String(t.description).includes('Nothing has been sent'))).toBe(true);
    expect(notificationCreateMock).toHaveBeenCalledTimes(2);
    const notif = (notificationCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(notif.recipient_type).toBe('agent');
    expect(notif.recipient_id).toBe(1n);
    expect(String(notif.title)).not.toMatch(/sent/i);
    const audits = auditEventCreateMock.mock.calls.map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data);
    expect(audits.filter((a) => a.action === 'lifecycle_checkpoint_created')).toHaveLength(2);
    expect(audits.every((a) => a.changes.email_sent === false)).toBe(true);
    expect(triggerExecutionCreateMock).toHaveBeenCalledTimes(2);
    const targetIds = triggerExecutionCreateMock.mock.calls.map((c) => (c[0] as { data: { target_type: string; target_id: string } }).data);
    expect(targetIds).toEqual([{ target_type: 'lease_party', target_id: '5:landlord' }, { target_type: 'lease_party', target_id: '5:tenant' }].map((t) => expect.objectContaining(t)));
  });

  it('declined / unsubscribed parties are flagged in the checkpoint and never get the buyer_conversion suggestion', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([trigger('lease_expiring_180d', 'crm_task')]);
    activeLeaseFindManyMock.mockResolvedValue([leaseRow({
      lease_end_date: new Date(Date.now() + 180 * DAY),
      landlord: { ...PARTY, nurture_paused: true, agent_id: 1n },
      tenant: { ...TENANT, last_unsubscribe_at: new Date(), agent_id: 1n },
    })]);
    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    await evaluateAllTriggers();
    const tasks = followUpTaskCreateMock.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.task_type === 'renewal_check')).toBe(true);
    expect(tasks.find((t) => String(t.title).includes('landlord'))!.description).toMatch(/declined further buying \/ selling outreach/);
    expect(tasks.find((t) => String(t.title).includes('landlord'))!.description).not.toMatch(/sell inquiry/);
    expect(tasks.find((t) => String(t.title).includes('tenant'))!.description).toMatch(/unsubscribed/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('an already-open checkpoint is not duplicated; a tenant recorded only by name gets no task (the landlord checkpoint names them)', async () => {
    lifecycleTriggerFindManyMock.mockResolvedValue([trigger('lease_expiring_30d', 'crm_task')]);
    activeLeaseFindManyMock.mockResolvedValue([leaseRow({ lease_end_date: new Date(Date.now() + 30 * DAY), tenant: null, tenant_lead_id: null, tenant_name: 'Walk In' })]);
    followUpTaskFindFirstMock.mockResolvedValue({ id: 123n });
    const { evaluateAllTriggers } = await import('@/lib/lifecycle/engine');
    const result = await evaluateAllTriggers();
    expect(followUpTaskCreateMock).not.toHaveBeenCalled();
    expect(notificationCreateMock).not.toHaveBeenCalled();
    expect(result.fired).toBe(1); // landlord checkpoint exists → success without a second row
    const audits = auditEventCreateMock.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(audits).toContain('lifecycle_checkpoint_exists');
    expect(audits).toContain('lifecycle_checkpoint_skipped_no_client_record');
  });

  it('DEFAULT_TRIGGERS lease entries are crm_task (no email action remains on a lease trigger)', async () => {
    const { DEFAULT_TRIGGERS, LEASE_TRIGGER_TYPES } = await import('@/lib/lifecycle/engine');
    const lease = DEFAULT_TRIGGERS.filter((t) => LEASE_TRIGGER_TYPES.has(t.trigger_type));
    expect(lease).toHaveLength(3);
    expect(lease.every((t) => t.action_type === 'crm_task')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F. CRM wiring (source assertions on the served scripts)
// ═══════════════════════════════════════════════════════════════════════
describe('F. CRM wiring — Lease Tracker, API client, clients PATCH', () => {
  const root = path.resolve(__dirname, '..', '..');
  const tracker = fs.readFileSync(path.join(root, 'public/crm/js/dashboard/panels/lease-tracker.js'), 'utf8');

  it('every Lease Tracker menu key is a type the outreach route implements', async () => {
    const { LEASE_OUTREACH_TYPES } = await import('@/lib/crm/leases');
    const menu = tracker.slice(tracker.indexOf('var OUTREACH_MENU'), tracker.indexOf('var GATE_LABELS'));
    const keys = Array.from(menu.matchAll(/key:\s*'([^']+)'/g)).map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) expect(LEASE_OUTREACH_TYPES as readonly string[]).toContain(k);
    for (const old of ['buy_opportunity', 'renewal_reminder', 'new_listings']) expect(tracker).not.toContain(`'${old}'`);
  });

  it('the menu and the mobile buttons only open the preview; mode:"send" + confirm:true exist once, inside _confirmOutreach', () => {
    expect(tracker).toMatch(/function _emailLandlord\(propIdx, type\) \{ _previewOutreach\(propIdx, 'landlord', type\); \}/);
    expect(tracker).toMatch(/function _emailTenant\(propIdx, type\) \{ _previewOutreach\(propIdx, 'tenant', type\); \}/);
    // Only one request payload in the whole panel carries mode:'send' / confirm:true (comments aside)
    const payloads = tracker.match(/JSON\.stringify\(\{[^}]*\}\)/g) || [];
    expect(payloads.filter((p) => /mode: 'send'/.test(p))).toHaveLength(1);
    expect(payloads.filter((p) => /confirm: true/.test(p))).toHaveLength(1);
    const confirmFn = tracker.slice(tracker.indexOf('function _confirmOutreach'), tracker.indexOf('function _openClient'));
    expect(confirmFn).toContain("mode: 'send', confirm: true, dry_run: false, preview_token: p.res.preview_token");
    expect(tracker).not.toContain('lt-preview-dryrun'); // no test control in the agent-facing modal
    const previewFn = tracker.slice(tracker.indexOf('function _previewOutreach'), tracker.indexOf('function _openPreviewModal'));
    expect(previewFn).toContain("mode: 'preview'");
    expect(previewFn).not.toContain("mode: 'send'");
  });

  it('the edit modal sends dates only when changed, correction only when ticked, and offers Record renewal / Mark ended', () => {
    const save = tracker.slice(tracker.indexOf('function _saveEdit'), tracker.indexOf('// ADD LEASE MODAL'));
    expect(save).toContain("if (start && start !== startOrig) leaseUpdate.lease_start_date = start;");
    expect(save).toContain("if (corr && corr.checked && (leaseUpdate.lease_start_date || leaseUpdate.lease_end_date)) leaseUpdate.correction = true;");
    expect(save).toContain("d.code === 'lease_term_locked'");
    expect(save).toContain("tenantUpdate.nurture_paused = !!tDecl.checked");
    expect(save).toContain("llUpdate.nurture_paused = !!lDecl.checked");
    expect(tracker).toContain("'/api/crm/active-leases/' + prop.id + '/renew'");
    expect(tracker).toContain("JSON.stringify({ status: 'historical' })");
    expect(tracker).toContain('TERM ENDED'); // the term on file passed; the tenancy is not declared dead
    expect(tracker).not.toContain('>EXPIRED<');
  });

  it('both creation UIs surface a deduplicated answer instead of reporting a new row', () => {
    expect(tracker).toContain('out.deduplicated');
    const rentals = fs.readFileSync(path.join(root, 'public/crm/js/dashboard/panels/rentals-crm/index.js'), 'utf8');
    expect(rentals).toContain('out.deduplicated');
  });

  it('the API client keeps the server reason on a 403 (consent gates are 403s with a gate code)', () => {
    const api = fs.readFileSync(path.join(root, 'public/crm/js/core/api-client.js'), 'utf8');
    const branch = api.slice(api.indexOf('if (res.status === 403)'), api.indexOf('if (!res.ok)'));
    expect(branch).toContain("_failure((data && typeof data.error === 'string' && data.error) || 'Access denied', 403, data)");   // the server's own words and body
    const failure = api.slice(api.indexOf('function _failure('), api.indexOf('function _fetch('));
    expect(failure).toContain('err.data = body');
    expect(failure).toContain('err.details = body');
  });

  it('the Lease Tracker offers the REBNY pull and imports through the idempotent creation route with RLS provenance', () => {
    expect(tracker).toContain('Signed leases (REBNY)');
    expect(tracker).toContain("MallanAPI._fetch('/api/crm/lease-tracker/rebny-leases')");
    const save = tracker.slice(tracker.indexOf('function _saveNewLease'), tracker.indexOf('// SIGNED LEASES FROM REBNY'));
    expect(save).toContain("route = '/api/crm/active-leases'");
    expect(save).toContain('rls_listing_id: srcId');
    expect(save).toContain("source: 'cotality_rls'");
    const add = tracker.slice(tracker.indexOf('function _addFromRebny'), tracker.indexOf('// PUBLIC API'));
    expect(add).toContain('lease_start_date: s.lease_start_date');
    expect(add).toContain('term_assumed: !!s.term_assumed');
  });

  it('clients PATCH accepts nurture_paused (the declined flag) and the Lease Tracker GET exposes it', () => {
    const clients = fs.readFileSync(path.join(root, 'app/api/crm/clients/[id]/route.ts'), 'utf8');
    expect(clients).toContain('if (body.nurture_paused !== undefined) update.nurture_paused = Boolean(body.nurture_paused);');
    const tracker = fs.readFileSync(path.join(root, 'app/api/crm/lease-tracker/route.ts'), 'utf8');
    expect(tracker).toContain('declined_outreach: lease.tenant.nurture_paused === true');
    expect(tracker).toContain('declined_outreach: lease.landlord.nurture_paused === true');
    expect(tracker).toContain('ended_but_open: endedButOpen');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// G. Signed leases from REBNY — Mallan as the landlord's representative (live RLS)
// ═══════════════════════════════════════════════════════════════════════
describe('G. Signed leases from REBNY (live RLS; Mallan list office)', () => {
  // Shapes as Cotality served them on 2026-10-27 (ListOfficeMlsId 7041 = "MAllan Real Estate Inc";
  // StreetName is the bare name, UnparsedAddress carries suffix, direction and the unit last;
  // LeaseTerm / OwnerName null on every Mallan row).
  const RLS_ROWS = [
    { ListingId: 'RLS20021426', ListingKey: '1183000001', StandardStatus: 'Closed', UnparsedAddress: '425 PARK Avenue S 4D', StreetNumber: '425', StreetName: 'PARK', UnitNumber: '4D', City: 'New York', PostalCode: '10016', ListPrice: 6000, ClosePrice: 6000, CloseDate: '2025-08-13', AvailabilityDate: '2025-06-19', ListingContractDate: '2025-05-05', OffMarketDate: '2025-08-13', LeaseTerm: null, ListAgentMlsId: '39361', ListAgentFullName: 'Maya Allan', ListOfficeMlsId: '7041', ListOfficeName: 'MAllan Real Estate Inc' },
    { ListingId: 'RLS20027094', ListingKey: '1183000002', StandardStatus: 'Closed', UnparsedAddress: '333 E 46TH Street 2G', StreetNumber: '333', StreetName: '46TH', UnitNumber: '2G', ListPrice: 4100, ClosePrice: 4100, CloseDate: '2025-08-07', AvailabilityDate: '2025-08-15', LeaseTerm: null, ListAgentMlsId: '39361', ListAgentFullName: 'Maya Allan', ListOfficeMlsId: '7041', ListOfficeName: 'MAllan Real Estate Inc' },
    { ListingId: 'RLS10868954', StandardStatus: 'Closed', UnparsedAddress: '425 PARK Avenue S 4D', UnitNumber: '4D', ClosePrice: 5000, CloseDate: '2023-07-21', AvailabilityDate: '2023-08-15', ListAgentMlsId: '39361', ListAgentFullName: 'Maya Allan', ListOfficeMlsId: '7041' },
    { ListingId: 'RLS10924848', StandardStatus: 'Closed', UnparsedAddress: '65 E 96TH Street PHR', UnitNumber: 'PHR', ListPrice: 1, ClosePrice: 0, CloseDate: '2023-10-23', AvailabilityDate: '2023-07-14', ListAgentMlsId: '39361', ListOfficeMlsId: '7041' },
  ];
  let fetchSpy: jest.SpyInstance<Promise<Response>, [RequestInfo | URL, RequestInit?]>;
  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ '@odata.count': RLS_ROWS.length, value: RLS_ROWS }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('addressKey matches the RLS spelling and the typed spelling of one building; the unit is separate', async () => {
    const { addressKey } = await import('@/lib/crm/leases');
    expect(addressKey('425 PARK Avenue S 4D')).toBe('425 park avenue');
    expect(addressKey('425 Park Avenue South')).toBe('425 park avenue');
    expect(addressKey('36 W 85TH Street 2')).toBe('36 west 85');
    expect(addressKey('36 West 85th Street')).toBe('36 west 85');
    expect(addressKey('400 E 90TH Street 6B')).toBe('400 east 90');
    expect(addressKey('333 E 46TH Street 2G')).not.toBe(addressKey('334 E 46TH Street 2G'));
  });

  it('reads closed rentals whose list office is Mallan from live Cotality and matches them to the tracked tenancies', async () => {
    activeLeaseFindManyMock.mockResolvedValue([{
      id: 4n, address: '425 Park Avenue South', unit: '4D', status: 'active', lease_start_date: new Date('2025-09-14'), lease_end_date: new Date('2026-09-13'), monthly_rent: 6000,
      landlord: { id: 56n, first_name: 'Diego', last_name: 'Gomez' }, tenant: { id: 57n, first_name: 'Ryan', last_name: 'Atkinson' }, tenant_name: null,
    }]);
    listingFindManyMock.mockResolvedValue([{ listing_id: 'RLS20027094', mls_id: '1183000002', owner_client: { id: 90n, first_name: 'Olga', last_name: 'Owner', email: 'o@example.com' } }]);
    const { GET } = await import('@/app/api/crm/lease-tracker/rebny-leases/route');
    const res = await GET(new NextRequest('http://localhost/api/crm/lease-tracker/rebny-leases'));
    expect(res.status).toBe(200);
    const body = await json(res);
    const url = decodeURIComponent(String(fetchSpy.mock.calls[0][0])).replace(/\+/g, ' '); // URLSearchParams spaces
    expect(url).toContain("ListOfficeMlsId eq '7041'");
    expect(url).toContain("PropertyType eq 'ResidentialLease'");
    expect(url).toContain("StandardStatus eq 'Closed'");
    expect(url).toContain('$orderby=CloseDate desc');
    expect(url).toContain('ClosePrice,CloseDate,AvailabilityDate');
    expect((fetchSpy.mock.calls[0][1] as RequestInit).headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-token' }));
    expect(body.source).toBe('cotality_rls_live');
    expect(body.count).toBe(4);
    expect(body.untracked).toBe(2);
    const [pas2025, e46, pas2023, phr] = body.leases;
    expect(pas2025.address).toBe('425 PARK Avenue S'); // UnparsedAddress minus the unit, not the bare StreetName
    expect(pas2025.unit).toBe('4D');
    expect(pas2025.monthly_rent).toBe(6000);
    expect(pas2025.tracking.status).toBe('tracked');
    expect(pas2025.tracking.lease_id).toBe('4');
    expect(pas2025.tracking.landlord).toEqual({ id: '56', name: 'Diego Gomez' });
    expect(pas2025.suggested).toEqual(expect.objectContaining({ lease_start_date: '2025-06-19', lease_end_date: '2026-06-18', months: 12, term_assumed: true }));
    expect(e46.tracking.status).toBe('untracked');
    expect(e46.suggested).toEqual(expect.objectContaining({ address: '333 E 46TH Street', unit: '2G', monthly_rent: 4100, lease_start_date: '2025-08-15', lease_end_date: '2026-08-14', term_assumed: true }));
    expect(e46.suggested.landlord).toEqual({ id: '90', name: 'Olga Owner', email: 'o@example.com' });
    expect(pas2023.tracking.status).toBe('tracked_other_term');
    expect(pas2023.tracking.lease_id).toBe('4');
    expect(phr.monthly_rent).toBeNull(); // a $1 placeholder price is not a rent
    expect(() => JSON.stringify(body)).not.toThrow();
  });

  it('an agent sees only the leases they listed (REBNY member id on the Agent record); a Cotality error is reported, never swallowed', async () => {
    requireAgentOrBrokerMock.mockResolvedValue({ userId: 4n, role: 'AGENT', email: 'agent@mallan.nyc' } as never);
    agentFindUniqueMock.mockResolvedValue({ trestle_mls_id: '99999' });
    const { GET } = await import('@/app/api/crm/lease-tracker/rebny-leases/route');
    const none = await GET(new NextRequest('http://localhost/api/crm/lease-tracker/rebny-leases'));
    expect((await json(none)).count).toBe(0);
    agentFindUniqueMock.mockResolvedValue({ trestle_mls_id: '39361' });
    const mine = await GET(new NextRequest('http://localhost/api/crm/lease-tracker/rebny-leases?months=6'));
    const mb = await json(mine);
    expect(mb.count).toBe(4);
    expect(mb.filter).toMatch(/CloseDate ge \d{4}-\d{2}-\d{2}/);
    fetchSpy.mockImplementation(async () => new Response('Service Unavailable', { status: 503 }));
    const bad = await GET(new NextRequest('http://localhost/api/crm/lease-tracker/rebny-leases'));
    expect(bad.status).toBe(502);
    expect((await json(bad)).error).toBe('Cotality answered 503');
  });
});
