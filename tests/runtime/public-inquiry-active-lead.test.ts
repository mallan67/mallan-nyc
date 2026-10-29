/// <reference types="jest" />
/**
 * POST /api/inquiries — a public inquiry on a listing is a working CRM lead (owner rule, 2026-10-28):
 * created ACTIVE, linked to the property it asks about, and assigned to the listing's agent (or to the
 * principal broker for a Cotality listing Mallan does not list). An inquiry without a listing stays a
 * 'new' website lead, as before. An existing lead keeps its agent and becomes active.
 */
const leadUpsertMock = jest.fn(async (args: { create: Record<string, unknown> }) => ({ id: 77n, email: args.create.email, phone: args.create.phone, first_name: 'Ada', last_name: 'Lovelace' }));
const leadFindUniqueMock = jest.fn(async () => null as null | { agent_id: bigint | null });
const listingFindFirstMock = jest.fn(async () => null as null | { listing_id: string; listing_type: string; agent_id: bigint | null });
const agentFindFirstMock = jest.fn(async () => ({ id: 1n }));
const auditEventCreateMock = jest.fn(async () => undefined);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { upsert: leadUpsertMock, findUnique: leadFindUniqueMock },
    listing: { findFirst: listingFindFirstMock },
    agent: { findFirst: agentFindFirstMock },
    auditEvent: { create: auditEventCreateMock },
  },
}));
jest.mock('@/lib/middleware/rate-limiter', () => ({ __esModule: true, checkRouteRateLimit: jest.fn(async () => true), extractClientIp: jest.fn(() => '203.0.113.42') }));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));
jest.mock('@/lib/inquiries/create', () => ({ __esModule: true, createInquiry: jest.fn(async () => 12345n), hashIp: () => null }));
jest.mock('@/lib/behavioral/session-link', () => ({ __esModule: true, extractBehavioralSessionId: jest.fn(() => null), linkBehavioralSessionToLead: jest.fn(async () => undefined) }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: jest.fn(async () => ({ success: true, messageId: 'm-1' })) }));
jest.mock('@/lib/email/templates', () => ({ __esModule: true, inquiryAutoResponseEmail: () => '<p>thanks</p>' }));

import { POST } from '@/app/api/inquiries/route';

const inquiry = (extra: Record<string, unknown> = {}) =>
  POST(new Request('http://localhost/api/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada Lovelace', email: 'Ada@Example.test', phone: '212-555-0100', agreeToTerms: true, message: 'Is it still available?', ...extra }) }) as never);

beforeEach(() => { leadUpsertMock.mockClear(); leadFindUniqueMock.mockReset(); leadFindUniqueMock.mockResolvedValue(null); listingFindFirstMock.mockReset(); listingFindFirstMock.mockResolvedValue(null); agentFindFirstMock.mockClear(); });

describe('a public inquiry on a listing', () => {
  it('creates an ACTIVE lead, linked to the sale listing and assigned to its agent', async () => {
    listingFindFirstMock.mockResolvedValue({ listing_id: 'SL-0008', listing_type: 'sale', agent_id: 9n });
    const res = await inquiry({ listingId: 'SL-0008', listingAddress: '400 East 90th Street 17C' });
    expect(res.status).toBe(200);
    expect(listingFindFirstMock).toHaveBeenCalledWith({ where: { OR: [{ listing_id: 'SL-0008' }, { mls_id: 'SL-0008' }] }, select: { listing_id: true, listing_type: true, agent_id: true } });
    const args = leadUpsertMock.mock.calls[0][0] as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };
    expect(args.where).toEqual({ email: 'ada@example.test' });
    expect(args.create).toMatchObject({ status: 'active', agent_id: 9n, active_sale_listing_id: 'SL-0008', roles: ['buyer'] });
    expect(args.update).toMatchObject({ status: 'active', active_sale_listing_id: 'SL-0008', agent_id: 9n });   // nobody had the lead yet
    expect(agentFindFirstMock).not.toHaveBeenCalled();
  });

  it('a rental inquiry links the rental listing and makes a renter lead', async () => {
    listingFindFirstMock.mockResolvedValue({ listing_id: 'RL-0001', listing_type: 'rent', agent_id: 9n });
    await inquiry({ listingId: 'RL-0001' });
    const args = leadUpsertMock.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(args.create).toMatchObject({ status: 'active', active_rental_listing_id: 'RL-0001', roles: ['renter'], agent_id: 9n });
    expect(args.create).not.toHaveProperty('active_sale_listing_id');
  });

  it('a Cotality listing Mallan does not list is assigned to the principal broker', async () => {
    listingFindFirstMock.mockResolvedValue({ listing_id: 'RLS10952930', listing_type: 'sale', agent_id: null });
    await inquiry({ listingId: 'RLS10952930' });
    expect(agentFindFirstMock).toHaveBeenCalledWith({ where: { role: 'BROKER' }, orderBy: { id: 'asc' }, select: { id: true } });
    const args = leadUpsertMock.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(args.create).toMatchObject({ status: 'active', agent_id: 1n, active_sale_listing_id: 'RLS10952930' });
  });

  it('a lead that already has an agent keeps it and becomes active with the property link', async () => {
    listingFindFirstMock.mockResolvedValue({ listing_id: 'SL-0008', listing_type: 'sale', agent_id: 9n });
    leadFindUniqueMock.mockResolvedValue({ agent_id: 4n });
    await inquiry({ listingId: 'SL-0008' });
    const args = leadUpsertMock.mock.calls[0][0] as unknown as { update: Record<string, unknown> };
    expect(args.update).toMatchObject({ status: 'active', active_sale_listing_id: 'SL-0008' });
    expect(args.update).not.toHaveProperty('agent_id');
  });

  it('an inquiry without a listing stays a new website lead, unassigned and unlinked', async () => {
    await inquiry();
    expect(listingFindFirstMock).not.toHaveBeenCalled();
    const args = leadUpsertMock.mock.calls[0][0] as { create: Record<string, unknown>; update: Record<string, unknown> };
    expect(args.create).toMatchObject({ status: 'new', roles: ['buyer'] });
    expect(args.create).not.toHaveProperty('agent_id');
    expect(args.create).not.toHaveProperty('active_sale_listing_id');
    expect(args.update).not.toHaveProperty('status');
  });
});
