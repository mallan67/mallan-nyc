# Repo-Wide Audit — Independent Verification (2026-06-07)

**Method:** read-only 9-agent forensic sweep of the **canonical** repo
(`C:\Users\MayaAllan\Desktop\mallan-nyc`, branch `ops/disable-scheduled-db-key-rotation`).
No edits, no DB connection, no `.env*` reads, no migrations/cron/deploy. Every CONFIRMED
item carries file:line proof. Classified per CLAUDE.md §J (Class A = static code-path,
authoritative for what the code does, NOT for live Cotality/Neon/Vercel state).

**Two audits were pasted by Maya and are adjudicated here:**
- **Audit-1** = the "deep-audit-mallan-nyc-2026-06-07" Codex run (against a *different* repo
  copy under `…\Documents\Codex\…`).
- **Audit-2** = the "brutal repo-wide" Codex audit (docs/route-catalog based, hedged).

Verdict legend: **CONFIRMED** (independently proven here) · **REFUTED/STALE** (claim does
not reproduce / already fixed) · **PARTLY TRUE** · **UNVERIFIED** (my sweep did not cover
it; needs its own proof before action).

---

## A. Headline verdict

The pasted audits are **largely real in pattern** — the meta-thesis ("many systems are
not proven end-to-end; two data models for the same business object; CI doesn't enforce
migration discipline; production protected by warnings not guards") is **correct and
matches my independent findings**. But:

1. They **mix current breakage with already-fixed history** and don't distinguish them.
2. They are **docs/route-catalog derived**, so several claims are **UNVERIFIED at code
   level** (portal offers model, impersonation provenance, Outlook, CRM panels, workspace
   isolation) — plausible, not proven.
3. They **missed** the most severe *currently-true, code-provable* issues (below, §C).

---

## B. Adjudication of the pasted claims

| # | Pasted claim | Verdict | Proof (this repo) |
|---|---|---|---|
| 1 | ~277–281 API routes; needs route-matrix enforcement | **CONFIRMED** | 284 route files under `app/api/**`. Manual coverage is unsafe at this size. |
| 2 | Ethics training NOT enforced per-request (helper exists, never called) | **CONFIRMED (P1)** | `assertAgentEthicsTrainingValid` `lib/auth/session.ts:68-89` is referenced only by its def, the re-export, and one test. No route/middleware calls it. `requireAgentOrBroker` `lib/auth/middleware.ts:78-82` only compares role. (Design choice per session.ts:18-26, but the per-request gate genuinely does not exist.) |
| 3 | Agent row isolation per-route / not global | **PARTLY TRUE** | `requireAgentOrBroker` validates role only; ownership is per-route `where` clauses. No concrete cross-agent leak proven in this pass — fragile by design, not a demonstrated hole. Recommend a `requireOwnedByOrBroker` helper. |
| 4 | Rental dashboard `applications_count: 0 // TODO` (fake metric) | **CONFIRMED (P2)** | `app/api/crm/rentals/listings/route.ts:55` literal `applications_count: 0 // TODO wire when Application model exists`. |
| 5 | Portal documents disabled (501, client-scope FK missing) | **CONFIRMED (P2)** | `app/api/portal/documents/route.ts:19` `TODO(SCHEMA-GAP-001)`, returns HTTP 501 + `unavailable:true` (fail-closed, safe). |
| 6 | Media: two models (`listing_media` table vs `listings.media` JSON); divergent classifier | **CONFIRMED (P1)** | Divergent floor-plan classifier: canonical `classifyTrestleMediaCategory` (`lib/media/media-sync-service.ts:112`, handles `"FloorPlan"` no-space) vs `lib/idx/mapping.ts:335` `mapRESOToInternal` (only `includes('floor plan')` WITH space) → a Trestle `MediaCategory:"FloorPlan"` is **misclassified as Photo** on the live Trestle-direct render path (`app/listing/[...slug]/page.tsx:234`, `app/api/listings/route.ts:813`). |
| 7 | CI uses `prisma db push --accept-data-loss`; migration history never exercised | **CONFIRMED (P1)** | `.github/workflows/pr-check.yml:94`. 23 committed migrations + `migrate deploy` script exist but CI bypasses them. |
| 8 | `validate-migration-discipline.js` exists but no workflow invokes it | **CONFIRMED (P2)** | `validator:migration` (package.json:46) absent from `.github/**`. SQL-views + seed steps are `continue-on-error: true` (pr-check.yml:97,106). |
| 9 | `rotate-db-keys` still manually runnable, writes DB URLs to GitHub/Vercel | **CONFIRMED (registry W2)** | Schedule disabled, but the workflow file is intact and dispatchable; still hardcoded to the dead `morning-bread` project. Latent production-cut landmine. |
| 10 | `neon-branch-prune` armed, trusts ambiguous `NEON_PROJECT_ID` | **CONFIRMED (P2)** | `vercel.json:10` cron `0 4 * * *` armed daily — directly contradicts the CLAUDE.md "DO NOT prune morning-bread" hold. |
| 11 | Stale security doc (xlsx high-sev) — now ExcelJS | **CONFIRMED (stale doc)** | No `xlsx` in tree; `exceljs@4.4.0` is used (and pulls the `tmp` advisory instead). The doc is outdated. |
| 12 | media-sync was blind for 21 days | **CONFIRMED (historical)** | Established in the 2026-05-21 incident + root-cause registry. |
| 13 | Sales-form round-trip architecture bugs (Condop→Condo, heating arrays, address atoms…) | **PARTLY TRUE — mostly HISTORICAL** | These trace to the pre-2026-05-30 form pipeline; the 2026-05-30 true-flow audit reports most fixed. My sweep did NOT re-run a live form round-trip — **UNVERIFIED on current main**; residual internal/canonical naming debt is plausible. Needs a field-contract test, not assumed broken. |
| 14 | Buyer/Tenant deal submit = silent-success stub | **LIKELY FIXED — re-verify** | Runtime suite (1997/1997) includes deal-form submit-wiring tests that pass; Audit-1 also shows it passing. PR #146 appears landed. Needs one live probe to fully close. |
| 15 | Broker impersonation lacks per-write provenance (`impersonated_by_broker_id`) | **UNVERIFIED — plausible** | Impersonation route + `impersonate_start` audit exist; I did not trace whether downstream writes carry broker provenance. Worth a dedicated check. |
| 16 | Portal offers use `ClientListingAction` blob vs relational `Offer` | **UNVERIFIED — plausible** | Not traced in this pass. |
| 17 | Portal write routes (offers/showings/comments…) lack rate limits | **UNVERIFIED — plausible** | I confirmed public lead-capture routes ARE rate-limited and **auth routes are NOT** (see C); portal writes not individually enumerated. |
| 18 | `requireWorkspace()` not enforced uniformly on portal writes | **UNVERIFIED — plausible** | Not traced. |
| 19 | Outlook import sequential, no bulk, no rate limit | **UNVERIFIED — plausible** | Not traced. |
| 20 | CRM analytics panels (seller prospects, pitch packet Save Comps, lease "Add Lease", approval queue, commissions) partial/local-only | **UNVERIFIED — plausible** | Not traced; these are exactly the "UI says success, flow unproven" risks worth a targeted sweep. |
| 21 | Seed mismatch (`seed.ts` vs CI expecting `seed.js`) | **UNVERIFIED** | `prisma/seed.ts` exists; CI seed step is `continue-on-error`. The specific `.js` expectation not confirmed. |

**Net on the pasted audits:** every *infrastructure / CI / Neon / media-architecture /
ethics-gate / fake-metric* claim I could test **reproduced**. The *CRM/portal/forms/Outlook*
claims are **plausible but docs-derived and unproven** — do not action them without a
code-level trace. The *forms* horror stories are **mostly historical**.

---

## C. What BOTH pasted audits MISSED (currently true, code-proven here)

These are the highest-value additions from the independent sweep. All Class A.

### C0 — Compliance-critical (P0)
- **Coming Soon badge does NOT render on the detail-page DB path.** The detail page's
  inline `fetchFromDB` DTO (`app/listing/[...slug]/page.tsx:653-657`) sets only
  attribution/disclaimer — it **never sets `_displayCompliance.comingSoon/comingSoonDate`**.
  The badge gate at `page.tsx:1321` therefore never fires for a Coming Soon listing served
  via the DB-first path (the primary path). The Trestle-direct path *does* set it
  (`lib/idx/public-dto.ts:507-511`). → A Coming Soon listing can render on detail with **no
  "No Showings/Open House" badge** — REBNY UCBA Art. I §16(C). Single-PR fix (failing test
  → set the field). *Static-proven; live render probe still advised.*
- **FARE Act disclosure has a single point of failure.** The entire block is gated on
  `isRental` (`page.tsx:1725`), derived solely from `listingType === 'rent'`
  (`page.tsx:946`). Any rental mis-typed as sale (DB `listing_type` ≠ `'rent'`, or Trestle
  `PropertyType` lacking substring `lease`) renders **zero** FARE text. The 2026-05-20 A4
  exposure shape persists in the `listingType` derivation. SplitCard also omits the
  `FareActFeeBadge` (`SearchListingCard.tsx:449-504`). *Requires a live production-rental
  probe to close, per §F.*

### C1 — CI gate is RED right now (P1)
- **`npm run type-check` FAILS (exit 2, 6 errors).** `lib/idx/__tests__/coverage-backfill-preview.test.ts`
  imports `@/lib/idx/coverage-backfill-preview`, which **does not exist** (TS2307 ×2 +
  TS7006 ×4 cascade). This breaks the project's own §G gate and the `ci` script chain. The
  test is orphaned — its implementation was never committed (or was removed). Neither pasted
  audit caught this. (Audit-1 even claimed type-check passes — REFUTED on this repo.)
- **`npm run test:scanner` fails 2 tests — but it's expired-fixture rot, NOT a
  Fair-Housing hole.** `suppression.test.ts` mock entry `ms-002` has `expires_at:
  "2026-06-01"`; the suite runs with `now = 2026-06-07`, so the (correct) live-expiry filter
  drops it. Production `mallan-suppression-list.json` is `entries: []`. The matcher
  (`suppression.ts:33` normalize: trim+lowercase+collapse) is **sound**. Fix = bump the
  fixture date. *Refutes the "owner opt-out safety hole" framing — but the suite is red and
  masks future regressions.*

### C2 — Security headers contradiction (P1)
- **`vercel.json` and `proxy.ts` both set security headers, with a DIFFERENT
  `Permissions-Policy` value.** `next.config.js:42-44` declares `lib/middleware/security-headers.ts`
  the single source of truth and says the `vercel.json` headers block was to be deleted in
  "Phase 3" — **it never was** (`vercel.json:94-114`). Middleware allows `geolocation=(self),
  payment=(self)`; vercel.json denies them. The two layers fight at the edge. (Audit-1's
  "duplicate Permissions-Policy *within* vercel.json" is REFUTED; the real issue is the
  cross-layer value conflict.)

### C3 — Missing routes silently swallowing data (P1)
- **`/api/analytics/event` does not exist** but `app/components/Analytics.tsx:34,51-53`
  POSTs to it (sendBeacon/fetch), `catch {}` at :60. All pageview/cta analytics → 404,
  silently lost.
- **`/api/favorites/sync` does not exist** but `app/components/FavoriteEmailPrompt.tsx:63-67`
  POSTs to it — a **lead-capture path** (email + favorites) silently lost. *Neither pasted
  audit caught favorites/sync.*

### C4 — Auth brute-force exposure (P1)
- **`auth/login` has no rate limit, no lockout, no failed-attempt counter** — unlimited
  password guesses per account (credential stuffing). MFA-verify has a 5-attempt lockout,
  but the password check itself is unthrottled. `forgot-password`/`reset-password`/
  `change-password`/`agent/register` likewise unthrottled. (Public lead-capture forms ARE
  rate-limited — the gap is specifically the auth surface.)

### C5 — Dependency exposure (P1)
- **12 prod vulns (5 high / 7 moderate / 0 critical).** Highest: **`next@16.2.4`**
  (declared `^16.1.6`) — auth/middleware-bypass + SSRF; fix = bump to **≥16.2.6**. Others
  (`axios`/`protobufjs`/`tmp`/`fast-xml-builder`) are transitive on lower-blast-radius
  paths. (This CONFIRMS Audit-1's dependency numbers exactly.)

### C6 — Other current, code-proven items
- **`ops:http-smoke` is a dead command** — package.json:75 → `scripts/phase5-adapter-smoke.js`
  (missing). (CONFIRMS Audit-1.)
- **Systemic nested `<main>` ×50** under the root `app/layout.tsx:376` main + redundant
  `role="main"` on `app/page.tsx:38` — invalid landmark nesting site-wide (P1 a11y).
  Listing-detail "two h1" is **REFUTED** (mutually-exclusive ternary), but the surviving h1
  is a non-descriptive 13px neighborhood label (P2).
- **Contact form required fields lack `required`/`aria-required`** (`app/contact/page.tsx:324,350,394`)
  — JS-only validation (P2). (Seller/landlord HTML forms DO use native `required` — gap is
  the React contact form only.)
- **Two unbounded public `findMany`** (P2): `app/sitemap.ts:80` (all displayable listings,
  every crawl) and `app/api/open-houses/route.ts:270` (all future showings + join). No `take`.
- **FARE move-in-fee path asymmetry** (P2): `toPublicDTO` (Trestle-direct,
  `public-dto.ts:492`) omits `moveInCostsAmount/Comments` that `dbListingToPublicDTO`
  (`db-to-public-dto.ts:461`) sets — same listing discloses the fee on one path, not the other.
- **Fair-Housing render-time scan gap** (P1): public `publicRemarks` rendered verbatim
  (`page.tsx:1550-1563`); the prohibited-term scanner is **write-path only**
  (`rls-enforcement.ts:569-574`) — third-party IDX descriptions are never re-scanned at render.
- **Footer attribution wholesale-replace** (P1): `Footer.tsx:61` replaces all settings if
  `/api/settings/company` returns any object with `companyName` — a blank `license`/`address`
  in that payload would blank the §175.25 footer. No per-field fallback.
- **Client-side Sentry fully disabled** (`instrumentation-client.ts:1-8`) + server source-map
  upload disabled (`next.config.js:49`) → near-zero production error visibility (P2).
- **`picsum.photos` + `images.unsplash.com` in the prod `next/image` allowlist**
  (`next.config.js:25-26`, also CSP) — stock/placeholder hosts on a brokerage site (P2).
- **`media-backfill` cron route is orphaned-but-deployed** (only `app/api/cron/**` route with
  no `vercel.json` schedule) yet code/recovery scripts still assert it "runs every 8 minutes"
  (`app/api/listings/route.ts:499`, `lib/idx/sync.ts:817`) — a 3rd mutating media writer with
  false self-heal assumptions (P1).

### C7 — Good news (old worries REFUTED as already-closed)
- **Public/displayable status sets are now RECONCILED** — `ALLOWED_PUBLIC_STATUSES`,
  `DISPLAYABLE_STATUSES`, `ACTIVE_DISPLAY_VALUES`, alerts path, and sitemap all agree on
  `{Active, ComingSoon, ActiveUnderContract}`. The historic D5 "alert-gate divergence" is
  closed (now routes through `buildProjectionSearchWhere`→`ACTIVE_DISPLAY_VALUES`). Residual
  is P3 DRY-ness (4 literal copies).
- **CRM pagination caps reconciled to 200** on leads/clients/listings (Audit-1's "leads=500"
  is REFUTED — already fixed). Genuine 500/1000 outliers remain on *other* CRM routes
  (communications, ce-courses, referrals, growth-tools…) — P2.
- **`@ts-ignore` count in non-test source = 0.** Parallel-file charter = clean for protected
  surfaces. No unauthenticated mutating route writes privileged data without a guard; all 24
  cron routes enforce `CRON_SECRET`.

---

## D. Compliance-critical subset (cannot wait, all proven here)
1. **C0** Coming Soon badge missing on detail DB path (UCBA §16(C)) — P0.
2. **C0** FARE Act single-point-of-failure on `listingType` (LL 119/2024) — P0.
3. **C6** Fair-Housing third-party remarks never re-scanned at render — P1.
4. **C6** Footer §175.25 attribution wholesale-replace risk — P1.
5. **C3** `/api/favorites/sync` lead-capture silently lost — P1.
6. **B6/B9** rotate-db-keys + neon-branch-prune landmines — P1/P2.
7. **B2** ethics gate absent per-request — P1.

## E. Holds (unchanged)
Nothing started. No code, DB, migration, cron, env, or R2 changes. `rotate-db-keys` must not
be dispatched. This document is report-only. Per-step fixes await explicit Maya approval.
