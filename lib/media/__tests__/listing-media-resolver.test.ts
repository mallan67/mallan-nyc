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

  it('classifies "floor_plan" with underscore via MediaCategory', () => {
    expect(classifyMediaItem({ MediaCategory: 'floor_plan' })).toBe('floorplan');
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

  // ── B1 fix (2026-05-08): Trestle DOCUMENT-* URL convention ──
  // Trestle stores FloorPlan documents under /Media/Property/DOCUMENT-Gif/,
  // DOCUMENT-Jpeg/, DOCUMENT-Pdf/, DOCUMENT-Png/ paths (vs. PHOTO-Jpeg/ for
  // actual photos). The diagnostic on 2026-05-08 found 243 active listings
  // rendering a FloorPlan as hero because the stored mediaType was empty/Photo
  // (Trestle sometimes ships FloorPlan media with `MediaCategory: null`) and
  // the resolver defaulted-to-Photo. The URL itself is the signal Trestle gives
  // us; the classifier now checks it explicitly.

  it('classifies DOCUMENT-Gif Trestle URL as floorplan (URL takes precedence over empty category)', () => {
    expect(
      classifyMediaItem({
        MediaURL:
          'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Gif/1156792071/1/abc/def/ghi',
      })
    ).toBe('floorplan');
  });

  it('classifies DOCUMENT-Jpeg Trestle URL as floorplan', () => {
    expect(
      classifyMediaItem({
        MediaURL:
          'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Jpeg/1156836474/1/abc/def/ghi',
      })
    ).toBe('floorplan');
  });

  it('classifies DOCUMENT-Pdf Trestle URL as floorplan', () => {
    expect(
      classifyMediaItem({
        MediaURL:
          'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/1156836474/1/abc/def/ghi',
      })
    ).toBe('floorplan');
  });

  it('classifies DOCUMENT-Png Trestle URL as floorplan', () => {
    expect(
      classifyMediaItem({
        MediaURL:
          'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Png/1156836474/1/abc/def/ghi',
      })
    ).toBe('floorplan');
  });

  it('URL takes precedence over mediaType when DOCUMENT- URL is paired with mediaType="Photo"', () => {
    // The B1 production scenario: stored row has mediaType="Photo" but URL
    // is a Trestle DOCUMENT-Gif (FloorPlan). URL is the source-of-truth signal.
    expect(
      classifyMediaItem({
        mediaType: 'Photo',
        url: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Gif/1156792071/1/abc/def/ghi',
      })
    ).toBe('floorplan');
  });

  it('classifies PHOTO-Jpeg Trestle URL as photo (regression guard)', () => {
    expect(
      classifyMediaItem({
        MediaURL:
          'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1156792071/1/abc/def/ghi',
      })
    ).toBe('photo');
  });

  it('classifies normal R2 photo URL as photo (regression guard)', () => {
    expect(
      classifyMediaItem({
        url: 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20089706/1.jpg',
        mediaType: 'Photo',
      })
    ).toBe('photo');
  });

  it('classifies R2 floorplan URL as floorplan (regression guard for prior /floorplans/ pattern)', () => {
    expect(
      classifyMediaItem({
        url: 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/floorplans/RLS20089512/1.jpg',
      })
    ).toBe('floorplan');
  });

  it('does not match arbitrary URLs containing the word "DOCUMENT" outside the Trestle path shape', () => {
    // Defensive: the Trestle DOCUMENT pattern must be anchored to
    // /Media/Property/DOCUMENT-{ext}/ so a benign URL with "document" in the
    // path doesn't get misclassified. (Fixture updated 2026-06-06 / PR-Hero:
    // the prior `…/documents/floorplan.jpg` now correctly classifies as
    // floorplan via the explicit `floorplan` filename token — see the
    // floor-plan-filename cases below — so this guard uses a token-free name.)
    expect(
      classifyMediaItem({
        url: 'https://example.com/documents/IMG_4821.jpg',
      })
    ).toBe('photo'); // default-to-photo path; no DOCUMENT-{ext} / floorplan signal
    expect(
      classifyMediaItem({
        url: 'https://example.com/some-document-name.jpg',
      })
    ).toBe('photo'); // default-to-photo path
  });

  // PR-Hero (2026-06-06): the legacy `listings.media` JSON fallback often
  // carries floor plans / documents with an EMPTY MediaCategory. URL-shape
  // detection must classify these as floorplan so they never become a card
  // hero — even though MediaCategory is blank (which otherwise defaults to
  // photo).
  it('classifies an empty-category item as floorplan from a "floorplan" filename token', () => {
    expect(classifyMediaItem({ MediaCategory: '', url: 'https://cdn.example.com/123/floorplan-2g.jpg' })).toBe('floorplan');
    expect(classifyMediaItem({ MediaCategory: '', url: 'https://cdn.example.com/123/floor_plan.png' })).toBe('floorplan');
  });

  it('classifies an empty-category .pdf as floorplan/document (never a photo hero)', () => {
    expect(classifyMediaItem({ MediaCategory: '', url: 'https://cdn.example.com/123/site-plan.pdf' })).toBe('floorplan');
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

  /**
   * CORRECTED 2026-08-07 — was "proxies all *.cotality.com subdomains".
   *
   * `proxyTrestleUrl` used a SUFFIX rule (`host === s || host.endsWith('.'+s)`)
   * over ['cotality.com','corelogic.com'], wrapping ANY subdomain. But the proxy
   * ROUTE (app/api/media/proxy/route.ts) validates against an EXACT allowlist —
   * api.cotality.com, api-trestle.corelogic.com, api-prod.corelogic.com — and
   * rejects everything else.
   *
   * The suffix rule could therefore only manufacture URLs the route REFUSES:
   * `/api/media/proxy?url=…img.cotality.com…` -> 403. It could never make such a
   * host load. Passing through unproxied is strictly not worse, and may actually
   * load if the host is publicly readable.
   *
   * `proxyTrestleUrl` is now a thin delegate to the canonical `toPublicMediaUrl`
   * — the same module the proxy route imports — so mapper and route cannot
   * disagree.
   *
   * OPEN (Class B — needs live verification, do NOT guess): if `img.cotality.com`
   * or another subdomain genuinely serves live IDX Plus media, the fix is to ADD
   * it to `ALLOWED_MEDIA_HOSTS` in lib/media/proxy-url-policy.ts — ONE place,
   * which widens the route too — NOT to restore suffix matching here.
   */
  it('proxies ONLY exactly-approved hosts (matching what the proxy route accepts)', () => {
    expect(proxyTrestleUrl('https://api.cotality.com/trestle/Media/x.jpg')).toContain(
      '/api/media/proxy?url=',
    );
  });

  it('does NOT proxy unapproved cotality subdomains — the route would 403 them', () => {
    for (const u of [
      'https://img.cotality.com/Media/x.jpg',
      'https://cdn.cotality.com/x.jpg',
      'https://cotality.com/x.jpg',
      'https://evil.cotality.com/x.jpg',
    ]) {
      expect(proxyTrestleUrl(u)).toBe(u);
    }
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
