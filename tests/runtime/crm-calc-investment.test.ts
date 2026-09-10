/// <reference types="jest" />
/**
 * INVESTMENT CALCULATION CORE — cap rate, cash-on-cash, ROI, §1031.
 *
 * Tranche 1 group 2. Same standard as the transaction-cost core: pure function, structured result,
 * every assumption explicit and attributed, boundary and negative tests, mutation proof.
 *
 * ── WHAT THE DASHBOARD VERSIONS GOT RIGHT, AND WHAT THEY DID NOT ───────────────────────────────
 *
 * Cap rate and cash-on-cash were checked line by line and are standard: cap rate excludes debt
 * service (NOI over price), cash-on-cash divides annual cash flow after debt service by cash in.
 * Carried over.
 *
 * ROI had two real modelling gaps, both SILENT:
 *   · it counted appreciation in full but never subtracted the cost of selling, so the return was
 *     overstated for anyone who would actually transact;
 *   · it computed equity from the remaining mortgage and then never counted principal paydown as a
 *     return, so leveraged holds were understated.
 * Neither was an assumption an operator could see or change. Here both are explicit, and the exit
 * costs come from the SAME net-proceeds core the seller net sheet uses - not a second copy of the
 * transfer-tax tables.
 *
 * ── §1031 IS NOT AN ELIGIBILITY OPINION ────────────────────────────────────────────────────────
 *
 * Owner instruction 2026-09-09: "1031 should be modeled carefully. It should calculate/explain
 * scenarios and assumptions, but it should not imply that a transaction qualifies for §1031 merely
 * because the numbers work. Qualification depends on facts outside a calculator."
 *
 * So the result separates a financial projection from a tax conclusion it is not entitled to reach.
 * `eligibility.determined` is always false, and the tests below fail if any wording drifts toward
 * telling an operator that a deal qualifies.
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
  win.eval(readFileSync(resolve(ROOT, 'public/crm/js/calc/investment.js'), 'utf8'));
  return win.CrmCalc;
}
const C = engine();
const line = (r: any, k: string) => r.lines.find((l: any) => l.key === k);
const assumption = (r: any, k: string) => r.assumptions.find((a: any) => a.key === k);

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('cap rate', () => {
  const base = { price: 2_000_000, grossAnnualRent: 180_000, vacancyRatePct: 5, operatingExpenses: 60_000 };

  it('is NOI over price — vacancy applied to gross, operating expenses deducted', () => {
    const r = C.capRate(base);
    const egi = 180_000 * 0.95;            // 171,000
    const noi = egi - 60_000;              // 111,000
    expect(r.totals.effectiveGrossIncome).toBeCloseTo(egi, 2);
    expect(r.totals.noi).toBeCloseTo(noi, 2);
    expect(r.totals.capRatePct).toBeCloseTo((noi / 2_000_000) * 100, 6);
  });

  it('EXCLUDES debt service — a cap rate that moved with the mortgage would not be a cap rate', () => {
    const withDebt = C.capRate({ ...base, annualDebtService: 90_000 });
    expect(withDebt.totals.capRatePct).toBeCloseTo(C.capRate(base).totals.capRatePct, 6);
  });

  it('vacancy is an explicit assumption, not folded into the rent', () => {
    expect(assumption(C.capRate(base), 'vacancyRatePct')!.value).toBe(5);
  });

  it('operating expenses exceeding effective gross give a NEGATIVE cap rate, not zero', () => {
    const r = C.capRate({ ...base, operatingExpenses: 400_000 });
    expect(r.totals.noi).toBeLessThan(0);
    expect(r.totals.capRatePct).toBeLessThan(0);
  });

  it('a zero price is refused', () => {
    expect(() => C.capRate({ ...base, price: 0 })).toThrow(/price/i);
  });

  it('a vacancy rate outside 0–100 is refused', () => {
    expect(() => C.capRate({ ...base, vacancyRatePct: 140 })).toThrow(/vacancy/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('cash-on-cash', () => {
  const base = {
    purchasePrice: 1_000_000, downPayment: 250_000, closingCosts: 30_000,
    annualRent: 84_000, propertyTaxes: 12_000, insurance: 3_000, maintenance: 6_000,
    managementFees: 4_200, vacancyAllowance: 4_200, annualDebtService: 48_000,
  };

  it('divides annual cash flow AFTER debt service by the cash actually invested', () => {
    const r = C.cashOnCash(base);
    const expenses = 12_000 + 3_000 + 6_000 + 4_200 + 4_200;
    const cashFlow = 84_000 - expenses - 48_000;
    expect(r.totals.annualCashFlow).toBeCloseTo(cashFlow, 2);
    expect(r.totals.cashInvested).toBeCloseTo(280_000, 2);
    expect(r.totals.cashOnCashPct).toBeCloseTo((cashFlow / 280_000) * 100, 6);
  });

  it('counts up-front capital improvements as cash invested — the dashboard version could not', () => {
    const r = C.cashOnCash({ ...base, initialCapex: 70_000 });
    expect(r.totals.cashInvested).toBeCloseTo(350_000, 2);
    expect(assumption(r, 'initialCapex')!.value).toBe(70_000);
  });

  it('a negative cash flow returns a NEGATIVE return, never a clamped zero', () => {
    const r = C.cashOnCash({ ...base, annualRent: 30_000 });
    expect(r.totals.annualCashFlow).toBeLessThan(0);
    expect(r.totals.cashOnCashPct).toBeLessThan(0);
  });

  it('zero cash invested is refused rather than dividing by zero', () => {
    expect(() => C.cashOnCash({ ...base, downPayment: 0, closingCosts: 0 })).toThrow(/cash invested/i);
  });

  it('monthly cash flow is the annual figure over twelve, not a separately entered number', () => {
    const r = C.cashOnCash(base);
    expect(r.totals.monthlyCashFlow).toBeCloseTo(r.totals.annualCashFlow / 12, 6);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('ROI — the two silent gaps in the dashboard version are now explicit', () => {
  const base = {
    purchasePrice: 1_000_000, currentValue: 1_400_000, downPayment: 250_000, closingCosts: 30_000,
    totalRentalIncome: 300_000, totalOperatingExpenses: 120_000, holdingYears: 5,
    propertyType: 'condo' as const,
  };

  it('subtracting the cost of selling LOWERS the return — and it is an assumption, not a silent default', () => {
    const withExit = C.roi({ ...base, includeSaleCosts: true, commissionPct: 5 });
    const without = C.roi({ ...base, includeSaleCosts: false });
    expect(withExit.totals.totalRoiPct).toBeLessThan(without.totals.totalRoiPct);
    expect(assumption(withExit, 'includeSaleCosts')!.value).toBe(true);
    expect(assumption(withExit, 'commissionPct')!.value).toBe(5);
  });

  it('the exit costs come from the SAME net-proceeds core as the seller net sheet', () => {
    const r = C.roi({ ...base, includeSaleCosts: true, commissionPct: 5 });
    const sheet = C.netProceeds({ price: 1_400_000, propertyType: 'condo', commissionPct: 5 });
    // Not "a similar number" — the identical one. If ROI grew its own transfer-tax table this fails.
    expect(r.totals.saleCosts).toBeCloseTo(sheet.totals.sellingCosts, 2);
    // Lines carry deductions as negatives, so the line is the same magnitude with the opposite sign.
    expect(line(r, 'saleCosts')!.amount).toBeCloseTo(-sheet.totals.sellingCosts, 2);
  });

  it('principal paid down counts as a return — the dashboard version computed equity and ignored it', () => {
    const withPaydown = C.roi({ ...base, principalPaidDown: 60_000 });
    const without = C.roi({ ...base, principalPaidDown: 0 });
    expect(withPaydown.totals.totalProfit - without.totals.totalProfit).toBeCloseTo(60_000, 2);
  });

  it('annualised ROI is CAGR on the cash invested', () => {
    const r = C.roi({ ...base, includeSaleCosts: false, principalPaidDown: 0 });
    const end = r.totals.cashInvested + r.totals.totalProfit;
    expect(r.totals.annualisedRoiPct).toBeCloseTo((Math.pow(end / r.totals.cashInvested, 1 / 5) - 1) * 100, 6);
  });

  it('a loss annualises as a negative CAGR rather than NaN', () => {
    const r = C.roi({ ...base, currentValue: 500_000, totalRentalIncome: 0, totalOperatingExpenses: 200_000 });
    expect(r.totals.totalProfit).toBeLessThan(0);
    expect(Number.isFinite(r.totals.annualisedRoiPct)).toBe(true);
    expect(r.totals.annualisedRoiPct).toBeLessThan(0);
  });

  it('a zero holding period is refused rather than dividing by zero', () => {
    expect(() => C.roi({ ...base, holdingYears: 0 })).toThrow(/holding/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('§1031 — a financial projection, never an eligibility opinion', () => {
  const base = {
    saleClosingDate: '2026-03-02', today: '2026-04-01',
    salePrice: 3_000_000, adjustedBasis: 1_200_000, sellingCosts: 200_000,
    replacementPrice: 3_500_000, bootReceived: 0,
  };

  it('computes the 45-day identification and 180-day exchange deadlines from the sale closing', () => {
    const r = C.exchange1031(base);
    expect(r.timeline.identifyBy).toBe('2026-04-16');   // +45 days
    expect(r.timeline.exchangeBy).toBe('2026-08-29');   // +180 days
  });

  it('reports days remaining against both deadlines', () => {
    const r = C.exchange1031(base);
    expect(r.timeline.daysToIdentify).toBe(15);
    expect(r.timeline.daysToExchange).toBe(150);
  });

  it('flags a missed identification deadline', () => {
    const r = C.exchange1031({ ...base, today: '2026-05-01' });
    expect(r.timeline.identificationPassed).toBe(true);
  });

  it('projects realised gain and the portion boot would make recognisable', () => {
    const r = C.exchange1031({ ...base, bootReceived: 250_000 });
    expect(r.totals.realisedGain).toBeCloseTo(3_000_000 - 200_000 - 1_200_000, 2);
    expect(r.totals.recognisedGain).toBeCloseTo(250_000, 2);      // limited to boot
    expect(r.totals.potentiallyDeferredGain).toBeCloseTo(r.totals.realisedGain - 250_000, 2);
  });

  it('recognised gain is capped at the realised gain — boot cannot recognise more than exists', () => {
    const r = C.exchange1031({ ...base, bootReceived: 5_000_000 });
    expect(r.totals.recognisedGain).toBeCloseTo(r.totals.realisedGain, 2);
    expect(r.totals.potentiallyDeferredGain).toBe(0);
  });

  it('NEVER states that the transaction qualifies — eligibility is explicitly undetermined', () => {
    const r = C.exchange1031(base);
    expect(r.eligibility.determined).toBe(false);
    expect(r.eligibility.note).toMatch(/does not|cannot determine|outside/i);
  });

  it('no wording anywhere in the result asserts qualification', () => {
    const r = C.exchange1031(base);
    const text = JSON.stringify(r).toLowerCase();
    // "qualifies", "is eligible", "you can defer" are conclusions a calculator may not reach.
    expect(text).not.toMatch(/\bqualifies\b/);
    expect(text).not.toMatch(/\bis eligible\b/);
    expect(text).not.toMatch(/\bwill defer\b/);
    // the language it MUST carry instead
    expect(text).toMatch(/potentially deferred|may be deferred/);
  });

  it('carries the qualified-intermediary and like-kind requirements as facts to satisfy, not as ticks', () => {
    const r = C.exchange1031(base);
    const reqs = r.requirements.map((q: any) => q.label.toLowerCase()).join(' | ');
    expect(reqs).toMatch(/qualified intermediary/);
    expect(reqs).toMatch(/like-kind|held for/);
    for (const q of r.requirements) expect(q.satisfied).toBeNull(); // never asserted by the calculator
  });

  it('a replacement cheaper than the relinquished property warns about the shortfall', () => {
    const r = C.exchange1031({ ...base, replacementPrice: 2_000_000 });
    expect(r.warnings.join(' ')).toMatch(/lower|less than|shortfall/i);
  });

  it('an invalid sale date is refused', () => {
    expect(() => C.exchange1031({ ...base, saleClosingDate: 'not-a-date' })).toThrow(/date/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe('every investment result honours the shared contract', () => {
  const results = [
    C.capRate({ price: 1_000_000, grossAnnualRent: 90_000, vacancyRatePct: 5, operatingExpenses: 30_000 }),
    C.cashOnCash({ purchasePrice: 1_000_000, downPayment: 250_000, closingCosts: 30_000, annualRent: 84_000, annualDebtService: 48_000 }),
    C.roi({ purchasePrice: 1_000_000, currentValue: 1_200_000, downPayment: 250_000, closingCosts: 30_000, holdingYears: 3, propertyType: 'condo' }),
    C.exchange1031({ saleClosingDate: '2026-03-02', today: '2026-04-01', salePrice: 2_000_000, adjustedBasis: 900_000, sellingCosts: 100_000, replacementPrice: 2_200_000 }),
  ];

  it('each names its calculator and version', () => {
    for (const r of results) {
      expect(typeof r.calculator).toBe('string');
      expect(typeof r.version).toBe('number');
    }
  });

  it('each declares every assumption with a source of user, default or statutory', () => {
    for (const r of results) {
      expect(r.assumptions.length).toBeGreaterThan(0);
      for (const a of r.assumptions) expect(['user', 'default', 'statutory']).toContain(a.source);
    }
  });

  it('each carries the disclaimer, so a renderer cannot drop it', () => {
    for (const r of results) expect(r.disclaimer).toMatch(/estimate only/i);
  });
});
