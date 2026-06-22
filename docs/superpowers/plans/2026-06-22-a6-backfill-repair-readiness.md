# A6 backfill repair — READINESS (Lane 1B result, 2026-06-22)

> **Status: read-only measured. Execution (`--execute`) is GATED on explicit Maya approval.**
> No production write performed. The Phase D DROP stays BLOCKED until `typed_gap_rows = 0`.

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
4. **Re-run the precheck:** `node scripts/__phase-d-agent-info-precheck-2026-06-22.mjs --run` → **`typed_gap_rows = 0`** across all 8 fields.
5. Only then does the A6 ambiguity resolve and Phase D code-prep may proceed (DROP itself stays separately gated: code reads removed + snapshot/backup approved + explicit Maya DROP approval).

## Hard rules
- **Do NOT run `--execute` without separate explicit Maya approval** (it is a production write).
- Do NOT DROP / reclaim / migrate / downgrade Neon.
- `agent_info` is only ~39 MB — its drop will NOT get the DB under the 500 MB cap; Free still needs the other JSON fronts + archive drain + measured total size.
