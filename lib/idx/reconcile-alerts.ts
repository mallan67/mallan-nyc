/**
 * reconcile-alerts.ts — alerting for the DB↔live-Cotality status-truth reconciliation.
 *
 * Alerts check the EXACT failure modes eliminated on 2026-07-05 (feed-reconcile status truth):
 * live listings suppressed, dead/sold listings shown, projection mirror drift, missing live
 * inventory, sudden volume shifts, abnormal ghost transitions, and Cotality API health.
 *
 * Cotality/Cotality source fields (authoritative): `StandardStatus`, `ListingId`, `MlsStatus`,
 * `CloseDate`, `ModificationTimestamp`. DB columns: `listings.status`, `listings.idx_display_yn`,
 * `listing_search_projection.mls_status`, `listing_search_projection.idx_display_yn`.
 *
 * State-change model (no spam): an alert carries a `transition` (new | ongoing | recovered)
 * computed vs the previous run. Callers page only on `new`/`recovered`, never `ongoing`.
 *
 * Pure: no DB, no network. The monitor computes the metrics and calls in here.
 */

/** The five invariants that must stay flat at 0 (the "feed truth" numbers). */
export interface CensusMetrics {
  mislabel_suppressed: number; // StandardStatus live on-market, but DB status terminal → hidden
  stale_showing: number; //       DB on-market + idx_display_yn=true, but not live on-market
  status_drift: number; //        DB on-market, live on-market, StandardStatus differs
  projection_drift: number; //    listings vs listing_search_projection disagree
  missing_inventory: number; //   live on-market ListingId absent from listings
}

/** Volume counts (sudden-growth detector) — keyed on Cotality StandardStatus. */
export interface VolumeMetrics {
  total: number;
  active: number;
  pending: number;
  coming_soon: number;
  closed: number;
  withdrawn: number;
}

/** Emitted by a reconcile/feed-reconcile run (the run summary + ghost alert). */
export interface RunMetrics {
  duration_ms: number;
  live_examined: number;
  rows_updated: number;
  rows_skipped: number;
  rows_errored: number;
  suppressed_fixed: number;
  stale_hidden: number;
  ghosts_detected: number;
  ghosts_transitioned: number;
  ghosts_skipped: number;
  ghosts_failed: number;
}

/** Cotality API health for the run (the feed is only as good as what it returns). */
export interface ApiHealth {
  auth_failures: number;
  throttle_429: number;
  timeouts: number;
  partial_responses: number;
}

export type AlertSeverity = 'critical' | 'high' | 'warning';
export type AlertTransition = 'new' | 'ongoing' | 'recovered';

export interface Alert {
  key: string;
  severity: AlertSeverity;
  transition: AlertTransition;
  count: number;
  message: string;
}

export interface AlertThresholds {
  /** Max overnight |delta| in a volume bucket before "sudden growth" fires. */
  volumeDelta: number;
  /** Max ghosts transitioned in one run before it looks like a feed reset. */
  ghostTransition: number;
  /** Tolerated 429s / timeouts before a warning. */
  throttle: number;
  timeouts: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  volumeDelta: 2000, // Closed +8,000 overnight must never happen silently again
  ghostTransition: 500, // well under the 2000 GHOST_ABORT_CAP; a normal run withdraws a handful
  throttle: 0,
  timeouts: 0,
};

export interface EvaluateInput {
  census: CensusMetrics;
  volume?: VolumeMetrics;
  run?: RunMetrics;
  api?: ApiHealth;
  /** Previous run's metrics (from persisted history) — enables delta + state-change. */
  prev?: { census: CensusMetrics; volume?: VolumeMetrics } | null;
  thresholds?: Partial<AlertThresholds>;
}

const CENSUS_SPEC: Record<keyof CensusMetrics, { severity: AlertSeverity; label: string }> = {
  mislabel_suppressed: { severity: 'critical', label: 'live Cotality listings suppressed (DB terminal, StandardStatus on-market)' },
  stale_showing: { severity: 'critical', label: 'listings displayed on the site are no longer live in Cotality (§2.05)' },
  missing_inventory: { severity: 'critical', label: 'live on-market Cotality listings missing from the DB' },
  projection_drift: { severity: 'high', label: 'listings ↔ listing_search_projection mismatch' },
  status_drift: { severity: 'warning', label: 'DB StandardStatus disagrees with live on-market status' },
};

function transitionOf(prevCount: number | undefined, count: number): AlertTransition {
  const wasFiring = (prevCount ?? 0) > 0;
  if (count > 0 && !wasFiring) return 'new';
  if (count > 0 && wasFiring) return 'ongoing';
  return 'recovered'; // count === 0 && wasFiring
}

/**
 * Evaluate all alert categories. Returns the alerts that are firing OR just recovered.
 * Sorted critical-first. Callers use `alertsToNotify` to page only on new/recovered.
 */
export function evaluateAlerts(input: EvaluateInput): Alert[] {
  const t = { ...DEFAULT_THRESHOLDS, ...(input.thresholds ?? {}) };
  const alerts: Alert[] = [];

  // 1–4 + status_drift — the five census invariants, with state-change vs prev.
  (Object.keys(CENSUS_SPEC) as Array<keyof CensusMetrics>).forEach((key) => {
    const count = input.census[key] ?? 0;
    const prevCount = input.prev?.census?.[key];
    const transition = transitionOf(prevCount, count);
    if (transition === 'ongoing' || transition === 'new' || (transition === 'recovered' && (prevCount ?? 0) > 0)) {
      // include recovered so the caller can send the "back to healthy" signal
      if (count > 0 || transition === 'recovered') {
        alerts.push({
          key,
          severity: CENSUS_SPEC[key].severity,
          transition,
          count,
          message: transition === 'recovered' ? `RECOVERED: ${CENSUS_SPEC[key].label} back to 0` : `${count} ${CENSUS_SPEC[key].label}`,
        });
      }
    }
  });

  // 6 — Sudden growth detector (volume bucket delta vs previous run).
  if (input.volume && input.prev?.volume) {
    (['closed', 'withdrawn', 'pending', 'active', 'total'] as Array<keyof VolumeMetrics>).forEach((b) => {
      const delta = input.volume![b] - input.prev!.volume![b];
      if (Math.abs(delta) > t.volumeDelta) {
        alerts.push({ key: `volume_${b}`, severity: 'critical', transition: 'new', count: delta, message: `abnormal ${b} volume change of ${delta > 0 ? '+' : ''}${delta} since last run (threshold ±${t.volumeDelta})` });
      }
    });
  }

  // 7 — Ghost transition alert (a run withdrawing an abnormal number = likely feed reset).
  if (input.run && input.run.ghosts_transitioned > t.ghostTransition) {
    alerts.push({ key: 'ghost_transition', severity: 'critical', transition: 'new', count: input.run.ghosts_transitioned, message: `${input.run.ghosts_transitioned} ghosts transitioned in one run (threshold ${t.ghostTransition})` });
  }
  if (input.run && input.run.ghosts_failed > 0) {
    alerts.push({ key: 'ghost_failed', severity: 'high', transition: 'new', count: input.run.ghosts_failed, message: `${input.run.ghosts_failed} ghost transitions FAILED this run` });
  }

  // 8 — Cotality API health.
  if (input.api) {
    if (input.api.auth_failures > 0) alerts.push({ key: 'api_auth', severity: 'critical', transition: 'new', count: input.api.auth_failures, message: `${input.api.auth_failures} Cotality auth failure(s)` });
    if (input.api.partial_responses > 0) alerts.push({ key: 'api_partial', severity: 'high', transition: 'new', count: input.api.partial_responses, message: `${input.api.partial_responses} partial feed response(s) — reconciliation may be incomplete` });
    if (input.api.throttle_429 > t.throttle) alerts.push({ key: 'api_429', severity: 'warning', transition: 'new', count: input.api.throttle_429, message: `${input.api.throttle_429} Cotality 429 throttle(s)` });
    if (input.api.timeouts > t.timeouts) alerts.push({ key: 'api_timeout', severity: 'warning', transition: 'new', count: input.api.timeouts, message: `${input.api.timeouts} Cotality timeout(s)` });
  }

  const order: AlertSeverity[] = ['critical', 'high', 'warning'];
  return alerts.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || Math.abs(b.count) - Math.abs(a.count));
}

export function hasCriticalAlert(alerts: Alert[]): boolean {
  return alerts.some((a) => a.severity === 'critical' && a.transition !== 'recovered');
}

/** No-spam filter: page only on transitions into/out of unhealthy, never on ongoing. */
export function alertsToNotify(alerts: Alert[]): Alert[] {
  return alerts.filter((a) => a.transition === 'new' || a.transition === 'recovered');
}

/** One-look structured health report emitted after every reconcile/monitor run. */
export function formatSummary(args: {
  runTime: string;
  census: CensusMetrics;
  volume?: VolumeMetrics;
  run?: RunMetrics;
  api?: ApiHealth;
}): string {
  const { runTime, census, volume, run, api } = args;
  const L: string[] = [];
  L.push(`── Feed Reconcile Summary @ ${runTime} ──`);
  if (run) {
    L.push(`run: duration=${run.duration_ms}ms  live_examined=${run.live_examined}  updated=${run.rows_updated}  skipped=${run.rows_skipped}  errored=${run.rows_errored}`);
    L.push(`corrections: suppressed_fixed=${run.suppressed_fixed}  stale_hidden=${run.stale_hidden}`);
    L.push(`ghosts: detected=${run.ghosts_detected}  transitioned=${run.ghosts_transitioned}  skipped=${run.ghosts_skipped}  failed=${run.ghosts_failed}`);
  }
  if (volume) L.push(`volume: total=${volume.total}  active=${volume.active}  pending=${volume.pending}  comingSoon=${volume.coming_soon}  closed=${volume.closed}  withdrawn=${volume.withdrawn}`);
  if (api) L.push(`api: auth_failures=${api.auth_failures}  429=${api.throttle_429}  timeouts=${api.timeouts}  partial=${api.partial_responses}`);
  L.push(`census: MISLABEL_SUPPRESSED=${census.mislabel_suppressed}  STALE_SHOWING=${census.stale_showing}  STATUS_DRIFT=${census.status_drift}  PROJECTION_DRIFT=${census.projection_drift}  MISSING_INVENTORY=${census.missing_inventory}`);
  return L.join('\n');
}
