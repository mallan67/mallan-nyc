/**
 * RESO-Aligned Field Mapping
 *
 * COMPLIANCE NOTE:
 * Maps RESO Data Dictionary field names to our internal canonical representation.
 * 902 REBNY IDX Plus fields across 7 resources. 23 RESO-to-RLS renames handled.
 * Field truth = the live api.cotality.com/trestle $metadata (RESO-shaped OData model).
 */

import type { IDXListing } from './types';
import { REQUIRED_RLS_FIELDS } from './trestle-mapper';
import { readCotalityStandardStatus, hasCotalityListingPermission, readCotalityPropertySubType, readCotalityCommonInterest } from '@/lib/cotality/property';
import { normalizeStreetCase } from './normalize-street-case';
import { classifyTrestleMediaCategory } from '@/lib/media/media-sync-service';

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
  VirtualTourURLBranded2: 'VirtualTourURLBranded2',
  VirtualTourURLBranded3: 'VirtualTourURLBranded3',
  VirtualTourURLUnbranded: 'VirtualTourURLUnbranded',
  VirtualTourURLUnbranded2: 'VirtualTourURLUnbranded2',
  VirtualTourURLUnbranded3: 'VirtualTourURLUnbranded3',

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
  [RESO_FIELDS.VirtualTourURLBranded2]: 'virtualTourURLBranded2',
  [RESO_FIELDS.VirtualTourURLBranded3]: 'virtualTourURLBranded3',
  [RESO_FIELDS.VirtualTourURLUnbranded]: 'virtualTourURLUnbranded',
  [RESO_FIELDS.VirtualTourURLUnbranded2]: 'virtualTourURLUnbranded2',
  [RESO_FIELDS.VirtualTourURLUnbranded3]: 'virtualTourURLUnbranded3',
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
 * Map a raw Cotality Property record to the internal IDXListing type.
 */
export function mapRESOToInternal(raw: Record<string, unknown>): IDXListing | null {
  const listingId = String(raw.ListingId || raw.ListingKey || '');
  if (!listingId) return null;
  const listingKeyNumeric = raw.ListingKeyNumeric ? Number(raw.ListingKeyNumeric) : undefined;

  // Compose full street name from RESO address components:
  // StreetDirPrefix (e.g. "East") + StreetName (e.g. "83rd") + StreetSuffix (e.g. "Street") + StreetDirSuffix
  const streetNameParts = [
    raw.StreetDirPrefix,
    raw.StreetName,
    raw.StreetSuffix,
    raw.StreetDirSuffix,
  ].filter(Boolean).map(String);
  const fullStreetName = normalizeStreetCase(streetNameParts.join(' ') || '');

  const addr = {
    streetNumber: String(raw.StreetNumber || ''),
    streetName: fullStreetName,
    unitNumber: raw.UnitNumber ? String(raw.UnitNumber) : null,
    city: String(raw.City || ''),
    cityRegion: raw.SubdivisionName ? String(raw.SubdivisionName) :
      (raw.CityRegion ? String(raw.CityRegion) : undefined),
    stateOrProvince: String(raw.StateOrProvince || 'NY'),
    postalCode: String(raw.PostalCode || ''),
    county: String(raw.CountyOrParish || ''),
    latitude: raw.Latitude != null ? Number(raw.Latitude) : undefined,
    longitude: raw.Longitude != null ? Number(raw.Longitude) : undefined,
  };

  const propertyType = String(raw.PropertyType || '');
  const isRental = propertyType.toLowerCase().includes('lease');

  return {
    listingId,
    listingKeyNumeric,
    mlsId: String(raw.ListingKey || listingId),
    standardStatus: (readCotalityStandardStatus(raw) ?? 'UNKNOWN') as IDXListing['standardStatus'],
    listingType: isRental ? 'rent' : 'sale',
    address: addr,
    listPrice: Number(raw.ListPrice) || 0,
    originalListPrice: Number(raw.OriginalListPrice || raw.ListPrice) || 0,
    closePrice: raw.ClosePrice != null ? Number(raw.ClosePrice) : null,
    propertyType,
    propertySubType: readCotalityPropertySubType(raw),
    commonInterest: readCotalityCommonInterest(raw) ?? undefined,
    ownershipType: raw.OwnershipType ? String(raw.OwnershipType) : undefined,
    bedroomsTotal: Number(raw.BedroomsTotal) || 0,
    bathroomsFull: Number(raw.BathroomsFull) || 0,
    bathroomsHalf: Number(raw.BathroomsHalf) || 0,
    bathroomsTotal: raw.BathroomsTotalInteger != null
      ? Number(raw.BathroomsTotalInteger)
      : (Number(raw.BathroomsFull) || 0) + (Number(raw.BathroomsHalf) || 0) * 0.5,
    livingArea: raw.LivingArea != null ? Number(raw.LivingArea) : null,
    lotSizeArea: raw.LotSizeArea != null ? Number(raw.LotSizeArea) : null,
    yearBuilt: raw.YearBuilt != null ? Number(raw.YearBuilt) : null,
    listingContractDate: String(raw.ListingContractDate || ''),
    modificationTimestamp: String(raw.ModificationTimestamp || new Date().toISOString()),
    listAgentMlsId: String(raw.ListAgentMlsId || raw.ListAgentKey || ''),
    listAgentFullName: String(raw.ListAgentFullName || ''),
    listOfficeMlsId: String(raw.ListOfficeMlsId || raw.ListOfficeKey || ''),
    listOfficeName: String(raw.ListOfficeName || ''),
    media: Array.isArray(raw.Media) ? raw.Media.map((m: unknown, i: number) => {
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
      let mediaType: 'Photo' | 'Video' | 'VirtualTour' | 'FloorPlan' =
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
    publicRemarks: raw.PublicRemarks ? String(raw.PublicRemarks) : undefined,
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
      raw.InternetEntireListingDisplayYN !== false,
    internetEntireListingDisplayYN: raw.InternetEntireListingDisplayYN !== false,
    internetAddressDisplayYN: raw.InternetAddressDisplayYN !== false,
    // Permission MEMBER 'Private' (Multi-Enum, IsFlags=true -- 2026-10-02
    // Permission Multi-Enum cutover; see lib/cotality/property.ts::
    // hasCotalityListingPermission's docstring). raw.ParticipantOnlyYN is a
    // separate, pre-existing question (not a real Cotality field -- untouched here).
    participantOnlyYN:
      raw.ParticipantOnlyYN === true ||
      hasCotalityListingPermission(raw, 'Private'),
    // Building & property details
    buildingName: raw.BuildingName ? String(raw.BuildingName) : undefined,
    storiesTotal: raw.StoriesTotal != null ? Number(raw.StoriesTotal) : undefined,
    roomsTotal: raw.RoomsTotal != null ? Number(raw.RoomsTotal) : undefined,
    architecturalStyle: raw.ArchitecturalStyle ? String(raw.ArchitecturalStyle) : undefined,
    constructionMaterials: raw.ConstructionMaterials ? String(raw.ConstructionMaterials) : undefined,
    heating: raw.Heating ? String(raw.Heating) : undefined,
    cooling: raw.Cooling ? String(raw.Cooling) : undefined,
    flooring: raw.Flooring ? String(raw.Flooring) : undefined,
    // Amenities
    interiorFeatures: raw.InteriorFeatures ? String(raw.InteriorFeatures) : undefined,
    buildingFeatures: raw.BuildingFeatures ? String(raw.BuildingFeatures) : undefined,
    exteriorFeatures: raw.ExteriorFeatures ? String(raw.ExteriorFeatures) : undefined,
    appliances: raw.Appliances ? String(raw.Appliances) : undefined,
    laundryFeatures: raw.LaundryFeatures ? String(raw.LaundryFeatures) : undefined,
    securityFeatures: raw.SecurityFeatures ? String(raw.SecurityFeatures) : undefined,
    attendanceType: raw.AttendanceType ? String(raw.AttendanceType) : undefined,
    communityFeatures: raw.CommunityFeatures ? String(raw.CommunityFeatures) : undefined,
    associationAmenities: raw.AssociationAmenities ? String(raw.AssociationAmenities) : undefined,
    parkingFeatures: raw.ParkingFeatures ? String(raw.ParkingFeatures) : undefined,
    poolFeatures: raw.PoolFeatures ? String(raw.PoolFeatures) : undefined,
    spaFeatures: raw.SpaFeatures ? String(raw.SpaFeatures) : undefined,
    parkingTotal: raw.ParkingTotal != null ? Number(raw.ParkingTotal) : undefined,
    garageSpaces: raw.GarageSpaces != null ? Number(raw.GarageSpaces) : undefined,
    // Financial
    associationFee: raw.AssociationFee != null ? Number(raw.AssociationFee) : undefined,
    associationFeeFrequency: raw.AssociationFeeFrequency ? String(raw.AssociationFeeFrequency) : undefined,
    taxAnnualAmount: raw.TaxAnnualAmount != null ? Number(raw.TaxAnnualAmount) : undefined,
    taxYear: raw.TaxYear != null ? Number(raw.TaxYear) : undefined,
    // Dates
    onMarketDate: raw.OnMarketDate ? String(raw.OnMarketDate) : undefined,
    activationDate: raw.ActivationDate ? String(raw.ActivationDate) : undefined,
    availabilityDate: raw.AvailabilityDate ? String(raw.AvailabilityDate) : undefined,
    closeDate: raw.CloseDate ? String(raw.CloseDate) : undefined,
    // Photos & virtual tours
    photosCount: raw.PhotosCount != null ? Number(raw.PhotosCount) : undefined,
    virtualTourURLBranded: raw.VirtualTourURLBranded ? String(raw.VirtualTourURLBranded) : undefined,
    virtualTourURLBranded2: raw.VirtualTourURLBranded2 ? String(raw.VirtualTourURLBranded2) : undefined,
    virtualTourURLBranded3: raw.VirtualTourURLBranded3 ? String(raw.VirtualTourURLBranded3) : undefined,
    virtualTourURLUnbranded: raw.VirtualTourURLUnbranded ? String(raw.VirtualTourURLUnbranded) : undefined,
    virtualTourURLUnbranded2: raw.VirtualTourURLUnbranded2 ? String(raw.VirtualTourURLUnbranded2) : undefined,
    virtualTourURLUnbranded3: raw.VirtualTourURLUnbranded3 ? String(raw.VirtualTourURLUnbranded3) : undefined,
    // Rental-specific
    leaseAmount: raw.LeaseAmount != null ? Number(raw.LeaseAmount) : undefined,
    leaseAmountFrequency: raw.LeaseAmountFrequency ? String(raw.LeaseAmountFrequency) : undefined,
    petsAllowed: raw.PetsAllowed ? String(raw.PetsAllowed) : undefined,
    furnished: raw.Furnished ? String(raw.Furnished) : undefined,
    // Days on Market
    daysOnMarket: raw.DaysOnMarket != null ? Number(raw.DaysOnMarket) : undefined,
    cumulativeDaysOnMarket: raw.CumulativeDaysOnMarket != null ? Number(raw.CumulativeDaysOnMarket) : undefined,
    // FARE Act fee fields
    moveInCosts: raw.MoveInCosts ? String(raw.MoveInCosts) : undefined,
    ongoingFees: raw.OngoingFees ? String(raw.OngoingFees) : undefined,
    tenantPays: raw.TenantPays ? String(raw.TenantPays) : undefined,
    tenantPaysDescription: raw.TenantPaysDescription ? String(raw.TenantPaysDescription) : undefined,
    additionalFeeYN: raw.AdditionalFeeYN === true || raw.AdditionalFeeYN === 'true' ? true : undefined,
    additionalFee: raw.AdditionalFee != null ? Number(raw.AdditionalFee) : undefined,
    additionalFeeDescription: raw.AdditionalFeeDescription ? String(raw.AdditionalFeeDescription) : undefined,
    feeFrequency: raw.FeeFrequency ? String(raw.FeeFrequency) : undefined,
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
  const missingFields = REQUIRED_RLS_FIELDS.filter(field => !(field in raw));

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
export { REQUIRED_RLS_FIELDS };
