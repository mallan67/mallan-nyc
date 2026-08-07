/**
 * COMMIT 3 ACCEPTANCE — one canonical DB→public media composition.
 *
 * Reproduces the production incident shape (RLS20105333: 1 R2-cached hero + 66
 * Cotality-only rows) and pins the invariants that made it possible.
 */

import { composeDbPublicMedia } from '../db-media-composition';
import {
  isProxiedMediaUrl,
  isNestedOrInvalidProxyUrl,
  unwrapProxiedMediaUrl,
  toPublicMediaUrl,
} from '../proxy-url-policy';

const COTALITY = (n: number) =>
  `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801399${n}/1/AAA/BBB/CCC${n}`;
const R2_HERO =
  'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20105333/1.jpg';

/** Post-policy production shape: ONE R2-cached hero + N Cotality-only rows. */
function postPolicyRows(cotalityCount: number) {
  const rows: Record<string, unknown>[] = [{
    media_url_original: COTALITY(0), media_url_cached: R2_HERO,
    media_type: 'Photo', media_category: 'Photo', media_classification: null,
    order: 0, preferred_photo_yn: true, status: 'active',
  }];
  for (let i = 1; i <= cotalityCount; i++) {
    rows.push({
      media_url_original: COTALITY(i), media_url_cached: null,
      media_type: 'Photo', media_category: 'Photo', media_classification: null,
      order: i, preferred_photo_yn: false, status: 'active',
    });
  }
  return rows;
}

const compose = (rows: unknown[], over: Record<string, unknown> = {}) =>
  composeDbPublicMedia({
    listingId: 'RLS20105333',
    rlsEligible: true,
    tableRows: rows as never,
    legacyMedia: [],
    hadRelationalRows: true,
    ...over,
  } as never);

describe('the 67-photo incident', () => {
  it('1 R2 hero + 66 Cotality-only -> 67 canonical media, photoCount 67', () => {
    const { media, photoCount } = compose(postPolicyRows(66));
    expect(media).toHaveLength(67);
    expect(photoCount).toBe(67);
  });

  it('67 source identities -> 67 resolved identities (nothing collapses)', () => {
    const { media } = compose(postPolicyRows(66));
    expect(new Set(media.map((m) => m.url)).size).toBe(67);
  });

  it('the R2 hero survives unproxied and stays the hero', () => {
    const { media } = compose(postPolicyRows(66));
    expect(media[0].url).toBe(R2_HERO);
    expect(media[0].isPrimary).toBe(true);
  });
});

describe('proxy behaviour', () => {
  it('produces ZERO nested proxy URLs', () => {
    const { media } = compose(postPolicyRows(66));
    expect(media.filter((m) => isNestedOrInvalidProxyUrl(String(m.url)))).toHaveLength(0);
  });

  it('every proxied URL unwraps back to its approved absolute source', () => {
    const { media } = compose(postPolicyRows(66));
    const proxied = media.filter((m) => isProxiedMediaUrl(String(m.url)));
    expect(proxied).toHaveLength(66);
    for (const m of proxied) {
      expect(unwrapProxiedMediaUrl(String(m.url))).toMatch(/^https:\/\/api\.cotality\.com\//);
    }
  });

  it('re-applying the public mapping is a no-op (idempotent, cannot nest)', () => {
    const { media } = compose(postPolicyRows(10));
    for (const m of media) {
      expect(toPublicMediaUrl(String(m.url))).toBe(m.url);
    }
  });

  it('an unapproved cotality-looking host is never turned into a proxy request', () => {
    const rows = [{
      media_url_original: 'https://evil.cotality.com/x.jpg', media_url_cached: null,
      media_type: 'Photo', media_category: 'Photo', media_classification: null,
      order: 0, preferred_photo_yn: true, status: 'active',
    }];
    const { media } = compose(rows);
    expect(media[0].url).toBe('https://evil.cotality.com/x.jpg');
    expect(isProxiedMediaUrl(String(media[0].url))).toBe(false);
  });
});

describe('identity', () => {
  it('10 distinct Cotality sources -> 10 distinct assets (no /api/media/proxy collapse)', () => {
    const { media } = compose(postPolicyRows(10));
    const proxied = media.filter((m) => isProxiedMediaUrl(String(m.url)));
    expect(proxied).toHaveLength(10);
    // Identity must come from the ENCODED SOURCE, never the shared proxy path.
    const sources = proxied.map((m) => unwrapProxiedMediaUrl(String(m.url)));
    expect(new Set(sources).size).toBe(10);
  });
});

describe('classification', () => {
  const mixed = [
    { media_url_original: COTALITY(1), media_url_cached: null, media_type: 'Photo',
      media_category: 'Photo', media_classification: null, order: 0,
      preferred_photo_yn: false, status: 'active' },
    { media_url_original: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/1/1/A/B/C',
      media_url_cached: null, media_type: 'Document', media_category: 'Floor Plan',
      media_classification: 'FloorPlan', order: 1, preferred_photo_yn: false, status: 'active' },
  ];

  it('a FloorPlan is not counted as a Photo', () => {
    const { media, photoCount } = compose(mixed);
    expect(media).toHaveLength(2);
    expect(photoCount).toBe(1);
  });

  it('a FloorPlan never becomes the hero while a photo exists', () => {
    const { media } = compose(mixed);
    expect(media[0].mediaType).toBe('Photo');
    expect(media[0].isPrimary).toBe(true);
  });
});

describe('ownership and legacy fallback', () => {
  const legacy = [{ MediaURL: COTALITY(9), MediaCategory: 'Photo', Order: 0 }];

  it('Mallan-owned with rows that existed but are all deleted -> NOT resurrected', () => {
    const { media } = compose([], {
      listingId: 'SL-0004',
      rlsEligible: false,
      legacyMedia: legacy,
      hadRelationalRows: true,   // rows existed; all now deleted
    });
    expect(media).toHaveLength(0);
  });

  it('Mallan-owned with UNKNOWN all-status existence -> fails closed', () => {
    const { media } = compose([], {
      listingId: 'SL-0004',
      rlsEligible: false,
      legacyMedia: legacy,
      hadRelationalRows: undefined,
    });
    expect(media).toHaveLength(0);
  });

  it('photoCount is derived from the SAME array the DTO publishes', () => {
    const { media, photoCount } = compose(postPolicyRows(20));
    expect(photoCount).toBe(media.filter((m) => m.mediaType === 'Photo').length);
  });
});
