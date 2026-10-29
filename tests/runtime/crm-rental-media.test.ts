/// <reference types="jest" />
/**
 * The Rental Add / Edit form's Media and Documents panel, on the REAL page.
 *
 * The photo, floor plan and document boxes had no handler (the page never read a chosen file), "Save Media" called an empty function, a photo dropped on the box was opened by the
 * browser in place of the form, and a saved listing's photos were never shown. The page now uses js/forms/listing-media.js (tested apart in crm-listing-media.test.ts): these tests pin
 * the page's side of it: the boxes are wired, a new listing's files go to it when it is saved, a saved listing's photos are shown, and a page without the module says so.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, PAGE_MODULES, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('div.toast-notification')].map((t) => t.textContent ?? '');
const tiles = (f: BootedForm, id: string) => [...(f.d.getElementById(id) as HTMLElement).children] as HTMLElement[];
const choose = (f: BootedForm, inputId: string, names: string[]) => {
  const input = f.d.getElementById(inputId) as HTMLInputElement;
  const files = names.map((n, i) => { const file = new f.w.File(['x'], n, { type: 'image/jpeg' }); Object.defineProperty(file, 'size', { value: 100 + i }); return file; });
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new f.w.Event('change'));
};
const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };
const pick = (f: BootedForm, id: string) => { const s = f.d.getElementById(id) as HTMLSelectElement; s.value = [...s.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value; };
function fillRequired(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St'); pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest'); set(f, 'rentalMonthlyRent', '4200'); set(f, 'rentalDateListed', '2026-10-01'); set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01'); set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true; (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  set(f, 'rentalCity', 'New York'); pick(f, 'rentalState'); set(f, 'rentalZip', '10017'); pick(f, 'rentalBedrooms'); pick(f, 'rentalFullBathrooms');
}
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, mediaRows: [], ...o });
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };

describe(`${FORM}: the Media panel`, () => {
  it('has a place for the floor plans, says what the server takes (images up to 10MB), and offers no PDF', async () => {
    const f = await boot();
    try {
      expect(f.d.getElementById('rentalFloorplanPreview')).not.toBeNull();
      const text = (f.d.getElementById('rentalMediaModal') as HTMLElement).textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('JPEG/PNG, max 10MB each');
      expect(text).toContain('max 10MB each, JPG/PNG only');
      expect(text).not.toContain('max 20MB each, 150 dpi');
      expect((f.d.getElementById('rentalFloorplanInput') as HTMLInputElement).accept).toBe('.jpg,.jpeg,.png');
      expect((f.d.getElementById('rentalPhotoInput') as HTMLInputElement).accept).toBe('.jpg,.jpeg,.png');
    } finally { await closeAfter(f); }
  });

  it('loads the media module with the others, before the script of the page itself', () => {
    const page = readFileSync(resolve(__dirname, `../../public/crm/${FORM}.html`), 'utf8');
    const tag = page.indexOf('<script src="js/forms/listing-media.js"></script>');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeGreaterThan(page.indexOf('<script src="js/forms/listing-hydration.js"></script>'));
    expect(tag).toBeLessThan(page.indexOf('<script>', tag));
    expect(PAGE_MODULES).toContain('listing-media');                       // and the harness loads what the page loads
  });

  it('photos chosen in the box get preview tiles, and floor plans go to their own', async () => {
    const f = await boot();
    try {
      choose(f, 'rentalPhotoInput', ['kitchen.jpg', 'living.jpg']);
      choose(f, 'rentalFloorplanInput', ['plan.jpg']);
      expect(tiles(f, 'rentalPhotoPreview')).toHaveLength(2);
      expect(tiles(f, 'rentalFloorplanPreview')).toHaveLength(1);
      expect(f.d.getElementById('rentalPhotoCount')!.textContent).toBe('2 / 100 uploaded');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a photo dropped on the box is taken (and not opened by the browser)', async () => {
    const f = await boot();
    try {
      const zone = f.d.getElementById('rentalPhotoInput')!.parentElement!;
      const drop: any = new f.w.Event('drop', { cancelable: true });
      drop.dataTransfer = { files: [new f.w.File(['x'], 'dropped.jpg', { type: 'image/jpeg' })] };
      zone.dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
      expect(tiles(f, 'rentalPhotoPreview')).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it('Save Media on a listing that is not saved says to submit it first (Save Draft does not create the listing)', async () => {
    const f = await boot();
    try {
      choose(f, 'rentalPhotoInput', ['a.jpg']);
      f.w.saveRentalMedia();
      expect(toasts(f).some((t) => /Submit the listing first before uploading media/.test(t))).toBe(true);
      expect(f.requests.filter((r) => r.method === 'POST')).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('the Save Media button is the one that calls it', async () => {
    const f = await boot();
    try {
      const button = [...f.d.querySelectorAll('#rentalMediaModal button')].find((b) => b.textContent === 'Save Media') as HTMLElement;
      expect(button.getAttribute('onclick')).toContain('saveRentalMedia()');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a new listing and its files`, () => {
  it('keeps the files until the listing is saved, and then sends them to it', async () => {
    const f = await boot();
    try {
      choose(f, 'rentalPhotoInput', ['a.jpg', 'b.jpg']);
      expect(f.requests.filter((r) => /media\/upload/.test(r.url))).toEqual([]);
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.requests.filter((r) => r.method === 'POST' && /media\/upload/.test(r.url)).length === 2, 10000);
      expect(f.requests.filter((r) => r.method === 'POST' && /media\/upload/.test(r.url)).map((r) => r.url)).toEqual(Array(2).fill('/api/crm/listings/L-1/media/upload'));
      await sleep(300);
      expect(f.requests.filter((r) => r.method === 'GET' && /\/media$/.test(r.url)).length).toBeGreaterThan(0);        // the listing's photos are shown again
    } finally { await closeAfter(f); }
  });

  it('a file the server refuses is said once the listing is saved, with how many', async () => {
    const f = await boot();
    try {
      const original = f.w.fetch;
      f.w.fetch = (url: string, init: any) => (/media\/upload/.test(url) ? Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Too small' }) }) : original(url, init));
      choose(f, 'rentalPhotoInput', ['a.jpg']);
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /1 media upload\(s\) failed/.test(t)), 10000);
      expect(toasts(f).some((t) => /Upload failed for a\.jpg: Too small/.test(t))).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('the files go to the listing by the id the server gave, not by a made-up one, when the server gave no listing id', async () => {
    const f = await boot({ created: { id: '55', listing_id: undefined } });
    try {
      choose(f, 'rentalPhotoInput', ['a.jpg']);
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.requests.some((r) => r.method === 'POST' && /media\/upload/.test(r.url)), 10000);
      expect(f.requests.find((r) => r.method === 'POST' && /media\/upload/.test(r.url))!.url).toBe('/api/crm/listings/55/media/upload');
    } finally { await closeAfter(f); }
  });

  it('a listing with no files sends none', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 10000);
      await sleep(500);
      expect(f.requests.filter((r) => /media/.test(r.url))).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('after the listing is saved, a photo chosen is sent at once, after the photos the listing has', async () => {
    const f = await boot();
    try {
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 10000);
      await sleep(500);
      choose(f, 'rentalPhotoInput', ['late.jpg']);
      await until(() => f.requests.filter((r) => r.method === 'POST' && /media\/upload/.test(r.url)).length === 1, 10000);
      expect(f.requests.find((r) => r.method === 'POST' && /media\/upload/.test(r.url))!.url).toBe('/api/crm/listings/L-1/media/upload');
    } finally { await closeAfter(f); }
  });

  it('Save Media sends what is waiting for a saved listing', async () => {
    const f = await boot({ search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: {} } });
    try {
      await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
      f.w.MallanAPI.isReady = false;                                           // the network client is not up: the files wait for the button
      choose(f, 'rentalPhotoInput', ['a.jpg']);
      await sleep(200);                                                         // an upload would start a moment after the file is chosen
      expect(f.requests.filter((r) => /media\/upload/.test(r.url))).toEqual([]);
      expect(f.w.eval('_rentalMedia').hasPending()).toBe(true);
      f.w.saveRentalMedia();
      await until(() => f.requests.some((r) => r.method === 'POST' && /media\/upload/.test(r.url)), 10000);
      expect(f.requests.filter((r) => r.method === 'POST' && /media\/upload/.test(r.url)).map((r) => r.url)).toEqual(['/api/crm/listings/RL-1/media/upload']);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a saved listing`, () => {
  const rows = [
    { media_key: 'k1', media_type: 'Photo', url: 'https://cdn.example/k1.webp', preferred_photo_yn: true },
    { media_key: 'k2', media_type: 'Photo', url: 'https://cdn.example/k2.webp' },
    { media_key: 'f1', media_type: 'FloorPlan', url: 'https://cdn.example/f1.webp' },
  ];

  it('shows its photos and floor plans as tiles when it is opened', async () => {
    const f = await boot({ search: '?id=RL-1', listing: { id: '77', listing_id: 'RL-1', status: 'Draft', raw_data: {} }, mediaRows: rows });
    try {
      await until(() => tiles(f, 'rentalPhotoPreview').length === 2, 20000);
      expect(tiles(f, 'rentalPhotoPreview').map((t) => t.getAttribute('data-media-key'))).toEqual(['k1', 'k2']);
      expect(tiles(f, 'rentalFloorplanPreview').map((t) => t.getAttribute('data-media-key'))).toEqual(['f1']);
      expect(f.d.getElementById('rentalPhotoCount')!.textContent).toBe('2 / 100 uploaded');
      expect(f.requests.some((r) => r.method === 'GET' && r.url === '/api/crm/listings/RL-1/media')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('forgets files chosen for another record when it is put in the form', async () => {
    const f = await boot({ search: '?id=RL-1', listing: { id: '77', listing_id: 'RL-1', status: 'Draft', raw_data: {} }, mediaRows: [] });
    try {
      await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
      f.w.MallanAPI.isReady = false;
      choose(f, 'rentalPhotoInput', ['a.jpg']);
      expect(f.w.eval('_rentalMedia').hasPending()).toBe(true);
      f.w._populateRentalFormFromApi({ id: '78', listing_id: 'RL-2', status: 'Draft', raw_data: {} });
      expect(f.w.eval('_rentalMedia').hasPending()).toBe(false);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: a page that could not load the media module`, () => {
  const without = PAGE_MODULES.filter((m) => m !== 'listing-media');

  it('still boots, and a file chosen says the manager did not load', async () => {
    const f = await boot({ modules: without });
    try {
      expect(f.errors).toEqual([]);
      choose(f, 'rentalPhotoInput', ['a.jpg']);
      expect(toasts(f).some((t) => /media manager did not load/.test(t))).toBe(true);
      expect(tiles(f, 'rentalPhotoPreview')).toHaveLength(0);
    } finally { await closeAfter(f); }
  });

  it('Save Media says so too, and a saved listing still opens', async () => {
    const f = await boot({ modules: without, search: '?id=1', listing: { id: '1', listing_id: 'RL-1', status: 'Draft', raw_data: {} } });
    try {
      await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
      expect(f.errors).toEqual([]);
      f.w.saveRentalMedia();
      expect(toasts(f).some((t) => /media manager did not load/.test(t))).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('submits a listing without it', async () => {
    const f = await boot({ modules: without });
    try {
      fillRequired(f);
      f.w.alert = () => undefined;
      f.w.submitRentalListing();
      await until(() => f.saved.length > 0, 10000);
      await sleep(500);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
