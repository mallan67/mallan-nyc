# One Cycle W2 — Cron Schedule Consolidation Design (2026-07-23)

> **DESIGN DOCUMENT ONLY.** No code or configuration is changed by this document.
> `vercel.json` is untouched. Cron cadence changes are a **held surface** (CLAUDE.md §C —
> "cron config" requires explicit Maya approval). Nothing here activates until Maya approves.
>
> **Measurement sequencing constraint:** W2 activation requires (1) the **W1-only 24h
> checkpoint** to complete, and (2) the **W1+W3 measurement** to be taken, BEFORE any W2
> schedule change ships. W2 must be attributable in isolation.

## Authority hierarchy (verbatim)

> "Cotality API → sole listing and feed-media truth → One Cycle → Neon operational copy → projections → Vercel cache. Business data never overrides listing facts."

Every ordering decision below follows this chain: feed truth is ingested first, corrections
are applied to the Neon operational copy next, projections are dual-written in the same
step, cache revalidation happens in-line with each write, and business scoring consumes —
never precedes or overrides — listing facts.

---

## (a) Inventory — all 21 cron jobs in `vercel.json`

Verified against `vercel.json` `crons[]` and each `app/api/cron/*/route.ts` (all read for
this document). All routes are CRON_SECRET Bearer-auth (timing-safe). One additional route
exists on disk but is **not scheduled**: `app/api/cron/db-keepalive/route.ts` — out of scope.

Categories: **FEED** = feed-sync · **MEDIA** = media pipeline · **COMP** = compliance/retention ·
**CRM** = CRM-business scoring/notification · **INFRA** = infrastructure.

| # | Route | Schedule (UTC) | Cat | Reads / Writes (lib call) | Depends on |
|---|---|---|---|---|---|
| 1 | `/api/cron/idx-sync` | `*/30 * * * *` | FEED | Reads Trestle Property incremental (`ModificationTimestamp > watermark`, cap 500/run); writes `listings` upserts + media JSON + `idx_sync_cron` AuditEvent. Calls `syncListings` + `getLastSyncTimestamp` (`lib/idx/sync`). `maxDuration 120`. Concurrency guard via 10-min AuditEvent lookback. | Cotality feed (root of chain) |
| 2 | `/api/cron/media-sync` | `0 * * * *` | MEDIA | Reads cursor + Trestle Property→Media; writes `listing_media` upserts, tombstones, R2 mirror, media summary, cache-revalidation counters, `media_sync_cron` AuditEvent. Calls `runMediaSync` (`lib/idx/media-sync`). `maxDuration 120`. Cursor NOT advanced on error. | idx-sync (needs listing rows ingested) |
| 3 | `/api/cron/feed-reconcile` | `30 3 * * *` | FEED | Reads full Trestle Active + Pending/AUC/ComingSoon ID sets, DB Active + all-RLS + archive sets; writes ghost transitions (`status=Withdrawn`, `idx_display_yn=false`, `terminal_since`), chunked orphan creates + media population (`selectOrphanChunk`, `upsertListingMedia`), projection dual-writes (`dualWriteProjectionForListingId`), cache tags (`safeRevalidateTags`), broker abort emails, AuditEvents. `maxDuration 300`. Fail-closed abort caps (GHOST_ABORT_CAP/RATIO, orphan sanity cap). | idx-sync (its status writes feed data-retention's next-day §2.05 gate); scheduled 30 min after data-retention today |
| 4 | `/api/cron/data-retention` | `0 3 * * *` | COMP | Reads/deletes sessions, MFA sessions, AuditEvents >2y (except `email_unsubscribed`), stale portal tokens, read notifications >90d, geocode cache >1y; **§2.05 T+24h**: flips `idx_display_yn=false` on terminal listings + projection dual-write + cache revalidation (UNCONDITIONAL carve-out); T+30d media-null and T+180 archive (`archiveOneListing`, `lib/retention/archive-terminals`) gated behind `ARCHIVE_ENABLED`. Writes `data_retention_run` AuditEvent. `maxDuration 60`. | Status writes by idx-sync/feed-reconcile (§2.05 gate reads `status_changed_at`) |
| 5 | `/api/cron/dom-reset` | `0 6 * * *` | COMP | Reads Withdrawn/Cancelled listings ≥ `DOM_RESET_DAYS` old with `days_on_market > 0`; writes `days_on_market=0`, `first_active_date=null`, `dom_reset` AuditEvents. Uses `DOM_RESET_DAYS` (`lib/compliance/dom-tracker`). `maxDuration 60`. | Status writes (Withdrawn set produced by reconcile/sync) |
| 6 | `/api/cron/listing-expiration` | `0 7 * * *` | COMP | Reads active listings with `expiration_date`; writes 30d/7d warning notifications (`createNotification`) + SendGrid emails, ProtectedPeriod creation/enforcement (UCBA A6/A7/A8), notified flags, projection dual-write + cache revalidation on status effects. `maxDuration 60`. | Current listing statuses |
| 7 | `/api/cron/search-alerts` | `30 7 * * *` | CRM | Reads `savedSearch` (alert_enabled) + **projection reader** (`runProjectionListingSearch`, `lib/search/core`); writes alert emails, `last_alert_sent`, `recordSearchRun`, skip AuditEvents. Alert gate `canEnableAlertForCriteria`. `maxDuration 60`. | Projection dual-writes + §2.05 display flags (must not email removed listings) |
| 8 | `/api/cron/seller-scoring` | `0 8 * * *` | CRM | Reads stale SellerLeads + NYC Open Data; writes scores. Calls `batchRescore(50)` (`lib/seller-readiness/scorer`) + AuditEvent. `maxDuration 60`. | None (external open data) |
| 9 | `/api/cron/tenant-nurture` | `30 8 * * *` | CRM | Reads leads with active drips + `listingView` engagement; writes drip stage advances, outreach dates, agent Notifications. Inline Prisma logic (no lib batch fn). `maxDuration 60`. | Engagement events (passive) |
| 10 | `/api/cron/prospect-triggers` | `0 9 * * *` | CRM | Reads/writes `outreachCadenceStep` (pending→ready, auto-send ≤20 emails), overdue alerts, follow-up sync, building activity (uses Trestle `getAccessToken`). `maxDuration 60`. | None hard; light Trestle read |
| 11 | `/api/cron/demand-signals` | `0 10 * * *` | CRM | Reads engagement events; writes neighborhood demand index. Calls `batchComputeDemandIndex` (`lib/demand-index/collector`) + AuditEvent. `maxDuration 60`. | Listing/engagement data |
| 12 | `/api/cron/intent-profiles` | `0 11 * * *` | CRM | Reads leads with recent activity; writes `BuyerIntentProfile`. Calls `batchRecompute(50)` (`lib/buyer-intent/profiler`) + AuditEvent. `maxDuration 60`. | Engagement data |
| 13 | `/api/cron/lead-scoring` | `0 13 * * *` | CRM | Reads stale `LeadScore` records; writes scores. Calls `batchScoreLeads(100)` (`lib/lead-scoring/scorer`) + AuditEvent. `maxDuration 60`. | Engagement data |
| 14 | `/api/cron/conviction-scores` | `0 14 * * *` | CRM | Reads active leads; writes conviction scores. Calls `batchComputeConvictionScores` (`lib/conviction/scorer`) + AuditEvent. `maxDuration 60`. | Runs after lead-scoring today (1h stagger) |
| 15 | `/api/cron/listing-momentum` | `0 15 * * *` | CRM | Reads active listings + engagement; writes momentum scores. Calls `batchComputeMomentum(100)` (`lib/listing-momentum/scorer`) + AuditEvent. `maxDuration 60`. | Active listing set (display-gated facts) |
| 16 | `/api/cron/social-proof` | `0 16 * * *` | CRM | Reads per-listing engagement; writes anonymized demand signals cache. Calls `batchComputeSocialProof(100)` (`lib/social-proof/cache`) + AuditEvent. `maxDuration 60`. | Active listing set |
| 17 | `/api/cron/lifecycle-triggers` | `0 17 * * *` | CRM | Reads conviction scores, ghost status, momentum, stale inquiries, lease expirations; writes trigger firings (notifications/emails), seeds `DEFAULT_TRIGGERS` on first run. Calls `evaluateAllTriggers` (`lib/lifecycle/engine`) + AuditEvent. `maxDuration 60`. | **Explicitly after** lead-scoring, conviction-scores, listing-momentum (per its header comment) |
| 18 | `/api/cron/experiment-metrics` | `0 2 * * 0` (weekly Sun) | CRM | Reads engagement KPIs for active experiments; writes aggregates. Calls `batchComputeExperimentMetrics` (`lib/experiment/metrics`) + AuditEvent. `maxDuration 60`. | Engagement data |
| 19 | `/api/cron/agent-metrics` | `0 12 * * 1` (weekly Mon) | CRM | Reads 6-month agent performance data; writes index. Calls `batchReindex` (`lib/agent-performance/indexer`) + AuditEvent. `maxDuration 60`. | Deal/listing history |
| 20 | `/api/cron/market-snapshots` | `0 6 1 * *` (monthly) | CRM | Reads listing/market stats; writes neighborhood snapshots. Calls `batchComputeSnapshots` (`lib/market-pulse/snapshot`) + AuditEvent. `maxDuration 60`. | Listing facts |
| 21 | `/api/cron/neon-branch-prune` | `0 4 * * *` | INFRA | Reads Neon API branch list (`NEON_API_KEY`/`NEON_PROJECT_ID`, canonical-project guard); deletes idle preview branches. Calls `pruneBranches` (`lib/neon/branches`) + `neon_branch_prune_cron` AuditEvent on every path. `maxDuration 60`. | None (Neon control plane, not data) |

Key dependency edges:

- **media-sync → idx-sync**: media rows attach to listings idx-sync ingested.
- **data-retention §2.05 → status writes**: the T+24h gate reads `status_changed_at` written by idx-sync/feed-reconcile.
- **feed-reconcile → data-retention (next day)**: today's ghost→Withdrawn flows through *tomorrow's* §2.05 gate (current 03:00/03:30 stagger encodes this).
- **Projection dual-writes**: idx-sync, feed-reconcile, data-retention, and listing-expiration all call `dualWriteProjectionForListingId`; search-alerts *reads* the projection.
- **lifecycle-triggers → lead-scoring, conviction-scores, listing-momentum** (stated in its own header).

---

## (b) Proposed SYNC-CYCLE (One Cycle, every 30 minutes)

One orchestrator route `/api/cron/one-cycle` sequentially invokes member **lib functions**
(not HTTP self-calls) in this exact order:

| Order | Member | Why here |
|---|---|---|
| 1 | **idx-sync** (`syncListings`) | Cotality is the sole listing truth; listing facts must land in the Neon operational copy before anything else in the cycle reads them. |
| 2 | **media-sync** (`runMediaSync`) | Feed-media truth attaches to listings ingested in step 1 — running it immediately after closes the current up-to-30-min listing→media gap. (Optional cadence gate: run this member every cycle, or every 2nd cycle to preserve today's hourly volume — recommend every cycle for freshness; see §(f) for the honest compute note.) |
| 3 | **feed-reconcile-class corrections** | The *per-record* correction machinery (status transitions → projection dual-write → cache-tag revalidation) already runs inside steps 1–2's write paths (W1). The **full-book** ghost/orphan diff (`feed-reconcile`) is a 2×25K-id Trestle scan with `maxDuration 300` — too heavy for every 30-min window. It moves to NIGHTLY-BATCH position 2 (see §(c)), preserving its daily cadence. Alternative (not recommended): a cadence-gated member that runs the full diff only on the 03:30 UTC cycle — rejected because its 300s budget cannot coexist with idx+media budgets under one runner's `maxDuration` (see §(d)). |
| 4 | **Cache revalidation** | Implicit — every member's write path already calls `safeRevalidateTags` (listing tag + `SEARCH_CACHE_TAG`) in-line (W1). No separate member needed. |

Per the authority hierarchy: Cotality → (1) listings → (2) media → Neon copy → projections
(dual-written inside 1–2) → Vercel cache (revalidated in-line). No business job runs in the
sync cycle — business data never overrides listing facts.

---

## (c) Proposed NIGHTLY-BATCH (daily, 03:00 UTC)

One orchestrator route `/api/cron/nightly-batch` invokes members sequentially:

| Order | Member | Justification |
|---|---|---|
| 1 | **data-retention** | Keeps its current 03:00 slot. §2.05 T+24h display-flag flips (+ projection dual-write + cache revalidation) MUST land before anything downstream reads display flags — search-alerts and the listing scorers must never act on a listing §2.05 just removed. Purges also shrink tables before the scan-heavy members. |
| 2 | **feed-reconcile** | Immediately after retention — byte-preserves today's 03:00→03:30 relationship: ghosts withdrawn tonight age through *tomorrow's* §2.05 gate exactly as now. Runs its own fail-closed abort caps unchanged. |
| 3 | **dom-reset** | Reads the Withdrawn/Cancelled set that reconcile maintains; running after reconcile keeps DOM resets on post-correction status truth (30-day lag makes this soft, but the ordering is free). |
| 4 | **listing-expiration** | UCBA A6/A7/A8 warnings + ProtectedPeriod creation should see post-correction statuses so it never warns on a listing reconcile just withdrew. |
| 5 | **search-alerts** | Reads the **projection**; must follow all projection dual-writers above (1, 2, 4) so alert emails reflect current compliant inventory. Listing-facts consumer, not producer. |
| 6 | **seller-scoring** | First business scorer; external NYC Open Data input, no internal deps. |
| 7 | **tenant-nurture** | Engagement-driven drip advance; independent of scorers. |
| 8 | **prospect-triggers** | Cadence step readiness + capped auto-send; independent. |
| 9 | **demand-signals** | Aggregates engagement → neighborhood index; feeds no scorer below strictly, but sits naturally before profile/score computation. |
| 10 | **intent-profiles** | Buyer intent from recent activity; before lead/conviction scoring so those can consume the freshest profiles. |
| 11 | **lead-scoring** | Before conviction-scores — preserves the current 13:00→14:00 stagger; conviction is the more derived score and lifecycle-triggers requires fresh lead scores first. |
| 12 | **conviction-scores** | After lead-scoring (current implicit ordering, and lifecycle-triggers' header names it as a prerequisite). |
| 13 | **listing-momentum** | After the feed/compliance block (facts), before lifecycle-triggers (which reads momentum). |
| 14 | **social-proof** | Anonymized per-listing demand cache; after momentum, before lifecycle. |
| 15 | **weekly: experiment-metrics** (Sun only) / **agent-metrics** (Mon only) | Day-of-week gate inside the orchestrator (`if (day === 0/1)`). Pure aggregates; slotted after the scorers, before lifecycle, no downstream deps. |
| 16 | **monthly: market-snapshots** (1st only) | Day-of-month gate. Aggregates listing facts; no downstream deps. |
| 17 | **lifecycle-triggers** | LAST business member — its own header requires fresh lead-scoring, conviction-scores, and listing-momentum. Fires the outbound notifications/emails once everything upstream is current. |
| 18 | **neon-branch-prune** | INFRA, no data dependencies; runs last so a Neon control-plane hiccup can never block compliance or CRM members. |

---

## (d) Failure & retry design

- **A failed member must NOT break the chain.** Each member runs inside its own
  `try/catch`. On throw: record `{ member, status: "failed", error: message, duration_ms }`
  and continue to the next member.
- **Per-member timeout budgets**, enforced with a wall-clock check before each member and a
  `Promise.race` timeout around each member, summing under the runner's `maxDuration`:
  - `one-cycle` (`maxDuration 300`): idx-sync ≤ 120s, media-sync ≤ 120s, +60s headroom.
    Sum of budgets 240 < 300.
  - `nightly-batch`: members keep budgets at or below their current route `maxDuration`s
    (retention 60, reconcile 240 — trimmed from 300 via its existing
    `ORPHAN_TIME_BUDGET_MS`-style wall-clock stop — scorers 20–30s each). Worst-case sum
    ≈ 60+240+16×30 ≈ 780s. This requires the runner's `maxDuration` > 780 (Fluid compute
    800s ceiling — **must be verified on the current Vercel plan before approval**; if not
    available, nightly-batch splits into two sequential daily entries, feed block + business
    block, still collapsing 19 schedules into 2). A member that would start after its
    budget window is recorded `"budget_skipped"` and picked up tomorrow.
- **Partial-cycle reporting:** ONE audit event per run (`one_cycle_run` /
  `nightly_batch_run`) containing a **per-member status array**
  (`[{ member, status: ok|failed|skipped|budget_skipped, duration_ms, counters… }]`) plus
  roll-up counters (`members_ok`, `members_failed`, `members_skipped`). Members keep their
  existing per-member audit events unchanged (external observers like ops:health and the
  media 48h clocks depend on them).
- **Retries: none in-cycle.** The next cycle (or next night) retries naturally. This is
  consistent with the repo's fail-closed cursor philosophy: **failures never advance
  cursors/watermarks** — idx-sync's watermark only moves on successful sync, media-sync's
  cursor is explicitly not advanced on the error path, and feed-reconcile aborts whole-run
  on its safety caps. A failed member therefore re-covers its missed ground automatically
  on the next invocation.
- Existing per-member concurrency guards (10-min AuditEvent lookback in idx/media) remain
  as defense in depth against overlapping orchestrator runs.

---

## (e) Proposed two-entry `crons` block (IN THIS DOC ONLY — not applied)

```json
"crons": [
  { "path": "/api/cron/one-cycle", "schedule": "*/30 * * * *" },
  { "path": "/api/cron/nightly-batch", "schedule": "0 3 * * *" }
]
```

Note: the two route-handler **orchestrators** would sequentially invoke the member jobs'
**lib functions** (`syncListings`, `runMediaSync`, the retention/reconcile bodies extracted
to lib, `batchScoreLeads`, `evaluateAllTriggers`, etc.) in-process — no HTTP fan-out, one
function invocation, one DB wake per firing. Weekly/monthly members are gated by
day-of-week / day-of-month checks inside `nightly-batch`. The 21 existing routes can remain
deployed (unscheduled) during a transition window for manual triggering.

---

## (f) Expected wake-window calculation — ESTIMATE, labeled as such

**Current 21 schedules:** `*/30 * * * *` ×1 · `0 * * * *` ×1 · 16 dailies
(03:00, 03:30, 04:00, 06:00, 07:00, 07:30, 08:00, 08:30, 09:00, 10:00, 11:00, 13:00,
14:00, 15:00, 16:00, 17:00) · 2 weeklies (Sun 02:00, Mon 12:00) · 1 monthly (1st 06:00).

**Firings/day:**

- Now: 48 (idx-sync) + 24 (media-sync) + 16 (dailies) + 2/7 ≈ 0.29 (weeklies) + 1/30 ≈ 0.03 (monthly) ≈ **88.3 firings/day**
- After: 48 (one-cycle) + 1 (nightly-batch) = **49 firings/day** (−45%)

**Compute translation** (0.25 CU compute, 5-min autosuspend; each *isolated* wake ≈ run
time + 5 min idle-before-suspend). Two models, both ESTIMATES:

*Model 1 — naive isolated-wake (upper bound on savings):* assume every firing is its own
wake window. Avg run: idx/media ≈ 1.5 min, reconcile ≈ 3 min, others ≈ 1 min.

- Before: 48×(1.5+5) + 24×(1.5+5) + 15×(1+5) + 1×(3+5) + 0.29×6 + 0.03×6 ≈ 312+156+90+8+2 ≈ **568 min/day** → ×0.25 CU ÷60 ≈ 2.37 CU-h/day ≈ **71 CU-h/month**
- After: 48×(3+5) + 1×(15+5) ≈ 384+20 = **404 min/day** → ≈ 1.68 CU-h/day ≈ **50 CU-h/month**
- Naive delta ≈ **−21 CU-h/month (~30%)**

*Model 2 — coincidence-adjusted (honest correction):* every current schedule fires on a
:00/:30 boundary, i.e. inside a window idx-sync already opened. True distinct windows/day
≈ 48 both before and after; co-fired jobs mostly *extend* windows rather than create them.
Adjusted before ≈ 48×5 idle + ~128 min total run ≈ 368 min/day ≈ **46 CU-h/month** — and
the after figure is ~50 CU-h/month if the media member runs every cycle (24→48 media runs
is a real cadence increase; gating media to every 2nd cycle restores parity).

**Honest conclusion:** W2 alone is between roughly compute-neutral (Model 2) and ~30%
savings (Model 1). Its concrete wins are: one function invocation per window instead of up
to 3–4, one connection warm-up, deterministic ordering, single-event observability — and it
is the **prerequisite for W3 adaptive drain**, where cycles with nothing to do skip the DB
wake entirely; that is where the material CU-h reduction is expected to land. Actual
numbers come from the mandated measurement sequence (W1-only 24h checkpoint → W1+W3
measurement → only then W2), per `docs/operations/neon-compute-attribution-2026-07-14.md`-
class evidence, not from this arithmetic.

---

## (g) Rollback

No data changes are involved in W2 — rollback is purely a schedule restore:

1. In `vercel.json`, replace the two-entry `crons` block with the current 21-entry array,
   **verbatim**:

```json
"crons": [
  { "path": "/api/cron/data-retention", "schedule": "0 3 * * *" },
  { "path": "/api/cron/neon-branch-prune", "schedule": "0 4 * * *" },
  { "path": "/api/cron/feed-reconcile", "schedule": "30 3 * * *" },
  { "path": "/api/cron/dom-reset", "schedule": "0 6 * * *" },
  { "path": "/api/cron/idx-sync", "schedule": "*/30 * * * *" },
  { "path": "/api/cron/media-sync", "schedule": "0 * * * *" },
  { "path": "/api/cron/listing-expiration", "schedule": "0 7 * * *" },
  { "path": "/api/cron/search-alerts", "schedule": "30 7 * * *" },
  { "path": "/api/cron/seller-scoring", "schedule": "0 8 * * *" },
  { "path": "/api/cron/tenant-nurture", "schedule": "30 8 * * *" },
  { "path": "/api/cron/prospect-triggers", "schedule": "0 9 * * *" },
  { "path": "/api/cron/experiment-metrics", "schedule": "0 2 * * 0" },
  { "path": "/api/cron/demand-signals", "schedule": "0 10 * * *" },
  { "path": "/api/cron/intent-profiles", "schedule": "0 11 * * *" },
  { "path": "/api/cron/agent-metrics", "schedule": "0 12 * * 1" },
  { "path": "/api/cron/lead-scoring", "schedule": "0 13 * * *" },
  { "path": "/api/cron/conviction-scores", "schedule": "0 14 * * *" },
  { "path": "/api/cron/listing-momentum", "schedule": "0 15 * * *" },
  { "path": "/api/cron/social-proof", "schedule": "0 16 * * *" },
  { "path": "/api/cron/lifecycle-triggers", "schedule": "0 17 * * *" },
  { "path": "/api/cron/market-snapshots", "schedule": "0 6 1 * *" }
]
```

2. Redeploy (merge the revert PR; Vercel re-registers the cron schedules on deploy).
3. Verify: Vercel dashboard shows 21 cron entries; next `idx_sync_cron` AuditEvent lands
   within 30 min; `npm run ops:health` watermarks fresh.
4. Nothing else: the 21 member routes were never removed, no cursor/watermark/data state
   was touched by the schedule change, and members' own audit events continued throughout.

---

## Constraints (restated)

- **Design only.** `vercel.json` untouched by this document; no code changed.
- **Requires explicit Maya approval** — cron cadence changes are a held surface
  (CLAUDE.md §A.7 / §C standing directive).
- **Measurement sequencing:** W1-only 24h checkpoint must complete, and the W1+W3
  measurement must be taken, before W2 activation — so W2's effect is attributable.
- `maxDuration > 300` for nightly-batch requires plan verification (Fluid compute 800s);
  fallback design (two daily entries) documented in §(d).
