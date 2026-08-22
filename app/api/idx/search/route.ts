// GET /api/idx/search
// Direct passthrough search against Trestle/REBNY RLS (read-only).
// Auth: agent or broker session cookie required.
// Returns listings in CRM flat shape for the search UI.
//
// COMPLIANCE:
// - Server-side only, no public caching
// - Distribution gates enforced (owner opt-out, closed >24h, IDX participation)
// - Address suppression for InternetAddressDisplayYN=false
// - REBNY attribution included
// - Audit logged

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { checkDistributionGates } from "@/lib/idx/trestle-mapper";
import { generateAttributionText } from "@/lib/idx/mapping";
import { logFetchAttempt } from "@/lib/idx/logger";
import { upsertBuildingFromSearchResult } from "@/lib/buildings/upsert";
import { buildCrmIdxODataFilter } from "@/lib/search/crm-idx-filter";
import { UnknownPropertySubTypeError } from "@/lib/search/canonical/property-subtype-contract";
import { UnsupportedStatusCriterionError } from "@/lib/search/canonical/status-token-contract";
import { hasUsableListingIdentity, mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";

// ── Fields we actually need (validated against IDX Plus feed 2026-03-04) ──
// Fields NOT on IDX Plus removed: SourceSystemModificationTimestamp, ComingSoonDate,
// BathroomsTotal, FloorNumber, Media, IDXEntireListingDisplayYN, ParticipantOnlyYN, IDXParticipationYN
// Use BathroomsTotalInteger instead of BathroomsTotal; photos via PhotosCount (Media needs $expand)
export const SEARCH_SELECT_FIELDS = [
  // Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish", "CrossStreet",
  "Latitude", "Longitude",
  // Classification
  "ListingId", "SourceSystemKey", "PropertyType", "PropertySubType",
  "CommonInterest", "OwnershipType", "NewConstructionYN",
  // Status & Dates
  "StandardStatus", "MlsStatus", "ModificationTimestamp",
  "ListingContractDate",
  "OnMarketDate", "CloseDate", "ClosePrice", "ActivationDate",
  "DaysOnMarket", "CumulativeDaysOnMarket",
  "OriginalListPrice", "PreviousListPrice", "AvailabilityDate",
  // Pricing
  "ListPrice", "LeaseAmount", "LeaseAmountFrequency",
  // Rooms & Size
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger",
  "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal",
  // Building (BuildingKeyNumeric: Trestle 6.17 — groups listings by building)
  "BuildingName", "NumberOfUnitsTotal", "BuildingKeyNumeric",
  // Financial
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",
  // DownPaymentAssistance* are live Property fields (migrated from CustomProperty,
  // verified 2026-06-04). Required here so /api/idx/search populates them via the
  // mapper, which reads them Property-first (#352). Without them in this route-local
  // select, the mapper would map both to null even though the default
  // IDX_PLUS_SELECT_FIELDS already includes them. Do NOT $expand=CustomProperty for
  // these — Trestle 400s on that expand; the Property fields are authoritative.
  "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  // Agent/Office
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail",
  "ListAgentDirectPhone", "ListOfficeMlsId", "ListOfficeName",
  // Media (Media array needs $expand, not $select — use PhotosCount for now)
  "PhotosCount", "VirtualTourURLBranded", "VirtualTourURLUnbranded",
  // Remarks
  "PublicRemarks",
  // Display flags (IDX/VOW/Participant gates pre-filtered by Trestle on IDX Plus feed)
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  // Rental + FARE Act fee transparency
  "PetsAllowed", "Furnished",
  "MoveInCosts", "OngoingFees", "TenantPays", "TenantPaysDescription",
  // ── Searchable checkbox fields (wired to CRM search form data-field checkboxes) ──
  // These are returned so local filterListings() can match against them.
  "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN",
  "DirectionFaces", "View", "OwnerPays",
  // PropertyCondition: NOT in IDX Plus CSV, prohibited for public IDX per REBNY — removed
  // Concessions: does NOT exist on Trestle Property entity — removed
  "ArchitecturalStyle", "StructureType", "BusinessType",
  "AccessibilityFeatures", "ExteriorFeatures", "BuildingFeatures",
  "LaundryFeatures", "SecurityFeatures", "PoolFeatures",
  // BuildingRules: NOT on Trestle Property entity (400 error). Filtered client-side only.
  "PetsAllowedYN", "AvailableLeaseType", "ExistingLeaseType",
  "ConstructionMaterials", "PriceChangeTimestamp",
  // Detail panel fields (verified in Trestle metadata 2026-04-08)
  "PatioAndPorchFeatures",
  "AssociationAmenities", // Contains: Elevators, Concierge, Doorman values (enum)
  "CurrentFinancing",     // Financing type (e.g., Conventional, FHA, VA)
  // AttendanceType: NOT in Trestle metadata — REBNY lookup CSV only. Doorman info lives in AssociationAmenities.
];

// ── In-memory cache ────────────────────────────────────────────────────
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
  // Evict oldest if at capacity
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Split provider rows by whether they carry a usable identity.
 *
 * `ListingId` and `SourceSystemKey` are BOTH nullable on live Property, so a row
 * with neither is a legitimate provider state — and one we cannot act on.
 *
 * SCOPE OF THE GUARANTEE, precisely: an identityless row never enters the
 * RETURNED LISTING UNIVERSE on this page, nor any downstream consumer of it —
 * gates, mapping, result rows, building upsert, Map, selection, reports.
 *
 * It does NOT repair `total`/`hasMore`. Those still come from the provider's
 * `$count`, which is computed before any Mallan filtering and therefore still
 * includes identityless rows on pages we have not fetched. That is the KNOWN
 * pre-final-universe count defect and it belongs to Step 6. Subtracting this
 * page's identity failures from `odataCount` would NOT fix it — it would create
 * a differently-wrong global total, because the count of identityless rows on
 * unvisited pages is unknown.
 *
 * It is COUNTED rather than silently dropped. A provider row we cannot identify
 * is an integrity failure, not a filtered result, and the two must not look the
 * same in the diagnostics.
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

/**
 * The three DISTINCT outcomes a fetched provider row can have.
 *
 * `gatedOut` used to be `totalFetched - displayable`, which folded identity
 * failures into the distribution-gate count while `identityless` was ALSO
 * reported separately — so an unidentifiable row was counted twice and the gate
 * figure overstated how many rows a compliance gate actually rejected.
 *
 *   provider rows fetched -> identity failures -> gate failures -> returned rows
 *
 * The three categories account for every fetched row exactly once.
 */
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

/**
 * Which KIND of failure this was — and therefore what the client should do.
 *
 * Exported so the decision is testable on its own. Folding it back into the
 * catch block is how it became a single 502 in the first place.
 *
 *   400  the request cannot be served as written. Permanent, client-fixable,
 *        and it names what to fix. Never "try again later".
 *   503  the provider rate-limited us. Retryable, with a delay.
 *   502  the upstream genuinely failed. Retryable, cause not the client's.
 *
 * Collapsing these is the same error as collapsing SUPPORTED /
 * PROVIDER_REJECTED / UNVERIFIED at the probe layer: it turns three different
 * facts into one unactionable message.
 */
export function idxSearchErrorResponse(error: unknown): {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
} {
  if (error instanceof UnsupportedStatusCriterionError) {
    // Same shape as the PropertySubType case below — one error architecture, not
    // two. A status the provider cannot express is a client-fixable 400, never a
    // silently widened 200.
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

  // The raw provider text is logged, never returned — it can carry host and
  // query detail that has no business reaching a browser.
  return { status: 502, body: { error: "Search failed. Please try again later." } };
}

// ── Route handler ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth: require agent or broker session
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const logger = logFetchAttempt("/api/idx/search");

  try {
    // Gate: IDX must be enabled with credentials
    const enabled = process.env.IDX_ENABLED === "true";
    if (!enabled || !hasCredentials()) {
      logger.complete("disabled", "IDX not enabled or missing credentials");
      return NextResponse.json(
        { error: "IDX search not available", code: "IDX_UNAVAILABLE" },
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }

    // Parse query params
    const params = req.nextUrl.searchParams;
    const limit = Math.min(Number(params.get("limit")) || 50, 500);
    const skip = Number(params.get("skip")) || 0;
    const sort = params.get("sort"); // OData $orderby value (e.g. "ListPrice desc")

    // Build OData filter. Generic checkboxFilters are parsed in
    // buildCrmIdxODataFilter(params) and only OData-safe fields are forwarded.
    const filter = buildCrmIdxODataFilter(params);

    // Cache key from filter + pagination
    const cacheKey = `idx:${filter}:${limit}:${skip}`;
    const cached = getCached(cacheKey);
    if (cached) {
      logger.complete("success");
      return NextResponse.json(cached, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // Fetch from Trestle (READ-ONLY GET)
    // Strategy: $expand=Media only for small result sets (≤200). For larger queries,
    // fetch properties without media and let the frontend lazy-load photos via
    // /api/media/batch + IntersectionObserver (photo-loader.js).
    // Trestle tokens refresh every ~12 min; auth.ts handles this with a 5-min buffer.
    //
    // PR-S.1c (2026-05-15): Trestle CONSISTENTLY rejects `$expand=Media` with
    // HTTP 400. The previous `limit <= 200` conditional was a workaround that
    // production logs show does not work — even small searches 400 the same
    // way. All searches now lazy-load media via /api/media/batch.
    const useInlineMedia = false;
    const result = await fetchFromTrestle({
      filter,
      select: SEARCH_SELECT_FIELDS,
      top: limit,
      skip,
      orderby: sort || "ModificationTimestamp desc",
      maxTotal: limit,
      count: true,
      expandMedia: useInlineMedia,
    });

    // Distribution gates — ALL 6 apply.
    // PREVIOUSLY this route re-added Participant-Only + InternetEntireListingDisplayYN=false
    // records under the claim "CRM agent context — agents can see these in RLS." That
    // claim is invalid for mallan.nyc: we hold IDX Plus only (no RLS/LMP license).
    // Trestle's IDX Plus feed already pre-filters Participant-Only records, so the
    // bypass would only fire if Trestle leaked one — which is exactly the case
    // where we must NOT show it. All 6 gates are now enforced uniformly.
    // Identity first: a row we cannot identify never reaches the gates, the
    // count, the map or a report. Counted separately — an unidentifiable
    // provider row is an integrity failure, not a filtered result.
    const { usable: identifiedRecords, identityless } = partitionByListingIdentity(result.records);
    if (identityless > 0) {
      console.error(`[IDX Search] INTEGRITY: ${identityless} provider row(s) carried neither ListingId nor SourceSystemKey and were excluded.`);
    }

    const displayable: Record<string, unknown>[] = [];
    const gateBlockedReasons: Record<string, number> = {};
    for (const record of identifiedRecords) {
      const gate = checkDistributionGates(record);
      if (gate.displayable) {
        displayable.push(record);
      } else {
        const reason = gate.reason || "unknown";
        gateBlockedReasons[reason] = (gateBlockedReasons[reason] || 0) + 1;
      }
    }

    // Silent building upsert — populate building DB from search results
    const seenBuildingKeys = new Set<number>();
    for (const record of identifiedRecords) {
      const bk = record.BuildingKeyNumeric;
      if (bk != null && !seenBuildingKeys.has(Number(bk))) {
        seenBuildingKeys.add(Number(bk));
        upsertBuildingFromSearchResult(Number(bk), record).catch(() => {});
      }
    }

    // Map to CRM flat shape
    const listings = displayable.map((record, i) =>
      mapTrestleToCrmListing(record, skip + i)
    );

    // ── Batch-fetch photos for listings missing media ──
    // When $expand=Media was used but some records came back empty (Trestle drops
    // media on large-ish payloads), OR when $expand was disabled entirely,
    // identify which listings need photos so the frontend can lazy-load them.
    // Trestle tokens refresh every ~12 min; getAccessToken() handles this.
    const needsLazyLoad = !useInlineMedia;
    let mediaBackfilled = 0;

    if (useInlineMedia) {
      // For inline-media searches, batch-fetch photos for any records that came back empty
      const missingMedia = listings.filter(
        (l) => !l.images || (l.images as unknown[]).length === 0
      );
      if (missingMedia.length > 0 && missingMedia.length <= 50) {
        try {
          const { getAccessToken: getToken } = await import("@/lib/idx/auth");
          const token = await getToken();
          const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
          // Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
          // NOT ResourceRecordID (can duplicate). wid = SourceSystemKey = ListingKey = ResourceRecordKey.
          const keyToId = new Map<string, string>();
          const filterParts: string[] = [];
          for (const l of missingMedia) {
            const lid = String(l.id);
            const key = l.wid ? String(l.wid) : lid;
            keyToId.set(key, lid);
            const escaped = key.replace(/'/g, "''");
            filterParts.push(l.wid ? `ResourceRecordKey eq '${escaped}'` : `ResourceRecordID eq '${escaped}'`);
          }
          // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
          const mediaFilter = `(${filterParts.join(" or ")}) and (MediaCategory eq 'Photo' or MediaCategory eq null) and MediaStatus ne 'Deleted'`;
          const mediaParams = new URLSearchParams();
          mediaParams.set("$filter", mediaFilter);
          // E-0: request the provider's media display authorization so suppressed
          // rows can be refused before becoming a search-card image.
          mediaParams.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,Order,PreferredPhotoYN,MediaStatus,InternetEntireListingDisplayYN");
          mediaParams.set("$orderby", "Order asc");
          mediaParams.set("$top", String(filterParts.length * 2));

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8_000);
          const mediaRes = await fetch(
            `${TRESTLE_API}/odata/Media?${mediaParams.toString()}`,
            {
              headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
              signal: controller.signal,
            }
          );
          clearTimeout(timeout);

          if (mediaRes.ok) {
            const mediaData = await mediaRes.json();
            // Group by ResourceRecordKey — take first photo per listing
            const photoByKey = new Map<string, string>();
            for (const m of (mediaData.value || [])) {
              // E-0: refuse provider-suppressed media before it can become the
              // card image. Explicit `false` only; null is "not suppressed".
              if (m.InternetEntireListingDisplayYN === false) continue;
              // Prefer ResourceRecordKey (unique), fall back to ResourceRecordID
              const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
              if (mkey && !photoByKey.has(mkey) && m.MediaURL) {
                const rawUrl = String(m.MediaURL);
                photoByKey.set(mkey, rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
                  ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}` : rawUrl);
              }
            }
            // Patch listings with backfilled photos — convert key back to listing ID
            for (const listing of missingMedia) {
              const key = listing.wid ? String(listing.wid) : String(listing.id);
              const url = photoByKey.get(key);
              if (url) {
                (listing as Record<string, unknown>).images = [{ url, isPrimary: true, order: 0, mediaType: "Photo" }];
                (listing as Record<string, unknown>).photoCount = 1;
                mediaBackfilled++;
              }
            }
          }
        } catch {
          // Non-fatal — frontend photo-loader will handle these via /api/media/batch
        }
      }
    }

    // ── Post-fetch sponsor filter (Bug A11) ──
    //
    // SponsorUnitYN is REBNY-specific and lives inside
    // CustomProperty.CustomFields as a JSON string field, NOT a top-level
    // OData property. There is no way to express "WHERE SponsorUnitYN=true"
    // in an OData $filter against the live Cotality/Trestle feed (the field doesn't exist as
    // a queryable property — only the containing JSON string does).
    //
    // The mapper at lib/search/crm-idx-mapper.ts parses CustomFields and
    // exposes listing.sponsorUnit (boolean | null). We filter on that
    // here, after mapping, before building the response. Sponsor labels
    // in the CRM UI now read from this same source field — fixing the
    // prior render that showed '--' for all rows because there was no
    // canonical source.
    //
    // Post-fetch filtering means total counts reflect the post-filter
    // page size, not the unfiltered Trestle total. With limit=200 and a
    // small sponsor share (~5% historically in NYC), users may see fewer
    // results than they'd expect from a full-inventory sponsor query.
    // This is a known limitation; if scaling requires accurate totals
    // we'd need to fetch all matching records (paginated) and filter
    // in-memory, or wait for REBNY to expose SponsorUnitYN as a
    // top-level OData-filterable property.
    let finalListings = listings;
    let finalTotal: number = result.odataCount ?? listings.length;
    let sponsorFiltered = 0;
    if (params.get("sponsorUnit") === "true") {
      finalListings = listings.filter(
        (l) => (l as Record<string, unknown>).sponsorUnit === true,
      );
      sponsorFiltered = listings.length - finalListings.length;
      finalTotal = finalListings.length;
    }

    const response = {
      listings: finalListings,
      total: finalTotal,
      totalCount: finalTotal,
      hasMore: result.hasMore,
      skip,
      limit,
      attribution: generateAttributionText(),
      // Tell frontend whether to activate lazy photo loading
      mediaMode: needsLazyLoad ? "lazy" as const : "inline" as const,
      _meta: {
        source: "trestle",
        fetchedAt: new Date().toISOString(),
        filter,
        totalFromAPI: result.totalFetched,
        odataCount: result.odataCount,
        // Three distinct concepts, each counted once. `gatedOut` is now ONLY the
        // distribution-gate rejections; identity failures are their own category.
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
        // total/hasMore below are the provider's PRE-Mallan-filtering figures and
        // do NOT describe the returned universe. Known defect, owned by Step 6.
        totalIsPreFinalUniverse: true,
        mediaStrategy: useInlineMedia ? "expand" : "lazy",
        mediaBackfilled,
        sponsorFiltered,
      },
    };

    // Cache the response
    setCache(cacheKey, response);

    // ── Temporary count-only + safe-value telemetry (Phase 0a/incident triage) ──
    // No PII, no record content, no tokens, no auth. Counts, parameter keys,
    // and safe picklist/numeric param VALUES only.
    //
    // VALUE LOGGING IS WHITELISTED. Only fields whose values are picklist
    // labels (type, status, borough, neighborhood, ownership, propertySubType)
    // or bounded numerics (minBeds, maxBeds, minBaths, maxBaths) are logged
    // by value. Free-text user input (address, keyword, listingId, unit,
    // building names) is logged as boolean presence ONLY. The full OData
    // filter is NOT logged because its `address`/`keyword` interpolation
    // can carry user-typed strings that may be quasi-identifying.
    //
    // The 2026-05-03 H1 audit had only 1 telemetry sample with `params_keys`
    // listing the names of 6 params but no values. That made it impossible
    // to distinguish whether `ownership=Co-op` (form label) or
    // `neighborhood=Bed-Stuy` (alias gap) caused trestle_fetched=0. The
    // additions below close that gap.
    //
    // Remove this entire block in a follow-up commit once the CRM-search
    // 0-results incident is closed.
    const imagesWithMedia = listings.filter(
      (l) => Array.isArray((l as { images?: unknown[] }).images) && ((l as { images?: unknown[] }).images?.length ?? 0) > 0,
    ).length;
    console.log(
      JSON.stringify({
        evt: "idx_search_telemetry",
        ts: new Date().toISOString(),
        params_keys: Array.from(params.keys()).sort(),
        // ── Safe picklist/numeric values (whitelisted) ──
        type_value: params.get("type") || null,
        status_value: params.get("status") || null,
        borough_value: params.get("borough") || null,
        neighborhood_value: params.get("neighborhood") || null,
        ownership_value: params.get("ownership") || null,
        propertySubType_value: params.get("propertySubType") || null,
        minBeds_value: params.get("minBeds") || params.get("beds") || null,
        maxBeds_value: params.get("maxBeds") || null,
        minBaths_value: params.get("minBaths") || null,
        maxBaths_value: params.get("maxBaths") || null,
        minPrice_value: params.get("minPrice") || null,
        maxPrice_value: params.get("maxPrice") || null,
        // ── Backwards-compatible field aliases (so prior log-grep tooling
        //    that looked for `type` / `status` / `borough` still resolves) ──
        type: params.get("type") || null,
        status: params.get("status") || null,
        borough: params.get("borough") || null,
        // ── Free-text param presence (booleans only — values not logged) ──
        has_neighborhood: !!params.get("neighborhood"),
        has_address: !!params.get("address"),
        has_keyword: !!params.get("keyword"),
        has_zip: !!params.get("zip"),
        has_listing_id: !!params.get("listingId"),
        has_buildingName: !!params.get("buildingName"),
        has_unit: !!params.get("unit"),
        has_managementCompany: !!params.get("managementCompany"),
        has_checkboxFilters: !!params.get("checkboxFilters"),
        has_gridFilter: !!params.get("gridFilter"),
        // ── Count metrics (unchanged) ──
        limit,
        skip,
        filter_length: filter.length,
        trestle_fetched: result.records.length,
        trestle_total_count: result.odataCount ?? null,
        trestle_total_fetched: result.totalFetched,
        gate_passed: displayable.length,
        gate_blocked_total: result.records.length - displayable.length,
        gate_blocked_by_reason: gateBlockedReasons,
        mapper_returned: listings.length,
        media_backfilled: mediaBackfilled,
        listings_with_images: imagesWithMedia,
        listings_without_images: listings.length - imagesWithMedia,
      }),
    );

    logger.complete("success");

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const mapped = idxSearchErrorResponse(error);

    logger.complete("error", message);
    // A rejected criterion is a client mistake, not an incident — log it, but
    // do not report it as a provider failure.
    if (mapped.status !== 400) console.error("[IDX Search] Error:", message);

    return NextResponse.json(mapped.body, {
      status: mapped.status,
      headers: { "Cache-Control": "private, no-store", ...(mapped.headers ?? {}) },
    });
  }
}
