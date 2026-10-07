/// <reference types="jest" />
/**
 * The Tools viewers (SALE-FORM-WITH-TOOLS.html, RENTAL-FORM-WITH-TOOLS.html) show a stored listing and hand out documents built from it: a print, an e-mail card, the text of an
 * e-mail, the body of the mail client's draft, the Preview tab. Each of them says what the record says, and nothing the record does not:
 *   - the Sale tax is the ANNUAL tax (live Cotality TaxAnnualAmount): it is said as annual, never "/mo"; the association fee carries the frequency the record stores
 *     (AssociationFeeFrequency), and a record without a known one says nothing after the fee;
 *   - a price, a rent, a fee or a tax that is not above zero (0, a negative, text) is no amount: nothing is printed for it, never "$0", "$-5" or "$NaN";
 *   - a description is cut by characters, never in the middle of an emoji, and half an emoji that was stored does not stop the E-mail button (encodeURIComponent throws on it);
 *   - an entry of the record's media list that is not a record does not stop the viewer from opening the listing;
 *   - the Preview tab does not make up what the record does not say: a state, a slug, a license, a photo count, a distribution.
 * Every document is built by the REAL page.
 */
import { bootViewer, rendered, isFailScreen, sleep, until, type Booted, type ViewerFile } from './tools-viewer-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const SESSION = { id: 'AG-9', name: 'Sender Agent', phone: '212-555-0199', email: 'sender@example.test', license: 'L-123', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' };
const SECTIONS = ['agentInfo', 'classification', 'address', 'pricing', 'rooms', 'features', 'utilities', 'building', 'amenities', 'policies', 'distribution', 'description', 'photos'];
const ADDRESS = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'St', City: 'New York', StateOrProvince: 'NY', PostalCode: '10017' };

const parse = (f: Booted, html: string) => new f.w.DOMParser().parseFromString(html, 'text/html') as Document;
const textOf = (f: Booted, html: string) => parse(f, html).body.textContent ?? '';
const shown = (f: Booted, id: string) => (f.d.getElementById(id) as HTMLElement | null)?.textContent ?? '';
const val = (f: Booted, id: string) => (f.d.getElementById(id) as HTMLInputElement | null)?.value ?? '';

/** A Sale record; `features` and `raw_data` given in `over` are merged over the defaults. */
function saleRecord(over: Record<string, any> = {}) {
  const { features, raw_data, ...rest } = over;
  return {
    id: '404', listing_id: 'SL-0404', status: 'Active', list_price: '1250000', bedrooms_total: 2, bathrooms_full: 1, living_area: '1234', postal_code: '10017', borough: 'Manhattan', property_type: 'Residential',
    address: ADDRESS,
    features: { PublicRemarks: 'A bright two bedroom.', TaxAnnualAmount: 18000, ...(features ?? {}) },
    raw_data: { PublicRemarks: 'A bright two bedroom.', AssociationFee: 1250.5, AssociationFeeFrequency: 'Monthly', ...(raw_data ?? {}) },
    updated_at: '2026-03-02T00:00:00.000Z',
    ...rest,
  };
}
/** A Rental record. */
function rentalRecord(over: Record<string, any> = {}) {
  const { features, raw_data, ...rest } = over;
  return {
    id: '505', listing_id: 'RL-0505', status: 'Active', list_price: '4200', bedrooms_total: 2, bathrooms_full: 1, living_area: '900', postal_code: '10017', borough: 'Manhattan', property_type: 'Residential Lease',
    address: ADDRESS,
    features: { PublicRemarks: 'A bright two bedroom.', ...(features ?? {}) },
    raw_data: { PublicRemarks: 'A bright two bedroom.', SecurityDeposit: 4200, ...(raw_data ?? {}) },
    updated_at: '2026-03-02T00:00:00.000Z',
    ...rest,
  };
}

type Page = {
  file: ViewerFile; prefix: 'sale' | 'rental'; record: (over?: Record<string, any>) => Record<string, any>; collect: string; build: string; card: string; inline: string | null; plain: string; sendMail: string;
  emailTo: string; preview: string; openEmail: string; copy: string;
};
const PAGES: Page[] = [
  { file: 'SALE-FORM-WITH-TOOLS', prefix: 'sale', record: saleRecord, collect: 'collectSalePrintData', build: 'buildSalePrintHTML', card: 'buildSaleEmailCardHTML', inline: 'buildSaleEmailInlineHTML', plain: 'getSalePlainTextSummary',
    sendMail: 'openSaleInEmailClient', emailTo: 'saleEmailTo', preview: 'updateSalePreview', openEmail: 'openSaleEmailModal', copy: 'copySaleEmailToClipboard' },
  { file: 'RENTAL-FORM-WITH-TOOLS', prefix: 'rental', record: rentalRecord, collect: 'collectRentalPrintData', build: 'buildRentalPrintHTML', card: 'buildRentalEmailCardHTML', inline: null, plain: 'getRentalPlainTextSummary',
    sendMail: 'openRentalInEmailClient', emailTo: 'rentalEmailTo', preview: 'updateRentalPreview', openEmail: 'openRentalEmailModal', copy: 'copyRentalEmailToClipboard' },
];

async function open(file: ViewerFile, listing: Record<string, any>): Promise<Booted> {
  const f = bootViewer(file, { listing, user: SESSION });
  await until(() => rendered(f.d), 15000);
  await sleep(400);
  return f;
}

/** Every document the page can build from its record, as text (and the plain text, and the Preview tab's lines). */
function documents(f: Booted, p: Page): Record<string, string> {
  const data = (f.w as any)[p.collect]();
  const docs: Record<string, string> = {
    print: textOf(f, (f.w as any)[p.build](data, SECTIONS, { branding: true, landscape: false, preset: 'full' })),
    card: textOf(f, (f.w as any)[p.card](data)),
    plain: (f.w as any)[p.plain](data),
  };
  if (p.inline) docs.inline = textOf(f, (f.w as any)[p.inline](data));
  (f.w as any)[p.preview]();
  docs.preview = [...f.d.querySelectorAll('[id^="' + p.prefix + 'Preview"]')].map((e) => e.textContent ?? '').join(' | ');
  return docs;
}

/** What the E-mail button puts on the clipboard: the card as HTML, and the plain text. */
async function clipboardDocuments(f: Booted, p: Page): Promise<[string, string]> {
  const parts: string[] = [];
  const real = f.w.Blob;
  f.w.Blob = class extends real { constructor(x: BlobPart[], o?: BlobPropertyBag) { super(x, o); parts.push(x.map(String).join('')); } };
  Object.defineProperty(f.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
  f.w.ClipboardItem = class { constructor(public items: unknown) {} };
  (f.w as any)[p.copy]();
  await sleep(50);                                       // (the page answers the copy with a toast; the window must still be open)
  f.w.Blob = real;
  return [textOf(f, parts[0] ?? ''), parts[1] ?? ''];
}

// ── Money──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('SALE-FORM-WITH-TOOLS: the tax is the annual tax, and the fee has the frequency the record stores', () => {
  let f: Booted;
  beforeAll(async () => { f = await open('SALE-FORM-WITH-TOOLS', saleRecord()); });
  afterAll(() => f.close());

  it('boots on the record without a page error, with the tax and the fee in their controls', () => {
    expect(f.errors).toEqual([]);
    expect(val(f, 'saleRETaxes')).toBe('18000');
    expect(val(f, 'saleMaintCC')).toBe('1250.5');
    expect(val(f, 'saleMaintCCFreq')).toBe('Monthly');
    expect(textOf(f, (f.d.querySelector('label[for="saleRETaxes"]') ?? f.d.getElementById('saleRETaxes')!.closest('div')!.querySelector('label'))!.outerHTML)).toMatch(/RE Taxes \(Annual\)/);
  });

  it('the print says the tax is annual and the fee monthly', () => {
    const data = (f.w as any).collectSalePrintData();
    expect(data.maintFrequency).toBe('Monthly');
    const text = textOf(f, (f.w as any).buildSalePrintHTML(data, ['pricing'], { branding: false, landscape: false, preset: 'client' }));
    expect(text).toContain('RE Taxes (annual)');
    expect(text).toContain('$18,000/yr');
    expect(text).toContain('$1,250.5/mo');
    expect(text).not.toMatch(/18,000\/mo/);
  });

  it('the e-mail card, the clipboard HTML, the plain text and the mail client\'s body say the same', async () => {
    const data = (f.w as any).collectSalePrintData();
    const card = textOf(f, (f.w as any).buildSaleEmailCardHTML(data));
    const inline = textOf(f, (f.w as any).buildSaleEmailInlineHTML(data));
    const plain: string = (f.w as any).getSalePlainTextSummary(data);
    for (const [name, text] of [['card', card], ['inline', inline]] as const) {
      expect([name, text.includes('Tax: $18,000/yr')]).toEqual([name, true]);
      expect([name, text.includes('Maint: $1,250.5/mo')]).toEqual([name, true]);
      expect([name, /18,000\/mo/.test(text)]).toEqual([name, false]);
    }
    expect(plain).toContain('RE Taxes (annual): $18,000/yr');
    expect(plain).toContain('Maint/CC: $1,250.5/mo');
    expect(plain).not.toMatch(/18,000\/mo/);
    let opened = '';
    f.w.open = (u: string) => { opened = u; return null; };
    Object.defineProperty(f.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
    f.w.ClipboardItem = class { constructor(public items: unknown) {} };
    (f.d.getElementById('saleEmailTo') as HTMLInputElement).value = 'buyer@example.test';
    (f.w as any).openSaleInEmailClient();
    await sleep(50);
    const body = new URL(opened).searchParams.get('body') ?? '';
    expect(body).toContain('RE Taxes (annual): $18,000/yr');
    expect(body).toContain('Maint/CC: $1,250.5/mo');
  });

  it('the Preview tab says the same, in the summary and on the public page', () => {
    (f.w as any).updateSalePreview();
    expect(shown(f, 'salePreviewTaxes')).toBe('$18,000/yr');
    expect(shown(f, 'salePreviewMaint')).toBe('$1,250.5/mo');
    expect(shown(f, 'salePreviewPrice')).toBe('$1,250,000');
  });

  it('a fee that is paid another way is said that way in every document, and never as monthly', async () => {
    const g = await open('SALE-FORM-WITH-TOOLS', saleRecord({ raw_data: { AssociationFeeFrequency: 'Quarterly' } }));
    try {
      const data = (g.w as any).collectSalePrintData();
      expect(data.maintFrequency).toBe('Quarterly');
      const print = textOf(g, (g.w as any).buildSalePrintHTML(data, ['pricing'], { branding: false, landscape: false, preset: 'client' }));
      const card = textOf(g, (g.w as any).buildSaleEmailCardHTML(data));
      const inline = textOf(g, (g.w as any).buildSaleEmailInlineHTML(data));
      const plain: string = (g.w as any).getSalePlainTextSummary(data);
      expect(print).toContain('$1,250.5/qtr');
      expect(card).toContain('Maint: $1,250.5/qtr');
      expect(inline).toContain('Maint: $1,250.5/qtr');
      expect(plain).toContain('Maint/CC: $1,250.5/qtr');
      for (const text of [print, card, inline, plain]) expect(text).not.toContain('1,250.5/mo');
      (g.w as any).updateSalePreview();
      expect(shown(g, 'salePreviewMaint')).toBe('$1,250.5/qtr');
    } finally { g.close(); }
  });

  it('the public page\'s co-op panel says the tax is annual too', async () => {
    const g = await open('SALE-FORM-WITH-TOOLS', saleRecord({ raw_data: { salePropertyType: 'Coop' } }));
    try {
      const coop = g.d.querySelector('input[name="salePropertyType"][value="Coop"]') as HTMLInputElement;
      coop.checked = true;
      (g.w as any).updateSalePreview();
      expect(shown(g, 'salePreviewSiteTaxes')).toBe('$18,000/yr');
      expect(shown(g, 'salePreviewSiteMaint')).toBe('$1,250.5/mo');
    } finally { g.close(); }
  });

  it.each([
    ['Monthly', '/mo'], ['Quarterly', '/qtr'], ['Annually', '/yr'], ['SemiAnnually', 'every 6 months'], ['Weekly', '/wk'], ['BiWeekly', 'every 2 weeks'],
    ['SemiMonthly', 'twice a month'], ['BiMonthly', 'every 2 months'], ['Seasonal', 'per season'], ['Daily', '/day'], ['OneTime', 'one time'],
  ])('a fee that is %s is said as "%s"', (frequency, said) => {
    const text: string = (f.w as any).saleMaintenanceText(1250, frequency);
    expect(text).toBe('$1,250' + (said.startsWith('/') ? said : ' ' + said));
  });

  it.each([[''], [undefined], [null], [5], ['Fortnightly'], ['monthly'], ['constructor'], ['__proto__'], ['toString'], ['hasOwnProperty'], ['valueOf']])('a fee frequency that is %p is not one: the fee stands alone', (frequency) => {
    expect((f.w as any).saleMaintenanceText(1250, frequency)).toBe('$1,250');
  });

  it.each([[0], [-5], ['-0.5'], ['abc'], [''], [null], [undefined], [NaN], [{}], [[]]])('an amount that is %p is no amount', (amount) => {
    expect((f.w as any).saleMoney(amount)).toBe('');
    expect((f.w as any).saleTaxText(amount)).toBe('');
    expect((f.w as any).saleMaintenanceText(amount, 'Monthly')).toBe('');
  });
});

describe.each(PAGES)('$file: an amount that is not above zero is no amount in any document', (p) => {
  it('prints and e-mails nothing for a price, a rent, a fee or a tax of 0 or less', async () => {
    const record = p.prefix === 'sale'
      ? saleRecord({ list_price: 0, features: { TaxAnnualAmount: -18000 }, raw_data: { AssociationFee: 0 } })
      : rentalRecord({ list_price: -4200, raw_data: { SecurityDeposit: 'abc' } });
    const f = await open(p.file, record);
    try {
      expect(f.errors).toEqual([]);
      const docs = documents(f, p);
      for (const [name, text] of Object.entries(docs)) {
        expect([name, /\$\s*-|\$\s*NaN|\$0(?![.,\d])/.test(text)]).toEqual([name, false]);
      }
      const data = (f.w as any)[p.collect]();
      const print = textOf(f, (f.w as any)[p.build](data, ['pricing'], { branding: false, landscape: false, preset: 'client' }));
      expect(print).not.toMatch(/\/mo|\/yr/);
    } finally { f.close(); }
  });

  it('whatever the price control holds (typed, or left by the record), 0 or less is no price: no hero in the print, no price on the sheet an agent hands out', async () => {
    const f = await open(p.file, p.record());
    try {
      const priceId = p.prefix === 'sale' ? 'salePrice' : 'rentalMonthlyRent';
      for (const bad of ['0', '-5', 'abc', '']) {
        (f.d.getElementById(priceId) as HTMLInputElement).value = bad;
        const data = (f.w as any)[p.collect]();
        const hero = parse(f, (f.w as any)[p.build](data, SECTIONS, { branding: false, landscape: false, preset: 'client' })).querySelector('.print-price');
        expect([bad, hero]).toEqual([bad, null]);
        let written = '';
        f.w.open = () => ({ opener: 1, document: { write: (h: string) => { written += h; }, close: () => undefined } });
        (f.w as any).generateAgentInfoSheet();
        expect([bad, /\$\s*-|\$\s*NaN|\$0(?![.,\d])/.test(textOf(f, written))]).toEqual([bad, false]);
        (f.w as any)[p.openEmail]();
        expect(val(f, p.prefix + 'EmailSubject')).not.toContain('$');                                    // the subject of the e-mail carries no price either
        const [clipboardHtml, clipboardText] = await clipboardDocuments(f, p);                                 // nor does what the E-mail button puts on the clipboard
        expect([bad, /\$\s*-|\$\s*NaN|\$0(?![.,\d])/.test(clipboardHtml + clipboardText)]).toEqual([bad, false]);
      }
      (f.d.getElementById(priceId) as HTMLInputElement).value = '1500';
      const data = (f.w as any)[p.collect]();
      expect(parse(f, (f.w as any)[p.build](data, SECTIONS, { branding: false, landscape: false, preset: 'client' })).querySelector('.print-price')?.textContent).toBe(p.prefix === 'sale' ? '$1,500' : '$1,500/mo');
      (f.w as any)[p.openEmail]();
      expect(val(f, p.prefix + 'EmailSubject')).toContain(p.prefix === 'sale' ? '$1,500' : '$1,500/mo');
      expect((await clipboardDocuments(f, p))[0]).toContain(p.prefix === 'sale' ? '$1,500' : '$1,500/mo');
    } finally { f.close(); }
  });
});

describe('RENTAL-FORM-WITH-TOOLS: the rent and the deposit', () => {
  let f: Booted;
  beforeAll(async () => { f = await open('RENTAL-FORM-WITH-TOOLS', rentalRecord()); });
  afterAll(() => f.close());

  it('say what the record says in the print and in every e-mail document', () => {
    const docs = documents(f, PAGES[1]);
    expect(docs.print).toContain('$4,200/mo');
    expect(docs.print).toContain('$4,200');                                              // the deposit
    for (const name of ['card', 'plain']) expect([name, docs[name].includes('$4,200/mo')]).toEqual([name, true]);
  });

  it('prints a security deposit of 0 as a deposit of $0 (no deposit), and no deposit at all when the record has none', async () => {
    const zero = await open('RENTAL-FORM-WITH-TOOLS', rentalRecord({ raw_data: { SecurityDeposit: 0 } }));
    const none = await open('RENTAL-FORM-WITH-TOOLS', rentalRecord({ raw_data: { SecurityDeposit: '' } }));
    try {
      const deposit = (g: Booted) => [...parse(g, (g.w as any).buildRentalPrintHTML((g.w as any).collectRentalPrintData(), ['pricing'], { branding: false, landscape: false, preset: 'client' })).querySelectorAll('.print-field')]
        .filter((row) => /Security Deposit/.test(row.querySelector('.print-label')?.textContent ?? '')).map((row) => row.querySelector('.print-value')?.textContent ?? '');
      expect(deposit(zero)).toEqual(['$0']);
      expect(deposit(none)).toEqual([]);
    } finally { zero.close(); none.close(); }
  });

  it('a security deposit of 0 is a deposit (no deposit), and a rent of 0 is no rent', () => {
    expect((f.w as any).rentalMoney(0, '', true)).toBe('$0');
    expect((f.w as any).rentalMoney(0, '/mo')).toBe('');
    expect((f.w as any).rentalMoney(-1, '', true)).toBe('');
    expect((f.w as any).rentalMoney('abc', '', true)).toBe('');
    expect((f.w as any).rentalMoney(4200.5, '/mo')).toBe('$4,200.5/mo');
  });
});

// ── The description in the mail client ─────────────────────────────────────────────────────────────────────────────────────────────────

describe.each(PAGES)('$file: the E-mail button and a description that has an emoji where it is cut', (p) => {
  const EMOJI = '\u{1F600}';
  const mail = async (description: string, to = 'buyer@example.test') => {
    const f = await open(p.file, p.record({ features: { PublicRemarks: description }, raw_data: { PublicRemarks: description } }));
    let opened = '';
    f.w.open = (u: string) => { opened = u; return null; };
    Object.defineProperty(f.w.navigator, 'clipboard', { value: { write: () => Promise.resolve(), writeText: () => Promise.resolve() }, configurable: true });
    f.w.ClipboardItem = class { constructor(public items: unknown) {} };
    (f.d.getElementById(p.emailTo) as HTMLInputElement).value = to;
    return { f, opened: () => opened };
  };

  it('keeps an emoji whole where the text is cut for the card (200) and for the mail body (300)', async () => {
    const description = 'x'.repeat(199) + EMOJI + 'tail of the description';
    const { f, opened } = await mail(description);
    try {
      const data = (f.w as any)[p.collect]();
      const card = textOf(f, (f.w as any)[p.card](data));
      expect(card).toContain('x'.repeat(199) + EMOJI + '...');                           // 200 characters, the emoji one of them
      (f.w as any)[p.sendMail]();
      await sleep(50);
      expect(opened()).toMatch(/^mailto:/);
      expect(new URL(opened()).searchParams.get('body')).toContain('x'.repeat(199) + EMOJI);
    } finally { f.close(); }
  });

  it('keeps an emoji whole where the plain text is cut at 300', async () => {
    const description = 'y'.repeat(299) + EMOJI + 'tail of the description';
    const { f, opened } = await mail(description);
    try {
      (f.w as any)[p.sendMail]();
      await sleep(50);
      const body = new URL(opened()).searchParams.get('body') ?? '';
      expect(body).toContain('y'.repeat(299) + EMOJI + '\n');                            // 300 characters, the emoji one of them, and the line ends there
      expect(body).not.toContain('tail');
    } finally { f.close(); }
  });

  it('opens the mail client for a stored description that is half an emoji, and says what it can instead', async () => {
    const { f, opened } = await mail('before \uD83D after');
    try {
      expect(() => (f.w as any)[p.sendMail]()).not.toThrow();
      await sleep(50);
      expect(opened()).toMatch(/^mailto:/);
      expect(new URL(opened()).searchParams.get('body')).toContain('before \uFFFD after');
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('opens the mail client for an address, a copy address and a subject that are half an emoji too', async () => {
    const { f, opened } = await mail('A bright two bedroom.', 'agent\uDE00@example.test');
    try {
      (f.d.getElementById(p.prefix + 'EmailCC') as HTMLInputElement).value = 'copy\uD83D@example.test';
      (f.d.getElementById(p.prefix + 'EmailSubject') as HTMLInputElement).value = 'Listing \uD83D 333 E 46th St';
      (f.d.getElementById(p.prefix + 'EmailMessage') as HTMLTextAreaElement).value = 'Hello \uD83D there';
      expect(() => (f.w as any)[p.sendMail]()).not.toThrow();
      await sleep(50);
      expect(opened()).toMatch(/^mailto:agent%EF%BF%BD%40example\.test\?subject=/);
      const url = new URL(opened());
      expect(url.searchParams.get('subject')).toBe('Listing � 333 E 46th St');
      expect(url.searchParams.get('cc')).toBe('copy�@example.test');
      expect(url.searchParams.get('body')).toMatch(/^Hello � there\n\n/);                  // the message the agent wrote above the listing
    } finally { f.close(); }
  });

  it('cuts the text it builds from a description that is half an emoji without throwing', async () => {
    const f = await open(p.file, p.record({ raw_data: { PublicRemarks: 'z'.repeat(199) + '\uD83D' + 'z'.repeat(150) }, features: { PublicRemarks: 'z'.repeat(199) + '\uD83D' + 'z'.repeat(150) } }));
    try {
      const data = (f.w as any)[p.collect]();
      expect(() => (f.w as any)[p.card](data)).not.toThrow();
      expect(() => (f.w as any)[p.plain](data)).not.toThrow();
      if (p.inline) expect(() => (f.w as any)[p.inline!](data)).not.toThrow();
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$file: the text helpers of the e-mail', (p) => {
  let f: Booted;
  beforeAll(async () => { f = await open(p.file, p.record()); });
  afterAll(() => f.close());

  it.each([
    ['plain text', 'plain text'], ['', ''], [null, ''], [undefined, ''], [7, '7'],
    ['\u{1F600}', '\u{1F600}'], ['𐀀', '𐀀'], ['􏿿', '􏿿'],                       // whole pairs, at the ends of both ranges
    ['\uD800', '�'], ['\uDBFF', '�'], ['\uDC00', '�'], ['\uDFFF', '�'],                                // halves, at the ends of both ranges
    ['a\uD83Db', 'a�b'], ['a\uDE00b', 'a�b'], ['\uDE00\uD83D', '��'], ['\uD83D😀', '�\u{1F600}'],
    ['퟿', '퟿'],                                                                                      // the characters next to the surrogates are not halves
  ])('makes %j well-formed as %j', (text, expected) => {
    expect((f.w as any).wellFormed(text)).toBe(expected);
  });

  it('encodes a half of an emoji for the mail client instead of throwing, and cuts and counts by characters', () => {
    const w = f.w as any;
    expect(w.uriText('a b&c')).toBe('a%20b%26c');
    expect(w.uriText('x\uD83D')).toBe('x%EF%BF%BD');
    expect(w.uriText(null)).toBe('');
    expect(w.textHead('abcdef', 3)).toBe('abc');
    expect(w.textHead('abc', 10)).toBe('abc');
    expect(w.textHead('a\u{1F600}b', 2)).toBe('a\u{1F600}');
    expect(w.textHead('a\uD83Db', 2)).toBe('a�');
    expect(w.textHead(null, 5)).toBe('');
    expect(w.textLength('a\u{1F600}b')).toBe(3);
    expect(w.textLength('\uD83D')).toBe(1);
    expect(w.textLength(undefined)).toBe(0);
  });

  it('puts "..." after a description only when it is longer than the 200 characters shown', async () => {
    const card = async (description: string) => {
      const g = await open(p.file, p.record({ features: { PublicRemarks: description }, raw_data: { PublicRemarks: description } }));
      try { return textOf(g, (g.w as any)[p.card]((g.w as any)[p.collect]())); } finally { g.close(); }
    };
    expect(await card('d'.repeat(200))).toContain('"' + 'd'.repeat(200) + '"');                                          // exactly 200: all of it, no dots
    expect(await card('d'.repeat(201))).toContain('"' + 'd'.repeat(200) + '..."');                                       // 201: the first 200 and the dots
  });
});

// ── The media list ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe.each(PAGES)('$file: a media list with entries that are not records', (p) => {
  it('opens the listing, and uses the entries that are', async () => {
    const f = bootViewer(p.file, { listing: p.record({ media: [null, 5, 'junk', [1], { url: 'https://example.test/1.jpg' }, { url: 7 }, { url: 'javascript:alert(1)' }, { url: 'https://example.test/2.jpg' }] }), user: SESSION });
    try {
      await until(() => rendered(f.d) || isFailScreen(f.d), 15000);
      await sleep(400);
      expect(isFailScreen(f.d)).toBe(false);
      expect(rendered(f.d)).toBe(true);
      expect(f.errors).toEqual([]);
      expect((f.w as any).getListingPhotoUrls(p.prefix)).toEqual(['https://example.test/1.jpg', 'https://example.test/2.jpg']);
      (f.w as any)[p.preview]();
      expect(shown(f, p.prefix === 'sale' ? 'salePreviewPhotos' : 'rentalPreviewPhotos')).toBe('2 photos');
    } finally { f.close(); }
  });
});

// ── The wording check ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('SALE-FORM-WITH-TOOLS: the wording check on a page that does not carry the Fair Housing word list', () => {
  it('says nothing rather than stopping, and does not claim there is nothing to find', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', saleRecord());
    try {
      expect(typeof (f.w as any).FAIR_HOUSING_VIOLATIONS).toBe('undefined');            // this viewer has no list to check against
      const description = f.d.getElementById('saleDescription') as HTMLTextAreaElement;
      description.value = 'A quiet apartment for a family. The wording is anything the agent reads, and it is longer than twenty characters.';
      expect(() => (f.w as any)._performComplianceCheck('saleDescription', 'saleFairHousingFlags')).not.toThrow();
      const flags = f.d.getElementById('saleFairHousingFlags') as HTMLElement;
      expect(flags.classList.contains('hidden')).toBe(true);
      expect(flags.textContent).toBe('');
      expect(flags.innerHTML).not.toMatch(/No compliance violations detected/);
      description.dispatchEvent(new f.w.Event('input', { bubbles: true }));
      await sleep(450);                                                                   // the debounce
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });
});

describe.each(PAGES)('$file: the Preview tab before anyone opens it', (p) => {
  it('has no sentence about the future and no made-up slug in the lines the record fills in', async () => {
    const f = await open(p.file, p.record({ features: { PublicRemarks: '' }, raw_data: { PublicRemarks: '' } }));
    try {
      const ids = p.prefix === 'sale' ? ['salePreviewDesc', 'salePreviewSiteSlug', 'salePreviewSiteDesc'] : ['rentalPreviewCRMDesc', 'previewDescription', 'rentalPreviewSiteSlug', 'rentalPreviewSiteDesc'];
      for (const id of ids) expect([id, shown(f, id).trim()]).toEqual([id, '--']);
    } finally { f.close(); }
  });
});

// ── The Preview tab────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The text of a distribution badge (the viewer replaces each distribution checkbox with one), as the Preview tab lists it. */
const badge = (f: Booted, id: string) => f.d.querySelector(`[data-for="${id}"]`) as HTMLElement;
const badgeText = (f: Booted, id: string) => (badge(f, id).textContent ?? '').trim().split('\n')[0].trim();
const badgeState = (f: Booted, id: string) => badge(f, id).getAttribute('data-state');

describe('RENTAL-FORM-WITH-TOOLS: the Preview tab says what the record says', () => {
  const RECORD = rentalRecord({
    slug: '333-e-46th-st-12b',
    media: [{ url: 'https://example.test/1.jpg' }, { url: 'https://example.test/2.jpg' }, { url: 'https://example.test/3.jpg' }],
    address: { ...ADDRESS, StateOrProvince: 'NJ', PostalCode: '07030' },
    postal_code: '07030',
    idx_display_yn: true,
    raw_data: { rentalSyndicateYN: false },       // a control the record keys by its id
  });
  let f: Booted;
  beforeAll(async () => { f = await open('RENTAL-FORM-WITH-TOOLS', RECORD); (f.w as any).updateRentalPreview(); });
  afterAll(() => f.close());

  it("counts the record's own photos", () => {
    expect(shown(f, 'rentalPreviewPhotos')).toBe('3 photos');
  });

  it('says the state the record stores, with the zip, and not a state of its own', () => {
    expect(shown(f, 'rentalPreviewSiteNeighborhood')).toContain('NJ 07030');
    expect(shown(f, 'rentalPreviewSiteNeighborhood')).not.toMatch(/NY/);
  });

  it('shows the slug the record stores', () => {
    expect(shown(f, 'rentalPreviewSiteSlug')).toBe('333-e-46th-st-12b');
  });

  it('lists the distribution flags the record sets (the viewer shows each as a badge), and not the ones it clears', () => {
    expect(badgeState(f, 'rentalIDXEntireListingDisplayYN')).toBe('yes');
    expect(badgeState(f, 'rentalSyndicateYN')).toBe('no');
    const listed = shown(f, 'rentalPreviewDistro').split(', ');
    expect(listed).toContain(badgeText(f, 'rentalIDXEntireListingDisplayYN'));
    expect(listed).not.toContain(badgeText(f, 'rentalSyndicateYN'));
  });

  it("shows the listing URL control's value, and the listing agent's license (the public page names the listing agent, not the signed-in one)", () => {
    (f.d.getElementById('rentalListingUrl') as HTMLInputElement).value = 'https://mallan.nyc/listing/x';
    (f.d.getElementById('rentalListingAgentLicense') as HTMLElement).textContent = 'RE-777';      // what the Contacts tab's panel shows for the listing agent
    (f.w as any).updateRentalPreview();
    expect(shown(f, 'rentalPreviewCRMURL')).toBe('https://mallan.nyc/listing/x');
    expect(shown(f, 'rentalPreviewSiteAgentLicense')).toBe('RE-777');
    expect(val(f, 'rentalUpdatingAgentLicense')).toBe(SESSION.license);                         // the signed-in agent has a license of their own, and it is not the one shown
  });

  it("says '--' for what the record does not have: a distribution, a description, a slug, photos", async () => {
    const g = await open('RENTAL-FORM-WITH-TOOLS', rentalRecord({ features: { PublicRemarks: '' }, raw_data: { PublicRemarks: '' }, address: { ...ADDRESS, StateOrProvince: undefined } }));
    try {
      (g.w as any).updateRentalPreview();
      expect(shown(g, 'rentalPreviewDistro')).toBe('--');
      expect(shown(g, 'rentalPreviewCRMDesc')).toBe('--');
      expect(shown(g, 'previewDescription')).toBe('--');
      expect(shown(g, 'rentalPreviewSiteDesc')).toBe('--');
      expect(shown(g, 'rentalPreviewSiteSlug')).toBe('--');
      expect(shown(g, 'rentalPreviewPhotos')).toBe('0 photos');
      expect(shown(g, 'rentalPreviewSiteNeighborhood')).not.toMatch(/NY/);                    // a record without a state does not get one
    } finally { g.close(); }
  });

  it('says one photo in the singular', async () => {
    const g = await open('RENTAL-FORM-WITH-TOOLS', rentalRecord({ media: [{ url: 'https://example.test/only.jpg' }] }));
    try {
      (g.w as any).updateRentalPreview();
      expect(shown(g, 'rentalPreviewPhotos')).toBe('1 photo');
    } finally { g.close(); }
  });
});

describe('SALE-FORM-WITH-TOOLS: the Preview tab says what the record says', () => {
  it('lists the distribution flags the record sets, shows the slug it stores, and its description', async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', saleRecord({ slug: '333-e-46th-st-12b', idx_display_yn: true, raw_data: { SyndicateYN: false } }));
    try {
      (f.w as any).updateSalePreview();
      expect(badgeState(f, 'saleDist_IDX')).toBe('yes');
      expect(badgeState(f, 'saleSyndicateYN')).toBe('no');
      const listed = shown(f, 'salePreviewDistro').replace(/ \+\d+ more$/, '').split(', ');
      expect(listed).toContain(badgeText(f, 'saleDist_IDX'));
      expect(listed).not.toContain(badgeText(f, 'saleSyndicateYN'));
      expect(shown(f, 'salePreviewSiteSlug')).toBe('333-e-46th-st-12b');
      expect(shown(f, 'salePreviewDesc')).toBe('A bright two bedroom.');
      expect(shown(f, 'salePreviewSiteDesc')).toBe('A bright two bedroom.');
    } finally { f.close(); }
  });

  it("says '--' for what the record does not have: a distribution, a description, a slug", async () => {
    const f = await open('SALE-FORM-WITH-TOOLS', saleRecord({ features: { PublicRemarks: '' }, raw_data: { PublicRemarks: '' } }));
    try {
      (f.w as any).updateSalePreview();
      expect(shown(f, 'salePreviewDistro')).toBe('--');
      expect(shown(f, 'salePreviewDesc')).toBe('--');
      expect(shown(f, 'salePreviewSiteDesc')).toBe('--');
      expect(shown(f, 'salePreviewSiteSlug')).toBe('--');
    } finally { f.close(); }
  });
});
