-- Family/friend visibility for non-IDX external listings.
-- Defaults fail-closed: outside listings remain private to the buyer until shared.

ALTER TABLE "external_listings"
  ADD COLUMN "family_visible" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "external_listings_lead_id_family_visible_idx"
  ON "external_listings"("lead_id", "family_visible");
