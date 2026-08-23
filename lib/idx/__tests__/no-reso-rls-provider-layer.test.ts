/// <reference types="jest" />
/**
 * THE PROVIDER LAYER SPEAKS ONLY COTALITY.
 *
 * Cotality is the provider. There is no RESO abstraction and no RLS abstraction
 * between the Cotality API and Mallan:
 *
 *   COTALITY RAW CONTRACT -> VERIFIED COTALITY MAPPING -> MALLAN CANONICAL
 *   STORAGE -> MALLAN BUSINESS/COMPLIANCE RULES -> SEARCH / CMA / CRM / REPORTS
 *
 * REBNY/RLS is a Mallan COMPLIANCE layer that lives far downstream. It can never
 * define, interpret, supplement, substitute or "correct" a Cotality field.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXISTS
 *
 * The contamination kept coming back, and it was never only naming. A table
 * called RESO_TO_RLS_RENAMES copied one real Cotality field's value into a
 * DIFFERENT real Cotality field's name — verified against live $metadata, 13 of
 * its 19 pairs had both names declared as separate Cotality fields, and one had
 * neither declared at all. `MlsStatus -> StandardStatus` wrote a 25-member
 * vocabulary into an 11-member field. That is a data defect wearing a naming
 * problem's clothes.
 *
 * TWO SURVIVOR CLASSES ARE LEGITIMATE and are NOT matched by this test:
 *
 *   A. REBNY/RLS COMPLIANCE terminology — `rls_eligible`, `rls-enforcement`,
 *      RLS audience scoping, attribution and UCBA obligations. Mallan business
 *      and compliance concepts, downstream of ingestion.
 *   B. OPAQUE RAW PROVIDER VALUES — Cotality genuinely returns
 *      `OriginatingSystemName: "RLS"`, and its errors quote `'RLS'` verbatim.
 *      Those are evidence and must stay byte-for-byte.
 *
 * What must never come back is a Mallan PROVIDER-ARCHITECTURE concept built on
 * those words: an "RLS provider", an "RLS API", an "RLS-owned listing", an "RLS
 * field map", or a RESO translation layer.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

/** Provider-boundary trees. Compliance modules are deliberately absent. */
const PROVIDER_DIRS = [
  'lib/idx',
  'lib/search/canonical',
  'lib/cotality',
  'scripts/cotality',
];

/**
 * Symbols and phrases that can only mean a Mallan provider-architecture concept.
 *
 * Deliberately NOT matched: the bare words RESO and RLS. They appear
 * legitimately in compliance references and in raw provider values, and a blunt
 * word match would force those to be mangled — which is how a guard starts
 * doing damage instead of preventing it.
 */
const FORBIDDEN = [
  /RESO_TO_RLS/,
  /RESO_FIELDS/,
  /\bmapRESO/,
  /validateRESOResponse/,
  /ALL_RLS_FIELDS/,
  /REQUIRED_RLS_FIELDS/,
  /RLS field map/i,
  /\bRLS categor/i,
  /RLS-owned/i,
  /Cotality\s*\/\s*RLS/i,
  /RLS\s*\/\s*Cotality/i,
  /RESO-to-RLS/i,
  /RESO Data Dictionary/i,
  /RESO-like/i,
  /RESO-shaped/i,
  /\bRLS API\b/i,
  /\bRLS provider\b/i,
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mts|mjs|js)$/.test(p)) out.push(p);
  }
  return out;
}

const files = PROVIDER_DIRS.flatMap((d) => walk(join(REPO, d)))
  // This guard and the boundary test name the forbidden strings in order to
  // forbid them.
  .filter((f) => !/no-reso-rls-provider-layer|cotality-provider-boundary/.test(f));

describe('no RESO or RLS provider-architecture layer survives', () => {
  it('scans a non-trivial number of provider files', () => {
    // A guard that silently scanned nothing would pass forever.
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN.map((r) => [r.source, r] as const))(
    'no provider file contains %s',
    (_label, pattern) => {
      const offenders: string[] = [];
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        // Executable and documentary lines both count: a comment describing the
        // provider as "RLS" is how the wrong mental model propagates.
        if (pattern.test(src)) offenders.push(f.replace(REPO, '').split(String.fromCharCode(92)).join('/'));
      }
      expect(offenders).toEqual([]);
    },
  );
});

describe('legitimate survivors are NOT collateral damage', () => {
  it('leaves the compliance layer alone', () => {
    // rls-enforcement.ts is Mallan compliance, downstream of ingestion. It is
    // outside the provider dirs and must keep its RLS vocabulary.
    const p = join(REPO, 'lib/compliance/rls-enforcement.ts');
    expect(readFileSync(p, 'utf8')).toMatch(/RLS/);
  });

  it('leaves raw provider values verbatim', () => {
    // Cotality itself returns OriginatingSystemName: "RLS". The registry quotes
    // that observation and must go on quoting it exactly.
    const p = join(REPO, 'lib/search/canonical/field-registry.ts');
    expect(readFileSync(p, 'utf8')).toMatch(/OriginatingSystemName value = "RLS"/);
  });
});
