-- ============================================================================
-- PHASE 1 — VERIFICATION SNAPSHOT
-- ============================================================================
-- Run this twice:
--   1. BEFORE applying phase1-cleanup.sql  — save output as phase1-before.txt
--   2. AFTER  applying phase1-cleanup.sql  — save output as phase1-after.txt
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/phase1-verify.sql > phase1-before.txt
--   psql "$DATABASE_URL" -f scripts/phase1-cleanup.sql
--   psql "$DATABASE_URL" -f scripts/phase1-verify.sql > phase1-after.txt
--   diff phase1-before.txt phase1-after.txt
--
-- Expected deltas:
--   - status_changed_at_null_count: 17906 → 0
--   - listings table size: ~231 MB → ~195-205 MB (reclaims ~25-35 MB)
--   - listings dead_tuple_pct: 5.5% → <1%
--   - leads dead_tuple_pct: 50.5% → <1%
--   - social_proof_cache dead_tuple_pct: 32.5% → <1%
--   - Total DB size: ~250 MB → ~215-220 MB
-- ============================================================================

-- 1. Total database size
SELECT
  'database_size' AS metric,
  pg_size_pretty(pg_database_size(current_database())) AS value;

-- 2. status_changed_at NULL count (the compliance gap)
SELECT
  'status_changed_at_null_count' AS metric,
  COUNT(*)::text AS value
FROM listings
WHERE status_changed_at IS NULL;

-- 3. status_changed_at coverage by status (after backfill all buckets = 0 null)
SELECT
  'status_changed_null_by_status:' || status AS metric,
  COUNT(*)::text AS value
FROM listings
WHERE status_changed_at IS NULL
GROUP BY status
ORDER BY status;

-- 4. Retention cron eligibility — closed listings past 24h window that the
-- cron should now flag for idx_display_yn = false (REBNY RLS §2.05)
--
-- 'Canceled' (single L) ADDED 2026-08-20. This list must mirror
-- app/api/cron/data-retention/route.ts TERMINAL_STATUSES exactly, and it did
-- not: the cron gained the live Cotality spelling 'Canceled' while this script
-- kept only the Mallan CRM spelling 'Cancelled'. A verification script that
-- under-counts is worse than no script — it reported the retention backlog as
-- CLEAR while provider-cancelled rows sat in it, i.e. it hid the very defect it
-- exists to find. Both spellings are required: mapTrestleToPrisma stores
-- StandardStatus verbatim ('Canceled') and the CRM writes 'Cancelled'.
--
-- Canonical set: lib/compliance/listing-status-vocabulary.ts TERMINAL_STATUSES.
-- SQL cannot import it, so this literal is pinned to it by
-- lib/compliance/__tests__/listing-status-spelling-closure.test.ts.
SELECT
  'retention_eligible_terminal_listings' AS metric,
  COUNT(*)::text AS value
FROM listings
WHERE status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled','Canceled')
  AND status_changed_at IS NOT NULL
  AND status_changed_at < NOW() - INTERVAL '24 hours'
  AND idx_display_yn = true;

-- 5. Bloat snapshot on the 3 target tables
SELECT
  'bloat:' || relname AS metric,
  'live=' || n_live_tup || ' dead=' || n_dead_tup ||
  ' dead_pct=' || COALESCE(ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1)::text, '0') || '%' AS value
FROM pg_stat_user_tables
WHERE relname IN ('listings', 'leads', 'social_proof_cache')
ORDER BY relname;

-- 6. Physical size of the 3 target tables
SELECT
  'size:' || relname AS metric,
  pg_size_pretty(pg_total_relation_size(c.oid)) || ' (toast=' ||
  pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)) || ')' AS value
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('listings', 'leads', 'social_proof_cache')
ORDER BY c.relname;

-- 7. Top 5 tables by total size (should remain same rank; listings should shrink)
SELECT
  'top_table_' || ROW_NUMBER() OVER (ORDER BY pg_total_relation_size(c.oid) DESC) AS metric,
  c.relname || ' = ' || pg_size_pretty(pg_total_relation_size(c.oid)) AS value
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 5;
