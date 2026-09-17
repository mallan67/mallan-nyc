/**
 * Comp criteria types — agent-adjustable filters for building + area comps.
 *
 * Stored as JSON on Listing.comp_criteria.
 * When sqft_enabled is false, sqft filters are ignored and comps
 * match on beds/baths/price only.
 */

export interface CompRange {
  /**
   * A DIMENSION THAT IS NOT KNOWN IS NOT A ZERO.
   *
   * beds/baths used to be non-nullable numbers, which left buildDefaultCriteria no way to say "the
   * subject's bedroom count was never recorded" except to invent 0 — and `BedroomsTotal ge 0 and
   * BedroomsTotal le 0` is a STUDIO filter, so a listing with an incomplete record was comped against
   * studios and priced accordingly. ListingSpecs already modelled the unknown (`beds: number | null`);
   * only this type could not carry it.
   *
   * The shape is not new: sqft has expressed exactly this since the criteria were written — nullable
   * bounds plus an `_enabled` flag, with sqftFilter() emitting nothing when disabled. beds and baths now
   * follow the same pattern rather than a second idea.
   *
   * A disabled dimension drops only ITS OWN clause. Neighbourhood, price, status, date, ownership and the
   * other dimensions still filter, so an unknown bedroom count costs the CMA one criterion, not the CMA.
   */
  beds_min: number | null;
  beds_max: number | null;
  beds_enabled: boolean;
  baths_min: number | null;
  baths_max: number | null;
  baths_enabled: boolean;
  sqft_min: number | null;
  sqft_max: number | null;
  sqft_enabled: boolean;
  /**
   * Live Cotality StandardStatus TOKENS (Active, Pending, Closed, Expired …). An agent may type this
   * transaction's canonical label (a sale's "Sold", a rental's "Rented", a sale's "In Contract") in the UI;
   * lib/comps/status-criteria.ts resolves it to a token before anything reaches OData, and refuses anything
   * else. A display name ("Under Contract") or a legacy spelling ("Cancelled", "Leased") is never stored here.
   */
  statuses: string[];
  months_back: number;  // 6, 12, 24
}

export interface BuildingCompCriteria extends CompRange {}

export interface AreaCompCriteria extends CompRange {
  price_min: number | null;
  price_max: number | null;
  neighborhoods: string[];
}

export interface CompCriteria {
  building: BuildingCompCriteria;
  area: AreaCompCriteria;
}

export interface CompListing {
  listing_id: string;
  address: string;
  unit: string;
  /** The exact live StandardStatus token the provider delivered. */
  status: string;
  /** Broker language for that token on THIS comp's transaction (Closed → Sold / Rented; Pending → In Contract on a sale). */
  status_label: string;
  /** The comp's transaction, from its live PropertyType — a sale comp never appears in a rental set. */
  transaction: "sale" | "rental";
  property_type: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  list_price: number;
  close_price: number | null;
  close_date: string | null;
  days_on_market: number | null;
  price_per_sqft: number | null;
  building_name: string;
  listing_agent: string;
  listing_office: string;
  photo_count: number;
  /** Live CommonInterest of the comp (ownership segmentation); null when the provider delivered none. */
  common_interest: string | null;
}

export interface CompResults {
  building: CompListing[];
  area: CompListing[];
  criteria: CompCriteria;
  listing_id: string;
  /** The SUBJECT's transaction (from its live PropertyType). Sale and rental comps are never mixed. */
  transaction: "sale" | "rental";
  fetched_at: string;
}
