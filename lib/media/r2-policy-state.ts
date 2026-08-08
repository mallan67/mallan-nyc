/**
 * R2 DELIVERY POLICY STATE — separated from RETRY/FAILURE STATE.
 *
 * THE OVERLOAD
 * ------------
 * `listing_media.r2_attempts` currently carries TWO different facts:
 *
 *   NULL / 1..7 → real consecutive mirror-failure count
 *   8           → real retry exhaustion (`R2_RETRY_EXHAUSTED_THRESHOLD`)
 *   9           → "excluded by current mirror policy" (`R2_POLICY_PARKED_ATTEMPTS`)
 *   >9          → legacy overflow population; not producible by current arithmetic
 *
 * The sentinel is disciplined — verified at HEAD: `buildR2BacklogWhere` selects
 * only `r2_attempts IS NULL OR < 8`, so an increment writes at most 8, the
 * permanent-failure park writes exactly 8, and only the Phase-3 policy
 * `updateMany` writes 9. So 8 and 9 ARE distinguishable today.
 *
 * The defect is not ambiguity — it is that a POLICY decision is stored in a
 * column whose name, type and selector semantics all say FAILURE. Every reader
 * must know the sentinel convention or it will read a deliberate policy
 * exclusion as an exhausted retry: wrong in dashboards, wrong in forensics, and
 * wrong the moment someone adds a retry rule that treats "high attempts" as
 * "broken asset".
 *
 * `r2_last_attempt_at` is overloaded the same way — policy parking stamps it as
 * a cooldown even though no attempt was made.
 *
 * WHAT THIS MODULE DOES
 * ---------------------
 * It is the ONE place that interprets those columns. Every reader asks here
 * instead of comparing to magic numbers. That makes the eventual migration a
 * change to this file plus the writers, not a repo-wide hunt.
 *
 * A POLICY EXCLUSION IS NOT A FAILURE. It must never increment the failure
 * count, never look retry-exhausted, and never block later re-admission.
 *
 * PURE — no Prisma, no I/O.
 */

import {
  R2_RETRY_EXHAUSTED_THRESHOLD,
  R2_POLICY_PARKED_ATTEMPTS,
} from '@/lib/idx/media-sync';

/** The R2 columns this module interprets. */
export interface R2StateRow {
  r2_attempts?: number | null;
  r2_key?: string | null;
  r2_last_attempt_at?: Date | null;
  /**
   * FUTURE explicit policy state. Not yet in the Prisma schema — the migration
   * is prepared but HELD (CLAUDE.md §C holds schema migrations). Optional here
   * so this seam is already correct on the day the column lands: readers keep
   * working, and only the writers change.
   */
  r2_policy_excluded_at?: Date | null;
}

/**
 * Is this row excluded by delivery POLICY (as opposed to having failed)?
 *
 * Reads the explicit state first, then falls back to the EXACT legacy sentinel.
 * Exact `=== 9`, never `>= 9`: the `>9` legacy overflow population has unproven
 * provenance and must not be silently absorbed into "policy".
 */
export function isR2PolicyExcluded(row: R2StateRow): boolean {
  if (row.r2_policy_excluded_at != null) return true;
  return row.r2_attempts === R2_POLICY_PARKED_ATTEMPTS;
}

/**
 * The REAL consecutive mirror-failure count.
 *
 * The sentinel is NOT nine failures. A policy-excluded row has made no failed
 * attempt attributable to the asset, so it reports 0 — the whole point of the
 * separation. Legacy `>9` also reports 0 rather than a fabricated count.
 */
export function r2RetryFailureCount(row: R2StateRow): number {
  const raw = row.r2_attempts;
  if (raw == null) return 0;
  if (raw === R2_POLICY_PARKED_ATTEMPTS) return 0;
  if (raw > R2_POLICY_PARKED_ATTEMPTS) return 0; // legacy overflow — unproven
  return raw;
}

/** Has this row genuinely exhausted its retries through REAL failures? */
export function isR2RetryExhausted(row: R2StateRow): boolean {
  if (isR2PolicyExcluded(row)) return false; // policy exclusion is not failure
  return r2RetryFailureCount(row) >= R2_RETRY_EXHAUSTED_THRESHOLD;
}

/** Does a durable object exist for this row? */
export function isR2Mirrored(row: R2StateRow): boolean {
  return typeof row.r2_key === 'string' && row.r2_key.length > 0;
}

/** Classification buckets for the historical dry-run. */
export type R2LegacyClass =
  | 'explicit_policy_state'
  | 'legacy_9_provably_policy'
  | 'legacy_9_ambiguous'
  | 'retry_exhausted_8'
  | 'legacy_overflow_gt9'
  | 'retry_pending'
  | 'never_attempted'
  | 'mirrored';

/**
 * DRY-RUN historical classifier. Read-only; classifies, never mutates.
 *
 * WHY `currentPolicyExcludes` IS REQUIRED, NOT OPTIONAL: the verified proof that
 * only the policy path writes 9 covers rows written by CURRENT code. A
 * historical row could predate the sentinel or an earlier threshold, so the
 * number alone is not provenance. A legacy 9 is called PROVABLY policy only when
 * current policy INDEPENDENTLY agrees the asset is excluded. Otherwise it stays
 * AMBIGUOUS — deliberately unresolved rather than resolved by assumption.
 */
export function classifyR2LegacyState(
  row: R2StateRow,
  currentPolicyExcludes: boolean,
): R2LegacyClass {
  if (row.r2_policy_excluded_at != null) return 'explicit_policy_state';

  const raw = row.r2_attempts;
  if (raw != null && raw > R2_POLICY_PARKED_ATTEMPTS) return 'legacy_overflow_gt9';
  if (raw === R2_POLICY_PARKED_ATTEMPTS) {
    return currentPolicyExcludes ? 'legacy_9_provably_policy' : 'legacy_9_ambiguous';
  }
  if (raw === R2_RETRY_EXHAUSTED_THRESHOLD) return 'retry_exhausted_8';
  if (isR2Mirrored(row)) return 'mirrored';
  if (raw == null || raw === 0) return 'never_attempted';
  return 'retry_pending';
}

/**
 * Is this row eligible for a mirror attempt right now?
 *
 * Policy exclusion short-circuits BEFORE retry state is consulted, so an
 * excluded row can never be selected, can never fail, and can never accumulate
 * a failure count it did not earn.
 */
export function isEligibleForMirrorAttempt(row: R2StateRow): boolean {
  if (isR2PolicyExcluded(row)) return false;
  if (isR2RetryExhausted(row)) return false;
  return true;
}
