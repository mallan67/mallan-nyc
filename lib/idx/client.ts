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
 * IMPLEMENTATION NOTE:
 * fetchListings() and fetchListingById() query the LOCAL Prisma DB,
 * NOT Trestle directly. Data enters local DB via sync pipeline (lib/idx/sync.ts).
 *
 * @module lib/idx/client
 */

import type { IDXListing, IDXFetchResult, IDXConfig } from './types';
import { logFetchAttempt, createAuditEntry, logIDXAccess } from './logger';
import { generateAttributionText } from './mapping';
import prisma from '@/lib/prisma';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';

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
    process.env.IDX_CLIENT_ID &&
    process.env.IDX_CLIENT_SECRET
  );
  const endpoint = process.env.TRESTLE_API_URL;

  if (enabled && !endpoint && process.env.NODE_ENV === 'production') {
    throw new Error('TRESTLE_API_URL is required when IDX is enabled in production');
  }

  return {
    enabled,
    credentialsPresent,
    endpoint,
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
      'IDX credentials not configured. Set IDX_CLIENT_ID and IDX_CLIENT_SECRET.',
      'NO_CREDENTIALS'
    );
  }
}

/**
 * Map a Prisma listing record to the IDXListing canonical type.
 */
function prismaToIDXListing(record: {
  listing_id: string;
  mls_id: string | null;
  status: string;
  listing_type: string;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: unknown;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: unknown;
  borough: string | null;
  neighborhood: string | null;
  city: string | null;
  postal_code: string | null;
  address: unknown;
  features: unknown;
  media: unknown;
  compliance: unknown;
  agent_info: unknown;
  modification_timestamp: Date;
  listing_contract_date: Date | null;
}): IDXListing {
  const addr = (record.address || {}) as Record<string, unknown>;
  const agentInfo = (record.agent_info || {}) as Record<string, unknown>;
  const comp = (record.compliance || {}) as Record<string, unknown>;

  return {
    listingId: record.listing_id,
    mlsId: record.mls_id || record.listing_id,
    standardStatus: record.status as IDXListing['standardStatus'],
    listingType: record.listing_type as 'sale' | 'rent',
    address: {
      streetNumber: String(addr.StreetNumber || ''),
      streetName: String(addr.StreetName || ''),
      unitNumber: addr.UnitNumber ? String(addr.UnitNumber) : null,
      city: record.city || String(addr.City || ''),
      stateOrProvince: String(addr.StateOrProvince || 'NY'),
      postalCode: record.postal_code || String(addr.PostalCode || ''),
      county: String(addr.CountyOrParish || ''),
      latitude: addr.Latitude != null ? Number(addr.Latitude) : undefined,
      longitude: addr.Longitude != null ? Number(addr.Longitude) : undefined,
    },
    listPrice: Number(record.list_price) || 0,
    originalListPrice: Number(comp.OriginalListPrice || record.list_price) || 0,
    closePrice: comp.ClosePrice != null ? Number(comp.ClosePrice) : null,
    propertyType: record.property_type || '',
    propertySubType: record.property_sub_type,
    bedroomsTotal: record.bedrooms_total || 0,
    bathroomsFull: record.bathrooms_full || 0,
    bathroomsHalf: record.bathrooms_half || 0,
    livingArea: record.living_area != null ? Number(record.living_area) : null,
    lotSizeArea: null,
    yearBuilt: null,
    listingContractDate: record.listing_contract_date?.toISOString() || '',
    modificationTimestamp: record.modification_timestamp.toISOString(),
    listAgentMlsId: String(agentInfo.ListAgentMlsId || agentInfo.ListAgentKey || ''),
    listAgentFullName: String(agentInfo.ListAgentFullName || ''),
    listOfficeMlsId: String(agentInfo.ListOfficeMlsId || agentInfo.ListOfficeKey || ''),
    listOfficeName: String(agentInfo.ListOfficeName || ''),
    media: Array.isArray(record.media) ? record.media.map((m: unknown, i: number) => {
      const item = m as Record<string, unknown>;
      return {
        url: String(item.MediaURL || item.url || ''),
        mediaType: (String(item.MediaType || item.mediaType || 'Photo')) as 'Photo' | 'Video' | 'VirtualTour' | 'FloorPlan',
        order: Number(item.Order || item.order || i),
      };
    }) : [],
    _source: 'idx',
    _lastFetched: new Date().toISOString(),
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: generateAttributionText(),
      disclaimerRequired: true,
    },
  };
}

/**
 * Fetch listings from local Prisma DB (synced from Trestle).
 * Does NOT call Trestle directly — data comes via sync pipeline.
 */
export async function fetchListings(params?: {
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

    // Build Prisma where clause
    const where: Record<string, unknown> = {
      idx_display_yn: true,
      owner_opt_out: false,
      // Canonical values — was `['Active', 'Coming Soon', 'Active Under Contract']`
      // with space-formatted names that never matched DB values (which
      // are canonical RESO `ComingSoon`/`ActiveUnderContract` no-space).
      // Result: this filter was effectively `status: 'Active'` only.
      status: { in: [...ACTIVE_DISPLAY_VALUES] },
    };

    if (params?.type) where.listing_type = params.type === 'sale' ? 'sale' : 'rent';
    if (params?.borough) where.borough = params.borough;
    if (params?.neighborhood) where.neighborhood = params.neighborhood;
    if (params?.beds) where.bedrooms_total = { gte: params.beds };
    if (params?.minPrice || params?.maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (params?.minPrice) priceFilter.gte = params.minPrice;
      if (params?.maxPrice) priceFilter.lte = params.maxPrice;
      where.list_price = priceFilter;
    }

    const records = await prisma.listing.findMany({
      where,
      take: params?.limit || 50,
      orderBy: { modification_timestamp: 'desc' },
    });

    const listings = records.map(prismaToIDXListing);

    logger.complete('success');

    return {
      success: true,
      data: listings,
      _meta: {
        source: 'idx',
        fetchedAt: new Date().toISOString(),
        idxEnabled: config.enabled,
        credentialsPresent: config.credentialsPresent,
      },
    };
  } catch (error) {
    const isIDXError = error instanceof IDXError;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = isIDXError && error.code === 'DISABLED' ? 'disabled' :
                   isIDXError && error.code === 'NO_CREDENTIALS' ? 'no_credentials' : 'error';

    logger.complete(status, errorMessage);

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
 * Fetch a single listing by ID from local Prisma DB.
 */
export async function fetchListingById(
  listingId: string
): Promise<IDXFetchResult<IDXListing>> {
  const logger = logFetchAttempt('fetchListingById', listingId);
  const config = getIDXConfig();

  try {
    validateIDXReady();

    const record = await prisma.listing.findUnique({
      where: { listing_id: listingId },
    });

    if (!record) {
      logger.complete('error', 'Listing not found');
      return {
        success: false,
        data: null,
        error: 'Listing not found',
        _meta: {
          source: 'idx',
          fetchedAt: new Date().toISOString(),
          idxEnabled: config.enabled,
          credentialsPresent: config.credentialsPresent,
        },
      };
    }

    const listing = prismaToIDXListing(record);
    logger.complete('success');

    return {
      success: true,
      data: listing,
      _meta: {
        source: 'idx',
        fetchedAt: new Date().toISOString(),
        idxEnabled: config.enabled,
        credentialsPresent: config.credentialsPresent,
      },
    };
  } catch (error) {
    const isIDXError = error instanceof IDXError;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = isIDXError && error.code === 'DISABLED' ? 'disabled' :
                   isIDXError && error.code === 'NO_CREDENTIALS' ? 'no_credentials' : 'error';

    logger.complete(status, errorMessage);

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
 */
export function logAccessDenied(reason: string, endpoint: string, listingId?: string): void {
  const entry = createAuditEntry('fetch', endpoint, 'disabled', {
    listingId,
    errorMessage: reason,
  });
  logIDXAccess(entry);
}
