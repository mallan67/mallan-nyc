/**
 * Dynamic Pricing Experiments — Type Definitions
 *
 * A/B testing for listing marketing strategies.
 * Uses buyer engagement signals only — NO MLS data manipulation.
 */

// ── Experiment Types ──

export const EXPERIMENT_TYPES = [
  'exposure_level',       // Marketing exposure: standard vs extended
  'showing_strategy',     // Open house vs staged private showings
  'photo_order',          // Photo presentation sequence
  'description_variant',  // Description emphasis (features vs lifestyle)
] as const;

export type ExperimentType = typeof EXPERIMENT_TYPES[number];

export const EXPERIMENT_TYPE_LABELS: Record<ExperimentType, string> = {
  exposure_level: 'Marketing Exposure Level',
  showing_strategy: 'Showing Strategy',
  photo_order: 'Photo Presentation Order',
  description_variant: 'Description Variant',
};

// ── Experiment Statuses ──

export const EXPERIMENT_STATUSES = [
  'draft',
  'active',
  'concluded',
  'archived',
] as const;

export type ExperimentStatus = typeof EXPERIMENT_STATUSES[number];

// ── Engagement Event Types ──

export const ENGAGEMENT_EVENT_TYPES = [
  'page_view',
  'inquiry',
  'showing_request',
  'save_favorite',
  'time_on_page',
  'cta_click',
] as const;

export type EngagementEventType = typeof ENGAGEMENT_EVENT_TYPES[number];

// ── Metrics ──

export interface ArmMetrics {
  listing_count: number;
  page_views: number;
  inquiries: number;
  showing_requests: number;
  saves: number;
  cta_clicks: number;
  avg_time_on_page: number;
  total_events: number;
  /** Derived rates */
  inquiry_rate: number;      // inquiries / page_views
  showing_rate: number;      // showing_requests / page_views
  save_rate: number;         // saves / page_views
}

export interface ExperimentResult {
  control_metrics: ArmMetrics;
  treatment_metrics: ArmMetrics;
  lift: {
    inquiry_rate: number;    // % change
    showing_rate: number;
    save_rate: number;
    avg_time_on_page: number;
    composite: number;       // Weighted composite lift
  };
  p_value: number;
  is_significant: boolean;
  sample_size: number;
  computed_at: string;
}

// ── Consent ──

export const CONSENT_METHODS = [
  'seller_portal',
  'email',
  'in_person',
] as const;

export type ConsentMethod = typeof CONSENT_METHODS[number];

export const CONSENT_TERMS_VERSION = '2026.1';
