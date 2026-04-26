-- Migration: add Offer model (Workstream C2 — UCBA Art. II transmission tracking)
--
-- Adds the `offers` table to track received offers, their transmission to the
-- seller (UCBA Art. II REQUIREMENT), and the multiple-bid disclosure consent
-- gate. The CRM previously had no first-class representation for offers —
-- they lived as free-text notes on Deal records or in AuditEvent rows.
--
-- Apply manually to Neon prod BEFORE merging the code PR. Per NEON.md §1+§5,
-- schema-dependent code MUST not ship before the migration runs.
--
-- Schema-drift note (NEON.md Trap #2): hand-written to add ONLY the new
-- offers table. Does not touch any existing prod table.

-- CreateTable
CREATE TABLE "offers" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" TEXT,
    "buyer_lead_id" BIGINT,
    "buyer_agent_id" BIGINT,
    "list_agent_id" BIGINT,
    "offer_amount" DECIMAL(14,2),
    "offer_terms" TEXT,
    "contingencies" JSONB,
    "expiration_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "transmitted_to_seller_at" TIMESTAMP(3),
    "seller_acknowledged_at" TIMESTAMP(3),
    "competing_offers_disclosed" BOOLEAN NOT NULL DEFAULT false,
    "disclosure_authorized_by_seller" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'received',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_listing_id_idx" ON "offers"("listing_id");
CREATE INDEX "offers_buyer_lead_id_idx" ON "offers"("buyer_lead_id");
CREATE INDEX "offers_buyer_agent_id_idx" ON "offers"("buyer_agent_id");
CREATE INDEX "offers_list_agent_id_idx" ON "offers"("list_agent_id");
CREATE INDEX "offers_status_idx" ON "offers"("status");
CREATE INDEX "offers_transmitted_to_seller_at_idx" ON "offers"("transmitted_to_seller_at");
CREATE INDEX "offers_received_at_idx" ON "offers"("received_at");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("listing_id")
    ON DELETE SET NULL ON UPDATE CASCADE;
