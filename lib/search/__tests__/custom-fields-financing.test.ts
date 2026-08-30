import {
  reconcileBuildingFinancing,
  readCustomFields,
  readMaximumFinancingPercent,
  readSponsorUnit,
  satisfiesMinimumFinancing,
  type FinancingObservation,
} from '../canonical/custom-fields';

const payload = (obj: Record<string, unknown>) => JSON.stringify(obj);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAXIMUM FINANCING IS A REAL, DENSELY POPULATED FACT.
 *
 * The exhaustive 2026-08-21 census of all 8,010 Active records found the key in
 * 6,803 of them — 84.9% — including 99.6% of stock cooperatives and 97% of
 * condominiums. It is absent from `$metadata` only because Cotality delivers it
 * INSIDE `CustomProperty.CustomFields`, a declared nullable Edm.String.
 *
 * "Not a top-level field" is a statement about where it lives, not about whether
 * it exists.
 */
describe('reading the financing observation', () => {
  it('reads a stated percentage', () => {
    expect(readMaximumFinancingPercent(payload({ MaximumFinancingPercent: 80 }))).toEqual({
      kind: 'stated',
      percent: 80,
    });
  });

  it('reads a stated percentage delivered as a string', () => {
    expect(readMaximumFinancingPercent(payload({ MaximumFinancingPercent: '75' }))).toEqual({
      kind: 'stated',
      percent: 75,
    });
  });

  it('treats 0.00 as NOT SPECIFIED, never as zero percent', () => {
    // The census found 0.00 behaves as the provider's not-specified sentinel —
    // 93% of RentalBuilding records carrying the key report it. Reading it
    // literally would tell a broker the building permits NO financing, silently
    // excluding every co-op they were looking for.
    const result = readMaximumFinancingPercent(payload({ MaximumFinancingPercent: 0 }));
    expect(result.kind).toBe('not_specified');
    expect(result.kind === 'not_specified' && result.reason).toMatch(/sentinel/);
  });

  it('treats 0.00 delivered as a decimal string the same way', () => {
    expect(readMaximumFinancingPercent(payload({ MaximumFinancingPercent: '0.00' })).kind).toBe(
      'not_specified',
    );
  });

  it('distinguishes an ABSENT key from a stated value', () => {
    expect(readMaximumFinancingPercent(payload({ SponsorUnitYN: true })).kind).toBe(
      'not_specified',
    );
  });

  it('refuses an unparseable payload rather than guessing', () => {
    expect(readMaximumFinancingPercent('not json at all').kind).toBe('not_specified');
    expect(readMaximumFinancingPercent(null).kind).toBe('not_specified');
  });

  it('refuses a value outside 0-100', () => {
    expect(readMaximumFinancingPercent(payload({ MaximumFinancingPercent: 900 })).kind).toBe(
      'not_specified',
    );
  });

  it('reads sponsor unit from the SAME payload, not a second parse', () => {
    const facts = readCustomFields(payload({ MaximumFinancingPercent: 90, SponsorUnitYN: 'Yes' }));
    expect(facts.maximumFinancingPercent).toEqual({ kind: 'stated', percent: 90 });
    expect(facts.sponsorUnit).toBe(true);
    expect(readSponsorUnit(payload({ SponsorUnitYN: false }))).toBe(false);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROVIDER SENDS A LISTING FACT; THE BROKER ASKS A BUILDING QUESTION.
 *
 * The census found 380 of 3,402 buildings — 11% — whose own listings report
 * DIFFERENT values: {90, 75, 25}, {50, 60}. Taking whichever listing came back
 * first would manufacture a building fact from an arbitrary row.
 */
describe('reconciling listing observations into a building answer', () => {
  const stated = (percent: number): FinancingObservation => ({ kind: 'stated', percent });
  const none = (): FinancingObservation => ({ kind: 'not_specified', reason: 'key absent' });

  it('agrees when every listing agrees', () => {
    expect(reconcileBuildingFinancing([stated(80), stated(80), none()])).toEqual({
      kind: 'stated',
      percent: 80,
    });
  });

  it('is NOT SPECIFIED when no listing states a value', () => {
    expect(reconcileBuildingFinancing([none(), none()])).toEqual({ kind: 'not_specified' });
  });

  it('is UNRESOLVED when credible values disagree — it does not pick one', () => {
    // The 11% case. Silently choosing 90 or 25 would tell a broker something no
    // one stated about that building.
    expect(reconcileBuildingFinancing([stated(90), stated(75), stated(25)])).toEqual({
      kind: 'unresolved',
      observed: [25, 75, 90],
    });
  });

  it('carries the competing values so the disagreement can be shown', () => {
    const result = reconcileBuildingFinancing([stated(50), stated(60)]);
    expect(result.kind === 'unresolved' && result.observed).toEqual([50, 60]);
  });

  it('does not treat the 0.00 sentinel as a competing value', () => {
    // A building where one listing states 80 and another carries the sentinel is
    // NOT in disagreement — the sentinel says nothing.
    expect(reconcileBuildingFinancing([stated(80), none(), none()])).toEqual({
      kind: 'stated',
      percent: 80,
    });
  });
});

describe('filtering on a minimum financing requirement', () => {
  it('includes a building that meets the minimum', () => {
    expect(satisfiesMinimumFinancing({ kind: 'stated', percent: 90 }, 80)).toBe(true);
    expect(satisfiesMinimumFinancing({ kind: 'stated', percent: 80 }, 80)).toBe(true);
  });

  it('excludes a building below the minimum', () => {
    expect(satisfiesMinimumFinancing({ kind: 'stated', percent: 50 }, 80)).toBe(false);
  });

  it('FAILS CLOSED on not-specified', () => {
    // Including it would assert a limit nobody stated — and the whole point of
    // the criterion is that the buyer needs that financing to exist.
    expect(satisfiesMinimumFinancing({ kind: 'not_specified' }, 80)).toBe(false);
  });

  it('FAILS CLOSED on unresolved', () => {
    expect(satisfiesMinimumFinancing({ kind: 'unresolved', observed: [50, 90] }, 80)).toBe(false);
  });
});
