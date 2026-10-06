/// <reference types="jest" />
/**
 * The Tools viewers show the whole stored listing.
 *
 * Before: the viewers hydrated 70 controls from a 14-key object and 33 of those target ids do not exist on the page, so most of a stored
 * listing never appeared. They now read the record two ways (public/crm/js/forms/viewer-hydration.js):
 *   1. provider / typed keys, through tables that are VERBATIM copies of the Sale form's own save <-> load tables (and, for the Rental form,
 *      the inverse of what its collector derives);
 *   2. control keys: both forms save by sweeping every control into raw_data under `field.id || field.name`, so what the agent entered in
 *      each control is already in the record.
 *
 * What this pins:
 *  - the Sale table copies match the form row by row (a change to the form that is not copied fails here);
 *  - every table row points at a control that exists on the viewer, or is on the documented list of controls the viewer does not have;
 *  - a synced-style record (typed columns, JSON buckets, provider keys) fills the controls it should, and a provider value that no option
 *    offers is shown as text instead of vanishing;
 *  - co-listing agents and offices are shown read-only, apart from the primary agent and office;
 *  - the REAL Add form is filled in, saved through the real normalizer and persistence code, and opened in the viewer: every control the
 *    agent entered shows the same value (the few that do not are listed, with the reason, in the two KNOWN_LOST tables).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizePayload, buildPersistenceRecord } from '@/lib/compliance/normalizer';
import { typedAgentColumnsFromJson } from '@/lib/listings/agent-info-typed-columns';
import { bootViewer, field, rendered, until, sleep, VIEWER_HYDRATION, type ViewerFile } from './tools-viewer-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');
jest.setTimeout(120000);

/* eslint-disable @typescript-eslint/no-explicit-any */
const page = (name: string) => readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8').replace(/\r\n/g, '\n');
const win: any = {};
new Function('window', VIEWER_HYDRATION)(win);
const TABLES = win.MallanViewerHydration.tables;

// ── 1. The Sale table copies are the form's own tables ───────────────────────────────────────────────────────────────────────────────
function extractTable(src: string, name: string): string {
  const start = src.indexOf(`\nvar ${name} = `);
  expect(start).toBeGreaterThan(-1);
  const open = src[src.indexOf('= ', start) + 2];
  const end = src.indexOf(open === '[' ? '\n];' : '\n};', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start + 1, end + 3);
}
const evalTable = (text: string, name: string) => new Function(`${text}\nreturn ${name};`)();

describe('the viewer carries the Sale form tables verbatim', () => {
  const saleForm = page('SALE-FORM-REDESIGN');
  it.each([
    ['SALE_FIELD_MAP', 'FIELD_MAP'],
    ['SALE_CHECKBOX_ARRAY_MAP', 'CHECKBOX_ARRAY_MAP'],
    ['SALE_RADIO_MAP', 'RADIO_MAP'],
    ['BUILDING_FEATURES_LABEL_TO_CANONICAL', 'BUILDING_FEATURES_LABEL_TO_CANONICAL'],
    ['SALE_BUILDING_FEATURE_IDS', 'BUILDING_FEATURE_IDS'],
    ['SALE_SYNDICATION_MAP', 'SYNDICATION_MAP'],
  ])('%s', (formName, moduleName) => {
    expect(TABLES.sale[moduleName]).toEqual(evalTable(extractTable(saleForm, formName), formName));
  });
});

// ── 2. Every table row points at a control the viewer has (or is on the documented list) ──────────────────────────────────────────────
const toolsDoc = (name: string): Document => new JSDOM(page(name)).window.document;
const has = (doc: Document, key: string) => !!doc.getElementById(key) || doc.getElementsByName(key).length > 0;

// Table rows whose control the viewer does not have: the address atoms (the viewer shows the composed street line), the hidden agent field
// (the agent panel shows the identity), and the Sale cards that have not been brought over yet (commission type, auction, send-to flags,
// structure type, the buyer's-agent payer). Their stored values are not lost: the viewer lists them in its "Other stored fields" card
// (tested below), and this list shrinks as the cards are brought over.
const SALE_NOT_ON_VIEWER = [
  'saleStreetNumber', 'saleStreetName', 'saleStreetSuffix', 'saleStreetDirPrefix', 'saleCity', 'saleStateOrProvince', 'salePostalCity', 'saleCountyOrParish',
  'saleUnparsedAddress', 'saleUpdatingAgentMlsId', 'saleUpdatingAgentKey', 'saleUpdatingAgentOfficeKey', 'saleUpdatingAgentOfficeMlsId', 'saleStructureType', 'saleExclusiveCommissionType', 'saleAuctionType', 'saleAuctionTermsUrl',
  'saleAlsoAvailableForRent', 'saleSendToRls', 'saleSendToWebsite', 'saleBuyerAgentPays',
];
const RENTAL_NOT_ON_VIEWER: string[] = ['rentalFirstShowingDate'];

// Named radio / checkbox groups of the Add form that the viewer lacks, carries with other options, or carries alone. Each is a drift between
// the two pages; the test fails if the real drift is not exactly this, so a fix (or a new drift) cannot go unnoticed.
const GROUP_DRIFT: Record<'sale' | 'rental', { lacking: string[]; differ: string[]; viewerOnly: string[] }> = {
  sale: {
    lacking: ['checkbox:saleAlsoAvailableForRent', 'checkbox:saleSendToRls', 'checkbox:saleSendToWebsite', 'radio:saleBuyerAgentPays'],
    differ: ['radio:saleListingType'], // the Add form splits In-House into InHouseInternal / InHouseWebOnly; the viewer still offers InHouse
    viewerOnly: ['radio:saleCommissionType'], // the older payer radios the Add form replaced with saleBuyerAgentPays
  },
  rental: { lacking: [], differ: [], viewerOnly: ['radio:rentalPets'] }, // the older pets radios; the Add form stores PetsAllowed as a checkbox group
};

describe.each([
  ['SALE-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS', 'sale'],
  ['RENTAL-FORM-REDESIGN', 'RENTAL-FORM-WITH-TOOLS', 'rental'],
] as const)('%s and %s carry the same named groups', (redesign, tools, kind) => {
  it('the drift is exactly the documented drift', () => {
    const zones = [`${kind}MainTab1`, `${kind}MainTab2`, `${kind}MainTab3`, `${kind}MainTab4`, `${kind}BuildingModal`];
    const groups = (d: Document) => {
      const m = new Map<string, string[]>();
      for (const z of zones) {
        d.getElementById(z)?.querySelectorAll('input[type="checkbox"][name], input[type="radio"][name]').forEach((e) => {
          const el = e as HTMLInputElement;
          const k = `${el.type}:${el.name}`;
          m.set(k, [...(m.get(k) ?? []), el.value]);
        });
      }
      m.forEach((v) => v.sort());
      return m;
    };
    const r = groups(toolsDoc(redesign)), t = groups(toolsDoc(tools));
    const lacking = [...r.keys()].filter((k) => !t.has(k)).sort();
    const differ = [...r.keys()].filter((k) => t.has(k) && JSON.stringify(r.get(k)) !== JSON.stringify(t.get(k))).sort();
    const viewerOnly = [...t.keys()].filter((k) => !r.has(k)).sort();
    expect({ lacking, differ, viewerOnly }).toEqual({ lacking: [...GROUP_DRIFT[kind].lacking].sort(), differ: [...GROUP_DRIFT[kind].differ].sort(), viewerOnly: [...GROUP_DRIFT[kind].viewerOnly].sort() });
  });
});

describe.each([
  ['SALE-FORM-WITH-TOOLS', 'sale', SALE_NOT_ON_VIEWER],
  ['RENTAL-FORM-WITH-TOOLS', 'rental', RENTAL_NOT_ON_VIEWER],
] as const)('%s: every table row has a control', (file, kind, notOnViewer) => {
  const doc = toolsDoc(file);
  const t = TABLES[kind];
  const keys: string[] = [
    ...t.FIELD_MAP.map((r: any) => r.form),
    ...t.RADIO_MAP.map((r: any) => r.name),
    ...t.CHECKBOX_ARRAY_MAP.map((r: any) => r.name),
    ...(kind === 'sale' ? [...t.SYNDICATION_MAP.map((r: any) => r.id), ...t.BUILDING_FEATURE_IDS] : []),
  ];
  const missing = [...new Set(keys.filter((k) => !has(doc, k)))].sort();
  it('the rows without a control are exactly the documented ones', () => {
    expect(missing).toEqual([...notOnViewer].sort());
  });
});

// ── 3. A synced-style record: typed columns, JSON buckets and provider keys, none of the form's control keys ───────────────────────────
const SYNCED = {
  id: '77', listing_id: 'L77', mls_id: 'M77', status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Apartment',
  list_price: '1250000', bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 1, living_area: '1050',
  borough: 'Manhattan', neighborhood: 'Midtown East', city: 'New York', postal_code: '10017',
  idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: false,
  list_agent_full_name: 'Lena Lister', list_agent_mls_id: '39361', list_agent_email: 'lena@example.test', list_agent_direct_phone: '212-555-0101',
  list_office_name: 'Example Realty', list_office_mls_id: '7041', co_list_agent_mls_id: '70707', co_list_office_mls_id: '334',
  days_on_market: 12, cumulative_days_on_market: 40, status_changed_at: '2026-02-01T10:00:00.000Z',
  created_at: '2026-01-05T09:00:00.000Z', updated_at: '2026-02-02T09:00:00.000Z', expiration_date: '2026-12-31T00:00:00.000Z',
  address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'St', UnitNumber: '12B', City: 'New York', CityRegion: 'Manhattan', PostalCode: '10017', StateOrProvince: 'NY' },
  features: { PublicRemarks: 'Sunny corner unit', TaxAnnualAmount: 9600 },
  agent_info: {}, media: [],
  raw_data: {
    CommonInterest: 'Condominium', PropertySubType: 'Apartment', AssociationFee: 1450, AssociationFeeFrequency: 'Monthly', YearBuilt: 1962, StoriesTotal: 24, NumberOfUnitsTotal: 150,
    ListingAgreement: 'Open', PetsAllowed: ['Yes', 'CatsOk'],
    CoListAgentMlsId: '70707', CoListAgentFullName: 'Dara Dixon', CoListAgent2MlsId: '97052', CoListAgent2FullName: 'Paeder Alexander Varnam',
    CoListOfficeMlsId: '334', CoListOfficeName: 'Corcoran Group', CoListOffice2MlsId: '7041', CoListOffice2Name: 'Example Realty',
    ListOfficeMlsId: '7041',
  },
};

describe.each(['SALE-FORM-WITH-TOOLS', 'RENTAL-FORM-WITH-TOOLS'] as ViewerFile[])('%s: a synced-style record', (file) => {
  const sale = file.startsWith('SALE');
  const p = sale ? 'sale' : 'rental';
  it('fills the controls from typed columns and provider keys', async () => {
    const b = bootViewer(file, { listing: SYNCED });
    try {
      await until(() => rendered(b.d));
      expect([...new Set(b.errors)]).toEqual([]);
      expect(field(b.d, `${p}StreetAddress`)?.value).toBe('333 E 46th St');
      expect(field(b.d, `${p}UnitNumber`)?.value).toBe('12B');
      expect(field(b.d, `${p}ZipCode`)?.value).toBe('10017');
      expect(field(b.d, sale ? 'salePrice' : 'rentalMonthlyRent')?.value).toBe('1250000');
      expect(field(b.d, sale ? 'saleBedrooms' : 'rentalBedrooms')?.value).toBe('2');
      expect(field(b.d, sale ? 'saleFullBaths' : 'rentalFullBathrooms')?.value).toBe('1');
      expect(field(b.d, sale ? 'saleHalfBaths' : 'rentalHalfBathrooms')?.value).toBe('1');
      expect(field(b.d, sale ? 'saleUnitSqFt' : 'rentalSqFt')?.value).toBe('1050');
      expect(field(b.d, `${p}Description`)?.value).toBe('Sunny corner unit'); // a synced listing keeps its remarks in the features bucket
      expect(field(b.d, `${p}CommonInterest`)?.value).toBe('Condominium');
      // contact panel: typed columns, nothing defaulted
      expect(b.d.getElementById(`${p}ListingAgentId`)?.textContent).toBe('39361');
      expect(b.d.getElementById(`${p}ListingAgentPhone`)?.textContent).toBe('212-555-0101');
      expect(b.d.getElementById(`${p}ListingAgentEmail`)?.textContent).toBe('lena@example.test');
      expect(field(b.d, `${p}ListingCompanySearch`)?.value).toBe('Example Realty');
      // the tiles
      expect(b.d.getElementById(`${p}DaysOnMarket`)?.textContent).toBe('12');
      expect(b.d.getElementById(`${p}CumulativeDaysOnMarket`)?.textContent).toBe('40');
      if (sale) {
        expect(field(b.d, 'saleRETaxes')?.value).toBe('9600');
        expect(field(b.d, 'saleMaintCC')?.value).toBe('1450');
        expect(field(b.d, 'saleMaintCCFreq')?.value).toBe('Monthly');
        expect(field(b.d, 'saleBldgYearBuilt')?.value).toBe('1962');
        expect(field(b.d, 'saleBldgTotalFloors')?.value).toBe('24');
        expect(field(b.d, 'saleBldgTotalUnits')?.value).toBe('150');
        const classification = b.d.querySelector('input[name="salePropertyType"]:checked') as HTMLInputElement | null;
        expect(classification?.value).toBe('Condo');
      }
    } finally {
      b.close();
    }
  });

  it('fills the area and the unit facts from the typed columns alone (no address bucket, no provider keys)', async () => {
    const typedOnly = {
      id: '78', listing_id: 'L78', status: 'Active', list_price: '900000', bedrooms_total: 0, bathrooms_full: 1, bathrooms_half: 0, living_area: '450',
      borough: 'Brooklyn', neighborhood: 'DUMBO', city: 'Brooklyn', postal_code: '11201', address: {}, features: {}, agent_info: {}, media: [], raw_data: {},
    };
    const b = bootViewer(file, { listing: typedOnly });
    try {
      await until(() => rendered(b.d));
      expect([...new Set(b.errors)]).toEqual([]);
      expect(field(b.d, `${p}ZipCode`)?.value).toBe('11201');
      expect(field(b.d, `${p}Borough`)?.value).toBe('Brooklyn');
      expect(field(b.d, sale ? 'saleBldgNeighborhood' : 'rentalNeighborhood')?.value).toBe('DUMBO');
      expect(field(b.d, sale ? 'saleBedrooms' : 'rentalBedrooms')?.value).toBe('0'); // a studio
      expect(field(b.d, sale ? 'saleFullBaths' : 'rentalFullBathrooms')?.value).toBe('1');
      expect(field(b.d, sale ? 'saleUnitSqFt' : 'rentalSqFt')?.value).toBe('450');
      if (sale) expect([...(b.d.getElementById('viewerStoredElsewhere')?.querySelectorAll('p') ?? [])].map((x) => x.textContent)).toContain('City: Brooklyn');
      else expect(field(b.d, 'rentalCity')?.value).toBe('Brooklyn');
    } finally {
      b.close();
    }
  });

  it('lists what has no control on the viewer in one "Other stored fields" card, not what is shown elsewhere, and is safe to run twice', async () => {
    const listing = {
      ...SYNCED,
      raw_data: { ...SYNCED.raw_data, ...(sale ? { saleBuyerAgentPays: 'BuyerPays', saleStructureType: 'HighRise', saleAlsoAvailableForRent: true } : { FirstShowingDate: '2026-03-10' }) },
    };
    const b = bootViewer(file, { listing });
    try {
      await until(() => rendered(b.d));
      const lines = () => [...(b.d.getElementById('viewerStoredElsewhere')?.querySelectorAll('p') ?? [])].map((p) => p.textContent);
      if (sale) {
        expect(lines()).toEqual(expect.arrayContaining(['saleBuyerAgentPays: BuyerPays', 'saleStructureType: HighRise', 'saleAlsoAvailableForRent: true', 'City: New York', 'StateOrProvince: NY']));
      } else {
        expect(lines()).toEqual(['FirstShowingDate: 2026-03-10']); // the Rental viewer has no control for it
      }
      // the street atoms and the agent identity are shown elsewhere, so they are not repeated here
      expect(lines().filter((l) => /^(StreetNumber|StreetName|StreetSuffix|StreetDirPrefix|ListAgent)/.test(String(l)))).toEqual([]);
      // running the hydration again (the page does, after its own field rules) changes nothing and adds nothing
      const snapshot = () => ({ extras: b.d.querySelectorAll('.viewer-extra-value').length, cards: b.d.querySelectorAll('#viewerStoredElsewhere').length, lines: lines(), price: field(b.d, sale ? 'salePrice' : 'rentalMonthlyRent')?.value });
      const before = snapshot();
      expect(before.cards).toBe(1);
      b.w.MallanViewerHydration.hydrate(sale ? 'sale' : 'rental', JSON.parse(JSON.stringify(listing)));
      b.w.MallanViewerHydration.hydrate(sale ? 'sale' : 'rental', JSON.parse(JSON.stringify(listing)));
      expect(snapshot()).toEqual(before);
    } finally {
      b.close();
    }
  });

  it('shows a provider value no option offers as text, instead of dropping it', async () => {
    const b = bootViewer(file, { listing: SYNCED });
    try {
      await until(() => rendered(b.d));
      const extras = [...b.d.querySelectorAll('.viewer-extra-value')].map((e) => e.textContent);
      // ListingAgreement "Open" is a live Cotality member this page has no radio for; PetsAllowed "Yes"/"CatsOk" are live members the page's
      // own checkboxes (UnitYes, UnitCatsOK, ...) do not use.
      expect(extras.some((t) => /ListingAgreement \(stored\): Open/.test(String(t)))).toBe(true);
      expect(extras.some((t) => /PetsAllowed \(stored\): Yes, CatsOk/.test(String(t)))).toBe(true);
      // and nothing is shown for a group the record says nothing about
      expect(extras.some((t) => /AttendanceType/.test(String(t)))).toBe(false);
    } finally {
      b.close();
    }
  });
});

// ── 4. Co-listing agents and offices: read-only, apart from the primary ──────────────────────────────────────────────────────────────
describe.each(['SALE-FORM-WITH-TOOLS', 'RENTAL-FORM-WITH-TOOLS'] as ViewerFile[])('%s: co-listing', (file) => {
  const sale = file.startsWith('SALE');
  const container = sale ? 'saleCoListAgentsContainer' : 'rentalCoListAgents';
  it('lists the co-listing agents and offices, with the office relation from MLS ids only, and offers no way to add one', async () => {
    const b = bootViewer(file, { listing: SYNCED });
    try {
      await until(() => rendered(b.d));
      const box = b.d.getElementById(container) as HTMLElement;
      const lines = [...box.querySelectorAll('p')].map((p) => p.textContent);
      expect(lines).toEqual([
        'Co-listing agent 1: Dara Dixon (MLS ID 70707)',
        'Co-listing agent 2: Paeder Alexander Varnam (MLS ID 97052)',
        'Co-listing office 1: Corcoran Group (MLS ID 334, different office)',
        'Co-listing office 2: Example Realty (MLS ID 7041, same office)',
      ]);
      // the primary listing agent is not among them
      expect(box.textContent).not.toContain('Lena Lister');
      const add = [...b.d.querySelectorAll(`[onclick*="add${sale ? 'Sale' : 'Rental'}CoListAgent"]`)];
      expect(add.length).toBeGreaterThan(0);
      expect(add.filter((e) => !e.classList.contains('viewer-hidden'))).toEqual([]);
    } finally {
      b.close();
    }
  });

  it('says so when there is no co-listing agent, and never invents one', async () => {
    const b = bootViewer(file, { listing: { ...SYNCED, co_list_agent_mls_id: null, co_list_office_mls_id: null, raw_data: { CommonInterest: 'Condominium' } } });
    try {
      await until(() => rendered(b.d));
      expect((b.d.getElementById(container) as HTMLElement).textContent).toBe('No co-listing agents on this listing.');
    } finally {
      b.close();
    }
  });

  it('reads the typed co-list columns when the record keeps no provider keys', async () => {
    const b = bootViewer(file, { listing: { ...SYNCED, raw_data: {} } });
    try {
      await until(() => rendered(b.d));
      const lines = [...(b.d.getElementById(container) as HTMLElement).querySelectorAll('p')].map((p) => p.textContent);
      expect(lines).toEqual(['Co-listing agent 1: Unnamed (MLS ID 70707)', 'Co-listing office 1: Unnamed (MLS ID 334, different office)']);
    } finally {
      b.close();
    }
  });

  it('classifies an office as unknown when either MLS id is missing', async () => {
    const b = bootViewer(file, {
      listing: { ...SYNCED, list_office_mls_id: null, co_list_agent_mls_id: null, co_list_office_mls_id: null, raw_data: { CoListOfficeName: 'Some Office', CoListOffice2MlsId: '99' } },
    });
    try {
      await until(() => rendered(b.d));
      const lines = [...(b.d.getElementById(container) as HTMLElement).querySelectorAll('p')].map((p) => p.textContent);
      expect(lines).toEqual(['Co-listing office 1: Some Office (unknown)', 'Co-listing office 2: Unnamed (MLS ID 99, unknown)']);
    } finally {
      b.close();
    }
  });
});

// ── 5. The REAL Add form, filled in, saved through the real normalizer, opened in the viewer ──────────────────────────────────────────
const FORM_ZONES: Record<'sale' | 'rental', string[]> = {
  sale: ['saleMainTab1', 'saleMainTab2', 'saleMainTab3', 'saleMainTab4', 'saleBuildingModal'],
  rental: ['rentalMainTab1', 'rentalMainTab2', 'rentalMainTab3', 'rentalMainTab4', 'rentalBuildingModal'],
};

type Expectation =
  | { key: string; kind: 'value'; expected: string }
  | { key: string; kind: 'radio'; expected: string }
  | { key: string; kind: 'check'; expected: true }
  | { key: string; kind: 'group'; expected: string[] };

async function bootForm(form: 'SALE-FORM-REDESIGN' | 'RENTAL-FORM-REDESIGN'): Promise<{ w: any; d: Document; close: () => void }> {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${form}.html`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w: any) {
      w.tailwind = { config: {} };
      w.alert = () => undefined; w.confirm = () => true; w.scrollTo = () => undefined; w.print = () => undefined;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      const context = { authenticated: true, role: 'agent', portalRole: 'agent' };
      w.MallanAPI = {
        onReady: (cb: () => void) => setTimeout(cb, 5), getContext: () => context,
        init: () => Promise.resolve({ authenticated: true, user: { id: 'AG-9', mlsId: '39361', name: 'Sender Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } }),
        listings: { get: async () => ({}), update: async () => ({}), updateStatus: async () => ({}) },
        idx: { search: async () => ({ results: [] }) }, _fetch: async () => ({}),
      };
      for (const file of ['directory-picker', 'colist-section']) w.eval(readFileSync(resolve(__dirname, `../../public/crm/js/forms/${file}.js`), 'utf8'));
    },
  });
  await sleep(1200);
  return { w: dom.window, d: dom.window.document, close: () => dom.window.close() };
}

// Fill every writable control in the listing tabs and the building modal with a distinctive value and remember what was entered. A text
// control that feeds a numeric provider field gets a number (the forms parse those with parseInt / parseFloat, so a word would be zeroed).
function fillForm(d: Document, zones: string[], numeric: Set<string>): Expectation[] {
  const out: Expectation[] = [];
  const radios = new Set<string>();
  const groups = new Map<string, string[]>();
  let n = 0;
  for (const zoneId of zones) {
    const zone = d.getElementById(zoneId);
    if (!zone) continue;
    zone.querySelectorAll('input, select, textarea').forEach((el: any) => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'button', 'submit', 'reset', 'file', 'image'].includes(type) || el.disabled || el.readOnly) return;
      const key = el.id || el.name;
      if (!key) return;
      n += 1;
      if (el.tagName === 'SELECT') {
        const options = [...el.options].filter((o: any) => o.value !== '');
        if (!options.length) return;
        const choice = options[options.length - 1].value;
        el.value = choice;
        out.push({ key, kind: 'value', expected: choice });
      } else if (type === 'radio') {
        if (radios.has(el.name)) return;
        radios.add(el.name);
        const group = [...d.querySelectorAll(`input[type="radio"][name="${el.name}"]`)] as HTMLInputElement[];
        // The listing type picks the distribution gates (Owner Opt-Out and Participant Only switch them off), so it takes the first option;
        // every other group takes its last, which is never the form's default.
        const pick = /ListingType$/.test(el.name) ? group[0] : group[group.length - 1];
        group.forEach((r) => { r.checked = r === pick; });
        // the collector keys a radio by its id when it has one, by its name otherwise
        out.push({ key: pick.id || pick.name, kind: 'radio', expected: pick.value });
      } else if (type === 'checkbox') {
        el.checked = true;
        if (el.id) out.push({ key, kind: 'check', expected: true });
        else groups.set(el.name, [...(groups.get(el.name) ?? []), el.value]);
      } else {
        const v = type === 'number' || numeric.has(key) ? String(100 + n) : type === 'date' ? '2026-03-15' : type === 'datetime-local' ? '2026-03-15T10:30' : type === 'time' ? '10:30'
          : type === 'email' ? `a${n}@example.test` : type === 'url' ? `https://example.test/${n}` : type === 'tel' ? '212-555-0100' : `T${n}`;
        el.value = v;
        if (el.value === v) out.push({ key, kind: 'value', expected: v });
      }
    });
  }
  groups.forEach((values, key) => out.push({ key, kind: 'group', expected: [...values].sort() }));
  return out;
}

// What the real create route stores for a form payload (normalizer -> persistence record -> row), as the real GET returns it.
function storedListing(payload: Record<string, unknown>, listingType: 'sale' | 'rent') {
  const { normalized } = normalizePayload(payload);
  const rec = buildPersistenceRecord(normalized);
  const top = { ...(rec.topLevel as Record<string, unknown>) };
  for (const k of ['list_price', 'living_area']) if (top[k] !== undefined && top[k] !== null) top[k] = String(top[k]);
  return {
    id: '1', listing_id: listingType === 'sale' ? 'SL-0001' : 'RL-0001', status: 'Draft', listing_type: listingType,
    ...top, ...typedAgentColumnsFromJson(rec.agentInfo),
    address: rec.address, features: rec.features, raw_data: rec.raw_data, agent_info: {}, media: [],
    created_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-02T00:00:00.000Z',
  };
}

// What the viewer shows for one entered control (null: the viewer has no such control).
function shown(d: Document, e: Expectation): string | string[] | boolean | null {
  if (e.kind === 'value') {
    const el = d.getElementById(e.key) ?? (d.getElementsByName(e.key)[0] as HTMLElement | undefined);
    if (!el) return null;
    const v = (el as HTMLInputElement).value;
    // a datetime-local entry on the form is a date control on the viewer
    return (el as HTMLInputElement).type === 'date' && e.expected.includes('T') ? `${v}T${e.expected.split('T')[1]}` : v;
  }
  if (e.kind === 'check') {
    const el = d.getElementById(e.key) as HTMLInputElement | null;
    if (el) return el.checked && !el.indeterminate;
    // the distribution flags are shown as badges that say which flag they stand for and the state they show
    const badge = d.querySelector(`[data-for="${e.key}"]`);
    return badge ? badge.getAttribute('data-state') === 'yes' : null;
  }
  if (e.kind === 'group') {
    const boxes = [...d.querySelectorAll(`input[type="checkbox"][name="${e.key}"]`)] as HTMLInputElement[];
    return boxes.length ? boxes.filter((c) => c.checked).map((c) => c.value).sort() : null;
  }
  const byId = d.getElementById(e.key) as HTMLInputElement | null;
  const set = byId ? (byId.name ? ([...d.querySelectorAll(`input[type="radio"][name="${byId.name}"]`)] as HTMLInputElement[]) : [byId]) : ([...d.getElementsByName(e.key)] as HTMLInputElement[]);
  if (!set.length) return null;
  const checked = set.find((r) => r.checked);
  return checked ? checked.value : '';
}

// The viewer shows these from the record (the stored status, the system timestamps, the listing agent and office), not from a control's
// saved entry, so an entry in the form's control does not have to come back.
const VIEWER_OWNED = /^(sale|rental)(Status|CreateDate|LastUpdatedDate|ListingAgentSearch|ListingCompanySearch)$/;

// Entries the form's own save does NOT keep (or keeps under a key nothing can invert), each with the reason. Every line is a save-side gap in
// the Add / Edit form, not a viewer gap: shrinking these tables is the Add / Edit data-integrity work, and a line that starts passing fails
// the test until it is removed.
// Entered on the Add form, with no control of the same key on the viewer (the same Add-form-only controls as above, plus the Rental city display).
const ABSENT_ON_VIEWER: Record<'sale' | 'rental', string[]> = {
  sale: [
    'value:salePostalCity', 'value:saleTaxMonthly', 'check:saleAlsoAvailableForRent', 'check:saleAuctionYn', 'value:saleAuctionType', 'value:saleAuctionStartDate',
    'value:saleAuctionEndDate', 'value:saleAuctionTermsUrl', 'value:saleStructureType', 'check:saleSendToRls', 'check:saleSendToWebsite', 'value:saleExclusiveCommissionType',
    'radio:saleBuyerAgentPays',
  ],
  rental: ['value:rentalPostalCity', 'value:rentalStructureType', 'value:rentalFirstShowingDate', 'value:rentalCityDisplay'],
};

const RENTAL_ARRAYS_NOT_SAVED =
  'collectRentalFormData derives an array only for PetsAllowed, BuildingPetsAllowed, BuildingFeatures, AttendanceType and BuildingLaundryFeatures; every other ' +
  'checkbox group is saved as one boolean under its name (the last box), so the values the agent chose are not stored';
const KNOWN_LOST: Record<'sale' | 'rental', Record<string, string>> = {
  sale: {},
  rental: {
    rentalFurnished: 'the Add form has two controls with this key (a Yes/No radio group and the Furnished select); the save keeps one value per key, so the radio entry is overwritten',
    bldgNewDevelopment: 'collectRentalFormData derives NewDevelopmentYN (and YearBuilt) before it sweeps the building modal, so the checkbox never reaches the provider field',
    rentalCommSubtype: RENTAL_ARRAYS_NOT_SAVED,
    rentalBusinessType: RENTAL_ARRAYS_NOT_SAVED,
    rentalHeating: RENTAL_ARRAYS_NOT_SAVED,
    rentalCooling: RENTAL_ARRAYS_NOT_SAVED,
    rentalTHDocsAvailable: RENTAL_ARRAYS_NOT_SAVED,
    bldgHeating: RENTAL_ARRAYS_NOT_SAVED,
    bldgCooling: RENTAL_ARRAYS_NOT_SAVED,
    bldgDocsAvailable: RENTAL_ARRAYS_NOT_SAVED,
  },
};

describe.each([
  ['SALE-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS', 'sale', 'sale'],
  ['RENTAL-FORM-REDESIGN', 'RENTAL-FORM-WITH-TOOLS', 'rental', 'rent'],
] as const)('%s filled in, saved, opened in %s', (form, viewer, kind, listingType) => {
  it('shows every control the agent entered', async () => {
    const f = await bootForm(form);
    let expectations: Expectation[] = [];
    let payload: Record<string, unknown> = {};
    try {
      const numeric = new Set<string>(TABLES[kind].FIELD_MAP.filter((r: any) => r.type === 'number').map((r: any) => r.form));
      expectations = fillForm(f.d, FORM_ZONES[kind], numeric).filter((e) => !VIEWER_OWNED.test(e.key));
      payload = kind === 'sale' ? f.w.collectSaleFormData() : f.w.collectRentalFormData();
    } finally {
      f.close();
    }
    expect(expectations.length).toBeGreaterThan(150);
    const b = bootViewer(viewer, { listing: storedListing(payload, listingType) });
    try {
      await until(() => rendered(b.d), 15000);
      expect([...new Set(b.errors)]).toEqual([]);
      const lost: Record<string, string> = {};
      const absent: string[] = [];
      for (const e of expectations) {
        const got = shown(b.d, e);
        if (got === null) { absent.push(`${e.kind}:${e.key}`); continue; }
        if (JSON.stringify(got) !== JSON.stringify(e.expected)) lost[e.key] = `entered ${JSON.stringify(e.expected)}, viewer shows ${JSON.stringify(got)}`;
      }
      // Controls the viewer has no counterpart for are exactly the documented ones (Add-form-only controls: see SALE_NOT_ON_VIEWER above), and
      // every control it does have shows what was entered, except the documented save-side gaps.
      expect(absent.sort()).toEqual([...ABSENT_ON_VIEWER[kind]].sort());
      expect(Object.keys(lost).sort()).toEqual(Object.keys(KNOWN_LOST[kind]).sort());
    } finally {
      b.close();
    }
  });
});
