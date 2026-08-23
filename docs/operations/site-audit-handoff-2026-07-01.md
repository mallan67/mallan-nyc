# MAllan Website — Site Audit Handoff

## 2026-07-31 CURRENT HANDOFF (04:20Z)

> **This block is the current handoff. Everything from `# MAllan Website` through the end of the
> file below the 2026-07-02 update is the PRESERVED 2026-07-01 SNAPSHOT — do not edit it.**

| field | value |
|---|---|
| **Date / time** | 2026-07-31 04:20Z (advanced from 03:30Z — this block now carries probe evidence generated at 04:18:55Z) |
| **Current `main` SHA** | `04db1b9921130cc1150f29508101567537573acb` |
| **Open PRs** | **#590** (draft) registry consolidation — this one · **#589** (draft) OPS-024 raw-provider contract + cursor guards, undeployed · **#585** (draft) canonical platform plan, 5 files |
| **Latest production deployment** | **`dpl_BVgQhFFdiTf1RU77iHFppvZ5PuSk`**, git SHA **`e113a1effad018ed0767e0df6aa94fcac06387bd`**, `target: production`, holding the live aliases `mallan.nyc` / `www.mallan.nyc` / `mallannyhomes.com` / `mallan-nyc.vercel.app` (Vercel API, 2026-07-31). Current `main` is `04db1b99`, so **the production alias is pinned to an older SHA.** **However, no application code is un-promoted:** `git diff e113a1ef 04db1b99` touches only `docs/PLATFORM-ISSUE-REGISTRY.md` and `docs/PROJECT-HEALTH-DASHBOARD.md` (6 net lines); **zero** app/, lib/, prisma/, workflow, env, cron or config files differ. Production and `main` are **runtime-source equivalent**; their full trees are not identical. **Why the alias was not advanced is NOT established** — that is the deployment-promotion lane, and it is a release-control risk, not evidence of divergent runtime code. |
| **Runtime errors, last 24h** | **Single capture, 2026-07-31 between 03:20Z and 03:29Z** (exact retrieval time not recorded by the tool; the block containing it was written at 03:30Z) (Vercel `get_runtime_errors`, `since=24h`) — values below are from that one retrieval and are not mixed with later reads. **PRODUCTION (`dpl_BVgQ…`):** `[public-cache] cache layer error — degrading to live read` ×12 / 11 users on `/buildings/[slug]`, `/rent.rsc`, `/buy.rsc` — **Neon connection-pool timeout (limit 5, timeout 10s)** and `Can't reach database server at ep-cold-waterfall-adno3ao2-pooler`; `/api/media/proxy` aborted ×7; `P1017 Server has closed the connection` on `/listing/[...slug]` ×4. **PREVIEW ONLY — NOT PRODUCTION (`dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV`, branch `feat/adaptive-white-border-crop`, PR #149, `target: null`, branch-preview alias only, created 2026-05-17):** `/api/market` ×7 and `/api/listings/similar` ×6 with `Environment variable not found: DATABASE_URL`. Those fail **before** Prisma opens a connection, so they do **not** contribute to the production pool exhaustion. A 2½-month-old preview still erroring is worth its own look. |
| **Unresolved blockers** | `BIZ-006` (see below) · reset-sync destructive-route protection **not started** · deployment promotion **not started** · Neon CPU/storage and R2 growth **not remediated** · `#585` compliance P1 (gate 5/6 taxonomy) open |
| **What changed** | Registry-only consolidation: `OPS-026` withdrawn, `BIZ-006` made canonical, `BIZ-008` superseded, Evidence Score corrected to 3/10, derived layers synchronized. **No application, schema, migration, workflow, cron, environment, Neon or R2 change.** |
| **Exact stopping point** | PR #590 draft, awaiting one exact-head review then merge. **Its head is the commit that contains this block** — deliberately not written as a literal SHA, because any SHA named here is invalidated by the commit that writes it. Read the head from the PR. Nothing merged, nothing deployed, no production write performed. |

**Dashboard auto tier REFRESHED.** `npm ci` then `npm run health:probe` completed at **2026-07-31T04:18:55Z**, refreshing 11 generated cells in `docs/PROJECT-HEALTH-DASHBOARD.md`. The block now reports `main` **`04db1b99`** and **3 open PRs (#590, #589, #585)**, replacing the stale 2026-07-28 values. **Three cells remain ⚪ unverified by design** — Cotality sync-attempt freshness, last-run outcome and DB growth/archive state — because no canonical `DATABASE_URL` was present in the environment; that is the probe's own fail-open marker, not a skipped check.

> **Execution note.** The first probe run was discarded and re-run: this worktree's local `main` ref was stale at `e113a1ef`, and `scripts/health/probe.ts` reads the SHA from the local ref, so the first output reported `main e113a1ef`. The local ref was updated to `origin/main` and the probe re-run; the committed block reflects the corrected run. This was a **local environment condition in one worktree**, corrected in place; the committed dashboard is from the corrected run, so nothing incorrect was published. **No registry issue is opened here — that is a recorded decision, not an oversight:** Maya directed that this PR not be expanded with a new issue after eleven commits, and under the Single-ID invariant a durable finding needs a registry ID, evidence score and derived-summary propagation. **Owner: Maya — to be raised separately if the local-ref behaviour is to be tracked as a repository defect.**

**Issue propagation (Derived-summary invariant).** **`BIZ-006`** is the **single canonical ID** for
the public-search pagination/count-integrity defect across the DB and Cotality-fallback runtimes;
**`BIZ-008` is superseded by it** — do not verify or close `BIZ-008` separately. Rescored to
**Evidence Score 3/10 — VERIFY FIRST** (was 6/10; the earlier score counted non-ledger fields).
**Static code read only — no production reproduction, no affected-user count, no runtime fix
authorized or included.** Next step: capture a live filtered-search request/response transcript on
**both** runtimes before any production change. Full description and evidence:
**`docs/PLATFORM-ISSUE-REGISTRY.md` → `BIZ-006`** (per the Single-ID invariant, not duplicated here).

---

> **2026-07-02 UPDATE (supersedes the #465/#466 directives below):** PR #466 merged 01:33Z; PR #465 merged 02:35Z after 4 Codex rounds on current HEADs (final HEAD `abc8d613`, not `65b9507a`); guard deployed `858da234`, live-baselined under registry **RW-004**. PR #468 (SEO-001) merged 19:49Z — Verified Fixed (MISMATCH 10,069→0). Gate 6 stays paused: OPS-009 two-flag controls are now **IMPLEMENTED + deployed + kill-switch VERIFIED** (#470 / OPS-020, 2026-07-03); the remaining 5K prerequisites are **`ARCHIVE_ENABLED=true` + one clean MAINTENANCE cycle AND a fresh protected rollback branch (OPS-022 — the prior one was auto-pruned 2026-07-03)**. Live status → dashboard + Platform Issue Registry; the lines below are the 2026-07-01 snapshot kept for history.

Date: 2026-07-01
Repo: `mallan67/mallan-nyc`
Vercel project: `mallan-nyc` / `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`
Team: `mallan` / `team_kZQh5NYLyrOKqffK0r9EXf4E`

## Purpose

This file is the single handoff checkpoint for the current operating picture. Use it before starting new work, after Claude/Codex makes changes, and before any production-affecting action.

The goal is to stop fragmented decisions. Future agents must update this file with what was checked, what changed, what is broken, and what is blocked.

## Non-negotiable holds

Do not run without explicit approval:

- Gate 6 `--execute`
- any archive drain execute
- 20K or 80K drain batches
- manual cron trigger
- Vercel env changes
- Neon reclaim/downgrade
- `VACUUM FULL`
- `rotate-db-keys`
- production migrations / `prisma migrate deploy`
- PR-5B
- projection backfill
- PageSpeed/media lane
- CRM UI rebuild work beyond audit
- notification dispatcher
- open-house v2

## Current production database identity

Canonical Neon production:

- Project: `hidden-mountain-87248164`
- Org: Vercel-managed org / `Vercel: maya`
- Branch name: `main`
- Internal branch ID: `br-crimson-frog-adr7g9gt`
- Canonical endpoint: `ep-cold-waterfall-adno3ao2`

Stale / wrong targets:

- Project: `morning-bread-68708332`
- Endpoint: `ep-royal-dawn-ad6eh8t2`

Existing rollback branch for Gate 6 pilot:

- Name: `pre-gate6-5k-pilot-2026-07-01`
- Branch ID: `br-winter-credit-adlh315q`
- Parent: `br-crimson-frog-adr7g9gt`
- Restore LSN: `4/745307E0`
- Created at: `2026-07-01T07:40:39Z`
- Compute: none / `--no-compute`

## Current repo state

Repository is public and default branch is `main`.

Recent critical PRs already merged:

- #457 — Gate 6 bounded archive-drain tooling, merged as `c60ed35511a15752f39227d790d988d8a591c1bd`. Tooling only. No execute.
- #458/#459 — owner portal IDOR lane closed.
- #460/#461 — Fair Housing/compliance lane closed.
- #463/#464 — open-house display bug lane closed.

Current open PR:

- #465 — `fix(gate6): idx-sync archived-row rehydration guard`.
- Status as of this handoff update: open, not merged.
- Current head: `65b9507acde38062ac610eb30041ee0bf3f9bdc9`.
- Changed files: `lib/idx/sync.ts`, `tests/runtime/idx-sync-archived-rehydration-guard.test.ts`.
- Important: prior Codex P2 comment about NULL `sync_status` reviewed older commit `f94a1b0c`. Current head `65b9507a` already changed `archivedSafeMediaWhere()` to the NULL-safe form:
  - `OR: [{ sync_status: null }, { sync_status: { not: 'archived' } }]`
  - This allows legacy `sync_status IS NULL` rows and non-archived statuses while excluding exact `archived`.
- ~~Await Codex review on current head `65b9507a` before merge approval.~~ **[SUPERSEDED 2026-07-02: reviewed through 4 rounds; MERGED.]**
- Secondary low-risk nit: `backfillEmptyMedia` may increment `updated++` even when an `updateMany` matches 0 rows. This appears to be a counter/reporting issue, not a data correctness issue. Do not expand scope unless explicitly approved.

## Live Cotality/Trestle API pull — do not call this generic “IDX” only

The live listing feed is the Cotality/Trestle API pull, implemented through `/api/cron/idx-sync` and `lib/idx/sync.ts`.

Production cadence from `vercel.json`:

- `/api/cron/idx-sync` runs every 10 minutes: `*/10 * * * *`.
- `/api/cron/media-sync` runs every 15 minutes: `*/15 * * * *`.
- `/api/cron/db-keepalive` runs every 15 minutes: `*/15 * * * *`.

The route comment in `app/api/cron/idx-sync/route.ts` says “every 4 hours.” That comment is stale. The Vercel schedule is the source of truth unless intentionally changed. Do not “fix” the 10-minute cadence unless Maya explicitly asks; the 10–15 minute live pull rhythm is intentional.

The scheduled Cotality pull is capped at 500 records per run. Recent Vercel runtime logs showed successful Cotality pulls in the last 24h, including runs fetching 148 and 159 records with zero sync errors.

## Meaning of “archive” in this system

Archive does not mean delete. It keeps the listing row but strips heavy fields:

- `raw_data -> JSON null`
- `media -> []`
- `compliance -> {}`
- `sync_status -> archived`

The purpose is to reduce database bloat and stop old terminal listings from carrying heavy Cotality payloads. The risk being fixed by #465 is Cotality re-emitting terminal rows and rehydrating those stripped fields, causing strip -> rehydrate -> strip churn.

## Gate 6 archive/drain state

- Rollback branch exists.
- 5K dry-run was completed successfully.
- Dry-run output: eligible backlog `80,712`; scanned `5,000`; execute `false`; archived `0`; skipped `0`; errors `0`.
- No Gate 6 execute has run.
- No production rows have been stripped by Gate 6 operator.
- `ARCHIVE_T180_BACKLOG_ENABLED` remains OFF / absent.
- Nightly data-retention cron remains 500-cap and flag-gated.

Decision: Hold Gate 6 execute until #465 rehydration guard is clean, reviewed on current head, and merged.

## Vercel / production runtime audit snapshot

Project metadata:

- Framework: Next.js
- Node: 20.x
- Domains: `mallan.nyc`, `www.mallan.nyc`, `mallan-nyc.vercel.app`
- Note: Vercel project metadata may show the latest deployment as a PR preview; check production runtime logs separately.

Vercel runtime errors, last 7 days:

- 12 runtime error groups found in the audit pass.
- Major historical error class: live Cotality/Trestle sync attempted writes while database transaction was read-only (`cannot execute INSERT in a read-only transaction`). Last seen 2026-06-28 on older deployment. Needs confirmation it is no longer recurring after current deployment.
- `DB Keepalive` failures: database reachability to `ep-cold-waterfall-adno3ao2-pooler...` failed. Last seen 2026-07-01 18:00 UTC. Needs attention because it can indicate pooler/connection reliability issues.
- `CONTACT` submission DB error: two events on 2026-06-28. Needs direct contact-form smoke test before declaring contact funnel healthy.
- `social-proof` cron external fetch timeout. Last seen 2026-07-01 16:00 UTC. Likely external network/vendor issue, but should not log as scary unhandled error if non-critical.
- `lead-scoring` cron database reachability error. Last seen 2026-06-28.
- Live Cotality/Trestle sync has also shown successful recent runs in the last 24h with zero errors on specific runs, so the old read-only transaction issue may be resolved, but this must be verified over a clean 24h window after #465 and any future deploy.

Vercel runtime logs, last 24h:

- `/api/cron/db-keepalive` returned 500 once due to DB reachability.
- `/api/cron/social-proof` returned 200 but logged `TypeError: fetch failed` / external timeout.
- `/api/cron/demand-signals` returned 200 with SODA query coordinator warning: `community_board` column not grouped.
- `/api/cron/seller-scoring` returned 200 with SODA warning: `job_filed_date` no such column.
- `/api/nearby-poi` repeatedly returned 200 but logged Overpass `406` warnings.
- `/api/cron/idx-sync` had successful recent live Cotality/Trestle pulls fetching 148/159 records with zero sync errors.

## Public site smoke snapshot

Homepage `https://mallan.nyc/` loads and renders public content: hero, navigation, featured listings, license/fair-housing text, footer, and REBNY/IDX disclaimer.

Attention item: homepage footer says listing data last updated `February 11, 2026`. This is stale relative to the current audit date. Confirm whether this is static placeholder text or actual live Cotality/Trestle feed timestamp. If static, fix because it undermines trust and compliance optics.

## Current broken / needs-attention list

### P0 / Blockers

None confirmed as active site-down issues in this pass.

### P1 / High priority

1. ~~PR #465 must not be merged until Codex reviews current head `65b9507a` or Maya explicitly accepts merge risk.~~ **[SUPERSEDED 2026-07-02: MERGED after clean round-4 review.]**
   - NULL-safe Cotality/media guard appears implemented in current head.
   - Need current-head Codex verdict, not stale comments from older commits.
   - Re-run or confirm: type-check, relevant idx-sync tests, rls, ucba, compliance, idx validate.

2. Vercel DB reachability instability.
   - `db-keepalive` 500 on 2026-07-01.
   - Check Neon compute/pooler health and whether keepalive itself is useful or causing noise.
   - Confirm no user-facing failures during the same window.

3. Contact funnel health not proven.
   - Vercel shows contact submission DB errors on 2026-06-28.
   - Run a controlled contact-form smoke test or inspect logs after a test submission.

### P2 / Medium priority

4. SODA/DOB query drift in `seller-scoring` and `demand-signals`.
   - `job_filed_date` appears invalid.
   - `community_board` grouping query is invalid.
   - These are 200 responses with warnings, but they reduce lead/scoring signal quality.

5. Nearby POI Overpass 406 warnings.
   - Repeated warnings mean POI feature may be degraded even though HTTP returns 200.
   - Audit query format and fallback behavior.

6. Social proof external timeout.
   - Should degrade quietly if non-critical.
   - Add timeout/fallback logging classification if needed.

7. Live feed/footer timestamp stale on homepage.
   - Verify source and display logic.

### P3 / Operational hygiene

8. Code comments mismatch real cron schedule.
   - `db-keepalive` route comment says every 4 minutes, but `vercel.json` schedules every 15 minutes.
   - `idx-sync` route comment says every 4 hours, but `vercel.json` schedules every 10 minutes.
   - The schedule itself is intentional. Fix comments only.

9. Existing `idx:validate` baseline critical `/api/cron/media-backfill -> NOT SCHEDULED` remains pre-existing and should either be fixed or explicitly accepted in this file.

## Required periodic recheck protocol

Run this after every meaningful Claude/Codex PR, and at least daily while active development continues.

### GitHub checks

- List open PRs.
- Confirm no PR is merge-ready with unresolved current-head Codex comments.
- Confirm main head SHA and latest merged PR.
- Check changed files for any PR touching:
  - `lib/idx/sync.ts`
  - `app/api/cron/*`
  - `lib/retention/*`
  - `app/api/crm/*`
  - `app/api/portal/*`
  - `vercel.json`
  - `prisma/schema.prisma`

### Vercel checks

- Check latest production deployment is READY.
- Check production runtime errors for last 24h and 7d.
- Check top warning/error routes.
- Check DB reachability failures.
- Check contact-form errors.
- Check live Cotality/Trestle API pull success/failure count for `/api/cron/idx-sync`.

### Repo/local gates Claude should run before PR handoff

- `npm run type-check`
- relevant jest suite(s)
- `npm run rls:validate`
- `npm run ucba:audit`
- `npm run compliance-check`
- `npm run idx:validate`
- for public route changes: `npm run validator:live-site` if env allows
- for CRM/static changes: `npm run crm:check-build`

### Live smoke checks

At minimum:

- `/`
- `/buy`
- `/rent`
- `/sell`
- `/open-houses`
- `/agents`
- `/contact`
- `/crm`
- `/api/health` if intentionally public
- one active listing detail page
- one Mallan local exclusive detail page

Record pass/fail and timestamps here.

## Next recommended sequence

1. ~~Wait for Codex review on #465 current head `65b9507a`.~~ **[SUPERSEDED 2026-07-02: MERGED; active watch = RW-004; next gate = OPS-009 implementation.]**
2. If clean, consider merge approval for #465.
3. Re-check Vercel runtime errors after #465 deploy.
4. Only then reconsider Gate 6 5K execute.
5. In parallel, audit and fix production warnings: contact form, DB keepalive, SODA queries, POI 406, stale live-feed timestamp.

## Update rule for future agents

Before starting new work, update this file with:

- current date/time
- main SHA
- open PRs
- latest Vercel production deployment
- last 24h runtime errors
- unresolved blockers
- what was changed during the session
- exact stop point

Do not rely on chat memory alone.

---

## 2026-07-25 addendum — Neon write-amplification (OPS-010A / OPS-010) evidence + Phase-1 telemetry

- **Session:** read-only Neon write-amplification forensic + Phase-1 evidence-only telemetry.
- **PR:** #569 `fix/neon-write-amplification-2026-07-25` — **DRAFT, not merged, no production deploy** (a Vercel PREVIEW deployed; `release-truth` `deploy_pending` by design).
- **Runtime state (2026-07-25T23:55Z) — LIVE-VERIFIED this session (not carried from the dashboard):**
  - `origin/main` = `318925e9`; open PRs: **#569 only (draft)**. (This addendum lives on PR #569 branch `fix/neon-write-amplification-2026-07-25`; `gh pr view 569` gives the live tip — git history identifies the exact commit, not recorded here.)
  - `npm run health:probe` (read-only) auto tier: Neon canonical identity 🟢 (`br-crimson-frog-adr7g9gt`, 1 branch), Neon-facts 🟢 (12/12), **Gate-6 rollback branch 🟡 ABSENT** (blocker for any 5K), cron cadence 🟡; DB-growth rows ⚪ (no canonical `DATABASE_URL` locally).
  - **Latest PRODUCTION deploy (Vercel MCP, live):** `dpl_FknJtURW74aaqXTBDpmBJSDBmENi` = main@`318925e9` (PR #568 merge), state **READY**, 2026-07-25. ⚠ SUPERSEDES the dashboard's stale `dpl_2o8LW…`/2026-07-02 note.
  - **Last-24h PRODUCTION runtime errors (Vercel MCP, live):** 1 material class — `[public-cache] cache layer error → degrade to live read` = Prisma **connection-pool timeout / "can't reach `ep-cold-waterfall` pooler"** (pool limit 5, timeout 10s), **12 occurrences / 11 users**, last 2026-07-25T23:03Z, on prod `dpl_FknJtURW`; graceful degradation, no user-facing outage (relevant context to the Neon investigation itself). The 3 `DATABASE_URL not found` groups (1 each) are on an OLD/non-prod deploy (`dpl_29Km…`), not current production.
  - This evidence-only PR made **NO** production change; production = the values above.
- **Scope:** additive telemetry only — NO sync/write behavior, cadence, retention, `raw_data` storage, DB rows, cron, or env change.
- **Evidence doc:** `docs/operations/neon-write-amplification-forensic-2026-07-25.md` (attached evidence for **OPS-010A** + **OPS-010**; not a new ID).
- **Fresh measurements (read-only, cold-waterfall):** `pg_database_size` 535 MB / synthetic 603 MB — **SINGLE snapshots; storage TREND remains UNMEASURED** (do not infer "flat" or "ballooning" from one reading); cumulative tuple updates listing_media **3.40M** / listings **1.40M**; `audit_events` append-only, insert rate **199→566/day (~2.8×)** after the `*/10` One-Cycle switch (07-24, correlation); one light One Cycle ≈ **118 KB WAL**; `sync_errors` = 0 rows; `listing_media` soft-deleted = 28,664; historical 89,001 `listings` deletes = **UNRESOLVED** (no completed audited `reset-sync`; no current scheduled bulk-delete path).
- **Telemetry — MERGED (PR #569 → `2fecd4f3`, 2026-07-26) + production capture COMPLETE** (see the 2026-07-26 section below): media physical-write cause counters (`delivery_url_refreshed`, `suppressed_url_signature_rotation`, `suppressed_url_identity_changed`, `write_failures`) in `media_sync_cron`; flag-gated (`DIAG_RAW_DATA_KEYS_UNTIL`, auto-expiring) raw_data changed-key histogram to runtime logs (never audit_events). *(This 2026-07-25 bullet was written while #569 was still a draft; superseded by the merge + capture.)*
- **Open gates (Maya):** (1) the exact rising Neon dashboard metric (screenshot); (2) merge + production-deploy authorization for a bounded ≥3-cycle capture window. Phase-2 diff-before-write suppression stays **HELD**.
- **Stop point:** Phase-1 corrections complete on the branch; awaiting clean current-head Codex re-review + the two gates. Do NOT merge/deploy/change env.

## 2026-07-26 — Phase-1 capture EXECUTED (Maya-authorized) + interpretation corrections

- **PR #569 MERGED** = `main`@`2fecd4f366948779d912600daa71170ea0213b3a`; production deploy `dpl_5N2eQ2G2gSLxZLRL8Li4RkkaAdsj` **READY** 2026-07-26T01:08:02Z (owns `mallan.nyc`). Maya set `DIAG_RAW_DATA_KEYS_UNTIL=2026-07-26T02:25:00Z` (Production), then removed it; the live deploy auto-fails-off in-code at 02:25:00Z.
- **Capture:** THREE natural One Cycle runs (01:10/01:20/01:30), no manual trigger. Full raw evidence: **`docs/operations/neon-write-amplification-capture-2026-07-26.md`**.
- **Measured (SCOPED):** listing `raw_data_only` = **108/108 sampled = `PhotosChangeTimestamp`** — a SUBSET of 190 listing updates in the window (NOT "all listing writes"); projection suppressed ~all from search. Media = 784 physical writes (511 material + 273 delivery-URL-refresh); 1,481 `identity`-type URL rotations SUPPRESSED (NOT proven harmless — could be replacement assets; Phase-2 pattern analysis needed); 0 write-failures. T0→T1 (~35 min): WAL +1.77 MB; `pg_database_size` +72 KB.
- **Interpretation corrections (2026-07-26):** (a) `audit_events` — non-exempt actions 2yr-bounded, but `email_unsubscribed` is purge-exempt + create-only → **NOT strictly bounded**; (b) the +72 KB / 35-min db-size reading is **short-window LOGICAL only** — does NOT establish a long-term or billed (WAL/history) trend; (c) the Neon monitoring `~115` line is **max capacity, NOT active connections** (earlier chat misread — corrected); (d) the Prisma pool-limit (pool=5) errors are a **separate real signal**, tracked independently.
- **Phase-2 = HELD.** No suppression of `PhotosChangeTimestamp` / URL identity changes; no retention / R2 / Neon / cadence / cron change made (the only capture-time env mutation was the Maya-authorized temporary `DIAG_RAW_DATA_KEYS_UNTIL`, set + removed, guard auto-expired). Decision pending Maya from this record.
- **Stop point:** Phase-1 complete + this doc-only correction PR (`docs/neon-phase1-capture-2026-07-26`) open for one normal review/CI cycle. Do NOT restart the doc-polish loop; Phase-2 awaits explicit Maya go.

---

## Session addendum — 2026-07-28 (Neon `listing_media` backlog index)

- **OPS-023** — registered this session. P2 · **Open** · needs Maya's lifecycle-policy
  decision. Canonical description + evidence: `docs/PLATFORM-ISSUE-REGISTRY.md`.
- **Production index** — `listing_media_r2_backlog_id_idx` created via manual
  `CREATE INDEX CONCURRENTLY` on 2026-07-28T02:45:22.752Z against
  `dpl_4u2mFqKdfQJWCdNHRzZeWhRn28LW` (SHA `ccfb4e85`). Verified
  `indisvalid`/`indisready`/`indislive` = true. Three-cycle verification complete.
  Evidence: `docs/operations/neon-listing-media-backlog-index-2026-07-28.md`.
- **PR #581** — OPEN, not merged. Operations documentation + replayable migration state.
  High-risk (contains a migration) per AGENTS.md §6.
- **Migration resolve/status** — ✅ **COTALITYLVE DONE 2026-07-28.** `prisma migrate resolve --applied 20260728024522_add_listing_media_r2_backlog_id_idx` succeeded against canonical production (`ep-cold-waterfall-adno3ao2`, verified by hostname only; the credential was never printed). The production index was **not** recreated or altered. ⚠️ **`prisma migrate status` is still NOT clean** — solely because of the unrelated, genuinely pending earlier migration `20260712120000_b1b1_canonical_identity_schema`. Read-only comparison proved all six of its tables are **absent** in production, so it requires **deliberate application with Maya approval**, NOT `migrate resolve`. It is outside PR #581.
- **Unresolved, separate** — **#575** stable R2 object identity (`buildMediaR2Key` still
  keys on `Order`); **#577** `raw_data.PhotosChangeTimestamp` write churn (still live —
  the 02:50 cycle logged `raw_data_only: 19` of 21 listing writes).
- **Exact stop point** — PR #581 open at the pushed HEAD, awaiting (1) operator-run
  `migrate resolve` + clean `migrate status`, (2) repository check suite in an environment
  with dependencies installed, (3) a clean Codex verdict. No merge.

### Production runtime-error snapshot — captured 2026-07-28

Fresh capture for this session. **Does not reuse the 2026-07-25 snapshot.**

- **Capture timestamp:** 2026-07-28 (this session, ~04:00Z)
- **Project / environment:** `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW` (mallan-nyc) · **production**
- **Window:** the 24 hours preceding capture (`since=24h`), levels `error` + `fatal`
- **Total runtime errors: 22**, grouped by route:

| route | errors |
|---|---|
| `/buildings/[slug]` | 12 |
| `/buy` | 4 |
| `/rent` | 3 |
| `/resources/buyers-guide` | 1 |
| `/` | 1 |
| `/api/market` | 1 |

**Not zero.** The `/buildings/[slug]` cluster (12 of 22, 55%) is the dominant category.

**Tool limitation:** this capture was taken with `group_by=route`, which returns counts
only — **per-error timestamps, messages, stack traces and categories were NOT retrieved**,
so no error was classified beyond its route. None of these errors has been triaged, and
none is known to be related to the OPS-023 index deployment (which touched no application
code). Triage is NOT part of this deployment and remains open work.
