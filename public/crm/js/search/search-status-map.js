/**
 * search-status-map.js — single source: CRM search status token → live Trestle StandardStatus.
 *
 * The REBNY IDX Plus feed (api.cotality.com/trestle) disseminates only four
 * StandardStatus values that return results: Active, Pending, ComingSoon, Closed.
 * Verified live 2026-07-05: Active=10,084 · Pending=6,455 · ComingSoon=1 · Closed=573,424
 * · ActiveUnderContract=0 · Withdrawn/Canceled/Expired/Hold=0.
 *
 * Therefore every granular CRM MlsStatus sub-status (Offer*, Contract*, Application*,
 * Lease*, BoardApproved, Sold*, Rented*, ACRIS*) MUST collapse to its PARENT
 * StandardStatus for a live-feed search, or the query returns nothing.
 *
 * ROOT CAUSE this fixes: the prior inline map in search-engine.js sent the "Pending"
 * family to StandardStatus 'ActiveUnderContract' — which the REBNY feed never populates
 * (0 rows) — so agents searching in-contract inventory got 0 of the ~6,455 live Pending
 * listings. In this feed "in contract" is StandardStatus 'Pending', not ActiveUnderContract.
 *
 * Off-market statuses (Withdrawn/Canceled/Expired/Hold/Incomplete) are kept for token
 * correctness even though the IDX Plus feed does not disseminate them (they return 0 live).
 *
 * Dual export: attaches `SearchStatusMap` to the browser global (inlined into
 * index-built.html by build.js) AND exports via CommonJS for the crm:test runner.
 */
(function (root) {
  'use strict';

  var SEARCH_STATUS_TO_STANDARD_STATUS = {
    // ── Active family ──
    ACTIVE: 'Active',
    Active: 'Active',
    BackOnMarket: 'Active', // Back On Market = still Active

    // ── Coming Soon ──
    COMING_SOON: 'ComingSoon',
    ComingSoon: 'ComingSoon',

    // ── Pending family (offers, contracts, applications, leases, board approval) ──
    PENDING: 'Pending',
    Pending: 'Pending',
    CONTRACT: 'Pending',
    UNDER_CONTRACT: 'Pending',
    Offer: 'Pending',
    OfferOut: 'Pending',
    OfferThruUs: 'Pending',
    OfferAccepted: 'Pending',
    OfferAcceptedThruUs: 'Pending',
    Contract: 'Pending',
    ContractOut: 'Pending',
    ContractOutThruUs: 'Pending',
    ContractSigned: 'Pending',
    ContractSignedThruUs: 'Pending',
    AllContractSigned: 'Pending',
    BoardApproved: 'Pending',
    Application: 'Pending',
    ApplicationIn: 'Pending',
    ApplicationAccepted: 'Pending',
    AppInThruUs: 'Pending',
    AppAcceptedThruUs: 'Pending',
    LeaseOut: 'Pending',
    LeaseOutThruUs: 'Pending',
    LeaseSigned: 'Pending',
    LeaseSignedThruUs: 'Pending',
    AllLeaseSigned: 'Pending',

    // ── Closed family (sold, rented, ACRIS-verified) ──
    CLOSED: 'Closed',
    Closed: 'Closed',
    Sold: 'Closed',
    SoldThruUs: 'Closed',
    Rented: 'Closed',
    RentedThruUs: 'Closed',
    ACRISVerified: 'Closed',
    Financed: 'Closed',
    NoFinancing: 'Closed',
    NominalSales: 'Closed',
    OtherACRIS: 'Closed',

    // ── Off-market (valid RESO; NOT disseminated by REBNY IDX Plus → 0 live results) ──
    WITHDRAWN: 'Withdrawn',
    Withdrawn: 'Withdrawn',
    CANCELED: 'Canceled',
    Canceled: 'Canceled',
    CANCELLED: 'Canceled',
    Cancelled: 'Canceled',
    EXPIRED: 'Expired',
    Expired: 'Expired',
    HOLD: 'Hold',
    Hold: 'Hold',
    INCOMPLETE: 'Incomplete',
    Incomplete: 'Incomplete',
    FUTURE: 'Incomplete',
    Future: 'Incomplete',
  };

  /**
   * Map a CRM search status token (top-level token or MlsStatus sub-status) to the
   * live Trestle StandardStatus to query. Returns null for unknown tokens — null is
   * the explicit "unrecognized" signal consumed by mapSearchStatuses() below; it must
   * never be silently swallowed by a caller.
   */
  function mapSearchStatusToStandardStatus(token) {
    if (token == null) return null;
    var key = String(token).trim();
    return Object.prototype.hasOwnProperty.call(SEARCH_STATUS_TO_STANDARD_STATUS, key)
      ? SEARCH_STATUS_TO_STANDARD_STATUS[key]
      : null;
  }

  /**
   * Fail-closed list mapper (Maya review 2026-07-16). Maps CRM search status
   * tokens to a de-duplicated list of live StandardStatus values.
   *
   * Returns exactly one of:
   *   { ok: true,  statuses: ['Pending', ...] }        — every token recognized
   *   { ok: false, statuses: [], unknown: ['X', ...] } — ≥1 token unrecognized
   *
   * Unknown tokens are NEVER silently dropped. The previous API
   * (mapSearchStatusesToStandardStatuses) dropped them, and the caller then
   * OMITTED the status filter when the mapped list came back empty — so a
   * search for an unknown status ran BROADER than the user requested
   * (fail-open). Callers MUST abort the search request and surface a visible
   * validation failure when ok === false; the whole selection is rejected,
   * never just the unknown portion.
   *
   * An empty/absent token list is a valid, intentionally unfiltered search:
   * it returns { ok: true, statuses: [] }.
   */
  function mapSearchStatuses(tokens) {
    var statuses = [];
    var unknown = [];
    var list = tokens || [];
    for (var i = 0; i < list.length; i++) {
      var mapped = mapSearchStatusToStandardStatus(list[i]);
      if (mapped === null) {
        var raw = String(list[i]);
        if (unknown.indexOf(raw) === -1) unknown.push(raw);
      } else if (statuses.indexOf(mapped) === -1) {
        statuses.push(mapped);
      }
    }
    if (unknown.length > 0) return { ok: false, statuses: [], unknown: unknown };
    return { ok: true, statuses: statuses };
  }

  var api = {
    SEARCH_STATUS_TO_STANDARD_STATUS: SEARCH_STATUS_TO_STANDARD_STATUS,
    mapSearchStatusToStandardStatus: mapSearchStatusToStandardStatus,
    mapSearchStatuses: mapSearchStatuses,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SearchStatusMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
