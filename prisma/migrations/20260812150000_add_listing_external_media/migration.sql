-- Canonical authority for EXTERNAL hosted media references (video / virtual tour / 3D).
-- NEW EMPTY TABLE ONLY. No ALTER/UPDATE/DELETE on any existing table (NEON.md 4,
-- "Good SQL patterns"). Applied to production manually under separate Maya
-- authorization; never from the Vercel build (NEON.md 1).
--
-- Owns the six live Cotality Property slots. Counts measured 2026-08-12 are
-- FEED-WIDE EVIDENCE ONLY, not a backfill target — the real universe is
-- Cotality Property INTERSECT Mallan's canonical Listing set:
--   VirtualTourURLBranded 13,893 · VirtualTourURLUnbranded 26,333
--   VirtualTourURLUnbranded2 2,377 · VirtualTourURLUnbranded3 354
--   VirtualTourURLBranded2 0 · VirtualTourURLBranded3 0
-- Unbranded2/3 are stripped today by RAW_DATA_KEEP_FIELDS and never reach the DTO.

-- CreateTable
-- The canonical identity IS the primary key. No surrogate id and no BIGSERIAL
-- sequence, so this table carries ONE B-tree rather than two. Its leading column
-- is listing_id, which also serves the per-listing composer read and the cascade.
CREATE TABLE "listing_external_media" (
    "listing_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "branded" BOOLEAN NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- DEFAULT so a bounded raw-SQL backfill cannot fail on a NOT NULL column when
    -- the application timestamp is omitted; Prisma still manages it via @updatedAt.
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_external_media_pkey" PRIMARY KEY ("listing_id", "source", "source_key")
);

-- AddForeignKey
-- CASCADE removes current-state rows when a Listing is physically deleted. Archive
-- / legal-retention semantics MUST be verified before the raw_data copy is retired,
-- since after retirement this is the only home for these URLs.
ALTER TABLE "listing_external_media" ADD CONSTRAINT "listing_external_media_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("listing_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints. The repo uses no Prisma enums; DB CHECK is the established
-- pattern (see 20260712120000_b1b1_canonical_identity_schema).
--
-- These enforce VOCABULARY ONLY. A CHECK cannot know whether a SafeLinks wrapper
-- is really a virtual tour — semantic correctness is owned by the canonical
-- classifier, and every writer must route through it.

ALTER TABLE "listing_external_media" ADD CONSTRAINT "listing_external_media_source_check"
    CHECK ("source" IN ('cotality_property', 'crm'));

ALTER TABLE "listing_external_media" ADD CONSTRAINT "listing_external_media_kind_check"
    CHECK ("kind" IN ('video', 'virtual_tour', 'unknown'));

-- cotality_property is slot-based and fails closed against the verified live set.
-- crm is record-based: source_key carries a stable namespaced CRM identity, so it
-- stays open here and is validated at the ingestion boundary.
ALTER TABLE "listing_external_media" ADD CONSTRAINT "listing_external_media_cotality_slot_check"
    CHECK (
      "source" <> 'cotality_property'
      OR "source_key" IN (
        'VirtualTourURLBranded',   'VirtualTourURLBranded2',   'VirtualTourURLBranded3',
        'VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLUnbranded3'
      )
    );
