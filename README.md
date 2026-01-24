# Mallan NYC — New York Brokerage Platform (Compliance-First, Fast)

Immediate Cleanup & MVP Lock (Required)

This repository is being consolidated into one coherent system.
We are not restarting the project. We are removing ambiguity.

1) Repository Cleanup (Clean Slate Without Restarting)

To eliminate breakage and accidental imports, the following actions are mandatory:

Delete or Quarantine

Move frontend/ → archive/frontend-legacy/ or delete if unused

Delete all:

backup_* directories

*.bak files

Remove any duplicate or legacy app roots

Keep Only These in the Build Path
app/**
lib/**
prisma/**
public/**
config files (next.config.*, tsconfig, etc.)


Rule:
Anything outside this structure must be archived or deleted.
No experimental or backup files are allowed in the active build path.

2) Single Product Definition (MVP Lock)

This repository previously mixed:

an NYC Address Lookup tool

a full brokerage platform

That ambiguity is now resolved.

Chosen MVP (Authoritative)

The MVP for this repository is a Compliance-First New York Brokerage Platform consisting of:

Public website

Home

Search

Listing page template

Agents

Compliance pages (Fair Housing, SOPs, Agency, Privacy, Accessibility)

Lead capture

Explicit consent (TCPA / CAN-SPAM)

Immutable consent ledger

Basic CRM intake

Lead record creation

Lead routing rules

Activity/audit logging

MLS/RLS

Stubbed only

Architecture-ready

No live dependency required for MVP

NYC Address Lookup Tool

The existing NYC lookup logic must not be the homepage.

It may exist as:

/tools/nyc-lookup (internal/admin tool), or

a lead-magnet landing page

It is not the core product.

3) README as the Single Source of Truth

This README.md is the authoritative system definition.

It must always answer, in this exact order:

What this product is (one paragraph)

User flows (public users, agents, admins)

Pages map (routes)

API surface (/api/*)

Data model (core entities)

Integrations (status: Planned / Stubbed / Live)

Compliance requirements & where they are enforced

Environment variables

Runbook (dev, test, deploy)

Last Work Completed (append-only)

4) Change Control Rule (Non-Negotiable)

Any meaningful work must update the Last Work Completed section

History is append-only

No rewriting or deleting prior entries

This prevents architectural drift and contributor confusion.

5) Enforcement Principle

If code contradicts this README:

The README wins

The code is considered incorrect or incomplete
**Status:** Active Development  
**Jurisdiction:** New York State / NYC  
**Policies:** NY DOS Advertising · REBNY RLS Display Rules · Fair Housing · TCPA/CTIA · CAN-SPAM · NY SHIELD · WCAG 2.1 AA  
**Primary Goal:** Compliance-by-design + best-in-class consumer UX + revenue/ops engine.

---

## Executive Summary (3 Pillars)

1) **Compliance by design**
- Required notices/SOPs, lawful advertising, listing display rules
- Fair housing safeguards, consented lead capture, audit trails

2) **Superior consumer experience**
- Fast, accessible (WCAG 2.1 AA), deep inventory (map/commute/schools)
- Instant scheduling, transparent docs, multilingual, mobile-first, Core Web Vitals

3) **Revenue engine**
- Lead routing + CRM + consent-aware nurturing
- Syndication controls + analytics/attribution + ops (offers/e-sign/commissions/reporting)

---

## Non-Negotiables (System Flow)
- **Single system:** Next.js App Router is the only frontend and the MVP backend surface.
- **One routing system:** `app/` only (no competing `pages/` apps).
- **One source of truth:** this README defines product + compliance + architecture.
- **Append-only progress log:** “Last Work Completed” must be updated for meaningful changes.

---

## 1) Compliance Requirements (Must-Ship)

### Required Public Pages
- Fair Housing Notice (NYS)
- SOPs page (NYS) + versioned public change log (timestamp, author, effective date)
- Agency disclosure explanation + downloadable forms + e-sign workflow placement
- Broker of Record identity + license; agent license numbers where required
- Accessibility statement (WCAG 2.1 AA) + accommodation contact
- Privacy / Terms / Cookie policy (consent banner if non-essential cookies)
- Do Not Call policy + opt-out language
- Listing attribution + “as-is” data disclaimer per RLS/MLS rules

### Consent + Contacting Leads
- TCPA: explicit SMS consent; store artifacts (checkbox, timestamp, IP, UA, form version hash)
- DNC: suppression list + scrub prior to telemarketing
- CAN-SPAM: unsubscribe + physical address
- 10DLC: register A2P texting brand/campaign if sending SMS

### Security
- NY SHIELD Act reasonable safeguards + breach workflow
- RBAC, encryption, audit logging

---

## 2) Site Map (Public + Protected)

### Public
- Home
- Search (map + filters; sale/rental; residential + commercial)
- Neighborhoods / Buildings
- Listings
- Agents
- Sell / Lease with us
- New Development
- Resources (guides + calculators)
- About / Contact

### Compliance (Always public)
- Fair Housing, SOPs, Agency, Privacy/Terms, Accessibility/Disability

### Protected (Login required)
- Member Listings (Private Opportunities)
- Client collaboration features (saved items, shared searches, etc.)

---

## 3) UX Requirements (Fast + Seamless Browsing)

### Search & Listings
- Typeahead (address/zip/neighborhood/agent)
- Map-first: draw polygon, cluster markers, heat layers
- Commute filters (isochrones)
- Deep filters: beds/baths, price, fee/no-fee, DOM, open houses, pets, amenities, etc.
- Listing page richness: media + building profile + trends + disclaimers
- Sale: show “Owner compensating buyer’s agent: ___%” only when entered
- Sale: ROI + Cash-on-Cash calculator
- Rental: Rent vs Buy calculator
- CTAs: schedule, request info, offer start, save/share/print

### Accessibility + Trust
- WCAG 2.1 AA (semantic HTML, ARIA, keyboard)
- Inline compliance links on lead/scheduling forms
- Multilingual (Spanish/Mandarin/Russian etc.)

### Performance (Core Web Vitals Targets)
- LCP < 2.5s, CLS < 0.1, INP optimized
- Aggressive image optimization, CDN caching, minimized JS
- Prefer server components for listing pages; client components only for interactive parts

**Caching strategy:** public pages should be cached via ISR/revalidate where possible. Vercel supports ISR in App Router using `revalidate` / `fetch(... next: { revalidate } ...)` .

---

## 4) Listings: Types, Visibility, Distribution (Compliance + Performance)

This platform supports **three** listing types. The type determines:
- what can be shown publicly
- whether the listing can appear in REBNY RLS results
- SEO indexing rules
- caching rules for fast browsing

### A) RLS Listings (REBNY)
- Source: REBNY RLS feed
- Public: Yes
- Rules: RLS display rules enforced (attribution, no remark editing, media rights, “as-is” disclaimer, freshness)
- Performance: Cached via ISR/revalidate where allowed 

### B) Mallan Exclusives (Non-RLS)
- Source: Manual entry by Mallan/Agents/Teams (permissioned + audited)
- Public: Yes (default), optional gated
- RLS distribution: Optional only if explicitly promoted to RLS with authorization artifact
- Performance: Cached via ISR when public

**Public label:** “Mallan Exclusives”  
**Disclaimer:** “Exclusively represented by Mallan Real Estate Inc. and not listed on REBNY RLS or any MLS (unless otherwise noted).”

### C) Private Opportunities (Gated; NEVER RLS)
- Source: Manual entry
- Public: No
- Login required: Yes (buyers authenticate)
- RLS distribution: Not allowed
- SEO: noindex/nofollow + excluded from sitemaps
- Performance: authenticated caching only; no public CDN caching

**Public-facing reference label (if needed):** “Member Listings” / “Client Access”

---

### Required Listing Fields (Enforced)
Every listing must have:

- `listing_type`: `RLS` | `MALLAN_EXCLUSIVE` | `PRIVATE_OPPORTUNITY`
- `visibility`: `PUBLIC` | `MEMBERS_ONLY` | `REQUEST_ONLY` | `INTERNAL`
- `distribution`: `RLS` | `MALLAN_ONLY` | `MLS_OTHER` | `PORTALS`

Hard rules:
- If `listing_type=PRIVATE_OPPORTUNITY` ⇒ `distribution=MALLAN_ONLY` AND `visibility != PUBLIC`
- If `distribution=RLS` ⇒ RLS display rules apply and RLS fields are authoritative for public display
- Search results must visually label the type and never commingle without clear filtering/labels

---

## 5) Back-End & Ops

### Data Ingestion & Sync
- REBNY RLS ingestion with validator, mapping, media import, CDC
- Optional MLSs (OneKey etc.) with rules respected
- Syndication controls per owner opt-in/out
- PostGIS for geospatial; BBL/BIN mapping; PLUTO join; school zones
- Data contracts versioned; validation errors routed to QA queue

### CRM & Workflow
- Lead routing rules (borough, price, language, source, round robin, performance)
- Consent-aware nurture journeys (email/SMS)
- Tasks/checklists for showings/offers
- Document center + e-sign (DocuSign/Adobe)
- Offer/deal desk + co-broke tracking
- Commission module + 1099 totals

### Compliance Toolkit
- Required postings manager (SOP version history)
- Disclosure templates + auto-merge
- Ad review queue
- Consent ledger (immutable)
- DNC suppression list
- RLS compliance monitor (attribution integrity, no remark edits, feed freshness)

### Security & Privacy
- RBAC, encryption, SSO for staff
- NY SHIELD safeguards + incident response
- Backups + restores tested; rate limits; anti-scraping; logs

---

## 6) Integrations (Status)

| Connector | Purpose | Status |
|---|---|---|
| REBNY RLS | Listings ingest/display | Planned |
| Manual Listing Entry | Add listings by agents/groups | Planned |
| Private Member Listings | Buyer login required | Planned |
| NYC Socrata | DOB/ECB/complaints | Live |
| OpenAI | AI assistant | Live |
| Maps | Google/Mapbox | Planned |
| Calendar | Scheduling | Planned |
| E-sign | Disclosures/offers | Planned |
| SMS | Twilio/Telnyx + 10DLC | Planned |
| Email | SendGrid/SES | Planned |
| Analytics | GA4 + server-side | Planned |
| Accounting | Excel/free tool | Planned |
| Identity | Clearbit/ZoomInfo | Planned |

---

## 7) Delivery & Stack (Agreed Recommendation for Seamless Browsing)

### MVP (Phase 1) — Minimum Moving Parts
- **Front-end:** Next.js/React (App Router), Tailwind, TypeScript
- **Backend:** Next.js Route Handlers (`app/api/**`) + Prisma
- **DB:** PostgreSQL (PostGIS later)
- **Infra:** Vercel (web + API)
- **Quality:** unit/integration tests, accessibility + Lighthouse in CI
- **Observability:** Sentry + basic logs/metrics

### Scale (Phase 2+)
- Redis/queue/workers for feeds and heavy jobs
- S3/media pipeline as inventory grows
- WAF/CDN hardening (Cloudflare/CloudFront)
- Data warehouse/BI

---

## Last Work Completed (Append-Only)
### 2026-01-23
- Repo audited; README found empty; gaps identified
- Confirmed single-system Next.js App Router architecture for coherence
- Defined listing taxonomy with strict rules: RLS vs Mallan Exclusives vs Private (login-only, never RLS)
- Added performance-first caching strategy using ISR/revalidate for public pages 

