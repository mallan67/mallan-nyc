/// <reference types="jest" />
/**
 * Two PUBLIC routes moved from reading the legacy `Listing.media` JSON directly to
 * the canonical composer (`composeDbPublicMedia`):
 *
 *   app/api/open-houses/route.ts       — local (Mallan) open-house card hero
 *   app/api/listings/similar/route.ts  — DB-first comp card photo + photosCount
 *
 * WHAT THESE TESTS PROVE (behaviorally — real handlers, mocked Prisma; NOT source greps)
 * -------------------------------------------------------------------------------------
 *   1. relational `listing_media` rows present  → the payload comes from THEM
 *   2. no relational rows ever imported         → the legacy JSON is still the fallback
 *   3. rows existed but are all deleted         → the legacy JSON must NOT resurrect
 *   4. a FloorPlan can never become the hero when a Photo exists
 *
 * (3) is the compliance-critical one. Both routes select ACTIVE-ONLY relational rows,
 * so `listing_media.length` reflects the ACTIVE count, not existence — deriving
 * `hadRelationalRows` from it would read "all deleted" as "never imported" and
 * republish photos a Mallan agent intentionally deleted
 * (lib/media/db-media-composition.ts:55-67). The signal must come from the all-status
 * `_count.listing_media`. These tests fail if a future edit reverts to length-based
 * derivation, because scenario (3) then emits the legacy URL.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    showing: { findMany: jest.fn(async () => [] as unknown[]) },
    listing: {
      findMany: jest.fn(async () => [] as unknown[]),
      findUnique: jest.fn(async () => null),
    },
  },
}));

// No live Cotality in tests. The open-houses Trestle branch short-circuits on an
// empty Mallan ref set; the similar route's Trestle fallback is never reached
// because the DB branch always yields >= 3 ranked comps here.
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'test-token') }));
jest.mock('@/lib/idx/fetch', () => ({ fetchListingMedia: jest.fn(async () => [] as unknown[]) }));

// The Next data cache is infrastructure, not behavior under test: unwrap it so the
// assertions exercise `computeSimilarListings` itself. Only the three symbols the
// route imports are stubbed.
jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  cachedPublicRead: <A extends unknown[], T>(fn: (...args: A) => Promise<T>) => fn,
  listingCacheTag: (id: string) => `listing:${id}`,
  SEARCH_CACHE_TAG: 'search',
}));

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { GET as openHousesGET } from '@/app/api/open-houses/route';
import { GET as similarGET } from '@/app/api/listings/similar/route';

const showingFindMany = (prisma as unknown as {
  showing: { findMany: jest.Mock };
}).showing.findMany;
const listingFindMany = (prisma as unknown as {
  listing: { findMany: jest.Mock };
}).listing.findMany;

// ── Fixture URLs ─────────────────────────────────────────────────────────────
// Deliberately NON-allowlisted hosts, so `toPublicMediaUrl` passes them through
// unchanged (lib/media/proxy-url-policy.ts:96-102) and each assertion compares an
// exact URL rather than a proxy wrapper. The R2 `{timestamp}-{variant}.webp` shape
// is what `pickFullSizeUrl` / `visualIdentity` key on.
const R2_HERO = 'https://media.mallan.test/listings/sl-0007/1779898434281-hero.webp';
const R2_CARD = 'https://media.mallan.test/listings/sl-0007/1779898434281-card.webp';
const R2_HERO_2 = 'https://media.mallan.test/listings/sl-0007/1779898434999-hero.webp';
const R2_FLOORPLAN = 'https://media.mallan.test/listings/sl-0007/1779898434000-hero.webp';
const LEGACY_URL = 'https://legacy.mallan.test/photos/SL-0007/1.jpg';

/** An ACTIVE relational row, in the exact column shape both routes now select. */
const activeRow = (
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  media_key: 'crm:SL-0007:1',
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

/** The legacy `Listing.media` JSON shape the sync writes. */
const legacyJson = [{ url: LEGACY_URL, mediaType: 'Photo', order: 0 }];

// ── /api/open-houses fixtures ────────────────────────────────────────────────
// A website-only Mallan exclusive (rls_eligible=false) — the ONLY kind of row the
// local branch emits (`isMallanOwnedLocalListing`), and the ownership class whose
// deletions are authoritative.
function localShowing(media: {
  listing_media: unknown[];
  count: number;
  legacy: unknown[];
}): Record<string, unknown> {
  const date = new Date();
  date.setDate(date.getDate() + 7); // future → passes the `date >= today` filter
  return {
    id: 1,
    date,
    time: '10:00 AM - 12:00 PM',
    notes: null,
    agent: { full_name: 'Maya Allan', phone: '646-258-4460' },
    listing: {
      listing_id: 'SL-0007',
      status: 'Active',
      address: { StreetNumber: '350', StreetName: 'East 62nd Street', PostalCode: '10065' },
      city: 'New York',
      neighborhood: 'Upper East Side',
      list_price: 1_250_000,
      bedrooms_total: 2,
      bathrooms_full: 2,
      bathrooms_half: 0,
      living_area: 1100,
      property_type: 'Residential',
      property_sub_type: null,
      features: null,
      media: media.legacy,
      listing_media: media.listing_media,
      _count: { listing_media: media.count },
      list_agent_full_name: null,
      list_office_name: 'Mallan Real Estate Inc.',
      list_agent_email: null,
      list_agent_direct_phone: null,
      list_office_mls_id: null,
      list_agent_mls_id: null,
      co_list_office_mls_id: null,
      co_list_agent_mls_id: null,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: false, // website-only: false BY DEFINITION
      internet_address_display_yn: true,
      rls_eligible: false,
    },
  };
}

async function openHouseImage(media: Parameters<typeof localShowing>[0]): Promise<string> {
  showingFindMany.mockResolvedValueOnce([localShowing(media)]);
  const res = await openHousesGET();
  const body = (await res.json()) as { openHouses: { image: string; source: string }[] };
  const local = body.openHouses.filter((oh) => oh.source === 'local');
  expect(local).toHaveLength(1); // the row must survive every gate, or the media assertion is vacuous
  return local[0].image;
}

// ── /api/listings/similar fixtures ───────────────────────────────────────────
// The DB branch is taken only when >= 3 comps rank; `filler` supplies the other two
// so each test's subject row is the only thing that varies.
function comp(
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: BigInt(1),
    listing_id: 'RLS10000001',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: null,
    list_price: 1_000_000,
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 1100,
    neighborhood: 'Chelsea',
    address: { StreetNumber: '100', StreetName: 'West 20th Street', PostalCode: '10011' },
    features: null,
    media: [],
    listing_media: [activeRow({ media_key: '900001' })],
    _count: { listing_media: 1 },
    internet_address_display_yn: true,
    rls_eligible: true,
    list_office_name: 'Some Brokerage',
    modification_timestamp: null,
    updated_at: null,
    ...over,
  };
}

const filler = () => [
  comp({
    listing_id: 'RLS10000002',
    address: { StreetNumber: '101', StreetName: 'West 20th Street', PostalCode: '10011' },
  }),
  comp({
    listing_id: 'RLS10000003',
    address: { StreetNumber: '102', StreetName: 'West 20th Street', PostalCode: '10011' },
  }),
];

interface SimilarCard {
  id: string;
  photoUrl: string | null;
  photosCount: number;
}

async function similarCards(rows: unknown[]): Promise<SimilarCard[]> {
  listingFindMany.mockResolvedValueOnce(rows);
  const res = await similarGET(
    new NextRequest(
      'https://mallan.nyc/api/listings/similar?type=sale&beds=2&price=1000000&postalCode=10011&excludeId=RLS99999999',
    ),
  );
  const body = (await res.json()) as { listings: SimilarCard[] };
  return body.listings;
}

beforeAll(() => {
  // Every outbound Cotality call fails closed — no network from the test suite.
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    ok: false,
    status: 503,
    json: async () => ({}),
  }));
});

beforeEach(() => {
  showingFindMany.mockReset();
  showingFindMany.mockResolvedValue([]);
  listingFindMany.mockReset();
  listingFindMany.mockResolvedValue([]);
});

describe('/api/open-houses — local card hero reads the canonical composition', () => {
  it('relational rows present → the hero is the relational URL, not the legacy JSON', async () => {
    const image = await openHouseImage({
      listing_media: [activeRow()],
      count: 1,
      legacy: legacyJson,
    });
    expect(image).toBe(R2_HERO);
    expect(image).not.toBe(LEGACY_URL);
  });

  it('no relational row ever imported (_count 0) → falls back to the legacy JSON', async () => {
    const image = await openHouseImage({ listing_media: [], count: 0, legacy: legacyJson });
    expect(image).toBe(LEGACY_URL);
  });

  it('rows existed and were ALL deleted (_count 3, 0 active) → does NOT resurrect the legacy JSON', async () => {
    // The active-only select returns []. Only `_count` distinguishes this from the
    // never-imported case above — the whole point of selecting it.
    const image = await openHouseImage({ listing_media: [], count: 3, legacy: legacyJson });
    expect(image).toBe('');
    expect(image).not.toBe(LEGACY_URL);
  });

  it('a FloorPlan never becomes the hero when a Photo exists', async () => {
    const image = await openHouseImage({
      listing_media: [
        activeRow({
          media_key: 'crm:SL-0007:fp',
          media_url_original: R2_FLOORPLAN,
          media_url_cached: null,
          media_type: 'FloorPlan',
          media_category: 'FloorPlan',
          order: 0, // FIRST in provider order — the raw-media[0] trap
        }),
        activeRow({ media_key: 'crm:SL-0007:photo', order: 1 }),
      ],
      count: 2,
      legacy: [],
    });
    expect(image).toBe(R2_HERO);
    expect(image).not.toBe(R2_FLOORPLAN);
  });

  it('a FloorPlan-only listing shows the placeholder rather than the floor plan', async () => {
    // Preserves the photo-only guarantee `pickPrimaryPhotoUrl` used to carry.
    const image = await openHouseImage({
      listing_media: [
        activeRow({
          media_key: 'crm:SL-0007:fp',
          media_url_original: R2_FLOORPLAN,
          media_url_cached: null,
          media_type: 'FloorPlan',
          media_category: 'FloorPlan',
        }),
      ],
      count: 1,
      legacy: [],
    });
    expect(image).toBe('');
  });

  it('the public response contract is unchanged', async () => {
    showingFindMany.mockResolvedValueOnce([
      localShowing({ listing_media: [activeRow()], count: 1, legacy: [] }),
    ]);
    const res = await openHousesGET();
    // Caching header preserved exactly.
    expect(res.headers.get('cache-control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600',
    );
    const body = (await res.json()) as { openHouses: Record<string, unknown>[] };
    expect(Object.keys(body.openHouses[0]).sort()).toEqual(
      [
        'address', 'addressKey', 'agentName', 'agentPhone', 'baths', 'beds', 'date',
        'description', 'endTime', 'featured', 'id', 'image', 'listingId',
        'mallanExclusive', 'neighborhood', 'openHouseType', 'price', 'source',
        'sqft', 'startTime', 'type',
      ].sort(),
    );
    // Public endpoint: agent direct contact never serialized (REBNY IDX/VOW).
    expect(body.openHouses[0].agentPhone).toBe('');
  });
});

describe('/api/listings/similar — DB comp media reads the canonical composition', () => {
  it('relational rows present → photoUrl + photosCount come from THEM', async () => {
    const cards = await similarCards([
      comp({ listing_id: 'SUBJECT', media: legacyJson }),
      ...filler(),
    ]);
    const subject = cards.find((c) => c.id === 'SUBJECT');
    expect(subject?.photoUrl).toBe(R2_HERO);
    expect(subject?.photoUrl).not.toBe(LEGACY_URL);
    expect(subject?.photosCount).toBe(1);
  });

  it('no relational row ever imported (_count 0) → falls back to the legacy JSON', async () => {
    const cards = await similarCards([
      comp({
        listing_id: 'SUBJECT',
        listing_media: [],
        _count: { listing_media: 0 },
        media: legacyJson,
      }),
      ...filler(),
    ]);
    const subject = cards.find((c) => c.id === 'SUBJECT');
    expect(subject?.photoUrl).toBe(LEGACY_URL);
    expect(subject?.photosCount).toBe(1);
  });

  it('Mallan comp whose rows were ALL deleted (_count 3, 0 active) → no legacy resurrection', async () => {
    const cards = await similarCards([
      comp({
        listing_id: 'SL-0007',
        rls_eligible: false,
        listing_media: [],
        _count: { listing_media: 3 },
        media: legacyJson,
      }),
      ...filler(),
    ]);
    // Authoritatively empty → the comp carries no photo, so the media filter drops
    // it from the card set. What must NEVER happen is the deleted URL reappearing.
    expect(cards.some((c) => c.id === 'SL-0007')).toBe(false);
    expect(cards.every((c) => c.photoUrl !== LEGACY_URL)).toBe(true);
  });

  it('a FloorPlan never becomes the card photo when a Photo exists', async () => {
    const cards = await similarCards([
      comp({
        listing_id: 'SUBJECT',
        listing_media: [
          activeRow({
            media_key: '900002',
            media_url_original: R2_FLOORPLAN,
            media_url_cached: null,
            media_type: 'FloorPlan',
            media_category: 'FloorPlan',
            order: 0,
          }),
          activeRow({ media_key: '900003', order: 1 }),
        ],
        _count: { listing_media: 2 },
      }),
      ...filler(),
    ]);
    const subject = cards.find((c) => c.id === 'SUBJECT');
    expect(subject?.photoUrl).toBe(R2_HERO);
    expect(subject?.photoUrl).not.toBe(R2_FLOORPLAN);
    // photosCount counts PHOTOS only — the floor plan is in the gallery, not the count.
    expect(subject?.photosCount).toBe(1);
  });

  it('the card contract and the REBNY 2.05 address mask are unchanged', async () => {
    const cards = await similarCards([
      comp({ listing_id: 'SUBJECT', internet_address_display_yn: false }),
      ...filler(),
    ]);
    const raw = cards.find((c) => c.id === 'SUBJECT') as unknown as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(
      [
        'address', 'baths', 'beds', 'id', 'listPrice', 'mlsId', 'neighborhood',
        'office', 'photoUrl', 'photosCount', 'propertyType', 'slug', 'sqft',
      ].sort(),
    );
    expect(raw.address).toBe('Address available upon request');
  });

  it('composed URLs are never re-proxied into a nested /api/media/proxy?url=/api/media/proxy', async () => {
    // The composer proxies exactly once; a second `proxyUrl` pass would substring-
    // match `cotality.com` inside the encoded parameter and produce a URL the proxy
    // route 403s (lib/media/proxy-url-policy.ts:17-26).
    const COTALITY = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801391/1/A/B/C1';
    const cards = await similarCards([
      comp({
        listing_id: 'SUBJECT',
        listing_media: [activeRow({ media_key: '900004', media_url_original: COTALITY, media_url_cached: null })],
        _count: { listing_media: 1 },
      }),
      ...filler(),
    ]);
    const url = cards.find((c) => c.id === 'SUBJECT')?.photoUrl || '';
    expect(url).toBe(`/api/media/proxy?url=${encodeURIComponent(COTALITY)}`);
    expect(url.indexOf('/api/media/proxy')).toBe(url.lastIndexOf('/api/media/proxy'));
  });
});
