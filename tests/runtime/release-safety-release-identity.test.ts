/**
 * Release-safety — TOKEN-FREE production identity verifier tests.
 * Fully mocked: zero network, zero Vercel API. Covers the pure verdict core,
 * the fail-closed shape validation, and the two-phase reconfirm that closes the
 * alias-switch TOCTOU (Codex finding on PR #565).
 */

/* eslint-disable @typescript-eslint/no-var-requires */
export {}; // make this a module (avoids global-scope name collision with sibling script-style test files)

const {
  decideIdentityVerdict,
  reconfirmVerdict,
  pollForMatch,
  exitCodeForVerdict,
} = require('../../scripts/release-safety/verify-release-identity.js');

const SHA = 'b7386c289ca98fff27a0ca0af90d8724544b0026'; // 40-hex
const OTHER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ALIAS = 'mallan.nyc';
const DPL = 'dpl_Gc7dVSp9TkQa7b83Zmw7io1mENyU';

function identity(overrides: Record<string, unknown> = {}) {
  return { commitSha: SHA, deploymentId: DPL, targetEnv: 'production', ...overrides };
}
const opts = { aliasHost: ALIAS, requireProduction: true };

describe('decideIdentityVerdict — fail-closed, shape-validated', () => {
  test('valid production identity whose SHA matches (case-insensitive) => MATCH with structured fields', () => {
    const r = decideIdentityVerdict(SHA.toUpperCase(), identity(), opts);
    expect(r.verdict).toBe('MATCH');
    expect(r.deployed_sha).toBe(SHA);
    expect(r.deployment_id).toBe(DPL);
    expect(r.target_env).toBe('production');
    expect(r.alias_host).toBe('mallan.nyc');
    expect(r.aliases).toContain('mallan.nyc');
  });

  test('valid identity built from a DIFFERENT commit => SHA_MISMATCH', () => {
    const r = decideIdentityVerdict(SHA, identity({ commitSha: OTHER_SHA }), opts);
    expect(r.verdict).toBe('SHA_MISMATCH');
  });

  test('null / non-object identity (unreachable, 404, 503, malformed JSON) => UNKNOWN', () => {
    expect(decideIdentityVerdict(SHA, null, opts).verdict).toBe('UNKNOWN');
    expect(decideIdentityVerdict(SHA, 'nope' as unknown as object, opts).verdict).toBe('UNKNOWN');
  });

  test('malformed values fail closed (not merely existence-checked) => UNKNOWN', () => {
    expect(decideIdentityVerdict(SHA, identity({ commitSha: 'deadbeef' }), opts).verdict).toBe('UNKNOWN'); // not 40-hex
    expect(decideIdentityVerdict(SHA, identity({ deploymentId: '12345' }), opts).verdict).toBe('UNKNOWN'); // not dpl_
    expect(decideIdentityVerdict(SHA, identity({ deploymentId: undefined }), opts).verdict).toBe('UNKNOWN');
    expect(decideIdentityVerdict(SHA, identity({ targetEnv: 'staging' }), opts).verdict).toBe('UNKNOWN'); // unknown env
    expect(decideIdentityVerdict('not-a-sha', identity(), opts).verdict).toBe('UNKNOWN'); // bad expected sha
  });

  test('a PREVIEW deployment on the production alias => UNKNOWN (requireProduction)', () => {
    const r = decideIdentityVerdict(SHA, identity({ targetEnv: 'preview' }), opts);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.reason).toMatch(/not production/i);
  });

  test('preview is acceptable ONLY when requireProduction=false (the preview pre-merge proof)', () => {
    const r = decideIdentityVerdict(SHA, identity({ targetEnv: 'preview' }), { aliasHost: ALIAS, requireProduction: false });
    expect(r.verdict).toBe('MATCH');
    expect(r.target_env).toBe('preview');
  });
});

describe('reconfirmVerdict — phase 2 TOCTOU guard (alias switch during smoke)', () => {
  const pre = decideIdentityVerdict(SHA, identity(), opts); // MATCH, dpl A @ SHA

  test('identical post-smoke identity => reconfirm OK', () => {
    const post = decideIdentityVerdict(SHA, identity(), opts);
    expect(reconfirmVerdict(pre, post).ok).toBe(true);
  });

  test('deployment id changed (A→B alias switch) => REJECT', () => {
    const post = decideIdentityVerdict(SHA, identity({ deploymentId: 'dpl_SWITCHEDtoB000000000000' }), opts);
    const r = reconfirmVerdict(pre, post);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/deployment changed/i);
  });

  test('SHA changed under the alias => REJECT', () => {
    const post = decideIdentityVerdict(OTHER_SHA, identity({ commitSha: OTHER_SHA }), { ...opts });
    // post is a MATCH for OTHER_SHA, but its deployed_sha differs from pre.
    expect(reconfirmVerdict(pre, post).ok).toBe(false);
  });

  test('environment flipped to preview => REJECT', () => {
    const post = decideIdentityVerdict(SHA, identity({ targetEnv: 'preview' }), { aliasHost: ALIAS, requireProduction: false });
    expect(reconfirmVerdict(pre, post).ok).toBe(false);
  });

  test('post identity unproven (endpoint went 404/503 mid-window) => REJECT', () => {
    const post = decideIdentityVerdict(SHA, null, opts); // UNKNOWN
    expect(reconfirmVerdict(pre, post).ok).toBe(false);
  });
});

describe('pollForMatch — fetch-mocked, no network', () => {
  const mkRes = (status: number, body: unknown) => ({ status, json: async () => body });

  test('matches once the alias serves the expected production identity', async () => {
    const fetchImpl = jest.fn(async () => mkRes(200, identity()));
    const r = await pollForMatch({ expectedSha: SHA, baseUrl: `https://${ALIAS}`, fetchImpl, maxAttempts: 3, intervalMs: 0, sleep: async () => {} });
    expect(r.verdict).toBe('MATCH');
    expect(r.deployment_id).toBe(DPL);
  });

  test('keeps polling through 503/404 (rollout) then matches; never a false green', async () => {
    let n = 0;
    const fetchImpl = jest.fn(async () => {
      n += 1;
      if (n < 3) return mkRes(503, { error: 'unavailable' }); // old deploy / not exposed yet
      return mkRes(200, identity());
    });
    const r = await pollForMatch({ expectedSha: SHA, baseUrl: `https://${ALIAS}`, fetchImpl, maxAttempts: 5, intervalMs: 0, sleep: async () => {} });
    expect(r.verdict).toBe('MATCH');
    expect(r.attempts).toBe(3);
  });

  test('a wrong SHA under the alias never matches (bounded, then SHA_MISMATCH)', async () => {
    const fetchImpl = jest.fn(async () => mkRes(200, identity({ commitSha: OTHER_SHA })));
    const r = await pollForMatch({ expectedSha: SHA, baseUrl: `https://${ALIAS}`, fetchImpl, maxAttempts: 2, intervalMs: 0, sleep: async () => {} });
    expect(r.verdict).toBe('SHA_MISMATCH');
  });
});

describe('exitCodeForVerdict — only MATCH exits 0', () => {
  test.each([
    ['MATCH', 0],
    ['SHA_MISMATCH', 2],
    ['UNKNOWN', 4],
    ['anything-else', 4],
  ])('%s => %d', (verdict, code) => {
    expect(exitCodeForVerdict(verdict)).toBe(code);
  });
});
