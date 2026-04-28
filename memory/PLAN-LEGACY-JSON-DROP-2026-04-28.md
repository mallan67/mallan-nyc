# Legacy JSON Column Drop Plan — Listing Model

> **Status:** NOT_STARTED · **Created:** 2026-04-28 · **Owner:** Maya Allan
> **Reference:** This plan exists because the master refactor plan PR 10 description named all six legacy JSON columns on `Listing` as "duplicated data after PR 5 readers are migrated," but what shipped as PR #75/#76 was the `raw_data` slim writer + backfill only. The other five JSON columns are still being written and read alongside the typed columns from PR 5.
>
> Pre-flight discipline before any PR in this plan: see `NEON.md` §5. One column per PR. Nullable first. Manual prod migration before code merge. No deviation.

---

## Why this exists

`prisma/schema.prisma:471–476` shows `Listing` still carries:

```prisma
address    Json  @default("{}")
features   Json  @default("{}")
media      Json  @default("[]")
compliance Json  @default("{}")
agent_info Json  @default("{}")
raw_data   Json?
```

`raw_data` was already addressed by PR #75 (slim writer caps new rows at ~5 KB instead of ~14 KB) plus the production backfill. The other five columns are the open work.

### Storage impact

Live snapshot 2026-04-28 17:51 ET: total DB 218 MB / listings table 195 MB / 19,630 rows.

Average row size ≈ 195 MB / 19,630 ≈ 10 KB. The five remaining JSON columns contribute the bulk of that. Once typed columns from PR 5 are the only readers, dropping the JSON columns + a `VACUUM FULL` should bring the listings table to roughly 80 MB (estimated from per-column size analysis in `scripts/neon-storage-audit.ts` patterns; verify with a fresh deep audit before each drop).

**Recoverable storage: approximately 115 MB** — bigger than the entire shed PR 75 delivered. The DB is at 43% of the 500 MB free cap today; this drops it back to ~20%, multiplying runway from ~9 months to multi-year.

---

## Drop order — easiest first (smallest blast radius)

Reader counts (rough, from `app/` + `lib/` greps 2026-04-28; treat as guidance, validate per-PR):

| # | Column | Reader count (est.) | Typed-column replacement(s) already on `Listing` | Risk |
|---|---|---|---|---|
| 1 | `agent_info` | ~20 hits | `list_agent_full_name`, `list_office_name` | LOW |
| 2 | `compliance` | ~28 hits | (compliance flags are scattered — see Phase 1) | LOW–MED |
| 3 | `features` | ~44 hits | (features map to bedroom/bathroom/sqft/amenities columns — see Phase 2) | MED |
| 4 | `address` | ~276 hits (many false-positive) | `street_address`, `city`, `state`, `postal_code`, `latitude`, `longitude` | HIGH |
| 5 | `media` | spread across 15+ files | `primary_photo_url`, `photo_count`, plus `ListingMedia` relational table | HIGH (already partially migrated by PR 2/3/4) |

**Order rationale:** Each PR teaches the team how the next column moves. Start with `agent_info` (few readers, single concept). Use that PR's pattern as the template for the harder ones. End with `media` because PR 2/3/4 already created a relational target — auditing whether all readers have swapped is most of the work.

---

## Per-column phase template (apply to each of the five)

Every column follows the same 4-phase pattern. **Each phase = one PR.** No shortcuts.

### Phase A — Audit + freeze writes

1. Run a full grep for the column across `app/`, `lib/`, `scripts/` (not `__tests__`, not `node_modules`). Capture every reader and writer.
2. For each reader, classify:
   - **Already reads typed column** → no migration needed
   - **Reads JSON only** → needs migration in Phase B
   - **Reads both with fallback** → needs simplification in Phase B
3. For each writer, confirm `lib/idx/sync.ts` is dual-writing JSON + typed column. If not, fix dual-write FIRST and let one sync cycle (`*/12 *`) flow before continuing.
4. Output of Phase A: a checklist file at `memory/JSON-DROP-AUDIT-<column>.md` with file:line of every reader and its classification.
5. Compliance gate: `npm run ucba:audit` 0 regressions.

### Phase B — Migrate readers

1. Migrate readers identified in Phase A's audit, **one logical group at a time** (e.g. all CRM routes in one PR, all public DTO routes in another). Within each PR:
   - Swap reader from JSON to typed column.
   - Add a `// TODO(json-drop): remove fallback` comment if a fallback path remains for safety.
   - Add or update a unit/integration test that proves the typed-column read returns the same shape.
2. Run `npm run rls:validate`, `npm run crm:test`, `npm run idx:validate` after each reader swap.
3. Production verification: hit the affected route, observe response, confirm it's identical to pre-PR.

### Phase C — Stop the JSON write

1. In `lib/idx/sync.ts` (and any other writer found in Phase A), remove the JSON column from the upsert payload. Typed columns remain.
2. Wait ≥ 24 hours of production sync to confirm:
   - No errors in `npm run ops:health` last-run line.
   - No 500s in routes that read this data.
3. The JSON column is now stale on existing rows but no new writes touch it. Old rows still carry the data — that's fine for one cycle.

### Phase D — Drop the column

1. Manual prod migration (NEON.md §5):
   ```sql
   ALTER TABLE "listings" DROP COLUMN "<col_name>";
   VACUUM (ANALYZE) "listings";
   ```
2. PR removes the column from `prisma/schema.prisma`. Code merges only after migration applied to prod.
3. Run `npm run ops:health` immediately. Capture the new listings-table MB.
4. Capture the win in `compliance/UPDATES.md` with before/after numbers.

---

## Per-column specifics

### 1. `agent_info` (start here)

- **Typed replacements:** `list_agent_full_name`, `list_office_name` (already on `Listing` from PR 5).
- **Known readers:** `lib/compliance/dto.ts` (portal DTO masking), `lib/idx/db-to-public-dto.ts`, agent listing routes.
- **Watch for:** REBNY agent-PII masking rules — the `compliance/dto.ts` reader specifically scrubs agent contact info for buyer/tenant portals. Tests at `lib/compliance/__tests__/` must keep passing across the swap.
- **Compliance skill required:** Yes — touches portal DTO. Invoke `rebny-compliance` before commit.

### 2. `compliance`

- **Typed replacements:** Several boolean columns from PR 5 + Workstream C — `auction_yn`, `idx_eligible`, `vow_eligible`, distribution gate flags, etc.
- **Known readers:** `lib/idx/sync.ts`, public-DTO builders, RLS enforcement gate (`lib/compliance/rls-enforcement.ts`).
- **Watch for:** `lib/compliance/rls-enforcement.ts` is the fail-closed gate from master-plan PR 1. Any reader change here is a compliance-critical change. Run `npm run ucba:audit` before AND after; require 0 regressions.
- **Compliance skill required:** Yes.

### 3. `features`

- **Typed replacements:** Existing scalar columns (`bedrooms`, `bathrooms_full`, `bathrooms_half`, `living_area_sqft`, etc.) plus the search-projection columns from PR 5.
- **Known readers:** Listing display components, search result builders, comparable-property queries.
- **Watch for:** Any reader that does free-form key access on `features` JSON (`features['some_key']`). Those need a deliberate decision: promote to typed column, accept loss, or move to a side table.
- **Compliance skill required:** No (no compliance-affecting fields in `features`).

### 4. `address`

- **Typed replacements:** `street_address`, `unit_number`, `city`, `state`, `postal_code`, `latitude`, `longitude` (latitude/longitude added by PR 5; geocoded via `lib/geo/geocode.ts` since Trestle does NOT provide coords).
- **Known readers:** Highest count. Listing pages, search, geocoder cache, transit lookups, building profiles, CRM, all portals.
- **Watch for:** Multi-borough address parsing edge cases. If the JSON column carried a normalized form that the typed columns lack, build the normalizer before swapping readers.
- **Compliance skill required:** Yes — `InternetAddressDisplayYN` distribution gate must continue to mask address for opted-out listings on public surfaces.

### 5. `media` (last)

- **Typed replacements:** `primary_photo_url`, `primary_photo_r2_key`, `photo_count` (on `Listing` from PR 2), plus the relational `ListingMedia` table (PR 2/3/4).
- **Known readers:** 15+ files identified in 2026-04-28 grep. Some readers already use `ListingMedia`; others still read `media` JSON. Phase A audit will produce the swap list.
- **Watch for:** R2 sync state. `MediaSyncState` from PR 2 tracks per-listing photo refresh; do not drop the `media` JSON column until R2 has been authoritative for ≥30 days with `npm run ops:r2-health` clean.
- **Compliance skill required:** No (R2 mirror; REBNY rules are about display, not storage).

---

## Order of execution

1. PR `refactor/12-drop-agent-info-json` (Phases A→D) — 4 PRs total.
2. PR `refactor/13-drop-compliance-json` — 4 PRs.
3. PR `refactor/14-drop-features-json` — 4 PRs.
4. PR `refactor/15-drop-address-json` — 4 PRs (likely 5+ if address parsing needs a normalizer).
5. PR `refactor/16-drop-media-json` — 4 PRs (gated on 30 days of R2 health).

Total: ~20 PRs. Spread over **2–6 weeks** depending on prod-stability windows between phases.

The plan is intentionally slow. Each phase is a recoverable checkpoint. Skipping phases is how you land back on a 2026-04-19-style silent-drift incident.

---

## Pre-flight before starting (always)

```sh
npm run ops:health                # confirm headroom
npm run ucba:audit                # 0 regressions
npm run rls:validate              # 0 errors
npm run crm:test                  # 0 failures
git fetch origin main             # current main
git log -1 origin/main            # match what's deployed at mallan.nyc
```

If anything is red, fix that first. Do not stack JSON-drop work on a broken main.

---

## Completion criteria

- All five JSON columns dropped from `Listing`.
- `prisma/schema.prisma` `Listing` model has no `Json` columns except `raw_data` (which stays per the slim-writer architecture from PR 75).
- Listings table size confirmed by `npm run ops:health` to be ≤ 100 MB.
- `compliance/UPDATES.md` has a final entry capturing total recovered storage.
- This file gets a closing block: `**Status: COMPLETE — <commit-sha> · <date>** — replaces this plan with an archival pointer.`

---

## Open questions for the next session

1. **Verify reader counts before starting.** The 2026-04-28 grep counts are rough; rerun a clean grep (excluding tests + scripts) per column and capture in the Phase A audit file.
2. **Decide whether to bundle Phase B PRs or split them.** For `agent_info` (few readers), one PR for all readers is fine. For `address` (many readers), splitting by surface (CRM / public / portal) will be safer.
3. **Confirm typed-column coverage on existing rows.** Running a query like `SELECT count(*) FROM listings WHERE list_agent_full_name IS NULL AND agent_info != '{}'::jsonb` per column tells you whether dual-write actually populated all rows. If not, run a backfill before Phase C.
4. **Decide whether to do a `VACUUM FULL` after the last drop.** It reclaims disk but holds an exclusive lock on the table. On Neon free tier with ~20K rows, the lock window is short (single-digit seconds). Worth it for the storage win — but plan it during low-traffic hours (3–5 AM ET per NEON.md §4).

End of plan. Resume from "Order of execution" once the pre-flight is green.
