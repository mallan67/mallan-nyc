/// <reference types="jest" />
/**
 * The rent the Investment Analysis starts from (Maya, 2026-11-05: "use this approx rental information for calculator, nothing in manhattan is 2500 for rent especially not commercial").
 * 800 2nd Ave #806, a medical office, was last advertised at $40 a square foot on 1,482 square feet; the calculator started from a residential studio's $2,500.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { listingRentFromPsf, marketRentDefault, showsInvestorCalculator } from '@/lib/calculators/rent-estimate';

describe('a commercial listing starts from the rent the broker entered', () => {
  it('800 2nd Ave #806: $40 per SF a year on 1,482 SF is $59,280 a year, $4,940 a month', () => {
    expect(listingRentFromPsf({ saleCommercialRentPSF: '40' }, 1482)).toEqual({ monthly: 4940, perSqFtYear: 40, sqFt: 1482 });
    expect(listingRentFromPsf({ saleCommercialRentPSF: 40 }, '1482')).toEqual({ monthly: 4940, perSqFtYear: 40, sqFt: 1482 });
  });

  it('a rate typed with a dollar sign or a comma, and an area with a comma, are read', () => {
    expect(listingRentFromPsf({ saleCommercialRentPSF: '$42.50' }, '1,482')).toEqual({ monthly: 5249, perSqFtYear: 42.5, sqFt: 1482 });     // 42.50 x 1,482 / 12 = 5,248.75, to the nearest dollar
  });

  it.each([[undefined], [null], [{}], [{ saleCommercialRentPSF: '' }], [{ saleCommercialRentPSF: 0 }], [{ saleCommercialRentPSF: -5 }], [{ saleCommercialRentPSF: 'abc' }]])('no usable rate (%j): no rent', (raw) => {
    expect(listingRentFromPsf(raw as Record<string, unknown> | null | undefined, 1482)).toBeUndefined();
  });

  it.each([[0], [null], [undefined], ['']])('no area (%j): no rent', (area) => {
    expect(listingRentFromPsf({ saleCommercialRentPSF: 40 }, area)).toBeUndefined();
  });
});

describe('when the page shows the Investment Analysis', () => {
  it('a home: yes. A rental page: no (it has its own calculator)', () => {
    expect(showsInvestorCalculator({ isRental: false })).toBe(true);
    expect(showsInvestorCalculator({ isRental: true })).toBe(false);
  });
  it('a commercial listing: only with a rent entered', () => {
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true })).toBe(false);
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true, estimatedRent: null })).toBe(false);
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true, estimatedRent: { monthly: 4940, perSqFtYear: 40, sqFt: 1482 } })).toBe(true);
  });
});

describe('a home starts from the median asking rent of live rentals of its size in its borough', () => {
  it('Manhattan: nothing is $2,500 (read live from Cotality 2026-11-05: 524 active Manhattan rentals)', () => {
    const rents = [0, 1, 2, 3, 4].map((beds) => marketRentDefault(beds, 'Manhattan').monthly);
    expect(rents).toEqual([3900, 4995, 7700, 11750, 34000]);
    expect(Math.min(...rents)).toBeGreaterThan(3000);
    expect(rents).toEqual([...rents].sort((a, b) => a - b));                                  // more bedrooms, more rent
  });

  it('says where the number comes from, in words a visitor can read', () => {
    expect(marketRentDefault(1, 'Manhattan').basis).toBe('Median asking rent of 1-bedroom rentals active in Manhattan (Cotality, November 2026)');
    expect(marketRentDefault(0, 'Manhattan').basis).toContain('studio rentals');
    expect(marketRentDefault(4, 'Manhattan').basis).toContain('4+ bedroom rentals');
  });

  it('Brooklyn has its own medians; the other boroughs are pooled', () => {
    expect(marketRentDefault(1, 'Brooklyn')).toMatchObject({ monthly: 4050 });
    for (const borough of ['Queens', 'Bronx', 'Staten Island', 'StatenIsland']) expect(marketRentDefault(1, borough).monthly).toBe(3688);
    expect(marketRentDefault(1, 'Queens').basis).toContain('the outer boroughs');
  });

  it('no borough, or an unknown one, is Manhattan (the site\'s own market), and says so', () => {
    for (const borough of [undefined, null, '', '  ', 'New York']) expect(marketRentDefault(1, borough)).toMatchObject({ monthly: 4995 });
    expect(marketRentDefault(1, undefined).basis).toContain('Manhattan');
  });

  it('the bedroom count is a whole number from studio to 4+', () => {
    expect(marketRentDefault(7, 'Manhattan').monthly).toBe(34000);
    expect(marketRentDefault(-1, 'Manhattan').monthly).toBe(3900);
    expect(marketRentDefault(NaN, 'Manhattan').monthly).toBe(3900);
    expect(marketRentDefault(undefined, 'Manhattan').monthly).toBe(3900);
    expect(marketRentDefault(1.4, 'Manhattan').monthly).toBe(4995);
    expect(marketRentDefault('2', 'Manhattan').monthly).toBe(7700);
  });
});

describe('the listing page wires it', () => {
  const page = readFileSync(resolve(__dirname, '../../app/listing/[...slug]/page.tsx'), 'utf8');

  it('the calculator gets the borough and the rent entered for the listing, and the section is left out when it does not apply', () => {
    expect(page).toContain('showsInvestorCalculator({ isRental, isCommercial: listing.isCommercial, estimatedRent: listing.estimatedRent })');
    expect(page).toContain('borough={borough}');
    expect(page).toContain('defaultMonthlyRent={listing.estimatedRent?.monthly}');
    expect(page).toMatch(/rentBasis=\{listing\.estimatedRent \? `\$\$\{listing\.estimatedRent\.perSqFtYear\} per SF a year on/);
  });
});
