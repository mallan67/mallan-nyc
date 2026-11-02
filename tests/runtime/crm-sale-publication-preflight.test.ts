/// <reference types="jest" />
/**
 * Sale publication preflight: the actual HTML form must not report "complete"
 * while its canonical submission omits required Cotality/REBNY values.
 * Checks are in-memory form behavior, not a substitute for a real DB round trip.
 */
import { bootAddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */
const missing = (f: BootedForm): string[] =>
  (f.w as any).collectSaleMissingRequired().map((m: { label: string }) => m.label);
const collect = (f: BootedForm): Record<string, any> => (f.w as any).collectSaleFormData();
const setVal = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  if (!el) throw new Error('Missing control ' + id);
  el.value = value;
  el.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};
const setType = (f: BootedForm, type: string) => {
  const el = f.d.querySelector(`input[name="salePropertyType"][value="${type}"]`) as HTMLInputElement;
  if (!el) throw new Error('Missing type ' + type);
  el.checked = true;
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};

describe('Sale form truthful preflight before public activation', () => {
  it('does not claim a condominium unit has a TaxLot from BuildingTaxLot', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setType(f, 'Condo');
      setVal(f, 'saleBldgTaxLot', '7501');
      expect(collect(f).BuildingTaxLot).toBe('7501');
      expect(collect(f).TaxLot).toBe('');
      expect(missing(f)).toContain('Tax Lot');
      setVal(f, 'saleUnitTaxLot', '1025');
      expect(collect(f).TaxLot).toBe('1025');
      expect(missing(f)).not.toContain('Tax Lot');
    } finally { f.close(); }
  });

  it('continues the existing building-lot fallback for a co-op', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setType(f, 'Coop');
      setVal(f, 'saleBldgTaxLot', '14');
      expect(collect(f).TaxLot).toBe('14');
      expect(collect(f).BuildingTaxLot).toBe('14');
      expect(missing(f)).not.toContain('Tax Lot');
    } finally { f.close(); }
  });

  it('requires an explicit garage answer and submits false plus zero for No on a unit', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setType(f, 'Condo');
      const options = f.d.querySelectorAll('input[name="saleGarageSpaces"]');
      expect(Array.from(options).every(o => !(o as HTMLInputElement).checked)).toBe(true);
      expect(missing(f)).toContain('Garage Spaces Assigned');
      const no = f.d.querySelector('input[name="saleGarageSpaces"][value="No"]') as HTMLInputElement;
      no.checked = true;
      no.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect(collect(f).GarageYN).toBe(false);
      expect(collect(f).GarageSpaces).toBe(0);
      expect(missing(f)).not.toContain('Garage Spaces Assigned');
    } finally { f.close(); }
  });

  it('requires the townhouse garage answer from the townhouse field rather than the unit radio', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setType(f, 'SingleFamilyTownhouse');
      expect(missing(f)).toContain('Garage Yes/No');
      expect(missing(f)).not.toContain('Garage Spaces Assigned');
      setVal(f, 'saleTHGarageYN', 'No');
      expect(missing(f)).not.toContain('Garage Yes/No');
      expect(collect(f).GarageYN).toBe(false);
    } finally { f.close(); }
  });

  it('requires the verified listing agent MLS ID rather than a display-only agent label', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setVal(f, 'saleUpdatingAgent', 'person-1');
      setVal(f, 'saleUpdatingAgentMlsId', '');
      expect(missing(f)).toContain('Updating Agent (verified REBNY MLS ID)');
      setVal(f, 'saleUpdatingAgentMlsId', '39361');
      expect(missing(f)).not.toContain('Updating Agent (verified REBNY MLS ID)');
    } finally { f.close(); }
  });

  it('checks condo annual tax and maintenance frequency when positive', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setType(f, 'Condo');
      expect(missing(f)).toContain('Annual Real Estate Taxes');
      setVal(f, 'saleRETaxes', '1200');
      expect(missing(f)).not.toContain('Annual Real Estate Taxes');
      setVal(f, 'saleMaintCC', '800');
      expect(missing(f)).toContain('Maint/CC Frequency');
      const select = f.d.getElementById('saleMaintCCFreq') as HTMLSelectElement;
      const option = Array.from(select.options).find(o => o.value && o.value !== '');
      expect(option).toBeDefined();
      setVal(f, 'saleMaintCCFreq', option!.value);
      expect(missing(f)).not.toContain('Maint/CC Frequency');
    } finally { f.close(); }
  });

  it('requires building unit count as well as total floors', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      setType(f, 'Condo');
      expect(missing(f)).toContain('Total Building Units');
      setVal(f, 'saleBldgTotalUnits', '120');
      expect(missing(f)).not.toContain('Total Building Units');
      expect(collect(f).NumberOfUnitsTotal).toBe(120);
    } finally { f.close(); }
  });
});
