/**
 * Behavioral Event Types & Processing
 *
 * Tracks granular micro-signals that reveal buyer intent beyond simple page views.
 * Privacy-safe: no IP fingerprinting, no user-agent tracking.
 */

import prisma from '@/lib/prisma';

// ─── Event Types ───────────────────────────────────────────
export const BEHAVIORAL_EVENT_TYPES = [
  'scroll_back_price',    // Buyer scrolled past price, then back up
  'photo_dwell',          // Time spent on a specific photo (seconds)
  'calculator_depth',     // Number of calculator parameter changes
  'return_visit',         // Same listing visited again (with gap)
  'comparison_add',       // Added listing to comparison
  'share',                // Shared listing via email/copy/social
  'transit_check',        // Used transit/commute tool on listing
  'school_check',         // Viewed school info on listing
  'favorite_add',         // Added to favorites
  'favorite_remove',      // Removed from favorites (signals indecision)
  'search_narrow',        // Search criteria became more specific
  'search_widen',         // Search criteria became broader
  'inquiry_start',        // Started filling inquiry form (didn't submit)
  'inquiry_submit',       // Submitted inquiry
  'showing_request',      // Requested a showing
  'price_alert_set',      // Set price drop alert for a listing
  'floor_plan_view',      // Viewed floor plan
  'virtual_tour_start',   // Started virtual tour
  'building_deep_dive',   // Viewed building profile from listing
] as const;

export type BehavioralEventType = (typeof BEHAVIORAL_EVENT_TYPES)[number];

export interface BehavioralEventInput {
  sessionId: string;
  eventType: BehavioralEventType;
  listingId?: string;
  value?: number;
  metadata?: Record<string, unknown>;
  pagePath?: string;
}

// ─── Validation ────────────────────────────────────────────
export function isValidBehavioralEvent(data: unknown): data is BehavioralEventInput {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.sessionId !== 'string' || obj.sessionId.length < 8 || obj.sessionId.length > 64) return false;
  if (!BEHAVIORAL_EVENT_TYPES.includes(obj.eventType as BehavioralEventType)) return false;
  if (obj.listingId !== undefined && (typeof obj.listingId !== 'string' || obj.listingId.length > 50)) return false;
  if (obj.value !== undefined && (typeof obj.value !== 'number' || obj.value < 0 || obj.value > 86400)) return false;
  if (obj.pagePath !== undefined && (typeof obj.pagePath !== 'string' || obj.pagePath.length > 200)) return false;

  return true;
}

// ─── Persistence ───────────────────────────────────────────
export async function recordBehavioralEvent(event: BehavioralEventInput): Promise<void> {
  await prisma.behavioralEvent.create({
    data: {
      session_id: event.sessionId,
      event_type: event.eventType,
      listing_id: event.listingId || null,
      value: event.value || null,
      metadata: (event.metadata || {}) as object,
      page_path: event.pagePath || null,
    },
  });
}

// ─── Link anonymous events to identified lead ──────────────
export async function linkSessionToLead(sessionId: string, leadId: bigint): Promise<number> {
  const result = await prisma.behavioralEvent.updateMany({
    where: { session_id: sessionId, lead_id: null },
    data: { lead_id: leadId },
  });
  return result.count;
}

// ─── Aggregation queries ───────────────────────────────────
export async function getListingEventCounts(listingId: string, days: number = 7) {
  const since = new Date(Date.now() - days * 86400_000);
  const events = await prisma.behavioralEvent.groupBy({
    by: ['event_type'],
    where: { listing_id: listingId, recorded_at: { gte: since } },
    _count: { id: true },
  });
  return Object.fromEntries(events.map((e) => [e.event_type, e._count.id]));
}

export async function getLeadEventCounts(leadId: bigint, days: number = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const events = await prisma.behavioralEvent.groupBy({
    by: ['event_type'],
    where: { lead_id: leadId, recorded_at: { gte: since } },
    _count: { id: true },
  });
  return Object.fromEntries(events.map((e) => [e.event_type, e._count.id]));
}

export async function getLeadTopListings(leadId: bigint, limit: number = 5) {
  const events = await prisma.behavioralEvent.groupBy({
    by: ['listing_id'],
    where: { lead_id: leadId, listing_id: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });
  return events
    .filter((e) => e.listing_id)
    .map((e) => ({ listingId: e.listing_id!, eventCount: e._count.id }));
}

export async function getSessionEventCounts(sessionId: string) {
  const events = await prisma.behavioralEvent.groupBy({
    by: ['event_type'],
    where: { session_id: sessionId },
    _count: { id: true },
  });
  return Object.fromEntries(events.map((e) => [e.event_type, e._count.id]));
}

/**
 * Count unique sessions that interacted with a listing in the last N days.
 */
export async function getListingUniqueSessions(listingId: string, days: number = 7): Promise<number> {
  const since = new Date(Date.now() - days * 86400_000);
  const result = await prisma.behavioralEvent.findMany({
    where: { listing_id: listingId, recorded_at: { gte: since } },
    select: { session_id: true },
    distinct: ['session_id'],
  });
  return result.length;
}
