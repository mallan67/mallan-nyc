/**
 * The Search projection's feature_flags carry the lifecycle signals the census proved, derived from the retained
 * provider evidence in raw_data — in_contract (Pending + PurchaseContractDate) and back_on_market
 * (MajorChangeType BackOnMarket while Active). No schema growth: feature_flags is the existing JSON column.
 */
import { extractProjectionFeatureFlags, type ListingProjectionSource } from '../listing-search-projection';

const base = {
  id: '1', listing_id: 'RLS1', status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condo',
  list_price: null, bedrooms_total: null, bathrooms_full: null, bathrooms_half: null, living_area: null, year_built: null,
  borough: 'manhattan', neighborhood: 'Chelsea', address: {}, features: {}, media: [], rls_eligible: true,
  idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true, participant_only: false,
  owner_opt_out: false, modification_timestamp: null, mediaTypes: [], hadRelationalRows: true,
} as unknown as ListingProjectionSource;

describe('projection lifecycle flags', () => {
  it('Active + MajorChangeType BackOnMarket → back_on_market true', () => {
    const flags = extractProjectionFeatureFlags({ ...base, raw_data: { MajorChangeType: 'BackOnMarket', BackOnMarketDate: '2026-04-23' } } as ListingProjectionSource)!;
    expect(flags.back_on_market).toBe(true);
    expect(flags.in_contract).toBeFalsy();
  });
  it('Pending + PurchaseContractDate → in_contract true, back_on_market absent', () => {
    const flags = extractProjectionFeatureFlags({ ...base, status: 'Pending', raw_data: { PurchaseContractDate: '2026-09-04', MajorChangeType: 'Pending' } } as ListingProjectionSource)!;
    expect(flags.in_contract).toBe(true);
    expect(flags.back_on_market).toBeFalsy();
  });
  it('a Closed row is neither in contract nor back on market, whatever raw_data says (flags recorded only when true)', () => {
    const flags = extractProjectionFeatureFlags({ ...base, status: 'Closed', raw_data: { MajorChangeType: 'BackOnMarket', PurchaseContractDate: '2026-01-01' } } as ListingProjectionSource)!;
    expect(flags.in_contract).toBeFalsy();
    expect(flags.back_on_market).toBeFalsy();
  });
});
