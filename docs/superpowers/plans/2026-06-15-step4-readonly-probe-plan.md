# Step 4 — READ-ONLY operator probe plan (Free-tier savings + JSON dependency inventory)

> **READ-ONLY. NO WRITES, NO CLEANUP, NO MIGRATIONS, NO COLUMN DROPS, NO NEON DOWNGRADE.**
> These probes only MEASURE and INVENTORY so the Step-4 decision rests on live numbers and a
> proven dependency map — not estimates. Operator-run (Claude is blocked from `.env`); host-guarded
> to canonical prod, `default_transaction_read_only=on`. Author: Claude (Fable 5), 2026-06-15.

## Probe 1 — Per-column savings simulation (read-only SQL)
**Goal:** the exact MB each JSON column occupies live, and the projected DB size after each
candidate drop — measured, not estimated.
- `pg_database_size(current_database())` (the headline) + `pg_total_relation_size('listings')`
  split heap / TOAST / indexes.
- Per JSON column on `listings`: `SUM(pg_column_size(col))` for `raw_data`, `compliance`,
  `features`, `agent_info`, `address`, `media` — over all rows AND split by
  displayable vs terminal (`status IN TERMINAL_STATUSES`), so we see how much each drop frees on
  live rows vs terminal-only rows.
- **`raw_data` savings are SPLIT into two parts that must never be combined in a pre-migration
  go/no-go (Codex #404; plan §C/§A):**
  1. **Archive-safe / terminal `raw_data` reclaim** — freed through the **archive path** (the
     archiver extracts close terms, then nulls `raw_data` atomically) as the T+180 backlog drains.
     This is the ONLY `raw_data` reclaim creditable before the archiver migration.
  2. **Live / non-terminal `raw_data` reclaim — HELD behind TWO prerequisites.** Locked until BOTH
     (a) the archiver migration / re-fetch / structured-close-term proof AND (b) the **public render
     DTO migration off `raw_data`** ship (§A two-migration prerequisite). Live rows are publicly
     rendered and the public DB DTO derives virtualTourURL / DOM / lease / availability / close-date
     fields from `raw_data` — so this reclaim is render-critical too. **It must NOT be counted in any
     pre-migration Free go/no-go.**
- Present the simulation as **two explicit scenarios:**
  - **Scenario 1 — Pre-migration Free go/no-go (the ONLY one that may gate a downgrade):**
    terminal `raw_data` (archive path) + `compliance` + `media` + `features` bulk-strip (live rows,
    NOT `raw_data`) + `address`/`agent_info` after normalization. **Live `raw_data` EXCLUDED.**
    Compare against the **Free cap of 500,000,000 bytes (~477 MiB; Neon's 0.5 GB is decimal)**, in
    BYTES.
  - **Scenario 2 — Post-migration (informational ONLY, not a downgrade gate yet):**
    Scenario 1 **plus** the live-row `raw_data` reclaim — valid only once **BOTH** §A prerequisites
    (archiver migration AND public render-DTO migration off `raw_data`) are shipped and proven. A
    post-archiver-migration run alone does NOT unlock this: while `dbListingToPublicDTO` still reads
    `raw_data`, nulling live rows would blank virtualTourURL / DOM / lease / availability / close-date
    on public cards. Clearly labeled "not creditable until BOTH migrations ship."
- Bloat context: per-table `n_live_tup` / `n_dead_tup` / dead% + `last_autovacuum` (confirms the
  ~11.6% / ~30 MB figure is current; bloat ages out of Free's 6-h PITR so it is not the lever).
- **Output:** the **Scenario 1** waterfall (the downgrade gate) + the **Scenario 2** waterfall
  (informational, post-migration) as separate tables, plus the live-vs-terminal split per column.
  Live `raw_data` appears ONLY in Scenario 2.
- Suggested script (untracked): `scripts/__step4-plan-archive-throughput-2026-06-15.mjs` +
  `scripts/__step4-plan-scat-distribution-2026-06-15.mjs` already drafted by the (timed-out)
  planning agent — extend with the per-column `pg_column_size` sums.

## Probe 2 — Code-path dependency inventory per JSON column (read-only repo scan)
**Goal:** for EACH of the 6 JSON columns, every code path that READS it — so Step 5 can prove a
column is safe to drop (or must be normalized first). This is a repo grep + reasoning task, not a
DB probe.
For each column (`raw_data`, `compliance`, `features`, `agent_info`, `address`, `media`):
- Grep `lib/`, `app/`, `public/crm/`, `scripts/` for reads of the column (Prisma `select`,
  `.raw_data`, JSON-path access, DTO mappers, render components, sitemap, search projection
  builders).
- Classify each read into one of the blocker categories (+ non-blocking): **render-critical**
  (public listing page / search card / portal / **public `/api/open-houses` payload** / agent page /
  sitemap) · **CRM-critical** · **archive-critical** ·
  **syndication-critical** · **projection-critical** (the search-projection builder reads it) ·
  **Cotality-critical** (the Cotality / IDX-feed mapper reads it) · ETL/re-derivation only · dead/unused.
- **CRM-critical reads are BLOCKERS, not a free pass (Codex #404).** A column is **NOT** "safe to
  drop" merely because no public render reads it — the CRM has production dependencies that lose
  data:
  - `app/api/crm/listings/[id]/route.ts:101-103` — **PATCH merges `listing.raw_data`** into the
    saved record (`{ ...existingRaw, ...body }`); nulling `raw_data` drops saved form state on edit.
  - `app/api/crm/listings/[id]/route.ts:62-70` GET returns the **full sanitized listing** (all JSON
    columns), consumed by `public/crm/js/core/data-loader.js:217-221` (`address`/`features`/
    `agent_info`/`media`) + `.../validate/route.ts:43-50`. Dropping these blanks CRM edit/search
    fields.
- **ARCHIVE-critical reads are ALSO BLOCKERS (Codex #404).** The data-retention archiver
  (`app/api/cron/data-retention/route.ts:187-239`) reads several JSON columns to build the NY-DOS
  6-year `listings_archive` summary; stripping those from live rows without migrating the archiver
  blanks historical archive fields on future terminal rows:
  - **`raw_data`** → `close_price`, `close_date`, `original_list_price` (`:225-228`).
  - **`address`** → `address_line` (`:198-209`).
  - **`agent_info`** → `list_agent_full_name`, `list_office_name` (`:237-239`).
  These three are **archive-critical until the archiver is migrated/proven to read from structured
  columns or a safe re-fetch.** The archiver does not read `compliance`/`media`/`features`.
- **SYNDICATION-critical reads are ALSO BLOCKERS (Codex #404).** `lib/syndication/eligibility.ts`
  reads `listing.agent_info` and `listing.compliance` to gate Mallan-Exclusive / co-list / manual
  syndication eligibility — specifically `compliance.syndication` (`:128`),
  `compliance.mallan_control_verification` (`:221`), `compliance.seller_advertising_authorization`
  (`:282`), `compliance.media_rights` (`:289`), and `agent_info` for canonical MLS IDs. **Mark
  `compliance` and `agent_info` syndication-critical until `lib/syndication/eligibility.ts` is
  migrated/proven to use structured fields or a safe re-derivation path.** (Syndication is HELD
  today via the empty-config guard, but the code reads these fields — stripping them would
  fail-close approved exclusives/co-list/manual rows or lose their approval state when syndication
  is enabled.)
- **ROOT-CAUSE NOTE (do-not-ignore sweep, 2026-06-16) — this map is ILLUSTRATIVE, NOT exhaustive.**
  Repeated review (Codex #406 r1–r4) kept surfacing consumers an inline list had missed — render
  `raw_data`, render `compliance`, projection `address`, and the public `/api/open-houses` payload.
  The lesson: a hand-written consumer list is not a safe drop gate, and **`grep -rn "^\s*<col>:\s*true"`
  is NOT the authoritative gate — it is only ONE probe among several.** A column-narrow Prisma-select
  grep misses raw SQL, property reads, destructuring, helpers, and writers (Codex #406 r5:
  `app/api/buildings/search/route.ts:536-556` reads `address`/`features`/`raw_data` via raw
  `$queryRawUnsafe` SQL → `extractSavedProfileValues(l.raw_data, l.features, l.custom_fields)`, which
  a select grep misses entirely). **SCOPE: every probe runs across `app lib scripts public/crm`**
  (Codex #406 r6 — JSON readers exist outside `app`/`lib`: `scripts/backfill-listing-search-projection.ts:149-151`
  selects `address`/`features`/`media`; `public/crm/SALE-FORM-REDESIGN.html:9548-9552` reads
  `raw_data`/`address`/`features`/`agent_info`/`media` from API payloads to hydrate the seller form;
  an `app`/`lib`-only gate would leave these operational/CRM consumers broken by a strip). **The
  authoritative Step-5 scan is a repo-wide multi-probe sweep covering ALL of the following; a column
  cannot be marked CLEAR until every probe is clean across all four roots OR each hit is
  migrated/proven safe:**
  1. **Prisma `select` AND `include` patterns** — `grep -rn "^\s*<col>:\s*true" app lib scripts public/crm`
     is the starting probe (run 2026-06-16 over `app`+`lib`: **`address` ~30 sites · `media` 11 ·
     `features` 8 · `agent_info` 7 · `raw_data` 4 · `compliance` 0**; spans public render `app/api/listings`,
     `app/api/agents/[slug]/listings`, `app/api/open-houses`, `app/api/listings/[id]`,
     `app/api/market`, `app/sitemap.ts`; portal `app/api/portal/favorites|offers|offer-status|showings`;
     CRM `app/api/crm/**`; cron `data-retention`/`listing-expiration`; lib `lib/search/core.ts`,
     `lib/search/listing-search-projection.ts`, `lib/cma/engine.ts`, `lib/buyer-intent/recommender.ts`;
     **plus `scripts/**` — e.g. `scripts/backfill-listing-search-projection.ts`, `scripts/comps/by-property.ts`,
     `scripts/backfill-crm-exclusive-cotality-identity.mjs`**) — but NOT sufficient alone.
  2. **Direct property reads** — `listing.<col>`, `dbListing.<col>`, `l.<col>`, `s.listing.<col>`
     (`grep -rn "\.<col>\b" app lib scripts public/crm`; incl. browser JS reading API payloads, e.g.
     `public/crm/SALE-FORM-REDESIGN.html:9548-9552`).
  3. **Destructuring of the JSON columns** — `const { <col> } = listing` / `({ <col> }) =>` forms.
  4. **Raw SQL `SELECT`s** mentioning the columns — `grep -rn "queryRaw\|queryRawUnsafe" app lib scripts`,
     then read each (known hits: `app/api/buildings/search/route.ts:536-556`
     `address`/`features`/`raw_data`; `app/api/debug/media-health/route.ts:69` + `lib/idx/sync.ts:850`
     `media`). **String-built `$queryRawUnsafe` can't be statically resolved — each call site needs a
     manual read.**
  5. **Mapper / builder / parser functions** that take a JSON column as input — e.g.
     `extractSavedProfileValues`, `dbListingToPublicDTO`, the projection builder, the Cotality mapper —
     trace their callers even when the column name doesn't appear at the call site.
  6. **Writer / upsert / update paths** — `lib/idx/sync.ts:330-335`, `:1161-1166` re-upsert the JSON;
     these REPOPULATE a stripped column (see the writer/refill blocker below). Includes operational
     writers in `scripts/**` (e.g. `scripts/backfill-crm-exclusive-cotality-identity.mjs` writes
     `agent_info`).
  7. **Refill / backfill paths** — `backfillEmptyMedia` (`lib/idx/sync.ts:696-702`) re-fetches `media`
     on `[]`/null; `scripts/backfill-listing-search-projection.ts` rebuilds the projection from
     `address`/`features`/`media` (stripping those first would backfill EMPTY search data).
  8. **Full-record fetches followed by helper calls** — `findUnique`/`findMany` with no `select` (or
     a `select` returning the whole row) whose result is then handed to a mapper/render path, e.g.
     the detail page (`compliance` has ZERO narrow selects yet renders via `page.tsx:545,621`,
     `publicRemarks` ← `compliance.PublicRemarks` — column-narrow grep alone would wrongly clear it).
  **A column is CLEAR only when all 8 probes are clean across `app lib scripts public/crm` (or each
  hit is migrated/proven safe). Nothing is classified out-of-scope by default.**
  Representative per-column criticality (illustrative — confirm against the full multi-probe scan, do
  not treat as the whole list):
  - **`raw_data`** → **render** (public DB DTO derives virtualTourURL / previousListPrice / DOM / lease / availability / on-close dates ONLY from `raw_data` — `app/api/listings/route.ts:348-356`, `lib/idx/db-to-public-dto.ts:298`) + archive (`:225-228`) + CRM PATCH (`:101-103`). Render-critical — live-row reclaim needs the public-DTO migration too.
  - **`agent_info`** → public/portal/agent-page DTO (`lib/compliance/dto.ts:270,282,368`; `app/api/open-houses/route.ts:368-370` office attribution; `app/api/agents/[slug]/listings`) + archive + CRM + **syndication**.
  - **`features`** → render DTO `lib/compliance/dto.ts:366` + `lib/idx/db-to-public-dto.ts:272`; **public `/api/open-houses` property-type display** (`app/api/open-houses/route.ts:363`, `features.CommonInterest`); **search projection** `lib/search/listing-search-projection.ts:194,227,260,304,555`; Cotality `lib/compliance/cotality-mapper.ts:239-253`; CRM PATCH `app/api/crm/listings/[id]/route.ts:329`.
  - **`media`** (JSON) → DTO `lib/compliance/dto.ts:367` + **public `/api/open-houses` first-photo image** (`app/api/open-houses/route.ts:350-351`) + projection `:261,556` + Cotality `lib/compliance/cotality-mapper.ts:281` + CRM media routes (`importJsonMediaToRows`).
  - **`compliance`** → **render** (detail-page `publicRemarks` ← `compliance.PublicRemarks` — `app/listing/[...slug]/page.tsx:545,621`) + **syndication** `lib/syndication/eligibility.ts`. Render-critical, not syndication-only.
  - **`address`** → render (incl. **public `/api/open-houses` street build**, `app/api/open-houses/route.ts:333-342`) + CRM + archive (`address_line`, `route.ts:198-209`) + sitemap (`app/sitemap.ts:97`) + **projection/search** (street parts + city → projection search text, `lib/search/listing-search-projection.ts:195-202,305`). Normalizing/dropping `address` requires re-deriving the projection builder from the new structured columns, else the next projection sync/backfill loses address keyword text used by customer-facing search.
  **Conclusion: NO JSON column is freely strippable today.** Each per-column verdict MUST be
  re-derived from the live Step-5 grep (above), not from this prose; the only `raw_data`/JSON reclaim
  available now is the archive path (terminal rows). This makes Free further off, reinforcing $19 as
  the floor.
- **PROJECTION-critical and Cotality-critical reads are ALSO BLOCKERS (Codex #404) — not just listed in
  the map above, but BLOCKING in the verdict:**
  - **Projection:** `lib/search/listing-search-projection.ts:193-290` derives searchable text,
    amenity keys, and media flags from `features`/`media` **and `address`** (street parts +
    city, `:195-202,305`) into `listing_search_projection`, which `lib/search/core.ts:114-121`
    uses for **production listing search**. Stripping/normalizing the JSON before the projection
    builder is migrated/re-derived would make the next sync/backfill write **empty projection
    data** → broken search (including loss of address keyword text). The projection is the PR-5B
    *read* target but is itself a *consumer/builder* of the JSON. **`address` normalization MUST
    re-point the projection builder at the new structured columns before the JSON is dropped.**
  - **Cotality/IDX-feed:** `lib/compliance/cotality-mapper.ts:239-253,281` maps `features`/`media` into Cotality
    output. Stripping before migrating it blanks feed/syndication output fields.
- **WRITER / REFILL is a SEVENTH blocker (Codex #406-r5) — and it gates DURABILITY, not just
  correctness.** idx-sync re-upserts `address`/`features`/`compliance`/`agent_info`/`raw_data` on
  every update (`lib/idx/sync.ts:330-335`,`:1161-1166`) and `backfillEmptyMedia` re-fetches `media`
  on `[]`/null (`:696-702`). A strip that passes every reader gate STILL repopulates on the next
  sync unless the writer is migrated to stop writing the JSON (or write a reduced shape). **No
  reclaim is creditable for the downgrade until a "no writer/refill repopulates this column" proof
  passes.**
- Verdict per column — **SAFE TO DROP requires NO render-critical, NO CRM-critical, NO
  archive-critical, NO syndication-critical, NO projection-critical, NO Cotality-critical read, AND a
  proven no-writer/refill-repopulation path.** Otherwise: **DROP only AFTER migrating every critical
  reader off the column AND migrating the writer** — PR 5B (public read → projection) **+** CRM
  migration **+** archiver migration **+** syndication migration **+** **projection-builder
  migration** (derive from structured columns) **+** **Cotality-mapper migration** **+** **idx-sync
  writer/backfill migration**; or **NORMALIZE FIRST** (`address`, `agent_info` feed display, CRM,
  archiver, syndication). **Any render / CRM / archive / syndication / projection / Cotality critical
  read — OR any live writer/refill path — = a required migration or exclusion BEFORE drop.**
- **Output:** a per-column dependency matrix (render + CRM + archive + syndication + projection +
  Cotality + **writer/refill**) feeding Step 5's proof.

## Probe 3 — Required normalization fields (for `address` / `agent_info`)
**Goal:** identify the exact sub-fields the render paths need from `address`/`agent_info`, so a
normalization (JSON → structured columns) is scoped precisely and minimally.
- From Probe 2's render-critical reads, enumerate the JSON keys actually consumed (e.g.
  `address.StreetNumber/StreetName/UnitNumber/City/PostalCode`; `agent_info.ListAgentFullName/
  ListOfficeName`).
- Cross-check which already exist as structured columns on `listings` (several do — `borough`,
  `neighborhood`, `city`, `postal_code`, `list_agent_*`) vs which would need new columns.
- **Output:** the minimal column set required so `address`/`agent_info` JSON can be dropped — the
  scope of the eventual normalization (a separate, Maya-gated change; NOT in any probe).

## Hard boundaries (all three probes)
- READ-ONLY: `SELECT` / `pg_*` size functions / repo grep only. No `UPDATE`/`DELETE`/`ALTER`/
  `VACUUM`/`pg_repack`. No Neon API writes. No downgrade. No cleanup.
- Probes inform the decision; they do not authorize any drop, normalization, archive run, or
  downgrade — each remains separately Maya-gated behind PR 5B + Step 5.
- Operator-run via `! node scripts/__step4-*.mjs`; Claude stays blocked from `.env`.
