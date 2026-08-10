/**
 * COMMIT 11 — canonical DB DTO field-ownership corrections.
 *
 * Both are storage-shape defects, not cosmetic: on a SYNCED Trestle row the
 * canonical builder was reading the wrong JSON bucket and silently returning
 * `undefined`, which is why the detail page had grown its own fallbacks.
 *
 * A. PublicRemarks — `mapTrestleToPrisma` does NOT put B7_REMARKS into
 *    `features` (trestle-mapper.ts:372 lists B7 among the raw_data fields), and
 *    S1 (#415) retired the redundant Trestle `compliance` JSON copy. So synced
 *    remarks live in `raw_data`. `features` still wins for CRM/legacy rows.
 *
 * B. BuildingName — B13_BUILDING owns it and is spread into `features`
 *    (trestle-mapper.ts:1073). `address` is `pick(raw, B1_ADDRESS)`, which does
 *    not contain it. The address read is kept only as a legacy fallback.
 */

import { dbListingToPublicDTO } from '@/lib/idx/db-to-public-dto';

/** Minimal synced-row shape; only the fields under test vary. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: '1',
    listing_id: 'RLS20105333',
    mls_id: '1178013994',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'MultiFamily',
    list_price: '2295000',
    address: { StreetNumber: '519', StreetName: 'MONROE', PostalCode: '11221' },
    features: {},
    raw_data: {},
    media: [],
    // NOT NULL with defaults on the real table; the builder derives
    // listingContractDate from created_at when the typed column is absent.
    created_at: new Date('2026-07-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-07T00:00:00.000Z'),
    modification_timestamp: new Date('2026-08-07T16:53:25.440Z'),
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    rls_eligible: true,
    ...over,
  } as never;
}

describe('A. PublicRemarks ownership — synced rows keep remarks in raw_data', () => {
  it('reads raw_data.PublicRemarks when features has none (the synced case)', () => {
    const dto = dbListingToPublicDTO(
      row({ features: {}, raw_data: { PublicRemarks: 'Sun-filled corner unit.' } }),
    );
    expect(dto.publicRemarks).toBe('Sun-filled corner unit.');
  });

  it('features.PublicRemarks still WINS for CRM/legacy rows', () => {
    const dto = dbListingToPublicDTO(
      row({
        features: { PublicRemarks: 'FEATURES copy' },
        raw_data: { PublicRemarks: 'RAW copy' },
      }),
    );
    expect(dto.publicRemarks).toBe('FEATURES copy');
  });

  it('absent in both stays undefined — no empty string, no invented text', () => {
    const dto = dbListingToPublicDTO(row({ features: {}, raw_data: {} }));
    expect(dto.publicRemarks).toBeUndefined();
  });

  it('a non-string raw_data value is not coerced into remarks', () => {
    const dto = dbListingToPublicDTO(row({ features: {}, raw_data: { PublicRemarks: 12345 } }));
    expect(dto.publicRemarks).toBeUndefined();
  });
});

describe('B. BuildingName ownership — B13 lands in features, not address', () => {
  it('reads features.BuildingName (the synced case)', () => {
    const dto = dbListingToPublicDTO(
      row({ features: { BuildingName: 'The Monroe' }, address: { StreetNumber: '519' } }),
    );
    expect(dto.buildingName).toBe('The Monroe');
  });

  it('falls back to address.BuildingName for historical/CRM rows', () => {
    // Deliberately retained rather than deleted on assumption — older rows do
    // store it on the address JSON.
    const dto = dbListingToPublicDTO(
      row({ features: {}, address: { StreetNumber: '519', BuildingName: 'Legacy House' } }),
    );
    expect(dto.buildingName).toBe('Legacy House');
  });

  it('features wins when both are present', () => {
    const dto = dbListingToPublicDTO(
      row({
        features: { BuildingName: 'Canonical' },
        address: { StreetNumber: '519', BuildingName: 'Legacy' },
      }),
    );
    expect(dto.buildingName).toBe('Canonical');
  });
});

describe('the live RLS20105333 shape survives both corrections', () => {
  it('67 Photo + 1 FloorPlan yields photosCount 67 and a Photo hero', () => {
    // Guards the corrections against disturbing media classification.
    const media = [
      ...Array.from({ length: 67 }, (_, i) => ({
        MediaURL: `https://api.cotality.com/trestle/media/p${i}.jpg`,
        MediaCategory: 'Photo',
        Order: i,
      })),
      {
        MediaURL: 'https://api.cotality.com/trestle/media/fp.jpg',
        MediaCategory: 'Floor Plan',
        Order: 99,
      },
    ];
    const dto = dbListingToPublicDTO(
      row({ media, raw_data: { PublicRemarks: 'x' }, features: { BuildingName: 'The Monroe' } }),
    );
    expect(dto.photosCount).toBe(67);
    expect(dto.media?.filter((m) => m.mediaType === 'Photo')).toHaveLength(67);
    expect(dto.media?.filter((m) => m.mediaType === 'FloorPlan')).toHaveLength(1);
    expect(dto.publicRemarks).toBe('x');
    expect(dto.buildingName).toBe('The Monroe');
  });
});
