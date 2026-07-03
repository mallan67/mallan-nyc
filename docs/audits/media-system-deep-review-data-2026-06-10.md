# Media-System Deep Review — DATA consistency across the three layers — 2026-06-10

> **Status:** read-only data-consistency audit. NO writes, no commits, no R2 operations, no cron triggers.
> **DB:** Neon `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main` — host fail-closed-guarded in every probe; session forced `default_transaction_read_only = on`. NEON.md read before any DB access. All timestamps UTC.
> **Probe scripts (untracked, `scripts/__` throwaway pattern, DO NOT COMMIT):**
> `scripts/__media-consistency-2026-06-10.mjs` (+ `….out`), `scripts/__media-consistency-2026-06-10-hero.mjs` (+ `…-hero.out`), `scripts/__media-consistency-2026-06-10-r2xref.mjs` (+ `…-r2xref.out`).
> **Companion doc (read first):** `docs/audits/media-pipeline-error-diagnosis-2026-06-10.md` — established presence-level overlap (both=3,265 · JSON-only=1,928 · table-only=1,697 · neither=8,977 of 15,867 IDX-displayable). This doc goes deeper: *consistency inside the overlap*.
> **Method note (CLAUDE.md §F):** every number below is a SQL/JS-over-SQL result captured in the `.out` files. "Estimate" labels mark anything not directly measured. R2 bucket contents were NOT listed (R2 ops out of scope) — "R2 object" counts are *DB/JSON-referenced* counts, existence in the bucket is inferred, flagged where it matters.

---

## 0. Executive summary

| Question | Answer |
|---|---|
| Hero mismatch (card vs detail can differ) | **TRUE hero divergence = 205 of 3,265 both-layer listings (6.3%)** after normalizing Cotality URL token rotation. The naive URL-string comparison says 1,934 — **1,762 of those are the SAME image under a rotated Cotality URL token** (hygiene, not divergence) and 1,287+125 match outright. Dominant true-mismatch pattern: JSON hero = R2 `photos/{id}/-1.jpg` (preferred-photo object written by the legacy idx-sync mirror) vs table hero = `photos/{id}/1.jpg` — likely the same image bytes under two keys, but unverifiable read-only. |
| Divergence direction (who is fresher) | **JSON wins on completeness, table wins on deletions — neither layer is a safe blind-copy source; Trestle is.** Of 397 count-divergent listings, JSON photo-count matches Trestle `PhotosCount` in **293 (74%)**, table matches in **11 (3%)**, neither in 93. Root cause of table shortfall is the **legacy 30-row per-listing cap** (pre-RC1): 152 listings sit at exactly 30 table rows with source >30. `updated_at` recency is misleading (table touched more recently in 316/397 — that's the frozen-cursor re-chew churn, not fresh data). |
| Tombstone leakage (compliance) | **26 listings / 121 JSON items** still carry a deleted-at-source photo in `listings.media` with NO active table row for that image — **20 of the 26 are IDX-displayable** (Active/Pending). These can render via any JSON-reading path. Small but real REBNY exposure. Full-tombstone case (ALL rows deleted, JSON still populated): 2 listings, 1 IDX-displayable (`RLS20077743`). |
| Deprecated-host backlog | **ZERO.** No `api-trestle.corelogic.com` / `api-prod.corelogic.com` URL exists anywhere — not in `listings.media` JSON (any listing), not in `listing_media.media_url_original/cached`. Everything is `api.cotality.com` or R2. The re-point backlog feared from the 2026-03-31 deprecation is already fully drained. |
| R2 dead weight | Three classes (largest first): **(1) ~16,700 JSON-referenced R2 paths with NO `listing_media` tracking row ≈ 4.0 GB** (estimate @250KB; bucket existence not verified) — lifecycle-unmanageable by table-driven cleanup; **(2) 11,030 mirrored objects for NON-displayable listings (Closed/Withdrawn/gates-off) ≈ 2.6 GB** (estimate) — billed for listings the public should never see; **(3) ~8 orphan keys on deleted rows ≈ 2 MB** (trivial). |
| Referential integrity | Excellent where it's enforced: FK present (`ON DELETE CASCADE`), **0 FK orphans**, **0 archive-side ghosts**, **0 cross-listing r2_key sharing**, **0 cross-listing `media_url_original` reuse**, **0 half-mirrored active rows** (r2_key⊕cached). The mess is *between layers*, not inside the table. |

---

## 1. Both-layer divergence (the 3,265 "both" listings)

### 1.1 Pull (D0) — one row per both-layer IDX-displayable listing

```sql
SELECT l.listing_id, l.media, l.updated_at AS l_updated_at, l.photos_change_timestamp,
       l.raw_data->>'PhotosCount' AS raw_photos_count, l.photo_count AS l_photo_count,
       l.primary_photo_url,
       a.lm_total, a.lm_photos, a.lm_max_updated, a.lm_max_created, a.lm_max_mod,
       f.first_orig, f.first_cached, f.first_type, f.first_order,
       p.p_orig AS firstphoto_orig, p.p_cached AS firstphoto_cached
FROM listings l
JOIN LATERAL (
  SELECT count(*)::int AS lm_total,
         count(*) FILTER (WHERE lm.media_type='Photo')::int AS lm_photos,
         max(lm.updated_at) AS lm_max_updated, max(lm.created_at) AS lm_max_created,
         max(lm.media_modification_ts) AS lm_max_mod
  FROM listing_media lm WHERE lm.listing_id = l.listing_id AND lm.status='active'
) a ON a.lm_total > 0
LEFT JOIN LATERAL (SELECT lm2.media_url_original AS first_orig, lm2.media_url_cached AS first_cached,
                          lm2.media_type AS first_type, lm2."order" AS first_order
                   FROM listing_media lm2 WHERE lm2.listing_id=l.listing_id AND lm2.status='active'
                   ORDER BY lm2."order" ASC, lm2.id ASC LIMIT 1) f ON true
LEFT JOIN LATERAL (SELECT lm3.media_url_original AS p_orig, lm3.media_url_cached AS p_cached
                   FROM listing_media lm3 WHERE lm3.listing_id=l.listing_id AND lm3.status='active' AND lm3.media_type='Photo'
                   ORDER BY lm3."order" ASC, lm3.id ASC LIMIT 1) p ON true
WHERE l.idx_display_yn = true
  AND jsonb_typeof(l.media)='array' AND jsonb_array_length(l.media)>0;
-- pulled rows: 3,265  ✓ matches the prior agent's both-set exactly
```

JSON photo classification in JS mirrors `classifyMediaItem` (`lib/media/listing-media-resolver.ts`): `mediaType`/`MediaCategory` first, then URL-shape floor-plan/document/PDF detection, proxy-unwrap first.

### 1.2 Photo-count divergence (D1)

| metric | count | % of 3,265 |
|---|---|---|
| total-item count differs (JSON len ≠ active rows) | **122** | 3.7% |
| — differs by >5 | 56 | 1.7% |
| — differs by >20 | 20 | 0.6% |
| **photo-class count differs** (JSON photos ≠ table `media_type='Photo'` rows) | **395** | 12.1% |
| — differs by >5 | 59 | 1.8% |
| — differs by >20 | 20 | 0.6% |

(The photo-class number is larger than the total number because JSON items carry no `MediaCategory` for ~2K legacy first-position floor plans — classification differences between the JSON heuristic and the table's `media_type` column surface as photo-count diffs even when totals agree. The **total-diff 122** is the cleaner "row sets genuinely differ" count; the >5 / >20 buckets are nearly identical on both metrics, i.e. the big divergences are real.)

### 1.3 Worst divergences (D2) — the legacy 30-row cap signature

Top of the sorted list (all from `…2026-06-10.out` D2):

| listing | JSON items | table rows | Trestle `PhotosCount` | note |
|---|---|---|---|---|
| RLS20018278 | 111 | **30** | 111 | JSON == source; table capped |
| RLS20079319 | 93 | **30** | 93 | same |
| RLS20077761 | 78 | **30** | 78 | same |
| RLS20064026 | 78 | **30** | 78 | same |
| RLS10949877 | 70 | **30** | 70 | same |
| RLS10933821 | 69 | **30** | 69 | same |
| RLS11001357 | 69 | **30** | 69 | same |
| RLS20073831 | 4 | 37 | 21 | reverse case — JSON stale-short, table over-long, neither matches source (listing touched 2026-06-10) |

Cap confirmation (C1, hero probe):

```sql
SELECT count(*) FILTER (WHERE src > 30 AND lm_total = 30)  AS capped_exactly_30,    -- 152
       count(*) FILTER (WHERE src > 30 AND lm_total < src)  AS table_truncated,      -- 162
       count(*) FILTER (WHERE src > 30)                     AS listings_source_gt30, -- 203
       count(*) FILTER (WHERE src > 30 AND lm_total >= src) AS gt30_complete         --  41
FROM (SELECT NULLIF(l.raw_data->>'PhotosCount','')::int AS src,
             (SELECT count(*) FROM listing_media lm WHERE lm.listing_id=l.listing_id AND lm.status='active') AS lm_total
      FROM listings l
      WHERE l.idx_display_yn AND NULLIF(l.raw_data->>'PhotosCount','') IS NOT NULL
        AND EXISTS (SELECT 1 FROM listing_media lm WHERE lm.listing_id=l.listing_id AND lm.status='active')) s;
```

**162 IDX-displayable listings have a table layer truncated below Trestle's `PhotosCount`; 152 sit at exactly 30 rows** — the old `DEFAULT_MEDIA_PER_LISTING = 30` ingest cap. RC1 (`lib/idx/media-sync.ts`, `DEFAULT_MEDIA_PAGE_SIZE = 200` + `@odata.nextLink` pagination) fixed this *going forward*, but these listings' `PhotosChangeTimestamp` values (Apr/early-May) are **behind the frozen cursor (2026-05-14)** — the catch-up will NOT revisit them even after it unfreezes. They need a targeted re-sync, not a drain. (Class A, code+data confirmed; the 41 "complete" listings were re-synced during the 06-09 RC1 burst.)

### 1.4 Hero / first-image comparison — naive vs normalized

**Naive exact-URL comparison (D1)** — JSON[0] proxy-unwrapped vs table min-order row (`media_url_original` or `media_url_cached`):
match 1,206 + first-photo-row match 125, **"mismatch" 1,934**. All 1,206 naive matches were via `media_url_cached` (R2 URLs); zero matched via `media_url_original`.

**Why the naive number is wrong:** Cotality media URLs embed a *rotating trailing token*. Sample (D3): `…/PHOTO-Jpeg/1159868340/1/NjA0My8…/MjAvMjE1MjYv` + `MTc3ODU…` (JSON, May write) vs + `MTc4MDk…` (table, June write) — **same media id `1159868340`, sequence 1, different token**. Same image; the string comparison can't see it.

**Normalized comparison (H1)** — identity = `/Media/Property/{KIND}/{mediaId}/{seq}` for Cotality, pathname for R2. Two comparisons run:

(a) **position-0** (JSON[0] vs table min-order row):

| bucket | count |
|---|---|
| exact URL match | 1,206 |
| same media identity, token-rotated only | 1,750 |
| different identity, but JSON[0]'s image exists elsewhere in table (order shift) | 149 |
| **different identity, JSON[0]'s image NOT in table at all** | **160** |

(b) **production-hero** (first *photo-classified* JSON item vs table preferred/first `Photo` row — what the card/detail actually disagree on):

| bucket | count |
|---|---|
| exact URL match | 1,287 |
| same identity, token-rotated only | 1,762 |
| order shift (image present, different position) | 4 |
| **JSON hero image not in table at all** | **201** |
| JSON has no photo-classed item / table has none | 10 / 1 |

**TRUE hero-divergence = 205 listings (4 + 201) = 6.3% of the both-set.** Sampled mismatches (H3) are overwhelmingly one pattern: JSON hero = `https://pub-….r2.dev/photos/{LID}/-1.jpg` vs table hero cached = `…/photos/{LID}/1.jpg` (e.g. RLS20088794, RLS20071803, RLS20087174, RLS20086895, RLS20056749). The `-1.jpg` key is the legacy idx-sync mirror's name for the `PreferredPhotoYN` item (order `-1`); the table mirrors the same listing's photos under natural orders starting at 1. **Likely the same image stored under two keys — but that is a hypothesis (bytes not compared, read-only); worst case these 205 listings show a different card vs detail photo.** Note all sampled table heroes have `order = 1`, not 0 — Trestle's Order starts at 1 here; "Order-0 row" per the task spec was implemented as min-order active row.

### 1.5 Staleness direction (D1) — which layer to trust

For the 397 count-divergent listings, scored against the live-ish source of truth `raw_data->>'PhotosCount'` (kept fresh by idx-sync):

| verdict | count |
|---|---|
| JSON photo-count == `PhotosCount`, table ≠ | **293 (74%)** |
| table == `PhotosCount`, JSON ≠ | **11 (3%)** |
| neither matches | 93 (23%) |
| both match (impossible when divergent) / no source count | 0 / 0 |

Timestamp comparison on the same set: `max(listing_media.updated_at)` > `listings.updated_at` in 316/397 — **the table LOOKS fresher but is more wrong.** That is the frozen-cursor idempotent re-chew bumping `updated_at` without adding rows (companion doc §1.2). 

**Direction verdict: do NOT reconcile by layer-copy in either direction.** JSON is more complete on counts (because the table was 30-capped); the table is authoritative on deletions/tombstones (JSON has no delete path since the backfill pause). The only correct reconcile source is Trestle itself (RC1's paginated fetch), per listing.

---

## 2. Tombstone leakage (compliance)

### 2.1 Full tombstone, JSON still serving (T1/T2)

```sql
SELECT count(*) AS listings, count(*) FILTER (WHERE l.idx_display_yn) AS idx_displayable,
       count(*) FILTER (WHERE l.idx_display_yn AND l.status IN ('Active','ActiveUnderContract','ComingSoon','Pending')) AS idx_and_live
FROM listings l
WHERE jsonb_typeof(l.media)='array' AND jsonb_array_length(l.media)>0
  AND EXISTS (SELECT 1 FROM listing_media lm WHERE lm.listing_id=l.listing_id)
  AND NOT EXISTS (SELECT 1 FROM listing_media lm WHERE lm.listing_id=l.listing_id AND lm.status='active');
-- listings=2 · idx_displayable=1 · idx_and_live=1
```

The IDX-displayable one: **`RLS20077743`** (Active, 1 JSON item, raw `PhotosCount=1`, row tombstoned 2026-06-09T13:46Z). Note its `PhotosCount=1` means Trestle *still advertises a photo* — this specific tombstone may itself be wrong (404-strike on a rotated URL), worth one eyeball during cleanup.

### 2.2 Precise per-image leakage (L1/L2) — the compliance number

Identity-matched in JS (Cotality media-id normalization, so token rotation can't hide a match): JSON items whose image identity equals a **deleted** row's and has **no active** row:

```text
listings_with_deleted_rows = 41
leak listings              = 26   (121 leaked JSON items total)
leak IDX-displayable       = 20   ← compliance-relevant count
```

Samples (L2): `RLS20015263` (Pending, **21 of its 23 JSON items are deleted-at-source**), `RLS20022178` (Active, 3), `RLS20036897` (Pending, 2), `RLS10952928`/`RLS10952929` (Active, 2–3 each); Withdrawn ones (`RLS20082431` 8/8, `RLS20042207` 12, `RLS20046236` 12) are gated off IDX but the JSON still holds the URLs. **Any JSON-reading render path (cards, legacy DTO re-feed) can still serve REBNY-removed photos for the 20 IDX-displayable listings.** T4 cross-check (SQL-only, count-based): 26 listings with active+deleted rows where JSON length > active rows — agrees.

### 2.3 Reverse direction — placeholder cards over real photos (T3)

```sql
-- JSON empty/missing but table HAS active rows
listings=2,075 · idx_displayable=1,696 · idx_with_primary_photo_url_set=1,688
```

Matches the prior agent's table-only 1,697 (one listing shifted overnight). UX-only: the PR-4 reader serves these from `listing_media`, but any surface still reading `listings.media` JSON (ops-health first-image metric, any legacy card path) sees a placeholder while detail has photos. 1,688 of 1,696 already have `primary_photo_url` set, so column-reading cards are fine.

---

## 3. URL shapes inside `listings.media` JSON

### 3.1 Item key shape × host (U1, IDX-displayable; U2 all listings)

| shape | host class | items | listings |
|---|---|---|---|
| `url` | api.cotality.com (bare) | 44,183 | 2,973 |
| `url` | R2 (`pub-*.r2.dev` / images.mallan.nyc) | 28,485 | 2,017 |
| `MediaURL` | api.cotality.com (bare) | 828 | 224 |
| any | `/api/media/proxy?...` wrapped | **0** | 0 |
| any | deprecated corelogic hosts | **0** | 0 |
| any | other hosts / missing url | **0** | 0 |

All listings (U2): non-displayable add 11,409 R2 items (1,778 listings) + 10,845 cotality items (1,392 listings). U3 (sample of "other" hosts): **empty** — the host universe is exactly {cotality, r2}.

### 3.2 Deprecated-host backlog (U4/U5): **ZERO — already drained**

```sql
-- U4: listing_media.media_url_original host distribution
active:  cotality 81,908 rows (5,730 listings) · r2 10 rows (SL-0004) 
deleted: cotality 217 · r2 8
-- U5: JSON items on api-trestle.corelogic.com / api-prod.corelogic.com (all listings): 0 rows
```

No re-point work exists on either layer. The 2026-03-31 hard-deprecation risk is **closed** for stored data. (Residual hygiene: 828 `MediaURL`-shaped legacy items across 224 listings — ops-health already classifies both shapes; normalize opportunistically on next JSON write, no dedicated pass needed.)

**Token-staleness flag (estimate/hypothesis):** the 44,183+828 JSON cotality URLs carry write-time rotating tokens (§1.4). 1,762 of 3,265 both-set heroes are token-rotated vs the table. Whether Cotality honors old tokens indefinitely is NOT verified here; the companion doc's E8 404s ("External media was not downloaded") show Cotality URLs *do* die. JSON-fallback rendering of cotality URLs is therefore decay-prone — an argument for finishing the table/R2 migration, not for a URL-rewrite pass.

---

## 4. R2 referential integrity

### 4.1 In-table integrity (R0/R1/R1b/R2b/R3) — clean

```sql
-- R0 status distribution: active 81,918 · deleted 225 (no 'replaced' rows exist)
-- R1 (active rows): key_but_no_cached=0 · cached_but_no_key=0 · fully_mirrored=81,841
--    cached_not_derived_from_key=1  → SL-0004 hero/card variant pairing (upload route stores
--    card variant in cached, hero in r2_key) — BY DESIGN, not a defect
-- R2b r2_keys shared across different listings: 0
-- R3 same media_url_original on active rows of DIFFERENT listings: 0 groups
--    → the "legit building-photo reuse vs accidental cross-listing" question is moot: there is NO
--      cross-listing URL sharing at all; the 20 shared r2_keys from the companion doc are
--      same-listing order-collision pairs (already counted there)
```

**Half-mirrored rows: 0. Cross-listing contamination: 0.** Active-row mirror coverage is 81,841/81,918 = 99.9%.

### 4.2 Dead-weight class 1 — deleted rows holding r2_keys (R2a)

```sql
status='deleted' AND r2_key IS NOT NULL → 31 rows · 30 distinct keys · 22 keys also on an active row
```

→ **~8 billed-but-dead objects ≈ 2 MB @ 250KB avg (estimate).** Trivial; matches companion doc.

### 4.3 Dead-weight class 2 — mirrored media for NON-displayable listings (G4/G4b)

```sql
SELECT count(*), count(DISTINCT lm.listing_id), count(*) FILTER (WHERE lm.r2_key IS NOT NULL), …
FROM listing_media lm JOIN listings l USING (listing_id)
WHERE lm.status='active' AND NOT l.idx_display_yn;
-- active_rows=11,033 · listings=770 · mirrored_rows=11,030
-- gate detail: internet_entire_display_off rows=10 · participant_only=0 · owner_opt_out=0
-- by status: Closed 7,076 rows (7,074 mirrored) · Withdrawn 3,947 (3,946) · Active 10 (10)
```

→ **11,030 R2 objects ≈ 2.6 GB (estimate @250KB) mirrored for listings the public must not see.** Mostly lifecycle drift (listings went Closed/Withdrawn *after* mirroring — `tombstoneVanished` only fires when the listing re-enters the sync window, and terminal statuses fall out of the Active/Pending keyset filter, so their media rows are never revisited). The 10 Active rows with `internet_entire_listing_display_yn=false` are the only *gate-off* mirrors. Compliance exposure is indirect: objects are public-by-URL on `pub-*.r2.dev` but unlinked from any rendered page; REBNY exposure is therefore low-but-nonzero (removed/withdrawn listing photos persisted on a public host).

### 4.4 Dead-weight class 3 — JSON-referenced R2 objects the table doesn't track (X1/X2)

Cross-reference of every R2 path in `listings.media` JSON (39,894 items / 39,601 distinct paths, all listings) against every `listing_media.r2_key` (81,872 rows):

```text
distinct JSON r2 paths                 39,601
  shared with a table r2_key           22,901
  JSON-ONLY (no tracking row)          16,700   ← across 2,434 listings; 7,879 paths on idx-displayable
    of which legacy preferred "-1.jpg"    422
table ACTIVE keys not in any JSON      58,936   (expected — post-PR-4 table-only world)
```

→ **~16,700 R2 objects ≈ 4.0 GB (estimate @250KB; bucket existence NOT verified — these are references, the objects were presumably uploaded by the legacy idx-sync mirror)** that no `listing_media` row knows about. Sample paths (X2): `photos/rls10248351/1.jpg`, `floorplans/rls10702859/1.jpg`, … — old lowercase-era and JSON-only-listing mirrors. **Consequence: any table-driven R2 cleanup will never touch these; conversely, deleting them before the JSON layer is retired breaks the 1,928 JSON-only listings' images.** This is the single biggest R2-inventory blind spot.

**Total R2 dead-weight estimate: ~6.6 GB upper bound** (4.0 GB untracked + 2.6 GB non-displayable + 2 MB orphans), against ~20.5 GB implied total for 81,841 tracked objects (all @250KB avg — label: ESTIMATE; actual avg object size not measured).

---

## 5. Ghost / orphan edges (G1–G5)

```sql
-- G1 FK: listing_media_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(listing_id)
--        ON UPDATE CASCADE ON DELETE CASCADE   ← enforced at DB level
-- G2 FK orphans: 0
-- G3 lm rows whose listing_id appears in listings_archive: 0
-- G5 displayable active rows by status: Active 37,442 (37,397 mirrored) · Pending 33,443 (33,414)
```

No ghost edges inside Postgres. The only "ghosts" in the system remain the 3 feed-side listings absent from `listings` (companion doc §1.3) — they have no media rows by definition (FK refuses).

---

## 6. Cleaning inventory (the systematic-cleaning table)

| # | Mismatch class | Count | Severity | Data direction (who wins) | Safe remediation | Blocked by |
|---|---|---|---|---|---|---|
| 1 | **Deleted-at-source photos still in JSON** (per-image leakage) | **26 listings / 121 items; 20 IDX-displayable** | **COMPLIANCE** | Table (tombstones are authoritative) | One-off approved script: strip the 121 identity-matched items from those 26 listings' JSON (or null the JSON and let table/columns serve). Tiny, enumerable, idempotent. Verify `RLS20077743` first (its tombstone may itself be wrong — source still says PhotosCount=1). | Maya approval for any write; not blocked by cursor or holds technically |
| 2 | **True hero divergence** (JSON hero image absent from table) | **205 listings** (201 not-in-table + 4 order-shift) | UX (card ≠ detail) | Trestle (re-fetch); pattern suggests same image under `-1.jpg` vs `1.jpg` keys | Resolved automatically by a targeted media re-sync of the affected listing keys (RC1 path now handles preferred ordering); alternatively unified reader preference for the table layer | Frozen cursor fix first (P0, companion doc §5); these PCTs are mostly *behind* the cursor → need targeted re-sync, drain alone won't fix |
| 3 | **Table truncated at legacy 30-row cap** | **162 listings** (152 at exactly 30; source >30) | UX (detail gallery missing up to 81 photos) | **JSON/source wins on count** (JSON==PhotosCount in 74% of divergent) | Targeted re-sync of the 203 `PhotosCount>30` listing keys through the RC1 paginated fetch (one-off, ~7K Media rows) | Cursor is *past* their PCT — needs an explicit backfill run (manual cron/backfill = HELD, Maya approval) |
| 4 | **JSON-empty, table-populated** (placeholder cards) | 1,696 IDX-displayable | UX | Table wins | No data fix needed if all readers use table/columns (1,688 already have `primary_photo_url`); audit remaining JSON-reading card paths (Class A code question, not data) | M1 (JSON-vs-table unification) HELD |
| 5 | **Token-rotated stale Cotality URLs in JSON** | 1,762 heroes; ~45K items carry write-time tokens | Hygiene → latent UX (URLs decay; E8-class 404s) | Table fresher (newer tokens) but also decays; real fix is R2-first serving | Don't URL-rewrite; finish table+R2 migration so JSON Cotality URLs stop being a render path | M1 HELD; frozen cursor starves Phase-3 mirroring |
| 6 | **Untracked JSON-only R2 objects** | ~16,700 paths ≈ **4.0 GB (est.)** | Cost + inventory blind spot | n/a | AFTER JSON layer is retired/reconciled: bucket-list diff (R2 list vs `r2_key` set) → delete unreferenced. **Do NOT delete now** — they serve the 1,928 JSON-only listings | R2-cleanup HELD; must sequence after #4/M1 |
| 7 | **Mirrored media for non-displayable listings** | 11,030 objects ≈ **2.6 GB (est.)**, 770 listings | Cost + low-grade compliance (public-by-URL) | Table (gates are correct; media lifecycle lagged) | Add terminal-status/gate sweep to media-sync (tombstone + R2 delete on Closed/Withdrawn); backfill sweep for the existing 770 | R2-cleanup HELD; writer-loop change needs approval |
| 8 | **Orphan r2_keys on deleted rows** | ~8 objects ≈ 2 MB | Hygiene | — | Fold into #6's bucket-diff; not worth a dedicated pass | R2-cleanup HELD |
| 9 | Same-listing dup rows / shared r2_keys | 12 rows / 20 keys (companion doc) | Hygiene (20 possible wrong-image displays) | — | One-off dedupe (keep `isBetterDuplicate` winner) | Write approval |
| 10 | `MediaURL`-shaped legacy JSON items | 828 items / 224 listings | Hygiene | — | Normalize on next JSON write; readers already tolerate both | None (no action needed) |
| 11 | Deprecated corelogic hosts | **0** | — | — | **CLOSED — no work exists** | — |
| 12 | FK orphans / archive ghosts / cross-listing reuse / half-mirrored | **0 / 0 / 0 / 0** | — | — | Nothing to clean | — |

### Safe execution order

1. **Unfreeze the cursor** (companion doc P0 — ghost-listing skip fix). Prerequisite: restores table freshness and Phase-3 mirror budget; nothing data-side should be reconciled against a frozen table layer.
2. **Compliance strike: #1** (121 leaked JSON items on 26 listings) — smallest, enumerable, highest legal relevance; independent of the cursor.
3. **Targeted re-sync backfill: #3 + #2 together** (the 203 `PhotosCount>30` keys + the 205 hero-divergent keys, deduped — one approved backfill run through the RC1 fetch path repairs both count truncation and hero ordering, and refreshes tokens).
4. Then M1 reconciliation decision (#4/#5), then R2 lifecycle work (#7, then #6+#8 bucket-diff last — only after the JSON layer stops being a render dependency).

---

## 7. Appendix — probe-run record

- All queries executed read-only against `ep-cold-waterfall-adno3ao2`, 2026-06-10 ~23:0x–23:3xZ, `statement_timeout=300s`, `default_transaction_read_only=on`.
- Raw outputs: `scripts/__media-consistency-2026-06-10.out` (T/U/R/G/D sections), `…-hero.out` (H/L/C sections), `…-r2xref.out` (X sections). All untracked.
- Estimates are labeled inline; the two material ones are the 250KB-average object size (not measured) and R2-bucket existence of JSON-referenced paths (not listed — R2 ops out of scope).
- Live-Trestle verification was NOT performed in this audit (DB-side only); `raw_data->>'PhotosCount'` is used as the source proxy (kept fresh by idx-sync per the companion doc). Per CLAUDE.md §J, any PR built on §1.3/§1.4 should re-confirm a sample of the 162/205 listings against live Trestle before writing.

*Read-only audit by Claude (Fable 5), 2026-06-10. No production state modified, no R2 operations performed, probe scripts left untracked.*
