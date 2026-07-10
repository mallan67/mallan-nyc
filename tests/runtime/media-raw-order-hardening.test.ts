/// <reference types="jest" />
/**
 * PR #492 — raw-order media hardening.
 *
 * Verified in production (canonical Neon 2026-07-10): stored media is correctly typed (0 floor
 * plans mislabeled as Photo), but 1,845 public listings carry a FloorPlan as the RAW first JSON
 * element and 126 rely on the JSON fallback. These lock that the public DTO serialization is
 * photo-first and immune to a raw-order re-sort — no surface can hero a floor plan via media[0]
 * or by sorting `order`. Also locks that the local fallback runs the same resolver, and that a
 * photo-less listing placeholders (never heroes a floor plan).
 */
import { resolveListingMedia, toDtoMedia } from '../../lib/media/listing-media-resolver';
import { getHeroPhoto, LISTING_PLACEHOLDER_IMAGE } from '../../lib/media/listing-card-media';
import { toDisplayListing } from '../../lib/idx/display-adapter';

const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev';

describe('toDtoMedia — photo-first serialization, immune to raw-order re-sort', () => {
  it('floor plan at raw order 1 is demoted; a photo is primary with order 0', () => {
    const items = [
      { url: `${R2}/floorplans/RLS1/1.jpg`, mediaType: 'FloorPlan', order: 1 },
      { url: `${R2}/photos/RLS1/1.jpg`, mediaType: 'Photo', order: 2 },
      { url: `${R2}/photos/RLS1/2.jpg`, mediaType: 'Photo', order: 3 },
    ];
    const dto = toDtoMedia(resolveListingMedia(items));
    expect(dto[0].mediaType).toBe('Photo');
    expect(dto[0].isPrimary).toBe(true);
    expect(dto[0].order).toBe(0); // resolved index, NOT raw providerOrder

    // A consumer that re-sorts by `order` still gets the photo first (the hardening).
    const bySort = [...dto].sort((a, b) => a.order - b.order);
    expect(bySort[0].mediaType).toBe('Photo');

    const fp = dto.find((m) => m.mediaType === 'FloorPlan');
    expect(fp).toBeDefined();
    expect(fp!.isPrimary).toBe(false);
    expect(fp!.order).toBeGreaterThan(0);
  });

  it('exactly one item is isPrimary and order values are a dense 0..n-1 sequence', () => {
    const dto = toDtoMedia(resolveListingMedia([
      { url: `${R2}/photos/RLS9/1.jpg`, mediaType: 'Photo', order: 5 },
      { url: `${R2}/photos/RLS9/2.jpg`, mediaType: 'Photo', order: 9 },
    ]));
    expect(dto.filter((m) => m.isPrimary)).toHaveLength(1);
    expect(dto.map((m) => m.order)).toEqual([0, 1]);
  });
});

describe('placeholder — floor-plan-only listing never heroes the floor plan', () => {
  it('a floor-plan-only media set yields the placeholder from getHeroPhoto', () => {
    const fpOnly = toDtoMedia(resolveListingMedia([
      { url: `${R2}/floorplans/RLS2/1.jpg`, mediaType: 'FloorPlan', order: 1 },
    ]));
    expect(fpOnly).toHaveLength(1);
    expect(fpOnly[0].mediaType).toBe('FloorPlan');
    // The card filters to photos → no photo → placeholder, NOT the floor plan.
    expect(getHeroPhoto(fpOnly, new Set())).toBe(LISTING_PLACEHOLDER_IMAGE);
  });
});

describe('local fallback — routes through the same resolver (photo-first)', () => {
  it('a floor plan in raw media.images is demoted below photos', () => {
    const display = toDisplayListing({
      id: 'RLS3',
      mlsId: 'RLS3',
      status: 'Active',
      listingType: 'sale',
      address: { streetNumber: '1', streetName: 'Main St', city: 'New York', zip: '10001' },
      price: { listPrice: 100 }, // no top-level listPrice → local-fallback branch
      media: {
        images: [
          { url: `${R2}/floorplans/RLS3/1.jpg` },
          { url: `${R2}/photos/RLS3/1.jpg` },
        ],
      },
    });
    expect(display.media[0].mediaType).toBe('Photo'); // was force-tagged 'Photo'/raw-order before
    expect(display.media[0].isPrimary).toBe(true);
    expect(display.photosCount).toBe(1);
  });
});
