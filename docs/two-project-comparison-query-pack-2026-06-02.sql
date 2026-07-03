-- ============================================================================
-- TWO-PROJECT COMPARISON — READ-ONLY CONSOLE QUERY PACK  (2026-06-02, REPORT ONLY)
-- ============================================================================
-- Run this SAME pack in BOTH Neon projects' SQL Editors, then paste results
-- side by side. It is SELECT-only: no INSERT/UPDATE/DELETE/DDL, no locks beyond
-- normal MVCC reads. Nothing here mutates data, schema, branch, or credentials.
--
--   PROJECT A (currently serving production, suspected STALE):
--     morning-bread-68708332 / "mallandb" / branch main (br-old-tree-admdlb9z)
--     compute ep-royal-dawn-ad6eh8t2 / Plan Free
--   PROJECT B (Vercel-managed, suspected CANONICAL DATA):
--     hidden-mountain-87248164 / "neon-green-school" / branch main (br-crimson-frog-adr7g9gt)
--     compute ep-cold-waterfall-adno3ao2 / Plan Launch
--
-- These are SEPARATE Neon projects (cross-project binding), NOT two endpoints
-- on one branch. Do NOT change DATABASE_URL / env / credentials / migrations /
-- Neon / Vercel based on this pack — it only MEASURES.
--
-- CUTOVER BOUNDARY: 2026-06-01 06:30:00+00 (rotation success 06:35:28Z; last
--                   cold-waterfall write 06:31Z).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 0 — WHICH PROJECT AM I ON?  (run FIRST in each Console)
-- ----------------------------------------------------------------------------
--   PROJECT A (royal-dawn) expected -> has_trestle_mls_id_col=false, crm_exclusives=0
--   PROJECT B (cold-waterfall) expected -> has_trestle_mls_id_col=true,  crm_exclusives=4
SELECT
  current_database()                                              AS db,
  current_user                                                    AS usr,
  now()                                                           AS server_now,
  current_setting('neon.branch_id', true)                        AS neon_branch_id_guc,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='agents'
             AND column_name='trestle_mls_id')                    AS has_trestle_mls_id_col,
  (SELECT count(*) FROM listings
     WHERE listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%')      AS crm_exclusives,
  (SELECT count(*) FROM agents)                                   AS agents_count;


-- ----------------------------------------------------------------------------
-- BLOCK 1 — CORE COMPARISON METRICS (run in each project; paste side by side)
-- ----------------------------------------------------------------------------
-- 1a agents + the P2022 column + Maya's MLS id
SELECT
  (SELECT count(*) FROM agents)                                                       AS agents_count,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='agents'
            AND column_name='trestle_mls_id')                                         AS has_trestle_mls_id_col;
-- Maya's trestle_mls_id (skip / will error on PROJECT A if column is absent — that
-- absence is itself the answer = "N/A column missing"):
SELECT id, full_name, trestle_mls_id
FROM agents
WHERE lower(full_name) LIKE 'maya%allan%' OR lower(full_name) LIKE '%allan%maya%';

-- 1b listings + exclusives + freshness
SELECT
  (SELECT count(*) FROM listings)                                                     AS listings_count,
  (SELECT count(*) FROM listings WHERE listing_id LIKE 'SL-%' OR listing_id LIKE 'RL-%') AS sl_rl_exclusives,
  (SELECT max(updated_at) FROM listings)                                              AS listings_latest_updated_at,
  (SELECT max(created_at) FROM listings)                                              AS listings_latest_created_at;

-- 1c compliance / user-write tables (count + latest). Each wrapped so a missing
--    table on the older project does not abort the batch — run individually and
--    ignore "relation does not exist" (that itself is a data point: table absent).
SELECT 'audit_events' t, count(*) n, max(created_at) latest FROM audit_events;
SELECT 'leads'        t, count(*) n, max(created_at) latest FROM leads;
SELECT 'inquiries'    t, count(*) n, max(created_at) latest FROM inquiries;
SELECT 'seller_leads' t, count(*) n, max(created_at) latest FROM seller_leads;
SELECT 'sessions'     t, count(*) n, max(created_at) latest FROM sessions;
SELECT 'documents'    t, count(*) n, max(created_at) latest FROM documents;
SELECT 'document_signatures' t, count(*) n, max(created_at) latest FROM document_signatures;
SELECT 'offers'       t, count(*) n, max(created_at) latest FROM offers;
SELECT 'listing_media' t, count(*) n, max(updated_at) latest FROM listing_media;

-- 1d users/accounts if this project's schema has them (B uses `agents`, not `users`)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('users','accounts','user','account');

-- 1e consent + CRM intake/draft tables present in THIS project (discovery; consent
--    may be columns on `leads` rather than a dedicated table)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND (table_name ILIKE '%consent%' OR table_name ILIKE '%draft%'
       OR table_name ILIKE '%intake%' OR table_name ILIKE '%rsvp%'
       OR table_name ILIKE '%cma%' OR table_name ILIKE '%guide%')
ORDER BY table_name;


-- ----------------------------------------------------------------------------
-- BLOCK 2 — ORPHAN-WRITE SIZER (most important on PROJECT A) — auto-skips missing
-- ----------------------------------------------------------------------------
-- STEP 2a: run this generator; it emits one UNION ALL over EVERY public table
--          with a created_at column → counts rows written after the cutover.
SELECT
  '-- paste & run the output below --' AS note,
  string_agg(
    format(
      'SELECT %L AS table_name, count(*) AS rows_after_cutover, '
      || 'min(created_at) AS earliest_after_cutover, max(created_at) AS latest_overall '
      || 'FROM %I.%I WHERE created_at > timestamptz ''2026-06-01 06:30:00+00''',
      table_name, table_schema, table_name),
    E'\nUNION ALL\n')
  || E'\nORDER BY rows_after_cutover DESC;' AS generated_sql
FROM information_schema.columns
WHERE table_schema='public' AND column_name='created_at';
-- STEP 2b: copy the generated_sql cell, paste, run.
--   On PROJECT A: ANY compliance/user table with rows_after_cutover > 0 = writes
--     that exist ONLY on morning-bread/royal-dawn since the accidental cutover →
--     MUST be preserved before moving production to B.
--   On PROJECT B: rows_after_cutover should be ~0 (writes stopped 06:31Z) — confirms
--     B captured nothing after the cutover.


-- ----------------------------------------------------------------------------
-- BLOCK 3 — full table inventory (so nothing compliance-relevant is missed)
-- ----------------------------------------------------------------------------
SELECT count(*) AS public_table_count FROM information_schema.tables WHERE table_schema='public';
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;


-- ============================================================================
-- INTERPRETATION:
--   BLOCK 0 fingerprint tells you A vs B. Record neon_branch_id_guc + db name.
--   BLOCK 1 -> fill the side-by-side table in
--             docs/two-project-comparison-plan-2026-06-02.md.
--   BLOCK 2 on A -> the orphan tail that blocks cutover until preserved.
--   Canonical = whichever holds the COMPLETE current history + schema (evidence
--   points to B). A holds: stale pre-migration data + the ~26h post-cutover tail.
-- ============================================================================
