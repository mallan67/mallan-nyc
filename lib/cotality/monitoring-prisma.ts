/**
 * Read-only monitoring Prisma client for the /crm/system-status page ONLY.
 *
 * Purpose: let a PREVIEW (or any) deployment display REAL production sync health
 * (pooling / last runs / cursor lag) without the application itself running on
 * production. It connects via a SEPARATE env var `MONITORING_DATABASE_URL` that
 * MUST be a read-only (SELECT-only) Postgres role on the production Neon DB.
 *
 * Guardrails:
 *  - Used exclusively by lib/cotality/system-status.ts (server-only).
 *  - NEVER used by general application routes (they use the default `@/lib/prisma`).
 *  - The URL value is never returned, logged, or sent to the client — callers may
 *    only read the `isMonitoringConfigured()` / pooled boolean derived from it.
 *  - Returns null when the env var is unset, so the status page degrades to
 *    "Production monitoring unavailable" instead of falling back to app data.
 */
import { PrismaClient } from '@prisma/client';

let cached: PrismaClient | null | undefined;

export function isMonitoringConfigured(): boolean {
  return !!process.env.MONITORING_DATABASE_URL;
}

/** Boolean only — never expose the hostname or connection string. */
export function isMonitoringPooled(): boolean | null {
  const url = process.env.MONITORING_DATABASE_URL;
  if (!url) return null;
  return /-pooler\./.test(url);
}

/** Cached read-only client, or null when MONITORING_DATABASE_URL is unset. */
export function getMonitoringPrisma(): PrismaClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.MONITORING_DATABASE_URL;
  cached = url
    ? new PrismaClient({ datasources: { db: { url } } })
    : null;
  return cached;
}
