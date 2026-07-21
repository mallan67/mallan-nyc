-- PREPARED, NOT APPLIED. Unified media-identity migration.
--
-- Application is an ACTIVATION-GATED, Maya-approved step (NEON.md §5): run
-- manually against the canonical prod DB (hidden-mountain / cold-waterfall)
-- BEFORE deploying code that reads these columns, then `prisma migrate status`.
-- Do NOT add this to any build command. Do NOT apply during business hours
-- (3–5 AM ET only for large tables).
--
-- All changes are additive + nullable (reversible). No NOT NULL DEFAULT, no
-- column type change, no data backfill here (the pipeline backfills lazily).

-- 1) Identity + lifecycle columns (metadata-only on PG >= 11; instant).
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "source_revision" BIGINT;
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "r2_object_key" TEXT;
ALTER TABLE "listing_media" ADD COLUMN IF NOT EXISTS "pending_removal_run" TEXT;

-- 2) Partial covering index for the bounded R2 backlog query (~300K-row table).
--    MUST be created CONCURRENTLY (NEON.md §4) — run this statement OUTSIDE a
--    transaction. Ordering matches the bounded backlog fetch
--    (ORDER BY created_at ASC, id ASC) and the null-R2 predicate.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "listing_media_r2_backlog_idx"
  ON "listing_media" ("created_at", "id")
  WHERE "status" = 'active'
    AND "media_url_original" IS NOT NULL
    AND ("r2_key" IS NULL OR "media_url_cached" IS NULL);

-- Rollback (if ever needed, reverse order): remove the backlog index
--   (concurrently) then remove the three additive-nullable columns, only after
--   confirming no live readers. Every change here is additive + reversible; this
--   migration contains no destructive statement.
