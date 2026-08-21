/**
 * CANONICAL AMENITY VOCABULARY — the backend/CRM Search foundation.
 *
 * OWNERSHIP AND DIRECTION
 *
 * This file is the canonical layer's OWN truth. It deliberately does NOT import
 * from `lib/search/types.ts`, which is the PUBLIC mallan.nyc Search types module.
 * The dependency ran that way once and it was wrong in both directions: it made
 * the backend contract hostage to a public UI file, and it meant correcting a
 * verified provider fact silently changed public Search behaviour.
 *
 * Public Search is a SEPARATE product surface and is out of scope here. Nothing
 * in this module may be wired into `app/search`, `SearchFilterPanel`,
 * `/api/listings`, or the public listing readers without separate authorization.
 *
 * WHO CONSUMES THIS
 *
 * The four authenticated brokerage workflows — SALE SEARCH, RENTAL SEARCH,
 * CMA SEARCH, BUILDING SEARCH. They are four distinct UI/business contracts and
 * must NOT share one collector or one criteria schema, but they DO share exactly
 * one verified provider mapping layer: this one. Separate workflows, single
 * provider truth.
 *
 * ── PROVENANCE CLASSES ──────────────────────────────────────────────────────
 *
 * Every criterion is exactly one of:
 *   VERIFIED        a live Cotality field, probed this session
 *   MALLAN_DERIVED  Mallan-owned enrichment (e.g. Google geocoding, MTA transit)
 *                   — never presented as provider fact
 *   UNAVAILABLE     no verified basis today; must not render as functional
 *
 * `$metadata` declaring a field is NOT a capability. `Latitude`/`Longitude` are
 * declared nullable on Property and must NEVER be treated as a Search capability
 * on that basis — Mallan geo comes from verified Google geocoding, carried as
 * MALLAN_DERIVED with explicit provenance.
 *
 * ── EVIDENCE ────────────────────────────────────────────────────────────────
 *
 * Token values below were audited against the live enum AND an EXHAUSTIVE live
 * token census of the whole Active corpus (8,102/8,102 rows, coverage complete,
 * 2026-08-19/20). Membership alone is insufficient: a token can be a valid enum
 * member and appear on ZERO listings, in which case a filter built on it matches
 * nothing and fails silently — indistinguishable to a user from "no results".
 *
 * Corrected here, each previously matching NOTHING live:
 *   RoofDeck        -> BuildingRoofDeck (2,663)
 *   OnCommonFloor   -> CommonOnFloor (1,228)
 *   UnitYes         -> Yes (3,007)
 *   Park            -> ParkGreenbelt (674)
 *   WalkInCloset    -> WalkInClosets (921)
 *   HighCeiling     -> HighCeilings (1,841)
 *   WasherDryer     -> Washer (1,170) / Dryer (1,162) / WasherDryerAllowed (1,362)
 *   Skyline/Downtown-> valid MEMBERS, ZERO live rows
 */

/** How a value is matched against the provider payload. */
export type AmenityMatch = 'contains' | 'isTrue';

/** Provenance of a criterion. Never blank, never inferred at the call site. */
export type CriterionProvenance = 'VERIFIED' | 'MALLAN_DERIVED' | 'UNAVAILABLE';

export interface CanonicalAmenitySpec {
  /** Provider field(s) the value is matched against. Comma-separated. */
  field: string;
  /** Live-PRESENT provider tokens. Empty when the amenity is unavailable. */
  values: string[];
  label: string;
  group: string;
  /** `isTrue` for provider BOOLEANS — a substring test against one matches nothing. */
  match?: AmenityMatch;
  provenance: CriterionProvenance;
}

export const CANONICAL_AMENITIES: Record<string, CanonicalAmenitySpec> = {
  doorman: { field: 'BuildingFeatures', values: ['Concierge'], label: 'Doorman', group: 'Lobby & Services', provenance: 'VERIFIED' },
  gym: { field: 'BuildingFeatures', values: ['FitnessCenter', 'HealthClub', 'YogaStudio'], label: 'Gym/Fitness', group: 'Building Amenities', provenance: 'VERIFIED' },
  pool: { field: 'BuildingFeatures', values: ['IndoorPool'], label: 'Pool', group: 'Building Amenities', provenance: 'VERIFIED' },
  spa: { field: 'BuildingFeatures', values: ['SpaHotTub'], label: 'Spa', group: 'Building Amenities', provenance: 'VERIFIED' },
  sauna: { field: 'BuildingFeatures', values: ['Sauna'], label: 'Sauna', group: 'Building Amenities', provenance: 'VERIFIED' },
  'steam-room': { field: 'BuildingFeatures', values: ['SteamRoom'], label: 'Steam Room', group: 'Building Amenities', provenance: 'VERIFIED' },
  'roof-deck': { field: 'ExteriorFeatures', values: ['BuildingRoofDeck'], label: 'Roof Deck', group: 'Building Amenities', provenance: 'VERIFIED' },
  playroom: { field: 'BuildingFeatures', values: ['CommonPlayroom'], label: "Children's Playroom", group: 'Building Amenities', provenance: 'VERIFIED' },
  'laundry-room': { field: 'LaundryFeatures', values: ['LaundryRoom', 'CommonOnFloor', 'CommonArea'], label: 'Laundry Room', group: 'Building Amenities', provenance: 'VERIFIED' },
  elevator: { field: 'BuildingFeatures,InteriorFeatures', values: ['Elevators', 'Elevator'], label: 'Elevator', group: 'Building Amenities', provenance: 'VERIFIED' },
  lounge: { field: 'BuildingFeatures', values: ['CommonLounge'], label: "Residents' Lounge", group: 'Building Amenities', provenance: 'VERIFIED' },
  'bike-storage': { field: 'BuildingFeatures', values: ['BikeStorage'], label: 'Bike Storage', group: 'Building Amenities', provenance: 'VERIFIED' },
  storage: { field: 'BuildingFeatures', values: ['Storage', 'ColdStorage'], label: 'Storage', group: 'Building Amenities', provenance: 'VERIFIED' },
  'central-air': { field: 'Cooling', values: ['CentralAir'], label: 'Central Air', group: 'Unit Features', provenance: 'VERIFIED' },
  dishwasher: { field: 'Appliances', values: ['Dishwasher'], label: 'Dishwasher', group: 'Unit Features', provenance: 'VERIFIED' },
  // `LaundryFeatures.InUnit` (4,093 live) is the primary in-unit laundry signal.
  'washer-dryer': { field: 'Appliances,LaundryFeatures', values: ['Washer', 'Dryer', 'WasherDryerAllowed', 'WasherDryerStacked', 'InUnit'], label: 'Washer/Dryer', group: 'Unit Features', provenance: 'VERIFIED' },
  'outdoor-space': { field: 'ExteriorFeatures', values: ['Balcony', 'BuildingBalcony', 'PrivateOutdoorSpaceOver60Sqft', 'PrivateOutdoorSpaceUnder60Sqft', 'PrivateYard', 'Garden'], label: 'Outdoor Space', group: 'Unit Features', provenance: 'VERIFIED' },
  // Provider BOOLEAN, true on 2,630 live — `ParkingFeatures` carries a Garage
  // token on only 591, so the boolean finds ~4x more.
  garage: { field: 'GarageYN', values: [], match: 'isTrue', label: 'Garage/Parking', group: 'Parking', provenance: 'VERIFIED' },
  // Unit-level affirmative tokens ONLY. `BuildingYes` describes the BUILDING.
  'pet-friendly': { field: 'PetsAllowed', values: ['Yes', 'CatsOk', 'DogsOk'], label: 'Pet Friendly', group: 'Pets', provenance: 'VERIFIED' },
  'park-views': { field: 'View', values: ['ParkGreenbelt'], label: 'Park Views', group: 'Views', provenance: 'VERIFIED' },
  'river-views': { field: 'View', values: ['River', 'Water'], label: 'River Views', group: 'Views', provenance: 'VERIFIED' },
  'skyline-views': { field: 'View', values: ['City', 'CityLights', 'Panoramic'], label: 'Skyline Views', group: 'Views', provenance: 'VERIFIED' },
  views: { field: 'View', values: ['ParkGreenbelt', 'River', 'Water', 'City', 'CityLights', 'Panoramic', 'Bridges'], label: 'Views', group: 'Views', provenance: 'VERIFIED' },
  'walk-in-closet': { field: 'InteriorFeatures', values: ['WalkInClosets'], label: 'Walk-in Closet', group: 'Unit Features', provenance: 'VERIFIED' },
  'high-ceilings': { field: 'InteriorFeatures', values: ['HighCeilings'], label: 'High Ceilings', group: 'Unit Features', provenance: 'VERIFIED' },
  // Provider BOOLEAN (861 live true). The old mapping tested substrings against
  // `InteriorFeatures`, whose 45-token live vocabulary has no fireplace token.
  fireplace: { field: 'FireplaceYN', values: [], match: 'isTrue', label: 'Fireplace', group: 'Unit Features', provenance: 'VERIFIED' },
  // `InteriorFeatures.Remodeled` IS a live member but appears on ZERO of 8,102
  // live rows; `PropertyCondition` (UpdatedRemodeled/UnderRenovation/Turnkey) is
  // populated 0/8,110 exhaustively. Provider-supported, currently unpopulated.
  renovated: { field: 'InteriorFeatures', values: ['Remodeled'], label: 'Renovated', group: 'Unit Features', provenance: 'UNAVAILABLE' },
  'natural-light': { field: 'InteriorFeatures', values: [], label: 'Natural Light', group: 'Unit Features', provenance: 'UNAVAILABLE' },
  quiet: { field: 'InteriorFeatures', values: [], label: 'Quiet', group: 'Unit Features', provenance: 'UNAVAILABLE' },
  // `ListingTerms` has 67 live members and includes NEITHER NoFee NOR OwnerPays;
  // `Concessions` is present as a key and NULL on every displayable listing.
  'no-fee': { field: 'ListingTerms', values: [], label: 'No Fee', group: 'Rental', provenance: 'UNAVAILABLE' },
};

/**
 * Amenities with no verified basis TODAY.
 *
 * Two distinct causes, kept separate because only one can resolve on its own:
 *   `renovated`  provider-supported, currently unpopulated — becomes available
 *                the moment the feed carries `Remodeled`.
 *   the rest     no live field carries the concept at all.
 */
export const UNSUPPORTED_AMENITIES: ReadonlySet<string> = new Set(
  Object.entries(CANONICAL_AMENITIES)
    .filter(([, spec]) => spec.provenance === 'UNAVAILABLE')
    .map(([key]) => key),
);

export const UNPOPULATED_AMENITIES: ReadonlySet<string> = new Set(['renovated']);
export const UNMAPPED_AMENITIES: ReadonlySet<string> = new Set(['no-fee', 'natural-light', 'quiet']);
