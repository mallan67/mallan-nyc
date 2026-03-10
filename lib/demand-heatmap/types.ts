/**
 * Building-Level Demand Heatmap — Type Definitions
 * Non-MLS public data + first-party behavioral signals.
 */

export const DEMAND_SIGNAL_TYPES = [
  'new_business_license',
  'liquor_license',
  'building_permit',
  'str_registration',
  'saved_search_activity',
  'page_view_activity',
] as const;

export type DemandSignalType = typeof DEMAND_SIGNAL_TYPES[number];

export const TREND_DIRECTIONS = ['up', 'down', 'stable'] as const;
export type TrendDirection = typeof TREND_DIRECTIONS[number];

export const ALERT_TYPES = ['score_above', 'score_below', 'trend_change', 'spike'] as const;
export type AlertType = typeof ALERT_TYPES[number];

export interface SignalComponent {
  signal_type: DemandSignalType;
  value: number;
  normalized: number;
  weight: number;
  contribution: number;
}

export interface DemandIndexResult {
  neighborhood: string;
  borough: string | null;
  score: number;
  trend: TrendDirection;
  trend_delta: number;
  components: SignalComponent[];
  signal_count: number;
}
