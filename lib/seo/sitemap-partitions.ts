/**
 * Sitemap partition math — shared by app/sitemap.ts (the partitions) and
 * app/sitemap.xml/route.ts (the index), so both always agree on how many
 * partitions exist.
 *
 * Neon-quiet + completeness (2026-07-23): the sitemap previously ran ONE
 * unbounded listing scan per regeneration; the first fix bounded it at a
 * fixed `take` with a console error — which is still silent truncation from
 * the consumer's perspective. This partition scheme makes truncation
 * STRUCTURALLY impossible instead:
 *
 *   - partition 0 = static + legal + agents + buildings sections;
 *   - partitions 1..K = listing chunks of LISTINGS_PER_SITEMAP, ordered by
 *     listing_id ASC (deterministic; no row can move between partitions
 *     except when the population itself changes);
 *   - K is derived from a COUNT of the exact gated population, PLUS ONE
 *     slack partition so growth between cache refreshes lands in the slack
 *     chunk instead of falling off the end (an empty partition renders a
 *     valid empty urlset — harmless);
 *   - if the population ever exceeds MAX_SITEMAP_PARTITIONS chunks, the
 *     sitemap FAILS CLOSED (throws → the route 500s and crawlers keep the
 *     previous cached copy) rather than publishing a falsely complete set.
 *
 * All queries run through cachedPublicRead tagged `search`, so regeneration
 * between syncs performs ZERO Neon queries.
 */
import prisma from '@/lib/prisma';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
import { cachedPublicRead, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';

export const LISTINGS_PER_SITEMAP = 10000;

/** 50 chunks × 10k = 500k listing URLs — far beyond any plausible REBNY
 *  population for one brokerage site; beyond it we fail closed, loudly. */
export const MAX_SITEMAP_PARTITIONS = 50;

/**
 * The EXACT distribution-gate WHERE clause every sitemap listing query uses
 * (identical to the pre-partition sitemap — do not weaken).
 */
export const SITEMAP_LISTING_WHERE = {
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  status: { in: [...ACTIVE_DISPLAY_VALUES] as string[] },
};

async function countDisplayableListings(): Promise<number> {
  return prisma.listing.count({ where: SITEMAP_LISTING_WHERE });
}

export const getDisplayableListingCount = cachedPublicRead(
  countDisplayableListings,
  ['sitemap-listing-count'],
  { tags: [SEARCH_CACHE_TAG] },
);

/**
 * Partition ids: [0, 1..K] where K = ceil(count / chunk) + 1 slack.
 * Throws (fail-closed) past MAX_SITEMAP_PARTITIONS.
 */
export async function getSitemapPartitionIds(): Promise<number[]> {
  const count = await getDisplayableListingCount();
  const listingPartitions = Math.ceil(count / LISTINGS_PER_SITEMAP) + 1; // +1 slack
  if (listingPartitions > MAX_SITEMAP_PARTITIONS) {
    console.error(
      `[sitemap] FAIL-CLOSED: ${count} listings need ${listingPartitions} partitions (max ${MAX_SITEMAP_PARTITIONS}). Refusing to publish a truncated sitemap.`,
    );
    throw new Error('sitemap partition cap exceeded');
  }
  return Array.from({ length: listingPartitions + 1 }, (_, i) => i);
}
