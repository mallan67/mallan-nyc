# PR #523 Incident Post-Mortem — /listing/* 500s (2026-07-16 → 2026-07-17)

> **Read-only audit — permanent incident record.** Branch: `audit/pr523-incident-postmortem-2026-07-16` (based on `main` @ `94eef36b`). Nothing was merged, deployed, backfilled, or changed in production, Neon, Redis, env, cron, or schema during this audit. Evidence: live URL probes, Vercel deployment/error APIs, `gh` PR/commit/status APIs, the merged PR #523 diff, Next.js 16.1.6 vendored source, and the repo's own Neon forensic docs. All timestamps UTC. Raw evidence is in **Appendix (§12)**; every number there is labeled MEASURED / EXTRAPOLATED / ESTIMATED / UNVERIFIED.
>
> Maya's corrections of 2026-07-17 are incorporated: split Neon verdicts (§11), corrected PR order (§9), release-health statement (§1.3), evidence appendix (§12), salvage clarifications (§4–6).

---

## 1. Production restoration verification (Phase 1) — VERIFIED 2026-07-17 00:30–00:40Z

### 1.1 Live probes

| Check | Result | Evidence |
|---|---|---|
| Canonical listing page | **200** (0.51s) | `curl https://mallan.nyc/listing/217-w-57th-street-apt-127-128-new-york-city-ny-10019/rls20059088` |
| ID alias | **200** | `curl https://mallan.nyc/listing/rls20059088` (no 500, no redirect loop) |
| `/api/listings` | **200**, 10,027 listings, valid JSON | live probe |
| Similar Properties | **200** | `curl https://mallan.nyc/api/listings/similar?id=RLS20059088` |
| Open houses | **200** | `curl https://mallan.nyc/api/open-houses` |
| Listing media | **200** | R2 photo `…r2.dev/photos/RLS20059088/1.jpg` |
| Domains → known-good deployment | **All 7 domains** (mallan.nyc, www, mallannyhomes.com, www, 3× vercel.app) aliased to **`dpl_HVeqRrKzzHKmake4DwdjUhn42qrf`** (commit `af0148ba`, PR #526) | Vercel `get_deployment("mallan.nyc")` → `alias[]`, `target: production`, `state: READY` |
| 500 cluster dead | **Zero runtime errors since 00:23:17Z** (checked 00:36:49Z); all 50 error groups pinned to `dpl_HNNerURm…` only | Vercel `get_runtime_errors` 6h window (§12.2) |
| Cached 500s after rollback | **None.** The three highest-count previously-500 URLs return 200, including on fresh `x-vercel-cache: MISS` renders; the alias switch changed the deployment and with it the entire ISR/CDN cache keyspace, so no broken-deployment cache entry can be served | probes: `/listing/RLS20073469` (MISS→200), `/listing/507-84th-…-rls20057645` (HIT→200), `/listing/160-central-park-…/rls20088635` (MISS→200); healthy page shows `X-Nextjs-Prerender: 1`, `X-Vercel-Cache: HIT` |

### 1.2 Corrected incident timeline (differs from the 14-minute assumption)

| Time (UTC) | Event | Evidence |
|---|---|---|
| 07-16 22:15:42 | Preview deployment `dpl_3uUBL1Lcuy…` of the final #523 commit (`63fe81cd`) READY — **never probed on any `/listing/*` path** | `list_deployments` |
| 22:20:40 | PR #523 merged (`7ea13e7e`) | `gh pr view 523` |
| 22:20:43 | `dpl_HNNerURm…` created from `7ea13e7e`, READY, takes production traffic | `list_deployments` |
| **22:24:38** | **First `/listing/*` 500** (E132 static-to-dynamic) | `get_runtime_errors` `first=` |
| 22:34:59 | Revert PR #528 merged (`94eef36b`) | `gh pr view 528` |
| 22:35 | Release Truth on revert: verdict **PARTIAL**, deploy layer **DEPLOY_UNKNOWN** (advisory only, blocked nothing) | workflow run log |
| 22:58:40 | Hourly **Live Site Smoke: SUCCESS** while every listing page 500s | `gh run list --commit 94eef36b` |
| 23:59:27 | GitHub commit status from Vercel on `94eef36b`: **"Deployment failed."**, `target_url: null` — **no deployment object was ever created** for the revert | `gh api commits/94eef36b/status`; `list_deployments` shows newest deployment is still `dpl_HNNerURm…` |
| 00:06:35 (07-17) | Live Site Smoke: SUCCESS again (still blind) | `gh run list` |
| **~00:23** | Production alias rolled back to `dpl_HVeqRrKzz…` — errors stop at 00:23:17, none since | error `last=` timestamps + current alias state |

**Actual customer-facing outage on `/listing/*`: ~1 h 59 m (22:24 → 00:23), not 14 minutes.** The git revert restored `main` but never reached production; only the manual alias rollback did. During the window: ≥376 errored requests across 50 URL clusters, ≥26 distinct users (lower bounds — §12.2).

### 1.3 Release health — NOT RESTORED (explicit statement)

**Production is restored, but release health is not restored** while:

- production serves `af0148ba` (PR #526), and
- current `main` is `94eef36b` (the #528 revert merge) with **no matching READY Vercel deployment** — the git-integration deploy for the revert failed at deployment-creation level ("Deployment failed.", no object, no build log, status arriving 84 minutes post-merge).

Content-wise the two trees are equivalent (the revert exactly undoes #523), but the pipeline that turns a merge into a production deployment is **demonstrably broken or unreliable right now**. The known-flaky Vercel↔GitHub integration on this project (false Neon "Branch limit exceeded" check, stuck commit statuses — `docs/support/vercel-neon-false-branch-limit-status-2026-06-03.md`) is the leading suspect, but root cause is **not confirmable from repo/API evidence** — it needs the Vercel dashboard/support.

> **HOLD: no new runtime PR may merge until one successful Git-triggered production deployment matches the merged `main` SHA.** (A docs-only merge — such as this postmortem PR, separately authorized — is the safest possible pipeline probe: if Vercel produces a READY production deployment whose SHA equals the new `main` HEAD, the pipeline is proven; if not, the failure reproduces with zero runtime risk.)

---

## 2. Exact root cause (Phase 2.1 / 2.2)

**The offending call:** PR #523 wrapped `fetchListing` in `app/listing/[...slug]/page.tsx` (hunk `@@ -600,8 +603,28`) with a durable Redis cache:

```ts
const hit = await cacheGetJson<ListingFetchResult | CachedMiss>(key);  // first await, every render
…
await cacheSetJson(key, …);                                            // every miss
```

**Full failure chain (each link verified in source):**

1. `app/listing/[...slug]/page.tsx:57` — `export const revalidate = 300` → the route is registered in the prerender manifest as **static/ISR**. There is **no `generateStaticParams`** anywhere under `app/listing/`.
2. `cacheGetJson` → `lib/cache/durable-cache.ts:134` → `redis.get()` on `lib/redis.ts:21` (`@upstash/redis ^1.37.0`, default options → auto-pipelining ON).
3. `@upstash/redis` defaults every REST call to `fetch(…, { cache: "no-store" })` (`node_modules/@upstash/redis/nodejs.js:5668`) against `https://humble-bobcat-71648.upstash.io/pipeline` (the `withAutoPipeline` frame in the production stack).
4. Next's patched fetch flags it: `patch-fetch.js:841` → `markCurrentScopeAsDynamic(…, "no-store fetch <url> /listing/[...slug]")` — verbatim the `reason:` in production errors — sets `revalidate = 0` and throws `DynamicServerError` (E550).
5. The runtime handler (`app-page.js:587-599`) converts that into hard error **E132** — `isSSG && cacheControl.revalidate === 0 && !isDev && !isRoutePPREnabled` were all true (`next.config.js` has no PPR/cacheComponents) → `Error: Page changed from static to dynamic at runtime …` → **HTTP 500 on every `/listing/*` request**, `generateMetadata` and the page body both triggering it.

**Why no guard saved it:** the `try/catch` inside `cacheGetJson` ("fail-open") cannot help — Next tracks the dynamic bailout in the render work-store independently of user-code error handling. React's `cache()` wrapper is **not** a caching scope for this purpose (only `'use cache'`/`unstable_cache` are). The PR added no `dynamic = 'force-dynamic'`, no `unstable_cache`, no Upstash `cache` option — the page render was treated exactly like a route handler.

**Why the flag-gating failed:** `ALIAS_INDEX_AUTHORITATIVE` gates only the *miss semantics* inside `lookupAlias` in `proxy.ts`. The listing-detail cache and the `/api/listings` cache were **ungated and live on merge**. The only condition on the fatal call was `if (!redis) return undefined` — and production has `UPSTASH_REDIS_REST_URL/TOKEN` set (the pre-existing rate limiter uses them). The PR body's "fails open" claim conflated *Redis data misses* with *runtime-context safety*.

---

## 3. Why type-check, Jest, build, and Preview all passed (Phase 2.4)

| Gate | What it proved | Why it missed the bug |
|---|---|---|
| `type-check` | Code is type-correct | The bug is a runtime rendering-mode contract, not a type |
| Jest (2,979 tests) | Cache *logic* correct | `neon-wakeups-cache.test.ts` mocks `@/lib/redis` with an in-memory Map — the real SDK and its `no-store` fetch never executed; `tests/runtime` is ts-jest/node, no Next renderer; several "tests" are source-regex assertions on `page.tsx` text |
| `next build` (CI + Vercel) | Compiles; prerenders declared paths | App-page static classification is **config-only** (`build/utils.js:770-777`); with no `generateStaticParams`, **zero** `/listing/*` paths render at build — the page function never ran. Independently, CI env (`pr-check.yml:26-31`) has no `UPSTASH_*`, so `lib/redis.ts` exports `null` and the fetch can't fire. Had a build-time render happened, E550 is *tolerated* at build (route demoted to dynamic, no E132) — E132 exists only in the runtime request path |
| Vercel Preview | Build + deploy succeeded | **Preview HAD the Upstash env** (`vercel env ls`: both vars scoped Dev+Preview+Prod) — the missing-env hypothesis is eliminated. First-render-vs-revalidation also eliminated (E132 fires identically on first on-demand render). **Confirmed gap: no human or automated request ever hit a `/listing/*` URL on the preview.** One `curl` would have returned the 500 |
| Hourly Live Site Smoke | Homepage, `/search`, `/api/health`, sitemap OK | `scripts/validate-live-site.js` contains **zero `/listing/*` probes** (it checks "attribution on listing pages" by fetching `/search`). It passed twice *during* the outage (22:58, 00:06) |

The failure was visible only after production traffic reached the ISR route because the very first runtime render of any listing path was the first time (a) the page function executed at all with (b) a live Upstash client — merged 22:20, first organic listing request 22:24.

---

## 4–6. PR #523 classification (Phase 3)

Source: full `gh pr diff 523` (956 lines) — nothing assumed safe from green CI.

### SAFE TO SALVAGE (Redis stays in route-handler / cron / script contexts)

| File | Condition |
|---|---|
| `lib/cache/durable-cache.ts` | As a library — with a **new documented invariant + source-guard test**: never importable from RSC page/layout render code |
| `lib/cache/invalidate-listing.ts` | Cron/sync-side only; reuses canonical suppression helpers (no address leak) |
| `lib/idx/sync.ts` invalidation hunks | Pure cron path; zero-invalidation on unchanged runs is behaviorally tested |
| `lib/listings/alias-index.ts` | No Prisma imports (source-guarded); call sites are proxy + sync only |
| `app/api/listings/route.ts` durable cache | Route handlers are dynamic by definition — `no-store` fetch is legal there; version-bump invalidation sound |
| `scripts/backfill-alias-index.ts`, `scripts/verify-alias-index.ts` | Standalone, never bundled; correctly sequenced (backfill → verify ≥99%/≥95% → flag). **Present ≠ run** — execution stays held |
| `tests/runtime/neon-wakeups-cache.test.ts` — behavioral half | Alias-derivation, suppression-no-leak, invalidation-count, zero-churn tests are good |

### MUST DISCARD

| File / hunk | Reason |
|---|---|
| `app/listing/[...slug]/page.tsx` detail-cache hunks (`cacheGetJson`/`cacheSetJson` inside `fetchListing`, `_miss` sentinel) | The incident. No form of `@upstash/redis` call can live in this ISR render |
| `tests/runtime/listing-fetch-error-propagation.test.ts` rewrite | Regex-pins the exact source shape of the crashing implementation |
| `tests/runtime/neon-wakeups-cache.test.ts` "architectural guarantees" block | Asserts by regex that `page.tsx` **contains** `cacheSetJson(` — it enforces the presence of the bug |

### REQUIRES REDESIGN

| Item | Why it is NOT yet safe / direction |
|---|---|
| **`proxy.ts` alias resolution** | **Not yet safe to re-land as merged.** Three defects, each requiring redesign, not caveats: (1) with `ALIAS_INDEX_AUTHORITATIVE` **OFF**, the code still performs a live Redis GET on every single-segment `/listing/*` request — "flag off" must mean **zero Redis I/O**; (2) `CDN-Cache-Control: s-maxage=86400` on the 308 lets a stale redirect **outlive an alias correction by up to 24 h** — redirect caching must not outlive alias correction (shorter TTL or tag/purge on rewrite); (3) the authoritative-404 branch returns a bare `new NextResponse(null, {status:404})`, bypassing the branded not-found page — requires redesign before the authoritative mode can ever be considered |
| Listing-detail durable caching (the concept) | See PR C in §9. `unstable_cache` and `'use cache'`/Cache Components are **candidates, not approved solutions** — each needs its own compatibility verification against the installed Next 16.1.6 config before any PR is drafted. **A new detail cache may be unnecessary after measurement:** PR #511 already made the detail page edge-cacheable (MISS→HIT proven live) and `revalidate = 300` already bounds Neon reads per path |
| Authoritative alias rollout (`ALIAS_INDEX_AUTHORITATIVE` + backfill) | Groundwork (library + scripts) salvageable per above; the rollout itself stays held and needs a real gate: the flag must control whether Redis is *called*, not just miss semantics |

---

## 7. Neon findings — read side, split correctly (Phase 2.5)

Sources: `docs/operations/neon-compute-attribution-2026-07-14.md` (ATTR), `neon-compute-storage-audit-2026-07-16.md` (STOR-16), live read-only `list_branch_computes` (hidden-mountain only). Evidence labels in §12.4–12.6.

**Billing model first:** prod compute is fixed **0.25 CU (min=max)**; bill = 0.25 × active hours. Only *active time* matters, not query intensity (ATTR §1).

### 7.1 Public-request read wakeups — PARTIALLY ADDRESSED, NOT PROVEN CLOSED

- Pre-#511, listing detail pages were `private, no-store` (~1,978 uncached hits/day, MEASURED doc snapshot) — ATTR §7/§12 called this "the single largest force keeping the compute awake". Homepage fan-out added ~1,918 visits/day × 5–13 Neon queries each.
- **PR #511 (merged 2026-07-15/16) converted the detail page to edge MISS→HIT, proven live** (STOR-16). `/api/listings` and `/api/listings/[id]` were already CDN-HIT on repeats (ATTR Rev 2).
- **Not proven closed:** the 24-hour post-#511 idle observation (STOR-16 finding #3) was never run; the residual public-read keep-alive (search/buildings API traffic, bot bursts) is **unquantified**; the hourly `compute_unit_seconds` series was never exported. Overnight DB-touching requests arrived every few seconds pre-#511 (ATTR §4) — post-#511 behavior unknown.

### 7.2 Scheduled read scans — OPEN (this is cron activity, NOT visitors)

- **13.7B of the 17.13B cumulative read-tuples are `listing_media` sequential scans issued by the media-sync cron**, not by public traffic: the R2-backlog query (`r2_key IS NULL AND r2_attempts < 8`) and the coverage query (`media_url_cached IS NULL`) run as Parallel Seq Scans with **no supporting index** (ATTR §8, Rev 2).
- The attribution is MEASURED, not inferred: a 44-minute no-cron window showed `seq_scan +0` while `idx_scan +115` and `tup_returned +241,425` — i.e., **visitor traffic produces index scans; the seq-scan firehose is exclusively cron** (ATTR Rev 2).
- **Crons alone impose an ESTIMATED ~6–8 active hours/day floor** (idx-sync `*/30` + media-sync hourly + ~5-min suspend tails) that no amount of public-read caching can touch.
- **Nothing merged to date addresses this.** Any fix (index, bounded query, cadence change) touches schema or held cron surfaces — see PR D, §9.

> Do not read the 17B-vs-5M read/write ratio as "visitors dominate Neon". Visitors dominated *wakeups* pre-#511; **crons dominate read volume and set the active-time floor.**

### 7.3 Did #523 measurably reduce Neon reads in its window? NO — provably zero effect on the bill, no data for reads

- Live control plane (MEASURED, this audit, read-only): `ep-cold-waterfall` `started_at 2026-07-16T18:16:13Z`, still `active` at `last_active 2026-07-17T00:38:30Z` — the compute **never suspended through the entire #523 window**, so active-hours (= the bill) were unchanged.
- No pg_stat snapshot, no `pg_stat_statements` (not installed), and no hourly CU series brackets 22:20→00:23. The pages were 500ing — the deployment was not a valid read-reduction experiment.
- ATTR §17 explicitly said to defer read-caching PRs until the hourly `compute_unit_seconds` series proved idle windows exist. That gate was skipped for #511 and #523 both.

---

## 8. Neon findings — write side (Phase 2.6) — OPEN

Source: `docs/operations/neon-write-churn-forensic-2026-07-14.md` (CHURN), STOR-16. Labels in §12.5.

- **Four unconditional-rewrite paths** (file:line proven, CHURN §5 — full list §12.7): idx-sync listing upsert update-arm (`lib/idx/sync.ts:520-583`, `raw_data` rewritten every time at :573); projection dual-write (`sync.ts:589-622` + `lib/search/listing-search-projection.ts:401-448`); media rows (`lib/idx/media-sync.ts:551-652`, never compares `media_modification_ts`); media summary (`media-sync.ts:830-858`).
- **~100% of media-row updates are no-ops** (Cotality re-stamps `photos_change` without image changes) ≈ **≥15,600 avoidable writes/day** (EXTRAPOLATED — formula §12.6); side effect: the media cursor runs **~2 days behind** because its 50-listing budget burns on no-ops → stale photos (CHURN RC-2, §10).
- **Rewrite ratios** (MEASURED cumulative): listings 59×, listing_media 11×, projection 12× their live row counts. Churn shows up as **WAL (~82 MB/day, MEASURED doc snapshot) + autovacuum load**, not table growth (autovacuum keeps up).
- **audit_events is NOT a runaway grower:** append-only, ~210 rows (~135 KB)/day; 53% of the table (~30 MB) is a dead May–June sync-failure incident eligible for a one-time scoped prune (STOR-16 #2, separate approval).
- **Storage:** ~545 MB total; top lever is `listings.raw_data` TOAST (~102–108 MB).
- Writes are bursty, cron-only, and irrelevant to the compute *bill* — but write churn is the #1 lever for **freshness (stale photos), WAL, and storage**, and its elimination is a precondition for judging what read-side work is still worth doing.

---

## 9. Corrected PR sequence (Phase 4) — all HELD pending Maya approval

Order rationale (from this audit's own findings): 13.7B read-tuples are scheduled scans; ≥15,600 writes/day are no-ops; ~82 MB WAL/day; the compute never suspended. **Fix measurement and the deployment pipeline, then attack scheduled writes/scans — before optimizing visitor paths any further.**

**PR 0A — Evidence preservation + 24-hour measurement (no runtime code)**
- Merge this postmortem (the durable evidence record). Export the hourly CU series from Neon Console → Usage. Run STOR-16 finding #3's 24-hour post-#511 idle observation (read-only pg_stat + control-plane snapshots bracketing the window). This is the yardstick every PR below is judged against; #523 died without it.

**PR 0B — GitHub→Vercel deployment-pipeline validation (no runtime code)**
- Root-cause the "Deployment failed." on `94eef36b` via the Vercel dashboard/support (leading suspect: the documented false Neon "Branch limit exceeded" integration state). The separately-authorized merge of this docs-only PR is the safest pipeline probe (§1.3). Exit criterion: **a READY production deployment whose SHA equals the merged `main` HEAD**, plus the known-good rollback deployment ID recorded. **Until then, the runtime-merge hold of §1.3 stands.**

**PR D — No-op write suppression + scheduled scan reduction** *(moved ahead of all read-side work)*
- Files: `lib/idx/sync.ts` (diff-before-write in the upsert update arm incl. `raw_data`), `lib/search/listing-search-projection.ts:401-448` (skip unchanged projection), `lib/idx/media-sync.ts:551-652` + `830-858` (compare `media_modification_ts`/content before write; skip-unchanged summary).
- Scheduled-scan reduction: bound or index the media-sync backlog/coverage queries that generate the `listing_media` seq-scan firehose. **An index is a schema migration — NEON.md discipline + separate explicit Maya approval**; a bounded/keyset query rewrite is code-only and can land first.
- Changes: unchanged rows produce zero UPDATEs; media cursor budget spent only on real changes (fixes the ~2-day photo staleness as a side effect); `skipped_unchanged` counters logged per run.
- Excluded: **no cron schedule changes** (held surface — separate approval, and gated on closing the `app/api/sign-up/route.ts` missing-`withDbRetry` cold-start gap first); **no audit_events prune** (one-time, separately approved per STOR-16 #2).
- Tests: unchanged-fixture sync run asserts 0 tuple writes and 0 invalidations; changed-fixture asserts exactly-N; feed-reconcile tests stay green.
- Canary: one production sync cycle observed — `skipped_unchanged > 0`; listings/media `n_tup_upd` daily deltas drop from ~6,170/~14,850 toward true-change volume.
- Rollback trigger: any missed real change (photo/price/status not propagating) in the reconcile diff.
- Success: WAL/day materially down from ~82 MB; media cursor lag < 1 cycle; seq-scan tuple growth rate collapses; churn ratios flatten.

**→ MEASURE AGAIN** (re-run the PR 0A observation; compare CU series and pg_stat deltas). Only then:

**PR A — `/api/listings` durable cache — ONLY IF public reads remain material after PR D + measurement**
- Files: `lib/cache/durable-cache.ts` (new, never-in-render invariant in its header), `app/api/listings/route.ts` (salvaged hunks), `lib/idx/sync.ts` version-bump invalidation + `lib/cache/invalidate-listing.ts`, salvaged behavioral tests, **new source-guard test: no `app/**/page.tsx|layout.tsx` may import `@/lib/redis` or `lib/cache/durable-cache`**.
- Excluded: anything touching `proxy.ts`, alias index, any page/layout file, any env/cron change.
- Canary: preview URL — `curl` `/api/listings` (twice, assert HIT header) **and 3 `/listing/*` pages** (assert 200); post-promote, same probes on production + `get_runtime_errors` watch 24 h.
- Rollback trigger: any `/listing/*` or `/api/listings` 5xx cluster, or any E132/"static to dynamic" runtime error → instant alias rollback to the recorded known-good deployment.
- Success: `x-neon-queried: false` ratio on repeats; CU series shows new idle windows in low-traffic hours.

**PR B — Alias Proxy/index groundwork — ONLY IF alias traffic remains material; non-authoritative; redesigned per §4–6**
- Files: `lib/listings/alias-index.ts`, `proxy.ts` **redesigned** (flag-off = zero Redis I/O; branded 404; redirect caching that cannot outlive an alias correction), sync write-through, both scripts (checked in, **not executed**), alias tests + a "flag-off performs no Redis I/O" test + proxy no-Prisma source-guard.
- Excluded: `ALIAS_INDEX_AUTHORITATIVE` stays OFF (and OFF now truly means off); no backfill run; no env change; no 404-behavior change while OFF.
- Canary: preview — alias 308→canonical 200; unknown alias falls through to today's behavior; middleware latency delta measured.
- Rollback trigger: middleware error rate or p75 latency regression on `/listing/*`.
- Success: alias hits resolved without DB; zero behavior change with flag OFF.

**PR C — Listing-detail caching — ONLY IF later measurements still justify it**
- Strong prior from this audit: **likely unnecessary** — #511 edge caching + ISR 300 s may already bound detail-page Neon reads. If PR 0A/post-D measurement shows detail reads immaterial, **close without code**.
- If justified: the mechanism must be Next-16.1.6-native and verified compatible *before* drafting — `unstable_cache`, `'use cache'`/Cache Components (needs a config change with its own verification), or a tagged internal fetch. These are **candidates, not approved solutions**. Never a direct `@upstash/redis` call in a static render.
- Required merge gate: a preview-URL smoke that GETs real `/listing/*` paths (the control that would have caught #523; Preview has no `DATABASE_URL`, so the probe accepts the Trestle-direct path or a fixture — a 500 fails it either way).
- Canary: 5-min bake on a canary alias with the listing probe (this failure surfaced within 4 minutes). Rollback trigger: any E132/E550/"no-store fetch" in runtime logs.

---

## 10. Release-process corrections (Phase 5)

1. **Runtime listing smoke, pre-merge:** add `/listing/*` probes (canonical + ID alias + one API) to `scripts/validate-live-site.js` and run it **against the Vercel Preview URL in `pr-check.yml`** for any PR touching `app/**`, `lib/cache/**`, `lib/redis.ts`, or `proxy.ts`. It currently has zero listing probes and runs only as an hourly production cron — it stayed green through this entire outage.
2. **ISR/static-to-dynamic detection:** post-deploy (and post-rollback) job greps runtime logs for `E132|E550|app-static-to-dynamic|no-store fetch`; optionally diff `next build` route-mode output between builds and fail on drift for compliance-bearing routes.
3. **External-fetch-in-render instrumentation:** a source-guard test (no `@/lib/redis`/`durable-cache` import reachable from `app/**/page.tsx|layout.tsx`) — the inverse of the existing "proxy imports no Prisma" guard; plus a lint contract that any fetch inside a `revalidate`-declared route passes explicit cache semantics.
4. **Production canary before broad release:** 5-minute canary bake (Vercel Rolling Releases, or manual canary alias) with the listing smoke; this failure was detectable within 4 minutes of first traffic.
5. **Confirmed deployment after merge/revert:** post-merge job polls Vercel until a deployment with the merge SHA is READY, alarms after N minutes. This incident: the revert's "Deployment failed." status arrived **84 minutes** post-merge, silently, with no deployment object; Release Truth's `DEPLOY_UNKNOWN` verdict must page, not just annotate.
6. **Known-good rollback target recorded before release:** each release notes the current production deployment ID (this time it was `dpl_HVeqRrKzz…`) so the instant-rollback path takes seconds, not investigation.
7. **No P0 closure on green CI:** §F proof-first already requires a live probe or flipping test — this incident is the canonical example of why. Any render-path or caching change must show a live preview-URL probe in the PR body before merge; "Jest 2979/2979" proved logic, not the rendering contract.

---

## 11. Verdicts

| Question | Verdict |
|---|---|
| **PRODUCTION RESTORED** | **YES** — all Phase-1 probes green, domains on `dpl_HVeqRrKzz…`, zero listing-route errors since 00:23:17Z, no cached 500s |
| **RELEASE HEALTH RESTORED** | **NO** — production serves `af0148ba` while `main` is `94eef36b` with no matching READY deployment; git-triggered deploys failing at creation level. **No runtime PR merges until one Git-triggered production deployment matches the merged `main` SHA** (§1.3) |
| **PR #523 PERMANENTLY CLOSED** | **YES** — reverted on `main` (`d76964a3`/`94eef36b`); must not be reopened or re-merged; salvage happens only through the §9 sequence |
| **PUBLIC-REQUEST READ P0** | **PARTIALLY ADDRESSED / NOT PROVEN CLOSED** — #511 removed the largest visitor driver (proven live), but the idle-window proof was never captured and the residual (search/API traffic, bots) is unquantified (§7.1) |
| **SCHEDULED READ-SCAN P0** | **OPEN** — 13.7B `listing_media` read-tuples are **cron seq scans (media-sync), not visitors**; unindexed/unbounded queries; ~6–8 h/day cron activity floor; nothing merged addresses it (§7.2) |
| **WRITE-SIDE P0** | **OPEN** — four unconditional-rewrite paths live (~14,850 media-row updates/day ≈ 100% no-op; 59× listing rewrite ratio; ~82 MB WAL/day; media cursor ~2 days behind); diff-before-write not implemented (§8) |
| **OVERALL NEON SUSPENSION P0** | **OPEN** — the compute ran continuously through the entire audit window (18:16Z → 00:38Z+, zero suspends, MEASURED). No merged change has yet produced a proven idle window |

**Key decision:** do not restart #523. Fix the deployment pipeline (PR 0B), then attack the no-op writes and cron scans first (PR D). Public-request caching resumes only if post-D measurement says it still matters.

---

## 12. Evidence appendix

Labels: **MEASURED (audit)** = captured live during this audit (2026-07-17 00:25–00:55Z); **MEASURED (doc)** = a measurement recorded in a repo forensic doc, not re-run in this audit; **EXTRAPOLATED** = arithmetic from measured samples; **ESTIMATED** = modeled, no direct measurement; **UNVERIFIED** = claim without raw evidence.

### 12.1 Deployments (MEASURED (audit) — Vercel API `list_deployments` / `get_deployment`, project `prj_gcdTm2kBRm7oPdGScHZpnHRPc2gW`, team `team_kZQh5NYLyrOKqffK0r9EXf4E`)

| Deployment | Commit | Created (UTC) | State / target | Role |
|---|---|---|---|---|
| `dpl_HVeqRrKzzHKmake4DwdjUhn42qrf` (`mallan-o1deyis52-mallan.vercel.app`) | `af0148bad28b3a4438a88748d251d0ee0d547540` (PR #526) | 2026-07-16 12:45:54.516 (epoch 1784205954516); READY 12:48:51.208 | READY / production; **holds all 7 domain aliases** (verified 00:32Z) | Known-good / restored |
| `dpl_3uUBL1Lcuy3zQwiwNhMCAscygRQ2` | `63fe81cd` (final #523 branch commit) | 22:15:42.450 (1784240142450) | READY / preview | The unprobed preview |
| `dpl_HNNerURm69wjbNk2dEA5EUZhQEYY` (`mallan-jnf1lchgs-mallan.vercel.app`) | `7ea13e7e6c4c030f701e43d87357667e5e411e36` (PR #523 merge) | 22:20:43.727 (1784240443727) | READY / production (de-aliased ~00:23Z) | The failed deployment |
| *(revert `94eef36b`)* | — | — | **NO DEPLOYMENT OBJECT EXISTS** | GitHub commit status `context: "Vercel"`, `state: "failure"`, `description: "Deployment failed."`, `target_url: null`, `created_at: 2026-07-16T23:59:27Z` |

### 12.2 Runtime 500s (MEASURED (audit) — Vercel `get_runtime_errors`, 6h window, captured 00:35Z)

- **Exact error text (top cluster):** `Error: Page changed from static to dynamic at runtime /listing/RLS20073469, reason: no-store fetch https://humble-bobcat-71648.upstash.io/pipeline /listing/[...slug]` — plus the `Failed to handle <path>` wrapper variant. Stack frames: `ak.request` → `dL.exec` → `dN.withAutoPipeline` → chunk `_0awlkdv._.js` (the @upstash/redis auto-pipeline).
- **Routes:** `/listing/[...slug]` and `/listing/[...slug].rsc`. No other route errored; all 50 groups carry `lastDeployment=dpl_HNNerURm69wjbNk2dEA5EUZhQEYY`; zero groups on any other deployment.
- **First observed:** `2026-07-16T22:24:38.000Z`. **Last observed:** `2026-07-17T00:23:17.000Z`. Zero errors 00:23:17→00:36:49 (query time).
- **Volume:** sum of the 30 largest group counts = 376; 20 smaller groups unread in detail → **≥376 errored requests (lower bound)**. Distinct users: max per-group 26; cross-group overlap unknown → **≥26 users (lower bound)**. Raw dump preserved at session artifact `tool-results/mcp-plugin_vercel_vercel-get_runtime_errors-1784248553247.txt` (session-local; reproduce with `get_runtime_errors since=6h` scoped to the incident window).

### 12.3 Git record (MEASURED (audit) — `gh` API)

- PR #523 merge: `7ea13e7e6c4c030f701e43d87357667e5e411e36`, merged `2026-07-16T22:20:40Z`, branch `fix/neon-public-db-wakeups-p0`.
- Revert commit: `d76964a3`; revert PR #528 merge: `94eef36b5bff27689ed796e0577c63f783460071`, merged `2026-07-16T22:34:59Z`. `origin/main` HEAD at audit time = `94eef36b`.
- Known-good production commit: `af0148bad28b3a4438a88748d251d0ee0d547540` (PR #526).
- Check runs on `94eef36b`: `guardrails` success; `release-truth` **failure** (verdict `PARTIAL`, deploy layer `DEPLOY_UNKNOWN`, "workflow blocking failures: 1"); `live-site-smoke` success at 22:58:40Z and 00:06:35Z (during the outage).
- PR #523 diff: 956 lines, 11 files — reproduce with `gh pr diff 523`.

### 12.4 Neon control plane (MEASURED (audit) — read-only MCP `list_branch_computes` on `hidden-mountain-87248164` ONLY; no SQL was executed in this audit)

- `ep-cold-waterfall-adno3ao2`: `current_state: active`, `started_at: 2026-07-16T18:16:13Z`, `last_active: 2026-07-17T00:38:30Z` → **zero suspends across the entire #523 window**.
- Config: 0.25/0.25 CU (min=max), `suspend_timeout_seconds: 0` (= platform default 300 s), pooler disabled.
- **No SQL queries were run by this audit.** All pg_stat numbers below are doc snapshots; their underlying queries (`pg_stat_user_tables`, `pg_stat_database`, WAL deltas) are recorded in ATTR/CHURN. `pg_stat_statements` is **not installed** (ATTR §8) — per-query attribution is impossible until it is.

### 12.5 Neon activity numbers (all MEASURED (doc) unless noted — snapshots of 2026-07-14 (ATTR/CHURN) and 2026-07-16 (STOR-16); not re-run in this audit)

| Number | Value | Basis |
|---|---|---|
| Cumulative tuples returned since stats reset 2025-12-09 | 17.13B | pg_stat, ATTR §8 |
| Cumulative tuples updated | 4.97M | pg_stat, ATTR §8 |
| `listing_media` seq-scan share | **13.7B ≈ 188,503 seq scans × ~73K avg rows** | pg_stat, ATTR §8 — EXTRAPOLATED product of two measured factors |
| Seq-scan attribution to cron (not visitors) | 44-min no-cron window: `seq_scan +0`, `idx_scan +115`, `tup_returned +241,425` | controlled observation, ATTR Rev 2 — MEASURED (doc) |
| Pre-#511 uncached listing-page hits | ~1,978/day, all `cache=MISS` | log sampling, ATTR §7 |
| Homepage fan-out | ~1,918 visits/day × 5–13 queries | ATTR §6 |
| listing_media daily updates | ~14,850/day (one observed run: 879 checked = 879 updated, skipped 0) | pg_stat daily delta + run log, CHURN §4/§⓪B |
| listings daily updates | ~6,170/day | pg_stat daily delta, CHURN |
| WAL generation | **~82 MB/day** | pg_stat WAL delta between dated snapshots, CHURN §⓪B — MEASURED (doc) |
| Rewrite ratios | listings 59.2×; listing_media 10.9×; projection 12.0× | n_tup_upd ÷ live rows, CHURN §⓪B — EXTRAPOLATED from measured counts |
| Cron active-time floor | **~6–8 h/day — ESTIMATED** (48 idx-sync runs + 24 media-sync runs × ~5–8 min awake incl. ~5-min suspend tail; not directly measured) | ATTR Rev 2 |
| audit_events growth | ~210 rows (~135 KB)/day; 53% of table = dead 2026-05/06 incident | STOR-16 |
| Storage | ~545 MB total; listings TOAST (`raw_data`) 102–108 MB | STOR-16 / RECLAIM-08 |
| #523-window read reduction | **NO DATA — no instrumentation brackets 22:20→00:23; claim of any savings would be UNVERIFIED. Bill effect: zero (compute never suspended, §12.4)** | this audit |

### 12.6 Formulas

- **≥15,600 avoidable writes/day:** ~650 media-row updates per media-sync run × 24 hourly runs ≈ 15,600, cross-checked against the ~14,850/day pg_stat delta; "~100% no-op" from CHURN §10's finding that Cotality re-stamps `photos_change` without image changes (observed run: 879/879 rewritten, 0 skipped). **EXTRAPOLATED** from measured per-run/daily deltas; the no-op *fraction* is analysis, verifiable by PR D's `skipped_unchanged` counter.
- **~82 MB WAL/day:** WAL bytes delta between dated pg_stat snapshots ÷ days elapsed (CHURN §⓪B). **MEASURED (doc)**, single interval — not a long-run average.
- **13.7B scan tuples:** 188,503 × ~73,000 (both factors from pg_stat_user_tables cumulative counters). **EXTRAPOLATED product; cumulative since 2025-12-09, not per-day.**
- **~1 h 59 m outage:** first error 22:24:38 → last error 00:23:17 (§12.2). **MEASURED (audit).**

### 12.7 The four unconditional-write call paths (source-verified in CHURN §5)

1. `lib/idx/sync.ts:520-583` — idx-sync `listing.upsert` update arm; `raw_data` written unconditionally at `:573`.
2. `lib/idx/sync.ts:589-622` + `lib/search/listing-search-projection.ts:401-448` — projection dual-write, no change detection.
3. `lib/idx/media-sync.ts:551-652` — `upsertListingMedia`, never compares `media_modification_ts` before writing.
4. `lib/idx/media-sync.ts:830-858` — media summary write; its own docstring notes it "writes the same values both times".

### 12.8 Cron jobs responsible for the `listing_media` seq scans (ATTR §8 / Rev 2)

- **`/api/cron/media-sync`** (hourly per current `vercel.json`): the R2-backlog query (`r2_key IS NULL AND r2_attempts < 8`) and the media-coverage query (`media_url_cached IS NULL`) — both Parallel Seq Scans over ~296K rows, **no supporting index**. This cron is the origin of the 13.7B-tuple pattern.
- `/api/cron/idx-sync` (`*/30`) writes `listing_media` JSON but is not the seq-scan source.
- Context: `vercel.json` currently schedules 22 crons; `db-keepalive` has been removed from the schedule (CHURN §3); `rotate-db-keys` remains disabled and must stay so (NEON.md).

### 12.9 CI/Preview environment facts (MEASURED (audit))

- `pr-check.yml:26-31`: CI env has `DATABASE_URL`/`DATABASE_URL_UNPOOLED` stubs only — **no `UPSTASH_*`** → `lib/redis.ts:18-25` exports `null` in CI.
- `vercel env ls`: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` scoped **Development + Preview + Production** (set ~124 days prior) — Preview had live Redis credentials.
- `grep -c "/listing/" scripts/validate-live-site.js` = **0** — the production smoke never touches a listing detail page.
- `grep -rn "generateStaticParams" app/listing/` → no matches; `app/listing/[...slug]/page.tsx:57-58` declares only `revalidate = 300` and `maxDuration = 60`; `next.config.js:18-50` has no PPR/cacheComponents/experimental flags.

---

*Audit executed 2026-07-17 00:25–00:55Z; corrections applied 2026-07-17 per Maya's review. Forensic inputs: 3 parallel read-only agents (PR-523 diff/call-graph; Next.js 16 mechanics + CI/Preview gap; Neon attribution docs + live control-plane read) plus direct Vercel/GitHub/live-URL evidence gathered inline. No production, Neon, Redis, env, cron, or schema state was modified.*
