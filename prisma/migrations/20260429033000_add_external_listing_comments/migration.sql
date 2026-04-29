-- Durable comment/request-info threads for non-IDX external listings.
-- Separate from comments/listings so outside inventory remains isolated from IDX data.

CREATE TABLE "external_listing_comments" (
  "id" BIGSERIAL PRIMARY KEY,
  "external_listing_id" BIGINT NOT NULL,
  "lead_id" BIGINT,
  "agent_id" BIGINT,
  "body" TEXT NOT NULL,
  "request_type" TEXT NOT NULL DEFAULT 'comment',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_listing_comments_external_listing_id_fkey"
    FOREIGN KEY ("external_listing_id") REFERENCES "external_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_listing_comments_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "external_listing_comments_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "external_listing_comments_external_listing_id_idx" ON "external_listing_comments"("external_listing_id");
CREATE INDEX "external_listing_comments_lead_id_idx" ON "external_listing_comments"("lead_id");
CREATE INDEX "external_listing_comments_agent_id_idx" ON "external_listing_comments"("agent_id");
CREATE INDEX "external_listing_comments_request_type_idx" ON "external_listing_comments"("request_type");
