/// <reference types="jest" />
/**
 * ONE CALCULATOR RENDERER, DRIVEN BY THE CALCULATION CONTRACT.
 *
 * The dashboard shell had twelve hand-built calculator pages, each reading its own DOM ids and
 * painting its own HTML. That is why the same arithmetic could drift between a "calculator" and a
 * "report". Here the renderer knows nothing about mansion tax, co-ops or 1031s: it renders
 * { assumptions, lines, totals, warnings, disclaimer } and nothing else.
 *
 * The load-bearing property is that the FORM IS BUILT FROM `assumptions`. That is the owner
 * requirement — "any commission, appreciation, interest rate, vacancy, maintenance increase, rent
 * increase, financing cost or other variable must be visible/editable and identified in the result" —
 * enforced structurally rather than by review: a calculator cannot hide a variable from this UI
 * without also hiding it from every report that renders the same object.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

function boot() {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'http://localhost/crm', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  win.eval(read('public/crm/js/core/crm-routing.js'));
  win.eval(read('public/crm/js/calc/transaction-costs.js'));
  win.eval(read('public/crm/js/calc/calculator-ui.js'));
  const host = () => win.document.getElementById('content');
  return {
    win, host,
    mount: (key: string, inputs?: Record<string, unknown>) =>
      win.eval(`CrmCalcUI.mount(document.getElementById('content'), ${JSON.stringify(key)}, ${JSON.stringify(inputs || {})})`),
    field: (key: string) => win.document.querySelector(`[data-calc-field="${key}"]`),
    total: (key: string) => win.document.querySelector(`[data-total="${key}"]`)?.textContent || '',
    lineKeys: () => Array.from(win.document.querySelectorAll('[data-line]')).map((e: any) => e.getAttribute('data-line')),
    setField: (key: string, value: string) => {
      const el = win.document.querySelector(`[data-calc-field="${key}"]`);
      el.value = value;
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
    },
    close: () => win.close(),
  };
}

describe('the renderer builds the form from the assumptions the calculation declared', () => {
  it('every assumption gets an editable field — nothing that moved the number is hidden', () => {
    const t = boot();
    const result = t.mount('buyer-closing-costs');
    for (const a of result.assumptions) {
      expect({ key: a.key, hasField: Boolean(t.field(a.key)) }).toEqual({ key: a.key, hasField: true });
    }
    t.close();
  });

  it('a defaulted value is VISIBLY marked as a default, not passed off as the operator\'s number', () => {
    const t = boot();
    t.mount('buyer-closing-costs'); // no mortgage rate supplied
    const marks = Array.from(t.win.document.querySelectorAll('[data-source="default"]')).map((e: any) => e.textContent);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.join(' ')).toMatch(/default/i);
    t.close();
  });

  it('the disclaimer renders with the result and cannot be dropped by the renderer', () => {
    const t = boot();
    t.mount('seller-closing-costs');
    expect(t.win.document.querySelector('[data-disclaimer="1"]').textContent).toMatch(/estimate only/i);
    t.close();
  });

  it('itemised lines render with their statutory basis', () => {
    const t = boot();
    t.mount('buyer-closing-costs');
    expect(t.lineKeys()).toEqual(expect.arrayContaining(['mansionTax', 'mortgageRecordingTax']));
    expect(t.win.document.querySelector('[data-line="mansionTax"]').textContent).toMatch(/1402-a/);
    t.close();
  });
});

describe('editing an assumption recalculates', () => {
  it('raising the price moves the buyer into the next mansion band', () => {
    const t = boot();
    t.mount('buyer-closing-costs', { price: 2_500_000, propertyType: 'condo', financing: false });
    expect(t.win.document.querySelector('[data-line="mansionTax"]').textContent).toMatch(/1\.25%/);
    t.setField('price', '3500000');
    expect(t.win.document.querySelector('[data-line="mansionTax"]').textContent).toMatch(/1\.50%/);
    expect(t.win.document.querySelector('[data-line="mansionTax"]').textContent).toMatch(/\$52,500/);
    t.close();
  });

  it('switching a financed purchase to a co-op removes the mortgage recording tax and says why', () => {
    const t = boot();
    t.mount('buyer-closing-costs', { price: 2_000_000, propertyType: 'condo', financing: true, downPaymentPct: 25 });
    expect(t.win.document.querySelector('[data-line="mortgageRecordingTax"]').textContent).toMatch(/\$28,875/);
    t.setField('propertyType', 'coop');
    const row = t.win.document.querySelector('[data-line="mortgageRecordingTax"]').textContent;
    expect(row).toMatch(/\$0/);
    expect(row).toMatch(/UCC|shares/i);
    expect(t.win.document.querySelector('[data-warnings="1"]').textContent).toMatch(/no NYC mortgage recording tax/i);
    t.close();
  });

  it('changing the commission changes net proceeds — it is never fixed', () => {
    const t = boot();
    t.mount('net-proceeds', { price: 1_000_000, propertyType: 'condo', commissionPct: 4, mortgagePayoff: 0 });
    const at4 = t.total('netProceeds');
    t.setField('commissionPct', '6');
    expect(t.total('netProceeds')).not.toBe(at4);
    expect(t.win.document.querySelector('[data-line="commission"]').textContent).toMatch(/not set by law|negotiable/i);
    t.close();
  });
});

describe('bad input shows a refusal, never a plausible number', () => {
  it('a zero price renders the error, not a total', () => {
    const t = boot();
    t.mount('buyer-closing-costs', { price: 1_000_000, propertyType: 'condo', financing: false });
    t.setField('price', '0');
    expect(t.win.document.querySelector('[data-calc-error="1"]')).not.toBeNull();
    expect(t.win.document.querySelector('[data-total="closingCosts"]')).toBeNull();
    t.close();
  });
});

describe('the calculators are routes on the ONE routing authority', () => {
  it('registering adds them to CrmRouting, not to a second router', () => {
    const t = boot();
    const routes = t.win.eval('CrmCalcUI.registerRoutes()');
    expect(routes).toEqual(expect.arrayContaining(['/tools/buyer-closing-costs', '/tools/seller-closing-costs', '/tools/net-proceeds']));
    expect(t.win.eval('CrmRouting.registeredPanels()')).toEqual(expect.arrayContaining(routes));
    t.close();
  });

  it('the calculations stay callable WITHOUT the UI, so a report never needs a second engine', () => {
    const t = boot();
    const direct = t.win.eval("JSON.stringify(CrmCalc.netProceeds({ price: 1000000, propertyType: 'condo', commissionPct: 5 }).totals)");
    expect(JSON.parse(direct).netProceeds).toBeGreaterThan(0);
    t.close();
  });
});
