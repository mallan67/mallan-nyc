#!/usr/bin/env node
// scripts/crm-test-runner.js
//
// Top-level CRM test runner. Replaces the deleted
// public/crm/tests/05-test-suite-runner.js (removed in commit a0e00f03,
// 2026-03-24, but the npm script reference was left orphaned).
//
// Aggregates:
//   - description-compliance pattern coverage cases (pure regex)
//   - form-validator JSDOM cases (loads validators 19/20/21/22 into a
//     synthetic DOM and exercises the public surface)
//   - authenticated Search status browser-to-wire transport cases
//   - fixture-loader sanity (confirms the 126-listing dataset still loads)
//
// Exits 0 on all-pass, 1 on any failure. Used as a CI gate
// (`npm run crm:test`) to detect silent regressions in the in-tree
// validators that gate Fair Housing + UCBA description compliance on the
// listing forms, plus authenticated CRM Search criteria transport.

const descCompliance = require('./crm-tests/cases-description-compliance');
const formValidators = require('./crm-tests/cases-form-validators');
const statusTransport = require('./crm-tests/cases-status-transport');
const { loadFixtures } = require('./crm-tests/fixtures');

function colorize(text, code) {
  return process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function runFixturesCheck() {
  try {
    const fixtures = loadFixtures();
    if (!Array.isArray(fixtures) || fixtures.length < 120) {
      return [{
        pass: false,
        name: `fixture count >= 120 (got ${fixtures?.length ?? 0})`,
      }];
    }
    return [{ pass: true, name: `fixture loader returned ${fixtures.length} listings` }];
  } catch (err) {
    return [{ pass: false, name: 'fixture loader bootstraps', detail: err.message }];
  }
}

function main() {
  const all = [
    ...runFixturesCheck().map((r) => ({ ...r, suite: 'fixtures' })),
    ...descCompliance.run().map((r) => ({ ...r, suite: 'description-compliance' })),
    ...formValidators.run().map((r) => ({ ...r, suite: 'form-validators' })),
    ...statusTransport.run().map((r) => ({ ...r, suite: 'status-transport' })),
  ];

  const passed = all.filter((r) => r.pass).length;
  const failed = all.length - passed;

  console.log('\n── CRM Test Runner ──────────────────────────────────────────');
  for (const r of all) {
    const tag = r.pass ? colorize('PASS', '32') : colorize('FAIL', '31');
    console.log(`  ${tag}  [${r.suite}] ${r.name}${r.detail ? `\n        → ${r.detail}` : ''}`);
  }
  console.log(`\nResult: ${passed}/${all.length} passed (${failed} failed)\n`);

  if (failed > 0) process.exit(1);
}

main();
