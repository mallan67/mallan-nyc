/// <reference types="jest" />
/**
 * SpecialListingConditions is a live Cotality Multi-Enum (34 members on the dated pull). Mallan does not
 * restrict it to one member, so the sale form must preserve cardinality end to end:
 *   control (multi-select) → payload (array) → validation (live-enum boundary tokenizes arrays)
 *   → persistence (PATCH features + raw) → reload (populate 'multi' branch restores every member).
 * Packet 2 contradiction-closure, 2026-09-06.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'node-html-parser';
import { liveEnumMembers, liveEnumViolations, enumValueTokens } from '@/lib/cotality/live-contract';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

const ROOT = join(__dirname, '../..');
const form = readFileSync(join(ROOT, 'public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const route = readFileSync(join(ROOT, 'app/api/crm/listings/[id]/route.ts'), 'utf8');
const members = liveEnumMembers('SpecialListingConditions') ?? [];

describe('SpecialListingConditions keeps its live Multi-Enum cardinality', () => {
  it('is a live Multi-Enum with more than one member', () => {
    expect(members.length).toBeGreaterThan(1);
  });

  it('control: the sale form renders a multi-select whose options are exactly the live members', () => {
    const sel = parse(form).querySelector('#saleSpecialListingConditions')!;
    expect(sel).not.toBeNull();
    expect(sel.getAttribute('multiple')).not.toBeUndefined();
    expect(sel.getAttribute('data-rls-field')).toBe('SpecialListingConditions');
    const values = sel.querySelectorAll('option').map((o) => o.getAttribute('value')).filter(Boolean);
    expect(new Set(values)).toEqual(new Set(members));
    expect(values.length).toBe(members.length);
  });

  it('payload: collect emits every checked option as an array (nothing selected → empty)', () => {
    expect(form).toMatch(/querySelectorAll\('#saleSpecialListingConditions option:checked'\)/);
    expect(form).toMatch(/data\.SpecialListingConditions = _slc\.length \? _slc : ''/);
    expect(form).not.toMatch(/data\.SpecialListingConditions = data\.saleSpecialListingConditions/);
  });

  it('validation: the live-enum boundary tokenizes an array and refuses a non-live member', () => {
    const [a, b] = members;
    expect(enumValueTokens('SpecialListingConditions', [a, b])).toEqual([a, b]);
    expect(liveEnumViolations({ SpecialListingConditions: [a, b] })).toEqual([]);
    expect(liveEnumViolations({ SpecialListingConditions: [a, 'NotALiveMember'] })).toEqual([
      { field: 'SpecialListingConditions', value: 'NotALiveMember' },
    ]);
  });

  it('persistence: the PATCH route carries the array into features through the contract persistenceMap (Domain 5, 2026-09-08)', () => {
    // PATCH no longer keeps a route-local features list: the contract routes every bucket for edit-save
    // exactly as it does for create-save.
    expect(route).toMatch(/const persistence = buildPersistenceRecord\(body\)/);
    expect(route).toMatch(/const updatedFeatures = \{ \.\.\.existingFeatures, \.\.\.persistence\.features \}/);
    expect(MALLAN_FORM_CONTRACT.persistenceMap.SpecialListingConditions).toEqual({ features: true, raw: true });
  });

  it('reload: SALE_FIELD_MAP marks the field multi and populate restores every stored member', () => {
    expect(form).toMatch(/\{ rls: 'SpecialListingConditions', form: 'saleSpecialListingConditions', type: 'multi', src: 'raw' \}/);
    expect(form).toMatch(/f\.type === 'multi'/);
    expect(form).toMatch(/Array\.isArray\(val\) \? val\.map\(String\) : String\(val\)\.split\(','\)/);
    expect(form).toMatch(/o\.selected = _members\.indexOf\(o\.value\) !== -1/);
  });
});
