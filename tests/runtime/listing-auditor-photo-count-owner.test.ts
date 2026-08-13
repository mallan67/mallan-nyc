/// <reference types="jest" />

/**
 * Compliance photo-count ownership.
 *
 * The listing auditor used to equate `Listing.media.length` with photos. That
 * counts floor plans/videos and can resurrect legacy media after relational
 * deletion. These tests keep the audit result on the same canonical classified
 * gallery as public DB readers.
 */

const listingFindUnique = jest.fn();
const listingAuditCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => data);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findUnique: listingFindUnique },
    listingAudit: { create: listingAuditCreate },
  },
}));

import { auditListing } from '@/lib/listing-auditor/auditor';

const photo = (n: number) => ({
  MediaURL: `https://images.example/photo-${n}.jpg`,
  MediaCategory: 'Photo',
  Order: n,
});

const floorPlan = {
  MediaURL: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Jpeg/1/plan.jpg',
  MediaCategory: null,
  Order: 99,
};

const relational = (
  n: number,
  mediaType = 'Photo',
) => ({
  media_key: `provider:${n}`,
  media_url_original:
    mediaType === 'FloorPlan'
      ? `https://api.cotality.com/trestle/Media/Property/DOCUMENT-Jpeg/${n}/plan.jpg`
      : `https://images.example/relational-${n}.jpg`,
  media_url_cached: null,
  media_type: mediaType,
  media_category: mediaType,
  media_classification: null,
  order: n,
  preferred_photo_yn: n === 0,
  status: 'active',
});

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    listing_id: 'RLS-AUDIT-1',
    agent_id: 7n,
    listing_type: 'sale',
    property_type: 'Condo',
    list_price: 1_000_000,
    status: 'Active',
    borough: 'Manhattan',
    neighborhood: 'Chelsea',
    postal_code: '10011',
    bedrooms_total: 2,
    bathrooms_full: 2,
    living_area: 1_000,
    property_sub_type: 'Apartment',
    address: { StreetNumber: '1', StreetName: 'Main Street' },
    features: { PublicRemarks: 'Bright apartment.' },
    media: [photo(0)],
    rls_eligible: true,
    owner_opt_out: false,
    idx_display_yn: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    raw_data: {},
    listing_media: [],
    _count: { listing_media: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  listingFindUnique.mockReset();
  listingAuditCreate.mockClear();
});

it('counts classified Photos, not every legacy media item', async () => {
  listingFindUnique.mockResolvedValue(listing({ media: [photo(0), floorPlan] }));

  const result = await auditListing('RLS-AUDIT-1');

  expect(result.photo_count).toBe(1);
  expect(result.issues).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'media' }),
  ]));
  expect(result.warnings).toEqual(expect.arrayContaining([
    expect.objectContaining({ message: expect.stringContaining('Only 1 photos') }),
  ]));
  expect(listingAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ photo_count: 1 }),
  }));
});

it('uses active relational media as authority and excludes floor plans', async () => {
  listingFindUnique.mockResolvedValue(listing({
    media: Array.from({ length: 9 }, (_, i) => photo(i)),
    listing_media: [relational(0), relational(1), relational(2, 'FloorPlan')],
    _count: { listing_media: 4 },
  }));

  const result = await auditListing('RLS-AUDIT-1');

  expect(result.photo_count).toBe(2);
  expect(result.warnings).toEqual(expect.arrayContaining([
    expect.objectContaining({ message: expect.stringContaining('Only 2 photos') }),
  ]));
});

it('does not resurrect legacy photos when Mallan relational rows were deleted', async () => {
  listingFindUnique.mockResolvedValue(listing({
    listing_id: 'SL-0004',
    rls_eligible: false,
    media: [photo(0)],
    listing_media: [],
    _count: { listing_media: 1 },
  }));

  const result = await auditListing('SL-0004');

  expect(result.photo_count).toBe(0);
  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'media', message: expect.stringContaining('At least 1 photo') }),
  ]));
});

it('loads active rows and the all-status existence count in one listing query', async () => {
  listingFindUnique.mockResolvedValue(listing());

  await auditListing('RLS-AUDIT-1');

  expect(listingFindUnique).toHaveBeenCalledWith(expect.objectContaining({
    where: { listing_id: 'RLS-AUDIT-1' },
    include: expect.objectContaining({
      listing_media: expect.objectContaining({ where: { status: 'active' } }),
      _count: { select: { listing_media: true } },
    }),
  }));
});

