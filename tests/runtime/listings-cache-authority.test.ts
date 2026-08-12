/**
 * CACHE AUTHORITY — the route must have exactly two caches, each with one job.
 *
 *   DB-first path            -> shared tagged cachedPublicRead (+ CDN response)
 *   live-Cotality fallback   -> shared 120s provider cache, canonical key
 *
 * A process-local Map is not acceptable for either. Sitting ahead of the shared
 * cache it could serve a response up to its own TTL AFTER sync revalidated
 * SEARCH_CACHE_TAG, defeating sync-driven invalidation; and as per-instance
 * state it gave a cold Vercel instance an empty cache, so the same search could
 * hit Cotality's 18K/hr quota again on another instance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canonicalSearchKey } from '@/app/api/listings/route';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'app/api/listings/route.ts'),
  'utf8',
);

describe('the process-local listings cache is gone', () => {
  it.each(['listingsCache', 'CACHE_TTL_MS', 'CACHE_MAX', 'getCached', 'setCache'])(
    'no %s remains',
    (sym) => {
      expect(SRC).not.toMatch(new RegExp(`\b${sym}\b`));
    },
  );

  it('the rate limiter is untouched — a separate concern', () => {
    expect(SRC).toMatch(/\brateLimitMap\b/);
  });
});

describe('both reads are shared-cached and tagged', () => {
  it('the paged DB read is wrapped, not just the count', () => {
    expect(SRC).toContain('"api-listings-page"');
    expect(SRC).toContain('"api-listings-count"');
  });

  it('the live Cotality fallback is shared-cached with a bounded TTL', () => {
    expect(SRC).toContain('"api-listings-trestle-fallback"');
    expect(SRC).toMatch(/revalidate:\s*120/);
  });

  it('every cached read carries SEARCH_CACHE_TAG so sync can invalidate it', () => {
    const wrapped = SRC.match(/cachedPublicRead\(/g) ?? [];
    expect(wrapped.length).toBeGreaterThanOrEqual(3);
    expect(SRC.match(/tags:\s*\[SEARCH_CACHE_TAG\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('the CDN response cache is kept as a separate layer', () => {
    expect(SRC).toMatch(/s-maxage=60, stale-while-revalidate=120/);
  });
});

describe('fallback cache identity uses the canonical key', () => {
  const k = (qs: string) => canonicalSearchKey(new URLSearchParams(qs));

  it('equivalent param ORDER shares one fallback identity → one Cotality request', () => {
    expect(k('beds=2&type=sale')).toBe(k('type=sale&beds=2'));
  });

  it('a genuinely different search gets a different identity', () => {
    expect(k('beds=2&type=sale')).not.toBe(k('beds=3&type=sale'));
  });
});
