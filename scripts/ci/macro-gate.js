#!/usr/bin/env node
// MACRO gate runner — whole-system impact checker (plan PART B4/C2/G).
//
// "No work in the dark." On the PR's diff it: (1) maps changed files to the
// domains they touch + the gates/agents that MUST run, (2) requires a Correction
// Trace Record for any code change, (3) AUTO-parses the declared blast radius
// from the changed Trace Record(s) (--declared overrides) and fails on any code
// changed outside it, (4) fails if code changed + a Trace Record exists but no
// declared radius could be parsed, (5) fail-closed on unknown domains — with a
// controlled --classified-allow escape that itself requires a Trace Record. Run:
//   node scripts/ci/macro-gate.js [--base <ref>] [--declared a,b] [--classified-allow x,y]
const { execSync } = require('child_process');
const fs = require('fs');
const { macroGateIssues, classify, extractDeclaredRadius, declaredRadiusMissingIssue } = require('./gate-lib');

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

const base = arg('--base', 'origin/main');
const declaredArg = arg('--declared', '');
const classifiedAllow = list(arg('--classified-allow', ''));

let files;
try {
  files = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error(`::error::[macro-gate] git diff vs ${base} failed: ${e.message}`);
  process.exit(2);
}

const { code, traceRecords } = classify(files);

// Auto-parse the declared blast radius from the changed Trace Record(s) unless
// --declared overrides.
let declaredRadius = list(declaredArg);
if (declaredRadius.length === 0 && code.length > 0 && traceRecords.length > 0) {
  const all = new Set();
  for (const record of traceRecords) {
    if (!fs.existsSync(record)) continue;
    for (const p of extractDeclaredRadius(fs.readFileSync(record, 'utf8'))) all.add(p);
  }
  declaredRadius = Array.from(all);
}

const { issues, domains } = macroGateIssues(files, { declaredRadius, classifiedAllow });

// Code + a Trace Record present, but nothing parseable in §2 → fail (the
// blast-radius check would otherwise silently no-op). Pure logic in gate-lib.
const missing = declaredRadiusMissingIssue(files, declaredRadius);
if (missing) issues.push(missing);

// A one-time --classified-allow must be documented in a Trace Record.
if (classifiedAllow.length > 0 && traceRecords.length === 0) {
  issues.push({
    level: 'fail',
    rule: 'classified-allow-no-trace',
    msg: '--classified-allow used without a Correction Trace Record. One-time domain classification must be documented.',
  });
}

console.log('[macro-gate] blast-radius — domains touched + required gates:');
const domainNames = Object.keys(domains);
if (domainNames.length === 0) {
  console.log('  (no mapped code/config domains in this diff)');
} else {
  for (const d of domainNames) {
    console.log(`  - ${d}: ${domains[d].files.length} file(s) → must verify: ${domains[d].gates.join(', ')}`);
  }
}
if (declaredRadius.length > 0) console.log(`[macro-gate] declared blast radius: ${declaredRadius.join(', ')}`);

if (issues.length > 0) {
  for (const i of issues) console.error(`::error::[macro-gate] ${i.rule}: ${i.msg}`);
  process.exit(1);
}
console.log('[macro-gate] OK — Trace Record present; no unexpected reach beyond the declared blast radius.');
