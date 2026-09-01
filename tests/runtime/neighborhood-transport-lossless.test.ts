/// <reference types="jest" />
/**
 * A PROVIDER VALUE MUST SURVIVE THE WIRE UNCHANGED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * The browser serialised the neighbourhood selection with `join(',')`, the wire
 * carried one `neighborhood` parameter, and the executor read it with
 * `split(',')`. Two of the accepted Cotality names contain a comma —
 * `Williamsburg,North` and `Williamsburg,South` — so:
 *
 *     ["Williamsburg,North"]  ->  neighborhood=Williamsburg%2CNorth
 *                             ->  ["Williamsburg", "North"]
 *
 * The broker's criterion changed before it reached the authority. That is not a
 * formatting problem; the executor answered a question nobody asked.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE EXISTING TEST MISSED IT
 *
 * `neighborhood-one-vocabulary` proves every live value is "searchable" by
 * calling `neighborhoodOData([name])` directly — which skips the serializer, the
 * query string and the route parser, i.e. exactly the three hops that corrupt it.
 * A criterion is only searchable if it survives the path a broker actually uses.
 *
 * So this drives the REAL chain: the shipped api-client builds the URL, a real
 * URLSearchParams parses it, and the real executor turns it into OData.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { identityFor } from '@/lib/search/canonical/subdivision-vocabulary.generated';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

/**
 * Load the SHIPPED api-client and capture the URL it builds for a search.
 * Nothing is reimplemented — the transport under test is the transport that runs.
 */
function makeWire(): (params: Record<string, unknown>) => string {
  let captured = '';
  const win: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {
    window: win,
    console,
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: (url: string) => {
      captured = url;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ listings: [] }) });
    },
    setTimeout,
    clearTimeout,
    location: { pathname: '/crm/', origin: 'https://mallan.nyc' },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('public/crm/js/core/api-client.js'), sandbox);

  const api = (win.MallanAPI ?? sandbox.MallanAPI) as
    | { idx: { search(p: Record<string, unknown>): Promise<unknown> } }
    | undefined;
  if (!api?.idx?.search) throw new Error('api-client did not expose MallanAPI.idx.search');

  return (params) => {
    captured = '';
    void api.idx.search(params);
    if (!captured) throw new Error('api-client built no request URL');
    return captured;
  };
}

/** browser params -> real URL -> real URLSearchParams -> real executor. */
function filterFor(wire: (p: Record<string, unknown>) => string, params: Record<string, unknown>): string {
  const url = wire(params);
  const query = url.slice(url.indexOf('?') + 1);
  return buildCrmIdxODataFilter(new URLSearchParams(query));
}

describe('a neighbourhood survives browser -> wire -> route -> executor intact', () => {
  const wire = makeWire();

  it('the harness really drives the shipped client', () => {
    // Guard the guard. If the URL were built here instead of by api-client.js,
    // every case below would test a reimplementation of the bug-free version.
    const url = wire({ neighborhood: ['Tribeca'] });
    expect(url).toContain('/api/idx/search?');
    expect(url).toContain('neighborhood=Tribeca');
  });

  it.each([
    ['Williamsburg,North'],
    ['Williamsburg,South'],
  ])('a LITERAL-COMMA provider name arrives whole: %s', (name) => {
    // The exact corruption. Under the old transport this produced clauses for
    // `Williamsburg` and `North`.
    const identity = identityFor(name);
    expect(`${name}:known`).toBe(`${name}:${identity ? 'known' : 'UNKNOWN-TO-VOCABULARY'}`);

    const filter = filterFor(wire, { neighborhood: [name] });
    expect(filter).toContain(`SubdivisionName eq '${name}'`);
    // …and it did NOT become two criteria.
    expect(filter).not.toMatch(/SubdivisionName eq 'North'/);
    expect(filter).not.toMatch(/SubdivisionName eq 'South'/);
    // Exactly one neighbourhood group.
    expect((filter.match(/CityRegion eq /g) ?? []).length).toBe(1);
  });

  it('two ordinary neighbourhoods still travel as two', () => {
    const filter = filterFor(wire, { neighborhood: ['Tribeca', 'Yorkville'] });
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
    expect(filter).toContain("SubdivisionName eq 'Yorkville'");
    expect((filter.match(/CityRegion eq /g) ?? []).length).toBe(2);
  });

  it('a QUALIFIED name survives its parentheses', () => {
    const filter = filterFor(wire, { neighborhood: ['Bay Terrace (Queens)'] });
    expect(filter).toContain("CityRegion eq 'Queens'");
    expect(filter).toContain("SubdivisionName eq 'Bay Terrace'");
    expect(filter).not.toContain("CityRegion eq 'StatenIsland'");
  });

  it('a literal-comma name COMBINED with an ordinary one keeps both, and only both', () => {
    // The case that proves the separator is gone rather than merely tolerated.
    const filter = filterFor(wire, { neighborhood: ['Williamsburg,North', 'Tribeca'] });
    expect(filter).toContain("SubdivisionName eq 'Williamsburg,North'");
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
    expect((filter.match(/CityRegion eq /g) ?? []).length).toBe(2);
    expect(filter).not.toMatch(/SubdivisionName eq 'North'/);
  });

  it('the wire carries ONE parameter per neighbourhood', () => {
    const url = wire({ neighborhood: ['Williamsburg,North', 'Tribeca'] });
    const query = url.slice(url.indexOf('?') + 1);
    expect(new URLSearchParams(query).getAll('neighborhood')).toEqual([
      'Williamsburg,North', 'Tribeca',
    ]);
  });

  it('an unknown name is still refused after the round trip', () => {
    // Transport must not turn a refusal into a pass.
    expect(() => filterFor(wire, { neighborhood: ['Nonexistent Heights'] })).toThrow();
  });

  it('and a bare ambiguous name is still ambiguous after the round trip', () => {
    expect(() => filterFor(wire, { neighborhood: ['Bay Terrace'] })).toThrow();
  });
});
