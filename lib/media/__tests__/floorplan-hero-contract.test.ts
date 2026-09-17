/**
 * Floor-plan hero contract — the shared classification/ordering functions that
 * EVERY card/public hero surface now routes through:
 *   - server: /api/media/batch (default+detail), /api/listings/similar, agent-card-media,
 *     dbListingToPublicDTO, cotality-public-dto, crm-idx-mapper  → classifyMediaItem /
 *     resolveListingMedia / resolveListingMediaFromRows / pickPrimaryPhotoUrl
 *   - client: getHeroPhoto / getValidPhotoMedia / isPhotoMedia (listing-card-media)
 *
 * Because all surfaces use these, the contract test covers all surfaces; the
 * companion guard test (hero-selection-guard) enforces that they keep using it.
 */
import { classifyMediaItem, resolveListingMedia, pickPrimaryPhotoUrl } from '../listing-media-resolver';
import { isPhotoMedia, getHeroPhoto, LISTING_PLACEHOLDER_IMAGE } from '../listing-card-media';

const DOC = 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/123/1/x';
const PHOTO = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/123/2/x';
const R2_FP = 'https://pub-x.r2.dev/floorplans/RLS123/1.jpg';
const R2_PHOTO = 'https://pub-x.r2.dev/photos/RLS123/1.jpg';
const PROXIED_DOC = '/api/media/proxy?url=' + encodeURIComponent(DOC);

describe('classifyMediaItem — floor plans never classified as photos', () => {
  it('MediaCategory=null + DOCUMENT- URL → floorplan', () => {
    expect(classifyMediaItem({ MediaCategory: null, MediaURL: DOC })).toBe('floorplan');
  });
  it('empty mediaType + floor-plan URL → floorplan', () => {
    expect(classifyMediaItem({ mediaType: '', url: R2_FP })).toBe('floorplan');
  });
  it('proxied percent-encoded DOCUMENT- URL → floorplan', () => {
    expect(classifyMediaItem({ MediaCategory: null, MediaURL: PROXIED_DOC })).toBe('floorplan');
  });
  it('.pdf document (null category) → floorplan', () => {
    expect(classifyMediaItem({ MediaCategory: null, MediaURL: 'https://x.example/site/plan.pdf' })).toBe('floorplan');
  });
  it('real Cotality + R2 photos → photo', () => {
    expect(classifyMediaItem({ MediaCategory: 'Photo', MediaURL: PHOTO })).toBe('photo');
    expect(classifyMediaItem({ MediaCategory: null, MediaURL: R2_PHOTO })).toBe('photo');
  });
});

describe('resolveListingMedia / pickPrimaryPhotoUrl — hero selection', () => {
  it('floor plan first in raw array AND same numeric Order → the photo is primary', () => {
    const items = [
      { MediaURL: DOC, MediaCategory: 'FloorPlan', Order: 1 },
      { MediaURL: PHOTO, MediaCategory: 'Photo', Order: 1 },
    ];
    const r = resolveListingMedia(items);
    expect(r[0].class).toBe('photo');
    expect(r[0].isPrimary).toBe(true);
  });

  it('null-category floor plan at Order 0 does NOT become the primary photo', () => {
    const items = [
      { MediaURL: DOC, MediaCategory: null, Order: 0 },
      { MediaURL: PHOTO, MediaCategory: 'Photo', Order: 5 },
    ];
    const primary = pickPrimaryPhotoUrl(items);
    expect(primary).toBeTruthy();
    expect(primary!).not.toMatch(/document-/i);
    expect(primary!).toMatch(/photo-jpeg/i);
  });

  it('no real photo → pickPrimaryPhotoUrl returns null (surfaces render placeholder, never a floor plan)', () => {
    expect(pickPrimaryPhotoUrl([{ MediaURL: DOC, MediaCategory: 'FloorPlan', Order: 1 }])).toBeNull();
    expect(pickPrimaryPhotoUrl([{ MediaURL: R2_FP, mediaType: '', Order: 1 }])).toBeNull();
  });
});

describe('client getHeroPhoto / isPhotoMedia', () => {
  it('rejects a floor-plan URL even when mediaType is empty → placeholder', () => {
    expect(isPhotoMedia({ url: R2_FP, mediaType: '' })).toBe(false);
    expect(getHeroPhoto([{ url: R2_FP, mediaType: '', order: 1 }])).toBe(LISTING_PLACEHOLDER_IMAGE);
  });
  it('picks the photo when a floor plan sorts first by numeric order', () => {
    const media = [
      { url: R2_FP, mediaType: 'FloorPlan', order: 1 },
      { url: R2_PHOTO, mediaType: 'Photo', order: 2 },
    ];
    expect(getHeroPhoto(media)).toBe(R2_PHOTO);
  });
  it('selection is type/order-driven only — sale and rental cards get identical results', () => {
    // Public sale & rental both call getHeroPhoto on resolver-sorted DTO media; there is
    // no listing-type branch. Same media in → same hero out.
    const media = [
      { url: R2_FP, mediaType: 'FloorPlan', order: 0 },
      { url: R2_PHOTO, mediaType: 'Photo', order: 1 },
    ];
    expect(getHeroPhoto(media)).toBe(R2_PHOTO);
  });
});
