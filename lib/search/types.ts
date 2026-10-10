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
export interface AmenityFieldConfig {
  field: string;
  values: string[];
  label: string;
  group: string;
  /**
   * Set while the filter has no live Cotality field behind it: the filter panel shows the box disabled with this reason, no search applies the filter (isSearchableAmenity is false), and
   * a typed phrase for it is read but filters nothing (lib/search/nyc-dictionary.ts). Remove it when `field` and `values` name live members.
   */
  unavailable?: string;
}

export const AMENITY_FIELD_MAP: Record<AmenityFilter, AmenityFieldConfig> = {
  // Lobby & Services
  'doorman':       { field: 'BuildingFeatures', values: ['Concierge'], label: 'Doorman', group: 'Lobby & Services' },
  // Building Amenities
  'gym':           { field: 'BuildingFeatures', values: ['FitnessCenter', 'HealthClub', 'YogaStudio'], label: 'Gym/Fitness', group: 'Building Amenities' },
  'pool':          { field: 'BuildingFeatures', values: ['IndoorPool'], label: 'Pool', group: 'Building Amenities' },
  'spa':           { field: 'BuildingFeatures', values: ['SpaHotTub'], label: 'Spa', group: 'Building Amenities' },
  'sauna':         { field: 'BuildingFeatures', values: ['Sauna'], label: 'Sauna', group: 'Building Amenities' },
  'steam-room':    { field: 'BuildingFeatures', values: ['SteamRoom'], label: 'Steam Room', group: 'Building Amenities' },
  'roof-deck':     { field: 'ExteriorFeatures', values: ['RoofDeck', 'BuildingRoofDeck'], label: 'Roof Deck', group: 'Building Amenities' },
  'playroom':      { field: 'BuildingFeatures', values: ['CommonPlayroom'], label: "Children's Playroom", group: 'Building Amenities' },
  'laundry-room':  { field: 'LaundryFeatures', values: ['LaundryRoom', 'OnCommonFloor', 'CommonOnFloor', 'CommonArea'], label: 'Laundry Room', group: 'Building Amenities' },
  'elevator':      { field: 'BuildingFeatures,InteriorFeatures', values: ['Elevators', 'Elevator'], label: 'Elevator', group: 'Building Amenities' },
  'lounge':        { field: 'BuildingFeatures', values: ['CommonLounge'], label: "Residents' Lounge", group: 'Building Amenities' },
  'bike-storage':  { field: 'BuildingFeatures', values: ['BikeStorage'], label: 'Bike Storage', group: 'Building Amenities' },
  'storage':       { field: 'BuildingFeatures', values: ['Storage', 'ColdStorage'], label: 'Storage', group: 'Building Amenities' },
  // Unit Features
  'central-air':   { field: 'Cooling', values: ['CentralAir'], label: 'Central Air', group: 'Unit Features' },
  'dishwasher':    { field: 'Appliances', values: ['Dishwasher'], label: 'Dishwasher', group: 'Unit Features' },
  'washer-dryer':  { field: 'Appliances', values: ['Washer', 'Dryer', 'WasherDryer', 'WasherDryerAllowed', 'WasherDryerStacked'], label: 'Washer/Dryer', group: 'Unit Features' },
  'outdoor-space': { field: 'ExteriorFeatures', values: ['Balcony', 'BuildingBalcony', 'PrivateOutdoorSpaceOver60Sqft', 'PrivateOutdoorSpaceUnder60Sqft', 'PrivateYard', 'Garden'], label: 'Outdoor Space', group: 'Unit Features' },
  // Parking
  'garage':        { field: 'ParkingFeatures', values: ['Garage'], label: 'Garage/Parking', group: 'Parking' },
  // Pets — the MATCH is not this list: allowsPets (lib/search/pet-policy.ts) reads any answer that is not No / BuildingNo as pet-friendly (CatsOk, NoPetRestrictions, SeeRemarks ...).
  // `values` names live PetsAllowed members that say pets are welcome (display and contract data). It listed 'UnitYes', which was never a live member (the live one is 'Yes').
  'pet-friendly':  { field: 'PetsAllowed', values: ['Yes', 'BuildingYes', 'CatsOk', 'DogsOk', 'BuildingCatsOk', 'BuildingDogsOk', 'NumberLimit', 'SizeLimit', 'BreedRestrictions'], label: 'Pet Friendly', group: 'Pets' },
  // Views
  'park-views':    { field: 'View', values: ['Park', 'ParkGreenbelt'], label: 'Park Views', group: 'Views' },
  'river-views':   { field: 'View', values: ['River', 'Water'], label: 'River Views', group: 'Views' },
  'skyline-views': { field: 'View', values: ['City', 'CityLights', 'Skyline', 'Downtown'], label: 'Skyline Views', group: 'Views' },
  'views':         { field: 'View', values: ['Park', 'ParkGreenbelt', 'River', 'Water', 'City', 'CityLights', 'Skyline', 'Downtown'], label: 'Views', group: 'Views' },
  // Additional unit features
  'walk-in-closet': { field: 'InteriorFeatures', values: ['WalkInClosets', 'WalkInCloset'], label: 'Walk-in Closet', group: 'Unit Features' },
  'high-ceilings': { field: 'InteriorFeatures', values: ['HighCeilings', 'HighCeiling'], label: 'High Ceilings', group: 'Unit Features' },
  'fireplace':     { field: 'InteriorFeatures', values: ['WoodBurningFireplace', 'DecorativeFireplace', 'Fireplace'], label: 'Fireplace', group: 'Unit Features' },
  'natural-light': { field: 'InteriorFeatures', values: ['NaturalLight'], label: 'Natural Light', group: 'Unit Features' },
  'renovated':     { field: 'InteriorFeatures', values: ['Renovated', 'GutRenovated', 'NewlyRenovated'], label: 'Renovated', group: 'Unit Features' },
  'quiet':         { field: 'InteriorFeatures', values: ['Quiet'], label: 'Quiet', group: 'Unit Features' },
  // No Fee — DISABLED until a live field is found (Maya, 2026-10-09: "Disable until a live field is found"). The filter matched ListingTerms against 'NoFee' / 'OwnerPays'; neither is a member of
  // ListingTerms (data/cotality-enums.live.json), and the live OwnerPays is the list of UTILITIES the owner pays (Heat, Water ...), so it could only answer "no results". No live field says who pays the
  // broker fee; the committed $metadata has none either. To enable it, name that field in `field` / `values` and remove `unavailable`. UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED.
  // The reason is public text and says only what the listing page does: it shows the Move-In Costs, Tenant Pays and fee details a listing broker provided (an earlier wording said responsibility "is shown on each
  // rental listing", which the split-view cards, the map and the building pages do not do: found by the compliance review of 2026-10-09).
  'no-fee':        { field: '', values: [], label: 'No Fee', group: 'Rental', unavailable: 'Not searchable yet. Fee and move-in cost details that the listing broker provides are shown on the listing page.' },
};

/** True for an amenity key a search can apply: a key the map names (its own keys: "toString" is not one) whose filter is not disabled. */
export function isSearchableAmenity(key: string): key is AmenityFilter {
  return Object.prototype.hasOwnProperty.call(AMENITY_FIELD_MAP, key) && !AMENITY_FIELD_MAP[key as AmenityFilter].unavailable;
}

/** The amenity keys of a request that a search can apply, in order, each once; anything else (a disabled filter, a word the map does not name) is dropped. */
export function searchableAmenities(keys: readonly string[] | null | undefined): AmenityFilter[] {
  const out: AmenityFilter[] = [];
  for (const key of keys ?? []) if (isSearchableAmenity(key) && !out.includes(key)) out.push(key);
  return out;
}

/** The disabled filters among a request's amenity keys, each once, with the label and the reason to tell the reader (so a link that names one is not silently cleaned). */
export function unavailableAmenities(keys: readonly string[] | null | undefined): Array<{ key: AmenityFilter; label: string; reason: string }> {
  const out: Array<{ key: AmenityFilter; label: string; reason: string }> = [];
  for (const key of keys ?? []) {
    if (!Object.prototype.hasOwnProperty.call(AMENITY_FIELD_MAP, key)) continue;
    const { label, unavailable } = AMENITY_FIELD_MAP[key as AmenityFilter];
    if (unavailable && !out.some((o) => o.key === key)) out.push({ key: key as AmenityFilter, label, reason: unavailable });
  }
  return out;
}

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
