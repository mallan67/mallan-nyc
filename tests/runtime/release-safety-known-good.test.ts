/**
 * Release-safety P2 — control 7 tests: known-good deployment recorder.
 * Fully mocked Vercel fetch; ledger written to a temp directory.
 *
 * The recorder writes ONLY when the full identity chain holds:
 * mandatory expectedSha + deploymentId + passing smoke evidence bound to
 * both, post-smoke alias-ownership reconfirmation, and deduplication.
 * The output is a LOCAL-RECORD / NOT-DURABLE / NOT-WORKFLOW-WIRED note —
 * not a durable rollback ledger.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const { recordKnownGood, RECORD_LABELS } = require('../../scripts/release-safety/record-known-good.js');

const SHA = '94eef36b5bff27689ed796e0577c63f783460071';
const DPL = 'dpl_good1';
const creds = { token: 'tkn-never-logged', aliasHost: 'mallan.nyc' };

function vercelFetch(dep: unknown, status = 200) {
  return jest.fn(async () => ({ status, json: async () => dep }));
}

function tmpLedger() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-ledger-')), 'known-good.jsonl');
}

const readyDeployment = {
  id: DPL,
  readyState: 'READY',
  alias: ['mallan.nyc', 'www.mallan.nyc'],
  url: 'mallan-abc123.vercel.app',
  meta: { githubCommitSha: SHA },
};

const goodSmoke = {
  passed: true,
  observed_at: '2026-07-19T11:59:00.000Z',
  expected_sha: SHA,
  deployment_id: DPL,
  base_url: 'https://mallan.nyc',
  listing: { id: 'rls111', canonical_url: '/listing/foo-bar-slug/rls111' },
  probes: [
    { name: 'discovery', ok: true },
    { name: 'canonical-detail', ok: true },
    { name: 'id-alias', ok: true },
    { name: 'similar-api', ok: true },
    { name: 'open-houses-api', ok: true, proof: 'HTTP/JSON-CONTRACT-PROVEN' },
  ],
};

const baseOpts = () => ({
  ...creds,
  expectedSha: SHA,
  deploymentId: DPL,
  smokeEvidence: goodSmoke,
  fetchImpl: vercelFetch(readyDeployment),
  verifiedBy: 'test-suite',
  now: () => '2026-07-19T12:00:00.000Z',
});

describe('release-safety P2 — record-known-good (full identity chain)', () => {
  test('valid record: timestamp, deployment id, sha, ALIASES, url, verified_by, smoke binding, record class', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({ ...baseOpts(), ledgerPath });
    expect(result.recorded).toBe(true);
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      recorded_at: '2026-07-19T12:00:00.000Z',
      deployment_id: DPL,
      sha: SHA,
      aliases: ['mallan.nyc', 'www.mallan.nyc'],
      url: 'mallan-abc123.vercel.app',
      verified_by: 'test-suite',
      smoke_observed_at: '2026-07-19T11:59:00.000Z',
      record_class: ['LOCAL-RECORD', 'NOT-DURABLE', 'NOT-WORKFLOW-WIRED'],
    });
    expect(RECORD_LABELS).toEqual(['LOCAL-RECORD', 'NOT-DURABLE', 'NOT-WORKFLOW-WIRED']);
  });

  test('mandatory inputs: missing expectedSha, deploymentId, or smoke evidence => refused', async () => {
    const ledgerPath = tmpLedger();
    for (const patch of [
      { expectedSha: undefined },
      { deploymentId: undefined },
      { smokeEvidence: undefined },
    ]) {
      const result = await recordKnownGood({ ...baseOpts(), ledgerPath, ...patch });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('mandatory');
    }
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('smoke evidence must be PASSING and bound to the same sha + deployment', async () => {
    const ledgerPath = tmpLedger();
    const cases = [
      { smokeEvidence: { ...goodSmoke, passed: false }, needle: 'passed' },
      { smokeEvidence: { ...goodSmoke, expected_sha: 'deadbeef' }, needle: 'bound to sha' },
      { smokeEvidence: { ...goodSmoke, deployment_id: 'dpl_other' }, needle: 'bound to deployment' },
      { smokeEvidence: { ...goodSmoke, observed_at: undefined }, needle: 'observed_at' },
    ];
    for (const c of cases) {
      const result = await recordKnownGood({ ...baseOpts(), ledgerPath, smokeEvidence: c.smokeEvidence });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain(c.needle);
    }
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 1: non-READY deployment', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...baseOpts(),
      ledgerPath,
      fetchImpl: vercelFetch({ ...readyDeployment, readyState: 'BUILDING' }),
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('READY');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 2: SHA mismatch (fail-closed)', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...baseOpts(),
      ledgerPath,
      fetchImpl: vercelFetch({ ...readyDeployment, meta: { githubCommitSha: 'deadbeef' } }),
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('SHA_MISMATCH');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 3: mallan.nyc not among the proven aliases', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...baseOpts(),
      ledgerPath,
      fetchImpl: vercelFetch({ ...readyDeployment, alias: ['preview.mallan.nyc'] }),
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('not among the proven aliases');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('refusal 4: alias ownership cannot be proven (no alias metadata)', async () => {
    for (const alias of [undefined, []]) {
      const ledgerPath = tmpLedger();
      const result = await recordKnownGood({
        ...baseOpts(),
        ledgerPath,
        fetchImpl: vercelFetch({ ...readyDeployment, alias }),
      });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('alias ownership cannot be proven');
      expect(fs.existsSync(ledgerPath)).toBe(false);
    }
  });

  test('post-smoke reconfirmation: alias now served by a DIFFERENT deployment => refused', async () => {
    const ledgerPath = tmpLedger();
    const result = await recordKnownGood({
      ...baseOpts(),
      ledgerPath,
      fetchImpl: vercelFetch({ ...readyDeployment, id: 'dpl_newer' }),
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('deployment changed after the smoke');
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('duplicate deployment_id + sha is refused; a distinct deployment appends', async () => {
    const ledgerPath = tmpLedger();
    const first = await recordKnownGood({ ...baseOpts(), ledgerPath });
    expect(first.recorded).toBe(true);
    const dup = await recordKnownGood({ ...baseOpts(), ledgerPath });
    expect(dup.recorded).toBe(false);
    expect(dup.reason).toContain('duplicate');
    const other = await recordKnownGood({
      ...baseOpts(),
      ledgerPath,
      deploymentId: 'dpl_good2',
      smokeEvidence: { ...goodSmoke, deployment_id: 'dpl_good2' },
      fetchImpl: vercelFetch({ ...readyDeployment, id: 'dpl_good2' }),
    });
    expect(other.recorded).toBe(true);
    expect(fs.readFileSync(ledgerPath, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  test('no deployment resolves for the alias => not recorded', async () => {
    const result = await recordKnownGood({ ...baseOpts(), fetchImpl: vercelFetch({}, 404), ledgerPath: tmpLedger() });
    expect(result.recorded).toBe(false);
    expect(result.reason).toContain("no deployment resolves for alias 'mallan.nyc'");
  });

  test('smoke that targeted a NON-alias host (e.g. a preview URL) is refused', async () => {
    const ledgerPath = tmpLedger();
    for (const base_url of ['https://mallan-abc123-preview.vercel.app', 'not-a-url', undefined]) {
      const result = await recordKnownGood({
        ...baseOpts(),
        ledgerPath,
        smokeEvidence: { ...goodSmoke, base_url },
      });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('is not the alias host');
    }
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('fabricated passed:true evidence without successful required probes is refused', async () => {
    const ledgerPath = tmpLedger();
    const cases = [
      { ...goodSmoke, probes: undefined },
      { ...goodSmoke, probes: [] },
      { ...goodSmoke, probes: goodSmoke.probes.filter((p: { name: string }) => p.name !== 'similar-api') },
      { ...goodSmoke, probes: goodSmoke.probes.map((p: { name: string }) => (p.name === 'id-alias' ? { ...p, ok: false } : p)) },
    ];
    for (const smokeEvidence of cases) {
      const result = await recordKnownGood({ ...baseOpts(), ledgerPath, smokeEvidence });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('required probes');
    }
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });

  test('smoke without the probed listing identity is refused', async () => {
    const ledgerPath = tmpLedger();
    for (const listing of [undefined, null, { id: '', canonical_url: '' }, { id: 'rls111' }]) {
      const result = await recordKnownGood({
        ...baseOpts(),
        ledgerPath,
        smokeEvidence: { ...goodSmoke, listing },
      });
      expect(result.recorded).toBe(false);
      expect(result.reason).toContain('listing identity');
    }
    expect(fs.existsSync(ledgerPath)).toBe(false);
  });
});
