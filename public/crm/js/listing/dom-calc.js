'use strict';
/**
 * Sale-form Days-on-Market display math — browser mirror of the canonical
 * server module `lib/compliance/dom-tracker.ts` (`getCurrentDom`).
 *
 * UCBA 2026 (Art. I §11) read-path rules, kept byte-for-byte in sync with the
 * TS source (a jest parity test, sale-form-dom-calc.test.ts, fails if they
 * diverge):
 *   - DOM accrues ONLY while status ∈ {Active, ActiveUnderContract}
 *   - DOM does NOT accrue during ComingSoon / Withdrawn / Cancelled / Expired
 *   - DOM does NOT accrue when permissions ∈ {Participant Only Network, Private}
 *   - Otherwise: stored days_on_market + elapsed days since status_changed_at
 *
 * `resolveEditorDom` adds the editor hydrate seed: when a row is accruing but
 * has no stored base and no status_changed_at (legacy/imported listings), it
 * anchors on first_active_date, else OnMarketDate — so the card reflects real
 * time on market instead of resetting to 0. It NEVER invents accrual for
 * ComingSoon / suppressed / terminal statuses.
 *
 * Pure + side-effect-free (uses Date.now() so tests can freeze it). No DOM here.
 *
 * @module public/crm/js/listing/dom-calc
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MallanDom = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  var DAY_MS = 1000 * 60 * 60 * 24;
  var DOM_ACCRUING_STATUSES = ['Active', 'ActiveUnderContract'];
  var DOM_SUPPRESSING_PERMISSIONS = ['Participant Only Network', 'Private'];

  function isAccruingStatus(status) {
    return DOM_ACCRUING_STATUSES.indexOf(String(status)) !== -1;
  }

  function isDomSuppressedByPermissions(permissions) {
    return !!permissions && DOM_SUPPRESSING_PERMISSIONS.indexOf(String(permissions)) !== -1;
  }

  /** Coerce a Date | ISO-string | epoch-ms | null to epoch ms, or null if invalid. */
  function toMs(d) {
    if (d == null || d === '') return null;
    var t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    return isFinite(t) ? t : null;
  }

  function toInt(v) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : 0;
  }

  function elapsedDaysSince(ms) {
    return Math.floor((Date.now() - ms) / DAY_MS);
  }

  /**
   * Canonical read-path DOM — exact mirror of dom-tracker.getCurrentDom.
   * @param {{status:string, permissions?:string|null, status_changed_at?:*, days_on_market?:*}} listing
   * @returns {number}
   */
  function getCurrentDom(listing) {
    var stored = toInt(listing.days_on_market);
    if (!isAccruingStatus(listing.status)) return stored;
    if (isDomSuppressedByPermissions(listing.permissions)) return stored;
    var sc = toMs(listing.status_changed_at);
    if (sc == null) return stored;
    return Math.max(0, stored + elapsedDaysSince(sc));
  }

  /**
   * Editor-facing resolver. Uses the canonical getCurrentDom, then applies the
   * hydrate seed: when accruing with no stored base AND no status_changed_at,
   * anchor on first_active_date (preferred) or OnMarketDate.
   * @returns {{days:number, cumulative:number}}
   */
  function resolveEditorDom(fields) {
    var days = getCurrentDom(fields);

    var accruing = isAccruingStatus(fields.status) && !isDomSuppressedByPermissions(fields.permissions);
    var stored = toInt(fields.days_on_market);
    if (accruing && stored === 0 && toMs(fields.status_changed_at) == null) {
      var anchor = toMs(fields.first_active_date);
      if (anchor == null) anchor = toMs(fields.on_market_date);
      if (anchor != null) {
        days = Math.max(0, elapsedDaysSince(anchor));
      }
    }

    var cumulative = parseInt(fields.cumulative_days_on_market, 10);
    if (!isFinite(cumulative) || cumulative < days) cumulative = days;
    return { days: days, cumulative: cumulative };
  }

  return {
    isAccruingStatus: isAccruingStatus,
    isDomSuppressedByPermissions: isDomSuppressedByPermissions,
    getCurrentDom: getCurrentDom,
    resolveEditorDom: resolveEditorDom,
  };
});
