import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const SEARCH_ENGINE = join(REPO, 'public', 'crm', 'js', 'search', 'search-engine.js');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE ACTIVE SEARCH SURFACE.
 *
 * Three Basic surfaces exist in the CRM markup — #searchBasicMode (Sale),
 * #searchBasicModeRental and #searchBasicModeBuilding. Before 2026-08-29
 * `toggleSearchTab()` set `.style.display` on the SALE one only, and the other
 * two carried an inline `display: none` that nothing ever cleared. Two comments
 * claimed "data-show-on handles visibility"; that string appeared nowhere in the
 * repository except inside those comments.
 *
 * So every tab rendered the Sale layout while the collector read the per-tab
 * element ids — `#rentalMinRent`, `#rentalMinBeds` — that live inside a
 * permanently hidden container. An agent on the Rentals tab typed a price into
 * the visible Sale control, that value was never read, and the search executed
 * the DEFAULTS of fields they could not see.
 *
 * That is worse than a dropped criterion. A dropped criterion widens the result
 * set; this SUBSTITUTES one, returning a confident answer to a question nobody
 * asked.
 *
 * These are behavioural proofs against the real `search-engine.js`, not source
 * greps — the previous defect was invisible to grep precisely because every
 * individual line looked correct.
 */

const SURFACES = `
  <div id="searchFormContainer"></div>
  <div id="searchResultsSection"></div>
  <button id="btnSale"></button><button id="btnRent"></button><button id="btnBuilding"></button>
  <button id="btnSearchBasic"></button><button id="btnSearchAdvanced"></button>

  <div id="searchBasicMode">
    <select id="saleMinPrice"><option value="">Any</option><option value="500000">500000</option><option value="750000">750000</option></select>
    <select id="saleMaxPrice"><option value="">Any</option><option value="900000">900000</option></select>
    <select id="saleMinBeds"><option value="">Any</option><option value="2">2</option></select>
    <select id="saleMaxBeds"><option value="">Any</option><option value="4">4</option></select>
    <select id="saleMinSqft"><option value="">Any</option><option value="800">800</option></select>
    <select id="saleMaxSqft"><option value="">Any</option><option value="2000">2000</option></select>
    <select id="saleMinRooms"><option value="">Any</option><option value="3">3</option></select>
  </div>

  <div id="searchBasicModeRental" style="display: none;">
    <select id="rentalMinRent"><option value="">Any</option><option value="3000">3000</option></select>
    <select id="rentalMaxRent"><option value="">Any</option><option value="7000">7000</option></select>
    <select id="rentalMinBeds"><option value="">Any</option><option value="1">1</option></select>
    <select id="rentalMaxBeds"><option value="">Any</option><option value="3">3</option></select>
    <select id="rentalMinSqft"><option value="">Any</option><option value="800">800</option></select>
    <select id="rentalMaxSqft"><option value="">Any</option><option value="2000">2000</option></select>
  </div>

  <div id="searchBasicModeBuilding" style="display: none;">
    <select id="buildingMinUnits"><option value="">Any</option><option value="10">10</option></select>
    <select id="buildingMaxUnits"><option value="">Any</option><option value="80">80</option></select>
    <select id="buildingMinFloors"><option value="">Any</option><option value="5">5</option></select>
    <select id="buildingMaxFloors"><option value="">Any</option><option value="30">30</option></select>
  </div>

  <div id="searchAdvancedMode" style="display: none;">
    <select id="advSaleMinPrice"><option value="">Any</option><option value="500000">500000</option><option value="750000">750000</option></select>
    <select id="advSaleMaxPrice"><option value="">Any</option><option value="900000">900000</option></select>
    <select id="advRentalMinRent"><option value="">Any</option><option value="3000">3000</option></select>
    <select id="advRentalMaxRent"><option value="">Any</option><option value="7000">7000</option></select>
    <select id="adv-min-beds"><option value="">Any</option><option value="1">1</option><option value="2">2</option></select>
    <select id="adv-max-beds"><option value="">Any</option><option value="3">3</option><option value="4">4</option></select>
    <select id="adv-min-sqft"><option value="">Any</option><option value="800">800</option></select>
    <select id="adv-max-sqft"><option value="">Any</option><option value="2000">2000</option></select>
    <select id="adv-min-rooms"><option value="">Any</option><option value="3">3</option></select>
  </div>
`;

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${SURFACES}</body></html>`, {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });

  const win = dom.window as any;
  win.listings = [];
  win.searchResultsState = { filteredListings: null, currentPage: 1 };
  win.LOGGED_IN_AGENT = { id: 1 };
  win.showToast = () => {};
  win.initializeSearchResults = () => {};
  win.updateResultsCount = () => {};
  win.refreshResultsMap = () => {};
  win.updateStickyNavActive = () => {};
  win.resolveNeighborhoodCanonical = () => {};
  win.fetch = () => Promise.reject(new Error('no network in tests'));
  win.MallanAPI = { idx: { search: () => Promise.resolve({ listings: [] }) } };

  const script = win.document.createElement('script');
  script.textContent = readFileSync(SEARCH_ENGINE, 'utf8');
  win.document.body.appendChild(script);
  return win;
}

const shown = (win: any, id: string) => win.document.getElementById(id)?.style.display !== 'none';
const visibleBasicSurfaces = (win: any) =>
  ['searchBasicMode', 'searchBasicModeRental', 'searchBasicModeBuilding'].filter((id) =>
    shown(win, id),
  );

/** Choose an <option> the way an agent would. */
const pick = (win: any, id: string, value: string) => {
  const el = win.document.getElementById(id);
  el.value = value;
};

describe('exactly one Basic surface renders', () => {
  it('shows the RENTAL surface on the Rentals tab, and only that one', () => {
    const win = mount();
    win.toggleSearchTab('rent');
    expect(visibleBasicSurfaces(win)).toEqual(['searchBasicModeRental']);
  });

  it('shows the BUILDING surface on the Buildings tab, and only that one', () => {
    const win = mount();
    win.toggleSearchTab('building');
    expect(visibleBasicSurfaces(win)).toEqual(['searchBasicModeBuilding']);
  });

  it('shows the SALE surface on the Sales tab, and only that one', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    expect(visibleBasicSurfaces(win)).toEqual(['searchBasicMode']);
  });

  it('never leaves two Basic surfaces visible while switching tabs', () => {
    const win = mount();
    for (const tab of ['sale', 'rent', 'building', 'rent', 'sale', 'building']) {
      win.toggleSearchTab(tab);
      expect(visibleBasicSurfaces(win)).toHaveLength(1);
    }
  });
});

describe('the values EXECUTED are the values the agent typed', () => {
  it('executes the RENTAL price and beds, not the Sale defaults', () => {
    // The original defect in one assertion: the agent is on Rentals, types into
    // the rental controls, and the collector must return those numbers.
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '7000');
    pick(win, 'rentalMinBeds', '1');

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('rent');
    expect(String(criteria.priceMin ?? criteria.minPrice ?? '')).toContain('3000');
    expect(String(criteria.priceMax ?? criteria.maxPrice ?? '')).toContain('7000');
    expect(String(criteria.bedsMin ?? criteria.minBeds ?? '')).toContain('1');
  });

  it('executes BUILDING criteria typed on the Buildings tab', () => {
    const win = mount();
    win.toggleSearchTab('building');
    pick(win, 'buildingMinUnits', '10');
    pick(win, 'buildingMinFloors', '5');

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('building');
    expect(JSON.stringify(criteria)).toContain('10');
    expect(JSON.stringify(criteria)).toContain('5');
  });
});

describe('a hidden container can never contribute a criterion', () => {
  it('ignores a value sitting in a surface that is not displayed', () => {
    // The precise failure mode: a default (or stale) value inside a hidden
    // container must not reach the wire merely because the element exists.
    const win = mount();
    win.toggleSearchTab('sale');
    // A value parked in the hidden RENTAL surface.
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '7000');

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('sale');
    expect(JSON.stringify(criteria)).not.toContain('3000');
    expect(JSON.stringify(criteria)).not.toContain('7000');
  });

  it('does not leak Sale values into a Rental search after switching tabs', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', '500000');
    pick(win, 'saleMaxPrice', '900000');

    win.toggleSearchTab('rent');
    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('rent');
    expect(JSON.stringify(criteria)).not.toContain('500000');
    expect(JSON.stringify(criteria)).not.toContain('900000');
  });

  it('does not leak Building values into a Sale search after switching back', () => {
    const win = mount();
    win.toggleSearchTab('building');
    pick(win, 'buildingMinUnits', '10');

    win.toggleSearchTab('sale');
    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('sale');
    expect(criteria.unitsMin ?? criteria.minUnits ?? null).toBeFalsy();
  });
});

describe('Basic and Advanced are two views of the same active tab', () => {
  it('returns to the ACTIVE tab surface when leaving Advanced, not always Sale', () => {
    // Switching Rentals -> Advanced -> Basic previously landed on the Sale form,
    // because the Basic/Advanced toggle hard-coded #searchBasicMode.
    const win = mount();
    win.toggleSearchTab('rent');
    win.toggleSearchMode('advanced');
    expect(visibleBasicSurfaces(win)).toEqual([]);
    expect(shown(win, 'searchAdvancedMode')).toBe(true);

    win.toggleSearchMode('basic');

    expect(visibleBasicSurfaces(win)).toEqual(['searchBasicModeRental']);
    expect(shown(win, 'searchAdvancedMode')).toBe(false);
  });

  it('preserves what the agent typed across a Basic -> Advanced -> Basic round trip', () => {
    // Values are never COPIED between views; the surface is re-shown in place,
    // so the round trip must be lossless without any transfer step.
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');

    win.toggleSearchMode('advanced');
    win.toggleSearchMode('basic');

    expect(win.document.getElementById('rentalMinRent').value).toBe('3000');
    expect(JSON.stringify(win.collectSearchCriteria())).toContain('3000');
  });

  it('shows no Basic surface at all while Advanced is open', () => {
    const win = mount();
    win.toggleSearchTab('building');
    win.toggleSearchMode('advanced');
    expect(visibleBasicSurfaces(win)).toEqual([]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BASIC AND ADVANCED ARE TWO VIEWS OF ONE OBJECT.
 *
 * Showing exactly one Basic surface stopped the collector reading a hidden
 * container, but it left Basic and Advanced as two separate DOM stores: the
 * collector chose ids by (tab, isAdvanced) and the two sets never met.
 *
 * The earlier round-trip test did NOT prove this. It typed into Basic, opened
 * Advanced, returned to Basic and found the value still sitting in the Basic
 * DOM — which is true of two unrelated stores as well. The question it never
 * asked is the one that matters: does the value EXECUTE while Advanced is open?
 */
describe('criteria survive a view change because the state is shared', () => {
  it('EXECUTES a rent range typed in Basic while Advanced is the open view', () => {
    // The bug the previous test missed. Type in Basic, open Advanced, press
    // Search without touching anything: the empty Advanced controls used to be
    // what executed.
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '7000');

    win.toggleSearchMode('advanced');
    expect(shown(win, 'searchAdvancedMode')).toBe(true);

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('rent');
    expect(JSON.stringify(criteria)).toContain('3000');
    expect(JSON.stringify(criteria)).toContain('7000');
  });

  it('EXECUTES a sale price typed in Basic while Advanced is open', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', '500000');

    win.toggleSearchMode('advanced');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).toContain('500000');
  });

  it('carries an edit made in ADVANCED back into Basic', () => {
    // The reverse direction. Both views read the same object, so neither is the
    // authority and the traffic must work both ways.
    const win = mount();
    win.toggleSearchTab('sale');
    win.toggleSearchMode('advanced');
    pick(win, 'advSaleMinPrice', '750000');

    win.toggleSearchMode('basic');

    expect(win.document.getElementById('saleMinPrice').value).toBe('750000');
    expect(JSON.stringify(win.collectSearchCriteria())).toContain('750000');
  });

  it('keeps each workflow SEPARATE across a view change', () => {
    // Per-workflow objects: a rent range must not appear in a sale search just
    // because both views were visited.
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    win.toggleSearchMode('advanced');
    win.toggleSearchMode('basic');

    win.toggleSearchTab('sale');
    const sale = win.collectSearchCriteria();

    expect(sale.searchTab).toBe('sale');
    expect(JSON.stringify(sale)).not.toContain('3000');
  });
});

describe('removing a criterion REMOVES it', () => {
  it('clearing both bounds drops the criterion instead of resurrecting it', () => {
    // The bug this closes was mine and it was dangerous. Sync refused to write
    // when every value was empty, so: search $3,000-$7,000, set both controls
    // back to Any, and the empty read was ignored while the STORED range was
    // rendered straight back. Mallan restored a criterion the agent had just
    // removed, and the results looked correct.
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '7000');
    expect(JSON.stringify(win.collectSearchCriteria())).toContain('3000');

    pick(win, 'rentalMinRent', '');
    pick(win, 'rentalMaxRent', '');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).not.toContain('3000');
    expect(JSON.stringify(criteria)).not.toContain('7000');
  });

  it('does not bring the removed criterion back on the next view change', () => {
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    win.collectSearchCriteria();

    pick(win, 'rentalMinRent', '');
    win.collectSearchCriteria();

    win.toggleSearchMode('advanced');
    win.toggleSearchMode('basic');

    expect(win.document.getElementById('rentalMinRent').value).toBe('');
    expect(JSON.stringify(win.collectSearchCriteria())).not.toContain('3000');
  });

  it('clearing only the MAX keeps the min — a partial edit is not a removal', () => {
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '7000');
    win.collectSearchCriteria();

    pick(win, 'rentalMaxRent', '');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).toContain('3000');
    expect(JSON.stringify(criteria)).not.toContain('7000');
  });

  it('clearing only the MIN keeps the max', () => {
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '7000');
    win.collectSearchCriteria();

    pick(win, 'rentalMinRent', '');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).not.toContain('3000');
    expect(JSON.stringify(criteria)).toContain('7000');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BINDING TABLE MUST BE COMPLETE, AND COMPLETENESS IS DERIVED.
 *
 * A hand-kept list of "criteria that appear in two views" is another manually
 * maintained inventory, and the first version of it missed rooms, square footage
 * and every building fact — the last group because they diverge through a THIRD
 * idiom, `_resolveBuildingFieldIds(tab, isAdvanced)`, that the first census
 * never looked at.
 *
 * So this guard reads the COLLECTOR and fails if any control it reads in an
 * advanced-vs-basic branch is absent from the bindings. A criterion that gains a
 * second view and is not bound silently reverts to view-local truth, which is
 * exactly the defect being closed.
 */
describe('every view-divergent control is bound', () => {
  const engine = readFileSync(SEARCH_ENGINE, 'utf8');

  /** Ids the collector reads inside an advanced-vs-basic branch. */
  const divergentIds = (): string[] => {
    const lines = engine.split('\n');
    const start = lines.findIndex((l) => /function collectSearchCriteria/.test(l));
    const found = new Set<string>();
    for (let i = start; i < lines.length && i < start + 700; i++) {
      if (!/_isAdvanced|_isAdv\b/.test(lines[i])) continue;
      const window = lines.slice(i, i + 14).join('\n');
      for (const m of window.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)) found.add(m[1]);
    }
    // The building-fact resolver is a separate idiom and must be covered too.
    //
    // It builds some ids by CONCATENATION — `var p = tab === 'rent' ?
    // 'rentalBuilding' : 'saleBuilding'` then `p + 'MinYear'`. Treating the
    // quoted fragments as ids reported 'saleBuilding' and 'MinYear' as unbound
    // controls that do not exist. Reconstruct the concatenation instead; a
    // fragment is not an id.
    const resolver = /_resolveBuildingFieldIds = function[\s\S]*?\n        \};/.exec(engine)?.[0] ?? '';
    const prefixes = [...resolver.matchAll(/\?\s*'([A-Za-z]+)'\s*:\s*'([A-Za-z]+)'/g)].flatMap((m) => [
      m[1],
      m[2],
    ]);
    for (const m of resolver.matchAll(/'([A-Za-z0-9_-]+)'/g)) {
      const token = m[1];
      if (prefixes.includes(token)) continue;
      // A tab NAME is not a control id. `tab === 'rent'` and `tab === 'building'`
      // are branch conditions inside the resolver.
      if (new RegExp(`tab\\s*===\\s*'${token}'`).test(resolver)) continue;
      // A suffix only ever appears as `p + 'Suffix'`.
      if (new RegExp(`p\\s*\\+\\s*'${token}'`).test(resolver)) {
        prefixes.forEach((prefix) => found.add(prefix + token));
        continue;
      }
      found.add(token);
    }
    return [...found];
  };

  it('finds the divergent controls at all — guard the guard', () => {
    // A parse that silently found nothing would make every assertion below pass
    // vacuously, which is how the first census reported a clean result while
    // missing three whole criteria.
    const ids = divergentIds();
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids).toEqual(expect.arrayContaining(['adv-min-sqft', 'adv-min-rooms']));
  });

  it('binds every control the collector reads in a view-dependent branch', () => {
    const win = mount();
    const bound = new Set<string>();
    const bindings = win.CRITERION_VIEW_BINDINGS ?? {};
    for (const perTab of Object.values(bindings) as any[]) {
      for (const perView of Object.values(perTab) as any[]) {
        for (const ids of Object.values(perView) as any[]) {
          (ids as string[]).forEach((id) => bound.add(id));
        }
      }
    }

    // Prefixed ids the resolver builds by concatenation are covered by their
    // expanded forms in the table; only genuinely unbound controls are reported.
    const unbound = divergentIds().filter(
      (id) => !bound.has(id) && !/^(advancedSearchAddress)$/.test(id),
    );
    expect(unbound).toEqual([]);
  });

  it('names every bound criterion with a CANONICAL key, not a DOM name', () => {
    // The bindings are view adapters onto canonical criteria. Keying them by
    // control name would make the UI its own vocabulary again.
    const win = mount();
    const keys = Object.keys(win.CRITERION_VIEW_BINDINGS ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(key).not.toMatch(/^(adv|sale|rental|building)[A-Z-]/);
    }
  });
});

describe('reset clears the workflow the agent is actually on', () => {
  it('clears the RENTAL form, not the Sale one', () => {
    // `clearSearchForm` listed only 'searchBasicMode', so Clear on Rentals reset
    // a form the agent was not looking at and left theirs populated. It survived
    // the surface-resolver pass because it is a STRING IN AN ARRAY — invisible to
    // a guard scanning for getElementById('searchBasicMode').
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');

    win.clearSearchForm();

    expect(win.document.getElementById('rentalMinRent').value).toBe('');
    expect(JSON.stringify(win.collectSearchCriteria())).not.toContain('3000');
  });

  it('clears the BUILDING form when that is the active workflow', () => {
    const win = mount();
    win.toggleSearchTab('building');
    pick(win, 'buildingMinUnits', '10');

    win.clearSearchForm();

    expect(win.document.getElementById('buildingMinUnits').value).toBe('');
  });

  it('does not resurrect cleared criteria on the next view change', () => {
    // Clearing the DOM alone would leave the canonical object holding the old
    // values, and the next render would put them straight back.
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    win.clearSearchForm();

    win.toggleSearchMode('advanced');
    win.toggleSearchMode('basic');

    expect(win.document.getElementById('rentalMinRent').value).toBe('');
  });
});

describe('the resolver is the single owner of "which form is active"', () => {
  it('resolves each tab to its own surface id', () => {
    const win = mount();
    expect(win.basicSurfaceIdForTab('sale')).toBe('searchBasicMode');
    expect(win.basicSurfaceIdForTab('rent')).toBe('searchBasicModeRental');
    expect(win.basicSurfaceIdForTab('building')).toBe('searchBasicModeBuilding');
  });

  it('falls back to Sale for an unknown tab rather than returning nothing', () => {
    // A null surface would make the collector silently scope to the whole
    // document, which is how a hidden container gets read in the first place.
    const win = mount();
    expect(win.basicSurfaceIdForTab('nonsense')).toBe('searchBasicMode');
  });

  it('Saved Search restore targets the same surface the collector reads', () => {
    // A restore that writes into a form the collector never reads looks like a
    // successful restore and executes the wrong criteria.
    const engine = readFileSync(SEARCH_ENGINE, 'utf8');
    const saved = readFileSync(
      join(REPO, 'public', 'crm', 'js', 'search', 'saved-searches.js'),
      'utf8',
    );
    // Neither file may reach for the Sale container as "the basic form" again.
    const hardCoded = (src: string) =>
      src.split('\n').filter(
        (l) => l.includes("getElementById('searchBasicMode')") && !l.trim().startsWith('//'),
      );
    expect(hardCoded(engine)).toEqual([]);
    expect(hardCoded(saved)).toEqual([]);
    expect(saved).toContain('activeBasicSurface()');
  });
});
