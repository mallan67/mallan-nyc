/// <reference types="jest" />
/**
 * Fair Housing — the "Diplomats" CRM search filter must not exist.
 *
 * "Diplomats Allowed" is a national-origin / citizenship / immigration-status
 * proxy (protected under the NYC Human Rights Law). It was removed from the CRM
 * agent-search UI on 2026-07-07. These tests fail red if it is ever reintroduced
 * in the source form, the built bundle, or accepted by the Search executor.
 *
 * Proof obligations:
 *  1. absent from the UI source (search-form-and-results.html)
 *  2. absent from the served bundle (index-built.html)
 *  3. REFUSED server-side if a client submits it — the canonical executor
 *     (lib/search/engine) refuses the whole `checkboxFilters` parameter by name and
 *     never builds a provider clause from it; no executable vocabulary resolves the
 *     token either. (Search Consolidation Packet 1 replaced the legacy
 *     buildCrmIdxODataFilter oracle with this behavioural proof.)
 */
import { readFileSync } from 'fs';
import * as path from 'path';
import { criteriaFromParams, resolveMember, COMMON_INTEREST_MEMBERS, STRUCTURE_TYPE_MEMBERS, STANDARD_STATUS_MEMBERS } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';

const CRM = path.resolve(__dirname, '../../public/crm');
const read = (p: string) => readFileSync(path.join(CRM, p), 'utf8');

describe('Fair Housing — no "Diplomats" CRM search filter', () => {
  it('is absent from the search-form SOURCE', () => {
    const src = read('html/search-form-and-results.html');
    expect(src).not.toMatch(/DiplomatsAllowed/);
    expect(src).not.toMatch(/data-value="DiplomatsAllowed"/);
  });
  it('is absent from the served bundle (index-built.html)', () => {
    expect(read('index-built.html')).not.toMatch(/DiplomatsAllowed/);
  });
  it('leaves the non-protected sibling AdvertisingAllowed intact (scope guard)', () => {
    expect(read('html/search-form-and-results.html')).toMatch(/AdvertisingAllowed/);
  });
});

describe('Fair Housing — the Search executor refuses a submitted Diplomats filter', () => {
  it('refuses the checkboxFilters parameter by name; no provider clause is ever built', () => {
    const params = new URLSearchParams({ type: 'sale', checkboxFilters: JSON.stringify({ CRM: ['DiplomatsAllowed'] }) });
    const r = criteriaFromParams(params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.unsupported).toContain('checkboxFilters');
  });
  it('refuses it even alongside a legitimate criterion, and nothing leaks into an accepted query', () => {
    const bad = criteriaFromParams(new URLSearchParams({ type: 'sale', minBeds: '2', checkboxFilters: JSON.stringify({ CRM: ['DiplomatsAllowed'], PetsAllowedYN: ['true'] }) }));
    expect(bad.ok).toBe(false);
    const good = criteriaFromParams(new URLSearchParams({ type: 'sale', minBeds: '2' }));
    expect(good.ok).toBe(true);
    if (good.ok) expect(buildProviderQuery(good.criteria).filter).not.toMatch(/Diplomat|\bCRM\b/i);
  });
  it('no executable vocabulary resolves the protected-class token', () => {
    expect(resolveMember('DiplomatsAllowed', COMMON_INTEREST_MEMBERS)).toBeNull();
    expect(resolveMember('DiplomatsAllowed', STRUCTURE_TYPE_MEMBERS)).toBeNull();
    expect(resolveMember('DiplomatsAllowed', STANDARD_STATUS_MEMBERS)).toBeNull();
    for (const p of ['ownership', 'StructureType', 'status']) {
      const r = criteriaFromParams(new URLSearchParams({ type: 'sale', [p]: 'DiplomatsAllowed' }));
      expect(r.ok).toBe(false);
    }
  });
});
