/**
 * Generate default comp criteria from a listing's specs.
 * Agent can override any of these from the CRM.
 */

import type { CompCriteria } from "./types";

interface ListingSpecs {
  beds: number | null;
  baths: number | null;
  sqft: number | null;       // living_area
  list_price: number;
  neighborhood: string | null;
  building_name: string | null;
}

export function buildDefaultCriteria(specs: ListingSpecs): CompCriteria {
  const beds = specs.beds ?? 0;
  const baths = specs.baths ?? 0;
  const hasSqft = specs.sqft != null && specs.sqft > 0;
  const sqft = specs.sqft ?? 0;
  const price = specs.list_price;

  return {
    building: {
      beds_min: beds,
      beds_max: beds,
      baths_min: baths,
      baths_max: baths,
      sqft_min: hasSqft ? Math.round(sqft * 0.85) : null,
      sqft_max: hasSqft ? Math.round(sqft * 1.15) : null,
      sqft_enabled: hasSqft,
      statuses: ["Active", "Under Contract", "Closed"],
      months_back: 12,
    },
    area: {
      beds_min: Math.max(0, beds - 1),
      beds_max: beds + 1,
      baths_min: Math.max(0, baths - 1),
      baths_max: baths + 1,
      sqft_min: hasSqft ? Math.round(sqft * 0.80) : null,
      sqft_max: hasSqft ? Math.round(sqft * 1.20) : null,
      sqft_enabled: hasSqft,
      price_min: Math.round(price * 0.75),
      price_max: Math.round(price * 1.25),
      statuses: ["Active", "Under Contract", "Closed", "Expired"],
      neighborhoods: specs.neighborhood ? [specs.neighborhood] : [],
      months_back: 12,
    },
  };
}
