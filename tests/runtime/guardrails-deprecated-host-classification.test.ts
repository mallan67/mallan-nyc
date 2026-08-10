/**
 * GUARDRAIL CLASSIFICATION DEFECT — deprecated CoreLogic host scan.
 *
 * `scripts/ci/guardrails.mjs` blocks deprecated Trestle/CoreLogic hostnames in
 * source (old URLs ceased functioning 2026-03-31). Its own comment declares the
 * exemption policy:
 *
 *   "Files that legitimately reference deprecated hosts as data, not as runtime
 *    targets. Test fixtures verify the proxy/resolver continues to handle the
 *    legacy URLs correctly during the 2026 warranty period; the proxy route
 *    itself maintains the allowlist; the DTO modules carry historical comments."
 *
 * But `hostScanExcludes` recognised only `/__tests__\//`. A legitimate fixture
 * under `tests/runtime/` was therefore still blocked:
 *
 *   tests/runtime/detail-double-proxy-regression.test.ts pins the PRODUCTION
 *   media allowlist, so it must name the warranty-era hosts →
 *   "2 error(s) found. CI BLOCKED."
 *
 * Documented intent and implementation disagreed. That is the defect.
 *
 * REJECTED ALTERNATIVE: assembling the hostnames from string pieces so the
 * lexical scanner cannot see them. That hides a forbidden string instead of
 * reconciling the scanner with its stated intent — coding AROUND a guardrail.
 * It was implemented, then deliberately reverted.
 *
 * These tests pin the classification so the protection cannot be quietly
 * widened into "ignore all tests" or narrowed back into a false block.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const GUARDRAILS = path.join(ROOT, 'scripts/ci/guardrails.mjs');
const src = fs.readFileSync(GUARDRAILS, 'utf8');

/**
 * Rebuild the scanner's classifier from its own source so these tests exercise
 * the REAL patterns. If `hostScanExcludes` is edited, this test reads the edit —
 * it cannot drift into asserting a private copy of the rules.
 */
function loadExcludes(): RegExp[] {
  const block = src.match(/const hostScanExcludes = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error('hostScanExcludes not found in guardrails.mjs');
  const out: RegExp[] = [];
  for (const rawLine of block[1].split('\n')) {
    const line = rawLine.trim();
    // Skip comment lines — they contain slashes (paths, URLs) that would
    // otherwise be mis-parsed as regex literals.
    if (!line || line.startsWith('//')) continue;
    const m = line.match(/^\/((?:\\.|\[[^\]]*\]|[^/\\])+)\/([gimsuy]*),?$/);
    if (m) out.push(new RegExp(m[1], m[2]));
  }
  if (out.length === 0) throw new Error('no exclude patterns parsed');
  return out;
}

const excludes = loadExcludes();
const isExempt = (file: string) => excludes.some((re) => re.test(file));

describe('deprecated-host scan: exemption classification', () => {
  it('1. an app/runtime file is NOT exempt (api-trestle host would FAIL)', () => {
    expect(isExempt('app/api/listings/route.ts')).toBe(false);
    expect(isExempt('app/listing/[...slug]/page.tsx')).toBe(false);
  });

  it('2. a lib runtime file is NOT exempt (api-prod host would FAIL)', () => {
    expect(isExempt('lib/idx/sync.ts')).toBe(false);
    expect(isExempt('lib/idx/fetch.ts')).toBe(false);
  });

  it('3. a random script/config is NOT exempt', () => {
    expect(isExempt('scripts/some-migration.ts')).toBe(false);
    expect(isExempt('next.config.ts')).toBe(false);
    expect(isExempt('lib/config/hosts.json')).toBe(false);
  });

  it('4. a legitimate regression test fixture IS exempt', () => {
    // The file that exposed the defect.
    expect(isExempt('tests/runtime/detail-double-proxy-regression.test.ts')).toBe(true);
    // And the classification is general, not a one-file special case.
    expect(isExempt('tests/runtime/anything.test.ts')).toBe(true);
    expect(isExempt('tests/unit/media.spec.tsx')).toBe(true);
    expect(isExempt('lib/idx/__tests__/mapping.test.ts')).toBe(true);
  });

  it('5. the production media-proxy allowlist IS exempt (warranty hosts)', () => {
    expect(isExempt('app/api/media/proxy/route.ts')).toBe(true);
    expect(isExempt('lib/media/proxy-url-policy.ts')).toBe(true);
  });

  it('6. the canonical Cotality host is not a deprecated host at all', () => {
    const block = src.match(/const DEPRECATED_HOSTS = \[([\s\S]*?)\];/);
    expect(block).toBeTruthy();
    expect(block![1]).not.toContain('api.cotality.com');
  });
});

describe('the exemption is NARROW — protection is not weakened', () => {
  it('does NOT exempt every file under tests/', () => {
    // Non-test files under tests/ are still scanned.
    expect(isExempt('tests/helpers/build-fixture.ts')).toBe(false);
    expect(isExempt('tests/runtime/setup.ts')).toBe(false);
    expect(isExempt('tests/fixtures/hosts.json')).toBe(false);
  });

  it('does NOT exempt a file merely because its name contains "test"', () => {
    expect(isExempt('lib/idx/test-helper.ts')).toBe(false);
    expect(isExempt('app/latest/page.tsx')).toBe(false);
  });

  it('still lists both deprecated CoreLogic hosts as blocked', () => {
    const block = src.match(/const DEPRECATED_HOSTS = \[([\s\S]*?)\];/);
    expect(block![1]).toContain('api-trestle.corelogic.com');
    expect(block![1]).toContain('api-prod.corelogic.com');
  });
});
