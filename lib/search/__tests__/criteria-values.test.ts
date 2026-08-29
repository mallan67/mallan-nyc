import {
  InvalidCriterionValueError,
  assertValidBasis,
  assertValidGeo,
  assertValidRange,
  assertValidSet,
  assertValidText,
} from '../canonical/criteria-values';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CANONICAL VALUE CONTRACT — what a criterion's VALUE is allowed to be.
 *
 * The registry answers "which criteria exist and may they execute". It says
 * nothing about the SHAPE of what a broker typed. That gap is where the two
 * worst Search failures live, and neither is a crash:
 *
 *   SILENT WIDENING  — a value is dropped, the filter disappears, and the broker
 *                      gets MORE results than they asked for while the page
 *                      looks like it worked. `financingMin` does this today.
 *   SILENT REPAIR    — a nonsensical value is "helpfully" corrected (a reversed
 *                      range swapped, an unknown enum member filtered out) and
 *                      the broker gets a confident answer to a DIFFERENT
 *                      question than the one they asked.
 *
 * Every rule here therefore REFUSES. A refusal is visible; a wrong answer that
 * looks right is not. Section 6 will prove the refusal reaches the operator.
 */
describe('range values', () => {
  it('REFUSES an inverted range instead of swapping the bounds', () => {
    // Swapping is the tempting "helpful" repair. It answers a question the
    // broker did not ask, and reports success while doing it.
    expect(() => assertValidRange('list_price', { min: 900_000, max: 400_000 })).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('names the criterion in the refusal, so the failure is attributable', () => {
    // A generic "invalid search" cannot be acted on. The operator has to know
    // WHICH control produced it.
    expect(() => assertValidRange('living_area', { min: 5000, max: 100 })).toThrow(/living_area/);
  });

  it('accepts an open-ended range — one bound is a legitimate search', () => {
    expect(() => assertValidRange('list_price', { min: 400_000 })).not.toThrow();
    expect(() => assertValidRange('list_price', { max: 900_000 })).not.toThrow();
  });

  it('REFUSES a range with NEITHER bound — the same rule sets already follow', () => {
    // This test previously asserted the opposite, and that was an inconsistency
    // at the heart of the contract: a present-but-empty SET was refused because
    // absence means unfiltered, while a present-but-empty RANGE was waved
    // through. Both are a value that was lost in transit, and an unbounded range
    // widens the search on a page still showing the control as active.
    expect(() => assertValidRange('list_price', {})).toThrow(InvalidCriterionValueError);
    expect(() => assertValidRange('bedrooms', {})).toThrow(/omit the criterion/);
  });

  it('accepts an exact value expressed as an equal-bounded range', () => {
    // `beds=0` (studio) arrives from the natural-language parser as an exact
    // value. Zero is a REAL bedroom count, so this also pins that the contract
    // does not treat it as absent.
    expect(() => assertValidRange('bedrooms', { min: 0, max: 0 })).not.toThrow();
  });

  it('REFUSES a non-finite number rather than passing NaN to the provider', () => {
    expect(() => assertValidRange('list_price', { min: Number.NaN })).toThrow(
      InvalidCriterionValueError,
    );
    expect(() => assertValidRange('list_price', { max: Number.POSITIVE_INFINITY })).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('REFUSES a malformed date instead of letting the provider interpret it', () => {
    expect(() => assertValidRange('close_date', { min: '03/04/2026' })).toThrow(
      InvalidCriterionValueError,
    );
    expect(() => assertValidRange('close_date', { min: '2026-03-04' })).not.toThrow();
  });
});

describe('set values', () => {
  it('REFUSES an unknown member instead of filtering it out', () => {
    // Filtering it out is silent widening in its purest form: the broker asked
    // for a status that does not exist, and would receive every OTHER status
    // back as though the request had been honoured.
    expect(() => assertValidSet('market_status', ['Active', 'Frobnicated'], ['Active'])).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('names the offending member, not just the criterion', () => {
    expect(() => assertValidSet('market_status', ['Frobnicated'], ['Active'])).toThrow(
      /Frobnicated/,
    );
  });

  it('REFUSES a present-but-empty set — that is a lost value, not "no filter"', () => {
    // "No filter" is the ABSENCE of the key. A key that arrives holding [] means
    // a selection was made and then lost in transit, and treating it as
    // unfiltered returns the whole universe.
    expect(() => assertValidSet('market_status', [], ['Active'])).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('accepts a set whose members are all in the allowed vocabulary', () => {
    expect(() =>
      assertValidSet('market_status', ['Active', 'Pending'], ['Active', 'Pending', 'Closed']),
    ).not.toThrow();
  });
});

describe('basis selectors', () => {
  it('REFUSES an unrecognised basis when a range is present', () => {
    // This is the `dateType=ListedAndUpdated` case, promoted out of the executor
    // into the contract: the old code read `params.get("dateType") || "Listed"`,
    // so an unrecognised basis silently answered the LISTED question instead.
    expect(() => assertValidBasis('activity_date', 'ListedAndUpdated', ['Listed', 'Updated'])).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('REFUSES an absent basis — a canonical date range may not be ambiguous', () => {
    // This test previously accepted absence "because the criterion may declare a
    // default". A default is fine at the WIRE boundary, where a legacy request
    // arrives without `dateType`. It is not fine in the canonical object: a
    // Saved Search storing a date range that does not say which date it means
    // silently re-answers a different question whenever that default changes.
    expect(() => assertValidBasis('activity_date', undefined, ['Listed', 'Updated'])).toThrow(
      InvalidCriterionValueError,
    );
    expect(() => assertValidBasis('activity_date', '', ['Listed', 'Updated'])).toThrow(
      InvalidCriterionValueError,
    );
  });

  it('accepts a basis inside the declared vocabulary', () => {
    expect(() => assertValidBasis('activity_date', 'Updated', ['Listed', 'Updated'])).not.toThrow();
  });
});

describe('scalar text and geo values', () => {
  it('REFUSES blank text rather than leaving a later layer to decide', () => {
    // `street_address: ""` either renders a predicate matching nothing or is
    // dropped and widens the search, depending on which layer notices first —
    // and which layer notices is not something a contract should leave open.
    expect(() => assertValidText('street_address', '')).toThrow(InvalidCriterionValueError);
    expect(() => assertValidText('unit', '   ')).toThrow(InvalidCriterionValueError);
    expect(() => assertValidText('unit', '17C')).not.toThrow();
  });

  it('REFUSES an empty map boundary — a lost shape is not "no boundary"', () => {
    expect(() => assertValidGeo('map_grid_filter', { encoded: '' })).toThrow(
      InvalidCriterionValueError,
    );
    expect(() => assertValidGeo('map_grid_filter', { encoded: 'abc123' })).not.toThrow();
  });
});
