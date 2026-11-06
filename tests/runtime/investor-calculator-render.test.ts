/// <reference types="jest" />
/**
 * What the Investment Analysis section of a listing PRINTS, opened (Maya, 2026-11-05: the printed page of 333 E 46th St #2G showed "$-1,529" for a monthly loss, "$-136,214" for the cumulative cash flow, and
 * a breakdown that wrote the mortgage "-$3,440"). The maths is pinned in investor-analysis.test.ts; this is the page.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InvestorCalculator from '@/app/components/InvestorCalculator';
import { calculateInvestment, formatMoney } from '@/lib/calculators/investor-analysis';

// 333 E 46th St #2G as the page passes it: a co-op, $765,000, maintenance $1,748.65, no separate tax, one bedroom (the page's own default inputs: $3,200 rent, 7%, 5 years)
const PAGE_PROPS = { purchasePrice: 765000, maintenanceFee: 1748.65, monthlyTaxes: 0, bedrooms: 1, neighborhood: 'Turtle Bay' };
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('the opened Investment Analysis', () => {
  const html = renderToStaticMarkup(createElement(InvestorCalculator, { ...PAGE_PROPS, defaultExpanded: true }));
  const shown = text(html);
  const r = calculateInvestment({ purchasePrice: 765000, maintenanceFee: 1748.65, monthlyTaxes: 0, estimatedRent: 3200, downPaymentPercent: 25, interestRate: 7, vacancyRate: 5, annualAppreciation: 3, holdingPeriod: 5 });

  it('is a loss for this listing at the page\'s default inputs, so the loss formatting is what is being tested', () => {
    expect(r.monthlyCashFlow).toBeLessThan(0);
    expect(r.cumulativeCashFlow).toBeLessThan(0);
  });

  it('writes a loss with the minus sign first, everywhere: never "$-"', () => {
    expect(shown).not.toMatch(/\$-/);
    expect(shown).toContain(`Monthly Cash Flow ${formatMoney(r.monthlyCashFlow)}`);
    expect(shown).toContain(`Cumulative Cash Flow ${formatMoney(r.cumulativeCashFlow)}`);
    expect(formatMoney(r.monthlyCashFlow)).toMatch(/^-\$[\d,]+$/);
  });

  it('prints the figures the maths gives, in the page\'s own words', () => {
    expect(shown).toContain(`Cap Rate ${r.capRate.toFixed(2)}%`);
    expect(shown).toContain(`Cash on Cash ${r.cashOnCash.toFixed(2)}%`);
    expect(shown).toContain(`Total ROI (Yr 1) ${r.totalROI.toFixed(2)}%`);
    expect(shown).toContain(`NOI (Annual) ${formatMoney(r.noi)}`);
    expect(shown).toContain(`GRM ${r.grm!.toFixed(1)}x`);
    expect(shown).toContain(`Future Property Value ${formatMoney(r.futureValue)}`);
    expect(shown).toContain(`Mortgage (P&I) ${formatMoney(-r.monthlyMortgage)}`);
    expect(shown).toContain('5-Year Projection');
  });

  it('the expenses row says what is in it (the maintenance, the taxes when the listing has them, and the insurance), and the footnote names every assumption', () => {
    expect(shown).toContain('Maint/CC, taxes & insurance');
    expect(shown).not.toContain('Taxes + Maint + Insurance');
    expect(shown).not.toContain('repairs');
    for (const assumption of ['4% closing costs', '6% selling costs', 'a 30-year loan', '3% annual rent growth', '2% expense growth', 'insurance of $500 a year', 'The maintenance is the only other expense']) {
      expect(shown).toContain(assumption);
    }
  });

  it('the lead-capture summary that goes to the agent writes the same figures', () => {
    const source = readFileSync(resolve(__dirname, '../../app/components/InvestorCalculator.tsx'), 'utf8');
    expect(source).toContain('Monthly cash flow: ${formatMoney(calculations.monthlyCashFlow)}');
    expect(source).not.toMatch(/toLocaleString\(/);                    // no locale-dependent formatting is left in the component
    expect(source).not.toContain('$' + '${');                           // and no "$" written in front of a number that may be negative
  });

  it('collapsed by default: the header only', () => {
    const closed = text(renderToStaticMarkup(createElement(InvestorCalculator, PAGE_PROPS)));
    expect(closed).toContain('Investment Analysis');
    expect(closed).not.toContain('Investment Parameters');
    expect(closed).not.toContain('Monthly Breakdown');
  });
});
