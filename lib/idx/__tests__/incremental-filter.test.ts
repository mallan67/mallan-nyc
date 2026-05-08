/**
 * Layer 1 of the PhotosChangeTimestamp gap fix.
 *
 * The incremental sync cursor must include both ModificationTimestamp AND
 * PhotosChangeTimestamp so we don't miss broker photo uploads where Trestle
 * bumps PCT but not MT (empirically 18,411 rows in production as of
 * 2026-05-08).
 */

import { buildIncrementalFilter } from '../fetch';

describe('buildIncrementalFilter — Layer 1 (PCT cursor)', () => {
  const since = new Date('2026-05-01T00:00:00.000Z');
  const ts = since.toISOString();

  it('ORs ModificationTimestamp and PhotosChangeTimestamp in the cursor', () => {
    const filter = buildIncrementalFilter(since);
    expect(filter).toContain(`ModificationTimestamp gt ${ts}`);
    expect(filter).toContain(`PhotosChangeTimestamp gt ${ts}`);
    // The two timestamp clauses must be wrapped together in an OR — otherwise
    // a row whose PCT advanced but whose MT didn't would still be skipped.
    expect(filter).toMatch(
      /\(\s*ModificationTimestamp gt [^()]+ or PhotosChangeTimestamp gt [^()]+\s*\)/,
    );
  });

  it('preserves the sale type filter alongside the OR cursor', () => {
    const filter = buildIncrementalFilter(since, 'sale');
    expect(filter).toContain(`(ModificationTimestamp gt ${ts} or PhotosChangeTimestamp gt ${ts})`);
    expect(filter).toContain("PropertyType ne 'ResidentialLease'");
    expect(filter.indexOf('and')).toBeGreaterThan(-1);
  });

  it('preserves the rent type filter alongside the OR cursor', () => {
    const filter = buildIncrementalFilter(since, 'rent');
    expect(filter).toContain(`(ModificationTimestamp gt ${ts} or PhotosChangeTimestamp gt ${ts})`);
    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
  });

  it('emits no type filter when listingType is omitted', () => {
    const filter = buildIncrementalFilter(since);
    expect(filter).not.toContain('PropertyType');
  });
});
