// GET /api/idx/search
// Authenticated backend Search over ONE settled universe:
//   Cotality provider rows (Mallan's own office copies suppressed inside the query)
//   + Mallan-authored SL-/RL- rows under the same criteria
//   -> one global order -> exact total -> page -> hydrate (rows + media) -> CRM DTO.
//
// Nothing is filtered after the page is cut. Criteria this checkpoint does not
// execute are REFUSED by name (HTTP 400, code UNSUPPORTED_CRITERION), never
// ignored. Auth: agent or broker session cookie required. Read-only.
//
// Provider contract: docs/search/evidence/2026-09-05-live-cotality-checkpoint-contract.md,
// the Validator re-check, and docs/search/evidence/2026-09-05-builder-execution-probes.md.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { generateAttributionText } from "@/lib/idx/mapping";
import { logFetchAttempt } from "@/lib/idx/logger";
import { criteriaFromParams } from "@/lib/search/engine/criteria";
import { settleUniverse, pageOf, type SettledUniverse } from "@/lib/search/engine/universe";
import { hydratePage } from "@/lib/search/engine/hydrate";
import { ProviderError } from "@/lib/search/engine/provider-client";

// Fields selected for a hydrated page (route-local; passed into the engine).
export const SEARCH_SELECT_FIELDS = [
  // Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix", "StreetSuffix", "UnitNumber",
  "City", "CityRegion", "SubdivisionName", "PostalCity", "PostalCode", "StateOrProvince", "CountyOrParish", "CrossStreet",
  "Latitude", "Longitude",
  // Classification
  "ListingId", "ListingKey", "SourceSystemKey", "PropertyType", "PropertySubType", "CommonInterest", "OwnershipType", "NewConstructionYN",
  // Status & dates
  "StandardStatus", "MlsStatus", "ModificationTimestamp", "ListingContractDate", "OnMarketDate", "CloseDate", "ClosePrice",
  "ActivationDate", "DaysOnMarket", "CumulativeDaysOnMarket", "OriginalListPrice", "PreviousListPrice", "AvailabilityDate",
  // Pricing
  "ListPrice", "LeaseAmount", "LeaseAmountFrequency",
  // Rooms & size
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger", "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
  // Building
  "BuildingName", "NumberOfUnitsTotal", "BuildingKeyNumeric",
  // Financial
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount", "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  // Agent / office
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail", "ListAgentDirectPhone", "ListOfficeMlsId", "ListOfficeName",
  // Media
  "PhotosCount", "VirtualTourURLBranded", "VirtualTourURLUnbranded",
  // Remarks
  "PublicRemarks",
  // Display / permission
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN", "Permission",
  // Rental + fee transparency
  "PetsAllowed", "Furnished", "MoveInCosts", "OngoingFees", "TenantPays", "TenantPaysDescription",
  // Checkbox fields returned for the CRM's local rendering
  "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN", "DirectionFaces", "View", "OwnerPays", "ArchitecturalStyle",
  "StructureType", "BusinessType", "AccessibilityFeatures", "ExteriorFeatures", "BuildingFeatures", "LaundryFeatures",
  "SecurityFeatures", "PoolFeatures", "PetsAllowedYN", "AvailableLeaseType", "ExistingLeaseType", "ConstructionMaterials",
  "PriceChangeTimestamp", "PatioAndPorchFeatures", "AssociationAmenities", "CurrentFinancing",
];

// Settled-universe cache: keyed by criteria WITHOUT paging, short-lived.
const UNIVERSE_TTL_MS = 60_000;
const UNIVERSE_MAX = 64;
const universeCache = new Map<string, { u: SettledUniverse; expiresAt: number }>();

function cachedUniverse(key: string): SettledUniverse | null {
  const e = universeCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { universeCache.delete(key); return null; }
  return e.u;
}
function rememberUniverse(key: string, u: SettledUniverse): void {
  if (universeCache.size >= UNIVERSE_MAX) {
    const first = universeCache.keys().next().value;
    if (first !== undefined) universeCache.delete(first);
  }
  universeCache.set(key, { u, expiresAt: Date.now() + UNIVERSE_TTL_MS });
}

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const logger = logFetchAttempt("/api/idx/search");
  try {
    if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
      logger.complete("disabled", "IDX not enabled or missing credentials");
      return NextResponse.json({ error: "IDX search not available", code: "IDX_UNAVAILABLE" }, { status: 503, headers: NO_STORE });
    }

    const parsed = criteriaFromParams(req.nextUrl.searchParams);
    if (!parsed.ok) {
      logger.complete("error", "criteria refused");
      return NextResponse.json(
        {
          error: "One or more search criteria cannot be executed.",
          code: parsed.refusal.unsupported.length ? "UNSUPPORTED_CRITERION" : "INVALID_CRITERION",
          unsupported: parsed.refusal.unsupported,
          invalid: parsed.refusal.invalid,
        },
        { status: 400, headers: NO_STORE },
      );
    }
    const c = parsed.criteria;
    const { limit, offset, ...universeKeyParts } = c;
    const universeKey = JSON.stringify(universeKeyParts);

    let universe = cachedUniverse(universeKey);
    const universeFromCache = universe !== null;
    if (!universe) {
      universe = await settleUniverse(c);
      rememberUniverse(universeKey, universe);
    }

    const page = pageOf(universe, offset, limit);
    const hydrated = await hydratePage(page, { select: SEARCH_SELECT_FIELDS });

    // A gate exclusion or a missing hydration changes what the page can claim.
    const pageShort = hydrated.missing.length + hydrated.gateExcluded.length;
    const countMeaning = universe.countMeaning === "exact" && pageShort === 0 ? "exact" : "lower_bound";

    const response = {
      listings: hydrated.listings,
      total: universe.total,
      totalCount: universe.total,
      countMeaning,
      hasMore: offset + page.length < universe.total,
      skip: offset,
      limit,
      attribution: generateAttributionText(),
      mediaMode: "inline" as const,
      selectionsAreDurableBy: "ListingKey" as const,
      _meta: {
        source: "cotality+mallan",
        fetchedAt: new Date().toISOString(),
        workflow: c.workflow,
        filter: universe.filter,
        orderby: universe.orderby,
        universeFromCache,
        providerCount: universe.providerCount,
        providerRows: universe.providerRows,
        providerPages: universe.providerPages,
        mallanRows: universe.mallanRows,
        mallanExcludedUnresolvedType: universe.mallanExcludedUnresolvedType,
        suppressedOfficeIds: universe.suppressedOfficeIds,
        page: {
          requested: page.length, hydrated: hydrated.listings.length,
          providerHydrated: hydrated.providerHydrated, mallanHydrated: hydrated.mallanHydrated,
          missing: hydrated.missing, gateExcluded: hydrated.gateExcluded,
        },
        media: { rows: hydrated.mediaRows, complete: hydrated.mediaComplete },
      },
    };

    // Count-only telemetry. No PII, no free text, no tokens.
    console.log(JSON.stringify({
      evt: "idx_search_telemetry", ts: response._meta.fetchedAt, workflow: c.workflow,
      statuses: c.standardStatus, boroughs: c.cityRegion, commonInterest: c.commonInterest, structureType: c.structureType,
      has_neighborhood: c.subdivisionName.length > 0, has_zip: c.postalCode.length > 0, has_listing_id: c.listingId.length > 0,
      limit, skip: offset, total: universe.total, countMeaning, providerRows: universe.providerRows, mallanRows: universe.mallanRows,
      page_hydrated: hydrated.listings.length, page_missing: hydrated.missing.length, page_gate_excluded: hydrated.gateExcluded.length,
      universe_from_cache: universeFromCache,
    }));

    logger.complete("success");
    return NextResponse.json(response, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ProviderError) {
      logger.complete("error", "provider " + String(error.status ?? "?"));
      let path = "?";
      try { path = new URL(error.url).pathname; } catch { /* keep "?" */ }
      console.error("[IDX Search] provider error", { status: error.status, path });
      if (error.status === 429) {
        return NextResponse.json(
          { error: "Search temporarily unavailable. Please try again shortly.", code: "PROVIDER_RATE_LIMITED" },
          { status: 503, headers: { ...NO_STORE, "Retry-After": "30" } },
        );
      }
      return NextResponse.json(
        { error: "Search failed at the provider.", code: "PROVIDER_ERROR", providerStatus: error.status },
        { status: 502, headers: NO_STORE },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.complete("error", message);
    console.error("[IDX Search] Error:", message);
    return NextResponse.json({ error: "Search failed. Please try again later.", code: "SEARCH_ERROR" }, { status: 502, headers: NO_STORE });
  }
}
