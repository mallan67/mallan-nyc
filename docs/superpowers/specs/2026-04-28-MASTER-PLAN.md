# Mallan Master Plan — 2026-04-28

**Status:** DRAFT (awaiting Maya review and approval before any PR ships)
**Owner:** Maya Allan · **Author:** Claude Opus 4.7 (1M context)
**Branch:** `plan/master-foundation-2026-04-28`
**Single source of truth.** All prior plans (REFACTOR-2026-04-25, FOLLOWUP-2026-05-01, intelligence-platform-WIP, foundation-spec, cutting-edge-roadmap) are folded into this one document. Every prior pickup option (A/B/C/D/E in the next-session doc) is superseded by this plan.

---

## ⏱ STATUS AT A GLANCE

Mark items off as they complete by changing `[ ]` → `[x]` and updating the status notes in the table.

### Phase 0 — Plan approval (do this first, blocks everything)
- [ ] Maya reads §0–§2 and signs off on diagnosis + architecture
- [ ] Maya reads §3 (Phase 1 PR sequence) and signs off on order
- [ ] Maya reads §4 (Phase 2 roadmap) and signs off on direction
- [ ] Maya answers §7 open questions (or marks them deferred)
- [ ] First foundation PR (PR-A1) opened

### Phase 1 — Foundation (40 PRs, 12-28 weeks, parallelizable to 12-16 weeks)

**Primitive 1 — Event Spine (8 PRs)**
- [ ] PR-A1: Add `events` table (nullable, indexes only on `(subject_type, subject_id, occurred_at)`)
- [ ] PR-A2: `lib/events/emit.ts` library + zod payload schemas per kind (no callers yet)
- [ ] PR-A3: Convert `tracking/listing-view` writer to dual-write
- [ ] PR-A4: Convert `portal/listings/[id]/react` writer to dual-write
- [ ] PR-A5: Add `emitEvent` calls for kinds not represented in ActivityLog (search, tool events)
- [ ] PR-A6: Migrate first reader off `ListingView` → `events.bySubject(...)`
- [ ] PR-A7: Migrate readers off `ClientListingAction`
- [ ] PR-A8: Stop dual-writes; drop `BehavioralEvent`, `PortalEvent`, `IntentEvent`, `ListingView`, `ClientListingAction` tables

**Primitive 2 — Projection Layer (9 PRs)**
- [ ] PR-B1: Add 4 projection tables (`client_lifecycle`, `listing_opportunity`, `building_demand`, `neighborhood_trend`)
- [ ] PR-B2: Add 2 remaining projections (`agency_state`, `seller_lead`)
- [ ] PR-B3: `lib/projections/` module + rebuild fn + real-time triggers + batch cron
- [ ] PR-B4: Wire `client_lifecycle_projection` rebuild from existing data; nightly cron
- [ ] PR-B5: Migrate first reader: `crm/lead-scoring` reads from projection
- [ ] PR-B6: Migrate readers off `ConvictionScore` → projection
- [ ] PR-B7: Migrate readers off `BuyerIntentProfile` + `ListingMomentum` → projections
- [ ] PR-B8: Migrate readers off `DemandSignal` + `DemandIndex` → `neighborhood_trend_projection`
- [ ] PR-B9: Drop 10 retired tables (LeadScore, ConvictionScore, BuyerIntentProfile, ListingMomentum, DemandSignal, DemandIndex, DemandAlert, AgentMetrics, AgentPerformanceIndex, ListingAudit)

**Primitive 3 — Lifecycle + Agency (10 PRs)**
- [ ] PR-C1: Add `ClientRole` table (nullable everywhere)
- [ ] PR-C2: Add `AgencyRelationship` table
- [ ] PR-C3: Backfill script — `Lead.roles[]` + `Lead.pipeline_stage` → `ClientRole` rows
- [ ] PR-C4: Backfill script — `Lead.agent_id` + buyer_rep flag → `AgencyRelationship` rows
- [ ] PR-C5: Rewrite `convert/route.ts` to write `ClientRole` rows (dual-write `Lead.roles[]` + `pipeline_stage`)
- [ ] PR-C6: Migrate first reader (CRM dashboard) → `client_roles`
- [ ] PR-C7: Migrate seller workspace readers → `client_roles`
- [ ] PR-C8: Migrate buyer/tenant/landlord workspace readers → `client_roles`
- [ ] PR-C9: Migrate cron readers (lifecycle-triggers, scoring) → `client_roles`
- [ ] PR-C10: Drop `Lead.pipeline_stage` column (keep `Lead.roles[]` as denormalized cache for one cycle)

**First Migration Target — Search (13 PRs)**
- [ ] PR-D1: Add `listing_search_projection` table + indexes (incl. tsvector for full-text)
- [ ] PR-D2: Build `lib/projections/build/listing_search.ts` rebuild job
- [ ] PR-D3: Initial backfill — full rebuild for ~19,630 listings
- [ ] PR-D4: Build `lib/search/` core (parser, validator, compliance-gate, retriever, ranker, shaper)
- [ ] PR-D5: Wire `/api/portal/comparables` to new core (closes 1st compliance gap: closed>24h)
- [ ] PR-D6: Wire `/api/crm/saved-searches/[id]/execute` to new core (closes 2nd gap: gates not re-applied)
- [ ] PR-D7: Wire `/api/listings/similar` to new core (closes 3rd gap: address-display)
- [ ] PR-D8: Wire `/api/listings/building` to new core (closes 4th gap: address-display)
- [ ] PR-D9: Wire `/api/buildings/search` to new core
- [ ] PR-D10: Wire `/api/listings/route.ts` (the 1,459-line beast — public IDX search)
- [ ] PR-D11: Wire `/api/idx/search/route.ts` (CRM agent search)
- [ ] PR-D12: Delete 5 unused lib files (display-adapter, get-listings-server, client, index, watermark)
- [ ] PR-D13: Final cleanup — remove duplicated OData filter builders from old route handlers

### Phase 2 — Cutting-edge (sequenced after foundation lands)
- [ ] **2A** — Decision-Engine Math (Approval Matrix, hypothesis distributions, profile drift, half-life decay, autonomy state machine) — depends on B + C
- [ ] **2B** — Fiduciary Engine (LODCAR + 5-step customer-to-client gate + information firewall) — depends on C
- [ ] **2C** — Public-Records Ingestion (ACRIS, DOB, DOF, DHCR, HPD, Surrogate Court) — depends on A + B
- [ ] **2D** — 4 NYC Moats (LL97, post-abatement, DHCR rent-stab, ACRIS predictor) — depends on B + C + 2C
- [ ] **2E** — AI Tooling Layer (voice-to-CRM, inbound voice, daily brief, inbox co-pilot, compliance pre-flight, showing-prep) — depends on A + C + 2B
- [ ] **2F** — 3 Frontier Mechanisms (Inverted Listing Engine, Patient Pre-Listing Value Drops, Portfolio Optimization) — depends on all of 2A–E
- [ ] **2G** — 10 Iteration-3 angles (Boardpackager+RealPlus+Outlook ingester, closed-deal post-mortem, cross-client chain finder, etc.)
- [ ] **2H** — Sarah Worked Example (integrated demo proving Phase 1 + 2A-D fit together)
- [ ] **2I** — 8 Per-Role Pipelines (buyer/tenant/seller/landlord/listing/lease/nurture/cross-side state machines)

### Phase 3 — Open
- [ ] [Decided after Phase 2 lands. Don't pre-commit.]

---

## 📋 TABLE OF CONTENTS

- [§0. Why this plan exists](#0-why-this-plan-exists)
- [§1. Diagnosis (audit-grounded 2026-04-28)](#1-diagnosis-audit-grounded-2026-04-28)
- [§2. Architecture — the 3 primitives](#2-architecture--the-3-primitives)
- [§3. Phase 1 — Foundation (40 PRs)](#3-phase-1--foundation-40-prs)
- [§4. Phase 2 — Cutting-edge applications](#4-phase-2--cutting-edge-applications)
- [§5. Compliance gates throughout](#5-compliance-gates-throughout)
- [§6. Implementation discipline](#6-implementation-discipline)
- [§7. Open questions](#7-open-questions)
- [§8. Change log](#8-change-log)
- [§9. Appendix — audit provenance](#9-appendix--audit-provenance)

---

## §0. Why this plan exists

This is the **6th attempt** at designing the mallan-nyc backend. The prior 5 each produced shells — designs that looked complete but never delivered something Maya uses for daily work. Every iteration ran the same loop: chase cutting-edge → produce comprehensive design → build the surfaces → ship → not used → start over chasing harder.

This plan breaks the pattern by inverting the order. Instead of designing the cutting-edge intelligence applications first and trying to shoehorn them onto a backend that can't hold them, **this plan only designs the foundation 3 primitives first**. The cutting-edge applications (Approval Potential Matrix, fiduciary engine, NYC moats, frontier mechanisms) are sequenced for Phase 2 AFTER this foundation lands.

**Hard rule:** if a piece of substance belongs in Phase 2, it does NOT appear in Phase 1 implementation. Phase 1 establishes the structural primitives. Phase 2 applies them.

**Why one document:** every prior attempt scattered the design across 6+ docs (REFACTOR plan, FOLLOWUP, WIP intelligence platform, multiple session logs, multiple "next-session" docs, individual prior specs). Maya's instruction is to keep this in one file with checkboxes, so completion tracking is in one place and the plan can't drift across docs again. **This is that file.**

---

## §1. Diagnosis (audit-grounded 2026-04-28)

Three Explore agents audited the live codebase across search, events/intelligence, and lifecycle/agency. Findings:

### 1.1 Backend topology

| Metric | Value |
|---|---|
| Prisma models | 62 (no domain layer; feature-by-feature accretion) |
| API routes total | 260 |
| Routes under `/api/crm/` | 139 (53% — the CRM is "where everything goes if it doesn't fit elsewhere") |
| Routes under `/api/portal/` | 34 |
| Largest single file | `app/api/listings/route.ts` at **1,459 lines** |
| 2nd largest | `app/api/idx/search/route.ts` at 965 lines |
| Cron routes | 22 — lifecycle implemented as cron jobs, not as data |

### 1.2 Search sprawl

- **9 different search-related route files**, ~4,622 LOC across routes plus ~106K LOC across shared lib
- **No shared OData filter builder** — `buildODataFilter()` (520 lines) in `idx/search/route.ts` is NOT reused
- **No unified ranking** — every route hardcodes its sort
- **No shared DTO builder** — public uses `toPublicDTO()` + `sanitizeForPublic()`, CRM uses `affirmPermission()` directly. Same masking concept, different code, different output
- **Media URL proxying duplicated 3+ times** (idx/search:574-576, similar/route:26-31, buildings/route:63 — identical Cotality detection)
- **Distribution-gate enforcement DRIFT (live compliance violations):**
  - `/api/listings/similar` does NOT check `InternetAddressDisplayYN` on Trestle path
  - `/api/listings/building` does NOT check `InternetAddressDisplayYN` on Trestle path
  - `/api/portal/comparables` does NOT enforce closed>24h removal (REBNY UCBA Art. I §6)
  - `/api/crm/saved-searches/[id]/execute` does NOT re-apply gates on execution
- **5 unused lib files** (~25K LOC dead code): `display-adapter.ts`, `get-listings-server.ts`, `client.ts`, `index.ts`, `watermark.ts`

A unified search core eliminates ~10,500 LOC + closes 4 compliance gaps in ONE place.

### 1.3 Event-table fragmentation

Of the 9 event-like tables, only 4 are healthy. Per audit:

| Table | Status | Verdict |
|---|---|---|
| `AuditEvent` | ✅ Healthy core compliance trail | Keep |
| `ClientListingAction` | ✅ Live | Migrate → events spine |
| `ListingView` | ✅ Live | Migrate → events spine |
| `ActivityLog` | ✅ Live (CRM agent timeline) | Keep (distinct visibility role) |
| `ShowingHistory` | ✅ Live (rental track) | Keep (distinct schema) |
| `OutreachEvent` | ⚠️ Write-only — **0 readers** | Keep (audit trail; or surface readers) |
| `IntentEvent` | ⚠️ Shell — sparse writers | Migrate → events |
| `PortalEvent` | ❌ Orphan — **0 writers found**, 5 routes read empty | Drop + replace via events |
| `BehavioralEvent` | ❌ Dead — **0 writers** (function exported, never called) | Drop (`ConvictionScore` reads empty data) |

**5 of 9 tables are non-functional or duplicative.** `ConvictionScore` projection reads from `BehavioralEvent` (dead) + `IntentEvent` (sparse) + `ListingView` (live) — meaning conviction scores compute on partial data. The "predictive intelligence" today is technically a shell.

### 1.4 Intelligence-model sharding

Of the 14 intelligence models, **only 4 are healthy**:

| Model | Status |
|---|---|
| `LeadScore` | ✅ HEALTHY (3 readers, daily cron) |
| `LifecycleTrigger` | ✅ HEALTHY (active automation engine) |
| `ConvictionScore` | ⚠️ FRAGILE (depends on dead `BehavioralEvent`) |
| `BuyerIntentProfile` | ⚠️ Live but feeds only `DemandIndex` aggregation |
| `ListingMomentum` | ⚠️ NICHE (single reader: `portal/seller/fomo`) |
| `MarketSnapshot` | ⚠️ NICHE (single reader: `portal/seller/fomo`) |
| `ReadinessSignal` | ⚠️ NICHE (seller-only, internal aggregation) |
| `DemandSignal` | INTERNAL (intermediate to `DemandIndex`) |
| `DemandIndex` | INTERNAL (no direct readers) |
| `DemandAlert` | ❌ ORPHAN (no writers, no readers) |
| `AgentMetrics` | ❌ SHELL (computed daily, never read) |
| `AgentPerformanceIndex` | ❌ SHELL (computed, never displayed) |
| `ListingAudit` | ❌ DEAD WRITE (computed, never read) |
| `TriggerExecution` | AUDIT TRAIL only |

**6 of 14 intelligence models are shells or dead code.** `AgentMetrics` cron writes data nobody reads. `ListingAudit` writer logs REBNY-readiness scores nobody sees. Multi-month investment, zero daily-use payoff. **This is the literal "shell" Maya has been describing.**

### 1.5 Lifecycle / role / agency

✅ **Multi-role array exists.** `Lead.roles[]` is an array; one Lead can hold `["tenant", "buyer"]`.
✅ **Workstream C complete on schema.** Inquiry, Offer, Auction, Ethics models all live.
✅ **Convert API ships** at `app/api/crm/convert/route.ts` (420 lines) with 6 manual actions: `promote_to_listing`, `buyer_rep_signed`, `activate_renter`, `sign_lease`, `promote_to_buyer`, `role_transition`.

❌ **`Lead.pipeline_stage` is single-valued.** A lead cannot simultaneously be `current_tenant` AND `active_buyer`. The system tracks only the most-recent transition; prior role state is lost.
❌ **No `ClientLifecycle` / `ClientRole` join model.** Roles are array entries on `Lead`, not row-level entities with their own state machines.
❌ **No `AgencyRelationship` / agency / fiduciary model.** Zero fields anywhere for: LODCAR state, client-vs-customer distinction (RPL §443), agency disclosure timestamp, dual-agency consent, designated-agency tracking, multi-broker representation.
❌ **Zero ripple events between cron-driven state machines.** Each cron writes only to its own model. Lease expiration cron sends a notification but does NOT auto-promote tenant to buyer-track. **The Sarah lease-to-buy flow Maya wants is structurally impossible on the current schema.**

The 6 manual Convert API actions plus 22 crons plus a single `pipeline_stage` field is the entire lifecycle infrastructure. There is no foundation here for the per-role pipelines, hypothesis distributions, autonomy state machine, or fiduciary engine that Phase 2 needs.

---

## §2. Architecture — the 3 primitives

### 2.1 Primitive 1 — Event Spine

**Problem:** 9 fragmented event tables, 3 dead/orphan. No unified primitive for "first-party engagement happened."

**Design:** ONE append-only `events` table replaces fragmentation. Distinct-purpose tables (AuditEvent, ActivityLog, ShowingHistory, OutreachEvent) are kept; the rest merged or deleted.

**Net schema delta:** 9 → 5 (events + AuditEvent + ActivityLog + ShowingHistory + OutreachEvent).

#### `events` schema (Prisma)

```prisma
model Event {
  id              BigInt   @id @default(autoincrement())
  event_kind      String   @db.VarChar(64)   // typed taxonomy
  event_version   Int      @default(1)
  actor_type      String   @db.VarChar(20)   // lead | agent | broker | system | trestle
  actor_id        BigInt?
  subject_type    String   @db.VarChar(20)   // listing | lead | deal | lease | building | campaign | session
  subject_id      String   @db.VarChar(64)
  related_type    String?  @db.VarChar(20)
  related_id      String?  @db.VarChar(64)
  surface         String   @db.VarChar(20)   // public_web | buyer_portal | seller_portal | tenant_portal | landlord_portal | crm | email | sms | voice | trestle_sync | cron
  session_id      String?  @db.VarChar(64)
  device_type     String?  @db.VarChar(16)
  ip_hash         String?  @db.VarChar(64)
  user_agent_hash String?  @db.VarChar(64)
  referrer_host   String?  @db.VarChar(128)
  payload         Json     @default("{}")
  consent_status  String?  @db.VarChar(20)
  agency_state    String?  @db.VarChar(40)  // snapshot at event time for fiduciary firewall
  occurred_at     DateTime
  recorded_at     DateTime @default(now())

  @@index([subject_type, subject_id, occurred_at])
  @@index([actor_type, actor_id, occurred_at])
  @@index([event_kind, occurred_at])
  @@index([related_type, related_id, occurred_at])
  @@index([surface, occurred_at])
  @@index([occurred_at])
  @@map("events")
}
```

#### Event kind taxonomy (closed at design time)

**Engagement:** `listing.view`, `listing.like`, `listing.dislike`, `listing.discuss`, `listing.schedule`, `listing.offer`, `listing.share`, `listing.compare_added`, `listing.compare_removed`, `listing.save`, `listing.unsave`, `listing.hide`

**Search:** `search.query`, `search.filter_change`, `search.sort_change`, `search.saved_search_create`, `search.saved_search_delete`, `search.saved_search_alert_match`

**Tools:** `tool.mortgage_calculator_use`, `tool.affordability_check`, `tool.cma_request`

**Communication:** `comms.email_sent`, `comms.email_open`, `comms.email_click`, `comms.sms_sent`, `comms.sms_reply`, `comms.voice_call_initiated`, `comms.voice_call_completed`

**Showings:** `showing.requested`, `showing.scheduled`, `showing.attended`, `showing.no_show`

**Documents:** `document.uploaded`, `document.opened`, `document.signed`

**Open houses:** `open_house.rsvp`, `open_house.attended`

**Portal:** `portal.login`, `portal.logout`, `portal.page_view`

**Lifecycle ripples:** `lifecycle.role_added`, `lifecycle.role_removed`, `lifecycle.transition`

**Trestle sync:** `trestle.listing_changed`, `trestle.media_changed`

**Compliance:** `compliance.disclosure_signed`, `compliance.consent_captured`, `compliance.consent_withdrawn`, `compliance.preflight_blocked`

#### Writer + reader pattern

**Writer:** ONE function `emitEvent()` in `lib/events/emit.ts`. Validates kind against closed taxonomy + zod payload schema per kind. Computes `agency_state` snapshot at event time. Hashes IP/UA. Inserts row. Fires-and-forgets projection rebuild trigger.

**Readers:** No direct `prisma.event.findMany()`. Use `lib/events/query.ts` helpers:
- `events.bySubject(type, id, opts)`
- `events.byActor(type, id, opts)`
- `events.matching({ kinds, predicate, since })`
- `events.timeline(subject, since)`

These helpers enforce the information firewall (foundation provides hook; Phase 2B fills enforcement).

### 2.2 Primitive 2 — Projection Layer

**Problem:** 14 sharded "intelligence" models, 6 shells/dead. No canonical pattern for read models. The projections v3 prompt assumes exist do not.

**Design:** 6 canonical projection tables, each owned by a single rebuild job, each with a single defined query surface.

**Net schema delta:** 14 → 6 (4 main projections + 2 niche + LifecycleTrigger keeps + MarketSnapshot keeps as cache).

#### Decision matrix for the 14 existing models

| Model | Disposition |
|---|---|
| `LeadScore` | → field on `client_lifecycle_projection` |
| `ConvictionScore` | → field on `client_lifecycle_projection` |
| `BuyerIntentProfile` | → fields on `client_lifecycle_projection` |
| `ListingMomentum` | → fields on `listing_opportunity_projection` |
| `ReadinessSignal` | → `seller_lead_projection` (kept distinct) |
| `MarketSnapshot` | Kept as cache (not a projection) |
| `LifecycleTrigger` | Kept as rule engine |
| `TriggerExecution` | → `events` row of kind `lifecycle.trigger_fired` |
| `DemandSignal` + `DemandIndex` | → `building_demand_projection` + `neighborhood_trend_projection` |
| `DemandAlert` | DROP |
| `AgentMetrics` | DROP (compute on-demand) |
| `AgentPerformanceIndex` | DROP |
| `ListingAudit` | DROP |

#### The 6 projections (schema sketches)

**`ClientLifecycleProjection`** — everything we know about this person right now:

```prisma
model ClientLifecycleProjection {
  id                       BigInt   @id @default(autoincrement())
  lead_id                  BigInt   @unique
  active_roles             String[]                     // ["tenant", "buyer"]
  primary_role             String?
  agency_states            Json     @default("[]")
  lead_score               Int?
  lead_score_grade         String?  @db.VarChar(2)
  conviction_score         Int?
  conviction_stage         String?  @db.VarChar(20)
  ghost_status             String?  @db.VarChar(20)
  silence_days             Int?
  intent_strength          Int?
  preferred_neighborhoods  String[]
  preferred_boroughs       String[]
  preferred_types          String[]
  price_min                Int?
  price_max                Int?
  beds_min                 Int?
  beds_max                 Int?
  said_preferences         Json?    // Phase 2A territory
  inferred_preferences     Json?    // Phase 2A territory
  drift_themes             Json?    // Phase 2A territory
  pipeline_stage_per_role  Json     @default("{}")
  last_event_at            DateTime?
  next_action_due_at       DateTime?
  autonomy_state_per_role  Json?    // Phase 2A.5 territory
  computed_from_event_max_id BigInt?
  last_computed            DateTime
  rebuild_required         Boolean  @default(false)
  @@index([primary_role, last_computed])
  @@index([conviction_score])
  @@index([next_action_due_at])
  @@map("client_lifecycle_projections")
}
```

**`ListingOpportunityProjection`** — engagement + momentum + comp position:

```prisma
model ListingOpportunityProjection {
  id                          BigInt   @id @default(autoincrement())
  listing_id                  String   @unique
  view_count_7d               Int      @default(0)
  view_count_30d              Int      @default(0)
  unique_viewer_count_7d      Int      @default(0)
  unique_viewer_count_30d     Int      @default(0)
  save_count                  Int      @default(0)
  inquiry_count               Int      @default(0)
  showing_count               Int      @default(0)
  share_count                 Int      @default(0)
  avg_view_duration_ms        Int?
  attention_score             Int?
  momentum_score              Int?
  view_velocity               Decimal? @db.Decimal(8,2)
  save_rate                   Decimal? @db.Decimal(5,4)
  attention_vs_conversion_gap Int?     // Phase 2A territory
  comp_avg_price              Int?
  comp_avg_price_per_sqft     Decimal? @db.Decimal(10,2)
  comp_percentile_rank        Int?
  days_on_market              Int?
  last_price_change_at        DateTime?
  computed_from_event_max_id  BigInt?
  last_computed               DateTime
  rebuild_required            Boolean  @default(false)
  @@index([attention_score])
  @@index([momentum_score])
  @@map("listing_opportunity_projections")
}
```

**`BuildingDemandProjection`** — anonymized building-level demand:

```prisma
model BuildingDemandProjection {
  id                      BigInt   @id @default(autoincrement())
  building_address        String   @unique
  active_listing_count    Int      @default(0)
  total_view_count_30d    Int      @default(0)
  unique_viewer_count_30d Int      @default(0)
  total_inquiry_count_30d Int      @default(0)
  repeat_viewer_count_30d Int?     // Phase 2A territory
  avg_list_price          Int?
  avg_close_price         Int?
  avg_dom                 Int?
  last_computed           DateTime
  rebuild_required        Boolean  @default(false)
  @@index([total_view_count_30d])
  @@map("building_demand_projections")
}
```

**`NeighborhoodTrendProjection`** — replaces DemandSignal+DemandIndex:

```prisma
model NeighborhoodTrendProjection {
  id                      BigInt   @id @default(autoincrement())
  neighborhood            String   @unique
  borough                 String
  total_view_count_30d    Int      @default(0)
  unique_viewer_count_30d Int      @default(0)
  total_inquiry_count_30d Int      @default(0)
  trend_direction         String?  @db.VarChar(10)
  trend_delta_pct         Decimal? @db.Decimal(6,2)
  avg_list_price          Int?
  avg_dom                 Int?
  last_computed           DateTime
  rebuild_required        Boolean  @default(false)
  @@map("neighborhood_trend_projections")
}
```

**`AgencyStateProjection`** — read model for fiduciary state:

```prisma
model AgencyStateProjection {
  id                          BigInt   @id @default(autoincrement())
  person_id                   BigInt
  agent_id                    BigInt
  transaction_id              String                          // "lease:{id}" | "deal:{id}" | "listing:{id}" | "customer:{purpose}"
  role                        String
  agency_type                 String                          // client | customer | dual_agent | designated
  fiduciary_duties_owed       Boolean
  agency_disclosure_signed_at DateTime?
  buyer_rep_signed_at         DateTime?
  termination_at              DateTime?
  dual_agency_consent_at      DateTime?
  last_computed               DateTime
  @@unique([person_id, agent_id, transaction_id])
  @@index([person_id])
  @@index([agent_id])
  @@map("agency_state_projections")
}
```

**`SellerLeadProjection`** — replaces ReadinessSignal aggregate surface:

```prisma
model SellerLeadProjection {
  id              BigInt @id @default(autoincrement())
  seller_lead_id  BigInt @unique
  readiness_score Int?
  readiness_grade String?
  signal_summary  Json?
  last_computed   DateTime
}
```

#### Rebuild discipline

Every projection has:
1. ONE owner job at `lib/projections/build/{name}.ts`
2. Idempotent rebuild fn: `(subject_id_filter)` → rebuilds 0+ rows
3. Real-time triggers — specific event kinds enqueue `rebuild_required=true`
4. Batch rebuild cron — daily, processes `rebuild_required=true` rows + scheduled rebuilds
5. `computed_from_event_max_id` — ties projection freshness to event spine; allows incremental rebuild

**No projection writes outside its owner job. No projection reads from another projection.** Prevents cyclical-dependency anti-pattern.

### 2.3 Primitive 3 — Lifecycle + Agency Model

**Problem:** `Lead.pipeline_stage` single-valued. No `ClientRole` model. No `AgencyRelationship`. Zero LODCAR / fiduciary infrastructure. Sarah lease-to-buy structurally impossible.

**Design:** Two new models — `ClientRole` and `AgencyRelationship`. `Lead.pipeline_stage` deprecated in favor of per-role pipeline stages on `ClientRole` rows.

**Decision: do NOT rename `Lead` → `Person` in foundation.** Defer to Phase 3. Renaming is a multi-week migration with high regression risk; preserve.

#### `ClientRole` schema

```prisma
model ClientRole {
  id                 BigInt   @id @default(autoincrement())
  lead_id            BigInt
  role               String   @db.VarChar(20)
  pipeline_stage     String   @db.VarChar(40)
  status             String   @db.VarChar(20)            // active | paused | closed | dormant
  started_at         DateTime
  closed_at          DateTime?
  closure_reason     String?  @db.VarChar(40)
  anchor_listing_id  String?
  anchor_lease_id    BigInt?
  anchor_deal_id     BigInt?
  autonomy_state     String?  @db.VarChar(20)            // Phase 2A.5 populates
  source_action      String?  @db.VarChar(40)
  source_lead_id     BigInt?
  metadata           Json?
  created_at         DateTime @default(now())
  updated_at         DateTime @updatedAt
  lead               Lead     @relation(fields: [lead_id], references: [id])
  @@unique([lead_id, role, started_at])
  @@index([role, status])
  @@index([pipeline_stage])
  @@map("client_roles")
}
```

#### Per-role pipeline stages (typed in `lib/lifecycle/stages.ts`)

```ts
type SellerPipelineStage = 'prospect' | 'pitched' | 'exclusive_signed' | 'listing_prep' | 'listed' | 'showing' | 'offer_received' | 'in_contract' | 'closed';
type BuyerPipelineStage  = 'new' | 'pre_approved' | 'searching' | 'showing' | 'offer_made' | 'in_contract' | 'closed';
type TenantPipelineStage = 'new' | 'searching' | 'showing' | 'applied' | 'approved' | 'lease_signed' | 'moved_in' | 'active' | 'lease_ending';
type LandlordPipelineStage = 'new' | 'exclusive_signed' | 'listing_prep' | 'listed' | 'showing' | 'application' | 'lease_out' | 'lease_signed' | 'rented' | 'active' | 'lease_ending';
type InvestorPipelineStage = 'new' | 'searching' | 'analyzing' | 'offer' | 'in_contract' | 'closed' | 'managing';
```

#### `AgencyRelationship` schema

```prisma
model AgencyRelationship {
  id                          BigInt   @id @default(autoincrement())
  lead_id                     BigInt
  agent_id                    BigInt
  transaction_id              String                          // "deal:{id}" | "lease:{id}" | "listing:{id}" | "customer:{purpose}"
  role                        String   @db.VarChar(20)
  agency_type                 String   @db.VarChar(20)        // client | customer | dual_agent | designated_buyer | designated_seller
  fiduciary_duties_owed       Boolean
  agency_disclosure_signed_at DateTime?
  agency_disclosure_form_url  String?
  buyer_rep_signed_at         DateTime?
  buyer_rep_doc_url           String?
  dual_agency_consent_at      DateTime?
  dual_agency_doc_url         String?
  started_at                  DateTime
  terminated_at               DateTime?
  termination_reason          String?  @db.VarChar(40)
  information_firewall_active Boolean  @default(false)
  metadata                    Json?
  created_at                  DateTime @default(now())
  updated_at                  DateTime @updatedAt
  lead                        Lead     @relation(fields: [lead_id], references: [id])
  agent                       Agent    @relation(fields: [agent_id], references: [id])
  @@unique([lead_id, agent_id, transaction_id])
  @@index([lead_id, agency_type])
  @@index([agent_id, terminated_at])
  @@map("agency_relationships")
}
```

#### What foundation provides vs. defers

**Provides:**
- The two tables (`ClientRole`, `AgencyRelationship`)
- Backfill of existing data
- Convert API rewritten to use them
- `agency_state_projection` populated minimally

**Defers to Phase 2B (fiduciary engine):**
- 5-step customer-to-client conversion gate enforcement
- Information firewall query enforcement at projection level
- LODCAR fiduciary check in compliance pre-flight
- Dual-agency / designated-agency UI and consent flows

**Foundation makes Phase 2B *possible*. Phase 2B fills in the *enforcement*.**

---

## §3. Phase 1 — Foundation (40 PRs)

This section is per-PR detail. Every PR has an explicit checkbox at the top of this document (§Status at a Glance). Every PR is independently shippable per NEON.md. After each PR merges, mark its checkbox `[x]` and update its commit-SHA in the table.

### 3.1 Primitive 1 — Event Spine (8 PRs)

| PR | Branch suffix | Schema/code targets | Test plan | Production verification |
|---|---|---|---|---|
| **PR-A1** | `refactor/A1-events-table` | Add `events` table per §2.1; indexes on `(subject_type, subject_id, occurred_at)`, `(actor_type, actor_id, occurred_at)`, `(event_kind, occurred_at)`. Apply migration to prod manually before merge per NEON.md. | Migration applies cleanly. Empty-table verify (`SELECT count(*) FROM events;` = 0). | `ops:health` storage delta < 5 MB (table empty). |
| **PR-A2** | `refactor/A2-events-emit-lib` | Add `lib/events/emit.ts` with zod payload schemas per kind. Add `lib/events/query.ts` helpers. No callers yet. Add unit tests with vitest. | All zod schemas pass round-trip test (write → read → equality). 100% coverage on `emitEvent()`. | None (no production wiring). |
| **PR-A3** | `refactor/A3-listing-view-dual-write` | Modify `app/api/tracking/listing-view/route.ts` to write BOTH the existing `ListingView` row AND `events` row of kind `listing.view`. Wait one full sync cycle (12 min) before next PR. | Compare row counts: `SELECT count(*) FROM listing_view` vs `SELECT count(*) FROM events WHERE event_kind='listing.view'` over a 1-hour window — should be equal. | Hit `mallan.nyc/listing/{id}?t=test_token` — observe both rows created in DB. |
| **PR-A4** | `refactor/A4-portal-react-dual-write` | Modify `app/api/portal/listings/[id]/react/route.ts` to dual-write `ClientListingAction` + `events` row of appropriate kind. | Same row-count parity test as A3 over a 1-hour window. | Portal: like a listing as a buyer; observe both rows. |
| **PR-A5** | `refactor/A5-events-new-kinds` | Add `emitEvent()` calls for kinds NOT represented in existing tables: `search.query`, `search.filter_change`, `tool.mortgage_calculator_use`, `tool.affordability_check`, `tool.cma_request`, `comms.email_sent`, etc. Wire from search routes, calculator endpoints. | Vitest: each kind's payload validates. Integration: trigger from search UI, confirm row in events table. | Run a search query on mallan.nyc; observe `events` row of kind `search.query`. |
| **PR-A6** | `refactor/A6-listing-view-reader-migrate` | Migrate first reader: `app/api/crm/listing-views/route.ts:17` switches from `prisma.listingView.findMany` to `events.bySubject('listing', listingId, {kinds: ['listing.view']})`. | Vitest: route returns same shape. Integration: hit endpoint with known data, compare with previous response. | Hit `mallan.nyc/api/crm/listing-views?lead_id=X` — same response shape; compare a reference lead's response before/after deployment. |
| **PR-A7** | `refactor/A7-client-listing-action-readers` | Migrate readers off `ClientListingAction`: `portal/listings/[id]/react/route.ts:65`, `portal/favorites/`, `portal/open-houses/`, `portal/offers/` → `events.byActor` queries. | Vitest per route: response shape unchanged. | Test as a portal user: like, hide, etc. — observe identical UX. |
| **PR-A8** | `refactor/A8-events-cleanup-drops` | Stop dual-writes (remove `ListingView`+`ClientListingAction` writes from emitting code). Drop tables: `BehavioralEvent`, `PortalEvent`, `IntentEvent`, `ListingView`, `ClientListingAction`. Apply migration to prod manually first. | Schema migration applies cleanly. `npx prisma migrate status` clean. `ops:health` shows table count drop. | `ops:health` storage delta should be NEGATIVE (~5-15 MB freed). |

**Gates per PR:** `npm run ucba:audit && npm run rls:validate && npm run crm:test && npm run idx:validate && npm run ci`. Compliance regressions = 0.

**Estimated:** 4-6 weeks for the event spine.

### 3.2 Primitive 2 — Projection Layer (9 PRs)

| PR | Branch suffix | Schema/code targets | Test plan | Production verification |
|---|---|---|---|---|
| **PR-B1** | `refactor/B1-projection-tables-1` | Add 4 projection tables: `client_lifecycle_projections`, `listing_opportunity_projections`, `building_demand_projections`, `neighborhood_trend_projections`. Apply migration manually first. | `prisma migrate status` clean. Empty tables. | `ops:health` storage delta < 1 MB. |
| **PR-B2** | `refactor/B2-projection-tables-2` | Add `agency_state_projections`, `seller_lead_projections`. | Same as B1. | Same. |
| **PR-B3** | `refactor/B3-projections-lib` | Add `lib/projections/` module: `build/{name}.ts` per projection, `lib/projections/triggers.ts` for real-time rebuild enqueue, `lib/projections/cron.ts` for batch rebuild. Wire batch rebuild to a new cron `/api/cron/projections-rebuild` at `*/30 * * * *`. | Vitest per rebuild fn: idempotent, produces correct row given fixture event spine + source-of-truth data. | Cron logs show first run completes < 30s with current scale. |
| **PR-B4** | `refactor/B4-client-lifecycle-projection-build` | Implement `lib/projections/build/client_lifecycle.ts`. Reads existing `Lead`, `LeadScore`, `ConvictionScore`, `BuyerIntentProfile` data. Populates projection nightly. | Sample 50 leads pre-rebuild + post-rebuild — score values match source. | After cron run: `SELECT count(*) FROM client_lifecycle_projections` = active lead count. |
| **PR-B5** | `refactor/B5-lead-score-reader-migrate` | First reader migration: `app/api/crm/lead-scoring/route.ts:26` reads from `client_lifecycle_projection.lead_score` instead of `LeadScore` table. | Same response shape. Edge case: leads with no projection row — fall back gracefully. | Hit dashboard, compare with prior data. |
| **PR-B6** | `refactor/B6-conviction-bip-readers` | Migrate `crm/conviction/[leadId]/route.ts:36` and any other BuyerIntentProfile readers. | Same shape per route. | Spot-check for known lead. |
| **PR-B7** | `refactor/B7-listing-momentum-reader` | Migrate `portal/seller/fomo/route.ts:67` to read from `listing_opportunity_projection.momentum_score`. | Seller FOMO panel renders with same urgency message. | Test a known seller's portal. |
| **PR-B8** | `refactor/B8-demand-readers` | Migrate any DemandIndex readers (audit found ~0 direct external readers — verify before this PR). Migrate `lib/demand-index/collector.ts` to write to `neighborhood_trend_projection`. | Cron output unchanged. | `ops:health` neighborhood projection row count > 0. |
| **PR-B9** | `refactor/B9-drop-retired-models` | Drop tables: `LeadScore`, `ConvictionScore`, `BuyerIntentProfile`, `ListingMomentum`, `DemandSignal`, `DemandIndex`, `DemandAlert`, `AgentMetrics`, `AgentPerformanceIndex`, `ListingAudit`. Apply migrations manually. | Clean migrate-status. | `ops:health` significant negative storage delta. |

**Estimated:** 4-6 weeks.

### 3.3 Primitive 3 — Lifecycle + Agency (10 PRs)

| PR | Branch suffix | Schema/code targets | Test plan | Production verification |
|---|---|---|---|---|
| **PR-C1** | `refactor/C1-client-role-table` | Add `client_roles` table per §2.3 schema. | `prisma migrate status` clean. | `ops:health` < 1 MB delta. |
| **PR-C2** | `refactor/C2-agency-relationship-table` | Add `agency_relationships` table. | Same as C1. | Same. |
| **PR-C3** | `refactor/C3-clientrole-backfill` | Add `scripts/backfill-client-roles.ts` — for each Lead, derive ClientRole rows from `roles[]` array + `pipeline_stage` field per heuristics in §2.3. Idempotent + dry-run support per NEON.md tooling pattern. Run dry-run first; sample 50 manual verifies; then `--execute`. | Dry-run output matches expected role counts (1 per role per lead). | Post-execute: row count of client_roles ≥ row count of leads with non-empty roles[]. |
| **PR-C4** | `refactor/C4-agencyrel-backfill` | Add `scripts/backfill-agency-relationships.ts` — for each Lead with agent_id, create AgencyRelationship row with type='customer' (or 'client' if buyer_rep_agreement=true). Same dry-run discipline. | Dry-run + manual sample. | Post-execute: row count > 0. |
| **PR-C5** | `refactor/C5-convert-api-rewrite` | Rewrite `app/api/crm/convert/route.ts` to write `client_roles` rows on each action. Dual-write: also still update `Lead.roles[]` and `Lead.pipeline_stage` for backwards compatibility through the migration window. | Vitest: each Convert action produces correct ClientRole row + correct AgencyRelationship row (where applicable). | Test all 6 Convert actions in production: each produces both old + new rows. |
| **PR-C6** | `refactor/C6-crm-dashboard-clientroles` | Migrate first reader: CRM dashboard reads from `client_roles` table instead of `Lead.roles[]` array. | Snapshot test on dashboard data. | Compare dashboard with known leads pre/post. |
| **PR-C7** | `refactor/C7-seller-workspace-clientroles` | Migrate seller workspace renderers in `public/crm/js/dashboard/panels/` to read `client_roles`. | Manual UX test. | Open seller prospect + active workspace. |
| **PR-C8** | `refactor/C8-buyer-tenant-landlord-clientroles` | Migrate buyer/tenant/landlord workspace renderers. | Same. | Same. |
| **PR-C9** | `refactor/C9-cron-clientroles` | Migrate cron readers: lifecycle-triggers, prospect-triggers, tenant-nurture, scoring jobs all read from `client_roles`. | Cron output identical pre/post per a known lead set. | Cron logs clean. |
| **PR-C10** | `refactor/C10-drop-pipeline-stage` | Drop `Lead.pipeline_stage` column (per NEON.md, after readers fully migrated). Keep `Lead.roles[]` as denormalized cache for one cycle. | `prisma migrate status` clean. | `ops:health` clean; UCBA + RLS audits 0 regressions. |

**Estimated:** 4-6 weeks.

### 3.4 First Migration — Search (13 PRs)

| PR | Branch suffix | Schema/code targets | Test plan | Production verification |
|---|---|---|---|---|
| **PR-D1** | `refactor/D1-listing-search-projection` | Add `listing_search_projection` table per spec, including tsvector full-text index on `search_text`. Apply migration manually. | Schema clean. Indexes verify with `\di+ listing_search_projections*`. | `ops:health` storage < 5 MB delta (empty). |
| **PR-D2** | `refactor/D2-search-projection-build` | Implement `lib/projections/build/listing_search.ts`. Reads `Listing` + `ListingMedia` + `Building` + joins from `listing_opportunity_projection`. Idempotent. | Vitest: rebuild for one listing produces correct projection row. | Manual: rebuild for one listing in prod, query the projection row, verify shape. |
| **PR-D3** | `refactor/D3-search-projection-backfill` | Run initial full backfill via `scripts/backfill-search-projection.ts`. ~19,630 listings. Estimate ~10-30 min runtime. | Row count of projection ≈ active+closed listing count. | `ops:health` storage delta — listings table size unchanged, projection table size + ~30-50 MB. |
| **PR-D4** | `refactor/D4-search-core-lib` | Build `lib/search/`: `parser.ts` (route params → SearchQuery), `validator.ts`, `compliance-gate.ts` (SINGLE source of distribution-gate logic), `retriever.ts` (reads ONLY from projection), `ranker.ts`, `shaper.ts` (surface-aware DTO). | Vitest: each layer testable in isolation. Integration: end-to-end SearchQuery → Output for fixture data. | None (lib only). |
| **PR-D5** | `refactor/D5-portal-comparables-migrate` | Wire `/api/portal/comparables/route.ts` to use the new search core. **Closes 1st compliance gap: closed>24h enforcement.** | Vitest: closed>24h listings excluded from portal comparables response. | Hit `mallan.nyc/api/portal/comparables?listingId=X` for known data; verify closed listings >24h missing. |
| **PR-D6** | `refactor/D6-saved-searches-execute-migrate` | Wire `/api/crm/saved-searches/[id]/execute/route.ts`. **Closes 2nd compliance gap: distribution gates re-applied on execution.** | Vitest: a saved search created with stale criteria has gates re-applied at execute time. | Test saved search execution; verify gates applied. |
| **PR-D7** | `refactor/D7-listings-similar-migrate` | Wire `/api/listings/similar/route.ts`. **Closes 3rd gap: address-display not enforced on Trestle path.** | Vitest: listings with `InternetAddressDisplayYN=false` return masked address. | Test similar-listings on a known opted-out listing. |
| **PR-D8** | `refactor/D8-listings-building-migrate` | Wire `/api/listings/building/route.ts`. **Closes 4th gap: address-display not enforced on Trestle path.** | Same as D7. | Same. |
| **PR-D9** | `refactor/D9-buildings-search-migrate` | Wire `/api/buildings/search/route.ts`. | Vitest. | Manual verify. |
| **PR-D10** | `refactor/D10-listings-route-migrate` | Wire `/api/listings/route.ts` — **the 1,459-line beast**. Public IDX search. Single biggest migration. Old route handler becomes thin wrapper around `lib/search/` core. | Comprehensive Vitest covering all 20+ filters. Smoke test: `?type=sale&borough=manhattan&minPrice=1000000` returns same shape as before. **Dual-deploy for 1 week:** new core runs alongside old, response diff'd in CI. | Compare a sample 50 search responses pre/post over 1 week. |
| **PR-D11** | `refactor/D11-idx-search-migrate` | Wire `/api/idx/search/route.ts` — CRM agent search. | Same comprehensive Vitest. Same dual-deploy pattern. | Same comparison. |
| **PR-D12** | `refactor/D12-delete-dead-libs` | Delete 5 unused lib files: `display-adapter.ts`, `get-listings-server.ts`, `client.ts`, `index.ts`, `watermark.ts`. Confirm via grep that NO imports remain. | `tsc --noEmit` passes (no broken imports). | `npm run build` clean. |
| **PR-D13** | `refactor/D13-old-route-cleanup` | Final cleanup — remove duplicated OData filter builders, address parsers, media proxy logic from old route handlers (now thin wrappers). | `git diff` shows -2,000 to -3,000 LOC. | Build clean; smoke test all routes. |

**Estimated:** 6-10 weeks.

### Total Phase 1 estimate

40 PRs over 18-28 weeks if serialized. Parallelizable to **12-16 weeks** because primitives 1, 2, 3 can run in parallel (search migration depends on all three landing first).

---

## §4. Phase 2 — Cutting-edge applications

**Important:** Phase 2 PRs are NOT yet detailed. Each Phase 2 component will get its own spec when its turn comes. The list below is the **roadmap**, not the implementation plan. Items marked off here mean "this entire component is complete and verified by Maya in real use."

### 4A. Decision-Engine Math
- [ ] Approval Potential Matrix (per client × per scenario × per building)
- [ ] Hypothesis Distributions (multi-hypothesis weighted, never picks)
- [ ] Profile Drift (said vs. inferred preferences, the most valuable column)
- [ ] Half-Life Decay (price 90d, neighborhood 180d, affordability 14d, friction 30d, stage 7d)
- [ ] Autonomy State Machine (manual_only → approve_queue → nurture_auto → reactivation_auto → paused)

**Depends on:** Primitive 2 (Projection layer) + Primitive 3 (Lifecycle + Agency)
**Estimated:** ~6-10 PRs over 4-6 weeks

### 4B. Fiduciary Engine
- [ ] LODCAR State per Agency Relationship
- [ ] Customer-to-Client 5-Step Conversion Gate (with hard-block on advocacy language until step 5)
- [ ] Information Firewall (projection-level enforcement)

**Depends on:** Primitive 3 (Lifecycle + Agency)
**Estimated:** ~8-12 PRs over 6-8 weeks
**Compliance:** RPL §443, 19 NYCRR §175.7, REBNY UCBA Sec II, Co-op Application Timeline Law (effective July 28, 2026), HUD AI guidance + Colorado AI Act (June 30, 2026)

### 4C. Public-Records Ingestion Layer
- [ ] NYC OpenData LL84 (annual building energy benchmarking)
- [ ] NYC DOF tax abatement schedules (quarterly)
- [ ] DHCR rent-stabilization registration (annual)
- [ ] ACRIS deeds, mortgages, UCC filings (daily)
- [ ] DOB permits, violations, ECB, complaints (daily)
- [ ] DOF tax class, market value, assessed value (quarterly)
- [ ] HPD housing maintenance code violations (daily)
- [ ] NYC Surrogate Court probate filings (daily)
- [ ] NY State courts divorce filings (daily)

**Depends on:** Primitive 1 (Event spine) + Primitive 2 (Projection layer)
**Estimated:** ~6-10 PRs over 4-8 weeks

### 4D. The 4 NYC Moats
- [ ] **Moat 1:** LL97 Carbon-Cap Risk Band per Building
- [ ] **Moat 2:** Post-Abatement Carrying-Cost Projection per Listing
- [ ] **Moat 3:** DHCR Rent-Stabilization Status at Listing Intake (compliance gate)
- [ ] **Moat 4:** ACRIS-Driven Seller Predictor

**Depends on:** Primitive 2 + 4C
**Estimated:** ~4-8 PRs per moat, ~16-32 PRs total over 12-20 weeks

### 4E. AI Tooling Layer
- [ ] **Tool 1:** Voice-to-CRM (Whisper + GPT-4o-mini) — every showing 100% captured, ~12 hrs/month/agent saved
- [ ] **Tool 2:** Inbound Voice AI (Retell.ai + IDX function calls) — 1-2 saved leads/mo, ~$5-20K/mo extra
- [ ] **Tool 3:** Daily Brief Generator — 30-60 min/day saved
- [ ] **Tool 4:** Inbox AI Co-pilot with Fair Housing Scrubber — 60-90 min/day saved
- [ ] **Tool 5:** Compliance Pre-Flight on All Outbound (the framework Tool 4 uses, surfaced as primitive)
- [ ] **Tool 6:** Showing-Prep Auto-Pack — ~10 hrs/month/agent saved

**Depends on:** Primitive 1 + Primitive 3 + 4B
**Estimated:** ~3-6 PRs per tool, ~18-36 PRs total over 8-16 weeks

### 4F. The 3 Frontier Mechanisms
- [ ] **Frontier 1:** Inverted Listing Engine (verified-buyer roster + pre-signed offer templates + reciprocal partner brokerages → 6-12 deals/year that don't exist today)
- [ ] **Frontier 2:** Patient Pre-Listing Value Drops (3×/year value-only artifacts; 10-20 listings/year at 1/30 the cost of SmartZip)
- [ ] **Frontier 3:** Portfolio Optimization Across Whole Book (matrix optimization on 80×30 nightly; 25-40% better match rate; 1-2 extra deals/month)

**Depends on:** Phase 1 + 4A + 4B + 4C
**Estimated:** ~10-15 PRs each, ~30-45 PRs total over 16-30 weeks

### 4G. Iteration-3 Angles (10 specific tools)
- [ ] Boardpackager + RealPlus + Outlook outcome ingester
- [ ] Closed-deal post-mortem mining (50-200 deals → patterns)
- [ ] Cross-client chain finder
- [ ] Outside-agent / vendor reputation scoring (Mallan-only data)
- [ ] Deal-in-progress stall detector
- [ ] Per-building approval-velocity
- [ ] Re-engagement timing radar for past clients (3-7 year window)
- [ ] Showing-prep auto-pack (covered in 4E.6)
- [ ] Deal-source ROI tracker
- [ ] Client churn warning

**Estimated:** ~3-6 PRs each per tool

### 4H. Sarah Worked Example
- [ ] Lease starts month 0 → Person.add_role(tenant) + AgencyRelationship.create(customer for lease)
- [ ] Months 0-6: System silent. Daily brief shows qualification status.
- [ ] Month 6: Qualification re-runs (consented data only); Layer 1 send drafted with customer-level framing; agent approves
- [ ] Months 6-9: Engagement tracked; Profile Drift recomputes; hypothesis distribution reweights; soft resends every 2 weeks; advocacy language gated
- [ ] Month 9: Showing request → conversion trigger; NY Agency Disclosure presented before showing; Buyer Rep Agreement signed
- [ ] New AgencyRelationship CLIENT × FUTURE_BUY × AGENT_MAYA created
- [ ] Full LODCAR active; advocacy unlocked; negotiation playbooks available
- [ ] Information firewall remains active for landlord-side data
- [ ] Dual-coexistence test runs continuously (break-lease blocked; landlord-confidential queries blocked)
- [ ] Year 2 alternate branch: friction theme persists; redraft references year-1 blocker

**Depends on:** Phase 1 + 4A + 4B + 4C + 4D Moat 4 + 4E Tools 1, 3, 4, 5, 6
**Estimated:** ~2-4 PRs (integration spec, not new code)

### 4I. Per-Role Pipelines (8 ripple-event state machines)
- [ ] Buyer journey: new → pre_approved → searching → showing → offer → contract → closed
- [ ] Tenant journey: new → searching → showing → applied → approved → lease_signed → moved_in → active
- [ ] Seller journey: prospect → pitched → exclusive_signed → listing_prep → listed → showing → offer → contract → closed
- [ ] Landlord journey: new → exclusive_signed → listing_prep → listed → showing → application → lease_out → lease_signed → rented
- [ ] Listing lifecycle: draft → ready → published → showing → offer_received → in_contract → closed
- [ ] Lease lifecycle: active → renewal_window_open → renewal_decision → renewed_or_vacated
- [ ] Closed-client nurture: post_close_30d → post_close_90d → annual → reactivation_check
- [ ] Cross-side opportunity: tenant_lease_180d → landlord_dashboard_updated → match_check → opportunity_surfaced

**Estimated:** ~4-6 PRs per state machine, ~32-48 PRs total over 16-24 weeks

### Phase 2 sequencing

| Order | Component | Reason |
|---|---|---|
| 1 | 4A.1 Approval Potential Matrix | Decision-engine foundation; everything else uses it |
| 2 | 4B Fiduciary Engine | Compliance prerequisite for 4E (compliance pre-flight) and 4F (frontier mechanisms) |
| 3 | 4A.2 Hypothesis Distributions | Replaces simple state with weighted state |
| 4 | 4C Public-records ingestion | Unblocks all 4 NYC moats |
| 5 | 4D 4 NYC moats | The structural advantages |
| 6 | 4E AI tooling layer | Daily-driver tools that materialize "small but mighty" |
| 7 | 4A.3-5 Profile Drift / Half-life Decay / Autonomy State | The "incredible" tier of the decision engine |
| 8 | 4I 8 ripple-event state machines | Per-role pipelines fully wired |
| 9 | 4H Sarah Worked Example integration | Proof everything composes |
| 10 | 4G Iteration-3 angles | Specific tools that ride on top of all the foundation |
| 11 | 4F 3 frontier mechanisms | The competitive moats — last because hardest |

**Phase 2 total:** ~120-180 PRs over ~12-24 months. Each PR small, real, shippable, used.

---

## §5. Compliance gates throughout

Every primitive enforces these by design, not afterthought:

### 5.1 REBNY RLS / IDX Plus distribution gates (fail-closed)

ONE place: `lib/search/compliance-gate.ts`. Pseudocode:

```ts
function applyDistributionGates(rows: ListingSearchProjection[], surface: Surface) {
  return rows.filter(row => {
    if (row.owner_opt_out) return false;                                    // never displayed
    if (row.participant_only && surface !== 'crm') return false;            // CRM-only
    if (!row.internet_entire_listing_display && surface !== 'crm') return false;
    if (row.is_closed_or_sold && row.closed_at && hoursSince(row.closed_at) > 24 && surface !== 'crm') return false;
    return true;
  });
}

function maskAddress(row, surface) {
  if (surface === 'crm') return row.display_address_crm;
  if (!row.internet_address_display) return 'Address available upon request';
  return row.display_address_public;
}
```

Every search route inherits. Compliance audit verifies: no route bypasses this.

### 5.2 Information firewall

`lib/events/query.ts` helpers check the actor's agency relationships before returning rows. Foundation provides the hook; Phase 2B fills the rules.

### 5.3 Audit trail

Every `events` row IS an audit row. `system_events` (renamed `AuditEvent`) keeps mutation-level audit. Together they replace today's situation where the same action is logged in 3 places with 3 different shapes.

### 5.4 Retention

Cron deletes per NY SHIELD Act:
- `actor_type=lead` events older than 3 years AND lead has no active relationship → deleted
- `actor_type=system` and `actor_type=agent` events older than 2 years (REBNY RLS) → deleted

### 5.5 Fair Housing

Free-text content (event payloads, comments) passes Fair Housing scrubbing at write time per existing `lib/compliance/` patterns.

### 5.6 Closing the 4 active compliance gaps (search-migration deliverable)

- [ ] **Gap 1 closed (PR-D5):** `/api/portal/comparables` enforces closed>24h removal
- [ ] **Gap 2 closed (PR-D6):** `/api/crm/saved-searches/[id]/execute` re-applies distribution gates
- [ ] **Gap 3 closed (PR-D7):** `/api/listings/similar` enforces `InternetAddressDisplayYN`
- [ ] **Gap 4 closed (PR-D8):** `/api/listings/building` enforces `InternetAddressDisplayYN`

---

## §6. Implementation discipline

Per `NEON.md`, applied without exceptions. Every PR in this plan satisfies all of these:

### 6.1 One concrete-change-per-PR
No PR introduces more than one of: a new table, a column drop, a new index on a large table, a reader migration. Each independently rollback-able.

### 6.2 Nullable first
Every new column added nullable. NOT NULL constraints come in a second PR after backfill completes.

### 6.3 Dual-write before reader migration
When new replaces old, the new model is populated by a dual-writer for at least one full sync cycle (12 min for `idx-sync`-driven; 24 hours for daily crons) before any reader migrates.

### 6.4 Manual production migration before code merge
Per `NEON.md` §5: every schema-touching PR has the migration applied to prod manually with `DATABASE_URL=prod npx prisma migrate deploy` BEFORE the code PR merges. **Vercel does NOT run migrations.** No exceptions.

### 6.5 Production Verification Note in every PR

```markdown
## Production Verification Note

**Post-deploy URL to hit:** [URL]
**Metric to observe:** [Vercel logs / Neon ops:health / response time]
**Rollback trigger:** [specific condition]
**Success criteria within 30 minutes:** [what must be true]
```

### 6.6 Compliance gate per merge

```bash
npm run ucba:audit          # 0 regressions required
npm run rls:validate
npm run crm:test
npm run idx:validate
npm run ops:health
```

### 6.7 `rebny-compliance` skill invocation

Every PR touching `lib/compliance/`, `lib/idx/`, `app/api/crm/`, `app/api/portal/`, `app/api/listings/`, public listing display, or any free-text capture form invokes the `rebny-compliance` skill before commit.

### 6.8 Test-driven where it matters

Per `superpowers:test-driven-development`: write the test first, watch it fail, write the implementation, watch it pass. Required for:
- Compliance gate logic
- Projection rebuild functions
- Event emit
- Agency-state firewall

Not required for boilerplate.

### 6.9 Maya's daily test (the anti-shell rule)

After each major PR (PR-D5 onward), Maya tests the migrated feature for **one week** before the next PR ships. **If the migrated route doesn't feel different in real use, we stop and diagnose.** The 6-attempt pattern broke because we never enforced this. This time we enforce it.

---

## §7. Open questions

Mark each as decided or deferred before Phase 1 PRs ship.

- [ ] **Q1.** Rename `Lead` → `Person` in foundation, or defer to Phase 3? **Default: defer** (renaming is multi-week migration, high risk; preserve).
- [ ] **Q2.** Drop `BehavioralEvent` and `PortalEvent` immediately, or keep as no-ops for one cycle? **Default: drop in PR-A8** (audit confirms zero writers).
- [ ] **Q3.** `MarketSnapshot` as cache vs. projection? **Default: cache** (single reader, cheap to store, no rebuild discipline needed).
- [ ] **Q4.** Workstream C models (`Inquiry`, `Offer`) — incorporate into event spine, or keep standalone with event emissions on state changes? **Default: keep standalone, emit events on state changes.**
- [ ] **Q5.** `ShowingHistory` vs. `Showing` — keep both? **Default: keep both** — Showing is the calendared/scheduled record, ShowingHistory is post-hoc summary with reaction. Different lifecycles.
- [ ] **Q6.** Prisma 7 upgrade timing — gated to 2026-05-05+. If foundation PR-A1 lands before then, upgrade mid-stream or wait? **Default: wait** until foundation done (avoid mid-flight Prisma version change).
- [ ] **Q7.** Search migration order — do the small routes first (D5-D9) then the big public-IDX route (D10-D11), or reverse? **Default: small first**, dual-deploy pattern for D10/D11 with response-diff monitoring.
- [ ] **Q8.** Rollback discipline — every PR is independently rollback-able, but dependent-PR pairs (e.g., A4+A5) might need rollback together. Single rollback markers, or trust manual call? **Default: trust manual call**, but document the dependency in the PR body.
- [ ] **Q9.** Phase 2 priority — start 4A (decision math) first, or 4B (fiduciary engine)? **Default: 4B first** — compliance-critical and unblocks 4E/4F.

---

## §8. Change log

Track changes to THIS plan. Every revision adds a row.

| Date | Change | Author |
|---|---|---|
| 2026-04-28 | Initial draft. Foundation spec + cutting-edge roadmap consolidated into single master plan with checkboxes per Maya's request. | Claude Opus 4.7 |

---

## §9. Appendix — audit provenance

The diagnosis in §1 was produced by 3 parallel `Explore` agents on 2026-04-28. The agents performed read-only audits of the live codebase; no claims here are made without grep-level evidence.

The three audits covered:

1. **Search system audit** — 9 search-related route files, ~135K LOC of search-related code, ~10,500 LOC eliminable through unification, 4 distribution-gate compliance gaps identified at file:line.
2. **Event-table + intelligence-model audit** — 9 event tables (3 dead/orphan), 14 intelligence models (6 shells/dead), recommended consolidation matrix in §2.2.
3. **Lifecycle / role / agency audit** — `Lead.roles[]` exists but `pipeline_stage` is single-valued, no `ClientLifecycle` / `ClientRole` / `AgencyRelationship` model, zero ripple events between cron-driven state machines, Workstream C complete on schema.

Full audit transcripts captured in the 2026-04-28 session log. If any future session needs to verify the diagnosis numbers, re-run the same three agents on the current code; they should produce equivalent findings (or surface drift, which is itself the signal).

---

## §10. Next step (do this when this plan is approved)

After Maya reviews and approves this plan:

1. Mark **Phase 0 — Plan approval** checkboxes in §Status as completed.
2. Invoke `superpowers:writing-plans` skill to expand each Phase 1 PR's per-line-of-code detail (file paths, exact diffs, exact migration SQL).
3. Open PR-A1 (`refactor/A1-events-table`) per §3.1.
4. After PR-A1 merges, mark its checkbox in §Status, capture commit SHA in §3.1 table, proceed to PR-A2.
5. Repeat for all 40 PRs of Phase 1.
6. After Phase 1 lands, return to this document and start checking off Phase 2 items per the §4 sequencing.

End of master plan.
