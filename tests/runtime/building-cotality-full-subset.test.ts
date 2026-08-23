/// <reference types="jest" />
/**
 * Building lookup — full Cotality subset (2026-05-31).
 *
 * Building amenities/policies are spread across SIX Multi-enum fields, with
 * building-level items as Building*-prefixed members. /api/buildings/search now
 * unions all six (BuildingFeatures + ExteriorFeatures + CommunityFeatures +
 * AssociationAmenities + AccessibilityFeatures + ParkingFeatures), derives
 * building pet policy from PetsAllowed Building* members and building laundry
 * from LaundryFeatures Building* members, and aggregates by BuildingKeyNumeric.
 * All member names verified against live $metadata.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { field as cotalityField, enumMembers } from '@/lib/cotality/verified-contract';

const ROUTE = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');
const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const hasField = (f: string) => cotalityField('Property', f) !== null;
const enumHasMember = (en: string, m: string) => {
  const members = enumMembers(en);
  return !!members && members.some((x) => x.name === m);
};

function sliceFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`not found: ${name}`);
  const b = src.indexOf('{', start); let d = 0;
  for (let i = b; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); } }
  throw new Error('unbalanced');
}
// Extract the route's resolver block (consts + functions), strip TS types, eval.
function loadResolvers() {
  const s = ROUTE.indexOf('const AMENITY_FEATURE_FIELDS');
  const e = ROUTE.indexOf('function buildingExtras(');
  let block = ROUTE.slice(s, e)
    .replace(/: Record<[^>]*>/g, '')
    .replace(/: Set<string>/g, '')
    .replace(/new Set<string>\(\)/g, 'new Set()')
    .replace(/: string\[\]/g, '')
    .replace(/ as string\[\]/g, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(`${block}; return { buildingAmenityFlags, buildingPetPolicy, buildingLaundryPolicy };`)();
}
const R = loadResolvers();

describe('Cotality authority — added $select fields + mapped members exist in live $metadata', () => {
  it('all added building-subset fields exist', () => {
    ['BuildingKeyNumeric', 'BuildingAreaTotal', 'NumberOfUnitsInCommunity', 'PropertyCondition',
     'OwnershipType', 'PropertyAttachedYN', 'AssociationYN', 'AssociationPhone', 'AssociationFee2',
     'ExteriorFeatures', 'CommunityFeatures', 'AccessibilityFeatures', 'ParkingFeatures',
     'AssociationAmenities', 'BuildingFeatures', 'PetsAllowed', 'LaundryFeatures']
      .forEach((f) => expect(hasField(f)).toBe(true));
  });
  it('mapped amenity members are real enum members', () => {
    expect(enumHasMember('ExteriorFeatures', 'BuildingRoofDeck')).toBe(true);
    expect(enumHasMember('ParkingFeatures', 'BuildingGarage')).toBe(true);
    expect(enumHasMember('AccessibilityFeatures', 'BuildingWheelchairAccessible')).toBe(true);
    expect(enumHasMember('PetsAllowed', 'BuildingCatsOk')).toBe(true);
    expect(enumHasMember('LaundryFeatures', 'BuildingCoinOperated')).toBe(true);
  });
});

describe('amenity union resolver', () => {
  it('unions all six feature fields (RoofDeck from ExteriorFeatures, garage from ParkingFeatures)', () => {
    const flags = R.buildingAmenityFlags({ ExteriorFeatures: 'BuildingRoofDeck', ParkingFeatures: 'BuildingGarage' });
    expect(flags.roof_deck).toBe(true);
    expect(flags.parking).toBe(true);
  });
  it('maps BuildingWheelchairAccessible → wheelchair_access; CommunityFeatures Elevator → elevator', () => {
    expect(R.buildingAmenityFlags({ AccessibilityFeatures: 'BuildingWheelchairAccessible' }).wheelchair_access).toBe(true);
    expect(R.buildingAmenityFlags({ CommunityFeatures: 'Elevator,FitnessCenter' }).gym).toBe(true);
    expect(R.buildingAmenityFlags({ AssociationAmenities: 'Concierge,IndoorPool' }).pool).toBe(true);
  });
  it('only emits TRUE flags (never clobbers a per-record true with false)', () => {
    expect('doorman' in R.buildingAmenityFlags({ BuildingFeatures: 'Storage' })).toBe(false);
  });
});

describe('building pet policy (PetsAllowed Building* members; unit-level ignored)', () => {
  it('BuildingCatsOk/DogsOk/Yes/No map to form building-pet values (Ok→OK)', () => {
    expect(R.buildingPetPolicy({ PetsAllowed: 'BuildingCatsOk,BuildingYes,CatsOk,Yes' }).sort())
      .toEqual(['BuildingCatsOK', 'BuildingYes']);
  });
  it('unit-level pet members do NOT become building policy', () => {
    expect(R.buildingPetPolicy({ PetsAllowed: 'CatsOk,DogsOk,Yes,No' })).toEqual([]);
  });
});

describe('building laundry policy (LaundryFeatures Building* members, prefix stripped)', () => {
  it('BuildingCoinOperated/InBasement/Other → CoinOperated/InBasement/Other', () => {
    expect(R.buildingLaundryPolicy({ LaundryFeatures: 'BuildingCoinOperated,BuildingInBasement,BuildingOther' }).sort())
      .toEqual(['CoinOperated', 'InBasement', 'Other']);
  });
  it('unit-level laundry members do NOT become building policy', () => {
    expect(R.buildingLaundryPolicy({ LaundryFeatures: 'InUnit,WasherHookup,CommonArea' })).toEqual([]);
  });
});

describe('route wiring', () => {
  it('buildingExtras spreads the union + building pet/laundry + building_key', () => {
    const fn = sliceFn(ROUTE, 'buildingExtras');
    expect(fn).toMatch(/\.\.\.buildingAmenityFlags\(r\)/);
    expect(fn).toMatch(/building_pets: buildingPetPolicy\(r\)/);
    expect(fn).toMatch(/building_laundry: buildingLaundryPolicy\(r\)/);
    expect(fn).toMatch(/building_key:.*BuildingKeyNumeric/);
  });
  it('aggregates by BuildingKeyNumeric (preferred over address)', () => {
    expect(ROUTE).toMatch(/'BK:' \+ String\(r\.BuildingKeyNumeric\)/);
  });
  it('dedups on EITHER address or BuildingKeyNumeric via findRegisteredBuilding (cached rows without BK still merge) (Codex #301)', () => {
    // The EITHER-key dedup now lives inside findRegisteredBuilding: BK first,
    // then the full address+borough+zip key, then the guarded address-only key.
    const fn = sliceFn(ROUTE, 'findRegisteredBuilding');
    expect(fn).toMatch(/const byBk = buildingByKey\.get\(bkKey\)/);
    expect(fn).toMatch(/const byAddr = buildingByKey\.get\(addrKey\)/);
    // Every dedup site resolves through it (DB-address, DB-name, Cotality).
    // Lookbehind excludes the `function findRegisteredBuilding(` definition.
    expect((ROUTE.match(/(?<!function )findRegisteredBuilding\(/g) || []).length).toBe(3);
  });
  it('resolves the existing object via the normalized key map, not raw address equality (Codex #301)', () => {
    // buildingByKey is indexed by both keys; registerBuilding does the indexing.
    expect(ROUTE).toMatch(/const buildingByKey = new Map/);
    const reg = sliceFn(ROUTE, 'registerBuilding');
    expect(reg).toMatch(/buildingByKey\.set\(addrKey, bldg\)/);
    expect(reg).toMatch(/if \(bkKey\) buildingByKey\.set\(bkKey, bldg\)/);
    expect(ROUTE).not.toMatch(/const existing = buildings\.find/); // no raw-address-equality lookup
  });
  it('a duplicate DB row backfills + re-registers its BuildingKeyNumeric onto the existing building (Codex #301)', () => {
    expect(ROUTE).toMatch(/mergeMissingExtras\(_existing, buildingExtras\(feat\)\)/);
    // Re-registering the existing object indexes any newly-known key (BK / fuller
    // address) so a later Cotality record matches it instead of duplicating.
    expect(ROUTE).toMatch(/registerBuilding\(buildingByKey, buildingByAddrOnly, _existing,/);
    // building_key promotion now lives in promoteIdentity (called with _bkKey).
    expect(ROUTE).toMatch(/promoteIdentity\(_existing, .*_bkKey\)/);
    const promote = sliceFn(ROUTE, 'promoteIdentity');
    expect(promote).toMatch(/existing\.building_key = bkKey\.slice\(3\)/);
  });
  it('does NOT treat phantom BuildingLaundryFeatures/BuildingPetsAllowed/AttendanceType as Cotality', () => {
    expect(hasField('BuildingLaundryFeatures')).toBe(false);
    expect(hasField('BuildingPetsAllowed')).toBe(false);
    expect(hasField('AttendanceType')).toBe(false);
    expect(ROUTE).not.toMatch(/'BuildingLaundryFeatures'|'BuildingPetsAllowed'|'AttendanceType'/); // not in $select
  });
  it('fetches ALL SIX amenity feature fields it unions — incl. AssociationAmenities (Codex #301)', () => {
    ['BuildingFeatures', 'ExteriorFeatures', 'CommunityFeatures', 'AssociationAmenities', 'AccessibilityFeatures', 'ParkingFeatures']
      .forEach((f) => expect(ROUTE).toMatch(new RegExp(`'${f}'`)));
  });
});

describe('BuildingKeyNumeric aggregation backfills empty policy arrays (Codex #301)', () => {
  function loadMerge() {
    const fn = sliceFn(ROUTE, 'mergeMissingExtras').replace(/: Record<[^>]*>/g, '');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    return new Function(`${fn}; return mergeMissingExtras;`)();
  }
  const mergeMissingExtras = loadMerge();
  it('an empty array target IS backfilled from a later non-empty unit', () => {
    const target: Record<string, unknown> = { building_pets: [], building_laundry: [] };
    mergeMissingExtras(target, { building_pets: ['BuildingCatsOK'], building_laundry: ['CoinOperated'] });
    expect(target.building_pets).toEqual(['BuildingCatsOK']);
    expect(target.building_laundry).toEqual(['CoinOperated']);
  });
  it('a non-empty array is NOT overwritten (manual/first value wins)', () => {
    const target: Record<string, unknown> = { building_pets: ['BuildingNo'] };
    mergeMissingExtras(target, { building_pets: ['BuildingCatsOK'] });
    expect(target.building_pets).toEqual(['BuildingNo']);
  });
});

describe('form populate — building pet/laundry fill (suggestion-only, manual wins)', () => {
  type Cb = { value: string; checked: boolean };
  function run(building: Record<string, unknown>, groups: Record<string, Cb[]>) {
    const document = {
      getElementById: () => null,
      querySelectorAll: (sel: string) => { const m = sel.match(/name="([^"]+)"/); return (m && groups[m[1]]) || []; },
      querySelector: (sel: string) => {
        const v = sel.match(/value="([^"]+)"/);
        if (v) for (const g of Object.values(groups)) { const cb = g.find((c) => c.value === v[1]); if (cb) return cb; }
        return null;
      },
      createElement: () => ({ value: '', text: '', dataset: {} }),
    };
    const start = FORM.indexOf('function populateBuildingFromIDX(');
    const b = FORM.indexOf('{', start); let d = 0; let endi = b;
    for (let i = b; i < FORM.length; i++) { if (FORM[i] === '{') d++; else if (FORM[i] === '}') { d--; if (!d) { endi = i + 1; break; } } }
    const src = FORM.slice(start, endi);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function('document', '_syncSaleBuildingAddressFields', `${src}; return populateBuildingFromIDX;`)(document, () => {})('sale', building);
  }
  it('fills building pet + laundry checkboxes from the building-level arrays when empty', () => {
    const pets: Cb[] = [{ value: 'BuildingCatsOK', checked: false }, { value: 'BuildingYes', checked: false }, { value: 'BuildingNo', checked: false }];
    const laundry: Cb[] = [{ value: 'CoinOperated', checked: false }, { value: 'InBasement', checked: false }];
    run({ building_pets: ['BuildingCatsOK', 'BuildingYes'], building_laundry: ['CoinOperated'] }, { saleBuildingPetsAllowed: pets, saleBuildingLaundryFeatures: laundry });
    expect(pets.filter((c) => c.checked).map((c) => c.value).sort()).toEqual(['BuildingCatsOK', 'BuildingYes']);
    expect(laundry.filter((c) => c.checked).map((c) => c.value)).toEqual(['CoinOperated']);
  });
  it('precise building_laundry applies even when the generic laundry flag is set (Codex #301)', () => {
    const laundry: Cb[] = [{ value: 'CoinOperated', checked: false }, { value: 'InBasement', checked: false }, { value: 'CommonArea', checked: false }];
    run({ laundry: true, building_laundry: ['CoinOperated', 'InBasement'] }, { saleBuildingLaundryFeatures: laundry });
    expect(laundry.filter((c) => c.checked).map((c) => c.value).sort()).toEqual(['CoinOperated', 'InBasement']);
    expect(laundry.find((c) => c.value === 'CommonArea')!.checked).toBe(false); // legacy precheck skipped when precise policy exists
  });
  it('legacy CommonArea fallback still fires when there is NO precise building_laundry', () => {
    const laundry: Cb[] = [{ value: 'CommonArea', checked: false }];
    run({ laundry: true, building_laundry: [] }, { saleBuildingLaundryFeatures: laundry });
    expect(laundry.find((c) => c.value === 'CommonArea')!.checked).toBe(true);
  });
  it('does NOT overwrite a manually-selected building policy', () => {
    const pets: Cb[] = [{ value: 'BuildingNo', checked: true }, { value: 'BuildingCatsOK', checked: false }];
    run({ building_pets: ['BuildingCatsOK', 'BuildingYes'] }, { saleBuildingPetsAllowed: pets });
    expect(pets.find((c) => c.value === 'BuildingNo')!.checked).toBe(true);
    expect(pets.find((c) => c.value === 'BuildingCatsOK')!.checked).toBe(false);
  });
});
