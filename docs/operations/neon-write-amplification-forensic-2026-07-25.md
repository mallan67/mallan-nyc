# Neon write-amplification forensic (2026-07-25)

> Read-only production forensic into "Neon compute and storage keep increasing."
> Target: canonical prod `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` /
> branch `main` (`br-crimson-frog-adr7g9gt`). No cron was triggered; no code or
> production setting was changed to gather this. Every claim is labelled
> **PROVEN** / **REFUTED** / **UNRESOLVED** / **UNMEASURED**.
>
> This document is Commit 1 of the single evidence-only branch
> `fix/neon-write-amplification-2026-07-25`. It supersedes the looser conclusions
> in the chat forensic; where the two differ, this file is authoritative.

## 0. Verdict

The ongoing problem is **PostgreSQL tuple recreation from UPDATEs** — new row
versions, WAL, dead tuples, index churn and history — **not** duplicate logical
rows and **not** two cron pipelines recreating the same listing. The correct area
was found; several first-pass causal claims were stronger than the evidence and
are corrected below.

## 1. Ruled OUT (with evidence)

| Hypothesis | Result | Evidence |
|---|---|---|
| Duplicate rows drive recreation | **REFUTED** | 0 duplicate `listing_id` in `listings`; 0 in `listing_search_projection`; 0 duplicate `(listing_id, media_key)` in `listing_media`. (The 298,826 "duplicate" `resource_record_key` rows are simply multiple photos sharing one parent-listing key — expected, not a bug.) |
| Two cron pipelines double-write listings | **REFUTED** | One Cycle → `runIdxSyncMember` → `syncListings` **once**. The second upsert block (`sync.ts:2000`, in `syncAgentHistory`) is reachable **only** from the manual `/api/idx/sync-historical` route, which is **not** scheduled. |
| `sync_errors` growth | **REFUTED** | 0 rows, 40 kB. |

## 2. Corrected causal claims (the three required corrections)

1. **reset-sync did NOT cause the 89,001 historical deletes.**
   `SELECT ... FROM audit_events WHERE action='listings_reset_sync'` returns **zero rows**.
   The correct wording: *no completed audited reset-sync execution was found; the
   source of the 89,001 historical deletes remains **UNRESOLVED**; no current
   scheduled bulk-delete path was found.* (Absence of the audit row does not prove
   the route never ran — it writes its audit event only after delete+fetch+reload
   completes, so a crash mid-run would leave no row. But there is no evidence it
   ran, and no live path reproduces bulk listing deletes.)

2. **The ~10,000/day unattributed media writes are NOT "delivery refreshes."**
   Correct wording: *approximately 10,000 media physical writes/day were observed,
   but their split among material changes, delivery-URL refreshes, inserts and
   tombstones **cannot be determined from current durable telemetry**.* The code
   distinguishes these causes (`deliveryUrlRefreshed`, `suppressedUrlRotationOnly`
   in `media-sync.ts`), but the persisted `media_sync_cron` payload does not emit
   them. Commit 2 adds them.

3. **`raw_data_only` is a confirmed substantial amplifier, not yet the confirmed
   primary driver.** Measured: **2,354 `raw_data_only` writes out of 7,763 listing
   updates (~30%) over 2 days.** Substantial, but the remaining listing changes and
   the unattributed media writes may generate more WAL. The next step identifies the
   exact changed keys — it does **not** suppress the whole category.

## 3. What is genuinely, monotonically growing — PROVEN

- **`audit_events` is append-only** (`n_tup_ins` 89,867, `n_tup_upd` 0, `n_tup_del` 1;
  last autovacuum 2026-06-02). `data-retention` purges only at **>2 years**
  (`route.ts:76-84`); the oldest row is 2026-03-15, so **nothing is purged until 2028**.
  Every One Cycle writes **5 rows** (`one_cycle_started`, `idx_sync`, `idx_sync_cron`,
  `media_sync_cron`, `one_cycle_run`) — proven by the Snapshot A→B delta (+5). At
  144 cycles/day that is a ~720-row/day floor.
- **Frozen dead weight:** `idx_sync_listing_upsert_failure` = 46,011 rows / **30 MB**,
  entirely within 2026-05-21 → 06-13 (an old incident) — half of `audit_events`,
  no longer growing.
- **`listing_media` soft-`deleted` rows:** 28,664 rows physically retained, pruned by
  no cron.

## 4. Primary mechanism — PROVEN (mechanism), scope still being quantified

`sync.ts` includes `raw_data` in the material-change comparison (`:722/:737`) and
**deliberately writes the row for provenance-only changes** (`:780` — "a source
revision must persist"), while the projection layer correctly suppresses the
search/cache work. So a Trestle re-emit whose only delta is a ticking `raw_data`
produces a full-row + TOAST rewrite with **no** user-visible change. Sample cycle
20:20: `listings rows_updated=75`, `listing_change_reasons.raw_data_only=75`,
`projections rows_updated=0` (all suppressed downstream). This is the 1.4M lifetime
`listings` updates and most of the base-table WAL.

**The connected duplication that makes each rewrite heavy** — the same listing is
materialised across four connected stores, all re-touched per material sync:

| Store | Size | Note |
|---|---|---|
| `raw_data` (full Trestle echo) | 68 MB | rewritten every sync (it ticks) |
| Legacy JSON: `features` 24 MB + `address` 7 MB + `media` 5 MB | 36 MB | `media` mostly retired (only 6,239 listings) |
| ~40 typed columns | heap | re-derived |
| `listing_search_projection` | 75 MB table | already suppresses when search-invisible |

## 5. Measured evidence (raw)

### 5.1 Storage — single snapshots (trend NOT proven — see §7)
- `pg_database_size` (logical): **535 MB** · `synthetic_storage_size` (billed): **603 MB** · branch API `logical_size`: 583 MB.
- Top tables: `listing_media` 207 MB (150 heap / 56 idx) · `listings` 167 MB (46 heap / 7 idx / **114 MB TOAST**) · `listing_search_projection` 75 MB · `audit_events` 59 MB.

### 5.2 Lifetime write counts (`pg_stat_user_tables`, `stats_reset` = null)
| table | n_tup_ins | n_tup_upd | n_tup_del | live | dead |
|---|---|---|---|---|---|
| listing_media | 338,692 | 3,403,525 | 19,878 | 318,481 | 53,337 |
| listings | 112,681 | 1,402,958 | 89,001 | 23,678 | 3,536 |
| listing_search_projection | 112,608 | 315,012 | 88,930 | 23,678 | 2,696 |
| audit_events | 89,867 | 0 | 1 | 89,867 | 1 |

### 5.3 IDX listing writes by reason — 153 cycles / ~2 days (durable audit JSONB)
listings_updated **7,763** · inserted 149 · suppressed 123 · **raw_data_only 2,354** ·
modts_only 68 · other 73 · status 26 · price 10 · display 6 · attribution 5 · address 2 · media_identity 0.

### 5.4 Media writes — 95 cycles / ~1 day (durable audit JSONB)
checked 64,673 · **physical writes (rows_updated) 26,821** · updated_changed **6,832** ·
inserted 6,913 · skipped_unchanged 40,386 · tombstoned_vanished 2,534 · failed 0 ·
`mismatch_media_url_exact` 57,760 (≈ every row — URL rotates; a **diagnostic**, not a write cause).
**Unattributed ≈ 10,542** (26,821 − 6,832 − 6,913 − 2,534) — cause split **UNMEASURED** until Commit 2 emits `delivery_url_refreshed` / `suppressed_url_rotation_only`.

### 5.5 One natural cycle (Snapshot A 20:28:57 → B 20:36:47, crossing the 20:30 fire)
+5 audit rows · +4 listing updates · +101 media updates · +0 projection updates · **~118 KB WAL** · `pg_database_size` +8 kB (noise). A *light* cycle; daytime cycles reach 75 listing rewrites / 200+ media updates.

### 5.6 Neon consumption framing
`consumption_period` = 2026-07-01 → 08-01 (**resets monthly**). Branch cumulative
counters (compute_time, active_time, data_transfer) flush in arrears (a +767 s
compute jump appeared between two reads 7 min apart), so they cannot yield a clean
short-window rate. Consumption-history API is Scale-plan-gated (unavailable on Launch).

## 6. UNRESOLVED
- **Source of the 89,001 `listings` deletes** (and 88,930 projection deletes).
  Not reset-sync (audit-empty), not `feed-reconcile` (no delete path — only a
  Trestle `$filter`), not the `upsert` sync path. Likely pre-dates the 2026-06-02
  cross-project repoint or an older sync implementation. Not ongoing (current
  row-recreate ≈ `feed_reconcile_orphan_created` ~15/day).

## 7. UNMEASURED (needs instrumentation / your input)
- **The exact Neon graph that is increasing.** 535 MB / 603 MB are single snapshots;
  they do not establish a trend, and comparing to NEON.md's older figure mixes metric
  definitions. Need the named metric + time range (ideally a screenshot: title, range,
  unit, current amount, plan/usage section).
- **Media physical-write cause split** (`delivery_url_refreshed` etc.) — Commit 2.
- **The exact `raw_data` keys changing** in `raw_data_only` writes — Commit 2 (flag-gated
  runtime-log histogram; NOT stored in `audit_events`).
- **WAL / dead-tuple deltas per cycle across 20 cycles** — needs live paired snapshots.

## 8. Danger note (separate from evidence work)
`app/api/crm/listings/reset-sync` is broker-auth + write-guarded, but on allow it
deletes **all** listings + client-listing-actions + showings + comments + price
history + marketing activity + protected periods, then reloads a limited set. It
describes itself as one-time-use. **No completed audited execution was found.**
Removal is a **separate behavior change** (not part of Commit 2) requiring review
after Phase-1 evidence.

## 9. Plan (single branch, evidence-first)
- **Commit 1 (this doc).**
- **Commit 2 (additive telemetry only, no behavior change):** emit compact numeric
  media cause counters into `media_sync_cron`; emit a flag-gated, top-20,
  names-and-counts-only `raw_data` changed-key histogram to **runtime logs** (never
  `audit_events`); capture **≥3 natural cycles** (no manual trigger).
- **STOP after Phase 1 and report raw evidence.** No suppression, cleanup, route
  deletion or retention change until Maya reviews the measured causes.
