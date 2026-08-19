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
import { isMallanExclusiveListing } from "@/lib/listings/exclusive-agent-assignment";
// The canonical all-status fallback policy. Imported rather than reimplemented
// so the projection cannot hold a second opinion about when the legacy media
// JSON may still be read — see extractProjectionFeatureFlags.
import { shouldFallbackToLegacyMedia } from "@/lib/media/listing-media-resolver";
import { materialValuesEqual } from "@/lib/idx/write-suppression";
import {
  amenityMatches,
  isFurnished,
  satisfiedAmenityKeys,
  OWNERSHIP_FLAG_BY_COMMON_INTEREST,
} from "@/lib/search/canonical/amenity-match";

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

// NEW DEVELOPMENT IS A PROVIDER BOOLEAN, NOT A SUB-TYPE.
//
// This was `new Set(["NewConstruction", "New Construction"])` matched against
// `PropertySubType`. NEITHER string is a member of the live `PropertySubType`
// enum, so the flag was false for every listing ever projected, and
// `sort=new-development` returned nothing.
//
// Live-verified 2026-08-19: `NewConstructionYN` is a Boolean Property field,
// `$filter` SUPPORTED, true on 950 live Active listings.

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
  /**
   * The untouched provider payload. Required alongside `features` because
   * completeness differs per field — `Furnished` is present on 3,018 rows in
   * `features` but 8,156 in `raw_data`, and `NewConstructionYN` is carried here.
   */
  raw_data?: Record<string, unknown> | null;
  media?: unknown[] | Record<string, unknown> | null;

  /**
   * CANONICAL media input — the distinct `media_type` values of this
   * listing's ACTIVE `listing_media` rows (prisma/schema.prisma:2367).
   *
   * Supersedes the legacy `media` JSON for the has_floorplan / has_video /
   * has_virtual_tour flags: 6,978 displayable listings already carry
   * canonical rows while their `Listing.media` JSON is empty, so the legacy
   * derivation reports those listings as having no floorplan/video/tour.
   *
   * OPTIONAL on purpose — callers that have not been migrated (and every
   * pure fixture) leave it undefined and keep the legacy JSON behavior.
   * See `extractProjectionFeatureFlags` for the precedence rule.
   */
  mediaTypes?: readonly string[] | null;
  /**
   * ALL-STATUS existence signal for `listing_media` — `_count.listing_media > 0`.
   *
   * REQUIRED to interpret an EMPTY `mediaTypes`, which is ambiguous on its own:
   *   true      — rows exist(ed); zero ACTIVE means authoritative deletion
   *   false     — never imported; the legacy JSON is still the only source
   *   undefined — UNKNOWN; fail closed via shouldFallbackToLegacyMedia
   *
   * Never derive this from `mediaTypes.length` — that query selects ACTIVE rows
   * only, so an all-deleted listing would read as "never imported" and resurrect
   * stale flags. Same rule and same reason as
   * `DbMediaCompositionInput.hadRelationalRows` (lib/media/db-media-composition.ts:55-67).
   */
  hadRelationalRows?: boolean;
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

/**
 * Fold a `listing_media.media_type` value to a comparison token. Live
 * production values are exactly Photo | FloorPlan | VirtualTour | Video
 * (DB census 2026-08-13), all written by `classifyTrestleMediaCategory`
 * (lib/media/media-sync-service.ts:142). Dropping case and separators also
 * tolerates the "Floor Plan" / "Virtual Tour" spellings that same classifier
 * already accepts on input, so a future feed variant cannot silently clear a
 * flag.
 */
function normalizeMediaTypeToken(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  // Delegates to the ONE canonical matcher (lib/search/canonical/amenity-match).
  // This function previously carried its own substring implementation, which
  // could not express a boolean provider field at all — so `fireplace` and
  // `garage`, both provider BOOLEANS, could never be derived here regardless of
  // what the amenity map said.
  const keys = satisfiedAmenityKeys(
    listing.features as Record<string, unknown> | null | undefined,
    listing.raw_data as Record<string, unknown> | null | undefined,
  );
  return keys.length > 0 ? keys : null;
}

/**
 * Boolean flags about the listing record itself — distinct from amenity
 * keys (which describe building/unit attributes). Examples:
 *   - has_floorplan / has_video / has_virtual_tour from the canonical
 *     `listing_media` rows (`mediaTypes`), else the legacy `media` JSON
 *   - is_furnished / is_pet_friendly from features.Furnished/PetsAllowed
 *
 * MEDIA PRECEDENCE — the same three-way rule the DB media composer uses
 * (`resolveDbListingMedia` / `shouldFallbackToLegacyMedia`), not a second
 * opinion about what "no media" means:
 *
 *   1. `mediaTypes` non-empty            -> canonical rows win outright.
 *   2. `mediaTypes` empty, rows EXIST(ed) -> authoritative deletion; flags false.
 *   3. `mediaTypes` empty, NEVER imported -> the legacy JSON is still the only
 *                                            source; fall back to it.
 *   4. `mediaTypes` absent (un-migrated caller) -> legacy derivation, verbatim.
 *
 * Case 3 is not hypothetical. A read-only production census (2026-08-13) found
 * 97 displayable listings with legacy media JSON and ZERO `listing_media` rows,
 * every one of them carrying a source PhotosChangeTimestamp BELOW the live media
 * cursor — so the forward-only media lane can never import them
 * (docs/audits/listing-media-reader-ownership-2026-08-13.md §4.1). Treating
 * their empty canonical set as authoritative would silently clear
 * has_floorplan/has_video/has_virtual_tour for that whole residual class.
 * The distinction requires the ALL-STATUS signal — `mediaTypes.length` cannot
 * carry it, because that query selects ACTIVE rows only.
 *
 * Returns null when neither features nor any media input is populated.
 */
export function extractProjectionFeatureFlags(listing: ListingProjectionSource): Record<string, boolean> | null {
  const features = listing.features as Record<string, unknown> | null | undefined;
  const canonicalMediaTypes = listing.mediaTypes;
  const mediaRaw = listing.media;
  const flags: Record<string, boolean> = {};

  const hasCanonicalInput = canonicalMediaTypes !== undefined && canonicalMediaTypes !== null;
  // An EMPTY canonical set only settles the question when we can also prove rows
  // existed. Otherwise defer to the canonical fallback policy, which is
  // provenance-aware: third-party listings may use their Cotality-sourced JSON,
  // Mallan-owned media falls back ONLY when provably never-imported (an unknown
  // signal fails closed rather than resurrecting deleted Mallan photos).
  const canonicalIsAuthoritative =
    hasCanonicalInput &&
    (canonicalMediaTypes!.length > 0 ||
      // ALL-DELETED is authoritative for FLAGS even on a third-party listing.
      // This is the one place the flag rule is deliberately STRICTER than
      // shouldFallbackToLegacyMedia: that helper governs which photos to SHOW,
      // where falling back to Cotality-sourced JSON is harmless, whereas
      // has_floorplan/has_video/has_virtual_tour are SEARCH FACETS. A listing
      // whose media rows were all tombstoned genuinely has no floor plan, and
      // advertising one via a stale JSON would surface it under a filter it no
      // longer satisfies.
      listing.hadRelationalRows === true ||
      // NEVER-IMPORTED / UNKNOWN: defer to the canonical provenance policy —
      // third-party residuals keep their Cotality-sourced JSON, Mallan-owned
      // media fails closed rather than resurrecting agent-deleted photos.
      !shouldFallbackToLegacyMedia(listing.hadRelationalRows, {
        listingId: listing.listing_id,
        rlsEligible: listing.rls_eligible ?? undefined,
      }));

  if (canonicalIsAuthoritative) {
    const present = new Set(canonicalMediaTypes!.map(normalizeMediaTypeToken));
    flags.has_floorplan = present.has("floorplan");
    flags.has_video = present.has("video");
    flags.has_virtual_tour = present.has("virtualtour");
  } else if (isMediaArray(mediaRaw)) {
    // Legacy `Listing.media` JSON path — retained verbatim (including the
    // else-if category chain) so un-migrated callers see byte-identical flags.
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

  // Provider payloads are MERGED because completeness differs per field:
  // `Furnished` is present on 3,018 rows in `features` but 8,156 in `raw_data`.
  // Reading only `features` silently loses two thirds of the population.
  const rawData = (listing.raw_data as Record<string, unknown> | null | undefined) ?? null;
  const payload: Record<string, unknown> = { ...(rawData ?? {}), ...(features ?? {}) };

  if (Object.keys(payload).length > 0) {
    // FIVE live members, not a boolean: Furnished 106 · Unfurnished 2,876 ·
    // Negotiable 12 · Partially 4 · FurnishedOrUnfurnished 0.
    flags.is_furnished = isFurnished(payload.Furnished);

    // Exact TOKEN match. The previous substring test treated "BuildingYes,No"
    // — building permits pets, unit does NOT — inconsistently, and matching
    // "Yes" as a substring also hits "BuildingYes".
    flags.is_pet_friendly = amenityMatches("pet-friendly", payload);

    // `GarageYN` is true on 2,630 live Active rows, whereas `ParkingFeatures`
    // carries a Garage token on only 597 — the field is sparsely populated.
    flags.has_garage = amenityMatches("garage", payload);

    // NYC carries ownership in `CommonInterest`, NOT `PropertySubType` (where
    // Condominium/StockCooperative/Townhouse are all zero).
    const ownershipFlag = OWNERSHIP_FLAG_BY_COMMON_INTEREST[String(payload.CommonInterest ?? "")];
    if (ownershipFlag) flags[ownershipFlag] = true;
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

  const rawData = (listing.raw_data as Record<string, unknown> | null | undefined) ?? {};
  const propertySubType = stringFrom(listing.property_sub_type);
  const isCommercial =
    !!stringFrom(listing.commercial_sub_type) ||
    (propertySubType !== null && COMMERCIAL_SUB_TYPES.has(propertySubType));
  const isNewDevelopment =
    features.NewConstructionYN === true ||
    features.NewConstructionYN === "true" ||
    rawData.NewConstructionYN === true ||
    rawData.NewConstructionYN === "true";
  // F13: a Mallan exclusive is identified by the SL-/RL- listing_id prefix OR
  // rls_eligible === false (website-only) — NEVER by agent_id, which
  // syncAgentHistory also stamps onto third-party IDX rows. Use the canonical
  // helper so this derivation cannot drift from the exclusive-attribution path.
  const isExclusive = isMallanExclusiveListing({
    listing_id: listing.listing_id,
    rls_eligible: listing.rls_eligible,
  });
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

// ── Phase 3 write-suppression: material projection identity ───────────

/**
 * Select covering EVERY material projection column — i.e. every column the
 * upsert payload writes. Used by writers to read the existing row for the
 * pre-write comparison. Prisma-managed `id` / `created_at` / `updated_at`
 * are excluded (never written by the payload, never material).
 */
export const PROJECTION_MATERIAL_SELECT = {
  listing_id: true,
  listing_key: true,
  source_system: true,
  mls_status: true,
  listing_type: true,
  property_type: true,
  property_sub_type: true,
  borough: true,
  neighborhood: true,
  postal_code: true,
  city: true,
  state: true,
  list_price: true,
  bedrooms: true,
  bathrooms: true,
  living_area: true,
  year_built: true,
  latitude: true,
  longitude: true,
  is_commercial: true,
  is_new_development: true,
  is_exclusive: true,
  is_rental: true,
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  participant_only_yn: true,
  searchable_text: true,
  amenity_keys: true,
  feature_flags: true,
  modified_at: true,
} as const;

/**
 * True when the freshly-built projection row is materially identical to the
 * existing DB row (selected via PROJECTION_MATERIAL_SELECT). The comparison
 * covers the COMPLETE material projection — price, status, geography, search
 * text, amenity keys, feature flags, display gates, and the source
 * modification clock (`modified_at`) — so ANY source-derived change writes.
 *
 * Fail-closed: a missing existing row, a column absent from the selection,
 * or a comparison error all return false (the upsert proceeds).
 */
export function projectionRowMateriallyEqual(
  existing: Record<string, unknown> | null | undefined,
  next: ListingSearchProjectionRow,
): boolean {
  if (!existing) return false;
  try {
    for (const key of Object.keys(next) as (keyof ListingSearchProjectionRow)[]) {
      if (!(key in existing)) return false;
      if (!materialValuesEqual(next[key], existing[key as string])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Projection columns that carry SOURCE PROVENANCE only — no public search
 * surface reads them as content. `modified_at` mirrors the Trestle
 * ModificationTimestamp; its consumers (verified 2026-07-24) are the
 * search-alerts `modifiedSince` filter and `modified_at desc` recency
 * ordering (lib/search/core.ts, lib/search/criteria-to-prisma.ts) — both of
 * which SHOULD ignore a revision bump with zero visible changes, otherwise
 * they fire false "updated listing" signals.
 */
export const PROJECTION_PROVENANCE_ONLY_FIELDS: ReadonlySet<string> = new Set([
  "modified_at",
]);

/**
 * Scope D (Maya directive 2026-07-24): like `projectionRowMateriallyEqual`
 * but IGNORING the provenance-only clock. When this returns true the caller
 * skips the projection upsert entirely — the source revision timestamp stays
 * on the LISTING row for provenance, and no building/search cache
 * invalidation fires for a change nobody can see. Any search-visible delta
 * (price, status, geography, text, amenities, display gates) still returns
 * false and the full-row upsert proceeds (which also refreshes modified_at).
 *
 * Fail-closed exactly like the material comparator: missing row, missing
 * column, or comparison error → NOT equal → write.
 */
export function projectionRowSearchVisiblyEqual(
  existing: Record<string, unknown> | null | undefined,
  next: ListingSearchProjectionRow,
): boolean {
  if (!existing) return false;
  try {
    for (const key of Object.keys(next) as (keyof ListingSearchProjectionRow)[]) {
      if (PROJECTION_PROVENANCE_ONLY_FIELDS.has(key as string)) continue;
      if (!(key in existing)) return false;
      if (!materialValuesEqual(next[key], existing[key as string])) return false;
    }
    return true;
  } catch {
    return false;
  }
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

// ── H1 Tier-1 dual-write helper ────────────────────────────────────────

/**
 * Minimal PrismaClient surface this helper needs. Defined as a structural
 * type rather than `import { PrismaClient }` so callers passing the default
 * exported singleton (`@/lib/prisma`) work without a generic import dance,
 * and so the helper can be unit-tested with a small in-memory mock.
 */
export interface DualWriteProjectionPrisma {
  listing: {
    findUnique: (args: {
      where: { listing_id: string };
      // Values are `true` for scalars plus a nested-relation form, so the
      // canonical `listing_media` media types come back on the SAME
      // round-trip as the listing row (see dualWriteProjectionForListingId).
      select: Record<
        string,
        | true
        | {
            where?: Record<string, unknown>;
            select?: Record<string, true>;
            distinct?: readonly string[];
          }
      >;
    }) => Promise<unknown>;
  };
  listingSearchProjection: {
    findUnique: (args: {
      where: { listing_id: string };
      select?: Record<string, true>;
    }) => Promise<unknown>;
    upsert: (args: ListingSearchProjectionUpsertPayload) => Promise<unknown>;
  };
}

/**
 * Idempotent dual-write of `listing_search_projection` from an existing
 * `listings` row.
 *
 * Use this AFTER any non-sync `prisma.listing.create` / `prisma.listing.upsert`
 * that doesn't already share the dual-write pattern in `lib/idx/sync.ts`.
 *
 * Behavior:
 *   - Reads the listing row by `listing_id`, builds the projection via the
 *     canonical `buildListingSearchProjectionFromListing` + `buildProjectionUpsertPayload`,
 *     upserts.
 *   - Idempotent: re-runs against an existing projection row are safe (upsert).
 *   - Silently no-ops if the listing was deleted between the caller's write
 *     and this call (returns without throwing).
 *   - Errors are NOT swallowed — callers wrap with try/catch if projection-
 *     write failure should not block the parent operation. Matches the same
 *     per-row failure semantics as `lib/idx/sync.ts`.
 *
 * H1 Tier-1 fix — closes the dual-write contract on 5 non-sync writers:
 *   - app/api/crm/convert/route.ts                (Lead → Listing convert)
 *   - app/api/cron/feed-reconcile/route.ts        (orphan-recovery cron)
 *   - app/api/idx/ensure-listing/route.ts         (on-demand listing create)
 *   - app/api/crm/listings/reset-sync/route.ts    (broker re-sync)
 *   - scripts/import-closed-from-trestle.ts       (closed-listing import)
 *
 * Uses the same canonical projection shape as `npm run ops:projection-backfill`
 * — never invents partial projection rows.
 */
export async function dualWriteProjectionForListingId(
  prisma: DualWriteProjectionPrisma,
  listingId: string,
): Promise<void> {
  const listing = (await prisma.listing.findUnique({
    where: { listing_id: listingId },
    select: {
      listing_id: true,
      status: true,
      listing_type: true,
      property_type: true,
      property_sub_type: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      bathrooms_half: true,
      living_area: true,
      borough: true,
      neighborhood: true,
      city: true,
      postal_code: true,
      rls_eligible: true,
      commercial_sub_type: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      participant_only: true,
      agent_id: true,
      modification_timestamp: true,
      address: true,
      features: true,
      // Legacy JSON — still selected as the fallback for rows the media sync
      // has not reached (extractProjectionFeatureFlags precedence rule).
      media: true,
      // Canonical media source (prisma/schema.prisma:2367). Nested on the
      // EXISTING findUnique so migrating the feature flags costs zero extra
      // round-trips; `distinct` keeps the payload at <=4 rows per listing.
      listing_media: {
        where: { status: "active" },
        select: { media_type: true },
        distinct: ["media_type"],
      },
      // ALL-STATUS existence — the only thing that can tell "never imported"
      // apart from "every row deleted" when the active set is empty. Deliberately
      // unfiltered; filtering it would make it agree with `listing_media` above
      // and answer nothing.
      _count: { select: { listing_media: true } },
    },
  })) as Record<string, unknown> | null;

  if (!listing) return;

  const input: ListingProjectionSource = {
    listing_id: listing.listing_id as string,
    status: (listing.status as string | null | undefined) ?? null,
    listing_type: (listing.listing_type as string | null | undefined) ?? null,
    property_type: (listing.property_type as string | null | undefined) ?? null,
    property_sub_type: (listing.property_sub_type as string | null | undefined) ?? null,
    list_price: (listing.list_price as ListingProjectionSource["list_price"]) ?? null,
    bedrooms_total: (listing.bedrooms_total as number | null | undefined) ?? null,
    bathrooms_full: (listing.bathrooms_full as number | null | undefined) ?? null,
    bathrooms_half: (listing.bathrooms_half as number | null | undefined) ?? null,
    living_area: (listing.living_area as ListingProjectionSource["living_area"]) ?? null,
    borough: (listing.borough as string | null | undefined) ?? null,
    neighborhood: (listing.neighborhood as string | null | undefined) ?? null,
    city: (listing.city as string | null | undefined) ?? null,
    postal_code: (listing.postal_code as string | null | undefined) ?? null,
    rls_eligible: (listing.rls_eligible as boolean | null | undefined) ?? null,
    commercial_sub_type: (listing.commercial_sub_type as string | null | undefined) ?? null,
    idx_display_yn: (listing.idx_display_yn as boolean | null | undefined) ?? null,
    internet_entire_listing_display_yn:
      (listing.internet_entire_listing_display_yn as boolean | null | undefined) ?? null,
    internet_address_display_yn:
      (listing.internet_address_display_yn as boolean | null | undefined) ?? null,
    participant_only: (listing.participant_only as boolean | null | undefined) ?? null,
    agent_id: (listing.agent_id as bigint | number | null | undefined) ?? null,
    modification_timestamp:
      (listing.modification_timestamp as Date | string | null | undefined) ?? null,
    address: (listing.address as Record<string, unknown> | null | undefined) ?? {},
    features: (listing.features as Record<string, unknown> | null | undefined) ?? {},
    media: Array.isArray(listing.media) ? (listing.media as unknown[]) : [],
    // undefined (NOT []) when the relation is absent from the result — an
    // absent relation means "not queried", which must keep the legacy JSON
    // fallback alive, whereas [] means "queried, zero active rows" and is
    // authoritative.
    mediaTypes: Array.isArray(listing.listing_media)
      ? (listing.listing_media as Array<Record<string, unknown>>).map((row) =>
          String(row?.media_type ?? ""),
        )
      : undefined,
    // undefined when _count is absent (un-migrated/partial mock) so the policy
    // fails closed rather than guessing. NEVER derived from listing_media.length
    // — that set is active-only.
    hadRelationalRows:
      typeof (listing._count as { listing_media?: number } | undefined)?.listing_media === "number"
        ? (listing._count as { listing_media: number }).listing_media > 0
        : undefined,
  };

  const projection = buildListingSearchProjectionFromListing(input);
  // Phase 3 write-suppression: compare the complete material projection
  // before writing — an unchanged projection performs ZERO writes. Missing
  // rows and comparison failures fall through to the upsert (fail-closed).
  const existingProjection = (await prisma.listingSearchProjection.findUnique({
    where: { listing_id: listingId },
    select: PROJECTION_MATERIAL_SELECT as unknown as Record<string, true>,
  })) as Record<string, unknown> | null;
  if (existingProjection && projectionRowMateriallyEqual(existingProjection, projection)) return;
  const payload = buildProjectionUpsertPayload(projection);
  await prisma.listingSearchProjection.upsert(payload);
}
