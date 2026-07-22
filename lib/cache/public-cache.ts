// lib/cache/public-cache.ts
//
// One Cycle W1 — cache-first ANONYMOUS public reads + sync-driven revalidation.
//
// AUTHORITY HIERARCHY (Maya 2026-07-22): the Cotality API is the SOLE source
// of truth for listing data. Neon is NOT a competing source — it is the
// synchronized operational copy written by the ONE Cycle pipeline. This
// module exists so ordinary anonymous public requests are served from the
// Vercel data cache instead of touching Neon at all:
//
//   Cotality API → One Cycle sync → Neon operational copy → projections
//     → THIS CACHE (tagged) → anonymous public pages/APIs
//
// KEY INSIGHT (measured 2026-07-22): a public page can never be fresher than
// the feed sync — listing data changes ONLY when One Cycle runs — so serving
// from cache until the SYNC ITSELF revalidates the tags loses ZERO freshness.
// The time-based fallback below equals the sync cadence as a safety net.
//
// SCOPE RULES (enforced by tests):
//   - ONLY anonymous public read paths may use `cachedPublicRead`.
//   - NEVER wrap CRM / portal / professional / authenticated reads,
//     user-specific data, or any POST/mutation handler.
//   - FAIL-CLOSED: any cache-layer error degrades to the live read — site
//     correctness beats CU savings. Display-gate enforcement is UNCHANGED:
//     gates are applied at sync/projection time, so the cached value is the
//     already-gated result; caching adds no new display decisions.

import { unstable_cache, revalidateTag } from "next/cache";

/**
 * Fallback time-based revalidation window (seconds) — equal to the idx-sync
 * cadence (30 min), NOT a freshness mechanism of its own: sync-driven
 * `revalidateTag` is the primary invalidation. This is a safety net for
 * entries whose tags a revalidation pass could not derive (e.g. address-slug
 * keyed lookups) or a missed revalidation.
 */
export const SYNC_CADENCE_SECONDS = 30 * 60;

/** Coarse tag bumped once per sync run when ANYTHING changed — covers search/
 *  browse/collection surfaces (home, /search, borough + neighborhood pages). */
export const SEARCH_CACHE_TAG = "search";

/** Per-listing tag — revalidated when THAT listing materially changed. */
export function listingCacheTag(listingId: string): string {
  return `listing:${listingId}`;
}

/**
 * Per-building tag (normalized street number + street name + optional zip).
 * Uppercased/trimmed so page-side and sync-side derivations agree.
 */
export function buildingCacheTag(
  streetNumber: string | null | undefined,
  streetName: string | null | undefined,
  postalCode?: string | null,
): string {
  const num = String(streetNumber ?? "").trim().toUpperCase();
  const name = String(streetName ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  const zip = String(postalCode ?? "").trim();
  return `building:${num}:${name}:${zip}`;
}

/**
 * Wrap an ANONYMOUS public read in the Next data cache with tags.
 *
 * - `keyParts` must uniquely identify the read (args are ALSO part of the
 *   cache key via unstable_cache's own argument serialization).
 * - Primary invalidation = sync-driven `revalidateTag`; `revalidate`
 *   defaults to the sync cadence as the safety net.
 * - FAIL-CLOSED: if the cache layer itself throws (wrapper construction or
 *   cache machinery), we degrade to the direct live read. (If the underlying
 *   read throws, the error propagates exactly as uncached — after one
 *   fallback re-attempt — so callers' error handling is unchanged.)
 *
 * NEVER use for authenticated/user-specific reads — the cache is shared
 * across all anonymous visitors by design.
 */
export function cachedPublicRead<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  keyParts: string[],
  opts: { tags: string[]; revalidate?: number },
): (...args: A) => Promise<T> {
  return async (...args: A) => {
    try {
      const wrapped = unstable_cache(fn, keyParts, {
        tags: opts.tags,
        revalidate: opts.revalidate ?? SYNC_CADENCE_SECONDS,
      });
      return await wrapped(...args);
    } catch (err) {
      // Cache layer failed → live read (correctness beats CU savings).
      console.error(
        "[public-cache] cache layer error — degrading to live read:",
        err instanceof Error ? err.message : err,
      );
      return fn(...args);
    }
  };
}

/**
 * Bounded aggregate revalidation accounting for sync audit events.
 * `pages_revalidated` counts successful revalidateTag calls (tags, not
 * rendered pages — one tag may cover several pages); `revalidation_failures`
 * counts tags whose revalidation threw. Both are small integers bounded by
 * (changed listings + buildings + 1) per run.
 */
export interface RevalidationCounters {
  pages_revalidated: number;
  revalidation_failures: number;
}

export function newRevalidationCounters(): RevalidationCounters {
  return { pages_revalidated: 0, revalidation_failures: 0 };
}

/**
 * Revalidate a set of cache tags, NEVER throwing — a revalidation failure
 * must never fail a sync run (the 30-min fallback still repairs freshness).
 * Deduplicates tags; counts outcomes into the provided counters.
 */
export function safeRevalidateTags(
  tags: Iterable<string>,
  counters?: RevalidationCounters,
): void {
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    try {
      // Next 16.2 signature: profile "max" = expire the tag's entries
      // immediately (the classic hard invalidation semantics).
      revalidateTag(tag, "max");
      if (counters) counters.pages_revalidated++;
    } catch (err) {
      if (counters) counters.revalidation_failures++;
      console.error(
        `[public-cache] revalidateTag failed for "${tag}" (sync run continues):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
