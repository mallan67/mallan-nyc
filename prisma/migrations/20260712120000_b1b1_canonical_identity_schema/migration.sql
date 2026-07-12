-- CreateTable
CREATE TABLE "canonical_property" (
    "id" BIGSERIAL NOT NULL,
    "bbl" TEXT,
    "normalized_address" TEXT NOT NULL,
    "borough" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "source_refs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_building" (
    "id" BIGSERIAL NOT NULL,
    "canonical_property_id" BIGINT,
    "normalized_street" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "borough" TEXT NOT NULL,
    "building_name" TEXT,
    "cotality_building_key" TEXT,
    "bbl" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canonical_unit" (
    "id" BIGSERIAL NOT NULL,
    "canonical_building_id" BIGINT NOT NULL,
    "normalized_unit" TEXT NOT NULL,
    "floor" TEXT,
    "line" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canonical_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_identity" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" BIGINT NOT NULL,
    "canonical_property_id" BIGINT,
    "canonical_building_id" BIGINT,
    "canonical_unit_id" BIGINT,
    "identity_resolution_status" TEXT NOT NULL,
    "resolution_reason" TEXT,
    "source_record_id" TEXT NOT NULL,
    "cotality_listing_key" TEXT,
    "relisting_chain_id" BIGINT,
    "evaluated_source_snapshot_version" TEXT NOT NULL,
    "identity_evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_match_audit" (
    "id" BIGSERIAL NOT NULL,
    "listing_identity_id" BIGINT,
    "listing_source_record_id" TEXT,
    "candidate_property_id" BIGINT,
    "candidate_building_id" BIGINT,
    "candidate_unit_id" BIGINT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "evaluated_source_snapshot_version" TEXT,
    "identity_evaluated_at" TIMESTAMP(3),
    "decision" TEXT,
    "reason" TEXT,
    "matcher_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_match_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_review_queue" (
    "id" BIGSERIAL NOT NULL,
    "listing_source_record_id" TEXT NOT NULL,
    "listing_identity_id" BIGINT,
    "resolution_status" TEXT NOT NULL,
    "reason" TEXT,
    "candidate_payload" JSONB NOT NULL DEFAULT '{}',
    "review_status" TEXT NOT NULL DEFAULT 'open',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assigned_to" BIGINT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canonical_property_bbl_idx" ON "canonical_property"("bbl");

-- CreateIndex
CREATE INDEX "canonical_property_borough_idx" ON "canonical_property"("borough");

-- CreateIndex
CREATE INDEX "canonical_property_zip_idx" ON "canonical_property"("zip");

-- CreateIndex
CREATE INDEX "canonical_property_normalized_address_idx" ON "canonical_property"("normalized_address");

-- CreateIndex
CREATE INDEX "canonical_building_canonical_property_id_idx" ON "canonical_building"("canonical_property_id");

-- CreateIndex
CREATE INDEX "canonical_building_normalized_street_zip_borough_idx" ON "canonical_building"("normalized_street", "zip", "borough");

-- CreateIndex
CREATE INDEX "canonical_building_cotality_building_key_idx" ON "canonical_building"("cotality_building_key");

-- CreateIndex
CREATE INDEX "canonical_building_bbl_idx" ON "canonical_building"("bbl");

-- CreateIndex
CREATE INDEX "canonical_unit_canonical_building_id_idx" ON "canonical_unit"("canonical_building_id");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_unit_canonical_building_id_normalized_unit_key" ON "canonical_unit"("canonical_building_id", "normalized_unit");

-- CreateIndex
CREATE INDEX "listing_identity_identity_resolution_status_idx" ON "listing_identity"("identity_resolution_status");

-- CreateIndex
CREATE INDEX "listing_identity_canonical_property_id_idx" ON "listing_identity"("canonical_property_id");

-- CreateIndex
CREATE INDEX "listing_identity_canonical_building_id_idx" ON "listing_identity"("canonical_building_id");

-- CreateIndex
CREATE INDEX "listing_identity_canonical_unit_id_idx" ON "listing_identity"("canonical_unit_id");

-- CreateIndex
CREATE INDEX "listing_identity_relisting_chain_id_idx" ON "listing_identity"("relisting_chain_id");

-- CreateIndex
CREATE INDEX "listing_identity_source_record_id_idx" ON "listing_identity"("source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_identity_listing_id_key" ON "listing_identity"("listing_id");

-- CreateIndex
CREATE INDEX "identity_match_audit_listing_identity_id_idx" ON "identity_match_audit"("listing_identity_id");

-- CreateIndex
CREATE INDEX "identity_match_audit_listing_source_record_id_idx" ON "identity_match_audit"("listing_source_record_id");

-- CreateIndex
CREATE INDEX "identity_match_audit_created_at_idx" ON "identity_match_audit"("created_at");

-- CreateIndex
CREATE INDEX "identity_review_queue_review_status_idx" ON "identity_review_queue"("review_status");

-- CreateIndex
CREATE INDEX "identity_review_queue_listing_source_record_id_idx" ON "identity_review_queue"("listing_source_record_id");

-- CreateIndex
CREATE INDEX "identity_review_queue_resolution_status_idx" ON "identity_review_queue"("resolution_status");

-- CreateIndex
CREATE INDEX "identity_review_queue_created_at_idx" ON "identity_review_queue"("created_at");

-- AddForeignKey
ALTER TABLE "canonical_building" ADD CONSTRAINT "canonical_building_canonical_property_id_fkey" FOREIGN KEY ("canonical_property_id") REFERENCES "canonical_property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canonical_unit" ADD CONSTRAINT "canonical_unit_canonical_building_id_fkey" FOREIGN KEY ("canonical_building_id") REFERENCES "canonical_building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_identity" ADD CONSTRAINT "listing_identity_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_identity" ADD CONSTRAINT "listing_identity_canonical_property_id_fkey" FOREIGN KEY ("canonical_property_id") REFERENCES "canonical_property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_identity" ADD CONSTRAINT "listing_identity_canonical_building_id_fkey" FOREIGN KEY ("canonical_building_id") REFERENCES "canonical_building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_identity" ADD CONSTRAINT "listing_identity_canonical_unit_id_fkey" FOREIGN KEY ("canonical_unit_id") REFERENCES "canonical_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

