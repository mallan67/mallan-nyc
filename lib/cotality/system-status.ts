/**
 * Read-only Cotality sync system-status snapshot for the protected
 * /crm/system-status page and GET /api/crm/system-status.
 *
 * Two DISTINCT data sources, always labeled explicitly and never conflated:
 *  - Application environment (this deployment): preview / production, and whether
 *    the app DB connection (DATABASE_URL) is pooled / direct / unknown.
 *  - Monitoring data source: PRODUCTION sync state, read via a SEPARATE read-only
 *    role (MONITORING_DATABASE_URL). Its state is one of not_configured /
 *    unreachable / unauthorized / ok — "available" ONLY when a query actually
 *    SUCCEEDED (a present env var alone is never "available").
 *
 * SELECT-only, and explicit column selects (so a column-scoped read-only grant is
 * sufficient and no ungranted column is ever requested). Neither DATABASE_URL nor
 * MONITORING_DATABASE_URL is ever returned, logged, or sent to the client — only
 * pooled/direct/unknown booleans-as-enum derived from them.
 */
import vercelConfig from '../../vercel.json';
import { getMonitoringPrisma, isMonitoringConfigured } from './monitoring-prisma';
import {
  MALLAN_PROPERTY_POLL_MINUTES,
  MALLAN_MEDIA_POLL_MINUTES,
  COTALITY_PROPERTY_REFRESH_TARGET_MINUTES,
  COTALITY_IMAGE_REFRESH_TARGET_MINUTES,
  PROPERTY_RUN_WARNING_MINUTES,
  PROPERTY_RUN_CRITICAL_MINUTES,
  MEDIA_RUN_WARNING_MINUTES,
  MEDIA_RUN_CRITICAL_MINUTES,
  PROPERTY_CURSOR_WARNING_MINUTES,
  PROPERTY_CURSOR_CRITICAL_MINUTES,
  MEDIA_CURSOR_WARNING_MINUTES,
  MEDIA_CURSOR_CRITICAL_MINUTES,
  COTALITY_CADENCE_ENFORCEMENT,
} from './sync-standard';

export type Health = 'healthy' | 'warning' | 'critical' | 'unknown';
export type ConnMode = 'pooled' | 'direct' | 'unknown';
export type MonitoringState = 'not_configured' | 'unreachable' | 'unauthorized' | 'ok';

/** pooled / direct / unknown — unknown when the URL env var is absent (never claim "direct"). */
function connMode(url: string | undefined): ConnMode {
  if (!url) return 'unknown';
  return /-pooler\./.test(url) ? 'pooled' : 'direct';
}

function cronToMinutes(cron: string | null): number | null {
  if (!cron) return null;
  const every = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (every) return Number(every[1]);
  if (/^\d+\s+\*\s+\*\s+\*\s+\*$/.test(cron)) return 60; // "N * * * *" = hourly
  return null;
}

/** Run health considers BOTH the last recorded run STATUS and its age. A failed/
 *  errored latest run can never be "healthy" regardless of recency. */
function runHealth(status: string | null, ageMin: number | null): Health {
  if (status && /error|fail/i.test(status)) return 'critical';
  if (status && /partial/i.test(status)) return 'warning';
  return 'unknown'; // age alone does not prove a run happened; see runFreshness
}
/** Freshness of the last recorded run by age against the thresholds. */
function freshness(ageMin: number | null, warn: number, crit: number): Health {
  if (ageMin == null) return 'unknown';
  if (ageMin >= crit) return 'critical';
  if (ageMin >= warn) return 'warning';
  return 'healthy';
}
/** Combined: the worse of status-health and age-freshness. */
function combined(status: string | null, ageMin: number | null, warn: number, crit: number): Health {
  const order: Health[] = ['unknown', 'healthy', 'warning', 'critical'];
  const s = runHealth(status, ageMin);
  const f = freshness(ageMin, warn, crit);
  // 'critical' beats all; then 'warning'; 'unknown' only if both unknown.
  if (s === 'critical' || f === 'critical') return 'critical';
  if (s === 'warning' || f === 'warning') return 'warning';
  if (f === 'healthy') return 'healthy';
  return order[Math.max(order.indexOf(s), order.indexOf(f))];
}

function classifyDbError(e: unknown): MonitoringState {
  const msg = e instanceof Error ? e.message || '' : String(e);
  const code = (e as { code?: string })?.code;
  if (code === 'P1000' || /password authentication|authentication failed/i.test(msg)) return 'unauthorized';
  if (/permission denied|not authorized|must be owner|insufficient privilege/i.test(msg)) return 'unauthorized';
  return 'unreachable';
}

export interface PipelineStatus {
  target_poll_min: number;
  configured_cron: string | null;
  configured_poll_min: number | null;
  poll_drift: boolean;
  last_recorded_run_at: string | null;
  last_run_status: string | null;
  last_run_age_min: number | null;
  run_health: Health;
  cursor_watermark: string | null;
  cursor_lag_min: number | null;
  cursor_health: Health;
}

export interface SystemStatus {
  generated_at: string;
  application_environment: string;
  app_db: { connection: ConnMode };
  monitoring: { state: MonitoringState; available: boolean; source: string; connection: ConnMode };
  enforcement: string;
  cotality_refresh_targets: { property_min: number; image_min: number };
  observed_cadence_available: boolean;
  property: PipelineStatus;
  media: PipelineStatus;
  note: string;
}

const MON_SOURCE: Record<MonitoringState, string> = {
  not_configured: 'Production monitoring unavailable — not configured',
  unreachable: 'Production monitoring unavailable — unreachable',
  unauthorized: 'Production monitoring unavailable — not authorized',
  ok: 'Production — read only',
};

export async function getCotalitySystemStatus(): Promise<SystemStatus> {
  const crons = ((vercelConfig as { crons?: Array<{ path: string; schedule: string }> }).crons) ?? [];
  const findCron = (p: string) => crons.find((c) => c.path === p)?.schedule ?? null;
  const propCron = findCron('/api/cron/idx-sync');
  const mediaCron = findCron('/api/cron/media-sync');

  const application_environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown';
  const appConn = connMode(process.env.DATABASE_URL);
  const monConn = connMode(process.env.MONITORING_DATABASE_URL);

  // Monitoring state machine: configured -> reachable -> authorized. "available"
  // ONLY when a query actually succeeds; errors are classified, not swallowed to ok.
  let monState: MonitoringState = isMonitoringConfigured() ? 'unreachable' : 'not_configured';
  let prop: { last_watermark: Date | null; last_run_at: Date | null; last_run_status: string | null } | null = null;
  let media: { last_photos_change: Date | null; last_run_at: Date | null; last_run_status: string | null } | null = null;

  if (isMonitoringConfigured()) {
    const mon = getMonitoringPrisma();
    if (mon) {
      try {
        [prop, media] = await Promise.all([
          mon.syncState.findUnique({
            where: { resource: 'Property' },
            select: { resource: true, last_watermark: true, last_run_at: true, last_run_status: true },
          }),
          mon.mediaSyncState.findFirst({
            where: { resource: 'Media' },
            select: { resource: true, last_photos_change: true, last_run_at: true, last_run_status: true },
          }),
        ]);
        monState = 'ok';
      } catch (e) {
        monState = classifyDbError(e);
        prop = null;
        media = null;
      }
    }
  }
  const monAvailable = monState === 'ok';

  const now = Date.now();
  const ageMin = (d: Date | null | undefined) => (d ? Math.round((now - new Date(d).getTime()) / 60000) : null);
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  const propConfigMin = cronToMinutes(propCron);
  const mediaConfigMin = cronToMinutes(mediaCron);

  const property: PipelineStatus = {
    target_poll_min: MALLAN_PROPERTY_POLL_MINUTES,
    configured_cron: propCron,
    configured_poll_min: propConfigMin,
    poll_drift: propConfigMin !== MALLAN_PROPERTY_POLL_MINUTES,
    last_recorded_run_at: iso(prop?.last_run_at),
    last_run_status: prop?.last_run_status ?? null,
    last_run_age_min: ageMin(prop?.last_run_at),
    run_health: combined(prop?.last_run_status ?? null, ageMin(prop?.last_run_at), PROPERTY_RUN_WARNING_MINUTES, PROPERTY_RUN_CRITICAL_MINUTES),
    cursor_watermark: iso(prop?.last_watermark),
    cursor_lag_min: ageMin(prop?.last_watermark),
    cursor_health: freshness(ageMin(prop?.last_watermark), PROPERTY_CURSOR_WARNING_MINUTES, PROPERTY_CURSOR_CRITICAL_MINUTES),
  };

  const mediaStatus: PipelineStatus = {
    target_poll_min: MALLAN_MEDIA_POLL_MINUTES,
    configured_cron: mediaCron,
    configured_poll_min: mediaConfigMin,
    poll_drift: mediaConfigMin !== MALLAN_MEDIA_POLL_MINUTES,
    last_recorded_run_at: iso(media?.last_run_at),
    last_run_status: media?.last_run_status ?? null,
    last_run_age_min: ageMin(media?.last_run_at),
    run_health: combined(media?.last_run_status ?? null, ageMin(media?.last_run_at), MEDIA_RUN_WARNING_MINUTES, MEDIA_RUN_CRITICAL_MINUTES),
    cursor_watermark: iso(media?.last_photos_change),
    cursor_lag_min: ageMin(media?.last_photos_change),
    cursor_health: freshness(ageMin(media?.last_photos_change), MEDIA_CURSOR_WARNING_MINUTES, MEDIA_CURSOR_CRITICAL_MINUTES),
  };

  return {
    generated_at: new Date(now).toISOString(),
    application_environment,
    app_db: { connection: appConn },
    monitoring: { state: monState, available: monAvailable, source: MON_SOURCE[monState], connection: monConn },
    enforcement: COTALITY_CADENCE_ENFORCEMENT,
    cotality_refresh_targets: {
      property_min: COTALITY_PROPERTY_REFRESH_TARGET_MINUTES,
      image_min: COTALITY_IMAGE_REFRESH_TARGET_MINUTES,
    },
    // This page verifies CONFIGURATION (target vs cron drift) and FRESHNESS (last
    // recorded run + cursor lag). It does NOT yet verify actual recurring execution
    // (previous run, inter-run interval, missed-run count) — that needs a run-history
    // source; precise cadence is currently only in Vercel cron logs.
    observed_cadence_available: false,
    property,
    media: mediaStatus,
    note: monAvailable
      ? 'Run & cursor values are read from PRODUCTION via a read-only monitoring role. "Last recorded run" is the most recent run of ANY status (see last_run_status). Health combines run status + age. Actual observed cadence (interval between successive runs, missed runs) is NOT shown — only configuration drift and freshness.'
      : `Monitoring state: ${monState}. Live production run/cursor values are not shown (only successful reads count as available). Target-vs-configured cadence drift is still accurate. Preview values are never substituted as production.`,
  };
}
