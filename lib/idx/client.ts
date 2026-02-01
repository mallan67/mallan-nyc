/**
 * IDX Client - Server-Side Only
 *
 * COMPLIANCE CRITICAL:
 * - This module MUST ONLY be used server-side
 * - All IDX access is logged for audit purposes
 * - IDX_ENABLED feature flag must be true to use
 * - Trestle/REBNY credentials must be present
 *
 * PROHIBITED:
 * - Client-side imports
 * - Exposing MLS data via public JSON endpoints
 * - AI/ML training with MLS data
 *
 * @module lib/idx/client
 */

import type { IDXListing, IDXFetchResult, IDXConfig } from './types';
import { logFetchAttempt, createAuditEntry, logIDXAccess } from './logger';

// Ensure server-side only
if (typeof window !== 'undefined') {
  throw new Error(
    '[IDX] COMPLIANCE VIOLATION: IDX client imported on client-side. ' +
    'MLS/IDX data must only be accessed server-side.'
  );
}

/**
 * IDX configuration from environment
 */
function getIDXConfig(): IDXConfig {
  const enabled = process.env.IDX_ENABLED === 'true';
  const credentialsPresent = Boolean(
    process.env.IDX_API_KEY &&
    process.env.IDX_API_SECRET
  );

  return {
    enabled,
    credentialsPresent,
    endpoint: process.env.IDX_ENDPOINT,
    refreshIntervalMs: parseInt(process.env.IDX_REFRESH_INTERVAL_MS || '300000', 10),
  };
}

/**
 * Check if IDX is available and properly configured
 */
export function isIDXAvailable(): boolean {
  const config = getIDXConfig();
  return config.enabled && config.credentialsPresent;
}

/**
 * Get current IDX configuration status (safe for logging)
 */
export function getIDXStatus(): {
  enabled: boolean;
  credentialsPresent: boolean;
  ready: boolean;
} {
  const config = getIDXConfig();
  return {
    enabled: config.enabled,
    credentialsPresent: config.credentialsPresent,
    ready: config.enabled && config.credentialsPresent,
  };
}

/**
 * IDX Error class for typed error handling
 */
export class IDXError extends Error {
  constructor(
    message: string,
    public readonly code: 'DISABLED' | 'NO_CREDENTIALS' | 'NOT_IMPLEMENTED' | 'FETCH_ERROR'
  ) {
    super(message);
    this.name = 'IDXError';
  }
}

/**
 * Validate IDX is ready, throw appropriate error if not
 */
function validateIDXReady(): void {
  const config = getIDXConfig();

  if (!config.enabled) {
    throw new IDXError(
      'IDX is disabled. Set IDX_ENABLED=true to enable IDX integration.',
      'DISABLED'
    );
  }

  if (!config.credentialsPresent) {
    throw new IDXError(
      'IDX credentials not configured. Set IDX_API_KEY and IDX_API_SECRET.',
      'NO_CREDENTIALS'
    );
  }
}

/**
 * Fetch listings from IDX
 *
 * STUB: This function is a placeholder. Actual implementation
 * will be added when Trestle/REBNY credentials are received.
 *
 * @param params - Query parameters
 * @returns Fetch result with listings or error
 */
export async function fetchListings(_params?: {
  type?: 'sale' | 'rent';
  neighborhood?: string;
  borough?: string;
  minPrice?: number;
  maxPrice?: number;
  beds?: number;
  limit?: number;
}): Promise<IDXFetchResult<IDXListing[]>> {
  const logger = logFetchAttempt('fetchListings');
  const config = getIDXConfig();

  try {
    validateIDXReady();

    // STUB: Actual implementation pending credentials
    // Log the attempt with NOT_IMPLEMENTED status
    logger.complete('error', 'IDX fetch not yet implemented - awaiting credentials');

    throw new IDXError(
      'IDX fetch not yet implemented. Awaiting Trestle/REBNY credentials and endpoint approval.',
      'NOT_IMPLEMENTED'
    );
  } catch (error) {
    const isIDXError = error instanceof IDXError;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = isIDXError && error.code === 'DISABLED' ? 'disabled' :
                   isIDXError && error.code === 'NO_CREDENTIALS' ? 'no_credentials' : 'error';

    if (!isIDXError || error.code !== 'NOT_IMPLEMENTED') {
      logger.complete(status, errorMessage);
    }

    return {
      success: false,
      data: null,
      error: errorMessage,
      _meta: {
        source: 'idx',
        fetchedAt: new Date().toISOString(),
        idxEnabled: config.enabled,
        credentialsPresent: config.credentialsPresent,
      },
    };
  }
}

/**
 * Fetch a single listing by ID from IDX
 *
 * STUB: This function is a placeholder. Actual implementation
 * will be added when Trestle/REBNY credentials are received.
 *
 * @param listingId - The listing ID to fetch
 * @returns Fetch result with listing or error
 */
export async function fetchListingById(
  listingId: string
): Promise<IDXFetchResult<IDXListing>> {
  const logger = logFetchAttempt('fetchListingById', listingId);
  const config = getIDXConfig();

  try {
    validateIDXReady();

    // STUB: Actual implementation pending credentials
    logger.complete('error', 'IDX fetch not yet implemented - awaiting credentials');

    throw new IDXError(
      'IDX fetch not yet implemented. Awaiting Trestle/REBNY credentials and endpoint approval.',
      'NOT_IMPLEMENTED'
    );
  } catch (error) {
    const isIDXError = error instanceof IDXError;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = isIDXError && error.code === 'DISABLED' ? 'disabled' :
                   isIDXError && error.code === 'NO_CREDENTIALS' ? 'no_credentials' : 'error';

    if (!isIDXError || error.code !== 'NOT_IMPLEMENTED') {
      logger.complete(status, errorMessage);
    }

    return {
      success: false,
      data: null,
      error: errorMessage,
      _meta: {
        source: 'idx',
        fetchedAt: new Date().toISOString(),
        idxEnabled: config.enabled,
        credentialsPresent: config.credentialsPresent,
      },
    };
  }
}

/**
 * Log an IDX access denial for audit purposes
 * Call this when IDX data is requested but cannot be served
 */
export function logAccessDenied(reason: string, endpoint: string, listingId?: string): void {
  const entry = createAuditEntry('fetch', endpoint, 'disabled', {
    listingId,
    errorMessage: reason,
  });
  logIDXAccess(entry);
}
