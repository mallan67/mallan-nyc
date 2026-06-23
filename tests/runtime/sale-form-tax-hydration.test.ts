/// <reference types="jest" />
/**
 * Sale-form unit Real-Estate-Tax hydration (2026-06-23).
 *
 * The unit RE-Taxes field (`saleRETaxes` -> saves as `TaxAnnualAmount`) must hydrate the
 * UNIT's tax FEATURES-FIRST (the canonical bucket the public DTO + Trestle mapper write,
 * e.g. a Cotality-synced `features.TaxAnnualAmount`), then fall back to `raw_data`. It must
 * NEVER be filled from building-level annual taxes (`saleBldgAnnualTaxes`) — building tax is
 * not the unit's tax, and auto-filling it would create a false listing value.
 *
 * `TaxAnnualAmount` is a CONFIRMED-LIVE Cotality field (artifacts/metadata.xml); it is NOT
 * renamed here. The matching harness in this repo is source-structure assertion (no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

describe('sale form — condo shows the unit RE-Taxes field', () => {
  it('resolveListingSubtype maps Condo -> CONDO', () => {
    expect(FORM).toContain("case 'Condo': return 'CONDO';");
  });

  it('saleRETaxesField visibility allow-list includes CONDO', () => {
    const start = FORM.indexOf('saleRETaxesField:');
    expect(start).toBeGreaterThan(-1);
    const rule = FORM.slice(start, FORM.indexOf(']', start));
    expect(rule).toContain("'CONDO'");
  });

  it('keeps co-op behavior: COOP is NOT in the RE-Taxes allow-list (no separate unit RE tax for co-ops)', () => {
    const start = FORM.indexOf('saleRETaxesField:');
    const rule = FORM.slice(start, FORM.indexOf(']', start));
    expect(rule).not.toContain("'COOP'");
  });
});

describe('sale form — unit tax hydrates features-first, raw_data fallback', () => {
  it('the TaxAnnualAmount field-map entry uses src: features (not raw)', () => {
    expect(FORM).toMatch(
      /\{\s*rls:\s*'TaxAnnualAmount',\s*form:\s*'saleRETaxes',\s*type:\s*'number',\s*src:\s*'features'\s*\}/,
    );
    // and it is NOT the old raw-only mapping
    expect(FORM).not.toMatch(/rls:\s*'TaxAnnualAmount',\s*form:\s*'saleRETaxes',\s*type:\s*'number',\s*src:\s*'raw'/);
  });

  it('the hydration loop has a features branch that reads features[f.rls] BEFORE raw[f.rls]', () => {
    const i = FORM.indexOf("} else if (f.src === 'features') {");
    expect(i).toBeGreaterThan(-1);
    const branch = FORM.slice(i, i + 900);
    // features first...
    expect(branch).toContain('features[f.rls] !== undefined');
    expect(branch).toContain('? features[f.rls]');
    // ...raw_data fallback
    expect(branch).toContain(': raw[f.rls];');
  });
});

describe('sale form — building annual tax must NOT populate the unit RE-Taxes field', () => {
  it('building autofill writes building tax to saleBldgAnnualTaxes (building-level)', () => {
    expect(FORM).toMatch(/setIfPresent\(prefix \+ 'BldgAnnualTaxes', pick\('tax_annual_amount'/);
  });

  it('no path fills saleRETaxes from a building tax pick()', () => {
    // saleRETaxes must never be assigned from the building lookup's tax fields.
    expect(FORM).not.toMatch(/saleRETaxes'?\s*,\s*pick\(\s*'tax_annual_amount'/);
    expect(FORM).not.toMatch(/RETaxes',\s*pick\('tax_annual_amount'/);
  });
});

describe('sale form — saved manual tax round-trips (save <-> load on the same field)', () => {
  it('SAVE: collectSaleFormData reads saleRETaxes into TaxAnnualAmount', () => {
    expect(FORM).toMatch(/data\.TaxAnnualAmount\s*=\s*parseFloat\(data\.saleRETaxes/);
  });

  it('LOAD: the TaxAnnualAmount field-map entry restores into saleRETaxes', () => {
    expect(FORM).toMatch(/rls:\s*'TaxAnnualAmount',\s*form:\s*'saleRETaxes'/);
  });
});
