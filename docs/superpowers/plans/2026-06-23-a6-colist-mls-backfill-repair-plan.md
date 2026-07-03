# A6 co-list MLS backfill repair — REPORT-ONLY plan (DO NOT RUN)

> ## 🟥 SUPERSEDED 2026-06-23 by the live Cotality probe — DO NOT BACKFILL.
> A read-only live probe (`scripts/__trestle-colist-probe-2026-06-23.mjs`) of all 5 listings found the **live Cotality feed has `CoListOfficeMlsId`/`CoListAgentMlsId` = NULL** for every one (listings still returned, status Active/Pending). The typed DB columns (null) **already match the live feed**; only the frozen `agent_info` JSON carries old values. **Decision Rule 2 → the frozen JSON is STALE.** Backfilling would re-introduce attribution the authoritative feed has dropped. **This backfill plan is therefore REJECTED — do not execute.** The producer NULL-on-absence behavior is CORRECT (mirror-live), so the earlier "producer bug / Option A preserve" hypothesis is also rejected. Consequence: `typed_gap_rows=5` is a **stale-JSON artifact, not real data loss** — see #415 and the gate-refinement note. The backfill SQL below is retained only as the rejected record.



> **Status: REPORT-ONLY. NOTHING EXECUTED.** No SQL write, no migration, no DROP, no reclaim, no downgrade, no snapshot. The SQL below is **DO NOT RUN** — gated on explicit Maya approval of the exact statement.
> Date: 2026-06-23 · Board #415 · Blocks: Phase D Step 4 DROP (`typed_gap_rows` must be 0).
> Target DB (host-guarded): `ep-cold-waterfall-adno3ao2` / `neondb` (hidden-mountain / cold-waterfall). royal-dawn/morning-bread forbidden.
> Evidence captured read-only via `scripts/__phase-d-colist-gap-rows-2026-06-23.mjs --run` (read-only txn, ROLLBACK).

## Why this is needed
Phase D Step 4 read-only preflight found `typed_gap_rows = 5`. The 6 primary attribution fields have **0** gaps; only the two **co-list MLS** typed columns gap. Dropping `agent_info` now would permanently lose co-list MLS IDs for these 5 rows.

## The 5 affected rows (exact before/after)
All are third-party RLS (Trestle-sourced) rows; `mls_id` is null (DB-side), `rls_eligible = true`. Typed co-list columns are **blank**; `agent_info` JSON holds the values.

| DB id | listing_id | typed `co_list_office_mls_id` (before) | typed `co_list_agent_mls_id` (before) | JSON `CoListOfficeMlsId` (fill→) | JSON `CoListAgentMlsId` (fill→) | list office |
|---|---|---|---|---|---|---|
| 9153   | RLS20059620 | NULL | NULL | `7222`  | `69374`  | Compass |
| 4263   | RLS20071852 | NULL | NULL | `10325` | `122771` | Serhant |
| 10412  | RLS20077185 | NULL | NULL | `16355` | `93643`  | Revived Residential |
| 33065  | RLS20080668 | NULL | NULL | `16355` | `60901`  | Revived Residential |
| 310304 | RLS20092526 | NULL | NULL | `7222`  | `36166`  | Compass |

**After repair (expected):** each row's two typed co-list columns = the JSON values above; `typed_gap_rows = 0`.

## ⚠️ Recurrence warning (read Track B first)
Every one of the 5 rows has `updated_at` / `modification_timestamp` dated **2026-06-23** — i.e. they were re-synced from Trestle AFTER the 2026-06-22 A6 backfill drove the gap to 0. **The producer is actively re-creating the gap on each sync.** A backfill now is a STOPGAP; if the Track B producer fix does not land, the gap returns at the next idx-sync. Recommendation: **land the Track B producer fix together with (or before) this backfill**, then re-run the preflight.

## ⚠️ Decide BEFORE backfilling: preserve frozen JSON vs mirror live feed (Class-B, needs live verification)
Track B root cause: the Trestle writers NULL the typed co-list columns on UPDATE whenever the **live feed record omits** `CoListOfficeMlsId`/`CoListAgentMlsId`, while the frozen `agent_info` JSON keeps the old values. So the 5 "gaps" are typed-NULL (matches current feed) vs JSON-has-value (frozen, possibly stale). Two readings:
- **Preserve:** the JSON co-list is real attribution that an incremental/partial sync shouldn't have wiped → backfill is correct, AND the producer must stop NULLing (Track B Option A).
- **Mirror-live:** the upstream genuinely removed the co-list agent → typed-NULL is correct, the JSON is **stale**, and this backfill would RE-INTRODUCE stale attribution.
**Do not assume.** Per CLAUDE.md §J.4, confirm against the **live Cotality feed** whether these 5 listings (RLS20059620, RLS20071852, RLS20077185, RLS20080668, RLS20092526) currently carry co-list MLS (e.g. `npm run trestle:probe` / a read-only OData `$select=ListingId,CoListOfficeMlsId,CoListAgentMlsId` query). If live STILL has them → preserve+backfill. If live DROPPED them → the typed columns are already correct and the real fix is to treat the frozen JSON as stale (the DROP would not lose live data), not to backfill. Either way the producer NULL-on-absence behavior (Track B) is the durable fix and the DROP stays blocked until resolved.

## Exact fill-only SQL — DO NOT RUN (gated)
Fill-only, idempotent, per-column COALESCE (keeps any existing non-blank typed value; only fills from JSON when the typed column is blank AND the JSON value is non-blank). Restricted by the exact gap predicate (self-limiting to the 5 rows). Does **not** set `updated_at` — a raw SQL `UPDATE` does not trigger Prisma's `@updatedAt`, so `updated_at` is preserved (matches the prior A6 pattern). Wrapped so it cannot run without an explicit COMMIT.

```sql
-- ============================================================================
-- DO NOT RUN — A6 co-list MLS backfill. Run ONLY after explicit Maya approval,
-- host-guarded to ep-cold-waterfall-adno3ao2. Review BEGIN/ROLLBACK first.
-- ============================================================================
BEGIN;

-- 1) Pre-count (must equal 5):
SELECT count(*) AS gap_rows_before
FROM listings
WHERE (NULLIF(btrim(co_list_office_mls_id),'') IS NULL
        AND NULLIF(btrim(agent_info->>'CoListOfficeMlsId'),'') IS NOT NULL)
   OR (NULLIF(btrim(co_list_agent_mls_id),'') IS NULL
        AND NULLIF(btrim(agent_info->>'CoListAgentMlsId'),'') IS NOT NULL);

-- 2) Fill-only update (expected: UPDATE 5):
UPDATE listings
SET
  co_list_office_mls_id = COALESCE(NULLIF(btrim(co_list_office_mls_id),''),
                                   NULLIF(btrim(agent_info->>'CoListOfficeMlsId'),'')),
  co_list_agent_mls_id  = COALESCE(NULLIF(btrim(co_list_agent_mls_id),''),
                                   NULLIF(btrim(agent_info->>'CoListAgentMlsId'),''))
WHERE (NULLIF(btrim(co_list_office_mls_id),'') IS NULL
        AND NULLIF(btrim(agent_info->>'CoListOfficeMlsId'),'') IS NOT NULL)
   OR (NULLIF(btrim(co_list_agent_mls_id),'') IS NULL
        AND NULLIF(btrim(agent_info->>'CoListAgentMlsId'),'') IS NOT NULL);

-- 3) Post-count (must equal 0):
SELECT count(*) AS gap_rows_after
FROM listings
WHERE (NULLIF(btrim(co_list_office_mls_id),'') IS NULL
        AND NULLIF(btrim(agent_info->>'CoListOfficeMlsId'),'') IS NOT NULL)
   OR (NULLIF(btrim(co_list_agent_mls_id),'') IS NULL
        AND NULLIF(btrim(agent_info->>'CoListAgentMlsId'),'') IS NOT NULL);

-- 4) If gap_rows_before = 5 AND gap_rows_after = 0 → COMMIT;  else → ROLLBACK;
ROLLBACK;   -- <-- leave as ROLLBACK until Maya approves changing to COMMIT
```

### Explicit-ID alternative (equivalent, if you prefer pinning the 5 ids)
Same SET clause, with `WHERE id IN (9153, 4263, 10412, 33065, 310304)` instead of the gap predicate. The gap-predicate form is preferred (self-verifying + fill-only safe).

## Expected results
- Rows updated: **5**.
- `typed_gap_rows` after: **0** (re-confirm with `scripts/__phase-d-agent-info-precheck-2026-06-22.mjs --run`).
- No other column changed; `updated_at`/`modification_timestamp` preserved.

## Safety / rollback
- Run inside an explicit transaction; verify pre=5 / post=0 BEFORE `COMMIT`. If either count is off → `ROLLBACK`.
- Fill-only + COALESCE means it cannot overwrite an existing typed value or write a blank.
- Reversible: the change only fills two ID columns from the JSON already present; a Neon PITR (7-day) covers accidental error. (No snapshot required for a 5-row fill-only ID backfill, but do confirm host = cold-waterfall first.)

## Hard stop
No execution until Maya approves the exact statement. This plan does **not** authorize the Step 4 DROP — that remains separately gated and requires `typed_gap_rows = 0` to hold AFTER the Track B producer fix lands.
