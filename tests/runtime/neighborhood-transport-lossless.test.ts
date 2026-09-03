/// <reference types="jest" />
/**
 * A NEIGHBOURHOOD SURVIVES EVERY HOP, STARTING AT THE SERIALIZER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * The browser serialised the selection with `join(',')`, the wire carried one
 * `neighborhood` parameter, and the executor read it with `split(',')`. Two
 * accepted Cotality names contain a comma — `Williamsburg,North` and
 * `Williamsburg,South` — so:
 *
 *     ["Williamsburg,North"]  ->  neighborhood=Williamsburg%2CNorth
 *                             ->  ["Williamsburg", "North"]
 *
 * The criterion changed before the authority saw it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS STARTS WHERE IT DOES
 *
 * The first version of this suite began at `MallanAPI.idx.search({...})`, so it
 * proved api-client -> URL -> parser -> executor and SKIPPED
 * `buildIdxSearchParams()` — the hop that did the joining. Claiming it proved the
 * whole browser-to-executor chain was an overstatement.
 *
 * That matters here more than most places: this project has repeatedly had one hop
 * correct while the adjacent hop silently changed the criterion, and each defect
 * survived its own fix by being tested from the middle. So this mounts the SHIPPED
 * form and the SHIPPED scripts and runs:
 *
 *   broker criteria
 *     -> real buildIdxSearchParams()   (search-engine.js)
 *     -> real MallanAPI.idx.search()   (api-client.js)
 *     -> the URL that would go out
 *     -> real URLSearchParams
 *     -> real buildCrmIdxODataFilter() -> real geography executor
 *
 * Nothing is reimplemented. Same mount pattern as the financing canonical-path
 * suite, for the same reason.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { identityFor } from '@/lib/search/canonical/subdivision-vocabulary.generated';

const REPO = join(__dirname, '..', '..');
const FORM = readFileSync(join(REPO, 'public/crm/html/search-form-and-results.html'), 'utf8');

interface Mounted {
  win: Record<string, unknown> & { buildIdxSearchParams(c: unknown): Record<string, unknown> };
  requests: string[];
}

function mount(): Mounted {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${FORM}</body></html>`, {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = dom.window as any;

  const requests: string[] = [];
  win.fetch = (url: string) => {
    requests.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ listings: [], total: 0 }),
    });
  };
  win.listings = [];
  win.searchResultsState = { filteredListings: [], currentPage: 1, selectedListings: [] };
  win.LOGGED_IN_AGENT = { id: 1 };
  win.showToast = () => {};
  win.initializeSearchResults = () => {};
  win.updateResultsCount = () => {};
  win.refreshResultsMap = () => {};
  win.updateStickyNavActive = () => {};
  win.resolveNeighborhoodCanonical = () => {};

  for (const rel of [
    'public/crm/js/core/nav.js',
    'public/crm/js/core/api-client.js',
    'public/crm/js/search/date-range-picker.js',
    'public/crm/js/search/search-engine.js',
  ]) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }
  win.toggleSearchTab('sale');
  return { win, requests };
}

/**
 * criteria -> REAL serializer -> REAL api client -> URL -> REAL executor.
 * Every hop is the shipped code.
 */
async function runChain(m: Mounted, neighborhoods: string[]): Promise<{ url: string; filter: string }> {
  m.requests.length = 0;
  const params = m.win.buildIdxSearchParams({ neighborhoods });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (m.win as any).MallanAPI.idx.search(params);
  const url = m.requests.find((u) => u.includes('/api/idx/search'));
  if (!url) throw new Error('no /api/idx/search request was made');
  const query = url.slice(url.indexOf('?') + 1);
  return { url, filter: buildCrmIdxODataFilter(new URLSearchParams(query)) };
}

describe('a neighbourhood survives serializer -> wire -> route -> executor', () => {
  let m: Mounted;
  beforeAll(() => { m = mount(); });

  it('the harness really drives the shipped serializer and client', () => {
    // Guard the guard. If either were reimplemented here, every case below would
    // test a bug-free copy rather than the code that ships.
    expect(typeof m.win.buildIdxSearchParams).toBe('function');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (m.win as any).MallanAPI?.idx?.search).toBe('function');
  });

  it.each([['Williamsburg,North'], ['Williamsburg,South']])(
    'a LITERAL-COMMA provider name arrives whole: %s',
    async (name) => {
      // The exact corruption. Under the old transport this produced clauses for
      // `Williamsburg` and `North`.
      expect(`${name}:known`).toBe(`${name}:${identityFor(name) ? 'known' : 'UNKNOWN-TO-VOCABULARY'}`);
      const { filter } = await runChain(m, [name]);
      expect(filter).toContain(`SubdivisionName eq '${name}'`);
      expect(filter).not.toMatch(/SubdivisionName eq 'North'/);
      expect(filter).not.toMatch(/SubdivisionName eq 'South'/);
      expect((filter.match(/CityRegion eq /g) ?? []).length).toBe(1);
    },
  );

  it('two ordinary neighbourhoods still travel as two', async () => {
    const { filter } = await runChain(m, ['Tribeca', 'Yorkville']);
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
    expect(filter).toContain("SubdivisionName eq 'Yorkville'");
    expect((filter.match(/CityRegion eq /g) ?? []).length).toBe(2);
  });

  it('a QUALIFIED name survives its parentheses and scopes its borough', async () => {
    const { filter } = await runChain(m, ['Bay Terrace (Queens)']);
    expect(filter).toContain("CityRegion eq 'Queens'");
    expect(filter).toContain("SubdivisionName eq 'Bay Terrace'");
    expect(filter).not.toContain("CityRegion eq 'StatenIsland'");
  });

  it('a literal-comma name COMBINED with an ordinary one keeps both, and only both', async () => {
    const { filter } = await runChain(m, ['Williamsburg,North', 'Tribeca']);
    expect(filter).toContain("SubdivisionName eq 'Williamsburg,North'");
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
    expect((filter.match(/CityRegion eq /g) ?? []).length).toBe(2);
    expect(filter).not.toMatch(/SubdivisionName eq 'North'/);
  });

  it('the wire carries ONE parameter per neighbourhood', async () => {
    const { url } = await runChain(m, ['Williamsburg,North', 'Tribeca']);
    const query = url.slice(url.indexOf('?') + 1);
    expect(new URLSearchParams(query).getAll('neighborhood')).toEqual([
      'Williamsburg,North', 'Tribeca',
    ]);
  });

  it('an unknown neighbourhood is still refused after the round trip', async () => {
    await expect(runChain(m, ['Nonexistent Heights'])).rejects.toThrow();
  });

  it('a bare ambiguous neighbourhood is still ambiguous after the round trip', async () => {
    await expect(runChain(m, ['Bay Terrace'])).rejects.toThrow();
  });

  it('an IMPOSSIBLE borough qualifier is refused, not quietly corrected', async () => {
    // `Tribeca (Queens)` used to resolve to Tribeca in MANHATTAN, because the sole
    // candidate was returned before the qualifier was read. The agent asked for
    // Queens and was handed Manhattan.
    await expect(runChain(m, ['Tribeca (Queens)'])).rejects.toThrow(/not in the borough given/i);
    // …while the CORRECT qualifier still works, so the rule is not "refuse
    // everything qualified".
    const { filter } = await runChain(m, ['Tribeca (Manhattan)']);
    expect(filter).toContain("CityRegion eq 'Manhattan'");
    expect(filter).toContain("SubdivisionName eq 'Tribeca'");
  });
});
