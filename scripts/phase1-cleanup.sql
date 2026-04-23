-- ============================================================================
-- PHASE 1 — ONE-SHOT CLEANUP MIGRATION
-- ============================================================================
-- Purpose:
--   1. Backfill listings.status_changed_at (currently NULL on all 17,906 rows,
--      which breaks the data-retention cron's terminal-listing IDX-off logic
--      per REBNY RLS §2.05).
--   2. Reclaim dead-tuple bloat on listings (5.5%), leads (50.5%),
--      social_proof_cache (32.5%) via VACUUM FULL.
--
-- NOT in scope (deferred to Phase 3):
--   - Nulling listings.raw_data (readers exist in CRM + compliance audit route)
--   - Slimming listings.compliance JSON (readers exist in idx-display-gate.ts)
--
-- Execution:
--   psql "$DATABASE_URL" -f scripts/phase1-cleanup.sql
--   OR via Neon SQL editor, but NOTE: VACUUM FULL cannot run inside a transaction
--   so each block is annotated with its isolation requirement.
--
-- Runtime:
--   - Step 1 backfill: ~2-5 seconds for 17,906 rows (single UPDATE, uses indexed
--     modification_timestamp which is non-null on all rows).
--   - Step 2 VACUUM FULL listings: ~30-60 seconds, holds ACCESS EXCLUSIVE lock
--     on listings for the duration — public listing pages + CRM will 503 during
--     the lock window. Schedule for low-traffic window (3-5 AM ET).
--   - Step 2 VACUUM FULL leads + social_proof_cache: <1 second each.
--
-- Rollback:
--   - Step 1 is reversible: `UPDATE listings SET status_changed_at = NULL;`
--     (though this re-breaks the retention cron — don't do unless backing out
--     the Phase 1 data-retention change as well).
--   - Step 2 has no rollback — VACUUM FULL is a one-way compaction. There is
--     nothing to undo; the data is identical, only the physical storage changes.
--
-- Neon-specific:
--   - Freed disk is reclaimed at the Postgres layer immediately, but Neon's
--     billable storage meter may take up to 7 days to reflect the change due
--     to PITR branch retention. Free tier = 7 days PITR, Launch = 30 days.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — Backfill status_changed_at
-- Safe inside a transaction. Uses modification_timestamp (required, non-null)
-- as proxy for "last known transition date", falling back to updated_at then
-- created_at. This gives the retention cron a deterministic cutoff for the
-- REBNY RLS §2.05 24-hour IDX-off rule going forward.
-- ----------------------------------------------------------------------------

BEGIN;

UPDATE listings
SET status_changed_at = COALESCE(modification_timestamp, updated_at, created_at)
WHERE status_changed_at IS NULL;

-- Verification inside the same transaction — ROLLBACK if this doesn't match expectations
DO $$
DECLARE
  remaining_null INTEGER;
  total INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_null FROM listings WHERE status_changed_at IS NULL;
  SELECT COUNT(*) INTO total FROM listings;
  RAISE NOTICE 'status_changed_at backfill: % of % rows still NULL (expect 0)', remaining_null, total;
  IF remaining_null > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete — % rows still have NULL status_changed_at', remaining_null;
  END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- STEP 2 — VACUUM FULL on bloated tables
-- NOTE: Each VACUUM FULL must run OUTSIDE a transaction. If running via psql
-- \i or Neon SQL editor, these execute sequentially as individual statements.
-- ANALYZE is included to refresh planner statistics after the rewrite.
-- ----------------------------------------------------------------------------

-- listings — 231 MB, 5.5% dead (1,041 dead tuples). Largest reclaim target.
VACUUM (FULL, ANALYZE) listings;

-- leads — 184 KB, 50.5% dead (51 dead / 50 live). Over-updated table, needs rebuild.
VACUUM (FULL, ANALYZE) leads;

-- social_proof_cache — 120 KB, 32.5% dead (53 dead / 110 live). Cron-rewritten table.
VACUUM (FULL, ANALYZE) social_proof_cache;

-- Refresh stats on audit_events too (no FULL needed — 0 dead tuples) since the
-- Phase 0 data-retention deploy will start deleting rows > 2 years old.
ANALYZE audit_events;
