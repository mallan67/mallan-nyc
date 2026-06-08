// Pure derivation of ops:health issues for the neon-branch-prune cron, from the
// last `neon_branch_prune_cron` audit event's `changes`. Extracted from
// scripts/ops-health.js (2026-06-07, Phase 0.5) so the status->issue policy is
// unit-testable WITHOUT a DB (ops-health.js itself auto-connects to Prisma).
//
// Mirrors the prior inline behavior byte-for-byte for the existing statuses, and
// ADDS a `refused` branch: the Phase 0.5 guard makes the prune route refuse when
// NEON_PROJECT_ID is non-canonical. A refused run is RECENT (so the >25h staleness
// check never fires) and carries NO `examined` count (it returns before
// pruneBranches), so without this branch ops:health would stay green while every
// daily prune is silently blocked — the exact silent-failure shape the guard was
// built to eliminate.
//
// CommonJS so scripts/ops-health.js (node, `require`) can consume it directly.

/**
 * @param {Object}   p
 * @param {string=}  p.status        last audit `status` (ok/skipped/error/refused/partial)
 * @param {number|null=} p.ageHours  hours since the last run (null if unknown)
 * @param {number=}  p.examined      branches examined on the last run
 * @param {number=}  p.errorsCount   per-branch delete failures on the last run
 * @param {string=}  p.error         truncated error message (status=error)
 * @param {string[]=} p.missing      missing env names (status=skipped)
 * @param {string=}  p.projectId     NEON_PROJECT_ID recorded on a refused run
 * @param {{branch_count_warning:number, branch_count_critical:number}} p.thresholds
 * @returns {{level:'critical'|'warning', category:'neon-prune', msg:string}[]}
 */
function deriveBranchPruneIssues({
  status,
  ageHours,
  examined,
  errorsCount,
  error,
  missing,
  projectId,
  thresholds,
}) {
  const issues = [];

  if (status === 'skipped') {
    const missingList = Array.isArray(missing) ? missing.join(',') : 'unknown';
    issues.push({
      level: 'critical',
      category: 'neon-prune',
      msg: `neon-branch-prune cron is skipping due to missing env: ${missingList} — provision in Vercel Production env`,
    });
  } else if (status === 'error') {
    const errMsg = typeof error === 'string' ? error.slice(0, 200) : 'unknown';
    issues.push({
      level: 'critical',
      category: 'neon-prune',
      msg: `neon-branch-prune cron threw on last run: ${errMsg}`,
    });
  } else if (status === 'refused') {
    // Phase 0.5: a non-canonical NEON_PROJECT_ID makes the route refuse every
    // prune. That is a production misconfiguration, not a quiet skip — flag it
    // critical so the wrong-project env var cannot stay silent.
    issues.push({
      level: 'critical',
      category: 'neon-prune',
      msg:
        `neon-branch-prune is REFUSING every run — NEON_PROJECT_ID "${projectId ?? 'unknown'}" ` +
        `is not the canonical production project, so the fail-closed guard blocks all pruning. ` +
        `Fix the Vercel Production env var.`,
    });
  } else if (typeof ageHours === 'number' && ageHours > 25) {
    issues.push({
      level: 'warning',
      category: 'neon-prune',
      msg: `neon-branch-prune cron last fired ${ageHours.toFixed(1)}h ago — schedule is daily, expected <25h`,
    });
  } else if (status === 'partial' || (typeof errorsCount === 'number' && errorsCount > 0)) {
    issues.push({
      level: 'warning',
      category: 'neon-prune',
      msg: `neon-branch-prune last run had ${errorsCount ?? '?'} per-branch delete failures`,
    });
  }

  if (typeof examined === 'number') {
    if (examined >= thresholds.branch_count_critical) {
      issues.push({
        level: 'critical',
        category: 'neon-prune',
        msg: `${examined} Neon branches examined — approaching Launch plan cap of 5000 (>= ${thresholds.branch_count_critical}). Operator must investigate preview-branch creation rate or aggressively prune.`,
      });
    } else if (examined >= thresholds.branch_count_warning) {
      issues.push({
        level: 'warning',
        category: 'neon-prune',
        msg: `${examined} Neon branches examined — exceeds Launch-plan hygiene threshold of ${thresholds.branch_count_warning} (baseline ~8). Preview-branch creation has accelerated; cap of 5000 is not yet at risk.`,
      });
    }
  }

  return issues;
}

module.exports = { deriveBranchPruneIssues };
