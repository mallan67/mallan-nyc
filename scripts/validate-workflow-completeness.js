#!/usr/bin/env node
/**
 * Workflow Completeness Validator
 *
 * Reads compliance/rules/workflow-map.json and evaluates whether each
 * declared workflow has all its required surfaces present in the codebase.
 *
 * Surface verdicts: PASS | FAIL | UNVERIFIED.
 * Workflow aggregate (matching the shared validator-truth status vocabulary):
 *   - all surfaces PASS                 → PASS
 *   - some PASS + some FAIL             → PARTIAL
 *   - all FAIL                          → FAIL
 *   - PASS + UNVERIFIED only            → UNVERIFIED
 *
 * Exit codes:
 *   0 = all release_blocking workflows are PASS or UNVERIFIED (no FAIL/PARTIAL)
 *   1 = any release_blocking workflow is FAIL or PARTIAL
 *
 * Usage:
 *   node scripts/validate-workflow-completeness.js
 *   node scripts/validate-workflow-completeness.js --json
 *   node scripts/validate-workflow-completeness.js --workflow auction_listing
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(ROOT, 'compliance', 'rules', 'workflow-map.json');

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const workflowFilter = args.includes('--workflow') ? args[args.indexOf('--workflow') + 1] : null;

let map;
try {
  map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
} catch (e) {
  console.error(`ERROR: Cannot load workflow map at ${MAP_PATH}`);
  console.error(e.message);
  process.exit(1);
}

const fileCache = new Map();
function readFile(relPath) {
  if (fileCache.has(relPath)) return fileCache.get(relPath);
  const abs = path.join(ROOT, relPath);
  let content = null;
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      content = fs.readFileSync(abs, 'utf-8');
    }
  } catch {
    content = null;
  }
  fileCache.set(relPath, content);
  return content;
}

function checkPattern(content, pattern) {
  if (!content || !pattern) return { found: false, hits: 0 };
  const parts = pattern.split('|').map((p) => p.trim()).filter(Boolean);
  let total = 0;
  for (const p of parts) {
    try {
      const re = new RegExp(p, 'gi');
      const matches = content.match(re);
      total += matches ? matches.length : 0;
    } catch {
      if (content.includes(p)) total += 1;
    }
  }
  return { found: total > 0, hits: total };
}

function evaluateSurface(workflow, surfaceKey) {
  const evidence = workflow.evidence?.[surfaceKey];
  const pattern = workflow.surface_patterns?.[surfaceKey];

  // Surface listed but no evidence files — UNVERIFIED
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return {
      verdict: 'UNVERIFIED',
      reason: 'no evidence file paths declared for this surface',
      files: [],
    };
  }

  let combined = '';
  const filesChecked = [];
  let anyFound = false;
  for (const f of evidence) {
    const content = readFile(f);
    if (content) {
      combined += content + '\n';
      filesChecked.push({ path: f, found: true });
      anyFound = true;
    } else {
      filesChecked.push({ path: f, found: false });
    }
  }

  if (!anyFound) {
    return {
      verdict: 'FAIL',
      reason: 'declared evidence files not present on disk',
      files: filesChecked,
    };
  }

  if (!pattern) {
    return {
      verdict: 'PASS',
      reason: 'evidence file present (no pattern required)',
      files: filesChecked,
    };
  }

  const r = checkPattern(combined, pattern);
  if (r.found) {
    return {
      verdict: 'PASS',
      reason: `pattern matched (${r.hits} hit${r.hits === 1 ? '' : 's'})`,
      files: filesChecked,
    };
  }
  return {
    verdict: 'FAIL',
    reason: 'evidence file present but pattern not found',
    files: filesChecked,
  };
}

function aggregateWorkflow(surfaceVerdicts) {
  const verdicts = Object.values(surfaceVerdicts).map((s) => s.verdict);
  const pass = verdicts.filter((v) => v === 'PASS').length;
  const fail = verdicts.filter((v) => v === 'FAIL').length;
  const unverified = verdicts.filter((v) => v === 'UNVERIFIED').length;
  const total = verdicts.length;

  let aggregate;
  if (total === 0) aggregate = 'UNVERIFIED';
  else if (fail === 0 && unverified === 0) aggregate = 'PASS';
  else if (fail === total) aggregate = 'FAIL';
  else if (pass > 0 && fail > 0) aggregate = 'PARTIAL';
  else if (pass > 0 && unverified > 0 && fail === 0) aggregate = 'UNVERIFIED';
  else aggregate = 'PARTIAL';

  return { aggregate, counts: { pass, fail, unverified, total } };
}

const results = {
  timestamp: new Date().toISOString(),
  summary: { total: 0, pass: 0, partial: 0, fail: 0, unverified: 0, blocking_failures: 0 },
  workflows: [],
};

for (const workflow of map.workflows) {
  if (workflowFilter && workflow.name !== workflowFilter) continue;

  const required = workflow.required_surfaces || [];
  const surfaces = {};
  for (const surfaceKey of required) {
    surfaces[surfaceKey] = evaluateSurface(workflow, surfaceKey);
  }

  const agg = aggregateWorkflow(surfaces);
  const releaseBlocking = workflow.release_blocking !== false;

  results.summary.total++;
  if (agg.aggregate === 'PASS') results.summary.pass++;
  else if (agg.aggregate === 'PARTIAL') results.summary.partial++;
  else if (agg.aggregate === 'FAIL') results.summary.fail++;
  else if (agg.aggregate === 'UNVERIFIED') results.summary.unverified++;

  const isBlockingFailure = releaseBlocking && (agg.aggregate === 'FAIL' || agg.aggregate === 'PARTIAL');
  if (isBlockingFailure) results.summary.blocking_failures++;

  results.workflows.push({
    name: workflow.name,
    title: workflow.title,
    rules: workflow.rules || [],
    aggregate: agg.aggregate,
    counts: agg.counts,
    release_blocking: releaseBlocking,
    is_blocking_failure: isBlockingFailure,
    ci_policy: workflow.ci_policy || 'must_pass',
    operational_action_id: workflow.operational_action_id || null,
    runtime_test_target: workflow.runtime_test_target || null,
    notes: workflow.notes || null,
    surfaces,
  });
}

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Workflow Completeness Validator                     ║');
  console.log('║         Source: compliance/rules/workflow-map.json          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Timestamp: ${results.timestamp}`);
  console.log('');

  for (const wf of results.workflows) {
    const icon = wf.aggregate === 'PASS' ? '✓' :
                 wf.aggregate === 'PARTIAL' ? '◐' :
                 wf.aggregate === 'FAIL' ? '✗' : '?';
    const color = wf.aggregate === 'PASS' ? '\x1b[32m' :
                  wf.aggregate === 'PARTIAL' ? '\x1b[33m' :
                  wf.aggregate === 'FAIL' ? '\x1b[31m' : '\x1b[36m';
    const blockingTag = wf.release_blocking ? ' \x1b[90m[release-blocking]\x1b[0m' : ' \x1b[90m[advisory]\x1b[0m';

    console.log(`${color}${icon}\x1b[0m ${wf.name} — ${wf.title}${blockingTag}`);
    console.log(`  Aggregate: ${color}${wf.aggregate}\x1b[0m  (${wf.counts.pass}/${wf.counts.total} pass${wf.counts.fail ? `, ${wf.counts.fail} fail` : ''}${wf.counts.unverified ? `, ${wf.counts.unverified} unverified` : ''})`);
    if (wf.rules.length) console.log(`  Rules: ${wf.rules.join(', ')}`);
    if (wf.operational_action_id) console.log(`  Operational action: ${wf.operational_action_id}`);
    if (wf.runtime_test_target) console.log(`  Runtime test: ${wf.runtime_test_target}`);

    for (const [key, sv] of Object.entries(wf.surfaces)) {
      const sIcon = sv.verdict === 'PASS' ? '✓' : sv.verdict === 'FAIL' ? '✗' : '?';
      const sColor = sv.verdict === 'PASS' ? '\x1b[32m' : sv.verdict === 'FAIL' ? '\x1b[31m' : '\x1b[36m';
      console.log(`    ${sColor}${sIcon}\x1b[0m ${key.padEnd(22)} ${sv.reason}`);
    }
    if (wf.notes) console.log(`  \x1b[90mnotes: ${wf.notes}\x1b[0m`);
    console.log('');
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Workflows Checked:       ${String(results.summary.total).padStart(4)}                              ║`);
  console.log(`║  \x1b[32mPASS:\x1b[0m                     ${String(results.summary.pass).padStart(4)}                              ║`);
  console.log(`║  \x1b[33mPARTIAL:\x1b[0m                  ${String(results.summary.partial).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mFAIL:\x1b[0m                     ${String(results.summary.fail).padStart(4)}                              ║`);
  console.log(`║  \x1b[36mUNVERIFIED:\x1b[0m               ${String(results.summary.unverified).padStart(4)}                              ║`);
  console.log(`║  \x1b[31mBLOCKING FAILURES:\x1b[0m        ${String(results.summary.blocking_failures).padStart(4)}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

process.exit(results.summary.blocking_failures > 0 ? 1 : 0);
