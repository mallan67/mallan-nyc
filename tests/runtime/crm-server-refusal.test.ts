/// <reference types="jest" />
/**
 * The server's refusal of a listing names the boxes to fix, and the Add forms say so.
 *
 * Found 2026-10-08 (running the real forms through the create gate): POST /api/crm/listings answers 422 with the gate's `blockers` ([{ code, field, message }]) and the validator's
 * `validation.errors`, and the CRM client puts that answer on the error as `details`. Neither form read it: an agent saw "Listing blocked by RLS enforcement gate" or "Listing failed
 * compliance validation" and could not tell which box the server wanted. js/forms/server-refusal.js names them (by the label on the page, or by the Cotality name when the page has no
 * such box), marks them, and scrolls to the first; both forms put the names in the message they show.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { bootAddForm } from './add-form-harness';
import { validateListing } from '@/lib/compliance/rebny-validator';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCE = fs.readFileSync(path.join(__dirname, '../../public/crm/js/forms/server-refusal.js'), 'utf8');

const HTML = `
  <div class="mt-3"><label class="field-label">Living Area Units <span class="text-red-500">*</span></label>
    <select id="units" data-rls-field="LivingAreaUnits"><option>SquareFeet</option></select></div>
  <div id="conditionsBlock" class="mt-4"><label class="field-label">Special Listing Conditions <span class="text-red-500">*</span></label>
    <label><input type="checkbox" name="g" id="std" value="Standard" data-rls-field="SpecialListingConditions"> Standard</label>
    <label><input type="checkbox" name="g" id="std2" value="Estate"> Estate</label></div>
  <div class="mt-3"><span class="hint">Pick the closest</span><label class="field-label">Condition <span class="text-red-500">*</span></label>
    <select id="cond" data-rls-field="PropertyCondition"><option>Excellent</option></select></div>
  <div id="bare"><input id="fireplaces" data-rls-field="FireplacesTotal"></div>
  <div id="plainGroup"><label id="plainLabel"><input type="checkbox" id="plainBox" value="x" data-rls-field="WaterfrontFeatures"> x</label></div>
  <div class="mt-3"><label class="field-label">Public Remarks</label><textarea id="pubRemarks" data-rls-field="PublicRemarks"></textarea></div>
  <div class="mt-3"><label class="field-label">Broker Comments</label><textarea id="saleBrokerComments"></textarea></div>
  <div class="mt-3"><label class="field-label">Web Headline</label><input name="webHeadline"></div>`;

function page() {
  const dom = new JSDOM(`<!doctype html><html><body>${HTML}</body></html>`, { runScripts: 'outside-only' });
  dom.window.eval(SOURCE);
  return { w: dom.window as any, api: (dom.window as any).MallanServerRefusal, close: () => dom.window.close() };
}

const err = (w: any, message: string, details: unknown, status = 422) => Object.assign(new w.Error(message), { status, details });
const BLOCKED = { error: 'Listing blocked by RLS enforcement gate', blockers: [
  { code: 'CF-AREA-UNITS-001', field: 'LivingAreaUnits', message: 'Conditional field "LivingAreaUnits" required by AREA-UNITS-001' },
  { code: 'MF-001', field: 'SpecialListingConditions', message: 'x' },
  { code: 'CF-AREA-UNITS-001', field: 'LivingAreaUnits', message: 'again' },
] };

describe('MallanServerRefusal', () => {
  const p = page();
  afterAll(() => p.close());

  it('fields: the Cotality names a refusal names, once each, from the blockers and from the validator\'s errors', () => {
    expect(p.api.fields(BLOCKED)).toEqual(['LivingAreaUnits', 'SpecialListingConditions']);
    expect(p.api.fields({ validation: { errors: ['[REBNY] Required field missing: ListPrice', '[REBNY] Conditional field required: TaxLot - Condo requires LivingArea and TaxLot', '[NYC] YearBuilt 670 is before 1700 - invalid', '[REBNY] Required field missing: ListPrice'] } }))
      .toEqual(['ListPrice', 'TaxLot', 'YearBuilt']);
    expect(p.api.fields({ blockers: [{ field: 'A' }], validation: { errors: ['[REBNY] Required field missing: A', '[REBNY] Required field missing: B'] } })).toEqual(['A', 'B']);
  });

  it('fields: an answer that names nothing, or is not an answer, names nothing', () => {
    for (const none of [undefined, null, {}, 'x', 5, { blockers: 'x' }, { blockers: [null, {}, { field: 7 }] }, { validation: null }, { validation: { errors: [null, 5, 'text'] } }]) expect(p.api.fields(none)).toEqual([]);
  });

  it('words: the message when the refusal names nothing, and the message with the boxes\' labels when it does', () => {
    expect(p.api.words(err(p.w, 'Listing failed compliance validation', {}))).toBe('Listing failed compliance validation');
    expect(p.api.words(null)).toBe('');
    expect(p.api.words(err(p.w, 'Listing blocked by RLS enforcement gate', BLOCKED))).toBe('Listing blocked by RLS enforcement gate: Living Area Units, Special Listing Conditions');
  });

  it('words: a field the page has no box for is named by its Cotality name, spaced; only eight are listed and the rest counted', () => {
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'PetsAllowed' }, { field: 'AssociationFeeFrequency' }, { field: 'MLSAreaMajor' }] }))).toBe('refused: Pets Allowed, Association Fee Frequency, MLS Area Major');
    const many = Array.from({ length: 11 }, (_, i) => ({ field: `Field${String.fromCharCode(65 + i)}` }));
    expect(p.api.words(err(p.w, 'refused', { blockers: many }))).toBe('refused: Field A, Field B, Field C, Field D, Field E, Field F, Field G, Field H and 3 more');
    expect(p.api.words({ details: { blockers: [{ field: 'ListPrice' }] } })).toBe('List Price');                       // no message: the names alone
  });

  it('words: a box is named by the label the page gives it, which need not be its Cotality name; a box with no label anywhere above it by its Cotality name', () => {
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'PropertyCondition' }] }))).toBe('refused: Condition');             // not "Property Condition"; the hint beside the label is not the label
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'FireplacesTotal' }] }))).toBe('refused: Fireplaces Total');
  });

  it('words: exactly eight boxes are all listed and nothing is counted', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ field: `Field${String.fromCharCode(65 + i)}` }));
    expect(p.api.words(err(p.w, 'refused', { blockers: eight }))).toBe('refused: Field A, Field B, Field C, Field D, Field E, Field F, Field G, Field H');
  });

  it('mark: the controls are marked and the first is scrolled into view; a change clears the mark', () => {
    const q = (sel: string) => p.w.document.querySelector(sel) as HTMLElement;
    const scrolled: string[] = [];
    for (const el of [q('#units'), q('#conditionsBlock')]) (el as any).scrollIntoView = () => scrolled.push(el.id);
    expect(p.api.mark(err(p.w, 'refused', BLOCKED))).toBe(true);
    expect(q('#units').classList.contains('border-red-500')).toBe(true);
    expect(q('#units').style.outline).toBe('2px solid #dc2626');
    expect(q('#conditionsBlock').classList.contains('border-red-500')).toBe(true);        // a group of boxes: the block that holds them
    expect(scrolled).toEqual(['units']);
    q('#units').dispatchEvent(new p.w.Event('change', { bubbles: true }));
    expect(q('#units').classList.contains('border-red-500')).toBe(false);
    expect(q('#units').style.outline).toBe('');
    expect(q('#conditionsBlock').classList.contains('border-red-500')).toBe(true);
    q('#std').dispatchEvent(new p.w.Event('change', { bubbles: true }));
    expect(q('#conditionsBlock').classList.contains('border-red-500')).toBe(false);
    expect(q('#conditionsBlock').style.outline).toBe('');
  });

  it('mark: a group of boxes inside no block is marked by the wrapper around the box, not the box; a change takes the mark and the outline off', () => {
    const q = (sel: string) => p.w.document.querySelector(sel) as HTMLElement;
    expect(p.api.mark(err(p.w, 'refused', { blockers: [{ field: 'WaterfrontFeatures' }] }))).toBe(true);
    expect(q('#plainLabel').classList.contains('border-red-500')).toBe(true);
    expect(q('#plainLabel').style.outline).toBe('2px solid #dc2626');
    expect(q('#plainBox').classList.contains('border-red-500')).toBe(false);
    q('#plainBox').dispatchEvent(new p.w.Event('change', { bubbles: true }));
    expect(q('#plainLabel').classList.contains('border-red-500')).toBe(false);
    expect(q('#plainLabel').style.outline).toBe('');
  });

  it('mark: nothing to mark is false, and a field without a box does not stop the others', () => {
    expect(p.api.mark(err(p.w, 'refused', {}))).toBe(false);
    expect(p.api.mark(err(p.w, 'refused', { blockers: [{ field: 'NoSuchBox' }, { field: 'LivingAreaUnits' }] }))).toBe(true);
  });
});

// What the Fair Housing scan answers (lib/compliance/rls-enforcement.ts scanTextForFairHousing, through the create route's fhRecord): one blocker per phrase found, in the field it was found in;
// a free-text box the form posted under its own key is named "raw:<id of the control>".
const fh = (field: string, phrase: string, law = 'NY HRL (Age)') => ({ code: 'FH-001', severity: 'BLOCKER', field, message: `Fair Housing violation in ${field}: "${phrase}" — violates ${law}.` });
const FAIR_HOUSING = { error: 'Listing blocked by Fair Housing content gate', blockers: [
  fh('PublicRemarks', 'adults only'), fh('PublicRemarks', 'no section 8', 'NYC HRL Title 8 (Source of Income)'), fh('PublicRemarks', 'adults only'),
  fh('raw:saleBrokerComments', 'no felonies', 'NYC Fair Chance Housing Act'), fh('raw:agentRemarks', 'seniors only'),
] };

describe('MallanServerRefusal and the Fair Housing scan', () => {
  const p = page();
  afterAll(() => p.close());

  it('words: a Fair Housing refusal names the box and the phrase found in it, once each; a free-text box posted under its own key is named by its label, or by its key when the page has none', () => {
    expect(p.api.words(err(p.w, FAIR_HOUSING.error, FAIR_HOUSING))).toBe(
      'Listing blocked by Fair Housing content gate: Public Remarks ("adults only", "no section 8"), Broker Comments ("no felonies"), Agent Remarks ("seniors only")');
  });

  it('words: only a Fair Housing blocker (code FH-001) with a message that names a phrase gets a phrase', () => {
    const notFairHousing = { code: 'MF-001', field: 'ListPrice', message: 'Fair Housing violation in ListPrice: "adults only" — x' };
    const noPhrase = { code: 'FH-001', field: 'PetsAllowed', message: 'something else entirely' };
    const noMessage = { code: 'FH-001', field: 'ParkingFeatures' };
    expect(p.api.words(err(p.w, 'refused', { blockers: [notFairHousing, noPhrase, noMessage] }))).toBe('refused: List Price, Pets Allowed, Parking Features');
  });

  it('mark: a free-text box the scan named by the form\'s own key is found by the id of the control, or by its name, and a key that is not a plain name finds nothing and stops nothing', () => {
    const q = (sel: string) => p.w.document.querySelector(sel) as HTMLElement;
    expect(p.api.mark(err(p.w, 'refused', { blockers: [fh('raw:saleBrokerComments', 'no felonies'), fh('raw:webHeadline', 'adults only'), fh('raw:no"such\\key', 'x'), fh('raw:neverHeardOfIt', 'x')] }))).toBe(true);
    expect(q('#saleBrokerComments').classList.contains('border-red-500')).toBe(true);
    expect(q('[name="webHeadline"]').classList.contains('border-red-500')).toBe(true);
    expect(p.api.mark(err(p.w, 'refused', { blockers: [fh('raw:no"such\\key', 'x')] }))).toBe(false);
  });
});

describe('MallanServerRefusal outside a page', () => {
  it('installs itself on the global it is loaded into, and with no document to read labels from it still words a refusal and marks nothing', () => {
    const sandbox: any = {};
    vm.runInNewContext(SOURCE, sandbox);
    const api = sandbox.MallanServerRefusal;
    const refusal = { message: 'refused', details: { blockers: [{ field: 'PetsAllowed' }] } };
    expect(api.words(refusal)).toBe('refused: Pets Allowed');
    expect(api.mark(refusal)).toBe(false);
  });
});

describe.each([
  ['SALE-FORM-REDESIGN', '_saleSubmitFailed', 'div[style*="99999"]'],
  ['RENTAL-FORM-REDESIGN', '_rentalSubmitFailed', 'div.toast-notification'],
] as const)('%s: a refused listing says which boxes the server wants', (form, handler, toastSelector) => {
  const toastsAfter = async (status: number | null, details: unknown, message = 'Listing blocked by RLS enforcement gate') => {
    const f = await bootAddForm(form, { settle: 300 });
    try {
      const failure = Object.assign(new f.w.Error(message), { status: status ?? undefined, details });
      f.w[handler](failure, true);
      return [...f.d.querySelectorAll(toastSelector)].map((t) => t.textContent ?? '');
    } finally { f.close(); }
  };

  it('puts the labels of the refused boxes in the message, and says nothing was saved', async () => {
    const texts = await toastsAfter(422, { blockers: [{ field: 'LivingAreaUnits' }, { field: 'PropertyCondition' }, { field: 'SpecialListingConditions' }] });
    const refusal = texts.find((t) => /Submission failed/.test(t));
    expect(refusal).toBeTruthy();
    // each box is named by the label the page gives it ("Property Condition" on the Sale form, "Condition" and "Area Units" on the Rental form, whose Cotality names are longer); a field the page
    // has no box for by its Cotality name, spaced
    const names = form.startsWith('SALE') ? 'Living Area Units, Property Condition, Special Listing Conditions' : 'Area Units, Condition, Special Listing Conditions';
    expect(refusal).toContain(`Submission failed: Listing blocked by RLS enforcement gate: ${names}. Nothing was saved to the CRM`);
  });

  it('a Fair Housing refusal names the free-text box the form posted the text under, by its label on the page, with the phrase found, and marks it', async () => {
    const [box, label, remarks] = form.startsWith('SALE') ? ['saleBrokerComments', 'Broker To Broker Comments', 'Listing Description'] : ['rentalAgentRemarks', 'Agent Remarks (Private)', 'Listing Description'];
    const details = { blockers: [fh(`raw:${box}`, 'no felonies', 'NYC Fair Chance Housing Act'), fh('PublicRemarks', 'adults only')] };
    const texts = await toastsAfter(422, details, 'Listing blocked by Fair Housing content gate');
    const refusal = texts.find((t) => /Submission failed/.test(t));
    expect(refusal).toContain(`Submission failed: Listing blocked by Fair Housing content gate: ${label} ("no felonies"), ${remarks} ("adults only"). Nothing was saved to the CRM`);
    const f = await bootAddForm(form, { settle: 300 });
    try {
      f.w[handler](Object.assign(new f.w.Error('Listing blocked by Fair Housing content gate'), { status: 422, details }), true);
      expect((f.d.getElementById(box) as HTMLElement).classList.contains('border-red-500')).toBe(true);
    } finally { f.close(); }
  });

  it('marks the refused boxes the form has', async () => {
    const f = await bootAddForm(form, { settle: 300 });
    try {
      const failure = Object.assign(new f.w.Error('Listing blocked by RLS enforcement gate'), { status: 422, details: { blockers: [{ field: 'PropertyCondition' }] } });
      f.w[handler](failure, true);
      expect((f.d.getElementById(form.startsWith('SALE') ? 'saleCondition' : 'rentalCondition') as HTMLElement).classList.contains('border-red-500')).toBe(true);
    } finally { f.close(); }
  });

  it('a failure that is not a refusal (the server failing) names no boxes and does not say nothing was saved', async () => {
    const texts = await toastsAfter(500, { blockers: [{ field: 'PropertyCondition' }] });
    const failed = texts.find((t) => /did not confirm/.test(t));
    expect(failed).toBeTruthy();
    expect(failed).not.toMatch(/Nothing was saved/);
    expect(failed).not.toContain('Condition');                                      // only a refusal names boxes
  });
});

// ── What the validator's lines name, and the boxes a refusal points to ──────────────────────────────────────────────────────────────────────────────────
// The create route answers with the validator's errors ("Listing failed compliance validation") before the gate runs, so they are the first refusal an agent meets. The helper used to read two of the
// validator's line shapes ("Required field missing", "Conditional field required"); the Fair Housing, NYC and field-format lines named no box, and the review of 2026-10-09 found that the boxes the pages hold
// under another name (the price of a rental is its monthly rent, the tax lot box carried a name the field no longer has, ...) were named by their Cotality words, and the Rental description as "Public Remarks"
// though its card says "Listing Description".
const BOXES_HTML = `
  <div class="mt-3"><label class="field-label">Lot Number</label><input id="bldgTaxLot" data-rls-ignore="true"></div>
  <div class="mt-3"><label class="field-label">Monthly Rent</label><input id="rentalMonthlyRent" data-rls-ignore="true"></div>
  <div class="mt-3"><label class="field-label">Exclusive Start</label><input id="saleExclusiveStart" type="date" data-rls-ignore="true"></div>
  <div id="typeBlock"><label class="field-label">Property Type</label>
    <label><input type="radio" name="rentalPropertyType" value="Condo"> Condo</label><label><input type="radio" name="rentalPropertyType" value="Coop"> Co-op</label></div>
  <div id="viewsBlock"><label class="field-label">Views</label>
    <label><input type="checkbox" name="saleViewList" id="viewOcean" value="Ocean"> Ocean</label><label><input type="checkbox" name="saleViewList" id="viewStreet" value="Street"> Street</label></div>
  <div class="form-card"><div class="form-card-header"><i class="fas fa-pen-fancy"></i> Listing Description</div><textarea id="alone" data-rls-field="ShowingInstructions"></textarea></div>
  <div class="form-card"><div class="form-card-header">Two Notes</div><textarea id="noteA" data-rls-field="MlsNoteA"></textarea><textarea id="noteB" data-rls-field="MlsNoteB"></textarea></div>`;

// a box that carries a Cotality name in data-rls-field, held beside the table's: the sub type
const CARRIER = '<div class="mt-3"><label class="field-label">Unit Type</label><select id="carrier" data-rls-field="PropertySubType"><option>Apartment</option></select></div>';

function boxesPage(extra = '') {
  const dom = new JSDOM(`<!doctype html><html><body>${HTML}${BOXES_HTML}${extra}</body></html>`, { runScripts: 'outside-only' });
  dom.window.eval(SOURCE);
  return { w: dom.window as any, api: (dom.window as any).MallanServerRefusal, close: () => dom.window.close() };
}

// What the real validator answers with: a listing missing almost everything, one with Fair Housing wording and a year before 1700, and one with a year far in the future.
const BAD_LISTINGS: Record<string, unknown>[] = [
  { PropertyType: 'Residential', PropertySubType: 'Apartment', ListPrice: 'abc', LivingArea: 0, YearBuilt: 670, PublicRemarks: 'Adults only. No section 8.', City: 'New York', CityRegion: 'Brooklyn', CountyOrParish: 'New York', StateOrProvince: 'NY', ListingContractDate: 'yesterday', listing_type: 'sale' },
  { PropertyType: 'Residential', YearBuilt: 2090, City: 'New York', StateOrProvince: 'NY', CountyOrParish: 'New York' },
  { listing_type: 'sale' },
];

describe('MallanServerRefusal and the validator\'s lines', () => {
  const p = boxesPage(CARRIER);
  afterAll(() => p.close());
  const names = (...errors: string[]) => p.api.fields({ validation: { errors } });

  it.each([
    ['[REBNY] Required field missing: ListPrice - the asking price', ['ListPrice']],
    ['[REBNY] Conditional field required: TaxLot - Condo requires LivingArea and TaxLot', ['TaxLot']],
    ['[REBNY] LivingArea: Value 0 is below minimum 1', ['LivingArea']],
    ['[REBNY] Email: Invalid email format', ['Email']],
    ['[Fair Housing] Prohibited terms found in PublicRemarks: "adults only", "no section 8". These terms may violate Fair Housing Act by implying discrimination', ['PublicRemarks']],
    ['[NYC] TaxLot is required for NYC properties', ['TaxLot']],
    ['[NYC] County mismatch: Brooklyn should have county "Kings", not "New York"', ['CountyOrParish']],
    ['[NYC] YearBuilt 670 is before 1700 - invalid', ['YearBuilt']],
    ['[NYC] YearBuilt 2090 is more than 10 years in the future - invalid', ['YearBuilt']],
    ['[FORMAT] ListingContractDate: Should be ISO 8601 date format (YYYY-MM-DD)', []],
    ['[FORMAT] Non-standard field naming detected. Canonical field names use PascalCase. Consider renaming: listing_type', []],
    ['[NYC] Co-op: Consider adding MaxFinancing (max financing percentage)', []],
    ['[Fair Housing Warning] (PublicRemarks) Avoid "perfect for [group]" - may imply targeting', []],
    ['Required field missing', []],
  ])('fields: the validator line %j names %j', (line, expected) => {
    expect(names(line)).toEqual(expected);
  });

  it('fields: every line the REAL validator answers with for a bad listing names a box (the shapes cannot drift from the validator unnoticed)', () => {
    let lines = 0;
    for (const listing of BAD_LISTINGS) {
      for (const line of validateListing(listing as any).errors) {
        lines++;
        expect({ line, names: names(line).length }).toEqual({ line, names: 1 });
      }
    }
    expect(lines).toBeGreaterThan(60);
  });

  it('words: the phrases the validator found are named with the box, together with the gate\'s, once each', () => {
    const line = '[Fair Housing] Prohibited terms found in PublicRemarks: "adults only", "no section 8". These terms may violate Fair Housing Act by implying discrimination';
    expect(p.api.words(err(p.w, 'Listing failed compliance validation', { validation: { errors: [line] } }))).toBe('Listing failed compliance validation: Public Remarks ("adults only", "no section 8")');
    const gate = { code: 'FH-001', field: 'PublicRemarks', message: 'Fair Housing violation in PublicRemarks: "adults only" - violates NY HRL (Age).' };
    const gate2 = { code: 'FH-001', field: 'PublicRemarks', message: 'Fair Housing violation in PublicRemarks: "no children" - violates NYC HRL.' };
    expect(p.api.words(err(p.w, 'refused', { blockers: [gate, gate2], validation: { errors: [line] } }))).toBe('refused: Public Remarks ("adults only", "no children", "no section 8")');
  });

  it('words: two names that lead to the same box are one name, with the phrases of both (PublicRemarks and the id of the text area the scan also read)', () => {
    const a = { code: 'FH-001', field: 'PublicRemarks', message: 'Fair Housing violation in PublicRemarks: "adults only" - x' };
    const b = { code: 'FH-001', field: 'raw:pubRemarks', message: 'Fair Housing violation in raw:pubRemarks: "adults only" - x' };
    const c = { code: 'FH-001', field: 'raw:pubRemarks', message: 'Fair Housing violation in raw:pubRemarks: "no section 8" - x' };
    expect(p.api.words(err(p.w, 'refused', { blockers: [a, b, c] }))).toBe('refused: Public Remarks ("adults only", "no section 8")');
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'raw:agentRemarks' }, { field: 'agentRemarks' }] }))).toBe('refused: Agent Remarks');          // no box on the page: the same words are one name
  });

  it('words: a field the page holds in a box that does not carry its Cotality name is named by that box\'s label', () => {
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'TaxLot' }, { field: 'ListPrice' }, { field: 'ListingContractDate' }, { field: 'PropertyType' }, { field: 'View' }] })))
      .toBe('refused: Lot Number, Monthly Rent, Exclusive Start, Property Type, Views');
    // a box that carries the Cotality name wins over the table (the sub type is the "Unit Type" box here; the property type, which no box carries, is the radios)
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'PropertySubType' }] }))).toBe('refused: Unit Type');
  });

  it('words: with no box that carries the sub type\'s name, the property type radios stand for both the property type and the sub type', () => {
    const bare = boxesPage();
    try {
      expect(bare.api.words(err(bare.w, 'refused', { blockers: [{ field: 'PropertySubType' }, { field: 'PropertyType' }] }))).toBe('refused: Property Type');        // one box, one name
    } finally { bare.close(); }
  });

  it('words: a text area that stands alone in its card is named by the card\'s heading; one among others, by the Cotality words', () => {
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'ShowingInstructions' }] }))).toBe('refused: Listing Description');
    expect(p.api.words(err(p.w, 'refused', { blockers: [{ field: 'MlsNoteA' }, { field: 'MlsNoteB' }] }))).toBe('refused: Mls Note A, Mls Note B');
  });

  it('mark: the box a field is held in under another name is marked, and a group (the views, the property types) by its block', () => {
    const q = (sel: string) => p.w.document.querySelector(sel) as HTMLElement;
    expect(p.api.mark(err(p.w, 'refused', { blockers: [{ field: 'TaxLot' }, { field: 'ListPrice' }, { field: 'View' }, { field: 'PropertyType' }] }))).toBe(true);
    for (const id of ['#bldgTaxLot', '#rentalMonthlyRent', '#viewsBlock', '#typeBlock']) expect({ id, marked: q(id).classList.contains('border-red-500') }).toEqual({ id, marked: true });
  });

  it('mark: any box of a group takes the mark off, not only the first (the second view, the second special condition)', () => {
    const fresh = boxesPage();
    try {
      const f = (sel: string) => fresh.w.document.querySelector(sel) as HTMLElement;
      expect(fresh.api.mark(err(fresh.w, 'refused', { blockers: [{ field: 'View' }, { field: 'SpecialListingConditions' }] }))).toBe(true);
      expect(f('#viewsBlock').classList.contains('border-red-500')).toBe(true);
      f('#viewStreet').dispatchEvent(new fresh.w.Event('change', { bubbles: true }));                                // the second box of the group
      expect(f('#viewsBlock').classList.contains('border-red-500')).toBe(false);
      expect(f('#viewsBlock').style.outline).toBe('');
      expect(f('#conditionsBlock').classList.contains('border-red-500')).toBe(true);
      f('#std2').dispatchEvent(new fresh.w.Event('change', { bubbles: true }));
      expect(f('#conditionsBlock').classList.contains('border-red-500')).toBe(false);
    } finally { fresh.close(); }
  });

  it('mark: two names that lead to one box mark it once and scroll to it once', () => {
    const fresh = boxesPage();
    try {
      let scrolled = 0;
      (fresh.w.document.getElementById('pubRemarks') as any).scrollIntoView = () => { scrolled++; };
      expect(fresh.api.mark(err(fresh.w, 'refused', { blockers: [{ field: 'PublicRemarks' }, { field: 'raw:pubRemarks' }] }))).toBe(true);
      expect(scrolled).toBe(1);
    } finally { fresh.close(); }
  });
});

describe.each([
  ['SALE-FORM-REDESIGN', '_saleSubmitFailed', 'div[style*="99999"]', ['Price', 'Exclusive Start', 'Tax Lot'], ['salePrice', 'saleExclusiveStart', 'saleBldgTaxLot'], 'Listing Description'],
  ['RENTAL-FORM-REDESIGN', '_rentalSubmitFailed', 'div.toast-notification', ['Monthly Rent', 'Exclusive Start Date', 'Tax Lot'], ['rentalMonthlyRent', 'rentalExclusiveStart', 'bldgTaxLot'], 'Listing Description'],
] as const)('%s: the validator\'s refusal names the boxes the page has', (form, handler, toastSelector, labels, ids, description) => {
  const refusal = async (details: unknown) => {
    const f = await bootAddForm(form, { settle: 300 });
    try {
      const failure = Object.assign(new f.w.Error('Listing failed compliance validation'), { status: 422, details });
      f.w[handler](failure, true);
      const toasts = [...f.d.querySelectorAll(toastSelector)].map((t) => t.textContent ?? '');
      return { toasts, marked: ids.map((id) => (f.d.getElementById(id) as HTMLElement).classList.contains('border-red-500')), described: (f.d.getElementById(form.startsWith('SALE') ? 'saleDescription' : 'rentalDescription') as HTMLElement).classList.contains('border-red-500') };
    } finally { f.close(); }
  };

  it('a price, a start date and a tax lot are named by the label the page gives their box, and the box is marked (they used to be named by their Cotality words)', async () => {
    const out = await refusal({ validation: { errors: ['[REBNY] Required field missing: ListPrice - x', '[REBNY] Required field missing: ListingContractDate - x', '[NYC] TaxLot is required for NYC properties'] } });
    const text = out.toasts.find((t) => /Submission failed/.test(t));
    expect(text).toContain(`Submission failed: Listing failed compliance validation: ${labels.join(', ')}. Nothing was saved to the CRM`);
    expect(out.marked).toEqual([true, true, true]);
  });

  it('a Fair Housing line of the validator is named by the description box\'s label, with its phrases, and the box is marked', async () => {
    const out = await refusal({ validation: { errors: ['[Fair Housing] Prohibited terms found in PublicRemarks: "adults only", "no section 8". These terms may violate Fair Housing Act'] } });
    const text = out.toasts.find((t) => /Submission failed/.test(t));
    expect(text).toContain(`Submission failed: Listing failed compliance validation: ${description} ("adults only", "no section 8"). Nothing was saved to the CRM`);
    expect(out.described).toBe(true);
  });

  it('the first refusal for a form the agent has filled in badly names the boxes of every line the real validator sent', async () => {
    const real = validateListing(BAD_LISTINGS[0] as any).errors;
    const out = await refusal({ validation: { errors: real } });
    const text = out.toasts.find((t) => /Submission failed/.test(t)) ?? '';
    expect(text).toMatch(/Submission failed: Listing failed compliance validation: .+ and \d+ more\. Nothing was saved to the CRM/);        // eight boxes are listed, the rest counted
  });
});
