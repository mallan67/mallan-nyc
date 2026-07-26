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
>
> **This is EVIDENCE for existing registry issues, NOT a new issue ID.** Canonical
> status lives in `docs/PLATFORM-ISSUE-REGISTRY.md`: **OPS-010A** (recurring Neon
> WAL/history write-amplification from listing/media sync) and **OPS-010** (DB/audit
> growth: `audit_events` append-only, `listing_media` tombstones). This file is the
> attached measurement detail those rows reference.

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

1. **No completed audited reset-sync execution was found; the historical delete
   source remains UNRESOLVED.**
   `SELECT ... FROM audit_events WHERE action='listings_reset_sync'` returns **zero rows**.
   This does NOT prove the route never ran — it writes its audit event only after
   delete+fetch+reload completes, so a crash mid-run would leave no row. What is
   proven: no *completed audited* run, no current scheduled bulk-delete path
   (`feed-reconcile` has none; the live `upsert` path never deletes). The source of
   the 89,001 deletes is unresolved; no current scheduled path performs bulk listing
   deletion (static review does not prove an unscheduled/manual route cannot).

2. **The ~10,000/day unattributed media writes are NOT "delivery refreshes."**
   Correct wording: *approximately 10,000 media physical writes/day were observed,
   but their split among material changes, delivery-URL refreshes, inserts and
   tombstones **cannot be determined from current durable telemetry**.* The code
   distinguishes these causes in `media-sync.ts` (`deliveryUrlRefreshed`, plus — after
   the Codex-P2 split — `suppressedUrlSignatureRotation` and
   `suppressedUrlIdentityChanged`), but the *pre-PR-#569* `media_sync_cron` payload did
   not emit them. This PR adds them (`delivery_url_refreshed`,
   `suppressed_url_signature_rotation`, `suppressed_url_identity_changed`,
   `write_failures`).

3. **`raw_data_only` is a confirmed substantial amplifier, not yet the confirmed
   primary driver.** Measured: **2,354 `raw_data_only` writes out of 7,763 listing
   updates (~30%) over 2 days.** Substantial, but the remaining listing changes and
   the unattributed media writes may generate more WAL. The next step identifies the
   exact changed keys — it does **not** suppress the whole category.

## 3. What accumulates — PROVEN (with the correct bounds)

- **`audit_events` is append-only** (`n_tup_ins` 89,867, `n_tup_upd` 0, `n_tup_del` 1;
  last autovacuum 2026-06-02). **NON-exempt actions are BOUNDED by rolling 2-year retention**:
  `data-retention` deletes rows >2 years old EXCEPT `email_unsubscribed` (`route.ts:66-83`);
  oldest row 2026-03-15 → pre-2028 fill phase, so the non-exempt bulk will plateau at ~2 years.
  **BUT `email_unsubscribed` is purge-EXEMPT and create-only** (`recordEmailUnsubscribe` →
  `auditEvent.create()`, no dedup) **→ `audit_events` as a whole is NOT strictly bounded** (that
  subset grows permanently; low-volume CAN-SPAM suppression ledger). Genuinely unbounded
  tables: `listing_media` soft-deleted tombstones (28,664, never purged) + the
  `email_unsubscribed` audit subset.
  One MEASURED successful cycle inserted **5 rows** (`one_cycle_started`, `idx_sync`,
  `idx_sync_cron`, `media_sync_cron`, `one_cycle_run`) — Snapshot A→B delta (+5). The
  daily rate is **measured, not a fixed floor**: `audit_events` inserts/day went
  **07-23 = 199 → 07-25 = 566 (≈2.8×)** after the `*/10` One Cycle switch on 07-24 —
  measured **correlation**, not isolated causation (other cron activity also varies), and
  the per-cycle composition VARIES (07-25: 89 One Cycle runs but 103 `idx_sync_cron`,
  96 `media_sync_cron` — not a uniform 5/cycle; skipped/partial/chain-stopped cycles
  write fewer).
- **Frozen dead weight:** `idx_sync_listing_upsert_failure` = 46,011 rows / **30 MB**,
  entirely within 2026-05-21 → 06-13 (an old incident) — half of `audit_events`,
  no longer growing.
- **`listing_media` soft-`deleted` rows:** 28,664 rows physically retained, pruned by
  no cron.

## 4. Confirmed write-amplification mechanism — PROVEN (mechanism), scope still being quantified

`sync.ts` includes `raw_data` in the material-change comparison (`:722/:737`) and
**deliberately writes the row for provenance-only changes** (`:780` — "a source
revision must persist"), while the projection layer correctly suppresses the
search/cache work. So a Trestle re-emit whose only delta is a ticking `raw_data`
produces a full-row + TOAST rewrite in which the **search projection was suppressed**
(no search-visible change) — but whether that raw_data delta affected another public-
detail or compliance consumer is **UNMEASURED** until the changed-key histogram runs
(raw_data feeds the public DTO Trestle-direct path). Sample cycle 20:20:
`listings rows_updated=75`, `listing_change_reasons.raw_data_only=75`,
`projections rows_updated=0` (all suppressed downstream). This is a **confirmed recent**
source of listing write-amplification (~30% of recent listing updates, §5.3). Its share
of the **1.4M lifetime** `listings` updates and of lifetime WAL is **UNMEASURED** — not
attributed here.

**The connected duplication that makes each rewrite heavy** — the same listing is
materialised across four connected stores. They are **NOT all physically rewritten** on
every material sync (see Note): the projection is frequently suppressed, and legacy
`listings.media` JSON is omitted on normal incremental updates (`useExpandMedia=false`).
In the cited `raw_data_only` cases, only the **base `listings` row** is confirmed to write:

| Store | Size | Note |
|---|---|---|
| `raw_data` (retained Trestle **keep-set, 110 fields** — NOT a full echo; `raw-data-keep-fields.ts`) | 68 MB | rewritten on the base row when material; confirmed write in `raw_data_only` cases |
| Legacy JSON: `features` 24 MB + `address` 7 MB + `media` 5 MB | 36 MB | `media` mostly retired (only 6,239 listings); omitted on incremental updates |
| ~40 typed columns | heap | re-derived on the base row |
| `listing_search_projection` | 75 MB table | **frequently suppressed** when search-invisible (often NOT rewritten) |

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
**Unattributed ≈ 10,542** (26,821 − 6,832 − 6,913 − 2,534) — a **derived residual, not a proven single cause**. Its split (delivery-URL refresh vs other) stays **UNMEASURED** until the Commit-2 counters (`delivery_url_refreshed` / `suppressed_url_signature_rotation` / `suppressed_url_identity_changed`, now emitted but not present on these historical rows) are captured over live cycles.

### 5.5 One natural cycle (Snapshot A 20:28:57 → B 20:36:47, crossing the 20:30 fire)
+5 audit rows · +4 listing updates · +101 media updates · +0 projection updates · **~118 KB WAL** · `pg_database_size` +8 kB (noise). A *light* cycle; daytime cycles reach 75 listing rewrites / 200+ media updates.

### 5.6 Neon consumption framing
`consumption_period` = 2026-07-01 → 08-01 (**resets monthly**). Branch cumulative
counters (compute_time, active_time, data_transfer) flush in arrears (a +767 s
compute jump appeared between two reads 7 min apart), so they cannot yield a clean
short-window rate. Consumption-history API is Scale-plan-gated (unavailable on Launch).

## 6. UNRESOLVED
- **Source of the 89,001 `listings` deletes** (and 88,930 projection deletes) is
  **UNRESOLVED.** PROVEN: **no completed audited `reset-sync` execution**
  (`listings_reset_sync` audit = 0 rows) — but that route writes its audit only AFTER
  delete+fetch+reload finishes, so a crash after the deletes would leave no row; this
  rules out a *completed audited* run, **NOT** that the route never started. Also PROVEN
  by code: `feed-reconcile` has no listing-delete path (only a Trestle `$filter`), and the
  live `upsert` sync path never deletes. No current scheduled listing bulk-delete path
  was identified. **The source and timing of the historical delete counters remain
  unresolved** (no dated theory is asserted — static review does not exclude an
  unscheduled/manual/historical route). Ongoing row-recreate observed ≈
  `feed_reconcile_orphan_created` ~15/day.

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
- **Commit 2 (additive telemetry only, no behavior change):** emit the **4 non-derivable**
  media cause counters (`delivery_url_refreshed`, `suppressed_url_signature_rotation`,
  `suppressed_url_identity_changed`, `write_failures`) into `media_sync_cron` — the
  URL-suppression counter is SPLIT (Codex P2) so signature rotation and origin/pathname
  identity changes are never conflated. `physical_writes` (=`rows_updated`) and
  `non_tombstone_rows_written` (derivable) are deliberately NOT stored (audit-growth
  minimization); emit a flag-gated (`DIAG_RAW_DATA_KEYS_UNTIL=<future ISO timestamp>`), top-20, names+counts-only
  `raw_data` changed-key histogram to **runtime logs** (never `audit_events`) using the
  **production material comparator**; then capture **≥3 natural cycles** (no manual trigger).
- **STOP after Phase 1 and report raw evidence.** No suppression, cleanup, route
  deletion or retention change until Maya reviews the measured causes.

## 10. Operational notes (corrected)
- **Deploy state:** opening PR #569 created a **Vercel PREVIEW** deployment (verified:
  `gh pr checks 569` → "Vercel … Deployment has completed"). **No production deployment
  occurred** (`release-truth` stays `pending: deploy_pending`). An earlier statement that
  "opening the PR does not deploy" was **inaccurate** — it deploys a preview, not production.
- **Instrumentation cost is small but NOT zero:** the 4 media cause counters add a few integers of
  JSON to each `media_sync_cron` row; when `DIAG_RAW_DATA_KEYS_UNTIL` is a future ISO
  timestamp the listing path does
  per-key material comparisons + one log line per cycle. It changes **no** sync/write
  decision and adds **no** new DB read (only already-selected columns), but is not literally
  free.
- **Preview cannot collect natural cron cycles:** Vercel scheduled crons fire only on
  PRODUCTION. Capturing ≥3 natural cycles requires the merged `main` SHA deployed to
  production — do **not** promote a non-main preview to production (conflicts with
  release-truth governance).
- **Comparator correctness (Codex, ACCEPTED):** the `raw_data` histogram uses
  `changedRawDataMaterialKeys` (reuses `rawDataMateriallyEqual` + excludes
  `RAW_DATA_PROVENANCE_CLOCK_KEYS`), **not** `JSON.stringify` — rotating signed Media URLs
  and clock bumps are never mis-reported. Proven by `changed-raw-data-keys.test.ts` (11 cases).
