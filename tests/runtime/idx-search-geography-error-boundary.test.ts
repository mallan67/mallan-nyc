/// <reference types="jest" />
/**
 * A DEAD NEIGHBOURHOOD OR BOROUGH MUST REACH THE BROWSER AS A NAMED 400.
 *
 * `geography.ts` throws `UnsupportedGeographyError` so a value with no live
 * Cotality counterpart fails loudly instead of producing a syntactically valid
 * filter that matches zero rows under HTTP 200. That refusal is correct and it
 * was NOT REACHING THE BROKER: `idxSearchErrorResponse()` classified the search,
 * checkbox, status and property-sub-type errors and not this one, so it fell
 * through to
 *
 *     502 { error: "Search failed. Please try again later." }
 *
 * The difference matters more here than almost anywhere else. A 502 invites a
 * retry of the exact action that cannot succeed, and it hides WHICH of several
 * selected neighbourhoods was the dead one — the single fact the broker needs in
 * order to fix their own search.
 *
 * THE DEAD VALUE MUST BE ONE THE FEED GENUINELY LACKS. `Gramercy` reads like
 * one and is not — 930 rows across all statuses. This suite was briefly written
 * against it, which was the on-market-allowlist defect appearing in test form.
 *
 * This exercises the route's CLASSIFIER against the real geography module, not a
 * mock, because the throw was already right — the classifier was what was wrong.
 */
import { idxSearchErrorResponse } from '@/app/api/idx/search/route';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { UnsupportedGeographyError, neighborhoodOData } from '@/lib/search/canonical/geography';

/** Run the real filter and hand whatever it throws to the real classifier. */
function routeResponseFor(params: Record<string, string>) {
  try {
    buildCrmIdxODataFilter(new URLSearchParams(params));
    return null;
  } catch (err) {
    return idxSearchErrorResponse(err);
  }
}

describe('geography errors join the canonical unsupported-criterion protocol', () => {
  it('the module really does throw for a name the feed does not carry', () => {
    // Guard the guard. If geography stopped throwing, every assertion below
    // would pass vacuously by never producing an error at all.
    expect(() => neighborhoodOData(['Nonexistent Heights'])).toThrow(UnsupportedGeographyError);
    // …and a name that IS live must not throw. Without this the case above
    // passes for a refusal that rejects everything.
    expect(() => neighborhoodOData(['Gramercy'])).not.toThrow();
  });

  it('a dead neighbourhood becomes 400 UNSUPPORTED_CRITERION, not 502', () => {
    const res = routeResponseFor({ neighborhood: 'Nonexistent Heights' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect(res!.body.code).toBe('UNSUPPORTED_CRITERION');
  });

  it('names the criterion and WHICH value was dead', () => {
    // With several selected, the broker must be told which one to change.
    // `Yorkville` and `Tribeca` are live; the middle value is not a place.
    const res = routeResponseFor({ neighborhood: 'Yorkville,Zzzz Not A Place,Tribeca' });
    expect(res!.status).toBe(400);
    expect(res!.body.criterion).toBe('neighborhood');
    expect(res!.body.unsupportedValues).toEqual(['Zzzz Not A Place']);
  });

  it('an unknown borough is refused the same way', () => {
    const res = routeResponseFor({ borough: 'Hoboken' });
    expect(res!.status).toBe(400);
    expect(res!.body.code).toBe('UNSUPPORTED_CRITERION');
    expect(res!.body.criterion).toBe('borough');
    expect(res!.body.unsupportedValues).toEqual(['Hoboken']);
  });

  it('and a LIVE selection is not refused at all', () => {
    // The negative half. A classifier that turned every geography value into a
    // 400 would pass every test above while breaking Search completely.
    expect(routeResponseFor({ neighborhood: 'Tribeca' })).toBeNull();
    expect(routeResponseFor({ borough: 'Manhattan' })).toBeNull();
  });

  it('carries the reason, so the broker learns it is not a live Cotality value', () => {
    const res = routeResponseFor({ neighborhood: 'Nonexistent Heights' });
    expect(res!.body.detail).toMatch(/live Cotality value/i);
  });
});
