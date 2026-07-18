# N3 — EXPLAIN evidence: single bounded backlog fetch (media-sync Phase 3)

**Date:** 2026-07-18
**Program:** Neon closure — register item R3 (T1-measured `listing_media` seq-scan churn)
**Branch:** `fix/media-backlog-bounded-fetch-n3`
**Database probed:** Neon project `hidden-mountain-87248164` (canonical production), branch `br-crimson-frog-adr7g9gt` (`main`), db `neondb` — **read-only, plain `EXPLAIN` only** (no ANALYZE, no DML/DDL).

---

## Root cause (what T1 measured)

`lib/idx/media-sync.ts` Phase 3 ran a while-loop in which **every 5-row mirror
wave** re-executed the backlog eligibility `findMany` with a growing
`id NOT IN (...attempted)` list. With no covering index on the eligibility
predicate, each execution is a **Parallel Seq Scan over ~300K rows**.

T1 measurements (pg_stat evidence, register R3):

- ~**45 backlog scans per run** (average)
- ~**1,077 seq scans/day** on `listing_media`
- ~**108M tuples read/day** — overwhelmingly this loop plus the once-per-run
  Phase-4 `backlog_remaining` count

Implied effective runs/day: `1,077 ÷ 45 ≈ 24` (cron fires every 15 min = 96
slots/day; the 10-minute concurrency guard, budget exits, and empty-work runs
reduce effective full runs to ~24/day).

---

## BEFORE — per-wave loop query shape (executed ~45×/run)

Query shape as issued by the pre-N3 loop (representative 5-id `notIn` list;
the real list grew by up to 5 ids per wave):

```sql
EXPLAIN SELECT "id", "listing_id", "media_key", "media_type", "order",
       "media_url_original", "r2_key", "media_url_cached", "r2_attempts"
FROM "listing_media"
WHERE "status" = 'active'
  AND "media_url_original" IS NOT NULL
  AND ("r2_key" IS NULL OR "media_url_cached" IS NULL)
  AND "id" NOT IN (101, 102, 103, 104, 105)
  AND ("r2_last_attempt_at" IS NULL OR "r2_last_attempt_at" < (now() - interval '6 hours'))
  AND ("r2_attempts" IS NULL OR "r2_attempts" < 8)
ORDER BY "created_at" ASC
LIMIT 5;
```

Plan (captured 2026-07-18 against `br-crimson-frog-adr7g9gt`/`neondb`, verbatim):

```
Limit  (cost=22749.69..22750.27 rows=5 width=322)
  ->  Gather Merge  (cost=22749.69..22924.47 rows=1498 width=322)
        Workers Planned: 2
        ->  Sort  (cost=21749.67..21751.54 rows=749 width=322)
              Sort Key: created_at
              ->  Parallel Seq Scan on listing_media  (cost=0.00..21737.23 rows=749 width=322)
                    Filter: ((media_url_original IS NOT NULL) AND ((r2_key IS NULL) OR (media_url_cached IS NULL)) AND ((r2_attempts IS NULL) OR (r2_attempts < 8)) AND (status = 'active'::text) AND (id <> ALL ('{101,102,103,104,105}'::bigint[])) AND ((r2_last_attempt_at IS NULL) OR (r2_last_attempt_at < (now() - '06:00:00'::interval))))
```

**Loop multiplicity:** this full-table Parallel Seq Scan executed ~45× per run
(T1 average), ~1,077×/day — once before EVERY 5-row mirror wave.

---

## AFTER — single bounded query (executed 1×/run)

The N3 query shape (one fetch, empty attempted set — no `id` filter — stable
`id` tiebreak, `LIMIT 250` = `MAX_R2_CANDIDATES_PER_RUN`):

```sql
EXPLAIN SELECT "id", "listing_id", "media_key", "media_type", "order",
       "media_url_original", "r2_key", "media_url_cached", "r2_attempts"
FROM "listing_media"
WHERE "status" = 'active'
  AND "media_url_original" IS NOT NULL
  AND ("r2_key" IS NULL OR "media_url_cached" IS NULL)
  AND ("r2_last_attempt_at" IS NULL OR "r2_last_attempt_at" < (now() - interval '6 hours'))
  AND ("r2_attempts" IS NULL OR "r2_attempts" < 8)
ORDER BY "created_at" ASC, "id" ASC
LIMIT 250;
```

Plan (captured 2026-07-18 against `br-crimson-frog-adr7g9gt`/`neondb`, verbatim):

```
Limit  (cost=21986.65..22015.82 rows=250 width=322)
  ->  Gather Merge  (cost=21986.65..22161.43 rows=1498 width=322)
        Workers Planned: 2
        ->  Sort  (cost=20986.62..20988.50 rows=749 width=322)
              Sort Key: created_at, id
              ->  Parallel Seq Scan on listing_media  (cost=0.00..20953.05 rows=749 width=322)
                    Filter: ((media_url_original IS NOT NULL) AND ((r2_key IS NULL) OR (media_url_cached IS NULL)) AND ((r2_attempts IS NULL) OR (r2_attempts < 8)) AND (status = 'active'::text) AND ((r2_last_attempt_at IS NULL) OR (r2_last_attempt_at < (now() - '06:00:00'::interval))))
```

---

## What changed and what did not

**Plan SHAPE is unchanged — by design.** Both plans are the same class
(Parallel Seq Scan → Sort → Gather Merge → Limit) because no covering index
exists yet. **The win is execution COUNT, not plan shape.** Whether an index
should eliminate the seq scan entirely is **N4's question** (design-only,
separate task) — this PR deliberately contains NO index, NO migration.

### Arithmetic — scans/day

| | Before (T1) | After (N3) |
|---|---|---|
| Backlog eligibility scans per run | ~45 | **1** |
| Phase-4 `backlog_remaining` count per run (pre-existing, unchanged) | 1 | 1 |
| Scans per run total | ~46 | **2** |
| Effective runs/day | ~24 | ~24 (unchanged) |
| **Seq scans/day on `listing_media`** | **~1,077** | **2/run × 24 runs ≈ 48 (upper bound ~72 with run-count variance)** |

### Arithmetic — tuples/day

Each eligibility scan reads the full ~300K-row table (~100K tuples/scan
attributed per T1: 108M ÷ 1,077). After N3: ~100K × ~48 scans ≈ **~5–10M
tuples/day**, i.e. **~108M/day → ~10M/day** (order-of-magnitude collapse; the
register's T2 target).

### Success metrics (T2, post-merge verification)

- `listing_media` `seq_scan`/day collapses **~1,077 → <100**
- `listing_media` `seq_tup_read`/day **~108M → ~10M**
- `media_sync_cron` audit rows show `backlog_query_count: 1` on every run that
  entered Phase 3 (`0` on budget-skipped/`source_error` runs)

---

## Preserved semantics (proven by the test suite in this PR)

- Cross-invocation 6h cooldown (`r2_last_attempt_at` writes on failure paths — untouched)
- RC3 retry-exhausted parking (`r2_attempts >= 8` excluded by the same `where`)
- Tombstone-on-3rd-4xx (Cp4, untouched)
- Failure/success DB write behavior (Cp4, untouched)
- Budget/`exit_reason` semantics (`budget_phase2` when time runs out with candidates remaining; one time-budget check per wave)
- Per-invocation no-re-attempt guarantee (the attempted-id `Set`, now gating the in-memory iteration instead of driving `notIn` re-queries)
