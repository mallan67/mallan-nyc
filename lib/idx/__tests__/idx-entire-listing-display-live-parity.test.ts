import { readFileSync } from 'fs';
import { resolve } from 'path';
import { cotalityRecordToStorageShape } from '../cotality-public-dto';
import { COTALITY_PROPERTY_FIELDS, IDX_PLUS_SELECT_FIELDS } from '../trestle-mapper';

/**
 * The entire-listing display gate is driven SOLELY by the live field
 * `InternetEntireListingDisplayYN`.
 *
 * `IDXEntireListingDisplayYN` does NOT exist on the live Cotality feed (0 occurrences in the
 * dated live field pull). The retired duplicate reader once fell back to it — a phantom read.
 * On THE canonical chain (mapTrestleToPrisma → the shared public projection) a stray
 * IDXEntireListingDisplayYN value is simply an unknown key: it is ignored, and the gate columns
 * derive only from the live flag (null upstream = displayable, per the IDX Plus pre-filter).
 */
const BASE_RAW: Record<string, unknown> = {
  ListingId: 'RLS20059088',
  ListingKey: '1146011469',
  StandardStatus: 'Active',
  StreetNumber: '217',
  StreetName: 'W 57th Street',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10019',
  CountyOrParish: 'New York',
  PropertyType: 'Residential',
  ListPrice: 128000000,
  ListingContractDate: '2026-04-01',
  ModificationTimestamp: '2026-05-05T16:21:52Z',
  ListAgentMlsId: '74001',
  ListAgentFullName: 'Carl Gambino',
  ListOfficeMlsId: '7222',
  ListOfficeName: 'Compass',
  Permission: 'IDX',
};

describe('entire-listing display is driven only by InternetEntireListingDisplayYN', () => {
  it('phantom IDXEntireListingDisplayYN:false is ignored (only the live field drives the gate)', () => {
    const row = cotalityRecordToStorageShape({ ...BASE_RAW, IDXEntireListingDisplayYN: false });
    expect(row.internet_entire_listing_display_yn).toBe(true);
    expect(row.idx_display_yn).toBe(true);
  });

  it('explicit InternetEntireListingDisplayYN:false suppresses the row', () => {
    const row = cotalityRecordToStorageShape({ ...BASE_RAW, InternetEntireListingDisplayYN: false });
    expect(row.internet_entire_listing_display_yn).toBe(false);
    expect(row.idx_display_yn).toBe(false);
  });

  it('null/absent InternetEntireListingDisplayYN = displayable (IDX Plus pre-filter convention)', () => {
    const row = cotalityRecordToStorageShape({ ...BASE_RAW, InternetEntireListingDisplayYN: null });
    expect(row.internet_entire_listing_display_yn).toBe(true);
  });

  it('live-parity: the live field exists, the phantom does not, and every selected field is live', () => {
    const pull = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-property-fields.live.json'), 'utf-8')) as { fields: string[] };
    const live = new Set(pull.fields);
    expect(live.has('InternetEntireListingDisplayYN')).toBe(true);
    expect(live.has('IDXEntireListingDisplayYN')).toBe(false);
    expect(COTALITY_PROPERTY_FIELDS.filter((f) => !live.has(f))).toEqual([]);
    expect(IDX_PLUS_SELECT_FIELDS.filter((f) => !live.has(f))).toEqual([]);
  });
});
