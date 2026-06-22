/// <reference types="jest" />
/**
 * Sale-form DOM WIRING guardrail (P0).
 *
 * Executable DOM math + canonical parity live in `sale-form-dom-calc.test.ts`.
 * This static guardrail locks the form wiring so the from-scratch counter that
 * reset to 0 on every edit-load cannot return, and so the cards are always
 * rendered from the listing's server-maintained DOM seed via the canonical
 * mirror.
 *
 * @module tests/runtime/sale-form-dom-wiring
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORM_PATH = resolve(__dirname, '..', '..', 'public', 'crm', 'SALE-FORM-REDESIGN.html');

describe('SALE-FORM-REDESIGN.html — DOM wiring (P0)', () => {
  let html: string;
  beforeAll(() => {
    html = readFileSync(FORM_PATH, 'utf8');
  });

  it('loads the canonical DOM mirror module', () => {
    expect(html).toContain('js/listing/dom-calc.js');
  });

  it('removed the from-scratch _saleFirstActiveDate counter', () => {
    // The old bug: window._saleFirstActiveDate = now (reset to 0 on edit-load).
    expect(html).not.toContain('_saleFirstActiveDate');
  });

  it('renders DOM cards via the canonical resolver', () => {
    expect(html).toContain('MallanDom.resolveEditorDom');
    expect(html).toMatch(/function renderSaleDom\(\)/);
  });

  it('hydrate seeds the DOM cards from the listing server columns + OnMarketDate', () => {
    expect(html).toContain('window._saleDomSeed');
    // seed pulls the canonical server-maintained columns
    for (const col of ['status_changed_at', 'first_active_date', 'days_on_market', 'cumulative_days_on_market']) {
      expect(html).toMatch(new RegExp(`_saleDomSeed[\\s\\S]{0,400}${col}`));
    }
    // and re-renders after seeding
    expect(html).toMatch(/window\._saleDomSeed[\s\S]{0,600}renderSaleDom\(\)/);
  });

  it('updateStatusTracking delegates DOM to renderSaleDom', () => {
    const fn = html.slice(html.indexOf('function updateStatusTracking()'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    expect(body).toContain('renderSaleDom()');
  });
});
