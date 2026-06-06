/// <reference types="jest" />
/**
 * PR-C follow-up (Codex on #361) — DB-backed /api/listings must carry the
 * virtual-tour URL so SearchListingCard can render the 3D Tour badge.
 *
 * `dbListingToPublicDTO` derives `virtualTourURL` from
 * `raw_data.VirtualTourURLUnbranded` / `VirtualTourURLBranded` — those fields
 * live ONLY in `raw_data` (the `features` JSON excludes the B26 media group).
 * The DB-first search select omitted `raw_data`, so DB-backed cards always got
 * `virtualTourURL: undefined` and the badge never showed. This pins the DTO
 * derivation; a sibling source guard pins that the route select includes
 * `raw_data`.
 */
import { dbListingToPublicDTO, type DbListing } from '../db-to-public-dto';

const BASE: DbListing = {
  id: '1',
  listing_id: 'RLS20059088',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: 'Condo',
  list_price: '1280000',
  bedrooms_total: 2,
  bathrooms_full: 2,
  bathrooms_half: 0,
  living_area: '1100',
  borough: 'manhattan',
  neighborhood: 'Midtown',
  address: {
    StreetNumber: '217',
    StreetName: 'W 57th Street',
    UnitNumber: '50A',
    City: 'New York City',
    PostalCode: '10019',
    Borough: 'manhattan',
  },
  features: {},
  media: [],
  agent_info: { ListOfficeName: 'Compass' },
  agent_id: null,
  owner_client_id: null,
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  listing_contract_date: '2026-04-01T00:00:00Z',
  modification_timestamp: '2026-05-05T16:21:52Z',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-05-05T16:21:52Z',
} as unknown as DbListing;

describe('dbListingToPublicDTO · virtualTourURL from raw_data', () => {
  it('derives virtualTourURL from raw_data.VirtualTourURLUnbranded', () => {
    const url = 'https://my.matterport.com/show/?m=abc';
    const dto = dbListingToPublicDTO({ ...BASE, raw_data: { VirtualTourURLUnbranded: url } } as unknown as DbListing);
    expect(dto.virtualTourURL).toBe(url);
  });

  it('falls back to raw_data.VirtualTourURLBranded when Unbranded is absent', () => {
    const url = 'https://tour.example.com/branded/xyz';
    const dto = dbListingToPublicDTO({ ...BASE, raw_data: { VirtualTourURLBranded: url } } as unknown as DbListing);
    expect(dto.virtualTourURL).toBe(url);
  });

  it('is undefined when raw_data carries no tour URL (card shows no badge)', () => {
    const dto = dbListingToPublicDTO({ ...BASE, raw_data: {} } as unknown as DbListing);
    expect(dto.virtualTourURL).toBeUndefined();
  });

  it('is undefined when raw_data is absent entirely (the pre-fix select omission)', () => {
    const dto = dbListingToPublicDTO({ ...BASE } as unknown as DbListing);
    expect(dto.virtualTourURL).toBeUndefined();
  });
});
