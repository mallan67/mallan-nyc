/**
 * attribution.ts — canonical source/attribution labeling (PURE), COMPOSED from resolveVisibility.
 *
 * The merged visibility contract already decides WHICH label requirements apply
 * (requiresSourceLabel / requiresStatusLabel / requiresTransactionLabel / requiresAttribution).
 * This module composes that decision into a labeling obligation every audience-facing surface
 * must assert — closing the analysis §3 gap where client alert emails / reports shipped without
 * courtesy attribution. It does NOT re-decide visibility. NOT WIRED in Backend-Search-1.
 */

import {
  resolveVisibility,
  type Audience,
  type LifecycleStatus,
  type Source,
  type TransactionType,
} from '../visibility-contract';
import {
  isSourceAuthority,
  isObservationPlatform,
  isSourceAccessMethod,
  type SourceAuthority,
  type ObservationPlatform,
  type SourceAccessMethod,
} from './source-provenance';

export interface AttributionInput {
  audience: Audience;
  status: LifecycleStatus;
  source: Source;
  transactionType: TransactionType;
}

export interface AttributionRequirement {
  requiresSourceLabel: boolean;
  requiresStatusLabel: boolean;
  requiresTransactionLabel: boolean; // sold vs rented — never collapsed
  requiresAttribution: boolean;      // "Listing Courtesy of {office}" for MLS/Cotality rows
}

/** Resolve the labeling obligations for a row, composing the merged visibility decision. */
export function resolveAttribution(input: AttributionInput): AttributionRequirement {
  const d = resolveVisibility({ ...input, usage: 'report' });
  return {
    requiresSourceLabel: d.requiresSourceLabel,
    requiresStatusLabel: d.requiresStatusLabel,
    requiresTransactionLabel: d.requiresTransactionLabel,
    requiresAttribution: d.requiresAttribution,
  };
}

/** The courtesy line required on MLS/Cotality-sourced rows (RLS attribution). */
export function courtesyLabel(officeName: string | null | undefined): string | null {
  const office = (officeName ?? '').trim();
  return office ? `Listing Courtesy of ${office}` : null;
}

/**
 * Fail-loud helper: an audience-facing render of an MLS-sourced row that requires attribution but
 * has no office to attribute is a compliance defect (NY DOS §175.25 / RLS). Returns an error string
 * when the obligation cannot be met, else null.
 */
export function attributionViolation(req: AttributionRequirement, officeName: string | null | undefined): string | null {
  if (req.requiresAttribution && !courtesyLabel(officeName)) {
    return 'attribution required (MLS-sourced) but no ListOfficeName available to attribute';
  }
  return null;
}

// --- Attribution envelope (A1) -----------------------------------------------
/**
 * Full provenance envelope for a fact/row. Separates the six attribution facets so
 * they can never be conflated: factual authority, observation platform, listing
 * brokerage, listing agent, access method, and audience obligations. An
 * `ObservationPlatform` (StreetEasy/Zillow) is NEVER the listing brokerage/agent
 * unless the source record expressly states it (`listingBrokerage`/`listingAgent`
 * set). Pure data shape — no runtime reader in A1.
 */
export interface AttributionEnvelope {
  factualAuthority: SourceAuthority;
  observationPlatform: ObservationPlatform;
  listingBrokerage?: string; // only if the record states it
  listingAgent?: string;     // only if stated
  accessMethod: SourceAccessMethod;
  observedAt: string;        // ISO-8601
  verifiedAt?: string;       // ISO-8601
  audienceObligations: readonly string[]; // e.g. attribution_required, broker_agent_only
}

export function isAttributionEnvelope(v: unknown): v is AttributionEnvelope {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  if (!isSourceAuthority(e.factualAuthority)) return false;
  if (!isObservationPlatform(e.observationPlatform)) return false;
  if (!isSourceAccessMethod(e.accessMethod)) return false;
  if (typeof e.observedAt !== 'string') return false;
  if (!Array.isArray(e.audienceObligations) || !e.audienceObligations.every((o) => typeof o === 'string')) {
    return false;
  }
  for (const k of ['listingBrokerage', 'listingAgent', 'verifiedAt'] as const) {
    if (e[k] !== undefined && typeof e[k] !== 'string') return false;
  }
  return true;
}

/**
 * The RLS courtesy line, ONLY for Cotality/REBNY-authoritative rows — reuses
 * `courtesyLabel` (no reinvention). An observation platform (StreetEasy/Zillow)
 * never produces a courtesy line. Returns null when not required / no brokerage.
 */
export function attributionEnvelopeCourtesy(env: AttributionEnvelope): string | null {
  if (env.factualAuthority !== 'cotality_rebny') return null;
  return courtesyLabel(env.listingBrokerage);
}
