/**
 * Release-safety P2 — control 7 tests: known-good deployment recorder.
 * Fully mocked Vercel fetch; ledger written to a temp directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const { recordKnownGood } = require('../../scripts/release-safety/record-known-good.js');

const SHA = '94eef36b5bff27689ed796e0577c63f783460071';
const creds = { token: 'tkn-never-logged', projectId: 'prj_x' };

function vercelFetch(dep: unknown) {
  return jest.fn(async () => ({ status: 200, json: async () => ({ deployments: dep ? [dep] : [] }) }));
}

function tmpLedger() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-ledger-')), 'known-good.jsonl');
}

const readyDeployment = {
  uid: 'dpl_good1',
  readyState: 'READY',
  url: 'mallan-abc123.vercel.app',
  meta: { githubCommitSha: SHA },
};

describe('release-safety P2 — record-known-good', () => {
  test('records a READY deployment with sha + id + timestamp as one JSONL line', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...creds,
      fetchImpl: vercelFetch(readyDeployment),
      ledgerPath,
      verifiedBy: 'test-suite',
      now: () => '2026-07-19T00:00:00.000Z',
    });
    expect(result.recorded).toBe(true);
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({
      recorded_at: '2026-07-19T00:00:00.000Z',
      deployment_id: 'dpl_good1',
      sha: SHA,
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

  test('refuses to record a non-READY deployment', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...creds,
      fetchImpl: vercelFetch({ ...readyDeployment, readyState: 'BUILDING' }),
      ledgerPath,
    });
    expect(result.recorded).toBe(false);
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refuses to record when expectedSha does not match (fail-closed)', async () => {
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

  test('no production deployment => not recorded', async () => {
    const result = await recordKnownGood({ ...creds, fetchImpl: vercelFetch(null), ledgerPath: tmpLedger() });
    expect(result.recorded).toBe(false);
  });
});
