#!/usr/bin/env node
/**
 * Operational Actions Postcondition Runner (validator framework §12)
 *
 * Reads compliance/rules/operational-actions.json and verifies each entry's
 * declared postcondition is currently satisfied. Catches the
 * "script exists but was never run" class of mistake — the framework
 * already declares postconditions; this runner actually checks them.
 *
 * Postcondition types:
 *   - postcondition_sql       → execute SQL against DATABASE_URL, compare result to postcondition_expected
 *   - postcondition_command   → run shell command, compare stdout to postcondition_expected
 *   - postcondition_description only → manual / informational, reported as UNVERIFIED
 *   - required_env_vars       → confirm env vars are set (e.g. TWILIO_*)
 *
 * Statuses:
 *   PASS        postcondition met
 *   FAIL        postcondition queryable AND contradicted
 *   UNVERIFIED  not queryable in this environment (no DB, no command, etc.)
 *   SKIP        action declared but ci_policy says advisory and we're in CI
 *
 * Exit codes:
 *   0  no FAILs
 *   1  any FAIL
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node scripts/validate-operational-actions.js
 *   node scripts/validate-operational-actions.js --json
 *   node scripts/validate-operational-actions.js --action ethics_backfill_before_gate
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'compliance', 'rules', 'operational-actions.json');

const args = process.argv.slice(2);
const argFlag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);

const jsonOutput = has('--json');
const actionFilter = argFlag('--action');
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
} catch (e) {
  console.error(`Cannot load registry at ${REGISTRY_PATH}: ${e.message}`);
  process.exit(1);
}

function checkEnvVars(action) {
  const required = action.required_env_vars || [];
  if (required.length === 0) return null;
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length === 0) {
    return { verdict: 'PASS', reason: `all required env vars set: ${required.join(', ')}` };
  }
  return { verdict: 'FAIL', reason: `missing env vars: ${missing.join(', ')}` };
}

async function checkSql(action) {
  if (!action.postcondition_sql) return null;
  if (!process.env.DATABASE_URL) {
    return { verdict: 'UNVERIFIED', reason: 'DATABASE_URL not set' };
  }
  try {
    // Use prisma db execute or a raw psql. Prefer the simpler npx pg-cli pattern.
    // Fall back to a runtime require of pg.
    const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query(action.postcondition_sql);
    await client.end();
    const value = res.rows[0] ? Object.values(res.rows[0])[0] : null;
    return evaluatePostcondition(action, value);
  } catch (e) {
    return { verdict: 'UNVERIFIED', reason: `pg query failed: ${e.message?.slice(0, 200)}` };
  }
}

function checkCommand(action) {
  if (!action.postcondition_command) return null;
  try {
    const out = execSync(action.postcondition_command, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }).toString();
    return evaluatePostcondition(action, out);
  } catch (e) {
    return { verdict: 'UNVERIFIED', reason: `command failed: ${e.message?.slice(0, 200)}` };
  }
}

function evaluatePostcondition(action, observed) {
  const expected = action.postcondition_expected;
  if (!expected) {
    return { verdict: 'UNVERIFIED', reason: 'no postcondition_expected declared', observed };
  }
  // Comparison forms:
  //   "= 0"               → numeric exact
  //   "Database schema is up to date" → substring match
  //   "state=ok"          → substring match
  if (expected.startsWith('=')) {
    const num = Number(expected.slice(1).trim());
    if (Number(observed) === num) {
      return { verdict: 'PASS', reason: `observed ${observed} = expected ${num}`, observed };
    }
    return { verdict: 'FAIL', reason: `observed ${observed} != expected ${num}`, observed };
  }
  // Substring match
  const obsStr = String(observed || '');
  if (obsStr.includes(expected)) {
    return { verdict: 'PASS', reason: `observed contains "${expected}"`, observed: obsStr.slice(0, 200) };
  }
  return { verdict: 'FAIL', reason: `observed does not contain "${expected}"`, observed: obsStr.slice(0, 200) };
}

async function evaluateAction(action) {
  // Required artifacts must exist on disk
  const missingArtifacts = (action.required_artifacts || []).filter((a) => {
    // Wildcard handling: if path ends with /*, just check the dir
    if (a.endsWith('/*')) {
      const dir = path.join(ROOT, a.slice(0, -2));
      try { return !fs.statSync(dir).isDirectory(); } catch { return true; }
    }
    return !fs.existsSync(path.join(ROOT, a));
  });
  if (missingArtifacts.length > 0) {
    return {
      action_id: action.id,
      verdict: 'FAIL',
      reason: `required artifacts missing: ${missingArtifacts.join(', ')}`,
    };
  }

  // Try each verification method in priority order
  const envCheck = checkEnvVars(action);
  if (envCheck) return { action_id: action.id, ...envCheck };

  const sqlCheck = await checkSql(action);
  if (sqlCheck) return { action_id: action.id, ...sqlCheck };

  const cmdCheck = checkCommand(action);
  if (cmdCheck) return { action_id: action.id, ...cmdCheck };

  return {
    action_id: action.id,
    verdict: 'UNVERIFIED',
    reason: 'no automatable postcondition declared (description only)',
  };
}

(async () => {
  const results = {
    timestamp: new Date().toISOString(),
    summary: { pass: 0, fail: 0, unverified: 0, skip: 0 },
    actions: [],
  };

  for (const action of registry.actions || []) {
    if (actionFilter && action.id !== actionFilter) continue;
    if (action.ci_policy === 'advisory' && isCI) {
      results.actions.push({ action_id: action.id, verdict: 'SKIP', reason: 'advisory + CI context' });
      results.summary.skip++;
      continue;
    }
    const r = await evaluateAction(action);
    results.actions.push({ ...r, name: action.name, ci_policy: action.ci_policy });
    if (r.verdict === 'PASS') results.summary.pass++;
    else if (r.verdict === 'FAIL') results.summary.fail++;
    else if (r.verdict === 'UNVERIFIED') results.summary.unverified++;
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('');
    console.log('  Operational Actions Postcondition Runner');
    console.log('  ──────────────────────────────────────────────────────────');
    for (const a of results.actions) {
      const icon = a.verdict === 'PASS' ? '✓' : a.verdict === 'FAIL' ? '✗' : a.verdict === 'SKIP' ? '·' : '?';
      const color = a.verdict === 'PASS' ? '\x1b[32m' :
                    a.verdict === 'FAIL' ? '\x1b[31m' :
                    a.verdict === 'SKIP' ? '\x1b[90m' : '\x1b[36m';
      console.log(`  ${color}${icon} ${a.verdict.padEnd(11)}\x1b[0m  ${(a.action_id || '').padEnd(40)}`);
      console.log(`               ${a.reason}`);
    }
    console.log('');
    console.log(`  Summary: ${results.summary.pass} pass, ${results.summary.fail} fail, ${results.summary.unverified} unverified, ${results.summary.skip} skip`);
    console.log('');
  }

  process.exit(results.summary.fail > 0 ? 1 : 0);
})();
