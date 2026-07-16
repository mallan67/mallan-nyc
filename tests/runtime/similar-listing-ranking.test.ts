/// <reference types="jest" />
/**
 * Similar-listing ranking helper (lib/listings/similar-listing-ranking.ts) and its
 * wiring into GET /api/listings/similar.
 *
 * Behavioral coverage for the ranking rules: bedroom match, price band, price/location
 * proximity scoring, and the top-N ordering. Plus a source guard proving the endpoint
 * actually USES the helper (previously it ordered by list_price DESC and ignored beds).
 */
import fs from 'fs';
import path from 'path';
import {
  getSimilarityPriceBand,
  isBedroomMatch,
  similarityScore,
  rankSimilarListings,
  type SimilarityTarget,
  type SimilarityCandidate,
} from '@/lib/listings/similar-listing-ranking';

describe('getSimilarityPriceBand', () => {
  it('sale band is 0.7x–1.3x, rounded, min 1', () => {
    expect(getSimilarityPriceBand(1_000_000, false)).toEqual({ min: 700_000, max: 1_300_000 });
  });
  it('rental band is tighter (0.75x–1.25x)', () => {
    expect(getSimilarityPriceBand(4_000, true)).toEqual({ min: 3_000, max: 5_000 });
  });
  it('never returns a min below 1', () => {
    expect(getSimilarityPriceBand(0, false).min).toBeGreaterThanOrEqual(1);
  });
});

describe('isBedroomMatch', () => {
  it('studio (0) matches only 0 or 1 bed', () => {
    expect(isBedroomMatch(0, 0)).toBe(true);
    expect(isBedroomMatch(0, 1)).toBe(true);
    expect(isBedroomMatch(0, 2)).toBe(false);
  });
  it('otherwise matches within ±1 bed', () => {
    expect(isBedroomMatch(2, 1)).toBe(true);
    expect(isBedroomMatch(2, 3)).toBe(true);
    expect(isBedroomMatch(2, 4)).toBe(false);
  });
  it('null candidate beds never match', () => {
    expect(isBedroomMatch(2, null)).toBe(false);
  });
});

describe('similarityScore', () => {
  const target: SimilarityTarget = { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' };

  it('returns +Infinity for a bedroom mismatch (excluded from results)', () => {
    expect(similarityScore(target, { beds: 5, price: 1_000_000, postalCode: '10011' })).toBe(Number.POSITIVE_INFINITY);
  });
  it('returns +Infinity for a null/zero/invalid price', () => {
    expect(similarityScore(target, { beds: 2, price: 0, postalCode: '10011' })).toBe(Number.POSITIVE_INFINITY);
  });
  it('a closer price scores lower than a farther price', () => {
    const near = similarityScore(target, { beds: 2, price: 1_050_000, postalCode: '10011' });
    const far = similarityScore(target, { beds: 2, price: 1_250_000, postalCode: '10011' });
    expect(near).toBeLessThan(far);
  });
  it('same ZIP scores lower than same neighborhood, which scores lower than neither', () => {
    const sameZip = similarityScore(target, { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' });
    const sameHood = similarityScore(target, { beds: 2, price: 1_000_000, postalCode: '10003', neighborhood: 'Chelsea' });
    const neither = similarityScore(target, { beds: 2, price: 1_000_000, postalCode: '10003', neighborhood: 'Tribeca' });
    expect(sameZip).toBeLessThan(sameHood);
    expect(sameHood).toBeLessThan(neither);
  });
});

describe('rankSimilarListings', () => {
  const target: SimilarityTarget = { beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea' };
  const cand = (over: Partial<SimilarityCandidate> & { id: string }): SimilarityCandidate & { id: string } => ({
    beds: 2, price: 1_000_000, postalCode: '10011', neighborhood: 'Chelsea', ...over,
  });

  it('orders by ascending similarity score (closest first)', () => {
    const ranked = rankSimilarListings(
      [
        cand({ id: 'far', price: 1_290_000 }),
        cand({ id: 'exact', price: 1_000_000 }),
        cand({ id: 'near', price: 1_050_000 }),
      ],
      target,
    );
    expect(ranked.map((c) => c.id)).toEqual(['exact', 'near', 'far']);
  });

  it('drops bedroom-mismatches and null-beds entirely', () => {
    const ranked = rankSimilarListings(
      [
        cand({ id: 'match', beds: 2 }),
        cand({ id: 'mismatch', beds: 5 }),
        cand({ id: 'nullbeds', beds: null }),
      ],
      target,
    );
    expect(ranked.map((c) => c.id)).toEqual(['match']);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => cand({ id: `c${i}`, price: 1_000_000 + i * 1000 }));
    expect(rankSimilarListings(many, target, 6)).toHaveLength(6);
  });

  it('a same-ZIP 2-bed outranks a different-ZIP 2-bed at the same price', () => {
    const ranked = rankSimilarListings(
      [
        cand({ id: 'otherZip', postalCode: '10003', neighborhood: 'Tribeca' }),
        cand({ id: 'sameZip', postalCode: '10011' }),
      ],
      target,
    );
    expect(ranked[0].id).toBe('sameZip');
  });
});

describe('GET /api/listings/similar wires the ranking helper', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/listings/similar/route.ts'),
    'utf8',
  );
  it('imports the ranking helper', () => {
    expect(src).toMatch(/from '@\/lib\/listings\/similar-listing-ranking'/);
  });
  it('reads the beds param and builds a SimilarityTarget', () => {
    expect(src).toMatch(/searchParams\.get\('beds'\)/);
    expect(src).toMatch(/const target: SimilarityTarget/);
  });
  it('orders both the DB and Trestle candidate sets via rankSimilarListings', () => {
    const uses = src.match(/rankSimilarListings\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
  it('uses the helper price band instead of the old crude 0.3x–1.7x window', () => {
    expect(src).toMatch(/getSimilarityPriceBand\(price, isRental\)/);
    expect(src).not.toMatch(/price \* 0\.3|price \* 1\.7/);
  });
});
