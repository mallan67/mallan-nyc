/// <reference types="jest" />
/**
 * CONTINUATION — so the read budget bounds WORK, not INVENTORY.
 *
 * A budget that bounds one request is correct. A budget that makes result
 * 60,001 permanently unreachable is a hidden maximum searchable inventory, and
 * the authorized provider population is already around 591,000 rows.
 *
 * The token is a POSITION, not an authority. Every request re-applies the whole
 * chain from its own parameters — canonical criteria, Mallan return-copy
 * suppression, distribution gates, provider-row dedupe — so a continuation
 * cannot widen a search, skip a gate, or reach a listing the caller could not
 * otherwise reach. That is why it carries no secret: there is nothing worth
 * forging, and adding a signing key would mean an env change for no security
 * gain. A tampered position yields a wrong page of the caller's OWN search.
 *
 * It is still fingerprint-validated, because the failure that actually happens
 * is mundane: a token from a different search, or from before the sort changed,
 * silently producing a page of the wrong universe.
 */
import {
  CONTINUATION_BOUNDARY_TAIL,
  InvalidContinuationError,
  continuationFingerprint,
  decodeContinuation,
  encodeContinuation,
  nextContinuation,
} from '@/lib/search/continuation';

const FILTER = "(StandardStatus eq 'Active') and CityRegion eq 'Manhattan'";
const SORT = 'ListPrice desc, ListingKey asc';
const FP = continuationFingerprint(FILTER, SORT);

const token = (over: Partial<Record<string, unknown>> = {}) =>
  nextContinuation({
    fingerprint: FP,
    providerOffset: 60_000,
    survivorsConsumed: 1_000,
    pageRowKeys: ['K1', 'K2', 'K3'],
    ...over,
  } as any);

describe('a continuation round-trips its position', () => {
  it('carries the provider offset and survivors consumed', () => {
    const c = decodeContinuation(token(), FP);
    expect(c.providerOffset).toBe(60_000);
    expect(c.survivorsConsumed).toBe(1_000);
  });

  it('carries a bounded tail of boundary keys', () => {
    const many = Array.from({ length: 50 }, (_, i) => `K${i}`);
    const c = decodeContinuation(token({ pageRowKeys: many }), FP);
    expect(c.tail).toHaveLength(CONTINUATION_BOUNDARY_TAIL);
    expect(c.tail[c.tail.length - 1]).toBe('K49');
  });

  it('a short page still hands on a usable boundary', () => {
    // Carrying the previous tail forward matters when a page yields one row:
    // otherwise the boundary shrinks to nothing exactly when it is needed.
    const t = nextContinuation({
      fingerprint: FP,
      providerOffset: 65_000,
      survivorsConsumed: 1_050,
      pageRowKeys: ['K99'],
      previousTail: ['K90', 'K91', 'K92'],
    });
    expect(decodeContinuation(t, FP).tail).toEqual(['K90', 'K91', 'K92', 'K99']);
  });
});

describe('a continuation belongs to ONE question', () => {
  it('is rejected when the criteria change', () => {
    const other = continuationFingerprint(FILTER + " and BedroomsTotal ge 2", SORT);
    expect(() => decodeContinuation(token(), other)).toThrow(InvalidContinuationError);
  });

  it('is rejected when the SORT changes', () => {
    // Sort decides the sequence, so a position in one order means nothing in
    // another — this is how a resumed page silently returns unrelated rows.
    const other = continuationFingerprint(FILTER, 'ListPrice asc, ListingKey asc');
    expect(() => decodeContinuation(token(), other)).toThrow(/different search or sort order/);
  });

  it('the fingerprint changes when either input changes', () => {
    expect(continuationFingerprint(FILTER, SORT)).toBe(FP);
    expect(continuationFingerprint(FILTER + ' ', SORT)).not.toBe(FP);
    expect(continuationFingerprint(FILTER, SORT + ' ')).not.toBe(FP);
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
    ['a negative provider offset', { providerOffset: -1 }],
    ['a fractional provider offset', { providerOffset: 1.5 }],
    ['a negative survivor position', { survivorsConsumed: -5 }],
    ['a non-numeric offset', { providerOffset: '60000' }],
    ['a wrong version', { v: 99 }],
    ['a missing fingerprint', { fp: '' }],
    ['malformed boundary keys', { tail: [1, 2, 3] }],
  ])('%s is refused', (_label, over) => {
    const raw = { v: 1, providerOffset: 10, survivorsConsumed: 5, tail: ['K1'], fp: FP, ...over };
    const bad = Buffer.from(JSON.stringify(raw), 'utf8').toString('base64url');
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
    const decoded = JSON.parse(Buffer.from(token(), 'base64url').toString('utf8'));
    expect(Object.keys(decoded).sort()).toEqual(['fp', 'providerOffset', 'survivorsConsumed', 'tail', 'v']);
    expect(JSON.stringify(decoded)).not.toContain('StandardStatus');
    expect(JSON.stringify(decoded)).not.toContain('Manhattan');
  });
});
