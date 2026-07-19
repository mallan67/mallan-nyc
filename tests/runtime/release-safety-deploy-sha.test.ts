/**
 * Release-safety P2 — control 4 tests: deployment-SHA verifier.
 * Fully mocked — zero Vercel API calls, zero network.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  decideDeploymentVerdict,
  pollForMatch,
  exitCodeForVerdict,
} = require('../../scripts/release-safety/verify-deployment-sha.js');

const SHA = '94eef36b5bff27689ed796e0577c63f783460071';

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'dpl_test123',
    readyState: 'READY',
    meta: { githubCommitSha: SHA },
    ...overrides,
  };
}

function vercelListResponse(dep: unknown) {
  return {
    status: 200,
    json: async () => ({ deployments: dep ? [dep] : [] }),
  };
}

describe('release-safety P2 — decideDeploymentVerdict (fail-closed)', () => {
  test('READY + matching SHA (case-insensitive) => MATCH', () => {
    expect(decideDeploymentVerdict(SHA.toUpperCase(), deployment()).verdict).toBe('MATCH');
  });

  test('READY + different SHA => SHA_MISMATCH', () => {
    const d = deployment({ meta: { githubCommitSha: 'deadbeef' } });
    expect(decideDeploymentVerdict(SHA, d).verdict).toBe('SHA_MISMATCH');
  });

  test('non-READY state => NOT_READY (BUILDING, ERROR, QUEUED)', () => {
    for (const state of ['BUILDING', 'ERROR', 'QUEUED', null]) {
      expect(decideDeploymentVerdict(SHA, deployment({ readyState: state })).verdict).toBe('NOT_READY');
    }
  });

  test('missing deployment, missing meta, or missing expected SHA => UNKNOWN (never MATCH)', () => {
    expect(decideDeploymentVerdict(SHA, null).verdict).toBe('UNKNOWN');
    expect(decideDeploymentVerdict(SHA, deployment({ meta: {} })).verdict).toBe('UNKNOWN');
    expect(decideDeploymentVerdict('', deployment()).verdict).toBe('UNKNOWN');
  });

  test('exit codes are fail-closed: only MATCH exits 0', () => {
    expect(exitCodeForVerdict('MATCH')).toBe(0);
    expect(exitCodeForVerdict('SHA_MISMATCH')).toBe(2);
    expect(exitCodeForVerdict('NOT_READY')).toBe(3);
    expect(exitCodeForVerdict('UNKNOWN')).toBe(4);
    expect(exitCodeForVerdict('SOMETHING_NEW')).toBe(4);
  });
});

describe('release-safety P2 — pollForMatch (bounded)', () => {
  const creds = { token: 'test-token-never-logged', projectId: 'prj_test' };

  test('returns MATCH on first attempt without sleeping', async () => {
    const fetchImpl = jest.fn(async () => vercelListResponse(deployment()));
    const sleep = jest.fn();
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep, maxAttempts: 5 });
    expect(result.verdict).toBe('MATCH');
    expect(result.attempts).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('polls through NOT_READY to MATCH, sleeping between attempts', async () => {
    let call = 0;
    const fetchImpl = jest.fn(async () => {
      call += 1;
      return vercelListResponse(call < 3 ? deployment({ readyState: 'BUILDING' }) : deployment());
    });
    const sleep = jest.fn();
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep, maxAttempts: 5, intervalMs: 7 });
    expect(result.verdict).toBe('MATCH');
    expect(result.attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(7);
  });

  test('is strictly bounded: stops at maxAttempts and returns the last verdict', async () => {
    const fetchImpl = jest.fn(async () => vercelListResponse(deployment({ readyState: 'BUILDING' })));
    const sleep = jest.fn();
    const result = await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep, maxAttempts: 4 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.verdict).toBe('NOT_READY');
    expect(result.attempts).toBe(4);
  });

  test('API errors become UNKNOWN (fail-closed), redacted to status code', async () => {
    const fetchImpl = jest.fn(async () => ({ status: 403, json: async () => ({}) }));
    const logs: string[] = [];
    const result = await pollForMatch({
      expectedSha: SHA,
      ...creds,
      fetchImpl,
      sleep: jest.fn(),
      maxAttempts: 2,
      log: (m: string) => logs.push(m),
    });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reason).toContain('HTTP 403');
  });

  test('the token never appears in verdicts or log output', async () => {
    const fetchImpl = jest.fn(async () => ({ status: 500, json: async () => ({}) }));
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
      return vercelListResponse(deployment());
    });
    await pollForMatch({ expectedSha: SHA, ...creds, fetchImpl, sleep: jest.fn(), maxAttempts: 1 });
    expect(methods).toEqual(['GET']);
  });
});
