/// <reference types="jest" />
/**
 * The Tools viewers (SALE-FORM-WITH-TOOLS.html, RENTAL-FORM-WITH-TOOLS.html) are agent BACKEND viewers: they show a stored listing in full and let the agent print it, e-mail it,
 * or hand out an agent sheet. Whatever the listing stores (any agent can write a listing's raw_data; MLS-fed text is stored too) reaches those documents, so a stored value is
 * never markup, and a value the record does not carry is never made up.
 *
 * Marker values: every stored text carries <img src=x onerror="window.__pwned_<name>=1">. The documents the page builds are parsed, and must hold the marker as TEXT: no element
 * from it, no event-handler attribute, no script of the stored text's making.
 */
import { bootViewer, rendered, sleep, until, type Booted } from './tools-viewer-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const H = (name: string) => `<img src=x onerror="window.__pwned_${name}=1">`;
const BREAKOUT = 'https://example.test/a.jpg" onerror="window.__pwned_photo=1';
const URL_WITH_ENTITY = 'https://example.test/b.jpg?w=1&amp;h=2';             // a stored address that holds an entity: the page must show it as stored, not decode it

const parse = (f: Booted, html: string) => new f.w.DOMParser().parseFromString(html, 'text/html') as Document;
const handlerAttributes = (doc: Document) => [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${el.tagName.toLowerCase()}[${a.name}]`));
const pwned = (f: Booted) => Object.keys(f.w).filter((k) => k.startsWith('__pwned_'));

async function open(file: 'SALE-FORM-WITH-TOOLS' | 'RENTAL-FORM-WITH-TOOLS', listing: Record<string, unknown>): Promise<Booted> {
  const f = bootViewer(file, { listing });
  await until(() => rendered(f.d), 15000);
  await sleep(400);                                  // the page fills its preview 200 ms after it renders
  return f;
}

// ── Sale ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SALE_HOSTILE = {
  id: '404', listing_id: 'SL-0404', status: 'Active', list_price: '1250000', bedrooms_total: 2, bathrooms_full: 1, living_area: '1234',
  postal_code: '10017', borough: 'Manhattan', property_type: 'Residential',
  address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: H('street'), StreetSuffix: 'St', UnitNumber: H('unit'), City: 'New York', StateOrProvince: 'NY', PostalCode: '10017' },
  features: { PublicRemarks: H('desc') },
  raw_data: { PublicRemarks: H('desc'), SubdivisionName: H('hood'), BuildingName: H('bldg'), EntryLevel: H('floor'), saleWebHeadline: H('headline'), saleBorough: H('borough') },
  list_agent_full_name: H('agent'), list_agent_direct_phone: H('phone'), list_agent_email: H('email'), list_office_name: H('office'),
  media: [{ url: URL_WITH_ENTITY }, { url: BREAKOUT }],
  updated_at: '2026-03-02T00:00:00.000Z',
};
const SALE_SECTIONS = ['agentInfo', 'classification', 'address', 'pricing', 'rooms', 'features', 'utilities', 'building', 'amenities', 'policies', 'distribution', 'description', 'photos'];

describe('SALE-FORM-WITH-TOOLS: a stored value is text in everything the page writes', () => {
  let f: Booted;
  beforeAll(async () => { f = await open('SALE-FORM-WITH-TOOLS', SALE_HOSTILE); });
  afterAll(() => f.close());

  it('boots on the stored listing without a page error', () => {
    expect(f.errors).toEqual([]);
    expect((f.d.getElementById('saleDescription') as HTMLTextAreaElement).value).toBe(H('desc'));
  });

  it('the print document holds every stored text as text (all sections, branding on)', () => {
    const data = f.w.collectSalePrintData();
    const html: string = f.w.buildSalePrintHTML(data, SALE_SECTIONS, { branding: true, landscape: false, preset: 'full' });
    const doc = parse(f, html);
    expect(handlerAttributes(doc)).toEqual([]);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelector('img[src="x"]')).toBeNull();                       // no <img> from stored text
    const text = doc.body.textContent ?? '';
    for (const name of ['desc', 'headline', 'bldg', 'floor', 'unit', 'street', 'office']) expect(text).toContain(H(name));
    const photos = [...doc.querySelectorAll('img')];
    expect(photos).toHaveLength(2);
    expect(photos[0].getAttribute('src')).toBe(URL_WITH_ENTITY);                // an address is shown as stored
    expect(photos[1].getAttribute('src')).toContain('%22');                     // a quote breakout stays inside the attribute
    expect(text).toContain('Listing last updated:');                            // beside the time the report is built, the time the record says
    expect(pwned(f)).toEqual([]);
  });

  it('the builders write every field they are given as text, whatever its source (a number control or a radio cannot carry markup, but the builders do not rely on that)', () => {
    const real = f.w.collectSalePrintData();
    const data: Record<string, string> = Object.fromEntries(Object.keys(real).map((k) => [k, H(`d_${k}`)]));
    Object.assign(data, { price: '1250000', maintCC: '1500', reTaxes: '900' });   // a price goes through parseFloat: a marker would print NaN
    const documents: [string, string][] = [
      ['print', f.w.buildSalePrintHTML(data, SALE_SECTIONS, { branding: true, landscape: false, preset: 'full' })],
      ['card', f.w.buildSaleEmailCardHTML(data)],
      ['inline', f.w.buildSaleEmailInlineHTML(data)],
    ];
    for (const [name, html] of documents) {
      const doc = parse(f, html);
      expect([name, handlerAttributes(doc)]).toEqual([name, []]);
      expect([name, doc.querySelectorAll('script').length]).toEqual([name, 0]);
      expect([name, doc.querySelector('img[src="x"]')]).toEqual([name, null]);
      const text = doc.body.textContent ?? '';
      expect([name, doc.querySelector('img')?.getAttribute('src')]).toEqual([name, URL_WITH_ENTITY]);   // the first photo, as stored (a stored entity is not decoded)
      for (const key of ['bedrooms', 'fullBaths', 'livingArea']) expect([name, key, text.includes(H(`d_${key}`))]).toEqual([name, key, true]);
      expect([name, text.includes(H('d_propertyType'))]).toEqual([name, true]);
      expect([name, text.includes(H('d_updatingAgent'))]).toEqual([name, true]);
    }
  });

  it('the e-mail card, in the page and as built, holds every stored text as text', () => {
    f.w.openSaleEmailModal();
    const preview = f.d.getElementById('saleEmailCardPreview') as HTMLElement;
    expect(preview.querySelector('img[src="x"]')).toBeNull();
    expect([...preview.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)))).toHaveLength(0);
    expect(preview.textContent).toContain(H('desc'));
    expect(preview.textContent).toContain(H('unit'));
    const data = f.w.collectSalePrintData();
    for (const html of [f.w.buildSaleEmailCardHTML(data), f.w.buildSaleEmailInlineHTML(data)] as string[]) {
      const doc = parse(f, html);
      expect(handlerAttributes(doc)).toEqual([]);
      expect(doc.querySelector('img[src="x"]')).toBeNull();
      expect(doc.body.textContent).toContain(H('desc'));
    }
    expect(pwned(f)).toEqual([]);
  });

  it('the clipboard e-mail shows the typed message as text', () => {
    (f.d.getElementById('saleEmailMessage') as HTMLTextAreaElement).value = `Hello ${H('message')}\nSecond line`;
    const html: string = f.w.buildSaleEmailInlineHTML(f.w.collectSalePrintData());
    const doc = parse(f, html);
    expect(handlerAttributes(doc)).toEqual([]);
    expect(doc.body.textContent).toContain(H('message'));
    expect(html).toContain('Hello &#60;img');
    expect(html).toContain('<br>Second line');                                  // a line break is still a line break
  });

  it('the agent info sheet (written into a window of this origin) holds the stored agent and address as text', () => {
    let written = '';
    f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
    for (const id of ['saleUpdatingAgentName', 'saleUpdatingAgentPhone', 'saleUpdatingAgentEmail', 'saleUpdatingAgentLicense']) (f.d.getElementById(id) as HTMLInputElement).value = H(id);
    f.w.generateAgentInfoSheet();
    const doc = parse(f, written);
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    expect([...doc.querySelectorAll('script')].map((s) => s.textContent).filter((t) => /pwned/.test(t ?? ''))).toEqual([]);
    expect(handlerAttributes(doc).sort()).toEqual(['button[onclick]', 'button[onclick]']);   // the sheet's own Print and Email buttons, nothing else
    expect(doc.body.textContent).toContain(H('saleUpdatingAgentName'));
    expect(doc.body.textContent).toContain(H('unit'));
    expect(pwned(f)).toEqual([]);
  });

  it('the agent info sheet shows the listing\'s baths and square feet (it read controls that do not exist)', async () => {
    const g = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', list_price: '900000', bedrooms_total: 2, bathrooms_full: 2, living_area: '1000', raw_data: {} });
    try {
      let written = '';
      g.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
      g.w.generateAgentInfoSheet();
      const text = parse(g, written).body.textContent ?? '';
      expect(text).toContain('2 BD | 2 BA | 1000 SF');
    } finally { g.close(); }
  });

  it('a toast shows its message as text, whichever helper shows it', () => {
    f.w.showToast(H('toast'), 'success');
    f.w.showFormToast(H('formtoast'), 'success');
    f.w.alert(H('alert'));
    const toasts = [...f.d.querySelectorAll('body > div')].filter((t) => /pwned_(toast|formtoast|alert)/.test(t.textContent ?? ''));
    expect(toasts.length).toBeGreaterThanOrEqual(3);
    for (const t of toasts) expect(t.querySelector('img')).toBeNull();
    expect(pwned(f)).toEqual([]);
  });

  it('a building row (the list is empty today, but nothing may make it markup) is written with DOM calls', () => {
    f.w.buildingDatabase.push({ address: `1 ${H('row')} Ave`, name: H('rowname'), neighborhood: H('rowhood'), borough: 'Manhattan', model: H('rowmodel') });
    f.w.searchBuildingByAddress('ave', 'sale');
    const results = f.d.getElementById('saleBldgSearchResults') as HTMLElement;
    expect(results.querySelector('img')).toBeNull();
    expect(results.querySelectorAll('[onclick]')).toHaveLength(0);
    expect(results.textContent).toContain(H('row'));
    f.w.buildingDatabase.length = 0;
  });
});

describe('SALE-FORM-WITH-TOOLS: nothing is made up', () => {
  it('a listing that carries almost nothing prints and e-mails almost nothing', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: '', raw_data: {} });
    try {
      const data = f.w.collectSalePrintData();
      for (const key of ['status', 'listingType', 'buildingStatus', 'city', 'state', 'idxDisplay', 'internetDisplay', 'syndication', 'ownerOptOut']) expect([key, data[key]]).toEqual([key, '']);
      const print: string = f.w.buildSalePrintHTML(data, SALE_SECTIONS, { branding: false, landscape: false, preset: 'full' });
      for (const made of ['Draft', 'Exclusive', 'Resale', 'IDX Display', 'Syndication', 'See building modal', 'New York']) expect([made, parse(f, print).body.textContent?.includes(made)]).toEqual([made, false]);
      for (const html of [f.w.buildSaleEmailCardHTML(data), f.w.buildSaleEmailInlineHTML(data)] as string[]) {
        const doc = parse(f, html);
        const text = doc.body.textContent ?? '';
        for (const made of ['$0', 'Address', 'New York, NY']) expect([made, text.includes(made)]).toEqual([made, false]);
        expect(doc.querySelector('p[style*="font-size:24px"]')).toBeNull();      // no empty price line either
      }
      expect(f.w.getSalePlainTextSummary(data)).not.toMatch(/\bNY\b/);
    } finally { f.close(); }
  });

  it('the city and state are the record\'s, in the print and in the plain text', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', address: { StreetNumber: '5', StreetName: 'Main', StreetSuffix: 'St', City: 'Hoboken', StateOrProvince: 'NJ', PostalCode: '07030' }, raw_data: {} });
    try {
      const data = f.w.collectSalePrintData();
      expect([data.city, data.state]).toEqual(['Hoboken', 'NJ']);
      const text = parse(f, f.w.buildSalePrintHTML(data, SALE_SECTIONS, { branding: false, landscape: false, preset: 'client' })).body.textContent ?? '';
      expect(text).toContain('NJ');
      expect(text).not.toMatch(/\bNY\b/);
      expect(f.w.getSalePlainTextSummary(data)).toContain('NJ');
    } finally { f.close(); }
  });

  it('the distribution flags are what the record says: yes, no, or left out when it does not carry them', async () => {
    const yes = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', idx_display_yn: true, raw_data: { saleDist_VOW: true, SyndicateYN: true, saleListingType: 'ExclusiveRightToSell' } });
    const no = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', idx_display_yn: false, raw_data: { saleDist_VOW: false, SyndicateYN: false, saleListingType: 'OwnerOptOut' } });
    try {
      const a = yes.w.collectSalePrintData();
      expect([a.idxDisplay, a.internetDisplay, a.syndication, a.ownerOptOut]).toEqual(['Yes', 'Yes', 'Yes', 'No']);
      const b = no.w.collectSalePrintData();
      expect([b.idxDisplay, b.internetDisplay, b.syndication, b.ownerOptOut]).toEqual(['No', 'No', 'No', 'Yes']);
    } finally { yes.close(); no.close(); }
  });

  it('the amenities the record ticks are printed, and the sentence that points at a modal is not', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', raw_data: { BuildingFeatures: ['Elevator'] } });
    try {
      const data = f.w.collectSalePrintData();
      expect(data.amenities).toMatch(/Elevator/i);
      const text = parse(f, f.w.buildSalePrintHTML(data, ['amenities', 'policies'], { branding: false, landscape: false, preset: 'custom' })).body.textContent ?? '';
      expect(text).toMatch(/Elevator/i);
      expect(text).not.toContain('Policies');                                   // nothing is stored for it, so no empty box
    } finally { f.close(); }
  });

  it('the square feet and the neighborhood the record stores reach the print and the e-mail (they were read from controls the viewer never fills)', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', list_price: '900000', living_area: '1234', raw_data: { SubdivisionName: 'Turtle Bay' } });
    try {
      const data = f.w.collectSalePrintData();
      expect(data.livingArea).toBe('1234');
      expect(data.neighborhood).toBe('Turtle Bay');
      const card = parse(f, f.w.buildSaleEmailCardHTML(data)).body.textContent ?? '';
      expect(card).toContain('1234 SF');
      expect(card).toContain('Turtle Bay');
    } finally { f.close(); }
  });

  it('nothing meant for the agent is written into the buyer\'s mail body', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', list_price: '900000', raw_data: {} });
    try {
      let opened = '';
      f.w.open = (url: string) => { opened = url; return null; };
      Object.defineProperty(f.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
      f.w.ClipboardItem = class { constructor(public items: unknown) {} };
      (f.d.getElementById('saleEmailTo') as HTMLInputElement).value = 'buyer@example.test';
      f.w.openSaleInEmailClient();
      await sleep(50);                                                           // the clipboard answers, and the page says so, while the page is still open
      const body = decodeURIComponent(opened.split('&body=')[1] ?? '');
      expect(body).toContain('$900,000');
      expect(body).not.toMatch(/clipboard|paste/i);
    } finally { f.close(); }
  });
});

describe('SALE-FORM-WITH-TOOLS: the viewer shows what the record carries', () => {
  it('hides the form\'s placeholders and the Calculate button that writes zeros', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', raw_data: {} });
    try {
      const style = [...f.d.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      expect(style).toContain('body.viewer-mode .field-input::placeholder { color: transparent; }');
      const calc = f.d.querySelector('[onclick*="calculateSaleTHFinancials"]') as HTMLElement | null;
      expect(calc).not.toBeNull();
      expect(calc!.classList.contains('viewer-hidden')).toBe(true);
    } finally { f.close(); }
  });

  it('the preview reads the controls the record fills: the listing URL, the square feet, the public page\'s location, a Coop, and unknown flags stay unknown', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', {
      id: '9', listing_id: 'SL-0009', status: 'Active', list_price: '900000', living_area: '1000', borough: 'Manhattan',
      address: { StreetNumber: '5', StreetName: 'Main', StreetSuffix: 'St', StateOrProvince: 'NY', PostalCode: '10017' },
      raw_data: { SubdivisionName: 'Turtle Bay', salePropertyType: 'Coop', saleListingUrl: 'https://mallan.nyc/listing/x' },
    });
    try {
      f.w.updateSalePreview();
      const text = (id: string) => f.d.getElementById(id)?.textContent ?? '';
      expect(text('salePreviewURL')).toBe('https://mallan.nyc/listing/x');
      expect(text('salePreviewSqFt')).toBe('1,000 SF');
      expect(text('salePreviewSiteNeighborhood')).toContain('Turtle Bay');
      expect(text('salePreviewSiteNeighborhood')).toContain('NY 10017');
      expect(text('salePreviewSiteNeighborhood')).not.toContain('--');
      expect((f.d.getElementById('salePreviewBldgCard') as HTMLElement).style.display).toBe('');   // a Coop is a managed unit
      expect(text('salePreviewSiteCoopTitle')).toBe('Co-op Information');
      expect(text('salePreviewBldgElevator')).toBe('--');                                          // the record does not carry it: not "No"
    } finally { f.close(); }
  });

  it('the townhouse card says yes, no, or "--" for land lease and garage, never a "No" the record did not give', async () => {
    const known = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', raw_data: { salePropertyType: 'SingleFamilyTownhouse', saleTHLandLeaseYN: 'No', saleTHGarageYN: 'Yes', saleTHGarageSpaces: '2' } });
    const unknown = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', raw_data: { salePropertyType: 'SingleFamilyTownhouse' } });
    try {
      known.w.updateSalePreview();
      unknown.w.updateSalePreview();
      expect([known.d.getElementById('salePreviewTHLandLease')?.textContent, known.d.getElementById('salePreviewTHGarage')?.textContent]).toEqual(['No', '2 spaces']);
      expect([unknown.d.getElementById('salePreviewTHLandLease')?.textContent, unknown.d.getElementById('salePreviewTHGarage')?.textContent]).toEqual(['--', '--']);
    } finally { known.close(); unknown.close(); }
  });
});
