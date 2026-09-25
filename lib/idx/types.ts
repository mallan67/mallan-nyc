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

/**
 * Canonical listing type for internal use.
 * Aligned with RESO Data Dictionary where applicable.
 * Expanded to cover all field categories.
 */
export interface IDXListing {
  // Identifiers
  listingId: string;
  listingKeyNumeric?: number;
  mlsId: string;

  // Status — canonical RESO values (no spaces).
  // Previously this union used spaced forms like 'Coming Soon' and
  // 'Active Under Contract', which DISAGREED with the actual runtime values
  // (DB stores 'ComingSoon', 'ActiveUnderContract'). Comparisons like
  // `=== 'Coming Soon'` type-checked but silently never fired at runtime.
  // See lib/compliance/status.ts for normalization + display-label helpers.
  standardStatus:
    | 'Active'
    | 'ActiveUnderContract'
    // Both spellings appear on real rows: `Canceled` is the live Cotality
    // value the Trestle sync writes raw; `Cancelled` is the value Mallan
    // invented and the CRM write path stored. No backfill is in scope, so
    // the type has to admit both.
    | 'Canceled'
    | 'Cancelled'
    | 'Closed'
    | 'ComingSoon'
    | 'Expired'
    | 'Hold'
    | 'Leased'
    | 'Pending'
    | 'Rented'
    | 'Sold'
    | 'Withdrawn';
  listingType: 'sale' | 'rent';

  // Address (RESO-aligned)
  address: {
    streetNumber: string;
    streetName: string;
    streetDirPrefix?: string;
    streetDirSuffix?: string;
    streetSuffix?: string;
    unitNumber: string | null;
    city: string;
    cityRegion?: string;
    postalCity?: string;
    stateOrProvince: string;
    postalCode: string;
    county: string;
    country?: string;
    crossStreet?: string;
    directions?: string;
    latitude?: number;
    longitude?: number;
    unparsedAddress?: string;
  };

  // Price
  listPrice: number;
  originalListPrice: number;
  previousListPrice?: number;
  closePrice: number | null;

  // Property Details
  propertyType: string;
  propertySubType: string | null;
  commonInterest?: string;
  ownershipType?: string;
  structureType?: string;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  bathroomsTotal?: number;
  livingArea: number | null;
  livingAreaUnits?: string;
  buildingAreaTotal?: number;
  lotSizeArea: number | null;
  lotSizeUnits?: string;
  yearBuilt: number | null;
  storiesTotal?: number;
  roomsTotal?: number;

  // Building
  buildingName?: string;
  architecturalStyle?: string;
  constructionMaterials?: string;
  heating?: string;
  cooling?: string;
  flooring?: string;

  // Amenities
  interiorFeatures?: string;
  buildingFeatures?: string;
  exteriorFeatures?: string;
  appliances?: string;
  laundryFeatures?: string;
  securityFeatures?: string;
  attendanceType?: string;
  accessibilityFeatures?: string;
  communityFeatures?: string;
  associationAmenities?: string;
  parkingFeatures?: string;
  poolFeatures?: string;
  spaFeatures?: string;
  parkingTotal?: number;
  garageSpaces?: number;

  // Financial
  associationFee?: number;
  associationFeeFrequency?: string;
  taxAnnualAmount?: number;
  taxYear?: number;

  // Dates
  listingContractDate: string;
  modificationTimestamp: string;
  onMarketDate?: string;
  closeDate?: string;
  activationDate?: string;
  availabilityDate?: string;

  // Agent/Office
  listAgentMlsId: string;
  listAgentFullName: string;
  /** VIEW-ONLY: visible to agents viewing listings. NEVER exposed to clients or public. Stripped by toPublicDTO(). */
  listAgentEmail?: string;
  listOfficeMlsId: string;
  listOfficeName: string;

  // Media
  media: {
    url: string;
    mediaType: 'Photo' | 'Video' | 'VirtualTour' | 'FloorPlan';
    order: number;
  }[];
  photosCount?: number;
  virtualTourURLBranded?: string;
  virtualTourURLUnbranded?: string;

  // Remarks
  publicRemarks?: string;
  /** INTERNAL-ONLY: broker/company access only. NEVER exposed to clients, agents outside company, or public. Stripped by toPublicDTO(). */
  privateRemarks?: string;

  // Distribution gates
  idxEntireListingDisplayYN?: boolean;
  internetEntireListingDisplayYN?: boolean;
  internetAddressDisplayYN?: boolean;
  participantOnlyYN?: boolean;

  // Rental-specific
  leaseAmount?: number;
  leaseAmountFrequency?: string;
  petsAllowed?: string;
  furnished?: string;

  // Days on Market
  daysOnMarket?: number;
  cumulativeDaysOnMarket?: number;

  // FARE Act fee transparency (NYC LL 119/2024)
  moveInCosts?: string;
  ongoingFees?: string;
  tenantPays?: string;
  tenantPaysDescription?: string;
  additionalFeeYN?: boolean;
  additionalFee?: number;
  additionalFeeDescription?: string;
  feeFrequency?: string;

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
