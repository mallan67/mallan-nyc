/// <reference types="jest" />
/**
 * Sale-form pricing math — behavior proof (P0).
 *
 * The sale editor lets an agent enter RE taxes as a MONTHLY figure, but the
 * only REBNY-certified storage field is the ANNUAL `TaxAnnualAmount` (verified
 * 2026-06-22 against live api.cotality.com $metadata: TaxAnnualAmount =
 * Property/Edm.Decimal; TaxMonthlyAmount is NOT in the IDX Plus certified
 * subset — fail-closed, never persisted). So monthly entry must convert to the
 * stored annual value and round-trip back on reload.
 *
 * Total Monthly = Maint/CC + MONTHLY tax (the old bug read the empty ANNUAL
 * box, yielding Maint/CC alone — e.g. $694 instead of $1,427).
 *
 * These exercise the REAL pure module the form calls (no DOM needed), so the
 * arithmetic is genuinely proven, not source-grepped (CLAUDE.md §F).
 *
 * @module tests/runtime/sale-form-pricing-calc
 */
import {
  monthlyTaxToAnnual,
  annualTaxToMonthly,
  computeTotalMonthly,
} from '../../public/crm/js/listing/pricing-calc.js';

describe('sale-form pricing-calc — Maya worked example (694 / 733 / 8796 / 1427)', () => {
  it('monthly 733 → stored annual TaxAnnualAmount 8796', () => {
    expect(monthlyTaxToAnnual(733)).toBe(8796);
  });

  it('stored annual 8796 → derived monthly 733 on reload', () => {
    expect(annualTaxToMonthly(8796)).toBe(733);
  });

  it('round-trips monthly → annual → monthly losslessly', () => {
    expect(annualTaxToMonthly(monthlyTaxToAnnual(733))).toBe(733);
  });

  it('Total Monthly = Maint/CC 694 + monthly tax 733 = 1427', () => {
    expect(computeTotalMonthly(694, 733)).toBe(1427);
  });
});

describe('sale-form pricing-calc — null/blank safety (fail-closed numerics)', () => {
  it('blank monthly tax → annual 0 (no NaN)', () => {
    expect(monthlyTaxToAnnual('')).toBe(0);
  });

  it('blank annual → monthly 0 (no NaN)', () => {
    expect(annualTaxToMonthly('')).toBe(0);
    expect(annualTaxToMonthly(0)).toBe(0);
  });

  it('Total Monthly treats blank inputs as 0, not NaN', () => {
    expect(computeTotalMonthly('', 733)).toBe(733);
    expect(computeTotalMonthly(694, '')).toBe(694);
    expect(computeTotalMonthly('', '')).toBe(0);
  });

  it('accepts numeric strings from form inputs', () => {
    expect(computeTotalMonthly('694', '733')).toBe(1427);
    expect(monthlyTaxToAnnual('733')).toBe(8796);
  });
});
