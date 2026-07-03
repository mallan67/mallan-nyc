# Archive eligibility clock fix — concrete flag-gated PR plan (PLAN ONLY)

> **PLAN ONLY — NO IMPLEMENTATION.** No code, schema, migration, SQL writes, backfill run, flag
> change, archive drain, reclaim, downgrade, env change, or new Neon branch in this document. This
> scopes future, separately-gated PRs. Date 2026-06-24 · #415.
> Builds on: `2026-06-24-archive-eligibility-clock-fix-plan.md` (diagnosis, DB-proven) +
> `2026-06-24-p2-archive-drain-plan.md` (flag drains ≈0 today) + the #404 corrections.

## Goal
Give terminal listings a **stable age clock** so they can mature past 180 days without being
re-stamped by IDX sync. Replace the contaminated `status_changed_at`/`modification_timestamp`
clock (DB-proven: `status_changed_at` ≈ `modification_timestamp` for 99.1% of terminals) with a
typed, indexed `terminal_since`, derived once from the sale/off-market date. Everything stays
**inert until Maya flips the flag** — and the flag now points at a clock that actually works.

## Recommended decomposition — TWO inert PRs (safe parts)
| PR | What it does | Inert because |
|---|---|---|
| **PR-1 — clock plumbing** | schema `terminal_since` + migration · derive helper · writer rule (set/clear on transition) · backfill **script (dry-run default)** · tests | New column only **starts** populating on *new* transitions; backfill is dry-run; the archive predicate is untouched. Zero prod behavior change. |
| **PR-2 — predicate repoint** | repoint the flag-ON archive eligibility to `terminal_since < cutoff` + select + tests | Flag-OFF path unchanged → nightly cron behaves exactly as today until Maya flips `ARCHIVE_T180_BACKLOG_ENABLED`. |
Splitting lets the writer rule + backfill bake and be verified before the drain predicate ever
depends on `terminal_since`. (Could be one PR — both halves are inert — but the split minimizes
blast radius and matches "scope into safe parts.")

---

## 1. Schema proposal

**Add to `model Listing` (`prisma/schema.prisma`, near `status_changed_at` ~line 550):**
```prisma
  terminal_since            DateTime? @map("terminal_since")
  // ... existing fields ...
  @@index([terminal_since], map: "listings_terminal_since_idx")
```
- **Nullable** (`DateTime?`): NULL = "not terminal, or terminal-age unknown" → **fail-safe** (a NULL
  never matures into eligibility). No NOT NULL, no default, no backfill-in-DDL.
- **Requires a Prisma migration? YES** — any `schema.prisma` change must ship a hand-written
  migration (NEON.md §1; `validate-migration-discipline.js` Check 1 FAILs otherwise).
- **Index needed for archive eligibility? YES** — the nightly predicate becomes
  `terminal_since < cutoff` over ~92K terminal rows; without `listings_terminal_since_idx` that's a
  seq scan each run. The btree index makes the range scan + `take: 500` cheap.
- **Migration-discipline classification:** a **nullable `ADD COLUMN`** is metadata-only in Postgres
  (instant, no table rewrite, safe on a big table) and `CREATE INDEX` is additive — **neither is in
  `DESTRUCTIVE_PATTERNS`**, so **no `@allow-destructive` annotation is required** and the validator
  passes.
- **Prod-apply = P1 Option B (precedent: `20260624120000_p1_search_index_pack`).** The committed
  `migration.sql` is plain-and-deployable on fresh/small DBs (`ADD COLUMN` + plain `CREATE INDEX`),
  but on **production** the index is created **manually, one statement, `CREATE INDEX CONCURRENTLY`**
  via psql (NEON.md §4 forbids a plain `CREATE INDEX` on a >10K-row table), then recorded with
  `prisma migrate resolve --applied`. The `ADD COLUMN` itself is instant and can run via the normal
  path. **Never `migrate deploy` on prod for the index; never `db execute --file`** (per the P1
  Codex findings). The migration header carries this runbook verbatim.

## 2. Writer rule (`lib/listings/terminal-since.ts` — NEW shared helper)
`deriveTerminalSince(input): Date | null` — single source of truth, reused by every writer:
- **Source priority (stable dates):** `raw_data.CloseDate` → `features.CloseDate` (import-closed
  rows) → `raw_data.OffMarketDate` → `raw_data.ExpirationDate` **only for Expired** status.
- **Sanity window (reject impossible dates):** accept only `2000-01-01 ≤ d ≤ now()+1d`; otherwise
  return null. (DB-proven need: a bogus `CloseDate` of year **2814** exists; a future/ancient date
  must never count as "old" — null is fail-safe.)
- Returns `null` when no valid stable date is found.

**Set/clear rules (applied in each writer below):**
1. **Set** `terminal_since` only on a **non-terminal → terminal** transition
   (`!TERMINAL_STATUSES.has(prev) && TERMINAL_STATUSES.has(next)`, using
   `normalizeStandardStatus` + `TERMINAL_STATUSES` from `lib/idx/trestle-mapper.ts:618`). Value =
   `deriveTerminalSince(row) ?? <transition wall-clock>` — the wall-clock fallback is honest going
   forward (it's the moment we *observed* terminal) and, crucially, is **not** re-bumped afterwards.
2. **Do NOT update** on a terminal → same-terminal re-sync (idempotent): if already terminal and
   `terminal_since` is set, leave it. (This is the whole point — sync re-emits must not move it.)
3. **Clear** (`terminal_since = null`) on a **terminal → non-terminal** transition (reinstatement to
   Active/ComingSoon/etc.) so a re-listed property doesn't carry a stale terminal age.

**Writers to touch (each gets the same rule via the helper):**
| File | Transition site |
|---|---|
| `lib/idx/sync.ts` | the status-transition block (`:269-281`, update) + create-branch (`:307-313`) |
| `app/api/crm/listings/[id]/status/route.ts` | the `prisma.listing.update` at `:231-243` |
| `app/api/cron/feed-reconcile/route.ts` | ghost→Withdrawn (`:486-492`) + create-branch (`:382-387`) |
| `scripts/import-closed-from-trestle.ts` | the `prisma.listing.create` (set from `features.CloseDate`) |
| `app/api/cron/listing-expiration/route.ts` | wherever it flips a listing to a terminal status |

## 3. Backfill plan (`scripts/backfill-terminal-since.ts` — NEW, dry-run first)
- **Dry-run is the default** (no `--execute`). Host-guarded to `ep-cold-waterfall-adno3ao2`,
  read-only txn for the dry-run. Bounded batches; idempotent (`WHERE terminal_since IS NULL AND
  status IN TERMINAL AND <valid stable date>`).
- **Dry-run reports (no write):** rows that *would* get `terminal_since`, the age distribution, and
  the JSON MB reachable once the clock is corrected.
- **DB-measured projection (from the diagnostic already run, read-only):**
  - Rows that would receive `terminal_since`: **~89,659** (have a valid stable date; of these
    **82,676** are already >180d old).
  - Rows left NULL (no/invalid stable date): **~3,129** + any sanity-rejected → stay fail-safe
    (not eligible) — documented, not fabricated.
  - **JSON reachable after the corrected clock: ~333 MB** (raw_data+compliance+media on the 82,676
    eligible). (`features`/`agent_info`/`address` are NOT stripped by the archive action — separate.)
- **No write until separately approved** (Gate 2). Execute mode = bounded `UPDATE … SET
  terminal_since = …` batches, derived through the same `deriveTerminalSince` helper (parity with the
  writer), with a re-measure after.

## 4. Archive predicate repoint (`app/api/cron/data-retention/route.ts:177-185`)
- **Flag-ON** (`ARCHIVE_T180_BACKLOG_ENABLED === "true"`): `eligibilityWhere = { terminal_since: { lt: oneEightyDayCutoff } }`.
- **Flag-OFF (default):** unchanged — keep the current narrow `{ status_changed_at: { lt: cutoff } }`
  so **merge stays 100% inert** (nightly cron identical to today).
- Add `terminal_since: true` to the `findMany` select (`:193-216`).
- This **replaces the #404 `COALESCE(status_changed_at, modification_timestamp)`** flag-ON branch,
  which is structurally wrong (both operands are moving clocks — DB-proven). Keep `T180_BATCH_CAP =
  500` (or a deliberate, separately-approved bounded raise — at 500/run, 82,676 rows ≈ ~5.5 months).
- **Ordering invariant (must be in the PR body + runbook):** the backfill (Gate 2) must complete
  **before** the flag is flipped (Gate 3) — otherwise `terminal_since` is NULL everywhere and
  flag-ON drains 0 again.

## 5. Read-safety prerequisites (verify BEFORE any drain — Gate 3 blockers)
- **Public surfaces:** search / Featured / listing detail / agent pages / open-houses / alerts all
  exclude terminal statuses (active-status gate, per the PR-5B parity report) → no public read of
  >180d terminal JSON. ✅ (re-confirm at drain time.)
- **Closed comps / CMA:** `lib/idx/db-to-public-dto.ts` + `scripts/comps/by-property.ts` +
  `lib/comps/*` read `raw_data.ClosePrice` — **verify they fall back to the `listings_archive`
  summary (`close_price`/`close_date`/`list_price`/beds/baths/address/agent) + `features.ClosePrice/
  CloseDate` for >180d terminals**, and that the **180-day window protects recent comps** (6,949
  terminals are <180d and are NOT stripped).
- **Agent past-deals / listing history:** confirm the loaders use the **`PastDeal`** model (separate,
  has its own `close_date`) + archive summary, **not** live terminal `raw_data`.
- **Compliance:** NY DOS 6-yr recordkeeping satisfied by the archive summary; terminal rows already
  non-displayable.
- **Output of this prereq = a short read-only audit doc** (its own report) gating Gate 3.

## 6. Tests
**Unit — `lib/listings/__tests__/terminal-since.test.ts` (NEW):**
- `deriveTerminalSince` prefers CloseDate → features.CloseDate → OffMarketDate → ExpirationDate(Expired only).
- **Sanity window:** year-2814 (future) → null; year-1990 (ancient) → null; valid 2023 date → that date.
**Writer — `tests/runtime/archive-terminal-since-clock.test.ts` (NEW):**
- non-terminal → terminal **sets** `terminal_since` (from stable date; wall-clock fallback when absent).
- terminal → same-terminal **re-sync does NOT bump** `terminal_since` (idempotent).
- terminal → Active **clears/resets** `terminal_since` to null.
- invalid future/ancient source date → falls back safely (wall-clock on transition; null on backfill), never a 2814 value.
**Eligibility — extend `tests/runtime/data-retention-archive-eligibility.test.ts`:**
- flag-ON: archive eligibility uses `terminal_since` (a row with old `terminal_since` but **recent
  `status_changed_at`/`modification_timestamp`** IS selected — proving the bad clock no longer
  controls eligibility; RED on `main`, GREEN after).
- a row with `terminal_since` within 180d stays excluded; an already-`archived` row stays skipped; batch cap 500 preserved.
- flag-OFF: behavior identical to today (NULL-terminal-since row not selected via terminal_since path).
**Backfill — dry-run test:** the script in dry-run **reports eligible rows/MB and performs zero writes** (assert no UPDATE issued).

## Proposed file list
| # | File | New? | Change |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | edit | add `terminal_since` + `@@index` to `Listing` |
| 2 | `prisma/migrations/<ts>_add_terminal_since/migration.sql` | NEW | `ADD COLUMN` + `CREATE INDEX`; Option-B prod runbook header |
| 3 | `lib/listings/terminal-since.ts` | NEW | `deriveTerminalSince` + sanity window + set/clear helpers |
| 4 | `lib/listings/__tests__/terminal-since.test.ts` | NEW | unit tests |
| 5 | `lib/idx/sync.ts` | edit | set/clear `terminal_since` in transition + create branches |
| 6 | `app/api/crm/listings/[id]/status/route.ts` | edit | set/clear on CRM transition |
| 7 | `app/api/cron/feed-reconcile/route.ts` | edit | set on ghost→Withdrawn + create |
| 8 | `scripts/import-closed-from-trestle.ts` | edit | set from `features.CloseDate` on create |
| 9 | `app/api/cron/listing-expiration/route.ts` | edit | set on terminal flip |
| 10 | `app/api/cron/data-retention/route.ts` | edit | repoint flag-ON predicate + select (PR-2) |
| 11 | `scripts/backfill-terminal-since.ts` | NEW | dry-run-first backfill (host-guarded) |
| 12 | `tests/runtime/data-retention-archive-eligibility.test.ts` | edit | flag-ON terminal_since eligibility |
| 13 | `tests/runtime/archive-terminal-since-clock.test.ts` | NEW | writer + eligibility tests |
| 14 | `docs/audits/corrections/archive-eligibility-clock-fix-trace.md` | NEW | trace record (blast radius, RED→GREEN, gates) |

*(Files 1–9, 11, 13–14 → PR-1; files 10, 12 → PR-2.)*

## Proposed migration SQL (illustrative — not applied)
```sql
-- @rollout: ADD COLUMN is instant (nullable, no rewrite). On PRODUCTION the index is built
-- MANUALLY, one statement, CONCURRENTLY (NEON.md §4 — never a plain CREATE INDEX on >10K rows),
-- then recorded with `prisma migrate resolve --applied`. Do NOT `migrate deploy` on prod for the
-- index; do NOT `db execute --file`. Verify pg_index.indisvalid AND indisready after.
-- Production verification note: after CONCURRENTLY build, confirm indisvalid=t/indisready=t, then
-- EXPLAIN the archive predicate uses listings_terminal_since_idx. Rollback trigger: invalid index →
-- drop the invalid index concurrently and rebuild.
ALTER TABLE "listings" ADD COLUMN "terminal_since" TIMESTAMP(3);
CREATE INDEX "listings_terminal_since_idx" ON "listings" ("terminal_since");
```
*(Additive: passes `validate-migration-discipline.js` with no `@allow-destructive`.)*

## Risk table
| Risk | Severity | Mitigation |
|---|---|---|
| Migration on a 92K-row table | Low | Nullable `ADD COLUMN` is metadata-only (instant); index via CONCURRENTLY (Option B), off the deploy path |
| Plain `CREATE INDEX` trips NEON.md §4 on prod | Med | Committed SQL is for fresh/small DBs; prod uses manual CONCURRENTLY + `migrate resolve` (P1 precedent) |
| Writer regression (terminal guard) | Med | Single shared `deriveTerminalSince` helper; reuse `normalizeStandardStatus`+`TERMINAL_STATUSES`; writer tests for set/no-bump/clear |
| Backfill mis-derivation / bad dates | Med | Dry-run first; sanity window rejects 2814/ancient; NULL left (not fabricated); re-measure after execute |
| Predicate flip drains unexpectedly | High→Low | Flag default-OFF; flag-OFF path unchanged; **backfill-before-flip ordering invariant**; 500/run cap |
| Comps/CMA/past-deals read stripped JSON | High→Low | Gate-3 read-safety audit; 180d window protects recent comps; fallback to archive summary + features |
| Reclaim ≠ shrink (dead tuples) | Med | Out of scope here; PITR-elapse + autovacuum, then `pg_repack` (never `VACUUM FULL`) — separate gated step |
| Does not reach Neon Free | Info | ~333 MB → DB ~800 MB, still over ~477 MiB cap; this is the archive lever done right, not the Free path; $19 floor stays |

## Exact future approval gates (each separate, explicit Maya approval)
1. **Gate 1 — schema migration** (HELD: schema/migration): approve `terminal_since` column + index + the Option-B prod apply.
2. **Gate 2 — backfill EXECUTE** (HELD: SQL writes): approve running `backfill-terminal-since.ts --execute` after the dry-run report is reviewed.
3. **Gate 3 — read-safety sign-off** (blocker): approve the comps/CMA/past-deals read-safety audit result + take a **pre-drain Neon snapshot**.
4. **Gate 4 — flip `ARCHIVE_T180_BACKLOG_ENABLED=true`** (HELD: env change): the drain gate — only AFTER Gates 1–3, and only with backfill complete.
5. **Gate 5 — drain-cap change** (optional): approve any raise above 500/run.
6. **Gate 6 — reclaim** (later): approve `pg_repack`/copy-swap + the Neon billed-bytes measurement; never `VACUUM FULL`.

## Sequencing
PR-1 (merge, inert) → PR-2 (merge, inert) → Gate 1 apply migration → Gate 2 backfill dry-run report → backfill execute → Gate 3 read-safety + snapshot → Gate 4 flip flag (drain begins, capped) → re-measure → Gate 6 reclaim. **No step runs without its gate.**

## Hard limits honored
Plan only. No code, schema, migration, SQL writes, backfill run, flag change, archive drain, reclaim, downgrade, env change, new Neon branch, or destructive change. Read-only anchoring reads only.
