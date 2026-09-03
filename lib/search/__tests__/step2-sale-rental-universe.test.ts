/// <reference types="jest" />
/**
 * STEP 2 — THE MAPPER MUST USE THE VERIFIED UNIVERSE, NOT A SUBSTRING.
 *
 * `crm-idx-mapper.ts` decided sale-vs-rental with:
 *
 *     const isRental = propertyType.toLowerCase().includes('lease');
 *     listingCategory: isRental ? 'rental' : undefined
 *
 * Against the live thirteen-member PropertyType vocabulary that is wrong twice:
 *
 *   `DisasterReliefRental` is a rental, contains no "lease", and was classified
 *   SALE. `CommercialLease` is not residential rental inventory and was
 *   classified RENTAL. And because sale was `undefined` — the leftover — every
 *   member Cotality has not yet populated becomes residential SALE inventory the
 *   moment it appears, silently.
 *
 * The browser already validates `listingCategory` against
 * `['sale','rental','Sale','Rental']` (compliance-gates-and-output.js:2445) but
 * both gates are written `if (l.listingCategory && …)`, so the `undefined` the
 * mapper actually emitted skipped validation entirely. Emitting an explicit
 * value makes that gate meaningful for the first time.
 */
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

const row = (PropertyType: unknown) =>
  mapTrestleToCrmListing({ ListingId: 'RLS20000001', PropertyType } as Record<string, unknown>, 0) as Record<string, unknown>;

describe('the mapper classifies by verified membership', () => {
  it('marks Residential explicitly as sale, not as an absence', () => {
    expect(row('Residential').listingCategory).toBe('sale');
  });

  it('marks ResidentialLease as rental', () => {
    expect(row('ResidentialLease').listingCategory).toBe('rental');
  });
});

describe('the substring defect is closed at the mapper', () => {
  it('does not classify DisasterReliefRental as a sale', () => {
    expect(row('DisasterReliefRental').listingCategory).not.toBe('sale');
  });

  it('does not classify CommercialLease as a residential rental', () => {
    expect(row('CommercialLease').listingCategory).not.toBe('rental');
  });
});

describe('unclassified provider types do not become sale inventory', () => {
  it.each(['Land', 'CommercialSale', 'MultiFamily', 'ResidentialIncome', 'Farm', 'BusinessOpportunity'])(
    '%s is not emitted as sale',
    (pt) => {
      // Every one of these is zero-population TODAY. That is exactly why the
      // negation looked correct and why this test exists.
      expect(row(pt).listingCategory).not.toBe('sale');
    },
  );

  it.each([null, undefined, '', 'SomethingNew'])('%p is not emitted as sale', (pt) => {
    expect(row(pt).listingCategory).not.toBe('sale');
  });
});

describe('rental-only pricing does not leak into sale', () => {
  it('does not apply per-month rental treatment to a sale listing', () => {
    // `totalMonthly` is computed differently for rentals. A misclassified sale
    // would carry a rental monthly figure into every calculator and report.
    const sale = mapTrestleToCrmListing(
      { ListingId: 'RLS1', PropertyType: 'Residential', ListPrice: 1_250_000 } as Record<string, unknown>,
      0,
    ) as Record<string, unknown>;
    expect(sale.listingCategory).toBe('sale');
    expect(sale.totalMonthly).not.toBe(1_250_000);
  });

  it('a rental keeps its rental treatment', () => {
    const rental = mapTrestleToCrmListing(
      { ListingId: 'RLS2', PropertyType: 'ResidentialLease', ListPrice: 4_500 } as Record<string, unknown>,
      0,
    ) as Record<string, unknown>;
    expect(rental.listingCategory).toBe('rental');
    expect(rental.totalMonthly).toBe(4_500);
  });
});
