/**
 * Buyer Intent Profiler — builds intent profiles from behavioral events
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { EVENT_WEIGHTS, DECAY_HALF_LIFE_DAYS, STAGE_THRESHOLDS } from './config';
import type { IntentProfileResult, IntentStage, IntentEventType } from './types';

const LAMBDA = Math.LN2 / DECAY_HALF_LIFE_DAYS;

/**
 * Compute/update intent profile for a lead from their events.
 */
export async function computeIntentProfile(leadId: bigint): Promise<IntentProfileResult> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const events = await prisma.intentEvent.findMany({
    where: { lead_id: leadId, recorded_at: { gte: ninetyDaysAgo } },
    orderBy: { recorded_at: 'desc' },
  });

  // Compute weighted intent strength with time decay
  let strength = 0;
  const now = Date.now();
  for (const e of events) {
    const daysAgo = (now - e.recorded_at.getTime()) / (24 * 60 * 60 * 1000);
    const decay = Math.exp(-LAMBDA * daysAgo);
    const weight = EVENT_WEIGHTS[e.event_type as IntentEventType] ?? 0.05;
    strength += weight * decay;
  }

  // Normalize to 0-100
  const intentStrength = Math.min(100, Math.round(strength * 20));
  const intentStage = computeStage(intentStrength);

  // Extract preferences from event payloads
  const neighborhoods = new Map<string, number>();
  const types = new Map<string, number>();
  const beds = new Map<number, number>();
  const boroughs = new Map<string, number>();
  const amenities = new Map<string, number>();
  let priceMin: number | null = null;
  let priceMax: number | null = null;

  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (!p) continue;

    // Neighborhoods
    const nh = p.neighborhoods || p.neighborhood;
    if (Array.isArray(nh)) {
      for (const n of nh) neighborhoods.set(n, (neighborhoods.get(n) ?? 0) + 1);
    } else if (typeof nh === 'string') {
      neighborhoods.set(nh, (neighborhoods.get(nh) ?? 0) + 1);
    }

    // Property types
    const pt = p.property_type || p.property_types;
    if (Array.isArray(pt)) {
      for (const t of pt) types.set(t, (types.get(t) ?? 0) + 1);
    } else if (typeof pt === 'string') {
      types.set(pt, (types.get(pt) ?? 0) + 1);
    }

    // Beds
    if (typeof p.beds === 'number') beds.set(p.beds, (beds.get(p.beds) ?? 0) + 1);
    if (typeof p.min_beds === 'number') beds.set(p.min_beds, (beds.get(p.min_beds) ?? 0) + 1);

    // Boroughs
    const b = p.borough || p.boroughs;
    if (Array.isArray(b)) {
      for (const x of b) boroughs.set(x, (boroughs.get(x) ?? 0) + 1);
    } else if (typeof b === 'string') {
      boroughs.set(b, (boroughs.get(b) ?? 0) + 1);
    }

    // Price range
    if (typeof p.min_price === 'number' && (priceMin === null || p.min_price < priceMin)) {
      priceMin = p.min_price;
    }
    if (typeof p.max_price === 'number' && (priceMax === null || p.max_price > priceMax)) {
      priceMax = p.max_price;
    }

    // Amenities
    const am = p.amenities || p.must_haves;
    if (Array.isArray(am)) {
      for (const a of am) amenities.set(a, (amenities.get(a) ?? 0) + 1);
    }
  }

  const topN = <T>(m: Map<T, number>, n: number): T[] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

  const lastEvent = events[0]?.recorded_at ?? null;

  const result: IntentProfileResult = {
    lead_id: leadId,
    intent_strength: intentStrength,
    intent_stage: intentStage,
    price_min: priceMin,
    price_max: priceMax,
    preferred_neighborhoods: topN(neighborhoods, 10),
    preferred_types: topN(types, 5),
    preferred_beds: topN(beds, 3),
    amenity_preferences: topN(amenities, 10),
    preferred_boroughs: topN(boroughs, 5),
    event_count: events.length,
  };

  // Persist profile
  const topFeatures: Record<string, number> = {};
  for (const [k, v] of neighborhoods) topFeatures[`nh:${k}`] = v;
  for (const [k, v] of types) topFeatures[`type:${k}`] = v;

  await prisma.buyerIntentProfile.upsert({
    where: { lead_id: leadId },
    create: {
      lead_id: leadId,
      intent_strength: intentStrength,
      intent_stage: intentStage,
      price_min: priceMin,
      price_max: priceMax,
      preferred_neighborhoods: result.preferred_neighborhoods,
      preferred_types: result.preferred_types,
      preferred_beds: result.preferred_beds,
      amenity_preferences: result.amenity_preferences,
      preferred_boroughs: result.preferred_boroughs,
      top_features: topFeatures as Prisma.InputJsonValue,
      event_count: events.length,
      last_event_at: lastEvent,
      last_computed: new Date(),
    },
    update: {
      intent_strength: intentStrength,
      intent_stage: intentStage,
      price_min: priceMin,
      price_max: priceMax,
      preferred_neighborhoods: result.preferred_neighborhoods,
      preferred_types: result.preferred_types,
      preferred_beds: result.preferred_beds,
      amenity_preferences: result.amenity_preferences,
      preferred_boroughs: result.preferred_boroughs,
      top_features: topFeatures as Prisma.InputJsonValue,
      event_count: events.length,
      last_event_at: lastEvent,
      last_computed: new Date(),
    },
  });

  return result;
}

function computeStage(strength: number): IntentStage {
  if (strength >= STAGE_THRESHOLDS.ready) return 'ready';
  if (strength >= STAGE_THRESHOLDS.comparing) return 'comparing';
  if (strength >= STAGE_THRESHOLDS.exploring) return 'exploring';
  return 'browsing';
}

/**
 * Batch recompute stale profiles.
 */
export async function batchRecompute(batchSize = 50): Promise<number> {
  const stale = new Date();
  stale.setHours(stale.getHours() - 24);

  // Find leads with recent events but stale/missing profiles
  const leads = await prisma.intentEvent.findMany({
    where: { recorded_at: { gte: stale } },
    select: { lead_id: true },
    distinct: ['lead_id'],
    take: batchSize,
  });

  let computed = 0;
  for (const { lead_id } of leads) {
    try {
      await computeIntentProfile(lead_id);
      computed++;
    } catch (err) {
      console.warn(`[buyer-intent] Failed to profile lead ${lead_id}:`, err);
    }
  }
  return computed;
}
