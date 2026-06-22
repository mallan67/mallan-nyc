# A6 backfill repair — READINESS (Lane 1B result, 2026-06-22)

> **Status: A6 backfill EXECUTED + verified 2026-06-22 (Maya-approved). `typed_gap_rows` now = 0 across all 8 fields.**
> The fill-only repair updated exactly **1 row** (2 co-list MLS typed columns). Phase D DROP remains
> separately gated (remaining code reads removed + snapshot + explicit Maya DROP approval). No
> DROP / reclaim / migration / downgrade performed.
>
> **Verification does NOT depend on the operator-local `scripts/__phase-d-…precheck` script** (that
> `__`-prefixed script is intentionally untracked per `.gitignore`). The canonical, checked-in
> verification SQL is inlined in §"Verification SQL (checked-in)" below — run it in any read-only
> session against cold-waterfall.

## What the read-only precheck found (production, `ep-cold-waterfall-adno3ao2`)
`node scripts/__phase-d-agent-info-precheck-2026-06-22.mjs --run` (host-guarded, read-only txn, ROLLBACK) on 2026-06-22:

- Identity: `neondb` / `ep-cold-waterfall-adno3ao2` / `transaction_read_only = on` / PG 17.10. ✅ canonical.
- **`typed_gap_rows = 1`** → Phase D DROP **BLOCKED** (decision-tree path A).
- Per-field gaps: name 0 · office 0 · email 0 · phone 0 · office_mls 0 · agent_mls 0 · **co_list_office_mls 1** · **co_list_agent_mls 1**.
- Mismatches (typed ≠ frozen JSON, both present): name 191 · office 0 · agent_mls 4 · email 4 — **expected typed-override**, NOT a blocker (post-Phase-C producers write typed-only while JSON is frozen, so typed = current; typed-first already serves these and the DROP would correctly discard stale JSON).
- `agent_info` logical: **39 MB** (40,532,486 B), 109,685 present rows.
- Storage: DB **1363 MB = 285.9 %** of the 500 MB cap; `listings` 1041 MB (heap 307 / TOAST 695 / idx 38).

## The gap (exact scope)
**1 row** where `agent_info` JSON carries `CoListOfficeMlsId` / `CoListAgentMlsId` but the typed
columns `co_list_office_mls_id` / `co_list_agent_mls_id` are NULL. The 6 primary fields are fully
backfilled (0 gaps). Dropping `agent_info` now would lose those two co-list MLS IDs on that one row.

## The repair (already exists — no new code needed)
`scripts/backfill-agent-info-typed-columns.ts` (#416) is the exact, tested repair:
- **Covers all 8 columns incl. co-list** (`co_list_office_mls_id` / `co_list_agent_mls_id`).
- **Fill-only / race-safe:** every column written as `COALESCE(col, derived)` → **can never overwrite a non-null typed value** (only fills NULLs). This is the "no overwrite of existing typed values" guarantee.
- **Preserves `updated_at`** (raw SQL, no `@updatedAt` restamp → no list reorder).
- **Host-guarded** to cold-waterfall; **dry-run by default**; `--execute` requires explicit approval.
- **Parity** with the producer seam `typedAgentColumnsFromJson`.
- **Tests:** `tests/runtime/agent-info-backfill-sql.test.ts` — 7/7 (8-column coverage, COALESCE-never-overwrite, updated_at-absent, co-list parity).

## Execution plan (each step Maya-gated; NOTHING run yet)
1. **Dry-run (read-only):** `npm run ops:backfill-agent-info` → expect `rows_any = 1`, `co_list_office_mls_id: 1`, `co_list_agent_mls_id: 1`, all others 0 (matches the precheck).
2. **Execute (WRITE — separate Maya approval):** `npm run ops:backfill-agent-info:execute`.
3. **Verify idempotent:** re-run the dry-run → `rows_any = 0`.
4. **Verify zero gaps** with the checked-in SQL below (run in a read-only session against cold-waterfall) → **`typed_gap_rows = 0`** across all 8 fields. *(The operator-local `scripts/__phase-d-…precheck.mjs --run` wraps the same SQL with a host guard + read-only txn; it is a convenience, NOT the source of truth, and is intentionally untracked.)*
5. Only then does the A6 ambiguity resolve and Phase D code-prep may proceed (DROP itself stays separately gated: code reads removed + snapshot/backup approved + explicit Maya DROP approval).

**Done 2026-06-22:** steps 1–4 executed; result `typed_gap_rows = 0`, all 8 per-field gaps = 0 (1 row updated).

## Verification SQL (checked-in) — read-only; all-8-field typed_gap_rows
Mirrors `lib/listings/agent-info-typed-columns.ts` (PascalCase ?? lowercase, `NULLIF(btrim(),'')`). Run in a **read-only** session (e.g. `BEGIN; SET TRANSACTION READ ONLY; … ; ROLLBACK;`):

```sql
WITH d AS (
  SELECT
    NULLIF(btrim(list_agent_full_name),'')    AS t_name,   COALESCE(NULLIF(btrim(agent_info->>'ListAgentFullName'),''),    NULLIF(btrim(agent_info->>'name'),''))    AS j_name,
    NULLIF(btrim(list_office_name),'')         AS t_office, COALESCE(NULLIF(btrim(agent_info->>'ListOfficeName'),''),       NULLIF(btrim(agent_info->>'company'),'')) AS j_office,
    NULLIF(btrim(list_agent_email),'')         AS t_email,  COALESCE(NULLIF(btrim(agent_info->>'ListAgentEmail'),''),       NULLIF(btrim(agent_info->>'email'),''))   AS j_email,
    NULLIF(btrim(list_agent_direct_phone),'')  AS t_phone,  COALESCE(NULLIF(btrim(agent_info->>'ListAgentDirectPhone'),''), NULLIF(btrim(agent_info->>'phone'),''))  AS j_phone,
    NULLIF(btrim(list_office_mls_id),'')       AS t_offmls, NULLIF(btrim(agent_info->>'ListOfficeMlsId'),'')   AS j_offmls,
    NULLIF(btrim(list_agent_mls_id),'')        AS t_agmls,  NULLIF(btrim(agent_info->>'ListAgentMlsId'),'')    AS j_agmls,
    NULLIF(btrim(co_list_office_mls_id),'')    AS t_cooff,  NULLIF(btrim(agent_info->>'CoListOfficeMlsId'),'') AS j_cooff,
    NULLIF(btrim(co_list_agent_mls_id),'')     AS t_coag,   NULLIF(btrim(agent_info->>'CoListAgentMlsId'),'')  AS j_coag
  FROM listings
)
SELECT
  count(*) FILTER (WHERE t_name   IS NULL AND j_name   IS NOT NULL) AS gap_name,
  count(*) FILTER (WHERE t_office IS NULL AND j_office IS NOT NULL) AS gap_office,
  count(*) FILTER (WHERE t_email  IS NULL AND j_email  IS NOT NULL) AS gap_email,
  count(*) FILTER (WHERE t_phone  IS NULL AND j_phone  IS NOT NULL) AS gap_phone,
  count(*) FILTER (WHERE t_offmls IS NULL AND j_offmls IS NOT NULL) AS gap_office_mls,
  count(*) FILTER (WHERE t_agmls  IS NULL AND j_agmls  IS NOT NULL) AS gap_agent_mls,
  count(*) FILTER (WHERE t_cooff  IS NULL AND j_cooff  IS NOT NULL) AS gap_co_office_mls,
  count(*) FILTER (WHERE t_coag   IS NULL AND j_coag   IS NOT NULL) AS gap_co_agent_mls,
  count(*) FILTER (WHERE
       (t_name IS NULL AND j_name IS NOT NULL) OR (t_office IS NULL AND j_office IS NOT NULL)
    OR (t_email IS NULL AND j_email IS NOT NULL) OR (t_phone IS NULL AND j_phone IS NOT NULL)
    OR (t_offmls IS NULL AND j_offmls IS NOT NULL) OR (t_agmls IS NULL AND j_agmls IS NOT NULL)
    OR (t_cooff IS NULL AND j_cooff IS NOT NULL) OR (t_coag IS NULL AND j_coag IS NOT NULL)
  ) AS typed_gap_rows
FROM d;
-- Required for DROP: typed_gap_rows = 0 AND every gap_* = 0.
```

## Hard rules
- **Do NOT run `--execute` without separate explicit Maya approval** (it is a production write). *(2026-06-22: approved once, executed once — 1 row.)*
- Do NOT DROP / reclaim / migrate / downgrade Neon.
- `agent_info` is only ~39 MB — its drop will NOT get the DB under the 500 MB cap; Free still needs the other JSON fronts + archive drain + measured total size.
