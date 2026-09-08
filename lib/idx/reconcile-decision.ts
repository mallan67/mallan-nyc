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
import { OFF_FEED_SYNC_STATUS, PUBLIC_DISPLAY_STAGES, lifecycleFromProviderRow } from '@/lib/listings/canonical-lifecycle';
import type { CotalityRow } from '@/lib/cotality/contract';

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
  | 'stale_to_departed' //   db on-market, live absent → hide + record the presence fact off_feed (the 345→gone)
  | 'terminal_realign' //    db terminal, live terminal but a different terminal value
  | 'departed_noop' //       db terminal, live absent/same-terminal → already correct (removal candidate)
  | 'offmarket_noop'; //     db off-market (Draft/Hold/Incomplete), live absent → legitimately off-market, leave alone

export interface ReconcileDecision {
  action: 'none' | 'update';
  /** The status the row must carry to match live truth. */
  targetStatus: string;
  /** Whether targetStatus is terminal — drives idx_display via computeGateColumns. */
  targetIsTerminal: boolean;
  /**
   * The Mallan presence fact to store in `listings.sync_status`: 'off_feed' when the listing is absent from the
   * current feed (provider status preserved — the Mallan Off Market state), 'synced' when live truth put it back on
   * the feed, null = leave the column alone.
   */
  targetSyncStatus: 'synced' | typeof OFF_FEED_SYNC_STATUS | null;
  className: ReconcileClass;
  reason: string;
}

/**
 * "Left the licensed live feed entirely" is NOT a status (Maya 2026-09-08). The feed never delivers Withdrawn /
 * Canceled / Expired / Hold (whole-corpus census 2026-09-08), so absence carries NO reason: the stored provider
 * status is preserved and the presence fact `sync_status = off_feed` is recorded — the broker-facing Mallan state
 * is Off Market. (Production had 6,962 rows labelled Withdrawn this way; 42 of them were live Closed.)
 */
const isOffFeed = (syncStatus: string | null | undefined): boolean => syncStatus === OFF_FEED_SYNC_STATUS;

/**
 * Live truth for one listing from the row the provider returned for its ListingId (or null when the
 * provider returned nothing). The provider row is interpreted ONLY through the canonical lifecycle
 * (lib/listings/canonical-lifecycle.ts — the boundary module that reads StandardStatus): a publicly
 * displayable stage (active / coming soon / in contract) is on-market, any other recognised stage is
 * terminal for reconciliation purposes, and no row (or no recognised status) is absent.
 */
export function liveTruthFromRow(row: CotalityRow<'Property'> | null | undefined): LiveTruth {
  const lifecycle = row ? lifecycleFromProviderRow(row) : null;
  if (!lifecycle) return { kind: 'absent' };
  const status = normalizeStandardStatus(lifecycle.storageStatus);
  return PUBLIC_DISPLAY_STAGES.has(lifecycle.stage) ? { kind: 'onmarket', status } : { kind: 'terminal', status };
}

/**
 * Decide the correct status AND presence fact for a listing given its stored `status`, its live truth and its
 * stored `sync_status`. Direction-agnostic: it un-suppresses live rows, hides departed / closed rows, and corrects
 * drift. Absence never manufactures a status: the stored provider status is preserved and the presence fact
 * `sync_status = off_feed` is recorded (Off Market); a row that returns live is put back on the feed ('synced').
 */
export function reconcileStatusDecision(
  dbStatusRaw: string,
  live: LiveTruth,
  dbSyncStatus?: string | null,
): ReconcileDecision {
  const db = normalizeStandardStatus(dbStatusRaw);
  const dbTerminal = TERMINAL_STATUSES.has(db);
  const dbOffFeed = isOffFeed(dbSyncStatus);

  if (live.kind === 'onmarket') {
    const target = normalizeStandardStatus(live.status);
    if (db === target && !dbOffFeed) {
      return { action: 'none', targetStatus: target, targetIsTerminal: false, targetSyncStatus: null, className: 'ok', reason: 'db matches live on-market' };
    }
    const className: ReconcileClass = dbTerminal || dbOffFeed
      ? 'mislabel_suppressed'
      : ON_MARKET_STATUSES.has(db)
        ? 'status_drift'
        : 'revived_offmarket';
    return {
      action: 'update',
      targetStatus: target,
      targetIsTerminal: false,
      targetSyncStatus: 'synced',
      className,
      reason: dbOffFeed
        ? `recorded off the feed as '${db}' but live on-market '${target}' — back on the feed (${className})`
        : `'${db}' but live on-market '${target}' — reconcile to live (${className})`,
    };
  }

  if (live.kind === 'terminal') {
    const target = normalizeStandardStatus(live.status);
    if (db === target && !dbOffFeed) {
      return { action: 'none', targetStatus: target, targetIsTerminal: true, targetSyncStatus: null, className: 'departed_noop', reason: `db already '${target}'` };
    }
    return {
      action: 'update',
      targetStatus: target,
      targetIsTerminal: true,
      targetSyncStatus: 'synced',
      className: dbTerminal ? 'terminal_realign' : 'stale_to_terminal',
      reason: dbTerminal
        ? `terminal realign '${db}' → live '${target}'`
        : `on-market '${db}' but live terminal '${target}' — hide + correct`,
    };
  }

  // live.kind === 'absent' — not present in the current licensed feed at all
  if (dbTerminal) {
    return { action: 'none', targetStatus: db, targetIsTerminal: true, targetSyncStatus: null, className: 'departed_noop', reason: `terminal '${db}' + absent — already hidden (removal candidate)` };
  }
  if (ON_MARKET_STATUSES.has(db)) {
    if (dbOffFeed) {
      return { action: 'none', targetStatus: db, targetIsTerminal: false, targetSyncStatus: null, className: 'departed_noop', reason: `'${db}' already recorded off the feed (Off Market) — nothing to change` };
    }
    return {
      action: 'update',
      targetStatus: db,
      targetIsTerminal: false,
      targetSyncStatus: OFF_FEED_SYNC_STATUS,
      className: 'stale_to_departed',
      reason: `on-market '${db}' but absent from the current Cotality feed — provider status preserved, presence recorded off_feed (Off Market)`,
    };
  }
  // Off-market, non-terminal (Draft / Hold / Incomplete / unknown): being absent from the live
  // ON-MARKET feed is expected — it was never claimed to be on the market. Never auto-withdraw.
  return { action: 'none', targetStatus: db, targetIsTerminal: false, targetSyncStatus: null, className: 'offmarket_noop', reason: `off-market '${db}' absent from on-market feed — leave alone` };
}

/**
 * Final `idx_display_yn` for a corrected row. A terminal target is NEVER displayable —
 * this closes a fail-OPEN edge where a live status is terminal-by-decision but NOT in the
 * canonical `TERMINAL_STATUSES` set (e.g. a live 'Hold' / 'Incomplete' / 'Delete'). In that
 * case `computeGateColumns` would treat the status as non-terminal and could return
 * `idx_display_yn=true`, leaving the row marked terminal (`terminal_since` set) yet publicly
 * displayable. When `decision.targetIsTerminal` is true we force display off regardless of the
 * gate; otherwise the gate-computed value stands (fail-closed on the row's other gate columns).
 */
export function resolveIdxDisplay(
  decision: ReconcileDecision,
  gateIdxDisplay: boolean,
): boolean {
  // A row recorded off the feed is never displayable, whatever its preserved provider status says.
  return decision.targetIsTerminal || decision.targetSyncStatus === OFF_FEED_SYNC_STATUS ? false : gateIdxDisplay;
}
