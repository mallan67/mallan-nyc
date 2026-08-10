/**
 * ONE definition of "what expires when a publicly-visible listing changes".
 *
 * WHY THIS EXISTS
 * ---------------
 * Building-manifest payloads carry public photo state (`primary_photo_url`), so
 * a MEDIA change can alter a building payload with NO material Listing
 * source-field write. Invalidation previously lived only inside the
 * Listing-write branch of `syncListings`, so:
 *
 *   - the LEGACY media loop (`sync.ts`) expired only the listing tag;
 *   - the NORMALIZED summary writer (`media-sync.ts:1616`) expired only the
 *     listing tag;
 *
 * and neither expired the building or manifest-shard tags. That was invisible
 * while every `PhotosChangeTimestamp` movement forced a Listing write. Removing
 * that write (the write-amplification fix) would have turned it into a
 * stale-manifest bug — a measurable cost saving paid for with an invisible
 * correctness regression.
 *
 * So the tag set is computed HERE, once, and every writer consumes it. Two
 * media writers plus the listing writer can no longer hold three opinions.
 *
 * PURE: no Prisma, no I/O. Callers pass addresses they already hold.
 */

import {
  listingCacheTag,
  buildingInvalidationTags,
  manifestShardForAddress,
  manifestShardTag,
} from '@/lib/cache/public-cache';

export interface PublicListingChangeTags {
  /** Cache tags to expire. */
  tags: string[];
  /** Manifest shards touched — callers accumulate these for warming/accounting. */
  shards: string[];
}

/**
 * Tags + shards to expire for a publicly-visible change to one listing.
 *
 * `previousAddress` and `nextAddress` differ only for an ADDRESS TRANSITION,
 * where BOTH buildings must expire (the listing must leave the old cached
 * payload and appear in the new one in the same cycle). A media-only change
 * never moves a listing between buildings, so those callers pass the current
 * address as both sides — deliberately, rather than issuing another query to
 * invent a transition that cannot happen.
 */
export function publicListingChangeTags(
  listingId: string,
  previousAddress: unknown,
  nextAddress: unknown,
): PublicListingChangeTags {
  const tags: string[] = [listingCacheTag(listingId)];
  const shards: string[] = [];

  for (const bTag of buildingInvalidationTags(previousAddress, nextAddress)) {
    tags.push(bTag);
  }
  for (const addr of [previousAddress, nextAddress]) {
    const shard = manifestShardForAddress(addr);
    if (shard) {
      shards.push(shard);
      // Per-shard manifest invalidation: manifest pages no longer carry the
      // coarse `search` tag, so the writer expires exactly the affected pages.
      tags.push(manifestShardTag(shard));
    }
  }

  // Callers accumulate into Sets, so duplicates across several changes to the
  // same listing in one cycle collapse and nothing is lost.
  return { tags, shards };
}
