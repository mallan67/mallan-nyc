# CLAUDE.md - Project Instructions for Claude Code

## Project: mallan-nyc

> **Compliance-First · Fast · Scalable**

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
| `dashboard.html` | **CRM HUB** — Broker Admin + Agent Admin (private per agent) + 4 Client Portals |
| `index-built.html` | **IDX SEARCH** — each agent's OWN PRIVATE search of REBNY RLS. Not shared. |
| `SALE-FORM-REDESIGN.html` | **SUBMISSION** — listing agent creates/edits OWN exclusive sale listing → RLS |
| `SALE-FORM-WITH-TOOLS.html` | **VIEW ONLY** — agents + buyers view exclusive sale listings (buyers see masked listing agent info) |
| `RENTAL-FORM-REDESIGN.html` | **SUBMISSION** — listing agent creates/edits OWN exclusive rental → RLS |
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
> - **Public frontend** — Next.js App Router pages (search, listings, neighborhoods, about, building profiles)
> - **Backend CRM** — `public/crm/` (static HTML files served same-origin on Vercel)
> - **API layer** — `app/api/` (169 route files, 221 HTTP handlers: auth, CRM, portal, IDX, media, AI, compliance, cron)
> - **Database** — PostgreSQL on Neon (Prisma ORM, 42 models)
> - **Media** — Trestle photos cached to Cloudflare R2 + server-side proxy fallback
> - **Cron** — 16 scheduled jobs via `vercel.json` (data retention, DOM reset, IDX sync, listing expiration, search alerts, seller/lead/conviction scoring, demand signals, intent profiles, agent metrics, experiment metrics, listing momentum, social proof, lifecycle triggers, market snapshots)
>
> **Auth:** Cookie-only (`session_token`, httpOnly, SameSite=Lax, Secure, 24hr TTL with auto-rotation). Bearer fully removed.
>
> **Listing fetch strategy:** DB-first (Prisma, 20-80ms) → Trestle direct fallback (10s timeout) → API endpoint fallback. AbortController timeouts on all external calls (10s fetch, 8s auth). Graceful null returns on failure — pages never crash from Trestle outages.
>
> **Media pipeline:** Trestle photos/floor plans cached to R2 during ISR. `/api/media/proxy` as fallback (Bearer auth server-side, 7-day CDN cache).
>
> **Lead capture:** 8 public endpoints (inquiries, contact, sign-up, CMA, guides, favorites, search-alerts, open-house RSVP). All record `consent_captured_at` for TCPA/CAN-SPAM compliance. Contact form has honeypot bot protection.
>
> **Commission system:** `CommissionPayment` model with fail-closed split validation. `FinancialLedger` for immutable transaction logging with tamper-detection hash chain.
>
> **CRM analytics (14 systems):** Demand Heatmap, Buyer Intent, Agent Performance, CMA Engine, Showing Feedback, Notifications, Document Vault, Market Pulse, Lead Scoring, Commission Tracker, Listing Auditor, Seller Outreach, Pricing Experiments, Pipeline.
>
> **Frontend resilience (added 2026-03-13):**
> - Error boundaries: 7 error.tsx files (global + per-section)
> - Loading states: 5 loading.tsx skeleton files
> - SEO metadata: 9 layout.tsx files for client-side pages (noindex on private routes)
> - Structured data: JSON-LD BreadcrumbList on listing pages
> - Resource hints: preconnect/dns-prefetch for Trestle API
> - Input validation: API pagination caps (200 listings, 50 transit), zip code OData injection prevention
>
> **Compliance libraries (server-side):**
> - RLS Enforcement Gate (`lib/compliance/rls-enforcement.ts`) — 19 mandatory fields, 6 distribution gates, Fair Housing scanning
> - DOM Tracker (`lib/compliance/dom-tracker.ts`) — UCBA 2026 days-on-market with 30-day reset
> - Portal DTO sanitizer (`lib/compliance/dto.ts`) — public/portal/CRM tiers with agent PII masking
> - REBNY Validator (`lib/rls-validator/`) — CI-gateable, 10-section validation, 4-layer field resolution
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
- Displaying listings where `IDXEntireListingDisplayYN = False`
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
| `lib/rls-validator/` | CI-gateable REBNY RLS validator (10 sections, 4-layer resolution) |
| `compliance/FULL-AUDIT-2026-03-13.md` | **UCBA 2026 source-verified audit** — 145 rules, 109 PASS, 9 FAIL, 27 EVALUATE CLOSELY |
| `compliance/rules/ucba-audit-checklist.json` | Machine-readable audit checklist — used by `scripts/ucba-compliance-audit.js` for regression detection |
| `scripts/ucba-compliance-audit.js` | UCBA compliance validator — `npm run ucba:audit` — detects regressions if passing rules break |
| `data/rebny-rls-property-fields.csv` | All 448 REBNY RLS property fields |
| `data/rebny-rls-property-lookup.csv` | All 2,066 picklist values |
| `data/UCBA-2026-Requirements.md` | UCBA 2026 rules extracted (56 pages) — all compliance requirements |
| `data/RLS-Syndication-Research.md` | RLS feed types, syndication portals, costs, pre-licensed providers |

---

## Data Source & RLS Feed

- **Primary Feed:** REBNY RLS via Trestle (Cotality, formerly CoreLogic) — migrated Feb 2025 from Perchwell
- **Trestle API:** `api.cotality.com/trestle` — old URLs (`api-trestle.corelogic.com`, `api-prod.corelogic.com`) deprecated, hard deadline March 31, 2026. Media proxy allowlists all 3 domains during transition.
- **Trestle License:** IDX Plus - WebAPI (direct, independent — NOT through RealPlus or any LMP)
- **Total Fields:** 448 Property fields
- **Picklist Values:** 2,066 lookup values
- **Data Dictionary:** `Desktop/mallan nyc web/Trestle fields/Data_Migration_2025_RLS_Data_Rules.xlsx`
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

### Direct Data License (mallan.nyc)
- Applying for Direct Data License to pull RLS data into mallan.nyc (like Compass)
- Contact: rlssupport@rebny.com / 212-616-5270
- Need both IDX feed (public search) and VOW feed (client portal)

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

**Cron jobs (vercel.json):** 16 scheduled tasks — data retention (daily 3am), DOM reset (daily 6am), IDX sync (every 4h), listing expiration (daily 7am), search alerts (daily 7:30am), seller scoring (daily 8am), experiment metrics (daily 9am), demand signals (daily 10am), intent profiles (daily 11am), agent metrics (weekly Mon 12pm), lead scoring (daily 1pm), conviction scores (daily 2pm), listing momentum (daily 3pm), social proof (daily 4pm), lifecycle triggers (daily 5pm), market snapshots (monthly 1st 6am).

---

## Reference

- `MALLAN-NYC-CRM-PROJECT.md` — Master project document
- `data/UCBA-2026-Requirements.md` — UCBA 2026 compliance rules (extracted from PDF)
- `data/RLS-Syndication-Research.md` — Feed types, syndication, costs, providers
- `data/rebny-rls-property-fields.csv` — All 448 REBNY RLS fields
- `data/rebny-rls-property-lookup.csv` — All 2,066 picklist values
