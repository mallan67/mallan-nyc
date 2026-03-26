-- CreateTable
CREATE TABLE "buildings" (
    "id" BIGSERIAL NOT NULL,
    "building_key" INTEGER NOT NULL,
    "name" TEXT,
    "street_number" TEXT,
    "street_name" TEXT,
    "street_dir" TEXT,
    "street_suffix" TEXT,
    "neighborhood" TEXT,
    "borough" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "ownership_type" TEXT,
    "structure_type" TEXT,
    "new_construction" BOOLEAN,
    "building_condition" TEXT,
    "development_status" TEXT,
    "construction_materials" TEXT,
    "year_built" INTEGER,
    "stories_total" INTEGER,
    "total_units" INTEGER,
    "units_leased" INTEGER,
    "units_vacant" INTEGER,
    "units_mo_to_mo" INTEGER,
    "building_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attendance_type" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "security_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "community_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "association_amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessibility_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exterior_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "patio_porch_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pool_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spa_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "laundry_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parking_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heating" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cooling" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flooring" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interior_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appliances" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "door_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "window_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roof" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "electric" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "water_source" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sewer" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pets_allowed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "view" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "waterfront_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "green_features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "garage_spaces" INTEGER,
    "parking_total" INTEGER,
    "carport_spaces" INTEGER,
    "open_parking" INTEGER,
    "garage_yn" BOOLEAN,
    "maintenance_fee" DECIMAL(10,2),
    "maintenance_fee_frequency" TEXT,
    "maintenance_includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tax_annual" DECIMAL(12,2),
    "mgmt_expense" DECIMAL(10,2),
    "board_name" TEXT,
    "board_phone" TEXT,
    "board_name_2" TEXT,
    "board_phone_2" TEXT,
    "walk_score" INTEGER,
    "management_company" TEXT,
    "management_phone" TEXT,
    "management_email" TEXT,
    "super_name" TEXT,
    "super_phone" TEXT,
    "super_live_in" BOOLEAN,
    "porter_name" TEXT,
    "porter_phone" TEXT,
    "board_approval_required" BOOLEAN,
    "board_notes" TEXT,
    "agent_notes" TEXT,
    "custom_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_listing_count" INTEGER NOT NULL DEFAULT 0,
    "total_listing_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_units" (
    "id" BIGSERIAL NOT NULL,
    "building_id" BIGINT NOT NULL,
    "unit_number" TEXT NOT NULL,
    "listing_id" TEXT,
    "bedrooms" INTEGER,
    "bathrooms_full" INTEGER,
    "bathrooms_half" INTEGER,
    "living_area" INTEGER,
    "floor_number" INTEGER,
    "floor_plan_url" TEXT,
    "status" TEXT,
    "list_price" DECIMAL(14,2),
    "close_price" DECIMAL(14,2),
    "close_date" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "building_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buildings_building_key_key" ON "buildings"("building_key");
CREATE INDEX "buildings_borough_idx" ON "buildings"("borough");
CREATE INDEX "buildings_neighborhood_idx" ON "buildings"("neighborhood");
CREATE INDEX "buildings_zip_idx" ON "buildings"("zip");
CREATE INDEX "buildings_name_idx" ON "buildings"("name");
CREATE INDEX "buildings_new_construction_idx" ON "buildings"("new_construction");

-- CreateIndex
CREATE UNIQUE INDEX "building_units_building_id_unit_number_key" ON "building_units"("building_id", "unit_number");
CREATE INDEX "building_units_building_id_idx" ON "building_units"("building_id");
CREATE INDEX "building_units_listing_id_idx" ON "building_units"("listing_id");

-- AddForeignKey
ALTER TABLE "building_units" ADD CONSTRAINT "building_units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
