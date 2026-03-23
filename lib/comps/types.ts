/**
 * Comp criteria types — agent-adjustable filters for building + area comps.
 *
 * Stored as JSON on Listing.comp_criteria.
 * When sqft_enabled is false, sqft filters are ignored and comps
 * match on beds/baths/price only.
 */

export interface CompRange {
  beds_min: number;
  beds_max: number;
  baths_min: number;
  baths_max: number;
  sqft_min: number | null;
  sqft_max: number | null;
  sqft_enabled: boolean;
  statuses: string[];   // "Active" | "Under Contract" | "Closed" | "Expired"
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
  status: string;
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
}

export interface CompResults {
  building: CompListing[];
  area: CompListing[];
  criteria: CompCriteria;
  listing_id: string;
  fetched_at: string;
}
