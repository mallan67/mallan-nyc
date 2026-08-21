/**
 * field-registry.ts — THE CANONICAL SEARCH MAPPING AUTHORITY.
 *
 * NO LONGER A SKELETON. This header used to say "SKELETON (PURE; not wired to any
 * reader)" and "nothing here is wired to runtime". Both became false during
 * Search P0: amenity capability, the semantic-equivalence gate and the canonical
 * matcher all read from this file at runtime. A stale "not wired" header is
 * actively dangerous at handoff, because the next reader will assume edits here
 * are inert.
 *
 * WHAT MAY RELY ON IT: only entries whose capability is explicitly proven.
 * `needs_probe` and `unsupported` are NOT usable — see `capability.ts`. The
 * registry is being wired INCREMENTALLY, one proven consumer at a time.
 *
 * WHAT IT OWNS: the criterion. Provider mapping state, source authority,
 * capability per axis, audience visibility, attribution obligations and failure
 * behaviour. Subordinate tables (`amenity-vocabulary.ts`) supply exact provider
 * tokens and nothing else.
 *
 * SCOPE: authenticated CRM/backend Search — SALE, RENTAL, CMA and BUILDING.
 * Public mallan.nyc Search is a SEPARATE product and is deliberately zero-delta;
 * nothing here may become a dependency of `app/search`, `SearchFilterPanel`,
 * `/api/listings` or the public listing readers.
 *
 * Every major field family from the analysis is represented with an EXPLICIT capability status.
 * Honesty rule (Maya directive):
 *   - 'yes'         = verified working against current backend + (where relevant) live Cotality.
 *   - 'needs_probe' = requires live `cotality:pull`/`cotality:verify` before it may be relied on.
 *   - 'unsupported' = the current backend CANNOT support it — must fail loud, never silently accepted.
 *   - 'no'          = deliberately not offered on that axis.
 * Enum-backed fields are checked against `data/cotality-enums.live.json` (181 live enums) by
 * field-registry.test.ts. Scalar/derived fields with no live confirmation are `needs_probe`.
 *
 * INCREMENTAL WIRING: runtime consumers exist today (amenity capability, the
 * semantic-equivalence gate, the canonical matcher). Populating live values and
 * migrating further readers happens per surface, one PROVEN consumer at a time.
 */

import type { AudienceVisibility, CapabilityStatus, FailureBehavior } from './capability';
import type { CanonicalFilterKey } from './filter-keys';
import { AMENITY_TOKENS } from './amenity-vocabulary';
import type { SourceAuthority } from './source-provenance';
import type { AudienceObligation } from './attribution';

/**
 * How a canonical fact's factual authority is decided.
 *
 *   fixed                 one permanent author regardless of listing (provider
 *                         identifiers, Mallan CRM state, ACRIS records)
 *   by_listing_authority  depends on WHO AUTHORED THE LISTING — the same field is
 *                         Mallan-authored on a local listing and provider-authored
 *                         on third-party inventory. Resolved per instance.
 *   mallan_derived        Mallan computes it from verified inputs; authorship is
 *                         Mallan's regardless of the listing's origin
 *   unresolved            the mapping has not been established yet. NOT a
 *                         synonym for "Mallan derives it" — see the achieved_rent
 *                         / assessment / price_per_sqft corrections
 */
export type AuthorityResolution =
  | 'fixed'
  | 'by_listing_authority'
  | 'mallan_derived'
  | 'unresolved';

export type FieldCategory =
  | 'identity_source_attribution'
  | 'address_location_building'
  | 'transaction'
  | 'lifecycle_status'
  | 'pricing'
  | 'close_rental_history'
  | 'dom_dates'
  | 'rooms_size'
  | 'carrying_costs'
  | 'ownership_common_interest'
  | 'property_type'
  | 'open_house'
  | 'media'
  | 'amenities'
  | 'parking_garage'
  | 'pets'
  | 'furnished'
  | 'new_development'
  | 'mallan_exclusive_internal'
  | 'agent_private_restricted'
  | 'report_cma_investor'
  | 'engagement_marketing';

/** All field families that MUST be represented in the registry (completeness is tested). */
export const REQUIRED_FAMILIES: readonly FieldCategory[] = Object.freeze([
  'identity_source_attribution', 'address_location_building', 'transaction', 'lifecycle_status',
  'pricing', 'close_rental_history', 'dom_dates', 'rooms_size', 'carrying_costs',
  'ownership_common_interest', 'property_type', 'open_house', 'media', 'amenities',
  'parking_garage', 'pets', 'furnished', 'new_development', 'mallan_exclusive_internal',
  'agent_private_restricted', 'report_cma_investor', 'engagement_marketing',
]);

/**
 * PROVIDER MAPPING STATE — how well this criterion maps to the Cotality feed.
 *
 * Deliberately says NOTHING about who authored the value. A Google-derived
 * coordinate is not an odd kind of Cotality mapping; it is a different SOURCE
 * CLASS. Overloading this enum with `mallan_derived` conflated two orthogonal
 * facts, so source authority is its own property below. Both live in this
 * registry — orthogonal properties in one authority, not two authorities.
 */
export type ProviderMappingStatus = 'mapped' | 'partial' | 'none' | 'needs_probe' | 'reserved';

// Source authority is NOT redefined here. `source-provenance.ts` already owns
// that vocabulary (and `attribution.ts` the six-facet envelope); defining a rival
// enum in this file would recreate the split this registry exists to prevent.

export type FieldType =
  | 'string' | 'number' | 'money' | 'boolean' | 'enum' | 'multi_enum'
  | 'date' | 'geo' | 'array' | 'object' | 'computed';

export interface FieldSpec {
  canonicalKey: string;
  uiLabel: string;
  category: FieldCategory;
  providerMappingStatus: ProviderMappingStatus;
  /** Cotality API field name if verified/known; null if none. */
  cotalityField: string | null;
  /** `listings` DB column if it exists; null otherwise. */
  dbColumn: string | null;
  /** `listing_search_projection` column if it exists; null otherwise. */
  projectionColumn: string | null;
  /** existing CRM/search param name if one exists; null otherwise. */
  searchParam: string | null;
  /** canonical FILTER key(s) this field powers, e.g. list_price → price_min/price_max. */
  filterKeys?: readonly CanonicalFilterKey[];
  type: FieldType;
  visibility: AudienceVisibility;
  filterable: CapabilityStatus;
  sortable: CapabilityStatus;
  alertable: CapabilityStatus;
  reportable: CapabilityStatus;
  /**
   * Key into the SUBORDINATE token vocabulary
   * (`lib/search/canonical/amenity-vocabulary.ts`).
   *
   * The registry owns the criterion; the vocabulary owns only which exact
   * provider tokens express it. Composition, never competition — two files
   * describing one capability is how drift returns.
   */
  amenityKey?: string;
  /**
   * Has SEMANTIC equivalence between `uiLabel` and the provider token been
   * proven — not merely field existence and live population?
   *
   * `BuildingFeatures.Concierge` is live and populated on 1,523 listings, and a
   * concierge is still not a doorman. Until the equivalence itself is proven the
   * criterion stays `needs_probe` no matter how healthy the token looks.
   */
  semanticEquivalenceProven?: boolean;
  /**
   * HOW the factual authority of this canonical fact is determined.
   *
   * A single static authority per FIELD is a CATEGORY ERROR for authorable
   * listing facts. Mallan uses the SAME canonical fields for Mallan-authored
   * local listings AND third-party Cotality inventory:
   *
   *   list_price on a third-party listing   -> Cotality/RLS authored it
   *   list_price on a Mallan-authored listing -> MALLAN authored it
   *
   * and the later suppressed Cotality representation of that Mallan listing does
   * NOT transfer authorship of the local canonical value to the provider. The
   * same applies to address, unit, beds, baths, ownership, status, remarks and
   * media. Saying `list_price -> cotality_rebny` is simply false half the time.
   *
   * THREE DISTINCT THINGS, never conflated:
   *   1. FIELD CONTRACT (this registry) — which provider resource/field CAN
   *      supply this fact, and under what conditions.
   *   2. INSTANCE FACTUAL AUTHORITY (`AttributionEnvelope.factualAuthority`) —
   *      who actually authored the value on THIS listing. Resolved at runtime.
   *   3. PROVIDER PIPELINE LINEAGE (`SourceSystem*` / `OriginatingSystem*`) —
   *      how the record travelled. NOT authorship.
   *
   * So the registry declares the RESOLUTION MODE, and the envelope carries the
   * answer per fact. No second provenance system is introduced.
   */
  authorityResolution: AuthorityResolution;
  /**
   * The fixed authority — ONLY meaningful when `authorityResolution` is
   * `'fixed'`. For `'by_listing_authority'` facts this is deliberately absent,
   * because no static value could be truthful.
   */
  sourceAuthority?: SourceAuthority;
  /**
   * For `'by_listing_authority'` facts: who authors it in each case. Used by the
   * runtime resolver to build the instance envelope.
   */
  authorityByListingKind?: {
    /** Mallan-authored local listing (SL-/RL-). */
    mallanLocal: SourceAuthority;
    /** Third-party Cotality inventory. */
    providerListing: SourceAuthority;
  };
  /**
   * Attribution duties this field triggers, in the vocabulary already used by
   * `AttributionEnvelope.audienceObligations` — not a new boolean set.
   *
   * A single `requiresAttribution` boolean collapsed unrelated duties into one
   * answer, and the consequence was concrete: a Mallan-DERIVED coordinate or
   * building identity inherited "requires Cotality courtesy attribution",
   * crediting the provider for a fact it never stated.
   *
   * Distinct duties, never merged:
   *   'attribution_required'    provider/REBNY factual-source obligation
   *   'listing_brokerage_courtesy'  "Listing Courtesy of ..." — a BROKERAGE duty,
   *                             not a data-source one
   *   'mallan_derived_disclosure'  must be disclosed as Mallan enrichment and
   *                             never presented as provider truth
   *   'provenance_disclosure'   origin visible to the audience regardless of author
   */
  attributionObligations: readonly AudienceObligation[];
  /** @deprecated Collapsed four duties into one. Read `attribution` instead. */
  requiresAttribution: boolean;
  failureBehavior: FailureBehavior;
  notes?: string;
}

// Visibility presets.
const V_PUBLIC: AudienceVisibility = { public: true, client: true, agent: true, report: true };
const V_CLIENT: AudienceVisibility = { public: false, client: true, agent: true, report: true };
const V_AGENT: AudienceVisibility = { public: false, client: false, agent: true, report: true };
const V_REPORT: AudienceVisibility = { public: false, client: false, agent: true, report: true };

type FieldDefaults = Partial<FieldSpec>;

/** Factory: sensible fail-closed defaults, overridden per field. */
function f(
  // `authorityResolution` is MANDATORY — a new field cannot be added without
  // deciding HOW its authorship is determined. `sourceAuthority` is CONDITIONAL:
  // supplied only for `fixed`/`mallan_derived` facts, and deliberately absent for
  // `by_listing_authority` ones, where no static value could be truthful.
  base: Pick<FieldSpec, 'canonicalKey' | 'uiLabel' | 'category' | 'type' | 'authorityResolution'> & FieldDefaults,
): FieldSpec {
  return {
    providerMappingStatus: 'needs_probe',
    cotalityField: null,
    dbColumn: null,
    projectionColumn: null,
    searchParam: null,
    visibility: V_AGENT,
    filterable: 'no',
    sortable: 'no',
    alertable: 'no',
    reportable: 'no',
    attributionObligations: [],
    requiresAttribution: false,
    failureBehavior: 'fail_closed',
    ...base,
  };
}

export const FIELD_REGISTRY: readonly FieldSpec[] = Object.freeze([
  // ── identity / source / attribution ──────────────────────────────────────
  f({ canonicalKey: 'listing_key', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'Provider Listing Key', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingKey', dbColumn: null, projectionColumn: 'listing_key', searchParam: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'yes', notes: 'IDENTITY DOMAIN CORRECTED 2026-08-21. This previously claimed dbColumn `listing_id`, which is a DIFFERENT identifier: schema documents Listing.listing_id as "Trestle ListingId OR internal SL-/RL- prefix", while ListingsArchive.listing_key is separately documented as "Trestle ListingKey". Mapping ListingKey onto the ListingId column conflates two provider identifiers. VERIFIED STORAGE: ListingKey is NOT in any typed Listing column — it is carried in raw_data (and ListingsArchive.listing_key for terminal rows). NO SCHEMA CHANGE is proposed; the existing raw/provider structures already carry the fact. For an SL-/RL- listing with a suppressed Mallan-office Cotality representation, this provider key belongs to the REPRESENTATION as reconciliation evidence and never replaces the local canonical identity. Media joins must keep using the provider ListingKey domain — do NOT "fix" identity by repointing Media at the Mallan local id.' }),
  f({ canonicalKey: 'listing_id_mls', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'MLS #', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingId', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'IDENTITY DOMAIN NOTE 2026-08-21. Listing.listing_id is DUAL-DOMAIN by schema definition: it holds either a Trestle ListingId OR an internal SL-/RL- prefix. It is therefore the MALLAN CANONICAL listing identity, not purely a provider field, and it must never be overwritten by a provider identifier. Cotality ListingKey and ListingKeyNumeric are separate provider identifiers — see canonicalKey listing_key.' }),
  f({ canonicalKey: 'provider_lineage', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'Provider Lineage', category: 'identity_source_attribution', type: 'object', providerMappingStatus: 'mapped', cotalityField: 'SourceSystemName/SourceSystemID/SourceSystemKey/OriginatingSystemName/OriginatingSystemID/OriginatingSystemKey', dbColumn: null, projectionColumn: null, visibility: V_AGENT, filterable: 'no', sortable: 'no', alertable: 'no', reportable: 'no', failureBehavior: 'na', notes: 'MODEL CORRECTED 2026-08-21 — this was `source` mapped to SourceSystemName and treated as canonical listing source. It is NOT. These fields describe how the record travelled the provider pipeline (RLS -> REBNY -> Trestle) and answer nothing about whether a listing is Mallan-authored or third-party inventory. Live census of 35 Mallan-office rows: SourceSystemName 0/35, SourceSystemKey 0/35, SourceSystemID=TRESTLE 35/35, OriginatingSystemName=RLS 35/35, OriginatingSystemKey=RLS-side keys. Retained as RAW LINEAGE evidence only. CANONICAL LISTING AUTHORITY comes from the existing local-vs-provider identity contract (lib/listings/mallan-source-identity.ts) — never from this family, and no second classifier is introduced. Deliberately not filterable/sortable/reportable: lineage is evidence, not a Search axis.' }),
  f({ canonicalKey: 'list_agent_name', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Listing Agent', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListAgentFullName', dbColumn: 'list_agent_full_name', visibility: V_CLIENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Agent PII masked from public per DTO tiers.' }),
  f({ canonicalKey: 'list_office_name', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Listing Office', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListOfficeName', dbColumn: 'list_office_name', visibility: V_PUBLIC, reportable: 'yes', requiresAttribution: true, notes: 'Courtesy line source; NOT plumbed into alert emails today (analysis §3).' }),

  // ── address / location / building ────────────────────────────────────────
  f({ canonicalKey: 'address', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Address', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnparsedAddress', dbColumn: 'address', searchParam: 'q', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Address display gated by InternetAddressDisplayYN.' }),
  f({ canonicalKey: 'unit', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Unit', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnitNumber', searchParam: 'unit', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes' }),
  f({ canonicalKey: 'neighborhood', authorityResolution: 'unresolved', uiLabel: 'Neighborhood', category: 'address_location_building', type: 'string', providerMappingStatus: 'partial', cotalityField: 'SubdivisionName', dbColumn: 'neighborhood', searchParam: 'neighborhood', filterKeys: ['neighborhood'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Resolves 3 ways today (ZIP expansion vs SubdivisionName vs name) — analysis B-4. PROVISIONAL 2026-08-21. Do NOT set neighborhood = SubdivisionName merely because the field exists. The live geography study must compare SubdivisionName, CityRegion, MLSAreaMajor, MLSAreaMinor and PostalCity by actual value and population before the canonical transformation and authority are decided.' }),
  f({ canonicalKey: 'borough', authorityResolution: 'unresolved', uiLabel: 'Borough', category: 'address_location_building', type: 'string', providerMappingStatus: 'partial', cotalityField: 'CountyOrParish', dbColumn: 'borough', searchParam: 'borough', filterKeys: ['borough'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'CountyOrParish vs CityRegion split (analysis B-3) — needs_probe on canonical field. PROVISIONAL 2026-08-21. CountyOrParish is a COUNTY (Kings/New York/Richmond/Queens), not a borough. Do not lock authority until the live NYC geography study compares CountyOrParish, CityRegion, SubdivisionName, MLSAreaMajor, MLSAreaMinor, PostalCity, PostalCode and structured address.' }),
  f({ canonicalKey: 'postal_code', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'ZIP', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'PostalCode', dbColumn: 'postal_code', searchParam: 'zip', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'building_name', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Building', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'BuildingName', searchParam: 'buildingName', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'BuildingName is Edm.String(50), non-null on 3,903 of 8,056 Search-eligible listings (48%) — a NAME, not an identity, and absent on half the corpus. It cannot key Building Search. See building_identity.' }),

  /**
   * BUILDING IDENTITY — MALLAN-DERIVED. The provider cannot supply it.
   *
   * Probed live 2026-08-20, exhaustively over the Search-eligible universe
   * (8,056/8,056 rows, coverage complete):
   *   BuildingKey         Edm.String(300)  populated on 0 rows
   *   BuildingKeyNumeric  Edm.Int64        populated on 0 rows
   *   GET /Building                        PROVIDER_REJECTED_403 (not licensed)
   *
   * Both fields exist and are correctly typed, and BOTH ARE EMPTY. The Building
   * entity is declared in $metadata but the licence does not grant it — a
   * textbook case of $metadata over-declaring what is actually available.
   *
   * So Building Search CANNOT be provider-derived, and no amount of Property
   * filtering turns listing rows into buildings. Identity must be MALLAN-DERIVED:
   * Cotality address -> canonical Mallan address -> Google geocoding -> canonical
   * building identity, grouping Property rows by canonical address WITHOUT the
   * unit. StreetNumber / StreetName / PostalCode are non-null on 8,056/8,056, so
   * the inputs exist even though the provider key does not.
   *
   * This is Mallan-owned enrichment and must never be attributed to Cotality.
   */
  f({ canonicalKey: 'building_identity', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Building', category: 'address_location_building', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', failureBehavior: 'fail_closed', attributionObligations: ['mallan_derived_disclosure', 'provenance_disclosure'], semanticEquivalenceProven: false, notes: 'BuildingKey/BuildingKeyNumeric are populated 0/8,056 and GET /Building is 403. Derive from canonical address + Google geocoding; never present as provider fact.' }),
  f({ canonicalKey: 'map_location', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Map Location', category: 'address_location_building', type: 'computed', providerMappingStatus: 'none', cotalityField: null, dbColumn: null, projectionColumn: null, searchParam: null, visibility: V_PUBLIC, filterable: 'no', sortable: 'no', alertable: 'no', reportable: 'needs_probe', failureBehavior: 'fail_closed', attributionObligations: ['mallan_derived_disclosure', 'provenance_disclosure'], semanticEquivalenceProven: false, notes: 'CONCEPT CORRECTED 2026-08-21 — was canonicalKey `geo` with dbColumn latitude/longitude, described as "Cotality address -> Google geocoding -> canonical coordinate". BOTH halves were wrong. (a) COTALITY SUPPLIES NO GEO: lib/geo/geocode.ts states the IDX Plus feed returns null Latitude/Longitude, so there is no provider coordinate to map. (b) GOOGLE WAS NEVER INVOLVED — I invented it. The actual populator is the US Census geocoder via scripts/batch-geocode.js into geocode_cache (source=census). Do NOT introduce Google, Mapbox or any new service. THERE IS NO SEPARATE MALLAN GEO FACT FAMILY: coordinates are an implementation artifact of the map integration, not an independent canonical listing fact and not a Search axis — hence filterable/sortable/alertable all `no`, and Latitude/Longitude are never exposed as broker Search fields. THE MAP SYSTEM OWNS SPATIAL RESOLUTION: public/crm/js/render/results-map.js (MapLibre GL + OpenFreeMap) and neighborhood-map.js (existing RLS neighborhood GeoJSON polygons/aliases from scripts/build-rls-geo-derived.js). Correct chain: Cotality structured address -> canonical Mallan address -> EXISTING map/geography system -> pin/neighborhood/map filtering. KNOWN DEFECT, not to be preserved: TWO layers currently fabricate precise-looking positions — results-map.js falls back to a neighborhood centroid plus a spiral offset (several blocks), and geocode.ts falls back to a ZIP centroid plus deterministic jitter. Required instead: resolved address -> exact pin; neighborhood only -> explicitly neighborhood-level geography; unresolvable -> NO fake building pin. Never manufacture a nearby point to make a marker appear. If no exact address resolver exists for a case, that is a MAP INTEGRATION GAP to record, not to paper over.' }),

  // ── transaction (sale / rent) ────────────────────────────────────────────
  f({ canonicalKey: 'transaction_type', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Buy / Rent', category: 'transaction', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertyType', dbColumn: 'listing_type', searchParam: 'type', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'sale=Residential, rental=ResidentialLease (no space). Expressed 3 ways today (analysis §1.5).' }),
  f({ canonicalKey: 'commercial', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Commercial', category: 'transaction', type: 'boolean', providerMappingStatus: 'partial', cotalityField: 'PropertyType', searchParam: 'commercial', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Commercial PropertyType members exist but are 0 live in this feed.' }),

  // ── lifecycle / status ───────────────────────────────────────────────────
  f({ canonicalKey: 'standard_status', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'StandardStatus', dbColumn: 'status', projectionColumn: 'mls_status', searchParam: 'statuses', filterKeys: ['statuses'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Only filterable status field (11 members). Pending is the live in-contract status; AUC 0 live.' }),
  f({ canonicalKey: 'mls_status', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'MLS Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MlsStatus', visibility: V_AGENT, filterable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_loud', notes: 'Provider-suppressed: NOT $filter-able (HTTP 400). Readable, never a query axis — fails loud if used to filter.' }),

  // ── pricing ──────────────────────────────────────────────────────────────
  f({ canonicalKey: 'list_price', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ListPrice', dbColumn: 'list_price', projectionColumn: 'list_price', searchParam: 'minPrice/maxPrice', filterKeys: ['price_min', 'price_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'original_list_price', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Original Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'OriginalListPrice', visibility: V_AGENT, reportable: 'yes', notes: 'Feeds price-cut intelligence (needs temporal history — reserved).' }),
  f({ canonicalKey: 'price_per_sqft', authorityResolution: 'unresolved', uiLabel: '$/Sqft', category: 'pricing', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP (analysis B-15): not computed/stored anywhere. Requires reliable LivingArea. AUTHORITY UNRESOLVED 2026-08-21 — was prematurely called Cotality-authored arithmetic. Live CustomProperty declares PricePerArea Decimal(14,2) AND a PricePerAreaUnit enum. Establish whether Cotality already carries a usable price-per-area fact, in which units, populated for NYC residential, and whether it means what Mallan needs. Local derivation is a conclusion AFTER that probe, not before it.' }),

  // ── close / rental history ───────────────────────────────────────────────
  f({ canonicalKey: 'close_price', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Sold Price', category: 'close_rental_history', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ClosePrice', dbColumn: 'close_price', visibility: V_AGENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Public closed sale = ACRIS only. CMA never selects this today (CMA close-price P0 — separate PR).' }),
  f({ canonicalKey: 'close_date', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Sold Date', category: 'close_rental_history', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'CloseDate', dbColumn: 'contract_closed', visibility: V_AGENT, reportable: 'yes', notes: 'Comp windowing uses CloseDate (comp-eligibility.ts), never ModificationTimestamp.' }),
  f({ canonicalKey: 'achieved_rent', authorityResolution: 'unresolved', uiLabel: 'Achieved Rent', category: 'close_rental_history', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'No public rental sold record; rental comps need list_rent + optional achieved_rent (analysis §8). AUTHORITY UNRESOLVED 2026-08-21 — was prematurely called mallan_derived. Live Property metadata DOES declare LeaseAmount Decimal(14,2) and TotalActualRent Decimal(14,2). Neither is proven to mean achieved residential rent; population and semantics must be probed on ResidentialLease records first. Never derive an achieved rent merely because the concept is wanted.' }),
  f({ canonicalKey: 'acris_sale_history', authorityResolution: 'fixed', sourceAuthority: 'acris', uiLabel: 'Public Sale History', category: 'close_rental_history', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_PUBLIC, reportable: 'yes', notes: 'ACRIS public-record only; co-op deed logic partially breaks (needs_probe).' }),

  // ── DOM / date fields ────────────────────────────────────────────────────
  f({ canonicalKey: 'days_on_market', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Days on Market', category: 'dom_dates', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'DaysOnMarket', dbColumn: 'days_on_market', visibility: V_CLIENT, filterable: 'needs_probe', sortable: 'needs_probe', reportable: 'yes', notes: 'Column+DTO exist but never rendered/filtered/sorted (analysis B-10). UCBA DOM-display rules apply.' }),
  f({ canonicalKey: 'listing_contract_date', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Listed Date', category: 'dom_dates', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'ListingContractDate', dbColumn: 'listing_contract_date', visibility: V_PUBLIC, sortable: 'yes', reportable: 'yes', notes: 'Canonical "newest" sort key (NOT ModificationTimestamp).' }),
  f({ canonicalKey: 'first_seen_at', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'First Seen', category: 'dom_dates', type: 'date', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'first_active_date', visibility: V_AGENT, reportable: 'needs_probe', notes: 'Our ingest time ≠ MLS list date. first_active_date exists but unwired (analysis §strategic gap 2 / reserved temporal).' }),

  // ── beds / baths / rooms / square feet ───────────────────────────────────
  f({ canonicalKey: 'bedrooms', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Beds', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'BedroomsTotal', dbColumn: 'bedrooms_total', projectionColumn: 'bedrooms_total', searchParam: 'beds/maxBeds', filterKeys: ['beds_min', 'beds_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'bathrooms', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Baths', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', cotalityField: 'BathroomsFull/BathroomsHalf', dbColumn: 'bathrooms_full', searchParam: 'minBaths/maxBaths', filterKeys: ['baths_min', 'baths_max'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Diverges by engine: BathroomsFull vs BathroomsTotalInteger (analysis B-2) — canonicalize.' }),
  f({ canonicalKey: 'rooms_total', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Rooms', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', cotalityField: 'RoomsTotal', visibility: V_CLIENT, filterable: 'needs_probe', reportable: 'yes', notes: 'DTO reads features.Rooms but mapper stores RoomsTotal → always undefined today (analysis B-1).' }),
  f({ canonicalKey: 'living_area', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Square Feet', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'LivingArea', dbColumn: 'living_area', projectionColumn: 'living_area', searchParam: 'minSqft/maxSqft', filterKeys: ['sqft_min', 'sqft_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Reliability drives $/sqft (needs_probe on completeness).' }),

  // ── monthly carrying costs ───────────────────────────────────────────────
  f({ canonicalKey: 'maintenance_common_charge', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Maintenance / CC', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'AssociationFee', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP (analysis B-15): not filterable/sortable anywhere today. FIELD FAMILY, not one field. AssociationFee alone is NOT a monthly maintenance number: live AssociationFeeFrequency includes Monthly/Quarterly/Annually/SemiMonthly/Weekly, and AssociationFee2 / AssociationFee3 families also exist. For NYC the business meaning also depends on CommonInterest — co-op MAINTENANCE and condo COMMON CHARGES are different facts, not two labels. Never normalise money without its units/frequency.' }),
  f({ canonicalKey: 'taxes', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Taxes', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'TaxAnnualAmount', visibility: V_PUBLIC, reportable: 'needs_probe', notes: 'Input to total carrying cost.' }),
  f({ canonicalKey: 'assessment', authorityResolution: 'unresolved', uiLabel: 'Assessment', category: 'carrying_costs', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'PRODUCT GAP: no assessment field modeled. AUTHORITY UNRESOLVED 2026-08-21 — was prematurely called mallan_derived with "no provider field". Live Property metadata DOES declare TaxOtherAnnualAssessmentAmount Decimal(14,2). It may or may not correspond to the NYC assessment concept; probe population and semantics before deciding.' }),
  f({ canonicalKey: 'total_monthly_cost', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Total Monthly', category: 'carrying_costs', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP: maintenance+CC+taxes+assessment → total monthly is computed nowhere (reserved economics).' }),

  // ── ownership / common interest ──────────────────────────────────────────
  f({ canonicalKey: 'ownership', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Ownership', category: 'ownership_common_interest', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'CommonInterest', searchParam: 'ownershipTypes', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', dbColumn: 'common_interest', notes: 'CORRECTED 2026-08-21 from LIVE Cotality. CommonInterest is THE ONE canonical condo/co-op/condop criterion. Exhaustive Active census: Condominium 3,722 / StockCooperative 2,509 / None 998 / RentalBuilding 639 / Condop 147 = 8,015 = `ne null` exactly; the other 8 declared members are ZERO. The competing PropertySubType members Condominium and StockCooperative are populated ZERO at EVERY status, so the CRM commercial section pointing at PropertySubType matches nothing and must be re-pointed HERE. Do NOT maintain separate residential and commercial ownership field truths - the provider contract does not require one. Co-op=StockCooperative (no Cooperative member). Unmapped in CRM today (B-11).' }),

  // ── property type / sub-type ─────────────────────────────────────────────
  f({ canonicalKey: 'property_sub_type', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Property Type', category: 'property_type', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertySubType', dbColumn: 'property_sub_type', projectionColumn: 'property_sub_type', searchParam: 'propertySubType', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'CORRECTED 2026-08-21 against LIVE Cotality. Was declared multi_enum/partial/needs_probe with a note that sub-types "cannot be pushed to $filter (502)". Every part of that was wrong. PropertySubType is a SCALAR nullable Enum (75 members) — the MULTI field is the SEPARATE PropertySubTypeAdditional, deliberately NOT folded in. `eq` and `in` are SUPPORTED; `contains()` is HTTP 400 because contains takes strings and this is an enum — the 502 was Mallan\'s own /api/idx/search converting that 400. Live census on Active is COMPLETE (75/75 probed, 0 UNVERIFIED): Apartment 6,625 / MultiFamily 425 / SingleFamilyResidence 402 / Duplex 354 / Loft 79 / MixedUse 72 / Triplex 63 / Office 1, summing to 8,021 = PropertySubType ne null exactly. The other 67 members are zero, and Townhouse / Condominium / StockCooperative / UnimprovedLand are zero at EVERY status — valid literals this feed has never carried, which is a product problem, not a mapping one. A MIS-CASED literal is NOT rejected: it returns 200 with zero rows, so validation is case-exact and Mallan-side. Vocabulary and both renderers live in the subordinate property-subtype-contract.ts. MIS-MAPPING RESOLVED 2026-08-21: the four zero-population UI controls were pointed at the wrong provider fact, which is NOT the same as the capability being unavailable. Townhouse and Multi-Family are carried by StructureType (see structure_type; Townhouse 612 Active there vs 0 here). Condo and Co-op are OWNERSHIP facts carried by CommonInterest (3,722 and 2,509 Active vs 0 here). Land is the one genuine absence - PropertyType Land, PropertySubType Land, UnimprovedLand and ImprovedLand are ALL zero at every status - and note that PropertyType Land and PropertySubType UnimprovedLand are different facts, so a general Land control must never silently mean UnimprovedLand. No control is removed on the strength of one unpopulated candidate field. CommonInterest stays a separate ownership fact.' }),

  f({ canonicalKey: 'structure_type', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Structure Type', category: 'property_type', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'StructureType', searchParam: null, visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'ADDED 2026-08-21 from LIVE Cotality. MULTI-enum (Enums.Multi.StructureType, 23 members) so it is queried with the `has NAMESPACE"Member"` form, never `eq`. THIS IS THE FIELD THAT CARRIES NYC TOWNHOUSE INVENTORY: StructureType Townhouse = 612 Active / 5,951 all-status, while PropertySubType Townhouse = 0 at EVERY status. 612 active townhouses were being searched as zero because the UI pointed at the wrong field - the capability was never dead. MULTI-FAMILY NEEDS BOTH FIELDS: PropertySubType MultiFamily = 426 Active, StructureType MultiFamily = 715 Active, and the two overlap on only 159 rows (union ~982), so reading PropertySubType alone misses ~57% of live multifamily inventory. The criterion is PropertySubType OR StructureType, not a choice. StructureType ne null = 7,152 / 8,032 Active. PropertyType MultiFamily is declared but ZERO and contributes nothing.' }),

  f({ canonicalKey: 'max_financing', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'Max Financing Allowed', category: 'ownership_common_interest', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'CustomProperty.CustomFields -> MaximumFinancingPercent', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'ADDED 2026-08-21 from LIVE Cotality. THE BUILDING FINANCING LIMIT EXISTS AND IS HEAVILY POPULATED, but it is INVISIBLE to $metadata: it lives inside CustomProperty.CustomFields, an UNDECLARED JSON object carried in a single declared Edm.String. Exhaustive Active census via $expand=CustomProperty read 8,010/8,010 rows, 0 null blobs, 0 unparsable: MaximumFinancingPercent on 6,803 rows (84.9%, values 50.00-90.00), MaximumFinancingRemarks 82.6%, MaximumFinancingAmount 9.5%. Meanwhile the DECLARED financing fields CurrentFinancing, BuyerFinancing and ListingTerms are populated ZERO on Active. CAPABILITY CONSTRAINT: $filter cannot reach inside an Edm.String, so this is NOT provider-filterable - it must be read via $expand and matched Mallan-side, or derived onto the projection at build time like amenity_keys. The same blob carries 51 other NYC keys including AttendanceType (100%, the doorman/concierge/elevator-attendant fact this registry records as ABSENT), ElevatorsTotal (100%), FlipTax (89%), SponsorUnitYN (97%), TaxAbatementYN (99.9%), TaxDeductionPercent (59.3%) and PercentOfCommonElements (86%). Evidence: docs/idx/cotality-property-type-family-and-customfields-2026-08-21.md.' }),

  // ── open house ───────────────────────────────────────────────────────────
  f({ canonicalKey: 'open_house', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Open House', category: 'open_house', type: 'object', providerMappingStatus: 'mapped', cotalityField: 'OpenHouse (resource)', searchParam: 'openHouse/openHouseDate', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'IS read via /odata/OpenHouse but applied post-pagination (analysis §4 D1); not alert-capable.' }),

  // ── media ────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'media', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Photos / Tour', category: 'media', type: 'array', providerMappingStatus: 'partial', cotalityField: 'Media (ResourceRecordKey)', visibility: V_PUBLIC, reportable: 'yes', notes: 'Media keyed by ResourceRecordKey (needs_probe). Photo count / hero / floorplan / tour → media-intelligence (reserved).' }),

  // ── amenities ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'amenities', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Amenities', category: 'amenities', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'BuildingFeatures/Appliances/View/... (substring)', searchParam: 'amenities', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', amenityKey: '(per-amenity; see AMENITY_TOKENS)', notes: 'CORRECTED 2026-08-20. Exact-TOKEN matching, never substring — a substring test on PetsAllowed "Yes" also matches "BuildingYes", i.e. the building permits pets while the UNIT does not. Some amenities ARE provider booleans (GarageYN 2,630 / FireplaceYN 861 / NewConstructionYN 951); ElevatorYN and DoormanYN remain absent. Collection fields reject /any() lambda filters (HTTP 400) so they are matched Mallan-side, but they DO $select. Tokens live in the subordinate AMENITY_TOKENS vocabulary; capability is decided here.' }),

  // ── parking / garage ─────────────────────────────────────────────────────
  f({ canonicalKey: 'parking', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Parking / Garage', category: 'parking_garage', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'ParkingFeatures', searchParam: 'amenities:garage', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', amenityKey: 'garage', semanticEquivalenceProven: false, notes: 'CORRECTED 2026-08-20: the claim "GarageYN boolean does not exist" was FALSE — GarageYN is a live filterable Boolean, true on 2,630 Active, vs a Garage token on only 591 ParkingFeatures rows. Still needs_probe for a SEMANTIC reason, not a field one: GarageYN proves a garage, while the UI label also promises generic parking (valet/assigned/on-street/deeded are separate tokens).' }),

  // ── pets ─────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'pets', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Pets', category: 'pets', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'PetsAllowed', searchParam: 'amenities:pet-friendly', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', amenityKey: 'pet-friendly', semanticEquivalenceProven: true, notes: 'PetsAllowed is a MULTI-enum mixing building- and unit-level tokens: "BuildingYes,No" means the building permits pets and THE UNIT DOES NOT. Exact-token match on unit-level Yes/CatsOk/DogsOk gives 4,304 live; substring gives 6,861, i.e. 2,557 listings a renter with a dog cannot rent. `PetsAllowedYN` exists and is filterable but is populated ZERO, so the multi-value parse must stay.' }),

  // ── furnished ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'furnished', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'Furnished', category: 'furnished', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Furnished', searchParam: 'furnished', visibility: V_PUBLIC, reportable: 'yes', filterable: 'yes', notes: 'FIVE live members — Furnished 106 / Unfurnished 2,876 / Negotiable 12 / Partially 4 / FurnishedOrUnfurnished 0. Not a boolean. furnished=true means STRICTLY Furnished; widening to Partially/Negotiable is a product decision, not a mapping one.' }),

  // ── new development / new construction ───────────────────────────────────
  f({ canonicalKey: 'new_development', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality_rebny' }, uiLabel: 'New Development', category: 'new_development', type: 'boolean', providerMappingStatus: 'mapped', visibility: V_PUBLIC, reportable: 'yes', failureBehavior: 'fail_closed', cotalityField: 'NewConstructionYN', filterable: 'yes', notes: 'CORRECTED 2026-08-20: NewConstructionYN IS a live filterable Boolean, true on 951 Active. NewDevelopmentYN genuinely IS rejected (HTTP 400) and `NewConstruction` is not a PropertySubType member — that half was right. Detection via PublicRemarks prose is REMOVED: it is answerable by no provider field, and a listing whose remarks say "brand new" is not new construction.' }),

  // ── Mallan exclusive / internal ──────────────────────────────────────────
  f({ canonicalKey: 'mallan_exclusive', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Mallan Exclusive', category: 'mallan_exclusive_internal', type: 'boolean', providerMappingStatus: 'partial', cotalityField: null, searchParam: 'exclusive', visibility: V_PUBLIC, filterable: 'yes', sortable: 'needs_probe', reportable: 'yes', notes: 'Company data. Expressed ≥3 ways today (analysis §1.6); sort=exclusives uses the weak agent_id!=null signal.' }),

  // ── agent-only / private / restricted ────────────────────────────────────
  f({ canonicalKey: 'permission', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'Permission', category: 'agent_private_restricted', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Permission/ListingPermission', visibility: V_AGENT, filterable: 'no', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Private = participant-only. NO OwnerOptOut member in either enum — owner-opt-out must fail closed until a live field/value is confirmed.' }),
  f({ canonicalKey: 'owner_opt_out', authorityResolution: 'unresolved', uiLabel: 'Owner Opt-Out', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'owner_opt_out', projectionColumn: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 1 compliance. No live provider value; enforced via DB column. Not mirrored on projection (B-13 fail-open risk). Fail closed. INTERNALLY CONTRADICTORY, now marked unresolved: it claimed cotality_rebny authority while cotalityField is null and enforcement runs through a local DB column with no verified provider value. `OwnerOptOut` is NOT among the 20 live Permission members. Trace the writer and the exact RLS/Cotality permission/display fields that might inform it. Until proven, do not describe the resulting local state as a Cotality-authored fact. The fail-closed Gate 1 sentinel stays regardless.' }),
  f({ canonicalKey: 'participant_only', authorityResolution: 'fixed', sourceAuthority: 'cotality_rebny', uiLabel: 'Participant Only', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'mapped', cotalityField: 'Permission=Private', dbColumn: 'participant_only', projectionColumn: 'participant_only_yn', visibility: V_AGENT, reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 2. Column name divergence participant_only vs participant_only_yn (B-13).' }),

  // ── report / CMA / investor fields ───────────────────────────────────────
  f({ canonicalKey: 'comp_set', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Comparables', category: 'report_cma_investor', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_REPORT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Two shapes: sale (close_price) vs rental (list_rent/achieved_rent). CMA close-price fix is a separate PR.' }),
  f({ canonicalKey: 'confidence_score', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Confidence', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'Reserved data_quality dimension; not computed. Broker opinion, NOT an appraisal (§J boundary).' }),
  f({ canonicalKey: 'investor_yield', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Cap Rate / Yield', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'Blocked on carrying-cost + rental-economics (reserved). Labeled estimate, not advice.' }),

  // ── engagement / marketing (reserved placeholders) ───────────────────────
  f({ canonicalKey: 'engagement_event', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Engagement', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: view/favorite/dwell/share stream (analysis §strategic gap 8). Not wired, no schema.' }),
  f({ canonicalKey: 'campaign_segment', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Campaign Segment', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: saved-search + audience + suppression (analysis §15.C). Not wired, no schema.' }),
]);

// ── registry helpers + honesty validators ──────────────────────────────────

export function getField(canonicalKey: string): FieldSpec | undefined {
  return FIELD_REGISTRY.find((s) => s.canonicalKey === canonicalKey);
}

export function fieldsByCategory(category: FieldCategory): FieldSpec[] {
  return FIELD_REGISTRY.filter((s) => s.category === category);
}

/** The set of families actually present in the registry. */
export function representedFamilies(): Set<FieldCategory> {
  return new Set(FIELD_REGISTRY.map((s) => s.category));
}

/** Completeness: every REQUIRED_FAMILY must have at least one field. Returns the missing ones. */
export function missingFamilies(): FieldCategory[] {
  const present = representedFamilies();
  return REQUIRED_FAMILIES.filter((fam) => !present.has(fam));
}

/**
 * Honesty guard for a capability request. `unsupported` fails loud; `needs_probe` may not be
 * treated as verified. Returns null when the axis is usable ('yes'), else an explanatory error.
 */
export function assertCapabilityUsable(
  field: FieldSpec,
  axis: 'filterable' | 'sortable' | 'alertable' | 'reportable',
): string | null {
  const status = field[axis];
  if (status === 'yes') return null;
  if (status === 'unsupported') {
    return `[canonical] field "${field.canonicalKey}" is UNSUPPORTED for ${axis} — must fail loud, not be accepted.`;
  }
  if (status === 'needs_probe') {
    return `[canonical] field "${field.canonicalKey}" is needs_probe for ${axis} — run cotality:pull/verify before relying on it.`;
  }
  return `[canonical] field "${field.canonicalKey}" is not offered for ${axis}.`;
}

/**
 * The alert-capable canonical FILTER keys — the union of `filterKeys` across fields with
 * `alertable === 'yes'`. This is the correct namespace for saved-search validation:
 * `SavedSearchCriteria.filters` is keyed by CanonicalFilterKey (price_min, beds_min, statuses…),
 * NOT by registry field keys (list_price, bedrooms, standard_status).
 */
export function alertableFilterKeys(): CanonicalFilterKey[] {
  const keys = new Set<CanonicalFilterKey>();
  for (const s of FIELD_REGISTRY) {
    if (s.alertable === 'yes' && s.filterKeys) for (const k of s.filterKeys) keys.add(k);
  }
  return [...keys];
}


// ─────────────────────────────────────────────────────────────────────────────
// AMENITY CAPABILITY — decided HERE, from the subordinate token vocabulary.
//
// The registry owns whether a criterion may be offered. `amenity-vocabulary.ts`
// owns only which exact provider tokens express it. Callers must ask THIS, never
// infer capability from the vocabulary, or the two will drift apart again.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * No live token expresses these, so a filter built on one matches nothing and
 * fails silently — indistinguishable to a user from "no results".
 *
 * `renovated` is provider-SUPPORTED but unpopulated and resolves on its own if
 * the feed ever carries `InteriorFeatures.Remodeled`; the others have no live
 * field at all. Both are unavailable today.
 */
export const UNSUPPORTED_AMENITY_KEYS: ReadonlySet<string> = new Set(
  Object.entries(AMENITY_TOKENS)
    .filter(([, spec]) => spec.values.length === 0 && spec.match !== 'isTrue')
    .map(([key]) => key),
);

/**
 * Tokens exist and are well populated, but the token has NOT been proven to MEAN
 * the UI label. These are `needs_probe`, NOT verified — offering them as
 * functional asserts an equivalence nobody established.
 *
 *   doorman        `Concierge` (1,523 live) — a concierge is not a doorman, and
 *                  the live vocabulary has no `Doorman` token at all
 *   garage         `GarageYN` proves a GARAGE; the label also promises generic
 *                  PARKING, which valet/assigned/on-street/deeded do not follow from
 *   skyline-views  `City`/`CityLights`/`Panoramic` are not SKYLINE specifically —
 *                  a ground-floor city view is not a skyline view
 */
export const SEMANTICALLY_UNPROVEN_AMENITY_KEYS: ReadonlySet<string> = new Set(
  Object.entries(AMENITY_TOKENS)
    .filter(([, spec]) => Boolean(spec.semanticNote))
    .map(([key]) => key),
);

/**
 * May this amenity be executed as a Search filter?
 *
 * TWO INDEPENDENT GATES, deliberately not collapsed:
 *
 *   1. MECHANICAL — is there a live-present token or boolean to match at all?
 *   2. SEMANTIC   — has the token been proven to MEAN the UI label?
 *
 * Mechanical matchability is not business-semantic validity. `Concierge` matches
 * cleanly and is populated on 1,523 listings; filtering `doorman` by it would
 * still answer a question the broker did not ask. Passing gate 1 while failing
 * gate 2 is exactly the case this function exists to refuse.
 */
export function isAmenityExecutable(key: string): boolean {
  if (!(key in AMENITY_TOKENS)) return false;
  if (UNSUPPORTED_AMENITY_KEYS.has(key)) return false;        // gate 1
  if (SEMANTICALLY_UNPROVEN_AMENITY_KEYS.has(key)) return false; // gate 2
  return true;
}

/**
 * Why an amenity cannot be executed — so callers can fail LOUD with a reason
 * instead of silently returning nothing.
 */
export function amenityRefusalReason(key: string): string | null {
  if (!(key in AMENITY_TOKENS)) return 'UNKNOWN_AMENITY';
  if (UNSUPPORTED_AMENITY_KEYS.has(key)) return 'NO_LIVE_TOKEN';
  if (SEMANTICALLY_UNPROVEN_AMENITY_KEYS.has(key)) return 'SEMANTIC_EQUIVALENCE_UNPROVEN';
  return null;
}
