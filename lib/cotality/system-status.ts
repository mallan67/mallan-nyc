/**
 * Read-only Cotality sync system-status snapshot for the protected
 * /crm/system-status page and GET /api/crm/system-status.
 *
 * Compares the canonical standard (lib/cotality/sync-standard.json) against the
 * currently-configured cron (vercel.json, build-time) and the live cursor/last-run
 * state in Neon (SyncState / MediaSyncState). SELECT-only. Never exposes the
 * DATABASE_URL — only a pooled/direct boolean derived from it.
 */
import prisma from '@/lib/prisma';
import vercelConfig from '../../vercel.json';
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
  return null; // more complex schedule — not a simple minute interval
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
  environment: string;
  enforcement: string;
  neon: { connection: 'pooled' | 'direct' };
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

  // pooled/direct — boolean only; the URL value is never returned or logged.
  const pooled = /-pooler\./.test(process.env.DATABASE_URL ?? '');
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown';

  const now = Date.now();
  const [prop, media] = await Promise.all([
    prisma.syncState.findUnique({ where: { resource: 'Property' } }).catch(() => null),
    prisma.mediaSyncState.findFirst({ where: { resource: 'Media' } }).catch(() => null),
  ]);

  const ageMin = (d: Date | null | undefined) => (d ? Math.round((now - new Date(d).getTime()) / 60000) : null);
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

  const propConfigMin = cronToMinutes(propCron);
  const mediaConfigMin = cronToMinutes(mediaCron);
  const propCursorLag = ageMin(prop?.last_watermark);
  const propRunAge = ageMin(prop?.last_run_at);
  const mediaCursorLag = ageMin(media?.last_photos_change);
  const mediaRunAge = ageMin(media?.last_run_at);

  return {
    generated_at: new Date(now).toISOString(),
    environment,
    enforcement: COTALITY_CADENCE_ENFORCEMENT,
    neon: { connection: pooled ? 'pooled' : 'direct' },
    cotality_refresh_targets: {
      property_min: COTALITY_PROPERTY_REFRESH_TARGET_MINUTES,
      image_min: COTALITY_IMAGE_REFRESH_TARGET_MINUTES,
    },
    property: {
      target_poll_min: MALLAN_PROPERTY_POLL_MINUTES,
      configured_cron: propCron,
      configured_poll_min: propConfigMin,
      poll_drift: propConfigMin !== MALLAN_PROPERTY_POLL_MINUTES,
      last_run_at: iso(prop?.last_run_at),
      last_run_status: prop?.last_run_status ?? null,
      last_run_age_min: propRunAge,
      run_health: health(propRunAge, PROPERTY_RUN_WARNING_MINUTES, PROPERTY_RUN_CRITICAL_MINUTES),
      cursor_watermark: iso(prop?.last_watermark),
      cursor_lag_min: propCursorLag,
      cursor_health: health(propCursorLag, PROPERTY_CURSOR_WARNING_MINUTES, PROPERTY_CURSOR_CRITICAL_MINUTES),
    },
    media: {
      target_poll_min: MALLAN_MEDIA_POLL_MINUTES,
      configured_cron: mediaCron,
      configured_poll_min: mediaConfigMin,
      poll_drift: mediaConfigMin !== MALLAN_MEDIA_POLL_MINUTES,
      last_run_at: iso(media?.last_run_at),
      last_run_status: media?.last_run_status ?? null,
      last_run_age_min: mediaRunAge,
      run_health: health(mediaRunAge, MEDIA_RUN_WARNING_MINUTES, MEDIA_RUN_CRITICAL_MINUTES),
      cursor_watermark: iso(media?.last_photos_change),
      cursor_lag_min: mediaCursorLag,
      cursor_health: health(mediaCursorLag, MEDIA_CURSOR_WARNING_MINUTES, MEDIA_CURSOR_CRITICAL_MINUTES),
    },
    note:
      'Configured cron is read from this deployment\'s vercel.json (build-time). Last-run and cursor values are read live from the CONNECTED Neon DB — in a preview deployment that is the preview branch DB, not canonical production. Precise inter-run interval is confirmed in Vercel cron logs; this page uses last-run recency + cursor lag as the health signal.',
  };
}
