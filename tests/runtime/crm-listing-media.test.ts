/// <reference types="jest" />
/**
 * js/forms/listing-media.js: the photos and floor plans of an Add / Edit listing form.
 *
 * The Rental form had a Media and Documents panel that did nothing: the file boxes had no handler (the page never read a chosen file), "Save Media" called an empty function, a
 * photo dropped on the box was opened by the browser in place of the form, and a saved listing's photos were never shown. The Sale form has a manager for them inline; this module is
 * that manager as one piece both forms can use (the Rental form uses it; the Sale form keeps its own copy until it is moved over). These tests run the module on a plain page
 * with a fake network, so every request it makes is seen.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCE = readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-media.js'), 'utf8');

type Call = { url: string; method: string; headers?: Record<string, string>; body?: any; credentials?: string };
type Reply = { ok: boolean; status: number; body?: any; reject?: string };

/** A page with the controls the module uses, the module loaded, and a network that answers from `answers` (a function of the request) and records every request. */
function boot(o: { savedId?: string; unsavedMessage?: string; canUpload?: () => boolean; answers?: (call: Call) => Reply | undefined; confirm?: boolean } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="photoZone"><input type="file" id="rentalPhotoInput" multiple></div><div id="rentalPhotoPreview"></div><span id="rentalPhotoCount"></span>
    <div id="floorZone"><input type="file" id="rentalFloorplanInput"></div><div id="rentalFloorplanPreview"></div>
  </body>`, { url: 'https://mallan.nyc/crm/RENTAL-FORM-REDESIGN.html', runScripts: 'outside-only' });
  const w: any = dom.window;
  w.eval(SOURCE);
  const calls: Call[] = [];
  const errors: string[] = [];
  w.addEventListener('error', (e: any) => errors.push(String(e.message)));
  const toasts: [string, string | undefined][] = [];
  let savedId = o.savedId ?? '';
  const answer = (call: Call): Reply => o.answers?.(call) ?? defaultAnswer(call);
  const media = w.MallanListingMedia.create({
    prefix: 'rental',
    listingId: () => savedId,
    unsavedMessage: o.unsavedMessage,
    toast: (message: string, type?: string) => toasts.push([message, type]),
    confirm: () => o.confirm ?? true,
    canUpload: o.canUpload,
    createObjectURL: (file: any) => `blob:${file.name}`,
    fetch: (url: string, init: any = {}) => {
      const call: Call = { url, method: init.method ?? 'GET', headers: init.headers, body: init.body, credentials: init.credentials };
      calls.push(call);
      const r = answer(call);
      if (r.reject) return Promise.reject(new Error(r.reject));
      return Promise.resolve({ ok: r.ok, status: r.status, json: () => (r.body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(r.body)) });
    },
  });
  const d: Document = w.document;
  const file = (name: string, size = 1000, type = 'image/jpeg') => {
    const f = new w.File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  return {
    w, d, media, calls, toasts, errors, file,
    setSaved: (id: string) => { savedId = id; },
    photos: () => d.getElementById('rentalPhotoPreview') as HTMLElement,
    floors: () => d.getElementById('rentalFloorplanPreview') as HTMLElement,
    count: () => d.getElementById('rentalPhotoCount')!.textContent,
    tiles: (container: HTMLElement) => [...container.children] as HTMLElement[],
    said: () => toasts.map(([m]) => m),
    flush: () => new Promise<void>((r) => setTimeout(r, 30)),
  };
}
const defaultAnswer = (call: Call): Reply => {
  if (call.method === 'POST' && /\/media\/upload$/.test(call.url)) return { ok: true, status: 200, body: { photo: { url: 'https://cdn.example/p.webp' } } };
  if (call.method === 'GET') return { ok: true, status: 200, body: { listing_id: 'RL-7', media: [] } };
  return { ok: true, status: 200, body: {} };
};
const row = (key: string | number, extra: Record<string, unknown> = {}) => ({ media_key: key, media_type: 'Photo', url: `https://cdn.example/${key}.webp`, ...extra });
const listAnswer = (media: unknown[], listingId = 'RL-7') => (call: Call): Reply | undefined => (call.method === 'GET' ? { ok: true, status: 200, body: { listing_id: listingId, media } } : undefined);

describe('files chosen', () => {
  it('a photo gets a preview tile with its picture, its name, move buttons and a remove button, and is counted', () => {
    const p = boot();
    p.media.addFiles([p.file('kitchen.jpg')], 'photo');
    const tile = p.tiles(p.photos())[0];
    expect(p.tiles(p.photos())).toHaveLength(1);
    expect(tile.getAttribute('data-media-index')).toBe('0');
    expect((tile.querySelector('img') as HTMLImageElement).src).toBe('blob:kitchen.jpg');
    expect((tile.querySelector('img') as HTMLImageElement).draggable).toBe(false);
    expect(tile.querySelector('p')!.textContent).toBe('kitchen.jpg');
    expect([...tile.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['◀', '▶', '×']);
    expect([...tile.querySelectorAll('button')].map((b) => b.title)).toEqual(['Move earlier', 'Move later', '']);
    expect(p.count()).toBe('1 / 100 uploaded');
  });

  it('a floor plan goes to the floor plan tiles, which are not moved and are not counted as photos', () => {
    const p = boot();
    p.media.addFiles([p.file('plan.png', 1000, 'image/png')], 'floorplan');
    expect(p.tiles(p.photos())).toHaveLength(0);
    const tile = p.tiles(p.floors())[0];
    expect([...tile.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['×']);
    expect(p.count()).toBe('0 / 100 uploaded');
  });

  it('a file name is text, never markup', () => {
    const p = boot();
    const name = '<img src=x onerror=alert(1)>.jpg';
    p.media.addFiles([p.file(name)], 'photo');
    const tile = p.tiles(p.photos())[0];
    expect(tile.querySelectorAll('img')).toHaveLength(1);                    // the tile's own picture only
    expect(tile.querySelector('p')!.textContent).toBe(name);
  });

  it('a file over 10MB is refused with its name, and is not queued', () => {
    const p = boot();
    p.media.addFiles([p.file('huge.jpg', 10 * 1024 * 1024 + 1)], 'photo');
    expect(p.said()).toContain('File "huge.jpg" exceeds 10MB limit.');
    expect(p.toasts[0][1]).toBe('error');
    expect(p.tiles(p.photos())).toHaveLength(0);
    expect(p.media.hasPending()).toBe(false);
  });

  it('a file of exactly 10MB is taken', () => {
    const p = boot();
    p.media.addFiles([p.file('edge.jpg', 10 * 1024 * 1024)], 'photo');
    expect(p.tiles(p.photos())).toHaveLength(1);
  });

  it('the same file twice (name and size) is skipped, and says so; the same name with another size is another file', () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg', 100), p.file('a.jpg', 100), p.file('a.jpg', 101)], 'photo');
    expect(p.tiles(p.photos())).toHaveLength(2);
    expect(p.media.pending().map((e: any) => e.file.size)).toEqual([100, 101]);
    expect(p.said()).toContain('Skipping duplicate: a.jpg');
    expect(p.toasts.find(([m]) => /Skipping duplicate/.test(m))![1]).toBe('info');
  });

  it('a file the agent removed can be chosen again', () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg', 100)], 'photo');
    ([...p.tiles(p.photos())[0].querySelectorAll('button')].find((b) => b.textContent === '×') as HTMLElement).click();
    expect(p.tiles(p.photos())).toHaveLength(0);
    expect(p.count()).toBe('0 / 100 uploaded');
    p.media.addFiles([p.file('a.jpg', 100)], 'photo');
    expect(p.tiles(p.photos())).toHaveLength(1);
    expect(p.said().filter((m) => /duplicate/.test(m))).toEqual([]);
  });

  it('a PDF floor plan is previewed as a PDF and the agent is told it is preview-only', () => {
    const p = boot();
    p.media.addFiles([p.file('plan.pdf', 1000, 'application/pdf')], 'floorplan');
    expect(p.said()).toContain('PDF floor plans are preview-only. Upload as JPG/PNG image for full support.');
    const tile = p.tiles(p.floors())[0];
    expect(tile.querySelector('img')).toBeNull();
    expect(tile.querySelector('.fa-file-pdf')).not.toBeNull();
  });

  it('a PDF is known by its extension too (a browser that does not name its type)', () => {
    const p = boot();
    p.media.addFiles([p.file('plan.PDF', 1000, '')], 'floorplan');
    expect(p.tiles(p.floors())[0].querySelector('.fa-file-pdf')).not.toBeNull();
  });

  it('a floor plan that is an image gets no PDF warning, and neither does a PDF that is a photo', () => {
    const p = boot();
    p.media.addFiles([p.file('plan.png', 10, 'image/png')], 'floorplan');
    p.media.addFiles([p.file('sheet.pdf', 11, 'application/pdf')], 'photo');
    expect(p.said().filter((m) => /PDF floor plans/.test(m))).toEqual([]);
  });

  it('a PDF dropped as a photo has a PDF tile with no move buttons', () => {
    const p = boot();
    p.media.addFiles([p.file('sheet.pdf', 1000, 'application/pdf')], 'photo');
    const tile = p.tiles(p.photos())[0];
    expect([...tile.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['×']);
  });

  it('nothing chosen does nothing', () => {
    const p = boot();
    p.media.addFiles([], 'photo');
    p.media.addFiles(null, 'photo');
    expect(p.toasts).toEqual([]);
    expect(p.calls).toEqual([]);
  });

  it('a new listing keeps the files until it is saved, and says so', () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg'), p.file('b.jpg')], 'photo');
    expect(p.calls).toEqual([]);
    expect(p.said()).toContain('2 photo(s) added. Save the listing to upload, then drag or use ◀/▶ to reorder.');
    expect(p.media.hasPending()).toBe(true);
  });

  it('a listing that is not ready to upload (the network client is not up) keeps the files too', () => {
    const p = boot({ savedId: 'RL-7', canUpload: () => false });
    p.media.addFiles([p.file('a.jpg')], 'photo');
    expect(p.calls).toEqual([]);
    expect(p.said().some((m) => /Save the listing to upload/.test(m))).toBe(true);
  });

  it('a saved listing takes the files at once, after the photos it has, and shows its photos again', async () => {
    const p = boot({ savedId: 'RL-7', answers: listAnswer([row('k1', { preferred_photo_yn: true })]) });
    p.media.addFiles([p.file('a.jpg')], 'photo');
    expect(p.said()).toContain('1 photo(s) added — uploading…');
    await p.flush();
    const upload = p.calls.find((c) => c.method === 'POST')!;
    expect(upload.url).toBe('/api/crm/listings/RL-7/media/upload');
    expect(upload.credentials).toBe('same-origin');
    expect(upload.body.get('file').name).toBe('a.jpg');
    expect(upload.body.has('order')).toBe(false);                            // left out: the route appends after the photos it has
    expect(upload.body.get('caption')).toBe('');
    expect(p.calls[p.calls.length - 1]).toMatchObject({ method: 'GET', url: '/api/crm/listings/RL-7/media' });
    expect(p.said()).toContain('1 photo(s) uploaded — drag or use ◀/▶ to reorder.');
    expect(p.said().filter((m) => /upload\(s\) failed/.test(m))).toEqual([]);          // nothing failed: nothing said about it
    expect(p.tiles(p.photos()).map((t) => t.getAttribute('data-media-key'))).toEqual(['k1']);
  });

  it('a failed upload is counted and said', async () => {
    const p = boot({ savedId: 'RL-7', answers: (c) => (c.method === 'POST' ? { ok: false, status: 400, body: { error: 'Unsupported image' } } : undefined) });
    p.media.addFiles([p.file('a.jpg')], 'photo');
    await p.flush();
    expect(p.said()).toContain('Upload failed for a.jpg: Unsupported image');
    expect(p.said()).toContain('1 upload(s) failed.');
    expect(p.said().filter((m) => /photo\(s\) uploaded/.test(m))).toEqual([]);          // nothing was saved: nothing is said to have been
  });

  it('a file that was saved counts as saved whatever the server answers it with', async () => {
    const p = boot({ answers: (c) => (c.method === 'POST' ? { ok: true, status: 200 } : undefined) });         // no body at all
    p.media.addFiles([p.file('a.jpg')], 'photo');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 1, failed: 0 });
    expect(p.media.hasPending()).toBe(false);
  });

  it('the file box hands its files to the manager and is emptied', () => {
    const p = boot();
    p.media.bind();
    const input = p.d.getElementById('rentalPhotoInput') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [p.file('a.jpg')], configurable: true });
    let emptied = false;
    Object.defineProperty(input, 'value', { set: (v) => { if (v === '') emptied = true; }, get: () => '', configurable: true });
    input.dispatchEvent(new p.w.Event('change'));
    expect(p.tiles(p.photos())).toHaveLength(1);
    expect(emptied).toBe(true);
  });

  it('the floor plan box sends its files to the floor plans', () => {
    const p = boot();
    p.media.bind();
    const input = p.d.getElementById('rentalFloorplanInput') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [p.file('plan.png', 10, 'image/png')], configurable: true });
    input.dispatchEvent(new p.w.Event('change'));
    expect(p.tiles(p.floors())).toHaveLength(1);
    expect(p.tiles(p.photos())).toHaveLength(0);
  });

  it('binding twice does not take a file twice', () => {
    const p = boot();
    p.media.bind();
    p.media.bind();
    const input = p.d.getElementById('rentalPhotoInput') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [p.file('a.jpg')], configurable: true });
    input.dispatchEvent(new p.w.Event('change'));
    expect(p.tiles(p.photos())).toHaveLength(1);
    expect(p.toasts).toHaveLength(1);                                         // one message for one choice (a second listener would say "Skipping duplicate")
  });

  it('a file dropped on the box is taken, and the browser is stopped from opening it', () => {
    const p = boot();
    p.media.bind();
    const zone = p.d.getElementById('photoZone')!;
    const over = new p.w.Event('dragover', { cancelable: true });
    zone.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop: any = new p.w.Event('drop', { cancelable: true });
    drop.dataTransfer = { files: [p.file('dropped.jpg')] };
    zone.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(p.tiles(p.photos())).toHaveLength(1);
  });

  it('a file dropped on the floor plan box is a floor plan; a drop with no files does nothing', () => {
    const p = boot();
    p.media.bind();
    const zone = p.d.getElementById('floorZone')!;
    const drop: any = new p.w.Event('drop', { cancelable: true });
    drop.dataTransfer = { files: [p.file('plan.png', 10, 'image/png')] };
    zone.dispatchEvent(drop);
    expect(p.tiles(p.floors())).toHaveLength(1);
    const empty: any = new p.w.Event('drop', { cancelable: true });
    zone.dispatchEvent(empty);                                               // no dataTransfer at all
    expect(p.tiles(p.floors())).toHaveLength(1);
  });

  it('a page without the preview boxes still takes the files (nothing is drawn)', () => {
    const p = boot();
    p.photos().remove();
    p.media.addFiles([p.file('a.jpg')], 'photo');
    expect(p.media.hasPending()).toBe(true);
  });
});

describe('unsaved previews', () => {
  const three = () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2), p.file('c.jpg', 3)], 'photo');
    return p;
  };
  const names = (p: ReturnType<typeof boot>) => p.tiles(p.photos()).map((t) => t.querySelector('p')!.textContent);
  const move = (tile: HTMLElement, label: '◀' | '▶') => ([...tile.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLElement).click();

  it('▶ moves a preview later, ◀ earlier, and the files are saved in the order shown', async () => {
    const p = three();
    move(p.tiles(p.photos())[0], '▶');
    expect(names(p)).toEqual(['b.jpg', 'a.jpg', 'c.jpg']);
    move(p.tiles(p.photos())[2], '◀');
    expect(names(p)).toEqual(['b.jpg', 'c.jpg', 'a.jpg']);
    await p.media.uploadPending('RL-7');
    // each file carries the place it was arranged in (the server orders by it; the sequence of the requests does not matter)
    const sent = Object.fromEntries(p.calls.filter((c) => c.method === 'POST').map((c) => [c.body.get('file').name, c.body.get('order')]));
    expect(sent).toEqual({ 'b.jpg': '0', 'c.jpg': '1', 'a.jpg': '2' });
  });

  it('the first preview cannot go earlier and the last cannot go later', () => {
    const p = three();
    move(p.tiles(p.photos())[0], '◀');
    move(p.tiles(p.photos())[2], '▶');
    expect(names(p)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('a preview moves past previews only: a saved photo\'s tile (it has a key) is not one of them', async () => {
    const p = boot({ answers: listAnswer([row('k1')]) });
    await p.media.render('RL-7');
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2)], 'photo');
    const container = p.photos();
    expect(p.tiles(container).map((t) => t.getAttribute('data-media-key') ?? t.getAttribute('data-media-index'))).toEqual(['k1', '0', '1']);
    move(p.tiles(container)[2], '◀');                                        // b.jpg before a.jpg, and not before the saved photo
    expect(p.tiles(container).map((t) => t.getAttribute('data-media-key') ?? t.getAttribute('data-media-index'))).toEqual(['k1', '1', '0']);
    move(p.tiles(container)[1], '◀');                                        // already the first preview
    expect(p.tiles(container).map((t) => t.getAttribute('data-media-key') ?? t.getAttribute('data-media-index'))).toEqual(['k1', '1', '0']);
  });

  it('a removed preview is gone, is not counted, and is not saved', async () => {
    const p = three();
    ([...p.tiles(p.photos())[1].querySelectorAll('button')].find((b) => b.textContent === '×') as HTMLElement).click();
    expect(names(p)).toEqual(['a.jpg', 'c.jpg']);
    expect(p.count()).toBe('2 / 100 uploaded');
    await p.media.uploadPending('RL-7');
    expect(p.calls.filter((c) => c.method === 'POST').map((c) => c.body.get('file').name)).toEqual(['a.jpg', 'c.jpg']);
  });

  it('removing a preview leaves the order of the others as shown', async () => {
    const p = three();
    move(p.tiles(p.photos())[2], '◀');                                       // a, c, b
    ([...p.tiles(p.photos())[0].querySelectorAll('button')].find((b) => b.textContent === '×') as HTMLElement).click();     // remove a
    await p.media.uploadPending('RL-7');
    expect(p.calls.filter((c) => c.method === 'POST').map((c) => [c.body.get('file').name, c.body.get('order')])).toEqual([['b.jpg', '2'], ['c.jpg', '1']]);
  });
});

describe('saving the chosen files', () => {
  it('a new listing sends each file with the order it was arranged in, and the caption of its kind', async () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg', 1), p.file('plan.png', 2, 'image/png')], 'photo');
    p.media.addFiles([p.file('plan2.png', 3, 'image/png')], 'floorplan');
    const result = await p.media.uploadPending('RL-7');
    expect(result).toEqual({ uploaded: 3, failed: 0 });
    const posts = p.calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => c.url)).toEqual(Array(3).fill('/api/crm/listings/RL-7/media/upload'));
    expect(posts.map((c) => [c.body.get('file').name, c.body.get('order'), c.body.get('caption')])).toEqual([['a.jpg', '0', ''], ['plan.png', '1', ''], ['plan2.png', '2', 'Floor Plan']]);
  });

  it('sends the files one after the other', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const p = boot({ answers: (c) => { if (c.method === 'POST') order.push('start ' + c.body.get('file').name); return undefined; } });
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2)], 'photo');
    await p.media.uploadPending('RL-7');
    expect(order).toEqual(['start a.jpg', 'start b.jpg']);
    release();
  });

  it('the id of the listing is part of the address, encoded', async () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg')], 'photo');
    await p.media.uploadPending('RL 7/../x');
    expect(p.calls[0].url).toBe('/api/crm/listings/RL%207%2F..%2Fx/media/upload');
  });

  it('files that were saved are not sent again', async () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg')], 'photo');
    await p.media.uploadPending('RL-7');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 0, failed: 0 });
    expect(p.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(p.media.hasPending()).toBe(false);
  });

  it('with nothing to send, nothing is requested', async () => {
    const p = boot();
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 0, failed: 0 });
    expect(p.calls).toEqual([]);
  });

  it('a picture the server already has (409) counts as saved', async () => {
    const p = boot({ answers: (c) => (c.method === 'POST' ? { ok: false, status: 409, body: {} } : undefined) });
    p.media.addFiles([p.file('a.jpg')], 'photo');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 1, failed: 0 });
    expect(p.media.hasPending()).toBe(false);
  });

  it('a refusal is said with the server\'s words, or its status when it has none, and is counted; the other files are still sent', async () => {
    const p = boot({ answers: (c) => { if (c.method !== 'POST') return undefined; const name = c.body.get('file').name; return name === 'a.jpg' ? { ok: false, status: 400, body: { error: 'Too small' } } : name === 'b.jpg' ? { ok: false, status: 500 } : undefined; } });
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2), p.file('c.jpg', 3)], 'photo');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 1, failed: 2 });
    expect(p.said()).toContain('Upload failed for a.jpg: Too small');
    expect(p.said()).toContain('Upload failed for b.jpg: 500');
    expect(p.toasts.filter(([m]) => /^Upload failed/.test(m)).map(([, t]) => t)).toEqual(['error', 'error']);
    expect(p.media.hasPending()).toBe(true);                                  // the two that failed are still waiting
  });

  it('a network failure is said, counted, and does not stop the rest', async () => {
    const p = boot({ answers: (c) => (c.method === 'POST' && c.body.get('file').name === 'a.jpg' ? { ok: false, status: 0, reject: 'offline' } : undefined) });
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2)], 'photo');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 1, failed: 1 });
    expect(p.said()).toContain('Upload failed for a.jpg: offline');
  });

  it('a PDF is not sent: the agent is told, and it is dropped from the files waiting', async () => {
    const p = boot();
    p.media.addFiles([p.file('plan.pdf', 5, 'application/pdf')], 'floorplan');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 0, failed: 0 });
    expect(p.said()).toContain('Skipping PDF "plan.pdf" — upload as JPG/PNG image instead.');
    expect(p.calls).toEqual([]);
    expect(p.media.hasPending()).toBe(false);
  });

  it('while files are being sent, a second request to send them does not send them again', async () => {
    let finish: (r: Reply) => void = () => undefined;
    const p = boot();
    p.media.addFiles([p.file('a.jpg')], 'photo');
    // hold the first answer
    const held = new Promise<Reply>((r) => { finish = r; });
    const original = p.media;
    const slow = p.w.MallanListingMedia.create({
      prefix: 'rental', listingId: () => '', toast: (m: string) => p.toasts.push([m, undefined]), createObjectURL: () => 'blob:x',
      fetch: (url: string, init: any) => { p.calls.push({ url, method: init.method ?? 'GET', body: init.body }); return held.then((r) => ({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) })); },
    });
    slow.addFiles([p.file('s.jpg')], 'photo');
    const first = slow.uploadPending('RL-7');
    const second = await slow.uploadPending('RL-7');
    expect(second).toEqual({ uploaded: 0, failed: 0, busy: true });
    expect(p.said()).toContain('Media upload already in progress — please wait.');
    finish({ ok: true, status: 200, body: { photo: { url: 'u' } } });
    expect(await first).toEqual({ uploaded: 1, failed: 0 });
    expect(p.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(original.hasPending()).toBe(true);                                 // the first manager has its own files
  });

  it('a batch that fails outright (a request that cannot even be made) does not leave the manager busy', async () => {
    let broken = true;
    const p = boot();
    const q = p.w.MallanListingMedia.create({
      prefix: 'rental', listingId: () => '', toast: (m: string) => p.toasts.push([m, undefined]), createObjectURL: () => 'blob:x',
      fetch: (url: string, init: any) => { if (broken) throw new Error('no network layer'); p.calls.push({ url, method: init.method ?? 'GET', body: init.body }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }); },
    });
    q.addFiles([p.file('a.jpg', 1)], 'photo');
    await expect(q.uploadPending('RL-7')).rejects.toThrow('no network layer');
    broken = false;
    expect(await q.uploadPending('RL-7')).toEqual({ uploaded: 1, failed: 0 });                   // not told it is busy
    expect(p.said().filter((m) => /already in progress/.test(m))).toEqual([]);
  });

  it('after one batch is done the next can be sent', async () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg', 1)], 'photo');
    await p.media.uploadPending('RL-7');
    p.media.addFiles([p.file('b.jpg', 2)], 'photo');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 1, failed: 0 });
  });
});

describe('Save Media', () => {
  it('on a listing that is not saved, says to save it first and sends nothing', async () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg')], 'photo');
    await p.media.saveMedia();
    expect(p.toasts.at(-1)).toEqual(['Save the listing first before uploading media.', 'warning']);
    expect(p.calls).toEqual([]);
  });

  it('on a listing that is not saved, says what the page says when the page words it (the Rental form: Save Draft does not create the listing)', async () => {
    const p = boot({ unsavedMessage: 'Submit the listing first before uploading media.' });
    p.media.addFiles([p.file('a.jpg')], 'photo');
    await p.media.saveMedia();
    expect(p.toasts.at(-1)).toEqual(['Submit the listing first before uploading media.', 'warning']);
    expect(p.calls).toEqual([]);
  });

  it('with nothing new, says so', async () => {
    const p = boot({ savedId: 'RL-7' });
    await p.media.saveMedia();
    expect(p.toasts.at(-1)).toEqual(['No new media to upload.', 'info']);
    expect(p.calls).toEqual([]);
  });

  it('sends what is waiting and says how it went', async () => {
    const p = boot({ savedId: 'RL-7', canUpload: () => false });
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2)], 'photo');
    await p.media.saveMedia();
    expect(p.said()).toContain('Uploading 2 file(s)...');
    expect(p.toasts.at(-1)).toEqual(['2 uploaded', 'success']);
    expect(p.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('says how many failed, as a warning', async () => {
    const p = boot({ savedId: 'RL-7', canUpload: () => false, answers: (c) => (c.method === 'POST' && c.body.get('file').name === 'b.jpg' ? { ok: false, status: 500 } : undefined) });
    p.media.addFiles([p.file('a.jpg', 1), p.file('b.jpg', 2)], 'photo');
    await p.media.saveMedia();
    expect(p.toasts.at(-1)).toEqual(['1 uploaded, 1 failed', 'warning']);
  });
});

describe('the saved photos and floor plans', () => {
  it('are shown as keyed tiles: photos numbered from 1, floor plans apart, and the photos counted', async () => {
    const p = boot({ answers: listAnswer([row('k1', { preferred_photo_yn: true }), row('k2'), row('f1', { media_type: 'FloorPlan' }), row('k3')]) });
    await p.media.render('RL-7');
    expect(p.tiles(p.photos()).map((t) => [t.getAttribute('data-media-key'), t.querySelector('p')!.textContent])).toEqual([['k1', 'Photo 1'], ['k2', 'Photo 2'], ['k3', 'Photo 3']]);
    expect(p.tiles(p.floors()).map((t) => [t.getAttribute('data-media-key'), t.querySelector('p')!.textContent])).toEqual([['f1', 'Floor Plan']]);
    expect(p.count()).toBe('3 / 100 uploaded');
    expect(p.calls).toEqual([{ url: '/api/crm/listings/RL-7/media', method: 'GET', headers: undefined, body: undefined, credentials: 'same-origin' }]);
  });

  it('shows the cover on the photo that has it, and a Set cover button on the others (not on floor plans)', async () => {
    const p = boot({ answers: listAnswer([row('k1', { preferred_photo_yn: true }), row('k2'), row('f1', { media_type: 'FloorPlan' })]) });
    await p.media.render('RL-7');
    const [first, second] = p.tiles(p.photos());
    expect(first.textContent).toContain('★ COVER');
    expect([...first.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['◀', '▶', '×']);
    expect([...second.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['☆ Set cover', '◀', '▶', '×']);
    expect([...p.tiles(p.floors())[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['×']);
  });

  it('photos can be dragged; floor plans cannot', async () => {
    const p = boot({ answers: listAnswer([row('k1'), row('f1', { media_type: 'FloorPlan' })]) });
    await p.media.render('RL-7');
    expect(p.tiles(p.photos())[0].draggable).toBe(true);
    expect(p.tiles(p.floors())[0].draggable).toBe(false);
  });

  it('an entry that is not a record, or has no key, shows nothing; a number is a key', async () => {
    const p = boot({ answers: listAnswer([null, 'k1', 7, { url: 'https://cdn.example/x.webp' }, { media_key: '' }, { media_key: {} }, row(8), row('k9')]) });
    await p.media.render('RL-7');
    expect(p.tiles(p.photos()).map((t) => t.getAttribute('data-media-key'))).toEqual(['8', 'k9']);
    expect(p.count()).toBe('2 / 100 uploaded');
  });

  it('shows a picture for a web address only: https, http and this site\'s own root; not javascript:, data:, //host or a list', async () => {
    const urls = ['https://cdn.example/a.webp', 'http://cdn.example/b.webp', '/media/c.webp', ' https://cdn.example/d.webp ', 'javascript:alert(1)', 'data:text/html,x', '//evil.example/e.webp', ['https://x'], 5, null];
    const p = boot({ answers: listAnswer(urls.map((u, i) => row('k' + i, { url: u }))) });
    await p.media.render('RL-7');
    const shown = p.tiles(p.photos()).map((t) => { const img = t.querySelector('img'); return img ? img.getAttribute('src') : null; });
    expect(shown).toEqual(['https://cdn.example/a.webp', 'http://cdn.example/b.webp', '/media/c.webp', 'https://cdn.example/d.webp', null, null, null, null, null, null]);
    expect(p.tiles(p.photos())).toHaveLength(10);                             // a tile without a picture can still be removed
  });

  it('a stored key or address is an attribute value and text, never markup', async () => {
    const key = '"><img src=x onerror=alert(1)>';
    const p = boot({ answers: listAnswer([row(key, { url: 'https://cdn.example/a.webp"><img src=x>' })]) });
    await p.media.render('RL-7');
    const tile = p.tiles(p.photos())[0];
    expect(tile.getAttribute('data-media-key')).toBe(key);
    expect(tile.querySelectorAll('img')).toHaveLength(1);
    expect(p.photos().querySelectorAll('[onerror]')).toHaveLength(0);
  });

  it('replace what was shown', async () => {
    const p = boot({ answers: listAnswer([row('k1')]) });
    await p.media.render('RL-7');
    await p.media.render('RL-7');
    expect(p.tiles(p.photos())).toHaveLength(1);
  });

  it('say so when they cannot be loaded, and leave what is shown', async () => {
    const p = boot({ answers: () => ({ ok: false, status: 500 }) });
    p.photos().appendChild(p.d.createElement('div'));
    await p.media.render('RL-7');
    expect(p.toasts.at(-1)).toEqual(['Media manager could not load — showing the saved preview. Reload to retry.', 'warning']);
    expect(p.tiles(p.photos())).toHaveLength(1);
  });

  it('say so when the answer has no list of media', async () => {
    const p = boot({ answers: () => ({ ok: true, status: 200, body: { media: 'none' } }) });
    await p.media.render('RL-7');
    expect(p.toasts.at(-1)![0]).toMatch(/could not load/);
  });

  it('say so when the answer is not readable, or the network is down', async () => {
    const p = boot({ answers: () => ({ ok: true, status: 200 }) });             // json() rejects
    await p.media.render('RL-7');
    expect(p.toasts.at(-1)![0]).toMatch(/could not load/);
    const q = boot({ answers: () => ({ ok: false, status: 0, reject: 'offline' }) });
    await q.media.render('RL-7');
    expect(q.toasts.at(-1)![0]).toMatch(/could not load/);
  });

  it('use the numeric id when the listing\'s own id does not answer', async () => {
    const p = boot({ answers: (c) => (c.url.includes('/RL-7/') ? { ok: false, status: 404 } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1')] } }) });
    await p.media.render('RL-7', '308773');
    expect(p.calls.map((c) => c.url)).toEqual(['/api/crm/listings/RL-7/media', '/api/crm/listings/308773/media']);
    expect(p.tiles(p.photos())).toHaveLength(1);
    expect(p.toasts).toEqual([]);
  });

  it('do not ask for the numeric id when the id of the listing itself answers', async () => {
    const p = boot({ answers: listAnswer([row('k1')]) });
    await p.media.render('RL-7', '308773');
    expect(p.calls.map((c) => c.url)).toEqual(['/api/crm/listings/RL-7/media']);
  });

  it('do not ask twice when the fallback is the same id', async () => {
    const p = boot({ answers: () => ({ ok: false, status: 404 }) });
    await p.media.render('RL-7', 'RL-7');
    expect(p.calls).toHaveLength(1);
  });

  it('work from the numeric id alone', async () => {
    const p = boot({ answers: listAnswer([row('k1')], 'RL-7') });
    await p.media.render('', '308773');
    expect(p.calls.map((c) => c.url)).toEqual(['/api/crm/listings/308773/media']);
    expect(p.tiles(p.photos())).toHaveLength(1);
  });

  it('a page with no floor plan box still shows the photos, and one with no photo box still shows the floor plans', async () => {
    const a = boot({ answers: listAnswer([row('k1'), row('f1', { media_type: 'FloorPlan' })]) });
    a.floors().remove();
    await a.media.render('RL-7');
    expect(a.tiles(a.photos()).map((t) => t.getAttribute('data-media-key'))).toEqual(['k1']);
    expect(a.errors).toEqual([]);
    const b = boot({ answers: listAnswer([row('k1'), row('f1', { media_type: 'FloorPlan' })]) });
    b.photos().remove();
    await b.media.render('RL-7');
    expect(b.tiles(b.floors()).map((t) => t.getAttribute('data-media-key'))).toEqual(['f1']);
    expect(b.errors).toEqual([]);
  });

  it('ask for nothing without an id, or without the boxes to show them in', async () => {
    const p = boot();
    await p.media.render('');
    expect(p.calls).toEqual([]);
    p.photos().remove(); p.floors().remove();
    await p.media.render('RL-7');
    expect(p.calls).toEqual([]);
  });

  it('act on the listing id the server answers with, not the numeric id the page asked with', async () => {
    const p = boot({ answers: (c) => (c.method === 'GET' ? { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1'), row('k2')] } } : { ok: true, status: 200, body: {} }) });
    await p.media.render('308773');
    ([...p.tiles(p.photos())[1].querySelectorAll('button')].find((b) => b.textContent === '◀') as HTMLElement).click();
    await p.flush();
    expect(p.calls.at(-1)!.url).toBe('/api/crm/listings/RL-7/media-order');
  });

  it('act on the id the page asked with when the server does not echo one', async () => {
    const p = boot({ answers: (c) => (c.method === 'GET' ? { ok: true, status: 200, body: { media: [row('k1'), row('k2')] } } : { ok: true, status: 200, body: {} }) });
    await p.media.render('RL-7');
    ([...p.tiles(p.photos())[1].querySelectorAll('button')].find((b) => b.textContent === '◀') as HTMLElement).click();
    await p.flush();
    expect(p.calls.at(-1)!.url).toBe('/api/crm/listings/RL-7/media-order');
  });

  it('count 0 photos when there are none', async () => {
    const p = boot({ answers: listAnswer([]) });
    await p.media.render('RL-7');
    expect(p.count()).toBe('0 / 100 uploaded');
  });
});

describe('a saved photo\'s tile', () => {
  const photos = async (keys: string[], more: Record<string, Record<string, unknown>> = {}, confirmAnswer = true) => {
    const p = boot({ confirm: confirmAnswer, answers: (c) => (c.method === 'GET' ? { ok: true, status: 200, body: { listing_id: 'RL-7', media: keys.map((k) => row(k, more[k] ?? {})) } } : undefined) });
    await p.media.render('RL-7');
    return p;
  };
  const button = (tile: HTMLElement, label: string) => [...tile.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLElement;
  const keys = (p: ReturnType<typeof boot>) => p.tiles(p.photos()).map((t) => t.getAttribute('data-media-key'));
  const labels = (p: ReturnType<typeof boot>) => p.tiles(p.photos()).map((t) => t.querySelector('p')!.textContent);

  describe('Set cover', () => {
    it('asks the server and shows the photos again', async () => {
      const p = await photos(['k1', 'k2']);
      button(p.tiles(p.photos())[1], '☆ Set cover').click();
      await p.flush();
      const patch = p.calls.find((c) => c.method === 'PATCH')!;
      expect(patch.url).toBe('/api/crm/listings/RL-7/media/k2');
      expect(JSON.parse(patch.body)).toEqual({ preferred_photo_yn: true });
      expect(patch.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(patch.credentials).toBe('include');
      expect(p.said()).toContain('Main photo set');
      expect(p.calls.at(-1)).toMatchObject({ method: 'GET' });
    });

    it('says when the server refuses, and does not show the photos again', async () => {
      const p = boot({ answers: (c) => (c.method === 'PATCH' ? { ok: false, status: 403 } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1'), row('k2')] } }) });
      await p.media.render('RL-7');
      const before = p.calls.length;
      button(p.tiles(p.photos())[1], '☆ Set cover').click();
      await p.flush();
      expect(p.toasts.at(-1)).toEqual(['Could not set main photo (HTTP 403)', 'error']);
      expect(p.calls.length).toBe(before + 1);
    });

    it('says when the network is down', async () => {
      const p = boot({ answers: (c) => (c.method === 'PATCH' ? { ok: false, status: 0, reject: 'offline' } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1'), row('k2')] } }) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[1], '☆ Set cover').click();
      await p.flush();
      expect(p.toasts.at(-1)).toEqual(['Could not set main photo: offline', 'error']);
    });

    it('encodes a key in the address', async () => {
      const p = await photos(['k/1 a', 'k2']);
      button(p.tiles(p.photos())[0], '☆ Set cover').click();
      await p.flush();
      expect(p.calls.find((c) => c.method === 'PATCH')!.url).toBe('/api/crm/listings/RL-7/media/k%2F1%20a');
    });
  });

  describe('◀ and ▶', () => {
    it('move the photo past its neighbour, renumber the labels, and save the order', async () => {
      const p = await photos(['k1', 'k2', 'k3']);
      button(p.tiles(p.photos())[0], '▶').click();
      expect(keys(p)).toEqual(['k2', 'k1', 'k3']);
      expect(labels(p)).toEqual(['Photo 1', 'Photo 2', 'Photo 3']);
      await p.flush();
      const patch = p.calls.find((c) => c.method === 'PATCH')!;
      expect(patch.url).toBe('/api/crm/listings/RL-7/media-order');
      expect(JSON.parse(patch.body)).toEqual({ ordered_media_ids: ['k2', 'k1', 'k3'] });
      expect(patch.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(patch.credentials).toBe('include');
      expect(p.said()).toContain('Photo order saved');
    });

    it('◀ moves earlier; the first photo cannot go earlier, the last cannot go later, and nothing is sent for it', async () => {
      const p = await photos(['k1', 'k2']);
      button(p.tiles(p.photos())[1], '◀').click();
      expect(keys(p)).toEqual(['k2', 'k1']);
      await p.flush();
      const sent = p.calls.filter((c) => c.method === 'PATCH').length;
      button(p.tiles(p.photos())[0], '◀').click();
      button(p.tiles(p.photos())[1], '▶').click();
      await p.flush();
      expect(keys(p)).toEqual(['k2', 'k1']);
      expect(p.calls.filter((c) => c.method === 'PATCH').length).toBe(sent);
    });

    it('go past saved photos only: a preview of an unsaved file between them is skipped', async () => {
      const p = await photos(['k1', 'k2']);
      p.media.addFiles([p.file('a.jpg')], 'photo');                              // a preview after k2 (no key)
      p.photos().insertBefore(p.tiles(p.photos())[2], p.tiles(p.photos())[1]);   // k1, preview, k2
      button(p.tiles(p.photos())[0], '▶').click();
      expect(p.tiles(p.photos()).map((t) => t.getAttribute('data-media-key') ?? 'preview')).toEqual(['k2', 'k1', 'preview']);
      await p.flush();
      expect(JSON.parse(p.calls.find((c) => c.method === 'PATCH')!.body)).toEqual({ ordered_media_ids: ['k2', 'k1'] });
    });

    it('numbers the saved photos only: an unsaved preview keeps its file name, even a name that starts with "Photo "', async () => {
      const p = await photos(['k1', 'k2']);
      p.media.addFiles([p.file('Photo 9.jpg')], 'photo');
      button(p.tiles(p.photos())[0], '▶').click();
      expect(p.tiles(p.photos()).map((t) => t.querySelector('p')!.textContent)).toEqual(['Photo 1', 'Photo 2', 'Photo 9.jpg']);
    });

    it('say when the order was not saved', async () => {
      const p = boot({ answers: (c) => (c.method === 'PATCH' ? { ok: false, status: 500 } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1'), row('k2')] } }) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[0], '▶').click();
      await p.flush();
      expect(p.toasts.at(-1)).toEqual(['Photo order NOT saved (HTTP 500). Reload to see actual order.', 'error']);
    });

    it('say when the network is down', async () => {
      const p = boot({ answers: (c) => (c.method === 'PATCH' ? { ok: false, status: 0, reject: 'offline' } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1'), row('k2')] } }) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[0], '▶').click();
      await p.flush();
      expect(p.toasts.at(-1)).toEqual(['Photo order NOT saved: offline', 'error']);
    });

    it('find the photo by a key with a quote or a backslash in it', async () => {
      const p = await photos(['a"b', 'c\\d']);
      button(p.tiles(p.photos())[0], '▶').click();
      expect(keys(p)).toEqual(['c\\d', 'a"b']);
    });

    it('do nothing when the photos are not on the page any more', async () => {
      const p = await photos(['k1', 'k2']);
      const tile = p.tiles(p.photos())[0];
      const move = button(tile, '▶');
      p.photos().remove();
      move.click();
      expect(p.calls.filter((c) => c.method === 'PATCH')).toEqual([]);
      expect(p.errors).toEqual([]);
    });

    it('do nothing when the tile has gone', async () => {
      const p = await photos(['k1', 'k2']);
      const tile = p.tiles(p.photos())[0];
      const move = button(tile, '▶');
      tile.remove();
      move.click();
      expect(p.calls.filter((c) => c.method === 'PATCH')).toEqual([]);
      expect(p.errors).toEqual([]);
    });
  });

  describe('drag and drop', () => {
    const drag = (p: ReturnType<typeof boot>, from: HTMLElement, to: HTMLElement, key = from.getAttribute('data-media-key')!) => {
      const data: Record<string, string> = {};
      const transfer = { setData: (t: string, v: string) => { data[t] = v; }, getData: (t: string) => data[t] ?? '' };
      const start: any = new p.w.Event('dragstart'); start.dataTransfer = transfer; from.dispatchEvent(start);
      const over = new p.w.Event('dragover', { cancelable: true }); to.dispatchEvent(over);
      const drop: any = new p.w.Event('drop', { cancelable: true }); drop.dataTransfer = { getData: () => key }; to.dispatchEvent(drop);
      return { data, over, drop };
    };

    it('dragging a photo onto a later one puts it after it, and saves the order', async () => {
      const p = await photos(['k1', 'k2', 'k3']);
      const [a, , c] = p.tiles(p.photos());
      const { data, over, drop } = drag(p, a, c);
      expect(data['text/plain']).toBe('k1');
      expect(over.defaultPrevented).toBe(true);
      expect(drop.defaultPrevented).toBe(true);
      expect(keys(p)).toEqual(['k2', 'k3', 'k1']);
      await p.flush();
      expect(JSON.parse(p.calls.find((x) => x.method === 'PATCH')!.body)).toEqual({ ordered_media_ids: ['k2', 'k3', 'k1'] });
    });

    it('onto an earlier one puts it before it', async () => {
      const p = await photos(['k1', 'k2', 'k3']);
      const [a, , c] = p.tiles(p.photos());
      drag(p, c, a);
      expect(keys(p)).toEqual(['k3', 'k1', 'k2']);
    });

    it('shows where it would land while over a photo, and not afterwards', async () => {
      const p = await photos(['k1', 'k2']);
      const [a, b] = p.tiles(p.photos());
      b.dispatchEvent(new p.w.Event('dragover', { cancelable: true }));
      expect(b.style.outline).toBe('2px solid #B8860B');
      b.dispatchEvent(new p.w.Event('dragleave'));
      expect(b.style.outline).toBe('');
      b.dispatchEvent(new p.w.Event('dragover', { cancelable: true }));
      const drop: any = new p.w.Event('drop', { cancelable: true }); drop.dataTransfer = { getData: () => 'k1' }; b.dispatchEvent(drop);
      expect(b.style.outline).toBe('');
      expect(a).toBeTruthy();
    });

    it('a photo dropped on itself, or a key that is not on the page, changes nothing and saves nothing', async () => {
      const p = await photos(['k1', 'k2']);
      const [a, b] = p.tiles(p.photos());
      drag(p, a, a);
      drag(p, a, b, 'nope');
      expect(keys(p)).toEqual(['k1', 'k2']);
      await p.flush();
      expect(p.calls.filter((c) => c.method === 'PATCH')).toEqual([]);
    });

    it('find the dragged photo by a key with a quote in it', async () => {
      const p = await photos(['a"b', 'c']);
      const [a, b] = p.tiles(p.photos());
      drag(p, a, b);
      expect(keys(p)).toEqual(['c', 'a"b']);
    });
  });

  describe('×', () => {
    it('asks first, and does nothing when the agent says no', async () => {
      const asked: string[] = [];
      const p = boot({ answers: listAnswer([row('k1')]) });
      (p.media as any);
      const q = p.w.MallanListingMedia.create({
        prefix: 'rental', listingId: () => '', toast: () => undefined, confirm: (m: string) => { asked.push(m); return false; },
        fetch: (url: string, init: any = {}) => { p.calls.push({ url, method: init.method ?? 'GET' }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ listing_id: 'RL-7', media: [row('k1')] }) }); },
      });
      await q.render('RL-7');
      button(p.tiles(p.photos())[0], '×').click();
      await p.flush();
      expect(asked).toEqual(['Remove this photo?']);
      expect(p.calls.filter((c) => c.method === 'DELETE')).toEqual([]);
      expect(p.tiles(p.photos())).toHaveLength(1);
    });

    it('removes the picture, and the tile once the server has', async () => {
      const p = await photos(['k1', 'k2']);
      button(p.tiles(p.photos())[0], '×').click();
      expect(p.tiles(p.photos())).toHaveLength(2);                                // still there: the server has not answered
      await p.flush();
      const del = p.calls.find((c) => c.method === 'DELETE')!;
      expect(del.url).toBe('/api/crm/listings/RL-7/media/k1');
      expect(del.credentials).toBe('same-origin');
      expect(keys(p)).toEqual(['k2']);
      expect(p.toasts.at(-1)).toEqual(['Photo removed', 'success']);
    });

    it('takes the tile of a picture the server no longer has (404)', async () => {
      const p = boot({ answers: (c) => (c.method === 'DELETE' ? { ok: false, status: 404 } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1')] } }) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[0], '×').click();
      await p.flush();
      expect(p.tiles(p.photos())).toHaveLength(0);
    });

    it('keeps the tile and says so when the server refuses', async () => {
      const p = boot({ answers: (c) => (c.method === 'DELETE' ? { ok: false, status: 500 } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1')] } }) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[0], '×').click();
      await p.flush();
      expect(p.tiles(p.photos())).toHaveLength(1);
      expect(p.toasts.at(-1)).toEqual(['Could not remove the photo (HTTP 500)', 'error']);
    });

    it('keeps the tile and says so when the network is down', async () => {
      const p = boot({ answers: (c) => (c.method === 'DELETE' ? { ok: false, status: 0, reject: 'offline' } : { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k1')] } }) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[0], '×').click();
      await p.flush();
      expect(p.tiles(p.photos())).toHaveLength(1);
      expect(p.toasts.at(-1)).toEqual(['Could not remove the photo: offline', 'error']);
    });

    it('encodes the key of the picture in the address', async () => {
      const p = boot({ answers: (c) => (c.method === 'GET' ? { ok: true, status: 200, body: { listing_id: 'RL-7', media: [row('k/1 a')] } } : undefined) });
      await p.media.render('RL-7');
      button(p.tiles(p.photos())[0], '×').click();
      await p.flush();
      expect(p.calls.find((c) => c.method === 'DELETE')!.url).toBe('/api/crm/listings/RL-7/media/k%2F1%20a');
    });

    it('removes a floor plan too', async () => {
      const p = boot({ answers: listAnswer([row('f1', { media_type: 'FloorPlan' })]) });
      await p.media.render('RL-7');
      button(p.tiles(p.floors())[0], '×').click();
      await p.flush();
      expect(p.calls.find((c) => c.method === 'DELETE')!.url).toBe('/api/crm/listings/RL-7/media/f1');
      expect(p.tiles(p.floors())).toHaveLength(0);
    });
  });
});

describe('another record in the form', () => {
  it('forgets the files that were chosen and not saved', async () => {
    const p = boot();
    p.media.addFiles([p.file('a.jpg')], 'photo');
    expect(p.media.hasPending()).toBe(true);
    p.media.reset();
    expect(p.media.hasPending()).toBe(false);
    expect(p.count()).toBe('0 / 100 uploaded');
    expect(await p.media.uploadPending('RL-7')).toEqual({ uploaded: 0, failed: 0 });
    expect(p.calls).toEqual([]);
  });
});

describe('a page without a toast, a confirmation, a network or a way to preview a file', () => {
  const bare = () => {
    const dom = new JSDOM('<!doctype html><body><div id="rentalPhotoPreview"></div><span id="rentalPhotoCount"></span></body>', { url: 'https://mallan.nyc/', runScripts: 'outside-only' });
    const w: any = dom.window;
    w.eval(SOURCE);
    return w;
  };

  it('is built with the page itself when none is given: a file that cannot be previewed (jsdom has no object URL) is still taken, with a tile that has no picture', () => {
    const w = bare();
    const media = w.MallanListingMedia.create({ prefix: 'rental' });
    media.addFiles([new w.File(['x'], 'a.jpg', { type: 'image/jpeg' })], 'photo');
    expect(media.hasPending()).toBe(true);
    const tile = w.document.getElementById('rentalPhotoPreview').children[0];
    expect(tile.querySelector('img')).toBeNull();
    expect(tile.querySelector('p').textContent).toBe('a.jpg');
    expect(tile.querySelector('.bg-gray-100')).not.toBeNull();
  });

  it('a preview that fails is a tile without a picture, whatever the browser says', () => {
    const w = bare();
    const media = w.MallanListingMedia.create({ prefix: 'rental', createObjectURL: () => { throw new Error('no preview'); }, toast: () => undefined });
    media.addFiles([new w.File(['x'], 'a.jpg', { type: 'image/jpeg' }), new w.File(['yy'], 'b.jpg', { type: 'image/jpeg' })], 'photo');
    const tiles = [...w.document.getElementById('rentalPhotoPreview').children];
    expect(tiles.map((t: any) => t.querySelector('p').textContent)).toEqual(['a.jpg', 'b.jpg']);
    expect(tiles.every((t: any) => t.querySelector('img') === null)).toBe(true);
    expect(w.document.getElementById('rentalPhotoCount').textContent).toBe('2 / 100 uploaded');
  });

  it('a preview that is an empty address is a tile without a picture too', () => {
    const w = bare();
    const media = w.MallanListingMedia.create({ prefix: 'rental', createObjectURL: () => '', toast: () => undefined });
    media.addFiles([new w.File(['x'], 'a.jpg', { type: 'image/jpeg' })], 'photo');
    expect(w.document.getElementById('rentalPhotoPreview').children[0].querySelector('img')).toBeNull();
  });

  it('exposes the web-address test', () => {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://mallan.nyc/', runScripts: 'outside-only' });
    const w: any = dom.window;
    w.eval(SOURCE);
    expect(w.MallanListingMedia.webAddress(' https://a.example/x ')).toBe('https://a.example/x');
    expect(w.MallanListingMedia.webAddress('ftp://a')).toBe('');
    expect(w.MallanListingMedia.webAddress(undefined)).toBe('');
  });
});
