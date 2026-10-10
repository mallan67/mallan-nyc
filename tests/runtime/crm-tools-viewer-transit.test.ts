/// <reference types="jest" />
/**
 * The transit section of the Tools viewers (SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS), on the REAL pages.
 *
 * The viewers listed "nearby transit" from the center of the listing's ZIP code to a short list of Manhattan stops, and put every ZIP code their table did not know on the Upper East Side (a Brooklyn
 * listing was shown the 86th St stops a few minutes' walk away), and their "Commute Calculator" ignored the work address that was typed and made its times up from the distance to Midtown. Now a ZIP code
 * the table does not know is told so, the stops say how they were measured, and the calculator is gone until there is routing data to work the times out from.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootViewer, rendered, sleep, until, type Booted, type ViewerFile } from './tools-viewer-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe.each([
  ['SALE-FORM-WITH-TOOLS', 'sale', 'Sale', 'SL-0404'],
  ['RENTAL-FORM-WITH-TOOLS', 'rental', 'Rental', 'RL-0404'],
] as const)('%s: nearby transit', (viewer, prefix, Prefix, lid) => {
  const zipId = `${prefix}ZipCode`;
  async function open(raw: Record<string, unknown> = {}): Promise<Booted> {
    const b = bootViewer(viewer as ViewerFile, { search: `?id=${lid}`, listing: { id: '404', listing_id: lid, status: 'Active', raw_data: raw } });
    await until(() => rendered(b.d), 15000);
    await sleep(300);
    return b;
  }
  const results = (b: Booted) => text(b.d.getElementById(`${prefix}TransitResults`));
  const lookup = (b: Booted, zip: string) => { (b.d.getElementById(zipId) as HTMLInputElement).value = zip; b.w[`update${Prefix}Transit`](); return results(b); };

  describe('the stops', () => {
    let b: Booted;
    beforeAll(async () => { b = await open(); });
    afterAll(() => { b.close(); });

    it('are listed for a ZIP code the table knows, with how they were measured', () => {
      const shown = lookup(b, '10021');
      expect(shown).toContain('77th St');
      expect(shown).toContain('min walk');
      expect(shown).toContain('center of ZIP code 10021');
      expect(shown).toContain('not a route');
    });

    it('are listed in their own sections: the subway stops, then the bus stops, then the ferry (10128 has all three within reach)', () => {
      lookup(b, '10128');
      const sections: Record<string, string[]> = { subway: [], bus: [], ferry: [] };
      let current = 'subway';
      for (const child of [...b.d.getElementById(`${prefix}TransitResults`)!.children]) {
        const label = text(child);
        if (label === 'Bus') { current = 'bus'; continue; }
        if (label === 'Ferry') { current = 'ferry'; continue; }
        const name = child.querySelector('.text-sm.font-medium');
        if (name) sections[current].push(text(name));
      }
      const buses = ['M86 Crosstown', 'M79 Crosstown', 'M96 Crosstown', 'M101/102/103'];
      expect(sections.subway.length).toBeGreaterThan(0);
      expect(sections.subway.length).toBeLessThanOrEqual(4);
      expect(sections.subway.filter((n) => buses.includes(n) || /Ferry/.test(n))).toEqual([]);
      expect(sections.bus.length).toBeGreaterThan(0);
      expect(sections.bus.length).toBeLessThanOrEqual(2);
      expect(sections.bus.filter((n) => !buses.includes(n))).toEqual([]);
      expect(sections.ferry).toEqual(['East 90th St Ferry']);
    });

    it.each(['11201', '10022', 'default', 'constructor', '__proto__'])('are not made up for ZIP code %s, which the table does not know: it is told so', (zip) => {
      const shown = lookup(b, zip);
      expect(shown).toBe(`No transit stops are listed for ZIP code ${zip} yet: this page's list covers part of Manhattan only.`);
    });

    it('say so when a ZIP code the table knows has no listed stop within 0.75 miles', () => {
      expect(lookup(b, '10002')).toBe('No listed transit stops are within 0.75 miles of the center of ZIP code 10002.');
    });

    it('say so when the listing has no ZIP code', () => {
      expect(lookup(b, '')).toBe('This listing has no ZIP code, so no nearby transit can be worked out.');
    });

    it('show the ZIP code as text, never as markup', () => {
      const zip = '<img src=x onerror=alert(1)>';
      expect(lookup(b, zip)).toContain(zip);
      expect(b.d.querySelector(`#${prefix}TransitResults img`)).toBeNull();
      expect(b.errors).toEqual([]);
    });

    it('are the section of the Nearby Transit card, called by what it shows', () => {
      const card = b.d.getElementById(`${prefix}TransitSection`)!;
      expect(text(card.querySelector('.form-card-header'))).toBe('Nearby Transit');
    });
  });

  it('are worked out for the listing the viewer was opened with', async () => {
    const b = await open({ [zipId]: '10021' });
    try {
      expect(results(b)).toContain('77th St');
      expect(results(b)).toContain('center of ZIP code 10021');
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });

  it('start, before any ZIP code is looked up, with the line a listing with no ZIP code is given (the page says the same thing both ways)', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${viewer}.html`), 'utf8');
    const box = new JSDOM(html).window.document.getElementById(`${prefix}TransitResults`);          // (no script is run)
    expect(text(box)).toBe('This listing has no ZIP code, so no nearby transit can be worked out.');
  });

  it('leave no mention of the commute calculator, or of the default place a ZIP code was given, in the page', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${viewer}.html`), 'utf8');
    expect(html).not.toMatch(/CommuteAddress|CommuteResults|calc(Sale|Rental)Commute|getFormListingLatLng/);
    expect(html).not.toContain("NYC_GEOCODE_APPROX['default']");
  });

  it('come with no commute calculator: it ignored the work address and made its times up, so it is gone, and the card says why', async () => {
    const b = await open();
    try {
      expect(b.d.getElementById(`${prefix}CommuteAddress`)).toBeNull();
      expect(b.d.getElementById(`${prefix}CommuteResults`)).toBeNull();
      expect(typeof b.w[`calc${Prefix}Commute`]).toBe('undefined');
      const card = b.d.getElementById(`${prefix}TransitSection`)!;
      expect(text(card)).toContain('Commute times are not shown: this page has no routing data.');
      expect([...card.querySelectorAll('button')].map((x) => text(x))).toEqual([]);
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });
});
