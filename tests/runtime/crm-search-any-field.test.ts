/// <reference types="jest" />
/**
 * "Search any Cotality field" on the real CRM Search page, booted in jsdom with a stubbed network.
 *
 * The page lists every Cotality field (js/search/search-field-catalog.js, generated from the live contract). This drives the
 * builder through its real DOM: add a field, pick an operator, enter a value, press Search, and read the request that leaves the
 * page; then the saved-search round trip and the reset.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

jest.setTimeout(60000);

const ROOT = resolve(__dirname, '../..');
const SHELL = readFileSync(resolve(ROOT, 'public/crm/index-built.html'), 'utf8');
const contract = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-enums.live.json'), 'utf8')) as { entities: Record<string, Record<string, string>>; enums: Record<string, string[]> };

/* eslint-disable @typescript-eslint/no-explicit-any */
const errors: string[] = [];
const calls: string[] = [];
let w: any;
let d: Document;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => errors.push(String(e.detail?.message ?? e.message)));
  const dom = new JSDOM(SHELL, {
    url: 'https://mallan.nyc/crm/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(win: any) {
      win.tailwind = { config: {} };
      win.alert = () => undefined;
      win.confirm = () => true;
      win.scrollTo = () => undefined;
      win.print = () => undefined;
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      win.fetch = async (url: string, init?: { method?: string }) => {
        const u = String(url);
        calls.push(`${(init && init.method) || 'GET'} ${u}`);
        const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
        if (u.includes('/api/auth/me')) return ok({ authenticated: true, principalType: 'agent', role: 'agent', portalRole: 'agent', user: { id: 'AG-9', name: 'Test Agent', role: 'agent' } });
        if (u.includes('/api/idx/search')) return ok({ listings: [], total: 0, _meta: { fieldFilters: { rejected: [{ field: 'Nope', reason: 'not a Cotality field' }], pageFilters: 0, pageFiltered: 0 } } });
        return ok({});
      };
    },
  });
  w = dom.window;
  d = w.document;
  await sleep(1500);
}, 90000);

afterAll(() => w.close());
beforeEach(() => { w.clearSearchForm(); calls.length = 0; (d.getElementById('searchFormContainer') as HTMLElement).style.display = ''; });

const catalog = (): Array<{ n: string; k: string; s: number; e?: string }> => w.COTALITY_SEARCH_FIELDS;
const sentFilters = () => {
  const call = calls.find((c) => c.includes('/api/idx/search')) as string;
  const raw = new URL(call.replace('GET ', ''), 'https://mallan.nyc').searchParams.get('fieldFilters');
  return raw ? JSON.parse(raw) : null;
};
const fire = (el: Element, type: string) => el.dispatchEvent(new w.Event(type, { bubbles: true }));

describe('Search any Cotality field, on the real page', () => {
  it('boots without an error and lists every Cotality field', () => {
    expect([...new Set(errors)]).toEqual([]);
    const total = new Set([...Object.keys(contract.entities.Property)]).size;
    expect(catalog().filter((f) => f.n in contract.entities.Property)).toHaveLength(total);
    expect(d.querySelectorAll('#cotalityFieldList option').length).toBe(catalog().length);
    expect(d.getElementById('cotalityFieldFilterRows')).not.toBeNull();
  });

  it('adds a boolean, a number range, an enumeration and a CustomFields key through the page, and Search sends exactly them', async () => {
    const F = w.CotalityFieldFilters;
    (d.getElementById('cotalityFieldInput') as HTMLInputElement).value = 'FireplaceYN';
    F.addFromInput();
    expect(d.querySelectorAll('[data-cff-row]')).toHaveLength(1);
    fire(d.getElementById('cff_v_0') as Element, 'change'); // nothing chosen yet: an incomplete row is not sent
    expect(F.get()).toEqual([]);
    const yes = d.getElementById('cff_v_0') as HTMLSelectElement;
    yes.value = 'true'; fire(yes, 'change');

    F.add('ListPrice');
    const priceOp = d.querySelector('[data-cff-row="1"] select') as HTMLSelectElement;
    priceOp.value = 'between'; fire(priceOp, 'change');
    const lo = d.getElementById('cff_v_1_a') as HTMLInputElement; lo.value = '500000'; fire(lo, 'change');
    const hi = d.getElementById('cff_v_1_b') as HTMLInputElement; hi.value = '900000'; fire(hi, 'change');

    F.add('LaundryFeatures');
    const laundry = d.getElementById('cff_v_2') as HTMLSelectElement;
    expect(laundry.options.length).toBe(contract.enums.LaundryFeatures.length);
    [...laundry.options].filter((o) => o.value === 'InUnit').forEach((o) => { o.selected = true; });
    fire(laundry, 'change');

    F.add('TaxMonthlyAmount'); // a CustomFields key: filtered on the fetched results, and the row says so
    expect(d.querySelector('[data-cff-row="3"]')!.textContent).toContain('fetched results');
    const tax = d.getElementById('cff_v_3') as HTMLInputElement; tax.value = '1000'; fire(tax, 'change');

    w.performSearch();
    await sleep(400);
    expect(sentFilters()).toEqual([
      { f: 'FireplaceYN', op: 'eq', v: true },
      { f: 'ListPrice', op: 'between', v: [500000, 900000] },
      { f: 'LaundryFeatures', op: 'in', v: ['InUnit'] },
      { f: 'TaxMonthlyAmount', op: 'ge', v: 1000 },
    ]);
  });

  it('shows what the server refused', async () => {
    w.CotalityFieldFilters.add('FireplaceYN');
    const sel = d.getElementById('cff_v_0') as HTMLSelectElement; sel.value = 'true'; fire(sel, 'change');
    w.performSearch();
    await sleep(400);
    expect(d.getElementById('cotalityFieldFilterNotes')!.textContent).toContain('Nope');
  });

  it('refuses a name that is not a Cotality field', () => {
    (d.getElementById('cotalityFieldInput') as HTMLInputElement).value = 'IDXEntireListingDisplayYN';
    w.CotalityFieldFilters.addFromInput();
    expect(d.querySelectorAll('[data-cff-row]')).toHaveLength(0);
  });

  it('Reset search clears the field filters; a saved search restores them', () => {
    const F = w.CotalityFieldFilters;
    F.set([{ f: 'FireplaceYN', op: 'eq', v: true }, { f: 'NotAField', op: 'eq', v: true }]);
    expect(F.get()).toEqual([{ f: 'FireplaceYN', op: 'eq', v: true }]);
    expect(d.querySelectorAll('[data-cff-row]')).toHaveLength(1);
    w.clearSearchForm();
    expect(F.get()).toEqual([]);
    expect(d.querySelectorAll('[data-cff-row]')).toHaveLength(0);
  });

  it('an empty filter list sends no fieldFilters parameter', async () => {
    w.performSearch();
    await sleep(400);
    expect(sentFilters()).toBeNull();
  });
});
