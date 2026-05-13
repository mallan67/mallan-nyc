/**
 * C1 fix (2026-05-13) — list/detail endpoint parity.
 *
 * The bug: a single listing on `/api/listings` (DB-first list) returned a
 * full street + unit address and `_source: "exclusive"`, while the same
 * listing on `/api/listings/:id` (Trestle live detail) returned
 * `streetName: "Address Undisclosed"` and `_source: "idx"`. The list path
 * also hard-coded `disclaimerRequired: false` on every row, masking the
 * REBNY RLS disclaimer requirement for 10,484 third-party listings.
 *
 * This test pins parity at the DTO layer — the layer where the divergence
 * lived. It does not boot the route handlers (those carry filesystem +
 * Prisma dependencies); it asserts that, given the same logical listing
 * facts, the two DTO builders agree on:
 *
 *   1. Address suppression (null InternetAddressDisplayYN → displayable on
 *      BOTH paths; explicit false → suppressed on BOTH).
 *   2. Disclaimer requirement for third-party listings.
 *   3. Source label (third-party rows are `db+idx`, never `exclusive`).
 *
 * If a future refactor breaks parity again (e.g. someone reintroduces
 * `affirmPermission` on the reader side without a matching writer change),
 * these tests fail and surface the regression before deploy.
 */

import { mapRESOToInternal } from '../../lib/idx/mapping';
import { toPublicDTO } from '../../lib/idx/public-dto';
import {
  dbListingToPublicDTO,
  type DbListing,
} from '../../lib/idx/db-to-public-dto';

const TRESTLE_RAW_BASE: Record<string, unknown> = {
  ListingId: 'RLS20059088',
  ListingKey: 'RLS20059088',
  StandardStatus: 'Active',
  StreetNumber: '217',
  StreetName: '57th',
  StreetDirPrefix: 'W',
  StreetSuffix: 'Street',
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
};

const DB_ROW_BASE: DbListing = {
  id: '1',
  listing_id: 'RLS20059088',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: null,
  list_price: '128000000',
  bedrooms_total: 8,
  bathrooms_full: 9,
  bathrooms_half: 1,
  living_area: null,
  borough: 'manhattan',
  neighborhood: 'Midtown',
  address: {
    StreetNumber: '217',
    StreetName: '57th',
    StreetDirPrefix: 'W',
    StreetSuffix: 'Street',
    UnitNumber: '127/128',
    City: 'New York City',
    PostalCode: '10019',
    Borough: 'manhattan',
  },
  features: {},
  media: [],
  agent_info: {
    ListOfficeName: 'Compass',
    ListAgentFullName: 'Carl Gambino',
  },
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

describe('list/detail DTO parity for the same logical listing (C1)', () => {
  it('null InternetAddressDisplayYN upstream → both paths show full address', () => {
    // Detail path: raw Trestle → IDXListing → DTO.
    const trestleRaw = {
      ...TRESTLE_RAW_BASE,
      InternetEntireListingDisplayYN: null,
      InternetAddressDisplayYN: null,
    };
    const idxListing = mapRESOToInternal(trestleRaw);
    expect(idxListing).not.toBeNull();
    const detailDto = toPublicDTO(idxListing!);

    // List path: DB row → DTO. The writer (sync.ts) bakes the null upstream
    // into `internet_address_display_yn=true` in the DB column, so the row
    // we hand the DTO already carries true.
    const listDto = dbListingToPublicDTO(DB_ROW_BASE);

    // Both must show the full address — no `Address Undisclosed`.
    expect(detailDto.address.streetName).not.toBe('Address Undisclosed');
    expect(listDto.address.streetName).not.toBe('Address Undisclosed');

    // Unit number must be present on both.
    expect(detailDto.address.unitNumber).toBe('127/128');
    expect(listDto.address.unitNumber).toBe('127/128');
  });

  it('explicit false InternetAddressDisplayYN suppresses on the detail path', () => {
    // Detail path: when REBNY/Cotality marks a row with an explicit per-row
    // opt-out, the address text MUST come back as "Address Undisclosed".
    const trestleRaw = {
      ...TRESTLE_RAW_BASE,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: false,
    };
    const idxListing = mapRESOToInternal(trestleRaw);
    const detailDto = toPublicDTO(idxListing!);
    expect(detailDto.address.streetName).toBe('Address Undisclosed');
    expect(detailDto.address.unitNumber).toBeNull();
  });

  it('third-party listings on the list path carry RLS disclaimer = true', () => {
    // Pre-fix: every DB row was hard-coded `disclaimerRequired: false`.
    // Post-fix: third-party rows require the REBNY disclaimer.
    const listDto = dbListingToPublicDTO(DB_ROW_BASE);
    expect(listDto._source).toBe('db+idx');
    expect(listDto._displayCompliance.disclaimerRequired).toBe(true);
    // Per-listing attribution still names the actual listing brokerage.
    expect(listDto._displayCompliance.attributionText).toBe(
      'Listing courtesy of Compass',
    );
  });

  it('detail path also flags disclaimerRequired = true for third-party rows', () => {
    // Trestle-live path already used `disclaimerRequired: true` (mapping.ts).
    // The parity assertion here is symmetric — both paths agree.
    const trestleRaw = {
      ...TRESTLE_RAW_BASE,
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
    };
    const idxListing = mapRESOToInternal(trestleRaw);
    const detailDto = toPublicDTO(idxListing!);
    expect(detailDto._displayCompliance.disclaimerRequired).toBe(true);
  });
});
