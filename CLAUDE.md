# CLAUDE.md - Project Instructions for Claude Code

## Project: mallan-nyc

> **Compliance-First · Fast · Scalable**
>
> **Last Comprehensive Audit:** 2026-04-06 — [Full findings in memory/FULL-SITE-AUDIT-2026-04-06.md]
> Build PASS, TypeScript 0 errors, IDX Validator 822/0 critical. 5 critical bugs fixed, 25+ medium findings documented.
> **IMPORTANT: Trestle does NOT provide Latitude/Longitude.** All geocoding is mallan.nyc's responsibility via `lib/geo/geocode.ts` (address geocoding) + ZIP centroid fallback. No hardcoded coordinate fallbacks.
>
> **REBNY Compliance Skill:** `.claude/skills/rebny-compliance/SKILL.md` — READ AT SESSION START. Contains all REBNY UCBA 2026, IDX Plus/Trestle connector (auth, fetch, mapper, all 902 fields), Fair Housing (20+ protected classes), FARE Act, NY DOS advertising law, real estate law, TCPA, CAN-SPAM, NY SHIELD Act, penalties, and audit checklists.

| | |
|---|---|
| **Status** | Active Development |
| **Stage** | **Live Production** (Next.js 16.1.6 on Vercel, real Trestle/IDX data) |
| **Type** | **Full-Stack Platform** — public frontend (mallan.nyc) + backend CRM + API |
| **Jurisdiction** | New York State / NYC |
| **License Holder** | Mallan Real Estate Inc. |
| **Brokerage License** | #10991205323 (Mallan Real Estate Inc. - company) |
| **Agent License** | #10311201806 (Maya Allan - individual REBNY license) |
| **Phone** | 646-258-4460 |
| **Address** | 400 East 90th Street, Suite 17C, New York, NY 10128 |

### Portal Access Levels

The backend CRM supports 6 portal types, each with different access levels:

| Portal | User Type | Access Level |
|--------|-----------|-------------|
| **Broker Admin** | Maya Allan (principal broker) | FULL admin access — all sections, all agents, all clients, compliance, approvals |
| **Broker/Agent Admin** | Each licensed agent (Maya also has this) | OWN private dashboard, OWN search, OWN clients, listings, documents, marketing. NOT shared with other agents. |
| **Buyer Portal** | Buyer clients | Sees ONLY what agent provides. CANNOT see listing agent name. Can: Like, Dislike, Let's Discuss, Schedule, Open House, Offer, "view this" → pending. |
| **Seller Portal** | Seller clients | Invited by listing agent. Follows: showings, price, comparables, comments, marketing, offers. |
| **Tenant Portal** | Renter clients | Same as Buyer Portal but for rentals. CANNOT see listing agent name. |
| **Landlord Portal** | Landlord/property owner clients | Same as Seller Portal but for rentals. |

### File Roles (ENFORCED — do not deviate)

> **Full detail in `MASTER-PROJECT-TREE-v3.3.md` Section 0**

| File | Role |
|------|------|
| `dashboard.html` | **CRM HUB** — Broker Admin + Agent Admin (private per agent) + 4 Client Portals. v2: Two-CRM lifecycle workspaces (Sales + Rentals) with prospect/active phases, Convert API, listing backend. |
| `index-built.html` | **IDX SEARCH** — each agent's OWN PRIVATE search via IDX Plus (read-only, IDX-eligible inventory only). Not shared. Not full-market search — limited to IDX-released fields and IDX-eligible listings. Agents use RealPlus for full RLS inventory. |
| `SALE-FORM-REDESIGN.html` | **SUBMISSION** — listing agent creates/edits OWN exclusive sale listing (CRM internal — actual RLS submission is via RealPlus/LMP, not mallan.nyc). Audited 2026-03-19: 119 data-rls-field values verified against CSV, distribution gates clean (IDX+Syndication primary, InternetEntireListingDisplayYN locked for standard sales, no VOW), 34 Fair Housing patterns, 48 mandatory fields collected. |
| `SALE-FORM-WITH-TOOLS.html` | **VIEW ONLY** — agents + buyers view exclusive sale listings (buyers see masked listing agent info) |
| `RENTAL-FORM-REDESIGN.html` | **SUBMISSION** — listing agent creates/edits OWN exclusive rental (CRM internal — actual RLS submission is via RealPlus/LMP, not mallan.nyc). Audited 2026-03-18: checkbox groups + fees + open houses + commercial fields fixed. |
| `RENTAL-FORM-WITH-TOOLS.html` | **VIEW ONLY** — agents + renters view exclusive rental listings (renters see masked listing agent info) |
| `BUYER-DEAL-FORM.html` | **INTERNAL COMMISSION REQUEST** — buyer's agent → broker. Agent can check status + edit errors. Not client-facing. |
| `TENANT-DEAL-FORM.html` | **INTERNAL COMMISSION REQUEST** — renter's agent → broker. Agent can check status + edit errors. Not client-facing. |

**REDESIGN = SUBMISSION. WITH-TOOLS = VIEW ONLY. DEAL FORMS = INTERNAL COMMISSION REQUEST.**
**Search is PER AGENT (private). No global/brokerage-wide search exists.**

---

## Architecture

> **Live production site at mallan.nyc (Vercel, Next.js 16.1.6)**
>
> **Components:**
> - **Public frontend** — Next.js App Router pages (search, listings, neighborhoods, about, building profiles). **Search page (`app/search/page.tsx`):** NeighborhoodSelector (5-borough tabbed panel, multi-select), beds/baths toolbar dropdowns, server-side address search. Public search is IDX-only — limited to IDX-released fields and IDX-eligible listings (not full-market search). `PropertySearch.tsx` is dead code.
> - **Backend CRM** — `public/crm/dashboard.html` (modular shell) + `public/crm/js/dashboard/` (app.js, panels.js, router.js, store.js, ui-components.js, workspace.js, portals.js + `panels/` subdirectory with sales-crm, rentals-crm, seller-prospects, lease-tracker, pitch-packet modules). **v2 Two-CRM redesign (2026-03-19):** lifecycle-based workspaces with prospect/active phases, `detectTypeAndPhase()` routing, Convert API, `Listing.owner_client_id` FK. Seller/Buyer/Landlord/Tenant each have full prospect + active workspace renderers.
> - **API layer** — `app/api/` (235 route files: auth, CRM, portal, IDX, media, AI, compliance, cron, outlook)
> - **Database** — PostgreSQL on Neon (Prisma ORM, 60 models)
> - **Outlook integration** — Microsoft Graph OAuth for email scanning (StreetEasy lead import, folder browser)
> - **Media** — Trestle photos cached to Cloudflare R2 + server-side proxy fallback
> - **Cron** — 19 scheduled jobs via `vercel.json`: db-keepalive (*/3), data-retention (daily 3am), dom-reset (daily 6am), idx-sync (*/12), media-backfill (*/8), listing-expiration (daily 7am), search-alerts (daily 7:30am), tenant-nurture (daily 8:30am), prospect-triggers (daily 9am), seller-scoring (daily 8am), demand-signals (daily 10am), intent-profiles (daily 11am), agent-metrics (weekly Mon), lead-scoring (daily 1pm), conviction-scores (daily 2pm), listing-momentum (daily 3pm), social-proof (daily 4pm), experiment-metrics (weekly Sun), market-snapshots (monthly 1st).
>
> **Auth:** Cookie-only (`session_token`, httpOnly, SameSite=Lax, Secure). Per-role TTL: Broker 24h, Agent 8h, Client 30d. Bearer fully removed.
>
> **MFA:** Broker login requires email OTP (6-digit code via M365 SMTP). SMS ready when Twilio env vars added. `MFA_EMAIL` env var overrides recipient (currently Gmail to avoid M365 same-mailbox delivery issue). Files: `lib/auth/mfa.ts`, `app/api/auth/mfa/verify/route.ts`. No TOTP app needed.
>
> **Listing fetch strategy:** DB-first (Prisma, 20-80ms) → Trestle direct fallback (10s timeout) → API endpoint fallback. AbortController timeouts on all external calls (10s fetch, 8s auth). Graceful null returns on failure — pages never crash from Trestle outages.
>
> **Media pipeline:** Trestle photos/floor plans cached to R2 during ISR. `/api/media/proxy` as fallback (Bearer auth server-side, 7-day CDN cache). **CRITICAL (Trestle guidance 2026-04-07):** All Media queries MUST use `ResourceRecordKey` (always unique across MLOs), NOT `ResourceRecordID` (can duplicate). Property.`ListingKey` = Media.`ResourceRecordKey`. DB `mls_id` stores `ListingKey`. `Media/All` endpoint is deprecated — query Media resource directly with filters. See "Trestle Media API Rules" section below.
>
> **Lead capture:** 8 public endpoints (inquiries, contact, sign-up, CMA, guides, favorites, search-alerts, open-house RSVP). All record `consent_captured_at` for TCPA/CAN-SPAM compliance. Contact form has honeypot bot protection.
>
> **Commission system:** `CommissionPayment` model with fail-closed split validation.
>
> **Client data model (Lead):** Multi-person support — primary person (`first_name`, `last_name`, `email`, `phone`) + secondary person (`secondary_first_name`, `secondary_last_name`, `secondary_email`, `secondary_phone`, `secondary_relationship`). Dual addresses: `property_address` (rental/sale unit) + `home_address` (owner's personal). `legal_ownership_name` for LLC/Trust. Roles array supports combos: `["landlord","seller"]`.
>
> **CRM analytics (14 systems):** Demand Heatmap, Buyer Intent, Agent Performance, CMA Engine, Showing Feedback, Notifications, Document Vault, Market Pulse, Lead Scoring, Commission Tracker, Listing Auditor, Seller Outreach, Pricing Experiments, Pipeline.
>
> **CRM v2 workspace system:** `detectTypeAndPhase()` routes each client to the correct workspace renderer. 4 workspace files (seller, buyer, landlord, tenant) each have prospect + active modes. Convert API (`POST /api/crm/convert`) handles 6 lifecycle transitions with AuditEvent logging. `Listing.owner_client_id` links listings to their owner client.
>
> **Frontend resilience (added 2026-03-13):**
> - Error boundaries: 9 error.tsx files (global + per-section)
> - Loading states: 7 loading.tsx skeleton files
> - SEO metadata: 19 layout.tsx files for client-side pages (noindex on private routes)
> - Structured data: JSON-LD BreadcrumbList on listing pages
> - Resource hints: preconnect/dns-prefetch for Trestle API
> - Input validation: API pagination caps (200 listings, 50 transit), zip code OData injection prevention
>
> **Compliance libraries (server-side):**
> - RLS Enforcement Gate (`lib/compliance/rls-enforcement.ts`) — 19 mandatory fields, 6 distribution gates, Fair Housing scanning
> - DOM Tracker (`lib/compliance/dom-tracker.ts`) — UCBA 2026 days-on-market with 30-day reset
> - Portal DTO sanitizer (`lib/compliance/dto.ts`) — public/portal/CRM tiers with agent PII masking
> - REBNY Validator (`lib/compliance/`) — CI-gateable, 10-section validation, 4-layer field resolution
>
> **Do NOT:**
> - Confuse the public frontend with the backend CRM — they are different products for different users
> - Expose Trestle/IDX credentials or tokens to the browser
> - Make client-side calls to MLS/IDX APIs

---

## 🚨 CRITICAL: MLS/IDX DATA COMPLIANCE

This project handles **licensed MLS/IDX data from REBNY RLS via Trestle/Cotality** (formerly CoreLogic).

### ❌ PROHIBITED (Violations = $40,000 damages + suspension)
- Client-side calls to MLS/IDX APIs
- Public/unsecured JSON endpoints with MLS data
- Scraping, bulk export, redistribution
- Using MLS data for AI training, embeddings, or vector databases
- Exposing credentials in frontend code
- Displaying listings where `InternetEntireListingDisplayYN = False`
- Showing addresses where `InternetAddressDisplayYN = False`
- Displaying Owner Opt-Out or Participant Only listings publicly
- Using "Off-Market" language in any listing description
- Including agent info (name, contact, URL) in property descriptions
- Including compensation/broker fees in property descriptions or comments
- Displaying compensation amounts on any listing

### ✅ REQUIRED
- Server-side only MLS data access
- REBNY RLS attribution on all IDX/VOW displayed listings
- Update timestamps on displayed data
- Fair Housing compliant language (Federal, NY State, NYC Human Rights Law)
- Audit logging for data access
- Statistical data disclaimer: "Based on information from the REBNY Listing Service for the period [date] through [date]..."
- Coming Soon badge: "Coming Soon. No Showings or Open House until [date]"
- Remove/mark closed listings within 24 hours
- Commission negotiability disclosure in listing/buyer agreements

---

## Commercial Property Classification

Commercial listings are **website-only** (mallan.nyc). They are NOT distributed to REBNY RLS/IDX feeds.

- **`rls_eligible: false`** on the Listing model bypasses all 6 distribution gates
- CRM listing POST detects commercial property type, skips RLS enforcement gate
- Public search uses `OR` query: (RLS listings with gate checks) OR (website-only listings)
- Sale form has 18 commercial sub-types + 5 ownership types with "mallan.nyc only" warning banner
- Fields: `commercial_sub_type`, `commercial_ownership` on Listing model

**Important:** RLS compliance rules (distribution gates, attribution, disclaimers) apply ONLY to `rls_eligible: true` listings. Website-only listings still must comply with Fair Housing, NY DOS advertising laws, and TCPA.

---

## Compliance Requirements

All code and technical work must comply with:

1. **RESO Standards** - Real Estate Standards Organization data standards
2. **REBNY RLS Rules / UCBA 2026** - Universal Co-Brokerage Agreement (January 2026 revision)
3. **NY DOS Advertising Laws** - New York State real estate advertising regulations (19 N.Y.C.R.R. § 175.25)
4. **Fair Housing Act + NYC Human Rights Law Title 8** - No discriminatory language or filtering
5. **TCPA/CTIA** - Telephone Consumer Protection Act (lead capture/SMS)
6. **CAN-SPAM Act** - Email marketing compliance
7. **NY SHIELD Act** - Data security requirements
8. **WCAG 2.1 AA** - Accessibility standards

### UCBA 2026 Key Rules (Enforced by REBNY)

| Rule | Penalty |
|------|---------|
| Fair Housing violation | $250 first, $500 + RLS termination second |
| Data quality violation | $0/$250/$250/termination (escalating) |
| Incurable violation (e.g., advertising opted-out property) | $250 first, $500 subsequent |
| General UCBA violation | $500/$2K/$10K/suspension |
| Quarterly >5% rejection rate | **$10,000 fine** |
| 3 quarterly fines in a year | **30-day RLS suspension** |

---

## Responsive Design Requirements

All changes must be fully responsive and tested across:

- **Desktop** - All screen sizes (1920px+, 1440px, 1280px, 1024px)
- **Laptops** - Standard laptop displays (1366px, 1536px)
- **Tablets** - iPad, Android tablets, and all other tablet devices (768px - 1024px)
- **Mobile** - All mobile devices including iPhone, Android phones (320px - 767px)

Every UI change should work seamlessly across all screen sizes and device types.

---

## Key Project Files

| File | Purpose |
|------|---------|
| `MASTER-PROJECT-TREE-v3.3.md` | **Master Project Tree** — file roles, portals, progress, phases 0-6, 24 Go-Live gates, enforcement, System Doctrine |
| `MALLAN-NYC-CRM-PROJECT.md` | Master project document |
| `CRM-ENHANCEMENT-SPEC.md` | Detailed enhancement specifications |
| `compliance/MASTER-AUDIT-REPORT-v3.md` | Full audit report (225 findings, 39 passes, 47 BLOCKERs) |
| `prisma/schema.prisma` | Database schema — 60 Prisma models (Listing, Agent, Lead, Deal, CommissionPayment, AuditEvent, etc.) |
| `lib/compliance/` | Server-side compliance: RLS enforcement gate, DOM tracker, portal DTO sanitizer |
| `lib/compliance/` | CI-gateable REBNY RLS validator (10 sections, 4-layer resolution) |
| `compliance/FULL-AUDIT-2026-03-13.md` | **UCBA 2026 source-verified audit** — 145 rules, 109 PASS, 9 FAIL, 27 EVALUATE CLOSELY |
| `compliance/rules/ucba-audit-checklist.json` | Machine-readable audit checklist — used by `scripts/ucba-compliance-audit.js` for regression detection |
| `scripts/ucba-compliance-audit.js` | UCBA compliance validator — `npm run ucba:audit` — detects regressions if passing rules break |
| `data/rebny-rls-property-fields.csv` | **902 REBNY IDX Plus fields** across 7 resources (Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39). Replaced 2026-03-19 from REBNY official "IDX PLUS 3.15.26" document. 100% match against Trestle live feed. |
| `data/rebny-rls-property-lookup.csv` | All 2,066 picklist values |
| `data/RLS-FIELD-REGISTRY.md` | **Complete Trestle resource map** — all 12 data resources, distribution gates, media/video/3D, Building, PropertyRooms, Teams, CustomFields, field corrections |
| `artifacts/metadata.xml` | Full Trestle OData metadata (all entity types, field definitions, enum values) |
| `data/UCBA-2026-Requirements.md` | UCBA 2026 rules extracted (56 pages) — all compliance requirements |
| `data/RLS-Syndication-Research.md` | RLS feed types, syndication portals, costs, pre-licensed providers |

---

## Data Source & RLS Feed

- **Primary Feed:** REBNY RLS via Trestle (Cotality, formerly CoreLogic) — migrated Feb 2025 from Perchwell
- **Trestle API:** `api.cotality.com/trestle` — old URLs (`api-trestle.corelogic.com`, `api-prod.corelogic.com`) deprecated, hard deadline March 31, 2026. Media proxy allowlists all 3 domains during transition.
- **LMP:** RealPlus (listing input to RLS — REBNY does not grant LMP licenses to individual brokers)
- **Trestle License:** IDX Plus - WebAPI (Trestle-11371-20) — READ-ONLY display on mallan.nyc. No write access to RLS.
- **IDX Plus Fields:** 902 across 7 REBNY-specified resources (Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39)
- **Additional Trestle Resources:** 5 beyond IDX Plus — PropertyRooms (39 fields), Teams (48), TeamMembers (29), PropertyGreenVerification (39), Building (key only, empty shell)
- **Total Trestle Fields:** ~1,364 across 12 data resources
- **Critical Beyond-CSV Fields:** Distribution gates (`InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`) + `ShowingInstructions` are on Trestle Property but NOT in the IDX Plus CSV
- **Fields NOT on Trestle:** `IDXEntireListingDisplayYN` (use `InternetEntireListingDisplayYN`), `SyndicateYN` (use `SyndicateTo`), all VOW-prefixed gate fields, **Latitude**, **Longitude** (Trestle REBNY feed does NOT provide coordinates — all geocoding is mallan.nyc's responsibility via `lib/geo/geocode.ts` + ZIP centroid fallback)
- **Picklist Values:** 2,066 lookup values
- **Data Dictionary:** `Desktop/mallan nyc web/Trestle fields/Data_Migration_2025_RLS_Data_Rules.xlsx`
- **Full Registry:** `data/RLS-FIELD-REGISTRY.md` — all 12 resources, media/video/3D, field corrections
- **UCBA Rules:** `data/UCBA-2026-Requirements.md` (extracted from 56-page PDF)

### Feed Types

| Feed | Purpose | For |
|------|---------|-----|
| **RLS** | Core REBNY listing database | Authorized Participants only |
| **IDX** | Reciprocal broker display on websites | Public (mallan.nyc listing search) |
| **VOW** | Consumer-facing with extra data | Client portal (requires login) |
| **Syndication** | Distribution to third-party portals | 3 Trestle opt-in portals |

### Syndication & Distribution

| Portal | Cost | Method |
|--------|------|--------|
| StreetEasy | Sales: FREE / Rentals: $7+/day | Direct upload (NOT via RLS) |
| Zillow / Trulia | FREE | Auto from StreetEasy |
| Realtor.com, Redfin, Homes.com, RentHop | FREE | Direct data license from REBNY (automatic) |
| openigloo, Samaki.com, TBI Listings | FREE | Trestle IDX Plus opt-in toggles (all ON) |

### IDX Plus License Scope (mallan.nyc — Confirmed by REBNY 2026-03-27)
- **REBNY confirmed (Michaela Parker, mparker@rebny.com, 2026-03-27):** IDX feed may power: (1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting features. Client data stays on mallan.nyc.
- **mallan.nyc does NOT submit listings to the RLS and is NOT an LMP.** It is a read-only IDX consumer + internal CRM platform.
- **IDX feed is NOT full-market search.** Limited to the IDX-released field set (902 fields) and IDX-eligible listing inventory only. Excludes Participant Only, Owner Opt-Out, and listings where InternetEntireListingDisplayYN = False. Agents use RealPlus for full RLS inventory.
- **Listing input:** Agents create/edit listings in RealPlus (LMP) → RealPlus submits to RLS → mallan.nyc reads via IDX Plus. REBNY does not grant LMP licenses to individual brokers.
- **What mallan.nyc owns:** CRM, client database, portals, branded client emails, lead capture, commission tracking, search alerts, reporting, and all agent/client workflows. Client data never passes through RealPlus or any third party. RealPlus is used only for listing submission to the RLS and full-market agent search.
- Trestle IDX Plus WebAPI (Trestle-11371-20) — live metadata has 1,457 Property definitions. 902 in REBNY IDX Plus CSV + additional Trestle-provisioned fields.
- **ClosePrice, OriginalListPrice, PreviousListPrice, DaysOnMarket ARE authorized for public IDX display** — verified against REBNY IDX Plus CSV, REBNY IDX/VOW Compliance Checklist (Dec 2021, no field-level restriction), Trestle live feed validation (2026-03-04), and NAR IDX Policy 7.58.
- VOW adds consumer registration requirements and pre-registration display limits (image, ID, beds/baths, price, neighborhood only before login). VOW does NOT restrict additional fields beyond what IDX provides — it adds access control, not field restrictions.
- Fields that MUST NOT be displayed: PrivateRemarks, ShowingInstructions, ExpirationDate (Hidden), PropertyCondition (agent-only), seller/occupant names/phone/email. These are prohibited on BOTH IDX and VOW per REBNY checklist.
- Contact for any feed questions: rlssupport@rebny.com / 212-616-5270

---

## ⚠️ TRESTLE MEDIA API RULES — VENDOR-CONFIRMED (2026-04-07)

> **Source:** Direct feedback from CoreLogic/Trestle (Cotality) support, received 2026-04-07.
> **These rules are AUTHORITATIVE and override any prior assumptions about Media resource queries.**

### 1. ResourceRecordKey, NOT ResourceRecordID (CRITICAL)
- **`ResourceRecordKey`** and **`ResourceRecordKeyNumeric`** are ALWAYS unique across all MLOs (Multiple Listing Organizations).
- **`ResourceRecordID`** MAY BE DUPLICATED across MLOs. Using it can return wrong photos for listings.
- **Field mapping:** Property.`ListingKey` = Media.`ResourceRecordKey` | Property.`ListingKeyNumeric` = Media.`ResourceRecordKeyNumeric`
- **DB mapping:** `mls_id` column on Listing model stores `ListingKey` (= `ResourceRecordKey`)
- **All Media OData queries MUST filter by `ResourceRecordKey`**, falling back to `ResourceRecordID` only if `mls_id`/`ListingKey` is null.

### 2. Media/All Endpoint is DEPRECATED
- The `Media/All` endpoint is being removed by Trestle.
- **Use filtered queries on the `/odata/Media` resource directly** (e.g., `$filter=ResourceRecordKey eq '...'`).
- mallan.nyc already does this correctly — no `Media/All` usage exists.

### 3. Two-Tier Timestamp Strategy for Media Sync
- **`Media.ModificationTimestamp`** — Source of truth for individual media row changes. Use to detect when specific photos/floorplans were added, modified, or removed.
- **`Property.PhotosChangeTimestamp`** — High-level trigger on the Property resource. Modified when ANYTHING in the listing's media record changes. Use as a lightweight signal to decide which listings need their media re-fetched.
- **Recommended workflow:** Check `PhotosChangeTimestamp > lastSyncTime` on Property to identify changed listings → then query their Media with `ModificationTimestamp` filter for granular updates.

### 4. Files Enforcing These Rules (17 total — deep-audited 2026-04-07)

**Production code (7 files):**
| File | What it does |
|------|-------------|
| `lib/idx/sync.ts` | 3 batch media sections (syncListings, backfill, agent history) |
| `lib/idx/fetch.ts` | `fetchListingMedia()` priority order + inline `$expand=Media` |
| `lib/idx/card-fields.ts` | `PhotosChangeTimestamp` in $select |
| `app/api/media/batch/route.ts` | CRM media batch endpoint (detail + primary photo modes) — DB lookup for mls_id |
| `app/api/agents/[slug]/listings/route.ts` | Agent listing photo batch fetch |
| `app/api/idx/search/route.ts` | Search result photo backfill (uses `wid` = SourceSystemKey) |
| `scripts/import-closed-from-trestle.ts` | Closed listing import with idToKeyMap |

**Utility scripts (3 files):**
| File | What it does |
|------|-------------|
| `scripts/rebuild-past-deals.js` | Past deals rebuild — idToKeyMap from ListingKey |
| `scripts/fetch-real-photos.js` | Past deals photo fix — combined ResourceRecordKey OR ResourceRecordID filter |
| `scripts/trestle-audit.js` | Trestle health audit — ResourceRecordKey for non-numeric keys |

**Test/diagnostic scripts (7 files):**
| File | What it does |
|------|-------------|
| `scripts/test-media-coverage.js` | Media coverage diagnostic |
| `scripts/test-media-fix.js` | Media fix verification |
| `scripts/test-photos.js` | Photo fetch test |
| `scripts/test-media-types.js` | Media type diagnostic |
| `scripts/time-pipeline.js` | Pipeline performance benchmark |
| `scripts/test-media-public.js` | Public media test |
| `scripts/test-media-cats.js` | Media category diagnostic |

---

## UI/UX Standards

### Color Scheme
- **Luxury Gold:** #B8860B (accent for premium features)
- **Status Colors:** Blue (Active), Orange (Offer), Purple (Contract), Green (Sold), Gray (Off Market)

### Typography
- Labels: `text-xs font-semibold text-gray-700`
- Inputs: `text-sm font-medium`
- Section headers: `text-sm font-bold text-gray-700`

### Component Patterns
- Collapsible sections with +/- icons
- Status boxes with expandable sub-items
- Datalist inputs for custom + suggested values
- Calculator boxes with colored backgrounds

---

## REBNY RLS Pre-Licensed Providers

| Category | Count | Names |
|----------|-------|-------|
| **Direct Network Portal** | 3 | openigloo, Samaki.com, TBI Listings |
| **VOW** | 3 | Lofty, OLR, Zenlist |
| **LMP** | 8 | BrokersNYC, Leadkit, Lofty, OLR, Perchwell, RealPlus, RealtyMX, RESoft |
| **IDX** | 30 | blankslate, blueroof360, BoomTown, CINC, Constellation RE, Home ASAP, HomeJunction, IDX (Elm Street), iHomefinder, kvCORE, Leadkit, Lofty, Luxury Presence, MoxiWorks, OLR, propertybase, PropMiX, RE Webmasters, RealGeeks, RealPlus, RealtyMX, Realtyna, RealtyWatch, RESoft, Sierra Interactive, Smarter Agent, The House Club, TREM Group, Xome, Ylopo |
| **Product** | 10 | BoldTrail, brokerloop, Core Present, Espresso Agent, Haystack, LiveBy, Nancy Packes, PerryStory, UrbanDigs, Vulcan7 |

**Not on lists (own data licenses):** Realtor.com, Redfin, Homes.com, Zillow/StreetEasy, RentHop, Compass

---

## Data Retention Policies (NY SHIELD Act + REBNY)

| Data Category | Retention Period | Policy |
|---------------|-----------------|--------|
| Listing data & agreements | 6 years | Required by NY DOS |
| Transaction records & commissions | 6 years | Required by NY DOS / IRS |
| Audit event logs | 2 years | REBNY RLS compliance |
| Trestle/IDX access logs | 12 months | REBNY RLS requirement |
| Lead PII (inactive) | 3 years then archive | NY SHIELD Act |
| Session tokens | 24 hours | Auto-expiring, httpOnly cookies |
| Closed listing display | Remove within 24 hours | REBNY RLS Sec. 2.05 |

**Consent:** All lead-capture endpoints record `consent_captured_at` (TCPA/CAN-SPAM). No autoresponders on contact form (TCPA safe). Search alerts and marketing emails require explicit opt-in.

## GitHub & Vercel

All deployments and CI/CD workflows must maintain compliance with the above standards.

**Cron jobs (vercel.json):** 7 scheduled tasks — db-keepalive (every 3min), data retention (daily 3am), DOM reset (daily 6am), IDX sync (every 12min), media backfill (every 8min), listing expiration (daily 7am), search alerts (daily 7:30am) + 11 more scheduled. 19 cron route handlers total.

**Validation (CI):** `npm run ci` runs: lint → type-check → compliance-check → **idx:validate (32-section validator)** → build. The IDX Plus Validator (`scripts/idx-validate.js`) blocks builds on critical issues. Results saved to `public/crm/data/validator-results.json` for the CRM System Health dashboard. Run history stored in `.idx-validate/history.json`.

**Repo surface area (verified 2026-04-06):**
- Scheduled crons: **19** (vercel.json)
- Cron route files: **19** (app/api/cron/)
- Prisma models: **60** (schema.prisma)
- API route files: **253** (app/api/)
- Components: **102** (app/components/)
- Verify: `node scripts/regenerate-claude-counts.js`

---

## Reference

- `MALLAN-NYC-CRM-PROJECT.md` — Master project document
- `data/UCBA-2026-Requirements.md` — UCBA 2026 compliance rules (extracted from PDF)
- `data/RLS-Syndication-Research.md` — Feed types, syndication, costs, providers
- `data/rebny-rls-property-fields.csv` — All 902 REBNY IDX Plus fields (replaced 2026-03-19)
- `data/rebny-rls-property-lookup.csv` — All 2,066 picklist values

---

## Comprehensive Site Audit — 2026-04-06

> **Scope:** Full-stack deep audit — build, TypeScript, IDX validator, all 253 API routes, all frontend pages, CRM dashboard, 4 client portals, 60 Prisma models, compliance gates, IDX field mapping pipeline, public pages.
>
> **Build:** PASS | **TypeScript:** 0 errors | **IDX Validator:** 822 pass, 0 critical, 3 warning
>
> **CRITICAL fixes applied:**
> 1. `CompareProperties` fetched wrong listings (`limit=1&type=` instead of by ID) — **FIXED**
> 2. Midtown Manhattan hardcoded fallback coordinates (Trestle has NO lat/lng) — **REMOVED**
> 3. `/client-access` demo AI chat exposed in production — **DELETED**
> 4. `/api/crm/activity` was a stub returning empty — **IMPLEMENTED** (real AuditEvent query)
> 5. "Weekly Report" button missing required `subject`/`body` fields — **FIXED**
> 6. `TenantPays` dropped from IDX mapping pipeline (FARE Act) — **FIXED** (types + mapping + DTO)
> 7. Missing `loading.tsx`/`error.tsx` on building and market pages — **ADDED**
>
> **Round 2 fixes (2026-04-06):**
> 8. DB-to-public DTO field parity — added 20+ missing fields (prices, DOM, virtualTour, rental, amenities)
> 9. Rental CRM: Add Lease form injected `landlord_lead_id`, 4 modal stubs wired to real APIs
> 10. CRM auth guard re-enabled (was disabled with `&& false`)
> 11. FARE Act fields added to CRM search `$select`
> 12. Email dev-mode changed to `console.warn` + `_devMode` flag
>
> **Round 3 fixes (2026-04-06):**
> 13. Contact form GET BigInt crash — **FIXED** (serialized `id`)
> 14. Open houses: agent PII stripped (office name only), `OwnerOptOut`→`Permission`, fail-open→fail-closed
> 15. `_submitShowing` field names aligned with API, `_submitUpload` `doc_type` match, DB DTO falsy zero drops
>
> **Quality improvements (2026-04-07):**
> 16. 10 dead components + 7 unused npm deps removed (reduced bundle)
> 17. About + Agents pages server-rendered (SEO: agent names/bios now in initial HTML)
> 18. ECB violations integrated into building profiles (`app/components/BuildingViolations.tsx` + `/api/dob/ecb-violations`)
> 19. Tenant portal: "My Lease" tab (dates, rent, days remaining, renewal status)
> 20. Outreach cadence auto-scheduler in prospect-triggers cron (sends ready email steps)
> 21. Email verification for self-signup clients (OTP, invited clients pre-verified)
> 22. `ClosePrice`/`CloseDate`/`ListingContractDate` removed from `PRIVATE_FIELDS` (IDX-authorized per REBNY)
> 23. Rental pitch packet with auto-CMA on address + editable financials
> 24. Honeypot field renamed (`website`→`fax_line`), lightbox keyboard accessibility (WCAG 2.1 AA)
> 25. Count regenerator script fixed (recursive component counting)
>
> **Remaining known gaps:**
> - `/style-preview` dev page still in production (blocked by route guards)
> - Offer status email lookup has no rate limiting
> - Public "Save Search" (localStorage) doesn't trigger email alerts (cron queries DB)
> - StructureType, LivingAreaUnits, LotSizeUnits in FIELD_MAP but not in IDX pipeline
> - 5 orphaned Prisma models removed (2026-04-07): FinancialLedger, MicroCommitment, CampaignRecipient, ExperimentListing, EngagementEvent
> - No runtime/integration tests — all validation is static code analysis
> - Neighborhood market stats are static JSON (stale until manually updated)
>
> **Trestle does NOT provide Latitude/Longitude.** Geocoding responsibility:
> 1. `geocodeListings()` in `lib/geo/geocode.ts` — address-based
> 2. ZIP centroid fallback from `ZIP_CENTROIDS` table
> 3. If both fail → lat/lng stay null → map/transit/schools sections hide gracefully
>
> **Compliance status (2026-04-07):** IDX Validator 823/0 critical | UCBA 42/46 pass, 0 regressions | CRM Smoke 218/0
>
> **Full findings:** `memory/FULL-SITE-AUDIT-2026-04-06.md`

## Compliance Findings Audit — 2026-04-14

> **Scope:** 22 findings across CAN-SPAM, NYS RPL, REBNY IDX, NY SHIELD, UCBA, DOS advertising, Fair Housing.
> **TypeScript:** 0 errors after fixes.

### Fixes Applied (2026-04-14)

| # | Original Finding | Verdict | Action |
|---|-----------------|---------|--------|
| HIGH-7 | CRM emails missing unsubscribe link | **ACCURATE** | **FIXED** — Added unsubscribe link to shared email FOOTER (`lib/email/templates.ts`). All emails via `wrapEmail()` now include opt-out. Removed duplicate from `searchAlertEmail`. |
| HIGH-1 | InquiryForm — no agency disclosure | **ACCURATE** | **FIXED** — Created `AgencyDisclosure` component (`app/components/AgencyDisclosure.tsx`). Added to InquiryForm, InquiryModal, Contact page, HomeValueWidget, CalculatorLeadCapture. References `/sop` for full DOS-1736-f disclosure. |
| HIGH-3 | Behavioral trackers fire before consent | **ACCURATE** | **FIXED** — `BehavioralTracker.tsx` and `IntentTracker.tsx` now import `useConsentStatus()` and gate all event firing behind `analyticsAllowed`. Consistent with existing Analytics/PostHogProvider pattern. |
| MED-2 | Search page missing IDX attribution | **PARTIALLY ACCURATE** | **FIXED** — Search page had hardcoded disclaimer text. Replaced with `<IDXSearchDisclaimer />` component for consistency with other pages. |
| MED-6 | Portal listings missing Coming Soon gate | **PARTIALLY ACCURATE** | **FIXED** — `app/api/portal/listings/route.ts` now flags Coming Soon listings with `comingSoon: true` and required UCBA D3 notice text. Display is allowed; showings blocked separately. |

### Findings Verified as Inaccurate or Overstated

| # | Original Finding | Verdict | Reason |
|---|-----------------|---------|--------|
| CRIT-1 | Bulk email endpoint missing | **INACCURATE** | Bulk email handled by `app/api/crm/email/route.ts` (eblast type, 200-cap, consent checking). No separate route needed. CAN-SPAM unsubscribe gap was real but fixed in HIGH-7. |
| CRIT-4 | 12-min sync + 10-min skip = >15min gap | **INACCURATE** | Math is wrong: at T=12, last run was T=0 (12 min > 10 min guard), so it runs. Effective interval is always 12 min. "REBNY IDX 15-min rule" does not exist — REBNY requires "timely updates" without a specific interval. |
| HIGH-5 | Unsplash/Picsum = false listing imagery | **OVERSTATED** | Unsplash images used on 10+ pages as decorative marketing backgrounds (skylines, generic townhouse exteriors). None appear on listing detail or search result pages. Standard real estate marketing — no violation. |
| MED-4 | Sell page commission language | **ALREADY RESOLVED** | Sell page correctly states "Commission rates are not set by law and are fully negotiable" with NAR settlement reference. Compliant. |

### Findings Verified as Accurate but Accepted Risk / No Code Fix

| # | Finding | Verdict | Notes |
|---|---------|---------|-------|
| CRIT-2 | No root `middleware.ts` | **ACCURATE** | Defense-in-depth gap. Each API route individually validates auth via `requireAuth()`/`requireAgentOrBroker()`. Adding root middleware is an architectural decision — not a direct vulnerability. |
| CRIT-3 | `generateAttributionText()` lacks broker name | **PARTIALLY ACCURATE** | Function is a generic REBNY data-source disclaimer, not per-listing broker credit. Per-listing broker name displayed separately on listing pages. The two are distinct REBNY requirements. |
| HIGH-2 | RegistrationGate/SoftIdentityCapture — no disclosure | **PARTIALLY ACCURATE** | RegistrationGate is newsletter signup (not first substantive contact). SoftIdentityCapture can be property-specific but is email-only micro-capture. Covered by Fix 2 (AgencyDisclosure added to substantive contact forms). |
| HIGH-4 | Fair Housing link → internal page | **PARTIALLY ACCURATE** | `/fair-housing` renders Mallan's own Fair Housing statement (from `data/pages/fair-housing.json`). Internal page with comprehensive policy content. Not a link to official NYS form, but content may satisfy the requirement. |
| HIGH-6 | Showing gate — no pre-disclosure UX | **ACCURATE (UX only)** | Backend correctly enforces UCBA E7 (`buyer_rep_agreement` check). UX flow to present/sign agreement in-portal is missing — enhancement, not a compliance violation. |
| MED-1 | revalidate=300 closed listing lag | **ACCURATE** | 5-minute ISR is well within REBNY's 24-hour removal SLA. Informational only. |
| MED-3 | Listing data sent to Claude API | **PARTIALLY ACCURATE** | Used for compliance validation only (not redistribution/training/embedding). Operational use, not a license violation. Risk is documented. |
| MED-5 | Financial PII — no field-level encryption | **ACCURATE** | Lead model stores income/credit data as plain Decimal. Neon provides encryption at rest. Field-level encryption is a hardening measure, not a NY SHIELD Act violation given existing safeguards. |
| MED-7 | Listing expiry → removal chain | **PARTIALLY ACCURATE** | Chain exists: status transition API + `listing-expiration` daily cron + 5-min ISR + DB-first fetch. Not integration-tested end-to-end but meets 24-hour SLA. |
| LOW-1 | Footer settings API fallback | **ACCURATE (low risk)** | `/api/settings/company` endpoint doesn't exist. Footer always falls back to correct hardcoded defaults. Risk only if someone creates that endpoint. |
| LOW-2 | JSON-LD license number exposed | **CORRECT** | Required by NY DOS — this is proper behavior. |
| LOW-3 | Google Translate alters notices | **ACCURATE (low)** | Theoretical risk — machine translation could distort legal language. Low priority. |
| LOW-4 | ExclusivesVault on homepage | **NEEDS CONTEXT** | Component shows sign-in prompt for "exclusive" listings. Legitimate feature. No active violation identified. |
