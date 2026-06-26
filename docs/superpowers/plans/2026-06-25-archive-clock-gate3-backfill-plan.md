# Archive Clock Gate 3 — `terminal_since` backfill execution PLAN + dry-run proof (PLAN ONLY)

**Date:** 2026-06-25
**Author:** Claude (for Maya approval)
**Status:** PLAN ONLY + read-only dry-run proof. **No `--execute`. No archive drain. No flag flip.** Execution is a separate explicit Maya-gated step.
**Predecessors:** PR-1 #446 (clock + dry-run backfill, merged `dbc13c3b`); PR-2 #448 (predicate repoint behind default-OFF flag, merged `6e3b78c2`). Production `terminal_since` column live + migration resolved.
**Script:** `scripts/backfill-terminal-since.ts` (already merged; dry-run by default, `--execute` gated).
**Compliance surface:** writes only the additive `terminal_since` clock column — **no status/display/§2.05 change, no archive**. Per `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §14 (SHIELD retention) this is clock-population only; it does not move or strip any row.

---

## 1. What Gate 3 does (and does NOT do)

**Does:** populate `listings.terminal_since` for the **existing historical terminal backlog** — rows that were terminal *before* PR-1's writers went live and therefore still have `terminal_since IS NULL`. Derivation uses the **same shared helper** the live writers use (`lib/listings/terminal-since.ts → deriveTerminalSince`), so backfilled values match runtime parity exactly.

**Does NOT:** archive anything · flip the flag · change any status / display gate / §2.05 / T+30 path · touch `raw_data`/`media`/`compliance` · bump any already-set `terminal_since` · touch non-terminal/live rows. The flag remains **OFF**, so even after the backfill the archiver drains nothing until Gate 5.

---

## 2. Dry-run proof (read-only, just captured on cold-waterfall)

`npx tsx scripts/backfill-terminal-since.ts` (default = DRY-RUN, **zero writes**), 19 keyset batches, exit 0:

| metric | count | meaning |
|---|---:|---|
| **would_set** — terminal rows with a valid derivable stable date | **89,688** | rows the execute run WOULD set `terminal_since` on (96.6% of candidates) |
| **no_date** — no valid stable date in window | **3,205** | left `terminal_since = NULL` → **fail-safe, never auto-archived** (no invented dates) |
| of would_set, **>180d old** | **82,710** | would become flag-ON archive-eligible *once Gate 5 flips* |
| already_set (skipped) | **37** | organic PR-1-writer seeding since the column went live (not touched) |

Candidate population scanned = 89,688 + 3,205 = **92,893** terminal rows with `terminal_since IS NULL` (≈ the 92,859 measured at PR-2 merge + organic drift).

> Interpretation: the backfill resolves a stable date for **~96.6%** of the backlog; the **3,205** residual stay NULL by design (no CloseDate/OffMarketDate/ExpirationDate/typed-expiration in the sanity window). **82,710** of the dated rows are already older than 180d — that is the historical population that Gate 5 would eventually archive (in 500/run nightly batches → ≈ 166 nights; a separate cadence decision).

---

## 3. Exact predicate & derivation (verbatim from the merged script)

**Selection predicate** (keyset-paginated, lines 84-92):
```sql
SELECT id, status,
       raw_data->>'CloseDate'  AS cd,  features->>'CloseDate'   AS fcd,
       raw_data->>'OffMarketDate' AS omd, raw_data->>'ExpirationDate' AS ed,
       expiration_date::text AS exp
FROM listings
WHERE id > $lastId
  AND lower(status) IN ('closed','sold','leased','rented','withdrawn','expired','cancelled','canceled')
  AND terminal_since IS NULL
ORDER BY id LIMIT 5000;
```
**Derivation (JS, shared helper — parity with live writers):** for each row, first VALID candidate in a sanity window (`>= 2000-01-01` and `<= now+24h`) wins, in order:
`raw_data.CloseDate → features.CloseDate → raw_data.OffMarketDate → (Expired only) raw_data.ExpirationDate → typed expiration_date`. Invalid/out-of-window candidates are **skipped** (never abort); a row with no valid candidate → `null` → left NULL.

**`--execute` UPDATE (batched unnest) re-asserts the guard** (matches the shipped script `scripts/backfill-terminal-since.ts`):
```sql
UPDATE listings AS l SET terminal_since = v.ts
FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::timestamp[]) AS ts) v   -- ::timestamp (NOT timestamptz)
WHERE l.id = v.id
  AND l.terminal_since IS NULL                      -- never bump an already-set value
  AND lower(l.status) IN (... same 8 terminal ...)  -- never write onto a row that reactivated mid-run
RETURNING l.id;                                      -- captures the actually-updated rows for the touched-id log
```
> **`::timestamp` (timestamp-without-time-zone), not `::timestamptz`:** the values are UTC ISO; `::timestamp`
> stores the UTC wall time independent of session TZ (matching how the live writer / Prisma stores into the
> `timestamp(3) without time zone` column), and makes the value-guarded rollback's `::timestamp` comparison
> match under any session. This is the actual shipped behavior — see runbook §0.5/§7 and the script.

---

## 4. Batch size, timeouts, runtime

- **Batch size:** 5,000 rows/page via **keyset pagination** (`id > $lastId ORDER BY id LIMIT 5000`) — avoids the OFFSET re-scan slowdown that caused the S1 `statement_timeout` abort.
- **Per-batch write txn:** `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; UPDATE …; COMMIT;` — one commit per 5,000-row batch (≈19 commits total), so a failure is isolated to its batch and resumable (keyset advances).
- **Connection:** unpooled/direct cold-waterfall (host-guarded; aborts if URL ≠ `ep-cold-waterfall-adno3ao2`), client `statement_timeout=180s`.
- **Expected runtime:** dry-run was ~1–3 min for the scan+derive; execute adds 19 small batched UPDATEs (each ≤5k rows on an indexed PK) → similar order, low single-digit minutes.
- **Batch-cap backstop:** aborts if `batch > 80` (we expect 19).

---

## 5. Safety checks (built-in + operational)

**Built-in (script):** host-guard to cold-waterfall · dry-run default (writes only with `--execute`) · `terminal_since IS NULL` guard (idempotent — never bumps organic/already-set values) · terminal-status re-assertion in the UPDATE (never writes onto a reactivated row) · per-batch lock/statement timeouts · no invented dates (no-date rows stay NULL).

**Operational (pre-execute, recommend):**
1. **Flag must be OFF** — confirm `ARCHIVE_T180_BACKLOG_ENABLED` is absent/≠true in Production (so a backfilled value cannot trigger any archive). The backfill itself never reads/sets the flag.
2. **Pre-execute Neon rollback branch** (timestamped, like S1) for point-in-time safety, retained until post-verify sign-off.
3. **Capture touched ids + values** — the `--execute` run writes a durable JSONL log of every changed row (`id`, `new_terminal_since`, source) so a **value-guarded** targeted rollback is possible without a full PITR (clears only rows whose current `terminal_since` still equals the logged value — see §6 and the runbook §7). Built into the script.

---

## 6. Rollback / PITR assumptions

- **Blast radius of a bad backfill while the flag is OFF = 0 production effect.** `terminal_since` feeds **only** the flag-ON archive predicate; with the flag OFF nothing reads it for archiving. So an incorrect value has *no* live consequence until Gate 5 — there is time to correct before any drain.
- **Targeted rollback (preferred — VALUE-GUARDED):** clear `terminal_since` only for rows whose current value still equals the logged `new_terminal_since`, so a later live-writer update is preserved (a row that reactivated then went terminal again and was re-clocked is **not** clobbered):
  ```sql
  UPDATE listings AS l SET terminal_since = NULL
  FROM (VALUES (<id>, '<new_terminal_since>'::timestamp)) AS v(id, ts)
  WHERE l.id = v.id AND l.terminal_since = v.ts;
  ```
  Uses `::timestamp` (matches the `timestamp(3) without time zone` column TZ-independently — `::timestamptz` would skip valid rows under a non-UTC session). Build the VALUES list from the touched-id log (§5.3). Canonical form: runbook §7.
- **Neon PITR (fallback, heavy):** Launch plan = **7-day** history window. PITR restores the **whole branch** (all tables) to a timestamp, so it would also revert unrelated writes (idx-sync, CRM) since the backfill — **not** suitable as a routine column rollback; use only for a catastrophic case. The pre-execute **rollback branch** (§5.2) is the lighter belt-and-suspenders.
- **Idempotency:** re-running `--execute` is safe (NULL-guard) — it only fills rows still NULL, so a partial/interrupted run is simply resumed.

---

## 7. Expected post-execute state (for verification targets)

| measure | pre-execute | expected post-execute |
|---|---:|---:|
| `terminal_since` set (terminal, not archived) | ~37 | **~89,725** (+89,688) |
| NULL-clock backlog (terminal, not archived, `terminal_since IS NULL`) | ~92,859 | **~3,205** (the no-date residual) |
| flag-ON eligible (`terminal_since < cutoff`), **measured with flag forced ON locally** | 1 | **~82,710** |
| rows archived (`sync_status='archived'`) | unchanged | **unchanged** (no archive — flag OFF) |

---

## 8. Post-backfill read-only verification (no writes)

1. `count(terminal_since)` on terminal-not-archived rows ≈ **89,725**; NULL-clock residual ≈ **3,205**.
2. **No-date residual is genuinely date-less:** spot-check a sample of the residual — confirm none has a valid in-window CloseDate/OffMarketDate/(Expired)ExpirationDate/typed expiration.
3. **Set values are correct:** spot-check ~20 backfilled rows — `terminal_since` equals the derived stable date (CloseDate for Closed, OffMarketDate for Withdrawn, etc.), all within the sanity window (`2000-01-01 … now+24h`).
4. **No live/non-terminal row touched:** `count(*) WHERE terminal_since IS NOT NULL AND lower(status) NOT IN (terminal set)` = **0**.
5. **Flag-ON eligible** (forced-ON local ops-health, read-only) ≈ **82,710**; `archive_backlog_predicate` reads `stable-clock`.
6. **ops:health:** `listings_terminal_missing_terminal_since` drops to ~**3,205**; **with flag OFF, still no warning** (gated) and `ops:health` stays exit 0.
7. **No archive occurred:** `listingsArchive.count()` unchanged; `sync_status='archived'` count unchanged; flag still OFF; `/api/health` 200.

---

## 9. Gate sequence position & hard limits

This is **Gate 3** of the staged rollout (`archive-flag-runbook-2026-06-17.md` §1.5). Gate 4 (post-backfill archive dry-run) and Gate 5 (flag flip / archive drain) remain **separate, explicit, Maya-gated** steps.

**Hard limits (this plan executes none of these):** no backfill `--execute` · no archive drain · no flag flip · no reclaim · no `raw_data` strip · no downgrade · no Vercel/env change · no S1 rollback-branch deletion · no §2.05/T+24h change · no T+30d media change · no invented terminal dates · never `prisma migrate deploy` on prod.

## 10. Recommended next action
Review the dry-run numbers (§2) and verification design (§8). If you approve **Gate 3 execution**, tell me whether to add the touched-id capture log (§5.3) and create a pre-execute Neon rollback branch (§5.2), and I will return with the exact execute runbook for a separate go — **still stopping before `--execute`** until you explicitly approve that run. Gate 5 (the actual archive drain) stays separately gated regardless.
