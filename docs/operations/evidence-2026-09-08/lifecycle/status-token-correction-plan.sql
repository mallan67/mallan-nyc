-- STATUS TOKEN CORRECTION PLAN — DRY RUN (nothing here has been executed; production writes are HELD until Maya
-- authorizes them; read NEON.md first and run against `hidden-mountain-87248164` / ep-cold-waterfall only).
--
-- Owner ruling (2026-09-08 evening): every stored status is a live Cotality StandardStatus token —
--   Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn.
-- Rows written before the correction carry Mallan spellings. Every reader now normalizes them
-- (lib/listings/mallan-status.ts LEGACY_STORAGE_ALIASES) and every DB filter still matches them, so this plan is a
-- clean-up, not a prerequisite. Legacy → token:
--   'Draft'     → 'Incomplete'   (the provider's draft member)
--   'Sold'      → 'Closed'       (label "Sold" on a sale is applied at display time)
--   'Rented'    → 'Closed'       (label "Rented" on a rental is applied at display time)
--   'Leased'    → 'Closed'
--   'Cancelled' → 'Canceled'     (the provider's one-L spelling)
--
-- 1. Census (read-only) — how many rows carry each legacy spelling.
SELECT status, listing_type, COUNT(*) AS rows
FROM listings
WHERE status IN ('Draft', 'Sold', 'Rented', 'Leased', 'Cancelled')
GROUP BY status, listing_type
ORDER BY status, listing_type;

SELECT mls_status, listing_type, COUNT(*) AS rows
FROM listing_search_projection
WHERE mls_status IN ('Draft', 'Sold', 'Rented', 'Leased', 'Cancelled')
GROUP BY mls_status, listing_type
ORDER BY mls_status, listing_type;

-- 2. Correction (HELD — do not run without authorization). One transaction; the projection mirror follows.
-- BEGIN;
-- UPDATE listings
--    SET status = CASE status
--                   WHEN 'Draft' THEN 'Incomplete'
--                   WHEN 'Sold' THEN 'Closed'
--                   WHEN 'Rented' THEN 'Closed'
--                   WHEN 'Leased' THEN 'Closed'
--                   WHEN 'Cancelled' THEN 'Canceled'
--                 END
--  WHERE status IN ('Draft', 'Sold', 'Rented', 'Leased', 'Cancelled');
-- UPDATE listing_search_projection
--    SET mls_status = CASE mls_status
--                       WHEN 'Draft' THEN 'Incomplete'
--                       WHEN 'Sold' THEN 'Closed'
--                       WHEN 'Rented' THEN 'Closed'
--                       WHEN 'Leased' THEN 'Closed'
--                       WHEN 'Cancelled' THEN 'Canceled'
--                     END
--  WHERE mls_status IN ('Draft', 'Sold', 'Rented', 'Leased', 'Cancelled');
-- COMMIT;
--
-- 3. Proof after the correction (read-only): zero legacy spellings remain.
-- SELECT COUNT(*) FROM listings WHERE status IN ('Draft', 'Sold', 'Rented', 'Leased', 'Cancelled');
-- SELECT COUNT(*) FROM listing_search_projection WHERE mls_status IN ('Draft', 'Sold', 'Rented', 'Leased', 'Cancelled');
--
-- Notes: `status_changed_at`, `terminal_since`, `days_on_market` and every raw_data fact are untouched — the
-- transaction word (Sold vs Rented) is `listing_type`, which every label reads. No schema change.
