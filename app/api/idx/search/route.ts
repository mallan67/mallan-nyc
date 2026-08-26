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
    const sort = params.get("sort");

    // SponsorUnitYN is observed inside CustomProperty.CustomFields, not a live
    // Property field. This route does not currently expand a verified
    // CustomProperty contract, so pretending to support this filter would return
    // a page-local/false universe. Fail by name instead.
    if (params.get("sponsorUnit") === "true") {
      throw new UnsupportedSearchCriterionError("sponsorUnit", ["true"]);
    }

    const filter = buildCrmIdxODataFilter(params);

    // Sort is part of result identity. The previous cache key omitted it, so the
    // same criteria/page could return rows cached under a different order.
    const effectiveSort = sort || "ModificationTimestamp desc";
    const cacheKey = `idx:${filter}:${effectiveSort}:${limit}:${skip}`;
    const cached = getCached(cacheKey);
    if (cached) {
      logger.complete("success");
      return NextResponse.json(cached, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Property query only. Media is loaded by the dedicated media path so this
    // request does not depend on an unverified $expand behavior.
    const result = await fetchFromTrestle({
      filter,
      select: SEARCH_SELECT_FIELDS,
      top: limit,
      skip,
      orderby: effectiveSort,
      maxTotal: limit,
      count: true,
      expandMedia: false,
    });

    const { usable: identifiedRecords, identityless } = partitionByListingIdentity(result.records);
    if (identityless > 0) {
      console.error(`[Cotality Search] INTEGRITY: ${identityless} Property row(s) missing required ListingKey were excluded.`);
    }

    const displayable: Record<string, unknown>[] = [];
    const gateBlockedReasons: Record<string, number> = {};
    for (const record of identifiedRecords) {
      const gate = checkDistributionGates(record);
      if (gate.displayable) displayable.push(record);
      else {
        const reason = gate.reason || "unknown";
        gateBlockedReasons[reason] = (gateBlockedReasons[reason] || 0) + 1;
      }
    }

    // Search GET is read-only. It no longer mutates the Building workspace as a
    // side effect. Building projection/writes belong to their explicit writer.
    const listings = displayable.map((record, i) => mapTrestleToCrmListing(record, skip + i));

    const response = {
      listings,
      total: result.odataCount ?? listings.length,
      totalCount: result.odataCount ?? listings.length,
      hasMore: result.hasMore,
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
            displayable: displayable.length,
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
        gate_passed: displayable.length,
        gate_blocked_total: identifiedRecords.length - displayable.length,
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
