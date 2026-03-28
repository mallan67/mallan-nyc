# CLAUDE.md - Project Instructions for Claude Code

## Project: mallan-nyc

> **Compliance-First · Fast · Scalable**
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
> - **Database** — PostgreSQL on Neon (Prisma ORM, 61 models)
> - **Outlook integration** — Microsoft Graph OAuth for email scanning (StreetEasy lead import, folder browser)
> - **Media** — Trestle photos cached to Cloudflare R2 + server-side proxy fallback
> - **Cron** — 6 scheduled jobs via `vercel.json` (data retention, DOM reset, IDX sync, listing expiration, search alerts, prospect triggers). 10 additional cron route files exist but are NOT scheduled (lead-scoring, intent-profiles, conviction-scores, seller-scoring, listing-momentum, social-proof, agent-metrics, market-snapshots, experiment-metrics, demand-signals).
>
> **Auth:** Cookie-only (`session_token`, httpOnly, SameSite=Lax, Secure). Per-role TTL: Broker 24h, Agent 8h, Client 30d. Bearer fully removed.
>
> **MFA:** Broker login requires email OTP (6-digit code via M365 SMTP). SMS ready when Twilio env vars added. `MFA_EMAIL` env var overrides recipient (currently Gmail to avoid M365 same-mailbox delivery issue). Files: `lib/auth/mfa.ts`, `app/api/auth/mfa/verify/route.ts`. No TOTP app needed.
>
> **Listing fetch strategy:** DB-first (Prisma, 20-80ms) → Trestle direct fallback (10s timeout) → API endpoint fallback. AbortController timeouts on all external calls (10s fetch, 8s auth). Graceful null returns on failure — pages never crash from Trestle outages.
>
> **Media pipeline:** Trestle photos/floor plans cached to R2 during ISR. `/api/media/proxy` as fallback (Bearer auth server-side, 7-day CDN cache).
>
> **Lead capture:** 8 public endpoints (inquiries, contact, sign-up, CMA, guides, favorites, search-alerts, open-house RSVP). All record `consent_captured_at` for TCPA/CAN-SPAM compliance. Contact form has honeypot bot protection.
>
> **Commission system:** `CommissionPayment` model with fail-closed split validation. `FinancialLedger` schema exists for immutable transaction logging with tamper-detection hash chain (schema-only — hash chain implementation pending).
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
| `prisma/schema.prisma` | Database schema — 42 Prisma models (Listing, Agent, Lead, Deal, CommissionPayment, FinancialLedger, AuditEvent, etc.) |
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
- **Fields NOT on Trestle:** `IDXEntireListingDisplayYN` (use `InternetEntireListingDisplayYN`), `SyndicateYN` (use `SyndicateTo`), all VOW-prefixed gate fields
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

**Cron jobs (vercel.json):** 6 scheduled tasks — data retention (daily 3am), DOM reset (daily 6am), IDX sync (every 4h), listing expiration (daily 7am), search alerts (daily 7:30am), prospect triggers (daily 9am). 10 cron route handlers exist but are NOT scheduled in vercel.json.

**Validation (CI):** `npm run ci` runs: lint → type-check → compliance-check → **idx:validate (32-section validator)** → build. The IDX Plus Validator (`scripts/idx-validate.js`) blocks builds on critical issues. Results saved to `public/crm/data/validator-results.json` for the CRM System Health dashboard. Run history stored in `.idx-validate/history.json`.

**Repo surface area (auto-verified — do not hand-edit):**
- Scheduled crons: **6** (vercel.json)
- Cron route files: **16** (app/api/cron/)
- Prisma models: **61** (schema.prisma)
- API route files: **235** (app/api/)
- Components: **101** (app/components/)
- Verify: `node scripts/regenerate-claude-counts.js`

---

## Reference

- `MALLAN-NYC-CRM-PROJECT.md` — Master project document
- `data/UCBA-2026-Requirements.md` — UCBA 2026 compliance rules (extracted from PDF)
- `data/RLS-Syndication-Research.md` — Feed types, syndication, costs, providers
- `data/rebny-rls-property-fields.csv` — All 902 REBNY IDX Plus fields (replaced 2026-03-19)
- `data/rebny-rls-property-lookup.csv` — All 2,066 picklist values
