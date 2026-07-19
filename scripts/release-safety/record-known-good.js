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
const {
  fetchDeploymentServingAlias,
  aliasHostname,
  DEFAULT_PRODUCTION_ALIAS,
} = require('./verify-deployment-sha.js');

const DEFAULT_LEDGER = path.resolve(__dirname, '../../docs/operations/known-good-deployments.jsonl');

/**
 * Record the deployment CURRENTLY SERVING the production alias as
 * known-good. Identity is alias-proven (GET /v13/deployments/{alias}) —
 * never "newest production-target deployment", which may differ.
 *
 * Refuses to record when:
 *   - the deployment is not READY;
 *   - the SHA does not match `expectedSha` (when provided);
 *   - the required alias (mallan.nyc by default) is not among the
 *     deployment's proven aliases;
 *   - alias ownership cannot be proven (no alias metadata).
 */
async function recordKnownGood({
  token,
  aliasHost = DEFAULT_PRODUCTION_ALIAS,
  teamId,
  expectedSha,
  verifiedBy,
  ledgerPath = DEFAULT_LEDGER,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
}) {
  const deployment = await fetchDeploymentServingAlias({ token, aliasHost, teamId, fetchImpl });
  if (!deployment) {
    return { recorded: false, reason: `no deployment resolves for alias '${aliasHost}'` };
  }
  const state = deployment.readyState || deployment.state || null;
  if (state !== 'READY') {
    return { recorded: false, reason: `deployment state=${state || 'unknown'} — only READY deployments can be known-good` };
  }
  if (!Array.isArray(deployment.alias) || deployment.alias.length === 0) {
    return { recorded: false, reason: `alias ownership cannot be proven — deployment carries no alias metadata (required: ${aliasHost})` };
  }
  const aliases = deployment.alias.map(aliasHostname).filter(Boolean);
  if (!aliases.includes(aliasHost.toLowerCase())) {
    return { recorded: false, reason: `refusing to record: '${aliasHost}' is not among the proven aliases [${aliases.join(', ')}]` };
  }
  const sha = (deployment.meta && (deployment.meta.githubCommitSha || deployment.meta.gitCommitSha)) || null;
  if (expectedSha && (!sha || sha.toLowerCase() !== expectedSha.toLowerCase())) {
    return { recorded: false, reason: `refusing to record: SHA_MISMATCH — deployment built from ${sha || 'unknown'}, expected ${expectedSha}` };
  }
  const entry = {
    recorded_at: now(),
    deployment_id: deployment.uid || deployment.id || null,
    sha,
    aliases,
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
    aliasHost: flag('--alias') || process.env.PRODUCTION_ALIAS || undefined,
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
