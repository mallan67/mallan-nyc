'use strict';
/**
 * Sale-form pricing math — single source of truth for tax + Total Monthly.
 *
 * REBNY/Cotality field truth (verified 2026-06-22 against live
 * api.cotality.com/trestle $metadata):
 *   - `TaxAnnualAmount`  → Property / Edm.Decimal — CERTIFIED IDX Plus field.
 *     This is the ONLY field taxes are stored in.
 *   - `TaxMonthlyAmount` → exists ONLY as a CustomProperty.CustomFields live
 *     key; NOT in REBNY's certified IDX Plus subset. Per CLAUDE.md §E
 *     (fail-closed), it is NEVER a storage target. The monthly figure is a
 *     UI convenience derived from / converted to the annual value.
 *
 * The agent may type taxes as MONTHLY; the form converts to annual for storage
 * (monthly × 12 → TaxAnnualAmount) and derives monthly back on reload
 * (annual ÷ 12). Total Monthly = Maint/CC + monthly tax.
 *
 * Pure + side-effect-free so it is unit-testable in node (jest) AND attaches to
 * `window.MallanPricing` for the browser form. No DOM access here.
 *
 * @module public/crm/js/listing/pricing-calc
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MallanPricing = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  /** Coerce a form-input value (string | number | null) to a finite number; 0 otherwise. */
  function toNum(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /** Monthly RE tax → annual `TaxAnnualAmount` (the stored value). */
  function monthlyTaxToAnnual(monthly) {
    return toNum(monthly) * 12;
  }

  /** Annual `TaxAnnualAmount` → derived monthly RE tax (for display on reload). */
  function annualTaxToMonthly(annual) {
    var a = toNum(annual);
    return a > 0 ? a / 12 : 0;
  }

  /** Total Monthly carrying cost = Maint/CC + monthly RE tax. */
  function computeTotalMonthly(maintCC, monthlyTax) {
    return toNum(maintCC) + toNum(monthlyTax);
  }

  return {
    toNum: toNum,
    monthlyTaxToAnnual: monthlyTaxToAnnual,
    annualTaxToMonthly: annualTaxToMonthly,
    computeTotalMonthly: computeTotalMonthly,
  };
});
