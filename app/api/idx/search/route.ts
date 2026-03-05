// GET /api/idx/search
// Direct passthrough search against Trestle/REBNY RLS (read-only).
// Auth: agent or broker session cookie required.
// Returns listings in CRM flat shape (same as _MOCK_LISTINGS_DATA).
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

// ── Fields we actually need (validated against IDX Plus feed 2026-03-04) ──
// Fields NOT on IDX Plus removed: SourceSystemModificationTimestamp, ComingSoonDate,
// BathroomsTotal, FloorNumber, Media, IDXEntireListingDisplayYN, ParticipantOnlyYN, IDXParticipationYN
// Use BathroomsTotalInteger instead of BathroomsTotal; photos via PhotosCount (Media needs $expand)
const SEARCH_SELECT_FIELDS = [
  // Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "PostalCity",
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
  // Building
  "BuildingName",
  // Financial
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",
  // Agent/Office
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail",
  "ListAgentDirectPhone", "ListOfficeMlsId", "ListOfficeName",
  // Media (Media array needs $expand, not $select — use PhotosCount for now)
  "PhotosCount", "VirtualTourURLBranded",
  // Remarks
  "PublicRemarks",
  // Display flags (IDX/VOW/Participant gates pre-filtered by Trestle on IDX Plus feed)
  "InternetEntireListingDisplayYN", "InternetAddressDisplayYN",
  // Rental
  "PetsAllowed", "Furnished",
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

// ── OData filter builder ───────────────────────────────────────────────
function buildODataFilter(params: URLSearchParams): string {
  const parts: string[] = [];

  // Listing type
  const type = params.get("type");
  if (type === "sale") {
    parts.push("PropertyType ne 'ResidentialLease'");
  } else if (type === "rent" || type === "rental") {
    parts.push("PropertyType eq 'ResidentialLease'");
  }

  // Price range
  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  if (minPrice && Number(minPrice) > 0) {
    parts.push(`ListPrice ge ${Number(minPrice)}`);
  }
  if (maxPrice && Number(maxPrice) > 0) {
    parts.push(`ListPrice le ${Number(maxPrice)}`);
  }

  // Bedrooms
  const minBeds = params.get("minBeds");
  if (minBeds && Number(minBeds) > 0) {
    parts.push(`BedroomsTotal ge ${Number(minBeds)}`);
  }

  // Bathrooms
  const minBaths = params.get("minBaths");
  if (minBaths && Number(minBaths) > 0) {
    parts.push(`BathroomsFull ge ${Number(minBaths)}`);
  }

  // Neighborhood (CityRegion in REBNY RLS)
  const neighborhood = params.get("neighborhood");
  if (neighborhood) {
    parts.push(`CityRegion eq '${escapeOData(neighborhood)}'`);
  }

  // Borough (CountyOrParish in REBNY RLS)
  const borough = params.get("borough");
  if (borough) {
    parts.push(`CountyOrParish eq '${escapeOData(borough)}'`);
  }

  // Status — default to active statuses for CRM agents
  // StandardStatus uses RESO enum values (PascalCase, no spaces)
  const status = params.get("status");
  if (status) {
    const statuses = status.split(",").map(s => {
      const normalized = s.trim().replace(/\s+/g, ''); // "Coming Soon" → "ComingSoon"
      return `StandardStatus eq '${escapeOData(normalized)}'`;
    });
    parts.push(`(${statuses.join(" or ")})`);
  } else {
    parts.push(
      "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')"
    );
  }

  // Address search
  // Trestle stores addresses as: StreetNumber="400", StreetDirPrefix="E", StreetName="90th", StreetSuffix="Street"
  // So "400 e 90" needs to search: StreetNumber starts with "400" AND StreetName contains "90"
  // Direction (E/W/N/S) is in StreetDirPrefix, NOT in StreetName.
  const address = params.get("address");
  if (address) {
    const raw = address.trim().toUpperCase();

    // Extract direction if present: "400 E 90TH" → num="400", dir="E", street="90TH"
    const dirPattern = /^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
    const numOnlyPattern = /^(\d+)\s+(.*)/;
    const dirMatch = raw.match(dirPattern);

    if (dirMatch) {
      // "400 E 90" → streetNum=400, direction=E, streetPart=90
      const streetNum = dirMatch[1];
      const direction = dirMatch[2].charAt(0); // Normalize to single letter (E, W, N, S)
      const streetPart = dirMatch[3].replace(/(ST|ND|RD|TH)\b/gi, '').trim(); // Strip ordinals
      const streetPartFull = escapeOData(dirMatch[3]); // Keep original too

      const conditions = [
        `startswith(StreetNumber,'${streetNum}')`,
      ];
      // Match direction prefix
      conditions.push(`StreetDirPrefix eq '${direction}'`);
      // Match street name (try with and without ordinal suffix)
      if (streetPart && streetPart !== streetPartFull) {
        conditions.push(`(contains(StreetName,'${escapeOData(streetPart)}') or contains(StreetName,'${streetPartFull}'))`);
      } else if (streetPart) {
        conditions.push(`contains(StreetName,'${escapeOData(streetPart)}')`);
      }
      parts.push(`(${conditions.join(' and ')})`);
    } else {
      const numMatch = raw.match(numOnlyPattern);
      if (numMatch && numMatch[1]) {
        const streetNum = numMatch[1];
        const streetPart = numMatch[2] || "";
        if (streetPart) {
          // "400 Park" or "400 90th" — no direction
          const stripped = streetPart.replace(/(ST|ND|RD|TH)\b/gi, '').trim();
          const nameFilters = [`contains(StreetName,'${escapeOData(streetPart)}')`];
          if (stripped !== streetPart) {
            nameFilters.push(`contains(StreetName,'${escapeOData(stripped)}')`);
          }
          parts.push(`(startswith(StreetNumber,'${streetNum}') and (${nameFilters.join(' or ')}))`);
        } else {
          // Number only
          parts.push(`(startswith(StreetNumber,'${streetNum}') or contains(BuildingName,'${escapeOData(raw)}'))`);
        }
      } else if (/^\d+$/.test(raw)) {
        // Pure number (could be street number or listing ID)
        parts.push(`(startswith(StreetNumber,'${escapeOData(raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`);
      } else {
        // Text only — search street name and building name
        parts.push(`(contains(StreetName,'${escapeOData(raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`);
      }
    }
  }

  // Property sub-type
  const subType = params.get("propertySubType");
  if (subType) {
    parts.push(`PropertySubType eq '${escapeOData(subType)}'`);
  }

  return parts.join(" and ");
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
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
  const price = Number(raw.ListPrice) || 0;
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  const taxAnnual = Number(raw.TaxAnnualAmount) || 0;
  const monthlyTax = taxAnnual / 12;
  const maintCC = Number(raw.AssociationFee) || 0;

  // Address suppression (REBNY compliance)
  const addressDisplayYN = raw.InternetAddressDisplayYN !== false;
  const displayAddress = addressDisplayYN
    ? address
    : "ADDRESS AVAILABLE UPON REQUEST";

  // Media — $expand=Media returns 400 on IDX Plus feed for bulk queries,
  // so raw.Media is typically empty. Map it when available (detail views).
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
      mediaType: String(m.MediaType || "Photo"),
    };
  }).filter((img: { url: string }) => img.url);

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

  // Status normalization
  const mlsStatus = String(raw.MlsStatus || raw.StandardStatus || "Active");
  const statusMap: Record<string, string> = {
    Active: "ACTIVE",
    "Coming Soon": "COMING_SOON",
    "Active Under Contract": "PENDING",
    Pending: "PENDING",
    Closed: "CLOSED",
    Expired: "EXPIRED",
    Withdrawn: "WITHDRAWN",
    Cancelled: "CANCELLED",
  };
  const status = statusMap[mlsStatus] || mlsStatus.toUpperCase();

  return {
    id: index + 1,
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
    ownership: String(raw.CommonInterest || raw.OwnershipType || ""),
    propertyType: String(raw.PropertyType || "Residential"),
    propertySubType: String(raw.PropertySubType || ""),
    neighborhood: String(raw.CityRegion || ""),
    borough: String(raw.CountyOrParish || "Manhattan"),
    zip: String(raw.PostalCode || ""),
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
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
    virtualTourUrl: raw.VirtualTourURLBranded
      ? String(raw.VirtualTourURLBranded)
      : null,
    idxDisplayYN: true, // Pre-filtered by Trestle on IDX Plus feed
    internetDisplayYN: raw.InternetEntireListingDisplayYN !== false,
    addressDisplayYN,
    listingCategory: isRental ? "rental" : undefined,
    comingSoonDate: null, // ComingSoonDate not on IDX Plus feed — detect via StandardStatus
    permissions: {
      ownerOptOut: false, // Pre-filtered by Trestle on IDX Plus feed
      participantOnly: false, // Pre-filtered by Trestle on IDX Plus feed
      idxDisplay: true, // Pre-filtered by Trestle on IDX Plus feed
      internetDisplay: raw.InternetEntireListingDisplayYN !== false,
      syndication: true,
    },
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

    // Build OData filter
    const filter = buildODataFilter(params);

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
    const result = await fetchFromTrestle({
      filter,
      select: SEARCH_SELECT_FIELDS,
      top: limit,
      skip,
      orderby: "ModificationTimestamp desc",
      maxTotal: limit,
    });

    // Apply distribution gates — CRM context: agents see Participant Only + IDX opted-out
    // But still filter: Owner Opt-Out (Gate 1), Closed >24h (Gate 5), IDX participation off (Gate 6)
    const displayable: Record<string, unknown>[] = [];
    for (const record of result.records) {
      const gate = checkDistributionGates(record);
      if (gate.displayable) {
        displayable.push(record);
      }
      // For CRM agent context, also include Participant Only and IDX opted-out listings
      // (Gates 2 & 3 are for public IDX only, agents can see these in RLS)
      else if (
        gate.reason === "Participant-only listing" ||
        gate.reason === "Internet display disabled"
      ) {
        displayable.push(record);
      }
    }

    // Map to CRM flat shape
    const listings = displayable.map((record, i) =>
      mapTrestleToCRM(record, skip + i)
    );

    const response = {
      listings,
      total: listings.length,
      hasMore: result.hasMore,
      skip,
      limit,
      attribution: generateAttributionText(),
      _meta: {
        source: "trestle",
        fetchedAt: new Date().toISOString(),
        filter,
        totalFromAPI: result.totalFetched,
        gatedOut: result.totalFetched - displayable.length,
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
