// lib/idx/trestle-mapper.ts
// Cotality API -> Mallan canonical storage (Prisma Listing model).
//
// The provider is the Cotality API. There is no RESO layer and no RLS layer in
// between: field names, types and enum members are whatever the live Cotality
// contract exposes. REBNY/RLS is a Mallan compliance layer far downstream and
// never redefines a Cotality fact.
//
// Field groups below are MALLAN INGESTION/SELECT GROUPS — how Mallan organises
// its $select, not a taxonomy Cotality defines.
// READ-ONLY: maps inbound data only — nothing goes back to Trestle.

import { affirmPermission } from "@/lib/compliance/gates";
import { hasPermissionToken } from '@/lib/compliance/gates';
import { slimRawData } from "@/lib/compliance/raw-data-keep-fields";
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";

// ═══════════════════════════════════════
// PROVIDER FIELD RENAMES — REMOVED 2026-08-23. Do not reintroduce.
//
// A provider-field rename table lived here and copied one real Cotality field's
// value into a DIFFERENT real Cotality field's name, on the premise stated in
// its own comment: that the feed sends one name and Mallan normalises it to
// another.
//
// THAT PREMISE IS FALSE. Verified against live Cotality $metadata 2026-08-23:
// of its 19 pairs, THIRTEEN had BOTH names declared as separate Cotality
// fields; ONE had neither name declared at all (DuplicateListingIDs ->
// CoExclusiveListingKey); five had a source Cotality does not declare, so they
// never fired. Cotality sends both names. There is nothing to normalize.
//
// The two most damaging entries:
//
//   MlsStatus       -> StandardStatus    two DIFFERENT enums, 25 members vs 11.
//                                        `Leased` is an MlsStatus member with no
//                                        StandardStatus equivalent at all.
//   SourceSystemKey -> ListingKey        two of the three distinct listing
//                                        identities the canonical field registry
//                                        deliberately separates.
//
// plus every *MlsId -> *Key pair, which Cotality exposes as distinct fields.
//
// There is no RESO layer and no RLS layer between Cotality and Mallan. Cotality
// is the provider; each of its fields keeps its own name and its own value. If
// Mallan needs a business status derived from the detailed MlsStatus, that is an
// explicit Mallan business rule AFTER the verified provider mapping — never a
// pretence that Cotality supplied a different field.
//
// Guarded by lib/idx/__tests__/cotality-provider-boundary.test.ts.

// CeilingHeightFeet + CeilingHeightInches → CeilingHeight (split into 2)
// Handled specially in mapTrestleToPrisma

// ═══════════════════════════════════════════════════════════
// ALL RLS PROPERTY FIELD NAMES (for $select query)
// Grouped into 29 MALLAN INGESTION GROUPS (B1–B29). These are how Mallan
// organises its $select, NOT a taxonomy the Cotality contract defines.
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
  // `ListingKey` is REQUIRED by the Property keyset cursor (2026-08-13).
  //
  // `SourceSystemKey` alone is not enough, and it is NOT a substitute: they are
  // two distinct Cotality fields. A rename table used to copy SourceSystemKey
  // into ListingKey "defensively"; it was removed 2026-08-23 (see the note at
  // the top of this file). This feed sends ListingKey
  // DIRECTLY and leaves SourceSystemKey NULL. Verified live against
  // api.cotality.com the same day: a $select of both returns
  // ListingKey="1091862396" with SourceSystemKey=null on every sampled row.
  //
  // Without this field `raw.ListingKey` is undefined on every record, so the
  // cursor cannot record the tie-breaker half of its position — it would freeze
  // and Property ingestion would stop while still reporting last_run_status
  // "ok". The keyset $orderby and $filter reference ListingKey server-side and
  // work regardless; this is purely about reading the value BACK.
  "ListingKey",
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
  "AvailabilityDate",
  // PossessionDate is RESO-standard but Trestle ignores it (CLAUDE.md, verified
  // 2026-04-19). Use AvailabilityDate for rental availability and CloseDate for
  // sale possession.
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

// B6: Display Flags / Distribution
// Live-Trestle truth (verified 2026-04-19 against $metadata):
//   - IDX*/VOW*/IDXParticipationYN/ParticipantOnlyYN do NOT exist as separate
//     fields. Owner Opt-Out / Participant Only are encoded via the `Permission`
//     enum on the Property resource (handled in checkDistributionGates).
//   - InternetEntireListingDisplayYN/InternetAddressDisplayYN are listed in
//     B3_LISTING_AGREEMENT (master gate + address gate).
const B6_DISPLAY_FLAGS = [
  "InternetAutomatedValuationDisplayYN", "InternetConsumerCommentYN",
  "SyndicateTo",
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

// B13: Building Details (23 fields)
const B13_BUILDING = [
  "BuildingName", "BuilderName", "ArchitectName",
  "YearBuilt", "YearBuiltSource", "YearBuiltDetails",
  "ArchitecturalStyle", "ConstructionMaterials",
  "Roof", "Foundation", "Heating", "Cooling",
  // Search/CRM filters and reporting depend on these live IDX Plus fields.
  "Basement", "CoolingYN", "HeatingYN", "DirectionFaces",
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

// B15: Financial — Unit (14 fields)
const B15_FINANCIAL_UNIT = [
  "AssociationFee", "AssociationFeeFrequency",
  "AssociationFee2", "AssociationFee2Frequency",
  "AssociationFeeIncludes", "AssociationName", "AssociationYN",
  "CurrentFinancing", "FinancialDataSource",
  // DownPaymentAssistance* are live Property fields (migrated from CustomProperty;
  // verified 2026-06-04). In the Property $select so they are fetched from Property.
  "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
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

// B19: Lot & Land (15 fields)
const B19_LOT_LAND = [
  "LotSizeArea", "LotSizeUnits", "LotSizeSource",
  "LotSizeDimensions", "LotDimensionsSource",
  "LotFeatures", "FrontageLength", "FrontageLengthUnits",
  "FrontageLengthUnit",
  "FrontageType", "RoadSurfaceType", "RoadFrontageType",
  "Topography", "Vegetation", "WaterfrontFeatures",
  "LandLeaseYN", "LandLeaseAmount", "LandLeaseAmountFrequency", "LandLeaseExpirationDate",
  "ZoningDescription",
];

// B20: Unit Features (19 fields)
const B20_UNIT_FEATURES = [
  "InteriorFeatures", "ExteriorFeatures", "Flooring",
  "WindowFeatures", "FireplaceYN", "FireplaceFeatures",
  "FireplacesTotal", "Appliances", "PatioAndPorchFeatures",
  "Fencing", "View", "ViewYN",
  "Exposures",
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

// B26: Media — Property-level media metadata (counts, timestamps, tour URLs).
// NOTE: photo/video/floorplan ITEM urls do NOT live on Property — they come from
// the Media resource (MediaURL/OriginalMediaUrl, classified by MediaCategory).
// Exported for the live-parity guard test (media-fields-live-parity.test.ts).
export const B26_MEDIA = [
  "PhotosCount", "PhotosChangeTimestamp",
  "VideosCount",
  "VirtualTourURLBranded", "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3",
  "DocumentsAvailable", "DocumentsCount", "DocumentsChangeTimestamp",
  "MapURL",
  "Media", "MediaURL",
];

// B27: Rental-Specific
// Live-Trestle truth (verified 2026-04-19; MoveInCosts* re-verified 2026-06-04):
//   - PossessionDate is a field the Cotality contract ignores (CLAUDE.md "fields
//     that DO NOT exist on Trestle"). Use AvailabilityDate.
//   - MoveInCostsAmount (Edm.Decimal) + MoveInCostsComments (Edm.String) ARE live
//     Property fields as of 2026-06-04 (the cached snapshot had lagged). Both are
//     selected here alongside the MoveInCosts multi-select picklist.
//   - MoveInCostsAmountTotal still does NOT exist on Trestle — kept out (phantom).
const B27_RENTAL = [
  "LeaseAmount", "LeaseAmountFrequency",
  "LeaseConsideredTerms", "LeaseTerm",
  "AvailabilityDate",
  "AvailableLeaseType", "ExistingLeaseType",
  "Furnished", "FurnishedDescription",
  "PetsAllowed", "PetDeposit", "PetRestrictions",
  "RentalApplicationRequired", "ApplicationFee",
  "SecurityDeposit", "KeyDeposit",
  "TenantPays",
  // FARE Act fee transparency (NYC LL 119/2024)
  // MoveInCosts (multi-select cost types) + MoveInCostsAmount (Edm.Decimal $) +
  // MoveInCostsComments (Edm.String) are all live Property fields (2026-06-04).
  "MoveInCosts", "MoveInCostsAmount", "MoveInCostsComments",
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
export const COTALITY_PROPERTY_SELECT_FIELDS: string[] = [...new Set([
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
  // (IDX*/VOW*/IDXParticipationYN/ParticipantOnlyYN previously listed here are
  // not present in any of the canonical B-category arrays anymore; they do not
  // exist on live Trestle — the gate model uses the `Permission` enum.)
  // Address alternates
  "UnParsedAddress", "AlternateStreetName", "AlternateStreetNumber",
  "AlternateStreetDirPrefix", "AlternateStreetDirSuffix", "AlternateStreetSuffix",
  // Classification
  "NewDevelopmentYN",
  // Listing agreement
  "DuplicateListingIDs", "ParticipantTypes", "ExclusiveAgency",
  // Status & dates (PossessionDate already removed from B4_STATUS_DATES — RESO-only)
  "SourceSystemModificationTimestamp", "ActivationTimestamp",
  "CancelationDate",
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
  // Media navigation property + Media-resource field — excluded from the flat
  // Property $select; media items are fetched via $expand=Media / fetchListingMedia
  // (classified by MediaCategory). Phantom *URL names removed 2026-06-04 (not on live).
  "Media", "MediaURL",
  // Rental
  "LeaseConsideredTerms", "FurnishedDescription",
  "RentalApplicationRequired", "ApplicationFee", "KeyDeposit",
  // (MoveInCostsAmount + MoveInCostsComments are NOT excluded — they are live
  // Property fields selected via B27_RENTAL as of 2026-06-04. MoveInCostsAmountTotal
  // remains absent from live and is simply never listed in any B-category array.)
  // FARE Act CustomProperty fields (need $expand=CustomProperty)
  "AdditionalFee", "AdditionalFeeDescription", "AdditionalFeeYN", "FeeFrequency",
]);

/**
 * Fields validated for the IDX Plus feed $select query.
 * = COTALITY_PROPERTY_SELECT_FIELDS minus fields not available on the IDX Plus feed.
 * Use this for $select in fetchFromTrestle() to avoid 400 errors.
 */
export const IDX_PLUS_SELECT_FIELDS: string[] = COTALITY_PROPERTY_SELECT_FIELDS.filter(
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

// CTL fields — agent-controlled distribution gates. The canonical fields on live
// Trestle (verified 2026-04-19) are the Internet-* gates plus the Permission enum
// and SyndicateTo. The legacy IDX*/VOW*/IDXParticipationYN/ParticipantOnlyYN/
// SyndicateYN names are retained as defensive entries so getFieldProfile() also
// classifies legacy payloads as CTL — they should never leak through public DTOs.
const CONTROL_FIELDS = new Set([
  // Live-Trestle canonical
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  "InternetAutomatedValuationDisplayYN", "InternetConsumerCommentYN",
  "Permission", "SyndicateTo",
  // Legacy-name guards (do NOT exist on live Trestle — defensive only)
  "IDXEntireListingDisplayYN", "IDXAutomatedValuationDisplayYN",
  "IDXParticipationYN", "ParticipantOnlyYN",
  "VOWEntireListingDisplayYN", "VOWAutomatedValuationDisplayYN",
  "VOWConsumerCommentYN", "SyndicateYN",
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

/**
 * Cotality-only normalisation.
 *
 * The provider-field rename pass was REMOVED here (see the note at the top of
 * this file): it copied one Cotality field into another Cotality field's name.
 * Every Cotality field now keeps its own name and its own value.
 *
 * What remains is a genuine Mallan DERIVATION, not a rename: Cotality exposes
 * ceiling height as two separate numeric fields, and Mallan stores one combined
 * value. That is a Mallan business computation from two real provider fields,
 * which is exactly where such logic belongs.
 */
function normalizeRenames(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...raw };
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
 * RESO StandardStatus values that mean "no longer publicly displayable on IDX."
 *
 * Mirrors the data-retention cron predicate at
 * `app/api/cron/data-retention/route.ts:79`. Cron and writer agree on the
 * same closed set so the H1 dual-write gap (C2 fix, 2026-05-13) cannot
 * reopen: every time the mapper recomputes `idx_display_yn` for a terminal
 * row, the result is forced to `false` and the cron's §2.05 cleanup is no
 * longer over-written by the next idx-sync pass.
 *
 * Exported for symmetry with the cron and for direct test access. New code
 * that needs to evaluate "is this listing past-its-life" should import this
 * set instead of redeclaring its own copy — a third copy would re-open the
 * dual-write gap on a different axis.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'Closed',
  'Sold',
  'Leased',
  'Rented',
  'Withdrawn',
  'Expired',
  'Cancelled',
]);

/**
 * RESO StandardStatus values that are publicly displayable on IDX.
 *
 * Mirrors `DISPLAYABLE_STATUSES` in `lib/idx/db-to-public-dto.ts:155`. Kept
 * here so callers of `normalizeStandardStatus` can fold input strings like
 * `"active"` / `"ACTIVE"` / `"Active "` back to the canonical `"Active"`.
 */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'Active',
  'ComingSoon',
  'ActiveUnderContract',
]);

/**
 * CRM lifecycle statuses that exist outside the public IDX displayable set
 * but are still legitimate inputs from CRM forms (Mallan exclusives). Folding
 * non-canonical variants like `"draft"` / `"pending"` back to canonical keeps
 * CRM rows queryable by exact-case predicates and prevents the stealth-audit-
 * anomaly class (row stored with non-canonical status, invisible to every
 * exact-case counter).
 */
const CRM_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  'Draft',
  'Incomplete',
  'Pending',
]);

/**
 * Alias map for known non-canonical spellings of terminal statuses that the
 * normalizer rewrites to the canonical REBNY/Trestle form. Limited to
 * canonical-equivalent spellings — never coerces an arbitrary unknown string
 * into a terminal value. Examples:
 *   - "canceled" (US English single-L) → "Cancelled" (RESO canonical double-L)
 *
 * Add a new entry here only when a real-world client has been observed
 * submitting that variant. The alias map is the only place where one status
 * string is rewritten into a different status string; everywhere else the
 * normalizer is a case-fold + trim operation that preserves identity.
 */
const STATUS_ALIASES: Record<string, string> = {
  canceled: 'Cancelled', // single-L → double-L
};

/**
 * Normalize an untrusted status string (POST body, CRM form, etc.) to the
 * canonical REBNY/Trestle spelling so the terminal-status guard and every
 * downstream exact-case predicate (data-retention cron, ops:health,
 * `DISPLAYABLE_STATUSES`) all see the same value.
 *
 * H1 amend (2026-05-13) — closes a normalization gap raised by Maya on
 * PR #113: `body.status = "closed"` previously bypassed the terminal-status
 * guard because the set is case-sensitive. The fix is to normalize once at
 * the route boundary, then use the normalized value for BOTH the DB write
 * and the guard so they cannot disagree.
 *
 * Behavior:
 *   - Empty / null / non-string input              → "Active"
 *   - Exact-case canonical hit                      → returned as-is
 *   - Trim + case-fold match against a known set    → canonical form
 *   - Known alias (e.g., "canceled" → "Cancelled")  → canonical form
 *   - Anything else                                 → trimmed input (preserved)
 *
 * Unknown statuses are NOT silently rewritten to a known value. If a new
 * RESO status emerges, add it to the right set (TERMINAL_STATUSES,
 * ACTIVE_STATUSES, CRM_LIFECYCLE_STATUSES) and the normalizer picks it up
 * automatically.
 */
export function normalizeStandardStatus(input: unknown): string {
  if (typeof input !== 'string') return 'Active';
  const trimmed = input.trim();
  if (!trimmed) return 'Active';

  // Fast path — exact-case canonical.
  if (
    TERMINAL_STATUSES.has(trimmed) ||
    ACTIVE_STATUSES.has(trimmed) ||
    CRM_LIFECYCLE_STATUSES.has(trimmed)
  ) {
    return trimmed;
  }

  // Lowercase alias hit (e.g., "canceled" → "Cancelled").
  const lower = trimmed.toLowerCase();
  if (STATUS_ALIASES[lower]) return STATUS_ALIASES[lower];

  // Case-insensitive match against the known canonical sets.
  for (const s of TERMINAL_STATUSES) {
    if (s.toLowerCase() === lower) return s;
  }
  for (const s of ACTIVE_STATUSES) {
    if (s.toLowerCase() === lower) return s;
  }
  for (const s of CRM_LIFECYCLE_STATUSES) {
    if (s.toLowerCase() === lower) return s;
  }

  // Unknown — preserve trimmed form. Never silently coerce an unknown
  // value to a known status; new statuses must be added to the relevant
  // set above before they round-trip through the normalizer.
  return trimmed;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase A — Centralized display-gate computation
// ───────────────────────────────────────────────────────────────────────────
//
// Single source of truth for the 5 display-gate columns on `listings`:
//   - idx_display_yn
//   - internet_entire_listing_display_yn
//   - internet_address_display_yn
//   - internet_automated_valuation_display_yn
//   - internet_consumer_comment_yn
//
// Before this helper, every writer (Trestle mapper, CRM POST, CRM PATCH, CRM
// status PATCH, listing-expiration cron, ensure-listing, convert, reset-sync)
// re-implemented the same combination of:
//   1. normalizeStandardStatus → canonical status string
//   2. TERMINAL_STATUSES.has  → terminal-status guard
//   3. `!== false` semantics  → REBNY IDX Plus pre-filter for Internet*Display
//   4. affirmPermission       → fail-closed per-row AVM / ConsumerComment
//   5. !participantOnly && !ownerOptOut → REBNY Gate 1 / Gate 2
//
// Drift between any two writers reopens the H1 dual-write gap that PR #112
// + PR #113 closed for the mapper path. The audit
// `docs/idx/post-reconciliation-tightening-audit-2026-05-20.md` documents the
// surviving gaps (W1 / W2 / W3) the helper closes. Adding a new writer that
// touches these columns? Call this helper — do not redeclare the logic.
//
// Semantics (KEEP IN SYNC with mapTrestleToPrisma's comment block at the
// `internetEntireListing` definition below, and with the data-retention cron
// at app/api/cron/data-retention/route.ts:79 — those three must agree on the
// terminal-status set forever):
//
//   - Internet*DisplayYN inputs use the REBNY IDX Plus pre-filter convention:
//     null/undefined = "REBNY upstream filter passed this row" = displayable.
//     Only an explicit `false` (rare per-row override) blocks display. CRM
//     forms producing these flags follow the same convention because the
//     normalizer applies the same defaults (lib/compliance/normalizer.ts).
//
//   - InternetAutomatedValuationDisplayYN + InternetConsumerCommentYN are
//     per-row opt-out flags populated by REBNY (~97% true / ~3% false).
//     These remain fail-closed via affirmPermission — null = false = blocked.
//
//   - participantOnly + ownerOptOut accept already-derived booleans (the
//     caller did the Permission enum → boolean conversion). Use strict
//     equality on `=== true` so an undefined / null / string value defaults
//     to false (not-blocked); the caller is expected to pass the canonical
//     boolean shape.
//
//   - status is normalized via normalizeStandardStatus, so callers can pass
//     a lowercased / whitespace-padded / aliased ("canceled" → "Cancelled")
//     input safely. Terminal statuses force idx_display_yn=false regardless
//     of the other flags (this is the H1 fix at writer-side; the cron is
//     belt-and-suspenders for DB-direct mutation paths).
export interface ComputeGateColumnsInput {
  /** REBNY/RESO StandardStatus value. Normalized internally via
   * `normalizeStandardStatus`; safe to pass un-normalized strings. */
  status: unknown;
  /** Trestle / form field. null = displayable per IDX Plus pre-filter. */
  internetEntireListingDisplayYN?: unknown;
  /** Trestle / form field. null = displayable per IDX Plus pre-filter. */
  internetAddressDisplayYN?: unknown;
  /** Per-row opt-out flag. null = blocked (fail-closed). */
  internetAutomatedValuationDisplayYN?: unknown;
  /** Per-row opt-out flag. null = blocked (fail-closed). */
  internetConsumerCommentYN?: unknown;
  /** Already-derived from `Permission='Private'`. Pass `true` to block. */
  participantOnly?: unknown;
  /** Already-derived from `Permission='OwnerOptOut'` etc. Pass `true` to block. */
  ownerOptOut?: unknown;
  /**
   * RLS eligibility flag (`listings.rls_eligible` column). Commercial /
   * website-only listings carry `rls_eligible=false` and MUST be excluded
   * from all 6 IDX distribution gates regardless of other flags
   * (CLAUDE.md "Commercial Property Classification" — RLS compliance rules
   * apply ONLY to `rls_eligible=true` listings; commercial listings are
   * website-only on mallan.nyc and bypass IDX distribution entirely).
   *
   * Semantics:
   *   - undefined / null → defaults to true (preserves Trestle-mapper
   *                       behavior — Trestle-sourced rows are always REBNY-
   *                       eligible; Trestle never serializes rls_eligible
   *                       because it's an internal-only column)
   *   - false           → forces `idx_display_yn=false` regardless of all
   *                       other flags. The CRM POST already has this guard
   *                       inline at `rls_eligible: rlsEligible &&`; the
   *                       helper carries it forward to every other writer.
   *   - true            → no-op (defers to other gates)
   *
   * Added 2026-05-20 (Codex review on PR #165) — the original Phase A
   * helper omitted this input, which would have caused the W1 CRM status
   * PATCH to flip `idx_display_yn=true` on a commercial Active listing.
   * Locked by tests in `lib/idx/__tests__/compute-gate-columns.test.ts`
   * "rls_eligible first-class gate" describe block.
   */
  rls_eligible?: unknown;
}

export interface ComputeGateColumnsResult {
  /** Aggregate gate — only true when `rls_eligible !== false` AND status
   * is non-terminal AND entire-listing display is allowed AND not
   * participant-only AND not owner-opted-out. */
  idx_display_yn: boolean;
  internet_entire_listing_display_yn: boolean;
  internet_address_display_yn: boolean;
  internet_automated_valuation_display_yn: boolean;
  internet_consumer_comment_yn: boolean;
  /** Observability — the normalized status the helper used. Not a DB column. */
  normalized_status: string;
  /** Observability — true if `normalized_status ∈ TERMINAL_STATUSES`. */
  is_terminal: boolean;
  /** Observability — false only if input.rls_eligible was explicit `false`. */
  rls_eligible: boolean;
}

/** The two REBNY per-row gates that `Permission` (a source field) determines. */
export interface PermissionGates {
  /** The raw Permission string as read, `''` when absent/non-string. */
  permissions: string;
  /** REBNY Gate 2 — Permission='Private'. */
  participantOnly: boolean;
  /** REBNY Gate 1 — Owner Opt-Out. */
  ownerOptOut: boolean;
}

/**
 * Derive the two source-determined REBNY gates from a raw Trestle Property
 * record. THE single owner of `Permission` interpretation.
 *
 * Extracted from `mapTrestleToPrisma` 2026-08-13 with NO behavior change: the
 * expressions below are the ones that lived inline, moved verbatim. The
 * extraction exists so a second caller cannot form a second opinion about what
 * `Permission` means.
 *
 * That second caller is `scripts/build-recovery-manifest.ts`. It reconciles
 * provider state against local state, and it previously fed the STORED local
 * `participant_only` / `owner_opt_out` back into the gate evaluator to decide
 * whether stored `idx_display_yn` was correct. Those two columns are themselves
 * outputs of this function, so that asked stored state to vouch for stored
 * state — circular. A listing whose Permission changed 'Private' → 'Public' at
 * the source would keep a stale local `participant_only=true`, which would
 * "explain" its stale `idx_display_yn=false` and it would never be repaired.
 * The manifest now calls THIS function on the CURRENT provider record instead.
 *
 * Note `ownerOptOut` also consults `MlsStatus`, so a caller must supply both
 * fields to reproduce ingest's decision; supplying only `Permission` silently
 * loses the `MlsStatus='OwnerOptOut'` arm.
 *
 * @param raw Trestle Property record — reads `Permission` (legacy alias
 *            `Permissions`) and `MlsStatus`. Any other key is ignored.
 */
export function derivePermissionGates(raw: Record<string, unknown>): PermissionGates {
  // REBNY Gate 2 — "Participant Only" = Permissions enum value 'Private' per
  // UCBA 2026 H4 / Definitions (W) and data/rebny-rls-property-lookup.csv:1643.
  // `Property.Permission` is a MULTI-ENUM (live type
  // `Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission`), and the feed
  // delivers multi-token values — `IDX,SyndicateOptOut` occurs live.
  //
  // This previously did `permissions === 'Private'` on a scalar read, so a
  // `"IDX,Private"` listing was persisted as NOT participant-only while
  // `lib/compliance/gates.ts` gated the same value correctly. Two answers to one
  // field, and this side writes the PERSISTED columns that feed idx_display_yn.
  //
  // Token interpretation now has ONE owner: the compliance primitive. This
  // composes it rather than re-parsing. The direction matters — compliance is
  // the lower-level module and must not depend on this mapper.
  const permissionInput = { Permission: raw.Permission, Permissions: raw.Permissions };
  const permissions =
    typeof raw.Permission === 'string'
      ? raw.Permission
      : typeof raw.Permissions === 'string'
        ? raw.Permissions
        : Array.isArray(raw.Permission)
          ? (raw.Permission as unknown[]).join(',')
          : '';
  const participantOnly = hasPermissionToken(permissionInput, 'Private');
  // REBNY Gate 1 — retained as a FAIL-CLOSED guard. `OwnerOptOut` is NOT among
  // the 20 live Permission members, so it cannot fire from provider data; it
  // stays until a live field/value is confirmed rather than being dropped on
  // field-truth alone.
  const ownerOptOut =
    hasPermissionToken(permissionInput, 'OwnerOptOut') ||
    hasPermissionToken(permissionInput, 'Owner Opt-Out') ||
    String(raw.MlsStatus || '') === 'OwnerOptOut';
  return { permissions, participantOnly, ownerOptOut };
}

/**
 * Compute all 5 display-gate columns for a `listings` row write. Pure: no
 * DB access, no side effects, no logging. Callers can use the result to
 * pass into `prisma.listing.update` / `prisma.listing.create` / etc.
 *
 * If you are adding a new writer to one of the gate columns, call this
 * helper instead of re-implementing the logic. The CI pin-test
 * `tests/runtime/listing-writer-projection-coverage.test.ts` and the unit
 * tests in `lib/idx/__tests__/compute-gate-columns.test.ts` lock the
 * contract.
 */
export function computeGateColumns(
  input: ComputeGateColumnsInput,
): ComputeGateColumnsResult {
  const normalized_status = normalizeStandardStatus(input.status);
  const is_terminal = TERMINAL_STATUSES.has(normalized_status);

  // IDX Plus pre-filter: null / undefined = REBNY upstream filter passed
  // this row through = displayable. Only explicit `false` blocks.
  const internet_entire_listing_display_yn =
    input.internetEntireListingDisplayYN !== false;
  const internet_address_display_yn =
    input.internetAddressDisplayYN !== false;

  // Per-row opt-out flags — fail-closed via affirmPermission (null=false).
  const internet_automated_valuation_display_yn = affirmPermission(
    input.internetAutomatedValuationDisplayYN,
  );
  const internet_consumer_comment_yn = affirmPermission(
    input.internetConsumerCommentYN,
  );

  // Defensive strict-equality on the already-derived booleans. Caller is
  // expected to pass the canonical boolean shape; anything else defaults
  // to "not blocked".
  const owner_opt_out = input.ownerOptOut === true;
  const participant_only = input.participantOnly === true;

  // rls_eligible (commercial/website-only listings carry false; Trestle-
  // sourced rows are always REBNY-eligible so omitted/null defaults to
  // true to preserve mapper behavior). See input docstring for the full
  // rationale and the Codex PR #165 review that surfaced this.
  const rls_eligible = input.rls_eligible !== false;

  // The aggregate gate. Mirrors the data-retention cron predicate at
  // app/api/cron/data-retention/route.ts:79 so writer + cron + helper all
  // agree on the terminal-status set. The leading `rls_eligible &&` mirrors
  // the existing inline CRM POST gate (`rlsEligible && ...` in
  // app/api/crm/listings/route.ts) so commercial / website-only listings
  // can never become publicly-displayable IDX rows.
  const idx_display_yn =
    rls_eligible &&
    !is_terminal &&
    internet_entire_listing_display_yn &&
    !participant_only &&
    !owner_opt_out;

  return {
    idx_display_yn,
    internet_entire_listing_display_yn,
    internet_address_display_yn,
    internet_automated_valuation_display_yn,
    internet_consumer_comment_yn,
    normalized_status,
    is_terminal,
    rls_eligible,
  };
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
  // Phase A2 typed agent columns (mirror agent_info JSON; added A1, dual-written here)
  list_agent_full_name: string | null;
  list_office_name: string | null;
  list_agent_email: string | null;
  list_agent_direct_phone: string | null;
  list_office_mls_id: string | null;
  list_agent_mls_id: string | null;
  co_list_office_mls_id: string | null;
  co_list_agent_mls_id: string | null;
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
  //
  // REBNY IDX PLUS PRE-FILTER SEMANTICS (verified 2026-04-30 against live
  // Trestle + production DB state; layer distinction clarified 2026-05-01).
  //
  // Three layers to keep separate:
  //   REBNY  — the MLS/RLS organization, data owner, and policy layer
  //   Cotality/Trestle — the API/feed platform that implements + serves the data
  //   RESO   — the certification/data-standard framework (the Property entity
  //            type, field names, and DD versions all originate here)
  //
  // The behavior below is SPECIFIC to mallan.nyc's REBNY IDX Plus feed served
  // via the live api.cotality.com/trestle feed. Other Cotality/Trestle
  // deployments serving different MLSes (with different policy layers) MAY
  // behave differently for these fields. Do not generalize this comment to
  // "all Trestle feeds."
  //
  // Under REBNY's policy layer, non-displayable rows are filtered out of the
  // IDX Plus feed BEFORE they reach this mapper. Two consequences:
  //   1. InternetEntireListingDisplayYN and InternetAddressDisplayYN return
  //      null for the vast majority of records (the field exists in the RESO
  //      schema and Cotality exposes it, but REBNY's policy layer leaves it
  //      unset because the upstream filter already enforced the policy).
  //   2. These fields are NOT OData-filterable — the feed returns HTTP 400
  //      "Results from 'RLS' has been suppressed (provider Level)" for any
  //      `eq true` / `eq false` filter. Confirmed proof of REBNY-policy
  //      pre-filter intent (provider Level = REBNY policy applied at the
  //      Cotality data-serving boundary).
  //
  // Therefore null on these two fields means "REBNY's upstream filter already
  // gated this row in" = displayable. Only an explicit `false` (rare, but
  // valid for the per-row override case) means "do not display." Wrapping
  // these in `affirmPermission` would collapse null → false and suppress
  // every REBNY-IDX-Plus-sourced row; that was the bug fixed here (commit
  // 55803f87 → recovery 2026-04-30).
  //
  // This is INTENTIONALLY DIFFERENT from InternetAutomatedValuationDisplayYN
  // and InternetConsumerCommentYN below, which REBNY treats as per-listing
  // opt-out flags populated at row level (~97% true / ~3% false in the live
  // feed). Those remain fail-CLOSED via affirmPermission. Locked in by the
  // writer-side gate coercion tests in
  // lib/compliance/__tests__/compliance-gates.test.ts.
  //
  // Runtime payload behavior must be verified per feed, not assumed from RESO
  // certification alone. If mallan.nyc later subscribes to OneKey, NY State
  // MLS, or another non-REBNY MLS (per the parked external-inventory spec
  // Phase 2-A), the policy layer will be different and this null-handling
  // logic must be re-evaluated for that feed independently.
  // REBNY Gate 2 — "Participant Only" = Permissions enum value 'Private' per
  // UCBA 2026 H4 / Definitions (W) and data/rebny-rls-property-lookup.csv:1643.
  // (The legacy field name ParticipantOnlyYN was never a Trestle field — it was
  // transcribed from UCBA's English-language Definition (W) describing
  // "Participant Only," not from a real Trestle schema field.)
  // Trestle IDX Plus feed appears to pre-filter 'Private' listings, but we enforce
  // the gate independently for defense-in-depth and REBNY audit compliance.
  const { participantOnly, ownerOptOut } = derivePermissionGates(raw);
  // Phase A (2026-05-20) — delegate the 5-column gate computation to the
  // canonical `computeGateColumns` helper above. Was an inline calculation;
  // moved to a shared helper so the W1/W2/W3 writer surfaces identified by
  // docs/idx/post-reconciliation-tightening-audit-2026-05-20.md can call the
  // same logic instead of re-implementing it. Behavior is byte-identical to
  // the previous inline form:
  //   - InternetEntireListingDisplayYN / InternetAddressDisplayYN use the
  //     IDX Plus pre-filter convention (`!== false`).
  //   - InternetAutomatedValuationDisplayYN / InternetConsumerCommentYN use
  //     fail-closed `affirmPermission`.
  //   - idx_display_yn forces false on TERMINAL_STATUSES (PR #112/#113 +
  //     H1 amend 2026-05-13 — closes the dual-write ping-pong with the
  //     data-retention cron at app/api/cron/data-retention/route.ts:79).
  // See the helper's docstring for the full semantics rationale.
  const gateColumns = computeGateColumns({
    status: raw.StandardStatus,
    internetEntireListingDisplayYN: raw.InternetEntireListingDisplayYN,
    internetAddressDisplayYN: raw.InternetAddressDisplayYN,
    internetAutomatedValuationDisplayYN: raw.InternetAutomatedValuationDisplayYN,
    internetConsumerCommentYN: raw.InternetConsumerCommentYN,
    participantOnly,
    ownerOptOut,
  });

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
  // S1 (#415): stop persisting the redundant Trestle `compliance` JSON copy.
  // Every field that used to be copied here — B3 listing agreement, B4 status/
  // dates, B5 pricing, B6 display flags, B7 remarks — is ALREADY persisted in
  // raw_data (RAW_DATA_KEEP_FIELDS) and/or the typed columns, and the DB
  // `compliance` column is no longer read by render (PublicRemarks now reads
  // features/raw_data). The typed display/gate columns (idx_display_yn,
  // internet_*_display_yn, participant_only, owner_opt_out, status) are computed
  // separately from raw.* below and are UNCHANGED by this. The column is
  // RETAINED for CRM/syndication-authored keys (validation_result, approval
  // keys), which are written directly by those routes — never by this mapper.
  // (B3–B7 constants remain referenced by the field-select list at ~line 370.)
  const compliance: Record<string, unknown> = {};
  const agentInfo = {
    ...pick(raw, B8_LIST_AGENT),
    ...pick(raw, B9_COLIST_AGENT),
    ...pick(raw, B10_BUYER_AGENT),
    ...pick(raw, B11_COBUYER_AGENT),
  };
  // Normalize media to [{url, mediaType, order}] format — same shape as
  // what batch-media-fetch produces.
  //
  // CRITICAL: the `media` DB field MUST be an array, not a summary object.
  // Frontend cards, public DTO, and search all iterate this as an array.
  // Previous fallback `pick(raw, B26_MEDIA)` created an object shape
  // `{ PhotosCount, VideosCount, DocumentsCount, VirtualTourURLUnbranded, ... }`
  // whenever Trestle returned the record without `$expand=Media` (i.e. on
  // every sync with maxRecords > 200). That summary object then silently
  // OVERWROTE whatever the batch-media backfill had previously written.
  //
  // Result (production snapshot 2026-04-24): 8,082 of 9,368 sale-active
  // listings (86%) had `media: { PhotosCount: N, ... }` instead of a photo
  // array. Frontends iterated zero elements → rendered "No Photo."
  //
  // Fix: always produce an array. Empty when Trestle didn't expand Media;
  // the subsequent batch-media fetch in sync.ts populates it. Summary
  // counts like PhotosCount remain available on top-level Trestle fields
  // for callers that need them — they are NOT the media array.
  const rawMediaArr = Array.isArray(raw.Media) ? raw.Media : [];
  const media: Array<{ url: string; mediaType: string; order: number }> =
    rawMediaArr.length > 0
      ? rawMediaArr
          .map((m: Record<string, unknown>) => {
            const mediaClass = classifyMediaItem(m);
            const mediaType =
              mediaClass === 'floorplan' ? 'FloorPlan' :
              mediaClass === 'video' ? 'Video' :
              mediaClass === 'virtualTour' ? 'VirtualTour' :
              'Photo';
            const isPreferred =
              m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
            return {
              url: String(m.MediaURL || ''),
              mediaType,
              order: isPreferred ? -1 : Number(m.Order ?? 0),
            };
          })
          .filter((m: { url: string }) => m.url)
      : [];

  // Timestamps
  const modTimestamp = raw.ModificationTimestamp
    ? new Date(String(raw.ModificationTimestamp))
    : new Date();
  const contractDate = raw.ListingContractDate
    ? new Date(String(raw.ListingContractDate))
    : null;

  // Phase A: typed agent columns mirror the agent_info JSON (shared producer seam).
  const typedAgentCols = typedAgentColumnsFromJson(agentInfo as Record<string, unknown>);

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
    idx_display_yn: gateColumns.idx_display_yn,
    internet_entire_listing_display_yn: gateColumns.internet_entire_listing_display_yn,
    internet_address_display_yn: gateColumns.internet_address_display_yn,
    internet_automated_valuation_display_yn: gateColumns.internet_automated_valuation_display_yn,
    internet_consumer_comment_yn: gateColumns.internet_consumer_comment_yn,
    participant_only: participantOnly,
    owner_opt_out: ownerOptOut,
    address,
    features,
    media,
    compliance,
    agent_info: agentInfo,
    // Phase A2 (agent_info normalization, #410/#411): dual-write the 8 typed agent
    // columns, each mirroring the agent_info JSON above. agent_info JSON is UNCHANGED.
    // PII boundary: list_agent_email/list_agent_direct_phone are stored here but their
    // EXPOSURE stays gated by the DTO/portal-mask layer (Phase B readers).
    ...typedAgentCols,
    // raw_data goes through TWO filters before persistence:
    //   1. stripPrivateFields — REBNY/UCBA private fields (PrivateRemarks,
    //      ShowingInstructions, ShowingContactPhone, agent direct phone/email,
    //      LockBox*) — never persistable on either path.
    //   2. slimRawData — drops Trestle fields not read by any consumer.
    //      This is the PR 10 Neon shedding lever — Trestle Property dumps
    //      ~1,457 fields per row but our codebase reads ≈75 of them. The
    //      keep set lives in lib/compliance/raw-data-keep-fields.ts and is
    //      pinned by lib/compliance/__tests__/raw-data-keep-fields.test.ts.
    //
    // Note: this slimming applies ONLY to Trestle-imported listings (this
    // mapper). CRM-agent-created listings preserve their full form payload
    // in raw_data via app/api/crm/listings/route.ts → buildPersistenceRecord.
    // stripPrivateFields always returns an object, so slimRawData's null
    // branch is unreachable here — coerce for the mapped TrestleMapping type.
    raw_data: slimRawData(stripPrivateFields(rawInput)) ?? {},
    modification_timestamp: modTimestamp,
    listing_contract_date: contractDate,
    last_synced_from_trestle: new Date(),
    sync_status: "synced",
  };
}

/**
 * Check if a raw Trestle record passes all 6 distribution gates for IDX display.
 * Returns { displayable, reason? }.
 *
 * IMPLEMENTATION NOTE — 2026-04-28 fail-closed correction:
 * The previous local implementation used `=== false` checks for IDX permission
 * flags, which is FAIL-OPEN: null/undefined/missing values pass the gate. Per
 * compliance doctrine, missing permission must FAIL CLOSED. This function now
 * delegates to `evaluateDisplayGate()` in `lib/compliance/gates.ts` which uses
 * `affirmPermission()` (returns true ONLY when explicitly true).
 *
 * The 12 callers across `app/api/{idx,listings,buildings,agents,crm,cron,market,
 * open-houses}/...` automatically inherit the fix without source changes.
 */
export function checkDistributionGates(raw: Record<string, unknown>): {
  displayable: boolean;
  reason?: string;
} {
  // Lazy require to avoid potential bundler cycle with lib/compliance/status.ts

  const { evaluateDisplayGate } = require("@/lib/compliance/gates") as typeof import("@/lib/compliance/gates");
  const normalized = normalizeRenames(raw);
  // This wrapper is exclusively for raw Trestle records on the REBNY IDX Plus
  // feed (sync ingest + /api/idx/search live path). Pass `idxPlusPreFiltered:
  // true` so null `InternetEntireListingDisplayYN` / `InternetAddressDisplayYN`
  // are treated as displayable (REBNY pre-filters non-displayable rows out of
  // the feed; survivors carry null on these two flags). Mirrors the
  // writer-side convention at lines 705-706 above. AVM, ConsumerComment,
  // owner_opt_out, participant_only, closed-24h remain fail-closed.
  const result = evaluateDisplayGate(
    normalized as Record<string, unknown>,
    { idxPlusPreFiltered: true },
  );
  if (result.displayable) return { displayable: true };
  return { displayable: false, reason: result.reason };
}

/** The Cotality fields Mallan requires before it will accept a listing. */
export const COTALITY_REQUIRED_FIELDS = [
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
  const missing = COTALITY_REQUIRED_FIELDS.filter(
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
