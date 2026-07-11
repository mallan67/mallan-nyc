/**
 * record-status.ts — TWO independent record-status axes (PURE, A1).
 *
 * Verification (data-quality) and supplemental lifecycle (existence/eligibility)
 * are SEPARATE fields, never one overloaded enum. A record may be
 * `lifecycle = active` + `verification = stale`, or `lifecycle =
 * superseded_by_rebny` + `verification = verified`. Keeping them apart makes
 * filtering, auditing, and reporting queryable per axis.
 *
 * Internal vocabularies — no Cotality live binding. NOT WIRED in A1.
 */

// Data-quality axis -----------------------------------------------------------
export const VERIFICATION_STATUSES = Object.freeze([
  'verified',
  'verification_required',
  'stale',
  'conflicted',
] as const);
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export function isVerificationStatus(v: unknown): v is VerificationStatus {
  return typeof v === 'string' && (VERIFICATION_STATUSES as readonly string[]).includes(v);
}

// Existence / eligibility axis (supplemental records) -------------------------
export const SUPPLEMENTAL_LIFECYCLE_STATUSES = Object.freeze([
  'active',
  'removed_at_source',
  'superseded_by_rebny',
  'license_blocked',
] as const);
export type SupplementalLifecycleStatus = (typeof SUPPLEMENTAL_LIFECYCLE_STATUSES)[number];
export function isSupplementalLifecycleStatus(v: unknown): v is SupplementalLifecycleStatus {
  return typeof v === 'string' && (SUPPLEMENTAL_LIFECYCLE_STATUSES as readonly string[]).includes(v);
}

/**
 * Lifecycle values that are SUPPRESSED from all result sets (regardless of
 * verification status). Only `active` is ever eligible to appear. `Record`
 * over the union → compile-time completeness.
 */
const LIFECYCLE_SUPPRESSED: Readonly<Record<SupplementalLifecycleStatus, boolean>> = Object.freeze({
  active: false,
  removed_at_source: true,
  superseded_by_rebny: true,
  license_blocked: true,
});

export function isSuppressedLifecycle(status: SupplementalLifecycleStatus): boolean {
  return LIFECYCLE_SUPPRESSED[status];
}
