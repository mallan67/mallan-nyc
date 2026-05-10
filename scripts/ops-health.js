// scripts/ops-health.js — unified operational health check for the Neon + Trestle stack.
//
// Run on demand (or as a weekly cron) to see:
//   - Storage: DB size, top tables, growth velocity
//   - Sync: last run status, error rate, watermark age
//   - Retention: archive queue, compliance gap
//   - Upgrade triggers: which thresholds are approaching for Phase 6 decisions
//
// Exit codes:
//   0 — healthy
//   1 — warning (something is drifting but not urgent)
//   2 — critical (immediate attention needed)
//
// Usage (npm run ops:health auto-loads BOTH .env.local and .env if present):
//   npm run ops:health                                                            # human output
//   npm run ops:health:json                                                       # machine output
//
// Direct invocation also accepts either env file (or both):
//   node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/ops-health.js

if (!process.env.DATABASE_URL) {
  console.error(
    '[ops-health] DATABASE_URL is not set. Set it in .env.local or .env (or shell env) and re-run.'
  );
  process.exit(2);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const JSON_OUT = process.argv.includes('--json');

// Phase-6 upgrade trigger thresholds (from architecture doc §6)
const THRESHOLDS = {
  storage_free_cap_mb: 500,
  storage_warning_pct: 0.80,    // warn at 80% of free cap
  storage_upgrade_pct: 0.85,    // trigger Launch upgrade at 85% sustained
  compute_free_cap_hours: 191.9,
  compute_warning_hours: 160,
  sync_error_warn_24h: 20,
  sync_error_critical_24h: 100,
  sync_watermark_stale_hours: 2, // no sync in 2h = stale
  archive_backlog_warn: 1000,    // over 1K eligible = cron caps need increase
};

function mb(bytes) { return Number(bytes) / 1024 / 1024; }
function hoursAgo(date) {
  if (!date) return null;
  return (Date.now() - new Date(date).getTime()) / 3600000;
}

async function run() {
  const report = {
    generated_at: new Date().toISOString(),
    verdict: 'healthy',
    issues: [],
    storage: {},
    sync: {},
    retention: {},
    triggers: {},
  };

  // ─── Storage ──────────────────────────────────────────────────────
  const [sizeRow] = await prisma.$queryRawUnsafe(`
    SELECT pg_database_size(current_database())::bigint AS bytes
  `);
  const dbSizeMB = mb(sizeRow.bytes);
  report.storage.db_size_mb = Number(dbSizeMB.toFixed(2));
  report.storage.free_cap_mb = THRESHOLDS.storage_free_cap_mb;
  report.storage.pct_of_free = Number((dbSizeMB / THRESHOLDS.storage_free_cap_mb * 100).toFixed(1));

  const topTables = await prisma.$queryRawUnsafe(`
    SELECT c.relname AS table,
           pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 5
  `);
  report.storage.top_5_tables = topTables.map((t) => ({
    table: t.table,
    size_mb: Number(mb(t.bytes).toFixed(2)),
  }));

  // ─── Sync Health ──────────────────────────────────────────────────
  try {
    const syncState = await prisma.syncState.findUnique({ where: { resource: 'Property' } });
    if (!syncState) {
      report.sync.state = 'not_yet_populated';
      report.sync.last_run_at = null;
    } else {
      report.sync.state = syncState.last_run_status;
      report.sync.last_run_at = syncState.last_run_at;
      report.sync.watermark = syncState.last_watermark;
      report.sync.last_run_duration_ms = syncState.last_run_duration_ms;
      report.sync.rows_upserted_last_run = syncState.rows_upserted;
      report.sync.rows_with_errors_last_run = syncState.rows_with_errors;

      const staleHours = hoursAgo(syncState.last_run_at);
      if (staleHours !== null && staleHours > THRESHOLDS.sync_watermark_stale_hours) {
        report.issues.push({
          level: 'warning',
          category: 'sync',
          msg: `Sync watermark is stale (${staleHours.toFixed(1)}h since last run; threshold ${THRESHOLDS.sync_watermark_stale_hours}h)`,
        });
      }
    }

    const errs24h = await prisma.syncError.count({
      where: { occurred_at: { gt: new Date(Date.now() - 86400000) } },
    });
    report.sync.errors_last_24h = errs24h;
    if (errs24h >= THRESHOLDS.sync_error_critical_24h) {
      report.issues.push({ level: 'critical', category: 'sync', msg: `${errs24h} sync errors in last 24h (critical >=${THRESHOLDS.sync_error_critical_24h})` });
    } else if (errs24h >= THRESHOLDS.sync_error_warn_24h) {
      report.issues.push({ level: 'warning', category: 'sync', msg: `${errs24h} sync errors in last 24h (warn >=${THRESHOLDS.sync_error_warn_24h})` });
    }

    // Prisma 6 disallows `_count: { _all: 'desc' }` in orderBy — `_all` only
    // belongs inside the select's `_count`. Order by a grouped column instead.
    const recentErrors = await prisma.syncError.groupBy({
      by: ['error_code'],
      where: { occurred_at: { gt: new Date(Date.now() - 86400000) } },
      _count: { error_code: true },
      orderBy: { _count: { error_code: 'desc' } },
      take: 5,
    });
    report.sync.top_error_codes_24h = recentErrors.map((r) => ({ code: r.error_code, count: r._count.error_code }));
  } catch (e) {
    if (e.message?.includes('does not exist')) {
      report.sync.state = 'pre_migration';
      report.sync.note = 'PR #3 migration not yet applied';
    } else { throw e; }
  }

  // ─── Retention Health ─────────────────────────────────────────────
  const nullStatusChanged = await prisma.listing.count({
    where: { status_changed_at: null },
  });
  report.retention.listings_missing_status_changed = nullStatusChanged;
  if (nullStatusChanged > 0) {
    report.issues.push({
      level: nullStatusChanged > 100 ? 'critical' : 'warning',
      category: 'retention',
      msg: `${nullStatusChanged} listings still have NULL status_changed_at — Phase 1 backfill not applied`,
    });
  }

  const idxViolation = await prisma.listing.count({
    where: {
      status: { in: ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled'] },
      status_changed_at: { lt: new Date(Date.now() - 86400000) },
      idx_display_yn: true,
    },
  });
  report.retention.rebny_sec_2_05_violations = idxViolation;
  if (idxViolation > 0) {
    report.issues.push({
      level: 'critical',
      category: 'compliance',
      msg: `${idxViolation} terminal listings still idx_display_yn=true past 24h window — REBNY RLS §2.05 violation`,
    });
  }

  // Also flag terminal listings with IDX on but UNKNOWN status_changed_at —
  // the 24h window can't be evaluated, so these represent a tracking gap.
  const terminalUnknownAge = await prisma.listing.count({
    where: {
      status: { in: ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled'] },
      status_changed_at: null,
      idx_display_yn: true,
    },
  });
  report.retention.terminal_idx_on_no_timestamp = terminalUnknownAge;
  if (terminalUnknownAge > 0) {
    report.issues.push({
      level: 'critical',
      category: 'compliance',
      msg: `${terminalUnknownAge} terminal listings with IDX on but NULL status_changed_at — run Phase 1 backfill to make §2.05 enforceable`,
    });
  }

  const archiveEligible = await prisma.listing.count({
    where: {
      status: { in: ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled'] },
      status_changed_at: { lt: new Date(Date.now() - 180 * 86400000) },
      sync_status: { not: 'archived' },
    },
  });
  report.retention.archive_backlog = archiveEligible;
  if (archiveEligible > THRESHOLDS.archive_backlog_warn) {
    report.issues.push({
      level: 'warning',
      category: 'retention',
      msg: `${archiveEligible} listings eligible for T+180d archive — cron cap (500/day) may not keep up`,
    });
  }

  try {
    const archived = await prisma.listingsArchive.count();
    report.retention.listings_archived_total = archived;
  } catch (e) {
    if (!e.message?.includes('does not exist')) throw e;
  }

  // ─── Neon Branch Prune (Vercel-Neon integration health) ──────────
  // Reads the most recent `neon_branch_prune_cron` audit event written
  // by app/api/cron/neon-branch-prune/route.ts. Surfaces:
  //   - critical if no audit event ever (cron has never run)
  //   - critical if last status is `skipped` (env-var misconfig)
  //   - warning  if last successful run >25h ago (cron stopped firing)
  //   - warning  if last run had errors_count > 0 (some deletes failed)
  //   - warning  if examined branch count >= 8 (within 2 of free-tier 10 cap)
  // The prior silent-skip behavior (return 200 + no audit event) was
  // invisible to every observation surface; this section closes that
  // gap so a future env-var misconfiguration cannot persist for 2+ weeks.
  try {
    const lastPrune = await prisma.auditEvent.findFirst({
      where: { action: 'neon_branch_prune_cron' },
      orderBy: { created_at: 'desc' },
      select: { created_at: true, changes: true },
    });
    if (!lastPrune) {
      report.branch_prune = { last_run_at: null, status: 'never_run' };
      report.issues.push({
        level: 'critical',
        category: 'neon-prune',
        msg: 'neon-branch-prune cron has never written an audit event — cron may not be reaching the route or env vars (NEON_API_KEY/NEON_PROJECT_ID) are missing in Vercel Production',
      });
    } else {
      const ageH = hoursAgo(lastPrune.created_at);
      const status = lastPrune.changes?.status;
      report.branch_prune = {
        last_run_at: lastPrune.created_at,
        last_run_hours_ago: ageH !== null ? Number(ageH.toFixed(1)) : null,
        status,
        examined: lastPrune.changes?.examined,
        pruned_count: lastPrune.changes?.pruned_count,
        errors_count: lastPrune.changes?.errors_count,
        missing: lastPrune.changes?.missing,
      };
      if (status === 'skipped') {
        const missingList = Array.isArray(lastPrune.changes?.missing) ? lastPrune.changes.missing.join(',') : 'unknown';
        report.issues.push({
          level: 'critical',
          category: 'neon-prune',
          msg: `neon-branch-prune cron is skipping due to missing env: ${missingList} — provision in Vercel Production env`,
        });
      } else if (ageH !== null && ageH > 25) {
        report.issues.push({
          level: 'warning',
          category: 'neon-prune',
          msg: `neon-branch-prune cron last fired ${ageH.toFixed(1)}h ago — schedule is daily, expected <25h`,
        });
      } else if (status === 'partial' || (typeof lastPrune.changes?.errors_count === 'number' && lastPrune.changes.errors_count > 0)) {
        report.issues.push({
          level: 'warning',
          category: 'neon-prune',
          msg: `neon-branch-prune last run had ${lastPrune.changes.errors_count ?? '?'} per-branch delete failures`,
        });
      }
      if (typeof lastPrune.changes?.examined === 'number' && lastPrune.changes.examined >= 8) {
        report.issues.push({
          level: 'warning',
          category: 'neon-prune',
          msg: `${lastPrune.changes.examined} Neon branches examined — within 2 of free-tier 10-branch cap`,
        });
      }
    }
  } catch (e) {
    // Don't let audit-event read failures break the rest of ops:health.
    if (!e.message?.includes('does not exist')) {
      report.branch_prune = { error: e.message };
    }
  }

  // ─── Phase 6 Upgrade Triggers ─────────────────────────────────────
  report.triggers.storage_upgrade_needed = report.storage.pct_of_free >= THRESHOLDS.storage_upgrade_pct * 100;
  report.triggers.storage_warning = report.storage.pct_of_free >= THRESHOLDS.storage_warning_pct * 100;
  report.triggers.scale_postgis_threshold = false; // set true at 50K listings
  report.triggers.scale_partitioning_threshold = false; // set true at 10M audit_events
  const listingCount = await prisma.listing.count();
  report.triggers.total_listings = listingCount;
  if (listingCount >= 50000) report.triggers.scale_postgis_threshold = true;
  const auditCount = await prisma.auditEvent.count();
  report.triggers.total_audit_events = auditCount;
  if (auditCount >= 10_000_000) report.triggers.scale_partitioning_threshold = true;

  if (report.triggers.storage_warning) {
    report.issues.push({
      level: report.triggers.storage_upgrade_needed ? 'critical' : 'warning',
      category: 'capacity',
      msg: `Storage at ${report.storage.pct_of_free}% of free cap — review upgrade triggers in architecture doc §6`,
    });
  }

  // ─── Verdict ──────────────────────────────────────────────────────
  const hasCritical = report.issues.some((i) => i.level === 'critical');
  const hasWarning = report.issues.some((i) => i.level === 'warning');
  report.verdict = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';

  await prisma.$disconnect();

  // Drop a sentinel file so the NEON pre-commit guard can verify a recent run.
  // Written regardless of verdict — the guard cares that we ran, not the result.
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(
      path.join(process.cwd(), '.ops-health-last'),
      JSON.stringify({ verdict: report.verdict, at: report.generated_at }, null, 2)
    );
  } catch { /* sentinel is best-effort */ }

  if (JSON_OUT) {
    console.log(JSON.stringify(report, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  } else {
    renderHuman(report);
  }
  process.exit(hasCritical ? 2 : hasWarning ? 1 : 0);
}

function renderHuman(r) {
  const v = r.verdict;
  const emoji = v === 'critical' ? '❌' : v === 'warning' ? '⚠️ ' : '✓';
  console.log(`\n${emoji} ${v.toUpperCase()}  —  ${r.generated_at}\n`);

  console.log('── STORAGE ───────────────────────────────────────');
  console.log(`  DB size: ${r.storage.db_size_mb} MB (${r.storage.pct_of_free}% of ${r.storage.free_cap_mb} MB free cap)`);
  console.log('  Top 5 tables:');
  r.storage.top_5_tables.forEach((t) => console.log(`    ${t.table.padEnd(30)} ${t.size_mb} MB`));

  console.log('\n── SYNC ──────────────────────────────────────────');
  console.log(`  State: ${r.sync.state || 'unknown'}`);
  if (r.sync.last_run_at) {
    console.log(`  Last run: ${r.sync.last_run_at} (${hoursAgo(r.sync.last_run_at)?.toFixed(1)}h ago)`);
    console.log(`  Last run: ${r.sync.rows_upserted_last_run ?? 0} upserted, ${r.sync.rows_with_errors_last_run ?? 0} errors, ${r.sync.last_run_duration_ms ?? 0}ms`);
  }
  if (r.sync.errors_last_24h !== undefined) {
    console.log(`  Errors (last 24h): ${r.sync.errors_last_24h}`);
    if (r.sync.top_error_codes_24h?.length) {
      r.sync.top_error_codes_24h.forEach((e) => console.log(`    ${(e.code || '(null)').padEnd(20)} ${e.count}`));
    }
  }

  console.log('\n── RETENTION / COMPLIANCE ───────────────────────');
  console.log(`  Listings missing status_changed_at: ${r.retention.listings_missing_status_changed ?? 0}`);
  console.log(`  REBNY §2.05 violations (terminal >24h, IDX on): ${r.retention.rebny_sec_2_05_violations ?? 0}`);
  console.log(`  T+180d archive backlog: ${r.retention.archive_backlog ?? 0}`);
  if (r.retention.listings_archived_total !== undefined) {
    console.log(`  Archived total: ${r.retention.listings_archived_total}`);
  }

  if (r.branch_prune) {
    console.log('\n── BRANCH PRUNE ──────────────────────────────────');
    if (r.branch_prune.status === 'never_run') {
      console.log('  ❌ No neon-branch-prune audit event ever recorded');
    } else if (r.branch_prune.error) {
      console.log(`  (audit-event read failed: ${r.branch_prune.error})`);
    } else {
      const ageStr = r.branch_prune.last_run_hours_ago !== null && r.branch_prune.last_run_hours_ago !== undefined
        ? `${r.branch_prune.last_run_hours_ago}h ago`
        : '?h ago';
      console.log(`  Last run: ${r.branch_prune.last_run_at} (${ageStr}) · status=${r.branch_prune.status}`);
      if (r.branch_prune.status === 'skipped') {
        const missingList = Array.isArray(r.branch_prune.missing) ? r.branch_prune.missing.join(', ') : 'unknown';
        console.log(`  ❌ Skipped — missing env: ${missingList}`);
      } else if (r.branch_prune.examined !== undefined) {
        console.log(`  Examined: ${r.branch_prune.examined} · pruned: ${r.branch_prune.pruned_count ?? 0} · errors: ${r.branch_prune.errors_count ?? 0}`);
      }
    }
  }

  console.log('\n── PHASE 6 TRIGGERS ─────────────────────────────');
  console.log(`  Total listings: ${r.triggers.total_listings} (PostGIS trigger at 50,000)`);
  console.log(`  Total audit events: ${r.triggers.total_audit_events} (partition trigger at 10,000,000)`);
  console.log(`  Storage warning: ${r.triggers.storage_warning ? 'YES' : 'no'}`);
  console.log(`  Upgrade to Launch needed: ${r.triggers.storage_upgrade_needed ? 'YES — 85%+ sustained' : 'no'}`);

  if (r.issues.length) {
    console.log('\n── ISSUES ────────────────────────────────────────');
    r.issues.forEach((i) => {
      const icon = i.level === 'critical' ? '❌' : '⚠️ ';
      console.log(`  ${icon} [${i.category}] ${i.msg}`);
    });
  }
  console.log();
}

run().catch(async (e) => {
  console.error('ops-health ERROR:', e);
  await prisma.$disconnect();
  process.exit(3);
});
