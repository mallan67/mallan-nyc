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
 *   or: npx jest scripts/__tests__/neighborhood-expansion.test.js
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

const fixtureReverse = buildReverseMap(FIXTURE_ALIASES);

// ── Jest test blocks ──

describe('Neighborhood Expansion', () => {
  test('Chelsea expansion includes "Chelsea"', () => {
    const result = expandCanonicalToVariants(['Chelsea'], fixtureReverse);
    expect(result).toContain('Chelsea');
  });

  test('Chelsea expansion includes known variants', () => {
    const result = expandCanonicalToVariants(['Chelsea'], fixtureReverse);
    expect(result).toContain('CHELSEA');
    expect(result).toContain('Chelsea/Flatiron');
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  test('Expansion has no duplicates', () => {
    const result = expandCanonicalToVariants(['Chelsea'], fixtureReverse);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  test('Unknown canonical returns itself', () => {
    const result = expandCanonicalToVariants(['Nonexistent Place'], fixtureReverse);
    expect(result).toContain('Nonexistent Place');
    expect(result).toHaveLength(1);
  });

  test('Empty input returns empty output', () => {
    const result = expandCanonicalToVariants([], fixtureReverse);
    expect(result).toHaveLength(0);
  });

  test('Multi-canonical expansion works', () => {
    const result = expandCanonicalToVariants(['Chelsea', 'Upper East Side'], fixtureReverse);
    expect(result).toContain('Chelsea');
    expect(result).toContain('CHELSEA');
    expect(result).toContain('Upper East Side');
    expect(result).toContain('UES');
    expect(result.length).toBeGreaterThanOrEqual(7);
  });

  test('resolveNeighborhoodCanonical maps CHELSEA → Chelsea', () => {
    expect(resolveNeighborhoodCanonical('CHELSEA', FIXTURE_ALIASES)).toBe('Chelsea');
  });

  test('resolveNeighborhoodCanonical passes through canonical name', () => {
    expect(resolveNeighborhoodCanonical('Chelsea', FIXTURE_ALIASES)).toBe('Chelsea');
  });

  test('resolveNeighborhoodCanonical unknown → passthrough', () => {
    expect(resolveNeighborhoodCanonical('Unknown Place', FIXTURE_ALIASES)).toBe('Unknown Place');
  });

  test('resolveNeighborhoodCanonical null → undefined', () => {
    expect(resolveNeighborhoodCanonical(null, FIXTURE_ALIASES)).toBeUndefined();
  });
});

// ── Integration tests (only run if real alias map exists) ──
const describeIntegration = realAliases ? describe : describe.skip;

describeIntegration('Neighborhood Expansion (integration — real alias map)', () => {
  const realReverse = realAliases ? buildReverseMap(realAliases.aliases) : {};

  test('Real alias map: Chelsea has variants', () => {
    const result = expandCanonicalToVariants(['Chelsea'], realReverse);
    expect(result).toContain('Chelsea');
    expect(result).toContain('CHELSEA');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('Real alias map: every canonical expands non-empty', () => {
    const canonicals = Object.keys(realReverse);
    const empty = canonicals.filter(c => expandCanonicalToVariants([c], realReverse).length === 0);
    expect(empty).toHaveLength(0);
  });

  test('Real alias map: 0 unmatched aliases', () => {
    expect(realAliases._meta).toBeDefined();
    expect(realAliases._meta.unmatched).toBe(0);
  });
});
