# Feed-reconcile status-truth fix + correction + monitor — 2026-07-05

**Scope:** production data-integrity. Reconciles our DB status to the live Cotality feed and stops
the mechanism that was diverging it. Sole authority throughout = the live Cotality API
(`api.cotality.com/trestle`).

## Root cause (verified by full DB↔Cotality census, no sampling)

`app/api/cron/feed-reconcile/route.ts` decided "Withdrawn" purely from **absence in an Active-only
Trestle snapshot**, with no per-listing live-status check. Wrong in both directions:

| Divergence class | Count (census) | Meaning |
|---|---:|---|
| MISLABEL_SUPPRESSED | **103** (6 Active, 97 Pending) | DB terminal, but live on-market → **hiding live listings** |
| STALE_SHOWING | **345** (127 Closed, 218 gone) | DB on-market + `idx_display=true`, but live closed/gone → **showing dead listings (§2.05)** |
| DEPARTED | 4,921 | DB terminal and genuinely gone |
| MISSING_INVENTORY | 0 | we hold every live on-market listing |
| PROJECTION_DRIFT | 1 | `listings` vs `listing_search_projection` |

## Phase 1 — root-cause fix (`feed-reconcile` + decision engine)

- `lib/idx/reconcile-decision.ts` — pure bidirectional decision (reuses canonical `TERMINAL_STATUSES`
  + `normalizeStandardStatus`). **186 exhaustive tests** (full `dbStatus × liveTruth` matrix, safety
  invariant "never withdraw a live listing", idempotence, off-market protection).
- `feed-reconcile/route.ts` — ghost detection now spares any listing live on-market in **any** status
  (Active ∪ Pending ∪ AUC ∪ ComingSoon), not Active-only.
- `tests/runtime/feed-reconcile-c6.test.ts` — reversed the pinned test that had locked the buggy
  behavior; now proves live-Pending is spared, genuinely-departed still withdrawn.
- **Dry-run against live production** (`scripts/audit/reconcile-dryrun.ts`): matched the census exactly
  — un-suppress 103, hide 351, no-op 4,921, **0 live rows withdrawn (SAFE)**.

## Phase 2 — correction (`scripts/audit/reconcile-execute.ts`)

Corrected **454 rows** in the production DB, each **re-verified live at write time** (0 skipped), dual-
writing `listings` + `listing_search_projection`:

| class → target | rows |
|---|---:|
| mislabel_suppressed → Active / idx=true | 6 |
| mislabel_suppressed → Pending / idx=true | 97 |
| stale_to_terminal → Closed / idx=false | 127 |
| stale_to_departed → Withdrawn / idx=false | 224 |

**Rollback branch:** `pre-reconcile-correction-2026-07-05` (Neon PITR snapshot).

**Post-correction census (proof):** MISLABEL_SUPPRESSED 0 · STALE_SHOWING 0 · STATUS_DRIFT 0 ·
PROJECTION_DRIFT 0 · MISSING_INVENTORY 0. `OK_ONMARKET` = 16,536 = the entire live on-market universe.
`listings ↔ projection` mismatches among corrected rows = **0**.

## Monitoring — standing alerts (`scripts/audit/reconcile-monitor.ts` + `lib/idx/reconcile-alerts.ts`)

Alerts for the exact failure modes eliminated (Feed Truth, Stale Display, Projection Drift, Missing
Inventory, Sudden Growth, Ghost Transition, Cotality API health), with run-over-run delta and
**state-change (new/ongoing/recovered) — pages only on transitions, no per-run spam**. 16 unit tests.

**Test (proof it fires on real bad data, not just theory):**
- Production (corrected): census all 0 → ✅ OK, EXIT 0, silent.
- Rollback branch (pre-correction): mislabel 103 · stale 351 · missing 2 · drift 1 → 🔴 3× CRITICAL +
  🟠 HIGH, «PAGE», EXIT 1.

## Fields authority
All live queries use only `ListingId` + `StandardStatus` from `api.cotality.com/trestle`, confirmed
against the live `$metadata` (StandardStatus = 11-member enum). Classification reuses the app's
canonical status constants.
