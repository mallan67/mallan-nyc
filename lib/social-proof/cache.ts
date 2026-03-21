/**
 * Social Proof Cache
 *
 * Computes anonymized demand signals per active listing for public/portal display.
 * Aggregates: view counts (7d), save counts, showings this week, demand level.
 * Also looks up avg days-to-sell for similar recently closed listings.
 *
 * PRIVACY: Returns aggregate counts only. No buyer PII. Fair Housing safe.
 */
import prisma from "@/lib/prisma";
import { getListingEventCounts, getListingUniqueSessions } from "@/lib/behavioral/events";

type DemandLevel = "low" | "moderate" | "high" | "very_high";

function computeDemandLevel(views7d: number, saves: number, showings: number): DemandLevel {
  const signal = views7d * 1.0 + saves * 3.0 + showings * 5.0;
  if (signal >= 50) return "very_high";
  if (signal >= 25) return "high";
  if (signal >= 10) return "moderate";
  return "low";
}

/**
 * Compute social proof for a single listing.
 */
async function computeForListing(listingId: string, listingDbId: bigint | null, neighborhood: string | null): Promise<void> {
  const [eventCounts, uniqueSessions] = await Promise.all([
    getListingEventCounts(listingId, 7),
    getListingUniqueSessions(listingId, 7),
  ]);

  const view_count_7d = uniqueSessions;
  const save_count = eventCounts["favorite_add"] || 0;

  // Count showings this week (scheduled or completed)
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const showings_this_week = listingDbId
    ? await prisma.showing.count({
        where: {
          listing_id: listingDbId,
          status: { in: ["scheduled", "confirmed", "completed"] },
          date: { gte: weekAgo },
        },
      })
    : 0;

  // Avg days to sell for similar recently closed listings in same neighborhood
  let similar_sold_speed: number | null = null;
  if (neighborhood) {
    const similar = await prisma.listing.findMany({
      where: {
        neighborhood,
        status: { in: ["Closed", "Sold", "Rented"] },
        days_on_market: { gt: 0 },
        updated_at: { gte: new Date(Date.now() - 90 * 86400_000) },
      },
      select: { days_on_market: true },
      take: 20,
    });
    if (similar.length >= 3) {
      const totalDom = similar.reduce((s, l) => s + (l.days_on_market || 0), 0);
      similar_sold_speed = Math.round(totalDom / similar.length);
    }
  }

  const demand_level = computeDemandLevel(view_count_7d, save_count, showings_this_week);

  await prisma.socialProofCache.upsert({
    where: { listing_id: listingId },
    create: {
      listing_id: listingId,
      view_count_7d,
      save_count,
      showings_this_week,
      similar_sold_speed,
      demand_level,
      last_computed: new Date(),
    },
    update: {
      view_count_7d,
      save_count,
      showings_this_week,
      similar_sold_speed,
      demand_level,
      last_computed: new Date(),
    },
  });
}

/**
 * Batch compute social proof for all active listings.
 * Returns count of listings processed.
 */
export async function batchComputeSocialProof(batchSize = 100): Promise<{
  processed: number;
}> {
  const activeListings = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ComingSoon", "ActiveUnderContract"] },
      idx_display_yn: true,
      owner_opt_out: false,
    },
    select: { id: true, listing_id: true, neighborhood: true },
    take: batchSize,
  });

  let processed = 0;

  for (const listing of activeListings) {
    if (!listing.listing_id) continue;
    try {
      await computeForListing(listing.listing_id, listing.id, listing.neighborhood);
      processed++;
    } catch (err) {
      console.warn(`[social-proof] Error for ${listing.listing_id}:`, err instanceof Error ? err.message : err);
    }
  }

  return { processed };
}
