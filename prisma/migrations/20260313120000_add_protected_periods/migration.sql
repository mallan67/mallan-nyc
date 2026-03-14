-- CreateTable: Protected Periods (UCBA Art. I, Sec. 5(D) — 90-day protection)
CREATE TABLE "protected_periods" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" BIGINT NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "agreement_expired_at" TIMESTAMP(3) NOT NULL,
    "names_deadline" TIMESTAMP(3) NOT NULL,
    "protection_ends_at" TIMESTAMP(3) NOT NULL,
    "names_submitted_at" TIMESTAMP(3),
    "notice_uploaded_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending_names',
    "notice_document_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protected_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Protected Buyers (names submitted within 7 biz days)
CREATE TABLE "protected_buyers" (
    "id" BIGSERIAL NOT NULL,
    "protected_period_id" BIGINT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_email" TEXT,
    "buyer_phone" TEXT,
    "notes" TEXT,
    "deal_executed" BOOLEAN NOT NULL DEFAULT false,
    "deal_executed_at" TIMESTAMP(3),
    "deal_price" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protected_buyers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protected_periods_listing_id_key" ON "protected_periods"("listing_id");
CREATE INDEX "protected_periods_agent_id_idx" ON "protected_periods"("agent_id");
CREATE INDEX "protected_periods_status_idx" ON "protected_periods"("status");
CREATE INDEX "protected_periods_protection_ends_at_idx" ON "protected_periods"("protection_ends_at");
CREATE INDEX "protected_periods_names_deadline_idx" ON "protected_periods"("names_deadline");
CREATE INDEX "protected_buyers_protected_period_id_idx" ON "protected_buyers"("protected_period_id");

-- AddForeignKey
ALTER TABLE "protected_periods" ADD CONSTRAINT "protected_periods_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protected_periods" ADD CONSTRAINT "protected_periods_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "protected_buyers" ADD CONSTRAINT "protected_buyers_protected_period_id_fkey" FOREIGN KEY ("protected_period_id") REFERENCES "protected_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
