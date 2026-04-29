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
import { affirmPermission } from "@/lib/compliance/gates";
import { logFetchAttempt } from "@/lib/idx/logger";
import { upsertBuildingFromSearchResult } from "@/lib/buildings/upsert";
import { buildCrmIdxODataFilter } from "@/lib/search/crm-idx-filter";

/** Map Trestle property fields to display type (no "Apartment") */
function mapDisplayPropertyType(raw: Record<string, unknown>): string {
  const ci = raw.CommonInterest ? String(raw.CommonInterest) : "";
  if (ci === "Condominium") return "Condo";
  if (ci === "StockCooperative") return "Co-op";
  if (ci === "Condop") return "Condop";
  const sub = raw.PropertySubType ? String(raw.PropertySubType).toLowerCase() : "";
  if (sub.includes("condo")) return "Condo";
  if (sub.includes("co-op") || sub.includes("coop") || sub.includes("stock cooperative")) return "Co-op";
  if (sub.includes("condop")) return "Condop";
  if (sub.includes("townhouse")) return "Townhouse";
  if (sub.includes("loft")) return "Loft";
  if (sub.includes("single family") || sub.includes("house")) return "House";
  if (sub.includes("multi")) return "Multi-Family";
  if (sub === "apartment") return "Residential";
  if (sub) return String(raw.PropertySubType);
  return String(raw.PropertyType || "Residential");
}

// ── Fields we actually need (validated against IDX Plus feed 2026-03-04) ──
// Fields NOT on IDX Plus removed: SourceSystemModificationTimestamp, ComingSoonDate,
// BathroomsTotal, FloorNumber, Media, IDXEntireListingDisplayYN, ParticipantOnlyYN, IDXParticipationYN
// Use BathroomsTotalInteger instead of BathroomsTotal; photos via PhotosCount (Media needs $expand)
const SEARCH_SELECT_FIELDS = [
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

// RESO DD: MediaCategory = content type (Photo, Floor Plan, Video, Virtual Tour)
//          MediaType = file format (jpeg, png) — NOT content type
function classifyMediaCategory(m: Record<string, unknown>): string {
  const cat = String(m.MediaCategory || "").toLowerCase();
  if (cat.includes("floor plan")) return "FloorPlan";
  if (cat.includes("video")) return "Video";
  if (cat.includes("virtual tour")) return "VirtualTour";
  return "Photo";
}

// ── Trestle record → CRM flat shape ───────────────────────────────────
function mapTrestleToCRM(
  raw: Record<string, unknown>,
  index: number
): Record<string, unknown> {
  const streetParts = [
    raw.StreetNumber,
    raw.StreetDirPrefix,
    raw.StreetName,
    raw.StreetSuffix,
    raw.StreetDirSuffix,
  ].filter(Boolean);
  const address = streetParts.join(" ").toUpperCase() || "";

  const propertyType = String(raw.PropertyType || "");
  const isRental = propertyType.toLowerCase().includes("lease");
  // REBNY RLS uses ListPrice for BOTH sales and rentals
  // Per field spec: "For rent/leasing, it must reflect the gross monthly rent/lease"
  const price = Number(raw.ListPrice) || 0;
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  const taxAnnual = Number(raw.TaxAnnualAmount) || 0;
  const monthlyTax = taxAnnual / 12;
  const maintCC = Number(raw.AssociationFee) || 0;

  // Address suppression (REBNY compliance) — fail-CLOSED via canonical helper.
  // Was `!== false` which let null/undefined render addresses publicly.
  const addressDisplayYN = affirmPermission(raw.InternetAddressDisplayYN);
  const displayAddress = addressDisplayYN
    ? address
    : "ADDRESS AVAILABLE UPON REQUEST";

  // Media — $expand=Media included (capped at 200 results to avoid 400 errors)
  const media = Array.isArray(raw.Media) ? raw.Media : [];
  const photoCount = Number(raw.PhotosCount) || media.length;
  const images = media.map((m: Record<string, unknown>, i: number) => {
    const rawUrl = String(m.MediaURL || "");
    // Proxy Trestle URLs (require Bearer auth, browser can't load directly)
    const url = rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
      ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;
    return {
      url,
      isPrimary: i === 0,
      order: Number(m.Order || i),
      mediaType: classifyMediaCategory(m),
    };
  }).filter((img: { url: string }) => img.url);

  // Down Payment Assistance (Trestle 6.17 — CustomProperty expansion)
  const customProps = Array.isArray(raw.CustomProperty) ? raw.CustomProperty[0] as Record<string, unknown> | undefined
    : (raw.CustomProperty as Record<string, unknown> | undefined);
  const dpaAmount = customProps?.DownPaymentAssistanceAmount != null
    ? Number(customProps.DownPaymentAssistanceAmount) : null;
  const dpaCount = customProps?.DownPaymentAssistanceCount != null
    ? Number(customProps.DownPaymentAssistanceCount) : null;

  // Price change detection
  const originalPrice = Number(raw.OriginalListPrice) || 0;
  let priceChange: string | null = null;
  if (originalPrice > 0 && originalPrice !== price) {
    priceChange = price < originalPrice ? "down" : "up";
  }

  // Era classification
  let era: string | null = null;
  if (yearBuilt) {
    if (yearBuilt >= 2015) era = "New Construction";
    else if (yearBuilt >= 1960) era = "Post-War";
    else era = "Pre-War";
  }

  // Status normalization — MlsStatus values per REBNY RLS lookup table
  const mlsStatus = String(raw.MlsStatus || raw.StandardStatus || "Active");
  const statusMap: Record<string, string> = {
    Active: "ACTIVE",
    ComingSoon: "COMING_SOON",
    "Coming Soon": "COMING_SOON",
    ActiveUnderContract: "PENDING",
    "Active Under Contract": "PENDING",
    Pending: "PENDING",
    Closed: "CLOSED",
    Expired: "EXPIRED",
    Withdrawn: "WITHDRAWN",
    Hold: "HOLD",
    Incomplete: "INCOMPLETE",
    Canceled: "CANCELLED",
    Cancelled: "CANCELLED",
  };
  const status = statusMap[mlsStatus] || mlsStatus.toUpperCase();

  return {
    id: String(raw.ListingId || raw.SourceSystemKey || index + 1),
    address: displayAddress,
    unit: String(raw.UnitNumber || ""),
    price,
    totalMonthly: isRental ? price : monthlyTax + maintCC,
    rooms: Number(raw.RoomsTotal) || 0,
    beds: Number(raw.BedroomsTotal) || 0,
    baths:
      raw.BathroomsTotalInteger != null ? Number(raw.BathroomsTotalInteger) :
      (Number(raw.BathroomsFull) || 0) +
      (Number(raw.BathroomsHalf) || 0) * 0.5,
    fullBaths: Number(raw.BathroomsFull) || 0,
    halfBaths: Number(raw.BathroomsHalf) || 0,
    reTaxes: monthlyTax,
    maintCC,
    intSqft: raw.LivingArea != null ? Number(raw.LivingArea) : null,
    status,
    mlsStatus, // Raw MlsStatus for sub-status filtering (OfferOut, ContractSigned, etc.)
    ownership: String(raw.CommonInterest || raw.OwnershipType || ""),
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: String(raw.PropertySubType || ""),
    neighborhood: String(raw.SubdivisionName || ""),
    borough: String(raw.CityRegion || raw.CountyOrParish || "Manhattan"),
    zip: String(raw.PostalCode || ""),
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    listingType: "Exclusive",
    lid: String(raw.ListingId || ""),
    wid: raw.SourceSystemKey ? String(raw.SourceSystemKey) : null,
    dom: Number(raw.DaysOnMarket) || 0,
    cdom: Number(raw.CumulativeDaysOnMarket) || 0,
    listedDate: raw.ListingContractDate
      ? new Date(String(raw.ListingContractDate)).toLocaleDateString("en-US")
      : "",
    updatedDate: raw.ModificationTimestamp
      ? new Date(String(raw.ModificationTimestamp)).toLocaleDateString("en-US")
      : "",
    company: String(raw.ListOfficeName || ""),
    agentName: String(raw.ListAgentFullName || ""),
    agentEmail: String(raw.ListAgentEmail || ""),
    agentPhone: String(raw.ListAgentDirectPhone || ""),
    priceChange,
    originalPrice: originalPrice > 0 && originalPrice !== price ? originalPrice : null,
    photoCount,
    images,
    latitude: raw.Latitude != null ? Number(raw.Latitude) : null,
    longitude: raw.Longitude != null ? Number(raw.Longitude) : null,
    crossStreet: String(raw.CrossStreet || ""),
    floor: null, // FloorNumber not on IDX Plus feed
    description: String(raw.PublicRemarks || ""),
    virtualTourUrl: raw.VirtualTourURLUnbranded
      ? String(raw.VirtualTourURLUnbranded)
      : raw.VirtualTourURLBranded
        ? String(raw.VirtualTourURLBranded)
        : null,
    idxDisplayYN: true, // Pre-filtered by Trestle on IDX Plus feed
    internetDisplayYN: affirmPermission(raw.InternetEntireListingDisplayYN),
    addressDisplayYN,
    listingCategory: isRental ? "rental" : undefined,
    // Date fields for client-side filtering (Gate 6 + contract date filter)
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
    comingSoonDate: null, // ComingSoonDate not on IDX Plus feed — detect via StandardStatus
    // Trestle 6.17 fields
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    permissions: {
      ownerOptOut: false, // Pre-filtered by Trestle on IDX Plus feed
      participantOnly: false, // Pre-filtered by Trestle on IDX Plus feed
      idxDisplay: true, // Pre-filtered by Trestle on IDX Plus feed
      internetDisplay: affirmPermission(raw.InternetEntireListingDisplayYN),
      syndication: true,
    },
    // ── Searchable checkbox fields (pass-through for local filterListings) ──
    // These use Trestle field names as keys so the generic checkbox filter can match.
    // HTML data-field names that differ are mapped client-side (fieldNameMap).
    ListingAgreement: raw.ListingAgreement ? String(raw.ListingAgreement) : null,
    LandLeaseYN: raw.LandLeaseYN === true || raw.LandLeaseYN === "true",
    CoolingYN: raw.CoolingYN === true || raw.CoolingYN === "true",
    GarageYN: raw.GarageYN === true || raw.GarageYN === "true",
    DirectionFaces: raw.DirectionFaces ? String(raw.DirectionFaces) : null,
    View: raw.View ? String(raw.View) : null,
    // PropertyCondition: removed — not in IDX Plus, prohibited for public IDX
    // Concessions: removed — does not exist on Trestle Property entity
    OwnerPays: raw.OwnerPays ? String(raw.OwnerPays) : null,
    ArchitecturalStyle: raw.ArchitecturalStyle ? String(raw.ArchitecturalStyle) : null,
    StructureType: raw.StructureType ? String(raw.StructureType) : null,
    BusinessType: raw.BusinessType ? String(raw.BusinessType) : null,
    AccessibilityFeatures: raw.AccessibilityFeatures ? String(raw.AccessibilityFeatures) : null,
    ExteriorFeatures: raw.ExteriorFeatures ? String(raw.ExteriorFeatures) : null,
    BuildingFeatures: raw.BuildingFeatures ? String(raw.BuildingFeatures) : null,
    // BuildingRules: NOT on Trestle Property entity — filtered client-side only
    LaundryFeatures: raw.LaundryFeatures ? String(raw.LaundryFeatures) : null,
    SecurityFeatures: raw.SecurityFeatures ? String(raw.SecurityFeatures) : null,
    PoolFeatures: raw.PoolFeatures ? String(raw.PoolFeatures) : null,
    PatioAndPorchFeatures: raw.PatioAndPorchFeatures ? String(raw.PatioAndPorchFeatures) : null,
    AssociationAmenities: raw.AssociationAmenities ? String(raw.AssociationAmenities) : null,
    CurrentFinancing: raw.CurrentFinancing ? String(raw.CurrentFinancing) : null,
    PetsAllowedYN: raw.PetsAllowedYN === true || raw.PetsAllowedYN === "true",
    AvailableLeaseType: raw.AvailableLeaseType ? String(raw.AvailableLeaseType) : null,
    ExistingLeaseType: raw.ExistingLeaseType ? String(raw.ExistingLeaseType) : null,
    ConstructionMaterials: raw.ConstructionMaterials ? String(raw.ConstructionMaterials) : null,
    NewConstructionYN: raw.NewConstructionYN === true || raw.NewConstructionYN === "true",
    PriceChangeTimestamp: raw.PriceChangeTimestamp ? String(raw.PriceChangeTimestamp) : null,
    _source: "idx",
    _listingKey: String(raw.ListingId || raw.SourceSystemKey || ""),
  };
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

    // Build OData filter
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
    const useInlineMedia = limit <= 200;
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
    const displayable: Record<string, unknown>[] = [];
    for (const record of result.records) {
      const gate = checkDistributionGates(record);
      if (gate.displayable) {
        displayable.push(record);
      }
    }

    // Silent building upsert — populate building DB from search results
    const seenBuildingKeys = new Set<number>();
    for (const record of result.records) {
      const bk = record.BuildingKeyNumeric;
      if (bk != null && !seenBuildingKeys.has(Number(bk))) {
        seenBuildingKeys.add(Number(bk));
        upsertBuildingFromSearchResult(Number(bk), record).catch(() => {});
      }
    }

    // Map to CRM flat shape
    const listings = displayable.map((record, i) =>
      mapTrestleToCRM(record, skip + i)
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
          mediaParams.set("$select", "ResourceRecordKey,ResourceRecordID,MediaURL,Order,PreferredPhotoYN,MediaStatus");
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

    const response = {
      listings,
      total: result.odataCount ?? listings.length,
      totalCount: result.odataCount ?? listings.length,
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
        gatedOut: result.totalFetched - displayable.length,
        mediaStrategy: useInlineMedia ? "expand" : "lazy",
        mediaBackfilled,
      },
    };

    // Cache the response
    setCache(cacheKey, response);

    logger.complete("success");

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Handle specific error types
    if (message.includes("429") || message.includes("rate limit")) {
      logger.complete("error", "Rate limited by Trestle");
      return NextResponse.json(
        { error: "Search temporarily unavailable. Please try again shortly." },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        }
      );
    }

    logger.complete("error", message);
    console.error("[IDX Search] Error:", message);

    return NextResponse.json(
      { error: "Search failed. Please try again later." },
      {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}
