/**
 * Search page types — shared between page, filter panel, and API.
 *
 * 4 tabs: buy-residential, buy-commercial, rent-residential, rent-commercial
 * 5 view modes: split, all-listings, all-map, grid, list
 */

export type SearchTab = 'buy-residential' | 'buy-commercial' | 'rent-residential' | 'rent-commercial';

export type ViewMode = 'split' | 'all-listings' | 'all-map' | 'grid' | 'list';

/** All filter fields for search */
export interface SearchFilters {
  // Price
  minPrice?: number;
  maxPrice?: number;
  // Beds/Baths (min/max ranges)
  beds?: number | null;
  maxBeds?: number | null;
  baths?: number | null;
  maxBaths?: number | null;
  // Size
  minSqft?: number;
  maxSqft?: number;
  // Property classification
  propertyType?: string;
  propertySubTypes?: string[];
  ownershipTypes?: string[];
  // Status
  statuses?: string[];
  // Year Built
  yearBuilt?: 'any' | 'pre-war' | 'post-war';
  // Rental-specific
  furnished?: boolean;
  // Amenities (multi-value field filters — all available on IDX Plus)
  amenities?: AmenityFilter[];
  // Open House
  openHouse?: boolean;
  openHouseDate?: string; // ISO date string (YYYY-MM-DD)
  // Keywords (free-text terms for PublicRemarks search — e.g., "high floor", "south facing")
  keywords?: string[];
  // Transit (subway line/service proximity)
  transit?: { line: string; label: string };
  // Sort
  sort?: string;
  // Location
  neighborhood?: string;
  neighborhoods?: string[];
  borough?: string;
  zip?: string;
  q?: string;
}

/**
 * Amenity filters mapped to Trestle multi-value picklist fields.
 *
 * These do NOT use YN boolean fields (ElevatorYN, GymYN, DoormanYN don't exist on Trestle).
 * Instead they filter on BuildingFeatures, Appliances, Cooling, View, ExteriorFeatures,
 * ParkingFeatures, LaundryFeatures, PetsAllowed — all confirmed available on IDX Plus feed.
 *
 * Verified against REBNY RLS property-lookup.csv + live Trestle data 2026-03-07.
 * Where RLS and Trestle values differ, both are included for defensive matching.
 */
export type AmenityFilter =
  // Lobby & Services
  | 'doorman'
  // Building Amenities
  | 'gym'
  | 'pool'
  | 'spa'
  | 'sauna'
  | 'steam-room'
  | 'roof-deck'
  | 'playroom'
  | 'laundry-room'
  | 'elevator'
  | 'lounge'
  | 'bike-storage'
  | 'storage'
  // Unit Features
  | 'central-air'
  | 'dishwasher'
  | 'washer-dryer'
  | 'outdoor-space'
  // Parking
  | 'garage'
  // Pets
  | 'pet-friendly'
  // Views
  | 'park-views'
  | 'river-views'
  | 'skyline-views'
  | 'views'
  // Additional unit features
  | 'walk-in-closet'
  | 'high-ceilings'
  | 'fireplace'
  | 'natural-light'
  | 'renovated'
  | 'quiet'
  | 'no-fee';

/**
 * Maps each amenity filter to the Trestle field + values it searches.
 * Used by both API route (server-side) and filter panel (display).
 *
 * BuildingFeatures values (live 2026-03-07): BikeStorage, BilliardRoom, ColdStorage,
 * CommonLounge, CommonPlayroom, Concierge, Elevators, FitnessCenter, GameRoom,
 * GolfSimulatorRoom, GreenBuilding, HealthClub, IndoorPool, KitchenFacilities,
 * PackageRoom, Sauna, ScreeningRoom, SpaHotTub, SteamRoom, Storage, YogaStudio
 */
/**
 * How an amenity is matched against the provider payload.
 *
 * `contains`    — the field holds a comma-joined token list (`"Elevators,Storage"`),
 *                 so membership is a substring test against fixed PascalCase
 *                 provider tokens. Case is NOT user input, so a case-sensitive
 *                 test is correct here.
 * `isTrue`      — the field is a JSON boolean (`FireplaceYN`), not a token list.
 *                 A substring test against a boolean matches nothing, which is
 *                 exactly how `fireplace` silently returned 0 rows.
 */
export type AmenityMatch = 'contains' | 'isTrue';

/**
 * EVERY provider token in AMENITY_FIELD_MAP was audited against the LIVE enum
 * members AND an EXHAUSTIVE live token census of the whole Active corpus
 * (8,102/8,102 rows, coverage complete, 2026-08-19). Membership alone is not
 * enough — a token can be a valid enum member and appear on zero listings.
 *
 * Removed as NOT LIVE-PRESENT (each was silently matching nothing):
 *   RoofDeck          -> BuildingRoofDeck (2,663)
 *   OnCommonFloor     -> CommonOnFloor (1,228)
 *   UnitYes           -> Yes (3,007)
 *   Park              -> ParkGreenbelt (674)
 *   WalkInCloset      -> WalkInClosets (921)
 *   HighCeiling       -> HighCeilings (1,841)
 *   WasherDryer       -> Washer (1,170) / Dryer (1,162) / WasherDryerAllowed (1,362)
 *   Skyline, Downtown -> valid ENUM members but ZERO live rows; skyline uses
 *                        City (3,651) / CityLights (629) / Panoramic (529)
 *   Renovated, GutRenovated, NewlyRenovated -> not members at all; the live
 *                        member is `Remodeled`, which is ZERO in the feed
 *   NaturalLight, Quiet, NoFee, OwnerPays  -> not members at all
 */

/**
 * PROVIDER-SUPPORTED BUT CURRENTLY UNPOPULATED.
 *
 * The provider HAS a field for this concept and the sync already selects it —
 * there is simply no data in the current feed. This is a POPULATION gap, and it
 * closes on its own the moment the feed carries values. Distinguishing it from
 * "no such field exists" matters: one is a one-line change when data appears,
 * the other requires a provider capability that does not exist.
 *
 *   renovated  TWO live fields could express it, and BOTH are empty in the
 *              current NYC feed — proven exhaustively, not sampled:
 *
 *              1. `InteriorFeatures.Remodeled` IS a live enum member. The
 *                 exhaustive live token census (8,102/8,102 Active rows) found
 *                 45 distinct InteriorFeatures tokens live-present and
 *                 `Remodeled` is NOT among them — zero rows.
 *              2. `PropertyCondition` carries `UpdatedRemodeled`,
 *                 `UnderRenovation`, `Turnkey`, `NewConstruction`, and
 *                 trestle-mapper already selects it. An exhaustive read of
 *                 every Active row (8,110/8,110, coverage complete) found it
 *                 populated on 0 with ZERO distinct tokens. It is also a MULTI
 *                 enum, so `$filter eq` is rejected with HTTP 400 per member
 *                 and any filtering would be Mallan-side.
 *
 *              The map points at `InteriorFeatures.Remodeled` as the correct
 *              live member, so this becomes available the moment the feed
 *              carries it. The earlier values `Renovated` / `GutRenovated` /
 *              `NewlyRenovated` were not enum members at all.
 */
export const UNPOPULATED_AMENITIES: ReadonlySet<string> = new Set(['renovated']);

/**
 * NO LIVE COTALITY FIELD CARRIES THIS CONCEPT AT ALL.
 *
 *   no-fee         `ListingTerms` exists with 67 live members but has NEITHER
 *                  `NoFee` NOR `OwnerPays`; `Concessions` is present as a key
 *                  and NULL on every displayable listing.
 *   natural-light  absent from the live 45-token `InteriorFeatures` vocabulary.
 *   quiet          likewise absent.
 */
export const UNMAPPED_AMENITIES: ReadonlySet<string> = new Set([
  'no-fee',
  'natural-light',
  'quiet',
]);

/**
 * Amenities that cannot be answered TODAY, for either reason above.
 *
 * These must FAIL LOUD rather than silently return an unfiltered corpus — a
 * user who checks "Renovated" and receives all 8,110 listings has been given a
 * wrong answer, which is worse than being told the filter is unavailable.
 */
export const UNSUPPORTED_AMENITIES: ReadonlySet<string> = new Set([
  ...UNPOPULATED_AMENITIES,
  ...UNMAPPED_AMENITIES,
]);

export const AMENITY_FIELD_MAP: Record<AmenityFilter, { field: string; values: string[]; label: string; group: string; match?: AmenityMatch }> = {
  // Lobby & Services
  'doorman':       { field: 'BuildingFeatures', values: ['Concierge'], label: 'Doorman', group: 'Lobby & Services' },
  // Building Amenities
  'gym':           { field: 'BuildingFeatures', values: ['FitnessCenter', 'HealthClub', 'YogaStudio'], label: 'Gym/Fitness', group: 'Building Amenities' },
  'pool':          { field: 'BuildingFeatures', values: ['IndoorPool'], label: 'Pool', group: 'Building Amenities' },
  'spa':           { field: 'BuildingFeatures', values: ['SpaHotTub'], label: 'Spa', group: 'Building Amenities' },
  'sauna':         { field: 'BuildingFeatures', values: ['Sauna'], label: 'Sauna', group: 'Building Amenities' },
  'steam-room':    { field: 'BuildingFeatures', values: ['SteamRoom'], label: 'Steam Room', group: 'Building Amenities' },
  'roof-deck':     { field: 'ExteriorFeatures', values: ['BuildingRoofDeck'], label: 'Roof Deck', group: 'Building Amenities' },
  'playroom':      { field: 'BuildingFeatures', values: ['CommonPlayroom'], label: "Children's Playroom", group: 'Building Amenities' },
  'laundry-room':  { field: 'LaundryFeatures', values: ['LaundryRoom', 'CommonOnFloor', 'CommonArea'], label: 'Laundry Room', group: 'Building Amenities' },
  'elevator':      { field: 'BuildingFeatures,InteriorFeatures', values: ['Elevators', 'Elevator'], label: 'Elevator', group: 'Building Amenities' },
  'lounge':        { field: 'BuildingFeatures', values: ['CommonLounge'], label: "Residents' Lounge", group: 'Building Amenities' },
  'bike-storage':  { field: 'BuildingFeatures', values: ['BikeStorage'], label: 'Bike Storage', group: 'Building Amenities' },
  'storage':       { field: 'BuildingFeatures', values: ['Storage', 'ColdStorage'], label: 'Storage', group: 'Building Amenities' },
  // Unit Features
  'central-air':   { field: 'Cooling', values: ['CentralAir'], label: 'Central Air', group: 'Unit Features' },
  'dishwasher':    { field: 'Appliances', values: ['Dishwasher'], label: 'Dishwasher', group: 'Unit Features' },
  // `LaundryFeatures.InUnit` (4,119 live rows) is the primary in-unit laundry
  // signal and was previously unqueried — Appliances alone found only 2,554.
  'washer-dryer':  { field: 'Appliances,LaundryFeatures', values: ['Washer', 'Dryer', 'WasherDryerAllowed', 'WasherDryerStacked', 'InUnit'], label: 'Washer/Dryer', group: 'Unit Features' },
  'outdoor-space': { field: 'ExteriorFeatures', values: ['Balcony', 'BuildingBalcony', 'PrivateOutdoorSpaceOver60Sqft', 'PrivateOutdoorSpaceUnder60Sqft', 'PrivateYard', 'Garden'], label: 'Outdoor Space', group: 'Unit Features' },
  // Parking
  // `GarageYN` is a live filterable BOOLEAN, true on 2,630 live Active listings,
  // whereas `ParkingFeatures` carries a Garage token on only 597 — the field is
  // sparsely populated (819 rows total). Matching the boolean finds 4x more.
  'garage':        { field: 'GarageYN', values: [], match: 'isTrue', label: 'Garage/Parking', group: 'Parking' },
  // Pets
  'pet-friendly':  { field: 'PetsAllowed', values: ['Yes', 'CatsOk', 'DogsOk'], label: 'Pet Friendly', group: 'Pets' },
  // Views
  'park-views':    { field: 'View', values: ['ParkGreenbelt'], label: 'Park Views', group: 'Views' },
  'river-views':   { field: 'View', values: ['River', 'Water'], label: 'River Views', group: 'Views' },
  'skyline-views': { field: 'View', values: ['City', 'CityLights', 'Panoramic'], label: 'Skyline Views', group: 'Views' },
  'views':         { field: 'View', values: ['ParkGreenbelt', 'River', 'Water', 'City', 'CityLights', 'Panoramic', 'Bridges'], label: 'Views', group: 'Views' },
  // Additional unit features
  'walk-in-closet': { field: 'InteriorFeatures', values: ['WalkInClosets'], label: 'Walk-in Closet', group: 'Unit Features' },
  'high-ceilings': { field: 'InteriorFeatures', values: ['HighCeilings'], label: 'High Ceilings', group: 'Unit Features' },
  // `FireplaceYN` is a JSON BOOLEAN (861 true / 5,574 false live), not a token
  // list. The previous `InteriorFeatures` mapping matched 0 rows corpus-wide
  // because no fireplace token exists in that field's live vocabulary at all.
  'fireplace':     { field: 'FireplaceYN', values: [], match: 'isTrue', label: 'Fireplace', group: 'Unit Features' },
  'natural-light': { field: 'InteriorFeatures', values: [], label: 'Natural Light', group: 'Unit Features' },
  'renovated':     { field: 'InteriorFeatures', values: ['Remodeled'], label: 'Renovated', group: 'Unit Features' },
  'quiet':         { field: 'InteriorFeatures', values: [], label: 'Quiet', group: 'Unit Features' },
  'no-fee':        { field: 'ListingTerms', values: [], label: 'No Fee', group: 'Rental' },
};

/** Tab configuration — maps UI tab to API params and available filter sections */
export const TAB_CONFIG: Record<SearchTab, {
  apiType: 'sale' | 'rent';
  commercial: boolean;
  label: string;
  showBedsBaths: boolean;
  showOwnership: boolean;
  showFurnished: boolean;
}> = {
  'buy-residential': {
    apiType: 'sale',
    commercial: false,
    label: 'Buy',
    showBedsBaths: true,
    showOwnership: true,
    showFurnished: false,
  },
  'buy-commercial': {
    apiType: 'sale',
    commercial: true,
    label: 'Buy Commercial',
    showBedsBaths: false,
    showOwnership: false,
    showFurnished: false,
  },
  'rent-residential': {
    apiType: 'rent',
    commercial: false,
    label: 'Rent',
    showBedsBaths: true,
    showOwnership: true,
    showFurnished: true,
  },
  'rent-commercial': {
    apiType: 'rent',
    commercial: true,
    label: 'Rent Commercial',
    showBedsBaths: false,
    showOwnership: false,
    showFurnished: false,
  },
};

/** Residential property type checkboxes (includes ownership types for NYC) */
export const RESIDENTIAL_PROPERTY_TYPES = [
  'Condo', 'Co-op', 'Condop',
  'Loft', 'Duplex', 'Triplex',
  'Townhouse', 'Multi-Family', 'Single Family', 'Land', 'Mixed Use',
  'New Development',
];

/** Ownership type checkboxes (NYC-specific) — kept for backward compat but merged into property types UI */
export const OWNERSHIP_TYPES = ['Condo', 'Condop', 'Co-op'];

/** Commercial sub-type checkboxes */
export const COMMERCIAL_SUB_TYPES = [
  'Office', 'Retail', 'Industrial', 'Warehouse', 'Mixed Use',
  'Hospitality', 'Healthcare', 'Parking',
];
