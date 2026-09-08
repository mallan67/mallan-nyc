/**
 * The generated Cotality contract is the machine-enforced provider truth every agent binds to.
 *
 * WHY THIS EXISTS (Maya, 2026-09-08): "every field, every string has effect on the entire system"
 * and no agent can be made to KNOW the API — its knowledge is whatever is in its context when it
 * types a line. So the contract is generated from the live API into TypeScript and the COMPILER
 * refuses code that disagrees with it. This test guards the generated artifact itself:
 *
 *   1. it exists and was produced by the generator from the committed compact snapshot
 *      (`--check` regenerates in memory and must match byte-for-byte — no hand edits, no drift);
 *   2. the snapshot was MEASURED (probe mode light/full), never schema-only: every field of every
 *      accessible resource carries a boolean `filterable` and a numeric `populated`;
 *   3. the generated module agrees with the compact snapshot (fingerprint, resource + field counts);
 *   4. it agrees with the older enum snapshot (data/cotality-enums.live.json) — two live pulls of the
 *      same vocabulary may not disagree; if they do, one is stale and must be regenerated.
 *
 * Nothing here asserts a live provider VALUE (populations drift daily). Live truth is re-measured by
 * `npm run cotality:compile:light && npm run cotality:generate`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'scripts/cotality/generate-contract-types.mjs');
const GENERATED = path.join(ROOT, 'lib/cotality/generated/contract.ts');
const COMPACT = path.join(ROOT, 'data/cotality-contract/contract.compact.json');
const LOOKUPS = path.join(ROOT, 'data/cotality-contract/lookups.live.json');
const ENUM_SNAPSHOT = path.join(ROOT, 'data/cotality-enums.live.json');

type CompactField = {
  type: string;
  filterable: boolean | null;
  populated: number | null;
};
type CompactResource = {
  access: { state: 'accessible' | 'rejected' | 'unmeasured'; http: number | null };
  fields: Record<string, CompactField>;
};
type Compact = {
  format: string;
  probe_mode: 'light' | 'full' | 'schema-only';
  fingerprint: { metadata_sha256: string; evidence_sha256: string };
  resourceCount: number;
  fieldCount: number;
  resources: Record<string, CompactResource>;
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

describe('generated Cotality contract — artifact integrity', () => {
  it('generator, compact snapshot, lookup snapshot and generated module all exist', () => {
    expect(existsSync(GENERATOR)).toBe(true);
    expect(existsSync(COMPACT)).toBe(true);
    expect(existsSync(LOOKUPS)).toBe(true);
    expect(existsSync(GENERATED)).toBe(true);
  });

  it('the generated module is byte-identical to a regeneration from the committed snapshot (--check)', () => {
    // A hand edit, a stale file, or a generator change without regeneration all fail here.
    const out = execFileSync('node', [GENERATOR, '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('CHECK OK');
  });

  it('the snapshot was measured live (light/full), not schema-only', () => {
    const compact = readJson<Compact>(COMPACT);
    expect(compact.format).toBe('mallan-cotality-contract-compact/v1');
    expect(['light', 'full']).toContain(compact.probe_mode);
  });

  it('every field of every accessible resource carries a measured filterable fact, and a count whenever it is filterable', () => {
    // A field the provider suppresses from $filter cannot be COUNTED through $filter either, so its
    // population is recorded as null = UNMEASURABLE (never guessed). Every filterable field must carry
    // the live @odata.count.
    const compact = readJson<Compact>(COMPACT);
    const missing: string[] = [];
    let accessible = 0;
    for (const [resource, r] of Object.entries(compact.resources)) {
      if (r.access.state !== 'accessible') continue;
      accessible += 1;
      for (const [field, f] of Object.entries(r.fields)) {
        if (typeof f.filterable !== 'boolean') missing.push(`${resource}.${field}: filterable unmeasured`);
        else if (f.filterable && typeof f.populated !== 'number') missing.push(`${resource}.${field}: filterable but no count`);
        else if (!f.filterable && f.populated !== null) missing.push(`${resource}.${field}: not filterable yet claims a count`);
      }
    }
    expect(accessible).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('the generated module carries the snapshot fingerprint and the full resource/field census', async () => {
    const compact = readJson<Compact>(COMPACT);
    const generated = await import('@/lib/cotality/generated/contract');
    expect(generated.COTALITY_CONTRACT.metadata_sha256).toBe(compact.fingerprint.metadata_sha256);
    expect(generated.COTALITY_CONTRACT.evidence_sha256).toBe(compact.fingerprint.evidence_sha256);
    expect(generated.COTALITY_CONTRACT.probe_mode).toBe(compact.probe_mode);

    const resources = Object.keys(generated.COTALITY_FIELD_FACTS);
    expect(resources.sort()).toEqual(Object.keys(compact.resources).sort());
    expect(resources.length).toBe(compact.resourceCount);

    let fields = 0;
    for (const resource of resources) {
      const facts = generated.COTALITY_FIELD_FACTS[resource as keyof typeof generated.COTALITY_FIELD_FACTS] as Record<string, unknown>;
      const expected = Object.keys(compact.resources[resource].fields).sort();
      expect(Object.keys(facts).sort()).toEqual(expected);
      fields += expected.length;
    }
    expect(fields).toBe(compact.fieldCount);
  });

  it('agrees with data/cotality-enums.live.json on every published vocabulary (no second opinion)', () => {
    const lookups = readJson<Record<string, Record<string, { members: string[] }>>>(LOOKUPS);
    const snapshot = readJson<{ resources: Record<string, Record<string, string[]>> }>(ENUM_SNAPSHOT);
    const disagreements: string[] = [];
    for (const [resource, fields] of Object.entries(snapshot.resources)) {
      for (const [field, members] of Object.entries(fields)) {
        const mine = lookups[resource]?.[field]?.members;
        if (!mine) {
          disagreements.push(`${resource}.${field}: absent from lookups.live.json`);
          continue;
        }
        const a = [...new Set(members)].sort().join('|');
        const b = [...new Set(mine)].sort().join('|');
        if (a !== b) disagreements.push(`${resource}.${field}: ${members.length} vs ${mine.length} members`);
      }
    }
    expect(disagreements).toEqual([]);
  });
});
