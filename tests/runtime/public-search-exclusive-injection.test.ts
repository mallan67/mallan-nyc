/// <reference types="jest" />
/**
 * A CORRECT EMPTY ANSWER MUST NOT BE BROADENED INTO A WRONG ONE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `/api/listings` had a SECOND result source. When the DB path produced no
 * candidates, the request fell through to live Cotality, and a separate
 * exclusives reader merged Mallan rows back in using its own predicate — type,
 * borough, neighborhood, price, beds — with none of the request's other
 * criteria applied.
 *
 * Proven behaviourally on Preview at 535d2a24, pinned to one listing:
 *
 *   maxBaths=1.5      -> returned RLS20100147, which has 2.0 baths
 *   minSqft=99000     -> returned the same listing
 *
 * Both are correct EMPTY answers turned into wrong non-empty ones. Silent
 * widening, behind HTTP 200 — the worst failure shape this project recognises.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A DEDICATED FILE
 *
 * Every aggregate check passed while this was live: monotonicity, the bathroom
 * band, page integrity, counts. Adding a handful of wrong rows to a 4,069-row
 * result moves no total anyone would notice. Only a pinned row, on a query
 * narrow enough to force the fallthrough, exposed it — so the regression guard
 * is written at that grain rather than as another count assertion.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EXCLUSIVE_UNSUPPORTED_CRITERIA,
  unsupportedExclusiveCriteria,
} from '@/lib/search/public-exclusive-criteria';

const ROUTE = readFileSync(
  resolve(__dirname, '..', '..', 'app/api/listings/route.ts'),
  'utf8',
);

const qs = (s: string) => new URLSearchParams(s);

describe('the criteria that defeated the search must refuse, by name', () => {
  it('the two PROVEN cases are refused', () => {
    // The exact queries that returned a wrong listing on Preview.
    expect(unsupportedExclusiveCriteria(qs('type=sale&maxBaths=1.5'))).toContain('maxBaths');
    expect(unsupportedExclusiveCriteria(qs('type=sale&minSqft=99000'))).toContain('minSqft');
  });

  it('every recognised public criterion this reader cannot evaluate is refused', () => {
    // Named individually rather than counted: a threshold would let a criterion
    // silently leave the set, which is the defect wearing a different hat.
    for (const criterion of [
      'minBaths', 'maxBaths', 'minSqft', 'maxSqft', 'yearBuilt', 'ownershipTypes',
      'furnished', 'amenities', 'keywords', 'openHouse', 'propertySubTypes',
      'zipCodes', 'statuses', 'maxBeds', 'bounds', 'address',
    ]) {
      expect(unsupportedExclusiveCriteria(qs(`type=sale&${criterion}=x`))).toContain(criterion);
    }
  });

  it('the SIX criteria the reader does apply are NOT refused', () => {
    // Refusing these would break local-exclusive results entirely — narrowing
    // is the safe direction, but not when it is unnecessary.
    const supported = 'type=sale&borough=Manhattan&neighborhood=SoHo&minPrice=1&maxPrice=9&beds=2';
    expect(unsupportedExclusiveCriteria(qs(supported))).toEqual([]);
  });

  it('an absent or empty criterion does not trigger a refusal', () => {
    expect(unsupportedExclusiveCriteria(qs('type=sale'))).toEqual([]);
    expect(unsupportedExclusiveCriteria(qs('type=sale&keywords='))).toEqual([]);
  });

  it('several unanswerable criteria are all reported, not just the first', () => {
    const found = unsupportedExclusiveCriteria(qs('minBaths=1.5&minSqft=99000&keywords=park'));
    expect(found.sort()).toEqual(['keywords', 'minBaths', 'minSqft']);
  });
});

describe('the fallthrough cannot re-inject anything', () => {
  it('the fallback path has NO exclusives merge left to inject through', () => {
    // Removal, not another filter engine. Copying the criteria into a second
    // query would leave two places to forget one — which is how both this defect
    // and the bathroom defect happened.
    const code = ROUTE.split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toContain('mergeExclusiveListings');
  });

  it('the IDX-disabled branch refuses rather than ignoring the criterion', () => {
    // That branch still reads local listings and is the ONLY source there, so it
    // cannot be deleted — it must fail closed instead.
    expect(ROUTE).toContain('unsupportedExclusiveCriteria(searchParams)');
    expect(ROUTE).toContain('unsupportedForExclusives.length > 0');
    // The refusal must produce an empty set, never an unfiltered read.
    const branch = ROUTE.slice(
      ROUTE.indexOf('const unsupportedForExclusives'),
      ROUTE.indexOf('return NextResponse.json', ROUTE.indexOf('const unsupportedForExclusives')),
    );
    expect(branch).toMatch(/\?\s*\[\]/);
  });

  it('guard the guard — the helper really reads the params it claims to', () => {
    // If `unsupportedExclusiveCriteria` returned [] unconditionally, every
    // assertion above would pass while the reader ignored everything.
    expect(EXCLUSIVE_UNSUPPORTED_CRITERIA.length).toBeGreaterThan(10);
    expect(unsupportedExclusiveCriteria(qs('minBaths=1.5')).length).toBe(1);
    expect(unsupportedExclusiveCriteria(new URLSearchParams())).toEqual([]);
  });
});
