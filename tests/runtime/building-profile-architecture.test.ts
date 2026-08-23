/// <reference types="jest" />
/**
 * Building architecture stabilization (2026-05-31). Classifies building-section
 * fields: Cotality auto-fill (A), Mallan Building Profile internal (B), unit
 * Cotality suggestions (C). Enforces:
 *  - internal/manual building-profile fields carry NO data-rls-field and are
 *    not labeled "RLS/RESO/IDX/Trestle" (phantom fields are not Cotality);
 *  - Management company / building staff / board contacts persist + reload;
 *  - a Cotality building lookup never overwrites manual profile policy/contacts;
 *  - real Cotality fields still auto-fill.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { field as cotalityField } from '@/lib/cotality/live-contract';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
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

// Internal Mallan Building Profile fields (bucket B) — must be data-rls-ignore.
const INTERNAL_IDS = [
  'saleBldgMgmtCompany', 'saleBldgMgmtPhone', 'saleBldgMgmtEmail', 'saleBldgMgmtAddress',
  'saleBldgSuperName', 'saleBldgSuperPhone', 'saleBldgSuperEmail',
  'saleBldgManagerName', 'saleBldgManagerPhone', 'saleBldgManagerEmail',
  'saleBldgBoardPresident', 'saleBldgBoardEmail',
  'saleBldgMaxFinancing', 'saleBldgMinDownPayment', 'saleBldgDTIRatio', 'saleBldgPostCloseLiquidity',
  'saleBldgBoardApproval', 'saleBldgBoardInterview',
];

describe('Cotality authority — building phantoms vs real', () => {
  it('BuildingLaundryFeatures / BuildingPetsAllowed / AttendanceType / BuildingHeating/Cooling are NOT in Cotality', () => {
    ['BuildingLaundryFeatures', 'BuildingPetsAllowed', 'AttendanceType', 'BuildingHeating', 'BuildingCooling']
      .forEach((f) => expect(hasField(f)).toBe(false));
  });
  it('DocumentsAvailable / LaundryFeatures / PetsAllowed (unit) ARE real Cotality', () => {
    ['DocumentsAvailable', 'LaundryFeatures', 'PetsAllowed'].forEach((f) => expect(hasField(f)).toBe(true));
  });
});

describe('Bucket-B internal fields carry NO data-rls-field', () => {
  INTERNAL_IDS.forEach((id) => {
    it(`${id} is internal (no data-rls-field)`, () => {
      const m = FORM.match(new RegExp(`id="${id}"[^>]*>`));
      expect(m).not.toBeNull();
      expect(m![0]).not.toMatch(/data-rls-field=/);
    });
  });
  it('phantom multi-groups are not data-rls-field', () => {
    expect(FORM).not.toMatch(/data-rls-field="BuildingLaundryFeatures"/);
    expect(FORM).not.toMatch(/data-rls-field="BuildingPetsAllowed"/);
    expect(FORM).not.toMatch(/data-rls-field="AttendanceType"/);
  });
});

describe('Labels — no false RLS/RESO/IDX on internal/manual fields', () => {
  it('phantom internal sections are relabeled "Mallan Building Profile"', () => {
    expect(FORM).not.toMatch(/RLS Field: AttendanceType/);
    expect(FORM).not.toMatch(/RLS: BuildingLaundryFeatures/);
    expect(FORM).not.toMatch(/RLS Field: BuildingPetsAllowed/);
    expect(FORM).not.toMatch(/RLS\/RESO\/IDX: BuildingHeating/);
    expect(FORM).not.toMatch(/RLS\/RESO\/IDX: BuildingCooling/);
    expect(FORM).toMatch(/Mallan Building Profile — internal building laundry policy/);
    expect(FORM).toMatch(/Mallan Building Profile — internal building pet policy/);
  });
  it('the lookup banner no longer overclaims RLS auto-populate', () => {
    expect(FORM).not.toMatch(/Building data from Trestle\/REBNY RLS will auto-populate/);
    expect(FORM).toMatch(/Cotality auto-fills available building facts; policy &amp; contact fields are your internal/);
  });
  it('DocumentsAvailable (real Cotality) keeps Cotality wording', () => {
    expect(FORM).toMatch(/Cotality: DocumentsAvailable \(multi-select\)/);
  });
});

describe('Persistence — Mallan Building Profile fields reload after save', () => {
  it('management / super / resident-manager / board contacts now have restore entries', () => {
    ['saleBldgMgmtCompany', 'saleBldgMgmtPhone', 'saleBldgMgmtEmail', 'saleBldgMgmtAddress',
     'saleBldgSuperName', 'saleBldgSuperPhone', 'saleBldgSuperEmail',
     'saleBldgManagerName', 'saleBldgManagerPhone', 'saleBldgManagerEmail',
     'saleBldgBoardPresident', 'saleBldgBoardEmail']
      .forEach((id) => expect(FORM).toMatch(new RegExp(`rls: '${id}', form: '${id}'`)));
  });
  it('purchase-policy fields keep their restore entries', () => {
    ['saleBldgMaxFinancing', 'saleBldgMinDownPayment', 'saleBldgDTIRatio', 'saleBldgPostCloseLiquidity']
      .forEach((id) => expect(FORM).toMatch(new RegExp(`form: '${id}'`)));
  });
});

describe('Building lookup fills SAVED Mallan profile fields only when blank', () => {
  // Updated 2026-05-31 (Part B). The building object returned by
  // /api/buildings/search now carries SAVED Mallan/REBNY building-profile values
  // merged across every listing that shares the building identity (contract keys
  // building_mgmt_company, building_super_name, …). populateBuildingFromIDX MUST
  // fill the internal profile/contact/policy form fields from those keys WHEN the
  // field is blank, and must NEVER overwrite a manually typed value. (Replaces the
  // prior negative assertion that the function never touched these fields.)
  it('populateBuildingFromIDX reads the contract building-profile keys', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    ['building_mgmt_company', 'building_mgmt_phone', 'building_mgmt_email', 'building_mgmt_address',
     'building_super_name', 'building_super_phone', 'building_super_email',
     'building_resident_manager_name', 'building_resident_manager_phone', 'building_resident_manager_email',
     'building_board_president', 'building_board_email',
     'building_max_financing', 'building_min_down', 'building_dti', 'building_post_close_liquidity',
     'building_board_approval', 'building_board_interview',
     'building_sublet_allowed', 'building_sublet_fee', 'building_sublet_max_years']
      .forEach((key) => expect(fn).toContain(key));
  });
  it('writes those values into the internal saleBldg* form fields', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    ['saleBldgMgmtCompany', 'saleBldgSuperName', 'saleBldgManagerName',
     'saleBldgBoardPresident', 'saleBldgBoardEmail', 'saleBldgMaxFinancing',
     'saleBldgMinDownPayment', 'saleBldgDTIRatio', 'saleBldgPostCloseLiquidity',
     'saleBldgBoardApproval', 'saleBldgBoardInterview', 'saleBldgSublettingAllowed']
      .forEach((id) => expect(fn).toContain(id));
  });

  // Behavioral proof: run the extracted function against a fake DOM with one
  // pre-typed field and the rest blank, then assert blank fields fill from the
  // building object and the manual value is preserved.
  it('fills blank profile fields and preserves a pre-typed value', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');

    // Minimal fake DOM: each element is { value, checked, tagName }.
    const els: Record<string, any> = {};
    const mk = (id: string, init: Partial<{ value: string; checked: boolean; tagName: string }> = {}) => {
      els[id] = { value: init.value ?? '', checked: init.checked ?? false, tagName: init.tagName ?? 'INPUT', options: [], children: [], dataset: {}, appendChild() {} };
    };
    // Profile fields under test.
    [
      'saleBldgMgmtCompany', 'saleBldgMgmtPhone', 'saleBldgMgmtEmail', 'saleBldgMgmtAddress',
      'saleBldgSuperName', 'saleBldgSuperPhone', 'saleBldgSuperEmail',
      'saleBldgManagerName', 'saleBldgManagerPhone', 'saleBldgManagerEmail',
      'saleBldgBoardPresident', 'saleBldgBoardEmail',
      'saleBldgMaxFinancing', 'saleBldgMinDownPayment', 'saleBldgDTIRatio', 'saleBldgPostCloseLiquidity',
      'saleBldgSubletFee', 'saleBldgMaxSubletYears',
    ].forEach((id) => mk(id));
    mk('saleBldgSublettingAllowed', { tagName: 'SELECT' });
    mk('saleBldgBoardApproval', { checked: false });
    mk('saleBldgBoardInterview', { checked: false });
    // The agent already typed a management company — this must be preserved.
    els['saleBldgMgmtCompany'].value = 'Agent Typed Mgmt LLC';

    const fakeDoc = {
      getElementById: (id: string) => els[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ dataset: {} }),
    };
    // Stub globals the function references so it runs without a browser.
    const runner = new Function(
      'document', 'window', '_syncSaleBuildingAddressFields', 'prefix', 'building',
      `${fn}\nreturn populateBuildingFromIDX(prefix, building);`,
    );
    const building = {
      building_mgmt_company: 'CONTRACT Mgmt Co',          // must NOT overwrite manual
      building_mgmt_phone: '(212) 555-0100',
      building_mgmt_email: 'info@contract.example',
      building_mgmt_address: '1 Park Ave, New York, NY',
      building_super_name: 'Super Sam',
      building_super_phone: '(212) 555-0111',
      building_super_email: 'sam@contract.example',
      building_resident_manager_name: 'RM Rita',
      building_resident_manager_phone: '(212) 555-0122',
      building_resident_manager_email: 'rita@contract.example',
      building_board_president: 'Pat President',
      building_board_email: 'board@contract.example',
      building_max_financing: '80%',
      building_min_down: '20%',
      building_dti: '25%',
      building_post_close_liquidity: '2 years maintenance',
      building_board_approval: true,
      building_board_interview: true,
      building_sublet_allowed: 'BoardApproval',
      building_sublet_fee: '$500/year',
      building_sublet_max_years: 2,
    };
    runner(fakeDoc, {}, () => {}, 'sale', building);

    // Manual value preserved (never overwritten by the contract value).
    expect(els['saleBldgMgmtCompany'].value).toBe('Agent Typed Mgmt LLC');
    // Blank fields filled from the contract building object.
    expect(els['saleBldgMgmtPhone'].value).toBe('(212) 555-0100');
    expect(els['saleBldgMgmtEmail'].value).toBe('info@contract.example');
    expect(els['saleBldgMgmtAddress'].value).toBe('1 Park Ave, New York, NY');
    expect(els['saleBldgSuperName'].value).toBe('Super Sam');
    expect(els['saleBldgManagerName'].value).toBe('RM Rita');
    expect(els['saleBldgBoardPresident'].value).toBe('Pat President');
    expect(els['saleBldgBoardEmail'].value).toBe('board@contract.example');
    expect(els['saleBldgMaxFinancing'].value).toBe('80%');
    expect(els['saleBldgMinDownPayment'].value).toBe('20%');
    expect(els['saleBldgDTIRatio'].value).toBe('25%');
    expect(els['saleBldgPostCloseLiquidity'].value).toBe('2 years maintenance');
    expect(els['saleBldgSublettingAllowed'].value).toBe('BoardApproval');
    expect(els['saleBldgSubletFee'].value).toBe('$500/year');
    expect(String(els['saleBldgMaxSubletYears'].value)).toBe('2');
    expect(els['saleBldgBoardApproval'].checked).toBe(true);
    expect(els['saleBldgBoardInterview'].checked).toBe(true);
  });

  it('leaves profile fields blank when the building object has no saved values', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    const els: Record<string, any> = {};
    ['saleBldgMgmtCompany', 'saleBldgSuperName', 'saleBldgBoardPresident', 'saleBldgMaxFinancing']
      .forEach((id) => { els[id] = { value: '', checked: false, tagName: 'INPUT', options: [], children: [], dataset: {}, appendChild() {} }; });
    els['saleBldgBoardApproval'] = { value: '', checked: false, tagName: 'INPUT', options: [], children: [], dataset: {}, appendChild() {} };
    const fakeDoc = {
      getElementById: (id: string) => els[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ dataset: {} }),
    };
    const runner = new Function(
      'document', 'window', '_syncSaleBuildingAddressFields', 'prefix', 'building',
      `${fn}\nreturn populateBuildingFromIDX(prefix, building);`,
    );
    runner(fakeDoc, {}, () => {}, 'sale', { building_key: 'NO-PROFILE-DATA' });
    expect(els['saleBldgMgmtCompany'].value).toBe('');
    expect(els['saleBldgSuperName'].value).toBe('');
    expect(els['saleBldgBoardPresident'].value).toBe('');
    expect(els['saleBldgMaxFinancing'].value).toBe('');
    expect(els['saleBldgBoardApproval'].checked).toBe(false);
  });

  it('real Cotality fields still auto-fill (regression)', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    expect(fn).toContain("prefix + 'BldgStreetAddress'");
    expect(fn).toContain("prefix + 'BldgAssociationName'");
    expect(fn).toContain("prefix + 'BldgDoorman'");
  });
});
