/**
 * Listing search projection — pure builder helpers.
 *
 * Owned scope (per the PR 5A bounded brief):
 *   - Build a row for the new `listing_search_projection` table from a
 *     Listing-shaped input (DB row + features/address/media JSON).
 *   - Derive the searchable text, amenity keys, and feature flags as
 *     pure (no DB, no I/O) testable functions.
 *
 * Intentionally NOT included:
 *   - Persistence — no Prisma calls live here. PR 5B will write rows
 *     from lib/idx/sync.ts using these builders; PR 5A is schema only.
 *   - Display gating — `lib/search/listing-access-decision.ts` remains
 *     the canonical evaluator; this builder mirrors raw permission flags
 *     so a future reader can call the canonical evaluator on projection
 *     rows directly.
 *   - DTO mapping — public/portal DTOs continue to flow through
 *     `lib/idx/db-to-public-dto.ts` and `lib/idx/public-dto.ts`.
 */

import { Prisma } from "@prisma/client";

import { AMENITY_FIELD_MAP, type AmenityFilter } from "@/lib/search/types";

// PropertySubType values that should classify a listing as commercial when no
// `commercial_sub_type` column is present. Matches the existing inline
// filter in `lib/search/public-listing-db.ts`'s commercial branch.
const COMMERCIAL_SUB_TYPES = new Set([
  "Commercial",
  "Office",
  "Retail",
  "Industrial",
  "MixedUse",
  "MultiFamily",
  "Warehouse",
]);

// PropertySubType values that should classify a listing as new development.
const NEW_DEVELOPMENT_SUB_TYPES = new Set(["NewConstruction", "New Construction"]);

/**
 * Loose Listing-shape input. Tolerates partial / mixed shapes so the helper
 * can run against:
 *   - a plain Prisma `Listing` row (BigInt agent_id, Decimal list_price)
 *   - a serialized DB row (string list_price, string living_area)
 *   - a partial fixture in tests
 *
 * The builder returns null/false for every field the input does not provide
 * — never throws.
 */
export interface ListingProjectionSource {
  listing_id: string;

  // Filter columns
  status?: string | null;
  listing_type?: string | null;
  property_type?: string | null;
  property_sub_type?: string | null;
  list_price?: number | string | bigint | { toString(): string } | null;
  bedrooms_total?: number | null;
  bathrooms_full?: number | null;
  bathrooms_half?: number | null;
  living_area?: number | string | { toString(): string } | null;
  borough?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  postal_code?: string | null;

  // Eligibility / commercial
  rls_eligible?: boolean | null;
  commercial_sub_type?: string | null;

  // Distribution gates
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  internet_address_display_yn?: boolean | null;
  participant_only?: boolean | null;

  // Exclusivity signal
  agent_id?: bigint | number | null;

  // Sync timestamp
  modification_timestamp?: Date | string | null;

  // JSON columns
  address?: Record<string, unknown> | null;
  features?: Record<string, unknown> | null;
  media?: unknown[] | Record<string, unknown> | null;
}

/**
 * Shape of a row written to `listing_search_projection`. Excludes
 * Prisma-managed `id`, `created_at`, `updated_at` so the same shape can
 * be passed to both `prisma.listingSearchProjection.create({ data: … })`
 * and `update({ data: … })`.
 */
export interface ListingSearchProjectionRow {
  listing_id: string;
  listing_key: string | null;
  source_system: string | null;
  mls_status: string | null;
  listing_type: string | null;
  property_type: string | null;
  property_sub_type: string | null;
  borough: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  list_price: bigint | null;
  bedrooms: number | null;
  bathrooms: number | null;
  living_area: number | null;
  year_built: number | null;
  latitude: number | null;
  longitude: number | null;
  is_commercial: boolean;
  is_new_development: boolean;
  is_exclusive: boolean;
  is_rental: boolean;
  rls_eligible: boolean;
  idx_display_yn: boolean | null;
  internet_entire_listing_display_yn: boolean | null;
  internet_address_display_yn: boolean | null;
  participant_only_yn: boolean | null;
  searchable_text: string | null;
  amenity_keys: string[] | null;
  feature_flags: Record<string, boolean> | null;
  modified_at: Date | null;
}

// ── Coercion helpers (kept module-local, not exported) ─────────────────

function stringFrom(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  return trimmed ? trimmed : null;
}

function numberFrom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bigintFrom(value: unknown): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return BigInt(Math.trunc(value));
  }
  // Decimal / string — strip cents if present, then BigInt the integer part.
  const str = typeof value === "string" ? value : String(value);
  const cleaned = str.trim().split(".")[0].replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

function dateFrom(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const str = typeof value === "string" ? value : String(value);
  const parsed = new Date(str);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isMediaArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ── Public helpers ─────────────────────────────────────────────────────

/**
 * Lowercased, whitespace-collapsed string of free-text fields safe for
 * keyword matching. Includes PublicRemarks, address parts (StreetNumber,
 * StreetName, UnitNumber, BuildingName), and the lifted neighborhood + city.
 *
 * Returns null when no source field is populated.
 *
 * Compliance note: PublicRemarks is a PUB-tier IDX field. Do NOT extend
 * this helper to include PrivateRemarks or ShowingInstructions (HID tier
 * per IDX/VOW display rules) — readers consuming `searchable_text` would
 * leak those to public surfaces.
 */
export function normalizeProjectionSearchText(listing: ListingProjectionSource): string | null {
  const features = (listing.features || {}) as Record<string, unknown>;
  const address = (listing.address || {}) as Record<string, unknown>;

  const parts: string[] = [];

  const remarks = stringFrom(features.PublicRemarks);
  if (remarks) parts.push(remarks);

  for (const key of ["StreetNumber", "StreetDirPrefix", "StreetName", "UnitNumber", "BuildingName", "City"]) {
    const v = stringFrom(address[key]);
    if (v) parts.push(v);
  }

  const neighborhood = stringFrom(listing.neighborhood);
  if (neighborhood) parts.push(neighborhood);
  const city = stringFrom(listing.city);
  if (city && city !== stringFrom(address.City)) parts.push(city);

  if (parts.length === 0) return null;

  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim() || null;
}

/**
 * AmenityFilter keys that match the listing's features JSON. Reuses the
 * same DTO/features substring rules that the route applies in
 * `lib/search/public-listing-db.ts`'s `applyPublicListingPostFilters` —
 * preserving semantic parity so a future reader switch doesn't change
 * which amenities a listing matches.
 *
 * Returns null when features is missing or no amenity matched.
 */
export function extractProjectionAmenityKeys(listing: ListingProjectionSource): string[] | null {
  const features = listing.features as Record<string, unknown> | null | undefined;
  if (!features) return null;

  const matched: string[] = [];
  for (const amenityKey of Object.keys(AMENITY_FIELD_MAP) as AmenityFilter[]) {
    const mapping = AMENITY_FIELD_MAP[amenityKey];
    const fields = mapping.field.split(",").map((f) => f.trim());
    const matchValues = mapping.values.map((v) => v.toLowerCase());

    const hit = fields.some((fieldName) => {
      const featValue = String(features[fieldName] || "").toLowerCase();
      if (!featValue) return false;
      if (amenityKey === "pet-friendly") {
        return !featValue.includes("no") || featValue.includes("catsok") || featValue.includes("dogsok");
      }
      return matchValues.some((mv) => featValue.includes(mv));
    });

    if (hit) matched.push(amenityKey);
  }

  return matched.length > 0 ? matched : null;
}

/**
 * Boolean flags about the listing record itself — distinct from amenity
 * keys (which describe building/unit attributes). Examples:
 *   - has_floorplan / has_video / has_virtual_tour from media[]
 *   - is_furnished / is_pet_friendly from features.Furnished/PetsAllowed
 *
 * Returns null when neither features nor media is populated.
 */
export function extractProjectionFeatureFlags(listing: ListingProjectionSource): Record<string, boolean> | null {
  const features = listing.features as Record<string, unknown> | null | undefined;
  const mediaRaw = listing.media;
  const flags: Record<string, boolean> = {};

  if (isMediaArray(mediaRaw)) {
    let hasFloorPlan = false;
    let hasVideo = false;
    let hasVirtualTour = false;
    for (const m of mediaRaw) {
      if (!m || typeof m !== "object") continue;
      const rec = m as Record<string, unknown>;
      const cat = String(rec.MediaCategory ?? rec.mediaType ?? "").toLowerCase();
      if (cat.includes("floor")) hasFloorPlan = true;
      else if (cat.includes("video")) hasVideo = true;
      else if (cat.includes("virtual")) hasVirtualTour = true;
    }
    flags.has_floorplan = hasFloorPlan;
    flags.has_video = hasVideo;
    flags.has_virtual_tour = hasVirtualTour;
  }

  if (features) {
    const furnished = String(features.Furnished ?? "").toLowerCase();
    flags.is_furnished = furnished === "furnished";

    const pets = String(features.PetsAllowed ?? "").toLowerCase();
    flags.is_pet_friendly = !!pets && (!pets.includes("no") || pets.includes("catsok") || pets.includes("dogsok"));
  }

  return Object.keys(flags).length > 0 ? flags : null;
}

/**
 * Build a complete `listing_search_projection` row from a Listing-shaped
 * input. Pure: same input → same output, no side effects, safe to call
 * inside test fixtures or sync loops.
 *
 * Distribution-gate fields are mirrored verbatim (null stays null) so a
 * future reader can fail-closed via the canonical evaluators in
 * `lib/search/listing-access-decision.ts`.
 */
export function buildListingSearchProjectionFromListing(
  listing: ListingProjectionSource,
): ListingSearchProjectionRow {
  const features = (listing.features || {}) as Record<string, unknown>;
  const address = (listing.address || {}) as Record<string, unknown>;

  // Bathrooms = full + half * 0.5; null when both are missing.
  const bathroomsFull = listing.bathrooms_full;
  const bathroomsHalf = listing.bathrooms_half;
  const bathrooms =
    bathroomsFull === null || bathroomsFull === undefined
      ? null
      : Number(bathroomsFull) + Number(bathroomsHalf || 0) * 0.5;

  const bedrooms = listing.bedrooms_total === null || listing.bedrooms_total === undefined
    ? null
    : Number(listing.bedrooms_total);

  const propertySubType = stringFrom(listing.property_sub_type);
  const isCommercial =
    !!stringFrom(listing.commercial_sub_type) ||
    (propertySubType !== null && COMMERCIAL_SUB_TYPES.has(propertySubType));
  const isNewDevelopment = propertySubType !== null && NEW_DEVELOPMENT_SUB_TYPES.has(propertySubType);
  const isExclusive = listing.agent_id !== null && listing.agent_id !== undefined;
  const isRental = listing.listing_type === "rent";

  return {
    listing_id: listing.listing_id,
    listing_key: stringFrom(features.ListingKey) ?? stringFrom(address.ListingKey) ?? null,
    source_system: stringFrom(features.SourceSystem) ?? stringFrom(features.SourceSystemKey) ?? null,
    mls_status: stringFrom(features.MlsStatus) ?? stringFrom(listing.status),
    listing_type: stringFrom(listing.listing_type),
    property_type: stringFrom(listing.property_type),
    property_sub_type: propertySubType,
    borough: stringFrom(listing.borough),
    neighborhood: stringFrom(listing.neighborhood),
    postal_code: stringFrom(listing.postal_code) ?? stringFrom(address.PostalCode),
    city: stringFrom(listing.city) ?? stringFrom(address.City),
    state: stringFrom(address.StateOrProvince) ?? stringFrom(address.State),
    list_price: bigintFrom(listing.list_price),
    bedrooms,
    bathrooms,
    living_area: numberFrom(listing.living_area),
    year_built: numberFrom(features.YearBuilt) ?? null,
    latitude: numberFrom(address.Latitude),
    longitude: numberFrom(address.Longitude),
    is_commercial: isCommercial,
    is_new_development: isNewDevelopment,
    is_exclusive: isExclusive,
    is_rental: isRental,
    rls_eligible: listing.rls_eligible !== false,
    idx_display_yn: listing.idx_display_yn ?? null,
    internet_entire_listing_display_yn: listing.internet_entire_listing_display_yn ?? null,
    internet_address_display_yn: listing.internet_address_display_yn ?? null,
    participant_only_yn: listing.participant_only ?? null,
    searchable_text: normalizeProjectionSearchText(listing),
    amenity_keys: extractProjectionAmenityKeys(listing),
    feature_flags: extractProjectionFeatureFlags(listing),
    modified_at: dateFrom(listing.modification_timestamp),
  };
}

// ── Prisma upsert payload builder ─────────────────────────────────────

/**
 * Convert a `Json?` field value into a Prisma-acceptable input. Strict
 * Prisma TypeScript types reject bare `null` for nullable Json columns —
 * the runtime value `Prisma.JsonNull` is the correct way to set the
 * column to SQL NULL on a `Json?` field.
 */
function jsonInput(
  value: string[] | Record<string, boolean> | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export interface ListingSearchProjectionUpsertPayload {
  where: { listing_id: string };
  create: Prisma.ListingSearchProjectionCreateInput;
  update: Prisma.ListingSearchProjectionUpdateInput;
}

/**
 * Build the Prisma `upsert()` payload for a `listing_search_projection`
 * row. Pure: no DB, no Prisma client. The caller (lib/idx/sync.ts) passes
 * the result straight into `prisma.listingSearchProjection.upsert()`.
 *
 * `create` and `update` carry the same fields — every projection column
 * is fully derived from the source `Listing`, so an update cycle simply
 * overwrites every column. This guarantees no stale projection state
 * survives a Listing update.
 */
export function buildProjectionUpsertPayload(
  projection: ListingSearchProjectionRow,
): ListingSearchProjectionUpsertPayload {
  // The payload omits Prisma-managed fields (`id`, `created_at`,
  // `updated_at`) and the `listing` relation (write via the FK column).
  const data = {
    listing_id: projection.listing_id,
    listing_key: projection.listing_key,
    source_system: projection.source_system,
    mls_status: projection.mls_status,
    listing_type: projection.listing_type,
    property_type: projection.property_type,
    property_sub_type: projection.property_sub_type,
    borough: projection.borough,
    neighborhood: projection.neighborhood,
    postal_code: projection.postal_code,
    city: projection.city,
    state: projection.state,
    list_price: projection.list_price,
    bedrooms: projection.bedrooms,
    bathrooms: projection.bathrooms,
    living_area: projection.living_area,
    year_built: projection.year_built,
    latitude: projection.latitude,
    longitude: projection.longitude,
    is_commercial: projection.is_commercial,
    is_new_development: projection.is_new_development,
    is_exclusive: projection.is_exclusive,
    is_rental: projection.is_rental,
    rls_eligible: projection.rls_eligible,
    idx_display_yn: projection.idx_display_yn,
    internet_entire_listing_display_yn: projection.internet_entire_listing_display_yn,
    internet_address_display_yn: projection.internet_address_display_yn,
    participant_only_yn: projection.participant_only_yn,
    searchable_text: projection.searchable_text,
    amenity_keys: jsonInput(projection.amenity_keys),
    feature_flags: jsonInput(projection.feature_flags),
    modified_at: projection.modified_at,
  };

  return {
    where: { listing_id: projection.listing_id },
    // Cast to Prisma input types — the relation is satisfied by the
    // `listing_id` scalar FK; Prisma accepts that without requiring a
    // nested `listing.connect`.
    create: data as unknown as Prisma.ListingSearchProjectionCreateInput,
    update: data as unknown as Prisma.ListingSearchProjectionUpdateInput,
  };
}
