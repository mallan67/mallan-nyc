/// <reference types="jest" />
/**
 * Group 3 (Cotality-clean 2026-05-30) — raw-only phantom scalars reclassified as
 * internal keys (not live Cotality fields), with legacy-fallback reload for old rows:
 * TaxDeductionPercent, YearRenovated, RentingAllowedYN, BuildingHeating, BuildingCooling.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const formHtml = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

describe('Group 3 — raw-only phantom scalars no longer emitted as Cotality canonical', () => {
  it.each(['TaxDeductionPercent', 'YearRenovated', 'RentingAllowedYN', 'BuildingHeating', 'BuildingCooling'])(
    'collect no longer emits phantom data.%s',
    (f) => {
      expect(formHtml).not.toMatch(new RegExp('data\\.' + f + '\\s*='));
    },
  );

  it('building heating/cooling now emit internal keys', () => {
    expect(formHtml).toMatch(/data\.saleBldgHeating\s*=\s*\[\]/);
    expect(formHtml).toMatch(/data\.saleBldgCooling\s*=\s*\[\]/);
  });

  it('SALE_FIELD_MAP scalars reclassified internal with legacy fallback', () => {
    expect(formHtml).toMatch(/mallan:\s*'saleTaxDeduction'[^}]*legacyFallback:\s*'TaxDeductionPercent'/);
    expect(formHtml).toMatch(/mallan:\s*'saleBldgYearRenovated'[^}]*legacyFallback:\s*'YearRenovated'/);
    expect(formHtml).toMatch(/mallan:\s*'saleBldgSublettingAllowed'[^}]*legacyFallback:\s*'RentingAllowedYN'/);
  });

  it('SALE_CHECKBOX_ARRAY_MAP reclassified + restore loop supports legacyFallback (legacy reload)', () => {
    expect(formHtml).toMatch(/mallan:\s*'saleBldgHeating',\s*name:\s*'saleBldgHeating',\s*legacyFallback:\s*'BuildingHeating'/);
    expect(formHtml).toMatch(/mallan:\s*'saleBldgCooling',\s*name:\s*'saleBldgCooling',\s*legacyFallback:\s*'BuildingCooling'/);
    expect(formHtml).toMatch(/if\s*\(!Array\.isArray\(vals\)\s*&&\s*ca\.legacyFallback\)\s*vals\s*=\s*raw\[ca\.legacyFallback\]/);
  });
});
