/**
 * Listing Momentum Scorer
 *
 * Computes per-listing performance scores for active listings.
 * Aggregates behavioral event data into velocity metrics,
 * then computes a composite score and percentile rank.
 *
 * Score weights:
 *   view_velocity (25%), save_rate (20%), inquiry_rate (25%),
 *   showing_rate (20%), avg_dwell (10%)
 */
import prisma from "@/lib/prisma";
import {
  getListingEventCounts,
  getListingUniqueSessions,
} from "@/lib/behavioral/events";

const SCORE_WEIGHTS = {
  view_velocity: 0.25,
  save_rate: 0.20,
  inquiry_rate: 0.25,
  showing_rate: 0.20,
  avg_dwell: 0.10,
};

// Benchmarks for normalization (0-100 scale)
const BENCHMARKS = {
  view_velocity_max: 10,   // 10 unique sessions/day = 100
  save_rate_max: 0.15,     // 15% save rate = 100
  inquiry_rate_max: 0.05,  // 5% inquiry rate = 100
  showing_rate_max: 0.03,  // 3% showing request rate = 100
  avg_dwell_max: 120,      // 120 seconds avg dwell = 100
};

function normalize(value: number, max: number): number {
  return Math.min(100, Math.round((value / max) * 100));
}

interface MomentumResult {
  listingId: string;
  score: number;
  view_velocity: number;
  save_rate: number;
  inquiry_rate: number;
  showing_rate: number;
  avg_dwell_secs: number;
}

async function computeListingMomentum(listingId: string): Promise<MomentumResult> {
  const days = 7;

  const [eventCounts, uniqueSessions] = await Promise.all([
    getListingEventCounts(listingId, days),
    getListingUniqueSessions(listingId, days),
  ]);

  const totalViews = uniqueSessions || 1; // avoid division by zero
  const view_velocity = uniqueSessions / days;

  const saves = (eventCounts["favorite_add"] || 0);
  const inquiries = (eventCounts["inquiry_submit"] || 0);
  const showings = (eventCounts["showing_request"] || 0);
  const dwellTotal = (eventCounts["photo_dwell"] || 0);
  const dwellCount = (eventCounts["building_deep_dive"] || 0) + (eventCounts["return_visit"] || 0) || 1;

  const save_rate = saves / totalViews;
  const inquiry_rate = inquiries / totalViews;
  const showing_rate = showings / totalViews;
  const avg_dwell_secs = dwellTotal / dwellCount;

  // Normalize each metric to 0-100
  const components = {
    view_velocity: normalize(view_velocity, BENCHMARKS.view_velocity_max),
    save_rate: normalize(save_rate, BENCHMARKS.save_rate_max),
    inquiry_rate: normalize(inquiry_rate, BENCHMARKS.inquiry_rate_max),
    showing_rate: normalize(showing_rate, BENCHMARKS.showing_rate_max),
    avg_dwell: normalize(avg_dwell_secs, BENCHMARKS.avg_dwell_max),
  };

  const score = Math.round(
    components.view_velocity * SCORE_WEIGHTS.view_velocity +
    components.save_rate * SCORE_WEIGHTS.save_rate +
    components.inquiry_rate * SCORE_WEIGHTS.inquiry_rate +
    components.showing_rate * SCORE_WEIGHTS.showing_rate +
    components.avg_dwell * SCORE_WEIGHTS.avg_dwell
  );

  return {
    listingId,
    score: Math.min(100, Math.max(0, score)),
    view_velocity,
    save_rate,
    inquiry_rate,
    showing_rate,
    avg_dwell_secs,
  };
}

/**
 * Batch compute momentum for all active listings.
 * Returns count of listings processed.
 */
export async function batchComputeMomentum(batchSize = 100): Promise<{
  processed: number;
  avgScore: number;
}> {
  // Get all active listing IDs
  const activeListings = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ComingSoon", "ActiveUnderContract"] },
      idx_display_yn: true,
      owner_opt_out: false,
    },
    select: { listing_id: true },
    take: batchSize,
  });

  if (activeListings.length === 0) return { processed: 0, avgScore: 0 };

  const results: MomentumResult[] = [];

  for (const listing of activeListings) {
    if (!listing.listing_id) continue;
    try {
      const result = await computeListingMomentum(listing.listing_id);
      results.push(result);

      await prisma.listingMomentum.upsert({
        where: { listing_id: listing.listing_id },
        create: {
          listing_id: listing.listing_id,
          score: result.score,
          view_velocity: result.view_velocity,
          save_rate: result.save_rate,
          inquiry_rate: result.inquiry_rate,
          showing_rate: result.showing_rate,
          avg_dwell_secs: result.avg_dwell_secs,
          components: {
            view_velocity: normalize(result.view_velocity, BENCHMARKS.view_velocity_max),
            save_rate: normalize(result.save_rate, BENCHMARKS.save_rate_max),
            inquiry_rate: normalize(result.inquiry_rate, BENCHMARKS.inquiry_rate_max),
            showing_rate: normalize(result.showing_rate, BENCHMARKS.showing_rate_max),
            avg_dwell: normalize(result.avg_dwell_secs, BENCHMARKS.avg_dwell_max),
          },
          last_computed: new Date(),
        },
        update: {
          score: result.score,
          view_velocity: result.view_velocity,
          save_rate: result.save_rate,
          inquiry_rate: result.inquiry_rate,
          showing_rate: result.showing_rate,
          avg_dwell_secs: result.avg_dwell_secs,
          components: {
            view_velocity: normalize(result.view_velocity, BENCHMARKS.view_velocity_max),
            save_rate: normalize(result.save_rate, BENCHMARKS.save_rate_max),
            inquiry_rate: normalize(result.inquiry_rate, BENCHMARKS.inquiry_rate_max),
            showing_rate: normalize(result.showing_rate, BENCHMARKS.showing_rate_max),
            avg_dwell: normalize(result.avg_dwell_secs, BENCHMARKS.avg_dwell_max),
          },
          last_computed: new Date(),
        },
      });
    } catch (err) {
      console.warn(`[listing-momentum] Error scoring ${listing.listing_id}:`, err instanceof Error ? err.message : err);
    }
  }

  // Compute percentile ranks across all scored listings
  if (results.length > 1) {
    const sorted = results.sort((a, b) => a.score - b.score);
    for (let i = 0; i < sorted.length; i++) {
      const percentile = Math.round((i / (sorted.length - 1)) * 100);
      await prisma.listingMomentum.update({
        where: { listing_id: sorted[i].listingId },
        data: { percentile_rank: percentile },
      });
    }
  }

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  return { processed: results.length, avgScore };
}
