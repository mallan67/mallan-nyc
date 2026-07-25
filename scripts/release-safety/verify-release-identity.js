#!/usr/bin/env node
/**
 * Release-safety — TOKEN-FREE production identity verifier.
 *
 * Answers "is the deployment CURRENTLY SERVING mallan.nyc built from the commit
 * SHA I expect, in the production environment?" by asking the host ITSELF — a
 * read-only GET of the public, deployment-bound /api/release-identity endpoint
 * (VERCEL_GIT_COMMIT_SHA / VERCEL_DEPLOYMENT_ID / VERCEL_TARGET_ENV). Because it
 * queries mallan.nyc directly, a MATCH proves alias ownership by construction —
 * no Vercel API token, no "newest production deployment" inference.
 *
 * TWO-PHASE (closes the alias-switch TOCTOU that Codex flagged on PR #565):
 *   phase 1 (pollForMatch): prove mallan.nyc serves the expected SHA + a dpl_
 *                            deployment id + targetEnv === production.
 *   <the caller runs listing-smoke bound to that deployment id>
 *   phase 2 (--reconfirm <phase1.json>): re-fetch and REQUIRE all three fields
 *                            unchanged (same SHA, same deployment id, still
 *                            production). An A→B switch during the smoke window
 *                            is rejected, so a smoke served by B can never be
 *                            bound to A.
 *
 * FAIL-CLOSED everywhere: any HTTP error, malformed JSON, absent/mis-shaped
 * value, mismatched SHA, changed deployment id, or wrong environment yields a
 * NON-MATCH verdict (never "assume ok").
 *
 * Exit codes (CLI): 0 MATCH (or reconfirm OK) · 2 SHA_MISMATCH · 4 UNKNOWN or
 * usage/reconfirm failure. NEVER exit 0 on anything but a proven identity.
 */

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_BASE_URL = "https://mallan.nyc";

const SHA_RE = /^[0-9a-f]{40}$/i;
const DEPLOYMENT_RE = /^dpl_[A-Za-z0-9]+$/;

/** Bare lowercase hostname of a base URL (for the alias-ownership field). */
function baseHost(baseUrl) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Pure verdict — the unit-tested core. Decides from a fetched identity object
 * WITHOUT any I/O. `requireProduction` (default true) enforces the production
 * environment when probing the production alias.
 *   MATCH         valid identity whose commitSha equals the expected SHA
 *   SHA_MISMATCH  valid identity built from a DIFFERENT commit
 *   UNKNOWN       missing / malformed / wrong-environment identity — fail closed
 */
function decideIdentityVerdict(expectedSha, identity, { aliasHost = null, requireProduction = true } = {}) {
  if (!expectedSha || typeof expectedSha !== "string" || !SHA_RE.test(expectedSha)) {
    return { verdict: "UNKNOWN", reason: `expected SHA is missing or not a 40-hex commit sha` };
  }
  if (!identity || typeof identity !== "object") {
    return { verdict: "UNKNOWN", reason: "no identity payload from the alias (unreachable / non-200 / malformed)" };
  }
  const commitSha = typeof identity.commitSha === "string" ? identity.commitSha : null;
  const deploymentId = typeof identity.deploymentId === "string" ? identity.deploymentId : null;
  const targetEnv = typeof identity.targetEnv === "string" ? identity.targetEnv : null;

  if (!commitSha || !SHA_RE.test(commitSha)) {
    return { verdict: "UNKNOWN", reason: `identity commitSha '${commitSha || "none"}' is absent or not a 40-hex sha` };
  }
  if (!deploymentId || !DEPLOYMENT_RE.test(deploymentId)) {
    return { verdict: "UNKNOWN", reason: `identity deploymentId '${deploymentId || "none"}' is absent or not a dpl_ id` };
  }
  if (targetEnv !== "production" && targetEnv !== "preview") {
    return { verdict: "UNKNOWN", reason: `identity targetEnv '${targetEnv || "none"}' is not a known environment` };
  }
  if (requireProduction && targetEnv !== "production") {
    return { verdict: "UNKNOWN", reason: `alias is serving a '${targetEnv}' deployment, not production` };
  }

  const host = aliasHost ? aliasHost.toLowerCase() : null;
  const identityFields = {
    expected_sha: expectedSha,
    deployed_sha: commitSha,
    deployment_id: deploymentId,
    target_env: targetEnv,
    alias_host: host,
    aliases: host ? [host] : [],
  };

  if (commitSha.toLowerCase() === expectedSha.toLowerCase()) {
    return {
      verdict: "MATCH",
      reason: `alias serves the expected SHA — deployment ${deploymentId} (${targetEnv}) built from ${commitSha}`,
      ...identityFields,
    };
  }
  return {
    verdict: "SHA_MISMATCH",
    reason: `alias serves deployment ${deploymentId} built from ${commitSha}, expected ${expectedSha}`,
    ...identityFields,
  };
}

/**
 * Pure reconfirm decision — phase 2. The post-smoke identity must be a MATCH
 * AND identical to the phase-1 proof in all three fields. ANY change (an A→B
 * alias switch during the smoke window) is rejected.
 */
function reconfirmVerdict(preProof, postVerdict) {
  if (!preProof || typeof preProof !== "object") {
    return { ok: false, reason: "no phase-1 proof to reconfirm against" };
  }
  if (!postVerdict || postVerdict.verdict !== "MATCH") {
    return { ok: false, reason: `post-smoke identity is not a MATCH (${postVerdict ? postVerdict.verdict : "none"}: ${postVerdict ? postVerdict.reason : ""})` };
  }
  const problems = [];
  if ((postVerdict.deployed_sha || "").toLowerCase() !== (preProof.deployed_sha || "").toLowerCase()) {
    problems.push(`sha changed ${preProof.deployed_sha} → ${postVerdict.deployed_sha}`);
  }
  if (postVerdict.deployment_id !== preProof.deployment_id) {
    problems.push(`deployment changed ${preProof.deployment_id} → ${postVerdict.deployment_id}`);
  }
  if (postVerdict.target_env !== preProof.target_env || postVerdict.target_env !== "production") {
    problems.push(`environment changed/invalid ${preProof.target_env} → ${postVerdict.target_env}`);
  }
  if (problems.length > 0) {
    return { ok: false, reason: `alias identity changed during the smoke window: ${problems.join("; ")}` };
  }
  return { ok: true, reason: "alias identity unchanged across the smoke window" };
}

/** Read-only GET of the public identity endpoint. Returns the parsed 200 body
 *  or null (non-200 / unreachable / unparseable) — all of which fail closed. */
async function fetchIdentity({ baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, nonce = "" }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/release-identity?_cb=${encodeURIComponent(nonce)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache", Accept: "application/json" },
      redirect: "manual", // a redirect (auth wall / canonical) is NOT a valid proof
      signal: controller.signal,
    });
  } catch {
    return null; // network error / timeout → unproven
  } finally {
    clearTimeout(timer);
  }
  if (!res || res.status !== 200) return null; // 3xx/4xx/5xx (incl. 503 fail-closed) → unproven
  try {
    return await res.json();
  } catch {
    return null; // malformed JSON → unproven
  }
}

/** Phase 1 — bounded polling until MATCH or attempts exhausted. */
async function pollForMatch({
  expectedSha,
  baseUrl = DEFAULT_BASE_URL,
  requireProduction = true,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
  now = () => new Date().toISOString(),
}) {
  const aliasHost = baseHost(baseUrl);
  let last = { verdict: "UNKNOWN", reason: "no attempts executed" };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const identity = await fetchIdentity({ baseUrl, fetchImpl, nonce: `${attempt}-${now()}` });
    last = decideIdentityVerdict(expectedSha, identity, { aliasHost, requireProduction });
    log(`attempt ${attempt}/${maxAttempts}: ${last.verdict} — ${last.reason}`);
    if (last.verdict === "MATCH") return { ...last, attempts: attempt, observed_at: now() };
    if (attempt < maxAttempts) await sleep(intervalMs);
  }
  return { ...last, attempts: maxAttempts, observed_at: now() };
}

/** Map a final verdict to the fail-closed exit code. */
function exitCodeForVerdict(verdict) {
  if (verdict === "MATCH") return 0;
  if (verdict === "SHA_MISMATCH") return 2;
  return 4; // UNKNOWN / anything else: fail closed
}

module.exports = {
  decideIdentityVerdict,
  reconfirmVerdict,
  fetchIdentity,
  pollForMatch,
  exitCodeForVerdict,
  baseHost,
  DEFAULT_BASE_URL,
  SHA_RE,
  DEPLOYMENT_RE,
};

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const fs = require("fs");
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const jsonMode = args.includes("--json");
  const expectedSha = flag("--expected-sha");
  const baseUrl = flag("--base-url") || DEFAULT_BASE_URL;
  const requireProduction = !args.includes("--allow-preview"); // default: require production
  const reconfirmPath = flag("--reconfirm");
  const logLine = (m) => {
    const line = `[verify-release-identity] ${m}`;
    if (jsonMode) console.error(line);
    else console.log(line);
  };

  const emit = (obj, code) => {
    if (jsonMode) process.stdout.write(JSON.stringify(obj) + "\n");
    else console.log(JSON.stringify(obj, null, 2));
    process.exit(code);
  };

  if (!expectedSha) {
    console.error("Usage: node scripts/release-safety/verify-release-identity.js --expected-sha <sha> [--base-url https://mallan.nyc] [--json] [--reconfirm <phase1.json>] [--max-attempts N] [--interval-ms MS] [--allow-preview]");
    process.exit(4);
  }

  (async () => {
    if (reconfirmPath) {
      // Phase 2 — single fetch, compare to the phase-1 proof.
      let pre = null;
      try {
        pre = JSON.parse(fs.readFileSync(reconfirmPath, "utf8"));
      } catch {
        emit({ verdict: "UNKNOWN", reconfirm_ok: false, reason: `phase-1 proof unreadable: ${reconfirmPath}` }, 4);
        return;
      }
      const aliasHost = baseHost(baseUrl);
      const identity = await fetchIdentity({ baseUrl, fetchImpl: globalThis.fetch, nonce: `reconfirm-${new Date().toISOString()}` });
      const post = decideIdentityVerdict(expectedSha, identity, { aliasHost, requireProduction });
      const rc = reconfirmVerdict(pre, post);
      logLine(`reconfirm: ${rc.ok ? "OK" : "REJECT"} — ${rc.reason}`);
      emit(
        { verdict: post.verdict, reconfirm_ok: rc.ok, reason: rc.reason, deployed_sha: post.deployed_sha || null, deployment_id: post.deployment_id || null, target_env: post.target_env || null, observed_at: new Date().toISOString() },
        rc.ok ? 0 : 4,
      );
      return;
    }

    // Phase 1 — poll until MATCH.
    const result = await pollForMatch({
      expectedSha,
      baseUrl,
      requireProduction,
      maxAttempts: Number(flag("--max-attempts")) || DEFAULT_MAX_ATTEMPTS,
      intervalMs: Number(flag("--interval-ms")) || DEFAULT_INTERVAL_MS,
      log: logLine,
    });
    emit(result, exitCodeForVerdict(result.verdict));
  })().catch((err) => {
    if (jsonMode) process.stdout.write(JSON.stringify({ verdict: "UNKNOWN", reason: `fatal: ${err.message}` }) + "\n");
    console.error(`[verify-release-identity] fatal: ${err.message}`);
    process.exit(4);
  });
}
