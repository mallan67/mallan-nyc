/**
 * Read-only Cotality sync system-status snapshot for the protected
 * /crm/system-status page and GET /api/crm/system-status.
 *
 * Two DISTINCT data sources, always labeled explicitly and never conflated:
 *  - Application environment (this deployment): preview / production, and whether
 *    the app DB connection (DATABASE_URL) is pooled or direct.
 *  - Monitoring data source: the PRODUCTION sync state, read via a SEPARATE
 *    read-only role (MONITORING_DATABASE_URL, see lib/cotality/monitoring-prisma.ts).
 *    If that is not configured, the status is "Production monitoring unavailable" —
 *    we NEVER substitute preview values and label them production.
 *
 * SELECT-only. Neither DATABASE_URL nor MONITORING_DATABASE_URL is ever returned,
 * logged, or sent to the client — only pooled/direct booleans derived from them.
 */
import vercelConfig from '../../vercel.json';
import { getMonitoringPrisma, isMonitoringConfigured, isMonitoringPooled } from './monitoring-prisma';
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

function cronToMinutes(cron: string | null): number | null {
  if (!cron) return null;
  const every = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (every) return Number(every[1]);
  if (/^\d+\s+\*\s+\*\s+\*\s+\*$/.test(cron)) return 60; // "N * * * *" = hourly
  return null;
}

function health(lagMin: number | null, warnMin: number, critMin: number): Health {
  if (lagMin == null) return 'unknown';
  if (lagMin >= critMin) return 'critical';
  if (lagMin >= warnMin) return 'warning';
  return 'healthy';
}

export interface PipelineStatus {
  target_poll_min: number;
  configured_cron: string | null;
  configured_poll_min: number | null;
  poll_drift: boolean;
  last_run_at: string | null;
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
  app_db: { connection: 'pooled' | 'direct' };
  monitoring: { available: boolean; source: string; connection: 'pooled' | 'direct' | null };
  enforcement: string;
  cotality_refresh_targets: { property_min: number; image_min: number };
  property: PipelineStatus;
  media: PipelineStatus;
  note: string;
}

export async function getCotalitySystemStatus(): Promise<SystemStatus> {
  const crons = ((vercelConfig as { crons?: Array<{ path: string; schedule: string }> }).crons) ?? [];
  const findCron = (p: string) => crons.find((c) => c.path === p)?.schedule ?? null;
  const propCron = findCron('/api/cron/idx-sync');
  const mediaCron = findCron('/api/cron/media-sync');

  // Application env + app-DB pooling (booleans only; URLs never exposed).
  const application_environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown';
  const appDbPooled = /-pooler\./.test(process.env.DATABASE_URL ?? '');

  // Monitoring source = production read-only (separate role). Unavailable if unset.
  const monAvailable = isMonitoringConfigured();
  const mon = getMonitoringPrisma();

  const now = Date.now();
  const [prop, media] = monAvailable && mon
    ? await Promise.all([
        mon.syncState.findUnique({ where: { resource: 'Property' } }).catch(() => null),
        mon.mediaSyncState.findFirst({ where: { resource: 'Media' } }).catch(() => null),
      ])
    : [null, null];

  const ageMin = (d: Date | null | undefined) => (d ? Math.round((now - new Date(d).getTime()) / 60000) : null);
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

  const propConfigMin = cronToMinutes(propCron);
  const mediaConfigMin = cronToMinutes(mediaCron);

  const property: PipelineStatus = {
    target_poll_min: MALLAN_PROPERTY_POLL_MINUTES,
    configured_cron: propCron,
    configured_poll_min: propConfigMin,
    poll_drift: propConfigMin !== MALLAN_PROPERTY_POLL_MINUTES,
    last_run_at: iso(prop?.last_run_at),
    last_run_status: prop?.last_run_status ?? null,
    last_run_age_min: ageMin(prop?.last_run_at),
    run_health: health(ageMin(prop?.last_run_at), PROPERTY_RUN_WARNING_MINUTES, PROPERTY_RUN_CRITICAL_MINUTES),
    cursor_watermark: iso(prop?.last_watermark),
    cursor_lag_min: ageMin(prop?.last_watermark),
    cursor_health: health(ageMin(prop?.last_watermark), PROPERTY_CURSOR_WARNING_MINUTES, PROPERTY_CURSOR_CRITICAL_MINUTES),
  };

  const mediaStatus: PipelineStatus = {
    target_poll_min: MALLAN_MEDIA_POLL_MINUTES,
    configured_cron: mediaCron,
    configured_poll_min: mediaConfigMin,
    poll_drift: mediaConfigMin !== MALLAN_MEDIA_POLL_MINUTES,
    last_run_at: iso(media?.last_run_at),
    last_run_status: media?.last_run_status ?? null,
    last_run_age_min: ageMin(media?.last_run_at),
    run_health: health(ageMin(media?.last_run_at), MEDIA_RUN_WARNING_MINUTES, MEDIA_RUN_CRITICAL_MINUTES),
    cursor_watermark: iso(media?.last_photos_change),
    cursor_lag_min: ageMin(media?.last_photos_change),
    cursor_health: health(ageMin(media?.last_photos_change), MEDIA_CURSOR_WARNING_MINUTES, MEDIA_CURSOR_CRITICAL_MINUTES),
  };

  return {
    generated_at: new Date(now).toISOString(),
    application_environment,
    app_db: { connection: appDbPooled ? 'pooled' : 'direct' },
    monitoring: {
      available: monAvailable,
      source: monAvailable ? 'Production — read only' : 'Production monitoring unavailable',
      connection: monAvailable ? (isMonitoringPooled() ? 'pooled' : 'direct') : null,
    },
    enforcement: COTALITY_CADENCE_ENFORCEMENT,
    cotality_refresh_targets: {
      property_min: COTALITY_PROPERTY_REFRESH_TARGET_MINUTES,
      image_min: COTALITY_IMAGE_REFRESH_TARGET_MINUTES,
    },
    property,
    media: mediaStatus,
    note: monAvailable
      ? 'Runs & cursor values are read from the PRODUCTION Neon DB via a read-only monitoring role. Cadence target is the canonical standard; configured cron is this deployment\'s vercel.json. Precise inter-run interval is confirmed in Vercel cron logs.'
      : 'MONITORING_DATABASE_URL is not configured, so production run/cursor values are unavailable here. Target vs configured cadence (drift) is still shown. Configure a read-only production monitoring role to populate live values — never substitute preview data as production.',
  };
}
