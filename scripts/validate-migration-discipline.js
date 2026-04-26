#!/usr/bin/env node
/**
 * Migration Discipline Validator (Phase 2 — release-truth framework)
 *
 * Catches the "schema-dependent code merged before migration applied to
 * prod" class of mistakes (NEON.md §1).
 *
 * For the target ref (default: HEAD vs origin/main), checks:
 *   1. If prisma/schema.prisma changed, a NEW migration directory exists
 *      under prisma/migrations/ unless explicitly exempted.
 *   2. The migration SQL is "additive only" (no DROP, no NOT NULL on
 *      existing tables, no destructive ALTER) — UNLESS the migration
 *      contains an explicit "@allow-destructive" annotation in a comment.
 *   3. PR body contains migration instructions + production verification
 *      note (when --pr <number> is provided).
 *   4. If DATABASE_URL is set, runs `prisma migrate status` and reports
 *      whether the live DB has all migrations applied.
 *
 * Statuses (per shared validator-truth vocabulary):
 *   PASS      schema + migration + rollout discipline + live state aligned
 *   PARTIAL   migration exists but rollout proof or PR notes incomplete
 *   FAIL      schema change without migration, OR unsafe schema discipline
 *   UNVERIFIED no DB access OR no PR context to confirm live state
 *
 * Exit codes:
 *   0  no FAILs
 *   1  any FAIL (blocking)
 *   2  any PARTIAL when --strict is passed
 *
 * Usage:
 *   node scripts/validate-migration-discipline.js
 *   node scripts/validate-migration-discipline.js --base origin/main --head HEAD
 *   node scripts/validate-migration-discipline.js --pr 63
 *   node scripts/validate-migration-discipline.js --strict --json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ─── CLI ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argFlag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

const baseRef = argFlag('--base') || 'origin/main';
const headRef = argFlag('--head') || 'HEAD';
const prNumber = argFlag('--pr');
const strict = has('--strict');
const jsonOutput = has('--json');

// ─── Helpers ─────────────────────────────────────────────────────────────
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
}

function changedFiles(base, head) {
  const out = git(`diff --name-only ${base}..${head}`);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function listMigrationDirs() {
  const migDir = path.join(ROOT, 'prisma', 'migrations');
  if (!fs.existsSync(migDir)) return [];
  return fs.readdirSync(migDir)
    .filter((name) => fs.statSync(path.join(migDir, name)).isDirectory())
    .sort();
}

function migrationsChanged(base, head) {
  const files = changedFiles(base, head);
  return files.filter((f) => f.startsWith('prisma/migrations/') && f.endsWith('migration.sql'));
}

function readMigrationSql(migrationName) {
  const p = path.join(ROOT, 'prisma', 'migrations', migrationName, 'migration.sql');
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

const DESTRUCTIVE_PATTERNS = [
  { id: 'DROP_TABLE',   re: /\bDROP\s+TABLE\b/i,                     description: 'DROP TABLE' },
  { id: 'DROP_COLUMN',  re: /\bDROP\s+COLUMN\b/i,                    description: 'DROP COLUMN' },
  { id: 'DROP_INDEX',   re: /\bDROP\s+INDEX\b/i,                     description: 'DROP INDEX' },
  { id: 'NOT_NULL_ALTER',re: /\bALTER\s+(?:TABLE|COLUMN)\b[^;]*\bSET\s+NOT\s+NULL\b/i, description: 'SET NOT NULL on existing column' },
  { id: 'TYPE_CHANGE',  re: /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,      description: 'ALTER COLUMN ... TYPE' },
  { id: 'TRUNCATE',     re: /\bTRUNCATE\b/i,                         description: 'TRUNCATE' },
];

function scanForDestructive(sql) {
  if (!sql) return [];
  // Honor explicit opt-in: a comment line with @allow-destructive disables blocking
  const allowed = /@allow-destructive\b/i.test(sql);
  if (allowed) return [];
  const hits = [];
  for (const p of DESTRUCTIVE_PATTERNS) {
    if (p.re.test(sql)) hits.push(p);
  }
  return hits;
}

// ─── PR body checks (optional, when --pr provided) ─────────────────────
function fetchPrBody(prNum) {
  try {
    const out = execSync(`gh pr view ${prNum} --json body --jq .body`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    return out;
  } catch {
    return null;
  }
}

const PR_REQUIRED_PHRASES = [
  { id: 'rollout', re: /(prisma\s+migrate\s+deploy|migration[^.]{0,40}prod|apply.*migration.*before)/i, description: 'migration rollout instruction' },
  { id: 'verification', re: /production verification note|verification note|metric to observe|rollback trigger/i, description: 'production verification note' },
];

function checkPrBody(body) {
  if (!body) return null;
  const missing = [];
  for (const p of PR_REQUIRED_PHRASES) {
    if (!p.re.test(body)) missing.push(p);
  }
  return { missing };
}

// ─── Live DB check (optional, when DATABASE_URL is set) ─────────────────
function checkLiveMigrationStatus() {
  if (!process.env.DATABASE_URL) {
    return { verdict: 'UNVERIFIED', reason: 'DATABASE_URL not set; cannot check live migration state' };
  }
  try {
    const out = execSync('npx prisma migrate status', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    const upToDate = /Database schema is up to date/i.test(out)
      || /No pending migrations to apply/i.test(out);
    if (upToDate) return { verdict: 'PASS', reason: 'prisma migrate status reports up to date' };
    return { verdict: 'PARTIAL', reason: 'prisma migrate status reports pending migrations', detail: out.slice(0, 1500) };
  } catch (e) {
    return { verdict: 'UNVERIFIED', reason: 'prisma migrate status threw', detail: e.message?.slice(0, 500) };
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────
const results = {
  timestamp: new Date().toISOString(),
  base: baseRef,
  head: headRef,
  pr: prNumber,
  schema_changed: false,
  migrations_in_diff: [],
  checks: [],
  summary: { pass: 0, partial: 0, fail: 0, unverified: 0 },
};

const files = changedFiles(baseRef, headRef);
const schemaChanged = files.includes('prisma/schema.prisma');
results.schema_changed = schemaChanged;

const migsInDiff = migrationsChanged(baseRef, headRef);
results.migrations_in_diff = migsInDiff;

function record(checkName, verdict, reason, extra = {}) {
  results.checks.push({ check: checkName, verdict, reason, ...extra });
  if (verdict === 'PASS') results.summary.pass++;
  else if (verdict === 'PARTIAL') results.summary.partial++;
  else if (verdict === 'FAIL') results.summary.fail++;
  else if (verdict === 'UNVERIFIED') results.summary.unverified++;
}

// Check 1 — schema-changed-needs-migration
if (schemaChanged && migsInDiff.length === 0) {
  record('schema_change_has_migration', 'FAIL',
    'prisma/schema.prisma changed but no new migration.sql in diff. NEON.md §1: schema changes must be paired with a hand-written migration.');
} else if (schemaChanged && migsInDiff.length > 0) {
  record('schema_change_has_migration', 'PASS',
    `${migsInDiff.length} migration file(s) accompany the schema change`,
    { migrations: migsInDiff });
} else if (!schemaChanged && migsInDiff.length === 0) {
  record('schema_change_has_migration', 'PASS', 'no schema change in diff');
} else {
  record('schema_change_has_migration', 'PARTIAL',
    `migration files in diff (${migsInDiff.length}) but no schema.prisma change — orphan migration?`,
    { migrations: migsInDiff });
}

// Check 2 — migrations are additive (not destructive)
if (migsInDiff.length > 0) {
  for (const f of migsInDiff) {
    const migDir = f.split('/')[2];
    const sql = readMigrationSql(migDir);
    if (!sql) {
      record(`migration_safe:${migDir}`, 'UNVERIFIED', 'could not read migration SQL', { file: f });
      continue;
    }
    const destructive = scanForDestructive(sql);
    if (destructive.length === 0) {
      record(`migration_safe:${migDir}`, 'PASS', 'no destructive operations detected', { file: f });
    } else {
      record(`migration_safe:${migDir}`, 'FAIL',
        `destructive operations: ${destructive.map((d) => d.description).join(', ')}. Add a comment line "-- @allow-destructive" with rollback note if intentional.`,
        { file: f, destructive_patterns: destructive.map((d) => d.id) });
    }
  }
}

// Check 3 — PR body has rollout + verification notes
if (prNumber) {
  const body = fetchPrBody(prNumber);
  if (!body) {
    record('pr_body_has_rollout_notes', 'UNVERIFIED',
      `gh pr view ${prNumber} returned no body — gh CLI not configured or PR not found`);
  } else {
    const result = checkPrBody(body);
    if (!schemaChanged && migsInDiff.length === 0) {
      record('pr_body_has_rollout_notes', 'PASS', 'no schema change → no rollout notes required');
    } else if (result.missing.length === 0) {
      record('pr_body_has_rollout_notes', 'PASS', 'PR body contains both rollout instruction and verification note');
    } else {
      record('pr_body_has_rollout_notes', 'PARTIAL',
        `PR body missing: ${result.missing.map((p) => p.description).join(', ')}`,
        { missing: result.missing.map((p) => p.id) });
    }
  }
} else {
  record('pr_body_has_rollout_notes', 'UNVERIFIED', '--pr <number> not provided');
}

// Check 4 — live DB migration status (only meaningful when schema changed)
if (schemaChanged || migsInDiff.length > 0) {
  const live = checkLiveMigrationStatus();
  record('live_migration_status', live.verdict, live.reason, live.detail ? { detail: live.detail } : {});
} else {
  record('live_migration_status', 'PASS', 'no schema change → live state irrelevant');
}

// ─── Output ─────────────────────────────────────────────────────────────
if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Migration Discipline Validator                      ║');
  console.log('║         (NEON.md §1 enforcement)                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  base:           ${results.base}`);
  console.log(`  head:           ${results.head}`);
  console.log(`  pr:             ${results.pr || '(none — pass --pr N for PR body checks)'}`);
  console.log(`  schema changed: ${schemaChanged}`);
  console.log(`  migrations:     ${migsInDiff.length} in diff`);
  console.log('');

  for (const c of results.checks) {
    const icon = c.verdict === 'PASS' ? '✓' : c.verdict === 'PARTIAL' ? '◐' : c.verdict === 'FAIL' ? '✗' : '?';
    const color = c.verdict === 'PASS' ? '\x1b[32m' : c.verdict === 'PARTIAL' ? '\x1b[33m' : c.verdict === 'FAIL' ? '\x1b[31m' : '\x1b[36m';
    console.log(`  ${color}${icon}\x1b[0m ${c.check}`);
    console.log(`    ${color}${c.verdict}\x1b[0m — ${c.reason}`);
    if (c.detail) console.log(`    ${c.detail.split('\n').slice(0, 3).join('\n    ')}`);
    console.log('');
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  \x1b[32mPASS:\x1b[0m       ${String(results.summary.pass).padStart(4)}                                       ║`);
  console.log(`║  \x1b[33mPARTIAL:\x1b[0m    ${String(results.summary.partial).padStart(4)}                                       ║`);
  console.log(`║  \x1b[31mFAIL:\x1b[0m       ${String(results.summary.fail).padStart(4)}                                       ║`);
  console.log(`║  \x1b[36mUNVERIFIED:\x1b[0m ${String(results.summary.unverified).padStart(4)}                                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

let exitCode = 0;
if (results.summary.fail > 0) exitCode = 1;
else if (strict && results.summary.partial > 0) exitCode = 2;
process.exit(exitCode);
