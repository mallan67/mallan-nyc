/**
 * CMA Engine — Comparable Market Analysis on LIVE Cotality listings.
 *
 * Comparables are read from Cotality through the same mapping layer as Agent Search
 * (lib/search/crm-idx-filter.ts + lib/idx/geography.ts): closed sales or rentals in the subject's
 * neighborhood (every live spelling), same side (sale / rental), same ownership type when known,
 * bedrooms within one, closed within the chosen number of months, optionally with on-market
 * listings. The agent may instead hand over the exact ListingKeys they picked in Comparable
 * Reports. Nothing is read from the local database; the finished report is stored in Mallan's own
 * CmaReport table by the route.
 */
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { getLiveGeography, type GeoInventory } from "@/lib/idx/geography";
import { buildCrmIdxQuery, escapeOData } from "@/lib/search/crm-idx-filter";
import { mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";

export interface CmaInput {
  property_address: string;
  unit?: string;
  borough?: string;
  neighborhood?: string;
  /** "sale" (default) or "rental" */
  listing_type?: string;
  /** Live Cotality CommonInterest value (Condominium, StockCooperative, Condop …) when known */
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  living_area?: number;
  floor?: number;
  notes?: string;
  /** Cotality ListingKey of the subject when it is an RLS listing */
  subject_listing_key?: string;
  /** Exact comparables chosen by the agent (Cotality ListingKeys); skips the automatic search */
  comp_listing_keys?: string[];
  /** Closed within this many months (default 6) */
  months?: number;
  /** Also consider on-market (Active / Pending) listings as comparables */
  include_active?: boolean;
  /** The subject's monthlies: maintenance or common charges plus taxes per month */
  monthly_cost?: number;
  /** The agent's adjustment rules for this CMA (variations the agent picks; defaults below) */
  rates?: CmaRates;
  /** The agent's own adjustments per comparable (Cotality ListingKey → lines), Broker Price Opinion style */
  manual?: Record<string, ManualAdjustment[]>;
}

/**
 * Adjustment rules. Every rate is a fraction of the comparable's price per unit of difference,
 * except monthly_per_100: dollars per $100/month of monthlies difference. A rate of 0 switches
 * that line off. Defaults = DEFAULT_RATES (the rules the CRM used before 2026-10-27).
 */
export interface CmaRates {
  bedroom?: number;
  bathroom?: number;
  living_area?: number;
  floor?: number;
  /** Largest floor adjustment either way, as a fraction of the price (0 = no cap) */
  floor_cap?: number;
  monthly_per_100?: number;
}

/** One agent-entered adjustment line (condition, exposure, view, outdoor space, renovation, other…) */
export interface ManualAdjustment {
  label: string;
  /** Percent of the comparable's price (+ raises the comparable's adjusted price) */
  pct?: number;
  /** Dollar amount (used instead of pct when given) */
  amount?: number;
  note?: string;
}

export const DEFAULT_RATES: Required<CmaRates> = {
  bedroom: 0.05,       // 5% per bedroom difference
  bathroom: 0.03,      // 3% per bathroom
  living_area: 0.0002, // 0.02% per square foot difference
  floor: 0.01,         // 1% per floor difference
  floor_cap: 0,        // no cap
  monthly_per_100: 0,  // monthlies not priced (the agent picks a variation)
};

/** Rates as given, with every value a finite non-negative number and the defaults for the rest. */
export function resolveRates(rates?: CmaRates | null): Required<CmaRates> {
  const out = { ...DEFAULT_RATES };
  if (!rates || typeof rates !== "object") return out;
  (Object.keys(DEFAULT_RATES) as Array<keyof CmaRates>).forEach((k) => {
    const v = Number((rates as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = k === "floor_cap" ? Math.min(v, 1) : k === "monthly_per_100" ? Math.min(v, 100_000) : Math.min(v, 1);
  });
  return out;
}

/** Manual lines as given, trimmed to what the engine prices (label ≤ 60 chars, finite numbers, ≤ 20 lines). */
export function cleanManual(lines: unknown): ManualAdjustment[] {
  if (!Array.isArray(lines)) return [];
  const out: ManualAdjustment[] = [];
  for (const raw of lines.slice(0, 20)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = String(r.label || "").trim().slice(0, 60);
    if (!label) continue;
    const line: ManualAdjustment = { label };
    if (Number.isFinite(Number(r.amount)) && r.amount !== null && r.amount !== "") line.amount = Math.max(-10_000_000, Math.min(10_000_000, Number(r.amount)));
    else if (Number.isFinite(Number(r.pct)) && r.pct !== null && r.pct !== "") line.pct = Math.max(-100, Math.min(100, Number(r.pct)));
    else continue;
    if (r.note) line.note = String(r.note).slice(0, 200);
    out.push(line);
  }
  return out;
}

export interface Adjustment {
  field: string;
  subject_value: string | number | null;
  comp_value: string | number | null;
  adjustment_pct: number;
  adjustment_usd: number;
}

export interface CompResult {
  listing_key: string;
  listing_id: string;
  address: string | null;
  unit: string | null;
  neighborhood: string | null;
  borough: string | null;
  status: string;
  /** Close price for closed listings, otherwise the list price */
  list_price: number;
  close_price: number | null;
  close_date: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  living_area: number | null;
  floor: number | null;
  price_per_sqft: number | null;
  days_on_market: number | null;
  /** Monthlies: maintenance or common charges plus taxes per month (AssociationFee + TaxAnnualAmount / 12), null when Cotality carries neither */
  monthly_cost: number | null;
  /** Live Cotality facts the Broker Price Opinion grid shows beside the agent's adjustments */
  exposures: string | null;
  view: string | null;
  outdoor: string | null;
  year_built: number | null;
  similarity_score: number;
  adjustments: Adjustment[];
  adjusted_price: number;
  /** A visible note when Cotality's record is implausible (e.g. a future close date) */
  data_note: string | null;
}

/** Property fields a comparable needs (all live on this licence; mapped by crm-idx-mapper). */
export const CMA_SELECT_FIELDS = [
  "ListingKey", "ListingId", "StandardStatus", "PropertyType", "PropertySubType", "CommonInterest", "Permission",
  "StreetNumber", "StreetDirPrefix", "StreetName", "StreetSuffix", "StreetDirSuffix", "UnitNumber", "BuildingName",
  "SubdivisionName", "CityRegion", "PostalCode",
  "ListPrice", "OriginalListPrice", "ClosePrice", "CloseDate", "PurchaseContractDate", "ListingContractDate",
  "OnMarketDate", "OffMarketDate", "ModificationTimestamp",
  "BedroomsTotal", "BathroomsTotalInteger", "BathroomsFull", "BathroomsHalf", "RoomsTotal", "LivingArea", "EntryLevel",
  "YearBuilt", "StoriesTotal", "NumberOfUnitsTotal", "AssociationFee", "TaxAnnualAmount", "PhotosCount",
  "Exposures", "View", "PatioAndPorchFeatures", "DirectionFaces",
  "ListAgentFullName", "ListOfficeName", "ListOfficeMlsId", "BuyerOfficeMlsId", "BuyerFinancing",
];

const quoteKey = (k: string) => `'${escapeOData(String(k))}'`;

/**
 * One comparable from a mapped live listing, adjusted to the subject. Pure; unit-tested.
 * Sign convention: an adjustment moves the comparable's price toward what it would have fetched as
 * the subject (a smaller comp is adjusted up; a comp with higher monthlies is adjusted up).
 */
export function compFromListing(subject: CmaInput, listing: Record<string, unknown>, rates?: CmaRates | null, manual?: ManualAdjustment[] | null): CompResult {
  const R = resolveRates(rates ?? subject.rates);
  const status = String(listing.status || "");
  const closePrice = typeof listing.closePrice === "number" && listing.closePrice > 0 ? listing.closePrice : null;
  const basePrice = closePrice ?? (Number(listing.price) || 0);
  const beds = listing.beds != null ? Number(listing.beds) : null;
  const baths = listing.baths != null ? Number(listing.baths) : null;
  const sqft = listing.intSqft != null && Number(listing.intSqft) > 0 ? Number(listing.intSqft) : null;
  const floor = listing.floor != null && listing.floor !== "" && !Number.isNaN(Number(listing.floor)) ? Number(listing.floor) : null;
  const monthly = typeof listing.totalMonthly === "number" && listing.totalMonthly > 0 ? Math.round(listing.totalMonthly) : null;
  const adjustments: Adjustment[] = [];
  let adjusted = basePrice;

  if (R.bedroom > 0 && subject.bedrooms != null && beds != null) {
    const diff = subject.bedrooms - beds;
    if (diff !== 0) {
      const adj = diff * R.bedroom * basePrice;
      adjustments.push({ field: "bedrooms", subject_value: subject.bedrooms, comp_value: beds, adjustment_pct: diff * R.bedroom * 100, adjustment_usd: Math.round(adj) });
      adjusted += adj;
    }
  }
  if (R.bathroom > 0 && subject.bathrooms != null && baths != null) {
    const diff = subject.bathrooms - baths;
    if (diff !== 0) {
      const adj = diff * R.bathroom * basePrice;
      adjustments.push({ field: "bathrooms", subject_value: subject.bathrooms, comp_value: baths, adjustment_pct: diff * R.bathroom * 100, adjustment_usd: Math.round(adj) });
      adjusted += adj;
    }
  }
  if (R.living_area > 0 && subject.living_area && sqft) {
    const diff = subject.living_area - sqft;
    if (Math.abs(diff) > 50) {
      const adj = diff * R.living_area * basePrice;
      adjustments.push({ field: "living_area", subject_value: subject.living_area, comp_value: sqft, adjustment_pct: diff * R.living_area * 100, adjustment_usd: Math.round(adj) });
      adjusted += adj;
    }
  }
  if (R.floor > 0 && subject.floor != null && floor != null) {
    const diff = subject.floor - floor;
    if (diff !== 0) {
      let frac = diff * R.floor;
      if (R.floor_cap > 0) frac = Math.max(-R.floor_cap, Math.min(R.floor_cap, frac));
      const adj = frac * basePrice;
      adjustments.push({ field: "floor", subject_value: subject.floor, comp_value: floor, adjustment_pct: frac * 100, adjustment_usd: Math.round(adj) });
      adjusted += adj;
    }
  }
  // Monthlies: a comparable that costs more to carry each month sold for less than the subject would
  // (Maya 2026-10-27: "the maint is better than the other units"); priced per $100/month.
  if (R.monthly_per_100 > 0 && subject.monthly_cost && subject.monthly_cost > 0 && monthly != null) {
    const diff = monthly - subject.monthly_cost;
    if (Math.abs(diff) >= 25) {
      const adj = (diff / 100) * R.monthly_per_100;
      adjustments.push({ field: "monthlies", subject_value: Math.round(subject.monthly_cost), comp_value: monthly, adjustment_pct: basePrice > 0 ? (adj / basePrice) * 100 : 0, adjustment_usd: Math.round(adj) });
      adjusted += adj;
    }
  }
  // The agent's own lines (condition, exposure, view, outdoor space, renovation, other…)
  for (const line of cleanManual(manual ?? (subject.manual && subject.manual[String(listing.wid || listing.id || "")]) ?? [])) {
    const usd = line.amount != null ? line.amount : ((line.pct || 0) / 100) * basePrice;
    if (!usd) continue;
    adjustments.push({ field: "manual:" + line.label, subject_value: null, comp_value: line.note || null, adjustment_pct: basePrice > 0 ? (usd / basePrice) * 100 : 0, adjustment_usd: Math.round(usd) });
    adjusted += usd;
  }

  let similarity = 50;
  if (beds != null && beds === subject.bedrooms) similarity += 15;
  if (baths != null && baths === subject.bathrooms) similarity += 10;
  if (status === "CLOSED") similarity += 10; // a closed deal is the better comparable
  if (subject.living_area && sqft) {
    const areaDiff = Math.abs(subject.living_area - sqft) / subject.living_area;
    if (areaDiff < 0.1) similarity += 15;
    else if (areaDiff < 0.2) similarity += 10;
  }
  // Broker data errors Cotality passes through (e.g. a close date in the year 2121) are kept visible
  // but weigh little, so they cannot steer a valuation.
  let dataNote: string | null = null;
  const closeDate = listing.closedDate ? String(listing.closedDate).slice(0, 10) : null;
  if (closeDate && closeDate > new Date().toISOString().slice(0, 10)) { dataNote = `close date ${closeDate} is in the future (Cotality data error)`; similarity = Math.min(similarity, 20); }

  return {
    listing_key: String(listing.wid || listing.id || ""),
    listing_id: String(listing.lid || ""),
    address: listing.address ? String(listing.address) : null,
    unit: listing.unit ? String(listing.unit) : null,
    neighborhood: listing.neighborhood ? String(listing.neighborhood) : null,
    borough: listing.borough ? String(listing.borough) : null,
    status,
    list_price: basePrice,
    close_price: closePrice,
    close_date: listing.closedDate ? String(listing.closedDate).slice(0, 10) : null,
    bedrooms: beds,
    bathrooms: baths,
    living_area: sqft,
    floor,
    price_per_sqft: sqft ? Math.round(basePrice / sqft) : null,
    days_on_market: typeof listing.dom === "number" ? listing.dom : null,
    monthly_cost: monthly,
    exposures: listing.exposures ? String(listing.exposures) : null,
    view: listing.View ? String(listing.View) : null,
    outdoor: listing.PatioAndPorchFeatures ? String(listing.PatioAndPorchFeatures) : null,
    year_built: listing.yearBuilt != null && Number.isFinite(Number(listing.yearBuilt)) && Number(listing.yearBuilt) > 0 ? Number(listing.yearBuilt) : null,
    similarity_score: Math.min(100, similarity),
    adjustments,
    adjusted_price: Math.round(adjusted),
    data_note: dataNote,
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

/** The Agent Search parameters for the automatic comparable search (one mapping layer, one resolver). */
export function compSearchParams(subject: CmaInput, withOwnership: boolean): URLSearchParams {
  const months = subject.months && subject.months > 0 ? subject.months : 6;
  const p = new URLSearchParams();
  p.set("type", subject.listing_type === "rental" ? "rental" : "sale");
  p.set("status", subject.include_active ? "Closed,Active,Pending" : "Closed");
  p.set("closeDateFrom", isoDaysAgo(Math.round(months * 30.44)));
  if (subject.neighborhood) p.set("neighborhood", subject.neighborhood);
  else if (subject.borough) p.set("borough", subject.borough);
  if (subject.bedrooms != null) {
    p.set("minBeds", String(Math.max(0, subject.bedrooms - 1)));
    p.set("maxBeds", String(subject.bedrooms + 1));
  }
  if (withOwnership && subject.property_type) p.set("checkboxFilters", JSON.stringify({ CommonInterest: [subject.property_type] }));
  return p;
}

/**
 * Find comparables for a subject on live Cotality: the agent's exact picks when given, otherwise
 * closed (and optionally on-market) listings in the subject's neighborhood and side.
 */
export async function findComps(subject: CmaInput, maxComps = 10): Promise<CompResult[]> {
  let geo: GeoInventory | null = null;
  try { geo = await getLiveGeography(); } catch (err) { console.warn("[cma] live geography unavailable:", (err as Error).message); }

  let filter: string;
  let orderby = "CloseDate desc";
  const picked = subject.comp_listing_keys && subject.comp_listing_keys.length > 0;
  if (picked) {
    const keys = subject.comp_listing_keys!.slice(0, 200).map(quoteKey).join(",");
    filter = `ListingKey in (${keys})`;
    orderby = "ListingKey asc";
  } else {
    // Built through the Agent Search mapping layer; an ownership value Cotality does not carry is dropped, never guessed.
    let query = buildCrmIdxQuery(compSearchParams(subject, true), geo);
    if (query.refused.some((r) => r.field === "CommonInterest")) query = buildCrmIdxQuery(compSearchParams(subject, false), geo);
    if (query.refused.length > 0) {
      throw new Error("Comparable criteria not available in Cotality: " + query.refused.map((r) => `${r.criterion}: ${r.reason}`).join("; "));
    }
    filter = query.filter;
  }

  // A CMA save is one request the agent waits for: give a slow Cotality answer 30 s (the 10 s
  // default aborted a 41-comp lookup once in testing) and say what happened when it still times out.
  let result;
  try {
    result = await fetchFromTrestle({ filter, select: CMA_SELECT_FIELDS, top: Math.min(200, Math.max(maxComps * 3, 30)), maxTotal: 200, orderby, timeoutMs: 30_000 });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    throw new Error(/abort/i.test(msg) ? "Cotality did not answer the comparable lookup within 30 seconds — try again" : msg);
  }
  const subjectKey = subject.subject_listing_key ? String(subject.subject_listing_key) : null;
  const comps = result.records
    .filter((r) => !subjectKey || String(r.ListingKey) !== subjectKey)
    .map((r, i) => compFromListing(subject, mapTrestleToCrmListing(r, i), subject.rates, subject.manual ? subject.manual[String(r.ListingKey)] : undefined));

  if (picked) return comps; // the agent's own set
  return comps.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, maxComps);
}

/** Estimate value from comps (weighted average of adjusted prices). */
export function estimateValue(comps: CompResult[]): { estimated: number; low: number; high: number } {
  if (comps.length === 0) return { estimated: 0, low: 0, high: 0 };
  const totalWeight = comps.reduce((s, c) => s + c.similarity_score, 0);
  const weightedAvg = comps.reduce((s, c) => s + c.adjusted_price * c.similarity_score, 0) / totalWeight;
  const margin = 0.05; // ±5%
  return { estimated: Math.round(weightedAvg), low: Math.round(weightedAvg * (1 - margin)), high: Math.round(weightedAvg * (1 + margin)) };
}
