/**
 * CANONICAL MEDIA COMPOSER — proves the two authorities compose into one view
 * without losing any legitimate media class, and without a DB query.
 *
 *   listing_media          = assets  (Photo, FloorPlan, real Video/Tour assets)
 *   listing_external_media = links   (YouTube/Vimeo, Matterport/iGuide, unknown)
 */
import {
  composeListingMedia,
  type ComposerAssetRow,
  type ComposerExternalRow,
} from '@/lib/media/canonical-media-composer';

const asset = (over: Partial<ComposerAssetRow> = {}): ComposerAssetRow => ({
  media_key: 'k',
  media_type: 'Photo',
  media_url_original: 'https://cdn.example/p.jpg',
  order: 0,
  preferred_photo_yn: false,
  status: 'active',
  ...over,
});

const link = (over: Partial<ComposerExternalRow> = {}): ComposerExternalRow => ({
  source: 'cotality_property',
  source_key: 'VirtualTourURLUnbranded',
  url: 'https://youtu.be/aaa',
  branded: false,
  kind: 'video',
  ...over,
});

describe('composer preserves every legitimate media class', () => {
  it('separates photos, floorplans, video assets and tour assets', () => {
    const out = composeListingMedia(
      [
        asset({ media_key: 'p1', media_type: 'Photo', order: 1 }),
        asset({ media_key: 'p2', media_type: 'Photo', order: 0 }),
        asset({ media_key: 'f1', media_type: 'FloorPlan' }),
        asset({ media_key: 'v1', media_type: 'Video' }),
        asset({ media_key: 't1', media_type: 'VirtualTour' }),
      ],
      [],
    );
    expect(out.photos.map((p) => p.media_key)).toEqual(['p2', 'p1']); // order preserved
    expect(out.floorPlans).toHaveLength(1);
    expect(out.videoAssets).toHaveLength(1);
    expect(out.tourAssets).toHaveLength(1);
    expect(out.photoCount).toBe(2);
  });

  it('a FloorPlan is NOT counted as a photo and NEVER becomes the hero', () => {
    const out = composeListingMedia(
      [
        // Source metadata really does carry this: production has a FloorPlan
        // row with preferred_photo_yn = true. It must not win hero selection.
        asset({ media_key: 'f1', media_type: 'FloorPlan', preferred_photo_yn: true }),
        asset({ media_key: 'p1', media_type: 'Photo' }),
      ],
      [],
    );
    expect(out.hero?.media_key).toBe('p1');
    expect(out.photoCount).toBe(1);
  });

  it('a deleted row cannot become the hero and is excluded entirely', () => {
    const out = composeListingMedia(
      [
        asset({ media_key: 'gone', status: 'deleted', preferred_photo_yn: true }),
        asset({ media_key: 'live' }),
      ],
      [],
    );
    expect(out.hero?.media_key).toBe('live');
    expect(out.photos).toHaveLength(1);
  });

  it('preferred_photo_yn breaks ties only WITHIN active photos', () => {
    const out = composeListingMedia(
      [
        asset({ media_key: 'p1', order: 0 }),
        asset({ media_key: 'p2', order: 1, preferred_photo_yn: true }),
      ],
      [],
    );
    expect(out.hero?.media_key).toBe('p2');
  });

  it('no photos at all yields a null hero — never a floorplan substitute', () => {
    const out = composeListingMedia([asset({ media_type: 'FloorPlan' })], []);
    expect(out.hero).toBeNull();
    expect(out.photoCount).toBe(0);
  });
});

describe('composer surfaces external links correctly', () => {
  it('splits video / virtual_tour / unknown without relabelling', () => {
    const out = composeListingMedia(
      [],
      [
        link({ url: 'https://youtu.be/a', kind: 'video' }),
        link({ source_key: 'VirtualTourURLUnbranded2', url: 'https://my.matterport.com/show/?m=b', kind: 'virtual_tour' }),
        link({ source_key: 'VirtualTourURLUnbranded3', url: 'https://www.zillow.com/x', kind: 'unknown' }),
      ],
    );
    expect(out.videos).toHaveLength(1);
    expect(out.virtualTours).toHaveLength(1);
    expect(out.unknownExternal).toHaveLength(1);
    // the unknown row is preserved but appears in NEITHER labelled bucket
    expect(out.videos.some((v) => v.url.includes('zillow'))).toBe(false);
    expect(out.virtualTours.some((v) => v.url.includes('zillow'))).toBe(false);
  });

  it('unsafe URLs are never surfaced', () => {
    const out = composeListingMedia(
      [],
      [
        link({ url: 'javascript:alert(1)', kind: 'unknown' }),
        link({ source_key: 'VirtualTourURLUnbranded2', url: '//evil.example/x', kind: 'unknown' }),
        link({ source_key: 'VirtualTourURLUnbranded3', url: 'https://youtu.be/ok', kind: 'video' }),
      ],
    );
    expect(out.videos).toHaveLength(1);
    expect(out.unknownExternal).toHaveLength(0);
  });

  it('an equivalent branded/unbranded pair shows once, unbranded winning', () => {
    const SAME = 'https://youtu.be/dup';
    const out = composeListingMedia(
      [],
      [
        link({ source_key: 'VirtualTourURLBranded', url: SAME, branded: true }),
        link({ source_key: 'VirtualTourURLUnbranded', url: SAME, branded: false }),
      ],
    );
    expect(out.videos).toHaveLength(1);
    expect(out.videos[0].branded).toBe(false);
    expect(out.videos[0].source_key).toBe('VirtualTourURLUnbranded');
  });

  it('CRM links compose alongside Cotality links', () => {
    const out = composeListingMedia(
      [],
      [
        link({ url: 'https://youtu.be/cot' }),
        link({ source: 'crm', source_key: 'crm-em-7', url: 'https://vimeo.com/77' }),
      ],
    );
    expect(out.videos).toHaveLength(2);
    expect(out.videos.map((v) => v.source).sort()).toEqual(['cotality_property', 'crm']);
  });

  it('badges reflect capability from EITHER authority', () => {
    const fromAsset = composeListingMedia([asset({ media_type: 'Video' })], []);
    expect(fromAsset.hasVideo).toBe(true);

    const fromLink = composeListingMedia([], [link({ kind: 'video' })]);
    expect(fromLink.hasVideo).toBe(true);

    const tourAsset = composeListingMedia([asset({ media_type: 'VirtualTour' })], []);
    expect(tourAsset.hasVirtualTour).toBe(true);

    const none = composeListingMedia([asset({ media_type: 'Photo' })], []);
    expect(none.hasVideo).toBe(false);
    expect(none.hasVirtualTour).toBe(false);
  });

  it('an unknown-only listing advertises neither video nor tour', () => {
    const out = composeListingMedia([], [link({ url: 'https://www.zillow.com/x', kind: 'unknown' })]);
    expect(out.hasVideo).toBe(false);
    expect(out.hasVirtualTour).toBe(false);
    expect(out.unknownExternal).toHaveLength(1); // preserved, not discarded
  });
});
