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

  it('emits no OData clause for a {"CRM":["DiplomatsAllowed"]} submission', () => {
    const odata = buildWith({ CRM: ['DiplomatsAllowed'] });
    expect(odata).not.toMatch(/Diplomat/i);
    expect(odata).not.toMatch(/\bCRM\b/);
  });

  it('does not leak the raw value even alongside a legitimate filter', () => {
    const odata = buildWith({ CRM: ['DiplomatsAllowed'], PetsAllowedYN: ['true'] });
    expect(odata).not.toMatch(/Diplomat/i);
  });
});
