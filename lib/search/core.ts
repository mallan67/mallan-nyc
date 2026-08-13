import type { Prisma } from "@prisma/client";
import { canDisplayListingAddress } from "@/lib/search/listing-access-decision";
import {
  criteriaToProjectionWhere,
  type SearchCriteria,
} from "@/lib/search/criteria-to-prisma";

/**
 * Columns every saved-search consumer needs.
 *
 * `media` IS DELIBERATELY ABSENT (2026-08-13, CANONICAL-READER migration).
 * -----------------------------------------------------------------------
 * This select feeds exactly two entrypoints, and NEITHER consumes listing media:
 *
 *   • `/api/cron/search-alerts` (vercel.json `30 7 * * *`) — the alert formatter
 *     reads only address / list_price / bedrooms_total / bathrooms_full /
 *     listing_id, and `listingAlertEmail` (lib/email/templates.ts:119-157) has no
 *     image field at all. The media blob was hydrated and then discarded.
 *   • `POST /api/crm/saved-searches/[id]/execute` — serialized it into the JSON
 *     body, where no first-party caller reads it: `MallanAPI.savedSearches.execute`
 *     (public/crm/js/core/api-client.js:553) has ZERO call sites, and the CRM
 *     saved-search UI re-runs criteria through the live Trestle engine instead.
 *
 * So the column was a pure read cost: a full `media` JSONB blob for up to 100
 * rows per request (`clampLimit`), on every alert-cron iteration and every
 * execute call. Dropping it sheds that read outright.
 *
 * It is NOT re-sourced from canonical `listing_media`: doing so would ADD
 * relational reads to the cron path — the one that provably discards the value —
 * to keep a key nobody reads. If a future consumer genuinely needs media here,
 * add `listing_media` (active-only, ordered) PLUS the all-status
 * `_count.listing_media` and compose through `composeDbPublicMedia`. Never
 * re-add the raw `media` JSON: an unresolved blob lets `media[0]` hero a
 * FloorPlan (lib/media/listing-media-resolver.ts:7-31).
 */
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

// ── Projection-backed search (master refactor PR 5D — first reader) ──
//
// REMOVED 2026-08-13 — `runListingSearch(db, criteria, options)`, the
// `Listing`-backed sibling of `runProjectionListingSearch` below, together with
// its `SearchRunResult` / `SearchDb` types.
//
// PR 5D and PR 5E migrated its only two callers (the saved-search execute route
// and the search-alerts cron) to the projection runner. A repo-wide grep for
// `runListingSearch(` at removal time returned exactly ONE hit — the definition
// itself — so nothing executed it. It survived only as a second, drifting copy
// of the display-gate + pagination policy, and as the last caller of
// `criteriaToPrismaWhere` from this module.
//
// `criteriaToPrismaWhere` itself is NOT removed: it remains exported from
// lib/search/criteria-to-prisma.ts and is covered by its own tests.

export interface ProjectionSearchRunResult {
  listings: SearchResultListing[];
  total: number;
  limit: number;
  offset: number;
  projection_where: Prisma.ListingSearchProjectionWhereInput;
}

type ProjectionSearchDb = {
  listingSearchProjection: {
    findMany(args: Prisma.ListingSearchProjectionFindManyArgs): Promise<unknown[]>;
    count(args: Prisma.ListingSearchProjectionCountArgs): Promise<number>;
  };
};

/**
 * Projection-backed listing search. Uses `listing_search_projection` as
 * the index for facet filtering, then includes the related Listing row
 * for full SEARCH_RESULT_LISTING_SELECT data.
 *
 * Why this exists (PR 5D):
 *   - `listing_search_projection` is denormalized for fast filter scans.
 *     Bedrooms/bathrooms/list_price etc. are flat scalar columns; gate
 *     fields are mirrored; mls_status is mirrored from Listing.status.
 *   - Address suppression rules still flow from the included Listing's
 *     `internet_entire_listing_display_yn` + `internet_address_display_yn`
 *     through `sanitizeSearchAddress`, so response shape is identical to
 *     the Listing-backed path.
 *   - The fail-closed gate is split: 4 of 5 gates fire on the projection
 *     directly via PROJECTION_DISPLAY_GATE; `owner_opt_out` is the only
 *     gate not mirrored on the projection (PR 5A bounded scope) and is
 *     applied via the `listing` relation filter.
 *   - `modifiedSince` filters on the projection's `modified_at` column
 *     (mirrored from `listing.modification_timestamp` by the projection
 *     builder).
 *
 * Order: `modified_at desc` mirrors `listing.modification_timestamp desc`.
 * Same data, same column-by-column.
 */
export async function runProjectionListingSearch(
  db: ProjectionSearchDb,
  criteria: SearchCriteria,
  options: SearchRunOptions = {},
): Promise<ProjectionSearchRunResult> {
  const limit = clampLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const projection_where = criteriaToProjectionWhere(criteria, {
    modifiedSince: options.modifiedSince,
  });

  const [rows, total] = await Promise.all([
    db.listingSearchProjection.findMany({
      where: projection_where,
      take: limit,
      skip: offset,
      orderBy: [{ modified_at: "desc" }, { id: "asc" }],
      include: { listing: { select: SEARCH_RESULT_LISTING_SELECT } },
    }),
    db.listingSearchProjection.count({ where: projection_where }),
  ]);

  // Each projection row carries its included Listing under `.listing` (FK
  // relation declared on the projection model). The relation is mandatory
  // at the schema level (every projection row has a parent Listing because
  // ON DELETE CASCADE), but defensively filter null in case of in-flight
  // sync race conditions.
  const listings: SearchResultListing[] = [];
  for (const row of rows as Array<{ listing: SearchResultListing | null }>) {
    if (row.listing !== null) listings.push(row.listing);
  }

  return {
    listings,
    total,
    limit,
    offset,
    projection_where,
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
    // No `media` key — see SEARCH_RESULT_LISTING_SELECT above. Neither the
    // alert cron nor any caller of the execute route consumed it, and emitting
    // an unresolved legacy `Listing.media` blob would let a consumer hero a
    // FloorPlan via `media[0]`.
    modification_timestamp: listing.modification_timestamp,
  };
}
