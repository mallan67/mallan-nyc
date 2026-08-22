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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('node:crypto');

  /** Only candidates the scanner would even look at can be missed by it. */
  const inAlphabet = (v: string) => /^[A-Za-z0-9+/=]+$/.test(v);

  const GENERATORS: Array<[string, () => string]> = [
    ['base64(48 bytes)', () => crypto.randomBytes(48).toString('base64')],
    ['base64(32 bytes) unpadded', () => crypto.randomBytes(32).toString('base64').replace(/=+$/, '')],
    ['30 bytes / 40 chars (AWS shape)', () => crypto.randomBytes(30).toString('base64')],
    ['base64(64 bytes)', () => crypto.randomBytes(64).toString('base64')],
    ['64-char hex', () => crypto.randomBytes(32).toString('hex')],
  ];

  // 20k per class keeps CI fast. The pre-fix miss rate was ~1 in 500-800, so a
  // regression of that size would surface here with overwhelming probability;
  // the full 400k-per-class run was done at development time and also scored 0.
  it.each(GENERATORS)('misses none of 20,000 %s secrets', (_label, generate) => {
    let missed = 0;
    for (let i = 0; i < 20_000; i++) {
      const secret = generate();
      if (inAlphabet(secret) && !isLikelySecret(secret)) missed++;
    }
    expect(missed).toBe(0);
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
