#!/usr/bin/env node
// MACRO gate runner — whole-system impact checker (plan PART B4/C2/G).
//
// "No work in the dark." On the PR's diff it: (1) maps changed files to the
// domains they touch + the gates/agents that MUST run for that blast radius,
// (2) requires a Correction Trace Record for any code change, (3) optionally
// reconciles the actual changed code against the record's declared blast radius.
// Fail-closed (exit 1) on violation. Run:
//   node scripts/ci/macro-gate.js [--base <ref>] [--declared <file,file,...>]
const { execSync } = require('child_process');
const { macroGateIssues } = require('./gate-lib');

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}

const base = arg('--base', 'origin/main');
const declaredArg = arg('--declared', '');
const declaredRadius = declaredArg ? declaredArg.split(',').map((s) => s.trim()).filter(Boolean) : [];

let files;
try {
  files = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error(`::error::[macro-gate] git diff vs ${base} failed: ${e.message}`);
  process.exit(2);
}

const { issues, domains } = macroGateIssues(files, { declaredRadius });

console.log('[macro-gate] blast-radius — domains touched + required gates:');
const domainNames = Object.keys(domains);
if (domainNames.length === 0) {
  console.log('  (no mapped code/config domains in this diff)');
} else {
  for (const d of domainNames) {
    console.log(`  - ${d}: ${domains[d].files.length} file(s) → must verify: ${domains[d].gates.join(', ')}`);
  }
}

if (issues.length > 0) {
  for (const i of issues) console.error(`::error::[macro-gate] ${i.rule}: ${i.msg}`);
  process.exit(1);
}
console.log('[macro-gate] OK — Trace Record present; no unexpected reach beyond the declared blast radius.');
