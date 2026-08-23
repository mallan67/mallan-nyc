/// <reference types="jest" />
/**
 * THE CACHED PROJECTION MUST NOT BECOME THE DELETED CAPTURE IN JSON CLOTHING.
 *
 * `data/cotality-contract.live.json` is generated from the authenticated API,
 * but being present in Git proves only that a file exists — not that a provider
 * fact was verified in the current session. The XML capture that was deleted in
 * this workstream answered provider questions for months on exactly that
 * confusion, and by the end it disagreed with the live API.
 *
 * So the reader validates provenance and structure on load and THROWS on any
 * failure. Every gate below is exercised with a real malformed fixture, because
 * a validation branch nobody has watched fail is a branch nobody knows works —
 * four checks in this workstream were silently vacuous before their negative
 * controls were written.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REAL = path.resolve(__dirname, '..', '..', '..', 'data', 'cotality-contract.live.json');

let tmp: string;
let original: string | undefined;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cotality-projection-'));
  original = process.env.COTALITY_CONTRACT_PATH;
});
afterAll(() => {
  if (original === undefined) delete process.env.COTALITY_CONTRACT_PATH;
  else process.env.COTALITY_CONTRACT_PATH = original;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/** Load the module fresh against a chosen projection file. */
function loadWith(file: string) {
  process.env.COTALITY_CONTRACT_PATH = file;
  let mod!: typeof import('../verified-contract');
  jest.isolateModules(() => {
    mod = require('../verified-contract');
  });
  return mod;
}

function fixture(mutate: (doc: any) => void, name: string): string {
  const doc = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  mutate(doc);
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(doc));
  return p;
}

describe('the committed projection is well-formed', () => {
  it('loads, validates, and reports where it came from', () => {
    const m = loadWith(REAL);
    const a = m.acquisition();
    expect(new URL(a.source).host).toBe('api.cotality.com');
    expect(Date.parse(a.acquiredAt)).toBeGreaterThan(0);
    expect(a.runId.length).toBeGreaterThan(0);
    expect(m.resources().length).toBeGreaterThan(10);
    expect(m.allFieldNames().size).toBeGreaterThan(1000);
  });

  it('resolves resource-qualified identity rather than a bare name', () => {
    const m = loadWith(REAL);
    // A bare name is not an identity: this one is declared on many resources.
    expect(m.declaringResources('StandardStatus').length).toBeGreaterThan(1);
    expect(m.field('Property', 'StandardStatus')).not.toBeNull();
    expect(m.field('Property', 'NotAFieldAnywhere')).toBeNull();
  });
});

describe('a projection that cannot prove its provenance is refused', () => {
  it('rejects a source host that is not the provider', () => {
    const f = fixture((d) => {
      d.source = 'https://example.invalid/odata/$metadata';
    }, 'host.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*source host/is);
  });

  it('rejects a source that is not a URL at all', () => {
    const f = fixture((d) => {
      d.source = 'not-a-url';
    }, 'nourl.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*not a URL/is);
  });

  it('rejects an unparseable acquisition timestamp', () => {
    const f = fixture((d) => {
      d.pulled_at = 'whenever';
    }, 'stamp.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*timestamp/is);
  });

  it('rejects a missing acquisition timestamp', () => {
    const f = fixture((d) => {
      delete d.pulled_at;
    }, 'nostamp.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED/i);
  });

  it('rejects an empty acquisition id', () => {
    const f = fixture((d) => {
      d.run_id = '   ';
    }, 'blankrun.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*acquisition id/is);
  });

  it('rejects a projection with no acquisition id at all', () => {
    // Anything produced before the current-run guarantee existed cannot say
    // where it came from, so it is not usable as a verified projection.
    const f = fixture((d) => {
      delete d.run_id;
    }, 'norun.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*acquisition id/is);
  });
});

describe('a structurally empty projection is refused, never treated as "nothing exists"', () => {
  it('rejects a projection declaring no resources', () => {
    // The dangerous case: an empty projection would answer every "does this
    // field exist" with "no" and pass every absence assertion in the suite.
    const f = fixture((d) => {
      d.entityTypes = {};
    }, 'noresources.json');
    const m = loadWith(f);
    expect(() => m.allFieldNames()).toThrow(/UNVERIFIED.*no resources/is);
  });

  it('rejects a projection declaring no enums', () => {
    const f = fixture((d) => {
      d.enums = {};
    }, 'noenums.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*no enums/is);
  });

  it('rejects a resource with no properties map', () => {
    const f = fixture((d) => {
      d.entityTypes.Property = { navigation: {} };
    }, 'noprops.json');
    const m = loadWith(f);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*properties map/is);
  });

  it('rejects an absent file', () => {
    const m = loadWith(path.join(tmp, 'does-not-exist.json'));
    expect(() => m.resources()).toThrow(/UNVERIFIED.*absent/is);
  });

  it('rejects unparseable JSON', () => {
    const p = path.join(tmp, 'broken.json');
    fs.writeFileSync(p, '{ not json');
    const m = loadWith(p);
    expect(() => m.resources()).toThrow(/UNVERIFIED.*unparseable/is);
  });
});

describe('the API does not let a cached answer be mistaken for a current one', () => {
  it('exposes no export claiming to be live', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'verified-contract.ts'), 'utf8');
    const exported = [...src.matchAll(/export function ([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThan(5);
    // Naming carries the distinction: nothing here may read as current-run truth.
    for (const name of exported) {
      expect(name.toLowerCase()).not.toContain('live');
      expect(name.toLowerCase()).not.toContain('current');
    }
  });

  it('every quoted fact can be attributed to an acquisition', () => {
    const m = loadWith(REAL);
    const a = m.acquisition();
    // A caller quoting a field fact can always state when and from where it came,
    // which is what separates a cached answer from a current-run one.
    expect(Object.keys(a).sort()).toEqual(['acquiredAt', 'runId', 'source']);
  });
});
