/**
 * Predictive Seller Readiness — Type Definitions
 *
 * Uses ONLY non-MLS public data (ACRIS, DOB, first-party behavior).
 * No MLS/IDX data is used in scoring — fully compliant.
 */

// ── Signal Types ──

export const SIGNAL_TYPES = [
  'ownership_duration',
  'mortgage_age',
  'equity_estimate',
  'dob_permits',
  'renovation_signal',
  'building_risk',
  'page_visit',
  'cma_request',
  'valuation_form',
] as const;

export type SignalType = typeof SIGNAL_TYPES[number];

// ── Score Grades ──

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export function gradeFromScore(score: number): ScoreGrade {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// ── Lead Statuses ──

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'replied',
  'meeting',
  'signed',
  'declined',
] as const;

export type LeadStatus = typeof LEAD_STATUSES[number];

// ── Outreach Channels ──

export const OUTREACH_CHANNELS = [
  'email',
  'letter',
  'phone',
  'door_knock',
] as const;

export type OutreachChannel = typeof OUTREACH_CHANNELS[number];

// ── Signal Input (from collectors) ──

export interface SignalInput {
  signal_type: SignalType;
  raw_value: string | null;
  normalized: number;   // 0.0 – 1.0
  source: 'acris' | 'dob' | 'first_party' | 'manual';
  metadata?: Record<string, unknown>;
}

// ── Scored Result ──

export interface ScoredResult {
  readiness_score: number;   // 0-100
  score_grade: ScoreGrade;
  signals: SignalInput[];
}

// ── Outreach Template ──

export interface OutreachTemplate {
  id: string;
  name: string;
  channel: OutreachChannel;
  subject?: string;
  body: string;
  merge_fields: string[];   // e.g., ["owner_name", "address", "agent_name"]
}
