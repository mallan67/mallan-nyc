# Gate 3 — `terminal_since` backfill EXECUTE runbook

**Status:** RUNBOOK PREPARED. **`--execute` NOT run.** Requires separate explicit Maya approval to run.
**Script:** `scripts/backfill-terminal-since.ts` (this branch adds the touched-id capture log).
**Predecessors:** PR-1 #446 (clock), PR-2 #448 (predicate repoint behind default-OFF flag), Gate-3 plan `docs/superpowers/plans/2026-06-25-archive-clock-gate3-backfill-plan.md`.
**Scope:** populate `listings.terminal_since` for the historical NULL-clock terminal backlog. **No archive, no flag flip, no status/display change.**

---

## 1. Pre-execute Neon rollback branch (CREATED 2026-06-25)

A point-in-time rollback branch was created from canonical production **before** any execute:

| field | value |
|---|---|
| name | `pre-gate3-terminal-since-backfill-2026-06-25` |
| branch id | `br-round-recipe-ad7iqnu4` |
| endpoint id | `ep-silent-band-adt3v9sp` |
| parent branch | `br-crimson-frog-adr7g9gt` (main) |
| project | `hidden-mountain-87248164` ("neon-green-school") |
| created (UTC) | `2026-06-25T22:56:40Z` |

(The branch's connection URI/password is intentionally **not** recorded here.) This branch is belt-and-suspenders; the **primary** rollback is the targeted touched-id log (§7). If execute is deferred more than a few days, refresh this branch immediately before running so it is a true pre-execute snapshot.

---

## 2. Pre-execute read-only state (cold-waterfall, 2026-06-25)

| metric | value |
|---|---:|
| `terminal_since` set (organic, live-writer) | 41 |
| NULL-clock backlog (terminal, `terminal_since IS NULL`) | 92,892 |
| would_set (dry-run; valid stable date) | 89,688 |
| no_date (dry-run; left NULL, fail-safe) | 3,205 |
| flag-OFF eligible (`status_changed_at<cutoff`) | 0 |
| flag-ON eligible (`terminal_since<cutoff`) | 1 |
| `listings_archive` count (baseline) | 34 |
| `ARCHIVE_T180_BACKLOG_ENABLED` | OFF (verify in Vercel before run) |
| S1 rollback branches | untouched (`br-holy-forest-adxoogq9`, `br-mute-flower-adurq0o7`) |

> Organic drift: the live writers keep seeding `terminal_since`, so `set` and the backlog move slightly between now and execute. The execute run re-measures and is idempotent (§5), so drift is harmless.

---

## 3. Exact command

```bash
# From repo root, on the branch that contains the touched-id capture (chore/gate3-backfill-capture-2026-06-25,
# or main after this PR merges). Loads .env.local for the cold-waterfall DATABASE_URL_UNPOOLED.
npx tsx scripts/backfill-terminal-since.ts --execute
```

Dry-run (no `--execute`) remains the default and writes nothing.

## 4. Environment guard (proves canonical production)

The script aborts unless the resolved connection targets cold-waterfall (`scripts/backfill-terminal-since.ts:28-32`):
```ts
const HOST = "ep-cold-waterfall-adno3ao2";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
if (!url.includes(HOST)) { console.error("FATAL: target is not cold-waterfall production. Aborting."); process.exit(1); }
```
Operator pre-check (do NOT print the URL): confirm the bare `DATABASE_URL_UNPOOLED` in `.env.local` contains `ep-cold-waterfall-adno3ao2` and the DB is `neondb` / project `hidden-mountain-87248164`. The script connects unpooled/direct.

## 5. Batch size · timeouts · idempotency

- **Batch size:** 5,000 rows/page, **keyset pagination** (`WHERE id > $last … ORDER BY id LIMIT 5000`) — no OFFSET re-scan.
- **Per-batch txn:** `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; UPDATE … RETURNING id; COMMIT;` (~19 commits). Client `statement_timeout=180s`.
- **Idempotency guard:** the UPDATE is `… WHERE l.terminal_since IS NULL AND lower(l.status) IN (8 terminal)`. It only fills still-NULL terminal rows — **never bumps** an organic/already-set value and **never writes a row that reactivated** mid-run. Re-running resumes safely.
- **No invented dates:** rows with no valid stable source are left NULL (no wall-clock fallback in the backfill).

## 6. Row-count expectations & abort conditions

**Expected (per dry-run):** `would_set ≈ 89,688` updated · `no_date ≈ 3,205` left NULL · `over180 ≈ 82,710` · batches ≈ 19. The touched-id log line count must equal `rows actually updated`.

**ABORT and stop (do not continue) if:**
- The script prints `FATAL: target is not cold-waterfall` (wrong DB).
- `rows actually updated` ≫ `would_set` or wildly off (> ~90,500) — unexpected population.
- Any batch throws `lock_timeout`/`statement_timeout` repeatedly (contention) — investigate before resuming.
- `batch > 80` backstop trips.
- Post-run, `listings_archive` count changed or any row gained `sync_status='archived'` (must NOT happen — see §9).

## 7. Touched-id capture & rollback (authoritative, not a vague claim)

Under `--execute`, every row the UPDATE actually changed (`RETURNING id`) is appended to:
```
artifacts/gate3-backfill-touched-<UTC-stamp>.jsonl
```
Each line: `{ "id", "old_terminal_since": null, "new_terminal_since": "<ISO>", "source": "CloseDate|features.CloseDate|OffMarketDate|ExpirationDate|typedExpiration", "backfill_run": "<stamp>" }`. (`old` is always null because the UPDATE guards `terminal_since IS NULL`.) The log is **gitignored** (operational artifact) — preserve it until post-verify sign-off.

> **Durability invariant (Codex #451):** the log is written (full-buffer write loop — handles short
> writes) **and fsync'd to disk BEFORE the batch COMMIT**. At `--execute` start the log file is
> pre-created and its containing directory is fsync'd (POSIX; an explicit no-op on Windows, where NTFS
> journals metadata) so the file's directory entry is durable before any batch commits. If the log
> write fails (disk full / read-only / permission), the batch is **ROLLED BACK and the run aborts** —
> so a committed change is **never** missing from the rollback set. The only tolerated skew is harmless
> *over*-reporting: if COMMIT fails *after* the log write, those ids are logged but unchanged, and the
> rollback `SET terminal_since = NULL` on a row that stayed NULL is a **no-op**. The log therefore never
> under-reports committed changes. (Power-loss fallback where directory fsync is unavailable: the
> pre-execute Neon rollback branch + post-verify.)

**Targeted rollback (preferred — VALUE-GUARDED, exact):** clear `terminal_since` **only** for rows whose
current value still equals the logged backfill value — so any later live-writer update (a row that
reactivated then went terminal again and was re-clocked by the normal writer) is **preserved**, not
clobbered. The log records `new_terminal_since` for exactly this.
```bash
# Build a VALUES list of (id, new_terminal_since) from the JSONL log, e.g.:
#   jq -r --arg q "'" '"(" + (.id|tostring) + ", " + $q + .new_terminal_since + $q + "::timestamp)"' \
#     artifacts/gate3-backfill-touched-<stamp>.jsonl | paste -sd,
#   → emits rows like:  (128464, '2025-05-01T00:00:00.000Z'::timestamp)
# ($q carries a literal single quote via the shell --arg, avoiding jq string-escape pitfalls
#  like the invalid \x27.)
# Then (run host-guarded to cold-waterfall):
UPDATE listings AS l
SET terminal_since = NULL
FROM (VALUES
  (<id>, '<new_terminal_since>'::timestamp)   -- … one row per log line …
) AS v(id, ts)
WHERE l.id = v.id
  AND l.terminal_since = v.ts;                 -- skips rows changed since the backfill (preserved)
```
**Why `::timestamp` (not `::timestamptz`):** `listings.terminal_since` is `timestamp(3) without time zone`,
and the backfill stores the UTC ISO value as wall-time (`::timestamp`, TZ-independent). Verified read-only
on cold-waterfall: `value::timestamp = value::timestamp` matches under **both** `GMT` and
`America/New_York` sessions, whereas `value::timestamp = value::timestamptz` is **false** under a non-UTC
session — using `::timestamptz` would silently skip valid rows. NULL rows never match `= v.ts`, so they
stay safe. **Fallback (heavy):** the §1 Neon branch (point-in-time, whole-branch) or Neon PITR (6-hour window — verified, OPS-016; NOT 7-day
window) — use only for a catastrophic case, since they revert unrelated writes too.

## 8. Post-execute verification (read-only)

1. `SELECT count(terminal_since) FROM listings;` ≈ **89,725** (≈ pre 41 + 89,688).
2. NULL-clock residual `… WHERE terminal AND terminal_since IS NULL` ≈ **3,205**; spot-check that the residual genuinely has no valid in-window CloseDate/OffMarketDate/(Expired)ExpirationDate/typed-expiration.
3. Spot-check ~20 updated ids from the log: `listings.terminal_since` = the log's `new_terminal_since`, all within `[2000-01-01, now+24h]`, and consistent with the recorded `source`.
4. No live/non-terminal row touched: `SELECT count(*) FROM listings WHERE terminal_since IS NOT NULL AND lower(status) NOT IN (<8 terminal>);` = **0**.
5. Touched-id log line count == `rows actually updated` printed by the script.
6. Flag-ON eligible (force `ARCHIVE_T180_BACKLOG_ENABLED=true` **locally only**, read-only ops-health) ≈ **82,710**; `archive_backlog_predicate` reads `stable-clock`.
7. `ops:health` (flag OFF): `listings_terminal_missing_terminal_since` ≈ **3,205**, **no warning**, exit 0.

## 9. Proof that NO archive drain can happen

The archiver (`app/api/cron/data-retention/route.ts`) only selects `terminal_since < cutoff` **when `ARCHIVE_T180_BACKLOG_ENABLED === "true"`**; the default-OFF branch uses the legacy `status_changed_at < cutoff` (currently eligible **0**). This backfill **does not** touch the flag, the cron, or `sync_status`. So while the flag stays OFF:
- the nightly cron keeps draining the legacy set (0 rows),
- the populated `terminal_since` is **read by nothing** for archiving,
- `listings_archive` and `sync_status='archived'` are unchanged.

Archiving the historical backlog requires **Gate 5** (flag flip + redeploy) — a separate explicit Maya gate, preceded by **Gate 4** (post-backfill archive dry-run). Backfilling the clock (Gate 3) and draining the archive (Gate 5) are decoupled by the flag.

## 10. Hard limits (this runbook executes none)
No `--execute` until separate approval · no archive drain · no flag flip · no reclaim · no `raw_data` strip · no downgrade · no Vercel/env change · no S1 rollback-branch deletion · no archive-predicate change · no invented dates · no change to #449 alias normalization · never `prisma migrate deploy` on prod.
