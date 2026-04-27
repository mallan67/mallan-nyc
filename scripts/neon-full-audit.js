#!/usr/bin/env node
/**
 * neon-full-audit — deep tier-decision audit (NEON.md §6)
 *
 * Goes beyond ops-health.js (which is the "is the DB OK right now" check)
 * with diagnostics that drive the "should we upgrade vs. optimize" call:
 *
 *   1. Per-table size + JSON bloat (raw_data column on listings is the
 *      largest single contributor; this audit isolates it)
 *   2. Index bloat (indexes consuming disk space)
 *   3. Audit_events write volume (rows/day, projected days to partition trigger)
 *   4. Listings write volume + growth projection (days to PostGIS trigger)
 *   5. Free-tier headroom + when each cap will be hit at current burn rate
 *   6. Top "upgrade-or-optimize" recommendations
 *
 * Usage:
 *   npm run ops:storage-audit
 *   node --env-file=.env.local scripts/neon-full-audit.js
 *   node --env-file=.env.local scripts/neon-full-audit.js --json
 *
 * Exit codes:
 *   0  healthy (all caps < 80%, all growth projections > 60 days)
 *   1  warning (any cap >= 80% OR growth projection < 60 days)
 *   2  critical (any cap >= 95% OR growth projection < 14 days)
 *
 * Read-only. Never modifies the DB.
 */
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');

// ─── Free tier caps (from NEON.md §2) ────────────────────────────────────
const FREE_TIER_STORAGE_MB = 500;
const FREE_TIER_COMPUTE_HRS = 191.9;
const POSTGIS_TRIGGER_LISTINGS = 50_000;
const PARTITION_TRIGGER_AUDIT_EVENTS = 10_000_000;

(async () => {
  const prisma = new PrismaClient();
  const result = {
    timestamp: new Date().toISOString(),
    tier: 'free',
    caps: {
      storage_mb: FREE_TIER_STORAGE_MB,
      compute_hours_per_month: FREE_TIER_COMPUTE_HRS,
    },
    findings: [],
    recommendations: [],
    summary: {},
  };

  function record(severity, title, detail) {
    result.findings.push({ severity, title, detail });
  }

  try {
    // ── 1. Total DB size + per-table breakdown ──────────────────────────
    // table_bytes  = the table heap (the actual row pages)
    // toast_bytes  = TOAST relation (out-of-line storage for large columns like JSON)
    // index_bytes  = sum of all indexes on the table
    // total = table + toast + indexes + FSM/VM (small)
    const sizeRows = await prisma.$queryRaw`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_relation_size(c.oid) AS table_bytes,
        COALESCE(pg_total_relation_size(c.reltoastrelid), 0) AS toast_bytes,
        pg_indexes_size(c.oid) AS index_bytes,
        s.n_live_tup AS row_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind = 'r' AND n.nspname = 'public'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 15;
    `;
    const dbSizeRow = await prisma.$queryRaw`
      SELECT pg_database_size(current_database())::bigint AS bytes;
    `;
    const dbBytes = Number(dbSizeRow[0].bytes);
    const dbMb = dbBytes / 1024 / 1024;
    const pctOfFree = (dbMb / FREE_TIER_STORAGE_MB) * 100;
    result.summary.db_mb = Math.round(dbMb * 10) / 10;
    result.summary.pct_of_free_cap = Math.round(pctOfFree * 10) / 10;

    if (pctOfFree >= 95) record('critical', 'Storage at critical', `${dbMb.toFixed(1)} MB = ${pctOfFree.toFixed(1)}% of 500 MB cap`);
    else if (pctOfFree >= 80) record('warning', 'Storage above warning threshold', `${dbMb.toFixed(1)} MB = ${pctOfFree.toFixed(1)}% of 500 MB cap`);

    result.summary.tables = sizeRows.map((r) => ({
      name: r.table_name,
      total_mb: Math.round(Number(r.total_bytes) / 1024 / 1024 * 10) / 10,
      table_mb: Math.round(Number(r.table_bytes) / 1024 / 1024 * 10) / 10,
      toast_mb: Math.round(Number(r.toast_bytes) / 1024 / 1024 * 10) / 10,
      index_mb: Math.round(Number(r.index_bytes) / 1024 / 1024 * 10) / 10,
      rows: Number(r.row_count) || 0,
    }));

    // ── 2. JSON bloat — listings.raw_data is the suspected culprit ──────
    // pg_column_size returns the in-row representation: small for TOASTed
    // columns. Use octet_length on the json_text representation to get
    // actual uncompressed size, then we can compare to TOAST size from
    // the per-table breakdown above.
    const jsonBloat = await prisma.$queryRaw`
      SELECT
        AVG(octet_length(raw_data::text))::bigint AS avg_raw_data_bytes,
        MAX(octet_length(raw_data::text))::bigint AS max_raw_data_bytes,
        SUM(octet_length(raw_data::text))::bigint AS total_raw_data_bytes,
        COUNT(*)::bigint AS row_count
      FROM listings
      WHERE raw_data IS NOT NULL;
    `;
    const jb = jsonBloat[0];
    const totalRawDataMb = Number(jb.total_raw_data_bytes) / 1024 / 1024;
    result.summary.listings_raw_data = {
      total_mb: Math.round(totalRawDataMb * 10) / 10,
      avg_kb: Math.round(Number(jb.avg_raw_data_bytes) / 1024 * 10) / 10,
      max_kb: Math.round(Number(jb.max_raw_data_bytes) / 1024 * 10) / 10,
      rows_with_data: Number(jb.row_count),
    };
    if (totalRawDataMb > 200) {
      record('warning', 'listings.raw_data is the dominant storage cost',
        `${totalRawDataMb.toFixed(1)} MB across ${Number(jb.row_count)} rows (avg ${(Number(jb.avg_raw_data_bytes)/1024).toFixed(1)} KB/row). Consider archiving raw_data for closed listings older than N days.`);
    }

    // ── 3. Index bloat — indexes that take more space than their tables ─
    const idxBloat = await prisma.$queryRaw`
      SELECT
        schemaname || '.' || relname AS table_name,
        pg_relation_size(indexrelid) AS index_bytes,
        idx_scan,
        indexrelname AS index_name
      FROM pg_stat_user_indexes
      WHERE pg_relation_size(indexrelid) > 1024 * 1024
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 10;
    `;
    result.summary.top_indexes = idxBloat.map((r) => ({
      index: r.index_name,
      table: r.table_name,
      mb: Math.round(Number(r.index_bytes) / 1024 / 1024 * 10) / 10,
      scans: Number(r.idx_scan),
    }));
    const unusedIndexes = idxBloat.filter((r) => Number(r.idx_scan) === 0);
    if (unusedIndexes.length > 0) {
      record('info', `${unusedIndexes.length} large indexes never scanned`,
        `Candidates for DROP INDEX: ${unusedIndexes.map((r) => r.index_name).join(', ')}`);
    }

    // ── 4. audit_events write volume + projection ───────────────────────
    const auditCount = await prisma.$queryRaw`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::bigint AS last_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::bigint AS last_24h
      FROM audit_events;
    `;
    const ae = auditCount[0];
    const auditDailyRate = Number(ae.last_7d) / 7;
    const daysToPartitionTrigger = auditDailyRate > 0
      ? Math.round((PARTITION_TRIGGER_AUDIT_EVENTS - Number(ae.total)) / auditDailyRate)
      : Infinity;
    result.summary.audit_events = {
      total: Number(ae.total),
      last_24h: Number(ae.last_24h),
      last_7d: Number(ae.last_7d),
      daily_rate: Math.round(auditDailyRate),
      days_to_partition_trigger: daysToPartitionTrigger === Infinity ? 'no growth' : daysToPartitionTrigger,
      partition_trigger_at: PARTITION_TRIGGER_AUDIT_EVENTS,
    };
    if (daysToPartitionTrigger < 14 && daysToPartitionTrigger !== Infinity) {
      record('critical', 'audit_events approaching partition trigger', `~${daysToPartitionTrigger} days at current ${Math.round(auditDailyRate)}/day rate`);
    }

    // ── 5. listings write volume + projection ───────────────────────────
    const listingsCount = await prisma.$queryRaw`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::bigint AS last_7d
      FROM listings;
    `;
    const lc = listingsCount[0];
    const listingsDailyRate = Number(lc.last_7d) / 7;
    const daysToPostgisTrigger = listingsDailyRate > 0
      ? Math.round((POSTGIS_TRIGGER_LISTINGS - Number(lc.total)) / listingsDailyRate)
      : Infinity;
    result.summary.listings = {
      total: Number(lc.total),
      last_7d: Number(lc.last_7d),
      daily_rate: Math.round(listingsDailyRate),
      days_to_postgis_trigger: daysToPostgisTrigger === Infinity ? 'no growth' : daysToPostgisTrigger,
      postgis_trigger_at: POSTGIS_TRIGGER_LISTINGS,
    };

    // ── 6. Storage growth projection — uses ACTUAL per-table avg row size
    //    (was: hardcoded estimates that wildly overshot the truth)
    // For each fast-growing table, multiply 7-day inserts by actual avg
    // row total size (incl. indexes + TOAST), divide by 7 for per-day MB.
    const listingsAvgKb = Number(jb.avg_raw_data_bytes) > 0
      ? Math.round(Number(jb.avg_raw_data_bytes) / 1024 * 10) / 10
      : 5;  // raw_data alone, KB
    // Add ~3KB scalar columns + ~2KB TOAST + ~10KB index overhead per listing
    const listingsTotalBytesPerRow = (listingsAvgKb + 3) * 1024 + 12_000;
    // audit_events avg from real table size
    const auditAvgRowBytes = Number(ae.total) > 0
      ? Math.round(Number(sizeRows.find((r) => r.table_name === 'audit_events')?.total_bytes || 0) / Number(ae.total))
      : 400;
    const growthBytesPer7d = (Number(ae.last_7d) * auditAvgRowBytes) + (Number(lc.last_7d) * listingsTotalBytesPerRow);
    const growthMbPerDay = (growthBytesPer7d / 7) / 1024 / 1024;
    const remainingMb = FREE_TIER_STORAGE_MB - dbMb;
    const daysToStorageCap = growthMbPerDay > 0 ? Math.round(remainingMb / growthMbPerDay) : Infinity;
    result.summary.growth_projection = {
      mb_per_day: Math.round(growthMbPerDay * 100) / 100,
      remaining_mb: Math.round(remainingMb * 10) / 10,
      days_to_storage_cap: daysToStorageCap === Infinity ? 'no growth' : daysToStorageCap,
      note: 'estimated from actual per-row averages — assumes constant new-listing rate. Trestle delta sync churns existing rows (UPDATE not INSERT) so actual MB/day may be lower.',
    };
    if (daysToStorageCap !== Infinity && daysToStorageCap < 30) {
      record('critical', `Storage cap reachable in ~${daysToStorageCap} days`,
        `${growthMbPerDay.toFixed(2)} MB/day at current insert rate. Verify by re-running this audit in 7 days; if growth stays this rate, plan upgrade or aggressive archive.`);
    } else if (daysToStorageCap !== Infinity && daysToStorageCap < 90) {
      record('warning', 'Storage cap reachable in <90 days at current burn',
        `${growthMbPerDay.toFixed(2)} MB/day, ${daysToStorageCap} days remaining`);
    }

    // ── 7. Recommendations ──────────────────────────────────────────────
    if (totalRawDataMb > 100 && Number(jb.row_count) > 10000) {
      result.recommendations.push({
        priority: 'high',
        action: 'Archive raw_data for closed/inactive listings',
        rationale: `${totalRawDataMb.toFixed(0)} MB in raw_data alone. Move closed-listing raw_data to JSONB column compression OR detach to cold storage.`,
        estimated_recovery_mb: Math.round(totalRawDataMb * 0.4),
      });
    }
    if (unusedIndexes.length > 0) {
      result.recommendations.push({
        priority: 'medium',
        action: `DROP ${unusedIndexes.length} unused indexes`,
        rationale: `Indexes ${unusedIndexes.map((r) => r.index_name).join(', ')} have idx_scan=0 in pg_stat_user_indexes — never queried.`,
        estimated_recovery_mb: Math.round(unusedIndexes.reduce((s, r) => s + Number(r.index_bytes) / 1024 / 1024, 0)),
      });
    }
    if (pctOfFree < 60 && daysToStorageCap !== Infinity && daysToStorageCap > 90) {
      result.recommendations.push({
        priority: 'info',
        action: 'No upgrade needed',
        rationale: `${pctOfFree.toFixed(0)}% of free tier with ${daysToStorageCap} days runway. Optimize first.`,
      });
    }

    // ── Determine exit code ─────────────────────────────────────────────
    const hasCritical = result.findings.some((f) => f.severity === 'critical');
    const hasWarning = result.findings.some((f) => f.severity === 'warning');
    const exitCode = hasCritical ? 2 : hasWarning ? 1 : 0;
    result.exit_code = exitCode;

    if (JSON_OUT) {
      console.log(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));
    } else {
      console.log('');
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║         Neon Deep Tier-Decision Audit                       ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log(`  Tier:         FREE`);
      console.log(`  Timestamp:    ${result.timestamp}`);
      console.log('');

      console.log(`── STORAGE ${'─'.repeat(48)}`);
      console.log(`  DB size:        ${dbMb.toFixed(1)} MB / ${FREE_TIER_STORAGE_MB} MB cap (${pctOfFree.toFixed(1)}%)`);
      console.log(`  Remaining:      ${remainingMb.toFixed(1)} MB`);
      console.log(`  Growth:         ${growthMbPerDay.toFixed(2)} MB/day`);
      console.log(`  Days to cap:    ${daysToStorageCap === Infinity ? 'no growth' : daysToStorageCap}`);
      console.log('');

      console.log(`── TOP TABLES ${'─'.repeat(45)}`);
      console.log(`  ${'name'.padEnd(28)} ${'total'.padStart(7)}     table  +  toast  +  idx     rows`);
      for (const t of result.summary.tables.slice(0, 7)) {
        console.log(`  ${t.name.padEnd(28)} ${String(t.total_mb).padStart(7)} MB  ${String(t.table_mb).padStart(6)} +  ${String(t.toast_mb).padStart(5)}  +  ${String(t.index_mb).padStart(5)}  ${t.rows} rows`);
      }
      console.log('');

      console.log(`── JSON BLOAT (listings.raw_data) ${'─'.repeat(25)}`);
      console.log(`  Total:          ${totalRawDataMb.toFixed(1)} MB across ${Number(jb.row_count)} rows`);
      console.log(`  Avg row:        ${(Number(jb.avg_raw_data_bytes)/1024).toFixed(1)} KB`);
      console.log(`  Max row:        ${(Number(jb.max_raw_data_bytes)/1024).toFixed(1)} KB`);
      console.log('');

      console.log(`── INDEXES (top 5) ${'─'.repeat(40)}`);
      for (const i of result.summary.top_indexes.slice(0, 5)) {
        const flag = i.scans === 0 ? ' \x1b[33m← never scanned\x1b[0m' : '';
        console.log(`  ${i.mb.toFixed(1).padStart(6)} MB  ${i.index.padEnd(40)}  ${i.scans} scans${flag}`);
      }
      console.log('');

      console.log(`── WRITE VOLUMES ${'─'.repeat(42)}`);
      console.log(`  audit_events:   ${Number(ae.total)} total, ${Math.round(auditDailyRate)}/day, ${daysToPartitionTrigger === Infinity ? '∞' : daysToPartitionTrigger} days to partition trigger (${PARTITION_TRIGGER_AUDIT_EVENTS})`);
      console.log(`  listings:       ${Number(lc.total)} total, ${Math.round(listingsDailyRate)}/day, ${daysToPostgisTrigger === Infinity ? '∞' : daysToPostgisTrigger} days to PostGIS trigger (${POSTGIS_TRIGGER_LISTINGS})`);
      console.log('');

      if (result.findings.length > 0) {
        console.log(`── FINDINGS ${'─'.repeat(47)}`);
        for (const f of result.findings) {
          const color = f.severity === 'critical' ? '\x1b[31m' : f.severity === 'warning' ? '\x1b[33m' : '\x1b[36m';
          console.log(`  ${color}[${f.severity.toUpperCase()}]\x1b[0m ${f.title}`);
          console.log(`           ${f.detail}`);
        }
        console.log('');
      }

      if (result.recommendations.length > 0) {
        console.log(`── RECOMMENDATIONS ${'─'.repeat(40)}`);
        for (const r of result.recommendations) {
          console.log(`  [${r.priority}] ${r.action}`);
          console.log(`           ${r.rationale}`);
          if (r.estimated_recovery_mb) console.log(`           est. recovery: ${r.estimated_recovery_mb} MB`);
        }
        console.log('');
      }

      console.log(`Exit code: ${exitCode} (${exitCode === 0 ? 'healthy' : exitCode === 1 ? 'warning' : 'critical'})`);
      console.log('');
    }

    process.exit(exitCode);
  } catch (e) {
    console.error('Audit failed:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(3);
  } finally {
    await prisma.$disconnect();
  }
})();
