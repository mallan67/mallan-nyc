/**
 * IDX/MLS Canonical Types
 *
 * COMPLIANCE NOTE:
 * These types represent the internal canonical representation of listing data.
 * They are RESO-aligned but not endpoint-specific.
 *
 * MLS/IDX data accessed through these types MUST:
 * - Only be fetched server-side
 * - Never be exposed to client-side bundles
 * - Include required attribution/disclaimers when displayed
 * - Be logged for audit purposes
 */

/**
 * OAuth2 token from Trestle OIDC endpoint.
 */
export interface TrestleAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Internal: absolute expiry timestamp (ms). */
  _expiresAt: number;
}

/**
 * Raw listing record from Trestle API (902 IDX Plus fields across 7 resources).
 */
export type TrestleRawListing = Record<string, unknown>;

export interface IDXFetchResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  _meta: {
    source: 'idx' | 'cache' | 'fallback';
    fetchedAt: string;
    idxEnabled: boolean;
    credentialsPresent: boolean;
  };
}

/**
 * IDX configuration (server-side only)
 */
export interface IDXConfig {
  enabled: boolean;
  credentialsPresent: boolean;
  endpoint?: string;
  refreshIntervalMs?: number;
}

/**
 * Audit log entry for IDX access
 */
export interface IDXAuditLogEntry {
  timestamp: string;
  action: 'fetch' | 'cache_hit' | 'cache_miss' | 'error';
  endpoint: string;
  listingId?: string;
  resultStatus: 'success' | 'error' | 'disabled' | 'no_credentials';
  durationMs?: number;
  errorMessage?: string;
}

/**
 * Sync result from IDX pipeline
 */
export interface IDXSyncResult {
  total_fetched: number;
  upserted: number;
  skipped_gates: number;
  skipped_validation: number;
  errors: number;
  duration_ms: number;
}
