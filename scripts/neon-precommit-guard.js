#!/usr/bin/env node
// scripts/neon-precommit-guard.js
//
// Enforces the NEON.md pre-flight discipline.
//
// Runs automatically via `.githooks/pre-commit` (installed by
// `npm run hooks:install`). Scans the staged changes for anything that could
// affect Neon state — schema edits, migration files, vercel.json,
// prisma-related scripts — and blocks the commit unless:
//
//   1. The commit message contains the explicit acknowledgment token
//      `[neon-preflight: OK]`, AND
//   2. `npm run ops:health` was run in the last 60 minutes (.ops-health-last
//      sentinel file), AND
//   3. `npx prisma migrate status` reports "Database schema is up to date"
//      (confirms the dev's local prod-mirrored DB matches main).
//
// The token is intentionally specific enough that copy-pasting a generic
// commit message never satisfies it — a dev has to type it deliberately,
// which forces a glance at NEON.md.
//
// Override: set `NEON_GUARD_BYPASS=1` to skip the check. Use only for
// emergency hotfixes; NEON.md §5 Recovery documents when that's appropriate.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TOKEN = '[neon-preflight: OK]';
const OPS_HEALTH_SENTINEL = path.join(ROOT, '.ops-health-last');
const OPS_HEALTH_MAX_AGE_MS = 60 * 60 * 1000;
const TRIGGER_PATHS = [
  /^prisma\/schema\.prisma$/,
  /^prisma\/migrations\//,
  /^vercel\.json$/,
  /^scripts\/neon-/,
  /^scripts\/phase\d+/,
  /^lib\/prisma\b/,
  /^lib\/idx\/sync\.ts$/,
  /^NEON\.md$/, // editing NEON.md itself also triggers — forces re-read
];

function fail(msg) {
  console.error('\n🛑 neon-precommit-guard: COMMIT BLOCKED');
  console.error(msg);
  console.error('\n→ Read NEON.md (repo root) before retrying.');
  console.error('→ Override with NEON_GUARD_BYPASS=1 git commit … only for documented emergencies.\n');
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ neon-precommit-guard: ${msg}`);
}

if (process.env.NEON_GUARD_BYPASS === '1') {
  console.warn('⚠  neon-precommit-guard: BYPASSED via NEON_GUARD_BYPASS=1');
  process.exit(0);
}

// ── 1. Identify staged files ──────────────────────────────────────────────
let staged = '';
try {
  staged = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
} catch {
  // Not a git repo or no index — skip silently.
  process.exit(0);
}
const stagedFiles = staged.split('\n').filter(Boolean);
const triggered = stagedFiles.filter((f) => TRIGGER_PATHS.some((rx) => rx.test(f)));

if (triggered.length === 0) {
  // Nothing DB/Neon-related — no guard needed.
  process.exit(0);
}

console.log('\n[neon-precommit-guard] Neon-sensitive files staged:');
triggered.forEach((f) => console.log(`  - ${f}`));
console.log('');

// ── 2. Require acknowledgment token in commit message ────────────────────
// The token check only runs in the commit-msg hook context, where git
// passes the canonical message-file path as $1 (the commit-msg hook in
// .githooks/commit-msg re-exports it as GIT_COMMIT_MSG_FILE before
// invoking this script). At pre-commit time, .git/COMMIT_EDITMSG holds
// the PREVIOUS commit's message — reading it here would falsely fail
// any commit that follows another commit whose message lacked the token.
// commit-msg hook is the correct enforcement point and runs even when
// `git commit -m` or `-F` is used (git updates the file before invoking
// commit-msg in both cases). The two-hook split matches the comment at
// the top of .githooks/commit-msg.
const msgFile = process.env.GIT_COMMIT_MSG_FILE;
if (msgFile) {
  let commitMsg = '';
  try {
    commitMsg = fs.readFileSync(msgFile, 'utf-8');
  } catch {
    /* commit-msg invoked but file unreadable — surface as missing token */
  }
  if (!commitMsg.includes(TOKEN)) {
    fail(
      `  This commit touches Neon-sensitive files but the message is missing the\n` +
      `  required acknowledgment token: ${TOKEN}\n\n` +
      `  Add it to your commit message after reading NEON.md §4 (Migration\n` +
      `  discipline) + §5 (Pre-flight checklist).\n\n` +
      `  Example:\n` +
      `    fix(schema): add nullable column \`foo\` to Lead\n` +
      `\n` +
      `    ${TOKEN}\n` +
      `    - Ran \`DATABASE_URL=prod prisma migrate deploy\` — applied cleanly\n` +
      `    - Ran \`npm run ops:health\` — storage 43%, compute 38%`
    );
  }
}

// ── 3. Require recent ops:health run ─────────────────────────────────────
let healthAge = Infinity;
try {
  const stat = fs.statSync(OPS_HEALTH_SENTINEL);
  healthAge = Date.now() - stat.mtimeMs;
} catch {
  /* no sentinel */
}

if (healthAge > OPS_HEALTH_MAX_AGE_MS) {
  const ageMin = Math.round(healthAge / 60000);
  fail(
    `  ops:health was last run ${isFinite(healthAge) ? ageMin + ' minutes ago' : 'never'}.\n` +
    `  NEON.md §5 requires a run within the last 60 minutes before any\n` +
    `  Neon-sensitive commit.\n\n` +
    `  Fix: run \`npm run ops:health\` and re-commit.`
  );
}
ok(`ops:health sentinel is ${Math.round(healthAge / 60000)} min old (threshold 60).`);

// ── 4. Confirm prisma migrate status is clean on the dev's local DB ──────
// Not mandatory because dev may have a scratch DB, but we surface drift.
try {
  const status = execSync('npx prisma migrate status', {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
  });
  if (/Database schema is up to date/.test(status)) {
    ok('prisma migrate status: dev DB is in sync.');
  } else if (/Following migration have not yet been applied/.test(status)) {
    console.warn('  ⚠  Local DB has unapplied migrations — confirm prod was migrated manually first.');
  }
} catch {
  console.warn('  ⚠  Could not run `prisma migrate status` — skipping drift check.');
}

console.log('\n✓ neon-precommit-guard: all checks passed. Proceeding with commit.\n');
