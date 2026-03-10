/**
 * Dynamic Pricing Experiments — Configuration
 */

import type { EngagementEventType } from './types';

// ── Minimum Sample Sizes ──
export const MIN_SAMPLE_SIZE = 30;    // Minimum events per arm before analysis
export const DEFAULT_TARGET_SAMPLE = 100;

// ── Statistical Thresholds ──
export const DEFAULT_SIGNIFICANCE = 0.95;  // 95% confidence

// ── Event Weights for Composite Score ──
export const EVENT_WEIGHTS: Record<EngagementEventType, number> = {
  page_view: 0.05,
  inquiry: 0.30,
  showing_request: 0.30,
  save_favorite: 0.15,
  time_on_page: 0.10,
  cta_click: 0.10,
};

// ── Experiment Auto-Conclude ──
export const AUTO_CONCLUDE_AFTER_DAYS = 90;
