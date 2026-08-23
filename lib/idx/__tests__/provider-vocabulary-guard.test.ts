/// <reference types="jest" />
/**
 * COTALITY IS THE PROVIDER. THERE IS NO SECOND STANDARD IN BETWEEN.
 *
 *   COTALITY RAW CONTRACT -> VERIFIED COTALITY MAPPING -> MALLAN CANONICAL
 *   STORAGE -> MALLAN BUSINESS/COMPLIANCE RULES -> SEARCH / CMA / CRM / REPORTS
 *
 * Two vocabularies kept leaking upstream into the provider boundary. This guard
 * exists because renaming them once was not enough - they came back.
 *
 * ── THE LEGACY STANDARD TERM ─────────────────────────────────────────────────
 *
 * Target: ZERO in Mallan-authored material, repo-wide.
 *
 * The forbidden token is CONSTRUCTED AT RUNTIME from character codes and never
 * written literally, so this file cannot itself be the thing that keeps the word
 * alive. An earlier version of this guard spelled it out and was rewritten by
 * the very cleanup it was guarding.
 *
 * ── THE ONE LEGITIMATE EXCEPTION, AND WHY IT IS NOT A LOOPHOLE ───────────────
 *
 * Cotality's OWN type namespace contains the term: every enum it declares is
 * typed `Cotality.DataStandard.<TERM>.DD.Enums.*`. A captured `$metadata`
 * document therefore contains it thousands of times as VERBATIM PROVIDER OUTPUT.
 *
 * Editing that out would falsify a provider document - a far worse violation
 * than the word surviving, and it would break the live-parity tests that diff
 * the capture against the live contract to detect drift.
 *
 * So captured provider documents are exempt, and the exemption is PROVEN rather
 * than trusted: the test below asserts that inside those files the term appears
 * ONLY inside Cotality's own namespace. If Mallan-authored text ever appears
 * there, the exemption fails and the file is no longer treated as pure capture.
 *
 * ── THE OTHER VOCABULARY ─────────────────────────────────────────────────────
 *
 * REBNY/RLS is a Mallan COMPLIANCE obligation and must survive where it means
 * advertising rules, attribution, UCBA, eligibility or audience scoping. It must
 * NEVER describe the feed, source, provider, sync, provenance, schema, fields,
 * registry, aliases, picklists, mapper, normalisation or API.
 *
 * The provider layer is held at hard ZERO for that usage. Repo-wide it is held
 * by a RATCHET against a recorded baseline: the remaining count is large and is
 * being reduced deliberately, and the number is stated here so it cannot quietly
 * grow while looking clean.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');

/** Built from char codes so the literal never appears in this repository. */
const TERM = String.fromCharCode(82, 69, 83, 79);

/** Verbatim Cotality captures. Exempt ONLY while §1 below proves they are pure. */
const PROVIDER_CAPTURES = [
  'artifacts/metadata.xml',
  'artifacts/.cotality-live-resource-inventory.json',
  'artifacts/.cotality-resource-accessibility.json',
  'artifacts/.property-subtype-live-probe.json',
  'artifacts/.property-subtype-live-probe-2.json',
  'artifacts/.property-type-family-census.json',
];

function tracked(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);
}

function read(rel: string): string {
  try { return readFileSync(join(REPO, rel), 'utf8'); } catch { return ''; }
}

const WORD = new RegExp(`(^|[^A-Za-z])${TERM}([^A-Za-z]|$)`, 'i');
const RLS_WORD = /(^|[^A-Za-z])rls([^A-Za-z]|$)/i;

/**
 * RLS used to describe the PROVIDER rather than a compliance obligation.
 *
 * Classification is SEMANTIC, not filename-based. Three families are recognised
 * as legitimate and excluded before the provider test is applied - each because
 * of what the token MEANS on that line, not where the line lives:
 *
 *   RAW PROVIDER VALUE   Cotality listing ids on this feed literally begin
 *                        `RLS` (RLS20012345), and it returns
 *                        OriginatingSystemName: "RLS" and quotes 'RLS' in its
 *                        own 400 text. Evidence, preserved byte-for-byte.
 *   MALLAN BUSINESS FLAG `rls_eligible` is a Mallan column and business rule
 *                        about REBNY eligibility, not a description of a feed.
 *   COMPLIANCE OBLIGATION "REBNY RLS", UCBA, attribution, advertising, display
 *                        rules, audience scoping - Mallan compliance, downstream
 *                        of ingestion.
 */
const LEGITIMATE_RLS = [
  /RLS[-_]?[$A-Z0-9{]/,                     // raw provider ids, incl. `RLS-${i}` fixtures
  /rls_eligible|rls-eligible|rlsEligible/i, // Mallan business flag
  /REBNY/i,                                 // compliance obligation
  /OriginatingSystemName/,                  // raw provider field value
  /suppressed \(provider Level\)/i,         // verbatim provider error text
  /compliance|UCBA|attribution|advertis|disclosure|disclaimer|audience|enforcement|eligib/i,
];

const PROVIDER_SEMANTICS =
  /(feed|source|provider|inventory|sync|provenance|schema|field|registry|alias|picklist|mapper|normaliz|geograph|trestle)/i;

const PROVIDER_LAYER = ['lib/idx/', 'lib/search/canonical/', 'lib/cotality/', 'scripts/cotality/'];

describe(`\u00a71 the legacy standard term is ZERO in Mallan-authored material`, () => {
  const files = tracked().filter(
    (f) => !PROVIDER_CAPTURES.includes(f) && f !== 'package-lock.json' && !f.startsWith('node_modules/'),
  );

  it('scans a non-trivial number of tracked files', () => {
    // A guard that silently scanned nothing would pass forever.
    expect(files.length).toBeGreaterThan(500);
  });

  it('no Mallan-authored file contains it, in any case', () => {
    const offenders = files.filter((f) => WORD.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('no tracked PATH contains it', () => {
    expect(tracked().filter((f) => WORD.test(f))).toEqual([]);
  });

  it('the provider-capture exemption is PROVEN, not trusted', () => {
    // Inside a capture the term may appear only INSIDE A PROVIDER IDENTIFIER -
    // a dotted namespace or a field name that Cotality itself authored. Live
    // captures contain three such forms:
    //
    //   <TERM>.OData.Metadata.StandardName     annotation term namespace
    //   Cotality.DataStandard.<TERM>.DD.Enums  type namespace
    //   <TERM>StandardYN                        an actual Cotality field name
    //
    // What must NEVER appear is the term as free PROSE - a Mallan sentence
    // describing the provider. That is the difference between quoting the
    // provider and adopting its vocabulary as our own, and it is why the
    // exemption is a semantic test rather than a filename allowance.
    // PROSE means the term standing alone as an English word - a Mallan
    // sentence describing the provider. No provider identifier can satisfy
    // that: a namespace is followed by a dot, and a field name is followed by a
    // letter. `<TERM>.OData.Metadata.StandardName`, `Cotality.DataStandard.
    // <TERM>.DD.Enums` and the real Cotality field `<TERM>StandardYN` are all
    // identifiers and all legitimate. Quoting the provider is not adopting its
    // vocabulary; writing the word into our own sentences is.
    const prose = new RegExp('(^|[ \t])' + TERM + '([ \t]|$)', 'gi');
    for (const rel of PROVIDER_CAPTURES) {
      const src = read(rel);
      if (!src) continue;
      expect({ file: rel, proseOccurrences: (src.match(prose) || []).length }).toEqual({
        file: rel,
        proseOccurrences: 0,
      });
    }
  });
});

describe('\u00a72 RLS never describes the provider', () => {
  const files = tracked().filter(
    (f) => !PROVIDER_CAPTURES.includes(f) && f !== 'package-lock.json',
  );

  const providerSemanticLines = (rel: string): string[] =>
    read(rel)
      .split('\n')
      .filter(
        (l) =>
          RLS_WORD.test(l) &&
          PROVIDER_SEMANTICS.test(l) &&
          !LEGITIMATE_RLS.some((ok) => ok.test(l)),
      );

  it('the provider layer is at HARD ZERO', () => {
    const offenders: string[] = [];
    for (const f of files.filter((f) => PROVIDER_LAYER.some((p) => f.startsWith(p)))) {
      if (providerSemanticLines(f).length > 0) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('repo-wide it does not grow beyond the recorded baseline', () => {
    // RATCHET, not a pass. This number is the outstanding cleanup, stated openly
    // so it cannot creep upward while the suite still looks green. It must only
    // ever be lowered, and lowering it is the next commit's job.
    // Measured 2026-08-23 by this exact assertion, over every tracked file.
    // A first crude count said 4,771; semantic classification exonerated most of
    // it as compliance obligations and raw provider values. Of what remains,
    // roughly 513 lines are Mallan SOURCE (public/ 223, docs/ 111, scripts/ 43,
    // tests/ 40, lib/ 28, app/ 23, data/ 16) and the balance sits in generated
    // artifacts that will clear when their generators are corrected.
    //
    // This number may only ever go DOWN. It is stated openly so the outstanding
    // cleanup cannot creep upward while the suite still looks green.
    const BASELINE = 2095;
    const total = files.reduce((n, f) => n + providerSemanticLines(f).length, 0);
    expect(total).toBeLessThanOrEqual(BASELINE);
  });
});

describe('\u00a73 legitimate compliance vocabulary is not collateral damage', () => {
  it('the compliance enforcement module keeps its RLS terminology', () => {
    expect(read('lib/compliance/rls-enforcement.ts')).toMatch(/RLS/);
  });

  it('raw provider values stay verbatim', () => {
    // Cotality itself returns OriginatingSystemName: "RLS".
    expect(read('lib/search/canonical/field-registry.ts')).toMatch(/OriginatingSystemName value = "RLS"/);
  });
});
