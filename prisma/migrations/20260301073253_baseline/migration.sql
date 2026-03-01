-- CreateTable
CREATE TABLE "agents" (
    "id" BIGSERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "full_name" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" TEXT,
    "license_no" TEXT,
    "license_type" TEXT,
    "license_expiry" TIMESTAMP(3),
    "sale_split" DECIMAL(6,3),
    "rental_split" DECIMAL(6,3),
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" BIGSERIAL NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "representation_code" TEXT,
    "property_address" TEXT,
    "price_usd" DECIMAL(14,2),
    "commission_rate_percent" DECIMAL(6,3),
    "split_percent" DECIMAL(6,3),
    "agent_fee_usd" DECIMAL(14,2),
    "company_fee_usd" DECIMAL(14,2),
    "gross_commission_usd" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contract_signed" TIMESTAMP(3),
    "contract_closed" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" BIGSERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "roles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'new',
    "portal_role" TEXT,
    "portal_token" TEXT,
    "password_hash" TEXT,
    "agent_id" BIGINT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" TEXT NOT NULL,
    "mls_id" TEXT,
    "agent_id" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "listing_type" TEXT NOT NULL,
    "property_type" TEXT,
    "property_sub_type" TEXT,
    "list_price" DECIMAL(14,2) NOT NULL,
    "bedrooms_total" INTEGER,
    "bathrooms_full" INTEGER,
    "bathrooms_half" INTEGER,
    "living_area" DECIMAL(10,2),
    "borough" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "idx_display_yn" BOOLEAN NOT NULL DEFAULT true,
    "internet_entire_listing_display_yn" BOOLEAN NOT NULL DEFAULT true,
    "internet_address_display_yn" BOOLEAN NOT NULL DEFAULT true,
    "participant_only" BOOLEAN NOT NULL DEFAULT false,
    "owner_opt_out" BOOLEAN NOT NULL DEFAULT false,
    "address" JSONB NOT NULL DEFAULT '{}',
    "features" JSONB NOT NULL DEFAULT '{}',
    "media" JSONB NOT NULL DEFAULT '[]',
    "compliance" JSONB NOT NULL DEFAULT '{}',
    "agent_info" JSONB NOT NULL DEFAULT '{}',
    "raw_data" JSONB,
    "modification_timestamp" TIMESTAMP(3) NOT NULL,
    "listing_contract_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_type" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_type" TEXT NOT NULL,
    "user_id" BIGINT,
    "changes" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_preferences" (
    "id" BIGSERIAL NOT NULL,
    "lead_id" BIGINT NOT NULL,
    "property_types" TEXT[],
    "neighborhoods" TEXT[],
    "boroughs" TEXT[],
    "min_beds" INTEGER,
    "max_beds" INTEGER,
    "min_baths" INTEGER,
    "max_baths" INTEGER,
    "min_price" DECIMAL(14,2),
    "max_price" DECIMAL(14,2),
    "min_sqft" INTEGER,
    "must_haves" TEXT[],
    "deal_breakers" TEXT[],
    "move_in_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_listing_actions" (
    "id" BIGSERIAL NOT NULL,
    "lead_id" BIGINT NOT NULL,
    "listing_id" BIGINT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_listing_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showings" (
    "id" BIGSERIAL NOT NULL,
    "lead_id" BIGINT,
    "listing_id" BIGINT NOT NULL,
    "agent_id" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "type" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "showings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" BIGSERIAL NOT NULL,
    "lead_id" BIGINT,
    "agent_id" BIGINT,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "last_run" TIMESTAMP(3),
    "result_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_email_key" ON "agents"("email");

-- CreateIndex
CREATE INDEX "deals_agent_id_idx" ON "deals"("agent_id");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_portal_token_key" ON "leads"("portal_token");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE INDEX "leads_agent_id_idx" ON "leads"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "listings_listing_id_key" ON "listings"("listing_id");

-- CreateIndex
CREATE INDEX "listings_status_listing_type_idx" ON "listings"("status", "listing_type");

-- CreateIndex
CREATE INDEX "listings_list_price_idx" ON "listings"("list_price");

-- CreateIndex
CREATE INDEX "listings_borough_neighborhood_idx" ON "listings"("borough", "neighborhood");

-- CreateIndex
CREATE INDEX "listings_property_type_idx" ON "listings"("property_type");

-- CreateIndex
CREATE INDEX "listings_bedrooms_total_idx" ON "listings"("bedrooms_total");

-- CreateIndex
CREATE INDEX "listings_modification_timestamp_idx" ON "listings"("modification_timestamp");

-- CreateIndex
CREATE INDEX "listings_idx_display_yn_owner_opt_out_idx" ON "listings"("idx_display_yn", "owner_opt_out");

-- CreateIndex
CREATE INDEX "listings_agent_id_idx" ON "listings"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_type_user_id_idx" ON "sessions"("user_type", "user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_user_type_user_id_idx" ON "audit_events"("user_type", "user_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_preferences_lead_id_key" ON "client_preferences"("lead_id");

-- CreateIndex
CREATE INDEX "client_preferences_lead_id_idx" ON "client_preferences"("lead_id");

-- CreateIndex
CREATE INDEX "client_listing_actions_lead_id_idx" ON "client_listing_actions"("lead_id");

-- CreateIndex
CREATE INDEX "client_listing_actions_listing_id_idx" ON "client_listing_actions"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_listing_actions_lead_id_listing_id_action_key" ON "client_listing_actions"("lead_id", "listing_id", "action");

-- CreateIndex
CREATE INDEX "showings_lead_id_idx" ON "showings"("lead_id");

-- CreateIndex
CREATE INDEX "showings_listing_id_idx" ON "showings"("listing_id");

-- CreateIndex
CREATE INDEX "showings_agent_id_idx" ON "showings"("agent_id");

-- CreateIndex
CREATE INDEX "showings_date_idx" ON "showings"("date");

-- CreateIndex
CREATE INDEX "saved_searches_lead_id_idx" ON "saved_searches"("lead_id");

-- CreateIndex
CREATE INDEX "saved_searches_agent_id_idx" ON "saved_searches"("agent_id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_preferences" ADD CONSTRAINT "client_preferences_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_listing_actions" ADD CONSTRAINT "client_listing_actions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_listing_actions" ADD CONSTRAINT "client_listing_actions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showings" ADD CONSTRAINT "showings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showings" ADD CONSTRAINT "showings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showings" ADD CONSTRAINT "showings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
