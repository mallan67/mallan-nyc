/**
 * reconcile-decision.ts — pure status-truth reconciliation against the live feed.
 *
 * ROOT CAUSE this fixes (verified live 2026-07-05 by the full DB↔Cotality census,
 * scripts/audit/reconcile-db-vs-live-cotality.mjs):
 *   `feed-reconcile` decided "Withdrawn" purely from ABSENCE in an Active-only Trestle
 *   snapshot, with no per-listing live-status check. That is wrong in BOTH directions:
 *     • 103 rows were marked terminal while still LIVE on-market (6 Active, 97 Pending) — hidden.
 *     • 345 rows were left marked on-market while live they are Closed (127) or gone (218) — shown.
 *   Both stem from diffing one status snapshot instead of reconciling each listing to its
 *   actual live StandardStatus. This module encodes the correct, direction-agnostic decision.
 *
 * PURE: no DB, no network, no side effects. `idx_display_yn` is intentionally NOT decided
 * here — the caller recomputes it from the row's gate columns via `computeGateColumns`
 * (single source of truth) using the returned `targetStatus`.
 */
import { TERMINAL_STATUSES, normalizeStandardStatus } from '@/lib/idx/trestle-mapper';

/** StandardStatus values that mean a listing is currently on the market. */
export const ON_MARKET_STATUSES: ReadonlySet<string> = new Set([
  'Active',
  'ActiveUnderContract',
  'ComingSoon',
  'Pending',
]);

/**
 * The authoritative live truth for one listing, derived from the live Cotality feed:
 *   - onmarket : present live in an on-market status (Active/Pending/ComingSoon/AUC)
 *   - terminal : present live in a terminal status (e.g. Closed)
 *   - absent   : not present in our licensed live feed at all
 */
export type LiveTruth =
  | { kind: 'onmarket'; status: string }
  | { kind: 'terminal'; status: string }
  | { kind: 'absent' };

export type ReconcileClass =
  | 'ok'
  | 'mislabel_suppressed' // db terminal, live on-market → un-suppress (the 103)
  | 'revived_offmarket' //   db off-market (Draft/Hold/Incomplete), live on-market → bring on-market
  | 'status_drift' //        db on-market, live on-market, different status
  | 'stale_to_terminal' //   db on-market/off-market, live terminal → hide + set true status (the 345→Closed)
  | 'stale_to_departed' //   db on-market, live absent → hide + mark departed (the 345→gone)
  | 'terminal_realign' //    db terminal, live terminal but a different terminal value
  | 'departed_noop' //       db terminal, live absent/same-terminal → already correct (removal candidate)
  | 'offmarket_noop'; //     db off-market (Draft/Hold/Incomplete), live absent → legitimately off-market, leave alone

export interface ReconcileDecision {
  action: 'none' | 'update';
  /** The status the row must carry to match live truth. */
  targetStatus: string;
  /** Whether targetStatus is terminal — drives idx_display via computeGateColumns. */
  targetIsTerminal: boolean;
  className: ReconcileClass;
  reason: string;
}

/** Local status for "left the licensed live feed entirely" (Cotality has no such StandardStatus). */
export const DEPARTED_STATUS = 'Withdrawn';

/**
 * Decide the correct status for a listing given its stored `status` and its live truth.
 * Direction-agnostic: it un-suppresses live rows, hides departed/closed rows, and corrects drift.
 */
export function reconcileStatusDecision(
  dbStatusRaw: string,
  live: LiveTruth,
): ReconcileDecision {
  const db = normalizeStandardStatus(dbStatusRaw);
  const dbTerminal = TERMINAL_STATUSES.has(db);

  if (live.kind === 'onmarket') {
    const target = normalizeStandardStatus(live.status);
    if (db === target) {
      return { action: 'none', targetStatus: target, targetIsTerminal: false, className: 'ok', reason: 'db matches live on-market' };
    }
    const className: ReconcileClass = dbTerminal
      ? 'mislabel_suppressed'
      : ON_MARKET_STATUSES.has(db)
        ? 'status_drift'
        : 'revived_offmarket';
    return {
      action: 'update',
      targetStatus: target,
      targetIsTerminal: false,
      className,
      reason: `'${db}' but live on-market '${target}' — reconcile to live (${className})`,
    };
  }

  if (live.kind === 'terminal') {
    const target = normalizeStandardStatus(live.status);
    if (db === target) {
      return { action: 'none', targetStatus: target, targetIsTerminal: true, className: 'departed_noop', reason: `db already '${target}'` };
    }
    return {
      action: 'update',
      targetStatus: target,
      targetIsTerminal: true,
      className: dbTerminal ? 'terminal_realign' : 'stale_to_terminal',
      reason: dbTerminal
        ? `terminal realign '${db}' → live '${target}'`
        : `on-market '${db}' but live terminal '${target}' — hide + correct`,
    };
  }

  // live.kind === 'absent' — not present in the licensed live feed at all
  if (dbTerminal) {
    return { action: 'none', targetStatus: db, targetIsTerminal: true, className: 'departed_noop', reason: `terminal '${db}' + absent — already hidden (removal candidate)` };
  }
  if (ON_MARKET_STATUSES.has(db)) {
    return {
      action: 'update',
      targetStatus: DEPARTED_STATUS,
      targetIsTerminal: true,
      className: 'stale_to_departed',
      reason: `on-market '${db}' but absent from live feed — mark departed`,
    };
  }
  // Off-market, non-terminal (Draft / Hold / Incomplete / unknown): being absent from the live
  // ON-MARKET feed is expected — it was never claimed to be on the market. Never auto-withdraw.
  return { action: 'none', targetStatus: db, targetIsTerminal: false, className: 'offmarket_noop', reason: `off-market '${db}' absent from on-market feed — leave alone` };
}
