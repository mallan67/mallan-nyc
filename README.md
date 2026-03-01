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
GitHub Pages (mockups)           Vercel (API + frontend)
  search-modular/                  mallan-nyc/
  ├── login.html          ──→     ├── app/api/auth/login
  ├── CRM (FINAL2.html)   ──→     ├── app/api/crm/*
  ├── index-built.html     ──→     ├── app/api/crm/listings
  ├── SALE-FORM-WITH-TOOLS ──→     ├── app/api/crm/listings/[id]
  └── RENTAL-FORM-WITH-TOOLS ──→   └── app/api/portal/*
```

- **Mockups:** `https://mallan67.github.io/search-modular/` (GitHub Pages)
- **API:** `https://mallan.nyc/api/` (Vercel, Next.js 14 App Router)
- **Database:** PostgreSQL on Neon (Prisma ORM)
- **Auth:** Dual — Bearer token (cross-origin) + httpOnly cookie (same-origin)

### Cross-Origin Auth (Sprint 9)

GitHub Pages and mallan.nyc are different origins. Cookies (`SameSite=Lax`) don't send cross-origin.

**Solution:** Dual auth — cookies for same-origin (future), Bearer token for cross-origin (now).

1. Login returns the session token in the JSON response body (alongside the cookie)
2. `api-client.js` stores token in `localStorage` (`mallan_session_token`)
3. All requests send `Authorization: Bearer <token>` header
4. Backend checks Bearer header first, cookie second
5. CORS allows `https://mallan67.github.io` + localhost origins

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

- **CORS:** Allowlist — `https://mallan67.github.io`, `http://localhost:3000`, `http://localhost:5500`
- **Rate Limiting:** 30 req/min API, 120 req/min pages (per IP)
- **IDX Sync:** 1 call per 5 minutes
- **Bot Blocking:** 30+ known scraper/AI bots blocked at edge
- **Session:** DB-backed, 24hr expiry, auto-rotate within 1hr of expiry
- **Audit:** All mutations logged to AuditEvent table
- **CSP:** Content Security Policy via `vercel.json`

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
| `IDX_CLIENT_ID` | No | Trestle OAuth client ID |
| `IDX_CLIENT_SECRET` | No | Trestle OAuth client secret |

### Compliance Validation

```bash
# Run RLS compliance validator against mockup files
npm run rls:validate

# Run RLS validator tests (42 assertions)
npm run test:rls
```
