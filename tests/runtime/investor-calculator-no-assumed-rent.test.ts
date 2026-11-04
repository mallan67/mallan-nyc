/// <reference types="jest" />
/**
 * The investment calculator assumes no rent for a commercial space (Maya, 2026-11-04: "rental shows at 2500, this listing min rents at 7K-10K, it should not default of 2500 rent").
 *
 * The calculator opened at a rent taken from a table of NYC rents by BEDROOM count: 0 bedrooms is a studio at $2,500. 800 2nd Avenue #806 is a medical office condominium (its "bedrooms" are
 * offices) that rents for $7,000-$10,000, so it opened at the studio's rent, and with 8 bedrooms it would have opened at the 4-bedroom row. A commercial space now opens with no rent and asks
 * for one; a rent the listing states opens at that figure; a residential listing is unchanged.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import InvestorCalculator from '@/app/components/InvestorCalculator';
import { isCommercialSpace } from '@/lib/listings/is-commercial-space';

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(InvestorCalculator, { purchasePrice: 1200000, maintenanceFee: 1588, monthlyTaxes: 1571, defaultExpanded: true, ...props } as never));
const rentBox = (html: string) => (html.match(/<input[^>]*placeholder="e\.g\. 8,500"[^>]*>/) ?? html.match(/<input[^>]*value="(\d+)"[^>]*type="number"[^>]*>/) ?? [''])[0];
const rentValue = (html: string) => {
  const label = html.indexOf('Est. Monthly Rent');
  const input = html.slice(label).match(/<input[^>]*>/)?.[0] ?? '';
  return input.match(/value="([^"]*)"/)?.[1] ?? '';
};

describe('a commercial space opens the calculator with no rent', () => {
  it.each([0, 8])('%i bedrooms (a medical office counts its offices as bedrooms): the rent box is empty, with an example, and no returns are shown', (bedrooms) => {
    const html = render({ bedrooms, isCommercial: true });
    expect(rentValue(html)).toBe('');
    expect(rentBox(html)).toMatch(/placeholder="e\.g\. 8,500"/);
    expect(html).toMatch(/Enter the monthly rent you expect for this space/);
    expect(html).toMatch(/so no rent is assumed/);
    for (const hidden of ['Total ROI', 'Monthly Cash Flow', 'Monthly Breakdown', 'Year Projection', 'Additional Metrics', 'Positive cash flow', 'Negative cash flow']) expect(html).not.toContain(hidden);
    expect(html).not.toMatch(/2,?500|8,?000/);                                    // neither the studio's rent nor the 4-bedroom row
  });

  it('the inputs that do not depend on a rent are still there', () => {
    const html = render({ bedrooms: 8, isCommercial: true });
    for (const label of ['Est. Monthly Rent', 'Down Payment', 'Interest Rate', 'Vacancy Rate', 'Holding Period']) expect(html).toContain(label);
  });

  it('a rent the listing states opens the calculator at that figure, with the returns shown', () => {
    const html = render({ bedrooms: 8, isCommercial: true, expectedMonthlyRent: 8500 });
    expect(rentValue(html)).toBe('8500');
    expect(html).toContain('Total ROI');
    expect(html).toContain('Monthly Breakdown');
    expect(html).not.toMatch(/Enter the monthly rent you expect/);
  });
});

describe('a residential listing is unchanged', () => {
  it.each([[0, '2500'], [1, '3200'], [2, '4500'], [3, '6000'], [4, '8000'], [6, '8000']])('%i bedrooms opens at $%s, with the returns shown', (bedrooms, rent) => {
    const html = render({ bedrooms });
    expect(rentValue(html)).toBe(rent);
    expect(html).toContain('Total ROI');
    expect(html).not.toMatch(/Enter the monthly rent you expect/);
  });
});

describe('what is a commercial space', () => {
  it.each(['Commercial', 'Commercial Condo', 'Commercial Condop', 'Commercial Co-op', 'Office', 'Retail', 'MedicalOffice', 'RetailCondo', 'Industrial', 'Warehouse', 'Commercial Sale'])('%s is', (type) => {
    expect(isCommercialSpace(type)).toBe(true);
    expect(isCommercialSpace('Residential', type)).toBe(true);
  });
  it.each(['Condo', 'Co-op', 'Condop', 'Townhouse', 'Apartment', 'Residential', 'Single Family', 'Loft', 'Multi-Family', 'Mixed Use'])('%s is not', (type) => {
    expect(isCommercialSpace(type)).toBe(false);
    expect(isCommercialSpace(type, type)).toBe(false);
  });
  it('a listing with no type is not', () => {
    expect(isCommercialSpace()).toBe(false);
    expect(isCommercialSpace(null, null)).toBe(false);
    expect(isCommercialSpace('', '')).toBe(false);
  });
});

describe('the listing page tells the calculator', () => {
  it('passes the listing\'s own type, so a commercial condo gets the no-rent calculator', () => {
    const page = readFileSync(resolve(__dirname, '../../app/listing/[...slug]/page.tsx'), 'utf8');
    expect(page).toMatch(/isCommercial=\{isCommercialSpace\(listing\.propertyType, listing\.propertySubType\)\}/);
  });
});
