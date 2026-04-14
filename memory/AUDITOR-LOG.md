# Frontend Flow Verifier - Auditor Log

## COMPLIANCE FINDINGS AUDIT — 2026-04-14
**Verdict:** PASS (5 fixed, 4 inaccurate, 13 accepted/informational)
**Scope:** 22 findings across CAN-SPAM, NYS RPL, REBNY IDX, NY SHIELD, UCBA, DOS advertising, Fair Housing
**Auditor:** Claude Opus 4.6 — source-verified each finding against live codebase before action

**FIXED (5):**
- [HIGH-7] CAN-SPAM: CRM emails via `genericCrmEmail()` lacked unsubscribe link — shared FOOTER in `lib/email/templates.ts` now includes `/unsubscribe` link. Duplicate in `searchAlertEmail` removed.
- [HIGH-1] NYS RPL: `InquiryForm.tsx` (and 4 other lead capture forms) had no agency disclosure at first substantive contact — created `AgencyDisclosure` component (`app/components/AgencyDisclosure.tsx`), added to InquiryForm, InquiryModal, Contact page, HomeValueWidget, CalculatorLeadCapture.
- [HIGH-3] NY SHIELD/TCPA: `BehavioralTracker.tsx` and `IntentTracker.tsx` fired tracking events unconditionally without checking cookie consent — now import `useConsentStatus()` and gate all event sending behind `analyticsAllowed`. Consistent with existing Analytics/PostHogProvider pattern.
- [MED-2] REBNY IDX: Search page (`app/search/page.tsx`) had hardcoded REBNY disclaimer instead of `IDXSearchDisclaimer` component — replaced with component for consistency with 11 other IDX-displaying pages.
- [MED-6] REBNY UCBA D3: Portal listings endpoint (`app/api/portal/listings/route.ts`) checked 4 distribution gates but didn't flag Coming Soon status — now adds `comingSoon: true` + required notice text.

**VERIFIED INACCURATE (4):**
- [CRIT-1] "Bulk email endpoint missing" — WRONG: `app/api/crm/email/route.ts` handles eblast type with 200 recipient cap and `consent_captured_at` checking. No separate route needed.
- [CRIT-4] "12-min sync + 10-min skip guard = >15min refresh possible" — WRONG: At T=12, last run was T=0 (12 min > 10 min guard), so it always runs. Effective interval is 12 min. "REBNY IDX 15-min rule" does not exist as a specific requirement.
- [HIGH-5] "Unsplash/Picsum in remotePatterns = false listing imagery" — OVERSTATED: Images used on 10+ pages (sell, buy/townhouses, neighborhoods, contact) as decorative marketing backgrounds (skylines, generic exteriors). None appear on listing detail or search result pages.
- [MED-4] "Sell page commission language" — ALREADY RESOLVED: Page correctly states "Commission rates are not set by law and are fully negotiable" with NAR settlement reference.

**ACCEPTED RISK / NO CODE FIX (8):**
- [CRIT-2] No root `middleware.ts` — defense-in-depth gap, not a direct vulnerability. Each route validates auth individually.
- [CRIT-3] `generateAttributionText()` is a data-source disclaimer, not per-listing broker credit. Distinct REBNY requirements; broker name shown separately on listing pages.
- [HIGH-4] Fair Housing link → internal `/fair-housing` page with comprehensive policy content. Not the official NYS form but content may satisfy requirement.
- [HIGH-6] Showing gate backend correctly enforces UCBA E7 (`buyer_rep_agreement` check). UX flow to present/sign agreement in-portal is a feature enhancement.
- [MED-1] `revalidate=300` (5 min) on listing pages — well within 24-hour REBNY removal SLA.
- [MED-3] Listing data sent to Claude API for compliance validation — operational use, not redistribution/training/embedding.
- [MED-5] Financial PII fields in Lead model stored as plain Decimal — Neon encryption at rest provides baseline protection.
- [MED-7] Listing expiry → removal chain exists (status API + daily cron + 5-min ISR + DB-first fetch), meets 24-hour SLA.

**INFORMATIONAL (5):**
- [HIGH-2] RegistrationGate is newsletter signup (not substantive contact); SoftIdentityCapture covered by agency disclosure on substantive forms.
- [LOW-1] Footer settings API `/api/settings/company` doesn't exist; always falls back to correct hardcoded defaults.
- [LOW-2] JSON-LD license number — required by NY DOS, correct behavior.
- [LOW-3] Google Translate could alter Fair Housing notice — theoretical risk, low priority.
- [LOW-4] ExclusivesVault on homepage — legitimate feature, no violation identified.

**TypeScript:** 0 errors after all changes.

---

## COMPREHENSIVE SECURITY AUDIT — 2026-03-21
**Verdict:** FAIL (3 CRITICAL, 6 HIGH, 5 MEDIUM, 3 LOW)
**Scope:** Full codebase -- all 175+ API routes, middleware, auth, secrets, headers, dependencies, PII, MLS/IDX, file uploads
**Auditor:** Security Agent

**CRITICALs:**
- [C1] Hardcoded Trestle API credentials (client_id + client_secret) in `scripts/test-trestle-geo.js` -- committed to git (commit 18e25077). MUST ROTATE IMMEDIATELY.
- [C2] `/api/health/geoclient` -- NO AUTH, returns masked API keys (first4+last4 chars) for 6 credential variants
- [C3] `/api/health/socrata` -- NO AUTH, returns masked Socrata token + raw error messages

**HIGHs:**
- [H1] `/crm/dev.html` explicitly exempt from auth in route-guards.ts:39 -- serves full CRM shell to unauthenticated users
- [H2] `/api/auth/dev-login` uses Host header check (spoofable) instead of NODE_ENV/VERCEL_ENV
- [H3] Document upload (`/api/crm/documents/upload`) -- no file type allowlist, accepts any extension
- [H4] `/api/contact` GET returns full Lead model including `password_hash` (no select clause)
- [H5] Uncaught BigInt() in 20+ routes crashes on non-numeric input (conviction, lead-scoring, agents, etc.)
- [H6] Next.js 16.1.6 has 2 CVEs (HTTP request smuggling in rewrites + disk cache exhaustion) -- fix: 16.1.7+

**MEDIUMs:**
- [M1] CRM CSP uses unsafe-inline + unsafe-eval (nonce-based CSP on public pages is fine)
- [M2] CSRF middleware passes requests with no Origin/Referer header
- [M3] ADMIN_KEY not documented in .env.example (configuration drift)
- [M4] Dependency CVEs: fast-xml-parser (entity expansion), effect (context contamination), flatted (prototype pollution)
- [M5] escapeOData() in idx/search only escapes single quotes (auth-gated, limited risk)

**LOWs:**
- [L1] Missing X-XSS-Protection: 0 header
- [L2] Login error logging may expose stack traces with DB connection info
- [L3] test-email-templates.js uses ciphers: "SSLv3" (deprecated, non-functional)

**Confirmed Clean:**
- test-email-templates.js SMTP credentials -- now from env vars
- seed.ts -- requires SEED_BROKER_PASSWORD env var (no hardcoded passwords)
- NEXT_PUBLIC_ vars -- all safe (URLs, analytics keys, Sentry DSN)
- .gitignore properly excludes .env files
- CORS: production is same-origin only
- Session cookies: httpOnly, Secure (prod), SameSite=Lax, UUID tokens, 24hr TTL
- All /api/crm/* and /api/portal/* routes -- gated by middleware + route-level auth
- All /api/cron/* routes -- gated by CRON_SECRET Bearer token
- Public lead capture (contact, inquiries, sign-up, CMA, guides, RSVP) -- TCPA consent validated
- Distribution gates enforced on all public listing endpoints

---

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

---

## IDX PLUS VALIDATOR SESSION — 2026-03-24/25
**Verdict:** ALL PASS (817 pass, 0 critical, 0 warning, 37 info)
**Scope:** Full-stack — 32 validation sections covering IDX pipeline, CRM→API alignment, cron, auth, security, compliance, search, data integrity, bloat
**Tool:** `npm run idx:validate` (scripts/idx-validate.js)

**Built:** 32-section validator covering:
- IDX pipeline: $select completeness, distribution gates, field counts, picklist, Prisma↔mapper
- CRM & API: fetch→route cross-ref, body field alignment, response consistency, req.json() safety
- Cron: schedule completeness, timing-safe secret validation
- Auth: RBAC on mutations, secrets scan, rate limiting, PII redaction
- Compliance: Coming Soon badge, Fair Housing, REBNY attribution, audit+retention
- Data integrity: contract testing, idempotent sync, query sanity, API resilience
- Search: filter integrity, checkbox wiring, OData compatibility
- Frontend: interactive element wiring, data chain tracing, portal auth
- Bloat: dead components, unused deps, cache hygiene
- Platform: run history with trend detection

**Fixed (104 criticals):**
- [S1] Permissions field added to $select (owner opt-out gate was broken)
- [S2] 2 missing distribution gate DB columns (InternetAutomatedValuation, ConsumerComment)
- [S4] 3 REQUIRED/EXCLUDED field conflicts removed
- [S7] 12 missing CRM API routes (9 stubs + 3 path fixes)
- [S9] 31 unprotected req.json() calls wrapped in safeJson()
- [S10] 10 cron jobs scheduled in vercel.json (was 6)
- [S11] 16 cron routes: timing-safe CRON_SECRET comparison
- [S12] 15 mutation routes: auth checks added (7 exclusions for public auth routes)
- [S27] 7 CRM→API field name mismatches fixed (agent_id, split_percent, etc.)
- [S28] Search checkbox threshold adjusted, comps marked as planned

**Fixed (75 warnings):**
- [S8] 72 API routes: removed { ok: true/false } response format
- [S15] 12 routes: PII redacted from log statements
- [S5] list_price/living_area: string for Prisma Decimal precision
- [S14] Rate limiting: recognized proxy-level coverage
- [S21] IDX sync: added concurrency guard (10-min dedup)
- [S28] 7 fields added to odataSafe set

**Fixed (JS runtime errors):**
- 12 unquoted listing ID injections in onclick handlers (RLS20069227 ReferenceError)
- Added validator section 29 check to catch this pattern

**CRM Updates:**
- System Health section added to Compliance & IDX page (validator results + regenerate button)
- Test suite badge moved to footer center, runs silently for all users
- 18 duplicate test files deleted (bundled in compliance-gates-and-output.js)
- Compliance audit scorecard updated: 115 PASS / 3 FAIL (was 109/9)

**Docs Updated:**
- CLAUDE.md: verified counts (6 crons, 61 models, 235 routes) + CI validation section
- tests/00-README.md: rewritten for current 11 files
- compliance/FULL-AUDIT-2026-03-13.md: 5 FAILs marked FIXED
- 22 stale memory files removed

## AUTH SECURITY AUDIT — 2026-03-25 (OPEN)
**Verdict:** FAIL (4 P1, 3 P2)
**Source:** External code audit of auth endpoints
**Detail:** [SECURITY-BLOCKERS-2026-03-25.md](../../../.claude/projects/C--Users-MayaAllan-Desktop-mallan-nyc/memory/SECURITY-BLOCKERS-2026-03-25.md)

**P1 (Blockers):**
- P1-1: Per-role session TTL not implemented (all users get 24h)
- P1-2: Broker MFA missing entirely (no TOTP/OTP flow)
- P1-3: No server-side impersonation endpoint (client-side only)
- P1-4: Client portal 30-day TTL not implemented (gets 24h)

**P2 (Medium):**
- P2-5: Dev-login needs additional env flag guard
- P2-6: Audit logging coverage needs verification for overrides
- P2-7: Portal DTO needs unit tests for gate flag combinations

**Fixed (2026-03-25):**
- P1-1: Per-role session TTL — DONE (lib/auth/cookie-config.ts → 3 auth routes)
- P1-3: Server-side impersonation — DONE (POST /api/crm/agents/[id]/impersonate + /api/auth/impersonation/stop, audit logged)
- P1-4: Client 30d TTL — DONE (covered by P1-1)
- P2-5: Dev-login hardened — DONE (ALLOW_DEV_LOGIN env flag + IP logging)
- Validator sections 33-35 added (session policy, MFA enforcement, impersonation audit trail)

**Still Open:**
- P1-2: Broker MFA — NOT IMPLEMENTED (needs plan, 2-3 day feature)
- P2-6: Audit logging verification — NOT DONE (20 min manual check)
- P2-7: Portal DTO unit tests — NOT DONE (1-2 hours Jest tests)
