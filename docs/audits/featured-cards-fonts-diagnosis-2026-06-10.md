# Featured 2-of-6 + search-card pictures + attribution font — read-only diagnosis (2026-06-10)

**Author:** read-only diagnostic agent · **Status:** report only — ZERO writes to code, DB, or config (uncommitted file per instruction)
**Scope:** (1) why the homepage Featured grid shows 2 of 6 cards; (2) buy/rent search-card placeholder pictures — data gap vs resolver bug; duplicate-image risk; (3) "RLS · Listing Courtesy of" font-size proposal with compliance floor.
**Evidence:** live HTTPS GETs against `https://mallan.nyc` + SELECT-only SQL against canonical production (`ep-cold-waterfall-adno3ao2-pooler…` — host-guard fail-closed; NEON.md read first; `morning-bread`/`royal-dawn` never touched). Scratch probe scripts/outputs live OUTSIDE the repo at `C:\Users\MayaAllan\Desktop\__probe-featured-search-20260610.mjs`, `__db-probe-20260610.mjs`, `__probe-out-20260610.json`, `__db-probe-out-20260610.json`.

---

## TASK 1 — Why Featured shows 2 of 6

### 1.1 The data source (code path)

| Step | File:line |
|---|---|
| Homepage Featured component fetches `GET /api/featured-config`, then pages `GET /api/listings` | `app/components/FeaturedListings.tsx:372-447` |
| Query it builds: `type=sale&excludeUndisclosed=true&sort=newest&statuses=Active,ActiveUnderContract&minPrice=500000&beds=1&borough=Manhattan`, pageSize 48, maxPages 5 (PR #368) | `app/components/FeaturedListings.tsx:389-447` |
| Exclusives feed: same params + `exclusive=mallan&limit=12` | `app/components/FeaturedListings.tsx:410-417` |
| Card gate: NOT Coming Soon AND ≥1 usable Photo (PR #366) | `lib/featured/featured-ordering.ts:93-101` (`isFeaturedDisplayable` → `getValidPhotoMedia`, `lib/media/listing-card-media.ts:38-43`) |
| Paging loop stops on empty page / `enough` / maxPages; a failed page fetch (`!r.ok`) returns `[]` and is treated as feed exhaustion → loop breaks early | `lib/featured/featured-ordering.ts:130-151` + `app/components/FeaturedListings.tsx:436` |
| `/api/listings` DB path: `listing_media` (active rows) selected per listing; DTO prefers rows, falls back to `listings.media` JSON | `app/api/listings/route.ts:382-395` → `lib/idx/db-to-public-dto.ts:329-338` |
| Bounded LIVE Trestle media fallback for rows still empty: concurrency 5, **hard 1.5 s total budget**, fail-soft | `app/api/listings/route.ts:509-523` → `lib/media/photo-fallback.ts:102-141` |
| Response is CDN-cached: `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` | `app/api/listings/route.ts:1070` (and 301/571/599/626) |

### 1.2 Live probes (2026-06-10)

- `GET https://mallan.nyc/api/featured-config` → exactly the hardcoded default (`"sort":"newest"`, limit 6, no pins) — `featured_configs` table still drives nothing (consistent with lane-A: table empty).
- Exact replication of the homepage page-walk (same URLs the browser issues → CDN-cached responses): page 0 = **0/48** displayable, page 1 = **1/48**, page 2 = **4/48** → grid 6 (incl. 1 exclusive). Grid at probe time: `SL-0004`, `RLS20096462`, `RLS20096061`, `RLS20096032`, `RLS20096010`, `RLS20096035`.
- Cache-busted re-runs (`&_r=N` → `x-vercel-cache: MISS`, fresh serverless invocation) of page 0 ALONE: **9/48, 14/48, 34/48** displayable across three consecutive runs. Same query, minutes apart.

### 1.3 DB ground truth (SELECT-only, canonical prod, exact Featured filter + fail-closed display gate)

| Measure | Result |
|---|---|
| Eligible pool (sale · Manhattan · ≥$500K · ≥1 bed · Active/AUC · `SEARCH_DISPLAY_GATE`) | **5,802** |
| …with a STORED photo (active `listing_media` photo row if any rows exist, else photo in `listings.media` JSON — mirrors `db-to-public-dto.ts:329-332`) | **1,995 (34.4%)** |
| Top-48 newest (`listing_contract_date DESC`) with stored photo | **0 / 48** (lane-A re-confirmed) |
| **Top-240 newest (the entire PR #368 paging window, 5×48) with stored photo** | **1 / 240** — only `RLS20096462` (149 Sullivan St #4B, $879K, contract 2026-06-08, **rank 52**, 5 JSON photos, 0 `listing_media` rows) |
| Price-desc top-48 with stored photo | **23 / 48** (lane-A measured 21 — still valid, see §1.6) |

DB media for the probe-time grid rows: `SL-0004` → 10 active `listing_media` rows; `RLS20096462` → 0 rows / 5 JSON photos; `RLS20096061`, `RLS20096032`, `RLS20096010`, `RLS20096035` → **0 rows AND 0 JSON media**. Those four cards' photos existed ONLY in the API response — supplied by the 1.5 s live-Trestle fallback and frozen into the 60 s CDN snapshot.

### 1.4 Diagnosis — why Maya sees 2

**The deterministic floor of the Featured grid TODAY is exactly 2 cards:**

1. `SL-0004` (Mallan exclusive — own R2 media, always displayable), and
2. `RLS20096462` (the single stored-photo listing in the whole 240-row newest window).

Every card beyond those 2 is an **ephemeral live-fallback fill**: `/api/listings` races a 1.5 s, 5-concurrent live Trestle media fetch over the ~40+ photoless rows of each page; whatever happened to fill before the timer is **cached at the CDN for 60 s (+120 s stale)** and served to everyone until revalidation. Measured variance on identical requests: 9 → 14 → 34 displayable rows on page 0. When the cached snapshots for the homepage's five page-URLs were produced by invocations where the fallback fetched little or nothing (cold Trestle token, slow upstream, or simply 40 rows ÷ 5-concurrency not fitting in 1.5 s), the grid collapses to the floor: **2**. A failed page fetch (e.g. rate-limited 429 mid-walk) makes it worse — `FeaturedListings.tsx:436` returns `[]` for that page and `collectDisplayableFeatured` (`featured-ordering.ts:143`) treats the empty page as feed exhaustion and stops paging entirely.

**The 4→2 degradation is data-side window-rollover, not media being cleared on specific cards:**
- 2026-06-06 diagnosis: 10/48 of the top-48 newest had photos.
- 2026-06-09/10 (lane-A): 0/48.
- Today: **1/240**.
The newest ~50 rows (contract-dated 2026-06-05…06-08) are ALL photoless in the DB (0 `listing_media` rows, empty `media` JSON — the RC1/RC3 media catch-up has not reached them), so each day's new listings push the few photo-bearing rows deeper: `RLS20096462` already sits at rank 52, outside page 0. The previously-visible "4 of 6" included live-fallback fills; as stored coverage in the window shrank toward 1 and cache snapshots got unlucky, the visible count degraded 4 → 2. The "2 lost" cards were not specific listings that lost media — they were fallback-filled cards that stopped being (re)filled in the current cache snapshots.

### 1.5 What this means

The PR #368 deeper paging cannot fix this: 5 pages × 48 = 240 newest rows contain exactly **1** durably-displayable listing. Under `sort=newest` the grid is structurally dependent on the nondeterministic live fallback until the media catch-up reaches the newest window.

### 1.6 Lane-A operator plan re-validation (Task 1.3)

- SQL TODAY: price-desc top-48 → **23/48 with stored photo** (vs 21 yesterday). 23 durable ≥ 6 needed (≈4× margin), no fallback dependence.
- Live API confirm: `sort=price-desc` page 0 under the exact Featured filter → **27/48 displayable** (23 stored + fallback fills), `x-vercel-cache: MISS`.

**The lane-A claim holds — switching the Featured sort to `price-desc` (operator plan in `docs/audits/lane-a-featured-config-operator-plan-2026-06-10.md` §4) fills the grid from page one deterministically.** No change to gates, statuses, attribution, or compliance surface; awaiting Maya's approval as documented there.

---

## TASK 2 — Buy/Rent search-card pictures

### 2.1 The exact fallback chain (file:line)

1. **Card hero pick** — `GridCard`/`ListCard`: `getHeroPhoto(listing.media, failedUrls)` → first item passing `isPhotoMedia` + `isValidPublicImageUrl`, else `LISTING_PLACEHOLDER_IMAGE` (`/images/listing-placeholder.svg`). `app/components/SearchListingCard.tsx:107, 232` → `lib/media/listing-card-media.ts:38-54, 1`. `SplitCard` carousel: `getValidPhotoMedia` else placeholder (`SearchListingCard.tsx:352-354`).
2. **DTO media composition** (server, `/api/listings` DB-first path — the same endpoint `useListings` calls, `lib/hooks/useListings.ts:203, 244`):
   a. **`listing_media` table** — active rows selected per listing (`app/api/listings/route.ts:382-395`); when ≥1 row exists → `resolveListingMediaFromRows` (R2 `media_url_cached` preferred, Trestle `media_url_original` proxied) — `lib/idx/db-to-public-dto.ts:329-331` → `lib/media/listing-media-resolver.ts:466-512`.
   b. **Legacy `listings.media` JSON** — only when the table has ZERO rows → `resolveListingMedia(mediaArr, { mapUrl: proxyDbMediaUrl })` — `lib/idx/db-to-public-dto.ts:332`.
   c. **Bounded live Trestle fallback** — rows still empty after (a)/(b): `fillEmptyMediaWithLiveFallback` (concurrency 5, 1.5 s total, Cotality URLs wrapped in `/api/media/proxy?url=`) — `app/api/listings/route.ts:509-523`, `lib/media/photo-fallback.ts:102-141`.
   d. **Placeholder** — anything still empty renders the grey SVG client-side (step 1).
   (The Trestle-direct, non-DB route branch has its own per-page media fill at `app/api/listings/route.ts:910-995`; production responses probed were all `source: db+idx`, i.e. the DB path.)

### 2.2 Production probe (first 2 pages × buy + rent, default search query `type=…&limit=50`)

| Surface | Page | Cards | With real photo | Placeholder |
|---|---|---|---|---|
| Buy (sale, default price-desc) | skip 0 | 50 | 28 | **22** |
| Buy | skip 50 | 50 | 25 | **25** |
| Rent | skip 0 | 50 | 26 | **24** |
| Rent | skip 50 | 50 | 20 | **30** |

Hero URL shapes on a fresh sale page 0: 20 × R2 (`listing_media` cached path) + 8 × `/api/media/proxy` (JSON/live-fallback path) — both resolver branches demonstrably working.

### 2.3 The key verdict — data gap, NOT a resolver bug

All **101 unique placeholder listings** from the four pages were cross-checked in production DB:

- **101 / 101**: zero active `listing_media` rows AND zero photo-shaped entries in `listings.media` JSON (most `json_len = 0`).
- **0 / 101**: media present in DB but rendered as placeholder.

**Resolver-bug count: zero.** Every placeholder card corresponds to a listing with genuinely no stored media anywhere; whether it shows a photo on a given request depends only on the 1.5 s live-fallback lottery (same mechanism as Task 1). This is the known coverage gap (ops:health 2026-06-10: 10,674 of 15,867 IDX-displayable listings with empty media) surfacing on cards — notably at the TOP of the buy results, because default sort is `list_price DESC` (`lib/search/public-listing-db.ts:296`) and the $20M–$90M trophy listings are heavily photoless in the DB.

### 2.4 Duplicate-image risk (within one listing)

- **Search-card heroes / card strips (PR #363)** — `resolveListingMedia` runs a visual-identity dedupe on the JSON path (`lib/media/listing-media-resolver.ts:362-381`), keying on the UNWRAPPED source URL (`unwrapProxyUrl`, :273-282) so distinct proxied photos don't collapse and identical re-imports do. Locked by `tests/runtime/json-fallback-hero-safety.test.ts`.
- **Detail gallery — equivalent dedup confirmed:**
  - Table path: `resolveListingMediaFromRows` dedupes by `visualIdentity` (R2 stem / source URL), preferred-photo wins, then re-resolves with `skipDedupe: true` to avoid double-collapsing distinct photos sharing a cached display URL (`listing-media-resolver.ts:466-512`, regression-pinned in `tests/runtime/media-display-p0.test.ts`).
  - JSON path: same dedupe pass as cards (`:362-381`).
  - The two sources are **never merged** — strict either/or at `app/listing/[...slug]/page.tsx:473-481` (`rows.length > 0 ? FromRows : JSON`), so a table photo can never appear next to its JSON twin.
  - Live-Trestle gallery fallback (`page.tsx:491-508`): fires ONLY when resolved photo count is 0, and merges `trestlePhotos` with existing **non-photo** media — there are no photos to duplicate by construction.
  - Residual (low, pre-existing) exposure: `fetchListingMedia`'s own output (`lib/idx/fetch.ts:526-554`) is not URL-deduped, so a Trestle feed that returned two Media rows with the same URL for one listing would render twice on this fallback path only. No instance observed; unchanged by #363. The gallery component itself renders what it is given (`app/components/ListingMediaGallery.tsx:44-46`) — dedupe correctly lives upstream in the single resolver.

**Verdict: no duplicate-image bug on cards or detail gallery; PR #363's protection has a working equivalent on the gallery paths.**

---

## TASK 3 — "RLS · Listing Courtesy of" font size (PROPOSAL ONLY — no code changed)

### 3.1 Where the attribution renders today

| Surface | File:line | Current classes | Effective size |
|---|---|---|---|
| Search GridCard | `app/components/SearchListingCard.tsx:204` | `text-sm text-brand-dark/80 mt-2` | 14 px |
| Search ListCard | `app/components/SearchListingCard.tsx:322` | `text-sm text-brand-dark/80 mt-2` | 14 px |
| Search SplitCard | `app/components/SearchListingCard.tsx:484` | `text-sm text-brand-dark/80 mt-2` | 14 px |
| **Featured card (homepage)** | `app/components/FeaturedListings.tsx:297` | `text-base text-brand-dark/80 mt-2` | **16 px** |
| Listing detail page (attribution section) | `app/listing/[...slug]/page.tsx:2136-2137` | `text-[13px] text-brand-dark/55` (office name `font-medium text-brand-dark/70`) | 13 px |

Each carries the inline comment "REBNY attribution — UCBA Art. III §2(C): font not smaller than median".

### 3.2 The compliance rule (canonical text)

Per `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §9 (Broker attribution) → canonical/backup `data/UCBA-2026-Requirements.md`:

> **Line 245 (Art. III, Sec. 2(C)):** "When advertising another Participant's listing through IDX/VOW, must include listing broker name **in reasonably prominent location, font not smaller than median font**"
>
> **Line 212 (IDX/VOW exception):** "Advertising via IDX or VOW must include 'Listing Courtesy of [Exclusive Broker/Participant]' **in reasonably prominent location, font not smaller than median type face**"

So yes — REBNY imposes a minimum prominence: the attribution may not be set in a font **smaller than the median type size of the surface it appears on**, and it must be in a reasonably prominent location. (NY DOS §175.25 — index §11 — additionally requires brokerage identification on every ad but sets no font-size floor; the binding size constraint is the UCBA median rule.)

### 3.3 Median-font analysis per surface

- **Featured card** body text: 16–18 px (heading/price), 13 px ×2 (subtitle, beds/baths), 12 px (CC), 12 px (calc label), 16 px (attribution). Median ≈ **13 px** → the attribution has **3 px of compliant headroom**.
- **Search cards** body text (GridCard): 24 px (price), 15 px ×2 (stats, address), 14 px ×2 (type line, CC), 14 px (attribution), 11 px (co-listed pill). Median ≈ **14 px** → the attribution is **already AT the median floor**. `text-xs` (12 px) or `text-[13px]` would put it below median → non-compliant.
- **Detail page**: already 13 px in a footer-style section while the page body runs 14–16 px — at or below the page's median already; shrinking further increases compliance risk on both the size and "reasonably prominent" prongs.

### 3.4 Smallest compliant change (for Maya's approval)

| Surface | Proposed change | Rationale |
|---|---|---|
| **Featured card** — `app/components/FeaturedListings.tsx:297` | `text-base` → **`text-sm`** (16 → 14 px) | Only surface with headroom; 14 px stays ≥ the card's ~13 px median, and harmonizes Featured with the search cards (today Featured attribution is anomalously LARGER than everything else on the card except the price). Absolute floor would be `text-[13px]`, but `text-sm` keeps a safety margin above median. |
| Search GridCard / ListCard / SplitCard (`SearchListingCard.tsx:204/322/484`) | **NO CHANGE — must not shrink** | `text-sm` is already at the cards' median; any reduction violates UCBA Art. III §2(C). |
| Detail page (`page.tsx:2136-2137`) | **NO CHANGE — must not shrink** | Already 13 px, at/below the page median; further reduction risks both the size floor and "reasonably prominent location". |

One-line diff total: a single class token on `FeaturedListings.tsx:297`. The "RLS ·" prefix and the broker name live in the same `<p>` and shrink together — the rule covers the listing-broker name, so they may not be split into a smaller-than-median fragment.

**Process gates before implementing:** Maya's explicit approval (this document), the rebny-compliance skill gate before commit (attribution surface), and CLAUDE.md §G validators (`type-check`, `rls:validate`, `compliance-check`, `ucba:audit`, `idx:validate`). Proof-first: a Vercel preview screenshot of a Featured card showing the rendered attribution at the new size (per §F — source grep alone is insufficient for a rendering claim).

---

## Appendix — evidence inventory

- **Read-only HTTPS probes** (2026-06-10): `/api/featured-config`; homepage-identical `/api/listings` page-walk (cached) → 0/48, 1/48, 4/48; cache-busted page-0 reruns → 9/48, 14/48, 34/48; `sort=price-desc` page 0 → 27/48; buy/rent ×2 pages → table in §2.2. Raw JSON: `C:\Users\MayaAllan\Desktop\__probe-out-20260610.json`.
- **SELECT-only SQL** against `ep-cold-waterfall-adno3ao2-pooler…` (host-guard printed and verified before any query; script: `C:\Users\MayaAllan\Desktop\__db-probe-20260610.mjs`, output `__db-probe-out-20260610.json`): pool 5,802 / 1,995 stored-photo; newest top-48 = 0, top-240 = 1 (`RLS20096462` rank 52); price-desc top-48 = 23; 101/101 placeholder listings DB-empty; grid-row media inventory (§1.3).
- **Code reads** cited inline throughout (FeaturedListings, featured-ordering, listing-card-media, listings route, db-to-public-dto, listing-media-resolver, photo-fallback, idx fetch, detail page, gallery, SearchListingCard, useListings, public-listing-db, UCBA requirements, compliance index).
- No writes: no code edits, no DB writes, no config changes, nothing committed. This file is the only repo artifact and is left uncommitted.
