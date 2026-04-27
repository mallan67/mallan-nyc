# Mallan Real Estate Inc. — New York City Brokerage Platform  
**Compliance-First · Fast · Scalable**

**Status:** Active Development · **Live Production** (mallan.nyc on Vercel)
**Jurisdiction:** New York State / NYC
**Data Feed:** REBNY RLS via Trestle/Cotality — **IDX Plus** license (902 IDX Plus fields across 7 resources; 12 total Trestle data resources). IDX feed powers public display + internal CRM + reporting (REBNY confirmed 2026-03-27). IDX-eligible inventory only — not full-market search.
**Policies:** NY DOS Advertising · REBNY RLS Display Rules · Fair Housing · TCPA/CTIA · CAN-SPAM · NY SHIELD · WCAG 2.1 AA

---

## What This Product Is

Mallan NYC is a **compliance-first New York brokerage platform** designed to support public listing search, lawful lead capture, and internal brokerage operations. The system prioritizes regulatory safety, performance (Core Web Vitals), accessibility (WCAG 2.1 AA), and a clean architecture that can scale without fragmentation.

This repository is the **single source of truth** for the Mallan NYC brokerage platform.

---

## 🗄️ DB / Neon / Prisma Work — READ `NEON.md` FIRST

**Before any commit that touches `prisma/schema.prisma`, `prisma/migrations/`, `vercel.json`, `lib/prisma*`, or `lib/idx/sync.ts`:**

Read [`NEON.md`](./NEON.md) at the repo root. It documents:

- Tier caps (Free: 500 MB storage, 191.9 compute-hours/month)
- The required migration pattern (nullable only, one-per-PR, dual-write)
- Why the `buildCommand` does NOT run `prisma migrate deploy`
- The pre-flight checklist (run `npm run ops:health`, apply migration manually, validate)

A `pre-commit` + `commit-msg` git hook blocks commits touching these files unless:
1. The commit message contains `[neon-preflight: OK]`
2. `npm run ops:health` was run within the last 60 minutes

Install the hooks once: `npm run hooks:install`

---

## 🚨 Compliance & Legal Requirements (READ FIRST)

> **This repository handles licensed MLS / IDX data.**  
>  
> All contributors, contractors, automations, and AI systems interacting with this codebase **must comply** with the rules below.  
> Violations may expose the brokerage to **immediate suspension and liquidated damages up to $40,000**.

---

## 📌 MLS / IDX DATA COMPLIANCE (REBNY RLS — IDX Plus)

### Overview
This project integrates **REBNY Residential Listing Service (RLS) data via the IDX Plus feed** under a broker-direct license held by **Mallan Real Estate Inc**. The system migrated to **IDX Plus** (from standard IDX) via Trestle/Cotality, providing **902 IDX Plus fields across 7 REBNY-specified resources** (Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39). Trestle exposes **12 total data resources** including 5 additional beyond the IDX Plus spec: PropertyRooms, Teams, TeamMembers, PropertyGreenVerification, and Building. All use of MLS/IDX data must comply with REBNY RLS rules, RESO standards, the Fair Housing Act, and New York State real estate advertising law.

Non-compliance exposes the brokerage to immediate suspension and liquidated damages up to $40,000.

---

### Allowed Use (REBNY Confirmed 2026-03-27)
- MLS/IDX data may be accessed **only via authorized server-side connections** using credentials issued through Trestle/Cotality.
- IDX data may be used for: **(1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting** — confirmed by REBNY (Michaela Parker, mparker@rebny.com, 2026-03-27).
- IDX feed is limited to the **IDX-released field set and IDX-eligible listing inventory only** — it is NOT full-market search. Agents use RealPlus for full RLS inventory.
- Client data stays on mallan.nyc — never passes through RealPlus or third parties.
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

## IDX Plus / Trestle (REBNY RLS) — Rules of the Road

> **Migration Note (2025):** REBNY migrated from Perchwell to Trestle/Cotality (formerly CoreLogic) in February 2025. The Trestle API endpoint migrated from `api-trestle.corelogic.com` to `api.cotality.com/trestle`. This platform uses the **IDX Plus - WebAPI** license (Trestle-11371-20) for **public display, internal CRM client management, and reporting** (REBNY confirmed 2026-03-27). The IDX feed provides IDX-released fields and IDX-eligible inventory only — it is NOT full-market search. RealPlus is the LMP for listing submission and full RLS search — REBNY does not grant LMP licenses to individual brokers. mallan.nyc reads 902 IDX Plus fields across 7 REBNY-specified resources plus additional Trestle-provisioned fields (1,457 total Property definitions in live metadata).

### Environment Variables (server-only)

```
IDX_ENABLED=true|false
TRESTLE_API_URL=https://api.cotality.com/trestle
IDX_CLIENT_ID=...
IDX_CLIENT_SECRET=...
```

**Never expose credentials to the browser.** All Trestle calls are server-side only (`lib/idx/fetch.ts`).

> **API Migration Complete:** Old Trestle URLs (`api-trestle.corelogic.com`, `api-prod.corelogic.com`) are deprecated. All calls use `api.cotality.com/trestle`. Media proxy allowlists all 3 domains during transition (legacy domains removable after March 31, 2026).

### Public vs CRM Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/listings` | Public (rate-limited 60/min) | Frontend search — sanitized via `toPublicDTO()`, all 6 distribution gates enforced |
| `GET /api/listings/suggest` | Public (rate-limited 60/min) | Address autocomplete — distribution gates enforced, no agent PII |
| `GET /api/idx/search` | Session cookie required | CRM search — agent/broker only, broader field set. IDX-eligible inventory only (not full-market — agents use RealPlus for full RLS) |

### REBNY Distribution Gates (fail closed)

All gates are enforced server-side. UI may only display outcomes, never bypass gate logic.

| Gate | Field | Rule |
|------|-------|------|
| 1. Owner Opt-Out | `OwnerOptOutYN` | If true, exclude from all public feeds |
| 2. Participant Only | `ParticipantOnlyYN` | If true, exclude from IDX/VOW |
| 3. Internet Display | `InternetEntireListingDisplayYN` | If false, exclude from IDX/internet display |
| 4. Address Display | `InternetAddressDisplayYN` | If false, suppress address and coordinates |
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
- **902 IDX Plus fields** across 7 REBNY-specified resources (Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39), 41 required, 86 conditional
- **5 additional Trestle resources** beyond IDX Plus: PropertyRooms (39 fields), Teams (48), TeamMembers (29), PropertyGreenVerification (39), Building (key only)
- **Critical fields beyond IDX Plus CSV** on Trestle Property: `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `ShowingInstructions` — all distribution gate / showing fields
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

- **CRM Backend:** `https://mallan.nyc/crm/` (same-origin static files)
- **API:** `https://mallan.nyc/api/` (Vercel, Next.js 16.1.6 App Router)
- **Database:** PostgreSQL on Neon (Prisma ORM)
- **Auth:** httpOnly cookie only (`session_token`, SameSite=Lax, Secure)

### Auth (Cookie Only)

All auth is cookie-only (Bearer token auth fully removed in Sprint 10).

1. Login sets an HttpOnly session cookie (`session_token`)
2. All requests authenticate via cookie only
3. CORS is same-origin in production (localhost origins allowed in dev only)

### API Endpoints (75+ total)

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

#### CRM Analytics & Tools (32 routes — Systems G-Q)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/crm/demand` | GET/POST | Demand indices — list + trigger collection |
| `/api/crm/demand/[neighborhood]` | GET | Neighborhood demand detail |
| `/api/crm/demand/alerts` | GET/POST | Agent demand alerts |
| `/api/crm/demand/heatmap` | GET | All neighborhoods for heatmap viz |
| `/api/crm/demand/stats` | GET | Aggregate demand stats |
| `/api/crm/intent/profiles` | GET | Buyer intent profiles (agent-scoped) |
| `/api/crm/intent/profiles/[id]` | GET/POST | Intent profile detail + recompute |
| `/api/crm/intent/events` | POST | Record behavioral event |
| `/api/crm/intent/recommendations/[id]` | GET | Personalized listing recommendations |
| `/api/crm/intent/stats` | GET | Intent aggregate stats |
| `/api/crm/performance` | GET | Performance indices (anonymized for agents) |
| `/api/crm/performance/[id]` | GET | Agent performance detail |
| `/api/crm/performance/leaderboard` | GET | Ranked leaderboard |
| `/api/crm/performance/stats` | GET | Performance stats (broker-only) |
| `/api/crm/cma` | GET/POST | CMA reports — list + create |
| `/api/crm/cma/[id]` | GET/PATCH | CMA report detail + update |
| `/api/crm/showings/[id]/feedback` | GET/POST | Showing feedback — get + submit |
| `/api/crm/notifications` | GET/POST/PATCH | Notifications — list, create, mark read |
| `/api/crm/notifications/preferences` | GET/PUT | Notification preferences |
| `/api/crm/documents` | GET/POST | Document vault — list + upload |
| `/api/crm/documents/[id]` | GET/PATCH | Document detail + status update |
| `/api/crm/documents/[id]/signatures` | POST | Record signature |
| `/api/crm/market-pulse` | GET | Market snapshots by neighborhood |
| `/api/crm/market-pulse/[neighborhood]` | GET | Neighborhood market detail + history |
| `/api/crm/market-pulse/stats` | GET | Market aggregate stats |
| `/api/crm/lead-scoring` | GET | Lead scores list |
| `/api/crm/lead-scoring/[id]` | GET/POST | Lead score detail + rescore |
| `/api/crm/lead-scoring/assign` | POST | Auto-assign lead (broker-only) |
| `/api/crm/lead-scoring/rules` | GET/POST | Assignment rules (broker-only) |
| `/api/crm/lead-scoring/stats` | GET | Scoring stats |
| `/api/crm/commissions` | GET/POST | Commission payments — list + record |
| `/api/crm/commissions/[id]` | PATCH | Update payment status (broker-only) |
| `/api/crm/commissions/stats` | GET | Commission P&L stats |
| `/api/crm/listing-audit` | GET/POST | Listing audits — history + run audit |
| `/api/crm/listing-audit/[listingId]` | GET | Listing audit detail |

#### Media (2)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/media/proxy` | GET | Server-side proxy for Trestle media URLs (Bearer auth added server-side, 7-day CDN cache) |
| `/api/crm/listings/[id]/media/upload` | POST | Agent photo upload (Sharp optimization → R2, EXIF/GPS stripped, 3 WebP variants) |

#### IDX/Trestle (3)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/idx/search` | GET | CRM search — agent/broker only, broader field set with proxied media URLs (not guaranteed to match full RealPlus/LMP inventory) |
| `/api/idx/sync` | POST | Manual sync trigger (broker-only, rate-limited) |
| `/api/idx/status` | GET | IDX connection status + sync stats |

#### Cron Jobs (16)
| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/data-retention` | Daily 3am | NY SHIELD Act data cleanup (sessions, tokens, closed listings) |
| `/api/cron/dom-reset` | Daily 6am | Reset DOM for Withdrawn/Cancelled ≥30 days (UCBA 2026) |
| `/api/cron/idx-sync` | Every 4 hours | Incremental IDX listing sync from Trestle |
| `/api/cron/listing-expiration` | Daily 7am | UCBA protected period enforcement + notifications |
| `/api/cron/search-alerts` | Daily 7:30am | Saved search email alerts to clients |
| `/api/cron/seller-scoring` | Daily 8am | Batch re-score stale seller leads |
| `/api/cron/experiment-metrics` | Daily 9am | Pricing experiment aggregation + auto-conclude |
| `/api/cron/demand-signals` | Daily 10am | Demand heatmap reindex |
| `/api/cron/intent-profiles` | Daily 11am | Buyer intent profile recompute |
| `/api/cron/agent-metrics` | Weekly Mon 12pm | Agent performance reindex |
| `/api/cron/lead-scoring` | Daily 1pm | Lead score batch recompute |
| `/api/cron/conviction-scores` | Daily 2pm | Lead conviction scores + ghost detection |
| `/api/cron/listing-momentum` | Daily 3pm | Listing momentum scores for active listings |
| `/api/cron/social-proof` | Daily 4pm | Social proof cache for listings with activity |
| `/api/cron/lifecycle-triggers` | Daily 5pm | Evaluate lifecycle triggers (runs after momentum/conviction) |
| `/api/cron/market-snapshots` | Monthly 1st 6am | Neighborhood market snapshot computation |

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

#### ⚠️ TRESTLE MEDIA API RULES — VENDOR-CONFIRMED (2026-04-07)

> **DO NOT IGNORE — Direct CoreLogic/Trestle (Cotality) vendor guidance.**

| Rule | Detail |
|------|--------|
| **Use `ResourceRecordKey`, NOT `ResourceRecordID`** | `ResourceRecordID` can duplicate across MLOs. `ResourceRecordKey`/`ResourceRecordKeyNumeric` are always unique. Property.`ListingKey` = Media.`ResourceRecordKey`. DB column `mls_id` stores `ListingKey`. |
| **`Media/All` endpoint is DEPRECATED** | Filter the `/odata/Media` resource directly. Do not use `Media/All`. |
| **`Media.ModificationTimestamp`** | Source of truth for individual media row changes. Include in `$select` for change tracking. |
| **`Property.PhotosChangeTimestamp`** | High-level trigger — fires when ANY media for a listing changes. Use to decide which listings need media re-fetch. |

**All batch media queries in this codebase filter by `ResourceRecordKey` (with `ResourceRecordID` fallback only when `mls_id` is null). Enforced across 8 files: 7 production (`sync.ts`, `fetch.ts`, `card-fields.ts`, `media/batch/route.ts`, `agents/[slug]/listings/route.ts`, `idx/search/route.ts`, `import-closed-from-trestle.ts`) plus 1 utility script (`rebuild-past-deals.js`). Deep-audited 2026-04-07; debug-script clutter removed in 2026-04-27 cleanup.**

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

## Listing Detail Page — Feature Sections

The listing detail page (`app/listing/[id]/page.tsx`) displays property data in structured sections:

| Section | Data Source (Trestle IDX Plus) | Examples |
|---------|-------------------------------|----------|
| **Unit Features** | `InteriorFeatures` + unit-level `ExteriorFeatures` + Flooring/Laundry(unit)/Heating/Cooling | High Ceilings, Walk-In Closets, Balcony, Hardwood, In-Unit Washer |
| **Appliances** | `Appliances` | Dishwasher, Washer, Dryer, Range, Refrigerator |
| **Building Amenities** | `BuildingFeatures` + `AssociationAmenities` + `CommunityFeatures` + `SecurityFeatures` + `PoolFeatures` + `SpaFeatures` + building-level `ExteriorFeatures`/`LaundryFeatures` | Doorman, Elevator, Gym, Pool, Spa, Sauna, Steam Room, Children's Room, Roof Deck, Garden, Laundry |
| **Parking** | `ParkingFeatures` + `GarageSpaces` | Garage Access (separate from building amenities) |
| **Pet Policy** | `PetsAllowed` | Cats Ok, Dogs Ok (separate section — NOT in building amenities) |

**Key design rules:**
- Amenities are at **building level** via `BuildingFeatures` (comma-separated). Individual YN flags (DoormanYN, ElevatorYN, etc.) do NOT exist on the IDX Plus feed.
- Storage and Bike Room are **excluded** from building amenities display.
- Pets are **never** displayed as building amenities — always a separate Pet Policy section.
- Garage is **separate** from building amenities (not always included with building).
- Interior items like Sauna, Elevator, Storage are filtered out of Unit Features (they belong at building level).
- Building-level exterior features (Roof Deck, Garden, Courtyard) are moved to Building Amenities.
- Common Area / Common On Floor laundry goes to Building Amenities; In-Unit laundry stays in Unit Features.

**ACRIS fallback:** When Trestle has no closed sale data, the page queries NYC ACRIS public records (Socrata API) by borough/block/lot for last sale price.

---

## Where Data Comes From — Full Pipeline

> **Trestle API documentation:** https://trestle-documentation.corelogic.com/
> **Support:** trestlesupport@cotality.com | rlssupport@rebny.com / 212-616-5270

### Authentication

| Detail | Value |
|--------|-------|
| Grant type | OAuth2 Client Credentials |
| Token endpoint | `POST https://api.cotality.com/trestle/oidc/connect/token` |
| Parameters | `client_id`, `client_secret`, `grant_type=client_credentials`, `scope=api` |
| Token TTL | 28,800 seconds (8 hours) |
| Usage | `Authorization: Bearer {access_token}` on all API calls |
| Credentials stored | Server-only env vars (`IDX_CLIENT_ID`, `IDX_CLIENT_SECRET`) — NEVER in browser |

### API Base URL & OData Queries

```
Base:   https://api.cotality.com/trestle/odata/
```

| Operation | Syntax | Example |
|-----------|--------|---------|
| List | `GET /odata/{Resource}` | `/odata/Property?$top=100` |
| Filter | `$filter={Field} {op} '{value}'` | `$filter=MlsStatus eq 'Active'` |
| Select fields | `$select={Field1},{Field2}` | `$select=ListPrice,BedroomsTotal` |
| Expand related | `$expand={Resource}` | `$expand=CustomProperty,Media` |
| Expand with options | `$expand={Resource}($select=...;$top=...)` | `$expand=Media($select=MediaURL;$top=1;$orderby=Order)` |
| Pagination | `$top` + `$skip` or `@odata.nextLink` | `$top=1000&$skip=1000` |
| Aggregation | `$apply=groupby(...)` | OData aggregation extension |
| Replication mode | `Replication=true` | For datasets >1M records |
| Pretty enums | `PrettyEnums=true` | Human-readable enum values |

**Pagination:** Default 10 records per query, max 1,000 per page (300,000 for key-only queries). Use `@odata.nextLink` from response to auto-paginate.

### Rate Limits (Trestle)

| Quota Type | Per Hour | Per Minute |
|-----------|----------|-----------|
| WebAPI queries | 7,200 | 180 |
| Public media URL requests | 18,000 | 480 |

Response headers: `Minute-Quota-Limit`, `Hour-Quota-Limit`, `Hour-Quota-ResetTime` (Unix ms).

### 12 Trestle Data Resources — How Each Is Pulled

| # | Resource | Fields | How to Access | What It Provides |
|---|----------|--------|---------------|------------------|
| 1 | **Property** | 527 | `GET /odata/Property` | Core listing data — address, price, status, features, distribution gates |
| 2 | **CustomProperty** | 106 | `$expand=CustomProperty` on Property | REBNY-specific fields in `CustomFields` JSON string (41 fields: tax abatements, building rules, move-in costs, etc.) |
| 3 | **Member** | 72 | `GET /odata/Member` | Agent/broker info — name, license, office, contact |
| 4 | **Office** | 66 | `GET /odata/Office` | Brokerage office data — name, address, phone, MLS ID |
| 5 | **Media** | 46 | `$expand=Media` on Property OR `GET /odata/Media?$filter=ResourceRecordKey eq '{key}'` | Photos, floor plans, videos, virtual tours (3D/Matterport). `MediaCategory` classifies type. Bulk: `Property('{key}')/Media/All` (MIME multipart) |
| 6 | **PropertyUnitTypes** | 46 | `$expand=Units` on Property | Multi-unit buildings — unit-level bed/bath/rent/features |
| 7 | **OpenHouse** | 39 | `GET /odata/OpenHouse` | Scheduled open houses — date, time, type, remarks |
| 8 | **PropertyRooms** | 39 | `$expand=Rooms` on Property | Room-level detail — type, dimensions, features, floor |
| 9 | **Teams** | 48 | `GET /odata/Teams` | Agent team info — team name, lead, office |
| 10 | **TeamMembers** | 29 | `GET /odata/TeamMembers` | Team member relationships and roles |
| 11 | **PropertyGreenVerification** | 39 | `$expand=GreenVerification` on Property | Green certifications (LEED, EnergyStar, etc.) |
| 12 | **Building** | 1 (key) | `GET /odata/Building` | Key + navigation properties only. Building data lives on Property + CustomProperty |

### Metadata Discovery

```
GET /odata/$metadata    → Full OData CSDL (all entities, fields, types, navigation properties)
```

Local copy: `artifacts/metadata.xml` (32,351 lines, all 12 data + 5 system entities)

### Data Flow: Trestle → mallan.nyc

```
Trestle API (server-side only)
  │
  ├─→ /api/cron/idx-sync (every 4hrs) ─→ Prisma DB (PostgreSQL on Neon)
  │     Pulls Property + $expand=CustomProperty,Media
  │     Maps via lib/idx/trestle-mapper.ts (23 RESO→RLS renames)
  │     Checks 6 distribution gates → stores in Listing model
  │
  ├─→ /api/idx/search (CRM, on-demand) ─→ Direct Trestle query
  │     Agent-only, session cookie required
  │     Broader field set than public search (not guaranteed to match full RealPlus/LMP inventory)
  │
  ├─→ /api/listings (public, on-demand) ─→ DB-first (20-80ms)
  │     Falls back to Trestle direct (10s timeout) if not in DB
  │     Sanitized via toPublicDTO() — agent PII masked, gates enforced
  │
  └─→ /api/media/proxy (per-image) ─→ Trestle media URL + Bearer auth
        CDN cache: 7 days + immutable
        Browser <img> tags cannot send auth headers — proxy required
```

### Field Name Mapping

The REBNY UCBA and the Trestle API use different names for some fields:

| UCBA / REBNY Name | Trestle Field | Notes |
|--------------------|---------------|-------|
| `IDXEntireListingDisplayYN` | `InternetEntireListingDisplayYN` | No separate IDX field on Trestle — master gate serves both |
| `SyndicateYN` (boolean) | `SyndicateTo` (multi-select list) | Portal selection, not a simple boolean |
| `StandardStatus` | `MlsStatus` | Plus 22 other RESO→RLS renames in `trestle-mapper.ts` |

Internal TypeScript code uses UCBA names (mapped by normalizer before hitting Trestle). Compliance docs annotate the Trestle field name where they differ.

---

## CRM Search Page (`index-built.html`) — Architecture & Audit

> **File:** `public/crm/index-built.html` (~35,700 lines, monolithic)
> **Last audited:** 2026-03-20 — 172/172 smoke test PASS, 0 issues

### Components

| Component | Purpose |
|-----------|---------|
| **Search Form** | 3 tabs (Sale / Rental / Building) + Advanced filters. 15+ searchable fields. Address autocomplete, neighborhood multi-select via map modal |
| **Results** | 5 view modes: gallery, grid, summary, short summary, master-detail. Client-side pagination (25/page default). Bulk selection (max 25) |
| **Detail Panel** | Inline right sidebar. 5 tabs: Overview, Details, Building, Neighborhood, Media. Photo lightbox with thumbnail strip |
| **Map (Neighborhoods)** | MapLibre GL v4.7.1 + OpenFreeMap tiles (no API key). GeoJSON polygon click-to-select. Data: `/geo/rls-neighborhoods.v1.min.geojson` |
| **Map (Results)** | Split-view with price-pin markers. Color-coded by status. Popup with photo + View Details |
| **Photo Loader** | Lazy-load via IntersectionObserver. Batch fetch (max 50 per request, 100ms debounce). Endpoint: `/api/media/batch` |
| **Media Types** | Photos, Floor Plans, Video (YouTube/Vimeo/direct), Virtual Tour (Matterport/3D). Classified by `MediaCategory` from Trestle |
| **Reports** | Print, email, PDF generation. Selected listings only. CSP-safe via Blob URLs |

### API Endpoints Used

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `/api/idx/search` | Cookie | Trestle search — agent/broker only |
| `/api/media/batch` | Cookie | Lazy-load photos (default) or all media (detail mode) |
| `/api/media/proxy` | Cookie | Server-side Bearer auth injection for Trestle media URLs |
| `/geo/rls-neighborhoods.v1.min.geojson` | Public | Neighborhood polygon shapes |
| `/geo/neighborhood-aliases.json` | Public | Neighborhood alternate name mappings |
| `/geo/rls-neighborhood-centroids.v1.json` | Public | Fallback lat/lng for listings without coordinates |

### Compliance Gates (enforced at render time)

All 6 REBNY distribution gates checked before any listing renders. Address suppression for `InternetAddressDisplayYN=false`. REBNY attribution on all displayed data. Fair Housing language scanner on descriptions. `data-rls-ignore` on all CRM-internal form elements.

---

## Last Work Completed

- **2026-03-20:** CRM Search Page full audit — 172/172 smoke test PASS, UCBA audit 42/46 PASS (0 regressions). Fixed: `closeAddClientModal()` undefined function, 2 empty route directories removed, smoke test element IDs corrected to match actual form IDs, protected-periods UCBA A6/A7/A8 API routes built (3 files), `logAuditEvent` call signature fixed. Permanent smoke test at `scripts/smoke-test-crm.js` (7 test sections, 172 checks).
- **2026-03-10:** CRM Analytics & Tools (Systems D-Q) — 14 systems built: Seller Outreach, Pricing Experiments, Pipeline, Demand Heatmap, Buyer Intent, Agent Performance, CMA Engine, Showing Feedback, Notifications, Document Vault, Market Pulse, Lead Scoring, Commission Tracker, Listing Auditor. 11 new Prisma models, 32+ API routes, 10 cron jobs, 11 CRM JS modules, all wired into CRM sidebar. TypeScript: 0 errors.
- **2026-03-07:** Amenity pipeline + listing detail restructure — `BuildingFeatures`, `PoolFeatures`, `SpaFeatures` added to IDX pipeline (types → mapping → public-dto → page). Listing detail page restructured into 5 clean sections: Unit Features, Appliances, Building Amenities, Parking, Pet Policy. Pets removed from building amenities. Storage/BikeRoom excluded. Garage separate. ACRIS fallback for last sale price via borough/block/lot.
- **2026-03-07:** Media pipeline fix — VirtualTour items no longer leak into photo carousel, videos render as `<video>` tag for direct files (iframe for YouTube/Vimeo), virtual tour fallback from Media resource when `VirtualTourURLUnbranded` is empty.
- **2026-03-06:** CRM mock data cleanup — removed ALL fake names, stats, prices, addresses from rendered HTML. See [CRM Mock Data Cleanup](#crm-mock-data-cleanup-2026-03-06) below. Commit `5638ef05` (-1,068 lines net).
- **2026-03-06:** CRM navigation fixes — showTab null guard, agent blocked tab redirect, auth redirect preserves hash, sessionStorage tab persistence, portal tab restore. Restored 3 tab UIs (exclusives, in-contract, sold).
- **2026-03-06:** CSP fix — added `api.cotality.com`, `api-trestle.corelogic.com`, `api-prod.corelogic.com` to `img-src` and `connect-src` in both global and CRM CSP headers (`vercel.json`). Prevents image/fetch blocks after Trestle/Cotality API migration (deadline March 31, 2026). Legacy domains removable after deadline.
- **2026-03-05:** Upgraded Next.js 14 → 16.1.6. Created server-side media proxy for Trestle photos (Bearer auth). Added agent photo upload pipeline (Sharp → R2). Security audit: removed env exposure from `/api/health` and `/api/ai/env-check`, removed hardcoded seed passwords, removed vulnerable `xlsx` package. npm audit: 0 vulnerabilities.
- **Sprint 10 (2026-03-02):** Security hardening — Bearer auth fully removed (cookie-only), RLS enforcement on all write paths, DOM tracking (UCBA 2026), portal DTO centralized.
- **Sprint 10 (2026-03-01):** Moved CRM files to `public/crm/` for same-origin serving on Vercel. Redesigned login page. Fixed `DATABASE_URL` env var. Removed exposed Google Maps API key from source. Added `/crm/*` CSP headers and noindex directives.

---

## CRM Mock Data Cleanup (2026-03-06)

> **Commit:** `5638ef05` | **Net change:** -1,068 lines (1,054 insertions, 2,122 deletions)
> **File:** `public/crm/dashboard.html` (formerly `MALLAN-NYC-CRM-FINAL2.html`)
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

### Sprint 11 — CRM Analytics & Tools (2026-03-10)

**Completed:**
- 14 CRM tool systems (D through Q) — full stack: Prisma models, library engines, API routes, cron jobs, CRM JS modules, sidebar wiring
- 11 new Prisma models (CmaReport, ShowingFeedback, Notification, NotificationPreference, Document, DocumentSignature, MarketSnapshot, LeadScore, LeadAssignmentRule, CommissionPayment, ListingAudit)
- 32+ new API routes across 8 system groups
- 16 cron jobs in vercel.json (data retention, DOM reset, IDX sync, listing expiration, search alerts, seller scoring, experiment metrics, demand signals, intent profiles, agent metrics, lead scoring, conviction scores, listing momentum, social proof, lifecycle triggers, market snapshots)
- 11 CRM JS frontend modules with sidebar buttons, content divs, and compliance banners
- TypeScript: 0 errors

### Sprint 9 — Wire CRM to Live Backend (2026-03-01)

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
- Complete IDX/Trestle pipeline (902-field mapper, OAuth2, sync orchestrator)

### Sprint 6 — Client Management & Portal Wiring (2026-03-01)
- 6 client CRUD endpoints, 6 portal endpoints, agent roster write API
- Showing management, CRM wired to all endpoints
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
| `DATABASE_URL` | Yes | PostgreSQL connection (pooled, for queries) |
| `DATABASE_URL_UNPOOLED` | Yes | PostgreSQL connection (unpooled, for Prisma migrations) |
| `CRON_SECRET` | Yes | Bearer token for Vercel Cron job authentication |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public site URL (`https://mallan.nyc`) |
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
| `OPENAI_MODEL` | No | OpenAI model for AI features (default `gpt-4o`) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for compliance AI validation |

### Compliance Validation

```bash
# Run RLS compliance validator against CRM production files
npm run rls:validate

# Run RLS validator tests (42 assertions)
npm run test:rls
```

---

## Compliance Findings Audit — 2026-04-14

22 findings were reviewed and verified against the codebase. 5 were fixed, 4 found inaccurate, 13 documented as accepted risk or informational.

### Fixes Applied

| # | Finding | Regulation | Fix |
|---|---------|-----------|-----|
| HIGH-7 | CRM emails missing CAN-SPAM unsubscribe link | CAN-SPAM | Added unsubscribe link to shared email FOOTER in `lib/email/templates.ts`. All emails via `wrapEmail()` now include opt-out. |
| HIGH-1 | No agency disclosure on lead capture forms | NYS RPL, DOS-1736-f | Created `AgencyDisclosure` component. Added to `InquiryForm`, `InquiryModal`, Contact page, `HomeValueWidget`, `CalculatorLeadCapture`. |
| HIGH-3 | Behavioral trackers fire before cookie consent | NY SHIELD, TCPA | `BehavioralTracker` and `IntentTracker` now gate all tracking behind `useConsentStatus()` → `analyticsAllowed`. |
| MED-2 | Search page missing IDX attribution component | REBNY IDX display | Replaced hardcoded disclaimer with `<IDXSearchDisclaimer />` component in `app/search/page.tsx`. |
| MED-6 | Portal listings endpoint missing Coming Soon gate | REBNY UCBA D3 | Portal listings now flag Coming Soon listings with badge text and `comingSoon: true` in response. |

### Files Changed (2026-04-14)

| File | Change |
|------|--------|
| `lib/email/templates.ts` | Unsubscribe link added to shared FOOTER; duplicate removed from `searchAlertEmail` |
| `app/components/AgencyDisclosure.tsx` | **NEW** — Reusable agency disclosure notice for forms |
| `app/components/InquiryForm.tsx` | Agency disclosure added |
| `app/components/InquiryModal.tsx` | Agency disclosure added |
| `app/contact/page.tsx` | Agency disclosure added |
| `app/components/HomeValueWidget.tsx` | Agency disclosure added |
| `app/components/CalculatorLeadCapture.tsx` | Agency disclosure added |
| `app/components/BehavioralTracker.tsx` | Consent-gated via `useConsentStatus()` |
| `app/components/IntentTracker.tsx` | Consent-gated via `useConsentStatus()` |
| `app/search/page.tsx` | Hardcoded disclaimer replaced with `IDXSearchDisclaimer` component |
| `app/api/portal/listings/route.ts` | Coming Soon gate (Gate 5) with UCBA D3 notice |

### Verified Inaccurate Findings (No Fix Needed)

| # | Finding | Reason |
|---|---------|--------|
| CRIT-1 | "Bulk email endpoint missing" | Bulk email handled by `app/api/crm/email/route.ts` (eblast type, 200-cap, consent checking) |
| CRIT-4 | "12-min sync + 10-min skip = >15min gap" | Math wrong: effective interval is always 12 min. "REBNY 15-min rule" does not exist |
| HIGH-5 | "Unsplash/Picsum = false listing imagery" | Images used on 10+ pages as decorative marketing backgrounds, not listing photos |
| MED-4 | "Sell page commission language" | Already compliant: "Commission rates are not set by law and are fully negotiable" |

### Round 2 Fixes (2026-04-14)

| # | Finding | Regulation | Fix |
|---|---------|-----------|-----|
| N-3 | API Fair Housing scanner only 6 patterns vs 29 in CRM frontend | Fair Housing Act, NYC Title 8 | Expanded `app/api/crm/compliance/audit/route.ts` from 6 to 21 categorized patterns across 10 categories: Race, Religion, Familial Status, Sex, Disability, Source of Income (NYC), Fair Chance Housing Act (NYC LL 24/2023), Citizenship, NY DOS Ad Rules. Aligned with `public/crm/js/compliance/fair-housing.js`. |
| C-4 | RegistrationGate consent checkbox not transmitted to API | TCPA | `app/components/RegistrationGate.tsx` now sends `consent_captured_at` timestamp in POST body to `/api/search-alerts`. |
| M-7 | compliance/UPDATES.md Trestle migration still "ACTION REQUIRED" | Compliance log | Updated to "Complete" (code verified using `api.cotality.com`). Added April 2026 audit entries and Trestle patch tracking. |

### Round 2 Verified Findings

| # | Finding | Verdict | Detail |
|---|---------|---------|--------|
| N-1 | PrivateOutdoorSpace missing from trestle-mapper | **NOT A GAP** | Private outdoor space is captured via `ExteriorFeatures` enum values (`PrivateOutdoorSpaceOver60Sqft` value 108, `PrivateOutdoorSpaceUnder60Sqft` value 109) on Trestle. `ExteriorFeatures` IS in mapper (B20 line 247) and mapped to `exteriorFeatures` in `mapping.ts`. The standalone fields `PrivateOutdoorSpaceSize`/`PrivateOutdoorSpaceRemarks` exist in REBNY compliance spec but are NOT on Trestle's IDX feed — they're LMP/RealPlus submission fields only. |
| N-2 | Trestle Patches #188/#189 not verified | **ACCURATE** | Documented in `compliance/UPDATES.md` as ACTION REQUIRED. Need to download patch PDFs from Cotality. |
| N-3 | Fair Housing scanner pattern count mismatch | **ACCURATE — FIXED** | API had 6 patterns, CRM frontend had 29. Expanded to 21 server-side patterns (8 CRM patterns are low-severity ad-style rules kept frontend-only). |
| N-4 | Coming Soon badge missing REBNY text in CRM | **INACCURATE** | CRM `compliance-gates-and-output.js` line 62 correctly uses: "Coming Soon — No showings or open house permitted until [date] (UCBA Art. I Sec. 5(C))". |
| H-7 | dev-login guard bypassable | **INACCURATE** | Two guards: `NODE_ENV === "production"` (returns 404) AND `ALLOW_DEV_LOGIN !== "true"` required. Not bypassable. |
| H-8 | settings/company GET unauthenticated | **ACCURATE (low risk)** | Returns only public company info (name, license, phone, address) — same data shown in footer. POST requires broker auth. |
| H-1 | IDXDisclaimer lastUpdated prop ignored | **ACCURATE (by design)** | Code comment: "Always show today's date — data is refreshed every 12 minutes via sync cron." More conservative than stale timestamps. |
| M-1 | Search results missing "Listing Courtesy of" | **INACCURATE** | `SearchListingCard.tsx` line 117 displays "RLS · Listing Courtesy of {listing.listOfficeName}". |
| M-5 | Search-alerts cron sends suppressed addresses | **INACCURATE** | Cron applies `idx_display_yn = true` and `owner_opt_out = false` filters before query. |

### REBNY / Trestle External Status (Verified 2026-04-14)

| Item | Status |
|------|--------|
| REBNY policy changes since Jan 2026 | **None found** — verified rebny.com/rls-updates/ and /compliance/ |
| 2026 UCBA changes (all 5) | Already implemented in codebase |
| Compensation fields removed (Aug 2025) | Already handled |
| POLD / Participant Only gate | Enforced (Gate 4 in `checkDistributionGates`) |
| Trestle API URL migration | **Complete** — all code uses `api.cotality.com/trestle` |
| Trestle Content Patch #189 (Mar 4, 2026) | **Unreviewed** — 3 new fields, 30 field changes, 37 lookup values |
| Trestle Content Patch #188 (Jan 27, 2026) | **Unreviewed** — 98 new lookup values |
| Private Outdoor Space required field | **Already captured** via `ExteriorFeatures` enum values (not a standalone IDX field) |
