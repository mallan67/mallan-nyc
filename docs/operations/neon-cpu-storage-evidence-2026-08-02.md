# Neon CPU / storage — measurement evidence for PR #593

**Why this file exists.** The measurements behind PR #593's claims were
reported in prose with no reproducible query, timestamp, or environment
label. A reviewer correctly objected that the code *mechanisms* were
proven while the *quantities* remained externally asserted. This is the
durable artifact: exact SQL, exact output, exact metadata.

| | |
|---|---|
| Database | `neondb` on `hidden-mountain-87248164`, branch `main` (`br-crimson-frog-adr7g9gt`), endpoint `ep-cold-waterfall-adno3ao2` |
| Engine | PostgreSQL 17.10 |
| Access | Neon MCP `run_sql`, read-only SELECT. No writes. |
| Branch under review | `agent/finalize-neon-cpu-storage` @ `5da1a705` |
| DB size at measurement | 555 MB |

**These values move.** Every census below was run twice, ~7 hours apart,
and two of the three changed. Any figure quoted from this file must
carry its timestamp.

---

## Census A — how often a 10-minute poll is genuinely a no-change

This is the number that decides whether the preflight's skip path is
worth anything. It bounds the CPU benefit.

```sql
WITH windows AS (
  SELECT generate_series(date_trunc('hour', now() - interval '48 hours'),
                         date_trunc('hour', now()), interval '10 minutes') AS w
), ch AS (
  SELECT date_trunc('hour', modification_timestamp)
         + floor(extract(minute FROM modification_timestamp)/10)*interval '10 minutes' AS w
  FROM listings WHERE modification_timestamp > now() - interval '48 hours' GROUP BY 1
)
SELECT count(*) AS total_windows,
       count(*) FILTER (WHERE ch.w IS NULL) AS quiet_windows,
       round(100.0*count(*) FILTER (WHERE ch.w IS NULL)/count(*),1) AS pct_quiet
FROM windows w LEFT JOIN ch ON ch.w = w.w;
```

| Run (UTC) | total_windows | quiet_windows | pct_quiet |
|---|---|---|---|
| 2026-08-02 ~08:0x | 289 | 78 | **27.0** |
| 2026-08-02 15:08 | 289 | 84 | **29.1** |

**Limits of this measure — it is a PROXY, not the preflight's own signal:**

1. It reads `listings.modification_timestamp` in **our DB** (what we
   ingested), not the Cotality head the preflight actually probes.
2. It covers the **listing** stream only. The preflight also probes the
   **photo** stream, and any photo change is another reason to run — so
   adding it can only *reduce* the skip rate. **27-29% is an upper
   bound.**
3. A window with zero ingested changes is not proof Cotality was
   unchanged; it is consistent with it.

Hourly distribution (48h, first run): quietest 05:00 UTC (83%),
then 06:00 and 10:00 (58%), 07:00 (54%). Busiest hours skip rarely.

---

## Census B — diagnostic rows eligible for the approved 30-day purge

Uses the **exact allowlist** from
`lib/idx/diagnostic-recorder.ts` → `SYNC_DIAGNOSTIC_DEDUPE_ACTIONS`,
re-exported as `SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS`. Using "all rows
older than 30 days" instead would be a different, larger population
(84,346) and would NOT match what the cleanup deletes.

```sql
SELECT count(*) AS purgeable_rows,
       pg_size_pretty(sum(pg_column_size(a.*))::bigint) AS row_payload,
       round(100.0*count(*)/(SELECT count(*) FROM audit_events),1) AS pct_of_table
FROM audit_events a
WHERE a.action IN ('idx_sync_listing_upsert_failure','idx_sync_syncstate_failure')
  AND a.created_at < now() - interval '30 days';
```

| Run (UTC) | purgeable_rows | row_payload | pct_of_table |
|---|---|---|---|
| 2026-08-02 ~08:0x | 46,103 | 35 MB | 48.0 |
| 2026-08-02 15:08 | 46,103 | 35 MB | 47.9 |

At `DIAGNOSTIC_MAX_PER_INVOCATION = 10000`: **5 nightly runs** to drain.

---

## Census C — media tombstones the compactor will touch

Predicate copied verbatim from
`lib/retention/media-tombstone-compaction.ts`.

```sql
SELECT count(*) AS rows_matching,
       pg_size_pretty(sum(COALESCE(pg_column_size(media_url_original),0)
                        + COALESCE(pg_column_size(media_url_cached),0)
                        + COALESCE(pg_column_size(r2_key),0))::bigint) AS payload,
       count(DISTINCT r2_key) FILTER (WHERE r2_key IS NOT NULL) AS distinct_r2_objects
FROM listing_media
WHERE status='deleted' AND updated_at < now() - interval '30 days'
  AND (media_url_original IS NOT NULL OR media_url_cached IS NOT NULL
       OR r2_key IS NOT NULL OR width IS NOT NULL OR height IS NOT NULL);
```

| Run (UTC) | rows_matching | payload | distinct_r2_objects |
|---|---|---|---|
| 2026-08-02 ~08:0x | 17,035 | 4,420 kB | 15,270 |
| 2026-08-02 15:08 | 17,112 | 4,440 kB | 15,290 |

Grows as rows age past 30 days. At `MEDIA_TOMBSTONE_MAX_PER_INVOCATION
= 10000`: **2 nightly runs** to drain the current backlog.

### R2 side effect — quantified

`scripts/r2-orphan-cleanup.ts:121` builds its protected reference set
with **no `status` filter**:

```sql
SELECT DISTINCT r2_key FROM listing_media WHERE r2_key IS NOT NULL AND r2_key <> ''
```

So a soft-deleted row that retains `r2_key` currently shields its object
from orphan classification. Clearing it exposes **~15,290 distinct R2
objects** to a future orphan manifest. PR #593 deletes no R2 object, and
`docs/compliance/MEDIA-TOMBSTONE-RETENTION.md` discloses the coupling —
this file supplies the scale it omitted.

---

## What these numbers are NOT

**Payload removed is not bill reduced.** Census B is a DELETE and
Census C is an UPDATE. Both initially *increase* WAL, dead tuples, new
tuple versions, index churn and Neon retained history. Physical and
billed storage can only fall after autovacuum, page reuse or physical
compaction, and after history retention ages out.

The honest statement is: **~39 MB of logical payload becomes
reclaimable**, against a 555 MB database. Report logical payload,
physical relation size, retained history and billed storage as four
separate numbers, measured after the cleanup settles — never as one.

---

## Independently verified code facts (not quantities)

| Fact | Evidence |
|---|---|
| Prisma not statically reachable from the preflight | Full static import closure traced: 14 modules, zero hits. Only the dynamic `import()` on the non-skip branch reaches it |
| No heartbeat | `lastCompletedAt` declared `:47`, parsed `:130`, written `:385`, **never read** in `decideOneCyclePreflight` |
| 7 fail-open branches, 1 skip branch | `one-cycle-preflight.ts:245-328` |
| Upstash configured in Production | `vercel env ls production` from the linked repo — both vars, all environments, 141d |
| `/api/listings` caches only the count | `route.ts:415` wraps `count()`; `:333` `findMany` live; `:105` process-local `Map`; `:363` `raw_data: true`. Line 97 admits it |
| `PublicListingDTO` is JSON-safe | Zero `Decimal`/`BigInt`/`Date` in the interface |
| #523 cause was Upstash-no-store-in-ISR | PR #528 body, verbatim — **not** the Decimal/BigInt serialization the code comments claim |

## Exact-head CI status at `5da1a705`

`pr-check` **fails**. Jest, type-check, RLS validator, UCBA audit, CRM
tests and form-mapping all **pass**; the single failing step is
**`CI compliance check`** (REBNY UCBA Art. I §6 — no orchestrator
found). `REBNY display compliance audit` and `Build` are **skipped**
because the job halts there. `npm run build` was verified **locally**
(exit 0); CI has never built this branch.
