/// <reference types="jest" />
/**
 * Public discovery of Mallan website-only exclusives + agent-listings resilience.
 * (Scoped display/discovery repair for SL-0004 — but asserted generically.)
 *
 * Findings this locks in:
 *  - The `exclusive=mallan&type=sale` query INCLUDES Active Mallan website-only
 *    exclusives (rls_eligible=false) via the OR branch — it does NOT require
 *    idx_display_yn / internet_entire_listing_display_yn (those gate third-party
 *    RLS rows only). Proven on production (SL-0004 → count 1); locked here.
 *  - filterDisplayableDbListings bypasses the IDX gate for website-only rows but
 *    STILL enforces it for third-party IDX rows.
 *  - The agent-listings endpoint must NOT hard-fail when the Trestle branch
 *    throws — it degrades to local CRM exclusives (the bug that 500'd the
 *    preview agent page).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildPublicListingDbSearch } from '../../lib/search/public-listing-db';
import {
  filterDisplayableDbListings,
  dbListingToPublicDTO,
  classifyDbListing,
  type DbListing,
} from '../../lib/idx/db-to-public-dto';

function makeDbListing(overrides: Partial<DbListing> = {}): DbListing {
  const now = new Date('2026-05-30T00:00:00.000Z');
  return {
    id: '1', listing_id: 'SL-9001', mls_id: null, status: 'Active',
    listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condo',
    list_price: '770000', bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0,
    living_area: '1100', borough: 'Manhattan', neighborhood: 'Midtown',
    address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'Street', UnitNumber: '2G', City: 'New York', PostalCode: '10017' },
    features: {}, media: [], agent_info: {}, agent_id: null, owner_client_id: null,
    rls_eligible: true, idx_display_yn: true, internet_entire_listing_display_yn: true,
    internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
    listing_contract_date: now, modification_timestamp: now, created_at: now, updated_at: now,
    ...overrides,
  } as DbListing;
}

describe('exclusive=mallan query includes Active website-only Mallan exclusives', () => {
  const { where } = buildPublicListingDbSearch(new URLSearchParams({ exclusive: 'mallan', type: 'sale' }));

  it('restricts to TRUE Mallan exclusives (SL-/RL-/website-only), NOT agent_id, and sale type', () => {
    // Updated 2026-06-23: agent_id is unsafe (syncAgentHistory stamps it onto
    // third-party buyer-side Trestle rows). Identity is the CRM SL-/RL- prefix OR
    // rls_eligible=false (PR #308). The website-only OR branch (below) is the
    // separate DISPLAY gate and is unaffected.
    expect(where.agent_id).toBeUndefined();
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { listing_id: { startsWith: 'SL-' } },
            { listing_id: { startsWith: 'RL-' } },
            { rls_eligible: false },
          ],
        },
      ]),
    );
    expect(where.listing_type).toBe('sale');
  });

  it('allows Active status (does not exclude it)', () => {
    expect(where.status).toBeDefined();
    const statusIn = (where.status as { in?: string[] }).in ?? [];
    expect(statusIn).toContain('Active');
  });

  it('has a website-only OR branch (rls_eligible=false) that does NOT require idx_display_yn', () => {
    const or = (where.OR ?? []) as Array<Record<string, unknown>>;
    const websiteOnly = or.find((b) => b.rls_eligible === false);
    expect(websiteOnly).toBeDefined();
    // website-only branch must NOT gate on idx_display_yn / internet_entire_*.
    expect(websiteOnly).not.toHaveProperty('idx_display_yn');
    expect(websiteOnly).not.toHaveProperty('internet_entire_listing_display_yn');
    // The RLS branch DOES gate (third-party rows still pass the 6 gates).
    const rlsBranch = or.find((b) => b.rls_eligible === true);
    expect(rlsBranch).toHaveProperty('idx_display_yn', true);
  });
});

describe('filterDisplayableDbListings — website-only bypass, third-party still gated', () => {
  it('INCLUDES an Active website-only exclusive even with idx_display_yn=false', () => {
    const websiteOnly = makeDbListing({
      listing_id: 'SL-9001', rls_eligible: false, status: 'Active',
      idx_display_yn: false, internet_entire_listing_display_yn: false,
      agent_id: BigInt('1') as unknown as DbListing['agent_id'],
    });
    expect(filterDisplayableDbListings([websiteOnly])).toHaveLength(1);
  });

  it('EXCLUDES a third-party IDX row when its IDX gate is off (gate preserved)', () => {
    const thirdPartyGateOff = makeDbListing({
      listing_id: 'RLS-7001', rls_eligible: true, status: 'Active',
      idx_display_yn: false, // gate off → must be excluded
    });
    expect(filterDisplayableDbListings([thirdPartyGateOff])).toHaveLength(0);
  });

  it('INCLUDES a third-party IDX row when its IDX gate is on', () => {
    const thirdPartyGateOn = makeDbListing({ listing_id: 'RLS-7002', rls_eligible: true, status: 'Active', idx_display_yn: true });
    expect(filterDisplayableDbListings([thirdPartyGateOn])).toHaveLength(1);
  });

  it('third-party IDX row never exposes assigned-agent PII', () => {
    const thirdParty = makeDbListing({ listing_id: 'RLS-7003', agent_id: null, rls_eligible: true, agent_info: { ListAgentFullName: 'Other Agent', ListAgentEmail: 'leak@other.com' } });
    expect(classifyDbListing(thirdParty)).toBe('third-party-idx');
    const dto = dbListingToPublicDTO(thirdParty);
    expect(dto._assignedAgent).toBeUndefined();
    expect(JSON.stringify(dto)).not.toMatch(/leak@other\.com/);
  });
});

describe('agent-listings endpoint is resilient to a Trestle failure', () => {
  const routeSrc = readFileSync(
    resolve(__dirname, '../../app/api/agents/[slug]/listings/route.ts'),
    'utf8',
  );

  it('isolates the Trestle branch with .catch so a throw cannot reject Promise.all', () => {
    // The Trestle fetch is wrapped so its rejection degrades to empty, never a 500.
    expect(routeSrc).toMatch(/trestleFetch[\s\S]*?\.catch\(/);
    expect(routeSrc).toMatch(/serving local DB exclusives only/i);
    // Promise.all consumes the guarded promise, not the raw fetch.
    expect(routeSrc).toMatch(/Promise\.all\(\[\s*trestleFetch\s*,\s*fetchDbAgentListings/);
  });

  it('local DB exclusives are still fetched independently of Trestle', () => {
    expect(routeSrc).toMatch(/fetchDbAgentListings\(agent\.id\)/);
  });
});
