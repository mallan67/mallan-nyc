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
   * Who authored this fact. Orthogonal to `providerMappingStatus`.
   *
   * MANDATORY and explicit on every entry — there is deliberately NO default.
   * The factory previously defaulted this to `'cotality_rebny'`, so any field
   * that forgot to override it silently became a Cotality fact. That is the
   * worst possible failure direction for provenance: it credits the provider for
   * Mallan analytics, ACRIS data and Google-derived geography, and nothing fails.
   * The compiler now forces a decision for every canonical fact.
   *
   * A computed value is NOT automatically `mallan_derived`. Judge the authority
   * of the INPUTS and the nature of the RESULT: pure arithmetic over Cotality
   * fields restates a Cotality fact and adds no authority, whereas a value
   * requiring external data or a Mallan modelling choice does not belong to the
   * provider. Where a fact genuinely combines authorities, use the provenance
   * envelope rather than pretending one source authored the whole thing.
   */
  sourceAuthority: SourceAuthority;
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
  // `sourceAuthority` is REQUIRED here, not defaulted. This is the compile-time
  // gate: a new field cannot be added without deciding who authored the fact.
  base: Pick<FieldSpec, 'canonicalKey' | 'uiLabel' | 'category' | 'type' | 'sourceAuthority'> & FieldDefaults,
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
  f({ canonicalKey: 'listing_key', sourceAuthority: 'cotality_rebny', uiLabel: 'Listing Key', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingKey', dbColumn: 'listing_id', searchParam: 'listingId', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Public DTO currently emits internal listing_id as mlsId (analysis B-12) — registry key is ListingKey.' }),
  f({ canonicalKey: 'listing_id_mls', sourceAuthority: 'cotality_rebny', uiLabel: 'MLS #', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingId', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes' }),
  f({ canonicalKey: 'source', sourceAuthority: 'cotality_rebny', uiLabel: 'Source', category: 'identity_source_attribution', type: 'enum', providerMappingStatus: 'partial', cotalityField: 'SourceSystemName', visibility: V_PUBLIC, reportable: 'yes', requiresAttribution: true, notes: 'No typed source column today (acris|mls|mallan_exclusive|internal) — provenance is inferred per-surface; contract makes it first-class.' }),
  f({ canonicalKey: 'list_agent_name', sourceAuthority: 'cotality_rebny', uiLabel: 'Listing Agent', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListAgentFullName', dbColumn: 'list_agent_full_name', visibility: V_CLIENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Agent PII masked from public per DTO tiers.' }),
  f({ canonicalKey: 'list_office_name', sourceAuthority: 'cotality_rebny', uiLabel: 'Listing Office', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListOfficeName', dbColumn: 'list_office_name', visibility: V_PUBLIC, reportable: 'yes', requiresAttribution: true, notes: 'Courtesy line source; NOT plumbed into alert emails today (analysis §3).' }),

  // ── address / location / building ────────────────────────────────────────
  f({ canonicalKey: 'address', sourceAuthority: 'cotality_rebny', uiLabel: 'Address', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnparsedAddress', dbColumn: 'address', searchParam: 'q', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Address display gated by InternetAddressDisplayYN.' }),
  f({ canonicalKey: 'unit', sourceAuthority: 'cotality_rebny', uiLabel: 'Unit', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnitNumber', searchParam: 'unit', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes' }),
  f({ canonicalKey: 'neighborhood', sourceAuthority: 'cotality_rebny', uiLabel: 'Neighborhood', category: 'address_location_building', type: 'string', providerMappingStatus: 'partial', cotalityField: 'SubdivisionName', dbColumn: 'neighborhood', searchParam: 'neighborhood', filterKeys: ['neighborhood'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Resolves 3 ways today (ZIP expansion vs SubdivisionName vs name) — analysis B-4.' }),
  f({ canonicalKey: 'borough', sourceAuthority: 'mallan_derived', uiLabel: 'Borough', category: 'address_location_building', type: 'string', providerMappingStatus: 'partial', cotalityField: 'CountyOrParish', dbColumn: 'borough', searchParam: 'borough', filterKeys: ['borough'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'CountyOrParish vs CityRegion split (analysis B-3) — needs_probe on canonical field.' }),
  f({ canonicalKey: 'postal_code', sourceAuthority: 'cotality_rebny', uiLabel: 'ZIP', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'PostalCode', dbColumn: 'postal_code', searchParam: 'zip', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'building_name', sourceAuthority: 'cotality_rebny', uiLabel: 'Building', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'BuildingName', searchParam: 'buildingName', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'BuildingName is Edm.String(50), non-null on 3,903 of 8,056 Search-eligible listings (48%) — a NAME, not an identity, and absent on half the corpus. It cannot key Building Search. See building_identity.' }),

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
  f({ canonicalKey: 'building_identity', uiLabel: 'Building', category: 'address_location_building', type: 'computed', providerMappingStatus: 'none', sourceAuthority: 'mallan_derived', cotalityField: null, visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', failureBehavior: 'fail_closed', attributionObligations: ['mallan_derived_disclosure', 'provenance_disclosure'], semanticEquivalenceProven: false, notes: 'BuildingKey/BuildingKeyNumeric are populated 0/8,056 and GET /Building is 403. Derive from canonical address + Google geocoding; never present as provider fact.' }),
  f({ canonicalKey: 'geo', uiLabel: 'Map Location', category: 'address_location_building', type: 'geo', cotalityField: null, dbColumn: 'latitude/longitude', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', providerMappingStatus: 'none', sourceAuthority: 'mallan_derived', attributionObligations: ['mallan_derived_disclosure', 'provenance_disclosure'], notes: 'CORRECTED 2026-08-20. A nullable Latitude/Longitude declaration in $metadata is NOT a Search capability and must never be used as one on that basis. Mallan geo is Cotality address -> canonical Mallan address -> Google geocoding -> canonical coordinate, with MTA/Google transit enrichment layered on. Mallan-owned, attributable to Mallan, never to the provider.' }),

  // ── transaction (sale / rent) ────────────────────────────────────────────
  f({ canonicalKey: 'transaction_type', sourceAuthority: 'cotality_rebny', uiLabel: 'Buy / Rent', category: 'transaction', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertyType', dbColumn: 'listing_type', searchParam: 'type', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'sale=Residential, rental=ResidentialLease (no space). Expressed 3 ways today (analysis §1.5).' }),
  f({ canonicalKey: 'commercial', sourceAuthority: 'cotality_rebny', uiLabel: 'Commercial', category: 'transaction', type: 'boolean', providerMappingStatus: 'partial', cotalityField: 'PropertyType', searchParam: 'commercial', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Commercial PropertyType members exist but are 0 live in this feed.' }),

  // ── lifecycle / status ───────────────────────────────────────────────────
  f({ canonicalKey: 'standard_status', sourceAuthority: 'cotality_rebny', uiLabel: 'Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'StandardStatus', dbColumn: 'status', projectionColumn: 'mls_status', searchParam: 'statuses', filterKeys: ['statuses'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Only filterable status field (11 members). Pending is the live in-contract status; AUC 0 live.' }),
  f({ canonicalKey: 'mls_status', sourceAuthority: 'cotality_rebny', uiLabel: 'MLS Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MlsStatus', visibility: V_AGENT, filterable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_loud', notes: 'Provider-suppressed: NOT $filter-able (HTTP 400). Readable, never a query axis — fails loud if used to filter.' }),

  // ── pricing ──────────────────────────────────────────────────────────────
  f({ canonicalKey: 'list_price', sourceAuthority: 'cotality_rebny', uiLabel: 'Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ListPrice', dbColumn: 'list_price', projectionColumn: 'list_price', searchParam: 'minPrice/maxPrice', filterKeys: ['price_min', 'price_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'original_list_price', sourceAuthority: 'cotality_rebny', uiLabel: 'Original Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'OriginalListPrice', visibility: V_AGENT, reportable: 'yes', notes: 'Feeds price-cut intelligence (needs temporal history — reserved).' }),
  f({ canonicalKey: 'price_per_sqft', sourceAuthority: 'cotality_rebny', uiLabel: '$/Sqft', category: 'pricing', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP (analysis B-15): not computed/stored anywhere. Requires reliable LivingArea.' }),

  // ── close / rental history ───────────────────────────────────────────────
  f({ canonicalKey: 'close_price', sourceAuthority: 'cotality_rebny', uiLabel: 'Sold Price', category: 'close_rental_history', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ClosePrice', dbColumn: 'close_price', visibility: V_AGENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Public closed sale = ACRIS only. CMA never selects this today (CMA close-price P0 — separate PR).' }),
  f({ canonicalKey: 'close_date', sourceAuthority: 'cotality_rebny', uiLabel: 'Sold Date', category: 'close_rental_history', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'CloseDate', dbColumn: 'contract_closed', visibility: V_AGENT, reportable: 'yes', notes: 'Comp windowing uses CloseDate (comp-eligibility.ts), never ModificationTimestamp.' }),
  f({ canonicalKey: 'achieved_rent', sourceAuthority: 'mallan_derived', uiLabel: 'Achieved Rent', category: 'close_rental_history', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'No public rental sold record; rental comps need list_rent + optional achieved_rent (analysis §8).' }),
  f({ canonicalKey: 'acris_sale_history', sourceAuthority: 'acris', uiLabel: 'Public Sale History', category: 'close_rental_history', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_PUBLIC, reportable: 'yes', notes: 'ACRIS public-record only; co-op deed logic partially breaks (needs_probe).' }),

  // ── DOM / date fields ────────────────────────────────────────────────────
  f({ canonicalKey: 'days_on_market', sourceAuthority: 'cotality_rebny', uiLabel: 'Days on Market', category: 'dom_dates', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'DaysOnMarket', dbColumn: 'days_on_market', visibility: V_CLIENT, filterable: 'needs_probe', sortable: 'needs_probe', reportable: 'yes', notes: 'Column+DTO exist but never rendered/filtered/sorted (analysis B-10). UCBA DOM-display rules apply.' }),
  f({ canonicalKey: 'listing_contract_date', sourceAuthority: 'cotality_rebny', uiLabel: 'Listed Date', category: 'dom_dates', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'ListingContractDate', dbColumn: 'listing_contract_date', visibility: V_PUBLIC, sortable: 'yes', reportable: 'yes', notes: 'Canonical "newest" sort key (NOT ModificationTimestamp).' }),
  f({ canonicalKey: 'first_seen_at', sourceAuthority: 'mallan_crm', uiLabel: 'First Seen', category: 'dom_dates', type: 'date', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'first_active_date', visibility: V_AGENT, reportable: 'needs_probe', notes: 'Our ingest time ≠ MLS list date. first_active_date exists but unwired (analysis §strategic gap 2 / reserved temporal).' }),

  // ── beds / baths / rooms / square feet ───────────────────────────────────
  f({ canonicalKey: 'bedrooms', sourceAuthority: 'cotality_rebny', uiLabel: 'Beds', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'BedroomsTotal', dbColumn: 'bedrooms_total', projectionColumn: 'bedrooms_total', searchParam: 'beds/maxBeds', filterKeys: ['beds_min', 'beds_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'bathrooms', sourceAuthority: 'cotality_rebny', uiLabel: 'Baths', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', cotalityField: 'BathroomsFull/BathroomsHalf', dbColumn: 'bathrooms_full', searchParam: 'minBaths/maxBaths', filterKeys: ['baths_min', 'baths_max'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Diverges by engine: BathroomsFull vs BathroomsTotalInteger (analysis B-2) — canonicalize.' }),
  f({ canonicalKey: 'rooms_total', sourceAuthority: 'cotality_rebny', uiLabel: 'Rooms', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', cotalityField: 'RoomsTotal', visibility: V_CLIENT, filterable: 'needs_probe', reportable: 'yes', notes: 'DTO reads features.Rooms but mapper stores RoomsTotal → always undefined today (analysis B-1).' }),
  f({ canonicalKey: 'living_area', sourceAuthority: 'cotality_rebny', uiLabel: 'Square Feet', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'LivingArea', dbColumn: 'living_area', projectionColumn: 'living_area', searchParam: 'minSqft/maxSqft', filterKeys: ['sqft_min', 'sqft_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Reliability drives $/sqft (needs_probe on completeness).' }),

  // ── monthly carrying costs ───────────────────────────────────────────────
  f({ canonicalKey: 'maintenance_common_charge', sourceAuthority: 'cotality_rebny', uiLabel: 'Maintenance / CC', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'AssociationFee', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP (analysis B-15): not filterable/sortable anywhere today.' }),
  f({ canonicalKey: 'taxes', sourceAuthority: 'cotality_rebny', uiLabel: 'Taxes', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'TaxAnnualAmount', visibility: V_PUBLIC, reportable: 'needs_probe', notes: 'Input to total carrying cost.' }),
  f({ canonicalKey: 'assessment', sourceAuthority: 'mallan_derived', uiLabel: 'Assessment', category: 'carrying_costs', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'PRODUCT GAP: no assessment field modeled.' }),
  f({ canonicalKey: 'total_monthly_cost', sourceAuthority: 'mallan_derived', uiLabel: 'Total Monthly', category: 'carrying_costs', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP: maintenance+CC+taxes+assessment → total monthly is computed nowhere (reserved economics).' }),

  // ── ownership / common interest ──────────────────────────────────────────
  f({ canonicalKey: 'ownership', sourceAuthority: 'cotality_rebny', uiLabel: 'Ownership', category: 'ownership_common_interest', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'CommonInterest', searchParam: 'ownershipTypes', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'condo/coop/condop/rental_building/none. Co-op=StockCooperative (no Cooperative member). Unmapped in CRM today (B-11).' }),

  // ── property type / sub-type ─────────────────────────────────────────────
  f({ canonicalKey: 'property_sub_type', sourceAuthority: 'cotality_rebny', uiLabel: 'Property Type', category: 'property_type', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'PropertySubType', searchParam: 'subTypes', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Structural sub-types cannot be pushed to $filter (502) → post-filtered; some literals invalid (400). needs_probe.' }),

  // ── open house ───────────────────────────────────────────────────────────
  f({ canonicalKey: 'open_house', sourceAuthority: 'cotality_rebny', uiLabel: 'Open House', category: 'open_house', type: 'object', providerMappingStatus: 'mapped', cotalityField: 'OpenHouse (resource)', searchParam: 'openHouse/openHouseDate', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'IS read via /odata/OpenHouse but applied post-pagination (analysis §4 D1); not alert-capable.' }),

  // ── media ────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'media', sourceAuthority: 'cotality_rebny', uiLabel: 'Photos / Tour', category: 'media', type: 'array', providerMappingStatus: 'partial', cotalityField: 'Media (ResourceRecordKey)', visibility: V_PUBLIC, reportable: 'yes', notes: 'Media keyed by ResourceRecordKey (needs_probe). Photo count / hero / floorplan / tour → media-intelligence (reserved).' }),

  // ── amenities ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'amenities', sourceAuthority: 'cotality_rebny', uiLabel: 'Amenities', category: 'amenities', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'BuildingFeatures/Appliances/View/... (substring)', searchParam: 'amenities', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', amenityKey: '(per-amenity; see AMENITY_TOKENS)', notes: 'CORRECTED 2026-08-20. Exact-TOKEN matching, never substring — a substring test on PetsAllowed "Yes" also matches "BuildingYes", i.e. the building permits pets while the UNIT does not. Some amenities ARE provider booleans (GarageYN 2,630 / FireplaceYN 861 / NewConstructionYN 951); ElevatorYN and DoormanYN remain absent. Collection fields reject /any() lambda filters (HTTP 400) so they are matched Mallan-side, but they DO $select. Tokens live in the subordinate AMENITY_TOKENS vocabulary; capability is decided here.' }),

  // ── parking / garage ─────────────────────────────────────────────────────
  f({ canonicalKey: 'parking', sourceAuthority: 'cotality_rebny', uiLabel: 'Parking / Garage', category: 'parking_garage', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'ParkingFeatures', searchParam: 'amenities:garage', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', amenityKey: 'garage', semanticEquivalenceProven: false, notes: 'CORRECTED 2026-08-20: the claim "GarageYN boolean does not exist" was FALSE — GarageYN is a live filterable Boolean, true on 2,630 Active, vs a Garage token on only 591 ParkingFeatures rows. Still needs_probe for a SEMANTIC reason, not a field one: GarageYN proves a garage, while the UI label also promises generic parking (valet/assigned/on-street/deeded are separate tokens).' }),

  // ── pets ─────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'pets', sourceAuthority: 'cotality_rebny', uiLabel: 'Pets', category: 'pets', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'PetsAllowed', searchParam: 'amenities:pet-friendly', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', amenityKey: 'pet-friendly', semanticEquivalenceProven: true, notes: 'PetsAllowed is a MULTI-enum mixing building- and unit-level tokens: "BuildingYes,No" means the building permits pets and THE UNIT DOES NOT. Exact-token match on unit-level Yes/CatsOk/DogsOk gives 4,304 live; substring gives 6,861, i.e. 2,557 listings a renter with a dog cannot rent. `PetsAllowedYN` exists and is filterable but is populated ZERO, so the multi-value parse must stay.' }),

  // ── furnished ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'furnished', sourceAuthority: 'cotality_rebny', uiLabel: 'Furnished', category: 'furnished', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Furnished', searchParam: 'furnished', visibility: V_PUBLIC, reportable: 'yes', filterable: 'yes', notes: 'FIVE live members — Furnished 106 / Unfurnished 2,876 / Negotiable 12 / Partially 4 / FurnishedOrUnfurnished 0. Not a boolean. furnished=true means STRICTLY Furnished; widening to Partially/Negotiable is a product decision, not a mapping one.' }),

  // ── new development / new construction ───────────────────────────────────
  f({ canonicalKey: 'new_development', sourceAuthority: 'cotality_rebny', uiLabel: 'New Development', category: 'new_development', type: 'boolean', providerMappingStatus: 'mapped', visibility: V_PUBLIC, reportable: 'yes', failureBehavior: 'fail_closed', cotalityField: 'NewConstructionYN', filterable: 'yes', notes: 'CORRECTED 2026-08-20: NewConstructionYN IS a live filterable Boolean, true on 951 Active. NewDevelopmentYN genuinely IS rejected (HTTP 400) and `NewConstruction` is not a PropertySubType member — that half was right. Detection via PublicRemarks prose is REMOVED: it is answerable by no provider field, and a listing whose remarks say "brand new" is not new construction.' }),

  // ── Mallan exclusive / internal ──────────────────────────────────────────
  f({ canonicalKey: 'mallan_exclusive', sourceAuthority: 'mallan_crm', uiLabel: 'Mallan Exclusive', category: 'mallan_exclusive_internal', type: 'boolean', providerMappingStatus: 'partial', cotalityField: null, searchParam: 'exclusive', visibility: V_PUBLIC, filterable: 'yes', sortable: 'needs_probe', reportable: 'yes', notes: 'Company data. Expressed ≥3 ways today (analysis §1.6); sort=exclusives uses the weak agent_id!=null signal.' }),

  // ── agent-only / private / restricted ────────────────────────────────────
  f({ canonicalKey: 'permission', sourceAuthority: 'cotality_rebny', uiLabel: 'Permission', category: 'agent_private_restricted', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Permission/ListingPermission', visibility: V_AGENT, filterable: 'no', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Private = participant-only. NO OwnerOptOut member in either enum — owner-opt-out must fail closed until a live field/value is confirmed.' }),
  f({ canonicalKey: 'owner_opt_out', sourceAuthority: 'cotality_rebny', uiLabel: 'Owner Opt-Out', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'owner_opt_out', projectionColumn: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 1 compliance. No live provider value; enforced via DB column. Not mirrored on projection (B-13 fail-open risk). Fail closed.' }),
  f({ canonicalKey: 'participant_only', sourceAuthority: 'cotality_rebny', uiLabel: 'Participant Only', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'mapped', cotalityField: 'Permission=Private', dbColumn: 'participant_only', projectionColumn: 'participant_only_yn', visibility: V_AGENT, reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 2. Column name divergence participant_only vs participant_only_yn (B-13).' }),

  // ── report / CMA / investor fields ───────────────────────────────────────
  f({ canonicalKey: 'comp_set', sourceAuthority: 'mallan_derived', uiLabel: 'Comparables', category: 'report_cma_investor', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_REPORT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Two shapes: sale (close_price) vs rental (list_rent/achieved_rent). CMA close-price fix is a separate PR.' }),
  f({ canonicalKey: 'confidence_score', sourceAuthority: 'mallan_derived', uiLabel: 'Confidence', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'Reserved data_quality dimension; not computed. Broker opinion, NOT an appraisal (§J boundary).' }),
  f({ canonicalKey: 'investor_yield', sourceAuthority: 'mallan_derived', uiLabel: 'Cap Rate / Yield', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'Blocked on carrying-cost + rental-economics (reserved). Labeled estimate, not advice.' }),

  // ── engagement / marketing (reserved placeholders) ───────────────────────
  f({ canonicalKey: 'engagement_event', sourceAuthority: 'mallan_crm', uiLabel: 'Engagement', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: view/favorite/dwell/share stream (analysis §strategic gap 8). Not wired, no schema.' }),
  f({ canonicalKey: 'campaign_segment', sourceAuthority: 'mallan_crm', uiLabel: 'Campaign Segment', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: saved-search + audience + suppression (analysis §15.C). Not wired, no schema.' }),
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
