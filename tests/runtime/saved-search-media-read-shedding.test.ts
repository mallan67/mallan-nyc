/// <reference types="jest" />
/**
 * `lib/search/core.ts` stopped hydrating the legacy `Listing.media` JSON.
 *
 * WHY (evidence, not preference)
 * ------------------------------
 * `SEARCH_RESULT_LISTING_SELECT` feeds exactly two entrypoints:
 *
 *   • `/api/cron/search-alerts` (vercel.json `30 7 * * *`) — the formatter reads
 *     only address / list_price / bedrooms_total / bathrooms_full / listing_id,
 *     and `listingAlertEmail` (lib/email/templates.ts:119-157) has NO image
 *     field. The media blob was fetched and thrown away, every row, every night.
 *   • `POST /api/crm/saved-searches/[id]/execute` — serialized it into the JSON
 *     body, where no first-party caller reads it: `MallanAPI.savedSearches.execute`
 *     (public/crm/js/core/api-client.js:553) has ZERO call sites.
 *
 * Up to 100 rows per request (`clampLimit`) carried a full media JSONB blob for
 * nothing. This is a READ-SHEDDING change, and it also removes an UNRESOLVED
 * media reader — raw `Listing.media` lets a consumer hero a FloorPlan via
 * `media[0]` (lib/media/listing-media-resolver.ts:7-31).
 *
 * WHAT THESE TESTS PROVE (behaviorally — real handlers + the real runner, mocked Prisma)
 * -------------------------------------------------------------------------------------
 *   1. the projection query issued to Prisma does not ask for `media`
 *   2. the execute route's JSON body has no `media` key, and every OTHER listing
 *      key it used to carry is still present and unchanged
 *   3. even when a row somehow arrives carrying a media blob, it cannot leak into
 *      the response — the serializer, not just the select, is media-free
 *   4. the alert cron still emails correctly without it, and the email still
 *      contains no image (so nothing downstream silently depended on the blob)
 *   5. address suppression (REBNY §2.05) is untouched by the change
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    savedSearch: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => [] as unknown[]),
      update: jest.fn(async () => ({})),
    },
    listingSearchProjection: {
      findMany: jest.fn(async () => [] as unknown[]),
      count: jest.fn(async () => 0),
    },
    clientListingAction: { upsert: jest.fn(async () => ({})) },
    auditEvent: { create: jest.fn(async () => ({ id: BigInt(1) })) },
  },
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({
    userId: BigInt(42),
    userType: 'agent',
    role: 'AGENT',
  })),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

jest.mock('@/lib/search/search-run-recorder', () => ({
  __esModule: true,
  recordSearchRun: jest.fn(async () => undefined),
}));

jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: jest.fn(async () => ({ success: true })),
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import * as searchCore from '@/lib/search/core';
import { POST as executePOST } from '@/app/api/crm/saved-searches/[id]/execute/route';
import { GET as alertsCronGET } from '@/app/api/cron/search-alerts/route';
import { makeRequest } from './helpers';

const savedSearchFindUnique = (prisma as unknown as {
  savedSearch: { findUnique: jest.Mock };
}).savedSearch.findUnique;
const savedSearchFindMany = (prisma as unknown as {
  savedSearch: { findMany: jest.Mock };
}).savedSearch.findMany;
const projectionFindMany = (prisma as unknown as {
  listingSearchProjection: { findMany: jest.Mock };
}).listingSearchProjection.findMany;
const projectionCount = (prisma as unknown as {
  listingSearchProjection: { count: jest.Mock };
}).listingSearchProjection.count;
const sendEmailMock = sendEmail as unknown as jest.Mock;

const CRON_SECRET = 'test-cron-secret';

/**
 * A Listing row as the projection `include` returns it. `media` is deliberately
 * PRESENT on the fixture though absent from `SEARCH_RESULT_LISTING_SELECT`: that
 * makes the assertions below prove the SERIALIZER drops it, not merely that the
 * select stopped fetching it.
 */
const listingRow = (over: Record<string, unknown> = {}) => ({
  id: BigInt(1),
  listing_id: 'RLS20059088',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: 'Condominium',
  list_price: '1850000',
  bedrooms_total: 2,
  bathrooms_full: 2,
  bathrooms_half: 0,
  living_area: '1320',
  borough: 'Manhattan',
  neighborhood: 'Tribeca',
  address: { streetNumber: '217', streetName: 'W 57th Street', city: 'New York', full: '217 W 57th Street' },
  media: [{ url: 'https://legacy.mallan.test/photos/RLS20059088/1.jpg', mediaType: 'Photo', order: 0 }],
  modification_timestamp: new Date('2026-08-12T12:00:00Z'),
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  ...over,
});

const ctx = (id = '99') => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  savedSearchFindUnique.mockResolvedValue(null);
  savedSearchFindMany.mockResolvedValue([]);
  projectionFindMany.mockResolvedValue([]);
  projectionCount.mockResolvedValue(0);
  sendEmailMock.mockResolvedValue({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// The query issued to Postgres
// ═════════════════════════════════════════════════════════════════════════════

describe('runProjectionListingSearch — the query no longer asks for the media blob', () => {
  it('the included Listing select omits `media` and keeps every other column', async () => {
    await searchCore.runProjectionListingSearch(
      prisma as unknown as Parameters<typeof searchCore.runProjectionListingSearch>[0],
      { listing_type: 'sale' },
    );

    const args = projectionFindMany.mock.calls[0][0] as {
      include: { listing: { select: Record<string, unknown> } };
    };
    const select = args.include.listing.select;

    expect(select).not.toHaveProperty('media');
    // Nothing else was dropped along with it — the alert formatter and the
    // address-suppression decision both read from this exact set.
    expect(Object.keys(select).sort()).toEqual(
      [
        'address',
        'bathrooms_full',
        'bathrooms_half',
        'bedrooms_total',
        'borough',
        'id',
        'internet_address_display_yn',
        'internet_entire_listing_display_yn',
        'list_price',
        'listing_id',
        'listing_type',
        'living_area',
        'modification_timestamp',
        'neighborhood',
        'property_sub_type',
        'property_type',
        'status',
      ].sort(),
    );
  });

  it('the fail-closed display gate on the projection is unchanged', async () => {
    await searchCore.runProjectionListingSearch(
      prisma as unknown as Parameters<typeof searchCore.runProjectionListingSearch>[0],
      { listing_type: 'sale' },
    );
    const args = projectionFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      participant_only_yn: false,
      listing: { owner_opt_out: false },
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/crm/saved-searches/[id]/execute — the response body
// ═════════════════════════════════════════════════════════════════════════════

async function executeBody(listing: Record<string, unknown>) {
  savedSearchFindUnique.mockResolvedValueOnce({
    id: BigInt(99),
    agent_id: BigInt(42),
    name: 'Tribeca 2BR',
    criteria: { listing_type: 'sale' },
  });
  projectionFindMany.mockResolvedValueOnce([{ listing }]);
  projectionCount.mockResolvedValueOnce(1);

  const res = await executePOST(
    makeRequest({
      url: 'http://test/api/crm/saved-searches/99/execute',
      method: 'POST',
      body: {},
    }),
    ctx(),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    listings: Record<string, unknown>[];
    total: number;
    limit: number;
    offset: number;
    searchName: string;
  };
}

describe('POST /api/crm/saved-searches/[id]/execute — response shape', () => {
  it('omits `media` while preserving every other listing key', async () => {
    const body = await executeBody(listingRow());
    const row = body.listings[0];

    // The one intentional removal.
    expect(row).not.toHaveProperty('media');
    // Everything else the route used to emit, byte-for-byte.
    expect(Object.keys(row).sort()).toEqual(
      [
        'address',
        'bathrooms_full',
        'bathrooms_half',
        'bedrooms_total',
        'borough',
        'id',
        'list_price',
        'listing_id',
        'listing_type',
        'living_area',
        'modification_timestamp',
        'neighborhood',
        'property_sub_type',
        'property_type',
        'status',
      ].sort(),
    );
    expect(row.id).toBe('1');
    expect(row.list_price).toBe('1850000');
    expect(row.living_area).toBe('1320');
  });

  it('the envelope around the listings is unchanged', async () => {
    const body = await executeBody(listingRow());
    expect(Object.keys(body).sort()).toEqual(
      ['limit', 'listings', 'offset', 'searchName', 'total'].sort(),
    );
    expect(body.total).toBe(1);
    expect(body.searchName).toBe('Tribeca 2BR');
  });

  it('a row carrying a media blob still cannot leak it — the SERIALIZER is media-free', async () => {
    // Belt-and-braces against a future re-widening of the select: even handed a
    // populated `media` value, the response must not republish an unresolved
    // legacy blob that a consumer could `media[0]` into a FloorPlan hero.
    const body = await executeBody(
      listingRow({
        media: [
          { url: 'https://legacy.mallan.test/Media/Property/DOCUMENT-Pdf/1/plan', order: 0 },
          { url: 'https://legacy.mallan.test/photos/RLS20059088/2.jpg', mediaType: 'Photo', order: 1 },
        ],
      }),
    );
    expect(JSON.stringify(body)).not.toContain('DOCUMENT-Pdf');
    expect(body.listings[0]).not.toHaveProperty('media');
  });

  it('REBNY §2.05 address suppression is untouched', async () => {
    const body = await executeBody(listingRow({ internet_address_display_yn: null }));
    const address = body.listings[0].address as Record<string, unknown>;
    expect(address.suppressed).toBe(true);
    expect(address.label).toBe('Tribeca, New York (Address Available on Request)');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/cron/search-alerts — the path that provably discarded the blob
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/cron/search-alerts — still emails correctly without the media blob', () => {
  it('sends the alert and the email contains no image at all', async () => {
    savedSearchFindMany.mockResolvedValueOnce([
      {
        id: BigInt(5),
        name: 'Tribeca 2BR',
        criteria: { listing_type: 'sale' },
        alert_enabled: true,
        alert_frequency: 'daily',
        alert_email: 'client@example.com',
        last_alert_sent: null,
        lead_id: null,
        lead: null,
        agent: { id: BigInt(42), first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc' },
      },
    ]);
    projectionFindMany.mockResolvedValueOnce([{ listing: listingRow() }]);
    projectionCount.mockResolvedValueOnce(1);

    const res = await alertsCronGET(
      new NextRequest('http://test/api/cron/search-alerts', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; errored: number };
    expect(body.sent).toBe(1);
    expect(body.errored).toBe(0);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = String(sendEmailMock.mock.calls[0][2]);
    // The formatter's four fields still render from the media-free select.
    expect(html).toContain('217 W 57th Street');
    expect(html).toContain('$1,850,000');
    expect(html).toContain('2 bed');
    expect(html).toContain('2 bath');
    expect(html).toContain('/listing/RLS20059088');
    // The template has no image slot — this is WHY the blob was pure waste.
    expect(html).not.toContain('<img');
  });

  it('address suppression still governs what the alert email prints', async () => {
    savedSearchFindMany.mockResolvedValueOnce([
      {
        id: BigInt(5),
        name: 'Tribeca 2BR',
        criteria: { listing_type: 'sale' },
        alert_enabled: true,
        alert_frequency: 'daily',
        alert_email: 'client@example.com',
        last_alert_sent: null,
        lead_id: null,
        lead: null,
        agent: { id: BigInt(42), first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc' },
      },
    ]);
    projectionFindMany.mockResolvedValueOnce([
      { listing: listingRow({ internet_address_display_yn: null }) },
    ]);
    projectionCount.mockResolvedValueOnce(1);

    await alertsCronGET(
      new NextRequest('http://test/api/cron/search-alerts', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    const html = String(sendEmailMock.mock.calls[0][2]);
    expect(html).toContain('Address Available on Request');
    expect(html).not.toContain('217 W 57th Street');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Dead-code removal
// ═════════════════════════════════════════════════════════════════════════════

describe('lib/search/core — the dead Listing-backed runner is gone', () => {
  it('no longer exports `runListingSearch`', () => {
    // HONEST SCOPE: this is a module-SURFACE assertion, not a behavior claim.
    // `runListingSearch` had zero call sites repo-wide (a grep for
    // `runListingSearch(` returned only its own definition) after PR 5D/5E moved
    // both real callers to `runProjectionListingSearch`. It survived only as a
    // second, drifting copy of the display-gate + pagination policy. This guard
    // makes a silent re-introduction fail loudly rather than quietly re-forking
    // that policy.
    expect(searchCore).not.toHaveProperty('runListingSearch');
    expect(searchCore).toHaveProperty('runProjectionListingSearch');
  });
});
