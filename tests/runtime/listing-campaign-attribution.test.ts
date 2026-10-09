/// <reference types="jest" />
/**
 * POST /api/crm/listing-campaigns: the investor email carries the listing's own attribution from the public DTO, apart from the sender.
 *
 * Before: the email showed the sender under "Presented By ... Mallan Real Estate Inc." and nothing about the listing's own broker, although the route selects list_office_name and the DTO has the finished
 * line (_displayCompliance.attributionText: "Listing courtesy of <the actual listing broker>" for a third-party listing, "Exclusive listing by Mallan Real Estate Inc." for Mallan's own; REBNY UCBA Art. III
 * §2(C), NY DOS 19 NYCRR §175.25). The real route and the real template run; Prisma, auth, the mail service and the DTO builder are mocked (the DTO's own policy has its own tests), so what is asserted
 * is that the route hands the DTO's attribution to the email and nothing else stands in for it.
 */
const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
let mockCompliance: Record<string, unknown> | undefined;

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findUnique: (a: unknown) => mockFindUnique(a) },
    lead: { findMany: async () => [] },
    auditEvent: { create: async () => undefined },
    agent: { findUnique: async () => ({ first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc', phone: '646-258-4460', title: 'Licensed Real Estate Broker', role: 'BROKER' }) },
  },
}));
// the recipient-list helper loads a spreadsheet reader at import; a preview with no recipients never calls it
jest.mock('exceljs', () => ({ __esModule: true, default: {} }), { virtual: true });
jest.mock('@/lib/auth', () => ({ __esModule: true, requireAgentOrBroker: async () => ({ userId: 1, userType: 'broker' }), isAuthError: () => false }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: jest.fn(async () => ({ success: true })) }));
jest.mock('@/lib/compliance/rls-enforcement', () => ({ __esModule: true, scanRecordForFairHousing: () => [] }));
jest.mock('@/lib/compliance/gates', () => ({ __esModule: true, affirmPermission: (v: unknown) => v === true }));
jest.mock('@/lib/idx/trestle-mapper', () => ({ __esModule: true, TERMINAL_STATUSES: new Set(['Closed', 'Cancelled', 'Expired', 'Withdrawn']), normalizeStandardStatus: (s: unknown) => String(s) }));
jest.mock('@/lib/idx/db-to-public-dto', () => ({
  __esModule: true,
  dbListingToPublicDTO: () => ({
    mlsId: 'X', url: '/listing/333-east-46th-street', listPrice: 765000, bedroomsTotal: 1, bathroomsFull: 1, livingArea: 860, propertyType: 'Condop',
    address: { streetNumber: '333', streetName: 'East 46th Street', unitNumber: '2G', neighborhood: 'Turtle Bay', city: 'New York' },
    media: [{ url: 'https://cdn/photo1.jpg', mediaType: 'Photo' }],
    ...(mockCompliance ? { _displayCompliance: mockCompliance } : {}),
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/crm/listing-campaigns/route';

const post = (body: Record<string, unknown>) => new NextRequest('https://mallan.nyc/api/crm/listing-campaigns', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const preview = async (listingRow: Record<string, unknown>) => {
  mockFindUnique.mockReset().mockResolvedValue(listingRow);
  const res = await POST(post({ listing_id: String(listingRow.listing_id), mode: 'preview' }));
  expect(res.status).toBe(200);
  return String((await res.json()).html);
};
const thirdParty = { id: 11, listing_id: 'RLS20093870', status: 'Active', owner_opt_out: false, participant_only: false, idx_display_yn: true, internet_entire_listing_display_yn: true, agent_id: 5, owner_client_id: null, rls_eligible: true, list_office_name: 'Compass' };
const exclusive = { id: 10, listing_id: 'SL-0004', status: 'Active', owner_opt_out: false, participant_only: false, idx_display_yn: false, internet_entire_listing_display_yn: null, agent_id: 5, owner_client_id: null, rls_eligible: false, list_office_name: null };
const SENTENCE = 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.';

beforeEach(() => { mockCompliance = undefined; });

describe('POST /api/crm/listing-campaigns (preview): the listing\'s own attribution', () => {
  it('a third-party listing: "Listing courtesy of <its broker>" under the address, the REBNY data sentence in the disclaimer, and the sender still presenting', async () => {
    mockCompliance = { requiresAttribution: true, attributionText: 'Listing courtesy of Compass', disclaimerRequired: true };
    const html = await preview(thirdParty);
    expect(html).toContain('Listing courtesy of Compass');
    expect(html.indexOf('Listing courtesy of Compass')).toBeGreaterThan(html.indexOf('333 East 46th Street'));
    expect(html.indexOf('Listing courtesy of Compass')).toBeLessThan(html.indexOf('Presented By'));
    expect(html).toContain(SENTENCE);
    expect(html).toContain('Presented By');
    expect(html).toContain('Maya Allan');
  });

  it('Mallan\'s own listing: the DTO\'s own line, and no RLS data sentence (it is not RLS content)', async () => {
    mockCompliance = { requiresAttribution: true, attributionText: 'Exclusive listing by Mallan Real Estate Inc.', disclaimerRequired: false };
    const html = await preview(exclusive);
    expect(html).toContain('Exclusive listing by Mallan Real Estate Inc.');
    expect(html).not.toContain(SENTENCE);
  });

  it('a DTO that carries no attribution leaves the email as it was: nothing is invented in its place', async () => {
    const html = await preview(thirdParty);
    expect(html).not.toContain('Listing courtesy of');
    expect(html).not.toContain('Exclusive listing by');
    expect(html).not.toContain(SENTENCE);
  });

  it('the attribution is escaped like every other value of the email', async () => {
    mockCompliance = { requiresAttribution: true, attributionText: 'Listing courtesy of <img src=x onerror=alert(1)> Realty', disclaimerRequired: true };
    const html = await preview(thirdParty);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('Listing courtesy of &lt;img src=x onerror=alert(1)&gt; Realty');
  });
});
