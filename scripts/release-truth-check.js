#!/usr/bin/env node
/**
 * Release Truth Aggregator (Phase 2 — release-truth framework)
 *
 * Combines every validator into a single honest verdict for a PR, merge,
 * or current main. Layers consulted (each is an independent script):
 *
 *   1. UCBA rule truth          (scripts/ucba-compliance-audit.js)
 *   2. Workflow completeness    (scripts/validate-workflow-completeness.js)
 *   3. Migration discipline     (scripts/validate-migration-discipline.js)
 *   4. Deploy status            (scripts/validate-release-status.js)
 *   5. CI compliance            (scripts/ci-compliance-check.js)
 *   6. IDX validate             (scripts/idx-validate.js)
 *   7. Live site                (scripts/validate-live-site.js — Phase 4)
 *   8. PR claim verification    (this file, when --pr is provided)
 *
 * Final verdicts (matching the shared validator-truth vocabulary):
 *
 *   PROD_PROVEN        code valid + deploy pass + no blocking rule fails
 *                      + no workflow gaps + (live-site clean if checked)
 *                      + no claim overstated
 *   CODE_VALID         code structure sound AND no deploy target requested
 *                      (static-only claim; P2: a pending/unknown deploy is
 *                      UNVERIFIED, never CODE_VALID)
 *   PARTIAL            some surfaces implemented, others missing
 *   DEPLOY_INVALID     merged code exists but deploy failed
 *   UNVERIFIED         not enough runtime/prod evidence (incl. deploy
 *                      pending/unknown for a requested target — fail-closed)
 *   CLAIM_OVERSTATED   PR claims more than evidence supports
 *   REGRESSION         previously-passing rule broke
 *
 * Usage:
 *   node scripts/release-truth-check.js                         # current main
 *   node scripts/release-truth-check.js --pr 63
 *   node scripts/release-truth-check.js --sha abc123
 *   node scripts/release-truth-check.js --json
 *   node scripts/release-truth-check.js --skip live-site,build  # skip layers
 *   node scripts/release-truth-check.js --per-merge --from-sha A --to-sha B
 *
 * Exit codes:
 *   0  PROD_PROVEN or CODE_VALID (clean enough to ship)
 *   1  REGRESSION or DEPLOY_INVALID
 *   2  PARTIAL (some required surfaces missing)
 *   3  CLAIM_OVERSTATED
 *   4  UNVERIFIED in --strict mode
 *
 * --require-deploy-proof (P2): exit 0 ONLY on PROD_PROVEN; every unproven
 * verdict (incl. CODE_VALID and UNVERIFIED) exits nonzero. Off by default.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ─── CLI ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

const prNum = argFlag('--pr');
const sha = argFlag('--sha');
const jsonOutput = has('--json');
const strict = has('--strict');
// P2 hardening: with --require-deploy-proof, ONLY PROD_PROVEN exits 0 —
// every unproven verdict (incl. CODE_VALID without deploy proof) is nonzero.
const requireDeployProof = has('--require-deploy-proof');
const skipList = (argFlag('--skip') || '').split(',').map((s) => s.trim()).filter(Boolean);
const perMerge = has('--per-merge');
const fromSha = argFlag('--from-sha');
const toSha = argFlag('--to-sha');

// ─── Helpers ─────────────────────────────────────────────────────────────
function runJson(cmd, args = []) {
  const result = spawnSync('node', [cmd, ...args, '--json'], {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 50,
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: result.stdout ? safeParseJson(result.stdout) : null,
  };
}

function safeParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function gh(cmd) {
  try {
    return execSync(`gh ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return null;
  }
}

// ─── Per-merge mode (early exit if requested) ──────────────────────────
if (perMerge) {
  return runPerMerge();
}

// ─── Single-target mode ────────────────────────────────────────────────
const layers = {};

function shouldSkip(layerName) {
  return skipList.includes(layerName);
}

// Layer 1 — UCBA rule truth
if (!shouldSkip('ucba')) {
  const ucbaScript = path.join(ROOT, 'scripts', 'ucba-compliance-audit.js');
  const r = runJson(ucbaScript);
  layers.ucba = {
    exit_code: r.code,
    summary: r.json?.summary || null,
    blocking_failures: (r.json?.failures || []).filter((f) => f.priority !== 'low').length,
    regressions: (r.json?.summary?.regression || 0),
    claim_overstated: (r.json?.summary?.claim_overstated || 0),
  };
}

// Layer 2 — Workflow completeness
if (!shouldSkip('workflows')) {
  const wfScript = path.join(ROOT, 'scripts', 'validate-workflow-completeness.js');
  const r = runJson(wfScript);
  layers.workflows = {
    exit_code: r.code,
    summary: r.json?.summary || null,
    blocking_failures: r.json?.summary?.blocking_failures || 0,
  };
}

// Layer 3 — Migration discipline
if (!shouldSkip('migration')) {
  const migArgs = prNum ? ['--pr', prNum] : [];
  const r = runJson(path.join(ROOT, 'scripts', 'validate-migration-discipline.js'), migArgs);
  layers.migration = {
    exit_code: r.code,
    summary: r.json?.summary || null,
    schema_changed: r.json?.schema_changed || false,
  };
}

// Layer 4 — Deploy status (only when target is a PR or specific SHA)
if (!shouldSkip('deploy') && (prNum || sha)) {
  const releaseArgs = prNum ? ['--pr', prNum] : ['--sha', sha];
  const r = runJson(path.join(ROOT, 'scripts', 'validate-release-status.js'), releaseArgs);
  layers.deploy = {
    exit_code: r.code,
    verdict: r.json?.verdict || 'DEPLOY_UNKNOWN',
  };
}

// Layer 4b — production-alias deploy proof (P2). --deploy-proof <file> takes
// the JSON output of scripts/release-safety/verify-deployment-sha.js. Only a
// MATCH verdict upgrades the deploy layer to DEPLOY_PROD_PROVEN; anything
// else (missing file, invalid JSON, non-MATCH) degrades it fail-closed.
if (argFlag('--deploy-proof')) {
  const proofPath = argFlag('--deploy-proof');
  let proof = null;
  try {
    proof = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
  } catch {
    proof = null;
  }
  if (proof && proof.verdict === 'MATCH') {
    layers.deploy = {
      exit_code: 0,
      verdict: 'DEPLOY_PROD_PROVEN',
      source: 'verify-deployment-sha (production alias)',
      // Full structured identity — the verdict module BINDS the smoke
      // evidence to these exact fields before PROD_PROVEN is reachable.
      deployed_sha: proof.deployed_sha || null,
      deployment_id: proof.deployment_id || null,
      alias_host: proof.alias_host || null,
      aliases: proof.aliases || [],
      observed_at: proof.observed_at || null,
    };
  } else {
    layers.deploy = {
      exit_code: 1,
      verdict: 'DEPLOY_UNKNOWN',
      source: 'verify-deployment-sha (production alias)',
      note: proof ? `alias verifier verdict ${proof.verdict}: ${proof.reason || ''}` : `deploy-proof file unreadable: ${proofPath}`,
    };
  }
}

// Layer 7b — runtime smoke evidence (P2). --smoke-evidence <file> takes the
// JSON output of scripts/release-safety/listing-smoke.js. PROD_PROVEN is
// unreachable without it (see release-safety/release-truth-verdict.js).
if (argFlag('--smoke-evidence')) {
  const smokePath = argFlag('--smoke-evidence');
  let smoke = null;
  try {
    smoke = JSON.parse(fs.readFileSync(smokePath, 'utf-8'));
  } catch {
    smoke = null;
  }
  if (smoke && typeof smoke.passed === 'boolean') {
    // Required listing probes (discovery, canonical-detail incl. the
    // rediscovered variant, id-alias, similar-api) must each be present and
    // ok. The open-houses probe stays HTTP/JSON-CONTRACT-PROVEN only and is
    // covered by the overall `passed` flag.
    const probes = Array.isArray(smoke.probes) ? smoke.probes : [];
    const probeOk = (name) =>
      probes.some((p) => p && (p.name === name || (name === 'canonical-detail' && typeof p.name === 'string' && p.name.startsWith('canonical-detail'))) && p.ok === true);
    const requiredProbesOk = ['discovery', 'canonical-detail', 'id-alias', 'similar-api'].every(probeOk);
    layers.smoke = {
      passed: smoke.passed,
      observed_at: smoke.observed_at || null,
      expected_sha: smoke.expected_sha || null,
      deployment_id: smoke.deployment_id || null,
      base_url: smoke.base_url || null,
      listing: smoke.listing || null,
      required_probes_ok: requiredProbesOk,
    };
  } else {
    layers.smoke = { passed: false, reason: `smoke-evidence file missing/invalid: ${smokePath}` };
  }
}

// Layer 7 — Live site smoke (Phase 4)
if (!shouldSkip('live-site') && has('--live-site')) {
  const liveArgs = [];
  if (argFlag('--base-url')) liveArgs.push('--base-url', argFlag('--base-url'));
  const r = runJson(path.join(ROOT, 'scripts', 'validate-live-site.js'), liveArgs);
  layers.live_site = {
    exit_code: r.code,
    summary: r.json?.summary || null,
  };
}

// Layer 8 — PR claim verification
if (!shouldSkip('claim') && prNum) {
  layers.claim = verifyPrClaim(prNum);
}

// ─── Aggregate to a single verdict ───────────────────────────────────────
// P2 hardening: the verdict core lives in release-safety/release-truth-verdict.js
// (pure + unit-tested). Key change vs the pre-P2 inline version: a deploy
// target with DEPLOY_PENDING / DEPLOY_UNKNOWN aggregates to UNVERIFIED —
// never "CODE_VALID / clean enough to ship" (the PR #523 lesson).
const { aggregate, decideExitCode } = require('./release-safety/release-truth-verdict.js');

// PR claim verifier — extracts claim phrases AND maps each specific claim to
// specific evidence. A claim "closes C15" requires C15's UCBA validator to
// be PASS or expected_aggregate match — anything else is overstatement.
function verifyPrClaim(prNum) {
  const out = gh(`pr view ${prNum} --json title,body`);
  if (!out) return { verdict: 'CLAIM_UNVERIFIED', reasons: ['gh pr view failed'] };
  let pr;
  try { pr = JSON.parse(out); } catch { return { verdict: 'CLAIM_UNVERIFIED', reasons: ['could not parse PR JSON'] }; }

  const title = (pr.title || '').toString();
  const body = (pr.body || '').toString();
  const text = `${title}\n${body}`;

  // Patterns and their semantic meaning
  const claims = [];

  // 1. "closes C15" / "closes WS-C2" / "closes #47" — explicit rule/PR closure
  const closureMatches = [...text.matchAll(/\bcloses?\s+((?:#?\d+|C\d+|WS-C\d+))\b/gi)];
  for (const m of closureMatches) {
    const ref = m[1].toUpperCase().replace(/^#/, '');
    claims.push({ type: 'closes', target: ref, raw: m[0] });
  }

  // 2. "closes C15 auction compliance" — common pattern that overstates
  const closesNamed = [...text.matchAll(/\bcloses?\s+([CW][SC0-9-]+)\s+\w+\s+(?:compliance|rule|requirement)/gi)];
  for (const m of closesNamed) {
    const ref = m[1].toUpperCase();
    claims.push({ type: 'closes_compliance', target: ref, raw: m[0] });
  }

  // 3. "fully complete" / "fully done" / "fully implemented" — global closure claim
  const fullyMatches = [...text.matchAll(/\bfully\s+(?:done|complete|implement(?:ed)?|shipped)\b/gi)];
  for (const m of fullyMatches) {
    claims.push({ type: 'fully_complete', target: 'PR_AS_A_WHOLE', raw: m[0] });
  }

  // 4. "all N endpoints" / "all surfaces" / "every endpoint"
  const allMatches = [...text.matchAll(/\b(?:all|every)\s+(?:\d+\s+)?(endpoints?|surfaces?|routes?|requirements?)\b/gi)];
  for (const m of allMatches) {
    claims.push({ type: 'all_of', target: m[1].toLowerCase(), raw: m[0] });
  }

  // 5. "ships [final|complete] X"
  const shipsMatches = [...text.matchAll(/\bship[ps]?\s+(?:final|complete)\s+(\w+)/gi)];
  for (const m of shipsMatches) {
    claims.push({ type: 'ships_final', target: m[1], raw: m[0] });
  }

  if (claims.length === 0) {
    return { verdict: 'CLAIM_CONFIRMED', reasons: ['PR makes no closure claims requiring verification'], claims: [] };
  }

  // Map each claim to evidence:
  const claimResults = [];
  for (const c of claims) {
    let evidenceVerdict = 'CLAIM_UNVERIFIED';
    let evidenceReason = '';

    if (c.type === 'closes' || c.type === 'closes_compliance') {
      // For C-prefixed (UCBA rule) targets: check if UCBA layer reports PASS for it
      // For WS-C-prefixed: check workflow-completeness layer
      // For #N (PR ref): not a self-closure claim, ignore
      if (c.target.startsWith('#') || /^\d+$/.test(c.target.replace('#', ''))) {
        evidenceVerdict = 'CLAIM_CONFIRMED';
        evidenceReason = `references PR ${c.target} — not a self-closure claim`;
      } else if (c.target.startsWith('WS-C')) {
        // Workstream code — check workflow-map
        const wfPartial = layers.workflows?.summary?.partial || 0;
        const wfFail = layers.workflows?.summary?.fail || 0;
        if (wfFail > 0 || wfPartial > 0) {
          evidenceVerdict = 'CLAIM_OVERSTATED';
          evidenceReason = `claims to close ${c.target} but workflow layer reports ${wfPartial} partial, ${wfFail} fail`;
        } else {
          evidenceVerdict = 'CLAIM_CONFIRMED';
          evidenceReason = `${c.target} workflow layer clean`;
        }
      } else if (c.target.startsWith('C')) {
        // UCBA rule — defer to UCBA layer
        const ucbaPartial = layers.ucba?.summary?.partial || 0;
        const ucbaFail = layers.ucba?.summary?.fail || 0;
        const ucbaOverstated = layers.ucba?.summary?.claim_overstated || 0;
        if (ucbaOverstated > 0 || ucbaFail > 0) {
          evidenceVerdict = 'CLAIM_OVERSTATED';
          evidenceReason = `claims to close ${c.target} but UCBA reports ${ucbaPartial} partial, ${ucbaFail} fail, ${ucbaOverstated} claim_overstated. Run \`npm run ucba:audit\` to see which.`;
        } else if (ucbaPartial > 0) {
          // PARTIAL is only OK if expected_aggregate=PARTIAL — otherwise overstatement.
          // We don't have per-rule resolution here, so flag for manual review.
          evidenceVerdict = 'CLAIM_OVERSTATED';
          evidenceReason = `claims to close ${c.target} but UCBA reports ${ucbaPartial} PARTIAL rule(s). Confirm ${c.target} is not one of them.`;
        } else {
          evidenceVerdict = 'CLAIM_CONFIRMED';
          evidenceReason = `${c.target} UCBA layer clean`;
        }
      }
    } else if (c.type === 'fully_complete') {
      // Any partial in any layer overstates a "fully complete" claim
      const totalPartial = (layers.ucba?.summary?.partial || 0) + (layers.workflows?.summary?.partial || 0);
      const totalFail = (layers.ucba?.summary?.fail || 0) + (layers.workflows?.summary?.fail || 0);
      if (totalPartial > 0 || totalFail > 0) {
        evidenceVerdict = 'CLAIM_OVERSTATED';
        evidenceReason = `"fully complete" claim contradicts: ${totalPartial} partial + ${totalFail} fail across layers`;
      } else {
        evidenceVerdict = 'CLAIM_CONFIRMED';
        evidenceReason = 'no partials or fails in UCBA or workflow layers';
      }
    } else if (c.type === 'all_of') {
      // "all endpoints / surfaces" — needs runtime test coverage AND workflow completeness
      const wfPartial = layers.workflows?.summary?.partial || 0;
      if (wfPartial > 0) {
        evidenceVerdict = 'CLAIM_OVERSTATED';
        evidenceReason = `"all ${c.target}" claim contradicts: ${wfPartial} workflow(s) PARTIAL`;
      } else {
        evidenceVerdict = 'CLAIM_CONFIRMED';
        evidenceReason = 'workflows complete';
      }
    } else if (c.type === 'ships_final') {
      // "ships final X" needs deploy proof AND no partials
      if (layers.deploy?.verdict === 'DEPLOY_FAIL') {
        evidenceVerdict = 'CLAIM_OVERSTATED';
        evidenceReason = `"ships final" but deploy FAIL`;
      } else if (layers.deploy?.verdict === 'DEPLOY_PASS' && (layers.workflows?.summary?.partial || 0) === 0) {
        evidenceVerdict = 'CLAIM_CONFIRMED';
        evidenceReason = `deploy PASS + workflows complete`;
      } else {
        evidenceVerdict = 'CLAIM_UNVERIFIED';
        evidenceReason = `deploy verdict ${layers.deploy?.verdict || 'unknown'}, workflows partial ${layers.workflows?.summary?.partial || 0}`;
      }
    }

    claimResults.push({ ...c, verdict: evidenceVerdict, reason: evidenceReason });
  }

  // Aggregate: if ANY claim is CLAIM_OVERSTATED, PR overall is overstated
  const overstated = claimResults.filter((r) => r.verdict === 'CLAIM_OVERSTATED');
  const confirmed = claimResults.filter((r) => r.verdict === 'CLAIM_CONFIRMED');
  const unverified = claimResults.filter((r) => r.verdict === 'CLAIM_UNVERIFIED');

  if (overstated.length > 0) {
    return {
      verdict: 'CLAIM_OVERSTATED',
      reasons: overstated.map((r) => r.reason),
      claims: claimResults,
    };
  }
  if (unverified.length > 0 && confirmed.length === 0) {
    return {
      verdict: 'CLAIM_UNVERIFIED',
      reasons: unverified.map((r) => r.reason),
      claims: claimResults,
    };
  }
  return {
    verdict: 'CLAIM_CONFIRMED',
    reasons: [`${confirmed.length} claim(s) confirmed against evidence`],
    claims: claimResults,
  };
}

// ─── Per-merge mode ──────────────────────────────────────────────────────
function runPerMerge() {
  if (!fromSha || !toSha) {
    console.error('Error: --per-merge requires --from-sha and --to-sha');
    process.exit(1);
  }

  const merges = git(`log --first-parent --format=%H ${fromSha}..${toSha}`)
    .split('\n').map((s) => s.trim()).filter(Boolean);

  const rows = [];
  for (const mergeSha of merges) {
    const subject = git(`log -1 --format=%s ${mergeSha}`);
    const m = /\(#(\d+)\)/.exec(subject);
    const prNum = m ? m[1] : null;
    const r = spawnSync('node', [__filename, '--sha', mergeSha, ...(prNum ? ['--pr', prNum] : []), '--json'], {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 50,
    });
    let parsed = null;
    try { parsed = JSON.parse(r.stdout); } catch {}
    rows.push({
      sha: mergeSha,
      pr: prNum,
      subject,
      verdict: parsed?.verdict || 'UNVERIFIED',
      reasons: parsed?.reasons || [],
      layers: parsed?.layers ? Object.keys(parsed.layers) : [],
    });
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ merges: rows }, null, 2));
  } else {
    console.log('');
    console.log('  Per-merge release-truth audit');
    console.log('  ──────────────────────────────────────────────────────────');
    console.log('  PR     SHA      Verdict             Subject');
    for (const r of rows) {
      const c = {
        PROD_PROVEN: '\x1b[32m', CODE_VALID: '\x1b[32m',
        PARTIAL: '\x1b[33m', UNVERIFIED: '\x1b[36m',
        REGRESSION: '\x1b[31m', DEPLOY_INVALID: '\x1b[31m', CLAIM_OVERSTATED: '\x1b[31m',
      }[r.verdict] || '\x1b[0m';
      console.log(`  #${(r.pr || '—').padEnd(5)} ${r.sha.slice(0, 7)}  ${c}${r.verdict.padEnd(18)}\x1b[0m  ${r.subject.slice(0, 80)}`);
    }
    console.log('');
  }
  process.exit(0);
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// ─── Single-target output ────────────────────────────────────────────────
const final = aggregate(layers);

const result = {
  timestamp: new Date().toISOString(),
  target: { pr: prNum, sha },
  layers,
  ...final,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const verdictColor = {
    PROD_PROVEN: '\x1b[32m',
    CODE_VALID: '\x1b[32m',
    PARTIAL: '\x1b[33m',
    UNVERIFIED: '\x1b[36m',
    REGRESSION: '\x1b[31m',
    DEPLOY_INVALID: '\x1b[31m',
    CLAIM_OVERSTATED: '\x1b[31m',
  }[final.verdict] || '\x1b[0m';

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Release Truth Aggregator                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Target:  ${prNum ? `PR #${prNum}` : sha ? `SHA ${sha}` : 'current main'}`);
  console.log('');
  console.log(`  ${verdictColor}══ ${final.verdict} ══\x1b[0m`);
  for (const r of final.reasons || []) {
    console.log(`     · ${r}`);
  }
  console.log('');

  console.log('  Layer-by-layer:');
  for (const [name, layer] of Object.entries(layers)) {
    const exitOk = layer.exit_code === 0 || layer.exit_code === undefined;
    const c = exitOk ? '\x1b[32m' : '\x1b[31m';
    const icon = exitOk ? '✓' : '✗';
    let summary = '';
    if (name === 'ucba' && layer.summary) {
      summary = `${layer.summary.pass} pass, ${layer.summary.partial || 0} partial, ${layer.summary.fail || 0} fail, ${layer.summary.regression || 0} regression, ${layer.summary.claim_overstated || 0} claim_overstated`;
    } else if (name === 'workflows' && layer.summary) {
      summary = `${layer.summary.pass} pass, ${layer.summary.partial || 0} partial, ${layer.summary.fail || 0} fail, ${layer.blocking_failures || 0} blocking`;
    } else if (name === 'migration' && layer.summary) {
      summary = `${layer.summary.pass} pass, ${layer.summary.partial || 0} partial, ${layer.summary.fail || 0} fail (schema_changed=${layer.schema_changed})`;
    } else if (name === 'deploy' && layer.verdict) {
      summary = layer.verdict;
    } else if (name === 'claim' && layer.verdict) {
      summary = layer.verdict;
    }
    console.log(`    ${c}${icon}\x1b[0m ${name.padEnd(12)} ${summary}`);
  }
  console.log('');
}

process.exit(decideExitCode(final.verdict, { strict, requireDeployProof }));
