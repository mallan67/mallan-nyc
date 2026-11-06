/// <reference types="jest" />
/**
 * The rent the Investment Analysis starts from (Maya, 2026-11-05: "use this approx rental information for calculator, nothing in manhattan is 2500 for rent especially not commercial").
 * 800 2nd Ave #806, a medical office, was last advertised at $40 a square foot on 1,482 square feet; the calculator started from a residential studio's $2,500.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { listingRentFromPsf, marketRentDefault, showsInvestorCalculator, commercialRentDefault } from '@/lib/calculators/rent-estimate';

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
  it('a commercial listing: with a rent entered, or the average rent per SF; with neither, no', () => {
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true })).toBe(false);
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true, estimatedRent: null, commercialMarketRent: null })).toBe(false);
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true, estimatedRent: { monthly: 4940, perSqFtYear: 40, sqFt: 1482 } })).toBe(true);
    expect(showsInvestorCalculator({ isRental: false, isCommercial: true, commercialMarketRent: commercialRentDefault('Manhattan', 1482) })).toBe(true);
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
    expect(marketRentDefault(1, 'Manhattan').basis).toBe('Based on average asking rents for 1-bedroom apartments in Manhattan');
    expect(marketRentDefault(0, 'Manhattan').basis).toBe('Based on average asking rents for studio apartments in Manhattan');
    expect(marketRentDefault(4, 'Manhattan').basis).toContain('4+ bedroom apartments');
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
    expect(page).toContain('showsInvestorCalculator({ isRental, isCommercial: listing.isCommercial, estimatedRent: listing.estimatedRent, commercialMarketRent })');
    expect(page).toContain('commercialRentDefault(borough, listing.livingArea)');
    expect(page).toContain('defaultMonthlyRent={(listing.estimatedRent ?? commercialMarketRent)?.monthly}');
    expect(page).toContain('borough={borough}');
    expect(page).toMatch(/rentBasis=\{listing\.estimatedRent \? `Based on the rent entered for this listing: \$\$\{listing\.estimatedRent\.perSqFtYear\} per SF a year on/);
  });
});

describe('a commercial listing with no rent entered starts from the average rent per SF (Maya, 2026-11-06: "the commercial needs average per sq ft")', () => {
  it('Manhattan: $78 per SF a year (the median of 24 usable commercial-use rentals in Cotality) times the unit\'s area, over 12 months', () => {
    const r = commercialRentDefault('Manhattan', 1482)!;
    expect(r).toMatchObject({ monthly: 9633, perSqFtYear: 78, sqFt: 1482 });                       // 78 x 1,482 / 12
    expect(r.basis).toBe('Based on average commercial rents in Manhattan: $78 per SF a year on 1,482 SF');
  });

  it('says it is based on average rents (Maya, 2026-11-06: "the disclaimer should be it is based on average rents")', () => {
    expect(commercialRentDefault('manhattan', 1000)!.basis).toMatch(/^Based on average commercial rents/);
    expect(marketRentDefault(2, 'Brooklyn').basis).toMatch(/^Based on average asking rents/);
  });

  it.each([['Brooklyn'], ['Queens'], ['Bronx'], ['Staten Island'], [''], [null], [undefined]])('%j: no average (too few rentals to average, or no borough), so nothing is guessed', (borough) => {
    expect(commercialRentDefault(borough as string | null | undefined, 1482)).toBeUndefined();
  });

  it.each([[0], [null], [undefined], ['abc'], [-5]])('no usable area (%j): no rent', (area) => {
    expect(commercialRentDefault('Manhattan', area)).toBeUndefined();
  });

  it('the rent entered for the listing is a different thing, and the page prefers it: 800 2nd Ave at $40 is $4,940 a month, not the average\'s $9,633', () => {
    expect(listingRentFromPsf({ saleCommercialRentPSF: 40 }, 1482)!.monthly).toBe(4940);
    expect(commercialRentDefault('Manhattan', 1482)!.monthly).toBeGreaterThan(4940);
  });
});
