-- Migration: add Auction fields to Listing (Workstream C3 — UCBA Art. I exception)
--
-- Adds 5 nullable columns to the `listings` table for auction-sold listings.
-- All nullable per NEON.md §4 — never `NOT NULL DEFAULT ...` on a populated
-- table. Existing rows remain unaffected.
--
-- Closes C15 [low] in compliance/rules/ucba-audit-checklist.json:
--   "Auction Listing Requirements — Must include: minimum bid, date/time/
--    location, registration, inspection, buyer's premium"
--
-- Apply manually to Neon prod BEFORE merging the code PR.

ALTER TABLE "listings" ADD COLUMN "auction_yn" BOOLEAN;
ALTER TABLE "listings" ADD COLUMN "auction_type" TEXT;
ALTER TABLE "listings" ADD COLUMN "auction_start_date" TIMESTAMP(3);
ALTER TABLE "listings" ADD COLUMN "auction_end_date" TIMESTAMP(3);
ALTER TABLE "listings" ADD COLUMN "auction_terms_url" TEXT;
