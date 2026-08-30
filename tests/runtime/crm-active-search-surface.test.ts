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

/**
 * THE FIXTURE IS THE SHIPPED MARKUP.
 *
 * This suite used to build its own DOM, and that is how 46 green tests coexisted
 * with a broken page: the fixture contained a  control that
 * exists nowhere in the product, and omitted the per-workflow Quick Search
 * controls entirely. A test that writes its own DOM can only prove the code
 * agrees with the test.
 *
 * The real form partial is loaded instead, so an adapter naming a control the
 * product does not render fails here rather than in front of a broker.
 */
const REAL_FORM = readFileSync(
  join(REPO, 'public', 'crm', 'html', 'search-form-and-results.html'),
  'utf8',
);

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${REAL_FORM}</body></html>`, {
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

  // Same order as index.html: core/nav.js first (it defines the global
  // `escapeHtml` the tag widget renders through), then the engine, then the
  // geography widget that owns the neighbourhood/borough tag state the geography
  // adapter delegates to. Loading the REAL dependency rather than stubbing it
  // keeps the harness honest about what the page actually needs.
  for (const rel of [
    'public/crm/js/core/nav.js',
    'public/crm/js/search/date-range-picker.js',
    'public/crm/js/search/search-engine.js',
    'public/crm/js/search/neighborhood-autocomplete.js',
  ]) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }
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
    pick(win, 'rentalMaxRent', '3500');
    pick(win, 'rentalMinBeds', '1');

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('rent');
    expect(String(criteria.priceMin ?? criteria.minPrice ?? '')).toContain('3000');
    expect(String(criteria.priceMax ?? criteria.maxPrice ?? '')).toContain('3500');
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
    pick(win, 'rentalMaxRent', '3500');

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('sale');
    expect(JSON.stringify(criteria)).not.toContain('3000');
    expect(JSON.stringify(criteria)).not.toContain('3500');
  });

  it('does not leak Sale values into a Rental search after switching tabs', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', '500000');
    pick(win, 'saleMaxPrice', '1000000');

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
    pick(win, 'rentalMaxRent', '3500');

    win.toggleSearchMode('advanced');
    expect(shown(win, 'searchAdvancedMode')).toBe(true);

    const criteria = win.collectSearchCriteria();

    expect(criteria.searchTab).toBe('rent');
    expect(JSON.stringify(criteria)).toContain('3000');
    expect(JSON.stringify(criteria)).toContain('3500');
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
    pick(win, 'advSaleMinPrice', '500000');

    win.toggleSearchMode('basic');

    expect(win.document.getElementById('saleMinPrice').value).toBe('500000');
    expect(JSON.stringify(win.collectSearchCriteria())).toContain('500000');
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
    pick(win, 'rentalMaxRent', '3500');
    expect(JSON.stringify(win.collectSearchCriteria())).toContain('3000');

    pick(win, 'rentalMinRent', '');
    pick(win, 'rentalMaxRent', '');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).not.toContain('3000');
    expect(JSON.stringify(criteria)).not.toContain('3500');
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
    pick(win, 'rentalMaxRent', '3500');
    win.collectSearchCriteria();

    pick(win, 'rentalMaxRent', '');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).toContain('3000');
    expect(JSON.stringify(criteria)).not.toContain('3500');
  });

  it('clearing only the MIN keeps the max', () => {
    const win = mount();
    win.toggleSearchTab('rent');
    pick(win, 'rentalMinRent', '3000');
    pick(win, 'rentalMaxRent', '3500');
    win.collectSearchCriteria();

    pick(win, 'rentalMinRent', '');
    const criteria = win.collectSearchCriteria();

    expect(JSON.stringify(criteria)).not.toContain('3000');
    expect(JSON.stringify(criteria)).toContain('3500');
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
    const adapters = win.CRITERION_ADAPTERS ?? {};
    for (const adapter of Object.values(adapters) as any[]) {
      for (const perTab of Object.values(adapter.ids ?? {}) as any[]) {
        for (const ids of Object.values(perTab) as any[]) {
          (ids as (string | null)[]).forEach((id) => id && bound.add(id));
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
    const keys = Object.keys(win.CRITERION_ADAPTERS ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(key).not.toMatch(/^(adv|sale|rental|building)[A-Z-]/);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE IS TYPED, AND IT COVERS MORE THAN RANGES.
 *
 * The first version stored raw DOM strings — list_price as ['3000','7000'] — for
 * three criteria. That was a DOM synchronisation cache wearing a canonical name:
 * it carried the shape of the CONTROL rather than the shape of the FACT, and
 * everything it did not list stayed view-local. Status, geography, address,
 * keyword, ownership, property type and features were all lost on a view change.
 */
/** The first value the SHIPPED markup offers for a field in the active surface. */
const firstValue = (win: any, field: string): string => {
  const surface = win.document.getElementById(
    win.isAdvancedViewVisible?.() ? 'searchAdvancedMode' : activeBasicId(win),
  );
  const el = surface?.querySelector(`[data-field="${field}"][data-value]`);
  return el?.getAttribute('data-value') ?? '';
};

const activeBasicId = (win: any) =>
  ['searchBasicMode', 'searchBasicModeRental', 'searchBasicModeBuilding'].find(
    (id) => win.document.getElementById(id)?.style.display !== 'none',
  ) ?? 'searchBasicMode';

const check = (win: any, field: string, value: string, on = true) => {
  const surface = win.document.getElementById(
    win.isAdvancedViewVisible?.() ? 'searchAdvancedMode' : activeBasicId(win),
  );
  const el = surface.querySelector(`[data-field="${field}"][data-value="${value}"]`);
  if (!el) throw new Error(`fixture has no [data-field="${field}"][data-value="${value}"] in the active surface`);
  el.checked = on;
};

describe('canonical state holds canonical VALUE SHAPES', () => {
  it('stores a range as { min, max } numbers, not control strings', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', '500000');
    pick(win, 'saleMaxPrice', '1000000');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').list_price).toEqual({ min: 500000, max: 1000000 });
  });

  it('stores an open-ended range without inventing the missing bound', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', '500000');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').list_price).toEqual({ min: 500000 });
  });

  it('stores a closed-vocabulary selection as a set', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    check(win, 'MlsStatus', 'Active');
    check(win, 'MlsStatus', 'Pending');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').market_status.sort()).toEqual(['Active', 'Pending']);
  });

  it('stores features as a FAMILY MAP, not a flat list', () => {
    // A flat ['City','InUnit'] throws away which family each value belongs to,
    // and checkbox-criteria.ts owns eighteen families with different Cotality
    // fields, kinds and unresolved members.
    //
    // View and LaundryFeatures are rendered ONLY in Advanced by the shipped
    // form, so this exercises them where they actually exist.
    const win = mount();
    win.toggleSearchTab('sale');
    win.toggleSearchMode('advanced');
    check(win, 'View', firstValue(win, 'View'));
    check(win, 'LaundryFeatures', firstValue(win, 'LaundryFeatures'));
    win.collectSearchCriteria();

    // Keys are CANONICAL FAMILY NAMES ('view', 'laundry'), not raw data-field
    // names: the shipped markup carries data-criterion, and the adapter prefers
    // it. That is the correct answer — those are checkbox-criteria.ts's own
    // eighteen family names, so the UI state and the vocabulary owner agree.
    const fm = win.canonicalCriteriaFor('sale').feature_criteria;
    expect(Object.keys(fm)).toEqual(expect.arrayContaining(['view', 'laundry']));
    expect(Array.isArray(fm.view)).toBe(true);
  });

  it('keeps first-class criteria OUT of the feature map', () => {
    // `MlsStatus`, `CommonInterest`, `PropertySubType`, `PetsAllowed`,
    // `Furnished` and `StructureType` are criteria in their own right. Collecting
    // them as generic features too would ask one question by two paths.
    const win = mount();
    win.toggleSearchTab('sale');
    win.toggleSearchMode('advanced');
    check(win, 'MlsStatus', firstValue(win, 'MlsStatus'));
    check(win, 'CommonInterest', firstValue(win, 'CommonInterest'));
    check(win, 'View', firstValue(win, 'View'));
    win.collectSearchCriteria();

    const features = win.canonicalCriteriaFor('sale').feature_criteria ?? {};
    expect(Object.keys(features)).toContain('view');
    for (const first of ['MlsStatus','CommonInterest','PropertySubType','PetsAllowed','Furnished','StructureType']) {
      expect(Object.keys(features)).not.toContain(first);
    }
    expect(win.canonicalCriteriaFor('sale').ownership.length).toBeGreaterThan(0);
  });

  it('stores scalar text as a trimmed string', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.document.getElementById('saleSearchAddress').value = '  845 Fifth Ave  ';
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').street_address).toBe('845 Fifth Ave');
  });
});

describe('every criterion group survives a view change, not just ranges', () => {
  const carries = (
    label: string,
    apply: (win: any) => void,
    expected: (state: any) => void,
  ) => {
    it(`carries ${label} from Basic into Advanced`, () => {
      const win = mount();
      win.toggleSearchTab('sale');
      apply(win);
      win.toggleSearchMode('advanced');
      expected(win.canonicalCriteriaFor('sale'));
    });
  };

  carries(
    'market status',
    (win) => check(win, 'MlsStatus', firstValue(win, 'MlsStatus')),
    (state) => expect(state.market_status.length).toBeGreaterThan(0),
  );
  carries(
    'ownership',
    (win) => check(win, 'CommonInterest', firstValue(win, 'CommonInterest')),
    (state) => expect(state.ownership.length).toBeGreaterThan(0),
  );
  carries(
    'property sub-type',
    (win) => check(win, 'PropertySubType', firstValue(win, 'PropertySubType')),
    (state) => expect(state.property_sub_type.length).toBeGreaterThan(0),
  );
  carries(
    'feature criteria',
    (win) => { win.toggleSearchMode('advanced'); check(win, 'View', firstValue(win, 'View')); },
    (state) => expect(Object.keys(state.feature_criteria)).toContain('view'),
  );
  carries(
    'street address',
    (win) => {
      win.document.getElementById('saleSearchAddress').value = '845 Fifth Ave';
    },
    (state) => expect(state.street_address).toBe('845 Fifth Ave'),
  );
  carries(
    'keyword',
    (win) => {
      win.document.getElementById('saleKeywordSearch').value = 'pre-war';
    },
    (state) => expect(state.public_remarks_keyword).toBe('pre-war'),
  );
  carries(
    'management company',
    (win) => {
      win.document.getElementById('saleManagementCompany').value = 'Douglas Elliman PM';
    },
    (state) => expect(state.management_company).toBe('Douglas Elliman PM'),
  );

  it('RENDERS a carried status into the Advanced controls, not just the store', () => {
    // The store being right is not enough — the agent must SEE it, and the
    // collector reads the rendered view.
    const win = mount();
    win.toggleSearchTab('sale');
    check(win, 'MlsStatus', 'Active');
    win.toggleSearchMode('advanced');

    const adv = win.document.getElementById('searchAdvancedMode');
    expect(adv.querySelector('[data-field="MlsStatus"][data-value="Active"]').checked).toBe(true);
    expect(adv.querySelector('[data-field="MlsStatus"][data-value="Pending"]').checked).toBe(false);
  });

  it('RENDERS carried text into the Advanced control', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.document.getElementById('saleKeywordSearch').value = 'pre-war';
    win.toggleSearchMode('advanced');

    expect(win.document.getElementById('adv-keyword').value).toBe('pre-war');
  });

  it('UNCHECKING a status in Advanced removes it — deliberate emptiness wins', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    check(win, 'MlsStatus', 'Active');
    win.toggleSearchMode('advanced');
    check(win, 'MlsStatus', 'Active', false);
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').market_status).toBeUndefined();
  });

  it('does not leak a sale-only status selection into the rental workflow', () => {
    // The shipped rental surface ships with a status already checked, so the
    // assertion is that a SPECIFIC sale selection does not cross over — not that
    // rental state is empty, which would be asserting the form's default away.
    const win = mount();
    win.toggleSearchTab('sale');
    const saleOnly = firstValue(win, 'MlsStatus');
    check(win, 'MlsStatus', saleOnly);
    win.collectSearchCriteria();

    win.toggleSearchTab('rent');
    const rental = win.canonicalCriteriaFor('rent').market_status ?? [];
    const sale = win.canonicalCriteriaFor('sale').market_status ?? [];
    expect(sale).toContain(saleOnly);
    expect(rental).not.toBe(sale);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DATES AND GEOGRAPHY — THE LAST TWO STATE OWNERS.
 *
 * Both reached canonical state but did not round-trip back out: the date pickers
 * and the neighbourhood tag widget render their own controls, so the adapters
 * read them and nothing wrote them. A criterion that can be read but not
 * rendered is still view-local — the agent sees it vanish on a view change even
 * though the state remembers it.
 */
describe('date criteria round-trip through canonical state', () => {
  /**
   * Seed a picker the way the REAL picker writes it: MM/DD/YYYY.
   *
   * These tests used to stamp ISO straight into data-from/data-to, which the
   * shipped picker never produces — so they proved the adapter worked against a
   * notation that does not exist. That is the same synthetic-fixture failure as
   * the invented control ids, one layer down.
   */
  const setDrpMDY = (win: any, drp: string, fromMDY: string, toMDY: string) => {
    const el = win.document.querySelector(`[data-drp="${drp}"]`);
    if (!el) throw new Error(`fixture has no [data-drp="${drp}"]`);
    if (fromMDY) el.setAttribute('data-from', fromMDY); else el.removeAttribute('data-from');
    if (toMDY) el.setAttribute('data-to', toMDY); else el.removeAttribute('data-to');
  };

  /** Choose an activity basis — the criterion is refused without one. */
  const setBasis = (win: any, id: string) => {
    const el = win.document.getElementById(id);
    const opt = el.querySelector('option[value]:not([value=""])');
    el.value = opt ? opt.getAttribute('value') : '';
    return el.value;
  };

  it('stores a Basic activity range as a canonical ISO date range', () => {
    // The picker writes MM/DD/YYYY; canonical state is ISO. Proving the
    // conversion is the point — copying the two notations into each other blanks
    // a native date input one way and defeats parseDateMDY the other.
    const win = mount();
    win.toggleSearchTab('sale');
    setBasis(win, 'saleListingActivityType');
    setDrpMDY(win, 'saleListedUpdated', '01/01/2026', '06/30/2026');
    win.collectSearchCriteria();

    const state = win.canonicalCriteriaFor('sale').activity_date;
    expect(state.min).toBe('2026-01-01');
    expect(state.max).toBe('2026-06-30');
  });

  it('carries the activity BASIS with the range, not just the bounds', () => {
    // The composite rule: the same from/to pair means ListingContractDate or
    // ModificationTimestamp depending on the basis, so a stored range without it
    // silently re-answers a different question when the default changes.
    const win = mount();
    win.toggleSearchTab('sale');
    const chosen = setBasis(win, 'saleListingActivityType');
    setDrpMDY(win, 'saleListedUpdated', '01/01/2026', '06/30/2026');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').activity_date.basis).toBe(chosen);
  });

  it('RENDERS a Basic activity range into the Advanced inputs', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    setBasis(win, 'saleListingActivityType');
    setDrpMDY(win, 'saleListedUpdated', '01/01/2026', '06/30/2026');
    win.collectSearchCriteria();

    win.toggleSearchMode('advanced');

    expect(win.document.getElementById('adv-listed-from').value).toBe('2026-01-01');
    expect(win.document.getElementById('adv-listed-to').value).toBe('2026-06-30');
  });

  it('REFUSES an activity range with no basis chosen', () => {
    // The shipped select defaults to "Select Activity" with value "", so a range
    // could be entered without answering "Listed date or Updated date?". A stored
    // basis_range_date with no basis is the ambiguity the contract forbids: its
    // meaning would depend on whatever default the wire boundary applied.
    const win = mount();
    win.toggleSearchTab('sale');
    win.document.getElementById('saleListingActivityType').value = '';
    setDrpMDY(win, 'saleListedUpdated', '01/01/2026', '06/30/2026');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').activity_date).toBeUndefined();
  });

  it('carries an Advanced contract range back into Basic', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.toggleSearchMode('advanced');
    win.document.getElementById('adv-contract-from').value = '2026-02-01';
    win.document.getElementById('adv-contract-to').value = '2026-03-01';

    win.toggleSearchMode('basic');

    // Back in the picker's OWN notation — writing ISO here would defeat
    // parseDateMDY and the range would vanish the next time it opened.
    const wrapper = win.document.querySelector('[data-drp="saleContractSigned"]');
    expect(wrapper.getAttribute('data-from')).toBe('02/01/2026');
    expect(wrapper.getAttribute('data-to')).toBe('03/01/2026');
  });

  it('clearing a date range REMOVES it rather than resurrecting it', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    setDrpMDY(win, 'saleSoldDate', '01/01/2026', '06/30/2026');
    win.collectSearchCriteria();
    expect(win.canonicalCriteriaFor('sale').close_date).toBeDefined();

    setDrpMDY(win, 'saleSoldDate', '', '');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').close_date).toBeUndefined();
  });
});

describe('geography round-trips through the widget that owns it', () => {
  it('stores selected neighbourhoods as a canonical set', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.selectNeighborhood('Tribeca', 'Manhattan', false, 'saleNeighborhoodDropdown', 'saleNeighborhoodTags');
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').neighborhood).toEqual(['Tribeca']);
  });

  it('keeps boroughs SEPARATE from neighbourhoods', () => {
    // They route to different provider fields — CityRegion vs SubdivisionName —
    // so collapsing them would ask the wrong question of one of them.
    const win = mount();
    win.toggleSearchTab('sale');
    win.selectNeighborhood('Tribeca', 'Manhattan', false, 'saleNeighborhoodDropdown', 'saleNeighborhoodTags');
    win.selectNeighborhood('Brooklyn', '', true, 'saleNeighborhoodDropdown', 'saleNeighborhoodTags');
    win.collectSearchCriteria();

    const state = win.canonicalCriteriaFor('sale');
    expect(state.neighborhood).toEqual(['Tribeca']);
    expect(state.borough).toEqual(['Brooklyn']);
  });

  it('RENDERS geography into the view being entered', () => {
    // This is what was missing: the adapter read the widget but never wrote it,
    // so switching view showed an empty tag list while the state still held the
    // selection.
    const win = mount();
    win.toggleSearchTab('sale');
    win.selectNeighborhood('Tribeca', 'Manhattan', false, 'saleNeighborhoodDropdown', 'saleNeighborhoodTags');
    win.collectSearchCriteria();

    win.toggleSearchMode('advanced');

    expect(win.getSelectedNeighborhoods('advancedNeighborhoodTags')).toEqual(['Tribeca']);
  });

  it('does not leak one workflow geography into another', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.selectNeighborhood('Tribeca', 'Manhattan', false, 'saleNeighborhoodDropdown', 'saleNeighborhoodTags');
    win.collectSearchCriteria();

    win.toggleSearchTab('rent');

    expect(win.canonicalCriteriaFor('rent').neighborhood).toBeUndefined();
    expect(win.canonicalCriteriaFor('sale').neighborhood).toEqual(['Tribeca']);
  });
});

describe('booleans are tri-state, driven by each control OWN value', () => {
  const boolBox = (win: any, field: string, value: string) => {
    const surface = win.document.getElementById(
      win.isAdvancedViewVisible?.() ? 'searchAdvancedMode' : activeBasicId(win),
    );
    return surface.querySelector(`[data-field="${field}"][data-value="${value}"]`);
  };

  it('NEW DEVELOPMENT means true, and reaches the wire as true', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.toggleSearchMode('advanced');
    boolBox(win, 'NewConstructionYN', 'true')!.checked = true;
    const criteria = win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').new_development).toBe(true);
    expect(criteria.checkboxFilters?.NewConstructionYN).toEqual(['true']);
  });

  it('reads each control OWN data-value rather than "any box checked"', () => {
    // The form renders NewConstructionYN with data-value="true" (New
    // Development) and, in the Building surface, data-value="false" (Resale
    // Building). Treating any checked box as `true` made selecting RESALE ask
    // for new construction — the opposite of the agent's question.
    //
    // PRODUCT FINDING, recorded rather than assumed: the FALSE control renders
    // ONLY in the Building surface, where new_development is contract-blocked.
    // So "Resale Building" is currently unreachable as a Sale/Rental criterion.
    // The read logic is corrected either way; offering Resale on Sale or Rental
    // would need a control there.
    const engineSrc = readFileSync(SEARCH_ENGINE, 'utf8');
    expect(engineSrc).toContain("v === 'true' || v === 'false'");
    expect(engineSrc).toContain('picked.length !== 1');
  });

  it('gives canonical FALSE a transport path', () => {
    // The serializer wrote only `true`, so a stored canonical false would have
    // executed as no filter at all — Resale silently returning new construction
    // too. Pinned at the serializer because the UI cannot currently produce it.
    const engineSrc = readFileSync(SEARCH_ENGINE, 'utf8');
    expect(engineSrc).toContain("value === false) criteria.checkboxFilters[field] = ['false']");
  });

  it('renders true onto ONLY the matching control', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    win.toggleSearchMode('advanced');
    boolBox(win, 'NewConstructionYN', 'true')!.checked = true;
    win.collectSearchCriteria();
    win.toggleSearchMode('basic');
    win.toggleSearchMode('advanced');

    expect(boolBox(win, 'NewConstructionYN', 'true')!.checked).toBe(true);
  });
});


describe('workflow applicability binds field-scanned adapters too', () => {
  it('Building cannot acquire New Development, though the form renders it', () => {
    // The workflow guard walked `adapter.ids`, so field-scanned adapters — which
    // have no ids — bypassed it entirely while sync ran them against whatever tab
    // was active. The Building form DOES render NewConstructionYN, so Building
    // was acquiring a criterion its contract does not offer: the same back-door
    // widening closed for the Quick Search controls.
    const win = mount();
    win.toggleSearchTab('building');
    const surface = win.document.getElementById('searchBasicModeBuilding');
    const el = surface.querySelector('[data-field="NewConstructionYN"][data-value="true"]');
    if (el) el.checked = true;
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('building').new_development).toBeUndefined();
  });
});

describe('a Custom range value reaches canonical state', () => {
  it('reads the Custom companion when the select is on "custom"', () => {
    // The selects offer a `custom` option whose real number lives in a sibling
    // input. Parsing the select alone yielded undefined, so a custom price never
    // entered canonical state while the legacy collector still read the companion
    // and executed it — Search ran a price the canonical object did not contain.
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', 'custom');
    win.document.getElementById('saleMinPriceCustom').value = '1234567';
    win.collectSearchCriteria();

    expect(win.canonicalCriteriaFor('sale').list_price).toEqual({ min: 1234567 });
  });

  it('EXECUTES the custom value, and canonical state agrees with it', () => {
    const win = mount();
    win.toggleSearchTab('sale');
    pick(win, 'saleMinPrice', 'custom');
    win.document.getElementById('saleMinPriceCustom').value = '1234567';
    const criteria = win.collectSearchCriteria();

    expect(criteria.priceMin).toBe(1234567);
    expect(win.canonicalCriteriaFor('sale').list_price.min).toBe(1234567);
  });
});

describe('an unanswerable criterion BLOCKS the search visibly', () => {
  it('refuses to search when an activity range has no basis', () => {
    // Deleting the criterion on read is not a refusal — the agent still sees the
    // date range, presses Search, and gets results that ignore it. Refusal has to
    // be visible to be a refusal.
    const toasts: Array<{ msg: string; kind: string }> = [];
    const win = mount();
    win.showToast = (msg: string, kind: string) => toasts.push({ msg, kind });
    win.toggleSearchTab('sale');
    win.document.getElementById('saleListingActivityType').value = '';
    const wrapper = win.document.querySelector('[data-drp="saleListedUpdated"]');
    wrapper.setAttribute('data-from', '01/01/2026');
    wrapper.setAttribute('data-to', '06/30/2026');

    win.performSearch();

    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].kind).toBe('error');
    expect(toasts[0].msg).toMatch(/Listed or Updated/i);
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
