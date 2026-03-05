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

## UCBA 2026 Changes (Effective January 20, 2026)

| Change | Article | Detail |
|--------|---------|--------|
| **DOM for Exclusive Listings** | Art. I, Sec. 11 | "Participant Only Network" and "Coming Soon" listings do NOT accrue days on market until status/permission changes |
| **DOM Reset Threshold** | Art. I, Sec. 11 | Withdrawn/Cancelled reset reduced from **90 days to 30 days** |
| **Seller's Agent Disclosure** | Art. II, Sec. 11 | Must verify offer transmission to seller upon request; disclosure required even for single offers |
| **Owner Opt-Out Submission** | Exhibit B | No longer by email — must submit through LMP with the Exclusive Listing |
| **RUNDBA (Buyer Rep)** | Exhibit D | 60-day purchase agreement requirement eliminated; commissions confirmed fully negotiable |
| **Related Entities** | Art. II, Sec. 13 | "Or any such related entity" added to termination procedures |

**Already implemented in codebase:**
- DOM reset at 30 days: `lib/compliance/dom-tracker.ts` (`DOM_RESET_DAYS=30`)
- DOM suppression for Participant Only / Coming Soon: `isDomSuppressedByPermissions()`
- Distribution gates: `lib/idx/trestle-mapper.ts` (`checkDistributionGates()`)

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
- **API:** `https://mallan.nyc/api/` (Vercel, Next.js 14 App Router)
- **Database:** PostgreSQL on Neon (Prisma ORM)
- **Auth:** httpOnly cookie only (`session_token`, SameSite=Lax, Secure)

### Auth (Sprint 10 — Cookie Only)

Bearer token auth fully removed (Sprint 10). All auth is cookie-only.

1. Login sets an HttpOnly session cookie (`session_token`)
2. All requests authenticate via cookie only
3. CORS is same-origin in production (localhost origins allowed in dev only)

### API Endpoints (42 total)

#### Auth (7)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Login, sets cookie + returns Bearer token |
| `/api/auth/logout` | POST | Destroy session, clear cookie |
| `/api/auth/me` | GET | Current user from session (Bearer or cookie) |
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

#### IDX/Trestle (2)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/idx/sync` | POST | Manual sync trigger (broker-only, rate-limited) |
| `/api/idx/status` | GET | IDX connection status + sync stats |

### Security

- **CORS:** Same-origin in production; `http://localhost:3000`, `http://localhost:5500` in dev only
- **Rate Limiting:** 30 req/min API, 120 req/min pages (per IP)
- **IDX Sync:** 1 call per 5 minutes
- **Bot Blocking:** 30+ known scraper/AI bots blocked at edge
- **Session:** DB-backed, 24hr expiry, auto-rotate within 1hr of expiry
- **Audit:** All mutations logged to AuditEvent table
- **CSP:** Content Security Policy via `vercel.json`

---

## Last Work Completed

- **Sprint 10 (2026-03-01):** Moved CRM mockups to `public/crm/` for same-origin serving on Vercel. Redesigned login page. Fixed `DATABASE_URL` env var (was pointing to wrong Neon project). Removed exposed Google Maps API key from source — now served via `/api/config/maps-key` endpoint. Added `/crm/*` CSP headers and noindex directives.

---

## Sprint Progress

### Sprint 9 — Wire Mockups to Live Backend (2026-03-01)

**Goal:** Make the CRM a real working backend — data from API, login is real, no mock fallback.

**Completed:**
- CORS + dual auth (Bearer token + httpOnly cookie) on all API routes
- Login returns token in response body; stored in localStorage
- `requireAuth()` checks Bearer header first, then cookie
- `/api/auth/me` accepts both auth methods
- `api-client.js` rewritten: Bearer token, no write stubs, fail-fast
- `login.html` created: email/password, auto-redirect if already logged in
- Auth gates on CRM, both viewers, and search (redirect to login if unauthenticated)
- `MallanAPI.configure({ baseUrl: 'https://mallan.nyc' })` on all cross-origin files
- Mock data removed from production paths (`mockListings`, `VIEWER_MOCK_LISTINGS`, `CLIENT_DATA`)
- Dev escape hatch: `?mock=true` on localhost loads hardcoded mock data
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

### Compliance Validation

```bash
# Run RLS compliance validator against mockup files
npm run rls:validate

# Run RLS validator tests (42 assertions)
npm run test:rls
```
