/// <reference types="jest" />
/**
 * The building has its own tax lot and the unit has its own (Maya, 2026-11-02). Live Cotality: Property.TaxLot is the UNIT's lot (a condo unit's is 1xxx: 1218, 1258,
 * 1223 ...) and the REBNY custom key BuildingTaxLot is the building's (7501, 7502 ...); they differ on 17 of 100 Active listings and are equal for most co-ops.
 * Before, the Building window's single box was sent as TaxLot, so a condo unit carried the building's lot.
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
  it('a condo sends the unit\'s lot as TaxLot and the building\'s as BuildingTaxLot', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setValue(f, 'saleUnitTaxLot', '1218');
      setValue(f, 'saleBldgTaxLot', '7502');
      const data = collect(f);
      expect(data.TaxLot).toBe('1218');
      expect(data.BuildingTaxLot).toBe('7502');
    } finally { f.close(); }
  });

  it('a co-op or a house with only the building\'s lot sends it as both (they are the same lot)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setValue(f, 'saleBldgTaxLot', '0014');
      const data = collect(f);
      expect(data.TaxLot).toBe('0014');
      expect(data.BuildingTaxLot).toBe('0014');
    } finally { f.close(); }
  });

  it('the unit\'s lot alone is sent as TaxLot, and no BuildingTaxLot is invented', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setValue(f, 'saleUnitTaxLot', '1218');
      const data = collect(f);
      expect(data.TaxLot).toBe('1218');
      expect(data.BuildingTaxLot).toBe('');
    } finally { f.close(); }
  });

  it('the required Tax Lot is answered by either box, and is named on the Unit tab', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      expect(missingLabels(f)).toContain('Tax Lot');
      const m = (f.w as any).collectSaleMissingRequired().find((x: any) => x.label === 'Tax Lot');
      expect(m.tabName).toBe('Unit Info');
      setValue(f, 'saleBldgTaxLot', '7502');                                  // the building's box answers it (a co-op)
      expect(missingLabels(f)).not.toContain('Tax Lot');
      setValue(f, 'saleBldgTaxLot', '');
      setValue(f, 'saleUnitTaxLot', '1218');                                  // so does the unit's
      expect(missingLabels(f)).not.toContain('Tax Lot');
    } finally { f.close(); }
  });

  it('the Unit tab box claims Property.TaxLot and the Building window box claims BuildingTaxLot', () => {
    const html = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    expect(html).toMatch(/id="saleUnitTaxLot"[^>]*data-concept="TaxLot"/);
    expect(html).toMatch(/id="saleBldgTaxLot"[^>]*data-concept="BuildingTaxLot"/);
  });

  it('a listing saved before the split (one lot under TaxLot) still opens, and the building lookup fills the building\'s lot from BuildingTaxLot', () => {
    const html = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    const mod = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8');
    for (const src of [html, mod]) {
      expect(src).toMatch(/rls: 'TaxLot', form: 'saleUnitTaxLot'/);
      expect(src).toMatch(/rls: 'BuildingTaxLot', form: 'saleBldgTaxLot'[^}]*fallbackRls: 'TaxLot'/);
    }
    expect(html).toContain("setIfPresent(prefix + 'BldgTaxLot', pick('building_tax_lot', 'buildingTaxLot'))");
  });
});
