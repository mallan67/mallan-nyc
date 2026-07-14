/**
 * Behavior tests for scripts/validate-cotality-cadence.js (COT-1).
 * Uses Node's built-in test runner (no jest/ts-jest dependency):
 *   node --test scripts/__tests__/validate-cotality-cadence.test.cjs
 *
 * Each case builds a temporary filesystem root with a canonical json + vercel.json
 * (+ optional docs), then calls validate(root). No production files are touched.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validate } = require('../validate-cotality-cadence.js');

const BASE_FACTS = {
  cotality_property_refresh_target_minutes: 5,
  cotality_image_refresh_target_minutes: 15,
  mallan_property_poll_minutes: 5,
  mallan_media_poll_minutes: 15,
  trestle_account_request_quota_per_hour: 40000,
  property_run_warning_minutes: 15, property_run_critical_minutes: 30,
  media_run_warning_minutes: 30, media_run_critical_minutes: 45,
  property_cursor_warning_minutes: 15, property_cursor_critical_minutes: 30,
  media_cursor_warning_minutes: 45, media_cursor_critical_minutes: 90,
  delta_only: true, paginate_on_demand: true, backoff_on_429: 'exponential',
  no_overlap: true, suppress_noop_writes_before_cadence: true,
  cotality_cadence_enforcement: 'planned',
  expected_property_cron: '*/5 * * * *', expected_media_cron: '*/15 * * * *',
};

/** Build a temp root. opts: {facts?, propCron, mediaCron, docs?: {relpath: content}} */
function mkRoot(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cot1-'));
  const facts = Object.assign({}, BASE_FACTS, opts.facts || {});
  fs.mkdirSync(path.join(root, 'lib', 'cotality'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib/cotality/sync-standard.json'), JSON.stringify(facts, null, 2));
  const crons = [
    { path: '/api/cron/idx-sync', schedule: opts.propCron || '*/5 * * * *' },
    { path: '/api/cron/media-sync', schedule: opts.mediaCron || '*/15 * * * *' },
  ];
  fs.writeFileSync(path.join(root, 'vercel.json'), JSON.stringify({ crons: crons.map((c) => ({ path: c.path, schedule: c.schedule })) }));
  // vercel.json regex expects `"path", "schedule": "..."` shape — write it literally:
  fs.writeFileSync(path.join(root, 'vercel.json'),
    `{ "crons": [ { "path": "/api/cron/idx-sync", "schedule": "${opts.propCron || '*/5 * * * *'}" }, { "path": "/api/cron/media-sync", "schedule": "${opts.mediaCron || '*/15 * * * *'}" } ] }`);
  for (const [rel, content] of Object.entries(opts.docs || {})) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test('1. planned + current */30/hourly drift: reports drift, exit 0 (no failures)', () => {
  const { failures, reported } = validate(mkRoot({ propCron: '*/30 * * * *', mediaCron: '0 * * * *' }));
  assert.equal(failures.length, 0, 'should not hard-fail while planned: ' + failures.join('; '));
  assert.ok(reported.length >= 1, 'should report the cadence drift');
});

test('2. enforced + wrong schedules: hard-fails (nonzero)', () => {
  const { failures } = validate(mkRoot({ facts: { cotality_cadence_enforcement: 'enforced' }, propCron: '*/30 * * * *', mediaCron: '0 * * * *' }));
  assert.ok(failures.some((f) => /cadence drift/.test(f)), 'enforced mode must fail on cadence drift');
});

test('3. incorrect canonical constants: hard-fails', () => {
  const bad = validate(mkRoot({ facts: { cotality_property_refresh_target_minutes: 10, mallan_property_poll_minutes: 30 } }));
  assert.ok(bad.failures.some((f) => /refresh target must be 5/i.test(f)));
  assert.ok(bad.failures.some((f) => /poll must be 5/i.test(f)));
});

test('4. refresh/poll conflation in a current-facing doc: hard-fails', () => {
  const { failures } = validate(mkRoot({
    docs: { 'NEON.md': 'Sync notes\nPolling every 5 minutes meets Cotality’s 5-minute freshness.\n' },
  }));
  assert.ok(failures.some((f) => /conflation/.test(f)), 'must flag refresh/poll conflation');
});

test('5. historical incident wording is ignored (not on the allowlist)', () => {
  const { failures } = validate(mkRoot({
    // A historical file with the exact banned wording, but NOT a current-facing doc.
    docs: { 'docs/audits/old-incident-2026-07-07.md': 'The */30 Property cadence was the approved Cotality-aligned standard.\n' },
  }));
  assert.equal(failures.length, 0, 'historical records must not be scanned: ' + failures.join('; '));
});

test('6. enforced + Property */5 and Media */15: exit 0', () => {
  const { failures, reported } = validate(mkRoot({ facts: { cotality_cadence_enforcement: 'enforced' }, propCron: '*/5 * * * *', mediaCron: '*/15 * * * *' }));
  assert.equal(failures.length, 0, 'aligned schedules must pass in enforced mode: ' + failures.join('; '));
  assert.equal(reported.length, 0, 'no drift to report when aligned');
});
