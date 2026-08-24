'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const BOUNDARY_PATH = path.join(ROOT, 'public', 'crm', 'js', 'search', 'cotality-criteria-boundary.js');
const BUILT_PATH = path.join(ROOT, 'public', 'crm', 'index-built.html');

function executeBoundary() {
  const source = fs.readFileSync(BOUNDARY_PATH, 'utf8');
  const seen = [];
  const window = {
    // Deliberately models the underlying serializer regression that originally
    // computed statuses without putting them on the wire. The Cotality boundary
    // must still make the final browser request exact and fail-closed.
    buildIdxSearchParams(criteria) {
      seen.push(criteria);
      return { type: 'sale' };
    },
  };
  const document = {
    readyState: 'complete',
    querySelectorAll() { return []; },
    addEventListener() {},
  };

  vm.runInNewContext(source, { window, document, console }, { filename: BOUNDARY_PATH });
  return { window, seen };
}

function result(name, fn) {
  try {
    fn();
    return { pass: true, name };
  } catch (err) {
    return { pass: false, name, detail: err instanceof Error ? err.message : String(err) };
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run() {
  return [
    result('Expired UI criterion reaches wire as exact status=Expired', () => {
      const { window, seen } = executeBoundary();
      const params = window.buildIdxSearchParams({ statuses: ['Expired'] });
      assertEqual(params.status, 'Expired', 'wire status');
      assertEqual(seen[0].statuses[0], 'Expired', 'underlying serializer input');
    }),

    result('legacy uppercase EXPIRED is migrated once at browser boundary', () => {
      const { window } = executeBoundary();
      const params = window.buildIdxSearchParams({ statuses: ['EXPIRED'] });
      assertEqual(params.status, 'Expired', 'wire status');
    }),

    result('multiple exact lifecycle statuses survive browser serialization', () => {
      const { window } = executeBoundary();
      const params = window.buildIdxSearchParams({ statuses: ['Expired', 'Hold', 'Withdrawn', 'Canceled'] });
      assertEqual(params.status, 'Expired,Hold,Withdrawn,Canceled', 'wire statuses');
    }),

    result('duplicate statuses are deduplicated before provider request', () => {
      const { window } = executeBoundary();
      const params = window.buildIdxSearchParams({ statuses: ['Expired', 'Expired', 'Hold'] });
      assertEqual(params.status, 'Expired,Hold', 'wire statuses');
    }),

    result('no selected status leaves status absent so server default remains explicit', () => {
      const { window } = executeBoundary();
      const params = window.buildIdxSearchParams({ statuses: [] });
      assertEqual(Object.prototype.hasOwnProperty.call(params, 'status'), false, 'status property present');
    }),

    result('unsupported Future fails closed instead of widening the search', () => {
      const { window } = executeBoundary();
      let thrown = null;
      try {
        window.buildIdxSearchParams({ statuses: ['Future'] });
      } catch (err) {
        thrown = err;
      }
      if (!thrown) throw new Error('expected unsupported status to throw');
      assertEqual(thrown.code, 'UNSUPPORTED_CRITERION', 'error code');
      assertEqual(thrown.criterion, 'status', 'error criterion');
    }),

    result('generated CRM bundle includes status boundary after serializer', () => {
      const built = fs.readFileSync(BUILT_PATH, 'utf8');
      const serializer = built.indexOf('window.buildIdxSearchParams = function(criteria)');
      const boundary = built.indexOf('function installCotalityCriteriaBoundary()');
      if (serializer < 0) throw new Error('generated bundle is missing buildIdxSearchParams serializer');
      if (boundary < 0) throw new Error('generated bundle is missing Cotality status boundary');
      if (boundary <= serializer) throw new Error('Cotality status boundary loads before serializer and cannot wrap it');
    }),
  ];
}

module.exports = { run };
