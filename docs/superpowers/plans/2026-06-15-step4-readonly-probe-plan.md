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
- Cumulative simulation: DB size after {raw_data}, {+compliance}, {+media}, {+features},
  {+address}, {+agent_info} — a waterfall to compare against the **Free cap of 500,000,000 bytes
  (~477 MiB; Neon's 0.5 GB is decimal)**, in BYTES to avoid binary/decimal MB confusion (Codex #404).
- Bloat context: per-table `n_live_tup` / `n_dead_tup` / dead% + `last_autovacuum` (confirms the
  ~11.6% / ~30 MB figure is current; bloat ages out of Free's 6-h PITR so it is not the lever).
- **Output:** a savings waterfall table + the live-vs-terminal split per column.
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
- Classify each read: **render-critical** (public listing page / search card / portal) ·
  **CRM-critical** · **ETL/re-derivation only** · **dead/unused**.
- **CRM-only reads are BLOCKERS, not a free pass (Codex #404).** A column is **NOT** "safe to drop"
  merely because no public render reads it — the CRM has production dependencies that lose data:
  - `app/api/crm/listings/[id]/route.ts:101-103` — **PATCH merges `listing.raw_data`** into the
    saved record (`{ ...existingRaw, ...body }`); nulling `raw_data` drops saved form state on edit.
  - `app/api/crm/listings/[id]/route.ts:62-70` GET returns the **full sanitized listing** (all JSON
    columns), consumed by `public/crm/js/core/data-loader.js:217-221` (`address`/`features`/
    `agent_info`/`media`) + `.../validate/route.ts:43-50`. Dropping these blanks CRM edit/search
    fields.
- Verdict per column — **SAFE TO DROP requires NO public-render read AND NO CRM-critical read**
  (e.g. `raw_data` is a re-fetchable Trestle cache for DISPLAY, but its CRM PATCH-merge dependency
  must be removed/migrated first); **DROP AFTER PR 5B** (public read moves to the projection) +
  **AFTER CRM migration** (CRM reads moved off the column); or **NORMALIZE FIRST** (`address`,
  `agent_info` feed both display and CRM — need structured columns before the JSON can go).
  **Any CRM-critical read = a required CRM migration/exclusion BEFORE drop.**
- **Output:** a per-column dependency matrix (public + CRM) feeding Step 5's proof.

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
