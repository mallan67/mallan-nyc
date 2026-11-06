/**
 * The rent the Investment Analysis of a sale listing starts from (Maya, 2026-11-05: "use this approx rental information for calculator, nothing in manhattan is 2500 for rent especially not commercial").
 *
 * The calculator used a flat table of guesses ($2,500 a studio, $3,200 a one-bedroom, ...) for every listing, commercial ones included: 800 2nd Ave, a medical office last advertised at $40 a square foot on
 * 1,482 square feet ($4,940 a month), started from a residential studio's $2,500. Now:
 *   - a COMMERCIAL listing starts from the rent the broker enters on the Sale form (Commercial section, "Rent ($ per SF per year)"): that rate times the listing's area, over 12 months. With none entered
 *     it starts from the AVERAGE rent per square foot of the commercial-use rentals in Cotality (Maya, 2026-11-06: "the commercial needs average per sq ft"), for Manhattan, the only borough with enough of
 *     them to average; a commercial listing elsewhere, with no rent entered, has nothing to start from and the page does not show the calculator for it;
 *   - a HOME starts from the median asking rent of the rentals live in Cotality for its size, by borough (the table below), and says so under the box.
 */

import { rlsStatisticalDisclaimer } from '@/lib/compliance/rls-statistical-disclaimer';

export interface ListingRent { monthly: number; perSqFtYear: number; sqFt: number }

const toNumber = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** The rent a broker entered for a (commercial) listing: dollars per square foot per YEAR (how commercial space is quoted) times the listing's area, over 12 months. */
export function listingRentFromPsf(rawData: Record<string, unknown> | null | undefined, livingArea: unknown): ListingRent | undefined {
  const perSqFtYear = toNumber(rawData?.saleCommercialRentPSF);
  const sqFt = toNumber(livingArea);
  if (perSqFtYear <= 0 || sqFt <= 0) return undefined;
  return { monthly: Math.round((perSqFtYear * sqFt) / 12), perSqFtYear, sqFt: Math.round(sqFt) };
}

/** A commercial listing's starting rent when its broker entered none: the average rent per SF of the commercial-use rentals in Cotality times its area, with how that average was found. */
export interface CommercialMarketRent extends ListingRent { basis: string; disclaimer: string }

// Median ASKING (or closed) rent per square foot per YEAR of the commercial-use rentals of Manhattan in the Cotality feed, read live 2026-11-06. Cotality holds no CommercialLease or CommercialSale record on this
// licence (0 of each): commercial space is filed as a ResidentialLease with a CurrentUse of Office, MedicalDental or Retail, or a PropertySubType of Office or Retail. Of the 42 such Manhattan rentals, 24 are
// usable (an area of 200 to 5,000 SF and $10 to $200 a SF a year: the rest are entries such as a 480,871 SF "office" or $3 a SF); median $77.7, mean $78.5, middle half $64.6 to $105. They run from 2012 to
// 2026 and only 4 are since 2023, so this is a thin and dated average: the rent the broker enters always replaces it. Other boroughs have too few to average. To refresh it, take PropertyType eq
// 'ResidentialLease' with that CurrentUse or PropertySubType in a borough, drop the entries outside those ranges, and take the median of ListPrice (ClosePrice when closed) x 12 / area.
// The period is the one the 24 rentals cover (their close or on-market dates: 2012-11-28 to 2026-07-24), which the statistical disclaimer (UCBA 2026 Art. VIII Sec. 4) must state truly. The size range is the
// one the 24 rentals have (200 to 5,000 SF): a unit outside it is not a unit this average describes.
const COMMERCIAL_MEDIAN_RENT_PSF_YEAR = { manhattan: { perSqFtYear: 78, rentals: 24, years: '2012 to 2026', period: { start: '2012-11-28', end: '2026-07-24' }, sqFtRange: [200, 5000] } } as const;

export function commercialRentDefault(borough: string | null | undefined, sqFt: unknown): CommercialMarketRent | undefined {
  if (!/manhattan/i.test(String(borough ?? ''))) return undefined;                       // no borough, or one with too few rentals to average: nothing is guessed
  const area = toNumber(sqFt);
  const m = COMMERCIAL_MEDIAN_RENT_PSF_YEAR.manhattan;
  if (area < m.sqFtRange[0] || area > m.sqFtRange[1]) return undefined;                  // no area, or a unit the average does not describe: nothing is guessed
  return {
    monthly: Math.round((m.perSqFtYear * area) / 12), perSqFtYear: m.perSqFtYear, sqFt: Math.round(area),
    basis: `Based on median commercial rents in Manhattan: $${m.perSqFtYear} per SF a year on ${Math.round(area).toLocaleString('en-US')} SF`,
    disclaimer: rlsStatisticalDisclaimer(m.period.start, m.period.end),
  };
}

/** The rent now paid by the tenant in place, as the broker entered it on the Sale form (Current Rent, dollars a month): the unit's own fact, the first thing the Investment Analysis starts from. */
export function currentRentFromRaw(rawData: Record<string, unknown> | null | undefined): number | undefined {
  const rent = toNumber(rawData?.saleCurrentMonthlyRent);
  return rent > 0 ? Math.round(rent) : undefined;
}

/** Whether the page shows the Investment Analysis: never on a rental page (it has its own calculator), and on a commercial listing only when there is a rent to start from: the one entered, or the average. */
export function showsInvestorCalculator(listing: { isRental: boolean; isCommercial?: boolean; estimatedRent?: ListingRent | null; commercialMarketRent?: CommercialMarketRent | null; currentRent?: number | null }): boolean {
  if (listing.isRental) return false;
  return !(listing.isCommercial && !listing.estimatedRent && !listing.commercialMarketRent && !listing.currentRent);
}

// Median ASKING rent a month of the ACTIVE rentals in the Cotality feed, by bedrooms (studio, 1, 2, 3, 4+), read live 2026-11-05 (1,001 active rentals: 524 Manhattan, 356 Brooklyn, 104 Queens, 17 Bronx and
// Staten Island). The other boroughs are pooled (477 rentals): Queens alone has 6 studios, so its own median would be noise. The 4+ figure is a luxury-heavy median (23 Manhattan rentals). To refresh it,
// take PropertyType eq 'ResidentialLease' and StandardStatus eq 'Active' with BedroomsTotal, ListPrice and CityRegion, and take the median ListPrice of each group.
const MEDIAN_ASKING_RENT = {
  manhattan: [3900, 4995, 7700, 11750, 34000],
  brooklyn: [3458, 4050, 5550, 5935, 8400],
  outer: [3400, 3688, 4773, 5235, 6215],
} as const;
const BED_WORDS = ['studio apartments', '1-bedroom apartments', '2-bedroom apartments', '3-bedroom apartments', '4+ bedroom apartments'] as const;
const AREA_WORDS = { manhattan: 'Manhattan', brooklyn: 'Brooklyn', outer: 'the outer boroughs' } as const;

export type MarketRent = { monthly: number; basis: string; disclaimer: string };

// The statistics are a snapshot of the rentals ACTIVE on this day, so the period they cover starts and ends on it (the Execution State's rule for a snapshot of the current inventory).
const RESIDENTIAL_RENT_PERIOD = { start: '2026-11-05', end: '2026-11-05' } as const;

/** A home's starting rent: the median asking rent of live rentals of its size in its borough. No borough means Manhattan (the site's own market). */
export function marketRentDefault(bedrooms: unknown, borough?: string | null): MarketRent {
  const b = String(borough ?? '').trim().toLowerCase();
  const area: keyof typeof MEDIAN_ASKING_RENT = b === '' || b.includes('manhattan') || b === 'new york' ? 'manhattan' : b.includes('brooklyn') ? 'brooklyn' : 'outer';
  const beds = Math.min(4, Math.max(0, Math.round(toNumber(bedrooms))));
  return {
    monthly: MEDIAN_ASKING_RENT[area][beds],
    basis: `Based on median asking rents for ${BED_WORDS[beds]} in ${AREA_WORDS[area]}`,
    disclaimer: rlsStatisticalDisclaimer(RESIDENTIAL_RENT_PERIOD.start, RESIDENTIAL_RENT_PERIOD.end),
  };
}
