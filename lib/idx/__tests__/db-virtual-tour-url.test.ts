/// <reference types="jest" />
/**
 * PR-C follow-up (Codex on #361) — DB-backed /api/listings must carry the
 * virtual-tour URL so SearchListingCard can render the 3D Tour badge.
 *
 * `dbListingToPublicDTO` derives `virtualTourURL` from
 * `raw_data.VirtualTourURLUnbranded` / `VirtualTourURLBranded` (and the second and third of each) — those fields
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

describe('dbListingToPublicDTO · a listing\'s video and 3D tour from all of its unbranded links', () => {
  const MATTERPORT = 'https://my.matterport.com/show/?m=abc';
  const YOUTUBE = 'https://www.youtube.com/watch?v=RM4ef1CIo2k';
  const dtoOf = (raw: Record<string, unknown>) => dbListingToPublicDTO({ ...BASE, raw_data: raw } as unknown as DbListing);

  it('a tour in the first box and a video in the second: both are shown (the video used to be dropped before the listing was saved)', () => {
    const dto = dtoOf({ VirtualTourURLUnbranded: MATTERPORT, VirtualTourURLUnbranded2: YOUTUBE });
    expect(dto.virtualTourURL).toBe(MATTERPORT);
    expect(dto.videoUrl).toBe(YOUTUBE);
  });

  it('a video in the first box and a tour in the third: both are shown', () => {
    const dto = dtoOf({ VirtualTourURLUnbranded: YOUTUBE, VirtualTourURLUnbranded3: MATTERPORT });
    expect(dto.videoUrl).toBe(YOUTUBE);
    expect(dto.virtualTourURL).toBe(MATTERPORT);
  });

  it('a video alone in the second box is the listing\'s video, and it has no 3D tour', () => {
    const dto = dtoOf({ VirtualTourURLUnbranded2: YOUTUBE });
    expect(dto.videoUrl).toBe(YOUTUBE);
    expect(dto.virtualTourURL).toBeUndefined();
  });

  it('the first link of each kind is the one shown', () => {
    const dto = dtoOf({
      VirtualTourURLUnbranded: MATTERPORT,
      VirtualTourURLUnbranded2: 'https://my.matterport.com/show/?m=second',
      VirtualTourURLUnbranded3: 'https://vimeo.com/123456789',
    });
    expect(dto.virtualTourURL).toBe(MATTERPORT);
    expect(dto.videoUrl).toBe('https://vimeo.com/123456789');
  });

  it('an unbranded link is shown over the branded one of its kind, and a branded link alone is still shown', () => {
    expect(dtoOf({ VirtualTourURLBranded: 'https://tour.example.com/branded/xyz', VirtualTourURLUnbranded2: MATTERPORT }).virtualTourURL).toBe(MATTERPORT);
    expect(dtoOf({ VirtualTourURLBranded: 'https://tour.example.com/branded/xyz' }).virtualTourURL).toBe('https://tour.example.com/branded/xyz');
  });

  it('the second and third branded links are shown when the listing has no unbranded link of their kind, in the order of the fields', () => {
    const B1 = 'https://tour.example.com/branded/xyz';
    const B2 = 'https://tour.example.com/branded/two';
    const B3 = 'https://tour.example.com/branded/three';
    expect(dtoOf({ VirtualTourURLBranded2: B2 }).virtualTourURL).toBe(B2);
    expect(dtoOf({ VirtualTourURLBranded3: B3 }).virtualTourURL).toBe(B3);
    expect(dtoOf({ VirtualTourURLBranded2: B2, VirtualTourURLBranded3: B3 }).virtualTourURL).toBe(B2);
    expect(dtoOf({ VirtualTourURLBranded: B1, VirtualTourURLBranded2: B2, VirtualTourURLBranded3: B3 }).virtualTourURL).toBe(B1);
    expect(dtoOf({ VirtualTourURLBranded3: YOUTUBE }).videoUrl).toBe(YOUTUBE);
  });

  it('an unbranded link of a kind outranks every branded link of that kind (UCBA Art. I Sec. 5(C)); the other kind still shows its branded link', () => {
    const raw = { VirtualTourURLBranded: 'https://tour.example.com/branded/xyz', VirtualTourURLBranded2: 'https://tour.example.com/branded/two', VirtualTourURLBranded3: YOUTUBE, VirtualTourURLUnbranded3: MATTERPORT };
    const dto = dtoOf(raw);
    expect(dto.virtualTourURL).toBe(MATTERPORT);
    expect(dto.videoUrl).toBe(YOUTUBE);
  });

  it('blank links are no links', () => {
    const dto = dtoOf({ VirtualTourURLUnbranded: '', VirtualTourURLUnbranded2: null, VirtualTourURLUnbranded3: '   ', VirtualTourURLBranded2: '', VirtualTourURLBranded3: null });
    expect(dto.virtualTourURL).toBeUndefined();
    expect(dto.videoUrl).toBeUndefined();
  });
});
