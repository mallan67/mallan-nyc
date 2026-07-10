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
