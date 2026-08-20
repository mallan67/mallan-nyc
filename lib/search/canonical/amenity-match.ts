/**
 * THE ONE PLACE THAT DECIDES WHETHER A LISTING SATISFIES AN AMENITY.
 *
 * Before this module the rule existed twice: once in the projection producer
 * (`extractProjectionAmenityKeys`) and once in the public search reader. They
 * had already drifted — the producer's copy could not express a boolean field
 * at all, so `fireplace` and `garage` (both provider BOOLEANS) could never be
 * matched there no matter what the map said.
 *
 * The projection producer derives `amenity_keys` ONCE at write time using this
 * function; readers then filter on the derived keys instead of re-deriving.
 * That is what keeps public Search, Saved Search and CMA answering the same
 * question the same way.
 *
 * ── PROVIDER SHAPES THIS MUST HANDLE (live-verified 2026-08-19) ─────────────
 *
 * 1. COMMA-JOINED TOKEN LISTS — `"Elevators,Storage"`, `"Dryer,Washer"`.
 *    Tokens are fixed PascalCase provider vocabulary, so matching is
 *    case-SENSITIVE by design: the casing is the provider's, never the user's.
 *
 * 2. BOOLEANS — `FireplaceYN` (861 true), `GarageYN` (2,630 true),
 *    `NewConstructionYN` (950 true). A substring test against a boolean matches
 *    nothing, which is exactly how `fireplace` returned 0 rows corpus-wide.
 *
 * 3. TOKEN LISTS THAT ENCODE NEGATIVES — `PetsAllowed` mixes building-level and
 *    unit-level tokens in ONE list: `"BuildingYes,No"` means the building
 *    permits pets and THIS UNIT DOES NOT. Substring-matching `"Yes"` also hits
 *    `"BuildingYes"`, which inflated the live pet-friendly result from 4,304 to
 *    6,861 — 2,557 listings a renter with a dog cannot rent. Exact-token
 *    matching is mandatory here, not a refinement.
 */
import { AMENITY_FIELD_MAP, UNSUPPORTED_AMENITIES, type AmenityFilter } from '@/lib/search/types';

/** Affirmative UNIT-level pet tokens. Building-level `Building*` tokens are
 *  deliberately excluded — they describe the building, not the unit. */
export const UNIT_PET_TOKENS = ['Yes', 'CatsOk', 'DogsOk'] as const;

/**
 * Split a provider multi-value into exact tokens.
 *
 * `PetsAllowed` is a string on 8,156 live rows and an ARRAY on 2, so both
 * shapes must be handled or those rows silently fail every pet filter.
 */
export function providerTokens(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Is this provider value a true boolean (or its string spelling)? */
function isTruthyBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 'True';
}

/**
 * Does this feature payload satisfy `amenityKey`?
 *
 * `payload` is the provider feature object — `listings.features` or
 * `listings.raw_data`. Callers pass whichever they hold; `satisfiedAmenityKeys`
 * merges both so a field present in only one still counts.
 */
export function amenityMatches(amenityKey: string, payload: Record<string, unknown>): boolean {
  if (UNSUPPORTED_AMENITIES.has(amenityKey)) return false;
  if (!(amenityKey in AMENITY_FIELD_MAP)) return false;

  const mapping = AMENITY_FIELD_MAP[amenityKey as AmenityFilter];
  const fields = mapping.field.split(',').map((f) => f.trim());

  if (mapping.match === 'isTrue') {
    return fields.some((field) => isTruthyBoolean(payload[field]));
  }

  if (amenityKey === 'pet-friendly') {
    const tokens = providerTokens(payload.PetsAllowed);
    return UNIT_PET_TOKENS.some((t) => tokens.includes(t));
  }

  return fields.some((field) => {
    const tokens = providerTokens(payload[field]);
    return mapping.values.some((v) => tokens.includes(v));
  });
}

/**
 * Every amenity this listing satisfies — the value stored in
 * `listing_search_projection.amenity_keys`.
 *
 * Both payloads are merged because completeness differs per field: `Furnished`
 * appears on 3,018 rows in `features` but 8,156 in `raw_data`. Reading only one
 * silently loses listings.
 */
export function satisfiedAmenityKeys(
  features: Record<string, unknown> | null | undefined,
  rawData?: Record<string, unknown> | null,
): string[] {
  const payload: Record<string, unknown> = { ...(rawData ?? {}), ...(features ?? {}) };
  if (Object.keys(payload).length === 0) return [];
  return Object.keys(AMENITY_FIELD_MAP).filter((key) => amenityMatches(key, payload));
}

/**
 * The five live `Furnished` members, verified against the live enum on
 * 2026-08-19: Furnished · FurnishedOrUnfurnished · Negotiable · Partially ·
 * Unfurnished. NYC Active population: Furnished 106 · Unfurnished 2,876 ·
 * Negotiable 12 · Partially 4 · FurnishedOrUnfurnished 0.
 *
 * `furnished=true` means STRICTLY `Furnished`. `Partially` and `Negotiable`
 * describe a unit that is not furnished as offered, and folding them in would
 * silently widen a filter a renter uses to decide whether to bring furniture.
 * Widening it is a product decision, recorded here so it is a decision rather
 * than an accident.
 */
export const FURNISHED_MEMBERS = [
  'Furnished',
  'FurnishedOrUnfurnished',
  'Negotiable',
  'Partially',
  'Unfurnished',
] as const;

export function isFurnished(value: unknown): boolean {
  return String(value ?? '').trim() === 'Furnished';
}

/**
 * Live `CommonInterest` → Mallan ownership flag. NYC does NOT express ownership
 * through `PropertySubType` (Condominium / StockCooperative / Townhouse are all
 * ZERO there); it uses `CommonInterest`. Live Active population:
 * Condominium 3,795 · StockCooperative 2,567 · None 1,019 ·
 * RentalBuilding 630 · Condop 146.
 */
export const OWNERSHIP_FLAG_BY_COMMON_INTEREST: Record<string, string> = {
  Condominium: 'is_condo',
  StockCooperative: 'is_coop',
  Condop: 'is_condop',
  RentalBuilding: 'is_rental_building',
};

/**
 * Provider fields the Trestle fallback must $select so amenities can be matched
 * Mallan-side by `amenityMatches`.
 *
 * Live-verified 2026-08-19: all of these $select together (HTTP 200) and every
 * one is returned in the payload. The route previously asserted the opposite —
 * that they are "unavailable on IDX Plus" — and therefore silently ignored every
 * non-pet amenity on the fallback path. What IS rejected is `/any()` lambda
 * FILTERING on the collection fields (HTTP 400); selection is unaffected.
 */
export const TRESTLE_AMENITY_SELECT_FIELDS = [
  'BuildingFeatures',
  'InteriorFeatures',
  'ExteriorFeatures',
  'Appliances',
  'LaundryFeatures',
  'Cooling',
  'View',
  'ParkingFeatures',
  'PetsAllowed',
  'NewConstructionYN',
  'GarageYN',
  'FireplaceYN',
] as const;
