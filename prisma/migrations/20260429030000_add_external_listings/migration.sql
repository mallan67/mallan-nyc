-- Buyer-submitted non-IDX listing links/addresses.
-- Kept separate from listings so outside inventory is never treated as IDX/MLS data.

CREATE TABLE "external_listings" (
  "id" BIGSERIAL PRIMARY KEY,
  "lead_id" BIGINT NOT NULL,
  "submitted_by_lead_id" BIGINT,
  "agent_id" BIGINT,
  "url" VARCHAR(2048),
  "normalized_url" VARCHAR(2048),
  "source_host" VARCHAR(255),
  "address" VARCHAR(500),
  "title" VARCHAR(255),
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "action_bucket" TEXT NOT NULL DEFAULT 'saved',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_listings_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_listings_submitted_by_lead_id_fkey"
    FOREIGN KEY ("submitted_by_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "external_listings_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "external_listings_lead_id_normalized_url_key"
  ON "external_listings"("lead_id", "normalized_url");
CREATE INDEX "external_listings_lead_id_idx" ON "external_listings"("lead_id");
CREATE INDEX "external_listings_agent_id_idx" ON "external_listings"("agent_id");
CREATE INDEX "external_listings_submitted_by_lead_id_idx" ON "external_listings"("submitted_by_lead_id");
CREATE INDEX "external_listings_status_idx" ON "external_listings"("status");
CREATE INDEX "external_listings_action_bucket_idx" ON "external_listings"("action_bucket");
