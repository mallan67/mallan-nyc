# Vercel Runtime / Cost Audit — mallan.nyc — 2026-06-12

**Scope:** READ-ONLY. No code, config, or deploy changes were made.
**Project:** `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW` (mallan-nyc) · Team `team_kZQh5NYLyrOKqffK0r9EXf4E` ("maya" / slug `mallan`) · Region `iad1` · Next.js 16 + Turbopack, Node 20.
**Evidence basis:** Vercel MCP (`get_project`, `list_deployments`, `get_runtime_logs`) + static source reads. Runtime-log window queried: **2026-06-11T19:40Z → 2026-06-12T21:44Z (~26 h)** — Pro retains ~1 day, so everything before last night is invisible; statements about "trend" beyond that window are *not* possible from logs and are marked as such.
**Honesty limits of the log tool:** the MCP runtime-log view returns request rows (time/method/path/status/level/truncated message) but **no per-request duration or cache-hit column**, and full-text queries over windows > ~6 h timed out. Per-run durations below are therefore (a) bounded by log evidence (start line → abort/summary line) where one exists, or (b) static design budgets from source. Exact `duration_ms` per media-sync run is written to the `auditEvent` table (`changes.duration_ms`, `app/api/cron/media-sync/route.ts:93`) — DB-side, out of this audit's scope (covered by the DB agent).
**Plan:** `get_project` does not expose the billing tier. Inferred **Pro**: team account, 22 cron jobs at 10/15-minute granularity (Hobby allows 2 crons, daily granularity only), 300s maxDuration in use.

---

## 1. Cron jobs (vercel.json)

| Path | Schedule (UTC) | Frequency |
|---|---|---|
| /api/cron/db-keepalive | `*/15 * * * *` | 96/day |
| /api/cron/idx-sync | `*/10 * * * *` | 144/day |
| /api/cron/media-sync | `*/15 * * * *` | 96/day |
| /api/cron/data-retention | `0 3 * * *` | daily |
| /api/cron/feed-reconcile | `30 3 * * *` | daily |
| /api/cron/neon-branch-prune | `0 4 * * *` | daily |
| /api/cron/dom-reset | `0 6 * * *` | daily |
| /api/cron/listing-expiration | `0 7 * * *` | daily |
| /api/cron/search-alerts | `30 7 * * *` | daily |
| /api/cron/seller-scoring | `0 8 * * *` | daily |
| /api/cron/tenant-nurture | `30 8 * * *` | daily |
| /api/cron/prospect-triggers | `0 9 * * *` | daily |
| /api/cron/demand-signals | `0 10 * * *` | daily |
| /api/cron/intent-profiles | `0 11 * * *` | daily |
| /api/cron/lead-scoring | `0 13 * * *` | daily |
| /api/cron/conviction-scores | `0 14 * * *` | daily |
| /api/cron/listing-momentum | `0 15 * * *` | daily |
| /api/cron/social-proof | `0 16 * * *` | daily |
| /api/cron/lifecycle-triggers | `0 17 * * *` | daily |
| /api/cron/experiment-metrics | `0 2 * * 0` | weekly |
| /api/cron/agent-metrics | `0 12 * * 1` | weekly |
| /api/cron/market-snapshots | `0 6 1 * *` | monthly |

Note: `/api/cron/media-backfill` exists as a route (`maxDuration 120`) but has **no schedule** — manual-trigger only.

## 2. Runtime duration by route/job

Durations are NOT exposed by the MCP log view (see header). What the window + source establish:

| Job | maxDuration (route export) | Internal budget / design estimate | Window evidence |
|---|---|---|---|
| idx-sync | 120 | 500-record cap; route comment sizes a full batch at **~65 s** (`app/api/cron/idx-sync/route.ts:47-74`); typical incremental runs far shorter | every 10 min, 200s all window except one 500 at 18:30 |
| media-sync | 120 | **DEFAULT_BUDGET_MS = 100 s** with checkpointing (`lib/idx/media-sync.ts:1338`) — runs self-stop at 100 s, 20 s headroom | every 15 min, 200s except one 500 at 20:30 (first run after P1C6b promote 20:15Z); exact per-run `duration_ms` lives in auditEvent rows (DB scope) |
| feed-reconcile | **300** (P1C6b, was 120) | orphan loop wall-clock budget **ORPHAN_TIME_BUDGET_MS = 240 s** (`route.ts:74`); design math ~160 s for chunk=300 | 2026-06-12 03:30 run: **503 ABORT (orphan cap)** at 03:30:31 — that run executed the **pre-P1C6b** code (deploy `dpl_Dir7uo5…`); the chunked P1C6b promoted ~20:15Z today, so its **first real firing is 2026-06-13 03:30** — no chunked-drain duration data exists yet |
| db-keepalive | 10 | trivial | 200s, every 15 min |
| daily analytics crons | 60 | — | inside window where observed, all 200 |
| Public: /api/listings | 60 | 2-min in-memory cache, DB-first | low volume in samples |
| Public: /listing/[...slug] page | 60 | ISR `revalidate = 300` | handful of renders/hour (mostly crawlers) |

**media-sync "nightly drain"**: there is no nightly-specific drain run — media-sync is a flat `*/15` cadence with a 100 s budget every firing; drain depth is governed by the budget, not the clock.

## 3. Errors / retries in the ~26 h window

Total 5xx in 26 h: **3** (level-error lines: 2). No 504/timeout kills observed.

| Time (UTC) | Route | Status | Message (truncated by tool) |
|---|---|---|---|
| 06-12 03:30:31 | /api/cron/feed-reconcile | 503 | `[feed-reconcile] ABORT — or…` — the known orphan-cap abort path, **expected** on the pre-P1C6b code; not a crash |
| 06-12 18:30:03 | /api/cron/idx-sync | 500 | `Error [PrismaClientKnownReq…` — one-off; the 18:40+ runs returned 200 |
| 06-12 20:30:10 | /api/cron/media-sync | 500 | no console line captured; first firing ~15 min after the P1C6b production promote; 21:30 run returned 200 |

Error rate ≈ 1/144 idx-sync runs and 1/96 media-sync runs (<1%); crons are idempotent/cursor-checkpointed so the cost of a failed run is one wasted invocation, not a retry storm (Vercel does not auto-retry failed crons).

Background noise: scattered 403s on `/buildings/*` and `/listing/*` (firewall/bot blocks) and 404s on `/api/listings/<slug>` lookups — normal.

## 4. Heavy routes by invocation count

Precise per-route counts are not obtainable from this tool (100-row pages, no aggregation). From samples across the window:

- **`/` (homepage): an uptime monitor hits it every ~60 s** → ~1,440 hits/day, the single most-logged path. Page is ISR `revalidate = 3600` with no dynamic APIs (`app/page.tsx`) — most hits should be CDN-served; the log view cannot distinguish cache HIT from function invocation, so worst case is ~43k invocations/month (still negligible, see §8).
- **idx-sync (144/day) + media-sync (96/day) + db-keepalive (96/day)** = ~336 cron invocations/day — the dominant *compute* (not count) consumers.
- Listing detail pages: single-digit renders/hour (crawler-dominated), ISR 300 s.
- `/api/listings`: low volume; 2-min in-memory cache; DB-first.
- **`/api/media/proxy`: ZERO invocations found in the last 6 h** (targeted query returned no rows) — see §4a.
- `/api/media/batch`: CRM-only (agent/broker auth required) — not public volume.

### 4a. The media-serving answer (static + runtime, the big question)

**R2 images are NOT served through a Vercel function. They are direct Cloudflare URLs.**

- `media_url_cached` is built as `R2_PUBLIC_URL + key` (`lib/images/r2.ts:108-109`); tests pin the shape `https://pub-….r2.dev/...` — Cloudflare-served, zero Vercel involvement per request.
- The resolver prefers the R2-cached URL and only wraps **Trestle-original fallback URLs** in `/api/media/proxy?url=` (`lib/media/listing-media-resolver.ts:284-299`, `resolveListingMediaFromRows` "Prefers the R2-cached URL … don't need bearer-auth proxying").
- The proxy itself (`app/api/media/proxy/route.ts`) already sets `Cache-Control: public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable` + `CDN-Cache-Control` (line 118-119), so even proxied images cost one function invocation per image per 7 days per CDN region, not per page view. Error responses are correctly `no-store`.
- Runtime confirmation: **0 proxy invocations in 6 h of production logs.** The feared "function per image" pattern does not exist in practice today; the R2 mirror (RC3/Lane-D work) has already removed this cost lever.

## 5. media-sync + feed-reconcile duration trend

- **media-sync:** maxDuration **120** (route export AND `vercel.json` functions entry agree). Every firing self-limits at the 100 s budget with checkpointed exit reasons (`completed / budget_phase1 / budget_phase2 / source_error`). Last night vs tonight cannot be compared from runtime logs (no duration column); the authoritative per-run `duration_ms` series is in `auditEvent.changes` (DB agent's scope).
- **feed-reconcile:** maxDuration **300** as a route export (`app/api/cron/feed-reconcile/route.ts:60`). Last night's (03:30Z) run was the OLD code and 503-aborted on the orphan cap ~31 s in. **No chunked-drain run has happened yet** — first one is 2026-06-13 03:30Z. Design math in-source: ~160 s estimate, 240 s hard budget.

## 6. Jobs close to timeout (>70% of maxDuration)

| Job | Budget vs maxDuration | Ratio | Assessment |
|---|---|---|---|
| media-sync | 100 s / 120 s | 83% | **By design** — checkpointed, deliberate headroom; not a timeout risk but permanently "close" |
| feed-reconcile | 240 s / 300 s | 80% | **By design** — early-stop budget; UNTESTED in production until 06-13 03:30Z |
| idx-sync | ~65 s est / 120 s | ~54% | comfortable |

⚠️ **Config-precedence flag (verify, don't change):** `vercel.json` `functions` sets `app/api/**/*.ts → maxDuration 30` and lists explicit 120 s entries for idx-sync and media-sync — but **feed-reconcile has NO vercel.json entry**; its 300 s exists only as a route segment export. Vercel documents that `vercel.json` values take precedence over segment config. If the broad 30 s glob were winning, today's 03:30 run could not have aborted gracefully at ~31 s (it would have been a 504 kill), which suggests the segment export is being honored — but this is inference, not proof. **Recommend Maya verify the effective max duration in the Vercel dashboard function settings before the 06-13 chunked run, and (with approval — vercel.json is a HELD surface) mirror feed-reconcile at 300 into the `functions` block the way idx-sync/media-sync are.** If the 30 s glob wins, tomorrow's chunked drain will 504 mid-chunk (safe — chunk selection is deterministic/idempotent — but the backlog never drains).

## 7. Looping / refetching patterns on hot paths

- **Trestle OAuth token:** module-level in-memory cache, refreshed 5 min before expiry (`lib/idx/auth.ts:14-36`) — no per-request token refetch *within a warm instance*. Cold starts re-fetch once; Fluid concurrency reuses instances, so token churn is low. Fine.
- **/api/listings:** DB-first with a 2-min in-memory response cache (50 keys); Trestle-direct path is the fallback. Acceptable.
- **Listing detail page:** ISR 300 s; `fetchFromTrestleDirect` uses `next: { revalidate: 300 }` and the live `fetchListingMedia` fallback fires only when DB rows yield zero photos (gated by `shouldFetchTrestleMediaFallback`). Per-request Trestle calls happen only on ISR misses across the long-tail of ~10k+ slugs under crawler traffic — moderate, bounded by maxDuration 60 and observed low render rates.
- **Uptime monitor on `/` every 60 s** — the only genuinely repetitive caller observed. ISR 3600 means at most ~24 origin renders/day are needed; the rest should be CDN hits. Worth confirming the monitor isn't sending cache-busting headers.
- **media proxy semaphore (30 concurrent) + 10 s outbound timeout** — correctly prevents the historical 300 s slot-hold pathology.
- No evidence of N+1 Trestle loops on public pages; the heavy loops (pagination drains) all live inside budget-capped crons.

## 8. Estimated monthly runtime impact

**Assumptions (stated, rough):** Fluid Compute Active CPU pricing — invocations ~$0.60/M, Active CPU ~$0.128/CPU-hr, provisioned memory ~$0.0106/GB-hr; standard 1.7–2 GB memory; cron work is network-bound so active CPU ≈ 5–15% of wall-clock; Pro includes a bundled allotment (order: ~1M invocations + a few active-CPU-hours + several hundred GB-hrs memory) before overage.

| Component | Invocations/mo | Wall-clock/mo | Est. cost/mo |
|---|---|---|---|
| idx-sync (144/d, avg 20–65 s) | ~4,300 | 24–78 hr | $0.6–2.6 (mem) + $0.2–1.5 (CPU) |
| media-sync (96/d, avg 10–100 s) | ~2,900 | 8–80 hr | $0.2–2.7 + $0.1–1.5 |
| db-keepalive + daily/weekly crons | ~3,500 | ~6 hr | <$0.30 |
| feed-reconcile (1/d, ≤300 s) | 30 | ≤2.5 hr | <$0.10 |
| Public traffic incl. monitor (~3–6k/d) | 0.1–0.2 M | ~2–5 hr | ~$0.2–0.5 |
| **Total** | **~0.12–0.21 M** | **~40–170 hr** | **≈ $1.5–9 gross — most or all absorbed by the Pro included allotment** |

Bottom line: function compute is a **single-digit-dollars-per-month** problem; the Pro seat fee dominates the bill. **~85–90% of all function compute is the idx-sync + media-sync cadence**, not public traffic, and image serving is already off Vercel (R2 direct + 7-day CDN cache on the proxy fallback).

## 9. Safe post-C6 optimizations (recommendations ONLY — several touch HELD surfaces: vercel.json/cron/env need Maya approval)

1. **Mirror feed-reconcile `maxDuration: 300` into `vercel.json` `functions`** (§6 flag) — removes the precedence ambiguity before relying on the 240 s orphan budget. (HELD: vercel.json.)
2. **Reduce media-sync to `*/30`** once `backlog_remaining` (auditEvent series) flatlines at ~0 — halves the largest compute line; the cursor design makes the cadence purely a latency knob. (HELD: cron config.)
3. **Keep idx-sync at `*/10`** (feed freshness is compliance-adjacent) but consider a cheap early-exit: a `$top=1` count probe before the full 500-record machinery when zero records changed — most 10-min windows are quiet overnight. (Code change — post-C6 PR.)
4. **Media proxy:** nothing urgent — headers are already optimal. The durable retirement path is finishing the R2 mirror so `media_url_cached` coverage → 100% and the proxy goes quiescent (it effectively already is: 0 invocations/6 h).
5. **Listing pages:** ISR 300 s already in place; no change recommended. Optionally lengthen to 900 s for terminal-status listings if Trestle freshness pressure ever matters — marginal.
6. **Uptime monitor:** confirm it isn't cache-busting `/`; if it is, point it at `/api/health` (already exists, lighter) — zero-risk saving of up to ~43k renders/month.
7. **Do nothing about Hobby/Pro:** the plan is correctly Pro (cron count alone requires it).

---
*Generated read-only 2026-06-12. Log window ~26 h (Pro retention); duration claims beyond it are design-budget, not measurement. Not committed per instruction.*
