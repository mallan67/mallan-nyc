/**
 * CARD_SELECT_FIELDS — the subset of Trestle Property fields needed for listing cards.
 *
 * Shared between:
 *   - app/api/listings/route.ts (client-side filtered queries)
 *   - lib/idx/get-listings-server.ts (ISR server-side queries)
 *
 * Rules:
 *   1. Every field MUST exist on Trestle's Property entity (validated 2026-03-06).
 *   2. Fields NOT on Trestle (ComingSoonDate, IDXParticipationYN, ParticipantOnlyYN,
 *      IDXEntireListingDisplayYN) are excluded — Trestle rejects unknown $select fields.
 *   3. Distribution gates that rely on excluded fields handle undefined safely
 *      (Trestle IDX feed pre-filters non-displayable listings).
 */
export const CARD_SELECT_FIELDS = [
  // Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish",
  "Latitude", "Longitude",
  // Classification + keys (ListingKey/Numeric needed for Media resource queries)
  "ListingId", "ListingKey", "ListingKeyNumeric", "SourceSystemKey",
  "PropertyType", "PropertySubType",
  "CommonInterest", "OwnershipType",
  // Status & Dates
  "StandardStatus", "MlsStatus", "ModificationTimestamp",
  "ListingContractDate", "OnMarketDate",
  "DaysOnMarket", "CumulativeDaysOnMarket",
  "OriginalListPrice", "PreviousListPrice",
  "AvailabilityDate",
  // Pricing
  "ListPrice", "ClosePrice", "LeaseAmount", "LeaseAmountFrequency",
  // Close date — needed by distribution gate 5 (closed >24h check) for defense-in-depth
  "CloseDate",
  // Rooms & Size
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger",
  "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
  // Building
  "BuildingName",
  // Financial
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",
  // Agent/Office
  "ListAgentFullName", "ListOfficeName",
  // Media — PhotosChangeTimestamp is high-level trigger for media changes (Trestle guidance 2026-04-07)
  "PhotosCount", "PhotosChangeTimestamp",
  // All SIX verified live tour/video slots. Live $metadata (2026-08-12) confirms
  // Branded/Unbranded each carry slots 1-3, and live counts confirm Unbranded2
  // (2,377) and Unbranded3 (354) are populated upstream. Selecting only slot 1
  // is how those values were being lost on the live Trestle-direct path, exactly
  // as RAW_DATA_KEEP_FIELDS was losing them on the DB path. Branded2/3 are empty
  // today but are selected anyway — zero values cost nothing and this must not
  // regress when Cotality begins populating them.
  "VirtualTourURLBranded", "VirtualTourURLBranded2", "VirtualTourURLBranded3",
  "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3",
  // Remarks
  "PublicRemarks",
  // Display gates
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  // Rental
  "PetsAllowed", "Furnished",
  "MoveInCosts", "OngoingFees", "TenantPays", "TenantPaysDescription",
];
