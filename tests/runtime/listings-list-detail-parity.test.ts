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
  buildSourceAndCompliance,
  type DbListing,
} from '../../lib/idx/db-to-public-dto';

/**
 * PRODUCTION-REALISTIC provider identity (corrected 2026-08-06).
 *
 * This fixture previously set `ListingKey: 'RLS20059088'` — identical to
 * `ListingId`. That is NOT the live shape, and it made a real public-contract
 * divergence untestable: when both fields carry the same value the two DTO
 * builders appear to agree on `mlsId` when in production they do not.
 *
 * Live Cotality/Trestle returns a NUMERIC `ListingKey`. Observed 2026-08-06 on
 * the bbc559bd preview — which serves live Trestle precisely because it has no
 * DATABASE_URL, so its response is unmediated provider shape:
 *     id: "RLS20059088"   mlsId: "1146011469"
 * The same numeric shape appears in production media proxy URLs (media key
 * `1178013994`), consistent with canon §8: `Property.ListingKey =
 * Media.ResourceRecordKey`.
 */
const TRESTLE_RAW_BASE: Record<string, unknown> = {
  ListingId: 'RLS20059088',
  ListingKey: '1146011469', // numeric provider key — NOT the RLS ListingId
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

/**
 * PUBLIC IDENTITY CONTRACT (added 2026-08-06).
 *
 * Two builders assign `mlsId` from different provider fields:
 *
 *   lib/idx/mapping.ts:302        mlsId = String(ListingKey || listingId)
 *   lib/idx/db-to-public-dto.ts:339/386   mlsId = listing.listing_id
 *
 * With a production-realistic numeric `ListingKey` these disagree publicly for
 * the SAME logical listing. Compliance canon §8 states the DB column `mls_id`
 * stores `ListingKey` and that `Property.ListingKey = Media.ResourceRecordKey`
 * — so `mls_id` and `listing_id` are genuinely different identifiers, and
 * `db-to-public-dto` publishes `listing_id` under the name `mlsId`.
 *
 * WHICH VALUE IS PUBLICLY CANONICAL IS NOT DECIDED HERE. Doing so requires the
 * live Property shape for ListingId / ListingKey / ListingKeyNumeric /
 * SourceSystemKey, which needs Trestle credentials not available in this
 * environment. Per the fail-closed rule these tests PIN AND DOCUMENT current
 * behaviour so the divergence is visible and cannot regress silently; they do
 * not normalize it away.
 */
describe('public identity semantics across source paths', () => {
  const trestleRaw = {
    ...TRESTLE_RAW_BASE,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
  };

  it('public `id` AGREES across both paths — this is the stable public identity', () => {
    const detailDto = toPublicDTO(mapRESOToInternal(trestleRaw)!);
    const listDto = dbListingToPublicDTO(DB_ROW_BASE);
    expect(detailDto.id).toBe('RLS20059088');
    expect(listDto.id).toBe('RLS20059088');
    expect(detailDto.id).toBe(listDto.id);
  });

  it('DOCUMENTED DIVERGENCE: `mlsId` does NOT agree across paths', () => {
    const detailDto = toPublicDTO(mapRESOToInternal(trestleRaw)!);
    const listDto = dbListingToPublicDTO(DB_ROW_BASE);

    // Trestle path publishes the numeric provider ListingKey.
    expect(detailDto.mlsId).toBe('1146011469');
    // DB path publishes listing_id — the RLS id, not the provider key.
    expect(listDto.mlsId).toBe('RLS20059088');

    // The divergence is real. When it is resolved, this assertion must be
    // replaced by an equality assertion — NOT deleted.
    expect(detailDto.mlsId).not.toBe(listDto.mlsId);
  });
});

/**
 * BROKER ATTRIBUTION — NY DOS §175.25 (compliance canon §9 + §11).
 *
 * Fail-closed rule: "No misleading/false/deceptive claims." Attributing a
 * THIRD-PARTY listing (here: Compass) to Mallan Real Estate Inc. is a false
 * claim of brokerage, and "Agent name NEVER appears without brokerage name."
 *
 * `MALLAN_OFFICE_MLS_IDS` is `[]`, so today every listing is third-party and
 * NOTHING may fall back to a Mallan attribution on a public surface.
 */
/**
 * SHARED SOURCE + COMPLIANCE POLICY (commit 3b).
 *
 * `app/listing/[...slug]/page.tsx` previously hard-coded three values in its
 * own inline DTO, each wrong for a third-party row:
 *
 *   _source: 'db'                              (no provenance classification)
 *   attributionText: 'Listing data from REBNY RLS'  (never named the broker)
 *   comingSoon / comingSoonDate: never set     (so the Coming Soon banner at
 *                                               page.tsx:1153, which reads
 *                                               `_displayCompliance.comingSoonDate`,
 *                                               could never render)
 *
 * It now delegates to `buildSourceAndCompliance` — the SAME function
 * `dbListingToPublicDTO` uses. These tests pin that shared contract.
 */
/**
 * ADDRESS-SUPPRESSION PARITY (commit 3b step 2) — seller opt-out exposure.
 *
 * Both paths call the SAME gate (`canDisplayListingAddress` is a thin alias for
 * `isAddressDisplayable`), but they exempt DIFFERENT listings from it:
 *
 *   app/listing/[...slug]/page.tsx:356,461
 *     isRlsBacked      = rls_eligible !== false
 *     suppressAddress  = isRlsBacked && !canDisplayListingAddress(listing)
 *
 *   lib/idx/db-to-public-dto.ts:321-322
 *     isCrmExclusive   = listing_id startsWith 'SL-' | 'RL-'
 *     suppressAddress  = isCrmExclusive ? false : !isAddressDisplayable(listing)
 *
 * These are NOT equivalent. For an RLS-ELIGIBLE `SL-`/`RL-` listing carrying an
 * explicit `internet_address_display_yn = false`, the prefix bypass wins in the
 * DB builder and the address is PUBLISHED — on cards, search, /api/listings and
 * Featured — while the detail page correctly suppresses it.
 *
 * page.tsx:455-460 documents that this exact prefix bypass was already found
 * unsafe and reverted THERE: "Earlier draft unconditionally bypassed by SL-/RL-
 * prefix — that exposed RLS-eligible opt-out addresses; reverted." The fix was
 * never carried across to the canonical DB builder.
 *
 * Correct rule (the one page.tsx uses): only a listing that is NOT RLS-backed
 * (`rls_eligible === false`, i.e. Mallan website-only inventory) may bypass the
 * IDX address opt-out. A prefix must never override a seller suppression.
 */
describe('address suppression parity — RLS-eligible exclusives respect opt-out', () => {
  /** RLS-eligible Mallan exclusive whose seller opted OUT of address display. */
  const RLS_ELIGIBLE_EXCLUSIVE_OPTED_OUT: DbListing = {
    ...DB_ROW_BASE,
    listing_id: 'SL-0007',
    rls_eligible: true,                     // RLS-backed -> opt-out MUST be honoured
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: false,     // explicit seller suppression
  };

  /** Website-only Mallan inventory — legitimately outside RLS, may show address. */
  const WEBSITE_ONLY_EXCLUSIVE: DbListing = {
    ...DB_ROW_BASE,
    listing_id: 'SL-0004',
    rls_eligible: false,                    // NOT RLS-backed -> bypass is correct
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: false,
  };

  it('RLS-eligible SL- exclusive with opt-out SUPPRESSES the street address', () => {
    const dto = dbListingToPublicDTO(RLS_ELIGIBLE_EXCLUSIVE_OPTED_OUT);
    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
  });

  it('RLS-eligible SL- exclusive with opt-out publishes NO unit number', () => {
    const dto = dbListingToPublicDTO(RLS_ELIGIBLE_EXCLUSIVE_OPTED_OUT);
    expect(dto.address.unitNumber).toBeNull();
  });

  it('RLS-eligible SL- exclusive with opt-out leaks NO coordinates', () => {
    const withCoords: DbListing = {
      ...RLS_ELIGIBLE_EXCLUSIVE_OPTED_OUT,
      address: {
        ...(RLS_ELIGIBLE_EXCLUSIVE_OPTED_OUT.address as Record<string, unknown>),
        Latitude: 40.7654,
        Longitude: -73.9866,
      },
    };
    const dto = dbListingToPublicDTO(withCoords);
    expect(dto.address.latitude).toBeUndefined();
    expect(dto.address.longitude).toBeUndefined();
  });

  it('RLS-eligible SL- exclusive with opt-out leaks no address in the URL', () => {
    const dto = dbListingToPublicDTO(RLS_ELIGIBLE_EXCLUSIVE_OPTED_OUT);
    expect(dto.url.toLowerCase()).not.toContain('57th');
    expect(dto.url.toLowerCase()).not.toContain('monroe');
  });

  it('website-only (rls_eligible === false) MAY still show its address', () => {
    // Not RLS-backed, so the IDX opt-out does not bind. This must keep working —
    // the fix must not over-suppress Mallan's own website-only inventory.
    const dto = dbListingToPublicDTO(WEBSITE_ONLY_EXCLUSIVE);
    expect(dto.address.streetName).not.toBe('Address Undisclosed');
  });

  it('third-party IDX row with address allowed still shows its address', () => {
    const dto = dbListingToPublicDTO(DB_ROW_BASE);
    expect(dto.address.streetName).not.toBe('Address Undisclosed');
    expect(dto.address.unitNumber).toBe('127/128');
  });
});

describe('shared source + compliance policy (one owner for both DB paths)', () => {
  const agentInfo = { ListOfficeName: 'Compass', ListAgentFullName: 'Carl Gambino' };

  it('third-party: real provenance, ACTUAL broker attribution, disclaimer', () => {
    const out = buildSourceAndCompliance(DB_ROW_BASE, agentInfo, false, undefined);
    expect(out._source).toBe('db+idx');
    expect(out._displayCompliance.attributionText).toBe('Listing courtesy of Compass');
    expect(out._displayCompliance.attributionText).not.toBe('Listing data from REBNY RLS');
    expect(out._displayCompliance.disclaimerRequired).toBe(true);
  });

  it('third-party: NO _assignedAgent — gates third-party agent PII off the page', () => {
    const out = buildSourceAndCompliance(DB_ROW_BASE, agentInfo, false, undefined);
    expect(out._assignedAgent).toBeUndefined();
  });

  it('coming-soon metadata is populated, so the detail banner can render', () => {
    const comingSoon = { ...DB_ROW_BASE, status: 'ComingSoon' };
    const out = buildSourceAndCompliance(comingSoon, agentInfo, true, '2026-09-01');
    expect(out._displayCompliance.comingSoon).toBe(true);
    expect(out._displayCompliance.comingSoonDate).toBe('2026-09-01');
  });

  it('the DTO builder and the detail page consume the SAME policy output', () => {
    // dbListingToPublicDTO spreads buildSourceAndCompliance; page.tsx now does
    // too. Equal inputs must therefore yield equal source/compliance.
    const direct = buildSourceAndCompliance(DB_ROW_BASE, agentInfo, false, undefined);
    const viaDto = dbListingToPublicDTO(DB_ROW_BASE);
    expect(viaDto._source).toBe(direct._source);
    expect(viaDto._displayCompliance.attributionText).toBe(
      direct._displayCompliance.attributionText,
    );
    expect(viaDto._displayCompliance.disclaimerRequired).toBe(
      direct._displayCompliance.disclaimerRequired,
    );
  });
});

describe('third-party listings are never attributed to Mallan', () => {
  const FORBIDDEN = /Mallan Real Estate/i;

  it('DB path: office name and attribution both name the ACTUAL brokerage', () => {
    const listDto = dbListingToPublicDTO(DB_ROW_BASE);
    expect(listDto.listOfficeName).toBe('Compass');
    expect(listDto._displayCompliance.attributionText).toBe(
      'Listing courtesy of Compass',
    );
    expect(listDto._displayCompliance.attributionText).not.toMatch(FORBIDDEN);
  });

  it('Trestle path: attribution never claims Mallan for a Compass listing', () => {
    const detailDto = toPublicDTO(
      mapRESOToInternal({
        ...TRESTLE_RAW_BASE,
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      })!,
    );
    expect(detailDto.listOfficeName).toBe('Compass');
    expect(detailDto._displayCompliance.attributionText).not.toMatch(FORBIDDEN);
  });

  it('a MISSING office name falls back to neutral REBNY RLS, never to Mallan', () => {
    // The canonical neutral fallback (db-to-public-dto.ts:457/550) — the
    // behaviour app/listing/[...slug]/page.tsx must match.
    const noOffice = {
      ...DB_ROW_BASE,
      agent_info: { ListAgentFullName: 'Carl Gambino' },
    };
    const listDto = dbListingToPublicDTO(noOffice);
    expect(listDto.listOfficeName).not.toMatch(FORBIDDEN);
    expect(listDto._displayCompliance.attributionText).not.toMatch(FORBIDDEN);
  });
});
