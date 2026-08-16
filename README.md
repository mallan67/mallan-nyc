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

### Three-layer feed model — REBNY vs Cotality vs RESO (clarified 2026-05-01)

Three distinct layers must stay separate when reasoning about feed behavior, debugging field semantics, or planning future MLS subscriptions:

| Layer | What it is | Who owns it |
|---|---|---|
| **REBNY** | The MLS / RLS organization, data owner, and policy layer | Owns the runtime policy that decides which rows reach the feed and which fields are populated/suppressed per row. UOI in RESO Desktop Client: `T00000046`. |
| **Cotality / Trestle** | The API / feed platform implementing and serving REBNY's data | mallan.nyc reads the live feed at `https://api.cotality.com/trestle` — **the only field/API truth**. The live `$metadata` defines which fields exist; REBNY's policy layer decides which rows/fields are populated per row. |
| **RESO** | The OData / field-naming model the Cotality feed exposes | The Cotality/Trestle feed returns a RESO-shaped OData model (entity types, field names, enum tokens). It does NOT tell you what REBNY's policy layer populates at runtime — verify against the live feed, not an external standard. |

**Practical consequences:**

1. **Field behavior is feed-specific, not RESO-spec-derived.** `InternetEntireListingDisplayYN` and `InternetAddressDisplayYN` are universally `null` AND non-OData-filterable in mallan.nyc's REBNY IDX Plus feed because REBNY pre-filters non-displayable rows out at the Cotality data-serving boundary (HTTP 400 "Results from 'RLS' has been suppressed (provider Level)"). This is REBNY policy, NOT a universal Cotality behavior. The mapper at `lib/idx/trestle-mapper.ts:680-681` treats null as displayable for these two fields specifically because of REBNY's pre-filter — see the in-file comment for the full reasoning.
2. **Other RESO fields behave differently because REBNY treats them differently.** `InternetAutomatedValuationDisplayYN` and `InternetConsumerCommentYN` ARE per-row populated (~97% true / ~3% false) because REBNY treats them as per-listing opt-out flags rather than pre-filter conditions. Those use fail-closed `affirmPermission()` coercion.
3. **Future non-REBNY feeds need independent verification.** When mallan.nyc subscribes to OneKey, NY State MLS, or other non-REBNY MLSes (per the external-inventory spec Phase 2-A), each carries its own three-layer stack and may populate the SAME RESO field names with different runtime semantics. New adapters must run their own `npm run reso:coverage` probe against the new feed before any writer-side mapping decisions are committed. **Runtime payload behavior must be verified per feed, not assumed from RESO certification alone.**

This distinction was clarified after the 2026-04-30 IDX Plus display-gate incident. Full incident capture in [`memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`](./memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md).

---

### Allowed Use (REBNY Confirmed 2026-03-27)
- MLS/IDX data may be accessed **only via authorized server-side connections** using credentials issued through Trestle/Cotality.
- IDX data may be used for: **(1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting** — confirmed by REBNY (Michaela Parker, mparker@rebny.com, 2026-03-27).
- IDX feed is limited to the **IDX-released field set and IDX-eligible listing inventory only** — it is NOT full-market search. Agents use an external listing platform for full RLS inventory.
- Client data stays on mallan.nyc — never passes through any external listing platform or third parties.
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

> **Feed:** mallan.nyc reads the live `api.cotality.com/trestle` feed under the **IDX Plus - WebAPI** license (Trestle-11371-20) for **public display, internal CRM client management, and reporting** (REBNY confirmed 2026-03-27). The IDX feed provides IDX-released fields and IDX-eligible inventory only — it is NOT full-market search. The LMP for listing submission and full RLS search is external to mallan.nyc — REBNY does not grant LMP licenses to individual brokers. mallan.nyc reads 902 IDX Plus fields across 7 REBNY-specified resources plus additional Trestle-provisioned fields (1,457 total Property definitions in live metadata).

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
| `GET /api/idx/search` | Session cookie required | CRM search — agent/broker only, broader field set. IDX-eligible inventory only (not full-market — agents use an external listing platform for full RLS) |

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

### Field model (live Cotality feed)

The live `api.cotality.com/trestle` feed exposes a RESO-shaped OData model. Field facts (verify against the live `$metadata`):
- **23 RESO-to-RLS field renames** handled in `lib/idx/trestle-mapper.ts`
- **902 IDX Plus fields** across 7 REBNY-specified resources (Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39), 41 required, 86 conditional
- **5 additional Trestle resources** beyond IDX Plus: PropertyRooms (39 fields), Teams (48), TeamMembers (29), PropertyGreenVerification (39), Building (key only)
- **Critical fields beyond IDX Plus CSV** on Trestle Property: `InternetAddressDisplayYN`, `InternetEntireListingDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `ShowingInstructions` — all distribution gate / showing fields
- **2,066 picklist values** across 117 lookups
- **StandardStatus uses RESO enum tokens** (no spaces): `Active`, `ComingSoon`, `ActiveUnderContract`
- **Recent live fields:** `OriginalMediaUrl` on Media, `MemberMls`/`OfficeMls`

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
| `/api/idx/search` | GET | CRM search — agent/broker only, broader field set with proxied media URLs (not guaranteed to match full external LMP inventory) |
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

The listing detail page (`app/listing/[...slug]/page.tsx`) displays property data in structured sections:

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
  │     Broader field set than public search (not guaranteed to match full external LMP inventory)
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

## Recent Work

- **2026-04-28:** **Master plan PR 10 (Neon shedding) shipped to production + 9 follow-on PRs.** Full session log: [`memory/SESSION-2026-04-28-allnighter.md`](memory/SESSION-2026-04-28-allnighter.md). One sentence per PR: **#75** slim writer for Trestle `raw_data` (live in production, growth stops); live backfill cut listings table 270→173 MB and total DB 293→196 MB (58.6%→39.2% of free cap) via bulk `UPDATE ... FROM (VALUES ...)` per batch + `VACUUM (FULL, ANALYZE) listings`. **#76** six-bug fix on PR #75 (tsx pinned in devDeps, parallel SQL, `projectShedSavings` byte-counting fix, transient-error retry, doc refresh, pre-commit guard reading stale `COMMIT_EDITMSG`). **#71** plan reconciliation + React Compiler audit cleanup. **#72** `npm run crm:test` restored. **#77** auto-retry workflow for Live Site Smoke runner-pool flakes. **#78** Codex follow-up on #77 (failed-closed classifier + explicit `--repo` on `gh run rerun`). **#79** Trestle live audit graceful-skip when `IDX_CLIENT_ID`/`IDX_CLIENT_SECRET` absent + idempotent label create (fixes "compliance label not found" cascade). **#74** C3c auction form sub-section UI. **#73** C4c broker ethics admin panel + 4 Codex bug fixes in `app/api/crm/agents/[id]/ethics-training/route.ts` (null-body TypeError, partial-PATCH ordering bypass, missing 404, body type guard) + 3 regression tests. **#80** Neon branch-prune cron — daily 04:00 UTC sweep + `lib/neon/branches.ts` + `scripts/neon-prune-branches.ts` + NEON.md §11 architecture note; user manually swept the 14+ accumulated stale branches down to just `main`. Workstream C now 4/4 complete; master plan 10/10 complete. Final gates: type-check 0 errors, lint 0 warnings, 194/194 compliance tests, 46 UCBA PASS / 0 regressions.
- **2026-04-27 (later):** **React Compiler set-state-in-effect cleanup — full remediation.** All 13 outstanding `react-hooks/set-state-in-effect` warnings eliminated via two purpose-built data hooks (no suppression directives, no library deps). New: `lib/hooks/useAsyncResource.ts` — generic fetch-on-mount hook backed by a typed `useReducer` state machine (idle → loading → success | error) with `AbortController` cancellation and `refetch()`; `lib/hooks/useClientOnly.ts` — mount-only `localStorage`/`window`/`cookie` hydration helper using the same reducer pattern. 11 components + 2 portal pages converted (CompareProperties, NeighborhoodExplorer, LiveListingsWidget, StationArrivals, TransitCommuteTool, TransitSidebarSummary, CookieConsent, ResourceContent, RecentlyViewed, portal/seller, portal/tenant). Header + SearchFilterPanel converted to React docs canonical "set state during render with previous-value useState" for "adjust state when prop changes". `useFavorites` + `useSavedSearches` converted to `useSyncExternalStore` (cached snapshot, listener pattern, cross-tab `storage` events). `AuthProvider` converted to typed `useReducer` with discriminated `set-authenticated`/`set-anonymous` actions. **Result:** lint went from 23 problems (6 errors + 17 warnings) → **0 problems**; type-check 0 errors; UCBA audit 45/46 PASS, 0 regressions; RLS validate 0 errors; IDX validate 819 pass / 0 critical; compliance-check 79 PASS. Full report: `compliance/REACT-PATTERNS-AUDIT-2026-04-27.md`.
- **2026-04-27:** Validator truth framework complete — 100% UCBA v2 coverage (46/46 rules), 11 declared workflows, 25 runtime side-effect tests, release-truth aggregator gating every push to main, hourly live-site smoke cron, target-platform Linux build job. Trestle/media debug-script clutter removed (~22 MB recovered). See `compliance/VALIDATOR-FRAMEWORK.md` and `memory/VALIDATOR-FRAMEWORK-2026-04-26.md`.
- **2026-04-26:** Workstream C compliance shipped — Inquiry model + 8 lead-capture endpoints wired, Offer transmission with UCBA Art. II precondition gate, Auction listing fields + validator (UCBA Art. I), Ethics training auth gate (UCBA Art. III §6) with mandatory backfill before deploy.
- **2026-04-25:** Master refactor PR 1 (compliance fail-closed gates) + R2 infrastructure provisioned + parameterized CMA tool + xlsx → exceljs security migration + npm audit triage.
- **2026-04-19 → 04-20:** Neon free-tier compute-hour quota recovery — restored documented design (no migrations in Vercel build), `db-keepalive` cron preserved, `NEON.md` is now the single source of truth for DB/migration discipline.
- **2026-03-20:** CRM Search Page full audit — 172/172 smoke test PASS, UCBA audit 42/46 PASS (0 regressions). Permanent smoke test at `scripts/smoke-test-crm.js`.
- **2026-03-10:** CRM Analytics & Tools (Systems D-Q) — 14 systems built: Demand Heatmap, Buyer Intent, Agent Performance, CMA Engine, Showing Feedback, Notifications, Document Vault, Market Pulse, Lead Scoring, Commission Tracker, Listing Auditor, Seller Outreach, Pricing Experiments, Pipeline.
- **2026-03-07:** Amenity pipeline + listing detail restructure (5 sections: Unit Features, Appliances, Building Amenities, Parking, Pet Policy). Media pipeline fix (VirtualTour separation, video tag handling).
- **2026-03-05:** Next.js 14 → 16. Server-side Trestle media proxy (Bearer auth), agent photo upload pipeline (Sharp → R2), security hardening, vulnerable `xlsx` removed.

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

### Compliance Validation (validator-truth framework)

The repo has an end-to-end release-truth validator framework. Full details in `compliance/VALIDATOR-FRAMEWORK.md` and `memory/VALIDATOR-FRAMEWORK-2026-04-26.md`.

```bash
# Layer 1 — UCBA rule truth (46 rules, 100% v2 rich-format coverage)
npm run ucba:audit

# Layer 2 — workflow completeness (11 declared feature workflows)
npm run validator:workflows

# Layer 3 — schema migration discipline (NEON.md §1)
npm run validator:migration

# Layer 4 — deploy status for a PR or commit
npm run validator:deploy -- --pr <N>

# Layer 5 — live site smoke (homepage, search, attribution, freshness)
npm run validator:live-site

# Layer 6 — toolchain policy (Node engines.node, npm, prisma client)
npm run validator:toolchain

# Layer 7 — runtime side-effect tests (25 tests, 6 suites)
npm run test:runtime

# Aggregator — single verdict combining all layers
npm run release:truth                     # current main
npm run release:truth -- --pr <N>         # specific PR
npm run release:truth -- --per-merge --from-sha A --to-sha B
```

**Verdicts:** `PROD_PROVEN` / `CODE_VALID` / `PARTIAL` / `DEPLOY_INVALID` / `UNVERIFIED` / `CLAIM_OVERSTATED` / `REGRESSION`.

CI auto-runs `pr-check.yml` (jest --ci with 13 projects + type-check + ucba + ci-compliance + idx-validate + build), `target-platform-build.yml` (Linux/Vercel-class install/build on dependency PRs), `release-truth.yml` (verdict commit-status on push to main + advisory PR comment), and `live-site-cron.yml` (hourly smoke on prod, auto-issues on FAIL).

---

## Immediate Cleanup & MVP Lock

The MVP scope and active in-flight workstreams are tracked in [`memory/REFACTOR-2026-04-25.md`](memory/REFACTOR-2026-04-25.md) (master 10-PR backend rebuild) and [`memory/FOLLOWUP-2026-05-01.md`](memory/FOLLOWUP-2026-05-01.md) (Workstream C — UCBA compliance gaps). For the current open-vs-shipped state of any new session, run `gh pr list --state open`, `git log --oneline -10`, and read the most recent audit under `docs/audits/`.

Cleanup discipline (no drift): every working-tree file is either committed, intentionally tracked-and-staged, or deleted — `.env.local` and `node_modules` excepted. Branches off `main` only, one focused change per PR, schema PRs follow [`NEON.md`](NEON.md) (nullable first, dual-write, manual `prisma migrate deploy` to Neon prod *before* code merges).

## Compliance Requirements

The full compliance surface — REBNY RLS / UCBA 2026, IDX Plus / Trestle connector, Fair Housing (federal + NY State + NYC Title 8), FARE Act, NY DOS § 175.25, TCPA, CAN-SPAM, NY SHIELD, WCAG 2.1 AA — is specified earlier in this README under [🚨 Compliance & Legal Requirements](#-compliance--legal-requirements-read-first), [📌 MLS / IDX DATA COMPLIANCE](#-mls--idx-data-compliance-rebny-rls--idx-plus), [IDX Plus / Trestle — Rules of the Road](#idx-plus--trestle-rebny-rls--rules-of-the-road), and [UCBA 2026](#ucba-2026-universal-co-brokerage-agreement--january-2026-revision).

Operational gates that block CI / commits:

- `npm run ucba:audit` — 145-rule checklist; **REGRESSIONS must be 0** (annotated FAILs are tracked in `compliance/rules/ucba-audit-checklist.json`)
- `npm run rls:validate` — 10-section RLS validator (fields, renames, gates, masking, coverage)
- `npm run idx:validate` — 32-section IDX Plus validator
- `npm run compliance-check` — pre-commit sanity gate
- `npm run ops:health` — Neon storage / compute headroom + sync freshness
- The `rebny-compliance` skill must be invoked before any commit touching `lib/compliance/**`, `lib/idx/**`, `app/api/{crm,portal,listings}/**`, public listing display, or any free-text capture form

## Listings: Types, Visibility, Distribution

| Type | Source | Visibility | Distribution |
|---|---|---|---|
| **RLS-eligible sale / rental** | Submitted via an external LMP → REBNY RLS → IDX Plus feed (read-only on mallan.nyc) | Public listing pages + agent CRM, gated by 6 distribution flags (`InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `participant_only`, `owner_opt_out`) | StreetEasy (direct upload), Zillow / Trulia (auto from StreetEasy), Realtor.com / Redfin / Homes.com / RentHop (REBNY data license, automatic), openigloo / Samaki / TBI Listings (Trestle opt-in toggles) |
| **Auction listing** | Same RLS path, `auction_yn=true` plus `auction_type` / `auction_end_date` (mandatory) and `auction_terms_url` (recommended http(s):// only — `AU-006` blocks unsafe schemes) | Public listing pages render an `AuctionBanner` above price; standard 24-hour price-change rule does NOT apply (UCBA Art. I auction exception) | Same as RLS-eligible |
| **Commercial / website-only** | `rls_eligible: false` on the Listing model (commercial sub-types + ownership) | mallan.nyc only — bypasses all 6 distribution gates | Not distributed; Fair Housing + NY DOS + TCPA still apply |
| **Coming Soon** | Sale/rental with `MlsStatus=ComingSoon` | Public pages render the [Coming Soon badge](app/components/ComingSoonBadge.tsx) — required exact phrasing per UCBA Art. I § 16(C) | Distributed when DOM rule allows |

Enforcement: see `lib/compliance/rls-enforcement.ts` (assertRlsCompliantPayload), `lib/compliance/dto.ts` (portal DTO sanitizer with public/portal/CRM tiers), `lib/compliance/dom-tracker.ts` (UCBA DOM with 30-day reset), and `lib/idx/public-dto.ts` (the only safe surface that reaches the browser).

## Last Work Completed

Authoritative changelog lives in `git log` and the merged PR list. The human-curated summary is:

- [`memory/REFACTOR-2026-04-25.md`](memory/REFACTOR-2026-04-25.md) — master 10-PR backend rebuild plan with status table per PR.

Recent areas of work: REBNY UCBA 2026 compliance (Workstream C — Inquiry / Offer transmission / Auction listings + enforcement / Ethics training fields + auth gate), Trestle media pipeline hardening (`ResourceRecordKey` correctness, batch-URL length, MediaStatus filter), media schema normalization (`ListingMedia` + `MediaSyncState`), React Compiler + lint hygiene sweep (`useAsyncResource`, `useClientOnly`, set-state-in-effect elimination), and CI gate restoration (`npm run crm:test`).

