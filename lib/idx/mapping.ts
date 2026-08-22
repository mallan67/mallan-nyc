/**
 * RESO-Aligned Field Mapping
 *
 * COMPLIANCE NOTE:
 * Maps RESO Data Dictionary field names to our internal canonical representation.
 * 902 REBNY IDX Plus fields across 7 resources. 23 RESO-to-RLS renames handled.
 * Field truth = the live api.cotality.com/trestle $metadata (RESO-shaped OData model).
 */

import type { IDXListing } from './types';
import { RESO_TO_RLS_RENAMES, ALL_RLS_FIELDS, REQUIRED_RLS_FIELDS } from './trestle-mapper';
import { normalizeStreetCase } from './normalize-street-case';
import { classifyTrestleMediaCategory, type CanonicalMediaType } from '@/lib/media/media-sync-service';

/**
 * RESO Data Dictionary field names — complete set.
 * Organized by category per REBNY RLS structure.
 */
export const RESO_FIELDS = {
  // Identifiers
  ListingId: 'ListingId',
  ListingKey: 'ListingKey',
  SourceSystemKey: 'SourceSystemKey',
  MlsStatus: 'MlsStatus',
  StandardStatus: 'StandardStatus',

  // Address
  StreetNumber: 'StreetNumber',
  StreetName: 'StreetName',
  StreetDirPrefix: 'StreetDirPrefix',
  StreetDirSuffix: 'StreetDirSuffix',
  StreetSuffix: 'StreetSuffix',
  UnitNumber: 'UnitNumber',
  City: 'City',
  CityRegion: 'CityRegion',
  PostalCity: 'PostalCity',
  PostalCode: 'PostalCode',
  StateOrProvince: 'StateOrProvince',
  CountyOrParish: 'CountyOrParish',
  Country: 'Country',
  CrossStreet: 'CrossStreet',
  Directions: 'Directions',
  Latitude: 'Latitude',
  Longitude: 'Longitude',
  UnParsedAddress: 'UnParsedAddress',

  // Price
  ListPrice: 'ListPrice',
  OriginalListPrice: 'OriginalListPrice',
  PreviousListPrice: 'PreviousListPrice',
  ClosePrice: 'ClosePrice',

  // Property Classification
  PropertyType: 'PropertyType',
  PropertySubType: 'PropertySubType',
  CommonInterest: 'CommonInterest',
  OwnershipType: 'OwnershipType',
  StructureType: 'StructureType',
  NewConstructionYN: 'NewConstructionYN',
  NewDevelopmentYN: 'NewDevelopmentYN',

  // Rooms & Size
  BedroomsTotal: 'BedroomsTotal',
  BathroomsFull: 'BathroomsFull',
  BathroomsHalf: 'BathroomsHalf',
  BathroomsTotal: 'BathroomsTotal',
  BathroomsTotalInteger: 'BathroomsTotalInteger',
  LivingArea: 'LivingArea',
  LivingAreaUnits: 'LivingAreaUnits',
  LivingAreaSource: 'LivingAreaSource',
  BuildingAreaTotal: 'BuildingAreaTotal',
  LotSizeArea: 'LotSizeArea',
  LotSizeUnits: 'LotSizeUnits',
  YearBuilt: 'YearBuilt',
  StoriesTotal: 'StoriesTotal',
  RoomsTotal: 'RoomsTotal',

  // Building
  BuildingName: 'BuildingName',
  ArchitecturalStyle: 'ArchitecturalStyle',
  ConstructionMaterials: 'ConstructionMaterials',
  Heating: 'Heating',
  Cooling: 'Cooling',
  FloorNumber: 'FloorNumber',

  // Amenities
  InteriorFeatures: 'InteriorFeatures',
  ExteriorFeatures: 'ExteriorFeatures',
  Appliances: 'Appliances',
  Flooring: 'Flooring',
  LaundryFeatures: 'LaundryFeatures',
  SecurityFeatures: 'SecurityFeatures',
  AttendanceType: 'AttendanceType',
  AccessibilityFeatures: 'AccessibilityFeatures',
  CommunityFeatures: 'CommunityFeatures',
  AssociationAmenities: 'AssociationAmenities',
  ParkingFeatures: 'ParkingFeatures',
  ParkingTotal: 'ParkingTotal',
  GarageSpaces: 'GarageSpaces',

  // Financial
  AssociationFee: 'AssociationFee',
  AssociationFeeFrequency: 'AssociationFeeFrequency',
  TaxAnnualAmount: 'TaxAnnualAmount',
  TaxYear: 'TaxYear',

  // Days on Market
  DaysOnMarket: 'DaysOnMarket',
  CumulativeDaysOnMarket: 'CumulativeDaysOnMarket',

  // Dates
  ListingContractDate: 'ListingContractDate',
  ModificationTimestamp: 'ModificationTimestamp',
  OnMarketDate: 'OnMarketDate',
  CloseDate: 'CloseDate',
  ActivationDate: 'ActivationDate',
  AvailabilityDate: 'AvailabilityDate',

  // Agent/Office
  ListAgentMlsId: 'ListAgentMlsId',
  ListAgentFullName: 'ListAgentFullName',
  ListAgentEmail: 'ListAgentEmail',
  ListOfficeMlsId: 'ListOfficeMlsId',
  ListOfficeName: 'ListOfficeName',

  // Media
  Media: 'Media',
  MediaURL: 'MediaURL',
  MediaType: 'MediaType',
  Order: 'Order',
  PhotosCount: 'PhotosCount',
  VirtualTourURLBranded: 'VirtualTourURLBranded',
  VirtualTourURLUnbranded: 'VirtualTourURLUnbranded',

  // Remarks
  PublicRemarks: 'PublicRemarks',
  PrivateRemarks: 'PrivateRemarks',

  // Display flags
  // IDXEntireListingDisplayYN and ParticipantOnlyYN are legacy / non-existent
  // on live Trestle (verified 2026-04-19); kept here as legacy guard for
  // historical compatibility with DTO callers. New code should use
  // InternetEntireListingDisplayYN + Permission enum.
  IDXEntireListingDisplayYN: 'IDXEntireListingDisplayYN',
  InternetEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
  InternetAddressDisplayYN: 'InternetAddressDisplayYN',
  ParticipantOnlyYN: 'ParticipantOnlyYN',

  // Rental
  LeaseAmount: 'LeaseAmount',
  LeaseAmountFrequency: 'LeaseAmountFrequency',
  PetsAllowed: 'PetsAllowed',
  Furnished: 'Furnished',

  // FARE Act fee transparency (NYC LL 119/2024)
  MoveInCosts: 'MoveInCosts',
  OngoingFees: 'OngoingFees',
  TenantPays: 'TenantPays',
  TenantPaysDescription: 'TenantPaysDescription',
  AdditionalFee: 'AdditionalFee',
  AdditionalFeeDescription: 'AdditionalFeeDescription',
  AdditionalFeeYN: 'AdditionalFeeYN',
  FeeFrequency: 'FeeFrequency',
} as const;

/**
 * Field mapping configuration — maps RESO field names to internal flat paths.
 * Complete mapping for all explicitly tracked fields.
 */
export const FIELD_MAP: Record<string, string> = {
  [RESO_FIELDS.ListingId]: 'listingId',
  [RESO_FIELDS.ListingKey]: 'mlsId',
  [RESO_FIELDS.StandardStatus]: 'standardStatus',
  [RESO_FIELDS.ListPrice]: 'listPrice',
  [RESO_FIELDS.OriginalListPrice]: 'originalListPrice',
  [RESO_FIELDS.PreviousListPrice]: 'previousListPrice',
  [RESO_FIELDS.ClosePrice]: 'closePrice',
  [RESO_FIELDS.PropertyType]: 'propertyType',
  [RESO_FIELDS.PropertySubType]: 'propertySubType',
  [RESO_FIELDS.CommonInterest]: 'commonInterest',
  [RESO_FIELDS.OwnershipType]: 'ownershipType',
  [RESO_FIELDS.StructureType]: 'structureType',
  [RESO_FIELDS.BedroomsTotal]: 'bedroomsTotal',
  [RESO_FIELDS.BathroomsFull]: 'bathroomsFull',
  [RESO_FIELDS.BathroomsHalf]: 'bathroomsHalf',
  [RESO_FIELDS.BathroomsTotal]: 'bathroomsTotal',
  [RESO_FIELDS.LivingArea]: 'livingArea',
  [RESO_FIELDS.LivingAreaUnits]: 'livingAreaUnits',
  [RESO_FIELDS.BuildingAreaTotal]: 'buildingAreaTotal',
  [RESO_FIELDS.LotSizeArea]: 'lotSizeArea',
  [RESO_FIELDS.LotSizeUnits]: 'lotSizeUnits',
  [RESO_FIELDS.YearBuilt]: 'yearBuilt',
  [RESO_FIELDS.StoriesTotal]: 'storiesTotal',
  [RESO_FIELDS.RoomsTotal]: 'roomsTotal',
  [RESO_FIELDS.BuildingName]: 'buildingName',
  [RESO_FIELDS.ArchitecturalStyle]: 'architecturalStyle',
  [RESO_FIELDS.ConstructionMaterials]: 'constructionMaterials',
  [RESO_FIELDS.Heating]: 'heating',
  [RESO_FIELDS.Cooling]: 'cooling',
  [RESO_FIELDS.FloorNumber]: 'floorNumber',
  [RESO_FIELDS.Flooring]: 'flooring',
  [RESO_FIELDS.Appliances]: 'appliances',
  [RESO_FIELDS.LaundryFeatures]: 'laundryFeatures',
  [RESO_FIELDS.SecurityFeatures]: 'securityFeatures',
  [RESO_FIELDS.AttendanceType]: 'attendanceType',
  [RESO_FIELDS.CommunityFeatures]: 'communityFeatures',
  [RESO_FIELDS.AssociationAmenities]: 'associationAmenities',
  [RESO_FIELDS.ParkingFeatures]: 'parkingFeatures',
  [RESO_FIELDS.ParkingTotal]: 'parkingTotal',
  [RESO_FIELDS.GarageSpaces]: 'garageSpaces',
  [RESO_FIELDS.AssociationFee]: 'associationFee',
  [RESO_FIELDS.AssociationFeeFrequency]: 'associationFeeFrequency',
  [RESO_FIELDS.TaxAnnualAmount]: 'taxAnnualAmount',
  [RESO_FIELDS.TaxYear]: 'taxYear',
  [RESO_FIELDS.DaysOnMarket]: 'daysOnMarket',
  [RESO_FIELDS.CumulativeDaysOnMarket]: 'cumulativeDaysOnMarket',
  [RESO_FIELDS.ListingContractDate]: 'listingContractDate',
  [RESO_FIELDS.ModificationTimestamp]: 'modificationTimestamp',
  [RESO_FIELDS.OnMarketDate]: 'onMarketDate',
  [RESO_FIELDS.CloseDate]: 'closeDate',
  [RESO_FIELDS.ActivationDate]: 'activationDate',
  [RESO_FIELDS.AvailabilityDate]: 'availabilityDate',
  [RESO_FIELDS.ListAgentMlsId]: 'listAgentMlsId',
  [RESO_FIELDS.ListAgentFullName]: 'listAgentFullName',
  [RESO_FIELDS.ListAgentEmail]: 'listAgentEmail',
  [RESO_FIELDS.ListOfficeMlsId]: 'listOfficeMlsId',
  [RESO_FIELDS.ListOfficeName]: 'listOfficeName',
  [RESO_FIELDS.PhotosCount]: 'photosCount',
  [RESO_FIELDS.VirtualTourURLBranded]: 'virtualTourURLBranded',
  [RESO_FIELDS.VirtualTourURLUnbranded]: 'virtualTourURLUnbranded',
  [RESO_FIELDS.PublicRemarks]: 'publicRemarks',
  // idxEntireListingDisplayYN and participantOnlyYN are legacy DTO field names
  // — IDXEntireListingDisplayYN and ParticipantOnlyYN do NOT exist on live
  // Trestle (verified 2026-04-19). Kept here as legacy guard so existing
  // consumers reading dto.idxEntireListingDisplayYN don't break; new code
  // should consult dto.internetEntireListingDisplayYN + Permission instead.
  [RESO_FIELDS.IDXEntireListingDisplayYN]: 'idxEntireListingDisplayYN',
  [RESO_FIELDS.InternetEntireListingDisplayYN]: 'internetEntireListingDisplayYN',
  [RESO_FIELDS.InternetAddressDisplayYN]: 'internetAddressDisplayYN',
  [RESO_FIELDS.ParticipantOnlyYN]: 'participantOnlyYN',
  [RESO_FIELDS.LeaseAmount]: 'leaseAmount',
  [RESO_FIELDS.LeaseAmountFrequency]: 'leaseAmountFrequency',
  [RESO_FIELDS.PetsAllowed]: 'petsAllowed',
  [RESO_FIELDS.Furnished]: 'furnished',
  [RESO_FIELDS.MoveInCosts]: 'moveInCosts',
  [RESO_FIELDS.OngoingFees]: 'ongoingFees',
  [RESO_FIELDS.TenantPays]: 'tenantPays',
  [RESO_FIELDS.TenantPaysDescription]: 'tenantPaysDescription',
  [RESO_FIELDS.AdditionalFee]: 'additionalFee',
  [RESO_FIELDS.AdditionalFeeDescription]: 'additionalFeeDescription',
  [RESO_FIELDS.AdditionalFeeYN]: 'additionalFeeYN',
  [RESO_FIELDS.FeeFrequency]: 'feeFrequency',
};

/**
 * Map raw RESO/Trestle response to internal IDXListing type.
 * Handles RESO-to-RLS renames and field normalization.
 */
export function mapRESOToInternal(raw: Record<string, unknown>): IDXListing | null {
  // Apply renames
  const normalized = { ...raw };
  for (const [rlsName, canonicalName] of Object.entries(RESO_TO_RLS_RENAMES)) {
    if (rlsName in normalized && !(canonicalName in normalized)) {
      normalized[canonicalName] = normalized[rlsName];
    }
  }

  const listingId = String(normalized.ListingId || normalized.ListingKey || '');
  if (!listingId) return null;
  const listingKeyNumeric = normalized.ListingKeyNumeric ? Number(normalized.ListingKeyNumeric) : undefined;

  // Compose full street name from RESO address components:
  // StreetDirPrefix (e.g. "East") + StreetName (e.g. "83rd") + StreetSuffix (e.g. "Street") + StreetDirSuffix
  const streetNameParts = [
    normalized.StreetDirPrefix,
    normalized.StreetName,
    normalized.StreetSuffix,
    normalized.StreetDirSuffix,
  ].filter(Boolean).map(String);
  const fullStreetName = normalizeStreetCase(streetNameParts.join(' ') || '');

  const addr = {
    streetNumber: String(normalized.StreetNumber || ''),
    streetName: fullStreetName,
    unitNumber: normalized.UnitNumber ? String(normalized.UnitNumber) : null,
    city: String(normalized.City || ''),
    cityRegion: normalized.SubdivisionName ? String(normalized.SubdivisionName) :
      (normalized.CityRegion ? String(normalized.CityRegion) : undefined),
    stateOrProvince: String(normalized.StateOrProvince || 'NY'),
    postalCode: String(normalized.PostalCode || ''),
    county: String(normalized.CountyOrParish || ''),
    latitude: normalized.Latitude != null ? Number(normalized.Latitude) : undefined,
    longitude: normalized.Longitude != null ? Number(normalized.Longitude) : undefined,
  };

  const propertyType = String(normalized.PropertyType || '');
  const isRental = propertyType.toLowerCase().includes('lease');

  return {
    listingId,
    listingKeyNumeric,
    mlsId: String(normalized.ListingKey || listingId),
    standardStatus: String(normalized.StandardStatus || normalized.MlsStatus || 'Active') as IDXListing['standardStatus'],
    listingType: isRental ? 'rent' : 'sale',
    address: addr,
    listPrice: Number(normalized.ListPrice) || 0,
    originalListPrice: Number(normalized.OriginalListPrice || normalized.ListPrice) || 0,
    closePrice: normalized.ClosePrice != null ? Number(normalized.ClosePrice) : null,
    propertyType,
    propertySubType: normalized.PropertySubType ? String(normalized.PropertySubType) : null,
    commonInterest: normalized.CommonInterest ? String(normalized.CommonInterest) : undefined,
    ownershipType: normalized.OwnershipType ? String(normalized.OwnershipType) : undefined,
    bedroomsTotal: Number(normalized.BedroomsTotal) || 0,
    bathroomsFull: Number(normalized.BathroomsFull) || 0,
    bathroomsHalf: Number(normalized.BathroomsHalf) || 0,
    bathroomsTotal: normalized.BathroomsTotalInteger != null
      ? Number(normalized.BathroomsTotalInteger)
      : (Number(normalized.BathroomsFull) || 0) + (Number(normalized.BathroomsHalf) || 0) * 0.5,
    livingArea: normalized.LivingArea != null ? Number(normalized.LivingArea) : null,
    lotSizeArea: normalized.LotSizeArea != null ? Number(normalized.LotSizeArea) : null,
    yearBuilt: normalized.YearBuilt != null ? Number(normalized.YearBuilt) : null,
    listingContractDate: String(normalized.ListingContractDate || ''),
    modificationTimestamp: String(normalized.ModificationTimestamp || new Date().toISOString()),
    listAgentMlsId: String(normalized.ListAgentMlsId || normalized.ListAgentKey || ''),
    listAgentFullName: String(normalized.ListAgentFullName || ''),
    listOfficeMlsId: String(normalized.ListOfficeMlsId || normalized.ListOfficeKey || ''),
    listOfficeName: String(normalized.ListOfficeName || ''),
    media: Array.isArray(normalized.Media) ? normalized.Media.map((m: unknown, i: number) => {
      const item = m as Record<string, unknown>;
      // RESO DD: MediaCategory = content type (Photo, Floor Plan, Video)
      //          MediaType = file format (jpeg, png, gif) — NOT content type
      const desc = String(item.ShortDescription || '').toLowerCase();
      const isPreferred = item.PreferredPhotoYN === true || item.PreferredPhotoYN === 'true';
      // P1C3 (M3): canonical classifier — the old `cat.includes('floor plan')`
      // / `includes('virtual tour')` with-space checks never matched the
      // feed's no-space enum members ('FloorPlan', 'UnbrandedVirtualTour'),
      // so floorplans/tours classified as Photo and could become the hero.
      // ShortDescription floor-plan heuristic retained (classifier is
      // category-only).
      let mediaType: CanonicalMediaType =
        classifyTrestleMediaCategory(item.MediaCategory as string | null | undefined);
      if (desc.includes('floor plan') || desc.includes('floorplan')) mediaType = 'FloorPlan';
      return {
        url: String(item.MediaURL || ''),
        mediaType,
        order: isPreferred ? -1 : Number(item.Order ?? i),
        shortDescription: item.ShortDescription ? String(item.ShortDescription) : undefined,
      };
    }).filter((m: { url: string }) => m.url).sort((a: { mediaType: string; order: number }, b: { mediaType: string; order: number }) => {
      // Photos first (preferred photo has order -1), then videos/tours, then floorplans last
      const typeRank = (t: string) => t === 'Photo' ? 0 : t === 'FloorPlan' ? 2 : 1;
      const rankDiff = typeRank(a.mediaType) - typeRank(b.mediaType);
      return rankDiff !== 0 ? rankDiff : a.order - b.order;
    }) : [],
    // Remarks — public only (private remarks NEVER mapped to IDXListing)
    publicRemarks: normalized.PublicRemarks ? String(normalized.PublicRemarks) : undefined,
    // Distribution gate flags — IDX Plus pre-filter convention (`!== false`).
    //
    // C1 fix (2026-05-13): mapRESOToInternal is called exclusively on raw
    // Trestle records pulled from the REBNY IDX Plus feed. Per CLAUDE.md
    // 2026-04-30 (commit 0309875b), REBNY/Cotality removes non-displayable
    // rows upstream and leaves the two display flags as null on the
    // survivors — an explicit `false` is the rare per-row override.
    //
    // The writer side (`lib/idx/trestle-mapper.ts:706-707`) already encodes
    // `!== false` here. Mirroring that same semantics on the reader side
    // closes the list/detail address-display divergence: both paths now
    // agree that null upstream = displayable, explicit false = suppress.
    //
    // Per-row opt-out flags (AVM, ConsumerComment) remain fail-closed via
    // affirmPermission elsewhere — only InternetEntireListingDisplayYN /
    // InternetAddressDisplayYN are IDX-Plus pre-filtered. The legacy DTO key
    // `idxEntireListingDisplayYN` is the consumer contract and is preserved,
    // but it now derives solely from the canonical InternetEntireListingDisplayYN
    // (IDXEntireListingDisplayYN does NOT exist on live Trestle — verified
    // 2026-06-04 via trestle:audit-server against the live $metadata).
    //
    // New code should still use evaluateDisplayGate() from lib/compliance/
    // gates.ts; for raw Trestle records, pass `{ idxPlusPreFiltered: true }`.
    idxEntireListingDisplayYN:
      normalized.InternetEntireListingDisplayYN !== false,
    internetEntireListingDisplayYN: normalized.InternetEntireListingDisplayYN !== false,
    internetAddressDisplayYN: normalized.InternetAddressDisplayYN !== false,
    participantOnlyYN:
      normalized.ParticipantOnlyYN === true ||
      normalized.Permission === 'Private',
    // Building & property details
    buildingName: normalized.BuildingName ? String(normalized.BuildingName) : undefined,
    storiesTotal: normalized.StoriesTotal != null ? Number(normalized.StoriesTotal) : undefined,
    roomsTotal: normalized.RoomsTotal != null ? Number(normalized.RoomsTotal) : undefined,
    architecturalStyle: normalized.ArchitecturalStyle ? String(normalized.ArchitecturalStyle) : undefined,
    constructionMaterials: normalized.ConstructionMaterials ? String(normalized.ConstructionMaterials) : undefined,
    heating: normalized.Heating ? String(normalized.Heating) : undefined,
    cooling: normalized.Cooling ? String(normalized.Cooling) : undefined,
    flooring: normalized.Flooring ? String(normalized.Flooring) : undefined,
    // Amenities
    interiorFeatures: normalized.InteriorFeatures ? String(normalized.InteriorFeatures) : undefined,
    buildingFeatures: normalized.BuildingFeatures ? String(normalized.BuildingFeatures) : undefined,
    exteriorFeatures: normalized.ExteriorFeatures ? String(normalized.ExteriorFeatures) : undefined,
    appliances: normalized.Appliances ? String(normalized.Appliances) : undefined,
    laundryFeatures: normalized.LaundryFeatures ? String(normalized.LaundryFeatures) : undefined,
    securityFeatures: normalized.SecurityFeatures ? String(normalized.SecurityFeatures) : undefined,
    attendanceType: normalized.AttendanceType ? String(normalized.AttendanceType) : undefined,
    communityFeatures: normalized.CommunityFeatures ? String(normalized.CommunityFeatures) : undefined,
    associationAmenities: normalized.AssociationAmenities ? String(normalized.AssociationAmenities) : undefined,
    parkingFeatures: normalized.ParkingFeatures ? String(normalized.ParkingFeatures) : undefined,
    poolFeatures: normalized.PoolFeatures ? String(normalized.PoolFeatures) : undefined,
    spaFeatures: normalized.SpaFeatures ? String(normalized.SpaFeatures) : undefined,
    parkingTotal: normalized.ParkingTotal != null ? Number(normalized.ParkingTotal) : undefined,
    garageSpaces: normalized.GarageSpaces != null ? Number(normalized.GarageSpaces) : undefined,
    // Financial
    associationFee: normalized.AssociationFee != null ? Number(normalized.AssociationFee) : undefined,
    associationFeeFrequency: normalized.AssociationFeeFrequency ? String(normalized.AssociationFeeFrequency) : undefined,
    taxAnnualAmount: normalized.TaxAnnualAmount != null ? Number(normalized.TaxAnnualAmount) : undefined,
    taxYear: normalized.TaxYear != null ? Number(normalized.TaxYear) : undefined,
    // Dates
    onMarketDate: normalized.OnMarketDate ? String(normalized.OnMarketDate) : undefined,
    activationDate: normalized.ActivationDate ? String(normalized.ActivationDate) : undefined,
    availabilityDate: normalized.AvailabilityDate ? String(normalized.AvailabilityDate) : undefined,
    closeDate: normalized.CloseDate ? String(normalized.CloseDate) : undefined,
    // Photos & virtual tours
    photosCount: normalized.PhotosCount != null ? Number(normalized.PhotosCount) : undefined,
    virtualTourURLBranded: normalized.VirtualTourURLBranded ? String(normalized.VirtualTourURLBranded) : undefined,
    virtualTourURLUnbranded: normalized.VirtualTourURLUnbranded ? String(normalized.VirtualTourURLUnbranded) : undefined,
    // Rental-specific
    leaseAmount: normalized.LeaseAmount != null ? Number(normalized.LeaseAmount) : undefined,
    leaseAmountFrequency: normalized.LeaseAmountFrequency ? String(normalized.LeaseAmountFrequency) : undefined,
    petsAllowed: normalized.PetsAllowed ? String(normalized.PetsAllowed) : undefined,
    furnished: normalized.Furnished ? String(normalized.Furnished) : undefined,
    // Days on Market
    daysOnMarket: normalized.DaysOnMarket != null ? Number(normalized.DaysOnMarket) : undefined,
    cumulativeDaysOnMarket: normalized.CumulativeDaysOnMarket != null ? Number(normalized.CumulativeDaysOnMarket) : undefined,
    // FARE Act fee fields
    moveInCosts: normalized.MoveInCosts ? String(normalized.MoveInCosts) : undefined,
    ongoingFees: normalized.OngoingFees ? String(normalized.OngoingFees) : undefined,
    tenantPays: normalized.TenantPays ? String(normalized.TenantPays) : undefined,
    tenantPaysDescription: normalized.TenantPaysDescription ? String(normalized.TenantPaysDescription) : undefined,
    additionalFeeYN: normalized.AdditionalFeeYN === true || normalized.AdditionalFeeYN === 'true' ? true : undefined,
    additionalFee: normalized.AdditionalFee != null ? Number(normalized.AdditionalFee) : undefined,
    additionalFeeDescription: normalized.AdditionalFeeDescription ? String(normalized.AdditionalFeeDescription) : undefined,
    feeFrequency: normalized.FeeFrequency ? String(normalized.FeeFrequency) : undefined,
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
 * Validate that a raw response contains all 41 required REBNY RLS fields.
 */
export function validateRESOResponse(raw: Record<string, unknown>): {
  valid: boolean;
  missingFields: string[];
} {
  // Apply renames first
  const normalized = { ...raw };
  for (const [rlsName, canonicalName] of Object.entries(RESO_TO_RLS_RENAMES)) {
    if (rlsName in normalized && !(canonicalName in normalized)) {
      normalized[canonicalName] = normalized[rlsName];
    }
  }

  const missingFields = REQUIRED_RLS_FIELDS.filter(field => !(field in normalized));

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * REBNY RLS required display fields
 */
export const REBNY_REQUIRED_DISPLAY_FIELDS = [
  'listPrice',
  'address',
  'bedroomsTotal',
  'bathroomsFull',
  'propertyType',
  'listOfficeName', // Public attribution = office/broker name only (not agent)
] as const;

/**
 * REBNY RLS attribution text template
 */
export const REBNY_ATTRIBUTION_TEMPLATE =
  'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. ' +
  'Data last updated: {{timestamp}}.';

/**
 * Generate attribution text with timestamp
 */
export function generateAttributionText(timestamp: Date = new Date()): string {
  return REBNY_ATTRIBUTION_TEMPLATE.replace(
    '{{timestamp}}',
    timestamp.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

// Re-export for convenience
export { ALL_RLS_FIELDS, REQUIRED_RLS_FIELDS, RESO_TO_RLS_RENAMES };
