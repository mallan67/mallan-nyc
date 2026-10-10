/**
 * C1 fix (2026-05-13) — DB-row provenance classifier + DTO source fields.
 *
 * Locks in the policy that `dbListingToPublicDTO` no longer hard-codes
 * `_source: 'exclusive'` on every DB row. Three provenance buckets are
 * tested:
 *
 *   1. Third-party Cotality/IDX — an RLS listing id (RLS…) and `rls_eligible`
 *      true. Must yield `_source: 'db+idx'` and `disclaimerRequired: true`.
 *      This is the cohort that the production DB query counted at 10,484 /
 *      10,484 rows before the fix landed.
 *   2. Mallan-authored — the CRM's `SL-` / `RL-` listing id. Must yield
 *      `_source: 'exclusive'`, `disclaimerRequired: false`, and the
 *      "Exclusive listing by Mallan Real Estate Inc." attribution.
 *   3. Website-only — `rls_eligible === false`. Same DTO surface as Mallan
 *      exclusives because commercial rows bypass RLS entirely.
 *
 * WHOSE LISTING IT IS comes from the source fields only (lib/listings/
 * mallan-source-identity.ts). The first version of the C1 fix read it from
 * `agent_id` / `owner_client_id` being set; `syncAgentHistory` stamps
 * `agent_id` onto third-party Cotality rows (list side AND buyer side), so
 * another firm's listing that carried one said "Exclusive listing by Mallan
 * Real Estate Inc." and lost the REBNY data sentence (UCBA Art. III Sec. 2(C),
 * NY DOS 19 NYCRR Sec. 175.25). Corrected 2026-10-09 after the review Maya
 * pasted; the tests below pin both directions.
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

/** a row like BASE with these fields changed: classifyDbListing takes a row (it reads two fields of it), and a row may carry agent_id / owner_client_id */
const row = (extra: Partial<DbListing>): DbListing => ({ ...BASE, ...extra });

describe('classifyDbListing — provenance predicate', () => {
  it('classifies a third-party row (an RLS listing id, rls_eligible true) as third-party-idx', () => {
    expect(classifyDbListing(BASE)).toBe('third-party-idx');
  });

  it.each([['SL-0004'], ['RL-0001'], ['SL-9001']])('classifies the CRM listing id %s as mallan-exclusive, with no agent_id or owner_client_id at all', (listing_id) => {
    expect(classifyDbListing(row({ listing_id }))).toBe('mallan-exclusive');
  });

  it('a third-party row that carries an agent_id is STILL third-party: syncAgentHistory stamps agent_id onto Cotality rows where a Mallan agent was the buyer side', () => {
    expect(classifyDbListing(row({ agent_id: '42', owner_client_id: null }))).toBe('third-party-idx');
  });

  it('a third-party row that carries an owner_client_id is STILL third-party', () => {
    expect(classifyDbListing(row({ agent_id: null, owner_client_id: '7' }))).toBe('third-party-idx');
  });

  it('a third-party row that carries both is STILL third-party, whatever shape the ids come in (string or bigint)', () => {
    expect(classifyDbListing(row({ agent_id: '42', owner_client_id: '7' }))).toBe('third-party-idx');
    expect(classifyDbListing(row({ agent_id: BigInt(42), owner_client_id: BigInt(7) }))).toBe('third-party-idx');
  });

  it('a Mallan listing is still Mallan\'s whether or not the agent_id is set', () => {
    expect(classifyDbListing(row({ listing_id: 'SL-0004', agent_id: null, owner_client_id: null }))).toBe('mallan-exclusive');
    expect(classifyDbListing(row({ listing_id: 'SL-0004', agent_id: '42', owner_client_id: '7' }))).toBe('mallan-exclusive');
  });

  it('only the listing id\'s PREFIX says it: the letters SL- or RL- elsewhere in an id, or no id at all, do not', () => {
    for (const listing_id of ['RLS-SL-1', 'XSL-0001', 'RLS20059088', '', 'SL0004']) {
      expect(classifyDbListing(row({ listing_id }))).toBe('third-party-idx');
    }
    expect(classifyDbListing(row({ listing_id: undefined as unknown as string }))).toBe('third-party-idx');
  });

  it('classifies website-only commercial rows ahead of everything else', () => {
    expect(classifyDbListing(row({ rls_eligible: false }))).toBe('website-only');
    // Even with a CRM id and ownership populated, website-only short-circuits — the row
    // bypasses RLS so the IDX-vs-exclusive distinction is moot.
    expect(classifyDbListing(row({ listing_id: 'SL-0004', rls_eligible: false, agent_id: '42', owner_client_id: '7' }))).toBe('website-only');
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

  it('a Mallan-authored row (CRM listing id) emits _source=exclusive, disclaimerRequired=false', () => {
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
    expect(dto._assignedAgent?.name).toBe('Maya Allan');
  });

  it('another firm\'s listing that carries an agent_id and an owner_client_id keeps its REBNY attribution, its disclaimer and NO assigned agent (the regression the first version of C1 had)', () => {
    const dto = dbListingToPublicDTO({
      ...BASE,
      agent_id: '42',
      owner_client_id: '7',
      agent_info: { ListOfficeName: 'Compass', ListAgentFullName: 'Carl Gambino', ListAgentEmail: 'carl.gambino@compass.com' },
    });
    expect(dto._source).toBe('db+idx');
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance.attributionText).toBe('Listing courtesy of Compass');
    expect(dto._assignedAgent).toBeUndefined();
    expect(JSON.stringify(dto)).not.toMatch(/Exclusive listing by Mallan/);
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
