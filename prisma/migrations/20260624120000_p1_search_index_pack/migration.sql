-- P1 search-index pack (#415 Neon/Search Foundation) — ADDITIVE indexes only.
-- No data change, no destructive operation, no table rewrite, no reclaim.
-- CREATE INDEX takes a brief SHARE lock on each table for the build duration
-- (~seconds on listings ≈110k rows; instant on showings). Apply in a low-traffic
-- window. If a zero-write-lock build is required, run these as
-- `CREATE INDEX CONCURRENTLY` manually (outside the transactional migrate runner).
--
-- listings_search_gate_idx: composite for SEARCH_DISPLAY_GATE + active-status IN
--   (lib/search/listing-access-decision.ts) — the predicate on every public read.
CREATE INDEX "listings_search_gate_idx" ON "listings" ("idx_display_yn", "internet_entire_listing_display_yn", "owner_opt_out", "participant_only", "status");
-- listings_postal_code_idx: neighborhood search → postal_code IN(...); detail Strategy-2.
CREATE INDEX "listings_postal_code_idx" ON "listings" ("postal_code");
-- showings_type_date_idx: open-houses query (type eq + date range + orderBy date).
CREATE INDEX "showings_type_date_idx" ON "showings" ("type", "date");
