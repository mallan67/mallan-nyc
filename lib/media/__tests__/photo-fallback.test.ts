/// <reference types="jest" />
/**
 * PR-E.1.a — bounded live media fallback for DB-first `/api/listings`.
 *
 * Authorizing prompt: 2026-05-14 — "Authorize PR-E.1.a visible media fallback fix."
 *
 * Locks down:
 *   1. Empty-media listing gets filled when fetcher returns photos.
 *   2. Failing fetcher → listing stays in response with empty media (fail-soft).
 *   3. Hanging fetcher → outer timeout kicks in, response completes.
 *   4. Listings that already have media do NOT trigger a fetch call.
 *   5. Trestle/Cotality hosts get proxied; R2 / non-Trestle hosts pass through.
 *   6. The function never mutates any field other than `media`.
 *
 * Pure unit tests — no Prisma, no Trestle, no Next runtime. Fixtures only.
 */

import {
  fillEmptyMediaWithLiveFallback,
  maybeProxyUrl,
  type FillablePublicListing,
  type MediaFetcher,
} from '@/lib/media/photo-fallback';

// ─── Helpers ────────────────────────────────────────────────────────────

type FixtureListing = FillablePublicListing & {
  // Extra fields to prove they are NEVER mutated.
  _source?: string;
  _compliance?: { attribution: string; disclaimer: string };
  address?: { streetName: string };
};

function makeListing(id: string, media: FillablePublicListing['media'] = []): FixtureListing {
  return {
    id,
    media,
    _source: 'db+idx',
    _compliance: { attribution: 'Listing courtesy of TEST', disclaimer: 'TEST' },
    address: { streetName: 'TEST STREET' },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('maybeProxyUrl', () => {
  it('wraps Trestle/Cotality URLs through /api/media/proxy', () => {
    const url = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/abc/1.jpg';
    const out = maybeProxyUrl(url);
    expect(out).toBe(`/api/media/proxy?url=${encodeURIComponent(url)}`);
  });

  it('also proxies legacy corelogic.com hosts', () => {
    const url = 'https://api-trestle.corelogic.com/trestle/Media/Property/PHOTO-Jpeg/x.jpg';
    expect(maybeProxyUrl(url)).toBe(`/api/media/proxy?url=${encodeURIComponent(url)}`);
  });

  it('leaves R2 URLs untouched', () => {
    const url = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS123/1.jpg';
    expect(maybeProxyUrl(url)).toBe(url);
  });

  it('leaves mallan.nyc-hosted URLs untouched', () => {
    const url = 'https://images.mallan.nyc/photos/RLS123/1.jpg';
    expect(maybeProxyUrl(url)).toBe(url);
  });

  it('returns empty string unchanged', () => {
    expect(maybeProxyUrl('')).toBe('');
  });

  it('accepts a custom host allowlist', () => {
    const url = 'https://example.com/img.jpg';
    expect(maybeProxyUrl(url, ['example.com'])).toBe(
      `/api/media/proxy?url=${encodeURIComponent(url)}`,
    );
  });
});

describe('fillEmptyMediaWithLiveFallback', () => {
  it('test 1: fills media on listings whose .media is empty', async () => {
    const listings = [makeListing('RLS1', [])];
    const fetcher: MediaFetcher = jest.fn().mockResolvedValue([
      {
        url: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1118409402/1/x/y/z.jpg',
        mediaType: 'Photo',
        order: 1,
      },
      {
        url: 'https://pub-r2.r2.dev/photos/RLS1/2.jpg',
        mediaType: 'Photo',
        order: 2,
      },
    ]);
    await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(listings[0].media).toHaveLength(2);
    expect(listings[0].media[0].url).toContain('/api/media/proxy?url=');
    // R2 URL must NOT be wrapped.
    expect(listings[0].media[1].url).toBe('https://pub-r2.r2.dev/photos/RLS1/2.jpg');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('RLS1');
  });

  it('test 2: listing remains in response with empty media when fetcher rejects', async () => {
    const listings = [makeListing('RLS_FAIL', [])];
    const fetcher: MediaFetcher = jest.fn().mockRejectedValue(new Error('Trestle 404'));
    await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe('RLS_FAIL');
    expect(listings[0].media).toEqual([]);
  });

  it('test 3: returns bounded by the timeout when the fetcher hangs', async () => {
    // ASSERTION REWRITTEN 2026-08-22. It previously read
    // `expect(elapsed).toBeLessThan(200)` against an 80ms timeout — 120ms of
    // slack measured on a wall clock. CI failed on it at 202ms (run
    // 32556475411, commit 906c0321) and passed on the same test, unchanged, at
    // both the commit before and the commit after. The module under test
    // imports nothing, so nothing had regressed; the runner was simply busy.
    //
    // A red that everyone learns to wave through is how a real red gets waved
    // through, so the fix is not a wider magic number. It is to assert what the
    // test actually means — "a hanging fetcher does not hang the caller" — in a
    // way a loaded scheduler cannot falsify.
    //
    // This is now STRICTER than before, not looser: it also proves the timeout
    // is what governed the return. The old version would have passed if the
    // function had ignored the fetcher and returned instantly, which is a real
    // bug it could not distinguish from correct behaviour.
    const listings = [makeListing('RLS_HANG', [])];
    const fetcher: MediaFetcher = jest.fn(() => new Promise(() => {}));
    const timeoutMs = 80;

    const start = Date.now();
    await fillEmptyMediaWithLiveFallback(listings, { fetcher, timeoutMs });
    const elapsed = Date.now() - start;

    // It waited for the fetcher rather than skipping it. Timer callbacks may
    // fire a tick early, so allow a small floor tolerance.
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 15);
    // And it did NOT hang. A genuine hang runs until jest's own timeout; any
    // ceiling far below that proves boundedness, and one that is generous
    // enough to survive a busy runner is the honest way to express it.
    expect(elapsed).toBeLessThan(5_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(listings[0].media).toEqual([]);
  });

  it('test 4: listings that already have media do NOT trigger fetcher', async () => {
    const withMedia = makeListing('RLS_FULL', [
      { url: 'https://pub-r2.r2.dev/photos/RLS_FULL/1.jpg', mediaType: 'Photo', order: 0 },
    ]);
    const empty = makeListing('RLS_EMPTY', []);
    const listings = [withMedia, empty];
    const fetcher: MediaFetcher = jest.fn().mockResolvedValue([
      { url: 'https://api.cotality.com/img.jpg', mediaType: 'Photo', order: 0 },
    ]);
    await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('RLS_EMPTY');
    // Listing that already had media is byte-identical.
    expect(listings[0].media).toHaveLength(1);
    expect(listings[0].media[0].url).toBe('https://pub-r2.r2.dev/photos/RLS_FULL/1.jpg');
  });

  it('test 5: compliance metadata is never mutated', async () => {
    const before = makeListing('RLS_C', []);
    const beforeSource = before._source;
    const beforeCompliance = JSON.stringify(before._compliance);
    const beforeAddress = JSON.stringify(before.address);
    const fetcher: MediaFetcher = jest.fn().mockResolvedValue([
      { url: 'https://api.cotality.com/img.jpg', mediaType: 'Photo', order: 0 },
    ]);
    await fillEmptyMediaWithLiveFallback([before], { fetcher });
    expect(before._source).toBe(beforeSource);
    expect(JSON.stringify(before._compliance)).toBe(beforeCompliance);
    expect(JSON.stringify(before.address)).toBe(beforeAddress);
  });

  it('respects concurrency = 5 by default — does not parallelize more than 5 at once', async () => {
    const listings = Array.from({ length: 20 }, (_, i) => makeListing(`RLS${i}`, []));
    let inFlightMax = 0;
    let inFlight = 0;
    const fetcher: MediaFetcher = jest.fn(async () => {
      inFlight++;
      if (inFlight > inFlightMax) inFlightMax = inFlight;
      await new Promise<void>((r) => setTimeout(r, 10));
      inFlight--;
      return [];
    });
    await fillEmptyMediaWithLiveFallback(listings, { fetcher, timeoutMs: 5000 });
    expect(inFlightMax).toBeLessThanOrEqual(5);
    expect(fetcher).toHaveBeenCalledTimes(20);
  });

  it('returns the same array reference (callsite ergonomics)', async () => {
    const listings = [makeListing('RLS_X', [])];
    const fetcher: MediaFetcher = jest.fn().mockResolvedValue([]);
    const out = await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(out).toBe(listings);
  });

  it('handles fetcher returning empty array (no photos) without error', async () => {
    const listings = [makeListing('RLS_EMPTY_TRESTLE', [])];
    const fetcher: MediaFetcher = jest.fn().mockResolvedValue([]);
    await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(listings[0].media).toEqual([]);
  });

  it('handles fetcher returning non-array (defensive)', async () => {
    const listings = [makeListing('RLS_BAD', [])];
    // Intentionally violate contract — fetcher returns `null` instead of [].
    // `jest.fn().mockResolvedValue(null)` is typed `any` so no @ts-expect-error
    // is needed; the runtime guard (`Array.isArray`) is what we're locking in.
    const fetcher: MediaFetcher = jest.fn().mockResolvedValue(null as never);
    await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(listings[0].media).toEqual([]);
  });

  it('no-op when every listing already has media', async () => {
    const listings = [
      makeListing('A', [{ url: 'x', mediaType: 'Photo', order: 0 }]),
      makeListing('B', [{ url: 'y', mediaType: 'Photo', order: 0 }]),
    ];
    const fetcher: MediaFetcher = jest.fn();
    await fillEmptyMediaWithLiveFallback(listings, { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
