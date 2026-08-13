/// <reference types="jest" />
/**
 * PR-C follow-up (Codex on #361) — DB-backed /api/listings must carry the
 * virtual-tour URL so SearchListingCard can render the 3D Tour badge.
 *
 * `dbListingToPublicDTO` now derives `virtualTourURL` from the canonical
 * `external_media` relation. `raw_data.VirtualTourURL*` is intentionally no
 * longer a presentation owner: otherwise deleting/reclassifying a canonical
 * row could resurrect the legacy JSON value. A sibling source guard pins that
 * every production reader preloads the relation without an N+1 query.
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
};

describe('dbListingToPublicDTO · virtualTourURL from canonical external_media', () => {
  it('derives virtualTourURL from a canonical unbranded row', () => {
    const url = 'https://my.matterport.com/show/?m=abc';
    const dto = dbListingToPublicDTO({
      ...BASE,
      external_media: [{
        source: 'cotality_property',
        source_key: 'VirtualTourURLUnbranded',
        url,
        branded: false,
        kind: 'virtual_tour',
      }],
    });
    expect(dto.virtualTourURL).toBe(url);
  });

  it('uses a canonical branded row when it is the only proven tour', () => {
    const url = 'https://my.matterport.com/show/?m=branded';
    const dto = dbListingToPublicDTO({
      ...BASE,
      external_media: [{
        source: 'cotality_property',
        source_key: 'VirtualTourURLBranded',
        url,
        branded: true,
        kind: 'virtual_tour',
      }],
    });
    expect(dto.virtualTourURL).toBe(url);
  });

  it('does not resurrect a legacy raw_data URL when canonical state is empty', () => {
    const dto = dbListingToPublicDTO({
      ...BASE,
      raw_data: { VirtualTourURLUnbranded: 'https://my.matterport.com/show/?m=legacy' },
      external_media: [],
    });
    expect(dto.virtualTourURL).toBeUndefined();
  });

  it('is undefined when the canonical relation is absent entirely', () => {
    const dto = dbListingToPublicDTO({ ...BASE });
    expect(dto.virtualTourURL).toBeUndefined();
  });
});
