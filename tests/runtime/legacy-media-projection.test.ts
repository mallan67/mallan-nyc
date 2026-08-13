/**
 * The legacy `listings.media` projection, extracted so ONE transformation
 * serves both the Property batch-media path and the media-sync compatibility
 * projection while ownership moves to the PCT path.
 *
 * sync.ts currently carries THREE separate inline copies of this mapping
 * (lines 1134, 1676, 2362). Adding a fourth in media-sync is how the
 * representations drift; extracting first is what prevents it.
 */
import { projectLegacyMedia, providerRowsOnly } from '@/lib/media/legacy-media-projection';

const isCrm = (k: string) => k.startsWith('crm:');

describe('projectLegacyMedia', () => {
  it('maps url / mediaType / order exactly as the inline versions do', () => {
    expect(projectLegacyMedia([
      { MediaURL: 'https://x/1.jpg', MediaCategory: 'Photo', Order: 2 },
    ])).toEqual([{ url: 'https://x/1.jpg', mediaType: 'Photo', order: 2 }]);
  });

  it('sorts the preferred photo to -1 so the hero leads', () => {
    const out = projectLegacyMedia([
      { MediaURL: 'https://x/a.jpg', MediaCategory: 'Photo', Order: 5, PreferredPhotoYN: true },
      { MediaURL: 'https://x/b.jpg', MediaCategory: 'Photo', Order: 0 },
    ]);
    expect(out[0].order).toBe(-1);
    expect(out[1].order).toBe(0);
  });

  it('accepts the string "true" form the feed also emits', () => {
    expect(projectLegacyMedia([
      { MediaURL: 'https://x/a.jpg', MediaCategory: 'Photo', PreferredPhotoYN: 'true' },
    ])[0].order).toBe(-1);
  });

  it('classifies a FloorPlan as FloorPlan, not Photo', () => {
    // The shared classifier exists because an earlier `includes("floor plan")`
    // check missed Trestle's actual "FloorPlan" enum and rendered floor plans
    // as hero photos.
    expect(projectLegacyMedia([
      { MediaURL: 'https://x/fp.jpg', MediaCategory: 'FloorPlan' },
    ])[0].mediaType).toBe('FloorPlan');
  });

  it('drops rows with no MediaURL, as the inline versions do', () => {
    expect(projectLegacyMedia([
      { MediaURL: null, MediaCategory: 'Photo' },
      { MediaCategory: 'Photo' },
    ])).toEqual([]);
  });

  it('an authoritative EMPTY set projects to an empty array', () => {
    // A resolved fetch with no rows is authoritative empty and may clear the
    // compatibility JSON. An INCOMPLETE fetch throws upstream and never
    // reaches this function.
    expect(projectLegacyMedia([])).toEqual([]);
  });

  it('missing Order coerces to 0 rather than NaN', () => {
    expect(projectLegacyMedia([{ MediaURL: 'https://x/a.jpg', MediaCategory: 'Photo' }])[0].order).toBe(0);
  });
});

describe('providerRowsOnly', () => {
  it('excludes crm:-namespaced rows from a feed-derived projection', () => {
    const out = providerRowsOnly([
      { MediaURL: 'https://x/a.jpg', MediaKey: '123' },
      { MediaURL: 'https://x/b.jpg', MediaKey: 'crm:SL-1:abc' },
    ], isCrm);
    expect(out).toHaveLength(1);
    expect(out[0].MediaKey).toBe('123');
  });

  it('is a provider-input filter, NOT the listing ownership decision', () => {
    // A Mallan-owned LISTING must be protected at the write site even when its
    // provider rows look ordinary — filtering keys alone cannot express that.
    const ordinaryRows = [{ MediaURL: 'https://x/a.jpg', MediaKey: '999' }];
    expect(providerRowsOnly(ordinaryRows, isCrm)).toHaveLength(1);
  });
});
