-- CAN-SPAM / TCPA: email suppression on Lead
ALTER TABLE "leads" ADD COLUMN "email_opt_out" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leads" ADD COLUMN "email_opt_out_at" TIMESTAMP(3);

-- CompanySetting: singleton key/value table (replaces filesystem data/company-settings.json)
CREATE TABLE "company_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" BIGINT,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("key")
);
