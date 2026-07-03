-- ============================================================================
-- ROYAL-DAWN BRANCH — READ-ONLY CONSOLE QUERY PACK   (2026-06-02, REPORT ONLY)
-- ============================================================================
-- PURPOSE: Quantify everything production WROTE to the stale royal-dawn branch
--          after the cutover (~2026-06-01 06:30Z), so the orphaned-write set is
--          sized BEFORE any DATABASE_URL re-point. This is the §12 P5 hand-off
--          from docs/neon-prod-db-reconciliation-plan-2026-06-02.md.
--
-- WHERE TO RUN: Neon Console -> project morning-bread-68708332 (PRODUCTION)
--               -> SQL Editor -> select the **royal-dawn** branch/endpoint
--               (ep-royal-dawn-ad6eh8t2). Confirm with BLOCK 0 before trusting
--               any other result.
--
-- SAFETY: SELECT-only. No INSERT/UPDATE/DELETE, no DDL, no locks beyond normal
--         MVCC reads. Nothing here mutates data, schema, or branch state.
--
-- CUTOVER BOUNDARY used throughout: 2026-06-01 06:30:00+00 (inclusive lower bound;
--         actual rotation success logged 06:35:28Z, last cold-waterfall write 06:31Z).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 0 — AM I ON THE RIGHT BRANCH?  (run FIRST)
-- ----------------------------------------------------------------------------
-- Identity + a fingerprint that distinguishes the two branches by their DATA.
--   * royal-dawn (stale)  -> has_trestle_mls_id_col = false, crm_exclusives = 0
--   * cold-waterfall(live)-> has_trestle_mls_id_col = true,  crm_exclusives = 4
-- If this block shows the live fingerprint, STOP: you selected the wrong branch.
SELECT
  current_database()                                              AS db,
  current_user                                                    AS usr,
  now()                                                           AS server_now,
  version()                                                       AS pg_version,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='agents'
             AND column_name='trestle_mls_id')                    AS has_trestle_mls_id_col,
  (SELECT count(*) FROM listings
     WHERE listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%')      AS crm_exclusives;
-- Neon branch id (may be blank if the GUC is not exposed — that's fine):
SELECT current_setting('neon.branch_id', true) AS neon_branch_id_guc;


-- ----------------------------------------------------------------------------
-- BLOCK 1 — SCHEMA PRESENCE (the P2022 trigger)
-- ----------------------------------------------------------------------------
-- Expect ON ROYAL-DAWN: zero rows (column absent) -> confirms the 500 root cause.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='agents' AND column_name='trestle_mls_id';


-- ----------------------------------------------------------------------------
-- BLOCK 2 — EXISTENCE DISCOVERY (which compliance/user-write tables exist here)
-- ----------------------------------------------------------------------------
-- royal-dawn is an OLDER branch and may be missing tables that exist on
-- cold-waterfall. This lists which target tables are present + whether they
-- carry created_at / updated_at, so the later blocks can't error on a missing
-- relation.
SELECT t.table_name,
       bool_or(c.column_name='created_at') AS has_created_at,
       bool_or(c.column_name='updated_at') AS has_updated_at
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
  ON c.table_schema=t.table_schema AND c.table_name=t.table_name
WHERE t.table_schema='public'
  AND t.table_name IN (
    'leads','lead_parties','lead_scores','seller_leads','inquiries','contacts',
    'audit_events','activity_logs','engagement_events','intent_events','behavioral_events',
    'portal_events','outreach_events','notifications','notification_preferences',
    'client_preferences','client_listing_actions','document_signatures','documents',
    'offers','deals','showings','showing_feedback','showing_history','cma_reports',
    'saved_searches','demand_alerts','micro_commitments','users','agents','sessions',
    'mfa_sessions','campaigns','campaign_recipients','marketing_activities',
    'listings','listing_media','listing_views','listing_audits','listing_search_projection',
    'external_listings','external_listing_comments','buildings','comments','family_members',
    'protected_buyers','protected_periods','financial_ledger','commission_payments'
  )
GROUP BY t.table_name
ORDER BY t.table_name;


-- ----------------------------------------------------------------------------
-- BLOCK 3 — *** THE ORPHAN-SET SIZER ***  (full coverage, auto-skips missing tables)
-- ----------------------------------------------------------------------------
-- STEP 3a: run this generator. It emits a single UNION ALL query covering EVERY
--          public table that has a created_at column — so nothing is missed.
SELECT
  '-- paste & run the output below --' AS note,
  string_agg(
    format(
      'SELECT %L AS table_name, count(*) AS rows_after_cutover, '
      || 'min(created_at) AS earliest_after_cutover, max(created_at) AS latest_overall '
      || 'FROM %I.%I WHERE created_at > timestamptz ''2026-06-01 06:30:00+00''',
      table_name, table_schema, table_name),
    E'\nUNION ALL\n')
  || E'\nORDER BY rows_after_cutover DESC;'  AS generated_sql
FROM information_schema.columns
WHERE table_schema='public' AND column_name='created_at';
-- STEP 3b: copy the `generated_sql` cell, paste it into the editor, run it.
--   ANY table with rows_after_cutover > 0 = data written ONLY to royal-dawn
--   during the window. If that table is compliance/user data (leads, audit_*,
--   consent, inquiries, offers, documents, signatures) -> CUTOVER IS BLOCKED
--   until those rows are reconciled into cold-waterfall.


-- ----------------------------------------------------------------------------
-- BLOCK 4 — HIGH-PRIORITY EXPLICIT COUNTS  (run individually; skip any that
--           BLOCK 2 showed as absent — a "relation does not exist" error just
--           means that table isn't on this older branch.)
-- ----------------------------------------------------------------------------
-- 4a AUDIT (retention-mandated — almost certainly the first BLOCKER):
SELECT count(*) rows_after_cutover, min(created_at) earliest, max(created_at) latest_overall
FROM audit_events WHERE created_at > timestamptz '2026-06-01 06:30:00+00';

-- 4b LEADS (business-critical + FARE/TCPA consent context):
SELECT count(*) rows_after_cutover, min(created_at) earliest, max(created_at) latest_overall
FROM leads WHERE created_at > timestamptz '2026-06-01 06:30:00+00';

-- 4c INQUIRIES:
SELECT count(*) rows_after_cutover, min(created_at) earliest, max(created_at) latest_overall
FROM inquiries WHERE created_at > timestamptz '2026-06-01 06:30:00+00';

-- 4d SELLER LEADS (intake form):
SELECT count(*) rows_after_cutover, min(created_at) earliest, max(created_at) latest_overall
FROM seller_leads WHERE created_at > timestamptz '2026-06-01 06:30:00+00';

-- 4e SESSIONS / MFA (auth state written during the window):
SELECT 'sessions' t, count(*) rows_after_cutover, max(created_at) latest_overall
FROM sessions WHERE created_at > timestamptz '2026-06-01 06:30:00+00';

-- 4f DOCUMENTS + SIGNATURES (legal artifacts):
SELECT count(*) rows_after_cutover, max(created_at) latest_overall
FROM documents WHERE created_at > timestamptz '2026-06-01 06:30:00+00';
SELECT count(*) rows_after_cutover, max(created_at) latest_overall
FROM document_signatures WHERE created_at > timestamptz '2026-06-01 06:30:00+00';

-- 4g OFFERS / DEALS (transaction data):
SELECT count(*) rows_after_cutover, max(created_at) latest_overall
FROM offers WHERE created_at > timestamptz '2026-06-01 06:30:00+00';


-- ----------------------------------------------------------------------------
-- BLOCK 5 — RE-DERIVABLE (sync) WRITES — for awareness, NOT a blocker
-- ----------------------------------------------------------------------------
-- IDX listings + media are re-synced from Trestle (read-only feed) and self-heal
-- on the next sync cycle after cutover, so these do NOT block — but quantify
-- them so the team knows how much sync catch-up to expect.
SELECT 'listings' t, count(*) rows_after_cutover, max(created_at) latest, max(updated_at) latest_upd
FROM listings WHERE created_at > timestamptz '2026-06-01 06:30:00+00'
   OR updated_at > timestamptz '2026-06-01 06:30:00+00';
-- updated_at coverage generator for media/projection (run + paste like BLOCK 3):
SELECT string_agg(
  format('SELECT %L AS table_name, count(*) AS rows_touched_after_cutover, max(updated_at) AS latest_upd '
         || 'FROM %I.%I WHERE updated_at > timestamptz ''2026-06-01 06:30:00+00''',
         table_name, table_schema, table_name),
  E'\nUNION ALL\n') || E'\nORDER BY rows_touched_after_cutover DESC;' AS generated_updated_at_sql
FROM information_schema.columns
WHERE table_schema='public' AND column_name='updated_at';


-- ============================================================================
-- INTERPRETATION (tell-me-what-it-means):
--   BLOCK 0  wrong fingerprint (col=true / exclusives=4) -> you're on cold-waterfall, reselect royal-dawn.
--   BLOCK 1  zero rows -> confirms missing column (the prod 500 cause).
--   BLOCK 3b/4a-4g  ANY rows_after_cutover > 0 on a compliance/user table
--            -> ⛔ CUTOVER BLOCKED. Those rows live only on royal-dawn and must be
--               reconciled into cold-waterfall before re-pointing DATABASE_URL.
--   BLOCK 5  rows here are re-syncable from Trestle -> informational only, not a blocker.
-- ============================================================================
