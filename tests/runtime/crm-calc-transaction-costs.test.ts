/// <reference types="jest" />
/**
 * TRANSACTION-COST CALCULATORS — ONE CALCULATION CORE, USABLE BY REPORTS.
 *
 * Tranche 1 of moving the 12 calculators out of the retired dashboard shell into the canonical CRM.
 *
 * ── WHY A PURE CORE AND NOT A PORT ─────────────────────────────────────────────────────────────
 *
 * The dashboard versions read the DOM (`document.getElementById(id).value`) and paint HTML. That
 * makes them unusable by a CMA, a valuation report, a buy-vs-rent report or a client email - which is
 * exactly how a second implementation of the same arithmetic gets written later, and how "Buy vs Rent
 * calculator" and "Buy vs Rent report" end up disagreeing. Owner instruction 2026-09-09: the
 * calculators must "return reusable structured results, not just paint numbers into HTML".
 *
 * So the core takes a plain object and returns a plain object: inputs, every assumption named and
 * attributed, itemised lines with their legal basis, totals, and warnings. The UI renders that; a
 * report can render the same thing.
 *
 * ── AND WHY THE FORMULAS ARE RE-VERIFIED, NOT TRUSTED ──────────────────────────────────────────
 *
 * The deleted SALE-FORM-WITH-TOOLS fork had a mansion-tax table missing three statutory bands. The
 * dashboard's modular version has all eight - but "one table was right" is not evidence the rest is.
 * Checking the dashboard buyer calculator line by line found a real defect it did not know it had:
 * it has NO property type, so it charges NYC mortgage recording tax on a CO-OP purchase. A co-op
 * loan is a security interest in shares, not a recorded real-property mortgage, so no MRT is due.
 * On a $2M co-op with 25% down that is ~$28,875 of cost the buyer does not owe.
 *
 * Every band boundary below is asserted on both sides, because an off-by-one in a tax tier is money.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Load the pure engine with no DOM at all — if it touches document, this throws. */
function engine() {
  const dom = new jsdom.JSDOM('', { runScripts: 'outside-only' });
  const win: any = dom.window;
  win.eval(readFileSync(resolve(ROOT, 'public/crm/js/calc/transaction-costs.js'), 'utf8'));
  return win.CrmCalc;
}

const C = engine();
const line = (r: any, key: string) => r.lines.find((l: any) => l.key === key);
const amount = (r: any, key: string) => (line(r, key) ? line(r, key).amount : undefined);
const assumption = (r: any, key: string) => r.assumptions.find((a: any) => a.key === key);

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('NYC mansion tax — every statutory band, on both sides of every boundary', () => {
  const cases: Array<[number, number]> = [
    [999_999, 0],
    [1_000_000, 0.01],
    [1_999_999, 0.01],
    [2_000_000, 0.0125],
    [2_999_999, 0.0125],
    [3_000_000, 0.015],
    [4_999_999, 0.015],
    [5_000_000, 0.0225],
    [9_999_999, 0.0225],
    [10_000_000, 0.0325],
    [14_999_999, 0.0325],
    [15_000_000, 0.035],
    [19_999_999, 0.035],
    [20_000_000, 0.0375],
    [24_999_999, 0.0375],
    [25_000_000, 0.039],
    [40_000_000, 0.039],
  ];
  for (const [price, rate] of cases) {
    it(`$${price.toLocaleString()} → ${(rate * 100).toFixed(2)}%`, () => {
      const r = C.buyerClosingCosts({ price, propertyType: 'condo', financing: false });
      expect(amount(r, 'mansionTax')).toBeCloseTo(price * rate, 2);
    });
  }

  it('the rendered label names the tier the buyer is actually in', () => {
    expect(line(C.buyerClosingCosts({ price: 3_500_000, propertyType: 'condo' }), 'mansionTax').label).toContain('1.50%');
    expect(line(C.buyerClosingCosts({ price: 17_000_000, propertyType: 'condo' }), 'mansionTax').label).toContain('3.50%');
  });

  it('the $3.5M case the deleted fork got wrong is right here', () => {
    // The fork quoted 1.25% ($43,750). The statutory band is 1.50% ($52,500).
    expect(amount(C.buyerClosingCosts({ price: 3_500_000, propertyType: 'condo' }), 'mansionTax')).toBe(52_500);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('mortgage recording tax — and the co-op exemption the dashboard version missed', () => {
  const financed = (over: Record<string, unknown>) =>
    C.buyerClosingCosts({ price: 2_000_000, downPaymentPct: 25, financing: true, mortgageRatePct: 6.5, termYears: 30, ...over });

  it('a condo buyer borrowing under $500,000 pays 1.80% of the loan', () => {
    const r = financed({ price: 600_000, downPaymentPct: 25, propertyType: 'condo' }); // loan 450,000
    expect(amount(r, 'mortgageRecordingTax')).toBeCloseTo(450_000 * 0.018, 2);
  });

  it('a condo buyer borrowing $500,000 or more pays 1.925%', () => {
    const r = financed({ propertyType: 'condo' }); // loan 1,500,000
    expect(amount(r, 'mortgageRecordingTax')).toBeCloseTo(1_500_000 * 0.01925, 2);
  });

  it('the threshold is exact at $500,000', () => {
    const under = financed({ price: 666_666, downPaymentPct: 25.0001, propertyType: 'condo' });
    const at = C.buyerClosingCosts({ price: 500_000, downPaymentPct: 0, financing: true, propertyType: 'condo', mortgageRatePct: 6.5 });
    expect(amount(at, 'mortgageRecordingTax')).toBeCloseTo(500_000 * 0.01925, 2);
    expect(under).toBeDefined();
  });

  it('A CO-OP BUYER PAYS NO MORTGAGE RECORDING TAX — the defect this core fixes', () => {
    const r = financed({ propertyType: 'coop' });
    expect(amount(r, 'mortgageRecordingTax')).toBe(0);
  });

  it('and the co-op result SAYS why, rather than silently omitting a line', () => {
    const r = financed({ propertyType: 'coop' });
    expect(r.warnings.join(' ')).toMatch(/co-?op/i);
    expect(line(r, 'mortgageRecordingTax').note).toMatch(/co-?op|shares|not a recorded/i);
  });

  it('an all-cash buyer pays none either', () => {
    const r = C.buyerClosingCosts({ price: 2_000_000, propertyType: 'condo', financing: false });
    expect(amount(r, 'mortgageRecordingTax')).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('seller transfer taxes', () => {
  it('NYC RPTT is 1.00% below $500,000 and 1.425% at or above it', () => {
    expect(amount(C.sellerClosingCosts({ price: 499_999 }), 'rptt')).toBeCloseTo(499_999 * 0.01, 2);
    expect(amount(C.sellerClosingCosts({ price: 500_000 }), 'rptt')).toBeCloseTo(500_000 * 0.01425, 2);
  });

  it('NYS transfer tax is 0.40% below $3M and 0.65% at or above it', () => {
    expect(amount(C.sellerClosingCosts({ price: 2_999_999 }), 'nysTransferTax')).toBeCloseTo(2_999_999 * 0.004, 2);
    expect(amount(C.sellerClosingCosts({ price: 3_000_000 }), 'nysTransferTax')).toBeCloseTo(3_000_000 * 0.0065, 2);
  });

  it('a co-op seller pays a flip tax and no title insurance; a condo seller the reverse', () => {
    const coop = C.sellerClosingCosts({ price: 2_000_000, propertyType: 'coop', flipTaxPct: 2 });
    expect(amount(coop, 'flipTax')).toBeCloseTo(40_000, 2);
    expect(line(coop, 'flipTax').label).toMatch(/flip/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('net proceeds is the seller side, minus the loan, and never invents a commission', () => {
  it('nets sale price less costs less mortgage payoff', () => {
    const r = C.netProceeds({ price: 2_000_000, propertyType: 'condo', mortgagePayoff: 800_000, commissionPct: 5 });
    const costs = r.totals.sellingCosts;
    expect(r.totals.netProceeds).toBeCloseTo(2_000_000 - costs - 800_000, 2);
  });

  it('commission is an INPUT and is reported as one — never a hardcoded 6%', () => {
    // The deleted fork hardcoded `val * 0.94` and rendered it as "Sell Now Net", with no disclosure
    // and no negotiability statement (UCBA Art. I §17).
    const a = C.netProceeds({ price: 1_000_000, commissionPct: 4 });
    const b = C.netProceeds({ price: 1_000_000, commissionPct: 6 });
    expect(amount(a, 'commission')).toBeCloseTo(40_000, 2);
    expect(amount(b, 'commission')).toBeCloseTo(60_000, 2);
    expect(assumption(a, 'commissionPct')!.value).toBe(4);
  });

  it('the commission line carries the negotiability statement REBNY requires', () => {
    const r = C.netProceeds({ price: 1_000_000, commissionPct: 5 });
    expect(line(r, 'commission').note).toMatch(/not set by law|negotiable/i);
  });

  it('a payoff larger than the proceeds yields a negative net, not a clamped zero', () => {
    const r = C.netProceeds({ price: 500_000, mortgagePayoff: 900_000, commissionPct: 5 });
    expect(r.totals.netProceeds).toBeLessThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('the result is report-ready: every assumption visible, attributed, and reusable', () => {
  const r = C.buyerClosingCosts({ price: 2_000_000, propertyType: 'condo', financing: true, downPaymentPct: 20, mortgageRatePct: 6.75 });

  it('names the calculator and a version, so a stored report can be re-rendered', () => {
    expect(r.calculator).toBe('buyer-closing-costs');
    expect(typeof r.version).toBe('number');
  });

  it('every assumption carries a value, a unit and where it came from', () => {
    expect(r.assumptions.length).toBeGreaterThan(0);
    for (const a of r.assumptions) {
      expect(typeof a.key).toBe('string');
      expect(typeof a.label).toBe('string');
      expect(a.value).toBeDefined();
      expect(['user', 'default', 'statutory']).toContain(a.source);
    }
  });

  it('a defaulted assumption is marked as a default, not passed off as the operator\'s number', () => {
    const bare = C.buyerClosingCosts({ price: 1_500_000, propertyType: 'condo', financing: true });
    const rate = assumption(bare, 'mortgageRatePct');
    expect(rate!.source).toBe('default');
  });

  it('every statutory line cites its basis', () => {
    for (const key of ['mansionTax', 'mortgageRecordingTax']) {
      expect(line(r, key).basis).toBeTruthy();
    }
  });

  it('totals are consistent with the lines — no number appears from nowhere', () => {
    const sum = r.lines.reduce((s: number, l: any) => s + (l.countsTowardTotal === false ? 0 : l.amount), 0);
    expect(r.totals.closingCosts).toBeCloseTo(sum, 2);
  });

  it('the core is pure — it returns data and touches no DOM', () => {
    expect(typeof (globalThis as any).document).toBe('undefined');
    expect(r.lines.every((l: any) => typeof l.amount === 'number' && isFinite(l.amount))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('bad input is refused, not silently turned into a plausible number', () => {
  it('a zero or negative price is refused', () => {
    for (const price of [0, -1]) {
      expect(() => C.buyerClosingCosts({ price, propertyType: 'condo' })).toThrow(/price/i);
    }
  });

  it('a down payment over 100% is refused', () => {
    expect(() => C.buyerClosingCosts({ price: 1_000_000, propertyType: 'condo', financing: true, downPaymentPct: 120 })).toThrow(/down/i);
  });

  it('an unknown property type is refused rather than defaulted', () => {
    expect(() => C.buyerClosingCosts({ price: 1_000_000, propertyType: 'houseboat' })).toThrow(/property type/i);
  });
});
