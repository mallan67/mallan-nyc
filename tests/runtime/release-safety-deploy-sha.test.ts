/**
 * Release-safety P2 — control 4 tests: deployment-SHA verifier.
 * Fully mocked — zero Vercel API calls, zero network.
 *
 * Identity contract under test: the verifier resolves the deployment BY THE
 * PRODUCTION ALIAS (GET /v13/deployments/{alias}) and additionally requires
 * the alias to appear in the deployment's own alias list — "newest
 * production-target deployment" is never equated with "live deployment".
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  decideDeploymentVerdict,
  pollForMatch,
  exitCodeForVerdict,
  aliasHostname,
} = require('../../scripts/release-safety/verify-deployment-sha.js');

const SHA = '94eef36b5bff27689ed796e0577c63f783460071';
const ALIAS = 'mallan.nyc';

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dpl_test123',
    readyState: 'READY',
    alias: ['mallan.nyc', 'www.mallan.nyc'],
    url: 'mallan-abc123.vercel.app',
    meta: { githubCommitSha: SHA },
    ...overrides,
  };
}

/** v13 get-deployment returns the deployment object directly. */
function v13Response(dep: unknown, status = 200) {
  return { status, json: async () => dep };
}

describe('release-safety P2 — decideDeploymentVerdict (fail-closed, alias-proven)', () => {
  const opts = { requiredAlias: ALIAS };

  test('READY + alias proven + matching SHA (case-insensitive) => MATCH', () => {
    const r = decideDeploymentVerdict(SHA.toUpperCase(), deployment(), opts);
    expect(r.verdict).toBe('MATCH');
    expect(r.aliases).toContain('mallan.nyc');
  });

  test('READY + alias proven + different SHA => SHA_MISMATCH', () => {
    const d = deployment({ meta: { githubCommitSha: 'deadbeef' } });
    expect(decideDeploymentVerdict(SHA, d, opts).verdict).toBe('SHA_MISMATCH');
  });

  test('non-READY state => NOT_READY (BUILDING, ERROR, QUEUED)', () => {
    for (const state of ['BUILDING', 'ERROR', 'QUEUED', null]) {
      expect(decideDeploymentVerdict(SHA, deployment({ readyState: state }), opts).verdict).toBe('NOT_READY');
    }
  });

  test('required alias NOT among the deployment aliases => UNKNOWN (never MATCH)', () => {
    const d = deployment({ alias: ['staging.mallan.nyc'] });
    const r = decideDeploymentVerdict(SHA, d, opts);
    expect(r.verdict).toBe('UNKNOWN');
    expect(r.reason).toContain('alias ownership cannot be proven');
  });

  test('missing alias metadata => UNKNOWN — alias ownership unprovable', () => {
    for (const alias of [undefined, [], null]) {
      const r = decideDeploymentVerdict(SHA, deployment({ alias }), opts);
      expect(r.verdict).toBe('UNKNOWN');
      expect(r.reason).toContain('alias ownership cannot be proven');
    }
  });

  test('alias entries normalize from strings and objects, with scheme stripped', () => {
    expect(aliasHostname('https://MALLAN.nyc/')).toBe('mallan.nyc');
    expect(aliasHostname({ alias: 'www.mallan.nyc' })).toBe('www.mallan.nyc');
    const d = deployment({ alias: [{ alias: 'https://mallan.nyc' }] });
    expect(decideDeploymentVerdict(SHA, d, opts).verdict).toBe('MATCH');
  });

  test('missing deployment, missing meta, or missing expected SHA => UNKNOWN', () => {
    expect(decideDeploymentVerdict(SHA, null, opts).verdict).toBe('UNKNOWN');
    expect(decideDeploymentVerdict(SHA, deployment({ meta: {} }), opts).verdict).toBe('UNKNOWN');
    expect(decideDeploymentVerdict('', deployment(), opts).verdict).toBe('UNKNOWN');
  });

  test('exit codes are fail-closed: only MATCH exits 0', () => {
    expect(exitCodeForVerdict('MATCH')).toBe(0);
    expect(exitCodeForVerdict('SHA_MISMATCH')).toBe(2);
    expect(exitCodeForVerdict('NOT_READY')).toBe(3);
    expect(exitCodeForVerdict('UNKNOWN')).toBe(4);
    expect(exitCodeForVerdict('SOMETHING_NEW')).toBe(4);
  });
});

describe('release-safety P2 — pollForMatch (bounded, alias-addressed)', () => {
  const creds = { token: 'test-token-never-logged', aliasHost: ALIAS };

  test('resolves the deployment BY the alias host (URL-addressed GET) and MATCHes', async () => {
    const urls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      urls.push(url);
      return v13Response(deployment());
    });
    const sleep = jest.fn();
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep, maxAttempts: 5 });
    expect(result.verdict).toBe('MATCH');
    expect(result.attempts).toBe(1);
    expect(urls[0]).toContain('/v13/deployments/mallan.nyc');
    expect(sleep).not.toHaveBeenCalled();
  });

  test('polls through NOT_READY to MATCH, sleeping between attempts', async () => {
    let call = 0;
    const fetchImpl = jest.fn(async () => {
      call += 1;
      return v13Response(call < 3 ? deployment({ readyState: 'BUILDING' }) : deployment());
    });
    const sleep = jest.fn();
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep, maxAttempts: 5, intervalMs: 7 });
    expect(result.verdict).toBe('MATCH');
    expect(result.attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7);
  });

  test('is strictly bounded: stops at maxAttempts and returns the last verdict', async () => {
    const fetchImpl = jest.fn(async () => v13Response(deployment({ readyState: 'BUILDING' })));
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep: jest.fn(), maxAttempts: 4 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.verdict).toBe('NOT_READY');
    expect(result.attempts).toBe(4);
  });

  test('alias resolving to no deployment (404) => UNKNOWN, fail-closed', async () => {
    const fetchImpl = jest.fn(async () => v13Response({}, 404));
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep: jest.fn(), maxAttempts: 1 });
    expect(result.verdict).toBe('UNKNOWN');
  });

  test('API errors become UNKNOWN (fail-closed), redacted to status code', async () => {
    const fetchImpl = jest.fn(async () => v13Response({}, 403));
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep: jest.fn(), maxAttempts: 2 });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toContain('HTTP 403');
  });

  test('the token never appears in verdicts or log output', async () => {
    const fetchImpl = jest.fn(async () => v13Response({}, 500));
    const logs: string[] = [];
    const result = await pollForMatch({
      expectedSha: SHA,
      ...creds,
      fetchImpl,
      sleep: jest.fn(),
      maxAttempts: 1,
      log: (m: string) => logs.push(m),
    });
    const everything = JSON.stringify(result) + logs.join('\n');
    expect(everything).not.toContain(creds.token);
  });

  test('only GET requests are issued', async () => {
    const methods: string[] = [];
    const fetchImpl = jest.fn(async (_url: string, opts: { method?: string }) => {
      methods.push((opts && opts.method) || 'GET');
      return v13Response(deployment());
    });
    await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep: jest.fn(), maxAttempts: 1 });
    expect(methods).toEqual(['GET']);
  });
});
