/**
 * SERVER-OWNED conversion of Mallan listing-form state into the Cotality field vocabulary
 * Mallan stores (Packet 2 closure).
 *
 *   browser form state  →  Mallan form contract (saleStatus / salePropertyType / …)
 *                       →  THIS module (the one conversion)
 *                       →  Mallan storage + business / REBNY-UCBA compliance rules
 *
 * The browser no longer translates its own workflow status or property type into provider
 * values (the former CRM_TO_RESO_STATUS / getResoMlsStatus / getResoPropertyFields copies are
 * gone). Every provider-vocabulary value written here is a LIVE enum member (verified against
 * the dated live enum pull, data/cotality-enums.live.json, 2026-09-05): the former browser tables
 * wrote non-live members ("Commercial" PropertyType, "Cooperative" CommonInterest,
 * "SingleFamilyTownhouse" / "MultiFamilyTownhouse" PropertySubType) — those are not written.
 *
 * Status: workflow → Mallan business status is lib/crm/status-mapping.ts. The result is written under the
 * MALLAN keys `_mallanStatus` / `_crmWorkflowStatus` — NEVER under the provider's MlsStatus / StandardStatus
 * (those are Cotality fields whose values are exact live enum members; Mallan's Draft / Sold / Rented /
 * Cancelled are not). The permission decision travels under `_mallanPermission`. See
 * lib/listings/mallan-status.ts for the three status domains.
 * Unknown form values are refused (null / error), never defaulted.
 */
import liveEnumPull from '@/data/cotality-enums.live.json';
import {
  mapCrmStatusToCanonicalStatus,
  CANONICAL_STATUSES,
  type CanonicalStatus,
} from './status-mapping';

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

// Live enum members from the dated live pull (data/cotality-enums.live.json, regenerated live by
// `npm run cotality:compile`, drift-checked by `npm run cotality:verify`). Read directly: the
// lib/search/canonical package is reserved for the Search executor (A1 contract).
const LIVE_ENUMS = (liveEnumPull as { enums: Record<string, string[]> }).enums;
const PROPERTY_TYPE_SET = new Set<string>(LIVE_ENUMS.PropertyType ?? []);
const COMMON_INTEREST_SET = new Set<string>(LIVE_ENUMS.CommonInterest ?? []);
const CANONICAL_STATUS_SET = new Set<string>(CANONICAL_STATUSES as readonly string[]);

/**
 * Mallan status input (workflow value such as "OfferOut", or an already-canonical value such as
 * "ActiveUnderContract") → canonical Mallan status. Null when unrecognized (refuse; never default).
 */
export function canonicalStatusFromForm(input: unknown): CanonicalStatus | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (CANONICAL_STATUS_SET.has(trimmed)) return trimmed as CanonicalStatus;
  // Legacy CRM draft marker: older clients and stored rows carry 'Incomplete' (the rental form used to
  // write it for Draft/Future). It is a live StandardStatus member but Mallan's canonical draft is 'Draft'.
  if (trimmed === 'Incomplete') return 'Draft';
  return mapCrmStatusToCanonicalStatus(trimmed);
}

/** Provider field names that carry a Mallan decision in a Mallan-authored payload — always redirected to Mallan keys. */
export const PROVIDER_DECISION_FIELDS: readonly string[] = Object.freeze(['MlsStatus', 'StandardStatus', 'Permission', 'Permissions']);

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

export interface ServerFormMappingResult {
  /** The body with server-derived _mallanStatus / _crmWorkflowStatus / _mallanPermission / PropertyType / PropertySubType / CommonInterest. */
  body: Record<string, unknown>;
  /** Which fields the server derived (from the Mallan form keys) — for audit / response detail. */
  derived: string[];
  /** Refusals: an unknown Mallan form value or a client-supplied provider value that is not live. */
  errors: string[];
}

/**
 * Apply the server-owned conversion to an incoming CRM listing payload.
 *
 *  - When the Mallan form keys are present (saleStatus / rentalStatus, salePropertyType /
 *    rentalPropertyType, *OfficeRetailOwnership), the server DERIVES the provider-vocabulary
 *    fields from them and any client-supplied MlsStatus / PropertyType / PropertySubType /
 *    CommonInterest is ignored (the browser does not decide the provider representation).
 *  - When only provider-vocabulary keys are present (an API client), each is VALIDATED against
 *    the live Cotality enum / Mallan canonical statuses; a non-live value is an error.
 *  - Nothing is defaulted: an unknown form value is an error.
 */
export function applyServerFormMapping(
  input: Record<string, unknown>,
  formType: ListingFormType,
): ServerFormMappingResult {
  const body: Record<string, unknown> = { ...input };
  const derived: string[] = [];
  const errors: string[] = [];
  const prefix = formType === 'rent' ? 'rental' : 'sale';

  // ── status: CRM workflow → Mallan business status, under MALLAN keys only ──
  const workflowStatus = body[`${prefix}Status`] ?? body._crmWorkflowStatus;
  const legacyProviderNamed = body.MlsStatus ?? body.StandardStatus ?? body.status;
  if (typeof workflowStatus === 'string' && workflowStatus.trim() !== '') {
    const canonical = canonicalStatusFromForm(workflowStatus);
    if (!canonical) errors.push(`${prefix}Status "${workflowStatus}" is not a recognized Mallan workflow status`);
    else { body._mallanStatus = canonical; body._crmWorkflowStatus = workflowStatus.trim(); derived.push('_mallanStatus'); }
  } else if (legacyProviderNamed !== undefined && legacyProviderNamed !== null && legacyProviderNamed !== '') {
    // A legacy client sent the Mallan status under a provider field name: it is a Mallan status and is
    // stored under the Mallan key; the provider-named key is removed below.
    const canonical = canonicalStatusFromForm(legacyProviderNamed);
    if (!canonical) errors.push(`status "${String(legacyProviderNamed)}" is not a Mallan canonical status`);
    else { body._mallanStatus = canonical; derived.push('_mallanStatus'); }
  } else if (typeof body._mallanStatus === 'string' && body._mallanStatus !== '') {
    const canonical = canonicalStatusFromForm(body._mallanStatus);
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
  } else {
    if (body.PropertyType !== undefined && body.PropertyType !== null && body.PropertyType !== '' && !PROPERTY_TYPE_SET.has(String(body.PropertyType))) {
      errors.push(`PropertyType "${String(body.PropertyType)}" is not a live Cotality PropertyType member`);
    }
    if (body.CommonInterest !== undefined && body.CommonInterest !== null && body.CommonInterest !== '' && !COMMON_INTEREST_SET.has(String(body.CommonInterest))) {
      errors.push(`CommonInterest "${String(body.CommonInterest)}" is not a live Cotality CommonInterest member`);
    }
  }

  return { body, derived, errors };
}
