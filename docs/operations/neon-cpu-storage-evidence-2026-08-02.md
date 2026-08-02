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
| Branch under review | `agent/finalize-neon-cpu-storage` @ `2f695234` (heartbeat added; see Census D) |
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

> **Corrected 2026-08-02.** This table previously carried a "No heartbeat"
> row. That was true at `5da1a705` and became false at `2f695234`; it is
> replaced below and now agrees with Census D and the shipped code.

| Fact | Evidence |
|---|---|
| Prisma not statically reachable from the preflight | Full static import closure traced: 14 modules, zero hits. Only the dynamic `import()` on the non-skip branch reaches it |
| **One-hour heartbeat implemented** (`2f695234`) | `lastSuccessfulFullCycleAt` is READ by `decideOneCyclePreflight` and advances only after a `success && complete` cycle. Bound is a literal `60 * 60`, no env override. Forces a run on missing / null / malformed / **future** / expired. Reason `freshness_heartbeat_due`. Was previously absent — `lastCompletedAt` was written but never read, which is what the REBNY check caught. |
| 7 fail-open branches, 1 skip branch | `one-cycle-preflight.ts:245-328` |
| Upstash configured in Production | `vercel env ls production` from the linked repo — both vars, all environments, 141d |
| `/api/listings` caches only the count | `route.ts:415` wraps `count()`; `:333` `findMany` live; `:105` process-local `Map`; `:363` `raw_data: true`. Line 97 admits it |
| `PublicListingDTO` is JSON-safe | Zero `Decimal`/`BigInt`/`Date` in the interface |
| #523 cause was Upstash-no-store-in-ISR | PR #528 body, verbatim — **not** the Decimal/BigInt serialization the code comments claim |

## Census D — calibrating the freshness heartbeat

The heartbeat interval was chosen from the distribution of NATURAL quiet
runs, not by judgement. If the bound sits below normal quiet, it fires
during legitimate silence and erodes the whole saving.

```sql
WITH w AS (
  SELECT generate_series(date_trunc('hour', now() - interval '7 days'),
                         date_trunc('hour', now()), interval '10 minutes') AS ts
), ch AS (
  SELECT date_trunc('hour', modification_timestamp)
         + floor(extract(minute FROM modification_timestamp)/10)*interval '10 minutes' AS ts
  FROM listings WHERE modification_timestamp > now() - interval '7 days' GROUP BY 1
), flagged AS (
  SELECT w.ts, (ch.ts IS NULL) AS quiet FROM w LEFT JOIN ch ON ch.ts = w.ts
), grp AS (
  SELECT ts, quiet,
         row_number() OVER (ORDER BY ts)
         - row_number() OVER (PARTITION BY quiet ORDER BY ts) AS run_id
  FROM flagged
), runs AS (
  SELECT run_id, count(*) AS windows_in_run FROM grp WHERE quiet GROUP BY run_id
)
SELECT count(*) AS quiet_runs,
       max(windows_in_run)*10 AS longest_min,
       round(avg(windows_in_run)*10,1) AS avg_min,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY windows_in_run)*10 AS p95_min,
       count(*) FILTER (WHERE windows_in_run*10 >= 60)  AS runs_ge_60min,
       count(*) FILTER (WHERE windows_in_run*10 >= 120) AS runs_ge_120min,
       count(*) FILTER (WHERE windows_in_run*10 >= 240) AS runs_ge_240min
FROM runs;
```

Run 2026-08-02, 7-day window:

| quiet_runs | longest | avg | p95 | ≥60 min | ≥120 min | ≥240 min |
|---|---|---|---|---|---|---|
| 147 | 120 min | 18.7 min | 40 min | **6 (4%)** | 1 | **0** |

**Conclusion — one hour.** It sits above p95 (40 min), so ~96% of genuine
quiet periods are never interrupted, and it fires in only 4% of quiet
runs, while leaving 24x margin under the REBNY 24-hour bound.

- **30 min would be too short.** With avg 18.7 and p95 40, it would fire
  through a large share of normal quiet and erode the saving.
- **2 h would be too long.** Only one run in seven days reached it, so it
  gains almost nothing — while doubling how long a false-unchanged defect
  could persist undetected.

Same caveats as Census A: this is our ingested `modification_timestamp`,
a proxy for the Cotality head, listing stream only.

**Cost posture.** Worst case on a totally quiet system, the heartbeat
allows at most 24 forced cycles/day instead of 144 ten-minute wakes. On
the 5-minute / 0.25 CU tail assumption that is roughly 15 CU-hours per
30-day month versus ~90. **A planning estimate, not a billing guarantee** —
real cycle duration, overlap and actual Neon active intervals must be
measured after deployment.

---

## Exact-head CI status at `2f695234`

`pr-check` **passes**. Every previously blocked or skipped step now runs:

| Step | Before (`5da1a705`) | Now (`2f695234`) |
|---|---|---|
| Jest tests | success | **success** |
| CI compliance check | **failure** | **success** |
| REBNY display compliance audit | skipped | **success** |
| Build | **skipped** | **success** |

The compliance check now validates the heartbeat CONTRACT rather than the
route name. Adversarially verified — each tamper was blocked:

| Tamper | Result |
|---|---|
| bound widened to 6 h | FAIL — "exceeds the approved 3600s maximum" |
| stop reading the timestamp | FAIL — "the decision never READS lastSuccessfulFullCycleAt" |
| drop the future-timestamp guard | FAIL — "a FUTURE heartbeat does not force a cycle" |
