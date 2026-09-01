/**
 * WHAT THE LOCAL-EXCLUSIVES READER CANNOT ANSWER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CLOSES
 *
 * `/api/listings` had a second result source. When the DB path produced no
 * candidates the request fell through to live Cotality, and a separate
 * exclusives reader then merged Mallan rows back in using its OWN predicate —
 * type, borough, neighborhood, price, beds — and nothing else.
 *
 * Every other criterion in the request was simply not applied to those rows.
 * Proven behaviourally on Preview at 535d2a24: a query pinned to one listing
 * returned that listing under `maxBaths=1.5` despite its 2.0 baths, and returned
 * it again under an impossible `minSqft=99000`. A correct EMPTY answer was being
 * broadened into a wrong non-empty one — silent widening, behind HTTP 200.
 *
 * The fallback merge was removed outright, because it was also redundant: that
 * branch runs only when the DB predicate — which carries the full criteria and
 * already admits Mallan-authored inventory — matched nothing.
 *
 * The IDX-disabled branch still reads local listings, and there the reader is
 * the ONLY source, so it cannot simply be deleted. This is what governs it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A NAMED LIST RATHER THAN AN INFERENCE
 *
 * Deriving "unsupported" from what the reader happens to implement would make a
 * newly-added criterion silently supported the moment someone forgot it — the
 * failure this exists to prevent. Naming them forces a decision: a criterion
 * added to public Search either gets applied by that reader, or is listed here
 * and refuses.
 */

/**
 * Public criteria the local-exclusives reader does NOT evaluate.
 *
 * `type`, `borough`, `neighborhood`, `minPrice`, `maxPrice` and `beds` are the
 * six it does apply, and are deliberately absent from this list.
 */
export const EXCLUSIVE_UNSUPPORTED_CRITERIA = [
  'minBaths',
  'maxBaths',
  'minSqft',
  'maxSqft',
  'yearBuilt',
  'ownershipTypes',
  'furnished',
  'amenities',
  'keywords',
  'openHouse',
  'openHouseDate',
  'propertySubTypes',
  'subTypes',
  'zipCodes',
  'statuses',
  'maxBeds',
  'bounds',
  'address',
] as const;

/**
 * The criteria in this request that the local-exclusives reader cannot answer.
 *
 * A non-empty result means that reader must return NOTHING. Narrowing to zero is
 * the fail-closed direction: being asked a question this path cannot answer is
 * not permission to answer a different, looser one.
 */
export function unsupportedExclusiveCriteria(params: URLSearchParams): string[] {
  return EXCLUSIVE_UNSUPPORTED_CRITERIA.filter((key) => {
    const value = params.get(key);
    return value !== null && value !== '';
  });
}
