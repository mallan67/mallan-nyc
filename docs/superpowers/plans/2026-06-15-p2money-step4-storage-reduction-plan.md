# P2-MONEY Step 4 — Storage-reduction plan (REVISED) — the path to Neon Free

> **STATUS: PLAN ONLY — NO EXECUTION AUTHORIZED.** No cleanup, no column drop, no archive run,
> no VACUUM, no migration, no Neon downgrade. Every step separately Maya-gated. This document
> records the **revised conclusion** after the 2026-06-15 Free-tier investigation corrected two
> assumptions in the first draft. Author: Claude (Fable 5), 2026-06-15.
>
> **Evidence:** `docs/audits/neon-storage-cost-audit-2026-06-12.md` (committed) · Neon docs
> ([plans](https://neon.com/docs/introduction/plans), [synthetic-size](https://github.com/neondatabase/neon/blob/main/docs/synthetic-size.md))
> · direct read of `app/api/cron/data-retention/route.ts`.

---

## REVISED CONCLUSION (the headline)

1. **Neon Free target ≈ 477 MiB per project** — NOT 512 (Codex #404). Neon's Free storage is
   **0.5 GB**, and Neon's GB is **decimal (10⁹ bytes)** → **500,000,000 bytes = ~477 MiB**. The
   audit's "MB" are `pg_size_pretty` **binary MiB**, so the go/no-go must compare in consistent
   units: **synthetic size ≤ 500,000,000 bytes (~477 MiB), with margin** — tighter than 512, which
   makes Free harder. Free PITR window is 6 hours (vs Launch 7 days). (Throughout this doc "MB" =
   `pg_size_pretty` MiB unless stated; the cap is the decimal-GB figure above.)
2. **Current DB is ~1.1 GB of genuinely LIVE/logical data — not dead-tuple bloat.** Neon bills
   *synthetic/logical size*, not `pg_database_size`; that distinction raised the hope that bloat
   was inflating the number. It is not: audit §5 shows `listings` is only **11.6% dead (~30 MB)**;
   autovacuum keeps up. So logical ≈ `pg_database_size` − ~30 MB ≈ **~1,100 MB live.**
3. **The main storage blocker is REDUNDANT LEGACY JSON in `listings`.** Of the 894 MB `listings`
   table, **663 MB is TOAST'd legacy JSON** — `raw_data` 258 MB (a full copy of the raw Trestle
   payload; Trestle is the live source, so it is a re-fetchable cache), `compliance` 197 MB
   (derivable from gate fields), `media` 5.7 MB (superseded by the `listing_media` table),
   `features` 99 MB, `agent_info` 38 MB, `address` 34 MB. The *genuinely needed* data is
   ~450–500 MB — i.e. "Free shouldn't be a problem" is right in principle; the DB is carrying
   ~630 MB of dead-weight duplicate JSON.
4. **Archive-only is INSUFFICIENT.** Archiving terminal rows (even after fixing the eligibility
   bug — see §B and the separate correction scope) only strips `raw_data`+`compliance`+`media`
   **on the ~91.5K terminal rows**, which hold **raw_data 223 MB + compliance 170 MB** (+ a sliver
   of `media`) per audit Q6b/R2 — **~398 MB**, NOT the all-row 461 MB total. So archive-only →
   DB **~737 MB**, **still well over the ~477 MiB Free cap** (Codex #404). It cannot touch the same JSON on the
   ~16K live/displayable rows, and it **leaves `features` (87 MB) + `agent_info` + `address`** even
   on terminal rows.
5. **Free is achievable ONLY through safe legacy-JSON elimination / normalization, + audit
   compaction, + ongoing archival discipline.** Each "size" below is the **post-rewrite target**
   reached by **rewriting each column to its schema-valid minimal value** (`raw_data=NULL` since it
   is nullable; `compliance='{}'`, `features='{}'`, `agent_info='{}'`, `address='{}'`, `media='[]'`
   for the NOT-NULL columns — see §C) + GC past the PITR window — **NOT** the output of
   `DROP COLUMN`, which is catalog-only and frees no bytes (see §C, Codex #404). Targets are
   projections from the 06-12 audit; the go/no-go uses the **measured** Neon billed size after the
   rewrite (Step 6), never these estimates.

   > **CREDITING RULE (general, Codex #406-r5).** No JSON storage saving is creditable toward the
   > Free go/no-go until BOTH (a) **all read consumers** of that column are migrated off it (the
   > full multi-probe Step-5 scan is clean — readers, mappers, raw SQL, property reads, full-record
   > fetches) **AND** (b) **all writer/refill paths** are migrated, disabled, or proven unable to
   > repopulate the JSON (`lib/idx/sync.ts:330-335`, `:1161-1166` re-upsert on every update;
   > `backfillEmptyMedia` `:696-702` re-fetches `media`). Reader migration ALONE is insufficient:
   > the strip would be **transient** and the next incremental sync / media backfill would
   > repopulate the column, breaching the Free cap again. The estimates below assume both conditions
   > are met for the row in question; none is met today.

   | Action (each separately gated; `raw_data` only via archive/migration — §C; readers **and** writers must be migrated first — Codex #404/#406-r5) | post-rewrite DB size |
   |---|---|
   | Today | ~1,135 MB |
   | Archive drain (terminal rows): reclaims `raw_data` 223 + `compliance` 170 + `media` ≈ 398 MB | ~737 MB |
   | + bulk-strip `compliance` (live) + `media` + `features` — **only AFTER migrating their render/projection/RESO/CRM/syndication READERS *and* stopping the WRITERS** (idx-sync re-upserts these JSON on every update — `lib/idx/sync.ts:330-335`,`:1161-1166`; `backfillEmptyMedia` re-fetches `media` when it sees `[]`/null — `:696-702`). **Without the writer/refill migration the strip is TRANSIENT — the next sync repopulates it and the cap breaches again** (Codex #404/#406-r5; see §A + probe plan) | ~600 MB |
   | + audit compaction (the 35 MB diagnostic burst) | ~565 MB |
   | + normalize `address`/`agent_info` → structured columns, then strip JSON | ~490 MB |
   | + **migrate archiver AND public render DTO off `raw_data`**, then reclaim the ~35 MB live-row `raw_data` | **~455–490 MiB — STRADDLES the ~477 MiB cap; clears only at the low end, no margin** |
   *(`raw_data` is NOT all-row stripped: ~223 MB reclaims via the archive drain; the ~35 MB on live
   rows needs BOTH the archiver-migration AND the render-DTO-migration prerequisite — §C / §A. Live
   rows are publicly rendered and the public DB DTO derives virtualTourURL/DOM/lease/availability/
   close-date fields from `raw_data`, so nulling it on live rows would blank those cards. The prior
   "~674 MB all-row raw_data strip" row was incorrect.)*

6. **$19 Launch remains the low-maintenance floor** unless the JSON-drop path is COMPLETED AND
   PROVEN. **Bottom line (unchanged across 6 review rounds): NO JSON column is freely strippable
   today.** Reaching Free is not a cleanup job — it requires **(1) a six-front consumer migration**
   (render DTO · CRM · archiver · syndication · search projection · RESO/IDX-feed), **PLUS (2) a
   writer/refill migration** (idx-sync upserts + media backfill stop repopulating the JSON), **PLUS
   (3) measured Neon billed bytes** under 500,000,000 (~477 MiB) AFTER the row-rewrite + GC-past-PITR
   (Step 6) — never an estimate. Even when all three complete, projected size lands **at or just over
   the ~477 MiB cap (tighter than 512) — thin or negative margin** vs ~45 MB/mo organic growth, and
   Free **autosuspends** idle compute (cold starts for visitors). So Free is a schema/data-model
   migration *project*, and **$19 is the safe floor.**

## A. Hard dependencies (why this is not "just drop the columns")
- **PR 5B** (public reader swap off `listings.idx_display_yn`/JSON → projection) — HELD. Until the
  read path no longer touches the JSON, dropping it would break rendering.
- **Step 5** (prove no read path depends on each JSON column) — the gate that must pass per column
  before any drop. The read-only **dependency probe plan** (companion doc
  `2026-06-15-step4-readonly-probe-plan.md`) inventories those paths.
- **WRITER / REFILL prerequisite (Codex #406-r5) — the strip is not durable until the writers stop.**
  idx-sync re-upserts `address`/`features`/`compliance`/`agent_info`/`raw_data` on **every** listing
  update (`lib/idx/sync.ts:330-335`, `:1161-1166`), and `backfillEmptyMedia` re-fetches `media`
  whenever it sees `[]`/null (`:696-702`). So a bulk strip on live rows wins storage only
  *transiently*: the next incremental sync (or media backfill) rewrites the same JSON and the Free
  cap breaches again. **The downgrade gate therefore requires an explicit "no writer/refill path
  repopulates the column" proof — the writer must be migrated to stop writing the JSON (or write a
  reduced shape) BEFORE the reclaim can be credited.** This applies to all five sync-written columns,
  not just `raw_data`, and is a distinct prerequisite on top of the reader migrations.
- Normalizing `address`/`agent_info` is a real data-model change (M1-class), not a delete.
- **Two-migration prerequisite for live-row `raw_data` (Codex #404 + #406):** the ~35 MB of
  `raw_data` on live rows can be reclaimed only after BOTH (a) the data-retention archiver is
  migrated to derive `close_price`/`close_date`/`original_list_price` from structured columns or a
  fresh Trestle re-fetch (not from `raw_data`), AND (b) the public DB render DTO is migrated off
  `raw_data` — `app/api/listings/route.ts:348-356` + `lib/idx/db-to-public-dto.ts:298` derive
  virtualTourURL / previousListPrice / DOM / lease / availability / on-close dates from `raw_data`
  for live (displayable) cards. Live rows are publicly rendered, so nulling `raw_data` before the
  render-DTO migration would silently blank those fields. Until both ship, `raw_data` is reclaimed
  only via the archive drain (terminal rows, which are not publicly rendered) — see §C.
- **Consumer-migration prerequisites for ALL JSON columns (Codex #404/#406, do-not-ignore sweep
  2026-06-16): NO JSON column is freely strippable today.** Each has live consumers that must be
  migrated first — render DTO (`lib/compliance/dto.ts`, `lib/idx/db-to-public-dto.ts`); the public
  `/api/open-houses` payload (address/media/features/agent_info, `app/api/open-houses/route.ts:278-375`);
  the search **projection** (`lib/search/listing-search-projection.ts:193-290` derives searchable
  text, amenity keys, and media flags — used by `lib/search/core.ts:114-121` for **production listing
  search**); **RESO/IDX-feed output** (`lib/compliance/reso-mapper.ts:239-253,281`); CRM PATCH
  (`app/api/crm/listings/[id]/route.ts`); **syndication** (`lib/syndication/eligibility.ts` reads
  `compliance` + `agent_info`). **The companion probe plan is the authority for the SAFE TO DROP
  gate** (`2026-06-15-step4-readonly-probe-plan.md`); do NOT approve a strip from this summary alone.
  Its full test — mirrored here verbatim so the two docs cannot drift — is that a column is SAFE TO
  DROP only when **ALL FOUR** hold:
  1. **All read consumers cleared** through the full Step-5 repo-wide **8-probe** scan (Prisma
     `select`/`include` · direct property reads `listing.<col>`/`dbListing.<col>`/`l.<col>` ·
     destructuring · raw SQL `SELECT`s · mapper/builder/parser fns · writer/upsert paths ·
     refill/backfill paths · full-record-fetch-then-helper). A single `<col>: true` grep is NOT the
     gate.
  2. **Scope = `app lib scripts public/crm`** (NOT just `app`/`lib`). Real readers live outside
     `app`/`lib`: `scripts/backfill-listing-search-projection.ts`,
     `public/crm/SALE-FORM-REDESIGN.html`, and raw SQL in `app/api/buildings/search/route.ts:536-556`.
  3. **All writer / upsert / refill / backfill paths migrated, disabled, or proven unable to
     repopulate** the JSON (`lib/idx/sync.ts:330-335`, `:1161-1166`, `:696-702`) — otherwise the
     strip is **transient** and the next sync/backfill re-breaches the Free cap.
  4. **Measured Neon billed bytes** after the row-rewrite + GC-past-PITR (Step 6) confirm the
     reduction — **never a projection**; the estimates in this plan do not gate a downgrade.
  **The inline consumer lists here are illustrative, not exhaustive** (6 review rounds kept finding
  omitted consumers); every per-column verdict re-derives from that live 8-probe scan + writer check
  + measured bytes in the probe plan, NOT from this prose or any single grep.

  **Per-column HELD status (none droppable today):**

  | Column | HELD until — migrate these consumers first |
  |---|---|
  | `raw_data` | **render** (public DB DTO derives virtualTourURL / previousListPrice / DOM / lease / availability / on-close dates from `raw_data` — `app/api/listings/route.ts:348-356`, `lib/idx/db-to-public-dto.ts:298`) **+ archive** (close terms) **+ CRM PATCH**; live-row reclaim needs render-DTO + archiver migration |
  | `address` | render + CRM + archive + **projection/search** (street parts + city → projection search text, `lib/search/listing-search-projection.ts:195-202,305`) — NORMALIZE to structured columns AND re-derive the projection builder from those structured fields first |
  | `agent_info` | render + CRM + archive + **syndication** — normalize + syndication migration |
  | `compliance` | **render** (detail-page `publicRemarks` falls back to `compliance.PublicRemarks` — `app/listing/[...slug]/page.tsx:545,621`) **+ syndication** (`compliance.syndication`/`mallan_control_verification`/`seller_advertising_authorization`/`media_rights`) — HELD until render migration AND syndication migration |
  | `features` | **render + projection/search + RESO + CRM** — HELD until the projection builder + RESO mapper are migrated/re-derived |
  | `media` | **render + projection/search + RESO + CRM** media routes — HELD until projection + RESO migration |

## B. The archive eligibility bug (now scoped as a STANDALONE correction)
Root cause (code-proven, `data-retention/route.ts:162-168`): the T+180 archive filters
`status_changed_at < now-180d`, and **a NULL `status_changed_at` silently fails `{ lt: … }`** →
bulk-synced terminal rows are invisible forever (only 34 of ~91,536 ever archived). This is a
**latent storage leak worth fixing on its own merits**, independent of the $0 goal. Scoped
separately in `docs/audits/corrections/scope-archive-eligibility-bug-2026-06-15.md` (code + RED
test; preserves the batch cap; **the broadened predicate ships behind a default-OFF flag so the
nightly `data-retention` cron does not auto-drain on merge** — Codex #404; the drain begins only on
Maya's flag flip). Archive remains a *secondary* lever — it helps terminal rows but cannot reach
Free alone (§5.4).

## C. Reclaim mechanism (Neon, no VACUUM FULL) — CORRECTED per Codex #404

**`DROP COLUMN` does NOT reclaim storage.** In Postgres it is a **catalog-only** change — it marks
the column dropped but leaves the existing values in the heap/TOAST pages untouched, so the bytes
(and the billed/logical size) stay until the rows are **physically rewritten**. This matches the
audit's §5/R4 note ("autovacuum reclaims for reuse but never shrinks the file; only a rewrite
does"). **Relying on `DROP COLUMN` alone would leave billed storage near current size — a downgrade
approved on the §5 waterfall would then breach the cap.** The waterfall sizes are *post-rewrite*
targets, not `DROP COLUMN` outputs.

**The bytes are reclaimed only by a ROW REWRITE that empties the JSON values, then GC past the PITR
window:**
1. **Batch `UPDATE` that EMPTIES each column to a VALID value (bounded batches).** Per
   `prisma/schema.prisma:476-481`, **only `raw_data` is nullable (`Json?`)**; `address`, `features`,
   `media`, `compliance`, `agent_info` are **NOT NULL** with JSON defaults, so `SET … = NULL` would
   violate the constraint (Codex #404). Use the schema-default empty values, exactly as the
   data-retention archiver already does (`media: []`, `compliance: {}`):
   `SET raw_data = NULL, compliance = '{}'::jsonb, media = '[]'::jsonb, features = '{}'::jsonb`
   (and `agent_info`/`address` → `'{}'` only AFTER normalization — see §A). An empty `{}`/`[]` is a
   few bytes vs the hundreds of MB it replaces, so this reclaims the column just as effectively as
   NULL. (Alternative: a nullable migration first — extra schema churn for no storage benefit; the
   empty-JSON rewrite is preferred.) This rewrites each row to a smaller live tuple; the old tuple
   becomes dead. (Same mechanism the data-retention archive already uses for terminal rows.)

   **ORDERING CONSTRAINT — archive terminal rows BEFORE nulling `raw_data` (Codex #404, blocking).**
   The data-retention archiver derives **`close_price`, `close_date`, `original_list_price` ONLY
   from `raw_data`** when it upserts `listings_archive` (`data-retention/route.ts:225-228`). If the
   bulk `raw_data = NULL` strip runs on a terminal row that has NOT yet been archived, that row's
   sale terms are lost forever from the NY-DOS 6-year archive record. Since the archive-bug fix
   leaves a ~91K-row backlog draining at the 500/run cap, the strip MUST NOT null `raw_data` on any
   row a future archive could need. **`raw_data` is NOT bulk-strippable in this program at all
   (Codex #404, blocking):**
   - **Terminal-but-unarchived rows:** their sale terms are only in `raw_data` until the archiver
     extracts them. Excluded.
   - **Non-terminal (live) rows are ALSO unsafe — two reasons.** (i) **Render NOW (Codex #406):** live
     rows are the publicly displayed listings, and the public DB DTO derives virtualTourURL /
     previousListPrice / DOM / lease / availability / on-close dates from `raw_data`
     (`app/api/listings/route.ts:348-356`, `lib/idx/db-to-public-dto.ts:298`) — nulling it blanks
     those card/detail fields immediately. (ii) **Future archive:** every live listing is a *future*
     terminal row; when it later closes, the same archiver (`route.ts:225-228`) pulls
     `close_price`/`close_date`/`original_list_price` from `raw_data`. *Verified:* idx-sync DOES rewrite `raw_data` on every
     update (`lib/idx/sync.ts:335`,`:1166`), so a nulled `raw_data` would usually re-fill at the
     close transition — **but relying on that couples `raw_data` safety to idx-sync incremental
     reliability, which has a documented gap history (RC1/RC5/C6 were "idx-sync missed records").**
     A missed close → permanently-lost sale terms. Not worth the ~35 MB of live-row `raw_data`.
   - **Therefore `raw_data` (258 MB) is reclaimed ONLY via the archive path** — the archiver
     extracts close terms then nulls `raw_data` atomically (`route.ts:245-253`) as the T+180 backlog
     drains (the ~223 MB on terminal rows). The remaining ~35 MB on live rows is reclaimable **only
     after TWO PREREQUISITES: (a) migrate the archiver's close-field derivation off `raw_data` AND
     (b) migrate the public render DTO off `raw_data`** (both to structured columns or a fresh
     Trestle re-fetch). Until both ship, do not bulk-null `raw_data`.
   - `compliance` / `media` / `features` carry **no** archive-derived fields, so the bulk row-rewrite
     strip applies to them (after the CRM-dependency + no-render proofs); `raw_data` does not.
   **Sequence:** (1) fix archive eligibility (flag-gated), (2) **drain the T+180 backlog** (sale
   terms land in `listings_archive`, reclaiming raw_data on terminal rows), (3) bulk-strip
   `compliance`/`media`/`features` (NOT `raw_data`) on the proven-safe rows. Step 6's measured proof
   must confirm the backlog is drained before the storage targets are credited.
2. **Garbage collection:** on Neon's log-structured storage the old page versions drop out of the
   billed synthetic size only after they **age past the PITR window** (6 h Free / 7 d Launch) +
   autovacuum. So reclaim **lags** the UPDATE by the retention window — plan for it.
3. **`DROP COLUMN` last, as catalog cleanup ONLY** — after the values are nulled and the schema no
   longer needs the column. It frees no additional bytes by itself.
4. **If a full table rewrite is ever needed** (e.g. to compact remaining bloat), use an **online
   copy-swap or `pg_repack`-style** path — **never `VACUUM FULL`** (it blocks all traffic on Neon).

**MEASURED-PROOF GATE (Step 6, mandatory):** the Free-tier go/no-go must read the **actual Neon
billed synthetic size from the console/API AFTER the row-rewrite + PITR-window elapse** — never a
projected `DROP COLUMN` size. No downgrade is approved on a projection. **Projected savings are not
creditable for downgrade until the actual Neon billed synthetic size is measured in BYTES after the
rewrite / PITR / autovacuum; if compaction is required to realize the truncation, it must be an
online copy-swap / `pg_repack`-style path, never `VACUUM FULL`** (Codex #404 — standard VACUUM only
makes space reusable unless free pages are at the physical end of the file).

## D. Recommended sequence (Maya's bottom line, adopted)
1. **Fix the archive bug** (standalone correction — closes the latent leak; does NOT reach Free).
2. **Document the Free path** (this doc).
3. **Run read-only dependency/savings probes** (companion probe plan — confirms per-column savings
   + which columns are safe to drop vs must be normalized).
4. **Do NOT approve JSON drops or the Neon downgrade yet.** Those wait on PR 5B + Step 5 proofs +
   explicit Maya approval. The first authoritative number to confirm is the **actual Neon billed
   synthetic size** (Neon console → project → Usage/Billing → Storage) vs the ~1,135 MB
   `pg_database_size` proxy.

---
*Plan only. No execution. Free is a schema-cleanup project gated on PR 5B + Step 5, not a quick
job. $19 Launch is the safe floor until that path is completed and proven.*
