-- Add email verification fields to leads table
-- Self-signup clients require email verification.
-- Agent/broker-invited clients skip verification (email_verified_at set on invite acceptance).

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email_verify_token" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email_verify_expires" TIMESTAMP(3);

-- Backfill: mark all existing leads as verified (they were created before this feature)
UPDATE "leads" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
