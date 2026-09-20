#!/usr/bin/env node
/**
 * Deploy / Release Status Validator (Phase 2 — release-truth framework)
 *
 * Catches the "merged commit but deploy failed" class of mistakes — the
 * one that bit #47 and #55 in this session's earlier work.
 *
 * Resolves a commit SHA, queries GitHub combined status + check runs, and
 * reports DEPLOY_PASS / DEPLOY_PREVIEW / DEPLOY_FAIL / DEPLOY_PENDING /
 * DEPLOY_UNKNOWN.
 *
 * Required check policy (P2 fail-closed):
 *   - The Vercel commit-status must itself be success — "Vercel Preview
 *     Comments" success is PREVIEW evidence only and is never accepted as
 *     deployment proof (the pre-P2 acceptance is removed).
 *   - Required check runs (pr-check, guardrails, claude-review) must ALL be
 *     present, completed, and successful. A check that has not appeared yet
 *     counts as PENDING, never as pass.
 *   - A PR target caps at DEPLOY_PREVIEW (its Vercel deployment is a
 *     preview). DEPLOY_PASS on a push/sha target means checks-complete —
 *     it is still NOT production-alias proof; that upgrade only comes from
 *     scripts/release-safety/verify-deployment-sha.js.
 *
 * Usage:
 *   node scripts/validate-release-status.js --sha abc123
 *   node scripts/validate-release-status.js --sha HEAD
 *   node scripts/validate-release-status.js --pr 63
 *   node scripts/validate-release-status.js --json
 *   node scripts/validate-release-status.js --strict-vercel    # deprecated (P2): strict is now the only behavior
 */

const { execSync } = require('child_process');
const { evaluateRequiredCheckRequirement } = require('./release-safety/release-truth-verdict.js');

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
// P2: --strict-vercel is deprecated — strict is now the only behavior
// (Preview Comments success is never deployment proof). Parsed for
// backward compatibility only.
const strictVercel = has('--strict-vercel');
void strictVercel;

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

const checkRunsRaw = gh(`api repos/${repo}/commits/${resolvedSha}/check-runs?per_page=100`);
const statusesRaw = gh(`api repos/${repo}/commits/${resolvedSha}/statuses?per_page=100`);

let checkRuns = [];
let statuses = [];
try {
  if (checkRunsRaw) {
    const parsed = JSON.parse(checkRunsRaw);
    checkRuns = (parsed.check_runs || []).map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      startedAt: c.started_at,
      completedAt: c.completed_at,
      url: c.details_url,
      appId: Number.isInteger(c.app?.id) ? c.app.id : null,
      createdAt: c.started_at || c.completed_at || null,
      id: Number.isInteger(c.id) ? c.id : null,
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
} else if (vercelPreviewComments?.conclusion === 'success') {
  // P2 correction: a successful "Vercel Preview Comments" check-run proves a
  // PREVIEW deployment commented on the PR — it is NEVER deployment proof.
  // state 'preview-only' cannot satisfy the success branch of the verdict.
  evaluation.evaluation.deploy_proof = {
    source: 'Vercel Preview Comments check-run',
    state: 'preview-only',
    url: vercelPreviewComments.url,
    note: 'Preview Comments success proves a preview commented on the PR — NOT that any deployment completed. (Pre-P2 this was accepted as deploy proof.)',
  };
  evaluation.evaluation.pending.push('Vercel');
} else if (vercelStatus?.state === 'pending') {
  evaluation.evaluation.deploy_proof = { source: 'Vercel commit-status', state: 'pending', url: vercelStatus.target_url };
  evaluation.evaluation.pending.push('Vercel');
} else if (vercelStatus?.state === 'failure' || vercelStatus?.state === 'error') {
  evaluation.evaluation.deploy_proof = { source: 'Vercel commit-status', state: vercelStatus.state, url: vercelStatus.target_url };
  evaluation.evaluation.blocking_failures.push({ name: 'Vercel', detail: vercelStatus.description, url: vercelStatus.target_url });
} else {
  evaluation.evaluation.deploy_proof = { source: 'none', state: 'unknown', note: 'Neither legacy Vercel status nor Preview Comments check found' };
}

// 2. Required check-runs — stable Mallan checks plus every status check required
// by an ACTIVE branch ruleset that actually applies to refs/heads/main.
function refPatternMatches(pattern, ref) {
  if (pattern === '~ALL') return true;
  if (pattern === '~DEFAULT_BRANCH') return ref === 'refs/heads/main';
  if (typeof pattern !== 'string') return false;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$').test(ref);
}

function rulesetAppliesToMain(ruleset) {
  if (!ruleset || ruleset.enforcement !== 'active' || ruleset.target !== 'branch') return false;
  const refName = ruleset.conditions?.ref_name;
  const includes = Array.isArray(refName?.include) ? refName.include : [];
  const excludes = Array.isArray(refName?.exclude) ? refName.exclude : [];
  const ref = 'refs/heads/main';
  return includes.some((p) => refPatternMatches(p, ref)) &&
    !excludes.some((p) => refPatternMatches(p, ref));
}

function requiredChecksFromApplicableMainRulesets() {
  // --paginate --slurp: gh emits one JSON array per page and --slurp wraps them in an
  // outer array. Without pagination a repository with more rulesets than a single page
  // loses the remainder silently, so discovery would fail OPEN rather than unknown.
  const raw = gh('api --paginate --slurp --method GET repos/{owner}/{repo}/rulesets -f includes_parents=true');
  if (!raw) return { ok: false, checks: [], reason: 'ruleset-list-unavailable' };

  let pages;
  try {
    pages = JSON.parse(raw);
  } catch {
    return { ok: false, checks: [], reason: 'ruleset-list-malformed' };
  }
  if (!Array.isArray(pages)) {
    return { ok: false, checks: [], reason: 'ruleset-list-not-array' };
  }
  // --slurp yields an array of pages; each page is itself an array of rulesets.
  // --slurp wraps one array PER PAGE in an outer array, so every outer element must itself
  // be an array. The previous fallback accepted a non-array page set because typeof [] and
  // typeof {} are both 'object', so [{}] and [[valid],{}] passed and returned ok:true with
  // the required rulesets silently dropped. A mixed or non-array shape is now unknown, not
  // empty, so malformed discovery stays pending instead of failing open.
  // gh returns [[]] for a repository with no rulesets, so a bare [] is an anomalous
  // response rather than an honest empty result. Unknown, not empty.
  if (pages.length === 0) {
    return { ok: false, checks: [], reason: 'ruleset-list-empty' };
  }
  if (!pages.every((page) => Array.isArray(page))) {
    return { ok: false, checks: [], reason: 'ruleset-list-not-paged' };
  }
  const list = pages.flat();
  if (list.some((item) => item === null || typeof item !== 'object' || Array.isArray(item))) {
    return { ok: false, checks: [], reason: 'ruleset-list-not-array' };
  }

  const specs = new Map();
  for (const item of list) {
    // Missing is not the same as not-active. A list entry whose own metadata is absent
    // or the wrong type cannot be read as a ruleset that does not qualify; it is a
    // ruleset whose qualification is unknown, and unknown is the blocking answer.
    if (typeof item.enforcement !== 'string' || typeof item.target !== 'string') {
      return { ok: false, checks: [], reason: 'ruleset-list-item-metadata-missing:' + String(item.id) };
    }
    // The id addresses the detail request. An absent or malformed one would build a
    // nonsense URL whose failure is indistinguishable from a real outage.
    if (!Number.isInteger(item.id) && !(typeof item.id === 'string' && item.id.trim())) {
      return { ok: false, checks: [], reason: 'ruleset-list-item-id-missing' };
    }
    if (item.enforcement !== 'active' || item.target !== 'branch') continue;
    const detailRaw = gh(`api repos/{owner}/{repo}/rulesets/${item.id}`);
    if (!detailRaw) {
      return { ok: false, checks: [], reason: 'ruleset-detail-unavailable:' + String(item.id) };
    }
    let detail;
    try {
      detail = JSON.parse(detailRaw);
    } catch {
      return { ok: false, checks: [], reason: 'ruleset-detail-malformed:' + String(item.id) };
    }
    // A ruleset that cannot be read is not a ruleset that does not apply. A truncated
    // or malformed conditions block would otherwise drop every check it requires while
    // discovery still reported success.
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      return { ok: false, checks: [], reason: 'ruleset-detail-not-object:' + String(item.id) };
    }
    // The list already said this ruleset is an active branch ruleset. A detail that
    // omits or contradicts that is not a detail saying it does not apply to main; it is
    // a detail that cannot be trusted to say anything.
    if (detail.enforcement !== item.enforcement || detail.target !== item.target) {
      return { ok: false, checks: [], reason: 'ruleset-detail-metadata-mismatch:' + String(item.id) };
    }
    // The response must be the ruleset that was ASKED FOR. Without this, a detail for a
    // different ruleset, or one that never says which ruleset it is, stands in for the
    // listed active one and its required checks vanish with ok:true.
    if (String(detail.id) !== String(item.id)) {
      return { ok: false, checks: [], reason: 'ruleset-detail-id-mismatch:' + String(item.id) };
    }
    const conditions = detail?.conditions;
    if (conditions !== undefined && (conditions === null || typeof conditions !== 'object' || Array.isArray(conditions))) {
      return { ok: false, checks: [], reason: 'ruleset-conditions-malformed:' + String(item.id) };
    }
    const refName = conditions?.ref_name;
    if (refName === undefined || refName === null || typeof refName !== 'object' || Array.isArray(refName)) {
      return { ok: false, checks: [], reason: 'ruleset-ref-name-missing:' + String(item.id) };
    }
    if (!Array.isArray(refName.include)) {
      return { ok: false, checks: [], reason: 'ruleset-ref-include-malformed:' + String(item.id) };
    }
    if (refName.exclude !== undefined && !Array.isArray(refName.exclude)) {
      return { ok: false, checks: [], reason: 'ruleset-ref-exclude-malformed:' + String(item.id) };
    }
    // An ARRAY of patterns is not the same as an array of readable patterns.
    // refPatternMatches turns a null entry into a non-match, and a non-match is how this
    // function says "does not apply to main" — so one unreadable pattern silently
    // excused the whole ruleset.
    const patterns = [...refName.include, ...(refName.exclude || [])];
    if (patterns.some((p) => typeof p !== 'string' || !p.trim())) {
      return { ok: false, checks: [], reason: 'ruleset-ref-pattern-malformed:' + String(item.id) };
    }
    if (!rulesetAppliesToMain(detail)) continue;
    // A truncated or malformed detail must make discovery UNKNOWN, not silently empty.
    if (!Array.isArray(detail.rules)) {
      return { ok: false, checks: [], reason: 'ruleset-detail-malformed-rules:' + String(item.id) };
    }
    for (const rule of detail.rules || []) {
      // Same shape again, one level deeper. A rule with no readable type may well BE the
      // required-checks rule, so skipping it drops the contexts it declares.
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        return { ok: false, checks: [], reason: 'ruleset-rule-not-object:' + String(item.id) };
      }
      if (typeof rule.type !== 'string' || !rule.type.trim()) {
        return { ok: false, checks: [], reason: 'ruleset-rule-type-missing:' + String(item.id) };
      }
      if (rule.type !== 'required_status_checks') continue;
      const declared = rule?.parameters?.required_status_checks;
      if (!Array.isArray(declared)) {
        return { ok: false, checks: [], reason: 'ruleset-required-checks-malformed:' + String(item.id) };
      }
      for (const check of declared) {
        // A malformed entry must make discovery UNKNOWN. Skipping it silently drops a
        // required context and still reports success, which is the failure mode this
        // whole guard exists to prevent.
        if (!check || typeof check !== 'object' || Array.isArray(check)) {
          return { ok: false, checks: [], reason: 'ruleset-check-entry-malformed:' + String(item.id) };
        }
        if (typeof check.context !== 'string' || !check.context.trim()) {
          return { ok: false, checks: [], reason: 'ruleset-check-context-missing:' + String(item.id) };
        }
        if (check.integration_id !== undefined && check.integration_id !== null && !Number.isInteger(check.integration_id)) {
          return { ok: false, checks: [], reason: 'ruleset-check-integration-malformed:' + String(item.id) };
        }
        const integrationId = Number.isInteger(check.integration_id) ? check.integration_id : null;
        const key = check.context + '\u0000' + String(integrationId ?? 'any');
        specs.set(key, { context: check.context, integration_id: integrationId });
      }
    }
  }
  return { ok: true, checks: [...specs.values()], reason: null };
}

const rulesetDiscovery = requiredChecksFromApplicableMainRulesets();
if (!rulesetDiscovery.ok) {
  evaluation.evaluation.required_checks.push({
    name: 'main-ruleset-required-check-discovery',
    present: false,
    state: 'unknown',
    detail: rulesetDiscovery.reason,
  });
  evaluation.evaluation.pending.push('main-ruleset-required-check-discovery');
}

const requiredSpecs = new Map();
for (const spec of [
  { context: 'pr-check', integration_id: null },
  { context: 'guardrails', integration_id: null },
  { context: 'claude-review', integration_id: null },
  ...rulesetDiscovery.checks,
]) {
  const key = spec.context + '\u0000' + String(spec.integration_id ?? 'any');
  requiredSpecs.set(key, spec);
}

for (const requirement of requiredSpecs.values()) {
  const result = evaluateRequiredCheckRequirement(requirement, checkRuns, dedupedStatuses);
  evaluation.evaluation.required_checks.push(result.record);

  if (result.failure) {
    evaluation.evaluation.blocking_failures.push({
      name: requirement.context,
      detail: result.failure.detail,
      url: result.failure.url,
    });
  } else if (result.pending) {
    evaluation.evaluation.pending.push(requirement.context);
  }
}

// 3. Final verdict
// P2: a PR target caps at DEPLOY_PREVIEW — its "Vercel" success status is a
// PREVIEW deployment. DEPLOY_PASS (checks-complete on a push/sha target) is
// still NOT production-alias proof; that upgrade only comes from
// scripts/release-safety/verify-deployment-sha.js via --deploy-proof.
let verdict;
if (evaluation.evaluation.blocking_failures.length > 0) {
  verdict = 'DEPLOY_FAIL';
} else if (evaluation.evaluation.deploy_proof?.state === 'success' && evaluation.evaluation.pending.length === 0) {
  verdict = prNum ? 'DEPLOY_PREVIEW' : 'DEPLOY_PASS';
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
    DEPLOY_PREVIEW: '\x1b[32m',
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
  DEPLOY_PREVIEW: 0,    // preview evidence only — never production proof
  DEPLOY_PENDING: 0,    // not a failure — caller decides whether to wait
  DEPLOY_UNKNOWN: 0,    // not a failure — caller decides whether to require evidence
  DEPLOY_FAIL: 1,
}[verdict];
process.exit(exitCode);
