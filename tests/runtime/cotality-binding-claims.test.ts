/// <reference types="jest" />
/**
 * Group 5 (Cotality-clean 2026-05-30) — no `data-cotality-field` attribute may claim a
 * field absent from live Cotality `$metadata`. Phantom claims were converted to the
 * `data-mallan-ignore`/`data-removed-field` internal marker. The one legitimate
 * `data-cotality-field="BuildingFeatures"` (a real Cotality Multi enum, also used as the
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

// Packet 2 convergence (2026-09-06): these names are NOT live Cotality fields (still asserted below), but the
// ones the REBNY / UCBA rules require are DECLARED Mallan-internal keys (lib/listings/mallan-form-contract.ts):
// REBNY submission facts the write path persists under their own names, never presented as provider facts.
// A data-cotality-field claim is therefore canonical only for a declared Mallan-internal key; any other non-live
// name is a phantom claim and stays forbidden.
const { MALLAN_INTERNAL_KEYS } = require('@/lib/listings/mallan-form-contract') as { MALLAN_INTERNAL_KEYS: string[] };
const { LIVE_PROPERTY_FIELDS } = require('@/lib/cotality/live-contract') as { LIVE_PROPERTY_FIELDS: Set<string> };

describe('Group 5 — data-cotality-field never claims a name that is neither live Cotality nor a declared Mallan-internal key', () => {
  it.each(PHANTOM)('"%s" is not a live Cotality field; a data-cotality-field claim exists only if it is a declared Mallan-internal key', (f) => {
    expect(LIVE_PROPERTY_FIELDS.has(f)).toBe(false);
    const claimed = new RegExp('data-cotality-field="' + f + '"').test(formHtml);
    if (claimed) expect(MALLAN_INTERNAL_KEYS).toContain(f);
  });

  it('legit data-cotality-field="BuildingFeatures" (real Cotality Multi enum + collector selector) retained', () => {
    expect(formHtml).toMatch(/data-cotality-field="BuildingFeatures"/);
  });
});
