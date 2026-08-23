# Legacy-JSON Dependency Audit — P2-MONEY Step 5 (and Step 6 status)

**Date:** 2026-06-18 · **Type:** REPORT ONLY (no code/schema/DB/env/flag/archive/Neon/Vercel/R2 change) ·
**Method:** 8-probe read-only dependency scan (Prisma select/include · property reads · destructuring ·
raw SQL · mapper/builder fns · writer/upsert · refill/backfill · full-record-fetch→mapper) across
`app/ lib/ scripts/ public/crm/`, one auditor per JSON column, every claim cited to `file:line` by
direct Read.

---

## 1. Executive verdict

- **Step 5 currently FAILS.** The application still depends on **all six** legacy JSON columns on
  `Listing` — `raw_data`, `media`, `compliance`, `features`, `agent_info`, `address`.
- **None are strippable today.** Every column is **render-critical at minimum**, and most are also
  CRM-, syndication-, search-projection-, or archive-critical — and **all six are actively re-written
  by the Trestle/CRM writers**, so they cannot be emptied without being repopulated.
- **Step 6 is addressed here as a current FAIL / blocked gate — not forgotten and not merely
  deferred.** Step 6 (prove production DB billed/synthetic size is below the Neon Free cap) **cannot
  be proven as PASS today** because the only realistic storage-reduction path (legacy-JSON
  removal/rewrite) is blocked by the Step 5 dependencies below, and the archive path currently drains
  nothing (§3). See §3 for the full Step 6 reasoning and §4 for the future pass conditions.
- **`$19` Neon Launch remains the floor for now.** Reaching Free is the six-front consumer migration
  **plus** writer/refill migration **plus** a later measured-bytes reclaim — a large, multi-PR
  project the schema itself defers (media PR4→PR10; `agent_info` "Phase B"; `address`/`features`
  "future PR migrates readers").

---

## 2. Step 5 proof — legacy-JSON dependency inventory

### 2.1 `raw_data` (`Listing.raw_data Json?` — `prisma/schema.prisma:476`)

- **Strippable today: NO.**
- **Readers (render-critical):** `lib/idx/db-to-public-dto.ts:298` derives public-DTO fields from
  `raw_data`. **~10 of these have NO fallback** — they go blank if `raw_data` is dropped:
  `comingSoonDate`←ActivationDate (:300), `previousListPrice` (:391), `onMarketDate` (:422),
  `closeDate` (:423), `leaseAmount` (:449), `leaseAmountFrequency` (:450), `availabilityDate` (:452),
  `daysOnMarket` (:454), `cumulativeDaysOnMarket` (:455), `virtualTourURL` (:457). **Two more PREFER
  `raw_data` but degrade gracefully via a fallback** (so they would not break, but lose precision):
  `closePrice` (:392 — falls back to `features.ClosePrice`) and `originalListPrice` (:390 — falls back
  to the `list_price` column). Selected at `app/api/listings/route.ts:356` and `:1228`.
- **Readers (CRM-critical):** PATCH merge `app/api/crm/listings/[id]/route.ts:102,435`
  (`{...existingRaw, ...body}` → write-back); form rehydrate `public/crm/SALE-FORM-REDESIGN.html:9548`
  + `RENTAL-FORM-REDESIGN.html:6878`; validators `.../validate/route.ts:44`, `.../status/route.ts:122`;
  JSON-path dedup `app/api/crm/listings/route.ts:253-256` (`raw_data.path:['_wasComingSoon']`);
  `app/api/crm/compliance/audit/route.ts:43,53`.
- **Readers (building/comps):** raw SQL `app/api/buildings/search/route.ts:536-556`
  (`extractSavedProfileValues(l.raw_data,…)`); closed sale-history `app/api/buildings/route.ts:643,647,652`.
- **Writers / refill:** `lib/idx/sync.ts:301,335,1138,1166` (idx-sync upsert, create+update);
  `app/api/crm/listings/reset-sync/route.ts:138,170`; `app/api/cron/feed-reconcile/route.ts:382`;
  producers `lib/idx/trestle-mapper.ts:1185` (`slimRawData`), `lib/compliance/normalizer.ts:162`.
- **Archiver:** `app/api/cron/data-retention/route.ts:248-262` extracts `close_price/close_date/
  original_list_price` into `listings_archive`, then `:272` sets `raw_data=Prisma.JsonNull` — **on
  terminal rows only.**
- **Runtime surfaces:** public render, CRM (edit/merge/validate/dedup/audit), building search/comps,
  archive, ops/scripts, tests.
- **Migration required before strip:** promote the 12 render fields to real columns (or into
  `features`) + backfill + repoint the DTO with per-field failing tests; model every CRM-persisted
  form field (CRM rows store the **full un-slimmed** payload — `trestle-mapper.ts:1180-1182`) into a
  typed home; give `_wasComingSoon`/ClosePrice/FARE/RLS gate inputs typed homes; remove the writer
  assignments in the same migration.
- **Risk if stripped prematurely:** public cards/detail silently lose virtualTourURL / DOM / lease /
  availability / list-price-history; CRM edits lose all saved form state; idx-sync re-fills nulled
  `raw_data` on the next sync (so a naive null is not even durable).

### 2.2 `media` (`Listing.media Json @default("[]")` — `prisma/schema.prisma:478`)

- **Strippable today: NO.**
- **Readers (render-critical):** dual-read — `lib/idx/db-to-public-dto.ts:274,329-339` and detail
  page `app/listing/[...slug]/page.tsx:469-475` **prefer the `listing_media` table but fall back to
  `media` JSON when the relation is empty**; **public `/api/open-houses/route.ts:350-351` has NO
  table fallback** (JSON-only first photo); agent page `app/api/agents/[slug]/listings/route.ts:226`;
  portal `app/api/portal/favorites/route.ts:52`, `buyer/saved/route.ts:32`; search selects
  `app/api/listings/route.ts:359,960,1230`; Featured exclusion `lib/featured/featured-ordering.ts:89`.
- **Readers (projection/search-critical):** `lib/search/listing-search-projection.ts:261-279,522,556`
  reads `media[]` to **derive** `feature_flags` (`has_floorplan/has_video/has_virtual_tour`). The
  projection does NOT persist a copy of the `media` JSON — `ListingSearchProjection`
  (`prisma/schema.prisma:2561-2563`) has only `searchable_text`/`amenity_keys`/`feature_flags`; `:556`
  passes `media` in as *builder input*, not storage. Used by `lib/search/core.ts:24,250`.
- **Writers / refill:** idx-sync `lib/idx/sync.ts:298,332,1135,1163`; **`backfillEmptyMedia`
  `lib/idx/sync.ts:696-721`** re-fetches Trestle media when JSON is empty/null (the **purgatory
  re-fill loop**); `migrateMediaToR2` `:850`; `feed-reconcile:379`; CRM photo-add (authoritative)
  `app/api/crm/listings/[id]/photos/route.ts:69,84`; CRM edit `.../[id]/route.ts:437`.
- **Archiver:** sets `media:[]` at T+30d (`data-retention/route.ts:142-151`) and T+180d (`:273`) —
  terminal rows only.
- **Runtime surfaces:** public render (incl. open-houses), CRM, search projection, archive, ops, tests.
- **Migration required before strip:** `listing_media` table coverage at **100%** of displayable
  listings (today `ops-health.js:469` warns coverage is <100%); re-source `open-houses` first-photo
  and the projection media-flags off the table; **retire/repoint `backfillEmptyMedia`** or it
  re-populates emptied JSON within one cron cycle; move CRM photo-add fully to `listing_media`.
- **Risk if stripped prematurely:** any listing lacking complete `listing_media` rows renders with no
  photos (cards, detail gallery, OG image, open-house thumbnails); search media-flags blank; the
  backfill cron immediately re-grows the JSON (storage not actually reclaimed).

### 2.3 `compliance` (`Listing.compliance Json @default("{}")` — `prisma/schema.prisma:479`)

- **Strippable today: NO.**
- **Headline:** a narrow `compliance: true` grep returns **ZERO** results repo-wide — yet the column
  is render- and syndication-critical. **Every read is via a full-record fetch** (`findUnique`/
  `findMany` with `include`, no `select`). Probe type 8 is the only probe that catches it.
- **Readers (render-critical):** detail page `app/listing/[...slug]/page.tsx:545` reads
  `dbListing.compliance`; `:621` `publicRemarks = features.PublicRemarks || compliance.PublicRemarks`.
- **Readers (syndication-critical):** `lib/syndication/eligibility.ts:127-128,195` (`compliance.
  syndication.*`), `:221-224` (`mallan_control_verification`), `:282-283`
  (`seller_advertising_authorization`), `:289-294` (`media_rights`).
- **Readers (CRM-critical):** `app/api/crm/sales/listings/route.ts:63-64` reads
  `compliance.Permissions` → UCBA DOM (`getCurrentDom`).
- **Writers / refill:** `lib/idx/sync.ts:299,333,1136,1164`; `feed-reconcile:380`;
  `reset-sync:136,168`; CRM intake `app/api/crm/listings/route.ts:417` and edit `.../[id]/route.ts:421`
  (store `validation_result`/`rls_eligibility` — **no other persistence home**). Source builder
  `lib/idx/trestle-mapper.ts:1080-1086` (B7_REMARKS incl. `PublicRemarks`).
- **Archiver:** `data-retention/route.ts:274` sets `compliance:{}` — terminal rows only.
- **Runtime surfaces:** public render, syndication, CRM, archive, tests.
- **Migration required before strip:** confirm via **live production probe** (CLAUDE.md §F — not
  source-grep) that no live row relies on the `compliance.PublicRemarks` render arm; relocate the four
  syndication sub-objects + CRM `validation_result`/`rls_eligibility` to typed homes; source
  `Permissions` DOM input from `participant_only`/`owner_opt_out` columns; retarget the five writers.
- **Risk if stripped prematurely:** blanks the public description on any row whose only populated
  `PublicRemarks` is the `compliance` copy (UCBA/IDX display exposure); destroys broker-approval /
  seller-authorization / manual-control-verification state with no backup; a single-grep audit would
  have wrongly cleared this column.

### 2.4 `features` (`Listing.features Json @default("{}")` — `prisma/schema.prisma:477`)

- **Strippable today: NO.**
- **Disambiguation:** only the `listings.features` JSON column is in scope — NOT the projection's
  derived feature storage (`ListingSearchProjection` has only `amenity_keys`/`feature_flags` Json
  columns, `prisma/schema.prisma:2562-2563` — the migration *destination*; it does **not** define
  `*_features String[]` columns), nor the DTO-shaped `listing.features.interior/...` TS type. The Cotality
  mapper (`cotality-mapper.ts:239-253`) reads the **DTO**, not this column.
- **Readers (render-critical):** public DTO `lib/idx/db-to-public-dto.ts:272,392-468` reads **~50
  keys** (CommonInterest, PublicRemarks, FARE-Act fee group MoveInCosts/OngoingFees/TenantPays/
  AdditionalFee/FeeFrequency, AssociationFee, TaxAnnualAmount, amenity arrays, YearBuilt, …); detail
  page `app/listing/[...slug]/page.tsx:612-646`; portal `lib/compliance/dto.ts:366`; property-type
  display `app/api/open-houses/route.ts:365` (`features.CommonInterest`), `market/route.ts:257`,
  `similar/route.ts:202`, `buildings/route.ts:579`; amenity filter `app/api/listings/route.ts:347,429`.
- **Readers (projection/search-critical):** `lib/search/listing-search-projection.ts:194-344,521,555`
  reads `features` to **derive** `searchable_text` + `amenity_keys` + `feature_flags`. The projection
  does NOT persist a copy of the `features` JSON — `ListingSearchProjection`
  (`prisma/schema.prisma:2561-2563`) has only `searchable_text`/`amenity_keys`/`feature_flags`; `:555`
  passes `features` in as *builder input*, not storage. → `lib/search/core.ts`.
- **Readers (building-search):** `app/api/buildings/search/route.ts:546-669` (`features.
  BuildingKeyNumeric` identity + ~20 `buildingExtras` keys).
- **Writers / refill:** `lib/idx/sync.ts:297,331,379,1134,1162,1205`; `feed-reconcile:378`;
  `reset-sync:134,162`; CRM POST `app/api/crm/listings/route.ts:415`, CRM PATCH merge
  `.../[id]/route.ts:329,375-379`; builder `trestle-mapper.ts:1060-1079`; projection backfill
  `scripts/backfill-listing-search-projection.ts:108,150`.
- **Archiver:** not stripped by archiver (only raw_data/media/compliance are).
- **Runtime surfaces:** public render, CRM, search projection, building search, ops, tests.
- **Migration required before strip:** re-point ~50 DTO sub-keys to structured columns (some already
  on the projection); **re-point the projection builder off `features` first** (it both reads
  `features` and is the migration destination — a circular dependency); structured homes for
  `CommonInterest`, `BuildingKeyNumeric`, FARE-Act fee group; rewrite CRM/idx-sync writers.
- **Risk if stripped prematurely:** blanks public descriptions, property-type classification,
  amenities, **FARE-Act fee disclosures (legal exposure)**; next projection sync/backfill writes
  empty search data → broken search.

### 2.5 `agent_info` (`Listing.agent_info Json @default("{}")` — `prisma/schema.prisma:480`)

- **Strippable today: NO.** Materially different reclaim path: **the archiver does NOT strip
  `agent_info`** (`data-retention/route.ts:268-276` nulls only raw_data/media/compliance) — so its
  only reclaim path is **normalization to typed columns**, not archive.
- **Readers (render-critical):** public DTO `lib/idx/db-to-public-dto.ts:273,414` (`ListOfficeName`);
  exclusive contact card `lib/listings/assigned-agent.ts:66-72` (agent name/email/phone) rendered at
  `app/listing/[...slug]/page.tsx:2014-2071`; public office attribution `app/api/open-houses/
  route.ts:370-371`, `similar/route.ts:203`; portal mask `lib/compliance/dto.ts:270-282,368`.
- **Readers (syndication-critical):** `lib/syndication/eligibility.ts:130-133,301-302` — canonical
  MLS IDs (`ListOfficeMlsId/ListAgentMlsId/CoListOfficeMlsId/CoListAgentMlsId`), invariant I.5.
- **Readers (CRM/archive):** CRM grid `public/crm/js/core/data-loader.js:220,254-257` + form hydrate
  (4 HTML files); archiver `data-retention/route.ts:261-262` (`list_agent_full_name/list_office_name`
  into `listings_archive`).
- **Writers / refill:** `lib/idx/sync.ts:300,334,1137,1165`; `feed-reconcile:381`; `reset-sync:137,169`;
  `app/api/idx/ensure-listing/route.ts:88-93`; CRM POST `crm/listings/route.ts:418-425`, PATCH
  `.../[id]/route.ts:386-417`; `lib/listings/exclusive-agent-assignment.ts:152-168`; ops scripts
  `scripts/backfill-crm-exclusive-cotality-identity.mjs`, `scripts/ops/set-exclusive-listing-agent.mjs`,
  `repair-exclusive-agent-assignment.mjs`, `scripts/import-closed-from-trestle.ts:307-313`.
- **Runtime surfaces:** public render, CRM, syndication, archive, ops, tests.
- **Migration required before strip:** promote **all 8 read keys** to typed columns (today only
  `list_agent_full_name`/`list_office_name` exist; **the migration is already partially in place** —
  `lib/syndication/eligibility.ts:300` reads the typed `listing.list_office_name` column for
  brokerage attribution, so that typed read path must be preserved/extended, not treated as
  JSON-only; most other readers still use the `agent_info` JSON — schema "Phase B"); repoint every
  render reader + the portal PII mask + syndication MLS-ID gate + archiver; rewrite all writers;
  backfill; update fixtures.
- **Risk if stripped prematurely:** breaks office attribution on public, the exclusive contact card,
  and CRM grid/forms; syndication fail-closes silently (MLS-ID gate empties); **PII-masking guards
  must be preserved** (office-only on public, agent PII only on exclusive card / authenticated CRM).

### 2.6 `address` (`Listing.address Json @default("{}")` — `prisma/schema.prisma:476`)

- **Strippable today: NO.** Most-depended-on column (~40+ select-sites + ~30 property reads). **Not
  stripped by the archiver** — a **NORMALIZE-first** column.
- **Readers (render-critical):** central mapper `lib/idx/db-to-public-dto.ts:271-296,348-388`;
  detail page + JSON-LD `app/listing/[...slug]/page.tsx:842-984`; main API `app/api/listings/
  route.ts:346,822-857`; sitemap `app/sitemap.ts:97,111-124`; **open-houses street build**
  `app/api/open-houses/route.ts:333-342`; cards/map components (`SearchListingCard`, `SearchMap`,
  `FeaturedListings`, …) via the DTO.
- **Readers (search-critical, raw SQL / JSON-path):** `app/api/buildings/search/route.ts:523-536`
  (`address->>'StreetNumber'`, `LOWER(address->>'StreetName')`); `lib/search/public-listing-db.ts:
  145-188` (Prisma JSON-path filters + `address:{not:DbNull}` website-only gate).
- **Readers (projection/search-critical):** `lib/search/listing-search-projection.ts:195-210,305`
  (street parts + city → searchable text; lat/lng/state → columns).
- **Readers (CRM/archive/CMA/recommender):** many `app/api/portal/**` + `app/api/crm/**` selects;
  archiver `data-retention/route.ts:221-232` (`address_line`); `lib/cma/engine.ts:180-182`;
  `lib/buyer-intent/recommender.ts:104-106`.
- **Writers / refill:** Trestle mapper `lib/idx/mapping.ts:282-305` (camelCase); `lib/idx/sync.ts:
  296,330,378,1133,1161,1204`; `feed-reconcile:377`; projection backfill
  `scripts/backfill-listing-search-projection.ts:107,149`.
- **Runtime surfaces:** public render, search (incl. raw-SQL JSON-path filters), projection, archive,
  CRM/portal, CMA, recommender, sitemap, ops, tests.
- **Migration required before strip:** add ~11 NEW structured columns to `Listing` (`street_number,
  street_dir_prefix, street_name, street_suffix, street_dir_suffix, unit_number, county,
  state_or_province, latitude, longitude, building_name`; `city/postal_code/borough/neighborhood`
  already exist) — all nullable, no NOT-NULL default (NEON.md §4); backfill handling **both
  camelCase and PascalCase** key shapes; **rewrite the raw-SQL/JSON-path filters** to column
  predicates; re-point the projection builder; dual-write in idx-sync; migrate readers one at a time;
  update the address-suppression logic in `dto.ts`.
- **Risk if stripped prematurely:** breaks the public detail page, search filtering, the map, the
  projection, the archiver `address_line`, sitemap, and open-houses; **`StreetDirPrefix` preservation**
  and **`InternetAddressDisplayYN` suppression** (fail-closed, map-pin reverse-lookup) must be carried
  onto the new columns.

---

## 3. Step 6 status — addressed, current FAIL / blocked

**Step 6 has been addressed as a current FAIL / blocked gate; the passing proof is deferred until the
prerequisite storage-reduction work is completed.** It is NOT simply "deferred." Reasoning:

- Step 6 requires proof that the production DB **billed/synthetic** size is below the Neon Free cap
  (`500,000,000` bytes ≈ 477 MiB at the time of writing).
- The known path to reduce that size is **legacy-JSON removal/rewrite** (≈663 MB of the ~1.1 GB live
  data is redundant legacy JSON).
- **§2 proves the app still depends on all six JSON columns**, so none can be safely stripped yet —
  the storage-reduction prerequisite has **not** happened.
- **The archive path currently offers no drain** (measured 2026-06-18 via the #408 runbook, read-only):
  - `N_off` (narrow archive backlog) = **0**
  - `N_on` (widened archive backlog) = **0**
  - `widened_delta = N_on − N_off` = **0**
  - `nights_to_drain = ceil(N_on / 500)` = **0**
  - `ARCHIVE_T180_BACKLOG_ENABLED` remains **OFF** (and need not be enabled — there is nothing to
    drain).
- Therefore the archive path does **not** reduce storage now, and neither does JSON stripping (blocked
  by §2). Because **neither lever has reduced storage**, Step 6 cannot honestly be marked PASS today.
- **Current Step 6 verdict: FAIL / blocked** by the Step 5 migration and a later storage
  re-measurement.

---

## 4. What would make Step 6 pass later

1. Complete the Step 5 consumer/writer migration (§2) — normalize/promote each column's fields to
   structured columns or the `listing_media` table; re-point every reader.
2. **Stop the legacy-JSON refill writers** (idx-sync upserts, feed-reconcile, reset-sync, CRM writers,
   `backfillEmptyMedia`) so emptied columns do not re-grow.
3. Perform the approved rewrite/strip **only after** readers and writers are migrated (row-rewrite to
   minimal/empty JSON or `DROP COLUMN` per the Step-4 plan).
4. Allow/confirm Neon storage-reclaim timing, including **PITR / retention** behavior (reclaim lands
   only after GC past the PITR window — `DROP COLUMN` alone is catalog-only and frees no bytes).
5. Measure the **correct Neon billed/synthetic size** — not only `pg_database_size` — in bytes.
6. Confirm the measured size is below `500,000,000` bytes (or the active Neon Free limit at that time).
7. Only then can Step 6 be marked **PASS**.

---

## 5. Open / closed status

**Closed:**
- **#407** — flag-aware `ops-health` archive-backlog predicate (merged).
- **#408** — controlled archive-flag runbook + measurement packet (merged).
- **Archive backlog measurement** — `N_off=0, N_on=0, widened_delta=0, nights_to_drain=0`; no flag
  enable needed (nothing to drain).

**Current failed / blocked gates:**
- **Step 5: FAIL** — legacy-JSON dependencies remain across all six columns (§2).
- **Step 6: FAIL / blocked** — cannot prove Free-tier size until the Step 5 storage-reduction work
  happens (§3). Addressed as a current FAIL/blocked gate; passing proof deferred until the
  prerequisite storage-reduction work is completed.

**Open future work (NOT started — separate, Maya-gated):**
- Step 5 migration implementation plan (phased; per-column sequencing — e.g. `address`/`media` look
  like the most self-contained starts).
- Step 6 re-measurement after the Step 5 migration / rewrite / reclaim.

**Floor:** `$19` Neon Launch remains the floor until the above completes.

---

*Report only. No code, schema, DB, env, archive-flag, archive-run, JSON-rewrite, or Neon/Vercel/R2/cap
change was made in producing this document. The archive flag remains OFF.*
