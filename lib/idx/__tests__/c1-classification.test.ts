/**
 * C1 fix (2026-05-13) — DB-row provenance classifier + DTO source fields.
 *
 * Locks in the policy that `dbListingToPublicDTO` no longer hard-codes
 * `_source: 'exclusive'` on every DB row. Three provenance buckets are
 * tested:
 *
 *   1. Third-party IDX/RLS — `agent_id` and `owner_client_id` both null,
 *      `rls_eligible` true. Must yield `_source: 'db+idx'` and
 *      `disclaimerRequired: true`. This is the cohort that the production
 *      DB query counted at 10,484 / 10,484 rows before the fix landed.
 *   2. Mallan-authored — at least one of `agent_id` / `owner_client_id`
 *      non-null. Must yield `_source: 'exclusive'`,
 *      `disclaimerRequired: false`, and the "Exclusive listing by Mallan
 *      Real Estate Inc." attribution.
 *   3. Website-only — `rls_eligible === false`. Same DTO surface as Mallan
 *      exclusives because commercial rows bypass RLS entirely.
 *
 * Plus a regression test that ListOfficeName from a 3rd-party row is
 * preserved verbatim in the attribution string.
 */

import {
  classifyDbListing,
  dbListingToPublicDTO,
  type DbListing,
} from '../db-to-public-dto';

const BASE: DbListing = {
  id: '1',
  listing_id: 'RLS20059088',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: 'Condo',
  list_price: '128000000',
  bedrooms_total: 8,
  bathrooms_full: 9,
  bathrooms_half: 1,
  living_area: '11535',
  borough: 'manhattan',
  neighborhood: 'Midtown',
  address: {
    StreetNumber: '217',
    StreetName: 'W 57th Street',
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

describe('classifyDbListing — provenance predicate', () => {
  it('classifies third-party rows (agent_id+owner_client_id null, rls_eligible true)', () => {
    expect(classifyDbListing(BASE)).toBe('third-party-idx');
  });

  // THESE CASES USED TO ASSERT THE OPPOSITE, AND THEY PINNED A REAL DEFECT.
  //
  // Three cases here previously required `agent_id` or `owner_client_id` alone
  // to produce 'mallan-exclusive'. `agent_id` is not an ownership signal:
  // `syncAgentHistory` stamps it onto provider-synced THIRD-PARTY rows whenever
  // a Mallan agent appears on either side of a deal, because
  // `buildAgentHistoricalFilter` matches `ListAgentMlsId OR BuyerAgentMlsId`.
  // 'mallan-exclusive' then suppresses attribution and the disclaimer, so
  // another brokerage's listing advertised on mallan.nyc as Mallan's — UCBA
  // Art. III §2(C), NY DOS 19 NYCRR §175.25.
  //
  // Provenance is now decided by AUTHORSHIP (the SL-/RL- listing_id prefix, or
  // website-only inventory), which is the charter's own predicate.
  it('a provider row with a Mallan agent on the deal is STILL third-party', () => {
    expect(classifyDbListing({ ...BASE, listing_id: 'RLS20093870' })).toBe('third-party-idx');
  });

  it('an SL- row is a Mallan exclusive', () => {
    expect(classifyDbListing({ ...BASE, listing_id: 'SL-0004' })).toBe('mallan-exclusive');
  });

  it('an RL- row is a Mallan exclusive', () => {
    expect(classifyDbListing({ ...BASE, listing_id: 'RL-0007' })).toBe('mallan-exclusive');
  });

  it('classifies website-only commercial rows ahead of the authorship signal', () => {
    expect(
      classifyDbListing({ ...BASE, rls_eligible: false }),
    ).toBe('website-only');
  });
});

describe('dbListingToPublicDTO — provenance-driven _source + _displayCompliance', () => {
  it('third-party row emits _source=db+idx, disclaimerRequired=true, courtesy attribution', () => {
    const dto = dbListingToPublicDTO(BASE);
    expect(dto._source).toBe('db+idx');
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance.attributionText).toBe('Listing courtesy of Compass');
    expect(dto._displayCompliance.requiresAttribution).toBe(true);
  });

  it('third-party row with missing ListOfficeName falls back to REBNY RLS', () => {
    const dto = dbListingToPublicDTO({
      ...BASE,
      agent_info: {},
    });
    expect(dto._source).toBe('db+idx');
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance.attributionText).toBe('Listing courtesy of REBNY RLS');
  });

  it('mallan-authored row emits _source=exclusive, disclaimerRequired=false', () => {
    // Keyed on the SL- prefix, not on agent_id. An agent association records who
    // worked a deal; it never establishes that Mallan owns the listing.
    const dto = dbListingToPublicDTO({
      ...BASE,
      listing_id: 'SL-0004',
      agent_info: {
        ListOfficeName: 'Mallan Real Estate Inc.',
        ListAgentFullName: 'Maya Allan',
      },
    });
    expect(dto._source).toBe('exclusive');
    expect(dto._displayCompliance.disclaimerRequired).toBe(false);
    expect(dto._displayCompliance.attributionText).toBe(
      'Exclusive listing by Mallan Real Estate Inc.',
    );
  });

  it('a PROVIDER row carrying an owner_client_id is still third-party', () => {
    // Inverted deliberately. This case previously asserted that owner_client_id
    // alone made a row a Mallan exclusive. A provider row is the provider's
    // listing whatever local association columns say, and treating it otherwise
    // strips the real listing broker's attribution.
    const dto = dbListingToPublicDTO({
      ...BASE,
      listing_id: 'RLS20093870',
      owner_client_id: '7',
    });
    expect(dto._source).toBe('db+idx');
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance.requiresAttribution).toBe(true);
  });

  it('website-only commercial row emits _source=exclusive, disclaimerRequired=false', () => {
    const dto = dbListingToPublicDTO({
      ...BASE,
      rls_eligible: false,
    });
    expect(dto._source).toBe('exclusive');
    expect(dto._displayCompliance.disclaimerRequired).toBe(false);
  });

  it('does not leak agent_info PII into the DTO', () => {
    const dto = dbListingToPublicDTO({
      ...BASE,
      agent_info: {
        ListOfficeName: 'Compass',
        ListAgentFullName: 'Carl Gambino',
        ListAgentEmail: 'carl.gambino@compass.com',
        ListAgentDirectPhone: '(646) 465-1766',
      },
    });
    // The DTO should only carry listOfficeName from agent_info; no other
    // PII fields permitted. Reuse the PR #110 invariant here so this test
    // also guards against regression of the agent_info leak fix.
    const dtoJson = JSON.stringify(dto);
    expect(dtoJson).not.toMatch(/carl\.gambino@compass\.com/i);
    expect(dtoJson).not.toMatch(/646\) 465-1766/);
    expect(dtoJson).not.toMatch(/ListAgentFullName/);
    expect(dto.listOfficeName).toBe('Compass');
  });

  it('coming-soon flag still propagates regardless of provenance', () => {
    const dto = dbListingToPublicDTO({
      ...BASE,
      status: 'ComingSoon',
    });
    expect(dto._displayCompliance.comingSoon).toBe(true);
  });
});
