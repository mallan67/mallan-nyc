// lib/cache/durable-cache.ts
//
// Small durable (cross-request, cross-instance) cache over the EXISTING Upstash Redis
// (lib/redis.ts — no new env). Public read paths that today rely on a process-local
// `new Map` (which dies on every cold start and is not shared across instances, so each
// cold lambda re-queries Neon) layer this in FRONT of the Map: Redis first, Map fallback,
// DB last. Fail-OPEN everywhere — a Redis outage degrades to the current behavior, never
// an error and never a false-negative that would poison a page.
//
// Invalidation is namespace-versioned: sync/reconcile bumps a small integer, which the
// key builder folds into every key, so a single INCR atomically retires the whole space
// without enumerating keys. This is the "invalidate only changed data" primitive for the
// list/search caches (per-listing detail uses its own explicit key delete).

import redis from "@/lib/redis";

/** Read + JSON-decode a cache entry. undefined = miss / Redis unavailable (fail open). */
export async function cacheGetJson<T = unknown>(key: string): Promise<T | undefined> {
  if (!redis) return undefined;
  try {
    const v = await redis.get<T>(key); // @upstash/redis auto-decodes JSON
    return v == null ? undefined : v;
  } catch {
    return undefined;
  }
}

/** Best-effort write with a TTL floor. Never throws. */
export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value as object, { ex: ttlSeconds });
  } catch {
    /* best-effort */
  }
}

/** Best-effort delete of specific keys (per-listing detail invalidation). Never throws. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    /* best-effort */
  }
}

const LISTINGS_VER_KEY = "idx:listings:ver";

/**
 * Current version fold-in for list/search cache keys. Default 0 when unset/down — the FIRST
 * `incr` (Upstash starts a missing key at 1) then yields v1, so a bump always changes the
 * namespace (a default of 1 would collide with the first incr and no-op the first bump).
 */
export async function listingsCacheVersion(): Promise<number> {
  if (!redis) return 0;
  try {
    const v = await redis.get<number>(LISTINGS_VER_KEY);
    return typeof v === "number" && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Retire every list/search cache entry by bumping the namespace version. Called by the
 * sync/reconcile seams when ANY listing row changes (the list caches can't cheaply target
 * one query key, so a version bump is the clean bulk invalidation). Best-effort.
 */
export async function bumpListingsCacheVersion(): Promise<void> {
  if (!redis) return;
  try {
    await redis.incr(LISTINGS_VER_KEY);
  } catch {
    /* best-effort */
  }
}
