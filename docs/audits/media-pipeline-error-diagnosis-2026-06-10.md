# Media-Pipeline Error Diagnosis — 2026-06-10

> **Status:** read-only deep diagnostic. NO writes, no code changes, no commits, no cron triggers.
> **DB:** Neon `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main` — host fail-closed-guarded in every probe (refuses any other endpoint). Session forced `default_transaction_read_only = on`.
> **NEON.md read before any DB access.** All timestamps below are UTC (probes run with `TZ=UTC`; `timestamp without time zone` columns store UTC).
> **Probe scripts (untracked, `scripts/__` throwaway pattern, DO NOT COMMIT):**
> `scripts/__media-diag-2026-06-10.mjs` (+ `…-t0.out`), `scripts/__media-diag-2026-06-10-live.mjs` (+ `…-live.out`), `scripts/__media-diag-2026-06-10-batch-check.mjs`, `scripts/__media-diag-2026-06-10-ghosts.mjs`.
> **Method note (per CLAUDE.md §F):** every claim below is backed by a SQL result or a live Trestle probe captured in this doc; no claim rests on source-grep alone.

---

## 0. Executive summary

| Question | Verdict |
|---|---|
| RC1 catch-up health | **FROZEN — not draining.** Cursor stuck at `(2026-05-14T20:37:58.703Z, ListingKey 1107463938)` since **2026-06-09T06:15Z** (~40h at probe time). Root cause: **3 "ghost" listings at the head of the batch exist on the Trestle feed but NOT in our `listings` table** → `updateListingMediaSummary()`/FK insert throws every run → `pickKeysetWatermark` halts at position #1 → watermark `null` → cursor never moves. This is a **new RC1-introduced deadlock mode (Class A)**, distinct from the old same-timestamp cluster trap. |
| R2 failure burst | **Not a burst, not R2-side, not caused by RC3.** 100% of failures are Trestle-side fetches of `media_url_original` (`api.cotality.com`). The 77 backlog rows = **40 old poison rows** (attempts 43–112, parked by RC3 at 02:31Z — RC3 worked) + **37 rows from the 06-09 catch-up wave** (all at exactly 7 attempts, now returning HTTP 404 — they will tombstone or park on their next attempt). R2 upload path is healthy (13,141 mirrors succeeded on 06-09; runs with Phase-3 budget mirror with 0 failures). |
| EMPTY media growing | **Hypothesis (a) confirmed: new-listing starvation.** ~150 IDX-displayable listings/day arrive with `media='[]'` and ~90–100% stay empty (3,157 of the 10,674 EMPTY were created in the last 30 days). Over-tombstoning (b) **refuted** (66 deleted rows / 2 fully-tombstoned listings since 06-09). RC2 regression (c) — **no evidence** of JSON being emptied; growth is CREATE-side, not stomp-side. |
| Duplication / double storage | **Effectively none.** 12 excess duplicate rows out of ~82K active; 20 r2_keys shared by 2 rows; 0 URLs mirrored under two keys; **no bytea anywhere — zero image binaries in Neon**. M1 dual-write overlap (IDX-displayable): both=3,265 · JSON-only=1,928 · table-only=1,697 · neither=8,977. Duplicate JSON storage cost ≈ **2.8 MB** (trivial). |
| Most valuable next correction | **Unfreeze the keyset watermark: treat "listing absent from local `listings`" as a resolved skip (ok:true), not a halting failure.** One-file change in `lib/idx/media-sync.ts` Phase 1. Everything else (EMPTY count, R2 mirror throughput, M4 backlog) is downstream of the frozen cursor. |

---

## 1. Q1 — RC1 catch-up health: FROZEN, with proven root cause

### 1.1 Cursor state (two snapshots, 11+ minutes apart, with a cron run in between)

```sql
SELECT id, resource, last_photos_change, last_media_modified, last_listing_key,
       last_run_at, last_run_status, rows_checked, rows_updated, rows_failed,
       created_at, updated_at, now() AS db_now
FROM media_sync_state;
```

| field | t0 (db_now 21:41:57Z) | t1 (db_now 21:52:43Z) |
|---|---|---|
| `last_photos_change` | 2026-05-14T20:37:58.703Z | **2026-05-14T20:37:58.703Z (unchanged)** |
| `last_listing_key` | 1107463938 | **1107463938 (unchanged)** |
| `last_run_at` | 2026-06-10T21:31:26Z | 2026-06-10T21:31:26Z |
| `last_run_status` | partial | partial |
| `rows_checked / updated / failed` | 391 / 362 / 4 | 391 / 362 / 4 |

The cursor's tie-break key did not move either — so this is not slow same-timestamp progress; it is zero progress.

### 1.2 The cron is re-chewing the same 50-listing window since 06-09T06:15Z

`listing_media` rows created per day (Q8):

```sql
SELECT date(created_at) AS day, count(*) AS rows_created, count(DISTINCT listing_id) AS listings
FROM listing_media WHERE created_at > now() - interval '10 days' GROUP BY 1 ORDER BY 1;
-- 06-02: 86 rows / 10 listings   (pre-RC1 trickle)
-- 06-03: 8 / 1
-- 06-09: 13,220 rows / 906 listings   ← RC1 catch-up burst (cursor moved 05-06 → 05-14)
-- 06-10: 90 rows / 6 listings         ← catch-up DEAD all day
```

Live Trestle Property page fetched with the **exact** production keyset filter
(`(PhotosChangeTimestamp gt 2026-05-14T20:37:58.703Z or (PhotosChangeTimestamp eq … and ListingKey gt '1107463938')) and (StandardStatus eq 'Active' or … 'Pending') $orderby PhotosChangeTimestamp asc,ListingKey asc $top=50`)
returned 50 listings; DB cross-ref shows those same listings' `listing_media.updated_at = 2026-06-10T21:31:xx` (touched by the 21:31 run) with `created_at = 2026-06-09T06:15:xx` — i.e. **every run since 06-09T06:15Z has re-processed this identical window** (~155 runs × ~300–700 idempotent row updates = **~50–60K wasted `listing_media` UPDATEs in 40h** — pure `updated_at` churn, dead tuples, Neon compute).

### 1.3 Root cause — proven, Class A (static code path), with live-feed confirmation

Batch membership check (`scripts/__media-diag-2026-06-10-batch-check.mjs`):

```
# 1 RLS20014678  in_listings=** NO **  active_lm=0
# 2 RLS20018843  in_listings=** NO **  active_lm=0
# 3 RLS20030621  in_listings=** NO **  active_lm=0
# 4–46           in_listings=YES       active_lm=5–37   (all fetch Media fine live)
#47 RLS20083390  in_listings=YES — Trestle Media endpoint returns persistent HTTP 500 for this key
#48–50           in_listings=YES, fine
```

`SELECT … FROM listings_archive WHERE listing_id = ANY('{RLS20014678,RLS20018843,RLS20030621}')` → **[] — not archived either; never imported.**

Code path (`lib/idx/media-sync.ts`):
- For a feed listing absent from `listings`: `upsertListingMedia` inserts rows → **FK violation** (`listing_media.listing_id → listings.listing_id`), or for the 0-media case `updateListingMediaSummary` → `prisma.listing.update` → **P2025 record-not-found throw**.
- `runMediaSync` catches → `processed.push({ok:false})` (`rows_failed++`).
- `pickKeysetWatermark` (media-sync.ts:340-349): `if (!p.ok) break;` — **position #1 fails ⇒ loop breaks immediately ⇒ watermark = null ⇒ `advanceMediaSyncCursor` preserves the prior cursor** (by design, "never advance past a failure").
- Result: permanent deadlock. The Codex-#377-era design decision "halt the watermark at any failure" was correct for transient failures but is **fail-forever** for a persistent failure at the head of the window.

This also explains the steady `rows_failed = 3–5` per run: 3 ghosts every run + intermittent Trestle Media 500s (live probe reproduced one: `RLS20083390` → `HTTP 500 InternalServerError`, TraceId `81f304df-fb8c-4c49-9127-df3d60096d94`). `media_sync_cron` audit also shows `source_error` (Property fetch HTTP 500) 1× on 06-09, 3× on 06-10 — Trestle has been flaky, but flakiness is not the freeze cause; the ghosts are.

Note: the `failed=4` in the last ops:health-quoted run = the 3 ghost listings + 1 intermittent Media-fetch 500. There is **no per-row error detail persisted anywhere** (audit payload carries aggregates only; `listing_media` has no error column) — that is why this took a live probe to classify.

### 1.4 Backlog size and catch-up ETA

```sql
WITH cur AS (SELECT last_photos_change AS c FROM media_sync_state WHERE resource='Media')
SELECT count(*) AS total_pct_gt_cursor,
       count(*) FILTER (WHERE idx_display_yn) AS idx_displayable,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM listing_media lm
              WHERE lm.listing_id = listings.listing_id AND lm.status='active')) AS without_active_lm,
       count(*) FILTER (WHERE (raw_data->>'PhotosChangeTimestamp')::timestamptz < cur.c + interval '7 days')  AS within_7d_of_cursor,
       count(*) FILTER (WHERE (raw_data->>'PhotosChangeTimestamp')::timestamptz < cur.c + interval '14 days') AS within_14d_of_cursor
FROM listings, cur
WHERE NULLIF(raw_data->>'PhotosChangeTimestamp','') IS NOT NULL
  AND (raw_data->>'PhotosChangeTimestamp')::timestamptz > cur.c
  AND status IN ('Active','ActiveUnderContract','ComingSoon','Pending');
-- total_pct_gt_cursor = 11,822   (all idx-displayable)
-- without_active_lm   =  9,610   ← the photo-starved set the catch-up would fix
-- within 7d of cursor =  1,014 · within 14d = 2,058  (backlog is weighted toward recent days)
```

(DB-side estimate via `raw_data->>'PhotosChangeTimestamp'`, which idx-sync keeps fresh; the true Trestle-side count may differ slightly. Initial bucketed version of this query timed out at 60s — the single-pass version above ran at 300s timeout.)

Healthy drain rate, measured on the only healthy day (06-09 00:00–06:15Z): cursor advanced 8.1 feed-days and wrote rows for 906 listings in ~25 runs ⇒ **~45–50 listings/run ≈ 4,300–4,800/day** at `*/15` cadence (96 runs/day; in practice ~87–96 fire, occasionally double-fire — two runs 7s apart at 17:16:57/17:17:04Z show the 10-min concurrency guard can race).

**ETA: ~2.5–3 days to drain 11,822 once unfrozen** — *but only if no further ghost listings sit ahead of the cursor*. Every feed listing missing from `listings` is a fresh permanent freeze under current code, so the ETA is meaningless without the §5 correction. It is NOT stalling on a same-timestamp cluster (RC1's keyset works; the largest cluster in the window was paged through fine on 06-09).

---

## 2. Q2 — "R2 failure burst": classification and verdict

### 2.1 The 77-row backlog decomposes into two distinct populations

```sql
SELECT r2_attempts, count(*) AS rows, min(r2_last_attempt_at), max(r2_last_attempt_at),
       min(created_at), max(created_at)
FROM listing_media WHERE status='active' AND r2_attempts > 0 GROUP BY 1 ORDER BY 1;
```

| population | attempts | rows | row created | last attempted |
|---|---|---|---|---|
| **New (06-09 catch-up wave)** | exactly 7 | **37** | 2026-06-09T02:30–05:30Z | 2026-06-10T15:46–18:17Z (still cycling at 6h cooldown) |
| **Old poison set** | 43–44 | 7 | 2026-05-28/29 | 2026-06-10T02:30–02:31Z |
| **Old poison set (original)** | 107–112 | 33 | 2026-05-09/10 | 2026-06-09T23:15–2026-06-10T02:31Z |

`SELECT count(*) FROM listing_media WHERE status='active' AND r2_attempts >= 8` → **40 parked.**

**RC3 verdict: working as designed.** The 40 old rows' last attempt is 02:16–02:31Z on 06-10 — they stopped retrying exactly at the RC3 deploy (~03:00Z) because `buildR2BacklogWhere` now excludes `r2_attempts >= 8`. The ops:health reading "these are NEW failures AFTER RC3, not the old 40-row poison set" is **wrong for 40 of the 77**: `r2_attempts>0` includes parked rows. Only the 37 attempts=7 rows are new — and they pre-date RC3 (first failures during the 06-09 catch-up).

All 77: `media_url_original` host = `api.cotality.com` (100%); types: 42 Photo, 35 FloorPlan; spread across 39 listings (max concentrations: RLS10993358×13, RLS20015750×8, RLS11025259×7, RLS10939137×7).

### 2.2 Live classification (read-only GETs with production-equivalent headers)

```
RLS10939137 Photo#1/3/4, FloorPlan#1 (attempts=7):
  HTTP 404, content-type application/json,
  body {"code":"404","message":"ERROR - External media was not downloaded."}   ← the E8 signature
RLS20047137 FloorPlan#1 (attempts=112): HTTP 200, content-type **text/html** (27 KB SPA shell)
RLS20067773 FloorPlan#1 (attempts=112): HTTP 200, content-type **text/html**
RLS11030119 FloorPlan#1 (attempts=111): timed out (AbortError) — prod's 8s abort ⇒ `fetch_threw`
```

- **Old poison set (40):** Trestle answers `HTTP 200 text/html` or hangs ⇒ `non_image_content_type` / `fetch_threw` ⇒ never tombstone-eligible (correctly), retried forever pre-RC3, now parked. Their photos still serve via `media_url_original` proxy fallback only if Trestle ever serves them — effectively dead media, safely parked without deletion.
- **New 37:** currently plain `HTTP 404` ⇒ tombstone-eligible. They sit at 7 attempts WITHOUT having tombstoned at 3, which means their **earlier failures were a different class** (the 06-09 catch-up pushed ~13K mirrors through Phase 3 in hours — 429/5xx during that flood is the plausible early class; per-row reasons are not persisted, so this is inference, flagged as such). On their **next** attempt: 404 ⇒ tombstone (≥3 rule), transient ⇒ park (≥8 rule). Either way this population self-clears within one cooldown cycle.

### 2.3 The "70% failure rate" is a budget-starvation artifact, not an R2 problem

Hourly audit aggregates (Q2b, 72h — full table in §7) show:
- 06-09T00–06Z: r2_ok 362→2,956→2,576→2,249→2,108→1,835→1,035/hour (13,141 mirrored that day, `r2_fail` 439 ≈ 3% of attempts). **R2 upload/HEAD path demonstrably healthy.**
- After the cursor froze (06-09T06:15Z), nearly every run exits `budget_phase1` after ~46s of Phase-1 re-chewing ⇒ **Phase 3 gets no budget ⇒ r2_ok = 0 on most runs**. The rare `completed` runs mirror cleanly (21:01Z run: `r2_ok=53, r2_fail=0`; 01:01Z run: `r2_ok=15, r2_fail=0`).
- The 24h "mirrored=90, failed=215": 90 = the only new rows created on 06-10 (6 listings) + odds and ends; ~215 failures = the 37+40 retry rows cycling at 4×/day before RC3 parked the 40, **same rows counted repeatedly**, all Trestle-fetch failures. Failure onset is not a deploy event: `r2_fail` ≈ 35-per-6h waves existed throughout 06-07/06-08 (the pre-RC3 poison-set cooldown cycle).

**Verdict: Trestle-side (fetch of `media_url_original`) 100%; R2-side zero observed failures; no credential/token issue; RC3 reduced the noise; the real Phase-3 problem is that the frozen Phase 1 starves it of budget.**

---

## 3. Q3 — Why EMPTY first-image is growing (8,568 → 10,674)

Reminder of what the metric measures: ops-health's first-image classification reads **`listings.media` JSON only** (never the `listing_media` table). Exact reproduction (Q6a):

```
empty_media=10,674 · first_image_r2=2,013 · first_image_trestle=3,180 · total=15,867  ✓ matches ops:health
```

### (a) New-listing starvation — CONFIRMED, dominant driver

```sql
-- Q6b/Q6c: EMPTY by created_at bucket vs denominators (idx_display_yn=true)
--   <7d:    857 EMPTY of   858 created  (99.9%)   — 0 have active listing_media
--   7-14d:  846 of   891   (95%)                  — 0 have active listing_media
--   14-30d: 1,454 of 1,745 (83%)                  — only 19 have active listing_media
--   pre-05-21: 7,517 EMPTY (was ~8,568 total in the May audit — the OLD cohort actually shrank)
-- Q6d: arrival rate ~150 IDX-displayable/day; for virtually every day in the last 21,
--      empty_json_now ≈ new_listings (e.g. 06-10: 167 of 167 still empty).
```

Mechanism (code-confirmed): idx-sync CREATE writes `media: []` (no `$expand=Media` since `9673151d`); the post-loop batch-Media refill silently fails for most listings (known mode from the 05-21 incident); the `media-backfill` cron is paused (PR #176); media-sync writes only `listing_media` (never JSON) and is **frozen**, so new listings get neither JSON nor table rows. 3,157 of the 10,674 EMPTY were created in the last 30 days — the entire net growth of +2,106 since the May audit is arrival-driven.

### (b) Over-tombstoning by RC1's `tombstoneVanished` — REFUTED

```sql
-- Q5a: deleted rows by day: 06-09: 58 rows/9 listings · 06-10: 8 rows/5 listings (≤11/day all prior days)
-- Q4d: of the 06-09/06-10 deletions, 38 had r2_attempts>=3 (the 404-tombstone path working as designed),
--      24 were vanished-at-source tombstones
-- Q5b: listings fully tombstoned (0 active, >0 deleted) since 06-09: exactly 2 (both idx-displayable)
```

Two listings cannot move a 10,674 count. (One of the two, RLS20083754, has `raw PhotosCount=29` yet all 29 rows tombstoned on 06-10 — worth one eyeball when the cursor work happens, but immaterial here.)

### (c) Post-RC2 JSON stomping — NO EVIDENCE

RC2's `mediaUpdatePatch` omits `media` on UPDATE when not fetched (code-read; `lib/idx/sync.ts:34-41`). The EMPTY growth sits in the **created-recently** cohort, not in cohorts whose JSON would have been stomped; the pre-05-21 EMPTY cohort *shrank*. Additionally 1,690 EMPTY-JSON listings have `photo_count>0` + `primary_photo_url` set (Q6e) — table-populated, JSON-never-filled; the PR-4 reader serves these from `listing_media`, so they are not user-visible failures.

**Ranking: (a) ≫ (b) ≈ (c) ≈ 0.** True user-visible no-image set = EMPTY-JSON ∩ no-active-`listing_media` = **8,977** IDX-displayable (Q7f), and the frozen catch-up is what's holding 9,610 backlog listings out of `listing_media`.

---

## 4. Q4 — Duplication / double-storage audit (Maya's question)

### (a) Duplicate rows inside `listing_media` — negligible

```sql
-- dup active rows per (listing_id, media_url_original):  11 groups, 11 excess rows
-- dup active rows per (listing_id, media_type, "order"):  12 groups, 12 excess rows
-- media_key: UNIQUE constraint at schema level — duplicates impossible
```

### (b) Duplicate R2 objects — negligible

```sql
-- active rows with r2_key: 81,841 · distinct r2_keys: 81,821 → 20 keys shared by 2 active rows
--   (r2_key is deterministic per (listing_id, media_type, order) — these are order-collision pairs
--    pointing at ONE object; no extra storage, possible wrong-image display on those 20)
-- same media_url_original under 2+ distinct r2_keys: 0   ← no image mirrored twice under different keys
-- deleted rows still holding r2_key: 31 (30 distinct keys; 22 also live on an active row)
--   → at most ~8 orphan objects in R2. Trivial.
```

### (c) Neon-side dual storage (M1 baseline — quantified for the future correction)

```sql
-- Q7f: JSON-populated × has-active-listing_media (all 107,254 listings / idx-displayable 15,867):
--                          all listings   idx-displayable
--   BOTH populated             3,656          3,265   ← the true dual-storage set
--   JSON-only                  4,679          1,928   ← legacy JSON, no table rows
--   table-only                 2,075          1,697   ← post-PR-4 world (JSON never filled)
--   neither                   96,844          8,977   ← the no-image set
-- Q7g: listings.media JSON total ≈ 6.1 MB on-disk (both=2.78 MB, json-only=2.86 MB, rest ≈ 0.5 MB)
-- Q7h: listing_media table = 49 MB total · listings = 893 MB · DB = 1,086 MB
```

**Double-storage cost ≈ 2.8 MB of duplicated JSON — immaterial.** The 893 MB `listings` table remains the real storage issue, and it is the *other* JSON columns + UPDATE churn (RC4, held VACUUM/archive work), not media. Note the freeze itself is adding churn: ~40–60K needless `listing_media` UPDATEs/day while the cursor re-chews its window.

### (d) Image binaries in Neon — NONE

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND data_type='bytea';   → 0 rows
-- listing_media.media_url_original / media_url_cached / r2_key are all `text`
```

Images live in R2 only; Neon stores URLs/keys. Verified.

---

## 5. Q5 — Expected vs new-error, and the recommended next correction

**EXPECTED (no action / already held):**
- M4 backlog (IDX-displayable with no `listing_media`) being large — held backfill, known.
- The 40 parked poison rows — RC3 behaving exactly as designed; leave parked.
- The 37 attempts=7 rows — will self-resolve (tombstone at next 404, or park at 8). No correction needed.
- listings-table bloat (893 MB) — RC4 territory, held (VACUUM FULL / archive).

**NEW ERRORS (need correction):**
1. **P0 — RC1 keyset watermark deadlocks on feed listings absent from local `listings`** (3 ghosts at the current head; cursor frozen 40h; catch-up dead; Phase 3 budget-starved; ~50K wasted UPDATEs/day; EMPTY keeps growing because the drain that would fix it is stopped).
2. P2 — concurrency-guard race (two firings 7s apart at 17:16:57/17:17:04Z on 06-10) — low-harm (idempotent upserts) but worth noting.
3. P3 — observability gap: no per-row mirror-failure reason is persisted anywhere; ops:health's `r2_attempts>0` count conflates parked with active-retrying rows (this is what mis-framed today's "burst").

**Recommended single next correction (RC4 candidate):** in `runMediaSync` Phase 1, before (or upon) the per-listing failure, distinguish **"listing does not exist in local `listings`"** (P2025 from `updateListingMediaSummary`, or a pre-check `prisma.listing.findUnique`) and treat it like the compliance-blocked case — `listingsSkipped++; processed.push({ok:true})` — so the watermark advances past it. We cannot store media for a listing we don't have (FK), so halting on it protects nothing; it only freezes the pipeline. Keep `ok:false` halting semantics for genuinely transient failures (Trestle 500s correctly retry-and-resume — proven on 06-09). One file, one new test ("ghost listing at head of batch ⇒ cursor advances past it"), immediately unfreezes a 2.5–3-day catch-up that drains 9,610 photo-less listings and restores Phase-3 mirror throughput. Optional same-PR cheap win: include skipped-ghost ListingIds in the audit payload for visibility.

(Why the ghosts exist at all — Trestle feed contains Active/Pending listings idx-sync never imported — is a separate, smaller question for the idx-sync side; it does not change the media-sync fix.)

---

## 6. ops:health facts — verified vs corrected

| ops:health claim | Verdict |
|---|---|
| Cursor `last_photos_change = 2026-05-14T20:37:58Z`, advanced from 05-06 since RC1 | ✅ Verified — but it advanced only during 06-09T00:00–06:15Z and has been **frozen** since |
| Last run partial, checked=391 updated=362 failed=4 | ✅ Verified (failed = 3 ghosts + 1 intermittent Trestle Media 500) |
| 15,867 IDX-displayable; 4,962 with active listing_media; 4,960 R2-cached | ✅ Verified exactly (Q6a/Q7f: 1,697+3,265=4,962) |
| First-image: R2 2,013 / Trestle 3,180 / EMPTY 10,674 | ✅ Verified exactly |
| R2 retry backlog 77, ALL ≥3 strikes, "NEW failures AFTER RC3, not the old 40-row poison set" | ⚠️ **Corrected:** 40 of 77 ARE the old poison set (parked by RC3, idle since 02:31Z); 37 are new-ish (06-09 catch-up), pre-dating RC3 |
| mirrored=90 / failed=215 last 24h | ✅ Numbers verified; framing corrected — failures are ~50 rows ×4 retries/day Trestle-side; mirror path healthy; low throughput = Phase-1 budget starvation |

---

## 7. Appendix — full query log

All queries were executed read-only against `ep-cold-waterfall-adno3ao2` between 21:41Z and ~22:30Z on 2026-06-10. Raw outputs preserved in `scripts/__media-diag-2026-06-10-t0.out` and `scripts/__media-diag-2026-06-10-live.out` (untracked).

**Q2 — last 30 cron runs (excerpt):** every run since 06-09T06:15Z `status=partial`, `exit_reason=budget_phase1` (rarely `completed`), `lp=20–47`, `failed=3–5`, `r2_ok=0` except `completed` runs (15, 53), `backlog` 77–79 flat, `dur_ms≈46,000`. One `source_error` 06-11T00:30 display / 06-10T20:30Z actual: `Property fetch failed: HTTP 500`.

**Q2b — hourly 72h (full table captured in t0.out):** key transitions — pre-RC1 (through 06-08): lp=200/h flat, backlog=40 flat, r2_fail ~35 per 6h wave; 06-09T00–06: r2_ok 362/2,956/2,576/2,249/2,108/1,835/1,035, backlog spikes to 260 then drains; 06-09T06 onward: listing_fails 9–37/h nonstop, r2_ok≈0, backlog 119→77 (slow tombstone/park attrition only).

**Q2c — daily:** 06-08: 95 firings, 4,749 consumed, 0 fails, r2 0/160 · 06-09: 96, 4,115, 235 fails, r2 13,141/439 · 06-10 (partial): 87, 3,059, 304 fails, r2 90/177.

**Q3a/b/c (bucketed-by-day + cluster variants):** timed out at 60s statement_timeout (full seq scan + per-row JSONB detoast on 107K rows). Replaced by the single-pass P6 query (§1.4) at 300s. Cluster check not separately rerun — the live Property probe demonstrates the keyset paginates same-PCT clusters correctly (20-row cluster at the cursor boundary handled in order).

**Q4a/b/c/d, Q5a/b/c, Q6a–e, Q7a–j, Q8:** quoted in §§1–4 above with results inline.

**Live probe (P1–P6):** token handshake → Property page from exact cursor (50 rows listed in live.out) → per-listing Media pagination (49 ok, 1 persistent HTTP 500 = RLS20083390) → 7 sample `media_url_original` GETs (4× HTTP 404 JSON, 2× HTTP 200 text/html, 1× timeout) → cursor t1 snapshot (unchanged) → backlog count (11,822 / 9,610).

**Batch membership (`__media-diag-2026-06-10-batch-check.mjs`):** full 50-row table in §1.3; ghosts at positions 1–3.

**Ghost archive check (`__media-diag-2026-06-10-ghosts.mjs`):** `listings_archive` → 0 rows; `source_error` runs: 06-09×1, 06-10×3.

---

*Read-only diagnostic by Claude (Fable 5), 2026-06-10. No production state was modified. Probe scripts remain untracked on local disk per the `scripts/__` throwaway pattern.*
