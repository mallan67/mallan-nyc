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
 * Street-name canonicalization for building tags — the SAME direction-prefix
 * and suffix stripping the building payload uses for its Trestle/DB matching,
 * so every derivation collapses to one tag:
 *   link-side  "West 57th Street" → 57TH
 *   raw stored "57TH"             → 57TH
 *   variant    "W 57th St"        → 57TH
 * Sync derives tags from the stored address atoms; pages derive them from the
 * link query params — without this canon the two could differ and a sync
 * revalidation would miss the page's entry (leaving it to the 30-min
 * fallback). Rare residual mismatches still degrade to that fallback, never
 * to a stale-forever entry.
 */
const TAG_DIR_PREFIXES = /^(N|S|E|W|NORTH|SOUTH|EAST|WEST)\b\s*/i;
const TAG_SUFFIXES = /\s+(ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|PL|PLACE|CT|COURT|LN|LANE|WAY|TERRACE|TER)\.?$/i;

/**
 * Per-building tag (street number + CANONICALIZED street name + optional zip).
 */
export function buildingCacheTag(
  streetNumber: string | null | undefined,
  streetName: string | null | undefined,
  postalCode?: string | null,
): string {
  const num = String(streetNumber ?? "").trim().toUpperCase();
  const name = String(streetName ?? "")
    .trim()
    .replace(TAG_DIR_PREFIXES, "")
    .replace(TAG_SUFFIXES, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const zip = String(postalCode ?? "").trim();
  return `building:${num}:${name}:${zip}`;
}

/**
 * Derive the building tag from a stored listing `address` JSON (sync-side).
 * Mirrors attachListingCacheTags' masked-address guard: a suppressed address
 * (no street number / "Address Undisclosed") never forms a tag.
 */
/**
 * Coarse manifest tag (also carried by every manifest shard alongside the
 * search tag) — writers that change building-visible inventory outside the
 * sync bump SEARCH_CACHE_TAG, which covers it; the constant lives here so
 * tag ownership stays in one module.
 */
export const BUILDING_MANIFEST_TAG = "building-manifest";

/**
 * The tags a WRITER must revalidate for a listing change that can affect
 * building payloads. Pass EVERY address the row has occupied in the change
 * (previous + new): an address correction must expire BOTH the old
 * building's cached payload (the listing must LEAVE it) and the new one's
 * (it must APPEAR there) in the same cycle. Null-safe and deduplicating —
 * inserts pass (undefined, newAddress); unchanged addresses collapse to one
 * tag; masked addresses contribute nothing.
 */
export function buildingInvalidationTags(...addresses: Array<unknown>): string[] {
  const tags = new Set<string>();
  for (const a of addresses) {
    const t = buildingTagFromAddress(a);
    if (t) tags.add(t);
  }
  return [...tags];
}

export function buildingTagFromAddress(address: unknown): string | null {
  const a = (address ?? null) as Record<string, unknown> | null;
  const num = String(a?.StreetNumber ?? "").trim();
  const name = String(a?.StreetName ?? "").trim();
  if (!num || !name || name.toLowerCase() === "address undisclosed") return null;
  return buildingCacheTag(num, name, String(a?.PostalCode ?? "").trim() || undefined);
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
 * Codex P2 fix — attach listing/building cache tags to the CURRENT render's
 * ISR route entry, so `revalidateTag` evicts the page HTML itself (not just
 * the wrapped data caches).
 *
 * Version-semantics premise VERIFIED against the installed Next 16.2.4
 * (never assumed):
 *   - dist/server/web/spec-extension/unstable-cache.js L119-127: an
 *     unstable_cache invocation ACCUMULATES its `tags` into the surrounding
 *     render's workUnitStore.tags ("We need to accumulate the tags for this
 *     invocation within the store").
 *   - dist/server/app-render/app-render.js L900-902 + L1600-1601: those
 *     collected tags become the ISR route entry's `metadata.fetchTags`, so
 *     `revalidateTag(tag, "max")` expires the HTML of EVERY URL variant
 *     that rendered this listing (id-form, canonical address-slug form, and
 *     legacy alias forms alike — full variant coverage that enumerated
 *     `revalidatePath` calls could never guarantee).
 *
 * The page's listing-data reads deliberately stay LIVE prisma reads inside
 * the ISR render: routing them through the JSON data cache would corrupt
 * Prisma Decimal/Date/BigInt shapes on cache hits — the exact class of
 * ISR-runtime failure that forced the #523→#528 revert. This helper's tiny
 * tagged entry (value = the tag list itself) is what places the tags on the
 * route's dependency graph; the ISR render IS the cache for the page data.
 *
 * FAIL-OPEN for rendering: any error here leaves the page rendering live,
 * with freshness then covered by the 30-min fallback window.
 */
export async function attachListingCacheTags(
  listingId: string,
  building?: {
    streetNumber?: string | null;
    streetName?: string | null;
    postalCode?: string | null;
  },
): Promise<void> {
  try {
    if (!listingId) return;
    const tags = [listingCacheTag(listingId)];
    // Building tag only from REAL address atoms — a masked address
    // ("Address Undisclosed" / empty street number) never forms a tag.
    const num = building?.streetNumber?.trim();
    const name = building?.streetName?.trim();
    if (num && name && name.toLowerCase() !== "address undisclosed") {
      tags.push(buildingCacheTag(num, name, building?.postalCode ?? undefined));
    }
    await unstable_cache(async () => tags, ["listing-tag-attach", listingId], {
      tags,
      revalidate: SYNC_CADENCE_SECONDS,
    })();
  } catch (err) {
    console.error(
      "[public-cache] attachListingCacheTags failed (page renders live; 30-min fallback covers freshness):",
      err instanceof Error ? err.message : err,
    );
  }
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
