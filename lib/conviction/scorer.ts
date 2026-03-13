/**
 * Conviction Score Engine
 *
 * Measures how close a buyer is to making an offer — distinct from LeadScore
 * which measures lead quality. A high-quality lead can have low conviction
 * (new, not engaged yet) and vice versa.
 *
 * Score = sum of milestone weights - hesitation penalties
 * Stage derived from score thresholds
 * Ghost status derived from silence patterns
 */

import prisma from '@/lib/prisma';
import { getLeadEventCounts, getLeadTopListings } from '@/lib/behavioral/events';

// ─── Milestone Weights ─────────────────────────────────────
const MILESTONES = {
  repeated_views: { weight: 15, description: 'Viewed same listing 3+ times' },
  shared: { weight: 10, description: 'Shared a listing' },
  used_calculator: { weight: 15, description: 'Used mortgage/financial calculator' },
  compared: { weight: 10, description: 'Added listings to comparison' },
  checked_transit: { weight: 10, description: 'Checked transit/commute' },
  checked_schools: { weight: 10, description: 'Viewed school information' },
  requested_showing: { weight: 20, description: 'Requested a showing' },
  submitted_inquiry: { weight: 10, description: 'Submitted an inquiry' },
} as const;

// ─── Hesitation Penalties ──────────────────────────────────
const HESITATION = {
  price_scroll_backs: { penalty: -2, max: -10, description: 'Scrolled back to price multiple times' },
  favorite_removes: { penalty: -3, max: -9, description: 'Removed favorites (indecision)' },
  search_widens: { penalty: -2, max: -6, description: 'Broadened search criteria' },
} as const;

// ─── Stage Thresholds ──────────────────────────────────────
function deriveStage(score: number): string {
  if (score >= 75) return 'ready';
  if (score >= 50) return 'convinced';
  if (score >= 25) return 'considering';
  return 'browsing';
}

// ─── Ghost Detection ───────────────────────────────────────
function deriveGhostStatus(silenceDays: number, previousStage: string): string {
  if (silenceDays <= 3) return 'active';
  if (silenceDays <= 7) return 'cooling';
  if (silenceDays <= 21) return 'silent';
  // Only mark "gone" if they had meaningful engagement
  if (previousStage !== 'browsing') return 'gone';
  return 'silent';
}

// ─── Main Scorer ───────────────────────────────────────────
export async function computeConvictionScore(leadId: bigint): Promise<{
  score: number;
  stage: string;
  milestoneFlags: Record<string, boolean>;
  hesitationSignals: Record<string, number>;
  ghostStatus: string;
  silenceDays: number;
  topListings: { listingId: string; eventCount: number }[];
}> {
  // Get all behavioral events for this lead in the last 90 days
  const eventCounts = await getLeadEventCounts(leadId, 90);
  const topListings = await getLeadTopListings(leadId, 5);

  // Get last event timestamp
  const lastEvent = await prisma.behavioralEvent.findFirst({
    where: { lead_id: leadId },
    orderBy: { recorded_at: 'desc' },
    select: { recorded_at: true },
  });

  const silenceDays = lastEvent
    ? Math.floor((Date.now() - lastEvent.recorded_at.getTime()) / 86400_000)
    : 999;

  // Check for repeated views (same listing 3+ times)
  const repeatedViews = await prisma.behavioralEvent.groupBy({
    by: ['listing_id'],
    where: {
      lead_id: leadId,
      event_type: 'return_visit',
    },
    _count: { id: true },
    having: { id: { _count: { gte: 2 } } }, // 2 return visits = 3+ total views
  });

  // Compute milestone flags
  const milestoneFlags: Record<string, boolean> = {
    repeated_views: repeatedViews.length > 0,
    shared: (eventCounts['share'] || 0) > 0,
    used_calculator: (eventCounts['calculator_depth'] || 0) > 0,
    compared: (eventCounts['comparison_add'] || 0) > 0,
    checked_transit: (eventCounts['transit_check'] || 0) > 0,
    checked_schools: (eventCounts['school_check'] || 0) > 0,
    requested_showing: (eventCounts['showing_request'] || 0) > 0,
    submitted_inquiry: (eventCounts['inquiry_submit'] || 0) > 0,
  };

  // Compute hesitation signals
  const hesitationSignals: Record<string, number> = {
    price_scroll_backs: eventCounts['scroll_back_price'] || 0,
    favorite_removes: eventCounts['favorite_remove'] || 0,
    search_widens: eventCounts['search_widen'] || 0,
  };

  // Calculate score
  let score = 0;

  // Add milestone weights
  for (const [key, achieved] of Object.entries(milestoneFlags)) {
    if (achieved && key in MILESTONES) {
      score += MILESTONES[key as keyof typeof MILESTONES].weight;
    }
  }

  // Subtract hesitation penalties
  for (const [key, count] of Object.entries(hesitationSignals)) {
    if (count > 0 && key in HESITATION) {
      const h = HESITATION[key as keyof typeof HESITATION];
      score += Math.max(h.penalty * count, h.max);
    }
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Apply silence decay (reduce score if buyer has been inactive)
  if (silenceDays > 14) {
    const decay = Math.min(0.5, (silenceDays - 14) * 0.02); // max 50% decay
    score = Math.round(score * (1 - decay));
  }

  const stage = deriveStage(score);
  const ghostStatus = deriveGhostStatus(silenceDays, stage);

  return {
    score,
    stage,
    milestoneFlags,
    hesitationSignals,
    ghostStatus,
    silenceDays,
    topListings,
  };
}

// ─── Batch Compute (Cron) ──────────────────────────────────
export async function batchComputeConvictionScores(): Promise<{
  processed: number;
  updated: number;
}> {
  // Find all leads that have behavioral events in the last 90 days
  const activeLeadIds = await prisma.behavioralEvent.findMany({
    where: {
      lead_id: { not: null },
      recorded_at: { gte: new Date(Date.now() - 90 * 86400_000) },
    },
    select: { lead_id: true },
    distinct: ['lead_id'],
  });

  let updated = 0;

  for (const { lead_id } of activeLeadIds) {
    if (!lead_id) continue;
    try {
      const result = await computeConvictionScore(lead_id);

      await prisma.convictionScore.upsert({
        where: { lead_id },
        create: {
          lead_id,
          score: result.score,
          stage: result.stage,
          milestone_flags: result.milestoneFlags,
          hesitation_signals: result.hesitationSignals,
          ghost_status: result.ghostStatus,
          last_active_at: result.silenceDays < 999
            ? new Date(Date.now() - result.silenceDays * 86400_000)
            : null,
          silence_days: result.silenceDays === 999 ? 0 : result.silenceDays,
          top_listings: result.topListings,
          last_computed: new Date(),
        },
        update: {
          score: result.score,
          stage: result.stage,
          milestone_flags: result.milestoneFlags,
          hesitation_signals: result.hesitationSignals,
          ghost_status: result.ghostStatus,
          last_active_at: result.silenceDays < 999
            ? new Date(Date.now() - result.silenceDays * 86400_000)
            : null,
          silence_days: result.silenceDays === 999 ? 0 : result.silenceDays,
          top_listings: result.topListings,
          last_computed: new Date(),
        },
      });
      updated++;
    } catch (err) {
      console.error(`[ConvictionScore] Error for lead ${lead_id}:`, err);
    }
  }

  return { processed: activeLeadIds.length, updated };
}
