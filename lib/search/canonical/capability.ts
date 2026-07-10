/**
 * capability.ts — shared capability vocabulary for the canonical contract (PURE).
 *
 * Honesty rule (Maya directive): a field's capability is one of exactly four states. `needs_probe`
 * and `unsupported` MUST NOT be treated as verified/working. `unsupported` fails loud in validation.
 */

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
