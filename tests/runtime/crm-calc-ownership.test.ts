/// <reference types="jest" />
/**
 * OWNERSHIP / RENTAL ECONOMICS CORE — yield, break-even, carrying cost, equity, vacancy.
 *
 * Tranche 1 group 3, same standard as groups 1 and 2: pure function, structured result, every
 * assumption explicit and attributed, boundary and negative tests, mutation proof.
 *
 * ── WHAT THE DASHBOARD VERSIONS GOT RIGHT, AND THE ONE THAT DID NOT ────────────────────────────
 *
 * Rental yield, carrying cost, equity and vacancy cost were checked line by line and are standard.
 * Carried over.
 *
 * BREAK-EVEN WAS A FIFTH COPY OF THE NEW YORK TAX TABLES, and a band-unaware one:
 *
 *     var transferRate = 0.01425 + 0.004;   // flat, regardless of price
 *
 * The algebra is right - P = (M + F) / (1 - C - T) - but T is not a constant. NYC RPTT is 1.00%
 * below $500,000 and 1.425% at or above; NYS transfer is 0.40% below $3,000,000 and 0.65% at or
 * above. So the old break-even OVERSTATED the required price below $500K and UNDERSTATED it at $3M+,
 * which is the direction that matters: it told a seller they could break even at a price that does
 * not, in fact, cover their costs.
 *
 * It is also circular - the rate depends on the price being solved for - so the fix is to solve
 * against the CORE's band functions rather than to pick a constant.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');

/* eslint-disable @typescript-eslint/no-explicit-any */

function engine() {
  const dom = new jsdom.JSDOM('', { runScripts: 'outside-only' });
  const win: any = dom.window;
  win.eval(readFileSync(resolve(ROOT, 'public/crm/js/calc/transaction-costs.js'), 'utf8'));
  win.eval(readFileSync(resolve(ROOT, 'public/crm/js/calc/ownership.js'), 'utf8'));
  return win.CrmCalc;
}
const C = engine();
const assumption = (r: any, k: string) => r.assumptions.find((a: any) => a.key === k);

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('rental yield', () => {
  const base = { propertyValue: 1_500_000, monthlyRent: 7_500, annualExpenses: 24_000 };

  it('gross yield is annualised rent over value; net deducts expenses', () => {
    const r = C.rentalYield(base);
    expect(r.totals.annualGrossRent).toBeCloseTo(90_000, 2);
    expect(r.totals.grossYieldPct).toBeCloseTo((90_000 / 1_500_000) * 100, 6);
    expect(r.totals.netYieldPct).toBeCloseTo(((90_000 - 24_000) / 1_500_000) * 100, 6);
  });

  it('reports the expense ratio against gross rent', () => {
    expect(C.rentalYield(base).totals.expenseRatioPct).toBeCloseTo((24_000 / 90_000) * 100, 6);
  });

  it('expenses above gross rent give a NEGATIVE net yield, not zero', () => {
    const r = C.rentalYield({ ...base, annualExpenses: 120_000 });
    expect(r.totals.netYieldPct).toBeLessThan(0);
  });

  it('a zero property value is refused rather than dividing by zero', () => {
    expect(() => C.rentalYield({ ...base, propertyValue: 0 })).toThrow(/value/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('break-even sale price — band-aware, solved against the one tax authority', () => {
  it('the solved price actually covers mortgage, fixed costs, commission and transfer taxes', () => {
    const r = C.breakEvenSalePrice({ mortgagePayoff: 900_000, commissionPct: 5, attorneyFee: 3_000, otherCosts: 5_000 });
    const p = r.totals.breakEvenPrice;
    // Verify by SETTLEMENT, not by re-running the same formula: run the seller net sheet at the
    // solved price and confirm the seller nets zero.
    const sheet = C.netProceeds({ price: p, propertyType: 'condo', commissionPct: 5, attorneyFee: 3_000, otherCosts: 5_000, mortgagePayoff: 900_000 });
    expect(sheet.totals.netProceeds).toBeCloseTo(0, 0);
  });

  it('at $3M+ it uses the 0.65% NYS rate — the flat 0.4% understated the price a seller needs', () => {
    const r = C.breakEvenSalePrice({ mortgagePayoff: 2_800_000, commissionPct: 5, attorneyFee: 3_000 });
    expect(r.totals.breakEvenPrice).toBeGreaterThan(3_000_000);
    const sheet = C.netProceeds({ price: r.totals.breakEvenPrice, propertyType: 'condo', commissionPct: 5, attorneyFee: 3_000, mortgagePayoff: 2_800_000 });
    expect(sheet.totals.netProceeds).toBeCloseTo(0, 0);
    // the old flat-rate answer would have been lower, and would NOT have settled
    const flat = (2_800_000 + 3_000) / (1 - 0.05 - (0.01425 + 0.004));
    expect(r.totals.breakEvenPrice).toBeGreaterThan(flat);
  });

  it('below $500,000 it uses the 1.00% RPTT rate', () => {
    const r = C.breakEvenSalePrice({ mortgagePayoff: 300_000, commissionPct: 4, attorneyFee: 2_500 });
    const sheet = C.netProceeds({ price: r.totals.breakEvenPrice, propertyType: 'condo', commissionPct: 4, attorneyFee: 2_500, mortgagePayoff: 300_000 });
    expect(sheet.totals.netProceeds).toBeCloseTo(0, 0);
  });

  it('a co-op flip tax is part of what the price must cover', () => {
    const withFlip = C.breakEvenSalePrice({ mortgagePayoff: 900_000, commissionPct: 5, propertyType: 'coop', flipTaxPct: 2 });
    const without = C.breakEvenSalePrice({ mortgagePayoff: 900_000, commissionPct: 5, propertyType: 'coop', flipTaxPct: 0 });
    expect(withFlip.totals.breakEvenPrice).toBeGreaterThan(without.totals.breakEvenPrice);
  });

  it('an unreachable break-even is refused, not returned as a negative price', () => {
    // commission at or above 100% leaves nothing to cover the debt
    expect(() => C.breakEvenSalePrice({ mortgagePayoff: 900_000, commissionPct: 100 })).toThrow(/break.?even|cannot/i);
  });

  it('the commission is an assumption and carries the negotiability statement', () => {
    const r = C.breakEvenSalePrice({ mortgagePayoff: 500_000, commissionPct: 5 });
    expect(assumption(r, 'commissionPct')!.value).toBe(5);
    expect(JSON.stringify(r)).toMatch(/not set by law|negotiable/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('carrying cost', () => {
  const base = { monthlyMortgage: 6_000, monthlyMaintenance: 2_200, monthlyPropertyTax: 1_400, monthlyInsurance: 200, monthlyUtilities: 300, monthlyOther: 0, months: 6 };

  it('sums the monthly components and multiplies by the holding period', () => {
    const r = C.carryingCost(base);
    expect(r.totals.monthlyTotal).toBeCloseTo(10_100, 2);
    expect(r.totals.totalCost).toBeCloseTo(60_600, 2);
  });

  it('the daily figure states the convention it uses rather than implying a calendar month', () => {
    const r = C.carryingCost(base);
    expect(r.totals.dailyCost).toBeCloseTo(10_100 / 30.44, 4);
    expect(assumption(r, 'daysPerMonth')!.value).toBeCloseTo(30.44, 2);
  });

  it('a zero or negative holding period is refused', () => {
    expect(() => C.carryingCost({ ...base, months: 0 })).toThrow(/month/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('equity', () => {
  const base = { marketValue: 2_000_000, mortgageBalance: 800_000, otherLiens: 50_000, purchasePrice: 1_400_000 };

  it('equity is value less every encumbrance, not just the first mortgage', () => {
    const r = C.equity(base);
    expect(r.totals.equity).toBeCloseTo(1_150_000, 2);
    expect(r.totals.equityPct).toBeCloseTo((1_150_000 / 2_000_000) * 100, 6);
  });

  it('reports BOTH LTV and combined LTV — liens are debt too', () => {
    const r = C.equity(base);
    expect(r.totals.ltvPct).toBeCloseTo((800_000 / 2_000_000) * 100, 6);
    expect(r.totals.cltvPct).toBeCloseTo((850_000 / 2_000_000) * 100, 6);
  });

  it('appreciation since purchase is reported in dollars and percent', () => {
    const r = C.equity(base);
    expect(r.totals.appreciation).toBeCloseTo(600_000, 2);
    expect(r.totals.appreciationPct).toBeCloseTo((600_000 / 1_400_000) * 100, 6);
  });

  it('being underwater returns NEGATIVE equity, never a clamped zero', () => {
    const r = C.equity({ ...base, mortgageBalance: 2_400_000 });
    expect(r.totals.equity).toBeLessThan(0);
    expect(r.warnings.join(' ')).toMatch(/underwater|exceed/i);
  });

  it('with no purchase price it reports no appreciation rather than inventing one', () => {
    const r = C.equity({ marketValue: 1_000_000, mortgageBalance: 400_000 });
    expect(r.totals.appreciation).toBeNull();
    expect(r.totals.appreciationPct).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('vacancy cost', () => {
  const base = {
    monthlyRent: 6_000, vacancyMonths: 2,
    monthlyMortgage: 3_000, monthlyPropertyTax: 800, monthlyInsurance: 150, monthlyMaintenance: 250,
    marketingCosts: 1_200, cleaningCosts: 600, paintingCosts: 900, repairCosts: 400,
  };

  it('adds lost rent, carrying costs over the vacancy, and one-off turnover costs', () => {
    const r = C.vacancyCost(base);
    expect(r.totals.lostRent).toBeCloseTo(12_000, 2);
    expect(r.totals.carryingDuringVacancy).toBeCloseTo((3_000 + 800 + 150 + 250) * 2, 2);
    expect(r.totals.turnoverCosts).toBeCloseTo(3_100, 2);
    expect(r.totals.totalCost).toBeCloseTo(12_000 + 8_400 + 3_100, 2);
  });

  it('a date range derives the vacancy length using a stated days-per-month convention', () => {
    const r = C.vacancyCost({ ...base, vacancyStart: '2026-01-01', vacancyEnd: '2026-03-02', vacancyMonths: undefined });
    expect(r.totals.vacancyMonths).toBeCloseTo(60 / 30.44, 3);
    expect(assumption(r, 'vacancyMonths')!.source).toBe('user');
  });

  it('an end date before the start is refused', () => {
    expect(() => C.vacancyCost({ ...base, vacancyStart: '2026-03-01', vacancyEnd: '2026-01-01' })).toThrow(/date|before|after/i);
  });

  it('expresses the cost as a rent-equivalent so it can be compared to a price reduction', () => {
    const r = C.vacancyCost(base);
    expect(r.totals.equivalentMonthsOfRent).toBeCloseTo(r.totals.totalCost / 6_000, 4);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('every ownership result honours the shared contract', () => {
  const results = [
    C.rentalYield({ propertyValue: 1_000_000, monthlyRent: 5_000, annualExpenses: 12_000 }),
    C.breakEvenSalePrice({ mortgagePayoff: 500_000, commissionPct: 5 }),
    C.carryingCost({ monthlyMortgage: 4_000, months: 3 }),
    C.equity({ marketValue: 1_000_000, mortgageBalance: 400_000 }),
    C.vacancyCost({ monthlyRent: 4_000, vacancyMonths: 1 }),
  ];

  it('each names its calculator and version and carries the disclaimer', () => {
    for (const r of results) {
      expect(typeof r.calculator).toBe('string');
      expect(typeof r.version).toBe('number');
      expect(r.disclaimer).toMatch(/estimate only/i);
    }
  });

  it('each declares every assumption with a valid source', () => {
    for (const r of results) {
      expect(r.assumptions.length).toBeGreaterThan(0);
      for (const a of r.assumptions) expect(['user', 'default', 'statutory']).toContain(a.source);
    }
  });
});
