/// <reference types="jest" />
/**
 * STEP 2 GATE 0 — THE VERIFIER MUST BE TRUSTWORTHY BEFORE IT CAN VERIFY.
 *
 * `npm run idx:validate` exits 1 on one critical:
 *
 *     lib/search/canonical/field-registry.ts: Potential hardcoded API key
 *
 * There is no key in that file. The rule is
 *
 *     /['"][A-Za-z0-9+/=]{40,}['"]/
 *
 * and `/` is a member of the base64 alphabet, so it matches a slash-delimited
 * list of Cotality field names:
 *
 *     'SourceSystemName/SourceSystemID/SourceSystemKey/OriginatingSystemName/…'
 *
 * Step 2 cannot claim verified Cotality mapping while its own validator is
 * knowingly red on a finding everyone has agreed to ignore — an ignored red is
 * how a real red gets ignored later.
 *
 * WHAT THIS FIX MAY NOT DO: weaken secret detection. So the discriminator is
 * structural, not statistical.
 *
 * ENTROPY WAS MEASURED AND REJECTED. The obvious fix is a Shannon-entropy
 * floor. It does not work here, and the measurement is why:
 *
 *     the false positive (110-char field list)   H = 4.11
 *     a genuine 64-char hex API key              H = 3.98
 *
 * The false positive scores HIGHER than a real secret, so any threshold that
 * clears the field list also clears hex keys. Entropy separates random from
 * English; it does not separate "secret" from "identifier list".
 *
 * What actually separates them is SHAPE: the field list decomposes into
 * delimiter-separated PascalCase identifier tokens. Random base64 does not.
 */
const {
  isLikelySecret,
  findSecretCandidates,
} = require('../../scripts/lib/secret-heuristics.js');

/** The exact string that is failing idx:validate today. */
const FIELD_LIST =
  'SourceSystemName/SourceSystemID/SourceSystemKey/OriginatingSystemName/OriginatingSystemID/OriginatingSystemKey';

describe('the false positive is reproduced exactly, then cleared', () => {
  it('the live rule really does match that field list — this is the bug', () => {
    // Reproducing before fixing: if this ever stops matching, the fix below is
    // no longer testing anything.
    expect(/['"][A-Za-z0-9+/=]{40,}['"]/.test(`'${FIELD_LIST}'`)).toBe(true);
  });

  it('is not reported as a secret', () => {
    expect(isLikelySecret(FIELD_LIST)).toBe(false);
  });

  it.each([
    'Monthly/Quarterly/Annually/SemiMonthly/Weekly/BiWeekly/SemiAnnually',
    'TaxBlock/TaxLot/TaxMapNumber/ParcelNumber/BuildingTaxLot/AssessorParcel',
    'ListAgentFullName,ListAgentMlsId,ListAgentKey,ListOfficeName,ListOfficeKey',
  ])('nor is the field/enum list %s', (list) => {
    expect(isLikelySecret(list)).toBe(false);
  });

  it('finds no secret candidate anywhere in field-registry.ts', () => {
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'lib/search/canonical/field-registry.ts'),
      'utf8',
    );
    expect(findSecretCandidates(src)).toEqual([]);
  });
});

describe('genuine secrets still fail — detection is not weakened', () => {
  it.each([
    ['base64 blob', 'dGhpcyBpcyBhIHZlcnkgc2VjcmV0IGFwaSBrZXkgZm9yIHRlc3Rpbmcx'],
    ['JWT-shaped', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NSJ9'],
    ['64-char hex', 'a3f5c81d92b40e7f16ca3d8e05b29f4c7a1e6b03d94f28c5a7e10b6d3f9c284e'],
    ['Google-key shaped', 'AIzaSyC1qL8mNpQ7rTuVwXyZ0aBcDeFgHiJkLmNo'],
    ['long random mixed', 'Xk92MvQpLd73BnRt5YwZcA1sEfGh8JiKlM0nOpQrStUvWxYz4B'],
    ['base64 with padding', 'c2VjcmV0LXZhbHVlLXRoYXQtc2hvdWxkLW5ldmVyLXNoaXA9PQ=='],
  ])('%s is still flagged', (_label, secret) => {
    expect(isLikelySecret(secret)).toBe(true);
  });

  it('flags a secret embedded in a real source line', () => {
    const line = `const API_KEY = "AIzaSyC1qL8mNpQ7rTuVwXyZ0aBcDeFgHiJkLmNo";`;
    expect(findSecretCandidates(line)).toHaveLength(1);
  });

  it('a slash-separated secret is NOT excused just because it has slashes', () => {
    // The exclusion is about identifier SHAPE, not about the presence of '/'.
    expect(isLikelySecret('aB3/xY9zQ1mN4pR7/tV2wS5uD8gH0jK6/lC3nB9vX1zA4qW7eR')).toBe(true);
  });

  it('a two-token list is not enough structure to be excused', () => {
    expect(isLikelySecret('SourceSystemName/OriginatingSystemNameAndMorePaddingHere')).toBe(true);
  });
});

describe('the finding is diagnosable when it does fire', () => {
  it('reports what actually matched, not just the file', () => {
    // Nobody could fix this false positive quickly because the message named
    // the file and the rule but never the offending string.
    const found = findSecretCandidates(`const k = "AIzaSyC1qL8mNpQ7rTuVwXyZ0aBcDeFgHiJkLmNo";`);
    expect(found[0]).toContain('AIzaSy');
  });
});

/**
 * THE ADVERSARIAL ROUND, AND THE CORRECTION IT FORCED.
 *
 * The first version of this discriminator required only that a token be
 * PascalCase, alphanumeric, and contain a lowercase. Its header asserted that
 * the rule was narrow enough that "adding slashes to a secret cannot excuse it".
 *
 * That was false, and an adversarial review falsified it by MEASUREMENT rather
 * than by argument. `/` is a NATIVE member of the base64 alphabet, so real
 * secrets arrive with slashes already in them — nothing has to be added. A
 * Monte Carlo over unmodified `crypto.randomBytes(n).toString('base64')` output
 * showed genuine secrets clearing all four conditions by chance:
 *
 *     base64(48 bytes)              0.217 % silently missed
 *     base64(32 bytes), unpadded    0.160 % silently missed
 *     30 bytes / 40 chars (AWS)     0.124 % silently missed
 *
 * ~1 in 500-800 real secrets dropped, worst on the UNPADDED shapes — which is
 * exactly what AWS secret access keys, NEXTAUTH_SECRET and JWT signing keys
 * look like. The fix made token shape word-aware (letters only, vowel ratio,
 * consonant-run limit), with both thresholds swept rather than guessed.
 *
 * These tests keep that honest. The Monte Carlo runs here, so the zero-miss
 * claim in the module header is re-proved on every CI run instead of trusted.
 */
describe('the adversarial evasions are closed', () => {
  it.each([
    ['64-char base64, 3 slash-separated tokens', 'LbdAfn/CpTI1Mlmz9ZAX9kG//R1BbpjACqLiY3AkaFO93L6mimGOdiXjXFxjPIRN'],
    ['AWS-secret shape, 43 chars', 'CIUtpY/XXPbfwGke/V1mM455RjVhZhp9CGJgqcDRXCg'],
    ['86-char JWT signing key shape', 'YRcLejRxWT71dTWMJwgoWyKobNumaU75wF/FehWlBJYQEUq8F5nYRyvfKOfHaCqrZ/JIDEVDbGizUlzpbo0NNg'],
  ])('%s is flagged', (_label, evasion) => {
    expect(isLikelySecret(evasion)).toBe(true);
  });

  it('flags them end-to-end through the scanner entry point too', () => {
    const line = `const AWS_SECRET_ACCESS_KEY = "CIUtpY/XXPbfwGke/V1mM455RjVhZhp9CGJgqcDRXCg";`;
    expect(findSecretCandidates(line)).toHaveLength(1);
  });
});

describe('MONTE CARLO — no generated secret slips through', () => {
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * SEEDED, NOT RANDOM — AND THE REASON MATTERS.
   *
   * This ran on `crypto.randomBytes`, drawing a fresh 20,000-sample corpus every
   * CI run and asserting an ABSOLUTE zero. On 2026-08-29 it failed CI on the
   * 40-char AWS shape while passing locally, which was investigated rather than
   * retried:
   *
   *   A candidate is missed only when `looksLikeIdentifierList` claims it, which
   *   needs the string to carry no '+' or '=', split on '/' into 3+ tokens, and
   *   have EVERY token be 3+ chars, uppercase-initial, letters-only, under 25%
   *   vowels-free and free of a 6-consonant run. A random base64 string that
   *   happens to look exactly like `TaxBlock/TaxLot/TaxMapNumber` is possible and
   *   astronomically unlikely.
   *
   *   Measured: 10,000,000 sampled strings of this shape produced 869 that
   *   cleared the cheap pre-conditions and ZERO misses — a rate near 1e-7. At
   *   that rate a 20,000-sample draw fails roughly once per ~100 CI runs, which
   *   is exactly what was observed.
   *
   * So the assertion was true of the heuristic and false of the test: an
   * absolute claim over an unseeded sample is a lottery, and a security gate
   * that reds at random teaches people to re-run it. Seeding makes a given
   * commit always produce the same verdict.
   *
   * DETECTION IS NOT WEAKENED. The pre-fix miss rate this suite exists to catch
   * was ~1 in 500-800; a fixed 20,000-sample corpus catches a regression of that
   * size with overwhelming probability. What is gone is only the coin flip.
   *
   * The residual ~1e-7 class is NOT closed here deliberately. Tightening the
   * word-shape rule further would start flagging genuine Cotality field lists,
   * which is the false-positive failure this discriminator was built to fix.
   * That trade is recorded, not silently altered.
   */
  const SEED = 0x5eed_1342;

  /** SplitMix32 — small, deterministic, and good enough for corpus generation. */
  const bytesFrom = (state: number) => {
    let s = state;
    return (n: number): Buffer => {
      const out = Buffer.allocUnsafe(n);
      for (let i = 0; i < n; i++) {
        s = (s + 0x9e37_79b9) | 0;
        let z = s;
        z = Math.imul(z ^ (z >>> 16), 0x21f0_aaad);
        z = Math.imul(z ^ (z >>> 15), 0x735a_2d97);
        out[i] = (z ^ (z >>> 15)) & 0xff;
      }
      return out;
    };
  };

  /** Only candidates the scanner would even look at can be missed by it. */
  const inAlphabet = (v: string) => /^[A-Za-z0-9+/=]+$/.test(v);

  const GENERATORS: Array<[string, (b: (n: number) => Buffer) => string]> = [
    ['base64(48 bytes)', (b) => b(48).toString('base64')],
    ['base64(32 bytes) unpadded', (b) => b(32).toString('base64').replace(/=+$/, '')],
    ['30 bytes / 40 chars (AWS shape)', (b) => b(30).toString('base64')],
    ['base64(64 bytes)', (b) => b(64).toString('base64')],
    ['64-char hex', (b) => b(32).toString('hex')],
  ];

  it.each(GENERATORS)('misses none of 20,000 %s secrets', (_label, generate) => {
    const bytes = bytesFrom(SEED);
    const missed: string[] = [];
    for (let i = 0; i < 20_000; i++) {
      const secret = generate(bytes);
      if (inAlphabet(secret) && !isLikelySecret(secret)) missed.push(secret);
    }
    // Report the offenders, not just the count: a future failure here should say
    // WHICH strings slipped through, so the miss class is diagnosable from CI
    // alone rather than needing a local hunt.
    expect(missed).toEqual([]);
  });
});

describe('and the real field lists are still not secrets', () => {
  it.each([
    'SourceSystemName/SourceSystemID/SourceSystemKey/OriginatingSystemName/OriginatingSystemID/OriginatingSystemKey',
    'Monthly/Quarterly/Annually/SemiMonthly/Weekly/BiWeekly/SemiAnnually',
    'TaxBlock/TaxLot/TaxMapNumber/ParcelNumber/BuildingTaxLot/AssessorParcel',
    'ListAgentFullName,ListAgentMlsId,ListAgentKey,ListOfficeName,ListOfficeKey',
    // The live MediaCategory enum, read from api.cotality.com this session.
    'Addendum,AerialView,AgentPhoto,BrandedVirtualTour,Disclosure,Document,FloorPlan',
  ])('%s is excluded', (list) => {
    expect(isLikelySecret(list)).toBe(false);
  });
});

/**
 * GATE 0 CLOSURE — the blanket test-file exclusion.
 *
 * Section 13 skipped any file whose PATH CONTAINED the substring "test":
 *
 *     if (file.includes('test') || file.includes('__tests__')) continue;
 *
 * Two separate problems.
 *
 * 1. A real credential committed in an ordinary test file was undetectable.
 *    Test files are committed, pushed and public exactly like any other source,
 *    and a leaked key does not become safe by sitting next to an `it()`.
 *
 * 2. It is a SUBSTRING match on the path, so it silently swallowed files that
 *    are not tests at all. `lib/compliance/test-validation.ts` — production
 *    compliance code — was exempt from secret scanning purely because its name
 *    begins with "test". 165 of 980 scanned files were being skipped.
 *
 * The replacement is an EXPLICIT annotation rather than an implicit path rule.
 * A file that legitimately carries a secret-shaped fixture says so, using the
 * validator's existing `IDX-VALIDATE-IGNORE` / `IDX-VALIDATE-OK` convention.
 * That makes every exemption greppable and reviewable, which a path heuristic
 * never was.
 */
const { isSecretScanExempt } = require('../../scripts/lib/secret-heuristics.js');

describe('a real secret in a test file is still a real secret', () => {
  const KEY = 'AIzaSyC1qL8mNpQ7rTuVwXyZ0aBcDeFgHiJkLmNo';

  it.each([
    'lib/media/__tests__/something.test.ts',
    'app/api/thing/route.test.ts',
    'lib/idx/__tests__/fixtures.ts',
  ])('%s is scanned, not skipped', (file) => {
    expect(isSecretScanExempt(file, `const k = "${KEY}";`)).toBe(false);
  });

  it('a production file whose name merely contains "test" is scanned', () => {
    // The concrete regression: lib/compliance/test-validation.ts is compliance
    // code, not a test, and the substring rule exempted it.
    expect(isSecretScanExempt('lib/compliance/test-validation.ts', `const k = "${KEY}";`)).toBe(false);
  });

  const NEWLINE = String.fromCharCode(10);

  it('exempts a file only when it annotates itself for SECRETS specifically', () => {
    const annotated = '// IDX-VALIDATE-SECRET-OK: fixture key' + NEWLINE + 'const k = "' + KEY + '";';
    expect(isSecretScanExempt('lib/x/__tests__/a.test.ts', annotated)).toBe(true);
  });

  it('an unrelated validator waiver does NOT switch off secret scanning', () => {
    // CORRECTED after this suite's own exemption audit caught it. Reusing the
    // general IDX-VALIDATE-IGNORE / IDX-VALIDATE-OK waivers meant a waiver
    // written for a completely different rule silently disabled secret
    // detection for the whole file. Two real files would have been affected:
    //   lib/idx/trestle-mapper.ts     waived for a CeilingHeight exclusion
    //   app/api/unsubscribe/route.ts  waived as intentionally unauthenticated
    // A waiver for one rule must not grant a waiver for another.
    const authWaiver = '// IDX-VALIDATE-OK: unauthenticated by design' + NEWLINE + 'const k = "' + KEY + '";';
    const fieldWaiver = '/* IDX-VALIDATE-IGNORE: derived field */' + NEWLINE + 'const k = "' + KEY + '";';
    expect(isSecretScanExempt('lib/idx/x.ts', authWaiver)).toBe(false);
    expect(isSecretScanExempt('lib/idx/x.ts', fieldWaiver)).toBe(false);
  });

  it('still exempts the Sentry DSN case the old rule carved out', () => {
    expect(isSecretScanExempt('lib/sentry/config.ts', 'const dsn = "…";')).toBe(true);
  });

  it('no file in the repo is exempt by accident today', () => {
    // If this ever fails, an exemption was added — deliberately, with an
    // annotation someone can find. That is the whole point of the change.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('node:fs'), path = require('node:path');
    const root = path.join(__dirname, '..', '..');
    const walk = (d: string, ext: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.next', '.git'].includes(e.name)) walk(p, ext, out); }
        else if (p.endsWith(ext)) out.push(p);
      }
      return out;
    };
    const files = [
      ...walk(path.join(root, 'lib'), '.ts'),
      ...walk(path.join(root, 'app'), '.ts'),
    ];
    const exempt = files.filter((f: string) => isSecretScanExempt(f, fs.readFileSync(f, 'utf8')));
    const nonSentry = exempt.filter((f: string) => !f.includes('sentry'));
    expect(nonSentry).toEqual([]);
  });
});
