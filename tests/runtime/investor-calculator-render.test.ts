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

// 333 E 46th St #2G as the page passes it: a co-op, $765,000, maintenance $1,748.65, no separate tax, one bedroom (the page's own default inputs: the Manhattan one-bedroom median rent, $4,995, 7%, 5 years)
const PAGE_PROPS = { purchasePrice: 765000, maintenanceFee: 1748.65, monthlyTaxes: 0, bedrooms: 1, neighborhood: 'Turtle Bay' };
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('the opened Investment Analysis', () => {
  const html = renderToStaticMarkup(createElement(InvestorCalculator, { ...PAGE_PROPS, defaultExpanded: true }));
  const shown = text(html);
  const r = calculateInvestment({ purchasePrice: 765000, maintenanceFee: 1748.65, monthlyTaxes: 0, estimatedRent: 4995, downPaymentPercent: 25, interestRate: 7, vacancyRate: 5, annualAppreciation: 3, holdingPeriod: 5 });

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

describe('the rent the calculator starts from, and where it says it comes from', () => {
  const rentBox = (html: string) => /Est\. Monthly Rent.*?value="(\d+)"/s.exec(html)?.[1];
  const open = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(InvestorCalculator, { ...PAGE_PROPS, defaultExpanded: true, ...props }));

  it('a Manhattan one-bedroom starts from the median asking rent of live Manhattan one-bedrooms, and says so under the box (it was $3,200)', () => {
    const html = open({ borough: 'Manhattan' });
    expect(rentBox(html)).toBe('4995');
    expect(text(html)).toContain('Median asking rent of 1-bedroom rentals active in Manhattan (Cotality, November 2026). Change it to your own estimate.');
  });

  it('nothing in Manhattan starts from $2,500: a Manhattan studio is $3,900', () => {
    expect(rentBox(open({ borough: 'Manhattan', bedrooms: 0 }))).toBe('3900');
    expect(text(open({ borough: 'Manhattan', bedrooms: 0 }))).not.toMatch(/2500|2,500/);
  });

  it('a commercial listing starts from the rent entered for it: 800 2nd Ave #806, $40 per SF on 1,482 SF, is $4,940 a month', () => {
    const html = open({ purchasePrice: 1200000, maintenanceFee: 1588, bedrooms: 0, borough: 'Manhattan', defaultMonthlyRent: 4940, rentBasis: '$40 per SF a year on 1,482 SF, the rent entered for this listing' });
    expect(rentBox(html)).toBe('4940');
    expect(text(html)).toContain('$40 per SF a year on 1,482 SF, the rent entered for this listing. Change it to your own estimate.');
    expect(text(html)).not.toContain('Median asking rent');
  });

  it('a rent of 0 or less is no rent: the borough\'s median is used, never an empty calculator', () => {
    expect(rentBox(open({ defaultMonthlyRent: 0 }))).toBe('4995');
    expect(rentBox(open({ defaultMonthlyRent: -10 }))).toBe('4995');
  });

  it('Brooklyn and the other boroughs start from their own medians', () => {
    expect(rentBox(open({ borough: 'Brooklyn' }))).toBe('4050');
    expect(rentBox(open({ borough: 'Queens' }))).toBe('3688');
  });
});

describe('no verdict on the cash flow (Maya, 2026-11-05: "remove the yellow banner, this is informational")', () => {
  const open = (props: Record<string, unknown>) => text(renderToStaticMarkup(createElement(InvestorCalculator, { ...PAGE_PROPS, defaultExpanded: true, ...props })));

  it('a negative cash flow has no "relies on appreciation" banner, and nothing amber', () => {
    const html = renderToStaticMarkup(createElement(InvestorCalculator, { ...PAGE_PROPS, defaultExpanded: true }));
    expect(calculateInvestment({ purchasePrice: 765000, maintenanceFee: 1748.65, monthlyTaxes: 0, estimatedRent: 4995, downPaymentPercent: 25, interestRate: 7, vacancyRate: 5, annualAppreciation: 3, holdingPeriod: 5 }).monthlyCashFlow).toBeLessThan(0);
    expect(text(html)).not.toMatch(/Negative cash flow|relies on appreciation/);
    expect(html).not.toContain('amber');
  });

  it('a positive cash flow has no congratulating banner either', () => {
    const shown = open({ defaultMonthlyRent: 30000 });
    expect(shown).not.toMatch(/Positive cash flow property|Negative cash flow/);
    expect(shown).toContain('Monthly Cash Flow $');                    // the figure itself is still there, as a positive amount
  });

  it('the figures that sat under the banner are all still there', () => {
    const shown = open({});
    for (const label of ['Cap Rate', 'Cash on Cash', 'Monthly Cash Flow', 'Total ROI (Yr 1)', 'Investment Parameters', 'Monthly Breakdown']) expect(shown).toContain(label);
  });
});
