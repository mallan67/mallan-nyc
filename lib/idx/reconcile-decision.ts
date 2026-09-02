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
import { canonicalProviderSpelling } from '@/lib/compliance/listing-status-vocabulary';

/**
 * The status this row must END UP carrying, given what the provider just said.
 *
 * ── WHY THE TARGET IS FOLDED TO THE PROVIDER'S OWN SPELLING (2026-08-20) ───
 * `listings.status` carries two spellings of cancellation: the live Cotality
 * member `Canceled` (single L) and the Mallan CRM canonical `Cancelled`
 * (double L, which the provider answers HTTP 400 for). `normalizeStandardStatus`
 * preserves each verbatim — provider provenance in, provider provenance out —
 * so the two do NOT collapse, and the raw comparison `db === target` therefore
 * distinguishes them.
 *
 * That is correct for the DB side and wrong for the TARGET side. This module's
 * whole purpose is to make the row match LIVE TRUTH, and `live.kind` values are
 * provider observations. Folding the target — and ONLY the target — to the
 * provider spelling gives the two cells the right answers:
 *
 *   db 'Cancelled' × live terminal 'Canceled'  → target 'Canceled',
 *                                                terminal_realign, action UPDATE
 *   db 'Canceled'  × live terminal 'Cancelled' → target 'Canceled',
 *                                                departed_noop,   action NONE
 *
 * The first is a stored Mallan-local derivation being replaced by an actual
 * provider assertion — exactly what `lib/compliance/status-provenance.ts`
 * classifies as the upgrade from MALLAN_LOCAL_DERIVATION to a provider-sourced
 * value, and the mechanism by which any legacy double-L row self-heals onto the
 * provider spelling with no backfill. The second is the guard that matters more:
 * a provider-spelled row is NEVER rewritten into a string the provider rejects,
 * no matter what a caller passes as `live.status`.
 *
 * `targetIsTerminal` is `true` in both cells, so `resolveIdxDisplay` forces
 * `idx_display_yn=false` either way — this decision changes the stored spelling
 * and the audit class, never the display outcome.
 */
function providerTargetStatus(liveStatus: string): string {
  return canonicalProviderSpelling(normalizeStandardStatus(liveStatus));
}

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

/**
 * The status Mallan writes for "left the licensed live feed entirely".
 *
 * CORRECTED 2026-08-19. The previous comment said "Cotality has no such
 * StandardStatus", which is false: `Withdrawn` IS a valid member — live probe
 * `StandardStatus eq 'Withdrawn'` returned HTTP 200 with `@odata.count` 0, and
 * `$metadata` declares it in EnumType StandardStatus. What is true, and what the
 * comment was reaching for, is that Cotality has no member MEANING "departed the
 * feed", and this REBNY IDX Plus feed currently carries zero Withdrawn rows.
 *
 * That distinction matters because it is exactly why this value needs a
 * provenance label: it is spelled like a provider member but is chosen by
 * Mallan, so nothing about the stored string distinguishes the two. Writers
 * MUST record `STATUS_ORIGIN.MALLAN_LOCAL_DERIVATION` alongside it — see
 * `lib/compliance/status-provenance.ts` and the ghost transition in
 * `app/api/cron/feed-reconcile/route.ts`.
 */
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
    const target = providerTargetStatus(live.status);
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
    const target = providerTargetStatus(live.status);
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
  return decision.targetIsTerminal ? false : gateIdxDisplay;
}
