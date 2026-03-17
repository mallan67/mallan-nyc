-- Add financial profile fields to leads table
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lease_start_date" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "bonuses" DECIMAL(14,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "down_payment" DECIMAL(14,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "available_funds" DECIMAL(14,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "monthly_debt" DECIMAL(14,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "employer" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "work_title" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "rent_per_month" DECIMAL(14,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "rental_deposit" DECIMAL(14,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "total_monthly_expense" DECIMAL(14,2);
