#!/usr/bin/env node
/**
 * Release-safety P2 — control 4: deployment-SHA verifier (read-only).
 *
 * Answers ONE question with fail-closed semantics: "is the deployment that
 * is ACTUALLY SERVING the production alias (mallan.nyc) built from the
 * commit SHA I expect?" — the check whose absence let the PR #523
 * revert-merge sit undeployed while everyone assumed production was fixed.
 *
 * IMPORTANT identity rule: "newest production-target deployment" and
 * "deployment currently serving the production alias" are NOT the same
 * thing (aliases can still point at an older deployment). This module
 * therefore resolves the deployment BY THE ALIAS ITSELF — a read-only
 * GET /v13/deployments/{aliasHost} — and additionally requires the alias
 * to appear in the deployment's own alias list before any MATCH.
 *
 * Vercel usage is strictly read-only (GET). No promotion, rollback, alias
 * change, deletion, or settings call exists in this file. The token is sent
 * in a header and is NEVER printed; error output is redacted to status codes.
 *
 * Verdicts (decideDeploymentVerdict — pure, unit-tested):
 *   MATCH         alias-serving deployment is READY, provably owns the
 *                 required alias, and its commit SHA equals the expected SHA
 *   SHA_MISMATCH  alias-serving READY deployment was built from a different
 *                 commit
 *   NOT_READY     alias-serving deployment is not in READY state
 *   UNKNOWN       missing/undecodable data OR alias ownership cannot be
 *                 proven — fail-closed (never "assume ok")
 *
 * Exit codes (CLI): 0 MATCH · 2 SHA_MISMATCH · 3 NOT_READY (after bounded
 * polling) · 4 UNKNOWN or credential/usage error. NEVER exit 0 on anything
 * but MATCH.
 *
 * Polling is bounded: --max-attempts (default 10) × --interval-ms (default
 * 30000) ≈ 5 minutes, then the last verdict is final. No infinite waits.
 */

const VERCEL_API = 'https://api.vercel.com';
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_PRODUCTION_ALIAS = 'mallan.nyc';

/** Normalize an alias entry (string or {alias} object) to a bare hostname. */
function aliasHostname(entry) {
  const raw = typeof entry === 'string' ? entry : (entry && entry.alias) || '';
  return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

/** Pure verdict decision — the unit-tested core.
 *  `requiredAlias`: the deployment must PROVABLY own this alias (it must
 *  appear in the deployment's own alias list) or the verdict is UNKNOWN. */
function decideDeploymentVerdict(expectedSha, deployment, { requiredAlias } = {}) {
  if (!expectedSha || typeof expectedSha !== 'string') {
    return { verdict: 'UNKNOWN', reason: 'no expected SHA provided' };
  }
  if (!deployment || typeof deployment !== 'object') {
    return { verdict: 'UNKNOWN', reason: 'no deployment data for the production alias' };
  }
  const state = deployment.readyState || deployment.state || null;
  if (state !== 'READY') {
    return { verdict: 'NOT_READY', reason: `alias-serving deployment state=${state || 'unknown'}` };
  }
  let aliases = [];
  if (requiredAlias) {
    if (!Array.isArray(deployment.alias) || deployment.alias.length === 0) {
      return {
        verdict: 'UNKNOWN',
        reason: `alias ownership cannot be proven — deployment carries no alias metadata (required: ${requiredAlias})`,
      };
    }
    aliases = deployment.alias.map(aliasHostname).filter(Boolean);
    if (!aliases.includes(requiredAlias.toLowerCase())) {
      return {
        verdict: 'UNKNOWN',
        reason: `alias ownership cannot be proven — '${requiredAlias}' is not among the deployment's aliases [${aliases.join(', ')}]`,
      };
    }
  }
  const deployedSha =
    (deployment.meta && (deployment.meta.githubCommitSha || deployment.meta.gitCommitSha)) || null;
  if (!deployedSha) {
    return { verdict: 'UNKNOWN', reason: 'deployment has no commit SHA metadata — cannot prove provenance' };
  }
  if (deployedSha.toLowerCase() === expectedSha.toLowerCase()) {
    return {
      verdict: 'MATCH',
      reason: `alias-serving deployment ${deployment.uid || deployment.id || ''} built from ${deployedSha}`,
      deployedSha,
      aliases,
    };
  }
  return {
    verdict: 'SHA_MISMATCH',
    reason: `alias-serving deployment built from ${deployedSha}, expected ${expectedSha}`,
    deployedSha,
    aliases,
  };
}

/**
 * Read-only fetch of the deployment CURRENTLY SERVING an alias host.
 * GET /v13/deployments/{aliasHost} resolves a domain to the deployment
 * behind it — the alias-ownership proof, not "newest production-target".
 */
async function fetchDeploymentServingAlias({ token, aliasHost = DEFAULT_PRODUCTION_ALIAS, teamId, fetchImpl = globalThis.fetch }) {
  if (!token) {
    throw new Error('VERCEL_TOKEN is required (read-only inspection)');
  }
  const qs = new URLSearchParams();
  if (teamId) qs.set('teamId', teamId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${VERCEL_API}/v13/deployments/${encodeURIComponent(aliasHost)}${suffix}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`Vercel API unreachable (${err && err.name === 'AbortError' ? 'timeout' : 'network error'})`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) {
    return null; // no deployment resolves for this alias
  }
  if (res.status !== 200) {
    // Redacted: status only — never echo request/response details that could
    // carry credentials.
    throw new Error(`Vercel API HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Bounded polling until MATCH or attempts exhausted.
 * SHA_MISMATCH keeps polling (an older deployment may still be current while
 * the expected one builds); the LAST verdict is returned either way.
 */
async function pollForMatch({
  expectedSha,
  token,
  aliasHost = DEFAULT_PRODUCTION_ALIAS,
  teamId,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
}) {
  let last = { verdict: 'UNKNOWN', reason: 'no attempts executed' };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const deployment = await fetchDeploymentServingAlias({ token, aliasHost, teamId, fetchImpl });
      last = decideDeploymentVerdict(expectedSha, deployment, { requiredAlias: aliasHost });
    } catch (err) {
      last = { verdict: 'UNKNOWN', reason: err.message };
    }
    log(`attempt ${attempt}/${maxAttempts}: ${last.verdict} — ${last.reason}`);
    if (last.verdict === 'MATCH') return { ...last, attempts: attempt };
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  return { ...last, attempts: maxAttempts };
}

/** Map a final verdict to the fail-closed exit code. */
function exitCodeForVerdict(verdict) {
  switch (verdict) {
    case 'MATCH':
      return 0;
    case 'SHA_MISMATCH':
      return 2;
    case 'NOT_READY':
      return 3;
    default:
      return 4; // UNKNOWN and anything unrecognized: fail closed
  }
}

module.exports = {
  decideDeploymentVerdict,
  fetchDeploymentServingAlias,
  aliasHostname,
  pollForMatch,
  exitCodeForVerdict,
  DEFAULT_PRODUCTION_ALIAS,
};

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const expectedSha = flag('--expected-sha');
  // --json: machine-output mode. stdout carries EXACTLY one JSON document
  // (no human prefix, no attempt log); ALL progress goes to stderr — so
  // `... --json > out.json 2> progress.log` always yields parseable JSON.
  const jsonMode = args.includes('--json');
  if (!expectedSha) {
    console.error('Usage: node scripts/release-safety/verify-deployment-sha.js --expected-sha <sha> [--json] [--alias mallan.nyc] [--max-attempts N] [--interval-ms MS]');
    process.exit(4);
  }
  const logLine = (m) => {
    const line = `[verify-deployment-sha] ${m}`;
    if (jsonMode) console.error(line);
    else console.log(line);
  };
  pollForMatch({
    expectedSha,
    token: process.env.VERCEL_TOKEN,
    aliasHost: flag('--alias') || process.env.PRODUCTION_ALIAS || DEFAULT_PRODUCTION_ALIAS,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    maxAttempts: Number(flag('--max-attempts')) || DEFAULT_MAX_ATTEMPTS,
    intervalMs: Number(flag('--interval-ms')) || DEFAULT_INTERVAL_MS,
    log: logLine,
  })
    .then((result) => {
      if (jsonMode) {
        process.stdout.write(JSON.stringify(result) + '\n');
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
      process.exit(exitCodeForVerdict(result.verdict)); // only MATCH exits 0
    })
    .catch((err) => {
      if (jsonMode) {
        process.stdout.write(JSON.stringify({ verdict: 'UNKNOWN', reason: `fatal: ${err.message}` }) + '\n');
      }
      console.error(`[verify-deployment-sha] fatal: ${err.message}`);
      process.exit(4);
    });
}
