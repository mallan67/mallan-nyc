/**
 * IDX Plus pre-filter parity on THE canonical chain (Packet 2 closure).
 *
 * Originally (C1 fix, 2026-05-13) this locked the duplicate reader `mapRESOToInternal`
 * to the writer's `!== false` convention on `InternetEntireListingDisplayYN` /
 * `InternetAddressDisplayYN`. The duplicate reader is gone: a live record now flows
 * mapTrestleToPrisma → dbListingToPublicDTO (lib/idx/cotality-public-dto.ts), so reader and
 * writer are the SAME code and parity holds by construction. These cases pin the convention on
 * that one chain: null / absent upstream = displayable (REBNY pre-filters the feed), explicit
 * false = suppressed, explicit true = displayable.
 */

import { cotalityRecordToStorageShape, cotalityRecordToPublicDTO, cotalityRecordsToPublicDTOs } from '../cotality-public-dto';

const BASE_RAW: Record<string, unknown> = {
  ListingId: 'RLS20059088',
  ListingKey: '1146011469',
  StandardStatus: 'Active',
  StreetNumber: '217',
  StreetName: 'W 57th Street',
  UnitNumber: '127/128',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10019',
  CountyOrParish: 'New York',
  PropertyType: 'Residential',
  ListPrice: 128000000,
  BedroomsTotal: 8,
  BathroomsFull: 9,
  BathroomsHalf: 1,
  ListingContractDate: '2026-04-01',
  ModificationTimestamp: '2026-05-05T16:21:52Z',
  ListAgentMlsId: '74001',
  ListAgentFullName: 'Carl Gambino',
  ListOfficeMlsId: '7222',
  ListOfficeName: 'Compass',
  Permission: 'IDX',
};

describe('canonical chain — IDX Plus pre-filter parity (C1)', () => {
  it('treats null flags as displayable on the storage shape and the public DTO', () => {
    const raw = { ...BASE_RAW, InternetEntireListingDisplayYN: null, InternetAddressDisplayYN: null };
    const row = cotalityRecordToStorageShape(raw);
    expect(row.internet_entire_listing_display_yn).toBe(true);
    expect(row.internet_address_display_yn).toBe(true);
    const dto = cotalityRecordToPublicDTO(raw, { alreadyGated: true });
    expect(dto).not.toBeNull();
    expect(dto!.address.streetName).not.toBe('Address Undisclosed');
    expect(dto!.address.unitNumber).toBe('127/128');
  });

  it('treats absent flags as displayable (REBNY said nothing)', () => {
    const raw = { ...BASE_RAW };
    delete raw.InternetEntireListingDisplayYN;
    delete raw.InternetAddressDisplayYN;
    const row = cotalityRecordToStorageShape(raw);
    expect(row.internet_entire_listing_display_yn).toBe(true);
    expect(row.internet_address_display_yn).toBe(true);
  });

  it('explicit false InternetAddressDisplayYN suppresses the address (per-row override)', () => {
    const raw = { ...BASE_RAW, InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: false };
    expect(cotalityRecordToStorageShape(raw).internet_address_display_yn).toBe(false);
    const dto = cotalityRecordToPublicDTO(raw, { alreadyGated: true });
    expect(dto!.address.streetName).toBe('Address Undisclosed');
    expect(dto!.address.unitNumber).toBeNull();
    expect(dto!.address.latitude).toBeUndefined();
  });

  it('explicit false InternetEntireListingDisplayYN is refused by the distribution gate', () => {
    const raw = { ...BASE_RAW, InternetEntireListingDisplayYN: false, InternetAddressDisplayYN: true };
    expect(cotalityRecordToStorageShape(raw).internet_entire_listing_display_yn).toBe(false);
    expect(cotalityRecordToPublicDTO(raw)).toBeNull();
  });

  it('explicit true on both flags is displayable', () => {
    const raw = { ...BASE_RAW, InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true };
    const dto = cotalityRecordToPublicDTO(raw);
    expect(dto).not.toBeNull();
    expect(dto!.address.streetName).not.toBe('Address Undisclosed');
  });

  it('the live-record DTO is labelled idx and carries third-party attribution', () => {
    const dto = cotalityRecordToPublicDTO({ ...BASE_RAW })!;
    expect(dto._source).toBe('idx');
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance.attributionText).toBe('Listing courtesy of Compass');
    expect(dto.id).toBe('RLS20059088');
    // ONE public identity: mlsId is the public listing id on the live path exactly as on the DB path.
    expect(dto.mlsId).toBe('RLS20059088');
    // The provider record key stays an ingestion-side identity, exposed only for media lookups.
    const projected = cotalityRecordsToPublicDTOs([{ ...BASE_RAW }]);
    expect(projected.listingKeyById.get('RLS20059088')).toBe('1146011469');
    expect(cotalityRecordToStorageShape({ ...BASE_RAW }).mls_id).toBe('1146011469');
  });
});
