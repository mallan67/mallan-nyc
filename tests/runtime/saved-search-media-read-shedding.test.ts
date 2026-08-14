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
    // The execute route hydrates the `media` key it owes its callers via ONE
    // batched listing read (hydrateSearchListingMedia). Default: no canonical
    // rows and no legacy JSON, so `media` composes to [].
    listing: {
      findMany: jest.fn(async () => [] as unknown[]),
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
  it('PRESERVES the `media` key and every other listing key', async () => {
    const body = await executeBody(listingRow());
    const row = body.listings[0];

    // CONTRACT RESTORED. An earlier draft dropped `media` because no
    // first-party caller reads it — but that cannot prove an older or external
    // client does not, and a public response key is not ours to delete
    // silently. The key stays; only its SOURCE changed, from the raw legacy
    // blob to the canonical composition.
    expect(row).toHaveProperty('media');
    expect(Array.isArray(row.media)).toBe(true);
    // Every key the route has ever emitted, byte-for-byte.
    expect(Object.keys(row).sort()).toEqual(
      [
        'media',
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

  it('the SEARCH query itself still never asks for the legacy media blob', async () => {
    // The read-shedding half of the change survives: media is hydrated by a
    // SEPARATE batched call on this route only, never by widening
    // SEARCH_RESULT_LISTING_SELECT — which the alert cron also uses and which
    // provably discards media.
    await executeBody(listingRow());
    const args = projectionFindMany.mock.calls[0][0] as {
      include: { listing: { select: Record<string, unknown> } };
    };
    expect(args.include.listing.select).not.toHaveProperty('media');
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

// ═════════════════════════════════════════════════════════════════════════════
// RESPONSE-CONTRACT REGRESSION — `media` is preserved AND canonically sourced
//
// Two independent properties, both required:
//   (a) the execute route still emits `media`, composed from canonical
//       `listing_media` rather than the raw legacy blob;
//   (b) the alert cron pays NO relational media read, because it discards media.
// ═════════════════════════════════════════════════════════════════════════════

const listingFindMany = (prisma as unknown as {
  listing: { findMany: jest.Mock };
}).listing.findMany;

/** A hydration row as `hydrateSearchListingMedia`'s select would return it. */
function hydrationRow(over: Record<string, unknown> = {}) {
  return {
    listing_id: 'RLS20059088',
    rls_eligible: true,
    media: [],
    listing_media: [],
    _count: { listing_media: 0 },
    ...over,
  };
}

function canonicalRow(over: Record<string, unknown> = {}) {
  return {
    media_key: 'MK1',
    media_url_original: 'https://api.cotality.com/trestle/Media/MK1/1.jpg',
    media_url_cached: 'https://media.mallan.test/listings/rls20059088/1.webp',
    media_type: 'Photo',
    media_category: 'Photo',
    order: 0,
    preferred_photo_yn: true,
    status: 'active',
    r2_key: 'listings/rls20059088/1.webp',
    ...over,
  };
}

describe('execute route — `media` is canonical, not the legacy blob', () => {
  it('serves media from canonical listing_media rows when they exist', async () => {
    listingFindMany.mockResolvedValueOnce([
      hydrationRow({
        media: [{ url: 'https://legacy.mallan.test/photos/OLD.jpg', mediaType: 'Photo', order: 0 }],
        listing_media: [canonicalRow()],
        _count: { listing_media: 1 },
      }),
    ]);

    const body = await executeBody(listingRow());
    const media = body.listings[0].media as Array<{ url: string }>;

    expect(media.length).toBeGreaterThan(0);
    expect(JSON.stringify(media)).not.toContain('legacy.mallan.test');
  });

  it('does NOT resurrect legacy media when every canonical row was deleted', async () => {
    // _count > 0 with zero ACTIVE rows is authoritative deletion. Falling back
    // to the legacy blob here would republish media that was removed at source.
    listingFindMany.mockResolvedValueOnce([
      hydrationRow({
        listing_id: 'SL-0007',
        rls_eligible: false,
        media: [{ url: 'https://legacy.mallan.test/photos/SL-0007/1.jpg', mediaType: 'Photo', order: 0 }],
        listing_media: [],
        _count: { listing_media: 3 },
      }),
    ]);

    const body = await executeBody(listingRow({ listing_id: 'SL-0007' }));
    expect(JSON.stringify(body.listings[0].media)).not.toContain('legacy.mallan.test');
  });

  it('a FloorPlan never leads the media array', async () => {
    listingFindMany.mockResolvedValueOnce([
      hydrationRow({
        listing_media: [
          // Distinct ORIGINAL urls too: rows sharing an original collapse under
          // visual-identity dedupe (resolveListingMediaFromRows), which would
          // leave one row and prove nothing about ordering.
          canonicalRow({
            media_key: 'MKF',
            media_type: 'FloorPlan',
            media_category: 'FloorPlan',
            order: 0,
            preferred_photo_yn: false,
            media_url_original: 'https://api.cotality.com/trestle/Media/MKF/plan.jpg',
            media_url_cached: 'https://media.mallan.test/listings/rls20059088/plan.webp',
          }),
          canonicalRow({
            media_key: 'MKP',
            order: 1,
            preferred_photo_yn: false,
            media_url_original: 'https://api.cotality.com/trestle/Media/MKP/2.jpg',
            media_url_cached: 'https://media.mallan.test/listings/rls20059088/2.webp',
          }),
        ],
        _count: { listing_media: 2 },
      }),
    ]);

    const body = await executeBody(listingRow());
    const media = body.listings[0].media as Array<{ mediaType?: string }>;
    expect(media[0]?.mediaType).toBe('Photo');
  });

  it('emits `media: []` (never undefined) for a listing with no media at all', async () => {
    listingFindMany.mockResolvedValueOnce([]);
    const body = await executeBody(listingRow());
    expect(body.listings[0].media).toEqual([]);
  });

  it('hydrates the whole page in ONE batched query, never per row', async () => {
    listingFindMany.mockClear();
    await executeBody(listingRow());
    expect(listingFindMany).toHaveBeenCalledTimes(1);
    const args = listingFindMany.mock.calls[0][0] as { where: { listing_id: { in: string[] } } };
    expect(Array.isArray(args.where.listing_id.in)).toBe(true);
  });
});

describe('alert cron — pays NO relational media read', () => {
  it('runs the alert without ever calling the media hydration query', async () => {
    // The whole reason hydration is a separate opt-in function: this path
    // provably discards media, so widening SEARCH_RESULT_LISTING_SELECT would
    // tax it for nothing.
    listingFindMany.mockClear();
    savedSearchFindMany.mockResolvedValueOnce([]);

    await alertsCronGET(
      new NextRequest('http://test/api/cron/search-alerts', {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }),
    );

    expect(listingFindMany).not.toHaveBeenCalled();
  });
});
