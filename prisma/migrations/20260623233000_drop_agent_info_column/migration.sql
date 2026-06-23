-- @allow-destructive — intentional Phase D STEP 4 DROP of the legacy agent_info JSON column.
--   Rollback: restore from pre-drop Neon snapshot br-wandering-moon-adl515bq (reset primary
--   br-crimson-frog-adr7g9gt to it, or repoint DATABASE_URL to endpoint ep-cool-bird-adfi9kgl).
-- Phase D STEP 4 (board #415) — drop the legacy agent_info JSON column.
-- Drop-safe: Phase D step 3 (#429, deployed) removed agent_info from the Prisma schema/client,
-- so no read (explicit or implicit) selects it; readers resolve typed-first / absent-safe.
-- Final read-only pre-DROP rerun: real_gap_rows = 0, unverifiable_gap_rows = 0 (the 5 co-list
-- typed-vs-JSON gaps are live-confirmed STALE, not data loss). Rollback: pre-drop Neon snapshot
-- br-wandering-moon-adl515bq. Metadata-only; byte reclaim is a SEPARATE later step. Maya-approved 2026-06-23.
ALTER TABLE "listings" DROP COLUMN "agent_info";
