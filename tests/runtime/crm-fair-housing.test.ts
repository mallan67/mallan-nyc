/// <reference types="jest" />
/**
 * The wording check of the listing forms (public/crm/js/forms/fair-housing.js).
 *
 * BLOCKED is exactly what the server refuses, and these tests hold the module to it three ways: the tables are the server's own tables (read here from the server's
 * source files), the module agrees with the real server functions on a large corpus (scanTextForFairHousing, validateListing's Fair Housing check,
 * assertRlsCompliantPayload's UCBA content rules), and a seeded random differential run. CHECK is advice: each rule has words it flags and words it must leave alone.
 * The last part drives the real Add forms.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scanTextForFairHousing, assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';
import { validateListing } from '@/lib/compliance/rebny-validator';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';
import prohibited from '../../data/compliance/prohibited-terms.json';
import { bootAddForm, sleep, type AddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const MODULE_SOURCE = read('public/crm/js/forms/fair-housing.js');

type Blocked = { group: string; law: string; text: string; index: number; length: number };
type Review = { id: string; group: string; category: string; advice: string; text: string; index: number; length: number };
type Scan = { blocked: Blocked[]; review: Review[] };
const FH: { scan: (text: string, kind: string) => Scan; rules: any; boxes: any[] } = (() => {
  const w: any = {};
  new Function('window', 'document', MODULE_SOURCE)(w, {});
  return w.MallanFairHousing;
})();

// ── the module's tables are the server's tables ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const SERVER_SOURCE = read('lib/compliance/rls-enforcement.ts');
const arrayLines = (name: string): string[] => {
  const lines = SERVER_SOURCE.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^const ${name}\\b.*=\\s*\\[`).test(l));
  expect(start).toBeGreaterThan(-1);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && !/^\];/.test(lines[i]); i++) out.push(lines[i]);
  return out;
};
const contentLines = (lines: string[]) => lines.filter((l) => !/^\s*(\/\/.*)?$/.test(l));
const literals = (name: string) => contentLines(arrayLines(name)).map((l) => {
  const m = /^\s*\/(.*)\/([a-z]*),\s*(?:\/\/.*)?$/.exec(l);
  expect(m).not.toBeNull();
  return { source: m![1], flags: m![2] };
});

describe('the tables are the server\'s own tables (this fails when they drift: regenerate with build-fair-housing.cjs)', () => {
  it('the hard-coded Fair Housing patterns are HARDCODED_FH_PATTERNS of rls-enforcement.ts, in order', () => {
    const server = contentLines(arrayLines('HARDCODED_FH_PATTERNS')).map((l) => {
      const m = /^\s*\{ pattern: \/(.*)\/([a-z]*), law: "(.*)" \},\s*$/.exec(l);
      expect(m).not.toBeNull();
      return { source: m![1], flags: m![2], law: m![3] };
    });
    expect(server.length).toBeGreaterThan(10);
    expect(FH.rules.server.hardcoded).toEqual(server);
  });

  it('the prohibited terms are data/compliance/prohibited-terms.json, category by category', () => {
    const expected = Object.fromEntries(Object.entries((prohibited as any).categories).map(([name, c]: [string, any]) => [name, { reason: c.reason, terms: c.terms }]));
    expect(FH.rules.server.terms).toEqual(expected);
  });

  it('the UCBA public-remarks patterns are the server\'s agent-info, off-market, compensation and free-service patterns', () => {
    expect(FH.rules.server.publicRemarks.agentInfo.rules).toEqual(literals('AGENT_INFO_PATTERNS'));
    expect(FH.rules.server.publicRemarks.offMarket.rules).toEqual(literals('OFF_MARKET_PATTERNS'));
    expect(FH.rules.server.publicRemarks.compensation.rules).toEqual(literals('COMPENSATION_PATTERNS'));
    expect(FH.rules.server.publicRemarks.freeService.rules).toEqual((REBNY_FIELD_TABLES as any).contentRules.freeService.map((source: string) => ({ source, flags: 'gi' })));
  });

  it('cites the same UCBA articles the server cites', () => {
    for (const [key, article] of [['agentInfo', 'Art. I, Sec. 5(C)'], ['offMarket', 'Art. I, Sec. 5(D)'], ['compensation', 'Art. I, Sec. 5(E)']] as const) {
      expect(SERVER_SOURCE).toContain(article);
      expect(FH.rules.server.publicRemarks[key].law).toContain(article.replace('Art. I, Sec.', 'Art. I Sec.'));
    }
  });
});

// ── the module agrees with the real server functions ─────────────────────────────────────────────────────────────────────────────────────────────────────
const serverFairHousing = (text: string) => scanTextForFairHousing(text).length > 0;
const serverValidator = (field: string, text: string) =>
  ((validateListing({ [field]: text } as any).errors ?? []) as string[]).some((e) => e.startsWith(`[Fair Housing] Prohibited terms found in ${field}`));
const serverUcba = (text: string) =>
  assertRlsCompliantPayload({ PublicRemarks: text } as any, { listingType: 'sale', rlsEligible: true })
    .blockers.some((b) => b.field === 'PublicRemarks' && ['AI-001', 'OM-001', 'CL-001', 'FS-001'].includes(b.code));
const clientFairHousing = (text: string, kind: string) => FH.scan(text, kind).blocked.some((f) => f.group === 'fh' || f.group === 'claims');
const clientUcba = (text: string, kind: string) => FH.scan(text, kind).blocked.some((f) => f.group === 'ucba');

// What each kind of box gets of the server: the main description (PublicRemarks) all three scans; showing instructions and agent remarks the Fair Housing scans (the
// whole-word patterns and the validator's substrings); other free text the whole-word patterns only; and the UCBA wording rules only the description.
const agrees = (text: string) => {
  expect([text, 'description', 'fh', clientFairHousing(text, 'description')]).toEqual([text, 'description', 'fh', serverFairHousing(text) || serverValidator('PublicRemarks', text)]);
  expect([text, 'description', 'ucba', clientUcba(text, 'description')]).toEqual([text, 'description', 'ucba', serverUcba(text)]);
  expect([text, 'private', 'fh', clientFairHousing(text, 'private')]).toEqual([text, 'private', 'fh', serverFairHousing(text) || serverValidator('ShowingInstructions', text)]);
  expect([text, 'private', 'ucba', clientUcba(text, 'private')]).toEqual([text, 'private', 'ucba', false]);
  expect([text, 'text', 'fh', clientFairHousing(text, 'text')]).toEqual([text, 'text', 'fh', serverFairHousing(text)]);
  expect([text, 'text', 'ucba', clientUcba(text, 'text')]).toEqual([text, 'text', 'ucba', false]);
  expect([text, 'internal', 'fh', clientFairHousing(text, 'internal')]).toEqual([text, 'internal', 'fh', serverFairHousing(text)]);
};

const TERMS: string[] = Object.values((prohibited as any).categories).flatMap((c: any) => c.terms);
const FH_SAMPLES = [
  'whites only', 'no Blacks', 'no hispanic tenants', 'no Asians', 'No Africans', 'christian family only', 'no Muslims', 'no Jews', 'no hindus', 'no buddhists',
  'no children', 'no kids allowed', 'no families with children', 'no wheelchairs', 'no disabled', 'able-bodied only', 'able bodied only', 'males only', 'no women', 'men only',
  'no seniors', 'seniors only', 'under 30 only', 'over 55 only', 'no married couples', 'singles only', 'no gay', 'straight couples only', 'no veterans', 'civilians only',
  'no Section 8', 'no vouchers', 'no housing choice', 'citizens only', 'no immigrants', 'legal residents only', 'no criminal', 'background check required',
  'no students', 'no freelancers', 'no domestic partners', 'no caregivers', 'no parents with children', 'no transgender', 'cisgender only',
];
const UCBA_SAMPLES = [
  'call 212-555-1234', '2125551234', '212.555.1234', '212 555 1234', 'me@example.com', 'https://example.com/listing', 'http://x.test', 'www.example.com', 'contact me today',
  'call me', 'listed by Sam', 'exclusive with us', 'off market', 'off-market opportunity', 'a pocket listing', 'whisper listing', 'quiet listing', 'pre-market', 'premarket',
  '3% commission', '2.5% co-broke', 'buyer pays no fee', 'closing cost credit', 'bonus commission', 'seller concession', 'free broker service', 'no fee agent', 'agent free',
  'free representation', 'no cost service', 'no fee, broker fee paid by landlord', 'commission is negotiable',
];
const BENIGN = [
  'white oak floors', 'black granite counters', 'Italian marble bath', 'Greek Revival facade', 'single-family home', 'multi-family building', 'mature trees and gardens',
  'wheelchair accessible elevator', 'close to the subway', 'walking distance to the park', 'master bedroom with ensuite', 'sunny south-facing living room',
  'Designated by the Landmarks Preservation Commission', 'central air and heat', 'laundry in unit', 'pets welcome', 'doorman building with gym', 'a 1,055 sq ft loft',
  'near schools', 'family room', 'single bedroom', 'married to the original woodwork', 'the building has 155 units', 'tax abatement through 2030', 'No fee building',
];

describe('BLOCKED is what the server refuses', () => {
  it('every prohibited term, alone, in a sentence, upper-cased, and glued to its neighbors (the validator also matches substrings)', () => {
    for (const term of TERMS) {
      for (const text of [term, `The ${term} is wonderful`, term.toUpperCase(), `x${term}x`, `${term}s`, `a${term}`]) agrees(text);
    }
  });
  it('the hard-coded patterns and their near misses', () => { for (const t of FH_SAMPLES) { agrees(t); agrees(`Bright home. ${t}. Great light.`); } });
  it('the UCBA content rules and their near misses', () => { for (const t of UCBA_SAMPLES) { agrees(t); agrees(`Bright home. ${t}. Great light.`); } });
  it('ordinary property words', () => { for (const t of BENIGN) agrees(t); });

  it('a seeded random differential run over fragments of all of the above (1,200 texts)', () => {
    const fragments = [...TERMS, ...FH_SAMPLES, ...UCBA_SAMPLES, ...BENIGN, 'and', 'with', 'the', 'near', 'no', 'only', 'free', '55', '55+', 'fee', 'broker', 'agent', 'service'];
    let seed = 20261006;
    const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let n = 0; n < 1200; n++) {
      const parts: string[] = [];
      for (let i = 0, k = 1 + Math.floor(rand() * 4); i < k; i++) parts.push(fragments[Math.floor(rand() * fragments.length)]);
      agrees(parts.join(rand() < 0.5 ? ' ' : ', '));
    }
  });

  it('shows the validator\'s substring match for what it is: "1,055+ sq ft" holds "55+"', () => {
    const r = FH.scan('Spacious 1,055+ sq ft loft', 'description');
    expect(r.blocked.map((f) => f.text)).toEqual(['55+']);
    expect(FH.scan('Spacious 1,055+ sq ft loft', 'text').blocked).toEqual([]);                  // the whole-word scan does not match it
  });

  it('reports one finding per place even where several of the server\'s rules match the same words', () => {
    // "no children" is both a hard-coded pattern and a prohibited term
    const r = FH.scan('Lovely home, no children.', 'description');
    expect(r.blocked.map((b) => b.text)).toEqual(['no children']);
  });

  it('files the investment claims apart from Fair Housing (the server blocks both)', () => {
    const r = FH.scan('A hot market, and no children.', 'description');
    expect(r.blocked.map((b) => [b.group, b.text])).toEqual([['claims', 'hot market'], ['fh', 'no children']]);
  });

  it('gives every blocked finding its place in the text', () => {
    const text = 'Lovely home, no children, near church.';
    for (const f of FH.scan(text, 'description').blocked) expect(text.substr(f.index, f.length)).toBe(f.text);
  });
});

// ── CHECK is advice about words that describe people, judged by the words around them ───────────────────────────────────────────────────────────────────
const REVIEW_CASES: [string, string[], string[]][] = [
  ['people-group', ['Lovely Chinese families in the area', 'popular with Jewish residents', 'a black only building', 'an Italian neighborhood feel', 'the Muslim community nearby', 'a community of Italian'],
    ['white oak floors and black granite counters', 'Italian marble and Greek Revival details', 'white-collar professionals love it', 'an Indian restaurant on the corner', 'black and white tile',
      'a white kitchen with sunny windows']],
  ['religious-institution', ['close to the church on the corner', 'steps from a beautiful old synagogue', 'minutes from the mosque'], ['near the Church Avenue station', 'close to Temple Street shops', 'the church bells are charming']],
  ['suited-for', ['ideal for a growing family', 'perfect for professionals', 'great for kids', 'designed for couples', 'well suited to retirees'], ['ideal for entertaining', 'great for storage', 'perfect for a home office']],
  ['perfect-for', ['perfect for entertaining', 'Ideal for weekend guests'], ['a perfect space', 'perfectly sized']],
  ['occupant', ['popular with young professionals', 'a favorite of retirees', 'a bachelor pad', 'seniors will love the elevator', 'senior citizens welcome', 'newlyweds'], ['single-family home', 'a senior vice president', 'family room']],
  ['mature-people', ['mature residents welcome', 'a mature crowd'], ['mature trees and landscaping', 'a mature garden']],
  ['no-children-variants', ['no strollers in the lobby', 'adult building', 'not for babies'], ['strollers welcome', 'a baby grand piano']],
  ['disability-terms', ['handicap accessible entrance', 'for able-bodied tenants', 'wheelchair-bound residents', 'disabled tenants'], ['wheelchair accessible elevator', 'step-free entry', 'ADA compliant ramp']],
  ['sex-preference', ['female roommate wanted', 'men preferred', 'ladies only floor'], ['the woman who restored it', 'a doorman']],
  ['marital-status', ['single professional preferred', 'married couples welcome', 'divorced parents'], ['single bedroom', 'single-story', 'single family', 'a single car garage', 'married to the original woodwork']],
  ['orientation-identity', ['LGBTQ friendly building', 'gay couples welcome', 'a straight couple', 'trans friendly'], ['Gay Street location', 'a straight staircase', 'a transit hub', 'transitional style']],
  ['national-origin', ['must speak English', 'US citizens', 'no immigration issues', 'green card holders'], ['a visa-free zone', 'international style architecture']],
  ['source-of-income', ['not accepting vouchers', 'no assistance', 'employed preferred', 'working professionals required'], ['accepting vouchers', 'proof of employment required', 'income verification']],
  ['military-status', ['Veteran preferred', 'military only building', 'civilians welcome'], ['the veterans memorial park', 'a military-style layout']],
  ['criminal-record', ['no felony convictions', 'criminal history', 'arrests'], ['a criminally good kitchen']],
  ['victim-status', ['domestic violence survivors', 'victims of stalking'], ['violence in the news']],
  ['neighborhood-character', ['a safe area for all', 'an up-and-coming neighborhood', 'a changing area', 'low crime', 'a high-class crowd', 'gentrified block'], ['a quiet block', 'a tree-lined street', 'close to transit']],
  ['quiet-neighborhood', ['a quiet neighborhood'], ['a quiet bedroom']],
  ['executive', ['an executive suite'], ['executed lease']],
  ['prestigious', ['a prestigious address'], ['prestige windows']],
  ['schools', ['good schools nearby', 'award-winning schools'], ['a school bus stop', 'schools are listed on the district site']],
  ['master', ['master bedroom', 'Master Bath and closet', 'master suite'], ['master craftsman details', 'mastered the layout']],
  ['pressure', ['Won\'t last', 'act fast!', 'hurry, limited time'], ['a fast elevator', 'the last unit available']],
  ['off-market-like', ['a private listing', 'not on the market yet', 'quiet sale'], ['on the market now']],
  ['agent-info-like', ['text me anytime', 'www.example.test/tour', 'license #12345', '212 555 1234', 'presented by Sam'], ['the licensed architect', 'call the doorman', 'a 212 sq ft terrace']],
  ['call-name', ['Call John for showings', 'text Maria anytime', 'Contact Sam at the office'], ['call the doorman', 'Call now', 'contact us']],
  ['compensation-like', ['commission paid by owner', 'a referral fee', 'rebate offered', 'buyer pays closing costs'], ['Landmarks Preservation Commission', 'City Planning Commission approval']],
  ['free-service-like', ['free closing costs', 'at no cost to you', 'zero commission'], ['free laundry room', 'free-standing tub']],
  ['coming-soon', ['coming soon', 'pre-lease now', 'sneak peek'], ['available now']],
  ['income-multiplier', ['income must be 40x the rent', 'income required 40 times rent'], ['good income potential']],
  ['owner-identity', ['owner is motivated', 'the seller is relocating'], ['owned by a trust', 'the owner\'s duplex']],
];

describe('CHECK flags words about people, and leaves the house alone', () => {
  it.each(REVIEW_CASES)('%s', (id, flagged, left) => {
    for (const text of flagged) {
      const r = FH.scan(text, 'description');
      expect([text, r.review.some((f) => f.id === id), r.blocked.map((b) => b.text)]).toEqual([text, true, expect.any(Array)]);
    }
    for (const text of left) {
      const r = FH.scan(text, 'description');
      expect([text, r.review.some((f) => f.id === id)]).toEqual([text, false]);
    }
  });

  it('has a case for every rule', () => {
    expect(REVIEW_CASES.map(([id]) => id).sort()).toEqual(FH.rules.review.map((r: any) => r.id).sort());
  });

  it('never shows a word as advice that it already blocks', () => {
    const r = FH.scan('safe neighborhood, no children, near church, perfect for families', 'description');
    expect(r.blocked.length).toBeGreaterThan(0);
    for (const f of r.review) for (const b of r.blocked) expect(f.index < b.index + b.length && b.index < f.index + f.length).toBe(false);
  });

  it('gives each finding one place: where two rules found the same words, the longer stays', () => {
    const r = FH.scan('ideal for a growing family', 'description');
    expect(r.review.map((f) => f.id)).toEqual(['suited-for']);
  });

  it('gives every finding its place in the text', () => {
    const text = 'Perfect for a growing family, close to the church, master bedroom.';
    for (const f of FH.scan(text, 'description').review) expect(text.substr(f.index, f.length)).toBe(f.text);
  });

  it('the UCBA and style advice is for public text only, the Fair Housing advice for every box', () => {
    const text = 'master bedroom, commission, perfect for professionals';
    const ids = (kind: string) => FH.scan(text, kind).review.map((f) => f.id).sort();
    expect(ids('description')).toEqual(['compensation-like', 'master', 'suited-for'].sort());
    expect(ids('text')).toEqual(['compensation-like', 'master', 'suited-for'].sort());
    expect(ids('private')).toEqual(['suited-for']);
    expect(ids('internal')).toEqual(['suited-for']);
  });

  it('public text that is not the description is advised about what the server refuses in the description', () => {
    const r = FH.scan('Call 212-555-1234 or me@example.test', 'text');
    expect(r.blocked).toEqual([]);
    expect(r.review.map((f) => f.id)).toEqual(['public-text', 'public-text']);
    expect(FH.scan('Call 212-555-1234', 'internal').review).toEqual([]);
  });
});

// ── the real forms ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Page = { form: AddForm; prefix: 'rental' | 'sale'; description: string; descFlags: string; showing: string; showingFlags: string; remarks: string; remarksFlags: string; layout: string; layoutFlags: string; notes: string; notesFlags: string; wait: number };
const PAGES: Page[] = [
  { form: 'RENTAL-FORM-REDESIGN', prefix: 'rental', description: 'rentalDescription', descFlags: 'rentalFairHousingFlags', showing: 'rentalShowingInstructions', showingFlags: 'rentalShowingFlags', remarks: 'rentalAgentRemarks', remarksFlags: 'rentalAgentRemarksFlags', layout: 'rentalTHLayout', layoutFlags: 'rentalTHLayoutFlags', notes: 'rentalTHNotes', notesFlags: 'rentalTHNotesFlags', wait: 80 },
  { form: 'SALE-FORM-REDESIGN', prefix: 'sale', description: 'saleDescription', descFlags: 'saleFairHousingFlags', showing: 'saleShowingInstructions', showingFlags: 'saleShowingFlags', remarks: 'saleBrokerComments', remarksFlags: 'saleBrokerCommentsFlags', layout: 'saleTHLayout', layoutFlags: 'saleTHLayoutFlags', notes: 'saleTHNotes', notesFlags: 'saleTHNotesFlags', wait: 450 },
];
const typeInto = async (f: BootedForm, id: string, value: string, wait: number) => {
  const el = f.d.getElementById(id) as HTMLTextAreaElement;
  el.value = value;
  el.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await sleep(wait);
};
const flagsOf = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLElement;
const has = (el: HTMLElement, selector: string) => el.querySelector(selector) !== null;

describe.each(PAGES)('$form: the wording check in the page', (p) => {
  it('loads the module, boots without a page error, and shows nothing for an empty box', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      expect(typeof (f.w as any).MallanFairHousing.scan).toBe('function');
      expect(flagsOf(f, p.descFlags).classList.contains('hidden')).toBe(true);
    } finally { f.close(); }
  });

  it('shows wording the server refuses in red, with where it is and a Show button, and says it must be fixed before saving', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, 'Sunny two bedroom. No children, near church.', p.wait);
      const flags = flagsOf(f, p.descFlags);
      expect(flags.classList.contains('hidden')).toBe(false);
      expect(has(flags, '.bg-red-50')).toBe(true);
      expect(flags.textContent).toContain('“No children”');
      expect(flags.textContent).toContain('“near church”');
      expect(flags.textContent).toMatch(/blocked — fix before saving/);
      expect(flags.querySelectorAll('[data-fh-show]').length).toBeGreaterThanOrEqual(2);
      expect((f.d.getElementById(p.description) as HTMLElement).classList.contains('border-red-400')).toBe(true);
    } finally { f.close(); }
  });

  it('shows the UCBA wording the server refuses in the main description in orange', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, 'Sunny two bedroom. Call me at 212-555-1234 for a tour.', p.wait);
      const flags = flagsOf(f, p.descFlags);
      expect(has(flags, '.bg-orange-50')).toBe(true);
      expect(has(flags, '.bg-red-50')).toBe(false);
    } finally { f.close(); }
  });

  it('says nothing is wrong with a description that talks about the house (white oak, black granite, single-family, mature trees)', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, 'Single-family home with white oak floors, black granite counters, Italian marble baths and mature trees.', p.wait);
      const flags = flagsOf(f, p.descFlags);
      expect(has(flags, '.bg-red-50') || has(flags, '.bg-orange-50') || has(flags, '.bg-amber-50')).toBe(false);
      expect(flags.textContent).toContain('No blocked wording found');
    } finally { f.close(); }
  });

  it('shows words worth a second look in amber, which does not count as blocked', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, 'Perfect for a growing family, close to the Chinese community and a master bedroom.', p.wait);
      const flags = flagsOf(f, p.descFlags);
      expect(has(flags, '.bg-amber-50')).toBe(true);
      expect(has(flags, '.bg-red-50') || has(flags, '.bg-orange-50')).toBe(false);
      expect(flags.textContent).toContain('not blocked');
      expect((f.d.getElementById(p.description) as HTMLElement).classList.contains('border-amber-400')).toBe(true);
      expect((f.w as any).MallanFairHousing.blockedFields()).toEqual([]);
    } finally { f.close(); }
  });

  it('does not treat a phone number and an agent name in Showing Instructions or private remarks as a violation (the placeholder asks for them)', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.showing, '(BROK) Sam Agent 212-555-1234, call before you come', p.wait);
      await typeInto(f, p.remarks, 'Landlord is flexible. Commission 2% paid by owner. me@example.test', p.wait);
      for (const id of [p.showingFlags, p.remarksFlags]) {
        const flags = flagsOf(f, id);
        expect(has(flags, '.bg-orange-50') || has(flags, '.bg-red-50')).toBe(false);
      }
    } finally { f.close(); }
  });

  it('gives internal notes the Fair Housing rules alone: a phone number and an e-mail there are not even advice, the wording the server refuses still is', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.notes, 'Call Sam on 212-555-1234 or sam@example.test, owner is flexible', p.wait);
      expect(flagsOf(f, p.notesFlags).querySelector('.bg-amber-50, .bg-orange-50, .bg-red-50')).toBeNull();
      await typeInto(f, p.notes, 'no children', p.wait);
      expect(has(flagsOf(f, p.notesFlags), '.bg-red-50')).toBe(true);
    } finally { f.close(); }
  });

  it('still refuses Fair Housing wording in Showing Instructions and private remarks', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.showing, 'Section 8 not accepted', p.wait);
      await typeInto(f, p.remarks, 'no children please', p.wait);
      expect(has(flagsOf(f, p.showingFlags), '.bg-red-50')).toBe(true);
      expect(has(flagsOf(f, p.remarksFlags), '.bg-red-50')).toBe(true);
    } finally { f.close(); }
  });

  it('shows investment claims under their own heading, not as Fair Housing', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, 'A great investment in a hot market.', p.wait);
      const flags = flagsOf(f, p.descFlags);
      expect(flags.textContent).toContain('Investment claims \u2014 BLOCKED');
      expect(flags.textContent).not.toContain('Fair Housing \u2014 BLOCKED');
    } finally { f.close(); }
  });

  it('says nothing for a few clean words, a green line for a clean description, and nothing once the box is emptied', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, 'Nice home', p.wait);
      expect(flagsOf(f, p.descFlags).classList.contains('hidden')).toBe(true);
      await typeInto(f, p.description, 'A bright two bedroom with a renovated kitchen.', p.wait);
      expect(flagsOf(f, p.descFlags).textContent).toContain('No blocked wording found');
      await typeInto(f, p.description, 'No children', p.wait);
      expect(has(flagsOf(f, p.descFlags), '.bg-red-50')).toBe(true);
      await typeInto(f, p.description, '', p.wait);
      expect(flagsOf(f, p.descFlags).classList.contains('hidden')).toBe(true);
      expect(flagsOf(f, p.descFlags).children.length).toBe(0);
      expect((f.d.getElementById(p.description) as HTMLElement).classList.contains('border-red-400')).toBe(false);
    } finally { f.close(); }
  });

  it('says "fix before saving" for the Layout box: the server refuses wording in it (create and edit) since 2026-10-09; it used to be a box the server did not scan, and said "fix before publishing"', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.layout, 'No children please', p.wait);
      expect(flagsOf(f, p.layoutFlags).textContent).toMatch(/blocked \u2014 fix before saving/);
      expect(flagsOf(f, p.layoutFlags).textContent).not.toMatch(/fix before publishing/);
      expect(has(flagsOf(f, p.layoutFlags), '.bg-red-50')).toBe(true);
      expect((f.w as any).MallanFairHousing.blockedFields().map((x: any) => [x.id, x.saves])).toEqual([[p.layout, true]]);
    } finally { f.close(); }
  });

  it('shows what the agent typed as text, never as markup', async () => {
    const hostile = 'Tour at https://x.test/<img/src=x/onerror=window.__pwned=1> now';
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      await typeInto(f, p.description, hostile, p.wait);
      const flags = flagsOf(f, p.descFlags);
      expect(has(flags, '.bg-orange-50')).toBe(true);
      expect(flags.querySelector('img')).toBeNull();
      expect(flags.textContent).toContain('<img/src=x/onerror=window.__pwned=1>');            // shown as the characters the agent typed
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });

  it('the Show button selects the words in the text box', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      const text = 'Bright two bedroom. No children, thank you.';
      await typeInto(f, p.description, text, p.wait);
      const button = flagsOf(f, p.descFlags).querySelector('[data-fh-show]') as HTMLButtonElement;
      button.click();
      const box = f.d.getElementById(p.description) as HTMLTextAreaElement;
      expect(text.slice(box.selectionStart, box.selectionEnd)).toBe('No children');
    } finally { f.close(); }
  });

  it('blockedFields() scans every box the page has, and says which of them the server refuses at save', async () => {
    const f = await bootAddForm(p.form, { settle: 600 });
    try {
      (f.d.getElementById(p.description) as HTMLTextAreaElement).value = 'no children';
      (f.d.getElementById(p.showing) as HTMLTextAreaElement).value = 'Call Sam at 212-555-1234';
      const found = (f.w as any).MallanFairHousing.blockedFields();
      expect(found.map((x: any) => [x.id, x.label, x.saves])).toEqual([[p.description, 'Listing Description', true]]);
      expect(has(flagsOf(f, p.descFlags), '.bg-red-50')).toBe(true);                   // and it showed it
    } finally { f.close(); }
  });

  it('shows what is in the boxes of a saved listing as soon as it loads, without a keystroke', async () => {
    const wording = 'Lovely home. No children allowed.';
    const f = await bootAddForm(p.form, {
      search: '?id=1', settle: 1800,
      listing: { id: '1', listing_id: 'L-1', status: 'Draft', address: {}, features: {}, media: [], agent_info: {}, raw_data: { [p.description]: wording, PublicRemarks: wording } },
    });
    try {
      expect(has(flagsOf(f, p.descFlags), '.bg-red-50')).toBe(true);
      expect(flagsOf(f, p.descFlags).textContent).toContain('No children');
    } finally { f.close(); }
  });

  it('a page whose module did not load says so under the box and still boots', async () => {
    const f = await bootAddForm(p.form, { settle: 600, modules: ['directory-picker', 'colist-section', 'agent-defaults', 'listing-hydration'] });
    try {
      await typeInto(f, p.description, 'No children, near church.', p.wait);
      expect([...new Set(f.errors)]).toEqual([]);
      const flags = flagsOf(f, p.descFlags);
      expect(flags.textContent).toMatch(/wording check did not load/);
      expect(flags.classList.contains('hidden')).toBe(false);
    } finally { f.close(); }
  });
});

describe('Rental: restoring a draft shows what its boxes hold', () => {
  it('without a keystroke', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 1500, storage: { rentalListingDraft: JSON.stringify({ rentalDescription: 'Lovely. No children allowed.' }) } });
    try {
      expect((f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value).toBe('Lovely. No children allowed.');
      expect(has(flagsOf(f, 'rentalFairHousingFlags'), '.bg-red-50')).toBe(true);
    } finally { f.close(); }
  });
});

describe('Sale: typing in the description also refreshes every other box (the batch scan, after a pause)', () => {
  it('shows what a box filled by code holds', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      (f.d.getElementById('saleShowingInstructions') as HTMLTextAreaElement).value = 'no children';           // filled by code: nothing has scanned it
      expect(flagsOf(f, 'saleShowingFlags').children.length).toBe(0);
      await typeInto(f, 'saleDescription', 'A bright two bedroom with a renovated kitchen.', 1200);
      expect(has(flagsOf(f, 'saleShowingFlags'), '.bg-red-50')).toBe(true);
    } finally { f.close(); }
  });
});

describe('Sale: restoring a draft shows what its boxes hold', () => {
  it('without a keystroke', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?restore=local', settle: 1500, storage: { mallan_draft_sale: JSON.stringify({ saleDescription: 'Lovely. No children allowed.' }) } });
    try {
      expect((f.d.getElementById('saleDescription') as HTMLTextAreaElement).value).toBe('Lovely. No children allowed.');
      expect(has(flagsOf(f, 'saleFairHousingFlags'), '.bg-red-50')).toBe(true);
    } finally { f.close(); }
  });
});

// ── Submit stops on what the server refuses ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('Rental: Submit', () => {
  const ready = async (description: string) => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 600 });
    (f.w as any).validateRentalTab = () => true;                                           // the required-field check is not what is under test
    (f.d.getElementById('rentalDescription') as HTMLTextAreaElement).value = description;
    return f;
  };
  const toasts = (f: BootedForm) => [...f.d.querySelectorAll('.toast-notification')].map((t) => t.textContent ?? '');

  it('stops, names the box, and sends nothing when a text box holds wording the server refuses', async () => {
    const f = await ready('No children, near church.');
    try {
      (f.w as any).submitRentalListing();
      await sleep(150);
      expect(f.saved).toEqual([]);
      expect(toasts(f).some((t) => /Cannot submit: Listing Description hold wording the server refuses/.test(t))).toBe(true);
    } finally { f.close(); }
  });

  it('stops for a box that is not the description (internal notes)', async () => {
    const f = await ready('A lovely home.');
    try {
      (f.d.getElementById('rentalTHNotes') as HTMLTextAreaElement).value = 'no section 8';
      (f.w as any).submitRentalListing();
      await sleep(150);
      expect(f.saved).toEqual([]);
      expect(toasts(f).some((t) => /Internal Notes/.test(t))).toBe(true);
    } finally { f.close(); }
  });

  it('does not stop for advice, nor for a phone number in Showing Instructions', async () => {
    const f = await ready('Perfect for a growing family, close to the Chinese community.');
    try {
      (f.d.getElementById('rentalShowingInstructions') as HTMLTextAreaElement).value = '(BROK) Sam Agent 212-555-1234';
      (f.w as any).submitRentalListing();
      await sleep(200);
      expect(f.saved.length).toBe(1);
    } finally { f.close(); }
  });

  it('stops for the Layout box too: the server refuses wording in it (create and edit) since 2026-10-09, and used to save it unread', async () => {
    const f = await ready('A lovely home.');
    try {
      (f.d.getElementById('rentalTHLayout') as HTMLTextAreaElement).value = 'No children please';
      (f.w as any).submitRentalListing();
      await sleep(150);
      expect(f.saved).toEqual([]);
      expect(toasts(f).some((t) => /Layout/.test(t))).toBe(true);
    } finally { f.close(); }
  });
});

describe('Sale: Submit', () => {
  const ready = async (description: string) => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    (f.w as any).validateREBNYRequired = () => [];                                         // the required-field check is not what is under test
    (f.d.getElementById('saleDescription') as HTMLTextAreaElement).value = description;
    const alerts: string[] = [];
    (f.w as any).alert = (m: string) => alerts.push(String(m));
    return { f, alerts };
  };

  it('stops, names the box, and sends nothing when a text box holds wording the server refuses', async () => {
    const { f, alerts } = await ready('No children, near church.');
    try {
      (f.w as any).submitSalesListing();
      await sleep(150);
      expect(f.saved).toEqual([]);
      expect(alerts.some((a) => /Cannot submit: Listing Description hold wording the server refuses/.test(a))).toBe(true);
    } finally { f.close(); }
  });

  it('stops for Broker Comments too, and does not stop for advice or a phone number in Showing Instructions', async () => {
    const stopped = await ready('A lovely home.');
    try {
      (stopped.f.d.getElementById('saleBrokerComments') as HTMLTextAreaElement).value = 'no vouchers';
      (stopped.f.w as any).submitSalesListing();
      await sleep(150);
      expect(stopped.alerts.some((a) => /Broker Comments/.test(a))).toBe(true);
    } finally { stopped.f.close(); }
    const sent = await ready('Perfect for a growing family, close to the Chinese community.');
    try {
      (sent.f.d.getElementById('saleShowingInstructions') as HTMLTextAreaElement).value = '(BROK) Sam Agent 212-555-1234';
      try { (sent.f.w as any).submitSalesListing(); } catch { /* what happens after the wording check is not what is under test */ }
      await sleep(300);
      expect(sent.alerts.some((a) => /hold wording the server refuses/.test(a))).toBe(false);
    } finally { sent.f.close(); }
  });

  it.each([['saleTHLayout', 'Layout', 'No children please'], ['saleTHFinancing', 'Financing', 'No vouchers accepted']])('stops for the %s box too: the server refuses wording in it (create and edit) since 2026-10-09, and used to save it unread', async (id, label, text) => {
    const { f, alerts } = await ready('A lovely home.');
    try {
      (f.d.getElementById(id) as HTMLTextAreaElement).value = text;
      (f.w as any).submitSalesListing();
      await sleep(150);
      expect(f.saved).toEqual([]);
      expect(alerts.some((a) => new RegExp(label).test(a))).toBe(true);
    } finally { f.close(); }
  });
});
