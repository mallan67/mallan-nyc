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

/**
 * How much of the public surface a change actually reaches.
 *
 * `listing-only`                  the listing's own page changed; building and
 *                                 manifest payloads are provably unaffected.
 * `listing-building-manifest`     the listing's HERO output changed, which the
 *                                 building payload and manifest shard both
 *                                 carry — all three must expire.
 *
 * There is deliberately no "manifest-only" or "building-only": every change
 * that reaches those layers reaches the listing page too.
 */
export type PublicListingChangeScope = 'listing-only' | 'listing-building-manifest';

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
  scope: PublicListingChangeScope = 'listing-building-manifest',
): PublicListingChangeTags {
  const tags: string[] = [listingCacheTag(listingId)];
  const shards: string[] = [];

  // LISTING-ONLY — the change alters the listing's own public page but NOT the
  // payloads the building and manifest layers actually read.
  //
  // Proven by the manifest projection itself: it selects ONLY the listing's
  // hero state (`primary_photo_url`, `primary_photo_r2_key`). It does not read
  // gallery order, photo count, floorplans or videos. So a gallery mutation
  // that leaves the hero output identical cannot change a building or manifest
  // payload, and expiring them would be pure cache churn — the exact churn this
  // work exists to remove.
  //
  // Hero changes must NOT use this scope.
  if (scope === 'listing-only') {
    return { tags, shards };
  }

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
