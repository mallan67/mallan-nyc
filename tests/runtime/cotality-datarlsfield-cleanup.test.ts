/// <reference types="jest" />
/**
 * Group 5 (Cotality-clean 2026-05-30) — no `data-concept` attribute may claim a
 * field absent from live Cotality `$metadata`. Phantom claims were converted to the
 * `data-concept-disposition`/`data-removed-field` internal marker. The one legitimate
 * `data-concept="BuildingFeatures"` (a real Cotality Multi enum, also used as the
 * collector selector) is retained.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const formHtml = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

const PHANTOM = [
  'TaxMonthlyAmount', 'PercentOfCommonElements', 'TaxDeductionPercent', 'FlipTax',
  'GuarantorsAcceptedYN', 'CommercialUnitsYN', 'LandmarkStatusYN', 'SponsorUnitYN',
  'AttendanceType', 'CapitalReservesTotal', 'CapitalReservesYN', 'BuildingTaxLot',
  'TaxAbatementYN', 'TaxAbatementComments', 'MaximumFinancingPercent',
];

describe('Group 5 — data-concept no longer claims phantom Cotality fields', () => {
  it.each(PHANTOM)('data-concept="%s" removed (now data-removed-field/ignore)', (f) => {
    expect(formHtml).not.toMatch(new RegExp('data-concept="' + f + '"'));
  });

  it('legit data-concept="BuildingFeatures" (real Cotality Multi enum + collector selector) retained', () => {
    expect(formHtml).toMatch(/data-concept="BuildingFeatures"/);
  });
});
