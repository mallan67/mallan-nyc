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
> ## Consistency invariants (Maya directives 2026-07-02)
>
> 1. **Derived-summary invariant:** a change to any issue REQUIRES updating every derived
>    summary in the same PR — Issue Row → Priority Table → P0/P1 Summary → Dashboard →
>    Handoff. If any one of those is stale, **the PR is incomplete** (Codex enforces this;
>    #467 rounds 1–3 were all violations of exactly this rule).
> 2. **Single-ID invariant:** no issue may appear in only one place, and no place may carry a
>    duplicate description. Every issue has exactly one ID (SEO-001, OPS-017, …) defined HERE;
>    every dashboard row, summary, handoff, or roadmap REFERENCES the ID rather than restating
>    the finding. One source of wording; everything else points at it.
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
- **Confirmed (static)** — code verifiably does this; production consequence not yet observed: OPS-007 (endpoint code vs writer actions; live all-null response not captured) · OPS-008/009/010/010A/011/012/013/014 · BIZ-005 (no dispatcher exists in code — magnitude MEASURED live 2026-07-02: zero email/sms rows; see H-002) · BIZ-006/007/008 (filter code paths; needs one live filtered-search transcript to graduate) · BIZ-009…014 · PROD-004/005/007 · COMP-002/003. (OPS-006 removed from this class 2026-07-02 — Fixed/RW-004.)
- **Needs Verification (hypotheses):** OPS-001 contact errors (Hypothesis **H-004** — the earlier H-001 was **DISPROVED live 2026-07-02**) · PROD-006 (the *wide SELECT* is Confirmed-static; "leak" is only a future-refactor RISK — no live exposure observed; treat as hardening) · PROD-008 (`ALLOW_DEV_LOGIN` env state unknown until checked — Hypothesis H-003).
- **Verified live 2026-07-02 (read-only DB session + Neon configuration API):** H-001 disproof · H-002 resolution · RW-004 guard baseline · OPS-016 Neon facts · OPS-017 schema drift. OPS-006 graduated to Fixed — Regression Watch (RW-004).

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
| OPS-001 / H-004 | 2 failed submissions 06-28, but a NEW lead SUCCEEDED 06-28 23:01:52 (same window) → transient blip, not a deterministic bug; 0 recurrence + 0 submissions since | Runtime log + live DB (leads/inquiries recency 2026-07-03) | Claude | Audit (approved controlled submission — funnel idle, nothing to watch) |
| OPS-017 | Benign: 5 orphan legacy tables + 3 orphan indexes + 3 updated_at defaults (live-only leftovers); leads = false alarm; app references none | Full `prisma migrate diff` (read-only) 2026-07-03 | Claude (diffed) | Maya (held migration for cleanup, if ever) |
| OPS-002 | Cron reliability signal only (no user-facing impact identified) | Runtime log | Maya (Neon plan) + Claude (audit trail) | Audit |
| OPS-006 | (Fixed 2026-07-02 — #465 merged/deployed; RW-004 watch) Was: all archived listings, nightly strip/rehydrate churn | Static analysis (+ prior incident history) | Claude (fixed) | Audit (RW-004 queries to 2026-07-09) |
| OPS-007 | Ops visibility for all 23 crons (monitoring blind spot, not user-facing) | Static analysis | Claude | Audit |
| OPS-008 | Legacy `listings.media` JSON lane; catastrophic only if the repair script is run | Static analysis + Validator | Maya (decision) | Audit |
| OPS-009 | Any terminal listing >180d on the legacy clock — archived regardless of flag | Static analysis | Maya (decision) | Audit |
| OPS-010 | DB size/cost; audit-query performance over time | Static analysis | Claude | Audit |
| OPS-010A | Recurring Neon WAL/history growth (~750 MB+/mo est.) — every synced listing/media row | Runtime log (frozen-cursor measurement) + Static analysis | Claude (after #465) | Audit (WAL/history trend pre/post) |
| OPS-015 | None user-facing — ops noise + marginal compute; masks real DB incidents in error dashboard | Runtime log + prior audits | Maya (decision) + Claude | Audit (clean error dashboard post-change) |
| OPS-011 | Latent: ALL public search results the moment PR-5B reader swap lands | Static analysis | Claude | Audit (pre-5B gate) |
| OPS-012/013/014 | Photoless listings (edge) / ops docs / workflow hygiene | Static analysis | Claude | Audit |
| BIZ-005 / H-002 | **Measured 2026-07-02: ZERO email/sms rows ever produced** (30 in_app/pending only — H-002 resolved); remaining exposure = future lead-assignment alerting once email producers fire | Static analysis + live count | Maya (hold release) + Claude | Audit (send log once dispatcher exists) |
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
| QUAL-006 | (Verified Fixed 2026-07-03 via #471) was: CI baseline integrity | Validator | Claude (fixed) | Audit (verified on main) |
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
| RW-004 | **Archived-row guard live behavior** (OPS-006 fix, PR #465, 4 Codex rounds) | PR #465 merged 2026-07-02T02:35:50Z; prod deploy `858da234` READY | **Baseline verified live 2026-07-02 (read-only cold-waterfall):** ≥2 clean sync cycles on the new guard (70 rows synced, 0 idx-sync errors/warnings in 90-min window); archive population intact — 2,032/2,032 rows raw_data=JSON-null, media=[], 0 displayable; 0 archived rows re-emitted in window (guard branches not yet exercised live). Watch: re-run the archived-touched/unarchived queries each session until (a) a terminal re-emit is observed staying stripped+hidden, (b) a canonical-active re-emit is observed unarchiving, or (c) 7 days of clean cycles + intact population elapse. Do NOT close on silence alone before 2026-07-09 | 2026-07-09 or first live occurrence of each branch |

---

## Hypothesis Register

### Hypothesis H-001 — Contact-form fresh-insert failure (→ OPS-001) — **DISPROVED 2026-07-02**
- **Verdict:** the predicted mechanism cannot occur. Live `information_schema` on cold-waterfall
  (read-only session, 2026-07-02): `seller_potential_reason` and `building_type_pref` EXIST but are
  **NULLABLE** (`is_nullable=YES`, ARRAY). The only NOT-NULL/no-default `leads` columns are
  `email, first_name, last_name, phone, updated_at` — every one present in the raw INSERT list
  (`lib/leads/lead-upsert.ts:118-122`). The schema-omission theory is dead.
- **Second live confirmation (2026-07-03):** a brand-new lead landed at `2026-06-28 23:01:52` — a
  deterministic NOT-NULL violation on a fresh insert could not have let it through. Disproved two
  independent ways (nullable columns + a successful fresh insert).
- **Correction (2026-07-03, per OPS-017 full diff):** the earlier "schema says required, DB says
  nullable = drift" reading was itself a FALSE ALARM — `String[]` maps to a nullable array column by
  design and `prisma migrate diff` emits NO change for `leads`. There is no leads-table drift.
- **Superseded by:** Hypothesis H-004.

### Hypothesis H-002 — Pending-notification backlog is accumulating (→ BIZ-005 magnitude) — **RESOLVED 2026-07-02 (refuted in magnitude)**
- **Verdict:** live count (read-only, cold-waterfall): the notifications table contains ONLY
  `in_app/pending` rows — **30 total; zero email/sms rows have ever accumulated**. The dispatcher
  gap (BIZ-005) is real in code but nothing is queued and nothing is being lost today →
  BIZ-005 downgraded P1→P2 (Maya directive 2026-07-02). The 30 `in_app` rows stuck at `pending`
  confirm the cosmetic L1 finding (`lib/lead-distribution/assign.ts:150` writes pending instead of
  delivered; the bell reads regardless).

### Hypothesis H-004 — 2026-06-28 contact errors were part of that day's DB-connectivity incident cluster (→ OPS-001)
- **Observed:** the 2 contact `category=db` errors (2026-06-28T23:00:43Z / 23:30:09Z) occurred the
  SAME DAY as a cluster of DB-availability failures across unrelated routes: idx-sync `25006
  read-only transaction` errors (last seen 06-28) and `lead-scoring` / idx-sync `P1001 can't reach
  database server` (06-28) — all against the same pooler.
- **Evidence:** Vercel `get_runtime_errors` 7d capture 2026-07-01 (timestamps correlate); H-001
  disproof removes the only competing mechanism on the table. **Corroborated by read-only DB
  2026-07-03:** a brand-new lead+inquiry landed SUCCESSFULLY at `2026-06-28 23:01:52` — inside the
  same error window — so new-lead creation was NOT deterministically failing (a missing-column bug
  would have failed it too). Errors and a success coexisting is the signature of a transient blip,
  not a code defect.
- **Missing:** the raw error text behind the contact log's redacted `category=db`; a reproduction; a
  POST-06-28 success to confirm the funnel is healthy TODAY — but there have been **0 contact
  submissions since** (0 inquiries, 0 leads in 5 days; 51 leads / 2 inquiries EVER — a very
  low-volume funnel), so the clean-window watch has nothing to observe.
- **Confidence:** Medium-High (raised from Medium — the successful same-window lead is strong live
  corroboration).
- **Next verification:** one controlled `POST /api/contact` with a never-seen email while capturing
  runtime logs (Maya approval — production write) is the only way to confirm the funnel works TODAY;
  organic traffic would also resolve it.

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
| **6/10** | OPS-007/008/009/010/011/012/013, BIZ-006/007/008, PROD-004/005, BIZ-012 (OPS-006 retired from this row 2026-07-02 — Fixed/RW-004 with live baseline; BIZ-005 rescored 8/10 below after the live zero-count) | ✗ request · ✗ response · ✗ DB query result · ✗ live repro (static-complete: source, mechanism, environment, frequency N/A) |
| **8/10** | **BIZ-005** — ✓ surface ✓ source ✓ DB query result (live zero-count 2026-07-02) ✓ magnitude quantified ✓ environment ✓ timestamps ✓ frequency N/A-counted · ✗ dispatcher send-path repro (blocked: dispatcher HELD) ✗ post-release send log | close after dispatcher hold release |
| **5/10** | BIZ-009/010/011/013/014, PROD-007, COMP-002/003, OPS-014 | as above + partial surface coverage |
| **7/10** | **OPS-001 / H-004** (the earlier H-001 is DISPROVED — score row retired 2026-07-02) — ✓ runtime log ✓ endpoint ✓ timestamps ✓ frequency ✓ environment ✓ DB query result (info_schema disproof of the rival mechanism) ✓ same-day incident-cluster correlation · ✗ raw error text ✗ reproduction ✗ user impact | see H-004 |
| **10/10** | **OPS-017 schema drift (full diff complete 2026-07-03)** — ✓ full prisma-vs-live diff (all tables, 21 statements) ✓ source ✓ live DB result ✓ environment ✓ timestamps ✓ blast scoped ✓ frequency N/A ✓ leads false-alarm resolved ✓ real drift enumerated ✓ mechanism | — (was 9/10 with ✗ full-diff; closed) |
| **9/10** | **OPS-022 rollback branch auto-pruned** — ✓ live branch list (neonctl: main only, independently re-confirmed 2026-07-03) ✓ prune-cron audit event (`pruned_branches:["pre-gate6-5k-pilot-2026-07-01"]` @ 04:00:48Z) ✓ retention constant read from source (`app/api/cron/neon-branch-prune/route.ts:123` `retentionHours: 24`) ✓ environment (prod Neon) ✓ timestamps/frequency ✓ mechanism · ✗ protected-branch survival not yet validated (that is the fix) | verify a fresh protected/retention-extended branch survives the prune cron |
| **9/10** | **OPS-018 S1 reclaim check** — ✓ surface ✓ source ✓ live DB re-measurement (2026-07-02) ✓ environment ✓ timestamps ✓ disposition recorded ✓ blast scoped · ✗ multi-day synthetic-storage trend series | re-measure post-drain |
| **7/10** | **OPS-010A** — ✓ surface (media-sync/idx-sync upsert paths) ✓ source (`upsertListingMedia` in `lib/idx/media-sync.ts`; full-row UPDATE in `lib/idx/sync.ts`) ✓ log-derived live measurement (38.4K no-op media rewrites/day × 6 days, frozen-cursor week) ✓ DB query result (pg_stat cumulative tuple updates: listing_media 1.82M, listings 838K — 2026-06-12 operator audit) ✓ frequency/timestamps ✓ environment (prod) ✓ blast quantified (every synced row) | ✗ request/response capture · ✗ fresh steady-state re-measurement (≈750 MB+/mo history churn is an ESTIMATE) · ✗ single no-op-write repro with WAL delta. Close via: fresh pg_stat + WAL/history trend pre/post fix |
| **6/10** | **OPS-015** — ✓ surface (`/api/cron/db-keepalive`) ✓ source (`NEON.md:52,321` + `vercel.json` `*/15`) ✓ runtime log (500s incl. 2026-07-01 18:00Z) ✓ frequency/timestamps ✓ environment (prod) ✓ user impact quantified (none user-facing) | ✗ idle-window DB measurement · ✗ suspend/cold-start timing repro · ✗ 60s uptime-monitor interval independently re-confirmed this cycle · ✗ compute-size console check. Decision item — close the ✗ fields before any retirement change |
| **3/10** | PROD-006 (hardening risk — no live artifact possible until a regression exists), PROD-008/H-003 | most live fields N/A or unchecked |

New items MUST be scored on entry; scores are updated (with date) whenever a verification step runs.

---

## 1 · SEO

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| SEO-001 | Sitemap canonical slug mismatch (was 10,069/10,239 = 98.3%) — **VERIFIED FIXED 2026-07-02** by PR #468 (shared `composeSlugStreetName` helper in `lib/listing-slug.ts`, both call sites + parity regression test). **Closing proof (per criteria, post-deploy): full-population live Cotality↔sitemap join = 10,134 joined, MISMATCH = 0 (was 10,069)**; 3/3 former-mismatch URLs fetch SELF-CANONICAL; old-style replica now diverges from the live sitemap on 9,964 rows (confirming the new composition everywhere). Root cause (Evidence Score 10/10) was `app/sitemap.ts` passing `StreetName` alone | **P0** | **Verified Fixed (2026-07-02)** | Claude (fixed) / Audit (verified) | Full-population joins 2026-07-01 (found) + 2026-07-02 (closed); PR #468 |
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
| BIZ-005 | **No dispatcher for `email`/`sms`-channel notifications** — `lib/notifications/engine.ts:59-60` writes `status:'pending'`; no cron ever sends them. Producers: `lib/lead-distribution/assign.ts:150`, `lib/lifecycle/engine.ts:381,403`, `app/api/sign-up/route.ts:243-254`. **Magnitude verified 2026-07-02 (H-002 resolved): ZERO email/sms rows have ever accumulated — table holds only 30 in_app/pending rows.** Gap is real in code but nothing queued, nothing lost today | **P2** (downgraded from P1, Maya directive 2026-07-02) | Blocked/Held (dispatcher HELD) | Maya + Claude | Live count 2026-07-02 + Business-layer audit 2026-07-01 |
| BIZ-006 | **Public search filters applied AFTER pagination** — amenities/keywords/yearBuilt/furnished/ownership filter in-memory post-`findMany` (`lib/search/public-listing-db.ts:365-461`; applied `app/api/listings/route.ts:453`) while `total` ignores them (`route.ts:403,575`) → silently incomplete results, inflated counts, empty deep pages | **P1** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-007 | CRM IDX search silently drops non-OData-safe checkbox filters (`lib/search/crm-idx-filter.ts:263`) — constraint parsed then discarded, results presented as filtered | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-008 | Search `total` vs displayed-count divergence: gates A–F are legitimate (`lib/search/listing-access-decision.ts:16-19,64-71`; `lib/search/public-listing-db.ts:178-190` — explains 9,395 vs 10,249 live-feed gap) but dedupe + post-filters shrink the page after counting — fold remediation into BIZ-006 | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-009 | Lead dedupe is email-only (`prisma/schema.prisma:183`); no phone-based dedupe → duplicate people with independent consent state (TCPA fragmentation) | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-010 | CRM manual client create captures no `consent_captured_at` (`app/api/crm/clients/route.ts:36-78`) — agent-entered contacts carry no consent evidence | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-011 | Roles not merged on UPDATE branch of public upserts (CMA `app/api/cma/route.ts:91-96`, RSVP, search-alerts, guides…); only `/api/contact` unions roles (`lib/leads/lead-upsert.ts:128-137`) — buyer→seller cross-sell signal dropped | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-012 | **Unsubscribe divergence (CAN-SPAM)**: `/api/search-alerts/unsubscribe` does NOT set `Lead.last_unsubscribe_at` (`app/api/search-alerts/unsubscribe/route.ts:19-32`) but sender suppression keys solely on it (`lib/email/sendgrid.ts:130-145`) → alert-unsubscribers remain emailable on other channels; `email_opt_out` write disabled pending migration (`app/api/unsubscribe/route.ts:22-26`) | **P1** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-013 | Sign-up broker alerts are in_app only (`app/api/sign-up/route.ts:243-254`) — broker not logged into CRM never learns of a new unassigned lead (couples with BIZ-005) | **P2** | Open | Claude | Business-layer audit 2026-07-01 |
| BIZ-014 | Public `/api/search-alerts` skips the `canEnableAlertForCriteria` gate the CRM route enforces (`app/api/crm/saved-searches/route.ts:180-193`); cron marks unsupported rows `skippedUnsupported` (`app/api/cron/search-alerts/route.ts:60-78`). Latent (current key set is supported) — no regression guard | **P3** | Open | Claude | Business-layer audit 2026-07-01 |
| SELLER-001 | **NEW BUSINESS TRACK (Maya directive 2026-07-03): Seller Listing Intelligence & External Exposure Dashboard** — the seller side is bare; owners need proof of exposure + measurable activity. Initial listings: **400 East 90th Street 4D** (buyer-exposure angle) + **333 East 46th Street 2G** (investor angle: tenant-in-place engagement, cap-rate/cash-flow interaction, investor vs occupant inquiries). Scope per Maya spec: owned traffic · UTM campaign links · external exposure map (portals, search, social) · **Broker Network Exposure** (IDX/RLS appearances on other brokerages' sites incl. contact-route observation — "network exposure, third-party lead capture" wording) · correctness audit (price/photos/attribution/unit) · engagement events · known-vs-anonymous separation (NEVER promise viewer names unless self-identified) · market comparison via PROXY metrics (never claim competitor traffic without real data) · weekly owner narrative. **Truth levels: verified Mallan traffic / tracked campaign / portal-reported / external presence / market proxy.** Phases: 1 internal `/admin` report (existing data first) → 2 owner portal page → 3 weekly owner email. Data models (listing_events, listing_external_presence, listing_campaign_links, listing_broker_network_presence, listing_owner_reports): **schema migrations are Maya-held — design first, migrate on approval.** NOT blocked on Gate 6/OPS-009/5K | **P1 (business)** | In progress — Phase-1 lane launched 2026-07-03 | Claude (build) / Maya (review + migration approvals) | Maya directives 2026-07-03 |
| SELLER-002 | **SELLER-001 Phase 2 (Maya directive 2026-07-03): public listing event tracking.** Critical events: listing_view · photo_gallery_open · floorplan_click · virtual_tour_click · video_click · contact_click · showing_request_click · share_click · save_click · email_click · external_link_click. Requirements: anonymous visitor_id/session_id capture · NEVER expose names unless self-identified · aggregate by listing_id · source/referrer/UTM/device · Mallan-owned traffic FIRST, external exposure/presence after. **Migration plan APPROVED TO DRAFT — migration must NOT run until Maya reviews it** (NEON.md discipline; fail-closed rollout: code ships no-op behind LISTING_EVENTS_ENABLED until the table exists + flag set) | **P1 (business)** | In progress — Phase-2 lane launched 2026-07-03 | Claude (build) / Maya (migration review + flag) | Maya directives 2026-07-03 |
| OH-001 | **Open-house search-result BADGE can misattach (pre-existing on main; NOT a #472 change).** `findNextOpenHouse` address-key fallback uses `normalizeAddressKey` (`lib/open-houses/upcoming-open-houses.ts:72`) which DROPS directionals (E/W) and has no ZIP, so same-number addresses collide ("400 E 90th" ≡ "400 W 90th") → a Mallan open-house badge can attach to an UNRELATED listing in `/api/listings` search/agent results when the listing ids differ. Public DISPLAY-badge bug (NOT the seller-report attribution path). **Fix in its own PR** with tests: fail closed unless an intended SL-/RL- twin AND a ZIP+directional-disambiguated key. Evidence Score 7/10 — ✓ source ✓ mechanism ✓ git-provenance (pre-existing on main; #472 only added nearby RSVP-linkage lines) ✓ environment · ✗ live repro ✗ blast quantified | **P2** | Open — separate PR (OH/DISPLAY-OPENHOUSE-001) | Claude | Codex #472 review 2026-07-03 + git-verified pre-existing |
| SELLER-FUTURE | **Conditional (future) — Trestle open-house RSVP linkage.** Seller reports cover Mallan-owned SL-/RL- exclusives only; `trestle-*` open houses are third-party IDX/RLS listings, so their RSVPs correctly stay unlinked (`app/api/open-houses/rsvp/route.ts`, by design). IF Mallan later syndicates its OWN listings through RLS/Trestle, add a VERIFIED mapping from trestle open-house ids → Mallan seller-report listings (never link a third-party listing). **Blocked until `MALLAN_OFFICE_MLS_IDS` / own-listing RLS syndication is active** (currently held). Not a #472 change. Evidence Score N/A (future-gated design item) | **Future/Conditional** | Blocked (gated on syndication) | Maya (syndication) / Claude (build when unblocked) | Codex #472 review 2026-07-03 (assessed by-design) |

**Verification criteria:** BIZ-005 dispatcher exists + pending backlog drains to 0 + send log evidence; BIZ-006/008 filtered `total` == filtered count and page N returns matches from the full inventory (doorman/keyword test vs unfiltered baseline); BIZ-007 checkbox filters provably constrain results or UI drops unsupported options; BIZ-012 both unsubscribe paths write the suppression field + a send-suppression test flips green; BIZ-002 one controlled test lead traced intake→routing→audit event (Maya-approved).

---

## 3 · Operations (cron · live Cotality pull · media sync · queues · archive · DB growth)

Deep audit completed 2026-07-01 (code-trace + live Vercel evidence, report-only). All 23 cron routes
exist and are CRON_SECRET-protected (timing-safe); no unauthenticated cron handler.

| ID | Finding | Severity | Status | Owner | Evidence |
|---|---|---|---|---|---|
| OPS-001 | Contact funnel errors (06-28, ×2) — **Hypothesis H-001 DISPROVED 2026-07-02** (live info_schema: the suspect columns are NULLABLE; every NOT-NULL/no-default column is in the INSERT). Now tracked as **Hypothesis H-004**: same-day DB-connectivity incident cluster (correlates with 06-28 `25006` + `P1001` errors on idx-sync/lead-scoring). Zero contact errors since 06-28; corroborated by a NEW lead that SUCCEEDED 06-28 23:01:52 (same window) → transient blip, not a deterministic bug. (The earlier leads "schema↔DB drift" is a FALSE ALARM — see OPS-017: `String[]`→nullable is Prisma's correct mapping and `migrate diff` shows `leads` agrees; no action.) | **P2** (downgraded — no recurrence, mechanism disproved) | Monitoring + Needs live test (H-004) | Claude (verify) | Live info_schema + Vercel logs 2026-07-02; DB recency 2026-07-03 |
| OPS-002 | DB keepalive stability — 500 on pooler 2026-07-01 18:00Z; 24h window otherwise clean (1 keepalive + 1 social-proof error only) | **P1** | Monitoring | Audit | Vercel `get_runtime_errors`/`get_runtime_logs` 2026-07-01 |
| OPS-003 | Sitemap ↔ live-feed drift: 167 off-feed ids still sitemap-published (couples with SEO-007) | **P2** | Monitoring | Claude | Live Cotality diff 2026-07-01 |
| OPS-004 | Live-value discipline: feed uses `ResidentialLease` / `ComingSoon` (no spaces); space-containing filters silently match 0 rows (same class as historical `Coming Soon` sitemap bug, `app/sitemap.ts:88-92`) | **P3** | Open (review-checklist rule) | Claude | Live Cotality distinct-values query 2026-07-01 |
| OPS-006 | Archived-row rehydration (was unguarded on main) — **FIXED by PR #465, merged 2026-07-02T02:35Z after 4 Codex review rounds** (guard = one-way strip + display/clock-field freeze + forced `idx_display_yn:false`; only exit = exact canonical-active unarchive). Deployed `858da234`; live baseline verified: 2,032/2,032 archived rows stripped+hidden, ≥2 clean cycles | **P0 (ops)** | **Fixed — Regression Watch (superseded by RW-004, watch to 2026-07-09)** | Claude (fixed) / Audit (RW-004) | PR #465 + live DB baseline 2026-07-02 |
| OPS-007 | `/api/health/crons` is dead: queries `action IN [cron_success,cron_failure]` (`app/api/health/crons/route.ts:20-33`) but no cron uses `createCronHandler` (`lib/api/cron-handler.ts:82-91`, 0 importers); real crons write bespoke actions → endpoint returns all-null always; its CRON_NAMES list omits 6 live crons. No single-pane cron health exists | **P2** | Open | Claude | Operations audit 2026-07-01 |
| OPS-008 | `media-backfill` orphaned route + data-loss footgun — **VERIFIED FIXED 2026-07-03** by PR #471: route DELETED (dormant since PR #176/2026-05-21 incident; legacy `listings.media` JSON lane; live `media-sync → listing_media` lane untouched); footgun NEUTRALIZED (`audit-media-mediatype-corruption.ts --execute` now refuses with exit 2 — proven by live run); `backfillEmptyMedia`/`migrateMediaToR2` remain as uncalled library code (noted). Remaining tail (deferred, tracked in PR #471 body): api-route-catalog regen (own Class-E PR). *(The stale repo-audit-bot guardrail lines that were part of this tail were removed by the 2026-07-25 Sentinel decommission — that surface no longer exists.)* | **P2** | **Verified Fixed (2026-07-03)** | Claude (fixed) / Audit (verified) | PR #471 + live refusal run |
| OPS-009 | `ARCHIVE_T180_BACKLOG_ENABLED` does NOT gate archiving — flag only swaps the eligibility clock (`data-retention/route.ts:168-171`); nightly T+180 archive loop runs either way. **DESIGN DECIDED (Maya, 2026-07-02): two-flag fail-closed model** — `ARCHIVE_ENABLED` (global kill switch: false → NO archive writes anywhere, dry-runs only) + `ARCHIVE_BACKLOG_DRAIN_ENABLED` (drain-only). Three states: OFF / MAINTENANCE (nightly 500-cap only) / DRAIN. Gate-6 execute requires BOTH flags + `--execute` + `--ack-rollback-branch` + `--max-rows`. **Mandatory carve-out:** `ARCHIVE_ENABLED=false` gates ONLY the T+180 strip — it must NOT disable the T+24h off-market display removal (REBNY UCBA Art. I §6 compliance, not archiving); T+30d media-null placement decided at implementation. **IMPLEMENTED + deployed (#470, merged 2026-07-03) + kill-switch PROOF VERIFIED (OPS-020, 03:00:46Z run: state OFF, skip reason, T+24h carve-out ran, no drain).** NEXT GATE: Maya sets `ARCHIVE_ENABLED=true` (MAINTENANCE) → verify one clean MAINTENANCE cycle → then the 5K execute (which ALSO requires a FRESH rollback branch — see OPS-022, the prior one was auto-pruned) | **P1** | **Awaiting Maya: ARCHIVE_ENABLED=true (MAINTENANCE) decision** | Maya (flag) / Audit (verify cycle) | #470 + OPS-020 proof 2026-07-03 |
| OPS-020 | **OPS-009 03:00 UTC behavioral proof — VERIFIED 2026-07-03T03:00:46Z (first retention run on the deployed kill switch).** All FOUR Maya criteria confirmed from the run's audit event (exact fields verbatim): (1) `archive_control_state: "OFF"` ✓ · (2) `archive_skipped_reason: "ARCHIVE_ENABLED off"` ✓ · (3) T+24h off-market display step RAN unconditionally (log: "UCBA carve-out"; `closed_listings_removed_from_idx` present in results) ✓ · (4) NO drain — `t180d_listings_archived: 0`, 0 drain audit events since 07-02, population 2,032/0-payload/0-displayable intact ✓. **NEXT GATE (Maya): set `ARCHIVE_ENABLED=true` for MAINTENANCE → verify one clean MAINTENANCE cycle (next 03:00 run: archive loop runs, 500-cap, T+24h unaffected) → PREPARE the 5K pilot command (do NOT execute) → 5K only on Maya's explicit approval.** Holds: `ARCHIVE_BACKLOG_DRAIN_ENABLED` stays unset until the pilot window | **P1** | **Verified (proof complete) — awaiting Maya's MAINTENANCE decision** | Claude (verified) / Maya (flag decision) | 03:00:46Z run audit event + runtime log + read-only DB 2026-07-03 |
| OPS-022 | **Gate-6 rollback branch AUTO-PRUNED — Confirmed live 2026-07-03.** The `neon-branch-prune` cron deleted `pre-gate6-5k-pilot-2026-07-01` (`br-winter-credit-adlh315q`) at 2026-07-03T04:00:48Z (audit event `neon_branch_prune_cron`: `pruned_branches:["pre-gate6-5k-pilot-2026-07-01"]`, 24h retention exceeded). Live branch list now = **main only** (`br-crimson-frog-adr7g9gt`). The Gate-6 strip is one-way, so a rollback branch is a HARD prerequisite for any 5K execute — the handoff's "rollback branch already exists / no additional branch required" is now FALSE. **Required before execute: create a fresh pre-gate6 rollback branch AND either mark it protected or extend the prune retention so it survives to the pilot window** (both are Maya-held Neon actions). Root cause (Evidence Score 9/10): the rollback branch was not protected and the prune cron's `retentionHours: 24` (`app/api/cron/neon-branch-prune/route.ts:123`) is shorter than the merge (2026-07-02T02:35Z)→pilot gap. **Evidence Score 9/10** — ✓ live branch list (main only, re-confirmed 2026-07-03) ✓ prune-cron audit event (`pruned_branches` + 04:00:48Z) ✓ retention constant read from source ✓ environment ✓ timestamps/frequency ✓ mechanism · ✗ protected-branch survival not yet validated (the fix). Blast: **BLOCKS the 5K pilot** — the archive strip is one-way, so with no rollback branch there is no restore path (PITR is only 6h, OPS-016). Detection: auto-probe (dashboard) + live neonctl | **P1** | **BLOCKER for 5K execute — needs Maya (create + protect fresh branch)** | Maya (Neon action) / Audit (verify) | Live neonctl branch list + prune-cron audit event 2026-07-03 |
| OPS-010 | Unbounded growth: `listing_media` soft-delete tombstones never purged (`lib/idx/media-sync.ts:585-624,1038-1040`) and `sync_errors` has no retention (`archive-terminals.ts:218-228`); both monotonic | **P2** | Open | Claude | Operations audit 2026-07-01 |
| OPS-010A | **Storage churn suppression** — no-op media/Cotality upserts create recurring WAL/history churn: `upsertListingMedia` rewrites every media row with no diff-suppression and idx-sync does full-row rewrites; measured live 38.4K no-op rewrites/day for 6 days (frozen-cursor week); pg_stat cumulative tuple updates listing_media 1.82M / listings 838K; idx-sync ≈3,850 upserts/day × 6.4 KB avg row ≈ ~25 MB/day WAL; estimated steady-state history churn ≈750 MB+/mo. (Source: cron/write-frequency operator audit 2026-06-12 — read-only SELECT probes against cold-waterfall; file kept **uncommitted by operator instruction**, key figures inlined here so this row is self-sufficient.) **This is a larger long-term Neon storage driver than the one-time Gate-6 archive backlog.** Action: diff-before-write — if Cotality sends the same data again, compare before writing; no change = no DB write — for media + full-row sync updates, **only after #465 is merged** (sequenced behind OPS-006) | **P1** | Open (sequenced after #465) | Claude | Prior live measurement 2026-06-12 + static analysis 2026-07-01 |
| OPS-011 | Search-projection dual-write is best-effort, non-transactional (`lib/idx/sync.ts:462-464`; `data-retention/route.ts:78-115` counts failures but leaves projection stale) — **latent public leak the moment PR-5B reader swap lands** with unhealed rows | **P2** | Open (pre-req for PR-5B) | Claude | Operations audit 2026-07-01 |
| OPS-012 | Media cursor ghost-skip: RC5 marks missing-listing Properties ok and advances past them (`media-sync.ts:1710-1716`); if feed-reconcile orphan-create fails/budget-stops (`feed-reconcile/route.ts:342-345,388-417`), listings stay photoless until PhotosChangeTimestamp bumps | **P3** | Open | Claude | Operations audit 2026-07-01 |
| OPS-013 | Cron comment/schedule mismatches: `idx-sync` says "every 4 hours" (actual `*/10`); `db-keepalive` says "every 4 min/5-min timeout" (actual `*/15` — stated purpose unmet; also writes NO audit event ever → failures invisible to ops:health); `experiment-metrics` says "Daily 9am" (actual weekly Sun 02:00) | **P3** | Open (fix comments, not schedules) | Claude | Operations audit 2026-07-01 |
| OPS-014 | `rotate-db-keys` workflow: schedule disabled but `workflow_dispatch` still live (`.github/workflows/rotate-db-keys.yml:12`); defended by canonical-host guard; "DISABLED" header overstates. Also `cleanup-neon-preview-branch.yml:49,126` hardcodes morning-bread as refuse-sentinel (confirm abort-only) | **P3** | Open (verify + tighten wording) | Claude | Operations audit 2026-07-01 |
| OPS-015 | **db-keepalive redundancy** — at `*/15` it cannot prevent 5-min compute suspends (`NEON.md:52,321`); the DB is already kept warm ~24/7 by idx-sync (`*/10`) + media-sync (`*/15`) + a 60s external `GET /` uptime monitor (finding of the 2026-06-12 cron/write-frequency operator audit — file kept **uncommitted by operator instruction**, finding inlined here; independent re-confirmation of the monitor interval is an open ✗ field in this item's Evidence Score); the cron's main production output is error-dashboard noise (its 500s = OPS-002, masking real DB incidents). Track for retirement / re-purpose decision — **not fixed now** (cron config is Maya-held) | **P3** | Decision needed (Maya) | Maya (decision) + Claude (implement) | Prior audits + NEON.md read 2026-07-01 |
| OPS-016 | **NEON.md ↔ live Neon drift (Confirmed live 2026-07-02, read-only neonctl):** (a) **history/PITR retention is 21,600s = 6 HOURS**, not the "7-day Launch PITR window" claimed in `NEON.md:51` and assumed by both Gate-6 plans + the s1 reclaim assessment — the 6h window governs how fast HISTORY ages out after branch deletion; it does NOT produce a same-day billed-storage drop (superseded by **OPS-018**, measured 2026-07-02: freed TOAST space is reusable-not-returned — do not treat a missing drop as an anomaly). Point-in-time restore reaches back only 6h (named rollback branch still pins its LSN — Gate-6 safety intact); (b) **compute is FIXED 0.25 CU min/max, no autoscaling** → max 180 CU-hr/mo < 300 baseline → $19/mo flat confirmed, zero overage risk (closes the "compute size ABSENT" console-check gap); (c) storage: main logical 1,435 MB · rollback branch 1,433 MB (CoW) · synthetic/billed 1,493 MB = 14.6% of 10 GB cap · 2 branches. **NEON.md §2 corrected 2026-07-02** (Maya investigate-and-fix directive) with the full explanation: Neon docs verified — Free default 6h, paid default 1 day, Launch MAXIMUM 7d (project-level setting, Console → Settings → Instant restore); this project kept its Free-era 6h setting through the 2026-05-17 Launch upgrade; the old row conflated the Launch maximum with the configured value. Wording rule (Maya): **verified directly from Neon configuration**, NOT inferred from runtime | **P2** | **RESOLVED 2026-07-05** — all facts re-verified live read-only (`neonctl projects get`/`branches list`/`connection-string`): retention `21600s`=6h unchanged, compute fixed 0.25 CU, **1 branch (main only)**. NEON.md now carries a machine-checked §2.1 `NEON:FACTS` block; **`npm run neon:verify` (scripts/neon-verify.ts) fails on any docs↔live drift** (proven: simulated drift → exit 1) and is wired into `health:probe`. Stale storage (~215 MB → synthetic ~1.51 GB) + branch-count (8→1) figures corrected; 7-day raise documented as an optional Maya-gated Console/API lever (not applied). No live setting/env/cron/migration/branch changed. | Claude | Neon config API (neonctl) 2026-07-05 + `neon:verify` PASS 12/12 |
| OPS-017 | **Schema drift — FULL prisma-vs-live diff COMPLETE 2026-07-03 (read-only `prisma migrate diff`, 21 statements).** The original `leads`-column concern was a **FALSE ALARM**: `seller_potential_reason`/`building_type_pref` are `String[]`, which Prisma maps to a nullable array column by design — `migrate diff` emits ZERO change for `leads`, so schema and live AGREE. Real drift (all "live has leftovers the schema removed", benign): **5 orphan tables** deleted from the schema but still in prod (`campaign_recipients`, `engagement_events`, `experiment_listings`, `financial_ledger`, `micro_commitments`) + their FKs + **3 orphan indexes** (incl. `listings_property_type_idx`, `listings_idx_display_yn_owner_opt_out_idx`) + **3 minor `updated_at` DEFAULT drifts** (external_listing_comments, external_listings, listing_search_projection). `listing_events` shows as schema-only = the **SELLER-002 staged table, correctly NOT applied** (not drift). The app references none of the orphans; cleanup (dropping them) needs a Maya-held migration — no action now | **P3** | **Verified (full diff done) — leads concern retired; real drift is benign orphans; cleanup deferred (held migration)** | Claude (diffed) / Maya (migration if/when) | Read-only `prisma migrate diff` live vs schema.prisma 2026-07-03 |
| DOC-001 | **Platform Architecture document missing** (Maya directive 2026-07-02): a real architectural map — not a handoff, not an issue list — built FROM THE ACTUAL CODEBASE, never from memory. Scope (Maya-expanded): full pipeline **Cotality → Normalization → Validation → Fair Housing → REBNY Compliance → Persistence → Archive Engine → Search Index → Website API → Next.js Pages → SEO → Email/CRM**, PLUS separate maps for: cron jobs (23) · scheduled tasks · background workers · Vercel · Neon · Redis · authentication · owner portal · admin portal · search · CRM · notifications · reporting — every queue, webhook, API boundary (284 routes), and database boundary. Goal: any future issue placeable instantly (where data entered / what transformed / what persisted / what published / what archived). Becomes canonical doc #6 once written | **P1** | Open — dedicated lane (fresh session, full context budget) | Claude (author) / Maya (review) | Maya directives 2026-07-02 |
| OPS-018 | **S1 reclaim check — Confirmed live 2026-07-02** (scheduled alert; read-only re-measurement vs the 2026-06-25 baseline): compliance strip HOLDING (543 kB vs 541 kB); both S1 rollback branches deleted + 6h retention elapsed + autovacuum ran — and physical size still did not drop (`pg_database_size` 1,394→1,413 MB; TOAST 716→717 MB) → **freed ~202 MB is reusable-not-returned** (s1 plan step-4 scenario confirmed). Disposition (Maya 2026-07-02): **no compaction now; no pg_repack until after the Gate-6 drain, if at all; VACUUM FULL remains forbidden**; future row growth consumes the freed space first. Live signal: synthetic/billed grew **+36 MB/day** (1,493→1,529 MB) — reinforces **OPS-010A** as the real storage-churn lever. Note: `n_live_tup` 144,768 vs 110,624 actual = pg_stat estimator drift, not row growth. Evidence Score 9/10 (✗ multi-day synthetic trend series). Blast: Neon storage/cost only — no user-facing impact. Detection: scheduled alert + read-only DB/Neon-config measurement. Tech Owner: Claude (measure) · Verification Owner: Audit (re-measure post-drain) | **P3** | **Verified — no action; revisit post-drain (fold into pilot evaluation)** | Claude / Audit | Read-only DB + neonctl 2026-07-02 vs s1 baseline 2026-06-25 |
| OPS-019 | **Trestle/RLS notice (Class C, dated 2026-07-02, relayed by operator): Corcoran + Sotheby's platform migration → new branch-office MLS IDs.** Starting **July 7** the first migrating group's agents/listings get new `OfficeMLSID`/`ListOfficeMLSID` values under new branch offices; remainder expected **September** (dates TBC by follow-up notice). Affects ONLY statuses Coming Soon / Active / Hold / Pending. Office resource: `MainOfficeMLSID == OfficeMLSID` → main office; differ → branch (fields "on the way" if not yet in API). **Impact assessment (code-verified 2026-07-02):** our office-ID usage is mapping/pass-through only (compliance mappers, raw_data keep-fields, DTO attribution by NAME); no branch↔main-office linking logic exists; `MALLAN_OFFICE_MLS_IDS=[]` (syndication held) → per the notice, **no integration changes required**. Operational implications to WATCH: (a) the migration will re-emit large Corcoran/Sotheby's inventory ~Jul 7 → sync-volume + WAL/churn spike (context for OPS-010A and the RW-002/RW-004 watch windows — do not misread the wave as a regression); (b) archived-row guard handles any archived re-emits per its contract (Hold/Pending → stay stripped; canonical Active → legitimate unarchive); (c) attribution strings may change office names — cosmetic, compliant either way. Verification: post-Jul-7, confirm one sync cycle absorbs the wave cleanly (0 error spike) + optional `trestle:probe MainOfficeMLSID` once fields appear. Contacts: trestlesupport@corelogic.com / RLSSupport@REBNY.com | **P3** | Monitoring (watch dates: 2026-07-07 + September follow-up) | Claude (watch) / Audit (post-wave verify) | Dated RLS/Trestle notice via operator 2026-07-02 + code grep |

**Verification criteria:** OPS-001/H-004 (updated 2026-07-02 — there is NO fix to merge; H-001's mechanism was disproved and the info_schema check is DONE): one controlled NEW-email contact submission (Maya-approved write test) → 2xx + Lead row + captured runtime logs showing no db-category error; plus continued clean-window watch (0 contact errors since 06-28). OPS-006 (updated 2026-07-02): #465 MERGED — remaining criterion is RW-004 (archived re-emit observed staying stripped, or 7 clean days + intact population by 2026-07-09). OPS-007 endpoint returns real per-cron freshness for all 23 crons. OPS-008 either cron scheduled (idx:validate goes 0 critical) or route+script removed. OPS-009 explicit flag gate or documented accepted behavior. OPS-010 retention added; table row-counts trend flat post-purge.

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

| QUAL-006 | `idx:validate` 1 CRITICAL (media-backfill NOT SCHEDULED) — **VERIFIED FIXED 2026-07-03** by PR #471 (delete-over-schedule per the OPS-008 audit trail). **Closing proof: `idx:validate` on merged main@`ab56ecd8` → exit 0 · 0 critical · 1240✓** (§B baseline restored); probe cell now verifies BOTH halves (schedule + route-file absence, red on regression — behaviorally proven both states) | **P1** | **Verified Fixed (2026-07-03)** | Claude (fixed) / Audit (verified on main) | PR #471 + validator runs before/after |
| QUAL-007 | `ethics_training_gate` WS-C4 (UCBA Art. III §6) was mislabeled as an authentication gate: the workflow-map demanded a login/MFA ethics block that had been deliberately removed (commit 2c10ce0b, after placeholder dates locked agents out). Corrected in **PR #545** — reframed as an administrative RECORD (schema, migration, broker admin route, audit log); obsolete operational action + write-capable backfill removed; ethics never blocks login. Workflow completeness 11/11 locally. | **P2** | Fixed (PR #545, pending Maya approval + merge) | Claude | Validator run 2026-07-01 → corrected 2026-07-21 |
| QUAL-008 | Doc drift in CLAUDE.md baselines: §G says `crm:test` "172/172" (actual runner: 39/39); §B says `compliance-check` "93/93" (actual: 91 passed + 1 warn). Also `rls:validate` 1 warning: `RENTAL-FORM-REDESIGN.html` MlsStatus picklist missing `ComingSoon` | **P3** | Open | Claude | Validator run 2026-07-01 |
| QUAL-009 | `lint`: 0 errors, 11 warnings (set-state-in-effect `app/components/AgentAvatar.tsx:29`; unused vars ×4; unused eslint-disable ×5) | **P3** | Open | Claude | Validator run 2026-07-01 |

Validator suite snapshot (2026-07-01, branch `docs/agent-health-dashboard-2026-07-01`): type-check 0 err ·
rls:validate 0 err/1 warn · compliance-check 91 pass, 0 BLOCKER+STRICT fail, 1 HIGH warn · ucba:audit 46/46,
0 REGRESSIONS · **idx:validate now exit 0 / 0 critical on merged main@ab56ecd8 (QUAL-006 Verified Fixed 2026-07-03 via #471)** · crm:test 39/39 · test:rls 41/41 (run by hand — NOT in PR CI) ·
lint 0 err/11 warn. (Snapshot re-run 2026-07-03: 9/9 gates exit 0 — see changelog whole-system audit entry.)

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
| 2026-07-01 | Neon/shedding evaluation (Maya directives): added OPS-010A (storage churn suppression — diff-before-write, sequenced after #465) and OPS-015 (db-keepalive redundancy — tracked decision). Shedding operating rule + mandatory 6-step sequence recorded in dashboard Gate 6 section + Neon/Gate6 handoff doc: archive durable · sync must not recreate stripped data · no-op syncs must not rewrite. DO NOT EXECUTE until sequence steps 1–4 complete; 5K pilot only; scale only after stay-stripped proof. |
| 2026-07-02 | **#465 merged + deployed + live-verified; hypotheses closed with live DB evidence** (read-only neonctl connection, session `default_transaction_read_only=on`, host-guarded): H-001 **DISPROVED** (suspect columns nullable in live DB) → replaced by H-004 (06-28 DB-connectivity cluster); H-002 **RESOLVED** (0 email/sms dead-letters; 30 in_app/pending only) → BIZ-005 downgraded P1→P2; OPS-001 downgraded P2/Monitoring. RW-004 added (guard live-behavior watch; baseline: 2,032/2,032 archived rows stripped+hidden, ≥2 clean cycles post-deploy). OPS-016 added (NEON.md 7-day-PITR claim vs live 6h retention; compute confirmed fixed 0.25 CU — $19 flat; billed storage 1,493 MB). OPS-009 marked Decision made (two-flag design + UCBA T+24h carve-out) — implementation is the next code lane, required BEFORE the 5K execute. Gate 6 remains paused. |
| 2026-07-02 | Codex #467 rounds 1–2 addressed (auto-tier refresh + probe auto-retire of merged-PR row; OPS-006 superseded to Fixed/RW-004; H-001 metadata retired across annotations/scores/fields; open-risks bullets + P0/P1 summary synced). Added OPS-017 Schema Drift (P1, ES 9/10) and DOC-001 Platform Architecture document (P1). Execution roadmap reordered per Maya: Track 1 SEO-001 → Track 2 OPS-009 → Track 3 5K pilot → Track 4 OPS-017 dedicated audit. OPS-016 wording: verified directly from Neon configuration, not inferred. |
| 2026-07-05 | **OPS-016 RESOLVED (permanent).** All Neon facts re-verified live read-only (`neonctl` — retention `21600s`=6h unchanged, compute fixed 0.25 CU, 1 branch/main only, `launch_v3`). Added `npm run neon:verify` (`scripts/neon-verify.ts`) + a machine-checked `NEON:FACTS` block in NEON.md §2.1 that fails on any docs↔live drift (proven: simulated drift → exit 1; live PASS 12/12), wired into `health:probe`. Corrected stale NEON.md storage (~215 MB → synthetic ~1.51 GB) + branch-count (8→1); the 3 Gate-6 runbooks' stale "7-day PITR window" phrases corrected to 6h. 7-day retention raise documented as an optional Maya-gated Console/API lever — **not applied**. No live setting/env/cron/migration/branch touched. Residual "7-day PITR" mentions in 3 **dated** planning artifacts (`docs/superpowers/plans/2026-06-15…`, `…-06-25…`, `…-06-29-gate6-accelerated-archive-drain-plan.md`) + the dated `docs/audits/neon-storage-cost-audit-2026-06-12.md` are left as historical records (superseded by NEON.md/OPS-016); rewriting dated docs would be out-of-scope cleanup — a separate doc-sync sweep if Maya wants them touched. |
| 2026-07-02 | **OPS-018 S1 reclaim check recorded** (scheduled alert): strip holding; freed TOAST space reusable-not-returned; no compaction now; no pg_repack until after Gate-6 drain, if at all; VACUUM FULL forbidden; +36 MB/day synthetic growth reinforces OPS-010A. No production action taken; Gate 6 remains paused. |
| 2026-07-03 | **OPS-020 VERIFIED (all four Maya criteria, 03:00:46Z retention run):** audit event carries `archive_control_state:"OFF"` + `archive_skipped_reason:"ARCHIVE_ENABLED off"` verbatim; T+24h UCBA step ran unconditionally; 0 drain events; population 2,032/0/0 intact → **OPS-009 behaviorally verified live** — ready for Maya's ARCHIVE_ENABLED=true (MAINTENANCE) decision. **Whole-system audit 2026-07-03:** LOCAL lane 9/9 gates exit 0 on merged main (176 suites/2,673 tests; idx:validate 0 critical confirmed); LIVE lane zero error/fatal logs across ALL routes in 24h, SEO-001 re-join MISMATCH 0 (10,133 joined), endpoints 200. INTEGRATION: all 3 open branches merge clean vs main AND each other (probe.ts seam disjoint+coherent); #465 guard ⟂ #470 controls independence confirmed both directions; no live media-backfill references. Notes (5, minor): stale api-route-catalog artifact; repo-audit-bot 'don't remove' lines (held surface); dead backfillEmptyMedia/migrateMediaToR2 library code; StreetDirSuffix card-slug edge; main's governance docs stale until #467 merges. |
| 2026-07-02 | OPS-019 recorded: Trestle/RLS Class-C notice — Corcoran+Sotheby's branch-office MLS-ID migration (Jul 7 first wave, Sept remainder; CS/Active/Hold/Pending only). Code-verified: no integration change required; watch for sync-volume/churn wave ~Jul 7 (context for OPS-010A, RW-002, RW-004). |
| 2026-07-02 | **SEO-001 VERIFIED FIXED (Track 1 complete):** PR #468 merged 19:49Z; deploy READY; sitemap regenerated; full-population verification MISMATCH 10,069 → **0** (10,134 joined); 3/3 former-mismatch URLs self-canonical. Track 2 = OPS-009 implementation. |
| 2026-07-03 | **QUAL-006 + OPS-008 VERIFIED FIXED:** PR #471 merged 00:36Z (route deleted, footgun neutralized, probe both-halves guard); closing proof `idx:validate` on main@ab56ecd8 = exit 0 / 0 critical / 1240✓ — §B baseline restored. Also merged this cycle: #470 (OPS-009 archive controls — live, fail-closed OFF; behavioral proof due at the 03:00 UTC retention run). Remaining validator blemish: QUAL-007 HIGH warn only. |
| 2026-07-03 | **#472 independent review (Codex rate-limited → 3 Claude review lenses) caught a real §D regression in r10; fixed r11 (`1c06b4c0`, pushed, NOT merged).** r10's "any non-generic token is distinctive" reopened cross-street RSVP false-positives (East End Ave RSVP → West End Ave listing; "Apt A" → Avenue A) — one seller's activity mis-attributed to another. r11 rewrites the matcher to fail CLOSED: direction words must agree, unit/apartment tail stripped before name compare, street-type suffixes expanded + must agree, distinctive core token required. SQL returning-viewers fix (GROUP BY lead_id) confirmed correct + locked with a source-level guard test (raw SQL un-runnable in jest). TDD RED→GREEN 49/49; full runtime 2723; type-check 0; compliance chain clean. #472 still HELD (awaits fresh Codex on the reset). |
| 2026-07-03 | **OPS-017 full prisma-vs-live diff COMPLETE (read-only) → P1→P3.** leads-column "drift" was a FALSE ALARM (Prisma `String[]` → nullable array by design; `migrate diff` emits no leads change). Real drift = 5 orphan legacy tables + 3 orphan indexes + 3 `updated_at` defaults (benign live-only leftovers); `listing_events` schema-only = expected SELLER-002 staged migration. App references no orphans; cleanup needs a held migration, no action now. Rescored 10/10 (full-diff ✗ closed). **H-001** gains a second live disproof (a new lead succeeded 06-28 23:01:52); **H-004** corroborated (that same-window success rules out a deterministic bug → transient blip; confidence Medium→Medium-High) — funnel idle since (0 submissions/5d; 51 leads ever). All read-only; no writes/migrations. |
| 2026-07-03 | **Codex #472 findings triaged (Maya-agreed dispositions):** OH-001 registered — open-house search-badge address-key collision is PRE-EXISTING on main (git-verified), a public display bug, split to its own PR (not bolted onto #472). SELLER-FUTURE registered — trestle-* RSVP linkage is by-design (Mallan-only seller reports; third-party IDX listings correctly unlinked), gated on future own-listing RLS syndication. Neither changes #472. |
| 2026-07-03 | **Review policy codified in AGENTS.md §6 (Maya directive):** Codex is preferred not mandatory; high-risk PRs (migrations · env flags · cron · archive/shedding · billing/storage · public compliance surfaces · contact/lead writes · seller-report attribution) need Codex-clean OR two independent clean reviews + written exception; low-risk docs/read-only need CI green + one independent review + no unrelated files + no unresolved Codex finding if available; every Codex finding must be fixed, split as pre-existing, or documented future-gated/out-of-scope. |
