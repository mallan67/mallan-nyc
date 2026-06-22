/// <reference types="jest" />
/**
 * Sale-form pricing WIRING guardrail (P0).
 *
 * The executable arithmetic proof lives in `sale-form-pricing-calc.test.ts`
 * (it runs the real pure module). This file is the static guardrail that locks
 * the DOM wiring in SALE-FORM-REDESIGN.html so a future edit cannot silently
 * reintroduce the two bugs:
 *   - Total Monthly reading the ANNUAL box instead of the MONTHLY box.
 *   - The monthly box not converting to the persisted annual TaxAnnualAmount.
 *
 * Style: file-string parsing (the jest runtime is node-env; jsdom is not a
 * dependency — see auction-form-flow.test.ts).
 *
 * @module tests/runtime/sale-form-pricing-wiring
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORM_PATH = resolve(__dirname, '..', '..', 'public', 'crm', 'SALE-FORM-REDESIGN.html');

describe('SALE-FORM-REDESIGN.html — pricing wiring (P0)', () => {
  let html: string;
  beforeAll(() => {
    html = readFileSync(FORM_PATH, 'utf8');
  });

  it('loads the pure pricing module', () => {
    expect(html).toContain('js/listing/pricing-calc.js');
  });

  it('annual tax input persists as the certified TaxAnnualAmount field', () => {
    // Live-verified canonical storage field (api.cotality.com $metadata 2026-06-22).
    expect(html).toMatch(/id="saleRETaxes"[^>]*data-rls-field="TaxAnnualAmount"/);
  });

  it('monthly tax box is NOT a persisted field and syncs to annual on input', () => {
    // Monthly stays fail-closed (data-rls-ignore) — never its own storage field.
    expect(html).toMatch(/id="saleTaxMonthly"[^>]*data-rls-ignore="true"/);
    expect(html).toMatch(/id="saleTaxMonthly"[^>]*oninput="syncTaxMonthlyToAnnual\(\)"/);
  });

  it('Total Monthly reads the MONTHLY tax box, never the annual box', () => {
    const fn = html.slice(html.indexOf('function calculateSaleTotalMonthly()'));
    const body = fn.slice(0, fn.indexOf('}') + 1);
    expect(body).toContain("getElementById('saleTaxMonthly')");
    expect(body).not.toContain("getElementById('saleRETaxes')");
    expect(body).toContain('MallanPricing.computeTotalMonthly');
  });

  it('monthly→annual conversion uses the certified pure helper', () => {
    expect(html).toContain('MallanPricing.monthlyTaxToAnnual');
    expect(html).toContain('MallanPricing.annualTaxToMonthly');
  });

  it('Preview "RE Taxes /mo" reads the monthly box, not the annual one', () => {
    const fn = html.slice(html.indexOf('function updateSalePreview()'));
    const body = fn.slice(0, fn.indexOf("setText('salePreviewTaxes'") + 120);
    expect(body).toMatch(/salePreviewTaxes[\s\S]{0,60}\/mo/);
    // the tax value feeding the /mo preview must come from the monthly box
    expect(body).toMatch(/val\('saleTaxMonthly'\)[\s\S]{0,120}salePreviewTaxes/);
  });

  it('hydrate seeds the monthly mirror + total from the loaded annual', () => {
    // After the SALE_FIELD_MAP restore loop, autoCalcTaxMonthly() must run so a
    // reloaded listing shows the derived monthly and a correct Total Monthly.
    expect(html).toMatch(/SALE_FIELD_MAP[\s\S]{0,4000}autoCalcTaxMonthly\(\)/);
  });
});
