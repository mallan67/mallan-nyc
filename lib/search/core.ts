import type { Prisma } from "@prisma/client";
import { canDisplayListingAddress } from "@/lib/search/listing-access-decision";
import { criteriaToPrismaWhere, type SearchCriteria } from "@/lib/search/criteria-to-prisma";

export const SEARCH_RESULT_LISTING_SELECT = {
  id: true,
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
  address: true,
  media: true,
  modification_timestamp: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
} satisfies Prisma.ListingSelect;

export type SearchResultListing = Prisma.ListingGetPayload<{
  select: typeof SEARCH_RESULT_LISTING_SELECT;
}>;

export interface SearchRunOptions {
  limit?: number;
  offset?: number;
  modifiedSince?: Date;
}

export interface SearchRunResult {
  listings: SearchResultListing[];
  total: number;
  limit: number;
  offset: number;
  where: Prisma.ListingWhereInput;
}

type SearchDb = {
  listing: {
    findMany(args: Prisma.ListingFindManyArgs): Promise<unknown[]>;
    count(args: Prisma.ListingCountArgs): Promise<number>;
  };
};

function clampLimit(limit: unknown): number {
  return typeof limit === "number" && Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), 100))
    : 100;
}

function normalizeOffset(offset: unknown): number {
  return typeof offset === "number" && Number.isFinite(offset)
    ? Math.max(0, Math.trunc(offset))
    : 0;
}

export async function runListingSearch(
  db: SearchDb,
  criteria: SearchCriteria,
  options: SearchRunOptions = {},
): Promise<SearchRunResult> {
  const limit = clampLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const where = criteriaToPrismaWhere(criteria, { modifiedSince: options.modifiedSince });

  const [listings, total] = await Promise.all([
    db.listing.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { modification_timestamp: "desc" },
      select: SEARCH_RESULT_LISTING_SELECT,
    }),
    db.listing.count({ where }),
  ]);

  return {
    listings: listings as SearchResultListing[],
    total,
    limit,
    offset,
    where,
  };
}

function decimalToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function objectAddress(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sanitizeSearchAddress(listing: {
  address: unknown;
  neighborhood?: string | null;
  borough?: string | null;
  internet_entire_listing_display_yn?: unknown;
  internet_address_display_yn?: unknown;
}): Record<string, unknown> {
  const address = objectAddress(listing.address);
  const neighborhood = String(address.neighborhood || address.Neighborhood || listing.neighborhood || "");
  const city = String(address.city || address.City || listing.borough || "New York");

  if (!canDisplayListingAddress(listing)) {
    return {
      neighborhood: neighborhood || null,
      city,
      suppressed: true,
      label: neighborhood
        ? `${neighborhood}, ${city} (Address Available on Request)`
        : "Address Available on Request",
    };
  }

  return address;
}

export function formatSearchAlertAddress(listing: {
  address: unknown;
  neighborhood?: string | null;
  borough?: string | null;
  internet_entire_listing_display_yn?: unknown;
  internet_address_display_yn?: unknown;
}): string {
  const address = sanitizeSearchAddress(listing);
  if (address.suppressed) return String(address.label);

  const full = address.full || address.Full || address.unparsedAddress || address.UnparsedAddress;
  if (typeof full === "string" && full.trim() !== "") return full.trim();

  const street = `${address.streetNumber || address.StreetNumber || ""} ${address.streetName || address.StreetName || ""}`.trim();
  const city = address.city || address.City || "New York";
  return street ? `${street}, ${city}` : "Address Available on Request";
}

export function serializeSearchListing(listing: SearchResultListing): Record<string, unknown> {
  return {
    id: listing.id.toString(),
    listing_id: listing.listing_id,
    status: listing.status,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    property_sub_type: listing.property_sub_type,
    list_price: decimalToString(listing.list_price),
    bedrooms_total: listing.bedrooms_total,
    bathrooms_full: listing.bathrooms_full,
    bathrooms_half: listing.bathrooms_half,
    living_area: decimalToString(listing.living_area),
    borough: listing.borough,
    neighborhood: listing.neighborhood,
    address: sanitizeSearchAddress(listing),
    media: listing.media,
    modification_timestamp: listing.modification_timestamp,
  };
}
