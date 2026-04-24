-- Migration: add missing tables sync_state, sync_errors, listings_archive
--
-- Context:
--   prisma/schema.prisma declares SyncState, SyncError, ListingsArchive
--   models but the production database never had the corresponding tables
--   created. They were apparently added to the schema via `prisma db push`
--   at some point and never captured in a migration (see NEON.md Trap #2).
--
--   Production impact confirmed 2026-04-24:
--     - lib/idx/sync.ts writes `prisma.syncState.upsert(...)` → P2021
--       (caught by try/catch, but watermark never updates → homepage shows
--       "Data last updated: February 11, 2026" indefinitely).
--     - lib/idx/sync.ts writes `prisma.syncError.create(...)` → P2021
--       (caught; structured error telemetry silently lost).
--     - app/api/cron/data-retention/route.ts writes
--       `prisma.listingsArchive.upsert(...)` → P2021
--       (T+180d archive is a no-op; terminal listings never delete).
--
-- All three tables are new, nullable-by-design, and safe to add per
-- NEON.md §4 discipline:
--   - Zero rows, zero storage cost until populated.
--   - No existing code paths read from them (other than the writers that
--     currently throw), so there is no race between this migration and
--     the code paths that depend on them.
--   - Indexes created are on narrow columns (resource, listing_key,
--     close_date, neighborhood).

-- ============================================================================
-- sync_state — single-row-per-resource watermark table
-- ============================================================================
CREATE TABLE "sync_state" (
    "resource" TEXT NOT NULL,
    "last_watermark" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "last_run_duration_ms" INTEGER,
    "rows_upserted" INTEGER,
    "rows_skipped_by_gate" INTEGER,
    "rows_with_errors" INTEGER,
    "notes" TEXT,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("resource")
);

-- ============================================================================
-- sync_errors — structured per-record sync failure log
-- ============================================================================
CREATE TABLE "sync_errors" (
    "id" BIGSERIAL NOT NULL,
    "resource" TEXT NOT NULL,
    "listing_key" TEXT,
    "listing_id" TEXT,
    "error_code" TEXT,
    "error_msg" VARCHAR(2000) NOT NULL,
    "attempt_num" INTEGER NOT NULL DEFAULT 1,
    "raw_payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_errors_resource_occurred_at_idx" ON "sync_errors"("resource", "occurred_at");
CREATE INDEX "sync_errors_listing_key_idx" ON "sync_errors"("listing_key");
CREATE INDEX "sync_errors_error_code_idx" ON "sync_errors"("error_code");

-- ============================================================================
-- listings_archive — T+180d terminal-listing historical snapshot
-- ============================================================================
CREATE TABLE "listings_archive" (
    "id" BIGSERIAL NOT NULL,
    "listing_key" TEXT NOT NULL,
    "listing_id" TEXT,
    "mls_id" TEXT,
    "status" TEXT NOT NULL,
    "listing_type" TEXT NOT NULL,
    "property_type" TEXT,
    "property_sub_type" TEXT,
    "close_price" DECIMAL(14, 2),
    "close_date" TIMESTAMP(3),
    "list_price" DECIMAL(14, 2),
    "original_list_price" DECIMAL(14, 2),
    "bedrooms_total" INTEGER,
    "bathrooms_full" INTEGER,
    "bathrooms_half" INTEGER,
    "living_area" DECIMAL(10, 2),
    "borough" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "address_line" TEXT,
    "list_agent_full_name" TEXT,
    "list_office_name" TEXT,
    "days_on_market" INTEGER,
    "original_created_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_archive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listings_archive_listing_key_key" ON "listings_archive"("listing_key");
CREATE INDEX "listings_archive_close_date_idx" ON "listings_archive"("close_date");
CREATE INDEX "listings_archive_neighborhood_close_date_idx" ON "listings_archive"("neighborhood", "close_date");
CREATE INDEX "listings_archive_borough_close_date_idx" ON "listings_archive"("borough", "close_date");
CREATE INDEX "listings_archive_list_agent_full_name_idx" ON "listings_archive"("list_agent_full_name");
