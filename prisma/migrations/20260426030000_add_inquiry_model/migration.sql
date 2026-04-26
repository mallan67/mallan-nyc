-- Migration: add Inquiry model (Workstream C1 of master refactor)
--
-- Adds a new `inquiries` table that bridges Lead↔Listing and replaces the
-- AuditEvent-based workaround in /api/crm/inquiries. Supports UCBA Art. III
-- §4 (data accuracy + reporting) by giving listings a real source for
-- per-listing inquiry counts (currently hardcoded to 0 in the listings
-- route).
--
-- Design notes:
--   - listing_id references listings.listing_id (the unique String key —
--     Trestle ListingId or SL-/RL- internal prefix), NOT listings.id (the
--     BigInt PK). Every public lead-capture endpoint already works with the
--     string key, so this avoids redundant lookups.
--   - Both FKs are ON DELETE SET NULL — preserves the inquiry record for
--     audit/reporting if a listing or lead is later removed.
--   - All optional fields are nullable to accommodate the variety of
--     lead-capture sources (CMA requests with no listing, anonymous
--     inquiries with no lead yet, etc.).
--
-- New empty table, zero contention. Per NEON.md §4 this is the safest
-- migration class.
--
-- Apply manually to Neon prod BEFORE merging the code PR that uses this
-- model. Per NEON.md §1 + §5, schema-dependent code MUST not ship before
-- the migration runs.

-- CreateTable
CREATE TABLE "inquiries" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" TEXT,
    "lead_id" BIGINT,
    "source" TEXT NOT NULL,
    "message" TEXT,
    "consent_captured_at" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inquiries_listing_id_idx" ON "inquiries"("listing_id");

-- CreateIndex
CREATE INDEX "inquiries_lead_id_idx" ON "inquiries"("lead_id");

-- CreateIndex
CREATE INDEX "inquiries_source_idx" ON "inquiries"("source");

-- CreateIndex
CREATE INDEX "inquiries_created_at_idx" ON "inquiries"("created_at");

-- CreateIndex
CREATE INDEX "inquiries_email_idx" ON "inquiries"("email");

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("listing_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
