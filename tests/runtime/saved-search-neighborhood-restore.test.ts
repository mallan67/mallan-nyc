/// <reference types="jest" />
/**
 * AN AMBIGUOUS SAVED NEIGHBOURHOOD MUST NOT AUTO-RUN A BROADER SEARCH.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `_criteriaToFormFields()` collects `_restoreIssues` precisely so a criterion
 * that cannot be restored blocks execution — a search that runs with fewer
 * criteria than were saved is broader than the one the broker saved.
 *
 * The neighbourhood branch detected ambiguous and unknown values, showed a toast,
 * and returned WITHOUT adding an issue. So the gate saw a clean restore, the
 * server's disposition said executable — it classifies checkbox criteria and
 * knows nothing about geography ambiguity — and `performSearch()` fired.
 *
 * A legacy record saved as bare `Bay Terrace` therefore ran without its
 * neighbourhood criterion at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST EXECUTES THE MODULE
 *
 * The existing restore suite greps source for issue strings, and its cases cover
 * missing/disabled checkbox controls and malformed values — none of which touch
 * geography. A source grep cannot tell whether `performSearch()` was CALLED, and
 * that is the whole question here. So this loads the shipped `saved-searches.js`
 * together with the shipped `neighborhood-autocomplete.js`, feeds them the real
 * generated vocabulary, and watches whether the search actually runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
const VOCAB = JSON.parse(read('public/crm/data/neighborhood-vocabulary.generated.json'));

interface Harness {
  load(neighborhoods: string[]): Promise<void>;
  searched: boolean;
  issues: string[];
  toasts: string[];
  restored: Array<{ name: string; borough: string; boroughLevel: boolean }>;
}

/** A DOM stub that is present enough for the restore path, and no more. */
function makeElement() {
  return {
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    style: { display: '' },
    dataset: {} as Record<string, string>,
    value: '',
    textContent: '',
    checked: false,
    disabled: false,
    innerHTML: '',
    options: [] as unknown[],
    children: [] as unknown[],
    querySelectorAll: () => [],
    querySelector: () => null,
    getAttribute: () => null,
    setAttribute() {},
    addEventListener() {},
    dispatchEvent() {},
    appendChild() {},
    click() {},
    focus() {},
    closest: () => null,
  };
}

async function harness(): Promise<Harness> {
  const state: Harness = {
    searched: false, issues: [], toasts: [], restored: [],
    load: async () => {},
  };
  const listeners: Record<string, Array<() => void>> = {};
  const win: Record<string, unknown> = {};

  const sandbox: Record<string, unknown> = {
    window: win,
    console,
    CustomEvent: class { constructor(public type: string) {} },
    document: {
      dispatchEvent: (e: { type: string }) => (listeners[e.type] ?? []).forEach((f) => f()),
      addEventListener: (t: string, f: () => void) => { (listeners[t] ??= []).push(f); },
      getElementById: () => makeElement(),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => makeElement(),
      body: makeElement(),
    },
    fetch: (url: string) => {
      expect(url).toBe('/crm/data/neighborhood-vocabulary.generated.json');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(VOCAB) });
    },
    setTimeout,
    clearTimeout,
    // THE THING UNDER TEST: did the search actually run?
    performSearch: () => { state.searched = true; },
    showToast: (msg: string) => { state.toasts.push(String(msg)); },
    clearSearchForm: () => {},
    selectNeighborhood: (name: string, borough: string, boroughLevel: boolean) => {
      state.restored.push({ name, borough, boroughLevel });
    },
    getSelectedNeighborhoods: () => [],
    _resolveActiveNeighborhoodTagsId: () => 'saleNeighborhoodTags',
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(read('public/crm/js/search/neighborhood-autocomplete.js'), sandbox);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  if (!win.MallanNeighborhoods) throw new Error('vocabulary module did not initialise');

  vm.runInContext(read('public/crm/js/search/saved-searches.js'), sandbox);
  if (typeof sandbox.loadSavedSearch !== 'function') {
    throw new Error('saved-searches.js did not define loadSavedSearch');
  }

  state.load = async (neighborhoods: string[]) => {
    state.searched = false;
    state.issues = [];
    state.toasts = [];
    state.restored = [];
    // A saved record the SERVER considers fully executable — so if the search is
    // blocked, it is blocked by the restore path, which is the point.
    (sandbox as Record<string, unknown>).MallanAPI = {
      savedSearches: {
        get: () => Promise.resolve({
          name: 'legacy record',
          criteria_status: 'executable',
          criteria: { neighborhoods },
        }),
      },
    };
    // saved-searches.js is not IIFE-wrapped — it is inlined into the bundle, so
    // its declarations land on the global, not on `window`.
    (sandbox.loadSavedSearch as (id: string) => void)('saved-1');
    // loadSavedSearch defers performSearch() on a timer, so a microtask flush is
    // not enough. Waiting past it is what makes "did not run" mean anything.
    await new Promise((r) => setTimeout(r, 250));
    state.issues = ((win._lastRestoreIssues as string[]) ?? []).slice();
  };

  return state;
}

describe('a saved neighbourhood that cannot be restored blocks execution', () => {
  it('BARE "Bay Terrace" does not run the search', async () => {
    const h = await harness();
    await h.load(['Bay Terrace']);

    // The criterion could not be restored…
    expect(h.issues.join(' ')).toMatch(/neighborhood = Bay Terrace/);
    expect(h.issues.join(' ')).toMatch(/Bay Terrace \(Queens\)/);
    expect(h.issues.join(' ')).toMatch(/Bay Terrace \(Staten Island\)/);
    // …so the search must NOT have run. This is the assertion the source-grep
    // suite could not make.
    expect(h.searched).toBe(false);
    // …and nothing was silently written into the form instead.
    expect(h.restored).toEqual([]);
    expect(h.toasts.join(' ')).toMatch(/NOT run/);
  });

  it('an UNKNOWN neighbourhood does not run the search either', async () => {
    const h = await harness();
    await h.load(['Nonexistent Heights']);
    expect(h.issues.join(' ')).toMatch(/no longer a live Cotality neighbourhood/);
    expect(h.searched).toBe(false);
    expect(h.restored).toEqual([]);
  });

  it('but a QUALIFIED neighbourhood restores and runs', async () => {
    // The other direction. A gate that blocked everything would pass both cases
    // above while breaking Saved Search completely.
    for (const [label, borough] of [
      ['Bay Terrace (Queens)', 'Queens'],
      ['Bay Terrace (Staten Island)', 'Staten Island'],
    ] as const) {
      const h = await harness();
      await h.load([label]);
      expect(`${label}:${h.issues.length}`).toBe(`${label}:0`);
      expect(`${label}:${h.searched}`).toBe(`${label}:true`);
      expect(h.restored).toEqual([{ name: label, borough, boroughLevel: false }]);
    }
  });

  it('and an ordinary unambiguous neighbourhood still runs', async () => {
    const h = await harness();
    await h.load(['Tribeca']);
    expect(h.issues).toEqual([]);
    expect(h.searched).toBe(true);
    expect(h.restored[0].name).toBe('Tribeca');
    expect(h.restored[0].boroughLevel).toBe(false);
  });

  it('one bad neighbourhood among good ones still blocks the whole search', async () => {
    // Partial restore is the silent-widening case: running with two of three
    // criteria answers a broader question than the broker saved.
    const h = await harness();
    await h.load(['Tribeca', 'Bay Terrace']);
    expect(h.searched).toBe(false);
    expect(h.issues.length).toBe(1);
  });
});
