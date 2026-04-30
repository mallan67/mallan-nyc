import type { Prisma } from "@prisma/client";
import {
  buildProjectionSearchWhere,
  buildSearchDisplayWhere,
} from "@/lib/search/listing-access-decision";

export type SearchCriteria = Record<string, unknown>;

export interface SearchWhereOptions {
  modifiedSince?: Date;
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

  if (options.modifiedSince) {
    where.modified_at = { gte: options.modifiedSince };
  }

  return where;
}
