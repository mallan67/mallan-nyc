/// <reference types="jest" />
/**
 * CRM Search on the real page, booted once in jsdom with a stubbed network: Agent Search, the Exclusive box, what the API client sends, and the
 * contract that no enabled control can send a value live Cotality rejects.
 *
 * Why the real page: the picker module, the engine that collects criteria, the API client that sends them and the saved-search
 * code are four files. Source-text tests cannot see a link in that chain dropping a value. MallanAPI.idx.search() forwarded a
 * fixed list of parameters and silently dropped checkboxFilters, managementCompany, unit and the contract dates (present on main as
 * well), so every checkbox filter only narrowed the first rows the server returned. keyword stays client-side: live Cotality aborts
 * contains(PublicRemarks, ...) within the request timeout. This test drives typing, picking,
 * Search and saved-search restore through the real DOM and reads the request that actually leaves the page.
 *
 * Live Cotality evidence (2026-10-06): ListAgentKey/-MlsId/-FullName equal Member.MemberKey/-MlsId/-FullName and ListOfficeKey/-MlsId/
 * -Name equal Office.OfficeKey/-MlsId/-Name; CoListAgent{,2,3}* and CoListOffice{,2}* resolve to the same Member/Office rows.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

jest.setTimeout(30000);

const ROOT = resolve(__dirname, '../..');
const SHELL = readFileSync(resolve(ROOT, 'public/crm/index-built.html'), 'utf8');
const mirror = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-enums.live.json'), 'utf8')) as {
  enums: Record<string, string[]>;
  entities: Record<string, Record<string, string>>;
};
const LIVE_AGREEMENTS = mirror.enums.ListingAgreement;

const MEMBER = { key: '25272030', mlsId: '39361', fullName: 'Maya Allan', status: 'Active', officeKey: '5671398', officeMlsId: '7041', officeName: 'MAllan Real Estate Inc' };
const OFFICES = [
  { key: '5658936', mlsId: '334', name: 'Corcoran Group', status: 'Active', mainOfficeKey: '5658936', mainOfficeMlsId: '334' },
  { key: '5700001', mlsId: '40076', name: 'Corcoran Group', status: 'Active', mainOfficeKey: '5658936', mainOfficeMlsId: '334' },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (kind: 'members' | 'offices', url: string) => unknown;
let handler: Handler | null = null; // per-test override of the stubbed directory
const errors: string[] = [];
const calls: string[] = [];
let w: any;
let d: Document;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => errors.push(String(e.detail?.message ?? e.message)));
  const dom = new JSDOM(SHELL, {
    url: 'https://mallan.nyc/crm/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(win: any) {
      win.tailwind = { config: {} };
      win.alert = () => undefined;
      win.confirm = () => true;
      win.scrollTo = () => undefined;
      win.print = () => undefined;
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      win.fetch = async (url: string, init?: { method?: string }) => {
        const u = String(url);
        calls.push(`${(init && init.method) || 'GET'} ${u}`);
        const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
        const kind = u.includes('/api/crm/directory/members') ? 'members' : u.includes('/api/crm/directory/offices') ? 'offices' : null;
        if (kind) {
          const custom = handler ? await handler(kind, u) : undefined;
          if (custom instanceof Error) throw custom;
          if (custom !== undefined) return ok(custom);
          return ok(kind === 'members' ? { members: [MEMBER], total: 1, source: 'cotality-live' } : { offices: OFFICES, total: 2, source: 'cotality-live' });
        }
        if (u.includes('/api/auth/me')) return ok({ authenticated: true, principalType: 'agent', role: 'agent', portalRole: 'agent', user: { id: 'AG-9', name: 'Test Agent', role: 'agent' } });
        if (u.includes('/api/idx/search')) return ok({ listings: [], total: 0 });
        return ok({});
      };
    },
  });
  w = dom.window;
  d = w.document;
  await sleep(1500); // page init and the stubbed auth/context round trips
  w.toggleSearchMode('advanced');
}, 90000);

afterAll(() => w.close());
beforeEach(() => {
  w.clearSearchForm();
  // Search hides the form; show it again so the page-level Enter handler (which runs Search) is live in every test.
  (d.getElementById('searchFormContainer') as HTMLElement).style.display = '';
  calls.length = 0;
  handler = null;
});

const typeInto = async (id: string, text: string) => {
  const el = d.getElementById(id) as HTMLInputElement;
  el.value = text;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  await sleep(330); // the picker debounces 250 ms
};
const options = (field: string) => [...d.querySelectorAll(`[data-agent-picker="${field}"] [role="option"]`)] as HTMLElement[];
const pick = (field: string, index: number) => options(field)[index].dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const chips = (field: string) => [...d.querySelectorAll(`[data-agent-picker="${field}"] [data-picker-chip]`)].map((c) => c.getAttribute('data-picker-chip'));
const AGENT_KEYS = ['listAgent', 'coListAgent', 'anyAgent', 'listOffice', 'coListOffice'];
const agentKeys = (criteria: Record<string, unknown>) => Object.keys(criteria).filter((k) => AGENT_KEYS.includes(k)).sort();
const compact = (s: string | null | undefined) => String(s || '').replace(/\s+/g, ' ').trim();
const searchUrl = () => new URL((calls.find((c) => c.includes('/api/idx/search')) as string).replace('GET ', ''), 'https://mallan.nyc');

describe('Agent Search on the real CRM Search page', () => {
  it('boots without an uncaught error and wires all five pickers', () => {
    expect([...new Set(errors)]).toEqual([]);
    const wired = [...d.querySelectorAll('[data-agent-picker]')].map((e) => `${e.getAttribute('data-agent-picker')}=${e.getAttribute('data-picker-ready')}`);
    expect(wired).toEqual(['listAgent=true', 'coListAgent=true', 'anyAgent=true', 'listOffice=true', 'coListOffice=true']);
  });

  it('offers every live Cotality ListingAgreement value in Agent Search, and no other', () => {
    const offered = [...d.querySelectorAll('#agentOfficeSearch [data-field="ListingAgreement"]')].map((c) => c.getAttribute('data-value'));
    expect([...offered].sort()).toEqual([...LIVE_AGREEMENTS].sort());
  });

  it('every control that is not connected to a Cotality filter is disabled with a reason; the live ones are not', () => {
    for (const id of ['searchBroker', 'searchListTeam', 'searchAgentPhone', 'searchShowingContact', 'searchManagement', 'searchOwner']) {
      expect({ id, disabled: (d.getElementById(id) as HTMLInputElement).disabled }).toEqual({ id, disabled: true });
    }
    expect(d.querySelector('#agentSearchUnsupported [data-dead-container-notice]')).not.toBeNull();
    for (const id of ['searchListAgent', 'searchCoListAgent', 'searchAnyAgent', 'searchListOffice', 'searchCoListOffice']) {
      expect({ id, disabled: (d.getElementById(id) as HTMLInputElement).disabled }).toEqual({ id, disabled: false });
    }
    expect(d.querySelector('#agentOfficeSearch [data-dead-container-notice]')).toBeNull();
  });

  it('typing queries the live directory; picking stores the exact MLS ID and Search sends it', async () => {
    await typeInto('searchListAgent', 'maya');
    expect(calls).toContain('GET /api/crm/directory/members?name=maya&includeInactive=1&limit=10');
    const labels = options('listAgent').map((o) => compact(o.textContent));
    expect(labels[0]).toMatch(/^Match .maya. as typed text/);
    expect(labels[1]).toBe('Maya AllanMAllan Real Estate Inc · MLS 39361');
    pick('listAgent', 1);
    expect(chips('listAgent')).toEqual(['39361']);
    expect((d.getElementById('searchListAgent') as HTMLInputElement).value).toBe('');

    const criteria = w.collectSearchCriteria();
    expect(agentKeys(criteria)).toEqual(['listAgent']);
    expect(criteria.listAgent).toBe('39361');
    expect(criteria.agentOffice).toEqual({ listAgent: [{ id: '39361', label: 'Maya Allan' }] });

    calls.length = 0;
    w.performSearch();
    await sleep(300);
    expect(searchUrl().searchParams.get('listAgent')).toBe('39361');
  });

  it('the five filters are independent: each sends only its own parameter', async () => {
    const cases: Array<[string, string, string, string]> = [
      ['listAgent', 'searchListAgent', 'maya', '39361'],
      ['coListAgent', 'searchCoListAgent', 'maya', '39361'],
      ['anyAgent', 'searchAnyAgent', 'maya', '39361'],
      ['listOffice', 'searchListOffice', 'corcoran', '334'],
      ['coListOffice', 'searchCoListOffice', 'corcoran', '334'],
    ];
    for (const [field, id, text, expected] of cases) {
      w.clearSearchForm();
      await typeInto(id, text);
      pick(field, 1);
      const criteria = w.collectSearchCriteria();
      expect({ field, keys: agentKeys(criteria), value: criteria[field] }).toEqual({ field, keys: [field], value: expected });
      const params = w.buildIdxSearchParams(criteria);
      expect(Object.keys(params).filter((k) => AGENT_KEYS.includes(k))).toEqual([field]);
    }
  });

  it('a firm is searched by name: "all offices whose name contains" sends the text, a specific office sends its MLS ID', async () => {
    await typeInto('searchListOffice', 'corcoran');
    expect(calls).toContain('GET /api/crm/directory/offices?name=corcoran&includeInactive=1&limit=10');
    expect(compact(options('listOffice')[0].textContent)).toMatch(/^All offices whose name contains .corcoran./);
    pick('listOffice', 0);
    expect(w.collectSearchCriteria().listOffice).toBe('corcoran');
    await typeInto('searchListOffice', 'corc'); // the list closes after a pick; a new lookup reopens it
    pick('listOffice', 2);
    expect(w.collectSearchCriteria().listOffice).toBe('corcoran,40076');
  });

  it('a digits-only entry is an exact MLS ID and looks the id up', async () => {
    await typeInto('searchAnyAgent', '39361');
    expect(calls).toContain('GET /api/crm/directory/members?mlsId=39361&includeInactive=1&limit=10');
    expect(compact(options('anyAgent')[0].textContent)).toMatch(/^Use MLS ID 39361Exact match/);
  });

  it('typed text that is not picked is still searched, and the list says it is the less exact option', async () => {
    await typeInto('searchListAgent', 'maya allan');
    expect(compact(options('listAgent')[0].textContent)).toMatch(/Less exact/);
    expect(w.collectSearchCriteria().listAgent).toBe('maya allan');
  });

  it('chips and typed text combine, commas are stripped from typed text, at most five are kept', () => {
    w.AgentOfficeSearch.setState({ listAgent: [1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: `A${n}` })) });
    expect(w.collectSearchCriteria().listAgent).toBe('1,2,3,4,5');
    w.clearSearchForm();
    w.AgentOfficeSearch.setState({ listAgent: [{ id: '39361', label: 'Maya Allan' }] });
    (d.getElementById('searchListAgent') as HTMLInputElement).value = 'leda, gorgone';
    expect(w.collectSearchCriteria().listAgent).toBe('39361,leda gorgone');
  });

  it('removing a chip removes it from the search', async () => {
    await typeInto('searchListAgent', 'maya');
    pick('listAgent', 1);
    (d.querySelector('[data-agent-picker="listAgent"] [data-picker-chip] button') as HTMLElement).click();
    expect(chips('listAgent')).toEqual([]);
    expect(agentKeys(w.collectSearchCriteria())).toEqual([]);
  });

  it('Enter picks the highlighted option and does not also run the search; ArrowDown and Escape work', async () => {
    const input = d.getElementById('searchListAgent') as HTMLInputElement;
    await typeInto('searchListAgent', 'maya');
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(options('listAgent')[1].getAttribute('aria-selected')).toBe('true');
    calls.length = 0;
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(chips('listAgent')).toEqual(['39361']);
    await sleep(150);
    expect(calls.filter((c) => c.includes('/api/idx/search'))).toEqual([]);
    await typeInto('searchListAgent', 'maya');
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(options('listAgent')).toEqual([]);
  });

  it('a slower, older lookup cannot overwrite a newer one', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    handler = async (kind, url) => {
      if (kind === 'members' && url.includes('name=ma&')) { await gate; return { members: [{ ...MEMBER, mlsId: '1', fullName: 'Stale Person' }] }; }
      return undefined;
    };
    await typeInto('searchListAgent', 'ma');
    await typeInto('searchListAgent', 'maya');
    release();
    await sleep(80);
    const shown = options('listAgent').map((o) => compact(o.textContent)).join('|');
    expect(shown).toContain('Maya Allan');
    expect(shown).not.toContain('Stale Person');
  });

  it('rows from the directory are rendered as text, never as HTML', async () => {
    handler = (kind) => (kind === 'members' ? { members: [{ ...MEMBER, fullName: '<img src=x onerror="window.__pwned=1">', officeName: '<b>x</b>' }] } : undefined);
    await typeInto('searchListAgent', 'zz');
    expect(d.querySelector('[data-agent-picker="listAgent"] img')).toBeNull();
    expect(d.querySelector('[data-agent-picker="listAgent"] b')).toBeNull();
    expect(compact(options('listAgent')[1].textContent)).toContain('<img src=x');
    expect(w.__pwned).toBeUndefined();
  });

  it('a directory failure is shown, the typed text is still searchable, and nothing throws', async () => {
    handler = (kind) => (kind === 'members' ? new Error('network down') : undefined);
    const before = errors.length;
    await typeInto('searchListAgent', 'maya');
    expect(compact(d.querySelector('[data-agent-picker="listAgent"] [data-picker-results]')?.textContent)).toContain('Directory unavailable');
    expect(w.collectSearchCriteria().listAgent).toBe('maya');
    expect(errors.slice(before)).toEqual([]);
  });

  it('Clear removes chips and typed text; picked agents are counted for the filter badge', async () => {
    await typeInto('searchListAgent', 'maya');
    pick('listAgent', 1);
    expect(w.AgentOfficeSearch.chosenCount()).toBe(1);
    expect(() => w.updateFilterCount()).not.toThrow();
    await typeInto('searchListAgent', 'leda');
    expect((d.getElementById('searchListAgent') as HTMLInputElement).value).toBe('leda');
    w.clearSearchForm();
    expect(chips('listAgent')).toEqual([]);
    expect((d.getElementById('searchListAgent') as HTMLInputElement).value).toBe('');
    expect(agentKeys(w.collectSearchCriteria())).toEqual([]);
    expect(w.AgentOfficeSearch.chosenCount()).toBe(0);
  });

  it('only Cotality can evaluate agent/office filters, so no local pre-render is shown for them', async () => {
    const row = (id: string) => ({
      id, lid: id, status: 'ACTIVE', price: 1, beds: 1, baths: 1, rooms: 1, address: 'A', unit: '', neighborhood: '', zip: '', borough: 'Manhattan', company: '',
      listingCategory: 'sale', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true,
      permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true, syndication: true },
    });
    w.listings.push(row('L1'), row('L2'));
    try {
      w.performSearch();
      expect(w.searchResultsState.filteredListings.length).toBeGreaterThan(0); // control: without agent criteria the local rows pre-render
      w.clearSearchForm();
      await typeInto('searchListAgent', 'maya');
      pick('listAgent', 1);
      w.performSearch();
      expect(w.searchResultsState.filteredListings).toEqual([]);
    } finally { w.listings.length = 0; }
  });

  it('saved searches keep the entries, reopen the advanced form and restore without a network call', async () => {
    await typeInto('searchCoListOffice', 'corcoran');
    pick('coListOffice', 0);
    await typeInto('searchListAgent', 'maya');
    pick('listAgent', 1);
    w.activeSearchCriteria = w.collectSearchCriteria();
    const saved = w._criteriaToApiFormat(w.activeSearchCriteria);
    expect(saved.agent_office).toEqual({
      listAgent: [{ id: '39361', label: 'Maya Allan' }],
      coListOffice: [{ text: 'corcoran', label: 'name contains “corcoran”' }],
    });
    w.clearSearchForm();
    w.toggleSearchMode('basic');
    calls.length = 0;
    w._criteriaToFormFields({ listing_type: 'sale', _search_tab: 'sale', agent_office: saved.agent_office });
    expect((d.getElementById('searchAdvancedMode') as HTMLElement).style.display).toBe('block');
    expect(w.AgentOfficeSearch.getState()).toEqual(saved.agent_office);
    expect(calls).toEqual([]);
    const criteria = w.collectSearchCriteria();
    expect([criteria.listAgent, criteria.coListOffice]).toEqual(['39361', 'corcoran']);
  });
});

describe('the Exclusive box and the client post-filter on the real page', () => {
  const EXCLUSIVE = LIVE_AGREEMENTS.filter((v) => v.startsWith('Exclusive')).sort();
  const row = (agreement: string | null) => ({ lid: String(agreement), id: String(agreement), ListingAgreement: agreement, status: 'Active', permissions: {} });
  const kept = (values: string[]): string[] =>
    w
      .filterListings(LIVE_AGREEMENTS.concat([null as unknown as string]).map(row), { searchTab: 'sale', checkboxFilters: { ListingAgreement: values } }, 'crm')
      .map((r: any) => r.ListingAgreement)
      .filter((v: string | null) => v !== null);

  it('ticking Exclusive sends the four exclusive agreements as one joined criterion', () => {
    const box = d.querySelector('#searchAdvancedMode [data-field="ListingAgreement"][data-value^="ExclusiveAgency,"]') as HTMLInputElement;
    box.checked = true;
    expect(w.collectSearchCriteria().checkboxFilters).toEqual({ ListingAgreement: [EXCLUSIVE.join(',')] });
  });

  it('the post-filter keeps exactly those four and drops the rest (rows without a value are not excluded)', () => {
    expect(kept([EXCLUSIVE.join(',')]).sort()).toEqual(EXCLUSIVE);
  });

  it('a single value matches exactly: ExclusiveAgency does not pull in CoExclusiveAgency', () => {
    expect(kept(['ExclusiveAgency'])).toEqual(['ExclusiveAgency']);
    expect(kept(['CoExclusiveAgency'])).toEqual(['CoExclusiveAgency']);
  });
});

describe('MallanAPI.idx.search forwards the filters the server supports and Cotality evaluates', () => {
  it('sends the agent/office filters, the checkbox filters, management company, unit and contract dates; keyword stays client-side', async () => {
    w.MallanAPI.idx.search({
      type: 'sale',
      checkboxFilters: '{"ListingAgreement":["Open"]}',
      keyword: 'terrace', managementCompany: 'Compass', unit: '5A',
      contractDateFrom: '2026-01-01', contractDateTo: '2026-02-01',
      listAgent: '39361', coListAgent: '94043', anyAgent: '97052', listOffice: '7041', coListOffice: 'corcoran',
    });
    await sleep(50);
    expect(searchUrl().searchParams.has('keyword')).toBe(false);
    expect(Object.fromEntries(searchUrl().searchParams.entries())).toMatchObject({
      type: 'sale',
      checkboxFilters: '{"ListingAgreement":["Open"]}',
      managementCompany: 'Compass', unit: '5A',
      contractDateFrom: '2026-01-01', contractDateTo: '2026-02-01',
      listAgent: '39361', coListAgent: '94043', anyAgent: '97052', listOffice: '7041', coListOffice: 'corcoran',
    });
  });

  it('Search sends the ticked checkbox filters (they previously never left the page)', async () => {
    (d.querySelector('#agentOfficeSearch [data-field="ListingAgreement"][data-value="Open"]') as HTMLInputElement).checked = true;
    w.performSearch();
    await sleep(300);
    expect(searchUrl().searchParams.get('checkboxFilters')).toBe('{"ListingAgreement":["Open"]}');
  });
});

describe('every enabled Search control sends only values live Cotality accepts', () => {
  // Controls handled by other parameters (status, ownership, property subtype) or by a post-fetch filter.
  const HANDLED_ELSEWHERE = new Set(['MlsStatus', 'CommonInterest', 'PropertySubType', 'SponsorUnit']);
  // Enabled controls whose field the server never sends to Cotality: they only narrow the rows the server already returned, so they are a
  // silent partial filter. This is the visible backlog and it may only shrink: wire a new control to a live Cotality field instead of adding to it.
  const CLIENT_ONLY_BACKLOG = ['BathroomCondition', 'BuildingSmokeFreeYN', 'KitchenCondition', 'PetsAllowed', 'PoolFeatures', 'PriceChangeDirection', 'PriceChangeTimestamp', 'PropertyCondition'];
  // Live Cotality answered HTTP 400 (not a valid enumeration type) to each of these, or the field is empty live; they are disabled.
  const DISABLED = [
    ['AccessibilityFeatures', 'WheelchairAccessible'], ['StructureType', 'Loft'], ['StructureType', 'WalkUp'], ['ArchitecturalStyle', 'Brownstone'],
    ['ExteriorFeatures', 'RoofDeck'], ['ExteriorFeatures', 'Terrace'], ['LaundryFeatures', 'Common'], ['BuildingFeatures', 'Fitness'],
    ['BuildingFeatures', 'BikeRoom'], ['BusinessType', 'FlexibleSpace'], ['BusinessType', 'Investment'],
  ];

  const enabledControls = (): Array<{ field: string; value: string }> => {
    const found = new Map<string, { field: string; value: string }>();
    d.querySelectorAll('#searchBasicMode input[data-field], #searchAdvancedMode input[data-field]').forEach((el) => {
      const input = el as HTMLInputElement;
      if (input.disabled || input.closest('[data-dead-container="true"]')) return;
      const field = input.getAttribute('data-field') as string;
      const value = input.getAttribute('data-value') || input.value || '';
      if (value) found.set(field + '|' + value, { field, value });
    });
    d.querySelectorAll('#searchBasicMode select[data-field], #searchAdvancedMode select[data-field]').forEach((el) => {
      const select = el as HTMLSelectElement;
      if (select.disabled) return;
      const field = select.getAttribute('data-field') as string;
      [...select.options].forEach((o) => { if (o.value) found.set(field + '|' + o.value, { field, value: o.value }); });
    });
    return [...found.values()];
  };
  const clauseFor = (field: string, value: string) =>
    buildCrmIdxODataFilter(new URLSearchParams({ status: '*', checkboxFilters: JSON.stringify({ [field]: [value] }) }));

  it('no enabled control produces a clause with a value that is not a live enumeration member', () => {
    const problems: string[] = [];
    for (const c of enabledControls()) {
      if (HANDLED_ELSEWHERE.has(c.field)) continue;
      const clause = clauseFor(c.field, c.value);
      for (const m of clause.matchAll(/([A-Za-z0-9]+) eq '([^']*)'/g)) {
        const members = mirror.enums[m[1]];
        if (!members || !members.includes(m[2])) problems.push(c.field + '=' + c.value + ' -> ' + m[1] + " eq '" + m[2] + "'");
      }
      for (const m of clause.matchAll(/([A-Za-z0-9]+) eq (true|false)/g)) {
        if (mirror.entities.Property[m[1]] !== 'Edm.Boolean') problems.push(c.field + '=' + c.value + ' -> ' + m[1] + ' is not a live boolean');
      }
    }
    expect(problems).toEqual([]);
  });

  it('the enabled controls the server never sends are exactly the documented backlog', () => {
    const clientOnly = new Set<string>();
    for (const c of enabledControls()) if (!HANDLED_ELSEWHERE.has(c.field) && clauseFor(c.field, c.value) === '') clientOnly.add(c.field);
    expect([...clientOnly].sort()).toEqual([...CLIENT_ONLY_BACKLOG].sort());
  });

  it('controls Cotality rejects, and the empty PetsAllowedYN pet controls, are disabled with a reason', () => {
    for (const [field, value] of DISABLED) {
      const boxes = [...d.querySelectorAll('input[data-field="' + field + '"][data-value="' + value + '"]')] as HTMLInputElement[];
      expect({ field, value, found: boxes.length > 0, allDisabled: boxes.every((b) => b.disabled), titled: boxes.every((b) => b.title === 'Not currently supported') })
        .toEqual({ field, value, found: true, allDisabled: true, titled: true });
    }
    const pets = [...d.querySelectorAll('input[data-field="BuildingPetsAllowed"]')] as HTMLInputElement[];
    expect(pets.length).toBeGreaterThan(0);
    expect(pets.every((b) => b.disabled)).toBe(true);
  });

  it('DirectionFaces sends the live members and the Park view sends ParkGreenbelt', () => {
    const live = mirror.enums.DirectionFaces.filter((v) => v !== 'Unknown').sort();
    expect(enabledControls().filter((c) => c.field === 'DirectionFaces').map((c) => c.value).sort()).toEqual(live);
    expect(enabledControls().filter((c) => c.field === 'View' && /Park/.test(c.value)).map((c) => c.value)).toEqual(['ParkGreenbelt']);
  });

  it('saved searches that hold the old DirectionFaces codes still restore and still reach Cotality as live members', () => {
    w.toggleSearchMode('advanced');
    w.clearSearchForm();
    w._criteriaToFormFields({ listing_type: 'sale', _search_tab: 'sale', checkbox_filters: JSON.stringify({ DirectionFaces: ['N', 'SE'] }) });
    const ticked = [...d.querySelectorAll('#searchAdvancedMode input[data-field="DirectionFaces"]:checked')].map((c) => c.getAttribute('data-value')).sort();
    expect(ticked).toEqual(['North', 'Southeast']);
    expect(buildCrmIdxODataFilter(new URLSearchParams({ status: '*', checkboxFilters: JSON.stringify({ DirectionFaces: ['N', 'SE'] }) }))).toContain(
      "(DirectionFaces eq 'North' or DirectionFaces eq 'Southeast')",
    );
  });
});
