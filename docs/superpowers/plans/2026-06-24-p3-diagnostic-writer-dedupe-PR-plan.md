# P3 diagnostic-writer dedupe/cap — concrete code-only PR plan (PLAN ONLY)

> **PLAN ONLY — NO IMPLEMENTATION.** No code, no deletes, no SQL writes, no migration, no reclaim,
> no downgrade, no env change, no retention reduction. Code-only scope (proven below). Date
> 2026-06-24 · #415. Builds on `2026-06-24-p3-audit-events-cleanup-plan.md`.

## Goal
Prevent future redundant `audit_events` bursts like the **46,011-row `idx_sync_listing_upsert_failure`
incident (2026-05-21 → 2026-06-13)** — 1,938 listings × one error signature (PG 25006
"cannot execute INSERT in a read-only transaction") repeated across ~92 sync runs. Bound any single
mass-failure run to a small, summarized footprint **without losing the root-cause signal** and
**without touching any compliance/security/human audit write.**

## GO/NO-GO: 🟢 GO to build (code-only, low-risk, high prevention value, no schema, no compliance impact).
The fix routes the high-volume **system** diagnostic/heartbeat writers through one capped, deduping
collector. Must-retain events never go near it. No schema change. Prevention value: the incident
would have been **~92–9,300 rows instead of 46,011** (≈80–99.8% fewer, depending on cap), i.e.
**~30 MB → <1 MB**.

---

## The 10 scope answers

**1. The diagnostic writer.** `recordSyncDiagnostic(action, entity_type, entity_id, changes)` —
`lib/idx/sync.ts:120-145`. It does an unconditional best-effort `prisma.auditEvent.create({ ...,
user_type: "system" })` per call, **no dedupe, no cap**. Called per-failed-record (fire-and-forget,
`void`) at `lib/idx/sync.ts:415` (`idx_sync_listing_upsert_failure` — the burst) and at `:637`
(`idx_sync_syncstate_failure`). Error detail comes from `extractErrorDetails(err)` (`:73-118`).

**2. High-volume system audit call sites (DB-confirmed counts).**
| Site | Action | Rows / size | Shape |
|---|---|---|---|
| `lib/idx/sync.ts:415` | `idx_sync_listing_upsert_failure` | **46,011 / 30 MB** | per-record failure (THE burst) |
| `lib/idx/sync.ts:637` | `idx_sync_syncstate_failure` | 92 / 65 kB | per-run watermark failure |
| `app/api/cron/idx-sync/route.ts:83` | `idx_sync_cron` | 7,200 / 1.6 MB | per-run heartbeat |
| `lib/idx/sync.ts:550` | `idx_sync` | 7,201 / 1.4 MB | per-run heartbeat |
| `app/api/cron/media-sync/route.ts` | `media_sync_cron` | 4,172 / 1.4 MB | per-run heartbeat |
| `app/api/cron/feed-reconcile/route.ts` | `feed_reconcile_ghost_transition` / `feed_reconcile_orphan_created` | 4,337 + 1,766 / ~1.2 MB | per-listing provenance |
| (cron handler) | `*_cron` (demand/momentum/lifecycle/…) | ~80 each | per-run heartbeat |
- **Failure-class (dedupe target):** the two `*_failure` sites — unbounded under a systemic error.
- **Heartbeat-class (payload-trim target):** one row per run is fine/useful; cap the `changes` payload size.
- **Provenance-class:** bounded by real reconcile actions; apply the cap helper opportunistically (low priority).

**3. Dedupe/cap strategy (two complementary controls, both code-only).**
- **Control 1 — in-run dedupe by fingerprint.** Key = `(action, entity_id, errorFingerprint)` where
  `errorFingerprint` = a normalized hash of `{error_name, pg_code, message-prefix}` (so 25006 across
  many listings is recognizable, while a *different* error on the same listing is distinct). Repeats
  of the same key within a run **increment an in-memory count** instead of writing a new row.
  → different listings still distinct (each its own key); same listing+same error collapses.
- **Control 2 — global per-run cap K (e.g., 50–100) + one summary row.** A run writes at most K full
  diagnostic rows (preserving up to K distinct keys with full detail incl. the error once); all
  overflow is folded into a single `idx_sync_diagnostic_summary` row carrying
  `{suppressed_count, distinct_fingerprints, top_fingerprints:[{fingerprint,count,sample_listing_ids}], window}`.
  → a mass-failure run is bounded to **K+1 rows regardless of how many records fail.**
- **Time bucket = the sync run** (natural bucket; no clock math needed — the collector lives for one
  run and flushes at the end). This satisfies "same time bucket".
- **Optional Control 3 (follow-up, behind the cap) — cross-run recency suppression.** Before writing
  the first K rows, reuse the existing 10-min recency pattern (`idx-sync route:31-37` already does a
  `findFirst` on `action + created_at`) to skip/bump a `(action, entity_id, fingerprint)` row seen in
  the last N hours. Collapses *cross-run* repeats too (incident → ~1,938 rows total). Adds a failure-
  path DB read, so gate it behind the per-run cap to stay within the 120 s budget. **Not required for
  the primary PR; recommended as a phase-2 add-on.**
- Net mechanism = **increment-in-memory + cap + summary** (the scope's "increment count instead of
  writing duplicate rows, OR suppress after threshold" — we do both).

**4. Must-retain events preserved (opt-IN allowlist, fail-safe).** The collector applies **only** to
an explicit allowlist of **`user_type: "system"`** diagnostic/heartbeat actions (the §2 table). It is
**opt-in**: any action not on the list is written full, unchanged. Untouched paths:
- `logAuditEvent(...)` (`lib/auth`) — every human/agent/broker/admin action, login/logout, status_change.
- Security/impersonation — `impersonate`, MFA, password reset/change, invite.
- Compliance — `idx_display_yn_disabled` (§2.05 terminal-removal evidence), consent capture,
  fair-housing sends, `trestle_access`/`trestle_data_access` (12-mo floor).
- Portal (current + future seller/landlord) — all `entity_type` portal events.
None of these call `recordSyncDiagnostic`/the collector, so **none can be deduped away.**

**5. No compliance history reduced.** The dedupe affects only **system operational diagnostics +
cron heartbeats**, never compliance/security/human/Trestle/§2.05/portal events (§4). The existing
**2-year RLS retention floor + 12-month Trestle floor** are unchanged (no retention-cron edit in this
PR). The root-cause signal is preserved (the error is still written once per fingerprint per run,
with count + sample listings). **Zero reduction of must-retain audit history.**

**6. Schema changes needed? NO.** The in-run count lives in memory; the summary row stores counts in
the existing `changes` JSON; the optional cross-run control stores its count via `jsonb_set` on
existing columns and uses the existing `(entity_type,entity_id)` / `(created_at)` indexes. **No new
column, table, or index.** (`validate-migration-discipline.js` is not triggered — no `schema.prisma`
change.)

**7. Code-only? YES — confirmed.** Single chokepoint (`recordSyncDiagnostic`) + a new in-memory
collector + payload-trim at the heartbeat sites. No schema, no migration, no data change, no env, no
cron-config change. (`vercel.json` untouched; `SCHEDULED_MAX_RECORDS=500` preserved.)

**8. Tests.**
- **Unit — `lib/idx/__tests__/diagnostic-recorder.test.ts` (NEW):**
  - repeated same `(action, entity_id, fingerprint)` → **one row + incremented count** (not N rows).
  - different `entity_id`, same error → **separate rows** (different listings record separately).
  - same `entity_id`, different error fingerprint → **separate rows**.
  - exceeding cap K → exactly **K full rows + one `idx_sync_diagnostic_summary`** with the correct `suppressed_count`.
  - `fingerprintError` folds 25006 connector errors to one fingerprint; distinct PG codes → distinct fingerprints.
- **Runtime — extend `tests/runtime/idx-sync-diagnostic-audit-events.test.ts`:**
  - the `idx_sync_listing_upsert_failure` path routes through the collector + flushes at end-of-run.
  - **must-retain guard:** `logAuditEvent` / status-change / `idx_display_yn_disabled` / impersonation paths do **not** import or call the collector (source-assert) → never deduped.
  - heartbeat `changes` payload is trimmed/capped to the bounded shape when included.
- **Behavior:** collector is best-effort — a write failure still must not throw or alter sync (preserves the current guarantee).

**9. Expected prevention value.**
- The 2026-05/06 incident under this fix: **≤ (K+1) rows/run × ~92 runs ≈ 4,700–9,300 rows** (cap
  only) or **~92 rows** (if fingerprint-collapsed per run), vs the actual **46,011** → **~80–99.8%
  reduction**; **~30 MB → <1 MB**.
- With optional Control 3 (cross-run): **~1,938 rows total** for an equivalent incident.
- Going forward: any single mass-failure is bounded; `audit_events` growth from system noise becomes
  ~linear in *distinct* problems, not in *occurrences*.

**10. Go/no-go: 🟢 GO to build (code-only PR).** Low risk (single chokepoint, opt-in allowlist,
best-effort preserved), no schema, no compliance impact, high prevention value. It does **not**
remove the existing 30 MB burst — that's the separate gated cleanup (P3 report); this stops the *next*
one. Recommend shipping this **before** the burst cleanup (prevention before reclaim).

## Proposed file list (code-only)
| # | File | New? | Change |
|---|---|---|---|
| 1 | `lib/idx/diagnostic-recorder.ts` | NEW | `SystemDiagnosticCollector` (record/flush, cap K, in-run dedupe, summary) + `fingerprintError` + the system-action allowlist |
| 2 | `lib/idx/sync.ts` | edit | route `idx_sync_listing_upsert_failure` (`:415`) + `idx_sync_syncstate_failure` (`:637`) through the collector; `flush()` at end of `syncListings`; trim the `idx_sync` heartbeat payload (`:550`) |
| 3 | `app/api/cron/idx-sync/route.ts` | edit | trim `idx_sync_cron` heartbeat `changes` to the bounded shape (`:83`) |
| 4 | `app/api/cron/media-sync/route.ts` | edit | trim `media_sync_cron` payload |
| 5 | `app/api/cron/feed-reconcile/route.ts` | edit (optional) | route provenance writes through the cap helper (low priority) |
| 6 | `lib/idx/__tests__/diagnostic-recorder.test.ts` | NEW | unit tests (§8) |
| 7 | `tests/runtime/idx-sync-diagnostic-audit-events.test.ts` | edit | collector wiring + must-retain guard + heartbeat trim |
| 8 | `docs/audits/corrections/p3-diagnostic-dedupe-trace.md` | NEW | trace record (blast radius, RED→GREEN, allowlist) |

## Illustrative collector shape (not implemented)
```
class SystemDiagnosticCollector {
  constructor(runLabel, capK = 50)
  record(action, entity_type, entity_id, err, extra)  // in-memory dedupe by (action,entity_id,fingerprint), ++count
  async flush()  // write ≤K full rows + 1 idx_sync_diagnostic_summary; best-effort, never throws
}
fingerprintError(err) -> stable short hash of {error_name, pg_code, message_prefix}
SYSTEM_DIAGNOSTIC_ALLOWLIST = new Set(["idx_sync_listing_upsert_failure","idx_sync_syncstate_failure", ...heartbeats])
```

## Risk table
| Risk | Severity | Mitigation |
|---|---|---|
| Over-aggressive dedupe hides a real new error | Med | fingerprint includes error name + PG code + message-prefix → distinct errors stay distinct; first occurrence always written full |
| Accidentally dedupes a compliance/security event | High→Low | **opt-in allowlist** of system actions only; human/compliance paths never call the collector; source-assert test |
| Per-record DB read hurts the 120 s budget | Low | primary design does **zero** failure-path DB reads (in-memory); optional cross-run read is behind the cap |
| Collector throws and breaks sync | High→Low | best-effort inner try/catch preserved; flush wrapped; defense-in-depth `.catch` retained |
| Loses root-cause signal | Low | error written once per fingerprint/run + count + sample listing IDs in the summary |
| Doesn't shrink the existing 30 MB | Info | by design — prevention only; reclaim is the separate gated P3 cleanup |

## Approval gates
1. **This PR (code-only)** — normal review + the §G validation chain + tristle (touches a §D audit-write surface: confirm no compliance event is deduped). No schema/migration/env/data gate needed.
2. (Separate, already scoped) the burst **cleanup** + **reclaim** — the other P3 gates.

## Hard limits honored
Plan only. No code, no deletes, no SQL writes, no migration (proven not required), no reclaim, no downgrade, no env change, no retention reduction.
