// scripts/ops-health.js — unified operational health check for the Neon + Trestle stack.
//
// Run on demand (or as a weekly cron) to see:
//   - Storage: DB size, top tables, growth velocity, listings/listing_media dead-tuple ratio
//   - Sync: last run status, error rate, watermark age (Property cron)
//   - Media sync (added 2026-05-22 per docs/incidents/2026-05-21-chronic-media-sync-root-cause.md):
//       * media_sync_state cursor staleness (RC1 — boundary-cluster deadlock detector)
//       * listing_media coverage of IDX-displayable + R2 cached coverage
//       * Public image usability (first image: R2 / Trestle proxy / empty)
//       * R2 mirror progress 24h (RC3 — retry purgatory detector)
//       * R2 retry backlog (rows with r2_attempts > 0)
//   - Retention: archive queue, compliance gap
//   - Upgrade triggers: which thresholds are approaching for Phase 6 decisions
//
// RC8 note (2026-05-22) — Vercel ↔ GitHub status integration drift:
//   Vercel preview builds may report state=READY on the Vercel side while
//   GitHub's legacy commit-Statuses API stays at context=Vercel state=pending
//   indefinitely. This script does NOT probe that integration (it is read-only
//   against Neon only), but operators should be aware that `gh pr checks`
//   reporting "Vercel: pending" forever is a documented chronic drift, not
//   an actual build failure. See docs/incidents/2026-05-21-chronic-media-sync-root-cause.md
//   §RC8 + Path B for the diagnostic chain and the recommended Vercel-side fix.
//
// SEPARATE-INCIDENT clarification (Maya, 2026-05-22):
//   The Vercel/Neon preview-branch stale integration and the media-cron
//   Neon compute burn (RC1/RC3) are SEPARATE incidents. The media cron is
//   NOT proven to cause the Vercel preview Neon branching status; the two
//   live at different layers (Vercel CI integration vs Neon production
//   workload). Do not conflate. Specifically:
//     1. The vercel.json buildCommand does NOT run migrations (verified
//        in NEON.md §3 Trap #1).
//     2. The GitHub check showing "Vercel: pending" reflects the legacy
//        Statuses API drift (RC8 above), not a Neon branch-limit failure.
//     3. Repo doc docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md
//        classifies the "Branch limit exceeded" symptom as stale
//        Vercel-Neon integration state, NOT actual branch exhaustion.
//     4. Actual documented branch count is 8 / 5000 (well under cap).
//     5. The media-backfill + media-sync crons (both formerly `*/15`)
//        are the real Neon compute risk because media-backfill runs
//        JSON-heavy scans against the 872 MB `Listing.media` column
//        (now mitigated by PR #176 which paused media-backfill).
//     6. There is a known Neon project-ID ambiguity (Vercel env
//        NEON_PROJECT_ID may point at the production DB project rather
//        than the integration's preview-branching project — see
//        NEON.md §11 "Known mismatch"); operator must verify against
//        the Vercel env + Neon Console read-only before any project-ID
//        change. Do NOT rotate project IDs without that verification.
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
const { deriveBranchPruneIssues } = require('./branch-prune-health');
const { R2_RETRY_EXHAUSTED_THRESHOLD, classifyR2RetryBacklog } = require('./r2-retry-health');
const { deriveImageIssues } = require('./media-image-health');
const { buildArchiveBacklogWhere } = require('./archive-backlog-predicate');
const prisma = new PrismaClient();

const JSON_OUT = process.argv.includes('--json');

// Launch-plan thresholds (2026-05-17 — migrated from Free).
// Storage cap is 10 GB; compute is 300 CU-hours/mo baseline + overage billing.
// Branch cap is 5000 per project. See
// docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md for current status.
//
// Field name notes (backwards compat):
//   - `storage_free_cap_mb` retained as the field name so the JSON output
//     shape stays stable for any downstream parser. Value is now the Launch
//     plan cap (10240 MB / 10 GB), not the Free plan cap (500 MB).
//   - `compute_free_cap_hours` likewise — value bumped from 191.9 to 300.
//   - A future PR may rename these fields to `storage_plan_cap_mb` /
//     `compute_plan_cap_hours` if a JSON-shape break is acceptable.
const THRESHOLDS = {
  storage_free_cap_mb: 10_240,        // Launch: 10 GB (was Free: 500 MB)
  storage_warning_pct: 0.70,          // warn at 70% of plan cap → 7 GB
  storage_upgrade_pct: 0.85,          // discuss Scale plan upgrade at 85% → 8.7 GB
  compute_free_cap_hours: 300,        // Launch: 300 CU-hr/mo (was Free: 191.9)
  compute_warning_hours: 240,         // 80% of 300
  branch_count_warning: 25,           // anomalous-growth signal (baseline ~8)
  branch_count_critical: 4000,        // 80% of 5000 plan cap → emergency
  sync_error_warn_24h: 20,
  sync_error_critical_24h: 100,
  sync_watermark_stale_hours: 2,      // no sync in 2h = stale
  archive_backlog_warn: 1000,         // over 1K eligible = cron caps need increase

  // ── Media-sync thresholds (added 2026-05-22 per RC1/RC3/RC4 of the
  //    canonical incident document). All read-only against existing tables.
  media_cursor_warn_hours: 1,                        // last_photos_change age > 1h = warn
  media_cursor_stale_hours: 2,                       // > 2h = critical (matches Property sync watermark)
  media_cursor_freeze_hours: 24,                     // > 24h = critical with explicit "boundary-cluster deadlock" pointer
  media_last_run_stale_hours: 1,                     // cron last_run_at > 1h ago = warn (it fires every 15 min)
  listing_media_coverage_warn_pct: 50,               // < 50% of IDX-displayable have listing_media rows
  listing_media_coverage_critical_pct: 30,
  r2_cached_coverage_warn_pct: 40,                   // < 40% have media_url_cached on listing_media
  // r2 retry-backlog thresholds moved to scripts/r2-retry-health.js (Lane-D
  // actionable/parked split; drift-guarded against lib/idx/media-sync).
  // no-usable-image thresholds moved to scripts/media-image-health.js (P1C5
  // table-aware split; the alarm keys off no_image_any_layer).
  listings_dead_tuple_warn_pct: 20,                  // listings table dead-tuple ratio > 20%
  listings_dead_tuple_critical_pct: 35,
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
      status: { in: ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Delete'] }, // = lib/listings/mallan-status.ts MALLAN_TERMINAL_STATUSES
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
      status: { in: ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Delete'] }, // = lib/listings/mallan-status.ts MALLAN_TERMINAL_STATUSES
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

  // Archive backlog — mirror the data-retention archiver predicate EXACTLY (PR #405),
  // so this count reflects the real population the nightly cron archives and the 500/run
  // cap warning below stays accurate (Codex P2 on PR #405, route.ts:181).
  //   - flag OFF (default): terminal AND status_changed_at < cutoff AND sync_status != archived
  //   - flag ON: also NULL-status_changed_at rows whose modification_timestamp < cutoff
  // READ-ONLY count. This script NEVER enables ARCHIVE_T180_BACKLOG_ENABLED or runs the archive;
  // it only reflects whichever predicate the cron is currently using. Never references updated_at.
  const archiveBacklogFlagEnabled = process.env.ARCHIVE_T180_BACKLOG_ENABLED === 'true';
  const archiveEligible = await prisma.listing.count({
    where: buildArchiveBacklogWhere({ flagEnabled: archiveBacklogFlagEnabled, now: new Date() }),
  });
  report.retention.archive_backlog = archiveEligible;
  report.retention.archive_backlog_predicate = archiveBacklogFlagEnabled
    ? 'stable-clock (ARCHIVE_T180_BACKLOG_ENABLED=true — terminal_since < cutoff)'
    : 'narrow (flag OFF / default — status_changed_at < cutoff only)';
  if (archiveEligible > THRESHOLDS.archive_backlog_warn) {
    report.issues.push({
      level: 'warning',
      category: 'retention',
      msg: `${archiveEligible} listings eligible for T+180d archive — cron cap (500/day) may not keep up`,
    });
  }

  // New stable-clock gauge (Archive Clock PR-2, #415): terminal rows still missing terminal_since.
  // These will NOT auto-archive under the flag-ON terminal_since predicate (intended fail-safe — no
  // invented dates). A high count means the gated backfill (PR-2 Gate 3) has not yet populated the
  // clock. READ-ONLY count. The legacy listings_missing_status_changed gauge above is kept for one
  // release for comparison so health and cron both track the new clock without drifting.
  //
  // CANONICAL terminal set BY DESIGN: this gauge mirrors the archive cron's terminal predicate
  // (data-retention route + archive-backlog-predicate.js), which is canonical case-sensitive
  // `status IN (...)`. Keeping it canonical preserves health↔cron coherence — the gauge must count
  // exactly the population the cron can archive, NOT a broader set. The backfill is alias-aware
  // (lower()+`canceled`), so it could populate terminal_since on a non-canonical row the cron would
  // never archive; that backfill-vs-archiver mismatch is latent (prod blast radius 0 today) and is
  // tracked separately in #449 — it touches §2.05/archive compliance and must be its own gated change.
  // Do NOT make this gauge alias-aware here (it would over-report rows the cron can't drain).
  const terminalMissingClock = await prisma.listing.count({
    where: {
      status: { in: ['Closed', 'Sold', 'Leased', 'Rented', 'Withdrawn', 'Expired', 'Cancelled', 'Delete'] }, // = lib/listings/mallan-status.ts MALLAN_TERMINAL_STATUSES
      sync_status: { not: 'archived' },
      terminal_since: null,
    },
  });
  report.retention.listings_terminal_missing_terminal_since = terminalMissingClock;
  // Gate the warning to ACTIONABILITY (Codex #448 finding A): a NULL terminal_since count is the
  // EXPECTED pre-backfill state while ARCHIVE_T180_BACKLOG_ENABLED is OFF — emitting a warning then
  // would make `ops:health` exit 1 right after PR-2 merge for a state no operator can remediate yet
  // (the gated backfill is PR-2 Gate 3). Only warn once the flag is ON, i.e. when terminal_since
  // actually gates archiving and a NULL clock is an actionable backlog. The count is ALWAYS recorded
  // as an informational gauge above regardless of flag.
  if (archiveBacklogFlagEnabled && terminalMissingClock > 0) {
    report.issues.push({
      level: 'warning',
      category: 'retention',
      msg: `${terminalMissingClock} terminal listings have NULL terminal_since while ARCHIVE_T180_BACKLOG_ENABLED=true — run the Archive Clock PR-2 Gate 3 backfill; these rows will NOT auto-archive until the clock is populated`,
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
  //   - critical if last status is `refused` (Phase 0.5 guard: NEON_PROJECT_ID is
  //     non-canonical, so the fail-closed guard blocks every prune — must not be
  //     silent, since a refused run is recent and carries no examined count)
  //   - warning  if last successful run >25h ago (cron stopped firing)
  //   - warning  if last run had errors_count > 0 (some deletes failed)
  //   - warning  if examined branch count >= branch_count_warning (25):
  //     anomalous-growth signal — preview-branch creation has accelerated
  //     above the steady-state baseline of ~8, even though the Launch
  //     plan cap of 5000 is nowhere near hit
  //   - critical if examined branch count >= branch_count_critical (4000):
  //     approaching the Launch plan cap of 5000 — operator must act
  //
  // The prior silent-skip behavior (return 200 + no audit event) was
  // invisible to every observation surface; this section closes that
  // gap so a future env-var misconfiguration cannot persist for 2+ weeks.
  // The branch-count thresholds were updated 2026-05-17 from the
  // free-tier `>=8` (within-2-of-10-cap) framing to the Launch-plan
  // hygiene framing — see docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md.
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
        // Defensive: cap error string at 200 chars in the report payload.
        // Neon API errors built by lib/neon/branches.ts already truncate
        // the response body to 200, but a different exception class
        // could carry a larger message. Truncating here makes ops:health
        // output bounded regardless of source.
        error: typeof lastPrune.changes?.error === 'string'
          ? lastPrune.changes.error.slice(0, 200)
          : undefined,
      };
      // Status->issue policy lives in the pure, unit-tested helper
      // scripts/branch-prune-health.js (incl. the Phase 0.5 `refused` branch).
      for (const issue of deriveBranchPruneIssues({
        status,
        ageHours: ageH,
        examined: lastPrune.changes?.examined,
        errorsCount: lastPrune.changes?.errors_count,
        error: lastPrune.changes?.error,
        missing: lastPrune.changes?.missing,
        projectId: lastPrune.changes?.project_id,
        thresholds: THRESHOLDS,
      })) {
        report.issues.push(issue);
      }
    }
  } catch (e) {
    // Don't let audit-event read failures break the rest of ops:health.
    if (!e.message?.includes('does not exist')) {
      report.branch_prune = { error: e.message };
    }
  }

  // ─── Media Sync Health (added 2026-05-22) ────────────────────────
  // Read-only checks against `media_sync_state`, `listing_media`, `listings`,
  // and `audit_events`. Catches the chronic patterns documented in
  // docs/incidents/2026-05-21-chronic-media-sync-root-cause.md:
  //   RC1 — Phase 1 boundary-cluster cursor deadlock
  //   RC3 — Phase 3 R2 mirror retry purgatory
  //   RC4 — Storage bloat (dead-tuple, see Storage extension below)
  //   RC6 — Observability gap (this block IS the closure)
  report.media_sync = {};
  try {
    const mediaCursor = await prisma.mediaSyncState.findUnique({ where: { resource: 'Media' } });
    if (!mediaCursor) {
      report.media_sync.state = 'not_yet_populated';
      report.issues.push({
        level: 'warning',
        category: 'media-sync',
        msg: 'media_sync_state row for resource=Media does not exist — media-sync cron has never run',
      });
    } else {
      const cursorAgeH = hoursAgo(mediaCursor.last_photos_change);
      const runAgeH = hoursAgo(mediaCursor.last_run_at);
      report.media_sync.last_photos_change = mediaCursor.last_photos_change;
      report.media_sync.cursor_age_hours = cursorAgeH !== null ? Number(cursorAgeH.toFixed(1)) : null;
      report.media_sync.last_media_modified = mediaCursor.last_media_modified;
      report.media_sync.last_run_at = mediaCursor.last_run_at;
      report.media_sync.last_run_status = mediaCursor.last_run_status;
      report.media_sync.last_run_hours_ago = runAgeH !== null ? Number(runAgeH.toFixed(1)) : null;
      report.media_sync.rows_checked_last_run = Number(mediaCursor.rows_checked);
      report.media_sync.rows_updated_last_run = Number(mediaCursor.rows_updated);
      report.media_sync.rows_failed_last_run = Number(mediaCursor.rows_failed);

      // Cursor staleness — the chronic-freeze detector (RC1).
      if (cursorAgeH !== null && cursorAgeH > THRESHOLDS.media_cursor_freeze_hours) {
        report.issues.push({
          level: 'critical',
          category: 'media-sync',
          msg: `media-sync cursor (last_photos_change) is ${cursorAgeH.toFixed(1)}h stale (> ${THRESHOLDS.media_cursor_freeze_hours}h) — likely Phase 1 boundary-cluster deadlock; see docs/incidents/2026-05-21-chronic-media-sync-root-cause.md RC1`,
        });
      } else if (cursorAgeH !== null && cursorAgeH > THRESHOLDS.media_cursor_stale_hours) {
        report.issues.push({
          level: 'critical',
          category: 'media-sync',
          msg: `media-sync cursor stale (${cursorAgeH.toFixed(1)}h > ${THRESHOLDS.media_cursor_stale_hours}h)`,
        });
      } else if (cursorAgeH !== null && cursorAgeH > THRESHOLDS.media_cursor_warn_hours) {
        report.issues.push({
          level: 'warning',
          category: 'media-sync',
          msg: `media-sync cursor warming-stale (${cursorAgeH.toFixed(1)}h > ${THRESHOLDS.media_cursor_warn_hours}h)`,
        });
      }

      // Last-run heartbeat — the cron should fire every 15 min.
      if (runAgeH !== null && runAgeH > THRESHOLDS.media_last_run_stale_hours) {
        report.issues.push({
          level: 'warning',
          category: 'media-sync',
          msg: `media-sync cron last fired ${runAgeH.toFixed(1)}h ago — schedule is every 15 min, expected < 1h`,
        });
      }
    }

    // listing_media coverage on IDX-displayable listings.
    const [coverageRow] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS idx_displayable,
        (COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM listing_media lm
          WHERE lm.listing_id = l.listing_id AND lm.status = 'active'
        )))::int AS with_active_listing_media,
        (COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM listing_media lm
          WHERE lm.listing_id = l.listing_id AND lm.status = 'active' AND lm.media_url_cached IS NOT NULL
        )))::int AS with_r2_cached_listing_media
      FROM listings l
      WHERE l.idx_display_yn = true
    `);
    const idxDisp = Number(coverageRow.idx_displayable);
    const withLM = Number(coverageRow.with_active_listing_media);
    const withR2 = Number(coverageRow.with_r2_cached_listing_media);
    const coveragePct = idxDisp > 0 ? (100 * withLM / idxDisp) : 0;
    const r2CovPct = idxDisp > 0 ? (100 * withR2 / idxDisp) : 0;
    report.media_sync.idx_displayable_total = idxDisp;
    report.media_sync.with_active_listing_media = withLM;
    report.media_sync.with_r2_cached_listing_media = withR2;
    report.media_sync.listing_media_coverage_pct = Number(coveragePct.toFixed(1));
    report.media_sync.r2_cached_coverage_pct = Number(r2CovPct.toFixed(1));
    if (coveragePct < THRESHOLDS.listing_media_coverage_critical_pct) {
      report.issues.push({
        level: 'critical',
        category: 'media-sync',
        msg: `listing_media coverage ${coveragePct.toFixed(1)}% of ${idxDisp} IDX-displayable (critical < ${THRESHOLDS.listing_media_coverage_critical_pct}%)`,
      });
    } else if (coveragePct < THRESHOLDS.listing_media_coverage_warn_pct) {
      report.issues.push({
        level: 'warning',
        category: 'media-sync',
        msg: `listing_media coverage ${coveragePct.toFixed(1)}% of ${idxDisp} IDX-displayable (warn < ${THRESHOLDS.listing_media_coverage_warn_pct}%)`,
      });
    }
    if (r2CovPct < THRESHOLDS.r2_cached_coverage_warn_pct) {
      report.issues.push({
        level: 'warning',
        category: 'media-sync',
        msg: `R2 cached coverage ${r2CovPct.toFixed(1)}% of IDX-displayable (warn < ${THRESHOLDS.r2_cached_coverage_warn_pct}%) — many listings still depend on legacy Listing.media JSON fallback`,
      });
    }

    // Public image usability — TRUE first-image classification on
    // IDX-displayable listings. Codex P2 fix on PR #178 (b3ab86da):
    // the prior shape used `media::text LIKE '%r2.dev%'` which would
    // classify a listing as "R2" if ANY url in the array matched the
    // R2 domain, even when the user-visible first image was Trestle/
    // proxy. That hid fallback dependency during incident monitoring.
    //
    // New shape extracts `media->0` and reads its `url` / `MediaURL`
    // field (different writer code paths use different casing — the
    // legacy idx-sync writes `{url, mediaType, order}`, raw Trestle
    // batches sometimes write `{MediaURL, MediaCategory, ...}`).
    // COALESCE picks whichever the row actually has. Buckets are now
    // mutually exclusive and exhaustive across IDX-displayable rows.
    const [imgRow] = await prisma.$queryRawUnsafe(`
      SELECT
        (COUNT(*) FILTER (
          WHERE media IS NULL OR jsonb_typeof(media) != 'array' OR jsonb_array_length(media) = 0
        ))::int AS empty_media,
        (COUNT(*) FILTER (
          WHERE (media IS NULL OR jsonb_typeof(media) != 'array' OR jsonb_array_length(media) = 0)
            AND EXISTS (SELECT 1 FROM listing_media lm WHERE lm.listing_id = listings.listing_id AND lm.status = 'active'
              AND LOWER(COALESCE(lm.media_type, '')) IN ('photo', 'image', '') AND COALESCE(lm.media_url_cached, lm.media_url_original) IS NOT NULL)
        ))::int AS json_empty_table_served,
        (COUNT(*) FILTER (
          WHERE (media IS NULL OR jsonb_typeof(media) != 'array' OR jsonb_array_length(media) = 0)
            AND NOT EXISTS (SELECT 1 FROM listing_media lm WHERE lm.listing_id = listings.listing_id AND lm.status = 'active'
              AND LOWER(COALESCE(lm.media_type, '')) IN ('photo', 'image', '') AND COALESCE(lm.media_url_cached, lm.media_url_original) IS NOT NULL)
        ))::int AS no_image_any_layer,
        (COUNT(*) FILTER (
          WHERE jsonb_typeof(media) = 'array' AND jsonb_array_length(media) > 0
            AND (
              COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%r2.dev%'
              OR COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%images.mallan.nyc%'
            )
        ))::int AS first_image_r2,
        (COUNT(*) FILTER (
          WHERE jsonb_typeof(media) = 'array' AND jsonb_array_length(media) > 0
            AND (
              COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%cotality.com%'
              OR COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%corelogic.com%'
            )
            AND NOT (
              COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%r2.dev%'
              OR COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%images.mallan.nyc%'
            )
        ))::int AS first_image_trestle_proxy,
        (COUNT(*) FILTER (
          WHERE jsonb_typeof(media) = 'array' AND jsonb_array_length(media) > 0
            AND NOT (
              COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%r2.dev%'
              OR COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%images.mallan.nyc%'
              OR COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%cotality.com%'
              OR COALESCE(media->0->>'url', media->0->>'MediaURL', '') LIKE '%corelogic.com%'
            )
        ))::int AS first_image_other
      FROM listings WHERE idx_display_yn = true
    `);
    report.media_sync.first_image_r2 = Number(imgRow.first_image_r2);
    report.media_sync.first_image_trestle_proxy = Number(imgRow.first_image_trestle_proxy);
    report.media_sync.first_image_empty = Number(imgRow.empty_media);
    report.media_sync.first_image_other = Number(imgRow.first_image_other);
    // Conservative lower bound on "no usable image": only the empty-media set
    // is definitively unusable. Trestle-proxy URLs may still render via the
    // proxy if Trestle hasn't rotated them; R2 URLs are stable.
    // P1C5 (L11): the ALARM keys off no_image_any_layer — the real render-path
    // placeholder count (JSON empty AND no active listing_media row). The
    // legacy JSON-empty count stays reported (lower_bound semantics now: it is
    // an UPPER bound on JSON-layer emptiness, not render-path truth) so the
    // table-served residue stays observable — re-labeled, never hidden.
    report.media_sync.first_image_table_served = Number(imgRow.json_empty_table_served);
    report.media_sync.no_image_any_layer = Number(imgRow.no_image_any_layer);
    report.media_sync.idx_displayable_no_usable_image_lower_bound = Number(imgRow.no_image_any_layer);
    report.issues.push(
      ...deriveImageIssues({ noImageAnyLayer: Number(imgRow.no_image_any_layer) }),
    );
    // R2 mirror progress — last 24h (from media_sync_cron audit events).
    const [r2_24h] = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(SUM((changes->>'r2_mirrored')::int), 0)::int AS r2_mirrored_24h,
        COALESCE(SUM((changes->>'r2_failed')::int), 0)::int   AS r2_failed_24h,
        COALESCE(SUM((changes->>'r2_skipped')::int), 0)::int  AS r2_skipped_24h,
        COUNT(*)::int                                          AS firings_24h
      FROM audit_events
      WHERE action = 'media_sync_cron'
        AND created_at > (NOW() - INTERVAL '24 hours')
    `);
    const r2Mirrored = Number(r2_24h.r2_mirrored_24h);
    const r2Failed   = Number(r2_24h.r2_failed_24h);
    const r2Skipped  = Number(r2_24h.r2_skipped_24h);
    const firings    = Number(r2_24h.firings_24h);
    report.media_sync.r2_mirrored_24h = r2Mirrored;
    report.media_sync.r2_failed_24h = r2Failed;
    report.media_sync.r2_skipped_24h = r2Skipped;
    report.media_sync.media_sync_firings_24h = firings;
    if (firings > 0 && r2Mirrored === 0 && r2Failed > 0) {
      report.issues.push({
        level: 'critical',
        category: 'media-sync',
        msg: `R2 mirror 24h: 0 succeeded, ${r2Failed} failed across ${firings} cron firings — Phase 3 retry purgatory (RC3)`,
      });
    } else if (r2Failed > 5 * Math.max(r2Mirrored, 1)) {
      report.issues.push({
        level: 'warning',
        category: 'media-sync',
        msg: `R2 mirror 24h failure ratio: ${r2Failed} failed vs ${r2Mirrored} mirrored (warn ratio > 5)`,
      });
    }

    // R2 retry backlog — Lane-D split (RC3 §10 follow-up): ACTIONABLE rows
    // (still in the Phase-3 retry budget) drive the historical 50/500 alarms;
    // PARKED retry-exhausted rows (r2_attempts >= 8, intentionally not
    // retried, still displayable via proxy) get a separate fail-closed growth
    // guard. Legacy total retained for continuity. Threshold mirrors
    // lib/idx/media-sync R2_RETRY_EXHAUSTED_THRESHOLD via the drift-guarded
    // scripts/r2-retry-health module.
    const [retryRow] = await prisma.$queryRawUnsafe(`
      SELECT
        (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND status = 'active'))::int AS rows_with_attempts,
        (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND r2_attempts < ${R2_RETRY_EXHAUSTED_THRESHOLD} AND status = 'active'))::int AS rows_actionable,
        (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts >= ${R2_RETRY_EXHAUSTED_THRESHOLD} AND status = 'active'))::int AS rows_parked,
        (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts >= 3 AND status = 'active'))::int AS rows_at_or_above_threshold,
        MIN(r2_last_attempt_at) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND status = 'active') AS oldest_last_attempt,
        MAX(r2_last_attempt_at) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND status = 'active') AS newest_last_attempt
      FROM listing_media
    `);
    report.media_sync.r2_retry_backlog = Number(retryRow.rows_with_attempts);
    report.media_sync.r2_retry_backlog_actionable = Number(retryRow.rows_actionable);
    report.media_sync.r2_retry_parked = Number(retryRow.rows_parked);
    report.media_sync.r2_above_tombstone_threshold = Number(retryRow.rows_at_or_above_threshold);
    report.media_sync.r2_retry_backlog_oldest = retryRow.oldest_last_attempt;
    report.media_sync.r2_retry_backlog_newest = retryRow.newest_last_attempt;
    report.issues.push(
      ...classifyR2RetryBacklog({
        actionable: Number(retryRow.rows_actionable),
        parked: Number(retryRow.rows_parked),
      }),
    );
  } catch (e) {
    if (e.message?.includes('does not exist')) {
      report.media_sync.state = 'pre_migration';
      report.media_sync.note = 'media_sync_state / listing_media table not yet migrated';
    } else {
      report.media_sync.error = e.message;
      report.issues.push({
        level: 'warning',
        category: 'media-sync',
        msg: `Media-sync health probe error: ${e.message}`,
      });
    }
  }

  // ─── Storage extension — table health (dead-tuple ratio) ─────────
  // Added 2026-05-22 per RC4 of the canonical incident doc. listings table
  // bloated to 872 MB despite media JSON being only 13 MB; root driver is
  // 663K+ UPDATEs with zero manual VACUUM FULL ever. This block surfaces
  // dead-tuple ratio so the next bloat episode is detected within hours,
  // not 23 days. Read-only — pg_stat_user_tables is a system catalog view.
  try {
    const tableHealth = await prisma.$queryRawUnsafe(`
      SELECT
        relname,
        n_live_tup, n_dead_tup,
        CASE WHEN (n_live_tup + n_dead_tup) > 0
          THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)::float
          ELSE 0::float END AS dead_pct,
        last_vacuum, last_autovacuum,
        vacuum_count, autovacuum_count
      FROM pg_stat_user_tables
      WHERE relname IN ('listings', 'listing_media')
    `);
    report.storage.table_health = tableHealth.map((t) => ({
      table: t.relname,
      live: Number(t.n_live_tup),
      dead: Number(t.n_dead_tup),
      dead_pct: Number(t.dead_pct),
      last_vacuum: t.last_vacuum,
      last_autovacuum: t.last_autovacuum,
      manual_vacuum_count: Number(t.vacuum_count),
      autovacuum_count: Number(t.autovacuum_count),
    }));
    const listingsHealth = tableHealth.find((t) => t.relname === 'listings');
    const listingMediaHealth = tableHealth.find((t) => t.relname === 'listing_media');
    if (listingsHealth && Number(listingsHealth.dead_pct) >= THRESHOLDS.listings_dead_tuple_critical_pct) {
      report.issues.push({
        level: 'critical',
        category: 'storage',
        msg: `listings table dead-tuple ratio ${listingsHealth.dead_pct}% (critical >= ${THRESHOLDS.listings_dead_tuple_critical_pct}%) — VACUUM FULL needed; see docs/incidents/2026-05-21-chronic-media-sync-root-cause.md RC4`,
      });
    } else if (listingsHealth && Number(listingsHealth.dead_pct) >= THRESHOLDS.listings_dead_tuple_warn_pct) {
      report.issues.push({
        level: 'warning',
        category: 'storage',
        msg: `listings table dead-tuple ratio ${listingsHealth.dead_pct}% (warn >= ${THRESHOLDS.listings_dead_tuple_warn_pct}%) — schedule VACUUM FULL window`,
      });
    }
    if (listingMediaHealth && Number(listingMediaHealth.dead_pct) >= THRESHOLDS.listings_dead_tuple_warn_pct) {
      report.issues.push({
        level: 'warning',
        category: 'storage',
        msg: `listing_media table dead-tuple ratio ${listingMediaHealth.dead_pct}% (warn >= ${THRESHOLDS.listings_dead_tuple_warn_pct}%)`,
      });
    }
  } catch (e) {
    if (!e.message?.includes('does not exist')) {
      report.storage.table_health_error = e.message;
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
      msg: `Storage at ${report.storage.pct_of_free}% of Launch plan cap — review Scale-plan upgrade triggers in architecture doc §6`,
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
  console.log(`  DB size: ${r.storage.db_size_mb} MB (${r.storage.pct_of_free}% of ${r.storage.free_cap_mb} MB Launch plan cap)`);
  console.log('  Top 5 tables:');
  r.storage.top_5_tables.forEach((t) => console.log(`    ${t.table.padEnd(30)} ${t.size_mb} MB`));
  if (Array.isArray(r.storage.table_health) && r.storage.table_health.length) {
    console.log('  Table health (dead-tuple ratio):');
    r.storage.table_health.forEach((t) => {
      const vacuumSrc = t.last_vacuum || t.last_autovacuum;
      const lv = vacuumSrc ? new Date(vacuumSrc).toISOString().slice(0, 19) + 'Z' : 'never';
      console.log(`    ${t.table.padEnd(20)} live=${t.live} dead=${t.dead} (${t.dead_pct}%) · manual VACUUM=${t.manual_vacuum_count} · last_vacuum=${lv}`);
    });
  } else if (r.storage.table_health_error) {
    console.log(`  Table health: (read error: ${r.storage.table_health_error})`);
  }

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
  console.log(`  Terminal listings missing terminal_since: ${r.retention.listings_terminal_missing_terminal_since ?? 0}`);
  console.log(`  REBNY §2.05 violations (terminal >24h, IDX on): ${r.retention.rebny_sec_2_05_violations ?? 0}`);
  console.log(`  T+180d archive backlog: ${r.retention.archive_backlog ?? 0}`);
  if (r.retention.archive_backlog_predicate) {
    console.log(`    predicate: ${r.retention.archive_backlog_predicate}`);
  }
  if (r.retention.listings_archived_total !== undefined) {
    console.log(`  Archived total: ${r.retention.listings_archived_total}`);
  }

  if (r.media_sync && Object.keys(r.media_sync).length) {
    console.log('\n── MEDIA SYNC ────────────────────────────────────');
    const ms = r.media_sync;
    if (ms.state === 'pre_migration' || ms.state === 'not_yet_populated') {
      console.log(`  State: ${ms.state}${ms.note ? ` — ${ms.note}` : ''}`);
    } else if (ms.error) {
      console.log(`  (probe error: ${ms.error})`);
    } else {
      if (ms.last_photos_change) {
        const cursorAge = ms.cursor_age_hours;
        const stale = cursorAge !== null && cursorAge > THRESHOLDS.media_cursor_warn_hours;
        console.log(`  Cursor (last_photos_change): ${new Date(ms.last_photos_change).toISOString().slice(0, 19) + 'Z'} (${cursorAge}h ago${stale ? ' ⚠️' : ''})`);
      }
      if (ms.last_media_modified) {
        console.log(`  Cursor (last_media_modified): ${new Date(ms.last_media_modified).toISOString().slice(0, 19) + 'Z'}`);
      }
      if (ms.last_run_at) {
        console.log(`  Last run: ${new Date(ms.last_run_at).toISOString().slice(0, 19) + 'Z'} (${ms.last_run_hours_ago}h ago) · status=${ms.last_run_status}`);
        console.log(`  Last run counters: checked=${ms.rows_checked_last_run} updated=${ms.rows_updated_last_run} failed=${ms.rows_failed_last_run}`);
      }
      if (ms.idx_displayable_total !== undefined) {
        console.log(`  IDX-displayable total: ${ms.idx_displayable_total}`);
        console.log(`    with listing_media (active): ${ms.with_active_listing_media} (${ms.listing_media_coverage_pct}%)`);
        console.log(`    with R2 cached: ${ms.with_r2_cached_listing_media} (${ms.r2_cached_coverage_pct}%)`);
      }
      if (ms.first_image_r2 !== undefined) {
        console.log(`  First image classification (media->0 ‘url’ / ‘MediaURL’ on IDX-displayable):`);
        console.log(`    R2 URL:           ${ms.first_image_r2}`);
        console.log(`    Trestle/proxy:    ${ms.first_image_trestle_proxy}`);
        console.log(`    JSON-empty but TABLE-served: ${ms.first_image_table_served} (renders fine via listing_media — not alarmed)`);
        console.log(`    NO image any layer: ${ms.no_image_any_layer} (true placeholder count — drives the alarm)`);
        console.log(`    other URL host:   ${ms.first_image_other ?? 0}`);
        console.log(`    empty (no image): ${ms.first_image_empty}`);
      }
      if (ms.r2_mirrored_24h !== undefined) {
        console.log(`  R2 mirror 24h: mirrored=${ms.r2_mirrored_24h} failed=${ms.r2_failed_24h} skipped=${ms.r2_skipped_24h} (across ${ms.media_sync_firings_24h} cron firings)`);
      }
      if (ms.r2_retry_backlog !== undefined) {
        const oldest = ms.r2_retry_backlog_oldest ? new Date(ms.r2_retry_backlog_oldest).toISOString().slice(0, 19) + 'Z' : 'n/a';
        const newest = ms.r2_retry_backlog_newest ? new Date(ms.r2_retry_backlog_newest).toISOString().slice(0, 19) + 'Z' : 'n/a';
        console.log(`  R2 retry backlog: actionable=${ms.r2_retry_backlog_actionable} · parked=${ms.r2_retry_parked} (exhausted ≥${R2_RETRY_EXHAUSTED_THRESHOLD}, displayable via proxy) · total=${ms.r2_retry_backlog} · oldest=${oldest} newest=${newest}`);
      }
    }
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
      } else if (r.branch_prune.status === 'error') {
        console.log(`  ❌ Threw exception — error: ${r.branch_prune.error ?? 'unknown'}`);
      } else if (r.branch_prune.examined !== undefined) {
        console.log(`  Examined: ${r.branch_prune.examined} · pruned: ${r.branch_prune.pruned_count ?? 0} · errors: ${r.branch_prune.errors_count ?? 0}`);
      }
    }
  }

  console.log('\n── PHASE 6 TRIGGERS ─────────────────────────────');
  console.log(`  Total listings: ${r.triggers.total_listings} (PostGIS trigger at 50,000)`);
  console.log(`  Total audit events: ${r.triggers.total_audit_events} (partition trigger at 10,000,000)`);
  console.log(`  Storage warning: ${r.triggers.storage_warning ? 'YES' : 'no'}`);
  console.log(`  Upgrade to Scale plan needed: ${r.triggers.storage_upgrade_needed ? 'YES — 85%+ of Launch cap sustained' : 'no'}`);

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
