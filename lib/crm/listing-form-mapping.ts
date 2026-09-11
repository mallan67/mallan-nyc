/**
 * SERVER-OWNED conversion of Mallan listing-form state into the Cotality field vocabulary
 * Mallan stores (Packet 2 closure).
 *
 *   browser form state  →  Mallan form contract (saleStatus / salePropertyType / …)
 *                       →  THIS module (the one conversion)
 *                       →  Mallan storage + business / REBNY-UCBA compliance rules
 *
 * Authority:
 *   COTALITY LIVE CONTRACT (lib/cotality/live-contract.ts) → provider facts: which fields exist,
 *     which enum members exist. Every provider-vocabulary value this module writes, and every
 *     provider enum value a client supplies directly, is checked against it (the live-enum boundary).
 *   REBNY / UCBA (lib/compliance/rebny-ucba-rules.ts) → compliance and business rules, applied after.
 *   MALLAN (lib/listings/mallan-form-contract.ts, lib/listings/mallan-status.ts) → form, workflow, storage.
 *   RESO = vocabulary only.
 *
 * The browser never translates its own workflow status, property type, building type, amenities or
 * views into provider values. Mallan form facts that have no live counterpart ("Walk-Up" building
 * type, a "Park" view, a "Roof Deck" amenity label, a free-text fee list) stay under their Mallan
 * keys; the provider field receives only live members. Nothing is defaulted: an unknown form value
 * or a non-live provider value is an error.
 *
 * Status: workflow → Mallan business status is lib/crm/status-mapping.ts. The result is written under the
 * MALLAN keys `_mallanStatus` / `_crmWorkflowStatus` — NEVER under the provider's MlsStatus / StandardStatus
 * (those are Cotality fields whose values are exact live enum members; Mallan's Draft / Sold / Rented /
 * Cancelled are not). The permission decision travels under `_mallanPermission`. See
 * lib/listings/mallan-status.ts for the three status domains.
 */
import { liveEnumMembers, liveEnumViolations } from '@/lib/cotality/live-contract';
import { PROVIDER_DECISION_FIELDS } from '@/lib/listings/mallan-form-contract';
import { normalizePayload } from '@/lib/compliance/normalizer';
import { resolveCanonicalStatusForListing, type CanonicalStatus } from './status-mapping';

export { PROVIDER_DECISION_FIELDS };

export type ListingFormType = 'sale' | 'rent';

/** The three live Cotality classification fields Mallan stores for its own listings. */
export interface CotalityClassification {
  PropertyType: string;
  PropertySubType: string;
  CommonInterest: string;
}

/** Live PropertySubType members this module may write (subset of the 75-member live enum). */
const SUBTYPE = Object.freeze({
  Apartment: 'Apartment',
  Townhouse: 'Townhouse',
  SingleFamilyResidence: 'SingleFamilyResidence',
  MultiFamily: 'MultiFamily',
  MixedUse: 'MixedUse',
  Loft: 'Loft',
  Duplex: 'Duplex',
  Triplex: 'Triplex',
  Quadruplex: 'Quadruplex',
  Office: 'Office',
  Retail: 'Retail',
  UnimprovedLand: 'UnimprovedLand',
  DeededParking: 'DeededParking',
  Commercial: 'Commercial',
});

/** Office / Retail ownership sub-selector → live CommonInterest member. */
function ownershipCommonInterest(officeRetailOwnership: string | null | undefined): string {
  switch (officeRetailOwnership) {
    case 'Condo': return 'Condominium';
    case 'Coop': return 'StockCooperative';
    case 'Condop': return 'Condop';
    default: return 'None';
  }
}

type Row = { PropertyType?: string; PropertySubType: string; CommonInterest: string | 'OWNERSHIP' };

/** Mallan form radio value → classification (PropertyType defaults to the form's residential kind). */
const FORM_PROPERTY_TYPES: Readonly<Record<string, Row>> = Object.freeze({
  Condo:                 { PropertySubType: SUBTYPE.Apartment, CommonInterest: 'Condominium' },
  Coop:                  { PropertySubType: SUBTYPE.Apartment, CommonInterest: 'StockCooperative' },
  Condop:                { PropertySubType: SUBTYPE.Apartment, CommonInterest: 'Condop' },
  RentalBuilding:        { PropertySubType: SUBTYPE.Apartment, CommonInterest: 'RentalBuilding' },
  // The single/multi townhouse distinction is a Mallan form fact (kept on raw_data as the form
  // value); the live PropertySubType enum carries one member, "Townhouse".
  SingleFamilyTownhouse: { PropertySubType: SUBTYPE.Townhouse, CommonInterest: 'None' },
  MultiFamilyTownhouse:  { PropertySubType: SUBTYPE.Townhouse, CommonInterest: 'None' },
  SingleFamily:          { PropertySubType: SUBTYPE.SingleFamilyResidence, CommonInterest: 'None' },
  MultiFamily:           { PropertySubType: SUBTYPE.MultiFamily, CommonInterest: 'None' },
  MixedUse:              { PropertySubType: SUBTYPE.MixedUse, CommonInterest: 'None' },
  Loft:                  { PropertySubType: SUBTYPE.Loft, CommonInterest: 'None' },
  Duplex:                { PropertySubType: SUBTYPE.Duplex, CommonInterest: 'None' },
  Triplex:               { PropertySubType: SUBTYPE.Triplex, CommonInterest: 'None' },
  Quadruplex:            { PropertySubType: SUBTYPE.Quadruplex, CommonInterest: 'None' },
  Office:                { PropertySubType: SUBTYPE.Office, CommonInterest: 'OWNERSHIP' },
  Retail:                { PropertySubType: SUBTYPE.Retail, CommonInterest: 'OWNERSHIP' },
  Land:                  { PropertyType: 'Land', PropertySubType: SUBTYPE.UnimprovedLand, CommonInterest: 'None' },
  DeededParking:         { PropertySubType: SUBTYPE.DeededParking, CommonInterest: 'None' },
  // Non-RLS commercial (website-only): the live members are CommercialSale / CommercialLease.
  Commercial:            { PropertyType: 'COMMERCIAL', PropertySubType: SUBTYPE.Commercial, CommonInterest: 'None' },
});

/**
 * Mallan form property type → the three live Cotality classification fields.
 * Returns null for an unknown form value (the caller refuses the write — nothing is defaulted).
 */
export function classifyMallanPropertyType(
  formType: ListingFormType,
  crmValue: string | null | undefined,
  officeRetailOwnership?: string | null,
): CotalityClassification | null {
  const key = (crmValue ?? '').trim();
  const row = FORM_PROPERTY_TYPES[key];
  if (!row) return null;
  const residential = formType === 'rent' ? 'ResidentialLease' : 'Residential';
  const propertyType =
    row.PropertyType === 'COMMERCIAL' ? (formType === 'rent' ? 'CommercialLease' : 'CommercialSale')
    : row.PropertyType ?? residential;
  const commonInterest = row.CommonInterest === 'OWNERSHIP' ? ownershipCommonInterest(officeRetailOwnership) : row.CommonInterest;
  return { PropertyType: propertyType, PropertySubType: row.PropertySubType, CommonInterest: commonInterest };
}

/** Every value this module can write is a live enum member (guarded by tests against the dated pull). */
export const WRITABLE_PROPERTY_TYPES: readonly string[] = Object.freeze(['Residential', 'ResidentialLease', 'CommercialSale', 'CommercialLease', 'Land']);
export const WRITABLE_PROPERTY_SUB_TYPES: readonly string[] = Object.freeze(Object.values(SUBTYPE));
export const WRITABLE_COMMON_INTERESTS: readonly string[] = Object.freeze(['Condominium', 'StockCooperative', 'Condop', 'RentalBuilding', 'None']);
export const MALLAN_FORM_PROPERTY_TYPE_VALUES: readonly string[] = Object.freeze(Object.keys(FORM_PROPERTY_TYPES));

/**
 * Mallan status input of ONE form (a workflow value such as "OfferOut" on the sale form or "AppOut" on the
 * rental form, an already-canonical value such as "ActiveUnderContract", the form's hidden saved-state
 * "Closed" / "Canceled", or the legacy draft marker "Incomplete") → canonical Mallan status, resolved through
 * that form's transaction mapping only (lib/crm/status-mapping.ts). Null when unrecognized for that
 * transaction (refuse; never default): a rental word on the sale form is not a sale status.
 */
export function canonicalStatusFromForm(input: unknown, formType: ListingFormType | 'rental'): CanonicalStatus | null {
  return resolveCanonicalStatusForListing(input, formType);
}

/** Mallan permission decisions (UCBA owner opt-out = signed Exhibit B; participant-only). Stored under `_mallanPermission`. */
export const MALLAN_PERMISSION_VALUES: readonly string[] = Object.freeze(['OwnerOptOut', 'Private']);
const PERMISSION_INPUT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  OwnerOptOut: 'OwnerOptOut', 'RLS-Owner-OptOut': 'OwnerOptOut', 'Owner Opt-Out': 'OwnerOptOut', 'Owner Opt Out': 'OwnerOptOut', OWNER_OPT_OUT: 'OwnerOptOut',
  Private: 'Private', 'RLS-Participant': 'Private', 'Participant Only': 'Private', 'Participant Only Network': 'Private', ParticipantOnly: 'Private', PARTICIPANT_ONLY: 'Private',
});
export function mallanPermissionFromForm(input: unknown): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null || input === '' || input === 'Public') return null;
  if (typeof input !== 'string') return undefined;
  return PERMISSION_INPUT_ALIASES[input.trim()] ?? undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mallan form facts → the live members among them (server-derived provider fields)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Building-amenity LABELS on Mallan's building profile → live BuildingFeatures members. Only exact
 * correspondences (every target is guarded live by test). Labels without a live counterpart
 * ("Roof Deck", "Live-In Super", "Pool", …) stay Mallan facts under the *BuildingFeaturesInternal key.
 */
export const BUILDING_FEATURE_LABEL_TO_LIVE: Readonly<Record<string, string>> = Object.freeze({
  'Elevator': 'Elevators',
  'Gym/Fitness Center': 'FitnessCenter',
  "Children's Playroom": 'CommonPlayroom',
  'Resident Lounge': 'CommonLounge',
  'Bike Room': 'BikeStorage',
  'Storage Available': 'Storage',
  'Package Room': 'PackageRoom',
  'Cold Storage': 'ColdStorage',
  'Conference Room': 'ConferenceRoom',
});

export interface MallanFactDerivation {
  /** The Mallan key that carries the agent's selection (form key or declared Mallan-internal key). */
  form: string;
  /** The live Cotality enum field the live members are written to. */
  field: string;
  /** list: array / comma list of members · single: one member (first live one wins) · text: free text, comma-split. */
  kind: 'list' | 'single' | 'text';
  /** Optional Mallan label → live member table applied before the live check. */
  labels?: Readonly<Record<string, string>>;
}

/**
 * Where a Mallan form fact feeds a provider enum field. When one of these Mallan keys is present the
 * provider field is DERIVED (a client-supplied provider value is not consulted). The Mallan key keeps
 * the full selection; the provider field receives only live members.
 */
export const MALLAN_FACT_DERIVATIONS: readonly MallanFactDerivation[] = Object.freeze([
  { form: 'saleViewList', field: 'View', kind: 'list' },
  { form: 'saleBuildingFeaturesInternal', field: 'BuildingFeatures', kind: 'list', labels: BUILDING_FEATURE_LABEL_TO_LIVE },
  { form: 'rentalBuildingFeaturesInternal', field: 'BuildingFeatures', kind: 'list', labels: BUILDING_FEATURE_LABEL_TO_LIVE },
  // building profile type first (the sale form's historical precedence), unit-level select second
  { form: 'saleBldgType', field: 'StructureType', kind: 'single' },
  { form: 'saleStructureType', field: 'StructureType', kind: 'single' },
  { form: 'bldgType', field: 'StructureType', kind: 'single' },
  { form: 'rentalStructureType', field: 'StructureType', kind: 'single' },
  // FARE Act fee lists: the agent's free text is a Mallan fact (displayed as typed); the provider
  // multi-select receives the live members it names, if any.
  //
  // BOTH the current Mallan key and the pre-rename provider-SHAPED name are accepted as sources. The
  // rental form now emits `_mallanMoveInCostsDescription` / `_mallanOngoingFeesDescription` /
  // `_mallanTenantPaysList` (RENTAL-FORM-REDESIGN.html), but `MoveInCostsDescription` /
  // `OngoingFeesDescription` / `TenantPaysList` are still declared Mallan-internal keys in the form
  // contract, still routed by its persistenceMap, and still read back by the public DTO — so a body
  // rebuilt from a stored row (a PATCH, a re-save of a listing created before the rename) still
  // carries them. Dropping the legacy source silently stopped deriving the live MoveInCosts /
  // OngoingFees / TenantPays members for those bodies, which is a FARE Act fee-disclosure gap, not a
  // cosmetic one. Both keys map to the same live multi-select; when both are present the live members
  // they name are unioned. No new vocabulary is introduced and nothing is defaulted.
  { form: '_mallanMoveInCostsDescription', field: 'MoveInCosts', kind: 'text' },
  { form: 'MoveInCostsDescription', field: 'MoveInCosts', kind: 'text' },
  { form: '_mallanOngoingFeesDescription', field: 'OngoingFees', kind: 'text' },
  { form: 'OngoingFeesDescription', field: 'OngoingFees', kind: 'text' },
  { form: '_mallanTenantPaysList', field: 'TenantPays', kind: 'text' },
  { form: 'TenantPaysList', field: 'TenantPays', kind: 'text' },
]);

function factValues(kind: MallanFactDerivation['kind'], src: unknown): string[] {
  if (Array.isArray(src)) return src.map((v) => String(v).trim()).filter(Boolean);
  const s = String(src).trim();
  if (!s) return [];
  return kind === 'single' ? [s] : s.split(',').map((t) => t.trim()).filter(Boolean);
}

export interface ServerFormMappingResult {
  /** The body with server-derived _mallanStatus / _crmWorkflowStatus / _mallanPermission / PropertyType / PropertySubType / CommonInterest / … */
  body: Record<string, unknown>;
  /** Which fields the server derived (from the Mallan form keys) — for audit / response detail. */
  derived: string[];
  /** Mallan facts kept only under their Mallan key because they have no live counterpart (not errors). */
  retained: string[];
  /** Refusals: an unknown Mallan form value or a client-supplied provider value that is not live. */
  errors: string[];
}

/**
 * Apply the server-owned conversion to an incoming CRM listing payload.
 *
 *  - When the Mallan form keys are present (saleStatus / rentalStatus, salePropertyType /
 *    rentalPropertyType, *OfficeRetailOwnership, saleViewList, *BuildingFeaturesInternal, building
 *    type, fee lists …), the server DERIVES the provider-vocabulary fields from them and any
 *    client-supplied value under those provider fields is ignored (the browser does not decide the
 *    provider representation).
 *  - EVERY provider enum field present on the payload (whatever its source) is then checked against
 *    the live Cotality contract — the live-enum boundary. A non-live value is an error. Mallan form
 *    value aliases (the form contract's valueAliases) are applied first, and the aliased value is
 *    written back so storage carries the live member.
 *  - Nothing is defaulted: an unknown form value is an error.
 */
export function applyServerFormMapping(
  input: Record<string, unknown>,
  formType: ListingFormType,
): ServerFormMappingResult {
  const body: Record<string, unknown> = { ...input };
  const derived: string[] = [];
  const retained: string[] = [];
  const errors: string[] = [];
  const prefix = formType === 'rent' ? 'rental' : 'sale';

  // ── status: CRM workflow → Mallan business status, under MALLAN keys only ──
  const workflowStatus = body[`${prefix}Status`] ?? body._crmWorkflowStatus;
  const legacyProviderNamed = body.MlsStatus ?? body.StandardStatus ?? body.status;
  if (typeof workflowStatus === 'string' && workflowStatus.trim() !== '') {
    const canonical = resolveCanonicalStatusForListing(workflowStatus, formType);
    if (!canonical) errors.push(`${prefix}Status "${workflowStatus}" is not a recognized Mallan workflow status`);
    else { body._mallanStatus = canonical; body._crmWorkflowStatus = workflowStatus.trim(); derived.push('_mallanStatus'); }
  } else if (legacyProviderNamed !== undefined && legacyProviderNamed !== null && legacyProviderNamed !== '') {
    // A legacy client sent the Mallan status under a provider field name: it is a Mallan status and is
    // stored under the Mallan key; the provider-named key is removed below.
    const canonical = resolveCanonicalStatusForListing(legacyProviderNamed, formType);
    if (!canonical) errors.push(`status "${String(legacyProviderNamed)}" is not a Mallan canonical status`);
    else { body._mallanStatus = canonical; derived.push('_mallanStatus'); }
  } else if (typeof body._mallanStatus === 'string' && body._mallanStatus !== '') {
    const canonical = resolveCanonicalStatusForListing(body._mallanStatus, formType);
    if (!canonical) errors.push(`_mallanStatus "${String(body._mallanStatus)}" is not a Mallan canonical status`);
    else body._mallanStatus = canonical;
  }

  // ── permission: a Mallan decision (UCBA), never the provider Permission enum ──
  const permissionInput = body._mallanPermission !== undefined ? body._mallanPermission : (body.Permission ?? body.Permissions);
  if (permissionInput !== undefined) {
    const perm = mallanPermissionFromForm(permissionInput);
    if (perm === undefined) errors.push(`permission "${String(permissionInput)}" is not a Mallan permission decision (OwnerOptOut | Private | none)`);
    else { body._mallanPermission = perm; derived.push('_mallanPermission'); }
  }
  for (const f of PROVIDER_DECISION_FIELDS) delete body[f];
  delete body.status;

  // ── property classification ──
  const formPropertyType = body[`${prefix}PropertyType`];
  if (typeof formPropertyType === 'string' && formPropertyType.trim() !== '') {
    const ownership = body[`${prefix}OfficeRetailOwnership`];
    const cls = classifyMallanPropertyType(formType, formPropertyType, typeof ownership === 'string' ? ownership : null);
    if (!cls) errors.push(`${prefix}PropertyType "${formPropertyType}" is not a recognized Mallan property type`);
    else {
      body.PropertyType = cls.PropertyType;
      body.PropertySubType = cls.PropertySubType;
      body.CommonInterest = cls.CommonInterest;
      derived.push('PropertyType', 'PropertySubType', 'CommonInterest');
    }
  }

  // ── Mallan form facts → live members under the provider field ──
  const factFields = new Map<string, string[] | null>(); // field → live members derived so far (null = single not yet resolved)
  for (const d of MALLAN_FACT_DERIVATIONS) {
    const src = body[d.form];
    if (src === undefined || src === null || src === '') continue;
    const members = liveEnumMembers(d.field);
    if (!members) continue; // guarded by test: every derivation targets a live enum field
    const values = factValues(d.kind, src);
    const live = values.map((v) => d.labels?.[v] ?? v).filter((v) => members.includes(v));
    const nonLive = values.filter((v) => !members.includes(d.labels?.[v] ?? v));
    if (nonLive.length) retained.push(`${d.form}: ${nonLive.map((v) => `"${v}"`).join(', ')} kept as Mallan fact (no live ${d.field} member)`);
    if (d.kind === 'single') {
      if (factFields.get(d.field)?.length) continue; // an earlier form key already resolved a live member
      factFields.set(d.field, live.length ? [live[0]] : []);
    } else {
      factFields.set(d.field, [...new Set([...(factFields.get(d.field) ?? []), ...live])]);
    }
  }
  for (const [field, live] of factFields) {
    const single = MALLAN_FACT_DERIVATIONS.find((d) => d.field === field)?.kind === 'single';
    // single with no live member: the provider field is cleared (never a stale or fake fact); lists carry the live subset
    body[field] = single ? (live && live.length ? live[0] : null) : (live ?? []);
    derived.push(field);
  }

  // ── the live-enum boundary: every provider enum value on the payload must be a live member ──
  // The Mallan form contract's key / value aliases are applied first (so "St" → "Street", the legacy
  // "UnitYes" → "Yes", "CoExclusive" → "CoExclusiveAgency" are accepted and stored as live members).
  const { normalized } = normalizePayload(body);
  for (const key of Object.keys(normalized)) {
    if (key in body && liveEnumMembers(key) && normalized[key] !== body[key]) body[key] = normalized[key];
  }
  for (const v of liveEnumViolations(normalized)) {
    errors.push(`${v.field} "${v.value}" is not a live Cotality ${v.field} member`);
  }

  return { body, derived, retained, errors };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SALE BUILDING-PROFILE TRANSLATION (Maya rulings, 2026-09-09)
//
// The Sale form was authored against the OLD pre-Cotality reference system, where building pets
// and building laundry were their OWN fields. On the live Cotality contract they are not: the
// building-level facts are ENUM MEMBERS of the same Property fields (`PetsAllowed`,
// `LaundryFeatures`), and two of the form's laundry values belong to a different field entirely
// (`BuildingFeatures`). The form's controls, sections and interactions are UNCHANGED — only this
// translation is. Tables are keyed by the form's CURRENT values so already-saved rows keep reading
// correctly and no data migration is required.
//
// Every destination below is verified against the live contract by
// tests/runtime/sale-form-cotality-field-attribution.test.ts. Nothing is defaulted: an unrecognised
// value is REJECTED and reported, never guessed into a member.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Building pet policy → live `PetsAllowed` members. Categorical, so it DOES map (Maya ruling).
 * The old feed tolerated `...OK`; the live enum spells it `...Ok`. Reading stays backward
 * compatible because the OLD spelling is the KEY.
 */
export const BUILDING_PETS_TO_COTALITY: Readonly<Record<string, string>> = Object.freeze({
  BuildingYes: 'BuildingYes',
  BuildingCatsOK: 'BuildingCatsOk',   // case fix — live member is BuildingCatsOk
  BuildingDogsOK: 'BuildingDogsOk',   // case fix — live member is BuildingDogsOk
  BuildingBreedRestrictions: 'BuildingBreedRestrictions',
  BuildingSizeLimit: 'BuildingSizeLimit',
  BuildingNumberLimit: 'BuildingNumberLimit',
  BuildingNo: 'BuildingNo',
});

/**
 * Class A — building-level laundry → live `LaundryFeatures` members (the `Building*` half of the
 * enum). `OnCommonFloor` is deliberately ABSENT: its live spelling `CommonOnFloor` carries no
 * `Building` prefix, making it the same non-building family as `CommonArea`, which Maya ruled
 * Mallan-only. It is listed in BUILDING_LAUNDRY_MALLAN_ONLY instead.
 */
export const BUILDING_LAUNDRY_TO_LAUNDRY_FEATURES: Readonly<Record<string, string>> = Object.freeze({
  WasherDryerInstallAllowed: 'BuildingWasherDryerInstallAllowed',
  InBasement: 'BuildingInBasement',
  CoinOperated: 'BuildingCoinOperated',
  Inside: 'BuildingInside',
  InHall: 'BuildingInHall',
  Outside: 'BuildingOutside',
  MainLevel: 'BuildingMainLevel',
  UpperLevel: 'BuildingUpperLevel',
  LowerLevel: 'BuildingLowerLevel',
  MultipleLocations: 'BuildingMultipleLocations',
  Other: 'BuildingOther',
  None: 'BuildingNone',
});

/**
 * Class C — two laundry checkboxes are live `BuildingFeatures` members, NOT `LaundryFeatures`.
 * They MERGE into any existing BuildingFeatures selection and never overwrite it (Maya ruling).
 */
export const BUILDING_LAUNDRY_TO_BUILDING_FEATURES: Readonly<Record<string, string>> = Object.freeze({
  LaundryDropOffService: 'LaundryDropOffService',
  DryCleaningService: 'DryCleaningService',
});

/**
 * Class D — live `LaundryFeatures` members that are UNIT-level and have no `Building*` counterpart,
 * plus `OnCommonFloor` (see Class A note). A building-level control does not prove the individual
 * unit has the feature, so these are Mallan-only building-profile facts and are NEVER sent to
 * Cotality (Maya ruling). In particular `InUnit` is NOT `BuildingWasherDryerInstallAllowed` —
 * having in-unit laundry and permitting installation are different facts.
 *
 * If matching UNIT-level controls exist elsewhere on the form, only those may populate the
 * corresponding live LaundryFeatures members.
 */
export const BUILDING_LAUNDRY_MALLAN_ONLY: readonly string[] = Object.freeze([
  'InUnit',
  'WasherHookup',
  'ElectricDryerHookup',
  'GasDryerHookup',
  'CommonArea',
  'InGarage',
  'InCarport',
  'SeeRemarks',
  'OnCommonFloor',
]);

/** Building pet selections → live members. Unknown values are dropped, never defaulted. */
export function translateBuildingPets(selected: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const v of selected ?? []) {
    const live = BUILDING_PETS_TO_COTALITY[String(v)];
    if (live && !out.includes(live)) out.push(live);
  }
  return out;
}

export interface BuildingLaundryTranslation {
  /** live LaundryFeatures members (Class A) */
  laundryFeatures: string[];
  /** live BuildingFeatures members, MERGED with what was already selected (Class C) */
  buildingFeatures: string[];
  /** Mallan-only building-profile facts, persisted under a Mallan key (Class D) */
  mallanOnly: string[];
  /** values in no class — refused, never sent */
  rejected: string[];
}

/**
 * Building laundry selections → the three destinations, by explicit table only.
 * `existingBuildingFeatures` is merged, never replaced.
 */
export function translateBuildingLaundry(
  selected: readonly string[] | null | undefined,
  opts: { existingBuildingFeatures?: readonly string[] | null } = {},
): BuildingLaundryTranslation {
  const laundryFeatures: string[] = [];
  const buildingFeatures: string[] = [...(opts.existingBuildingFeatures ?? [])];
  const mallanOnly: string[] = [];
  const rejected: string[] = [];

  for (const raw of selected ?? []) {
    const v = String(raw);
    const lf = BUILDING_LAUNDRY_TO_LAUNDRY_FEATURES[v];
    if (lf) { if (!laundryFeatures.includes(lf)) laundryFeatures.push(lf); continue; }
    const bf = BUILDING_LAUNDRY_TO_BUILDING_FEATURES[v];
    if (bf) { if (!buildingFeatures.includes(bf)) buildingFeatures.push(bf); continue; }
    if (BUILDING_LAUNDRY_MALLAN_ONLY.includes(v)) { if (!mallanOnly.includes(v)) mallanOnly.push(v); continue; }
    rejected.push(v);
  }

  return { laundryFeatures, buildingFeatures, mallanOnly, rejected };
}

export interface ElevatorProjection {
  /** Mallan-only numeric count — 0 is a RECORDED value, not an absence */
  count: number | null;
  /** live BuildingFeatures member, or null when the count is unknown */
  buildingFeature: 'Elevators' | 'NoElevators' | null;
}

/**
 * Elevator count → Mallan count + an EXPLICIT BuildingFeatures projection (Maya ruling).
 *
 *   blank / non-numeric → null count, NO projection (unknown, not zero)
 *   entered 0           → count 0 and NoElevators (an intentionally recorded absence)
 *   entered > 0         → the count and Elevators
 *
 * `FreightElevator` is NEVER inferred from a count — it is a different fact.
 *
 * NOTE: the previous form code was `parseInt(v || '') || null`, which collapsed an entered `0` to
 * `null` and destroyed the recorded fact. That is the bug this function replaces.
 */
export function elevatorProjection(raw: string | number | null | undefined): ElevatorProjection {
  const s = String(raw ?? '').trim();
  if (s === '') return { count: null, buildingFeature: null };
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { count: null, buildingFeature: null };
  return { count: n, buildingFeature: n === 0 ? 'NoElevators' : 'Elevators' };
}
