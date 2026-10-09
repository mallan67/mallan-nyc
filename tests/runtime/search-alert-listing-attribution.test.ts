/// <reference types="jest" />
/**
 * GET /api/cron/search-alerts: the email it sends names the listing broker of every listing and says when the newest of the data is from.
 *
 * The real cron handler and the real projection runner run against a mocked Prisma; the projection rows carry their Listing as the runner's own `include` returns it. The email that reaches the
 * mail service is read, so what the client receives is what is asserted (see tests/runtime/email-listing-attribution.test.ts for the template itself).
 */
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    savedSearch: { findMany: jest.fn(async () => [] as unknown[]), update: jest.fn(async () => ({})) },
    listingSearchProjection: { findMany: jest.fn(async () => [] as unknown[]), count: jest.fn(async () => 0) },
    listing: { findMany: jest.fn(async () => [] as unknown[]) },
    clientListingAction: { upsert: jest.fn(async () => ({})) },
    auditEvent: { create: jest.fn(async () => ({ id: BigInt(1) })) },
  },
}));
jest.mock('@/lib/search/search-run-recorder', () => ({ __esModule: true, recordSearchRun: jest.fn(async () => undefined) }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: jest.fn(async () => ({ success: true })) }));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { GET as alertsCronGET } from '@/app/api/cron/search-alerts/route';

const savedSearchFindMany = (prisma as unknown as { savedSearch: { findMany: jest.Mock } }).savedSearch.findMany;
const projectionFindMany = (prisma as unknown as { listingSearchProjection: { findMany: jest.Mock } }).listingSearchProjection.findMany;
const projectionCount = (prisma as unknown as { listingSearchProjection: { count: jest.Mock } }).listingSearchProjection.count;
const sendEmailMock = sendEmail as unknown as jest.Mock;
const CRON_SECRET = 'test-cron-secret';

const listingRow = (id: number, over: Record<string, unknown> = {}) => ({
  id: BigInt(id), listing_id: `RLS${id}`, status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condominium', list_price: '1850000',
  bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: '1320', borough: 'Manhattan', neighborhood: 'Tribeca',
  address: { streetNumber: '217', streetName: `W 57th Street ${id}`, city: 'New York', full: `217 W 57th Street ${id}` },
  modification_timestamp: new Date('2026-08-12T12:00:00Z'), internet_entire_listing_display_yn: true, internet_address_display_yn: true, list_office_name: 'Compass',
  ...over,
});
const search = {
  id: BigInt(5), name: 'Tribeca 2BR', criteria: { listing_type: 'sale' }, alert_enabled: true, alert_frequency: 'daily', alert_email: 'client@example.com', last_alert_sent: null, lead_id: null, lead: null,
  agent: { id: BigInt(42), first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc' },
};

async function runAlert(rows: Array<Record<string, unknown>>): Promise<string> {
  process.env.CRON_SECRET = CRON_SECRET;
  savedSearchFindMany.mockResolvedValueOnce([search]);
  projectionFindMany.mockResolvedValueOnce(rows.map((listing) => ({ listing })));
  projectionCount.mockResolvedValueOnce(rows.length);
  const res = await alertsCronGET(new NextRequest('http://test/api/cron/search-alerts', { headers: { authorization: `Bearer ${CRON_SECRET}` } }));
  expect(res.status).toBe(200);
  expect(sendEmailMock).toHaveBeenCalledTimes(1);
  return String(sendEmailMock.mock.calls[0][2]);
}

beforeEach(() => { sendEmailMock.mockClear(); savedSearchFindMany.mockReset().mockResolvedValue([]); projectionFindMany.mockReset().mockResolvedValue([]); projectionCount.mockReset().mockResolvedValue(0); });

describe('GET /api/cron/search-alerts: the email names each listing\'s broker', () => {
  it('three listings of three offices (one unknown): each is named, in order, and the unknown one is the neutral "REBNY RLS"', async () => {
    const html = await runAlert([
      listingRow(1, { list_office_name: 'Douglas Elliman Real Estate' }),
      listingRow(2, { list_office_name: 'Compass' }),
      listingRow(3, { list_office_name: null }),
    ]);
    const lines = [...html.matchAll(/Listing courtesy of[^<\n]*/g)].map((m) => m[0].trim());
    expect(lines).toEqual(['Listing courtesy of Douglas Elliman Real Estate', 'Listing courtesy of Compass', 'Listing courtesy of REBNY RLS']);
    expect(html.indexOf('217 W 57th Street 1')).toBeLessThan(html.indexOf('Douglas Elliman'));
    expect(html.indexOf('Douglas Elliman')).toBeLessThan(html.indexOf('217 W 57th Street 2'));
  });

  it('says the listing information is as of the NEWEST update among the listings it carries, in New York time', async () => {
    const html = await runAlert([
      listingRow(1, { modification_timestamp: new Date('2026-08-12T12:00:00Z') }),
      listingRow(2, { modification_timestamp: new Date('2026-09-30T03:30:00Z') }),       // 11:30 pm on Sep 29 in New York
      listingRow(3, { modification_timestamp: new Date('2026-09-01T00:00:00Z') }),
    ]);
    expect(html).toContain('Listing information as of September 29, 2026.');
    expect(html).not.toContain('Data last updated');
  });

  it('a listing whose update time is unknown or unreadable does not stop the others: the newest known time is used; none known, no claim', async () => {
    const some = await runAlert([listingRow(1, { modification_timestamp: null }), listingRow(2, { modification_timestamp: new Date('2026-09-15T16:00:00Z') }), listingRow(3, { modification_timestamp: new Date('not a date') })]);
    expect(some).toContain('Listing information as of September 15, 2026.');
    sendEmailMock.mockClear();
    const none = await runAlert([listingRow(1, { modification_timestamp: null })]);
    expect(none).not.toContain('as of');
    expect(none).not.toContain('Data last updated');
  });

  it('asks the projection runner for the listings\' office, and for nothing the search never read (no media)', async () => {
    await runAlert([listingRow(1)]);
    const args = projectionFindMany.mock.calls[0][0] as { include: { listing: { select: Record<string, unknown> } } };
    expect(args.include.listing.select.list_office_name).toBe(true);
    expect(args.include.listing.select).not.toHaveProperty('media');
  });
});
