/**
 * COMMIT 5b ACCEPTANCE — public list summary contraction.
 *
 * The contraction must shrink ONLY the gallery. The single most dangerous
 * failure mode is reporting `photosCount = 1` for a 67-photo listing, i.e.
 * deriving the count from the contracted array instead of preserving it.
 */

import { toPublicListingSummary, toPublicListingSummaries } from '../public-listing-summary';
import { LISTING_PLACEHOLDER_IMAGE, getHeroPhoto } from '@/lib/media/listing-card-media';
import type { PublicListingDTO } from '../public-dto';

const PHOTO = (n: number) => `/api/media/proxy?url=${encodeURIComponent(
  `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801${n}/1/A/B/C${n}`,
)}`;
const FLOORPLAN =
  'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/117801999/1/A/B/C';

const photo = (n: number) => ({
  url: PHOTO(n), thumbUrl: PHOTO(n), mediaType: 'Photo', order: n, isPrimary: n === 0,
});
const floorplan = (order: number) => ({
  url: FLOORPLAN, thumbUrl: FLOORPLAN, mediaType: 'FloorPlan', order, isPrimary: false,
});
const video = (order: number) => ({
  url: 'https://www.youtube.com/watch?v=abc', mediaType: 'Video', order, isPrimary: false,
});

/** Full DTO with every public field populated, so pass-through is testable. */
function dto(over: Partial<PublicListingDTO> = {}): PublicListingDTO {
  return {
    id: 'RLS20105333',
    mlsId: 'RLS20105333',
    slug: '519-monroe-street-new-york-city-ny-11221-rls20105333',
    url: '/listing/519-monroe-street-new-york-city-ny-11221/rls20105333',
    status: 'Active',
    listingType: 'sale',
    address: {
      streetNumber: '519', streetName: 'Monroe Street', unitNumber: null,
      city: 'New York City', stateOrProvince: 'NY', postalCode: '11221',
      county: 'Kings', neighborhood: 'Bedford-Stuyvesant',
      latitude: 40.6871, longitude: -73.9318,
    },
    listPrice: 2295000,
    propertyType: 'Residential',
    bedroomsTotal: 4,
    bathroomsFull: 3,
    listOfficeName: 'Compass',
    media: [],
    photosCount: 0,
    publicRemarks: 'Test remarks',
    _source: 'db+idx',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'Listing courtesy of Compass',
      disclaimerRequired: true,
    },
    ...over,
  } as unknown as PublicListingDTO;
}

describe('the RLS20105333 shape — 68 media / 67 Photos / 1 non-Photo', () => {
  const full = dto({
    media: [...Array.from({ length: 67 }, (_, i) => photo(i)), floorplan(99)] as never,
    photosCount: 67,
  });

  it('summary returns exactly ONE media entry', () => {
    expect(toPublicListingSummary(full).media).toHaveLength(1);
  });

  it('summary PRESERVES photosCount = 67 (never recomputed as 1)', () => {
    const s = toPublicListingSummary(full);
    expect(s.photosCount).toBe(67);
    expect(s.photosCount).not.toBe(s.media.length);
  });

  it('the hero is a Photo, not the FloorPlan', () => {
    const s = toPublicListingSummary(full);
    expect(s.media[0].mediaType).toBe('Photo');
    expect(s.media[0].url).toBe(PHOTO(0));
  });

  it('the full DTO is left untouched (no mutation)', () => {
    toPublicListingSummary(full);
    expect(full.media).toHaveLength(68);
    expect(full.photosCount).toBe(67);
  });
});

describe('counts scale independently of the contracted array', () => {
  it('1 Photo -> media 1, photosCount 1', () => {
    const s = toPublicListingSummary(dto({ media: [photo(0)] as never, photosCount: 1 }));
    expect(s.media).toHaveLength(1);
    expect(s.photosCount).toBe(1);
  });

  it('10 Photos -> media 1, photosCount 10', () => {
    const s = toPublicListingSummary(dto({
      media: Array.from({ length: 10 }, (_, i) => photo(i)) as never,
      photosCount: 10,
    }));
    expect(s.media).toHaveLength(1);
    expect(s.photosCount).toBe(10);
  });

  it('10 DISTINCT proxied Photos -> summary keeps only the canonical hero', () => {
    const media = Array.from({ length: 10 }, (_, i) => photo(i));
    expect(new Set(media.map((m) => m.url)).size).toBe(10); // genuinely distinct
    const s = toPublicListingSummary(dto({ media: media as never, photosCount: 10 }));
    expect(s.media).toHaveLength(1);
    expect(s.media[0].url).toBe(PHOTO(0));
  });
});

describe('non-photo media never becomes a hero or a photo count', () => {
  it('Photo + LOWER-order FloorPlan -> hero is still the Photo', () => {
    const s = toPublicListingSummary(dto({
      media: [floorplan(0), photo(1)] as never, photosCount: 1,
    }));
    expect(s.media[0].mediaType).toBe('Photo');
    expect(s.media[0].url).toBe(PHOTO(1));
  });

  it('FloorPlan ONLY -> no media, photosCount 0, card falls back to placeholder', () => {
    const s = toPublicListingSummary(dto({ media: [floorplan(0)] as never, photosCount: 0 }));
    expect(s.media).toHaveLength(0);
    expect(s.photosCount).toBe(0);
    // The established card fallback, not a FloorPlan promoted to hero.
    expect(getHeroPhoto(s.media as never)).toBe(LISTING_PLACEHOLDER_IMAGE);
  });

  it('Video / VirtualTour never become a hero', () => {
    const s = toPublicListingSummary(dto({ media: [video(0)] as never, photosCount: 0 }));
    expect(s.media).toHaveLength(0);
    expect(s.photosCount).toBe(0);
  });

  it('empty media stays empty', () => {
    const s = toPublicListingSummary(dto({ media: [] as never, photosCount: 0 }));
    expect(s.media).toHaveLength(0);
  });
});

describe('COMPLIANCE + identity fields are byte-identical after contraction', () => {
  const full = dto({
    media: [...Array.from({ length: 67 }, (_, i) => photo(i)), floorplan(99)] as never,
    photosCount: 67,
  });
  const s = toPublicListingSummary(full);

  const PRESERVED = [
    'id', 'mlsId', 'slug', 'url', 'status', 'listingType', 'listPrice',
    'propertyType', 'bedroomsTotal', 'bathroomsFull', 'listOfficeName',
    'publicRemarks', '_source',
  ] as const;

  it.each(PRESERVED)('%s is unchanged', (field) => {
    expect(s[field as keyof PublicListingDTO]).toEqual(full[field as keyof PublicListingDTO]);
  });

  it('address (including suppression state and coordinates) is unchanged', () => {
    expect(s.address).toEqual(full.address);
  });

  it('_displayCompliance is unchanged', () => {
    expect(s._displayCompliance).toEqual(full._displayCompliance);
  });

  it('ONLY media differs between the full DTO and the summary', () => {
    const diff = Object.keys(full).filter(
      (k) => JSON.stringify((s as never)[k]) !== JSON.stringify((full as never)[k]),
    );
    expect(diff).toEqual(['media']);
  });

  it('address-suppressed listings keep their suppression', () => {
    const suppressed = dto({
      address: { ...full.address, streetName: 'Address Undisclosed', unitNumber: null } as never,
      media: [photo(0)] as never, photosCount: 1,
    });
    expect(toPublicListingSummary(suppressed).address.streetName).toBe('Address Undisclosed');
  });
});

describe('list-level contraction', () => {
  it('preserves order and length', () => {
    const list = [
      dto({ id: 'A', media: [photo(0), photo(1)] as never, photosCount: 2 }),
      dto({ id: 'B', media: [photo(2)] as never, photosCount: 1 }),
    ];
    const out = toPublicListingSummaries(list);
    expect(out.map((l) => l.id)).toEqual(['A', 'B']);
    expect(out.map((l) => l.media.length)).toEqual([1, 1]);
    expect(out.map((l) => l.photosCount)).toEqual([2, 1]);
  });
});
