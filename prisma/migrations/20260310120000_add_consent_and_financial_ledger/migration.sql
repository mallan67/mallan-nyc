-- AlterTable: Add consent_captured_at to leads
ALTER TABLE "leads" ADD COLUMN "consent_captured_at" TIMESTAMP(3);

-- CreateTable: Financial Ledger (immutable transaction log)
CREATE TABLE "financial_ledger" (
    "id" BIGSERIAL NOT NULL,
    "deal_id" BIGINT,
    "payment_id" BIGINT,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "running_balance" DECIMAL(14,2),
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "recorded_by" BIGINT NOT NULL,
    "immutable_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_ledger_deal_id_idx" ON "financial_ledger"("deal_id");
CREATE INDEX "financial_ledger_payment_id_idx" ON "financial_ledger"("payment_id");
CREATE INDEX "financial_ledger_entry_type_idx" ON "financial_ledger"("entry_type");
CREATE INDEX "financial_ledger_created_at_idx" ON "financial_ledger"("created_at");
