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
import type { CanonicalFilterKeyName } from './filter-keys.generated';
import type { CriterionValueShape } from './criteria-values';
import type { SearchWorkflow } from './search-workflow';
import type { CriterionRole } from './criterion-role';
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
 * Deliberately says NOTHING about who authored the value. A Mallan-derived
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

/**
 * A canonical module that OWNS the provider mapping for a criterion.
 *
 * Five modules already render their own OData against their own recorded live
 * evidence. For those criteria this registry declares the OWNER and does not
 * restate the Cotality field, because two files describing one mapping is
 * exactly how drift returns — and it already had: this entry list said
 * `borough → CountyOrParish` while `geography.ts`, which renders the clause and
 * carries the probe record, emits `CityRegion`.
 *
 * Composition, never competition. The registry owns the CRITERION; the named
 * module owns how that criterion is expressed to the provider.
 */
/**
 * THE PERSISTENCE VOCABULARY IS DERIVED FROM THESE ENTRIES, NOT DECLARED HERE.
 *
 * A registry entry is a Search criterion when its `criterionRole` is
 * `broker_input`. Its persistence key IS its `canonicalKey`. There is no separate `filterKeys`
 * field and no hand-written key list: both were redundant restatements of the
 * entry, and a restatement is something that can disagree.
 *
 * `filter-keys.generated.ts` is produced from these entries by
 * `scripts/search/generate-filter-keys.mjs` and verified in CI by regenerating
 * and comparing. The fix for a mismatch is to RUN THE GENERATOR — never to hand
 * edit the output.
 *
 * An earlier cut of this file kept a literal `CANONICAL_FILTER_KEYS` array here
 * with a test forcing it to agree with the entries. That is two declarations plus
 * a drift detector, which is the "update one table, forget the other" cycle this
 * workstream exists to remove.
 */

export type SearchMappingOwner =
  | 'geography'
  | 'status-token-contract'
  | 'checkbox-criteria'
  | 'property-type-universe'
  | 'property-subtype-contract'
  /**
   * Added 2026-08-30 (Section 5) when bathrooms gained a single execution owner.
   *
   * The union is deliberately CLOSED: an owner named here is a module that
   * renders its own clause from its own live evidence, so a typo or an invented
   * owner fails at compile time rather than producing a criterion whose "owner"
   * does not exist.
   */
  | 'bath-contract';

export interface FieldSpec {
  canonicalKey: string;
  uiLabel: string;
  category: FieldCategory;
  providerMappingStatus: ProviderMappingStatus;
  /** Cotality API field name if verified/known; null if none. */
  cotalityField: string | null;
  /**
   * The Cotality fields a COMPOSITE criterion is expressed over, enumerated.
   *
   * `cotalityField` is a single slot, so composites were being written into it
   * as prose — `'BathroomsFull/BathroomsHalf'`, `'SourceSystemName/...'` — which
   * reads like a field name and is not one. A criterion derived from several
   * provider fields must name them all, individually, or no consumer can act on
   * it. Mutually exclusive with `cotalityField`.
   */
  cotalityFields?: readonly string[];
  /** `listings` DB column if it exists; null otherwise. */
  dbColumn: string | null;
  /** `listing_search_projection` column if it exists; null otherwise. */
  projectionColumn: string | null;
  /**
   * HUMAN LABEL for how this criterion is requested. Prose, and only prose:
   * real values include `'minPrice/maxPrice'`, `'beds/maxBeds'` and
   * `'amenities:pet-friendly'`. Keep it for reading; never join on it.
   *
   * @deprecated for lookup — use `searchParams`. This column is why the
   * registry could not be authoritative even in principle: no consumer could
   * resolve `minPrice` through it, so every consumer kept its own table.
   */
  searchParam: string | null;
  /**
   * THE JOIN KEY. The exact request parameter names this criterion is asked by.
   *
   * One criterion may be asked by several params (a range is two), and a param
   * must resolve to exactly ONE criterion — two owners for one param is the bug,
   * not a feature. Pinned by
   * `lib/search/__tests__/one-search-mapping-authority.test.ts`, which also
   * forbids the executor to read a param no entry here claims.
   */
  searchParams?: readonly string[];
  /**
   * Which canonical module owns this criterion's provider mapping, when the
   * registry does not. Mutually exclusive with `cotalityField`: an entry that
   * delegates must not also restate the field it delegated.
   */
  mappingOwner?: SearchMappingOwner;
  /**
   * STRUCTURED live-Cotality evidence. Present ONLY when an authorized probe
   * actually ran and produced a dated record.
   *
   * This replaces detecting evidence by grepping `notes` for phrases like
   * "VERIFIED LIVE". That method was unsafe and demonstrably wrong: `year_built`
   * was reported as live-verified because its note contains the words "probe
   * record" — inside the sentence "this file has no probe record for" it. The
   * scan found the ABSENCE of evidence and counted it as evidence.
   *
   * A criterion without this field has NOT been proven against live Cotality,
   * whatever its prose says.
   */
  liveEvidence?: {
    /** ISO date the probe ran. */
    probedAt: string;
    /** Dated evidence document, or the canonical module carrying the record. */
    source: string;
  };
  /**
   * A KNOWN divergence between this criterion's declared capability and what the
   * active executor actually does. Present means: do not treat this criterion as
   * ready to execute, whatever `filterable` says.
   *
   * `bathrooms` is the case that forced this field into existence — see its entry.
   */
  mappingConflict?: string;
  /**
   * What a broker may TYPE INTO this criterion — deliberately independent of
   * `type`, which says what kind of FACT this is on a listing.
   *
   * These were briefly the same thing, with the shape derived from `type`. That
   * forced `type` to be rewritten to describe the Search control:
   * `listing_id_canonical` became `array` purely because the box accepts several
   * IDs at once. It is not an array. One listing has exactly ONE canonical
   * identifier — a scalar, dual-domain reference. A multi-select over a scalar
   * fact is completely ordinary, and collapsing the two made the registry lie
   * about the domain in order to describe a UI.
   *
   * Declared explicitly on every Search criterion. The generator reads it and
   * refuses to emit a criterion that lacks one, so a new entry cannot inherit a
   * silent default.
   */
  criterionRole?: CriterionRole;
  criterionValueShape?: CriterionValueShape;
  /**
   * The ONE canonical module that owns this criterion's closed vocabulary.
   *
   * `enum_set` means "membership is checked", which is only true if something
   * owns the list of members. Without a named owner, four workflow contracts
   * would each supply their own `allowed` array — four new translation tables,
   * which is the failure this registry exists to prevent. Workflow contracts
   * consume the owner; they never restate a vocabulary.
   */
  vocabularyOwner?: string;
  /**
   * WHICH Search workflows may offer this criterion.
   *
   * This lived as a hand-written column in `criterion-matrix.mjs`, which is a
   * measurement ledger and explicitly not an authority. Generating four workflow
   * contracts from a ledger column would take a product fact from something that
   * only measures — so it moved here, and the ledger now reads it back.
   *
   * Applicability is the ONLY question a workflow contract answers. It never
   * says what a criterion means, what values it accepts, how it maps to Cotality,
   * or whether it may execute — those belong to this entry, the value contract,
   * the named mapping owner and `executionReadiness()` respectively.
   */
  workflows?: readonly SearchWorkflow[];
  /**
   * HOW this criterion would be executed. A Cotality `$filter` clause is ONE
   * strategy, not the definition of executable.
   *
   * Mallan's chain is COTALITY RAW -> VERIFIED MAPPING -> MALLAN STORAGE ->
   * MALLAN BUSINESS RULE -> CONSUMER. Some legitimate criteria cannot be
   * provider-filtered at all: `max_financing_percent` lives inside an
   * Edm.String that `$filter` cannot reach, yet its raw fact is retrievable,
   * verified, and derivable onto the projection. Modelling readiness purely on
   * "is there a provider clause" would make such a criterion permanently
   * unexecutable even after Mallan implements it correctly.
   *
   * A Mallan-side strategy carries an obligation Section 6 must prove: the
   * filter has to operate on the COMPLETE result universe before count and
   * pagination, never on rows already sliced by the provider.
   */
  executionStrategy?: ExecutionStrategy;
  /**
   * For a COMPOSITE criterion, the closed set of bases its range may apply to.
   *
   * `activity_date` is the case: the same from/to pair means ListingContractDate
   * or ModificationTimestamp depending on the basis. The set lived as a literal
   * in the executor while this file described it in prose — two declarations of
   * one vocabulary. The executor now imports it, so adding a member here without
   * the clause that answers it fails loudly rather than silently defaulting.
   */
  valueBasis?: readonly string[];
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
   * media. Saying `list_price -> cotality` is simply false half the time.
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
   *   'attribution_required'    provider factual-source obligation (the Cotality
   *                             API licence, and the MLS display rules Mallan is bound by
   *                             as a REBNY member - two duties, one obligation token)
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
  f({ canonicalKey: 'listing_key', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Provider Listing Key', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingKey', dbColumn: null, projectionColumn: 'listing_key', searchParam: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'yes', notes: 'IDENTITY DOMAIN CORRECTED 2026-08-21. This previously claimed dbColumn `listing_id`, which is a DIFFERENT identifier: the schema comment on Listing.listing_id reads "Trestle ListingId OR internal SL-/RL- prefix" and ListingsArchive.listing_key reads "Trestle ListingKey" - both quoted verbatim, and both carry STALE provider-layer wording: the source is the COTALITY API, and those schema comments should be corrected in a schema-comment-only pass. Mapping ListingKey onto the ListingId column conflates two provider identifiers. VERIFIED STORAGE: ListingKey is NOT in any typed Listing column — it is carried in raw_data (and ListingsArchive.listing_key for terminal rows). NO SCHEMA CHANGE is proposed; the existing raw/provider structures already carry the fact. For an SL-/RL- listing with a suppressed Mallan-office Cotality representation, this provider key belongs to the REPRESENTATION as reconciliation evidence and never replaces the local canonical identity. Media joins must keep using the provider ListingKey domain — do NOT "fix" identity by repointing Media at the Mallan local id.' }),
  f({ canonicalKey: 'listing_id_canonical', criterionRole: 'broker_input', workflows: ['sale', 'rental'], criterionValueShape: 'text_set', executionStrategy: 'provider_filter', searchParams: ['listingId'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Listing ID', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingId', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'RESOLVED 2026-08-30 (Section 5). crm-idx-filter.ts sent EVERY value to Cotality as ListingId eq with no domain check, so searching a Mallan listing by its own SL-/RL- reference queried a provider that has never heard of it and returned an empty set indistinguishable from no-such-listing. A Mallan-domain identifier is now REFUSED BY NAME, and the domain test itself lives in mallan-source-identity.ts which owns what a Mallan identifier IS - the same check was already duplicated in the campaign gate and personal-participation, and a fourth copy here would be a fourth place to drift. Routing Mallan-domain ids to the local store is a real capability and a genuinely different execution path; until it exists an honest refusal beats a confident empty answer. AUTHORITY CORRECTED 2026-08-21: was declared fixed/cotality while this very note says the value is DUAL-DOMAIN. A Mallan-generated SL-/RL- identifier cannot be Cotality-authored, so the entry asserted something false on half its own domain. THREE IDENTITIES ARE NOW SEPARATED: listing_object_identity (Listing.id, the Mallan canonical OBJECT key), THIS entry (Listing.listing_id, the canonical REFERENCE), and provider_listing_id / listing_key (Cotality evidence). Listing.listing_id is DUAL-DOMAIN by schema definition: it holds either a Cotality API ListingId OR an internal SL-/RL- prefix. It is therefore the MALLAN CANONICAL listing identity, not purely a provider field, and it must never be overwritten by a provider identifier. Cotality ListingKey and ListingKeyNumeric are separate provider identifiers — see canonicalKey listing_key.' }),
  f({ canonicalKey: 'provider_lineage', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Provider Lineage', category: 'identity_source_attribution', type: 'object', providerMappingStatus: 'mapped', cotalityField: 'SourceSystemName/SourceSystemID/SourceSystemKey/OriginatingSystemName/OriginatingSystemID/OriginatingSystemKey', dbColumn: null, projectionColumn: null, visibility: V_AGENT, filterable: 'no', sortable: 'no', alertable: 'no', reportable: 'no', failureBehavior: 'na', notes: 'MODEL CORRECTED 2026-08-21 — this was `source` mapped to SourceSystemName and treated as canonical listing source. It is NOT. These fields describe how the record travelled upstream before the Cotality API delivered it, and answer nothing about whether a listing is Mallan-authored or third-party inventory. The values below are RAW OBSERVED COTALITY VALUES, quoted exactly and not promoted into any Mallan architecture term - there is deliberately no Mallan pipeline concept built from them. Live census of 35 Mallan-office rows: SourceSystemName 0/35; SourceSystemKey 0/35; observed SourceSystemID value = "TRESTLE" on 35/35; observed OriginatingSystemName value = "RLS" on 35/35; OriginatingSystemKey carries keys minted by that upstream system. Retained as RAW LINEAGE evidence only. CANONICAL LISTING AUTHORITY comes from the existing local-vs-provider identity contract (lib/listings/mallan-source-identity.ts) — never from this family, and no second classifier is introduced. Deliberately not filterable/sortable/reportable: lineage is evidence, not a Search axis.' }),
  f({ canonicalKey: 'list_agent_name', criterionRole: 'non_search_fact', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Listing Agent', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListAgentFullName', dbColumn: 'list_agent_full_name', visibility: V_CLIENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Agent PII masked from public per DTO tiers.' }),
  f({ canonicalKey: 'list_office_name', criterionRole: 'non_search_fact', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Listing Office', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListOfficeName', dbColumn: 'list_office_name', visibility: V_PUBLIC, reportable: 'yes', requiresAttribution: true, notes: 'Courtesy line source; NOT plumbed into alert emails today (analysis §3).' }),

  f({ canonicalKey: 'listing_object_identity', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Listing Record', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'id', projectionColumn: null, searchParam: null, visibility: V_AGENT, filterable: 'no', sortable: 'no', alertable: 'no', reportable: 'no', failureBehavior: 'fail_closed', notes: 'ADDED 2026-08-21. THE CANONICAL OBJECT IDENTITY. prisma/schema.prisma model Listing declares `id BigInt @id @default(autoincrement())` - Mallan-generated, with NO provider involvement of any kind on any listing, including third-party inventory. It is therefore the only identity that is unconditionally Mallan-authored, which is why it is `fixed`/`mallan_crm` while the REFERENCE (listing_id_canonical) is by_listing_authority. Distinct from Listing.listing_id, which is a UNIQUE dual-domain business reference, and from the Cotality provider identifiers. Never exposed as a broker-facing value and never a Search axis - it is the join key. A suppressed Mallan-office representation can never supply it. NOTE: a separate ListingIdentity relation with its own unique listing_id exists in the schema and is documented there as NOT WIRED to any reader (the B1b writer is not enabled) - it is not this fact and must not be conflated with it.' }),

  f({ canonicalKey: 'provider_listing_id', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Provider Listing ID', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'ListingId', dbColumn: null, projectionColumn: null, searchParam: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'yes', notes: 'ADDED 2026-08-21. The COTALITY ListingId as PROVIDER EVIDENCE, separated from the Mallan canonical reference it was previously fused with. Being fixed/cotality, a suppressed Mallan-office representation MAY supply it - that is precisely what provider evidence means, and it is how a suppressed row is reconciled to its local canonical twin. It must NEVER be written over Listing.listing_id on a Mallan-authored listing, and must never be presented as the Mallan canonical reference. Its VALUES carry a raw RLS-prefix; that is provider provenance preserved at the boundary, not a source claim. Distinct again from listing_key (Cotality ListingKey), which is the media relationship key.' }),

  // ── address / location / building ────────────────────────────────────────
  f({ canonicalKey: 'street_address', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'text', executionStrategy: 'provider_filter', searchParams: ['address'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Address', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityFields: ['StreetNumber', 'StreetDirPrefix', 'StreetName', 'BuildingName'], dbColumn: 'address', searchParam: 'q', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'MAPPING CORRECTED 2026-08-27. This said UnparsedAddress, a single field. The executor has always built a STRUCTURED predicate - startswith(StreetNumber), StreetDirPrefix eq, contains(StreetName), contains(BuildingName) - so the single-field claim described nothing that runs. Enumerated rather than collapsed, per the rule that a criterion over several provider fields must name them all. ORIGINAL NOTE: Address display gated by InternetAddressDisplayYN.' }),
  f({ canonicalKey: 'unit', criterionRole: 'broker_input', workflows: ['sale', 'rental'], criterionValueShape: 'text', executionStrategy: 'provider_filter', searchParams: ['unit'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Unit', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'UnitNumber', searchParam: 'unit', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes' }),
  f({ canonicalKey: 'neighborhood', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building', 'comparable'], criterionValueShape: 'text_set', executionStrategy: 'provider_filter', semanticEquivalenceProven: false, liveEvidence: { probedAt: '2026-08-26', source: 'lib/search/canonical/geography.ts' }, searchParams: ['neighborhood'], mappingOwner: 'geography', authorityResolution: 'unresolved', uiLabel: 'Neighborhood', category: 'address_location_building', type: 'string', providerMappingStatus: 'partial', dbColumn: 'neighborhood', searchParam: 'neighborhood', visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Resolves 3 ways today (ZIP expansion vs SubdivisionName vs name) — analysis B-4. PROVISIONAL 2026-08-21. Do NOT set neighborhood = SubdivisionName merely because the field exists. The live geography study must compare SubdivisionName, CityRegion, MLSAreaMajor, MLSAreaMinor and PostalCity by actual value and population before the canonical transformation and authority are decided.' }),
  f({ canonicalKey: 'borough', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building', 'comparable'], vocabularyOwner: 'geography', criterionValueShape: 'enum_set', executionStrategy: 'provider_filter', liveEvidence: { probedAt: '2026-08-26', source: 'lib/search/canonical/geography.ts' }, searchParams: ['borough'], mappingOwner: 'geography', authorityResolution: 'unresolved', uiLabel: 'Borough', category: 'address_location_building', type: 'string', providerMappingStatus: 'partial', dbColumn: 'borough', searchParam: 'borough', visibility: V_PUBLIC, filterable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'CountyOrParish vs CityRegion split (analysis B-3) — needs_probe on canonical field. PROVISIONAL 2026-08-21. CountyOrParish is a COUNTY (Kings/New York/Richmond/Queens), not a borough. Do not lock authority until the live NYC geography study compares CountyOrParish, CityRegion, SubdivisionName, MLSAreaMajor, MLSAreaMinor, PostalCity, PostalCode and structured address.' }),
  f({ canonicalKey: 'postal_code', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'text', executionStrategy: 'provider_filter', searchParams: ['zip'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'ZIP', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'PostalCode', dbColumn: 'postal_code', searchParam: 'zip', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes' }),
  f({ canonicalKey: 'building_name', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'text', executionStrategy: 'provider_filter', searchParams: ['buildingName'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Building Name', category: 'address_location_building', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'BuildingName', searchParam: 'buildingName', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'BuildingName is Edm.String(50), non-null on 3,903 of 8,056 Search-eligible listings (48%) — a NAME, not an identity, and absent on half the corpus. It cannot key Building Search. See building_identity.' }),

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
   * Cotality structured address -> canonical Mallan address -> canonical
   * building identity, grouping Property rows by canonical address WITHOUT the
   * unit. StreetNumber / StreetName / PostalCode are non-null on 8,056/8,056, so
   * the inputs exist even though the provider key does not.
   *
   * BUILDING IDENTITY DOES NOT DERIVE FROM A COORDINATE. An earlier version of
   * this block routed identity through a geocoding service, which was wrong
   * twice: it named a service this repo does not use, and a coordinate is the
   * WRONG KIND of input for an identity key - two addresses can share a point
   * and one address can resolve to several. Identity comes from the structured
   * address. NYC parcel facts (TaxBlock 8,014/8,032, TaxLot, TaxMapNumber,
   * ParcelNumber, and BuildingTaxLot at 100% inside CustomProperty.CustomFields)
   * are candidate identity INPUTS, contracted separately in the resource /
   * field-family coverage matrix.
   *
   * This is Mallan-owned enrichment and must never be attributed to Cotality.
   */
  f({ canonicalKey: 'building_identity', criterionRole: 'non_search_fact', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Building', category: 'address_location_building', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', failureBehavior: 'fail_closed', attributionObligations: ['mallan_derived_disclosure', 'provenance_disclosure'], semanticEquivalenceProven: false, notes: 'BuildingKey/BuildingKeyNumeric are populated 0/8,056, the live Building entity declares exactly ONE field, and GET /Building is 403 - $metadata over-declaring what the licence grants. Derive from the CANONICAL STRUCTURED ADDRESS, never from a coordinate: the previous note routed identity through a geocoding service, naming one this repo does not use and using the wrong kind of input for an identity key. NYC parcel facts (TaxBlock/TaxLot/TaxMapNumber/ParcelNumber/BuildingTaxLot) are candidate identity inputs, contracted separately in the resource/field-family coverage matrix. Never present as a provider fact.' }),

  // ── transaction (sale / rent) ────────────────────────────────────────────
  f({ canonicalKey: 'transaction_type', criterionRole: 'workflow_invariant', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Buy / Rent', category: 'transaction', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertyType', dbColumn: 'listing_type', searchParam: 'type', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'sale=Residential, rental=ResidentialLease (no space). Expressed 3 ways today (analysis §1.5).' }),
  f({ canonicalKey: 'commercial', criterionRole: 'boundary_refusal', searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Commercial', category: 'transaction', type: 'boolean', providerMappingStatus: 'partial', cotalityField: 'PropertyType', searchParam: 'commercial', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'RETIRED from residential criteria 2026-08-29 (Maya). Was broker_input on sale+rental. Sale and Rental are DEFINED residential universes — Residential and ResidentialLease — carried as workflow invariants, so a commercial:true boolean inside them would mutate the very universe the workflow fixes. It is kept as a boundary_refusal so a legacy commercial parameter is REFUSED by name rather than silently widening a residential search. Commercial Search, when built, is its own workflow with its own PropertyType universe as an invariant — never a flag inside a residential one. Commercial PropertyType members exist but are 0 live in this feed.' }),

  // ── lifecycle / status ───────────────────────────────────────────────────
  f({ canonicalKey: 'market_status', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'comparable'], vocabularyOwner: 'status-token-contract', criterionValueShape: 'enum_set', executionStrategy: 'provider_filter', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md' }, searchParams: ['status', 'statuses'], mappingOwner: 'status-token-contract', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', dbColumn: 'status', projectionColumn: 'mls_status', searchParam: 'statuses', visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'DUPLICATE ENTRY MERGED 2026-08-27. This key appeared TWICE and getField() returns the first match, so the live-verified entry below was unreachable and its sortable:yes never applied. Authority stays by_listing_authority: a Mallan-authored listing has its market status authored by Mallan, so the fixed/cotality claim on the merged entry was wrong on half its own domain. sortable adopted because the merged note records a DIRECT probe. LIVE-VERIFIED NOTE (verbatim, from the merged entry): Only filterable status field (11 members). Pending is the live in-contract status; AUC 0 live. VERIFIED LIVE 2026-08-22. Nullable enum, Edm.Int64, ELEVEN members: Active=0 ActiveUnderContract=1 Canceled=2 Closed=3 ComingSoon=4 Delete=5 Expired=6 Hold=7 Incomplete=8 Pending=9 Withdrawn=10. OPERATOR: eq and ne both behave correctly - ne \'Closed\' returns exactly Active + Pending, and this enum has no case-variant member pairs. STATED PER FIELD ON PURPOSE: the eq/ne asymmetry recorded on media_classification does NOT apply here, and neither field\'s operator behaviour may be inferred from the other. Compound conjunction with PropertyType is SUPPORTED. $orderby=StandardStatus PROBED DIRECTLY 2026-08-22, HTTP 200, which is what earns sortable yes here. DISTINCT FROM MlsStatus - see that entry. These are different vocabularies (11 members vs 25) and are not interchangeable. The exact CRM-token to member mapping lives in lib/search/canonical/status-token-contract.ts, the ONE authority for both directions: PENDING -> Pending and UNDER_CONTRACT -> ActiveUnderContract are DISTINCT and never collapse, and a token with no live member raises UnsupportedStatusCriterionError so the route returns a typed UNSUPPORTED_CRITERION 400 rather than dropping the criterion - dropping it would WIDEN the search instead of narrowing it. Evidence: docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md' }),
  f({ canonicalKey: 'mls_status', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md' }, authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'MLS Status', category: 'lifecycle_status', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MlsStatus', visibility: V_AGENT, filterable: 'unsupported', sortable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_loud', notes: 'DUPLICATE ENTRY MERGED 2026-08-27, same defect as standard_status. Visibility stays V_AGENT (raw provider evidence, not a client-facing fact) and sortable is recorded unsupported — PROVIDER_REJECTED, not a Mallan choice. LIVE-VERIFIED NOTE (verbatim, from the merged entry): Provider-suppressed: NOT $filter-able (HTTP 400). Readable, never a query axis - fails loud if used to filter. The canonical key mirrors the EXACT Cotality field name MlsStatus and is deliberately NOT renamed. NAMING DEFECT (D10), recorded not fixed: the projection COLUMN named mls_status carries StandardStatus, not MlsStatus - see standard_status.projectionColumn. Renaming that column is a schema migration and is HELD; until then the column name contradicts its contents. VERIFIED LIVE 2026-08-22. Nullable enum, Edm.Int64, TWENTY-FIVE members including Leased, AttorneyReview, Contingent, CompSold, PendingShortSale, OptionPeriod, PrepShow and PendingBackupsRequested - none of which exists in StandardStatus. FILTERING IS SUPPRESSED AT PROVIDER LEVEL. All 25 members and the null probe return HTTP 400: "Results from \'RLS\' has been suppressed (provider Level) as field MlsStatus cannot be used for filtering or ordering". $orderby=MlsStatus is likewise PROVIDER_REJECTED (HTTP 400), so sortable is unsupported - the provider cannot do it - rather than no, which would mean Mallan chose not to offer it. That is NOT zero rows and NOT an absent field - it is the provider declining to answer, so POPULATION IS UNVERIFIED. It IS $select-able and returned null on every sampled row; sampled, not proven universal, because the only instrument that could prove it is the suppressed filter. CORRECTED 2026-08-22: an earlier version of this note claimed NO MALLAN QUERY FILTERS ON IT, \'verified across lib/ and app/\'. That was FALSE. The sweep behind it matched only $filter/filterParts/buildFilter shapes and missed app/api/market/route.ts, which built the predicate inline and filtered on MlsStatus twice; replayed live in that route\'s exact shape both returned HTTP 400, so the fallback failed on every run. Corrected to StandardStatus. ALSO CORRECTED: crm-idx-mapper.ts no longer reads MlsStatus || StandardStatus. StandardStatus is the CANONICAL SEARCH STATUS INPUT and MlsStatus never overrides it. The raw provider value is preserved separately on the DTO as providerMlsStatus - verbatim, unmapped, never an input to a Mallan status decision. No meaning is invented for Leased, AttorneyReview, Contingent or any other member of that vocabulary; deciding those remains a product decision. NOTE the DTO field named mlsStatus deliberately carries StandardStatus, because a COMPLIANCE GATE (lib/compliance/idx-display-gate.ts:39) reads it as the effective status - narrowing it to the raw value would null it on this feed and let a Closed listing pass a display check it must fail. Evidence: docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md' }),

  // ── pricing ──────────────────────────────────────────────────────────────
  f({ canonicalKey: 'list_price', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'comparable'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', searchParams: ['minPrice', 'maxPrice'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ListPrice', dbColumn: 'list_price', projectionColumn: 'list_price', searchParam: 'minPrice/maxPrice', visibility: V_PUBLIC, filterable: 'needs_probe', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'original_list_price', criterionRole: 'non_search_fact', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Original Price', category: 'pricing', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'OriginalListPrice', visibility: V_AGENT, reportable: 'yes', notes: 'Feeds price-cut intelligence (needs temporal history — reserved).' }),
  f({ canonicalKey: 'price_per_sqft', criterionRole: 'broker_input', criterionValueShape: 'range_number', workflows: ['sale', 'comparable'], searchParams: [],  authorityResolution: 'unresolved', uiLabel: '$/Sqft', category: 'pricing', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'BLOCKED 2026-08-29 (Maya). A real Sale/Comparable criterion and a CMA metric. Cotality metadata confirms CustomProperty.PricePerArea exists, but its UNITS, population and semantics are unproven and its authority is unresolved. Either prove those live, or establish a correct Mallan derived strategy that computes it over the COMPLETE universe before count and pagination. PRODUCT GAP (analysis B-15): not computed/stored anywhere. Requires reliable LivingArea. AUTHORITY UNRESOLVED 2026-08-21 — was prematurely called Cotality-authored arithmetic. Live CustomProperty declares PricePerArea Decimal(14,2) AND a PricePerAreaUnit enum. Establish whether Cotality already carries a usable price-per-area fact, in which units, populated for NYC residential, and whether it means what Mallan needs. Local derivation is a conclusion AFTER that probe, not before it.' }),

  // ── close / rental history ───────────────────────────────────────────────
  f({ canonicalKey: 'close_price', criterionRole: 'non_search_fact', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Sold Price', category: 'close_rental_history', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'ClosePrice', dbColumn: 'close_price', visibility: V_AGENT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Public closed sale = ACRIS only. CMA never selects this today (CMA close-price P0 — separate PR).' }),
  f({ canonicalKey: 'close_date', criterionRole: 'broker_input', workflows: ['sale', 'comparable'], criterionValueShape: 'range_date', executionStrategy: 'provider_filter', filterable: 'needs_probe', searchParams: ['closeDateFrom', 'closeDateTo'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Sold Date', category: 'close_rental_history', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'CloseDate', dbColumn: 'contract_closed', visibility: V_AGENT, reportable: 'yes', notes: 'Comp windowing uses CloseDate (comp-eligibility.ts), never ModificationTimestamp.' }),
  f({ canonicalKey: 'achieved_rent', criterionRole: 'non_search_fact', authorityResolution: 'unresolved', uiLabel: 'Achieved Rent', category: 'close_rental_history', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'No public rental sold record; rental comps need list_rent + optional achieved_rent (analysis §8). AUTHORITY UNRESOLVED 2026-08-21 — was prematurely called mallan_derived. Live Property metadata DOES declare LeaseAmount Decimal(14,2) and TotalActualRent Decimal(14,2). Neither is proven to mean achieved residential rent; population and semantics must be probed on ResidentialLease records first. Never derive an achieved rent merely because the concept is wanted.' }),
  f({ canonicalKey: 'acris_sale_history', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'acris', uiLabel: 'Public Sale History', category: 'close_rental_history', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_PUBLIC, reportable: 'yes', notes: 'ACRIS public-record only; co-op deed logic partially breaks (needs_probe).' }),

  // ── DOM / date fields ────────────────────────────────────────────────────
  f({ canonicalKey: 'days_on_market', criterionRole: 'broker_input', failureBehavior: 'fail_loud', criterionValueShape: 'range_number', workflows: ['sale', 'rental', 'comparable'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Days on Market', category: 'dom_dates', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'DaysOnMarket', dbColumn: 'days_on_market', visibility: V_CLIENT, filterable: 'needs_probe', sortable: 'needs_probe', reportable: 'yes', notes: 'BLOCKED 2026-08-29 (Maya). A real Sale/Rental/Comparable criterion. Cotality metadata declares DaysOnMarket as a nullable Int32, but $metadata OVER-DECLARES what the licence grants (CLAUDE.md A.0), so exact filter and sort behaviour must be probed on the endpoint, and UCBA handling of the value confirmed, before it executes. Column+DTO exist but never rendered/filtered/sorted (analysis B-10). UCBA DOM-display rules apply.' }),
  f({ canonicalKey: 'listing_contract_date', criterionRole: 'broker_input', workflows: ['sale'], criterionValueShape: 'range_date', executionStrategy: 'provider_filter', filterable: 'needs_probe', searchParams: ['contractDateFrom', 'contractDateTo'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Listed Date', category: 'dom_dates', type: 'date', providerMappingStatus: 'mapped', cotalityField: 'ListingContractDate', dbColumn: 'listing_contract_date', visibility: V_PUBLIC, sortable: 'yes', reportable: 'yes', notes: 'Canonical "newest" sort key (NOT ModificationTimestamp).' }),
  f({ canonicalKey: 'first_seen_at', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'First Seen', category: 'dom_dates', type: 'date', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'first_active_date', visibility: V_AGENT, reportable: 'needs_probe', notes: 'Our ingest time ≠ MLS list date. first_active_date exists but unwired (analysis §strategic gap 2 / reserved temporal).' }),

  // ── beds / baths / rooms / square feet ───────────────────────────────────
  f({ canonicalKey: 'bedrooms', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'comparable'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', searchParams: ['minBeds', 'maxBeds', 'beds'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Beds', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'BedroomsTotal', dbColumn: 'bedrooms_total', projectionColumn: 'bedrooms_total', searchParam: 'beds/maxBeds', visibility: V_PUBLIC, filterable: 'needs_probe', sortable: 'yes', alertable: 'yes', reportable: 'yes' }),
  f({ canonicalKey: 'bathrooms', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'comparable'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', searchParams: ['minBaths', 'maxBaths'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Baths', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', mappingOwner: 'bath-contract', dbColumn: 'bathrooms_full', searchParam: 'minBaths/maxBaths', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'yes', reportable: 'yes', semanticEquivalenceProven: false, notes: 'RESOLVED 2026-08-30 (Section 5). crm-idx-filter.ts emitted BathroomsTotalInteger ge/le from its generic numeric table while bath-contract.ts rejected that field on an exhaustive 8,103-row live read - an Edm.Int32 that cannot carry 1.5, disagreeing with its own components on ~1% of rows (RLS20105072: full=2, half=1, TotalInteger=0). Two engines answered the same bath question differently. The provider path now routes through minBathsOData/maxBathsOData, so bath-contract.ts is the ONE execution owner on both engines and half-baths are expressible - BathroomsHalf is non-zero on 2,023 Active rows, every one of which a 1.5-bath search used to lose. MAPPING CORRECTED 2026-08-27 to the field Mallan ACTUALLY asks for. This said BathroomsFull/BathroomsHalf - a prose composite, not a filter mapping - while lib/search/crm-idx-filter.ts has always emitted BathroomsTotalInteger ge/le. Recording what executes is a fact about Mallan code, NOT a live provider verification: whether BathroomsTotalInteger is the right fact for a baths range, versus full+half, is UNPROVEN against live Cotality and is why semanticEquivalenceProven is false. ORIGINAL NOTE: Diverges by engine: BathroomsFull vs BathroomsTotalInteger (analysis B-2) — canonicalize.' }),
  f({ canonicalKey: 'rooms_total', criterionRole: 'broker_input', workflows: ['sale', 'rental'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', searchParams: ['minRooms', 'maxRooms'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Rooms', category: 'rooms_size', type: 'number', providerMappingStatus: 'partial', cotalityField: 'RoomsTotal', visibility: V_CLIENT, filterable: 'needs_probe', reportable: 'yes', notes: 'DTO reads features.Rooms but mapper stores RoomsTotal → always undefined today (analysis B-1).' }),
  f({ canonicalKey: 'living_area', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'comparable'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', searchParams: ['minSqft', 'maxSqft'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Square Feet', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'LivingArea', dbColumn: 'living_area', projectionColumn: 'living_area', searchParam: 'minSqft/maxSqft', visibility: V_PUBLIC, filterable: 'needs_probe', sortable: 'yes', alertable: 'yes', reportable: 'yes', notes: 'Reliability drives $/sqft (needs_probe on completeness).' }),

  // ── monthly carrying costs ───────────────────────────────────────────────
  f({ canonicalKey: 'maintenance_common_charge', criterionRole: 'broker_input', criterionValueShape: 'range_number', workflows: ['sale'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Maintenance / CC', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'AssociationFee', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'BLOCKED 2026-08-29 (Maya). Essential NYC Sale Search criterion and it stays offered. AssociationFee ALONE is not canonical monthly Maintenance/CC: the fee frequency, the Fee2/Fee3 components and the CommonInterest semantics that decide which of them apply must be reconciled into ONE verified monthly figure first. Filtering on a raw AssociationFee would compare co-op maintenance against condo common charges as though they were the same fact. PRODUCT GAP (analysis B-15): not filterable/sortable anywhere today. FIELD FAMILY, not one field. AssociationFee alone is NOT a monthly maintenance number: live AssociationFeeFrequency includes Monthly/Quarterly/Annually/SemiMonthly/Weekly, and AssociationFee2 / AssociationFee3 families also exist. For NYC the business meaning also depends on CommonInterest — co-op MAINTENANCE and condo COMMON CHARGES are different facts, not two labels. Never normalise money without its units/frequency.' }),
  f({ canonicalKey: 'taxes', criterionRole: 'non_search_fact', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Taxes', category: 'carrying_costs', type: 'money', providerMappingStatus: 'mapped', cotalityField: 'TaxAnnualAmount', visibility: V_PUBLIC, reportable: 'needs_probe', notes: 'Input to total carrying cost.' }),
  f({ canonicalKey: 'assessment', criterionRole: 'non_search_fact', authorityResolution: 'unresolved', uiLabel: 'Assessment', category: 'carrying_costs', type: 'money', providerMappingStatus: 'none', cotalityField: null, visibility: V_AGENT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'PRODUCT GAP: no assessment field modeled. AUTHORITY UNRESOLVED 2026-08-21 — was prematurely called mallan_derived with "no provider field". Live Property metadata DOES declare TaxOtherAnnualAssessmentAmount Decimal(14,2). It may or may not correspond to the NYC assessment concept; probe population and semantics before deciding.' }),
  f({ canonicalKey: 'total_monthly_cost', criterionRole: 'non_search_fact', searchParams: [],  authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Total Monthly', category: 'carrying_costs', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', notes: 'RECLASSIFIED to non_search_fact 2026-08-29 (Maya): a report/calculator OUTPUT, not a Search input. There is no computed fact and no established formula for what "total monthly" includes — maintenance, taxes, assessment, and which of them apply depends on CommonInterest. Offering a filter over an undefined sum would let a broker narrow on a number Mallan cannot define. It may become a criterion once ONE canonical business rule exists. PRODUCT GAP: maintenance+CC+taxes+assessment → total monthly is computed nowhere (reserved economics).' }),

  // ── ownership / common interest ──────────────────────────────────────────
  f({ canonicalKey: 'ownership', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], vocabularyOwner: 'ownership', criterionValueShape: 'enum_set', liveEvidence: { probedAt: '2026-08-21', source: 'docs/idx/cotality-classification-four-surface-census-2026-08-21.md' }, executionStrategy: 'provider_filter', searchParams: ['ownership'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Ownership', category: 'ownership_common_interest', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'CommonInterest', searchParam: 'ownershipTypes', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', dbColumn: 'common_interest', notes: 'CORRECTED 2026-08-21 from LIVE Cotality. CommonInterest is THE ONE canonical condo/co-op/condop criterion. Exhaustive Active census: Condominium 3,722 / StockCooperative 2,509 / None 998 / RentalBuilding 639 / Condop 147 = 8,015 = `ne null` exactly; the other 8 declared members are ZERO. The competing PropertySubType members Condominium and StockCooperative are populated ZERO at EVERY status, so the CRM commercial section pointing at PropertySubType matches nothing and must be re-pointed HERE. Do NOT maintain separate residential and commercial ownership field truths - the provider contract does not require one. Co-op=StockCooperative (no Cooperative member). Unmapped in CRM today (B-11).' }),

  // ── property type / sub-type ─────────────────────────────────────────────
  f({ canonicalKey: 'property_sub_type', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'comparable'], vocabularyOwner: 'property-subtype-contract', criterionValueShape: 'enum_set', executionStrategy: 'provider_filter', liveEvidence: { probedAt: '2026-08-21', source: 'docs/idx/cotality-property-subtype-live-contract-2026-08-21.md' }, searchParams: ['propertySubType'], mappingOwner: 'property-subtype-contract', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Property Type', category: 'property_type', type: 'enum', providerMappingStatus: 'mapped', dbColumn: 'property_sub_type', projectionColumn: 'property_sub_type', searchParam: 'propertySubType', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'CORRECTED 2026-08-21 against LIVE Cotality. Was declared multi_enum/partial/needs_probe with a note that sub-types "cannot be pushed to $filter (502)". Every part of that was wrong. PropertySubType is a SCALAR nullable Enum (75 members) — the MULTI field is the SEPARATE PropertySubTypeAdditional, deliberately NOT folded in. `eq` and `in` are SUPPORTED; `contains()` is HTTP 400 because contains takes strings and this is an enum — the 502 was Mallan\'s own /api/idx/search converting that 400. Live census on Active is COMPLETE (75/75 probed, 0 UNVERIFIED): Apartment 6,625 / MultiFamily 425 / SingleFamilyResidence 402 / Duplex 354 / Loft 79 / MixedUse 72 / Triplex 63 / Office 1, summing to 8,021 = PropertySubType ne null exactly. The other 67 members are zero, and Townhouse / Condominium / StockCooperative / UnimprovedLand are zero at EVERY status — valid literals this feed has never carried, which is a product problem, not a mapping one. A MIS-CASED literal is NOT rejected: it returns 200 with zero rows, so validation is case-exact and Mallan-side. Vocabulary and both renderers live in the subordinate property-subtype-contract.ts. MIS-MAPPING RESOLVED 2026-08-21: the four zero-population UI controls were pointed at the wrong provider fact, which is NOT the same as the capability being unavailable. Townhouse and Multi-Family are carried by StructureType (see structure_type; Townhouse 612 Active there vs 0 here). Condo and Co-op are OWNERSHIP facts carried by CommonInterest (3,722 and 2,509 Active vs 0 here). Land is VERIFIED_ZERO_POPULATION_CURRENT_FEED, NOT unsupported: eleven probes across PropertyType Land, PropertySubType Land/UnimprovedLand/ImprovedLand and PropertySubTypeAdditional Land/UnimprovedLand/ImprovedLand, at Active AND all statuses, every one SUPPORTED (HTTP 200, complete) and every one ZERO. The provider SUPPORTS the criterion; the current inventory has no matches. Those are different facts and must not collapse - the broker capability is retained. PropertyType Land and PropertySubType UnimprovedLand also remain different facts, so a general Land control must never silently mean UnimprovedLand. No control is removed on the strength of one unpopulated candidate field. CommonInterest stays a separate ownership fact.' }),

  f({ canonicalKey: 'structure_type', criterionRole: 'broker_input', executionStrategy: 'provider_filter', criterionValueShape: 'enum_set', vocabularyOwner: 'checkbox-criteria', workflows: ['sale', 'rental', 'building'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Structure Type', category: 'property_type', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'StructureType', searchParam: null, visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', notes: 'ADDED 2026-08-21 from LIVE Cotality. MULTI-enum (Enums.Multi.StructureType, 23 members) so it is queried with the `has NAMESPACE"Member"` form, never `eq`. PROVEN EXCLUSIVE CARRIER OF NYC TOWNHOUSE (four-surface ID-level census 2026-08-21): StructureType has Townhouse = 610 Active, PropertySubType = 0, PropertySubTypeAdditional = 0, and PropertyType REJECTS the literal with HTTP 400 (Townhouse is not a PropertyType member). Pairwise overlap zero everywhere; union 610 = exclusive 610. Those townhouses carry PropertySubType MultiFamily 298 / SingleFamilyResidence 274, which is why PropertySubType cannot express the concept - the same value carries townhouses and non-townhouses. Context: PropertyType Residential 565 / ResidentialLease 45; CommonInterest None 584; PropertyAttachedYN is NULL on all 610 so it cannot distinguish attached from detached; NumberOfUnitsTotal carries a -1 SENTINEL on 64 rows. MULTI-FAMILY spans FOUR surfaces: PropertyType 0, PropertySubType 424 (253 exclusive), PropertySubTypeAdditional 75 (1 exclusive), StructureType 714 (556 exclusive); union 981 and NO listing appears on all four. The current UI reads PropertySubType alone = 424/981 = 43%. The union is NOT automatically the criterion - the four dimensions mean different things (inventory class / primary subtype / additional subtype / structural form) and 69 rows are MultiFamily,Townhouse, so whether a 2-unit townhouse is brokerage Multi-Family is a BUSINESS decision. Recommended pending Maya: PropertySubType OR StructureType = 979/981. Business semantics NEEDS_PROBE; the measurement is complete. StructureType ne null = 7,152 / 8,032 Active. PropertyType MultiFamily is declared but ZERO and contributes nothing.' }),


  // ── open house ───────────────────────────────────────────────────────────
  f({ canonicalKey: 'open_house', criterionRole: 'broker_input', criterionValueShape: 'boolean', workflows: ['sale', 'rental'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Open House', category: 'open_house', type: 'object', providerMappingStatus: 'mapped', cotalityField: 'OpenHouse (resource)', searchParam: 'openHouse/openHouseDate', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_loud', notes: 'BLOCKED 2026-08-29 (Maya). Agents absolutely search by open house, so it stays a Sale/Rental broker_input. It may not execute yet because the current implementation applies it AFTER pagination: the provider slices the population first and the open-house test runs over the rows already returned, so the answer is drawn from an arbitrary page rather than the complete universe. That is a wrong answer, not a missing one. IS read via /odata/OpenHouse but applied post-pagination (analysis §4 D1); not alert-capable.' }),

  // ── media ────────────────────────────────────────────────────────────────
  //

  // ── sale / rental universe and status ────────────────────────────────────
  //
  // PROMOTED 2026-08-22 from the live Cotality Property census. STRUCTURE and
  // DECIDED SEMANTICS only — no population count is promoted here. Counts,
  // rejected probes and current-feed characteristics stay in the dated evidence:
  //
  //   docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md
  //
  // Evidence, not authority. Where it and the live API differ, the API wins.

  f({ canonicalKey: 'listing_universe', criterionRole: 'workflow_invariant', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md' }, authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Sale / Rental Universe', category: 'property_type', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'PropertyType', visibility: V_PUBLIC, filterable: 'yes', sortable: 'yes', alertable: 'needs_probe', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'VERIFIED LIVE 2026-08-22. Nullable enum, Edm.Int64, THIRTEEN members: BusinessOpportunity=0 CommercialLease=1 CommercialSale=2 DisasterReliefRental=3 Farm=4 HighRise=5 Land=6 ManufacturedInPark=7 MultiFamily=8 Residential=9 ResidentialIncome=10 ResidentialLease=11 Specialty=12. \'Commercial\' is NOT a member - HTTP 400, not a valid enumeration type constant (note lib/compliance/reso-mapper.ts:17 types it as one). AUTHORITY CORRECTED 2026-08-22: this was declared fixed/cotality, which asserts the PROVIDER authored the classification. It does not. Cotality authors the raw PropertyType value; the statement that Residential MEANS Sale and ResidentialLease MEANS Rental is a MALLAN business classification, and this repo reserves mallan_derived for exactly that. Chain: Cotality PropertyType (raw provider fact) -> verified mapping -> Mallan Sale/Rental universe. The provider INPUT remains cotalityField PropertyType. MALLAN SEMANTICS, DECIDED NOT INFERRED: SALE = {Residential}. RENTAL = {ResidentialLease}. Every other member is UNKNOWN and belongs to NEITHER universe. MultiFamily, ResidentialIncome and Land are plausibly sales in ordinary speech and are deliberately EXCLUDED - a member existing in the vocabulary is not a decision that it belongs in a residential sale search. Widening either set is a product decision for Maya. $orderby=PropertyType PROBED DIRECTLY 2026-08-22, HTTP 200, which is what earns sortable yes here - it was asserted before it was measured and has since been probed. SALE MUST NEVER BE DEFINED AS THE COMPLEMENT OF RENTAL. Measured live: PropertyType ne \'ResidentialLease\' returns exactly the same rows as eq \'Residential\', so the negation is INDISTINGUISHABLE FROM CORRECT by observation - it agrees only because the other eleven members are unpopulated, and it silently absorbs each of them into residential sale inventory the moment one is populated. Render filters as positive eq predicates joined by or. The canonical implementation is lib/search/canonical/property-type-universe.ts; do not re-derive this split anywhere else. Evidence: docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md' }),



  //
  // PROMOTED 2026-08-22 from the live Cotality Media census. Everything below is
  // STRUCTURE — field existence, declared type, enum vocabulary, operator
  // restriction, proven mapping. NO POPULATION COUNT IS PROMOTED HERE. Counts,
  // samples, rejected probes and current-feed characteristics stay in the dated
  // evidence document, because a count is an observation with a date on it and
  // not a contract:
  //
  //   docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md
  //
  // That document is EVIDENCE, not authority. Where it and the live API differ,
  // the live API wins and the document is stale.

  f({ canonicalKey: 'media', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }, authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Photos / Tour', category: 'media', type: 'array', providerMappingStatus: 'partial', cotalityField: 'Media (ResourceRecordKey)', visibility: V_PUBLIC, alertable: 'unsupported', reportable: 'yes', notes: 'Media relates to a listing by ResourceRecordKey / ResourceRecordID qualified by ResourceName. VERIFIED LIVE 2026-08-22: the Media resource declares NO ListingKey and NO ListingId. Linkage is carried by ResourceRecordKey, ResourceRecordKeyNumeric and ResourceRecordID, qualified by ResourceName. CORRECTED 2026-08-22: this note previously called ResourceRecordKey the ONLY listing linkage, which contradicted the same sentence and was wrong. ResourceRecordKey is the STRONGER IDENTITY DOMAIN and is what Mallan reconciles canonical media through; ResourceRecordID is a present, usable provider linkage and evidence field, not an absent one. Media joins stay in the provider key domain either way - do NOT repoint them at a Mallan local id. Read from the FULL 1,946,777-byte $metadata — a truncated read reports the Media enums as absent, which is a tool artefact and not a provider fact. Photo count / hero / floorplan / tour → media-intelligence (reserved). Evidence: docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }),

  f({ canonicalKey: 'media_category', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }, authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Media Category', category: 'media', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MediaCategory', visibility: V_AGENT, filterable: 'yes', sortable: 'unsupported', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'VERIFIED LIVE 2026-08-22. Nullable enum, Edm.Int64, EIGHTEEN members: Addendum=0 AerialView=1 AgentPhoto=2 BrandedVirtualTour=3 Disclosure=4 Document=5 FloorPlan=6 Map=7 OfficeLogo=8 OfficePhoto=9 Other=10 Photo=11 RentalDocuments=12 Restriction=13 Survey=14 Topography=15 UnbrandedVirtualTour=16 Video=17. VirtualTour is NOT a member — a filter on it returns HTTP 400 \'not a valid enumeration type constant\'; the two tour members are Branded and Unbranded, so any mapping producing a canonical VirtualTour from this field maps from a value the vocabulary does not contain. CAPABILITY: $filter eq SUPPORTED; $orderby PROVIDER_REJECTED (400); $apply/groupby PROVIDER_REJECTED (400). CORRECTED 2026-08-22: this note previously said the eq/ne restriction recorded on media_classification applied here too. IT DOES NOT, and was never probed to. The trap requires a pair of members differing only in case, and these eighteen contain no such pair; the live census itself used MediaCategory ne \'FloorPlan\' and ne \'Photo\' successfully to establish set relationships. Only what was proven for THIS field is recorded here. GENERAL RULE: an operator behaviour verified on one Cotality enum may not be carried to another merely because both are enums - probe the exact field/operator pair first. RAW VALUE MUST BE PRESERVED — it is the provider fact and is stored verbatim in listing_media.media_category. IT IS NOT media_type: media_type is the MALLAN canonical GROUP, and RAW COTALITY FACT != MALLAN MEDIA GROUP. Mallan grouping PROVEN: Photo->Photo, FloorPlan->FloorPlan, Video->Video. Every other member stays UNGROUPED (Unclassified) pending semantic proof — including Other, which is a REAL member left ungrouped rather than a rejected value. A NULL category must NOT be registry-mapped to Photo; classify from surviving provider evidence instead (MediaClassification, the PHOTO-/DOCUMENT- URL segment, MediaType). Evidence: docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }),

  f({ canonicalKey: 'media_classification', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }, authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Media Classification', category: 'media', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MediaClassification', visibility: V_AGENT, filterable: 'yes', sortable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'VERIFIED LIVE 2026-08-22. Nullable enum, Edm.Int64, SIX members with SIX DISTINCT VALUES: Document=0 Photo=1 Video=2 PHOTO=3 DOCUMENT=4 VIDEO=5. The upper-case trio are SEPARATE MEMBERS, not casing aliases — do not normalise them away. OPERATOR RESTRICTION, LOAD-BEARING FOR ANY EXECUTABLE QUERY: eq resolves the member NAME case-insensitively and matches across a pair, but ne compares MEMBER-EXACTLY. A filter of the form ne \'Document\' therefore excludes NOTHING and silently returns every row — it does not error, it returns a plausible wrong set. Any exclusion must enumerate both casings or be rewritten as a positive eq predicate. SCOPE: this is proven for MediaClassification and is NOT transferable - media_category and media_status contain no case-variant member pairs and ne behaves normally on them. SEMANTIC WARNING: Document must NOT be assumed equivalent to FloorPlan. It is set-equivalent on the current feed ONLY because the whole document family (Document, Disclosure, Addendum, Survey, Restriction, RentalDocuments) is unpopulated; a DOCUMENT classification legitimately spans all of them. The reader heuristic in lib/media/listing-media-resolver.ts is correct today and unsafe as a permanent rule — it is pinned by test rather than trusted. Evidence: docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }),

  f({ canonicalKey: 'media_display_permission', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }, authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Media Internet Display', category: 'media', type: 'boolean', providerMappingStatus: 'mapped', cotalityField: 'Media.InternetEntireListingDisplayYN', visibility: V_AGENT, filterable: 'yes', sortable: 'unsupported', alertable: 'unsupported', reportable: 'no', failureBehavior: 'fail_closed', notes: 'VERIFIED LIVE 2026-08-22. Nullable Edm.Boolean carried PER MEDIA ROW, distinct from the Property-level field of the same name. Mallan ENFORCES it in every media path (lib/idx/fetch.ts:143 server-side and :689 per-row; app/api/idx/search/route.ts:394; app/api/media/batch/route.ts:129 and :213) and $selects it so the check has data — there is no gap. OPERATOR SEMANTICS: \'ne false\' ALSO excludes NULL rows (SQL three-valued logic — NULL <> FALSE is UNKNOWN), so the server-side filter is strictly narrower than the per-row \'!== false\' check, which keeps nulls. The two paths therefore disagree about the null-flag rows; both fail toward hiding rather than exposing. UNRESOLVED: Mallan treats a null as DISPLAYABLE on Property (the REBNY pre-filter convention, memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md) and as NON-DISPLAYABLE on Media server-side — same field name, two resources, opposite null treatment. Evidence: docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }),

  f({ canonicalKey: 'media_status', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }, authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Media Status', category: 'media', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'MediaStatus', visibility: V_AGENT, filterable: 'yes', sortable: 'needs_probe', alertable: 'unsupported', reportable: 'no', failureBehavior: 'fail_closed', notes: 'VERIFIED LIVE 2026-08-22. Nullable enum, Edm.Int64, THREE members: Active=0 Deleted=1 Other=2. No case-variant members, so the eq/ne trap recorded on media_classification does not apply. CAPABILITY LIMIT: there is no queryable deletion signal on this resource. The existing MediaStatus ne \'Deleted\' filter is retained as defensive, but it cannot currently be PROVEN to work because the population it would exclude is empty — that is UNVERIFIED, not proven-correct. Deletion is detected by disappearance from a complete set, not by this value; lib/idx/fetch.ts:139 already documents the same conclusion from an earlier session. Evidence: docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }),

  f({ canonicalKey: 'media_url', criterionRole: 'non_search_fact', liveEvidence: { probedAt: '2026-08-22', source: 'docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }, authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Media URL', category: 'media', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'MediaURL', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'VERIFIED LIVE 2026-08-22. Nullable Edm.String, reliably PROJECTED. filterable is marked unsupported DELIBERATELY, and not because the provider rejects it: a null-predicate on MediaURL RETURNS HTTP 200 AND LIES. The filter engine reports the large majority of rows as having a null MediaURL while the projection returns a live signed URL for those same rows, verified at single-row granularity. A sync using $filter=MediaURL ne null to find media with images would silently discard most of the feed. DO NOT ADD SUCH A FILTER — read the value from the projection. URL SHAPE IS LOAD-BEARING: the path segment discriminates content (PHOTO-* for photographs, DOCUMENT-* for floor plans) and a floor plan is NOT necessarily a PDF — a substantial minority are JPEGs served under a DOCUMENT- path, so a .pdf extension test alone misclassifies them as photographs. This is live vindication of TRESTLE_DOCUMENT_URL_PATTERN in lib/media/listing-media-resolver.ts. Evidence: docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md' }),

  // ── amenities ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'feature_criteria', criterionRole: 'broker_input', workflows: ['sale', 'rental'], vocabularyOwner: 'checkbox-criteria', criterionValueShape: 'feature_map', executionStrategy: 'provider_filter', searchParams: ['checkboxFilters'], mappingOwner: 'checkbox-criteria', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Amenities', category: 'amenities', type: 'multi_enum', providerMappingStatus: 'partial', searchParam: 'amenities', visibility: V_PUBLIC, filterable: 'needs_probe', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_closed', amenityKey: '(per-amenity; see AMENITY_TOKENS)', notes: 'CORRECTED 2026-08-20. Exact-TOKEN matching, never substring — a substring test on PetsAllowed "Yes" also matches "BuildingYes", i.e. the building permits pets while the UNIT does not. Some amenities ARE provider booleans (GarageYN 2,630 / FireplaceYN 861 / NewConstructionYN 951); ElevatorYN and DoormanYN remain absent. Collection fields reject /any() lambda filters (HTTP 400) so they are matched Mallan-side, but they DO $select. Tokens live in the subordinate AMENITY_TOKENS vocabulary; capability is decided here.' }),

  // ── parking / garage ─────────────────────────────────────────────────────
  f({ canonicalKey: 'parking', criterionRole: 'broker_input', failureBehavior: 'fail_loud', criterionValueShape: 'enum_set', vocabularyOwner: 'checkbox-criteria', workflows: ['sale', 'rental', 'building'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Parking / Garage', category: 'parking_garage', type: 'multi_enum', providerMappingStatus: 'partial', cotalityField: 'ParkingFeatures', searchParam: 'amenities:garage', visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', amenityKey: 'garage', semanticEquivalenceProven: false, notes: 'BLOCKED 2026-08-29 (Maya). A real brokerage criterion, kept as broker_input. Parking/Garage equivalence is NOT proven — this entry already records semanticEquivalenceProven: false — so it must not execute until the mapping is established. CORRECTED 2026-08-20: the claim "GarageYN boolean does not exist" was FALSE — GarageYN is a live filterable Boolean, true on 2,630 Active, vs a Garage token on only 591 ParkingFeatures rows. Still needs_probe for a SEMANTIC reason, not a field one: GarageYN proves a garage, while the UI label also promises generic parking (valet/assigned/on-street/deeded are separate tokens).' }),

  // ── pets ─────────────────────────────────────────────────────────────────
  f({ canonicalKey: 'pets', criterionRole: 'broker_input', executionStrategy: 'provider_filter', criterionValueShape: 'enum_set', vocabularyOwner: 'checkbox-criteria', workflows: ['sale', 'rental'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Pets', category: 'pets', type: 'multi_enum', providerMappingStatus: 'mapped', cotalityField: 'PetsAllowed', searchParam: 'amenities:pet-friendly', visibility: V_PUBLIC, filterable: 'yes', reportable: 'yes', amenityKey: 'pet-friendly', semanticEquivalenceProven: true, notes: 'PetsAllowed is a MULTI-enum mixing building- and unit-level tokens: "BuildingYes,No" means the building permits pets and THE UNIT DOES NOT. Exact-token match on unit-level Yes/CatsOk/DogsOk gives 4,304 live; substring gives 6,861, i.e. 2,557 listings a renter with a dog cannot rent. `PetsAllowedYN` exists and is filterable but is populated ZERO, so the multi-value parse must stay.' }),

  // ── furnished ────────────────────────────────────────────────────────────
  f({ canonicalKey: 'furnished', criterionRole: 'broker_input', executionStrategy: 'provider_filter', criterionValueShape: 'enum_set', vocabularyOwner: 'checkbox-criteria', workflows: ['rental'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Furnished', category: 'furnished', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Furnished', searchParam: 'furnished', visibility: V_PUBLIC, reportable: 'yes', filterable: 'yes', notes: 'FIVE live members — Furnished 106 / Unfurnished 2,876 / Negotiable 12 / Partially 4 / FurnishedOrUnfurnished 0. Not a boolean. furnished=true means STRICTLY Furnished; widening to Partially/Negotiable is a product decision, not a mapping one.' }),

  // ── new development / new construction ───────────────────────────────────
  f({ canonicalKey: 'new_development', criterionRole: 'broker_input', executionStrategy: 'provider_filter', criterionValueShape: 'boolean', workflows: ['sale', 'rental'], searchParams: [],  authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'New Development', category: 'new_development', type: 'boolean', providerMappingStatus: 'mapped', visibility: V_PUBLIC, reportable: 'yes', failureBehavior: 'fail_closed', cotalityField: 'NewConstructionYN', filterable: 'yes', notes: 'CORRECTED 2026-08-20: NewConstructionYN IS a live filterable Boolean, true on 951 Active. NewDevelopmentYN genuinely IS rejected (HTTP 400) and `NewConstruction` is not a PropertySubType member — that half was right. Detection via PublicRemarks prose is REMOVED: it is answerable by no provider field, and a listing whose remarks say "brand new" is not new construction.' }),

  // ── Mallan exclusive / internal ──────────────────────────────────────────
  f({ canonicalKey: 'mallan_exclusive', criterionRole: 'broker_input', executionStrategy: 'mallan_derived_filter', criterionValueShape: 'boolean', workflows: ['sale', 'rental'], searchParams: [],  authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Mallan Exclusive', category: 'mallan_exclusive_internal', type: 'boolean', providerMappingStatus: 'partial', cotalityField: null, searchParam: 'exclusive', visibility: V_PUBLIC, filterable: 'yes', sortable: 'needs_probe', reportable: 'yes', notes: 'Company data. Expressed ≥3 ways today (analysis §1.6); sort=exclusives uses the weak agent_id!=null signal.' }),

  // ── agent-only / private / restricted ────────────────────────────────────
  f({ canonicalKey: 'permission', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Permission', category: 'agent_private_restricted', type: 'enum', providerMappingStatus: 'mapped', cotalityField: 'Permission/ListingPermission', visibility: V_AGENT, filterable: 'no', reportable: 'yes', failureBehavior: 'fail_closed', notes: 'Private = participant-only. NO OwnerOptOut member in either enum — owner-opt-out must fail closed until a live field/value is confirmed.' }),
  f({ canonicalKey: 'owner_opt_out', criterionRole: 'non_search_fact', authorityResolution: 'unresolved', uiLabel: 'Owner Opt-Out', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'none', cotalityField: null, dbColumn: 'owner_opt_out', projectionColumn: null, visibility: V_AGENT, filterable: 'needs_probe', reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 1 compliance. No live provider value; enforced via DB column. Not mirrored on projection (B-13 fail-open risk). Fail closed. INTERNALLY CONTRADICTORY, now marked unresolved: it claimed cotality authority while cotalityField is null and enforcement runs through a local DB column with no verified provider value. `OwnerOptOut` is NOT among the 20 live Permission members. Trace the writer and the exact RLS/Cotality permission/display fields that might inform it. Until proven, do not describe the resulting local state as a Cotality-authored fact. The fail-closed Gate 1 sentinel stays regardless.' }),
  f({ canonicalKey: 'participant_only', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Participant Only', category: 'agent_private_restricted', type: 'boolean', providerMappingStatus: 'mapped', cotalityField: 'Permission=Private', dbColumn: 'participant_only', projectionColumn: 'participant_only_yn', visibility: V_AGENT, reportable: 'no', failureBehavior: 'fail_closed', notes: 'Gate 2. Column name divergence participant_only vs participant_only_yn (B-13).' }),

  // ── report / CMA / investor fields ───────────────────────────────────────
  f({ canonicalKey: 'comp_set', criterionRole: 'non_search_fact', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Comparables', category: 'report_cma_investor', type: 'array', providerMappingStatus: 'partial', cotalityField: null, visibility: V_REPORT, reportable: 'yes', requiresAttribution: true, failureBehavior: 'fail_closed', notes: 'Two shapes: sale (close_price) vs rental (list_rent/achieved_rent). CMA close-price fix is a separate PR.' }),
  f({ canonicalKey: 'confidence_score', criterionRole: 'non_search_fact', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Confidence', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'needs_probe', failureBehavior: 'fail_closed', notes: 'Reserved data_quality dimension; not computed. Broker opinion, NOT an appraisal (§J boundary).' }),
  f({ canonicalKey: 'investor_yield', criterionRole: 'non_search_fact', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Cap Rate / Yield', category: 'report_cma_investor', type: 'computed', providerMappingStatus: 'none', cotalityField: null, visibility: V_REPORT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'Blocked on carrying-cost + rental-economics (reserved). Labeled estimate, not advice.' }),

  // ── engagement / marketing (reserved placeholders) ───────────────────────
  f({ canonicalKey: 'engagement_event', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Engagement', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: view/favorite/dwell/share stream (analysis §strategic gap 8). Not wired, no schema.' }),
  f({ canonicalKey: 'campaign_segment', criterionRole: 'non_search_fact', authorityResolution: 'fixed', sourceAuthority: 'mallan_crm', uiLabel: 'Campaign Segment', category: 'engagement_marketing', type: 'object', providerMappingStatus: 'reserved', cotalityField: null, visibility: V_AGENT, reportable: 'unsupported', failureBehavior: 'fail_loud', notes: 'RESERVED: saved-search + audience + suppression (analysis §15.C). Not wired, no schema.' }),

  // ── criteria the executor could already ask about, now inside the authority ─
  f({ canonicalKey: 'year_built', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Year Built', category: 'address_location_building', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'YearBuilt', dbColumn: 'year_built', searchParam: 'minYear/maxYear', searchParams: ['minYear', 'maxYear'], visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'ADDED 2026-08-27. The executor has emitted YearBuilt ge/le since before this registry existed, and no entry claimed it — one of sixteen criteria that were executable while the declared mapping authority had never heard of them. filterable is needs_probe, not yes: Mallan asks the question, and whether the provider answers it is a separate live fact this file has no probe record for.' }),
  f({ canonicalKey: 'stories_total', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Floors', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'StoriesTotal', searchParam: 'minFloors/maxFloors', searchParams: ['minFloors', 'maxFloors'], visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'yes', notes: 'ADDED 2026-08-27 — see year_built. Executable with no registry entry until now.' }),
  f({ canonicalKey: 'units_total', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'range_number', executionStrategy: 'provider_filter', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Units in Building', category: 'rooms_size', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'NumberOfUnitsTotal', searchParam: 'minUnits/maxUnits', searchParams: ['minUnits', 'maxUnits'], visibility: V_AGENT, filterable: 'needs_probe', reportable: 'yes', notes: 'ADDED 2026-08-27 — see year_built. Executable with no registry entry until now.' }),
  f({ canonicalKey: 'activity_date', criterionRole: 'broker_input', workflows: ['sale', 'rental'], criterionValueShape: 'basis_range_date', valueBasis: ['Listed', 'Updated'], executionStrategy: 'provider_filter', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Listing Activity Date', category: 'dom_dates', type: 'date', providerMappingStatus: 'mapped', cotalityFields: ['ListingContractDate', 'ModificationTimestamp'], searchParam: 'dateFrom/dateTo/dateType', searchParams: ['dateFrom', 'dateTo', 'dateType'], visibility: V_AGENT, filterable: 'needs_probe', reportable: 'yes', notes: 'ADDED 2026-08-27. A COMPOSITE criterion: dateType selects WHICH provider date the range applies to — Listed -> ListingContractDate ge/le, Updated -> ModificationTimestamp gt/le — so it is enumerated rather than collapsed into one field name. The closed set is `valueBasis` on THIS entry (moved here 2026-08-28); EXECUTABLE_DATE_TYPES in lib/search/crm-idx-filter.ts now imports it rather than restating it. an unrecognised dateType with a range present raises UnsupportedSearchCriterionError rather than silently defaulting to Listed, which is the collapse that set exists to prevent.' }),
  f({ canonicalKey: 'public_remarks_keyword', criterionRole: 'broker_input', workflows: ['sale', 'rental'], criterionValueShape: 'text', executionStrategy: 'provider_filter', authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Keyword', category: 'identity_source_attribution', type: 'string', providerMappingStatus: 'mapped', cotalityField: 'PublicRemarks', dbColumn: null, searchParam: 'keyword', searchParams: ['keyword'], visibility: V_PUBLIC, filterable: 'needs_probe', reportable: 'no', notes: 'ADDED 2026-08-27. Executes as contains(PublicRemarks, ...). A substring match over free text is NOT a structured criterion: it cannot express negation, it matches inside words, and its recall depends entirely on how a listing was written. needs_probe covers whether the provider supports contains() on this field at all; the SEMANTIC question — whether a keyword hit means what a broker thinks it means — is not a probe question and is recorded here rather than assumed.' }),
  f({ canonicalKey: 'management_company', criterionRole: 'broker_input', workflows: ['sale', 'rental', 'building'], criterionValueShape: 'text', authorityResolution: 'unresolved', uiLabel: 'Management Company', category: 'ownership_common_interest', type: 'string', providerMappingStatus: 'none', cotalityField: null, searchParam: 'managementCompany', searchParams: ['managementCompany'], visibility: V_AGENT, filterable: 'unsupported', sortable: 'unsupported', alertable: 'unsupported', reportable: 'no', failureBehavior: 'fail_loud', notes: 'ADDED 2026-08-27 as an EXPLICIT REFUSAL. The UI can send it; Cotality declares no ManagementCompany Property field, and lib/search/crm-idx-filter.ts throws UnsupportedSearchCriterionError rather than substituting one. Listing office is a DIFFERENT fact and must never stand in for it. Recorded here because a refusal is part of the contract — omitting it would make the authority look as though it had never heard of a criterion the product offers.' }),
  f({ canonicalKey: 'map_grid_filter', criterionRole: 'boundary_refusal', workflows: ['sale', 'rental'], criterionValueShape: 'geo', authorityResolution: 'mallan_derived', sourceAuthority: 'mallan_derived', uiLabel: 'Map Grid', category: 'address_location_building', type: 'geo', providerMappingStatus: 'none', cotalityField: null, searchParam: 'gridFilter', searchParams: ['gridFilter'], visibility: V_AGENT, filterable: 'unsupported', sortable: 'no', alertable: 'no', reportable: 'no', failureBehavior: 'fail_loud', notes: 'ADDED 2026-08-27 as an EXPLICIT REFUSAL. Coordinates are map support, not a canonical Search axis, and the executor refuses a caller-supplied coordinate predicate rather than passing it to the provider. B5 requires the map to express canonical GEOGRAPHIC criteria that the authoritative server search executes — not a raw viewport predicate — so this stays unsupported until that path exists.' }),
  f({ canonicalKey: 'sponsor_unit', criterionRole: 'broker_input', workflows: ['sale'], criterionValueShape: 'boolean', authorityResolution: 'fixed', sourceAuthority: 'cotality', uiLabel: 'Sponsor Unit', category: 'ownership_common_interest', type: 'boolean', providerMappingStatus: 'partial', cotalityField: 'CustomProperty.CustomFields', executionStrategy: 'mallan_projection_filter', searchParam: 'sponsorUnit', searchParams: ['sponsorUnit'], visibility: V_AGENT, filterable: 'unsupported', sortable: 'unsupported', alertable: 'unsupported', reportable: 'needs_probe', failureBehavior: 'fail_loud', semanticEquivalenceProven: false, notes: 'ADDED 2026-08-28 as an EXPLICIT REFUSAL, and it was the only executable-path criterion with NO registry owner at all. SponsorUnit lives inside CustomProperty.CustomFields — a REBNY-specific JSON-string field — not as a top-level OData property, so the generic checkbox path would silently drop it. The serializer pulls it out of feature_criteria into its own sponsorUnit param and app/api/idx/search/route.ts throws UnsupportedSearchCriterionError for it. NOTE THE REFUSAL LIVES IN THE ROUTE, NOT IN crm-idx-filter.ts: a refusal audit that scans only the filter builder reports this criterion unverified, which is the same one-file blind spot that let the missing params.status assignment survive a test written to prevent it. EXECUTION OWNERSHIP ESTABLISHED 2026-08-30 (Section 5.D). This was the ONLY criterion whose readiness said `unsupported` — the verdict reserved for a permanent refusal like management_company, which Cotality has no field for and never will. Sponsor Unit is not that. It is the SAME case as max_financing_percent: a real, decodable fact inside CustomProperty.CustomFields, an Edm.String $filter cannot reach into, and therefore legitimately executable Mallan-side over the complete universe. The two were classified differently only because financing declared a strategy and this did not, and `executionReadiness()` returns `unsupported` for `filterable:unsupported` with no strategy. Recording the strategy moves it to not_yet_wired — repairable, and something Section 6 has a reason to come back to. The refusal itself is UNCHANGED and still lives in the route. cotalityField now names the declared CONTAINER, matching max_financing_percent; the earlier `null` was justified by "the exact extraction contract is unproven", which Section 4.B closed when the "1"/"0" encodings were proven to decode through the canonical CustomFields parser. The inner key is still NOT recorded as a provider field name — that part of the original reasoning stands.' }),
  f({ canonicalKey: 'max_financing_percent', criterionRole: 'broker_input', workflows: ['sale', 'building'], criterionValueShape: 'range_number', searchParam: 'financingMin', searchParams: ['financingMin', 'financingMax'], authorityResolution: 'by_listing_authority', authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }, uiLabel: 'Max Financing Allowed %', category: 'ownership_common_interest', type: 'number', providerMappingStatus: 'mapped', cotalityField: 'CustomProperty.CustomFields', liveEvidence: { probedAt: '2026-08-21', source: 'docs/idx/cotality-classification-four-surface-census-2026-08-21.md' }, executionStrategy: 'mallan_projection_filter', visibility: V_PUBLIC, filterable: 'unsupported', sortable: 'unsupported', alertable: 'unsupported', reportable: 'yes', failureBehavior: 'fail_loud', semanticEquivalenceProven: false, notes: 'DUPLICATE IDENTITY MERGED 2026-08-28. TWO entries described this one fact: an older max_financing carrying the 2026-08-21 live census, and a max_financing_percent I added on 2026-08-28 claiming authorityResolution unresolved, providerMappingStatus needs_probe and cotalityField null - flatly contradicting evidence already in this file. I created the exact duplicate-authority defect this workstream removes, and the duplicate-key guard missed it because the two canonicalKey STRINGS differ. A same-concept guard now exists. The precise identity survives; all evidence and the corrected authorship come from the older entry. cotalityField is the DECLARED provider field CustomProperty.CustomFields (an Edm.String); the observed key inside it is recorded in the model below and is NOT a provider field name. SEARCH DISPOSITION: the control is live and enabled on three ids, the collector writes criteria.financingMin, and NOTHING reads it - so a broker types a narrowing value, gets HTTP 200 and a WIDER result set. filterable stays unsupported because a PROVIDER FILTER is impossible here, but executionStrategy records that a Mallan-side path is legitimate and specified: derive onto the projection at build time like amenity_keys. That is why this criterion is not_yet_wired rather than permanently unsupported. ORIGINAL 2026-08-21 EVIDENCE: ADDED 2026-08-21 from LIVE Cotality. THE BUILDING FINANCING LIMIT EXISTS AND IS HEAVILY POPULATED, but it is INVISIBLE to $metadata: it lives inside CustomProperty.CustomFields, an UNDECLARED JSON object carried in a single declared Edm.String. Exhaustive Active census via $expand=CustomProperty read 8,010/8,010 rows, 0 null blobs, 0 unparsable: MaximumFinancingPercent on 6,803 rows (84.9%, values 50.00-90.00), MaximumFinancingRemarks 82.6%, MaximumFinancingAmount 9.5%. Meanwhile the DECLARED financing fields CurrentFinancing, BuyerFinancing and ListingTerms are populated ZERO on Active. CAPABILITY CONSTRAINT: $filter cannot reach inside an Edm.String, so this is NOT provider-filterable - it must be read via $expand and matched Mallan-side, or derived onto the projection at build time like amenity_keys. AUTHORITY CORRECTED 2026-08-21: was declared fixed/cotality, which asserts the PROVIDER authored this on every listing. False on every Mallan-authored one - a listing has exactly TWO origins, and a Mallan agent enters this on Mallan local input. Same category error the header documents for list_price. MODEL: this is an OBSERVED EXTENSION KEY inside a declared Edm.String, NOT a $metadata-declared property. resource=CustomProperty, declared field=CustomFields, declared type=Edm.String, observed encoding=JSON object, observed key=MaximumFinancingPercent. SEMANTICS MEASURED 2026-08-21 (8,010/8,010 Active): StockCooperative 2,497/2,507 with values 80 (1,192) / 75 (483) / 50 (194) / 90 (156) / 70 (82) / 65 (50) - the shape of real board rules; Condominium 3,615/3,720 clustering at 90 (2,313); Condop 139/147; RentalBuilding only 242/640 and 93% of those are 0.00. 0.00 IS A NOT-SPECIFIED SENTINEL, not a 0% limit - treating it as a real value would exclude listings that simply did not state one. IT IS A LISTING-LEVEL FACT, NOT A BUILDING FACT: 380 of 3,402 buildings carry disagreeing values. Outliers 1/10/20/25/33 need review before any range filter. STATE: NEEDS_PROBE on the provenance of the disagreements. The same blob carries 51 further observed keys, each needing its OWN semantic proof - notably AttendanceType (100%), whose 16-token 5-role vocabulary must NOT be collapsed to doorman (VideoDoormanYes is not a doorman). Evidence: docs/idx/cotality-classification-four-surface-census-2026-08-21.md.' }),
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
/**
 * WHY `filterable` IS NOT THE EXECUTION GATE.
 *
 * `filterable` answers a PROVIDER question: can this criterion be expressed as a
 * Cotality filter at all? Runtime readiness is a different question — may Mallan
 * execute it right now — and it depends on facts `filterable` does not carry:
 * whether the value actually reaches the server, whether the executor builds a
 * clause, whether that clause conflicts with a canonical contract, and whether
 * any live probe was ever run.
 *
 * Conflating them is how a registry becomes documentation instead of
 * enforcement. `bathrooms` proves it: `filterable: 'yes'` while the active
 * executor queries a field `bath-contract.ts` explicitly rejects.
 *
 * DERIVED from structured facts. Deliberately NOT a second hand-maintained
 * table — the transport half is supplied by the caller because it is a property
 * of the executor and the wire, which this file does not own.
 */
export type ExecutionStrategy =
  /** A Cotality `$filter` clause. */
  | 'provider_filter'
  /** Filtered against Mallan's stored projection. */
  | 'mallan_projection_filter'
  /** Computed by Mallan from verified inputs. */
  | 'mallan_derived_filter';

export type ExecutionReadiness =
  | 'verified_executable'
  | 'mapping_conflict'
  | 'unsupported'
  | 'needs_probe'
  | 'not_yet_wired'
  /** Nothing has decided HOW this criterion would execute. */
  | 'no_strategy';

export interface TransportFacts {
  /** Serialized, forwarded AND read by the server. */
  reachesServer: boolean;
  /**
   * The criterion's declared strategy is actually IMPLEMENTED — a provider
   * clause the executor demonstrably builds, or a Mallan-side filter that
   * genuinely runs over the complete universe.
   */
  strategyImplemented: boolean;
}

export function executionReadiness(
  field: FieldSpec,
  transport: TransportFacts,
): ExecutionReadiness {
  // A known divergence outranks every other signal: the criterion executes, and
  // executes WRONGLY, which is worse than not executing.
  if (field.mappingConflict) return 'mapping_conflict';
  // The provider cannot express it AND no Mallan-side path is specified. That
  // is a real permanent refusal — distinct from max_financing_percent, which is
  // also unfilterable by the provider but HAS a specified Mallan strategy and is
  // therefore merely not wired yet.
  if (field.filterable === 'unsupported' && !field.executionStrategy) return 'unsupported';
  // No strategy established at all — nothing has decided HOW this would run.
  if (!field.executionStrategy) return 'no_strategy';
  // The strategy exists but nothing implements it yet, or the value never
  // arrives. Both fail loud; they are different repairs.
  if (!transport.strategyImplemented || !transport.reachesServer) return 'not_yet_wired';
  // Capability is a PROVIDER claim and only governs the provider_filter path.
  if (field.executionStrategy === 'provider_filter' && field.filterable !== 'yes') {
    return 'needs_probe';
  }
  // No live probe, or a mapping whose EQUIVALENCES were never verified, is not
  // verified — field existence and equivalence correctness are different proofs.
  if (!field.liveEvidence) return 'needs_probe';
  if (field.semanticEquivalenceProven === false) return 'needs_probe';
  return 'verified_executable';
}

/**
 * PROVIDER CAPABILITY on one axis. NOT runtime readiness — use
 * `executionReadiness` for that. This answers only "does the registry claim the
 * provider supports this axis", which is necessary and far from sufficient.
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
 * The alert-capable canonical FILTER keys — the identities of alertable Search
 * `alertable === 'yes'`. This is the correct namespace for saved-search validation:
 * The note that used to sit here said this namespace was DISTINCT from the
 * registry field keys — "price_min, beds_min, statuses… NOT list_price,
 * bedrooms, standard_status". That distinction is exactly the split now removed:
 * the persistence key IS the business concept, so the two namespaces are one and
 * a range criterion carries its bounds in the VALUE rather than in two keys.
 */
export function alertableFilterKeys(): CanonicalFilterKeyName[] {
  const keys = new Set<CanonicalFilterKeyName>();
  for (const s of FIELD_REGISTRY) {
    // The persistence key IS the entry's own identity. There is no separate
    // filterKeys list to consult, so the two cannot disagree.
    if (s.alertable === 'yes' && s.searchParams !== undefined) {
      keys.add(s.canonicalKey as CanonicalFilterKeyName);
    }
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
