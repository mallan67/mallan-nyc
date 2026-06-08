#!/usr/bin/env node
// MICRO gate runner — local correctness checker (plan PART B/G).
//
// Enforces test-first on the PR's diff: every code change must ship a test
// change. Fail-closed (exit 1) on violation. Run:
//   node scripts/ci/micro-gate.js [--base <ref>]   (default base: origin/main)
//
// This is the deterministic structural half of the MICRO gate; the behavioral
// half is the npm harness (type-check/test:runtime/compliance chain/build).
const { execSync } = require('child_process');
const { microGateIssues } = require('./gate-lib');

function arg(flag, dflt) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}

const base = arg('--base', 'origin/main');
// Intentional test-exemption must carry a reason (recorded in the Trace Record).
const exemptReason = arg('--exempt-reason', '');
let files;
try {
  files = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error(`::error::[micro-gate] git diff vs ${base} failed: ${e.message}`);
  process.exit(2);
}

const issues = microGateIssues(files, { testExemptReason: exemptReason });
if (exemptReason) console.log(`[micro-gate] test-exemption claimed: "${exemptReason}" (must be recorded in the Trace Record).`);
if (issues.length > 0) {
  for (const i of issues) console.error(`::error::[micro-gate] ${i.rule}: ${i.msg}`);
  process.exit(1);
}
console.log(`[micro-gate] OK — ${files.length} changed file(s); test-first satisfied.`);
