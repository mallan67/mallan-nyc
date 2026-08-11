# Project Health Dashboard — mallan.nyc

> **Living operational status for the live Cotality/Trestle synchronization platform.** Shared source
> of truth for **Claude · Codex · ChatGPT** (see [`AGENTS.md`](../AGENTS.md)). This is not "an IDX
> website" — it is a live sync platform with downstream consumers: search, CRM, portal, media,
> compliance, archive, email, contact.

**Proof-first rule for this dashboard:** a cell is only 🟢 with **evidence**. A green cell without
evidence is the FARE-Act trap at operational scale (looks fine, isn't verified). Everything defaults
to **⚪ UNVERIFIED / fail-closed**, not assumed-healthy.

**Legend:** 🟢 healthy (verified) · 🟡 watch / degraded · 🔴 problem · ⚪ not verified this cycle.

**Two tiers:**
- **Auto tier** — refreshed read-only by `npm run health:probe` (git/PR, Neon identity, cron cadence,
  and — when a canonical `DATABASE_URL` is present — DB growth + Cotality ingestion freshness). Every
  cell is timestamped. The probe touches **nothing** in production; it only rewrites the block below.
- **Assessed tier** — needs a tool the local probe doesn't have (Vercel MCP runtime logs, live smoke,
  Lighthouse, manual review). Maintained by the agent doing the work; defaults ⚪ until verified.

---

## Auto-probed tier

<!-- HEALTH:AUTO:START -->
_Last probed (UTC): **2026-08-11T03:32:01Z** — refreshed by `npm run health:probe` (read-only). ⚪ = not verified this run._

| Area | Status | Evidence |
|------|--------|----------|
| Repo / main HEAD | 🟢 | main `2d121daa`; probed from branch `fix/r2-policy-reevaluation-2026-08-10` |
| Open PRs | 🟢 | 6 open (6 non-audit): #599, #596, #595, #592 |
| PR #465 (rehydration guard) | 🟢 | MERGED 2026-07-02T02:35Z (gh merge-state only — deploy/runtime proof lives in RW-004) |
| Neon canonical identity | 🟢 | default `main`=`br-crimson-frog-adr7g9gt` (ready); 2 branch(es) |
| Gate 6 rollback branch | 🟡 | no pre-gate6 rollback branch present |
| Neon facts drift (neon:verify) | 🟢 | NEON.md NEON:FACTS block == live Neon (12/12 facts incl. history_retention 21600s) |
| Cron cadence (live Cotality) | 🟢 | 20 crons; one-cycle-preflight `*/10 * * * *` (drives idx-sync + media-sync); db-keepalive intentionally absent: yes |
| media-backfill removal (QUAL-006/OPS-008) | 🟢 | not scheduled AND route file absent (both verified) — idx:validate 0-critical baseline restored 2026-07-02 |
| Cotality sync attempt freshness | ⚪ | no canonical DATABASE_URL in env (pass cold-waterfall to fill) |
| Cotality last-run outcome | ⚪ | no canonical DATABASE_URL in env (pass cold-waterfall to fill) |
| DB growth / archive state | ⚪ | no canonical DATABASE_URL in env (pass cold-waterfall to fill) |
<!-- HEALTH:AUTO:END -->

> To fill the DB rows, run with the canonical cold-waterfall connection in env (read-only), e.g.
> `DATABASE_URL_UNPOOLED=… npm run health:probe`. Host-guarded to `ep-cold-waterfall-adno3ao2`.

---

## Assessed tier (agent-maintained; default ⚪ UNVERIFIED)

Update the **Status**, **Verified (UTC)**, and **Evidence / how to refresh** columns when you verify a
row. Do **not** mark 🟢 without a captured proof (log line, URL probe, validator output).

| Area | Status | Verified (UTC) | Evidence / how to refresh |
|------|--------|----------------|---------------------------|
| Vercel production deploy | 🟢 | 2026-08-10 | `https://mallan.nyc/api/release-identity` returns `commitSha` **`2d121daaf6dbcd3d027d6d337901a18e43c03ad8`**, `deploymentId` **`dpl_Ey4rGtD26mij3ULsgJvrs88md6yy`**, `targetEnv: production` — the alias serves the current `main` (PR #598 merge). Release Truth verdict **`PROD_PROVEN`** on the first run: production identity + listing smoke bound to that exact deployment. The 2026-07-31 alias-lag concern is resolved for this release. Supersedes the `dpl_BVgQ…` / `e113a1ef` entry |
| Vercel runtime errors (24h/7d) | 🔴 | 2026-07-31 | Vercel MCP `get_runtime_errors` (`since=24h`, **single capture 2026-07-31, 03:20Z–03:29Z**). **PRODUCTION (`dpl_BVgQ…`):** `[public-cache]` degrade-to-live ×12 / 11 users — Neon connection-pool timeout (limit 5) + pooler unreachable; media-proxy aborted ×7; `P1017` ×4. **PREVIEW-ONLY, NOT PRODUCTION (`dpl_29Km…`, PR #149 branch, `target: null`):** `DATABASE_URL` missing on `/api/market` ×7 and `/api/listings/similar` ×6 — these fail before connecting and are excluded from production triage. Supersedes the untriaged 2026-07-28 count-only capture, which mixed both. Detail: `docs/operations/site-audit-handoff-2026-07-01.md` → 2026-07-31 block | Vercel MCP |
| Live Cotality ingestion health | 🟢 | 2026-07-01 (handoff) | recent `/api/cron/idx-sync` runs fetched 148/159 records, 0 sync errors (Vercel logs); skip sources traced (backlog OPS notes) — reconfirm each cycle |
| Media pipeline | 🟢 (Regression Watch) | 2026-07-03 | #465 rehydration guard MERGED + deployed + live-baselined: 2,032/2,032 archived rows stripped+hidden, population re-verified through 07-03 03:00 run (registry RW-004, watch to 2026-07-09). OPS-008 footgun RESOLVED via #471 (route deleted; script --execute refuses; deferred tail: route-catalog regen, tracked in OPS-008 row — the repo-audit-bot guardrail lines were removed by the 2026-07-25 Sentinel decommission) |
| Search projection | 🟡 | 2026-07-01 | dual-write is best-effort/non-transactional (backlog OPS-011) — heal before any PR-5B reader swap; PR-5B HELD |
| CRM | 🟡 | 2026-07-01 | `crm:test` 39/39 PASS (§G doc says 172 — QUAL-008 drift); live `/crm` load unverified |
| Portal (buyer/seller/landlord) | 🟢 | 2026-07-01 | code audit post-#458/#459: ownership enforced on every reviewed id-param route; buyer identity masked to sellers; agent PII gated |
| Email / notifications | 🟡 | 2026-07-02 | dispatcher gap real in code (BIZ-005, now **P2**) but LIVE COUNT 2026-07-02: **zero email/sms rows ever accumulated** (30 in_app/pending only — H-002 resolved). Unsubscribe suppression divergence still open (BIZ-012, P1) |
| Contact funnel | 🟡 | 2026-07-03 | **H-001 DISPROVED live (2 ways):** suspect columns nullable AND a new lead+inquiry SUCCEEDED 06-28 23:01:52 (same window as the errors). H-004 (transient 06-28 connectivity blip) corroborated → Medium-High. Funnel idle since (0 submissions/5d; 51 leads ever). Close via one approved controlled submission (OPS-001) |
| Open Houses | 🟢 (Regression Watch) | 2026-07-01 | twin-safe display fixes #463/#464 merged; SL-0007 ↔ RLS twin verified — registry RW-001: watch until 2026-07-08 (7d clean) before closing |
| Compliance validators | 🟢 | 2026-07-03 | **idx:validate exit 0 / 0 critical on main@ab56ecd8 (QUAL-006 Verified Fixed via #471 — §B baseline restored)** · type-check 0 · rls 0 err/1 warn · compliance-check 0 BLOCKER+STRICT (QUAL-007 addressed by PR #545 — `ethics_training_gate` corrected to an administrative RECORD, not an auth gate; workflow completeness 11/11 locally, pending merge) · ucba 46/46, 0 REGRESSIONS · crm:test 39/39 |
| Security | ⚪ | — | security-agent PASS required before any deploy touching auth/routes/env |
| Neon health (compute/pooler) | 🟢 | 2026-07-02 | live neonctl reads: compute FIXED 0.25 CU min/max (max 180 CU-hr/mo < 300 baseline → **$19 flat, no overage**); history retention **6h** (previously documented as 7d; NEON.md §2 corrected 2026-07-02 — OPS-016); billed storage 1,493 MB (14.6% of cap; **not re-measured 2026-08-10** — billable/synthetic size is not exposed through the MCP path used, so no storage trend is claimed). **2 branches as of 2026-08-10** (auto tier + `describe_project`): `main` plus a leftover `preview-pr597-commit11` (`br-old-dust-ad3idcf6`, created 2026-08-08, 36 MiB logical, state `ready`) — the branch-scoped DB used by the #597/#598 previews. The Gate-6 rollback branch was auto-pruned 2026-07-03 (OPS-022; a fresh protected one is a 5K prerequisite). 2026-08-10 read-only: physical `pg_database_size` 576 MB, branch logical 598 MiB. keepalive 500s = OPS-002/OPS-015 noise |
| Runtime SODA/DOB queries | 🟡 | 2026-07-01 (handoff) | `seller-scoring` (`job_filed_date`), `demand-signals` (`community_board` grouping) 200-with-warnings |
| Nearby POI (Overpass) | 🟡 | 2026-07-01 (handoff) | repeated `406` warnings though HTTP 200 — feature may be degraded |
| Homepage feed timestamp | 🟢 | 2026-07-01 | live footer capture (Playwright) shows "Updated: July 1, 2026" — timestamp is current/live |
| Lighthouse / performance | ⚪ | — | not run this cycle (PageSpeed/media lane HELD); TTFB baseline 0.34–0.9s captured 2026-07-01 |
| SEO | 🟡 | 2026-07-02 | **SEO-001 Verified Fixed** (PR #468; full-population MISMATCH 10,069 → 0). Remaining open: SEO-002 (P0, /buy /rent shells), SEO-003/004 (P1) + P2/P3 set — see [Platform Issue Registry](PLATFORM-ISSUE-REGISTRY.md) §1 SEO |
| Accessibility | 🟡 | 2026-07-01 | partial pass: SSR imgs have alt; 2 client-rendered gallery imgs missing alt (QUAL-003); full WCAG pass not run |
| Mobile / responsive | 🟢 | 2026-07-01 | no horizontal overflow at 375px on home/search/listing templates (Playwright); other templates unprobed |
| Technical debt | ⚪ | — | narrative — see handoff snapshot |

---

## Open production risks (source: handoff snapshot)

Canonical detail lives in [`docs/operations/site-audit-handoff-2026-07-01.md`](operations/site-audit-handoff-2026-07-01.md).

- ✅ RESOLVED (production) 2026-07-29 — **OPS-024**: PR #587 Phase 1A froze Property ingestion for 4 cycles (19:10–19:40 UTC; 500 rows/cycle rejected `missing_listing_key`, 0 processed). Vercel rolled back to `e113a1ef`; ingestion recovered 19:50. `main` reverted by PR #588 (tree byte-identical to `e113a1ef`). Corrected Phase 1A pending as a separate draft PR. Secondary **OPS-025** (`mls_id` possibly null feed-wide) is pre-existing and NOT in scope.
- ✅ RESOLVED 2026-07-02 — PR #465 merged after 4 Codex rounds on current HEAD; guard live on `858da234`; now registry **RW-004** regression watch (to 2026-07-09).
- **P1** — Neon DB reachability instability (`db-keepalive` 500) — OPS-002 Monitoring; note OPS-015/OPS-016: compute + retention now verified directly from Neon configuration.
- 🟡 DOWNGRADED — Contact funnel: H-001 DISPROVED live 2026-07-02; now H-004 (06-28 connectivity cluster), OPS-001 **P2 Monitoring**; zero errors since 06-28.
- **P2** — SODA/DOB query drift; Overpass 406; social-proof external timeout. (Homepage feed timestamp RESOLVED — live capture shows current date.)
- **P3** — cron route comments mismatch real schedule (fix comments, not schedules); `media-backfill` NOT SCHEDULED baseline (accept or fix — QUAL-006/OPS-008).

---

## Platform Issue Registry (all tracked issues)

Canonical registry: [`docs/PLATFORM-ISSUE-REGISTRY.md`](PLATFORM-ISSUE-REGISTRY.md) — renamed from
"Audit Backlog" 2026-07-01; the permanent home for audit findings, incidents, regressions, tech
debt, compliance/SEO/performance/security issues, and operational risks. Every item: ID · Area ·
Severity · Status · Owner · Evidence · **evidence class (Confirmed-live / Confirmed-static /
Needs Verification)** · **Evidence Score (0–10, ✗ fields listed)** · verification criteria.
Hypotheses live in the registry's **Hypothesis Register** (H-###: Observed · Evidence · Missing ·
Confidence · Next verification); probably/likely/appears/root-cause are banned outside that
format (AGENTS.md §5). Backend items require the 9-field evidence ledger before being reported
as Confirmed (live).

Open P0/P1 summary (refreshed 2026-07-02 — retired: OPS-006 → Fixed/RW-004; OPS-001 → P2/H-004;
BIZ-005 → P2 after live zero-backlog count; **SEO-001 → Verified Fixed** (PR #468, MISMATCH 10,069→0); **QUAL-006/OPS-008 → Verified Fixed** (PR #471, idx:validate exit 0 / 0 critical on main) — closed items live in the registry, not this open queue):

| ID | Area | Finding | Severity | Status | Owner |
|---|---|---|---|---|---|
| SEO-002 | SEO | /buy & /rent empty shells → robots-blocked /search | P0 | Open | Claude |
| SEO-003 | SEO | 0/59 neighborhood guides in sitemap | P1 | Open | Claude |
| SEO-004 | SEO | /buildings canonical/sitemap/robots broken | P1 | Open | Claude |
| OPS-002 | Operations | DB keepalive stability | P1 | Monitoring | Audit |
| OPS-009 | Operations | Archive controls IMPLEMENTED + deployed (#470); kill-switch proof VERIFIED (OPS-020, 03:00:46Z) | P1 | **Awaiting Maya: ARCHIVE_ENABLED=true (MAINTENANCE) decision** | Maya |
| OPS-010A | Operations | Storage churn suppression (diff-before-write). **Phase-1 telemetry MERGED (PR #569 → `2fecd4f3`, 2026-07-26; prod deploy `dpl_5N2e` READY) + production capture COMPLETE (3 natural cycles):** media cause counters + flag-gated raw_data histogram; capture `docs/operations/neon-write-amplification-capture-2026-07-26.md` (raw_data_only = PhotosChangeTimestamp; media = material + delivery-refresh; multi-day WAL/billed trend still unmeasured); audit_events 199→566/day (~2.8×) post-`*/10`. **Base material-diff suppression already DEPLOYED** (`listingMediaRowUnchanged`/`listingUpdateMateriallyUnchanged`); Phase-2 target is the narrower `raw_data_only` + `delivery_url_refreshed` causes (HELD). | P1 | Open — base diff-suppression deployed; Phase-2 = raw_data_only + delivery-refresh (HELD) | Claude |
| OPS-022 | Operations | **Gate-6 rollback branch AUTO-PRUNED** (2026-07-03; main only) — a fresh PROTECTED rollback branch is a HARD prerequisite before the 5K execute (one-way strip, 6h PITR) | P1 | **BLOCKER for 5K — needs Maya (create + protect branch)** | Maya |
| BIZ-006 | Business | Canonical public-search pagination/count-integrity defect (**BIZ-008 superseded**). Full description in the Platform Issue Registry. Static-only, Evidence Score 3/10 — verify first | P1 | Open — unfixed; runtime PR not yet raised | Claude |
| BIZ-012 | Business | Unsubscribe paths diverge — CAN-SPAM suppression field not always written | P1 | Open | Claude |
| PROD-004 | Production | No root middleware — authZ is per-route opt-in on 284 routes | P1 | Open | Claude |
| COMP-001 | Compliance | /buildings hub missing §175.25 footer identity | P1 | Open | Claude |
| DOC-001 | Documentation | Platform Architecture document (full pipeline + infra maps, from actual codebase) | P1 | Open — dedicated lane (Track 5) | Claude |

**Execution roadmap (Maya, 2026-07-02):** Track 1 **SEO-001** (10K+ pages, small change, high ROI) →
Track 2 **OPS-009** (archive ambiguity removed forever) → Track 3 **5K Gate-6 pilot** (only after the
architecture is settled) → Track 4 **OPS-017 schema-drift audit** (diff DONE 2026-07-03: leads = false
alarm, real drift = benign orphans, cleanup deferred to a held migration). Plus: build the
**Platform Architecture document** (DOC-001) — full data-flow map (Cotality → sync → normalization →
compliance → archive → search → website) incl. every cron, queue, webhook, API, and DB boundary.

**Also new (2026-08-10) — P3:** **OPS-027**, the PHASE 4a sibling-revalidation race on PR #599. Bounded residual (worst case: one re-admission delayed by an interval, or one wasted admission the drain rejects; no user-visible effect, 0 observed occurrences). **Registered, NOT accepted** — awaiting Maya's disposition: implement serialization, accept as monitored, or hold.

**New this cycle (2026-08-10) — P2, so deliberately not in the P0/P1 queue above:** **OPS-026** —
historical `Listing` media-summary drift, 4,847 of 20,721 photo-bearing listings, recomputed
read-only against the production summary owners (not a hand-written `media_type='Photo'` proxy).
New drift is **STOPPED** post-#597 (62/62 heroes correct since the 2026-08-10 01:35Z deploy). **Two severities:** the 4,832-row `primary_photo_r2_key` class is cost-only; **12 `primary_photo_url` rows are a correctness defect (8 a genuinely different asset, 4 live)**.
Remediation **design CLOSED**; **Production backfill HELD** pending Maya's explicit authorization
(≈17.1% of one day's ~28,351 DB row writes). Canonical row, blast radius and Evidence Score 8/10 in
the registry; measurements at `docs/operations/r2-policy-and-drift-production-evidence-2026-08-10.md`.

Full P2/P3 list + verified-PASS register (FARE 1,011/1,011 · attribution 1,011/1,011 · licensing)
live in the registry.

---

## Component matrix — Enterprise Platform command center (v1, 2026-07-01)

Per Maya's direction the platform is audited as a distributed business platform, not a website.
Target state: every component below carries Status · Severity · Last verified · Evidence · Owner ·
Verification method · Registry ID · Next action. **⚪ = fail-closed unverified** — a component is
only 🟢 with a captured artifact. This matrix supersedes the flat assessed tier over time; rows are
migrated as they are verified. Registry IDs → [`docs/PLATFORM-ISSUE-REGISTRY.md`](PLATFORM-ISSUE-REGISTRY.md).

### 1 · Infrastructure
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| Vercel production deploy | 🟡 | 2026-07-31 | Superseded — see the current production row above: `dpl_BVgQ…` on `e113a1ef`, runtime-source equivalent to `main` `04db1b99`. The 2026-07-02 `main@7643ccb0` (#468) entry is historical |
| Vercel build pipeline | 🟢 | 2026-07-01 | 20 recent deployments all READY, 0 failed builds in window | Vercel MCP |
| Neon canonical identity | 🟢 | 2026-07-01 | auto tier (health:probe) | `npm run health:probe` |
| Neon compute/pooler reliability | 🟡 | 2026-07-02 | keepalive 500 last 07-01 18:00Z (OPS-002 monitoring); compute FIXED 0.25 CU, retention 6h — verified from Neon config (OPS-016) | runtime logs 7d window |
| Neon backups / PITR / restore drill | 🔴 | 2026-07-03 | **Gate-6 rollback branch AUTO-PRUNED 2026-07-03T04:00:48Z (OPS-022)** — no rollback branch currently exists; PITR window is 6h (OPS-016); no restore DRILL ever run | recreate+protect branch (OPS-022) |
| Neon facts drift (neon:verify) | 🟢 | 2026-07-05 | OPS-016 RESOLVED — `npm run neon:verify` PASS 12/12: NEON.md §2.1 `NEON:FACTS` == live (retention 21600s=6h, compute 0.25 CU fixed, branch `br-crimson-frog-adr7g9gt`, 1 branch). Fails on any docs↔live drift; also runs in `health:probe` auto-tier | `npm run neon:verify` (read-only) |
| Redis (locks/queues) | ⚪ | — | `createCronHandler` references a Redis lock but is dead code (OPS-007); live Redis usage uninventoried | code sweep + env check |
| R2 storage (media) | ⚪ | — | cost audit 2026-06-12 exists; orphan/consistency unverified this cycle | R2 inventory vs listing_media |
| DNS / SSL / domains | 🟢 | 2026-07-01 | https/www/apex redirects verified live; cert valid (PROD-003) | curl probes |
| Env vars / secrets hygiene | 🟡 | 2026-07-01 | no secret values leaked via routes (backend audit); ALLOW_DEV_LOGIN state UNKNOWN (PROD-008); CRON_SECRET fail-open pattern ×12 (PROD-005) | `vercel env ls` (names only) |
| Rollback readiness | 🟡 | 2026-07-03 | Vercel: 4 rollback-candidate prod deployments (app-level OK). **Neon: Gate-6 rollback branch GONE (auto-pruned, OPS-022) — BLOCKER for 5K execute** | Vercel MCP + neonctl |

### 2 · Runtime (284 API routes · 23 crons)
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| API route auth coverage | 🟡 | 2026-07-01 | 284 routes inventoried; per-route auth only, no root middleware (PROD-004); 0 confirmed-exposed | static sweep + route probes |
| Cron auth | 🟢(static) | 2026-07-01 | all 23 CRON_SECRET timing-safe; 12 fail-open-if-unset (PROD-005) | code + env verify |
| Cron execution health | 🔴 | 2026-07-01 | /api/health/crons returns all-null by construction (OPS-007); no single-pane view exists | fix endpoint, then live |
| Queues (notifications pending) | 🟡 | 2026-07-02 | dispatcher gap in code (BIZ-005, P2) — **live count: ZERO email/sms rows ever; 30 in_app/pending** (H-002 resolved) | re-count after dispatcher hold release |
| Webhooks inventory | ⚪ | — | not audited this cycle | route sweep |
| Retries / timeouts / external deps | 🟡 | 2026-07-01 | social-proof ETIMEDOUT (PROD-001); Overpass 406; SODA warnings | runtime logs |

### 3 · Cotality sync
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| Ingestion freshness | 🟢 (post-rollback) | 2026-07-29 | recovered after **OPS-024** 4-cycle freeze; cycles normal since 19:50 UTC on `e113a1ef` | health:probe + `audit_events` idx_sync |
| Two-stream keyset cursor | 🔴 not deployed | 2026-07-29 | **OPS-024** — reverted; raw-provider contract fix pending review | corrected draft PR |
| Dropped/skipped records | 🟡 | 2026-07-01 | 148/159 pattern traced: validation-skips + upsert errors; persistent-throw watermark edge (registry OPS notes) | sync_errors + diagnostics query |
| Duplicate records | 🟢(static) | 2026-07-01 | CRM-vs-IDX dedupe verified in sitemap+search paths | dedupe tests |
| Media sync / orphans | 🟡 | 2026-07-01 | ghost-skip edge (OPS-012); media-backfill lane dead (OPS-008) | listing_media vs feed join |
| Deleted/Closed timing (24h rule) | 🟢 | 2026-07-01 | all 176 off-feed ids render "Not Available" (live sweep) | full stale-id probe |
| ComingSoon/Pending timing | 🟡 | 2026-07-01 | 8 Pending still sitemap-listed within minutes of transition (SEO-007/OPS-003) | live diff re-run |
| Tombstones / reconciliation / drift | 🟡 | 2026-07-25 | `listing_media` soft-deleted tombstones measured **28,664**. **[2026-08-02 · PR #593]** Tombstone ROWS are still never deleted (they remain as audit records); what is now compacted nightly is only their stale delivery payload (`media_url_original`, `media_url_cached`, `r2_key`, `width`, `height`) once >30d — **17,112 rows / 4,440 kB eligible**, canary-capped at 100/run, **no R2 object deleted**. feed-reconcile clean-run writes no audit | table counts + audit rows |
| Archive integrity (Gate 6) | 🟡 (Regression Watch) | 2026-07-03 | rehydration guard MERGED + deployed (OPS-006 → Fixed/RW-004; baseline 2,032/2,032 stripped+hidden); OPS-009 two-flag gate IMPLEMENTED+deployed+VERIFIED (#470/OPS-020). Remaining 5K prerequisites: (1) `ARCHIVE_ENABLED=true` + one clean MAINTENANCE cycle, (2) OPS-022 fresh rollback branch | RW-004 queries + post-MAINTENANCE clean cycle |

### 4 · Database
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| Growth (listings) | 🟢 | 2026-07-01 | 110,597 rows; floor-gated cell (auto tier) | health:probe |
| Unbounded tables | 🟡 | 2026-07-25 | **Measured (PR #569, live pg_stat):** `sync_errors`=**0** (empty — NOT growing; corrects the old static note); `audit_events`: NON-exempt actions bounded by rolling 2yr retention (non-exempt bulk plateaus; rate 199→566/day post-`*/10`; the 30 MB `idx_sync_*` burst **no longer waits until 2028** — **[2026-08-02 · PR #593]** it is now covered by the approved 30-day operational-diagnostic exception (canonical index §15), 46,103 rows eligible, canary-capped at 100/run) BUT `email_unsubscribed` is purge-exempt + create-only → **`audit_events` as a whole is NOT strictly bounded**. Genuinely unbounded: `listing_media` soft-deleted tombstone ROWS **28,664** (rows retained by policy; payload now compacted after 30d — PR #593) + the `email_unsubscribed` audit subset (exempt, create-only) (OPS-010/010A) | live pg_stat 2026-07-25 |
| Large JSON columns | 🟡 | 2026-06-10 | listings 893MB/677MB TOAST (r2-neon cost audit) | pg_column_size sample |
| Schema vs migrations drift | 🟡 | 2026-07-03 | **OPS-017 full diff DONE** (read-only): leads "drift" was a FALSE ALARM (`String[]`→nullable is correct); real drift = 5 orphan legacy tables + 3 orphan indexes + 3 `updated_at` defaults (benign, app references none); `listing_events` = expected SELLER-002 staged. P1→P3 | cleanup needs a held migration — no action now |
| Indexes / FKs / slow queries / orphans / duplicates | ⚪ | — | never audited | read-only pg_stat + EXPLAIN pass (needs canonical DATABASE_URL, Maya approval) |

### 5 · CRM & Business workflows
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| Lead capture (9 surfaces) | 🟢(static) | 2026-07-01 | chain INTACT form→route→Lead+Inquiry+consent→audit | live smoke (needs approval) |
| Lead creation (new emails) | 🟡 | 2026-07-03 | H-001 DISPROVED live (2 ways: nullable cols + a successful 06-28 23:01:52 insert); **H-004** transient-blip corroborated (Medium-High), OPS-001 P2 Monitoring; funnel idle 5d (low volume) | approved controlled submission |
| Lead routing/assignment | 🟡 | 2026-07-01 | assignment writes in_app only (BIZ-013); no email path (BIZ-005) | controlled lead trace |
| Saved searches / alerts | 🟡(static) | 2026-07-01 | gate bypass latent (BIZ-014); cron skips unsupported silently | cron run log + row audit |
| Notifications (email/SMS) | 🟡 | 2026-07-02 | dispatcher gap in code (BIZ-005, P2) — live count 2026-07-02: ZERO email/sms rows ever (H-002 resolved) | re-count after dispatcher hold release |
| Unsubscribe/suppression | 🔴(static) | 2026-07-01 | divergent paths (BIZ-012) | both-path test |
| Open houses | 🟢 | 2026-07-01 | #463/#464 merged, twin verified | existing tests |
| Portal (owner/client) | 🟢(static) | 2026-07-01 | IDOR audit clean post-#458/#459 | live owner-route smoke |
| Tasks / notes / timeline / documents / transactions / referrals / onboarding / reports | ⚪ | — | never audited | dedicated business-workflow audit |

### 6 · Security
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| SQL injection | 🟢(static) | 2026-07-01 | all 6 raw-SQL routes parameterized | code audit |
| IDOR (portal) | 🟢(static) | 2026-07-01 | ownership enforced, buyer masked | live probes |
| SSRF | 🟢(static) | 2026-07-01 | media proxy host-allowlisted | code audit |
| Secrets exposure | 🟢(static) | 2026-07-01 | no values echoed; health/env boolean-only, broker-gated | code audit |
| RBAC / session / CSRF / XSS / audit-trail completeness | ⚪ | — | not deep-audited this cycle | security-agent full pass |
| Rate limiting / abuse | 🟡(static) | 2026-07-01 | per-instance Maps ×2; no captcha; tracking POST unlimited (PROD-007) | load probe |
| PII masking (agents) | 🟢 | 2026-07-01 | public directory strips phone/email (live + code) | live probe |

### 7 · Search
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| Listing search correctness (filtered) | 🔴(static) | 2026-07-30 | **BIZ-006** (BIZ-008 superseded) | live filtered-search transcript on both runtimes |
| CRM IDX search filters | 🔴(static) | 2026-07-01 | silent filter drops (BIZ-007) | live CRM query transcript |
| Count/pagination integrity | 🔴(static) | 2026-07-30 | **BIZ-006** | same |
| Map / autocomplete / suggest / building / agent search · performance (P95) | ⚪ | — | never measured | production probes w/ timings |

### 8 · Performance
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| TTFB | 🟢 | 2026-07-01 | 0.34–0.9s (PROD-002) | curl timings |
| Lighthouse / CWV / bundle / cold starts / DB latency | ⚪ | — | never run (QUAL-004; lane HELD) | Lighthouse CI run |
| Images / fonts | 🟢 | 2026-07-01 | next/image + self-hosted next/font verified | HTML capture |

### 9 · Frontend quality
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| Console errors | 🟡 | 2026-07-01 | Translate CSP violation on every page (QUAL-001) | Playwright |
| Mobile / links / broken images | 🟢 | 2026-07-01 | clean on probed templates (QUAL-005) | Playwright sweep |
| Accessibility (WCAG 2.1 AA) | 🟡 | 2026-07-01 | partial: 2 alt gaps (QUAL-003); full pass never run | axe-core run |
| SEO | 🟡 | 2026-07-02 | SEO-001 Verified Fixed (PR #468, MISMATCH 0); open: SEO-002 (P0), SEO-003/004 (P1), SEO-005…011 | registry criteria |

### 10 · Compliance
| Component | Status | Last verified | Evidence / Registry | Verify via |
|---|---|---|---|---|
| FARE / LL119 disclosure | 🟢 | 2026-07-01 | 1,011/1,011 rentals live | full rental sweep |
| RLS attribution + timestamp | 🟢 | 2026-07-01 | 1,011/1,011 live | full rental sweep |
| Licensing (§175.25) | 🟡 | 2026-07-01 | 26/27 pages (COMP-001 /buildings) | full static sweep |
| 24h removal / display gates | 🟢 | 2026-07-01 | 176/176 off-feed render unavailable | stale probe |
| Fair Housing terms | 🟢 | 2026-07-01 | guardrails single-source (#461); validators green | guardrails CI |
| Validators baseline | 🟢 | 2026-07-03 | idx:validate exit 0 / 0 critical on main (QUAL-006 Verified Fixed via #471); remaining blemish: WS-C4 HIGH warn (QUAL-007) | suite re-run |
| Privacy (TCPA/CAN-SPAM records) | 🟡(static) | 2026-07-01 | BIZ-009/010/012 | route tests |

---

## Gate 6 archive/drain status

- ⚠️ **Rollback branch `pre-gate6-5k-pilot-2026-07-01` was AUTO-PRUNED 2026-07-03T04:00:48Z (OPS-022)** — restore LSN `4/745307E0` no longer recoverable via that branch; a FRESH protected rollback branch must be created before any execute.
- 5K **dry-run** done (backlog 80,712; scanned 5,000; archived 0; skipped 0; errors 0). **No execute has run.**
- **OPS-009 two-flag archive gate is now IMPLEMENTED + deployed + kill-switch VERIFIED** (#470 / OPS-020, 2026-07-03): `ARCHIVE_ENABLED` + `ARCHIVE_BACKLOG_DRAIN_ENABLED`, both unset → state **OFF** (fail-closed). The old `ARCHIVE_T180_BACKLOG_ENABLED` (clock-only, non-gating) flag is superseded. **Real 5K prerequisites now:** (1) `ARCHIVE_ENABLED=true` + one clean MAINTENANCE cycle, (2) **OPS-022** fresh protected rollback branch — both Maya-held. (Not an unlanded implementation step.)

### Shedding operating rule (Maya directive 2026-07-01)

**Objective:** we do not want 80K+ old terminal listing records repeatedly rebuilt, rehydrated,
rescanned, and reprocessed by Cotality sync. The goal is **data integrity and stopping
duplication/churn — cost savings are secondary.** (Evidence basis: stripping is logical-only;
billed storage does not drop inside the history-retention window — measured in the s1 reclaim assessment; window verified directly from Neon configuration 2026-07-02 as **6 hours**, not the previously documented 7 days [OPS-016].)

Three invariants:
1. **Archive must be durable.**
2. **Cotality sync must not recreate stripped data.**
3. **No-op syncs must not rewrite unchanged rows** (registry OPS-010A).

**DO NOT EXECUTE SHEDDING YET. Mandatory sequence (progress as of 2026-07-02):**
1. ✅ **#466 merged** (2026-07-02T01:33Z).
2. ✅ **#465 merged** (2026-07-02T02:35Z, 4 Codex rounds: unarchive-on-canonical-active, exact-match,
   display-field freeze, forced idx_display_yn:false). Production deploy `858da234` READY.
3. 🟡 **Live verification baselined** (read-only cold-waterfall 2026-07-02): ≥2 clean cycles on the
   new guard, 2,032/2,032 archived rows stripped+hidden, 0 archived re-emits in window — guard
   branches not yet exercised live → **RW-004 watch** (to 2026-07-09 or first live occurrence).
4. ✅ **OPS-009 IMPLEMENTED + PROOF VERIFIED** — #470 merged/deployed; first retention run on the
   kill switch confirmed all four criteria (OPS-020, 2026-07-03T03:00:46Z: state OFF, skip reason,
   T+24h carve-out ran, no drain). **NOW GATING: Maya sets `ARCHIVE_ENABLED=true` (MAINTENANCE) →
   verify one clean MAINTENANCE cycle at the next 03:00 run.**
5. ⏳ Then, before the **5K pilot execute**: (a) a FRESH pre-gate6 rollback branch exists AND is
   protected / retention-extended so the prune cron cannot delete it before the pilot (OPS-022 —
   the prior branch was auto-pruned), (b) Maya's explicit execute approval. Monitor several hours /
   next sync cycles after.
6. ⏳ Scale to 20K batches **only after proving the 5K rows stay stripped across live sync cycles**.

Reclaim note (OPS-016 + OPS-018): live history retention is **6h** (not 7d) — but the 6h window
only ages HISTORY out after rollback-branch deletion; it does **NOT** imply a same-day
billed-storage drop. The S1 measurement (OPS-018, 2026-07-02) confirmed freed TOAST space is
reusable-not-returned — after the drain, a no-drop measurement is NORMAL, not an anomaly.
Disposition: no compaction now; no pg_repack until after the drain, if at all; VACUUM FULL forbidden.

Follow-on (sequenced after OPS-009/pilot): **OPS-010A** — base material-diff suppression is
already DEPLOYED (`listingMediaRowUnchanged`/`listingUpdateMateriallyUnchanged`); the remaining
Phase-2 work is suppressing the residual `raw_data_only` + `delivery_url_refreshed` causes (the
recurring churn lever), larger long-term than the one-time backlog. **OPS-015** tracks
db-keepalive redundancy separately (decision, not a fix now).

---

## Refresh protocol (every session, before handoff)

1. `npm run health:probe` — refreshes the auto tier (pass the canonical `DATABASE_URL_UNPOOLED` to fill DB rows).
2. Update any assessed-tier rows you actually verified this session (with evidence). Leave the rest ⚪.
3. Update [`docs/operations/site-audit-handoff-YYYY-MM-DD.md`](operations/) with the session narrative + exact stop point.
4. Do not mark 🟢 without proof. Do not rely on chat memory.

**OPS-023** — P2 · Open · lifecycle-policy decision required.
Canonical details and evidence: `docs/PLATFORM-ISSUE-REGISTRY.md`.
Companion backlog index deployed 2026-07-28T02:45:22.752Z; three-cycle production verification COMPLETE (evidence: `docs/operations/neon-listing-media-backlog-index-2026-07-28.md`). PR #581 open — sole remaining blocker is the operator-run production `prisma migrate resolve`.
