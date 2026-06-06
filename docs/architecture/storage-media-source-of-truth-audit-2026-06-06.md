# Storage + Media Source-of-Truth Audit (report-only) — 2026-06-06

> **Mode: REPORT ONLY / READ-ONLY.** No DB mutation, no deletes, no migrations,
> no env/deploy, no cron, no write backfills. Defines one source-of-truth model
> and identifies duplicated/stale storage. **Nothing is deleted or cleaned here.**

## TL;DR (direct answer)

**Do not delete or clean anything yet. R2 is a cache/mirror, not source of truth.**
The code already enforces that model; the gap is *coverage + denormalization*, not
architecture. Confirmed chain:

```
Cotality/Trestle Media  (external source — IDX/RLS Photo + FloorPlan)
        │
        ▼
listing_media           (internal normalized source of truth;
        │                media_url_original = canonical, immutable)
        ├──────────────► DTO / cards / detail
        ▼
R2 cache                (media_url_cached + r2_key — MIRROR only, never canonical)
        ▼
listings.photo_count / primary_photo_url / primary_photo_r2_key   (derived denorm)

listings.media JSON     = LEGACY FALLBACK ONLY (read only when listing_media empty);
                          phase down after coverage backfill, retire after proof.
CRM exclusives (SL-/RL-): the CRM upload IS the source → listing_media (+ R2).
```

---

## 1. Code topology (exact files/lines — Class A, static)

| Concern | Location | Fact |
|---|---|---|
| R2 client | `lib/images/r2.ts:12-29` | S3 client to `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`; env `R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL` |
| R2 upload + public URL | `lib/images/r2.ts:40 uploadToR2`, `:94 hasR2Config`, `getR2PublicUrl` | Public cache host = `R2_PUBLIC_URL` (observed `pub-<hash>.r2.dev`, e.g. `pub-c05d6bb7…r2.dev/photos/RLS20089706/1.jpg`) |
| R2 key namespace | `lib/media/media-sync-service.ts:139 buildMediaR2Key` | `Photo→photos/`, `FloorPlan→floorplans/`, `Video→videos/`, `VirtualTour→virtualtours/`, deterministic per `(listing_id, media_type, order)` |
| **R2 mirror = cache, never canonical** | `lib/idx/media-sync.ts:807 mirrorMediaToR2` | **Boundary contract:** NEVER writes `media_url_original`, NEVER writes any `Listing` field, NEVER writes `Listing.media` JSON. Writes **only** `r2_key` + `media_url_cached` on `listing_media`. |
| R2 failure / tombstone | `media-sync.ts:794-805` | On 3rd consecutive permanent 404/410 → `status='deleted'` (audit tombstone). Other failures increment `r2_attempts`, set `r2_last_attempt_at` (cooldown). |
| R2 backlog (Cp4) | `media-sync.ts:1455` | Re-mirrors rows where `r2_key IS NULL OR media_url_cached IS NULL` |
| Denorm writer (Cp3) | `media-sync.ts:578 computeListingMediaSummary`, `:636 updateListingMediaSummary` | Derives `photo_count/primary_photo_url/primary_photo_r2_key/photos_change_timestamp` from `listing_media` only |
| Incremental cron | `app/api/cron/media-sync/route.ts` | Cp1 ingest → Cp3 denorm → Cp4 R2 mirror; cursor-based (only changed listings) — root cause of the ~8,500 null denorm |
| CRM media (SL-/RL-) | `lib/media/crm-media.ts:174-182` | `media_url_original = item.url`, `media_url_cached = url`, `status='active'` — the CRM upload IS the source for exclusives (not Trestle) |
| CRM upload entry | `app/api/crm/listings/[id]/media/upload/route.ts` | Broker upload → R2 + `listing_media` |
| JSON fallback reader | `lib/idx/db-to-public-dto.ts:329-332` | `tableRows.length>0 ? resolveListingMediaFromRows : resolveListingMedia(media JSON)` — **JSON is read only when `listing_media` is empty** |
| Schema | `prisma/schema.prisma:476-491` (listings: `media` JSON, `raw_data` JSON, denorm cols), `:2327-2383` (`listing_media`) | — |

**Conclusion:** the architecture is already correct — R2 is a strict mirror, the
JSON column is already fallback-only, denorm is already derived. The site looks
broken because of **incomplete coverage** (5,998 listings have no `listing_media`)
and **stale denorm** (~8,500 null), not because the model is wrong.

---

## 2. Read-only SQL pack (run in Neon SQL Editor — hidden-mountain / neondb / cold-waterfall-pooler)

### S0 — confirm canonical DB
```sql
SELECT current_database() AS db, pg_size_pretty(pg_database_size(current_database())) AS db_size;
```

### S1 — largest tables by total size
```sql
SELECT c.relname AS table,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_size_pretty(pg_relation_size(c.oid))       AS heap,
       pg_size_pretty(pg_indexes_size(c.oid))        AS indexes,
       pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid)) AS toast,
       pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 25;
```

### S2 — listings vs listing_media breakdown
```sql
SELECT t AS tbl,
       pg_size_pretty(pg_total_relation_size(t)) AS total,
       pg_size_pretty(pg_relation_size(t))       AS heap,
       pg_size_pretty(pg_indexes_size(t))        AS indexes,
       pg_size_pretty(pg_total_relation_size(t) - pg_relation_size(t) - pg_indexes_size(t)) AS toast
FROM (VALUES ('listings'::regclass), ('listing_media'::regclass)) v(t);
```

### S3 — `listings.media` JSON size (is it materially bloating the DB?)
```sql
SELECT
  COUNT(*) AS listings_total,
  COUNT(*) FILTER (WHERE jsonb_typeof(media)='array' AND jsonb_array_length(media) > 0) AS with_media_json,
  pg_size_pretty(SUM(pg_column_size(media)))            AS media_json_total,
  pg_size_pretty(AVG(pg_column_size(media))::bigint)    AS media_json_avg,
  pg_size_pretty(MAX(pg_column_size(media)))            AS media_json_max,
  pg_size_pretty(SUM(pg_column_size(raw_data)))         AS raw_data_total,   -- compare: raw_data usually dominates
  pg_size_pretty(SUM(pg_column_size(features)))         AS features_total
FROM listings;
```

### S4 — media duplication / coverage overlap
```sql
WITH lm AS (
  SELECT listing_id, BOOL_OR(status='active') AS has_active_media
  FROM listing_media GROUP BY listing_id
), t AS (
  SELECT l.listing_id,
         (jsonb_typeof(l.media)='array' AND jsonb_array_length(l.media) > 0) AS has_json,
         COALESCE(lm.has_active_media, false) AS has_active
  FROM listings l LEFT JOIN lm ON lm.listing_id = l.listing_id
)
SELECT
  COUNT(*) FILTER (WHERE has_json AND has_active)        AS both_table_and_json,   -- JSON is a redundant copy
  COUNT(*) FILTER (WHERE has_json AND NOT has_active)    AS json_only_no_table,    -- the ~5,998 (JSON is the ONLY media)
  COUNT(*) FILTER (WHERE NOT has_json AND has_active)    AS table_only_no_json,    -- fully migrated
  COUNT(*) FILTER (WHERE NOT has_json AND NOT has_active) AS neither
FROM t;
```

### S5 — R2 cache coverage + failed/tombstoned rows
```sql
SELECT
  COUNT(*)                                                              AS total_rows,
  COUNT(*) FILTER (WHERE status='active')                              AS active_rows,
  COUNT(*) FILTER (WHERE status='active' AND media_url_cached IS NOT NULL) AS active_with_cached,
  COUNT(*) FILTER (WHERE status='active' AND media_url_cached IS NULL)     AS active_null_cached,
  COUNT(*) FILTER (WHERE status='active' AND r2_key IS NOT NULL)           AS active_with_r2_key,
  COUNT(*) FILTER (WHERE status='active' AND r2_key IS NULL)               AS active_null_r2_key,
  COUNT(*) FILTER (WHERE status='deleted')                                AS tombstoned_deleted,
  COUNT(*) FILTER (WHERE status='replaced')                               AS replaced,
  COUNT(*) FILTER (WHERE COALESCE(r2_attempts,0) >= 3)                    AS r2_failed_3plus
FROM listing_media;
```

### S6 — cached-URL host distribution (find unexpected hosts)
```sql
SELECT
  CASE
    WHEN media_url_cached IS NULL                              THEN '(null — not yet mirrored)'
    WHEN media_url_cached ~* '://[^/]*\.r2\.dev/'              THEN 'r2.dev (expected cache)'
    WHEN media_url_cached ~* '://[^/]*cotality\.com/'          THEN 'cotality.com (SOURCE leaked into cache?)'
    WHEN media_url_cached ~* '://[^/]*corelogic\.com/'         THEN 'corelogic.com (SOURCE)'
    ELSE 'OTHER: ' || COALESCE(substring(media_url_cached from '://([^/]+)/'), '(unparseable)')
  END AS cached_host_class,
  COUNT(*) AS n
FROM listing_media WHERE status='active'
GROUP BY 1 ORDER BY n DESC;
```

### S7 — duplicate source-URL rows WITHIN a listing (the only cleanup candidates)
A cleanup candidate is a duplicate **within the same `listing_id`** — two active
rows for one listing pointing at the same `media_url_original`. Grouping must
include `listing_id`; grouping by URL alone would count the same image on two
DIFFERENT listings as "extra", and a cleanup driven by that could delete media
from another listing (Codex #367). Readers resolve media per listing, so
per-listing scope is correct.
```sql
SELECT COUNT(*) AS within_listing_dup_groups,
       COALESCE(SUM(cnt) - COUNT(*), 0) AS extra_rows_safe_to_dedupe
FROM (
  SELECT listing_id, media_url_original, COUNT(*) AS cnt
  FROM listing_media
  WHERE status='active' AND media_url_original IS NOT NULL
  GROUP BY listing_id, media_url_original
  HAVING COUNT(*) > 1
) t;
```

### S7b — same source URL reused ACROSS listings (DIAGNOSTIC ONLY — never cleanup)
Different listings legitimately referencing the same upstream image. This is a
data-quality observation, **not** rows eligible for deletion — removing them would
strip media from a different listing.
```sql
SELECT COUNT(*) AS urls_used_on_multiple_listings,
       COALESCE(SUM(listing_cnt), 0) AS total_listing_references
FROM (
  SELECT media_url_original, COUNT(DISTINCT listing_id) AS listing_cnt
  FROM listing_media
  WHERE status='active' AND media_url_original IS NOT NULL
  GROUP BY media_url_original
  HAVING COUNT(DISTINCT listing_id) > 1
) t;
```

### S8 — orphan media rows (FK should prevent — verify)
```sql
SELECT COUNT(*) AS orphan_media_rows
FROM listing_media lm LEFT JOIN listings l ON l.listing_id = lm.listing_id
WHERE l.listing_id IS NULL;
```

### Results (FILL from the pack — not fabricated)
| Metric | Source | Value |
|---|---|---|
| DB size | S0 | _pending_ |
| Top tables by size | S1 | _pending_ |
| `listings` total / `listing_media` total | S2 | _pending_ |
| `media` JSON total / avg / max · `raw_data` total | S3 | _pending_ |
| both_table_and_json · json_only_no_table · table_only_no_json | S4 | _pending_ |
| active cached/r2_key coverage · tombstoned · r2_failed_3plus | S5 | _pending_ |
| cached host distribution | S6 | _pending_ |
| within-listing dup rows (cleanup candidates) | S7 | _pending_ |
| URLs reused across listings (diagnostic only) | S7b | _pending_ |
| orphan media rows | S8 | _pending_ |

---

## 3. Source-of-truth model (definitive)

| Layer | Store | Role | Canonical? |
|---|---|---|---|
| External | Cotality/Trestle Media API | Upstream feed (IDX/RLS): Photo + FloorPlan | Source for IDX rows |
| Internal | `listing_media` (`media_url_original`) | Normalized source of truth | **Yes** |
| Cache | Cloudflare R2 (`media_url_cached`/`r2_key`) | CDN mirror of the original | **No** (mirror) |
| Derived | `listings.photo_count/primary_photo_url/primary_photo_r2_key` | Summary for fast cards/winner signals | No (derived) |
| Legacy | `listings.media` JSON | Fallback only (read when `listing_media` empty) | No (retire after backfill) |
| CRM | `listing_media` rows for `SL-`/`RL-` | Broker upload IS the source for exclusives | **Yes (local)** |

R2 can be wiped and fully rebuilt from `media_url_original` via the Cp4 backlog —
that is the proof it is a cache, not source of truth.

---

## 4. What is duplicated / stale / cleanable / must-not-delete

**Duplicated (redundant copies):**
- `both_table_and_json` (S4) — `listings.media` JSON duplicating `listing_media` rows.
- **within-listing** duplicate source-URL rows in `listing_media` (S7) — the #363
  resolver already dedupes these at *read* time; cleanup is optional, not urgent,
  and must be scoped per `listing_id`. The same URL appearing on **different**
  listings (S7b) is **not** a duplicate to clean — it is cross-listing reuse and
  deleting it would strip media from another listing.

**Stale:**
- `media` JSON for listings that already have `listing_media` (the JSON is the old copy).
- `status='deleted'/'replaced'` rows (S5) — intentional audit tombstones, **not** panic bloat.
- `r2_attempts >= 3` rows (S5) — failed mirrors (stale Trestle URLs); harmless, re-derivable.

**Can be cleaned LATER (only after proof, each its own approved PR + backup):**
- Shrink/retire `listings.media` JSON — *after* coverage backfill + the reader-swap
  proof that cards no longer touch the JSON path.
- Prune R2 objects whose `listing_media` row is `deleted`/`replaced` — *after* DB SoT stable.
- Dedupe **within-listing** duplicate-URL rows (S7, grouped by `listing_id` +
  `media_url_original`) — optional DB-hygiene PR. NEVER act on S7b (cross-listing reuse).

**MUST NOT delete yet:**
- `listings.media` JSON for `json_only_no_table` (the ~5,998) — it is the **only**
  media for those listings until coverage backfill runs.
- `media_url_original` — the immutable canonical source (R2 rebuilds from it).
- Tombstoned `listing_media` rows — audit trail.
- Any R2 object before the DB source-of-truth is stable and verified.

---

## 5. Risks

| Risk | Note |
|---|---|
| Old Neon migration residue | S1 surfaces unexpected large tables; verify against `prisma/schema.prisma` before assuming residue |
| Duplicate JSON + table rows | Quantified by S4/S7; read-time dedupe (#363) already protects display |
| Stale R2 cached URLs | `r2_attempts>=3` (S5); 404 cooldown already implemented; cache miss falls back to `media_url_original` |
| Source URL leaked into `media_url_cached` | S6 flags any non-`r2.dev` host (would mean a row never actually mirrored) |
| DB bloat from JSON | S3 quantifies `media` vs `raw_data`; `raw_data` (full Trestle record/listing) usually dominates — JSON-media shrink may be a smaller win than expected |
| Deleting JSON before backfill | Would blank the 5,998 — **forbidden** until coverage backfill + reader-swap proof |

---

## 6. Proposed cleanup sequence (each write step = separate approval + backup)

| Step | Action | Status / gate |
|---|---|---|
| **A** | Code safety for JSON fallback | ✅ done (#363, merged) |
| **B** | Media-coverage backfill → populate `listing_media` for the ~5,998 (IDX rows from live Trestle; CRM excluded) | write-gated · preview = #364 |
| **C** | Denorm backfill → `photo_count/primary_photo_url/r2_key/photos_change_ts` from `listing_media` (after the writer-determinism fix, #364 §4b) | write-gated · after B |
| **D** | Verify cards no longer need the `media` JSON fallback (reader-swap proof: `db-to-public-dto` table path covers all displayed listings; S4 `json_only_no_table` → ~0) | verification PR |
| **E** | Retire / shrink `listings.media` JSON — only after D proves it's unused | write-gated · **backup/export first** |
| **F** | R2 cleanup (prune objects for tombstoned rows) — only after DB SoT stable | write-gated · **backup first** |

**Approval + backup policy:** every prune (E/F, or a S7 dedupe PR) requires a
separate explicit approval **and** a pre-delete snapshot/export of the affected
rows/objects. Nothing in B–F runs without its own sign-off. R2 deletes are
last and reversible-by-re-mirror, but still gated.

> **Stop after report.** No writes, no deletes, no migrations, no cron. Run the
> S0–S8 pack and paste results to fill §2's table; the cleanup stays parked until
> each step is separately approved.
