/// <reference types="jest" />
/**
 * Building identity + SAVED Mallan/REBNY building-profile merge (Part A).
 *
 * /api/buildings/search resolves a BUILDING identity (not a listing id) and
 * surfaces SAVED building-profile values (management company, super, board,
 * financing, sublet policy) that a Mallan agent typed on a PRIOR listing in the
 * same building. Those values live in the listing's stored JSON under the form's
 * saved key names (raw_data first, then features, then custom_fields) and are
 * merged across ALL listings of the same building identity (first non-empty
 * value per key wins).
 *
 * This suite proves:
 *   1. Building identity resolves by BuildingKeyNumeric, then full
 *      address + borough + zip, then plain full address — NEVER by listing id.
 *   2. Saved mgmt/super/board/finance/sublet values are extracted from
 *      raw_data -> features -> custom_fields by the contract->form key map.
 *   3. Saved-profile keys are merged into the building object at all three
 *      DB construction/dedup sites.
 *   4. The DB SELECT (raw SQL) + findMany select pull raw_data + custom_fields.
 *   5. PetsAllowed is in the Cotality $select.
 *   6. No hardcoded production values (333 E 46th / RLS20093870 / SL-0004 /
 *      BuildingKeyNumeric literal) live in the route — only in test fixtures here.
 *
 * Real $metadata member names are used for every Cotality assertion.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { field as cotalityField } from '@/lib/cotality/live-contract';

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');
const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
// addressIdentityKey now canonicalizes dir/suffix/ordinal via the shared NYC
// normalizer, so the eval block must include those helpers + their lookup maps.
const NORM = readFileSync(resolve(__dirname, '../../lib/address/nyc-address-normalizer.ts'), 'utf8');
const hasField = (f: string) => cotalityField('Property', f) !== null;

// ── Load the route's identity + profile helpers via Function-eval ─────────────
// Strip TS-only syntax from the const map + the two helper functions so they
// run in plain JS (same approach as building-cotality-full-subset.test.ts).
function sliceFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`not found: ${name}`);
  const b = src.indexOf('{', start); let d = 0;
  for (let i = b; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); } }
  throw new Error('unbalanced');
}
function stripTs(s: string): string {
  return s
    // function return-type annotations:  ): Foo {  →  ) {
    .replace(/\)\s*:\s*Record<[^>]*>\s*\|\s*undefined\s*\{/g, ') {')
    .replace(/\)\s*:\s*Record<[^>]*>\s*\{/g, ') {')
    .replace(/\)\s*:\s*string\s*\{/g, ') {')
    .replace(/\)\s*:\s*void\s*\{/g, ') {')
    // parameter / variable type annotations (longest/most-specific first)
    .replace(/:\s*Map<[\s\S]*?>>(?=\s*[,)])/g, '')
    .replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*string\s*\|\s*null/g, '')
    .replace(/:\s*string(?=\s*[,)])/g, '')
    .replace(/:\s*unknown/g, '')
    // `as` casts
    .replace(/\s+as\s+Record<[^>]*>/g, '')
    .replace(/\s+as\s+string/g, '');
}
// Slice a top-level `const NAME … = { … };` block out of a source file.
function sliceConst(src: string, name: string): string {
  const start = src.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`const not found: ${name}`);
  return src.slice(start, src.indexOf('};', start) + 2);
}
function loadHelpers() {
  const mapStart = ROUTE.indexOf('const SAVED_PROFILE_CONTRACT_TO_FORM');
  if (mapStart === -1) throw new Error('SAVED_PROFILE_CONTRACT_TO_FORM not found');
  const mapBlock = ROUTE.slice(mapStart, ROUTE.indexOf('};', mapStart) + 2);
  // Shared NYC-normalizer pieces addressIdentityKey depends on.
  const normBlock =
    `${sliceConst(NORM, 'DIRECTION_MAP')}\n${sliceConst(NORM, 'SUFFIX_MAP')}\n` +
    `${sliceFn(NORM, 'normalizeOrdinal')}\n${sliceFn(NORM, 'canonicalizeDirection')}\n` +
    `${sliceFn(NORM, 'canonicalizeSuffix')}\n${sliceFn(NORM, 'canonicalizeStreetName')}`;
  const block = stripTs(
    `${normBlock}\n${mapBlock}\n${sliceFn(ROUTE, 'addressIdentityKey')}\n${sliceFn(ROUTE, 'addressOnlyKey')}\n${sliceFn(ROUTE, 'findRegisteredBuilding')}\n${sliceFn(ROUTE, 'promoteIdentity')}\n${sliceFn(ROUTE, 'registerBuilding')}\n${sliceFn(ROUTE, 'extractSavedProfileValues')}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(
    `${block}; return { SAVED_PROFILE_CONTRACT_TO_FORM, addressIdentityKey, addressOnlyKey, findRegisteredBuilding, promoteIdentity, registerBuilding, extractSavedProfileValues };`,
  )();
}
const H = loadHelpers();

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES (the ONLY place real-looking production identifiers may appear).
// ─────────────────────────────────────────────────────────────────────────────
const FIX = {
  bk: '20093870',
  addr: {
    StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH',
    StreetSuffix: 'St', CityRegion: 'Manhattan', PostalCode: '10017',
  },
};

describe('building identity key (BuildingKeyNumeric > address+borough+zip > address; NEVER listing id)', () => {
  it('two listings of the SAME building resolve to the SAME address-identity key', () => {
    const a = H.addressIdentityKey({ ...FIX.addr });
    const b = H.addressIdentityKey({ ...FIX.addr }); // a different unit, same building
    expect(a).toBe(b);
    expect(a).toContain('10017'); // zip incorporated
    expect(a.toUpperCase()).toBe(a); // normalized upper-case
  });

  it('incorporates borough + zip: same street, different borough/zip → different key', () => {
    const k1 = H.addressIdentityKey({ ...FIX.addr, CityRegion: 'Manhattan', PostalCode: '10017' });
    const k2 = H.addressIdentityKey({ ...FIX.addr, CityRegion: 'Brooklyn', PostalCode: '11201' });
    expect(k1).not.toBe(k2);
  });

  it('canonicalizes variant dir/suffix/ordinal tokens so one building yields ONE key (Codex review 3)', () => {
    // CRM-form full tokens vs Cotality abbreviations — same physical building.
    const formTokens = H.addressIdentityKey({
      StreetNumber: '333', StreetDirPrefix: 'East', StreetName: '46', StreetSuffix: 'Street',
      CityRegion: 'Manhattan', PostalCode: '10017',
    });
    const cotalityTokens = H.addressIdentityKey({
      StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'St',
      CityRegion: 'Manhattan', PostalCode: '10017',
    });
    expect(formTokens).toBe(cotalityTokens);
    // And the address-only key collapses the same way (so partial rows merge too).
    expect(H.addressOnlyKey({ StreetNumber: '333', StreetDirPrefix: 'East', StreetName: '46', StreetSuffix: 'Street' }))
      .toBe(H.addressOnlyKey({ StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'St' }));
  });

  it('falls back to plain full address when borough/zip absent (no crash, stable)', () => {
    const k = H.addressIdentityKey({ StreetNumber: '12', StreetName: 'Main', StreetSuffix: 'St' });
    expect(k).toContain('12');
    expect(k).toContain('MAIN');
    expect(H.addressIdentityKey({ StreetNumber: '12', StreetName: 'Main', StreetSuffix: 'St' })).toBe(k);
  });

  it('does NOT embed any listing id / ListingId in the identity key', () => {
    const k = H.addressIdentityKey({ ...FIX.addr, ListingId: 'RLS20093870' });
    expect(k).not.toContain('RLS20093870');
  });

  it('route prefers BuildingKeyNumeric over the address key (BK: prefix) on all paths', () => {
    expect(ROUTE).toMatch(/'BK:' \+ String\(feat\.BuildingKeyNumeric\)/);
    expect(ROUTE).toMatch(/'BK:' \+ String\(r\.BuildingKeyNumeric\)/);
    // dedup resolves the existing object through findRegisteredBuilding
    // (BK → full address+borough+zip → guarded address-only) at every site.
    // Lookbehind excludes the `function findRegisteredBuilding(` definition.
    const matches = ROUTE.match(/(?<!function )findRegisteredBuilding\(/g) || [];
    expect(matches.length).toBe(3); // DB-address, DB-name, Cotality (call sites)
  });

  it('the address key is derived from addressIdentityKey() at every dedup site (not a listing id)', () => {
    const matches = ROUTE.match(/const _addrKey = addressIdentityKey\(/g) || [];
    expect(matches.length).toBe(3); // DB-address, DB-name, Cotality
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Codex review 2026-05-31 — address-only fallback with borough/zip compatibility.
// The full identity key embeds borough+zip; when one side is missing borough/zip
// the full keys differ and would never collapse. addressOnlyKey + the guarded
// findRegisteredBuilding layer-3 match fixes that WITHOUT over-merging two
// genuinely different buildings that merely share a street address.
// ─────────────────────────────────────────────────────────────────────────────
describe('address-only fallback merges partial rows but never different buildings', () => {
  it('addressOnlyKey drops borough+zip but keeps the street parts (unit-free)', () => {
    const ao = H.addressOnlyKey({ ...FIX.addr });
    expect(ao).not.toContain('10017'); // zip dropped
    expect(ao).not.toContain('MANHATTAN'); // borough dropped
    expect(ao).toContain('333');
    expect(ao).toContain('46TH');
    // Same street address, different borough/zip → SAME address-only key …
    expect(H.addressOnlyKey({ ...FIX.addr, CityRegion: 'Brooklyn', PostalCode: '11201' })).toBe(ao);
  });

  // Helper: simulate the route's registries for one building, then ask
  // findRegisteredBuilding whether an incoming row resolves to it.
  function resolve(existingAddr: Record<string, unknown>, incomingAddr: Record<string, unknown>) {
    const bldg: Record<string, unknown> = {
      borough: String(existingAddr.CityRegion ?? ''),
      zip: String(existingAddr.PostalCode ?? ''),
    };
    const byKey = new Map<string, Record<string, unknown>>();
    const byAddrOnly = new Map<string, Array<Record<string, unknown>>>();
    byKey.set(H.addressIdentityKey(existingAddr), bldg);
    byAddrOnly.set(H.addressOnlyKey(existingAddr), [bldg]);
    return H.findRegisteredBuilding(
      byKey, byAddrOnly, null,
      H.addressIdentityKey(incomingAddr), H.addressOnlyKey(incomingAddr),
      String(incomingAddr.CityRegion ?? ''), String(incomingAddr.PostalCode ?? ''),
    );
  }

  it('a full row matches a prior PARTIAL row (no borough/zip) — Codex asymmetric case', () => {
    const partial = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'St' };
    const full = { ...FIX.addr }; // same building, now WITH borough+zip
    expect(resolve(partial, full)).toBeDefined(); // collapses onto the same building
  });

  it('a partial row matches a prior FULL row (reverse asymmetric)', () => {
    const full = { ...FIX.addr };
    const partial = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'St' };
    expect(resolve(full, partial)).toBeDefined();
  });

  it('two FULLY-specified rows in DIFFERENT boroughs never merge (no over-merge)', () => {
    const manhattan = { ...FIX.addr, CityRegion: 'Manhattan', PostalCode: '10017' };
    const brooklyn = { ...FIX.addr, CityRegion: 'Brooklyn', PostalCode: '11201' };
    expect(resolve(manhattan, brooklyn)).toBeUndefined();
  });

  it('same borough, different zip never merges; same borough + compatible (blank) zip does', () => {
    const a = { ...FIX.addr, CityRegion: 'Manhattan', PostalCode: '10017' };
    const differentZip = { ...FIX.addr, CityRegion: 'Manhattan', PostalCode: '10128' };
    expect(resolve(a, differentZip)).toBeUndefined();
    const blankZip = { ...FIX.addr, CityRegion: 'Manhattan', PostalCode: '' };
    expect(resolve(a, blankZip)).toBeDefined();
  });

  // Replays the route's per-row merge sequence with the REAL extracted helpers
  // (findRegisteredBuilding → promoteIdentity → registerBuilding) so the
  // partial-seen-first ordering is exercised exactly as production would.
  function runSequence(addrs: Array<Record<string, unknown>>) {
    const buildings: Array<Record<string, unknown>> = [];
    const byKey = new Map<string, Record<string, unknown>>();
    const byAddrOnly = new Map<string, Array<Record<string, unknown>>>();
    for (const addr of addrs) {
      const borough = String(addr.CityRegion ?? '');
      const zip = String(addr.PostalCode ?? '');
      // Test convention: `__bk` on the fixture simulates a row that carries a
      // BuildingKeyNumeric (the route builds 'BK:<num>' the same way).
      const bkKey = addr.__bk ? 'BK:' + String(addr.__bk) : null;
      const addrKey = H.addressIdentityKey(addr);
      const aoKey = H.addressOnlyKey(addr);
      const existing = H.findRegisteredBuilding(byKey, byAddrOnly, bkKey, addrKey, aoKey, borough, zip);
      if (existing) {
        H.promoteIdentity(existing, borough, zip, bkKey);
        H.registerBuilding(byKey, byAddrOnly, existing, bkKey, addrKey, aoKey);
        continue;
      }
      const bldg: Record<string, unknown> = { borough, zip, _label: `${borough}/${zip}` };
      buildings.push(bldg);
      H.registerBuilding(byKey, byAddrOnly, bldg, bkKey, addrKey, aoKey);
    }
    return buildings;
  }

  it('partial seen FIRST then a different-borough row does NOT over-merge (Codex review 2)', () => {
    const partial = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'St' };
    const manhattan = { ...partial, CityRegion: 'Manhattan', PostalCode: '10017' };
    const brooklyn = { ...partial, CityRegion: 'Brooklyn', PostalCode: '11201' };
    // partial + manhattan collapse to ONE building; brooklyn is a SECOND.
    const out = runSequence([partial, manhattan, brooklyn]);
    expect(out).toHaveLength(2);
    // The merged building carries the promoted Manhattan identity.
    expect(out[0].borough).toBe('Manhattan');
    expect(out[0].zip).toBe('10017');
    expect(out[1].borough).toBe('Brooklyn');
  });

  it('partial seen first then more SAME-building units still collapse to one', () => {
    const partial = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'St' };
    const manhattan = { ...partial, CityRegion: 'Manhattan', PostalCode: '10017' };
    const anotherPartial = { ...partial }; // another unit, still no borough/zip
    const out = runSequence([partial, manhattan, anotherPartial]);
    expect(out).toHaveLength(1);
    expect(out[0].borough).toBe('Manhattan');
  });

  it('promotes building_key onto the existing building once a row reveals it', () => {
    const partial = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'St' };
    // Same building, now fully identified WITH a BuildingKeyNumeric.
    const full = { ...partial, CityRegion: 'Manhattan', PostalCode: '10017', __bk: FIX.bk };
    const out = runSequence([partial, full]);
    expect(out).toHaveLength(1); // collapses onto the same building
    expect(out[0].building_key).toBe(FIX.bk); // BK identity promoted onto it
    expect(out[0].borough).toBe('Manhattan');
    expect(out[0].zip).toBe('10017');
  });
});

describe('saved building-profile extraction (raw_data -> features -> custom_fields)', () => {
  it('contract->form map covers mgmt/super/resident-manager/board/finance/sublet', () => {
    const m = H.SAVED_PROFILE_CONTRACT_TO_FORM;
    expect(m.building_mgmt_company).toBe('saleBldgMgmtCompany');
    expect(m.building_super_name).toBe('saleBldgSuperName');
    expect(m.building_resident_manager_name).toBe('saleBldgManagerName');
    expect(m.building_board_president).toBe('saleBldgBoardPresident');
    expect(m.building_board_email).toBe('saleBldgBoardEmail');
    expect(m.building_max_financing).toBe('saleBldgMaxFinancing');
    expect(m.building_min_down).toBe('saleBldgMinDownPayment');
    expect(m.building_dti).toBe('saleBldgDTIRatio');
    expect(m.building_post_close_liquidity).toBe('saleBldgPostCloseLiquidity');
    expect(m.building_board_approval).toBe('saleBldgBoardApproval');
    expect(m.building_board_interview).toBe('saleBldgBoardInterview');
    expect(m.building_sublet_allowed).toBe('saleBldgSublettingAllowed');
    expect(m.building_sublet_fee).toBe('saleBldgSubletFee');
    expect(m.building_sublet_max_years).toBe('saleBldgMaxSubletYears');
  });

  it('every mapped form key is a real id present in SALE-FORM-REDESIGN.html', () => {
    // Sublet policy has no dedicated form field yet (free-text saved key), skip it.
    const formKeys = Object.values(H.SAVED_PROFILE_CONTRACT_TO_FORM)
      .filter((k) => k !== 'saleBldgSubletPolicy') as string[];
    for (const k of formKeys) {
      expect(FORM.includes(`id="${k}"`)).toBe(true);
    }
  });

  it('reads from raw_data FIRST', () => {
    const out = H.extractSavedProfileValues(
      { saleBldgMgmtCompany: 'Douglas Elliman Mgmt' },
      { saleBldgMgmtCompany: 'features-value' },
      { saleBldgMgmtCompany: 'custom-value' },
    );
    expect(out.building_mgmt_company).toBe('Douglas Elliman Mgmt');
  });

  it('falls back to features then custom_fields', () => {
    const fromFeatures = H.extractSavedProfileValues(
      {}, { saleBldgSuperName: 'Jane Super' }, {},
    );
    expect(fromFeatures.building_super_name).toBe('Jane Super');

    const fromCustom = H.extractSavedProfileValues(
      {}, {}, { saleBldgBoardPresident: 'Pat President' },
    );
    expect(fromCustom.building_board_president).toBe('Pat President');
  });

  it('merges mgmt/super/board/finance/sublet across the contract keys', () => {
    const out = H.extractSavedProfileValues(
      {
        saleBldgMgmtCompany: 'Acme Mgmt',
        saleBldgSuperName: 'Sam Super',
        saleBldgBoardPresident: 'Bo President',
        saleBldgMaxFinancing: '75%',
        saleBldgMinDownPayment: '25%',
        saleBldgSubletFee: '$500',
        saleBldgMaxSubletYears: '2',
      },
      {}, {},
    );
    expect(out.building_mgmt_company).toBe('Acme Mgmt');
    expect(out.building_super_name).toBe('Sam Super');
    expect(out.building_board_president).toBe('Bo President');
    expect(out.building_max_financing).toBe('75%');
    expect(out.building_min_down).toBe('25%');
    expect(out.building_sublet_fee).toBe('$500');
    expect(out.building_sublet_max_years).toBe('2');
  });

  it('NEVER invents: absent/blank values are omitted (no key emitted)', () => {
    const out = H.extractSavedProfileValues(
      { saleBldgMgmtCompany: '', saleBldgSuperName: null, saleBldgBoardEmail: undefined },
      {}, {},
    );
    expect('building_mgmt_company' in out).toBe(false);
    expect('building_super_name' in out).toBe(false);
    expect('building_board_email' in out).toBe(false);
    expect(Object.keys(out).length).toBe(0);
  });

  it('tolerates non-object / null JSON columns', () => {
    expect(H.extractSavedProfileValues(null, undefined, 'not-an-object')).toEqual({});
    expect(H.extractSavedProfileValues('x', 0, [])).toEqual({});
  });
});

describe('route wiring — saved profile merged into the building object', () => {
  it('extractSavedProfileValues is called on both DB paths and spread into the building', () => {
    const calls = ROUTE.match(/extractSavedProfileValues\(l\.raw_data, l\.features, l\.custom_fields\)/g) || [];
    expect(calls.length).toBe(2); // DB-address + DB-name
    // spread last so a real saved value wins over the blank default
    expect(ROUTE).toMatch(/\.\.\.savedProfile,/);
    // and merged onto an existing building when a duplicate unit is found
    expect(ROUTE).toMatch(/mergeMissingExtras\(_existing, savedProfile\)/);
  });

  it('DB raw SQL SELECT pulls raw_data + custom_fields', () => {
    expect(ROUTE).toMatch(/SELECT address, features, raw_data, custom_fields, property_type, property_sub_type FROM listings/);
    expect(ROUTE).toMatch(/address: unknown; features: unknown; raw_data: unknown; custom_fields: unknown;/);
  });

  it('DB findMany select pulls raw_data + custom_fields', () => {
    expect(ROUTE).toMatch(/select: \{ address: true, features: true, raw_data: true, custom_fields: true,/);
  });

  it('amenity union + building_pets/building_laundry resolvers stay intact', () => {
    expect(ROUTE).toMatch(/\.\.\.buildingAmenityFlags\(r\)/);
    expect(ROUTE).toMatch(/building_pets: buildingPetPolicy\(r\)/);
    expect(ROUTE).toMatch(/building_laundry: buildingLaundryPolicy\(r\)/);
  });
});

describe('Cotality $select', () => {
  it("PetsAllowed is in the $select (route reads r.PetsAllowed)", () => {
    // the SELECT array contains the literal 'PetsAllowed'
    expect(ROUTE).toMatch(/'PetsAllowed'/);
    // and PetsAllowed is a real $metadata field
    expect(hasField('PetsAllowed')).toBe(true);
  });

  it('BuildingKeyNumeric (the identity field) is in the $select and is a real field', () => {
    expect(ROUTE).toMatch(/'BuildingKeyNumeric'/);
    expect(hasField('BuildingKeyNumeric')).toBe(true);
  });
});

describe('no hardcoded production values in the route (fixtures only)', () => {
  it('route source contains none of the known prod identifiers', () => {
    expect(ROUTE).not.toContain('RLS20093870');
    expect(ROUTE).not.toContain('SL-0004');
    expect(ROUTE).not.toMatch(/333\s+E(?:ast)?\s+46/i);
    expect(ROUTE).not.toContain('20093870');
  });
});
