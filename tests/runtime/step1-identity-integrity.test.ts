/// <reference types="jest" />
/**
 * A ROW WITHOUT PROVIDER IDENTITY MUST NOT ENTER THE AUTHORITATIVE UNIVERSE.
 *
 * `crm-idx-mapper` no longer fabricates `index + 1` as an id, so an identityless
 * row now maps to `id: null`. That is necessary but not sufficient — the row
 * would still be counted, rendered, selectable and reportable, just with a null
 * key. It has to be excluded at the route, and the exclusion has to be VISIBLE
 * rather than silent, because a provider row we cannot identify is an integrity
 * failure, not a filtered result.
 *
 * Live `$metadata`: `ListingId` and `SourceSystemKey` are both nullable strings,
 * so this is a legitimate provider state, not a hypothetical.
 */
import { partitionByListingIdentity } from '@/app/api/idx/search/route';

describe('partitionByListingIdentity', () => {
  it('admits rows carrying a provider identity', () => {
    const out = partitionByListingIdentity([
      { ListingId: 'RLS20000001' },
      { SourceSystemKey: '1183681390' },
    ]);
    expect(out.usable).toHaveLength(2);
    expect(out.identityless).toBe(0);
  });

  it('excludes a row with neither identifier', () => {
    const out = partitionByListingIdentity([{ ListPrice: 1250000 }]);
    expect(out.usable).toHaveLength(0);
    expect(out.identityless).toBe(1);
  });

  it('treats an empty-string identifier as no identifier', () => {
    const out = partitionByListingIdentity([{ ListingId: '', SourceSystemKey: '' }]);
    expect(out.usable).toHaveLength(0);
    expect(out.identityless).toBe(1);
  });

  it('counts the exclusions so the failure is visible, not silent', () => {
    const out = partitionByListingIdentity([
      { ListingId: 'RLS20000001' },
      {},
      { ListPrice: 999 },
      { SourceSystemKey: 'k' },
    ]);
    expect(out.usable).toHaveLength(2);
    expect(out.identityless).toBe(2);
  });

  it('preserves order and identity of the admitted rows', () => {
    const a = { ListingId: 'A' };
    const b = { ListingId: 'B' };
    const out = partitionByListingIdentity([a, {}, b]);
    expect(out.usable).toEqual([a, b]);
  });
});
