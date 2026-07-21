/**
 * Buyer Intent Profiler — builds intent profiles from behavioral events
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import {
  materialValuesEqual,
  newWritePathCounters,
  type WritePathCounters,
} from '@/lib/idx/write-suppression';
import { EVENT_WEIGHTS, DECAY_HALF_LIFE_DAYS, STAGE_THRESHOLDS } from './config';
import type { IntentProfileResult, IntentStage, IntentEventType } from './types';

const LAMBDA = Math.LN2 / DECAY_HALF_LIFE_DAYS;

/**
 * Compute/update intent profile for a lead from their events.
 */
export async function computeIntentProfile(
  leadId: bigint,
  options?: { counters?: WritePathCounters },
): Promise<IntentProfileResult> {
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

  // ─── Rent vs Buy Ratio ──────────────────────────────────
  // Track whether client engages more with sale or rental listings
  let saleEngagement = 0;
  let rentalEngagement = 0;
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (!p) continue;
    const listingType = p.listing_type || p.listingType;
    if (listingType === 'sale' || listingType === 'Residential') {
      saleEngagement++;
    } else if (listingType === 'rent' || listingType === 'rental' || listingType === 'Residential Lease') {
      rentalEngagement++;
    }
    // rent_vs_buy_viewed strongly indicates sale consideration
    if (e.event_type === 'rent_vs_buy_viewed') saleEngagement += 2;
  }
  const totalTypeEngagement = saleEngagement + rentalEngagement;
  const rentVsBuyRatio = totalTypeEngagement > 0
    ? Math.round((saleEngagement / totalTypeEngagement) * 100) / 100
    : 0.5; // Default even split if no data

  // ─── Engaged Neighborhoods ──────────────────────────────
  // Which neighborhoods is the client ACTUALLY clicking/viewing (vs stated prefs)?
  const engagedNeighborhoods = topN(neighborhoods, 10);

  // ─── Drift Detection ────────────────────────────────────
  // Compare engaged neighborhoods to stated preferences
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      preferences: { select: { neighborhoods: true, property_types: true } },
      roles: true,
    },
  });

  let driftDetected = false;
  let driftDetails: string | null = null;

  if (lead?.preferences && engagedNeighborhoods.length >= 3) {
    const statedNeighborhoods = new Set(lead.preferences.neighborhoods);
    const engagedNotStated = engagedNeighborhoods.filter(
      (n) => !statedNeighborhoods.has(n)
    );

    // Neighborhood drift: >50% of engaged neighborhoods are NOT in stated preferences
    if (engagedNotStated.length > engagedNeighborhoods.length * 0.5 && engagedNotStated.length >= 2) {
      driftDetected = true;
      driftDetails = `Neighborhood drift: engaging with ${engagedNotStated.join(', ')} (not in stated preferences)`;
    }

    // Type drift: renter engaging mostly with sale listings or vice versa
    const isStatedRenter = lead.roles.includes('renter') || lead.roles.includes('tenant');
    const isStatedBuyer = lead.roles.includes('buyer');
    if (isStatedRenter && !isStatedBuyer && rentVsBuyRatio >= 0.7 && totalTypeEngagement >= 5) {
      driftDetected = true;
      driftDetails = (driftDetails ? driftDetails + '. ' : '') +
        `Type drift: stated renter but ${Math.round(rentVsBuyRatio * 100)}% sale engagement — likely buyer candidate`;
    } else if (isStatedBuyer && !isStatedRenter && rentVsBuyRatio <= 0.3 && totalTypeEngagement >= 5) {
      driftDetected = true;
      driftDetails = (driftDetails ? driftDetails + '. ' : '') +
        `Type drift: stated buyer but ${Math.round((1 - rentVsBuyRatio) * 100)}% rental engagement — may be shifting to rental`;
    }
  }

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
    rent_vs_buy_ratio: rentVsBuyRatio,
    engaged_neighborhoods: engagedNeighborhoods,
    drift_detected: driftDetected,
    drift_details: driftDetails,
  };

  // Persist profile — write-on-change only (Phase 3, item-6 inventory fix).
  // `last_computed` means "last MATERIAL result change"; an unchanged profile
  // performs ZERO writes. `last_event_at` is data-derived (max recorded_at)
  // and therefore material. NOTE: `intent_strength` uses wall-clock time
  // decay, so it genuinely drifts across days — suppression mainly dedupes
  // same-day re-runs and saturated/stable profiles.
  const topFeatures: Record<string, number> = {};
  for (const [k, v] of neighborhoods) topFeatures[`nh:${k}`] = v;
  for (const [k, v] of types) topFeatures[`type:${k}`] = v;

  const materialNext: Record<string, unknown> = {
    intent_strength: intentStrength,
    intent_stage: intentStage,
    price_min: priceMin,
    price_max: priceMax,
    preferred_neighborhoods: result.preferred_neighborhoods,
    preferred_types: result.preferred_types,
    preferred_beds: result.preferred_beds,
    amenity_preferences: result.amenity_preferences,
    preferred_boroughs: result.preferred_boroughs,
    top_features: topFeatures,
    event_count: events.length,
    last_event_at: lastEvent,
  };
  const stored = (await prisma.buyerIntentProfile.findUnique({
    where: { lead_id: leadId },
    select: {
      intent_strength: true,
      intent_stage: true,
      price_min: true,
      price_max: true,
      preferred_neighborhoods: true,
      preferred_types: true,
      preferred_beds: true,
      amenity_preferences: true,
      preferred_boroughs: true,
      top_features: true,
      event_count: true,
      last_event_at: true,
    },
  })) as Record<string, unknown> | null;
  const unchanged =
    !!stored &&
    Object.keys(materialNext).every((key) => materialValuesEqual(materialNext[key], stored[key]));
  if (unchanged) {
    if (options?.counters) {
      options.counters.rows_checked++;
      options.counters.rows_suppressed_unchanged++;
    }
    return result;
  }
  if (options?.counters) {
    options.counters.rows_checked++;
    if (stored) {
      options.counters.rows_materially_changed++;
      options.counters.rows_updated++;
    } else {
      options.counters.rows_inserted++;
    }
  }

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
export async function batchRecompute(batchSize = 50): Promise<{
  computed: number;
  write_paths: { intent_profiles: WritePathCounters };
}> {
  const counters = newWritePathCounters();
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
      await computeIntentProfile(lead_id, { counters });
      computed++;
    } catch (err) {
      counters.rows_failed++;
      console.warn(`[buyer-intent] Failed to profile lead ${lead_id}:`, err);
    }
  }
  return { computed, write_paths: { intent_profiles: counters } };
}
