/// <reference types="jest" />
/**
 * CONTINUATION — so the read budget bounds WORK, not INVENTORY.
 *
 * A budget that bounds one request is correct. A budget that makes result
 * 60,001 permanently unreachable is a hidden maximum searchable inventory, and
 * the authorized provider population is already around 591,000 rows.
 *
 * The token is a POSITION, not an authority: every request re-applies the whole
 * chain from its own parameters — canonical criteria, Mallan return-copy
 * suppression, distribution gates, provider-row dedupe — so a continuation
 * cannot widen a search, skip a gate, or reach a listing the caller could not
 * otherwise reach.
 *
 * CORRECTING AN EARLIER CLAIM OF MINE: I wrote that it therefore "has no
 * authority worth forging". That was too comfortable. It does not grant access
 * to unauthorized listings, but it DOES control which authorized rows a broker
 * is told belong to the next page — and in a brokerage search engine, silently
 * changing or skipping the result sequence is itself an integrity problem. The
 * tests below treat it that way.
 */
import {
  CONTINUATION_BOUNDARY_TAIL,
  InvalidContinuationError,
  continuationFingerprint,
  decodeContinuation,
  encodeContinuation,
  expectedPageFor,
  nextContinuation,
} from '@/lib/search/continuation';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The seal needs a key. Set here rather than in the environment: the env var
// itself is a PROTECTED BOUNDARY and this suite must not depend on one existing.
process.env.SEARCH_CONTINUATION_SECRET =
  process.env.SEARCH_CONTINUATION_SECRET || 'test-only-continuation-secret-value';

const FILTER = "(StandardStatus eq 'Active') and CityRegion eq 'Manhattan'";
const SORT = 'ListPrice desc, ListingKey asc';
const PAGE_SIZE = 20;
const FP = continuationFingerprint(FILTER, SORT, PAGE_SIZE);

const token = (over: Partial<Record<string, unknown>> = {}) =>
  nextContinuation({
    fingerprint: FP,
    sortKey: 'price_desc',
    phase: 'KNOWN',
    sortValue: 5_000_000,
    lastListingKey: '1146011469',
    survivorsConsumed: 1_000,
    pageRowKeys: ['1146011469', '1146011470', '1146011471'],
    ...over,
  } as any);

describe('a continuation round-trips its position', () => {
  it('carries the provider offset and survivors consumed', () => {
    const c = decodeContinuation(token(), FP);
    expect(c.sortKey).toBe('price_desc');
    expect(c.phase).toBe('KNOWN');
    expect(c.sortValue).toBe(5_000_000);
    expect(c.lastListingKey).toBe('1146011469');
    expect(c.survivorsConsumed).toBe(1_000);
  });

  it('carries a bounded tail of boundary keys', () => {
    const many = Array.from({ length: 50 }, (_, i) => String(1146011469 + i));
    const c = decodeContinuation(token({ pageRowKeys: many }), FP);
    expect(c.tail).toHaveLength(CONTINUATION_BOUNDARY_TAIL);
    expect(c.tail[c.tail.length - 1]).toBe(String(1146011469 + 49));
  });

  it('a short page still hands on a usable boundary', () => {
    // Carrying the previous tail forward matters when a page yields one row:
    // otherwise the boundary shrinks to nothing exactly when it is needed.
    const t = nextContinuation({
      fingerprint: FP,
      sortKey: 'price_desc',
      phase: 'KNOWN',
      sortValue: 4_000_000,
      lastListingKey: '1146011499',
      survivorsConsumed: 1_050,
      pageRowKeys: ['1146011499'],
      previousTail: ['1146011490', '1146011491', '1146011492'],
    });
    expect(decodeContinuation(t, FP).tail).toEqual([
      '1146011490', '1146011491', '1146011492', '1146011499',
    ]);
  });
});

describe('a continuation belongs to ONE question', () => {
  it('is rejected when the criteria change', () => {
    const other = continuationFingerprint(FILTER + " and BedroomsTotal ge 2", SORT, PAGE_SIZE);
    expect(() => decodeContinuation(token(), other)).toThrow(InvalidContinuationError);
  });

  it('is rejected when the SORT changes', () => {
    // Sort decides the sequence, so a position in one order means nothing in
    // another — this is how a resumed page silently returns unrelated rows.
    const other = continuationFingerprint(FILTER, 'ListPrice asc, ListingKey asc', PAGE_SIZE);
    expect(() => decodeContinuation(token(), other)).toThrow(/different search or sort order/);
  });

  it('the fingerprint changes when either input changes', () => {
    expect(continuationFingerprint(FILTER, SORT, PAGE_SIZE)).toBe(FP);
    expect(continuationFingerprint(FILTER + ' ', SORT, PAGE_SIZE)).not.toBe(FP);
    expect(continuationFingerprint(FILTER, SORT + ' ', PAGE_SIZE)).not.toBe(FP);
  });
});

describe('a malformed or tampered token is refused BY NAME', () => {
  it.each([
    ['not base64 at all', '!!!!not-a-token!!!!'],
    ['valid base64, not JSON', Buffer.from('hello', 'utf8').toString('base64url')],
    ['JSON that is not an object', Buffer.from('42', 'utf8').toString('base64url')],
  ])('%s', (_label, bad) => {
    expect(() => decodeContinuation(bad, FP)).toThrow(InvalidContinuationError);
  });

  it.each([
    ['a negative survivor position', { survivorsConsumed: -5 }],
    ['a fractional survivor position', { survivorsConsumed: 1.5 }],
    ['a wrong version', { v: 99 }],
    ['a missing fingerprint', { fp: '' }],
    ['malformed boundary keys', { tail: [1, 2, 3] }],
    ['an unknown traversal phase', { phase: 'SIDEWAYS' }],
    ['a non-provider boundary key', { lastListingKey: 'K1' }],
    ['a KNOWN phase with no sort value', { phase: 'KNOWN', sortValue: null }],
    ['a NULLS phase carrying a sort value', { phase: 'NULLS', sortValue: 5 }],
  ])('%s is refused', (_label, over) => {
    // SEALED deliberately, so each case fails on the SHAPE check it is named
    // for rather than on the seal. An unsealed payload would pass this test for
    // the wrong reason and hide a broken validator.
    const raw = {
      v: 2,
      sortKey: 'price_desc',
      phase: 'KNOWN',
      sortValue: 5_000_000,
      lastListingKey: '1146011469',
      survivorsConsumed: 5,
      tail: ['1146011469'],
      fp: FP,
      ...over,
    };
    const bad = encodeContinuation(raw as any);
    expect(() => decodeContinuation(bad, FP)).toThrow(InvalidContinuationError);
  });

  it('never silently restarts at page one', () => {
    // The dangerous fallback: a rejected token quietly becoming a fresh search
    // would hand a broker page 1 while the pager says page 40.
    let threw = false;
    try {
      decodeContinuation('garbage', FP);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(InvalidContinuationError);
      expect((err as InvalidContinuationError).reason.length).toBeGreaterThan(0);
    }
    expect(threw).toBe(true);
  });
});

describe('the token holds everything needed to resume', () => {
  it('a cold process with no memory decodes the same position', () => {
    // Nothing is stored anywhere, which is the point: an in-memory cursor could
    // not promise this on a cold serverless instance.
    const encoded = token();
    const first = decodeContinuation(encoded, FP);
    const second = decodeContinuation(encoded, FP);
    expect(second).toEqual(first);
  });

  it('re-encoding a decoded token is stable', () => {
    const encoded = token();
    expect(encodeContinuation(decodeContinuation(encoded, FP))).toBe(encoded);
  });

  it('carries no criteria, rows, or permissions', () => {
    // A position, not an authority. If a token ever carried the query itself, a
    // caller could edit it into a different search.
    const decoded = JSON.parse(
      Buffer.from(token().split('.')[0], 'base64url').toString('utf8'),
    );
    expect(Object.keys(decoded).sort()).toEqual([
      'fp', 'lastListingKey', 'phase', 'sortKey', 'sortValue', 'survivorsConsumed', 'tail', 'v',
    ]);
    expect(JSON.stringify(decoded)).not.toContain('StandardStatus');
    expect(JSON.stringify(decoded)).not.toContain('Manhattan');
  });
});

/**
 * THE TAMPERING THAT ACTUALLY MATTERS.
 *
 * My earlier claim — "the token has no authority worth forging" — was too
 * comfortable. It is true that a continuation cannot reach an unauthorized
 * listing: criteria, suppression and gates are re-applied server-side every
 * time. But it DOES control which authorized rows a broker is told belong to
 * the next page, and in a brokerage search engine silently changing or skipping
 * the result sequence is itself an integrity problem.
 *
 * The earlier "tampered" tests only covered malformed shapes — wrong types,
 * negative numbers, bad versions. A token whose position is edited to another
 * STRUCTURALLY VALID value and re-encoded was accepted, which is the case a
 * hostile or buggy caller would actually produce.
 */
describe('a structurally valid but EDITED token is refused', () => {
  const edit = (over: Record<string, unknown>) => {
    // Decode the payload, edit it, re-encode — and keep the ORIGINAL seal, which
    // is precisely what an attacker or a buggy client would produce.
    const [payload, sealPart] = token().split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const edited = Buffer.from(JSON.stringify({ ...decoded, ...over }), 'utf8').toString(
      'base64url',
    );
    return `${edited}.${sealPart}`;
  };

  it.each([
    ['the keyset boundary VALUE was moved', { sortValue: 1 }],
    ['the boundary ListingKey was moved', { lastListingKey: '9999999999' }],
    ['the survivor position moved', { survivorsConsumed: 5 }],
    ['the boundary keys were swapped', { tail: ['1', '2'] }],
    ['the traversal phase was flipped', { phase: 'NULLS' }],
    ['the sort key was swapped', { sortKey: 'price_asc' }],
  ])('%s', (_label, over) => {
    // All of these keep `fp` intact and re-encode cleanly, so nothing about the
    // SHAPE is wrong. Only integrity over the payload catches them.
    expect(() => decodeContinuation(edit(over), FP)).toThrow(InvalidContinuationError);
  });
});

describe('the question fingerprint binds every result-sequence input', () => {
  it('page size is part of the identity, not just filter and sort', () => {
    // Page size changes what a page IS, so a position captured at 20 rows a
    // page does not describe the same sequence at 50.
    expect(continuationFingerprint(FILTER, SORT, 20)).not.toBe(
      continuationFingerprint(FILTER, SORT, 50),
    );
  });

  it('the same three inputs always give the same fingerprint', () => {
    expect(continuationFingerprint(FILTER, SORT, 20)).toBe(
      continuationFingerprint(FILTER, SORT, 20),
    );
  });
});

describe('the integrity limitation is DECLARED, not glossed over', () => {
  it('the module records that a keyed secret is still required', () => {
    // The repo has exactly three HMAC authorities — reset-token,
    // unsubscribe-token and listing-token — and every one is business-specific.
    // Reusing an unsubscribe secret to seal a search cursor would be a
    // separation-of-concerns violation, and adding an env var is a protected
    // boundary. So the requirement is recorded rather than the gap being
    // described as closed.
    const src = readFileSync(
      resolve(__dirname, '..', 'continuation.ts'),
      'utf8',
    );
    expect(src).toMatch(/PROTECTED BOUNDARY/);
    expect(src).toMatch(/SEARCH_CONTINUATION_SECRET/);
  });
});

/**
 * THE PAGE A TOKEN DESCRIBES IS ARITHMETIC, NOT A CALLER'S ASSERTION.
 *
 * The token was sealed, but the `page` parameter travelled beside it unchecked.
 * A valid page-1 continuation sent with `page=99` would have returned the next
 * rows and labelled them page 99 — the seal protects the payload, and the page
 * number was never in the payload.
 */
describe('the page is derived from the sealed survivor position', () => {
  it.each([
    [0, 50, 1],
    [50, 50, 2],
    [100, 50, 3],
    [1_000, 20, 51],
  ])('survivorsConsumed=%p at pageSize=%p is page %p', (consumed, size, page) => {
    expect(expectedPageFor(consumed, size)).toBe(page);
  });

  it('an UNFINISHED page stays on itself', () => {
    // 20 survivors consumed at 50 to a page is still page 1, so the server
    // continues assembling page 1 rather than letting the caller move on to
    // page 2 with a 20-row page 1 behind them.
    expect(expectedPageFor(20, 50)).toBe(1);
    expect(expectedPageFor(49, 50)).toBe(1);
    expect(expectedPageFor(50, 50)).toBe(2);
  });
});
