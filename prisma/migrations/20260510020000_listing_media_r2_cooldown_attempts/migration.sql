-- listing_media: R2 mirror cooldown + attempts counter (NEON-safe additive)
--
-- Root cause: persistent Trestle CDN 404s on stale media URLs cause
-- Phase 3 to retry the same ~30 rows every 15 min, inflating r2_failed
-- and wasting Trestle bandwidth. See memory/PR3-PRODUCTION-ROLLOUT-2026-05-09.md
-- E8 probe (response body: '{"code":"404","message":"ERROR - External media
-- was not downloaded."}').
--
-- Cooldown column gives Phase 3 a "skip-recently-failed" predicate.
-- Attempts column lets Cp4 soft-delete rows after 3 confirmed 404s.
--
-- NEON.md §4 conformance:
--   - Both columns nullable. No NOT NULL DEFAULT (Trap §3 forbidden pattern).
--   - No new index in this migration. The existing @@index([status]) plus
--     the small backlog cardinality (~30K rows) keep Phase 3 query latency
--     acceptable. A partial CONCURRENTLY index can be added in a follow-up
--     migration if profile shows pain.
--   - One change per PR: schema-related, two columns on the same table for
--     a single feature (cooldown). Acknowledged deviation from "one column
--     per PR" because the columns are coupled — both required for the fix
--     to work, both roll back together cleanly.
ALTER TABLE "listing_media"
  ADD COLUMN "r2_last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "r2_attempts" INTEGER;
