import type { IntentEventType, IntentStage } from './types';

export const EVENT_WEIGHTS: Record<IntentEventType, number> = {
  search_query: 0.10,
  page_view: 0.05,
  favorite: 0.25,
  map_interaction: 0.05,
  inquiry: 0.25,
  showing_request: 0.20,
  filter_change: 0.10,
  // Listing email engagement events
  listing_email_sent: 0.0,        // System action, not client intent
  listing_email_opened: 0.08,     // Opened = mild interest
  listing_link_clicked: 0.15,     // Clicked = strong signal
  listing_view_duration: 0.12,    // Time spent = consideration
  listing_browse_from: 0.18,      // Browsed further = active exploration
  listing_quick_dismiss: -0.05,   // Quick leave = negative signal
  rent_vs_buy_viewed: 0.10,       // Viewed analysis = considering transition
  financial_tool_used: 0.12,      // Tested budget/payment assumptions
  financial_tool_lead_request: 0.25, // Asked for follow-up from a calculator
};

export const DECAY_HALF_LIFE_DAYS = 14;

export const STAGE_THRESHOLDS: Record<IntentStage, number> = {
  browsing: 0,
  exploring: 25,
  comparing: 50,
  ready: 75,
};

export const PROFILE_STALE_HOURS = 24;
export const RECOMMENDATION_LIMIT = 20;
