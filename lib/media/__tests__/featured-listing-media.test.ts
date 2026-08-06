/**
 * Featured-card media model — proves the Cotality video/3D path.
 *
 * The fixture is COTALITY-SHAPED (RLS listing_id, Trestle-style MediaCategory,
 * three photos + one video + one 3D tour), not a Mallan exclusive: the defect
 * being fixed is specifically that third-party IDX video and 3D never reached
 * the homepage.
 */

import { buildFeaturedListingMedia } from '@/lib/media/featured-listing-media';

const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev';

/** Cotality-shaped: 3 photos, 1 video, 1 virtual tour, 1 floor plan. */
const cotalityListing = () => ({
  media: [
    { url: `${R2}/photos/RLS20059088/1.jpg`, mediaType: 'Photo', mediaCategory: 'Photo', order: 0 },
    { url: `${R2}/photos/RLS20059088/2.jpg`, mediaType: 'Photo', mediaCategory: 'Photo', order: 1 },
    { url: `${R2}/photos/RLS20059088/3.jpg`, mediaType: 'Photo', mediaCategory: 'Photo', order: 2 },
    { url: 'https://www.youtube.com/watch?v=abc123', mediaType: 'Video', mediaCategory: 'Video', order: 3 },
    { url: 'https://my.matterport.com/show/?m=xyz789', mediaType: 'VirtualTour', mediaCategory: 'VirtualTour', order: 4 },
    { url: `${R2}/floorplans/RLS20059088/fp.jpg`, mediaType: 'FloorPlan', mediaCategory: 'FloorPlan', order: 5 },
  ],
  videoUrl: null,
  virtualTourURL: null,
});

describe('buildFeaturedListingMedia — Cotality fixture', () => {
  it('3. retains all photos in provider order', () => {
    const m = buildFeaturedListingMedia(cotalityListing());
    expect(m.photos.map((p) => p.url)).toEqual([
      `${R2}/photos/RLS20059088/1.jpg`,
      `${R2}/photos/RLS20059088/2.jpg`,
      `${R2}/photos/RLS20059088/3.jpg`,
    ]);
    expect(m.photoCount).toBe(3);
  });

  it('4. retains a Video media record', () => {
    const m = buildFeaturedListingMedia(cotalityListing());
    expect(m.hasVideo).toBe(true);
    expect(m.videoUrl).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it('5. retains a VirtualTour/3D media record', () => {
    const m = buildFeaturedListingMedia(cotalityListing());
    expect(m.hasVirtualTour).toBe(true);
    expect(m.virtualTourUrl).toBe('https://my.matterport.com/show/?m=xyz789');
  });

  it('9. floor plans do NOT enter the photo carousel', () => {
    const m = buildFeaturedListingMedia(cotalityListing());
    expect(m.photos.some((p) => /floorplan/i.test(p.url))).toBe(false);
    expect(m.photoCount).toBe(3);
  });

  it('10. never uses a video or tour as the hero when a real photo exists', () => {
    const m = buildFeaturedListingMedia(cotalityListing());
    expect(m.photos[0].url).toBe(`${R2}/photos/RLS20059088/1.jpg`);
  });
});

describe('DTO fallbacks', () => {
  it('6. uses listing.videoUrl when no Video media row exists', () => {
    const m = buildFeaturedListingMedia({
      media: [{ url: `${R2}/photos/X/1.jpg`, mediaType: 'Photo', order: 0 }],
      videoUrl: 'https://vimeo.com/12345',
      virtualTourURL: null,
    });
    expect(m.videoUrl).toBe('https://vimeo.com/12345');
    expect(m.hasVideo).toBe(true);
  });

  it('7. uses listing.virtualTourURL when no VirtualTour media row exists', () => {
    const m = buildFeaturedListingMedia({
      media: [{ url: `${R2}/photos/X/1.jpg`, mediaType: 'Photo', order: 0 }],
      videoUrl: null,
      virtualTourURL: 'https://my.matterport.com/show/?m=q1',
    });
    expect(m.virtualTourUrl).toBe('https://my.matterport.com/show/?m=q1');
    expect(m.hasVirtualTour).toBe(true);
  });

  it('a classified Media record WINS over the DTO field', () => {
    const m = buildFeaturedListingMedia({
      media: [{ url: 'https://vimeo.com/media-row', mediaType: 'Video', mediaCategory: 'Video', order: 0 }],
      videoUrl: 'https://vimeo.com/dto-field',
      virtualTourURL: null,
    });
    expect(m.videoUrl).toBe('https://vimeo.com/media-row');
  });
});

describe('dedupe, safety and edge cases', () => {
  it('8. duplicate media URLs collapse to one entry', () => {
    const m = buildFeaturedListingMedia({
      media: [
        { url: `${R2}/photos/X/1.jpg`, mediaType: 'Photo', order: 0 },
        { url: `${R2}/photos/X/1.jpg`, mediaType: 'Photo', order: 1 },
        { url: `${R2}/photos/X/1.jpg?v=2`, mediaType: 'Photo', order: 2 },
      ],
      videoUrl: null,
      virtualTourURL: null,
    });
    expect(m.photoCount).toBe(1);
  });

  it('8b. the same tour offered as a Media row AND as virtualTourURL appears once', () => {
    const m = buildFeaturedListingMedia({
      media: [{ url: 'https://my.matterport.com/show/?m=same', mediaType: 'VirtualTour', order: 0 }],
      videoUrl: null,
      virtualTourURL: 'https://my.matterport.com/show/?m=same',
    });
    expect(m.virtualTourUrl).toBe('https://my.matterport.com/show/?m=same');
    expect(m.hasVirtualTour).toBe(true);
  });

  it('rejects unsafe and non-HTTP media URLs', () => {
    const m = buildFeaturedListingMedia({
      media: [
        { url: 'javascript:alert(1)', mediaType: 'Photo', order: 0 },
        { url: 'data:image/png;base64,AAAA', mediaType: 'Photo', order: 1 },
        { url: '//evil.example.com/x.jpg', mediaType: 'Photo', order: 2 },
        { url: '   ', mediaType: 'Photo', order: 3 },
        { url: `${R2}/photos/X/ok.jpg`, mediaType: 'Photo', order: 4 },
      ],
      videoUrl: 'javascript:alert(2)',
      virtualTourURL: null,
    });
    expect(m.photos.map((p) => p.url)).toEqual([`${R2}/photos/X/ok.jpg`]);
    expect(m.hasVideo).toBe(false);
  });

  it('10b. a photo-only listing is unchanged — no video/3D controls', () => {
    const m = buildFeaturedListingMedia({
      media: [
        { url: `${R2}/photos/X/1.jpg`, mediaType: 'Photo', order: 0 },
        { url: `${R2}/photos/X/2.jpg`, mediaType: 'Photo', order: 1 },
      ],
      videoUrl: null,
      virtualTourURL: null,
    });
    expect(m.photoCount).toBe(2);
    expect(m.hasVideo).toBe(false);
    expect(m.hasVirtualTour).toBe(false);
  });

  it('11. a listing with no real media yields an empty model for the placeholder', () => {
    for (const input of [null, undefined, {}, { media: [] }, { media: null }]) {
      const m = buildFeaturedListingMedia(input as never);
      expect(m.photoCount).toBe(0);
      expect(m.hasVideo).toBe(false);
      expect(m.hasVirtualTour).toBe(false);
    }
  });

  it('sorts by provider order even when supplied out of sequence', () => {
    const m = buildFeaturedListingMedia({
      media: [
        { url: `${R2}/photos/X/c.jpg`, mediaType: 'Photo', order: 5 },
        { url: `${R2}/photos/X/a.jpg`, mediaType: 'Photo', order: 1 },
        { url: `${R2}/photos/X/b.jpg`, mediaType: 'Photo', order: 3 },
      ],
      videoUrl: null,
      virtualTourURL: null,
    });
    expect(m.photos.map((p) => p.url.slice(-5))).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});
