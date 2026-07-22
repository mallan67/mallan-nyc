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
import { buildSearchDisplayWhere } from "@/lib/search/listing-access-decision";
import {
  materialValuesEqual,
  newWritePathCounters,
  type WritePathCounters,
} from "@/lib/idx/write-suppression";

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
 * Returns the physical-write outcome (Phase 3 write-suppression).
 */
async function computeForListing(
  listingId: string,
  listingDbId: bigint | null,
  neighborhood: string | null,
): Promise<"inserted" | "updated" | "suppressed"> {
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

  // Phase 3 write-suppression (surface E): compare the computed result to the
  // stored row and skip the upsert when nothing material changed.
  // `last_computed` means "last MATERIAL result change" — an unchanged
  // computation does NOT refresh it.
  const materialNext: Record<string, unknown> = {
    view_count_7d,
    save_count,
    showings_this_week,
    similar_sold_speed,
    demand_level,
  };
  const stored = (await prisma.socialProofCache.findUnique({
    where: { listing_id: listingId },
    select: {
      view_count_7d: true,
      save_count: true,
      showings_this_week: true,
      similar_sold_speed: true,
      demand_level: true,
    },
  })) as Record<string, unknown> | null;

  const unchanged =
    !!stored &&
    Object.keys(materialNext).every((key) => materialValuesEqual(materialNext[key], stored[key]));
  if (unchanged) return "suppressed";

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
  return stored ? "updated" : "inserted";
}

/**
 * Batch compute social proof for all active listings.
 * Returns count of listings processed plus physical-write accounting
 * (Phase 3 write-suppression).
 */
export async function batchComputeSocialProof(batchSize = 100): Promise<{
  processed: number;
  write_paths: { social_proof: WritePathCounters };
}> {
  const counters = newWritePathCounters();
  const activeListings = await prisma.listing.findMany({
    where: buildSearchDisplayWhere(),
    select: { id: true, listing_id: true, neighborhood: true },
    take: batchSize,
  });

  let processed = 0;

  for (const listing of activeListings) {
    if (!listing.listing_id) continue;
    counters.rows_checked++;
    try {
      const outcome = await computeForListing(listing.listing_id, listing.id, listing.neighborhood);
      if (outcome === "suppressed") {
        counters.rows_suppressed_unchanged++;
      } else if (outcome === "updated") {
        counters.rows_materially_changed++;
        counters.rows_updated++;
      } else {
        counters.rows_inserted++;
      }
      processed++;
    } catch (err) {
      counters.rows_failed++;
      console.warn(`[social-proof] Error for ${listing.listing_id}:`, err instanceof Error ? err.message : err);
    }
  }

  return { processed, write_paths: { social_proof: counters } };
}
