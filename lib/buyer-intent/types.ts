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
  // ─── Listing Email Engagement Events ──────────────────
  'listing_email_sent',        // Agent/system sent listings to client
  'listing_email_opened',      // Client opened the email
  'listing_link_clicked',      // Client clicked a specific listing link
  'listing_view_duration',     // Time spent viewing a listing (payload: { seconds, listingId })
  'listing_browse_from',       // Client browsed to another listing from one we sent
  'listing_quick_dismiss',     // Client left listing in < 5 seconds
  'rent_vs_buy_viewed',        // Client viewed the rent vs buy analysis section
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
  /** Ratio of sale vs rental engagement: 0 = all rental, 1 = all sale, 0.5 = even */
  rent_vs_buy_ratio: number;
  /** Neighborhoods the client is actually engaging with (may differ from stated prefs) */
  engaged_neighborhoods: string[];
  /** Detected interest drift: stated prefs vs actual engagement */
  drift_detected: boolean;
  drift_details: string | null;
}

export interface RecommendationItem {
  listing_id: string;
  address: string | null;
  score: number;
  match_reasons: string[];
}
