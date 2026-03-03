#!/usr/bin/env node
'use strict';

/**
 * neighborhood-expansion.test.js — Unit tests for canonical→variant expansion
 *
 * Proves:
 *   1. expandCanonicalToVariants(["Chelsea"]) contains "Chelsea"
 *   2. It contains at least one known variant (CHELSEA, Chelsea/Flatiron)
 *   3. No duplicates in output
 *   4. Unknown canonical returns itself (fail-safe, non-empty)
 *   5. Empty input returns empty output
 *   6. NeighborhoodCanonical resolve returns correct mapping
 *
 * Uses embedded fixture for stability across alias regenerations.
 * Run: node scripts/__tests__/neighborhood-expansion.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// ── Load real alias map (for integration assertions) ──
const ALIAS_PATH = path.join(__dirname, '..', '..', 'data', 'rls', 'geo', 'neighborhood-aliases.json');
let realAliases = null;
if (fs.existsSync(ALIAS_PATH)) {
  realAliases = JSON.parse(fs.readFileSync(ALIAS_PATH, 'utf8'));
}

// ── Embedded fixture (deterministic — survives alias regeneration) ──
const FIXTURE_ALIASES = {
  'CHELSEA': 'Chelsea',
  'Chelsea / Flatiron': 'Chelsea',
  'Chelsea/Flatiron': 'Chelsea',
  'UES': 'Upper East Side',
  'UPEAST': 'Upper East Side',
  'UPPER EAST SIDE': 'Upper East Side',
  'FiDi': 'Financial District',
  'FIDI': 'Financial District',
  'FINLDIST': 'Financial District',
};

// ── Build reverse map (canonical → [variants]) ──
function buildReverseMap(aliases) {
  const reverse = {};
  for (const [variant, canonical] of Object.entries(aliases)) {
    if (!reverse[canonical]) reverse[canonical] = [];
    reverse[canonical].push(variant);
  }
  return reverse;
}

// ── expandCanonicalToVariants (mirrors search-engine.js logic) ──
function expandCanonicalToVariants(canonicalNames, reverseMap) {
  if (!reverseMap || !canonicalNames) return canonicalNames;
  const expanded = [];
  canonicalNames.forEach(function (name) {
    expanded.push(name);
    if (reverseMap[name]) {
      reverseMap[name].forEach(function (v) { expanded.push(v); });
    }
  });
  return expanded;
}

// ── resolveNeighborhoodCanonical (mirrors mock-data.js logic) ──
function resolveNeighborhoodCanonical(neighborhood, aliasMap) {
  if (!neighborhood) return undefined;
  if (!aliasMap) return neighborhood;
  return aliasMap[neighborhood] || neighborhood;
}

// ── Test runner ──
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL  ' + name);
    console.log('        ' + e.message);
  }
}

console.log('\n=== Neighborhood Expansion Tests ===\n');

const fixtureReverse = buildReverseMap(FIXTURE_ALIASES);

// ── 1. Canonical included in output ──
test('Chelsea expansion includes "Chelsea"', function () {
  const result = expandCanonicalToVariants(['Chelsea'], fixtureReverse);
  assert.ok(result.includes('Chelsea'), 'Must include canonical "Chelsea"');
});

// ── 2. At least one known variant ──
test('Chelsea expansion includes known variants', function () {
  const result = expandCanonicalToVariants(['Chelsea'], fixtureReverse);
  assert.ok(result.includes('CHELSEA'), 'Must include variant "CHELSEA"');
  assert.ok(result.includes('Chelsea/Flatiron'), 'Must include variant "Chelsea/Flatiron"');
  assert.ok(result.length >= 4, 'Expected at least 4 (canonical + 3 variants), got ' + result.length);
});

// ── 3. No duplicates ──
test('Expansion has no duplicates', function () {
  const result = expandCanonicalToVariants(['Chelsea'], fixtureReverse);
  const unique = new Set(result);
  assert.strictEqual(unique.size, result.length, 'Duplicates found: ' + result.join(', '));
});

// ── 4. Unknown canonical returns itself (fail-safe) ──
test('Unknown canonical returns itself', function () {
  const result = expandCanonicalToVariants(['Nonexistent Place'], fixtureReverse);
  assert.ok(result.length > 0, 'Must not return empty');
  assert.ok(result.includes('Nonexistent Place'), 'Must contain the unknown name itself');
  assert.strictEqual(result.length, 1, 'Unknown should return exactly 1 element');
});

// ── 5. Empty input returns empty output ──
test('Empty input returns empty output', function () {
  const result = expandCanonicalToVariants([], fixtureReverse);
  assert.strictEqual(result.length, 0, 'Expected empty, got ' + result.length);
});

// ── 6. Multi-canonical expansion ──
test('Multi-canonical expansion works', function () {
  const result = expandCanonicalToVariants(['Chelsea', 'Upper East Side'], fixtureReverse);
  assert.ok(result.includes('Chelsea'), 'Must include Chelsea');
  assert.ok(result.includes('CHELSEA'), 'Must include CHELSEA variant');
  assert.ok(result.includes('Upper East Side'), 'Must include Upper East Side');
  assert.ok(result.includes('UES'), 'Must include UES variant');
  assert.ok(result.length >= 7, 'Expected >= 7, got ' + result.length);
});

// ── 7. resolveNeighborhoodCanonical: known variant ──
test('resolveNeighborhoodCanonical maps CHELSEA → Chelsea', function () {
  const result = resolveNeighborhoodCanonical('CHELSEA', FIXTURE_ALIASES);
  assert.strictEqual(result, 'Chelsea');
});

// ── 8. resolveNeighborhoodCanonical: identity for canonical ──
test('resolveNeighborhoodCanonical passes through canonical name', function () {
  const result = resolveNeighborhoodCanonical('Chelsea', FIXTURE_ALIASES);
  // Chelsea is not in fixture aliases as a key (only CHELSEA is), so passthrough
  assert.strictEqual(result, 'Chelsea');
});

// ── 9. resolveNeighborhoodCanonical: unknown → passthrough ──
test('resolveNeighborhoodCanonical unknown → passthrough', function () {
  const result = resolveNeighborhoodCanonical('Unknown Place', FIXTURE_ALIASES);
  assert.strictEqual(result, 'Unknown Place');
});

// ── 10. resolveNeighborhoodCanonical: null input ──
test('resolveNeighborhoodCanonical null → undefined', function () {
  const result = resolveNeighborhoodCanonical(null, FIXTURE_ALIASES);
  assert.strictEqual(result, undefined);
});

// ── Integration: real alias map (if available) ──
if (realAliases) {
  const realReverse = buildReverseMap(realAliases.aliases);

  test('[integration] Real alias map: Chelsea has variants', function () {
    const result = expandCanonicalToVariants(['Chelsea'], realReverse);
    assert.ok(result.includes('Chelsea'), 'Must include canonical');
    assert.ok(result.includes('CHELSEA'), 'Must include CHELSEA from real map');
    assert.ok(result.length >= 2, 'Expected >= 2 with real aliases');
  });

  test('[integration] Real alias map: every canonical expands non-empty', function () {
    const canonicals = Object.keys(realReverse);
    const empty = canonicals.filter(function (c) {
      const result = expandCanonicalToVariants([c], realReverse);
      return result.length === 0;
    });
    assert.strictEqual(empty.length, 0, 'Empty expansions for: ' + empty.join(', '));
  });

  test('[integration] Real alias map: 0 unmatched aliases', function () {
    assert.ok(realAliases._meta, 'Alias file must have _meta');
    assert.strictEqual(realAliases._meta.unmatched, 0, 'Expected 0 unmatched, got ' + realAliases._meta.unmatched);
  });
} else {
  console.log('\n  SKIP  [integration] Real alias map not found at ' + ALIAS_PATH);
}

// ── Summary ──
console.log('\n--- ' + passed + ' passed, ' + failed + ' failed ---\n');
process.exit(failed > 0 ? 1 : 0);
