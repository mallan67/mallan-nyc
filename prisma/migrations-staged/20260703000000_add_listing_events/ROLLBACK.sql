-- SELLER-002 rollback — drops the listing_events table and everything on it.
-- Safe at any time: no other table references listing_events; the only
-- writer (POST /api/track/listing-event) is fail-closed behind
-- LISTING_EVENTS_ENABLED and answers 204 even when the table is absent.
-- Set LISTING_EVENTS_ENABLED off (or unset) BEFORE dropping, then:

DROP TABLE IF EXISTS "listing_events";
