/**
 * Simple in-memory cache with TTL and LRU eviction.
 * Replaces duplicate Map-based cache implementations across API routes.
 *
 * Usage:
 *   const neighborhoodCache = createMemoryCache<NeighborhoodData>(5 * 60_000, 200);
 *   const cached = neighborhoodCache.get('upper-east-side');
 *   if (!cached) { neighborhoodCache.set('upper-east-side', freshData); }
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createMemoryCache<T>(ttlMs: number, maxEntries = 100) {
  const store = new Map<string, CacheEntry<T>>();
  let lastPurge = Date.now();

  /** Remove all expired entries. Runs at most once per minute. */
  function purgeExpired(): void {
    const now = Date.now();
    if (now - lastPurge < 60_000) return;
    lastPurge = now;
    for (const [k, entry] of store) {
      if (now > entry.expiresAt) store.delete(k);
    }
  }

  function get(key: string): T | undefined {
    purgeExpired();
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    // Move to end for LRU (delete + re-set preserves Map insertion order)
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function set(key: string, value: T): void {
    purgeExpired();
    // Evict oldest if at capacity
    if (store.size >= maxEntries && !store.has(key)) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function has(key: string): boolean {
    return get(key) !== undefined;
  }

  function del(key: string): void {
    store.delete(key);
  }

  function clear(): void {
    store.clear();
  }

  function size(): number {
    return store.size;
  }

  return { get, set, has, del, clear, size };
}
