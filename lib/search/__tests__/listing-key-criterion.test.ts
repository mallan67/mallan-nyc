import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

/**
 * LISTINGKEY AND LISTINGID ARE DIFFERENT PROVIDER FIELDS.
 *
 * Cotality declares both. `crm-idx-mapper.ts:217` maps the Search row `id` to
 * ListingKey and keeps ListingId beside it as `lid` / `providerListingId`. Their
 * value spaces do not overlap — a live pair reads ListingKey "1189389648"
 * against ListingId "RLS20112214".
 *
 * Probed live 2026-09-01 against api.cotality.com:
 *
 *   $filter=ListingKey eq '1189389648'                            -> count 1
 *   $filter=(ListingKey eq '1189389648' or ListingKey eq '1189389647') -> count 2
 *   $filter=ListingId  eq '1189389648'                            -> count 0
 *
 * The third is what a caller gets for sending Search ids to the wrong
 * criterion: an empty result, no error, and a feature that silently never runs.
 */
describe('the listingKey criterion renders the ListingKey domain', () => {
  const f = (qs: string) => buildCrmIdxODataFilter(new URLSearchParams(qs));

  it('a single key renders ListingKey equality, never ListingId', () => {
    const out = f('listingKey=1189389648');
    expect(out).toContain("ListingKey eq '1189389648'");
    expect(out).not.toContain('ListingId');
  });

  it('several keys render an OR chain — the shape proven supported live', () => {
    const out = f('listingKey=1189389648,1189389647');
    expect(out).toContain("(ListingKey eq '1189389648' or ListingKey eq '1189389647')");
  });

  it('listingId still renders the ListingId domain — the two never merge', () => {
    const out = f('listingId=RLS20112214');
    expect(out).toContain("ListingId eq 'RLS20112214'");
    expect(out).not.toContain('ListingKey');
  });

  it('a Mallan-local identifier is REFUSED, not sent to the provider', () => {
    // An SL-/RL- listing has no provider key; asking Cotality about it is
    // asking the wrong system.
    expect(() => f('listingKey=SL-0004')).toThrow();
    expect(() => f('listingKey=1189389648,RL-0007')).toThrow();
  });

  it('quotes in a key are escaped, so a value cannot alter the filter', () => {
    const out = f("listingKey=" + encodeURIComponent("12'34"));
    expect(out).toContain("ListingKey eq '12''34'");
  });
});
