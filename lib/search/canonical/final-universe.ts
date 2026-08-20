/**
 * FINAL ELIGIBLE UNIVERSE — the accounting contract for a fallback response.
 *
 * Required order, and it is not negotiable:
 *
 *     source -> rights/gates -> filters -> dedupe -> deterministic sort
 *            -> FINAL eligible total -> pagination
 *
 * `total`, `hasMore`, page N and the returned IDs must all describe the SAME
 * universe. Two ways that was violated on the Trestle path:
 *
 *   1. `totalCount` used the provider's `@odata.count` unless bounds/borough/
 *      neighborhood were present. Collection amenities (elevator, dishwasher …)
 *      filter locally and were NOT in that list, so a request for elevators
 *      returned elevator-only IDs alongside the PRE-amenity provider total.
 *
 *   2. Where a local filter WAS recognised, the code fell back to
 *      `filtered.length` — the size of a locally-filtered slice of a BOUNDED
 *      `fetchTop` head sample. That is not a corpus count. If the provider
 *      corpus exceeds the fetch cap, `filtered.length` understates the truth
 *      while looking authoritative.
 *
 * This module refuses to fabricate. When a local filter is active and the head
 * sample was saturated, the total is reported as NOT corpus-complete so the
 * caller can degrade honestly instead of publishing a confident wrong number.
 */

export interface FinalUniverseInput {
  /** Provider `@odata.count` for the pushed filter, if it returned one. */
  providerCount: number | null;
  /** Rows actually fetched from the provider (before local filtering). */
  fetchedCount: number;
  /** The cap requested from the provider for this page. */
  fetchTop: number;
  /** Rows surviving EVERY local gate/filter/dedupe. */
  locallyFilteredCount: number;
  /** Did any criterion have to be evaluated locally rather than pushed? */
  hasLocalFilter: boolean;
}

export interface FinalUniverse {
  /** The number to publish as `total`. */
  total: number;
  /**
   * Does `total` describe the whole eligible corpus?
   *
   * FALSE means the head sample was saturated while a local filter was active,
   * so the true total is unknown and `total` is a LOWER BOUND. Callers must not
   * present a lower bound as a corpus count.
   */
  corpusComplete: boolean;
  /** Why, in one phrase — surfaced in telemetry, never invented at the caller. */
  basis: 'provider-count' | 'local-filter-complete' | 'local-filter-truncated';
}

export function computeFinalUniverse(input: FinalUniverseInput): FinalUniverse {
  const { providerCount, fetchedCount, fetchTop, locallyFilteredCount, hasLocalFilter } = input;

  // Nothing was evaluated locally, so the provider's count already describes the
  // final universe.
  if (!hasLocalFilter) {
    return {
      total: providerCount ?? locallyFilteredCount,
      corpusComplete: providerCount !== null,
      basis: 'provider-count',
    };
  }

  // A local filter ran. The provider count describes a BROADER population and
  // must not be published. Whether the local count is the corpus count depends
  // entirely on whether the head sample was exhausted.
  const sampleSaturated = fetchedCount >= fetchTop;
  return {
    total: locallyFilteredCount,
    corpusComplete: !sampleSaturated,
    basis: sampleSaturated ? 'local-filter-truncated' : 'local-filter-complete',
  };
}

/**
 * `hasMore` must follow the SAME universe as `total`.
 *
 * When the total is only a lower bound, "no more results" cannot be asserted —
 * more may exist beyond the head sample — so paging stays open.
 */
export function computeHasMore(u: FinalUniverse, skip: number, limit: number): boolean {
  if (!u.corpusComplete) return true;
  return skip + limit < u.total;
}
