/// <reference types="jest" />
/**
 * AN UNRESOLVED CHECKBOX VALUE MUST REACH THE BROWSER AS A NAMED 400.
 *
 * `checkboxFieldOData()` throws `UnsupportedCheckboxCriterionError` so the
 * registry can carry a per-value REASON. But `idxSearchErrorResponse()` only
 * classified three error types, so this one fell through to:
 *
 *     502 { error: "Search failed. Please try again later." }
 *
 * The contract promised "fail locally by criterion/value name". At the route
 * boundary it did not: the broker got a generic server failure that invites a
 * retry of the exact action that cannot succeed, and the reason the registry
 * carefully computed was discarded.
 *
 * A filter-unit test could never have caught this — the throw was correct, the
 * CLASSIFIER was wrong. That is why this test exercises the route's error
 * response rather than the filter.
 */
import { idxSearchErrorResponse } from '@/app/api/idx/search/route';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { UnsupportedCheckboxCriterionError } from '@/lib/search/canonical/checkbox-criteria';

/** Run the real filter and hand whatever it throws to the real classifier. */
function routeResponseFor(checkboxFilters: Record<string, string[]>) {
  try {
    buildCrmIdxODataFilter(new URLSearchParams({ checkboxFilters: JSON.stringify(checkboxFilters) }));
    return null;
  } catch (err) {
    return idxSearchErrorResponse(err);
  }
}

describe('checkbox errors join the canonical unsupported-criterion protocol', () => {
  it('an unresolved VALUE becomes 400 UNSUPPORTED_CRITERION, not 502', () => {
    const res = routeResponseFor({ PetsAllowed: ['CatsOnly'] });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect(res!.body.code).toBe('UNSUPPORTED_CRITERION');
  });

  it('names the CANONICAL criterion and the offending value', () => {
    // The request arrives under the provider-shaped legacy key `PetsAllowed`,
    // and the refusal names `pets` — the canonical business identity — rather
    // than the legacy family name `pet_policy` it used to report.
    //
    // That is the rename working. A client may still SEND a legacy alias; what
    // it gets back is the one identity that owns the question, so two names
    // never circulate for one broker control. The offending value is unchanged
    // and remains the actionable half.
    const res = routeResponseFor({ PetsAllowed: ['CatsOnly'] })!;
    expect(String(res.body.criterion)).toContain('pets');
    expect(String(res.body.criterion)).not.toContain('pet_policy');
    expect(res.body.unsupportedValues).toEqual(['CatsOnly']);
  });

  it('carries the registry reason through to the client', () => {
    // "unresolved" and "invalid" are different facts and the broker needs to
    // know which one they hit.
    const res = routeResponseFor({ PetsAllowed: ['CatsOnly'] })!;
    expect(String(res.body.detail)).toMatch(/CatsOk/);
  });

  it('a provider-SUPPRESSED field reports suppression, not an unmapped value', () => {
    const res = routeResponseFor({ PropertyCondition: ['Excellent'] })!;
    expect(res.status).toBe(400);
    expect(String(res.body.detail)).toMatch(/suppressed \(provider/i);
  });

  it('an unregistered field is also a named 400', () => {
    const res = routeResponseFor({ AttendanceType: ['DoormanFullTime'] })!;
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_CRITERION');
  });

  it('the generic 502 path is NOT taken for any checkbox criterion', () => {
    const cases: Record<string, string[]>[] = [
      { PetsAllowed: ['CatsOnly'] },
      { PropertyCondition: ['Excellent'] },
      { AttendanceType: ['x'] },
      { View: ['Park'] },
    ];
    for (const cb of cases) {
      const res = routeResponseFor(cb);
      expect(res!.status).not.toBe(502);
    }
  });

  it('classifies the error type directly, so the mapping is not incidental', () => {
    const res = idxSearchErrorResponse(
      new UnsupportedCheckboxCriterionError('checkboxFilters.view', ['Park'], 'not a member'),
    );
    expect(res.status).toBe(400);
    expect(res.body.criterion).toBe('checkboxFilters.view');
  });

  it('a VERIFIED value produces no error at all', () => {
    expect(routeResponseFor({ View: ['City'] })).toBeNull();
  });
});
