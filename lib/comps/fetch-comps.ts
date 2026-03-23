/**
 * Fetch comparable listings from Trestle for a seller's listing.
 *
 * Two scopes:
 *   1. Building comps — same building (by BuildingName or address), matched by beds/baths/sqft/status
 *   2. Area comps — same neighborhood(s), similar property type, matched by beds/baths/sqft/price/status
 *
 * When sqft_enabled is false, sqft filters are dropped and comps match on beds/baths/price only.
 * Agent can adjust all criteria from the CRM.
 */

import { fetchFromTrestle } from "@/lib/idx/fetch";
import { CARD_SELECT_FIELDS } from "@/lib/idx/card-fields";
import type { CompCriteria, CompListing, CompResults, BuildingCompCriteria, AreaCompCriteria } from "./types";

// Trestle status values mapped from our display names
const STATUS_MAP: Record<string, string> = {
  "Active": "Active",
  "Under Contract": "ActiveUnderContract",
  "Closed": "Closed",
  "Expired": "Expired",
  "Coming Soon": "ComingSoon",
  "Pending": "Pending",
};

function statusFilter(statuses: string[]): string {
  const mapped = statuses
    .map((s) => STATUS_MAP[s] || s)
    .map((s) => `'${s}'`);
  if (mapped.length === 0) return "";
  if (mapped.length === 1) return `StandardStatus eq ${mapped[0]}`;
  return `(${mapped.map((s) => `StandardStatus eq ${s}`).join(" or ")})`;
}

function dateFilter(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return `ModificationTimestamp gt ${d.toISOString()}`;
}

function bedsFilter(min: number, max: number): string {
  return `BedroomsTotal ge ${min} and BedroomsTotal le ${max}`;
}

function bathsFilter(min: number, max: number): string {
  return `BathroomsTotalInteger ge ${min} and BathroomsTotalInteger le ${max}`;
}

function sqftFilter(min: number | null, max: number | null, enabled: boolean): string {
  if (!enabled || min == null || max == null) return "";
  return `LivingArea ge ${min} and LivingArea le ${max}`;
}

function priceFilter(min: number | null, max: number | null): string {
  if (min == null || max == null) return "";
  return `ListPrice ge ${min} and ListPrice le ${max}`;
}

/** Escape OData string value */
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function mapToCompListing(r: Record<string, unknown>): CompListing {
  const listPrice = Number(r.ListPrice) || 0;
  const sqft = Number(r.LivingArea) || null;
  const closePrice = r.ClosePrice ? Number(r.ClosePrice) : null;

  return {
    listing_id: String(r.ListingId || ""),
    address: [r.StreetNumber, r.StreetDirPrefix, r.StreetName, r.StreetSuffix, r.StreetDirSuffix]
      .filter(Boolean).join(" "),
    unit: String(r.UnitNumber || ""),
    status: String(r.StandardStatus || ""),
    property_type: String(r.PropertyType || ""),
    beds: r.BedroomsTotal != null ? Number(r.BedroomsTotal) : null,
    baths: r.BathroomsTotalInteger != null ? Number(r.BathroomsTotalInteger) : null,
    sqft,
    list_price: listPrice,
    close_price: closePrice,
    close_date: r.CloseDate ? String(r.CloseDate) : null,
    days_on_market: r.DaysOnMarket != null ? Number(r.DaysOnMarket) : null,
    price_per_sqft: sqft && sqft > 0 ? Math.round((closePrice || listPrice) / sqft) : null,
    building_name: String(r.BuildingName || ""),
    listing_agent: String(r.ListAgentFullName || ""),
    listing_office: String(r.ListOfficeName || ""),
    photo_count: Number(r.PhotosCount) || 0,
  };
}

interface ListingContext {
  listing_id: string;
  building_name: string | null;
  street_number: string | null;
  street_name: string | null;
  neighborhood: string | null;
  borough: string | null;
  postal_code: string | null;
  property_type: string | null;
}

/**
 * Fetch building comps — same building, matched by criteria.
 */
async function fetchBuildingComps(
  ctx: ListingContext,
  criteria: BuildingCompCriteria,
): Promise<CompListing[]> {
  // Identify building: prefer BuildingName, fallback to street address
  const buildingFilters: string[] = [];

  if (ctx.building_name) {
    buildingFilters.push(`BuildingName eq '${esc(ctx.building_name)}'`);
  } else if (ctx.street_number && ctx.street_name) {
    buildingFilters.push(`StreetNumber eq '${esc(ctx.street_number)}'`);
    buildingFilters.push(`StreetName eq '${esc(ctx.street_name)}'`);
  } else {
    return []; // Can't identify building without name or address
  }

  const filters = [
    ...buildingFilters,
    statusFilter(criteria.statuses),
    dateFilter(criteria.months_back),
    bedsFilter(criteria.beds_min, criteria.beds_max),
    bathsFilter(criteria.baths_min, criteria.baths_max),
    sqftFilter(criteria.sqft_min, criteria.sqft_max, criteria.sqft_enabled),
    // Exclude the subject listing
    `ListingId ne '${esc(ctx.listing_id)}'`,
  ].filter(Boolean);

  try {
    const result = await fetchFromTrestle({
      filter: filters.join(" and "),
      select: CARD_SELECT_FIELDS,
      top: 50,
      maxTotal: 50,
      orderby: "ModificationTimestamp desc",
      expandMedia: false,
    });
    return result.records.map(mapToCompListing);
  } catch (err) {
    console.warn("[comps] Building comp fetch failed:", (err as Error).message);
    return [];
  }
}

/**
 * Fetch area comps — same neighborhood(s), similar property type, matched by criteria.
 */
async function fetchAreaComps(
  ctx: ListingContext,
  criteria: AreaCompCriteria,
): Promise<CompListing[]> {
  const filters: string[] = [];

  // Neighborhood filter
  if (criteria.neighborhoods.length > 0) {
    const nhoodClauses = criteria.neighborhoods.map(
      (n) => `CityRegion eq '${esc(n)}'`
    );
    filters.push(nhoodClauses.length === 1 ? nhoodClauses[0] : `(${nhoodClauses.join(" or ")})`);
  } else if (ctx.postal_code) {
    filters.push(`PostalCode eq '${esc(ctx.postal_code)}'`);
  } else if (ctx.borough) {
    filters.push(`CountyOrParish eq '${esc(ctx.borough)}'`);
  } else {
    return [];
  }

  // Property type — match same general type
  if (ctx.property_type) {
    filters.push(`PropertyType eq '${esc(ctx.property_type)}'`);
  }

  filters.push(statusFilter(criteria.statuses));
  filters.push(dateFilter(criteria.months_back));
  filters.push(bedsFilter(criteria.beds_min, criteria.beds_max));
  filters.push(bathsFilter(criteria.baths_min, criteria.baths_max));

  const sqft = sqftFilter(criteria.sqft_min, criteria.sqft_max, criteria.sqft_enabled);
  if (sqft) filters.push(sqft);

  const price = priceFilter(criteria.price_min, criteria.price_max);
  if (price) filters.push(price);

  // Exclude the subject listing
  filters.push(`ListingId ne '${esc(ctx.listing_id)}'`);

  try {
    const result = await fetchFromTrestle({
      filter: filters.filter(Boolean).join(" and "),
      select: CARD_SELECT_FIELDS,
      top: 50,
      maxTotal: 50,
      orderby: "CloseDate desc,ModificationTimestamp desc",
      expandMedia: false,
    });
    return result.records.map(mapToCompListing);
  } catch (err) {
    console.warn("[comps] Area comp fetch failed:", (err as Error).message);
    return [];
  }
}

/**
 * Fetch both building and area comps for a listing.
 */
export async function fetchComps(
  ctx: ListingContext,
  criteria: CompCriteria,
): Promise<CompResults> {
  const [building, area] = await Promise.all([
    fetchBuildingComps(ctx, criteria.building),
    fetchAreaComps(ctx, criteria.area),
  ]);

  return {
    building,
    area,
    criteria,
    listing_id: ctx.listing_id,
    fetched_at: new Date().toISOString(),
  };
}
