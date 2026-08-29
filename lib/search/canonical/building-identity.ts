import { isSourceAuthority, type SourceAuthority } from './source-provenance';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUILDING SEARCH RETURNS BUILDINGS.
 *
 * §4.3 requires a BUILDING result identity — not listing rows with building
 * filters applied. `BuildingCriteria` answers which filters an agent may supply;
 * it says nothing about what comes back, and a filtered list of units is not a
 * building.
 *
 * This file is a CONTRACT. It deliberately implements no resolution, because
 * every input a resolver would need is currently unproven:
 *
 *   PROVIDER SIDE — Cotality supplies no usable building identity.
 *   `BuildingKey`/`BuildingKeyNumeric` are populated 0 of 8,056, the live
 *   Building entity declares exactly ONE field, and `GET /Building` returns 403.
 *   `$metadata` over-declares what the licence grants (CLAUDE.md §A.0), so the
 *   declaration is not capability.
 *
 *   MALLAN SIDE — a `Building` model exists with a unique `building_key`, but
 *   `upsertBuildingFromRecords` has had no live caller since the 2026-07-23
 *   Neon-quiet change. The key's derivation is therefore unestablished, and this
 *   contract must NOT name it the canonical identity on the strength of a column
 *   existing.
 *
 * So the honest state is: the identity resolver does not exist yet, and the
 * shape of its answer is fixed here first. Implementation is sequenced BEHIND
 * this contract, not alongside it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO IDENTITIES THAT ARE EXPLICITLY FORBIDDEN.
 *
 * NO ADDRESS-ONLY IDENTITY. A structured address is an INPUT to resolution, not
 * the answer. "845 Fifth Avenue" is a string many records can share, spell
 * differently, or attach to more than one physical structure; treating it as the
 * identity makes every downstream fact — units, amenities, financing, tax lot —
 * assert itself about whatever else happened to share the string.
 *
 * NO COORDINATE IDENTITY. A previous note routed identity through a geocoding
 * service this repository does not use. A coordinate is a measurement with error
 * bars, not a key: two adjacent towers resolve to the same point at low
 * precision and one tower resolves to two points at high precision. Neither
 * direction is an identity.
 *
 * NYC parcel facts (TaxBlock / TaxLot / TaxMapNumber / ParcelNumber /
 * BuildingTaxLot) are candidate identity INPUTS, contracted separately. They are
 * never presented as provider facts.
 */

/**
 * The three answers a resolver may give. They are three DIFFERENT facts and may
 * never collapse into each other — the same rule that keeps SUPPORTED,
 * PROVIDER_REJECTED and UNVERIFIED distinct at the provider boundary.
 */
export type BuildingResolutionStatus = 'MATCHED' | 'AMBIGUOUS' | 'UNRESOLVED';

/**
 * A resolved building. Opaque by construction: consumers may carry it and ask
 * for it again, and may not reconstruct it from address parts or coordinates.
 */
export interface CanonicalBuildingIdentity {
  /** Mallan-owned and opaque. Never an address string, never a coordinate. */
  readonly buildingId: string;
  /**
   * WHO vouches for the identity, using the repository's ONE provenance
   * vocabulary.
   *
   * This was briefly a Building-only literal, `source: 'mallan_building_record'`.
   * That invented a second provenance vocabulary for one subsystem — exactly what
   * `source-provenance.ts` warns against in its own comment: `mallan_derived` was
   * "added here rather than in a second enum so provenance keeps exactly one
   * vocabulary." FIELD_REGISTRY already classifies `building_identity` as
   * `sourceAuthority: 'mallan_derived'`, so reusing it also keeps the registry
   * and this contract saying the same thing.
   *
   * It also claimed more than is known: `Building.building_key` has no proven
   * derivation, so naming "the Mallan building record" as an authority in its own
   * right was premature.
   */
  readonly authority: SourceAuthority;
}

/**
 * One building the inputs could legitimately mean.
 *
 * Carries the SAME identity type as a MATCHED result, so it passes the SAME
 * validation. A candidate used to be a bare `{ buildingId, reason }` checked only
 * for non-emptiness, which meant `'845 Fifth Avenue'` or `'40.7644,-73.9729'`
 * could sit in a candidate list while the very same contract forbade them as a
 * MATCHED identity. Two identity rules is one rule too many.
 */
export interface BuildingCandidate {
  readonly identity: CanonicalBuildingIdentity;
  /** Why this candidate survived — shown to the agent, who decides. */
  readonly reason: string;
}

/**
 * A listing fact that SUPPORTS a building result.
 *
 * Supporting, never constituting. Listings are evidence ABOUT a building; the
 * building is not the set of its listings. A building with no active listings is
 * still a building, and one listing is not a building because it has an address.
 */
export interface SupportingListingFact {
  readonly listingId: string;
  readonly relationship: 'unit_in_building';
}

export type BuildingResolution =
  | { readonly status: 'MATCHED'; readonly identity: CanonicalBuildingIdentity }
  /** Two or more real candidates. The agent disambiguates; Mallan never guesses. */
  | { readonly status: 'AMBIGUOUS'; readonly candidates: readonly BuildingCandidate[] }
  | { readonly status: 'UNRESOLVED'; readonly reason: string };

/** What Building Search returns: an identity, plus the facts that support it. */
export interface BuildingSearchResult {
  readonly resolution: BuildingResolution;
  readonly supportingListings: readonly SupportingListingFact[];
}

/** A malformed result — one that would let a caller act on a non-identity. */
export class InvalidBuildingResultError extends Error {
  constructor(reason: string) {
    super(`Building search result cannot be honoured: ${reason}`);
    this.name = 'InvalidBuildingResultError';
  }
}

/**
 * The ONE authority that may own a final canonical building identity.
 *
 * Matches `FIELD_REGISTRY`'s `sourceAuthority: 'mallan_derived'` for
 * `building_identity`, using the shared `SourceAuthority` vocabulary rather than
 * a Building-local enum.
 */
export const BUILDING_IDENTITY_AUTHORITY: SourceAuthority = 'mallan_derived';

const LOOKS_LIKE_COORDINATE = /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/;
const LOOKS_LIKE_STREET_ADDRESS = /\d+\s+\S+\s+(st|street|ave|avenue|rd|road|blvd|pl|place|dr)\b/i;

/**
 * THE identity rule. One function, applied everywhere an identity appears.
 *
 * It guarded MATCHED only, while an AMBIGUOUS candidate was a bare
 * `{ buildingId, reason }` checked for non-emptiness — so an address or a
 * coordinate could ride in as a candidate under a contract that forbids exactly
 * those. A caller picking a candidate would then hold something this file says
 * is not an identity.
 */
export function assertValidBuildingIdentity(
  identity: CanonicalBuildingIdentity | undefined,
  where: string,
): void {
  const id = identity?.buildingId;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new InvalidBuildingResultError(`${where} has no building identity`);
  }
  if (LOOKS_LIKE_COORDINATE.test(id.trim())) {
    throw new InvalidBuildingResultError(
      `${where}: identity "${id}" is a coordinate — a measurement with error bars is not a key`,
    );
  }
  if (LOOKS_LIKE_STREET_ADDRESS.test(id)) {
    throw new InvalidBuildingResultError(
      `${where}: identity "${id}" is a street address — an address is an INPUT to resolution, not its answer`,
    );
  }
  if (!isSourceAuthority(identity!.authority)) {
    throw new InvalidBuildingResultError(
      `${where}: "${identity!.authority}" is not a member of the canonical provenance vocabulary`,
    );
  }
  if (identity!.authority === 'cotality') {
    throw new InvalidBuildingResultError(
      `${where}: identity claims Cotality authority, but Cotality supplies no building identity ` +
        `(BuildingKey/BuildingKeyNumeric populated 0/8,056, GET /Building returns 403)`,
    );
  }
  if (identity!.authority !== BUILDING_IDENTITY_AUTHORITY) {
    // EVIDENCE IS NOT AUTHORITY.
    //
    // Refusing only `cotality` left acris, nyc_dob, mallan_crm and supplemental
    // able to own a final building identity. A parcel record, a DOB filing or an
    // ACRIS deed is INPUT a resolver weighs; none of them owns the opaque Mallan
    // key that results. FIELD_REGISTRY says `building_identity` is
    // `mallan_derived`, and this contract must say the same thing rather than a
    // looser version of it.
    //
    // If that architecture is ever changed deliberately, this constant moves —
    // which is a visible edit, unlike a permissive check quietly admitting a new
    // authority.
    throw new InvalidBuildingResultError(
      `${where}: identity claims "${identity!.authority}" authority. The final canonical building ` +
        `identity is "${BUILDING_IDENTITY_AUTHORITY}" — address, parcel, ACRIS and DOB facts are ` +
        `EVIDENCE a resolver weighs, not the authority that owns the resulting key`,
    );
  }
}

/**
 * A resolution is well-formed. Enforced rather than documented, because each
 * failure below is a way of PRESENTING A NON-IDENTITY AS AN IDENTITY.
 */
export function assertValidBuildingResult(result: BuildingSearchResult): void {
  const { resolution } = result;

  if (resolution.status === 'MATCHED') {
    assertValidBuildingIdentity(resolution.identity, 'MATCHED');
    return;
  }

  if (resolution.status === 'AMBIGUOUS') {
    // One candidate is a MATCH being hidden; zero is an UNRESOLVED being hidden.
    // Both would let a caller quietly pick the first and call it the answer.
    if (!Array.isArray(resolution.candidates) || resolution.candidates.length < 2) {
      throw new InvalidBuildingResultError(
        'AMBIGUOUS must carry at least two candidates — fewer is a MATCHED or an UNRESOLVED in disguise',
      );
    }
    resolution.candidates.forEach((candidate, i) => {
      // The SAME rule as MATCHED. An agent may promote any candidate to their
      // answer, so a candidate must already be a thing they are allowed to hold.
      assertValidBuildingIdentity(candidate.identity, `AMBIGUOUS candidate ${i}`);
      if (!candidate.reason || candidate.reason.trim() === '') {
        throw new InvalidBuildingResultError(
          `AMBIGUOUS candidate ${i} has no stated reason — the agent disambiguates, so the agent ` +
            `must be told what distinguishes them`,
        );
      }
    });
    return;
  }

  if (resolution.status === 'UNRESOLVED') {
    // "Nothing found" without a reason is indistinguishable from a failed lookup,
    // and an agent cannot act on it.
    if (!resolution.reason || resolution.reason.trim() === '') {
      throw new InvalidBuildingResultError('UNRESOLVED must state why');
    }
    return;
  }

  throw new InvalidBuildingResultError(
    `unknown resolution status "${(resolution as { status: string }).status}"`,
  );
}

/**
 * Raised instead of returning a fabricated identity.
 *
 * The failure mode this prevents is a resolver stub that answers MATCHED with
 * the address it was given: Building Search would appear to work, every result
 * would look authoritative, and the identity would be the input echoed back.
 */
export class BuildingIdentityNotImplementedError extends Error {
  constructor() {
    super(
      'Building identity resolution is not implemented. Cotality supplies no building identity ' +
        '(BuildingKey/BuildingKeyNumeric populated 0/8,056, live Building entity declares one ' +
        'field, GET /Building returns 403), and the Mallan Building record has had no live writer ' +
        'since 2026-07-23, so building_key has no established derivation. Resolve that first — ' +
        'this contract fixes the SHAPE of the answer, not the answer.',
    );
    this.name = 'BuildingIdentityNotImplementedError';
  }
}

/** The interface a resolver must satisfy once the identity inputs are proven. */
export interface BuildingIdentityResolver {
  resolve(input: { readonly structuredAddress?: unknown; readonly parcel?: unknown }):
    BuildingResolution;
}

/**
 * The resolver, deliberately absent. Fails LOUD.
 *
 * Building Search stays visibly unbuilt rather than quietly wrong.
 */
export function resolveBuildingIdentity(): never {
  throw new BuildingIdentityNotImplementedError();
}
