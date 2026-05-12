/// <reference types="jest" />
/**
 * PR 4 — public media reader swap.
 *
 * Verifies that `dbListingToPublicDTO` prefers the relational `listing_media`
 * table rows over the legacy `Listing.media` JSON, but falls back to the JSON
 * cleanly when the relation is empty. All six required scenarios are covered:
 *
 *   1. `listing_media` populated path           — R2-cached URLs used.
 *   2. `Listing.media` JSON fallback path        — empty relation falls back.
 *   3. No-media path                             — both empty → media: [].
 *   4. FloorPlan classification                  — sorted after photos.
 *   5. REBNY display gate still respected        — owner_opt_out suppresses.
 *   6. R2 cached URL preferred over Trestle      — cached wins; proxy avoided.
 *
 * NO live Prisma reads, NO live R2 writes, NO live Trestle calls. The mapper
 * is a pure function; we feed it constructed `DbListing` objects and assert
 * the resulting DTO shape.
 */

import {
  dbListingToPublicDTO,
  filterDisplayableDbListings,
  type DbListing,
} from '@/lib/idx/db-to-public-dto';
import type { ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

// ─── Fixtures ────────────────────────────────────────────────────────────

const R2_PHOTO = 'https://r2.mallan.nyc/listings/RBNY-1/photo-1.jpg';
const R2_PHOTO_2 = 'https://r2.mallan.nyc/listings/RBNY-1/photo-2.jpg';
const TRESTLE_PHOTO = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc';
const TRESTLE_FLOORPLAN = 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/100/2/fp';
const TRESTLE_VIDEO = 'https://api.cotality.com/trestle/Media/Property/VIDEO/100/3/vid.mp4';

function makeRow(overrides: Partial<ListingMediaTableRow> = {}): ListingMediaTableRow {
  return {
    media_url_original: TRESTLE_PHOTO,
    media_url_cached: null,
    media_type: 'Photo',
    media_category: 'Photo',
    media_classification: null,
    order: 0,
    preferred_photo_yn: false,
    status: 'active',
    ...overrides,
  };
}

function makeBaseListing(overrides: Partial<DbListing> = {}): DbListing {
  return {
    id: '1',
    listing_id: 'RBNY-1',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condominium',
    list_price: '1500000',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1100',
    borough: 'manhattan',
    neighborhood: 'Upper East Side',
    address: {
      StreetNumber: '400',
      StreetName: 'East 90th Street',
      UnitNumber: '17C',
      City: 'New York',
      PostalCode: '10128',
    },
    features: { PublicRemarks: 'Test listing.' },
    media: [],
    agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' },
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: null,
    modification_timestamp: new Date('2026-05-01T00:00:00Z').toISOString(),
    created_at: new Date('2026-04-01T00:00:00Z').toISOString(),
    updated_at: new Date('2026-05-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('PR 4 — listing_media reader swap', () => {
  it('case 1: listing_media populated → DTO media[] comes from the table, not JSON', () => {
    const listing = makeBaseListing({
      media: [
        // The legacy JSON path WOULD return this URL; we must NOT see it.
        { MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/99/legacy', MediaCategory: 'Photo', Order: 0 },
      ],
      listing_media: [
        makeRow({ media_url_cached: R2_PHOTO, media_type: 'Photo', order: 0 }),
        makeRow({ media_url_cached: R2_PHOTO_2, media_type: 'Photo', order: 1 }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(2);
    expect(dto.media[0].url).toBe(R2_PHOTO);
    expect(dto.media[1].url).toBe(R2_PHOTO_2);
    // Legacy JSON URL must NOT appear.
    expect(dto.media.some(m => m.url.includes('legacy'))).toBe(false);
  });

  it('case 2: listing_media empty → falls back to Listing.media JSON', () => {
    const listing = makeBaseListing({
      media: [
        { MediaURL: TRESTLE_PHOTO, MediaCategory: 'Photo', Order: 0 },
      ],
      listing_media: [],
    });

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(1);
    // Trestle URL must be proxied through /api/media/proxy.
    expect(dto.media[0].url).toMatch(/^\/api\/media\/proxy\?url=/);
    expect(dto.media[0].mediaType).toBe('Photo');
  });

  it('case 2b: listing_media field omitted entirely → falls back to JSON', () => {
    // Caller didn't include `listing_media` in their Prisma select; the
    // mapper must still produce a valid DTO using the JSON column.
    const listing = makeBaseListing({
      media: [
        { MediaURL: TRESTLE_PHOTO, MediaCategory: 'Photo', Order: 0 },
      ],
    });
    delete listing.listing_media;

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(1);
    expect(dto.media[0].mediaType).toBe('Photo');
  });

  it('case 3: no media on either side → DTO.media is an empty array', () => {
    const listing = makeBaseListing({ media: [], listing_media: [] });
    const dto = dbListingToPublicDTO(listing);
    expect(dto.media).toEqual([]);
    expect(dto.photosCount).toBe(0);
  });

  it('case 4: FloorPlan classification preserved — sorted AFTER photos', () => {
    const listing = makeBaseListing({
      listing_media: [
        // Intentionally insert the FloorPlan FIRST in provider order to
        // prove the resolver sorts photos before floor plans regardless of
        // ingestion order. This was the exact 2026-05-08 bug class
        // (243 listings rendering FloorPlan as hero card).
        makeRow({
          media_url_original: TRESTLE_FLOORPLAN,
          media_type: 'FloorPlan',
          media_category: 'Floor Plan',
          order: 0,
        }),
        makeRow({
          media_url_cached: R2_PHOTO,
          media_type: 'Photo',
          media_category: 'Photo',
          order: 1,
        }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(2);
    // Photo first, then FloorPlan — regardless of provider Order.
    expect(dto.media[0].mediaType).toBe('Photo');
    expect(dto.media[0].url).toBe(R2_PHOTO);
    expect(dto.media[1].mediaType).toBe('FloorPlan');
    // photosCount counts ONLY photos, not floor plans.
    expect(dto.photosCount).toBe(1);
  });

  it('case 5: REBNY display gates still suppress the listing — owner_opt_out', () => {
    // The mapper runs AFTER `filterDisplayableDbListings`. Verify the gate
    // still drops owner-opted-out rows so they never reach the DTO step
    // even when listing_media is populated.
    const optedOut = makeBaseListing({ owner_opt_out: true });
    const participantOnly = makeBaseListing({ listing_id: 'RBNY-2', participant_only: true });
    const idxOff = makeBaseListing({ listing_id: 'RBNY-3', idx_display_yn: false });
    const internetOff = makeBaseListing({ listing_id: 'RBNY-4', internet_entire_listing_display_yn: false });
    const ok = makeBaseListing({ listing_id: 'RBNY-5' });

    const displayable = filterDisplayableDbListings([optedOut, participantOnly, idxOff, internetOff, ok]);
    expect(displayable).toHaveLength(1);
    expect(displayable[0].listing_id).toBe('RBNY-5');
  });

  it('case 5b: address suppression cascade — internet_address_display_yn=null masks address', () => {
    const listing = makeBaseListing({
      internet_address_display_yn: false,
      listing_media: [
        makeRow({ media_url_cached: R2_PHOTO, media_type: 'Photo' }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    // Address is suppressed but media still renders.
    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
    expect(dto.media).toHaveLength(1);
    expect(dto.media[0].url).toBe(R2_PHOTO);
  });

  it('case 6: R2 cached URL preferred over Trestle original — proxy never used', () => {
    const listing = makeBaseListing({
      listing_media: [
        makeRow({
          // BOTH URLs present — the cached R2 URL must win and the Trestle
          // URL must not appear anywhere in the DTO output.
          media_url_cached: R2_PHOTO,
          media_url_original: TRESTLE_PHOTO,
          media_type: 'Photo',
        }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(1);
    expect(dto.media[0].url).toBe(R2_PHOTO);
    // The Trestle proxy path must NOT appear because R2 won.
    expect(dto.media[0].url).not.toMatch(/\/api\/media\/proxy/);
    expect(dto.media[0].url).not.toContain('cotality.com');
  });

  it('case 6b: R2 absent but Trestle present → Trestle URL is proxied', () => {
    const listing = makeBaseListing({
      listing_media: [
        makeRow({
          media_url_cached: null,
          media_url_original: TRESTLE_PHOTO,
          media_type: 'Photo',
        }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(1);
    expect(dto.media[0].url).toMatch(/^\/api\/media\/proxy\?url=/);
    expect(dto.media[0].url).toContain(encodeURIComponent(TRESTLE_PHOTO));
  });

  it('case 7: soft-deleted listing_media rows are ignored — only active rows surface', () => {
    const listing = makeBaseListing({
      listing_media: [
        makeRow({ media_url_cached: R2_PHOTO, status: 'active', order: 0 }),
        makeRow({ media_url_cached: 'https://r2.mallan.nyc/deleted.jpg', status: 'deleted', order: 1 }),
        makeRow({ media_url_cached: 'https://r2.mallan.nyc/replaced.jpg', status: 'replaced', order: 2 }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    expect(dto.media).toHaveLength(1);
    expect(dto.media[0].url).toBe(R2_PHOTO);
    expect(dto.media.some(m => m.url.includes('deleted'))).toBe(false);
    expect(dto.media.some(m => m.url.includes('replaced'))).toBe(false);
  });

  it('case 8: video classification preserved through listing_media path', () => {
    const listing = makeBaseListing({
      listing_media: [
        makeRow({
          media_url_original: TRESTLE_VIDEO,
          media_type: 'Video',
          media_category: 'Video',
          order: 0,
        }),
        makeRow({
          media_url_cached: R2_PHOTO,
          media_type: 'Photo',
          media_category: 'Photo',
          order: 1,
        }),
      ],
    });

    const dto = dbListingToPublicDTO(listing);

    // Photo first, then Video.
    expect(dto.media).toHaveLength(2);
    expect(dto.media[0].mediaType).toBe('Photo');
    expect(dto.media[1].mediaType).toBe('Video');
  });
});
