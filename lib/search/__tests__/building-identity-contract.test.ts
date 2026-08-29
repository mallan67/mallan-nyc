import {
  BuildingIdentityNotImplementedError,
  InvalidBuildingResultError,
  assertValidBuildingResult,
  resolveBuildingIdentity,
  type BuildingSearchResult,
} from '../canonical/building-identity';

const withResolution = (resolution: any): BuildingSearchResult => ({
  resolution,
  supportingListings: [],
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §4.3 — BUILDING SEARCH RETURNS BUILDINGS.
 *
 * `BuildingCriteria` answers which filters an agent may supply. It says nothing
 * about what comes back, and a filtered list of units is not a building. Each
 * case below blocks a specific way of PRESENTING A NON-IDENTITY AS AN IDENTITY.
 */
describe('a MATCHED building must be a real identity', () => {
  it('accepts an opaque Mallan building identity', () => {
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'MATCHED',
          identity: { buildingId: 'bldg_01HQ8Z', authority: 'mallan_derived' },
        }),
      ),
    ).not.toThrow();
  });

  it('REFUSES a street address as the identity', () => {
    // An address is an INPUT to resolution, not its answer. It is a string many
    // records share, spell differently, or attach to more than one structure —
    // so every downstream fact would assert itself about whatever else happened
    // to share it.
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'MATCHED',
          identity: { buildingId: '845 Fifth Avenue', authority: 'mallan_derived' },
        }),
      ),
    ).toThrow(/street address/);
  });

  it('REFUSES a coordinate as the identity', () => {
    // A coordinate is a measurement with error bars. Two adjacent towers resolve
    // to one point at low precision; one tower resolves to two at high
    // precision. Neither direction is a key.
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'MATCHED',
          identity: { buildingId: '40.7644,-73.9729', authority: 'mallan_derived' },
        }),
      ),
    ).toThrow(/coordinate/);
  });

  it('REFUSES an identity claiming to come from the provider', () => {
    // Cotality supplies none: BuildingKey/BuildingKeyNumeric are populated
    // 0/8,056, the live Building entity declares one field, and GET /Building
    // returns 403. `$metadata` over-declares what the licence grants.
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'MATCHED',
          identity: { buildingId: 'bldg_01HQ8Z', authority: 'cotality' },
        }),
      ),
    ).toThrow(/Cotality supplies no building identity/);
  });

  it('REFUSES an empty identity', () => {
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'MATCHED',
          identity: { buildingId: '   ', authority: 'mallan_derived' },
        }),
      ),
    ).toThrow(InvalidBuildingResultError);
  });
});

describe('AMBIGUOUS may not be collapsed', () => {
  it('accepts two or more candidates, each with a stated reason', () => {
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'AMBIGUOUS',
          candidates: [
            { identity: { buildingId: 'bldg_a', authority: 'mallan_derived' }, reason: 'same street number, different structure' },
            { identity: { buildingId: 'bldg_b', authority: 'mallan_derived' }, reason: 'shares the corner address' },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('REFUSES a single candidate — that is a MATCHED in disguise', () => {
    // The dangerous shape: a caller receives "ambiguous" with one option and
    // quietly picks it, which is a guess wearing the label of a choice.
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'AMBIGUOUS',
          candidates: [{ identity: { buildingId: 'bldg_a', authority: 'mallan_derived' }, reason: 'only match' }],
        }),
      ),
    ).toThrow(/at least two candidates/);
  });

  it('REFUSES zero candidates — that is an UNRESOLVED in disguise', () => {
    expect(() =>
      assertValidBuildingResult(withResolution({ status: 'AMBIGUOUS', candidates: [] })),
    ).toThrow(/at least two candidates/);
  });

  it('applies the SAME identity rule to candidates as to a MATCHED result', () => {
    // The hole this closes: candidate validation checked only that two strings
    // were non-empty, so an address or a coordinate could sit in a candidate
    // list under a contract that forbids exactly those as an identity. An agent
    // may promote any candidate to their answer, so a candidate must already be
    // something they are allowed to hold.
    const withCandidate = (buildingId: string) =>
      withResolution({
        status: 'AMBIGUOUS',
        candidates: [
          { identity: { buildingId, authority: 'mallan_derived' }, reason: 'first' },
          { identity: { buildingId: 'bldg_b', authority: 'mallan_derived' }, reason: 'second' },
        ],
      });

    expect(() => assertValidBuildingResult(withCandidate('845 Fifth Avenue'))).toThrow(
      /street address/,
    );
    expect(() => assertValidBuildingResult(withCandidate('40.7644,-73.9729'))).toThrow(
      /coordinate/,
    );
    expect(() => assertValidBuildingResult(withCandidate(''))).toThrow(
      /has no building identity/,
    );
  });

  it('REFUSES a candidate claiming Cotality authority', () => {
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'AMBIGUOUS',
          candidates: [
            { identity: { buildingId: 'bldg_a', authority: 'cotality' }, reason: 'first' },
            { identity: { buildingId: 'bldg_b', authority: 'mallan_derived' }, reason: 'second' },
          ],
        }),
      ),
    ).toThrow(/Cotality supplies no building identity/);
  });

  it('names WHICH candidate failed, so a long list is diagnosable', () => {
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'AMBIGUOUS',
          candidates: [
            { identity: { buildingId: 'bldg_a', authority: 'mallan_derived' }, reason: 'first' },
            { identity: { buildingId: '845 Fifth Avenue', authority: 'mallan_derived' }, reason: 'second' },
          ],
        }),
      ),
    ).toThrow(/candidate 1/);
  });

  it('REFUSES a candidate with no stated reason', () => {
    // The agent disambiguates, so the agent must be told what distinguishes
    // them. Mallan never picks.
    expect(() =>
      assertValidBuildingResult(
        withResolution({
          status: 'AMBIGUOUS',
          candidates: [
            { identity: { buildingId: 'bldg_a', authority: 'mallan_derived' }, reason: '' },
            { identity: { buildingId: 'bldg_b', authority: 'mallan_derived' }, reason: 'shares the corner address' },
          ],
        }),
      ),
    ).toThrow(/stated reason/);
  });
});

describe('UNRESOLVED must be actionable', () => {
  it('accepts a stated reason', () => {
    expect(() =>
      assertValidBuildingResult(
        withResolution({ status: 'UNRESOLVED', reason: 'no Mallan building record for this parcel' }),
      ),
    ).not.toThrow();
  });

  it('REFUSES a bare "nothing found"', () => {
    // Indistinguishable from a failed lookup, and an agent cannot act on it.
    expect(() =>
      assertValidBuildingResult(withResolution({ status: 'UNRESOLVED', reason: '' })),
    ).toThrow(/must state why/);
  });
});

describe('the three answers never collapse into each other', () => {
  it('rejects a status outside the three', () => {
    // MATCHED, AMBIGUOUS and UNRESOLVED are three DIFFERENT facts — the same
    // rule that keeps SUPPORTED, PROVIDER_REJECTED and UNVERIFIED distinct at
    // the provider boundary.
    expect(() => assertValidBuildingResult(withResolution({ status: 'PROBABLY' }))).toThrow(
      /unknown resolution status/,
    );
  });
});

describe('the resolver is absent, and says so', () => {
  it('throws rather than returning a fabricated identity', () => {
    // The failure this prevents: a stub answering MATCHED with the address it
    // was handed. Building Search would appear to work, every result would look
    // authoritative, and the identity would be the input echoed back.
    expect(() => resolveBuildingIdentity()).toThrow(BuildingIdentityNotImplementedError);
  });

  it('names both blockers, so the sequencing is not lost', () => {
    let message = '';
    try {
      resolveBuildingIdentity();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/0\/8,056/);
    expect(message).toMatch(/403/);
    expect(message).toMatch(/no live writer since 2026-07-23/);
  });
});

describe('listings support a building result, they do not constitute it', () => {
  it('a MATCHED building with no listings is still valid', () => {
    // A building with no active listings is still a building. If listings
    // constituted the identity, Building Search would be listing search again.
    expect(() =>
      assertValidBuildingResult({
        resolution: {
          status: 'MATCHED',
          identity: { buildingId: 'bldg_01HQ8Z', authority: 'mallan_derived' },
        },
        supportingListings: [],
      }),
    ).not.toThrow();
  });

  it('supporting listings cannot stand in for a missing identity', () => {
    expect(() =>
      assertValidBuildingResult({
        resolution: { status: 'MATCHED', identity: { buildingId: '', authority: 'mallan_derived' } },
        supportingListings: [{ listingId: 'L1', relationship: 'unit_in_building' }],
      }),
    ).toThrow(InvalidBuildingResultError);
  });
});
