/// <reference types="jest" />
/**
 * The Tools viewers (SALE-FORM-WITH-TOOLS.html, RENTAL-FORM-WITH-TOOLS.html) are agent BACKEND viewers: they show a stored listing in full and let the agent print it, e-mail it,
 * or hand out an agent sheet. Whatever the listing stores (any agent can write a listing's raw_data; MLS-fed text is stored too) reaches those documents, so a stored value is
 * never markup, and a value the record does not carry is never made up.
 *
 * Marker values: every stored text carries <img src=x onerror="window.__pwned_<name>=1">. The documents the page builds are parsed, and must hold the marker as TEXT: no element
 * from it, no event-handler attribute, no script of the stored text's making.
 */
import { bootViewer, isFailScreen, rendered, sleep, until, type Booted } from './tools-viewer-harness';

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

// ── Rental ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const RENTAL_HOSTILE = {
  id: '505', listing_id: 'RL-0505', status: 'Active', list_price: '3200', bedrooms_total: H('beds'), bathrooms_full: H('baths'), living_area: '1234',
  postal_code: '10017', borough: 'Manhattan', property_type: 'Residential',
  address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: H('street'), StreetSuffix: 'St', UnitNumber: H('unit'), City: 'New York', StateOrProvince: 'NY', PostalCode: '10017' },
  features: { PublicRemarks: H('desc') },
  raw_data: { PublicRemarks: H('desc'), SubdivisionName: H('hood'), BuildingName: H('bldg'), rentalWebHeadline: H('headline'), rentalBorough: H('borough'), rentalOwnerPays: true },
  list_agent_full_name: H('agent'), list_agent_direct_phone: H('phone'), list_agent_email: H('email'), list_office_name: H('office'),
  media: [{ url: URL_WITH_ENTITY }, { url: BREAKOUT }, { url: 'javascript:window.__pwned_js=1' }, { url: 'data:text/html,<script>window.__pwned_data=1</script>' }, { url: 'http://example.test/c<d>.jpg' }, { url: '' }],
  updated_at: '2026-03-02T00:00:00.000Z',
};
const RENTAL_SECTIONS = ['agentInfo', 'classification', 'address', 'pricing', 'rooms', 'features', 'utilities', 'building', 'amenities', 'policies', 'distribution', 'description', 'photos'];

// what the page hands to a Blob / the clipboard, captured (jsdom has neither a print window nor a clipboard)
function captureBlobs(f: Booted): string[] {
  const parts: string[] = [];
  f.w.Blob = class { constructor(p: unknown[]) { parts.push(String(p[0])); } };
  f.w.URL.createObjectURL = () => 'blob:captured';
  f.w.URL.revokeObjectURL = () => undefined;
  f.w.open = () => null;
  Object.defineProperty(f.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
  f.w.ClipboardItem = class { constructor(public items: unknown) {} };
  return parts;
}

describe('RENTAL-FORM-WITH-TOOLS: a stored value is text in everything the page writes', () => {
  let f: Booted;
  beforeAll(async () => { f = await open('RENTAL-FORM-WITH-TOOLS', RENTAL_HOSTILE); });
  afterAll(() => f.close());

  it('boots on the stored listing without a page error, and the preview the page fills on its own (zero click) holds the bedroom and bathroom values as text', () => {
    expect(f.errors).toEqual([]);
    expect((f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value).toBe(H('desc'));
    for (const id of ['previewBeds', 'previewBaths']) {
      const el = f.d.getElementById(id) as HTMLElement;
      expect([id, el.querySelector('img')]).toEqual([id, null]);
      expect(el.textContent).toContain(H(id === 'previewBeds' ? 'beds' : 'baths'));
    }
    expect(pwned(f)).toEqual([]);
  });

  it('the preview holds every stored text as text, and every amenity pill too', () => {
    f.w.updateRentalPreview();
    for (const id of ['previewAddress', 'previewDescription', 'previewHeadline', 'rentalPreviewCRMDesc', 'rentalPreviewSiteDesc', 'rentalPreviewCRMAddress', 'previewAgentName', 'rentalPreviewSiteCompanyName', 'rentalPreviewSiteNeighborhood']) {
      const el = f.d.getElementById(id) as HTMLElement;
      expect([id, el.querySelector('img')]).toEqual([id, null]);
    }
    expect((f.d.getElementById('previewDescription') as HTMLElement).textContent).toBe(H('desc'));
    expect((f.d.getElementById('previewAgentName') as HTMLElement).textContent).toBe(H('agent'));              // the listing agent, as the record names them
    for (const id of ['previewBeds', 'previewBaths', 'previewSqFt']) expect([id, (f.d.getElementById(id) as HTMLElement).childNodes.length]).toEqual([id, 2]);   // an icon and its text: drawn again, the preview replaces what it drew
    // The pills are read from the checkboxes that are ticked and their labels. This page has no "Outdoor" checkbox today (the pills are empty), so one is put in the way a
    // later change would: the label's text must still reach the pill as text. The building pills read the Elevator checkbox's label.
    const outdoor = f.d.createElement('label');
    const outdoorBox = f.d.createElement('input');
    outdoorBox.type = 'checkbox';
    outdoorBox.name = 'rentalOutdoor';
    outdoorBox.checked = true;
    outdoor.appendChild(outdoorBox);
    outdoor.appendChild(f.d.createTextNode(H('pill')));
    f.d.body.appendChild(outdoor);
    const elevator = f.d.getElementById('bldgElevator') as HTMLInputElement;
    elevator.checked = true;
    (elevator.closest('label') as HTMLElement).appendChild(f.d.createTextNode(H('buildingpill')));
    f.w.updateRentalPreview();
    for (const [id, name] of [['previewAmenities', 'pill'], ['rentalPreviewSiteAmenities', 'buildingpill']]) {
      const box = f.d.getElementById(id) as HTMLElement;
      expect([id, box.querySelector('img')]).toEqual([id, null]);
      expect([id, box.querySelectorAll('span').length]).toEqual([id, 1]);
      expect([id, box.textContent?.includes(H(name))]).toEqual([id, true]);
    }
    expect(pwned(f)).toEqual([]);
    outdoor.remove();
  });

  it('the print document holds every stored text as text (all sections, branding on)', () => {
    // The agent and the company in the document are the signed-in agent's: their controls are filled from the session (blank here), and a name or a company is text too.
    (f.d.getElementById('rentalUpdatingAgent') as HTMLInputElement).value = H('preparer');
    (f.d.getElementById('rentalUpdatingAgentCompanyName') as HTMLInputElement).value = H('office');
    const data = f.w.collectRentalPrintData();
    const html: string = f.w.buildRentalPrintHTML(data, RENTAL_SECTIONS, { branding: true, landscape: false, preset: 'full' });
    const doc = parse(f, html);
    expect(handlerAttributes(doc)).toEqual([]);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    const text = doc.body.textContent ?? '';
    for (const name of ['desc', 'headline', 'bldg', 'unit', 'street', 'preparer', 'office']) expect(text).toContain(H(name));
    const photos = [...doc.querySelectorAll('img')];
    expect(photos).toHaveLength(3);                                             // the record's three http(s) addresses: a javascript:, a data: and an empty address are not photos
    expect(photos[0].getAttribute('src')).toBe(URL_WITH_ENTITY);                // an address is shown as stored (a stored entity is not decoded)
    expect(photos[1].getAttribute('src')).toContain('%22');                     // a quote breakout stays inside the attribute
    expect(photos[2].getAttribute('src')).toBe('http://example.test/c%3Cd>.jpg');   // a plain http address is a photo; the character that opens a tag is encoded
    expect(text).toContain('Listing last updated:');
    expect(pwned(f)).toEqual([]);
  });

  it('the builders write every field they are given as text, whatever its source', () => {
    const real = f.w.collectRentalPrintData();
    const data: Record<string, string> = Object.fromEntries(Object.keys(real).map((k) => [k, H(`d_${k}`)]));
    Object.assign(data, { monthlyRent: '3200', securityDeposit: '3200' });          // a rent goes through parseFloat: a marker would print NaN
    const documents: [string, string][] = [
      ['print', f.w.buildRentalPrintHTML(data, RENTAL_SECTIONS, { branding: true, landscape: false, preset: 'full' })],
      ['card', f.w.buildRentalEmailCardHTML(data)],
    ];
    for (const [name, html] of documents) {
      const doc = parse(f, html);
      expect([name, handlerAttributes(doc)]).toEqual([name, []]);
      expect([name, doc.querySelectorAll('script').length]).toEqual([name, 0]);
      expect([name, doc.querySelector('img[src="x"]')]).toEqual([name, null]);
      const text = doc.body.textContent ?? '';
      expect([name, doc.querySelector('img')?.getAttribute('src')]).toEqual([name, URL_WITH_ENTITY]);
      for (const key of ['bedrooms', 'fullBaths', 'livingArea', 'propertyType', 'updatingAgent', 'availableDate']) expect([name, key, text.includes(H(`d_${key}`)) || name === 'print' && key === 'availableDate']).toEqual([name, key, true]);
    }
  });

  it('the e-mail card, in the page, holds every stored text as text', () => {
    f.w.openRentalEmailModal();
    const preview = f.d.getElementById('rentalEmailCardPreview') as HTMLElement;
    expect(preview.querySelector('img[src="x"]')).toBeNull();
    expect([...preview.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)))).toHaveLength(0);
    expect(preview.textContent).toContain(H('desc'));
    expect(preview.textContent).toContain(H('unit'));
    expect(pwned(f)).toEqual([]);
  });

  it('the clipboard e-mail shows the typed message and every stored text as text', () => {
    const parts = captureBlobs(f);
    (f.d.getElementById('rentalEmailMessage') as HTMLTextAreaElement).value = `Hello ${H('message')}\nSecond line`;
    f.w.copyRentalEmailToClipboard();
    const html = parts.find((p) => p.includes('Second line')) ?? '';
    const doc = parse(f, html);
    expect(handlerAttributes(doc)).toEqual([]);
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    expect(doc.body.textContent).toContain(H('message'));
    expect(doc.body.textContent).toContain(H('desc'));
    expect(html).toContain('Hello &#60;img');
    expect(html).toContain('<br>Second line');                                  // a line break is still a line break
    expect(pwned(f)).toEqual([]);
  });

  it('the clipboard e-mail writes every field it is given as text, whatever its source (a number control or a radio cannot carry markup, but the builder does not rely on that)', () => {
    const real = f.w.collectRentalPrintData();
    const data: Record<string, string> = Object.fromEntries(Object.keys(real).map((k) => [k, H(`d_${k}`)]));
    Object.assign(data, { monthlyRent: '3200', securityDeposit: '3200' });          // a rent goes through parseFloat: a marker would print NaN
    const parts = captureBlobs(f);
    const collect = f.w.collectRentalPrintData;
    f.w.collectRentalPrintData = () => data;                                         // the clipboard e-mail collects its own data: this is what it would be given
    try { f.w.copyRentalEmailToClipboard(); } finally { f.w.collectRentalPrintData = collect; }
    const doc = parse(f, parts.find((p) => p.includes('<')) ?? '');
    expect(handlerAttributes(doc)).toEqual([]);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    const text = doc.body.textContent ?? '';
    for (const key of ['bedrooms', 'fullBaths', 'livingArea', 'propertyType', 'updatingAgent', 'availableDate', 'description']) expect([key, text.includes(H(`d_${key}`))]).toEqual([key, true]);
    expect(doc.querySelector('img')?.getAttribute('src')).toBe(URL_WITH_ENTITY);    // the first photo, as stored
    expect(pwned(f)).toEqual([]);
  });

  it('the agent info sheet (written into a window of this origin) holds the stored agent and address as text', () => {
    let written = '';
    f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
    for (const id of ['rentalUpdatingAgentName', 'rentalUpdatingAgentPhone', 'rentalUpdatingAgentEmail', 'rentalUpdatingAgentLicense']) (f.d.getElementById(id) as HTMLInputElement).value = H(id);
    f.w.generateAgentInfoSheet();
    const doc = parse(f, written);
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    expect([...doc.querySelectorAll('script')].map((s) => s.textContent).filter((t) => /pwned/.test(t ?? ''))).toEqual([]);
    expect(handlerAttributes(doc).sort()).toEqual(['button[onclick]', 'button[onclick]']);   // the sheet's own Print and Email buttons, nothing else
    expect(doc.body.textContent).toContain(H('rentalUpdatingAgentName'));
    expect(doc.body.textContent).toContain(H('unit'));
    expect(pwned(f)).toEqual([]);
  });

  it('the open house sign-in sheet holds the address and the hosting agent as text', () => {
    const parts = captureBlobs(f);
    (f.d.getElementById('rentalUpdatingAgent') as HTMLInputElement).value = H('hosting');
    f.w.printOpenHouseSignIn('rental');
    const doc = parse(f, parts[0] ?? '');
    expect(doc.querySelector('img[src="x"]')).toBeNull();
    expect(handlerAttributes(doc)).toEqual([]);
    expect(doc.body.textContent).toContain(H('hosting'));
    expect(doc.body.textContent).toContain(H('street'));
    expect(pwned(f)).toEqual([]);
  });

  it('a toast shows its message as text, whichever helper shows it', () => {
    const before = new Set(f.d.querySelectorAll('body > div'));
    f.w.showToast(H('toast'), 'success');
    f.w.showRentalFormToast(H('formtoast'), 'success');
    f.w.alert(H('alert'));                                                      // the page replaces alert with a toast
    const toasts = [...f.d.querySelectorAll('body > div')].filter((t) => !before.has(t));
    expect(toasts).toHaveLength(3);
    for (const t of toasts) expect([t.querySelector('img'), /^\s*<img src=x onerror="window.__pwned_(toast|formtoast|alert)=1">$/.test(t.textContent ?? '')]).toEqual([null, true]);
    expect(pwned(f)).toEqual([]);
  });

  it('a compliance flag shows what matched, and the name of the rule that matched, as text', () => {
    const box = f.d.getElementById('rentalDescription') as HTMLTextAreaElement;
    const flags = f.d.getElementById('rentalFairHousingFlags') as HTMLElement;
    const was = box.value;
    box.value = `see http://x.test/<img/src=x/onerror=window.__pwned_flag=1> for more`;      // the URL rule matches up to the next space, markup characters included
    f.w.checkDescriptionCompliance('rentalDescription', 'rentalFairHousingFlags');
    expect(flags.textContent).toContain('window.__pwned_flag=1');                              // it was matched and is shown...
    expect(flags.querySelector('img')).toBeNull();                                             // ...as text
    // A rule added to either list later may match markup, or carry a name that holds some: one of each is put in the way a later change would.
    f.w.eval(`FAIR_HOUSING_VIOLATIONS.push({ pattern: /xmarkx\\S*/gi, category: ${JSON.stringify(H('fhrule'))} })`);
    f.w.eval(`REBNY_DESCRIPTION_VIOLATIONS.push({ pattern: /ymarky\\S*/gi, category: ${JSON.stringify(H('rebnyrule'))} })`);
    box.value = `xmarkx<img/src=x/onerror=window.__pwned_fhmatch=1> and ymarky<img/src=x/onerror=window.__pwned_rebnymatch=1>`;
    f.w.checkDescriptionCompliance('rentalDescription', 'rentalFairHousingFlags');
    for (const shown of [H('fhrule'), H('rebnyrule'), 'window.__pwned_fhmatch=1', 'window.__pwned_rebnymatch=1']) expect([shown, flags.textContent?.includes(shown)]).toEqual([shown, true]);
    expect(flags.querySelector('img')).toBeNull();
    f.w.eval('FAIR_HOUSING_VIOLATIONS.pop(); REBNY_DESCRIPTION_VIOLATIONS.pop()');
    expect(pwned(f)).toEqual([]);
    box.value = was;
  });

  it('building rows, the agent table and the company list (nothing fills them today) are written with DOM calls', () => {
    f.w.buildingDatabase.push({ address: `1 ${H('row')} Ave`, name: H('rowname'), neighborhood: H('rowhood'), borough: 'Manhattan', model: H('rowmodel') });
    f.w.searchBuildingForListing('ave', 'rental');
    f.w.searchBuildingModal('ave');
    for (const id of ['rentalBuildingSearchResults', 'bldgSearchResults']) {
      const results = f.d.getElementById(id) as HTMLElement;
      expect([id, results.querySelector('img')]).toEqual([id, null]);
      expect([id, results.querySelectorAll('[onclick]').length]).toEqual([id, 0]);
      expect([id, results.textContent?.includes(H('row'))]).toEqual([id, true]);
    }
    f.w.buildingDatabase.length = 0;
    f.w.updateRentalAgentTable('listing', H('aid'), H('aname'), H('aco'), H('aphone'), H('aemail'));
    f.w.updateRentalAgentTable('listing', H('aid2'), H('aname2'), H('aco2'), H('aphone2'), H('aemail2'));        // the same row again replaces it
    const table = f.d.getElementById('rentalAgentContactsTable') as HTMLElement;
    expect(table.querySelector('img')).toBeNull();
    expect(table.querySelectorAll('tr[data-type="listing"]')).toHaveLength(1);
    expect(table.querySelectorAll('tr[data-type="listing"] button[aria-label="Edit"]')).toHaveLength(1);
    expect(table.textContent).toContain(H('aname2'));
    const list = f.d.createElement('div');
    f.w.renderCompanyList(list, H('typed'));
    expect(list.querySelector('img')).toBeNull();
    expect(list.textContent).toContain(H('typed'));
    expect(pwned(f)).toEqual([]);
  });

  it('a building search replaces its rows with each search, and a click on a row picks the building the row shows', () => {
    const picked: unknown[][] = [];
    f.w.selectBuildingFromIDX = (...args: unknown[]) => { picked.push(['listing', ...args]); };
    f.w.selectBuildingForModal = (...args: unknown[]) => { picked.push(['modal', ...args]); };
    f.w.buildingDatabase.push({ address: '1 Row Ave', name: 'Row House', neighborhood: 'Midtown', borough: 'Manhattan', model: 'Condo' });
    for (let i = 0; i < 2; i += 1) { f.w.searchBuildingForListing('ave', 'rental'); f.w.searchBuildingModal('ave'); }
    for (const id of ['rentalBuildingSearchResults', 'bldgSearchResults']) expect([id, (f.d.getElementById(id) as HTMLElement).children.length]).toEqual([id, 1]);
    const row = (id: string) => (f.d.getElementById(id) as HTMLElement).firstElementChild as HTMLElement;
    expect(row('rentalBuildingSearchResults').textContent).toContain('Row House | Midtown, Manhattan');
    expect(row('rentalBuildingSearchResults').textContent).toContain('Condo');
    row('rentalBuildingSearchResults').click();
    row('bldgSearchResults').click();
    expect(picked).toEqual([['listing', 'rental', '1 Row Ave'], ['modal', '1 Row Ave']]);
    f.w.buildingDatabase.length = 0;
  });

  it('esc encodes every character that can open a tag or leave an attribute, and writes nothing for nothing', () => {
    expect(f.w.esc(`<a href="x" onclick='y'>&amp;</a>`)).toBe('&#60;a href=&#34;x&#34; onclick=&#39;y&#39;&#62;&#38;amp;&#60;/a&#62;');
    expect([f.w.esc(null), f.w.esc(undefined), f.w.esc(0), f.w.esc(false), f.w.esc('plain text')]).toEqual(['', '', '0', 'false', 'plain text']);
  });
});

describe('RENTAL-FORM-WITH-TOOLS: nothing is made up', () => {
  it('a listing that carries almost nothing prints and e-mails almost nothing', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: '', raw_data: {} });
    try {
      const data = f.w.collectRentalPrintData();
      for (const key of ['status', 'listingType', 'buildingStatus', 'city', 'state', 'brokerFee', 'idxDisplay', 'syndication', 'ownerOptOut', 'laundry', 'washerDryer']) expect([key, data[key]]).toEqual([key, '']);
      const print: string = f.w.buildRentalPrintHTML(data, RENTAL_SECTIONS, { branding: false, landscape: false, preset: 'full' });
      for (const made of ['Draft', 'Exclusive', 'Resale', 'Tenant Pays', 'IDX Display', 'Syndication', 'See building modal', 'New York']) expect([made, parse(f, print).body.textContent?.includes(made)]).toEqual([made, false]);
      const doc = parse(f, f.w.buildRentalEmailCardHTML(data));
      const text = doc.body.textContent ?? '';
      for (const made of ['$0', 'Address', 'New York, NY']) expect([made, text.includes(made)]).toEqual([made, false]);
      expect(doc.querySelector('p[style*="font-size:24px"]')).toBeNull();           // no empty price line either
      expect(f.w.getRentalPlainTextSummary(data)).not.toMatch(/\bNY\b/);
      const parts = captureBlobs(f);                                                // the clipboard e-mail is built apart from the card
      f.w.copyRentalEmailToClipboard();
      await sleep(50);                                                              // the clipboard answers, and the page says so, while the page is still open
      const clip = parse(f, parts.find((p) => p.includes('<')) ?? '');
      for (const made of ['$0', 'Address', 'New York, NY']) expect([made, clip.body.textContent?.includes(made)]).toEqual([made, false]);
      expect(clip.querySelector('p[style*="font-size:24px"]')).toBeNull();
    } finally { f.close(); }
  });

  it('the city and state are the record\'s, in the print and in the plain text', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', address: { StreetNumber: '5', StreetName: 'Main', StreetSuffix: 'St', City: 'Hoboken', StateOrProvince: 'NJ', PostalCode: '07030' }, raw_data: {} });
    try {
      const data = f.w.collectRentalPrintData();
      expect([data.city, data.state]).toEqual(['Hoboken', 'NJ']);
      const text = parse(f, f.w.buildRentalPrintHTML(data, RENTAL_SECTIONS, { branding: false, landscape: false, preset: 'client' })).body.textContent ?? '';
      expect(text).toContain('NJ');
      expect(text).not.toMatch(/\bNY\b/);
      expect(f.w.getRentalPlainTextSummary(data)).toContain('NJ');
    } finally { f.close(); }
  });

  it('the stored state is taken from the address or from the record\'s own fields, trimmed, and what is not text is not printed', async () => {
    const own = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { City: 'Jersey City', StateOrProvince: 'NJ' } });
    const padded = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', address: { City: '  Hoboken ', StateOrProvince: ' NJ' }, raw_data: {} });
    const odd = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', address: { City: { name: 'x' }, StateOrProvince: ['NJ'] }, raw_data: {} });
    const bare = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active' });                  // no address and no raw_data at all
    const lost = bootViewer('RENTAL-FORM-WITH-TOOLS', { mode: 'missing' });
    try {
      const cityAndState = [own, padded, odd, bare].map((g) => { const d = g.w.collectRentalPrintData(); return [d.city, d.state]; });
      expect(cityAndState).toEqual([['Jersey City', 'NJ'], ['Hoboken', 'NJ'], ['', ''], ['', '']]);
      await until(() => isFailScreen(lost.d));
      expect(lost.w.getRentalStoredAddress('City')).toBe('');                       // a record that could not be loaded has no address, and asking does not throw
    } finally { own.close(); padded.close(); odd.close(); bare.close(); lost.close(); }
  });

  it('the broker fee, the distribution flags and the laundry flag are what the record says: yes, no, or left out when it does not carry them', async () => {
    const yes = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { rentalOwnerPays: true, rentalIDXEntireListingDisplayYN: true, rentalSyndicateYN: true, rentalLaundryRoom: true, rentalListingType: 'ExclusiveRightToLease' } });
    const no = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { rentalOwnerPays: false, rentalIDXEntireListingDisplayYN: false, rentalSyndicateYN: false, rentalLaundryRoom: false, rentalListingType: 'RLS-Owner-OptOut' } });
    try {
      const a = yes.w.collectRentalPrintData();
      expect([a.brokerFee, a.idxDisplay, a.syndication, a.ownerOptOut, a.laundry]).toEqual(['Owner Pays', 'Yes', 'Yes', 'No', 'Yes']);
      const b = no.w.collectRentalPrintData();
      expect([b.brokerFee, b.idxDisplay, b.syndication, b.ownerOptOut, b.laundry]).toEqual(['Tenant Pays', 'No', 'No', 'Yes', 'No']);
    } finally { yes.close(); no.close(); }
  });

  it('the amenities the record ticks are printed, and the sentence that points at a modal is not', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { BuildingFeatures: ['Roof Deck', 'Elevator'] } });
    const none = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: {} });
    try {
      // a ticked box that carries no label of its own is not an amenity
      const modal = f.d.getElementById('rentalBuildingModal') as HTMLElement;
      const bare = f.d.createElement('div');
      bare.innerHTML = '<input type="checkbox" data-rls-field="BuildingFeatures" checked>';
      modal.appendChild(bare);
      (f.d.getElementById('rentalDoorman') as HTMLInputElement).checked = true;     // a box of the form outside the building modal is not a building amenity
      const data = f.w.collectRentalPrintData();
      expect(data.amenities).toBe('Elevator, Roof Deck');                           // the ticked ones, in the page's order; the unticked ones are not listed
      const text = parse(f, f.w.buildRentalPrintHTML(data, ['amenities', 'policies'], { branding: false, landscape: false, preset: 'custom' })).body.textContent ?? '';
      expect(text).toContain('Elevator, Roof Deck');
      expect(text).not.toContain('Policies');                                      // nothing is stored for it, so no empty box
      expect(text).not.toContain('See building modal');
      expect(none.w.collectRentalPrintData().amenities).toBe('');
      expect(parse(none, none.w.buildRentalPrintHTML(none.w.collectRentalPrintData(), ['amenities'], { branding: false, landscape: false, preset: 'custom' })).body.textContent).not.toContain('Amenities');   // no amenities, no section
    } finally { f.close(); none.close(); }
  });

  it('only an http(s) address from the record is a photo address: anything else is dropped, and the characters that leave an attribute are encoded', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: {}, media: [{ url: 'https://example.test/a.jpg' }] });
    try {
      expect(f.w.getListingPhotoUrls('rental')).toEqual(['https://example.test/a.jpg']);
      f.w.eval(`VIEWER_LISTINGS[VIEWER_LISTING_ID].photos = ['https://example.test/a"b.jpg', 'http://example.test/c<d>.jpg', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.test/e.jpg', '', null, 7, {}]`);
      expect(f.w.getListingPhotoUrls('rental')).toEqual(['https://example.test/a%22b.jpg', 'http://example.test/c%3Cd>.jpg']);
      f.w.eval('VIEWER_LISTINGS[VIEWER_LISTING_ID].photos = null');
      expect(f.w.getListingPhotoUrls('rental')).toEqual([]);                        // a record with no photo list has no photos (and the preview grid is not read)
    } finally { f.close(); }
  });

  it('the agent info sheet shows the listing\'s baths (it read a total the record never fills)', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', list_price: '3200', bedrooms_total: 2, bathrooms_full: 2, living_area: '1000', raw_data: {} });
    try {
      let written = '';
      f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
      f.w.generateAgentInfoSheet();
      expect(parse(f, written).body.textContent ?? '').toContain('2 BD | 2 BA');
    } finally { f.close(); }
  });

  it('nothing meant for the agent is written into the renter\'s mail body', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', list_price: '3200', raw_data: {} });
    try {
      let opened = '';
      captureBlobs(f);
      f.w.open = (url: string) => { opened = url; return null; };
      (f.d.getElementById('rentalEmailTo') as HTMLInputElement).value = 'renter@example.test';
      f.w.openRentalInEmailClient();
      await sleep(50);                                                              // the clipboard answers, and the page says so, while the page is still open
      const body = decodeURIComponent(opened.split('&body=')[1] ?? '');
      expect(body).toContain('$3,200/mo');
      expect(body).not.toMatch(/clipboard|paste/i);
    } finally { f.close(); }
  });

  it('a record with no deal fees shows none, and one with fees shows its own', async () => {
    const none = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: {} });
    const empty = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { rentalDealFees: [] } });
    const some = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { rentalDealFees: [{ type: 'ApplicationFee', description: 'Credit check', cost: '20' }] } });
    try {
      expect(none.d.querySelectorAll('#rentalFeesTableBody tr')).toHaveLength(0);
      expect(empty.d.querySelectorAll('#rentalFeesTableBody tr')).toHaveLength(0);
      expect(some.d.querySelectorAll('#rentalFeesTableBody tr')).toHaveLength(1);
      expect((some.d.querySelector('#rentalFeesTableBody input[type="text"]') as HTMLInputElement).value).toBe('Credit check');
    } finally { none.close(); empty.close(); some.close(); }
  });
});

describe('RENTAL-FORM-WITH-TOOLS: the viewer shows what the record carries', () => {
  it('hides the form\'s placeholders, the Calculate button that writes zeros and the Submit button of a viewer that submits nothing', async () => {
    const f = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: {} });
    try {
      const style = [...f.d.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      expect(style).toContain('body.viewer-mode .field-input::placeholder { color: transparent; }');
      for (const sel of ['[onclick*="calculateRentalTHFinancials"]', '[onclick*="submitRentalCommissionRequest"]']) {
        const button = f.d.querySelector(sel) as HTMLElement | null;
        expect([sel, button !== null]).toEqual([sel, true]);
        expect([sel, button!.classList.contains('viewer-hidden')]).toEqual([sel, true]);
      }
      // every field the submission asks for is filled, so a guard that did not stop the function would let it report a submission
      for (const [id, value] of [['commRentalFinalPrice', '3200'], ['commRentalCommValue', '3200'], ['commRentalLandlordName', 'Landlord'], ['commRentalTenantName', 'Tenant'], ['commRentalTenantEmail', 'tenant@example.test'], ['commRentalTenantPhone', '2125550100'], ['commRentalLeaseStart', '2026-11-01']]) (f.d.getElementById(id) as HTMLInputElement).value = value;
      (f.d.querySelector('input[name="commRentalPayMethod"]') as HTMLInputElement).checked = true;
      const step = f.d.getElementById('commRentalStep2') as HTMLElement;
      const stepBefore = step.innerHTML;
      const toastsBefore = new Set(f.d.querySelectorAll('body > div'));
      f.w.submitRentalCommissionRequest();                                          // called anyway: it says so, and claims nothing
      expect(step.innerHTML).toBe(stepBefore);
      const said = [...f.d.querySelectorAll('body > div')].filter((t) => !toastsBefore.has(t)).map((t) => t.textContent).join(' ');
      expect(said).toContain('cannot be submitted from the viewer');
      expect(said).not.toContain('Submitted');
    } finally { f.close(); }
  });

  it('the Sale viewer hides its Submit button too', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', { id: '9', listing_id: 'SL-0009', status: 'Active', raw_data: {} });
    try {
      const button = f.d.querySelector('[onclick*="submitSaleCommissionRequest"]') as HTMLElement | null;
      expect(button).not.toBeNull();
      expect(button!.classList.contains('viewer-hidden')).toBe(true);
    } finally { f.close(); }
  });

  it('the preview says "--" where the record has nothing (no headline, address, rent or description is made up), and reads the building name and elevator where the page has them', async () => {
    const empty = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: {} });
    const full = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { rentalPropertyType: 'Condo', bldgName: 'The Grand', bldgElevator: true } });
    const known = await open('RENTAL-FORM-WITH-TOOLS', { id: '9', listing_id: 'RL-0009', status: 'Active', raw_data: { rentalPropertyType: 'Condo', bldgElevator: false } });
    try {
      empty.w.updateRentalPreview();
      const text = (g: Booted, id: string) => g.d.getElementById(id)?.textContent ?? '';
      for (const id of ['previewHeadline', 'previewAddress', 'previewRent', 'previewDescription', 'rentalPreviewCRMDesc', 'rentalPreviewSiteDesc', 'rentalPreviewSiteNeighborhood']) expect([id, text(empty, id)]).toEqual([id, '--']);
      expect(empty.d.getElementById('previewAmenities')!.children).toHaveLength(0);
      expect(empty.d.getElementById('rentalPreviewSiteAmenities')!.children).toHaveLength(0);
      full.w.updateRentalPreview();
      known.w.updateRentalPreview();
      expect([text(full, 'rentalPreviewBldgName'), text(full, 'rentalPreviewBldgElevator'), text(known, 'rentalPreviewBldgElevator')]).toEqual(['The Grand', 'Yes', 'No']);
    } finally { empty.close(); full.close(); known.close(); }
  });
});
