# CRM + Agent Search Architecture Audit — 2026-05-21

**Status:** REPORT-ONLY · No code patches · No schema changes · No migrations · No env/Neon/cron/workflow/agent/skill changes · No external-inventory or sponsor implementation · No PR 5B activity · No admin bypass.

**Author:** Claude Code (Opus 4.7) under Maya direction.

**Sources synthesized:**
- CLAUDE.md (§A hard rules, §C holds, §D compliance-first, §E fail-closed, §F proof-first)
- docs/compliance/COMPLIANCE-CANONICAL-INDEX.md (18 numbered areas)
- memory/REFACTOR-2026-04-25.md (master refactor plan)
- docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md (701 lines, HELD)
- docs/superpowers/specs/2026-04-30-sponsor-database-design.md (1003 lines, HELD)
- memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md (hold record)
- docs/backend-crm-current-gap-audit-2026-05-18.md (Class A/B/C/D gap list)
- docs/audits/exclusive-launch-readiness-audit-2026-05-20.md (A1–A4 closed + LIVE)
- docs/idx/post-reconciliation-tightening-audit-2026-05-20.md (W1–W4, B2–B6, O1–O5)
- docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md (invariants I.1–I.8)
- docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md (8 absolute rules)
- data/UCBA-2026-Requirements.md, data/RLS-Syndication-Research.md
- .claude/skills/rebny-compliance/SKILL.md
- lib/compliance/**, lib/auth/**, lib/idx/**, lib/search/**, lib/external-listings/**
- app/api/crm/** (150 routes, verified 2026-05-21 via `find app/api/crm -name "route.ts" -type f | wc -l`), app/api/listings/**, app/api/idx/search/**
- prisma/schema.prisma (70 models)
- public/crm/dashboard.html, public/crm/js/dashboard/* (panels.js 13,358 lines)

**Today's main HEAD:** `69884a4d` (PR #172 merged + LIVE). A1+A2+A3+A4 launch blockers all closed and serving production.

---

## TL;DR

mallan.nyc has shipped a **production-grade public IDX surface** (Trestle/Cotality REBNY IDX Plus, 6 distribution gates fail-closed/fail-open by REBNY pre-filter semantics, FARE Act + UCBA + NY DOS attribution all live) and a **CRM with 150 route.ts files + 70 Prisma models** (verified 2026-05-21 via `find app/api/crm -name "route.ts" -type f | wc -l`) that is 75–80% production-capable but has 4 concrete defects (deal-form submit stubs, impersonation client-only, page-size cap, portal write rate-limits) plus 2 active UCBA holes (Art. III §6 ethics gate, agent-level row isolation).

Two parked specs (701-line external-inventory + 1003-line sponsor-database, both HELD) define the data model + share-gate + reveal-gate + audit chain for **agent-only tiered search** without touching public IDX or `ListingSearchProjection`.

**There is no agent-search UI today** (the biggest "what is missing" item against "agent search must be top notch"). CRM search today = simple type/status filters on `/api/crm/listings` plus an unwrapped passthrough on `/api/idx/search`. The build sequence below produces top-tier agent search without bypassing PR 5B's reader-swap hold.

**The path forward separates cleanly into 3 lanes that can run in parallel:**

1. **CRM hardening** (no schema): 8 Class-A defects from the 2026-05-18 audit + 5 ranked items from the 2026-05-16 workflow audit can land before any external/sponsor work.
2. **Agent-search shell** (no schema): a real agent-search UI + ranking + per-agent scoping over today's `Listing` table can ship before PR 5B.
3. **Tiered inventory** (schema, HELD): Tier 2 (StreetEasy-scraped non-RLS) and Tier 3 (Schedule A sponsor) require explicit Maya approval per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`. Both specs are reviewed and aligned; PR 5B does NOT block them but the master plan parks them after PR 4 (media metadata) closeout.

PR 5B (the `ListingSearchProjection` reader swap) remains held until W4 closes (closed-list import script — only writer not on Phase A wiring) and a soak-watch passes.

---

## The Inventory Tier Model (binding for all sections below)

The audit assumes the **three-tier inventory boundary** Maya specified:

| Tier | Source | Where it lives | Public visibility | CRM/agent visibility | Client visibility |
|---|---|---|---|---|---|
| **T1 — RLS / IDX Plus** | Trestle/Cotality (REBNY syndicated feed) + Mallan exclusives (manual CRM POST) | `Listing` table; `ListingSearchProjection` (dual-written; reader swap = PR 5B held) | YES — public `/api/listings`, `/listing/[id]`, sitemap, SEO, FeaturedListings — **REBNY attribution required** | YES — agent search default ON | YES — public site + portal (per portal DTO sanitization) |
| **T2 — External (StreetEasy-scraped, FSBO, off-market)** | Manual agent submission + future scraper (parked) | New `external_inventory_listings` table (HELD) | **NEVER** | Agent-search opt-in toggle, default OFF, **non-RLS disclaimer stamped at write + every render** | Only via **explicit `external_inventory_client_shares` row** created by an agent. Owner PII hidden by default with reveal-gate + audit. |
| **T3 — Schedule A / Sponsor / New-development** | NY AG REFB + ACRIS + NYC Open Data ETL (parked) | New 9-table sponsor schema (HELD); shadow-row pattern (RLS-linked vs non-RLS) | **NEVER**, unless the sponsor unit is in RLS via `rls_listing_id` (then T1 rules govern) | Agent-search opt-in toggle, default OFF, **non-RLS disclaimer + sponsor badge** | Only via explicit `sponsor_listing_client_shares` row. Sponsor LLC legal name + registered-agent address are public (NY DOS) and do NOT need attestation; sponsor unit contact reveal does. |

**Reverse boundary pin (CRITICAL gap):** `tests/runtime/syndication-no-idx-imports.test.ts` already enforces one direction (syndication can't import IDX). The reverse — `lib/external-listings/**` + future `lib/sponsor/**` cannot import `lib/search/listing-search-projection.ts` or write to `ListingSearchProjection` — is **NOT YET PINNED**. This is the single highest-value architectural test the new tiered model needs.

---

## A. Current CRM architecture map

### A.1 Surface count
- **150 active CRM route.ts files** under `app/api/crm/**` (verified 2026-05-21 via `find app/api/crm -name "route.ts" -type f | wc -l` — corrects the original research-agent "sampled glob" undercount of 97)
- **`public/crm/`** frontend — `dashboard.html`, `login.html`, intake forms (SALE-FORM-REDESIGN 580 KB, RENTAL-FORM-REDESIGN 514 KB, BUYER-DEAL-FORM 123 KB, TENANT-DEAL-FORM 106 KB), `index-built.html` (2.5 MB bundled)
- **Monolithic JS:** `public/crm/js/dashboard/panels.js` is 13,358 lines hosting Featured config, Sales CRM (buyers/sellers/prospects), Rentals CRM (landlords/tenants), tools (CMA/comps/pricing), broker approval queue, commission tracker, payout review
- **70 Prisma models** (14 CRM-core + 6 supporting + 8 analytics + 3 sync + many auxiliary). All 70 actively used — no orphan stubs at the model layer.

### A.2 Route organization (by functional cluster)

| Cluster | Routes (examples) | Auth gate |
|---|---|---|
| Lead management | `/crm/leads`, `/crm/clients`, `/crm/clients/[id]/*` (invite, preferences, actions) | `requireAgentOrBroker` |
| Prospect conversion | `/crm/sales/prospects/[id]/{convert,pitch-packet,comps,research,hook-email,send-packet}`, `/crm/sales/buyers`, `/crm/sales/sellers`, `/crm/sales/prospects/import` | `requireAgentOrBroker` |
| Rentals | `/crm/rentals/{tenants,landlords,prospects,listings,activity}` | `requireAgentOrBroker` |
| Listings | `/crm/listings`, `/crm/listings/[id]/{photos,media-upload,media-order,validate,status}`, `/crm/buildings/[id]/*` | `requireAgentOrBroker` |
| Commission + documents | `/crm/deals/[id]/status`, `/crm/documents/[id]/{approve,request-approval,signatures,batch-approve}`, `/crm/documents/upload` | mixed (broker for approve) |
| Showings + feedback | `/crm/showings/[id]/{feedback,status}`, `/crm/lease-tracker/[id]/*` | `requireAgentOrBroker` |
| Agents | `/crm/agents/[id]/{photo,CE,impersonate}`, `/crm/agents/me`, `/crm/agents/sync-profiles` | `requireBroker` for impersonate |
| Analytics | `/crm/lead-scoring/[id]/*`, `/crm/cma/[id]`, `/crm/commissions/[id]/*`, `/crm/alerts`, `/crm/notifications/preferences` | `requireAgentOrBroker` |
| Outlook integration | `/crm/outlook/{auth,callback,disconnect,folders,scan}` | `requireAgentOrBroker` |
| Compliance | `/crm/audit-log`, `/crm/compliance/audit`, `/crm/validator/run` | `requireBroker` |
| Misc | `/crm/communications/templates`, `/crm/document-requests`, `/crm/notes`, `/crm/tasks/[id]`, `/crm/campaigns`, `/crm/protected-periods/[id]/*`, `/crm/referrals`, `/crm/syndication/refresh`, `/crm/ce-courses`, `/crm/automation/status` | mixed |

### A.3 Auth + role gates

| Layer | File | Roles enforced |
|---|---|---|
| Auth middleware | `lib/auth/middleware.ts` | `requireAuth()` (line 20), `requireRole(...)` (line 48), `requireBroker()` (69), `requireAgentOrBroker()` (78), `requirePortalRole()` (89 — legacy), `requireWorkspace()` (126 — v2) |
| Session | `lib/auth/session.ts` | 8h agent session TTL; ethics-training gate enforced only at `createSession()` |
| `Agent.role` | `prisma/schema.prisma` | `"BROKER"` \| `"AGENT"` (2 values) |
| `Lead.roles[]` | `prisma/schema.prisma:185` | Array: `["buyer", "renter", "seller", "landlord", "investor", "tenant"]` — multi-role |
| `Lead.portal_role` | (legacy single value) | `"buyer"` \| `"seller"` \| `"renter"` \| `"landlord"` |
| `Lead.enabled_workspaces[]` | v2 multi-workspace gate | string[] |
| Per-agent ownership | implicit via Prisma `where.agent_id = auth.userId` | NOT enforced uniformly (gap 9.2) |

### A.4 Lead-capture surfaces (8 public intakes)

| Form | Route | Lead/Inquiry write | Consent gate | Source attribution | Dedupe |
|---|---|---|---|---|---|
| Inquiry form (public) | `POST /api/inquiries` | upsert by email → `Lead` + `Inquiry` | ✅ `consent_captured_at` | `source = "inquiry"` | silent upsert (gap 3.7 — `Inquiry.duplicate_of_lead_id` exists but unused) |
| Contact form | `POST /api/api/contact` | `Lead` + `Inquiry` | ✅ `consent === true` literal | `source = "contact"` | phone-based unverified |
| CMA | `POST /api/cma` + `/api/crm/cma/[id]` | `Lead` + `Inquiry` + `CmaReport` | ✅ | `source = "cma_request"` | email |
| Open-house RSVP | `POST /api/open-houses` + `/api/portal/open-houses/rsvp` | `Lead` + `Inquiry` + `Showing` | unverified (gap 3.3) | `source = "open_house_rsvp"` | email |
| Guide download | `POST /api/guides/download` | `Lead` + `Inquiry` | ✅ | `source = "guide_download"` | email |
| Search-alert signup | `POST /api/search-alerts` | `Lead` + `SavedSearch` + `Inquiry` | ✅ + opt-in | `source = "search_alert"` | email |
| Favorites | `POST /api/portal/favorites` + `/api/favorites` | `Lead` + `ClientListingAction` | unknown (gap 3.4) | implicit | email |
| Sign-up (portal) | `POST /api/sign-up` | `Lead` (or redirect to login) | ✅ `tcpaConsent` | `source = "website"` | email unique + honeypot `website` (gap 3.1: silently accepted, no 400) |

### A.5 CRM Prisma model surface

**Core (14):** `Agent`, `Lead`, `Deal`, `Listing`, `Offer`, `Showing`, `SavedSearch`, `Comment`, `FamilyMember`, `LeadParty`, `ActiveLease`, `ProtectedPeriod`, `Document`, `AuditEvent`.

**Supporting (6):** `Inquiry`, `ClientListingAction`, `ClientPreference`, `ExternalListing`, `ExternalListingComment`, `ListingView`.

**Analytics (8):** `IntentEvent`, `BuyerIntentProfile`, `DemandSignal`, `DemandIndex`, `DemandAlert`, `AgentMetrics`, `AgentPerformanceIndex`, `CmaReport`, `ShowingFeedback`.

**Sync/cache (3):** `SyncState`, `SyncError`, `ListingsArchive`.

**Search-relevant (2):** `Listing` (authoritative), `ListingSearchProjection` (read-optimized; dual-written by 10 callers; reader = PR 5B held).

### A.6 CRM ↔ search interaction

- CRM `POST /api/crm/listings` calls `dualWriteProjectionForListingId()` after insert → `ListingSearchProjection` is kept current as a write target.
- **No CRM route reads from `/api/listings`, `/api/idx/search`, or `ListingSearchProjection`** today. Sales-prospect comps fetch listings directly via Prisma (`/api/crm/sales/comps`).
- CRM has no full-text agent search. Filter set on `/api/crm/listings`: `type`, `status`, `limit`, `offset` — that is the entire current agent-side search surface.

### A.7 Owner/contact PII surface (CRM-side)

**Stored PII (Lead):** `first_name`, `last_name`, `email`, `phone`, `attorney_{name,email,phone,firm}`, `secondary_{first_name,last_name,email,phone}`. **LeadParty:** full name, email, phone, role (unlimited parties per lead).

**Stored PII (Agent):** `email` (broker/agent contact).

**Stored PII (Listing):** `agent_info` JSON containing `ListAgentFullName`, `ListAgentEmail`, `ListOfficeName` (REBNY-private email preserved per Phase A.5 design).

**Reveal surfaces (today, CRM-side):**
- `/api/crm/leads` GET — serializes `email`, `phone` on every read.
- `/api/crm/clients` GET, `/api/crm/sales/prospects` GETs, `/api/crm/sales/sellers/buyers` GETs — same.
- `/api/crm/audit-log` GET — `changes` JSON may include before/after PII values.

**Reveal gates today:** `requireAgentOrBroker()` only. **No explicit "this agent owns this lead" enforcement.** Mitigation: Prisma `where.agent_id = auth.userId` on most list routes — but per the 2026-05-18 gap audit (Finding 9.2), agent-level row isolation is implicit, not server-enforced. An agent could in principle craft a PATCH to another agent's lead and (depending on the route's `where` clause) succeed.

**Audit chain:** `AuditEvent` model writes `action`, `entity_type`, `entity_id`, `changes` JSON, `user_id`, IP, timestamp. Indexed on `user_id` + `entity_id`. NY SHIELD-compliant retention is wired (2 yr default; commission/deal rows extended per `COMPLIANCE-CANONICAL-INDEX.md §15`).

---

## B. Current search architecture map

### B.1 Public search reader — `app/api/listings/route.ts` (~1270 lines)

**Query params:** `type` (sale/rent/buy), `neighborhood`, `borough`, `minPrice`/`maxPrice`, `beds`, `minBaths`, `propertySubTypes`/`subTypes`, `status`, `minSqft`/`maxSqft`, `sort`, `skip`, `limit`, `pets`, `featured`, `exclusive`, `address`, `q` (aliased to `address`), `bounds`, `openHouse`, `openHouseDate`, `amenities`.

**DB-first path (lines 306–540):**
1. `buildPublicListingDbSearch(searchParams)` → WHERE + ORDER BY (`lib/search/public-listing-db.ts`)
2. `prisma.listing.findMany()` reads `Listing` table directly (line 315–378)
3. `filterDisplayableDbListings()` enforces the 6 distribution gates (line 394)
4. `applyPublicListingPostFilters()` for amenities/features/keywords (line 420)
5. Open-house Trestle resource intersection (lines 422–452)
6. Photo fallback + geocoding (lines 454–495)

**Trestle fallback (lines 644–1034):**
1. `buildPublicListingTrestleFilter()` → OData $filter string
2. `checkDistributionGates()` on raw Trestle rows (line 711)
3. Post-filters: bounds, borough, neighborhood, sub-type, open house (lines 783–864)
4. Media batch fetch (Trestle phase 1, DB fallback phase 2)
5. `mergeExclusiveListings()` + dedup by listing_id (line 981)

**`_source` envelope** (C1 fix, 2026-05-13): `"db+idx"`, `"db+exclusive"`, `"db+mixed"`, `"idx+exclusive"`, `"exclusive"`, `"none"`.

**PR 5B status confirmed:** `ListingSearchProjection` exists in schema, 100% dual-written by 10 callers — **zero reads in `/api/listings`**. Reader swap = PR 5B held.

### B.2 Search suggest — `app/api/listings/suggest/route.ts`

- Neighborhoods (from 5 borough JSON files), building names (Trestle text search), address fragments.
- `classifySuggestQuery()` ranks (`lib/search/suggest-classify.ts`).
- `isAddressDisplayablePerSuggest()` gates address suppression.
- `SUGGEST_SELECT_FIELDS` slim (PR-S.1d, 2026-05-15): only identifiers + gate inputs + address components.

### B.3 IDX agent search — `app/api/idx/search/route.ts`

- `GET /api/idx/search` — direct Trestle passthrough; `requireAgentOrBroker()`.
- `SEARCH_SELECT_FIELDS` ~60 fields; `mapTrestleToCrmListing()` flattens for CRM.
- **No UI wraps this endpoint today.**

### B.4 `lib/idx/**` (12 files)

`auth.ts` (Bearer token), `fetch.ts` (OData runner + media batch), `trestle-mapper.ts` (Cotality→Prisma + 6 distribution gates + `TERMINAL_STATUSES` + `normalizeStandardStatus()`), `sync.ts` (incremental sync loop + `dualWriteProjectionForListingId()` call), `mapping.ts` (raw Cotality→`IDXListing` DTO), `public-dto.ts` (`toPublicDTO()` + co-listing badge), `db-to-public-dto.ts` (`dbListingToPublicDTO()` + `classifyDbListing()` + `filterDisplayableDbListings()`), `media-sync.ts` (R2 cache + media table), `card-fields.ts` (`CARD_SELECT_FIELDS`), `watermark.ts`, `logger.ts` (Trestle access audit per 12-month retention).

### B.5 `lib/search/**` (8 files)

`public-listing-db.ts` (Prisma WHERE/ORDER BY builder), `public-listing-trestle.ts` (OData $filter builder), `listing-access-decision.ts` (`SEARCH_DISPLAY_GATE` constant + `buildSearchDisplayWhere()`), `listing-search-projection.ts` (PR 5A/5B target — `buildListingSearchProjectionRow()` + `dualWriteProjectionForListingId()`), `crm-idx-filter.ts` (CRM OData), `crm-idx-mapper.ts` (Trestle→CRM flat), `suggest-classify.ts`, `natural-language-parser.ts`, `search-run-recorder.ts`.

### B.6 `Listing` indexes today

`(status, listing_type)`, `(list_price)`, `(borough, neighborhood)`, `(rls_eligible)`, `(bedrooms_total)`, `(modification_timestamp)`, `(agent_id)`, `(owner_client_id)`. **No PostGIS / geo index.** All geo via Census API at request time.

### B.7 `ListingSearchProjection` indexes today

`(listing_type, mls_status)`, `(borough, neighborhood)`, `(postal_code)`, `(list_price)`, `(bedrooms)`, `(bathrooms)`, `(property_sub_type)`, `(modified_at)`, composite `distribution_gates_idx`. Includes derived booleans (`is_commercial`, `is_new_development`, `is_exclusive`, `is_rental`) + full-text `searchable_text` + JSON `amenity_keys`/`feature_flags`.

### B.8 Sitemap + SEO (`app/sitemap.ts`)

Includes only listings passing all 6 gates: `idx_display_yn=true`, `internet_entire_listing_display_yn=true`, `owner_opt_out=false`, `participant_only=false`, status ∈ `ACTIVE_DISPLAY_VALUES`. No external/sponsor row can leak through.

### B.9 External-inventory scaffolding (already in code)

- `lib/external-listings/` directory exists (`normalize.ts`, `rollup.ts`, `__tests__`)
- `Agent.external_listings: ExternalListing[]` relation
- `Lead` has 2 relations to ExternalListing (`submitted_external_listings`, `external_listings`)
- `ExternalListing.family_visible` boolean for same-family/co-buyer visibility
- **NOT integrated into `/api/listings`** — CRM-only

This existing scaffold is the right Tier 2 starting point — but the parked external-inventory spec adds new tables (`external_inventory_listings`, `external_inventory_client_shares`, `external_inventory_pii_reveal_log`) on top. The existing `ExternalListing` model is from a different design pre-2026-04-30 and may be repurposed or superseded by the parked spec.

---

## C. Current public-IDX vs agent-search boundary (EXPLICIT)

### C.1 Public IDX / public search — what's allowed

| Constraint | Source |
|---|---|
| Trestle/Cotality REBNY IDX Plus ONLY | UCBA Art. III §1 + IDX Plus license |
| REBNY attribution required on every render | UCBA Art. III §2(C) — "Listing Courtesy of [Exclusive Broker]" in reasonably prominent location, font ≥ median typeface |
| `_compliance.attribution` + `_compliance.disclaimer` in API JSON; Footer brokerage attribution `Mallan Real Estate Inc.` + license #10991205323 + 400 East 90th + 646-258-4460 | NY DOS §175.25 |
| 6 distribution gates enforced (5 fail-closed + 1 §2.05 terminal-status) | `lib/idx/trestle-mapper.ts` + `lib/compliance/idx-display-gate.ts` + `lib/compliance/gates.ts` |
| No StreetEasy scrape | T2 hold |
| No Schedule A shadow inventory | T3 hold |
| No external inventory | T2 hold |
| Sponsor row in public IDX ONLY if linked to actual RLS listing (`rls_listing_id IS NOT NULL`) AND compliant | T3 spec §4.7 |

### C.2 Agent CRM search — what may eventually be allowed

| Tier | Visibility | Toggle | Disclaimer | Audit |
|---|---|---|---|---|
| T1 (RLS) | YES, default ON | n/a | REBNY attribution inherited | standard |
| T2 (External) | YES, default OFF | `include_external_inventory` (per-agent stored OR per-request param) | "Non-RLS — not from REBNY IDX. Source: [stamped at write]. Information not verified." stamped at write, versioned, locked to row | `external_inventory_pii_reveal_log` + `AuditEvent` on every reveal |
| T3 (Sponsor) | YES, default OFF | `include_sponsor_inventory` | "Sponsor / new-development — non-RLS unless linked to active RLS listing. [stamped sponsor badge]" | `sponsor_pii_reveal_log` + `AuditEvent` on every reveal |

### C.3 Client portal — what's allowed

| Constraint | Source |
|---|---|
| ONLY agent-shared inventory visible to clients | T2 spec §7.3 + T3 spec §6.3 |
| Buyer/tenant portal cannot see listing-agent name | `lib/compliance/dto.ts:261` `sanitizeForPortal` (Hotfix 3, 2026-05-13: agent_info uniformly reduced to `{ company: ListOfficeName }`) |
| Seller/landlord portal scoped to `Listing.owner_client_id = viewer.userId` only | `Listing.owner_client_id` `prisma/schema.prisma:443` (gap: not uniformly enforced middleware-side) |
| Owner/contact PII (T2/T3) NEVER visible to clients | T2 spec §9.4 `externalInventoryPortalDTO` strips all owner PII; T3 spec §7.1 access matrix |
| Disclaimers visible on every shared listing render | T2 spec §6.1 (version-locked at write) |
| Fair Housing scan BEFORE share | `scanTextForFairHousing()` must run on caption/cover-note BEFORE outbound (currently runs at listing-write time only — gap) |
| FARE Act disclosure on rentals (including T2/T3 rental shares to NYC tenants) | NYC LL 119/2024 §20-699.21, §20-699.22 |

### C.4 CRM — what's mapped, stubbed, gapped (see §D + §F below)

Map: 150 routes, 70 models, 8 lead-capture surfaces, `requireAgentOrBroker` on all CRM routes, AuditEvent chain.

Stubs / gaps: BUYER + TENANT deal-form submit, impersonation backend bypass (`Store.startImpersonation` client-only), Outlook N+1, page-size cap, portal write rate-limits, ethics-gate mid-session, per-agent row isolation, `Inquiry.duplicate_of_lead_id` unused, honeypot silent accept, search-alert unsubscribe entropy, RSVP consent capture, broker approval queue POST targets unverified.

### C.5 PR sequence — see §R below

Safe-now CRM hardening (no schema) → report/doc cleanup (no schema) → external/sponsor architecture (schema, HELD, requires Maya approval) → schema/migration PRs only after approval → PR 5B reader swap LATER, not now.

---

## D. Current Lead/Client/Deal/Commission workflow map

### D.1 Lead lifecycle

```
PUBLIC INTAKE                     CRM CONVERSION                  POST-CLOSE
────────────                      ──────────────                  ──────────
inquiry/contact/CMA/RSVP/      → POST /api/crm/sales/         → Deal.status = "closed"
guide/search-alert/favorites/    prospects/[id]/convert         → Commission flow
sign-up                          (creates Client from Lead)     → AuditEvent
                                                               
↓ writes Lead + Inquiry          ↓ Lead.roles ← chosen           ↓ ProtectedPeriod created
↓ source attribution             ↓ converted_at MISSING (gap 5)  if Expired
↓ TCPA consent_captured_at       ↓ AuditEvent logged             
↓ honeypot (silent — gap 3.1)    ↓ agent_id assigned (broker     
                                   action — but POST /api/crm/   
                                   leads/[id]/assign MISSING —    
                                   gap 4)                          
```

### D.2 Deal/Commission workflow

```
DEAL CREATE                     APPROVAL                          PAYOUT
───────────                     ────────                          ──────
BUYER-DEAL-FORM submit          /api/crm/deals/[id]/status        /api/crm/commissions/[id]
TENANT-DEAL-FORM submit         (broker approve/reject)           (broker approve/reject)
                                                                  
↓ Frontend STUB                  ↓ Real backend                    ↓ Frontend funcs
↓ never POSTs to                ↓ /api/crm/deals exists           ↓ _approvePayout,
↓ /api/crm/deals                  but no inbound traffic           ↓ _rejectPayout
↓ DEAL ROWS NEVER CREATED        from forms today                  ↓ POST targets unverified
↓ (CRITICAL — Finding 1.1)                                          ↓ (Finding 1.3)
↓ PR #146 ready to fix                                              
```

### D.3 Commission confirmation (post-NAR settlement — applies to ALL listings)

Per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` §14b open-question, Maya's correction 2026-04-30:
- Post-Sitzer/Burnett (Aug 2024), buyer-broker compensation is no longer on MLS feeds.
- Buyer-rep agreements are mandatory before touring.
- Compensation has multiple sources per transaction (seller concession + listing co-broke if any + buyer payment + closing credits).
- **The "call each agent to confirm" workflow is the new baseline for ALL listings, not just sponsor/external.**
- The T3 sponsor spec proposes `commission_confirmed_at` as a per-row attribute. Sponsor-spec §14b notes this should generalize to a separate `CommissionConfirmation` model spanning all tiers.

### D.4 Owner-PII reveal workflow (T2/T3, parked)

```
AGENT CLICKS "REVEAL OWNER"      MODAL ATTESTATION                 REVEAL
────────────────────────         ─────────────────                 ──────
[T2 external] or [T3 sponsor]    Display: "I confirm I have a      Owner name/email/phone
listing card with owner-info     legitimate business purpose.      shown to that agent only
hidden by default                I will use TCPA-compliant         in a transient UI surface
                                outreach. I will not share this    (does NOT update DTO
↓ Onclick "Reveal owner"          contact info."                    cache; refetch reveals)
                                                                  
↓ Frontend opens modal            ↓ Two-step click required         ↓ AuditEvent row:
                                  ↓ Checkbox + Confirm              ↓ action="owner_pii_revealed"
                                                                    ↓ entity_type="external_listing"
                                                                       or "sponsor_listing"
                                                                    ↓ user_id, IP, timestamp,
                                                                       attestation=true
                                                                    ↓ Also writes to
                                                                       external_inventory_pii_reveal_log
                                                                       or sponsor_pii_reveal_log
                                                                       (separate table)
```

Reveal access matrix (T2 spec §7.1, T3 spec §7.1):
- Discovering agent + broker_admin → all PII
- Other agents → owner-PII fields = null
- Clients → never

### D.5 Lead plugin integration path (not yet built)

```
EXTERNAL LEAD SOURCE             IMPORT                            MERGE / ROUTE
────────────────────             ──────                            ─────────────
Lead-plugin (Zapier,             POST /api/crm/leads/import        ↓ Match against existing
Realvolve, Follow Up Boss,       (body: array of leads + source       Lead by email + phone
LionDesk, etc.)                  + consent provenance)               ↓ If match: merge roles,
                                                                       preserve consent state
                                                                    ↓ If no match: create new
                                                                       Lead with source=plugin/<name>
                                                                    ↓ All without bypassing:
                                                                       - consent gate (no consent
                                                                         → status="needs_consent_capture"
                                                                         → outbound automated comms
                                                                         BLOCKED until first inbound
                                                                         or explicit capture)
                                                                       - dedupe by email
                                                                       - source tracking
                                                                       - agent ownership (target_agent_id
                                                                         required in payload)
                                                                       - Fair Housing scan on notes
```

---

## E. What exists already

### E.1 CRM
- ✅ 150 routes covering 11 functional clusters (verified 2026-05-21)
- ✅ 70 Prisma models, all actively used
- ✅ 8 public lead-capture surfaces wired to real Prisma writes
- ✅ AuditEvent chain with 240+ writes across routes
- ✅ Distribution-gate enforcement on listing writes (`assertRlsCompliantPayload`)
- ✅ Fair Housing hard-block scanner on listing-write payload (`lib/compliance/rls-enforcement.ts FAIR_HOUSING_HARD_BLOCKS` 16 patterns + JSON list ~80 patterns + client-side `public/crm/js/compliance/fair-housing.js`)
- ✅ ProtectedPeriod model + 90-day post-expiration logic (UCBA Art. II §6/§13)
- ✅ DOM tracker with 30-day reset (`lib/compliance/dom-tracker.ts`)
- ✅ TCPA consent capture on every public lead-capture
- ✅ NY DOS §175.25 attribution in footer + JSON-LD identifier (10991205323)
- ✅ FARE Act disclosure live on rentals (verified 15-rental probe 2026-05-21)
- ✅ Anti-discrimination notice component (`app/components/AntiDiscriminationNotice.tsx`)
- ✅ Multi-workspace gate v2 (`requireWorkspace()` + `Lead.enabled_workspaces[]`)

### E.2 Search
- ✅ Public reader at `/api/listings` (DB-first + Trestle-fallback + open-house intersection + bounds + post-filters)
- ✅ Suggest endpoint with classified query + address-displayability gate
- ✅ IDX agent passthrough at `/api/idx/search` (no UI)
- ✅ ListingSearchProjection 100% dual-written (10 callers) — ready for PR 5B reader swap
- ✅ Sitemap correctly excludes non-displayable rows
- ✅ External-inventory scaffold (`lib/external-listings/`, `ExternalListing` model with `agent_id` + `family_visible`)

### E.3 Compliance
- ✅ 6 REBNY distribution gates (fail-OPEN for provider-gated, fail-CLOSED for per-row opt-out)
- ✅ Phantom-field documentation + tests (no `IDXEntireListingDisplayYN`, no `ParticipantOnlyYN`, no `VOW*`, no `SyndicateYN`, no `FirstShowingDate`)
- ✅ §2.05 terminal-status removal (writer + cron belt-and-suspenders)
- ✅ `normalizeStandardStatus()` exported as canonical from `trestle-mapper.ts`
- ✅ `affirmPermission()` for per-row opt-out fields
- ✅ 19 mandatory UCBA fields enforced on listing-create
- ✅ Off-market language ban (`OFF_MARKET_PATTERNS`)
- ✅ Compensation-in-description ban (`COMPENSATION_PATTERNS`)
- ✅ NAR-removed-field strip (`REMOVED_FIELDS` in `lib/compliance/dto.ts`)
- ✅ Coming Soon badge + `ActivationDate` immutability (UCBA Art. I §16)
- ✅ Phase A centralized `computeGateColumns()` (PR #165 merged) + W1/W2/W3 wiring closed

### E.4 Tiered-inventory specs (HELD)
- ✅ External-inventory spec drafted (701 lines, addresses FSBO + off-market + reveal-gate + share-gate + portal DTO + public-route firewall + ToS legal-review gating for scraper)
- ✅ Sponsor-database spec drafted (1003 lines, addresses ETL sources + 9 tables + shadow-row + classification badges + commission_confirmed_at + access matrix)
- ✅ Hold record clearly states the 2 release conditions

---

## F. What is stubbed or broken

### F.1 Class-A defects (must fix; safe-now; no schema)

| ID | Item | Source | Impact | PR readiness |
|---|---|---|---|---|
| 1.1 | BUYER-DEAL-FORM + TENANT-DEAL-FORM submit stubs (deals never reach broker queue, no audit trail) | gap audit §1.1 + workflow audit rank 1 | CRITICAL | PR #146 ready to merge (wiring only) |
| 2 | Impersonation client-side only (`Store.startImpersonation` bypasses backend) | workflow audit rank 2 | CRITICAL-SECURITY | Backend route exists at `POST /api/crm/agents/[id]/impersonate`; frontend `app.js:872-889` needs to actually call it + receive delegated session |
| 1.4 | CRM list endpoints — no documented server-side page-size cap (e.g., `/crm/leads?limit=99999` could exfiltrate full table) | gap audit §1.4 | NY SHIELD risk | Add `Math.min(limit, 200)` clamp + audit log |
| 2.1 | Portal writes (11 POST routes — offers, showings, comments, signals) have NO rate limit | gap audit §2.1 | HIGH (UCBA duplicate-row + email-fanout DDoS) | Apply existing `checkRouteRateLimit()` pattern |
| 9.1 | Mid-session ethics-training gate (UCBA Art. III §6) — checked only at `createSession()`, not per-request | gap audit §9.1 + post-recon audit B6 | ACTIVE UCBA HOLE | Move check into `requireAgentOrBroker()` middleware; cache 5-min |
| 9.3 | Auth invite TTL not validated server-side (stale tokens redeemable indefinitely) | gap audit §9.3 | MEDIUM | Add `invite_token_expires_at` check on redeem |
| 3.1 | Sign-up honeypot silently accepted (no 400 Bad Request — bot records "success") | gap audit §3.1 | MEDIUM | Return 400 + log; do NOT create Lead |
| 1.2 | Outlook N+1 import (sequential `client.create()` + `client.update()` chain) | gap audit §1.2 | UX regression on large folders | Add `POST /api/crm/clients/bulk` |

### F.2 Class-A verify-only (need source-side confirmation but probably fine)

| ID | Item |
|---|---|
| 1.3 | Approval-queue `_approvePayout` / `_rejectPayout` / `_approveDoc` POST targets unverified — grep panels.js:4641/4683/6759 for `fetch`/`api/crm` call |
| 3.2 | Search-alert unsubscribe token entropy (≥128-bit, HMAC-signed) |
| 3.3 | Open-house RSVP consent capture (`POST /api/open-houses` writes `consent_captured_at`?) |
| 3.4 | Favorites consent capture |
| 4.1 | Outlook routes NO rate limit |
| 4.2 | Outlook refresh-token rotation + decrypted-at-rest |
| 6.1 | Seller portal family/document POST handlers |
| 7.3 | `/api/pages/[slug]/route.ts` auth status |

### F.3 Class-B (open, schema/migration touch)

| ID | Item |
|---|---|
| 2.2 | Portal offers use `ClientListingAction.action="offer"` instead of `Offer` model — two storage paths fragment commission reporting (also UCBA Art. II transmission compliance) |
| #62 | SMS password reset (open 22 days) — awaiting Maya pre-merge migration runbook |
| - | CRM list page-size cap tightened (1000 → 200) as schema-default |
| - | Documents upload backend if missing |
| - | Townhouse-seller dedicated model (after Phase 1 lands) |
| 5 | `Lead.converted_at` timestamp column missing — cannot cleanly answer "when did lead become client" |
| 6 | `PATCH /api/crm/leads/[id]` broker-only — agents can't update own leads' status without `/api/crm/convert` |
| 11 | Multi-role dedupe missing (`roles = ["buyer", "buyer"]` possible on re-intake) |

### F.4 Class-A workflow defects (additional from 2026-05-16 audit, top 25 ranked)

| Rank | Item | Severity | Status |
|---|---|---|---|
| 3 | Duplicate-inquiry dedupe policy inconsistent (public upsert vs CRM reject) | HIGH | Inquiry.duplicate_of_lead_id exists but unused |
| 4 | No `POST /api/crm/leads/[id]/assign` (broker action declared in permissions.js:34, backend missing) | HIGH | Add route |
| 7 | No broker approval gate on seller/landlord intake (intake → active directly) | MEDIUM | Design decision: do we require Maya sign-off? |
| 8 | No `POST /api/crm/referrals/[id]/approve` (declared at permissions.js:65, backend missing) | MEDIUM | Add route |
| 9 | Convert API audit incomplete (some handlers like `activate_renter`, `sign_lease` may not log) | MEDIUM | Spot-check |
| 10 | Two parallel audit systems (`AuditEvent` + `ActivityLog` not coordinated) | MEDIUM | Pick one canonical; deprecate the other |
| 14 | `SavedSearch.lead_id` nullable — agent-only searches allowed (policy unclear) | LOW | Acceptable for agent search lane |

### F.5 Observability (post-recon audit O1–O5)

| ID | Item |
|---|---|
| O1 | Only 2/23 crons visible in `ops:health` |
| O2 | 5 crons leave zero persistent evidence per firing |
| O3 | No expected-vs-actual firing count; ~40% of `idx_sync` firings produce no audit row |
| O4 | No deploy/cron race detector (2026-04-30 49-row corruption repeatable) |
| O5 | `hours_since_last_run < 0.2h` ceiling too tight for `*/10` crons |

### F.6 Writer-side defense-in-depth gap (post-recon W4)

| ID | Item |
|---|---|
| W4 | `scripts/import-closed-from-trestle.ts` hardcodes `true` on terminal rows; cleaned by data-retention cron ≤24h. Only writer not on Phase A wiring. Closing this is a precondition for PR 5B reader-swap soak. |

---

## G. What is missing

### G.1 Agent search (the biggest "what is missing")

There is **no agent-search UI today.** The agent today either uses:
- `/api/crm/listings?type=&status=&limit=&offset=` — simple filtered list of their own (or all if broker) listings, OR
- `/api/idx/search?...` — direct Trestle passthrough, no UI

**For "top-notch agent search" we need:**
1. A new agent-search shell page (e.g., `/agent/search` or `/broker/search`) — agent-only auth
2. Backend `GET /api/crm/search` with:
   - All public-search params PLUS
   - Per-agent saved searches
   - Multi-tier toggles (T1 always on, T2/T3 default OFF, opt-in)
   - Building/agent/broker name search
   - Status filters that include `Active`, `ComingSoon`, `ActiveUnderContract`, `Pending`, `Withdrawn`, `Expired`, `Cancelled`, `Closed` (agent visibility wider than public)
   - Owner-info reveal-gate (T2/T3 only)
   - Saved-search + share-to-client + send-as-collection flow
3. Ranking model — relevance scoring on: recency, price-match, neighborhood-match, beds/baths-match, agent's recent activity, tier (T1 > T2 > T3 unless toggle says otherwise)
4. Per-agent privacy — Agent A's saved searches, sends, shares, opens, clicks NOT visible to Agent B

### G.2 Client-share / send

- A `ListingSend` model (master plan PR 8 — NOT STARTED) is the canonical share-row primitive. Needed for share-with-client flow on all 3 tiers.
- T2/T3-specific share tables (`external_inventory_client_shares`, `sponsor_listing_client_shares`) sit on top of the same primitive.
- Share copy must run through Fair Housing scanner BEFORE send (currently scans listing fields only, not share captions).
- Share email/SMS must carry NY DOS §175.25 attribution + CAN-SPAM footer + unsubscribe link.
- TCPA: share-to-recipient with no `consent_captured_at` blocks automated outreach; allowed if the agent owns the recipient as a consenting Lead.

### G.3 Lead plugin integration

- `POST /api/crm/leads/import` does not exist. Needed to receive lead-plugin webhooks/API drops.
- Must NOT bypass: consent capture (each imported lead carries provenance + `consent_captured_at` if available, else `status='needs_consent_capture'`), dedupe (email-first match, phone-second), source tracking (`source` field populated from plugin), agent ownership (target `agent_id` required), Fair Housing scan on imported notes.

### G.4 Tiered inventory (T2 external, T3 sponsor) — HELD

- `external_inventory_listings`, `external_inventory_client_shares`, `external_inventory_pii_reveal_log` (per parked spec)
- 9 sponsor tables (per parked sponsor spec)
- Reverse-direction architectural test (`lib/external-listings/**` + future `lib/sponsor/**` cannot import `lib/search/listing-search-projection.ts`)
- New non-RLS disclaimers (versioned, write-time stamped)
- Tier-specific portal DTO sanitizers (strip owner PII before send to client portal)

### G.5 Ethics gate (UCBA Art. III §6)

- `Agent.ethics_completed_at` + `Agent.ethics_expires_at` columns do not exist (only `Agent.ethics_training_expires_at` per E.1; but per-request middleware check missing per F.1 9.1).
- Mid-session enforcement (currently login-only).
- Per-agent block when expired.

### G.6 Per-agent row-isolation middleware

- A canonical `requireOwnedBy(req, "Lead", id)` helper at the route level (today implicit via `where` clause).
- Apply systematically to: `PATCH /api/crm/leads/[id]`, `PATCH /api/crm/clients/[id]`, `PATCH /api/crm/showings/[id]`, `PATCH /api/crm/saved-searches/[id]`, and every other mutation on agent-owned data.

### G.7 Commission confirmation (post-NAR)

- Generic `CommissionConfirmation` model (or per-listing `commission_confirmed_at` + audit) that applies to ALL tiers, not just sponsor. Spec §14b notes this open question.

### G.8 Observability for cron firings

- Cron-heartbeat AuditEvent + `ops:health` expected-vs-actual + relaxed jitter ceiling per post-recon Phase D.

### G.9 W4 writer-guard (closed-list import)

- Last remaining writer not on Phase A wiring; closing it is a precondition to PR 5B soak.

---

## H. StreetEasy / external inventory integration plan (T2)

### H.1 Source

- Phase 1 (MVP): manual "Add Off-Market" by agents — FSBO links, off-market discoveries, expired/withdrawn RLS still being sold outside RLS, agent-discovered yard signs, broker-network word-of-mouth.
- Phase 2 (parked): bulk import from approved third-party data sources.
- Phase 3 (parked, requires legal review): scraper for public StreetEasy (Terms of Service review required before any ToS-touching work).

### H.2 Data model (per parked spec)

| Table | Purpose |
|---|---|
| `external_inventory_listings` | Standalone — never joined to `listings`. Stores address, price, beds/baths, owner contact info, source URL, disclaimer text + version, stamped at write |
| `external_inventory_client_shares` | Only mechanism for client visibility. Agent → Lead share-row |
| `external_inventory_pii_reveal_log` | Audit trail for every owner-PII reveal action |

### H.3 Boundary firewall (REVERSE BOUNDARY PIN — needed)

- `lib/external-listings/**` cannot import `lib/search/listing-search-projection.ts` or write to `ListingSearchProjection`
- `lib/external-listings/**` cannot be referenced from `app/api/listings/**`, `app/sitemap.ts`, `app/robots.ts`, `app/listing/[id]/**`, `app/search/**`, public structured-data emitters
- Source-grep CI test (mirror of `tests/runtime/syndication-no-idx-imports.test.ts` but reversed)

### H.4 Agent toggle

- Per-agent setting OR per-request param `include_external_inventory=true` (default FALSE)
- When false: external rows do not appear in agent search
- When true: external rows appear with **non-RLS disclaimer rendered inline** on every card + detail render

### H.5 Disclaimer (write-time, versioned)

- Stamped on every external_inventory_listings row at write
- Version-locked: old rows retain original language
- Rendered in: CRM card, detail modal, portal display, share email
- Suggested text: *"Non-RLS inventory. Not from REBNY IDX. Information may not be current and is provided for agent-to-client conversation only. Verify all details with the listing owner before reliance."*

### H.6 Owner PII reveal

- Default: `owner_name = null`, `owner_email = null`, `owner_phone = null` in agent UI
- Click "Reveal" → modal with two-step attestation: "I have a legitimate business purpose" + "I will use TCPA-compliant outreach" → confirm
- On confirm: backend writes AuditEvent `action="owner_pii_revealed"`, entity_id, user_id, IP, timestamp, attestation=true; also writes `external_inventory_pii_reveal_log` row
- Reveal access matrix: discovering agent + broker_admin only. Other agents see PII = null. Clients NEVER see.

### H.7 Client share

- Agent opens external listing → "Share with client" → selects lead from own portfolio → optional caption (Fair Housing scanned BEFORE send)
- Backend writes `external_inventory_client_shares` row
- Client portal renders the listing with: non-RLS disclaimer, owner PII = null, agent name + brokerage attribution (NY DOS §175.25), Fair Housing-clean caption
- Revoke: agent sets `revoked_at`; portal stops rendering immediately

### H.8 Dedupe + cross-tier collision

- `address_normalized` (lowercased, suffix-stripped) is the brokerage-wide dedupe key
- If an external listing is later submitted to RLS by the same agent: external row keeps `promoted_to_listing_id = <RLS listing_id>`; CRM UI hides external from search but keeps row for audit

---

## I. Schedule A / new-development sponsor inventory plan (T3)

### I.1 Source (Phase 1 — public records ETL only)

- NY AG REFB (Real Estate Finance Bureau) offering-plan database — monthly feed
- ACRIS (NYC Department of Finance) deed delta — weekly; identifies sponsor LLC holdings
- NYC Open Data (MapPLUTO, DOB, HPD) — quarterly/weekly; building characteristics + CofO dates
- No scraping in Phase 1; all sources are documented public APIs/datasets

### I.2 Data model (9 tables, per parked spec)

| Table | Purpose |
|---|---|
| `sponsor_buildings` | Physical building, offering-plan references, year converted, abatement program |
| `sponsor_entities` | Sponsor LLC legal entity (normalized name dedup) |
| `management_companies` | Operational manager (Rose, AKAM, etc.) with in-house-brokerage flag |
| `selling_brokerages` | Exclusive listing broker (REBNY membership tracked but not required) |
| `sponsor_units` | Units in building, sponsor-held vs sold, ownership_status from ACRIS |
| `sponsor_listings` | Active sale of sponsor unit (RLS-linked OR non-RLS shadow row with disclaimer) |
| `sponsor_listing_client_shares` | Only client-visibility mechanism |
| `sponsor_pii_reveal_log` | Audit trail for selling-agent / sponsor-entity contact reveals |
| (linked `Listing.id`) | For RLS-linked shadow rows |

### I.3 Shadow-row rule

- **If sponsor unit IS in RLS:** `source='rls'`, `rls_listing_id` set, inherit RLS attribution + display gates; T1 rules govern; this is the ONLY case where sponsor data can appear on public surfaces
- **If sponsor unit NOT in RLS:** `source='building_marketing_site'` (or similar), store shadow row locally with non-RLS disclaimer + sponsor badge, agent-only + share-only visibility
- **If sponsor unit transitions to RLS with Mallan listing:** status → `'promoted_to_rls'`, `promoted_to_listing_id` set, row stays for audit

### I.4 CRM badging (CRM-side only, never on public DTO)

- Yellow sponsor badge "Sponsor / New Development" on every sponsor listing card
- Show: developer name, management company, abatement program, conversion year
- Hide on public DTO via `lib/compliance/dto.ts` extension

### I.5 Access matrix (per parked spec §7.1)

| Field | Discovering agent | Other agents | Clients (via share) |
|---|---|---|---|
| Building details (address, name, beds available) | YES | YES (read-only) | YES (only if shared) |
| Sponsor LLC legal name + registered-agent address | YES | YES | YES (NY DOS public — no attestation needed) |
| Selling-agent name + brokerage | YES | YES | YES (Mallan attribution must accompany) |
| Selling-agent direct email/phone | reveal-gate + audit | null | null |
| Sponsor unit asking price | YES | YES | YES (only if shared) |
| Commission terms (post-NAR) | reveal-gate after `commission_confirmed_at` set | null | null |

### I.6 Commission confirmation

- `sponsor_listings.commission_confirmed_at` set when agent has called and verified terms
- `sponsor_listings.commission_basis` (one of: `seller_concession`, `co_broke`, `buyer_pays_own_agent`, `closing_credit`, `other`)
- `sponsor_listings.commission_value` (amount or percentage)
- Audit row: who called, when, what was said
- Share-to-client blocks if `commission_confirmed_at IS NULL` (configurable per brokerage policy)
- Maya's correction (per HOLD record): generalize this to `CommissionConfirmation` model for ALL tiers — not just sponsor.

### I.7 Disclaimer

- Versioned, write-time stamped
- "Non-RLS sponsor inventory. Information sourced from public records and may not reflect current availability or terms. Verify with selling broker before reliance. Commission terms subject to confirmation."

### I.8 Boundary firewall

- `lib/sponsor/**` (future) cannot import `lib/search/listing-search-projection.ts` or be referenced from `app/api/listings/**` or sitemap/SEO
- Same reverse-pin CI test as external (H.3)
- EXCEPTION: when `sponsor_listing.rls_listing_id IS NOT NULL`, the LISTING (not the sponsor row) flows through RLS rails normally — sponsor metadata stays CRM-side

---

## J. Lead plugin integration plan

### J.1 Entry point

- `POST /api/crm/leads/import` (does not exist today)
- Auth: `requireAgentOrBroker()` (broker for bulk, agent for self-only)
- Body: array of leads + source plugin name + per-lead consent provenance

### J.2 Required per-lead fields

| Field | Required | Behavior if missing |
|---|---|---|
| `email` | YES | reject lead |
| `first_name` | YES | reject |
| `last_name` | YES | accept (some plugins don't capture) |
| `phone` | optional | accept null |
| `consent_captured_at` | optional | if missing → `status='needs_consent_capture'`, outbound automated comms BLOCKED until first inbound or explicit capture |
| `source_provenance` (e.g., `"zapier:facebook-form-2024-10"`) | YES | reject |
| `target_agent_id` | YES (when broker importing) | broker can assign on import; agent self-import sets to self |
| `notes` (free-text) | optional | scan through `scanTextForFairHousing()` before save |
| `tcpa_consent_proof` (link to consent record or signed image) | optional | required if plugin claims "consent captured by us" |

### J.3 Merge / dedupe

- Email-first match against existing `Lead` rows
- Phone-second match (normalized to E.164)
- If match found:
  - Merge `roles` (union, no demote — matches A3 atomic-upsert pattern in `lib/leads/lead-upsert.ts`)
  - Preserve existing `consent_captured_at` if older lead had it
  - Append imported notes (don't replace)
  - Audit event: `action="lead_imported_merged"`, includes source provenance + matched_lead_id
- If no match:
  - Create new Lead row with `source = "plugin/<name>"`
  - Audit event: `action="lead_imported_created"`

### J.4 Hard blocks (must not be bypassable)

| Block | Enforcement |
|---|---|
| No consent → no automated outbound | `lib/email/sendgrid.ts` + `lib/sms/*` check `Lead.consent_captured_at IS NOT NULL` before send |
| Source attribution | every imported Lead has `source` populated; cannot be empty |
| Agent ownership | every imported Lead has `agent_id` set; cannot be null at import time |
| Fair Housing on notes | `scanTextForFairHousing()` on every imported notes string; reject lead with `400` and `error.violations` if any pattern matches |
| Dedupe | email-first then phone-second; if conflict, merge, never silently overwrite |

### J.5 Plugin allowlist

- Maintain `lib/leads/plugin-allowlist.ts` of known plugins (Zapier, Realvolve, Follow Up Boss, LionDesk, Wise Agent, etc.)
- Each entry: name, expected consent-capture pattern (does the plugin source guarantee TCPA-compliant consent? if not, default `needs_consent_capture`)

---

## K. Compliance / risk map

(Synthesizing the constraint map from the read-only Compliance research. Full per-regime detail in the research output; here, the top 25 highest-priority items applied to CRM + agent search.)

| # | Constraint | Applies to | Enforcement today | Gap | Severity |
|---|---|---|---|---|---|
| 1 | RLS read/write paths cannot intermingle T2/T3 non-RLS | Public IDX, ListingSearchProjection, /api/listings, sitemap | `tests/runtime/syndication-no-idx-imports.test.ts` (one direction) | **Reverse pin missing** — `lib/external/**` + `lib/sponsor/**` cannot import `lib/search/**` or write to `ListingSearchProjection` | **CRITICAL** |
| 2 | 6 distribution gates on every RLS listing | T1 only | `lib/idx/trestle-mapper.ts:807-870` + `lib/compliance/idx-display-gate.ts` + `computeGateColumns()` | None on T1; T2/T3 must NOT reuse `affirmPermission` semantics (they're not REBNY-pre-filtered) | CRITICAL |
| 3 | Fail-OPEN vs fail-CLOSED null asymmetry | `Internet*DisplayYN` (provider-gated, fail-OPEN) vs `Internet*AutomatedValuation/ConsumerComment` (per-row, fail-CLOSED) | `lib/compliance/gates.ts:71` + `lib/idx/trestle-mapper.ts:780-832` | None on T1; T2/T3: explicit display-yn fields stored at write, no null inference | CRITICAL |
| 4 | §2.05 24-hr terminal removal | T1 only | `lib/idx/trestle-mapper.ts:610-720` + `app/api/cron/data-retention/route.ts:79` | T2/T3 need own off-market lifecycle (no §2.05 cron, but stale-data SLA recommended) | HIGH |
| 5 | Fair Housing hard blocks (16 hardcoded + ~80 JSON patterns) | Listing fields | `lib/compliance/rls-enforcement.ts:90-143` + `:157` `scanTextForFairHousing` | **NOT applied to:** `Lead.notes`, `SavedSearch.name`, agent-share caption/cover-note, T2/T3 free-text fields | HIGH |
| 6 | Search filter cannot use protected class | Public/CRM/agent search | implicit via filter UI restrictions | New agent search across T1/T2/T3 must inherit same filter-restriction list | HIGH |
| 7 | FARE Act disclosure on rentals | All rental tiers (T1, T2, T3) | `app/listing/[id]/page.tsx:1546-1555` | T2/T3 rental share endpoints/portal pages need same disclosure | HIGH |
| 8 | TCPA consent before automated outreach | All lead-capture + share-blasts + lead-plugin imports | 8 endpoints + `Lead.consent_captured_at:200` + `app/api/crm/email/route.ts:66-68` blocks send | Lead-plugin import provenance not yet defined; share-to-non-consenting-recipient must block | HIGH |
| 9 | CAN-SPAM footer + unsubscribe | All marketing email | (assumed in templates) | `Lead.unsubscribed_at` column missing; need for share-blast + plugin imports | MEDIUM |
| 10 | NY DOS §175.25 brokerage attribution | All public ads + agent-share copy | `app/components/Footer.tsx:25-29,104,215`, JSON-LD identifier | T2/T3 share emails must template brokerage attribution; verify | HIGH |
| 11 | NY DOS §175.28 anti-discrimination notice | First substantive contact — **including T2/T3 owner-PII reveal-gate attestation modal** (the reveal action initiates substantive contact with a non-Mallan owner) | `app/components/AntiDiscriminationNotice.tsx` | **Notice copy must be embedded directly in the T2/T3 attestation modal** (see §D.4 + §H.6 reveal-gate flow); plain "verify on every NEW lead-capture form" is insufficient when the new surface is a reveal-modal that triggers substantive contact | **HIGH** |
| 12 | "Off-market" language ban | All description + share copy | `lib/compliance/rls-enforcement.ts:199-205` | Currently only blocks listing payload; not the share-caption surface | HIGH |
| 13 | Compensation/commission text ban | All public copy | `lib/compliance/rls-enforcement.ts:207-213` | Same; share copy not scanned | HIGH |
| 14 | NAR Settlement removed fields | All response tiers | `lib/compliance/dto.ts:51-56` `REMOVED_FIELDS` | None | HIGH |
| 15 | Agent PII mask for buyer/tenant portals | Portal endpoints | `lib/compliance/dto.ts:37-48` + `:261-288` `sanitizeForPortal` (Hotfix 3) | Uniform after Hotfix 3; verify any new T2/T3 portal endpoint uses `sanitizeListingForPortal` equivalent | HIGH |
| 16 | Seller/landlord scope by `owner_client_id` | Seller/landlord portal | `Listing.owner_client_id:443` | No middleware uniformly enforces `where: { owner_client_id: viewer.userId }` | HIGH |
| 17 | Per-agent privacy on leads/searches/sends/deals | All CRM endpoints | `Lead.agent_id`, `Deal.agent_id`, `Showing.agent_id`, `SavedSearch.agent_id`; `lib/crm/access.ts assertLeadIdsAccess` | 0 hits for `where:{agent_id: user.userId}` pattern — uneven enforcement; need systematic middleware | **CRITICAL** |
| 18 | UCBA Art. III §6 ethics gate (90-day) | Agent CRM access | enforced at login only | Add `Agent.ethics_completed_at` + middleware per-request gate | MEDIUM |
| 19 | Owner Opt-Out write-time validation | Sale/rental forms | `lib/compliance/rls-enforcement.ts:235` `assertRlsCompliantPayload` + `lib/compliance/gates.ts:134` `isOwnerOptOut` | None on T1; T2/T3 owners must have written consent before listing add (Fair Housing analog) | HIGH |
| 20 | Owner PII reveal-gate audit | T2/T3 owner-contact reveal | `lib/auth/middleware.ts:182` `logAuditEvent` (pattern only) | Reveal endpoint + attestation flag not yet built (HELD) | **CRITICAL when built** |
| 21 | DOM 30-day reset (UCBA Art. I §11) | T1 only | `lib/compliance/dom-tracker.ts:43` `shouldResetDom` | T2/T3 do not accrue REBNY DOM — **MUST NOT display REBNY-DOM counters on portal renders or client share renders.** Any DOM-style filter or sort in agent search must be either T1-only (filters out T2/T3 when active) OR labeled clearly as a non-REBNY/non-public time-on-market metric (e.g., "Days since added to CRM" for T2/T3) | MEDIUM |
| 22 | Coming Soon badge + `ActivationDate` immutable | T1 sales only | `lib/idx/trestle-mapper.ts` | T2/T3 cannot use "Coming Soon" terminology — UCBA reserved | MEDIUM |
| 23 | Commission-negotiability disclosure (Art. I §17) | Buyer/tenant rep agreements + pre-closing | Verify in `app/contact/page.tsx`, `app/components/InquiryForm.tsx` | Required on every NEW lead-capture/reveal/attestation form | HIGH |
| 24 | AuditEvent 2-yr retention + cron | All mutations | `prisma/schema.prisma:695` + `app/api/cron/data-retention/route.ts` | Transaction rows need extended retention (CommissionPayment, Deal, ProtectedPeriod, ListingMedia) — confirm T2/T3 share/reveal events route correctly | MEDIUM |
| 25 | NY SHIELD breach notification 30-day + encryption | All PII handling | Neon TDE + httpOnly cookie + AuditEvent | T2/T3 owner-contact PII fields need explicit data classification + breach-notification surface | MEDIUM |

---

## L. Data model changes needed

(All schema work requires Maya approval per `NEON.md` + CLAUDE.md §A.1 + §C.)

### L.1 Within current scope (CRM hardening, no T2/T3)

| Change | Why |
|---|---|
| `Lead.unsubscribed_at: DateTime?` | CAN-SPAM unsubscribe state for share-blast + plugin imports |
| `Lead.converted_at: DateTime?` | Workflow audit rank 5 — when did lead become client |
| `Agent.ethics_completed_at: DateTime?` + `Agent.ethics_expires_at: DateTime?` | UCBA Art. III §6 per-request gate |
| `Inquiry.duplicate_of_lead_id: BigInt?` already exists but UNUSED — start populating | gap 3.7 |
| (optional) `CommissionConfirmation` model (id, listing_id, listing_source, confirmed_at, agent_id, basis, value, notes, audit_trail) | NAR-post-settlement workflow — applies to ALL tiers |

### L.2 Within T2 (external inventory) — HELD

Per parked spec:
- `external_inventory_listings` (full schema in spec)
- `external_inventory_client_shares`
- `external_inventory_pii_reveal_log`
- `Lead.external_inventory_visible: Boolean @default(false)` (or per-share table; spec defers)

### L.3 Within T3 (sponsor) — HELD

Per parked spec:
- `sponsor_buildings`
- `sponsor_entities`
- `management_companies`
- `selling_brokerages`
- `sponsor_units`
- `sponsor_listings`
- `sponsor_listing_client_shares`
- `sponsor_pii_reveal_log`
- `Listing.linked_sponsor_listing_id: BigInt?` (FK for promoted_to_rls path)

### L.4 PR 5B (reader-swap) — HELD

No schema change; only the reader swaps from `Listing.idx_display_yn` to `ListingSearchProjection.idx_display_yn`. PR 5A (full backfill + dual-write + soak) is a precondition. Phase A closed W1/W2/W3 (PR #165, MERGED 2026-05-20). W4 (`scripts/import-closed-from-trestle.ts`) is the last writer-side gap to close before soak.

---

## M. API route map needed

### M.1 Safe-now CRM hardening (no schema)

| Route | Purpose | Class |
|---|---|---|
| `POST /api/crm/clients/bulk` | Outlook N+1 fix (gap 1.2) | A |
| `POST /api/crm/leads/[id]/assign` | Broker action (workflow audit rank 4) | A |
| `POST /api/crm/referrals/[id]/approve` | Broker action (workflow audit rank 8) | B |
| `PATCH /api/crm/leads/[id]/status` (currently broker-only — open to agents for own leads) | workflow audit rank 6 | A |
| Rate limit added to 11 portal POST routes | gap 2.1 | A |
| Page-size cap on `/api/crm/leads`, `/api/crm/clients`, `/api/crm/listings` (200 max) | gap 1.4 | A |
| Honeypot 400 on `/api/sign-up` | gap 3.1 | A |
| Ethics gate per-request in `requireAgentOrBroker()` middleware | gap 9.1 | A |
| Server-side invite TTL on auth invite redeem | gap 9.3 | A |
| Per-agent ownership middleware `requireOwnedBy(req, "Lead", id)` | gap 9.2 | A |

### M.2 Agent search shell (no schema, before T2/T3)

| Route | Purpose |
|---|---|
| `GET /api/crm/search` | Real agent search backend with per-agent saved searches, multi-filter, sort, pagination. Reads from `Listing` (or `ListingSearchProjection` AFTER PR 5B) |
| `POST /api/crm/saved-searches` | Save current search query as named search |
| `GET /api/crm/saved-searches` | List own saved searches |
| `PATCH /api/crm/saved-searches/[id]` | Rename / update |
| `POST /api/crm/saved-searches/[id]/share` | Share with another agent (broker-only, or peer-to-peer with audit) |
| `POST /api/crm/saved-searches/[id]/send-to-client` | Convert into a send (via `ListingSend` primitive, master plan PR 8) |

### M.3 Tiered inventory (HELD)

T2:
- `POST /api/crm/external-inventory` (agent submits external listing)
- `GET /api/crm/external-inventory` (own only; broker = all)
- `GET /api/crm/external-inventory/[id]` (detail + owner-PII-hidden default)
- `POST /api/crm/external-inventory/[id]/reveal-owner` (attestation modal endpoint; writes AuditEvent + reveal_log)
- `POST /api/crm/external-inventory/[id]/share` (creates `external_inventory_client_shares` row)
- `DELETE /api/crm/external-inventory/[id]/share/[shareId]` (revoke)

T3 (mirror of T2 structure):
- `POST /api/crm/sponsor` (sync from ETL, not agent-add)
- `GET /api/crm/sponsor` (own visible only)
- `GET /api/crm/sponsor/[id]/reveal-contact`
- `POST /api/crm/sponsor/[id]/share`
- `POST /api/crm/sponsor/[id]/confirm-commission`

### M.4 Lead plugin

- `POST /api/crm/leads/import` (single import + bulk in same shape)

---

## N. UI / UX screens needed

### N.1 Agent search shell

A new top-level CRM page (e.g., `/broker/search` or `/agent/search` inside `public/crm/dashboard.html`):
- Main filter bar: type, neighborhood (multi-select), price range, beds, baths, sqft range, property sub-type, status (multi-select wider than public — includes Pending, Withdrawn, Expired, etc.), open-house, amenities (multi-select)
- Tier toggles (top-right, prominently): `T1 RLS` (always on, locked) · `T2 External` (default off) · `T3 Sponsor` (default off)
- Map + list view toggle
- Sort: relevance (default), newest, price-low-high, price-high-low, price-per-sqft, days-on-market
- Per-card actions: "View detail," "Add to collection," "Send to client," "Mark as favorite" (per-agent), "Reveal owner" (T2/T3 only, attestation modal)
- Saved-search sidebar: name list + "New search" + run + edit + share + send

### N.2 T2 external-inventory shell (HELD)

- Add Off-Market modal (manual entry — address, price, type, beds, baths, source URL, owner name/email/phone, notes)
- Agent's own external-inventory list page (with revoke-share + delete actions)
- Owner-PII reveal modal (attestation)
- Disclaimer rendered in: card, detail modal, share email template

### N.3 T3 sponsor shell (HELD)

- Sponsor inventory browser (filter by building, sponsor entity, abatement program, sale status)
- Sponsor unit detail (sponsor entity, management co., selling brokerage, commission status)
- Confirm-commission modal (call date, who spoke to, basis, value, notes)
- Sponsor badge on every card/detail

### N.4 Share-to-client UI

- Pick lead from own portfolio (typeahead)
- Optional caption (Fair Housing-scanned on send)
- Optional cover note
- "Send" → email/SMS/portal-inbox depending on lead's preferences
- Send appears in agent's "Sent" history with status (delivered, opened, clicked, replied)
- Client can mark "interested," "not interested," "want to see"
- Audit chain: every send writes AuditEvent

### N.5 Owner-PII reveal UI

- Modal: "I have a legitimate business purpose. I will use TCPA-compliant outreach. I will not share this contact info." Checkbox + "Confirm reveal" button
- On confirm: backend writes AuditEvent + reveal_log; modal shows owner info; auto-hides after 60s if not interacted

---

## O. Agent-search ranking / filtering requirements

### O.1 Filtering

| Filter | Backing | Notes |
|---|---|---|
| Type (sale/rent/buy) | `Listing.listing_type` | T1+T2+T3 all support |
| Status (multi-select wide) | `Listing.status` | Agent-side includes `Pending`, `Withdrawn`, `Expired`, `Cancelled`, `Closed`, `Active`, `ActiveUnderContract`, `ComingSoon` (vs public limited to `Active` + `ComingSoon` + `ActiveUnderContract`) |
| Price range, beds, baths, sqft range | column + index | direct |
| Neighborhood (multi-select) | `Listing.neighborhood` index | multi-select via `IN` |
| Property sub-type (multi-select) | `Listing.property_sub_type` | direct |
| Amenities (multi-select) | features JSON OR `ListingSearchProjection.amenity_keys` JSON (post-PR 5B reader swap) | Post-filter today; pre-filter once on projection |
| Pets allowed | features JSON | direct |
| Open house | Trestle OpenHouse resource intersection | as today |
| New development | sub-type + YearBuilt heuristic | as today |
| Featured / Exclusive | display-side flags | as today |
| Tier toggle | NEW — `include_external_inventory`, `include_sponsor_inventory` | default OFF |
| Owner-info available | NEW — `has_owner_contact` boolean — show only listings with reachable owner | T2/T3 specific |
| Days on market range | `Listing.days_on_market` index | **T1 only.** When T2/T3 toggles are ON, this filter is hidden OR replaced with a non-REBNY-DOM label (e.g., "Days since added to CRM") — T2/T3 listings do not accrue REBNY DOM (per §K #21 + UCBA Art. I §11) |
| Listing agent (search by name) | `Listing.list_agent_full_name` index | direct (Agent.trestle_mls_id where present) |
| Listing brokerage (search by name) | `Listing.list_office_name` index | direct |
| Saved-search recall | `SavedSearch` model | direct |

### O.2 Ranking model

Suggested relevance score combining:
- Recency boost: `modification_timestamp` weighted (newest > 14 d < 30 d ≪ 90 d)
- Price match: |list_price − target| / target, weighted high when target supplied
- Neighborhood match: 1.0 if exact, 0.5 if borough-only, 0.0 otherwise
- Beds/baths match: hard penalty for under-target, soft for over-target
- Tier preference: T1 ≥ T2 ≥ T3 (unless the agent toggled T2/T3 ON, in which case all equally weighted)
- Agent-specific signals (private): recent showings, recent saves, recent sends — agent's own activity reranked higher

### O.3 Performance constraints

- **No PostGIS today.** Bounds filter remains post-filter via Census API geocoding.
- For agent search at scale, consider:
  - PostGIS adoption (deferred — requires schema migration + extension install on Neon)
  - Pre-computed `ListingSearchProjection.lat_lng` columns + bounding-box pre-filter (PR 5B precondition)
- Pagination: cursor-based for stability across re-sorts.

---

## P. Client-share / send requirements

### P.1 Send primitive

- `ListingSend` model (master plan PR 8 — NOT STARTED). Single canonical send record across all tiers.
- Columns: `id`, `agent_id`, `lead_id`, `listing_id` (nullable), `external_inventory_listing_id` (nullable), `sponsor_listing_id` (nullable), `tier`, `caption`, `cover_note`, `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `replied_at`, `revoked_at`.
- Exactly ONE of `listing_id` / `external_inventory_listing_id` / `sponsor_listing_id` is non-null. CHECK constraint.

### P.2 Client portal render

- All tiers visible in portal `Sent to me` tab
- T1 listings: standard render via `sanitizeListingForPortal`
- T2 listings: render via `externalInventoryPortalDTO` (strips owner PII), disclaimer prominent
- T3 listings: render via sponsor portal DTO (strips owner PII, shows sponsor badge), disclaimer + non-RLS-unless-linked status

### P.3 Pre-send compliance scans

| Scan | Trigger | Block on hit |
|---|---|---|
| Fair Housing on caption + cover note | every send | YES — show violation list to agent |
| Off-market language | every send | YES |
| Compensation/commission text | every send | YES |
| FARE Act applicability (rental + NYC tenant) | rental tier on send to NYC tenant | non-blocking but injects disclosure into email body |
| TCPA consent on recipient | every send | YES if `consent_captured_at IS NULL` AND send method is automated (email/SMS) |
| Agent ownership of recipient | every send | YES — must be agent's lead or broker-bypass |
| **Brokerage attribution present in template** (NY DOS §175.25) | every send | **YES — block on missing.** Template must contain "Mallan Real Estate Inc." + license #10991205323 + office address (400 East 90th Street, Suite 17C, NY 10128) OR phone (646-258-4460). Agent-name-only sends without brokerage attribution are non-compliant per §175.25 |

### P.4 Send method routing

- Default: portal inbox (no email, no SMS)
- If `lead.email_verified_at IS NOT NULL` and `lead.notification_preferences.email = true`: include email
- If `lead.phone_verified_at IS NOT NULL` and `lead.notification_preferences.sms = true`: include SMS (TCPA-strict)
- All channels: CAN-SPAM footer + brokerage attribution + unsubscribe link

---

## Q. Testing + validation requirements

### Q.1 Architectural test pins (CI-enforced)

| Test | Pattern |
|---|---|
| Reverse boundary pin (CRITICAL) | `lib/external-listings/**` + `lib/sponsor/**` cannot import `lib/search/listing-search-projection.ts` or `lib/idx/**` or `app/api/listings/**` |
| Forward boundary (existing) | `lib/syndication/**` cannot import `lib/idx/**` or `lib/search/**` |
| **SQL injection — no `$queryRawUnsafe` in T2/T3 future code** | source-grep `lib/external-listings/**` + `lib/sponsor/**` (when added) for `\$queryRawUnsafe` → must be ZERO. All `$queryRaw` uses MUST be tagged-template form with `Prisma.sql` + `Prisma.join` for array literals (the canonical pattern from PR #171's `lib/leads/lead-upsert.ts`). Implementer caveat for any future T2/T3 ranking/search query |
| No external/sponsor in sitemap | source-grep `app/sitemap.ts` for `external_inventory` or `sponsor_` — must be ZERO |
| No external/sponsor in robots.txt route allowlist | source-grep `app/robots.ts` — ZERO |
| No external/sponsor in `/api/listings` | source-grep `app/api/listings/route.ts` — ZERO |
| No external/sponsor in JSON-LD structured-data emitters | source-grep `app/components/StructuredData*.tsx` — ZERO |
| Default-off toggles | test agent search returns 0 external/sponsor rows when neither toggle set |
| Non-RLS disclaimer on every T2/T3 render | test: any T2/T3 row in a response body has accompanying `_disclaimer` field |
| Owner-PII null by default | test: agent search responses for T2/T3 always have `owner_email`/`owner_phone`/`owner_name` = null UNLESS reveal_log row exists for that user+listing |
| Reveal audit chain | test: hit `/reveal-owner` endpoint creates AuditEvent AND reveal_log row in same DB tx |
| Fair Housing pre-share scan | test: shares with caption containing protected-class trigger return 400 |
| TCPA non-consenting recipient block | test: send to lead with `consent_captured_at = null` to email/SMS returns 400 |

### Q.2 Per-agent privacy tests

| Test | Setup |
|---|---|
| Agent A cannot read Agent B's leads | seed 2 agents + leads → Agent A GET `/api/crm/leads` returns only own → Agent A PATCH lead owned by B returns 403 |
| Agent A cannot read Agent B's saved searches, sends, shares | same pattern for each table |
| Agent A's external-inventory submissions invisible to Agent B | same |
| Broker can see all | broker GET returns all |

### Q.3 Compliance suite (existing — must keep passing)

- `npm run rls:validate` → 10 sections, 0 critical
- `npm run compliance-check` → 93+ rules, 0 BLOCKER/STRICT
- `npm run ucba:audit` → 46/46 PASS, 0 REGRESSIONS
- `npm run idx:validate` → 32 sections, 0 critical
- `npm run crm:test` → 172/172 PASS

### Q.4 New compliance suite for tiered inventory (HELD)

- T2 disclaimer rendered on every T2 render path
- T3 disclaimer rendered on every T3 render path
- T2/T3 owner PII never visible on portal pages (test against shared listing)
- T2/T3 never in sitemap
- T2/T3 never in `/api/listings`
- T2/T3 never in JSON-LD structured-data emitters
- T2/T3 never in robots.txt allowlist

---

## R. Exact PR sequence with dependencies

(Each item is REPORT-ONLY recommendation; opening any of these PRs requires Maya approval per CLAUDE.md §A.1 + §C.)

### Lane 1 — CRM hardening (no schema, no T2/T3 dependency)

| # | PR | Scope | Dependency |
|---|---|---|---|
| 1 | **PR-CRM-1** | Merge PR #146 (deal-form submit wiring — Class-A fix 1.1) | None |
| 2 | **PR-CRM-2** | Page-size cap on `/api/crm/leads`, `/api/crm/clients`, `/api/crm/listings` (200 max + audit log) — Class-A fix 1.4 | None |
| 3 | **PR-CRM-3** | Portal write rate-limits on 11 routes — Class-A fix 2.1 | None |
| 4 | **PR-CRM-4** | Honeypot 400 + log on `/api/sign-up` — Class-A fix 3.1 | None |
| 5 | **PR-CRM-5** | Per-request ethics gate in `requireAgentOrBroker()` — Class-A fix 9.1 (UCBA Art. III §6 active hole) | None |
| 6 | **PR-CRM-6** | Server-side invite TTL validation — Class-A fix 9.3 | None |
| 7 | **PR-CRM-7** | Per-agent ownership middleware `requireOwnedBy()` applied systematically — Class-A fix 9.2 | None |
| 8 | **PR-CRM-8** | Impersonation backend wired (client `app.js:doImpersonate()` actually calls `POST /api/crm/agents/[id]/impersonate`) — workflow audit rank 2 | None |
| 9 | **PR-CRM-9** | Outlook bulk import endpoint `POST /api/crm/clients/bulk` — Class-A fix 1.2 | None |
| 10 | **PR-CRM-10** | Verify-only sweep: Class-A items 1.3, 3.2, 3.3, 3.4, 4.1, 4.2, 6.1, 7.3 | None |

### Lane 2 — Agent-search shell (no schema, no PR 5B dependency)

| # | PR | Scope | Dependency |
|---|---|---|---|
| 11 | **PR-AS-1** | `GET /api/crm/search` backend (with per-agent saved searches, filter set, ranking model, pagination — reads `Listing` table today) | Lane 1 #7 (per-agent ownership) |
| 12 | **PR-AS-2** | Agent-search UI shell in `/broker/dashboard` or new `/agent/search` page; map + list view; tier toggles (T1 only initially); saved-search sidebar | PR-AS-1 |
| 13 | **PR-AS-3** | `POST /api/crm/saved-searches` + `GET /api/crm/saved-searches` + `PATCH /api/crm/saved-searches/[id]` + per-agent privacy enforced | PR-AS-1 |
| 14 | **PR-AS-4** | Send primitive `ListingSend` model + `POST /api/crm/sends` (master plan PR 8) — supports T1 only initially | Lane 1 #1–7 |

### Lane 3 — Tiered inventory architecture (HELD; requires Maya approval)

| # | PR | Scope | Dependency |
|---|---|---|---|
| 15 | **PR-T2-1** | External-inventory schema (`external_inventory_listings`, `external_inventory_client_shares`, `external_inventory_pii_reveal_log`) + Prisma migration | Maya approval per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` |
| 16 | **PR-T2-2** | External-inventory CRM API + UI (Add Off-Market modal, list, detail, reveal-gate, share) | PR-T2-1 |
| 17 | **PR-T2-3** | Agent-search T2 toggle + `include_external_inventory` param + non-RLS disclaimer stamping | PR-AS-2 + PR-T2-2 |
| 18 | **PR-T2-4** | Reverse boundary pin CI test (`lib/external-listings/**` can't import `lib/search/**`) | PR-T2-1 |
| 19 | **PR-T2-5** | T2 client-share flow + portal render with disclaimer + PII null + Fair Housing pre-send scan | PR-T2-2 + PR-AS-4 |
| 20 | **PR-T3-1** | Sponsor schema (9 tables) + Prisma migration | Maya approval + PR-T2-1 architectural precedent |
| 21 | **PR-T3-2** | Sponsor ETL pipeline (NY AG REFB + ACRIS + NYC Open Data) + dry-run mode + manual enrichment UI | PR-T3-1 |
| 22 | **PR-T3-3** | Sponsor CRM API + UI (browse, filter, detail, sponsor badge, confirm-commission) | PR-T3-1 |
| 23 | **PR-T3-4** | Agent-search T3 toggle + sponsor badge + commission_confirmed_at gate on share | PR-T3-3 + PR-AS-2 |
| 24 | **PR-T3-5** | T3 client-share flow + portal render | PR-T3-3 + PR-AS-4 |
| 25 | **PR-CC-1** | `CommissionConfirmation` model (generalized across tiers) + API + per-listing UI | PR-T3-3 (re-uses pattern) |

### Lane 4 — Lead plugin integration

| # | PR | Scope | Dependency |
|---|---|---|---|
| 26 | **PR-LP-1** | `POST /api/crm/leads/import` (single + bulk) + dedupe + Fair Housing scan + TCPA consent provenance + audit chain | Lane 1 #1–7 |
| 27 | **PR-LP-2** | Plugin allowlist + per-plugin consent-pattern config | PR-LP-1 |

### Lane 5 — PR 5B (reader swap) — LATER, NOT NOW

| # | PR | Scope | Dependency |
|---|---|---|---|
| 28 | **PR-5B-W4** | W4 close: `scripts/import-closed-from-trestle.ts` migrated onto Phase A wiring | Phase A merged (DONE — PR #165) |
| 29 | **PR-5B-soak** | Reader swap soak watch (mirror PR #148 reconciliation soak pattern) | PR-5B-W4 |
| 30 | **PR-5B** | Reader swap from `Listing.idx_display_yn` to `ListingSearchProjection.idx_display_yn` in `app/api/listings/route.ts` | PR-5B-soak passes 18+ checkpoints |

### Lane 6 — Observability (independent)

| # | PR | Scope | Dependency |
|---|---|---|---|
| 31 | **PR-O-1** | Cron-heartbeat AuditEvent on every firing (closes O2) | None |
| 32 | **PR-O-2** | `ops:health` expected-vs-actual cron count (closes O1, O3) | PR-O-1 |
| 33 | **PR-O-3** | Deploy/cron race detector (closes O4) | PR-O-1 |
| 34 | **PR-O-4** | Relax `hours_since_last_run < 0.2h` ceiling for `*/10` crons (closes O5) | PR-O-2 |

### Recommended interleave order (top-down sequencing)

1. PR-CRM-1, PR-CRM-2, PR-CRM-4, PR-CRM-6, PR-CRM-9 (smallest, lowest risk)
2. PR-CRM-3, PR-CRM-7 (rate limits + per-agent ownership — security)
3. PR-CRM-5 (active UCBA hole)
4. PR-CRM-8 (impersonation backend)
5. PR-CRM-10 (verify-only sweep)
6. PR-AS-1, PR-AS-2, PR-AS-3 (agent-search shell — biggest "what is missing")
7. PR-AS-4 (send primitive)
8. PR-LP-1, PR-LP-2 (lead plugin) — can run in parallel with #6/#7
9. PR-O-1 → PR-O-4 (observability — can run anywhere in sequence, low risk)
10. PR-5B-W4 → PR-5B-soak → PR-5B (final reader swap)
11. **WAIT for Maya approval** on T2/T3:
    - PR-T2-1 → PR-T2-2 → PR-T2-3 → PR-T2-4 → PR-T2-5
    - PR-T3-1 → PR-T3-2 → PR-T3-3 → PR-T3-4 → PR-T3-5
    - PR-CC-1 (commission confirmation generalization)

---

## S. What can be done before PR 5B

Everything in Lane 1 (CRM hardening), Lane 2 (agent-search shell over `Listing` table), Lane 4 (lead plugin), Lane 6 (observability). All read from `Listing` directly today and won't change behavior on the PR 5B reader swap.

The agent search shell built in Lane 2 will need a single-line reader swap when PR 5B ships (`Listing` → `ListingSearchProjection`), but the API contract + UI + per-agent privacy + saved searches all sit on top of the source switch — no rework.

## T. What must wait until PR 5B or later

- T2/T3 tiered inventory schema + migration (HELD; requires Maya approval AND should NOT compete with PR 5B for Neon writes; sensible to land T2/T3 schema AFTER PR 5B soak passes)
- Geo / PostGIS adoption (deferred — needs schema + Neon extension)
- Sponsor ETL cron + dry-run (HELD)
- `CommissionConfirmation` model (HELD — depends on Maya's NAR-post-settlement decision per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` §14b)
- Public `/exclusives` page (per Mallan Exclusives syndication plan §7) — held behind Mallan exclusive launch metrics

---

## Boundary block (explicit, per Maya 2026-05-21)

### A. Public IDX / public search

- ✅ Trestle/RLS/IDX Plus ONLY
- ✅ REBNY attribution required
- ❌ NO StreetEasy scrape
- ❌ NO Schedule A shadow inventory
- ❌ NO external inventory
- ❌ NO sponsor shadow rows UNLESS linked to actual RLS listing AND compliant

### B. Agent CRM search

- ✅ May eventually include T1 (Trestle) + T2 (external) + T3 (sponsor/Schedule A)
- ✅ T2/T3 toggles default OFF
- ✅ Clear non-RLS disclaimer required on every T2/T3 render
- ✅ Agent-only by default (no public route ever)
- ✅ Client-visible ONLY by explicit share/send via `external_inventory_client_shares` / `sponsor_listing_client_shares` / `ListingSend`
- ✅ AuditEvent on every reveal, every share, every send

### C. Client portal

- ✅ ONLY agent-shared inventory visible
- ❌ NO owner/contact PII (T2/T3)
- ✅ Disclaimers visible on every T2/T3 render
- ✅ Fair Housing scan BEFORE share/send
- ✅ FARE Act disclosure on T2/T3 rental shares to NYC tenants

### D. CRM (mapped)

- Current routes: 150 across 11 functional clusters (§A.2, verified 2026-05-21)
- Current stubs: BUYER + TENANT deal-form submit, impersonation client-only (§F.1)
- Current gaps: page-size cap, portal rate-limits, ethics-gate mid-session, per-agent row isolation, Outlook N+1, honeypot, invite TTL, broker approval queue verify-only (§F.1–F.5)
- Lead plugin integration path: §J (single endpoint, hard blocks listed)
- Ownership boundaries: per-agent privacy strict; broker bypass; portal-role mask; seller/landlord scoped by `owner_client_id`

### E. PR sequence

- ✅ Safe-now CRM hardening (Lane 1) — 10 PRs, no schema
- ✅ Report/doc cleanup (this audit + post-recon Phase D observability) — Lane 6
- ✅ Agent search shell (Lane 2) — 4 PRs, no schema
- ✅ Lead plugin (Lane 4) — 2 PRs, no schema
- ⚠️ External / sponsor architecture (Lane 3) — 11 PRs, schema, **HELD per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`** → requires Maya approval
- ⚠️ Schema / migration PRs only after Maya approval
- ⚠️ PR 5B reader swap (Lane 5) — LATER, NOT NOW, depends on W4 close + soak

---

## Hard holds reaffirmed

- ❌ NO code patches in this audit
- ❌ NO schema changes
- ❌ NO migrations
- ❌ NO env / Neon / cron config changes
- ❌ NO workflow / agent / skill / Sentinel changes
- ❌ NO external-inventory implementation start
- ❌ NO sponsor / Schedule-A inventory implementation start
- ❌ NO PR 5B activity
- ❌ NO `/api/listings` reader change
- ❌ NO `ListingSearchProjection` migration
- ❌ NO admin bypass

This is an architecture audit. Every recommendation in §R requires Maya approval before any PR opens. The 4-read-only-agent verification model (Repo QA, Compliance, Security/Data, Vercel/readiness) will be dispatched against this report draft per the established merge-gate contract.

**DO NOT MERGE — awaiting Maya approval.**
