#!/usr/bin/env node
/**
 * Release-safety P2 — control 7: known-good deployment recorder.
 *
 * Appends one fully-verified deployment record to a LOCAL JSONL file.
 *
 * RECORD CLASS (stated on every record and here): LOCAL-RECORD ·
 * NOT-DURABLE · NOT-WORKFLOW-WIRED. This is a working-copy note that
 * informs a rollback DECISION — it is NOT a durable rollback ledger and
 * must never be described as one. (During PR #523 the rollback target had
 * to be reconstructed from the Vercel dashboard under pressure; this file
 * reduces that scramble, nothing more.)
 *
 * A record is written ONLY when the full identity chain holds (all
 * mandatory, refuse otherwise):
 *   1. expectedSha (mandatory) — the commit the release claims to ship;
 *   2. deploymentId (mandatory) — the EXACT deployment the verifier
 *      (verify-deployment-sha.js) matched;
 *   3. smokeEvidence (mandatory) — a listing-smoke result with
 *      passed === true, bound to the SAME expected_sha and deployment_id;
 *   4. alias ownership RECONFIRMED after the smoke: the deployment serving
 *      the production alias (mallan.nyc) right now must still be that exact
 *      deployment, READY, with a matching SHA and the alias in its own list;
 *   5. no duplicate: an existing record with the same deployment_id + sha
 *      is refused.
 *
 * Read-only against Vercel (GET only). No promotion/alias/settings call.
 */

const fs = require('fs');
const path = require('path');
const {
  fetchDeploymentServingAlias,
  aliasHostname,
  DEFAULT_PRODUCTION_ALIAS,
} = require('./verify-deployment-sha.js');

const DEFAULT_LEDGER = path.resolve(__dirname, '../../docs/operations/known-good-deployments.jsonl');
const RECORD_LABELS = ['LOCAL-RECORD', 'NOT-DURABLE', 'NOT-WORKFLOW-WIRED'];

/** Load smoke evidence from an object or a JSON file path. */
function loadSmokeEvidence(smokeEvidence) {
  if (smokeEvidence && typeof smokeEvidence === 'object') return smokeEvidence;
  if (typeof smokeEvidence === 'string') {
    try {
      return JSON.parse(fs.readFileSync(smokeEvidence, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

async function recordKnownGood({
  token,
  aliasHost = DEFAULT_PRODUCTION_ALIAS,
  teamId,
  expectedSha,
  deploymentId,
  smokeEvidence,
  verifiedBy,
  ledgerPath = DEFAULT_LEDGER,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
}) {
  // Mandatory inputs — incomplete records are refused outright.
  if (!expectedSha || typeof expectedSha !== 'string') {
    return { recorded: false, reason: 'expectedSha is mandatory — refusing an incomplete record' };
  }
  if (!deploymentId || typeof deploymentId !== 'string') {
    return { recorded: false, reason: 'deploymentId (the exact verifier-matched deployment) is mandatory — refusing an incomplete record' };
  }
  const smoke = loadSmokeEvidence(smokeEvidence);
  if (!smoke) {
    return { recorded: false, reason: 'smokeEvidence (listing-smoke JSON) is mandatory — refusing an incomplete record' };
  }
  if (smoke.passed !== true) {
    return { recorded: false, reason: 'smoke evidence does not show passed === true — refusing to record' };
  }
  if (!smoke.observed_at) {
    return { recorded: false, reason: 'smoke evidence has no observed_at timestamp — refusing to record' };
  }
  if (!smoke.expected_sha || smoke.expected_sha.toLowerCase() !== expectedSha.toLowerCase()) {
    return { recorded: false, reason: `smoke evidence is bound to sha '${smoke.expected_sha || 'none'}', not the expected '${expectedSha}' — refusing to record` };
  }
  if (!smoke.deployment_id || smoke.deployment_id !== deploymentId) {
    return { recorded: false, reason: `smoke evidence is bound to deployment '${smoke.deployment_id || 'none'}', not '${deploymentId}' — refusing to record` };
  }

  // Post-smoke RECONFIRMATION of alias ownership + identity.
  const deployment = await fetchDeploymentServingAlias({ token, aliasHost, teamId, fetchImpl });
  if (!deployment) {
    return { recorded: false, reason: `no deployment resolves for alias '${aliasHost}'` };
  }
  const liveId = deployment.uid || deployment.id || null;
  if (liveId !== deploymentId) {
    return { recorded: false, reason: `alias '${aliasHost}' is now served by '${liveId || 'unknown'}', not the verified deployment '${deploymentId}' — the deployment changed after the smoke; refusing to record` };
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
  if (!sha || sha.toLowerCase() !== expectedSha.toLowerCase()) {
    return { recorded: false, reason: `refusing to record: SHA_MISMATCH — deployment built from ${sha || 'unknown'}, expected ${expectedSha}` };
  }

  // Duplicate prevention: same deployment_id + sha already recorded.
  try {
    const existing = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of existing) {
      try {
        const entry = JSON.parse(line);
        if (entry.deployment_id === deploymentId && entry.sha && entry.sha.toLowerCase() === sha.toLowerCase()) {
          return { recorded: false, reason: `duplicate: deployment '${deploymentId}' @ ${sha} is already recorded (${entry.recorded_at || 'no timestamp'})` };
        }
      } catch {
        /* unparseable historical line — ignored for dedup purposes */
      }
    }
  } catch {
    /* no ledger yet — nothing to dedup against */
  }

  const entry = {
    recorded_at: now(),
    deployment_id: deploymentId,
    sha,
    aliases,
    url: deployment.url || null,
    verified_by: verifiedBy || 'manual',
    smoke_observed_at: smoke.observed_at,
    record_class: RECORD_LABELS,
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
  return { recorded: true, entry, ledgerPath, record_class: RECORD_LABELS };
}

module.exports = { recordKnownGood, DEFAULT_LEDGER, RECORD_LABELS };

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const expectedSha = flag('--expected-sha');
  const deploymentId = flag('--deployment-id');
  const smokeFile = flag('--smoke-evidence');
  if (!expectedSha || !deploymentId || !smokeFile) {
    console.error('Usage: node scripts/release-safety/record-known-good.js --expected-sha <sha> --deployment-id <dpl_...> --smoke-evidence <smoke.json> [--alias mallan.nyc] [--verified-by <name>]');
    process.exit(2);
  }
  recordKnownGood({
    token: process.env.VERCEL_TOKEN,
    aliasHost: flag('--alias') || process.env.PRODUCTION_ALIAS || undefined,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    expectedSha,
    deploymentId,
    smokeEvidence: smokeFile,
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
