/**
 * Detail-page FEED-authority WIRING regression.
 *
 * WHAT ESCAPED TO PRODUCTION
 * --------------------------
 * #612 (merged as 3a37c170) added the feed-authority signal to a `composeDbPublicMedia` call in
 * app/listing/[...slug]/page.tsx. That call was DEAD — its results (`mediaArr`,
 * `canonicalPhotoCount`) were read by nothing, and had been dead since before #612. The page then
 * built the DTO that actually drives rendering and metadata with a bare
 * `dbListingToPublicDTO(dbListing)`, which recomposes media with `hadFeedRelationalRows`
 * undefined — deliberately preserving the old third-party fallback.
 *
 * Result: RLS20082303 kept rendering its 20 stale Cotality photos on the exact production
 * deployment, even though the page had already computed the correct answer.
 *
 * WHY EVERY EXISTING TEST STAYED GREEN
 * ------------------------------------
 * The unit suites exercise the resolver and the composer directly and pass the signal explicitly,
 * so they proved the MECHANISM works. Nothing asserted that the PAGE hands the signal to its media
 * owner. And because the parameter is OPTIONAL, "adopted" and "not adopted" both compile — the
 * type checker caught the `.map(dbListingToPublicDTO)` index hazard, but a plain omission is
 * invisible to it.
 *
 * This file therefore does two things a helper test cannot:
 *   1. asserts the FINAL DTO owner's behaviour, including what metadata would emit;
 *   2. asserts the page actually threads the signal into that owner, and that no second media
 *      owner exists to diverge from it again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { getPrimaryPhoto } from '@/lib/media/listing-media-resolver';

const PAGE_SRC = readFileSync(
  join(process.cwd(), 'app', 'listing', '[...slug]', 'page.tsx'),
  'utf8',
);

/** 20 stale legacy Cotality items — the real RLS20082303 shape. */
const STALE_LEGACY = Array.from({ length: 20 }, (_, i) => ({
  url: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1157003490/${i}/NjA0My8xMTM3MS8yMA/MjAvMjE1MjYvMTc4Njc0NTQzMA/STALESIG`,
  mediaType: 'Photo',
  order: i,
}));

/** 20 canonical rows, ALL tombstoned — the canonical lane already did its job. */
const DELETED_FEED_ROWS = Array.from({ length: 20 }, (_, i) => ({
  media_key: `200567983492${i}`,
  status: 'deleted',
  media_url_original: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1157003490/${i}/A/B/C`,
  media_url_cached: null,
  media_type: 'Photo',
  media_category: 'Photo',
  media_classification: null,
  order: i,
  preferred_photo_yn: false,
}));

const RLS20082303: DbListing = {
  id: '1',
  listing_id: 'RLS20082303',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: null,
  list_price: '1000000',
  bedrooms_total: 2,
  bathrooms_full: 2,
  bathrooms_half: 0,
  living_area: null,
  borough: 'manhattan',
  neighborhood: 'Midtown',
  address: { StreetNumber: '1', StreetName: 'Main', StreetSuffix: 'Street', City: 'New York City', PostalCode: '10019', Borough: 'manhattan' },
  features: {},
  media: STALE_LEGACY,
  agent_info: { ListOfficeName: 'Compass' },
  agent_id: null,
  owner_client_id: null,
  rls_eligible: true, // THIRD-PARTY
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  listing_contract_date: '2026-04-01T00:00:00Z',
  modification_timestamp: '2026-05-05T16:21:52Z',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-05-05T16:21:52Z',
  // All 20 rows exist but none are active — the residual-candidate shape.
  listing_media: DELETED_FEED_ROWS,
  _count: { listing_media: 20 },
} as unknown as DbListing;

describe('FINAL detail DTO honours feed authority (not just the resolver helpers)', () => {
  it('feed history TRUE + zero active feed rows + stale legacy => DTO media is EMPTY', () => {
    const dto = dbListingToPublicDTO(RLS20082303, { hadFeedRelationalRows: true });
    expect(dto.media).toHaveLength(0);
    expect(dto.photosCount).toBe(0);
  });

  it('generated metadata must NOT emit a stale Cotality image', () => {
    const dto = dbListingToPublicDTO(RLS20082303, { hadFeedRelationalRows: true });
    // generateMetadata: `getPrimaryPhoto(listing.media)?.url || '/images/og-default.png'`.
    const ogImage = getPrimaryPhoto(dto.media)?.url || '/images/og-default.png';
    expect(ogImage).toBe('/images/og-default.png');
    expect(ogImage).not.toContain('cotality.com');
  });

  it('never-imported third-party (feed history FALSE) STILL falls back to legacy', () => {
    const neverImported = {
      ...RLS20082303,
      listing_id: 'RLS20000001',
      listing_media: [],
      _count: { listing_media: 0 },
    } as unknown as DbListing;
    const dto = dbListingToPublicDTO(neverImported, { hadFeedRelationalRows: false });
    expect(dto.media.length).toBe(20);
    expect(getPrimaryPhoto(dto.media)?.url).toBeTruthy();
  });

  it('UNKNOWN signal preserves prior behaviour (un-adopted callers cannot regress)', () => {
    const dto = dbListingToPublicDTO(RLS20082303);
    expect(dto.media.length).toBe(20);
  });
});

describe('the detail page WIRES the signal into its media owner', () => {
  it('passes hadFeedRelationalRows into dbListingToPublicDTO', () => {
    // THE regression. A bare `dbListingToPublicDTO(dbListing)` compiles fine and silently keeps the
    // old fallback, which is exactly how the stale gallery survived #612.
    expect(PAGE_SRC).toMatch(/dbListingToPublicDTO\(\s*dbListing\s*,\s*\{[\s\S]*?hadFeedRelationalRows/);
    expect(PAGE_SRC).not.toMatch(/dbListingToPublicDTO\(dbListing\)\s*;/);
  });

  it('computes the authority signal before building the DTO', () => {
    expect(PAGE_SRC).toContain('resolveFeedAuthorityForPage');
    const authorityAt = PAGE_SRC.indexOf('resolveFeedAuthorityForPage(prisma');
    const dtoAt = PAGE_SRC.indexOf('dbListingToPublicDTO(dbListing');
    expect(authorityAt).toBeGreaterThan(-1);
    expect(dtoAt).toBeGreaterThan(authorityAt);
  });

  it('has exactly ONE media owner — no second composeDbPublicMedia call to diverge', () => {
    // Two owners is how the page computed the right answer and rendered the wrong one. Comments
    // may still reference the name; an actual CALL must not exist.
    expect(PAGE_SRC).not.toMatch(/^\s*(const|let|var).*=\s*composeDbPublicMedia\(/m);
    expect(PAGE_SRC).not.toMatch(/[^.\w]composeDbPublicMedia\(\{/);
  });
});
