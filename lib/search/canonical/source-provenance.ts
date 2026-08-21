/**
 * source-provenance.ts — canonical provenance dimensions (PURE, A1).
 *
 * Three SEPARATE axes that must never be conflated (analysis §3):
 *   1. SourceAuthority     — WHO vouches for the fact (factual authority).
 *   2. ObservationPlatform — WHERE we observed it (e.g. StreetEasy). An
 *      observation platform is NEVER the listing brokerage/agent.
 *   3. SourceAccessMethod  — HOW the fact was obtained (a licensing fact).
 *
 * These are Mallan-INTERNAL vocabularies, not Cotality enums — so, unlike
 * status/ownership/property-type, they carry NO `data/cotality-enums.live.json`
 * binding. Type is derived from the frozen member array so the two can't drift.
 *
 * NOT WIRED: no runtime reader imports this in A1.
 */

// 1. Factual authority --------------------------------------------------------
export const SOURCE_AUTHORITIES = Object.freeze([
  'cotality_rebny',
  'acris',
  'nyc_dob',
  'mallan_crm',
  /**
   * Mallan COMPUTES the fact from verified inputs — Google geocoding, MTA
   * transit, canonical address normalisation.
   *
   * Distinct from `mallan_crm`, which is Mallan-owned BUSINESS data (exclusivity,
   * internal flags, CRM state). A derived coordinate is neither provider fact nor
   * CRM business data, and it must never be attributed to the provider: Cotality
   * never stated it. Added here rather than in a second enum so provenance keeps
   * exactly one vocabulary.
   */
  'mallan_derived',
  'supplemental',
] as const);
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];
export function isSourceAuthority(v: unknown): v is SourceAuthority {
  return typeof v === 'string' && (SOURCE_AUTHORITIES as readonly string[]).includes(v);
}

// 2. Observation platform -----------------------------------------------------
export const OBSERVATION_PLATFORMS = Object.freeze([
  'streeteasy',
  'zillow',
  'direct_broker_feed',
  'property_manager_feed',
  'owner_submitted',
  'manual_agent_research',
  'none',
] as const);
export type ObservationPlatform = (typeof OBSERVATION_PLATFORMS)[number];
export function isObservationPlatform(v: unknown): v is ObservationPlatform {
  return typeof v === 'string' && (OBSERVATION_PLATFORMS as readonly string[]).includes(v);
}

// 3. Access method ------------------------------------------------------------
export const SOURCE_ACCESS_METHODS = Object.freeze([
  'licensed_api',
  'licensed_feed',
  'direct_partner',
  'public_api',
  'public_dataset',
  'internal_system',
  'manual_agent_research',
] as const);
export type SourceAccessMethod = (typeof SOURCE_ACCESS_METHODS)[number];
export function isSourceAccessMethod(v: unknown): v is SourceAccessMethod {
  return typeof v === 'string' && (SOURCE_ACCESS_METHODS as readonly string[]).includes(v);
}

/**
 * Intended access methods per authority (addendum Appendix A). A `Record` over
 * `SourceAuthority` gives compile-time completeness — a new authority forces a
 * mapping entry. This is descriptive guidance for validation, not a hard gate.
 */
export const ACCESS_METHODS_BY_AUTHORITY: Readonly<
  Record<SourceAuthority, readonly SourceAccessMethod[]>
> = Object.freeze({
  cotality_rebny: Object.freeze(['licensed_api', 'licensed_feed'] as const),
  acris: Object.freeze(['public_api', 'public_dataset'] as const),
  nyc_dob: Object.freeze(['public_api', 'public_dataset'] as const),
  mallan_crm: Object.freeze(['internal_system', 'manual_agent_research'] as const),
  // Mallan computes the value in its own systems from a licensed third-party
  // API (Google geocoding, MTA/Google transit). `licensed_api` describes the
  // upstream input; `internal_system` the derivation that produces the fact.
  mallan_derived: Object.freeze(['licensed_api', 'internal_system'] as const),
  supplemental: Object.freeze([
    'licensed_api',
    'licensed_feed',
    'direct_partner',
    'manual_agent_research',
  ] as const),
});

/** True when `method` is one of the intended access methods for `authority`. */
export function isAccessMethodAllowedForAuthority(
  authority: SourceAuthority,
  method: SourceAccessMethod,
): boolean {
  return (ACCESS_METHODS_BY_AUTHORITY[authority] as readonly SourceAccessMethod[]).includes(method);
}
