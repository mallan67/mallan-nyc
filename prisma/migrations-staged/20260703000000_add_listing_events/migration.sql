-- ═══════════════════════════════════════════════════════════════════════
-- SELLER-002 — CREATE TABLE listing_events  (STAGED — DO NOT RUN)
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️  This file lives in prisma/migrations-staged/ (NOT prisma/migrations/)
--     ON PURPOSE: `prisma migrate deploy` must NOT pick it up. Applying it
--     is a Maya-held action (CLAUDE.md §C: schema migrations are held).
--     Apply plan + checklist: docs/architecture/SELLER-002-MIGRATION-PLAN-2026-07-03.md
--     Registry: docs/PLATFORM-ISSUE-REGISTRY.md SELLER-002.
--
-- NEON.md compliance:
--   * new EMPTY table → no contention, plain (non-CONCURRENT) index builds
--     are fine (NEON.md §4 "Good SQL patterns": new empty table);
--   * FKs declare explicit ON DELETE behavior (NEON.md forbidden-pattern rule);
--   * no NOT NULL DEFAULT added to any populated table (this touches none);
--   * never run from the Vercel build (NEON.md §1); apply manually against
--     the CANONICAL host ep-cold-waterfall-adno3ao2 in the 3–5 AM ET window.

CREATE TABLE "listing_events" (
    "id"            BIGSERIAL NOT NULL,
    "listing_id"    TEXT NOT NULL,
    "event_type"    TEXT NOT NULL,
    "visitor_id"    TEXT NOT NULL,
    "session_id"    TEXT NOT NULL,
    "user_id"       TEXT,
    "lead_id"       BIGINT,
    "agent_id"      BIGINT,
    "source"        TEXT,
    "utm_source"    TEXT,
    "utm_medium"    TEXT,
    "utm_campaign"  TEXT,
    "referrer"      TEXT,
    "device_type"   TEXT,
    "city"          TEXT,
    "region"        TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata"      JSONB,

    CONSTRAINT "listing_events_pkey" PRIMARY KEY ("id")
);

-- FK: string listing key (Inquiry pattern). CASCADE — if a listing row is
-- ever deleted, its anonymous events go with it. Also gives DB-enforced
-- listing existence for beacon inserts WITHOUT a response-visible check
-- (the capture route answers 204 regardless — no existence oracle).
ALTER TABLE "listing_events"
    ADD CONSTRAINT "listing_events_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("listing_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: future self-identified linkage ONLY (server-set; the public beacon
-- never writes lead_id). SET NULL — deleting a lead re-anonymizes events.
ALTER TABLE "listing_events"
    ADD CONSTRAINT "listing_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes per SELLER-002 spec (new empty table → plain builds are safe).
CREATE INDEX "listing_events_listing_id_created_at_idx"
    ON "listing_events"("listing_id", "created_at");
CREATE INDEX "listing_events_event_type_idx"
    ON "listing_events"("event_type");
CREATE INDEX "listing_events_visitor_id_idx"
    ON "listing_events"("visitor_id");
