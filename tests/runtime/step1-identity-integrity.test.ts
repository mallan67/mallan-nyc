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
 * RETARGETED 2026-08-24. These cases previously admitted a row carrying only
 * `ListingId` or `SourceSystemKey`. Commit 21b0adc0 closed that: live
 * authenticated `$metadata` declares `Property.ListingKey` String(20)
 * Nullable=false, while `ListingId` is separately nullable and
 * `SourceSystemKey` is provider lineage. Neither may impersonate `ListingKey`,
 * so neither can establish identity — asserting that they do would re-authorise
 * the exact substitution `listingIdentity()` exists to prevent.
 *
 * `ListingKey` is Nullable=false, so an absent one is a provider integrity
 * failure rather than a legitimate state — which is why it is excluded loudly
 * and counted, not filtered silently.
 */
import { partitionByListingIdentity } from '@/app/api/idx/search/route';

describe('partitionByListingIdentity', () => {
  it('admits rows carrying a provider ListingKey', () => {
    const out = partitionByListingIdentity([
      { ListingKey: '1183681390' },
      { ListingKey: '1183681391' },
    ]);
    expect(out.usable).toHaveLength(2);
    expect(out.identityless).toBe(0);
  });

  it('excludes a row with no ListingKey', () => {
    const out = partitionByListingIdentity([{ ListPrice: 1250000 }]);
    expect(out.usable).toHaveLength(0);
    expect(out.identityless).toBe(1);
  });

  it('treats an empty-string ListingKey as no identity', () => {
    const out = partitionByListingIdentity([{ ListingKey: '' }]);
    expect(out.usable).toHaveLength(0);
    expect(out.identityless).toBe(1);
  });

  it('refuses to let ListingId or SourceSystemKey stand in for ListingKey', () => {
    // The substitution 21b0adc0 removed. A row carrying only these is
    // unidentifiable, and admitting it would put a row we cannot key into the
    // authoritative universe under a borrowed identifier.
    const out = partitionByListingIdentity([
      { ListingId: 'RLS20000001' },
      { SourceSystemKey: '1183681390' },
    ]);
    expect(out.usable).toHaveLength(0);
    expect(out.identityless).toBe(2);
  });

  it('counts the exclusions so the failure is visible, not silent', () => {
    const out = partitionByListingIdentity([
      { ListingKey: '1183681390' },
      {},
      { ListPrice: 999 },
      { ListingKey: '1183681391' },
    ]);
    expect(out.usable).toHaveLength(2);
    expect(out.identityless).toBe(2);
  });

  it('preserves order and identity of the admitted rows', () => {
    const a = { ListingKey: 'A' };
    const b = { ListingKey: 'B' };
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
