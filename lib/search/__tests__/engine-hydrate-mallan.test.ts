/// <reference types="jest" />
/**
 * Mallan hydration precedence (Search Consolidation Packet 1 closure):
 *   verified typed Mallan column → existing form payload in raw_data → null.
 * Never a fabricated zero/default, no second storage. Pure: mallanRecord is exercised
 * directly and its output run through the shared mapper.
 */
import { mallanRecord } from '@/lib/search/engine/hydrate';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/search/engine/provider-client', () => ({ queryProvider: jest.fn(), walkProvider: jest.fn() }));

const base = {
  listing_id: 'SL-QA-15207DAA', status: 'Active', listing_type: 'sale', property_sub_type: 'Condominium',
  list_price: 1500000, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 1, living_area: 900,
  borough: 'Manhattan', neighborhood: 'Tribeca', city: 'New York', postal_code: '10007',
  address: { UnparsedAddress: 'SYNTHETIC' }, media: [], photo_count: 0, listing_contract_date: new Date('2026-09-01T00:00:00Z'), updated_at: new Date('2026-09-05T00:00:00Z'),
  list_agent_full_name: 'Search QA Fixture', list_office_name: null, listing_media: [],
  raw_data: null as unknown, days_on_market: null as number | null, cumulative_days_on_market: null as number | null,
};

describe('7. Mallan row with fees/frequency/tax in existing raw_data surfaces the real values', () => {
  const rec = mallanRecord({ ...base, raw_data: { AssociationFee: 850, AssociationFeeFrequency: 'Monthly', TaxAnnualAmount: 6000, RoomsTotal: 4, ListingAgreement: 'ExclusiveRightToSell' } } as never);
  const dto = mapTrestleToCrmListing(rec, 0);
  test('provider-shaped record carries the stored facts under the provider key names', () => {
    expect(rec).toMatchObject({ AssociationFee: 850, AssociationFeeFrequency: 'Monthly', TaxAnnualAmount: 6000, RoomsTotal: 4, ListingAgreement: 'ExclusiveRightToSell' });
  });
  test('the shared mapper produces monthly maintenance, monthly tax and a real total', () => {
    expect(dto.maintCC).toBe(850);
    expect(dto.reTaxes).toBe(500);
    expect(dto.totalMonthly).toBe(1350);
    expect(dto.rooms).toBe(4);
    expect(dto.listingType).toBe('ExclusiveRightToSell');
  });
});

describe('8. Mallan row with those facts absent remains unknown', () => {
  test('no raw_data → null fees/tax/rooms/original price/listing type; total unavailable; nothing zeroed', () => {
    const dto = mapTrestleToCrmListing(mallanRecord(base as never), 0);
    expect(dto.maintCC).toBeNull();
    expect(dto.associationFee).toBeNull();
    expect(dto.reTaxes).toBeNull();
    expect(dto.totalMonthly).toBeNull();
    expect(dto.rooms).toBeNull();
    expect(dto.originalPrice).toBeNull();
    expect(dto.listingType).toBeNull();
    expect(dto.dom).toBeNull();
  });
  test('empty-string frequency is unknown, not Monthly; a fee with unknown frequency is never monthly maintenance', () => {
    const dto = mapTrestleToCrmListing(mallanRecord({ ...base, raw_data: { AssociationFee: 900, AssociationFeeFrequency: '' } } as never), 0);
    expect(dto.associationFee).toBe(900);
    expect(dto.associationFeeFrequency).toBeNull();
    expect(dto.maintCC).toBeNull();
    expect(dto.totalMonthly).toBeNull();
  });
  test('typed Mallan DOM columns take precedence and pass through', () => {
    const dto = mapTrestleToCrmListing(mallanRecord({ ...base, days_on_market: 12, cumulative_days_on_market: 40 } as never), 0);
    expect(dto.dom).toBe(12);
    expect(dto.cdom).toBe(40);
  });
  test('Mallan identity and universe facts are unchanged', () => {
    const rec = mallanRecord(base as never);
    expect(rec).toMatchObject({ ListingId: 'SL-QA-15207DAA', ListingKey: null, PropertyType: 'Residential', CityRegion: 'Manhattan', ListPrice: 1500000 });
  });
});
