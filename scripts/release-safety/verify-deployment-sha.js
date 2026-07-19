#!/usr/bin/env node
/**
 * Release-safety P2 — control 4: deployment-SHA verifier (read-only).
 *
 * Answers ONE question with fail-closed semantics: "is the CURRENT production
 * deployment built from the commit SHA I expect?" — the check whose absence
 * let the PR #523 revert-merge sit undeployed while everyone assumed
 * production was fixed.
 *
 * Vercel usage is strictly read-only (GET /v6/deployments). No promotion,
 * rollback, alias change, deletion, or settings call exists in this file.
 * The token is sent in a header and is NEVER printed; error output is
 * redacted to status codes.
 *
 * Verdicts (decideDeploymentVerdict — pure, unit-tested):
 *   MATCH         current production deployment is READY and its commit SHA
 *                 equals the expected SHA
 *   SHA_MISMATCH  a READY production deployment exists but was built from a
 *                 different commit
 *   NOT_READY     newest production deployment is not in READY state
 *   UNKNOWN       missing/undecodable data — fail-closed (never "assume ok")
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

/** Pure verdict decision — the unit-tested core. */
function decideDeploymentVerdict(expectedSha, deployment) {
  if (!expectedSha || typeof expectedSha !== 'string') {
    return { verdict: 'UNKNOWN', reason: 'no expected SHA provided' };
  }
  if (!deployment || typeof deployment !== 'object') {
    return { verdict: 'UNKNOWN', reason: 'no production deployment data' };
  }
  const state = deployment.readyState || deployment.state || null;
  if (state !== 'READY') {
    return { verdict: 'NOT_READY', reason: `newest production deployment state=${state || 'unknown'}` };
  }
  const deployedSha =
    (deployment.meta && (deployment.meta.githubCommitSha || deployment.meta.gitCommitSha)) || null;
  if (!deployedSha) {
    return { verdict: 'UNKNOWN', reason: 'deployment has no commit SHA metadata — cannot prove provenance' };
  }
  if (deployedSha.toLowerCase() === expectedSha.toLowerCase()) {
    return { verdict: 'MATCH', reason: `production deployment ${deployment.uid || ''} built from ${deployedSha}`, deployedSha };
  }
  return {
    verdict: 'SHA_MISMATCH',
    reason: `production deployment built from ${deployedSha}, expected ${expectedSha}`,
    deployedSha,
  };
}

/** Read-only fetch of the newest production deployment. */
async function fetchLatestProductionDeployment({ token, projectId, teamId, fetchImpl = globalThis.fetch }) {
  if (!token || !projectId) {
    throw new Error('VERCEL_TOKEN and VERCEL_PROJECT_ID are required (read-only inspection)');
  }
  const qs = new URLSearchParams({ projectId, target: 'production', limit: '1' });
  if (teamId) qs.set('teamId', teamId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${VERCEL_API}/v6/deployments?${qs.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(`Vercel API unreachable (${err && err.name === 'AbortError' ? 'timeout' : 'network error'})`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 200) {
    // Redacted: status only — never echo request/response details that could
    // carry credentials.
    throw new Error(`Vercel API HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data && Array.isArray(data.deployments) && data.deployments[0]) || null;
}

/**
 * Bounded polling until MATCH or attempts exhausted.
 * SHA_MISMATCH keeps polling (an older deployment may still be current while
 * the expected one builds); the LAST verdict is returned either way.
 */
async function pollForMatch({
  expectedSha,
  token,
  projectId,
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
      const deployment = await fetchLatestProductionDeployment({ token, projectId, teamId, fetchImpl });
      last = decideDeploymentVerdict(expectedSha, deployment);
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
  fetchLatestProductionDeployment,
  pollForMatch,
  exitCodeForVerdict,
};

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const expectedSha = flag('--expected-sha');
  if (!expectedSha) {
    console.error('Usage: node scripts/release-safety/verify-deployment-sha.js --expected-sha <sha> [--max-attempts N] [--interval-ms MS]');
    process.exit(4);
  }
  pollForMatch({
    expectedSha,
    token: process.env.VERCEL_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    maxAttempts: Number(flag('--max-attempts')) || DEFAULT_MAX_ATTEMPTS,
    intervalMs: Number(flag('--interval-ms')) || DEFAULT_INTERVAL_MS,
    log: (m) => console.log(`[verify-deployment-sha] ${m}`),
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(exitCodeForVerdict(result.verdict));
    })
    .catch((err) => {
      console.error(`[verify-deployment-sha] fatal: ${err.message}`);
      process.exit(4);
    });
}
