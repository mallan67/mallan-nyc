/// <reference types="jest" />
/**
 * Every free-text box of the two Add forms is one the Fair Housing scan of the write routes reads.
 *
 * Found 2026-10-09 by an independent read-only review of the scan (lib/compliance/listing-fair-housing.ts): it read a request key as free text only when its NAME said so (remark, description,
 * instruction, headline, comment, note, caption). Three textareas (the layout of a townhouse / house, the financing terms) and two rental-building inputs ("Min. income" with the placeholder
 * "40x monthly rent", "Max. occupants": "2 per bedroom") have ids that do not, so a phrase typed into them ("no vouchers", "no children") was saved without a word from the server.
 * FREE_TEXT_IDS names those five; this test holds every textarea of both pages to the scan, so the next textarea added under such an id fails here instead of being saved unread.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { FREE_TEXT_IDS, isFreeTextKey } from '@/lib/compliance/listing-fair-housing';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
const PAGES = ['SALE-FORM-REDESIGN', 'RENTAL-FORM-REDESIGN'] as const;
const doc = (page: string): Document => new JSDOM(readFileSync(resolve(__dirname, `../../public/crm/${page}.html`), 'utf8')).window.document;

describe('the Fair Housing scan reads every free-text box of the Add forms', () => {
  it.each(PAGES)('%s: every textarea is read by the scan (its id names free text, or it is in FREE_TEXT_IDS)', (page) => {
    const textareas = [...doc(page).querySelectorAll('textarea')].map((el) => el.id || el.getAttribute('name') || '');
    expect(textareas.length).toBeGreaterThan(5);                                   // the guard is not vacuous
    expect(textareas.filter((id) => !id)).toEqual([]);                             // a textarea with no id or name would post under nothing
    expect(textareas.filter((id) => !isFreeTextKey(id))).toEqual([]);
  });

  it('every id of FREE_TEXT_IDS is a real control of one of the pages (a renamed box cannot leave a dead entry that reads nothing)', () => {
    const ids = new Set<string>();
    for (const page of PAGES) doc(page).querySelectorAll('[id]').forEach((el) => ids.add(el.id));
    expect(FREE_TEXT_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('the two rental-building inputs are text inputs that hold prose-like policies (the reason they are listed)', () => {
    const rental = doc('RENTAL-FORM-REDESIGN');
    for (const id of ['bldgMinIncome', 'bldgMaxOccupants']) {
      const el = rental.getElementById(id) as HTMLInputElement | null;
      expect(el).not.toBeNull();
      expect(el?.tagName).toBe('INPUT');
      expect(el?.getAttribute('placeholder')).toBeTruthy();
    }
    expect(rental.getElementById('bldgMinIncome')?.getAttribute('placeholder')).toMatch(/40x monthly rent/i);
  });

  it('the key test is by name or by the listed id, and a structured value\'s name is not free text', () => {
    for (const key of ['PublicRemarks', 'saleBrokerComments', 'webHeadline', 'saleTHNotes', 'imageCaption', 'showingInstructions']) expect(isFreeTextKey(key)).toBe(true);
    for (const key of FREE_TEXT_IDS) expect(isFreeTextKey(key)).toBe(true);
    for (const key of ['property_sub_type', 'status', 'ListPrice', 'saleTHBedrooms', 'bldgYearBuilt', 'LayoutType']) expect(isFreeTextKey(key)).toBe(false);
  });
});
