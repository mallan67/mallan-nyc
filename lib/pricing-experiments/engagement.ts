/**
 * Dynamic Pricing Experiments — Engagement Event Recording
 *
 * Records buyer engagement signals for listings enrolled in active experiments.
 * Called from analytics/inquiry/favorite/showing endpoints.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { EngagementEventType } from './types';
import { ENGAGEMENT_EVENT_TYPES } from './types';

/**
 * Record an engagement event for an experiment listing.
 */
export async function recordEngagement(
  experimentListingId: bigint,
  eventType: EngagementEventType,
  value?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!ENGAGEMENT_EVENT_TYPES.includes(eventType)) return;

  await prisma.engagementEvent.create({
    data: {
      experiment_listing_id: experimentListingId,
      event_type: eventType,
      value: value ?? 1,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/**
 * Bridge function: check if a listing is enrolled in an active experiment
 * and record the engagement event if so. Safe to call for any listing —
 * short-circuits if not enrolled.
 *
 * @param listingId - The listing_id string (not BigInt)
 * @param eventType - Type of engagement event
 * @param value - Optional numeric value
 * @param metadata - Optional context (no PII)
 */
export async function maybeRecordExperimentEngagement(
  listingId: string,
  eventType: EngagementEventType,
  value?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    // Find active experiment listings for this listing_id
    const experimentListings = await prisma.experimentListing.findMany({
      where: {
        listing_id: listingId,
        withdrawn_at: null,
        arm: {
          experiment: { status: 'active' },
        },
      },
      select: { id: true },
    });

    if (experimentListings.length === 0) return;

    // Record engagement for each experiment this listing is in
    await Promise.all(
      experimentListings.map(el =>
        recordEngagement(el.id, eventType, value, metadata)
      )
    );
  } catch {
    // Non-fatal — don't break the primary endpoint
  }
}
