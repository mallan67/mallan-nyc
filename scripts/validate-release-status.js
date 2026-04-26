#!/usr/bin/env node
/**
 * Deploy / Release Status Validator (Phase 2 — release-truth framework)
 *
 * Catches the "merged commit but deploy failed" class of mistakes — the
 * one that bit #47 and #55 in this session's earlier work.
 *
 * Resolves a commit SHA, queries GitHub combined status + check runs,
 * and reports DEPLOY_PASS / DEPLOY_FAIL / DEPLOY_PENDING / DEPLOY_UNKNOWN.
 *
 * Required check policy (configurable via CLI):
 *   - Vercel must be present and pass (legacy commit-status OR check-run)
 *   - Other check runs (claude-review, guardrails, pr-check) must pass
 *     when present.
 *
 * Note on the recurring Vercel commit-status webhook lag observed during
 * this session: this validator treats `Vercel Preview Comments: SUCCESS`
 * as evidence the deploy completed even when the legacy `Vercel: pending`
 * status hangs. Tunable via --strict-vercel.
 *
 * Usage:
 *   node scripts/validate-release-status.js --sha abc123
 *   node scripts/validate-release-status.js --sha HEAD
 *   node scripts/validate-release-status.js --pr 63
 *   node scripts/validate-release-status.js --json
 *   node scripts/validate-release-status.js --strict-vercel    # require legacy status pass too
 */

const { execSync } = require('child_process');

// ─── CLI ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

const sha = argFlag('--sha');
const prNum = argFlag('--pr');
const jsonOutput = has('--json');
const strictVercel = has('--strict-vercel');

if (!sha && !prNum) {
  console.error('Usage: node scripts/validate-release-status.js --sha <SHA> | --pr <N>');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function gh(cmd) {
  try {
    return execSync(`gh ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    return null;
  }
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function resolveSha() {
  if (sha) {
    if (sha === 'HEAD' || sha.length < 7) {
      const resolved = git(`rev-parse ${sha}`);
      if (!resolved) {
        console.error(`Could not resolve SHA: ${sha}`);
        process.exit(1);
      }
      return resolved;
    }
    return sha;
  }
  // Resolve PR head SHA — fetch raw JSON, parse in JS (avoids cross-platform jq quoting)
  const out = gh(`pr view ${prNum} --json headRefOid`);
  if (!out) {
    console.error(`Could not resolve PR ${prNum} via gh`);
    process.exit(1);
  }
  try {
    return JSON.parse(out).headRefOid;
  } catch {
    console.error(`Could not parse PR JSON for ${prNum}`);
    process.exit(1);
  }
}

function resolveRepo() {
  const out = gh('repo view --json nameWithOwner');
  if (!out) return null;
  try {
    return JSON.parse(out).nameWithOwner;
  } catch {
    return null;
  }
}

// ─── Fetch ───────────────────────────────────────────────────────────────
const resolvedSha = resolveSha();
const repo = resolveRepo();

if (!repo) {
  console.error('Could not resolve repository (gh repo view failed)');
  process.exit(1);
}

const checkRunsRaw = gh(`api repos/${repo}/commits/${resolvedSha}/check-runs`);
const statusesRaw = gh(`api repos/${repo}/commits/${resolvedSha}/statuses`);

let checkRuns = [];
let statuses = [];
try {
  if (checkRunsRaw) {
    const parsed = JSON.parse(checkRunsRaw);
    checkRuns = (parsed.check_runs || []).map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      completedAt: c.completed_at,
      url: c.details_url,
    }));
  }
  if (statusesRaw) {
    const parsed = JSON.parse(statusesRaw);
    statuses = (Array.isArray(parsed) ? parsed : []).map((s) => ({
      context: s.context,
      state: s.state,
      description: s.description,
      updated_at: s.updated_at,
      target_url: s.target_url,
    }));
  }
} catch (e) {
  console.error('Could not parse GitHub API response:', e.message);
  process.exit(1);
}

// Dedupe statuses — github returns one per update, we want the latest per context
const latestStatusByContext = new Map();
for (const s of statuses) {
  const existing = latestStatusByContext.get(s.context);
  if (!existing || new Date(s.updated_at) > new Date(existing.updated_at)) {
    latestStatusByContext.set(s.context, s);
  }
}
const dedupedStatuses = [...latestStatusByContext.values()];

// ─── Evaluate ────────────────────────────────────────────────────────────
const evaluation = {
  timestamp: new Date().toISOString(),
  repo,
  sha: resolvedSha,
  pr: prNum || null,
  check_runs: checkRuns,
  statuses: dedupedStatuses,
  evaluation: {
    required_checks: [],
    deploy_proof: null,
    blocking_failures: [],
    pending: [],
  },
};

// 1. Vercel deploy proof — primary signal
const vercelStatus = dedupedStatuses.find((s) => s.context === 'Vercel');
const vercelPreviewComments = checkRuns.find((c) => c.name === 'Vercel Preview Comments');

if (vercelStatus?.state === 'success') {
  evaluation.evaluation.deploy_proof = {
    source: 'Vercel commit-status',
    state: 'success',
    url: vercelStatus.target_url,
  };
} else if (!strictVercel && vercelPreviewComments?.conclusion === 'success') {
  evaluation.evaluation.deploy_proof = {
    source: 'Vercel Preview Comments check-run (legacy commit-status webhook lag)',
    state: 'success',
    url: vercelPreviewComments.url,
    note: 'Legacy Vercel commit-status was pending but Preview Comments check ran and passed → deploy completed. Use --strict-vercel to require commit-status too.',
  };
} else if (vercelStatus?.state === 'pending') {
  evaluation.evaluation.deploy_proof = { source: 'Vercel commit-status', state: 'pending', url: vercelStatus.target_url };
  evaluation.evaluation.pending.push('Vercel');
} else if (vercelStatus?.state === 'failure' || vercelStatus?.state === 'error') {
  evaluation.evaluation.deploy_proof = { source: 'Vercel commit-status', state: vercelStatus.state, url: vercelStatus.target_url };
  evaluation.evaluation.blocking_failures.push({ name: 'Vercel', detail: vercelStatus.description, url: vercelStatus.target_url });
} else {
  evaluation.evaluation.deploy_proof = { source: 'none', state: 'unknown', note: 'Neither legacy Vercel status nor Preview Comments check found' };
}

// 2. Required check-runs — pr-check, guardrails, claude-review must pass when present
const REQUIRED_CHECK_NAMES = ['pr-check', 'guardrails', 'claude-review'];
for (const name of REQUIRED_CHECK_NAMES) {
  const cr = checkRuns.find((c) => c.name === name);
  if (!cr) {
    evaluation.evaluation.required_checks.push({ name, present: false, state: 'absent' });
    continue;
  }
  evaluation.evaluation.required_checks.push({
    name,
    present: true,
    status: cr.status,
    conclusion: cr.conclusion,
    state: cr.status === 'completed' ? cr.conclusion : cr.status,
    url: cr.url,
  });
  if (cr.status !== 'completed') {
    evaluation.evaluation.pending.push(name);
  } else if (cr.conclusion === 'failure' || cr.conclusion === 'cancelled' || cr.conclusion === 'timed_out') {
    evaluation.evaluation.blocking_failures.push({ name, detail: `conclusion=${cr.conclusion}`, url: cr.url });
  }
}

// 3. Final verdict
let verdict;
if (evaluation.evaluation.blocking_failures.length > 0) {
  verdict = 'DEPLOY_FAIL';
} else if (evaluation.evaluation.deploy_proof?.state === 'success' && evaluation.evaluation.pending.length === 0) {
  verdict = 'DEPLOY_PASS';
} else if (evaluation.evaluation.pending.length > 0) {
  verdict = 'DEPLOY_PENDING';
} else if (evaluation.evaluation.deploy_proof?.state === 'unknown') {
  verdict = 'DEPLOY_UNKNOWN';
} else {
  verdict = 'DEPLOY_PENDING';
}

evaluation.verdict = verdict;

// ─── Output ──────────────────────────────────────────────────────────────
if (jsonOutput) {
  console.log(JSON.stringify(evaluation, null, 2));
} else {
  const verdictColor = {
    DEPLOY_PASS: '\x1b[32m',
    DEPLOY_FAIL: '\x1b[31m',
    DEPLOY_PENDING: '\x1b[33m',
    DEPLOY_UNKNOWN: '\x1b[36m',
  }[verdict];

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Deploy / Release Status Validator                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Repo:   ${repo}`);
  console.log(`  SHA:    ${resolvedSha}`);
  console.log(`  PR:     ${prNum || '(none)'}`);
  console.log('');
  console.log(`  Verdict: ${verdictColor}${verdict}\x1b[0m`);
  console.log('');

  console.log('  Deploy proof:');
  if (evaluation.evaluation.deploy_proof) {
    const dp = evaluation.evaluation.deploy_proof;
    const c = dp.state === 'success' ? '\x1b[32m' : dp.state === 'pending' ? '\x1b[33m' : '\x1b[31m';
    console.log(`    ${c}${dp.state.padEnd(8)}\x1b[0m  ${dp.source}`);
    if (dp.url) console.log(`              ${dp.url}`);
    if (dp.note) console.log(`              \x1b[90m${dp.note}\x1b[0m`);
  }
  console.log('');

  console.log('  Required check-runs:');
  for (const r of evaluation.evaluation.required_checks) {
    const c = r.state === 'success' || r.conclusion === 'success' ? '\x1b[32m' :
              r.state === 'failure' || r.conclusion === 'failure' ? '\x1b[31m' :
              r.state === 'absent' ? '\x1b[90m' : '\x1b[33m';
    const icon = r.state === 'success' || r.conclusion === 'success' ? '✓' :
                 r.state === 'failure' || r.conclusion === 'failure' ? '✗' :
                 r.state === 'absent' ? '·' : '?';
    const stateLabel = r.present ? (r.state || r.conclusion || r.status) : 'absent';
    console.log(`    ${c}${icon} ${stateLabel.padEnd(12)}\x1b[0m  ${r.name}`);
  }
  console.log('');

  if (evaluation.evaluation.blocking_failures.length > 0) {
    console.log('  \x1b[31mBlocking failures:\x1b[0m');
    for (const f of evaluation.evaluation.blocking_failures) {
      console.log(`    ✗ ${f.name} — ${f.detail}`);
      if (f.url) console.log(`      ${f.url}`);
    }
    console.log('');
  }

  if (evaluation.evaluation.pending.length > 0) {
    console.log(`  Pending: ${evaluation.evaluation.pending.join(', ')}`);
    console.log('');
  }
}

// Exit codes
const exitCode = {
  DEPLOY_PASS: 0,
  DEPLOY_PENDING: 0,    // not a failure — caller decides whether to wait
  DEPLOY_UNKNOWN: 0,    // not a failure — caller decides whether to require evidence
  DEPLOY_FAIL: 1,
}[verdict];
process.exit(exitCode);
