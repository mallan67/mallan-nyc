/// <reference types="jest" />
/**
 * POST /api/crm/listing-campaigns: the investor email carries the listing's own attribution, apart from the sender, decided from where the listing comes from.
 *
 * Before: the email showed the sender under "Presented By ... Mallan Real Estate Inc." and nothing about the listing's own broker (REBNY UCBA Art. III §2(C), NY DOS 19 NYCRR §175.25).
 * First fix (063718ab): the route took the public DTO's `_displayCompliance`. That line is decided by `classifyDbListing` from `agent_id` / `owner_client_id`, and `syncAgentHistory` writes
 * `agent_id` onto Cotality rows that match the agent on the list side OR the buyer side, so another firm's listing that carried one said "Exclusive listing by Mallan Real Estate Inc." and lost the
 * data-provider sentence. The first version of this test mocked the DTO builder, and so could not see it.
 *
 * Now the REAL route, the REAL public DTO builder and the REAL template run; only Prisma, auth, the mail service and the Fair Housing scanner are mocked. The attribution is decided from the
 * listing id and `rls_eligible` (lib/listings/mallan-source-identity.ts), never from `agent_id` or `owner_client_id`, which the route no longer selects at all.
 */
const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();

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

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/crm/listing-campaigns/route';
import { buildSourceAndCompliance } from '@/lib/idx/db-to-public-dto';
import { MALLAN_EXCLUSIVE_ATTRIBUTION } from '@/lib/idx/public-attribution';

const post = (body: Record<string, unknown>) => new NextRequest('https://mallan.nyc/api/crm/listing-campaigns', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const preview = async (listingRow: Record<string, unknown>) => {
  mockFindUnique.mockReset().mockResolvedValue(listingRow);
  const res = await POST(post({ listing_id: String(listingRow.listing_id), mode: 'preview' }));
  expect(res.status).toBe(200);
  return String((await res.json()).html);
};
/** every column the route selects, as Prisma returns it for a displayable listing */
const row = (over: Record<string, unknown>) => ({
  id: BigInt(11), listing_id: 'RLS20093870', mls_id: 'RLS20093870', status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condominium', list_price: '765000',
  bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0, living_area: '860', borough: 'Manhattan', neighborhood: 'Turtle Bay',
  address: { streetNumber: '333', streetName: 'East 46th Street', unitNumber: '2G', city: 'New York', state: 'NY', postalCode: '10017', full: '333 East 46th Street #2G' },
  features: {}, media: [{ url: 'https://cdn.example.com/photo1.jpg', mediaType: 'Photo', order: 1 }], list_agent_full_name: 'A. Agent', list_office_name: 'Compass', rls_eligible: true,
  idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
  listing_contract_date: new Date('2026-09-01T00:00:00Z'), modification_timestamp: new Date('2026-10-01T12:00:00Z'), created_at: new Date('2026-09-01T00:00:00Z'), updated_at: new Date('2026-10-01T12:00:00Z'),
  raw_data: {}, listing_media: [],
  ...over,
});
const SENTENCE = 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.';
const attributions = (html: string) => [...html.matchAll(/(?:Listing courtesy of|Exclusive listing by)[^<\n]*/g)].map((m) => m[0].trim());

describe('POST /api/crm/listing-campaigns (preview): the listing\'s own attribution, from the real DTO builder', () => {
  it('a third-party listing: "Listing courtesy of <its broker>" under the address, the REBNY data sentence in the disclaimer, and the sender still presenting', async () => {
    const html = await preview(row({}));
    expect(attributions(html)).toEqual(['Listing courtesy of Compass']);
    expect(html.indexOf('Listing courtesy of Compass')).toBeGreaterThan(html.indexOf('333 East 46th Street'));
    expect(html.indexOf('Listing courtesy of Compass')).toBeLessThan(html.indexOf('Presented By'));
    expect(html).toContain(SENTENCE);
    expect(html).toContain('Presented By');
    expect(html).toContain('Maya Allan');
  });

  it('a third-party listing the agent history stamped (agent_id / owner_client_id on a synced row) is STILL the other firm\'s: it is never "Exclusive listing by Mallan Real Estate Inc."', async () => {
    // syncAgentHistory writes agent_id onto Cotality rows that match the agent on the list side or the buyer side; the route does not even select the two columns any more
    const html = await preview(row({ agent_id: BigInt(5), owner_client_id: BigInt(9) }));
    expect(attributions(html)).toEqual(['Listing courtesy of Compass']);
    expect(html).not.toContain('Exclusive listing by');
    expect(html).toContain(SENTENCE);
  });

  it('does not ask Prisma for agent_id or owner_client_id (the DTO would read them as ownership)', async () => {
    await preview(row({}));
    const select = (mockFindUnique.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    expect(select).not.toHaveProperty('agent_id');
    expect(select).not.toHaveProperty('owner_client_id');
    expect(select.list_office_name).toBe(true);
    expect(select.rls_eligible).toBe(true);
  });

  it('a third-party listing with no office name is the neutral "REBNY RLS", never Mallan, and still carries the data sentence', async () => {
    const html = await preview(row({ list_office_name: null }));
    expect(attributions(html)).toEqual(['Listing courtesy of REBNY RLS']);
    expect(html).toContain(SENTENCE);
  });

  it.each([
    ['a website-only listing (rls_eligible false)', { listing_id: 'SL-0004', mls_id: null, rls_eligible: false, idx_display_yn: false, internet_entire_listing_display_yn: null, list_office_name: null }],
    ['a Mallan listing converted from a prospect (SL- id, rls_eligible true, no office stored)', { listing_id: 'SL-0005', mls_id: null, rls_eligible: true, list_office_name: null }],
    ['a Mallan rental (RL- id)', { listing_id: 'RL-0002', mls_id: null, rls_eligible: true, listing_type: 'rental', list_office_name: null }],
    ['a website-only listing whose id has no SL-/RL- prefix (rls_eligible false alone makes it Mallan\'s)', { listing_id: 'COM-7', mls_id: null, rls_eligible: false, list_office_name: null }],
  ])('%s: "Exclusive listing by Mallan Real Estate Inc." and no RLS data sentence (it is not RLS content)', async (_name, over) => {
    const html = await preview(row(over));
    expect(attributions(html)).toEqual([MALLAN_EXCLUSIVE_ATTRIBUTION]);
    expect(html).not.toContain(SENTENCE);
  });

  it('the attribution is escaped like every other value of the email', async () => {
    const html = await preview(row({ list_office_name: '<img src=x onerror=alert(1)> Realty' }));
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('Listing courtesy of &lt;img src=x onerror=alert(1)&gt; Realty');
  });
});

describe('the Mallan line the emails use is the line the public DTO gives the same listing', () => {
  it('a website-only row through buildSourceAndCompliance says exactly MALLAN_EXCLUSIVE_ATTRIBUTION', () => {
    const built = buildSourceAndCompliance({ rls_eligible: false, listing_id: 'SL-0004', agent_id: null, owner_client_id: null } as never, {} as never, false, undefined);
    expect(built._displayCompliance.attributionText).toBe(MALLAN_EXCLUSIVE_ATTRIBUTION);
    expect(built._displayCompliance.disclaimerRequired).toBe(false);
  });
});
