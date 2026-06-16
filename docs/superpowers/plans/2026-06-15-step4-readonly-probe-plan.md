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
  2. **Live / non-terminal `raw_data` reclaim — HELD.** Locked until the archiver migration /
     re-fetch / structured-close-term proof ships (§A prerequisite). **It must NOT be counted in
     any pre-migration Free go/no-go.**
- Present the simulation as **two explicit scenarios:**
  - **Scenario 1 — Pre-migration Free go/no-go (the ONLY one that may gate a downgrade):**
    terminal `raw_data` (archive path) + `compliance` + `media` + `features` bulk-strip (live rows,
    NOT `raw_data`) + `address`/`agent_info` after normalization. **Live `raw_data` EXCLUDED.**
    Compare against the **Free cap of 500,000,000 bytes (~477 MiB; Neon's 0.5 GB is decimal)**, in
    BYTES.
  - **Scenario 2 — Post-archiver-migration (informational ONLY, not a downgrade gate yet):**
    Scenario 1 **plus** the live-row `raw_data` reclaim — valid only once the §A archiver-migration
    prerequisite is shipped and proven. Clearly labeled "not creditable until migration."
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
  (public listing page / search card / portal) · **CRM-critical** · **archive-critical** ·
  **syndication-critical** · **projection-critical** (the search-projection builder reads it) ·
  **RESO-critical** (the RESO / IDX-feed mapper reads it) · ETL/re-derivation only · dead/unused.
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
- **ROOT-CAUSE COMPLETENESS NOTE (do-not-ignore sweep, 2026-06-16).** An exhaustive repo sweep shows
  the "bulk-strippable" labels on `compliance`/`features`/`media` were premature — every one has a
  live consumer beyond the archiver:
  - **`agent_info`** → public/portal DTO `lib/compliance/dto.ts:270,282,368` (render) + archive + CRM + **syndication**.
  - **`features`** → render DTO `lib/compliance/dto.ts:366` + `lib/idx/db-to-public-dto.ts:272`; **the search projection** `lib/search/listing-search-projection.ts:194,227,260,304,555` (the future read path); RESO output `lib/compliance/reso-mapper.ts:239-253`; CRM PATCH merge `app/api/crm/listings/[id]/route.ts:329`.
  - **`media`** (JSON) → DTO `lib/compliance/dto.ts:367` + projection `:261,556` + RESO `lib/compliance/reso-mapper.ts:281` + CRM media routes (`importJsonMediaToRows`).
  - **`compliance`** → **syndication** `lib/syndication/eligibility.ts`.
  **Conclusion: NO JSON column is freely strippable today.** Each per-column verdict MUST be
  re-derived from this complete consumer map; the only `raw_data`/JSON reclaim available now is the
  archive path (terminal rows). This makes Free further off, reinforcing $19 as the floor.
- **PROJECTION-critical and RESO-critical reads are ALSO BLOCKERS (Codex #404) — not just listed in
  the map above, but BLOCKING in the verdict:**
  - **Projection:** `lib/search/listing-search-projection.ts:193-290` derives searchable text,
    amenity keys, and media flags from `features`/`media` (and others) into
    `listing_search_projection`, which `lib/search/core.ts:114-121` uses for **production listing
    search**. Stripping the JSON before the projection builder is migrated/re-derived would make the
    next sync/backfill write **empty projection data** → broken search. The projection is the PR-5B
    *read* target but is itself a *consumer/builder* of the JSON.
  - **RESO/IDX-feed:** `lib/compliance/reso-mapper.ts:239-253,281` maps `features`/`media` into RESO
    output. Stripping before migrating it blanks feed/syndication output fields.
- Verdict per column — **SAFE TO DROP requires NO render-critical, NO CRM-critical, NO
  archive-critical, NO syndication-critical, NO projection-critical, AND NO RESO-critical read.**
  Otherwise: **DROP only AFTER migrating every critical reader off the column** — PR 5B (public read
  → projection) **+** CRM migration **+** archiver migration **+** syndication migration **+**
  **projection-builder migration** (derive from structured columns) **+** **RESO-mapper migration**;
  or **NORMALIZE FIRST** (`address`, `agent_info` feed display, CRM, archiver, syndication). **Any
  render / CRM / archive / syndication / projection / RESO critical read = a required migration or
  exclusion BEFORE drop.**
- **Output:** a per-column dependency matrix (render + CRM + archive + syndication + projection +
  RESO) feeding Step 5's proof.

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
