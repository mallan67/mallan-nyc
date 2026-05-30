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

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../../app/api/buildings/search/route.ts'), 'utf8');
const META = readFileSync(resolve(__dirname, '../../artifacts/metadata.xml'), 'utf8');
const hasField = (f: string) => new RegExp(`Property Name="${f}"`).test(META);

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
    run({ documents_available: 'OfferingPlan,ScheduleA', pets_allowed: 'CatsOK,DogsOK' }, {}, { saleBldgDocsAvailable: docs, salePetsAllowed: pets });
    expect(docs.filter((c) => c.checked).map((c) => c.value).sort()).toEqual(['OfferingPlan', 'ScheduleA']);
    expect(pets.filter((c) => c.checked).map((c) => c.value).sort()).toEqual(['UnitCatsOK', 'UnitDogsOK']);
  });

  it('does NOT override an agent-selected pet policy (suggestion-only, override-safe)', () => {
    const pets: Cb[] = [{ value: 'UnitCatsOK', checked: false }, { value: 'UnitNo', checked: true }];
    run({ pets_allowed: 'CatsOK,DogsOK' }, {}, { salePetsAllowed: pets });
    expect(pets.find((c) => c.value === 'UnitNo')!.checked).toBe(true);
    expect(pets.find((c) => c.value === 'UnitCatsOK')!.checked).toBe(false); // not overridden
  });

  it('missing PetsAllowedYN (null) suggests nothing — no false "No" (override-safe)', () => {
    const pets: Cb[] = [{ value: 'UnitYes', checked: false }, { value: 'UnitNo', checked: false }];
    run({ pets_allowed: '', pets_allowed_yn: null }, {}, { salePetsAllowed: pets });
    expect(pets.some((c) => c.checked)).toBe(false);
  });
});

describe('phantom co-op/condo policy fields are NOT auto-filled in the form', () => {
  it('populateBuildingFromIDX does not populate board / financing / sublet / shares / flip-tax fields', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    ['BldgBoardApproval', 'BldgBoardInterview', 'BldgMaxFinancing', 'BldgMinDownPayment',
     'BldgDTIRatio', 'BldgPostCloseLiquidity', 'BldgMaxSubletYears', 'BldgSubletFee',
     'BldgTotalShares', 'BldgUnderlyingMortgage', 'BldgCapitalReserves'].forEach((id) =>
      expect(fn).not.toContain(id));
  });
});
