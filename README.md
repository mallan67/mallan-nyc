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

md

# 6. Start development server
npm run dev
