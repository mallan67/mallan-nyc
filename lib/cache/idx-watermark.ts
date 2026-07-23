/**
 * Server-side cached IDX watermark — One Cycle doctrine (Neon-quiet, 2026-07-23).
 *
 * AUTHORITY: Cotality API → One Cycle sync → Neon operational copy (SyncState)
 * → THIS CACHE → public watermark consumers. The watermark literally cannot
 * change faster than idx-sync runs (every 30 minutes), so a tag-invalidated
 * cache with a sync-cadence fallback loses ZERO freshness while eliminating
 * the per-request SyncState read.
 *
 * Invalidation contract: `lib/idx/sync.ts` revalidates IDX_WATERMARK_CACHE_TAG
 * ONLY after its SyncState upsert has durably committed with status "ok". A
 * failed/partial sync does NOT touch the tag — a stale-but-real watermark is
 * always preferred over a fabricated fresh one (fail-closed; UCBA Art. VIII §4
 * requires the REAL refresh time, never the render clock).
 */
import { unstable_cache } from "next/cache";
import { getIdxWatermark, type IdxWatermark } from "@/lib/idx/watermark";

/** Closed cache tag for the IDX Property watermark. */
export const IDX_WATERMARK_CACHE_TAG = "idx-watermark";

// Fallback time-based revalidation (seconds) — equals the ACTUAL production
// idx-sync cadence (30 min; the vercel.json every-30-minutes schedule).
// Safety net only: sync-driven tag revalidation is the primary invalidation.
export const IDX_WATERMARK_REVALIDATE_SECONDS = 30 * 60;

/**
 * Cached SyncState watermark read. Fail-closed inside `getIdxWatermark`
 * (returns nulls on DB error) — the cache stores that null result at most
 * until the next successful sync revalidates the tag.
 */
export const getCachedIdxWatermark = unstable_cache(
  async (): Promise<IdxWatermark> => getIdxWatermark(),
  ["idx-watermark-read"],
  { tags: [IDX_WATERMARK_CACHE_TAG], revalidate: IDX_WATERMARK_REVALIDATE_SECONDS },
);
