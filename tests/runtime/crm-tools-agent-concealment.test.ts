/// <reference types="jest" />
/**
 * The Tools viewers (SALE-FORM-WITH-TOOLS.html, RENTAL-FORM-WITH-TOOLS.html) are agent BACKEND viewers: they show a stored listing in full, listing agent contact included, and let the
 * agent print it, e-mail it or hand out an agent sheet. A report that goes to a buyer or a renter conceals the listing agent (name, MLS id, phone, e-mail, office) and carries the commission
 * for no one but the agent: those two appear only in the agent's own reports (Full CRM Report, Commission Report). Whoever the report comes FROM is the signed-in agent (their name,
 * phone and e-mail, from their session), never the listing agent: the record's agent is not written into the signed-in agent's controls, and no document falls back to it.
 *
 * Every document below is built by the REAL page from a listing whose agent is a sentinel (a name, an MLS id, a phone, an e-mail and an office nobody else has), with a signed-in agent
 * who has their own.
 */
import { bootViewer, rendered, sleep, until, type Booted, type ViewerFile } from './tools-viewer-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const LISTING_AGENT = { name: 'Lena Listing', mlsId: '55501', phone: '917-555-0111', email: 'lena.listing@otherfirm.test', office: 'Other Firm Realty' };
const LISTING_MARKS = Object.values(LISTING_AGENT);
const SESSION = { id: 'AG-9', name: 'Sender Agent', phone: '212-555-0199', email: 'sender@example.test', license: 'L-123', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' };
const COMMISSION = '2.75';

const SECTIONS = ['agentInfo', 'classification', 'address', 'pricing', 'rooms', 'features', 'utilities', 'building', 'amenities', 'policies', 'distribution', 'description', 'photos'];
const parse = (f: Booted, html: string) => new f.w.DOMParser().parseFromString(html, 'text/html') as Document;
const textOf = (f: Booted, html: string) => parse(f, html).body.textContent ?? '';
const leaks = (s: string) => LISTING_MARKS.filter((m) => s.includes(m));

const LISTING = {
  id: '404', listing_id: 'SL-0404', status: 'Active', list_price: '1250000', bedrooms_total: 2, bathrooms_full: 1, living_area: '1234', postal_code: '10017', borough: 'Manhattan', property_type: 'Residential',
  address: { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'St', City: 'New York', StateOrProvince: 'NY', PostalCode: '10017' },
  features: { PublicRemarks: 'A bright two bedroom.' },
  list_agent_full_name: LISTING_AGENT.name, list_agent_mls_id: LISTING_AGENT.mlsId, list_agent_direct_phone: LISTING_AGENT.phone, list_agent_email: LISTING_AGENT.email, list_office_name: LISTING_AGENT.office,
  agent_info: { ListAgentFullName: LISTING_AGENT.name, ListAgentMlsId: LISTING_AGENT.mlsId, ListAgentEmail: LISTING_AGENT.email, ListAgentDirectPhone: LISTING_AGENT.phone, ListOfficeName: LISTING_AGENT.office },
  raw_data: { PublicRemarks: 'A bright two bedroom.', ListAgentFullName: LISTING_AGENT.name, ListOfficeName: LISTING_AGENT.office },
  updated_at: '2026-03-02T00:00:00.000Z',
};

type Page = {
  file: ViewerFile; prefix: 'sale' | 'rental'; collect: string; build: string; card: string; inline: string | null; plain: string; sendMail: string; openPrint: string; executePrint: string;
  commissionId: string; emailTo: string; modal: string;
};
const PAGES: Page[] = [
  { file: 'SALE-FORM-WITH-TOOLS', prefix: 'sale', collect: 'collectSalePrintData', build: 'buildSalePrintHTML', card: 'buildSaleEmailCardHTML', inline: 'buildSaleEmailInlineHTML', plain: 'getSalePlainTextSummary', sendMail: 'openSaleInEmailClient',
    openPrint: 'openSalePrintModal', executePrint: 'executeSalePrint', commissionId: 'saleExclusiveCommission', emailTo: 'saleEmailTo', modal: 'salePrintModal' },
  { file: 'RENTAL-FORM-WITH-TOOLS', prefix: 'rental', collect: 'collectRentalPrintData', build: 'buildRentalPrintHTML', card: 'buildRentalEmailCardHTML', inline: null, plain: 'getRentalPlainTextSummary', sendMail: 'openRentalInEmailClient',
    openPrint: 'openRentalPrintModal', executePrint: 'executeRentalPrint', commissionId: 'rentalCommissionAmount', emailTo: 'rentalEmailTo', modal: 'rentalPrintModal' },
];

async function open(p: Page, o: { user?: Record<string, unknown>; listing?: Record<string, unknown> } = {}): Promise<Booted> {
  const f = bootViewer(p.file, { listing: o.listing ?? LISTING, user: o.user ?? SESSION });
  await until(() => rendered(f.d), 15000);
  await sleep(400);
  (f.d.getElementById(p.commissionId) as HTMLInputElement).value = COMMISSION;
  return f;
}
const val = (f: Booted, id: string) => (f.d.getElementById(id) as HTMLInputElement | null)?.value ?? '';
const shown = (f: Booted, id: string) => (f.d.getElementById(id) as HTMLElement).textContent ?? '';

describe.each(PAGES)('$file: the signed-in agent is the one a report comes from, and the listing agent stays on the screen', (p) => {
  let f: Booted;
  beforeAll(async () => { f = await open(p); });
  afterAll(() => f.close());

  it('the dialog\'s own markup already has the Client Sheet chosen (the page does not rely on a script to say which)', () => {
    const chosen = [...f.d.querySelectorAll(`.${p.prefix}-print-preset`)].filter((b) => b.classList.contains('bg-[#B8860B]')).map((b) => (b as HTMLElement).dataset.preset);
    expect(chosen).toEqual(['client']);
  });

  it('boots on the record without a page error, with the record\'s own fields in their controls, and shows the listing agent\'s contact to the agent', () => {
    expect(f.errors).toEqual([]);
    expect(val(f, p.prefix === 'sale' ? 'salePrice' : 'rentalMonthlyRent')).toBe('1250000');            // the record itself is hydrated (only the signed-in agent\'s controls are not the record\'s)
    expect(val(f, `${p.prefix}StreetAddress`)).toContain('333');
    expect(val(f, `${p.prefix}ListingAgentSearch`)).toBe(LISTING_AGENT.name);
    expect(shown(f, `${p.prefix}ListingAgentId`)).toBe(LISTING_AGENT.mlsId);
    expect(shown(f, `${p.prefix}ListingAgentPhone`)).toBe(LISTING_AGENT.phone);
    expect(shown(f, `${p.prefix}ListingAgentEmail`)).toBe(LISTING_AGENT.email);
    expect(val(f, `${p.prefix}ListingCompanySearch`)).toBe(LISTING_AGENT.office);
  });

  it('the signed-in agent\'s controls hold the session\'s values, not the record\'s agent', () => {
    expect(val(f, `${p.prefix}UpdatingAgentName`)).toBe(SESSION.name);
    expect(val(f, `${p.prefix}UpdatingAgentPhone`)).toBe(SESSION.phone);
    expect(val(f, `${p.prefix}UpdatingAgentEmail`)).toBe(SESSION.email);
    expect(val(f, `${p.prefix}UpdatingAgentCompanyName`)).toBe(SESSION.companyName);
    expect(val(f, `${p.prefix}UpdatingAgent`)).toBe(SESSION.id);
    for (const id of ['Name', 'Phone', 'Email', 'CompanyName', 'MlsId', 'Key', 'OfficeKey', 'OfficeMlsId']) expect([id, leaks(val(f, `${p.prefix}UpdatingAgent${id}`))]).toEqual([id, []]);
  });

  it('the print data names the signed-in agent by name, with their phone and e-mail, and carries the listing agent as the record names them', () => {
    const data = (f.w as any)[p.collect]();
    expect(data.updatingAgent).toBe(SESSION.name);
    expect([data.updatingCompany, data.updatingPhone, data.updatingEmail]).toEqual([SESSION.companyName, SESSION.phone, SESSION.email]);
    expect(data.listingAgent).toEqual(LISTING_AGENT);
  });

  it.each(['client', 'fact', 'custom'])('a %s report carries neither the listing agent nor the commission, whatever sections are ticked', (preset) => {
    const data = (f.w as any)[p.collect]();
    const html: string = (f.w as any)[p.build](data, SECTIONS, { branding: true, landscape: false, preset });
    const text = textOf(f, html);
    expect(leaks(text)).toEqual([]);
    expect(text).not.toContain(COMMISSION);
    expect(text).not.toMatch(/Listing Agent|Listing Office|Commission/);
    expect(text).toContain(`Prepared by ${SESSION.name} | ${SESSION.companyName}`);          // the one it comes from
    expect(text).toContain('Updating Agent');
  });

  it.each(['full', 'commission'])('a %s report is the agent\'s own: it carries the listing agent and the commission', (preset) => {
    const data = (f.w as any)[p.collect]();
    const text = textOf(f, (f.w as any)[p.build](data, SECTIONS, { branding: true, landscape: false, preset }));
    for (const mark of LISTING_MARKS) expect([mark, text.includes(mark)]).toEqual([mark, true]);
    expect(text).toContain(`${COMMISSION}%`);
    expect(text).toContain('Listing Agent MLS ID');
  });

  it('an own report without the agent section carries the commission and no listing agent', () => {
    const data = (f.w as any)[p.collect]();
    const text = textOf(f, (f.w as any)[p.build](data, ['pricing'], { branding: false, landscape: false, preset: 'full' }));
    expect(text).toContain(`${COMMISSION}%`);
    expect(leaks(text)).toEqual([]);
  });

  it('the print dialog opens on the Client Sheet, with the sections a client may have, and says what the other reports carry', () => {
    (f.w as any)[p.openPrint]();
    const active = [...f.d.querySelectorAll(`.${p.prefix}-print-preset`)].filter((b) => b.classList.contains('bg-[#B8860B]')).map((b) => (b as HTMLElement).dataset.preset);
    expect(active).toEqual(['client']);
    const ticked = [...f.d.querySelectorAll(`.${p.prefix}-print-section:checked`)].map((c) => (c as HTMLElement).dataset.section);
    expect(ticked).not.toContain('agentInfo');
    expect(ticked).toContain('address');
    expect((f.d.querySelector(`#${p.modal} [data-print-note="internal"]`) as HTMLElement).textContent).toMatch(/Full CRM Report and the Commission Report are for you.*listing agent and the commission/);
  });

  it('printing with the dialog as it opens writes a document without the listing agent and the commission', () => {
    const blobs: string[] = [];
    const real = f.w.Blob;
    f.w.Blob = class extends real { constructor(parts: BlobPart[], o?: BlobPropertyBag) { super(parts, o); blobs.push(parts.map(String).join('')); } };
    f.w.URL.createObjectURL = () => 'blob:print';
    f.w.URL.revokeObjectURL = () => undefined;
    f.w.open = () => null;
    (f.w as any)[p.openPrint]();
    (f.w as any)[p.executePrint]();
    f.w.Blob = real;
    expect(blobs).toHaveLength(1);
    const text = textOf(f, blobs[0]);
    expect(leaks(text)).toEqual([]);
    expect(text).not.toContain(COMMISSION);
    expect(text).toContain(SESSION.name);
  });

  it('every e-mail document (card, clipboard HTML, plain text, the mail client\'s body) names the signed-in agent and never the listing agent', async () => {
    const data = (f.w as any)[p.collect]();
    const documents: [string, string][] = [
      ['card', textOf(f, (f.w as any)[p.card](data))],
      ['plain', (f.w as any)[p.plain](data)],
    ];
    if (p.inline) documents.push(['inline', textOf(f, (f.w as any)[p.inline](data))]);
    let opened = '';
    const blobs: string[] = [];
    const realBlob = f.w.Blob;
    f.w.Blob = class extends realBlob { constructor(parts: BlobPart[], o?: BlobPropertyBag) { super(parts, o); blobs.push(parts.map(String).join('')); } };
    f.w.open = (url: string) => { opened = url; return null; };
    Object.defineProperty(f.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
    f.w.ClipboardItem = class { constructor(public items: unknown) {} };
    (f.d.getElementById(p.emailTo) as HTMLInputElement).value = 'buyer@example.test';
    (f.w as any)[p.sendMail]();
    await sleep(50);
    f.w.Blob = realBlob;
    expect(blobs).toHaveLength(2);                                                    // what goes to the clipboard: the card as HTML, and the plain text
    documents.push(['clipboard html', textOf(f, blobs[0])], ['clipboard text', blobs[1]]);
    documents.push(['mail body', decodeURIComponent(opened.split('&body=')[1] ?? '')]);
    for (const [name, text] of documents) {
      expect([name, leaks(text)]).toEqual([name, []]);
      expect([name, text.includes(SESSION.name)]).toEqual([name, true]);
      expect([name, text.includes(SESSION.phone) && text.includes(SESSION.email)]).toEqual([name, true]);
      expect([name, /Licensed Real Estate (Broker|Agent)/.test(text)]).toEqual([name, false]);
      expect([name, text.includes(COMMISSION)]).toEqual([name, false]);
    }
  });

  it('the agent info sheet is the signed-in agent\'s (a client is handed it), with no title the session does not carry, and says when it was printed, not when the data was updated', () => {
    let written = '';
    f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
    f.w.generateAgentInfoSheet();
    const text = textOf(f, written);
    expect(leaks(text)).toEqual([]);
    for (const mark of [SESSION.name, SESSION.phone, SESSION.email, SESSION.license]) expect(text).toContain(mark);
    expect(text).not.toMatch(/Licensed Real Estate Agent|Data last updated/);
    expect(text).toMatch(/Printed [A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(written).not.toMatch(/attached agent info sheet/);
    expect(written).toContain('e.innerText');                                         // the e-mail button's body is built from the sheet's own text
  });
});

describe.each(PAGES)('$file: a session that carries less than a full profile', (p) => {
  const THIN = { id: 'AG-7', name: 'Thin Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' };

  it('prints and e-mails what the session has, makes up nothing, and never falls back to the listing agent', async () => {
    const f = await open(p, { user: THIN });
    try {
      const data = (f.w as any)[p.collect]();
      expect([data.updatingAgent, data.updatingPhone, data.updatingEmail]).toEqual([THIN.name, '', '']);
      const card = textOf(f, (f.w as any)[p.card](data));
      expect(card).toContain(THIN.name);
      expect(card).not.toContain('--');
      expect(leaks(card)).toEqual([]);
      const plain: string = (f.w as any)[p.plain](data);
      expect(plain).toContain('646-258-4460 | info@mallan.nyc');                    // the firm's own general line stands in for a phone and an e-mail the agent does not have
      expect(plain).not.toContain('--');
      expect(leaks(plain)).toEqual([]);
      (f.d.getElementById(`${p.prefix}ListingAgentLicense`) as HTMLElement).textContent = 'LIC-LISTING-777';      // what the Contacts tab's panel shows for the listing agent
      let written = '';
      f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
      f.w.generateAgentInfoSheet();
      const sheet = textOf(f, written);
      expect(sheet).toContain(THIN.name);
      expect(leaks(sheet)).toEqual([]);                                             // the sheet's phone, e-mail and license are "--", not the listing agent's
      expect(sheet).not.toContain('LIC-LISTING-777');
      expect((sheet.match(/--/g) ?? []).length).toBeGreaterThanOrEqual(3);
    } finally { f.close(); }
  });

  it('with no signed-in name at all, nothing stands in for it', async () => {
    const f = await open(p, { user: { id: 'AG-1', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } });
    try {
      const data = (f.w as any)[p.collect]();
      expect(data.updatingAgent).toBe('');
      const print = textOf(f, (f.w as any)[p.build](data, SECTIONS, { branding: true, landscape: false, preset: 'client' }));
      expect(print).toContain(`Prepared by ${SESSION.companyName}`);
      expect(print).not.toMatch(/Prepared by --|\| --/);
      expect(leaks(print)).toEqual([]);
      const card = textOf(f, (f.w as any)[p.card](data));
      expect(card).not.toContain('--');
      expect(card).toContain(SESSION.companyName);
      const plain: string = (f.w as any)[p.plain](data);
      expect(leaks(plain)).toEqual([]);
      expect(plain).not.toContain('--');
      expect(plain.split('\n')).toContain(SESSION.companyName);                      // the company alone is the sender line
      if (p.inline) expect(textOf(f, (f.w as any)[p.inline](data))).not.toContain('--');
      let written = '';
      f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
      f.w.generateAgentInfoSheet();
      expect(leaks(textOf(f, written))).toEqual([]);                                 // the sheet of a session with no name does not borrow the listing agent's (an id was once taken for a name)
    } finally { f.close(); }
  });

  it('a record with no listing agent has none: the panel\'s "--" is not a name, an id, a phone, an e-mail or an office', async () => {
    const f = await open(p, { listing: { id: '9', listing_id: 'SL-0009', status: 'Active', list_price: '900000', raw_data: {} } });
    try {
      expect((f.w as any)[p.collect]().listingAgent).toEqual({ name: '', mlsId: '', phone: '', email: '', office: '' });
    } finally { f.close(); }
  });
});

describe('RENTAL-FORM-WITH-TOOLS: the open house sign-in sheet is the signed-in agent\'s, and leaves what it does not know blank', () => {
  const sheet = async (user: Record<string, unknown>, listing: Record<string, unknown>) => {
    const f = bootViewer('RENTAL-FORM-WITH-TOOLS', { listing, user });
    await until(() => rendered(f.d), 15000);
    await sleep(400);
    const parts: string[] = [];
    const real = f.w.Blob;
    f.w.Blob = class extends real { constructor(p: BlobPart[], o?: BlobPropertyBag) { super(p, o); parts.push(p.map(String).join('')); } };
    f.w.URL.createObjectURL = () => 'blob:print';
    f.w.URL.revokeObjectURL = () => undefined;
    f.w.open = () => null;
    f.w.printOpenHouseSignIn('rental');
    f.w.Blob = real;
    const values = [...parse(f, parts[0] ?? '').querySelectorAll('.info-value')].map((e) => e.textContent ?? '');      // the property, the date and the host
    return { f, text: textOf(f, parts[0] ?? ''), values };
  };

  it('names the signed-in agent as the host, never the listing agent or an id', async () => {
    const { f, text, values } = await sheet(SESSION, LISTING);
    try {
      expect(values[2]).toBe(SESSION.name);
      expect(values[0]).toBe('333 E 46th St');
      expect(leaks(text)).toEqual([]);
      expect(text).not.toContain(SESSION.id);
    } finally { f.close(); }
  });

  it('without a host or an address it does not make up "Hosting Agent" or "Property Address" as a value', async () => {
    const { f, values } = await sheet({ id: 'AG-1', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' }, { id: '9', listing_id: 'SL-0009', status: 'Active', raw_data: {} });
    try {
      expect(values[0]).toBe('');                                                    // the property: blank, to be written in
      expect(values[2]).toBe('');                                                    // the host: blank
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$file: the listing agent\'s controls are the record\'s, in a viewer and nowhere else', (p) => {
  it('hydration never writes a signed-in agent control, however the record names its agent (view mode)', async () => {
    const f = await open(p, { user: { id: 'AG-2', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } });     // a session with only an id and a company
    try {
      expect(val(f, `${p.prefix}UpdatingAgentName`)).toBe('');                       // blank: nothing is borrowed from the record
      expect(val(f, `${p.prefix}UpdatingAgentPhone`)).toBe('');
      expect(val(f, `${p.prefix}UpdatingAgentEmail`)).toBe('');
      expect(val(f, `${p.prefix}UpdatingAgentCompanyName`)).toBe('Mallan Real Estate Inc.');
    } finally { f.close(); }
  });
});
