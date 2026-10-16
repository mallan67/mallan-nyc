/// <reference types="jest" />
/**
 * A `data-concept` attribute claims a live Cotality field. Fields served inside Property.CustomProperty[].CustomFields
 * (TaxMonthlyAmount, FlipTax, SponsorUnitYN ...) are live Cotality fields reached through Property, so a control that
 * stands for one claims it. A control that stands for something Cotality does not serve keeps the
 * `data-concept-disposition` / `data-removed-field` marker instead. The names are held to the live contract:
 * compliance/rules/compliance-concepts.json (customFieldKeys) and data/cotality-enums.live.json.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const formHtml = readFileSync(resolve(root, 'public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const registry = JSON.parse(readFileSync(resolve(root, 'compliance/rules/compliance-concepts.json'), 'utf8'));
const contract = JSON.parse(readFileSync(resolve(root, 'data/cotality-enums.live.json'), 'utf8'));
const customKeys = new Set<string>(registry.customFieldKeys.keys);

const SALE_CUSTOM_FIELDS = [
  'TaxMonthlyAmount', 'PercentOfCommonElements', 'TaxDeductionPercent', 'FlipTax',
  'GuarantorsAcceptedYN', 'CommercialUnitsYN', 'LandmarkStatusYN', 'SponsorUnitYN',
  'AttendanceType', 'CapitalReservesTotal', 'CapitalReservesYN',
  'TaxAbatementYN', 'TaxAbatementComments', 'MaximumFinancingPercent',
];

describe('data-concept claims only live Cotality fields', () => {
  it.each(SALE_CUSTOM_FIELDS)('%s is a live CustomFields key and the Sale form claims it', (f) => {
    expect(customKeys.has(f)).toBe(true);
    expect(formHtml).toMatch(new RegExp('data-concept="' + f + '"'));
  });

  it('no control on the Sale form still carries a removed-field marker for a name that is live', () => {
    const live = new Set<string>([...Object.keys(contract.entities.Property), ...Object.keys(contract.entities.CustomProperty), ...customKeys]);
    const markers = [...formHtml.matchAll(/data-removed-field="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
    expect(markers.filter((m) => live.has(m))).toEqual([]);
  });

  it('data-concept="BuildingFeatures" (a real Cotality multi-enum, also the collector selector) is retained', () => {
    expect(formHtml).toMatch(/data-concept="BuildingFeatures"/);
  });
});
