# FULL-SITE DEEP AUDIT — mallan.nyc — 2026-07-01

**Requested by:** Maya (complete audit, no spot checks, no reliance on prior reports)
**Method:** Local validator suite (type-check, rls:validate, compliance-check, ucba:audit, idx:validate, crm:test, workflows) + **live Cotality API queries** (`api.cotality.com/trestle`, GET-only) + **live production probes** (mallan.nyc HTTP/render evidence) + six parallel deep-dive audits (Neon/R2, CRM + agent search, forms feed-readiness, security, SEO/UI, REBNY search-mapping compliance). Every prior-report claim independently re-verified against current code and live systems.
**Mode:** REPORT ONLY. No code changed. All fixes are Maya-gated per CLAUDE.md §A.7/§C.

---

## 0. VERDICT

| Domain | Verdict |
|---|---|
| Live-feed correspondence (Cotality ↔ site) | **BROKEN — ~165+ zombie listings served as Active that no longer exist on the live feed (proven live, up to 63 days stale)** |
| Security | **FAIL for deploy — 1 CRITICAL, 3 HIGH** |
| REBNY/IDX search & mapping compliance | **FAIL on specific routes — 3 CRITICAL bypass paths** (core gate layer itself is sound) |
| Neon / R2 direction | **Wrong direction confirmed — root cause: "ingest everything, gate at read" + 4 half-finished migrations** |
| CRM + agent backend search | **Backend sound; frontend seam badly broken — 6 filter families dead end-to-end, fake-success buttons, broken panels** |
| Sale/rental forms feed-readiness | **~75% ready — forms themselves strong; publish gate + export machinery + media metadata are the gaps** |
| SEO | **Crippled by one bug — 95% of sitemap listing URLs are wrong; /buy & /rent invisible to Google** |
| Validators (local) | type-check 0 err · rls:validate 0 err/1 warn · compliance-check 91 pass + 1 HIGH workflow fail · ucba:audit 46/46 · idx:validate **FAIL (1 critical)** · crm:test 39/39 |

---

## 1. LIVE COTALITY CORRESPONDENCE (verified against api.cotality.com today)

**Live feed counts (queried 2026-07-01):** Active = 10,250 · ComingSoon = 1 · Pending = 6,416 · ActiveUnderContract = 0 · total Property rows = 589,968.
**Production serves:** 10,416 listings (10,415 "Active" + 1 ComingSoon per `/api/listings` totals).

### 1.1 CRITICAL — Zombie listings (proven end-to-end)
Sampled 200 production Active listing IDs against the live feed: **6 of 200 (3%) no longer exist on live Cotality** yet render as Active with HTTP 200 public pages:
- RLS20049465 (4 E 73rd St) — last modified **2026-04-29, 63 days stale**
- RLS20089043 (100 Vandam St #20A) — stale since 2026-05-08
- RLS20052321, RLS20087511, RLS20065348, RLS20052568 — all confirmed absent from feed, all serving 200 pages.

**Root cause (architectural):** REBNY's IDX Plus feed is pre-filtered — when a listing goes non-displayable it *disappears* from the feed rather than re-emitting with a terminal status. The 10-minute delta sync keys on ModificationTimestamp and structurally cannot see disappearance. A feed-reconcile cron nominally runs at 03:30 but 63-day-old zombies prove it is not catching this class. **REBNY §2.05 exposure** (removal within 24h).

**Compounding bug (H9 in §3):** live metadata spells the status `Canceled` (single L); `TERMINAL_STATUSES` and every retention predicate use `Cancelled` (double L) — `Canceled` rows are invisible to the T+24h flag, T+30d media shed, and T+180 archive (`lib/idx/trestle-mapper.ts:618-626` vs `app/api/cron/data-retention/route.ts:23,69`).

**Severity nuance (from the full-population page sweep):** listing *detail pages* for off-feed ids render "Listing Not Available" — the page layer re-checks and degrades correctly. The zombie exposure is therefore concentrated in (a) **search results / `/api/listings`**, which serve these rows as Active cards with full data (verified: 6/200 sample all returned as Active with photos/addresses via the API), and (b) **sitemap soft-404s** (176 entries, HTTP 200 + index,follow). Still a §2.05 search-surface issue + DB↔feed drift (site 10,416 vs feed 10,251), but the detail page itself is not serving stale full listings.

### 1.2 Status-model mismatch
Live feed has **0** `ActiveUnderContract` rows and **6,416** `Pending` — but the read path and CRM map contract statuses to `ActiveUnderContract` (`lib/search/public-listing-db.ts:14`, `lib/search/crm-idx-filter.ts:98-109`). The picklist CSV's StandardStatus set is {Active, Canceled, Closed, ComingSoon, Expired, Hold, Incomplete}. [Class B — resolve at CSV-refresh level before code changes.]

### 1.3 Field/metadata truth — CLEAN ✅
`trestle:diff` (live): 0 residue across all 7 resources; `trestle:audit-server` (live): all 7 gate fields + all key fields exist live, 0 phantom-field references in production code, 0 vendor drift. Only feed host anywhere in the codebase = `api.cotality.com`. The "IDX_" env-var naming is a label, not a second feed.

---

## 2. SECURITY — VERDICT: FAIL (deploy blocker)

### CRITICAL
- **Trestle OAuth credentials recoverable from git history** — commit `18e25077`, deleted file `scripts/test-trestle-geo.js`. Logged in AUDITOR-LOG as "MUST ROTATE IMMEDIATELY"; rotation unconfirmed. Action: confirm revocation with Cotality, then history purge (needs Maya approval — force-push hold).

### HIGH
1. **Login brute-force bypass** — `lib/middleware/rate-limiter.ts:191` disables ALL rate limiting when any `session_token` cookie is merely *present* (value never validated). No account lockout; forgot/reset-password have no limiter at all.
2. **/admin fails open** — `lib/middleware/route-guards.ts:74`: unset `PRIVATE_COLLECTION_PASS` → `undefined === undefined` → access granted. **Live-confirmed: GET /admin returns 200 unauthenticated.** Latent full admin bypass.
3. **Commissions financial IDOR** — `app/api/crm/commissions/route.ts:50` uses `requireAgentOrBroker` (comment says broker-only) and never scopes `deal_id` → any agent can write paid commission rows against another agent's deals, corrupting P&L and 1099 basis.

### MEDIUM
- 12 crons fail open if `CRON_SECRET` unset (`Bearer ` + trailing space passes) — a correct fail-closed helper exists (`lib/api/cron-handler.ts`) used by zero routes.
- Login user enumeration (distinct 403/"no password" responses + bcrypt timing oracle).
- Portal PII leaks: agent/lead emails to buyers/family viewers; buyer identity leaked to sellers via showings metadata; family/invite discloses existing-Lead PII and auto-links without consent (SHIELD).
- Media proxy: public, unthrottled, spends server Trestle token (allowlist + content-type gate OK).

### Verified SAFE
No raw MLS/PII leak on any public listing route (all DTO tiers correct, live-confirmed); sessions/bcrypt/invite/reset token design solid; CRM behind auth (live 307), `public/crm/data/*.json` NOT world-readable (live 307); headers strong (CSP nonce, HSTS preload); dev-login 404 in prod; no secrets in client JS.

---

## 3. REBNY / IDX SEARCH & MAPPING COMPLIANCE — 3 CRITICAL

- **C1 — Public agent pages serve Closed listings with NO distribution gates** — `app/api/agents/[slug]/listings/route.ts:298-302` maps raw rows for the Closed branch (Active branch is gated). Violates Gates 1–3 incl. Owner Opt-Out (UCBA Art. I §5(A): never publicly disseminated).
- **C2 — `ensure-listing` bypass + misattribution** — third-party IDX rows stamped `rls_eligible:false` skip ALL public gates, classify as `_source:'exclusive'`, render "Exclusive listing by Mallan Real Estate Inc." with third-party agent PII, and match the /exclusives filter (`app/api/idx/ensure-listing/route.ts:123`; `lib/search/public-listing-db.ts:184-189`; `lib/idx/db-to-public-dto.ts:251-269,551-575`). UCBA Art. III §2 + 19 NYCRR §175.25 (misleading advertising).
- **C3 — CRM Building Search (modes 5/6) returns full listing data** (prices, remarks, agent contacts) instead of building-only info; no building-mode backend for the search tab.

**HIGH (selected):** portal buyer/saved, portal/open-houses, portal/comparables have zero gates; `/api/buildings` never selects the gate fields (address suppression structurally no-op); `Permission` missing from public Trestle-fallback $selects; ~20 phantom picklist values in CRM filters (silent zero results — incl. the only lawful wheelchair-accessibility filter, which can never match); **"Diplomats" filter checkbox ships in the CRM** (national-origin proxy — remove); listing emails lack courtesy line + ignore address suppression; Coming Soon badge never fires on DB-served detail pages; detail-page attribution falls back to "Mallan Real Estate Inc." for third-party rows (misattribution); `Canceled/Cancelled` inversion (§1.1).

**MEDIUM (selected):** FARE badge missing from the DEFAULT desktop SplitCard while the banner claims per-card display (LL 119/2024 + §175.25); dead public amenity filters (fireplace/no-fee/renovated target wrong fields/values — can never match); NL-parser transit chip filters nothing; "Background Check" field in rental report dictionary (NYC Fair Chance Act exposure); search keywords/saved-search criteria never Fair-Housing-scanned; CRM print sheet fabricates showing-instruction lines with agent contact.

**Sound ✅:** gate core fail-closed with correct REBNY null semantics; main public search/detail/suggest/sitemap/alerts fully gated; §2.05 cron chain present (subject to the Canceled caveat); Fair Housing filter baseline clean with regression test; zero phantom fields in any live $select.

---

## 4. NEON + R2 — THE WRONG DIRECTION (confirmed)

**The pattern:** *ingest and mirror everything, then build ever-more machinery to un-store it, while every reader-swap that would let old layers die stays on hold.*

### Wrong-direction calls (ranked)
1. **CRITICAL — "Ingest everything, gate at read."** 110K feed listings stored with full raw_data/compliance/features JSON; **85% never displayable** yet hold 76% of the JSON bytes. DB grew 196 MB (04-28) → 1,369 MB (06-24). Every cost thread (500 MB Free-tier breach, 80K archive backlog, 46 GB R2 orphans, gated-photo exposure) is downstream of this one decision. Right direction: **thin-skeleton persistence at ingest** for non-displayable rows.
2. **CRITICAL — Dual-write forever, swap readers never (×4):** projection dual-written since April with PR 5B HELD (yet it IS load-bearing: saved-searches + alerts read the projection while public search reads listings — two truths in prod today, and 1,949-row dangerous drift already happened once); `terminal_since` clock built + backfilled + **flag OFF** so prod archives on the documented-broken clock; **PR #465 rehydration guard unmerged while main un-archives rows nightly** (`lib/idx/sync.ts:415,419` — strip→rehydrate→re-strip churn); media-JSON "PR 10" drop never shipped while `raw_data.Media` re-imports the same data (media metadata stored **3× in Neon + once in R2**).
3. **HIGH — R2 is write-only, public, guessable.** `deleteFromR2` has one caller (the health self-test). 263,618 objects / 123.71 GB; ~46 GB true orphans; **34 GB of gated/non-displayable listings' photos publicly fetchable** on `pub-*.r2.dev` with deterministic keys `photos/{listingId}/{order}.jpg`. Custom domain `images.mallan.nyc` whitelisted but dormant.
4. **HIGH — Chasing the Free tier while the actual bill cause sits unticketed.** The whole $19/mo exists to silence a FALSE Vercel "branch limit" check; the support-ticket packet has been ready since 06-03 and was never filed. Meanwhile ~750 MB/mo of avoidable Neon history churn (unconditional full-row rewrites, zero change detection — `lib/idx/sync.ts:385-424`, `lib/idx/media-sync.ts:534-558`) went unfixed while $0.003/mo of byte-dedupe got audited.
5. **MEDIUM — Operational truth diverged from repo truth:** prod mutated by untracked "DO NOT COMMIT" scripts (S1 strips, ~92K rows); NEON.md teaches a 5-min autosuspend that doesn't exist (prod `suspend_timeout=0s`); db-keepalive protects nothing and is currently 500ing; idx-sync `*/10` schedule fights its own 10-min guard (half the runs skip); `idx:validate`'s permanent media-backfill "critical" contradicts a standing test that forbids scheduling it; GH Actions variable `NEON_PROJECT_ID` still points at stale morning-bread.

Also: dom-reset zeroes DOM at T+30 **before** the T+180 archive snapshots it (archived Withdrawn/Cancelled records get DOM=0); audit_events carries a 46K-row incident burst until 2028; 16 daily analytics crons maintain score tables for a CRM with ~50 leads.

---

## 5. CRM + AGENT BACKEND SEARCH

**Backend: sound.** Route → OData builder → gates → mapper, saved-search CRUD + alert cron, listing write path: coherent and fail-closed.
**Frontend seam: broken.** 107 JS files / ~68K lines / 13,488-line `panels.js` with 50 `window._*` state slots / ~1,400 inline onclick handlers.

### CRITICAL
- **C1 — `api-client.js:622-663` silently drops 6 filter families the UI collects and the backend supports:** unit, keyword, managementCompany, contractDateFrom/To, and ALL amenity checkboxes (Doorman, Garage, Pets, Laundry, View…). **Dead end-to-end** — agents get identical results checked or unchecked. ~40-line fix; highest-yield fix in the system.
- **C3 — Search truncates at 200 rows with a false total, no real pagination** (route supports `skip`, nothing sends it) — agents silently miss all inventory past rank 200.
- **C4 — "Change Status" modal never included in the build** (`html/modals/status-change.html` missing from `index.html:72-78` @include list) → TypeError; the UCBA status-transition UI is unreachable.
- **C5 — Family panel 100% broken** — Add Person always 400 (contract mismatch), Edit/Remove always 404 (route doesn't exist).

### HIGH (selected)
- **Fake-success compliance buttons:** `cardDistributeToggle` toasts "uploaded to REBNY RLS" with zero API calls; open-house save/delete same (`manage-listings.js:657-813`). Task delete 405s then removes locally (reappears on reload).
- **Same-unit dedupe broken in TWO places** — open PR #362 fixes only the public route; agent `/api/idx/search` never dedupes.
- Saved searches: SponsorUnit filter silently lost; no edit/pause UI (backend endpoints orphaned); routable "My Saved Searches" panel is a hard-coded mockup with fixture data.
- Sort toggle rebuilds params from scratch and drops most filters (third divergent param builder); no AbortController (stale-response races); cache key omits sort+sponsorUnit (cross-query bleed); client Showings tab shows ALL agent showings mislabeled; Offers tab silently 404s; `Panels._toggleFeatured` undefined (TypeError); complete `auditLog()` panel unreachable (sidebar routes to Licensing instead).
- **`POST /api/analytics/event` doesn't exist** — every public-site pageview/CTA event 404s (PR #289 open since May).
- Terminal-status comps controls offered but structurally dead against the 24h gate — the known "agents can't pull comps" problem, plus invalid sub-status values guaranteeing 0 rows.
- Triplicated validation logic across both live sale forms + 5 never-wired extracted modules (the exact drift pattern the charter bans).

### Open-PR backlog (11 CRM PRs verified against main)
- **Close (already fixed/superseded):** #196, #234, #259 (residual-hunk check), and decide #224 (design-conflicted).
- **Still-live bugs to land:** #203 (rental autofill), #212 (draft leaking to rentals tab), #275 (Tailwind CDN in prod on all 4 forms), #289 (analytics route), #362 (extend to agent route).
- **Not on main:** #303 (feature), #428 (draft; none of its extraction landed).

**Recommendation: salvage backend, staged-rebuild the frontend seam. Do NOT greenfield.** Order: (1) one generated transport layer + param-name contract test; (2) one param builder, pure; (3) real pagination + AbortController; (4) route sins in one PR (cache key, agent-route dedupe, sub-status mapping); (5) kill the fake-success class; (6) fail-closed build.js (would have prevented C4); (7) delete the dead ~20%; (8) mechanically shrink monoliths into the existing Store; (9) finish saved-search UI; (10) close zombie PRs.

---

## 6. FORMS FEED-READINESS — PARTIALLY READY (~75%)

**Strong:** SALE form 155 RLS-bound fields / RENTAL 247, 0 unknown; all codified mandatory fields captured; persistence lossless (full normalized payload in raw_data + typed buckets); FARE Act fields captured AND persisted with a server-side publish gate that is NOT skipped; 4 form variants all serve intentional roles (REDESIGN=edit, WITH-TOOLS=viewer); rental-ComingSoon picklist warning is a correct false positive (sales-only under UCBA Art. I §16).

**Gaps:**
- **F1 (feed-day blocker):** Draft→Active publish transition skips the 48-field RLS gate for CRM exclusives (`app/api/crm/listings/[id]/status/route.ts:151-156`) — an exclusive can go Active missing mandatory feed fields. Intentional today; first feed-day PR.
- **F2 (feed-day blocker):** syndication export = 1 of 6 planned PRs built. Gate exists (correctly fail-closed, hold intact); no payload builder, sanitizer, adapters, export routes, or admin UI. The Layer-2 approval fields have **no write UI** — every listing would fail eligibility even after identity config.
- **F3:** status machine allows Draft→ComingSoon for rentals via API (UCBA sales-only violation surface).
- **F4:** media not feed-ready — width/height never written, captions dropped, no min-resolution gate, originals downscaled, no listing_media→RESO Media serializer.
- **F5:** `ListAgentMlsId` + `MALLAN_OFFICE_MLS_IDS` depend on REBNY-issued IDs not yet entered.

**12-item feed-day gap list** delivered in the forms lane report (identity config ×2, gates ×4, export machinery ×2, media ×3, live re-verification ×1). **Keep entering full data now — listings entered today will not need rework.**

---

## 7. SEO + TRAFFIC

### Critical
1. **10,069 of 10,239 joined sitemap listing URLs (98.3% — exact, full-population count) are wrong** — `app/sitemap.ts:115` passes only `StreetName` to the slug builder, dropping `StreetSuffix`/`StreetDirPrefix` (live-Cotality-confirmed: they're separate fields; the replica slug builder reproduced production output with 0 divergences). Wrong URLs return HTTP 200 thin pages with only a meta-refresh hop; Google logs ~10K "page with redirect" and never receives the real URLs. **One-line-scope fix; unlocks indexing of nearly the entire inventory.**
1b. **176 sitemap entries reference off-feed listings** (167 gone from feed, 8 Pending, 1 timing edge). Their detail pages render "Listing Not Available" — so the on-page UCBA 24h rule is respected — but they return HTTP 200 soft-404s with `index,follow` and stay in the sitemap. See §1.1 nuance below.
2. **/buy and /rent are empty shells** (0 listings in SSR HTML) that client-redirect into `/search` — which is robots-Disallowed for all bots. Priority-0.9 pages rank for nothing.
3. **Neighborhood guide pages (the best content on the site, ~4,200 words each) are absent from the sitemap** — only borough hubs listed.

### High/Medium
og:image missing on homepage//manhattan//buy (metadata shallow-merge wipes the default — imageless social shares); buildings pages: canonical can never match sitemap URL + zero buildings in live sitemap + near-empty hub; every title says the brand twice; /search canonical points at the homepage; listing H1 is the price not the address; meta descriptions leak raw `<br>`/entities from MLS remarks; `twitter:site @NYCondos` (verify ownership); duplicate viewport meta.

### UI (live)
Google Translate widget broken sitewide by CSP (`translate-pa.googleapis.com` not allowlisted — console error on 100% of loads); 7 of 20 homepage images are Unsplash stock; /buy//rent//open-houses flash blank skeletons; 2 gallery images missing alt. Footer identity: **compliant as-is on 26/27 pages** (§175.25 requires address OR phone; address+license present) — the one real gap is **`/buildings` hub, which has no footer identity block at all** (also no canonical, no meta description). og:image missing on **23 of 27** public pages (full sweep).

### Verified fine ✅ (full population, zero sampling)
**FARE disclosure present on ALL 1,011 published rental pages (0 missing)** — the 2026-05-20 audit concern is definitively resolved; RLS attribution + license number on 1,011/1,011 listing pages; noindex correct on all private surfaces; redirects/404/TTFB/fonts/images healthy; no dead nav links; no mobile overflow at 375px; all 59 neighborhood pages 200 with correct canonicals.

### Governance gap
The SEO-mechanics compliance rules (noindex targets, address-in-URL, OG rules) live in `compliance/FRONTEND-COMPLIANCE.md` + `compliance/THIRD-PARTY-AND-FEED-GOVERNANCE.md`, which `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` does NOT list as canonical — add them as index rows or reconcile before treating their rules as binding.

### Traffic plan (top 5 of 10)
1. Fix sitemap slugs. 2. Neighborhood guides into sitemap + interlinking (the only realistic non-branded ranking surface vs StreetEasy). 3. Real SSR /buy + /rent. 4. Google Business Profile + local citations (UES map-pack is winnable; organic vs Zillow is not). 5. Building pages done right ("15 Hudson Yards condos" class queries = StreetEasy's weakest flank). Then: og:image/titles, exclusives-first original content (the only non-duplicate inventory text Google will see), monthly micro-market reports (realistic backlink channel), listing H1/meta hygiene, CWV polish.

---

## 7b. LATE-SWEEP ADDITIONS (backend/ops/business full sweep — tracked with IDs in `docs/PLATFORM-ISSUE-REGISTRY.md`)

- **OPS-001 (P1, NEEDS VERIFICATION) — new-lead 500 hypothesis on the contact funnel.** Confirmed-static: the raw INSERT in `lib/leads/lead-upsert.ts:115-138` omits two required `String[]` columns (`seller_potential_reason`, `building_type_pref` — no defaults), which *would* fail brand-new lead creation while returning leads succeed. Production-impact evidence is thin (2 category-redacted `[CONTACT] category=db` log hits on 2026-06-28; no stack trace, no repro). Verify with: (a) read-only `information_schema` check on canonical DB, (b) one approved controlled new-email submission. Treat as high-priority verify, not confirmed outage.
- **BIZ-005 (P1) — Email/SMS notifications are never sent.** The engine writes `status:'pending'` rows (`lib/notifications/engine.ts:59-60`) and **no dispatcher cron exists** — lead-assignment alerts and lifecycle triggers dead-letter forever. A broker not logged into the CRM never learns of a new lead.
- **BIZ-006 (P1) — Public search silently wrong for filtered queries.** Amenity/keyword/year-built/furnished/ownership filters run **in memory after pagination** (`lib/search/public-listing-db.ts:365-461`); totals ignore them — matching listings on later raw pages never appear, counts inflated, deep pages near-empty.
- **BIZ-012 (P1, CAN-SPAM) — unsubscribe suppression broken:** the alerts unsubscribe path never writes `last_unsubscribe_at`, but the email sender's suppression keys solely on that field — unsubscribed users remain emailable via other channels.
- **PROD-004 (P1) — no root `middleware.ts`:** auth on all 284 routes is per-route opt-in; a forgotten `requireAuth` ships exposed by default.
- **OPS-009 (P1):** `ARCHIVE_T180_BACKLOG_ENABLED` doesn't gate archiving — it only swaps the eligibility clock; nightly archiving runs either way (revises the §4 recommendation wording: the flag flip changes *which clock*, and the Gate-6 drain is the actual backlog lever).
- **OPS-007 (P2):** `/api/health/crons` is dead — queries audit actions no cron writes; returns all-null always.
- **Production runtime (live):** latest deploy READY on main; 24h errors = 2 singles; the destructive `25006 read-only` class quiet since 2026-06-28. Lead capture chain verified INTACT on all 9 public surfaces (the OPS-001 defect is specifically the new-lead INSERT path).
- `test:rls` run manually per §J.6: **41/41 PASS**.

## 8. BUSINESS-CONCEPT ISSUES (cross-cutting)

1. **The site's product promise exceeds its data rights.** Comps/terminal-status UI is offered to agents but IDX Plus grants no sold-data license — the UI misrepresents capability instead of explaining it. Decide: acquire the right data product or remove/explain the controls.
2. **Two search engines, two truths.** Public search reads `listings`; saved-searches/alerts read the projection. Until PR 5B is decided, every gate fix must land twice.
3. **Effort allocation inverted:** 16 analytics crons + score tables for ~50 leads, while lead-facing basics (analytics route 404s, family panel dead, saved-search editing missing) stay broken. The CRM optimizes reporting on a pipeline it can't yet reliably operate.
4. **Process debt is the meta-issue:** 39 open PRs (30 non-audit), 4 of them zombies already fixed on main; half-finished migrations left dual-writing; untracked scripts mutating prod; validator baselines carrying permanent "known criticals"; CLAUDE.md figures drifted (claims 172/172 crm:test — actual suite is 39/39; "145-rule" UCBA — checklist runs 46). The pattern that produced the 2026-04-30 incident (documented model ≠ real behavior) is re-accumulating.

---

## 9. MASTER RECOMMENDATION — priority order

**P0 — this week (compliance + security, all small):**
1. Confirm Trestle credential rotation with Cotality (CRITICAL; then history purge w/ approval).
2. Fix rate-limiter bypass + login/reset throttling + lockout; fix /admin fail-open; fix commissions authz. (3 files.)
3. Merge **PR #465** (rehydration guard) — prerequisite for all storage work; main un-archives nightly.
4. Gate the Closed branch of agent pages (C1 §3); close the ensure-listing bypass (C2 §3).
5. **Add a feed-disappearance reconciliation** (full-inventory ListingKey diff vs live feed, flip absent rows non-displayable) + fix the `Canceled` spelling — kills the zombie class. [Class B verify spelling live first — done in this audit: live metadata has only single-L `Canceled`.]
6. Fix the sitemap slug composition (one line-scope; biggest traffic lever available).
7. **Verify-then-fix the new-lead INSERT (OPS-001)** — the code defect is real (two missing required array columns in `lib/leads/lead-upsert.ts:115-138`); production impact needs one read-only DB check + one approved controlled submission to confirm. If confirmed: direct lost business; smallest possible fix.

**P1 — next 2 weeks:**
7. Flip `ARCHIVE_T180_BACKLOG_ENABLED` + run the Gate 6 drain supervised (~390 MB); add change-detection to the two hot writers (~750 MB/mo churn); remove `'Media'` from raw-data keep-set.
8. CRM transport fix (the 6 dropped filter families, ~40 lines) + real pagination + kill fake-success buttons + include the status-change modal in the build + fail-closed build.js.
9. Portal gate fixes (buyer/saved, open-houses, comparables, buildings SELECT) + phantom picklist cleanup + remove Diplomats/backgroundCheck controls.
10. SEO wave 1: neighborhoods into sitemap, SSR /buy + /rent, og:image + title dedupe.
11. Land live-bug PRs #203/#275/#289, extend #362 to agent route; close zombies #196/#234/#259.
11b. **BIZ-005/BIZ-006/BIZ-012:** build the notification dispatcher cron (needs Maya decision — cron config is held); move public-search post-pagination filters into the query (correct results + counts); write `last_unsubscribe_at` on alert unsubscribe (CAN-SPAM).
11c. **PROD-004:** add a root `middleware.ts` default-deny for `/api/crm/**` + `/api/portal/**` so auth is opt-out, not opt-in.

**P2 — this quarter (direction resets):**
12. Decide PR 5B (ship reader swap or stop dual-writing) — stop paying for both worlds.
13. Design the ingest trim (thin skeletons for non-displayable rows) — the only durable fix for storage.
14. R2 lifecycle: custom image domain, terminal-deletion stage, mirror display-eligible only, then the ~50 GB orphan cleanup.
15. Open the Vercel false-check ticket; pg_dump + delete morning-bread; retarget GH Actions `NEON_PROJECT_ID`; decide the $19/Free question explicitly.
16. Feed-day preparation track: the 12-item forms gap list (publish-gate re-enable first, then payload/sanitizer/adapters per the approved syndication plan).
17. CRM staged rebuild per §5 (one transport, one param builder, monolith split, dead-code deletion).
18. Hygiene: NEON.md facts, db-keepalive deletion, media-backfill route deletion (clears the permanent idx:validate critical), ethics-gate wiring into login/MFA (the 1 blocking PARTIAL workflow), CLAUDE.md figure refresh.

---

*Full lane reports (with complete file:line evidence) were delivered in-session: Neon/R2, CRM+search, forms, security, SEO/UI, search-compliance. This document is the consolidated index; each finding above carries its primary citation.*
