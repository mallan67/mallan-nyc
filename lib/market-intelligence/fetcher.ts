/**
 * Market Intelligence — Shared Trestle Data Fetcher
 *
 * Single gateway for all market intelligence tools. Queries Trestle RLS
 * once per borough, caches results in memory (1 hour TTL), and segments
 * listings by status category.
 *
 * COMPLIANCE:
 * - Server-side only (never called from browser)
 * - Explicit $select — NO compensation fields
 * - No "Off-Market" language (uses REBNY-approved statuses)
 * - REBNY statistical disclaimer included in every response
 * - DOM uses CumulativeDaysOnMarket per UCBA 2026
 */

import { fetchFromTrestle } from "@/lib/idx/fetch";

// ─── Types ────────────────────────────────────────────────

export interface MarketFilters {
  listingType: "sale" | "rent";
  propertyTypes?: string[]; // Condo, Co-op, Condop, Townhouse
  borough?: string; // Manhattan, Brooklyn, Queens, Bronx, Staten Island
  neighborhoods?: string[]; // MLSAreaMajor values
  bedroomRange?: { min?: number; max?: number };
  priceRange?: { min?: number; max?: number };
  dateRange?: { start: string; end: string }; // ISO dates
}

export type StatusSegment =
  | "new_listings"
  | "coming_soon"
  | "price_drops"
  | "contract_signed"
  | "temp_off_market"
  | "expired"
  | "closed";

export interface TrestleListing {
  ListingId: string;
  ListPrice: number;
  ClosePrice: number | null;
  OriginalListPrice: number | null;
  BedroomsTotal: number;
  BathroomsFull: number;
  BathroomsHalf: number;
  LivingArea: number | null;
  DaysOnMarket: number;
  CumulativeDaysOnMarket: number;
  StreetNumber: string;
  StreetName: string;
  UnitNumber: string | null;
  MLSAreaMajor: string;
  CountyOrParish: string;
  PropertySubType: string;
  PropertyType: string;
  AssociationFee: number | null;
  TaxAnnualAmount: number | null;
  RoomsTotal: number | null;
  ListOfficeName: string;
  StandardStatus: string;
  OnMarketDate: string | null;
  ModificationTimestamp: string;
  PatioAndPorchFeatures: string[] | null;
}

export interface NeighborhoodStats {
  neighborhood: string;
  borough: string;
  activeCount: number;
  medianPrice: number;
  avgPrice: number;
  avgPricePerSqft: number;
  avgDom: number;
  newListings30d: number;
  avgMaintenance: number;
  priceRange: { min: number; max: number };
  inventoryByBeds: Record<number, number>;
}

export interface MarketDataSet {
  segments: Record<StatusSegment, TrestleListing[]>;
  neighborhoodStats: NeighborhoodStats[];
  totalCount: number;
  fetchedAt: string;
  filters: MarketFilters;
  disclaimer: string;
}

// ─── Constants ────────────────────────────────────────────

/** Fields fetched from Trestle — NO compensation fields */
const INTEL_SELECT_FIELDS = [
  "ListingId",
  "ListPrice",
  "ClosePrice",
  "OriginalListPrice",
  "BedroomsTotal",
  "BathroomsFull",
  "BathroomsHalf",
  "LivingArea",
  "DaysOnMarket",
  "CumulativeDaysOnMarket",
  "StreetNumber",
  "StreetName",
  "UnitNumber",
  "MLSAreaMajor",
  "CountyOrParish",
  "PropertySubType",
  "PropertyType",
  "AssociationFee",
  "TaxAnnualAmount",
  "RoomsTotal",
  "ListOfficeName",
  "StandardStatus",
  "OnMarketDate",
  "ModificationTimestamp",
  "PatioAndPorchFeatures",
];

const BOROUGH_MAP: Record<string, string> = {
  Manhattan: "New York",
  Brooklyn: "Kings",
  Queens: "Queens",
  Bronx: "Bronx",
  "Staten Island": "Richmond",
};

const REVERSE_BOROUGH_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(BOROUGH_MAP).map(([k, v]) => [v, k])
);

export const REBNY_DISCLAIMER =
  "Based on information from the REBNY Listing Service. " +
  "The REBNY Listing Service makes no representations or warranties with respect to the accuracy " +
  "or completeness of such information and shall not be held liable for any omission or inaccuracy thereof. " +
  "Broker commissions are not set by law and are fully negotiable. Equal Housing Opportunity.";

const PROPERTY_TYPE_MAP: Record<string, string> = {
  Condo: "PropertySubType eq 'Condominium' or PropertySubType eq 'Condo'",
  "Co-op":
    "PropertySubType eq 'StockCooperative' or PropertySubType eq 'Cooperative'",
  Condop: "PropertySubType eq 'Condop'",
  Townhouse:
    "PropertySubType eq 'SingleFamilyTownhouse' or PropertySubType eq 'Townhouse'",
};

// ─── In-Memory Cache ──────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  data: MarketDataSet;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(filters: MarketFilters): string {
  return JSON.stringify({
    t: filters.listingType,
    b: filters.borough || "all",
    p: filters.propertyTypes?.sort().join(",") || "all",
    n: filters.neighborhoods?.sort().join(",") || "all",
    br: filters.bedroomRange
      ? `${filters.bedroomRange.min || 0}-${filters.bedroomRange.max || 99}`
      : "all",
    pr: filters.priceRange
      ? `${filters.priceRange.min || 0}-${filters.priceRange.max || 999999999}`
      : "all",
    dr: filters.dateRange
      ? `${filters.dateRange.start}-${filters.dateRange.end}`
      : "all",
  });
}

// ─── OData Filter Builder ─────────────────────────────────

function buildFilter(filters: MarketFilters): string {
  const parts: string[] = [];

  // Listing type
  if (filters.listingType === "rent") {
    parts.push("PropertyType eq 'Residential Lease'");
  } else {
    parts.push("PropertyType eq 'Residential'");
  }

  // Property sub-types
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    const typeFilters = filters.propertyTypes
      .map((t) => PROPERTY_TYPE_MAP[t])
      .filter(Boolean);
    if (typeFilters.length > 0) {
      parts.push(`(${typeFilters.join(" or ")})`);
    }
  }

  // Borough
  if (filters.borough) {
    const county = BOROUGH_MAP[filters.borough] || filters.borough;
    parts.push(`CountyOrParish eq '${county}'`);
  }

  // Neighborhoods
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    const nhFilter = filters.neighborhoods
      .map((n) => `MLSAreaMajor eq '${n.replace(/'/g, "''")}'`)
      .join(" or ");
    parts.push(`(${nhFilter})`);
  }

  // Price range
  if (filters.priceRange) {
    if (filters.priceRange.min) {
      parts.push(`ListPrice ge ${filters.priceRange.min}`);
    }
    if (filters.priceRange.max) {
      parts.push(`ListPrice le ${filters.priceRange.max}`);
    }
  }

  // Bedrooms
  if (filters.bedroomRange) {
    if (filters.bedroomRange.min != null) {
      parts.push(`BedroomsTotal ge ${filters.bedroomRange.min}`);
    }
    if (filters.bedroomRange.max != null) {
      parts.push(`BedroomsTotal le ${filters.bedroomRange.max}`);
    }
  }

  return parts.join(" and ");
}

// ─── Status Segmentation ─────────────────────────────────

function segmentListings(
  listings: TrestleListing[],
  dateRange?: { start: string; end: string }
): Record<StatusSegment, TrestleListing[]> {
  const segments: Record<StatusSegment, TrestleListing[]> = {
    new_listings: [],
    coming_soon: [],
    price_drops: [],
    contract_signed: [],
    temp_off_market: [],
    expired: [],
    closed: [],
  };

  const rangeStart = dateRange?.start ? new Date(dateRange.start) : null;
  const rangeEnd = dateRange?.end ? new Date(dateRange.end) : null;

  for (const listing of listings) {
    const status = listing.StandardStatus;

    // Date range filter (if provided)
    if (rangeStart || rangeEnd) {
      const modDate = new Date(listing.ModificationTimestamp);
      if (rangeStart && modDate < rangeStart) continue;
      if (rangeEnd && modDate > rangeEnd) continue;
    }

    switch (status) {
      case "Active":
        // Check if it's a price drop
        if (
          listing.OriginalListPrice &&
          listing.ListPrice < listing.OriginalListPrice
        ) {
          segments.price_drops.push(listing);
        }
        // Check if new listing (within 30 days)
        if (listing.OnMarketDate) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          if (new Date(listing.OnMarketDate) >= thirtyDaysAgo) {
            segments.new_listings.push(listing);
          }
        }
        break;
      case "ComingSoon":
        segments.coming_soon.push(listing);
        break;
      case "ActiveUnderContract":
      case "Pending":
        segments.contract_signed.push(listing);
        break;
      case "Hold":
      case "Withdrawn":
        segments.temp_off_market.push(listing);
        break;
      case "Expired":
      case "Canceled":
        segments.expired.push(listing);
        break;
      case "Closed":
        segments.closed.push(listing);
        break;
    }
  }

  return segments;
}

// ─── Neighborhood Stats ──────────────────────────────────

function computeNeighborhoodStats(
  listings: TrestleListing[]
): NeighborhoodStats[] {
  // Group active listings by neighborhood
  const activeByNeighborhood = new Map<string, TrestleListing[]>();
  for (const l of listings) {
    if (
      l.StandardStatus !== "Active" &&
      l.StandardStatus !== "ComingSoon"
    )
      continue;
    const nh = l.MLSAreaMajor || "Unknown";
    const arr = activeByNeighborhood.get(nh) || [];
    arr.push(l);
    activeByNeighborhood.set(nh, arr);
  }

  const stats: NeighborhoodStats[] = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const [neighborhood, nhListings] of activeByNeighborhood) {
    const prices = nhListings
      .map((l) => l.ListPrice)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    const medianPrice =
      prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
    const avgPrice =
      prices.length > 0
        ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
        : 0;

    // Price per sqft
    const withArea = nhListings.filter(
      (l) => l.LivingArea && l.LivingArea > 0 && l.ListPrice > 0
    );
    const avgPpSqft =
      withArea.length > 0
        ? Math.round(
            withArea.reduce(
              (s, l) => s + l.ListPrice / l.LivingArea!,
              0
            ) / withArea.length
          )
        : 0;

    // DOM — use CumulativeDaysOnMarket per UCBA 2026
    const domValues = nhListings
      .map((l) => l.CumulativeDaysOnMarket || l.DaysOnMarket || 0)
      .filter((d) => d >= 0);
    const avgDom =
      domValues.length > 0
        ? Math.round(domValues.reduce((s, d) => s + d, 0) / domValues.length)
        : 0;

    // Maintenance / CC
    const maintValues = nhListings
      .map((l) => l.AssociationFee || 0)
      .filter((m) => m > 0);
    const avgMaint =
      maintValues.length > 0
        ? Math.round(
            maintValues.reduce((s, m) => s + m, 0) / maintValues.length
          )
        : 0;

    // New listings in last 30 days
    const newListings = nhListings.filter(
      (l) =>
        l.OnMarketDate && new Date(l.OnMarketDate) >= thirtyDaysAgo
    ).length;

    // Inventory by bedrooms
    const inventoryByBeds: Record<number, number> = {};
    for (const l of nhListings) {
      const beds = l.BedroomsTotal || 0;
      inventoryByBeds[beds] = (inventoryByBeds[beds] || 0) + 1;
    }

    // Borough from CountyOrParish
    const county = nhListings[0]?.CountyOrParish || "";
    const borough = REVERSE_BOROUGH_MAP[county] || county;

    stats.push({
      neighborhood,
      borough,
      activeCount: nhListings.length,
      medianPrice,
      avgPrice,
      avgPricePerSqft: avgPpSqft,
      avgDom,
      newListings30d: newListings,
      avgMaintenance: avgMaint,
      priceRange: {
        min: prices.length > 0 ? prices[0] : 0,
        max: prices.length > 0 ? prices[prices.length - 1] : 0,
      },
      inventoryByBeds,
    });
  }

  return stats.sort((a, b) => b.activeCount - a.activeCount);
}

// ─── Main Fetch Function ─────────────────────────────────

/**
 * Fetch market data from Trestle RLS. Returns segmented listings +
 * neighborhood stats. Cached for 1 hour per filter combination.
 *
 * This is the SINGLE data gateway for all market intelligence tools.
 */
export async function fetchMarketData(
  filters: MarketFilters
): Promise<MarketDataSet> {
  // Check cache
  const key = getCacheKey(filters);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Build OData filter — fetch all statuses in ONE query
  const baseFilter = buildFilter(filters);

  // Fetch all statuses to segment client-side (one Trestle round trip)
  const statusFilter =
    "StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or " +
    "StandardStatus eq 'ActiveUnderContract' or StandardStatus eq 'Pending' or " +
    "StandardStatus eq 'Hold' or StandardStatus eq 'Withdrawn' or " +
    "StandardStatus eq 'Expired' or StandardStatus eq 'Canceled' or " +
    "StandardStatus eq 'Closed'";

  const filter = `(${statusFilter}) and ${baseFilter}`;

  const result = await fetchFromTrestle({
    filter,
    top: 500,
    maxTotal: 500,
    count: true,
    expandMedia: false,
    select: INTEL_SELECT_FIELDS,
    orderby: "ModificationTimestamp desc",
  });

  // Map raw records to typed listings
  const listings: TrestleListing[] = result.records.map((r) => ({
    ListingId: String(r.ListingId || ""),
    ListPrice: Number(r.ListPrice) || 0,
    ClosePrice: r.ClosePrice ? Number(r.ClosePrice) : null,
    OriginalListPrice: r.OriginalListPrice
      ? Number(r.OriginalListPrice)
      : null,
    BedroomsTotal: Number(r.BedroomsTotal) || 0,
    BathroomsFull: Number(r.BathroomsFull) || 0,
    BathroomsHalf: Number(r.BathroomsHalf) || 0,
    LivingArea: r.LivingArea ? Number(r.LivingArea) : null,
    DaysOnMarket: Number(r.DaysOnMarket) || 0,
    CumulativeDaysOnMarket: Number(r.CumulativeDaysOnMarket) || 0,
    StreetNumber: String(r.StreetNumber || ""),
    StreetName: String(r.StreetName || ""),
    UnitNumber: r.UnitNumber ? String(r.UnitNumber) : null,
    MLSAreaMajor: String(r.MLSAreaMajor || ""),
    CountyOrParish: String(r.CountyOrParish || ""),
    PropertySubType: String(r.PropertySubType || ""),
    PropertyType: String(r.PropertyType || ""),
    AssociationFee: r.AssociationFee ? Number(r.AssociationFee) : null,
    TaxAnnualAmount: r.TaxAnnualAmount ? Number(r.TaxAnnualAmount) : null,
    RoomsTotal: r.RoomsTotal ? Number(r.RoomsTotal) : null,
    ListOfficeName: String(r.ListOfficeName || ""),
    StandardStatus: String(r.StandardStatus || ""),
    OnMarketDate: r.OnMarketDate ? String(r.OnMarketDate) : null,
    ModificationTimestamp: String(r.ModificationTimestamp || ""),
    PatioAndPorchFeatures: Array.isArray(r.PatioAndPorchFeatures)
      ? (r.PatioAndPorchFeatures as string[])
      : null,
  }));

  // Segment by status
  const segments = segmentListings(listings, filters.dateRange);

  // Compute neighborhood stats from active listings
  const neighborhoodStats = computeNeighborhoodStats(listings);

  const dataset: MarketDataSet = {
    segments,
    neighborhoodStats,
    totalCount: result.odataCount || listings.length,
    fetchedAt: new Date().toISOString(),
    filters,
    disclaimer: REBNY_DISCLAIMER,
  };

  // Cache the result
  cache.set(key, {
    data: dataset,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return dataset;
}

/**
 * Fetch listings for specific neighborhoods (used by auto-send to match client preferences).
 * Lighter query — only active listings matching specific criteria.
 */
export async function fetchListingsForPreferences(options: {
  listingType: "sale" | "rent";
  neighborhoods: string[];
  propertyTypes?: string[];
  priceRange?: { min?: number; max?: number };
  bedroomRange?: { min?: number; max?: number };
  limit?: number;
}): Promise<TrestleListing[]> {
  const filters: MarketFilters = {
    listingType: options.listingType,
    neighborhoods: options.neighborhoods,
    propertyTypes: options.propertyTypes,
    priceRange: options.priceRange,
    bedroomRange: options.bedroomRange,
  };

  const baseFilter = buildFilter(filters);
  const filter = `StandardStatus eq 'Active' and ${baseFilter}`;

  const result = await fetchFromTrestle({
    filter,
    top: options.limit || 50,
    maxTotal: options.limit || 50,
    count: false,
    expandMedia: false,
    select: INTEL_SELECT_FIELDS,
    orderby: "OnMarketDate desc",
  });

  return result.records.map((r) => ({
    ListingId: String(r.ListingId || ""),
    ListPrice: Number(r.ListPrice) || 0,
    ClosePrice: r.ClosePrice ? Number(r.ClosePrice) : null,
    OriginalListPrice: r.OriginalListPrice
      ? Number(r.OriginalListPrice)
      : null,
    BedroomsTotal: Number(r.BedroomsTotal) || 0,
    BathroomsFull: Number(r.BathroomsFull) || 0,
    BathroomsHalf: Number(r.BathroomsHalf) || 0,
    LivingArea: r.LivingArea ? Number(r.LivingArea) : null,
    DaysOnMarket: Number(r.DaysOnMarket) || 0,
    CumulativeDaysOnMarket: Number(r.CumulativeDaysOnMarket) || 0,
    StreetNumber: String(r.StreetNumber || ""),
    StreetName: String(r.StreetName || ""),
    UnitNumber: r.UnitNumber ? String(r.UnitNumber) : null,
    MLSAreaMajor: String(r.MLSAreaMajor || ""),
    CountyOrParish: String(r.CountyOrParish || ""),
    PropertySubType: String(r.PropertySubType || ""),
    PropertyType: String(r.PropertyType || ""),
    AssociationFee: r.AssociationFee ? Number(r.AssociationFee) : null,
    TaxAnnualAmount: r.TaxAnnualAmount ? Number(r.TaxAnnualAmount) : null,
    RoomsTotal: r.RoomsTotal ? Number(r.RoomsTotal) : null,
    ListOfficeName: String(r.ListOfficeName || ""),
    StandardStatus: String(r.StandardStatus || ""),
    OnMarketDate: r.OnMarketDate ? String(r.OnMarketDate) : null,
    ModificationTimestamp: String(r.ModificationTimestamp || ""),
    PatioAndPorchFeatures: Array.isArray(r.PatioAndPorchFeatures)
      ? (r.PatioAndPorchFeatures as string[])
      : null,
  }));
}

/**
 * Clear the in-memory cache (useful for testing or forced refresh).
 */
export function clearMarketCache(): void {
  cache.clear();
}
