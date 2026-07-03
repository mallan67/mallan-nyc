# Search + Media Foundation Execution Plan (report-only) — 2026-06-06

> **Mode: REPORT ONLY.** No code edits, no new PR, no merge of #362, no
> PR-Foundation, no DB mutation, no migrations, no env/deploy, no cron, no Neon/R2
> deletion. This ties the lanes together and gives a strict execution order.

PR state: #363 merged (JSON fallback safety) · #366 merged/deployed (Featured
excludes ComingSoon/photoless) · #368 open (Featured fills 6, awaiting checks) ·
#364 open (backfill preview SQL, needs your run) · #367 open/held (storage SoT) ·
#369 open (detail image quality, wording corrected, needs live Trestle probe) ·
#362 draft/held (superseded partial dedupe).

DB probe (your numbers): active Photo 63,828 · active FloorPlan 4,846 · null/empty
media_type 0 · dup media_url_original groups 11 · first-media floorplan/document
2,061 · Active/ComingSoon 10,695 · photo_count null 8,527 · primary_photo_url null
8,567 · no active listing_media but non-empty listings.media JSON 5,998.

---

## A. Source-of-truth / sync model (confirmed)

```
Cotality/Trestle Media ─▶ listing_media (media_url_original = canonical, immutable)
                          ├─▶ card DTO  (dbListingToPublicDTO)
                          └─▶ detail DTO + gallery
                          ▼ R2 cache (media_url_cached / r2_key — MIRROR only)
                          ▼ listings.{photo_count, primary_photo_url,
                                      primary_photo_r2_key, photos_change_timestamp}
                                      = DERIVED summary only
listings.media JSON = LEGACY FALLBACK only (read when listing_media empty); retire
                      after coverage + reader-swap proof.
CRM exclusives (SL-/RL-): the CRM upload IS the source → listing_media (+ R2).
```

**Exact code paths (file:line):**

| Concern | Location |
|---|---|
| Live Trestle media fetch | `lib/idx/fetch.ts:467 fetchListingMedia` — `$select` at `:502` = `MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN,MediaStatus` |
| listing_media upsert (IDX) | `lib/idx/media-sync.ts` (upsert by `media_key`, ~`:423-451`); cursor cron `app/api/cron/media-sync/route.ts` |
| listing_media write (CRM) | `lib/media/crm-media.ts:174-182` (`media_url_original=media_url_cached=upload url`, `status='active'`) |
| R2 mirror (cache) | `lib/idx/media-sync.ts:807 mirrorMediaToR2` (writes ONLY `r2_key`+`media_url_cached`; never `media_url_original`/Listing/media JSON); `lib/images/r2.ts:40 uploadToR2` (`R2_PUBLIC_URL`→`pub-*.r2.dev`) |
| listings.media fallback read | `lib/idx/db-to-public-dto.ts:329-332` (`tableRows>0 ? resolveListingMediaFromRows : resolveListingMedia(media JSON)`) |
| denorm summary writer | `lib/idx/media-sync.ts:578 computeListingMediaSummary` (Photo-only; preferred→order→**id**), `:636 updateListingMediaSummary` (4 cols only) |
| card DTO | `lib/idx/db-to-public-dto.ts dbListingToPublicDTO`; `lib/idx/card-fields.ts CARD_SELECT_FIELDS`; `lib/idx/public-dto.ts toPublicDTO` |
| detail DTO + gallery | `app/listing/[...slug]/page.tsx` — Trestle path `:256`, DB path `:466-510`, tab props `:1195-1204`, gallery mount `:1313`; `app/components/ListingMediaGallery.tsx` |

---

## B. Neon / R2 sync repair

> **⚠️ Scope correction (live confirmation 2026-06-06).** A sample of the **50
> newest** sale listings showed **45/50 with `mediaLen 0`** — empty `media[]`,
> i.e. **no `listing_media` AND empty `listings.media` JSON**. So the worst
> "no photos" problem is NOT only the legacy JSON-fallback gap; **new listings
> are entering with no media synced** (incremental-cron lag + no one-shot
> backfill). Therefore the coverage backfill target is **broader** than the
> JSON-fallback group:
>
> - **OLD (too narrow):** Active/ComingSoon + no active `listing_media` + **non-empty**
>   `listings.media` JSON (the ~5,998).
> - **CORRECTED:** **every IDX listing missing active `listing_media`, regardless
>   of `listings.media` JSON**, then fetch **live Trestle Media**.
>
> The #364 Q-pack must size **`rows_with_no_active_media_at_all`** (Q3), not only
> the 5,998 JSON-fallback group (Q1). The future cron/sync design must cover BOTH
> the old legacy gaps AND new-listing lag.

**Order that MUST hold (each write step = its own approved PR + preview + backup):**
1. **Coverage backfill** — populate `listing_media` from **live Trestle** for
   **every IDX listing missing active `listing_media`** (regardless of whether
   `listings.media` JSON is empty or non-empty). The ~5,998 JSON-fallback rows are
   a **subset**; the larger driver is newest listings with empty media (45/50 in
   the live sample). IDX rows only (exclude `SL-`/`RL-`; their media is
   CRM-authoritative). Reuse `lib/idx/media-sync.ts` ingest (idempotent upsert by
   `media_key`). Preview/sizing = #364 (`rows_with_no_active_media_at_all`).
2. **Denorm backfill** — re-derive `photo_count`/`primary_photo_url`/
   `primary_photo_r2_key`/`photos_change_timestamp` from `listing_media` **Photo**
   rows (`updateListingMediaSummary`), scoped to listings WITH active media (so the
   coverage gap is never zeroed). **Ship the writer-determinism fix** (orderBy
   `preferred_photo_yn desc, order asc, id asc`) with this PR so the hero is
   deterministic (#364 §4b).
3. **R2 mirror/backfill** — only as a CACHE after `listing_media` is stable (Cp4
   backlog re-mirrors rows missing `r2_key`/`media_url_cached`).

**Never:**
- Do **not** delete `listings.media` or R2 objects before reader-swap proof.
- Do **not** treat R2 as canonical (it is rebuildable from `media_url_original`).
- Do **not** read `photo_count`/`primary_photo_url` as winner signals before they
  are backfilled (8,527 / 8,567 are null today).

---

## C. Detail media tabs (Photos · FloorPlan · Video · 3D/VirtualTour)

> **Live confirmation (2026-06-06, 50 newest sale listings):**
> - **3D/VirtualTour DATA exists** — **4/50** carry a non-empty `virtualTourURL`.
>   So "none have 3D" is a **detail-tab / data-path rendering** gap, not absent
>   data: audit/fix the detail path's `raw_data` select + `virtualTourURL` map.
> - **Video = feed-gated** — **0/50** have any playable video media. **Do NOT show
>   a Video tab from `VideosCount` alone**; only from a real playable URL (none on
>   IDX Plus today — confirm via live Trestle probe).
> - **FloorPlans** must render as the **FloorPlan tab/gallery** when `listing_media`
>   has FloorPlan rows — **never as a hero photo** (the card hero stays Photo-only,
>   #363). FloorPlan visibility is largely a **coverage** matter (fixed by B.1).

Gallery props built at `app/listing/[...slug]/page.tsx:1195-1204`, rendered by
`ListingMediaGallery.tsx` (each tab hidden when its source is empty — silent).

| Tab | Source field | Selected? Mapped? Rendered? | Why it may be missing |
|---|---|---|---|
| **Photos** | `media[]` where `mediaType==='photo'` (`:1195-1198`) | ✅ all three | media-coverage gap (5,998 use JSON fallback) or all URLs fail |
| **FloorPlan** | `media[]` where `mediaType==='floorplan'` (`:1199-1200`) — from `listing_media` FloorPlan rows / classifier | ✅ all three | **coverage gap** (FloorPlan rows exist for only some listings; 4,846 active FloorPlan rows vs 10,695 listings) or feed didn't supply |
| **Video** | `media[]` where `mediaType==='video'` (`:1201-1202`) — **no dedicated `videoUrl` DTO field** | ⚠️ classified only; **IDX Plus Media serves Photo+FloorPlan only — no Video rows** | **Cotality feed does not provide a playable Video URL via Media**; `VideosCount` is a count, correctly NOT used. A Property-level video URL field is **not fetched/mapped** anywhere |
| **3D/VirtualTour** | `listing.virtualTourURL` (Property `VirtualTourURLBranded/Unbranded`) then media fallback (`:1203-1204`) | mapped in `public-dto.ts:452` (Trestle) + `db-to-public-dto.ts:457` (`raw_data`) | **requires `raw_data` in the select** (fixed for `/api/listings` in #361 — verify the DETAIL DB path selects `raw_data`); else feed didn't supply the tour |

**Classification of the gaps:**
- **FloorPlan** → primarily a **coverage gap** (fixed by B.1 coverage backfill;
  FloorPlan rows are pulled alongside Photos).
- **Video** → **feed limitation + missing mapping**: IDX Plus has no playable video
  in Media; if a Property video URL field exists it is not selected/mapped. Needs a
  **live Trestle probe** to confirm any usable field before building a Video path.
- **3D/VirtualTour** → **mapping/select**: ensure `raw_data` (or a typed
  `virtual_tour_url`) is selected on the **detail** path, not just `/api/listings`.

**Proposed detail-tabs PR sequence:**
1. PR-Tabs-1 (frontend+DTO, no DB): verify/ensure the **detail** DTO path selects
   `raw_data` and maps `virtualTourURL`; add a test that a listing with
   `VirtualTourURLUnbranded` renders the 3D tab. Ensure FloorPlan tab renders when
   `listing_media` FloorPlan rows exist (covered once B.1 runs).
2. PR-Tabs-2 (after a **live Trestle probe**): decide whether any playable Video
   field exists; only then add a Video source — otherwise document that IDX Plus
   has no video and leave the tab feed-gated.

---

## D. Detail image quality (keep separate — #369)

**Do not claim Cotality has only one size until a live Trestle probe proves it.**
Live proof on the sampled listing (`rls20095827`): hero = proxied Cotality original
`MediaURL`, native **575×530**, displayed ~1027px → **1.79× upscale** → pixelation.
The proxy does **not** resize (`app/api/media/proxy/route.ts` streams bytes); the
resolver picks the full-size `url`; the hero is a plain `<img>`. **CRM exclusives
are sharp** (R2 `-hero.webp` 1600px).

**Required proof before any fix:** sample hero URL rendered · native dimensions ·
Cotality Media rows for the same listing · `ImageSizeDescription` / `MediaURL`
variants · R2/proxy dimensions → then choose **Track A** (fetch a larger asset +
re-sync) vs **Track B** (stop upscaling on the display side). Not decidable from
the repo. (#369 holds the full audit + the corrected, sample-specific wording.)

---

## E. Card image layout consistency

All cards use `IDXImage` (`object-cover` hardcoded, `app/components/IDXImage.tsx:320`)
and `getHeroPhoto(listing.media)` → placeholder when empty. **Nothing uses
`object-contain`, so nothing is truly "boxed"** — the inconsistency is *aspect +
background + animation*, plus the placeholder when media is absent.

| Variant | File:line | Aspect | Fallback bg | Animation |
|---|---|---|---|---|
| Grid | `SearchListingCard.tsx:130-138` | `card` (4/3) | none | hover scale |
| List | `SearchListingCard.tsx:247-255` | `card` (4/3) | none | hover scale |
| **Split** | `SearchListingCard.tsx:387-401` | **`wide` (3/2)** ← inconsistent | none | hover scale |
| Featured | `FeaturedListings.tsx:124-135` | `card` (4/3) | **`bg-gray-100`** | **Ken Burns** (`prop-card img`, globals.css:182) |

**Inconsistencies:** (1) Split uses `wide` (3/2) vs others `card` (4/3) — different
crop; (2) Featured shows a gray load background + continuous Ken Burns motion while
search cards show neither; (3) a missing-photo card shows the placeholder SVG, which
reads as "boxed" next to bleeding photo cards. The boxed look is mostly **absence of
media** (the coverage gap), not CSS.

**Proposed PR (frontend-only):** unify the card aspect (pick one ratio), standardize
the load background + placeholder, and decide Ken Burns on/off consistently. **Test
with Playwright screenshots** across grid/list/split/featured at desktop+mobile,
asserting equal aspect + `object-cover` + identical placeholder. **Not** mixed with
backfill — *unless* a given card is boxed because it has no photo (then it's a
coverage-gap symptom, fixed by B.1).

---

## F. Duplicate listings / search canonicalization (the headline)

### Why duplicates appear (root cause, with file:line)

The public search path is **`/api/listings`** (DB-first). Its sequence:
1. `prisma.listing.findMany({ where, skip: dbSkip, take: dbTake })`
   (`route.ts:325-330`) — a page of **UNDEDUPED** rows.
2. `preferCrmExclusiveOverIdxDuplicate(displayable.map(dbListingToPublicDTO))`
   (`route.ts:421`) — collapses **CRM-vs-IDX twins only**, and **only within the
   fetched page**. (The pure-IDX collapse is `collapsePureIdxDuplicates`, which
   exists **only in #362 and is HELD/not merged** — so pure-IDX twins are NOT
   collapsed on `main`.)
3. `annotateCoListedSiblings(publicListings)` (`route.ts:545`) — **explicitly does
   NOT remove or merge rows** (`public-dto.ts:555`); it only adds a badge. So
   same-unit co-listed siblings render as **separate cards**.
4. `total: dbTotal` / `hasMore: skip + limit < dbTotal` (`route.ts:555-558`) where
   `dbTotal = prisma.listing.count({ where })` (`:398`) — the **UNDEDUPED** count.

**Therefore duplicates come from five concrete mechanisms:**
1. **Pagination-before-dedup** — a CRM exclusive and its IDX twin can land on
   different pages; neither collapses the other → both render (the #362 bug).
2. **No pure-IDX dedup** — two IDX rows for the same unit (re-published twin /
   duplicate sync; the **11 dup `media_url_original` groups**) are never collapsed.
3. **Co-listed siblings kept by design** — `annotateCoListedSiblings` badges but
   never merges; the user reads 2–3 same-unit cards as duplicates.
4. **Undeduped `dbTotal`** → wrong `total`/`hasMore`, wrong page math, and the map
   marker layer (same `listings` array) shows duplicate markers.
5. **A SECOND code path — `/api/idx/search/route.ts`** (463 lines) — dedupes only
   by **building key** (`seenBuildingKeys`, `:202-206`), with **no** CRM/co-listed
   unit dedup. Any surface using it shows raw duplicates. (Primary public surfaces
   — `FeaturedListings`, `LiveListingsWidget`, the search results page — use
   `/api/listings`; `/api/idx/search` must be confirmed unused on public unit-list
   surfaces or aligned to the same canonicalization.)

> **Deep-search conclusion (your hunch was right):** duplicates are not one bug.
> They are (a) page-scoped dedup in `/api/listings`, (b) no pure-IDX collapse,
> (c) intentionally-kept co-listed siblings, and (d) a parallel `/api/idx/search`
> path with weaker (building-only) dedup. #362 only touched (a)/(b) and only
> page-scoped — which is why it is insufficient.

### Live co-broke confirmation (2026-06-06) — these are REAL listings, not corruption
Verified on production: **50 W 66th St #62, $85,000,000** is **three real RLS
listings of the same unit**, identical specs (6 bd / 7 full + 2 half ba / 9,678 SF /
Active), different offices and photo coverage:

| ListingKey | Office | Photos | Mod date |
|---|---|---|---|
| `RLS10956475` | Corcoran Group | 29 | 2026-05-05 |
| `RLS10971329` | Douglas Elliman | 23 | 2026-05-17 |
| `RLS20061539` | Extell Marketing | **0** | 2026-05-26 |

The same triplet repeats at **#51E, #56S, #58N** (sponsor co-marketing of Extell's
50 West 66th). So the duplicate cards are **legitimate co-listed / co-broke
inventory**, not (only) data corruption — confirming this is a **canonicalization +
attribution** problem, not a parsing bug.

**Winner-rule constraint (critical):** the Extell row has **0 photos**, so the
canonicalization winner **must prefer usable photos / more photos** and **must NOT
blindly pick newest or first** — a "keep newest" rule would select the photoless
Extell row and render a blank card. This makes trustworthy media winner signals
(or a `listing_media` photo-count join) a hard prerequisite (see below).

### Why #362 is insufficient
- Its dedup is **page-scoped** (runs after pagination), so cross-page twins survive.
- It relies on **media winner signals** (`photo_count`/`primary_photo_url`/usable-
  photo counts) that are **untrustworthy today** (8,500+ null) — the wrong row can
  win.
- It does not fix **`dbTotal`/`hasMore`** (still counts undeduped rows).

### Correct design (canonicalize-before-paginate)
```
filter  →  canonicalize the FULL matching set (collapse CRM-vs-IDX twins, pure-IDX
           twins, and decide co-listed-sibling policy)  →  compute the TRUE total
        →  sort  →  paginate  →  hydrate media  →  annotate  →  render
```
- **Prerequisite:** reliable winner signals. Either (i) run the **denorm backfill**
  (B.2) so `photo_count`/`primary_photo_url` are trustworthy, **or** (ii) drive the
  winner from a **`listing_media` join/subquery** (heavier query) so canonicalization
  doesn't depend on the denorm columns at all.
- **Recommendation:** do the **denorm backfill first** (B.2), then canonicalize
  using the repaired denorm columns (cheap). Building canonicalization on the broken
  denorm fields, or shipping it before B.2, would encode the wrong winners — exactly
  what #362-as-is risks.
- **Co-listed-sibling policy is a product decision:** collapse same-unit third-party
  siblings to one card (with an "also listed by" note) vs keep+badge. Today it is
  keep+badge; the user reads that as duplicates. The canonicalization PR should make
  this explicit and configurable.

---

## G. Strict execution order

| # | Step | Type | Gate |
|---|---|---|---|
| 1 | **Finish #368** (Featured fills 6) | frontend | merge when checks+Codex clean; verify 6 cards live |
| 2 | **Run #364 Q0–Q6 SQL**, fill preview numbers | read-only (you run) | no writes |
| 3 | **Coverage backfill** (listing_media for 5,998) | **DB write** | preview-approve; IDX-only; idempotent; backup |
| 4 | **Denorm backfill** (+ writer determinism fix) | **DB write** | after #3; scoped to media-bearing; backup |
| 5 | **Detail tabs PR** (3D/VirtualTour select+map; FloorPlan via #3) | frontend+DTO | Video needs live probe first |
| 6 | **Detail image quality**: live Trestle probe → Track A or B PR | proof → frontend/feed | #369; needs live proof |
| 7 | **Card layout consistency PR** | frontend | Playwright screenshots |
| 8 | **Search canonicalization** (replaces #362) | backend | after #4 (or use listing_media join); fixes total/hasMore + cross-page + pure-IDX + sibling policy; align/retire `/api/idx/search` |
| 9 | **R2 cleanup** (prune tombstoned) | **DB/R2 write** | LAST; only after all verification; backup |

### Dependency map
- 3 → 4 (denorm needs coverage) → 8 (canonicalize needs trustworthy winners, or a
  `listing_media` join).
- 5 (FloorPlan) depends on 3 (coverage). 5 (Video) and 6 depend on a **live Trestle
  probe**.
- 7 is independent (frontend-only) **except** where "boxed" = missing media (→ 3).
- 9 depends on everything above proving stable.

### What ships immediately (frontend-only, no data)
- #368 (already done) · Card layout consistency (7) · Detail 3D/VirtualTour
  select+map (5, the mapping half).

### What needs DB-write approval
- Coverage backfill (3) · Denorm backfill (4) · Search canonicalization if it
  writes (8 is read-time, no writes — but depends on 4) · R2 cleanup (9).

### What needs live Trestle proof
- Detail image quality Track decision (6) · Video tab existence (5) · any claim
  about Cotality media sizes.

### What must wait
- #362 (held, superseded) · PR-Foundation/canonicalization (8) until denorm (4) ·
  R2 cleanup (9) until last · any deletion of `listings.media`/R2 until reader-swap
  proof.

### Tests per PR
- **Coverage backfill:** dry-run preview row counts == Q1; idempotent re-run insert
  count 0; CRM rows excluded.
- **Denorm backfill:** `computeListingMediaSummary` unit tests (Photo-only, hero
  determinism); post-run Q3 `any_of_4_change_MEDIA_ONLY` → 0; Q4 nonphoto heroes 0.
- **Detail tabs:** listing with `VirtualTourURLUnbranded` renders 3D tab; listing
  with FloorPlan rows renders FloorPlan tab; Video tab hidden when no playable URL.
- **Card layout:** Playwright screenshots grid/list/split/featured (desktop+mobile)
  assert equal aspect + `object-cover` + identical placeholder.
- **Search canonicalization:** full-set collapse (CRM-vs-IDX, pure-IDX) before
  paginate; `total`/`hasMore` reflect the deduped set; cross-page twin cannot appear
  twice; co-listed policy explicit; the FULL `npx jest` (shared search-lib).

> **Stop after report.** No code, no PR, no DB, no migrations, no env/deploy, no
> cron, no deletion. Next concrete action is **#368 finish** then **#364 SQL run**.
