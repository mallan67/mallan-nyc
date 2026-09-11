/// <reference types="jest" />
/**
 * ONE SET OF NEW YORK TRANSACTION-TAX TABLES IN THE WHOLE CRM.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────────
 *
 * On 2026-09-09 the CRM contained FOUR implementations of the same New York transaction taxes, with
 * three different sets of defects:
 *
 *   SALE-FORM-WITH-TOOLS.html            missing the 1.50% / 3.50% / 3.75% mansion bands.
 *                                        UNDERSTATED a $3.5M buyer by $8,750. Deleted.
 *   js/dashboard/panels/tools/**         correct schedule; no property type, so it charged mortgage
 *                                        recording tax on co-op purchases. Superseded by the core.
 *   js/output/calculators.js             MANSION_TAX_RATES[3] carried 0.025 for $5M–$9,999,999.
 *                                        The statutory rate is 0.0225. OVERSTATED a $7M buyer by
 *                                        $17,500 — and this one shipped in the canonical CRM.
 *   js/calc/transaction-costs.js         the core, verified band by band.
 *
 * Four copies is why the same purchase could be quoted three different numbers depending on which
 * screen the agent opened. This suite pins the outcome of that convergence: the tables exist ONCE,
 * in the core, and every other surface delegates to it.
 *
 * The assertions are behavioural — they execute both paths and compare the numbers. A future edit
 * that reintroduces a private table fails here even if it happens to be correct on the day, because
 * a second table is the defect regardless of its current contents.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Boot the core plus the output-calculators module, the way the canonical shell loads them. */
function boot() {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/crm', runScripts: 'dangerously', virtualConsole,
  });
  const win: any = dom.window;
  win.eval('var Utils = { esc: function (s) { return String(s == null ? "" : s); }, formatMoney: function (n) { return String(n); } };');
  win.eval(read('public/crm/js/calc/transaction-costs.js'));
  win.eval(read('public/crm/js/output/calculators.js'));
  return win;
}

const PRICES = [
  999_999, 1_000_000, 1_999_999, 2_000_000, 2_999_999, 3_000_000, 4_999_999,
  5_000_000, 6_500_000, 7_000_000, 9_999_999, 10_000_000, 14_999_999,
  15_000_000, 19_999_999, 20_000_000, 24_999_999, 25_000_000, 40_000_000,
];

describe('the report calculators and the core agree on every band', () => {
  const win = boot();

  it('mansion tax matches the core at every boundary — including $5M–$10M', () => {
    const mismatches: Array<{ price: number; report: number; core: number }> = [];
    for (const price of PRICES) {
      const report = win.eval(`getMansionTax(${price})`) as number;
      const band = win.eval(`CrmCalc.mansionTaxBand(${price})`) as { rate: number };
      const core = price * band.rate;
      if (Math.abs(report - core) > 0.005) mismatches.push({ price, report, core });
    }
    expect(mismatches).toEqual([]);
  });

  it('the $7M case that shipped wrong in the canonical CRM is right', () => {
    // 0.025 was in MANSION_TAX_RATES for $5M–$9,999,999; the statutory rate is 0.0225.
    expect(win.eval('getMansionTax(7000000)')).toBeCloseTo(157_500, 2);
    expect(win.eval('getMansionTax(7000000)')).not.toBeCloseTo(175_000, 2);
  });

  it('NYC and NYS transfer taxes match the core at their thresholds', () => {
    for (const price of [499_999, 500_000, 2_999_999, 3_000_000]) {
      expect(win.eval(`getNYCTransferTax(${price})`)).toBeCloseTo(price * win.eval(`CrmCalc.rpttRate(${price})`), 2);
      expect(win.eval(`getNYSTransferTax(${price})`)).toBeCloseTo(price * win.eval(`CrmCalc.nysTransferRate(${price})`), 2);
    }
  });

  it('mortgage recording tax matches, and still exempts a co-op', () => {
    for (const loan of [499_999, 500_000, 1_500_000]) {
      expect(win.eval(`getMortgageRecordingTax(${loan}, false)`))
        .toBeCloseTo(loan * win.eval(`CrmCalc.mortgageRecordingTaxRate(${loan})`), 2);
      expect(win.eval(`getMortgageRecordingTax(${loan}, true)`)).toBe(0);
    }
  });

  it('the monthly payment matches the core', () => {
    expect(win.eval('monthlyMortgagePayment(1500000, 6.5, 30)'))
      .toBeCloseTo(win.eval('CrmCalc.monthlyPayment(1500000, 6.5, 30)'), 6);
  });
});

describe('the retired calculator modules cannot come back', () => {
  const { existsSync, readdirSync } = require('fs');

  it('js/dashboard/panels/tools is gone', () => {
    expect(existsSync(resolve(ROOT, 'public/crm/js/dashboard/panels/tools'))).toBe(false);
  });

  it('no shipped file outside js/calc defines a calculator module', () => {
    // The twelve retired modules each declared a `XxxCalc` singleton that owned its own arithmetic
    // and read its own DOM ids. That shape is what allowed twelve copies of the same maths to drift
    // apart. Calculations live in js/calc/** as pure functions; a UI consumes them.
    const offenders: string[] = [];
    const CRM = resolve(ROOT, 'public/crm');
    const DECLARES_CALC = /\bvar\s+[A-Za-z0-9_]*Calc\s*=\s*\(function/;
    const walk = (dir: string, rel: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(`${dir}/${e.name}`, childRel); continue; }
        if (!e.name.endsWith('.js')) continue;
        if (childRel.startsWith('js/calc/')) continue;      // the one home
        if (childRel === 'index-built.html') continue;
        if (DECLARES_CALC.test(readFileSync(`${dir}/${e.name}`, 'utf8'))) offenders.push(childRel);
      }
    };
    walk(CRM, '');
    expect({
      offenders,
      why: 'Calculations belong in js/calc/** as pure functions returning the shared contract, consumed by CrmCalcUI. A XxxCalc singleton that owns arithmetic and DOM ids is the shape that produced twelve drifting copies.',
    }).toEqual({ offenders: [], why: expect.any(String) });
  });

  it('nothing loads a tools module script', () => {
    const dash = read('public/crm/dashboard.html');
    const index = read('public/crm/index.html');
    expect(dash).not.toMatch(/panels\/tools\/[a-z0-9-]+\.js/);
    expect(index).not.toMatch(/panels\/tools\/[a-z0-9-]+\.js/);
  });
});

describe('there is no second tax table anywhere in the shipped CRM', () => {
  /** Every shipped source that hardcodes a New York transaction-tax rate. */
  const offenders = (() => {
    const { readdirSync, statSync } = require('fs');
    const out: string[] = [];
    const CRM = resolve(ROOT, 'public/crm');
    // The statutory rates, as they appear in code.
    const RATES = /\b0\.01425\b|\b0\.0065\b|\b0\.01925\b|\b0\.0225\b|\b0\.0375\b|\b0\.039\b/;
    const walk = (dir: string, rel: string) => {
      for (const name of readdirSync(dir)) {
        const full = `${dir}/${name}`;
        const childRel = rel ? `${rel}/${name}` : name;
        if (statSync(full).isDirectory()) { walk(full, childRel); continue; }
        if (!name.endsWith('.js')) continue;
        if (childRel === 'index-built.html') continue;
        // Scan EXECUTABLE code, not prose. The defects these rates describe are quoted verbatim in
        // this repo's explanatory comments — "{ min: 5000000, ..., rate: 0.025 } <-- statutory rate
        // is 0.0225" is documentation of a fixed bug, and a naive grep would flag it forever. Same
        // discipline as stripComments() in crm-designation-no-fabrication.test.ts.
        const executable = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .filter((l: string) => !l.trim().startsWith('//'))
          .join('\n');
        if (RATES.test(executable)) out.push(childRel);
      }
    };
    walk(CRM, '');
    return out.sort();
  })();

  it('only the core defines them — EVERY application, with no exemption', () => {
    // THE EXEMPTION THAT USED TO BE HERE, and why it was a hole:
    //
    //     const outsideRetiredShell = offenders.filter((f) => !f.startsWith('js/dashboard/'));
    //     // js/dashboard/** is the retired shell; its copies go when it does.
    //
    // js/dashboard/** is the BROKERAGE CRM. It is a permanent application, not a retired shell —
    // proven 2026-09-10, corrected in 928f31c4. So "its copies go when it does" exempted the CRM
    // from the one-tax-authority rule FOREVER, on a premise that is false.
    //
    // The exemption was not theoretical. It was hiding two live defects, both in seller- and
    // buyer-facing money:
    //   pitch-packet.js  charged NYC RPTT only and omitted NYS transfer tax entirely, overstating
    //                    a seller's net proceeds by 0.4% of the price ($8,000 on a $2M pitch).
    //   workspace.js     the same omission, PLUS a flat 1% mansion tax against the statutory eight
    //                    bands — $50,000 instead of $112,500 at $5M, $250,000 instead of $975,000
    //                    at $25M.
    //
    // A guard that exempts an application because it is "going away" stops being a guard the moment
    // that turns out to be wrong. There is no exemption now: every shipped source under
    // public/crm delegates to the core, or it is an offender.
    expect({
      offenders,
      why: 'New York transaction-tax rates live ONCE, in js/calc/transaction-costs.js. Call CrmCalc instead of writing a rate literal — four copies is how the same purchase got quoted three different numbers, and a fifth was hiding behind an exemption.',
    }).toEqual({ offenders: ['js/calc/transaction-costs.js'], why: expect.any(String) });
  });
});
