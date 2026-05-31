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

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');
const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const META = readFileSync(resolve(__dirname, '../../artifacts/metadata.xml'), 'utf8');
const hasField = (f: string) => new RegExp(`Property Name="${f}"`).test(META);

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
    .replace(/\)\s*:\s*Record<[^>]*>\s*\{/g, ') {')
    .replace(/\)\s*:\s*string\s*\{/g, ') {')
    // parameter / variable type annotations
    .replace(/:\s*Record<[^>]*>/g, '')
    .replace(/:\s*unknown/g, '')
    // `as` casts
    .replace(/\s+as\s+Record<[^>]*>/g, '')
    .replace(/\s+as\s+string/g, '');
}
function loadHelpers() {
  const mapStart = ROUTE.indexOf('const SAVED_PROFILE_CONTRACT_TO_FORM');
  if (mapStart === -1) throw new Error('SAVED_PROFILE_CONTRACT_TO_FORM not found');
  const mapBlock = ROUTE.slice(mapStart, ROUTE.indexOf('};', mapStart) + 2);
  const block = stripTs(
    `${mapBlock}\n${sliceFn(ROUTE, 'addressIdentityKey')}\n${sliceFn(ROUTE, 'extractSavedProfileValues')}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(
    `${block}; return { SAVED_PROFILE_CONTRACT_TO_FORM, addressIdentityKey, extractSavedProfileValues };`,
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
    // dedup matches on EITHER the BK key or the address-identity key
    expect(ROUTE).toMatch(/seenAddresses\.has\(_addrKey\) \|\| \(_bkKey && seenAddresses\.has\(_bkKey\)\)/);
  });

  it('the address key is derived from addressIdentityKey() at every dedup site (not a listing id)', () => {
    const matches = ROUTE.match(/const _addrKey = addressIdentityKey\(/g) || [];
    expect(matches.length).toBe(3); // DB-address, DB-name, Cotality
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
