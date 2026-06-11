// Lane-D (RC3 Trace Record §10 follow-up): pure R2-retry-backlog health policy.
//
// RC3 (#379) parks retry-exhausted rows (r2_attempts >= R2_RETRY_EXHAUSTED_THRESHOLD)
// out of the Phase-3 mirror backlog while keeping them displayable. ops-health
// previously counted EVERY active row with r2_attempts > 0 as actionable retry
// backlog — post-RC3 that over-reports (44 actionable + 40 parked = 84 tripped
// the 50-row warn on a healthy system).
//
// THRESHOLD DUPLICATION (deliberate, drift-guarded): this file is plain
// CommonJS consumed by scripts/ops-health.js, which cannot require the TS
// module lib/idx/media-sync.ts. The value is duplicated here and BOUND by a
// jest drift-guard (tests/runtime/r2-retry-health-drift.test.ts) importing
// both sides and asserting strict equality — change one without the other and
// the suite fails loudly. (Pattern: scripts/branch-prune-health.js.)
const R2_RETRY_EXHAUSTED_THRESHOLD = 8;

// Actionable backlog keeps the historical 50/500 alarm levels; parked rows get
// a FAIL-CLOSED growth guard — intentionally-parked rows are not urgent, but a
// fast-growing parked count can mask a systemic R2/Trestle failure and must
// still surface (deep-review L11 / silent-failure principle).
const THRESHOLDS = {
  actionable_warn: 50,
  actionable_critical: 500,
  parked_warn: 150,
  parked_critical: 1000,
};

/**
 * Pure classifier: counts → ops-health issues.
 * @param {{ actionable: number, parked: number }} counts
 * @returns {Array<{ level: 'warning'|'critical', category: string, msg: string }>}
 */
function classifyR2RetryBacklog(counts) {
  const issues = [];
  const actionable = Number(counts.actionable) || 0;
  const parked = Number(counts.parked) || 0;

  if (actionable >= THRESHOLDS.actionable_critical) {
    issues.push({
      level: 'critical',
      category: 'media-sync',
      msg: `${actionable} ACTIONABLE listing_media rows in R2 retry backlog (0 < r2_attempts < ${R2_RETRY_EXHAUSTED_THRESHOLD}; critical >= ${THRESHOLDS.actionable_critical})`,
    });
  } else if (actionable > THRESHOLDS.actionable_warn) {
    issues.push({
      level: 'warning',
      category: 'media-sync',
      msg: `${actionable} ACTIONABLE listing_media rows in R2 retry backlog (0 < r2_attempts < ${R2_RETRY_EXHAUSTED_THRESHOLD}; warn > ${THRESHOLDS.actionable_warn})`,
    });
  }

  if (parked >= THRESHOLDS.parked_critical) {
    issues.push({
      level: 'critical',
      category: 'media-sync',
      msg: `${parked} PARKED retry-exhausted rows (r2_attempts >= ${R2_RETRY_EXHAUSTED_THRESHOLD}; critical >= ${THRESHOLDS.parked_critical}) — mass parking can mask a systemic R2/Trestle failure`,
    });
  } else if (parked > THRESHOLDS.parked_warn) {
    issues.push({
      level: 'warning',
      category: 'media-sync',
      msg: `${parked} PARKED retry-exhausted rows (r2_attempts >= ${R2_RETRY_EXHAUSTED_THRESHOLD}; warn > ${THRESHOLDS.parked_warn}) — growth guard`,
    });
  }

  return issues;
}

module.exports = { R2_RETRY_EXHAUSTED_THRESHOLD, THRESHOLDS, classifyR2RetryBacklog };
