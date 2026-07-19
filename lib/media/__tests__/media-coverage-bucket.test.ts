/// <reference types="jest" />
import {
  classifyMediaCoverage,
  isBucketBBackfillEligible,
  tallyBuckets,
  type ListingCoverageInput,
  type CotalityProbe,
} from '@/lib/media/media-coverage-bucket';

const UNKNOWN: CotalityProbe = { status: 'unknown', reason: 'probe skipped' };
const confirmed = (n: number): CotalityProbe => ({ status: 'confirmed', photoCount: n });

function base(over: Partial<ListingCoverageInput> = {}): ListingCoverageInput {
  return {
    listingId: 'RLS20000001', rlsEligible: true, displayable: true,
    activeUsablePhotoCount: 0, allStatusRowCount: 0, legacyUsablePhotoCount: 0,
    cotality: UNKNOWN, ...over,
  };
}

describe('classifyMediaCoverage — buckets incl. tri-state Cotality', () => {
  it('F: non-displayable wins over everything', () => {
    expect(classifyMediaCoverage(base({ displayable: false, activeUsablePhotoCount: 9 }))).toBe('F');
  });
  it('A: active usable photos present', () => {
    expect(classifyMediaCoverage(base({ activeUsablePhotoCount: 12 }))).toBe('A');
  });
  it('E: Mallan-owned (SL-) with relational rows that all went inactive', () => {
    expect(classifyMediaCoverage(base({ listingId: 'SL-0004', allStatusRowCount: 3, legacyUsablePhotoCount: 17, cotality: confirmed(9) }))).toBe('E');
  });
  it('E: website-only (rls_eligible=false) with rows', () => {
    expect(classifyMediaCoverage(base({ listingId: 'C-1', rlsEligible: false, allStatusRowCount: 2 }))).toBe('E');
  });
  it('C: legacy JSON has usable photos → served by render fix', () => {
    expect(classifyMediaCoverage(base({ allStatusRowCount: 5, legacyUsablePhotoCount: 7, cotality: confirmed(7) }))).toBe('C');
  });

  it('U: DB-empty + Cotality UNKNOWN → UNKNOWN (never B/D)', () => {
    expect(classifyMediaCoverage(base({ cotality: UNKNOWN }))).toBe('U');
    expect(classifyMediaCoverage(base({ allStatusRowCount: 4, cotality: UNKNOWN }))).toBe('U');
  });
  it('B_NEW: third-party, no rows ever, Cotality CONFIRMED photos', () => {
    expect(classifyMediaCoverage(base({ allStatusRowCount: 0, cotality: confirmed(17) }))).toBe('B_NEW');
  });
  it('B_INACTIVE: third-party, inactive rows exist, Cotality CONFIRMED photos', () => {
    expect(classifyMediaCoverage(base({ allStatusRowCount: 6, cotality: confirmed(17) }))).toBe('B_INACTIVE');
  });
  it('D: DB-empty + Cotality CONFIRMED zero', () => {
    expect(classifyMediaCoverage(base({ cotality: confirmed(0) }))).toBe('D');
  });

  it('ROUND 2: Mallan-owned can NEVER be U or D — even never-imported, even probe-less', () => {
    // Mallan media is never Cotality-sourced, so an unperformed probe must not
    // put a Mallan listing into U, and a confirmed-zero must not put it in D.
    expect(classifyMediaCoverage(base({ listingId: 'SL-0004', allStatusRowCount: 0, cotality: UNKNOWN }))).toBe('E');
    expect(classifyMediaCoverage(base({ listingId: 'RL-0007', allStatusRowCount: 0, cotality: confirmed(0) }))).toBe('E');
    expect(classifyMediaCoverage(base({ rlsEligible: false, allStatusRowCount: 0, cotality: UNKNOWN }))).toBe('E');
  });

  it('a Cotality error/timeout is UNKNOWN → U, NEVER coerced to D', () => {
    expect(classifyMediaCoverage(base({ cotality: { status: 'unknown', reason: 'HTTP 503' } }))).toBe('U');
  });

  it('Codex #2: third-party RLS is never Mallan (agent_id not a signal — no field exists)', () => {
    // rows deleted + Cotality confirmed → B_INACTIVE (backfillable), NOT E
    expect(classifyMediaCoverage(base({ listingId: 'RLS20059088', allStatusRowCount: 4, cotality: confirmed(6) }))).toBe('B_INACTIVE');
  });
  it('Mallan-owned with Cotality media → E, never B (no third-party media onto Mallan)', () => {
    expect(classifyMediaCoverage(base({ listingId: 'SL-9', allStatusRowCount: 0, cotality: confirmed(5) }))).toBe('E');
  });
});

describe('isBucketBBackfillEligible — the dry-run guard', () => {
  it('true ONLY for confirmed third-party DB-empty (B_NEW or B_INACTIVE)', () => {
    expect(isBucketBBackfillEligible(base({ cotality: confirmed(10) }))).toBe(true);              // B_NEW
    expect(isBucketBBackfillEligible(base({ allStatusRowCount: 3, cotality: confirmed(10) }))).toBe(true); // B_INACTIVE
  });
  it('false for UNKNOWN, Mallan-owned, non-displayable, has-legacy, has-active, confirmed-zero', () => {
    expect(isBucketBBackfillEligible(base({ cotality: UNKNOWN }))).toBe(false);                    // U
    expect(isBucketBBackfillEligible(base({ listingId: 'SL-1', allStatusRowCount: 1, cotality: confirmed(10) }))).toBe(false); // E
    expect(isBucketBBackfillEligible(base({ displayable: false, cotality: confirmed(10) }))).toBe(false);   // F
    expect(isBucketBBackfillEligible(base({ legacyUsablePhotoCount: 3, cotality: confirmed(10) }))).toBe(false); // C
    expect(isBucketBBackfillEligible(base({ activeUsablePhotoCount: 3, cotality: confirmed(10) }))).toBe(false); // A
    expect(isBucketBBackfillEligible(base({ cotality: confirmed(0) }))).toBe(false);               // D
  });
});

describe('tallyBuckets', () => {
  it('counts each listing into exactly one bucket', () => {
    const t = tallyBuckets([
      base({ activeUsablePhotoCount: 3 }),                                     // A
      base({ cotality: confirmed(5) }),                                        // B_NEW
      base({ allStatusRowCount: 2, cotality: confirmed(5) }),                  // B_INACTIVE
      base({ legacyUsablePhotoCount: 2, cotality: confirmed(2) }),             // C
      base({ cotality: confirmed(0) }),                                        // D
      base({ listingId: 'SL-2', allStatusRowCount: 1 }),                       // E
      base({ displayable: false }),                                           // F
      base({ cotality: UNKNOWN }),                                            // U
    ]);
    expect(t).toEqual({ A: 1, B_NEW: 1, B_INACTIVE: 1, C: 1, D: 1, E: 1, F: 1, U: 1 });
  });
});
