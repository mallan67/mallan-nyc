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


## Compliance Requirements

*(See internal compliance documentation for full details.)*

---

## Listings: Types, Visibility, Distribution

*(Listing type definitions, visibility rules, and syndication controls to be documented here.)*

---

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

### CI Pipeline

The CI workflow (`.github/workflows/auto-fix-and-pr.yml`) runs on pull requests:

1. **Strict steps** (fail CI if broken):
   - `npm ci` - Install dependencies
   - `npx prisma generate` - Generate Prisma client
   - `npx prisma db push` - Apply schema
   - `npm run type-check` - TypeScript validation
   - `npm run build` - Next.js build

2. **Non-blocking steps** (warn but don't fail CI):
   - `tools/apply_sql.js` - SQL views/constraints
   - `prisma/seed.js` - Database seeding

### Vercel Deployment

The repository is linked to Vercel via `.vercel/project.json`. Deployment triggers automatically on push to `main`.

**Required Vercel Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `SENDGRID_API_KEY` - For email functionality
- `SENDGRID_FROM_EMAIL` - Sender email address

**Build Configuration:**
- Framework: Next.js
- Build Command: `npm run build` (postinstall runs `prisma generate`)
- Output Directory: `.next`
- Node.js Version: 20.x

### Verifying the Setup

**Local verification:**
```bash
npm ci && npm run build  # Should complete without errors
```

**CI verification:**
- Push to a feature branch and create a PR
- Check that the PR check workflow passes

**Vercel verification:**
- Merge to `main` triggers deployment
- Check deployment logs at https://vercel.com/mallan/mallan-nyc

---

## Last Work Completed

- CI guardrails implemented (`scripts/ci/guardrails.mjs`)
- Legacy `frontend/` and `pages/` directories archived
- Backup files moved to `archive/`
- README governance markers added
- Deploy readiness fixes (Prisma generation, Vercel linkage, CI alignment)
