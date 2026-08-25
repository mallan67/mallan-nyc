/// <reference types="jest" />
/**
 * Fair Housing — the "Diplomats" CRM search filter must not exist.
 *
 * "Diplomats Allowed" is a national-origin / citizenship / immigration-status
 * proxy (protected under the NYC Human Rights Law). It was removed from the CRM
 * agent-search UI on 2026-07-07. These tests fail red if it is ever reintroduced
 * in the source form, the built bundle, or accepted as a server-side filter.
 *
 * Proof obligations (per the hotfix spec):
 *  1. absent from the UI source (search-form-and-results.html)
 *  2. absent from the served bundle (index-built.html)
 *  3. ignored server-side even if a client submits it (buildCrmIdxODataFilter)
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

const CRM = path.resolve(__dirname, '../../public/crm');
const read = (p: string) => readFileSync(path.join(CRM, p), 'utf8');

describe('Fair Housing — no "Diplomats" CRM search filter', () => {
  it('is absent from the search-form SOURCE', () => {
    const src = read('html/search-form-and-results.html');
    expect(src).not.toMatch(/DiplomatsAllowed/);
    // the visible label + its data-field="CRM" checkbox must both be gone
    expect(src).not.toMatch(/data-value="DiplomatsAllowed"/);
  });

  it('is absent from the served bundle (index-built.html)', () => {
    const built = read('index-built.html');
    expect(built).not.toMatch(/DiplomatsAllowed/);
  });

  it('leaves the non-protected sibling AdvertisingAllowed intact (scope guard)', () => {
    // We removed ONLY the protected-class control, not the whole data-field="CRM"
    // group — AdvertisingAllowed (advertising permission) is a legitimate concept.
    expect(read('html/search-form-and-results.html')).toMatch(/AdvertisingAllowed/);
  });
});

describe('Fair Housing — server drops a submitted Diplomats filter', () => {
  const buildWith = (checkboxFilters: Record<string, string[]>) => {
    const params = new URLSearchParams();
    params.set('checkboxFilters', JSON.stringify(checkboxFilters));
    return buildCrmIdxODataFilter(params);
  };

  /**
   * RETARGETED 2026-08-24 (48978094). These previously asserted that the
   * server SILENTLY DROPPED the submission and returned a clean filter string.
   * `buildCrmIdxODataFilter` now rejects any non-boolean checkbox field, so the
   * whole request fails closed instead.
   *
   * The Fair Housing obligation is unchanged and is in fact enforced more
   * strongly: the protected-class proxy must never become a provider criterion.
   * Rejecting the request guarantees that; dropping it merely happened to. The
   * assertions below therefore pin the OBLIGATION (no clause ever reaches
   * Cotality) rather than the mechanism.
   */
  const odataFor = (checkboxFilters: Record<string, string[]>): string | null => {
    try {
      return buildWith(checkboxFilters);
    } catch {
      // Rejected outright — no filter was produced, so nothing can reach the
      // provider. That satisfies the obligation.
      return null;
    }
  };

  it('never produces an OData clause for a {"CRM":["DiplomatsAllowed"]} submission', () => {
    const odata = odataFor({ CRM: ['DiplomatsAllowed'] });
    expect(odata === null || !/Diplomat/i.test(odata)).toBe(true);
    expect(odata === null || !/\bCRM\b/.test(odata)).toBe(true);
  });

  it('does not leak the raw value even alongside a legitimate filter', () => {
    const odata = odataFor({ CRM: ['DiplomatsAllowed'], PetsAllowedYN: ['true'] });
    expect(odata === null || !/Diplomat/i.test(odata)).toBe(true);
  });

  it('fails the whole request rather than half-executing the legitimate half', () => {
    // A mixed submission is never partially run. Executing only PetsAllowedYN
    // would answer a different question from the one submitted and would do so
    // under HTTP 200, hiding that a protected-class criterion was sent at all.
    expect(() => buildWith({ CRM: ['DiplomatsAllowed'], PetsAllowedYN: ['true'] })).toThrow();
  });
});
