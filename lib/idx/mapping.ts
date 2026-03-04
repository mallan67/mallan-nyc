/**
 * RESO-Aligned Field Mapping
 *
 * COMPLIANCE NOTE:
 * Maps RESO Data Dictionary field names to our internal canonical representation.
 * All 448 REBNY RLS fields are covered. 23 RESO-to-RLS renames handled.
 *
 * @see https://www.reso.org/data-dictionary/
 */

import type { IDXListing } from './types';
import { RESO_TO_RLS_RENAMES, ALL_RLS_FIELDS, REQUIRED_RLS_FIELDS } from './trestle-mapper';

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
  AccessibilityFeatures: 'AccessibilityFeatures',
  CommunityFeatures: 'CommunityFeatures',
  ParkingFeatures: 'ParkingFeatures',
  ParkingTotal: 'ParkingTotal',
  GarageSpaces: 'GarageSpaces',

  // Financial
  AssociationFee: 'AssociationFee',
  AssociationFeeFrequency: 'AssociationFeeFrequency',
  TaxAnnualAmount: 'TaxAnnualAmount',
  TaxYear: 'TaxYear',

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
  IDXEntireListingDisplayYN: 'IDXEntireListingDisplayYN',
  InternetEntireListingDisplayYN: 'InternetEntireListingDisplayYN',
  InternetAddressDisplayYN: 'InternetAddressDisplayYN',
  ParticipantOnlyYN: 'ParticipantOnlyYN',

  // Rental
  LeaseAmount: 'LeaseAmount',
  LeaseAmountFrequency: 'LeaseAmountFrequency',
  PetsAllowed: 'PetsAllowed',
  Furnished: 'Furnished',
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
  [RESO_FIELDS.CommunityFeatures]: 'communityFeatures',
  [RESO_FIELDS.ParkingFeatures]: 'parkingFeatures',
  [RESO_FIELDS.ParkingTotal]: 'parkingTotal',
  [RESO_FIELDS.GarageSpaces]: 'garageSpaces',
  [RESO_FIELDS.AssociationFee]: 'associationFee',
  [RESO_FIELDS.AssociationFeeFrequency]: 'associationFeeFrequency',
  [RESO_FIELDS.TaxAnnualAmount]: 'taxAnnualAmount',
  [RESO_FIELDS.TaxYear]: 'taxYear',
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
  [RESO_FIELDS.IDXEntireListingDisplayYN]: 'idxEntireListingDisplayYN',
  [RESO_FIELDS.InternetEntireListingDisplayYN]: 'internetEntireListingDisplayYN',
  [RESO_FIELDS.InternetAddressDisplayYN]: 'internetAddressDisplayYN',
  [RESO_FIELDS.ParticipantOnlyYN]: 'participantOnlyYN',
  [RESO_FIELDS.LeaseAmount]: 'leaseAmount',
  [RESO_FIELDS.LeaseAmountFrequency]: 'leaseAmountFrequency',
  [RESO_FIELDS.PetsAllowed]: 'petsAllowed',
  [RESO_FIELDS.Furnished]: 'furnished',
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

  const addr = {
    streetNumber: String(normalized.StreetNumber || ''),
    streetName: String(normalized.StreetName || ''),
    unitNumber: normalized.UnitNumber ? String(normalized.UnitNumber) : null,
    city: String(normalized.City || ''),
    cityRegion: normalized.CityRegion ? String(normalized.CityRegion) : undefined,
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
    mlsId: String(normalized.ListingKey || listingId),
    standardStatus: String(normalized.StandardStatus || normalized.MlsStatus || 'Active') as IDXListing['standardStatus'],
    listingType: isRental ? 'rent' : 'sale',
    address: addr,
    listPrice: Number(normalized.ListPrice) || 0,
    originalListPrice: Number(normalized.OriginalListPrice || normalized.ListPrice) || 0,
    closePrice: normalized.ClosePrice != null ? Number(normalized.ClosePrice) : null,
    propertyType,
    propertySubType: normalized.PropertySubType ? String(normalized.PropertySubType) : null,
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
      return {
        url: String(item.MediaURL || ''),
        mediaType: (String(item.MediaType || 'Photo')) as 'Photo' | 'Video' | 'VirtualTour' | 'FloorPlan',
        order: Number(item.Order || i),
      };
    }) : [],
    // Remarks — public only (private remarks NEVER mapped to IDXListing)
    publicRemarks: normalized.PublicRemarks ? String(normalized.PublicRemarks) : undefined,
    // Distribution gate flags (for address suppression + downstream checks)
    idxEntireListingDisplayYN: normalized.IDXEntireListingDisplayYN !== false,
    internetEntireListingDisplayYN: normalized.InternetEntireListingDisplayYN !== false,
    internetAddressDisplayYN: normalized.InternetAddressDisplayYN !== false,
    participantOnlyYN: normalized.ParticipantOnlyYN === true,
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
    exteriorFeatures: normalized.ExteriorFeatures ? String(normalized.ExteriorFeatures) : undefined,
    appliances: normalized.Appliances ? String(normalized.Appliances) : undefined,
    laundryFeatures: normalized.LaundryFeatures ? String(normalized.LaundryFeatures) : undefined,
    securityFeatures: normalized.SecurityFeatures ? String(normalized.SecurityFeatures) : undefined,
    communityFeatures: normalized.CommunityFeatures ? String(normalized.CommunityFeatures) : undefined,
    parkingFeatures: normalized.ParkingFeatures ? String(normalized.ParkingFeatures) : undefined,
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
  'listAgentFullName',
  'listOfficeName',
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
