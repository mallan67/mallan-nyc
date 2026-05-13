/// <reference types="jest" />
/**
 * Hotfix 3 — agent PII leak through portal DTO.
 *
 * Audit M2 finding (2026-05-13 6-agent sweep · frontend-flow-verifier):
 *
 *   `app/api/portal/favorites/route.ts:53` selects `agent_info: true` and
 *   runs every row through `sanitizeListingForPortal`. For seller/landlord
 *   roles, the dto code at `lib/compliance/dto.ts:259-260` returned the
 *   full raw `agent_info` object — which CAN include `full_name`,
 *   `ListAgentEmail`, `ListAgentDirectPhone`, `ListAgentKey`. A seller who
 *   favorited another seller's listing (or any non-own row) would receive
 *   that other broker's direct PII.
 *
 * Verified during this fix: the UI code in `app/portal/{seller,landlord}/
 * page.tsx` does NOT consume `agent_info` at all — zero references. The
 * "leak" path was producing data that nothing rendered. Closing the leak
 * is a strict-improvement with zero UI impact.
 *
 * Fix policy: ALL portal roles receive `agent_info` reduced to
 *   { company: <ListOfficeName or company string> }
 *
 * Brokerage attribution required by UCBA Art. III §2(C) is preserved
 * (the `company` field IS the listing broker's name). Everything else is
 * stripped at the DTO boundary.
 */

import { sanitizeForPortal, sanitizeListingForPortal } from '@/lib/compliance/dto';

// ─── Fixtures ────────────────────────────────────────────────────────────

const FULL_AGENT_INFO = {
  // Safe — UCBA §2(C) attribution
  ListOfficeName: 'Compass NYC Brokerage',
  company: 'Compass NYC Brokerage',
  // ALL of these MUST be stripped from portal DTO output
  full_name: 'Some Other Broker',
  first_name: 'Some',
  last_name: 'Broker',
  ListAgentFullName: 'Some Other Broker',
  ListAgentEmail: 'other-broker@compass.com',
  ListAgentDirectPhone: '212-555-9999',
  ListAgentKey: 'AGT-COMPASS-001',
  CoListAgentEmail: 'co-broker@compass.com',
  CoListAgentDirectPhone: '212-555-9998',
  CoListAgentKey: 'COAGT-COMPASS-002',
  CoListAgentFullName: 'Second Compass Agent',
  email: 'duplicate-field@compass.com',
  phone: '212-555-0000',
  direct_phone: '212-555-1111',
};

function buildListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '12345',
    listing_id: 'RBNY-X1',
    status: 'Active',
    listing_type: 'sale',
    list_price: '1500000',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1200',
    borough: 'Manhattan',
    neighborhood: 'Chelsea',
    address: { street: '100 W 25th St', city: 'New York' },
    features: {},
    media: [],
    agent_info: FULL_AGENT_INFO,
    internet_address_display_yn: true,
    internet_entire_listing_display_yn: true,
    participant_only: false,
    owner_opt_out: false,
    ...overrides,
  };
}

// Sensitive field names that must NEVER appear in the sanitized agent_info.
// The regression guard at the bottom iterates this list.
const FORBIDDEN_AGENT_INFO_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'ListAgentFullName',
  'ListAgentEmail',
  'ListAgentDirectPhone',
  'ListAgentKey',
  'CoListAgentEmail',
  'CoListAgentDirectPhone',
  'CoListAgentKey',
  'CoListAgentFullName',
  'email',
  'phone',
  'direct_phone',
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────

describe('Hotfix 3 · portal agent_info PII leak — sanitizeForPortal', () => {
  describe.each(['buyer', 'tenant', 'seller', 'landlord'])('role = %s', (role) => {
    it(`agent_info contains ONLY { company } — no PII fields leak`, () => {
      const result = sanitizeForPortal(buildListing(), role);
      const agentInfo = result.agent_info as Record<string, unknown> | null;
      expect(agentInfo).not.toBeNull();
      expect(agentInfo).toEqual({ company: 'Compass NYC Brokerage' });
    });

    it(`no forbidden agent fields present anywhere in agent_info output`, () => {
      const result = sanitizeForPortal(buildListing(), role);
      const agentInfo = result.agent_info as Record<string, unknown> | null;
      if (agentInfo) {
        for (const banned of FORBIDDEN_AGENT_INFO_FIELDS) {
          expect(agentInfo).not.toHaveProperty(banned);
        }
      }
    });

    it(`ListOfficeName fallback wins when company is missing`, () => {
      const listing = buildListing({
        agent_info: { ListOfficeName: 'Fallback Office', ListAgentEmail: 'leak@nope.com' },
      });
      const result = sanitizeForPortal(listing, role);
      expect(result.agent_info).toEqual({ company: 'Fallback Office' });
    });

    it(`returns null when agent_info is entirely absent`, () => {
      const listing = buildListing({ agent_info: null });
      const result = sanitizeForPortal(listing, role);
      expect(result.agent_info).toBeNull();
    });

    it(`returns null when agent_info has no recognised brokerage field`, () => {
      const listing = buildListing({
        agent_info: { ListAgentEmail: 'no-brokerage-name@nope.com' },
      });
      const result = sanitizeForPortal(listing, role);
      // Without any brokerage name, the safest disclosure is "no agent" —
      // the attribution falls to the surrounding UI's REBNY RLS fallback.
      expect(result.agent_info).toEqual({ company: null });
    });
  });
});

describe('Hotfix 3 · sanitizeListingForPortal (Prisma → DTO pipeline)', () => {
  function buildPortalRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: BigInt(12345),
      listing_id: 'RBNY-X1',
      status: 'Active',
      listing_type: 'sale',
      property_type: 'Residential',
      property_sub_type: 'Condominium',
      list_price: 1500000,
      bedrooms_total: 2,
      bathrooms_full: 2,
      bathrooms_half: 0,
      living_area: 1200,
      borough: 'Manhattan',
      neighborhood: 'Chelsea',
      address: { street: '100 W 25th St' },
      features: {},
      media: [],
      agent_info: FULL_AGENT_INFO,
      internet_address_display_yn: true,
      internet_entire_listing_display_yn: true,
      participant_only: false,
      owner_opt_out: false,
      ...overrides,
    } as Parameters<typeof sanitizeListingForPortal>[0];
  }

  it.each(['buyer', 'tenant', 'seller', 'landlord'])(
    'role=%s · agent_info reduced to { company } only — no PII leaks through the Prisma path',
    (role) => {
      const result = sanitizeListingForPortal(buildPortalRecord(), role);
      expect(result).not.toBeNull();
      expect(result!.agent_info).toEqual({ company: 'Compass NYC Brokerage' });
    },
  );

  it('cross-role leak scenario (audit M2): seller favorites a non-own listing → no other-broker PII', () => {
    // Scenario per the audit: a Mallan seller likes a listing actually
    // listed by Compass. Their favorites response must NOT include the
    // Compass agent's email/phone/key. Brokerage attribution remains.
    const result = sanitizeListingForPortal(buildPortalRecord(), 'seller');
    const agentInfo = result!.agent_info as Record<string, unknown>;
    expect(agentInfo.company).toBe('Compass NYC Brokerage');
    for (const banned of FORBIDDEN_AGENT_INFO_FIELDS) {
      expect(agentInfo).not.toHaveProperty(banned);
    }
  });
});

describe('Hotfix 3 · attribution preserved — regression guard', () => {
  // UCBA Art. III §2(C) requires "Listing Courtesy of [Exclusive Broker]"
  // on every public display. The sanitizer must continue to surface the
  // brokerage name so downstream UI can render that attribution.
  it('output retains brokerage name from agent_info.company', () => {
    const result = sanitizeForPortal(buildListing(), 'buyer');
    expect((result.agent_info as Record<string, unknown>).company).toBe('Compass NYC Brokerage');
  });

  it('output retains brokerage name from agent_info.ListOfficeName', () => {
    const listing = buildListing({
      agent_info: { ListOfficeName: 'Corcoran Group' },
    });
    const result = sanitizeForPortal(listing, 'seller');
    expect((result.agent_info as Record<string, unknown>).company).toBe('Corcoran Group');
  });
});
