/// <reference types="jest" />
/**
 * Two CRM routes moved from reading the legacy `Listing.media` JSON RAW to the
 * canonical composer (`composeDbPublicMedia`):
 *
 *   app/api/crm/listing-sends/route.ts — the listing-card hero in the client email
 *   app/api/crm/listings/route.ts      — the `media` array the CRM grid renders
 *
 * WHAT THESE TESTS PROVE (behaviorally — real handlers, mocked Prisma; NOT source greps)
 * -------------------------------------------------------------------------------------
 *   1. relational `listing_media` rows present  → the payload comes from THEM
 *   2. no relational row ever imported          → the legacy JSON is still the fallback
 *   3. rows existed but are all deleted         → the legacy JSON must NOT resurrect
 *   4. a FloorPlan can never become the hero when a Photo exists
 *   5. the routes' response/auth/gate contracts are unchanged
 *
 * (3) is the compliance-critical one. Both routes select ACTIVE-ONLY relational rows,
 * so `listing_media.length` reflects the ACTIVE count, not existence — deriving
 * `hadRelationalRows` from it would read "all deleted" as "never imported" and
 * republish media a Mallan agent intentionally deleted
 * (lib/media/db-media-composition.ts:55-67). The signal must come from the all-status
 * `_count.listing_media`. These tests fail if a future edit reverts to length-based
 * derivation, because scenario (3) then emits the legacy URL.
 *
 * Both surfaces are Mallan-heavy by construction: `/api/crm/listings` lists SL-/RL-
 * CRM exclusives (plus closed Trestle deals) and `/api/crm/listing-sends` is how an
 * agent emails one to a client — so the ownership class whose deletions are
 * authoritative is exactly the traffic these routes carry.
 */

jest.mock('@/lib/prisma', () => {
  const mock: Record<string, unknown> = {
    listing: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => [] as unknown[]),
      count: jest.fn(async () => 0),
    },
    auditEvent: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: BigInt(7), created_at: new Date('2026-08-13T00:00:00Z') })),
    },
    agent: {
      findUnique: jest.fn(async () => ({
        first_name: 'Maya',
        last_name: 'Allan',
        email: 'maya@mallan.nyc',
      })),
    },
    clientListingAction: { upsert: jest.fn(async () => ({})) },
    lead: {
      findUnique: jest.fn(async () => ({ first_name: 'Test', last_name: 'Client' })),
      findMany: jest.fn(async () => [
        { id: BigInt(1), first_name: 'Test', last_name: 'Client', email: 'client@example.com' },
      ]),
    },
    followUpTask: { create: jest.fn(async () => ({})) },
  };
  // The route's write block runs inside an interactive transaction; `tx` is the
  // same mock so `tx.auditEvent.create` etc. resolve.
  mock.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(mock));
  return { __esModule: true, default: mock };
});

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

jest.mock('@/lib/crm/access', () => ({
  __esModule: true,
  assertLeadIdsAccess: jest.fn(async () => ({ response: null })),
}));

// Capture the rendered email instead of sending it. The `<img src>` in this HTML
// is the actual observable behavior under test for the listing-sends route.
jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: jest.fn(async () => ({ success: true })),
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { POST as listingSendsPOST } from '@/app/api/crm/listing-sends/route';
import { GET as crmListingsGET } from '@/app/api/crm/listings/route';
import { makeRequest } from './helpers';

/** The CRM grid GET reads `req.nextUrl.searchParams`, so it needs a real NextRequest. */
const gridRequest = (query = '') =>
  new NextRequest(`http://test/api/crm/listings${query}`);

const listingFindUnique = (prisma as unknown as {
  listing: { findUnique: jest.Mock };
}).listing.findUnique;
const listingFindMany = (prisma as unknown as {
  listing: { findMany: jest.Mock };
}).listing.findMany;
const listingCount = (prisma as unknown as {
  listing: { count: jest.Mock };
}).listing.count;
const sendEmailMock = sendEmail as unknown as jest.Mock;

// ── Fixture URLs ─────────────────────────────────────────────────────────────
// Deliberately NON-allowlisted hosts, so `toPublicMediaUrl` passes them through
// unchanged (lib/media/proxy-url-policy.ts) and each assertion compares an exact
// URL rather than a proxy wrapper. The R2 `{timestamp}-{variant}.webp` shape is
// what `pickFullSizeUrl` / `visualIdentity` key on.
const R2_HERO = 'https://media.mallan.test/listings/sl-0011/1779898434281-hero.webp';
const R2_CARD = 'https://media.mallan.test/listings/sl-0011/1779898434281-card.webp';
const R2_FLOORPLAN = 'https://media.mallan.test/listings/sl-0011/1779898434000-hero.webp';
const LEGACY_URL = 'https://legacy.mallan.test/photos/SL-0011/1.jpg';

/** An ACTIVE relational row, in the exact column shape both routes now select. */
const activeRow = (
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  media_key: 'crm:SL-0011:1',
  media_url_original: R2_HERO,
  media_url_cached: R2_CARD,
  media_type: 'Photo',
  media_category: 'Photo',
  media_classification: null,
  order: 0,
  preferred_photo_yn: false,
  status: 'active',
  ...over,
});

/** A FloorPlan row placed FIRST in provider order — the raw-`media[0]` trap. */
const floorplanRow = (
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> =>
  activeRow({
    media_key: 'crm:SL-0011:fp',
    media_url_original: R2_FLOORPLAN,
    media_url_cached: null,
    media_type: 'FloorPlan',
    media_category: 'FloorPlan',
    order: 0,
    ...over,
  });

/** The legacy `Listing.media` JSON shape the sync writes. */
const legacyJson = [{ url: LEGACY_URL, mediaType: 'Photo', order: 0 }];

type MediaFixture = {
  listing_media: unknown[];
  count: number;
  legacy: unknown[];
};

beforeEach(() => {
  jest.clearAllMocks();
  listingFindUnique.mockResolvedValue(null);
  listingFindMany.mockResolvedValue([]);
  listingCount.mockResolvedValue(0);
  sendEmailMock.mockResolvedValue({ success: true });
});

// ═════════════════════════════════════════════════════════════════════════════
// /api/crm/listing-sends — the email listing-card hero
// ═════════════════════════════════════════════════════════════════════════════

/** A Mallan CRM exclusive that passes every REBNY distribution gate in the route. */
function sendableListing(media: MediaFixture): Record<string, unknown> {
  return {
    id: BigInt(11),
    listing_id: 'SL-0011',
    address: { full: '350 East 62nd Street, Apt 4B' },
    list_price: 1_250_000,
    bedrooms_total: 2,
    bathrooms_full: 2,
    living_area: 1100,
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    media: media.legacy,
    listing_media: media.listing_media,
    _count: { listing_media: media.count },
    // Mallan-owned: SL- namespace already qualifies; rls_eligible mirrors a
    // website-only exclusive so BOTH ownership signals point the same way.
    rls_eligible: false,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
  };
}

/** Run the send and return the `src` of the email card's `<img>`, or null when absent. */
async function sentEmailHeroUrl(media: MediaFixture): Promise<string | null> {
  listingFindUnique.mockResolvedValueOnce(sendableListing(media));
  const res = await listingSendsPOST(
    makeRequest({
      url: 'http://test/api/crm/listing-sends',
      method: 'POST',
      body: { listing_id: 'SL-0011', client_ids: ['1'], sent_via: 'crm' },
    }),
  );
  // A 201 with one successful send, or the media assertion below is vacuous.
  expect(res.status).toBe(201);
  const body = (await res.json()) as { email: { sent: number } };
  expect(body.email.sent).toBe(1);

  expect(sendEmailMock).toHaveBeenCalledTimes(1);
  const html = String(sendEmailMock.mock.calls[0][2]);
  const m = html.match(/<img src="([^"]*)"/);
  return m ? m[1] : null;
}

describe('/api/crm/listing-sends — the client email hero reads the canonical composition', () => {
  it('relational rows present → the hero is the relational URL, not the legacy JSON', async () => {
    const hero = await sentEmailHeroUrl({
      listing_media: [activeRow()],
      count: 1,
      legacy: legacyJson,
    });
    expect(hero).toBe(R2_HERO);
    expect(hero).not.toBe(LEGACY_URL);
  });

  it('no relational row ever imported (_count 0) → falls back to the legacy JSON', async () => {
    const hero = await sentEmailHeroUrl({ listing_media: [], count: 0, legacy: legacyJson });
    expect(hero).toBe(LEGACY_URL);
  });

  it('rows existed and were ALL deleted (_count 3, 0 active) → does NOT resurrect the legacy JSON', async () => {
    // The active-only select returns []. Only `_count` distinguishes this from the
    // never-imported case above — the whole point of selecting it. A resurrected
    // photo here would be a deleted Mallan image mailed to a client.
    const hero = await sentEmailHeroUrl({ listing_media: [], count: 3, legacy: legacyJson });
    expect(hero).toBeNull();
    expect(hero).not.toBe(LEGACY_URL);
  });

  it('a FloorPlan never becomes the email hero when a Photo exists', async () => {
    // Pre-migration this route took `media[0]` straight off the provider-ordered
    // array, so the floor plan below (order 0) WAS the emailed card image.
    const hero = await sentEmailHeroUrl({
      listing_media: [floorplanRow(), activeRow({ media_key: 'crm:SL-0011:photo', order: 1 })],
      count: 2,
      legacy: [],
    });
    expect(hero).toBe(R2_HERO);
    expect(hero).not.toBe(R2_FLOORPLAN);
  });

  it('a FloorPlan can never hero out of the LEGACY JSON either', async () => {
    // The legacy JSON is the composer's fallback input, so it goes through the
    // same classify → photo-first pipeline. A `/DOCUMENT-Pdf/` first item (the
    // empty-MediaCategory shape ~2,000 legacy rows carry) must not lead.
    const LEGACY_DOC = 'https://legacy.mallan.test/Media/Property/DOCUMENT-Pdf/1/floorplan';
    const hero = await sentEmailHeroUrl({
      listing_media: [],
      count: 0,
      legacy: [
        { url: LEGACY_DOC, order: 0 },
        { url: LEGACY_URL, mediaType: 'Photo', order: 1 },
      ],
    });
    expect(hero).toBe(LEGACY_URL);
    expect(hero).not.toBe(LEGACY_DOC);
  });

  it('a FloorPlan-only listing sends no image rather than a floor plan', async () => {
    // DELIBERATE behavior change: the hero is picked as `mediaType === 'Photo'`,
    // matching the documented card rule (listing-media-resolver.ts:434-448).
    // `listingSendEmail` simply omits the <img> when photoUrl is undefined.
    const hero = await sentEmailHeroUrl({
      listing_media: [floorplanRow()],
      count: 1,
      legacy: [],
    });
    expect(hero).toBeNull();
  });

  it('the REBNY distribution gate still blocks a restricted listing before any send', async () => {
    listingFindUnique.mockResolvedValueOnce({
      ...sendableListing({ listing_media: [activeRow()], count: 1, legacy: [] }),
      participant_only: true,
    });
    const res = await listingSendsPOST(
      makeRequest({
        url: 'http://test/api/crm/listing-sends',
        method: 'POST',
        body: { listing_id: 'SL-0011', client_ids: ['1'] },
      }),
    );
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('the response contract is unchanged', async () => {
    listingFindUnique.mockResolvedValueOnce(
      sendableListing({ listing_media: [activeRow()], count: 1, legacy: [] }),
    );
    const res = await listingSendsPOST(
      makeRequest({
        url: 'http://test/api/crm/listing-sends',
        method: 'POST',
        body: { listing_id: 'SL-0011', client_ids: ['1'] },
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['client_ids', 'created_at', 'email', 'listing_id', 'send_id', 'tracked_urls'].sort(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// /api/crm/listings — the grid's `media` array
// ═════════════════════════════════════════════════════════════════════════════

/** A CRM grid row in the shape the widened select returns. */
function gridListing(media: MediaFixture, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: BigInt(11),
    listing_id: 'SL-0011',
    mls_id: null,
    agent_id: BigInt(42),
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condominium',
    list_price: 1_250_000,
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 1100,
    borough: 'Manhattan',
    neighborhood: 'Upper East Side',
    address: { StreetNumber: '350', StreetName: 'East 62nd Street' },
    features: null,
    media: media.legacy,
    listing_media: media.listing_media,
    _count: { listing_media: media.count },
    list_agent_full_name: 'Maya Allan',
    list_office_name: 'Mallan Real Estate Inc.',
    list_agent_email: null,
    list_agent_direct_phone: null,
    list_office_mls_id: null,
    list_agent_mls_id: null,
    co_list_office_mls_id: null,
    co_list_agent_mls_id: null,
    rls_eligible: false,
    commercial_sub_type: null,
    commercial_ownership: null,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: null,
    status_changed_at: null,
    first_active_date: null,
    days_on_market: null,
    cumulative_days_on_market: null,
    expiration_date: null,
    sync_status: null,
    modification_timestamp: new Date('2026-08-13T00:00:00Z'),
    created_at: new Date('2026-08-01T00:00:00Z'),
    updated_at: new Date('2026-08-12T00:00:00Z'),
    ...over,
  };
}

interface GridMediaItem {
  url: string;
  thumbUrl: string;
  mediaType: string;
  order: number;
  isPrimary: boolean;
}

async function gridMedia(
  media: MediaFixture,
  over: Record<string, unknown> = {},
): Promise<GridMediaItem[]> {
  listingFindMany.mockResolvedValueOnce([gridListing(media, over)]);
  listingCount.mockResolvedValueOnce(1);
  const res = await crmListingsGET(gridRequest('?limit=50'));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { listings: { media: GridMediaItem[] }[] };
  expect(body.listings).toHaveLength(1);
  return body.listings[0].media;
}

describe('/api/crm/listings — the grid media array reads the canonical composition', () => {
  it('relational rows present → media comes from THEM, not the legacy JSON', async () => {
    const media = await gridMedia({ listing_media: [activeRow()], count: 1, legacy: legacyJson });
    expect(media[0].url).toBe(R2_HERO);
    expect(media.some((m) => m.url === LEGACY_URL)).toBe(false);
  });

  it('no relational row ever imported (_count 0) → falls back to the legacy JSON', async () => {
    const media = await gridMedia({ listing_media: [], count: 0, legacy: legacyJson });
    expect(media[0].url).toBe(LEGACY_URL);
  });

  it('rows existed and were ALL deleted (_count 3, 0 active) → media is authoritatively empty', async () => {
    const media = await gridMedia({ listing_media: [], count: 3, legacy: legacyJson });
    expect(media).toEqual([]);
    expect(media.some((m) => m.url === LEGACY_URL)).toBe(false);
  });

  it('a FloorPlan never leads the grid media array when a Photo exists', async () => {
    // The grid reads `media[0].MediaURL || media[0].url`
    // (public/crm/js/manage/manage-listings.js:56-58), so position 0 IS the
    // rendered thumbnail. Pre-migration that was raw provider order.
    const media = await gridMedia({
      listing_media: [floorplanRow(), activeRow({ media_key: 'crm:SL-0011:photo', order: 1 })],
      count: 2,
      legacy: [],
    });
    expect(media[0].mediaType).toBe('Photo');
    expect(media[0].url).toBe(R2_HERO);
    expect(media[0].isPrimary).toBe(true);
    // The floor plan is still in the gallery — just never first.
    expect(media.map((m) => m.mediaType)).toEqual(['Photo', 'FloorPlan']);
  });

  it('a third-party Trestle row with unknown relational state still falls back to its Cotality JSON', async () => {
    // `_count` 0 + mls_id set + rls_eligible true ⇒ NOT Mallan-owned, so the
    // legacy JSON (Cotality-sourced) is always a safe fallback — a closed
    // Trestle deal in the grid must not lose its photos.
    const media = await gridMedia(
      { listing_media: [], count: 0, legacy: legacyJson },
      { listing_id: 'RLS20059088', mls_id: 'RLS', rls_eligible: true, status: 'Closed' },
    );
    expect(media[0].url).toBe(LEGACY_URL);
  });

  it('the grid response contract is unchanged and leaks no query-only fields', async () => {
    listingFindMany.mockResolvedValueOnce([
      gridListing({ listing_media: [activeRow()], count: 1, legacy: [] }),
    ]);
    listingCount.mockResolvedValueOnce(1);
    const res = await crmListingsGET(gridRequest());
    const body = (await res.json()) as {
      listings: Record<string, unknown>[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(Object.keys(body).sort()).toEqual(['limit', 'listings', 'offset', 'total']);
    const row = body.listings[0];
    // `listing_media` / `_count` are QUERY inputs — they must never reach the client.
    expect(row).not.toHaveProperty('listing_media');
    expect(row).not.toHaveProperty('_count');
    // Every previously-serialized key survives.
    expect(row.id).toBe('11');
    expect(row.agent_id).toBe('42');
    expect(row.assigned_agent_id).toBe('42');
    expect(row.list_price).toBe('1250000');
    expect(row.living_area).toBe('1100');
    expect(row.listing_id).toBe('SL-0011');
    expect(Array.isArray(row.media)).toBe(true);
  });

  it('ownership enforcement still scopes a non-broker to their own listings', async () => {
    listingFindMany.mockResolvedValueOnce([]);
    listingCount.mockResolvedValueOnce(0);
    await crmListingsGET(gridRequest());
    const where = listingFindMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.agent_id).toBe(BigInt(42));
  });

  it('the widened select fetches active-only rows PLUS the all-status _count', async () => {
    // The only structural assertion in this file: `hadRelationalRows` is
    // meaningless unless the query actually supplies an all-status count
    // alongside an active-only row set. The behavioral tests above cannot
    // distinguish "count selected" from "count happened to be right".
    listingFindMany.mockResolvedValueOnce([]);
    listingCount.mockResolvedValueOnce(0);
    await crmListingsGET(gridRequest());
    const select = listingFindMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.listing_media).toMatchObject({ where: { status: 'active' } });
    expect(select._count).toEqual({ select: { listing_media: true } });
  });
});
