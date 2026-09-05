/**
 * filter-keys.ts — the canonical filter-key vocabulary + fail-loud param mapping (PURE).
 *
 * One canonical key-set. Every UI/API/CRM param maps to exactly one canonical key; an unmapped
 * param FAILS LOUD (never silently dropped — the analysis's biggest class of bug). Per-key
 * capabilities (filterable/sortable/alertable/reportable) live on the field registry.
 * NOT WIRED: no reader consumes this in Backend-Search-1.
 */

export type CanonicalFilterKey =
  | 'price_min' | 'price_max'
  | 'beds_min' | 'beds_max'
  | 'baths_min' | 'baths_max'
  | 'sqft_min' | 'sqft_max'
  | 'property_type' | 'property_sub_types' | 'ownership'
  | 'statuses'
  | 'year_built' | 'furnished'
  | 'amenities' | 'open_house' | 'keywords' | 'transit'
  | 'neighborhood' | 'borough' | 'zip' | 'address' | 'near'
  | 'commercial' | 'exclusive'
  | 'sort';

const CANONICAL_KEYS: ReadonlySet<CanonicalFilterKey> = new Set([
  'price_min', 'price_max', 'beds_min', 'beds_max', 'baths_min', 'baths_max',
  'sqft_min', 'sqft_max', 'property_type', 'property_sub_types', 'ownership', 'statuses',
  'year_built', 'furnished', 'amenities', 'open_house', 'keywords', 'transit',
  'neighborhood', 'borough', 'zip', 'address', 'near', 'commercial', 'exclusive', 'sort',
]);

/**
 * Raw param name (UI URL / API / CRM) → canonical key. Resolves the divergences the analysis
 * found: `baths`→baths_min, `zip`/`zipCodes`→zip, `keyword`/`keywords`→keywords, `q`→address,
 * `subTypes`→property_sub_types, `ownershipTypes`→ownership, `minPrice`→price_min, etc.
 */
const PARAM_ALIASES: Readonly<Record<string, CanonicalFilterKey>> = Object.freeze({
  minPrice: 'price_min', maxPrice: 'price_max',
  beds: 'beds_min', minBeds: 'beds_min', maxBeds: 'beds_max',
  baths: 'baths_min', minBaths: 'baths_min', maxBaths: 'baths_max',
  minSqft: 'sqft_min', maxSqft: 'sqft_max',
  propertyType: 'property_type', propertySubTypes: 'property_sub_types', subTypes: 'property_sub_types',
  propertySubType: 'property_sub_types', // singular — the key the retired browser filter read
  ownershipTypes: 'ownership', ownership: 'ownership',
  statuses: 'statuses',
  yearBuilt: 'year_built', furnished: 'furnished',
  amenities: 'amenities', openHouse: 'open_house', openHouseDate: 'open_house',
  keyword: 'keywords', keywords: 'keywords', transit: 'transit',
  neighborhood: 'neighborhood', neighborhoods: 'neighborhood',
  borough: 'borough', zip: 'zip', zipCodes: 'zip',
  q: 'address', address: 'address', near: 'near',
  commercial: 'commercial', exclusive: 'exclusive', sort: 'sort',
});

export function isCanonicalFilterKey(v: unknown): v is CanonicalFilterKey {
  return typeof v === 'string' && CANONICAL_KEYS.has(v as CanonicalFilterKey);
}

/** Map a raw param to its canonical key, or null if unmapped. */
export function toCanonicalFilterKey(param: string): CanonicalFilterKey | null {
  if (isCanonicalFilterKey(param)) return param;
  return PARAM_ALIASES[param] ?? null;
}

/** Fail-loud: an unmapped param is a contract error, never a silent drop. */
export function assertCanonicalFilterKey(param: string): CanonicalFilterKey {
  const key = toCanonicalFilterKey(param);
  if (key === null) {
    throw new Error(`[canonical/filter-keys] Unmapped filter param "${param}" — no canonical key. ` +
      `Add it to the canonical vocabulary or reject it; do not drop it silently.`);
  }
  return key;
}
