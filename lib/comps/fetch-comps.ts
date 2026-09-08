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
import { cityRegionForBorough } from "@/lib/listings/canonical-location";
// The canonical comp-eligibility authority (CloseDate windowing, ownership segmentation) — this module is its
// designated consumer (Domain 7, 2026-09-08; the authority's header named the CMA close-price fix as the
// consumer). The vocabulary chain guard lists this importer explicitly.
import { compEligibility } from "@/lib/search/canonical/comp-eligibility";
import { statusGroup } from "@/lib/search/canonical/status";
import { ownershipClass, commonInterestOf } from "@/lib/search/canonical/ownership";
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

/** The live statuses that are closings — windowed by the CLOSING date; every other status is unwindowed. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(["Closed"]);
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Status + window clause for a comps query (Domain 7, 2026-09-08). Closed comps are windowed by
 * `CloseDate ge <asOf − monthsBack>` — never by ModificationTimestamp, which admitted any old closing that was
 * merely touched and dropped 24% of the last year's closings (live 2026-09-08: CloseDate ge 2025-09-08 → 14,942
 * sale closings, only 11,311 of them modified in the last 3 months). On-market statuses are current by
 * definition and carry no window.
 */
export function compsStatusWindowFilter(statuses: string[], monthsBack: number, asOf: Date = new Date()): string {
  const since = new Date(asOf);
  since.setMonth(since.getMonth() - monthsBack);
  const mapped = [...new Set(statuses.map((s) => STATUS_MAP[s] || s))];
  const clauses = mapped.map((s) =>
    CLOSED_STATUSES.has(s) ? `(StandardStatus eq '${s}' and CloseDate ge ${isoDay(since)})` : `StandardStatus eq '${s}'`,
  );
  if (clauses.length === 0) return "";
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(" or ")})`;
}

/** Closed-only comp sets are ordered by the closing date; mixed sets keep the modification order. */
export function compsOrderBy(statuses: string[]): string {
  const mapped = statuses.map((s) => STATUS_MAP[s] || s);
  return mapped.length > 0 && mapped.every((s) => CLOSED_STATUSES.has(s)) ? "CloseDate desc" : "ModificationTimestamp desc";
}

/**
 * Apply the canonical comp-eligibility authority to fetched comps: a closed comp must have a CloseDate inside the
 * window (defense in depth behind the provider clause; a comp without a CloseDate is never dated by anything
 * else), and when the SUBJECT's ownership class is known (live CommonInterest) a comp of a different known class
 * is excluded — co-op comps for a co-op, condo comps for a condo. A comp whose own ownership is unknown is kept
 * (a mismatch cannot be proven). Agent-selected off-market statuses (Expired …) are market observations, not
 * valuation comps, and pass subject to the same ownership rule.
 */
export function applyCompEligibility(
  comps: CompListing[],
  o: { asOf?: Date; monthsBack: number; subjectCommonInterest?: string | null },
): CompListing[] {
  const asOf = o.asOf ?? new Date();
  const target = ownershipClass(o.subjectCommonInterest);
  const segment = target !== "unknown";
  const closedWindowDays = Math.round(o.monthsBack * 30.4375);
  return comps.filter((c) => {
    const group = statusGroup(c.status, "sale");
    const ownership = ownershipClass(c.common_interest);
    const mixOwnership = !segment || ownership === "unknown";
    if (group === "closed_recent" || group === "active_on_market" || group === "pending_contract") {
      return compEligibility(
        { group, ownership, closeDate: c.close_date },
        { targetOwnership: target, asOf, closedWindowDays, mixOwnership },
      ) !== "excluded";
    }
    return mixOwnership || ownership === target;
  });
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
    common_interest: commonInterestOf(r),
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
  /** The subject row's buckets (features / raw_data) — its ownership class segments the comps (unknown = none). */
  subject?: { features?: unknown; raw_data?: unknown } | null;
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
    compsStatusWindowFilter(criteria.statuses, criteria.months_back),
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
      orderby: compsOrderBy(criteria.statuses),
      expandMedia: false,
    });
    return applyCompEligibility(result.records.map(mapToCompListing), { monthsBack: criteria.months_back, subjectCommonInterest: commonInterestOf(ctx.subject) });
  } catch (err) {
    console.warn("[comps] Building comp fetch failed:", (err as Error).message);
    return [];
  }
}

/**
 * The area-comps location clause — neighborhoods, else zip, else borough, else null (no comps).
 *
 * Canonical location (Maya, 2026-09-08, exhaustive live evidence): a neighborhood is
 * `SubdivisionName` and a borough is `CityRegion`. The previous clauses were
 * `CityRegion eq '<neighborhood>'` (0 live rows for 'Upper East Side'; 51,664 on SubdivisionName)
 * and `CountyOrParish eq '<borough>'` (0 live rows for 'Manhattan' and 'Brooklyn' — the county field
 * holds county names), so area comps by neighborhood never matched.
 */
export function areaCompsLocationFilter(
  ctx: Pick<ListingContext, "postal_code" | "borough">,
  criteria: Pick<AreaCompCriteria, "neighborhoods">,
): string | null {
  if (criteria.neighborhoods.length > 0) {
    const clauses = criteria.neighborhoods.map((n) => `SubdivisionName eq '${esc(n)}'`);
    return clauses.length === 1 ? clauses[0] : `(${clauses.join(" or ")})`;
  }
  if (ctx.postal_code) return `PostalCode eq '${esc(ctx.postal_code)}'`;
  const cityRegion = cityRegionForBorough(ctx.borough);
  return cityRegion ? `CityRegion eq '${cityRegion}'` : null;
}

/**
 * Fetch area comps — same neighborhood(s), similar property type, matched by criteria.
 */
async function fetchAreaComps(
  ctx: ListingContext,
  criteria: AreaCompCriteria,
): Promise<CompListing[]> {
  const filters: string[] = [];

  const location = areaCompsLocationFilter(ctx, criteria);
  if (!location) return [];
  filters.push(location);

  // Property type — match same general type
  if (ctx.property_type) {
    filters.push(`PropertyType eq '${esc(ctx.property_type)}'`);
  }

  filters.push(compsStatusWindowFilter(criteria.statuses, criteria.months_back));
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
      orderby: compsOrderBy(criteria.statuses),
      expandMedia: false,
    });
    return applyCompEligibility(result.records.map(mapToCompListing), { monthsBack: criteria.months_back, subjectCommonInterest: commonInterestOf(ctx.subject) });
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
