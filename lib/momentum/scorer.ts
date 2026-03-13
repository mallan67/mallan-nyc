/**
 * Listing Momentum Score
 *
 * Contextualizes listing performance vs comparable listings.
 * A single 0-100 number that tells agents and sellers how
 * their listing is performing relative to market.
 *
 * 80-100: Hot | 60-79: Warm | 40-59: Cooling | 20-39: Cold | 0-19: Stale
 */

import prisma from '@/lib/prisma';
import { getListingEventCounts, getListingUniqueSessions } from '@/lib/behavioral/events';

// ─── Score Component Weights ───────────────────────────────
const WEIGHTS = {
  viewVelocity: 0.25,     // views per day relative to comparable
  saveRate: 0.20,          // saves / unique visitors
  inquiryRate: 0.20,       // inquiries / unique visitors
  showingRate: 0.20,       // showing requests / unique visitors
  dwellTime: 0.15,         // avg dwell time relative to comparable
};

// ─── Score Tier Labels ─────────────────────────────────────
export function getMomentumTier(score: number): string {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 40) return 'cooling';
  if (score >= 20) return 'cold';
  return 'stale';
}

// ─── Single Listing Score ──────────────────────────────────
export async function computeListingMomentum(listingId: string): Promise<{
  score: number;
  viewVelocity: number;
  saveRate: number;
  inquiryRate: number;
  showingRate: number;
  avgDwellSecs: number;
  components: Record<string, number>;
}> {
  const days = 7;
  const eventCounts = await getListingEventCounts(listingId, days);
  const uniqueSessions = await getListingUniqueSessions(listingId, days);

  // Raw metrics
  const totalViews = uniqueSessions;
  const viewVelocity = totalViews / Math.max(days, 1);
  const saves = (eventCounts['favorite_add'] || 0);
  const inquiries = (eventCounts['inquiry_submit'] || 0);
  const showings = (eventCounts['showing_request'] || 0);

  const saveRate = totalViews > 0 ? saves / totalViews : 0;
  const inquiryRate = totalViews > 0 ? inquiries / totalViews : 0;
  const showingRate = totalViews > 0 ? showings / totalViews : 0;

  // Avg dwell time from photo_dwell events
  const dwellEvents = await prisma.behavioralEvent.findMany({
    where: {
      listing_id: listingId,
      event_type: 'photo_dwell',
      recorded_at: { gte: new Date(Date.now() - days * 86400_000) },
    },
    select: { value: true },
  });
  const avgDwellSecs = dwellEvents.length > 0
    ? dwellEvents.reduce((sum, e) => sum + (e.value || 0), 0) / dwellEvents.length
    : 0;

  // Normalize each component to 0-100 scale using reasonable benchmarks
  const components: Record<string, number> = {
    viewVelocity: Math.min(100, (viewVelocity / 5) * 100),       // 5+ views/day = 100
    saveRate: Math.min(100, (saveRate / 0.15) * 100),              // 15%+ save rate = 100
    inquiryRate: Math.min(100, (inquiryRate / 0.05) * 100),        // 5%+ inquiry rate = 100
    showingRate: Math.min(100, (showingRate / 0.03) * 100),        // 3%+ showing rate = 100
    dwellTime: Math.min(100, (avgDwellSecs / 60) * 100),           // 60+ sec avg = 100
  };

  // Weighted score
  const score = Math.round(
    components.viewVelocity * WEIGHTS.viewVelocity +
    components.saveRate * WEIGHTS.saveRate +
    components.inquiryRate * WEIGHTS.inquiryRate +
    components.showingRate * WEIGHTS.showingRate +
    components.dwellTime * WEIGHTS.dwellTime
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    viewVelocity,
    saveRate,
    inquiryRate,
    showingRate,
    avgDwellSecs,
    components,
  };
}

// ─── Batch Compute (Cron) ──────────────────────────────────
export async function batchComputeListingMomentum(): Promise<{
  processed: number;
  updated: number;
}> {
  // Find all listings with behavioral events in the last 14 days
  const activeListings = await prisma.behavioralEvent.findMany({
    where: {
      listing_id: { not: null },
      recorded_at: { gte: new Date(Date.now() - 14 * 86400_000) },
    },
    select: { listing_id: true },
    distinct: ['listing_id'],
  });

  // Compute percentile ranks after all individual scores
  const scores: { listingId: string; score: number }[] = [];
  let updated = 0;

  for (const { listing_id } of activeListings) {
    if (!listing_id) continue;
    try {
      const result = await computeListingMomentum(listing_id);

      await prisma.listingMomentum.upsert({
        where: { listing_id },
        create: {
          listing_id,
          score: result.score,
          view_velocity: result.viewVelocity,
          save_rate: result.saveRate,
          inquiry_rate: result.inquiryRate,
          showing_rate: result.showingRate,
          avg_dwell_secs: result.avgDwellSecs,
          components: result.components,
          last_computed: new Date(),
        },
        update: {
          score: result.score,
          view_velocity: result.viewVelocity,
          save_rate: result.saveRate,
          inquiry_rate: result.inquiryRate,
          showing_rate: result.showingRate,
          avg_dwell_secs: result.avgDwellSecs,
          components: result.components,
          last_computed: new Date(),
        },
      });

      scores.push({ listingId: listing_id, score: result.score });
      updated++;
    } catch (err) {
      console.error(`[Momentum] Error for listing ${listing_id}:`, err);
    }
  }

  // Update percentile ranks
  scores.sort((a, b) => a.score - b.score);
  for (let i = 0; i < scores.length; i++) {
    const percentile = Math.round((i / Math.max(scores.length - 1, 1)) * 100);
    await prisma.listingMomentum.update({
      where: { listing_id: scores[i].listingId },
      data: { percentile_rank: percentile, comp_avg_score: Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length) },
    });
  }

  return { processed: activeListings.length, updated };
}
