import type { IntentEventType, IntentStage } from './types';

export const EVENT_WEIGHTS: Record<IntentEventType, number> = {
  search_query: 0.10,
  page_view: 0.05,
  favorite: 0.25,
  map_interaction: 0.05,
  inquiry: 0.25,
  showing_request: 0.20,
  filter_change: 0.10,
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
