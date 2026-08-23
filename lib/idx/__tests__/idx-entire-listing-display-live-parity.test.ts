import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapCotalityToInternal } from '../mapping';

/**
 * PR-live-2 (2026-06-04) — the entire-listing display gate must be driven
 * SOLELY by the live field `InternetEntireListingDisplayYN`.
 *
 * `IDXEntireListingDisplayYN` does NOT exist on the live Cotality/Trestle feed
 * (verified via trestle:audit-server against live $metadata; 0 occurrences in
 * artifacts/metadata.xml). The reader previously fell back to it
 * (`normalized.IDXEntireListingDisplayYN ?? normalized.InternetEntireListingDisplayYN`),
 * which is a phantom read. This locks the behavior:
 *   - the public DTO key `idxEntireListingDisplayYN` (legacy consumer contract)
 *     is preserved, and
 *   - it derives ONLY from InternetEntireListingDisplayYN — a stray
 *     IDXEntireListingDisplayYN value is ignored.
 *
 * Failing-to-green: under the old fallback, a record carrying
 * IDXEntireListingDisplayYN:false (and no Internet* field) produced
 * idxEntireListingDisplayYN === false. With the phantom read removed it is
 * true (null upstream = displayable, per the IDX Plus pre-filter convention).
 */
const BASE_RAW: Record<string, unknown> = {
  ListingId: 'RLS20059088',
  ListingKey: 'RLS20059088',
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
};

describe('mapCotalityToInternal — entire-listing display is driven only by InternetEntireListingDisplayYN', () => {
  it('phantom IDXEntireListingDisplayYN:false is ignored (only Internet* drives the gate)', () => {
    const dto = mapCotalityToInternal({
      ...BASE_RAW,
      IDXEntireListingDisplayYN: false, // phantom — must NOT affect output
      // InternetEntireListingDisplayYN intentionally absent (null upstream)
    });
    expect(dto).not.toBeNull();
    // null upstream Internet* = displayable, regardless of the phantom value
    expect(dto!.idxEntireListingDisplayYN).toBe(true);
    expect(dto!.internetEntireListingDisplayYN).toBe(true);
  });

  it('explicit InternetEntireListingDisplayYN:false suppresses BOTH the public key and the internal field', () => {
    const dto = mapCotalityToInternal({
      ...BASE_RAW,
      InternetEntireListingDisplayYN: false,
    });
    expect(dto).not.toBeNull();
    expect(dto!.idxEntireListingDisplayYN).toBe(false);
    expect(dto!.internetEntireListingDisplayYN).toBe(false);
  });

  it('null/absent InternetEntireListingDisplayYN = displayable (IDX Plus pre-filter convention)', () => {
    const dto = mapCotalityToInternal({
      ...BASE_RAW,
      InternetEntireListingDisplayYN: null,
    });
    expect(dto).not.toBeNull();
    expect(dto!.idxEntireListingDisplayYN).toBe(true);
    expect(dto!.internetEntireListingDisplayYN).toBe(true);
  });

  it('live-parity: InternetEntireListingDisplayYN exists on live, IDXEntireListingDisplayYN does not', () => {
    const xml = readFileSync(
      resolve(__dirname, '../../../artifacts/metadata.xml'),
      'utf-8'
    );
    const liveNames = new Set(
      [...xml.matchAll(/Name="([A-Za-z0-9_]+)"/g)].map((m) => m[1])
    );
    expect(liveNames.has('InternetEntireListingDisplayYN')).toBe(true);
    expect(liveNames.has('IDXEntireListingDisplayYN')).toBe(false);
  });
});
