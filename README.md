# Mallan Real Estate Inc. — New York City Brokerage Platform  
**Compliance-First · Fast · Scalable**

**Status:** Active Development  
**Jurisdiction:** New York State / NYC  
**Policies:** NY DOS Advertising · REBNY RLS Display Rules · Fair Housing · TCPA/CTIA · CAN-SPAM · NY SHIELD · WCAG 2.1 AA  

---

## What This Product Is

Mallan NYC is a **compliance-first New York brokerage platform** designed to support public listing search, lawful lead capture, and internal brokerage operations. The system prioritizes regulatory safety, performance (Core Web Vitals), accessibility (WCAG 2.1 AA), and a clean architecture that can scale without fragmentation.

This repository is the **single source of truth** for the Mallan NYC brokerage platform.

---

## 🚨 Compliance & Legal Requirements (READ FIRST)

> **This repository handles licensed MLS / IDX data.**  
>  
> All contributors, contractors, automations, and AI systems interacting with this codebase **must comply** with the rules below.  
> Violations may expose the brokerage to **immediate suspension and liquidated damages up to $40,000**.

---

## 📌 MLS / IDX DATA COMPLIANCE (REBNY RLS)

### Overview
This project integrates **REBNY Residential Listing Service (RLS) IDX data** under a broker-direct license held by **Mallan Real Estate Inc**. All use of MLS/IDX data must comply with REBNY RLS rules, RESO standards, the Fair Housing Act, and New York State real estate advertising law.

Non-compliance exposes the brokerage to immediate suspension and liquidated damages up to $40,000.

---

### Allowed Use
- MLS/IDX data may be accessed **only via authorized server-side connections** using credentials issued through Trestle/CoreLogic.
- Data is used **solely for public display of real estate listings** on broker-operated websites.
- Data may be cached locally for performance and compliance purposes.
- Media (photos) are accessed via approved MLS media URLs unless otherwise authorized.

---

### Prohibited Use (STRICT)
The following are **explicitly forbidden**:

- ❌ Client-side calls to MLS/IDX APIs  
- ❌ Public or unsecured JSON endpoints containing MLS data  
- ❌ Scraping, bulk export, or redistribution  
- ❌ Resale, sublicensing, or syndication to third parties  
- ❌ Use of MLS/IDX data for analytics resale or derivative datasets  

---

### 🚫 AI / OpenAI / ML Restrictions
MLS/IDX data **MUST NOT** be used for:
- AI or LLM training
- Fine-tuning models
- Vector databases / embeddings
- Predictive analytics or valuation models
- Behavioral profiling tied to listing data

Only **non-MLS metadata** (user behavior, UI events, internal notes) may be used for AI features unless separate written authorization is obtained from REBNY.

---

### Display & Attribution Requirements
All IDX listings must:
- Display required **REBNY RLS attribution and disclaimer text**
- Include update timestamps
- Follow REBNY refresh and pagination limits
- Comply with Fair Housing and NY advertising rules

These requirements apply to **all environments** (production, staging, previews).

---

### Security & Audit
- MLS data access must be logged and auditable.
- Credentials must never be exposed in frontend code.
- REBNY reserves the right to audit systems and access logs.
- Audit fees and suspension may apply for violations.

---

### Termination
Upon termination of the IDX license:
- All MLS/IDX data must be deleted or rendered inaccessible.
- No residual storage, backups, or derived datasets may remain.

---

### Responsibility
All contributors, contractors, vendors, and AI systems interacting with this codebase are required to comply with this policy.

**If unsure, assume MLS data is restricted and escalate before use.**

---

### ✅ Why this matters
This repository is **broker-direct**, not a vendor platform.
Compliance is not optional and not abstract — it is contractual.

---

## IDX / Trestle (REBNY RLS) — Rules of the Road

### Environment Variables (server-only)

```
IDX_ENABLED=true|false
TRESTLE_API_URL=https://api.cotality.com/trestle
IDX_CLIENT_ID=...
IDX_CLIENT_SECRET=...
```

**Never expose credentials to the browser.** All Trestle calls are server-side only (`lib/idx/fetch.ts`).

> **API Migration Deadline:** Old Trestle URLs (`api-trestle.corelogic.com`, `api-prod.corelogic.com`) are deprecated. Use `api.cotality.com/trestle` only. Data Dictionary 1.7 URLs will be disabled March 23, 2026.

### Public vs CRM Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/listings` | Public (rate-limited 60/min) | Frontend search — sanitized via `toPublicDTO()`, all 6 distribution gates enforced |
| `GET /api/listings/suggest` | Public (rate-limited 60/min) | Address autocomplete — distribution gates enforced, no agent PII |
| `GET /api/idx/search` | Session cookie required | CRM search — agent/broker only, full listing data |

### REBNY Distribution Gates (fail closed)

All gates are enforced server-side. UI may only display outcomes, never bypass gate logic.

| Gate | Field | Rule |
|------|-------|------|
| 1. Owner Opt-Out | `OwnerOptOutYN` | If true, exclude from all public feeds |
| 2. Participant Only | `ParticipantOnlyYN` | If true, exclude from IDX/VOW |
| 3. IDX Display | `IDXEntireListingDisplayYN` | If false, exclude from IDX search |
| 4. Internet Display | `InternetEntireListingDisplayYN` | If false, exclude from internet display |
| 5. Coming Soon | `ComingSoonDate` | If set + future, show badge, block showings |
| 6. Closed Status | `MlsStatus` = Closed/Expired | Remove/mark within 24 hours |

**REBNY penalty for gate violations:** $250 first offense, $500 subsequent, up to $10K + suspension.

### Address Suppression

If `InternetAddressDisplayYN` is false:
- Do **not** return street address
- Do **not** return lat/lng (prevents map pin leaking location)
- Return "Address Undisclosed" messaging instead

Enforced in: `lib/idx/public-dto.ts` (`toPublicDTO()`)

### Attribution

All displayed listing data **must** include REBNY-required attribution text:

> "Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Data last updated: [timestamp]."

Generated by: `lib/idx/mapping.ts` (`generateAttributionText()`)

### RESO Data Dictionary 2.0

REBNY RLS uses RESO DD 2.0 on Trestle. Key details:
- **23 RESO-to-RLS field renames** handled in `lib/idx/trestle-mapper.ts`
- **448 total RLS fields**, 41 required, 86 conditional
- **2,066 picklist values** across 117 lookups
- **StandardStatus uses RESO enum tokens** (no spaces): `Active`, `ComingSoon`, `ActiveUnderContract`
- **DD 2.2 additions** (March 2026): `OriginalMediaUrl` on Media, `MemberMls`/`OfficeMls` fields

---

## UCBA 2026 (Universal Co-Brokerage Agreement — January 2026 Revision)

> **Source:** UCBA Master Copy (January 2026 Redline Revision) — Articles I-XI + Exhibits A-G
> **Scope:** 159 rules, 7 exhibits, 42 BLOCKERs, penalty escalation schedule
> **Full reference:** [`compliance/UCBA-2026.md`](compliance/UCBA-2026.md) | **Extracted requirements:** [`data/UCBA-2026-Requirements.md`](data/UCBA-2026-Requirements.md)

### Rule Sections (159 total)

| Section | Topic | Rules | BLOCKERs |
|---------|-------|-------|----------|
| A | New in 2026 (DOM reset, protected period) | 8 | 3 |
| B | Participation & Access | 6 | 0 |
| C | Listing Input Rules | 18 | 11 |
| D | Coming Soon Rules | 12 | 7 |
| E | Selling & Leasing Procedures | 20 | 1 |
| F | Prohibitions | 13 | 3 |
| G | Compensation Rules | 5 | 2 |
| H | IDX/VOW/Frontend Display | 12 | 7 |
| J | Listing Status Types | 9 | -- |
| K | New Development / RUNDBA | 10 | 1 |
| L | Owner Opt-Out Form | 6 | 6 |
| M | Penalties & Fines | 17 | -- |
| N | Enforcement & Complaints | 8 | 0 |
| O | Suspended/Terminated Agents | 2 | 1 |
| P | Key Definitions | 13 | -- |
| **TOTAL** | | **159** | **42** |

### 7 Exhibits

| Exhibit | Form | When Required |
|---------|------|---------------|
| A | Mandatory Listing Fields | Every listing — defines required data |
| B | Owner Opt-Out Form | When owner opts out of RLS distribution |
| C | Listing Data Compliance Policy (Feb 2025) | Governs data violation procedures |
| D | RUNDBA (New Development Brokerage Agreement) | New development listings |
| E | Change of New Development Brokerage/Sales Office Form | Changing new dev broker |
| F | RLS Appeals Process | Appealing violations/fines |
| G | Coming Soon Owner Authorization | Before Coming Soon status |

### Penalty Escalation

| Violation | 1st | 2nd | 3rd | 4th+ |
|-----------|-----|-----|-----|------|
| Fair Housing | $250 | $500 + RLS termination | -- | -- |
| Data Quality | $0 | $250 | $250 | Termination |
| Incurable (e.g., advertising opted-out property) | $250 | $500 subsequent | -- | -- |
| General UCBA violation | $500 | $2,000 | $10,000 | Suspension |
| Quarterly >5% rejection rate | **$10,000** | -- | -- | -- |
| 3 quarterly fines in a year | **30-day RLS suspension** | -- | -- | -- |

### 11 Content Restrictions

| # | Restriction | UCBA Ref |
|---|-------------|----------|
| R1 | No agent info in descriptions | Art. I, Sec. 5(C) |
| R2 | No "Off-Market" language | Art. I, Sec. 5(D) |
| R3 | No compensation in descriptions | Art. I, Sec. 5(E) |
| R4 | No "free services" claims | Art. III, Sec. 5 |
| R5 | Fair Housing compliance | Exhibit C |
| R6 | No seller/buyer identity | Art. III, Sec. 2 |
| R7 | Data accuracy required | Art. III, Sec. 4 |
| R8 | 24-hour update SLA | Art. I, Sec. 6 |
| R9 | Commission negotiability disclosure | Art. I, Sec. 17 |
| R10 | Statistical data disclaimer | Art. VIII, Sec. 4 |
| R11 | No reproduction / bulk copy | Art. VIII, Sec. 4 |

### Key 2026 Changes

| Change | Article | Detail |
|--------|---------|--------|
| **DOM for Exclusive Listings** | Art. I, Sec. 11 | "Participant Only Network" and "Coming Soon" listings do NOT accrue days on market until status/permission changes |
| **DOM Reset Threshold** | Art. I, Sec. 11 | Withdrawn/Cancelled reset reduced from **90 days to 30 days** |
| **Seller's Agent Disclosure** | Art. II, Sec. 11 | Must verify offer transmission to seller upon request; disclosure required even for single offers |
| **Owner Opt-Out Submission** | Exhibit B | No longer by email — must submit through LMP with the Exclusive Listing |
| **RUNDBA (Buyer Rep)** | Exhibit D | 60-day purchase agreement requirement eliminated; commissions confirmed fully negotiable |
| **Related Entities** | Art. II, Sec. 13 | "Or any such related entity" added to termination procedures |

### Already Implemented in Codebase

| Rule | Implementation |
|------|---------------|
| DOM reset at 30 days | `lib/compliance/dom-tracker.ts` (`DOM_RESET_DAYS=30`) |
| DOM suppression for Participant Only / Coming Soon | `isDomSuppressedByPermissions()` |
| 6 distribution gates (fail closed) | `lib/idx/trestle-mapper.ts` (`checkDistributionGates()`) |
| Fair Housing scanner | `lib/compliance/rls-enforcement.ts` (19 patterns) |
| Content restrictions (R1-R3) | `assertRlsCompliantPayload()` on all write paths |
| Portal DTO (agent PII masking, address suppression) | `lib/compliance/dto.ts` |
| 24-hour closed listing enforcement | `app/api/cron/dom-reset/route.ts` (daily cron) |
| Commission negotiability disclosure | Required in listing/buyer agreements |

---

## Compliance Checklist (must pass before deploy)

See: [`compliance/pii-and-distribution-checklist.md`](compliance/pii-and-distribution-checklist.md)

Covers: No hardcoded PII, no PII in URLs, six distribution gates (server-side), viewer file safety, Fair Housing compliance (Federal + NY State + NYC), REBNY attribution requirements.

Full compliance library (14 documents): [`compliance/README.md`](compliance/README.md)

---

## Verify Backend Connection (60-second check)

**Public path:**
```
GET /api/listings?limit=5
```
- Must return real listing keys/IDs
- Must NOT include agent email/phone in public shape
- Must include `_compliance.attribution`

**CRM private path (requires login):**
```
GET /api/idx/search?type=sale&minPrice=1000000
```
- Must return results only when session is valid
- Returns 401/403 when unauthenticated

---

## Executive Summary (3 Pillars)

### 1) Compliance by Design
- Required notices and SOPs
- Lawful advertising and listing display rules
- Fair housing safeguards
- Consented lead capture
- Immutable audit trails

### 2) Superior Consumer Experience
- Fast, mobile-first UX
- Accessible (WCAG 2.1 AA)
- Deep inventory with map, commute, and school layers
- Instant scheduling and transparent documentation
- Multilingual support
- Core Web Vitals performance targets

### 3) Revenue & Operations Engine
- Automated lead routing and CRM intake
- Consent-aware email/SMS nurturing
- Listing syndication controls
- Analytics and attribution
- Offers, disclosures, e-sign, commissions, reporting

---

## Immediate Cleanup & MVP Lock (Required)

This repository is being consolidated into **one coherent system**.  
**We are not restarting the project. We are removing ambiguity.**

---

### 1) Repository Cleanup (Clean Slate Without Restarting)

To eliminate breakage, routing conflicts, and accidental imports, the following rules are mandatory.

#### Delete or Quarantine
- Move `frontend/` → `archive/frontend-legacy/` (or delete if unused)
- Delete all:
  - `backup_*` directories
  - `*.bak` files
- Remove any duplicate or legacy application roots
- Ensure **no legacy `pages/` router** is active in the build path

#### Active Next.js Build Path (Strict)

---

## Compliance Requirements

*(See internal compliance documentation for full details.)*

---

## Listings: Types, Visibility, Distribution

*(Listing type definitions, visibility rules, and syndication controls to be documented here.)*

---

## Development Setup

### Prerequisites
- Node.js 20.x
- PostgreSQL 15+
- npm (comes with Node.js)

### Local Development (Fresh Start)

```bash
# 1. Clone the repository
git clone https://github.com/mallan67/mallan-nyc.git
cd mallan-nyc

# 2. Install dependencies (runs prisma generate automatically)
npm ci

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your database credentials

# 4. Start PostgreSQL (if using Docker)
docker run -d --name mallan-postgres \
  -e POSTGRES_USER=dev_user \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_DB=mallan \
  -p 5432:5432 \
  postgres:15

# 5. Push schema to database
npx prisma db push

# 6. Start development server
npm run dev
```

---

## Architecture

### Topology (Current)

```
Vercel (mallan.nyc)
  public/crm/                      app/api/
  ├── login.html          ──→     ├── auth/login
  ├── CRM (FINAL2.html)   ──→     ├── crm/*
  ├── index-built.html     ──→     ├── crm/listings
  ├── SALE-FORM-WITH-TOOLS ──→     ├── crm/listings/[id]
  └── RENTAL-FORM-WITH-TOOLS ──→   └── portal/*
```

- **CRM Mockups:** `https://mallan.nyc/crm/` (same-origin static files)
- **API:** `https://mallan.nyc/api/` (Vercel, Next.js 16.1.6 App Router)
- **Database:** PostgreSQL on Neon (Prisma ORM)
- **Auth:** httpOnly cookie only (`session_token`, SameSite=Lax, Secure)

### Auth (Cookie Only)

All auth is cookie-only (Bearer token auth fully removed in Sprint 10).

1. Login sets an HttpOnly session cookie (`session_token`)
2. All requests authenticate via cookie only
3. CORS is same-origin in production (localhost origins allowed in dev only)

### API Endpoints (42 total)

#### Auth (7)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Login, sets httpOnly session cookie |
| `/api/auth/logout` | POST | Destroy session, clear cookie |
| `/api/auth/me` | GET | Current user from session cookie |
| `/api/auth/agent/register` | POST | Broker creates agent |
| `/api/auth/invite` | POST | Generate portal invite (sends email) |
| `/api/auth/invite/[token]` | GET/POST | Client accepts portal invite |
| `/api/auth/change-password` | POST | Authenticated password change |

#### CRM Data (17)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/crm/listings` | GET/POST | List + create listings |
| `/api/crm/listings/[id]` | GET/PATCH/DELETE | Get, update, soft-delete listing |
| `/api/crm/listings/[id]/status` | PATCH | Status state machine |
| `/api/crm/listings/[id]/validate` | POST | Dry-run compliance validation |
| `/api/crm/listings/[id]/photos` | POST | Photo metadata |
| `/api/crm/agents` | GET/POST | List + create agents (broker-only) |
| `/api/crm/agents/[id]` | PATCH/DELETE | Update + deactivate agent |
| `/api/crm/clients` | GET/POST | List + create clients |
| `/api/crm/clients/[id]` | GET/PATCH | Get + update client |
| `/api/crm/clients/[id]/invite` | POST | Portal invite |
| `/api/crm/clients/[id]/preferences` | PUT | Upsert preferences |
| `/api/crm/clients/[id]/actions` | POST | Record listing reaction |
| `/api/crm/deals` | GET/POST | List + create deals |
| `/api/crm/deals/[id]` | GET/PATCH | Get + update deal |
| `/api/crm/deals/[id]/status` | PATCH | Deal status machine |
| `/api/crm/showings` | GET | List showings |
| `/api/crm/showings/[id]` | PATCH | Confirm/cancel/reschedule |

#### Saved Searches (4)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/crm/saved-searches` | GET/POST | List + create |
| `/api/crm/saved-searches/[id]` | GET/PATCH/DELETE | CRUD |
| `/api/crm/saved-searches/[id]/execute` | POST | Run criteria against DB |

#### Email (2)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/crm/email` | POST | Send email (template or custom) |
| `/api/crm/email/bulk` | POST | Bulk listing alerts (broker-only, 50/hr) |

#### Portal — Client-Facing (5)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/portal/me` | GET | Client profile |
| `/api/portal/listings` | GET | Shared listings (agent info masked for buyers) |
| `/api/portal/listings/[id]/react` | POST | Like/dislike/discuss/schedule toggle |
| `/api/portal/showings` | GET/POST | List + request showings |
| `/api/portal/offers` | GET | Incoming offers (seller/landlord) |

#### Media (2)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/media/proxy` | GET | Server-side proxy for Trestle media URLs (Bearer auth added server-side, 7-day CDN cache) |
| `/api/crm/listings/[id]/media/upload` | POST | Agent photo upload (Sharp optimization → R2, EXIF/GPS stripped, 3 WebP variants) |

#### IDX/Trestle (3)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/idx/search` | GET | CRM search — agent/broker only, full listing data with proxied media URLs |
| `/api/idx/sync` | POST | Manual sync trigger (broker-only, rate-limited) |
| `/api/idx/status` | GET | IDX connection status + sync stats |

### Media Pipeline

**4 media types supported:** Photos, Floor Plans, Videos, Virtual Tours (3D/Matterport)

- **Trestle photos** require Bearer auth — browser `<img>` tags cannot send auth headers
- **Server-side proxy** (`/api/media/proxy`): fetches from Trestle with Bearer token, serves to browser
- **CDN cache:** 7 days + `immutable` flag (first load proxied, subsequent loads instant from CDN)
- **Allowlist:** Only `api.cotality.com`, `api-trestle.corelogic.com`, `api-prod.corelogic.com` domains
- **Agent uploads:** Multipart form → Sharp (EXIF/GPS stripped, WebP, 3 variants: hero 1600px, card 800px, thumb 400px) → Cloudflare R2
- **Rate limit exemption:** `/api/media/proxy` is exempt from the 30/min API rate limit (50+ images per page load is normal)

**Media type classification** (from Trestle `MediaCategory` field):
- `Photo` → cached to R2, displayed in photo carousel
- `Floor Plan` → cached to R2, displayed in dedicated Floor Plan tab
- `Video` → rendered as `<video>` tag (direct files) or `<iframe>` (YouTube/Vimeo/Wistia embeds)
- `Virtual Tour` → rendered as `<iframe>` with `xr-spatial-tracking` (Matterport, etc.)

**Virtual tour sources** (priority order):
1. `VirtualTourURLUnbranded` field on Property resource (RESO standard)
2. Media resource items with `MediaCategory = 'Virtual Tour'` (fallback)

### Security

- **CORS:** Same-origin in production; `http://localhost:3000`, `http://localhost:5500` in dev only
- **Rate Limiting:** 30 req/min API, 120 req/min pages, 5/min login attempts (per IP)
- **IDX Sync:** 1 call per 5 minutes
- **Bot Blocking:** 30+ known scraper/AI bots blocked at edge
- **Session:** DB-backed, 24hr expiry, auto-rotate within 1hr of expiry
- **Audit:** All mutations logged to AuditEvent table
- **CSP:** Content Security Policy via `vercel.json` (includes `api.cotality.com` + legacy Trestle domains in `img-src`/`connect-src` for migration — legacy domains removable after March 31, 2026)
- **Vulnerabilities:** 0 (npm audit clean as of 2026-03-05)

---

## Last Work Completed

- **2026-03-07:** Media pipeline fix — VirtualTour items no longer leak into photo carousel, videos render as `<video>` tag for direct files (iframe for YouTube/Vimeo), virtual tour fallback from Media resource when `VirtualTourURLUnbranded` is empty.
- **2026-03-06:** CRM mock data cleanup — removed ALL fake names, stats, prices, addresses from rendered HTML. See [CRM Mock Data Cleanup](#crm-mock-data-cleanup-2026-03-06) below. Commit `5638ef05` (-1,068 lines net).
- **2026-03-06:** CRM navigation fixes — showTab null guard, agent blocked tab redirect, auth redirect preserves hash, sessionStorage tab persistence, portal tab restore. Restored 3 tab UIs (exclusives, in-contract, sold).
- **2026-03-06:** CSP fix — added `api.cotality.com`, `api-trestle.corelogic.com`, `api-prod.corelogic.com` to `img-src` and `connect-src` in both global and CRM CSP headers (`vercel.json`). Prevents image/fetch blocks after Trestle/Cotality API migration (deadline March 31, 2026). Legacy domains removable after deadline.
- **2026-03-05:** Upgraded Next.js 14 → 16.1.6. Created server-side media proxy for Trestle photos (Bearer auth). Added agent photo upload pipeline (Sharp → R2). Security audit: removed env exposure from `/api/health` and `/api/ai/env-check`, removed hardcoded seed passwords, removed vulnerable `xlsx` package. npm audit: 0 vulnerabilities.
- **Sprint 10 (2026-03-02):** Security hardening — Bearer auth fully removed (cookie-only), RLS enforcement on all write paths, DOM tracking (UCBA 2026), portal DTO centralized.
- **Sprint 10 (2026-03-01):** Moved CRM mockups to `public/crm/` for same-origin serving on Vercel. Redesigned login page. Fixed `DATABASE_URL` env var. Removed exposed Google Maps API key from source. Added `/crm/*` CSP headers and noindex directives.

---

## CRM Mock Data Cleanup (2026-03-06)

> **Commit:** `5638ef05` | **Net change:** -1,068 lines (1,054 insertions, 2,122 deletions)
> **File:** `public/crm/MALLAN-NYC-CRM-FINAL2.html`
> **Principle:** Remove fake DATA values only. Preserve ALL UI structure (divs, tables, buttons, headers, icons, CSS). Add IDs for future API population.

### What Was Cleaned (4 sessions, ~60 sections)

#### Session 1 — Core tabs (agent dashboard, client profile, comms, revenue)
| Section | What was cleaned |
|---------|-----------------|
| agent-dashboard | Today's Schedule, Sent Emails, Recent Activity → empty states |
| client-profile header | cpName, cpType, cpStage, cpEmail, cpPhone → "--" with IDs |
| client-profile stats | cpSent, cpToured, cpOffers, cpLiked, cpDays, cpInteractions → "–" |
| cp-overview | Contact Details, Financial Profile, Recent Activity → "--" with IDs |
| cp-search-criteria | 9 fake criteria values → "--" with IDs |
| cp-sent-listings | 5 fake rows → empty state `id="cpSentListingsBody"` |
| cp-activity-log | 5 fake entries → empty state `id="cpActivityLog"` |
| cp-documents | 3 fake docs → empty state `id="cpDocumentsList"` |
| cp-notes | 2 fake notes → empty state `id="cpNotesList"` |
| communications | 2 fake entries + weekly stats → empty states with IDs |
| matches | Fake "John & Sarah Miller" 95% match → empty state `id="matchesContainer"` |
| revenue | Stats ($287K/$124K/$24K/$411K) + chart + breakdown → "–" with IDs |
| commissions | Stats + payment requests + recent → empty states with IDs |
| sent-properties | Fake row → empty state `id="sentPropertiesBody"` |
| broker-portal | 6 fake listing cards → empty state + template comment |
| agent-management | Stats, listings, commission tables, disclosure tables → empty states with IDs |
| portal indicator | "John & Sarah Miller" → empty string |

#### Session 2 — Compliance, calendar, payouts (background agents)
| Section | What was cleaned |
|---------|-----------------|
| compliance deadlines | 3 fake entries → empty state `id="compliance-deadlines-list"` |
| data quality monitor | Fake 47/1/2.1% stats → "–" with IDs |
| fair housing scanner | Fake scan result → empty state `id="fh-scan-result"` |
| distribution gate matrix | 6 fake listing rows → empty state `id="distribution-gate-tbody"` |
| compliance events | 6 fake audit entries → empty state `id="compliance-events-list"` |
| pending submissions | Fake "2 awaiting" → 0 with IDs |
| upload approvals | Fake "3 Pending" → 0 with IDs |
| compliance checklist | 12× "Last checked: Today" → "Last checked: --" |
| document counts | Fake 12/15 → "–" with IDs |
| trophy listings | "4 Trophy Properties/$340M" → 0/-- with IDs |
| ultra-luxury, NDA, UHNW | Fake counts → 0 with IDs |
| saved searches | 2 fake entries → empty state `id="savedSearchesList"` |
| customer searches | 2 fake entries → empty state `id="customerSearchesList"` |
| last search | Fake "Manhattan Condos" → empty state `id="lastSearchPanel"` |
| master analytics KPIs | $4.2M/42/97.2%/4.9 → $0/--/--/-- with IDs |
| customer analytics | 87/34/2.4h/18.4% + funnel + distribution → 0 with IDs |
| deal analytics | KPIs, revenue by quarter, pipeline conversion, type breakdown → empty states |
| recent closed deals | 5 fake rows → empty state `id="recentClosedDealsBody"` |
| agent leaderboard | 3 fake rows → empty state `id="agentLeaderboardBody"` |
| payout summary | 4 cards with fake amounts → $0 with IDs |
| payout history | Fake row → empty state `id="payoutHistoryBody"` |
| rental/vendor invoices | Fake rows → empty states with IDs |
| agent/vendor W-9s | Fake rows → empty states with IDs |

#### Session 3 — Remaining fake names (landlord portal, referrals, dropdowns)
| Section | What was cleaned |
|---------|-----------------|
| landlord portal | Applications (Sarah Johnson, Emily Watson, Demo Agent F) → "--" |
| landlord portal | Lease docs, e-sign status, showing log, send lease → "--" / generic |
| analytics 1099 table | Jane Doe row + $912K → empty state `id="analytics1099Body"` |
| lead assignment dropdown | 4 fake agents → roster comment `id="leadAssignAgent"` |
| referral agent dropdown | 4 fake agents → roster comment (refOurAgent) |
| referrals received | Compass/Sarah Johnson row + $205K → empty state `id="refReceivedBody"` |
| referrals given | BHS/David Lee row → empty state `id="refGivenBody"` |
| agent-management filters | Sarah Chen/David Park → roster comment |
| activity timeline names | Sarah Chen, David Park, Jennifer Rodriguez, Mark Thompson → "--" |
| knowledge base | Sarah Chen kc-agent → "--" |
| audit log names | Sarah Chen + Lisa Park → "--" |
| mockListings JS | Demo Brokerage A/B/C → "--" |

#### Session 4 — All-listings table, kanban pipeline, activity timeline
| Section | What was cleaned |
|---------|-----------------|
| all-listings: 8 stat cards | 284/142/28/16/64/12/22/3 → "–" with IDs `allListStat*` |
| all-listings: listing count | "284 listings" → "– listings" `id="allListingsCount"` |
| all-listings: 8 table rows | 8 fake rows (Unsplash + addresses) → empty state `id="allListingsTableBody"` |
| all-listings: pagination | Fake page buttons → empty `id="allListingsPagination"` |
| activity timeline | 13 fake entries (3 day groups) → empty state `id="activityTimelineEntries"` |
| kanban: 6 columns | Draft(2), Coming Soon(1), Active(5), Offer(1), In Contract(2), Closed(1) → all empty with IDs |

### What Was NOT Cleaned (intentionally preserved)

| Category | Reason |
|----------|--------|
| **Client portals** (buyer, tenant, seller, landlord) | 59 Unsplash images + fake listing cards — requires portal UI redesign |
| **JS `_BUYER_CARD_DATA` / `_TENANT_CARD_DATA`** | Portal card rendering arrays — functional, not displayed without portal |
| **JS `CLIENT_DATA`** | Gated behind `_isCrmDevMock` (localhost + `?mock=true` only) |
| **JS external brokerage lookup** | Mock agent data for referral form auto-fill — functional |
| **JS building data** | Building lookup table — functional |
| **Audit log tab** | Fake entries with addresses — PLACEHOLDER tab (Coming Soon) |
| **Building permits tab** | Fake building entries — PLACEHOLDER tab |
| **Marketing hub tab** | Fake campaign content — PLACEHOLDER tab |
| **Input placeholders** | Example text in search fields — not data |
| **2 HTML comments** | `<!-- Jane Doe -->` — not rendered |

### CRM Tab Classification

#### WIRED (9 tabs — connected to API, load real data)
| Tab | API Source |
|-----|-----------|
| my-listings | `MallanAPI.listings.*` — full CRUD |
| pipeline | `MallanAPI.deals.*` — deal pipeline board |
| exclusives | `_lmListings` (from my-listings API) — filtered |
| in-contract | `_lmListings` filtered to Pending/ActiveUnderContract |
| sold | `/api/crm/past-deals` |
| matches | `MallanAPI.matches.*` |
| deal-pipeline | `MallanAPI.deals.*` |
| all-deals | `MallanAPI.deals.*` (broker only) |
| lead-distribution | `MallanAPI.leads.*` |

#### STATIC UI — Ready for API wiring (cleaned, IDs added)
| Tab | Status |
|-----|--------|
| agent-dashboard | Empty states with IDs — needs schedule/emails/activity API |
| client-profile | All fields have IDs — `openClientProfile()` partially wired |
| clients | Table wired to `loadClientsFromAPI()` |
| communications | Empty states with IDs — needs comm logging API |
| sent-properties | Empty state with ID — needs sent-properties API |
| revenue | Empty states with IDs — needs revenue analytics API |
| commissions | Form functional, tables empty — needs commission data API |
| broker-portal | Stats have IDs, listing grid empty — needs broker dashboard API |
| agent-management | Stats/tables have IDs — needs agent roster API enrichment |

#### PLACEHOLDER (Coming Soon / not built — ~35 tabs)
buyer-deal-flow, renter-checklist, knowledge-base, market-activity, feedback,
all-listings, activity-timeline, listing-pipeline, compliance, document-center,
trophy-listings, ultra-luxury, off-market, pocket-listings, nda-required,
uhnw-clients, my-searches, customer-searches, last-search, customers,
analytics-master, analytics-customer, analytics-deals, calendar, settings,
audit-log, agent-1099, referrals, building-permits, market-indices,
rebny-rules, marketing-hub, payouts, agent-commission-splits, mkt-campaigns

#### CLIENT PORTALS (demo UI — Unsplash images remain)
client-portal, tenant-portal, seller-portal, landlord-portal

### Known Issues (Still Present)
1. **~44 alert() stubs** — placeholder handlers not wired to API
2. **~35 "Coming Soon" placeholders** — sections with placeholder content
3. **Flash on portal refresh** — broker-portal briefly visible before switchPortal fires (~200ms)
4. **71 Unsplash placeholder images** — mostly in client portals (59) and JS portal card data
5. **Fake addresses in placeholder tabs** — audit log, building permits, marketing hub (Coming Soon tabs)

---

## Sprint Progress

### Sprint 9 — Wire Mockups to Live Backend (2026-03-01)

**Completed:**
- Cookie-only auth on all API routes (Bearer removed in Sprint 10)
- `login.html` created: email/password, auto-redirect if already logged in
- Auth gates on CRM, both viewers, and search (redirect to login if unauthenticated)
- Mock data removed from production paths
- RLS validator: 0 UNKNOWN, 10/10 sections pass
- TypeScript: 0 errors

### Sprint 8 — Viewer Conversion + Quick Wins (2026-03-01)
- Both WITH-TOOLS files converted to true read-only viewers (VIEWER_MODE=true)
- 5 missing REBNY fields added, Gates 4+5 in search
- 101 alert() calls converted to showToast()

### Sprint 7 — Integration, Email & IDX (2026-03-01)
- SendGrid email integration (5 templates)
- Saved Searches CRUD + Execute
- Complete IDX/Trestle pipeline (448-field mapper, OAuth2, sync orchestrator)

### Sprint 6 — Client Management & Portal Wiring (2026-03-01)
- 6 client CRUD endpoints, 6 portal endpoints, agent roster write API
- Showing management, CRM mockup wired to all endpoints
- PII cleanup: 112→0 hardcoded occurrences across all files

### Sprint 5 — Write Operations (2026-03-01)
- 8 write endpoints (listings, deals)
- Form submissions wired to API with localStorage fallback

### Sprint 4 — Authentication & Session Foundation (2026-03-01)
- Prisma schema, auth library, 7 auth endpoints
- Session cookie auth, middleware protection
- Seed script, api-client.js bridge module

---

## Development Setup

### Prerequisites
- Node.js 20.x
- PostgreSQL 15+ (or Neon free tier)
- npm (comes with Node.js)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/mallan67/mallan-nyc.git
cd mallan-nyc

# 2. Install dependencies (runs prisma generate automatically)
npm ci

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your database credentials

# 4. Run database migration + seed
npx prisma migrate deploy
npx prisma db seed

# 5. Start development server
npm run dev
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection (pooled) |
| `DIRECT_URL` | Yes | PostgreSQL connection (unpooled, for migrations) |
| `SENDGRID_API_KEY` | Yes | Email sending |
| `SENDGRID_FROM_EMAIL` | Yes | Sender address |
| `PRIVATE_COLLECTION_PASS` | Yes | Legacy admin auth |
| `IDX_ENABLED` | No | Enable Trestle/IDX fetch (`true`/`false`, default `false`) |
| `TRESTLE_API_URL` | No | Trestle API base URL (`https://api.cotality.com/trestle`) |
| `IDX_CLIENT_ID` | No | Trestle OAuth client ID |
| `IDX_CLIENT_SECRET` | No | Trestle OAuth client secret |
| `R2_ACCOUNT_ID` | No | Cloudflare R2 account ID (for photo uploads) |
| `R2_ACCESS_KEY_ID` | No | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | Cloudflare R2 secret key |
| `R2_BUCKET_NAME` | No | Cloudflare R2 bucket name |
| `R2_PUBLIC_URL` | No | Cloudflare R2 public URL for serving images |

### Compliance Validation

```bash
# Run RLS compliance validator against mockup files
npm run rls:validate

# Run RLS validator tests (42 assertions)
npm run test:rls
```
