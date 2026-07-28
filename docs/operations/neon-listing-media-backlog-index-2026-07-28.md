# Neon `listing_media` R2-backlog partial index — deployment record (2026-07-28)

> Durable audit record for the production index created on `hidden-mountain-87248164`
> branch `main` (`br-crimson-frog-adr7g9gt`) on 2026-07-28.
> **Scope: index only.** No data change, no media deletion, no R2 mutation, no compute
> resize, no existing index dropped, no extension installed, no cadence change.

## 1. Index definition (exactly as deployed)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS listing_media_r2_backlog_id_idx
ON listing_media (id)
WHERE r2_key IS NULL
   OR media_url_cached IS NULL;
```

Verified definition read back from `pg_get_indexdef`:

```sql
CREATE INDEX listing_media_r2_backlog_id_idx ON public.listing_media
  USING btree (id) WHERE ((r2_key IS NULL) OR (media_url_cached IS NULL))
```

Predicate is immutable — no `now()` or other time-dependent expression.

## 2. Identity

| item | value |
|---|---|
| Neon project | `hidden-mountain-87248164` ("neon-green-school") |
| Branch | `main` / `br-crimson-frog-adr7g9gt` |
| Compute | `ep-cold-waterfall-adno3ao2`, 0.25 CU fixed |
| **Production deployment SHA** | `ccfb4e85df61c79d9eaa9762a31d3e24588f0eef` |
| **Production deployment ID** | `dpl_4u2mFqKdfQJWCdNHRzZeWhRn28LW` |
| Pre-create baseline | **2026-07-28T02:44:08.301Z** |
| **Index created + confirmed valid** | **2026-07-28T02:45:22.752Z** |
| Index state at confirmation | `indisvalid=t`, `indisready=t`, `indislive=t` |
| Index size | 272 kB |
| Indexed rows | 11,453 of 320,883 (3.6%) |
| `listing_media` size | 208 MB |

Audited source files were verified byte-identical between the local checkout and the
deployed SHA (`git diff 262b6693 ccfb4e85` empty across `media-sync.ts`, `sync.ts`,
`raw-data-keep-fields.ts`, `write-suppression.ts`, `fetch.ts`).

## 3. Why — the measured problem

Three `listing_media` queries run per media-sync cycle:

| id | source | shape |
|---|---|---|
| Q1 | `buildR2BacklogWhere` — `media-sync.ts:1791` | `ORDER BY id LIMIT 60` |
| Q2 | `buildR2ParkedRecoveryWhere` — `media-sync.ts:~1870` | `r2_attempts = 8`, `ORDER BY r2_last_attempt_at, id LIMIT 5` |
| Q3 | bounded remaining probe — `media-sync.ts:3704` | **no `ORDER BY`**, `LIMIT 2001` |

**Q3 was A sequential-scan source (evidence boundary below).** With no `ORDER BY`, the planner chose a
`Parallel Seq Scan` with 2 workers → **3 `seq_scan` initiations and one full
320,883-row pass per execution**. This reconciles exactly with the production
delta measured over two independent cycles (W1 01:50, W3 02:10), both identical:

```
seq_scan      +6        (measured, pre-index cycle windows W1 + W3)
seq_tup_read  +641,766  (measured, pre-index cycle windows W1 + W3)
```

**Evidence boundary (owner correction).** The `+6` / `+641,766` figures are MEASURED
production deltas. Q3 was directly plan-confirmed as ONE parallel sequential table pass
with three participants, so Q3 explains one `+3` scan-initiation / ~320,883-row component.
The second scan-producing component within the same media-sync execution was NOT captured
pre-index and MUST NOT be assigned Q3's worker count or plan shape. Post-index production
measurement showed `seq_scan +0` and `seq_tup_read +0` across the three observed cycles.

Q1 never produced a sequential scan — its `ORDER BY id` made the planner walk
`listing_media_pkey`, filtering 317,814 rows inline.

## 4. Branch before/after evidence

Isolated branch `br-flat-night-adgoihlq` (compute `ep-red-boat-adrome91`, 0.25 CU),
forked from `br-crimson-frog-adr7g9gt`, created 2026-07-28T02:21:47Z.

| query | index state | scan node on `listing_media` | rows removed | buffers hit/read | rows out | exec ms |
|---|---|---|---|---|---|---|
| Q1 | none (warm) | Index Scan `pkey` | 317,814 | 185,106 / 21,683 | 0 | 294.672 |
| Q1 | `(status, media_key)` | Index Scan `pkey` — **unused** | 317,814 | 185,873 / 20,916 | 0 | 274.419 |
| Q1 | `(id) WHERE …` | Index Scan `…backlog_id_idx` | 8,384 | 14,671 / 142 | 0 | **14.537** |
| Q3 | none | **Parallel Seq Scan x3** | 317,814 | 4,037 / 21,360 | 0 | 1,431.144 |
| Q3 | `(id) WHERE …` | Bitmap Index + Bitmap Heap | 8,384 | 4,131 / 5,659 | 0 | **37.867** |
| Q3 | `(id) WHERE …` run 2 | Bitmap Index + Bitmap Heap | 8,384 | — | 0 | 851.127 |
| Q3 | `(id) WHERE …` run 3 | Bitmap Index + Bitmap Heap | 8,384 | 4,264 / 5,526 | 0 | **27.269** |
| Q2 | `(id) WHERE …` | Bitmap Index + Bitmap Heap | 11,436 | 40 / 3,903 | 0 | 664.084 |

Q3 with index, three warm runs: **27.3 / 37.9 / 851.1 ms**, median **37.9 ms**.
Timing range is wide because an ephemeral 0.25 CU branch has a cold local file cache;
the **structural** metrics (scan type, rows filtered, buffer reads) were stable across
all three runs and are the reliable signal.

**Rejected candidate:** `(status, media_key) WHERE r2_key IS NULL OR media_url_cached IS NULL`
was never chosen by the planner for Q1 — it cannot satisfy `ORDER BY id`, so using it
would require sorting all matches. Rejected for Q1; untested against Q2/Q3.

## 5. Acceptance gates (all passed before deployment)

| gate | result |
|---|---|
| Q1 and Q3 return identical results before/after | PASS — 0 rows every run |
| Q1 and Q3 materially improve | PASS — filtered rows 317,814 → 8,384 (37.9x); buffer reads 21,360 → 5,526 (3.9x) |
| Q3 no longer sequentially scans `listing_media` | PASS — 3 consecutive runs |
| Q2 unchanged or improved | PASS — uses index, no seq scan |
| Prisma SQL materially matches tested SQL | PASS by structural proof (§6) |
| No regression or semantic change | PASS |

## 6. SQL-equivalence basis

The tested SQL is a hand translation of `buildR2BacklogWhere` +
`buildR2ParkedRecoveryWhere` + `buildR2MirrorPolicyMediaWhere` +
`buildMallanOwnedListingWhere` + `buildSearchDisplayWhere`, **not Prisma-emitted SQL**.

Every `listing_media` predicate is a mechanical 1:1 mapping (`{not: null}` → `IS NOT NULL`,
`OR: [...]` → parenthesised `OR`, scalar equality → `=`). Empirical corroboration: the
translated SQL returns exactly **3,069** rows at the `listing_media` scan node, matching
the independently measured production count for the same predicate. The partial index
touches only `listing_media` columns, so the relation-filter form (EXISTS vs JOIN) does
not affect the access path — and the observed baseline plan already converged from
`EXISTS` to a hash-join shape, showing both forms land in the same plan family.

**Residual risk:** exact Prisma-emitted SQL was not captured. Flagged, not eliminated.

## 7. Production verification

Plan confirmed on production immediately post-creation:

```
Bitmap Heap Scan on listing_media lm (actual rows=3069)
  Recheck Cond: ((r2_key IS NULL) OR (media_url_cached IS NULL))
  Rows Removed by Filter: 8384
  ->  Bitmap Index Scan on listing_media_r2_backlog_id_idx (actual rows=11453)
Execution Time: 28.367 ms
```

No sequential scan on `listing_media`. 0 rows returned — identical to pre-index.

Post-deployment cycle measurements: see §9.

## 8. Rollback

Removes only the new index. Nothing else is affected.

```sql
DROP INDEX CONCURRENTLY IF EXISTS listing_media_r2_backlog_id_idx;
```

Trigger rollback if: the index becomes invalid, query results differ pre/post,
a job failure or lock issue appears, or a material write regression is observed.

## 9. Post-deployment measurements — three cycles (02:50, 03:00, 03:10 UTC)

Window 2026-07-28T02:44:08.301Z (pre-create) → 2026-07-28T03:13:35.980Z.

| metric | pre-index per cycle | **post-index, 3-cycle window** |
|---|---|---|
| `listing_media` seq_scan | +6 | **+0 (total, all 3 cycles)** |
| `listing_media` seq_tup_read | +641,766 | **+0 (total)** |
| new index idx_scan | n/a | 1 → 10 (in use) |
| `listing_media` n_tup_upd | +20 / +102 / 0 | +270 (see note below) |
| index validity | n/a | `indisvalid = true` throughout |
| index size | n/a | 272 kB (stable) |

`lm_seq_scan` read **199,412 at 02:49:54, 02:53:21 and 03:13:35 — identical.**
Sequential scanning of `listing_media` is fully eliminated, not merely reduced.

### Refresh invocation count (from Vercel logs, NOT index statistics)

| cycle | one-cycle invocations | media-sync run_id | duration | exit |
|---|---|---|---|---|
| 02:40 (pre-index) | 1 | `25c30495-…07868` | 13,583 ms | completed / ok |
| 02:50 (post-index) | 1 | `c7df1c3f-…4b600` | **10,850 ms** | completed / ok |
| 03:00 + 03:10 | **2 total (1 each)** | — | — | 200 |

One scheduled invocation, one `run_start`, one `run_end` per ten-minute cycle.
**No duplicate execution, no retry path, no second deployment path.** Cadence intact.

`idx_scan` was NOT used to infer invocation count — it counts scan initiations only.

### Job health

All invocations HTTP 200. `exit_reason: "completed"`, `status: "ok"`. No lock error,
no write regression, no failed job across the window.

## 10. Remaining lifecycle defect — OPS-023 (NOT fixed by this index)

> Canonical definition: **OPS-023** in `docs/PLATFORM-ISSUE-REGISTRY.md`. That registry row
> is the single source of truth; the summary below is a pointer, not a second definition.
> GitHub #580 is a non-canonical mirror.

Rejection breakdown of the 3,069 **pre-policy backlog-shaped candidates** measured on
the isolated branch:

| condition | count |
|---|---|
| no `listings` row | 0 |
| media type Photo / FloorPlan | 2,469 / 600 |
| fails Mallan-ownership branch | **3,069 (100%)** |
| fails `idx_display_yn` | 61 |
| fails `owner_opt_out` / `participant_only` / `internet_entire_listing_display_yn` | 0 / 0 / 0 |
| **listing status not Active/ActiveUnderContract/ComingSoon** | **2,647 (86%)** |
| **final fully eligible** | **0** |

**3,069 pre-policy backlog-shaped candidates were currently ineligible in the measured
production snapshot** — zero currently fully eligible. 2,647 of 3,069 are tied to listings
outside the active-status set, yet their `listing_media` rows stay `status='active'` with
`r2_key IS NULL` indefinitely. The index makes the empty answer cheap; it does not stop
stale rows accumulating in the candidate set.

Tracked as **OPS-023**. This index deployment does not block or depend on it. No R2 deletion
is authorized. Rows must NOT be terminally marked merely for being currently off-market —
they may become eligible again.

## 11. Explicitly out of scope

Worker-distribution analysis, statistics-counter inception, additional sampling windows,
R2 orphan counts, `r2_attempts > 9` anomaly (60 active rows, clusters at 107–112), the
residual `Seq Scan on listings` inside Q3 (9,728 of 23,791 rows matched), and the
`raw_data.PhotosChangeTimestamp` work (issue #577). All separate follow-ups.

---

## 12. Wording precision (owner corrections, 2026-07-28)

These supersede any looser phrasing earlier in this document.

**Scan attribution.** Two scan-producing queries occurred within ONE media-sync
execution. **Q3 was directly confirmed as a parallel sequential scan** by a captured
plan. The second scan-producing query was NOT separately plan-captured before the index
was created, so it is not asserted here to have been a parallel sequential scan.

**On the +270 `listing_media` writes in §9.** These show that `listing_media` writes
continued after index creation, demonstrating the media workflow was not globally
stopped. They do **not** prove successful eligible R2 mirroring — no runtime
success/upload counters were collected, and the measured eligible backlog was zero (§10).

**On invocation counting.** `listing_media_r2_backlog_id_idx.idx_scan` confirms the index
is being used. It counts index scans initiated, not application/job executions, and was
NOT used to derive the refresh invocation count. That count comes from Vercel invocation
records and `media_sync_cursor` run_start/run_end events (§9).

**On overlap shedding.** No cycle overran into the next during the observation window, so
the `skipped_overlap` path was never exercised. The advisory locks
(`machine-claim.ts:72`, `media-sync.ts:3582`) are present and non-blocking, but shedding
behavior was **not** observed in production and is therefore not claimed as verified.

## 13. Operational SQL record (idempotent)

Apply:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS listing_media_r2_backlog_id_idx
ON listing_media (id)
WHERE r2_key IS NULL
   OR media_url_cached IS NULL;
```

Rollback:

```sql
DROP INDEX CONCURRENTLY IF EXISTS listing_media_r2_backlog_id_idx;
```

Both statements are idempotent and must run OUTSIDE a transaction block
(`CONCURRENTLY` cannot run inside one). Neither touches data, R2, compute sizing,
cadence, or any other index.
