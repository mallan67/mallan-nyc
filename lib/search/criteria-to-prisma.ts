import type { Prisma } from "@prisma/client";
import {
  buildProjectionSearchWhere,
  buildSearchDisplayWhere,
} from "@/lib/search/listing-access-decision";
import { OWNERSHIP_FLAG_BY_COMMON_INTEREST } from "@/lib/search/canonical/amenity-match";
import { UNSUPPORTED_AMENITIES } from "@/lib/search/types";

/**
 * Normalised public ownership input → live `CommonInterest` member.
 *
 * Keyed on a normalised form (lowercase, non-alphanumerics stripped) because an
 * exact-case map silently returned ZERO results for `condo` — the casing the UI
 * actually sends — with no error.
 */
const OWNERSHIP_COMMON_INTEREST_BY_INPUT: Record<string, string> = {
  condo: "Condominium",
  condominium: "Condominium",
  coop: "StockCooperative",
  cooperative: "StockCooperative",
  stockcooperative: "StockCooperative",
  condop: "Condop",
  rental: "RentalBuilding",
  rentalbuilding: "RentalBuilding",
};

export type SearchCriteria = Record<string, unknown>;

export interface SearchWhereOptions {
  modifiedSince?: Date;
}

export function isPlainSearchCriteria(value: unknown): value is SearchCriteria {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const PROJECTION_SUPPORTED_CRITERIA_KEYS = new Set([
  "listing_type",
  "listingType",
  "type",
  "searchTab",
  "statuses",
  "status",
  "standardStatus",
  "standard_status",
  "property_type",
  "property_types",
  "propertyType",
  "propertyTypes",
  "borough",
  "neighborhoods",
  "neighborhood",
  "min_price",
  "max_price",
  "minPrice",
  "maxPrice",
  "priceMin",
  "priceMax",
  "min_beds",
  "max_beds",
  "minBeds",
  "maxBeds",
  "bedsMin",
  "bedsMax",
  "beds",
  "min_baths",
  "max_baths",
  "minBaths",
  "maxBaths",
  "bathsMin",
  "bathsMax",
  "baths",
  "min_sqft",
  "max_sqft",
  "minSqft",
  "maxSqft",
  "sqftMin",
  "sqftMax",
  // ── ALERT ELIGIBILITY IS DELIBERATELY NOT WIDENED YET ──────────────────
  // As of 2026-08-19 the projection ENGINE can filter ownershipTypes,
  // yearBuilt, furnished, pets, amenities, keywords, zipCodes and
  // newDevelopment — they are derived at projection build time into
  // `amenity_keys` / `feature_flags` / `year_built` / `is_new_development`
  // (see `appendProvenProjectionCriteria`), so they are replayable.
  //
  // They are NOT listed here because this set must stay byte-parity with the
  // frontend `_ALERT_SUPPORTED_KEYS` in `public/crm/js/search/saved-searches.js`,
  // and `public/crm/**` is a standing authorization hold. Promoting them is a
  // TWO-FILE change requiring that approval.
  //
  // Leaving them out fails SAFE: a Saved Search using one of these simply
  // cannot enable alerts, rather than enabling an alert whose replay would
  // disagree with the live search.
]);

const PROJECTION_RESERVED_CRITERIA_KEYS = new Set([
  "_search_tab",
]);

function first(criteria: SearchCriteria, keys: string[]): unknown {
  for (const key of keys) {
    const value = criteria[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

function normalizeListingType(value: unknown): "sale" | "rent" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "sale" || normalized === "buy") return "sale";
  if (normalized === "rent" || normalized === "rental" || normalized === "lease") return "rent";
  return undefined;
}

function normalizeStatusInput(criteria: SearchCriteria): unknown {
  return first(criteria, ["statuses", "status", "standardStatus", "standard_status"]);
}

function isSupportedStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSupportedProjectionCriterionValue(key: string, value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;

  if (key === "listing_type" || key === "listingType" || key === "type" || key === "searchTab") {
    return typeof value === "string";
  }

  if (key === "statuses" || key === "status" || key === "standardStatus" || key === "standard_status") {
    return typeof value === "string" || isSupportedStringArray(value);
  }

  if (
    key === "ownershipTypes" || key === "ownership_types" ||
    key === "amenities" || key === "keywords" ||
    key === "zipCodes" || key === "zip_codes" || key === "postal_code"
  ) {
    return typeof value === "string" || isSupportedStringArray(value);
  }

  if (key === "furnished" || key === "pets" || key === "newDevelopment" || key === "is_new_development") {
    return typeof value === "boolean" || value === "true" || value === "false";
  }

  if (key === "yearBuilt" || key === "year_built") {
    return value === "pre-war" || value === "post-war" || value === "any";
  }

  if (key === "property_type" || key === "property_types" || key === "propertyType" || key === "propertyTypes") {
    return typeof value === "string" || isSupportedStringArray(value);
  }

  if (key === "borough" || key === "neighborhood" || key === "searchTab") {
    return typeof value === "string";
  }

  if (
    key === "neighborhoods" ||
    key === "min_price" ||
    key === "max_price" ||
    key === "minPrice" ||
    key === "maxPrice" ||
    key === "priceMin" ||
    key === "priceMax" ||
    key === "min_beds" ||
    key === "max_beds" ||
    key === "minBeds" ||
    key === "maxBeds" ||
    key === "bedsMin" ||
    key === "bedsMax" ||
    key === "beds" ||
    key === "min_baths" ||
    key === "max_baths" ||
    key === "minBaths" ||
    key === "maxBaths" ||
    key === "bathsMin" ||
    key === "bathsMax" ||
    key === "baths" ||
    key === "min_sqft" ||
    key === "max_sqft" ||
    key === "minSqft" ||
    key === "maxSqft" ||
    key === "sqftMin" ||
    key === "sqftMax"
  ) {
    if (key === "neighborhoods") return typeof value === "string" || isSupportedStringArray(value);
    return typeof value === "string" || typeof value === "number";
  }

  return false;
}

export function getUnsupportedProjectionCriteria(criteria: SearchCriteria): string[] {
  const unsupported = new Set<string>();

  for (const [key, value] of Object.entries(criteria)) {
    if (PROJECTION_RESERVED_CRITERIA_KEYS.has(key)) continue;

    if (!PROJECTION_SUPPORTED_CRITERIA_KEYS.has(key)) {
      unsupported.add(key);
      continue;
    }

    if (!isSupportedProjectionCriterionValue(key, value)) {
      unsupported.add(key);
    }
  }

  return [...unsupported].sort();
}

// ── Saved-search alert gate (P0-3) ──────────────────────────────────────
//
// Saved searches can be created from the CRM live-Trestle search (Engine A).
// Alerts replay through the Postgres projection (Engine B) at
// app/api/cron/search-alerts/route.ts. Engine B's criteria vocabulary is a
// strict subset of Engine A's — see PROJECTION_SUPPORTED_CRITERIA_KEYS
// above. If a saved search includes any unsupported key, replaying it via
// Engine B would silently drop those constraints and email listings the
// agent never intended to send.
//
// This gate is the single source of truth used by:
//   - POST  /api/crm/saved-searches             (block enable on create)
//   - PATCH /api/crm/saved-searches/[id]        (block enable on update)
//   - GET   /api/cron/search-alerts             (skip unsupported searches)
//   - public/crm/js/search/saved-searches.js    (frontend mirror; refuse
//                                                to enable in the modal
//                                                + show inline reason)
//
// Returns a structured decision so callers can render the same reason
// everywhere. The reason carries the unsupported keys verbatim; the
// frontend uses them to render a tooltip ("Unsupported: address, keyword").
export interface AlertGateDecision {
  ok: boolean;
  /** Always present. Empty array when ok=true. */
  unsupported: string[];
  /**
   * Stable machine code for telemetry / error responses. One of:
   *   - "ok"                      — alerts may be enabled
   *   - "unsupported_criteria"    — criteria contains projection-unsupported keys
   */
  code: "ok" | "unsupported_criteria";
  /** Human-readable reason, suitable for surfacing in a tooltip or toast. */
  message: string;
}

export function canEnableAlertForCriteria(criteria: SearchCriteria): AlertGateDecision {
  const unsupported = getUnsupportedProjectionCriteria(criteria);
  if (unsupported.length === 0) {
    return { ok: true, unsupported: [], code: "ok", message: "Alerts can be enabled for this search." };
  }
  return {
    ok: false,
    unsupported,
    code: "unsupported_criteria",
    message:
      "Alerts cannot be enabled because this search uses criteria the alert engine does not support: " +
      unsupported.join(", ") +
      ". The live search will still honor these — but alerts replay through a stricter index.",
  };
}

export function criteriaToPrismaWhere(
  criteria: SearchCriteria,
  options: SearchWhereOptions = {},
): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    ...buildSearchDisplayWhere(normalizeStatusInput(criteria)),
  };

  const listingType = normalizeListingType(first(criteria, ["listing_type", "listingType", "type", "searchTab"]));
  if (listingType) where.listing_type = listingType;

  const propertyTypes = stringArray(first(criteria, ["property_type", "property_types", "propertyType", "propertyTypes"]));
  if (propertyTypes.length > 0) where.property_type = { in: propertyTypes };

  const borough = first(criteria, ["borough"]);
  if (typeof borough === "string" && borough.trim() !== "") {
    where.borough = borough.trim();
  }

  const neighborhoods = stringArray(first(criteria, ["neighborhoods", "neighborhood"]));
  if (neighborhoods.length > 0) where.neighborhood = { in: neighborhoods };

  const minPrice = numberValue(first(criteria, ["min_price", "minPrice", "priceMin"]));
  const maxPrice = numberValue(first(criteria, ["max_price", "maxPrice", "priceMax"]));
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.list_price = {};
    if (minPrice !== undefined) where.list_price.gte = minPrice;
    if (maxPrice !== undefined && maxPrice < 99999999) where.list_price.lte = maxPrice;
  }

  const minBeds = numberValue(first(criteria, ["min_beds", "minBeds", "beds", "bedsMin"]));
  const maxBeds = numberValue(first(criteria, ["max_beds", "maxBeds", "bedsMax"]));
  if (minBeds !== undefined || maxBeds !== undefined) {
    where.bedrooms_total = {};
    if (minBeds !== undefined) where.bedrooms_total.gte = minBeds;
    if (maxBeds !== undefined) where.bedrooms_total.lte = maxBeds;
  }

  const minBaths = numberValue(first(criteria, ["min_baths", "minBaths", "baths", "bathsMin"]));
  const maxBaths = numberValue(first(criteria, ["max_baths", "maxBaths", "bathsMax"]));
  if (minBaths !== undefined || maxBaths !== undefined) {
    where.bathrooms_full = {};
    if (minBaths !== undefined) where.bathrooms_full.gte = minBaths;
    if (maxBaths !== undefined) where.bathrooms_full.lte = maxBaths;
  }

  const minSqft = numberValue(first(criteria, ["min_sqft", "minSqft", "sqftMin"]));
  const maxSqft = numberValue(first(criteria, ["max_sqft", "maxSqft", "sqftMax"]));
  if (minSqft !== undefined || maxSqft !== undefined) {
    where.living_area = {};
    if (minSqft !== undefined) where.living_area.gte = minSqft;
    if (maxSqft !== undefined) where.living_area.lte = maxSqft;
  }

  if (options.modifiedSince) {
    where.modification_timestamp = { gte: options.modifiedSince };
  }

  return where;
}

/**
 * Projection analog of `criteriaToPrismaWhere`. Builds a where-clause for
 * the `listing_search_projection` table from the same `SearchCriteria`
 * shape that drives the Listing-backed path — same field aliases, same
 * normalizations (rental aliases, multi-status, neighborhood arrays,
 * price/beds/baths/sqft ranges), with field renames where the projection
 * differs from `Listing`:
 *
 *   - bedrooms_total  → bedrooms       (Float on projection, Int on Listing)
 *   - bathrooms_full  → bathrooms      (Float — half-bath threshold already
 *                                        baked in by the projection builder)
 *   - living_area      → living_area     (Float on projection, Decimal on Listing)
 *   - list_price       → list_price      (BigInt on projection, Decimal on Listing)
 *   - status           → mls_status      (mirrored)
 *   - modification_timestamp → modified_at
 *
 * The fail-closed gate filter (`PROJECTION_DISPLAY_GATE`) is included via
 * `buildProjectionSearchWhere` — that adds the projection's mirrored
 * gate columns AND the FK-relation filter for the Listing-only
 * `owner_opt_out` field (which the bounded PR 5A schema did not mirror).
 */

/** Truthy across the shapes criteria arrive in (JSON bool, form string). */
function booleanValue(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * The criteria PROVEN against live Cotality on 2026-08-19, expressed against
 * the projection's DERIVED columns rather than re-derived from provider JSON.
 *
 * This is the point of the read model. The public reader previously evaluated
 * these against `listings.raw_data` / `listings.features` while Saved Search
 * and the alert cron ran through the projection — two engines answering the
 * same user question from different sources, which is exactly the split this
 * consolidates. Deriving once at write time also means an amenity rule change
 * is a projection rebuild, not a silent divergence between callers.
 */
function appendProvenProjectionCriteria(
  where: Prisma.ListingSearchProjectionWhereInput,
  criteria: SearchCriteria,
): void {
  const and: Prisma.ListingSearchProjectionWhereInput[] = [];

  // ownershipTypes — NYC carries ownership in `CommonInterest`, NOT
  // `PropertySubType` (where Condominium/StockCooperative/Townhouse are all
  // ZERO live). The producer maps CommonInterest to a boolean feature flag.
  const ownership = stringArray(first(criteria, ["ownershipTypes", "ownership_types"]));
  if (ownership.length > 0) {
    const flags = [
      ...new Set(
        ownership
          .map((value) => OWNERSHIP_FLAG_BY_COMMON_INTEREST[
            OWNERSHIP_COMMON_INTEREST_BY_INPUT[value.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? ""
          ])
          .filter(Boolean),
      ),
    ];
    // Fail CLOSED — an ownership filter we cannot map must return nothing
    // rather than silently widening to the whole corpus.
    if (flags.length === 0) {
      and.push({ id: { in: [] } });
    } else {
      and.push({ OR: flags.map((flag) => ({ feature_flags: { path: [flag], equals: true } })) });
    }
  }

  // yearBuilt — pre-war <=1946 / post-war >=1947, on the promoted column.
  const yearBuilt = first(criteria, ["yearBuilt", "year_built"]);
  if (yearBuilt === "pre-war") and.push({ year_built: { lte: 1946 } });
  else if (yearBuilt === "post-war") and.push({ year_built: { gte: 1947 } });

  // furnished — five live members; `true` means strictly `Furnished` (106 live).
  if (booleanValue(first(criteria, ["furnished"]))) {
    and.push({ feature_flags: { path: ["is_furnished"], equals: true } });
  }

  // pets — unit-level affirmation only. "BuildingYes,No" means the building
  // permits pets and the UNIT does not; the producer resolves that by exact
  // token, so readers never re-parse the multi-value.
  if (booleanValue(first(criteria, ["pets"]))) {
    and.push({ feature_flags: { path: ["is_pet_friendly"], equals: true } });
  }

  // newDevelopment — `NewConstructionYN` (950 live Active), never a sub-type.
  if (booleanValue(first(criteria, ["newDevelopment", "is_new_development"]))) {
    and.push({ is_new_development: true });
  }

  // amenities — AND across requested keys, each matched against the derived
  // `amenity_keys` array. Unsupported amenities never widen the result.
  const amenities = stringArray(first(criteria, ["amenities"]));
  for (const amenity of amenities) {
    if (UNSUPPORTED_AMENITIES.has(amenity)) {
      and.push({ id: { in: [] } });
      continue;
    }
    and.push({ amenity_keys: { array_contains: [amenity] } });
  }

  // keywords — AND across case-insensitive matches on the projected text.
  // `searchable_text` is built from PUB-tier fields only; it must never be
  // extended to PrivateRemarks or ShowingInstructions (HID tier).
  for (const keyword of stringArray(first(criteria, ["keywords"]))) {
    and.push({ searchable_text: { contains: keyword, mode: "insensitive" } });
  }

  const zips = stringArray(first(criteria, ["zipCodes", "zip_codes", "postal_code"]));
  if (zips.length > 0) and.push({ postal_code: { in: zips } });

  if (and.length > 0) {
    where.AND = Array.isArray(where.AND) ? [...where.AND, ...and] : where.AND ? [where.AND, ...and] : and;
  }
}

export function criteriaToProjectionWhere(
  criteria: SearchCriteria,
  options: SearchWhereOptions = {},
): Prisma.ListingSearchProjectionWhereInput {
  const where: Prisma.ListingSearchProjectionWhereInput = {
    ...buildProjectionSearchWhere(normalizeStatusInput(criteria)),
  };

  const listingType = normalizeListingType(first(criteria, ["listing_type", "listingType", "type", "searchTab"]));
  if (listingType) where.listing_type = listingType;

  const propertyTypes = stringArray(first(criteria, ["property_type", "property_types", "propertyType", "propertyTypes"]));
  if (propertyTypes.length > 0) where.property_type = { in: propertyTypes };

  const borough = first(criteria, ["borough"]);
  if (typeof borough === "string" && borough.trim() !== "") {
    where.borough = borough.trim();
  }

  const neighborhoods = stringArray(first(criteria, ["neighborhoods", "neighborhood"]));
  if (neighborhoods.length > 0) where.neighborhood = { in: neighborhoods };

  const minPrice = numberValue(first(criteria, ["min_price", "minPrice", "priceMin"]));
  const maxPrice = numberValue(first(criteria, ["max_price", "maxPrice", "priceMax"]));
  if (minPrice !== undefined || maxPrice !== undefined) {
    // list_price is BigInt on the projection — Prisma accepts plain numbers
    // here and coerces; values fit within Number precision for NYC pricing.
    where.list_price = {};
    if (minPrice !== undefined) where.list_price.gte = minPrice;
    if (maxPrice !== undefined && maxPrice < 99999999) where.list_price.lte = maxPrice;
  }

  const minBeds = numberValue(first(criteria, ["min_beds", "minBeds", "beds", "bedsMin"]));
  const maxBeds = numberValue(first(criteria, ["max_beds", "maxBeds", "bedsMax"]));
  if (minBeds !== undefined || maxBeds !== undefined) {
    where.bedrooms = {};
    if (minBeds !== undefined) where.bedrooms.gte = minBeds;
    if (maxBeds !== undefined) where.bedrooms.lte = maxBeds;
  }

  const minBaths = numberValue(first(criteria, ["min_baths", "minBaths", "baths", "bathsMin"]));
  const maxBaths = numberValue(first(criteria, ["max_baths", "maxBaths", "bathsMax"]));
  if (minBaths !== undefined || maxBaths !== undefined) {
    // bathrooms on the projection is the fused `full + half * 0.5` value
    // — a 1.5-bath listing has bathrooms=1.5, not bathrooms_full=1.
    where.bathrooms = {};
    if (minBaths !== undefined) where.bathrooms.gte = minBaths;
    if (maxBaths !== undefined) where.bathrooms.lte = maxBaths;
  }

  const minSqft = numberValue(first(criteria, ["min_sqft", "minSqft", "sqftMin"]));
  const maxSqft = numberValue(first(criteria, ["max_sqft", "maxSqft", "sqftMax"]));
  if (minSqft !== undefined || maxSqft !== undefined) {
    where.living_area = {};
    if (minSqft !== undefined) where.living_area.gte = minSqft;
    if (maxSqft !== undefined) where.living_area.lte = maxSqft;
  }

  appendProvenProjectionCriteria(where, criteria);

  if (options.modifiedSince) {
    where.modified_at = { gte: options.modifiedSince };
  }

  return where;
}
