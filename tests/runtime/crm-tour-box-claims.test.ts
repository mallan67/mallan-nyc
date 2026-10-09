/// <reference types="jest" />
/**
 * The six tour / video boxes of the Add forms and the Tools viewers claim only what they send.
 *
 * Found 2026-10-09 (Maya: "there is no noise, there are errors and the need fixing. Do not assume, do actual corrections"; her media request of 2026-10-08: "there are no videos or virtual tours").
 * Only "Unbranded Tour URL" is sent under a Cotality field name (VirtualTourURLUnbranded, which the public site reads). The other five boxes are saved under their own ids, which the public site does not read.
 * They nevertheless claimed Cotality fields: "Video URL" claimed VirtualTourURLBranded and "Video Tour URL" VirtualTourURLUnbranded (the same fields as the tour boxes; the first input that carries a field is
 * where a server refusal about it is shown, and for VirtualTourURLUnbranded that was the Video Tour URL box), "Branded Tour URL" claimed VirtualTourURLUnbranded2 while its help text said VirtualTourURLBranded,
 * the second and third Unbranded boxes claimed their fields, and the help text of the video boxes said "RLS/RESO/IDX: VideoURL" / "Video2URL", which are not Cotality fields (scripts/trestle-forbidden-fields.ts).
 *
 * WHAT THIS DOES NOT DO: it does not send those five boxes anywhere. Whether they should be published (agent-typed links on the public page; the branded one, which UCBA Art. I Sec. 5(C) prefers
 * unbranded; the links already stored) and in which fields is a decision of Maya's that stays open (the parked change "FM-2"). The second and third tests pin what is sent TODAY, so that the day that decision is
 * made, the change to the collector and to this test is knowing.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, storedListing, type AddForm } from './add-form-harness';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGES = [
  ['SALE-FORM-REDESIGN', 'sale'], ['RENTAL-FORM-REDESIGN', 'rental'], ['SALE-FORM-WITH-TOOLS', 'sale'], ['RENTAL-FORM-WITH-TOOLS', 'rental'],
] as const;
const read = (name: string) => readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8');

/** The five boxes that are saved under their own ids and sent under no Cotality field name. */
const OWN_ID_BOXES = (p: string) => [`${p}VideoUrl`, `${p}VideoTourUrl`, `${p}MatterportUrl`, `${p}VirtualTourUnbranded2`, `${p}VirtualTourUnbranded3`];
const URL_OF: Record<string, string> = {
  Video: 'https://youtube.com/watch?v=video-one', VideoTour: 'https://vimeo.com/987654321', Matterport: 'https://tour.example.com/branded/one',
  Unbranded: 'https://my.matterport.com/show/?m=unbranded-one', Unbranded2: 'https://www.youtube.com/watch?v=unbranded-two', Unbranded3: 'https://vimeo.com/123456789',
};
const boxUrls = (p: string): Array<[string, string]> => [
  [`${p}VideoUrl`, URL_OF.Video], [`${p}VideoTourUrl`, URL_OF.VideoTour], [`${p}MatterportUrl`, URL_OF.Matterport],
  [`${p}VirtualTourUnbranded`, URL_OF.Unbranded], [`${p}VirtualTourUnbranded2`, URL_OF.Unbranded2], [`${p}VirtualTourUnbranded3`, URL_OF.Unbranded3],
];

describe('the markup: only the box that is sent claims a tour field', () => {
  it.each(PAGES)('%s', (file, p) => {
    const doc: Document = new JSDOM(read(file)).window.document;
    // the Unbranded Tour URL box is the one that is sent as VirtualTourURLUnbranded, and the one input of the page that claims any tour field
    expect(doc.getElementById(`${p}VirtualTourUnbranded`)!.getAttribute('data-rls-field')).toBe('VirtualTourURLUnbranded');
    const claims = [...doc.querySelectorAll('[data-rls-field]')].filter((e) => /^VirtualTour/.test(String(e.getAttribute('data-rls-field')))).map((e) => `${e.id}=${e.getAttribute('data-rls-field')}`);
    expect(claims).toEqual([`${p}VirtualTourUnbranded=VirtualTourURLUnbranded`]);
    for (const id of OWN_ID_BOXES(p)) {
      const box = doc.getElementById(id)!;
      expect(box).not.toBeNull();
      expect(box.hasAttribute('data-rls-field')).toBe(false);
      const help = String(box.parentElement!.querySelector('p')?.textContent ?? '');
      expect(help).toMatch(/Not sent to a Cotality field/);
      expect(help).not.toMatch(/RLS\/RESO\/IDX/);
      expect(help).not.toMatch(/Video2?URL/);
    }
    // and the one that is sent still says which field it is
    expect(String(doc.getElementById(`${p}VirtualTourUnbranded`)!.parentElement!.querySelector('p')?.textContent)).toMatch(/RLS\/RESO\/IDX: VirtualTourURLUnbranded$/);
  });
});

describe.each([['SALE-FORM-REDESIGN', 'sale', 'collectSaleFormData'], ['RENTAL-FORM-REDESIGN', 'rental', 'collectRentalFormData']] as const)('%s: what is sent today', (form, p, collector) => {
  const set = (f: any, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };

  it('only the Unbranded Tour URL is sent as a Cotality field; the five other boxes are saved under their own ids (a decision of Maya\'s, not made here)', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      for (const [id, url] of boxUrls(p)) set(f, id, url);
      const data = f.w[collector]();
      expect(data.VirtualTourURLUnbranded).toBe(URL_OF.Unbranded);
      for (const field of ['VirtualTourURLBranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLUnbranded3']) expect(data[field]).toBeUndefined();
      for (const [id, url] of boxUrls(p)) expect({ id, saved: data[id] }).toEqual({ id, saved: url });
    } finally { f.close(); }
  });

  it('a saved listing comes back with every box filled', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    let stored: Record<string, any>;
    try {
      for (const [id, url] of boxUrls(p)) set(f, id, url);
      stored = storedListing(f.w[collector](), p === 'sale' ? 'sale' : 'rent') as Record<string, any>;
    } finally { f.close(); }
    const g = await bootAddForm(form as AddForm, { search: '?id=1', listing: stored, settle: 1500 });
    try {
      for (const [id, url] of boxUrls(p)) expect({ id, shown: (g.d.getElementById(id) as HTMLInputElement).value }).toEqual({ id, shown: url });
    } finally { g.close(); }
  });
});
