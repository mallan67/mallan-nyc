'use strict';
//
// scripts/archive-backlog-predicate.js
//
// Canonical archive-backlog predicate for OPERATIONAL MONITORING (scripts/ops-health.js).
//
// It MUST mirror the data-retention archiver's eligibility predicate
// (app/api/cron/data-retention/route.ts) EXACTLY, so the `archive_backlog` health metric counts
// the SAME population the nightly cron archives. If they diverge, the 500/run cap warning becomes
// blind. Archive Clock PR-2 (#415): with the flag ON, the cron now ages off the STABLE
// `terminal_since` clock; a narrow legacy monitor would report a different backlog (Codex P2 on
// PR #405, route.ts:181 — the same divergence hazard, now resolved against terminal_since).
//
// Reconciliation is enforced by tests/runtime/ops-health-archive-backlog.test.ts, which
// reads the archiver source and asserts the terminal-status set here matches it.
//
// STRICT BOUNDS — this module is monitoring-only:
//   * It NEVER reads, sets, or enables ARCHIVE_T180_BACKLOG_ENABLED (the caller passes
//     the already-resolved flag value in).
//   * It builds a READ-ONLY Prisma `where` for prisma.listing.count() — no archive run,
//     no UPDATE/strip, no env/Neon/Vercel/R2/cron mutation.
//   * Flag ON ages off `terminal_since` (the stable Archive Clock PR-1 column); flag OFF uses the
//     legacy `status_changed_at`. NEVER `updated_at` (bumped by unrelated rewrites → mis-ages backlog).

// Mirror of app/api/cron/data-retention/route.ts:22 TERMINAL_STATUSES (kept in sync by test).
const ARCHIVE_TERMINAL_STATUSES = [
  'Closed',
  'Sold',
  'Leased',
  'Rented',
  'Withdrawn',
  'Expired',
  // Both spellings — must stay identical to the cron's list and to
  // lib/retention/archive-terminals.ts (a mirror test enforces set AND
  // order). `Canceled` is the live Cotality value the Trestle sync writes
  // raw; `Cancelled` is the value the CRM write path invented. Monitoring
  // that knows one spelling reports a backlog smaller than the real one.
  'Canceled',
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

  // flag OFF (default): narrow legacy — only rows with a real status_changed_at older than cutoff.
  // flag ON: age off the STABLE terminal_since clock (Archive Clock PR-2, #415) — mirrors the
  // archiver exactly. terminal_since is set once on transition and never re-stamped by idx-sync;
  // NULL terminal_since fails `{ lt }` and is never counted (intended fail-safe — no invented dates).
  const dateEligibility = flagEnabled
    ? { terminal_since: { lt: cutoff } }
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
