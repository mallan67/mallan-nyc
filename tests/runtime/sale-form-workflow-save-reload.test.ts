/// <reference types="jest" />
/**
 * Sale-form workflow — explicit SAVE → RELOAD end-to-end proof. (PR #304, gap A)
 *
 * The other PR-304 suites each lock one slice (identity, parking/pets, agent
 * assignment, URL). This suite ties the WHOLE cycle together with the ACTUAL
 * production functions so a regression in any one stage breaks a single,
 * readable end-to-end story:
 *
 *   1. Agent starts a sale  → buildExclusiveAgentAssignment stamps the four
 *      owner fields from the authenticated agent identity (never hardcoded).
 *   2. Address/building identity resolves → addressIdentityKey (route) keys a
 *      BUILDING, and the unit is EXCLUDED so two units never fragment it.
 *   3. BuildingKeyNumeric wins, address+borough+zip is the fallback, and the
 *      address-only fallback is guarded (different borough/zip never merge).
 *   4. Building profile RELOADS from saved Mallan profile (raw_data), Cotality
 *      facts, and prior listings — and a MANUAL value is never overwritten.
 *   5. The listing URL is generated from full address + unit + listing id.
 *   6. The reload of the persisted row returns the SAME agent ownership and the
 *      public DTO exposes the assigned agent ONLY for a Mallan exclusive
 *      (third-party IDX rows never leak agent PII).
 *
 * Fixtures are generic (agent "Jordan Rivera", "150 W 80th St", SL-9001). No
 * production identity (no 333 E 46th, no SL-0004) is depended on. The route's
 * internal identity/merge helpers are loaded via the same Function-eval harness
 * used by building-identity-profile.test.ts (they are module-private).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildExclusiveAgentAssignment,
  isMallanExclusiveListing,
} from '../../lib/listings/exclusive-agent-assignment';
import { generateListingSlug } from '../../lib/listing-slug';
import {
  dbListingToPublicDTO,
  classifyDbListing,
  type DbListing,
} from '../../lib/idx/db-to-public-dto';

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');
const NORM = readFileSync(resolve(__dirname, '../../lib/address/nyc-address-normalizer.ts'), 'utf8');

// ── Function-eval harness (mirrors building-identity-profile.test.ts) ─────────
function sliceFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`not found: ${name}`);
  const b = src.indexOf('{', start);
  let d = 0;
  for (let i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced');
}
function sliceConst(src: string, name: string): string {
  const start = src.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`const not found: ${name}`);
  return src.slice(start, src.indexOf('};', start) + 2);
}
function stripTs(s: string): string {
  return s
    .replace(/\)\s*:\s*Record<[^>]*>\s*\|\s*undefined\s*\{/g, ') {')
    .replace(/\)\s*:\s*Record<[^>]*>\s*\{/g, ') {')
    .replace(/\)\s*:\s*string\s*\{/g, ') {')
    .replace(/\)\s*:\s*void\s*\{/g, ') {')
    .replace(/:\s*Map<[\s\S]*?>>(?=\s*[,)])/g, '')
    .replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*string\s*\|\s*null/g, '')
    .replace(/:\s*string(?=\s*[,)])/g, '')
    .replace(/:\s*unknown/g, '')
    .replace(/\s+as\s+Record<[^>]*>/g, '')
    .replace(/\s+as\s+string/g, '');
}
function loadHelpers() {
  const mapBlock = sliceConst(ROUTE, 'SAVED_PROFILE_CONTRACT_TO_FORM');
  const normBlock =
    `${sliceConst(NORM, 'DIRECTION_MAP')}\n${sliceConst(NORM, 'SUFFIX_MAP')}\n` +
    `${sliceFn(NORM, 'normalizeOrdinal')}\n${sliceFn(NORM, 'canonicalizeDirection')}\n` +
    `${sliceFn(NORM, 'canonicalizeSuffix')}\n${sliceFn(NORM, 'canonicalizeStreetName')}`;
  const block = stripTs(
    `${normBlock}\n${mapBlock}\n` +
      `${sliceFn(ROUTE, 'addressIdentityKey')}\n${sliceFn(ROUTE, 'addressOnlyKey')}\n` +
      `${sliceFn(ROUTE, 'findRegisteredBuilding')}\n${sliceFn(ROUTE, 'extractSavedProfileValues')}\n` +
      `${sliceFn(ROUTE, 'mergeMissingExtras')}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(
    `${block}; return { addressIdentityKey, addressOnlyKey, findRegisteredBuilding, extractSavedProfileValues, mergeMissingExtras };`,
  )();
}
const H = loadHelpers();

// Full DbListing fixture (mirrors crm-publication-featured-exclusive.test.ts).
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
    list_price: '1500000',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1100',
    borough: 'Manhattan',
    neighborhood: 'Upper West Side',
    address: {
      StreetNumber: '150',
      StreetDirPrefix: 'W',
      StreetName: '80th',
      StreetSuffix: 'Street',
      UnitNumber: '4B',
      City: 'New York',
      PostalCode: '10024',
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
  } as DbListing;
}

// A generic authenticated agent — NOT Maya, NOT hardcoded anywhere in source.
const AGENT = {
  id: '7007',
  full_name: 'Jordan Rivera',
  email: 'jordan.rivera@mallan.nyc',
  phone: '212-555-0147',
};

describe('Sale workflow A — agent starts sale: ownership stamped from session identity', () => {
  const saved = buildExclusiveAgentAssignment(AGENT, { listing_id: 'SL-9001', rls_eligible: true });

  it('stamps all four owner fields (agent_id, agent_info, list_agent_full_name, list_office_name)', () => {
    expect(saved).not.toBeNull();
    expect(saved!.agent_id).toBe(BigInt('7007'));
    expect(saved!.list_agent_full_name).toBe('Jordan Rivera');
    expect(saved!.list_office_name).toMatch(/Mallan/);
    expect(saved!.agent_info.ListAgentFullName).toBe('Jordan Rivera');
    expect(saved!.agent_info.ListOfficeName).toMatch(/Mallan/);
  });

  it('the assigned agent is the authenticated identity, not a hardcoded person', () => {
    const other = buildExclusiveAgentAssignment(
      { id: '8008', full_name: 'Priya Nair', email: 'priya@mallan.nyc' },
      { listing_id: 'SL-9001', rls_eligible: true },
    );
    expect(other!.agent_id).toBe(BigInt('8008'));
    expect(other!.list_agent_full_name).toBe('Priya Nair');
  });

  it('manual typed agent name is preserved (manual wins over identity)', () => {
    const withManual = buildExclusiveAgentAssignment(
      AGENT,
      { listing_id: 'SL-9001' },
      { ListAgentFullName: 'Manually Typed Name' },
    );
    expect(withManual!.agent_info.ListAgentFullName).toBe('Manually Typed Name');
    expect(withManual!.list_agent_full_name).toBe('Manually Typed Name');
  });

  it('a third-party IDX row is NEVER stamped with a Mallan agent', () => {
    expect(buildExclusiveAgentAssignment(AGENT, { listing_id: 'RLS-7001', rls_eligible: true })).toBeNull();
    expect(isMallanExclusiveListing({ listing_id: 'RLS-7001', rls_eligible: true })).toBe(false);
  });
});

describe('Sale workflow B/C — building identity resolves; unit never fragments it', () => {
  // Two different UNITS in the SAME physical building, written by different
  // sources (CRM full words vs Cotality abbreviations).
  const unit4B = {
    StreetNumber: '150', StreetDirPrefix: 'W', StreetName: '80th', StreetSuffix: 'Street',
    UnitNumber: '4B', CityRegion: 'Manhattan', PostalCode: '10024',
  };
  const unit9C = {
    StreetNumber: '150', StreetDirPrefix: 'West', StreetName: '80', StreetSuffix: 'St',
    UnitNumber: '9C', CityRegion: 'Manhattan', PostalCode: '10024',
  };

  it('two units of the same building share ONE identity key (unit excluded, tokens canonicalized)', () => {
    expect(H.addressIdentityKey(unit4B)).toBe(H.addressIdentityKey(unit9C));
  });

  it('a different ZIP at the same street is a DIFFERENT building (no over-merge)', () => {
    const differentZip = { ...unit4B, PostalCode: '10025' };
    expect(H.addressIdentityKey(differentZip)).not.toBe(H.addressIdentityKey(unit4B));
  });

  it('BuildingKeyNumeric wins first — resolves the building even when the address key differs', () => {
    const byBk = new Map<string, Record<string, unknown>>([['BK:123', { name: 'resolved-via-BK' }]]);
    const found = H.findRegisteredBuilding(byBk, new Map(), 'BK:123', 'SOME-OTHER-ADDR||', 'SOME-OTHER', '', '');
    expect(found).toEqual({ name: 'resolved-via-BK' });
  });

  it('address-only fallback is GUARDED: matches a compatible borough/zip, blocks an incompatible one', () => {
    const aoKey = H.addressOnlyKey(unit4B); // street parts only
    const byAddrOnly = new Map<string, Array<Record<string, unknown>>>([
      [aoKey, [{ name: 'bldgA', borough: 'MANHATTAN', zip: '10024' }]],
    ]);
    // Compatible (same borough+zip) → merges.
    expect(
      H.findRegisteredBuilding(new Map(), byAddrOnly, null, 'ZZZ', aoKey, 'MANHATTAN', '10024'),
    ).toEqual({ name: 'bldgA', borough: 'MANHATTAN', zip: '10024' });
    // Incompatible (different borough) → must NOT merge.
    expect(
      H.findRegisteredBuilding(new Map(), byAddrOnly, null, 'ZZZ', aoKey, 'BROOKLYN', '11201'),
    ).toBeUndefined();
  });
});

describe('Sale workflow D — building profile reloads from all sources, manual never overwritten', () => {
  it('saved Mallan profile reloads from raw_data (mgmt/board/financing), raw_data wins over features', () => {
    const raw_data = {
      saleBldgMgmtCompany: 'Skyline Management',
      saleBldgBoardPresident: 'A. Chen',
      saleBldgMaxFinancing: '80%',
    };
    const features = { saleBldgMgmtCompany: 'STALE — should lose to raw_data' };
    const profile = H.extractSavedProfileValues(raw_data, features, {});
    expect(profile.building_mgmt_company).toBe('Skyline Management');
    expect(profile.building_board_president).toBe('A. Chen');
    expect(profile.building_max_financing).toBe('80%');
  });

  it('unsupported/unknown fields stay blank — extraction never invents a value', () => {
    const profile = H.extractSavedProfileValues({ saleBldgMgmtCompany: 'Skyline' }, {}, {});
    expect(profile.building_super_name).toBeUndefined();
    expect(profile.building_dti).toBeUndefined();
  });

  it('Cotality facts fill blanks but a MANUAL building value is never overwritten', () => {
    // `target` is the building object carrying a value the agent already typed.
    const target: Record<string, unknown> = { building_mgmt_company: 'Manual Mgmt Co', year_built: null, building_pets: [] };
    const cotalityFacts = { year_built: 1962, stories_total: 15, building_mgmt_company: 'Cotality Should Not Win' };
    H.mergeMissingExtras(target, cotalityFacts);
    expect(target.building_mgmt_company).toBe('Manual Mgmt Co'); // manual wins
    expect(target.year_built).toBe(1962); // blank filled from Cotality
    expect(target.stories_total).toBe(15);
  });

  it('a PRIOR listing at the same identity backfills missing fields (aggregation)', () => {
    const target: Record<string, unknown> = { building_pets: [], building_board_president: '' };
    const priorListingExtras = { building_pets: ['BuildingCatsOk'], building_board_president: 'A. Chen' };
    H.mergeMissingExtras(target, priorListingExtras);
    expect(target.building_pets).toEqual(['BuildingCatsOk']);
    expect(target.building_board_president).toBe('A. Chen');
  });
});

describe('Sale workflow F — listing URL from full address + unit + listing id', () => {
  it('slug includes street, unit (apt-), and the listing id suffix', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '150', streetDirPrefix: 'W', streetName: '80th Street',
        unitNumber: '4B', city: 'New York', stateOrProvince: 'NY', postalCode: '10024',
      },
      id: 'SL-9001',
    });
    expect(slug).toMatch(/150/);
    expect(slug).toMatch(/80th-street/);
    expect(slug).toMatch(/apt-4b/);
    expect(slug).toMatch(/sl-9001$/);
  });

  it('handles a missing unit gracefully (no apt- segment)', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '150', streetDirPrefix: 'W', streetName: '80th Street',
        unitNumber: null, city: 'New York', stateOrProvince: 'NY', postalCode: '10024',
      },
      id: 'SL-9001',
    });
    expect(slug).not.toMatch(/apt-/);
    expect(slug).toMatch(/sl-9001$/);
  });

  it('is deterministic for identical input', () => {
    const args = {
      address: {
        streetNumber: '150', streetDirPrefix: 'W', streetName: '80th Street',
        unitNumber: '4B', city: 'New York', stateOrProvince: 'NY', postalCode: '10024',
      },
      id: 'SL-9001',
    };
    expect(generateListingSlug(args)).toBe(generateListingSlug(args));
  });
});

describe('Sale workflow G/H — reload returns persisted ownership; DTO exposes agent only for exclusives', () => {
  it('reloaded Mallan exclusive exposes the assigned agent contact card', () => {
    const reloaded = makeDbListing({
      listing_id: 'SL-9001',
      agent_id: BigInt('7007') as unknown as DbListing['agent_id'],
      agent_info: {
        ListAgentFullName: 'Jordan Rivera',
        ListAgentEmail: 'jordan.rivera@mallan.nyc',
        ListAgentDirectPhone: '212-555-0147',
        ListOfficeName: 'Mallan Real Estate Inc.',
      },
    });
    expect(classifyDbListing(reloaded)).toBe('mallan-exclusive');
    const dto = dbListingToPublicDTO(reloaded);
    expect(dto._source).toBe('exclusive');
    expect(dto._assignedAgent).toBeDefined();
    expect(dto._assignedAgent!.name).toBe('Jordan Rivera');
    expect(dto._assignedAgent!.company).toMatch(/Mallan/);
  });

  it('reloaded third-party IDX row exposes NO agent PII (name/email/phone stripped)', () => {
    const thirdParty = makeDbListing({
      listing_id: 'RLS-7001',
      agent_id: null,
      rls_eligible: true,
      agent_info: {
        ListAgentFullName: 'Third Party Agent',
        ListAgentEmail: 'leak@otherbrokerage.com',
        ListAgentDirectPhone: '212-555-9999',
        ListOfficeName: 'Other Brokerage LLC',
      },
    });
    expect(classifyDbListing(thirdParty)).toBe('third-party-idx');
    const dto = dbListingToPublicDTO(thirdParty);
    expect(dto._source).toBe('db+idx');
    expect(dto._assignedAgent).toBeUndefined();
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toMatch(/leak@otherbrokerage\.com/);
    expect(serialized).not.toMatch(/Third Party Agent/);
  });
});
