/**
 * Structured Trestle/IDX Access Logger
 *
 * COMPLIANCE: REBNY requires auditable logs of all MLS data access.
 * This module logs every Trestle API call with structured metadata
 * for compliance audits and forensics.
 *
 * Logs are written to:
 * 1. Vercel structured logs (console.log JSON) — searchable in Vercel dashboard
 * 2. Prisma AuditEvent table — persistent, queryable
 *
 * Retention: Follow REBNY document retention policy.
 */

import prisma from '@/lib/prisma';

export interface TrestleAccessLog {
  /** API endpoint called (e.g., "/api/listings", "/api/listings/:id") */
  endpoint: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** What Trestle resource was queried */
  trestleResource: 'Property' | 'Media' | 'OpenHouse' | 'Office' | 'Member';
  /** OData $filter used (if any) */
  filter?: string;
  /** Number of records returned */
  recordCount: number;
  /** Number of records filtered out by distribution gates */
  gateFilteredCount?: number;
  /** Specific listing IDs accessed (for single-listing queries) */
  listingIds?: string[];
  /** Caller identity (IP, session, agent ID if authenticated) */
  caller: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
    agentId?: string;
  };
  /** Response time in ms */
  durationMs: number;
  /** HTTP status code returned */
  statusCode: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Log a Trestle data access event.
 * Writes structured JSON to stdout (Vercel logs) and persists to DB.
 */
export async function logTrestleAccess(log: TrestleAccessLog): Promise<void> {
  // 1. Structured console log (Vercel dashboard, instantly searchable)
  const structuredLog = {
    _type: 'trestle_access',
    timestamp: new Date().toISOString(),
    endpoint: log.endpoint,
    method: log.method,
    resource: log.trestleResource,
    filter: log.filter || null,
    records: log.recordCount,
    gateFiltered: log.gateFilteredCount || 0,
    listingIds: log.listingIds?.slice(0, 10) || [], // Cap at 10 for log size
    durationMs: log.durationMs,
    status: log.statusCode,
    callerIp: log.caller.ip ? redactIp(log.caller.ip) : null,
    agentId: log.caller.agentId || null,
    error: log.error || null,
  };
  console.log(JSON.stringify(structuredLog));

  // 2. Persist to AuditEvent table (non-blocking, non-fatal)
  try {
    await prisma.auditEvent.create({
      data: {
        action: 'trestle_data_access',
        entity_type: 'listing',
        entity_id: log.listingIds?.[0] || log.endpoint,
        user_type: log.caller.agentId ? 'agent' : 'public',
        user_id: log.caller.agentId ? BigInt(log.caller.agentId) : null,
        changes: {
          endpoint: log.endpoint,
          resource: log.trestleResource,
          filter: log.filter,
          recordCount: log.recordCount,
          gateFilteredCount: log.gateFilteredCount || 0,
          durationMs: log.durationMs,
          statusCode: log.statusCode,
          error: log.error,
        },
      },
    });
  } catch (err) {
    // Non-fatal — structured console log is the backup
    console.warn('[audit] Failed to persist trestle access log:', err);
  }
}

/**
 * Redact IP address for privacy (keep first two octets only).
 * e.g., "192.168.1.100" → "192.168.x.x"
 */
function redactIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  // IPv6 or other — just truncate
  return ip.slice(0, 10) + '...';
}
