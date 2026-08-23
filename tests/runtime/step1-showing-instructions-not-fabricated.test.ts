/// <reference types="jest" />
/**
 * STEP 1, ITEM 2 — SHOWING INSTRUCTIONS ARE NOT INVENTED, AND ESPECIALLY NOT
 * INVENTED OUT OF AGENT PII.
 *
 * Three sites rendered this when the field was absent:
 *
 *     listing.showingInstructions || '(UCOM) ' + listing.agentName + ' ' + listing.agentPhone
 *
 * Two separate defects, and the second is the serious one.
 *
 * 1. "(UCOM)" is a showing procedure. Printing it on a listing whose procedure
 *    nobody stated tells the broker how to show someone else's property. When
 *    agentName and agentPhone are also absent it degrades to the literal string
 *    "(UCOM)  " — an instruction consisting of a code and two spaces.
 *
 * 2. `showingInstructions` is not usually absent by accident. `lib/compliance/
 *    dto.ts:169-170` NULLS IT DELIBERATELY, in the same block that strips
 *    AGENT_PII_FIELDS (dto.ts:38-52, incl. ListAgentDirectPhone and
 *    ListAgentFullName). So the fallback reconstructed a substitute for a
 *    deliberately suppressed field OUT OF THE EXACT CATEGORY OF DATA the same
 *    function had just stripped. The suppression was inverted by the renderer.
 *
 * Site three is `printListingDetail()` — the sheet a broker hands to a client —
 * so the reconstructed agent phone left the building on paper.
 *
 * Missing instructions stay missing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const PAGINATION = 'public/crm/js/search/pagination.js';

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as any;
  const printed: string[] = [];

  win.LOGGED_IN_AGENT = { id: 1 };
  win.escapeHtml = (s: string) => String(s == null ? '' : s);
  win.showToast = () => {};
  win.fetch = () => Promise.reject(new Error('no network in tests'));
  win.listings = [];
  win.searchResultsState = { filteredListings: null, selectedListings: [] };

  // reso-field-map defines ownershipLabel(), which the print sheet calls.
  for (const rel of ['public/crm/js/core/reso-field-map.js', PAGINATION]) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }

  // Capture the sheet instead of opening it.
  win.openPrintableWindow = (html: string) => printed.push(html);
  return { win, printed };
}

/** A listing whose showing procedure nobody stated — the suppressed case. */
const noInstructions = () => ({
  id: 'RLS20000001',
  address: '15 E 91st St', unit: '4A', status: 'ACTIVE', price: 1250000,
  showingInstructions: null,
  agentName: 'Jordan Reyes',
  agentPhone: '646-555-0142',
  images: [],
});

const sheetFor = (listing: any) => {
  const { win, printed } = mount();
  win.listings = [listing];
  win._detailCurrentId = listing.id;
  win.printListingDetail();
  // A sheet that never got built would make every "does not contain" assertion
  // below pass for the wrong reason.
  expect(printed.length).toBe(1);
  return printed.join('');
};

describe('the (UCOM) fallback is gone from every site', () => {
  it('no longer appears anywhere in the source', () => {
    expect(readFileSync(join(REPO, PAGINATION), 'utf8')).not.toMatch(/\(UCOM\)/);
  });

  it('does not synthesise instructions from the agent name and phone', () => {
    const src = readFileSync(join(REPO, PAGINATION), 'utf8');
    expect(src).not.toMatch(/showingInstructions \|\|[^\n]*agentPhone/);
  });
});

describe('the printed client sheet carries no invented procedure', () => {
  it('does not print an agent phone AS the showing instructions', () => {
    // CORRECTED: my first version asserted the phone appears nowhere on the
    // sheet. That was too broad and would have failed for the right reason in
    // the wrong place — the sheet has a legitimate "Listing Agent" block that
    // carries it. The defect is the SUBSTITUTION, so the assertion is scoped to
    // the section that was doing the substituting.
    //
    // Whether a client-facing sheet should carry the listing agent's direct
    // phone at all is a live question — `lib/compliance/dto.ts:40` strips
    // ListAgentDirectPhone for the public tier — but it is a compliance-tier
    // decision about real data, not an invented-data defect, so it is reported
    // to Maya rather than changed here.
    const sheet = sheetFor(noInstructions());
    const section = sheet.slice(sheet.indexOf('Showing Instructions'));
    expect(section.slice(0, 400)).not.toContain('646-555-0142');
  });

  it('does not print an agent name in place of the instructions', () => {
    const sheet = sheetFor(noInstructions());
    const section = sheet.slice(sheet.indexOf('Showing Instructions'));
    expect(section.slice(0, 400)).not.toContain('Jordan Reyes');
  });

  it('says the instructions are unavailable instead of inventing them', () => {
    const sheet = sheetFor(noInstructions());
    expect(sheet).toContain('Showing Instructions');
    const section = sheet.slice(sheet.indexOf('Showing Instructions'));
    expect(section.slice(0, 400)).toMatch(/not provided|unavailable|not available/i);
  });

  it('still prints real instructions verbatim when the provider supplied them', () => {
    const sheet = sheetFor({ ...noInstructions(), showingInstructions: 'Call listing office 24h ahead. Lockbox on rear door.' });
    expect(sheet).toContain('Call listing office 24h ahead. Lockbox on rear door.');
  });
});

/**
 * A REGRESSION MY OWN ITEM-1 FIX CREATED, caught by this suite before it shipped.
 *
 * `printListingDetail()` never had null-safe formatting of its own. It did not
 * need any: `showListingDetail()` ran first and wrote `price = 0` into the
 * SHARED record, so by the time the broker clicked Print the nulls were already
 * gone. The sheet printed $0 — false, but it printed.
 *
 * Item 1 stopped that mutation. So nulls now reach this function and
 * `listing.price.toLocaleString()` throws, and the sheet silently never opens.
 *
 * The fix is not to restore the mutation. It is to format honestly here too:
 * an unknown price prints as unavailable, exactly as it now does on screen.
 */
describe('the printed sheet survives — and does not print $0 for an unknown price', () => {
  const nullNumerics = () => ({
    id: 'RLS20000002', address: '15 E 91st St', unit: '4A', status: 'ACTIVE',
    price: null, maintCC: null, totalMonthly: null, reTaxes: null,
    beds: null, baths: null, rooms: null,
    showingInstructions: null, images: [],
  });

  it('still produces a sheet when the numbers are unknown', () => {
    expect(sheetFor(nullNumerics()).length).toBeGreaterThan(0);
  });

  it('does not print $0 for a price nobody supplied', () => {
    expect(sheetFor(nullNumerics())).not.toMatch(/\$0/);
  });

  it('says unavailable where the number is unknown', () => {
    expect(sheetFor(nullNumerics())).toMatch(/Unavailable/);
  });

  it('still prints a real price exactly', () => {
    expect(sheetFor({ ...nullNumerics(), price: 1250000 })).toContain('1,250,000');
  });
});

/**
 * WHILE IN THE SAME FUNCTION — the sheet prints the literal word "undefined".
 *
 * `printListingDetail()` interpolates a dozen fields raw. Before item 1 the
 * mutation in `showListingDetail()` had filled several of them in first, so
 * this was partly masked; it was never fully masked, because the mutation only
 * covered nine fields and this function reads far more.
 *
 * "undefined" on a screen is a bug. On a document a broker hands to a client it
 * is the brokerage's letterhead over a rendering error. It is also strictly
 * worse than the invented values Step 1 is removing, because it is not even
 * plausible.
 *
 * Scoped deliberately: this fixes the sheet already open on the bench, using
 * the `num()` helper item 2 already added to it. The wider ~94-site display
 * audit stays reported as its own item.
 */
describe('the client sheet never prints the word undefined', () => {
  const sparse = () => ({
    id: 'RLS20000003', address: '15 E 91st St', unit: '4A', status: 'ACTIVE',
    price: 1250000, images: [], showingInstructions: null,
    // everything else absent, as a provider row legitimately can be
  });

  it('prints no "undefined" anywhere on the sheet', () => {
    expect(sheetFor(sparse())).not.toMatch(/\bundefined\b/);
  });

  it('prints no "null" anywhere on the sheet either', () => {
    const nulls = { ...sparse(), beds: null, dom: null, neighborhood: null, listedDate: null };
    expect(sheetFor(nulls)).not.toMatch(/>null</);
  });
});
