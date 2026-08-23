/// <reference types="jest" />
/**
 * Track 1 — building auto-fill for the real-Cotality parking / laundry /
 * documents / pets fields. Authority: live $metadata (artifacts/metadata.xml).
 *
 * Added (all verified in live metadata): GarageYN, AttachedGarageYN,
 * GarageSpaces, OpenParkingSpaces, CoveredSpaces, ParkingFeatures,
 * LaundryFeatures, DocumentsAvailable, PetsAllowed, PetsAllowedYN.
 *
 * Explicitly NOT auto-filled (phantom — absent from live metadata): board
 * approval/interview, max financing / min down / DTI / liquidity, sublet,
 * total shares, underlying mortgage, capital reserves, flip tax, tax abatement,
 * BuildingPetsAllowed, BuildingLaundryFeatures, RentingAllowedYN,
 * MaximumFinancingPercent.
 *
 * Override-safe: every auto-fill is only-when-empty / suggestion-only and the
 * targets stay editable, so the agent can always override (incl. if Cotality
 * rules change). PetsAllowed is unit-level → suggestion only.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { field as cotalityField } from '@/lib/cotality/verified-contract';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');
const hasField = (f: string) => cotalityField('Property', f) !== null;

function extractFn(src: string, name: string): string {
  const sig = `function ${name}(`;
  let start = src.indexOf(sig);
  if (start === -1) throw new Error(`not found: ${name}`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const b = src.indexOf('{', start);
  let d = 0;
  for (let i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced: ${name}`);
}

const ADDED = ['GarageYN', 'AttachedGarageYN', 'GarageSpaces', 'OpenParkingSpaces',
  'CoveredSpaces', 'ParkingFeatures', 'LaundryFeatures', 'DocumentsAvailable',
  'PetsAllowed', 'PetsAllowedYN'];
const PHANTOM = ['MaximumFinancingPercent', 'RentingAllowedYN', 'AssociationApprovalRequiredYN',
  'BoardApprovalYN', 'BuyerApprovalRequiredYN', 'NumberOfShares', 'FlipTaxYN',
  'SubleaseYN', 'FinancingAllowedYN', 'BuildingPetsAllowed', 'BuildingLaundryFeatures'];

describe('Cotality authority (no guessing)', () => {
  it('every added field is a real live-$metadata field', () => {
    ADDED.forEach((f) => expect(hasField(f)).toBe(true));
  });
  it('every phantom field is absent from live $metadata (so it is not auto-filled)', () => {
    PHANTOM.forEach((f) => expect(hasField(f)).toBe(false));
  });
});

describe('buildings/search — real fields surfaced, phantoms excluded', () => {
  it('OData $select includes the added real fields', () => {
    ['GarageYN', 'AttachedGarageYN', 'GarageSpaces', 'OpenParkingSpaces',
     'CoveredSpaces', 'ParkingFeatures', 'LaundryFeatures', 'DocumentsAvailable',
     'PetsAllowedYN'].forEach((f) => expect(ROUTE).toMatch(new RegExp(`'${f}'`)));
  });
  it('buildingExtras maps the real fields and the spread is applied on all paths', () => {
    const fn = extractFn(ROUTE, 'buildingExtras');
    expect(fn).toMatch(/garage_yn:\s*r\.GarageYN === true/);
    expect(fn).toMatch(/open_parking_spaces:\s*num\(r\.OpenParkingSpaces\)/);
    expect(fn).toMatch(/laundry_features:\s*String\(r\.LaundryFeatures/);
    expect(fn).toMatch(/documents_available:\s*String\(r\.DocumentsAvailable/);
    expect(fn).toMatch(/pets_allowed:\s*String\(r\.PetsAllowed/);
    expect(fn).toMatch(/pets_allowed_yn:[^,]*PetsAllowedYN === true[^,]*PetsAllowedYN === false[^,]*null/);
    // applied on DB paths (feat) AND the Cotality path (r)
    expect((ROUTE.match(/\.\.\.buildingExtras\(feat\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(ROUTE).toMatch(/\.\.\.buildingExtras\(r\)/);
  });
  it('does NOT add phantom co-op/condo policy fields to $select or buildingExtras', () => {
    const fn = extractFn(ROUTE, 'buildingExtras');
    PHANTOM.forEach((f) => {
      expect(ROUTE).not.toMatch(new RegExp(`'${f}'`)); // not in $select array
      expect(fn).not.toContain(f);                     // not mapped
    });
  });

  it('backfills Cotality-only extras into a cached DB building instead of dropping them (Codex #297)', () => {
    // For a DB-cached building, the Cotality supplement loop dedups the address
    // (now via findRegisteredBuilding); it must merge the live extras
    // (CoveredSpaces/PetsAllowedYN/etc.) into the existing result rather than
    // continue-skipping.
    expect(ROUTE).toMatch(/if \(existing\) \{\s*mergeMissingExtras\(existing, buildingExtras\(r\)\)/);
    const merge = extractFn(ROUTE, 'mergeMissingExtras');
    // only fills empty targets with a meaningful value (never overwrites DB data)
    expect(merge).toMatch(/curEmpty\s*&&\s*vMeaningful/);
    expect(merge).toMatch(/cur === null \|\| cur === undefined \|\| cur === '' \|\| cur === false/);
  });
});

describe('populateBuildingFromIDX — behavioral (parking / laundry / docs / pets)', () => {
  type Cb = { value: string; checked: boolean };
  type El = { value?: string | number; checked?: boolean };
  function run(building: Record<string, unknown>, els: Record<string, El>, groups: Record<string, Cb[]>) {
    const document = {
      getElementById: (id: string) => els[id] || null,
      querySelectorAll: (sel: string) => {
        const m = sel.match(/name="([^"]+)"/);
        return (m && groups[m[1]]) ? groups[m[1]] : [];
      },
      createElement: () => ({ value: '', text: '', dataset: {} as Record<string, string> }),
    };
    const src = extractFn(FORM, 'populateBuildingFromIDX');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const runner = new Function('document', '_syncSaleBuildingAddressFields', `${src}; return populateBuildingFromIDX;`);
    runner(document, () => {})('sale', building);
  }

  it('fills parking spaces from OpenParkingSpaces when empty; checks parking on GarageYN', () => {
    const els = { saleBldgParkingSpaces: { value: '' }, saleBldgParking: { checked: false }, saleBldgWasherDryerAllowed: { checked: false } };
    run({ open_parking_spaces: 12, garage_yn: true, laundry_features: 'InUnit' }, els, {});
    expect(els.saleBldgParkingSpaces.value).toBe(12);
    expect(els.saleBldgParking.checked).toBe(true);
    expect(els.saleBldgWasherDryerAllowed.checked).toBe(true); // from LaundryFeatures
  });

  it('does NOT clobber an agent-entered parking spaces value', () => {
    const els = { saleBldgParkingSpaces: { value: '5' } };
    run({ open_parking_spaces: 12 }, els, {});
    expect(els.saleBldgParkingSpaces.value).toBe('5');
  });

  it('suggests Documents Available + Pets (unit) when the group is empty', () => {
    const docs: Cb[] = [{ value: 'OfferingPlan', checked: false }, { value: 'ScheduleA', checked: false }, { value: 'BuildingRules', checked: false }];
    const pets: Cb[] = [{ value: 'UnitCatsOK', checked: false }, { value: 'UnitDogsOK', checked: false }, { value: 'UnitNo', checked: false }];
    // Real live-metadata casing is CatsOk/DogsOk (lowercase k); the explicit map
    // must normalize to the form's UnitCatsOK/UnitDogsOK (Codex #297).
    run({ documents_available: 'OfferingPlan,ScheduleA', pets_allowed: 'CatsOk,DogsOk' }, {}, { saleBldgDocsAvailable: docs, salePetsAllowed: pets });
    expect(docs.filter((c) => c.checked).map((c) => c.value).sort()).toEqual(['OfferingPlan', 'ScheduleA']);
    expect(pets.filter((c) => c.checked).map((c) => c.value).sort()).toEqual(['UnitCatsOK', 'UnitDogsOK']);
  });

  it('ignores Cotality pet members the form has no checkbox for (BirdsOk, Building*)', () => {
    const pets: Cb[] = [{ value: 'UnitCatsOK', checked: false }, { value: 'UnitNo', checked: false }];
    run({ pets_allowed: 'BirdsOk,BuildingCatsOk,FishOk' }, {}, { salePetsAllowed: pets });
    expect(pets.some((c) => c.checked)).toBe(false); // none map to a form value
  });

  it('does NOT override an agent-selected pet policy (suggestion-only, override-safe)', () => {
    const pets: Cb[] = [{ value: 'UnitCatsOK', checked: false }, { value: 'UnitNo', checked: true }];
    run({ pets_allowed: 'CatsOk,DogsOk' }, {}, { salePetsAllowed: pets });
    expect(pets.find((c) => c.value === 'UnitNo')!.checked).toBe(true);
    expect(pets.find((c) => c.value === 'UnitCatsOK')!.checked).toBe(false); // not overridden
  });

  it('missing PetsAllowedYN (null) suggests nothing — no false "No" (override-safe)', () => {
    const pets: Cb[] = [{ value: 'UnitYes', checked: false }, { value: 'UnitNo', checked: false }];
    run({ pets_allowed: '', pets_allowed_yn: null }, {}, { salePetsAllowed: pets });
    expect(pets.some((c) => c.checked)).toBe(false);
  });

  it('Cotality "None" is filtered — does NOT check washer/dryer or select docs (Codex #297)', () => {
    const els = { saleBldgWasherDryerAllowed: { checked: false } };
    const docs: Cb[] = [{ value: 'OfferingPlan', checked: false }];
    run({ laundry_features: 'None', documents_available: 'None' }, els, { saleBldgDocsAvailable: docs });
    expect(els.saleBldgWasherDryerAllowed.checked).toBe(false); // "None" is not a real laundry feature
    expect(docs.some((c) => c.checked)).toBe(false);             // "None" selects nothing
  });

  it('a multi with a real member alongside "None" still applies the real member', () => {
    const els = { saleBldgWasherDryerAllowed: { checked: false } };
    run({ laundry_features: 'None,InUnit' }, els, {});
    expect(els.saleBldgWasherDryerAllowed.checked).toBe(true);
  });

  it('"BuildingNone" laundry (no-laundry sentinel) does NOT check washer/dryer (Codex #297)', () => {
    const els = { saleBldgWasherDryerAllowed: { checked: false } };
    run({ laundry_features: 'BuildingNone' }, els, {});
    expect(els.saleBldgWasherDryerAllowed.checked).toBe(false);
  });

  it('shared/common laundry (CommonArea/CoinOperated/InBasement) does NOT imply W/D Allowed (Codex #297)', () => {
    const els = { saleBldgWasherDryerAllowed: { checked: false } };
    run({ laundry_features: 'CommonArea,CoinOperated,InBasement' }, els, {});
    expect(els.saleBldgWasherDryerAllowed.checked).toBe(false); // building laundry ≠ in-unit W/D permission
  });

  it('only true in-unit W/D members (InUnit/WasherHookup/WasherDryerInstallAllowed/Stacked) check W/D Allowed', () => {
    ['InUnit', 'WasherHookup', 'WasherDryerInstallAllowed', 'Stacked', 'GasDryerHookup'].forEach((m) => {
      const els = { saleBldgWasherDryerAllowed: { checked: false } };
      run({ laundry_features: m }, els, {});
      expect(els.saleBldgWasherDryerAllowed.checked).toBe(true);
    });
  });
});

// Updated 2026-05-31 (Part A/B). The building-search route now re-surfaces SAVED
// Mallan/REBNY building-profile values (board / financing / sublet) merged across
// every listing of the building identity. populateBuildingFromIDX fills those
// fields ONLY-WHEN-BLANK from the building object — a value the agent typed once
// on a prior unit, never a value invented from Cotality. Fields that have NO
// saved-profile source (total shares / underlying mortgage / capital reserves)
// remain untouched — there is nothing to surface, so they must never be written.
describe('co-op/condo policy fields fill ONLY from the saved profile (never invented)', () => {
  it('populateBuildingFromIDX fills the SOURCED board / financing / sublet fields only-when-blank', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    // These have a saved-profile source on the building object, so the function
    // now references them (filled blank-only via setBldgProfileIfBlank /
    // checkBldgProfileIfUnset — manual entry always wins).
    ['saleBldgBoardApproval', 'saleBldgBoardInterview', 'saleBldgMaxFinancing',
     'saleBldgMinDownPayment', 'saleBldgDTIRatio', 'saleBldgPostCloseLiquidity',
     'saleBldgMaxSubletYears', 'saleBldgSubletFee'].forEach((id) =>
      expect(fn).toContain(id));
  });

  it('the fill is guarded so a manually typed/checked value is never overwritten', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    // blank-only guard for text/select inputs …
    expect(fn).toContain('setBldgProfileIfBlank');
    expect(fn).toContain("if ((el.value || '').trim() !== '') return; // manual entry wins");
    // … and the unchecked-only guard for checkboxes.
    expect(fn).toContain('checkBldgProfileIfUnset');
    expect(fn).toContain('if (el.checked) return; // manual check wins — never clear it');
  });

  it('fields with NO saved-profile source are NEVER populated (no invention)', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    // total shares / underlying mortgage / capital reserves have no Cotality
    // member AND no contract key — there is nothing to surface, so the function
    // must not touch them.
    ['BldgTotalShares', 'BldgUnderlyingMortgage', 'BldgCapitalReserves'].forEach((id) =>
      expect(fn).not.toContain(id));
  });
});
