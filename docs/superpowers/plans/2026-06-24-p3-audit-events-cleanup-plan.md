# P3 audit_events cleanup — report + go/no-go (READ-ONLY)

> **REPORT-ONLY. No SQL writes, no deletes, no migration, no reclaim, no downgrade, no env change,
> no new Neon branch, no retention reduction.** Read-only DB measurement (cold-waterfall, read-only
> txn, ROLLBACK) + source read. Date 2026-06-24 · #415.

## GO/NO-GO: 🟢 GO to PLAN a gated cleanup (~34 MB, safe) · 🔴 NO-GO on any delete now (hard limits)
`audit_events` is **54 MB / 81,621 rows**, and **~63% of it is one recoverable operational burst**:
46,011 near-identical IDX-sync "read-only transaction" connector errors from the cross-project DB
repoint window — **zero compliance value, already stopped (2026-06-13), maximally redundant.**
Cleaning it (+ trimming cron-heartbeat noise) reclaims **~34 MB** with **no compliance/audit-history
loss** — human, compliance, security, §2.05, and Trestle-access events are explicitly preserved.
Like P2, this is storage **hygiene**, not the Neon-Free lever, and **delete ≠ shrink** without a
separate reclaim.

---

## The 8 scope answers

**1. Current size. [DB-measured]**
- Total **54 MB** (table **49 MB** + indexes **5.4 MB**), **81,621 rows**, dead tuples **1** (no bloat — autovacuum keeps up; the size is live rows, not bloat).
- 3 indexes: `(entity_type,entity_id)`, `(user_type,user_id)`, `(created_at)`.
- **Largest event types (by `changes` bytes):** `idx_sync_listing_upsert_failure` **46,011 rows / 30 MB** · `idx_sync_cron` 7,200 / 1.6 MB · `idx_sync` 7,201 / 1.4 MB · `media_sync_cron` 4,172 / 1.4 MB · `idx_display_yn_disabled` 5,833 / 877 kB · `feed_reconcile_ghost_transition` 4,337 / 834 kB · `update` 305 / 757 kB · `trestle_access` 945 / 436 kB.
- **By entity:** `listing` 75,913 / 37 MB dominates; `listing_media` 4,291 / 1.4 MB; everything else < 65 kB.
- **By actor:** `system` **80,770 rows / 38 MB** vs `agent` 696 / 795 kB vs `public` 155 / 57 kB → **98.9% of rows are system/automation noise.**
- **Date distribution:** 2026-06 **54,890 rows / 32 MB** · 2026-05 12,386 / 3.2 MB · 2026-04 11,746 / 2.2 MB · 2026-03 2,599 / 756 kB. **>2yr rows = 0** (the nightly 2-year purge works).

**2. The 35 MB burst — identified precisely. [DB-measured]**
- **Event type:** `idx_sync_listing_upsert_failure` (entity_type `listing`, user_type `system`).
- **Source:** the best-effort per-record diagnostic added 2026-05-15 (`lib/idx/sync.ts` `recordSyncDiagnostic`, the listing-upsert catch in `syncListings`; test `tests/runtime/idx-sync-diagnostic-audit-events.test.ts`).
- **Time window:** **2026-05-21 → 2026-06-13** (newest `2026-06-13 02:01`). **`last_7d = 0` → it has STOPPED firing.**
- **Rows:** **46,011** across **1,938 distinct listings** (≈92 occurrences each → the same listings failed on ~every sync run).
- **Payload structure:** `{since, mls_id, full_sync, error_name, listing_id, listing_type, max_records, record_index, error_message, stack_excerpt, prisma_meta, prisma_code}`. The fat fields are `error_message` + `stack_excerpt`, repeated near-verbatim.
- **Root cause (from the captured payload):** `error_name = PrismaClientUnknownRequestError`, `error_message = "cannot execute INSERT in a read-only transaction"` (**Postgres code 25006**). The IDX sync write path was hitting a **read-only DB connection** during the **cross-project DB repoint** (the 2026-06-02 rescue + reconciliation window). Resolved ~2026-06-13 (burst stops).
- **Duplicated / redundant?** **Yes, maximally** — one error signature (25006), 1,938 listings, ~92 identical repeats each. `prisma_code` is null on all (the real code lives inside `error_message`). The diagnostic served its purpose (captured a root cause that would have aged out of Vercel's ~24h logs) and is now pure redundant noise.

**3. Retention requirements.**
- **Floor already enforced:** the data-retention cron deletes `audit_events` older than **2 years** nightly (`route.ts:64-73`, "REBNY RLS retention floor = 2 years"; NY SHIELD). `trestle_access`/`trestle_data_access` carry a **12-month** floor (per the same route's comment).
- **Must keep within the floor:** broker/admin actions, listing status changes, **§2.05 terminal-removal evidence** (`idx_display_yn_disabled`), impersonation/security (login/MFA/password/impersonate), consent capture, Fair-Housing sends, portal actions, seller/landlord intake — these are the compliance/audit history (NY DOS 6-yr for *records*; RLS 2-yr for *audit events*).
- **Future portal audit:** seller/landlord portal events are tiny today (`seller_lead` 44, etc.) and compliance-relevant → keep full.

**4. Event classification.**
| Class | Events | Rows / size | Disposition |
|---|---|---|---|
| **Must retain full** | `agent`/`public` actor rows (status_change, login, impersonate, MFA, consent, fair-housing, portal, intake), `idx_display_yn_disabled` (§2.05), `trestle_access`/`trestle_data_access` (12-mo) | ~696 + 155 + 5,833 + 1,099 ≈ small (~2.2 MB) | KEEP (compliance/security) |
| **Can compact payload** | `idx_sync_cron`, `idx_sync`, `media_sync_cron`, `*_cron` heartbeats | ~18.8k rows / ~4.5 MB | trim `changes` to a bounded summary / shorter retention |
| **Can summarize** | `idx_sync_listing_upsert_failure` burst | 46,011 / 30 MB | collapse to 1 summary row (signature + listings + window) |
| **Can archive** | reconcile/provenance (`feed_reconcile_*`, `projection_reconcile_*`) | ~8k / ~1 MB | optional cold table; low priority |
| **Delete only if approved** | the burst (after confirming root cause resolved — it is) | 46,011 / 30 MB | gated delete (Gate below) |

**5. Safe cleanup options.**
1. **Summarize/delete the burst** — replace 46,011 `idx_sync_listing_upsert_failure` rows with one summary row (or delete outright; root cause resolved, window closed). The biggest, safest win.
2. **Payload trim** — truncate `error_message`/`stack_excerpt` (and cron-heartbeat `changes`) to a bounded length going forward; retroactive trim is an UPDATE (creates dead tuples, needs reclaim).
3. **Shorter retention class for system noise** — e.g., 30–90 days for non-compliance `system` cron/heartbeat/diagnostic actions, **while keeping the 2-yr compliance floor + 12-mo Trestle floor** for everything else. (Note: the burst is only ~11 days old at the newest, so a 30-day cutoff wouldn't catch it yet — a targeted by-action cleanup is needed for the burst itself.)
4. **Move to archive table** — cold `audit_events_archive` for system noise; does NOT shrink Neon unless the source rows are deleted + reclaimed.
5. **Prevent future noisy events (the real fix):** add a **dedupe/cap to the per-record diagnostic** (it has none today — unlike `idx_sync_cron`'s 10-min dedupe). Persist only distinct `(listing_id, error signature)` per run, or cap N/run. Plus ensure the sync write path can never run against a read-only endpoint (root cause already fixed by the repoint reconciliation).

**6. MB saved per option.**
- Summarize/delete the burst: **~30 MB.**
- Trim/short-retain cron-heartbeat noise (`idx_sync_cron`+`idx_sync`+`media_sync_cron`): **~4 MB.**
- **Combined reclaimable ≈ ~34 MB** (≈ the "35 MB diagnostic burst" in the P2-MONEY Step-4 plan — confirmed).
- Indexes (5.4 MB) shrink proportionally after the row delete + reindex/repack.
- Dedupe-the-writer: prevents recurrence (0 MB now, bounds future growth).

**7. Does cleanup shrink disk immediately?** **No.** `DELETE`/`UPDATE` create dead tuples; Neon billed *synthetic* size drops only after the old page versions **age past the PITR window (7 d Launch) + autovacuum**. Physical shrink needs a **row rewrite** — for a hard compaction use online copy-swap / `pg_repack`, **never `VACUUM FULL`** on Neon (blocks all traffic). So: delete → wait PITR+autovacuum → measure Neon billed bytes → optional `pg_repack`. (`audit_events` currently has only 1 dead tuple, so post-delete it WILL need the GC/reclaim cycle to realize the ~34 MB.)

**8. Go/no-go.**
- 🟢 **GO to plan** a gated, targeted cleanup PR — there is real, safe value (~34 MB / ~63% of the table) and the burst is DB-proven to be resolved operational noise with zero compliance content.
- 🔴 **NO-GO on executing any delete now** (hard limits: report only, no deletes, no retention reduction without approval).
- **Reality check:** ~34 MB is hygiene, not the Neon-Free lever (DB ~1,135 MB; Free cap ~477 MiB). And delete ≠ shrink without a reclaim step.

## Proposed cleanup (future, gated — NOT executed here)
1. **Confirm root cause resolved** — done (burst stopped 2026-06-13; `last_7d=0`).
2. **Add dedupe/cap to the per-record diagnostic writer** (`lib/idx/sync.ts` `recordSyncDiagnostic`) — prevents recurrence; a normal flag-free code PR with a test. (Highest-leverage, lowest-risk first step.)
3. **Gated targeted cleanup** of `idx_sync_listing_upsert_failure` (delete or summarize) — behind explicit approval + a pre-cleanup Neon snapshot.
4. **Optional:** a system-noise retention class (30–90 d) separate from the 2-yr compliance floor + 12-mo Trestle floor — code + RED test, default preserving current behavior.
5. **Reclaim** (separate gate): PITR-elapse + autovacuum, then measure Neon billed bytes; `pg_repack` only if needed; never `VACUUM FULL`.

## Approval gates (each separate, explicit)
1. Diagnostic-writer dedupe PR (code only — no data change).
2. Burst cleanup execute (SQL deletes — HELD) + pre-cleanup Neon snapshot.
3. System-noise retention-class change (touches the retention cron / a §D surface — HELD).
4. Reclaim (`pg_repack`/copy-swap — HELD; never `VACUUM FULL`).

## Hard limits honored
Report only. No SQL writes, no deletes, no migration, no reclaim, no downgrade, no env change, no new Neon branch, no retention reduction. Read-only DB measurement + source read only.
