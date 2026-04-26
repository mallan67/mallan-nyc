#!/usr/bin/env node
/**
 * Toolchain Policy Validator (Phase 4 — release-truth framework)
 *
 * Verifies the executing runtime matches what the project declares it
 * supports. Prevents false negatives caused by running validators or
 * builds on an unsupported Node/npm version.
 *
 * Statuses:
 *   PASS   runtime matches declared engines policy
 *   FAIL   runtime out of policy (CI / deploy context)
 *   WARN   runtime out of policy (local context)
 *
 * Exit codes:
 *   0  PASS or WARN
 *   1  FAIL (only when --strict, otherwise WARN-class issues exit 0)
 *
 * Usage:
 *   node scripts/validate-toolchain.js
 *   node scripts/validate-toolchain.js --strict
 *   node scripts/validate-toolchain.js --json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const strict = has('--strict');
const jsonOutput = has('--json');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const declaredNode = pkg.engines?.node || null;

function actualNodeMajor() {
  return Number(process.versions.node.split('.')[0]);
}

function actualNpmVersion() {
  try {
    return execSync('npm --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function nodeMatches(declared, actual) {
  if (!declared) return true;
  // Match patterns like "20.x", "20", ">=20", "20.x || 22.x"
  if (declared.includes('||')) {
    return declared.split('||').some((part) => nodeMatches(part.trim(), actual));
  }
  const m = declared.match(/^([>=~^]*)\s*(\d+)/);
  if (!m) return true;
  const op = m[1] || '=';
  const declMajor = Number(m[2]);
  if (op === '=' || op === '') return actual === declMajor;
  if (op === '>=') return actual >= declMajor;
  if (op === '>')  return actual > declMajor;
  if (op === '~' || op === '^') return actual === declMajor;
  return actual === declMajor;
}

const checks = [];

// 1. Node version vs engines.node
const actualMajor = actualNodeMajor();
if (!declaredNode) {
  checks.push({ check: 'engines.node', verdict: 'WARN', detail: 'package.json declares no engines.node — set it to lock the runtime contract' });
} else if (nodeMatches(declaredNode, actualMajor)) {
  checks.push({ check: 'engines.node', verdict: 'PASS', detail: `runtime Node major ${actualMajor} matches "${declaredNode}"` });
} else {
  const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  checks.push({
    check: 'engines.node',
    verdict: isCi ? 'FAIL' : 'WARN',
    detail: `runtime Node major ${actualMajor} does NOT match declared "${declaredNode}". ${isCi ? 'CI runs must match.' : 'Local runtime mismatch — CI will catch real builds, but validator output may be unreliable.'}`,
  });
}

// 2. npm major version (informational)
const npmVer = actualNpmVersion();
if (npmVer) {
  const major = Number(npmVer.split('.')[0]);
  if (major < 9) {
    checks.push({ check: 'npm version', verdict: 'WARN', detail: `npm ${npmVer} — Node 20 ships with npm 10. An older npm may behave differently around optionalDependencies.` });
  } else {
    checks.push({ check: 'npm version', verdict: 'PASS', detail: `npm ${npmVer}` });
  }
} else {
  checks.push({ check: 'npm version', verdict: 'WARN', detail: 'could not detect npm version' });
}

// 3. Prisma client generated?
const prismaClientPath = path.join(ROOT, 'node_modules', '@prisma', 'client', 'index.d.ts');
if (fs.existsSync(prismaClientPath)) {
  checks.push({ check: 'prisma client generated', verdict: 'PASS', detail: '@prisma/client present in node_modules' });
} else {
  checks.push({ check: 'prisma client generated', verdict: 'WARN', detail: '@prisma/client missing — run `npx prisma generate`' });
}

// ─── Output ─────────────────────────────────────────────────────────────
const summary = {
  pass: checks.filter((c) => c.verdict === 'PASS').length,
  warn: checks.filter((c) => c.verdict === 'WARN').length,
  fail: checks.filter((c) => c.verdict === 'FAIL').length,
};

const result = {
  timestamp: new Date().toISOString(),
  declared_node: declaredNode,
  actual_node: process.versions.node,
  actual_npm: npmVer,
  is_ci: process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true',
  checks,
  summary,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('');
  console.log('  Toolchain Policy Validator');
  console.log('  ──────────────────────────────────────────────────────────');
  console.log(`  Declared Node: ${declaredNode || '(none)'}`);
  console.log(`  Actual Node:   ${process.versions.node}`);
  console.log(`  npm:           ${npmVer || '(unknown)'}`);
  console.log(`  CI context:    ${result.is_ci ? 'yes' : 'no'}`);
  console.log('');

  for (const c of checks) {
    const icon = c.verdict === 'PASS' ? '✓' : c.verdict === 'FAIL' ? '✗' : '⚠';
    const color = c.verdict === 'PASS' ? '\x1b[32m' : c.verdict === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
    console.log(`  ${color}${icon} ${c.verdict.padEnd(5)}\x1b[0m  ${c.check.padEnd(28)} ${c.detail}`);
  }
  console.log('');
  console.log(`  Summary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`);
  console.log('');
}

let exitCode = 0;
if (summary.fail > 0) exitCode = 1;
else if (strict && summary.warn > 0) exitCode = 1;
process.exit(exitCode);
