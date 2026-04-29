import type { Prisma } from "@prisma/client";
import { buildSearchDisplayWhere } from "@/lib/search/listing-access-decision";

export type SearchCriteria = Record<string, unknown>;

export interface SearchWhereOptions {
  modifiedSince?: Date;
}

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
