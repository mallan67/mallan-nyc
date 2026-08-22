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

/**
 * THE DIAGNOSTICS MUST CARRY THREE DISTINCT CONCEPTS.
 *
 * `gatedOut` was `result.totalFetched - displayable.length`, which folded
 * identity failures INTO the distribution-gate count — while `identityless` was
 * also reported separately. So an unidentifiable row was counted twice, and the
 * gate figure overstated how many rows a compliance gate actually rejected.
 *
 * The honest chain is:
 *
 *   provider rows fetched
 *     → identity failures
 *     → distribution-gate failures
 *     → returned rows
 *
 * and those three categories must account for every fetched row exactly once.
 */
import { searchIntegrityCounts } from '@/app/api/idx/search/route';

describe('searchIntegrityCounts', () => {
  it('separates identity failures from distribution-gate failures', () => {
    // 100 fetched, 4 unidentifiable, 90 of the remaining 96 pass the gates.
    const c = searchIntegrityCounts({ providerRowsFetched: 100, identityless: 4, displayable: 90 });
    expect(c.identityFailures).toBe(4);
    expect(c.distributionGateFailures).toBe(6); // 96 identified - 90 displayable
    expect(c.returnedRows).toBe(90);
  });

  it('does NOT fold identity failures into the gate count', () => {
    const c = searchIntegrityCounts({ providerRowsFetched: 100, identityless: 4, displayable: 90 });
    // The old expression gave 10 here — 4 identity failures counted a second time.
    expect(c.distributionGateFailures).not.toBe(10);
  });

  it('accounts for every fetched row exactly once', () => {
    for (const [fetched, idless, disp] of [[100, 4, 90], [200, 0, 200], [50, 50, 0], [7, 2, 5]]) {
      const c = searchIntegrityCounts({ providerRowsFetched: fetched, identityless: idless, displayable: disp });
      expect(c.identityFailures + c.distributionGateFailures + c.returnedRows).toBe(fetched);
    }
  });

  it('reports zero gate failures when nothing was gated, not a negative', () => {
    const c = searchIntegrityCounts({ providerRowsFetched: 10, identityless: 0, displayable: 10 });
    expect(c.distributionGateFailures).toBe(0);
  });
});
