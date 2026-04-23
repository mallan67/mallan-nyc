// lib/idx/trestle-mapper.ts
// Trestle/REBNY RLS to Prisma Listing model mapper (902 IDX Plus fields across 7 resources).
// Maps ALL 29 RLS categories. Handles 23 RESO-to-RLS renames.
// READ-ONLY: maps inbound data only — nothing goes back to Trestle.

// ═══════════════════════════════════════════════════════════
// RESO-to-RLS RENAMES (23 fields)
// Trestle sends the RLS name; we normalize to our canonical name.
// ═══════════════════════════════════════════════════════════
export const RESO_TO_RLS_RENAMES: Record<string, string> = {
  SourceSystemKey: "ListingKey",
  MlsStatus: "StandardStatus",
  SourceSystemModificationTimestamp: "ModificationTimestamp",
  BuildingSocialMediaURL: "BuildingSocialMedia",
  BuyerAgentMlsId: "BuyerAgentKey",
  BuyerOfficeMlsId: "BuyerOfficeKey",
  BuyerTeamMlsId: "BuyerTeamKey",
  CableTVExpense: "CableTvExpense",
  CoBuyerAgentMlsId: "CoBuyerAgentKey",
  CoBuyerOfficeMlsId: "CoBuyerOfficeKey",
  DuplicateListingIDs: "CoExclusiveListingKey",
  CoListAgent2MLSID: "CoListAgent2Key",
  CoListAgent3MLSID: "CoListAgent3Key",
  CoListAgentMlsId: "CoListAgentKey",
  ListAgentMlsId: "ListAgentKey",
  ListingSocialMediaURL: "ListingSocialMedia",
  ListOfficeMlsId: "ListOfficeKey",
  ListTeamMlsId: "ListTeamKey",
  LotSizeSource: "LotDimensionsSource",
  ShowingContactPhone: "ShowingContactPhoneExt",
  UnParsedAddress: "UnparsedAddress",
};

// CeilingHeightFeet + CeilingHeightInches → CeilingHeight (split into 2)
// Handled specially in mapTrestleToPrisma

// ═══════════════════════════════════════════════════════════
// ALL RLS PROPERTY FIELD NAMES (for $select query)
// Grouped by the 29 RLS categories (B1–B29)
// ═══════════════════════════════════════════════════════════

// B1: Address (25 fields)
const B1_ADDRESS = [
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish", "Country",
  "CrossStreet", "Directions", "Latitude", "Longitude",
  "UnParsedAddress", "AlternateStreetName", "AlternateStreetNumber",
  "AlternateStreetDirPrefix", "AlternateStreetDirSuffix",
  "AlternateStreetSuffix", "MapCoordinate",
];

// B2: Classification (18 fields)
const B2_CLASSIFICATION = [
  "ListingId", "SourceSystemKey", "PropertyType", "PropertySubType",
  "CommonInterest", "OwnershipType", "StructureType", "NewConstructionYN",
  "NewDevelopmentYN", "DevelopmentStatus", "NumberOfUnitsTotal",
  "NumberOfUnitsVacant", "NumberOfUnitsLeased", "NumberOfBuildings",
  "StoriesTotal", "NumberOfSeparateElectricMeters", "NumberOfSeparateGasMeters",
  "NumberOfSeparateWaterMeters", "BusinessType",
];

// B3: Listing Agreement (13 fields)
const B3_LISTING_AGREEMENT = [
  "ListingAgreement", "ListingContractDate", "ExpirationDate",
  "OriginalEntryTimestamp", "ListingService", "MlsStatus",
  "DuplicateListingIDs", "ParticipantTypes", "ExclusiveAgency",
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  "SyndicationRemarks",
  "Permission", // Owner opt-out detection — required by checkDistributionGates() (singular, not "Permissions")
];

// B4: Status & Dates (32 fields)
const B4_STATUS_DATES = [
  "StandardStatus", "SourceSystemModificationTimestamp",
  "ModificationTimestamp", "StatusChangeTimestamp",
  "ActivationDate", "ActivationTimestamp", "OnMarketDate",
  "OffMarketDate", "OffMarketTimestamp", "BackOnMarketDate",
  "BackOnMarketTimestamp", "ContractStatusChangeDate",
  "PurchaseContractDate", "CloseDate", "ClosePrice",
  "CancelationDate", "WithdrawnDate",
  "DaysOnMarket", "CumulativeDaysOnMarket",
  "PendingTimestamp", "ContingentDate",
  "AvailabilityDate", "PossessionDate",
  "ComingSoonDate", "ComingSoonTimestamp",
  "ActiveOpenHouseCount",
  "OriginalListPrice", "PreviousListPrice",
  "ListPriceLow", "ListPrice",
  "LastChangeType", "LastChangeTimestamp",
];

// B5: Pricing Extras (8 fields)
const B5_PRICING = [
  "SpecialListingConditions", "SaleType", "Concessions",
  "ConcessionsAmount", "ConcessionsComments",
  "AuctionType", "LeaseAmount", "LeaseAmountFrequency",
];

// B6: Display Flags / Distribution (8 fields)
const B6_DISPLAY_FLAGS = [
  "IDXEntireListingDisplayYN", "IDXAutomatedValuationDisplayYN",
  "InternetAutomatedValuationDisplayYN", "InternetConsumerCommentYN",
  "VOWEntireListingDisplayYN", "VOWAutomatedValuationDisplayYN",
  "VOWConsumerCommentYN", "SyndicateTo",
  "IDXParticipationYN", "ParticipantOnlyYN",
  "ListingURL",
];

// B7: Remarks (8 fields)
const B7_REMARKS = [
  "PublicRemarks", "PrivateRemarks", "SyndicationRemarks",
  "ShowingInstructions", "ListingTerms",
  "Disclaimer", "CopyrightNotice", "PropertyCondition",
];

// B8: List Agent & Office (18 fields)
const B8_LIST_AGENT = [
  "ListAgentMlsId", "ListAgentKey", "ListAgentFirstName",
  "ListAgentLastName", "ListAgentFullName", "ListAgentEmail",
  "ListAgentDirectPhone", "ListAgentOfficePhone", "ListAgentURL",
  "ListOfficeMlsId", "ListOfficeKey", "ListOfficeName",
  "ListOfficePhone", "ListOfficeURL", "ListOfficeEmail",
  "ListTeamMlsId", "ListTeamKey", "ListTeamName",
];

// B9: Co-List Agents (24 fields)
const B9_COLIST_AGENT = [
  "CoListAgentMlsId", "CoListAgentKey", "CoListAgentFirstName",
  "CoListAgentLastName", "CoListAgentFullName", "CoListAgentEmail",
  "CoListAgentDirectPhone", "CoListAgentURL",
  "CoListOfficeMlsId", "CoListOfficeKey", "CoListOfficeName",
  "CoListOfficePhone",
  "CoListAgent2MLSID", "CoListAgent2Key", "CoListAgent2FirstName",
  "CoListAgent2LastName", "CoListAgent2FullName",
  "CoListAgent3MLSID", "CoListAgent3Key", "CoListAgent3FirstName",
  "CoListAgent3LastName", "CoListAgent3FullName",
  "CoListTeamKey", "CoListTeamName",
];

// B10: Buyer Agent & Office (18 fields)
const B10_BUYER_AGENT = [
  "BuyerAgentMlsId", "BuyerAgentKey", "BuyerAgentFirstName",
  "BuyerAgentLastName", "BuyerAgentFullName", "BuyerAgentEmail",
  "BuyerAgentDirectPhone", "BuyerAgentURL",
  "BuyerOfficeMlsId", "BuyerOfficeKey", "BuyerOfficeName",
  "BuyerOfficePhone", "BuyerOfficeURL",
  "BuyerTeamMlsId", "BuyerTeamKey", "BuyerTeamName",
  "BuyerAgentOfficePhone", "BuyerOfficeEmail",
];

// B11: Co-Buyer Agent (14 fields)
const B11_COBUYER_AGENT = [
  "CoBuyerAgentMlsId", "CoBuyerAgentKey", "CoBuyerAgentFirstName",
  "CoBuyerAgentLastName", "CoBuyerAgentFullName", "CoBuyerAgentEmail",
  "CoBuyerAgentDirectPhone", "CoBuyerAgentURL",
  "CoBuyerOfficeMlsId", "CoBuyerOfficeKey", "CoBuyerOfficeName",
  "CoBuyerOfficePhone",
  "CoBuyerTeamKey", "CoBuyerTeamName",
];

// B12: Unit Rooms & Size (25 fields)
const B12_UNIT_ROOMS = [
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf",
  "BathroomsOneQuarter", "BathroomsThreeQuarter",
  "BathroomsPartial", "BathroomsTotal", "BathroomsTotalInteger",
  "LivingArea", "LivingAreaUnits", "LivingAreaSource",
  "AboveGradeFinishedArea", "AboveGradeFinishedAreaSource",
  "AboveGradeFinishedAreaUnits", "BelowGradeFinishedArea",
  "BelowGradeFinishedAreaSource", "BelowGradeFinishedAreaUnits",
  "BuildingAreaTotal", "BuildingAreaSource", "BuildingAreaUnits",
  "RoomsTotal", "NumberOfDiningAreas", "NumberOfMasterBathrooms",
  "CeilingHeightFeet", "CeilingHeightInches",
  "TotalLegalRooms", "Levels", "Stories", "EntryLevel",
];

// B13: Building Details (19 fields)
const B13_BUILDING = [
  "BuildingName", "BuilderName", "ArchitectName",
  "YearBuilt", "YearBuiltSource", "YearBuiltDetails",
  "ArchitecturalStyle", "ConstructionMaterials",
  "Roof", "Foundation", "Heating", "Cooling",
  "ElectricOnPropertyYN", "Sewer", "WaterSource",
  "OtherStructures", "FloorNumber", "FloorNumberInBuilding",
  "BuildingKeyNumeric", "BasementYN", "FoundationArea", "FoundationDetails",
];

// B14: Building Amenities (20 fields)
const B14_BUILDING_AMENITIES = [
  "BuildingFeatures",
  "AssociationAmenities", "CommunityFeatures",
  "SecurityFeatures", "AccessibilityFeatures",
  "BuildingAccessibilityFeatures",
  "AttendanceType", "ElevatorYN",
  "PoolPrivateYN", "PoolFeatures", "SpaYN", "SpaFeatures",
  "GymYN", "DoormanYN", "LaundryFeatures",
  "StorageYN", "BicycleStorageYN",
  "WalkScore", "TransitScore", "BikeScore",
  "CommonWalls",
];

// B15: Financial — Unit (12 fields)
const B15_FINANCIAL_UNIT = [
  "AssociationFee", "AssociationFeeFrequency",
  "AssociationFee2", "AssociationFee2Frequency",
  "AssociationFeeIncludes", "AssociationName", "AssociationYN",
  "TaxAnnualAmount", "TaxYear", "TaxBlock", "TaxLot",
  "TaxMapNumber",
];

// B16: Financial — Building (10 fields)
const B16_FINANCIAL_BUILDING = [
  "GrossIncome", "GrossScheduledIncome", "NetOperatingIncome",
  "OperatingExpense", "OperatingExpenseIncludes",
  "IncomeIncludes", "NumberOfUnitsTotal",
  "CapRate", "GrossRentMultiplier", "PricePerUnit",
];

// B17: Expenses (16 fields)
const B17_EXPENSES = [
  "ElectricExpense", "FuelExpense", "GardenerExpense",
  "InsuranceExpense", "MaintenanceExpense", "ManagerExpense",
  "NewTaxesExpense", "OtherExpense", "PestControlExpense",
  "ProfessionalManagementExpense", "SuppliesExpense",
  "TrashExpense", "VacancyAllowance", "WaterSewerExpense",
  "WorkmansCompensationExpense", "CableTVExpense",
];

// B18: Concessions (4 fields)
const B18_CONCESSIONS = [
  "Concessions", "ConcessionsAmount", "ConcessionsComments",
  "SpecialListingConditions",
];

// B19: Lot & Land (14 fields)
const B19_LOT_LAND = [
  "LotSizeArea", "LotSizeUnits", "LotSizeSource",
  "LotSizeDimensions", "LotDimensionsSource",
  "LotFeatures", "FrontageLength", "FrontageLengthUnits",
  "FrontageType", "RoadSurfaceType", "RoadFrontageType",
  "Topography", "Vegetation", "WaterfrontFeatures",
  "LandLeaseYN", "LandLeaseAmount", "LandLeaseAmountFrequency", "LandLeaseExpirationDate",
  "ZoningDescription",
];

// B20: Unit Features (18 fields)
const B20_UNIT_FEATURES = [
  "InteriorFeatures", "ExteriorFeatures", "Flooring",
  "WindowFeatures", "FireplaceYN", "FireplaceFeatures",
  "FireplacesTotal", "Appliances", "PatioAndPorchFeatures",
  "Fencing", "View", "ViewYN",
  "BathroomCondition", "KitchenCondition",
  "AreaOverFAR", "AreaUnderFAR",
  "Furnished", "PropertyCondition", "CurrentUse",
];

// B21: Parking (8 fields)
const B21_PARKING = [
  "ParkingFeatures", "ParkingTotal", "GarageSpaces",
  "GarageYN", "AttachedGarageYN", "CarportSpaces", "CarportYN",
  "OpenParkingSpaces", "OpenParkingYN",
];

// B22: Outdoor & Pets (8 fields)
const B22_OUTDOOR_PETS = [
  "GardenYN", "GardenDescription",
  "DeckYN", "DeckDescription",
  "PatioYN", "PatioDescription",
  "PetsAllowed", "PetRestrictions",
];

// B23: Showings (8 fields)
const B23_SHOWINGS = [
  "ShowingContactName", "ShowingContactPhone",
  "ShowingContactPhoneExt", "ShowingContactType",
  "ShowingInstructions", "ShowingRequirements",
  "LockBoxType", "LockBoxLocation",
];

// B24: New Development (6 fields)
const B24_NEW_DEV = [
  "NewConstructionYN", "NewDevelopmentYN",
  "DevelopmentStatus", "BuilderName",
  "BuilderModel", "GreenBuildingVerificationType",
];

// B25: Green / Energy (8 fields)
const B25_GREEN = [
  "GreenEnergyEfficient", "GreenEnergyGeneration",
  "GreenWaterConservation", "GreenIndoorAirQuality",
  "GreenSustainability", "GreenBuildingVerificationType",
  "GreenCertification", "PowerProductionType",
];

// B26: Media (17 fields)
const B26_MEDIA = [
  "PhotosCount", "PhotosChangeTimestamp",
  "VideosCount", "VideoURL",
  "VirtualTourURLBranded", "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3",
  "ListingSocialMediaURL", "BuildingSocialMediaURL",
  "DocumentsAvailable", "DocumentsCount", "DocumentsChangeTimestamp",
  "FloorPlanURL", "InteractiveFloorPlanURL",
  "MapURL", "MatterportURL",
  "Media", "MediaURL",
];

// B27: Rental-Specific (21 fields)
const B27_RENTAL = [
  "LeaseAmount", "LeaseAmountFrequency",
  "LeaseConsideredTerms", "LeaseTerm",
  "AvailabilityDate", "PossessionDate",
  "Furnished", "FurnishedDescription",
  "PetsAllowed", "PetDeposit", "PetRestrictions",
  "RentalApplicationRequired", "ApplicationFee",
  "SecurityDeposit", "KeyDeposit",
  "TenantPays",
  // FARE Act fee transparency (NYC LL 119/2024)
  "MoveInCosts", "MoveInCostsComments", "MoveInCostsAmountTotal",
  "OngoingFees", "TenantPaysDescription",
];

// B30: FARE Act Custom Property Fields (4 fields — need $expand=CustomProperty)
const B30_FARE_ACT_FEES = [
  "AdditionalFee", "AdditionalFeeDescription",
  "AdditionalFeeYN", "FeeFrequency",
];

// B28: (empty in REBNY — reserved)
// B29: Other / Misc (12 fields)
const B29_OTHER = [
  "Disclaimer", "CopyrightNotice",
  "OriginatingSystemID", "OriginatingSystemName",
  "OriginatingSystemKey", "SourceSystemName",
  "ListingKeyNumeric",
  "MajorChangeType", "MajorChangeTimestamp",
  "PreviousStandardStatus",
  "CountyOrParish",
  "WaterfrontYN",
];

/** All REBNY IDX Plus Property field names combined. Deduplicated. */
export const ALL_RLS_FIELDS: string[] = [...new Set([
  ...B1_ADDRESS, ...B2_CLASSIFICATION, ...B3_LISTING_AGREEMENT,
  ...B4_STATUS_DATES, ...B5_PRICING, ...B6_DISPLAY_FLAGS,
  ...B7_REMARKS, ...B8_LIST_AGENT, ...B9_COLIST_AGENT,
  ...B10_BUYER_AGENT, ...B11_COBUYER_AGENT, ...B12_UNIT_ROOMS,
  ...B13_BUILDING, ...B14_BUILDING_AMENITIES, ...B15_FINANCIAL_UNIT,
  ...B16_FINANCIAL_BUILDING, ...B17_EXPENSES, ...B18_CONCESSIONS,
  ...B19_LOT_LAND, ...B20_UNIT_FEATURES, ...B21_PARKING,
  ...B22_OUTDOOR_PETS, ...B23_SHOWINGS, ...B24_NEW_DEV,
  ...B25_GREEN, ...B26_MEDIA, ...B27_RENTAL, ...B30_FARE_ACT_FEES, ...B29_OTHER,
])];

// ═══════════════════════════════════════════════════════════
// IDX PLUS FEED — FIELD EXCLUSIONS
// These 85 fields exist in the full RLS spec but are NOT available
// on the IDX Plus feed ("IDX Plus feed for Mallan Real Estate Inc").
// Validated live against Trestle on 2026-03-04.
//
// Reasons:
//   - IDX/VOW/Participant gate fields: pre-filtered by Trestle (the feed
//     only returns listings that pass these gates, so the fields aren't exposed)
//   - Media: navigation property — requires $expand=Media, not $select
//   - Team MLS IDs, some building/rental details: not provisioned on IDX Plus
//
// Trestle IDX Plus WebAPI provides all 1,363 fields. VOW-enriched fields
// (ClosePrice, DaysOnMarket, etc.) are served to authenticated portal users
// via sanitizeForVOW() in lib/compliance/dto.ts — no license upgrade needed.
// ═══════════════════════════════════════════════════════════
const IDX_PLUS_EXCLUDED_FIELDS = new Set([
  // Gate fields (pre-filtered by Trestle on IDX feed)
  "IDXEntireListingDisplayYN", "IDXAutomatedValuationDisplayYN",
  "VOWEntireListingDisplayYN", "VOWAutomatedValuationDisplayYN",
  "VOWConsumerCommentYN", "IDXParticipationYN", "ParticipantOnlyYN",
  // Address alternates
  "UnParsedAddress", "AlternateStreetName", "AlternateStreetNumber",
  "AlternateStreetDirPrefix", "AlternateStreetDirSuffix", "AlternateStreetSuffix",
  // Classification
  "NewDevelopmentYN",
  // Listing agreement
  "DuplicateListingIDs", "ParticipantTypes", "ExclusiveAgency",
  // Status & dates
  "SourceSystemModificationTimestamp", "ActivationTimestamp",
  "CancelationDate", "PossessionDate",
  "ComingSoonDate", "ComingSoonTimestamp",
  "ActiveOpenHouseCount", "LastChangeType", "LastChangeTimestamp",
  // Pricing
  "SaleType", "AuctionType",
  // Agent/team
  "ListTeamMlsId", "BuyerTeamMlsId",
  "CoListAgent2MLSID", "CoListAgent3MLSID",
  "CoListTeamKey", "CoListTeamName",
  "CoBuyerTeamKey", "CoBuyerTeamName",
  // Unit rooms
  "BathroomsTotal", "CeilingHeightFeet", "CeilingHeightInches",
  "NumberOfDiningAreas", "NumberOfMasterBathrooms", "TotalLegalRooms",
  // Building (BuildingKeyNumeric re-enabled — Trestle 6.17, deployed 2026-03-04, metadata live 2026-03-10)
  "ArchitectName", "FloorNumber", "FloorNumberInBuilding",
  "Foundation",
  // Building amenities
  "BuildingAccessibilityFeatures", "AttendanceType",
  "ElevatorYN", "GymYN", "DoormanYN",
  "StorageYN", "BicycleStorageYN",
  "TransitScore", "BikeScore",
  // Financial
  "GrossRentMultiplier", "PricePerUnit", "CableTVExpense",
  // Lot & land
  "FrontageLengthUnits",
  // Unit features
  "BathroomCondition", "KitchenCondition", "AreaOverFAR", "AreaUnderFAR",
  // Outdoor & pets
  "GardenYN", "GardenDescription", "DeckYN", "DeckDescription",
  "PatioYN", "PatioDescription", "PetRestrictions",
  // Green
  "GreenCertification",
  // Media (navigation property — use $expand=Media instead)
  "Media", "MediaURL", "VideoURL", "FloorPlanURL",
  "InteractiveFloorPlanURL", "MatterportURL",
  "ListingSocialMediaURL", "BuildingSocialMediaURL",
  // Rental
  "LeaseConsideredTerms", "FurnishedDescription",
  "RentalApplicationRequired", "ApplicationFee", "KeyDeposit",
  // Rental move-in (not provisioned on IDX Plus — validated 2026-03-13)
  "MoveInCostsComments", "MoveInCostsAmountTotal",
  // FARE Act CustomProperty fields (need $expand=CustomProperty)
  "AdditionalFee", "AdditionalFeeDescription", "AdditionalFeeYN", "FeeFrequency",
]);

/**
 * Fields validated for the IDX Plus feed $select query.
 * = ALL_RLS_FIELDS minus fields not available on the IDX Plus feed.
 * Use this for $select in fetchFromTrestle() to avoid 400 errors.
 */
export const IDX_PLUS_SELECT_FIELDS: string[] = ALL_RLS_FIELDS.filter(
  (f) => !IDX_PLUS_EXCLUDED_FIELDS.has(f)
);

// ═══════════════════════════════════════════════════════════
// DISTRIBUTION PROFILES
// Each field is tagged for gate enforcement.
// ═══════════════════════════════════════════════════════════
type DistProfile = "PUB" | "PUB-A" | "AGT" | "HID" | "CTL" | "SYS" | "CLOSE" | "INT";

const HIDDEN_FIELDS = new Set([
  "PrivateRemarks", "ShowingInstructions", "ShowingContactPhone",
  "ShowingContactPhoneExt", "ShowingContactName", "ShowingContactType",
  "ShowingRequirements", "LockBoxType", "LockBoxLocation",
  "ListAgentDirectPhone", "ListAgentEmail", "ListAgentURL",
  "CoListAgentDirectPhone", "CoListAgentEmail", "CoListAgentURL",
  "ListOfficePhone", "ListOfficeURL", "ListOfficeEmail",
]);

const CONTROL_FIELDS = new Set([
  "IDXEntireListingDisplayYN", "IDXAutomatedValuationDisplayYN",
  "VOWEntireListingDisplayYN", "InternetEntireListingDisplayYN",
  "InternetAddressDisplayYN", "IDXParticipationYN",
  "ParticipantOnlyYN", "SyndicateTo",
]);

const CLOSE_ONLY_FIELDS = new Set([
  "CloseDate", "ClosePrice",
  "BuyerAgentMlsId", "BuyerAgentKey", "BuyerAgentFirstName",
  "BuyerAgentLastName", "BuyerAgentFullName",
  "BuyerOfficeMlsId", "BuyerOfficeKey", "BuyerOfficeName",
]);

/** Get the distribution profile for a field. */
export function getFieldProfile(fieldName: string): DistProfile {
  if (HIDDEN_FIELDS.has(fieldName)) return "HID";
  if (CONTROL_FIELDS.has(fieldName)) return "CTL";
  if (CLOSE_ONLY_FIELDS.has(fieldName)) return "CLOSE";
  if (fieldName.startsWith("CoBuyer") || fieldName.startsWith("Buyer")) return "AGT";
  return "PUB";
}

// ═══════════════════════════════════════════════════════════
// PRIVATE FIELD FILTER — strip before DB storage
// These fields must never be persisted in raw_data (compliance).
// ═══════════════════════════════════════════════════════════
const PRIVATE_FIELDS = new Set([
  'PrivateRemarks', 'PrivateOfficeRemarks', 'SyndicationRemarks',
  'ShowingInstructions', 'ShowingContactPhone', 'ShowingContactPhoneExt',
  'ShowingContactName', 'ShowingContactType', 'ShowingRequirements',
  'LockBoxType', 'LockBoxLocation', 'LockBoxSerialNumber',
  'ListAgentEmail', 'ListAgentDirectPhone', 'ListAgentHomePhone',
  'ListAgentMlsId', 'ListAgentURL',
  'CoListAgentEmail', 'CoListAgentDirectPhone', 'CoListAgentMlsId',
  'BuyerAgentEmail', 'BuyerAgentDirectPhone', 'BuyerAgentMlsId',
  'CoBuyerAgentEmail', 'CoBuyerAgentDirectPhone', 'CoBuyerAgentMlsId',
  'ListAgentAOR', 'BuyerAgentAOR',
  'BuyerFinancing', 'ConcessionComments',
  'ExpirationDate',
]);

function stripPrivateFields(raw: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!PRIVATE_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// ═══════════════════════════════════════════════════════════
// MAPPER: Raw Trestle → Prisma Listing
// ═══════════════════════════════════════════════════════════

/** Pick specific keys from an object. */
function pick(
  raw: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) {
      result[key] = raw[key];
    }
  }
  return result;
}

/** Normalize rename: if Trestle sends RLS name, map to our canonical name. */
function normalizeRenames(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw };
  for (const [rlsName, canonicalName] of Object.entries(RESO_TO_RLS_RENAMES)) {
    if (rlsName in normalized && !(canonicalName in normalized)) {
      normalized[canonicalName] = normalized[rlsName];
    }
  }
  // Special: CeilingHeightFeet + CeilingHeightInches → combined
  // /* IDX-VALIDATE-IGNORE: CeilingHeight fields excluded from IDX Plus — only populated on CRM listing submissions, not IDX fetch */
  if (normalized.CeilingHeightFeet || normalized.CeilingHeightInches) {
    const feet = Number(normalized.CeilingHeightFeet) || 0;
    const inches = Number(normalized.CeilingHeightInches) || 0;
    normalized.CeilingHeight = feet + inches / 12; /* IDX-VALIDATE-IGNORE: derived field */
  }
  return normalized;
}

/**
 * Determine listing_type from PropertyType.
 */
function inferListingType(raw: Record<string, unknown>): "sale" | "rent" {
  const pt = String(raw.PropertyType || "").toLowerCase();
  if (pt.includes("lease") || pt.includes("rental")) return "rent";
  return "sale";
}

/**
 * Determine borough from address fields (NYC-specific).
 */
function inferBorough(raw: Record<string, unknown>): string | null {
  const county = String(raw.CountyOrParish || "").toLowerCase();
  const city = String(raw.City || "").toLowerCase();

  if (county.includes("new york") || city === "manhattan") return "Manhattan";
  if (county.includes("kings") || city === "brooklyn") return "Brooklyn";
  if (county.includes("queens") || city === "queens") return "Queens";
  if (county.includes("bronx") || city === "bronx") return "Bronx";
  if (county.includes("richmond") || city === "staten island") return "Staten Island";

  return null;
}

/**
 * Map a raw Trestle record to our Prisma Listing shape.
 * Returns the data object ready for prisma.listing.upsert().
 */
export function mapTrestleToPrisma(rawInput: Record<string, unknown>): {
  listing_id: string;
  mls_id: string | null;
  status: string;
  listing_type: string;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: string;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: string | null;
  borough: string | null;
  neighborhood: string | null;
  city: string | null;
  postal_code: string | null;
  idx_display_yn: boolean;
  internet_entire_listing_display_yn: boolean;
  internet_address_display_yn: boolean;
  internet_automated_valuation_display_yn: boolean;
  internet_consumer_comment_yn: boolean;
  participant_only: boolean;
  owner_opt_out: boolean;
  address: Record<string, unknown>;
  features: Record<string, unknown>;
  media: unknown;
  compliance: Record<string, unknown>;
  agent_info: Record<string, unknown>;
  raw_data: Record<string, unknown>;
  modification_timestamp: Date;
  listing_contract_date: Date | null;
  last_synced_from_trestle: Date;
  sync_status: string;
} {
  const raw = normalizeRenames(rawInput);

  const listingId = String(raw.ListingId || raw.ListingKey || "");
  const mlsId = raw.ListingKey ? String(raw.ListingKey) : null;
  const status = String(raw.StandardStatus || raw.MlsStatus || "Active");
  const listingType = inferListingType(raw);

  // Explicit columns
  const listPrice = raw.ListPrice != null ? String(raw.ListPrice) : "0"; // String for Prisma Decimal precision
  const bedroomsTotal = raw.BedroomsTotal != null ? Number(raw.BedroomsTotal) : null;
  const bathroomsFull = raw.BathroomsFull != null ? Number(raw.BathroomsFull) : null;
  const bathroomsHalf = raw.BathroomsHalf != null ? Number(raw.BathroomsHalf) : null;
  const livingArea = raw.LivingArea != null ? String(raw.LivingArea) : null; // String for Prisma Decimal precision

  const borough = inferBorough(raw);
  // SubdivisionName = real neighborhood (UWS, Tribeca, etc.)
  // CityRegion = borough (Manhattan, Brooklyn, etc.) — NOT neighborhood
  const neighborhood = raw.SubdivisionName ? String(raw.SubdivisionName) :
    (raw.CityRegion && raw.CityRegion !== borough ? String(raw.CityRegion) : null);

  // Distribution gates — canonical fields per compliance/IDX-VOW-DISPLAY-RULES.md
  // IDXEntireListingDisplayYN does NOT exist on Trestle (verified 2026-04-19 against
  // live $metadata; docs explicitly state "no separate IDXEntireListingDisplayYN
  // field exists"). Use InternetEntireListingDisplayYN instead.
  const internetEntireListing = raw.InternetEntireListingDisplayYN !== false;
  const internetAddress = raw.InternetAddressDisplayYN !== false;
  // REBNY Gate 2 — "Participant Only" = Permissions enum value 'Private' per
  // UCBA 2026 H4 / Definitions (W) and data/rebny-rls-property-lookup.csv:1643.
  // (The legacy field name ParticipantOnlyYN was never a Trestle field — it was
  // transcribed from UCBA's English-language Definition (W) describing
  // "Participant Only," not from a real Trestle schema field.)
  // Trestle IDX Plus feed appears to pre-filter 'Private' listings, but we enforce
  // the gate independently for defense-in-depth and REBNY audit compliance.
  const permissions = typeof raw.Permission === 'string' ? raw.Permission : (typeof raw.Permissions === 'string' ? raw.Permissions : '');
  const participantOnly = permissions === 'Private';
  // REBNY Gate 1 — Owner Opt-Out via Permission enum (compliance/IDX-VOW-DISPLAY-RULES.md:31).
  const ownerOptOut =
    permissions === 'OwnerOptOut' ||
    permissions === 'Owner Opt-Out' ||
    String(raw.MlsStatus || '') === 'OwnerOptOut';
  // Legacy local flag kept for backward compat with DB schema's idx_display_yn column.
  // Evaluates true iff all the above gates pass AND internet display is enabled.
  const idxDisplayYn = internetEntireListing && !participantOnly && !ownerOptOut;

  // JSONB columns — pick fields by category
  const address = pick(raw, B1_ADDRESS);
  const features = {
    ...pick(raw, B2_CLASSIFICATION),
    ...pick(raw, B12_UNIT_ROOMS),
    ...pick(raw, B13_BUILDING),
    ...pick(raw, B14_BUILDING_AMENITIES),
    ...pick(raw, B15_FINANCIAL_UNIT),
    ...pick(raw, B16_FINANCIAL_BUILDING),
    ...pick(raw, B17_EXPENSES),
    ...pick(raw, B18_CONCESSIONS),
    ...pick(raw, B19_LOT_LAND),
    ...pick(raw, B20_UNIT_FEATURES),
    ...pick(raw, B21_PARKING),
    ...pick(raw, B22_OUTDOOR_PETS),
    ...pick(raw, B23_SHOWINGS),
    ...pick(raw, B24_NEW_DEV),
    ...pick(raw, B25_GREEN),
    ...pick(raw, B27_RENTAL),
    ...pick(raw, B30_FARE_ACT_FEES),
    ...pick(raw, B29_OTHER),
  };
  const compliance = {
    ...pick(raw, B3_LISTING_AGREEMENT),
    ...pick(raw, B4_STATUS_DATES),
    ...pick(raw, B5_PRICING),
    ...pick(raw, B6_DISPLAY_FLAGS),
    ...pick(raw, B7_REMARKS),
  };
  const agentInfo = {
    ...pick(raw, B8_LIST_AGENT),
    ...pick(raw, B9_COLIST_AGENT),
    ...pick(raw, B10_BUYER_AGENT),
    ...pick(raw, B11_COBUYER_AGENT),
  };
  // Normalize media to {url, mediaType, order} format — same as what batch-fetch produces.
  // Without this, $expand=Media stores raw Trestle format {MediaURL, MediaCategory, Order}
  // while batch-fetch stores mapped format, causing dual formats in the DB.
  const rawMediaArr = Array.isArray(raw.Media) ? raw.Media : [];
  const media = rawMediaArr.length > 0
    ? rawMediaArr.map((m: Record<string, unknown>) => {
        const cat = String(m.MediaCategory || '').toLowerCase();
        let mediaType = 'Photo';
        if (cat.includes('floor plan')) mediaType = 'FloorPlan';
        else if (cat.includes('video')) mediaType = 'Video';
        else if (cat.includes('virtual tour')) mediaType = 'VirtualTour';
        const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
        return {
          url: String(m.MediaURL || ''),
          mediaType,
          order: isPreferred ? -1 : Number(m.Order ?? 0),
        };
      }).filter((m: { url: string }) => m.url)
    : pick(raw, B26_MEDIA);

  // Timestamps
  const modTimestamp = raw.ModificationTimestamp
    ? new Date(String(raw.ModificationTimestamp))
    : new Date();
  const contractDate = raw.ListingContractDate
    ? new Date(String(raw.ListingContractDate))
    : null;

  return {
    listing_id: listingId,
    mls_id: mlsId,
    status,
    listing_type: listingType,
    property_type: raw.PropertyType ? String(raw.PropertyType) : null,
    property_sub_type: raw.PropertySubType ? String(raw.PropertySubType) : null,
    list_price: listPrice,
    bedrooms_total: bedroomsTotal,
    bathrooms_full: bathroomsFull,
    bathrooms_half: bathroomsHalf,
    living_area: livingArea,
    borough,
    neighborhood,
    city: raw.City ? String(raw.City) : null,
    postal_code: raw.PostalCode ? String(raw.PostalCode) : null,
    idx_display_yn: idxDisplayYn,
    internet_entire_listing_display_yn: internetEntireListing,
    internet_address_display_yn: internetAddress,
    internet_automated_valuation_display_yn: raw.InternetAutomatedValuationDisplayYN !== false,
    internet_consumer_comment_yn: raw.InternetConsumerCommentYN !== false,
    participant_only: participantOnly,
    owner_opt_out: ownerOptOut,
    address,
    features,
    media,
    compliance,
    agent_info: agentInfo,
    raw_data: stripPrivateFields(rawInput), // Filtered — private fields stripped for compliance
    modification_timestamp: modTimestamp,
    listing_contract_date: contractDate,
    last_synced_from_trestle: new Date(),
    sync_status: "synced",
  };
}

/**
 * Check if a raw Trestle record passes all 6 distribution gates for IDX display.
 * Returns { displayable, reason? }.
 */
export function checkDistributionGates(raw: Record<string, unknown>): {
  displayable: boolean;
  reason?: string;
} {
  const normalized = normalizeRenames(raw);
  const permissions = typeof normalized.Permission === 'string' ? String(normalized.Permission) : (typeof normalized.Permissions === 'string' ? String(normalized.Permissions) : '');

  // ─────────────────────────────────────────────────────────────
  // REBNY RLS Distribution Gates — see compliance/IDX-VOW-DISPLAY-RULES.md
  // Field names verified against live Trestle $metadata on 2026-04-19.
  // Dead-field references previously in this function (ParticipantOnlyYN,
  // IDXParticipationYN, IDXEntireListingDisplayYN) were transcribed from the
  // REBNY English-language checklist, not the Trestle OData schema — removed.
  // ─────────────────────────────────────────────────────────────

  // Gate 1 — Owner Opt-Out (Permissions = 'OwnerOptOut'). UCBA Art. I §5(A).
  // Owner has signed Exhibit B opt-out. NO public dissemination whatsoever.
  if (
    permissions === 'OwnerOptOut' ||
    permissions === 'Owner Opt-Out' ||
    String(normalized.MlsStatus || '') === 'OwnerOptOut'
  ) {
    return { displayable: false, reason: "Owner opted out" };
  }

  // Gate 2 — Participant Only (Permissions = 'Private'). UCBA Definition (W).
  // Listing shared on RLS for authorized Participant view only — no public IDX,
  // VOW, syndication, or website display. Per compliance/IDX-VOW-DISPLAY-RULES.md:41.
  if (permissions === 'Private') {
    return { displayable: false, reason: "Participant-only listing (Permissions=Private)" };
  }

  // Gate 3 — IDX Display (InternetEntireListingDisplayYN). UCBA Art. III §2(C).
  // When False, listing is excluded from all IDX broker websites.
  // Trestle also exposes an office-level `IDXOfficeParticipationYN` on the Office
  // resource; we do not join to that here because the Trestle IDX Plus feed
  // already pre-filters offices. Can be added via $expand=ListOffice if needed.
  if (normalized.InternetEntireListingDisplayYN === false) {
    return { displayable: false, reason: "Internet display disabled" };
  }

  // Gate 4 — Coming Soon status (not blocking — display with required badge).
  // Handled downstream; see lib/idx/display-adapter.ts + SearchListingCard.tsx.

  // Gate 5 — Closed > 24h must be removed. UCBA Art. I §6.
  const status = String(normalized.StandardStatus || normalized.MlsStatus || "");
  if (status === "Closed" || status === "Expired") {
    const closeDate = normalized.CloseDate ? new Date(String(normalized.CloseDate)) : null;
    if (closeDate) {
      const hoursSinceClose = (Date.now() - closeDate.getTime()) / (1000 * 60 * 60);
      if (hoursSinceClose > 24) {
        return { displayable: false, reason: "Closed listing > 24 hours" };
      }
    }
  }

  // Gate 6 — Syndication opt-out (SyndicateOptOut). Not a display block for IDX
  // surfaces — only prevents forwarding to third-party portals. Handled at the
  // syndication pipeline level, not here.

  return { displayable: true };
}

/** 41 required REBNY RLS fields that must be present for a valid listing. */
export const REQUIRED_RLS_FIELDS = [
  // Absolute minimum to identify and store a listing.
  // Verified against live Trestle data — only fields that are ALWAYS present.
  // Many UCBA "mandatory" fields are mandatory for LISTING INPUT (via LMP),
  // not for every record on the IDX feed. Trestle returns null for optional fields.
  "ListingId", "PropertyType", "ListPrice", "StandardStatus",
  "StreetName", "City", "StateOrProvince", "PostalCode",
  "ListAgentMlsId", "ListOfficeName",
  "ModificationTimestamp",
  // Note: StreetNumber, BedroomsTotal, BathroomsFull, LivingArea, YearBuilt,
  // TaxAnnualAmount, TaxYear, OwnershipType, MlsStatus, ActivationDate, PhotosCount,
  // etc. are often null on Trestle — especially for new, incomplete, or special listings.
  // The sync should accept these and store what's available, not reject the entire listing.
];

/**
 * Validate that a raw Trestle record contains all 41 required fields.
 */
export function validateRequiredFields(raw: Record<string, unknown>): {
  valid: boolean;
  missingFields: string[];
} {
  const normalized = normalizeRenames(raw);
  const missing = REQUIRED_RLS_FIELDS.filter(
    (field) => normalized[field] === undefined || normalized[field] === null
  );
  return { valid: missing.length === 0, missingFields: missing };
}

/**
 * Minimum required fields for historical/closed listings.
 * Closed listings in Trestle naturally lack many active-listing fields
 * (IDX display flags, activation dates, tax info, etc.).
 * We only need enough to identify and store the listing.
 */
export const REQUIRED_HISTORICAL_FIELDS = [
  "ListingId", "PropertyType", "ListPrice", "StandardStatus",
  "City", "StateOrProvince",
  "ListAgentMlsId", "ListAgentFullName",
  "ModificationTimestamp",
];

/**
 * Relaxed validation for historical/closed listings.
 * Only checks the minimum fields needed to store a valid record.
 */
export function validateHistoricalFields(raw: Record<string, unknown>): {
  valid: boolean;
  missingFields: string[];
} {
  const normalized = normalizeRenames(raw);
  const missing = REQUIRED_HISTORICAL_FIELDS.filter(
    (field) => normalized[field] === undefined || normalized[field] === null
  );
  return { valid: missing.length === 0, missingFields: missing };
}
