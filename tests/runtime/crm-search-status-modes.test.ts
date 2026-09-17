/// <reference types="jest" />
/**
 * THE FOUR SEARCH STATUS MODES — basic sale, basic rental, advanced sale, advanced rental (owner rulings, Maya
 * 2026-09-08/09).
 *
 *   - Every Search status control filters provider inventory on the live Cotality StandardStatus. `MlsStatus` is
 *     never used: it is not filterable on this feed.
 *   - Sale and rental have their OWN status vocabulary and cannot drift into each other. The panels are rendered
 *     from ONE authority — the executor contract's `statusChoices`, derived server-side from the sale / rental
 *     mappings in lib/crm/status-mapping.ts — so a vocabulary change moves Search and the CRM forms together.
 *   - Mallan WORKFLOW words (Offer Out, Contract Signed, Lease Signed, Sold Thru Us …) are not search statuses.
 *     The executor has no workflow criterion, so those controls are gone rather than visible and dead, and a
 *     legacy saved search carrying one is refused BY NAME — never silently widened to Pending.
 *   - "Back On Market" survives because it IS executable: Active narrowed by the provider's BackOnMarketDate.
 *
 * The page is loaded in a real DOM with its own scripts running; the contract is served by the REAL
 * `searchContract()` the executor publishes, so the panels are proven against the server's own authority.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { searchContract } from '@/lib/search/engine/contract';
import { criteriaFromParams } from '@/lib/search/engine/criteria';
import { buildProviderQuery } from '@/lib/search/engine/provider-query';
import { SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING } from '@/lib/crm/status-mapping';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const MODES = [
  { mount: 'basic-sale', transaction: 'sale' as const, tab: 'buy' },
  { mount: 'basic-rental', transaction: 'rental' as const, tab: 'rent' },
  { mount: 'advanced-sale', transaction: 'sale' as const, tab: 'buy' },
  { mount: 'advanced-rental', transaction: 'rental' as const, tab: 'rent' },
];

describe('the Search status markup carries no provider-unfilterable field and no workflow control', () => {
  const partial = read('public/crm/html/search-form-and-results.html');
  const engine = read('public/crm/js/search/search-engine.js');
  const saved = read('public/crm/js/search/saved-searches.js');

  it('not one status control in any of the four modes is data-field="MlsStatus"', () => {
    expect(partial).not.toMatch(/data-field="MlsStatus"/);
    expect(engine).not.toMatch(/\[data-field="MlsStatus"\]/);
    expect(saved).not.toMatch(/\[data-field="MlsStatus"\]/);
  });

  it('the four modes each have exactly one contract-driven mount, and no hand-written status option survives', () => {
    for (const m of MODES) {
      const re = new RegExp(`data-status-mount="${m.mount}" data-transaction="${m.transaction}"`, 'g');
      expect(partial.match(re)?.length).toBe(1);
    }
    // the workflow sub-status boxes are gone from the markup entirely
    expect(partial).not.toMatch(/data-sub-status=/);
  });

  it('the built CRM page carries the same four mounts (the partial is inlined by npm run crm:build)', () => {
    const built = read('public/crm/index-built.html');
    for (const m of MODES) expect(built).toContain(`data-status-mount="${m.mount}"`);
    expect(built).not.toMatch(/data-field="MlsStatus"/);
  });
});

describe('the executor contract is the ONE status authority, per transaction', () => {
  const c = searchContract();

  it('every choice is an exact live StandardStatus member, labelled by its transaction', () => {
    const live = new Set(c.members.StandardStatus.map((m) => m.token));
    for (const t of ['sale', 'rental'] as const) {
      expect(c.statusChoices[t].length).toBeGreaterThan(0);
      for (const choice of c.statusChoices[t]) expect(live.has(choice.token)).toBe(true);
    }
  });

  it('the labels come from the transaction mapping: a sale Closed reads Sold and Pending reads In Contract; a rental Closed reads Rented', () => {
    const label = (t: 'sale' | 'rental', token: string) => c.statusChoices[t].find((x) => x.token === token && !x.refine)?.label;
    expect(label('sale', 'Closed')).toBe('Sold');
    expect(label('sale', 'Pending')).toBe('In Contract');
    expect(label('rental', 'Closed')).toBe('Rented');
    expect(label('rental', 'Pending')).toBe('Pending');
    expect(label('sale', 'Canceled')).toBe('Canceled');
    // and they are exactly the mapping's own labels — one authority, no second copy
    expect(label('sale', 'Closed')).toBe(SALE_STATUS_MAPPING.canonicalLabels.Closed);
    expect(label('rental', 'Closed')).toBe(RENTAL_STATUS_MAPPING.canonicalLabels.Closed);
  });

  it('Coming Soon is offered on a sale and never on a rental (UCBA Art. I §16 — sales only)', () => {
    expect(c.statusChoices.sale.some((x) => x.token === 'ComingSoon')).toBe(true);
    expect(c.statusChoices.rental.some((x) => x.token === 'ComingSoon')).toBe(false);
  });

  it('a draft and a removed record are not search inventory', () => {
    for (const t of ['sale', 'rental'] as const) {
      expect(c.statusChoices[t].some((x) => x.token === 'Incomplete')).toBe(false);
      expect(c.statusChoices[t].some((x) => x.token === 'Delete')).toBe(false);
    }
  });

  it('no choice is a Mallan workflow word', () => {
    const workflow = [...SALE_STATUS_MAPPING.workflowStatuses, ...RENTAL_STATUS_MAPPING.workflowStatuses]
      .filter((w) => !(SALE_STATUS_MAPPING.canonicalStatuses as readonly string[]).includes(w) && !(RENTAL_STATUS_MAPPING.canonicalStatuses as readonly string[]).includes(w));
    for (const t of ['sale', 'rental'] as const) {
      for (const choice of c.statusChoices[t]) expect(workflow).not.toContain(choice.token);
    }
  });

  it('Back On Market is a refinement of Active, executable through the provider date', () => {
    for (const t of ['sale', 'rental'] as const) {
      const bom = c.statusChoices[t].find((x) => x.refine === 'backOnMarket');
      expect(bom).toEqual({ token: 'Active', label: 'Back On Market', refine: 'backOnMarket' });
    }
    expect(c.executableParams).toContain('backOnMarket');
    const r = criteriaFromParams(new URLSearchParams('type=sale&status=Active&backOnMarket=1'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criteria.backOnMarket).toBe(true);
      expect(buildProviderQuery(r.criteria).filter).toContain('BackOnMarketDate ne null');
    }
    // a plain Active search does not narrow
    const plain = criteriaFromParams(new URLSearchParams('type=sale&status=Active'));
    expect(plain.ok && buildProviderQuery(plain.criteria).filter).not.toContain('BackOnMarketDate');
  });

  it('every token a panel offers is executable, and a workflow token is refused by name', () => {
    for (const t of ['sale', 'rental'] as const) {
      for (const choice of c.statusChoices[t]) {
        const r = criteriaFromParams(new URLSearchParams(`type=${t === 'rental' ? 'rental' : 'sale'}&status=${choice.token}`));
        expect({ token: choice.token, ok: r.ok }).toEqual({ token: choice.token, ok: true });
        if (r.ok) expect(buildProviderQuery(r.criteria).filter).toContain(`StandardStatus eq '${choice.token}'`);
      }
    }
    for (const bad of ['OfferOut', 'ContractSigned', 'LeaseSigned', 'SoldThruUs', 'Sold', 'Rented', 'Draft']) {
      const r = criteriaFromParams(new URLSearchParams(`type=sale&status=${bad}`));
      expect({ bad, ok: r.ok }).toEqual({ bad, ok: false });
    }
  });
});

describe('the four rendered panels in a real DOM', () => {
  jest.setTimeout(120_000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let win: any;
  const contract = searchContract();

  beforeAll(async () => {
    const html = read('public/crm/html/search-form-and-results.html');
    const engine = read('public/crm/js/search/search-engine.js');
    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on('jsdomError', () => undefined);
    const dom = new jsdom.JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      url: 'http://localhost/crm/',
      runScripts: 'dangerously',
      virtualConsole,
    });
    win = dom.window;
    // The page's OWN renderer, lifted verbatim (brace-matched, no slicing by length) and executed against the
    // REAL server contract — so this proves the shipped function, not a copy of it.
    const start = engine.indexOf('window.renderStatusPanels = function');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = -1;
    for (let i = engine.indexOf('{', start); i < engine.length; i++) {
      if (engine[i] === '{') depth++;
      else if (engine[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    expect(end).toBeGreaterThan(start);
    win.eval(engine.slice(start, end) + ';');
    expect(typeof win.renderStatusPanels).toBe('function');
    win.renderStatusPanels(contract);
  });
  afterAll(() => win?.close());

  it.each(MODES)('$mount renders exactly its own transaction\'s choices, as StandardStatus tokens', (mode) => {
    const panel = win.document.querySelector(`[data-status-mount="${mode.mount}"]`);
    expect(panel).not.toBeNull();
    const boxes = [...panel.querySelectorAll('input[type="checkbox"]')];
    expect(boxes.length).toBe(contract.statusChoices[mode.transaction].length);
    const rendered = boxes.map((b: Element) => ({
      field: b.getAttribute('data-field'),
      token: b.getAttribute('data-value'),
      refine: b.getAttribute('data-refine') ?? undefined,
      label: b.parentElement?.textContent?.trim(),
    }));
    for (const r of rendered) expect(r.field).toBe('StandardStatus');
    expect(rendered.map((r) => ({ token: r.token, label: r.label, ...(r.refine ? { refine: r.refine } : {}) })))
      .toEqual(contract.statusChoices[mode.transaction].map((cch) => ({ token: cch.token, label: cch.label, ...(cch.refine ? { refine: cch.refine } : {}) })));
    // Active is checked by default; the Back On Market refinement is not
    const active = boxes.filter((b: Element) => b.getAttribute('data-value') === 'Active' && !b.getAttribute('data-refine'));
    expect(active.length).toBe(1);
    expect((active[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes.find((b: Element) => b.getAttribute('data-refine') === 'backOnMarket') as HTMLInputElement).checked).toBe(false);
  });

  it('a sale panel never shows a rental term and a rental panel never shows a sale term', () => {
    const labelsOf = (mount: string) => [...win.document.querySelectorAll(`[data-status-mount="${mount}"] input`)]
      .map((b: Element) => b.parentElement?.textContent?.trim());
    for (const mount of ['basic-sale', 'advanced-sale']) {
      expect(labelsOf(mount)).toContain('Sold');
      expect(labelsOf(mount)).not.toContain('Rented');
    }
    for (const mount of ['basic-rental', 'advanced-rental']) {
      expect(labelsOf(mount)).toContain('Rented');
      expect(labelsOf(mount)).not.toContain('Sold');
      expect(labelsOf(mount)).not.toContain('Coming Soon');
    }
  });

  it('the two modes of one transaction render the identical vocabulary (basic and advanced cannot drift)', () => {
    const tokensOf = (mount: string) => [...win.document.querySelectorAll(`[data-status-mount="${mount}"] input`)]
      .map((b: Element) => b.getAttribute('data-value') + (b.getAttribute('data-refine') ? '/' + b.getAttribute('data-refine') : ''));
    expect(tokensOf('basic-sale')).toEqual(tokensOf('advanced-sale'));
    expect(tokensOf('basic-rental')).toEqual(tokensOf('advanced-rental'));
    expect(tokensOf('basic-sale')).not.toEqual(tokensOf('basic-rental'));
  });
});
