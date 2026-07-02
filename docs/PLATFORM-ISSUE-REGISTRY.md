# Platform Issue Registry — mallan.nyc

> **The single permanent registry for everything wrong, risky, or unverified on the platform**:
> audit findings, production incidents, regressions, technical debt, compliance issues, SEO issues,
> performance issues, security issues, feature debt, operational risks. Tracked by
> [`docs/PROJECT-HEALTH-DASHBOARD.md`](PROJECT-HEALTH-DASHBOARD.md). Formerly "Audit Backlog"
> (renamed 2026-07-01 per Maya's direction — this file outlives any single audit).
>
> ## Evidence classification (mandatory on every item)
>
> | Class | Meaning |
> |---|---|
> | **Confirmed (live)** | Reproduced/observed on production with captured evidence (HTTP transcript, runtime log, stack trace, DB query result) |
> | **Confirmed (static)** | The code/config verifiably does X (exact file:line, exact code) — but the *production consequence* has not been observed live |
> | **Needs Verification** | A hypothesis — plausible mechanism, evidence incomplete. MUST NOT be reported as a conclusion |
>
> ## Backend evidence ledger (required before a backend item may be "Confirmed (live)")
>
> Every backend issue must carry, or state as missing: **endpoint · source file:line · request
> (exact) · response (exact) · stack trace / log line · database query + result · reproduction
> steps · affected users (who/how many) · severity**. Items missing the live fields stay in
> Needs Verification regardless of how convincing the static analysis is.
>
> ## Evidence Score (mandatory on every item, 0–10)
>
> Ten evidence fields, one point each: **(1) endpoint/surface · (2) source file:line ·
> (3) request/probe captured · (4) response/artifact captured · (5) stack trace or raw log line ·
> (6) DB/data query result · (7) reproduction performed · (8) affected users quantified ·
> (9) frequency + timestamps · (10) environment confirmed**. Always list the ✗ fields explicitly.
> The score tells everyone how confident to be **before changing production**:
> **9–10** act on it · **6–8** act with the missing fields named in the PR · **≤5** verify first.
>
> ## Language rule (binds Claude, Codex, ChatGPT — mirrored in AGENTS.md §5)
>
> The words **"probably", "likely", "appears", "root cause"** are FORBIDDEN in this registry and
> in any status report, EXCEPT: (a) prefixed with **`Hypothesis H-###`** and entered in the
> Hypothesis Register below, or (b) "root cause" backed by Evidence Score ≥ 9 on the same line.
> A hypothesis must always carry: **Observed · Evidence · Missing · Confidence · Next
> verification.** This makes it impossible for a future session to mistake a hypothesis for a
> confirmed diagnosis.
>
> ## Required operational fields (every item — Maya directive 2026-07-01)
>
> - **Technical Owner** (who fixes it) and **Verification Owner** (who independently proves the
>   fix) — different responsibilities, never collapsed into one "Owner".
> - **Blast Radius** — who/what is hit: e.g. "10,239 listing pages", "all NEW leads",
>   "all authenticated CRM users", "Unknown". An Unknown blast radius is itself a finding.
> - **Detection Method** — where the issue came from: `Runtime log` · `Population crawl` ·
>   `Cotality API` · `Live smoke` · `Static analysis` · `Validator` · `Incident report`.
>
> ## Lifecycle — no-graveyard rule (Maya directive 2026-07-01)
>
> **Active states:** `Open` · `Needs Verification` · `Needs live test` · `Monitoring` ·
> `Blocked/Held` · `In progress` · `Fixed — awaiting verification` · `Decision needed (Maya)` ·
> **`Regression Watch`** — fixed and merged, but must show a defined clean production window
> (e.g. "7 days clean runtime logs") before closing; fixes do NOT vanish from the registry at merge.
>
> **Terminal states — every item MUST eventually reach exactly one:** `Verified Fixed` ·
> `Verified Not Reproducible` · `Accepted Risk (Maya-signed, dated)` · `Superseded (by ID)` ·
> `Closed`. Nothing sits in `Open` unreviewed for more than **30 days** — monthly review
> re-triages every active item. **Confirmed (static) is not a permanent class:** within one
> verification cycle each such item graduates to Confirmed (live) or is demoted to an explicit
> Hypothesis. No middle ground forever.
>
> Do not mark any terminal state without re-running the item's verification criteria exactly as
> written. All implementation work on held surfaces (sitemap, robots, metadata, `app/**`, CRM,
> cron, env) requires **explicit Maya approval** first (CLAUDE.md §A.7/§C).
>
> **Evidence provenance (2026-07-01 audits):** full production sitemap parse (10,414 listing URLs);
> full live Cotality pull (10,249 Active/ComingSoon rows, GET-only) joined by RLS id with exact
> slug-builder replicas (replication check: 0 divergences in 10,239); live fetch of ALL 1,011
> published rental pages; ALL 176 stale sitemap ids probed live + statuses queried on live
> Cotality; ALL 59 neighborhood pages; ALL 27 static pages; 445 robots.txt lines; Playwright
> rendering (desktop + 375px); Vercel `get_runtime_errors`/`list_deployments` captures; all 284
> API routes inventoried (static); all 23 crons traced (static); full validator suite run.

---

## Evidence-class annotations (2026-07-01 sweep)

- **Confirmed (live):** SEO-001…011 (production HTTP/DOM captures + full-population Cotality join) · QUAL-001/002/003/005 (Playwright) · COMP-001 + PASS register (live sweeps) · PROD-001/002/003 (Vercel MCP + curl) · OPS-002/003 (live logs + live diff) · QUAL-006…009 (validator exit codes captured).
- **Confirmed (static)** — code verifiably does this; production consequence not yet observed: OPS-006 (rehydration path; churn not yet demonstrated on a specific row) · OPS-007 (endpoint code vs writer actions; live all-null response not captured) · OPS-008/009/010/011/012/013/014 · BIZ-005 (no dispatcher exists — but pending-row count unmeasured; needs `SELECT count(*) FROM notifications WHERE status='pending' AND channel<>'in_app'`) · BIZ-006/007/008 (filter code paths; needs one live filtered-search transcript to graduate) · BIZ-009…014 · PROD-004/005/007 · COMP-002/003.
- **Needs Verification (hypotheses):** OPS-001 fresh-insert failure (Hypothesis H-001, ledger above) · PROD-006 (the *wide SELECT* is Confirmed-static; "leak" is only a future-refactor RISK — no live exposure observed; treat as hardening) · PROD-008 (`ALLOW_DEV_LOGIN` env state unknown until checked — Hypothesis H-003).

Graduation rule: a Confirmed-static item becomes Confirmed (live) only when its verification
criteria produce a captured production artifact; until then its wording must say what the code
does, not what production is doing.

---

## Operational fields (2026-07-01) — Blast Radius · Detection · Technical/Verification Owner

| ID(s) | Blast Radius | Detection | Technical Owner | Verification Owner |
|---|---|---|---|---|
| SEO-001 | 10,239 listing pages (10,069 wrong in sitemap) — all organic discovery of inventory | Population crawl + Cotality API | Claude | Audit (re-run population join) |
| SEO-002 | All organic traffic to /buy + /rent (top-2 commercial pages) | Population crawl + Live smoke | Claude | Audit |
| SEO-003 | 59 neighborhood pages — entire non-branded content moat | Population crawl | Claude | Audit |
| SEO-004 | All building-search traffic; /buildings surface | Population crawl + Static analysis | Claude | Audit |
| SEO-005/006/008–011 | All 27 public pages (social CTR, SERP titles) | Population crawl | Claude | Audit |
| SEO-007 / OPS-003 | 176 stale sitemap URLs; crawler trust | Population crawl + Cotality API | Claude | Audit |
| OPS-001 / H-001 | **Unknown** — hypothesis: every NEW lead via /api/contact + 8 sibling surfaces since the columns were added; magnitude unmeasured | Runtime log + Static analysis | Claude | Audit (info_schema + approved repro) |
| OPS-002 | Cron reliability signal only (no user-facing impact identified) | Runtime log | Maya (Neon plan) + Claude (audit trail) | Audit |
| OPS-006 | All archived (Gate-6) listings — nightly strip/rehydrate churn; blocks Gate-6 scale-up | Static analysis (+ prior incident history) | Maya (merge #465) | Codex (review) + Audit (post-merge probe) |
| OPS-007 | Ops visibility for all 23 crons (monitoring blind spot, not user-facing) | Static analysis | Claude | Audit |
| OPS-008 | Legacy `listings.media` JSON lane; catastrophic only if the repair script is run | Static analysis + Validator | Maya (decision) | Audit |
| OPS-009 | Any terminal listing >180d on the legacy clock — archived regardless of flag | Static analysis | Maya (decision) | Audit |
| OPS-010 | DB size/cost; audit-query performance over time | Static analysis | Claude | Audit |
| OPS-011 | Latent: ALL public search results the moment PR-5B reader swap lands | Static analysis | Claude | Audit (pre-5B gate) |
| OPS-012/013/014 | Photoless listings (edge) / ops docs / workflow hygiene | Static analysis | Claude | Audit |
| BIZ-005 / H-002 | Every email/SMS notification ever produced (count unmeasured); all lead-assignment alerting | Static analysis | Maya (hold release) + Claude | Audit (count query + send log) |
| BIZ-006/007/008 | All users of filtered public search + CRM IDX amenity search | Static analysis | Claude | Audit (live transcript) |
| BIZ-009/010/011 | Lead-data quality: all duplicate-identity leads; all agent-entered contacts (consent) | Static analysis | Claude | Audit |
| BIZ-012 | All alert-unsubscribers still receiving non-alert email (CAN-SPAM exposure; count unmeasured) | Static analysis | Claude | Audit |
| BIZ-013/014 | New unassigned leads (broker awareness); future alert criteria | Static analysis | Claude | Audit |
| PROD-001 | idx-sync write reliability (25006 class); watch window | Runtime log | Claude | Audit (7d clean window) |
| PROD-004 | All 284 API routes (defense-in-depth gap; no confirmed exposure) | Static analysis | Claude | security-agent |
| PROD-005 | 12 cron mutation endpoints IF env ever unset | Static analysis | Claude | security-agent |
| PROD-006 | None today (hardening); agent PII of all listings if a future refactor regresses | Static analysis | Claude | security-agent |
| PROD-007 | Public form abuse ceiling; tracking-data integrity | Static analysis | Claude | security-agent |
| PROD-008 / H-003 | Broker impersonation IF env is set (else none) | Static analysis | Audit (env check) | security-agent |
| QUAL-001 | Every page load (console error); all non-English visitors (dead widget) | Live smoke | Claude | Audit |
| QUAL-002/003 | Homepage credibility; screen-reader users on galleries | Live smoke | Maya (photos) + Claude | Audit |
| QUAL-006 | CI baseline integrity (blocks the documented §B green-state) | Validator | Maya (decision) | Audit |
| QUAL-007/008/009 | Compliance-evidence completeness; doc trust; code hygiene | Validator | Claude | Audit |
| COMP-001 | Every visitor to /buildings (§175.25 identification) | Population crawl | Claude | tristle-rebny-compliance |
| COMP-002/003 | Compliance-governance clarity; closed-listing indexing | Static analysis | Maya (decision) / Claude | tristle-rebny-compliance |

---

## Regression Watch

Fixed and merged — held open until the defined clean window is observed. Do not close early.

| ID | Item | Fixed by | Clean-window criterion | Watch until |
|---|---|---|---|---|
| RW-001 | Open-house twin matching (SL-0007 ↔ RLS20099289 display, address-key scoping, ZIP disambiguation) | PRs #463 + #464 (merged 2026-07-01) | 7 days production: open-house panel renders on twin pages, zero cross-attribution reports, `/api/open-houses` errors = 0 | 2026-07-08 |
| RW-002 | idx-sync `25006 read-only transaction` write-failure class (upserts/audit/watermark) | last seen 2026-06-28 (3 clean days as of 2026-07-01; no code fix identified — cause of cessation unconfirmed) | 7 consecutive days with 0 hits in `get_runtime_errors` for the 25006 class; if it recurs, open a new P1 with H-### for the cause | 2026-07-05 |
| RW-003 | Prohibited-terms single-source (guardrails ↔ runtime gate drift) | PR #461 (merged) | guardrails PASS (116 terms) on next 3 CI runs + no new drift between `data/compliance/prohibited-terms.json` categories and flatList | 3 CI cycles |

---

## Hypothesis Register

### Hypothesis H-001 — Contact-form fresh-insert failure (→ OPS-001)
- **Observed:** Two production DB errors — `[CONTACT] submission error | category=db`, route `/api/contact`, 2026-06-28T23:00:43Z and 23:30:09Z (Vercel `get_runtime_errors`, production).
- **Evidence:** raw INSERT at `lib/leads/lead-upsert.ts:115-138` omits `seller_potential_reason` and `building_type_pref`; `prisma/schema.prisma` declares both as required `String[]` with no `@default`; no migration defines them (grep `prisma/migrations` = 0 hits; baseline `20260301073253_baseline/migration.sql:52` predates them); the `ON CONFLICT DO UPDATE` branch never touches them → mechanism predicts fresh-inserts fail while returning-lead updates succeed, matching an intermittent signature.
- **Missing:** raw Postgres error code/stack (log is category-redacted); live `information_schema` confirmation that the columns are NOT NULL with no default on the canonical DB; reproduction; affected-user count.
- **Confidence:** Medium (mechanism complete and consistent with the signature; zero live confirmation of the actual failing constraint).
- **Next verification:** (1) read-only `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='leads' AND is_nullable='NO' AND column_default IS NULL;` on cold-waterfall; (2) with Maya approval, one controlled `POST /api/contact` with a never-seen email while capturing Vercel runtime logs for the raw Prisma/Postgres error.

### Hypothesis H-002 — Pending-notification backlog is accumulating (→ BIZ-005 magnitude)
- **Observed (static):** no dispatcher exists for non-`in_app` Notification rows; producers write `status:'pending'`.
- **Evidence:** `lib/notifications/engine.ts:59-60`; `vercel.json` cron list; grep = 0 dispatch readers.
- **Missing:** actual row count / growth rate.
- **Confidence:** High that rows are never sent (static-complete); Unknown magnitude.
- **Next verification:** read-only `SELECT channel, count(*) FROM notifications WHERE status='pending' GROUP BY channel;` on canonical DB.

### Hypothesis H-003 — `ALLOW_DEV_LOGIN` is unset in all Vercel environments (→ PROD-008)
- **Observed:** gated broker-impersonation route exists (`app/api/auth/dev-login/route.ts:25,79`).
- **Missing:** env listing for prod + preview.
- **Confidence:** Unknown.
- **Next verification:** `vercel env ls` (names only, no values).

---

## Evidence Scores (2026-07-01)

| Score | Items | Missing fields (✗) |
|---|---|---|
| **10/10** | SEO-001 (root cause — Evidence Score 10: full-population live join, replication 0 fails, thin-page transcripts captured, all 10 fields present) | — |
| **9/10** | SEO-002/003/007, COMP-001, PASS-register rows, PROD-002/003, QUAL-006 | ✗ affected-users quantified (traffic impact not measured) |
| **8/10** | SEO-004/005/006/008/009/010/011, QUAL-001/002/003, OPS-002/003, PROD-001, QUAL-007/008/009 | ✗ reproduction-after-fix baseline; ✗ user impact |
| **6/10** | OPS-006/007/008/009/010/011/012/013, BIZ-005/006/007/008, PROD-004/005, BIZ-012 | ✗ request · ✗ response · ✗ DB query result · ✗ live repro (static-complete: source, mechanism, environment, frequency N/A) |
| **5/10** | BIZ-009/010/011/013/014, PROD-007, COMP-002/003, OPS-014 | as above + partial surface coverage |
| **6/10** | **OPS-001 / H-001** — ✓ runtime log ✓ endpoint ✓ source ✓ timestamps ✓ frequency ✓ environment · ✗ stack trace ✗ SQL error ✗ reproduction ✗ user impact | see H-001 |
| **3/10** | PROD-006 (hardening risk — no live artifact possible until a regression exists), PROD-008/H-003 | most live fields N/A or unchecked |

New items MUST be scored on entry; scores are updated (with date) whenever a verification step runs.

---

## 1 · SEO

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| SEO-001 | Sitemap canonical slug mismatch — **10,069 of 10,239** joined listing URLs (98.3%) omit `StreetSuffix`/`StreetDirPrefix`; wrong URLs serve HTTP 200 thin soft-redirect pages | **P0** | Open | Claude | Full-population audit 2026-07-01 (live Cotality join, replication check 0 fails). Root cause `app/sitemap.ts:115` (passes `StreetName` only) vs `app/listing/[...slug]/page.tsx:573` (DirPrefix+Name+Suffix); soft-redirect at `page.tsx:960-966` |
| SEO-002 | /buy & /rent are empty SSR shells (0 listing links, 0 H1) that client-redirect into robots-blocked `/search` (`app/robots.ts:68,189`) while carrying sitemap priority 0.9 | **P0** | Open | Claude | Full audit 2026-07-01: SSR HTML capture + Playwright redirect trace |
| SEO-003 | Neighborhood guide pages absent from sitemap — **0 of 59** included (all 59 live, HTTP 200, self-canonical, up to ~4,200 words) | **P1** | Open | Claude | Full audit 2026-07-01: all-59 live sweep vs full sitemap parse |
| SEO-004 | /buildings surface broken: detail canonical (`app/buildings/[slug]/page.tsx:186-193`) can never equal sitemap URL shape (`app/sitemap.ts:173-194`); **0** `/buildings` URLs in live sitemap; hub page has no canonical/description; `/buildings/*` missing from AI-training-bot blocks (`app/robots.ts:74-85`) | **P1** | Open | Claude | Full audit 2026-07-01: live probes + code trace |
| SEO-005 | Open Graph coverage — `og:image` missing on **23 of 27** public pages (pages defining `openGraph` without `images` wipe the `app/layout.tsx:69-76` default; e.g. `app/page.tsx:21-26`) | **P2** | Open | Claude | Full audit 2026-07-01: all-27 static-page sweep |
| SEO-006 | Duplicate brand suffix in `<title>` on **24 of 27** static pages + all listing pages (`…| Mallan Real Estate | Mallan Real Estate Inc.`) | **P2** | Open | Claude | Full audit 2026-07-01: all-27 sweep + listing fetches |
| SEO-007 | **176** sitemap entries are off-feed/stale: all render "Listing Not Available" (display rule OK) but return HTTP 200 soft-404s with `index,follow`, and stay in the sitemap. Live statuses: 167 gone from feed, 8 Pending, 1 Active (timing) | **P2** | Open | Claude | Full audit 2026-07-01: all-176 probed live + Cotality status query |
| SEO-008 | `/search` declares `canonical → https://mallan.nyc` (homepage) with `index,follow` meta — wrong signal, currently defused only by robots.txt | **P3** | Open | Claude | Live HTML capture 2026-07-01 |
| SEO-009 | Listing H1 is price + neighborhood; address exists only as `sr-only` H1 (`app/listing/[...slug]/page.tsx:1468-1472`) — address queries are the winnable class | **P3** | Open | Claude | Live rendered-DOM capture 2026-07-01 |
| SEO-010 | Listing meta descriptions leak raw MLS markup (`&lt;br&gt;`, `&amp;`) into SERP snippets | **P3** | Open | Claude | Live HTML capture 2026-07-01 |
| SEO-011 | Hygiene bundle: duplicate `<meta name="viewport">` (×2 every page); 404 page carries `index,follow` + generic homepage title; `twitter:site @NYCondos` ownership unconfirmed | **P3** | Open | Claude (handle Q → Maya) | Live captures 2026-07-01 |

**Verification criteria**
- **SEO-001:** re-run the full-population join script (scratchpad `full-slug-analysis.ts` pattern: live Cotality pull → replica slug build → join to production sitemap) → `MISMATCH = 0`; plus 5 live fetches of former mismatch URLs → 301/308 or exact canonical serve; GSC "Page with redirect" count trending to ~0.
- **SEO-002:** curl SSR HTML of `/buy` and `/rent` → ≥ 24 `href="/listing/…"` links, ≥ 1 H1, no client redirect to a robots-disallowed URL (Playwright trace stays on-page or lands on a crawlable URL).
- **SEO-003:** production sitemap contains all 59 `/{borough}/{neighborhood}` URLs (full parse, count = 59).
- **SEO-004:** for every `/buildings` sitemap entry: sitemap URL == page canonical (full-population compare); hub page has canonical + description + footer identity; `/buildings/` present in AI-training-bot disallow sets in live robots.txt.
- **SEO-005:** all-27 static-page sweep → `og:image` present 27/27 (and on listing pages).
- **SEO-006:** all-27 sweep + 5 listing pages → brand appears exactly once per title.
- **SEO-007:** unavailable listings return 404/410 (or `noindex`) and are absent from the sitemap; re-run stale-check script → stale-in-sitemap count ≤ feed-lag noise (single digits) and every stale URL non-200-indexable.
- **SEO-008:** `/search` canonical is self-referential or absent.
- **SEO-009:** rendered DOM: exactly one H1 = street address + unit on listing pages.
- **SEO-010:** meta descriptions on 10 listings contain no HTML tags/entities.
- **SEO-011:** one viewport meta; 404 = noindex + "Page not found" title; twitter handle confirmed by Maya or removed.

---

## 2 · Business (CRM · client lifecycle · lead routing · search quality · saved searches · notifications)

Deep audit completed 2026-07-01 (code-trace, report-only). Lead-capture chain verified **INTACT** for
all 9 public surfaces (form → route → Lead+Inquiry+consent → audit event). The defects are downstream.

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| BIZ-001 | CRM smoke: `crm:test` **39/39 PASS** (2026-07-01). Note: CLAUDE.md §G says "172/172" — runner count drifted (see QUAL-008). Live `/crm` browser load still unverified | 🟡 | Partially verified | Audit | Validator run 2026-07-01 |
| BIZ-002 | Lead routing end-to-end not live-tested (code chain INTACT; live smoke needs a production write — Maya approval) | ⚪ | Needs live test | Audit | Business-layer audit 2026-07-01 |
| BIZ-005 | **No dispatcher for `email`/`sms`-channel notifications** — `lib/notifications/engine.ts:59-60` writes `status:'pending'`; no cron ever sends them. Producers: `lib/lead-distribution/assign.ts:150`, `lib/lifecycle/engine.ts:381,403`, `app/api/sign-up/route.ts:243-254`. Silent unbounded accumulation; lead-assignment emails never delivered | **P1** | Blocked/Held (dispatcher HELD) | Maya + Claude | Business-layer audit 2026-07-01 |
| BIZ-006 | **Public search filters applied AFTER pagination** — amenities/keywords/yearBuilt/furnished/ownership filter in-memory post-`findMany` (`lib/search/public-listing-db.ts:365-461`; applied `app/api/listings/route.ts:453`) while `total` ignores them (`route.ts:403,575`) → silently incomplete results, inflated counts, empty deep pages | **P1** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-007 | CRM IDX search silently drops non-OData-safe checkbox filters (`lib/search/crm-idx-filter.ts:263`) — constraint parsed then discarded, results presented as filtered | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-008 | Search `total` vs displayed-count divergence: gates A–F are legitimate (`lib/search/listing-access-decision.ts:16-19,64-71`; `lib/search/public-listing-db.ts:178-190` — explains 9,395 vs 10,249 live-feed gap) but dedupe + post-filters shrink the page after counting — fold remediation into BIZ-006 | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-009 | Lead dedupe is email-only (`prisma/schema.prisma:183`); no phone-based dedupe → duplicate people with independent consent state (TCPA fragmentation) | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-010 | CRM manual client create captures no `consent_captured_at` (`app/api/crm/clients/route.ts:36-78`) — agent-entered contacts carry no consent evidence | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-011 | Roles not merged on UPDATE branch of public upserts (CMA `app/api/cma/route.ts:91-96`, RSVP, search-alerts, guides…); only `/api/contact` unions roles (`lib/leads/lead-upsert.ts:128-137`) — buyer→seller cross-sell signal dropped | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-012 | **Unsubscribe divergence (CAN-SPAM)**: `/api/search-alerts/unsubscribe` does NOT set `Lead.last_unsubscribe_at` (`app/api/search-alerts/unsubscribe/route.ts:19-32`) but sender suppression keys solely on it (`lib/email/sendgrid.ts:130-145`) → alert-unsubscribers remain emailable on other channels; `email_opt_out` write disabled pending migration (`app/api/unsubscribe/route.ts:22-26`) | **P1** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-013 | Sign-up broker alerts are in_app only (`app/api/sign-up/route.ts:243-254`) — broker not logged into CRM never learns of a new unassigned lead (couples with BIZ-005) | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-014 | Public `/api/search-alerts` skips the `canEnableAlertForCriteria` gate the CRM route enforces (`app/api/crm/saved-searches/route.ts:180-193`); cron marks unsupported rows `skippedUnsupported` (`app/api/cron/search-alerts/route.ts:60-78`). Latent (current key set is supported) — no regression guard | **P3** | Open | Claude | Business-layer audit 2026-07-01 |

**Verification criteria:** BIZ-005 dispatcher exists + pending backlog drains to 0 + send log evidence; BIZ-006/008 filtered `total` == filtered count and page N returns matches from the full inventory (doorman/keyword test vs unfiltered baseline); BIZ-007 checkbox filters provably constrain results or UI drops unsupported options; BIZ-012 both unsubscribe paths write the suppression field + a send-suppression test flips green; BIZ-002 one controlled test lead traced intake→routing→audit event (Maya-approved).

---

## 3 · Operations (cron · live Cotality pull · media sync · queues · archive · DB growth)

Deep audit completed 2026-07-01 (code-trace + live Vercel evidence, report-only). All 23 cron routes
exist and are CRON_SECRET-protected (timing-safe); no unauthenticated cron handler.

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| OPS-001 | Contact funnel failure — **root-cause HYPOTHESIS (not yet reproduced)**: raw INSERT in `lib/leads/lead-upsert.ts:115-138` omits `seller_potential_reason` / `building_type_pref` (required `String[]`, no `@default` in `prisma/schema.prisma`, no migration defines them) → predicted NOT-NULL violation on fresh-insert path only. **Evidence ledger:** endpoint `POST /api/contact` ✓ · source `lib/leads/lead-upsert.ts:115-138` ✓ · log line `[CONTACT] submission error \| category=db` ×2, 2026-06-28T23:00/23:30Z, route `/api/contact` (Vercel get_runtime_errors) ✓ · request ✗ (not captured) · response ✗ · full stack trace / Postgres error code ✗ (log is category-redacted) · DB query result ✗ (needs `SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND is_nullable='NO' AND column_default IS NULL` on canonical DB, read-only) · reproduction ✗ (needs one controlled NEW-email submission — Maya approval, production write) · affected users: hypothesis = all NEW leads via /api/contact & 8 sibling surfaces using the same upsert; magnitude unknown | **P1** | **Needs Verification** (2 read-only steps + 1 approved live repro) | Claude (verify) | Backend audit + Vercel logs 2026-07-01 |
| OPS-002 | DB keepalive stability — 500 on pooler 2026-07-01 18:00Z; 24h window otherwise clean (1 keepalive + 1 social-proof error only) | **P1** | Monitoring | Audit | Vercel `get_runtime_errors`/`get_runtime_logs` 2026-07-01 |
| OPS-003 | Sitemap ↔ live-feed drift: 167 off-feed ids still sitemap-published (couples with SEO-007) | **P2** | Monitoring | Claude | Live Cotality diff 2026-07-01 |
| OPS-004 | Live-value discipline: feed uses `ResidentialLease` / `ComingSoon` (no spaces); space-containing filters silently match 0 rows (same class as historical `Coming Soon` sitemap bug, `app/sitemap.ts:88-92`) | **P3** | Open (review-checklist rule) | Claude | Live Cotality distinct-values query 2026-07-01 |
| OPS-006 | **Archived-row rehydration unguarded on main** — idx-sync UPDATE branch (`lib/idx/sync.ts:385-424`, `:415,:419`) rewrites `raw_data`/`media`/`sync_status` with no `archived` check; Gate-6 strip (`lib/retention/archive-terminals.ts:124-129`) is undone nightly → strip→rehydrate churn. Fix is PR #465 (open, unmerged). Gate-6 execute correctly held on it | **P0 (ops)** | Blocked on PR #465 review/merge | Maya (merge approval) | Operations audit 2026-07-01 |
| OPS-007 | `/api/health/crons` is dead: queries `action IN [cron_success,cron_failure]` (`app/api/health/crons/route.ts:20-33`) but no cron uses `createCronHandler` (`lib/api/cron-handler.ts:82-91`, 0 importers); real crons write bespoke actions → endpoint returns all-null always; its CRON_NAMES list omits 6 live crons. No single-pane cron health exists | **P2** | Open | Claude | Operations audit 2026-07-01 |
| OPS-008 | `media-backfill` orphaned: route exists + says "every 8 minutes" but absent from `vercel.json:7-30` (paused PR #176). It is the ONLY caller of `backfillEmptyMedia`/`migrateMediaToR2`. **Latent data-loss footgun:** `scripts/audit-media-mediatype-corruption.ts:287-306` clears `listings.media=[]` expecting the dead cron to repopulate — running it today permanently empties JSON media | **P2** | Decision needed (Maya): schedule, or delete route + fix script | Maya | Operations audit 2026-07-01; also the idx:validate CRITICAL (QUAL-006) |
| OPS-009 | `ARCHIVE_T180_BACKLOG_ENABLED` does NOT gate archiving — flag only swaps the eligibility clock (`data-retention/route.ts:168-171`); nightly T+180 archive loop runs either way; "flag-OFF drains zero" holds only by behavioral accident. Combined with OPS-006 = the churn #465 targets | **P1** | Open (document + decide gating) | Maya + Claude | Operations audit 2026-07-01 |
| OPS-010 | Unbounded growth: `listing_media` soft-delete tombstones never purged (`lib/idx/media-sync.ts:585-624,1038-1040`) and `sync_errors` has no retention (`archive-terminals.ts:218-228`); both monotonic | **P2** | Open | Claude | Operations audit 2026-07-01 |
| OPS-011 | Search-projection dual-write is best-effort, non-transactional (`lib/idx/sync.ts:462-464`; `data-retention/route.ts:78-115` counts failures but leaves projection stale) — **latent public leak the moment PR-5B reader swap lands** with unhealed rows | **P2** | Open (pre-req for PR-5B) | Claude | Operations audit 2026-07-01 |
| OPS-012 | Media cursor ghost-skip: RC5 marks missing-listing Properties ok and advances past them (`media-sync.ts:1710-1716`); if feed-reconcile orphan-create fails/budget-stops (`feed-reconcile/route.ts:342-345,388-417`), listings stay photoless until PhotosChangeTimestamp bumps | **P3** | Open | Claude | Operations audit 2026-07-01 |
| OPS-013 | Cron comment/schedule mismatches: `idx-sync` says "every 4 hours" (actual `*/10`); `db-keepalive` says "every 4 min/5-min timeout" (actual `*/15` — stated purpose unmet; also writes NO audit event ever → failures invisible to ops:health); `experiment-metrics` says "Daily 9am" (actual weekly Sun 02:00) | **P3** | Open (fix comments, not schedules) | Claude | Operations audit 2026-07-01 |
| OPS-014 | `rotate-db-keys` workflow: schedule disabled but `workflow_dispatch` still live (`.github/workflows/rotate-db-keys.yml:12`); defended by canonical-host guard; "DISABLED" header overstates. Also `cleanup-neon-preview-branch.yml:49,126` hardcodes morning-bread as refuse-sentinel (confirm abort-only) | **P3** | Open (verify + tighten wording) | Claude | Operations audit 2026-07-01 |

**Verification criteria:** OPS-001 fix merged + one controlled NEW-email contact submission → 2xx + Lead row + no 25006/23502 in runtime logs (Maya-approved write test); plus `information_schema` check that every NOT-NULL/no-default `leads` column is in the INSERT list. OPS-006 #465 merged + one sync cycle over an archived row leaves `sync_status='archived'`, `raw_data` NULL. OPS-007 endpoint returns real per-cron freshness for all 23 crons. OPS-008 either cron scheduled (idx:validate goes 0 critical) or route+script removed. OPS-009 explicit flag gate or documented accepted behavior. OPS-010 retention added; table row-counts trend flat post-purge.

---

## 4 · Production (Vercel · Neon · runtime errors · latency · deploys)

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| PROD-001 | Runtime errors (7d, Vercel `get_runtime_errors` 2026-07-01): 12 groups. Dominant class = idx-sync `25006 read-only transaction` INSERT failures (upserts/audit/watermark/diagnostics; 29+ hits) — **last seen 2026-06-28, quiet 3 days**; keepalive pooler-unreachable last 2026-07-01 18:00Z; contact `category=db` ×2 on 2026-06-28 (= OPS-001/API-001); lead-scoring DB-unreachable 06-28; social-proof ETIMEDOUT 07-01. 24h window: only 2 single errors total | **P1** | Monitoring (verify 7-day clean window for 25006 class) | Audit | Vercel MCP captures 2026-07-01 |
| PROD-002 | Latency baseline: TTFB 0.34–0.9s across homepage/listing/category (one cold 1.8s) — acceptable | — | Closed (verified) | Claude | Live curl timings 2026-07-01 |
| PROD-003 | Infra correctness: http→https 308, www→apex 301, real 404 status, `/api/health` 200; latest production deploy READY on main@`10ea57c2` (`dpl_3KBgBofLKVC7G7hKSqr49e4RWHyx`) | — | Closed (verified) | Claude | Live probes + Vercel `list_deployments` 2026-07-01 |
| PROD-004 | No root `middleware.ts` — all authZ is per-route opt-in across 284 API routes (`lib/auth/middleware.ts:20-118` helpers); a new route that forgets `requireAuth` ships exposed by default. Recommend defense-in-depth matcher over `/api/crm/*`, `/api/portal/*`, `/api/idx/*` | **P1** | Open | Claude | Backend audit 2026-07-01 (API-002) |
| PROD-005 | 12 cron routes fail **open** if `CRON_SECRET` unset (`'Bearer ' + (process.env.CRON_SECRET \|\| '')` pattern, e.g. `app/api/cron/lead-scoring/route.ts:10-11`; 11 other crons guard-first fail-closed). Conditional on env — normalize to guarded form | **P2** | Open | Claude | Backend audit 2026-07-01 (API-003) |
| PROD-006 | Public listings route selects `raw_data` + `list_agent_email`/`list_agent_direct_phone` + gate flags into the response-bound object (`app/api/listings/route.ts:357-378,1248-1265`); safety rests entirely on DTO stripping (applied today). Fragile — narrow the SELECT | **P2** | Open | Claude | Backend audit 2026-07-01 (API-004) |
| PROD-007 | Abuse-surface gaps: per-instance in-memory rate-limit Maps on `buildings/search` + `crm/neighborhoods/cotality` (ineffective on serverless); `tracking/listing-view` public POST with no rate limit (token-gated, silent 204); no captcha on any public lead form (IP-only limits) | **P3** | Open | Claude | Backend audit 2026-07-01 (API-005) |
| PROD-008 | `auth/dev-login` broker-impersonation route gated only by `NODE_ENV`+`ALLOW_DEV_LOGIN` (`app/api/auth/dev-login/route.ts:25,79`) — verify `ALLOW_DEV_LOGIN` is unset in ALL Vercel envs (prod/preview) | **P2** | Needs env verification | Audit | Backend audit 2026-07-01 (API-006) |

Verified clean (backend): raw-SQL injection review — all 6 raw-SQL routes parameterized; `health/env` leaks no values (boolean presence, broker-gated); media proxy SSRF-allowlisted; public agent directory strips phone/email; portal IDOR posture post-#458/#459 solid (ownership enforced on every reviewed id-param route; buyer identity masked to sellers).

**Verification criteria:** PROD-004 middleware matcher live + a deliberately helperless test route under /api/crm returns 401; PROD-005 all 23 crons use guard-first pattern (grep = 0 fail-open); PROD-008 `vercel env ls` shows no ALLOW_DEV_LOGIN; PROD-001 7-day `get_runtime_errors` with 0 hits in the 25006 class.

---

## 5 · Quality (Lighthouse · accessibility · mobile · broken links · console errors)

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| QUAL-001 | Google Translate widget broken by CSP on every page (`translate-pa.googleapis.com` not in `script-src`) — console error on 100% of loads; visible feature dead | **P2** | Open | Claude | Playwright console capture 2026-07-01. CSP/env change ⇒ Maya approval |
| QUAL-002 | 7 of 20 homepage images are Unsplash stock (neighborhood cards) — credibility + external dependency + lost image-SEO | **P2** | Open | Maya (assets) + Claude (wiring) | Playwright DOM audit 2026-07-01 |
| QUAL-003 | 2 client-rendered gallery images without `alt` on listing pages (WCAG 2.1 AA nit) | **P3** | Open | Claude | Rendered-DOM check 2026-07-01 |
| QUAL-004 | Lighthouse / CWV formal baseline never captured (dashboard ⚪; PageSpeed lane HELD) | **P2** | Blocked/Held | Audit | Dashboard "Lighthouse / performance" |
| QUAL-005 | Verified clean this cycle: 0 dead nav/footer links (14/14 targets 200); 0 broken images on probed templates; no horizontal overflow at 375px (home/search/listing) | — | Closed (verified) | Claude | Live sweeps + Playwright 2026-07-01 |

| QUAL-006 | `idx:validate` **FAIL (exit 1)** — 1 CRITICAL: `/api/cron/media-backfill → NOT SCHEDULED` (1242 pass, 3 warn). Breaks the CLAUDE.md §B "0 critical" baseline. Same root as OPS-008 | **P1** | Decision needed (Maya): schedule vs delete vs accept-and-baseline | Maya | Validator run 2026-07-01 |
| QUAL-007 | `compliance-check` HIGH (non-blocking): `ethics_training_gate` WS-C4 (UCBA Art. III §6) PARTIAL — pattern not found in `app/api/auth/login/route.ts` + `app/api/auth/mfa/verify/route.ts` | **P2** | Open | Claude | Validator run 2026-07-01 (`scripts/validate-workflow-completeness.js`) |
| QUAL-008 | Doc drift in CLAUDE.md baselines: §G says `crm:test` "172/172" (actual runner: 39/39); §B says `compliance-check` "93/93" (actual: 91 passed + 1 warn). Also `rls:validate` 1 warning: `RENTAL-FORM-REDESIGN.html` MlsStatus picklist missing `ComingSoon` | **P3** | Open | Claude | Validator run 2026-07-01 |
| QUAL-009 | `lint`: 0 errors, 11 warnings (set-state-in-effect `app/components/AgentAvatar.tsx:29`; unused vars ×4; unused eslint-disable ×5) | **P3** | Open | Claude | Validator run 2026-07-01 |

Validator suite snapshot (2026-07-01, branch `docs/agent-health-dashboard-2026-07-01`): type-check 0 err ·
rls:validate 0 err/1 warn · compliance-check 91 pass, 0 BLOCKER+STRICT fail, 1 HIGH warn · ucba:audit 46/46,
0 REGRESSIONS · **idx:validate FAIL 1 critical** · crm:test 39/39 · test:rls 41/41 (run by hand — NOT in PR CI) ·
lint 0 err/11 warn.

**Verification criteria:** QUAL-001 zero CSP violations in console on 3 templates + widget functional (or widget removed deliberately). QUAL-002 homepage serves 0 `images.unsplash.com` sources. QUAL-003 rendered DOM: 0 imgs without alt on 5 listings. QUAL-004 Lighthouse run archived with scores per template. QUAL-006 `idx:validate` exit 0 (or baseline doc updated with Maya's explicit acceptance). QUAL-007 workflow validator reports 11/11 pass. QUAL-008 CLAUDE.md §B/§G numbers match live runner output.

---

## 6 · Compliance (REBNY · UCBA · Fair Housing · FARE · attribution · licensing)

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| COMP-001 | `/buildings` hub is the **only** public page missing the §175.25 footer identity block (name/address/license) — 26/27 pages compliant | **P1** | Open | Claude | Full 27-page sweep 2026-07-01; 19 NYCRR 175.25 per `.claude/skills/rebny-compliance/SKILL.md` |
| COMP-002 | Governance gap: `compliance/FRONTEND-COMPLIANCE.md` + `compliance/THIRD-PARTY-AND-FEED-GOVERNANCE.md` contain the binding SEO-mechanics rules (noindex targets, address-in-URL, OG/meta) but are **not listed** in `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` | **P2** | Decision needed (Maya) | Maya | Requirement-doc read 2026-07-01 |
| COMP-003 | Unavailable/closed listing pages carry `index,follow` (FRONTEND-COMPLIANCE wants noindex for Closed>90d) — remediation shared with SEO-007 | **P2** | Open | Claude | Full 176-page stale sweep 2026-07-01 |

**Verified-PASS register (full coverage, 2026-07-01 — re-verify after any change to these surfaces):**

| Check | Result | Method |
|---|---|---|
| FARE Act / LL 119-2024 fee disclosure on rentals | **1,011 / 1,011 present, 0 missing** | Live fetch of every published rental |
| RLS attribution ("Listing Courtesy of …") + updated timestamp | **1,011 / 1,011** | Same sweep |
| License #10991205323 on listing pages | **1,011 / 1,011** (+26/27 static; gap = COMP-001) | Same sweep + static sweep |
| 24-hour off-market display rule (UCBA) | All 176 off-feed ids render "Listing Not Available" | Full stale-id probe |
| Address suppression (`InternetAddressDisplayYN`) fail-closed in slug/display | Confirmed | Code path + live fallback slugs |
| Private surfaces noindexed (/crm /portal /admin /favorites /compare /sign-in) | Confirmed | Live header/meta probes |
| Search-engine indexing of IDX listing pages | **Permitted** — no REBNY/UCBA/IDX doc requires noindex of displayable listings | Canonical-doc read |
| Single feed endpoint | Only `api.cotality.com` in `lib/ app/ scripts/`; env names `IDX_*` are labels on Cotality creds | Repo sweep + script inspection |

---

## Change log

| Date (UTC) | Change |
|---|---|
| 2026-07-01 | Backlog created from full-coverage SEO/UI/compliance audit. All items Open unless verified in-audit. |
| 2026-07-01 | Comprehensive backend+ops+business+validator audit appended: BIZ-005…014, OPS-006…014, PROD-004…008, QUAL-006…009; BIZ-001/BIZ-004 statuses updated; PROD-001 refreshed with live Vercel 7d/24h evidence. |
| 2026-07-01 | Governance upgrades (Maya directives): renamed to Platform Issue Registry; evidence classes; 9-field backend ledger; Evidence Scores (0–10) on all items; Hypothesis Register (H-001…H-003) + banned-language rule (mirrored AGENTS.md §5); OPS-001 reclassified from "root-caused" to Hypothesis H-001 / Needs Verification. |
| 2026-07-01 | Operational fields added per item: Blast Radius · Detection Method · Technical Owner / Verification Owner (split). Lifecycle: Regression Watch state (RW-001 open-house twins, RW-002 25006 class, RW-003 prohibited-terms) + terminal states (Verified Fixed / Verified Not Reproducible / Accepted Risk / Superseded / Closed) + 30-day no-graveyard review + Confirmed-static graduation deadline. Next: Platform Decision Log (queued — after 2-3 real dev cycles per Maya's pause-process directive). |
