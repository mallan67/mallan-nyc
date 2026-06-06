/// <reference types="jest" />
/**
 * PR-Hero JSON-Fallback Safety.
 *
 * DB probe (2026-06-06): 5,998 of 10,695 active listings have NO active
 * `listing_media` and fall back to the legacy `listings.media` JSON via
 * `resolveListingMedia`. That path (a) had NO dedupe (table path dedupes via
 * visualIdentity) and (b) classified category-less floor-plan/document items as
 * Photo (`classifyMediaItem` empty-category → 'photo'), so a document-looking
 * URL could become the card hero.
 *
 * This suite pins: JSON-path dedupe parity + stronger document/floor-plan URL
 * detection, so the card hero is always a real Photo (never FloorPlan/document),
 * while the table-backed path is unchanged.
 */
import {
  classifyMediaItem,
  resolveListingMedia,
  resolveListingMediaFromRows,
  type ListingMediaTableRow,
} from '@/lib/media/listing-media-resolver';
import { getHeroPhoto, LISTING_PLACEHOLDER_IMAGE } from '@/lib/media/listing-card-media';

// Mirror the DTO mapping (db-to-public-dto): resolveListingMedia → card media[].
function toCardMedia(resolved: ReturnType<typeof resolveListingMedia>) {
  return resolved.map((m) => ({ url: m.url, mediaType: m.mediaType, order: m.providerOrder }));
}
const heroOf = (items: unknown[]) =>
  getHeroPhoto(toCardMedia(resolveListingMedia(items, { mapUrl: (u: string) => u })));

describe('classifyMediaItem — document/floor-plan URL detection with empty category', () => {
  it('Trestle DOCUMENT- URL with empty MediaCategory is NOT a photo', () => {
    expect(classifyMediaItem({ MediaCategory: '', MediaURL: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Jpeg/x.jpg' })).toBe('floorplan');
  });
  it('floor-plan filename with empty category is NOT a photo', () => {
    expect(classifyMediaItem({ MediaCategory: '', MediaURL: 'https://cdn.example.com/123/floorplan-2g.jpg' })).toBe('floorplan');
    expect(classifyMediaItem({ MediaCategory: '', MediaURL: 'https://cdn.example.com/123/floor_plan.png' })).toBe('floorplan');
  });
  it('.pdf with empty category is NOT a photo', () => {
    expect(classifyMediaItem({ MediaCategory: '', MediaURL: 'https://cdn.example.com/123/site-plan.pdf' })).toBe('floorplan');
  });
  it('a normal category-less photo URL is still a Photo (no false positives)', () => {
    expect(classifyMediaItem({ MediaCategory: '', MediaURL: 'https://cdn.example.com/123/00012.jpg' })).toBe('photo');
  });
});

describe('resolveListingMedia (JSON path) — dedupe + hero safety', () => {
  it('dedupes duplicate URLs in the legacy JSON (parity with the table path)', () => {
    const items = [
      { MediaCategory: 'Photo', MediaURL: 'https://cdn.example.com/a/1.jpg', Order: 0 },
      { MediaCategory: 'Photo', MediaURL: 'https://cdn.example.com/a/1.jpg', Order: 5 }, // dup
      { MediaCategory: 'Photo', MediaURL: 'https://cdn.example.com/a/2.jpg', Order: 1 },
    ];
    const out = resolveListingMedia(items, { mapUrl: (u: string) => u });
    expect(out.filter((m) => m.url === 'https://cdn.example.com/a/1.jpg')).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it('valid Photo remains the hero', () => {
    const items = [{ MediaCategory: 'Photo', MediaURL: 'https://cdn.example.com/a/1.jpg', Order: 0 }];
    expect(heroOf(items)).toBe('https://cdn.example.com/a/1.jpg');
  });

  it('FloorPlan first (order 0) + Photo second → the Photo becomes hero, NOT the floor plan', () => {
    const items = [
      { MediaCategory: 'FloorPlan', MediaURL: 'https://cdn.example.com/a/fp.jpg', Order: 0 },
      { MediaCategory: 'Photo', MediaURL: 'https://cdn.example.com/a/1.jpg', Order: 1 },
    ];
    expect(heroOf(items)).toBe('https://cdn.example.com/a/1.jpg');
  });

  it('category-less document/floor-plan first + Photo second → Photo becomes hero', () => {
    const items = [
      { MediaCategory: '', MediaURL: 'https://cdn.example.com/a/floorplan.jpg', Order: 0 },
      { MediaCategory: '', MediaURL: 'https://cdn.example.com/a/1.jpg', Order: 1 },
    ];
    expect(heroOf(items)).toBe('https://cdn.example.com/a/1.jpg');
  });

  it('all non-photo media → placeholder (never a floor plan as hero)', () => {
    const items = [
      { MediaCategory: 'FloorPlan', MediaURL: 'https://cdn.example.com/a/fp.jpg', Order: 0 },
      { MediaCategory: '', MediaURL: 'https://cdn.example.com/a/diagram.pdf', Order: 1 },
    ];
    expect(heroOf(items)).toBe(LISTING_PLACEHOLDER_IMAGE);
  });

  // ── Codex #363: dedupe must key on the SOURCE URL, not the proxied URL ──
  // The default mapper (`proxyTrestleUrl`) rewrites every Cotality/CoreLogic
  // URL to `/api/media/proxy?url=<encoded>`. `visualIdentity` strips the query,
  // so keying on the proxied URL would give every proxied item the identical
  // key `/api/media/proxy` and collapse a whole gallery to one image. These
  // tests exercise the DEFAULT mapper (no mapUrl) — the real JSON-fallback path.
  it('does NOT collapse distinct Cotality photos under the default proxy mapper', () => {
    const items = [
      { MediaCategory: 'Photo', MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/1.jpg', Order: 0 },
      { MediaCategory: 'Photo', MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/2.jpg', Order: 1 },
      { MediaCategory: 'Photo', MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/3.jpg', Order: 2 },
    ];
    const out = resolveListingMedia(items); // default mapper proxies the URLs
    expect(out).toHaveLength(3);
    expect(out.every((m) => m.url.startsWith('/api/media/proxy'))).toBe(true);
  });

  it('DOES collapse a true duplicate Cotality source URL under the default proxy mapper', () => {
    const items = [
      { MediaCategory: 'Photo', MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/1.jpg', Order: 0 },
      { MediaCategory: 'Photo', MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/1.jpg', Order: 5 }, // dup source
    ];
    expect(resolveListingMedia(items)).toHaveLength(1);
  });

  // ── Codex #363 follow-up: already-proxied DTO-shape input ──
  // The resolver's contract accepts "pre-mapped DTO entries" — i.e. `url` is
  // ALREADY `/api/media/proxy?url=<encoded>` (persisted JSON / DTO re-feed).
  // The dedupe key must unwrap the proxy to the encoded SOURCE, else every
  // proxied item shares the `/api/media/proxy` pathname and collapses to one.
  const proxied = (src: string) => `/api/media/proxy?url=${encodeURIComponent(src)}`;

  it('does NOT collapse distinct pre-proxied DTO media (already-mapped input)', () => {
    const items = [
      { mediaType: 'Photo', url: proxied('https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/1.jpg'), order: 0 },
      { mediaType: 'Photo', url: proxied('https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/2.jpg'), order: 1 },
      { mediaType: 'Photo', url: proxied('https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/3.jpg'), order: 2 },
    ];
    expect(resolveListingMedia(items)).toHaveLength(3);
  });

  it('DOES collapse duplicate pre-proxied DTO media that point at the same source', () => {
    const src = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/1.jpg';
    const items = [
      { mediaType: 'Photo', url: proxied(src), order: 0 },
      { mediaType: 'Photo', url: proxied(src), order: 5 },
    ];
    expect(resolveListingMedia(items)).toHaveLength(1);
  });
});

describe('table-backed path (resolveListingMediaFromRows) — unchanged', () => {
  it('still dedupes + sorts photos first', () => {
    const rows: ListingMediaTableRow[] = [
      { media_url_original: 'https://cdn.example.com/a/fp.jpg', media_url_cached: null, media_type: 'FloorPlan', media_category: 'FloorPlan', media_classification: null, order: 0, preferred_photo_yn: false, status: 'active' },
      { media_url_original: 'https://cdn.example.com/a/1.jpg', media_url_cached: null, media_type: 'Photo', media_category: 'Photo', media_classification: null, order: 1, preferred_photo_yn: false, status: 'active' },
    ];
    const out = resolveListingMediaFromRows(rows);
    expect(out[0].mediaType).toBe('Photo'); // photo sorts before floor plan
  });
});
