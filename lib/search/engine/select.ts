import { cotalityFields } from '@/lib/cotality/contract';
/**
 * Fields selected for a hydrated Search page. Shared by every consumer of the Search
 * executor (live Agent Search, Saved Search execute, the alert cron). Every entry must
 * exist on live Cotality Property; `idx:validate` reads this list through the Search route's
 * re-export and `cotality:verify` checks it against live $metadata.
 */
// Compile-checked against the live Property resource (lib/cotality/contract.ts): a name not declared in
// $metadata is a type error, never a runtime 400.
export const SEARCH_SELECT_FIELDS = cotalityFields('Property', [
  // Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix", "StreetSuffix", "UnitNumber",
  "City", "CityRegion", "SubdivisionName", "PostalCity", "PostalCode", "StateOrProvince", "CountyOrParish", "CrossStreet",
  "Latitude", "Longitude",
  // Classification
  "ListingId", "ListingKey", "SourceSystemKey", "PropertyType", "PropertySubType", "CommonInterest", "OwnershipType", "NewConstructionYN",
  // Status & dates
  "StandardStatus", "MlsStatus", "ModificationTimestamp", "ListingContractDate", "OnMarketDate", "CloseDate", "ClosePrice",
  "ActivationDate", "DaysOnMarket", "CumulativeDaysOnMarket", "OriginalListPrice", "PreviousListPrice", "AvailabilityDate",
  // Pricing
  "ListPrice", "LeaseAmount", "LeaseAmountFrequency",
  // Rooms & size
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger", "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
  // Building
  "BuildingName", "NumberOfUnitsTotal", "BuildingKeyNumeric",
  // Financial
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount", "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  // Agent / office
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail", "ListAgentDirectPhone", "ListOfficeMlsId", "ListOfficeName",
  // Media
  // EVERY 3D/video carrier (live 2026-09-08: the Media subsection has 0 tour/video rows; these are the only source).
  "PhotosCount", "VideosCount",
  "VirtualTourURLBranded", "VirtualTourURLBranded2", "VirtualTourURLBranded3",
  "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3",
  // Remarks
  "PublicRemarks",
  // Display / permission
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN", "Permission",
  // Rental + fee transparency
  "PetsAllowed", "Furnished", "MoveInCosts", "OngoingFees", "TenantPays", "TenantPaysDescription",
  // Checkbox fields returned for the CRM's local rendering
  "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN", "DirectionFaces", "View", "OwnerPays", "ArchitecturalStyle",
  "StructureType", "BusinessType", "AccessibilityFeatures", "ExteriorFeatures", "BuildingFeatures", "LaundryFeatures",
  "SecurityFeatures", "PoolFeatures", "PetsAllowedYN", "AvailableLeaseType", "ExistingLeaseType", "ConstructionMaterials",
  "PriceChangeTimestamp", "PatioAndPorchFeatures", "AssociationAmenities", "CurrentFinancing",
]);
