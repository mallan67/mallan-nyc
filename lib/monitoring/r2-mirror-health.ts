/**
 * THE `r2-mirror` MONITORING SUBJECT — is durable mirroring keeping up?
 *
 * WHY THIS DELEGATES TO THE COMMIT-9 SEAM
 * ---------------------------------------
 * `listing_media.r2_attempts` overloads a POLICY decision (the `9` sentinel:
 * "current policy declines to mirror this asset") into a column whose name and
 * selector semantics say FAILURE. A monitor that reads the raw number counts
 * every deliberate exclusion as a broken asset. That is not a cosmetic error:
 * it pages an operator for work the system chose not to do, and an alert that
 * fires on intended behaviour is an alert everyone learns to ignore.
 *
 * So policy-excluded rows are removed from BOTH sides of the ratio. Keeping
 * them in the denominator would be just as wrong in the opposite direction —
 * a large parked population would dilute a genuine failure rate until it looked
 * survivable. Both distortions are covered by tests.
 *
 * SCOPE, STATED HONESTLY: this derives mirror health from observed database
 * state. It does NOT list the bucket, so it cannot detect an object that the
 * database believes exists but which is absent from R2. That is a separate
 * probe requiring R2 credentials, and it is not implemented here — no claim
 * about object-level integrity is made by this check.
 *
 * PURE — no I/O. The caller supplies the observed rows.
 */

import {
  isR2PolicyExcluded,
  isR2Mirrored,
  isR2RetryExhausted,
  type R2StateRow,
} from '@/lib/media/r2-policy-state';
import type { HealthCheck } from './health-verdict';

/**
 * Share of ELIGIBLE rows in terminal retry failure that makes the problem
 * systemic rather than incidental. Below it, a handful of dead assets is a
 * real but bounded defect (DEGRADED); above it, mirroring itself is broken
 * (FAIL).
 */
export const R2_MIRROR_FAIL_RATIO = 0.05;

/**
 * Assess mirror health from observed `listing_media` rows.
 *
 * `null` (query not run / failed) and an EMPTY result are both UNAVAILABLE:
 * having observed nothing is not the same as having found nothing wrong. A
 * media table that returns zero rows is a broken observation, not proof that
 * every asset is mirrored.
 */
export function r2MirrorHealth(rows: readonly R2StateRow[] | null): HealthCheck {
  if (rows === null) {
    return {
      subject: 'r2-mirror',
      verdict: 'UNAVAILABLE',
      evidence: 'listing_media not observed — no mirror state to assess',
    };
  }
  if (rows.length === 0) {
    return {
      subject: 'r2-mirror',
      verdict: 'UNAVAILABLE',
      evidence: 'observed 0 listing_media rows — a broken observation, not a clean bill of health',
    };
  }

  const policyExcluded = rows.filter(isR2PolicyExcluded).length;
  const eligible = rows.filter((row) => !isR2PolicyExcluded(row));
  const exhausted = eligible.filter(isR2RetryExhausted).length;
  const mirroredRows = eligible.filter(isR2Mirrored).length;

  if (eligible.length === 0) {
    return {
      subject: 'r2-mirror',
      verdict: 'PASS',
      evidence:
        `${rows.length} row(s) observed, 0 eligible for mirroring ` +
        `(${policyExcluded} policy-excluded) — nothing was owed`,
    };
  }

  const ratio = exhausted / eligible.length;
  const verdict = exhausted === 0 ? 'PASS' : ratio > R2_MIRROR_FAIL_RATIO ? 'FAIL' : 'DEGRADED';

  return {
    subject: 'r2-mirror',
    verdict,
    evidence:
      `${eligible.length} eligible row(s): ${mirroredRows} mirrored, ${exhausted} retry-exhausted ` +
      `(${(ratio * 100).toFixed(2)}% vs ${(R2_MIRROR_FAIL_RATIO * 100).toFixed(0)}% threshold); ` +
      `${policyExcluded} policy-excluded row(s) counted in NEITHER side of the ratio`,
  };
}
