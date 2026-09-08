// lib/idx/trestle-mapper.ts
// THE canonical Cotality (Trestle) Property record → Mallan Listing storage mapper.
// Provider contract = the live api.cotality.com/trestle Property resource, nothing else: every
// field name below is verified against the dated live field pull (data/cotality-property-fields.live.json)
// by tests/runtime/provider-authority-census.test.ts. REBNY / UCBA appear here only as the
// compliance and policy layer that governs display; RESO only as vocabulary where a comment
// needs it. No provider fact is fabricated: a record that lacks a fact Mallan storage cannot
// represent as unknown is refused (UnrepresentableProviderRecordError), never defaulted.
// READ-ONLY: maps inbound data only — nothing goes back to Cotality.

import { affirmPermission } from "@/lib/compliance/gates";
import { slimRawData } from "@/lib/compliance/raw-data-keep-fields";
import { classifyMediaItem } from "@/lib/media/listing-media-resolver";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { LEGACY_MALLAN_FORM_CONTROL_KEYS } from "@/lib/compliance/legacy-form-keys";
import { enumValueTokens, isCotalityStandardStatus } from "@/lib/cotality/live-contract";
// Compile-checked field lists: every name below must be a field the live $metadata declares on
// Property, or `npm run type-check` fails. See lib/cotality/contract.ts (generated contract).
import { cotalityFields } from "@/lib/cotality/contract";
// THE canonical location interpretation (Maya, 2026-09-08, exhaustive live evidence):
// borough ← CityRegion, neighborhood ← SubdivisionName, county ← CountyOrParish. No inference.
import { boroughFromCityRegion, neighborhoodFromSubdivisionName } from "@/lib/listings/canonical-location";
import {
  mallanStatusFromCotality,
  MALLAN_TERMINAL_STATUSES,
  MALLAN_ACTIVE_STATUSES,
  MALLAN_LIFECYCLE_STATUSES,
} from "@/lib/listings/mallan-status";
import type { Prisma } from "@prisma/client";

/**
 * A provider record that Mallan storage cannot represent honestly. Thrown by
 * mapTrestleToPrisma instead of inventing a value (the pre-Packet-2 mapper defaulted a
 * missing status to "Active", a missing ListPrice to "0" and a missing ModificationTimestamp
 * to the local clock). Callers already run validateRequiredFields first; this is the
 * fail-loud backstop so no path can persist a fabricated fact.
 */
export class UnrepresentableProviderRecordError extends Error {
  constructor(public readonly field: string, public readonly listingId: string) {
    super(`Cotality record ${listingId || "(no ListingId)"} cannot be stored: ${field} is absent and Mallan storage cannot represent it as unknown`);
    this.name = "UnrepresentableProviderRecordError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COTALITY PROPERTY FIELD NAMES (the live $select contract)
// Grouped by Mallan's own working categories (B1–B30). Every name is a live Cotality
// Property field; names that exist only in REBNY's submission spec were removed
// (Packet 2 closure, 2026-09-05) — they are not provider fields.
// ═══════════════════════════════════════════════════════════

// B1: Address (25 fields)
const B1_ADDRESS = cotalityFields('Property', [
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish", "Country",
  "CrossStreet", "Directions", "Latitude", "Longitude",
  "MapCoordinate",
  // Retained by the raw_data keep-list; a keep-list entry is inert unless the field is requested
  // (tests: lib/idx/__tests__/sync-select-covers-runtime.test.ts). UnparsedAddress: populated 591,607.
  "UnparsedAddress", "MLSAreaMajor",
]);

// B2: Classification (18 fields)
const B2_CLASSIFICATION = cotalityFields('Property', [
  // `ListingKey` is REQUIRED by the Property keyset cursor (2026-08-13).
  //
  // `SourceSystemKey` alone is not enough. The former alias table mapped
  // SourceSystemKey -> ListingKey defensively, but this feed sends ListingKey
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
  "DevelopmentStatus", "NumberOfUnitsTotal",
  "NumberOfUnitsVacant", "NumberOfUnitsLeased", "NumberOfBuildings",
  "StoriesTotal", "NumberOfSeparateElectricMeters", "NumberOfSeparateGasMeters",
  "NumberOfSeparateWaterMeters", "BusinessType",
]);

// B3: Listing Agreement (13 fields)
const B3_LISTING_AGREEMENT = cotalityFields('Property', [
  "ListingAgreement", "ListingContractDate", "ExpirationDate",
  "OriginalEntryTimestamp", "ListingService", "MlsStatus",
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  "SyndicationRemarks",
  "Permission", // Owner opt-out detection — required by checkDistributionGates() (singular, not )
]);

// B4: Status & Dates (32 fields)
const B4_STATUS_DATES = cotalityFields('Property', [
  "StandardStatus",
  "ModificationTimestamp", "StatusChangeTimestamp",
  "ActivationDate", "OnMarketDate",
  "OffMarketDate", "OffMarketTimestamp", "BackOnMarketDate",
  "BackOnMarketTimestamp", "ContractStatusChangeDate",
  "PurchaseContractDate", "CloseDate", "ClosePrice",
  "WithdrawnDate",
  "DaysOnMarket", "CumulativeDaysOnMarket",
  "PendingTimestamp", "ContingentDate",
  "AvailabilityDate",
  // PossessionDate is RESO-standard but Trestle ignores it (CLAUDE.md, verified
  // 2026-04-19). Use AvailabilityDate for rental availability and CloseDate for
  // sale possession.
  "OriginalListPrice", "PreviousListPrice",
  "ListPriceLow", "ListPrice",
  // Lifecycle timestamps the canonical lifecycle reads (lib/listings/canonical-lifecycle.ts):
  // PriceChangeTimestamp dates the last price change (populated 361,678); OnMarketTimestamp (265,702).
  "PriceChangeTimestamp", "OnMarketTimestamp",
]);

// B5: Pricing Extras (8 fields)
const B5_PRICING = cotalityFields('Property', [
  "SpecialListingConditions", "Concessions",
  "ConcessionsAmount", "ConcessionsComments",
  "LeaseAmount", "LeaseAmountFrequency",
]);

// B6: Display Flags / Distribution
// Live-Trestle truth (verified 2026-04-19 against $metadata):
//   - IDX*/VOW*/IDXParticipationYN/ParticipantOnlyYN do NOT exist as separate
//     fields. Owner Opt-Out / Participant Only are encoded via the `Permission`
//     enum on the Property resource (handled in checkDistributionGates).
//   - InternetEntireListingDisplayYN/InternetAddressDisplayYN are listed in
//     B3_LISTING_AGREEMENT (master gate + address gate).
const B6_DISPLAY_FLAGS = cotalityFields('Property', [
  "InternetAutomatedValuationDisplayYN", "InternetConsumerCommentYN",
  "SyndicateTo",
  "ListingURL",
]);

// B7: Remarks (8 fields)
const B7_REMARKS = cotalityFields('Property', [
  "PublicRemarks", "PrivateRemarks", "SyndicationRemarks",
  "ShowingInstructions", "ListingTerms",
  "Disclaimer", "CopyrightNotice", "PropertyCondition",
]);

// B8: List Agent & Office (18 fields)
const B8_LIST_AGENT = cotalityFields('Property', [
  "ListAgentMlsId", "ListAgentKey", "ListAgentFirstName",
  "ListAgentLastName", "ListAgentFullName", "ListAgentEmail",
  "ListAgentDirectPhone", "ListAgentOfficePhone", "ListAgentURL",
  "ListOfficeMlsId", "ListOfficeKey", "ListOfficeName",
  "ListOfficePhone", "ListOfficeURL", "ListOfficeEmail",
  "ListTeamMlsId", "ListTeamKey", "ListTeamName",
]);

// B9: Co-List Agents (24 fields)
const B9_COLIST_AGENT = cotalityFields('Property', [
  "CoListAgentMlsId", "CoListAgentKey", "CoListAgentFirstName",
  "CoListAgentLastName", "CoListAgentFullName", "CoListAgentEmail",
  "CoListAgentDirectPhone", "CoListAgentURL",
  "CoListOfficeMlsId", "CoListOfficeKey", "CoListOfficeName",
  "CoListOfficePhone",
  // The second co-list office is a populated scalar (50,994 rows) even though the CoListAgent navigation
  // returns only the first co-list agent (navigation census 2026-09-08).
  "CoListOffice2Key", "CoListOffice2MlsId", "CoListOffice2Name",
  "CoListAgent2Key", "CoListAgent2FirstName",
  "CoListAgent2LastName", "CoListAgent2FullName",
  "CoListAgent3Key", "CoListAgent3FirstName",
  "CoListAgent3LastName", "CoListAgent3FullName",
  
]);

// B10: Buyer Agent & Office (18 fields)
const B10_BUYER_AGENT = cotalityFields('Property', [
  "BuyerAgentMlsId", "BuyerAgentKey", "BuyerAgentFirstName",
  "BuyerAgentLastName", "BuyerAgentFullName", "BuyerAgentEmail",
  "BuyerAgentDirectPhone", "BuyerAgentURL",
  "BuyerOfficeMlsId", "BuyerOfficeKey", "BuyerOfficeName",
  "BuyerOfficePhone", "BuyerOfficeURL",
  "BuyerTeamMlsId", "BuyerTeamKey", "BuyerTeamName",
  "BuyerAgentOfficePhone", "BuyerOfficeEmail",
]);

// B11: Co-Buyer Agent (14 fields)
const B11_COBUYER_AGENT = cotalityFields('Property', [
  "CoBuyerAgentMlsId", "CoBuyerAgentKey", "CoBuyerAgentFirstName",
  "CoBuyerAgentLastName", "CoBuyerAgentFullName", "CoBuyerAgentEmail",
  "CoBuyerAgentDirectPhone", "CoBuyerAgentURL",
  "CoBuyerOfficeMlsId", "CoBuyerOfficeKey", "CoBuyerOfficeName",
  "CoBuyerOfficePhone",
  
]);

// B12: Unit Rooms & Size (25 fields)
const B12_UNIT_ROOMS = cotalityFields('Property', [
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf",
  "BathroomsOneQuarter", "BathroomsThreeQuarter",
  "BathroomsPartial", "BathroomsTotalInteger",
  "LivingArea", "LivingAreaUnits", "LivingAreaSource",
  "AboveGradeFinishedArea", "AboveGradeFinishedAreaSource",
  "AboveGradeFinishedAreaUnits", "BelowGradeFinishedArea",
  "BelowGradeFinishedAreaSource", "BelowGradeFinishedAreaUnits",
  "BuildingAreaTotal", "BuildingAreaSource", "BuildingAreaUnits",
  "RoomsTotal",
  "Levels", "Stories", "EntryLevel",
]);

// B13: Building Details (23 fields)
const B13_BUILDING = cotalityFields('Property', [
  "BuildingName", "BuilderName", 
  "YearBuilt", "YearBuiltSource", "YearBuiltDetails",
  "ArchitecturalStyle", "ConstructionMaterials",
  "Roof", "Heating", "Cooling",
  // Search/CRM filters and reporting depend on these live IDX Plus fields.
  "Basement", "CoolingYN", "HeatingYN", "DirectionFaces",
  "ElectricOnPropertyYN", "Sewer", "WaterSource",
  "OtherStructures",
  "BuildingKeyNumeric", "BasementYN", "FoundationArea", "FoundationDetails",
]);

// B14: Building Amenities (20 fields)
const B14_BUILDING_AMENITIES = cotalityFields('Property', [
  "BuildingFeatures",
  "AssociationAmenities", "CommunityFeatures",
  "SecurityFeatures", "AccessibilityFeatures",
  "PoolPrivateYN", "PoolFeatures", "SpaYN", "SpaFeatures",
  "LaundryFeatures",
  "WalkScore",
  "CommonWalls",
]);

// B15: Financial — Unit (14 fields)
const B15_FINANCIAL_UNIT = cotalityFields('Property', [
  "AssociationFee", "AssociationFeeFrequency",
  "AssociationFee2", "AssociationFee2Frequency",
  "AssociationFeeIncludes", "AssociationName", "AssociationYN",
  "CurrentFinancing", "FinancialDataSource",
  // DownPaymentAssistance* are live Property fields (migrated from CustomProperty;
  // verified 2026-06-04). In the Property $select so they are fetched from Property.
  "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  "TaxAnnualAmount", "TaxYear", "TaxBlock", "TaxLot",
  "TaxMapNumber",
]);

// B16: Financial — Building (10 fields)
const B16_FINANCIAL_BUILDING = cotalityFields('Property', [
  "GrossIncome", "GrossScheduledIncome", "NetOperatingIncome",
  "OperatingExpense", "OperatingExpenseIncludes",
  "IncomeIncludes", "NumberOfUnitsTotal",
  "CapRate",
]);

// B17: Expenses (16 fields)
const B17_EXPENSES = cotalityFields('Property', [
  "ElectricExpense", "FuelExpense", "GardenerExpense",
  "InsuranceExpense", "MaintenanceExpense", "ManagerExpense",
  "NewTaxesExpense", "OtherExpense", "PestControlExpense",
  "ProfessionalManagementExpense", "SuppliesExpense",
  "TrashExpense", "VacancyAllowance", "WaterSewerExpense",
  "WorkmansCompensationExpense",
]);

// B18: Concessions (4 fields)
const B18_CONCESSIONS = cotalityFields('Property', [
  "Concessions", "ConcessionsAmount", "ConcessionsComments",
  "SpecialListingConditions",
]);

// B19: Lot & Land (15 fields)
const B19_LOT_LAND = cotalityFields('Property', [
  "LotSizeArea", "LotSizeUnits", "LotSizeSource",
  "LotSizeDimensions", "LotDimensionsSource",
  "LotFeatures", "FrontageLength", 
  "FrontageLengthUnit",
  "FrontageType", "RoadSurfaceType", "RoadFrontageType",
  "Topography", "Vegetation", "WaterfrontFeatures",
  "LandLeaseYN", "LandLeaseAmount", "LandLeaseAmountFrequency", "LandLeaseExpirationDate",
  "ZoningDescription",
]);

// B20: Unit Features (19 fields)
const B20_UNIT_FEATURES = cotalityFields('Property', [
  "InteriorFeatures", "ExteriorFeatures", "Flooring",
  "WindowFeatures", "FireplaceYN", "FireplaceFeatures",
  "FireplacesTotal", "Appliances", "PatioAndPorchFeatures",
  "Fencing", "View", "ViewYN",
  "Exposures",
  "Furnished", "PropertyCondition", "CurrentUse",
]);

// B21: Parking (8 fields)
const B21_PARKING = cotalityFields('Property', [
  "ParkingFeatures", "ParkingTotal", "GarageSpaces",
  "GarageYN", "AttachedGarageYN", "CarportSpaces", "CarportYN",
  "OpenParkingSpaces", "OpenParkingYN",
]);

// B22: Outdoor & Pets (8 fields)
const B22_OUTDOOR_PETS = cotalityFields('Property', [
  "PetsAllowed",
]);

// B23: Showings (8 fields)
const B23_SHOWINGS = cotalityFields('Property', [
  "ShowingContactName", "ShowingContactPhone",
  "ShowingContactPhoneExt", "ShowingContactType",
  "ShowingInstructions", "ShowingRequirements",
  "LockBoxType", "LockBoxLocation",
]);

// B24: New Development (6 fields)
const B24_NEW_DEV = cotalityFields('Property', [
  "NewConstructionYN",
  "DevelopmentStatus", "BuilderName",
  "BuilderModel", "GreenBuildingVerificationType",
]);

// B25: Green / Energy (8 fields)
const B25_GREEN = cotalityFields('Property', [
  "GreenEnergyEfficient", "GreenEnergyGeneration",
  "GreenWaterConservation", "GreenIndoorAirQuality",
  "GreenSustainability", "GreenBuildingVerificationType",
  "PowerProductionType",
]);

// B26: Media — Property-level media metadata (counts, timestamps, tour URLs).
// NOTE: photo/video/floorplan ITEM urls do NOT live on Property — they come from
// the Media resource (MediaURL/OriginalMediaUrl, classified by MediaCategory).
// Exported for the live-parity guard test (media-fields-live-parity.test.ts).
export const B26_MEDIA = cotalityFields('Property', [
  "PhotosCount", "PhotosChangeTimestamp",
  "VideosCount",
  "VirtualTourURLBranded", "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3",
  "DocumentsAvailable", "DocumentsCount", "DocumentsChangeTimestamp",
  "MapURL",
  // Every VirtualTourURL* carrier the contract declares is requested and retained — the runtime card
  // and search selects already serve them; zero rows today is not an unsupported contract.
  "VirtualTourURLBranded2", "VirtualTourURLBranded3",
]);

// B27: Rental-Specific
// Live-Trestle truth (verified 2026-04-19; MoveInCosts* re-verified 2026-06-04):
//   - PossessionDate is a RESO field that Trestle ignores (CLAUDE.md "fields
//     that DO NOT exist on Trestle"). Use AvailabilityDate.
//   - MoveInCostsAmount (Edm.Decimal) + MoveInCostsComments (Edm.String) ARE live
//     Property fields as of 2026-06-04 (the cached snapshot had lagged). Both are
//     selected here alongside the MoveInCosts multi-select picklist.
//   - MoveInCostsAmountTotal still does NOT exist on Trestle — kept out (phantom).
const B27_RENTAL = cotalityFields('Property', [
  "LeaseAmount", "LeaseAmountFrequency",
  "LeaseTerm",
  "AvailabilityDate",
  "AvailableLeaseType", "ExistingLeaseType",
  "Furnished",
  "PetsAllowed", "PetDeposit", 
  "SecurityDeposit",
  "TenantPays",
  // FARE Act fee transparency (NYC LL 119/2024)
  // MoveInCosts (multi-select cost types) + MoveInCostsAmount (Edm.Decimal $) +
  // MoveInCostsComments (Edm.String) are all live Property fields (2026-06-04).
  "MoveInCosts", "MoveInCostsAmount", "MoveInCostsComments",
  "OngoingFees", "TenantPaysDescription",
  // Served by the runtime search select (rental terms); persisted so the DB path shows the same fact (7,915 rows).
  "OwnerPays",
]);

// (The FARE Act fee fields AdditionalFee / AdditionalFeeDescription / AdditionalFeeYN / FeeFrequency live on the
// Cotality CustomProperty resource, not on Property — they are read through the CustomProperty expansion,
// never selected on Property. Removed from this list in the Packet 2 closure.)

// B28: (empty in REBNY — reserved)
// B29: Other / Misc (12 fields)
const B29_OTHER = cotalityFields('Property', [
  "Disclaimer", "CopyrightNotice",
  "OriginatingSystemID", "OriginatingSystemName",
  "OriginatingSystemKey", "SourceSystemName",
  "ListingKeyNumeric",
  "MajorChangeType", "MajorChangeTimestamp",
  "PreviousStandardStatus",
  "CountyOrParish",
  "WaterfrontYN",
]);
/** Every live Cotality Property field Mallan reads, deduplicated (union of the categories above). */
export const COTALITY_PROPERTY_FIELDS: string[] = [...new Set([
  ...B1_ADDRESS, ...B2_CLASSIFICATION, ...B3_LISTING_AGREEMENT,
  ...B4_STATUS_DATES, ...B5_PRICING, ...B6_DISPLAY_FLAGS,
  ...B7_REMARKS, ...B8_LIST_AGENT, ...B9_COLIST_AGENT,
  ...B10_BUYER_AGENT, ...B11_COBUYER_AGENT, ...B12_UNIT_ROOMS,
  ...B13_BUILDING, ...B14_BUILDING_AMENITIES, ...B15_FINANCIAL_UNIT,
  ...B16_FINANCIAL_BUILDING, ...B17_EXPENSES, ...B18_CONCESSIONS,
  ...B19_LOT_LAND, ...B20_UNIT_FEATURES, ...B21_PARKING,
  ...B22_OUTDOOR_PETS, ...B23_SHOWINGS, ...B24_NEW_DEV,
  ...B25_GREEN, ...B26_MEDIA, ...B27_RENTAL, ...B29_OTHER,
])];

// Live Cotality Property fields Mallan deliberately does NOT request on the IDX Plus $select
// (present on the live resource; not part of the feed licence Mallan reads, or never needed).
// Verified live 2026-09-05. Keep this the ONLY reason a live field is absent from the select.
const LIVE_FIELDS_NOT_SELECTED = new Set<string>([
  "ListTeamMlsId",
  "BuyerTeamMlsId",
]);

/**
 * The IDX Plus feed $select list = every live Cotality Property field Mallan reads,
 * minus the live fields deliberately not requested. Verified live by the sync itself
 * (a non-live name is an HTTP 400) and by the census guard.
 */
export const IDX_PLUS_SELECT_FIELDS: string[] = COTALITY_PROPERTY_FIELDS.filter(
  (f) => !LIVE_FIELDS_NOT_SELECTED.has(f)
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

// CTL fields — agent-controlled distribution gates on the live Cotality Property resource:
// the Internet-* gates plus the Permission enum and SyndicateTo. Legacy Mallan FORM keys that
// once carried these decisions are classified by lib/compliance/legacy-form-keys.ts — they are
// Mallan form vocabulary, not provider fields, and never belong in this map.
const CONTROL_FIELDS = new Set([
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  "InternetAutomatedValuationDisplayYN", "InternetConsumerCommentYN",
  "Permission", "SyndicateTo",
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
  if (CONTROL_FIELDS.has(fieldName) || LEGACY_MALLAN_FORM_CONTROL_KEYS.has(fieldName)) return "CTL";
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
  keys: readonly string[]
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
 * Identity pass-through kept as the single entry point for raw records. The pre-Packet-2 alias
 * table (SourceSystemKey→ListingKey, MlsStatus→StandardStatus, …) copied one live field into
 * another or read names that do not exist on the live resource; the mapper reads every live
 * field by its own name, so no alias is applied.
 */
function normalizeRenames(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw };
}

/**
 * Determine listing_type from PropertyType.
 */
/**
 * Mallan's inventory-type classification of the live PropertyType enum (13 members, verified
 * 2026-09-05): the two *Lease members are rentals, every other member is a sale. The ONE place
 * this classification lives — the Search engine and the public DTO import it.
 */
export function inferListingType(raw: Record<string, unknown>): "sale" | "rent" {
  const pt = String(raw.PropertyType || "").toLowerCase();
  if (pt.includes("lease") || pt.includes("rental")) return "rent";
  return "sale";
}

/**
 * Mallan storage statuses that mean "no longer publicly displayable" (lib/listings/mallan-status.ts).
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
export const TERMINAL_STATUSES: ReadonlySet<string> = MALLAN_TERMINAL_STATUSES;

/**
 * Mallan storage statuses that are publicly displayable (lib/listings/mallan-status.ts).
 *
 * Mirrors `DISPLAYABLE_STATUSES` in `lib/idx/db-to-public-dto.ts:155`. Kept
 * here so callers of `normalizeStandardStatus` can fold input strings like
 * `"active"` / `"ACTIVE"` / `"Active "` back to the canonical `"Active"`.
 */
const ACTIVE_STATUSES: ReadonlySet<string> = MALLAN_ACTIVE_STATUSES;

/**
 * CRM lifecycle statuses that exist outside the public IDX displayable set
 * but are still legitimate inputs from CRM forms (Mallan exclusives). Folding
 * non-canonical variants like `"draft"` / `"pending"` back to canonical keeps
 * CRM rows queryable by exact-case predicates and prevents the stealth-audit-
 * anomaly class (row stored with non-canonical status, invisible to every
 * exact-case counter).
 */
const CRM_LIFECYCLE_STATUSES: ReadonlySet<string> = MALLAN_LIFECYCLE_STATUSES;

/**
 * Alias map for known spellings of terminal statuses that the Mallan storage normalizer rewrites to
 * Mallan's storage spelling. Limited to equivalent spellings — never coerces an arbitrary unknown
 * string into a terminal value. Example:
 *   - "canceled" (the live Cotality single-L member) → "Cancelled" (Mallan storage spelling)
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
 * Normalize an untrusted status string (POST body, CRM form, a persisted column) to the MALLAN
 * storage spelling so the terminal-status guard and every downstream exact-case predicate
 * (data-retention cron, ops:health, `DISPLAYABLE_STATUSES`) all see the same value. This is the
 * Mallan storage vocabulary, not the provider's: raw Cotality StandardStatus values are parsed
 * against the exact live enum in mapTrestleToPrisma first.
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
  // An absent / empty status is UNKNOWN and stays empty. It is never "Active": every reader
  // treats '' as not-displayable / draft-like (fail-closed), which is the honest outcome.
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Fast path — exact-case canonical.
  if (
    TERMINAL_STATUSES.has(trimmed) ||
    ACTIVE_STATUSES.has(trimmed) ||
    CRM_LIFECYCLE_STATUSES.has(trimmed)
  ) {
    return trimmed;
  }

  // Lowercase alias hit (e.g., the live "canceled" → Mallan storage "Cancelled").
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

  // Unknown — preserve trimmed form. Never silently coerce an unknown value to a known status;
  // new Mallan storage statuses are declared in lib/listings/mallan-status.ts first.
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
  /** Mallan storage status (lib/listings/mallan-status.ts). Normalized internally via
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
  /** The participant-only decision. Provider rows: Cotality Permission contains the 'Private'
   *  token (derivePermissionGates). Mallan-authored rows: _mallanPermission === 'Private'
   *  (lib/compliance/normalizer.ts). Both sides agree. Pass `true` to block. */
  participantOnly?: unknown;
  /** The Mallan owner-opt-out decision (_mallanPermission = 'OwnerOptOut' → owner_opt_out). Pass `true` to block. */
  ownerOptOut?: unknown;
  /**
   * The provider fact (derivePermissionGates().idxPermitted). `false` blocks. `null` / undefined = no provider
   * fact on the record — no effect.
   */
  providerIdxPermitted?: boolean | null;
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
  /** The provider Permission value as read (tokens re-joined with commas), `''` when absent. */
  permissions: string;
  /** The Multi-Enum tokens (an array or a comma list on the wire; exact live members only). */
  permissionTokens: string[];
  /**
   * The DISPLAY interpretation of the provider fact (one of two — see `participantOnly`):
   * `true` when every token is the IDX
   * permission the authorized IDX Plus feed serves (`'IDX'` on 591,536 / 591,536 live rows, 2026-09-06);
   * `false` when any other token is present (fail-closed — no other member's meaning is asserted);
   * `null` when the record carries no Permission at all (no provider fact: the authorized feed serves it on
   * every row — 0 null / 591,536 — so an absent value is a record shape, never a permission, and has no effect).
   */
  idxPermitted: boolean | null;
  /**
   * REBNY participants-only. Owner ruling 2026-09-07: `Property.Permission = 'Private'` has a
   * DEFINED Mallan compliance interpretation — REBNY members/participants only — and it sets the
   * canonical `participant_only` decision consumed by the distribution/display gates.
   *
   * `Permission` is a Multi-Enum (`ListingPermission`, `NumOccurrences = 20`), so this is TOKEN
   * MEMBERSHIP, never string equality: `'IDX,Private'` is participant-only just as `'Private'` is.
   *
   * This is NOT owner-opt-out and must never be conflated with it. `OwnerOptOut` is not a
   * published `ListingPermission` member (18 live members, verified 2026-09-07), so owner opt-out
   * remains a Mallan-side decision only (`_mallanPermission`, `listings.owner_opt_out`).
   */
  participantOnly: boolean;
}

/**
 * Read the provider Permission fact from a raw Cotality Property record and apply the TWO
 * verified interpretations. THE single owner of `Permission` interpretation — no other module
 * may form a second opinion about what a Permission token means.
 *
 *   1. `idxPermitted` — display permission. True only when every token is the served 'IDX'
 *      permission; any other token fails closed; an absent fact is null and has no effect.
 *
 *   2. `participantOnly` — OWNER RULING 2026-09-07. Cotality `Property.Permission` containing
 *      the `Private` token carries the Mallan/REBNY compliance meaning "REBNY members /
 *      participants only", so `participant_only = true`. This is TOKEN MEMBERSHIP on a
 *      Multi-Enum, not string equality. It matches the Mallan-side interpreter, which has always
 *      read 'Private' the same way (lib/compliance/normalizer.ts derivePermissionBooleans).
 *
 * `owner_opt_out` is NOT derived here and is NOT implied by `Private`. The two are separate
 * decisions. No provider fact can express owner opt-out: 'OwnerOptOut' is not one of the 18
 * published ListingPermission members and MlsStatus carries no such sentinel (verified live
 * 2026-09-07). It remains a Mallan-side decision (`_mallanPermission`, `listings.owner_opt_out`).
 *
 * NO OTHER Permission member has a proven Mallan meaning. Do not infer one. Any additional
 * member semantics must be separately proven against the authorized Cotality contract before
 * being read here.
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
 * MlsStatus is NOT consulted: the live contract has no 'OwnerOptOut' member on
 * MlsStatus (nor on Permission), so the retired sentinel arm is gone.
 *
 * @param raw Cotality Property record — reads `Permission` only. Any other key is ignored.
 */
export function derivePermissionGates(raw: Record<string, unknown>): PermissionGates {
  // Property.Permission is a live Multi-Enum (ListingPermission; 18 published members verified
  // 2026-09-07 against the live Lookup, NumOccurrences = 20). The authorized IDX Plus feed serves
  // 'IDX' on every live row.
  //
  // TWO interpretations, and only two:
  //
  //   1. idxPermitted — display is permitted only when every token is the served 'IDX' permission.
  //      Anything else fails closed; no other member's display meaning is asserted.
  //
  //   2. participantOnly — OWNER RULING 2026-09-07: the 'Private' member has a DEFINED Mallan
  //      compliance interpretation, REBNY members/participants only, and it sets the canonical
  //      participant_only decision used by the distribution/display gates. This matches the
  //      Mallan-side interpreter, which has always read 'Private' the same way
  //      (lib/compliance/normalizer.ts derivePermissionBooleans: participant_only === 'Private').
  //      Because Permission is multi-valued this is TOKEN MEMBERSHIP, not equality.
  //
  // owner_opt_out is deliberately NOT derived here and must never be conflated with participant_only:
  // 'OwnerOptOut' is not a published ListingPermission member and MlsStatus carries no such sentinel
  // (both verified live), so owner opt-out stays a Mallan-side decision only.
  const permissionTokens = enumValueTokens('Permission', raw.Permission);
  const idxPermitted = permissionTokens.length === 0 ? null : permissionTokens.every((t) => t === 'IDX');
  const participantOnly = permissionTokens.includes('Private');
  return { permissions: permissionTokens.join(','), permissionTokens, idxPermitted, participantOnly };
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
  // An UNKNOWN status ('' after normalization) is never displayable — fail-closed. The
  // pre-Packet-2 helper normalized an absent status to "Active" and therefore displayed it.
  const status_known = normalized_status !== '';
  const provider_permitted = input.providerIdxPermitted !== false;
  const idx_display_yn =
    status_known &&
    rls_eligible &&
    !is_terminal &&
    internet_entire_listing_display_yn &&
    provider_permitted &&
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
/**
 * CustomProperty.CustomFields — the NYC/REBNY facts the feed carries on the CustomProperty resource (61 keys on
 * every row, census 2026-09-08: BuildingTaxLot, CertificateOfOccupancyYN, GuarantorsAcceptedYN, FlipTaxRemarks,
 * MaximumFinancingRemarks, TaxAbatementComments, BuildingRules …). On the wire it is a JSON STRING inside the
 * expanded CustomProperty payload (`$expand=CustomProperty($select=CustomFields)` — accepted live on all
 * 591,641 rows). Parsed losslessly for the `custom_fields` column; null when the row was not expanded or the
 * string is not JSON (fail-closed — never a fabricated fact).
 */
export function customFieldsFromProviderRow(raw: Record<string, unknown>): Record<string, unknown> | null {
  const cp = raw.CustomProperty;
  const first = Array.isArray(cp) ? cp[0] : cp;
  if (!first || typeof first !== 'object') return null;
  const cf = (first as Record<string, unknown>).CustomFields;
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) return cf as Record<string, unknown>;
  if (typeof cf === 'string' && cf.trim()) {
    try {
      const parsed: unknown = JSON.parse(cf);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

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
  /** CustomProperty.CustomFields (61 NYC/REBNY keys) when the row carried the CustomProperty expansion; absent otherwise. */
  custom_fields?: Prisma.InputJsonValue;
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
  // StandardStatus is the provider's status fact and must be an EXACT live enum member (the dated
  // live pull); anything else — absent, empty, unknown spelling — is unrepresentable (listings.status
  // is NOT NULL and nothing is guessed). MlsStatus is a different vocabulary (null on every sampled
  // live row) and is never substituted. The live member is then stored in Mallan's storage
  // vocabulary (lib/listings/mallan-status.ts: exact, except the established spelling 'Cancelled').
  if (!isCotalityStandardStatus(raw.StandardStatus)) {
    throw new UnrepresentableProviderRecordError("StandardStatus", listingId);
  }
  const status = mallanStatusFromCotality(raw.StandardStatus)!;
  if (raw.PropertyType == null || String(raw.PropertyType).trim() === "") {
    throw new UnrepresentableProviderRecordError("PropertyType", listingId);
  }
  const listingType = inferListingType(raw);

  // Explicit columns. ListPrice absent → unrepresentable (listings.list_price is NOT NULL and 0 is a
  // real price, never a stand-in for unknown).
  if (raw.ListPrice == null || raw.ListPrice === "") {
    throw new UnrepresentableProviderRecordError("ListPrice", listingId);
  }
  const listPrice = String(raw.ListPrice); // String for Prisma Decimal precision
  const bedroomsTotal = raw.BedroomsTotal != null ? Number(raw.BedroomsTotal) : null;
  const bathroomsFull = raw.BathroomsFull != null ? Number(raw.BathroomsFull) : null;
  const bathroomsHalf = raw.BathroomsHalf != null ? Number(raw.BathroomsHalf) : null;
  const livingArea = raw.LivingArea != null ? String(raw.LivingArea) : null; // String for Prisma Decimal precision

  // Canonical location (lib/listings/canonical-location.ts). Live, every row, 2026-09-08:
  // CityRegion = exactly the five boroughs (→ borough; the county is a separate fact and disagrees
  // on 35 rows, so it is never a borough source); SubdivisionName = the neighborhood, with NO
  // CityRegion fallback (that wrote a borough into the neighborhood column).
  const borough = boroughFromCityRegion(raw.CityRegion);
  const neighborhood = neighborhoodFromSubdivisionName(raw.SubdivisionName);

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
  // participant_only IS derived from the provider fact. Owner ruling 2026-09-07:
  // Property.Permission = 'Private' means REBNY members/participants only and sets the canonical
  // participant_only decision. Previously this line hardcoded `false`, which contradicted the
  // Mallan-side interpreter (lib/compliance/normalizer.ts derivePermissionBooleans) that has
  // always read 'Private' as participant_only. Both sides now agree, through the ONE canonical
  // Permission interpreter (derivePermissionGates).
  //
  // owner_opt_out remains hardcoded false for provider rows and must NOT be conflated with
  // participant_only: 'OwnerOptOut' is not a published ListingPermission member (18 live members)
  // and MlsStatus carries no such sentinel, so no provider fact can express it. Owner opt-out is a
  // Mallan decision only, written from the CRM forms via `_mallanPermission`.
  const providerPermission = derivePermissionGates(raw);
  const participantOnly = providerPermission.participantOnly;
  const ownerOptOut = false;
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
    providerIdxPermitted: providerPermission.idxPermitted,
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

  // Timestamps. ModificationTimestamp absent or unparseable → unrepresentable (the column is
  // NOT NULL and the local clock is not a provider fact).
  const modTimestamp = raw.ModificationTimestamp ? new Date(String(raw.ModificationTimestamp)) : null;
  if (!modTimestamp || Number.isNaN(modTimestamp.getTime())) {
    throw new UnrepresentableProviderRecordError("ModificationTimestamp", listingId);
  }
  const contractDate = raw.ListingContractDate
    ? new Date(String(raw.ListingContractDate))
    : null;

  // Phase A: typed agent columns mirror the agent_info JSON (shared producer seam).
  const typedAgentCols = typedAgentColumnsFromJson(agentInfo as Record<string, unknown>);
  // Present only when the row carried the CustomProperty expansion — an unexpanded sync never writes the column.
  const customFields = customFieldsFromProviderRow(raw);

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
    ...(customFields ? { custom_fields: customFields as Prisma.InputJsonValue } : {}),
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

/**
 * Live Cotality Property fields a record must carry before Mallan stores it. Verified live
 * 2026-09-05: on 591,546 Property rows, ListPrice / StandardStatus / ModificationTimestamp /
 * PropertyType / ListingId are null on 0. REBNY's "mandatory for listing input" fields are a
 * submission-form rule, not a feed fact, and are NOT enforced here.
 */
export const REQUIRED_COTALITY_FIELDS = [
  "ListingId", "PropertyType", "ListPrice", "StandardStatus",
  "StreetName", "City", "StateOrProvince", "PostalCode",
  "ListAgentMlsId", "ListOfficeName",
  "ModificationTimestamp",
  // Everything else is nullable live and is stored as unknown (null), never defaulted.
];

/**
 * Validate that a raw Cotality record carries every REQUIRED_COTALITY_FIELDS entry.
 */
export function validateRequiredFields(raw: Record<string, unknown>): {
  valid: boolean;
  missingFields: string[];
} {
  const normalized = normalizeRenames(raw);
  const missing = REQUIRED_COTALITY_FIELDS.filter(
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
