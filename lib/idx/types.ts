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
 *
 * @see https://www.reso.org/data-dictionary/
 */

/**
 * Minimal canonical listing type for internal use.
 * Aligned with RESO Data Dictionary where applicable.
 */
export interface IDXListing {
  // Identifiers
  listingId: string;
  mlsId: string;

  // Status
  standardStatus: 'Active' | 'Pending' | 'Sold' | 'Withdrawn' | 'Expired' | 'Canceled';
  listingType: 'sale' | 'rent';

  // Address (RESO-aligned)
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    city: string;
    stateOrProvince: string;
    postalCode: string;
    county: string;
  };

  // Price
  listPrice: number;
  originalListPrice: number;
  closePrice: number | null;

  // Property Details
  propertyType: string;
  propertySubType: string | null;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  livingArea: number | null;
  lotSizeArea: number | null;
  yearBuilt: number | null;

  // Dates
  listingContractDate: string;
  modificationTimestamp: string;

  // Agent/Office
  listAgentMlsId: string;
  listAgentFullName: string;
  listOfficeMlsId: string;
  listOfficeName: string;

  // Media
  media: {
    url: string;
    mediaType: 'Photo' | 'Video' | 'VirtualTour' | 'FloorPlan';
    order: number;
  }[];

  // Compliance
  _source: 'idx' | 'exclusive' | 'manual';
  _lastFetched: string;
  _displayCompliance: {
    requiresAttribution: boolean;
    attributionText: string;
    disclaimerRequired: boolean;
  };
}

/**
 * IDX fetch result wrapper with compliance metadata
 */
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
