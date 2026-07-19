/**
 * Release-safety P2 — control 7 tests: known-good deployment recorder.
 * Fully mocked Vercel fetch; ledger written to a temp directory.
 *
 * Identity contract: the recorder records the deployment PROVEN to serve
 * the production alias — with all four refusal conditions tested.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const { recordKnownGood } = require('../../scripts/release-safety/record-known-good.js');

const SHA = '94eef36b5bff27689ed796e0577c63f783460071';
const creds = { token: 'tkn-never-logged', aliasHost: 'mallan.nyc' };

/** v13 get-deployment returns the deployment object directly. */
function vercelFetch(dep: unknown, status = 200) {
  return jest.fn(async () => ({ status, json: async () => dep }));
}

function tmpLedger() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-ledger-')), 'known-good.jsonl');
}

const readyDeployment = {
  id: 'dpl_good1',
  readyState: 'READY',
  alias: ['mallan.nyc', 'www.mallan.nyc'],
  url: 'mallan-abc123.vercel.app',
  meta: { githubCommitSha: SHA },
};

describe('release-safety P2 — record-known-good (alias-proven)', () => {
  test('valid record: timestamp, deployment id, sha, ALIASES, url, verified_by', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...creds,
      expectedSha: SHA,
      fetchImpl: vercelFetch(readyDeployment),
      ledgerPath,
      verifiedBy: 'test-suite',
      now: () => '2026-07-19T00:00:00.000Z',
    });
    expect(result.recorded).toBe(true);
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      recorded_at: '2026-07-19T00:00:00.000Z',
      deployment_id: 'dpl_good1',
      sha: SHA,
      aliases: ['mallan.nyc', 'www.mallan.nyc'],
      url: 'mallan-abc123.vercel.app',
      verified_by: 'test-suite',
    });
  });

  test('appends — never overwrites — the ledger', async () => {
    const ledgerPath = tmpLedger();
    const opts = { ...creds, fetchImpl: vercelFetch(readyDeployment), ledgerPath, now: () => 'T' };
    await recordKnownGood(opts);
    await recordKnownGood(opts);
    expect(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  test('refusal 1: non-READY deployment', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...creds,
      fetchImpl: vercelFetch({ ...readyDeployment, readyState: 'BUILDING' }),
      ledgerPath,
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('READY');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 2: SHA mismatch (fail-closed)', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...creds,
      expectedSha: 'deadbeef',
      fetchImpl: vercelFetch(readyDeployment),
      ledgerPath,
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('SHA_MISMATCH');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 3: mallan.nyc not among the proven aliases', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...creds,
      fetchImpl: vercelFetch({ ...readyDeployment, alias: ['preview.mallan.nyc'] }),
      ledgerPath,
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('not among the proven aliases');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 4: alias ownership cannot be proven (no alias metadata)', async () => {
    for (const alias of [undefined, []]) {
      const ledgerPath = tmpLedger();
      const result = await recordKnownGood({
        ...creds,
        fetchImpl: vercelFetch({ ...readyDeployment, alias }),
        ledgerPath,
      });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('alias ownership cannot be proven');
      expect(fs.existsSync(ledgerPath)).toBe(false);
    }
  });

  test('no deployment resolves for the alias => not recorded', async () => {
    const result = await recordKnownGood({ ...creds, fetchImpl: vercelFetch({}, 404), ledgerPath: tmpLedger() });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("no deployment resolves for alias 'mallan.nyc'");
  });
});
