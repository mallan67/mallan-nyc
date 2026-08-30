/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source of truth: the entries in `field-registry.ts`. A registry entry is a
 * Search criterion when its `criterionRole` is `broker_input` — never because
 * a URL parameter happens to exist for it — and its persistence key IS its
 * `canonicalKey`: one concept, one name, range bounds carried in the value
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
  CriterionValueShape,
  FeatureSelection,
  GeoValue,
  RangeValue,
  SetValue,
} from './criteria-values';
import type { SearchWorkflow } from './search-workflow';

export type { CriterionValueShape };

export const CANONICAL_FILTER_KEYS = [
  'activity_date',
  'bathrooms',
  'bedrooms',
  'borough',
  'building_name',
  'close_date',
  'days_on_market',
  'feature_criteria',
  'furnished',
  'list_price',
  'listing_contract_date',
  'listing_id_canonical',
  'living_area',
  'maintenance_common_charge',
  'mallan_exclusive',
  'management_company',
  'market_status',
  'max_financing_percent',
  'neighborhood',
  'new_development',
  'open_house',
  'ownership',
  'parking',
  'pets',
  'postal_code',
  'price_per_sqft',
  'property_sub_type',
  'public_remarks_keyword',
  'rooms_total',
  'sponsor_unit',
  'stories_total',
  'street_address',
  'structure_type',
  'unit',
  'units_total',
  'year_built',
] as const;

export type CanonicalFilterKeyName = (typeof CANONICAL_FILTER_KEYS)[number];

/**
 * Each criterion's DECLARED `criterionValueShape`, copied verbatim — never
 * derived from `type`.
 *
 * It was derived from `type` until 2026-08-28, and that conflated two different
 * questions: what kind of FACT a criterion is on a listing, versus what a broker
 * may TYPE INTO the control. Deriving forced `type` to be rewritten to describe
 * the UI — `listing_id_canonical` became `array` because the Search box accepts
 * several IDs, when one listing has exactly ONE canonical identifier.
 *
 * `satisfies` makes the map exhaustive at compile time: a key present in the
 * vocabulary but missing here is a type error, not a runtime `undefined` that
 * would skip validation and let the value through unchecked.
 */
export const CRITERION_VALUE_SHAPE = {
  activity_date: 'basis_range_date',
  bathrooms: 'range_number',
  bedrooms: 'range_number',
  borough: 'enum_set',
  building_name: 'text',
  close_date: 'range_date',
  days_on_market: 'range_number',
  feature_criteria: 'feature_map',
  furnished: 'enum_set',
  list_price: 'range_number',
  listing_contract_date: 'range_date',
  listing_id_canonical: 'text_set',
  living_area: 'range_number',
  maintenance_common_charge: 'range_number',
  mallan_exclusive: 'boolean',
  management_company: 'text',
  market_status: 'enum_set',
  max_financing_percent: 'range_number',
  neighborhood: 'text_set',
  new_development: 'boolean',
  open_house: 'boolean',
  ownership: 'enum_set',
  parking: 'enum_set',
  pets: 'enum_set',
  postal_code: 'text',
  price_per_sqft: 'range_number',
  property_sub_type: 'enum_set',
  public_remarks_keyword: 'text',
  rooms_total: 'range_number',
  sponsor_unit: 'boolean',
  stories_total: 'range_number',
  street_address: 'text',
  structure_type: 'enum_set',
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
 * The ONE canonical module owning each closed vocabulary.
 *
 * A workflow contract asks this map who owns a criterion's members and consumes
 * that module. It must never carry its own `allowed` array — four workflow
 * validators with four private lists is four new translation tables, which is
 * precisely the split this registry exists to remove.
 *
 * Only `enum_set` criteria appear. `text_set` criteria are OPEN by design:
 * `neighborhood` passes an unrecognised name through as a literal
 * SubdivisionName, so there is no closed vocabulary to own yet.
 */
export const CRITERION_VOCABULARY_OWNER: Partial<Record<CanonicalFilterKeyName, string>> = {
  borough: 'geography',
  feature_criteria: 'checkbox-criteria',
  furnished: 'checkbox-criteria',
  market_status: 'status-token-contract',
  ownership: 'ownership',
  parking: 'checkbox-criteria',
  pets: 'checkbox-criteria',
  property_sub_type: 'property-subtype-contract',
  structure_type: 'checkbox-criteria',
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
  /** Borough — string */
  borough?: SetValue;
  /** Building Name — string */
  building_name?: string;
  /** Sold Date — date */
  close_date?: RangeValue<string>;
  /** Days on Market — number */
  days_on_market?: RangeValue<number>;
  /** Amenities — multi_enum */
  feature_criteria?: FeatureSelection;
  /** Furnished — enum */
  furnished?: SetValue;
  /** Price — money */
  list_price?: RangeValue<number>;
  /** Listed Date — date */
  listing_contract_date?: RangeValue<string>;
  /** Listing ID — string */
  listing_id_canonical?: SetValue;
  /** Square Feet — number */
  living_area?: RangeValue<number>;
  /** Maintenance / CC — money */
  maintenance_common_charge?: RangeValue<number>;
  /** Mallan Exclusive — boolean */
  mallan_exclusive?: boolean;
  /** Management Company — string */
  management_company?: string;
  /** Status — enum */
  market_status?: SetValue;
  /** Max Financing Allowed % — number */
  max_financing_percent?: RangeValue<number>;
  /** Neighborhood — string */
  neighborhood?: SetValue;
  /** New Development — boolean */
  new_development?: boolean;
  /** Open House — object */
  open_house?: boolean;
  /** Ownership — enum */
  ownership?: SetValue;
  /** Parking / Garage — multi_enum */
  parking?: SetValue;
  /** Pets — multi_enum */
  pets?: SetValue;
  /** ZIP — string */
  postal_code?: string;
  /** $/Sqft — computed */
  price_per_sqft?: RangeValue<number>;
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
  /** Structure Type — multi_enum */
  structure_type?: SetValue;
  /** Unit — string */
  unit?: string;
  /** Units in Building — number */
  units_total?: RangeValue<number>;
  /** Year Built — number */
  year_built?: RangeValue<number>;
}

/**
 * WHICH canonical criteria each workflow may offer.
 *
 * This is the ONLY question the four workflow contracts answer. They do not
 * redefine a criterion's type, its value shape, its allowed vocabulary, its
 * Cotality mapping, or its execution semantics — each of those already has
 * exactly one owner, and a workflow restating any of them would recreate the
 * per-surface divergence this registry exists to remove.
 */
export const WORKFLOW_CRITERIA = {
  sale: [
    'activity_date',
    'bathrooms',
    'bedrooms',
    'borough',
    'building_name',
    'close_date',
    'days_on_market',
    'feature_criteria',
    'list_price',
    'listing_contract_date',
    'listing_id_canonical',
    'living_area',
    'maintenance_common_charge',
    'mallan_exclusive',
    'management_company',
    'market_status',
    'max_financing_percent',
    'neighborhood',
    'new_development',
    'open_house',
    'ownership',
    'parking',
    'pets',
    'postal_code',
    'price_per_sqft',
    'property_sub_type',
    'public_remarks_keyword',
    'rooms_total',
    'sponsor_unit',
    'stories_total',
    'street_address',
    'structure_type',
    'unit',
    'units_total',
    'year_built',
  ],
  rental: [
    'activity_date',
    'bathrooms',
    'bedrooms',
    'borough',
    'building_name',
    'days_on_market',
    'feature_criteria',
    'furnished',
    'list_price',
    'listing_id_canonical',
    'living_area',
    'mallan_exclusive',
    'management_company',
    'market_status',
    'neighborhood',
    'new_development',
    'open_house',
    'ownership',
    'parking',
    'pets',
    'postal_code',
    'property_sub_type',
    'public_remarks_keyword',
    'rooms_total',
    'stories_total',
    'street_address',
    'structure_type',
    'unit',
    'units_total',
    'year_built',
  ],
  building: [
    'borough',
    'building_name',
    'management_company',
    'neighborhood',
    'ownership',
    'parking',
    'postal_code',
    'stories_total',
    'street_address',
    'structure_type',
    'units_total',
    'year_built',
  ],
  comparable: [
    'bathrooms',
    'bedrooms',
    'borough',
    'close_date',
    'days_on_market',
    'list_price',
    'living_area',
    'market_status',
    'neighborhood',
    'price_per_sqft',
    'property_sub_type',
  ],
} as const satisfies Record<SearchWorkflow, readonly CanonicalFilterKeyName[]>;

/**
 * SaleCriteria — a PROJECTION of `CanonicalCriteriaValues`, not a new contract.
 *
 * Every property keeps the canonical identity, value shape and refusal
 * behaviour it has everywhere else. `Pick` is deliberate: a hand-written
 * interface here could drift in a way this cannot.
 */
export type SaleCriteria = Pick<
  CanonicalCriteriaValues,
  | 'activity_date'
  | 'bathrooms'
  | 'bedrooms'
  | 'borough'
  | 'building_name'
  | 'close_date'
  | 'days_on_market'
  | 'feature_criteria'
  | 'list_price'
  | 'listing_contract_date'
  | 'listing_id_canonical'
  | 'living_area'
  | 'maintenance_common_charge'
  | 'mallan_exclusive'
  | 'management_company'
  | 'market_status'
  | 'max_financing_percent'
  | 'neighborhood'
  | 'new_development'
  | 'open_house'
  | 'ownership'
  | 'parking'
  | 'pets'
  | 'postal_code'
  | 'price_per_sqft'
  | 'property_sub_type'
  | 'public_remarks_keyword'
  | 'rooms_total'
  | 'sponsor_unit'
  | 'stories_total'
  | 'street_address'
  | 'structure_type'
  | 'unit'
  | 'units_total'
  | 'year_built'
>;

/**
 * RentalCriteria — a PROJECTION of `CanonicalCriteriaValues`, not a new contract.
 *
 * Every property keeps the canonical identity, value shape and refusal
 * behaviour it has everywhere else. `Pick` is deliberate: a hand-written
 * interface here could drift in a way this cannot.
 */
export type RentalCriteria = Pick<
  CanonicalCriteriaValues,
  | 'activity_date'
  | 'bathrooms'
  | 'bedrooms'
  | 'borough'
  | 'building_name'
  | 'days_on_market'
  | 'feature_criteria'
  | 'furnished'
  | 'list_price'
  | 'listing_id_canonical'
  | 'living_area'
  | 'mallan_exclusive'
  | 'management_company'
  | 'market_status'
  | 'neighborhood'
  | 'new_development'
  | 'open_house'
  | 'ownership'
  | 'parking'
  | 'pets'
  | 'postal_code'
  | 'property_sub_type'
  | 'public_remarks_keyword'
  | 'rooms_total'
  | 'stories_total'
  | 'street_address'
  | 'structure_type'
  | 'unit'
  | 'units_total'
  | 'year_built'
>;

/**
 * BuildingCriteria — a PROJECTION of `CanonicalCriteriaValues`, not a new contract.
 *
 * Every property keeps the canonical identity, value shape and refusal
 * behaviour it has everywhere else. `Pick` is deliberate: a hand-written
 * interface here could drift in a way this cannot.
 */
export type BuildingCriteria = Pick<
  CanonicalCriteriaValues,
  | 'borough'
  | 'building_name'
  | 'management_company'
  | 'neighborhood'
  | 'ownership'
  | 'parking'
  | 'postal_code'
  | 'stories_total'
  | 'street_address'
  | 'structure_type'
  | 'units_total'
  | 'year_built'
>;

/**
 * ComparableCriteria — a PROJECTION of `CanonicalCriteriaValues`, not a new contract.
 *
 * Every property keeps the canonical identity, value shape and refusal
 * behaviour it has everywhere else. `Pick` is deliberate: a hand-written
 * interface here could drift in a way this cannot.
 */
export type ComparableCriteria = Pick<
  CanonicalCriteriaValues,
  | 'bathrooms'
  | 'bedrooms'
  | 'borough'
  | 'close_date'
  | 'days_on_market'
  | 'list_price'
  | 'living_area'
  | 'market_status'
  | 'neighborhood'
  | 'price_per_sqft'
  | 'property_sub_type'
>;
