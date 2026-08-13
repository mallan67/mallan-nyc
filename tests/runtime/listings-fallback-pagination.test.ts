import type { PublicListingDTO } from '@/lib/idx/public-dto';
import type { IDXListing } from '@/lib/idx/types';
import {
  hasDisclosedAddress,
  filterTrestleAmenities,
  isWithinBounds,
  matchesBorough,
  paginateFallbackCandidates,
  type FallbackListingCandidate,
} from '@/lib/listings/fallback-pagination';

function dto(
  id: string,
  overrides: Partial<PublicListingDTO> = {},
): PublicListingDTO {
  return {
    id,
    mlsId: id,
    slug: id.toLowerCase(),
    url: `/listing/${id.toLowerCase()}`,
    status: 'Active',
    listingType: 'sale',
    address: {
      streetNumber: id.replace(/\D/g, '') || '1',
      streetName: 'Main Street',
      unitNumber: id,
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10001',
      county: 'New York',
      latitude: 40.75,
      longitude: -73.99,
    },
    listPrice: Number(id.replace(/\D/g, '')) || 1,
    originalListPrice: 1,
    closePrice: null,
    propertyType: 'Condo',
    propertySubType: 'Condominium',
    bedroomsTotal: 2,
    bathroomsFull: 2,
    bathroomsHalf: 0,
    livingArea: 1000,
    lotSizeArea: null,
    yearBuilt: 2000,
    listOfficeName: 'Mallan Real Estate Inc.',
    media: [],
    listingContractDate: '2026-01-01T00:00:00.000Z',
    modificationTimestamp: '2026-01-01T00:00:00.000Z',
    auction: null,
    _source: id.startsWith('SL-') || id.startsWith('RL-') ? 'exclusive' : 'idx',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'Listing courtesy of Mallan Real Estate Inc.',
      disclaimerRequired: true,
    },
    ...overrides,
  } satisfies PublicListingDTO;
}

function candidate(source: 'idx' | 'crm', listingDto: PublicListingDTO): FallbackListingCandidate {
  const common = {
    id: listingDto.id,
    address: listingDto.address,
    modificationTimestamp: listingDto.modificationTimestamp,
    dto: listingDto,
  };
  if (source === 'crm') return { source: 'crm', ...common };
  return { source: 'idx', ...common, listing: {} as IDXListing };
}

describe('fallback combined pagination contract', () => {
  const crm = Array.from({ length: 50 }, (_, i) => candidate('crm', dto(`SL-${String(i).padStart(3, '0')}`)));
  const idx = Array.from({ length: 400 }, (_, i) => candidate('idx', dto(`RLS-${String(i).padStart(3, '0')}`)));

  it('returns exactly 200 rows per full page with no repeated exclusives, gaps, or duplicates', () => {
    const first = paginateFallbackCandidates([...idx, ...crm], { sort: null, skip: 0, limit: 200 });
    const second = paginateFallbackCandidates([...idx, ...crm], { sort: null, skip: 200, limit: 200 });
    expect(first.page).toHaveLength(200);
    expect(second.page).toHaveLength(200);

    const firstIds = new Set(first.page.map((row) => row.id));
    const secondIds = new Set(second.page.map((row) => row.id));
    expect([...firstIds].filter((id) => secondIds.has(id))).toEqual([]);
    expect([...first.page, ...second.page].filter((row) => row.source === 'crm')).toHaveLength(50);
    expect([...first.page, ...second.page].filter((row) => row.source === 'idx')).toHaveLength(350);
  });

  it('dedupes exact ids and physical twins before sorting and slicing; CRM wins', () => {
    const address = { ...dto('seed').address, streetNumber: '333', streetName: 'E 46th St', unitNumber: '7B' };
    const crmRow = candidate('crm', dto('SL-7B', { address, listPrice: 2_000_000 }));
    const idxTwin = candidate('idx', dto('RLS-TWIN', { address, listPrice: 1 }));
    const exactIdx = candidate('idx', dto('SL-7B', { address, listPrice: 3_000_000 }));
    const result = paginateFallbackCandidates([idxTwin, exactIdx, crmRow], { sort: 'price-asc', skip: 0, limit: 10 });
    expect(result.canonical.map((row) => row.id)).toEqual(['SL-7B']);
    expect(result.canonical[0].source).toBe('crm');
  });

  it('a website-only CRM row without an SL-/RL- id still wins its IDX physical twin', () => {
    const address = { ...dto('seed').address, streetNumber: '10', streetName: 'Park Ave', unitNumber: '4A' };
    const websiteOnly = candidate('crm', dto('WEBSITE-4A', { address }));
    const idxTwin = candidate('idx', dto('RLS-4A', { address }));
    const result = paginateFallbackCandidates([idxTwin, websiteOnly], { sort: null, skip: 0, limit: 10 });
    expect(result.canonical.map((row) => row.id)).toEqual(['WEBSITE-4A']);
  });

  it('honors explicit sort globally across both sources with an id tie-breaker', () => {
    const rows = [
      candidate('crm', dto('SL-HIGH', { listPrice: 3_000_000 })),
      candidate('idx', dto('RLS-LOW', { listPrice: 1_000_000 })),
      candidate('crm', dto('SL-MID', { listPrice: 2_000_000 })),
    ];
    const result = paginateFallbackCandidates(rows, { sort: 'price-asc', skip: 0, limit: 10 });
    expect(result.page.map((row) => row.id)).toEqual(['RLS-LOW', 'SL-MID', 'SL-HIGH']);
  });

  it('keeps count <= limit for every offset', () => {
    for (const skip of [0, 50, 200, 400, 449]) {
      const result = paginateFallbackCandidates([...idx, ...crm], { sort: null, skip, limit: 200 });
      expect(result.page.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('removing filters used before the single slice', () => {
  it('never admits unverified provider rows for unsupported amenity searches', () => {
    const records = [
      { ListingKey: 'pets', PetsAllowed: 'CatsOK' },
      { ListingKey: 'none', PetsAllowed: 'No' },
    ];
    expect(filterTrestleAmenities(records, 'pet-friendly')).toEqual([records[0]]);
    expect(filterTrestleAmenities(records, 'doorman')).toEqual([]);
    expect(filterTrestleAmenities(records, 'pet-friendly,gym')).toEqual([]);
  });

  it('bounds excludes unresolved and out-of-box rows from either source', () => {
    const bounds = { south: 40.7, west: -74.1, north: 40.9, east: -73.8 };
    const unresolved = candidate('crm', dto('SL-X', { address: { ...dto('SL-X').address, latitude: undefined } }));
    const outside = candidate('idx', dto('RLS-X', { address: { ...dto('RLS-X').address, latitude: 41 } }));
    const inside = candidate('crm', dto('SL-Y'));
    expect([unresolved, outside, inside].filter((row) => isWithinBounds(row, bounds))).toEqual([inside]);
  });

  it('excludeUndisclosed applies identically to CRM and IDX candidates', () => {
    for (const source of ['crm', 'idx'] as const) {
      const hidden = candidate(source, dto(source, { address: { ...dto(source).address, streetName: 'Address Undisclosed' } }));
      expect(hasDisclosedAddress(hidden)).toBe(false);
    }
  });

  it('borough matching applies the same county/city rules to both sources', () => {
    for (const source of ['crm', 'idx'] as const) {
      const brooklyn = candidate(source, dto(`${source}-BK`, {
        address: { ...dto(`${source}-BK`).address, city: 'Brooklyn', county: 'Kings' },
      }));
      expect(matchesBorough(brooklyn, 'Brooklyn')).toBe(true);
      expect(matchesBorough(brooklyn, 'Manhattan')).toBe(false);
    }
  });
});
