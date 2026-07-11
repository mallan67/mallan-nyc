/**
 * capability.ts — shared capability vocabulary for the canonical contract (PURE).
 *
 * Honesty rule (Maya directive): a field's capability is one of exactly four states. `needs_probe`
 * and `unsupported` MUST NOT be treated as verified/working. `unsupported` fails loud in validation.
 */

import { contractOk, contractFail, type ContractDecision } from './contract-decision';

/** Capability of a field/key on a given axis (filter/sort/alert/report). */
export type CapabilityStatus =
  | 'yes'          // verified working against current backend + (where relevant) live Cotality
  | 'no'           // deliberately not offered on this axis
  | 'needs_probe'  // requires live Cotality verification before it may be relied on
  | 'unsupported'; // current backend CANNOT support it — must fail loud, never silently accepted

/** Per-audience visibility of a field's value. */
export interface AudienceVisibility {
  public: boolean;
  client: boolean;
  agent: boolean;
  report: boolean;
}

/** How the contract behaves when a value is missing/ambiguous/unsupported. */
export type FailureBehavior =
  | 'fail_closed'                    // default safe: withhold / block
  | 'fail_loud'                      // reject the request explicitly (unsupported keys)
  | 'fail_open_provider_prefiltered' // ONLY the REBNY-pre-filtered display fields (see compliance §2.1)
  | 'na';

/** A capability is only "verified/usable" when it is exactly 'yes'. */
export function isVerified(status: CapabilityStatus): boolean {
  return status === 'yes';
}

/** `needs_probe` may never be treated as verified. */
export function requiresLiveProbe(status: CapabilityStatus): boolean {
  return status === 'needs_probe';
}

/** `unsupported` must fail loud — never silently accepted. */
export function isUnsupported(status: CapabilityStatus): boolean {
  return status === 'unsupported';
}

// --- Source permission capabilities (A1) -------------------------------------
/**
 * What an APPROVED source-license profile permits. The mere existence of this
 * type authorizes NOTHING — it only describes what an approved profile *could*
 * allow. StreetEasy/Zillow/any partner is authorized only by an active,
 * legal-review-approved `SourceLicenseState`; default is fail-closed. The
 * external-inventory hold remains in force.
 */
export interface SourcePermissionCapabilities {
  mayStoreIdentifiers: boolean;
  mayStoreListingFields: boolean;
  mayStorePhotos: boolean;
  mayStoreDescriptions: boolean;
  mayDisplayInternally: boolean;
  mayDisplayToClients: boolean;
  mayUseInReports: boolean;
  mayUseForComps: boolean;
  mayExport: boolean;
  attributionRequired: boolean;
  linkBackRequired: boolean;
  maximumRetentionHours: number | null;
}

/** A concrete use requested against a source. */
export type PermissionUse =
  | 'store_identifiers'
  | 'store_listing_fields'
  | 'store_photos'
  | 'store_descriptions'
  | 'display_internally'
  | 'display_to_clients'
  | 'use_in_reports'
  | 'use_for_comps'
  | 'export';

/** A resolved source-license profile. `approved` gates ALL capability use. */
export interface SourceLicenseState {
  /** legal_review_status === 'approved' AND within its effective window. */
  approved: boolean;
  capabilities: SourcePermissionCapabilities;
}

/** Map each requestable use to the capability field that permits it (compile-time complete). */
const USE_TO_CAPABILITY: Readonly<Record<PermissionUse, keyof SourcePermissionCapabilities>> =
  Object.freeze({
    store_identifiers: 'mayStoreIdentifiers',
    store_listing_fields: 'mayStoreListingFields',
    store_photos: 'mayStorePhotos',
    store_descriptions: 'mayStoreDescriptions',
    display_internally: 'mayDisplayInternally',
    display_to_clients: 'mayDisplayToClients',
    use_in_reports: 'mayUseInReports',
    use_for_comps: 'mayUseForComps',
    export: 'mayExport',
  });

/**
 * Fail-closed source-permission decision (PURE). No active, approved license
 * profile → UNLICENSED_SOURCE. A capability the profile does not grant →
 * UNLICENSED_SOURCE. Never authorizes a source merely because a capabilities
 * object was passed.
 */
export function evaluateSourcePermission(
  profile: SourceLicenseState | null | undefined,
  use: PermissionUse,
): ContractDecision {
  if (!profile || profile.approved !== true) {
    return contractFail('UNLICENSED_SOURCE', 'no active approved source-license profile', use);
  }
  const field = USE_TO_CAPABILITY[use];
  if (profile.capabilities[field] !== true) {
    return contractFail('UNLICENSED_SOURCE', `source license does not permit '${use}'`, use);
  }
  return contractOk();
}
