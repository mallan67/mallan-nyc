/// <reference types="jest" />
/**
 * The Sale form's building search (the box under "Property Address - Building Lookup", searchBuildingForListing) answers what is typed NOW.
 *
 * The box asks the building index after a 300 ms pause in typing. The index answers each question in its own time, so an answer to an earlier,
 * shorter text ("800") can arrive AFTER the answer to the text typed since ("800 2nd"). Without a guard the late answer replaced the good list with
 * "No matches found" and raised the "No Cotality building match found" toast, with the right building on screen a moment before.
 * This drives the REAL page with the building index stubbed (slow for "800", immediate for "800 2nd").
 */
import { bootAddForm, sleep, until } from './add-form-harness';

jest.setTimeout(60000);
/* eslint-disable @typescript-eslint/no-explicit-any */

// What GET /api/buildings/search answers for 800 2nd Avenue (snake_case, as the route returns it; read from the live index 2026-11-01).
const CONDO_800_2ND = {
  address: '800 2ND Avenue', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', common_interest: 'Condominium',
  structure_type: 'HighRise', year_built: 1957, stories_total: 18, source: 'db',
};
const HINT = 'No Cotality building match found.';

const toasts = (f: any): string[] => [...f.d.querySelectorAll('.mallan-toast')].map((t: any) => String(t.textContent));
const typeInto = (f: any, text: string) => {
  const box = f.d.getElementById('saleBuildingSearch') as HTMLInputElement;
  box.value = text;
  box.dispatchEvent(new f.w.Event('input', { bubbles: true }));
};

describe('SALE-FORM-REDESIGN: the building search answers what is typed now', () => {
  it('a slow answer to an earlier search does not replace the answer to the text typed since', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', {
      buildings: (q) => (/2nd/i.test(q) ? [CONDO_800_2ND] : []),
      buildingsHint: HINT,
      buildingsDelay: (q) => (q === '800' ? 900 : 0),
    });
    try {
      const results = f.d.getElementById('saleBuildingSearchResults') as HTMLElement;

      typeInto(f, '800');
      await sleep(450); // past the 300 ms pause: the search for "800" is out, and answers in 900 ms
      typeInto(f, '800 2nd');
      await until(() => results.textContent!.includes('800 2ND Avenue'), 5000);

      await sleep(1100); // the slow answer for "800" arrives now
      expect(f.searched).toEqual(['800', '800 2nd']);
      expect(results.textContent).toContain('800 2ND Avenue');
      expect(results.textContent).not.toContain('No matches');
      expect(toasts(f).join('|')).not.toContain(HINT);
    } finally {
      f.close();
    }
  });

  it('answers in order still show the last answer, and a search with no match still says so', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', {
      buildings: (q) => (/2nd/i.test(q) ? [CONDO_800_2ND] : []),
      buildingsHint: HINT,
    });
    try {
      const results = f.d.getElementById('saleBuildingSearchResults') as HTMLElement;

      typeInto(f, '800');
      await until(() => results.textContent!.includes('No matches'), 5000);
      expect(toasts(f).join('|')).toContain(HINT); // typed text only: nothing newer to prefer, so the message stands

      typeInto(f, '800 2nd');
      await until(() => results.textContent!.includes('800 2ND Avenue'), 5000);
      expect(results.textContent).not.toContain('No matches');
    } finally {
      f.close();
    }
  });
});
