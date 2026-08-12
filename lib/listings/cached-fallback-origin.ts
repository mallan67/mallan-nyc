import { cachedPublicRead, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';

export const FALLBACK_ORIGIN_CACHE_PREFIX = 'api-listings-fallback-origin';
export const FALLBACK_ORIGIN_REVALIDATE_SECONDS = 120;

export type FallbackOriginCache = <T>(
  origin: () => Promise<T>,
  keyParts: string[],
  options: { tags: string[]; revalidate: number },
) => () => Promise<T>;

const sharedFallbackOriginCache: FallbackOriginCache = (origin, keyParts, options) =>
  cachedPublicRead(origin, keyParts, options);

/**
 * Read the final anonymous fallback response through the shared data-cache
 * boundary and report whether this invocation actually executed the origin.
 *
 * `originExecuted` describes only this application boundary. It is not a
 * Cotality HTTP counter: fetch-level caching, pagination, retries and token
 * refreshes sit below it.
 */
export async function readCachedFallbackOrigin<T>({
  cacheKey,
  origin,
  cache = sharedFallbackOriginCache,
}: {
  cacheKey: string;
  origin: () => Promise<T>;
  cache?: FallbackOriginCache;
}): Promise<{ value: T; originExecuted: boolean }> {
  let originExecuted = false;
  const value = await cache(
    async () => {
      originExecuted = true;
      return origin();
    },
    [FALLBACK_ORIGIN_CACHE_PREFIX, cacheKey],
    {
      tags: [SEARCH_CACHE_TAG],
      revalidate: FALLBACK_ORIGIN_REVALIDATE_SECONDS,
    },
  )();

  return { value, originExecuted };
}
