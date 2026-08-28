/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: the entries in `field-registry.ts`. A registry entry is a
 * Search criterion when it declares `searchParams`, and its persistence key IS
 * its `canonicalKey` — one concept, one name, range bounds carried in the value
 * rather than split across two keys.
 *
 * Regenerate:  node scripts/search/generate-filter-keys.mjs
 * Verified by: lib/search/__tests__/one-search-mapping-authority.test.ts
 *
 * `sort` is deliberately absent. Ordering is not a filter, and
 * `SavedSearchCriteria` carries `sort` as its own field; admitting it here would
 * let `filters.sort` and `sort` disagree — two sort truths in one object.
 */

export const CANONICAL_FILTER_KEYS = [
  'activity_date',
  'bathrooms',
  'bedrooms',
  'borough',
  'building_name',
  'close_date',
  'feature_criteria',
  'list_price',
  'listing_contract_date',
  'listing_id_canonical',
  'living_area',
  'management_company',
  'map_grid_filter',
  'market_status',
  'max_financing_percent',
  'neighborhood',
  'ownership',
  'postal_code',
  'property_sub_type',
  'public_remarks_keyword',
  'rooms_total',
  'sponsor_unit',
  'stories_total',
  'street_address',
  'unit',
  'units_total',
  'year_built',
] as const;

export type CanonicalFilterKeyName = (typeof CANONICAL_FILTER_KEYS)[number];
