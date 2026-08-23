/// <reference types="jest" />
/**
 * Sale-form RE tax: two-way monthly<->annual + zero-clobber guard (2026-06-23).
 *
 * Cotality exposes only an ANNUAL unit tax field (TaxAnnualAmount on Property; verified
 * artifacts/metadata.xml). Monthly is a DERIVED display (annual/12) and is NEVER stored.
 * Fixes the reported "tax won't save / needs monthly":
 *   - typing MONTHLY back-fills the canonical ANNUAL field (saleRETaxes -> TaxAnnualAmount) x12,
 *   - typing ANNUAL derives monthly /12,
 *   - edit-load refreshes the monthly display,
 *   - a BLANK annual box never overwrites a saved tax with 0.
 *
 * Source-structure assertions (the repo's sale-form test harness; no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

describe('sale form — two-way monthly <-> annual RE tax', () => {
  it('annual input drives monthly (oninput=autoCalcTaxMonthly)', () => {
    expect(FORM).toMatch(/id="saleRETaxes"[^>]*oninput="autoCalcTaxMonthly\(\)"/);
  });

  it('monthly input is wired to back-fill annual (oninput=syncSaleAnnualFromMonthly) and stays unstored', () => {
    const tag = FORM.slice(FORM.indexOf('id="saleTaxMonthly"') - 30, FORM.indexOf('id="saleTaxMonthly"') + 220);
    expect(tag).toContain('oninput="syncSaleAnnualFromMonthly()"');
    expect(tag).toContain('data-mallan-internal="true"');   // monthly is NOT a stored Cotality field
  });

  it('autoCalcTaxMonthly derives monthly = annual / 12', () => {
    const fn = FORM.slice(FORM.indexOf('function autoCalcTaxMonthly()'), FORM.indexOf('function syncSaleAnnualFromMonthly()'));
    expect(fn).toContain('(annual / 12)');
  });

  it('syncSaleAnnualFromMonthly back-fills annual = monthly * 12 and guards blank monthly', () => {
    const i = FORM.indexOf('function syncSaleAnnualFromMonthly()');
    expect(i).toBeGreaterThan(-1);
    const fn = FORM.slice(i, i + 700);
    expect(fn).toContain('monthly * 12');
    expect(fn).toMatch(/if \(raw === ''\) return;/); // blank monthly -> do not touch annual
  });

  it('edit-load refreshes the derived monthly display (autoCalcTaxMonthly called in populate)', () => {
    // After the populate trigger-calc, autoCalcTaxMonthly() runs so monthly shows when annual exists.
    expect(FORM).toMatch(/calculateSaleTotalMonthly\(\);[\s\S]{0,400}?autoCalcTaxMonthly === 'function'\) autoCalcTaxMonthly\(\)/);
  });

  it('Total Monthly adds the MONTHLY tax (annual/12), not the annual figure (Codex #432 P2)', () => {
    const i = FORM.indexOf('function calculateSaleTotalMonthly()');
    const fn = FORM.slice(i, i + 700);
    expect(fn).toContain('annualReTax / 12');
    // the old bug (adding the full annual tax to monthly maintenance) is gone
    expect(fn).not.toMatch(/const total = maintCC \+ reTaxes;/);
  });
});

describe('sale form — annual tax zero-clobber guard', () => {
  it('a blank annual field does NOT emit TaxAnnualAmount (omitted so the saved value is preserved)', () => {
    const i = FORM.indexOf('_saleReTaxRaw');
    expect(i).toBeGreaterThan(-1);
    const block = FORM.slice(i - 80, i + 220);
    expect(block).toMatch(/if \(_saleReTaxRaw !== ''\) \{[\s\S]*?data\.TaxAnnualAmount = parseFloat\(_saleReTaxRaw\)/);
    // the old unconditional zero-clobber is gone
    expect(FORM).not.toContain("data.TaxAnnualAmount = parseFloat(data.saleRETaxes || '0') || 0;");
  });
});
