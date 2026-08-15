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
 * Fallback time-based revalidation window (seconds) — equal to the unified
 * One Cycle cadence (10 min), NOT a freshness mechanism of its own: sync-driven
 * `revalidateTag` is the primary invalidation. This is a safety net for
 * entries whose tags a revalidation pass could not derive (e.g. address-slug
 * keyed lookups) or a missed revalidation. Kept in lockstep with the
 * `/api/cron/one-cycle` schedule (*&#47;10).
 *
 * SCOPE: this is the default for `cachedPublicRead` (search/browse/collection APIs). It is NOT the
 * listing-detail contract. `/listing/[...slug]` exports `revalidate = false` and is purely
 * event-driven — a periodic window there meant every crawler revisit past 600s re-rendered an
 * UNCHANGED listing against Neon, which is what prevented the database from ever going idle.
 */
export const SYNC_CADENCE_SECONDS = 10 * 60;

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
 * revalidation would miss the page's entry. NOTE: listing-detail pages are now EVENT-DRIVEN
 * (`revalidate = false`), so there is no longer a periodic fallback behind a missed tag — a
 * mismatch means the entry survives until the next matching revalidateTag or the next deployment.
 * Canonicalising both sides is therefore load-bearing, not merely an optimisation.
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
 * Writer-side twin of the manifest reader's shard derivation
 * (`cleanStreetNumber.charAt(0)` in buildBuildingPayload): the RAW first
 * character of the trimmed StreetNumber — NO case folding, because the
 * Prisma `string_starts_with` shard filter is case-sensitive against the
 * stored JSON. Null when the address carries no street number (masked /
 * absent — nothing for the manifest warm to target). Sync collects these
 * for every listing whose PHYSICAL change invalidated caches (old + new
 * address on a move) and eagerly warms ONLY those shards.
 */
export function manifestShardForAddress(address: unknown): string | null {
  if (typeof address !== "object" || address === null) return null;
  const num = String((address as Record<string, unknown>).StreetNumber ?? "").trim();
  return num ? num.charAt(0) : null;
}

/**
 * Per-shard manifest page tag (Maya review of PR #561): manifest pages are
 * tagged by SHARD — NOT with the coarse `search` tag — so one listing
 * change expires only its own shard's pages while every other shard's
 * cache SURVIVES the cycle. `BUILDING_MANIFEST_TAG` stays on every page
 * as the rare full-purge handle only.
 */
export function manifestShardTag(shard: string): string {
  return `building-manifest-shard:${shard}`;
}

/**
 * The COMPLETE writer-side tag set for a listing change that can affect
 * building-visible inventory: the exact building tag(s) PLUS the manifest
 * shard tag(s), for EVERY address the row has occupied (previous + new).
 * Every writer that used `buildingInvalidationTags` for display-state
 * changes must use this instead now that manifest pages no longer carry
 * the coarse `search` tag (which used to expire them as a side effect).
 * Null-safe and deduplicating, like buildingInvalidationTags.
 */
export function buildingAndManifestInvalidationTags(...addresses: Array<unknown>): string[] {
  const tags = new Set<string>(buildingInvalidationTags(...addresses));
  for (const a of addresses) {
    const shard = manifestShardForAddress(a);
    if (shard) tags.add(manifestShardTag(shard));
  }
  return [...tags];
}

/**
 * Wrap an ANONYMOUS public read in the Next data cache with tags.
 *
 * - `keyParts` must uniquely identify the read (args are ALSO part of the
 *   cache key via unstable_cache's own argument serialization).
 * - Primary invalidation = sync-driven `revalidateTag`; `revalidate`
 *   defaults to the sync cadence as the safety net.
 * - FAIL-CLOSED: if the CACHE LAYER itself throws (wrapper construction or
 *   cache machinery) we degrade to the direct live read. If the UNDERLYING
 *   READ throws, the error propagates exactly as uncached — with NO retry.
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
    // PER-INVOCATION capture (Maya blocker 2 on #560, 2026-07-24): when the
    // cache backend throws AFTER the wrapped fn already resolved (the
    // production 2 MB oversized-entry failure shape), the fallback must
    // return the captured value — NEVER execute the underlying read a
    // second time for a cache-storage failure.
    let captured: { value: T } | null = null;

    // 2026-08-14: the ORIGINAL fallback treated "before OR inside the fn" as
    // one case and re-attempted the live read for both. That made a DATABASE
    // failure issue a SECOND identical query at exactly the moment the
    // database was already failing. Observed in production 10:14:25Z on
    // `/buy`: Prisma "Timed out fetching a new connection from the connection
    // pool" (limit 5, timeout 10s) surfaced through this catch as
    // "cache layer error", and the fallback immediately re-queried a pool that
    // had just been exhausted. The request survived (HTTP 200) only because the
    // retry happened to win — the amplification is the defect.
    //
    // The two cases need OPPOSITE handling, so they are now distinguished:
    //   fn threw            -> propagate; the caller sees the real DB error and
    //                          the read executes EXACTLY ONCE.
    //   fn never ran        -> cache machinery failed first; one live attempt
    //                          is still correct (correctness beats CU savings).
    //   fn resolved, cache
    //   threw afterwards    -> return the captured value; no second read.
    let underlyingError: unknown = null;
    let underlyingThrew = false;
    const capturing = async (...a: A): Promise<T> => {
      try {
        const value = await fn(...a);
        captured = { value };
        return value;
      } catch (e) {
        underlyingThrew = true;
        underlyingError = e;
        throw e;
      }
    };
    try {
      const wrapped = unstable_cache(capturing, keyParts, {
        tags: opts.tags,
        revalidate: opts.revalidate ?? SYNC_CADENCE_SECONDS,
      });
      return await wrapped(...args);
    } catch (err) {
      if (captured !== null) {
        // Cache STORAGE failed after a successful read — the value is good.
        console.error(
          "[public-cache] cache store failed after read — returning captured value:",
          err instanceof Error ? err.message : err,
        );
        return (captured as { value: T }).value;
      }
      if (underlyingThrew) {
        // DATABASE/underlying failure. Propagate unchanged. Retrying here is
        // what turned one failing query into two against a saturated pool.
        throw underlyingError;
      }
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
 * FAIL-OPEN for rendering: any error here leaves the page rendering live. Freshness is NOT then
 * covered by a periodic window — listing detail is event-driven (`revalidate = false`) — so a
 * failed attach means this render carries no listing tag and is not tag-invalidatable until a
 * later successful attach or the next deployment.
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
    // `revalidate: false` — this entry exists ONLY to place the tags on the route's dependency
    // graph. Any finite lifetime here would silently reimpose a lower revalidation clock on the
    // listing-detail route and undo its event-driven contract: the route says
    // `revalidate = false`, so a 600s entry inside it would have been the effective ceiling.
    // Expiry is event-driven via revalidateTag on these exact tags.
    await unstable_cache(async () => tags, ["listing-tag-attach", listingId], {
      tags,
      revalidate: false,
    })();
  } catch (err) {
    console.error(
      "[public-cache] attachListingCacheTags failed (page renders live; tags not attached, so this " +
        "render is not tag-invalidatable until the next successful attach):",
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
 * Revalidate a set of cache tags, NEVER throwing — a revalidation failure must never fail a sync
 * run. It is nonetheless load-bearing for listing detail: that route is event-driven
 * (`revalidate = false`), so a dropped revalidation is not repaired by any periodic window.
 * Deduplicates tags; counts outcomes into the provided counters.
 */
/**
 * The exact deprecation notice Next 16.2.4 emits ONCE PER profile-less
 * `revalidateTag(tag)` call (dist/server/web/spec-extension/revalidate.js:42).
 * The profile-less call is DELIBERATE here (immediate expiration —
 * dist-verified, see the comment inside safeRevalidateTags), so the per-call
 * warning is pure noise at sync scale (77–156 identical lines per cycle).
 * safeRevalidateTags absorbs warnings matching this marker during its loop
 * and emits ONE consolidated summary instead (Maya directive 2026-07-24:
 * "document the accepted deprecated call centrally rather than producing
 * 77–156 warnings each cycle"). Matched by the stable docs slug so a wording
 * tweak upstream still consolidates; a SIGNATURE change upstream is caught
 * by the pinned single-argument test, not silently absorbed.
 */
const NEXT_REVALIDATE_TAG_DEPRECATION_MARKER = "revalidate-tag-single-arg";

export function safeRevalidateTags(
  tags: Iterable<string>,
  counters?: RevalidationCounters,
): void {
  const seen = new Set<string>();
  const originalWarn = console.warn;
  let suppressedWarnings = 0;
  // Intercept ONLY the known per-call deprecation line for the duration of
  // the loop; every other warning passes straight through. Restored in
  // finally — an interceptor leak would swallow unrelated warnings forever.
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes(NEXT_REVALIDATE_TAG_DEPRECATION_MARKER)) {
      suppressedWarnings++;
      return;
    }
    originalWarn.apply(console, args as []);
  };
  try {
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    try {
      // DIST-VERIFIED semantics (installed Next 16.2.4 — Maya correction
      // 2026-07-24; the previous comment here was WRONG):
      //   - revalidateTag(tag, "max") is NOT immediate expiration: the
      //     profile resolves to `durations = { expire: cacheLife.expire }`
      //     (dist/server/revalidation-utils.js:100-124) — i.e.
      //     stale-while-revalidate against the "max" profile's expire
      //     window.
      //   - A PROFILE-LESS call leaves `durations` undefined, "which will
      //     trigger immediate expiration in the cache handler"
      //     (revalidation-utils.js:126-127) — the classic blocking
      //     invalidation these writers require (Sec 2.05 removals must
      //     disappear promptly, and the manifest warm contract depends on
      //     a true MISS after invalidation).
      //   - updateTag() has the same immediate semantics but throws
      //     outside Server Actions (revalidate.js:48-58) — unusable in
      //     these route-handler/cron writers.
      // The profile-less form emits a one-line deprecation console.warn
      // (revalidate.js:41-43); accepted deliberately — correctness over
      // log noise — and pinned by tests so a future signature change is
      // caught, not assumed.
      // The published TypeScript signature requires the profile argument,
      // but the profile-less runtime path is precisely the immediate-
      // expiration branch (dist-verified above) — cast, don't pass "max".
      (revalidateTag as unknown as (tag: string) => void)(tag);
      if (counters) counters.pages_revalidated++;
    } catch (err) {
      if (counters) counters.revalidation_failures++;
      console.error(
        `[public-cache] revalidateTag failed for "${tag}" (sync run continues):`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  } finally {
    console.warn = originalWarn;
  }
  if (suppressedWarnings > 0) {
    console.log(
      `[public-cache] revalidated ${seen.size} tag(s) via profile-less immediate expiration; ` +
        `Next deprecation warning suppressed ${suppressedWarnings}x (accepted deliberately — ` +
        `see safeRevalidateTags in lib/cache/public-cache.ts for the dist-verified rationale).`,
    );
  }
}
