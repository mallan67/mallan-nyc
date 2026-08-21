/**
 * AMENITY TOKEN VOCABULARY — SUBORDINATE to FIELD_REGISTRY.
 *
 * NOT AN AUTHORITY. This file answers exactly one narrow question: which EXACT
 * provider tokens express a given amenity, and in which field. It does NOT
 * decide whether a criterion is offered, filterable, alertable, reportable,
 * visible to an audience, or attribution-bearing — `field-registry.ts` owns all
 * of that and is the single Search mapping authority.
 *
 * The distinction matters because an earlier draft of this file declared its own
 * `provenance` states, which duplicated the registry's `providerMappingStatus`
 * and `CapabilityStatus`. Two files describing the same capability is precisely
 * how drift returns: one gets corrected, the other keeps the old answer.
 *
 * The hierarchy is:
 *   FIELD_REGISTRY      single Search mapping authority — owns the criterion
 *   this file           subordinate exact-token vocabulary it composes
 *   live census JSON    dated evidence only, never authority
 *   the verifier        verifies FIELD_REGISTRY against current live Cotality
 *
 * It deliberately does NOT import from `lib/search/types.ts`, the PUBLIC
 * mallan.nyc Search types module — that dependency made the backend contract
 * hostage to a public UI file and leaked backend corrections into the public
 * product.
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
 * Capability, provenance and audience visibility live in FIELD_REGISTRY, not
 * here. `$metadata` declaring a field is NOT a capability — that judgement is the
 * registry's, and this file must never imply one.
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

export interface AmenityTokenSpec {
  /** Provider field(s) the value is matched against. Comma-separated. */
  field: string;
  /** Live-PRESENT provider tokens. EMPTY means no token expresses this amenity. */
  values: string[];
  /** UI wording this vocabulary is claimed to express — see semanticNote. */
  label: string;
  group: string;
  /** `isTrue` for provider BOOLEANS — a substring test against one matches nothing. */
  match?: AmenityMatch;
  /**
   * A live enum MEMBER that would express this amenity but is currently
   * populated on zero listings. Distinguishes "the provider has no such field"
   * from "the provider has it and the feed is empty" — only the latter can
   * resolve without a provider capability change.
   */
  unpopulatedMember?: string;
  /**
   * SEMANTIC EQUIVALENCE, where label and token are not obviously the same thing.
   *
   * Token existence + live population is NOT sufficient to call a criterion
   * verified. `BuildingFeatures.Concierge` proves a concierge, which is not
   * automatically a doorman. Where this note is present the criterion is
   * `needs_probe` in the registry until the equivalence itself is proven.
   */
  semanticNote?: string;
}

export const AMENITY_TOKENS: Record<string, AmenityTokenSpec> = {
  // SEMANTIC GAP: `Concierge` is live and populated (1,523), but a concierge is
  // NOT automatically a doorman — NYC buildings routinely have one without the
  // other, and the live BuildingFeatures vocabulary has no `Doorman` token at
  // all. Token existence does not establish that the token MEANS the UI label.
  doorman: { field: 'BuildingFeatures', values: ['Concierge'], label: 'Doorman', group: 'Lobby & Services',
    semanticNote: 'Concierge != Doorman. Equivalence unproven; registry keeps this needs_probe.' },
  gym: { field: 'BuildingFeatures', values: ['FitnessCenter', 'HealthClub', 'YogaStudio'], label: 'Gym/Fitness', group: 'Building Amenities' },
  pool: { field: 'BuildingFeatures', values: ['IndoorPool'], label: 'Pool', group: 'Building Amenities' },
  spa: { field: 'BuildingFeatures', values: ['SpaHotTub'], label: 'Spa', group: 'Building Amenities' },
  sauna: { field: 'BuildingFeatures', values: ['Sauna'], label: 'Sauna', group: 'Building Amenities' },
  'steam-room': { field: 'BuildingFeatures', values: ['SteamRoom'], label: 'Steam Room', group: 'Building Amenities' },
  'roof-deck': { field: 'ExteriorFeatures', values: ['BuildingRoofDeck'], label: 'Roof Deck', group: 'Building Amenities' },
  playroom: { field: 'BuildingFeatures', values: ['CommonPlayroom'], label: "Children's Playroom", group: 'Building Amenities' },
  'laundry-room': { field: 'LaundryFeatures', values: ['LaundryRoom', 'CommonOnFloor', 'CommonArea'], label: 'Laundry Room', group: 'Building Amenities' },
  elevator: { field: 'BuildingFeatures,InteriorFeatures', values: ['Elevators', 'Elevator'], label: 'Elevator', group: 'Building Amenities' },
  lounge: { field: 'BuildingFeatures', values: ['CommonLounge'], label: "Residents' Lounge", group: 'Building Amenities' },
  'bike-storage': { field: 'BuildingFeatures', values: ['BikeStorage'], label: 'Bike Storage', group: 'Building Amenities' },
  storage: { field: 'BuildingFeatures', values: ['Storage', 'ColdStorage'], label: 'Storage', group: 'Building Amenities' },
  'central-air': { field: 'Cooling', values: ['CentralAir'], label: 'Central Air', group: 'Unit Features' },
  dishwasher: { field: 'Appliances', values: ['Dishwasher'], label: 'Dishwasher', group: 'Unit Features' },
  // `LaundryFeatures.InUnit` (4,093 live) is the primary in-unit laundry signal.
  'washer-dryer': { field: 'Appliances,LaundryFeatures', values: ['Washer', 'Dryer', 'WasherDryerAllowed', 'WasherDryerStacked', 'InUnit'], label: 'Washer/Dryer', group: 'Unit Features' },
  'outdoor-space': { field: 'ExteriorFeatures', values: ['Balcony', 'BuildingBalcony', 'PrivateOutdoorSpaceOver60Sqft', 'PrivateOutdoorSpaceUnder60Sqft', 'PrivateYard', 'Garden'], label: 'Outdoor Space', group: 'Unit Features' },
  // Provider BOOLEAN, true on 2,630 live — `ParkingFeatures` carries a Garage
  // token on only 591, so the boolean finds ~4x more.
  garage: { field: 'GarageYN', values: [], match: 'isTrue', label: 'Garage/Parking', group: 'Parking',
    semanticNote: 'GarageYN proves a GARAGE. The UI label also promises generic PARKING, which a garage boolean does not establish (valet, assigned, on-street and deeded parking are separate ParkingFeatures tokens). Equivalence unproven; registry keeps this needs_probe.' },
  // Unit-level affirmative tokens ONLY. `BuildingYes` describes the BUILDING.
  'pet-friendly': { field: 'PetsAllowed', values: ['Yes', 'CatsOk', 'DogsOk'], label: 'Pet Friendly', group: 'Pets' },
  'park-views': { field: 'View', values: ['ParkGreenbelt'], label: 'Park Views', group: 'Views' },
  'river-views': { field: 'View', values: ['River', 'Water'], label: 'River Views', group: 'Views' },
  'skyline-views': { field: 'View', values: ['City', 'CityLights', 'Panoramic'], label: 'Skyline Views', group: 'Views',
    semanticNote: 'City / CityLights / Panoramic are live and populated, but none of them means SKYLINE specifically — a ground-floor city view is not a skyline view. Equivalence unproven; registry keeps this needs_probe.' },
  views: { field: 'View', values: ['ParkGreenbelt', 'River', 'Water', 'City', 'CityLights', 'Panoramic', 'Bridges'], label: 'Views', group: 'Views' },
  'walk-in-closet': { field: 'InteriorFeatures', values: ['WalkInClosets'], label: 'Walk-in Closet', group: 'Unit Features' },
  'high-ceilings': { field: 'InteriorFeatures', values: ['HighCeilings'], label: 'High Ceilings', group: 'Unit Features' },
  // Provider BOOLEAN (861 live true). The old mapping tested substrings against
  // `InteriorFeatures`, whose 45-token live vocabulary has no fireplace token.
  fireplace: { field: 'FireplaceYN', values: [], match: 'isTrue', label: 'Fireplace', group: 'Unit Features' },
  // `InteriorFeatures.Remodeled` IS a live member but appears on ZERO of 8,102
  // live rows; `PropertyCondition` (UpdatedRemodeled/UnderRenovation/Turnkey) is
  // populated 0/8,110 exhaustively. Provider-supported, currently unpopulated.
  // EMPTY because no token is live-PRESENT, which is what this list means.
  // `InteriorFeatures.Remodeled` IS the correct live enum member and appears on
  // ZERO of 8,102 live rows; `PropertyCondition` (UpdatedRemodeled /
  // UnderRenovation / Turnkey) is populated 0/8,110 exhaustively. Recorded in
  // `unpopulatedMember` so this becomes a one-line change if the feed ever
  // carries it — a POPULATION gap, not a missing provider capability.
  renovated: { field: 'InteriorFeatures', values: [], label: 'Renovated', group: 'Unit Features',
    unpopulatedMember: 'Remodeled' },
  'natural-light': { field: 'InteriorFeatures', values: [], label: 'Natural Light', group: 'Unit Features' },
  quiet: { field: 'InteriorFeatures', values: [], label: 'Quiet', group: 'Unit Features' },
  // `ListingTerms` has 67 live members and includes NEITHER NoFee NOR OwnerPays;
  // `Concessions` is present as a key and NULL on every displayable listing.
  'no-fee': { field: 'ListingTerms', values: [], label: 'No Fee', group: 'Rental' },
};

/**
 * Amenities whose token list is EMPTY — no live token expresses them.
 *
 * This is a VOCABULARY fact, not a capability decision: the registry decides
 * whether a criterion is offered. Kept here only so the two causes stay
 * distinguishable, because only one can resolve on its own.
 *
 *   `renovated`  provider-SUPPORTED but unpopulated — `InteriorFeatures.Remodeled`
 *                is a live member on ZERO of 8,102 rows, and `PropertyCondition`
 *                is populated 0/8,110 exhaustively. Becomes available if the feed
 *                ever carries it.
 *   the rest     no live field carries the concept at all.
 */
export const UNPOPULATED_AMENITIES: ReadonlySet<string> = new Set(['renovated']);
export const UNMAPPED_AMENITIES: ReadonlySet<string> = new Set(['no-fee', 'natural-light', 'quiet']);
