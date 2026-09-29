# Sponsor Database — Design Spec

> **Status:** DRAFT (parked until after PR 4 closes AND user explicitly authorizes implementation)
> **Created:** 2026-04-30
> **Owner:** Maya Allan
> **Brainstorming session:** 2026-04-30 (auto-mode + superpowers:brainstorming)
> **Related skill:** rebny-compliance, superpowers:brainstorming
> **Related spec:** `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` (external/FSBO inventory — separate but adjacent feature)
>
> **Hard limits at design time** (carried by user instruction 2026-04-30):
> - Spec only. No code, no schema, no migrations, no commits in this PR.
> - Implementation parked behind master plan PR 4 closeout AND explicit user authorization (same release conditions as the external-inventory spec — see `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`).
> - Backend-only feature. **Never public.** Same firewall pattern as the external-inventory spec.

## 1. Problem statement

NYC condo and co-op buildings have a category of inventory that is structurally important but poorly indexed inside mallan.nyc today: **sponsor units**. These are units held by the original developer / converter / building owner-of-record (the "sponsor" named on the building's NY AG offering plan).

Sponsor units have unique characteristics that matter to clients — especially first-time buyers — that mallan agents currently have no system to surface:

| Sponsor-unit attribute | Why it matters |
|---|---|
| No co-op board application | First-time buyers + non-W2 income + foreign buyers + LLC purchases all skip the board |
| Easy approval | Sponsor sets terms; no co-op rejection risk |
| Often well-priced | Sponsors price to clear inventory; less-renovated units below market |
| Closing speed | No board interview; weeks faster than typical co-op |
| Tax abatements | Many recent conversions still have 421-a / J-51 / etc. abatements remaining |

User insight (2026-04-30): **the sponsor brokerage hierarchy has three indirection layers**:
- **Sponsor LLC** — entity named on the offering plan; legal owner of unsold units. Often a single-purpose LLC (e.g., "100 East 90th Owner LLC").
- **Management company** — operational manager (e.g., **Rose Associates, AKAM, Halstead Property Management**). Usually a different entity from the sponsor; often manages many buildings.
- **Selling brokerage** — markets sponsor units to retail buyers. Could be the management company's in-house brokerage (e.g., **Douglas Elliman New Development**), the sponsor's in-house team, or a third-party exclusive listing broker.

**User correction (2026-04-30):** Many selling brokerages of sponsor inventory are **NOT REBNY members**, meaning the listings never enter REBNY RLS at all. They live on StreetEasy, building marketing sites, management-company sites, or only behind a "call the sales office" curtain. This is precisely the inventory the sponsor database surfaces.

Today, mallan agents discover sponsor inventory ad hoc — they pass a building, see a "sales office" sign, take a flyer, jot a note. That is not a system. Clients ask "what new buildings have unsold sponsor units in Park Slope?" and the agent has to phone every management company they remember.

## 2. Goals & non-goals

### Goals

- **Comprehensive directory** of NYC condo and co-op buildings — all 5 boroughs — with the sponsor LLC, management company, and selling brokerage relationships tracked.
- **Inventory tracking** of unsold sponsor units, derived from ACRIS deed records (the sponsor LLC is still grantor-of-record for unsold units).
- **Active listing capture** when a sponsor unit comes to market — links to RLS Listing if it's there, or stores a non-RLS sponsor listing record with the same disclaimer pattern as external inventory.
- **Sponsor classification badge** ("SPONSOR UNIT — no board, easy approval") on every detail surface.
- **Agent-only directory** with selective client visibility (invite OR send-included, same gate-pattern as external-inventory spec).
- **Compliance posture** identical to external-inventory: no public display, no `/api/listings`, no projection, no sitemap, no SEO indexing, audit trail, fail-closed.
- **Maximum legitimate coverage** — combine public-records ingest (REFB, ACRIS, DOB, HPD, NYC Open Data) with agent-curated enrichment (management company contact, selling brokerage commission terms, current asking price).

### Non-goals (Phase 1)

- Public display of any sponsor data (agent-CRM-only with explicit client share).
- Inclusion in `listing_search_projection` (PR 5's projection is RLS-only).
- Automated scraping of any source (deferred to a later phase behind a separate spec + legal review).
- Auto-populating commission terms — every sponsor unit's commission is confirmed by phone per agent practice.
- Replacing or duplicating RLS sponsor listings — when a sponsor unit IS in RLS, the database links to the RLS Listing row and adds the sponsor classification, doesn't re-store property fields.
- Tracking sponsor RENTAL inventory (sponsor sales only — Phase 1 focus). Sponsor rentals possible Phase 2+.

## 3. Phased rollout

### Phase 1 — Public-records ETL + manual enrichment MVP (this spec's deliverable)

| Capability | Surface |
|---|---|
| New schema: `sponsor_buildings`, `sponsor_entities`, `management_companies`, `selling_brokerages`, `sponsor_units`, `sponsor_listings`, `sponsor_listing_client_shares`, `sponsor_pii_reveal_log` | DB schema |
| ETL job: nightly refresh from NY AG REFB offering-plan database + ACRIS deed delta + NYC Open Data condo declarations + DOB CofO + HPD MDR | `lib/sponsor-db/etl/*.ts` + cron |
| Building lookup CRM page — search by neighborhood / address / sponsor / management company | `app/api/crm/sponsor-db/buildings/route.ts` + CRM UI |
| Building detail page — sponsor LLC, management company, selling brokerage (if known), unsold-unit count, contact info | `app/api/crm/sponsor-db/buildings/[id]/route.ts` + CRM UI |
| Agent enrichment form — manual entry of management company contact, selling brokerage, current asking price, commission terms | `app/api/crm/sponsor-db/buildings/[id]/enrich/route.ts` + UI |
| Sponsor listing capture — when an agent confirms an active sponsor unit listing, store it (links to RLS Listing if applicable; otherwise stores non-RLS shadow row) | `app/api/crm/sponsor-db/listings/route.ts` + UI |
| Sponsor classification badge on RLS listing pages — when an RLS Listing matches a sponsor unit, render "SPONSOR UNIT" badge | extends existing `app/listing/[...slug]/page.tsx` reading; **CRM-only badge surface** |
| Per-client invite + search-send (same as external-inventory spec) | `app/api/crm/sponsor-db/listings/[id]/share/route.ts` |
| Client portal — shared sponsor listings appear with disclaimer + sponsor badge | `app/api/portal/sponsor-listings/route.ts` |
| Disclaimer + public-route firewall | reuse `lib/external-inventory/disclaimer.ts` pattern; new `lib/sponsor-db/access.ts` |
| Owner/contact PII reveal flow with audit + attestation | matches external-inventory PII pattern |
| CI rule: `sponsor_*` table references confined to `app/api/crm/sponsor-db/**`, `app/api/portal/sponsor-listings/**`, `lib/sponsor-db/**` | extends `scripts/ci-compliance-check.js` |

**Coverage target for Phase 1:** all condo and co-op buildings with active offering plans on file at NY AG REFB across all 5 boroughs (~8,000–10,000 buildings).

### Phase 2 — Active-listing enrichment (separate spec)

| Capability | Notes |
|---|---|
| Bulk import of management-company sponsor inventory lists (CSV upload from agent who phoned a sales office) | Admin-bounded, FH scan, audit per row |
| Sponsor RENTAL inventory tracking | Same model, `listing_type = 'rent'` |
| Cross-reference to OneKey/MLSLI subscription rows when those land (per external-inventory spec Phase 2-A) | Linkage table |
| StreetEasy "sponsor sale" badge enrichment | Phase 3 of external-inventory spec; provides one more data source |

**Gating criteria for Phase 2:** Phase 1 in production ≥4 weeks, ≥100 building rows enriched manually, broker-admin sign-off.

### Phase 3 — Optional scraping (deferred — separate spec required)

| Capability | Notes |
|---|---|
| Scrape building marketing sites (e.g., `100east90.com`-style sales pages) | One adapter per project; selectors break frequently |
| Scrape management-company sponsor inventory pages (Rose, AKAM, etc.) | One adapter per company |
| Scrape StreetEasy "by sponsor" search results | Same ToS exposure as external-inventory Phase 3 |

**Gating criteria identical to external-inventory Phase 3:** Phase 1 + Phase 2 in production ≥6 weeks, written legal review, separate design spec, separate implementation PR.

**Phase 1 explicitly excludes scraping.** All Phase 1 ETL hits documented public APIs or downloads published government datasets. Public records have no ToS, no anti-bot defenses, and no DMCA exposure.

## 4. Data model

### 4.1 Hierarchy at a glance

```
sponsor_buildings (1) — physical building
   ├─ sponsor_entities (N) — sponsor LLC(s) named on offering plan(s) for this building
   ├─ management_companies (0..1) — operational manager (Rose, AKAM, etc.)
   ├─ selling_brokerages (0..1) — exclusive listing broker for sponsor units (current)
   ├─ sponsor_units (N) — units in the building (sponsor-held + sold-out)
   │     └─ sponsor_listings (0..1 active per unit) — current active sale of a sponsor unit
   │            └─ sponsor_listing_client_shares (N) — agent → client share gate
   └─ enrichment metadata — last manual touch, last ETL touch, agent notes, broker contact
```

Each entity is its own table so cross-cutting queries work cleanly:
- "All buildings managed by Rose Associates with unsold inventory in Brooklyn"
- "All sponsor units in Park Slope under $1.5M with no board"
- "All sponsor LLCs that have listed inventory through Douglas Elliman New Development in 2026"

### 4.2 `sponsor_buildings`

```prisma
model SponsorBuilding {
  id                          BigInt    @id @default(autoincrement())

  // NYC identifiers
  bbl                         String?   @unique          // Borough-Block-Lot — NYC's universal property identifier
  bin                         String?                    // DOB Building Identification Number
  condo_declaration_number    String?                    // ACRIS condo declaration ID

  // Address (canonicalized)
  street_number               String?
  street_dir_prefix           String?
  street_name                 String?
  street_suffix               String?
  city                        String?
  borough                     String?                    // 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island'
  postal_code                 String?
  address_normalized          String?   @db.VarChar(500) // canonical form for dedup

  // Building characteristics (from NYC Open Data + DOB)
  building_name               String?                    // e.g., "The Camelot", "100 East 90th"
  year_built                  Int?
  year_converted              Int?                       // when the building was condo/co-op converted (often != year_built)
  total_units                 Int?
  stories_total               Int?
  building_class              String?                    // 'Condo' | 'Co-op' | 'Condop' | 'Single-Owner Building'
  certificate_of_occupancy_date DateTime?
  has_doorman                 Boolean?
  has_elevator                Boolean?

  // Tax abatements (relevant for sponsor sales)
  active_abatement_program    String?                    // '421-a' | 'J-51' | '420-c' | 'ICAP' | etc.
  abatement_expiration_year   Int?

  // ETL provenance
  refb_plan_id_primary        String?                    // primary NY AG offering plan ID (most recent or accepted)
  last_etl_refresh            DateTime?
  last_etl_status             String?                    // 'ok' | 'partial' | 'not_found'

  // Manual enrichment
  last_agent_enrichment_at    DateTime?
  last_enriched_by_agent_id   BigInt?
  enrichment_notes            String?   @db.Text         // CRM-only

  created_at                  DateTime  @default(now())
  updated_at                  DateTime  @updatedAt

  sponsor_entity_links        SponsorBuildingSponsor[]
  current_management          SponsorBuildingManagement[]
  current_selling_brokerage   SponsorBuildingBrokerage[]
  units                       SponsorUnit[]

  @@index([borough, neighborhood])
  @@index([bbl])
  @@index([address_normalized])
  @@index([building_class])
  @@index([year_converted])
  @@map("sponsor_buildings")
}
```

`neighborhood` is derived during ETL from postal_code + community-district lookup, mirroring the existing `lib/geo/` pattern.

### 4.3 `sponsor_entities`

```prisma
model SponsorEntity {
  id                          BigInt    @id @default(autoincrement())

  // Legal entity
  legal_name                  String                     // "100 East 90th Owner LLC"
  legal_name_normalized       String    @db.VarChar(500) // dedup key
  entity_type                 String                     // 'LLC' | 'LP' | 'Inc' | 'Trust' | 'Other'
  formation_state             String?                    // usually 'NY' or 'DE'

  // Public records anchor
  registered_agent            String?                    // from NY DOS Division of Corporations
  registered_agent_address    String?

  // Aggregated principal contact (when discoverable from public records or agent enrichment)
  contact_name                String?
  contact_email               String?
  contact_phone               String?

  // Provenance
  source                      String                     // 'refb_offering_plan' | 'acris_deed' | 'agent_enrichment'
  refb_plan_ids               String[]  @default([])     // every plan this entity appears on as sponsor

  created_at                  DateTime  @default(now())
  updated_at                  DateTime  @updatedAt

  building_links              SponsorBuildingSponsor[]
  units                       SponsorUnit[]

  @@unique([legal_name_normalized])
  @@index([source])
  @@map("sponsor_entities")
}

model SponsorBuildingSponsor {
  id                  BigInt   @id @default(autoincrement())
  sponsor_building_id BigInt
  sponsor_entity_id   BigInt
  effective_from      DateTime?  // from offering plan effective date
  effective_to        DateTime?  // null if still active sponsor; set when superseded
  refb_plan_id        String?

  sponsor_building    SponsorBuilding @relation(fields: [sponsor_building_id], references: [id], onDelete: Cascade)
  sponsor_entity      SponsorEntity   @relation(fields: [sponsor_entity_id], references: [id], onDelete: Cascade)

  @@unique([sponsor_building_id, sponsor_entity_id, effective_from])
  @@index([sponsor_building_id])
  @@index([sponsor_entity_id])
  @@map("sponsor_building_sponsors")
}
```

### 4.4 `management_companies`

```prisma
model ManagementCompany {
  id                  BigInt    @id @default(autoincrement())
  name                String                              // "Rose Associates", "AKAM", "Halstead Property Management"
  name_normalized     String    @db.VarChar(500)
  contact_email       String?                             // sales@rose-associates.com (general)
  contact_phone       String?
  url                 String?

  // Brokerage relationship
  has_inhouse_brokerage Boolean  @default(false)
  inhouse_brokerage_id  BigInt?

  building_links      SponsorBuildingManagement[]

  @@unique([name_normalized])
  @@map("management_companies")
}

model SponsorBuildingManagement {
  id                      BigInt   @id @default(autoincrement())
  sponsor_building_id     BigInt
  management_company_id   BigInt
  effective_from          DateTime?
  effective_to            DateTime?

  sponsor_building        SponsorBuilding   @relation(fields: [sponsor_building_id], references: [id], onDelete: Cascade)
  management_company      ManagementCompany @relation(fields: [management_company_id], references: [id], onDelete: Cascade)

  @@index([sponsor_building_id])
  @@index([management_company_id])
  @@map("sponsor_building_management")
}
```

### 4.5 `selling_brokerages`

```prisma
model SellingBrokerage {
  id                  BigInt    @id @default(autoincrement())
  name                String                              // "Douglas Elliman New Development", "Compass Development", "Stribling"
  name_normalized     String    @db.VarChar(500)
  is_rebny_member     Boolean   @default(false)           // tracked because non-REBNY brokerages = not in RLS
  contact_email       String?
  contact_phone       String?
  url                 String?

  building_links      SponsorBuildingBrokerage[]

  @@unique([name_normalized])
  @@map("selling_brokerages")
}

model SponsorBuildingBrokerage {
  id                          BigInt   @id @default(autoincrement())
  sponsor_building_id         BigInt
  selling_brokerage_id        BigInt
  effective_from              DateTime?
  effective_to                DateTime?
  exclusive_listing_agent_name  String?                  // when known from public listing or agent enrichment

  sponsor_building            SponsorBuilding   @relation(fields: [sponsor_building_id], references: [id], onDelete: Cascade)
  selling_brokerage           SellingBrokerage  @relation(fields: [selling_brokerage_id], references: [id], onDelete: Cascade)

  @@index([sponsor_building_id])
  @@index([selling_brokerage_id])
  @@map("sponsor_building_brokerages")
}
```

### 4.6 `sponsor_units`

Derived during ETL from ACRIS deed delta. A unit is "sponsor-held" when the most recent recorded grantor (or the original conveyor) is a SponsorEntity and there's no subsequent recorded sale to a unit owner.

```prisma
model SponsorUnit {
  id                          BigInt   @id @default(autoincrement())
  sponsor_building_id         BigInt
  current_sponsor_entity_id   BigInt?                    // null if subsequently sold

  unit_number                 String
  unit_number_normalized      String                     // "5A" -> "5a", "Apt 5A" -> "5a"
  bedrooms_total              Int?
  bathrooms_full              Int?
  bathrooms_half              Int?
  living_area                 Decimal?  @db.Decimal(10, 2)

  // Status — derived from latest deed
  ownership_status            String   @default("sponsor_held") // 'sponsor_held' | 'sold' | 'unknown'
  last_sale_date              DateTime?
  last_sale_price             Decimal?  @db.Decimal(14, 2)
  last_sale_grantee           String?

  // Cross-reference to RLS Listing when applicable
  rls_listing_id              String?                    // FK-by-string to listings.listing_id (when active in RLS)

  created_at                  DateTime  @default(now())
  updated_at                  DateTime  @updatedAt

  building                    SponsorBuilding @relation(fields: [sponsor_building_id], references: [id], onDelete: Cascade)
  sponsor_entity              SponsorEntity?  @relation(fields: [current_sponsor_entity_id], references: [id], onDelete: SetNull)
  active_listing              SponsorListing?

  @@unique([sponsor_building_id, unit_number_normalized])
  @@index([sponsor_building_id])
  @@index([current_sponsor_entity_id])
  @@index([ownership_status])
  @@index([rls_listing_id])
  @@map("sponsor_units")
}
```

### 4.7 `sponsor_listings`

Active sale of a sponsor unit. Two cases:
1. **Listing IS in RLS** — `rls_listing_id` set, no separate listing fields stored (inherits from `Listing` row).
2. **Listing is NOT in RLS** — non-RLS shadow listing, fields stored locally with the same disclaimer pattern as `external_inventory_listings`.

```prisma
model SponsorListing {
  id                          BigInt   @id @default(autoincrement())
  sponsor_unit_id             BigInt   @unique           // one active listing per unit at a time
  source                      String                     // 'rls' | 'streeteasy_sponsor' | 'building_marketing_site' | 'management_company_site' | 'agent_enrichment' | 'csv_import' | 'manual_phone'
  source_url                  String?  @db.VarChar(2048)
  source_disclaimer           String   @db.Text          // versioned, stamped at write
  source_disclaimer_version   String   @default("v1")

  // For RLS-sourced listings: link only
  rls_listing_id              String?                    // FK-by-string to listings.listing_id

  // For non-RLS shadow listings: fields stored
  list_price                  Decimal? @db.Decimal(14, 2)
  public_remarks              String?  @db.Text          // FH-scanned before save / share
  private_notes               String?  @db.Text          // CRM-only
  photos                      Json     @default("[]")
  primary_photo_url           String?
  list_date                   DateTime?
  status                      String   @default("active") // 'active' | 'in_contract' | 'closed' | 'withdrawn' | 'stale'

  // Selling-side contact (NOT the sponsor LLC — the broker representing them)
  selling_brokerage_id        BigInt?
  selling_agent_name          String?
  selling_agent_email         String?
  selling_agent_phone         String?

  // Commission terms (manually phoned in by the discovering agent — never trusted from a feed)
  commission_confirmed_at     DateTime?
  commission_confirmed_by_agent_id BigInt?
  commission_terms            String?  @db.Text          // free text — agent's notes from the call
  commission_basis            String?                    // 'percent_of_sale' | 'flat_fee' | 'tbd'
  commission_value            Decimal? @db.Decimal(14, 4)

  // Brokerage discovery
  discovered_by_agent_id      BigInt?
  discovered_at               DateTime @default(now())
  last_seen_at                DateTime @default(now())
  last_verified_at            DateTime?
  last_verified_by_agent_id   BigInt?

  // Search support
  is_searchable               Boolean  @default(true)
  search_tokens               String[] @default([])

  created_at                  DateTime @default(now())
  updated_at                  DateTime @updatedAt

  sponsor_unit                SponsorUnit @relation(fields: [sponsor_unit_id], references: [id], onDelete: Cascade)
  shares                      SponsorListingClientShare[]

  @@index([source, status])
  @@index([sponsor_unit_id])
  @@index([discovered_by_agent_id])
  @@index([commission_confirmed_at])
  @@index([is_searchable, status])
  @@map("sponsor_listings")
}
```

**Commission fields are deliberately first-class in the model.** Agent practice (per user 2026-04-30): "we have to call to confirm commission with every agent and brokerage." The model captures (a) the call happened, (b) who made it, (c) when, (d) what they were told. That's the system of record for commission verification.

### 4.8 `sponsor_listing_client_shares`

Identical pattern to `external_inventory_client_shares`. The **only** mechanism by which a client can see a sponsor listing.

```prisma
model SponsorListingClientShare {
  id                              BigInt    @id @default(autoincrement())
  sponsor_listing_id              BigInt
  sponsor_listing                 SponsorListing @relation(fields: [sponsor_listing_id], references: [id], onDelete: Cascade)
  lead_id                         BigInt
  lead                            Lead      @relation(fields: [lead_id], references: [id], onDelete: Cascade)
  shared_by_agent_id              BigInt
  shared_via                      String    // 'invite' | 'search_send' | 'collection'
  shared_at                       DateTime  @default(now())
  revoked_at                      DateTime?
  revoked_by_agent_id             BigInt?
  viewed_at                       DateTime?
  client_reaction                 String?   // 'liked' | 'passed' | 'discuss' | 'tour_requested'
  client_reaction_at              DateTime?
  agent_note                      String?   @db.Text

  @@unique([sponsor_listing_id, lead_id])
  @@index([lead_id, revoked_at])
  @@index([shared_by_agent_id])
  @@map("sponsor_listing_client_shares")
}
```

### 4.9 `sponsor_pii_reveal_log`

PII for `SponsorEntity.contact_*` and `SponsorListing.selling_agent_*` is access-controlled and audited. Same pattern as `external_inventory_pii_reveal_log`.

```prisma
model SponsorPiiRevealLog {
  id                              BigInt    @id @default(autoincrement())
  entity_type                     String    // 'sponsor_entity' | 'sponsor_listing_selling_agent' | 'management_company_contact' | 'selling_brokerage_contact'
  entity_id                       BigInt    // ID into the respective table
  revealed_to_agent_id            BigInt
  revealed_at                     DateTime  @default(now())
  fields_revealed                 String[]
  contact_intent_attestation      Boolean
  ip_address                      String?
  user_agent                      String?
  request_path                    String

  @@index([entity_type, entity_id])
  @@index([revealed_to_agent_id, revealed_at])
  @@map("sponsor_pii_reveal_log")
}
```

### 4.10 Future (NOT in this spec)

- `sponsor_listing_price_history` relation — promoted from any future Json column on `SponsorListing` if query patterns demand SQL aggregation.
- `sponsor_rentals` — Phase 2 sponsor RENTAL inventory (different listing semantics, longer lease terms, etc.).
- `sponsor_unit_marketing_collateral` — flyer / floorplan / brochure storage in R2.

## 5. Sources & ETL

### 5.1 Source matrix (Phase 1 — public records only)

| Source | URL / API | Freq | Coverage | Cost |
|---|---|---|---|---|
| **NY AG Real Estate Finance Bureau (REFB)** | `ag.ny.gov/real-estate-finance` | Monthly | Every condo/co-op offering plan ever filed; sponsor LLC + plan ID + accepted/effective date | Free |
| **NYC ACRIS (Department of Finance)** | `a836-acris.nyc.gov` + ACRIS bulk dataset on NYC Open Data | Weekly delta | Every recorded deed; allows "all units the sponsor LLC still holds" computation | Free |
| **NYC Open Data — MapPLUTO** | `opendata.cityofnewyork.us` | Quarterly | BBL-keyed parcel data (year built, lot, building class, etc.) | Free |
| **NYC DOB** | `data.cityofnewyork.us` (DOB datasets) | Weekly | Certificate of Occupancy, new construction permits, BIN lookup | Free |
| **NYC HPD** | `data.cityofnewyork.us` (HPD datasets) | Monthly | Multiple-Dwelling Registration → owner/managing agent contact-of-record | Free |
| **NY DOS Division of Corporations** | `dos.ny.gov/corps` | On-demand | Registered agent + entity status for sponsor LLCs | Free |
| **Geocoding** (existing) | `lib/geo/geocode.ts` | On-demand | Lat/lng for buildings | Free (Census API) |

**No scraping in Phase 1.** Every source is a documented government API or published dataset.

### 5.2 ETL pipeline shape

```
Daily cron @ 4am ET → app/api/cron/sponsor-db-etl/route.ts

  Phase 1.1 — REFB delta (monthly only, skipped on other days)
    - Pull newly-filed and newly-accepted offering plans since last run
    - Insert into sponsor_entities + sponsor_buildings + sponsor_building_sponsors

  Phase 1.2 — ACRIS delta (weekly only, skipped on other days)
    - Pull recorded deeds since last run
    - Update sponsor_units.ownership_status (sponsor_held → sold)
    - Update sponsor_units.last_sale_date / last_sale_price

  Phase 1.3 — NYC Open Data refresh (quarterly only)
    - Refresh building characteristics (year_built, total_units, etc.)

  Phase 1.4 — DOB / HPD enrichment (weekly)
    - Refresh CofO date, MDR contact-of-record

  Phase 1.5 — Cross-link (every run)
    - For every sponsor_unit, check if rls_listing_id should be set:
        match by address_normalized + unit_number_normalized
        against active listings WHERE listing_type IN ('sale')
    - Set rls_listing_id when match found
    - Set sponsor_listings.rls_listing_id when active listing matches a sponsor unit

  Audit event per phase, success/failure heartbeat per run
```

**Idempotency:** every ETL job is upsert-by-canonical-key (BBL for buildings, normalized LLC name for entities, BBL+unit for units). Replays don't duplicate.

### 5.3 Manual enrichment

ETL gives the skeleton. Agents fill in operational detail that public records don't cover:

| Field | Source | Workflow |
|---|---|---|
| Management company contact (operations team email/phone) | Agent calls Rose/AKAM/etc. | "Enrich Building" form on building detail page |
| Selling brokerage exclusive (current) | Agent reads StreetEasy listing or building marketing site | Same form |
| Selling agent name + contact | Same | Same |
| Commission terms | Agent calls selling brokerage | "Confirm Commission" on a sponsor listing detail |
| Current asking price (when not in RLS) | Agent calls or reads marketing site | "Add Sponsor Listing" form when ETL hasn't found one |
| Tax abatement remaining years (operational detail) | Agent reads offering plan / closing docs | Building enrichment form |

Every manual enrichment writes an `audit_event` and updates `last_agent_enrichment_at` on the building.

## 6. Workflows

### 6.1 Discovering sponsor inventory (broker-side)

**Find a building:**
- Agent CRM → "Sponsor Database" → search by neighborhood / address / sponsor LLC / management company
- Result: list of buildings with sponsor presence + how many units the sponsor still holds + active sponsor listings (linked or shadowed)

**Open a building:**
- Sponsor LLC + management company + selling brokerage panel
- Unsold-unit count (from ACRIS-derived `sponsor_units.ownership_status='sponsor_held'`)
- Active listing summaries
- Tax abatement details
- Agent enrichment notes
- "Edit/Enrich" button (agent fills the operational metadata)

**Confirm commission on a listing:**
- Agent opens a sponsor listing → "Confirm Commission" → modal captures (a) date called, (b) who they spoke to, (c) terms, (d) basis (% of sale or flat), (e) value
- Writes `commission_confirmed_at` + `commission_confirmed_by_agent_id` + `commission_terms` + `commission_basis` + `commission_value`
- Audit event

### 6.2 Search inclusion

CRM IDX search gains a SECOND new toggle (paired with the external-inventory toggle):

- "Include non-RLS inventory" — covers external-inventory rows
- "Include sponsor inventory" — covers sponsor listings (whether RLS-linked or shadow)

Both default OFF. Agent opt-in per search.

When ON, search results include:
- Active `SponsorListing` rows where `rls_listing_id IS NULL` (shadow listings) — rendered with sponsor badge + non-RLS disclaimer
- Active `SponsorListing` rows where `rls_listing_id IS NOT NULL` (RLS listings classified as sponsor) — rendered with sponsor badge ON TOP of the existing RLS row (no duplicate row in results; just an additional badge)

### 6.3 Per-client invite

Same pattern as external-inventory:
- Agent opens a sponsor listing → "Share with client" → picks lead → creates `SponsorListingClientShare`
- Client portal shows the listing with sponsor badge + appropriate disclaimer

### 6.4 Search-send bulk share

Master plan PR 8's `ListingSend` extension supports both external-inventory and sponsor-listing items. Agent explicitly checks each item to send. **Never auto-included.**

### 6.5 Client portal — read-only

Client `/api/portal/sponsor-listings`:
- Shows only listings where the client has a `SponsorListingClientShare` row (revoked_at IS NULL)
- DTO sanitized — strips selling agent PII, sponsor-entity PII, management contact, private notes, commission terms (commission is broker-side info)
- Renders: address, unit, beds/baths/sqft, list price, photos, public remarks, sponsor badge, non-RLS disclaimer (if applicable), tax abatement summary

Client cannot:
- Search sponsor inventory
- View buildings the agent hasn't shared with them
- See sponsor LLC / management / brokerage operational contacts
- See commission terms

Client can:
- React (`liked` / `passed` / `discuss` / `tour_requested`)
- Comment via existing `Comment` model
- Request a tour → emails the sharing agent (NOT the sponsor's selling brokerage; the mallan agent coordinates)

## 7. PII access control

### 7.1 Access matrix

| Caller | What they see |
|---|---|
| Discovering agent (`discovered_by_agent_id === viewer.id`) | All fields incl. selling agent contact, sponsor LLC contact (if known), commission terms |
| Broker admin | All fields |
| Other mallan agents | Building + sponsor entity (LLC name only) + management company name + selling brokerage name + listing summary. **No** PII (no contact emails/phones), **no** commission terms |
| Client portal (any lead) | Only listings shared with them; sanitized DTO (no PII, no commission, no operational contacts) |
| Public/SEO/system | Never queries any sponsor_* table |

### 7.2 Reveal flow

`POST /api/crm/sponsor-db/reveal-contact`

Body:
```json
{
  "entity_type": "sponsor_entity" | "sponsor_listing_selling_agent" | "management_company_contact" | "selling_brokerage_contact",
  "entity_id": 12345,
  "contact_intent_attestation": true
}
```

Server: same shape as external-inventory PII reveal — ACL check, attestation check, audit log to `sponsor_pii_reveal_log`, return PII fields.

Frontend: same modal pattern as external-inventory. Same TCPA/§175.25 attestation language.

### 7.3 Sponsor LLC public-record exception

The sponsor LLC's **legal name** and **registered agent address** are public per NY DOS — no attestation needed for these. Only `contact_email`, `contact_phone`, and `contact_name` (the natural person behind the LLC) require attestation, since these are typically discovered through agent research outside public records.

## 8. Disclaimer system

### 8.1 Two disclaimers, two scopes

**Sponsor classification badge** (always rendered, no compliance language):

> "**SPONSOR UNIT** — direct sale by sponsor / no co-op board approval / streamlined closing"

**Non-RLS source disclaimer** (rendered when `SponsorListing.source !== 'rls'`):

> "**THIS LISTING DID NOT ORIGINATE FROM THE RLS / REBNY. PLEASE VERIFY ALL INFORMATION INDEPENDENTLY.** Listing data is sourced from the building's selling brokerage, the management company, the sponsor's marketing materials, or agent research; mallan.nyc has not verified accuracy. Photos, pricing, and availability may be outdated. Confirm directly with the listing brokerage before relying on any detail."

Both stamped at write time on the `SponsorListing` row. Both render on every CRM card, CRM detail, portal card, portal detail, send email, and export — same surface list as external-inventory.

### 8.2 RLS-linked sponsor listings

When `rls_listing_id IS NOT NULL`, the listing is in RLS — non-RLS disclaimer NOT shown. The sponsor classification badge IS shown (it's a property of the unit, not the data source). REBNY UCBA Art. III §2(C) attribution rules apply normally.

### 8.3 Versioning

Same `disclaimer_version` pattern as external-inventory. New rows get current default; old rows keep original wording; one-shot SQL UPDATE if legal demands retroactive change.

## 9. Compliance posture (the firewall)

### 9.1 Boundaries — what sponsor data is NOT

- **Never publicly displayed.** No `/api/listings`, `/api/listings/[id]`, `/api/listings/similar`, `/search`, neighborhood pages, building public pages, or sitemap reads any `sponsor_*` table.
- **Never in `listing_search_projection`.** Sponsor data has its own tables; no projection write.
- **Never SEO-indexed.** No JSON-LD, no Open Graph for sponsor pages.
- **Never attributed as "REBNY listing courtesy of"** unless `rls_listing_id IS NOT NULL` (in which case the existing RLS attribution applies via the linked Listing row).
- **Never re-described as RLS data.** Sponsor classification is a property of the unit; the underlying listing's data source is preserved.

### 9.2 Public-surface firewall — `assertNotPublicSurface()`

Mirror of external-inventory pattern. New file `lib/sponsor-db/access.ts`:

```ts
export function assertNotPublicSurface(routePath: string): void {
  // Throws if routePath starts with any public surface marker.
  // Reuses the same PUBLIC_ROUTE_MARKERS list as lib/external-inventory/access.ts.
}
```

Every `lib/sponsor-db/**` query helper calls this on the request path before any DB read.

### 9.3 CI rule

Added to `scripts/ci-compliance-check.js`:

```js
// Sponsor DB references must be confined to approved CRM/portal/lib paths.
const sponsorDbReferences = findFiles(ROOT, ['ts', 'tsx', 'js'])
  .filter(f => /sponsor_(buildings|entities|units|listings|listing_client_shares|pii_reveal_log)|sponsor-db|SponsorBuilding|SponsorEntity|SponsorUnit|SponsorListing|SponsorListingClientShare/.test(fs.readFileSync(f, 'utf8')))
  .filter(f => {
    const rel = path.relative(ROOT, f);
    const allowed = /^(app\/(api\/(crm|portal)\/sponsor-db|api\/(crm|portal)\/sponsor-listings|api\/cron\/sponsor-db-etl|portal\/(buyer|tenant|seller|landlord)\/.*\/sponsor-listings)|lib\/sponsor-db|scripts\/.*-sponsor-db|tests?\/.*-sponsor-db)/;
    return !allowed.test(rel);
  });

if (sponsorDbReferences.length === 0) {
  pass('Sponsor DB references confined to approved CRM/portal/lib paths');
} else {
  fail(`Sponsor DB references found in disallowed paths: ${sponsorDbReferences.map(f => path.relative(ROOT, f)).join(', ')}`);
}
```

Compliance check count rises 91 → 92 (after external-inventory's 90 → 91 lands).

### 9.4 Portal DTO sanitizer

`lib/sponsor-db/portal-dto.ts`:

```ts
export function sponsorListingPortalDTO(
  share: SponsorListingClientShare & { sponsor_listing: SponsorListing & { sponsor_unit: SponsorUnit & { building: SponsorBuilding } } },
): PortalSponsorListingDTO {
  // Strip ALL: selling_agent_*, sponsor_entity contact, management_company contact,
  //   selling_brokerage contact, commission_*, private_notes, raw_etl_data,
  //   discovered_by_agent_id, last_verified_by_agent_id.
  // Keep: address, unit, beds/baths/sqft, list_price, photos, public_remarks,
  //   sponsor_badge, source_disclaimer (if applicable), tax_abatement_summary.
}
```

### 9.5 Fair Housing scanning

- `SponsorListing.public_remarks` runs through the existing FH scanner at save AND share time.
- `SponsorBuilding.enrichment_notes` is CRM-only (private to agents); not scanned.
- ETL-ingested data (offering plan text, etc.) is NOT scanned at ingest because it's government-issued boilerplate — but if any such field gets surfaced to clients via the portal DTO (it doesn't, in this design), scan would be added.

### 9.6 REBNY / RLS / UCBA boundaries

| Rule | How this design preserves it |
|---|---|
| UCBA Art. I §4 — RLS only accepts Exclusive Listings | Sponsor data lives in its own tables; doesn't enter RLS. RLS-linked sponsor listings remain RLS-eligible by virtue of their underlying Listing row. |
| UCBA Art. I §5(D) — no "Off-Market" language | Sponsor units are NOT off-market — they're being publicly sold by the sponsor's selling brokerage. Disclaimer wording emphasizes "did not originate from RLS," not "off-market." |
| UCBA Art. III §2(C) — attribution | RLS-linked sponsor listings inherit attribution from the linked Listing. Non-RLS sponsor listings carry the non-RLS disclaimer. |
| UCBA Art. III §3 — no solicitation of existing listings | Sponsor LLC + selling brokerage relationships are public records. Adding them to a directory is research, not solicitation. The mallan agent contacts the SELLING BROKERAGE (not the seller directly) per standard co-broke etiquette. |
| Fair Housing | Save-time + share-time scan on `public_remarks` (§9.5). |
| NY DOS §175.25 advertising | Sponsor data is never advertising — never public, agent-only directory + invited-client portal. Disclaimer makes the source explicit. |
| TCPA / CAN-SPAM | PII reveal requires attestation. Owner / sponsor LLC contact emails sent by agents are subject to existing TCPA controls. |
| NY SHIELD Act | PII access logged in `sponsor_pii_reveal_log` (§4.9). Retention follows existing data-retention cron policy. |

### 9.7 Commission verification posture

Every sponsor listing must have a `commission_confirmed_at` before it can be shared with a client. Enforced at the share-API layer:

```ts
if (!sponsorListing.commission_confirmed_at) {
  return error('Cannot share a sponsor listing until commission terms are confirmed by phone with the selling brokerage.');
}
```

This is a deliberate friction point — it forces the agent to make the call first. The user's note ("we have to call to confirm commission with every agent and brokerage") becomes systematized.

## 10. Implementation surface (Phase 1 only)

### 10.1 New files

| Path | Purpose |
|---|---|
| `lib/sponsor-db/disclaimer.ts` | Disclaimer + sponsor-badge text constants + version |
| `lib/sponsor-db/access.ts` | `assertNotPublicSurface()` + ACL helpers |
| `lib/sponsor-db/normalize.ts` | LLC-name normalization + unit-number canonicalization (could share with external-inventory) |
| `lib/sponsor-db/portal-dto.ts` | DTO sanitizer for client-portal reads |
| `lib/sponsor-db/etl/refb.ts` | NY AG REFB offering-plan ingest |
| `lib/sponsor-db/etl/acris.ts` | ACRIS deed delta ingest |
| `lib/sponsor-db/etl/nyc-open-data.ts` | MapPLUTO + DOB + HPD ingest |
| `lib/sponsor-db/etl/cross-link.ts` | Match sponsor units to active RLS Listings |
| `lib/sponsor-db/etl/run.ts` | Orchestrator called by cron |
| `lib/sponsor-db/__tests__/*.test.ts` | Tests for ACL, normalization, ETL idempotency, portal DTO, FH scan, share gate, disclaimer stamping, commission gate |
| `app/api/crm/sponsor-db/buildings/route.ts` | GET (search/list) |
| `app/api/crm/sponsor-db/buildings/[id]/route.ts` | GET (detail), PATCH (enrich) |
| `app/api/crm/sponsor-db/buildings/[id]/enrich/route.ts` | POST (record enrichment activity) |
| `app/api/crm/sponsor-db/listings/route.ts` | GET (list), POST (create non-RLS shadow) |
| `app/api/crm/sponsor-db/listings/[id]/route.ts` | GET (detail), PATCH (edit), DELETE (soft-delete) |
| `app/api/crm/sponsor-db/listings/[id]/commission/route.ts` | POST (confirm commission terms) |
| `app/api/crm/sponsor-db/listings/[id]/share/route.ts` | POST (share with client) |
| `app/api/crm/sponsor-db/listings/[id]/share/[shareId]/route.ts` | DELETE (revoke share) |
| `app/api/crm/sponsor-db/reveal-contact/route.ts` | POST (PII reveal with attestation) |
| `app/api/portal/sponsor-listings/route.ts` | GET (client list of shared) |
| `app/api/portal/sponsor-listings/[id]/route.ts` | GET (client detail) |
| `app/api/portal/sponsor-listings/[id]/react/route.ts` | POST (client reaction) |
| `app/api/cron/sponsor-db-etl/route.ts` | Daily orchestration cron |
| `public/crm/js/dashboard/panels/sponsor-db.js` | CRM UI |
| `app/portal/buyer/sponsor-listings/page.tsx` (+ tenant/seller/landlord variants) | Portal UI |

### 10.2 Modified files

| Path | Change |
|---|---|
| `prisma/schema.prisma` | +9 models + indexes + back-relations on `Lead`, `Agent`, `Listing`. Schema-only migration. |
| `app/api/idx/search/route.ts` | Accept `include_sponsor_inventory` boolean param; union with sponsor listing rows when true. Default OFF. |
| `vercel.json` | Add `sponsor-db-etl` cron entry (daily 4am ET) |
| `scripts/ci-compliance-check.js` | +1 check (sponsor-db references confined to allowlist) |
| `app/sitemap.ts` | (Verify only — confirm it does not enumerate sponsor tables) |
| `app/robots.ts` | (Verify only — confirm `/portal/*/sponsor-listings` paths are not crawlable) |
| `lib/idx/db-to-public-dto.ts` | (No change. Sponsor classification badge is CRM-side only; it does NOT decorate the public DTO. Public listing pages remain identical.) |

### 10.3 Migration

One additive migration creates 9 tables + indexes. No backfill required (tables start empty). Initial ETL run populates first wave. Apply manually to Neon prod per `NEON.md` discipline before code merge.

### 10.4 Storage estimate

- ~10,000 buildings × ~500 bytes/row = ~5 MB
- ~50,000 sponsor entities × ~400 bytes = ~20 MB
- ~500,000 sponsor units × ~200 bytes = ~100 MB
- ~5,000 active sponsor listings × ~2 KB (with photos JSON) = ~10 MB
- Audit log growth: ~10 KB/day

Total at steady state: ~135 MB on top of the current 258 MB. Fits in current Neon 500 MB free cap with ~100 MB headroom. **Storage budget triggers a Neon plan-tier check before this ships.**

## 11. Edge cases

| Case | Resolution |
|---|---|
| Same physical building has multiple offering plans (newer plan supersedes older) | `sponsor_building_sponsors` keeps both rows with effective_from/effective_to; latest active plan = current sponsor |
| Sponsor LLC dissolved or merged | LLC entity stays in DB for historical record; status flag added (Phase 2) |
| Building has been gut-renovated and re-converted under a new sponsor | New offering plan triggers new `sponsor_building_sponsors` row; older sponsor entry's `effective_to` is set |
| Unit number ambiguity ("5A" vs "Apt 5A" vs "Unit 5A") | `unit_number_normalized` canonicalizes; dedup via unique constraint |
| Sponsor unit listed in RLS by a non-management broker | `SponsorListing.source = 'rls'` + `rls_listing_id` set; sponsor classification still applies |
| Sponsor unit listed by management company's in-house brokerage on building marketing site, NOT in RLS | `SponsorListing.source = 'building_marketing_site'` (or similar), shadow row stored, non-RLS disclaimer + sponsor badge both render |
| ACRIS deed shows sponsor sold to ANOTHER LLC (likely a flip or partner buyout, not a retail sale) | `sponsor_units.ownership_status` flagged for agent review; doesn't auto-flip to "sold" |
| RLS Listing matches a sponsor unit but owner is no longer the sponsor LLC | ACRIS-derived ownership status takes precedence; `sponsor_listings.rls_listing_id` cleared; the listing is still in RLS but no longer classified as sponsor |
| Two different sponsor LLCs claim the same BBL (data error in REFB or ACRIS) | Manual review queue; ETL flags via audit_event; agent reconciles |

## 12. Testing posture

| Test suite | Coverage |
|---|---|
| `lib/sponsor-db/__tests__/access.test.ts` | `assertNotPublicSurface` throws on every public-route prefix; ACL allows discovering agent + broker_admin |
| `lib/sponsor-db/__tests__/normalize.test.ts` | LLC name normalization (LLC vs L.L.C., trailing punctuation, capitalization); unit number normalization |
| `lib/sponsor-db/__tests__/etl-refb.test.ts` | REFB ingest is idempotent; replays don't duplicate; unknown plan fields don't crash |
| `lib/sponsor-db/__tests__/etl-acris.test.ts` | ACRIS deed delta correctly flips ownership_status; multi-deed history preserves order |
| `lib/sponsor-db/__tests__/etl-cross-link.test.ts` | Sponsor unit ↔ RLS Listing match logic; updates rls_listing_id correctly when listing goes inactive |
| `lib/sponsor-db/__tests__/portal-dto.test.ts` | Portal DTO strips ALL sensitive fields under any input |
| `lib/sponsor-db/__tests__/disclaimer.test.ts` | Stamping at write time; sponsor-badge always rendered; non-RLS disclaimer rendered iff source != 'rls' |
| `lib/sponsor-db/__tests__/share-gate.test.ts` | Share blocked when `commission_confirmed_at` is null; share creates `SponsorListingClientShare`; revoke flips visibility |
| `lib/sponsor-db/__tests__/fair-housing.test.ts` | Save-time and share-time FH scans block on prohibited terms |
| Integration test on PII reveal API | Reveal requires attestation; logs to `sponsor_pii_reveal_log`; respects ACL |
| CI rule test | Adding a reference to `sponsor_listings` in `app/api/listings/route.ts` causes compliance-check fail |

All tests run via `lib/sponsor-db/jest.config.js` mirroring existing package-local Jest pattern.

## 13. Rollout plan (when Phase 1 implementation PR ships)

1. Storage budget check — confirm Neon headroom for ~135 MB additional.
2. Migration applied to Neon prod (manual, per NEON.md).
3. Code merged to main (one PR for the Phase 1 surface; ~5–7 weeks of active dev given ETL complexity).
4. Initial ETL run on prod — populates first ~10,000 buildings + ~500,000 units. Single-pass, ~hours of compute. Coordinated downtime not required (read-only inserts on new tables).
5. Internal canary: broker-admin Maya enters 5 building enrichments + confirms commission on 5 listings + shares with 5 test clients.
6. Agent rollout: announce + brief written guide.
7. Observation window: 4 weeks. Track building rows, enrichment count, share count, PII reveals, FH scan rejections, ETL heartbeat, commission-confirm count.
8. Phase 2 gating decision after observation.

**No production deploy of Phase 1 until master plan PR 4 closes cleanly** AND the user explicitly authorizes implementation (per active hold on `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`).

## 14. Self-review

> **Does this ever expose sponsor data publicly?**
>
> No. §9.1 enumerates every surface and the answer is "never" for all of them. §9.2 defines `assertNotPublicSurface()` that throws if a `lib/sponsor-db/**` helper is invoked from a public route. §9.3 adds a CI rule that fails on any reference to sponsor tables from `app/api/listings/`, sitemap, or other public paths. §9.4 sanitizes the portal DTO so PII / commission / operational contacts never reach the client surface.

> **Could sponsor data leak into `/api/listings`, sitemap, SEO, or `listing_search_projection`?**
>
> No. (a) `/api/listings` only reads `listings` and never imports `lib/sponsor-db/**` — enforced by the CI rule. (b) Sitemap explicitly verified not to enumerate (modified-files §10.2). (c) No JSON-LD / structured data emitted for sponsor pages. (d) PR 5's `listing_search_projection` is RLS-only by design; this spec adds no projection write paths and the CI rule blocks accidental references. (e) The "sponsor classification badge" on RLS-linked sponsor listings is rendered CRM-side only — never on the public DTO.

> **Are PII / commission / operational-contact controls explicit?**
>
> Yes. §7 defines the access matrix (discovering agent + broker_admin only), the explicit two-step reveal flow with TCPA/CAN-SPAM/§175.25 attestation, the dedicated audit log table (§4.9), and the absolute prohibition on PII / commission terms reaching the client portal (§9.4). Commission terms specifically are gated behind a phone-confirmation requirement before any client share (§9.7) — systematizing the agent practice the user identified.

> **Is scraper work excluded from MVP?**
>
> Yes. §3 explicitly puts scraping in Phase 3 with the same gating criteria as the external-inventory spec (Phase 1+2 in production ≥6 weeks, written legal review, separate spec, separate PR). §10 lists no scraper files in the Phase 1 implementation surface. All Phase 1 ETL hits documented public APIs / published government datasets — no scraping required for core directory + ownership tracking.

> **Are legal/ToS risks documented?**
>
> Yes. §5.1 enumerates every Phase 1 source as "free / public records / no ToS." Phase 3 scraper risks are inherited verbatim from the external-inventory spec's Phase 3 section. §9.6 cross-references each REBNY / UCBA / NY DOS / TCPA / SHIELD rule and the specific design element preserving it. The "sponsor solicitation" concern is addressed: directory entry + research is not solicitation, and contact flows through the selling brokerage (not the seller) per standard co-broke etiquette.

> **Are client-share gates auditable?**
>
> Yes. `SponsorListingClientShare` (§4.8) is the only mechanism for client visibility; the table records `shared_by_agent_id`, `shared_via`, `shared_at`, `revoked_at`, `revoked_by_agent_id`, and reaction trail. Every share write emits a generic `audit_event`. Portal reads of the join produce additional `audit_event` entries. PII reveals logged separately in `sponsor_pii_reveal_log` (§4.9). Commission confirmation logged on the listing row itself (`commission_confirmed_at` + `commission_confirmed_by_agent_id`).

> **Are REBNY / RLS / UCBA boundaries preserved?**
>
> Yes — §9.6 enumerates each rule and the specific design element preserving it. RLS-linked sponsor listings (`source='rls'`) inherit the existing RLS attribution and gate path; non-RLS sponsor listings stamp the non-RLS disclaimer. The "sponsor classification badge" is purely additive metadata on top of whatever data source the listing came from.

> **Does this design respect the May-2nd hold pattern?**
>
> Yes. Section header explicitly notes "parked behind master plan PR 4 closeout AND explicit user authorization (same release conditions as the external-inventory spec — see `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`)." The HOLD file is being updated in the same session to cover both specs.

## 14b. Architectural correction — commission is cross-cutting (added 2026-04-30 post-draft)

> **🚧 NAR-SETTLEMENT CAVEAT (added 2026-04-30 after user correction):**
> The post-Sitzer/Burnett v. NAR settlement (effective Aug 2024) materially changed how commission/compensation is tracked in US real-estate transactions:
> - MLSes (including REBNY RLS) removed buyer-broker compensation fields from IDX/VOW feeds.
> - Buyer-representation agreements are now mandatory before touring (specifies what the BUYER pays their agent).
> - Compensation can come from multiple sources per transaction: seller concession, listing-side co-broke (where still offered), buyer payment, or a mix.
> - "Confirming commission" no longer means "what is the listing offering" — it now spans (a) what does the listing brokerage pay if anything, (b) what is the buyer paying us under the rep agreement, (c) what concessions is the seller willing to make, (d) how the gap (if any) is closed.
>
> The §14b proposed `CommissionConfirmation` model below was sketched in pre-NAR-settlement framing. The actual model needs revisiting once the user clarifies the post-NAR data shape mallan tracks. The schema below is a placeholder showing the cross-cutting INTENT, not the final field set. Treat §14b as an open architectural question, not a settled design.
>
> **User direction (2026-05-01):** Commission fields stay in the model — captured per listing — but rendered **agent-CRM-only**. No client-portal display, no send-email rendering, no public surface. Structure is preserved so display can be re-enabled if regulatory rules evolve. This means: §4.7 commission columns stay; portal DTO sanitizer (§9.4) explicitly strips them; commission-confirmation gate at §9.7 still applies (to enforce the "phone call before share" workflow), but the gate's *output* (the terms themselves) doesn't leave the CRM tier.



User clarification (2026-04-30, post-draft):

> "Even REBNY members have no commission information. We have to call each agent for every listing."

This means commission verification is **NOT a sponsor-specific concern** — it applies to every listing in mallan.nyc's purview, including RLS listings from REBNY members. The agent practice is: see a listing → call the listing agent / brokerage → confirm commission terms before any client commitment.

The commission columns I attached to `SponsorListing` (§4.7 — `commission_confirmed_at`, `commission_confirmed_by_agent_id`, `commission_terms`, `commission_basis`, `commission_value`) and the commission gate at §9.7 should be **lifted out of the sponsor model and made generic**. Proposed shape for a future PR (NOT this spec):

```prisma
model CommissionConfirmation {
  id                          BigInt   @id @default(autoincrement())

  // Polymorphic link — exactly one of the three non-null
  listing_id                  String?                        // RLS Listing.listing_id
  external_inventory_listing_id BigInt?
  sponsor_listing_id          BigInt?

  confirmed_at                DateTime @default(now())
  confirmed_by_agent_id       BigInt
  spoken_with_name            String?                        // who picked up the phone
  spoken_with_role            String?                        // 'listing_agent' | 'office_manager' | 'sales_office' | 'other'
  commission_terms            String   @db.Text
  commission_basis            String                         // 'percent_of_sale' | 'flat_fee' | 'tiered' | 'tbd' | 'declined_to_disclose'
  commission_value            Decimal? @db.Decimal(14, 4)
  expires_at                  DateTime?                      // some confirmations are only valid for X days
  superseded_at               DateTime?                      // when re-confirmed later
  superseded_by_id            BigInt?                        // FK to the next confirmation

  @@index([listing_id])
  @@index([external_inventory_listing_id])
  @@index([sponsor_listing_id])
  @@index([confirmed_by_agent_id])
  @@index([confirmed_at])
  @@map("commission_confirmations")
}
```

This makes commission a first-class auditable artifact across **every** listing surface mallan.nyc tracks. Implications:

1. **Phase 1 of the sponsor spec keeps the commission columns inline on `SponsorListing`** — refactoring to `CommissionConfirmation` is its own PR after both inventory specs (external + sponsor) ship. Doing it now would expand scope.
2. **The "share blocked without commission_confirmed_at" gate in §9.7 generalizes** — at full rollout, sharing ANY listing (RLS, external, sponsor) with a client requires a commission confirmation on file. That's a bigger UX change requiring agent training; defer to a separate PR.
3. **Existing RLS listings would be backfilled** by agents over time as they call. There's no auto-population — the entire point of the workflow is the human verification.
4. **Display surfaces** — CRM result cards on RLS listings would gain a "commission confirmed Apr 30, 2026" badge or a "no commission info — call required" warning. Single source of truth: `CommissionConfirmation` table joined by listing type.

**This becomes a third parked spec when you authorize it** — likely sequenced after both external-inventory Phase 1 and sponsor-database Phase 1 ship, since it depends on those tables existing. Filename when drafted: `docs/superpowers/specs/<date>-commission-confirmation-design.md`.

For the current sponsor spec: leave §4.7 + §9.7 as-is (they work for sponsor listings standalone), with this section noting the future generalization path.

## 14c. Live-feed findings (added 2026-05-01)

User asked whether mallan.nyc's existing search supports sponsor / no-board-approval and whether non-REBNY listings exist in MBQ. Read-only audit results:

### Existing search-field coverage in mallan.nyc

The natural-language parser at `lib/search/nyc-dictionary.ts:320-322` ALREADY recognizes:
- `"sponsor unit"`
- `"no board approval"`
- `"no board"`

All three map to the existing `ownershipTypes='Sponsor Unit'` filter with label "Sponsor Unit (No Board Approval)". The Trestle filter at `lib/search/public-listing-trestle.ts:227` text-matches PublicRemarks against `"sponsor unit"` (along with `"new development"` and `"new construction"`) via OR clause.

**Implication:** sponsor / no-board-approval search EXISTS today via natural-language parsing, but it's PublicRemarks-text-based, not structured-field-based.

### Trestle structured field — `SpecialListingConditions`

Trestle exposes a multi-select bit-flag enum `SpecialListingConditions` (30 values) on Property, including:
- `BoardApprovalNotRequired = 32`
- `BoardApprovalRequired = 64`
- `BuilderOwned = 128`
- `Standard = 1073741824`
- 26 other values (Auction, Foreclosure, Probate, Estate, etc.)

There is NO explicit `Sponsor` value — sponsor units are inferred via `BoardApprovalNotRequired` flag + optionally `BuilderOwned`.

### Live coverage probe (2026-05-01, n=1000 active)

| Field | Population | Distinct values |
|---|---:|---|
| `SpecialListingConditions` | 87.4% | 3 distinct: `Standard` 858 (98% of populated), `BoardApprovalRequired` 14, **`BoardApprovalNotRequired` 2 (0.2% of all active)** |

**Conclusion:** the structured field is present but radically under-utilized by REBNY listing agents. Only **2 in 1000** active listings explicitly tag themselves as `BoardApprovalNotRequired` in the structured field. The current PublicRemarks text-match in `lib/search/public-listing-trestle.ts:227` is actually higher-coverage than a structured-field query would be — agents write "Sponsor Unit. No Board Approval Required!" in description text, but they don't tick the corresponding `SpecialListingConditions` flag.

**Implication for the sponsor database:**
- The structured field cannot be relied on. The sponsor database becomes the primary source of "is this a sponsor unit" classification.
- Phase 1's ETL from REFB + ACRIS gives the authoritative answer (sponsor LLC owns the unit per public records), regardless of how the listing agent tagged it.
- The `SpecialListingConditions` field can be a SECONDARY signal for cross-validation, not the primary classifier.
- Existing natural-language sponsor search (`nyc-dictionary.ts:320-322`) should remain as a complementary query path; it captures different listings than the database lookup.
- A future enhancement (post-Phase-1): combine the database lookup + the natural-language text-match + the `SpecialListingConditions` flag into a single confidence-scored "sponsor unit" classifier.

### Non-REBNY listings in MBQ — quantification

REBNY RLS by structure carries only REBNY-member listings. Non-REBNY-member brokerages (e.g., Silverstein Collection LLC observed in competitor-LMP screenshots) do not appear in RLS. Cross-MLS market sizing (web-search 2026-05-01):

| MLS | NYC coverage | Approximate active inventory |
|---|---|---:|
| **REBNY RLS / Citysnap** | Manhattan + Brooklyn + Queens (REBNY members only) | Manhattan 3,425 · Brooklyn 1,005 · Queens 295 — total ~4,725 active rentals + sales (per Citysnap consumer surface, 2026) |
| **OneKey MLS** | Bronx + Brooklyn + Manhattan + Queens + Nassau + Suffolk (all members of OneKey, including non-REBNY brokerages) | ~52,851 total listings (LI-heavy; NYC-only borough breakdown not public) |
| **NY State MLS** | Statewide; many NYC boutique non-REBNY brokers list here | Borough breakdown not public; Silverstein Collection LLC and similar are listed here |
| **StreetEasy / Zillow** | Aggregates RLS + non-REBNY + FSBO | Estimated 15,000–25,000 active sales NYC-wide; varies |

**Confirmed:** non-REBNY-member listings exist in Manhattan, Brooklyn, and Queens. Mallan's current REBNY-IDX-Plus feed (served via Cotality/Trestle 5.0) does not include them. The external-inventory spec's Phase 2-A (subscribe to OneKey + NY State MLS) is the cleanest mechanism to ingest them with a paid IDX agreement (no scraping). The sponsor database (this spec) is orthogonal — it identifies sponsor *ownership* regardless of where the listing is published.

**Layer distinction reminder (added 2026-05-01).** Each MLS subscription brings its own three-layer stack: the **MLS organization** (REBNY, OneKey, NY State MLS — owns the policy layer), the **API/feed platform** (Cotality/Trestle, OneKey's own platform, etc.), and the **RESO certification framework** (the data dictionary + Web API standards both platforms certify against). Two different MLSes served by the same vendor (or the same MLS served by two different vendors) can have entirely different runtime payload behavior on identical RESO field names because policy is owned by the MLS, not by the platform. The IDX Plus null-handling fix at `lib/idx/trestle-mapper.ts:680-681` is REBNY-policy-specific. New ingest adapters added per Phase 2-A must run their own runtime coverage probe (`npm run reso:coverage` against the new feed) before any writer-side mapping decisions are committed.

**Sources for these findings:**
- `lib/search/nyc-dictionary.ts:320-322` (natural-language sponsor mapping)
- `lib/search/public-listing-trestle.ts:227` (PublicRemarks text-match)
- `artifacts/metadata.xml` line 1047 + 28343 (`SpecialListingConditions` enum definition)
- Live Trestle probe via `npm run reso:coverage` and `npm run reso:lookups` (2026-05-01)
- [Citysnap Manhattan/Brooklyn/Queens listing counts (CommercialObserver)](https://commercialobserver.com/2022/06/rebny-costar-citysnap/)
- [OneKey MLS overview (Hauseit)](https://www.hauseit.com/onekey-mls/)
- [REBNY RLS FAQs](https://www.rebny.com/rls-faqs/)

## 15. Open questions / decisions deferred

- **Storage budget.** §10.4 estimates ~135 MB additional on Neon. Current 258 MB / 500 MB free cap leaves ~110 MB headroom. Plan-tier upgrade may be required before initial ETL run. Decision deferred until implementation begins.
- **REFB API stability.** NY AG REFB's data has historically been delivered as PDF offering plans rather than structured JSON. Phase 1 may require a per-plan parser or a manual-curation step for new plans. Worst-case fallback: `lib/sponsor-db/etl/refb.ts` becomes a "queue for human review" rather than a fully-automated parser. Practical consequence: sponsor entity coverage may be 80% automated / 20% manual in initial weeks.
- **Cross-MLS sponsor data.** When a sponsor unit is listed in OneKey/MLSLI (not REBNY RLS), Phase 1 treats it as a non-RLS shadow listing. After external-inventory Phase 2-A (OneKey IDX subscription) lands, the cross-link logic should be extended to recognize OneKey listings the same way it recognizes RLS listings. Phase 2 task.
- **Commission storage normalization.** Free-text vs structured. Phase 1 stores both (`commission_terms` free-text + `commission_basis` enum + `commission_value` decimal). If future analytics on commission patterns become valuable, structure can be enriched without schema migration.
- **Sponsor rentals.** Out of scope Phase 1. When added (Phase 2+), the same model serves with `listing_type` extended.

## 16. Cross-references

- `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` — sister spec; sponsor and external-inventory are complementary, not redundant
- `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` — active hold; will be updated to cover this spec too
- `lib/idx/trestle-mapper.ts` — RLS mapping (untouched by this spec)
- `lib/idx/db-to-public-dto.ts` — public reader gates (untouched)
- `lib/search/listing-access-decision.ts` — search-side gates (untouched)
- `lib/compliance/gates.ts` — fail-closed permission helpers (referenced for design pattern, not modified)
- `lib/external-inventory/access.ts` — pattern reference for `assertNotPublicSurface()` and PII reveal
- `prisma/schema.prisma` — 9 new models added at implementation time
- `scripts/ci-compliance-check.js` — +1 new check at implementation time
- `data/compliance/prohibited-terms.json` — Fair Housing scanner source (reused)
- `memory/REFACTOR-2026-04-25.md` — master plan; this spec orbits PR 4 + PR 8 timing
- `CLAUDE.md` — Memory File Policy and active follow-up block reference this spec at implementation time

## 17. Resume instructions for the implementation session

When the implementation PR for this spec begins (NOT before PR 4 closes AND user explicit authorization):

1. Re-read this entire spec end-to-end. Re-read the external-inventory spec — implementation patterns are shared.
2. Re-read `CLAUDE.md`, `NEON.md`, the rebny-compliance skill, and `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` in full.
3. Confirm both holds have been lifted by the user.
4. Confirm Neon storage headroom for the +135 MB this feature adds.
5. Confirm master plan PR 8 status — same dependency as external-inventory.
6. Decide sequence: external-inventory Phase 1 first, then sponsor Phase 1; or both in parallel. Likely external-inventory first since it's a smaller surface.
7. Invoke `superpowers:writing-plans` to convert this spec into a per-PR implementation plan.
8. Apply the migration manually to Neon prod **before** code merge (per NEON.md §4).
9. Plan the initial ETL run — runs once at deploy time, hours of compute, populates ~500,000 unit rows. Schedule for low-traffic window.
10. Update `memory/REFACTOR-2026-04-25.md` "Recently landed" with the merged PR.
11. Mirror any new memory files to `C:\Users\MayaAllan\Desktop\memory\` per CLAUDE.md.

---

*End of design spec — 2026-04-30. Approved by user direction. Self-review complete (§14). Awaiting user review before transition to writing-plans.*
