/**
 * ONE COTALITY INTERPRETATION BOUNDARY — ratchet.
 *
 * Maya, 2026-09-08: "Raw Cotality interpretation outside the approved authority/mapping boundary =
 * impossible to compile/build." Search, Reports, CMA, Map, Saved Search, UI consume verified Mallan
 * canonical facts; only the declared boundary modules may read provider names.
 *
 * The census is mechanical (scripts/cotality/authority/impact.mjs boundaryCensus): every property
 * access, string literal or JSON-key read named exactly a live Cotality field, in lib/ and app/,
 * outside the declared boundary (data/cotality-contract/boundary.json → `boundary`).
 *
 * RATCHET: the committed baseline (data/cotality-contract/boundary-baseline.json) lists today's
 * violations by `file::field`. This test FAILS on any key not in the baseline — a new raw read is a
 * build failure from now on — and PASSES while the set shrinks. Repairing a site = delete it from the
 * code, regenerate the baseline (`npm run cotality:authority -- boundary --write-baseline`), commit
 * both. The baseline may only ever get smaller; a larger one is a refused change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/cotality/authority/cli.mjs');
const BOUNDARY = path.join(ROOT, 'data/cotality-contract/boundary.json');
const BASELINE = path.join(ROOT, 'data/cotality-contract/boundary-baseline.json');

type Census = {
  boundary: string[];
  violations: { key: string; file: string; field: string; tier: string; sites: number }[];
  counts: { files: number; keys: number; sites: number };
};

describe('one Cotality interpretation boundary', () => {
  let census: Census;

  beforeAll(() => {
    const json = execFileSync('node', [CLI, 'boundary'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    census = JSON.parse(json) as Census;
  }, 300_000);

  it('the boundary is declared in the repo, not inferred', () => {
    expect(existsSync(BOUNDARY)).toBe(true);
    const declared = JSON.parse(readFileSync(BOUNDARY, 'utf8')) as { boundary: string[] };
    expect(declared.boundary.length).toBeGreaterThan(0);
    expect(census.boundary).toEqual(declared.boundary);
  });

  it('no raw Cotality read exists outside the boundary beyond the committed baseline (ratchet)', () => {
    expect(existsSync(BASELINE)).toBe(true);
    const baseline = new Set((JSON.parse(readFileSync(BASELINE, 'utf8')) as { keys: string[] }).keys);
    const fresh = census.violations.map((v) => v.key).filter((k) => !baseline.has(k));
    expect(fresh).toEqual([]);
  });

  it('reports the remaining debt so it is never invisible', () => {
    const baseline = (JSON.parse(readFileSync(BASELINE, 'utf8')) as { keys: string[] }).keys;
    const present = new Set(census.violations.map((v) => v.key));
    const repaired = baseline.filter((k) => !present.has(k));
    // Informational: a repaired site still in the baseline means the baseline should shrink.
    // eslint-disable-next-line no-console
    console.log(`[boundary] ${census.counts.sites} raw-read sites across ${census.counts.files} files (${census.counts.keys} file::field keys); repaired-but-still-listed: ${repaired.length}`);
    expect(census.counts.keys).toBeGreaterThanOrEqual(0);
  });
});
