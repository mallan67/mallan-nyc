#!/usr/bin/env node
/**
 * Release-safety P2 — control 7: known-good deployment recorder.
 *
 * After a release is verified (deployment-SHA MATCH + listing smoke pass),
 * this appends one JSON line to docs/operations/known-good-deployments.jsonl
 * so the NEXT incident's rollback target is a recorded fact, not archaeology
 * (during PR #523 the rollback target had to be reconstructed from the
 * Vercel dashboard under pressure).
 *
 * Read-only against Vercel (GET only, via verify-deployment-sha.js helpers);
 * writes ONLY the local ledger file. No promotion/alias/settings call.
 * There is no pre-promotion hook in the current release architecture to
 * attach this to — it is a runbook step (see release-safety-runbook.md).
 */

const fs = require('fs');
const path = require('path');
const { fetchLatestProductionDeployment, decideDeploymentVerdict } = require('./verify-deployment-sha.js');

const DEFAULT_LEDGER = path.resolve(__dirname, '../../docs/operations/known-good-deployments.jsonl');

/**
 * Record the current production deployment as known-good.
 * Refuses to record when the deployment is not READY, or when
 * `expectedSha` is provided and does not match (never record an unproven
 * deployment as known-good).
 */
async function recordKnownGood({
  token,
  projectId,
  teamId,
  expectedSha,
  verifiedBy,
  ledgerPath = DEFAULT_LEDGER,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
}) {
  const deployment = await fetchLatestProductionDeployment({ token, projectId, teamId, fetchImpl });
  if (!deployment) {
    return { recorded: false, reason: 'no production deployment found' };
  }
  const state = deployment.readyState || deployment.state || null;
  if (state !== 'READY') {
    return { recorded: false, reason: `deployment state=${state || 'unknown'} — only READY deployments can be known-good` };
  }
  const sha = (deployment.meta && (deployment.meta.githubCommitSha || deployment.meta.gitCommitSha)) || null;
  if (expectedSha) {
    const verdict = decideDeploymentVerdict(expectedSha, deployment);
    if (verdict.verdict !== 'MATCH') {
      return { recorded: false, reason: `refusing to record: ${verdict.verdict} — ${verdict.reason}` };
    }
  }
  const entry = {
    recorded_at: now(),
    deployment_id: deployment.uid || null,
    sha,
    url: deployment.url || null,
    verified_by: verifiedBy || 'manual',
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
  return { recorded: true, entry, ledgerPath };
}

module.exports = { recordKnownGood, DEFAULT_LEDGER };

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  recordKnownGood({
    token: process.env.VERCEL_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    expectedSha: flag('--expected-sha') || undefined,
    verifiedBy: flag('--verified-by') || 'manual',
    ledgerPath: flag('--ledger') || undefined,
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.recorded ? 0 : 1);
    })
    .catch((err) => {
      console.error(`[record-known-good] fatal: ${err.message}`);
      process.exit(1);
    });
}
