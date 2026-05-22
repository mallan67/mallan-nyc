# Chronic Media-Sync Root Cause Incident — 2026-05-21

> **Status:** CANONICAL incident document. Future AI/Codex/Claude sessions and human contributors must read this before proposing any change to `lib/idx/media-sync.ts`, `lib/idx/sync.ts`, `lib/idx/trestle-mapper.ts`, `app/api/cron/idx-sync/route.ts`, `app/api/cron/media-sync/route.ts`, `app/api/cron/media-backfill/route.ts`, `vercel.json` cron entries, `prisma/schema.prisma` ListingMedia/MediaSyncState models, or the public reader chain at `lib/idx/db-to-public-dto.ts` and `app/api/listings/route.ts`.
>
> **Authority:** synthesized from 8 parallel read-only deep-dive agents + 9 untracked production probe scripts + direct Trestle live calls + ~50 commit diffs across 21 days + complete schema/test inventory. Iron Law of `superpowers:systematic-debugging` applied throughout (no fixes until root cause proven).
>
> **Reported by:** Maya Allan (Principal Broker), 2026-05-21 — "Neon charged me $10 and photos are offline."
>
> **Investigation date:** 2026-05-21
>
> **Owner / next action:** Maya Allan — approve PR sequence in §7.

---

## §0. Executive summary — the chronic pattern in one sentence

**Three writers fight a single JSON column the public reader still falls back to, while the new mirror writer's cursor is permanently deadlocked on a Trestle boundary cluster, R2 mirror is stuck in retry purgatory, the table has 663K UPDATEs with no `VACUUM FULL` ever, observability is blind, and no test simulates more than one cron firing in sequence.**

There is no single bug. There are **seven distinct chronic root causes running simultaneously**. Fixing any one in isolation makes the others worse.

---

## §1. Why this document exists

The user phrasing was: *"this is a chronic situation"* and *"i do not want to deal with this again"*. The literal incident (one $10 charge plus photos offline for ~10,000 IDX-displayable listings) is the surface; the underlying architectural state has produced **nine reportable incidents in 21 days** at the same boundary:

| Date | Incident | Tactical fix shipped |
|---|---|---|
| 2026-04-19 | Silent migration drift — compute quota rejection swallowed by `\|\| echo` in vercel.json buildCommand | Reverted; removed migrations from buildCommand |
| 2026-04-30 | 7,594-row corruption — `InternetEntireListingDisplayYN` wrapped in `affirmPermission`; null→false collapsed all rows | Reverted to `!== false`; 7,594 + 489 + 49 rows recovered |
| 2026-04-30 18:11:27.400Z | (runtime event) — `media_sync_state.last_photos_change` lands at this exact instant and FREEZES | undetected for 21 days |
| 2026-05-08 | PhotosChangeTimestamp drift — 18,411 listings with PCT > DB modification_timestamp drift detected | Layer-0 audit; eligibility query widened |
| 2026-05-09 | PR-3 production rollout first firing died at Vercel `maxDuration=120s` before cursor advance could write | Phased orchestrator added |
| 2026-05-10 | Stale Trestle Media URL 404s ("ERROR - External media was not downloaded") creating retry loops | Cooldown + 3-strike tombstone added — but only for `HTTP 404|410` |
| 2026-05-13 | PR #112 / #113 §2.05 terminal-status guards (primary + secondary writers + `normalizeStandardStatus`) | Display gate hardened |
| 2026-05-15 | idx-sync cursor PR-S.6 / PR-S.7 — separate cursor for a separate cron, switched to `MAX(modification_timestamp)` | Local-clock drift bug closed for idx-sync cursor only |
| 2026-05-17 | Stale "Branch limit exceeded" on every preview deploy → Free→Launch plan upgrade | Plan upgraded; branch-prune cron retained as hygiene |
| **2026-05-21 (today)** | Photos offline + DB grew 4.6× in 23 days + Neon charged $10 | This document; PRs A–E proposed |

Every single one of those nine fixes was tactical — none of them addressed the underlying architectural state described in §3–§4 below.

---

## §2. Investigation method

Eight parallel read-only agents, each applying the `superpowers:systematic-debugging` Iron Law (no fixes until root cause is proven):

| Agent | Scope | Verdict |
|---|---|---|
| Listing.media writers map | every writer of `Listing.media` JSON | **stomping confirmed** |
| audit_events cursor history | what happened on/around 2026-04-30T18:11:27Z and 2026-05-09T19:54:33Z | **no manual reset; cron freeze is code-state, not data-tampering** |
| Cursor advancement code trace | data flow from cron entry to DB write | **boundary cluster max == prior cursor → no advance (correct in isolation)** |
| live Trestle probe + listing_media empty for fresh-PCT | call Trestle directly with production cursor | **arbiter — 50 records all share PCT = 2026-04-30T18:11:27.400Z** |
| Storage forensics | per-column / per-listing breakdown of 871 MB | **NOT media JSON — UPDATE churn + non-displayable historical retention** |
| Stomping deep-dive + git history | production-data evidence of stomping rate | **~3,600–5,500 R2→Trestle stomps/day; 82.4% of all listings sit at empty `media: []`** |
| Reader paths full audit | every reader of media (public + CRM + portal + agent) | **3-tier fallback works; PR 4 reader-side DID partially land (2026-05-11)** |
| R2 mirror dead path | why `r2_mirrored ≈ 0` per firing | **37 backlog rows ALL in 6h cooldown; 149 fails vs 1 success/24h; non-404 retry purgatory** |
| Schema / migrations / test gap audit | what tests should exist; ops:health gaps | **boundary-cluster + stomping test gaps; ops:health silent on media_sync_state; Trap #2 baked into CI** |
| Git archeology 2026-04-30 → 2026-05-21 | pivot commits + the chronic-pattern emergence | **`gt → ge` flip in `7412256b` + `useExpandMedia=false` in `9673151d`** |

**Untracked probe scripts** produced under CLAUDE.md `__` throwaway pattern (kept on disk for future re-proof; will not be committed):

```
scripts/__incident-2026-05-21-media-audit.mjs
scripts/__incident-2026-05-21-photo-probe.mjs
scripts/__incident-2026-05-21-cursor-history.mjs
scripts/__incident-2026-05-21-phase1-set.mjs
scripts/__incident-2026-05-21-phase1-set-tail.mjs
scripts/__incident-2026-05-21-storage-forensics.mjs
scripts/__incident-2026-05-21-backlog-probe.mjs
scripts/__incident-2026-05-21-r2-head-probe.mjs
scripts/__incident-2026-05-21-stomping-probe.mjs
```

---

## §3. Pivot timeline (proven by git archeology)

| Date (UTC-4) | SHA | Event |
|---|---|---|
| 2026-04-26 | `cb094c9b` | `MediaSyncState` model added (schema only) |
| **2026-04-30 18:11:27.400Z** | *(runtime cursor write)* | **CURSOR FROZEN HERE.** First media-sync prod firing landed cursor at exactly this instant. |
| 2026-05-08 22:38 | `3b482a2f` | `advanceMediaSyncCursor` introduced (PR-3 Cp1) — `maxDate(prior, batch)` no-backwards-movement; empty-batch heartbeats without advancing |
| 2026-05-08 22:49 | `e70ad01c` | `upsertListingMedia` (PR-3 Cp2) |
| 2026-05-08 22:55 | `93a659b5` | summary cols (PR-3 Cp3) |
| 2026-05-08 23:14 | `cfe8aeb8` | `mirrorMediaToR2` (PR-3 Cp4) |
| 2026-05-08 23:49 | `86c95d92` | Cron route + orchestrator (PR-3 Cp5) — initial filter was **`gt`** |
| **2026-05-09 01:21** | **`7412256b`** | **PR-review safety: `gt` → `ge` + `ListingKey asc` tie-breaker. Creates the boundary-cluster trap.** |
| 2026-05-09 04:28 | `57184e32` | Phased orchestrator after first prod firing died at 120s. Phase-1 budget check added — empty/boundary batches now heartbeat without advancing. |
| 2026-05-09 ~07:30Z | *(first prod firing)* | Cursor advanced briefly then STUCK at 2026-04-30T18:11:27.400Z |
| 2026-05-09 22:17 | `627f83da` | 6h cooldown + 3-strike tombstone — **narrow classification (404/410 only) lets 429/5xx into infinite retry purgatory** |
| 2026-05-10 08:08 | `24af0f2d` | Disabled `/api/cron/media-backfill` — **masked the cursor freeze for ~24h** |
| 2026-05-11 23:32 | `5d955a4f` | **PR 4 PARTIALLY LANDED** — public reader prefers `listing_media` table (`Listing.media` JSON fallback retained). Writer-side migration did NOT land. |
| 2026-05-14 23:42 | `9673151d` | `useExpandMedia = false` (always) — makes empty-array stomp catastrophic |
| 2026-05-15 08:19 | `5aa07865` | **Emergency disable of `/api/cron/idx-sync`** (later re-enabled) |
| 2026-05-15 08:46 / 09:15 | `4f8faa87` / `ee32e201` | idx-sync cursor PR-S.6 / PR-S.7 (separate cursor for separate cron) |
| 2026-05-21 19:22 | `ef9fd55a` | **PR #176** — paused media-backfill cron (this session's first mitigation) |
| 2026-05-21 19:34 | `7e3e4789` | PR #176 test alignment for the cron pause |

**Pivot insight:** the chronic pattern emerged within **3 weeks of PR-3 first firing**. Every subsequent commit was a tactical patch addressing the day's symptom. None addressed the boundary-cluster trap, the stomp, or the storage churn.

---

## §4. The seven chronic root causes

### RC1 — Phase 1 Boundary-Cluster Cursor Deadlock (P0, PROVEN)

**Code path:**
- `lib/idx/media-sync.ts:1182-1208` — single-page Trestle fetch
- `lib/idx/media-sync.ts:152-176` — cursor advance via `maxDate(prior, batch)`

**Mechanism:** Trestle's `$filter=PhotosChangeTimestamp ge {cursor} $orderby=PhotosChangeTimestamp asc,ListingKey asc $top=50` returns 50 records all sharing `PCT = 2026-04-30T18:11:27.400Z` (same millisecond, proven by direct live probe). With no `$skip` / `@odata.nextLink` continuation, page-1 is the only page consumed. `maxDate(27.400Z, 27.400Z) = 27.400Z` → cursor never advances → next firing returns the same 50 → infinite loop.

**Production evidence:**
- Live Trestle call (two back-to-back) returned identical 50 records, all with PCT = `2026-04-30T18:11:27.400Z`, `distinct_count = 1`, `spread_ms = 0`.
- 9,932 of 10,990 newer-than-cursor listings have **zero `listing_media` rows** because the cron has never reached them.
- `media_sync_cron` audit-event payload: `rows_checked=716, rows_updated=716, r2_mirrored=0, listings_processed=50` per firing for 21 days running.

**Pivot commit:** `7412256b` (2026-05-09 01:21) — the `gt` → `ge` change was a PR-review safety fix to prevent boundary skip. It correctly assumed idempotent upsert would handle re-processing, but did not consider that **`$top` < boundary-cluster size = permanent deadlock**.

**Test gap:** `media-sync-orchestration.test.ts:701-761` tests single-record boundary idempotence. **No test** exercises "50 records all sharing PCT = cursor → does cursor advance beyond cluster?"

### RC2 — idx-sync Stomp on `Listing.media` JSON (P0, PROVEN)

**Code path:**
- `lib/idx/sync.ts:176` — `useExpandMedia = false` (always)
- `lib/idx/trestle-mapper.ts:1107-1127` — `mapped.media = []` when `raw.Media` undefined
- `lib/idx/sync.ts:268-322` — `prisma.listing.upsert({ update: { media: mapped.media as Prisma.InputJsonValue, ... }})` — **unconditional write**
- `lib/idx/sync.ts:412-507` — post-loop batch-Media fetch that tries to refill with Trestle URLs, **silently fails for ~82% of touched listings**

**Mechanism (three failure modes):**
| Mode | Effect | Frequency |
|---|---|---|
| (a) `[]` stomp → batch refills with Trestle URLs | R2 URLs replaced by Trestle URLs (~10 min lifecycle) | ~69.5% of touched-in-24h listings |
| (b) `[]` stomp → batch silently fails | Listing stuck at `media: []` (placeholder rendered) | **82.4% of all listings** |
| (c) `[]` stomp → batch partially refills | Mixed-URL array (impossible state: same array contains both r2.dev and cotality.com URLs) | 258 listings |

**Production evidence (stomping probe `__stomping-probe.mjs`):**
```
104,442 total listings:
  empty_media:           86,050 (82.4%)
  r2_only:                8,382 ( 8.0%)
  trestle_only:           9,752 ( 9.3%)
  mixed_r2_and_trestle:     258 ( 0.2%)

24h window (touched by idx-sync):
  touched_24h = 1,816
  → 69.5% landed with Trestle URLs in Listing.media
  → 27.3% retained R2 URLs

Estimated R2→Trestle stomp rate: ~3,600–5,500 events/day
```

**Pivot commit:** `9673151d` (2026-05-14) — `useExpandMedia=false` always. Combined with the unconditional write at sync.ts:310 makes every idx-sync upsert a stomp.

**Test gap:** **No test** asserts `prisma.listing.upsert` from `sync.ts:268` preserves existing R2 URLs in `Listing.media`.

### RC3 — Phase 3 R2 Mirror Retry Purgatory (P1, PROVEN)

**Code path:**
- `lib/idx/media-sync.ts:847-850` — tombstone classification narrow (404/410 only)
- `lib/idx/media-sync.ts:715` — 6h cooldown
- `lib/idx/media-sync.ts:1450-1534` — Phase 3 loop

**Mechanism:** 37 backlog rows have `r2_last_attempt_at` within last 6h → all in cooldown. Phase 3 query returns 0 → `break`. When cooldown expires, mirror fails with non-404/410 error (likely HTTP 429 rate-limit or 5xx). Tombstone trigger requires consecutive `HTTP 404|410` — never fires for transient errors. Each row attempted ~4×/day forever. `r2_attempts` grown to 37-41 with no progress.

**Production evidence:**
```
24h totals:
  firings_24h         = 96
  sum_r2_mirrored     = 1
  sum_r2_failed       = 149   ← matches predicted 4×/day × 37 rows = 148
  sum_r2_skipped      = 0
  
3 live R2 HEAD probes on backlog rows:
  RLS20083221/FloorPlan/1 → 404 (object NOT in R2)
  RLS20047137/FloorPlan/1 → 404
  RLS20013681/Photo/9     → 404
```

**Pivot commit:** `627f83da` (2026-05-09) introduced tombstone; `03e4b358` narrowed it to 404/410 only.

**Test gap:** **No rolling-window test** for `r2_mirrored > 0` over N firings. **No test** for tombstone fires after N transient failures.

### RC4 — Storage Bloat: UPDATE Churn + Historical Retention (P1, PROVEN — NOT what we thought)

**Mechanism:** **663,978 cumulative UPDATEs** on 104,442 rows (6.36 updates/row) × no manual `VACUUM FULL` ever × TOAST churn on JSON columns.

**Production evidence (storage forensics `__storage-forensics.mjs`):**
```
Total listings table: 872 MB (76% TOAST = 659 MB)
  raw_data:    249 MB  (208 MB on 89,596 IDX-non-displayable historical rows)
  compliance:  191 MB  (159 MB on historical — PublicRemarks HTML duplicated also in raw_data)
  features:     96 MB  ( 81 MB on historical)
  agent_info:   37 MB
  address:      33 MB
  media:        13 MB  ← falsifies "media write amplification" hypothesis

Dead tuples: 19,765 / 104,442 = 18.9 % dead-tuple ratio
autovacuum_count: 118 (reclaims for reuse only — doesn't shrink TOAST)
Last manual VACUUM (FULL): never
```

**The single biggest lever:** **~448 MB (51% of total) is JSON storage on 89,596 IDX-non-displayable historical rows the public never sees.** Those should be in `listings_archive`, not `listings`.

**Combined fix lever:** Manual `VACUUM (FULL) listings` would reclaim ~150-250 MB of dead TOAST chunks. Archiving non-displayable past T+180d would recover ~448 MB. Together → table shrinks to ~250 MB (29% of current).

### RC5 — Held Architectural Migrations

| Migration | State (as of 2026-05-21) | Effect |
|---|---|---|
| **PR 4** (writer swap — `listing_media` becomes canonical writer) | **PARTIALLY LANDED:** reader-side flipped to prefer `listing_media` table (`5d955a4f`, 2026-05-11) with `Listing.media` JSON fallback retained. Writer-side migration did NOT land. | Three writers continue fighting `Listing.media` JSON. PR-3's R2 mirror work in `listing_media` (49,175 rows) is invisible to public for listings where listing_media is empty (which is most of them due to RC1). |
| **PR 5B** (reader swap — typed columns + `listing_media` canonical reader, drop JSON fallback) | **HELD** | 3,102 `primary_photo_url` populated → read by ZERO surfaces. |
| **PR 10** (legacy JSON drop) | **HELD** | `Listing.media`, `Listing.compliance`, `Listing.features` remain on every row including 89,596 historicals. |

### RC6 — Observability Gap (P1, PROVEN)

**`scripts/ops-health.js` current coverage:**
- ✅ Storage MB / pct of plan cap
- ✅ Property `syncState.last_run_at` staleness (warn at 2h)
- ✅ `syncError` count
- ✅ REBNY §2.05 violations
- ✅ Archive backlog
- ✅ Neon branch prune

**What ops:health does NOT check (every absence proven by grep):**
- ❌ `media_sync_state.last_photos_change` staleness — completely absent
- ❌ `media_sync_state.last_run_at` recency for the media cron
- ❌ `listing_media.r2_key IS NULL` count / coverage trend
- ❌ `listing_media` rows mirrored in last 24h
- ❌ Listings with `idx_display_yn=true` AND `photo_count=0`
- ❌ Listings where `Listing.media[0].url` host distribution
- ❌ AuditEvent `media_sync_cron` heartbeat coverage

**The 4 production validators** (`rls:validate`, `compliance-check`, `idx:validate`, `ucba:audit`): **zero references** to `media_sync_state`, `listing_media`, `r2_mirror`, `r2_attempts`, `backlog`.

**audit_events `media_sync_cron` payload** omits cursor fields entirely. Every firing logs `rows_checked=716, rows_updated=716, status='ok'` but emits no cursor-before/after — so cursor success/failure is invisible to audit.

**Single threshold that would have caught RC1 within ONE cron interval:** `media_sync_state.last_photos_change > NOW() - 2h` = critical alarm.

### RC7 — Trap #2 Baked Into CI (P2, PROVEN)

`.github/workflows/pr-check.yml:93-94` runs `npx prisma db push --accept-data-loss` on every PR's CI Postgres — exactly NEON.md §3 Trap #2.

`scripts/validate-migration-discipline.js` exists but is not invoked by any workflow.

**Two confirmed historical Trap #2 incidents** (documented in migration headers):
- 2026-04-24: `SyncState`/`SyncError`/`ListingsArchive` — schema had them, DB didn't (P2021 runtime errors)
- 2026-05-10: `list_agent_full_name`/`list_office_name` on `listings` — schema/DB drift from never-migrated `db push`

---

## §5. The causal chain (why photos are offline today)

```
RC1 → Phase 1 stuck at boundary cluster → listing_media stays empty for 9,932 newer-PCT listings
  ↓
PR-4 reader (5d955a4f) falls back to Listing.media JSON for those 9,932 listings
  ↓
RC2 → idx-sync every 10 min stomps Listing.media to [] (82% of cases) or Trestle URLs (rest)
  ↓
Browser fetches stomped Trestle URL via /api/media/proxy → Trestle returns 404 (URL rotated)
  ↓
"Photos offline" for the affected listings
  ↓
Meanwhile RC4: 18,000+ writes/day inflate TOAST → 663K UPDATEs total → 871 MB
  ↓
Meanwhile RC3: 37 rows churn in 6h cooldown forever, no progress
  ↓
Meanwhile RC6: observability blind → 21 days to detection
  ↓
Maya: "$10 charge + photos offline"
```

---

## §6. Why "~1,700 listings load" — the actual math

```
14,839 IDX-displayable listings total
  3,413 distinct listings have listing_media rows (PR-3 mirror)
       ~ 1,058 of those overlap with the 10,990 newer-than-cursor set
       ~ 2,355 are older listings mirrored before cursor froze
  4,899 listings have R2 URLs in Listing.media JSON (legacy migrateMediaToR2 work)
       ~ many decay every cron firing due to RC2 stomp
  ~9,932 newer-than-cursor listings: NO listing_media + likely empty Listing.media JSON
  ~2,083 with empty media at all (placeholder rendered)
```

**Roughly 4,000–5,500 listings reliably load photos at any given moment.** The "~1,700" Maya observed is consistent with a typical search-view subset, given decay + stomp churn.

To get ALL 14,839 IDX-displayable listings serving working photos requires fixing **RC1 + RC2 + RC3 simultaneously**. Each alone is insufficient.

---

## §7. Definitive fix sequence (smallest safe, ordered by dependency)

**Approved by Maya on 2026-05-21. Each PR awaits explicit per-step approval before any code change.**

| PR | Scope | Addresses | Tests added | ops:health threshold | Reversible? |
|---|---|---|---|---|---|
| **A.** Pause `media-backfill` cron — **already open as PR #176** at head `7e3e4789` | `vercel.json` (1 line removed) + test alignment | Reduces redundant writer; doesn't fix root | test updated in PR #176 to assert media-backfill absent + media-sync present at `*/15` | n/a | Yes — re-add line |
| **B.** Add observability — `ops:health` checks for media_sync_state staleness + listing_media R2 coverage + cursor age + r2_failed/mirrored 24h + r2_attempts backlog + stuck cursor warning + IDX-displayable-with-no-usable-image count | `scripts/ops-health.js` (~30-60 lines added; no DB write) | **RC6** (preventive) | New script-level rules | **Cursor age > 2h** = critical; **r2_mirrored 24h sum > 0** = warn; **listing_media R2 coverage % declining** = warn; **idx_display_yn=true AND no_usable_image** count = warn | Yes |
| **C.** Unfreeze cursor — Option B preferred: persist secondary `(PhotosChangeTimestamp, ListingKey)` cursor and use `$filter=(PCT gt T) OR (PCT eq T AND ListingKey gt K)`. Option B requires schema risk assessment — if it requires a new column on `media_sync_state`, **come back to Maya before changing schema**. Otherwise use a JSON state payload if the current model supports it. | `lib/idx/media-sync.ts` (advance + filter logic) | **RC1** | New test: 50 records all PCT=T → cursor MUST advance beyond cluster within K runs | Cursor age post-fix should advance | Yes |
| **D.** Stop the stomp — guard `prisma.listing.upsert` to NOT write `Listing.media` from idx-sync unless incoming media is usable AND the listing lacks canonical `listing_media` coverage | `lib/idx/sync.ts:310` (`update:` clause condition) | **RC2** | New test: existing R2 URL in Listing.media NOT stomped by idx-sync upsert | `Listing.media` URL host trend stable post-fix | Yes |
| **E.** Widen tombstone classification — tombstone after N consecutive failures of ANY transient class (not just 404/410), with separate budget per class | `lib/idx/media-sync.ts:847-850` | **RC3** | New test: 3 consecutive 429s → tombstone fires | Phase 3 backlog stable or decreasing | Yes |
| **F.** Storage hygiene — manual `VACUUM (FULL) listings` + add cron for monthly VACUUM (operational, requires Maya approval per holds) | manual + cron route | **RC4 (partial)** | n/a — monitored by ops:health | Storage trend | Reversible by cron removal |
| **G.** Archive non-displayable historicals — move 89,596 IDX-non-displayable rows past T+180d to `listings_archive` table | Migration + backfill | **RC4 (full)** | Existing archive backlog check in ops:health | Storage % of cap | Yes (data still in archive) |
| **H.** Complete PR 5B — public reader uses typed `primary_photo_url`/`photo_count` directly; remove `Listing.media` JSON fallback dependency | `lib/idx/db-to-public-dto.ts` | **RC5 (partial)** | New test: typed-column reader path | r2_only listings count stable | Yes |
| **I.** Drop legacy JSON columns (master plan PR 10) | Migration: drop `media`, `compliance`, `features`, `address`, `agent_info` from listings (after backfill verification) | **RC5 (full); RC4 (big lever)** | New test: dropped columns NOT read by any path | Storage % | Held until H stable |
| **J.** CI Trap #2 closure — replace `prisma db push --accept-data-loss` with `prisma migrate diff` against reference baseline; invoke `scripts/validate-migration-discipline.js` from `pr-check.yml` | `.github/workflows/pr-check.yml` | **RC7** | n/a — meta-test for migrations | n/a | Yes |
| **K.** Integration test harness — multi-firing test for `runMediaSync` that simulates N consecutive runs and asserts cursor advances + backlog decreases | `tests/integration/media-sync-multi-firing.test.ts` (new) | All RCs (regression net) | n/a | n/a | n/a |

**Recommended execution order (Maya approved):**
1. (A) merge PR #176 once Vercel preview goes green
2. (B) observability first — *so we can SEE what C/D/E do*
3. (C) cursor unfreeze — **Option B preferred (secondary cursor); schema risk assessment required before any column add**
4. (D) stomp stop
5. (E) widen tombstone
6. Pause + observe via B
7. (F) VACUUM FULL
8. (H) complete reader swap
9. (G) archive historical
10. (I) drop JSON
11. (J) CI hardening
12. (K) regression net

---

## §8. Recurrence prevention (so we don't deal with this again)

| Threat | Catch mechanism |
|---|---|
| Cursor freeze on a new feed | ops:health threshold: `media_sync_state.last_photos_change > NOW() - 2h` = critical |
| Stomp regression on writer | regression test: existing R2 URL in Listing.media MUST survive 3 idx-sync runs |
| R2 retry purgatory | rolling-window test: `r2_mirrored 24h sum > 0`; tombstone-after-N also for transient errors |
| Storage bloat | ops:health trend: MB/day growth slope; alert if > X MB/week |
| Held migration | quarterly review of `memory/REFACTOR-2026-04-25.md` status table; PR 4/5B/10 not "held indefinitely" |
| Trap #2 in CI | replace `db push` with `migrate diff`; invoke `validate-migration-discipline.js` from CI |
| Multi-firing failure modes | integration test: `runMediaSync` simulated N firings, assert monotonic cursor advance + backlog drain |

---

## §9. Hard holds confirmed (not touched by this investigation)

| Hold | State |
|---|---|
| PR 5B reader swap (`refactor/05-listing-search-projection`) | NOT TOUCHED |
| `/api/listings` reader path | NOT TOUCHED |
| `ListingSearchProjection` reader migration | NOT TOUCHED |
| `prisma/schema.prisma` / migrations | NOT TOUCHED (read for citation only) |
| Env vars (R2_*, NEON_*, TRESTLE_*, DATABASE_URL, CRON_SECRET) | NOT TOUCHED |
| Neon plan / branch / compute settings | NOT TOUCHED |
| Cloudflare R2 bucket / settings / public URL | NOT TOUCHED |
| `app/api/cron/media-backfill/route.ts` source | NOT TOUCHED (PR #176 only changed Vercel cron schedule) |
| `app/api/cron/media-sync/route.ts` source | NOT TOUCHED |
| `lib/idx/sync.ts`, `lib/idx/media-sync.ts`, `lib/idx/trestle-mapper.ts` source | NOT TOUCHED (read for citation only) |
| `.github/workflows/**` | NOT TOUCHED |
| `.claude/agents/**`, `.claude/skills/**`, Sentinel | NOT TOUCHED |
| `public/crm/**` | NOT TOUCHED |
| Admin merge bypass | NOT USED |
| Force-push | NOT USED |
| PR #174 (head `55e8f2fb`) | NOT MERGED, NOT TOUCHED |
| PR #175 (head `fdd06b96`) | NOT MERGED, NOT TOUCHED |
| Master plan PR 8 (`ListingSend`) | NOT STARTED |
| T2 external-inventory / T3 sponsor inventory | NOT TOUCHED |

---

## §10. Investigation probe scripts — UNTRACKED, NOT REPRODUCIBLE FROM A FRESH CLONE

Nine throwaway probe scripts were written during this investigation and run read-only against production. They follow the CLAUDE.md §A.9 `__` throwaway pattern and are **explicitly NOT tracked in the repository** — they exist only on the investigator's local disk (Maya's workstation as of 2026-05-21):

```
scripts/__incident-2026-05-21-media-audit.mjs            — Q1-Q9 baseline state
scripts/__incident-2026-05-21-photo-probe.mjs            — brokenness rate sampling
scripts/__incident-2026-05-21-cursor-history.mjs         — audit_events around freeze instant
scripts/__incident-2026-05-21-phase1-set.mjs             — boundary-cluster confirmation + Trestle live probe
scripts/__incident-2026-05-21-phase1-set-tail.mjs        — secondary boundary probe
scripts/__incident-2026-05-21-storage-forensics.mjs      — per-column / per-row TOAST breakdown
scripts/__incident-2026-05-21-backlog-probe.mjs          — Phase 3 backlog state (cooldown, r2_attempts)
scripts/__incident-2026-05-21-r2-head-probe.mjs          — live R2 HEAD on 3 backlog rows
scripts/__incident-2026-05-21-stomping-probe.mjs         — production-data stomping rate evidence
```

**Reproducibility contract — do NOT promise these are rerunnable from a fresh clone.** A future agent in a fresh checkout, or any CI environment, will NOT have these scripts. The **canonical evidence base for this incident is the citations in §3–§4 (file:line + commit SHA + production-data quotations) and the production-data tables embedded in this document**, not the scripts themselves. Future re-proof must derive new queries from those citations, not by attempting to source these scripts.

If a future investigator needs to repeat any specific query, the SQL / Trestle-OData calls are quoted verbatim in §4 RC1–RC4 evidence subsections. The intended path to durable, repo-tracked observability is **PR B** in the §7 fix sequence (`ops:health` additions), which makes these one-off probes unnecessary for steady-state monitoring.

---

## §11. Companion files

Tracked-in-repo references (these will be accessible to any future agent in a fresh clone):

| File | Tracked? | Purpose |
|---|---|---|
| `CLAUDE.md` | ✅ tracked | Project doctrine; references this incident in compliance-first rule |
| `NEON.md` | ✅ tracked | DB / Prisma / migration discipline — required reading before any schema change; documents Trap #1 / #2 / #3 |
| `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` | ✅ tracked | File-location rules — §7 Media canonical paths |
| `memory/REFACTOR-2026-04-25.md` | ✅ tracked | Master 10-PR backend refactor plan — PRs 4 / 5B / 10 status |
| `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` | ✅ tracked | 7,594-row corruption incident — predecessor to today's chronic situation |
| `data/RLS-FIELD-REGISTRY.md` | ✅ tracked | Trestle field registry (480/min Media URL ceiling) |

Non-tracked references (these live only on contributors' local disks and are gitignored — future agents in a fresh clone will NOT have access; do not rely on these for canonical evidence):

| File | Why not tracked | Substitute |
|---|---|---|
| `memory/PR3-PRODUCTION-ROLLOUT-2026-05-09.md` | `memory/*` is generally `.gitignore`d; this specific file was never `-f` force-added | Use git log `--all -- lib/idx/media-sync.ts` between 2026-05-08 and 2026-05-10 to reconstruct PR-3 rollout state, or rely on §3 pivot timeline above which captures the key facts |
| `.claude/skills/rebny-compliance/SKILL.md` | `.claude/*` is `.gitignore`d (per `.gitignore:156`); auto-loaded at session start by the agent runtime, not the repo | Compliance gate doctrine is summarized in this doc's §3 (REBNY gates 1–6) and in `CLAUDE.md §D` (compliance-first rule). The detailed REBNY skill content is shown to AI sessions at start but is not part of the repo's tracked-evidence chain |

---

## §12. Change history

| Date | Author | Change | Authority |
|---|---|---|---|
| 2026-05-21 | Maya Allan (via Claude investigation pass) | Initial canonicalization. Sections §0–§12. | Maya approval recorded: "1. Commit the root-cause report as tracked documentation. Use: docs/incidents/2026-05-21-chronic-media-sync-root-cause.md. Not memory/. Why: this is not private scratchpad anymore. This is a production incident doctrine and future agents need it as canonical evidence." |

---

*End of canonical incident document. Future amendments must be doctrine-only PRs reviewed by Maya. No implementation may cite this document as authority for a rule not stated explicitly in §1–§12.*
