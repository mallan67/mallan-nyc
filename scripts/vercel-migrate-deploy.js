#!/usr/bin/env node
// scripts/vercel-migrate-deploy.js
//
// Smart replacement for the old `npx prisma migrate deploy || echo 'Migration skipped'`
// pattern in vercel.json. The original approach swallowed EVERY failure mode
// equally — cold start, quota, bad SQL, auth error — all "skipped" the same way.
// That caused the 2026-04-19 silent schema drift (compute-quota error → build
// succeeded → prod was missing columns → /api/unsubscribe + sendEmail 500'd).
//
// This runner classifies the error and decides per class:
//
//   ├─ cold-start timeout      → EXIT 0 (proceed) + write sentinel "skipped_cold_start"
//   ├─ compute quota exceeded  → EXIT 1 (block) — you must upgrade Neon or wait
//   ├─ SQL / schema error      → EXIT 1 (block) — migration itself is broken
//   ├─ auth / DNS / env error  → EXIT 1 (block) — config is wrong
//   ├─ unknown                 → EXIT 1 (block) — fail closed
//   └─ success                 → EXIT 0 + write sentinel "applied"
//
// The sentinel at .next/prisma-migration-state.json is read by GET /api/health
// so operators who don't watch Vercel can see "migration skipped" directly.
//
// DO NOT change this script to log-and-pass without reading NEON.md first.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SENTINEL_DIR = path.join(process.cwd(), '.next');
const SENTINEL_FILE = path.join(SENTINEL_DIR, 'prisma-migration-state.json');

function writeSentinel(state) {
  try {
    fs.mkdirSync(SENTINEL_DIR, { recursive: true });
    fs.writeFileSync(
      SENTINEL_FILE,
      JSON.stringify({ ...state, at: new Date().toISOString() }, null, 2)
    );
  } catch (err) {
    // Sentinel write is best-effort; don't let it change the migration decision
    console.warn('[migrate-deploy] Failed to write sentinel:', err.message);
  }
}

function classifyError(combined) {
  // Cold start — Neon auto-suspended, DB comes back on retry.
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|connection.*timed?\s*out|timeout.*database/i.test(combined)) {
    return { kind: 'cold_start', block: false };
  }
  // Neon compute-time quota hit — NOT safe to skip. Schema would drift.
  if (/compute.*time.*quota|exceeded.*compute|compute.*quota.*exceeded/i.test(combined)) {
    return { kind: 'quota_exceeded', block: true };
  }
  // Migration SQL itself is broken (syntax, missing table, FK mismatch).
  if (/syntax error|does not exist|already exists|duplicate|foreign key|violates/i.test(combined)) {
    return { kind: 'schema_error', block: true };
  }
  // Auth / connection string / env var misconfiguration.
  if (/authentication failed|FATAL.*role|DATABASE_URL|invalid.*password/i.test(combined)) {
    return { kind: 'auth_error', block: true };
  }
  return { kind: 'unknown', block: true };
}

function main() {
  console.log('[migrate-deploy] Running prisma migrate deploy...');
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    timeout: 90_000, // 90s — longer than Prisma's own 30s to let Neon cold-start finish
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = stdout + '\n' + stderr;

  // Stream the output either way so the Vercel log still shows what happened
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status === 0 && !stderr.includes('Error:') && !stderr.includes('error:')) {
    writeSentinel({ status: 'applied' });
    console.log('[migrate-deploy] ✓ Migrations applied successfully.');
    process.exit(0);
  }

  const error = classifyError(combined);
  const diagnostic =
    error.kind === 'cold_start'
      ? 'Neon DB was cold — migration will retry on next deploy.'
      : error.kind === 'quota_exceeded'
      ? 'Neon compute quota exceeded. Upgrade plan OR wait for reset. See NEON.md §Recovery.'
      : error.kind === 'schema_error'
      ? 'Migration SQL has an error. Fix the SQL locally and re-push. See NEON.md §Migration-Discipline.'
      : error.kind === 'auth_error'
      ? 'DB auth failed. Check DATABASE_URL in Vercel env vars.'
      : 'Unknown migration failure. Review logs above. See NEON.md §Troubleshooting.';

  writeSentinel({
    status: error.block ? `blocked_${error.kind}` : `skipped_${error.kind}`,
    diagnostic,
  });

  if (error.block) {
    console.error(`\n[migrate-deploy] ✗ BLOCKING BUILD: ${error.kind}`);
    console.error(`    ${diagnostic}\n`);
    process.exit(1);
  }

  console.warn(`\n[migrate-deploy] ⚠  Proceeding despite ${error.kind}`);
  console.warn(`    ${diagnostic}`);
  console.warn('    Verify at https://mallan.nyc/api/health after deploy.\n');
  process.exit(0);
}

main();
