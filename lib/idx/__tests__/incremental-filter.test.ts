/**
 * Property incremental cursor — ModificationTimestamp-only, keyset resume.
 *
 * SUPERSEDES the Layer 1 PCT-OR contract this file used to assert.
 *
 * The old contract ORed both source clocks against ONE scalar cursor:
 *   `(ModificationTimestamp gt T or PhotosChangeTimestamp gt T)`
 * It was introduced to stop missing broker photo uploads (18,411 affected rows,
 * 2026-05-08 audit) and the gap it closed was real. But a single scalar cannot
 * be a correct position for two independent clocks — it is always wrong for at
 * least one of them. The PCT dimension now has its own cursor and owner
 * (`media_sync_state.{last_photos_change,last_listing_key}` via runMediaSync),
 * so Property keeps only the material clock.
 *
 * The tests below therefore assert the OPPOSITE of the old ones on purpose:
 * PhotosChangeTimestamp must be ABSENT from this filter.
 */

import { buildIncrementalFilter, PROPERTY_KEYSET_ORDERBY } from '../fetch';

describe('buildIncrementalFilter — ModificationTimestamp-only cursor', () => {
  const since = new Date('2026-05-01T00:00:00.000Z');
  const ts = since.toISOString();

  it('filters on ModificationTimestamp alone', () => {
    const filter = buildIncrementalFilter(since);
    expect(filter).toContain(`ModificationTimestamp gt ${ts}`);
  });

  it('does NOT reference PhotosChangeTimestamp — that dimension has its own cursor', () => {
    // Regression guard for the two-clocks-one-scalar defect. If this ever fails,
    // Property has re-adopted the media trigger and the media lane's cursor is
    // being double-counted.
    expect(buildIncrementalFilter(since)).not.toContain('PhotosChangeTimestamp');
    expect(buildIncrementalFilter(since, 'sale')).not.toContain('PhotosChangeTimestamp');
    expect(buildIncrementalFilter(since, 'rent', 'K1')).not.toContain('PhotosChangeTimestamp');
  });

  it('preserves the sale type filter', () => {
    const filter = buildIncrementalFilter(since, 'sale');
    expect(filter).toContain(`(ModificationTimestamp gt ${ts})`);
    expect(filter).toContain("PropertyType ne 'ResidentialLease'");
  });

  it('preserves the rent type filter', () => {
    const filter = buildIncrementalFilter(since, 'rent');
    expect(filter).toContain(`(ModificationTimestamp gt ${ts})`);
    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
  });

  it('emits no type filter when listingType is omitted', () => {
    expect(buildIncrementalFilter(since)).not.toContain('PropertyType');
  });
});

describe('buildIncrementalFilter — keyset tie-breaker', () => {
  const since = new Date('2026-05-01T00:00:00.000Z');
  const ts = since.toISOString();

  it('emits the strict-total-order resume predicate when a tie-breaker is supplied', () => {
    // (MT > T) OR (MT = T AND ListingKey > K) — the only shape that can traverse
    // a same-timestamp cluster larger than the page cap without stalling or
    // skipping. Production carries a 797-row cluster at one MT; the cap is 500.
    const filter = buildIncrementalFilter(since, undefined, '1179924995');
    expect(filter).toBe(
      `(ModificationTimestamp gt ${ts} or (ModificationTimestamp eq ${ts} and ListingKey gt '1179924995'))`,
    );
  });

  it('degrades to a plain timestamp cursor when the tie-breaker is null or omitted', () => {
    // A NULL sync_state.last_listing_key must behave exactly as before the
    // column existed, so applying the migration alone changes no behaviour.
    const expected = `(ModificationTimestamp gt ${ts})`;
    expect(buildIncrementalFilter(since)).toBe(expected);
    expect(buildIncrementalFilter(since, undefined, null)).toBe(expected);
    expect(buildIncrementalFilter(since, undefined, '')).toBe(expected);
  });

  it('escapes a single quote in the ListingKey so the OData literal cannot break out', () => {
    const filter = buildIncrementalFilter(since, undefined, "it's");
    expect(filter).toContain("ListingKey gt 'it''s'");
  });

  it('keeps the tie-breaker and the type filter independent', () => {
    const filter = buildIncrementalFilter(since, 'rent', 'K9');
    expect(filter).toContain("ListingKey gt 'K9'");
    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
    // Cursor predicate stays parenthesised as ONE unit, so the trailing
    // `and PropertyType ...` cannot bind to the inner OR and widen the result.
    expect(filter.startsWith('(')).toBe(true);
    expect(filter).toMatch(/^\([^]*\) and PropertyType eq 'ResidentialLease'$/);
  });
});

describe('PROPERTY_KEYSET_ORDERBY', () => {
  it('is ascending on both cursor components', () => {
    // ASC is load-bearing: under the module default (`ModificationTimestamp
    // desc`) a capped run consumes the NEWEST rows and the cursor jumps to the
    // newest MT, making every older unprocessed row unreachable on every
    // subsequent capped run.
    expect(PROPERTY_KEYSET_ORDERBY).toBe('ModificationTimestamp asc,ListingKey asc');
    expect(PROPERTY_KEYSET_ORDERBY).not.toContain('desc');
  });

  it('orders by the same two fields the resume predicate compares', () => {
    // The filter and the ordering must agree or the keyset is unsound.
    const filter = buildIncrementalFilter(new Date('2026-05-01T00:00:00.000Z'), undefined, 'K');
    for (const field of PROPERTY_KEYSET_ORDERBY.split(',').map((p) => p.trim().split(' ')[0])) {
      expect(filter).toContain(field);
    }
  });
});
