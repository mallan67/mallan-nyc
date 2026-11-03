/// <reference types="jest" />
/**
 * The Media window of the Sale form (SALE-FORM-REDESIGN.html), Maya 2026-11-03: "it works now i can drag it but the fill of loader and the actual format looks very outdated".
 *
 * What was outdated, and is now proven on the real page:
 *  - The upload boxes said "Drag and drop photos here" but only opened the file picker: a file dropped on one was opened by the browser in place of the form. They now take dropped files
 *    (the same way as chosen ones, with the file types each box lists), light up while files are over them, and work from the keyboard.
 *  - Nothing showed how an upload was going. The window's header now carries a strip (which file, how many, whether any failed) and each waiting file's own tile says Uploading / Uploaded / Upload failed.
 *  - The tiles' buttons were visible only on mouse hover, so a phone or tablet had no cover / move / remove. They stay hover-revealed on a mouse and are always shown on a touch screen.
 *
 * Behaviour that already existed (move, cover, remove, drag-to-reorder, ids as attribute values, nothing as markup) stays pinned by crm-sale-media-tiles.test.ts.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, sleep, until, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

const SAVED = { id: '1', listing_id: 'L-1', status: 'Draft', address: {}, features: {}, agent_info: {}, raw_data: {}, media: [] };
const BOXES = [
  { input: 'salePhotoInput', kind: 'photo', preview: 'salePhotoPreview' },
  { input: 'saleFloorplanInput', kind: 'floorplan', preview: 'saleFloorplanPreview' },
  { input: 'saleDocInput', kind: 'document', preview: 'saleDocPreview' },
] as const;

const file = (f: BootedForm, name: string, type = 'image/jpeg') => new f.w.File(['x'], name, { type });
const zoneOf = (f: BootedForm, inputId: string) => f.d.getElementById(inputId)!.parentElement as HTMLElement;
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('.mallan-toast')].map((t) => t.textContent ?? '');
/** A drag event the way a browser raises one: `types` says what is being dragged ('Files' for files from the desktop, 'text/plain' for a tile of the page) */
const drag = (f: BootedForm, type: string, files: unknown[] = [], types: string[] = ['Files']) => {
  const ev = new f.w.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { types, files } });
  return ev as Event;
};
const tilesOf = (f: BootedForm, box: string) => [...f.d.querySelectorAll(`#${box} > *`)] as HTMLElement[];
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
async function boot(extra: Record<string, unknown> = {}): Promise<BootedForm> {
  const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 800, ...extra });
  f.w.URL.createObjectURL = () => 'blob:preview';
  return f;
}

describe('the upload boxes take dropped files', () => {
  it.each(BOXES)('the $kind box is a button the keyboard can use: Enter and Space open the file picker, other keys do not', async ({ input }) => {
    const f = await boot();
    try {
      const zone = zoneOf(f, input);
      expect(zone.getAttribute('role')).toBe('button');
      expect(zone.getAttribute('tabindex')).toBe('0');
      expect(zone.getAttribute('aria-label')).toMatch(/choose files, or drop them here/);
      let opened = 0;
      (f.d.getElementById(input) as HTMLInputElement).click = () => { opened++; };
      for (const key of ['Enter', ' ', 'a', 'Tab']) zone.dispatchEvent(new f.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      expect(opened).toBe(2);
    } finally { f.close(); }
  });

  it('the photo box queues the JPG and PNG files dropped on it as the files chosen with its picker are, and names each file it cannot take', async () => {
    const f = await boot();
    try {
      const drop = drag(f, 'drop', [file(f, 'a.jpg'), file(f, 'b.PNG', 'image/png'), file(f, 'notes.txt', 'text/plain'), file(f, 'iphone.heic', 'image/heic')]);
      zoneOf(f, 'salePhotoInput').dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);                                             // the browser does not open the file in place of the form
      expect(tilesOf(f, 'salePhotoPreview').map((t) => text(t.querySelector('p')))).toEqual(['a.jpg', 'b.PNG']);
      expect(f.d.getElementById('salePhotoCount')!.textContent).toBe('2 / 100 uploaded');
      const said = toasts(f).join(' | ');
      expect(said).toContain('"notes.txt" is not a JPG or PNG image.');
      expect(said).toContain('"iphone.heic" is not a JPG or PNG image.');
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('the floor plan box takes JPG, PNG and PDF; the documents box takes PDF, DOC and DOCX; each refuses the other\'s files', async () => {
    const f = await boot();
    try {
      zoneOf(f, 'saleFloorplanInput').dispatchEvent(drag(f, 'drop', [file(f, 'plan.pdf', 'application/pdf'), file(f, 'plan2.png', 'image/png'), file(f, 'terms.docx', 'application/msword')]));
      expect(tilesOf(f, 'saleFloorplanPreview').map((t) => text(t.querySelector('p')))).toEqual(['plan.pdf', 'plan2.png']);
      expect(toasts(f).join(' | ')).toContain('"terms.docx" is not a JPG, PNG or PDF.');
      zoneOf(f, 'saleDocInput').dispatchEvent(drag(f, 'drop', [file(f, 'offering.pdf', 'application/pdf'), file(f, 'budget.DOCX', 'application/octet-stream'), file(f, 'photo.jpg')]));
      expect(tilesOf(f, 'saleDocPreview').map((r) => text(r))).toEqual([expect.stringContaining('offering.pdf'), expect.stringContaining('budget.DOCX')]);
      expect(toasts(f).join(' | ')).toContain('"photo.jpg" is not a PDF, DOC or DOCX.');
    } finally { f.close(); }
  });

  it('the box lights up while files are over it and goes back when they leave or are dropped; a photo tile being dragged does not light it', async () => {
    const f = await boot();
    try {
      const zone = zoneOf(f, 'salePhotoInput');
      zone.dispatchEvent(drag(f, 'dragenter'));
      expect(zone.classList.contains('mm-over')).toBe(true);
      zone.dispatchEvent(drag(f, 'dragleave'));
      expect(zone.classList.contains('mm-over')).toBe(false);
      zone.dispatchEvent(drag(f, 'dragover'));
      expect(zone.classList.contains('mm-over')).toBe(true);
      zone.dispatchEvent(drag(f, 'drop', []));
      expect(zone.classList.contains('mm-over')).toBe(false);
      const tileDrag = drag(f, 'dragover', [], ['text/plain']);
      zone.dispatchEvent(tileDrag);
      expect(zone.classList.contains('mm-over')).toBe(false);
      expect(tileDrag.defaultPrevented).toBe(false);
      const tileDrop = drag(f, 'drop', [file(f, 'x.jpg')], ['text/plain']);
      zone.dispatchEvent(tileDrop);
      expect(tilesOf(f, 'salePhotoPreview')).toHaveLength(0);                                // not files from the desktop: nothing is queued
    } finally { f.close(); }
  });

  it('a file dropped beside the boxes is not opened by the browser (the listing being typed would be lost); a tile dragged across the window is left alone', async () => {
    const f = await boot();
    try {
      const modal = f.d.getElementById('saleMediaModal')!;
      for (const type of ['dragover', 'drop']) {
        const missed = drag(f, type, [file(f, 'x.jpg')]);
        modal.querySelector('h3')!.dispatchEvent(missed);
        expect(missed.defaultPrevented).toBe(true);
        const tile = drag(f, type, [], ['text/plain']);
        modal.querySelector('h3')!.dispatchEvent(tile);
        expect(tile.defaultPrevented).toBe(false);
      }
      expect(tilesOf(f, 'salePhotoPreview')).toHaveLength(0);
    } finally { f.close(); }
  });

  it('on a saved listing the dropped photos go to the listing at once, like chosen ones', async () => {
    const f = await boot({ search: '?id=1', listing: SAVED, settle: 1500 });
    try {
      zoneOf(f, 'salePhotoInput').dispatchEvent(drag(f, 'drop', [file(f, 'a.jpg'), file(f, 'b.jpg')]));
      await until(() => f.requests.filter((r) => r.method === 'POST' && /\/api\/crm\/listings\/L-1\/media\/upload$/.test(r.url)).length === 2, 10000);
    } finally { f.close(); }
  });
});

describe('the upload strip and the state of each waiting file', () => {
  const stage = async (f: BootedForm, names: string[], type = 'photo') => {
    f.w.handleSaleMediaUpload({ target: { files: names.map((n) => file(f, n, n.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')), value: 'x' } }, type);
  };
  /** replaces the page's fetch with one whose answers the test gives, one request at a time */
  const gated = (f: BootedForm) => {
    const waiting: Array<(answer: unknown) => void> = [];
    f.w.fetch = () => new Promise((resolveAnswer) => { waiting.push(resolveAnswer); });
    return {
      count: () => waiting.length,
      ok: (n: number) => waiting[n]({ ok: true, status: 200, json: async () => ({ photo: { url: '' } }) }),
      fail: (n: number) => waiting[n]({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }),
    };
  };
  const strip = (f: BootedForm) => ({
    shown: f.d.getElementById('saleMediaProgress')!.classList.contains('mm-on'),
    kind: ['mm-ok', 'mm-bad'].find((c) => f.d.getElementById('saleMediaProgress')!.classList.contains(c)) ?? '',
    label: text(f.d.getElementById('saleMediaProgressLabel')),
    name: text(f.d.getElementById('saleMediaProgressName')),
    width: (f.d.getElementById('saleMediaProgressBar') as HTMLElement).style.width,
    now: f.d.getElementById('saleMediaProgressTrack')!.getAttribute('aria-valuenow'),
  });
  const stateOf = (f: BootedForm, name: string) => {
    const tile = tilesOf(f, 'salePhotoPreview').find((t) => text(t.querySelector('p')) === name)!;
    return [tile.getAttribute('data-state'), text(tile.querySelector('.mm-queued'))];
  };

  it('is hidden until files are sent; a waiting file says Not uploaded', async () => {
    const f = await boot();
    try {
      expect(strip(f).shown).toBe(false);
      await stage(f, ['a.jpg']);
      expect(strip(f).shown).toBe(false);
      const [tile] = tilesOf(f, 'salePhotoPreview');
      expect(text(tile.querySelector('.mm-queued'))).toBe('Not uploaded');
      expect(tile.classList.contains('mm-pending')).toBe(true);
    } finally { f.close(); }
  });

  it('shows which file is going and how many there are, and each file\'s own tile follows: Uploading, Uploaded, Upload failed', async () => {
    const f = await boot();
    try {
      await stage(f, ['a.jpg', 'b.jpg', 'c.jpg']);
      const wire = gated(f);
      const done = f.w.uploadPendingMedia('L-1');
      await until(() => wire.count() === 1);
      expect(strip(f)).toEqual({ shown: true, kind: '', label: 'Uploading 1 of 3', name: 'a.jpg', width: '4%', now: '4' });
      expect(stateOf(f, 'a.jpg')).toEqual(['busy', 'Uploading…']);
      expect(stateOf(f, 'b.jpg')).toEqual(['queued', 'Not uploaded']);

      wire.ok(0);
      await until(() => wire.count() === 2);
      expect(strip(f)).toMatchObject({ label: 'Uploading 2 of 3', name: 'b.jpg', width: '33%' });
      expect(stateOf(f, 'a.jpg')).toEqual(['done', 'Uploaded']);
      expect(stateOf(f, 'b.jpg')).toEqual(['busy', 'Uploading…']);

      wire.fail(1);                                                                          // the server refused the second one
      await until(() => wire.count() === 3);
      expect(strip(f)).toMatchObject({ label: 'Uploading 3 of 3', name: 'c.jpg', width: '67%' });
      expect(stateOf(f, 'b.jpg')).toEqual(['failed', 'Upload failed']);

      wire.ok(2);
      expect(await done).toEqual({ uploaded: 2, failed: 1 });
      expect(strip(f)).toEqual({ shown: true, kind: 'mm-bad', label: '2 of 3 uploaded · 1 failed', name: '', width: '100%', now: '100' });   // a failure stays on screen
      expect(stateOf(f, 'c.jpg')).toEqual(['done', 'Uploaded']);
      expect(toasts(f).join(' | ')).toContain('Upload failed for b.jpg: boom');
    } finally { f.close(); }
  });

  it('when every file went, the strip says so and turns green', async () => {
    const f = await boot();
    try {
      await stage(f, ['a.jpg', 'b.jpg']);
      const wire = gated(f);
      const done = f.w.uploadPendingMedia('L-1');
      await until(() => wire.count() === 1);
      wire.ok(0);
      await until(() => wire.count() === 2);
      wire.ok(1);
      await done;
      expect(strip(f)).toMatchObject({ shown: true, kind: 'mm-ok', label: '2 of 2 uploaded', width: '100%' });
    } finally { f.close(); }
  });

  it('a PDF among the photos is skipped and is not counted as one of the files being sent', async () => {
    const f = await boot();
    try {
      await stage(f, ['a.jpg', 'scan.pdf']);
      const wire = gated(f);
      const done = f.w.uploadPendingMedia('L-1');
      await until(() => wire.count() === 1);
      expect(strip(f).label).toBe('Uploading 1 of 1');
      wire.ok(0);
      await done;
      expect(wire.count()).toBe(1);                                                          // the PDF was never sent
      expect(stateOf(f, 'scan.pdf')).toEqual(['skipped', 'Preview only']);
      expect(strip(f)).toMatchObject({ kind: 'mm-ok', label: '1 of 1 uploaded' });
    } finally { f.close(); }
  });

  it('with nothing to send, the strip stays hidden', async () => {
    const f = await boot();
    try {
      await f.w.uploadPendingMedia('L-1');
      expect(strip(f).shown).toBe(false);
    } finally { f.close(); }
  });
});

describe('the photo tiles', () => {
  const ROWS = [
    { media_key: 'k1', url: 'https://example.test/1.jpg', media_type: 'Photo', preferred_photo_yn: true },
    { media_key: 'k2', url: 'https://example.test/2.jpg', media_type: 'Photo' },
    { media_key: 'fp', url: 'https://example.test/fp.jpg', media_type: 'FloorPlan' },
  ];
  const open = () => boot({ search: '?id=1', listing: SAVED, mediaRows: ROWS, settle: 1500 });

  it('the cover has the gold ring and its pill; a photo that is not the cover offers Set as cover; every control is one the touch rule shows', async () => {
    const f = await open();
    try {
      const [cover, other] = tilesOf(f, 'salePhotoPreview');
      expect(cover.classList.contains('mm-cover')).toBe(true);
      expect(text(cover.querySelector('.mm-pill'))).toBe('★ COVER');
      expect(other.classList.contains('mm-cover')).toBe(false);
      const setCover = [...other.querySelectorAll('button')].find((b) => b.title === 'Set as cover')!;
      expect(setCover.className).toContain('mm-ctl');
      for (const t of [cover, other]) for (const b of t.querySelectorAll('button')) expect(b.className).toMatch(/mm-ctl|mm-x|mm-mv/);
      // the controls are revealed by hover on a mouse and by default on a touch screen (no hover): they are never reachable only through :hover
      expect(FORM).toMatch(/@media \(hover: none\) \{ \.mm-ctl \{ opacity: 1; \} \}/);
      expect(FORM).toMatch(/\.mm-tile:focus-within \.mm-ctl/);                               // and by the keyboard
    } finally { f.close(); }
  });

  it('a floor plan tile has no ring, no drag cursor class and no move or cover button', async () => {
    const f = await open();
    try {
      const [plan] = tilesOf(f, 'saleFloorplanPreview');
      expect(plan.classList.contains('mm-drag')).toBe(false);
      expect([...plan.querySelectorAll('button')].map((b) => b.title)).toEqual(['Remove']);
    } finally { f.close(); }
  });

  it('dragging marks the photo being moved and the photo it is over, and dropping or leaving clears the marks', async () => {
    const f = await open();
    try {
      const [first, second] = tilesOf(f, 'salePhotoPreview') as any[];
      first.ondragstart.call(first, { dataTransfer: { setData() {} } });
      await sleep(20);
      expect(first.classList.contains('mm-dragging')).toBe(true);
      second.ondragover.call(second, { preventDefault() {} });
      expect(second.classList.contains('mm-over')).toBe(true);
      second.ondragleave.call(second);
      expect(second.classList.contains('mm-over')).toBe(false);
      first.ondragend.call(first);
      expect(first.classList.contains('mm-dragging')).toBe(false);
    } finally { f.close(); }
  });
});

describe('the document rows', () => {
  it('a Word file has the Word icon, a PDF the PDF icon; a row that waits to be sent says so', async () => {
    const f = await boot();
    try {
      const word = f.w._documentRow('budget.docx', '', () => undefined, true) as HTMLElement;
      const pdf = f.w._documentRow('plan.pdf', 'https://example.test/plan.pdf', () => undefined, false) as HTMLElement;
      expect(word.querySelector('.mm-doc-icon')!.classList.contains('mm-word')).toBe(true);
      expect(word.querySelector('i')!.className).toContain('fa-file-word');
      expect(text(word.querySelector('.mm-queued'))).toBe('not uploaded yet');
      expect(pdf.querySelector('.mm-doc-icon')!.classList.contains('mm-word')).toBe(false);
      expect(pdf.querySelector('i')!.className).toContain('fa-file-pdf');
      expect(pdf.querySelector('a')!.getAttribute('href')).toBe('https://example.test/plan.pdf');
      expect(pdf.querySelector('.mm-queued')).toBeNull();
      expect([...word.querySelectorAll('button')].map((b) => b.getAttribute('type'))).toEqual(['button']);
    } finally { f.close(); }
  });
});
