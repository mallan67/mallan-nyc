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

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
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

describe('Cotality lookup does NOT overwrite manual building profile', () => {
  it('populateBuildingFromIDX never sets management/staff/board/financing/policy fields', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    ['BldgMgmtCompany', 'BldgMgmtPhone', 'BldgMgmtEmail', 'BldgSuperName', 'BldgManagerName',
     'BldgBoardPresident', 'BldgBoardEmail', 'BldgMaxFinancing', 'BldgMinDownPayment',
     'BldgDTIRatio', 'BldgPostCloseLiquidity', 'BldgBoardApproval', 'BldgBoardInterview']
      .forEach((frag) => expect(fn).not.toContain(frag));
  });
  it('real Cotality fields still auto-fill (regression)', () => {
    const fn = extractFn(FORM, 'populateBuildingFromIDX');
    expect(fn).toContain("prefix + 'BldgStreetAddress'");
    expect(fn).toContain("prefix + 'BldgAssociationName'");
    expect(fn).toContain('buildingExtras' === 'buildingExtras' ? "prefix + 'BldgDoorman'" : '');
  });
});
