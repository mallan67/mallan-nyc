// GET /api/idx/search
// Authenticated broker/agent Search against the live Cotality API (read-only).
// Provider facts come only from Cotality. REBNY/UCBA obligations are enforced
// separately at the compliance/output boundary.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { generateAttributionText } from "@/lib/idx/mapping";
import { logFetchAttempt } from "@/lib/idx/logger";
import {
  buildCrmIdxODataFilter,
  UnsupportedSearchCriterionError,
} from "@/lib/search/crm-idx-filter";
import { trestleExcludeMallanReturnCopiesClause } from "@/lib/listings/mallan-source-identity";
import {
  assembleFinalUniverse,
  CountMeaning,
  providerBudgetFor,
} from "@/lib/search/final-universe";
import {
  resolveSort,
  sortODataClause,
  UnsupportedSortError,
} from "@/lib/search/canonical/sort-contract";
import { UnknownPropertySubTypeError } from "@/lib/search/canonical/property-subtype-contract";
import { UnsupportedStatusCriterionError } from "@/lib/search/canonical/status-token-contract";
import { hasUsableListingIdentity, mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";



/**
 * Fields consumed by authenticated Search.
 *
 * Every entry must exist on live Cotality Property. `cotality:verify` checks this
 * list against live $metadata and fails on drift. ListingKey is load-bearing:
 * live Cotality declares it non-nullable and it is the provider identity used by
 * Media.ResourceRecordKey. ListingId and SourceSystemKey remain separate facts.
 */
export const SEARCH_SELECT_FIELDS = [
  // Provider identity / lineage
  "ListingKey", "ListingId", "SourceSystemKey",

  // Address / geography evidence
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish", "CrossStreet",
  "Latitude", "Longitude",

  // Classification
  "PropertyType", "PropertySubType", "CommonInterest", "OwnershipType", "NewConstructionYN",

  // Status & dates
  "StandardStatus", "MlsStatus", "ModificationTimestamp", "ListingContractDate",
  "OnMarketDate", "CloseDate", "ClosePrice", "ActivationDate",
  "DaysOnMarket", "CumulativeDaysOnMarket", "OriginalListPrice", "PreviousListPrice",
  "AvailabilityDate", "PriceChangeTimestamp",

  // Pricing / rental
  "ListPrice", "LeaseAmount", "LeaseAmountFrequency",

  // Rooms / size / building evidence
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger",
  "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
  "BuildingName", "NumberOfUnitsTotal", "BuildingKeyNumeric",

  // Carrying costs
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",

  // Other direct Property facts
  "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail", "ListAgentDirectPhone",
  "ListOfficeMlsId", "ListOfficeName",
  "PhotosCount", "VirtualTourURLBranded", "VirtualTourURLUnbranded",
  // GATE INPUT, not a display field. isParticipantOnly reads Permission for
  // "Private" and isOwnerOptOut reads it for an opt-out token. Without it in
  // this list the gate read undefined and returned displayable — output
  // indistinguishable from a gate that had checked and approved.
  //
  // Live 2026-08-26: multi-enum ListingPermission, 18 members, IDX alone on
  // 591,292 rows. Private and AgentOnly are currently ZERO, so this was a
  // LATENT fail-open rather than an active breach — but a count is a claim
  // about which rows a broker may see, and a gate that cannot read its own
  // input makes that claim unverifiable.
  "Permission",
  "PublicRemarks", "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  // All SIX canonical FARE fields. MoveInCostsAmount (Edm.Decimal 14,2) and
  // MoveInCostsComments (Edm.String 1024) were verified live 2026-08-26; both
  // were missing from this select, so the amount a tenant must pay and its
  // explanation were never fetched at all. Not rendered on the Agent grid —
  // carried for downstream tenant-facing outputs.
  "PetsAllowed", "Furnished", "MoveInCosts", "MoveInCostsAmount", "MoveInCostsComments",
  "OngoingFees", "TenantPays", "TenantPaysDescription",

  // Raw fields used by existing authenticated render/detail surfaces. Presence
  // in this list does NOT make them verified Search criteria.
  "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN", "DirectionFaces", "View", "OwnerPays",
  "ArchitecturalStyle", "StructureType", "BusinessType", "AccessibilityFeatures",
  "ExteriorFeatures", "BuildingFeatures", "LaundryFeatures", "SecurityFeatures", "PoolFeatures",
  "PetsAllowedYN", "AvailableLeaseType", "ExistingLeaseType", "ConstructionMaterials",
  "PatioAndPorchFeatures", "AssociationAmenities", "CurrentFinancing",
];

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * A live Cotality Property row must carry ListingKey. If it does not, the row is
 * an integrity failure and cannot enter any broker/client workflow.
 */
export function partitionByListingIdentity(
  records: readonly Record<string, unknown>[],
): { usable: Record<string, unknown>[]; identityless: number } {
  const usable: Record<string, unknown>[] = [];
  let identityless = 0;
  for (const record of records) {
    if (hasUsableListingIdentity(record)) usable.push(record);
    else identityless++;
  }
  return { usable, identityless };
}

export function searchIntegrityCounts(args: {
  providerRowsFetched: number;
  identityless: number;
  displayable: number;
}): {
  providerRowsFetched: number;
  identityFailures: number;
  distributionGateFailures: number;
  returnedRows: number;
} {
  const identified = args.providerRowsFetched - args.identityless;
  return {
    providerRowsFetched: args.providerRowsFetched,
    identityFailures: args.identityless,
    distributionGateFailures: Math.max(0, identified - args.displayable),
    returnedRows: args.displayable,
  };
}

export function idxSearchErrorResponse(error: unknown): {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
} {
  if (error instanceof UnsupportedSortError) {
    // Same canonical unsupported-criterion protocol: a named 400 the caller can
    // act on, never a silent substitution of a different order.
    return {
      status: 400,
      body: {
        error: "Unsupported sort.",
        code: "UNSUPPORTED_SORT",
        criterion: "sort",
        requested: error.requested,
        supported: [...error.supported],
        detail: error.message,
      },
    };
  }

  if (error instanceof UnsupportedSearchCriterionError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: error.criterion,
        unsupportedValues: [...error.unsupportedValues],
      },
    };
  }

  // Checkbox criteria use their own error type so the registry can carry a
  // per-value REASON. It joins the SAME canonical unsupported-criterion protocol
  // rather than inventing a second one — without this it fell through to a
  // generic 502 "Search failed", so the contract's promise to "fail locally by
  // criterion/value name" was not actually kept at the route boundary.
  if (error instanceof UnsupportedCheckboxCriterionError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: error.criterion,
        unsupportedValues: [...error.unsupportedValues],
        // The registry's reason travels with it: an unresolved value is a
        // different fact from an invalid one, and the broker needs to know which.
        detail: error.message,
      },
    };
  }

  if (error instanceof UnsupportedStatusCriterionError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: "status",
        unsupportedValues: [...error.unsupportedTokens],
      },
    };
  }

  if (error instanceof UnknownPropertySubTypeError) {
    return {
      status: 400,
      body: {
        error: "Unsupported search criterion.",
        code: "UNSUPPORTED_CRITERION",
        criterion: "propertySubType",
        unsupportedValues: [...error.unknownTokens],
      },
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  if (message.includes("429") || message.includes("rate limit")) {
    return {
      status: 503,
      body: { error: "Search temporarily unavailable. Please try again shortly." },
      headers: { "Retry-After": "30" },
    };
  }
  return { status: 502, body: { error: "Search failed. Please try again later." } };
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const logger = logFetchAttempt("/api/idx/search");

  try {
    const enabled = process.env.IDX_ENABLED === "true";
    if (!enabled || !hasCredentials()) {
      logger.complete("disabled", "Cotality Search not enabled or missing credentials");
      return NextResponse.json(
        { error: "Search not available", code: "IDX_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const params = req.nextUrl.searchParams;
    const limit = Math.min(Number(params.get("limit")) || 50, 500);
    const skip = Number(params.get("skip")) || 0;
    // PAGES OF THE FINAL UNIVERSE.
    //
    // `skip` is a PROVIDER offset and stays supported for existing callers, but
    // it cannot express a broker page: gated and deduped rows mean provider
    // offset 50 is not the 51st result. `page` is 1-based over the FINAL
    // universe, so page 2 begins at the 51st row a broker may actually see.
    // An explicit page always wins; otherwise it is derived from skip so the
    // legacy shape keeps working.
    const requestedPage = Number(params.get("page"));
    const page =
      Number.isFinite(requestedPage) && requestedPage >= 1
        ? Math.floor(requestedPage)
        : Math.floor(skip / Math.max(1, limit)) + 1;
    const sort = params.get("sort");

    // SponsorUnitYN is observed inside CustomProperty.CustomFields, not a live
    // Property field. This route does not currently expand a verified
    // CustomProperty contract, so pretending to support this filter would return
    // a page-local/false universe. Fail by name instead.
    if (params.get("sponsorUnit") === "true") {
      throw new UnsupportedSearchCriterionError("sponsorUnit", ["true"]);
    }

    const criteriaFilter = buildCrmIdxODataFilter(params);

    // MALLAN CANONICAL LISTING IDENTITY, applied at the provider boundary.
    //
    // A Mallan-authored listing and the Cotality return-copy of that same
    // listing are ONE canonical Mallan listing. The Mallan-authored row is the
    // canonical, editable identity; the provider copy is a COMPETING listing and
    // is suppressed — by office, and whether or not a matching twin is found.
    // Deduping on ListingKey could never express that: the two rows live in
    // different identity domains and do not share a provider key.
    //
    // Live 2026-08-26: ListOfficeMlsId eq '7041' -> 35 rows on the feed, 2 of
    // them Active. Applying the clause takes Active from 7,863 to 7,861, which
    // is exactly the two Mallan rows and confirms no null-office row is lost —
    // the clause is written as `(office eq null or office ne ...)` precisely
    // because a bare `ne` against null is not reliably inclusive in OData.
    //
    // The clause already existed and had no live-Trestle caller; every consumer
    // was Prisma-side. No new identity system, no schema.
    const returnCopyClause = trestleExcludeMallanReturnCopiesClause();
    const filter = returnCopyClause
      ? `(${criteriaFilter}) and ${returnCopyClause}`
      : criteriaFilter;

    // Sort is part of result identity, so it is a CLOSED CONTRACT rather than a
    // caller-authored $orderby with a silent default. `sort || "Modification-
    // Timestamp desc"` accepted any provider fragment a caller invented, offered
    // DaysOnMarket (which the licence suppresses for ordering, so it 400s the
    // whole search), and mapped "listed" onto ModificationTimestamp, which is a
    // different fact. resolveSort refuses an unrecognised value BY NAME, and
    // sortODataClause appends the ListingKey tie-break — without it, rows
    // sharing a price have no defined order and adjacent pages can repeat one
    // listing while dropping another.
    const resolvedSort = resolveSort(sort);
    const effectiveSort = sortODataClause(resolvedSort.key);
    // PAGE IS PART OF THE CACHE KEY.
    //
    // It was `...:${limit}:${skip}`, and once paging moved to final-universe
    // coordinates `skip` stopped varying between pages — so pages 2 and 3 were
    // served page 1's cached rows. The key must name every input that changes
    // the answer, and `exactCount` changes what `count` MEANS, so it is in here
    // too rather than letting a cheap lower-bound response satisfy a request
    // that asked for an exact total.
    const cacheKey = `idx:${filter}:${effectiveSort}:${limit}:${skip}:p${page}:x${params.get("exactCount") === "true" ? 1 : 0}`;
    const cached = getCached(cacheKey);
    if (cached) {
      logger.complete("success");
      return NextResponse.json(cached, { headers: { "Cache-Control": "private, no-store" } });
    }

    // THE FINAL SEARCH UNIVERSE, assembled by one owner.
    //
    // This used to fetch `limit` provider rows, drop the identityless and gated
    // ones, and return the survivors alongside `@odata.count` as `total`. Those
    // are two different universes. A live Manhattan Active-residential search
    // matches 4,622 listings; the broker received at most 200 rows and a count
    // that described neither what they were shown nor what actually matched.
    //
    // assembleFinalUniverse owns the chain — identity, then gates, then
    // canonical dedupe — and cuts the page from what SURVIVES, so a gated row
    // pulls the next survivor forward instead of leaving a hole in the page.
    // Property query only: media is loaded by the dedicated media path so this
    // request does not depend on an unverified $expand behavior.
    const universe = await assembleFinalUniverse<Record<string, unknown>>({
      fetchPage: async (providerSkip: number, top: number) => {
        const page = await fetchFromTrestle({
          filter,
          select: SEARCH_SELECT_FIELDS,
          top,
          // The engine walks the provider from the top and cuts the broker's
          // page out of what SURVIVES. Adding `skip` here as well would page
          // twice — once in provider coordinates and once in final-universe
          // coordinates — and silently step over rows. `skip` is honoured by
          // being folded into `page` above, not by offsetting the walk.
          skip: providerSkip,
          orderby: effectiveSort,
          maxTotal: top,
          count: true,
          expandMedia: false,
        });
        return {
          records: page.records,
          providerMatched: page.odataCount ?? null,
          // ABSENCE OF A nextLink, not `hasMore`.
          //
          // fetchFromTrestle returns `hasMore || allRecords.length >= maxTotal`,
          // and that second clause fires whenever a page happens to fill
          // exactly — 50 rows out of a 50-row universe reports "more". Using it
          // here would make an EXACT count almost unreachable. `nextLink` is
          // the provider's own statement that something follows, so its absence
          // is the only honest licence for EXACT.
          exhausted: !page.nextLink,
        };
      },
      // The identity predicate the rest of the codebase already uses, rather
      // than a second opinion about what a usable ListingKey is.
      identity: (record: Record<string, unknown>) =>
        hasUsableListingIdentity(record) ? String(record.ListingKey ?? "") : null,
      gate: (record: Record<string, unknown>) => checkDistributionGates(record),
      // PROVIDER-ROW identity only. Two Cotality rows carrying the same
      // ListingKey are one provider row and the repeat is dropped. This is not
      // Mallan canonical reconciliation, which is handled above by suppressing
      // Mallan-office return-copies at the provider boundary.
      providerRowKey: (record: Record<string, unknown>) => String(record.ListingKey ?? ""),
      page,
      pageSize: limit,
      // SCALED TO THE REQUESTED PAGE, not a flat ceiling.
      //
      // A fixed 1,000-row budget made deep pages unreachable: a universe of
      // 4,622 matches could honestly report "1000+ Results" and never return
      // result 1,001, because page 21 at 50 rows a page needs the 1,001st
      // survivor and the request was forbidden from reading that far. A read
      // budget may bound work per request; it may not become a hidden maximum
      // searchable inventory.
      providerBudget: providerBudgetFor(page, limit),
      // A page read, not a census. An exact count over 4,622 rows costs ~93
      // provider round trips, so it is opt-in per request rather than charged
      // to every search; `countMeaning` tells the caller which one they hold.
      exactCount: params.get("exactCount") === "true",
    });

    const identityless = universe.exclusions.identityless;
    if (identityless > 0) {
      console.error(`[Cotality Search] INTEGRITY: ${identityless} Property row(s) missing required ListingKey were excluded.`);
    }
    const gateBlockedReasons = universe.exclusions.gated;
    const result = {
      records: universe.rows,
      odataCount: universe.providerMatched ?? undefined,
      hasMore: universe.hasMore,
      totalFetched: universe.providerRowsRead,
    };

    // Search GET is read-only. It no longer mutates the Building workspace as a
    // side effect. Building projection/writes belong to their explicit writer.
    const listings = universe.rows.map((record, i) => mapTrestleToCrmListing(record, (page - 1) * limit + i));

    const response = {
      listings,
      // THE COUNT CARRIES ITS OWN MEANING.
      //
      // `total` and `totalCount` used to be `@odata.count` — the PROVIDER
      // matching universe, before identity, gates and dedupe removed rows. That
      // is a different set from the one the broker may see, so it could never
      // be a result count. They now describe the FINAL universe, and `count`
      // below says whether that number is exact or a declared floor. A bare
      // number cannot say which it is, and an approximation that looks exact is
      // the one answer this route will not give.
      total: universe.count,
      totalCount: universe.count,
      count: {
        value: universe.count,
        meaning: universe.countMeaning,
        isExact: universe.countMeaning === CountMeaning.EXACT,
        /** `@odata.count`. Kept, and kept SEPARATE. Never a result count. */
        providerMatched: universe.providerMatched,
        truncatedAtBudget: universe.truncatedAtBudget,
        /** NULL when the traversal stopped early — see totalPages below. */
        totalPagesKnown: universe.totalPages !== null,
        providerRowsRead: universe.providerRowsRead,
        excluded: universe.exclusions,
      },
      page,
      pageSize: limit,
      // NULL when the count is a LOWER BOUND. "1000+ Results / Page 1 of 5" is
      // a self-contradiction, so the last page number is withheld until an
      // exhausted traversal proves it and navigation stays open-ended.
      totalPages: universe.totalPages,
      hasMore: universe.hasMore,
      hasPrevious: universe.hasPrevious,
      skip,
      limit,
      attribution: generateAttributionText(),
      mediaMode: "lazy" as const,
      _meta: {
        source: "cotality",
        fetchedAt: new Date().toISOString(),
        filter,
        sort: effectiveSort,
        totalFromAPI: result.totalFetched,
        odataCount: result.odataCount,
        ...(() => {
          const c = searchIntegrityCounts({
            providerRowsFetched: result.totalFetched,
            identityless,
            displayable: universe.count,
          });
          return {
            gatedOut: c.distributionGateFailures,
            identityless: c.identityFailures,
            providerRowsFetched: c.providerRowsFetched,
          };
        })(),
        // Provider count is still pre-Mallan distribution gating. This remains a
        // named Step-6 integrity item; it is not disguised as a final count.
        totalIsPreFinalUniverse: true,
        mediaStrategy: "lazy" as const,
      },
    };

    setCache(cacheKey, response);

    const imagesWithMedia = listings.filter(
      (l) => Array.isArray((l as { images?: unknown[] }).images) && ((l as { images?: unknown[] }).images?.length ?? 0) > 0,
    ).length;
    console.log(
      JSON.stringify({
        evt: "cotality_search_telemetry",
        ts: new Date().toISOString(),
        params_keys: Array.from(params.keys()).sort(),
        type_value: params.get("type") || null,
        status_value: params.get("status") || null,
        ownership_value: params.get("ownership") || null,
        propertySubType_value: params.get("propertySubType") || null,
        minBeds_value: params.get("minBeds") || params.get("beds") || null,
        maxBeds_value: params.get("maxBeds") || null,
        minBaths_value: params.get("minBaths") || null,
        maxBaths_value: params.get("maxBaths") || null,
        minPrice_value: params.get("minPrice") || null,
        maxPrice_value: params.get("maxPrice") || null,
        has_neighborhood: !!params.get("neighborhood"),
        has_borough: !!params.get("borough"),
        has_address: !!params.get("address"),
        has_keyword: !!params.get("keyword"),
        has_zip: !!params.get("zip"),
        has_listing_id: !!params.get("listingId"),
        has_buildingName: !!params.get("buildingName"),
        has_unit: !!params.get("unit"),
        has_managementCompany: !!params.get("managementCompany"),
        has_checkboxFilters: !!params.get("checkboxFilters"),
        limit,
        skip,
        filter_length: filter.length,
        provider_rows: result.records.length,
        provider_total_count: result.odataCount ?? null,
        gate_passed: universe.count,
        gate_blocked_total: Object.values(gateBlockedReasons).reduce((a, b) => a + b, 0),
        gate_blocked_by_reason: gateBlockedReasons,
        mapper_returned: listings.length,
        listings_with_images: imagesWithMedia,
        listings_without_images: listings.length - imagesWithMedia,
      }),
    );

    logger.complete("success");
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const mapped = idxSearchErrorResponse(error);
    logger.complete("error", message);
    if (mapped.status !== 400) console.error("[Cotality Search] Error:", message);
    return NextResponse.json(mapped.body, {
      status: mapped.status,
      headers: { "Cache-Control": "private, no-store", ...(mapped.headers ?? {}) },
    });
  }
}
import { UnsupportedCheckboxCriterionError } from "@/lib/search/canonical/checkbox-criteria";
