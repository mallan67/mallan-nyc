/**
 * field-registry.ts — the canonical field registry SKELETON (PURE; not wired to any reader).
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
 * This is a SKELETON: complete enough to guide the whole platform, but nothing here is wired to
 * runtime. Populating live values and swapping readers onto the registry are later per-surface PRs.
 */

import type { AudienceVisibility, CapabilityStatus, FailureBehavior } from './capability';
import type { CanonicalFilterKey } from './filter-keys';

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

export type ProviderMappingStatus = 'mapped' | 'partial' | 'none' | 'needs_probe' | 'reserved';

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
  /** true ⇒ rendering this field's row requires source/courtesy attribution. */
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
function f(base: Pick<FieldSpec, 'canonicalKey' | 'uiLabel' | 'category' | 'type'> & FieldDefaults): FieldSpec {
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
    requiresAttribution: false,
    failureBehavior: 'fail_closed',
    ...base,
  };
}

export const FIELD_REGISTRY: readonly FieldSpec[] = Object.freeze([
  // ── identity / source / attribution ──────────────────────────────────────
  f({ canonicalKey: 'listing_key', uiLabel: 'Listing Key', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingKey', dbColumn: 'listing_id', searchParam: 'listingId', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Public DTO currently emits internal listing_id as mlsId (analysis B-12) — registry key is ListingKey.' }),
  f({ canonicalKey: 'listing_id_mls', uiLabel: 'MLS #', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingId', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: non-null on every active row; eq filter and orderby SUPPORTED. ListingId and ListingKey are separate identity domains and are never interchanged (docs/search/evidence/2026-09-05-live-cotality-checkpoint-contract.md §K).' }),
  f({ canonicalKey: 'source', uiLabel: 'Source', category: 'identity_source_attribution', type: 'enum', providerMappingStatus: 'partial', cotalityField: 'SourceSystemName', visibility: V_PUBLIC, reportable: 'yes', requiresAttribution: true, notes: 'No typed source column today (acris|mls|mallan_exclusive|internal) — provenance is inferred per-surface; contract makes it first-class.' }),
  f({ canonicalKey: 'list_agent_name', uiLabel: 'Listing Agent', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListAgentFullName', dbColumn: 'list_agent_full_name', visibility: V_CLIENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Agent PII masked from public per DTO tiers.' }),
  f({ canonicalKey: 'list_office_name', uiLabel: 'Listing Office', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListOfficeName', dbColumn: 'list_office_name', visibility: V_PUBLIC, reportable: 'yes', requiresAttribution: true, notes: 'Courtesy line source; NOT plumbed into alert emails today (analysis §3).' }),

  // ── address / location / building ────────────────────────────────────────
  f({ canonicalKey: 'address', uiLabel: 'Address', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnparsedAddress', dbColumn: 'address', searchParam: 'q', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Address display gated by InternetAddressDisplayYN.' }),
  f({ canonicalKey: 'unit', uiLabel: 'Unit', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnitNumber', searchParam: 'unit', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes' }),
  f({ canonicalKey: 'neighborhood', uiLabel: 'Neighborhood', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'SubdivisionName', dbColumn: 'neighborhood', searchParam: 'neighborhood', filterKeys: ['neighborhood'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: SubdivisionName populated on 100% of both active universes; eq and orderby SUPPORTED. Executes as an exact eq over every LIVE case variant of the chosen token. The Validator re-check (item 5) CONFIRMED 100% population, eq and orderby support, and every named case variant live (e.g. Tribeca 109 / TriBeCa 5, SoHo 35 / Soho 5 / SOHO 1); it declined by rule to verify the universe-wide token count, so the vocabulary SIZE (236 sale / 108 rental distinct tokens, 7 / 1 case-variant groups, no token spanning two boroughs — docs/search/evidence/2026-09-05-subdivision-vocab-*.json) remains BUILDER live evidence. The provider ACCEPTS an unknown token and returns 0 rather than rejecting it, so only live tokens may be executed. MLSAreaMajor/Minor are null and PROVIDER_REJECTED for filter/orderby; never an axis. No alias file is provider vocabulary.' }),
  f({ canonicalKey: 'borough', uiLabel: 'Borough', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'CityRegion', dbColumn: 'borough', searchParam: 'borough', filterKeys: ['borough'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: CityRegion carries the five boroughs on 100% of both active universes with tokens Manhattan | Brooklyn | Queens | Bronx | StatenIsland (no space); eq and orderby SUPPORTED; sale counts 4422/1314/607/268/27 sum exactly to the universe (Validator re-check item 4 CONFIRMED). The provider ACCEPTS the wrong token "Staten Island" (with a space) and returns 0 instead of rejecting it, so Mallan\'s label must be mapped to the live token deterministically. CountyOrParish carries the county equivalents (New York | Kings | Queens | Bronx | Richmond) with identical counts and is the county field, not the borough criterion. City is the constant "New York City"; PostalCity mixes vocabularies (checkpoint-contract §H).' }),
  f({ canonicalKey: 'postal_code', uiLabel: 'ZIP', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'PostalCode', dbColumn: 'postal_code', searchParam: 'zip', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'building_name', uiLabel: 'Building', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'BuildingName', searchParam: 'buildingName', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Building-name text works on Trestle path only (analysis §4).' }),
  f({ canonicalKey: 'geo', uiLabel: 'Map Location', category: 'address_location_building', type: 'geo', providerMappingStatus: 'partial', cotalityField: 'Latitude/Longitude', dbColumn: 'latitude/longitude', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Lat/Lng mostly null on feed; geocoder backfills — needs_probe.' }),

  // ── transaction (sale / rent) ────────────────────────────────────────────
  f({ canonicalKey: 'transaction_type', uiLabel: 'Buy / Rent', category: 'transaction', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertyType', dbColumn: 'listing_type', searchParam: 'type', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: under StandardStatus eq Active only Residential (6638) and ResidentialLease (918) exist; the other 11 members are 0. The SALE universe is POSITIVE membership PropertyType eq Residential, never "ne ResidentialLease" (which admits eleven zero-count members). RENTAL is PropertyType eq ResidentialLease (checkpoint-contract §1.3, §B).' }),
  f({ canonicalKey: 'commercial', uiLabel: 'Commercial', category: 'transaction', type: 'boolean', providerMappingStatus: 'partial', cotalityField: 'PropertyType', searchParam: 'commercial', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Commercial PropertyType members exist but are 0 live in this feed.' }),

  // ── lifecycle / status ───────────────────────────────────────────────────
  f({ canonicalKey: 'standard_status', uiLabel: 'Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'StandardStatus', dbColumn: 'status', projectionColumn: 'mls_status', searchParam: 'statuses', filterKeys: ['statuses'], visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: picklist of 11 members, eq SUPPORTED on all 11, orderby SUPPORTED. Only four are populated anywhere in the feed: Active 7555, Closed 578373, Pending 5597, ComingSoon 6; ActiveUnderContract, Canceled, Delete, Expired, Hold, Incomplete, Withdrawn are 0. Pending is the live in-contract state (checkpoint-contract §1.2).' }),
  f({ canonicalKey: 'mls_status', uiLabel: 'MLS Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MlsStatus', visibility: V_AGENT, filterable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_loud', notes: 'Provider-suppressed: NOT $filter-able (HTTP 400). Readable, never a query axis — fails loud if used to filter.' }),

  // ── pricing ──────────────────────────────────────────────────────────────
  f({ canonicalKey: 'list_price', uiLabel: 'Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ListPrice', dbColumn: 'list_price', projectionColumn: 'list_price', searchParam: 'minPrice/maxPrice', filterKeys: ['price_min', 'price_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'original_list_price', uiLabel: 'Original Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'OriginalListPrice', visibility: V_AGENT, reportable: 'yes', notes: 'Feeds price-cut intelligence (needs temporal history — reserved).' }),
  f({ canonicalKey: 'price_per_sqft', uiLabel: '$/Sqft', category: 'pricing', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP (analysis B-15): not computed/stored anywhere. Requires reliable LivingArea.' }),

  // ── close / rental history ───────────────────────────────────────────────
  f({ canonicalKey: 'close_price', uiLabel: 'Sold Price', category: 'close_rental_history', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ClosePrice', dbColumn: 'close_price', visibility: V_AGENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Public closed sale = ACRIS only. CMA never selects this today (CMA close-price P0 — separate PR).' }),
  f({ canonicalKey: 'close_date', uiLabel: 'Sold Date', category: 'close_rental_history', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'CloseDate', dbColumn: 'contract_closed', visibility: V_AGENT, reportable: 'yes', notes: 'Comp windowing uses CloseDate (comp-eligibility.ts), never ModificationTimestamp.' }),
  f({ canonicalKey: 'achieved_rent', uiLabel: 'Achieved Rent', category: 'close_rental_history', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'No public rental sold record; rental comps need list_rent + optional achieved_rent (analysis §8).' }),
  f({ canonicalKey: 'acris_sale_history', uiLabel: 'Public Sale History', category: 'close_rental_history', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_PUBLIC, reportable: 'yes', notes: 'ACRIS public-record only; co-op deed logic partially breaks (needs_probe).' }),

  // ── DOM / date fields ────────────────────────────────────────────────────
  f({ canonicalKey: 'days_on_market', uiLabel: 'Days on Market', category: 'dom_dates', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'DaysOnMarket', dbColumn: 'days_on_market', visibility: V_CLIENT, filterable: 'needs_probe', sortable: 'needs_probe', reportable: 'yes', notes: 'Column+DTO exist but never rendered/filtered/sorted (analysis B-10). UCBA DOM-display rules apply.' }),
  f({ canonicalKey: 'listing_contract_date', uiLabel: 'Listed Date', category: 'dom_dates', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'ListingContractDate', dbColumn: 'listing_contract_date', visibility: V_PUBLIC, sortable: 'yes', reportable: 'yes', notes: 'Canonical "newest" sort key (NOT ModificationTimestamp, which orders by last touch). Live 2026-09-05, CONFIRMED by independent Validator re-check (item 7): ListingContractDate non-null on every active sale and rental row; select, ne null, orderby and ge all SUPPORTED (docs/search/evidence/2026-09-05-registry-recheck-validator.md).' }),
  f({ canonicalKey: 'first_seen_at', uiLabel: 'First Seen', category: 'dom_dates', type: 'date', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'first_active_date', visibility: V_AGENT, reportable: 'needs_probe', notes: 'Our ingest time ≠ MLS list date. first_active_date exists but unwired (analysis §strategic gap 2 / reserved temporal).' }),

  // ── beds / baths / rooms / square feet ───────────────────────────────────
  f({ canonicalKey: 'bedrooms', uiLabel: 'Beds', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'BedroomsTotal', dbColumn: 'bedrooms_total', projectionColumn: 'bedrooms_total', searchParam: 'beds/maxBeds', filterKeys: ['beds_min', 'beds_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'bathrooms', uiLabel: 'Baths', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'BathroomsFull/BathroomsHalf', dbColumn: 'bathrooms_full', searchParam: 'minBaths/maxBaths', filterKeys: ['baths_min', 'baths_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: BathroomsFull and BathroomsHalf are non-null on 100% of both active universes and are filterable and orderable. BathroomsTotalInteger is NOT the canonical figure: 15 nulls on the sale universe and, on 200 sampled rows, it disagreed with Full+Half on 12 (e.g. Full 4, Half 2, Total 5). Mallan canonical value = Full + 0.5 x Half, a Mallan rule over two live fields; the criterion executes on Full and Half, never on TotalInteger (checkpoint-contract §G).' }),
  f({ canonicalKey: 'rooms_total', uiLabel: 'Rooms', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', cotalityField: 'RoomsTotal', visibility: V_CLIENT, filterable: 'needs_probe', reportable: 'yes', notes: 'DTO reads features.Rooms but mapper stores RoomsTotal → always undefined today (analysis B-1).' }),
  f({ canonicalKey: 'living_area', uiLabel: 'Square Feet', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'LivingArea', dbColumn: 'living_area', projectionColumn: 'living_area', searchParam: 'minSqft/maxSqft', filterKeys: ['sqft_min', 'sqft_max'], visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Reliability drives $/sqft (needs_probe on completeness).' }),

  // ── monthly carrying costs ───────────────────────────────────────────────
  f({ canonicalKey: 'maintenance_common_charge', uiLabel: 'Maintenance / CC', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'AssociationFee', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP (analysis B-15): not filterable/sortable anywhere today.' }),
  f({ canonicalKey: 'taxes', uiLabel: 'Taxes', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'TaxAnnualAmount', visibility: V_PUBLIC, reportable: 'needs_probe', notes: 'Input to total carrying cost.' }),
  f({ canonicalKey: 'assessment', uiLabel: 'Assessment', category: 'carrying_costs', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'PRODUCT GAP: no assessment field modeled.' }),
  f({ canonicalKey: 'total_monthly_cost', uiLabel: 'Total Monthly', category: 'carrying_costs', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'PRODUCT GAP: maintenance+CC+taxes+assessment → total monthly is computed nowhere (reserved economics).' }),

  // ── ownership / common interest ──────────────────────────────────────────
  f({ canonicalKey: 'ownership', uiLabel: 'Ownership', category: 'ownership_common_interest', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'CommonInterest', searchParam: 'ownershipTypes', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: CommonInterest is the carrier of Mallan\'s basic property type for condo / co-op / condop; eq SUPPORTED on all 13 members. Sale: Condominium 3282, StockCooperative 2350, None 844, Condop 127, RentalBuilding 35; rental: RentalBuilding 519, Condominium 200, None 128, StockCooperative 52, Condop 19. Co-op = StockCooperative. Townhouse is NOT here (see structure_type). OwnershipType and CommonWalls are entirely null (checkpoint-contract §D).' }),

  // ── property type / sub-type ─────────────────────────────────────────────
  f({ canonicalKey: 'property_sub_type', uiLabel: 'Property Sub-Type', category: 'property_type', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertySubType', searchParam: 'subTypes', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: SINGLE-valued enum (provider Field type "String List, Single"), 75 members, eq SUPPORTED on every member; no 502 reproduced. It does NOT carry Mallan\'s basic property type on this feed: Apartment is 5432 of 6638 sale rows, while Condominium, StockCooperative and Townhouse are 0 on both universes. Condo / co-op / condop live in ownership (CommonInterest); Townhouse lives in structure_type (StructureType). Sub-type is a secondary criterion only (checkpoint-contract §C).' }),
  f({ canonicalKey: 'structure_type', uiLabel: 'Building Form', category: 'property_type', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'StructureType', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'Live 2026-09-05: multi-value field; `has \'<member>\'` and `eq \'<member>\'` SUPPORTED with identical counts (HighRise 3826 sale). Carrier of Mallan\'s Townhouse basic type: StructureType has Townhouse = 518 sale rows, 506 of them CommonInterest None. The un-namespaced enum form and /any() lambdas are PROVIDER_REJECTED; execute with the bare-string has form (checkpoint-contract §D, §J).' }),

  // ── open house ───────────────────────────────────────────────────────────
  f({ canonicalKey: 'open_house', uiLabel: 'Open House', category: 'open_house', type: 'object', providerMappingStatus: 'mapped', cotalityField: 'OpenHouse (resource)', searchParam: 'openHouse/openHouseDate', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'IS read via /odata/OpenHouse but applied post-pagination (analysis §4 D1); not alert-capable.' }),

  // ── media ────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'media', uiLabel: 'Photos / Tour', category: 'media', type: 'array', providerMappingStatus: 'mapped', cotalityField: 'Media (ResourceRecordKey = ListingKey; ResourceRecordID = ListingId)', visibility: V_PUBLIC, reportable: 'yes', notes: 'Live 2026-09-05: Media joins to Property by ResourceRecordKey eq ListingKey OR by ResourceRecordID eq ListingId — each in its own domain, both return the same rows, crossed forms return 0. Validator re-check (item 10) CONFIRMED: both join forms return the same rows (61 = 61), crossed forms 0, Order 1 appears once per category (Photo and FloorPlan), PreferredPhotoYN null on 196 of 200 rows. A photo-first hero is chosen by category and Order, never by Order alone; PreferredPhotoYN is not a dependable marker. Media-level InternetEntireListingDisplayYN populated and filterable remains Builder evidence (system-study §5a).' }),

  // ── amenities ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'amenities', uiLabel: 'Amenities', category: 'amenities', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'BuildingFeatures/Appliances/View/... (substring)', searchParam: 'amenities', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'No YN booleans (ElevatorYN/DoormanYN absent); substring over multi-value picklists. Silently no-op on Trestle fallback except pet-friendly (D2). Some map to InteriorFeatures but live enum is InteriorOrRoomFeatures → needs_probe.' }),

  // ── parking / garage ─────────────────────────────────────────────────────
  f({ canonicalKey: 'parking', uiLabel: 'Parking / Garage', category: 'parking_garage', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'ParkingFeatures', searchParam: 'amenities:garage', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'ParkingFeatures enum verified live; GarageYN boolean does not exist.' }),

  // ── pets ─────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'pets', uiLabel: 'Pets', category: 'pets', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'PetsAllowed', searchParam: 'amenities:pet-friendly', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'PetsAllowed enum verified live; the one amenity honored on the Trestle fallback.' }),

  // ── furnished ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'furnished', uiLabel: 'Furnished', category: 'furnished', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Furnished', searchParam: 'furnished', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'Furnished enum verified live; DB path applies it post-pagination (D1).' }),

  // ── new development / new construction ───────────────────────────────────
  f({ canonicalKey: 'new_development', uiLabel: 'New Development', category: 'new_development', type: 'boolean', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'NewDevelopmentYN/NewConstruction NOT live members; detected via PublicRemarks/DevelopmentStatus. needs_probe.' }),

  // ── Mallan exclusive / internal ──────────────────────────────────────────
  f({ canonicalKey: 'mallan_exclusive', uiLabel: 'Mallan Exclusive', category: 'mallan_exclusive_internal', type: 'boolean', providerMappingStatus: 'partial', cotalityField: null, searchParam: 'exclusive', visibility: V_PUBLIC, filterable: 'yes', sortable: 'needs_probe', reportable: 'yes', notes: 'Company data. Expressed ≥3 ways today (analysis §1.6); sort=exclusives uses the weak agent_id!=null signal.' }),

  // ── agent-only / private / restricted ────────────────────────────────────
  f({ canonicalKey: 'permission', uiLabel: 'Permission', category: 'agent_private_restricted', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Permission/ListingPermission', visibility: V_AGENT, filterable: 'no', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Private = participant-only. NO OwnerOptOut member in either enum — owner-opt-out must fail closed until a live field/value is confirmed.' }),
  f({ canonicalKey: 'owner_opt_out', uiLabel: 'Owner Opt-Out', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'owner_opt_out', projectionColumn: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 1 compliance. No live provider value; enforced via DB column. Not mirrored on projection (B-13 fail-open risk). Fail closed.' }),
  f({ canonicalKey: 'participant_only', uiLabel: 'Participant Only', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'mapped', cotalityField: 'Permission=Private', dbColumn: 'participant_only', projectionColumn: 'participant_only_yn', visibility: V_AGENT, reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 2. Column name divergence participant_only vs participant_only_yn (B-13).' }),

  // ── report / CMA / investor fields ───────────────────────────────────────
  f({ canonicalKey: 'comp_set', uiLabel: 'Comparables', category: 'report_cma_investor', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_REPORT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Two shapes: sale (close_price) vs rental (list_rent/achieved_rent). CMA close-price fix is a separate PR.' }),
  f({ canonicalKey: 'confidence_score', uiLabel: 'Confidence', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'Reserved data_quality dimension; not computed. Broker opinion, NOT an appraisal (§J boundary).' }),
  f({ canonicalKey: 'investor_yield', uiLabel: 'Cap Rate / Yield', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'Blocked on carrying-cost + rental-economics (reserved). Labeled estimate, not advice.' }),

  // ── engagement / marketing (reserved placeholders) ───────────────────────
  f({ canonicalKey: 'engagement_event', uiLabel: 'Engagement', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: view/favorite/dwell/share stream (analysis §strategic gap 8). Not wired, no schema.' }),
  f({ canonicalKey: 'campaign_segment', uiLabel: 'Campaign Segment', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: saved-search + audience + suppression (analysis §15.C). Not wired, no schema.' }),
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
