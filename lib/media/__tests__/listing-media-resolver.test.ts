import {
  classifyMediaItem,
  resolveListingMedia,
  pickPrimaryPhotoUrl,
  pickBestThumbnailUrl,
  proxyTrestleUrl,
} from '@/lib/media/listing-media-resolver';

describe('classifyMediaItem', () => {
  it('classifies an explicit Photo MediaCategory as photo', () => {
    expect(classifyMediaItem({ MediaCategory: 'Photo' })).toBe('photo');
  });

  it('classifies FloorPlan via MediaCategory', () => {
    expect(classifyMediaItem({ MediaCategory: 'FloorPlan' })).toBe('floorplan');
  });

  it('classifies "Floor Plan" with space via MediaCategory', () => {
    expect(classifyMediaItem({ MediaCategory: 'Floor Plan' })).toBe('floorplan');
  });

  it('classifies as floorplan when MediaClassification is Document', () => {
    expect(classifyMediaItem({ MediaClassification: 'Document' })).toBe('floorplan');
  });

  it('classifies as floorplan via ShortDescription "FloorPlan"', () => {
    expect(classifyMediaItem({ ShortDescription: 'FloorPlan A1' })).toBe('floorplan');
  });

  it('classifies as floorplan via /floorplans/ path in URL', () => {
    expect(
      classifyMediaItem({
        MediaURL: 'https://api.cotality.com/trestle/Media/Property/floorplans/x.jpg',
      })
    ).toBe('floorplan');
  });

  it('classifies Video via MediaCategory', () => {
    expect(classifyMediaItem({ MediaCategory: 'Video' })).toBe('video');
  });

  it('classifies VirtualTour via MediaCategory', () => {
    expect(classifyMediaItem({ MediaCategory: 'VirtualTour' })).toBe('virtualTour');
  });

  it('defaults missing MediaCategory to photo (Trestle convention — bare Media rows are photos)', () => {
    expect(classifyMediaItem({ MediaURL: 'https://example.com/img.jpg' })).toBe('photo');
  });

  it('returns unknown for non-object input', () => {
    expect(classifyMediaItem(null)).toBe('unknown');
    expect(classifyMediaItem('string')).toBe('unknown');
  });

  it('also accepts the DTO shape (mediaType field)', () => {
    expect(classifyMediaItem({ mediaType: 'Photo', url: 'x' })).toBe('photo');
    expect(classifyMediaItem({ mediaType: 'FloorPlan', url: 'x' })).toBe('floorplan');
  });
});

describe('resolveListingMedia — photo-first ordering', () => {
  // ── Core invariant: floorplan-then-photo must end with photo first ──

  it('floorplan first, photo second → primary is the photo', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan', Order: 1 },
      { MediaURL: 'https://x.com/p.jpg', MediaCategory: 'Photo', Order: 2 },
    ]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].class).toBe('photo');
    expect(sorted[0].isPrimary).toBe(true);
    expect(sorted[1].class).toBe('floorplan');
    expect(sorted[1].isPrimary).toBe(false);
  });

  it('preserves provider order within the photo class', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://x.com/p3.jpg', MediaCategory: 'Photo', Order: 3 },
      { MediaURL: 'https://x.com/p1.jpg', MediaCategory: 'Photo', Order: 1 },
      { MediaURL: 'https://x.com/p2.jpg', MediaCategory: 'Photo', Order: 2 },
    ]);
    expect(sorted.map(s => s.url)).toEqual([
      'https://x.com/p1.jpg',
      'https://x.com/p2.jpg',
      'https://x.com/p3.jpg',
    ]);
  });

  it('photos preserve their order; floorplans appended after', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan', Order: 1 },
      { MediaURL: 'https://x.com/p2.jpg', MediaCategory: 'Photo', Order: 2 },
      { MediaURL: 'https://x.com/p1.jpg', MediaCategory: 'Photo', Order: 1 },
    ]);
    expect(sorted.map(s => ({ class: s.class, url: s.url }))).toEqual([
      { class: 'photo', url: 'https://x.com/p1.jpg' },
      { class: 'photo', url: 'https://x.com/p2.jpg' },
      { class: 'floorplan', url: 'https://x.com/fp.jpg' },
    ]);
  });

  it('only floorplans → primary falls back to first floorplan (with isPrimary=true)', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://x.com/a.jpg', MediaCategory: 'FloorPlan', Order: 1 },
      { MediaURL: 'https://x.com/b.jpg', MediaCategory: 'FloorPlan', Order: 2 },
    ]);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].class).toBe('floorplan');
    expect(sorted[0].isPrimary).toBe(true);
  });

  it('empty input returns empty array', () => {
    expect(resolveListingMedia([])).toEqual([]);
  });

  it('non-array input returns empty array', () => {
    expect(resolveListingMedia(null)).toEqual([]);
    expect(resolveListingMedia(undefined)).toEqual([]);
    expect(resolveListingMedia('not-an-array')).toEqual([]);
  });

  it('drops items without a URL', () => {
    const sorted = resolveListingMedia([
      { MediaURL: '', MediaCategory: 'Photo' },
      { MediaURL: 'https://x.com/p.jpg', MediaCategory: 'Photo' },
    ]);
    expect(sorted).toHaveLength(1);
  });

  it('PreferredPhotoYN=true puts that photo first, ahead of Order=1', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://x.com/o1.jpg', MediaCategory: 'Photo', Order: 1 },
      { MediaURL: 'https://x.com/pref.jpg', MediaCategory: 'Photo', Order: 5, PreferredPhotoYN: true },
      { MediaURL: 'https://x.com/o2.jpg', MediaCategory: 'Photo', Order: 2 },
    ]);
    expect(sorted[0].url).toBe('https://x.com/pref.jpg');
    expect(sorted[0].preferred).toBe(true);
  });

  it('proxies Trestle hosts but leaves R2/CDN URLs alone', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://api.cotality.com/trestle/Media/Property/x.jpg', MediaCategory: 'Photo' },
      { MediaURL: 'https://pub-xyz.r2.dev/photos/x.jpg', MediaCategory: 'Photo' },
    ]);
    expect(sorted[0].url).toBe(
      '/api/media/proxy?url=' + encodeURIComponent('https://api.cotality.com/trestle/Media/Property/x.jpg')
    );
    expect(sorted[1].url).toBe('https://pub-xyz.r2.dev/photos/x.jpg');
  });

  it('proxies all *.cotality.com subdomains (api, img, future CDNs)', () => {
    expect(proxyTrestleUrl('https://img.cotality.com/Media/x.jpg')).toContain('/api/media/proxy?url=');
    expect(proxyTrestleUrl('https://cdn.cotality.com/x.jpg')).toContain('/api/media/proxy?url=');
  });

  it('proxies bare cotality.com host (no subdomain)', () => {
    expect(proxyTrestleUrl('https://cotality.com/x.jpg')).toContain('/api/media/proxy?url=');
  });

  it('does NOT proxy lookalike domains', () => {
    // notcotality.com has cotality.com as a substring but is not a subdomain
    expect(proxyTrestleUrl('https://notcotality.com/x.jpg')).toBe('https://notcotality.com/x.jpg');
    expect(proxyTrestleUrl('https://cotality.com.evil.example/x.jpg')).toBe('https://cotality.com.evil.example/x.jpg');
  });

  it('handles DTO shape (lower-case fields)', () => {
    const sorted = resolveListingMedia([
      { url: 'https://x.com/fp.jpg', mediaType: 'FloorPlan', order: 1 },
      { url: 'https://x.com/p.jpg', mediaType: 'Photo', order: 2 },
    ]);
    expect(sorted[0].class).toBe('photo');
    expect(sorted[0].isPrimary).toBe(true);
  });

  it('exactly one isPrimary in the output (or zero if input empty)', () => {
    const sorted = resolveListingMedia([
      { MediaURL: 'https://x.com/p1.jpg', MediaCategory: 'Photo' },
      { MediaURL: 'https://x.com/p2.jpg', MediaCategory: 'Photo' },
      { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan' },
    ]);
    const primaries = sorted.filter(s => s.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].class).toBe('photo');
  });
});

describe('pickPrimaryPhotoUrl — strict photo only', () => {
  it('returns first photo URL', () => {
    expect(
      pickPrimaryPhotoUrl([
        { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan' },
        { MediaURL: 'https://x.com/p.jpg', MediaCategory: 'Photo' },
      ])
    ).toBe('https://x.com/p.jpg');
  });

  it('returns null when only floorplans exist', () => {
    expect(
      pickPrimaryPhotoUrl([
        { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan' },
      ])
    ).toBeNull();
  });

  it('returns null when input is empty', () => {
    expect(pickPrimaryPhotoUrl([])).toBeNull();
  });
});

describe('pickBestThumbnailUrl — fallback chain', () => {
  it('prefers photo over floorplan', () => {
    expect(
      pickBestThumbnailUrl([
        { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan' },
        { MediaURL: 'https://x.com/p.jpg', MediaCategory: 'Photo' },
      ])
    ).toBe('https://x.com/p.jpg');
  });

  it('falls back to floorplan when no photo', () => {
    expect(
      pickBestThumbnailUrl([
        { MediaURL: 'https://x.com/fp.jpg', MediaCategory: 'FloorPlan' },
      ])
    ).toBe('https://x.com/fp.jpg');
  });

  it('returns null when input is empty', () => {
    expect(pickBestThumbnailUrl([])).toBeNull();
  });
});

describe('proxyTrestleUrl', () => {
  it('proxies api.cotality.com URLs', () => {
    expect(proxyTrestleUrl('https://api.cotality.com/trestle/Media/Property/x.jpg')).toContain(
      '/api/media/proxy?url='
    );
  });

  it('proxies legacy CoreLogic URLs (warranty period through 2026)', () => {
    expect(proxyTrestleUrl('https://api-trestle.corelogic.com/path/img.jpg')).toContain(
      '/api/media/proxy?url='
    );
    expect(proxyTrestleUrl('https://api-prod.corelogic.com/path/img.jpg')).toContain(
      '/api/media/proxy?url='
    );
  });

  it('passes R2 URLs through unchanged', () => {
    const r2 = 'https://pub-xyz.r2.dev/photos/RLS123/0.jpg';
    expect(proxyTrestleUrl(r2)).toBe(r2);
  });

  it('passes through invalid URL strings unchanged', () => {
    expect(proxyTrestleUrl('not a url')).toBe('not a url');
  });

  it('handles empty string', () => {
    expect(proxyTrestleUrl('')).toBe('');
  });
});
