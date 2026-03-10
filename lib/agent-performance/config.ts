import type { Tier } from './types';

export const COMPONENT_WEIGHTS = {
  time_to_contact: 0.20,
  conversion: 0.25,
  closing_speed: 0.15,
  compliance: 0.15,
  responsiveness: 0.15,
  volume: 0.10,
};

export const TIER_THRESHOLDS: Record<Tier, number> = {
  platinum: 90,
  gold: 75,
  silver: 55,
  bronze: 0,
};

export const ROLLING_MONTHS = 6;

// Normalization benchmarks (what counts as "perfect" 100 score)
export const BENCHMARKS = {
  time_to_contact_ideal_hours: 1,    // 1 hour = 100, 24+ hours = 0
  time_to_contact_worst_hours: 48,
  showings_to_offer_ideal: 0.5,      // 50% of showings lead to offer = 100
  closing_cadence_ideal_days: 30,    // 30 days = 100
  closing_cadence_worst_days: 120,
  deal_volume_benchmark: 5,          // 5 deals/month = 100
};
