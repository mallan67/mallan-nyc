/// <reference types="jest" />
/**
 * The building has its own tax lot and the unit has its own (Maya, 2026-11-02). Live Cotality: Property.TaxLot is the UNIT's lot (a condo unit\'s is 1xxx: 1218, 1258,
 * 1223 ...) and the REBNY custom key BuildingTaxLot is the building\'s (7501, 7502 ...); they differ on 17 of 100 Active listings and are equal for most co-ops.
 * Before, the Building window's single box was sent as TaxLot, so a condo unit carried the building\'s lot.
 */
import { bootAddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const collect = (f: BootedForm): any => (f.w as any).collectSaleFormData();
const setValue = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};
const missingLabels = (f: BootedForm): string[] => (f.w as any).collectSaleMissingRequired().map((m: any) => m.label);

describe('the unit\'s tax lot and the building\'s tax lot', () => {
  const type = (f: BootedForm, value: string) => {
    const el = f.d.querySelector(`input[name="salePropertyType"][value="${value}"]`) as HTMLInputElement;
    el.checked = true; el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  };

  it('a condo sends the unit\'s lot as TaxLot and the building\'s as BuildingTaxLot', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      type(f, 'Condo');
      setValue(f, 'saleUnitTaxLot', '1218');
      setValue(f, 'saleBldgTaxLot', '7502');
      const data = collect(f);
      expect(data.TaxLot).toBe('1218');
      expect(data.BuildingTaxLot).toBe('7502');
    } finally { f.close(); }
  });

  it('a condo\'s building lot is NEVER sent as its TaxLot (a filled building lot cannot stand in for a missing unit lot)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      type(f, 'Condo');
      setValue(f, 'saleBldgTaxLot', '7502');
      const data = collect(f);
      expect(data.TaxLot).toBe('');
      expect(data.BuildingTaxLot).toBe('7502');
    } finally { f.close(); }
  });

  it('a co-op or a house with only the building\'s lot sends it as both (they are the same lot)', async () => {
    for (const t of ['Coop', 'SingleFamilyTownhouse']) {
      const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
      try {
        type(f, t);
        setValue(f, 'saleBldgTaxLot', '0014');
        const data = collect(f);
        expect(data.TaxLot).toBe('0014');
        expect(data.BuildingTaxLot).toBe('0014');
      } finally { f.close(); }
    }
  });

  it('the unit\'s lot alone is sent as TaxLot, and no BuildingTaxLot is invented', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      type(f, 'Condo');
      setValue(f, 'saleUnitTaxLot', '1218');
      const data = collect(f);
      expect(data.TaxLot).toBe('1218');
      expect(data.BuildingTaxLot).toBe('');
    } finally { f.close(); }
  });

  it('a CONDO must have its own unit lot: the building\'s lot does not answer for it; a CO-OP may use either box', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      type(f, 'Condo');
      expect(missingLabels(f)).toContain('Tax Lot (unit)');
      expect(missingLabels(f)).not.toContain('Tax Lot');
      const m = (f.w as any).collectSaleMissingRequired().find((x: any) => x.label === 'Tax Lot (unit)');
      expect(m.tabName).toBe('Unit Info');
      setValue(f, 'saleBldgTaxLot', '7502');                                  // the building\'s lot only
      expect(missingLabels(f)).toContain('Tax Lot (unit)');                   // still missing
      setValue(f, 'saleUnitTaxLot', '1218');
      expect(missingLabels(f)).not.toContain('Tax Lot (unit)');

      type(f, 'Coop');
      setValue(f, 'saleUnitTaxLot', '');
      expect(missingLabels(f)).not.toContain('Tax Lot (unit)');               // a co-op: the building\'s lot answers it
      setValue(f, 'saleBldgTaxLot', '');
      expect(missingLabels(f)).toContain('Tax Lot');
      setValue(f, 'saleUnitTaxLot', '1002');
      expect(missingLabels(f)).not.toContain('Tax Lot');
    } finally { f.close(); }
  });

  it('the Unit tab box claims Property.TaxLot and the Building window box claims BuildingTaxLot', () => {
    const html = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    expect(html).toMatch(/id="saleUnitTaxLot"[^>]*data-concept="TaxLot"/);
    expect(html).toMatch(/id="saleBldgTaxLot"[^>]*data-concept="BuildingTaxLot"/);
  });

  it('a listing saved before the split still opens, but its one lot never becomes the unit\'s, and the unit\'s lot never becomes the building\'s (compliance review)', () => {
    const html = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    const mod = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8');
    for (const src of [html, mod]) {
      expect(src).toMatch(/rls: 'TaxLot', form: 'saleUnitTaxLot'/);
      expect(src).toMatch(/rls: 'BuildingTaxLot', form: 'saleBldgTaxLot', type: 'text', src: 'raw' \}/);   // no fallback to TaxLot
      expect(src).not.toMatch(/rls: 'BuildingTaxLot', form: 'saleBldgTaxLot'[^}]*fallbackRls/);
    }
    // The building's lot is the custom key BuildingTaxLot. A record's TaxLot is one UNIT's lot, so it answers for the building ONLY for a building the lookup calls a co-op (a co-op has one lot, the
    // building's: Maya, 2026-11-05, "tax lot for coop should be automatic") on a form that is not already a condo, and never when it is "0", "0000" or "NA". Behaviour: crm-sale-not-required.test.ts.
    expect(html).toContain("var _bldgLot = pick('building_tax_lot', 'buildingTaxLot');");
    expect(html).toContain("setIfPresent(prefix + 'BldgTaxLot', _bldgLot);");
    expect(html).toMatch(/_bldgLot === null && prefix === 'sale' && typeof saleHasOwnUnitLot === 'function' && !saleHasOwnUnitLot\(\)\s*&& \(\/\^\(StockCooperative\|Cooperative\|Coop\)\$\/i\.test/);
    // behaviour is proven by crm-sale-roundtrip.test.ts ("Tax Lot restore never moves one lot into the other box")
  });
});
