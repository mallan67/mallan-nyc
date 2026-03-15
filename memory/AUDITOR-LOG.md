# Frontend Flow Verifier - Auditor Log

## FULL API ROUTE AUDIT — 2026-03-09
**Scope:** ALL 103 API route files across app/api/ — end-to-end trace of request params, query logic, distribution gates, response shapes, auth, security
**Actions:** Read all priority endpoints (listings, similar, market, buildings, cma, inquiries, open-houses, open-houses/rsvp, idx/search, media/proxy, media/batch, contact, login, auth/login, sign-up, admin/reset-lead, cron/idx-sync, analytics/event, listings/[id], listings/suggest, listings/building, health/*, ai/env-check, guides/download, favorites/sync). Read middleware.ts, lib/auth/middleware.ts, lib/auth/session.ts, lib/idx/trestle-mapper.ts (checkDistributionGates), lib/idx/db-to-public-dto.ts, lib/sanitize.ts, prisma/schema.prisma (Listing+Lead+Session models).
**Findings:** 6 CRITICALs, 12 WARNINGs, 9 INFOs

**CRITICALs:**
- [C1] pc_auth cookie mismatch: /api/login sets random hex, middleware expects PRIVATE_COLLECTION_PASS — middleware.ts:285, app/api/login/route.ts:23-27
- [C2] /api/market Trestle fallback skips distribution gates on stats data — app/api/market/route.ts:163-188
- [C3] HTML injection in 5 email templates: user input not escaped via escapeHtml() — /api/cma, /api/inquiries, /api/open-houses/rsvp, /api/guides/download, /api/contact
- [C4] /api/contact writes to filesystem (ephemeral on Vercel) — app/api/contact/route.ts:66-69
- [C5] Two separate login endpoints (/api/login legacy + /api/auth/login) — legacy produces unusable cookie
- [C6] /api/listings/building no distribution gates on Trestle results — app/api/listings/building/route.ts:218-246

**WARNINGs:**
- [W1] Silent empty responses on Trestle failure in /api/listings
- [W4] /api/listings/similar DB media JSON key mismatch (mediaType vs MediaType)
- [W6] /api/buildings incomplete distribution gate (missing ParticipantOnlyYN/OwnerOptOut)
- [W7] /api/buildings case-sensitive string_contains for StreetName
- [W8] /api/open-houses Trestle path no distribution gates
- [W9] /api/open-houses local path uses camelCase address keys, DB stores PascalCase
- [W11] /api/listings/building no distribution gates (dup of C6)
- [W12] /api/listings/building returns success:true on error (line 300)

**New Contract Registry entries:**
- POST /api/cma: public, {name,email,phone,address} required, upserts Lead, 2 emails
- POST /api/inquiries: public, {email,agreeToTerms} required + name/phone for non-calculator, upserts Lead, 2 emails
- POST /api/open-houses/rsvp: public, {name,email,phone,listingAddress,openHouseDate,openHouseTime,agreeToTerms} required
- GET /api/media/proxy: public, URL whitelist (3 Trestle domains), Bearer auth server-side, 7d CDN cache, concurrency semaphore (15)
- GET /api/media/batch: agent/broker auth, batch up to 50 IDs, 30min cache, detail mode (5 IDs, all media types)
- POST /api/sign-up: public, honeypot + disposable email + MX validation + rate limit 10/hr
- POST /api/auth/login: public, tries Agent then Lead table, session_token httpOnly cookie, 5/min rate limit
- POST /api/contact: public, consent timestamp validation (5min), JSON file + DB, admin GET requires x-admin-key
- GET /api/listings/suggest: public, 60/min rate limit, 8 suggestions max, distribution gates on Trestle results
- GET /api/listings/building: public, Trestle + ACRIS sale history, BBL lookup via Geoclient/PlanningLabs
- POST /api/guides/download: public, guideType whitelist (buyer/seller), Lead upsert

**Auth coverage verified:** All /api/crm/* and /api/portal/* require session_token. /api/idx/search and /api/media/batch require agent/broker. All cron routes require CRON_SECRET. Public endpoints appropriately unprotected with rate limiting.

**Status:** Open — 6 CRITICALs unresolved

---

## Recently Fixed Features Audit — 2026-03-09
**Scope:** Market Report, Building Pages, Similar Listings, Open Houses — full end-to-end chain verification
**Actions:**
- Read: app/api/market/route.ts, app/market/MarketReportContent.tsx
- Read: app/api/buildings/route.ts, app/building/page.tsx, lib/sanitize.ts
- Read: app/api/listings/similar/route.ts, app/components/SimilarListings.tsx
- Read: app/api/open-houses/route.ts, app/api/open-houses/rsvp/route.ts, app/components/ListingOpenHouseRSVP.tsx
- Cross-referenced: app/listing/[id]/page.tsx (prop passing), lib/idx/public-dto.ts (listing.id = MLS listingId)
**Findings:** 0 blockers, 7 majors, 9 minors
**Key Issues:**
- [M1] Market API $select missing ModificationTimestamp/OnMarketTimestamp — Trestle newListings always 0 (route.ts:153,362)
- [M3] Market DB vs Trestle closed filter mismatch (modification_timestamp vs CloseDate) (route.ts:240,176)
- [M5] Similar listings DB media JSON key risk (mediaType vs MediaCategory) (route.ts:85)
- [M7] Open house API dedup drops same-day different-time events (route.ts:38-39)
- [m3] Building API Trestle results missing OwnerOptOut/ParticipantOnly check — compliance gap (route.ts:209-217)
**Contract Registry:**
- GET /api/market: public, rate-limited, 5min cache, aggregates (active/closed/neighborhoodBreakdown)
- GET /api/buildings: public, rate-limited, building profile (activeUnits/saleHistory/stats/amenities)
- GET /api/listings/similar: public, DB-first (>=3 skip Trestle), up to 6 listings with photos
- GET /api/open-houses: public, 5min CDN cache, merges Trestle OpenHouse + local prisma.showing
- POST /api/open-houses/rsvp: public, Lead upsert + AuditEvent + 2 emails
**Status:** Open — 7 majors unresolved

---

## Homepage Audit: Full Data Chain Trace — 2026-03-09
**Scope:** All 10 homepage sections (HeroSearch, FeaturedListings, ExploreNeighborhoods, ExclusivesVault, ZillowTestimonials, AboutSection, ValueProposition, NewsletterSignup, CTASection, TrustMarkers). Traced every data-dependent section end-to-end.
**Actions:** Read app/page.tsx, all 10 section components, 3 API routes (settings/company, listings/suggest, search-alerts), data/listings.json, lib/compliance/idx-display-gate.ts, lib/types/listing.ts. Verified existence of all linked pages (/buy, /rent, /sell, /contact, /sign-in, /unsubscribe) and static assets (hero.jpg, about-penthouse.png, equal-housing-logo.svg). Checked calculator component imports (AffordabilityCalculator, RentVsBuyStandalone, SellerClosingCostCalculator).
**Findings:** 2 blockers, 5 majors, 5 minors

**Details:**
- [B1] FeaturedListings INVISIBLE: data/listings.json has "listings": [] (empty). Component statically imports this at build time, gets 0 results, returns null. Entire "Featured Properties" section absent from homepage. No API fallback.
- [B2] TCPA consent not recorded: NewsletterSignup has required checkbox but consent state never sent in POST body to /api/search-alerts. No consent proof stored in DB.
- [M1] heroTagline fetched but never rendered: HeroSearch fetches heroTagline from API but h1 is hardcoded "New York Real Estate, Reimagined." (app/components/HeroSearch.tsx:53,263)
- [M2] ExclusivesVault unlocked state has no data source: shows "No exclusive listings" with zero API calls. Feature is permanently empty.
- [M3] IDXDisclaimer lastUpdated is always new Date() — not actual MLS data refresh time (app/components/FeaturedListings.tsx:395)
- [M4] HeroSearch settings fetch silently swallows errors with .catch(() => {}) (app/components/HeroSearch.tsx:58)
- [M5] Company settings POST uses filesystem writeFile — changes lost on Vercel cold start (app/api/settings/company/route.ts:53-58)
- [m1] HeroSearch stats hardcoded (5 Boroughs, 59 Neighborhoods, 5.0 Zillow Rating)
- [m2] FeaturedListings "View All" links to /buy but section could include rentals
- [m3] ExclusivesVault checks mallan_logged_in cookie but auth system uses session_token
- [m4] NewsletterSignup headline says "Market Insights" but consent text says "listing alerts"
- [m5] No error boundaries on homepage — any section crash = full white screen

**Contract Registry:**
- GET /api/settings/company: public, no auth. Returns full settings JSON (heroImage, heroTagline, legalLinks, quickLinks, etc.). Falls back to DEFAULT_SETTINGS if file missing. POST requires broker auth.
- GET /api/listings/suggest?q=...: public, rate-limited 60/min/IP. Returns { success: boolean, suggestions: Suggestion[] }. Searches neighborhoods (local), agents (DB), listings/addresses (Trestle when IDX_ENABLED). Max 8 results.
- POST /api/search-alerts: public, no auth (rate-limited by middleware). Accepts { email, name?, frequency, criteria: { type|listing_type, ... } }. Upserts Lead + creates SavedSearch in Prisma. Returns { success: true, message, searchId }.

**Status:** Open — B1 is the most impactful issue (zero listings on homepage). B2 is a legal compliance gap.

---

## Sell Page Audit: HomeValueWidget Integration — 2026-03-09
**Scope:** /sell page after CMARequestForm → HomeValueWidget swap. Traced form flow, API contract, navigation, component integrity.
**Actions:** Read app/sell/page.tsx, app/components/HomeValueWidget.tsx, app/components/SellerClosingCostCalculator.tsx, app/components/CMARequestForm.tsx, app/api/cma/route.ts, Header.tsx (grep). Checked middleware rate limiting, lib/email/templates.ts.
**Findings:** 0 blockers, 3 majors, 4 minors

**Details:**
- [M1] TCPA regression: HomeValueWidget has passive consent text only (line 137-141), removed explicit checkbox that CMARequestForm had (line 297-314). Legally weaker under TCPA.
- [M2] HTML injection in broker email: /api/cma route.ts:96-110 interpolates user input into HTML without escaping.
- [M3] Lost form fields: 4 fields now vs 11 previously. Backend still accepts all 11. Broker gets less info per CMA request.
- [m1] Dead code: CMARequestForm.tsx (330 lines) not imported anywhere.
- [m2] Stale comment: /api/cma route.ts:12 says "form includes explicit consent checkbox" — no longer true.
- [m3] No phone length validation: HomeValueWidget accepts any string as phone; server strips non-digits but doesn't reject too-short.
- [m4] Header nav sends ?type=residential/commercial to /sell but page ignores query param.

**Contract Registry:**
- POST /api/cma: public, no auth (rate-limited 30/window via middleware). Accepts {name, email, phone, address} required + 7 optional. Returns {success:true, message} on 200 or {error} on 400/500. Upserts Lead in Prisma, logs AuditEvent, sends broker email + auto-response via SendGrid.
- HomeValueWidget sends only the 4 required fields. Contract matches.

**Status:** Open — M1 (TCPA checkbox) is highest priority. M2 (HTML injection) should be fixed before heavy traffic.

---

## Security Audit: Address Slug Full Codebase Sweep - 2026-03-05 (Rev 2)
**Verdict:** FAIL (0 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW)
**Scope:** Full codebase sweep across app/, lib/, public/crm/js/, scripts/, .github/ for address leakage vectors
**Trigger:** Comprehensive address slug compliance review -- all URL generation, meta tags, share components, CRM emails, sitemap, JSON-LD
**Fixes confirmed from previous audit:**
- OData injection in fetchListingByAddress() -- FIXED (sanitizeOData allowlist at lib/idx/fetch.ts:207)
- fetchListing() Strategy 3 InternetAddressDisplayYN gate -- FIXED (line 121)
- Agent page ActiveListingCard -- explicitly sets internetAddressDisplayYN: true (local exclusives only)
**New findings:**
- [HIGH-001] CRM sendAgentInquiry() builds URL from raw listing.address without checking addressDisplayYN -- leaks suppressed address in email URL (public/crm/js/search/pagination.js:1076-1088)
- [HIGH-002] CRM email report URL builds slug from displayAddr which is "Address Available Upon Request" for suppressed listings, producing broken URLs; does not use MLS-ID fallback (public/crm/js/output/reports.js:2045-2046)
- [MEDIUM-001] CRM URLs use /buy/ and /rent/ route pattern but Next.js uses /listing/ -- all CRM-generated links 404
- [MEDIUM-002] mallannyhomes.com email in GitHub workflow (.github/workflows/rotate-db-keys.yml:91) -- stale domain
- [MEDIUM-003] LiveListingsWidget showAddress hardcoded to true -- must check InternetAddressDisplayYN before IDX data migration (app/components/neighborhoods/LiveListingsWidget.tsx:127)
- [LOW-001] extract-rental-standalone.js auto-populates listing URL from address without gate (acceptable -- listing agent's own form)
**Safe vectors verified:** generateListingSlug(), toPublicDTO(), listingHref(), canonical URL, OG/Twitter tags, ShareButton, SocialShareBar, sitemap, JSON-LD, console.log/error, /api/listings, /api/listings/suggest, /api/idx/search (auth-gated), fetchListingByAddress() (OData sanitized), ?key= override (goes through distribution gates)
**Blocking:** HIGH-001 and HIGH-002 must be fixed before deploy.

---

## Security Audit: Address-Based URL Slugs - 2026-03-05
**Verdict:** FAIL (0 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW)
**Scope:** 8 files: lib/listing-slug.ts, lib/idx/public-dto.ts, lib/idx/display-adapter.ts, lib/idx/fetch.ts, app/listing/[id]/page.tsx, app/components/PropertySearch.tsx, app/components/SearchMap.tsx, app/agents/[name]/page.tsx
**Trigger:** New feature -- address-based listing URL slugs with redirect logic
**Findings:**
- [HIGH-001] OData injection in fetchListingByAddress() -- slug-derived street name interpolated into contains() with only single-quote escaping (lib/idx/fetch.ts:212)
- [HIGH-002] Missing InternetAddressDisplayYN gate in ActiveListingCard on agent page -- address leaks in slug for suppressed listings (app/agents/[name]/page.tsx:112)
- [MEDIUM-001] fetchListing() Strategy 3 resolves address-suppressed listings via address slug -- should return null when InternetAddressDisplayYN=false (app/listing/[id]/page.tsx:113-121)
- [LOW-001] toDisplayListing() local fallback hardcodes internetAddressDisplayYN=true (lib/idx/display-adapter.ts:160)
**InternetAddressDisplayYN gate status:** Enforced in generateListingSlug(), toPublicDTO(), fromPublicDTO(). NOT enforced in agent page ActiveListingCard or fetchListing() Strategy 3.
**Blocking:** HIGH-001 and HIGH-002 must be fixed before deploy.

---

## Security Audit: Comprehensive Pipeline Audit - 2026-03-04
**Verdict:** FAIL (0 CRITICAL, 1 HIGH, 4 MEDIUM, 2 LOW)
**Scope:** 16 files: /api/listings, /api/idx/search, /api/idx/status, lib/idx/* (7 files), lib/compliance/* (3 files), lib/hooks/useListings, app/search/page, app/listing/[id]/page, .env.example, vercel.json
**29/29 REBNY/RLS compliance checks PASS**
**Findings:**
- [HIGH-001] /api/idx/search:416 leaks `details: message` in 502 error response -- internal Trestle errors exposed to authenticated agents
- [MEDIUM-001] /api/idx/status:36 exposes TRESTLE_API_URL in response body (broker-only but unnecessary)
- [MEDIUM-002] /api/listings:282 outer catch logs full error object (may contain Trestle URLs/token fragments)
- [MEDIUM-003] lib/idx/types.ts:147 declares `privateRemarks` on IDXListing (never populated but risk vector)
- [MEDIUM-004] lib/idx/types.ts:131 declares `listAgentEmail` on IDXListing (same risk pattern)
- [LOW-001] In-memory rate limiter resets on cold start (mitigated by middleware edge limiting)
- [LOW-002] Missing X-XSS-Protection: 0 header in vercel.json (CSP present as mitigation)
**Blocking:** HIGH-001 must be fixed before deploying changes to /api/idx/search
**CORS improvement noted:** mallan67.github.io origin removed from middleware.ts ALLOWED_ORIGINS

---

## Frontend Flow Verification - 2026-03-04
**Scope:** Full data flow trace from /search frontend through API routes to Trestle backend
**Actions:**
- Read: app/search/page.tsx, lib/hooks/useListings.ts, app/api/listings/route.ts
- Read: app/api/idx/search/route.ts, lib/idx/fetch.ts, lib/idx/auth.ts, lib/idx/client.ts
- Read: lib/idx/display-adapter.ts, lib/idx/public-dto.ts, lib/idx/mapping.ts, lib/idx/trestle-mapper.ts
- Read: data/listings.json, vercel.json, .env.local, .env.example
- Read: public/crm/js/core/mock-data.js, public/crm/js/core/api-client.js, public/crm/js/search/search-engine.js
- Read: app/api/listings/[id]/route.ts
- Searched: all /api/crm/ routes, all /api/idx/ routes, all hooks
- Grep: IDX_ENABLED across env files, mockListings references in CRM, API endpoint references

**Findings:** 2 blockers, 4 majors, 2 minors

**Details:**
- [B1] data/listings.json:5 - Empty fallback ("listings": []) means any Trestle failure = zero results with no error
- [B2] app/api/listings/route.ts:227-231 - Silent IDX failure: catches error, falls to empty fallback, returns success:true
- [M1] app/search/page.tsx - Never displays _compliance.source, can't distinguish IDX from fallback
- [M2] .env.local vs Vercel - IDX_ENABLED must be verified in Vercel dashboard, .env.example defaults to false
- [M3] Two separate data paths: /api/listings (public) vs /api/idx/search (CRM) - fixes to one don't affect other
- [M4] CRM Prisma fallback: /api/crm/listings reads from DB which may be empty if sync never ran
- [m1] app/agents/[name]/page.tsx:7 - Imports from empty listings.json
- [m2] public/crm/js/core/mock-data.js:21 - mockListings=[] on production, no data until API resolves

**Contract Registry:**
- GET /api/listings: public, no auth, returns PublicListingDTO[], IDX_ENABLED gate, empty fallback
- GET /api/idx/search: auth-gated (agent/broker), returns CRM flat shape, IDX_ENABLED + hasCredentials gate
- GET /api/listings/[id]: public, no auth, returns single PublicListingDTO, IDX_ENABLED gate, empty fallback
- GET /api/crm/listings: auth-gated, reads from Prisma DB (local sync data)

**Status:** Open - all items unresolved. Recommended: verify Vercel env vars, test Trestle credentials, add source indicator to frontend.
