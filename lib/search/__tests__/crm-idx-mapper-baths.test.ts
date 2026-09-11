/// <reference types="jest" />
/**
 * Bath semantics of the shared backend DTO mapper.
 *
 * Rule (2026-09-05): baths = BathroomsFull + 0.5 x BathroomsHalf only when both
 * components are present and numeric; otherwise null. BathroomsTotalInteger is
 * never the source and never a fallback. fullBaths and halfBaths preserve null.
 * Live Cotality declares all three fields nullable; the Validator proved Full and
 * Half complete on the current active universes only, which does not license
 * reading null as zero anywhere.
 */
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

const base = { ListingId: 'RLS-TEST', PropertyType: 'Residential', ListPrice: 1 };
const map = (raw: Record<string, unknown>) => mapTrestleToCrmListing({ ...base, ...raw }, 0) as { baths: number | null; fullBaths: number | null; halfBaths: number | null };

describe('canonical bath value', () => {
  test('Full=2, Half=1 -> 2.5', () => {
    expect(map({ BathroomsFull: 2, BathroomsHalf: 1 })).toMatchObject({ baths: 2.5, fullBaths: 2, halfBaths: 1 });
  });
  test('Full=4, Half=2, TotalInteger=5 -> 5.0 from the components; TotalInteger ignored', () => {
    expect(map({ BathroomsFull: 4, BathroomsHalf: 2, BathroomsTotalInteger: 5 })).toMatchObject({ baths: 5, fullBaths: 4, halfBaths: 2 });
  });
  test('Full=null, Half=1 -> baths null; halfBaths kept, fullBaths null', () => {
    expect(map({ BathroomsFull: null, BathroomsHalf: 1 })).toMatchObject({ baths: null, fullBaths: null, halfBaths: 1 });
  });
  test('Full=2, Half=null -> baths null; fullBaths kept, halfBaths null', () => {
    expect(map({ BathroomsFull: 2, BathroomsHalf: null })).toMatchObject({ baths: null, fullBaths: 2, halfBaths: null });
  });
  test('both null -> all null, even when TotalInteger is present', () => {
    expect(map({ BathroomsFull: null, BathroomsHalf: null, BathroomsTotalInteger: 3 })).toMatchObject({ baths: null, fullBaths: null, halfBaths: null });
  });
  test('explicit zeros Full=0, Half=0 -> 0, not null', () => {
    expect(map({ BathroomsFull: 0, BathroomsHalf: 0 })).toMatchObject({ baths: 0, fullBaths: 0, halfBaths: 0 });
  });
  test('absent keys behave as null, not as zero', () => {
    expect(map({})).toMatchObject({ baths: null, fullBaths: null, halfBaths: null });
  });
  test('non-numeric strings are unknown, not zero', () => {
    expect(map({ BathroomsFull: 'n/a', BathroomsHalf: 1 })).toMatchObject({ baths: null, fullBaths: null, halfBaths: 1 });
  });
});
