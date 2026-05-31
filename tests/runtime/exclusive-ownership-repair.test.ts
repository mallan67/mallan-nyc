/// <reference types="jest" />
/**
 * Exclusive ownership repair + public presentation. (Emergency: SL-0004 rendered
 * generic — agent_info.ListAgentFullName was "" so the public detail card showed
 * no assigned agent even though agent_id was linked.)
 *
 * Proves, with GENERIC fixtures (no hardcoded Maya, no hardcoded listing):
 *  - the bug repro: a Mallan exclusive whose agent_info name is EMPTY surfaces
 *    NO agent name in the public DTO (renders generic / unassigned);
 *  - the repair contract: buildExclusiveAgentAssignment blank-fills the empty
 *    name from the listing's linked agent identity;
 *  - the assigned agent is DRIVEN BY the agent identity (two different agents →
 *    two different names) — never hardcoded;
 *  - after repair the public DTO exposes the assigned agent for the exclusive;
 *  - a third-party IDX row stays generic (no agent PII);
 *  - ownership is keyed off the listing's OWN agent — a different editor cannot
 *    overwrite an already-populated name (blank-only / manual wins).
 */
import {
  buildExclusiveAgentAssignment,
  isMallanExclusiveListing,
} from '../../lib/listings/exclusive-agent-assignment';
import {
  dbListingToPublicDTO,
  classifyDbListing,
  type DbListing,
} from '../../lib/idx/db-to-public-dto';

// Two distinct generic agents — proves output tracks identity, not a constant.
const AGENT_A = { id: '501', full_name: 'Jordan Rivera', email: 'jordan@mallan.nyc', phone: '212-555-0147' };
const AGENT_B = { id: '1', full_name: 'Maya Allan', email: 'maya@mallan.nyc', phone: '(646) 258-4460' };

// The SL-0004-shaped broken state: website-only exclusive, agent linked, but the
// agent_info template has EMPTY identity strings (office present, name blank).
const BROKEN_AGENT_INFO = {
  ListOfficeKey: '',
  ListAgentEmail: '',
  ListAgentMlsId: '',
  ListOfficeName: 'Mallan Real Estate Inc.',
  ListAgentFullName: '',
  ListAgentDirectPhone: '',
};

function makeDbListing(overrides: Partial<DbListing> = {}): DbListing {
  const now = new Date('2026-05-30T00:00:00.000Z');
  return {
    id: '1', listing_id: 'SL-9001', mls_id: null, status: 'Active',
    listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condo',
    list_price: '1500000', bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0,
    living_area: '1100', borough: 'Manhattan', neighborhood: 'Midtown',
    address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'Street', UnitNumber: '2G', City: 'New York', PostalCode: '10017' },
    features: {}, media: [], agent_info: {}, agent_id: null, owner_client_id: null,
    rls_eligible: true, idx_display_yn: true, internet_entire_listing_display_yn: true,
    internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
    listing_contract_date: now, modification_timestamp: now, created_at: now, updated_at: now,
    ...overrides,
  } as DbListing;
}

describe('Bug reproduction — empty agent_info name renders generic', () => {
  it('website-only exclusive is classified exclusive but exposes NO agent name when name is blank', () => {
    const broken = makeDbListing({
      listing_id: 'SL-9001',
      rls_eligible: false, // website-only Mallan exclusive (like SL-0004)
      agent_id: BigInt('1') as unknown as DbListing['agent_id'],
      agent_info: { ...BROKEN_AGENT_INFO },
    });
    expect(classifyDbListing(broken)).toBe('website-only'); // still an exclusive path, not third-party
    const dto = dbListingToPublicDTO(broken);
    expect(dto._source).toBe('exclusive');
    // The card has at most a company, but NO agent name → looks unassigned/generic.
    expect(dto._assignedAgent?.name).toBeUndefined();
  });
});

describe('Repair contract — empty name is blank-filled from the linked agent', () => {
  it('fills the empty ListAgentFullName from the agent identity', () => {
    const out = buildExclusiveAgentAssignment(AGENT_A, { listing_id: 'SL-9001', rls_eligible: false }, { ...BROKEN_AGENT_INFO });
    expect(out).not.toBeNull();
    expect(out!.agent_info.ListAgentFullName).toBe('Jordan Rivera');
    expect(out!.list_agent_full_name).toBe('Jordan Rivera');
    expect(out!.list_office_name).toBe('Mallan Real Estate Inc.');
    expect(out!.agent_info.ListAgentEmail).toBe('jordan@mallan.nyc');
    expect(out!.agent_info.ListAgentDirectPhone).toBe('212-555-0147');
  });

  it('the assigned name TRACKS the agent identity (different agent → different name, not hardcoded)', () => {
    const a = buildExclusiveAgentAssignment(AGENT_A, { listing_id: 'SL-9001', rls_eligible: false }, { ...BROKEN_AGENT_INFO });
    const b = buildExclusiveAgentAssignment(AGENT_B, { listing_id: 'SL-9001', rls_eligible: false }, { ...BROKEN_AGENT_INFO });
    expect(a!.agent_info.ListAgentFullName).toBe('Jordan Rivera');
    expect(b!.agent_info.ListAgentFullName).toBe('Maya Allan');
    expect(b!.agent_id).toBe(BigInt('1'));
  });

  it('does NOT overwrite an already-populated name (manual / existing wins — no ownership theft)', () => {
    const out = buildExclusiveAgentAssignment(AGENT_A, { listing_id: 'SL-9001', rls_eligible: false }, { ListAgentFullName: 'Existing Owner', ListOfficeName: 'Mallan Real Estate Inc.' });
    expect(out!.agent_info.ListAgentFullName).toBe('Existing Owner');
    expect(out!.list_agent_full_name).toBe('Existing Owner');
  });
});

describe('After repair — public DTO exposes the assigned agent for the exclusive', () => {
  it('repaired exclusive surfaces the assigned agent name + company', () => {
    const repaired = buildExclusiveAgentAssignment(AGENT_B, { listing_id: 'SL-9001', rls_eligible: false }, { ...BROKEN_AGENT_INFO })!;
    // The public DTO derives the assigned-agent card from agent_info only
    // (the promoted list_agent_full_name/list_office_name columns are not part
    // of the DbListing DTO input). So the repaired agent_info is what matters.
    const listing = makeDbListing({
      listing_id: 'SL-9001', rls_eligible: false,
      agent_id: repaired.agent_id as unknown as DbListing['agent_id'],
      agent_info: repaired.agent_info as DbListing['agent_info'],
    });
    const dto = dbListingToPublicDTO(listing);
    expect(dto._source).toBe('exclusive');
    expect(dto._assignedAgent).toBeDefined();
    expect(dto._assignedAgent!.name).toBe('Maya Allan');
    expect(dto._assignedAgent!.company).toMatch(/Mallan/);
  });
});

describe('Third-party IDX stays generic — no agent PII', () => {
  it('a third-party row exposes no _assignedAgent even if agent_info carries a name', () => {
    const thirdParty = makeDbListing({
      listing_id: 'RLS-7001', agent_id: null, rls_eligible: true,
      agent_info: { ListAgentFullName: 'Third Party Agent', ListAgentEmail: 'leak@other.com', ListOfficeName: 'Other Brokerage LLC' },
    });
    expect(classifyDbListing(thirdParty)).toBe('third-party-idx');
    expect(isMallanExclusiveListing({ listing_id: 'RLS-7001', rls_eligible: true })).toBe(false);
    const dto = dbListingToPublicDTO(thirdParty);
    expect(dto._source).toBe('db+idx');
    expect(dto._assignedAgent).toBeUndefined();
    expect(JSON.stringify(dto)).not.toMatch(/leak@other\.com/);
  });
});
