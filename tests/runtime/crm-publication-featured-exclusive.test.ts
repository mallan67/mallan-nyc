/// <reference types="jest" />
/**
 * PART C — public presentation / featured / exclusive.
 *
 * Proves the Mallan-exclusive public-presentation contract:
 *
 *   1. Featured pin matches by id / mlsId / listing_id (match ANY).
 *   2. A Mallan CRM exclusive WINS over its RLS/IDX duplicate of the same
 *      address+unit (reuses preferCrmExclusiveOverIdxDuplicate).
 *   3. The public exclusives section heading is "Mallan Exclusives"
 *      (not "Properties" / "Our Listings").
 *   4. The public DTO exposes the assigned listing-agent contact for an
 *      exclusive, and the detail page renders it.
 *   5. Agent assignment sets the four fields (agent_id, list_agent_full_name,
 *      list_office_name, agent_info) on an exclusive — and only on exclusives.
 *
 * Fixtures are generic. A fixture id (e.g. "SL-9001") is fine; there is NO
 * production-only branching and NO hardcoded prod identifiers.
 */

import fs from 'node:fs';
import path from 'node:path';

import { dbListingToPublicDTO, type DbListing } from '../../lib/idx/db-to-public-dto';
import { preferCrmExclusiveOverIdxDuplicate } from '../../lib/listings/dedupe-crm-vs-idx';
import {
  buildExclusiveAgentAssignment,
  isMallanExclusiveListing,
} from '../../lib/listings/exclusive-agent-assignment';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── Generic fixtures ────────────────────────────────────────────────────

function makeDbListing(overrides: Partial<DbListing> = {}): DbListing {
  const now = new Date('2026-05-30T00:00:00.000Z');
  return {
    id: '1',
    listing_id: 'SL-9001',
    mls_id: null,
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condo',
    list_price: '1000000',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1200',
    borough: 'Manhattan',
    neighborhood: 'Midtown',
    address: {
      StreetNumber: '100',
      StreetName: 'Sample',
      StreetSuffix: 'Street',
      UnitNumber: '5A',
      City: 'New York',
      PostalCode: '10000',
    },
    features: {},
    media: [],
    agent_info: {},
    agent_id: null,
    owner_client_id: null,
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: now,
    modification_timestamp: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ── 1. Featured pin matches by id / mlsId / listing_id ──────────────────

describe('Featured pin matching (id / mlsId / listing_id — match ANY)', () => {
  // Mirror the component helper exactly so the matching contract is locked in.
  type Pinnable = { id: string; mlsId: string; listing_id?: string };
  function isPinnedListing(listing: Pinnable, pinnedSet: Set<string>): boolean {
    return (
      pinnedSet.has(listing.id) ||
      pinnedSet.has(listing.mlsId) ||
      (listing.listing_id != null && pinnedSet.has(listing.listing_id))
    );
  }

  const listing: Pinnable = { id: '42', mlsId: 'RLS90001', listing_id: 'SL-9001' };

  test('matches when pinned by numeric id', () => {
    expect(isPinnedListing(listing, new Set(['42']))).toBe(true);
  });

  test('matches when pinned by mlsId', () => {
    expect(isPinnedListing(listing, new Set(['RLS90001']))).toBe(true);
  });

  test('matches when pinned by listing_id', () => {
    expect(isPinnedListing(listing, new Set(['SL-9001']))).toBe(true);
  });

  test('does not match an unrelated id', () => {
    expect(isPinnedListing(listing, new Set(['nope']))).toBe(false);
  });

  test('the FeaturedListings component uses the all-three matcher', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'app/components/FeaturedListings.tsx'),
      'utf8',
    );
    // The matcher checks id, mlsId, AND listing_id.
    expect(src).toMatch(/pinnedSet\.has\(listing\.id\)/);
    expect(src).toMatch(/pinnedSet\.has\(listing\.mlsId\)/);
    expect(src).toMatch(/pinnedSet\.has\(listing\.listing_id\)/);
    // And it is used for both the merge filter and the isPinned badge.
    expect(src).toMatch(/isPinnedListing\(l, pinnedSet\)/);
    expect(src).toMatch(/isPinnedListing\(listing, pinnedIds\)/);
  });
});

// ── 2. Mallan exclusive wins over its RLS/IDX duplicate ─────────────────

describe('Mallan exclusive wins over RLS/IDX duplicate (same address+unit)', () => {
  const addr = {
    streetNumber: '100',
    streetName: 'Sample Street',
    unitNumber: '5A',
    postalCode: '10000',
  };

  test('collapses the IDX duplicate, keeps the SL- exclusive', () => {
    const rows = [
      { id: 'RLS90001', address: addr },        // RLS/IDX duplicate
      { id: 'SL-9001', address: addr },          // Mallan exclusive
    ];
    const out = preferCrmExclusiveOverIdxDuplicate(rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('SL-9001');
  });

  test('does NOT collapse two genuinely different units', () => {
    const rows = [
      { id: 'RLS90001', address: { ...addr, unitNumber: '5A' } },
      { id: 'SL-9001', address: { ...addr, unitNumber: '6B' } },
    ];
    const out = preferCrmExclusiveOverIdxDuplicate(rows);
    expect(out).toHaveLength(2);
  });

  test('the public /api/listings route still calls the dedupe helper', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'app/api/listings/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/preferCrmExclusiveOverIdxDuplicate\(/);
  });
});

// ── 3. Home FEATURED section: titled "Featured Listings", exclusives first ──
//
// The home featured section is a MIX — pinned IDX/RLS third-party listings plus
// Mallan exclusives. Titling it "Mallan Exclusives" misrepresents those
// third-party listings as Mallan's own (NY DOS 19 NYCRR §175 / REBNY advertising
// violation). The <h2> must read "Featured Listings"; Mallan exclusives are
// surfaced FIRST within it, but the section is not LABELED exclusives-only.
// (The header nav "Mallan Exclusives" dropdown — a genuinely exclusives-only
//  surface — is separate and keeps its name.)

describe('Home Featured section heading + ordering', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'app/components/FeaturedListings.tsx'),
    'utf8',
  );

  test('the <h2> reads "Featured Listings" — never "Mallan Exclusives"/"Properties"/"Our Listings"', () => {
    expect(src).toMatch(/<h2[^>]*>Featured Listings<\/h2>/);
    expect(src).not.toMatch(/<h2[^>]*>Mallan Exclusives<\/h2>/);
    expect(src).not.toMatch(/>Properties</);
    expect(src).not.toMatch(/>Our Listings</);
  });

  test('Mallan exclusives are merged FIRST, before pinned + general listings', () => {
    const idxExclusives = src.indexOf('for (const l of exclusives)');
    const idxPinned = src.indexOf('const pinned =');
    const idxRest = src.indexOf('const rest =');
    expect(idxExclusives).toBeGreaterThan(-1);
    expect(idxPinned).toBeGreaterThan(idxExclusives);
    expect(idxRest).toBeGreaterThan(idxPinned);
  });
});

// ── 4. Public DTO exposes the assigned agent contact for an exclusive ───

describe('Public DTO assigned-agent contact (exclusive only)', () => {
  test('exclusive row surfaces _assignedAgent name/email/phone/company', () => {
    const dto = dbListingToPublicDTO(
      makeDbListing({
        listing_id: 'SL-9001',
        agent_id: '7',
        agent_info: {
          ListAgentFullName: 'Test Agent',
          ListOfficeName: 'Mallan Real Estate Inc.',
          ListAgentEmail: 'test.agent@example.com',
          ListAgentDirectPhone: '212-555-0100',
        },
      }),
    );
    expect(dto._source).toBe('exclusive');
    expect(dto._assignedAgent).toBeDefined();
    expect(dto._assignedAgent?.name).toBe('Test Agent');
    expect(dto._assignedAgent?.email).toBe('test.agent@example.com');
    expect(dto._assignedAgent?.phone).toBe('212-555-0100');
    expect(dto._assignedAgent?.company).toBe('Mallan Real Estate Inc.');
  });

  test('third-party IDX row does NOT expose _assignedAgent (no PII leak)', () => {
    const dto = dbListingToPublicDTO(
      makeDbListing({
        listing_id: 'RLS90001',
        agent_id: null,
        owner_client_id: null,
        rls_eligible: true,
        agent_info: {
          ListOfficeName: 'Some Other Brokerage',
          // Even if a stray contact were present, the third-party branch
          // never emits _assignedAgent.
          ListAgentEmail: 'leak@other.example.com',
        },
      }),
    );
    expect(dto._source).toBe('db+idx');
    expect(dto._assignedAgent).toBeUndefined();
  });

  test('detail page renders the assigned-agent contact card', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'app/listing/[...slug]/page.tsx'),
      'utf8',
    );
    // Card prefers the assigned agent and still keeps a brokerage fallback.
    expect(src).toMatch(/listing\._assignedAgent\?\.name/);
    expect(src).toMatch(/listing\._assignedAgent\?\.email/);
    expect(src).toMatch(/listing\._assignedAgent\?\.phone/);
    // §175.25 brokerage attribution line is preserved.
    expect(src).toMatch(/listing\._assignedAgent\?\.company \|\| listing\.listOfficeName/);
  });
});

// ── 5. Agent assignment sets the four fields on an exclusive ────────────

describe('buildExclusiveAgentAssignment (the four fields)', () => {
  const agent = {
    id: 7,
    full_name: 'Test Agent',
    email: 'test.agent@example.com',
    phone: '212-555-0100',
  };

  test('sets agent_id, list_agent_full_name, list_office_name, agent_info on an SL- exclusive', () => {
    const out = buildExclusiveAgentAssignment(agent, { listing_id: 'SL-9001', rls_eligible: true });
    expect(out).not.toBeNull();
    expect(out!.agent_id).toBe(BigInt(7));
    expect(out!.list_agent_full_name).toBe('Test Agent');
    expect(out!.list_office_name).toBe('Mallan Real Estate Inc.');
    expect(out!.agent_info.ListAgentFullName).toBe('Test Agent');
    expect(out!.agent_info.ListOfficeName).toBe('Mallan Real Estate Inc.');
    expect(out!.agent_info.ListAgentEmail).toBe('test.agent@example.com');
    expect(out!.agent_info.ListAgentDirectPhone).toBe('212-555-0100');
  });

  test('applies to website-only (rls_eligible === false) exclusives too', () => {
    const out = buildExclusiveAgentAssignment(agent, { listing_id: 'WEB-1', rls_eligible: false });
    expect(out).not.toBeNull();
    expect(out!.agent_id).toBe(BigInt(7));
  });

  test('returns null for a third-party IDX row (never stamps a non-Mallan listing)', () => {
    const out = buildExclusiveAgentAssignment(agent, { listing_id: 'RLS90001', rls_eligible: true });
    expect(out).toBeNull();
  });

  test('manual typed values win — blank-only merge does not overwrite existing agent_info', () => {
    const out = buildExclusiveAgentAssignment(
      agent,
      { listing_id: 'SL-9001', rls_eligible: true },
      { ListAgentFullName: 'Manually Typed Name', ListOfficeName: '' },
    );
    expect(out!.agent_info.ListAgentFullName).toBe('Manually Typed Name');
    // Blank existing key gets filled from identity / canonical default.
    expect(out!.agent_info.ListOfficeName).toBe('Mallan Real Estate Inc.');
    expect(out!.list_agent_full_name).toBe('Manually Typed Name');
  });

  test('isMallanExclusiveListing recognizes SL-/RL- prefixes and website-only', () => {
    expect(isMallanExclusiveListing({ listing_id: 'SL-1' })).toBe(true);
    expect(isMallanExclusiveListing({ listing_id: 'RL-1' })).toBe(true);
    expect(isMallanExclusiveListing({ listing_id: 'X', rls_eligible: false })).toBe(true);
    expect(isMallanExclusiveListing({ listing_id: 'RLS1', rls_eligible: true })).toBe(false);
  });
});

// ── 6. The assignment is WIRED into the CRM write paths ─────────────────
//
// The helper above is only useful if the create + edit routes actually call it
// — otherwise a saved exclusive carries no listing-agent attribution and the
// public contact card stays blank. Lock the integration so it can't regress.

describe('Exclusive agent assignment is wired into the CRM write paths', () => {
  test('POST /api/crm/listings stamps the assignment on create', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'app/api/crm/listings/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/import \{ buildExclusiveAgentAssignment \}/);
    expect(src).toMatch(/buildExclusiveAgentAssignment\(/);
    // The two promoted display columns are persisted from the assignment.
    expect(src).toMatch(/list_agent_full_name: exclusiveAssignment\?\.list_agent_full_name/);
    expect(src).toMatch(/list_office_name: exclusiveAssignment\?\.list_office_name/);
  });

  test('PATCH /api/crm/listings/[id] re-stamps the assignment on edit', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'app/api/crm/listings/[id]/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/import \{ buildExclusiveAgentAssignment \}/);
    expect(src).toMatch(/buildExclusiveAgentAssignment\(/);
    // Keyed off the listing's OWN agent, not the editor (no ownership reassign).
    expect(src).toMatch(/where: \{ id: listing\.agent_id \}/);
  });
});
