/**
 * Social Proof Aggregator
 *
 * Computes anonymized demand signals for public display on listings.
 * No PII, no demographic data — just aggregate counts.
 * Fair Housing safe.
 */

import prisma from '@/lib/prisma';
import { getListingUniqueSessions } from '@/lib/behavioral/events';

// ─── Demand Level Thresholds ───────────────────────────────
function deriveDemandLevel(views7d: number, saves: number, showings: number): string {
  const total = views7d + saves * 3 + showings * 5; // weighted signal
  if (total >= 50) return 'very_high';
  if (total >= 25) return 'high';
  if (total >= 10) return 'moderate';
  return 'low';
}

// ─── Get Social Proof for a Listing ────────────────────────
export async function getSocialProof(listingId: string) {
  const cached = await prisma.socialProofCache.findUnique({
    where: { listing_id: listingId },
  });

  if (cached && cached.last_computed > new Date(Date.now() - 3600_000)) {
    return cached; // Fresh enough (< 1 hour)
  }

  // Recompute on-demand if stale
  return computeSocialProof(listingId);
}

// ─── Compute for Single Listing ────────────────────────────
export async function computeSocialProof(listingId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

  // Views: unique sessions in last 7 days
  const viewCount7d = await getListingUniqueSessions(listingId, 7);

  // Saves: favorite_add events (all time, deduplicated by session)
  const saveEvents = await prisma.behavioralEvent.findMany({
    where: { listing_id: listingId, event_type: 'favorite_add' },
    select: { session_id: true },
    distinct: ['session_id'],
  });
  const saveCount = saveEvents.length;

  // Showings this week: from Showing model + behavioral events
  // Showing.listing_id is BigInt — parse if numeric, otherwise skip
  const listingIdBigInt = /^\d+$/.test(listingId) ? BigInt(listingId) : null;
  const showingDbCount = listingIdBigInt
    ? await prisma.showing.count({
        where: {
          listing_id: listingIdBigInt,
          date: { gte: sevenDaysAgo },
        },
      })
    : 0;
  const showingEventCount = await prisma.behavioralEvent.count({
    where: {
      listing_id: listingId,
      event_type: 'showing_request',
      recorded_at: { gte: sevenDaysAgo },
    },
  });
  const showingsThisWeek = Math.max(showingDbCount, showingEventCount);

  const demandLevel = deriveDemandLevel(viewCount7d, saveCount, showingsThisWeek);

  const data = {
    listing_id: listingId,
    view_count_7d: viewCount7d,
    save_count: saveCount,
    showings_this_week: showingsThisWeek,
    demand_level: demandLevel,
    last_computed: now,
  };

  await prisma.socialProofCache.upsert({
    where: { listing_id: listingId },
    create: data,
    update: data,
  });

  return data;
}

// ─── Batch Compute (Cron) ──────────────────────────────────
export async function batchComputeSocialProof(): Promise<{
  processed: number;
  updated: number;
}> {
  // Find all listings with any activity in the last 14 days
  const activeListings = await prisma.behavioralEvent.findMany({
    where: {
      listing_id: { not: null },
      recorded_at: { gte: new Date(Date.now() - 14 * 86400_000) },
    },
    select: { listing_id: true },
    distinct: ['listing_id'],
  });

  let updated = 0;
  for (const { listing_id } of activeListings) {
    if (!listing_id) continue;
    try {
      await computeSocialProof(listing_id);
      updated++;
    } catch (err) {
      console.error(`[SocialProof] Error for listing ${listing_id}:`, err);
    }
  }

  return { processed: activeListings.length, updated };
}
