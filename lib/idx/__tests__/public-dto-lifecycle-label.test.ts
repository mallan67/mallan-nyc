/**
 * The public DTO carries the broker-language status label from the label authority, sale/rental aware, plus the
 * lifecycle signals the census proved. Pending (In Contract) is publicly displayable (Maya, 2026-09-08).
 */
import { DISPLAYABLE_STATUSES, dbListingToPublicDTO, filterDisplayableDbListings, type DbListing } from '../db-to-public-dto';

const BASE: DbListing = {
  id: '1', listing_id: 'RLS20059088', status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condo',
  list_price: '1000000', bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: '1000', borough: 'manhattan', neighborhood: 'Chelsea',
  address: { StreetNumber: '100', StreetName: 'W 20th St', UnitNumber: '4A', City: 'New York City', PostalCode: '10011', Borough: 'manhattan' },
  features: {}, media: [], agent_info: { ListOfficeName: 'Some Office', ListAgentFullName: 'Some Agent' },
  agent_id: null, owner_client_id: null, rls_eligible: true, idx_display_yn: true,
  internet_entire_listing_display_yn: true, internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
  raw_data: {},
  created_at: new Date('2026-09-01T00:00:00Z'), updated_at: new Date('2026-09-08T00:00:00Z'), modification_timestamp: new Date('2026-09-08T00:00:00Z'),
} as unknown as DbListing;

describe('public DTO — status label and lifecycle', () => {
  it('Pending is displayable and reads In Contract, with the contract date', () => {
    expect(DISPLAYABLE_STATUSES).toContain('Pending');
    const dto = dbListingToPublicDTO({ ...BASE, status: 'Pending', raw_data: { PurchaseContractDate: '2026-09-04' } } as DbListing)!;
    expect(dto.status).toBe('In Contract');
    expect(dto.lifecycle).toMatchObject({ stage: 'in_contract', inContractSince: '2026-09-04' });
  });
  it('Closed reads Sold for a sale and Rented for a rental', () => {
    expect(dbListingToPublicDTO({ ...BASE, status: 'Closed' } as DbListing)!.status).toBe('Sold');
    expect(dbListingToPublicDTO({ ...BASE, status: 'Closed', listing_type: 'rent' } as DbListing)!.status).toBe('Rented');
  });
  it('Active with MajorChangeType BackOnMarket carries backOnMarket', () => {
    const dto = dbListingToPublicDTO({ ...BASE, raw_data: { MajorChangeType: 'BackOnMarket', BackOnMarketDate: '2026-04-23' } } as DbListing)!;
    expect(dto.status).toBe('Active');
    expect(dto.lifecycle).toMatchObject({ stage: 'active', backOnMarket: true, backOnMarketDate: '2026-04-23' });
  });
  it('a row that is off the feed is never publicly displayable, even with its preserved provider status Active', () => {
    expect(DISPLAYABLE_STATUSES).not.toContain('Delisted');
    expect(DISPLAYABLE_STATUSES).not.toContain('Withdrawn');
    expect(filterDisplayableDbListings([{ ...BASE, sync_status: 'off_feed' } as DbListing])).toEqual([]);
    expect(filterDisplayableDbListings([{ ...BASE, sync_status: 'synced' } as DbListing])).toHaveLength(1);
    const dto = dbListingToPublicDTO({ ...BASE, sync_status: 'off_feed', terminal_since: new Date('2026-09-02T03:30:00Z') } as DbListing)!;
    expect(dto.status).toBe('Off Market — reason unknown');
    expect(dto.lifecycle).toMatchObject({ stage: 'off_market', providerStage: 'active', offFeedSince: '2026-09-02' });
  });
});

describe('public DTO — price change date', () => {
  it('a price change is dated by PriceChangeTimestamp, never approximated from the modification time', () => {
    const dto = dbListingToPublicDTO({ ...BASE, raw_data: { PriceChangeTimestamp: '2026-08-30T14:02:11Z' } } as DbListing)!;
    expect(dto.lifecycle).toMatchObject({ priceChangeTimestamp: '2026-08-30T14:02:11Z' });
  });
});
