import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WHOLE PATH, STARTING FROM THE CONTROL AN AGENT TOUCHES.
 *
 * The companion transport suite hands hand-built criteria to
 * `buildIdxSearchParams`. That proves the last two hops and BYPASSES the two
 * that matter most: the canonical adapter reading the control, and
 * `serializeCanonicalToWire` turning canonical state into wire keys.
 *
 * Every financing defect so far lived in a hop that looked fine in isolation —
 * the serializer emitted names nothing read; then the request builder was fixed
 * and the client forwarded nothing; then that was fixed and the server had no
 * refusal. Testing from the middle is how each one survived its own fix.
 *
 * So this starts where the agent starts:
 *
 *   #saleBuildingFinancingMin / Max   (the shipped controls)
 *     -> canonical max_financing_percent   { min, max }
 *     -> serializeCanonicalToWire()        criteria.financingMin / financingMax
 *     -> buildIdxSearchParams()            params.financingMin / financingMax
 *     -> /api/idx/search                   the URL that would go out
 *
 * and covers min-only, max-only, both, and CLEARING one or both — because a
 * removed bound that lingers in canonical state is the silent-resurrection
 * failure, and a removed bound that never reaches the wire is silent widening.
 */

const FORM = readFileSync(
  join(REPO, 'public/crm/html/search-form-and-results.html'),
  'utf8',
);

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${FORM}</body></html>`, {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
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

/** Type into the SHIPPED financing controls, the way an agent does. */
function enterFinancing(win: any, min: string, max: string) {
  win.document.getElementById('saleBuildingFinancingMin').value = min;
  win.document.getElementById('saleBuildingFinancingMax').value = max;
}

/** Drive the full path and report what each layer holds. */
async function runSearch(win: any, requests: string[]) {
  const criteria = win.collectSearchCriteria();
  const params = win.buildIdxSearchParams(criteria);
  await win.MallanAPI.idx.search(params);
  return {
    canonical: win.canonicalCriteriaFor('sale').max_financing_percent,
    criteria,
    params,
    // The LATEST search request, not the first.
    //
    // search-engine.js loads its alias map on startup, so the first captured
    // request is not a search at all — and the clearing tests issue TWO
    // searches, so reading the first would assert against the state BEFORE the
    // bound was cleared and report a passing removal that never happened.
    url: [...requests].reverse().find((u) => u.includes('/api/idx/search')) ?? '',
  };
}

describe('financing travels from the shipped control to the request', () => {
  it('mounts the real controls and issues a request — guard the guard', async () => {
    // Without this, a harness that never rendered the controls or never issued a
    // request would pass every "absent" assertion below while proving nothing.
    const { win, requests } = mount();
    expect(win.document.getElementById('saleBuildingFinancingMin')).not.toBeNull();
    expect(win.document.getElementById('saleBuildingFinancingMax')).not.toBeNull();
    const { url } = await runSearch(win, requests);
    expect(url).toContain('/api/idx/search');
  });

  it('MIN only — control to canonical to wire to request', async () => {
    const { win, requests } = mount();
    enterFinancing(win, '80', '');
    const { canonical, criteria, params, url } = await runSearch(win, requests);

    expect(canonical).toEqual({ min: 80 });
    expect(criteria.financingMin).toBe(80);
    expect(criteria.financingMax).toBeUndefined();
    expect(params.financingMin).toBe(80);
    expect(url).toContain('financingMin=80');
    expect(url).not.toContain('financingMax');
  });

  it('MAX only — the bound that used to vanish entirely', async () => {
    const { win, requests } = mount();
    enterFinancing(win, '', '90');
    const { canonical, criteria, url } = await runSearch(win, requests);

    expect(canonical).toEqual({ max: 90 });
    expect(criteria.financingMax).toBe(90);
    expect(url).toContain('financingMax=90');
    expect(url).not.toContain('financingMin');
  });

  it('BOTH bounds', async () => {
    const { win, requests } = mount();
    enterFinancing(win, '75', '90');
    const { canonical, url } = await runSearch(win, requests);

    expect(canonical).toEqual({ min: 75, max: 90 });
    expect(url).toContain('financingMin=75');
    expect(url).toContain('financingMax=90');
  });

  it('CLEARING one bound removes only that bound', async () => {
    const { win, requests } = mount();
    enterFinancing(win, '75', '90');
    await runSearch(win, requests);

    enterFinancing(win, '75', '');
    const { canonical, url } = await runSearch(win, requests);

    expect(canonical).toEqual({ min: 75 });
    expect(url).toContain('financingMin=75');
    expect(url).not.toContain('financingMax');
  });

  it('CLEARING both removes the criterion — it does not resurrect', async () => {
    // The silent-resurrection failure: an emptied control read as "nothing to
    // say", the stored range surviving, and the next render putting the
    // agent's removed filter straight back.
    const { win, requests } = mount();
    enterFinancing(win, '75', '90');
    await runSearch(win, requests);

    enterFinancing(win, '', '');
    const { canonical, criteria, url } = await runSearch(win, requests);

    expect(canonical).toBeUndefined();
    expect(criteria.financingMin).toBeUndefined();
    expect(criteria.financingMax).toBeUndefined();
    expect(url).not.toContain('financingMin');
    expect(url).not.toContain('financingMax');
  });

  it('carries the criterion across a Basic -> Advanced view change', async () => {
    // Advanced binds a single `#adv-financing` control for the minimum, so the
    // canonical object is what keeps the value alive across the switch.
    const { win, requests } = mount();
    enterFinancing(win, '80', '');
    await runSearch(win, requests);

    win.toggleSearchMode('advanced');
    const { canonical } = await runSearch(win, requests);

    expect(canonical?.min).toBe(80);
    expect(win.document.getElementById('adv-financing').value).toBe('80');
  });

  it('adds nothing when the agent never touched the control', async () => {
    const { win, requests } = mount();
    const { canonical, url } = await runSearch(win, requests);

    expect(canonical).toBeUndefined();
    expect(url).not.toContain('financing');
  });
});
