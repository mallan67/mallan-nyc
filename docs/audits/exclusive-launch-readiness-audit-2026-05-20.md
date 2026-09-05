> **HISTORICAL NOTE (2026-09-05, Search Consolidation Packet 2):** any mention of **RealPlus** in this document describes a former submission tool and is retained as history only. RealPlus has no role in Mallan's application architecture. Cotality/Trestle (`api.cotality.com/trestle`) is the only provider and feed authority; REBNY RLS submission happens outside this system. See `docs/search/checkpoints/2026-09-05-carry-forward-after-validators.md` §5.

# Mallan.nyc Exclusive-Launch Readiness Audit — 2026-05-20

> **REPORT ONLY.** No code changes were made during this audit. No PRs opened beyond this doc-only PR. PR 5B remains held. Syndication exports remain disabled. Sentinel untouched. Env / Neon / migrations / cron-config unchanged. `scripts/__pr147-soak-verify.mjs` remains untracked per standing rule.

| | |
|---|---|
| **Audit date** | 2026-05-20 |
| **Branch under audit** | `main` @ `8cc63caa` (post-PR-#164) + PR #165 (OPEN — Phase A — inspected via diff) |
| **Production URL** | https://mallan.nyc |
| **Method** | 4 parallel specialized agents (frontend-auditor, tristle-rebny-compliance, vercel:performance-optimizer, general-purpose backend/SEO) + direct production probes + source inspection |
| **Soak state at audit time** | drift=0, `sync.state=ok`, §2.05 violations=0, `projection_reconcile_audit_events_since_merge=1,889` (no unauthorized re-run) |
| **PRs queued** | PR #165 (Phase A, OPEN), PR #159 (international, OPEN), PR #160 (research memo, OPEN), PR #62 (SMS reset, HELD) |

---

## 1. Current launch readiness grade

**Grade: FAIL — DO NOT LAUNCH YET.**

~~Four~~ **Three** Class-A frontend blockers must close before the new exclusive can take paid-social traffic on mobile.

> **CORRECTION 2026-05-21 (PR-A4):** A4 (FARE Act not rendering) was a **false positive** — a 15-listing live HTTP probe confirmed the disclosure renders correctly on every production rental. A4 downgraded from Class A to Class E. See the §2 A4 row for the corrected verdict and the regression-pin test that locks the behavior.

| Lens | Verdict | Rationale |
|---|---|---|
| **Compliance gate (REBNY UCBA / IDX Plus / §2.05 / Fair Housing / NY DOS attribution)** | ✓ PASS | 46/46 UCBA, 0 regressions; 1278/0 IDX validator; 93/93 compliance-check; Footer attribution everywhere; Fair Housing scanner clean across `app/**/*.tsx`; CRM write paths fail-closed via `assertRlsCompliantPayload`. |
| **Backend / API / data path** | ✓ PASS | Listing-create → public reader → contact form → Lead → AuditEvent chain complete. DB-first reader still uses `listings` directly (PR 5B held), so new exclusive surfaces immediately on Active. |
| **Frontend visual + UX (mobile 390 + desktop 1440)** | ✗ **FAIL** | Listing detail page horizontally overflows on every mobile device (scrollX = 1266 px masked only by `body { overflow-x: hidden }`); no 44×44 contact CTA above the fold on mobile; intent-routed contact form is not implemented on main. ~~FARE Act disclosure does not render on actual production rental listings.~~ → FARE rendering confirmed working 2026-05-21 (PR-A4 verification). |
| **Performance / Core Web Vitals** | ⚠️ NEEDS IMPROVEMENT | Featured cards don't preload first row → mobile LCP hit; cold-cache first visit on new exclusive can hit 10s Trestle fallback. Two pre-launch rituals required. |
| **Compliance — FARE Act on rendered rental detail** | ✓ PASS (corrected 2026-05-21) | ~~Live probe shows the LL 119/2024 disclosure not rendered.~~ **CORRECTION:** 15-rental live probe on 2026-05-21 confirmed disclosure renders on every rental tested (including the auditor's exact listing). Regression-pin test at `tests/runtime/listing-fare-act-disclosure.test.ts`. |
| **Syndication (release of new exclusive)** | ✓ SAFE | `MALLAN_OFFICE_MLS_IDS=[]` + Layer 1.PRE empty-config-guard blocks every row at PR #162 + #163 invariant I.5/I.6. No `/api/exports/*` route exists. |
| **SEO / AEO** | ✓ PASS (with 2 trims worth a follow-up) | Sitemap fresh (10,573 listing URLs, lastmod T-11min); JSON-LD RealEstateListing + Agent + BreadcrumbList present; OG + Twitter cards on listing detail. Homepage missing `og:image` + `og:type`. `llms.txt` is generic-brand only (no exclusive surfacing). |
| **Seller portal** | ✓ PASS | All 7 tabs wired; invite-token 410 on expired; portal-role scoped; agent PII masking correct (seller IS the owner). |

**Verdict in one line:** the backend + compliance + syndication posture is launch-ready, but the public mobile listing-detail surface is currently broken in a way that would alienate every mobile visitor from the exact paid-social traffic the new exclusive is intended to attract. Fix the 4 Class-A items below, then launch.

---

## 2. Must-fix list (Class A — block exclusive launch)

| ID | Finding | Evidence | Class | Surface |
|---|---|---|---|---|
| **A1** | **Listing-detail mobile grid blow-out** — outer grid `grid lg:grid-cols-3 gap-8 lg:gap-10` at `app/listing/[id]/page.tsx:1192` resolves to `gridTemplateColumns: "1640px"` at <lg viewport (390 px). Inner `<section>` blocks render at 1640 px. Only `body { overflow-x: hidden }` cosmetically masks horizontal scroll (scrollX measured 1266 on mobile). **Affects every listing detail page**, sale + rental. | frontend-auditor Playwright measurement on production; `app/listing/[id]/page.tsx:1192` | **A** | Frontend (mobile) |
| **A2** | **No contact CTA ≥44×44 above the fold on listing detail at 390 px** — sidebar agent-contact stacks BELOW the gallery on mobile. The new exclusive's paid-social visitor lands and sees a photo, scrolls, sees more photos — never sees a contact button without scrolling past the entire above-the-fold. | frontend-auditor 0 button matches in top 844 px DOM scan | **A** | Frontend (mobile) |
| **A3** | **`?intent=` URL parameter is NOT implemented on `/contact` in main** — `grep "intent" app/contact/ app/api/contact/` returns 0 matches. The intent-routing fix (international-seller, townhouse-seller, etc.) lives on PR #159's branch, NOT on main. Any landing page or marketing email that links `?intent=...` to `/contact` is silently broken on production today. | Source grep + production probe of `/contact?intent=international-seller` | **A** | Frontend / backend wiring |
| ~~**A4**~~ → **E** | ~~FARE Act disclosure (NYC LL 119/2024) NOT rendered on actual production rental listings~~ — **CORRECTION 2026-05-21 (PR-A4):** **FALSE POSITIVE.** A 15-listing live HTTP probe on 2026-05-21 confirmed the disclosure renders correctly on every production rental tested, including the auditor's exact listing `/listing/815-5th-avenue-apt-duplex-new-york-city-ny-10065-rls20091223` (1× FARE phrase rendered). The frontend-auditor's grep apparently missed the phrase in the server-rendered HTML. **No legal exposure existed; A4 is downgraded from Class A to Class E (already working).** Regression-pin test added at `tests/runtime/listing-fare-act-disclosure.test.ts` + companion live-probe script `scripts/__verify-fare-rendering.mjs` (untracked) so a future code change that removes or moves the disclosure outside the `{isRental && ...}` gate fails CI. A separate Class-C finding surfaced during verification: 3 of 15 rentals render the disclosure 2× (duplicate render — cosmetic, no compliance impact, tracked separately). | frontend-auditor's original probe (false positive); PR-A4 15-rental sweep (corrected verdict) | ~~**A**~~ → **E** | Compliance + frontend rendering |

---

## 3. Nice-to-have list (Classes B, C, D, E)

### Class B — should fix before PR 5B reader swap
| ID | Finding | Source |
|---|---|---|
| B1 | Merge PR #165 (Phase A) — closes W1/W2/W3 writer-path projection dual-write + adds CI pin. Documented byte-identical to prior code for real Trestle inputs; one-sided defensive improvement on lowercased status. | tristle + general-purpose agents |
| B2 | `/api/inquiries` does not call `createNotification` for the listing's owning agent — currently emails brokerage mailbox only. For multi-agent exclusives the listing agent gets no per-listing in-app ping. `app/api/inquiries/route.ts:145-198`. | general-purpose agent |
| B3 | Hero PNG re-encode — `public/images/hero.jpg` is actually a PNG (Content-Disposition shows `filename="hero.png"`), shipping 703 KB raw; WebP transcode works (162 KB) but source could be a 90-quality JPEG ~200–250 KB. | vercel:performance-optimizer |
| B4 | IDXImage white-border canvas detector is statically imported into every card surface even when `autoCropWhiteBorder=false`. Dynamic-import inside `handleLoad` saves ~3–6 KB gzip per public surface. `app/components/IDXImage.tsx:1-7`. | vercel:performance-optimizer |
| B5 | Unsplash placeholders leak through `/_next/image` (homepage shows 14 distinct Unsplash `srcsets`), silently drawing on Vercel's 5K/mo Image Optimization free tier — the IDXImage native-img path was specifically designed to avoid this. | vercel:performance-optimizer |
| B6 | Two `<h1>` on listing detail (sale + rental) — both show price plus a second h1. WCAG 1.3.1 violation. | frontend-auditor |
| B7 | Nested `<main>` on `/contact` — regression of a prior fix recorded in `.claude/agent-memory/frontend-auditor/MEMORY.md:55-58`. | frontend-auditor |
| B8 | Contact form fields lack `required`/`aria-required` attributes despite "*" in labels (JS-only validation). | frontend-auditor |
| B9 | `/buy` redirects to `/search` — no dedicated buyer landing surface. | frontend-auditor |
| B10 | Status badges on `/search` listing cards count = 0 in `[class*="badge"]` scan — Active / ComingSoon may not be visually called out. | frontend-auditor |
| B11 | Robots.txt: ChatGPT-User + PerplexityBot can crawl `/buy` + `/rent` (which are search-grid surfaces) while wildcard blocks `/search`. Confirm intent. | general-purpose agent |
| B12 | Homepage missing `og:image` + `og:type` (twitter card is complete, OG is partial). Degrades Facebook/LinkedIn share preview of `/`. | general-purpose agent |
| B13 | `llms.txt` is a static brand profile — does not reference active inventory or the new exclusive. AEO bots have nothing listing-specific to crawl. | general-purpose agent |

### Class C — safe post-launch improvement
| ID | Finding | Source |
|---|---|---|
| C1 | `RENTAL-FORM-REDESIGN.html` missing `ComingSoon` `<option>` in `MlsStatus` picklist — 1 RLS validator WARNING. | tristle |
| C2 | H2 deploy/cron race — no post-deploy gate-fail-rate diff alarm (architectural). Documented in `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md:169-173`. | tristle |
| C3 | H3 cron heartbeat observability patchy — `idx_sync` ~71/24h vs expected 120; no unconditional heartbeat row. | tristle |
| C4 | M1 — investigate empty `saved_searches` table. | tristle |
| C5 | Build the `npm run ops:system-audit` permanent command per spec in `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md:189-208`. | tristle |
| C6 | Listing detail imports 30+ heavy components inline (BuildingUnits, PriceHistory, SimilarListings, SchoolInfo, etc., `app/listing/[id]/page.tsx:10-38`) — wrap below-fold sections in `dynamic()` or `<Suspense>`. | vercel:performance-optimizer |
| C7 | Add `preconnect` / `dns-prefetch` for `images.mallan.nyc` (R2 host) — currently only `api.cotality.com` is hinted. | vercel:performance-optimizer |
| C8 | Overpass API POI returns HTTP 406 4×/24h (silent — POI panel shows empty). Triage User-Agent header or switch provider. | vercel:performance-optimizer |
| C9 | Sentry source-map upload disabled (`next.config.js:9-10, 47-50`). When `SENTRY_AUTH_TOKEN` is provisioned, flip on. | vercel:performance-optimizer |
| C10 | Soak window post-PR-#165 merge: run `npm run ops:health` at T+24h; verify §2.05 stays 0. | tristle |
| C11 | No CRM panel UI for `/api/featured-config` PATCH — Maya pins via `curl` today. UX-only. | general-purpose |
| C12 | `/buy/international` + `/sell/international` 404 — PR #159 not merged. UX/marketing — non-blocking. | frontend-auditor |

### Class D — requires schema / env / legal / partner approval
| ID | Finding | Source |
|---|---|---|
| D1 | ISR `revalidatePath('/listing/[slug]')` trigger inside `idx-sync` cron when a new MLS row appears — eliminates cold first-visit risk. Touches `lib/idx/sync.ts` + cron route. Spec under master-plan PR 5; evaluate AFTER PR 5 lands. | vercel:performance-optimizer |
| D2 | Populate `MALLAN_OFFICE_MLS_IDS` in `lib/syndication/mallan-identity.ts:89-93` AND backfill `Agent.trestle_mls_id` — required ONLY when/if syndication is enabled. Confirm Office MLS ID via RealPlus broker dashboard or `rlssupport@rebny.com` / 212-616-5270. Not required for the imminent launch. | tristle + general-purpose |

### Class E — already working (no action)
- Sitemap: 10,573 listing URLs, lastmod fresh to T-11min, well-formed XML.
- Robots.txt: 18 user-agent blocks, deliberately tiered AI permissions, sitemap declared.
- JSON-LD on listing detail: RealEstateListing + BreadcrumbList + RealEstateAgent (inherited from layout).
- OG + Twitter cards on listing detail: complete set including `og:image`, `og:image:alt`, `og:type`.
- Footer license `10991205323` + brokerage name + phone + address on every page.
- Fair Housing footer text on every page; `/fair-housing` includes Federal + NYS + NYC + source-of-income classes.
- REBNY courtesy + IDX disclaimer on homepage Featured + Search.
- Honeypot `fax_line` on contact form.
- Cookie consent banner everywhere.
- Skip link first in tab order.
- Image alt text on listing detail (0 missing of 45 imgs).
- All 8 public lead-capture endpoints record/check `consent_captured_at` (TCPA/CAN-SPAM); `crm/email` and `crm/sales/prospects/[id]/outreach` actively block sends without consent.
- All 3 CRM listing-write paths fail-closed via `assertRlsCompliantPayload` (POST + PATCH + status PATCH).
- ISR `revalidate=300` on listing detail; 1-year `Cache-Control: immutable` on `/_next/static/*` + `/images/*`.
- Skeletons match loaded geometry (4:3 photo box) — CLS risk near zero on homepage.
- Gallery uses `fetchPriority="high"` on active photo + `loading="lazy"` on thumbnails.
- Next/font + font preload + `display: swap` (non-blocking, zero-CLS).
- `preconnect` + `dns-prefetch` for `api.cotality.com` in place.
- Seller portal: 7 tabs (dashboard, properties, showings, offers, documents, family, profile) + portal-role scoping + invite-token 410 on expired.
- Featured config persistence via `FeaturedConfig` Prisma model + broker-only PATCH (caps PINNED_IDS_CAP=12, DISPLAY_LIMIT_MAX=24).
- Syndication scaffold fail-closed at Layer 1.PRE (`MALLAN_OFFICE_MLS_IDS=[]` → every row blocked unconditionally before 1a/1b/1c/1d).
- Listing-create transaction with advisory lock on listing_id generation.
- Compliance-check 93/93 BLOCKER+STRICT, UCBA 46/46 (0 regressions), IDX 1278/0 critical, full runtime+lib 1933/1933 pass.

---

## 4. Design issues

| Severity | Finding | Surface | Fix shape (do not implement without approval) |
|---|---|---|---|
| A | Mobile horizontal overflow on listing detail (A1) | All listing detail pages on mobile | Replace `grid lg:grid-cols-3` with a stack on <lg (e.g., `flex flex-col lg:grid lg:grid-cols-3`) and audit every inner `<section>` for fixed widths. |
| A | No 44×44 CTA above the fold on mobile listing detail (A2) | Listing detail mobile | Add a sticky-top or sticky-bottom contact CTA on <md, OR move the agent-contact card above the gallery on mobile. |
| B | Two `<h1>` on listing detail (B6) | Listing detail | Demote the second h1 to h2 or h3 per WCAG 1.3.1. |
| B | Nested `<main>` on `/contact` (B7) | Contact page | Remove the inner `<main>` — `app/layout.tsx` already wraps in `<div id="main-content">`. |
| B | Status badges invisible on `/search` cards (B10) | Search results | Add visible Active / ComingSoon badge styling. |
| C | Listing detail imports 30+ heavy components inline (C6) | All listing details | Code-split below-fold sections. |

---

## 5. Functional issues

| Severity | Finding | Surface | Notes |
|---|---|---|---|
| A | `/contact?intent=...` parameter not implemented on main (A3) | Contact form intent routing | Lives on PR #159 branch only. Marketing emails / landing pages that use intent= are silent fails on production. |
| A | FARE Act disclosure not rendered on production rental listings (A4) | Rental listing detail | Code present in `page.tsx:1546-1555` but conditional not firing — investigate the rental-detection conditional. |
| B | `/api/inquiries` does not notify listing owning agent (B2) | Lead routing | Currently emails brokerage mailbox only. |
| B | Contact form `required` / `aria-required` missing (B8) | Contact form | JS-only validation. |
| C | Overpass POI 406 warnings (C8) | POI panel | Silent fail. |

---

## 6. Backend / CRM issues

| Severity | Finding | Files | Notes |
|---|---|---|---|
| A→B (after PR #165 merges) | W1/W2/W3 writer-path projection dual-write gap | `app/api/crm/listings/[id]/status/route.ts`, `app/api/cron/listing-expiration/route.ts`, `app/api/crm/listings/route.ts`, `app/api/crm/listings/[id]/route.ts` | Mitigated today by public reader using `listings` directly. Becomes real public-display gap once PR 5B reader-swap ships. **PR #165 closes these.** |
| C | CRM panel for Featured config PATCH (C11) | `/api/featured-config` exists; no UI panel | Maya pins via curl today. |
| C | Saved searches table empty (C4) | `prisma.savedSearch` | search-alerts cron runs daily with no work. |
| C | Permanent `ops:system-audit` command (C5) | New script | Spec in memory; not yet built. |

---

## 7. IDX / compliance issues

| Severity | Finding | Files | Regulation |
|---|---|---|---|
| A | **FARE Act disclosure missing on rendered rental detail** (A4) | `app/listing/[id]/page.tsx:1546-1555` (code present but conditional not firing) | **NYC LL 119/2024 §20-699.21 / §20-699.22 — $1,800 / $2,000 per violation** |
| B | RLS validator warning: `RENTAL-FORM-REDESIGN.html` missing `ComingSoon` enum (C1) | `public/crm/RENTAL-FORM-REDESIGN.html` | UCBA Art. I §16 picklist conformance |
| ✓ | All other REBNY / UCBA / Fair Housing / NY DOS §175.25 / TCPA / CAN-SPAM checks PASS | see Section E | n/a |

**Important contradiction surfaced during the audit:** the source-grep tristle agent reported FARE Act wired at `app/listing/[id]/page.tsx:1546-1555` (✓ found in source). The frontend-auditor verified the disclosure is **NOT rendered on the live rental listing URL `https://mallan.nyc/listing/815-5th-avenue-apt-duplex-...rls20091223`**. The live-page evidence is ground truth; the source-grep check (used by `npm run compliance-check`) does not verify actual rendering. This is a real Class-A legal exposure for the launch.

---

## 8. Exact next PR sequence

| Order | PR | Type | Scope | Why this order |
|---|---|---|---|---|
| 1 | **PR-A1-grid-fix** (NEW — needs to be branched) | Code fix | Replace `grid lg:grid-cols-3` with mobile-stack pattern in `app/listing/[id]/page.tsx:1192` + audit inner sections. Add mobile Playwright pin. | Fixes Class-A blocker A1. Highest-impact fix. |
| 2 | **PR-A2-mobile-cta** (NEW) | Code fix | Add sticky contact CTA on mobile listing detail OR reorder sidebar above gallery on <md. | Fixes A2. |
| 3 | **PR-A3-intent-routing** (NEW) | Code fix | Port the intent-routing logic from PR #159 to main as a small standalone PR (intent param read + hidden form field + pre-fill) — independent of the international page work. | Fixes A3 without unblocking the full PR #159 scope. |
| 4 | **PR-A4-fare-rendering** (NEW) | Code fix | Investigate why `app/listing/[id]/page.tsx:1546-1555` conditional is not firing for production rentals; fix the conditional + add a Playwright pin that confirms disclosure renders on a real rental URL. | Fixes A4 legal exposure. |
| 5 | **PR #165** (Phase A — EXISTING, OPEN) | Code | Centralize gate computation + wire W1/W2/W3 + CI pin. | De-risks PR 5B; closes the W1/W2/W3 paths the new exclusive will exercise. |
| 6 | (Optional) **PR-B1-inquiry-notify** | Code fix | `/api/inquiries` calls `createNotification` for the listing's owning agent. | Improves multi-agent flow. |
| 7 | (Optional) **PR-B6/B7/B8/B10** | Bundled small fixes | Two h1 → demote; nested main on /contact → remove; contact form `required`/`aria-required`; search badge styling. | All small, cleanup. |
| 8 | **PR-pre-launch-ritual-doc** | Docs only | Document the cache-warm procedure: after agent transitions Draft→Active, after next idx-sync confirms ingestion, curl the canonical slug URL twice before posting marketing link. Document the A1 retest as a launch-day go/no-go. | Captures the operational knowledge for future exclusive launches. |

**Then** the marketing push for the new exclusive can begin.

**PR 5B remains held** and is not unblocked by any item in this list.

---

## 9. PR #165 merge recommendation

**MERGE BEFORE LAUNCH.** Specifically: merge PR #165 AFTER the 4 Class-A frontend fixes (A1–A4) ship, BEFORE the marketing push.

**Reasoning:**
1. **The new exclusive will exercise W3.** A Mallan exclusive is CRM-authored via `app/api/crm/listings/route.ts` POST — pre-Phase-A, that POST writes `listings` but not the projection. Today this is masked because the public reader (`/api/listings`) still reads `listings` directly. The risk is asymmetric: if anyone touches projection-reader scaffolding between now and the exclusive's lifecycle ending, the one listing that matters most this week becomes invisible.
2. **W1 + W2 close other lifecycle paths** (status PATCH to terminal; auto-expiry) that the exclusive will eventually hit.
3. **CI is comprehensive on PR #165:** 1933/1933 runtime tests, UCBA 46/0, IDX validator 1280/0 critical, compliance-check 93/0. No schema change. No cron-config change. No env change.
4. **Semantic equivalence verified by the tristle agent**: helper at `lib/idx/trestle-mapper.ts:722-870` is byte-identical to prior inline computation for real Trestle inputs. The one documented behavior delta (lowercased `"closed"` → blocked at writer) is a one-sided defensive improvement and is locked by a test update at `lib/compliance/__tests__/c2-terminal-idx-display.test.ts:258-289`.
5. **Risk of merging:** ≈ 0.
6. **Risk of not merging before launch:** small but asymmetric — the only listing where a future projection-reader-swap regression would be most visible IS the one we're promoting.

---

## 10. Site readiness for the new exclusive

**Not ready.** Mobile listing-detail viewers will see horizontal overflow (Class-A blocker A1), no easy contact path (A2), broken intent links if marketing uses `?intent=...` (A3), and missing legally-required FARE Act disclosure on rentals (A4 — DCWP exposure $1,800–$2,000 per violation).

**Once A1–A4 are fixed + PR #165 merged:** the site will be ready to take and promote the new exclusive. Run the pre-launch ritual:
- Maya / listing agent creates the exclusive via CRM POST.
- Wait for next idx-sync (≤10 min).
- Confirm in `npm run ops:health` that drift stays 0 and §2.05 = 0.
- Curl the canonical listing URL from two different IPs to warm the ISR cache.
- THEN post the marketing link.

---

## 11. Operational holds (reaffirmed)

- ✗ **PR 5B (`refactor/05-listing-search-projection`)** — NOT STARTED · held
- ✗ **External-inventory implementation** — held behind PR 5B + Maya approval
- ✗ **Syndication exports / partner integrations** — `MALLAN_OFFICE_MLS_IDS=[]` blocks all rows; no `/api/exports/*` route
- ✗ **Schema migrations / env / Neon / cron config / CRM frontend (`public/crm/**`) / Sentinel / agents / skills / `.github/workflows/**`** — untouched
- ✗ **Reconciliation runs / manual cron triggers** — none authorized by this audit
- ✗ **`scripts/__pr147-soak-verify.mjs`** — still untracked per standing rule
- ✗ **Admin merge bypass / force push** — none

---

## 12. Methodology

This audit was produced by 4 parallel read-only specialized agents on 2026-05-20, each with non-overlapping scope:

| Agent | Scope | Output |
|---|---|---|
| frontend-auditor | Visual + UX + a11y across homepage, search, listing detail, FeaturedListings, mobile 390, desktop 1440, contact intent, international pages. Playwright on production. | 4 Class-A blockers + Class-B/C findings; live URL probes |
| tristle-rebny-compliance | Full REBNY UCBA + IDX Plus + Fair Housing + NY DOS + FARE Act + TCPA + syndication-scaffold gate | PASS verdict with 4 warnings; source-grep evidence |
| vercel:performance-optimizer | Core Web Vitals + image loading + bundle / font / resource hints + cron impact + cold-cache risk | A1/A2 perf items + B/C/D classifications |
| general-purpose | PR #165 evaluation + backend lead/deal routing + FeaturedConfig backend + SEO/AEO/sitemap/robots/llms.txt + seller portal | MERGE-BEFORE-LAUNCH recommendation + sitemap probe + per-portal-tab verification |

All findings cite file:line or live URL evidence. The audit doc is a synthesis of the 4 agents' separately-delivered reports.

---

## 13. Cross-references

- `docs/idx/post-reconciliation-tightening-audit-2026-05-20.md` — W1/W2/W3 origin and Phase A scope rationale
- `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` — H1 / H2 / H3 architectural debt and the original incident
- `memory/REFACTOR-2026-04-25.md` — master plan; PR 5 still NOT_STARTED
- `docs/backend-crm-current-gap-audit-2026-05-18.md` — Class-A backend items (some already shipped via PR #146)
- `docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md` — syndication invariants I.1–I.8
- `lib/idx/trestle-mapper.ts:722-870` — Phase A `computeGateColumns` helper (PR #165)
- `lib/syndication/eligibility.ts:146-163` — Layer 1.PRE empty-config-guard (PR #163)
- `app/listing/[id]/page.tsx:1192` — A1 grid blow-out site
- `app/listing/[id]/page.tsx:1546-1555` — A4 FARE Act conditional that is not firing
- `app/api/inquiries/route.ts:145-198` — B2 missing per-agent notification
- `app/components/FeaturedListings.tsx:114, :441` — A1 (perf) priority hint gap
- `lib/syndication/mallan-identity.ts:89-93` — D2 MALLAN_OFFICE_MLS_IDS empty (deliberate)
- `app/api/featured-config/route.ts` — Featured config persistence; no CRM UI panel today

---

## 14. Authorization scope of this document

This document authorizes **nothing**.

- ✗ No code patches
- ✗ No PR-A1 / PR-A2 / PR-A3 / PR-A4 work started
- ✗ No PR #165 merge action taken
- ✗ No PR 5B start
- ✗ No syndication export enabled
- ✗ No schema migration
- ✗ No env / Neon / cron / CRM / Sentinel / agent / skill / workflow change
- ✗ No manual cron trigger
- ✗ No reconciliation run
- ✗ No admin merge bypass

Each of A1–A4, B1–B13, C1–C12, D1–D2 requires separate Maya approval and opens as its own PR (or batched cleanup PR) with its own scope statement, tests, and proof. Normal merge only.
