/**
 * status.ts — canonical status QUERY sets + GROUP classification (PURE).
 *
 * SINGLE SOURCE: classification is a strict PROJECTION of the merged `LifecycleStatus`
 * (lib/search/visibility-contract.ts). We do NOT fork a second status vocabulary — `StatusGroup`
 * is derived from `LifecycleStatus` via `toLifecycleStatus`. This avoids the multi-vocabulary
 * drift the analysis flagged (two TERMINAL sets, etc.).
 *
 * TWO distinct concepts, deliberately separated:
 *   1. QUERY  — which StandardStatus values live search LOGIC filters for. `ActiveUnderContract`
 *      is NOT here (0 live; Pending is the live in-contract status).
 *   2. CLASSIFY — given a record's status, which group it belongs to. Unknown/unrecognized →
 *      'unavailable' (fail-closed), mirroring the merged contract's fail-closed 'unknown' bucket.
 */

import { toLifecycleStatus, type LifecycleStatus, type TransactionType } from '../visibility-contract';

export type StatusGroup =
  | 'active_on_market'
  | 'pending_contract'
  | 'closed_recent'
  | 'off_market'
  | 'unavailable';

/** Statuses live search may FILTER for, by group. `ActiveUnderContract` is intentionally absent. */
export const QUERY_STATUSES: Readonly<Record<Exclude<StatusGroup, 'unavailable'>, readonly string[]>> = Object.freeze({
  // ComingSoon is a valid member but currently 0 live — include only when the caller opts in.
  active_on_market: Object.freeze(['Active']),
  pending_contract: Object.freeze(['Pending']),
  closed_recent: Object.freeze(['Closed']), // window applied by compEligibility via CloseDate
  off_market: Object.freeze(['Withdrawn', 'Canceled', 'Expired', 'Hold', 'Incomplete', 'Delete']),
});

/** The one projection: merged LifecycleStatus → StatusGroup. `unknown` → 'unavailable' (fail-closed). */
export function lifecycleToGroup(status: LifecycleStatus): StatusGroup {
  switch (status) {
    case 'active': return 'active_on_market';
    case 'pending': return 'pending_contract';
    case 'closed_sold':
    case 'closed_rented': return 'closed_recent';
    case 'temp_off_market':
    case 'withdrawn':
    case 'canceled':
    case 'expired': return 'off_market';
    case 'unknown':
    default: return 'unavailable';
  }
}

/**
 * Classify a record's StandardStatus into a canonical group, via the merged LifecycleStatus.
 * `transactionType` only distinguishes closed_sold vs closed_rented (both → closed_recent),
 * so it defaults to 'sale'. Unknown/unrecognized → 'unavailable' (fail-closed).
 */
export function statusGroup(standardStatus: unknown, transactionType: TransactionType = 'sale'): StatusGroup {
  if (typeof standardStatus !== 'string') return 'unavailable';
  return lifecycleToGroup(toLifecycleStatus(standardStatus, transactionType));
}

/**
 * Statuses to filter for a requested group. `includeComingSoon` gates the (currently 0-live)
 * ComingSoon member for active_on_market. Never returns ActiveUnderContract.
 */
export function queryStatusesFor(group: Exclude<StatusGroup, 'unavailable'>, includeComingSoon = false): readonly string[] {
  if (group === 'active_on_market' && includeComingSoon) return ['Active', 'ComingSoon'];
  return QUERY_STATUSES[group];
}
