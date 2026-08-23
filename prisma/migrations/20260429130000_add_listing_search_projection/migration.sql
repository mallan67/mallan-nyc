-- Master refactor PR 5A — listing search projection (additive only).
--
-- Creates a denormalized read-model table fed (in PR 5B) by lib/idx/sync.ts
-- so public + agent + saved-search reads can eventually move off the
-- listings.raw_data / listings.features JSON scans.
--
-- PR 5A is schema-only. No code reads or writes this table yet.
-- PR 5B will introduce dual-write from lib/idx/sync.ts.
-- PR 5C will verify a full sync cycle.
-- PR 5D will migrate the first reader.
--
-- Apply order per NEON.md §4 (manual against the target Neon DB before
-- any reader-migration code merges):
--   DATABASE_URL=$NEON_PROD_URL npx prisma migrate deploy
--   DATABASE_URL=$NEON_PROD_URL npx prisma migrate status
-- Then commit/push the dependent code.

CREATE TABLE "listing_search_projection" (
  "id" BIGSERIAL PRIMARY KEY,
  "listing_id" TEXT NOT NULL,

  -- RESO/Trestle source tracking
  "listing_key" TEXT,
  "source_system" TEXT,
  "mls_status" TEXT,

  -- Classification
  "listing_type" TEXT,
  "property_type" TEXT,
  "property_sub_type" TEXT,

  -- Geography (promoted out of listings.address JSON)
  "borough" TEXT,
  "neighborhood" TEXT,
  "postal_code" TEXT,
  "city" TEXT,
  "state" TEXT,

  -- Numeric search dimensions
  "list_price" BIGINT,
  "bedrooms" DOUBLE PRECISION,
  "bathrooms" DOUBLE PRECISION,
  "living_area" DOUBLE PRECISION,
  "year_built" INTEGER,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,

  -- Boolean flags (derived once at projection build time)
  "is_commercial" BOOLEAN NOT NULL DEFAULT false,
  "is_new_development" BOOLEAN NOT NULL DEFAULT false,
  "is_exclusive" BOOLEAN NOT NULL DEFAULT false,
  "is_rental" BOOLEAN NOT NULL DEFAULT false,

  -- Distribution-gate mirror
  "rls_eligible" BOOLEAN NOT NULL DEFAULT true,
  "idx_display_yn" BOOLEAN,
  "internet_entire_listing_display_yn" BOOLEAN,
  "internet_address_display_yn" BOOLEAN,
  "participant_only_yn" BOOLEAN,

  -- Free-text + structured supplemental data
  "searchable_text" TEXT,
  "amenity_keys" JSONB,
  "feature_flags" JSONB,

  -- Timestamps
  "modified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listing_search_projection_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("listing_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Unique index — one projection row per listing.
CREATE UNIQUE INDEX "listing_search_projection_listing_id_key"
  ON "listing_search_projection"("listing_id");

-- Composite + single-column indexes for facet filtering.
-- Per NEON.md §4 the table is empty at creation time, so non-CONCURRENT
-- index creation is safe (only future >10K-row tables require CONCURRENTLY).
CREATE INDEX "listing_search_projection_listing_type_mls_status_idx"
  ON "listing_search_projection"("listing_type", "mls_status");
CREATE INDEX "listing_search_projection_borough_neighborhood_idx"
  ON "listing_search_projection"("borough", "neighborhood");
CREATE INDEX "listing_search_projection_postal_code_idx"
  ON "listing_search_projection"("postal_code");
CREATE INDEX "listing_search_projection_list_price_idx"
  ON "listing_search_projection"("list_price");
CREATE INDEX "listing_search_projection_bedrooms_idx"
  ON "listing_search_projection"("bedrooms");
CREATE INDEX "listing_search_projection_bathrooms_idx"
  ON "listing_search_projection"("bathrooms");
CREATE INDEX "listing_search_projection_property_sub_type_idx"
  ON "listing_search_projection"("property_sub_type");
CREATE INDEX "listing_search_projection_modified_at_idx"
  ON "listing_search_projection"("modified_at");

-- Distribution-gate composite — supports fail-closed gate filtering at
-- the index level once readers migrate. Short alias to stay under the
-- 63-char Postgres identifier limit.
CREATE INDEX "lsp_distribution_gates_idx"
  ON "listing_search_projection"(
    "rls_eligible",
    "idx_display_yn",
    "internet_entire_listing_display_yn",
    "participant_only_yn"
  );
