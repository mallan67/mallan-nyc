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
   * Which authority produced it. Only a Mallan building record can, because
   * Cotality supplies none — recorded so a later provider identity, if one is
   * ever licensed and proven, is a NEW member rather than a silent redefinition.
   */
  readonly source: 'mallan_building_record';
}

/** One building the inputs could legitimately mean. */
export interface BuildingCandidate {
  readonly buildingId: string;
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

const LOOKS_LIKE_COORDINATE = /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/;
const LOOKS_LIKE_STREET_ADDRESS = /\d+\s+\S+\s+(st|street|ave|avenue|rd|road|blvd|pl|place|dr)\b/i;

/**
 * A resolution is well-formed. Enforced rather than documented, because each
 * failure below is a way of PRESENTING A NON-IDENTITY AS AN IDENTITY.
 */
export function assertValidBuildingResult(result: BuildingSearchResult): void {
  const { resolution } = result;

  if (resolution.status === 'MATCHED') {
    const id = resolution.identity?.buildingId;
    if (typeof id !== 'string' || id.trim() === '') {
      throw new InvalidBuildingResultError('MATCHED with no building identity');
    }
    if (LOOKS_LIKE_COORDINATE.test(id.trim())) {
      throw new InvalidBuildingResultError(
        `identity "${id}" is a coordinate — a measurement with error bars is not a key`,
      );
    }
    if (LOOKS_LIKE_STREET_ADDRESS.test(id)) {
      throw new InvalidBuildingResultError(
        `identity "${id}" is a street address — an address is an INPUT to resolution, not its answer`,
      );
    }
    if (resolution.identity.source !== 'mallan_building_record') {
      throw new InvalidBuildingResultError(
        `identity claims source "${resolution.identity.source}" — Cotality supplies no building ` +
          `identity (BuildingKey 0/8,056 populated, GET /Building 403)`,
      );
    }
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
    for (const candidate of resolution.candidates) {
      if (!candidate.buildingId || !candidate.reason) {
        throw new InvalidBuildingResultError('every candidate needs an id and a stated reason');
      }
    }
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
