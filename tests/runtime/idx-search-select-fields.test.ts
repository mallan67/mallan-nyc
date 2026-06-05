/// <reference types="jest" />
/**
 * Codex review on PR #352 — pin `SEARCH_SELECT_FIELDS` DownPaymentAssistance coverage.
 *
 * Background: PR #352 migrated the DownPaymentAssistance read path to Property
 * (`mapTrestleToCrmListing` reads `DownPaymentAssistanceAmount`/`Count` Property-first)
 * and added both fields to the DEFAULT `IDX_PLUS_SELECT_FIELDS`. But the live CRM
 * search route `/api/idx/search` does NOT use the default — it passes its own
 * route-local `SEARCH_SELECT_FIELDS`, which still omitted the two fields. With
 * neither the Property select carrying them nor a CustomProperty `$expand`, the
 * mapper mapped both to `null` on every `/api/idx/search` response.
 *
 * The #352 suite stayed green because it only asserted the DEFAULT select
 * (`IDX_PLUS_SELECT_FIELDS`), never the route-local list the live path uses. These
 * tests pin the REAL `/api/idx/search` select so the route cannot silently regress
 * — independently of the default field set.
 */

import { SEARCH_SELECT_FIELDS } from '@/app/api/idx/search/route';
import { IDX_PLUS_SELECT_FIELDS } from '@/lib/idx/trestle-mapper';

describe('SEARCH_SELECT_FIELDS · DownPaymentAssistance coverage (Codex #352)', () => {
  it('includes DownPaymentAssistanceAmount (live Property field)', () => {
    expect(SEARCH_SELECT_FIELDS).toContain('DownPaymentAssistanceAmount');
  });

  it('includes DownPaymentAssistanceCount (live Property field)', () => {
    expect(SEARCH_SELECT_FIELDS).toContain('DownPaymentAssistanceCount');
  });

  it('pins the REAL route path independently of the default select', () => {
    // SEARCH_SELECT_FIELDS is the route-local list the live `/api/idx/search`
    // path actually passes to fetchFromTrestle — a different array object than
    // the default IDX_PLUS_SELECT_FIELDS. Asserting the default is NOT enough
    // (that is exactly how the #352 run missed this gap), so assert this list
    // directly and prove it is its own array, not an alias of the default.
    expect(Array.isArray(SEARCH_SELECT_FIELDS)).toBe(true);
    expect(SEARCH_SELECT_FIELDS).not.toBe(IDX_PLUS_SELECT_FIELDS);
    for (const field of ['DownPaymentAssistanceAmount', 'DownPaymentAssistanceCount']) {
      expect(SEARCH_SELECT_FIELDS).toContain(field);
    }
  });

  it('contains no duplicate field names', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const field of SEARCH_SELECT_FIELDS) {
      if (seen.has(field)) dupes.push(field);
      seen.add(field);
    }
    expect(dupes).toEqual([]);
  });
});
