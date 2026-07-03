# Media DUPLICATION Audit — JSON × listing_media × R2 — 2026-06-12

> ## ⛔ REPORT-ONLY · ALL CLEANUP BLOCKED UNTIL C6 SETTLEMENT
> **No DB writes. No R2 calls (zero — the R2 side reuses the cached full inventory). No deletions.**
> Every figure here feeds the post-C6 billing-risk map; nothing in this document authorizes action.
> Cleanup sequencing stays per Maya's 2026-06-12 order (resurrect 142 → strike 10 → 366-key re-sync →
> M4 re-eval → R2 orphan cleanup LAST), canonical at
> `docs/superpowers/plans/2026-06-10-phase1-media-loop-closures-plan.md` (Amendment 2026-06-12).
> **DO NOT COMMIT this file** (stays untracked alongside the probe scripts).
>
> **DB:** canonical prod only — Neon `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch `main`.
> Probe host-fail-closed-guarded; session forced `default_transaction_read_only = on`; SELECT-only.
> **R2:** REUSED `scripts/__r2-inventory-2026-06-12.json` (263,618 keys+sizes, captured 2026-06-12T21:46:16Z) — **0 List/Get calls spent**.
> **Probe (untracked `scripts/__` pattern, DO NOT COMMIT):** `scripts/__media-dup-2026-06-12.mjs`
> → `scripts/__media-dup-2026-06-12-summary.json`. DB pull 2026-06-12T21:57:58Z.
> **Identity normalization:** byte-identical to the 06-10/06-12 probes —
> `mediaIdentity` = `/Media/Property/{KIND}/{mediaId}/{seq}` for Cotality (token-rotation-proof), pathname for R2, `"/"+r2_key` for bare keys.
> **Predecessors (referenced, not redone):** `docs/audits/r2-inventory-cost-audit-2026-06-12.md` (orphan/tombstone/gated breakdowns) ·
> `docs/audits/media-system-deep-review-data-2026-06-10.md` · `docs/audits/resync-360-dryrun-2026-06-12.md` ·
> `docs/audits/strike-121-dryrun-2026-06-12.md`.
> **Volatility:** the RC1/RC3 drain mutates `listing_media` every 15 min (active rows 163,626 / deleted 7,345 at pull time).
> Every count is a snapshot; the DB pull is ~12 min after the inventory snapshot — rows mirrored in that gap are
> flagged, none materialized (see §9).

---

## 0. TL;DR — where the duplication actually is (and is not)

| # | Question | Answer | Bytes |
|---|---|---|---|
| 1 | Double-stored listings (JSON ∧ active table rows) | **4,469 listings** (4,010 IDX-displayable) · 65,749 JSON items vs 65,094 active rows | Neon JSON copy 10.90 MB; 25,705 R2 objects pointer-referenced by both layers (11.86 GB — **one** stored copy, two pointer layers) |
| 2 | JSON vs table DISAGREE | count mismatch **167** listings (90 by >5) · **true hero divergence 329** (324 not-in-table + 5 order-shift) | n/a |
| 3 | `media_key` duplicated across rows | **0** (DB `@unique` enforced; also **0 NULL** media_key rows) | 0 |
| 4 | R2 objects duplicated per source MediaKey | **Structurally impossible by path** (deterministic `{ns}/{lid}/{order}.jpg`, 0 keys embed a mediaId — token rotation overwrites in place). Real path-level dup class: **1,023 `-1.jpg` preferred-photo keys** with numbered siblings; 0 case-fold dups | 0.643 GB (presumed same-bytes; unverified) |
| 5 | Multiple active rows → same R2 object | **84 keys / 168 rows**, all same-listing order-collisions, **0 cross-listing** | 0.044 GB shared (no extra storage) |
| 6 | JSON-only items (no table row at all) | **29,266 items / 4,086 listings** (12,223 R2-shaped → 12,170 keys all present in bucket; 17,043 Cotality-shaped, token-decay-prone) | 5.42 GB R2 |
| 7 | Table-only active rows (no JSON counterpart) | **100,374 rows / 7,323 listings** (98,532 of the rows on empty-JSON listings) | 27.14 GB R2 (58,053 keys, all in bucket) |
| 8 | Tombstoned-but-live-at-source | **142 items / 27 listings** (cited from strike dry-run, live-verified ~20:30Z same day) | — |
| 9 | Live-table-but-dead-source (render-broken) | **0** | 0 |
| 10 | Safe-normalization reduction | Neon: ≤ 15.72 MB total (trivial). R2: dedupe adds only **+278 objects / +0.178 GB** beyond the inventory audit's ~50.1 GB candidate set | see §10 |

**Headline:** the system's "duplication" is overwhelmingly **pointer duplication, not byte duplication.** R2 stores ~one copy per image (deterministic keys make token-rotation re-uploads overwrite, not multiply); the only real byte-dup class is the 1,023 legacy `-1.jpg` preferred-photo objects (0.64 GB), and 73% of those are already inside the inventory audit's 50.1 GB cleanup-candidate set. Dedupe is **not** a material new billing lever — the orphan cleanup already on the books is.

---

## 1. Double-stored set — JSON ∧ table (report item 1)

Listings with `jsonb_array_length(media) > 0` AND ≥1 `listing_media.status='active'` row:

- **4,469 listings** (of 11,155 listings that have any active row; 4,010 of the 4,469 are `idx_display_yn=true`).
  Up from 3,265 on 06-10 and 3,995 at the resync dry-run hours earlier — the drain keeps adding table layers to formerly JSON-only listings.
- Item volume: **65,749 JSON items** vs **65,094 active rows** on the same listings (near-parity in aggregate; per-listing divergence in §2).
- **Neon-side duplicate bytes: 10.90 MB** (octet_length of those listings' `media` JSON — the redundant metadata copy).
- **R2 double-reference: 25,705 distinct objects (11.86 GB)** are pointed at by BOTH the listing's JSON and an active table row.
  This is one stored copy with two pointer layers — **no extra R2 storage**, but it is the set whose lifecycle two
  uncoordinated writers manage (the core M1 reconciliation risk: a table-driven delete breaks JSON readers and vice versa).

## 2. JSON vs table disagreement inside the both-set (report item 2)

Same normalization as the resync dry-run (production-hero comparison, token-rotation-aware):

| Bucket | Count |
|---|---|
| total-item count mismatch (JSON len ≠ active rows) | **167** of 4,469 (3.7%) |
| — mismatch by >5 | 90 |
| hero match (exact or token-rotated — identity equal) | 4,124 |
| hero order-shift (image present elsewhere in table) | 5 |
| hero NOT in table at all | 324 |
| **true hero divergence** | **329 (7.4%)** |
| no JSON photo / no table Photo row | 15 / 1 |

Consistent with the resync dry-run's 268/3,995 (idx-displayable only, ~90 min earlier): this run's both-set includes
non-displayable listings and the drain grew the set; the dominant pattern is unchanged — sampled mismatches are
`photos/{lid}/-1.jpg` JSON heroes vs table hero seq 1 (e.g. RLS20088794, RLS20071803, RLS20087174 — same trio of
patterns as 06-10 §1.4). **Remediation is already planned**: these listings are the resync-366 set's hero-divergence
class (re-derive fresh at execution; membership has visibly drifted 268 → 329 in hours).

## 3. `media_key` duplication across `listing_media` rows (report item 3)

```sql
SELECT media_key, count(*) FROM listing_media WHERE media_key IS NOT NULL GROUP BY 1 HAVING count(*)>1;  -- 0 rows
SELECT status, count(*) FROM listing_media WHERE media_key IS NULL GROUP BY 1;                            -- 0 rows
```

**Zero duplicates, zero NULLs** — the Prisma `@unique` on `media_key` (schema line 2331) is doing its job across all
170,971 rows. Same-listing duplication therefore only manifests at the *R2-key* level (§5), never at the Trestle-PK level.

## 4. R2 objects duplicated per source MediaKey (report item 4)

**The hypothesized class structurally cannot exist.** `buildMediaR2Key` (`lib/media/media-sync-service.ts:139-154`)
produces deterministic `{photos|floorplans|videos|virtualtours}/{listingId}/{order}.jpg` — the Trestle mediaId is
**not** in the path, so a token-rotated re-upload computes the SAME key and overwrites in place. Verified against the
full inventory: **0 of 263,618 keys** carry a ≥9-digit sequence segment (no mediaId-keyed scheme ever existed in this bucket).

Path-parse-detectable duplicate classes that DO exist:

| Class | Objects | Bytes | Note |
|---|---|---|---|
| `-1.jpg` legacy preferred-photo key with numbered siblings | **1,023** | **0.643 GB** | Written by the legacy idx-sync mirror for `PreferredPhotoYN` (order −1); the same image presumably also exists under its natural order key. **Same-bytes is a hypothesis** — content not compared (read-only, no GETs), exactly the 06-10 §1.4 caveat. |
| `-1.jpg` with NO numbered sibling | 165 | — | Not duplicates — possibly the only surviving copy; must NOT be treated as dedupe fodder. |
| Case-fold duplicates (same key differing only in case, e.g. `rls…` vs `RLS…`) | **0** | 0 | The lowercase-era paths (06-10 §4.4) never got uppercase twins at the same seq — they are orphans, not duplicates. |

## 5. Multiple `listing_media` rows → same R2 object (report item 5)

- **84 R2 keys** are referenced (via `r2_key` / `media_url_cached`) by **2 active rows each** (168 rows total).
- **0 cross-listing** — every collision is same-listing (confirms 06-10 R2b; grown from 20 keys to 84 under the drain).
- Shared-object bytes: 0.044 GB — **no storage waste** (one object), but a wrong-image-display risk: pairs are
  order-collisions between a legacy row and a drain row (e.g. `photos/RLS11027695/9.jpg` ← row #8237 ord 19 AND row
  #91898 ord 9 — the legacy row's cached URL now points at a *different position's* image). These 84 are
  dedupe-row candidates for the (HELD) cleaning-inventory #9 pass (`isBetterDuplicate` winner), and a complete
  re-sync of the affected listings would also resolve them.

## 6. JSON-only media (report item 6)

JSON items whose identity matches **no `listing_media` row at all** (any status):

- **29,266 items across 4,086 listings.**
- **12,223 R2-shaped items → 12,170 distinct keys, ALL present in the bucket — 5.42 GB.** These objects are exactly the
  "lifecycle-unmanageable by table-driven cleanup" class (06-10 §4.4's ~16,700 estimate, now drained down to 12,170 as
  the table layer claims listings). They are NOT orphans (the JSON pointer exists) and are protected in the inventory
  audit's candidate math; they shrink as the drain/re-sync converts their listings to table-tracked.
- **17,043 Cotality-shaped items** — no R2/table presence at all; carry write-time rotating tokens, decay-prone
  (06-10 §3.2 token-staleness flag). Render exposure only via JSON-reading paths.

## 7. Table-only active rows (report item 7)

Active rows whose identity appears nowhere in their listing's JSON:

- **100,374 active rows across 7,323 listings** — 61% of all active rows, as expected post-PR-4 / mid-drain.
- **98,532 of those rows (98%) sit on listings whose JSON is empty/missing entirely.** Precise listing-level split:
  **11,155 listings have ≥1 active row; 6,686 of them have empty/no JSON (6,194 IDX-displayable).**
  (The tasking's "8,140 public rows have empty JSON" figure is not reproduced by this probe — measured today it is
  6,194 IDX-displayable empty-JSON listings; the drain backfills JSON on touched listings, so this number falls daily.)
- R2 footprint: **58,053 distinct keys, all present in bucket — 27.14 GB** referenced ONLY by the table layer.
  This is the system's healthy end-state shape (table = source of truth), not a defect; it is listed here because any
  JSON-favoring "reconciliation" would orphan it — direction-of-copy must stay table/Trestle-first (06-10 §1.5 verdict).

## 8. Tombstoned-but-live-at-source (report item 8 — cited, not re-derived)

Per `docs/audits/strike-121-dryrun-2026-06-12.md` §0/§2 (live Cotality verification run ~2026-06-12T20:30Z, ~90 min
before this probe): **142 of 160 leak items are WRONG tombstones — still live at source by MediaKey** (legacy Cp4
3×-404 soft-deletes on rotated URLs); only 10 items / 2 listings are genuinely deleted-at-source; 8 are SL-0004
(non-Trestle). **No Trestle call was made in this audit; that count is honest-stale by ~90 minutes** and the drain both
adds and cures leaks — re-run both strike probes at execution time. Resurrection of the 142 is cleanup step 1 and
re-activates rows whose R2 objects the inventory audit already carve-out-protects (its keep-set intersection was 0).

## 9. Live-table-but-dead-source — render-broken candidates (report item 9)

**ZERO.** Across all 163,626 active rows:

- rows with NO URL of any kind: **0**
- rows whose R2 pointer is absent from the inventory AND have no `media_url_original` fallback: **0**
  (0 even before excluding the 0 rows touched after the inventory snapshot)
- rows whose R2 pointer is missing but original exists (degraded-to-proxy): **0**
- unmirrored active rows (no R2 pointer yet, original present — RC1 drain backlog, serve via proxy fallback): **42,875**

Matches the inventory audit §3 ("every DB-referenced key exists in the bucket"). There is no render-broken population today.

## 10. Estimated storage reduction after SAFE normalization (report item 10)

**Neon (honest: trivial).** The entire `listings.media` column measures **15.72 MB** (octet_length sum; the ~5.7 MB
figure circulating earlier understates it — measured today, still negligible at Neon pricing). Retiring the
double-stored JSON copy (§1) frees ≤ 10.90 MB; nulling all non-empty JSON frees ≤ 15.53 MB. JSON-side "savings" are a
correctness/compliance argument (single source of truth, §6's decaying tokens, the strike/leak class), **not** a cost argument.

**R2 — what dedupe ADDS beyond the inventory audit's ~50.1 GB candidate figure: almost nothing.**

| Set | Objects | GB |
|---|---|---|
| Inventory audit safe-candidate set (orphans-post-drain + tombstone-only + test) | ~104,813 | ~50.07 |
| Fresh equivalent recomputed by this probe (same method, today's DB refs, same inventory snapshot) | 104,740 | 50.067 |
| Dedupe candidates total (§4 `-1.jpg` class; 0 case-fold) | 1,023 | 0.643 |
| — of which ALREADY inside the candidate set (orphaned/tombstone-only `-1.jpg`) | 745 | 0.465 |
| **— NET NEW reclaimable from dedupe beyond the 50.1 GB** | **278** | **0.178** |

The 278 net-new objects are `-1.jpg` keys still referenced (mostly by JSON heroes — the §2 hero-divergence class);
they only become deletable AFTER the 366-key re-sync re-points those heroes, and only if same-bytes is verified
(content comparison requires GETs — not done here). **At R2 pricing that is ~$0.003/month: dedupe is not a billing
lever.** The §5 shared-key rows and §1 double-references free zero bytes (single objects). The real, already-mapped
recovery remains the inventory audit's ~50.1 GB / ~$0.75/month, executed LAST in the cleanup order with a fresh
ListObjectsV2 diff at execution time.

---

## 11. Method notes

- Inventory snapshot 21:46:16Z, DB pull 21:57:58Z — rows updated in the 12-min gap were flagged
  (`touched_after_inventory`) before declaring any R2 object "missing"; none qualified.
- "Bytes" for R2 sets are exact sums of inventory `Size`; "same-bytes" for the `-1.jpg` dup class is an explicitly
  unverified hypothesis (no GETs).
- Both-set here = ALL listings (not idx-only), so §2's counts sit above the resync dry-run's idx-only 268 — method
  difference, not contradiction.
- All counts drift under the live drain; any executor recomputes fresh (the probe re-runs in ~1 min:
  `node scripts/__media-dup-2026-06-12.mjs`, reuses the cached inventory, zero R2 calls).
- Per CLAUDE.md §J: no live Cotality call was made; §8 cites the strike dry-run's live evidence with its timestamp.

*Read-only audit by Claude (Fable 5), 2026-06-12. No production state modified. No R2 API calls. Probe scripts untracked. ⛔ Report-only — all cleanup blocked until C6 settlement + explicit Maya approval. DO NOT COMMIT.*
