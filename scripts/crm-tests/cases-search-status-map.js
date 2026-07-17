// scripts/crm-tests/cases-search-status-map.js
//
// Regression lock for public/crm/js/search/search-status-map.js — the single
// source that maps CRM search status tokens (top-level + MlsStatus sub-statuses)
// to the live Trestle StandardStatus the query actually filters on.
//
// Why this file exists: the prior inline map in search-engine.js sent the
// "Pending" family to StandardStatus 'ActiveUnderContract', which the REBNY IDX
// Plus feed never populates (verified live 2026-07-05: ActiveUnderContract=0,
// Pending=6,455). Agents searching in-contract inventory therefore got 0 results.
// These cases fail red if the in-contract family ever regresses away from
// StandardStatus 'Pending', or if a sub-status stops collapsing to its parent.

const path = require('path');

const MAP_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'public',
  'crm',
  'js',
  'search',
  'search-status-map.js'
);

function run() {
  const results = [];
  let SearchStatusMap;
  try {
    SearchStatusMap = require(MAP_PATH);
  } catch (err) {
    return [{ pass: false, name: 'search-status-map.js loads via CommonJS', detail: err.message }];
  }
  const map = SearchStatusMap.mapSearchStatusToStandardStatus;
  const mapList = SearchStatusMap.mapSearchStatusesToStandardStatuses;

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

  // ── List mapper dedupes a mixed Pending selection down to a single 'Pending'.
  const deduped = mapList(['Offer', 'ContractSigned', 'BoardApproved', 'PENDING']);
  results.push({
    pass: Array.isArray(deduped) && deduped.length === 1 && deduped[0] === 'Pending',
    name: "mixed Pending-family selection dedupes to ['Pending']",
    detail: JSON.stringify(deduped),
  });

  // ── Unknown tokens are dropped (a bad OData StandardStatus risks HTTP 400).
  results.push({
    pass: map('NotAStatus') === null && mapList(['NotAStatus']).length === 0,
    name: 'unknown status token is dropped, not passed through',
  });

  return results;
}

module.exports = { run };
