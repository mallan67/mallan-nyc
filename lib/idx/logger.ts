/**
 * IDX Audit Logger
 *
 * COMPLIANCE NOTE:
 * All IDX/MLS data access must be logged for audit purposes.
 * REBNY reserves the right to audit systems and access logs.
 *
 * Rules:
 * - No PII in logs
 * - No credentials in logs
 * - Server-side only
 * - Timestamps in ISO 8601 format
 */

import type { IDXAuditLogEntry } from './types';

/**
 * Log levels for IDX operations
 */
type LogLevel = 'info' | 'warn' | 'error';

/**
 * Internal log formatter
 */
function formatLogEntry(level: LogLevel, entry: IDXAuditLogEntry): string {
  const prefix = `[IDX:${level.toUpperCase()}]`;
  const timestamp = entry.timestamp;
  const action = entry.action;
  const status = entry.resultStatus;
  const endpoint = entry.endpoint;
  const listingId = entry.listingId ? ` listing=${entry.listingId}` : '';
  const duration = entry.durationMs !== undefined ? ` duration=${entry.durationMs}ms` : '';
  const error = entry.errorMessage ? ` error="${entry.errorMessage}"` : '';

  return `${prefix} ${timestamp} action=${action} endpoint=${endpoint} status=${status}${listingId}${duration}${error}`;
}

/**
 * Log an IDX access attempt
 *
 * @param entry - Audit log entry (no PII, no credentials)
 */
export function logIDXAccess(entry: IDXAuditLogEntry): void {
  // Only log on server
  if (typeof window !== 'undefined') {
    console.warn('[IDX] Attempted to log from client-side. Ignoring.');
    return;
  }

  const level: LogLevel = entry.resultStatus === 'error' ? 'error' :
                          entry.resultStatus === 'disabled' ? 'warn' : 'info';

  const formatted = formatLogEntry(level, entry);

  // Use appropriate console method
  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }

  // Future: Send to external logging service (e.g., DataDog, Splunk)
  // This would be implemented when audit requirements are finalized
}

/**
 * Create a standardized audit log entry
 */
export function createAuditEntry(
  action: IDXAuditLogEntry['action'],
  endpoint: string,
  resultStatus: IDXAuditLogEntry['resultStatus'],
  options?: {
    listingId?: string;
    durationMs?: number;
    errorMessage?: string;
  }
): IDXAuditLogEntry {
  return {
    timestamp: new Date().toISOString(),
    action,
    endpoint,
    resultStatus,
    listingId: options?.listingId,
    durationMs: options?.durationMs,
    errorMessage: options?.errorMessage,
  };
}

/**
 * Helper to log a fetch attempt
 */
export function logFetchAttempt(
  endpoint: string,
  listingId?: string
): { startTime: number; complete: (status: IDXAuditLogEntry['resultStatus'], error?: string) => void } {
  const startTime = Date.now();

  return {
    startTime,
    complete: (status: IDXAuditLogEntry['resultStatus'], error?: string) => {
      const entry = createAuditEntry('fetch', endpoint, status, {
        listingId,
        durationMs: Date.now() - startTime,
        errorMessage: error,
      });
      logIDXAccess(entry);
    },
  };
}
