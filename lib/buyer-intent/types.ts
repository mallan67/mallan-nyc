/**
 * Buyer Intent Graph — Type Definitions
 * First-party behavioral signals only. No MLS data.
 */

export const INTENT_EVENT_TYPES = [
  'search_query',
  'page_view',
  'favorite',
  'map_interaction',
  'inquiry',
  'showing_request',
  'filter_change',
] as const;

export type IntentEventType = typeof INTENT_EVENT_TYPES[number];

export const INTENT_STAGES = ['browsing', 'exploring', 'comparing', 'ready'] as const;
export type IntentStage = typeof INTENT_STAGES[number];

export interface IntentProfileResult {
  lead_id: bigint;
  intent_strength: number;
  intent_stage: IntentStage;
  price_min: number | null;
  price_max: number | null;
  preferred_neighborhoods: string[];
  preferred_types: string[];
  preferred_beds: number[];
  amenity_preferences: string[];
  preferred_boroughs: string[];
  event_count: number;
}

export interface RecommendationItem {
  listing_id: string;
  address: string | null;
  score: number;
  match_reasons: string[];
}
