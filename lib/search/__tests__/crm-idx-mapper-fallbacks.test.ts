/// <reference types="jest" />
/**
 * Same-class fabrication census — Search Consolidation Packet 1 closure.
 *
 * Live Cotality (2026-09-05) declares ListPrice, BedroomsTotal, RoomsTotal, DaysOnMarket,
 * CumulativeDaysOnMarket, OriginalListPrice, TaxAnnualAmount and AssociationFee nullable, and
 * AssociationFeeFrequency as the 15-member FeeFrequency enum. UNKNOWN and ZERO are different
 * facts: absence never becomes 0, a literal 0 is preserved, and no default status, borough or
 * property type is invented. These are direct tests of the shared DTO mapper.
 */
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

const sale = (raw: Record<string, unknown>) => mapTrestleToCrmListing({ ListingKey: 'k', PropertyType: 'Residential', StandardStatus: 'Active', ...raw }, 0);

describe('1–4: fees and taxes — absent is unavailable, zero is zero', () => {
  test('1. missing AssociationFee → maintCC unavailable, not $0', () => {
    const l = sale({ AssociationFeeFrequency: 'Monthly' });
    expect(l.maintCC).toBeNull();
    expect(l.associationFee).toBeNull();
  });
  test('2. AssociationFee = 0 explicitly (Monthly) → zero preserved', () => {
    const l = sale({ AssociationFee: 0, AssociationFeeFrequency: 'Monthly' });
    expect(l.maintCC).toBe(0);
    expect(l.associationFee).toBe(0);
  });
  test('3. missing TaxAnnualAmount → reTaxes unavailable, not $0', () => {
    expect(sale({}).reTaxes).toBeNull();
  });
  test('4. TaxAnnualAmount = 0 explicitly → zero preserved', () => {
    expect(sale({ TaxAnnualAmount: 0 }).reTaxes).toBe(0);
  });
});

describe('5–6: fee frequency semantics', () => {
  test('5. Monthly AssociationFee is monthly maintenance and enters the total', () => {
    const l = sale({ AssociationFee: 850, AssociationFeeFrequency: 'Monthly', TaxAnnualAmount: 6000 });
    expect(l.maintCC).toBe(850);
    expect(l.reTaxes).toBe(500);
    expect(l.totalMonthly).toBe(1350);
    expect(l.associationFeeFrequency).toBe('Monthly');
  });
  test.each(['Annually', 'Quarterly', 'BiMonthly', 'FullTerm', 'Seasonal', 'Other', 'SeeAgent', 'SeeRemarks', 'NotApplicable', 'OneTime'])(
    '6. %s fee is preserved raw, never labelled monthly, never totalled', (freq) => {
      const l = sale({ AssociationFee: 3000, AssociationFeeFrequency: freq, TaxAnnualAmount: 6000 });
      expect(l.associationFee).toBe(3000);
      expect(l.associationFeeFrequency).toBe(freq);
      expect(l.maintCC).toBeNull();
      expect(l.totalMonthly).toBeNull();
      expect(l.reTaxes).toBe(500);
    });
  test('6b. a fee without a frequency is not assumed monthly', () => {
    const l = sale({ AssociationFee: 900 });
    expect(l.maintCC).toBeNull();
    expect(l.totalMonthly).toBeNull();
  });
});

describe('total monthly is a total or nothing', () => {
  test('sale: tax known, fee unknown → no total', () => {
    expect(sale({ TaxAnnualAmount: 12000 }).totalMonthly).toBeNull();
  });
  test('sale: fee known (Monthly), tax unknown → no total', () => {
    expect(sale({ AssociationFee: 700, AssociationFeeFrequency: 'Monthly' }).totalMonthly).toBeNull();
  });
  test('sale: both explicit zeros → total 0 (a fact, not a fabrication)', () => {
    expect(sale({ AssociationFee: 0, AssociationFeeFrequency: 'Monthly', TaxAnnualAmount: 0 }).totalMonthly).toBe(0);
  });
  test('rental: totalMonthly keeps the verified rental meaning (= ListPrice) and is untouched by fees', () => {
    const l = mapTrestleToCrmListing({ ListingKey: 'r', PropertyType: 'ResidentialLease', StandardStatus: 'Active', ListPrice: 4500 }, 0);
    expect(l.totalMonthly).toBe(4500);
    expect(l.listingCategory).toBe('rental');
    expect(l.maintCC).toBeNull();
  });
});

describe('9: nullable numerics never become fabricated zero', () => {
  test('rooms / beds / DOM / CDOM / price / original price absent → null', () => {
    const l = sale({});
    expect(l.rooms).toBeNull();
    expect(l.beds).toBeNull();
    expect(l.dom).toBeNull();
    expect(l.cdom).toBeNull();
    expect(l.price).toBeNull();
    expect(l.originalPrice).toBeNull();
    expect(l.priceChange).toBeNull();
  });
  test('explicit zeros are preserved as zeros', () => {
    const l = sale({ RoomsTotal: 0, BedroomsTotal: 0, DaysOnMarket: 0, CumulativeDaysOnMarket: 0 });
    expect(l.rooms).toBe(0);
    expect(l.beds).toBe(0);
    expect(l.dom).toBe(0);
    expect(l.cdom).toBe(0);
  });
  test('original price only when both prices are known and differ; price change derived only then', () => {
    expect(sale({ ListPrice: 900000, OriginalListPrice: 950000 })).toMatchObject({ originalPrice: 950000, priceChange: 'down' });
    expect(sale({ ListPrice: 900000, OriginalListPrice: 900000 })).toMatchObject({ originalPrice: null, priceChange: null });
    expect(sale({ OriginalListPrice: 950000 })).toMatchObject({ price: null, originalPrice: null, priceChange: null });
  });
});

describe('10–12: no invented status, borough or property type', () => {
  test('10. missing status → UNKNOWN, never Active', () => {
    const l = mapTrestleToCrmListing({ ListingKey: 'k', PropertyType: 'Residential' }, 0);
    expect(l.status).toBe('UNKNOWN');
    expect(l.mlsStatus).toBe('');
  });
  test('11. missing borough → null, never Manhattan; CountyOrParish is not a borough', () => {
    expect(sale({}).borough).toBeNull();
    expect(sale({ CountyOrParish: 'New York' }).borough).toBeNull();
    expect(sale({ CityRegion: 'StatenIsland' }).borough).toBe('StatenIsland');
  });
  test('12. missing property type → null, never Residential; listing type is the provider fact or null', () => {
    const l = mapTrestleToCrmListing({ ListingKey: 'k', StandardStatus: 'Active' }, 0);
    expect(l.propertyType).toBeNull();
    expect(l.listingType).toBeNull();
    expect(sale({ ListingAgreement: 'ExclusiveRightToSell' }).listingType).toBe('ExclusiveRightToSell');
    expect(sale({ CommonInterest: 'StockCooperative' }).propertyType).toBe('Co-op');
  });
});
