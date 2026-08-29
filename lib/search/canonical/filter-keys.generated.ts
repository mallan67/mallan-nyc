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
import type {
  BasisRangeValue,
  GeoValue,
  RangeValue,
  SetValue,
} from './criteria-values';

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

/** How a criterion's value is structured — what a validator dispatches on. */
export type CriterionValueShape =
  | 'range_number'
  | 'range_date'
  | 'basis_range_date'
  | 'enum_set'
  | 'text_set'
  | 'text'
  | 'boolean'
  | 'geo';

/**
 * Derived from each entry's declared `type`, so a criterion cannot exist without
 * a known value shape. `satisfies` makes the map exhaustive at compile time: a
 * key present in the vocabulary but missing here is a type error, not a runtime
 * `undefined` that would skip validation and let the value through unchecked.
 */
export const CRITERION_VALUE_SHAPE = {
  activity_date: 'basis_range_date',
  bathrooms: 'range_number',
  bedrooms: 'range_number',
  borough: 'enum_set',
  building_name: 'text',
  close_date: 'range_date',
  feature_criteria: 'enum_set',
  list_price: 'range_number',
  listing_contract_date: 'range_date',
  listing_id_canonical: 'text_set',
  living_area: 'range_number',
  management_company: 'text',
  map_grid_filter: 'geo',
  market_status: 'enum_set',
  max_financing_percent: 'range_number',
  neighborhood: 'enum_set',
  ownership: 'enum_set',
  postal_code: 'text',
  property_sub_type: 'enum_set',
  public_remarks_keyword: 'text',
  rooms_total: 'range_number',
  sponsor_unit: 'boolean',
  stories_total: 'range_number',
  street_address: 'text',
  unit: 'text',
  units_total: 'range_number',
  year_built: 'range_number',
} as const satisfies Record<CanonicalFilterKeyName, CriterionValueShape>;

/**
 * The closed basis vocabulary for composite criteria. Empty for every criterion
 * whose bounds mean exactly one provider fact.
 */
export const CRITERION_VALUE_BASES: Partial<Record<CanonicalFilterKeyName, readonly string[]>> = {
  activity_date: ['Listed', 'Updated'],
};

/**
 * The canonical criteria object: one optional property per business concept,
 * typed by its value shape.
 *
 * Optional means UNFILTERED. It does not mean "absent because something dropped
 * it" — the value contract refuses empty and malformed values rather than
 * letting them decay into absence, because an absent criterion silently WIDENS
 * the result set.
 */
export interface CanonicalCriteriaValues {
  /** Listing Activity Date — date (basis: Listed | Updated) */
  activity_date?: BasisRangeValue<string>;
  /** Baths — number */
  bathrooms?: RangeValue<number>;
  /** Beds — number */
  bedrooms?: RangeValue<number>;
  /** Borough — multi_enum */
  borough?: SetValue;
  /** Building Name — string */
  building_name?: string;
  /** Sold Date — date */
  close_date?: RangeValue<string>;
  /** Amenities — multi_enum */
  feature_criteria?: SetValue;
  /** Price — money */
  list_price?: RangeValue<number>;
  /** Listed Date — date */
  listing_contract_date?: RangeValue<string>;
  /** Listing ID — array */
  listing_id_canonical?: SetValue;
  /** Square Feet — number */
  living_area?: RangeValue<number>;
  /** Management Company — string */
  management_company?: string;
  /** Map Grid — geo */
  map_grid_filter?: GeoValue;
  /** Status — enum */
  market_status?: SetValue;
  /** Max Financing Allowed % — number */
  max_financing_percent?: RangeValue<number>;
  /** Neighborhood — multi_enum */
  neighborhood?: SetValue;
  /** Ownership — enum */
  ownership?: SetValue;
  /** ZIP — string */
  postal_code?: string;
  /** Property Type — enum */
  property_sub_type?: SetValue;
  /** Keyword — string */
  public_remarks_keyword?: string;
  /** Rooms — number */
  rooms_total?: RangeValue<number>;
  /** Sponsor Unit — boolean */
  sponsor_unit?: boolean;
  /** Floors — number */
  stories_total?: RangeValue<number>;
  /** Address — string */
  street_address?: string;
  /** Unit — string */
  unit?: string;
  /** Units in Building — number */
  units_total?: RangeValue<number>;
  /** Year Built — number */
  year_built?: RangeValue<number>;
}
