// scripts/crm-tests/cases-search-status-map.js
//
// Regression lock for public/crm/js/search/search-status-map.js — the single
// source that maps CRM search status tokens (top-level + MlsStatus sub-statuses)
// to the live Trestle StandardStatus the query actually filters on — AND for the
// fail-closed contract between the mapper and its caller
// (public/crm/js/search/search-engine.js).
//
// Two defects locked down here:
//
// 1. Pending-family mapping (original): the prior inline map in search-engine.js
//    sent the "Pending" family to StandardStatus 'ActiveUnderContract', which the
//    REBNY IDX Plus feed never populates (verified live 2026-07-05:
//    ActiveUnderContract=0, Pending=6,455). Agents searching in-contract
//    inventory got 0 results.
//
// 2. Fail-open unknown-token handling (Maya review 2026-07-16): the first cut of
//    the mapper silently DROPPED unknown tokens, and the caller only added the
//    status param when the mapped list was nonempty — so a user selecting an
//    unknown status got their status filter OMITTED and the search ran BROADER
//    than requested. The contract is now fail-closed:
//      - no status selected            → filter intentionally omitted, search runs;
//      - all selected tokens known     → deduplicated mapped statuses sent;
//      - ANY selected token unknown    → the WHOLE selection is rejected, the
//        request is NOT issued at all, and a visible validation failure is
//        surfaced via the CRM's toast mechanism (showToast(..., 'error')).
//
// The caller-side cases load the real search-status-map.js + search-engine.js
// into a JSDOM window (same pattern as cases-form-validators.js), stub the
// request layer (MallanAPI.idx.search) and the toast surface (showToast), and
// drive window.performSearch() end-to-end so "the request was not issued" is
// observed at the actual request boundary, not inferred from the mapper alone.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SEARCH_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'public',
  'crm',
  'js',
  'search'
);
const MAP_PATH = path.join(SEARCH_DIR, 'search-status-map.js');
const ENGINE_PATH = path.join(SEARCH_DIR, 'search-engine.js');

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — mapper unit cases (CommonJS load, no DOM)
// ─────────────────────────────────────────────────────────────────────────────

function runMapperCases(results) {
  let SearchStatusMap;
  try {
    SearchStatusMap = require(MAP_PATH);
  } catch (err) {
    results.push({ pass: false, name: 'search-status-map.js loads via CommonJS', detail: err.message });
    return;
  }
  const map = SearchStatusMap.mapSearchStatusToStandardStatus;
  const mapList = SearchStatusMap.mapSearchStatuses;

  function expect(token, expected) {
    const actual = map(token);
    results.push({
      pass: actual === expected,
      name: `'${token}' -> StandardStatus '${expected}'`,
      detail: actual === expected ? undefined : `got '${actual}'`,
    });
  }

  // ── The bug this fixes: in-contract family MUST be 'Pending', never 'ActiveUnderContract'.
  expect('PENDING', 'Pending');
  expect('CONTRACT', 'Pending');
  expect('UNDER_CONTRACT', 'Pending');

  // ── Every Pending-family sub-status collapses to its parent StandardStatus 'Pending'.
  [
    'Offer', 'OfferOut', 'OfferThruUs', 'OfferAccepted', 'OfferAcceptedThruUs',
    'Contract', 'ContractOut', 'ContractOutThruUs', 'ContractSigned',
    'ContractSignedThruUs', 'AllContractSigned', 'BoardApproved',
    'Application', 'ApplicationIn', 'ApplicationAccepted', 'AppInThruUs',
    'AppAcceptedThruUs', 'LeaseOut', 'LeaseOutThruUs', 'LeaseSigned',
    'LeaseSignedThruUs', 'AllLeaseSigned',
  ].forEach((t) => expect(t, 'Pending'));

  // ── Closed family collapses to 'Closed'.
  ['Closed', 'Sold', 'SoldThruUs', 'Rented', 'RentedThruUs', 'ACRISVerified',
    'Financed', 'NoFinancing', 'NominalSales', 'OtherACRIS'].forEach((t) => expect(t, 'Closed'));

  // ── Active family + Coming Soon.
  expect('ACTIVE', 'Active');
  expect('Active', 'Active');
  expect('BackOnMarket', 'Active');
  expect('COMING_SOON', 'ComingSoon');
  expect('ComingSoon', 'ComingSoon');

  // ── Negative guard: ActiveUnderContract must NOT be a search target for any
  //    in-contract token (it returns 0 in the REBNY feed).
  results.push({
    pass: map('PENDING') !== 'ActiveUnderContract' && map('ContractSigned') !== 'ActiveUnderContract',
    name: "in-contract tokens never map to 'ActiveUnderContract' (0 live in REBNY feed)",
  });

  // ── mapSearchStatuses: valid Pending-family selection dedupes to ['Pending'].
  const deduped = mapList(['Offer', 'ContractSigned', 'BoardApproved', 'PENDING']);
  results.push({
    pass: deduped && deduped.ok === true
      && Array.isArray(deduped.statuses)
      && deduped.statuses.length === 1
      && deduped.statuses[0] === 'Pending',
    name: "mapSearchStatuses: mixed Pending-family selection -> { ok: true, statuses: ['Pending'] } (deduped)",
    detail: JSON.stringify(deduped),
  });

  // ── mapSearchStatuses: empty selection is a valid unfiltered search.
  const empty = mapList([]);
  const absent = mapList(undefined);
  results.push({
    pass: empty && empty.ok === true && empty.statuses.length === 0
      && absent && absent.ok === true && absent.statuses.length === 0,
    name: 'mapSearchStatuses: empty/absent selection -> { ok: true, statuses: [] } (intentional unfiltered search)',
    detail: JSON.stringify({ empty, absent }),
  });

  // ── FAIL-CLOSED: unknown token is rejected, not dropped.
  const unknownOnly = mapList(['NotAStatus']);
  results.push({
    pass: unknownOnly && unknownOnly.ok === false
      && Array.isArray(unknownOnly.unknown)
      && unknownOnly.unknown.length === 1
      && unknownOnly.unknown[0] === 'NotAStatus'
      && unknownOnly.statuses.length === 0,
    name: "mapSearchStatuses: unknown token -> { ok: false, unknown: ['NotAStatus'] } (rejected, not dropped)",
    detail: JSON.stringify(unknownOnly),
  });

  // ── FAIL-CLOSED: mixed known + unknown rejects the WHOLE selection.
  const mixed = mapList(['ACTIVE', 'NotAStatus', 'PENDING']);
  results.push({
    pass: mixed && mixed.ok === false
      && mixed.unknown.length === 1
      && mixed.unknown[0] === 'NotAStatus'
      && mixed.statuses.length === 0,
    name: 'mapSearchStatuses: mixed known+unknown selection -> ok:false, whole selection rejected (no partial statuses)',
    detail: JSON.stringify(mixed),
  });

  // ── The fail-open API must not come back: the old drop-unknowns list mapper
  //    is removed so no caller can silently regress to drop-and-broaden.
  results.push({
    pass: typeof SearchStatusMap.mapSearchStatusesToStandardStatuses === 'undefined',
    name: 'fail-open API mapSearchStatusesToStandardStatuses (drop-unknowns) is removed',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — caller integration cases (JSDOM: real search-engine.js, stubbed
// request layer). Observes the actual request boundary (MallanAPI.idx.search).
// ─────────────────────────────────────────────────────────────────────────────

function bootEngineDom(results) {
  let dom;
  try {
    dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      runScripts: 'dangerously',
      url: 'https://crm.test/crm/index.html',
      pretendToBeVisual: true,
    });
  } catch (err) {
    results.push({ pass: false, name: 'jsdom bootstrap for search-engine caller cases', detail: err.message });
    return null;
  }
  const { window } = dom;

  // Recorders — the harness's request observer. A search "request" only
  // happens through MallanAPI.idx.search (the /api/idx/search boundary).
  const recorder = {
    searchCalls: [],
    toasts: [],
    reset() { this.searchCalls = []; this.toasts = []; },
  };

  // Stubs the engine reaches for at load/run time (normally provided by the
  // other concatenated CRM modules / the page DOM).
  window.fetch = function () { return Promise.reject(new Error('network disabled in test')); };
  window.showToast = function (message, type) { recorder.toasts.push({ message, type }); };
  window.MallanAPI = {
    idx: {
      search: function (params) {
        recorder.searchCalls.push(JSON.parse(JSON.stringify(params)));
        return new Promise(function () { /* stay pending — render path not under test */ });
      },
    },
  };
  window.searchResultsState = { filteredListings: [], currentPage: 1 };
  window.listings = []; // no local fixtures → local filter path is skipped
  window.currentSearchTab = 'sale';
  window.initializeSearchResults = function () {};
  window.scrollTo = function () {};

  try {
    for (const file of [MAP_PATH, ENGINE_PATH]) {
      const script = window.document.createElement('script');
      script.textContent = fs.readFileSync(file, 'utf8');
      window.document.body.appendChild(script);
    }
  } catch (err) {
    results.push({ pass: false, name: 'search-status-map.js + search-engine.js load in JSDOM', detail: err.message });
    return null;
  }

  if (typeof window.performSearch !== 'function' || typeof window.buildIdxSearchParams !== 'function') {
    results.push({
      pass: false,
      name: 'search-engine.js exposes performSearch + buildIdxSearchParams globals',
      detail: `performSearch=${typeof window.performSearch} buildIdxSearchParams=${typeof window.buildIdxSearchParams}`,
    });
    return null;
  }

  return { window, recorder };
}

function runCallerCases(results) {
  const booted = bootEngineDom(results);
  if (!booted) return;
  const { window, recorder } = booted;

  // Drive performSearch with controlled criteria by replacing the global
  // binding the engine resolves at call time.
  function performSearchWith(criteria) {
    recorder.reset();
    window.collectSearchCriteria = function () { return criteria; };
    window.performSearch();
  }

  // ── FAIL-CLOSED: only unknown token → request NOT issued + validation toast.
  performSearchWith({ searchTab: 'sale', statuses: ['NotAStatus'] });
  results.push({
    pass: recorder.searchCalls.length === 0,
    name: 'performSearch: unknown-only status selection issues NO request',
    detail: `searchCalls=${JSON.stringify(recorder.searchCalls)}`,
  });
  const unknownToast = recorder.toasts.find((t) => t.type === 'error');
  results.push({
    pass: Boolean(unknownToast)
      && unknownToast.message.indexOf('NotAStatus') !== -1
      && /status/i.test(unknownToast.message),
    name: "performSearch: unknown-only selection surfaces a visible validation failure naming the token (showToast 'error')",
    detail: JSON.stringify(recorder.toasts),
  });

  // ── FAIL-CLOSED: mixed known + unknown → whole selection rejected, NO request.
  performSearchWith({ searchTab: 'sale', statuses: ['ACTIVE', 'NotAStatus'] });
  results.push({
    pass: recorder.searchCalls.length === 0
      && recorder.toasts.some((t) => t.type === 'error' && t.message.indexOf('NotAStatus') !== -1),
    name: 'performSearch: mixed known+unknown selection is rejected whole — NO request, validation toast (never a partial/broader query)',
    detail: JSON.stringify({ searchCalls: recorder.searchCalls, toasts: recorder.toasts }),
  });

  // ── Empty selection is intentional: filter omitted, request proceeds.
  performSearchWith({ searchTab: 'sale' });
  results.push({
    pass: recorder.searchCalls.length === 1
      && !('status' in recorder.searchCalls[0]),
    name: 'performSearch: no status selected → request proceeds with status filter intentionally omitted',
    detail: JSON.stringify(recorder.searchCalls),
  });

  // ── Valid Pending-family selection → request carries deduped status=Pending.
  performSearchWith({ searchTab: 'sale', statuses: ['Offer', 'ContractSigned', 'BoardApproved', 'PENDING'] });
  results.push({
    pass: recorder.searchCalls.length === 1
      && recorder.searchCalls[0].status === 'Pending',
    name: "performSearch: valid Pending-family selection → one request with status='Pending' (deduped)",
    detail: JSON.stringify(recorder.searchCalls),
  });

  // ── BROADENING GUARD at the param-builder boundary: when statuses were
  //    selected, no params can ever be produced without the status param —
  //    an invalid selection throws instead of building broader params. This
  //    also covers programmatic callers (init-tracker.js) that bypass
  //    performSearch's pre-validation.
  let threw = false;
  let builtParams = null;
  try {
    builtParams = window.buildIdxSearchParams({ searchTab: 'sale', statuses: ['ACTIVE', 'NotAStatus'] });
  } catch (err) {
    threw = err.message.indexOf('NotAStatus') !== -1;
  }
  results.push({
    pass: threw && builtParams === null,
    name: 'buildIdxSearchParams: invalid status selection throws (fail-closed) — cannot build params that silently drop the status filter',
    detail: threw ? undefined : `no throw; params=${JSON.stringify(builtParams)}`,
  });

  const validParams = window.buildIdxSearchParams({ searchTab: 'sale', statuses: ['PENDING'] });
  results.push({
    pass: validParams && validParams.status === 'Pending',
    name: "buildIdxSearchParams: valid selection still emits status='Pending'",
    detail: JSON.stringify(validParams),
  });
}

function run() {
  const results = [];
  runMapperCases(results);
  runCallerCases(results);
  return results;
}

module.exports = { run };
