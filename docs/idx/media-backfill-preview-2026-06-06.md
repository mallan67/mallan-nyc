# PR-Media Backfill Preview (read-only) — 2026-06-06

> **Mode: READ-ONLY. No DB writes, no migrations, no env/deploy changes, no cron.**
> This report previews *exactly what two repairs would change* before any write
> is approved. It contains a copy-paste **read-only SQL pack** to run in the
> Neon SQL Editor against the canonical production DB. No numbers in §Results
> are filled until the pack is run — this report does **not** fabricate counts.

## Canonical DB identity (run the pack ONLY here)

| Field | Value |
|---|---|
| Neon project | `hidden-mountain-87248164` ("neon-green-school") |
| Database | `neondb` |
| Endpoint | `ep-cold-waterfall-adno3ao2-pooler` |
| Branch | `main` (`br-crimson-frog-adr7g9gt`) |
| Tables | `listings`, `listing_media` |

`morning-bread` / `royal-dawn` is **stale / do-not-serve** — never run this pack there.

## What is being previewed

1. **Media-coverage repair** — **every IDX listing missing active `listing_media`**,
   regardless of whether `listings.media` JSON is empty or non-empty. Repair =
   populate `listing_media` from live Trestle Media (IDX rows only) so they use the
   clean table path.
   > **⚠️ Scope correction (live confirmation 2026-06-06):** the JSON-fallback group
   > (non-empty `listings.media` + no `listing_media`, sized by **Q1** ≈ 5,998) is a
   > **subset**, not the whole problem. A sample of the **50 newest** sale listings
   > showed **45/50 with empty `media[]`** — i.e. **no `listing_media` AND empty
   > `listings.media` JSON** (new listings entering faster than the incremental media
   > cron catches up). Those rows are **outside Q1** but **inside `rows_with_no_active_media_at_all`**
   > (Q3). **Size the coverage backfill from `rows_with_no_active_media_at_all`, not
   > Q1.** Both old legacy gaps and new-listing lag must be covered (and the future
   > cron/sync design must keep new listings from entering without media).
2. **Denorm repair** — re-derive `listings.photo_count` / `primary_photo_url`
   (+ `primary_photo_r2_key`, `photos_change_timestamp`) from `listing_media`,
   so the cheap card/winner signals are trustworthy.

Both are the prerequisites for the canonical search foundation. **#363 fixed the
JSON-fallback *display*; it did not change any data.** Production still shows
duplicate cards / weak media until these land.

---

## Denorm semantics being mirrored (authoritative)

The preview SQL mirrors the **canonical writer** exactly — `computeListingMediaSummary()`
in `lib/idx/media-sync.ts` (the function the incremental cron already uses), so
the preview deltas equal what a real backfill would persist:

- **`photo_count`** = count of `listing_media` rows where `status='active'` **AND
  `lower(media_type)='photo'`**. FloorPlan / Video / VirtualTour / **Image** are
  excluded. (The writer matches `'photo'` only — *not* `'image'`. The pack
  reports Image-typed rows separately so you can decide if that matters.)
- **Hero** (drives `primary_photo_url`) = among those active Photo rows:
  `preferred_photo_yn = true` wins, then **lowest `order`**, then **first-encountered**
  — and "first-encountered" is the order `updateListingMediaSummary()`'s
  `findMany()` returns rows **with no `orderBy`** (i.e. Postgres physical order, not
  guaranteed `id`-ascending). `primary_photo_url = hero.media_url_original`;
  `primary_photo_r2_key = hero.r2_key`.
- **No eligible Photo** → `primary_photo_url = NULL`, `primary_photo_r2_key =
  NULL`, `photo_count = 0`.

**HARD REQUIREMENT proven by §Pack Q4:** `primary_photo_url` is sourced **only**
from an active Photo row. A FloorPlan / document / Video / VirtualTour can never
become `primary_photo_url`.

**Tie-break determinism caveat (Codex review, #364):** because the writer's
"first-encountered" tiebreak rides an `orderBy`-less `findMany`, the persisted
hero for rows that tie on **both** `preferred_photo_yn` **and** `order` is **not
guaranteed** to be the lowest `id`. The pack imposes `id ASC` as the final
tiebreak so the preview is stable/reproducible — but for those tied listings the
pack's hero may differ from what the *current* writer would persist, so the
`primary_photo_url` delta is approximate there. **§Pack Q6 measures exactly how
many listings have such a hero tie.** Recommended fix in the backfill PR: make the
writer deterministic — add `orderBy: [{ preferred_photo_yn: 'desc' }, { order:
'asc' }, { id: 'asc' }]` to the `findMany` in `updateListingMediaSummary()` and the
matching `id` tiebreak in `computeListingMediaSummary()` — so the persisted hero
equals the pack's `id ASC` and Q3's `primary_photo_url`/`r2_key` deltas become
exact.

---

## ⚠️ Sequencing danger (why order matters)

The denorm writer recomputes purely from `listing_media`. If denorm runs on a
coverage-gap listing (has JSON photos, but **no** `listing_media` rows) it would
write `photo_count = 0` / `primary_photo_url = NULL` — **erasing** the signal.

➡️ **Coverage backfill MUST run before denorm**, *or* denorm must be scoped to
listings that already have ≥1 active `listing_media` row. The pack measures the
denorm deltas **both** ways (all Active/ComingSoon vs. media-bearing-only) so the
size of this danger is explicit.

---

## Read-only SQL pack (run in Neon SQL Editor, in order)

### Q0 — confirm you are on the canonical DB
```sql
SELECT current_database() AS db, version();
SELECT count(*) AS listings_total FROM listings;
SELECT count(*) AS listing_media_total FROM listing_media;
```

### Q1 — coverage backfill count
Active/ComingSoon, non-empty `listings.media` JSON, **no** active `listing_media`:
```sql
SELECT COUNT(*) AS coverage_backfill_count
FROM listings l
WHERE lower(l.status) IN ('active','comingsoon')
  AND jsonb_typeof(l.media) = 'array'
  AND jsonb_array_length(l.media) > 0
  AND NOT EXISTS (
    SELECT 1 FROM listing_media lm
    WHERE lm.listing_id = l.listing_id AND lm.status = 'active'
  );
```

### Q1b — coverage split CRM vs IDX (feeds the "live Trestle can repopulate?" answer)
```sql
SELECT
  CASE WHEN l.listing_id LIKE 'SL-%' OR l.listing_id LIKE 'RL-%'
       THEN 'crm_exclusive' ELSE 'idx_rls' END AS kind,
  COUNT(*) AS n
FROM listings l
WHERE lower(l.status) IN ('active','comingsoon')
  AND jsonb_typeof(l.media) = 'array'
  AND jsonb_array_length(l.media) > 0
  AND NOT EXISTS (SELECT 1 FROM listing_media lm
                  WHERE lm.listing_id = l.listing_id AND lm.status = 'active')
GROUP BY 1;
```

### Q2 — sample 25 coverage-gap listings
```sql
SELECT l.listing_id,
       l.mls_id AS listing_key,
       l.address,
       l.photo_count,
       l.primary_photo_url,
       jsonb_array_length(l.media) AS media_json_length
FROM listings l
WHERE lower(l.status) IN ('active','comingsoon')
  AND jsonb_typeof(l.media) = 'array'
  AND jsonb_array_length(l.media) > 0
  AND NOT EXISTS (SELECT 1 FROM listing_media lm
                  WHERE lm.listing_id = l.listing_id AND lm.status = 'active')
ORDER BY l.listing_id
LIMIT 25;
```

### Q3 — denorm deltas (all required numbers in one query)
Mirrors the canonical writer (Photo-only, preferred→order→id hero). Compares **all
four** columns `updateListingMediaSummary()` writes — `photo_count`,
`primary_photo_url`, `primary_photo_r2_key`, `photos_change_timestamp` — so the
post-backfill re-run is a true gate (a stale R2 key or timestamp alone still
counts as "would change"). All comparisons use null-safe `IS DISTINCT FROM`.
```sql
WITH photo_rows AS (
  SELECT lm.listing_id, lm.id, lm.media_url_original, lm.r2_key,
         ROW_NUMBER() OVER (
           PARTITION BY lm.listing_id
           ORDER BY lm.preferred_photo_yn DESC, lm."order" ASC, lm.id ASC
         ) AS rn
  FROM listing_media lm
  WHERE lm.status = 'active' AND lower(lm.media_type) = 'photo'
),
counts AS (
  SELECT listing_id, COUNT(*) AS new_photo_count
  FROM listing_media
  WHERE status = 'active' AND lower(media_type) = 'photo'
  GROUP BY listing_id
),
pct AS (  -- photos_change_timestamp = max(media_modification_ts, modification_ts) over ALL active rows
  SELECT listing_id, GREATEST(MAX(media_modification_ts), MAX(modification_ts)) AS new_pct
  FROM listing_media
  WHERE status = 'active'
  GROUP BY listing_id
),
computed AS (
  SELECT l.listing_id,
         l.photo_count             AS cur_photo_count,
         l.primary_photo_url       AS cur_primary_photo_url,
         l.primary_photo_r2_key    AS cur_r2_key,
         l.photos_change_timestamp AS cur_pct,
         COALESCE(c.new_photo_count, 0) AS new_photo_count,
         h.media_url_original      AS new_primary_photo_url,
         h.r2_key                  AS new_r2_key,
         p.new_pct                 AS new_pct,
         EXISTS (SELECT 1 FROM listing_media lm
                 WHERE lm.listing_id = l.listing_id AND lm.status = 'active') AS has_active_media
  FROM listings l
  LEFT JOIN counts c     ON c.listing_id = l.listing_id
  LEFT JOIN pct p        ON p.listing_id = l.listing_id
  LEFT JOIN photo_rows h ON h.listing_id = l.listing_id AND h.rn = 1
  WHERE lower(l.status) IN ('active','comingsoon')
)
SELECT
  COUNT(*)                                                                        AS total_active_comingsoon,
  -- per-column "would change":
  COUNT(*) FILTER (WHERE cur_photo_count       IS DISTINCT FROM new_photo_count)        AS photo_count_would_change_ALL,
  COUNT(*) FILTER (WHERE cur_primary_photo_url IS DISTINCT FROM new_primary_photo_url)  AS primary_url_would_change_ALL,
  COUNT(*) FILTER (WHERE cur_r2_key            IS DISTINCT FROM new_r2_key)             AS r2_key_would_change_ALL,
  COUNT(*) FILTER (WHERE cur_pct               IS DISTINCT FROM new_pct)                AS photos_change_ts_would_change_ALL,
  -- ANY of the 4 writer columns would change — the TRUE verification gate:
  COUNT(*) FILTER (WHERE cur_photo_count       IS DISTINCT FROM new_photo_count
                      OR cur_primary_photo_url IS DISTINCT FROM new_primary_photo_url
                      OR cur_r2_key            IS DISTINCT FROM new_r2_key
                      OR cur_pct               IS DISTINCT FROM new_pct)               AS any_of_4_would_change_ALL,
  COUNT(*) FILTER (WHERE new_photo_count = 0)                                          AS rows_with_zero_active_photo_rows,
  COUNT(*) FILTER (WHERE NOT has_active_media)                                         AS rows_with_no_active_media_at_all,
  -- media-bearing-only (SAFE to denorm before coverage backfill), all 4 columns:
  COUNT(*) FILTER (WHERE has_active_media AND (
                       cur_photo_count       IS DISTINCT FROM new_photo_count
                    OR cur_primary_photo_url IS DISTINCT FROM new_primary_photo_url
                    OR cur_r2_key            IS DISTINCT FROM new_r2_key
                    OR cur_pct               IS DISTINCT FROM new_pct))               AS any_of_4_change_MEDIA_ONLY
FROM computed;
```

### Q4 — PROOF: hero is always an active Photo (never FloorPlan/document)
```sql
WITH photo_rows AS (
  SELECT lm.listing_id, lm.id, lm.media_url_original,
         ROW_NUMBER() OVER (
           PARTITION BY lm.listing_id
           ORDER BY lm.preferred_photo_yn DESC, lm."order" ASC, lm.id ASC
         ) AS rn
  FROM listing_media lm
  WHERE lm.status = 'active' AND lower(lm.media_type) = 'photo'
)
SELECT
  -- by construction this is 0; it asserts the hero row is active Photo:
  COUNT(*) FILTER (
    WHERE h.rn = 1 AND (lm.status <> 'active' OR lower(lm.media_type) <> 'photo')
  ) AS nonphoto_or_inactive_heroes,
  -- data-quality belt-and-suspenders: a Photo-typed row whose URL still looks
  -- like a Trestle DOCUMENT/floor-plan (should be 0; >0 = dirty source row):
  COUNT(*) FILTER (
    WHERE h.rn = 1 AND (h.media_url_original ~* '/Media/Property/DOCUMENT-'
                     OR h.media_url_original ~* 'floor[ _-]?plan')
  ) AS hero_url_looks_like_document
FROM photo_rows h
JOIN listing_media lm ON lm.id = h.id;
```

### Q5 — Image-typed rows (writer excludes these; quantify the discrepancy)
```sql
SELECT COUNT(*) AS active_image_typed_rows,
       COUNT(DISTINCT listing_id) AS listings_with_image_rows
FROM listing_media
WHERE status = 'active' AND lower(media_type) = 'image';
```

### Q6 — listings with an ambiguous hero tie (DIAGNOSTIC ONLY)
Counts listings where ≥2 active Photo rows tie for the top hero slot (same
`preferred_photo_yn` AND `order`) — the only rows for which the `id ASC` tiebreak
can disagree with the *current* (nondeterministic) writer.

**Q6 is a diagnostic count, NOT a gate that must reach 0.** The deterministic
`orderBy` fix changes *which* tied row wins; it does **not** modify `listing_media`
or remove tied rows, so Q6 legitimately stays `>0` after the fix and backfill.
Interpretation: if `0`, the `id ASC` tiebreak is moot and Q3's
`primary_photo_url`/`r2_key` deltas are already exact; if `>0`, the
writer-determinism fix (see the tie-break caveat above) is what makes hero
selection *deterministic* (same winner every run) — it does not, and is not
expected to, drive Q6 to 0.
```sql
WITH ranked AS (
  SELECT listing_id,
         RANK() OVER (PARTITION BY listing_id
                      ORDER BY preferred_photo_yn DESC, "order" ASC) AS rk
  FROM listing_media
  WHERE status = 'active' AND lower(media_type) = 'photo'
)
SELECT COUNT(*) AS listings_with_hero_tie
FROM (SELECT listing_id FROM ranked WHERE rk = 1 GROUP BY listing_id HAVING COUNT(*) > 1) t;
```

---

## Results — filled from live run (2026-06-06, cold-waterfall / neondb)

| Metric | Source | Value |
|---|---|---|
| Coverage backfill count (non-empty JSON + no active media) | Q1 | **1,715** |
| — CRM vs IDX split | Q1b | _not captured_ (split the 8,560 by `SL-`/`RL-` prefix before the run; production is IDX-dominant) |
| Total Active/ComingSoon | Q3 | **10,698** |
| `photo_count` would change (ALL) | Q3 | **8,541** |
| `primary_photo_url` would change (ALL) | Q3 | **2** |
| `primary_photo_r2_key` would change (ALL) | Q3 | **2,027** |
| `photos_change_timestamp` would change (ALL) | Q3 | **4** |
| **Any of the 4 columns would change (ALL)** | Q3 | **10,559** |
| **Any of the 4 would change (media-bearing only)** — the denorm work-set | Q3 | **2,027** |
| Rows with zero active Photo rows | Q3 | **8,571** |
| Rows with no active media at all | Q3 | **8,560** |
| Non-photo/inactive heroes (must be 0) | Q4 | **0** ✅ |
| Hero URL looks like document (must be 0) | Q4 | **0** ✅ |
| Active Image-typed rows | Q5 | **0** (no Image-typed rows → Photo-only `photo_count` is complete) |
| Listings with an ambiguous hero tie | Q6 | **0** (no ties → `id ASC` tiebreak is moot; Q3 deltas already exact) |

### Row split (the decision-driving categories)

| Cat | Definition | Count | Source |
|---|---|---|---|
| **A** | no active `listing_media` **at all** | **8,560** | Q3 `rows_with_no_active_media_at_all` |
| **B** | no active `listing_media` **+ non-empty** `listings.media` JSON | **1,715** | Q1 |
| **C** | no active `listing_media` **+ empty** JSON | **6,845** | **A − B** |
| **D** | `listing_media` exists but summary stale/null (**denorm-repair-only**) | **2,027** | Q3 `any_of_4_change_MEDIA_ONLY` |

**Read of the numbers:**
- **80% of Active/ComingSoon (8,560 / 10,698) have NO active media rows at all.** This
  is the dominant defect behind blank/inconsistent search cards — a **coverage**
  problem, not a dedupe one.
- **C = 6,845 have neither `listing_media` nor legacy JSON** → the media-sync pipeline
  is missing **full coverage** (new listings entering without media), not just failing
  to migrate old JSON. Coverage backfill must fetch **live Trestle Media**.
- **D = 2,027** is the denorm-only work-set (media exists, summary stale — mostly
  `r2_key` lag). `primary_photo_url`/`photos_change_timestamp` rarely change (2 / 4),
  so the denorm churn is dominated by R2-key reconciliation.
- **Q4 = 0/0, Q5 = 0, Q6 = 0** → the hero-safety + Photo-only + determinism
  assumptions all hold on real data; no surprises block the writers.

## Status × media-coverage clarification (live, 2026-06-06)

`SB0–SB3` run (status breakdown + per-status coverage + CRM/IDX split):

- **Total listings = 106,746** (NOT the 8,560 — that is a subset of *Active* inventory).
- **By status:** Closed **88,428** · Active **10,700** · Pending **4,956** · Withdrawn
  **2,660** · ComingSoon **2**. (Closed dominates; only Active/ComingSoon/AUC are
  publicly displayable.)
- **Coverage per displayable status:**
  - **Active** — total **10,702**, with media **2,137**, **without media 8,565
    (80.0% missing)**.
  - **ComingSoon** — total **2**, with media **0**, **without media 2 (100% missing)**.
  - **ActiveUnderContract** — **0 rows** (no row exists in any spelling; under-contract
    is stored as `Pending`, which the site does not display). In the allow-list for
    forward-safety only.
- **CRM vs IDX split of the missing-media set:** `idx_rls` **8,568** · `crm_exclusive`
  **0** → the media failure is **entirely public IDX/RLS inventory**, not CRM exclusives.

**Status-alias verification (code):** displayable set =
`ALLOWED_PUBLIC_STATUSES = [Active, ComingSoon, ActiveUnderContract]`
(`lib/search/public-listing-db.ts:14`, `public-listing-trestle.ts:28`). AUC canonical =
`'ActiveUnderContract'`; `'Active Under Contract'` / `'ACTIVE_UNDER_CONTRACT'` normalize
to it (`lib/compliance/status.ts:60,73,81`). DB has 0 AUC rows today.

**Corrected coverage target:** **IDX/RLS listings in a displayable status (Active +
ComingSoon + ActiveUnderContract) missing active `listing_media`, excluding `SL-`/`RL-`
≈ 8,568** (≈8,565 Active + 2 ComingSoon; AUC 0; CRM 0). **Active first; ComingSoon (2
rows) is a separate, product-policy-controlled lane.** NOT all 106,746 — Closed/Pending/
Withdrawn are not displayed and are out of scope.

## Decision (from the live numbers)

**Coverage backfill and denorm backfill MUST be two separate, sequential write PRs.**
Running denorm first would write zeros/nulls for the ~8,565 no-media rows and **lock in
the broken state**. Coverage must populate `listing_media` from live Trestle first.

**Recommended order:**
1. **Coverage backfill PR (write-gated, preview-first):**
   - Target: **IDX listings missing active `listing_media`** (the **A = 8,560** set;
     exclude `SL-`/`RL-` — run Q1b first to size the CRM subset to exclude).
   - Fetch **live Trestle Media**; write **`listing_media` only** (idempotent upsert by
     `media_key`); **no denorm writes** except whatever the existing per-listing sync
     path already does *and is explicitly proven safe*.
   - **Bounded batches**; **dry-run counts + sample `listing_id`s first**; no R2 cleanup.
2. **Denorm backfill PR (write-gated, after coverage lands):**
   - Recompute the 4 derived fields (`photo_count`, `primary_photo_url`,
     `primary_photo_r2_key`, `photos_change_timestamp`) from active `listing_media`.
   - Include the **deterministic writer `orderBy`** (`preferred_photo_yn desc, order asc,
     id asc`).
   - **Verify:** re-run Q3 → `any_of_4_change_MEDIA_ONLY` → **0**; Q4 stays **0 / 0**.
3. **Then** detail media tabs → image quality (live Trestle probe) → card layout →
   search canonicalization (the #362 replacement).

(Prior pasted probe, 2026-06-02/06, for orientation only — now superseded by the live
run above.)

---

## 1. Can live Trestle Media repopulate the coverage-gap listings?

- **IDX/RLS rows** (`listing_id` not `SL-`/`RL-`): **yes.** Their `listing_id` /
  `mls_id` is the Trestle `ListingId`/`ListingKey`; the Trestle Media resource is
  fetched by `ResourceRecordKey` (per `data/RLS-FIELD-REGISTRY.md` / the existing
  `lib/idx/media-sync.ts` ingest). IDX Plus Media serves **Photo + FloorPlan**
  only (no Video/VirtualTour rows — tours are Property URL fields). So coverage
  backfill yields the same Photo/FloorPlan rows the cron would. Stale source URLs
  may 404 → handled by the existing `r2_attempts` cooldown / soft-delete.
- **CRM exclusives** (`SL-`/`RL-`): media is **authoritative locally** (CRM
  upload), **not** from Trestle. These must **not** be pulled from Trestle —
  coverage backfill excludes them; if they have JSON-but-no-`listing_media`, that
  is a separate CRM-media migration, not a Trestle pull. Q1b quantifies how many
  of the gap are CRM vs IDX.

Expected per-listing yield after backfill ≈ the JSON length minus dedupe (the
clean table path dedupes by visual identity), split into Photo vs FloorPlan by
`media_category`/URL shape (same classifier #363 hardened).

## 2. Denorm repair — exact change set

Q3 returns the four required counts (Photo-only, mirroring the writer):
`photo_count` deltas, `primary_photo_url` deltas, rows with zero active Photo
rows, rows with no active media. Q4 proves the `primary_photo_url` source is an
active Photo only. **Run denorm scoped to `has_active_media = true`** (the
`*_MEDIA_ONLY` columns) to avoid zeroing the coverage gap.

## 3. Runtime / display effect (from code, no writes)

- Cards: `app/components/SearchListingCard.tsx` → `getHeroPhoto(listing.media)`.
  `listing.media` is built by `lib/idx/db-to-public-dto.ts` which prefers
  `resolveListingMediaFromRows` (table) and falls back to `resolveListingMedia`
  (JSON). After **coverage backfill**, gap listings switch from the JSON fallback
  to the **table path** → consistent dedupe + Photo-first hero on both card and
  detail → **card/detail mismatch reduced**.
- After **denorm backfill**, `photo_count` / `primary_photo_url` become
  trustworthy winner signals — the prerequisite for canonicalize-before-paginate
  (the #362 replacement). They are *not* yet read by `SearchListingCard` (it reads
  `media[]`), so denorm is safe/no-op for current card render and only unblocks
  the foundation.

## 4. Execution plan (for the LATER, separately-approved write PRs)

**Order: coverage backfill → verify → denorm backfill → verify.** Never denorm first.

### 4a. Coverage backfill (write PR — needs approval)
- **Path:** reuse `lib/idx/media-sync.ts` ingest (upsert `listing_media` by
  `media_key`) — already idempotent; do **not** write a parallel path.
- **Scope:** **every IDX/RLS listing missing active `listing_media`** (exclude
  `SL-`/`RL-`) — sized by **`rows_with_no_active_media_at_all` (Q3)**, NOT just the
  Q1 JSON-fallback subset. This covers both legacy JSON-only gaps AND newest
  listings with empty media (45/50 in the live sample). Fetch live Trestle Media
  for each.
- **Batch:** 100–250 listings/run; respect Trestle rate limits; 404 → existing
  `r2_attempts` cooldown (no infinite retry).
- **Idempotency:** upsert by `media_key`; re-run inserts nothing new.
- **Preview-first:** dry-run flag that logs intended upserts (no write) on a
  Vercel preview before any production run.

### 4b. Denorm backfill (write PR — needs approval)
- **Prerequisite (determinism fix, from the tie-break caveat):** add
  `orderBy: [{ preferred_photo_yn: 'desc' }, { order: 'asc' }, { id: 'asc' }]` to the
  `findMany` in `updateListingMediaSummary()` and the matching `id` tiebreak in
  `computeListingMediaSummary()`, so the persisted hero is deterministic and equals
  the pack's `id ASC`. Ship this with the denorm PR (its own unit test) so Q3 is an
  exact gate. (Only material when **Q6 > 0**.)
- **Path:** `updateListingMediaSummary(listingId)` (single `Listing.update`, the
  4 derived columns only — never touches `media` JSON or other fields).
- **Scope:** listings with `has_active_media = true` (Q3 `any_of_4_change_MEDIA_ONLY` set).
- **Batch:** 500–1000 listings/run.
- **Idempotency:** re-running with no media change writes identical values
  (proven by `media-sync` unit tests).

### 4c. Verification (after each) — success criteria
Success after the writer determinism fix + denorm backfill is **all** of:
1. The writer has a deterministic `orderBy [preferred_photo_yn DESC, order ASC,
   id ASC]` on the `findMany` (+ matching `id` tiebreak in
   `computeListingMediaSummary()`).
2. **Q3 `any_of_4_change_MEDIA_ONLY` drops to 0** for the processed set (all four
   columns — `photo_count`, `primary_photo_url`, `primary_photo_r2_key`,
   `photos_change_timestamp` — reconciled, not just the first two).
3. **Q4 `nonphoto_or_inactive_heroes` remains 0.**
4. **Q6 may remain `>0`** — tied source rows still exist; that is **acceptable**
   as long as the deterministic tiebreak selects the **same** winner every run.
   Q6 is diagnostic, **not** a pass/fail gate.
- Also: `GET /api/health` 200; spot-check the Q2 sample listing pages (card == detail hero).

### 4d. Rollback / soft-fail
- `listing_media` writes are soft (`status` flips; never hard-delete) → reversible.
- Denorm columns are **fully recomputable** from `listing_media`; before the
  denorm run, snapshot `listing_id, photo_count, primary_photo_url,
  primary_photo_r2_key, photos_change_timestamp` for the affected set to a CSV so
  any value can be restored exactly.
- Soft-fail: per-listing try/catch; a failed listing is skipped + logged, never
  aborts the batch; no partial-row writes (single `update` per listing).

## 5. Risk assessment

| Risk | Mitigation |
|---|---|
| Denorm-before-coverage zeroes the gap | Strict order; denorm scoped to `has_active_media` |
| Trestle rate-limit / 404 on stale URLs | Existing batch throttle + `r2_attempts` cooldown |
| CRM media pulled from Trestle (wrong source) | Exclude `SL-`/`RL-` from coverage backfill |
| Image-typed rows excluded from `photo_count` | Q5 quantifies; decide before run if Image should count |
| Address-suppressed rows | Backfill touches media only; display gates unchanged |
| Writing to stale DB | Q0 asserts canonical DB before any run |

## Recommendation

**Coverage backfill first, denorm second** — each as its own write PR with its
own explicit approval, preview/dry-run before production, and the Q3/Q4
re-run as the green gate. Do not start the canonical search foundation (the #362
replacement) until both land and Q3 deltas are ~0.

> **Stop after report.** No writes until you approve each backfill PR separately.
