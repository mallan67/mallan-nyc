/**
 * listing-class.ts — canonical PropertyType → listing class (PURE).
 *
 * Live-verified (live-truth.ts / data/cotality-enums.live.json): only `Residential` (sale) and
 * `ResidentialLease` (rental) are populated. The rental value has NO space —
 * `'Residential Lease'` is invalid (0 rows). Commercial members exist in metadata but are empty
 * in this feed; classified but noted. Replaces scattered `contains 'lease'` string-matching.
 */

import { PROPERTY_TYPE_SALE, PROPERTY_TYPE_RENTAL } from './live-truth';

export type ListingClass = 'sale' | 'rental' | 'commercial' | 'unknown';

const COMMERCIAL_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  'CommercialSale', 'CommercialLease', 'BusinessOpportunity', 'Land', 'MultiFamily',
  'ResidentialIncome', 'Farm', 'Specialty',
]);

/** Classify a record's PropertyType. Exact live values only — no space variants, no `contains`. */
export function listingClass(propertyType: unknown): ListingClass {
  if (typeof propertyType !== 'string') return 'unknown';
  const v = propertyType.trim();
  if (v === PROPERTY_TYPE_SALE) return 'sale';
  if (v === PROPERTY_TYPE_RENTAL) return 'rental';
  if (COMMERCIAL_PROPERTY_TYPES.has(v)) return 'commercial';
  return 'unknown';
}

/** The exact live PropertyType value to filter for a class. Sale/rental only are populated. */
export function propertyTypeFor(cls: 'sale' | 'rental'): string {
  return cls === 'sale' ? PROPERTY_TYPE_SALE : PROPERTY_TYPE_RENTAL;
}
