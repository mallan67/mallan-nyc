/**
 * filter-keys.ts — DERIVED persistence vocabulary + the legacy param adapter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS FILE NO LONGER DECLARES THE VOCABULARY
 *
 * It used to own `CanonicalFilterKey` as a hand-maintained union, and
 * `field-registry.ts` imported that type to describe its own `filterKeys`. The
 * registry therefore depended on its own derivative — and generating the
 * vocabulary FROM the registry while the registry imported its type FROM here
 * would have been circular.
 *
 * The direction is now inverted, and the vocabulary is GENERATED. The chain is:
 *
 *   FIELD_REGISTRY entries
 *     -> scripts/search/generate-filter-keys.mjs
 *     -> filter-keys.generated.ts
 *     -> CanonicalFilterKey (re-exported below)
 *
 * The registry entries are the ONE declaration. An intermediate cut kept a
 * literal `CANONICAL_FILTER_KEYS` array in `field-registry.ts` beside the
 * entries, with a test forcing agreement — two declarations plus a drift
 * detector, which is the shape this work removes rather than an instance of
 * removing it.
 *
 * Its old header said "NOT WIRED: no reader consumes this in Backend-Search-1."
 * That was true, and it is why the list had grown members no executable criterion
 * mapped to (`transit`, `near`, `commercial`, `open_house`) while lacking 21 that
 * the executor actually runs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARAM_ALIASES IS A LEGACY READ ADAPTER, NOT BUSINESS AUTHORITY
 *
 * A raw request/stored param name is a BOUNDARY spelling. One concept may have
 * many boundary aliases; it has exactly one canonical business identity, and
 * that identity lives in the registry. This table exists so old query strings
 * and old saved rows can still be READ. Nothing may treat it as the definition
 * of a criterion, and no new criterion may be introduced by adding a line here.
 *
 * The alias table is also where a silent-widening defect hid: it mapped
 * `statuses` while the wire param has always been `status`, so a saved status
 * criterion could not be resolved at all.
 *
 * SORT IS NOT HERE. Result ordering is not a filter, and `SavedSearchCriteria`
 * already carries `sort` as its own field. Aliasing `sort` into the filter
 * vocabulary would allow `filters.sort = 'price_desc'` alongside
 * `sort = 'newest'` — two sort truths in one object, which is precisely the
 * duplicate-authority shape this work removes.
 */

import {
  CANONICAL_FILTER_KEYS,
  type CanonicalFilterKeyName,
} from './filter-keys.generated';

/** DERIVED from the registry. Do not restate it. */
export type CanonicalFilterKey = CanonicalFilterKeyName;

const CANONICAL_KEYS: ReadonlySet<CanonicalFilterKey> = new Set<CanonicalFilterKey>(
  CANONICAL_FILTER_KEYS,
);

/** Every canonical persistence key, derived. */
export function canonicalFilterKeys(): readonly CanonicalFilterKey[] {
  return CANONICAL_FILTER_KEYS;
}

/**
 * LEGACY BOUNDARY SPELLINGS → canonical business identity.
 *
 * Read-only compatibility. Covers the request-param spellings the browser and
 * older callers emit, and the snake_case field names in saved rows written
 * before the persistence vocabulary existed.
 *
 * Range bounds collapse onto ONE concept key: the concept is `list_price` and
 * the bound lives in the value, so `minPrice` and `maxPrice` both resolve to
 * `list_price`. A caller that needs the bound reads it from where it was sent,
 * not from the key name.
 */
const PARAM_ALIASES: Readonly<Record<string, CanonicalFilterKey>> = Object.freeze({
  // price
  minPrice: 'list_price', maxPrice: 'list_price', min_price: 'list_price', max_price: 'list_price',
  // rooms and size
  beds: 'bedrooms', minBeds: 'bedrooms', maxBeds: 'bedrooms', min_beds: 'bedrooms', max_beds: 'bedrooms',
  baths: 'bathrooms', minBaths: 'bathrooms', maxBaths: 'bathrooms', min_baths: 'bathrooms', max_baths: 'bathrooms',
  minRooms: 'rooms_total', maxRooms: 'rooms_total', min_rooms: 'rooms_total', max_rooms: 'rooms_total',
  minSqft: 'living_area', maxSqft: 'living_area', min_sqft: 'living_area', max_sqft: 'living_area',
  // lifecycle. `status` is the wire spelling the executor reads; `statuses` was
  // the only one the old table knew, which is why a saved status criterion could
  // not be resolved.
  status: 'market_status', statuses: 'market_status', standardStatus: 'market_status',
  // classification
  propertySubType: 'property_sub_type', propertySubTypes: 'property_sub_type',
  subTypes: 'property_sub_type', property_sub_type: 'property_sub_type',
  ownership: 'ownership', ownershipTypes: 'ownership', property_type: 'ownership',
  // geography
  neighborhood: 'neighborhood', neighborhoods: 'neighborhood',
  borough: 'borough',
  zip: 'postal_code', zipCodes: 'postal_code',
  q: 'street_address', address: 'street_address',
  unit: 'unit',
  buildingName: 'building_name', building_name: 'building_name',
  // identity — resolves to the MALLAN canonical listing reference, never to the
  // provider-evidence entry.
  listingId: 'listing_id_canonical', listing_id: 'listing_id_canonical', rlsId: 'listing_id_canonical',
  // dates
  dateFrom: 'activity_date', dateTo: 'activity_date', dateType: 'activity_date',
  date_from: 'activity_date', date_to: 'activity_date', date_type: 'activity_date',
  contractDateFrom: 'listing_contract_date', contractDateTo: 'listing_contract_date',
  contract_date_from: 'listing_contract_date', contract_date_to: 'listing_contract_date',
  closeDateFrom: 'close_date', closeDateTo: 'close_date',
  close_date_from: 'close_date', close_date_to: 'close_date',
  // building facts
  minYear: 'year_built', maxYear: 'year_built', min_year: 'year_built', max_year: 'year_built',
  minFloors: 'stories_total', maxFloors: 'stories_total', min_floors: 'stories_total', max_floors: 'stories_total',
  minUnits: 'units_total', maxUnits: 'units_total', min_units: 'units_total', max_units: 'units_total',
  managementCompany: 'management_company', management_company: 'management_company',
  // free text and features
  keyword: 'public_remarks_keyword', keywords: 'public_remarks_keyword',
  checkboxFilters: 'feature_criteria', checkbox_filters: 'feature_criteria', amenities: 'feature_criteria',
  sponsorUnit: 'sponsor_unit', sponsor_unit: 'sponsor_unit',
  // `gridFilter` deliberately has NO canonical key. It is a raw viewport
  // predicate and an explicit refusal: a map must translate geographic intent
  // into canonical geographic criteria, not smuggle a grid string into Search.
  // Mapping it to a canonical key made it criteria state, which is how it ended
  // up inside SaleCriteria and RentalCriteria. The refusal itself still lives in
  // `crm-idx-filter.ts`, which throws rather than ignoring a supplied grid — so
  // removing the alias drops it from the canonical vocabulary WITHOUT making it
  // silently acceptable.
  financingMin: 'max_financing_percent',
});

export function isCanonicalFilterKey(v: unknown): v is CanonicalFilterKey {
  return typeof v === 'string' && CANONICAL_KEYS.has(v as CanonicalFilterKey);
}

/** Map a raw boundary param to its canonical business identity, or null. */
export function toCanonicalFilterKey(param: string): CanonicalFilterKey | null {
  if (isCanonicalFilterKey(param)) return param;
  return PARAM_ALIASES[param] ?? null;
}

/** Fail-loud: an unmapped param is a contract error, never a silent drop. */
export function assertCanonicalFilterKey(param: string): CanonicalFilterKey {
  const key = toCanonicalFilterKey(param);
  if (key === null) {
    throw new Error(
      `[canonical/filter-keys] Unmapped filter param "${param}" — no canonical key. ` +
        `Add the CONCEPT to FIELD_REGISTRY and, if this is a legacy boundary spelling, ` +
        `alias it here. Do not drop it silently: a dropped criterion widens the search.`,
    );
  }
  return key;
}
