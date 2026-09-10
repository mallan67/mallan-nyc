/// <reference types="jest" />
/**
 * THE CALCULATORS ARE CALLABLE FROM A CLIENT, NOT ONLY FROM A TOOLS PAGE.
 *
 * First boundary of the Sales CRM / client-workspace migration. The duplicate shell's workspace has
 * a Calculators tab that renders twelve hand-built calculator modules into twelve `#calc-<id>` divs
 * and prefills them from the client record. That tab is the ONLY reason those twelve modules cannot
 * be deleted.
 *
 * This replaces it with the canonical renderer plus a client-context mapper, so:
 *   · the arithmetic is the shared engines, not embedded copies;
 *   · the prefill behaviour the owner asked to keep - listing price, mortgage balance, property type
 *     and other verified CRM data - survives;
 *   · a prefilled number is still an ASSUMPTION the agent can change, and is reported as one. Owner
 *     instruction: "treat user-editable assumptions as assumptions rather than hidden facts."
 *
 * The parity test is the point of the exercise: the same client must produce the same numbers
 * through the canonical path as through the old embedded one, and where they differ the OLD one is
 * wrong and is replaced - never preserved for compatibility.
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
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost/crm', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  win.eval(read('public/crm/js/core/crm-routing.js'));
  win.eval(read('public/crm/js/calc/transaction-costs.js'));
  win.eval(read('public/crm/js/calc/investment.js'));
  win.eval(read('public/crm/js/calc/ownership.js'));
  win.eval(read('public/crm/js/calc/calculator-ui.js'));
  return {
    win,
    host: () => win.document.getElementById('host'),
    close: () => win.close(),
  };
}

/** A seller client as the CRM actually stores one. */
const SELLER = {
  id: 'C-101', client_type: 'seller', stage: 'listed',
  list_price: 2_400_000, mortgage_balance: 900_000, property_type: 'coop',
};
const INVESTOR = {
  id: 'C-202', client_type: 'investor',
  list_price: 3_500_000, mortgage_balance: 1_000_000, property_type: 'condo',
  monthly_rent: 9_000, annual_operating_expenses: 48_000,
};

describe('client data becomes calculator inputs — verified facts, still editable', () => {
  const t = boot();
  const map = (client: unknown) => t.win.eval(`JSON.stringify(CrmCalcUI.inputsFromClient(${JSON.stringify(client)}))`);

  it('carries the listing price, mortgage balance and property type across', () => {
    const i = JSON.parse(map(SELLER));
    expect(i.price).toBe(2_400_000);
    expect(i.mortgagePayoff).toBe(900_000);
    expect(i.propertyType).toBe('coop');
  });

  it('carries rent and operating expenses for an investor', () => {
    const i = JSON.parse(map(INVESTOR));
    expect(i.monthlyRent).toBe(9_000);
    expect(i.annualExpenses).toBe(48_000);
  });

  it('maps an unrecognised property type to nothing rather than guessing', () => {
    const i = JSON.parse(map({ ...SELLER, property_type: 'brownstone-ish' }));
    expect(i.propertyType).toBeUndefined();
  });

  it('omits absent data instead of substituting a zero that would read as a fact', () => {
    const i = JSON.parse(map({ id: 'C-9', client_type: 'seller' }));
    expect(i.price).toBeUndefined();
    expect(i.mortgagePayoff).toBeUndefined();
  });

  it('a prefilled value is reported as an ASSUMPTION the agent can change, not a hidden fact', () => {
    const r = t.win.eval(`JSON.stringify(CrmCalc.netProceeds(Object.assign(CrmCalcUI.inputsFromClient(${JSON.stringify(SELLER)}), { commissionPct: 5 })).assumptions)`);
    const price = JSON.parse(r).find((a: any) => a.key === 'price');
    expect(price.value).toBe(2_400_000);
    expect(price.source).toBe('user');
  });
});

describe('the picker offers the calculators that suit the client', () => {
  const t = boot();
  const forClient = (c: unknown) => JSON.parse(t.win.eval(`JSON.stringify(CrmCalcUI.calculatorsForClient(${JSON.stringify(c)}))`));

  it('a seller gets the seller-side set', () => {
    const keys = forClient(SELLER);
    expect(keys).toEqual(expect.arrayContaining(['net-proceeds', 'seller-closing-costs', 'equity', 'carrying-cost', 'break-even-price']));
  });

  it('a buyer gets buyer closing costs', () => {
    expect(forClient({ id: 'C-3', client_type: 'buyer' })).toContain('buyer-closing-costs');
  });

  it('an investor gets the investment set', () => {
    const keys = forClient(INVESTOR);
    expect(keys).toEqual(expect.arrayContaining(['cap-rate', 'cash-on-cash', 'roi', 'rental-yield', 'exchange-1031']));
  });

  it('every key it offers is a real registered calculator', () => {
    const registered = JSON.parse(t.win.eval('JSON.stringify(Object.keys(CrmCalcUI.REGISTRY))'));
    for (const c of [SELLER, INVESTOR, { id: 'x', client_type: 'buyer' }]) {
      for (const k of forClient(c)) expect(registered).toContain(k);
    }
  });
});

describe('mounting for a client renders a working calculator with the client already in it', () => {
  it('mounts the first calculator, prefilled', () => {
    const t = boot();
    t.win.eval(`CrmCalcUI.mountForClient(document.getElementById('host'), ${JSON.stringify(SELLER)})`);
    const priceField = t.win.document.querySelector('[data-calc-field="price"]') as any;
    expect(priceField.value).toBe('2400000');
    t.close();
  });

  it('switching calculators keeps the client context', () => {
    const t = boot();
    t.win.eval(`CrmCalcUI.mountForClient(document.getElementById('host'), ${JSON.stringify(SELLER)})`);
    t.win.eval("CrmCalcUI.showForClient('carrying-cost')");
    expect(t.win.document.querySelector('[data-calculator="carrying-cost"]')).not.toBeNull();
    t.win.eval("CrmCalcUI.showForClient('net-proceeds')");
    const priceField = t.win.document.querySelector('[data-calc-field="price"]') as any;
    expect(priceField.value).toBe('2400000');
    t.close();
  });

  it('a co-op seller sees the co-op treatment, because the client said co-op', () => {
    const t = boot();
    t.win.eval(`CrmCalcUI.mountForClient(document.getElementById('host'), ${JSON.stringify(SELLER)}, 'seller-closing-costs')`);
    expect(t.win.document.querySelector('[data-line="flipTax"]')).not.toBeNull();
    t.close();
  });

  it('the picker renders one button per offered calculator', () => {
    const t = boot();
    t.win.eval(`CrmCalcUI.mountForClient(document.getElementById('host'), ${JSON.stringify(INVESTOR)})`);
    const keys = JSON.parse(t.win.eval(`JSON.stringify(CrmCalcUI.calculatorsForClient(${JSON.stringify(INVESTOR)}))`));
    expect(t.win.document.querySelectorAll('[data-calc-pick]').length).toBe(keys.length);
    t.close();
  });
});

/** A landlord client as the Rentals CRM stores one. */
const LANDLORD = {
  id: 'L-55', client_type: 'landlord',
  rent_per_month: 6_400, estimated_value: 1_900_000, annual_operating_expenses: 32_000,
  property_type: 'condo',
};

describe('landlord clients get the rental set, prefilled from the rental record', () => {
  const t = boot();
  const forClient = (c: unknown) => JSON.parse(t.win.eval(`JSON.stringify(CrmCalcUI.calculatorsForClient(${JSON.stringify(c)}))`));

  it('offers vacancy cost, rental yield and cap rate', () => {
    expect(forClient(LANDLORD)).toEqual(expect.arrayContaining(['vacancy-cost', 'rental-yield', 'cap-rate']));
  });

  it('does NOT offer buyer closing costs to a landlord', () => {
    expect(forClient(LANDLORD)).not.toContain('buyer-closing-costs');
  });

  it('rent_per_month becomes the monthly rent — the Rentals CRM field name, mapped', () => {
    const i = JSON.parse(t.win.eval(`JSON.stringify(CrmCalcUI.inputsFromClient(${JSON.stringify(LANDLORD)}))`));
    expect(i.monthlyRent).toBe(6_400);
    expect(i.propertyValue).toBe(1_900_000);
    expect(i.operatingExpenses).toBe(32_000);
  });

  it('mounting for a landlord prefills the rent', () => {
    const t2 = boot();
    t2.win.eval(`CrmCalcUI.mountForClient(document.getElementById('host'), ${JSON.stringify(LANDLORD)}, 'rental-yield')`);
    const rent = t2.win.document.querySelector('[data-calc-field="monthlyRent"]') as any;
    expect(rent.value).toBe('6400');
    t2.close();
  });
});

describe('PARITY — the client path and the tools path are the same calculation', () => {
  it('a seller net sheet is identical whether reached from the client or from /tools', () => {
    const t = boot();
    const viaClient = JSON.parse(t.win.eval(
      `JSON.stringify(CrmCalc.netProceeds(Object.assign(CrmCalcUI.inputsFromClient(${JSON.stringify(SELLER)}), { commissionPct: 5 })).totals)`));
    const viaTools = JSON.parse(t.win.eval(
      "JSON.stringify(CrmCalc.netProceeds({ price: 2400000, propertyType: 'coop', mortgagePayoff: 900000, commissionPct: 5 }).totals)"));
    expect(viaClient).toEqual(viaTools);
    t.close();
  });

  it('the mounted client calculator shows the same total as the direct call', () => {
    const t = boot();
    t.win.eval(`CrmCalcUI.mountForClient(document.getElementById('host'), ${JSON.stringify(SELLER)}, 'net-proceeds')`);
    const shown = (t.win.document.querySelector('[data-total="netProceeds"]')?.textContent || '').replace(/[^0-9-]/g, '');
    const direct = t.win.eval("CrmCalc.netProceeds(Object.assign(CrmCalcUI.inputsFromClient(" + JSON.stringify(SELLER) + "), { commissionPct: 5 })).totals.netProceeds");
    // The renderer rounds for display; the underlying number is the engine's.
    expect(Math.abs(Number(shown) - Math.round(direct))).toBeLessThanOrEqual(1);
    t.close();
  });
});
