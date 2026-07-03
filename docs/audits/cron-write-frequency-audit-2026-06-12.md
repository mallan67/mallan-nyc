# Cron / Write-Frequency Audit — 2026-06-12

> **READ-ONLY audit. DO NOT COMMIT (operator instruction).**
> Goal: map every recurring writer and its monthly growth so "we fixed it but it keeps growing" can't recur.
>
> **Evidence sources**
> 1. `vercel.json` crons (22 scheduled jobs) + each route's source.
> 2. Read-only DB probes against canonical production (`ep-cold-waterfall-adno3ao2`, host-guarded, `default_transaction_read_only=on`, SELECT-only):
>    `scripts/__cron-write-audit-2026-06-12.mjs` + `…-2026-06-12b.mjs` (untracked, per the `scripts/__` pattern).
> 3. Vercel runtime logs (production, ~1-day retention) — corroborated cron cadence; one media-sync HTTP 500 observed at 21:45:10Z, matching the ~8.5/day `media_sync_cron_error` audit rate.
>
> **No schedule was changed, no cron was triggered, no write was performed.**

## 0. Headline numbers (probe, 2026-06-12)

| Metric | Value |
|---|---|
| DB total size | **1,135 MB** |
| `listings` | 894 MB · 107,610 rows · avg 6.4 KB/row (raw_data avg 2.5 KB) |
| `listing_media` | 96 MB · 170,956 rows (163,611 active / 7,345 tombstoned) |
| `listing_search_projection` | 71 MB · 107,607 rows |
| `audit_events` | 51 MB · 76,540 rows (oldest 2026-03-15) — **30 MB of this is one 2-day incident burst** |
| `listing_media` R2 backlog | 42,860 rows missing r2_key/cached; 132 retry-parked (RC3); 127,791 mirrored total |
| Cumulative tuple updates (pg_stat) | listing_media **1.82 M**, listings **838 K** — vs only 171 K / 108 K inserts → heavy rewrite churn |

---

## 1. Job-by-job map

### 1.1 `db-keepalive` — `*/15 * * * *` (2,880 runs/mo)
- **Writes:** none (`SELECT 1`). No audit row.
- **Failure behavior:** 500, no retry, no rows.
- **Rewrites:** n/a. **Retention:** n/a. **Pause-safe:** yes.
- **Compute angle (the real cost):** route comment says "runs every 4 minutes" to beat Neon's 5-min autosuspend — but the actual schedule is `*/15`, so on its own it does NOT prevent suspension. In practice it is **redundant**: runtime logs show an external uptime monitor hitting `GET /` **every 60 seconds**, plus idx-sync every 10 min and media-sync every 15 min. The DB endpoint effectively never idles >5 min → **near-24/7 compute (~720 CU-hours/mo at min CU)**. Pausing this cron saves ~nothing while the 1-min `/` monitor exists; the monitor (not this cron) is the keep-awake driver.

### 1.2 `idx-sync` — `*/10 * * * *` (4,320 scheduled/mo; ~2,190 effective — the 10-min concurrency guard skips ~half: 1,020 success audits in 14d = 72.9/day vs 144 scheduled)
- **Writes per effective run (7-day averages, from its own audit counters):**
  - `listings`: **52.7 upserts/run avg** (max 500 cap); ~3,850 listing upserts/day. Mostly the *same* listings re-bumped by the feed — distinct rows touched/day baseline is only ~150–400.
  - `listing_search_projection`: 1 upsert per listing (dual-write).
  - `listings.media` JSON via batch-media `updateMany` for fetched listings with empty media.
  - `audit_events`: **2 rows/run** (`idx_sync` + `idx_sync_cron`) ≈ 146/day ≈ 4,400/mo (~430 B avg combined).
  - `sync_state`: 1 row updated every run (HOT updates; heap stable, WAL not).
- **R2:** none in this route.
- **Failure/retry:** per-record errors are counted and skipped (no retry rows); each failed record writes one `idx_sync_listing_upsert_failure` diagnostic audit row (fire-and-forget, **no rate cap** — see §4). Watermark = max Trestle MT/PCT actually processed → lossless, no duplicate writes on resume.
- **Rewrites existing data?** Delta-only at the *fetch* level (MT/PCT > watermark filter). BUT each fetched record is a **full-row rewrite** (every column incl. 2.5 KB raw_data, address/features JSON) even if only price changed, and the upsert always bumps `last_synced_from_trestle` + `updated_at` → ~3,850 × ~6.4 KB ≈ **~25 MB/day of WAL/Neon-history churn** with near-zero heap growth. PCT-only changes (photo edits) also rewrite the whole listing row.
- **Retention:** its audit rows fall under the 2-yr purge. **Pause-safe:** short-term yes (cursor resumes losslessly); listing data goes stale; §2.05 risk only builds via missed terminal transitions (data-retention's T+24h gate needs `status_changed_at` to have been written by sync).

### 1.3 `media-sync` — `*/15 * * * *` (2,880/mo; ~95 effective/day; ~9% of runs currently 500 → `media_sync_cron_error` 8.5/day)
- **Writes per run (7d avg):** 45.1 listings processed → **515.6 `listing_media` rows written/run** (~50 K/day), ~45 `listings` summary-column updates, 1 `media_sync_state` cursor update, 1 audit row (347 B).
- **R2 objects per run:** 7d avg **89/run**, but drain-skewed: 13,141 (Jun 9), 23,902 (Jun 11), 22,008 (Jun 12) per day; ~0/day Jun 4–8.
- **Failure/retry:** per-listing failure halts the keyset watermark (re-processed next run, idempotent); R2 failures increment `r2_attempts` + 6h cooldown; permanent 404/410 tombstones at 3 attempts; transient failures **park** (not delete) at 8 attempts (RC3) — 132 rows currently parked. No duplicate R2 objects (deterministic key + exists-check). The mirror **suppresses no-op DB writes** (only writes on drift).
- **Rewrites existing data? — biggest no-op-rewrite finding.** `upsertListingMedia()` UPDATEs **every** existing media row of a processed listing with all source fields and bumps `updated_at`, with **no changed-field suppression**. Evidence: **Jun 3–8, with the cursor frozen (pre-RC1/RC5 fix), it rewrote ~38,400 rows/day with zero creates, zero R2 work, flat backlog — six days of pure no-op churn.** That is where most of `listing_media`'s 1.82 M cumulative updates came from. The cursor freeze is fixed (RC1 keyset + RC5 ghost-skip, cursor now advancing: `last_photos_change` 2026-06-09, ~4 days behind and closing), but the mechanism remains: any future cursor stall converts this cron back into a ~38 K-row/day history-inflating rewriter. A cheap diff-before-update in `upsertListingMedia` would cap that class permanently.
- **Retention:** audit rows covered (2 yr); `listing_media` tombstoned rows (7,345) are kept forever — no purge path; R2 objects are never deleted by anything.
- **Pause-safe:** yes (cursor resumes); photos go stale; R2 backlog freezes.

### 1.4 `feed-reconcile` — `30 3 * * *` (30/mo) — *chunked orphan import just landed*
- **Ghost direction (permanent, ongoing):** avg **~44 transitions/day** (623 in 14d): each = 1 `listings` update + 1 audit row + 1 projection upsert. Abort-all >2,000 (+ broker alert emails + 1 audit row).
- **Orphan direction (TRANSIENT):** chunk = 300/night, ListingId-ASC, archive-excluded, 240 s budget, sanity cap 5,000. Per full night: ~300 `listings` creates (~2 MB) + ~300 audit rows + ~3,930 `listing_media` rows at 13.1 avg (~2.2 MB) + 300 projection rows + summary updates. **Backlog = 1,361 → ~5 nights → ends ≈ 2026-06-17**, then ~0–5/night residual (historical: 430 orphans created since April, almost all in one Jun-3 batch of 98). Probe shows the chunked path had not yet produced its first 300-row night as of this audit.
- **Failure/retry:** per-listing transaction; errors counted, not retried within the run; idempotent re-runs (no duplicate creates/transitions). No R2 writes (Phase-3 mirror picks the new media rows up later).
- **Rewrites:** delta-only (only ghosts/orphans touched). **Retention:** audit rows covered. **Pause-safe:** orphan side yes; ghost side NO — pausing lets feed-removed listings stay publicly Active (REBNY display-accuracy exposure).

### 1.5 `data-retention` — `0 3 * * *` (30/mo)
- **Writes (last 7 runs):** `t30d_media_nulled` 9–124/day (~110 avg); everything else 0 (sessions, MFA, notifications, geocode, archive, §2.05 flips). 1 audit row/run. On archive failure → `sync_errors` row (table currently 0 rows).
- **`audit_events_purged_over_2yr` = 0 on every run** — DB is ~3 months old; the 2-yr purge does nothing until ~2028-03, so audit_events grows monotonically until then (bounded ≈ 24 mo × growth rate).
- **Rewrites:** delta-only, capped batches (1000/500). **Pause-safe: NO** — REBNY §2.05 T+24h gate + SHIELD purges are compliance functions.

### 1.6 Remaining daily/weekly jobs (all small writers)

| Job | Schedule | Writes/run (observed 14d) | Notes |
|---|---|---|---|
| `neon-branch-prune` | daily | 1 audit row (350 B); Neon API branch deletes | pause-safe short-term; cost hygiene |
| `dom-reset` | daily | usually 0; 1 reset in 14d (listings updateMany + auditMany) | UCBA DOM — pause = wrong DOM shown |
| `listing-expiration` | daily | 0 observed in 14d (no audit rows); writes listings/protected_periods/audit when exclusives expire | low volume |
| `search-alerts` | daily | 1–3 audit rows; savedSearch.update + clientListingAction upserts | pause-safe |
| `seller-scoring` | daily | 1 audit row (53 B) + ≤50 sellerLead updates | pause-safe |
| `tenant-nurture` | daily | lead updates + notifications (notifications purged at 90d-read) | pause-safe |
| `prospect-triggers` | daily | 1 audit row (188 B) + cadence-step/sellerLead updates | pause-safe |
| `lead-scoring`, `conviction-scores`, `intent-profiles`, `demand-signals`, `listing-momentum`, `social-proof` | daily | 1 audit row each (50–115 B) + own score tables | pause-safe |
| `lifecycle-triggers` | daily | 1 audit row + lifecycleTrigger creates (**lifecycle_triggers has no retention purge**) | small |
| `experiment-metrics`, `agent-metrics` | weekly | 1 audit row each | pause-safe |
| `market-snapshots` | monthly | 1 audit row | pause-safe |

Σ analytics/CRM crons ≈ **17 audit rows/day ≈ 510/mo ≈ <0.1 MB/mo** — noise.

### 1.7 Non-cron recurring writers (same tables)
- **`/api/cron/media-backfill`** — route exists (backfillEmptyMedia + migrateMediaToR2, writes `listings.media` JSON + R2) but is **NOT in vercel.json** → not scheduled; manual-only. Zero current contribution.
- **CRM media upload/order/delete routes** (`app/api/crm/listings/[id]/media/**`) — user-triggered `listing_media` + R2 writes; volume ≈ manual usage (1 `media_upload` audit row in 14d).
- **CRM convert** (`app/api/crm/convert`) — listing creates, user-triggered.
- `logIDXAccess` is console-only — no DB rows.

---

## 2. Transient vs permanent growth

### TRANSIENT (ends when backlogs clear)
| Stream | Current rate | Remaining | Est. end |
|---|---|---|---|
| media-sync source drain (cursor catch-up creating `listing_media` rows) | 40–49 K rows/day created (Jun 11–12) | 5,831 of 16,040 eligible listings still have zero media rows (~76 K rows ≈ 43 MB) | **≈ 2026-06-14/15** (~3,700 listings/day) |
| R2 mirror backlog | ~22 K objects/day mirrored; backlog still *growing* (42,860) while source drain outpaces it | ≈ 42.9 K + ~76 K incoming | **≈ 2026-06-18/19** |
| feed-reconcile orphan catch-up | ~300 listings + ~3,930 media rows + ~600 audit rows/night (~4.5 MB/night) | 1,361 | **≈ 2026-06-17** |
| Jun 1–2 `idx_sync_listing_upsert_failure` burst | already over (now ~5/day) | 46,010 rows / 30 MB sitting in audit_events until 2028 purge | n/a (see §4) |

### PERMANENT (steady state, post-drain)
| Stream | Rows/mo | MB/mo (heap+index) |
|---|---|---|
| `listings` creates (idx-sync + orphans, never deleted — archived rows are stripped, not removed) | ~4,300 (143/day) | **~35 MB/mo** |
| `listing_media` for new listings (~13 rows each; tombstones never purged) | ~25–56 K | ~15–30 MB/mo |
| `listing_search_projection` | ~4,300 | ~3 MB/mo |
| `audit_events` baseline (excl. incident action: 316 rows/day, 84 KB/day changes) | ~9,500 | ~5–8 MB/mo (purged at 2 yr → plateaus ~2028 at ~230 K rows / ~120–150 MB) |
| R2 objects (new-listing photos; no deletion path at all) | ~25–56 K objects | external to Neon |
| WAL/PITR history churn (not heap): idx-sync full-row re-upserts ~25 MB/day + media-sync rewrites | — | **~750 MB+/mo of history**, the dominant Neon storage-cost vector if history retention is non-trivial |

**Total permanent heap growth ≈ 60–75 MB/mo (~6%/mo on today's 1.1 GB).**

---

## 3. Worst single permanent grower

**`listings` via idx-sync — both dimensions.** ~35 MB/mo permanent heap (rows created forever, never deleted; raw_data only stripped at T+180d for *terminal* rows — active/stale-Active rows keep 2.5 KB raw_data indefinitely), **plus** ~25 MB/day of full-row rewrite WAL because every feed bump rewrites all ~6.4 KB of the row. If Neon history/PITR retention is enabled, the rewrite churn — not the heap — is the largest storage line item.

Runner-up (mechanism risk, not current rate): `upsertListingMedia()`'s unconditional row UPDATE — proven capable of 38 K no-op rewrites/day for 6 straight days whenever the cursor stalls.

## 4. Other findings / flags

1. **No-op rewrites confirmed (Jun 3–8):** media-sync rewrote ~38.4 K unchanged `listing_media` rows/day while frozen. Fixed cause (RC1/RC5), unfixed mechanism (no diff-suppression in `upsertListingMedia`; the R2 mirror DOES suppress no-op writes — good asymmetry to close).
2. **Unbounded diagnostic writer:** `idx_sync_listing_upsert_failure` (lib/idx/sync.ts `recordSyncDiagnostic`) has no per-run cap — the Jun 1–2 DB incident (PrismaClientUnknownRequestError/ConnectorError) wrote **46,010 audit rows / 30 MB in 48 h** (26 K + 20 K per day; every record of every 500-cap run failing, every 10 min). A cap (e.g., ≤20 diagnostics/run) would bound the blast radius.
3. **db-keepalive is moot** while the 1-min external `GET /` monitor exists; the comment ("every 4 minutes") no longer matches the `*/15` schedule. Compute is effectively 24/7 regardless. (Per standing holds: change requires Maya approval — flagged only.)
4. **idx-sync effective cadence is half its schedule:** the 10-min guard window equals the 10-min schedule, so alternate runs skip (~73 real syncs/day of 144). Harmless, but the schedule and guard fight each other.
5. **Never-purged surfaces:** `listing_media` tombstones (7,345), R2 objects (no deletion path, incl. tombstoned rows' objects), `lifecycle_triggers`, `listings_archive` (intentional, NY DOS 6-yr). All small today.
6. **media-sync 500s ~9% of runs** (8.5 error-audit rows/day) — each still writes its error audit row; cursor not advanced on the error path (safe, no duplicate writes).
7. `audit_events` 2-yr purge is correctly wired but is a no-op until ~2028-03 (oldest row 2026-03-15) — expected, not a bug.

## 5. Pause-safety summary

- **Pause-safe** (cursors/idempotency hold; only freshness suffers): idx-sync, media-sync, orphan side of feed-reconcile, db-keepalive, neon-branch-prune, all analytics/CRM crons, search-alerts.
- **NOT pause-safe** (compliance function): data-retention (§2.05 T+24h, SHIELD purges), ghost side of feed-reconcile (feed-removed listings would stay publicly Active), dom-reset (UCBA DOM), listing-expiration (exclusive expiry).

---
*Probes: `scripts/__cron-write-audit-2026-06-12.mjs`, `scripts/__cron-write-audit-2026-06-12b.mjs` (untracked; re-runnable; host-guarded read-only). Runtime-log spot-check: production deployment dpl_JDaGD6g8d6aN4hGQi95K2YCM8VpN, window 19:45–21:45Z 2026-06-12.*
