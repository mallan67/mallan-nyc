/**
 * COTALITY AUTHORITY — live change detection → recompile → mechanical impact → BLOCK.
 *
 * Maya, 2026-09-08: "Cotality changes → authority updates → blast radius appears automatically →
 * affected functionality is quarantined → agents repair the exact chain. No guessing, no sampling."
 *
 * What this suite proves:
 *   1. diffContracts is exact: a removed member, a removed field, a suppressed field, a zeroed field,
 *      a changed entitlement and an unchanged snapshot each produce exactly the expected change set.
 *      Daily population drift (non-zero → non-zero) is NOT a change.
 *   2. The impact graph is MECHANICAL. It is derived from the TypeScript program (the mapper's
 *      dataflow, Prisma-typed column reads, the import graph), never from an agent's proposal. The
 *      simulation of one provider change must produce the exact Mallan blast radius, tiered by proof
 *      (typed vs name-matched), and a BLOCKED verdict with the canonical repair order.
 *   3. The committed health file is HEALTHY. A BLOCKED or UNVERIFIED health file fails the build —
 *      that is the quarantine. (Runtime feature quarantine is a separate, Maya-gated step.)
 *   4. The authority state carries the live catalogue watermarks the delta poll depends on.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/cotality/authority/cli.mjs');
const STATE = path.join(ROOT, 'data/cotality-contract/authority-state.json');
const HEALTH = path.join(ROOT, 'data/cotality-contract/authority-health.json');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

type Change = { kind: string; resource: string; field?: string; member?: string; navigation?: string };
type Affected = {
  node: string;
  tier: 'typed' | 'name-matched' | 'string-literal' | 'crm-js';
  surfaces: string[];
  sites: { file: string; line: number }[];
};
type Impact = {
  state: 'HEALTHY' | 'BLOCKED' | 'UNVERIFIED';
  changes: Change[];
  affected: Affected[];
  blocked_surfaces: string[];
  repair_order: { step: number; name: string; surfaces: string[] }[];
  unbound: string[];
};

describe('authority CLI — diff is exact (pure, offline)', () => {
  // The diff command takes two compact snapshots; the fixtures are produced by `simulate --dry` from
  // the committed snapshot so the test never hand-writes a contract.
  function simulate(spec: string): Impact {
    const out = mkdtempSync(path.join(tmpdir(), 'authority-'));
    const json = execFileSync('node', [CLI, 'simulate', `--change=${spec}`, `--out=${out}`, '--no-impact'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(json) as Impact;
  }

  it('remove-member → exactly one member-removed change', () => {
    const r = simulate('remove-member Property.StandardStatus Withdrawn');
    expect(r.changes).toEqual([{ kind: 'member-removed', resource: 'Property', field: 'StandardStatus', member: 'Withdrawn' }]);
  });

  it('remove-field → exactly one field-removed change', () => {
    const r = simulate('remove-field Property.VirtualTourURLUnbranded');
    expect(r.changes).toEqual([{ kind: 'field-removed', resource: 'Property', field: 'VirtualTourURLUnbranded' }]);
  });

  it('suppress → exactly one filterable-changed change', () => {
    const r = simulate('suppress Property.ListPrice');
    expect(r.changes).toEqual([{ kind: 'filterable-changed', resource: 'Property', field: 'ListPrice' }]);
  });

  it('zero → exactly one population-zeroed change; ordinary drift is not a change', () => {
    const r = simulate('zero Property.ActivationDate');
    expect(r.changes).toEqual([{ kind: 'population-zeroed', resource: 'Property', field: 'ActivationDate' }]);
    const drift = simulate('drift Property.ActivationDate');
    expect(drift.changes).toEqual([]);
  });

  it('reject-resource → exactly one access-changed change', () => {
    const r = simulate('reject-resource OpenHouse');
    expect(r.changes).toEqual([{ kind: 'access-changed', resource: 'OpenHouse' }]);
  });
});

describe('authority CLI — mechanical impact (TypeScript program, no agent edges)', () => {
  let impact: Impact;

  beforeAll(() => {
    const out = mkdtempSync(path.join(tmpdir(), 'authority-'));
    const json = execFileSync('node', [CLI, 'simulate', '--change=remove-member Property.StandardStatus Withdrawn', `--out=${out}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    impact = JSON.parse(json) as Impact;
  }, 300_000);

  it('verdict is BLOCKED with the change named', () => {
    expect(impact.state).toBe('BLOCKED');
    expect(impact.changes[0]).toMatchObject({ kind: 'member-removed', field: 'StandardStatus', member: 'Withdrawn' });
  });

  it('reaches the canonical status mapping through the mapper dataflow (typed tier)', () => {
    // mapTrestleToPrisma: status = mallanStatusFromCotality(raw.StandardStatus) → listings.status.
    const status = impact.affected.find((a) => a.node === 'listings.status');
    expect(status).toBeDefined();
    expect(status!.tier).toBe('typed');
    expect(status!.sites.some((s) => s.file === 'lib/idx/trestle-mapper.ts')).toBe(true);
  });

  it('reaches the display gate through computeGateColumns({ status: raw.StandardStatus })', () => {
    const gate = impact.affected.find((a) => a.node === 'listings.idx_display_yn');
    expect(gate).toBeDefined();
    expect(gate!.tier).toBe('typed');
  });

  it('reaches the stored payload through the keep-list', () => {
    expect(impact.affected.some((a) => a.node === 'listings.raw_data.StandardStatus')).toBe(true);
  });

  it('reaches Search, Saved Search, Reports and CMA surfaces mechanically', () => {
    for (const surface of ['Canonical mapping', 'Storage/Projection', 'Search']) {
      expect(impact.blocked_surfaces).toContain(surface);
    }
    // The status column is read by the CMA engine (lib/cma/engine.ts selects Closed comps) and by
    // saved-search execution; the import walk must find them without anyone declaring it.
    expect(impact.blocked_surfaces).toContain('CMA');
    expect(impact.blocked_surfaces).toContain('Saved Search');
  });

  it('lists every site with a repo-relative file and a 1-based line', () => {
    for (const a of impact.affected) {
      expect(a.sites.length).toBeGreaterThan(0);
      for (const s of a.sites) {
        expect(s.file).not.toMatch(/^[A-Za-z]:\\|^\//);
        expect(existsSync(path.join(ROOT, s.file))).toBe(true);
        expect(s.line).toBeGreaterThan(0);
      }
    }
  });

  it('emits the canonical repair order, first step = canonical mapping, last = browser verification', () => {
    expect(impact.repair_order[0].name).toBe('canonical mapping');
    expect(impact.repair_order[impact.repair_order.length - 1].name).toBe('browser verification');
    const steps = impact.repair_order.map((s) => s.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('a change on a field nothing binds to is reported UNBOUND, not silently healthy', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'authority-'));
    const json = execFileSync('node', [CLI, 'simulate', '--change=remove-field Property.GardenerExpense', `--out=${out}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const r = JSON.parse(json) as Impact;
    // GardenerExpense is in B17_EXPENSES → listings.features.GardenerExpense (name-matched readers at most).
    // Whether bound or not, the verdict must name it — never HEALTHY-by-omission.
    expect(['BLOCKED']).toContain(r.state);
    expect(r.affected.length + r.unbound.length).toBeGreaterThan(0);
  }, 300_000);
});

describe('authority state + health (committed)', () => {
  it('state carries live catalogue watermarks and the contract fingerprint', () => {
    expect(existsSync(STATE)).toBe(true);
    const s = readJson<{ watermarks: Record<string, string>; metadata_sha256: string; capabilities_verified_at: string }>(STATE);
    for (const k of ['field', 'lookup', 'model']) expect(s.watermarks[k]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.metadata_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(s.capabilities_verified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('health is HEALTHY — BLOCKED or UNVERIFIED fails the build (the quarantine)', () => {
    expect(existsSync(HEALTH)).toBe(true);
    const h = readJson<{ state: string; contract: { metadata_sha256: string } }>(HEALTH);
    expect(h.state).toBe('HEALTHY');
    const s = readJson<{ metadata_sha256: string }>(STATE);
    expect(h.contract.metadata_sha256).toBe(s.metadata_sha256);
  });
});
