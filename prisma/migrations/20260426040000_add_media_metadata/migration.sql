-- Migration: add media metadata schema (PR 2 of master refactor)
--
-- Adds the foundation for the media-normalization track:
--   - listing_media table: per-photo records keyed by Trestle ResourceRecordKey
--   - media_sync_state table: per-resource cursor for incremental media sync
--   - 4 nullable columns on `listings` for fast media-related queries
--
-- All additions are nullable + new empty tables. Per NEON.md §4 this is the
-- safest migration class — no contention, no row touches on existing tables,
-- no compute spike.
--
-- Apply manually to Neon prod BEFORE merging the code PR. Per NEON.md §1+§5,
-- schema-dependent code MUST not ship before the migration runs.
--
-- Schema-drift note (NEON.md Trap #2): `prisma migrate diff` would also try
-- to drop campaign_recipients, engagement_events, experiment_listings,
-- financial_ledger, micro_commitments tables that exist in prod but not in
-- the schema file. This hand-written migration explicitly excludes those —
-- baseline cleanup is separate maintenance work.

-- ── 1. Add 4 nullable columns to listings ────────────────────────────────────
-- Promoted media metadata for fast card render without JSON traversal.
-- Populated incrementally by lib/idx/media-sync.ts (introduced in PR 3).

ALTER TABLE "listings" ADD COLUMN "primary_photo_url" TEXT;
ALTER TABLE "listings" ADD COLUMN "primary_photo_r2_key" TEXT;
ALTER TABLE "listings" ADD COLUMN "photos_change_timestamp" TIMESTAMP(3);
ALTER TABLE "listings" ADD COLUMN "photo_count" INTEGER;

-- ── 2. listing_media table ───────────────────────────────────────────────────
CREATE TABLE "listing_media" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" TEXT NOT NULL,
    "media_key" TEXT,
    "resource_record_key" TEXT,
    "resource_record_id" TEXT,
    "media_url_original" TEXT,
    "media_url_cached" TEXT,
    "media_type" TEXT NOT NULL,
    "media_category" TEXT,
    "media_classification" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "preferred_photo_yn" BOOLEAN NOT NULL DEFAULT false,
    "media_modification_ts" TIMESTAMP(3),
    "modification_ts" TIMESTAMP(3),
    "photos_change_ts_snapshot" TIMESTAMP(3),
    "r2_key" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_media_media_key_key" ON "listing_media"("media_key");
CREATE INDEX "listing_media_listing_id_idx" ON "listing_media"("listing_id");
CREATE INDEX "listing_media_resource_record_key_idx" ON "listing_media"("resource_record_key");
CREATE INDEX "listing_media_media_modification_ts_idx" ON "listing_media"("media_modification_ts");
CREATE INDEX "listing_media_modification_ts_idx" ON "listing_media"("modification_ts");
CREATE INDEX "listing_media_status_idx" ON "listing_media"("status");

ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("listing_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 3. media_sync_state table ────────────────────────────────────────────────
CREATE TABLE "media_sync_state" (
    "id" BIGSERIAL NOT NULL,
    "resource" TEXT NOT NULL,
    "last_photos_change" TIMESTAMP(3),
    "last_media_modified" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "rows_checked" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "rows_failed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_sync_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_sync_state_resource_key" ON "media_sync_state"("resource");
