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
import { buildCrmIdxQuery } from '@/lib/search/crm-idx-filter';

// The agent/office and listing-agreement clauses now live inside the live-contract query builder (integration 2026-10-28):
// the whole Cotality filter string is buildCrmIdxQuery(params).filter.
const buildCrmIdxODataFilter = (params: URLSearchParams): string => buildCrmIdxQuery(params).filter;
import { MALLAN_LIST_OFFICE_MLS_IDS } from '@/lib/listings/mallan-source-identity';
import { resolveListingMedia } from '@/lib/media/listing-media-resolver';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

jest.setTimeout(30000);

const ROOT = resolve(__dirname, '../..');
const SHELL = readFileSync(resolve(ROOT, 'public/crm/index-built.html'), 'utf8');
const mirror = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-enums.live.json'), 'utf8')) as {
  search: { property: Record<string, { kind: string; lookup?: string }> };
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
let mediaBatch: ((url: string) => unknown) | null = null; // per-test answer of the stubbed /api/media/batch
let mediaCalls = 0; // how many times the page asked for media in the current test; past 200 the stub answers "failed", so a request loop in the page ends (and the test that counts the requests fails) instead of spinning
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
        const u = String(url).replace(/^https?:\/\/[^/]+/, '');            // the API client sends same-origin absolute URLs (agent-context: location.origin)
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
        if (u.includes('/api/media/batch')) {
          mediaCalls++;
          await sleep(1);                                                          // a real answer takes a macrotask: timers (and the test's own waits) keep running while the page asks
          if (mediaCalls > 200) return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
          return ok(mediaBatch ? mediaBatch(u) : {});
        }
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
  mediaBatch = null;
  mediaCalls = 0;
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

  it('results come only from Cotality: local rows are never pre-rendered, with or without agent criteria', async () => {
    const row = (id: string) => ({
      id, lid: id, status: 'ACTIVE', price: 1, beds: 1, baths: 1, rooms: 1, address: 'A', unit: '', neighborhood: '', zip: '', borough: 'Manhattan', company: '',
      listingCategory: 'sale', idxDisplayYN: true, internetDisplayYN: true, addressDisplayYN: true,
      permissions: { ownerOptOut: false, participantOnly: false, idxDisplay: true, internetDisplay: true, syndication: true },
    });
    w.listings.push(row('L1'), row('L2'));
    try {
      calls.length = 0;
      w.performSearch();
      expect(w.searchResultsState.filteredListings).toEqual([]);                   // the preloaded rows are not a result population
      expect(calls.some((c) => c.includes('/api/idx/search'))).toBe(true);         // Cotality is asked
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
  it('sends the agent/office filters, the checkbox filters, management company, unit, contract dates and the keyword (Cotality evaluates contains(PublicRemarks))', async () => {
    w.MallanAPI.idx.search({
      type: 'sale',
      checkboxFilters: '{"ListingAgreement":["Open"]}',
      keyword: 'terrace', managementCompany: 'Compass', unit: '5A',
      contractDateFrom: '2026-01-01', contractDateTo: '2026-02-01',
      listAgent: '39361', coListAgent: '94043', anyAgent: '97052', listOffice: '7041', coListOffice: 'corcoran',
    });
    await sleep(50);
    expect(searchUrl().searchParams.get('keyword')).toBe('terrace');
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
  // Controls handled by other parameters (status, ownership, property subtype). (Sponsor Unit was here, as a post-fetch filter; the control is disabled now, see below, and if it is ever enabled again this
  // test must see it: a control the server never sends is a silent partial filter.)
  const HANDLED_ELSEWHERE = new Set(['StandardStatus', 'CommonInterest', 'PropertySubType']);
  // Enabled controls whose field the server never sends to Cotality: they only narrow the rows the server already returned, so they are a
  // silent partial filter. This is the visible backlog and it may only shrink: wire a new control to a live Cotality field instead of adding to it.
  const CLIENT_ONLY_BACKLOG = ['BathroomCondition', 'BuildingSmokeFreeYN', 'KitchenCondition', 'PetsAllowed', 'PoolFeatures', 'PriceChangeDirection', 'PriceChangeTimestamp', 'PropertyCondition'];
  // Live Cotality answered HTTP 400 (not a valid enumeration type) to each of these, or the field is empty live; they are disabled. (Six more were in this list: they were mapped to the live member
  // that stands for them and enabled, see REMAPPED below. The ones left have no single live member: Brownstone and Terrace have none, "Laundry in Building" has several candidates, Flexible Space and
  // Investment are PropertySubType members, not BusinessType members.)
  const DISABLED = [
    ['ArchitecturalStyle', 'Brownstone'], ['BusinessType', 'FlexibleSpace'], ['BusinessType', 'Investment'],
  ];
  // [the field and the live member the control sends now, the field and the value it used to send]
  const REMAPPED: Array<[string, string, string, string]> = [
    ['AccessibilityFeatures', 'WheelchairAccess', 'AccessibilityFeatures', 'WheelchairAccessible'],
    ['ArchitecturalStyle', 'Loft', 'StructureType', 'Loft'],
    ['ArchitecturalStyle', 'WalkUp', 'StructureType', 'WalkUp'],
    ['ExteriorFeatures', 'BuildingRoofDeck', 'ExteriorFeatures', 'RoofDeck'],
    ['BuildingFeatures', 'FitnessCenter', 'BuildingFeatures', 'Fitness'],
    ['BuildingFeatures', 'BikeStorage', 'BuildingFeatures', 'BikeRoom'],
    ['LaundryFeatures', 'CommonArea', 'LaundryFeatures', 'Common'],   // "Laundry in Building" is the live CommonArea,CommonOnFloor pair (2026-10-23), no longer a disabled Common
  ];

  const enabledControls = (includeGenerated = false): Array<{ field: string; value: string }> => {
    const found = new Map<string, { field: string; value: string }>();
    d.querySelectorAll('#searchBasicMode input[data-field], #searchAdvancedMode input[data-field]').forEach((el) => {
      const input = el as HTMLInputElement;
      if (input.disabled || input.closest('[data-dead-container="true"]')) return;
      if (!includeGenerated && input.closest('[data-generated-cotality]')) return;
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

  it('no enabled control (the generated live-contract controls included) produces a clause with a value that is not a live enumeration member', () => {
    const problems: string[] = [];
    const property = mirror.search.property;
    for (const c of enabledControls(true)) {
      if (HANDLED_ELSEWHERE.has(c.field)) continue;
      const clause = clauseFor(c.field, c.value);
      for (const m of clause.matchAll(/([A-Za-z0-9]+) (?:eq|has) '([^']*)'/g)) {
        const meta = property[m[1]];
        if (!meta || (meta.kind !== 'enum' && meta.kind !== 'multi')) continue;                       // a text or id field: no enumeration to check
        const members = mirror.enums[meta.lookup || m[1]];
        if (!members || !members.includes(m[2])) problems.push(c.field + '=' + c.value + ' -> ' + m[1] + " eq '" + m[2] + "'");
      }
      for (const m of clause.matchAll(/([A-Za-z0-9]+) eq (true|false)/g)) {
        if (mirror.entities.Property[m[1]] !== 'Edm.Boolean') problems.push(c.field + '=' + c.value + ' -> ' + m[1] + ' is not a live boolean');
      }
    }
    expect(problems).toEqual([]);
  });

  it('controls Cotality rejects, and the empty PetsAllowedYN pet controls, are disabled with a reason', () => {
    for (const [field, value] of DISABLED) {
      const boxes = [...d.querySelectorAll('input[data-field="' + field + '"][data-value="' + value + '"]')] as HTMLInputElement[];
      expect({ field, value, found: boxes.length > 0, allDisabled: boxes.every((b) => b.disabled), titled: boxes.every((b) => b.title.trim().length > 0) })
        .toEqual({ field, value, found: true, allDisabled: true, titled: true });
    }
    // The building pet controls are PetsAllowed boxes on the live Building* members (BuildingYes, BuildingCatsOk, BuildingDogsOk, BuildingNo);
    // PetsAllowedYN is empty live (0 rows, contract 2026-10-24) and no enabled control stands on it.
    const pets = ([...d.querySelectorAll('#searchBasicMode input[data-field="PetsAllowed"], #searchBasicModeRental input[data-field="PetsAllowed"], #searchBasicModeBuilding input[data-field="PetsAllowed"]')] as HTMLInputElement[])
      .filter((b) => (b.getAttribute('data-value') || '').split(',').every((v) => v.startsWith('Building')));
    expect(pets.length).toBeGreaterThan(0);
    expect(pets.every((b) => !b.disabled)).toBe(true);
    for (const b of pets) for (const v of (b.getAttribute('data-value') || '').split(',')) expect(mirror.enums.PetsAllowed).toContain(v);
    expect(enabledControls().filter((c) => c.field === 'PetsAllowedYN')).toEqual([]);
  });

  it('the controls mapped to a live member are enabled in every panel, send that member, and the value live Cotality rejected is no longer offered', () => {
    for (const [field, value, oldField, oldValue] of REMAPPED) {
      expect(mirror.enums[field]).toContain(value);
      const boxes = ([...d.querySelectorAll('input[data-field="' + field + '"]')] as HTMLInputElement[]).filter((b) => (b.getAttribute('data-value') || '').split(',').includes(value));
      expect({ field, value, found: boxes.length > 0, anyDisabled: boxes.some((b) => b.disabled || b.title === 'Not currently supported') }).toEqual({ field, value, found: true, anyDisabled: false });
      expect(enabledControls().some((c) => c.field === field && c.value.split(',').includes(value))).toBe(true);
      expect(clauseFor(field, value)).toMatch(new RegExp(field + " (eq|has) '" + value + "'"));
      expect({ oldField, oldValue, offered: d.querySelectorAll('input[data-field="' + oldField + '"][data-value="' + oldValue + '"]').length }).toEqual({ oldField, oldValue, offered: 0 });
    }
  });

  it('Exposure sends the live Exposures members (live NYC listings carry Exposures, not DirectionFaces) and the Park view sends ParkGreenbelt', () => {
    const live = mirror.enums.Exposures.filter((v) => v !== 'Unknown').sort();
    expect(enabledControls().filter((c) => c.field === 'Exposures').map((c) => c.value).sort()).toEqual(live);
    expect(enabledControls().filter((c) => c.field === 'DirectionFaces')).toEqual([]);
    expect(enabledControls().filter((c) => c.field === 'View' && /Park/.test(c.value)).map((c) => c.value)).toEqual(['ParkGreenbelt']);
  });

  it('saved searches that hold the old DirectionFaces codes still restore (onto the Exposure boxes) and still reach Cotality as live Exposures members', () => {
    w.toggleSearchMode('advanced');
    w.clearSearchForm();
    // the record restores into the form it was saved from (_search_mode, 2026-10-26); the exposure boxes are in the advanced form
    const unresolved = w._criteriaToFormFields({ listing_type: 'sale', _search_tab: 'sale', _search_mode: 'advanced', checkbox_filters: JSON.stringify({ DirectionFaces: ['N', 'SE'] }) });
    expect(unresolved).toEqual([]);
    const ticked = [...d.querySelectorAll('#searchAdvancedMode input[data-field="Exposures"]:checked')].map((c) => c.getAttribute('data-value')).sort();
    expect(ticked).toEqual(['North', 'Southeast']);
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ status: '*', checkboxFilters: JSON.stringify({ DirectionFaces: ['N', 'SE'] }) }));
    expect(filter).toMatch(/(Exposures (?:eq|has) 'North' or Exposures (?:eq|has) 'Southeast')/);
    expect(filter).not.toContain('DirectionFaces');
  });
});

describe('Sponsor Unit: SponsorUnitYN (a CustomFields flag on the listed unit) is a checkbox criterion the server resolves on CustomProperty', () => {
  // Live Cotality 2026-10-23: SponsorUnitYN is "1" / "0" text inside CustomProperty.CustomFields; Cotality cannot filter it. The page sends the
  // box as an ordinary checkbox criterion and lib/search/crm-idx-filter.ts turns a CustomFields key into a LOCAL criterion (source customFields)
  // that the route applies exactly to the expanded CustomProperty of each listing (Master §5.0: executed, applied by Mallan, or refused; never dropped).
  const boxes = () => [...d.querySelectorAll('input[data-field="SponsorUnitYN"]')] as HTMLInputElement[];
  afterEach(() => boxes().forEach((b) => { b.checked = false; }));

  it('the Sponsor Unit checkbox is offered and enabled', () => {
    expect(boxes().length).toBeGreaterThan(0);
    expect(boxes().every((b) => !b.disabled)).toBe(true);
  });

  it('ticking it sends checkboxFilters SponsorUnitYN = true (no fieldFilters, no sponsorUnit parameter) and the server builder keeps it as a customFields criterion', async () => {
    boxes().forEach((b) => { b.checked = true; });
    const params = w.buildIdxSearchParams(w.collectSearchCriteria());
    expect(params).not.toHaveProperty('sponsorUnit');
    expect(params).not.toHaveProperty('fieldFilters');
    expect(JSON.parse(params.checkboxFilters).SponsorUnitYN).toEqual(['true']);
    const q = buildCrmIdxQuery(new URLSearchParams({ status: '*', checkboxFilters: params.checkboxFilters }));
    expect(q.refused).toEqual([]);
    expect(q.local.filter((l) => l.field === 'SponsorUnitYN').map((l) => l.source)).toEqual(['customFields']);

    calls.length = 0;
    w.performSearch();
    await sleep(300);
    const sent = searchUrl().searchParams;
    expect(sent.has('fieldFilters')).toBe(false);
    expect(JSON.parse(sent.get('checkboxFilters') as string).SponsorUnitYN).toEqual(['true']);
  });

  it('a saved search written before the cutover (sponsor_unit: true on its own) still runs as the dedicated sponsorUnit parameter', () => {
    const params = w.buildIdxSearchParams({ searchTab: 'sale', checkboxFilters: { SponsorUnit: ['true'] } });
    expect(params.sponsorUnit).toBe('true');
    expect(params).not.toHaveProperty('checkboxFilters');
    const q = buildCrmIdxQuery(new URLSearchParams({ status: '*', sponsorUnit: 'true' }));
    expect(q.refused).toEqual([]);
    expect(q.local.filter((l) => l.field === 'SponsorUnitYN').map((l) => l.source)).toEqual(['customFields']);
  });
});

describe('a Custom box with nothing typed refuses the search in every form (the bound would otherwise be dropped silently)', () => {
  const toasts: string[] = [];
  beforeAll(() => { w.showToast = (m: string) => { toasts.push(m); }; });
  afterEach(() => { toasts.length = 0; w.clearSearchForm(); });
  it.each([
    ['basic sale', 'basic', 'sale', 'saleMaxPrice'],
    ['basic rental', 'basic', 'rent', 'rentalMaxRent'],
    ['advanced', 'advanced', 'sale', 'advSaleMaxPrice'],
  ])('%s form', (_name, mode, tab, id) => {
    w.toggleSearchMode(mode); w.toggleSearchTab(tab); w.clearSearchForm();
    const sel = d.getElementById(id) as HTMLSelectElement;
    expect([...sel.options].some((o) => o.value === 'custom')).toBe(true);
    sel.value = 'custom'; sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    calls.length = 0;
    w.performSearch();
    expect(calls.filter((c) => c.includes('/api/idx/search'))).toEqual([]);
    expect(toasts.join(' | ')).toMatch(/custom/i);
  });
});

describe('Outdoor Space labels send the live member they name', () => {
  it('Terrace is PatioAndPorchFeatures = Terrace (the unit\'s own), and each Outdoor Space label sends the live member it names', () => {
    expect(mirror.enums.PatioAndPorchFeatures).toEqual(expect.arrayContaining(['Terrace', 'BuildingTerrace', 'Balcony']));
    const want: Record<string, [string, string]> = { Balcony: ['ExteriorFeatures', 'Balcony'], Terrace: ['PatioAndPorchFeatures', 'Terrace'], Patio: ['ExteriorFeatures', 'Patio'], 'Roof Deck': ['ExteriorFeatures', 'BuildingRoofDeck'], Garden: ['ExteriorFeatures', 'Garden'], Yard: ['ExteriorFeatures', 'PrivateYard'] };
    const box = [...d.querySelectorAll('label')].filter((l) => (l.textContent || '').trim() in want && l.querySelector('input[data-field="PatioAndPorchFeatures"], input[data-field="ExteriorFeatures"]'));
    for (const [label, [field, value]] of Object.entries(want)) {
      const input = box.find((l) => (l.textContent || '').trim() === label)?.querySelector('input') as HTMLInputElement | undefined;
      expect({ label, field: input?.getAttribute('data-field'), value: input?.getAttribute('data-value') }).toEqual({ label, field, value });
      expect(mirror.enums[field]).toContain(value);
    }
  });
});

describe('detail media on the real page: only a Photo is a photo (a video or a tour is a link, a floor plan has its own place)', () => {
  // What /api/media/batch?detail=true answers for one listing: the real resolver's output for raw Cotality Media rows, shaped as app/api/media/batch/route.ts shapes them ({ url, mediaType, order }).
  // The CRM used to treat every row that was not a floor plan as a photo, so a video or a tour link was a broken <img> in the gallery and counted as a photo, and _videos / _virtualTours, which the
  // detail panel reads, were never set (found 2026-10-09 by an independent review).
  const RAW_MEDIA = [
    { MediaURL: 'https://media.example.com/L/photo-1.jpg', Order: 1, MediaCategory: 'Photo' },
    { MediaURL: 'https://media.example.com/L/photo-2.jpg', Order: 2, MediaCategory: 'Photo' },
    { MediaURL: 'https://media.example.com/L/layout.jpg', Order: 3, MediaCategory: 'FloorPlan' },
    { MediaURL: 'https://media.example.com/L/walkthrough.mp4', Order: 4, MediaCategory: 'Video' },
    { MediaURL: 'https://tours.example.com/L/branded', Order: 5, MediaCategory: 'BrandedVirtualTour' },
    { MediaURL: 'https://tours.example.com/L/unbranded', Order: 6, MediaCategory: 'UnbrandedVirtualTour' },
    { MediaURL: 'https://media.example.com/L/agent-headshot.jpg', Order: 7, MediaCategory: 'AgentPhoto' },        // live MediaCategory members that are no picture of the listing:
    { MediaURL: 'https://media.example.com/L/office-logo.png', Order: 8, MediaCategory: 'OfficeLogo' },          // the resolver calls them Unknown, and the old CRM rule showed them as photos
  ];
  const ROWS = resolveListingMedia(RAW_MEDIA).map((r) => ({ url: r.url, mediaType: r.mediaType, order: r.providerOrder }));
  const urls = (type: string) => ROWS.filter((r) => r.mediaType === type).map((r) => r.url);
  const rowsOf = (...types: string[]) => ROWS.filter((r) => types.includes(r.mediaType));
  const added: any[] = [];
  const addListing = (lid: string, extra: Record<string, unknown> = {}) => {
    const listing: any = { lid, id: lid, ...extra };
    w.listings.push(listing);
    added.push(listing);
    return listing;
  };
  afterEach(() => {
    for (const listing of added.splice(0)) {
      const at = w.listings.indexOf(listing);
      if (at >= 0) w.listings.splice(at, 1);
    }
  });
  const answer = (lid: string, rows: Array<{ url: string; mediaType: string; order: number }>) => {
    mediaBatch = () => ({ photos: { [lid]: rows.find((r) => r.mediaType === 'Photo')?.url ?? null }, media: { [lid]: rows } });
  };
  const fetchDetail = (lid: string) => new Promise<void>((done) => w.fetchDetailMedia(lid, () => done()));

  it('the fixture carries all five kinds the resolver tells apart (the tests below are not vacuous), and the live categories AgentPhoto and OfficeLogo are Unknown to it', () => {
    expect(ROWS.map((r) => r.mediaType).sort()).toEqual(['FloorPlan', 'Photo', 'Photo', 'Unknown', 'Unknown', 'Video', 'VirtualTour', 'VirtualTour']);
    const live = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-enums.live.json'), 'utf8')).enums.MediaCategory as string[];
    expect(RAW_MEDIA.map((r) => r.MediaCategory).filter((c) => !live.includes(c))).toEqual([]);   // every category of the fixture is a live Cotality member
  });

  it('sorts the five kinds where the detail panel reads them, and the unknown one nowhere', async () => {
    const listing = addListing('L-MEDIA-ALL');
    answer('L-MEDIA-ALL', ROWS);
    await fetchDetail('L-MEDIA-ALL');
    expect(listing.images.map((i: any) => i.url)).toEqual(urls('Photo'));
    expect(listing.images.every((i: any) => i.mediaType === 'Photo')).toBe(true);
    expect(listing.photoCount).toBe(2);                                              // the two photos, not the seven rows
    expect(listing._floorPlans.map((i: any) => i.url)).toEqual(urls('FloorPlan'));
    expect(listing._videos.map((i: any) => i.url)).toEqual(urls('Video'));
    expect(listing._virtualTours.map((i: any) => i.url)).toEqual(urls('VirtualTour'));
    const everywhere = [...listing.images, ...listing._floorPlans, ...listing._videos, ...listing._virtualTours].map((i: any) => i.url).sort();
    expect(everywhere).toEqual(rowsOf('Photo', 'FloorPlan', 'Video', 'VirtualTour').map((r) => r.url).sort());
    expect(urls('Unknown')).toHaveLength(2);
    for (const unknown of urls('Unknown')) expect(everywhere).not.toContain(unknown);                    // not the agent's headshot, not the office logo
  });

  it('a listing whose only media is a video and tours gets no photo: the gallery is untouched and the photo count is not raised', async () => {
    const listing = addListing('L-MEDIA-LINKS', { photoCount: 0 });
    answer('L-MEDIA-LINKS', rowsOf('Video', 'VirtualTour'));
    await fetchDetail('L-MEDIA-LINKS');
    expect(listing.images).toBeUndefined();
    expect(listing.photoCount).toBe(0);
    expect(listing._videos).toHaveLength(1);
    expect(listing._virtualTours).toHaveLength(2);
    expect(listing._floorPlans).toBeUndefined();
  });

  it('a row of a kind the resolver does not know is not a photo, a floor plan, a video or a tour', async () => {
    const listing = addListing('L-MEDIA-UNKNOWN', { photoCount: 3 });
    answer('L-MEDIA-UNKNOWN', rowsOf('Unknown'));
    await fetchDetail('L-MEDIA-UNKNOWN');
    expect([listing.images, listing._floorPlans, listing._videos, listing._virtualTours]).toEqual([undefined, undefined, undefined, undefined]);
    expect(listing.photoCount).toBe(3);
  });

  it('the photo count only goes up (the provider\'s own count is authoritative), and the photos come in the provider\'s order', async () => {
    const listing = addListing('L-MEDIA-COUNT', { photoCount: 10 });
    answer('L-MEDIA-COUNT', [...rowsOf('Photo')].reverse());                         // the answer arrives in the wrong order
    await fetchDetail('L-MEDIA-COUNT');
    expect(listing.photoCount).toBe(10);
    expect(listing.images.map((i: any) => i.order)).toEqual([1, 2]);
  });

  it('a report builds its images from photos and floor plans only, in order, with the floor plans marked so the report pages can tell them apart', () => {
    const images = w.reportImagesFromMedia(ROWS);
    expect(images.map((i: any) => [i.url, i.mediaType, i.mediaCategory, i.imageOf])).toEqual([
      ...urls('Photo').map((u) => [u, 'Photo', 'Photo', 'Photo']),
      ...urls('FloorPlan').map((u) => [u, 'FloorPlan', 'FloorPlan', 'FloorPlan']),
    ]);
    expect(w.reportImagesFromMedia([...ROWS].reverse()).map((i: any) => i.order)).toEqual([1, 2, 3]);      // in the provider's order, whatever order the answer comes in
    expect(w.reportImagesFromMedia(rowsOf('Video', 'VirtualTour', 'Unknown'))).toEqual([]);
    expect(w.reportImagesFromMedia(undefined)).toEqual([]);
    expect(w.reportImagesFromMedia([null, { url: 'https://media.example.com/L/typeless.jpg' }])).toEqual([]);
  });

  // The report preview asks for the media of every listing that has no images, then re-renders; the preview itself needs more of the page than this test boots, so only the part that fetches and applies is observed.
  const runReportPreview = async (listing: any) => {
    const before = w.searchResultsState.filteredListings;
    w.searchResultsState.filteredListings = [listing];
    try {
      try { w.populateReportPreview(); } catch { /* the media fetch has been issued by then */ }
      await sleep(200);
    } finally {
      w.searchResultsState.filteredListings = before;
    }
  };

  it('a report that fetches the media of a listing without images gets photos and floor plans only, and counts the photos only', async () => {
    const listing = addListing('L-MEDIA-REPORT', { status: 'Active', idxDisplayYN: true, internetDisplayYN: true });
    answer('L-MEDIA-REPORT', ROWS);
    await runReportPreview(listing);
    expect(calls.some((c) => c.includes('/api/media/batch') && c.includes('detail=true') && c.includes('L-MEDIA-REPORT'))).toBe(true);
    expect(listing.images.map((i: any) => i.mediaType)).toEqual(['Photo', 'Photo', 'FloorPlan']);
    expect(listing.photoCount).toBe(2);
  });

  it('a report listing whose media are only a video and tours falls back to the primary photo the same answer carries, and to nothing when there is none', async () => {
    const withPrimary = addListing('L-MEDIA-FALLBACK', { status: 'Active', idxDisplayYN: true, internetDisplayYN: true });
    mediaBatch = () => ({ photos: { 'L-MEDIA-FALLBACK': 'https://media.example.com/L/primary.jpg' }, media: { 'L-MEDIA-FALLBACK': rowsOf('Video', 'VirtualTour') } });
    await runReportPreview(withPrimary);
    expect(withPrimary.images).toEqual([{ url: 'https://media.example.com/L/primary.jpg', isPrimary: true, mediaType: 'Photo', mediaCategory: 'Photo', imageOf: 'Photo' }]);
    expect(withPrimary.photoCount).toBe(1);

    const withNone = addListing('L-MEDIA-NONE', { status: 'Active', idxDisplayYN: true, internetDisplayYN: true });
    answer('L-MEDIA-NONE', rowsOf('Video', 'VirtualTour'));                           // the answer's primary photo is null: the server picks photos only
    const asked = () => calls.filter((c) => c.includes('/api/media/batch') && c.includes('L-MEDIA-NONE')).length;
    await runReportPreview(withNone);
    expect(withNone.images).toBeUndefined();
    expect(withNone.photoCount).toBeUndefined();
    await sleep(300);
    expect(asked()).toBe(1);                                                          // asked once, not again: the re-render that follows the answer does not ask for the pictures a listing does not have
  });

  it('a listing with no media at all is asked for once, and a second preview does not ask again (it used to be fetched, re-rendered and fetched again, for ever)', async () => {
    const bare = addListing('L-MEDIA-BARE', { status: 'Active', idxDisplayYN: true, internetDisplayYN: true });
    mediaBatch = () => ({ photos: { 'L-MEDIA-BARE': null }, media: { 'L-MEDIA-BARE': [] } });
    await runReportPreview(bare);
    await sleep(300);
    expect(calls.filter((c) => c.includes('/api/media/batch') && c.includes('L-MEDIA-BARE'))).toHaveLength(1);
    expect(bare.images).toBeUndefined();
    await runReportPreview(bare);
    await sleep(300);
    expect(calls.filter((c) => c.includes('/api/media/batch') && c.includes('L-MEDIA-BARE'))).toHaveLength(1);
  });
});
