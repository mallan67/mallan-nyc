/// <reference types="jest" />
/**
 * Listing media pipeline fix — floorplan-first + video/3D split.
 * Covers the canonical module contract every surface now routes through.
 */
import {
  classifyMediaItem,
  classifyTourUrl,
  splitTourUrls,
  tourUrlsForDto,
  getPhotoGallery,
  getPrimaryPhoto,
  getFloorplans,
  getSearchThumbnail,
} from '@/lib/media/listing-media-resolver';
import { isPhotoMedia, getHeroPhoto, LISTING_PLACEHOLDER_IMAGE } from '@/lib/media/listing-card-media';

const PHOTO1 = { MediaURL: 'https://cdn.example.com/p1.jpg', MediaCategory: 'Photo', Order: 1 };
const PHOTO2 = { MediaURL: 'https://cdn.example.com/p2.jpg', MediaCategory: 'Photo', Order: 2 };
// FloorPlan tagged by category, ordered FIRST (the Trestle default that caused the bug).
const FLOORPLAN = { MediaURL: 'https://cdn.example.com/fp.jpg', MediaCategory: 'FloorPlan', Order: 0 };
// FloorPlan with NULL category but a Trestle DOCUMENT- URL (the null-category leak case).
const FLOORPLAN_NULLCAT = { MediaURL: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Jpeg/abc', MediaCategory: null, Order: 0 };

describe('classifyMediaItem — floorplan detection', () => {
  it('classifies a tagged floorplan and a null-category DOCUMENT- floorplan', () => {
    expect(classifyMediaItem(FLOORPLAN)).toBe('floorplan');
    expect(classifyMediaItem(FLOORPLAN_NULLCAT)).toBe('floorplan');
    expect(classifyMediaItem(PHOTO1)).toBe('photo');
  });
});

describe('getPrimaryPhoto / getSearchThumbnail — floorplan never first', () => {
  it('picks the first PHOTO even when a floorplan is at order 0 (sale)', () => {
    const media = [FLOORPLAN, PHOTO1, PHOTO2];
    expect(getPrimaryPhoto(media)?.url).toBe('https://cdn.example.com/p1.jpg');
    expect(getSearchThumbnail(media)).toBe('https://cdn.example.com/p1.jpg');
    expect(getFloorplans(media)).toHaveLength(1);
  });
  it('skips a null-category DOCUMENT- floorplan at order 0 (rental)', () => {
    const media = [FLOORPLAN_NULLCAT, PHOTO2];
    expect(getPrimaryPhoto(media)?.url).toBe('https://cdn.example.com/p2.jpg');
    expect(getSearchThumbnail(media)).toBe('https://cdn.example.com/p2.jpg');
  });
  it('respects source order among photos (photos-only regression)', () => {
    const gallery = getPhotoGallery([PHOTO2, PHOTO1]); // Order 2 then 1
    expect(gallery.map((m) => m.url)).toEqual(['https://cdn.example.com/p1.jpg', 'https://cdn.example.com/p2.jpg']);
  });
  it('floorplan-only listing → no primary photo, thumbnail null (safe fallback, not a floorplan)', () => {
    expect(getPrimaryPhoto([FLOORPLAN])).toBeNull();
    expect(getSearchThumbnail([FLOORPLAN])).toBeNull();
  });
});

describe('classifyTourUrl — video vs 3D by host', () => {
  it('YouTube / Vimeo / direct file → video', () => {
    expect(classifyTourUrl('https://www.youtube.com/watch?v=abc')).toBe('video');
    expect(classifyTourUrl('https://youtu.be/abc')).toBe('video');
    expect(classifyTourUrl('https://player.vimeo.com/video/123')).toBe('video');
    expect(classifyTourUrl('https://cdn.example.com/tour.mp4')).toBe('video');
  });
  it('Matterport / other tour hosts → virtualTour (3D)', () => {
    expect(classifyTourUrl('https://my.matterport.com/show/?m=xyz')).toBe('virtualTour');
    expect(classifyTourUrl('https://kuula.co/share/abc')).toBe('virtualTour');
    expect(classifyTourUrl('')).toBe('virtualTour');
  });
});

describe('splitTourUrls / tourUrlsForDto — video/3D split + unbranded preference', () => {
  it('routes a YouTube tour to video and a Matterport tour to 3D', () => {
    const r = splitTourUrls([{ url: 'https://youtube.com/watch?v=a' }, { url: 'https://my.matterport.com/show/?m=b' }]);
    expect(r.videoUrl).toBe('https://youtube.com/watch?v=a');
    expect(r.virtualTourUrl).toBe('https://my.matterport.com/show/?m=b');
  });
  it('prefers the UNBRANDED URL within each class (UCBA §5(C))', () => {
    const r = splitTourUrls([
      { url: 'https://vimeo.com/branded', branded: true },
      { url: 'https://vimeo.com/unbranded', branded: false },
    ]);
    expect(r.videoUrl).toBe('https://vimeo.com/unbranded');
  });
  it('tourUrlsForDto emits DTO-shaped {videoUrl, virtualTourURL}', () => {
    const dto = tourUrlsForDto(['https://my.matterport.com/show/?m=b'], 'https://youtube.com/watch?v=a');
    expect(dto.videoUrl).toBe('https://youtube.com/watch?v=a');
    expect(dto.virtualTourURL).toBe('https://my.matterport.com/show/?m=b');
  });
  it('returns undefined (not null) when a class is absent', () => {
    const dto = tourUrlsForDto(['https://my.matterport.com/show/?m=b'], null);
    expect(dto.virtualTourURL).toBe('https://my.matterport.com/show/?m=b');
    expect(dto.videoUrl).toBeUndefined();
  });
});

describe('listing-card-media — canonical delegation', () => {
  it('isPhotoMedia rejects a null-category DOCUMENT- floorplan (was the leak)', () => {
    expect(isPhotoMedia({ url: FLOORPLAN_NULLCAT.MediaURL, mediaType: '' })).toBe(false);
    expect(isPhotoMedia({ url: PHOTO1.MediaURL, mediaType: 'Photo' })).toBe(true);
  });
  it('getHeroPhoto returns a photo, or the placeholder for floorplan-only', () => {
    expect(getHeroPhoto([{ url: PHOTO1.MediaURL, mediaType: 'Photo', order: 1 }])).toBe(PHOTO1.MediaURL);
    expect(getHeroPhoto([{ url: FLOORPLAN.MediaURL, mediaType: 'FloorPlan', order: 0 }])).toBe(LISTING_PLACEHOLDER_IMAGE);
  });
});

describe('ResourceRecordKey rule — resolver is key-agnostic', () => {
  it('classification does not depend on ResourceRecordID (compliance: RRKey canonical)', () => {
    // The resolver classifies on category/url only; RRID is not consulted, so the
    // RRKey-canonical ingestion rule is not undermined by the display layer.
    expect(classifyMediaItem({ ...PHOTO1, ResourceRecordID: 'X', ResourceRecordKey: 'Y' })).toBe('photo');
    expect(classifyMediaItem({ ...FLOORPLAN, ResourceRecordID: 'X' })).toBe('floorplan');
  });
});
