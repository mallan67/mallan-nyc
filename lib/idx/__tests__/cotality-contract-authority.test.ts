/// <reference types="jest" />
/**
 * A STALE SNAPSHOT MUST NOT BE ABLE TO PRODUCE A GREEN VALIDATOR.
 *
 * This suite exists because that already happened twice in this workstream. A
 * validator was perfectly green while enforcing a false rename table, and the
 * first version of the CRM contract generator defaulted to reading
 * artifacts/metadata.xml - a capture dated 2026-06-04 which ALREADY DISAGREES
 * with the live API: it declares OwnerOptOut, a field that exists on no live
 * Cotality resource.
 *
 * "All tests green" is therefore not evidence of provider correctness unless the
 * generation chain itself makes stale authority impossible. These tests attack
 * the chain rather than the output.
 *
 * THE CHAIN, AND THE ONLY PERMITTED SHAPE OF IT:
 *
 *   LIVE COTALITY API -> pull-contract.mjs -> data/cotality-contract.live.json
 *                                          -> build-crm-field-contract.mjs
 *                                          -> CRM subset -> Mallan validation
 *
 * Every test below feeds the generator something it must refuse.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

const REPO = path.resolve(__dirname, '..', '..', '..');
const GENERATOR = 'scripts/cotality/build-crm-field-contract.mjs';
const LIVE_CONTRACT = path.join(REPO, 'data/cotality-contract.live.json');
const CANONICAL = path.join(REPO, 'data/cotality-contract/crm-field-contract.json');

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cotality-authority-'));
});
afterAll(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/** Run the generator with `--no-acquire`, which skips re-fetch but keeps EVERY gate. */
function runGenerator(extra: string[]): { status: number; stderr: string; stdout: string } {
  const r = spawnSync(process.execPath, [GENERATOR, '--no-acquire', ...extra], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return { status: r.status ?? -1, stderr: r.stderr || '', stdout: r.stdout || '' };
}

function liveFixture(mutate: (doc: any) => void, name: string): string {
  const doc = JSON.parse(fs.readFileSync(LIVE_CONTRACT, 'utf8'));
  mutate(doc);
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(doc));
  return p;
}

describe('the committed contract really came from the live API', () => {
  it('is stamped VERIFIED_LIVE and sourced from api.cotality.com', () => {
    const c = JSON.parse(fs.readFileSync(CANONICAL, 'utf8'));
    expect(c.verificationState).toBe('VERIFIED_LIVE');
    expect(new URL(c.liveSource).host).toBe('api.cotality.com');
    expect(Date.parse(c.livePulledAt)).toBeGreaterThan(0);
    // Nothing the provider failed to declare may survive into the shipped file.
    expect(c.rejected).toEqual({});
    expect(c.fieldCount).toBeGreaterThan(50);
  });

  it('carries no provider namespace text', () => {
    // The namespace is Cotality's implementation detail. Mallan stores the
    // semantic facts - enum type name, primitive type, nullability, length - and
    // deliberately not the qualified path.
    expect(fs.readFileSync(CANONICAL, 'utf8')).not.toContain('DataStandard');
    expect(fs.readFileSync(LIVE_CONTRACT, 'utf8')).not.toContain('DataStandard');
  });

  it('records enum member counts that match the live vocabulary', () => {
    const c = JSON.parse(fs.readFileSync(CANONICAL, 'utf8'));
    // 11 StandardStatus members, verified live 2026-08-23. If the contract were
    // ever rebuilt from the stale capture this number is where it would show.
    expect(c.fields.StandardStatus.enumType).toBe('StandardStatus');
    expect(c.fields.StandardStatus.memberCount).toBe(11);
    expect(c.fields.PropertyType.memberCount).toBe(13);
  });
});

describe('a contract that is not provably live is refused', () => {
  it('refuses a source host that is not the live provider', () => {
    const f = liveFixture((d) => {
      d.source = 'https://example.invalid/odata/$metadata';
    }, 'wrong-host.json');
    const r = runGenerator(['--live-contract', f, '--out', path.join(tmp, 'o1.json')]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('UNVERIFIED');
    expect(r.stderr).toMatch(/source host/i);
  });

  it('refuses a contract that was not pulled in this run', () => {
    const f = liveFixture((d) => {
      d.pulled_at = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    }, 'stale.json');
    const r = runGenerator(['--live-contract', f, '--out', path.join(tmp, 'o2.json')]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('UNVERIFIED');
    expect(r.stderr).toMatch(/minutes old/i);
  });

  it('refuses a contract with no usable timestamp', () => {
    const f = liveFixture((d) => {
      delete d.pulled_at;
    }, 'no-stamp.json');
    const r = runGenerator(['--live-contract', f, '--out', path.join(tmp, 'o3.json')]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('UNVERIFIED');
  });

  it('treats a missing live contract as UNVERIFIED, never as empty success', () => {
    const r = runGenerator([
      '--live-contract',
      path.join(tmp, 'does-not-exist.json'),
      '--out',
      path.join(tmp, 'o4.json'),
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('UNVERIFIED');
    // An absent provider contract must never yield a zero-field "success".
    expect(fs.existsSync(path.join(tmp, 'o4.json'))).toBe(false);
  });
});

describe('offline mode cannot become authority', () => {
  it('refuses to write the canonical contract', () => {
    const r = spawnSync(
      process.execPath,
      [GENERATOR, '--offline-unverified'],
      { cwd: REPO, encoding: 'utf8' },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('UNVERIFIED');
    expect(r.stderr).toMatch(/refusing to write the canonical contract/i);
  });

  it('stamps its own output UNVERIFIED when writing elsewhere', () => {
    const out = path.join(tmp, 'offline.json');
    const r = spawnSync(
      process.execPath,
      [GENERATOR, '--offline-unverified', '--out', out],
      { cwd: REPO, encoding: 'utf8' },
    );
    expect(r.status).toBe(0);
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
    // It produced a file, and the file says plainly that it is not authority.
    expect(doc.verificationState).toBe('UNVERIFIED');
  });
});

describe('the stale capture cannot re-enter the chain', () => {
  it('the generator does not read artifacts/metadata.xml at all', () => {
    const src = fs.readFileSync(path.join(REPO, GENERATOR), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Named only in the explanatory header, never in executable code.
    expect(code).not.toContain('metadata.xml');
  });

  it('an XML snapshot is not accepted as a live contract', () => {
    const r = runGenerator([
      '--live-contract',
      'artifacts/metadata.xml',
      '--out',
      path.join(tmp, 'o5.json'),
    ]);
    expect(r.status).not.toBe(0);
  });

  it('the capture and the live API genuinely disagree, which is why this matters', () => {
    // The concrete divergence: the capture declares OwnerOptOut; the live contract
    // declares it on no resource. If this ever stops being true the test should be
    // re-examined, not deleted - the point is that a snapshot drifts and the live
    // API does not.
    const capture = path.join(REPO, 'artifacts/metadata.xml');
    if (!fs.existsSync(capture)) return; // retired; nothing to prove
    expect(fs.readFileSync(capture, 'utf8')).toContain('OwnerOptOut');

    const live = JSON.parse(fs.readFileSync(LIVE_CONTRACT, 'utf8'));
    const declaringResources = Object.keys(live.entityTypes).filter(
      (r) => live.entityTypes[r]?.properties?.OwnerOptOut,
    );
    expect(declaringResources).toEqual([]);
  });

  it('a consumed field absent from the live contract is REJECTED, not quietly dropped', () => {
    // Simulate the provider retiring a field the CRM still names. The generator
    // must fail loudly rather than emit a smaller contract that still looks valid.
    const f = liveFixture((d) => {
      delete d.entityTypes.Property.properties.StandardStatus;
      delete d.entityTypes.Media.properties.StandardStatus;
    }, 'missing-field.json');
    const r = runGenerator(['--live-contract', f, '--out', path.join(tmp, 'o6.json')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('REJECTED');
    expect(r.stderr).toContain('StandardStatus');
  });

  it('an enum with no verifiable members is REJECTED', () => {
    // A field whose value space cannot be verified is not usable as a contract:
    // "the enum exists" is not the same claim as "these are its values".
    const f = liveFixture((d) => {
      d.enums.StandardStatus = [];
    }, 'empty-enum.json');
    const r = runGenerator(['--live-contract', f, '--out', path.join(tmp, 'o7.json')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no verifiable members/i);
  });
});

describe('the two contracts have distinct, non-competing roles', () => {
  it('the CRM subset never exceeds the live contract', () => {
    const live = JSON.parse(fs.readFileSync(LIVE_CONTRACT, 'utf8'));
    const crm = JSON.parse(fs.readFileSync(CANONICAL, 'utf8'));
    const declaredAnywhere = new Set<string>();
    for (const r of crm.resources) {
      const rt = live.entityTypes[r];
      for (const k of Object.keys(rt.properties || {})) declaredAnywhere.add(k);
      for (const k of Object.keys(rt.navigation || {})) declaredAnywhere.add(k);
    }
    const excess = Object.keys(crm.fields).filter((f) => !declaredAnywhere.has(f));
    // The subset is derivable from the live contract alone. It may never add to,
    // override, or contradict it.
    expect(excess).toEqual([]);
    expect(Object.keys(crm.fields).length).toBeLessThan(declaredAnywhere.size);
  });
});
