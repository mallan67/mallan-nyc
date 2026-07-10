/**
 * sort.ts — canonical sort keys with MANDATORY deterministic tie-breaks (PURE).
 *
 * Fixes the analysis findings: single-key sorts caused unstable pagination, and the public client
 * re-sort diverged from the server key. Every sort key here resolves to an ordered list of
 * { field, dir } terms that ALWAYS ends in a unique tie-break (`id asc`). One authoritative order.
 * NOT WIRED: no route consumes this in Backend-Search-1.
 */

export type SortDir = 'asc' | 'desc';
export interface SortTerm { field: string; dir: SortDir; }

export type SortKey =
  | 'price_desc'
  | 'price_asc'
  | 'newest'
  | 'largest'
  | 'beds_desc'
  | 'neighborhood'
  | 'new_development'
  | 'exclusives';

/** The unique tie-break appended to EVERY sort so pagination is stable. */
export const TIEBREAK: Readonly<SortTerm> = Object.freeze({ field: 'id', dir: 'asc' });

/** Primary term per key. `newest` = listing_contract_date (NOT modification_timestamp). */
const PRIMARY: Readonly<Record<SortKey, SortTerm>> = Object.freeze({
  price_desc:      { field: 'list_price', dir: 'desc' },
  price_asc:       { field: 'list_price', dir: 'asc' },
  newest:          { field: 'listing_contract_date', dir: 'desc' },
  largest:         { field: 'living_area', dir: 'desc' },
  beds_desc:       { field: 'bedrooms_total', dir: 'desc' },
  neighborhood:    { field: 'neighborhood', dir: 'asc' },
  new_development: { field: 'is_new_development', dir: 'desc' },
  exclusives:      { field: 'is_mallan_exclusive', dir: 'desc' },
});

export const DEFAULT_SORT_KEY: SortKey = 'price_desc';

export function isSortKey(v: unknown): v is SortKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PRIMARY, v);
}

/**
 * Resolve a sort key to an ordered term list that ALWAYS ends in the unique tie-break.
 * Unknown keys fall back to the default (never an unstable/unspecified order).
 */
export function resolveSort(key: unknown): SortTerm[] {
  const k: SortKey = isSortKey(key) ? key : DEFAULT_SORT_KEY;
  return [PRIMARY[k], TIEBREAK];
}
