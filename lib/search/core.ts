import type { Prisma } from "@prisma/client";
import { canDisplayListingAddress } from "@/lib/search/listing-access-decision";
import {
  composeDbPublicMedia,
  type DbMediaComposition,
} from "@/lib/media/db-media-composition";
import type { ListingMediaTableRow } from "@/lib/media/listing-media-resolver";
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
 * It is NOT re-sourced from canonical `listing_media` HERE, because that would
 * add relational reads to the cron path — the one that provably discards the
 * value. Consumers that genuinely need media call {@link hydrateSearchListingMedia}
 * instead: one batched query, opt-in, composed through `composeDbPublicMedia`.
 * Never re-add the raw `media` JSON to this select — an unresolved blob lets
 * `media[0]` hero a FloorPlan (lib/media/listing-media-resolver.ts:7-31).
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
    // `media` is NOT emitted here. The base select carries no media at all, so
    // this serializer cannot invent one. Callers that must preserve the `media`
    // key in their response contract merge it in from
    // {@link hydrateSearchListingMedia}.
    modification_timestamp: listing.modification_timestamp,
  };
}

/** One listing's canonically-composed public media. */
export interface HydratedListingMedia {
  media: DbMediaComposition["media"];
  photoCount: number;
}

/** The subset of Prisma this hydration needs — keeps callers mockable. */
type MediaHydrationDb = {
  listing: {
    findMany(args: Prisma.ListingFindManyArgs): Promise<unknown[]>;
  };
};

/**
 * OPT-IN canonical media for a page of search results.
 *
 * WHY THIS IS SEPARATE FROM THE SEARCH SELECT
 *
 * `POST /api/crm/saved-searches/[id]/execute` has always returned a `media` key
 * per listing, and an API contract is not ours to silently drop — "no
 * first-party caller" proves nothing about an older or external client. But the
 * OTHER consumer of the same select, the `/api/cron/search-alerts` cron,
 * provably discards media (`listingAlertEmail` has no image field). Putting
 * media back into `SEARCH_RESULT_LISTING_SELECT` would tax the cron for a value
 * only the execute route uses.
 *
 * So the contract is preserved where it exists and shed where it does not: one
 * BATCHED query over the whole page (never per-row — that would be an N+1),
 * called only by the route that owes the key.
 *
 * The composed value is canonical, not the legacy blob: relational rows first,
 * legacy JSON only where the resolver permits, photo-first ordering so a
 * FloorPlan can never lead. `hadRelationalRows` comes from the ALL-STATUS
 * `_count`, never `tableRows.length`, so an all-deleted listing cannot
 * resurrect deleted media (lib/media/db-media-composition.ts:55-67).
 *
 * @returns Map keyed by `listing_id`. A listing absent from the map has no
 *   composable media; callers should emit `[]` to keep the key's type stable.
 */
export async function hydrateSearchListingMedia(
  db: MediaHydrationDb,
  listingIds: readonly string[],
): Promise<Map<string, HydratedListingMedia>> {
  const out = new Map<string, HydratedListingMedia>();
  const ids = [...new Set(listingIds)].filter((id) => typeof id === "string" && id !== "");
  if (ids.length === 0) return out;

  const rows = (await db.listing.findMany({
    where: { listing_id: { in: ids } },
    select: {
      listing_id: true,
      rls_eligible: true,
      // Legacy JSON stays the resolver's FALLBACK input only — never the
      // authority. The 97-listing never-imported residual still depends on it.
      media: true,
      listing_media: {
        where: { status: "active" },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          media_key: true,
          media_url_original: true,
          media_url_cached: true,
          media_type: true,
          media_category: true,
          order: true,
          preferred_photo_yn: true,
          status: true,
          r2_key: true,
        },
      },
      _count: { select: { listing_media: true } },
    },
  })) as unknown as Array<{
    listing_id: string;
    rls_eligible: boolean | null;
    media: unknown;
    listing_media: ListingMediaTableRow[];
    _count?: { listing_media?: number };
  }>;

  for (const row of rows) {
    const composed = composeDbPublicMedia({
      listingId: row.listing_id,
      rlsEligible: row.rls_eligible ?? undefined,
      tableRows: Array.isArray(row.listing_media) ? row.listing_media : [],
      legacyMedia: Array.isArray(row.media) ? (row.media as unknown[]) : [],
      hadRelationalRows:
        typeof row._count?.listing_media === "number" ? row._count.listing_media > 0 : undefined,
    });
    out.set(row.listing_id, { media: composed.media, photoCount: composed.photoCount });
  }
  return out;
}
