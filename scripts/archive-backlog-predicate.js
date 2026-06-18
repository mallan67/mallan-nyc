'use strict';
//
// scripts/archive-backlog-predicate.js
//
// Canonical archive-backlog predicate for OPERATIONAL MONITORING (scripts/ops-health.js).
//
// It MUST mirror the data-retention archiver's eligibility predicate
// (app/api/cron/data-retention/route.ts — the merged PR #405 fix) EXACTLY, so the
// `archive_backlog` health metric counts the SAME population the nightly cron archives.
// If they diverge, the 500/run cap warning becomes blind: with the flag ON, the cron
// drains NULL-`status_changed_at` rows via `modification_timestamp` while a narrow
// monitor would still report `archive_backlog=0` (Codex P2 on PR #405, route.ts:181).
//
// Reconciliation is enforced by tests/runtime/ops-health-archive-backlog.test.ts, which
// reads the archiver source and asserts the terminal-status set here matches it.
//
// STRICT BOUNDS — this module is monitoring-only:
//   * It NEVER reads, sets, or enables ARCHIVE_T180_BACKLOG_ENABLED (the caller passes
//     the already-resolved flag value in).
//   * It builds a READ-ONLY Prisma `where` for prisma.listing.count() — no archive run,
//     no UPDATE/strip, no env/Neon/Vercel/R2/cron mutation.
//   * It uses `modification_timestamp` (Trestle source-of-truth clock, NOT NULL), NEVER
//     `updated_at` (which is bumped by unrelated rewrites and would mis-age the backlog).

// Mirror of app/api/cron/data-retention/route.ts:22 TERMINAL_STATUSES (kept in sync by test).
const ARCHIVE_TERMINAL_STATUSES = [
  'Closed',
  'Sold',
  'Leased',
  'Rented',
  'Withdrawn',
  'Expired',
  'Cancelled',
];

const ARCHIVE_CUTOFF_DAYS = 180;

/**
 * Build the read-only Prisma `where` for counting the T+180 archive backlog,
 * mirroring the archiver exactly.
 *
 * @param {{ flagEnabled: boolean, now: Date }} opts
 *   flagEnabled — the already-resolved ARCHIVE_T180_BACKLOG_ENABLED value (caller reads env).
 *   now — clock injection for deterministic tests.
 * @returns {object} a Prisma ListingWhereInput for prisma.listing.count().
 */
function buildArchiveBacklogWhere({ flagEnabled, now }) {
  const cutoff = new Date(now.getTime() - ARCHIVE_CUTOFF_DAYS * 24 * 60 * 60 * 1000);

  // flag OFF (default): narrow — only rows with a real status_changed_at older than cutoff.
  // flag ON: also include rows where status_changed_at IS NULL but the Trestle
  // modification_timestamp is older than cutoff (COALESCE(status_changed_at, modification_timestamp)).
  const dateEligibility = flagEnabled
    ? {
        OR: [
          { status_changed_at: { lt: cutoff } },
          { status_changed_at: null, modification_timestamp: { lt: cutoff } },
        ],
      }
    : { status_changed_at: { lt: cutoff } };

  return {
    status: { in: ARCHIVE_TERMINAL_STATUSES },
    sync_status: { not: 'archived' },
    ...dateEligibility,
  };
}

module.exports = {
  ARCHIVE_TERMINAL_STATUSES,
  ARCHIVE_CUTOFF_DAYS,
  buildArchiveBacklogWhere,
};
