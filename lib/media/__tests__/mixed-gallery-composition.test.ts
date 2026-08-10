/**
 * MIXED GALLERY COMPOSITION — relational rows vs the legacy Cotality JSON.
 *
 * `resolveDbListingMedia` returned the relational rows the moment ANY of them
 * resolved, and only consulted the legacy `Listing.media` JSON when the
 * relational path yielded ZERO media. That is correct when the relational set
 * contains the feed photos, and wrong when it does not:
 *
 *   a listing whose Cotality photos still live only in the legacy JSON, plus
 *   ONE `crm:` upload, resolved to exactly that one CRM photo — the entire
 *   Cotality gallery disappeared from the public page.
 *
 * This was previously masked: `importJsonMediaToRows` used to copy the legacy
 * Cotality JSON into `crm:` rows, so the gallery survived as contamination.
 * With the provenance gate closing that path (lib/media/media-provenance.ts),
 * the composition has to be correct on its own.
 *
 * THE RULE keys on whether a FEED row exists relationally:
 *   - any non-`crm:` relational row  -> the relational set IS the feed set;
 *     it is authoritative and the legacy JSON is NOT replayed (otherwise
 *     tombstoned/deleted feed photos would resurrect).
 *   - relational rows are ALL `crm:` -> they are a supplement, not the gallery;
 *     the legacy Cotality JSON still supplies the feed photos.
 */

import { resolveDbListingMedia } from '@/lib/media/listing-media-resolver';

const THIRD_PARTY = { listingId: 'RLS20105333', rlsEligible: true };
const MALLAN_LOCAL = { listingId: 'SL-0004', rlsEligible: false };

function row(over: Record<string, unknown> = {}) {
  return {
    media_key: '1001',
    media_url_original: 'https://api.cotality.com/media/feed-1.jpg',
    media_url_cached: null,
    media_type: 'Photo',
    media_category: 'Photo',
    media_classification: null,
    order: 0,
    preferred_photo_yn: false,
    status: 'active',
    r2_key: null,
    ...over,
  } as never;
}

const legacyFeedJson = [
  { url: 'https://api.cotality.com/media/feed-1.jpg', mediaType: 'Photo', order: 0 },
  { url: 'https://api.cotality.com/media/feed-2.jpg', mediaType: 'Photo', order: 1 },
  { url: 'https://api.cotality.com/media/feed-3.jpg', mediaType: 'Photo', order: 2 },
];

describe('relational set CONTAINS feed rows — authoritative, no JSON replay', () => {
  it('does not resurrect legacy feed items', () => {
    // Only ONE feed row survives relationally (the others were tombstoned).
    // Replaying the JSON here would undelete them.
    const out = resolveDbListingMedia([row()], legacyFeedJson, THIRD_PARTY, {
      hadRelationalRows: true,
    });
    expect(out).toHaveLength(1);
  });

  it('feed rows + a crm: supplement stay authoritative together', () => {
    const out = resolveDbListingMedia(
      [row(), row({ media_key: 'crm:RLS20105333:aaa', media_url_original: 'https://cdn.example.test/mine.jpg', order: 9 })],
      legacyFeedJson,
      THIRD_PARTY,
      { hadRelationalRows: true },
    );
    expect(out).toHaveLength(2);
  });
});

describe('relational set is CRM-ONLY — the feed JSON is still the gallery', () => {
  it('one crm: row must NOT hide the entire Cotality gallery', () => {
    const out = resolveDbListingMedia(
      [row({ media_key: 'crm:RLS20105333:aaa', media_url_original: 'https://cdn.example.test/mine.jpg', order: 0 })],
      legacyFeedJson,
      THIRD_PARTY,
      { hadRelationalRows: true },
    );
    // 3 feed photos from the JSON + the 1 genuine CRM supplement.
    expect(out.length).toBe(4);
    const urls = out.map((m) => m.url).join(' ');
    expect(urls).toContain('feed-2.jpg');
    expect(urls).toContain('feed-3.jpg');
    expect(urls).toContain('mine.jpg');
  });

  it('does not duplicate a feed photo that is ALSO present as a crm: row', () => {
    // Historical contamination may have cloned a feed image into `crm:`.
    // Composition must dedupe on visual identity, not double it.
    const out = resolveDbListingMedia(
      [row({ media_key: 'crm:X:dup', media_url_original: 'https://api.cotality.com/media/feed-1.jpg' })],
      legacyFeedJson,
      THIRD_PARTY,
      { hadRelationalRows: true },
    );
    const feed1 = out.filter((m) => m.url.includes('feed-1.jpg'));
    expect(feed1).toHaveLength(1);
  });

  it('empty legacy JSON leaves the crm: rows alone', () => {
    const out = resolveDbListingMedia(
      [row({ media_key: 'crm:X:aaa', media_url_original: 'https://cdn.example.test/mine.jpg' })],
      [],
      THIRD_PARTY,
      { hadRelationalRows: true },
    );
    expect(out).toHaveLength(1);
  });
});

describe('MALLAN LOCAL listing — deletions stay authoritative', () => {
  it('a Mallan-owned listing with crm: rows does NOT replay its legacy JSON', () => {
    // On a Mallan-owned row the CRM rows ARE the gallery, and a deleted photo
    // must stay deleted. This is the pre-existing Mallan authority rule and it
    // must not be weakened by the CRM-only branch above.
    const out = resolveDbListingMedia(
      [row({ media_key: 'crm:SL-0004:aaa', media_url_original: 'https://cdn.example.test/mine.jpg' })],
      [
        { url: 'https://cdn.example.test/deleted-1.jpg', mediaType: 'Photo' },
        { url: 'https://cdn.example.test/deleted-2.jpg', mediaType: 'Photo' },
      ],
      MALLAN_LOCAL,
      { hadRelationalRows: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('mine.jpg');
  });
});

describe('pre-existing zero-relational behavior is unchanged', () => {
  it('third-party with no rows falls back to the legacy JSON', () => {
    const out = resolveDbListingMedia([], legacyFeedJson, THIRD_PARTY, { hadRelationalRows: false });
    expect(out).toHaveLength(3);
  });

  it('Mallan-owned with all rows deleted stays authoritatively empty', () => {
    const out = resolveDbListingMedia([], legacyFeedJson, MALLAN_LOCAL, { hadRelationalRows: true });
    expect(out).toHaveLength(0);
  });

  it('unknown existence FAILS CLOSED for Mallan-owned media', () => {
    const out = resolveDbListingMedia([], legacyFeedJson, MALLAN_LOCAL, {});
    expect(out).toHaveLength(0);
  });
});
