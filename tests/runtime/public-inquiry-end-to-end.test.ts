/// <reference types="jest" />
/**
 * Lead capture, end to end, on a rollback-only fixture (Maya, 2026-10-28 closing brief, item 4):
 *   a public inquiry → ONE canonical client (keyed by e-mail, case-insensitive) → a property-linked Inquiry row → the lead ACTIVE →
 *   assigned (the listing's agent, else the principal broker) → a durable timeline (the audit event, the Inquiry row) → the follow-up
 *   checkpoint (the lifecycle engine's stale-inquiry finder sees the lead until an agent records a contact).
 * The same contact then inquires about a different property: the SAME lead (no duplicate identity), both inquiries on record.
 * Every row lives in memory (tests/runtime/in-memory-prisma.ts); no database, no real lead, no e-mail is sent (the sender is a mock).
 */
import { inMemoryPrisma } from './in-memory-prisma';

/* eslint-disable @typescript-eslint/no-explicit-any */
const { prisma: prismaMock, tables } = inMemoryPrisma({
  listing: [
    { id: 1n, listing_id: 'SL-E2E1', mls_id: null, listing_type: 'sale', agent_id: 9n, status: 'Active' },
    { id: 2n, listing_id: 'RL-E2E2', mls_id: null, listing_type: 'rent', agent_id: null, status: 'Active' },
  ],
  agent: [{ id: 1n, role: 'BROKER', first_name: 'Maya', last_name: 'Allan' }, { id: 9n, role: 'AGENT', first_name: 'Sender', last_name: 'Agent' }],
});
const sendEmailMock = jest.fn(async (to: string) => ({ success: true, messageId: 'provider-' + to }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/middleware/rate-limiter', () => ({ __esModule: true, checkRouteRateLimit: jest.fn(async () => true), extractClientIp: jest.fn(() => '203.0.113.42') }));
jest.mock('@/lib/behavioral/session-link', () => ({ __esModule: true, extractBehavioralSessionId: jest.fn(() => null), linkBehavioralSessionToLead: jest.fn(async () => undefined) }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: (...a: unknown[]) => sendEmailMock(...(a as [string])) }));
jest.mock('@/lib/email/templates', () => ({ __esModule: true, inquiryAutoResponseEmail: () => '<p>Thank you for your inquiry.</p>' }));

import { POST } from '@/app/api/inquiries/route';
import { findStaleInquiryTargets } from '@/lib/lifecycle/engine';

const inquire = (body: Record<string, unknown>) =>
  POST(new Request('http://localhost/api/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agreeToTerms: true, ...body }) }) as never);

describe('public inquiry → one canonical client → property-linked inquiry → active, assigned → timeline → follow-up', () => {
  it('1. the first inquiry (a sale listing) creates the client ACTIVE, linked to the property, assigned to its agent, with its inquiry and timeline rows', async () => {
    const res = await inquire({ name: 'Ada Lovelace', email: 'Ada@Example.test', phone: '212-555-0100', message: 'Is 17C still available?', listingId: 'SL-E2E1', listingAddress: '400 East 90th Street 17C' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(tables.lead.length).toBe(1);
    const lead = tables.lead[0];
    expect(lead).toMatchObject({ email: 'ada@example.test', first_name: 'Ada', last_name: 'Lovelace', status: 'active', roles: ['buyer'], active_sale_listing_id: 'SL-E2E1', source: 'website' });
    expect(String(lead.agent_id)).toBe('9');
    expect(lead.consent_captured_at).toBeInstanceOf(Date);
    // the property-linked Inquiry row (durable) and the timeline event
    expect(tables.inquiry.map((i) => [String(i.lead_id), i.listing_id])).toEqual([[String(lead.id), 'SL-E2E1']]);
    expect(tables.auditEvent.map((e) => [e.action, e.entity_id, e.changes?.listing_id])).toEqual([['inquiry_submitted', String(lead.id), 'SL-E2E1']]);
    // the governed sender was asked twice (the broker notification, the auto-response) and answered with provider outcomes; nothing left this process
    expect(sendEmailMock.mock.calls.map((c) => c[0])).toEqual(['info@mallan.nyc', 'ada@example.test']);
  });

  it('2. the same contact, a different property (a rental Mallan does not list): the SAME client, now linked to that rental too, the broker kept as its agent', async () => {
    sendEmailMock.mockClear();
    const res = await inquire({ name: 'Ada Lovelace', email: 'ADA@EXAMPLE.TEST', phone: '212-555-0100', message: 'And the rental on Park Avenue South?', listingId: 'RL-E2E2' });
    expect(res.status).toBe(200);
    expect(tables.lead.length).toBe(1);                                      // no duplicate identity: the e-mail is the key, case-insensitively
    const lead = tables.lead[0];
    expect(lead).toMatchObject({ status: 'active', active_sale_listing_id: 'SL-E2E1', active_rental_listing_id: 'RL-E2E2' });
    expect(String(lead.agent_id)).toBe('9');                                 // an assigned lead keeps its agent
    expect(tables.inquiry.map((i) => [String(i.lead_id), i.listing_id])).toEqual([[String(lead.id), 'SL-E2E1'], [String(lead.id), 'RL-E2E2']]);
    expect(tables.auditEvent.map((e) => e.changes?.listing_id)).toEqual(['SL-E2E1', 'RL-E2E2']);
    expect(sendEmailMock.mock.calls.map((c) => c[0])).toEqual(['info@mallan.nyc', 'ada@example.test']);
  });

  it('3. a fresh contact on the rental nobody at Mallan lists is assigned to the principal broker', async () => {
    const res = await inquire({ name: 'Grace Hopper', email: 'grace@example.test', phone: '212-555-0101', message: 'The rental, please.', listingId: 'RL-E2E2' });
    expect(res.status).toBe(200);
    const grace = tables.lead.find((l) => l.email === 'grace@example.test')!;
    expect(grace).toMatchObject({ status: 'active', roles: ['renter'], active_rental_listing_id: 'RL-E2E2' });
    expect(String(grace.agent_id)).toBe('1');
    expect(tables.lead.length).toBe(2);
  });

  it('4. follow-up: the lifecycle engine lists the inquiring client until an agent records a contact', async () => {
    expect(await findStaleInquiryTargets({ max_hours: 48 })).toEqual([]);  // inquired a moment ago: not yet due
    tables.lead.forEach((l) => { l.created_at = new Date(Date.now() - 3 * 86400_000); });   // three days on, nobody has called
    const targets = await findStaleInquiryTargets({ max_hours: 48 });      // the default rule (conditions: { max_hours: 48 }, agent_alert)
    const ids = targets.map((t) => t.id).sort();
    expect(ids).toEqual(tables.lead.map((l) => String(l.id)).sort());
    expect(targets.every((t) => t.type === 'lead' && t.context.trigger === 'inquiry_stale')).toBe(true);
    // the agent calls Ada and records it: she is no longer due; Grace still is
    const ada = tables.lead.find((l) => l.email === 'ada@example.test')!;
    ada.last_contacted_at = new Date();
    expect((await findStaleInquiryTargets({ max_hours: 48 })).map((t) => t.id)).toEqual([String(tables.lead.find((l) => l.email === 'grace@example.test')!.id)]);
  });

  it('5. an inquiry without a listing stays a new website lead, unassigned and unlinked', async () => {
    const res = await inquire({ name: 'Linus Torvalds', email: 'linus@example.test', phone: '212-555-0102', message: 'General question.' });
    expect(res.status).toBe(200);
    const linus = tables.lead.find((l) => l.email === 'linus@example.test')!;
    expect(linus).toMatchObject({ status: 'new', roles: ['buyer'] });
    expect(linus.agent_id ?? null).toBeNull();
    expect(linus.active_sale_listing_id ?? null).toBeNull();
    expect(tables.inquiry.filter((i) => String(i.lead_id) === String(linus.id)).map((i) => i.listing_id)).toEqual([null]);
  });
});
