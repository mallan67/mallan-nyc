/**
 * The Investment Analysis calculator of a sale listing (app/components/InvestorCalculator.tsx), as one pure function (Maya, 2026-11-05: "check the investment analysis calculator, see if it is working
 * properly"). The formulas are the ones the page always used; checking them against the printed page of 333 E 46th St #2G (price $765,000, maintenance $1,748.65, rent $4,350, 25% down, 6%, 5% vacancy,
 * 3% appreciation, 10 years) reproduced every figure on it (cap rate 3.00%, cash on cash -8.27%, monthly cash flow -$1,529, total ROI 5.25%, NOI $22,930, GRM 14.7x, total profit $128,199, annualized 4.67%).
 * What changed is what happens at the edges and how a loss is written:
 *   - a box cleared or mistyped (0 years, a 0% rate, no rent, text) used to give "NaN%", "Infinity" or a mortgage of $0 on a loan that still has to be repaid: every input is now brought into a sane range;
 *   - a figure that cannot be calculated (the gross rent multiple with no rent, an annualized return after losing more than the cash put in) is null, and the page shows a dash;
 *   - a negative amount was written "$-1,529": formatMoney writes "-$1,529".
 * The ASSUMPTIONS are all in one place (and are the footnote under the numbers). Maya, 2026-11-05: "insurance is about 500 a year, the only expense is maintenance". An apartment owner's insurance is
 * $500 a year (the page used 0.4% of the price, a house-sized $3,060 a year here) and there is no repairs reserve on top of the maintenance (the page used 5% of the rent). The listing's own taxes still
 * count when it has them (a condo's are separate; a co-op's are inside the maintenance, and its tax is empty). The page's earlier assumptions are the second argument of calculateInvestment in the test
 * that reproduces the printed page.
 */

export interface InvestorAssumptions {
  closingCostRate: number; sellingCostRate: number; insuranceAnnual: number; repairsRate: number; rentGrowth: number; expenseGrowth: number; loanYears: number;
}

export const ASSUMPTIONS: InvestorAssumptions = {
  closingCostRate: 0.04,      // of the price, paid by the buyer
  sellingCostRate: 0.06,      // of the future value, paid on the sale
  insuranceAnnual: 500,       // dollars a year: an apartment owner's policy
  repairsRate: 0,             // of the gross rent, a month: none, the maintenance is the expense
  rentGrowth: 0.03,           // a year
  expenseGrowth: 0.02,        // a year
  loanYears: 30,
};

export interface InvestorInputs {
  purchasePrice: number;
  /** the monthly maintenance / common charge (a co-op's maintenance already holds the building's real-estate taxes) */
  maintenanceFee?: number;
  monthlyTaxes?: number;
  estimatedRent: number;
  downPaymentPercent: number;
  interestRate: number;
  vacancyRate: number;
  annualAppreciation: number;
  holdingPeriod: number;
}

export interface InvestorResults {
  downPayment: number; closingCosts: number; totalCashInvested: number; loanAmount: number;
  monthlyMortgage: number; monthlyExpenses: number; monthlyCashFlow: number; effectiveMonthlyRent: number;
  noi: number; annualCashFlow: number;
  capRate: number; cashOnCash: number; totalROI: number;
  /** null when there is no rent to divide by */
  grm: number | null;
  futureValue: number; totalAppreciation: number; totalEquityBuilt: number; cumulativeCashFlow: number; totalProfit: number;
  /** null when the cash put in was lost entirely (a return per year cannot be taken of a negative amount) */
  annualizedReturn: number | null;
  /** the holding period actually used (a whole number of years, 1 to 30) */
  years: number;
}

const finite = (v: unknown, fallback = 0): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : fallback; };
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The range each box is brought into (low, high, and the value a missing or mistyped box takes). The engine and the page use the same ones, so the figure a box shows is the figure that was calculated. */
export const INPUT_RANGES = {
  downPaymentPercent: [0, 100, 25],
  interestRate: [0, 25, 7],
  vacancyRate: [0, 100, 5],
  annualAppreciation: [-20, 20, 3],
  holdingPeriod: [1, 30, 5],
} as const;

export function clampInput(name: keyof typeof INPUT_RANGES, value: unknown): number {
  const [lo, hi, fallback] = INPUT_RANGES[name];
  const n = clamp(finite(value, fallback), lo, hi);
  return name === 'holdingPeriod' ? Math.round(n) : n;
}

export function calculateInvestment(input: InvestorInputs, assumptions: InvestorAssumptions = ASSUMPTIONS): InvestorResults {
  const purchasePrice = Math.max(0, finite(input.purchasePrice));
  const maintenanceFee = Math.max(0, finite(input.maintenanceFee));
  const monthlyTaxes = Math.max(0, finite(input.monthlyTaxes));
  const estimatedRent = Math.max(0, finite(input.estimatedRent));
  const downPaymentPercent = clampInput('downPaymentPercent', input.downPaymentPercent);
  const interestRate = clampInput('interestRate', input.interestRate);
  const vacancyRate = clampInput('vacancyRate', input.vacancyRate);
  const annualAppreciation = clampInput('annualAppreciation', input.annualAppreciation);
  const years = clampInput('holdingPeriod', input.holdingPeriod);
  const A = assumptions;

  // Initial investment
  const downPayment = purchasePrice * (downPaymentPercent / 100);
  const closingCosts = purchasePrice * A.closingCostRate;
  const totalCashInvested = downPayment + closingCosts;

  // The loan. A loan at 0% still has to be repaid: it is the amount over its payments, not $0.
  const loanAmount = purchasePrice - downPayment;
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = A.loanYears * 12;
  let monthlyMortgage = 0;
  if (loanAmount > 0) {
    monthlyMortgage = monthlyRate > 0
      ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1)
      : loanAmount / totalPayments;
  }

  // Monthly operating expenses (before the mortgage)
  const monthlyInsurance = A.insuranceAnnual / 12;
  const monthlyRepairs = Math.round(estimatedRent * A.repairsRate);
  const monthlyExpenses = maintenanceFee + monthlyTaxes + monthlyInsurance + monthlyRepairs;

  // Income
  const effectiveMonthlyRent = estimatedRent * (1 - vacancyRate / 100);
  const annualGrossRent = estimatedRent * 12;
  const annualEffectiveRent = effectiveMonthlyRent * 12;
  const annualOperatingExpenses = monthlyExpenses * 12;

  const noi = annualEffectiveRent - annualOperatingExpenses;
  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

  const annualDebtService = monthlyMortgage * 12;
  const annualCashFlow = noi - annualDebtService;
  const monthlyCashFlow = annualCashFlow / 12;
  const cashOnCash = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;
  const grm = annualGrossRent > 0 ? purchasePrice / annualGrossRent : null;

  // First year: principal paid down, appreciation
  let balance = loanAmount;
  let equityFirstYear = 0;
  for (let month = 1; month <= 12; month++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyMortgage - interestPayment;
    balance -= principalPayment;
    equityFirstYear += principalPayment;
  }
  const appreciationFirstYear = purchasePrice * (annualAppreciation / 100);
  const totalROI = totalCashInvested > 0 ? ((annualCashFlow + equityFirstYear + appreciationFirstYear) / totalCashInvested) * 100 : 0;

  // Over the holding period
  let cumulativeCashFlow = 0;
  let totalEquityBuilt = 0;
  balance = loanAmount;
  for (let year = 1; year <= years; year++) {
    const yearRent = effectiveMonthlyRent * Math.pow(1 + A.rentGrowth, year - 1) * 12;
    const yearExpenses = annualOperatingExpenses * Math.pow(1 + A.expenseGrowth, year - 1);
    cumulativeCashFlow += (yearRent - yearExpenses) - annualDebtService;
    for (let month = 1; month <= 12; month++) {
      const interestPayment = balance * monthlyRate;
      const principalPayment = monthlyMortgage - interestPayment;
      balance -= principalPayment;
      totalEquityBuilt += principalPayment;
    }
  }

  // The sale
  const futureValue = purchasePrice * Math.pow(1 + annualAppreciation / 100, years);
  const totalAppreciation = futureValue - purchasePrice;
  const sellingCosts = futureValue * A.sellingCostRate;
  const netSaleProceeds = futureValue - balance - sellingCosts;
  const totalProfit = netSaleProceeds + cumulativeCashFlow - totalCashInvested;
  const growth = totalCashInvested > 0 ? (totalCashInvested + totalProfit) / totalCashInvested : 0;
  const annualizedReturn = growth > 0 ? (Math.pow(growth, 1 / years) - 1) * 100 : null;

  return {
    downPayment: Math.round(downPayment), closingCosts: Math.round(closingCosts), totalCashInvested: Math.round(totalCashInvested), loanAmount: Math.round(loanAmount),
    monthlyMortgage: Math.round(monthlyMortgage), monthlyExpenses: Math.round(monthlyExpenses), monthlyCashFlow: Math.round(monthlyCashFlow), effectiveMonthlyRent: Math.round(effectiveMonthlyRent),
    noi: Math.round(noi), annualCashFlow: Math.round(annualCashFlow),
    capRate: round2(capRate), cashOnCash: round2(cashOnCash), totalROI: round2(totalROI),
    grm: grm === null ? null : Math.round(grm * 10) / 10,
    futureValue: Math.round(futureValue), totalAppreciation: Math.round(totalAppreciation), totalEquityBuilt: Math.round(totalEquityBuilt),
    cumulativeCashFlow: Math.round(cumulativeCashFlow), totalProfit: Math.round(totalProfit),
    annualizedReturn: annualizedReturn === null ? null : round2(annualizedReturn),
    years,
  };
}

/** A dollar amount as the page writes it: "$1,529", and "-$1,529" for a loss (never "$-1,529"). US formatting whatever the visitor's locale, so the server and the browser print the same. */
export function formatMoney(n: number): string {
  const v = Math.round(finite(n));
  const text = Math.abs(v).toLocaleString('en-US');
  return v < 0 ? `-$${text}` : `$${text}`;
}
