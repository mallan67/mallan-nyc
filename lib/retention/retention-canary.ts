/**
 * FIRST-PRODUCTION CANARY CEILING.
 *
 * Merging this PR arms a nightly job that mutates production data. The
 * module maximums below are the REVIEWED steady-state ceilings, not safe
 * first-run values: an unconstrained first execution would delete up to
 * 10,000 audit rows and clear up to 10,000 media tombstone payloads before
 * anyone had seen a single production result.
 *
 * So the cap is canary-by-default: with the env var UNSET the run is limited
 * to 100 rows. The operator reviews that first result, then raises the env
 * var to the steady-state ceiling. This is deliberately the opposite of the
 * usual "env disables a safety" pattern — here the env var *widens* an
 * already-safe default, and it is CLAMPED so a typo cannot exceed the
 * reviewed maximum.
 */
export const RETENTION_CANARY_MAX_ROWS = 100;

export function resolveRetentionCap(envName: string, reviewedMax: number): number {
  const raw = Number(process.env[envName]);
  if (!Number.isInteger(raw) || raw <= 0) return RETENTION_CANARY_MAX_ROWS;
  return Math.min(raw, reviewedMax);
}
