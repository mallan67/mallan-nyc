/**
 * comp-eligibility.ts — canonical comparable eligibility (PURE).
 *
 * GUARDRAILS:
 *   - Closed comps use CloseDate windowing — NEVER ModificationTimestamp (the current CMA bug).
 *   - Ownership is segmented from live CommonInterest values (condo/coop/condop/rental_building).
 *     Do NOT mix co-op and condo comps unless the caller explicitly opts in (`mixOwnership`).
 *   - PURE: caller supplies the reference date; no `Date.now()` (deterministic/testable).
 *   - NOT WIRED: this module is not imported by lib/cma/* in Backend-Search-1. The CMA close-price
 *     fix (which will consume this) is a separate, later PR.
 */

import type { StatusGroup } from './status';
import type { OwnershipClass } from './ownership';

export type CompEligibility = 'active_comp' | 'pending_comp' | 'closed_comp' | 'excluded';

export interface CompCandidate {
  group: StatusGroup;
  ownership: OwnershipClass;
  /** ISO date string or Date; the listing's CloseDate (only meaningful for closed_recent). */
  closeDate?: string | Date | null;
}

export interface CompCriteria {
  /** ownership class of the subject listing (e.g. a co-op's comps should be co-ops). */
  targetOwnership: OwnershipClass;
  /** reference "now" (ISO string or Date) — supplied by caller for determinism. */
  asOf: string | Date;
  /** closed comps must have CloseDate within this many days of `asOf`. */
  closedWindowDays: number;
  /** explicit opt-in to mix ownership classes (default false → strict). */
  mixOwnership?: boolean;
}

function toTime(d: string | Date | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isNaN(t) ? null : t;
}

/**
 * Classify a candidate's comp eligibility relative to a subject listing. PURE.
 * 'excluded' when ownership mismatches (unless mixOwnership) or a closed comp is outside the
 * CloseDate window / missing a CloseDate.
 */
export function compEligibility(candidate: CompCandidate, criteria: CompCriteria): CompEligibility {
  if (!criteria.mixOwnership && candidate.ownership !== criteria.targetOwnership) return 'excluded';

  switch (candidate.group) {
    case 'active_on_market':
      return 'active_comp';
    case 'pending_contract':
      return 'pending_comp';
    case 'closed_recent': {
      const close = toTime(candidate.closeDate ?? null); // MUST be CloseDate, never ModificationTimestamp
      const asOf = toTime(criteria.asOf);
      if (close == null || asOf == null) return 'excluded';
      const windowMs = criteria.closedWindowDays * 24 * 60 * 60 * 1000;
      return close >= asOf - windowMs && close <= asOf ? 'closed_comp' : 'excluded';
    }
    default:
      return 'excluded';
  }
}

// --- Evidence classification (A1) --------------------------------------------
// The evidence TAXONOMY a comp candidate provides — distinct from CompEligibility
// (the active/pending/closed/excluded axis above). Reserved for Comp Engine V2
// (Lane C); declared here so search and comps share one vocabulary. Only ONE
// class may drive a valuation. Internal vocabulary — no Cotality live binding.
// NOT WIRED in A1.
export const EVIDENCE_CLASSIFICATIONS = Object.freeze([
  'VALUATION_EVIDENCE',
  'ACTIVE_COMPETITION',
  'SUPPLEMENTAL_MARKET_OBSERVATION',
  'PROPERTY_FACT',
  'UNVERIFIED_LEAD',
] as const);
export type EvidenceClassification = (typeof EVIDENCE_CLASSIFICATIONS)[number];

export function isEvidenceClassification(v: unknown): v is EvidenceClassification {
  return typeof v === 'string' && (EVIDENCE_CLASSIFICATIONS as readonly string[]).includes(v);
}

/**
 * Only verified closed-sale VALUATION_EVIDENCE may drive a valuation; active
 * competition is pricing context, supplemental observations are context only,
 * property facts are descriptive, unverified leads inform discovery only.
 * `Record` over the union → compile-time completeness.
 */
const EVIDENCE_DRIVES_VALUE: Readonly<Record<EvidenceClassification, boolean>> = Object.freeze({
  VALUATION_EVIDENCE: true,
  ACTIVE_COMPETITION: false,
  SUPPLEMENTAL_MARKET_OBSERVATION: false,
  PROPERTY_FACT: false,
  UNVERIFIED_LEAD: false,
});

export function mayDriveValuation(c: EvidenceClassification): boolean {
  return EVIDENCE_DRIVES_VALUE[c];
}
