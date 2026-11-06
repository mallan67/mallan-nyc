/**
 * The rent the Investment Analysis of a sale listing starts from (Maya, 2026-11-05: "use this approx rental information for calculator, nothing in manhattan is 2500 for rent especially not commercial").
 *
 * The calculator used a flat table of guesses ($2,500 a studio, $3,200 a one-bedroom, ...) for every listing, commercial ones included: 800 2nd Ave, a medical office last advertised at $40 a square foot on
 * 1,482 square feet ($4,940 a month), started from a residential studio's $2,500. Now:
 *   - a COMMERCIAL listing starts from the rent the broker enters on the Sale form (Commercial section, "Rent ($ per SF per year)"): that rate times the listing's area, over 12 months. With no rent entered
 *     there is nothing to start from, and the page does not show the calculator for it (an office has no bedroom count to guess a rent from);
 *   - a HOME starts from the median asking rent of the rentals live in Cotality for its size, by borough (the table below), and says so under the box.
 */

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

/** Whether the page shows the Investment Analysis: never on a rental page (it has its own calculator), and not on a commercial listing that has no rent entered. */
export function showsInvestorCalculator(listing: { isRental: boolean; isCommercial?: boolean; estimatedRent?: ListingRent | null }): boolean {
  if (listing.isRental) return false;
  return !(listing.isCommercial && !listing.estimatedRent);
}

// Median ASKING rent a month of the ACTIVE rentals in the Cotality feed, by bedrooms (studio, 1, 2, 3, 4+), read live 2026-11-05 (1,001 active rentals: 524 Manhattan, 356 Brooklyn, 104 Queens, 17 Bronx and
// Staten Island). The other boroughs are pooled (477 rentals): Queens alone has 6 studios, so its own median would be noise. The 4+ figure is a luxury-heavy median (23 Manhattan rentals). To refresh it,
// take PropertyType eq 'ResidentialLease' and StandardStatus eq 'Active' with BedroomsTotal, ListPrice and CityRegion, and take the median ListPrice of each group.
const MEDIAN_ASKING_RENT = {
  manhattan: [3900, 4995, 7700, 11750, 34000],
  brooklyn: [3458, 4050, 5550, 5935, 8400],
  outer: [3400, 3688, 4773, 5235, 6215],
} as const;
const BED_WORDS = ['studio', '1-bedroom', '2-bedroom', '3-bedroom', '4+ bedroom'] as const;
const AREA_WORDS = { manhattan: 'Manhattan', brooklyn: 'Brooklyn', outer: 'the outer boroughs' } as const;

export type MarketRent = { monthly: number; basis: string };

/** A home's starting rent: the median asking rent of live rentals of its size in its borough. No borough means Manhattan (the site's own market). */
export function marketRentDefault(bedrooms: unknown, borough?: string | null): MarketRent {
  const b = String(borough ?? '').trim().toLowerCase();
  const area: keyof typeof MEDIAN_ASKING_RENT = b === '' || b.includes('manhattan') || b === 'new york' ? 'manhattan' : b.includes('brooklyn') ? 'brooklyn' : 'outer';
  const beds = Math.min(4, Math.max(0, Math.round(toNumber(bedrooms))));
  return { monthly: MEDIAN_ASKING_RENT[area][beds], basis: `Median asking rent of ${BED_WORDS[beds]} rentals active in ${AREA_WORDS[area]} (Cotality, November 2026)` };
}
