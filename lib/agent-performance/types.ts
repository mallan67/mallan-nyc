/**
 * Agent Performance Index — Type Definitions
 * Computed from internal CRM data only (deals, showings, leads, audit events).
 */

export const METRIC_TYPES = [
  'time_to_contact_avg',
  'showings_to_offer_ratio',
  'closing_cadence_days',
  'compliance_score',
  'response_rate',
  'deal_volume',
  'client_satisfaction',
] as const;

export type MetricType = typeof METRIC_TYPES[number];

export const TIERS = ['platinum', 'gold', 'silver', 'bronze'] as const;
export type Tier = typeof TIERS[number];

export interface MonthlyMetrics {
  month: string; // YYYY-MM
  time_to_contact_avg: number | null;   // hours
  showings_to_offer_ratio: number | null;
  closing_cadence_days: number | null;   // avg days from contract to close
  compliance_score: number;              // 0-100
  response_rate: number;                 // 0-100
  deal_volume: number;                   // count of closed deals
  client_satisfaction: number | null;    // 0-100 (optional survey)
  deals_closed: number;
  showings_conducted: number;
  leads_contacted: number;
}

export interface PerformanceComponents {
  time_to_contact: number;   // 0-100 normalized score
  conversion: number;        // 0-100
  closing_speed: number;     // 0-100
  compliance: number;        // 0-100
  responsiveness: number;    // 0-100
  volume: number;            // 0-100
}

export interface PerformanceIndexResult {
  agent_id: bigint;
  index_score: number;       // 0-100
  rank: number | null;
  tier: Tier;
  components: PerformanceComponents;
  months_included: number;
}

export interface LeaderboardEntry {
  rank: number;
  agent_id: string;          // BigInt serialized
  agent_name: string | null; // Only shown to broker, null for agent view
  index_score: number;
  tier: Tier;
  components: PerformanceComponents;
}
