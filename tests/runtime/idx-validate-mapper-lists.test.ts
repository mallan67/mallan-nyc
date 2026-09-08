/**
 * scripts/idx-validate.js must read the mapper's field lists in their compile-checked form.
 *
 * Regression (2026-09-08): lib/idx/trestle-mapper.ts wraps every B<n> list in
 * `cotalityFields('Property', [...])` so the compiler proves each name live. The validator's
 * extractor only matched the bare `const B1_ADDRESS = [...]` form, so it read ZERO mapper fields and
 * reported 17 "Search-critical Property field is missing from mapper" criticals plus a false
 * "$select Field Completeness" failure — a validator regression, not a mapper one.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

describe('idx:validate reads the compile-checked mapper lists', () => {
  const run = spawnSync('node', ['scripts/idx-validate.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (run.stdout + '\n' + run.stderr).replace(/\x1b\[[0-9;]*m/g, '');

  it('reports no search-critical Property field as missing from the mapper', () => {
    expect(out).not.toContain('Search-critical Property field is missing from mapper');
  });

  it('section 1 ($select completeness) has zero failures', () => {
    const line = out.split('\n').find((l) => /\[\s*1\/\d+\]\s*\$select Field Completeness/.test(l)) || '';
    expect(line).toMatch(/\s0✗/);
  });

  it('the secrets scan does not mistake the generated contract’s sha256 fingerprints for API keys', () => {
    // lib/cotality/generated/contract.ts carries metadata/content sha256 digests (64 lowercase hex).
    // A digest is not a key; the 40+-char base64 heuristic must skip pure-hex sha256 values.
    expect(out).not.toMatch(/lib\/cotality\/generated\/contract\.ts: Potential hardcoded API key/);
  });

  it('idx:validate is at the CLAUDE.md baseline — 0 critical', () => {
    const total = out.split('\n').find((l) => /^\s*TOTAL:/.test(l)) || '';
    expect(total).toMatch(/\s0 critical/);
  });
});
