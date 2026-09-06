/// <reference types="jest" />
/**
 * Form-control binding coverage on the ONE resolver (Packet 2 convergence round).
 *
 * The retired scripts/test-rls-bindings.js carried its own CSV-derived field universe, its own
 * RESO→RLS rename table and its own resolver, and asserted `saleStatus → MlsStatus`. Its useful
 * behavioural coverage lives here, exercised against the canonical resolver exported by
 * scripts/validate-rls-compliance.js (which consumes lib/cotality/live-contract.ts, REBNY_UCBA_RULES,
 * lib/listings/mallan-form-contract.ts and lib/compliance/legacy-form-keys.ts).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'node-html-parser';

const ROOT = join(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reporter = require(join(ROOT, 'scripts/validate-rls-compliance.js')) as {
  resolveElement: (el: unknown) => { field?: string; internal?: boolean; unknown?: boolean; layer: number };
  isCanonical: (n: string) => boolean;
  RAW_ALIASES: Record<string, string>;
  INTERNAL_ONLY_IDS: Set<string>;
  PHANTOMS: Set<string>;
  FILE_CONFIG: Record<string, { path: string; category: string }>;
};
const { LIVE_PROPERTY_FIELDS } = require('@/lib/cotality/live-contract') as { LIVE_PROPERTY_FIELDS: Set<string> };
const { MALLAN_INTERNAL_KEYS, MALLAN_FORM_CONTRACT } = require('@/lib/listings/mallan-form-contract') as { MALLAN_INTERNAL_KEYS: string[]; MALLAN_FORM_CONTRACT: { aliasToCanonical: Record<string, string> } };

const el = (html: string) => parse(html).querySelector('input, select, textarea')!;
const resolve = (html: string) => reporter.resolveElement(el(html));

describe('the retired CSV resolver is gone; the reporter is the one resolver', () => {
  it('scripts/test-rls-bindings.js no longer exists and no script carries a RESO→RLS rename table', () => {
    expect(existsSync(join(ROOT, 'scripts/test-rls-bindings.js'))).toBe(false);
    for (const f of ['scripts/validate-rls-compliance.js', 'scripts/idx-validate.js']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src).not.toMatch(/const RESO_TO_RLS_RENAMES|readFile\(['"]data\/rebny-rls-property|rebny-rls-property-(fields|lookup)\.csv['"]\)/);
    }
  });
});

describe('form-control resolution on the canonical universe', () => {
  it.each([
    ['<input id="saleBorough">', 'CityRegion'],
    ['<input id="saleMaintCC">', 'AssociationFee'],
    ['<input id="rentalBedrooms">', 'BedroomsTotal'],
    ['<textarea id="rentalDescription"></textarea>', 'PublicRemarks'],
    ['<input id="saleOriginalPrice">', 'OriginalListPrice'],
    ['<input id="saleSoldPrice">', 'ClosePrice'],
    ['<input id="rentalAvailableDate">', 'AvailabilityDate'],
  ])('%s resolves to the canonical field %s', (html, field) => {
    const r = resolve(html);
    expect(r.field).toBe(field);
    expect(reporter.isCanonical(field)).toBe(true);
  });

  it('a building-profile control with no canonical Building* field is a Mallan fact — never resolved onto the unit-level live field', () => {
    // the retired resolver mapped saleBldgHeating → BuildingHeating from the REBNY CSV; BuildingHeating is not on the
    // live contract and not a declared Mallan-internal key, so the control is Mallan-internal (it must not become Heating)
    expect(reporter.isCanonical('BuildingHeating')).toBe(false);
    const r = resolve('<input id="saleBldgHeating">');
    expect(r.internal).toBe(true);
    expect(r.field).toBeUndefined();
    expect(resolve('<input id="bldgHeating">').internal).toBe(true);
    expect(resolve('<input id="saleBldgTaxLot">').field).toBe('BuildingTaxLot'); // a declared Mallan-internal key resolves
  });

  it('a Mallan status control is a Mallan control — never MlsStatus (Mallan workflow and provider status are separate domains)', () => {
    const r = resolve('<select id="saleStatus" data-rls-ignore="true" data-mallan-field="_crmWorkflowStatus"></select>');
    expect(r.internal).toBe(true);
    expect(r.field).toBeUndefined();
    expect(MALLAN_FORM_CONTRACT.aliasToCanonical.status).toBe('_mallanStatus');
    expect(Object.values(MALLAN_FORM_CONTRACT.aliasToCanonical)).not.toContain('MlsStatus');
  });

  it.each(['saleCalcTerm', 'perPageSelect', 'agentLoginSelect', 'saleShowRequiredOnly', 'saleBuildingSearch', 'saleCommissionType', 'commSaleRlsId'])('%s is Mallan UI (internal)', (id) => {
    expect(resolve(`<input id="${id}">`).internal).toBe(true);
  });

  it.each(['completelyFakeField', 'xyzNotARealField123'])('%s is UNKNOWN (hard error in the reporter)', (id) => {
    expect(resolve(`<input id="${id}">`).unknown).toBe(true);
  });

  it('attribute precedence: data-rls-field binds, data-rls-ignore / data-mallan-field classify as Mallan', () => {
    expect(resolve('<select data-rls-field="StandardStatus" id="saleCalcTerm"></select>').field).toBe('StandardStatus');
    expect(resolve('<input data-rls-ignore="true" id="saleBorough">').internal).toBe(true);
    expect(resolve('<input data-mallan-field="PropertyType" name="salePropertyType" type="radio">').internal).toBe(true);
  });

  it('the canonical universe is the live contract plus the declared Mallan-internal keys; phantoms are outside it', () => {
    expect(reporter.isCanonical('InternetEntireListingDisplayYN')).toBe(true);
    expect(reporter.isCanonical('FlipTaxType')).toBe(true);
    for (const p of reporter.PHANTOMS) expect(reporter.isCanonical(p)).toBe(false);
    for (const k of MALLAN_INTERNAL_KEYS) expect(reporter.isCanonical(k)).toBe(true);
    expect(LIVE_PROPERTY_FIELDS.size).toBeGreaterThan(700);
  });
});

describe('Mallan UI configuration stays configuration', () => {
  it('rls-field-aliases.json has 200+ entries and no phantom target', () => {
    const entries = Object.entries(reporter.RAW_ALIASES);
    expect(entries.length).toBeGreaterThanOrEqual(200);
    for (const [, target] of entries) expect(reporter.PHANTOMS.has(target)).toBe(false);
  });
  it('rls-internal-only.json has 400+ UI-control ids', () => {
    expect(reporter.INTERNAL_ONLY_IDS.size).toBeGreaterThanOrEqual(400);
  });
  it('viewer surfaces are viewers; submission surfaces are not', () => {
    const cats = Object.fromEntries(Object.values(reporter.FILE_CONFIG).map((c) => [c.path.split(/[\\/]/).pop(), c.category]));
    expect(cats['SALE-FORM-WITH-TOOLS.html']).toBe('viewer');
    expect(cats['RENTAL-FORM-WITH-TOOLS.html']).toBe('viewer');
    expect(cats['SALE-FORM-REDESIGN.html']).toBe('submission');
    expect(cats['RENTAL-FORM-REDESIGN.html']).toBe('submission');
    for (const v of ['SALE-FORM-WITH-TOOLS.html', 'RENTAL-FORM-WITH-TOOLS.html']) {
      expect(readFileSync(join(ROOT, 'public/crm', v), 'utf8')).toContain('data-rls-viewer="true"');
    }
  });
  it('both submission forms carry bound controls at the expected scale', () => {
    const sale = readFileSync(join(ROOT, 'public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    const rental = readFileSync(join(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');
    expect((sale.match(/data-rls-field="/g) || []).length).toBeGreaterThanOrEqual(150);
    expect((rental.match(/data-rls-field="/g) || []).length).toBeGreaterThanOrEqual(200);
  });
});
