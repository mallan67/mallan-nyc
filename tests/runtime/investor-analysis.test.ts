/// <reference types="jest" />
/**
 * The Investment Analysis calculator (Maya, 2026-11-05: "check the investment analysis calculator, see if it is working properly").
 *
 * GOLDEN: the printed page of 333 E 46th St #2G (a co-op, $765,000, maintenance $1,748.65, no separate tax) with the inputs on it (rent $4,350, 25% down, 6%, 5% vacancy, 3% appreciation, 10 years).
 * Every figure below is the one the live page printed; each was also worked by hand (the mortgage of $573,750 at 6% over 30 years is $3,440 a month, the remaining balance after 10 years is $480,147, and
 * so on), so the formulas are right and this pins them against a change.
 */
import { calculateInvestment, formatMoney, ASSUMPTIONS, type InvestorInputs } from '@/lib/calculators/investor-analysis';

const PAGE: InvestorInputs = { purchasePrice: 765000, maintenanceFee: 1748.65, monthlyTaxes: 0, estimatedRent: 4350, downPaymentPercent: 25, interestRate: 6, vacancyRate: 5, annualAppreciation: 3, holdingPeriod: 10 };

describe('the figures printed on the live page of 333 E 46th St #2G', () => {
  const r = calculateInvestment(PAGE);

  it('the key figures', () => {
    expect(r.capRate).toBe(3);
    expect(r.cashOnCash).toBe(-8.27);
    expect(r.monthlyCashFlow).toBe(-1529);
    expect(r.totalROI).toBe(5.25);
  });

  it('the monthly breakdown: effective rent, mortgage, and the expenses (maintenance, insurance 0.4% of the price a year, repairs 5% of the rent)', () => {
    expect(r.effectiveMonthlyRent).toBe(4133);
    expect(r.monthlyMortgage).toBe(3440);
    expect(r.monthlyExpenses).toBe(2222);                       // 1,748.65 + 255 + 218 = 2,221.65
    expect(r.effectiveMonthlyRent - r.monthlyMortgage - r.monthlyExpenses).toBe(-1529);
  });

  it('the 10-year projection', () => {
    expect(r.totalCashInvested).toBe(221850);                   // 25% down ($191,250) + 4% closing costs ($30,600)
    expect(r.cumulativeCashFlow).toBe(-136214);
    expect(r.totalEquityBuilt).toBe(93603);                     // $573,750 less the $480,147 still owed after 120 payments
    expect(r.totalAppreciation).toBe(263096);
    expect(r.futureValue).toBe(1028096);                        // 765,000 x 1.03^10
    expect(r.totalProfit).toBe(128199);
    expect(r.annualizedReturn).toBe(4.67);
  });

  it('the additional metrics', () => {
    expect(r.noi).toBe(22930);
    expect(r.grm).toBe(14.7);                                   // 765,000 / (4,350 x 12)
    expect(r.years).toBe(10);
  });

  it('the cap rate is the NOI over the price, and the cash flow is the NOI less the mortgage (the same numbers worked the other way)', () => {
    expect(Math.abs(r.noi / PAGE.purchasePrice * 100 - r.capRate)).toBeLessThan(0.01);
    expect(Math.abs((r.noi - r.monthlyMortgage * 12) / 12 - r.monthlyCashFlow)).toBeLessThan(2);
  });
});

describe('a mortgage is a mortgage at every rate and amount', () => {
  it('0% interest still repays the loan: the loan over its 360 payments, not $0', () => {
    const r = calculateInvestment({ ...PAGE, interestRate: 0 });
    expect(r.monthlyMortgage).toBe(Math.round(573750 / 360));
    expect(r.totalEquityBuilt).toBe(Math.round(573750 / 360 * 12 * 10));
  });
  it('100% down has no loan and no mortgage', () => {
    const r = calculateInvestment({ ...PAGE, downPaymentPercent: 100 });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyMortgage).toBe(0);
    expect(r.totalEquityBuilt).toBe(0);
  });
  it('a higher rate costs more each month', () => {
    expect(calculateInvestment({ ...PAGE, interestRate: 7 }).monthlyMortgage).toBeGreaterThan(calculateInvestment({ ...PAGE, interestRate: 6 }).monthlyMortgage);
  });
});

describe('a box cleared, mistyped or out of range never breaks the page', () => {
  const allFinite = (r: ReturnType<typeof calculateInvestment>) => Object.entries(r).every(([, v]) => v === null || Number.isFinite(v));

  it.each([
    ['0 years (used to divide by zero)', { holdingPeriod: 0 }],
    ['a negative holding period', { holdingPeriod: -3 }],
    ['text or nothing in a box', { estimatedRent: NaN, interestRate: Number('abc'), vacancyRate: undefined as unknown as number }],
    ['Infinity', { downPaymentPercent: Infinity, estimatedRent: Infinity }],
    ['no rent at all', { estimatedRent: 0 }],
    ['100% vacancy', { vacancyRate: 100 }],
    ['a loss of the whole price over 30 years', { annualAppreciation: -20, holdingPeriod: 30 }],
  ])('%s: every figure is a number or null, never NaN or Infinity', (_label, over) => {
    expect(allFinite(calculateInvestment({ ...PAGE, ...over }))).toBe(true);
  });

  it('0 years is read as 1 year', () => { expect(calculateInvestment({ ...PAGE, holdingPeriod: 0 }).years).toBe(1); });
  it('the holding period is a whole number of years, 1 to 30', () => {
    expect(calculateInvestment({ ...PAGE, holdingPeriod: 99 }).years).toBe(30);
    expect(calculateInvestment({ ...PAGE, holdingPeriod: 7.6 }).years).toBe(8);
  });
  it('no rent has no gross rent multiple (the page shows a dash), and 0 is never "Infinity x"', () => {
    expect(calculateInvestment({ ...PAGE, estimatedRent: 0 }).grm).toBeNull();
  });
  it('losing more than the cash put in has no annualized return (a dash), not NaN', () => {
    const r = calculateInvestment({ ...PAGE, annualAppreciation: -20, holdingPeriod: 30, downPaymentPercent: 5 });
    expect(r.totalProfit).toBeLessThan(-r.totalCashInvested);
    expect(r.annualizedReturn).toBeNull();
  });
  it('no price: nothing to calculate, and nothing is NaN', () => { expect(allFinite(calculateInvestment({ ...PAGE, purchasePrice: 0 }))).toBe(true); });
});

describe('the assumptions the footnote names', () => {
  it('are the page\'s own: 4% closing, 6% selling, 3% rent growth, 2% expense growth, a 30-year loan, 0.4% insurance, 5% repairs', () => {
    expect(ASSUMPTIONS).toEqual({ closingCostRate: 0.04, sellingCostRate: 0.06, insuranceRate: 0.004, repairsRate: 0.05, rentGrowth: 0.03, expenseGrowth: 0.02, loanYears: 30 });
  });
});

describe('formatMoney: a loss has its minus sign first', () => {
  it.each([[-1529, '-$1,529'], [1529, '$1,529'], [0, '$0'], [-0.4, '$0'], [1234567, '$1,234,567'], [-136214, '-$136,214'], [NaN, '$0']])('%p -> %s', (n, text) => { expect(formatMoney(n)).toBe(text); });
  it('is never the "$-1,529" the live page printed', () => { expect(formatMoney(-1529)).not.toBe('$-1,529'); });
});
