/// <reference types="jest" />
/**
 * The Sale Add / Edit form (SALE-FORM-REDESIGN.html) draws the listing's photos as tiles and shows a "Listing Published" panel with the addresses the server answers. What a listing
 * stores (any agent can write a listing's media; the server answers with addresses, ids and keys) is text and an attribute value there: never markup, never a piece of an inline
 * handler, and a stored address counts only when it is a web address. These tests drive the REAL page with hostile media.
 */
import { bootAddForm, sleep, until, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const H = (name: string) => `<img src=x onerror="window.__pwned_${name}=1">`;
const NASTY_ID = `a'),window.__pwned_id=1,('`;                       // closes a quoted argument of an inline handler
const NASTY_KEY = `k'),window.__pwned_key=1,('`;
const BREAKOUT = 'https://example.test/3.jpg" onerror="window.__pwned_url=1';

const pwned = (f: BootedForm) => Object.keys(f.w).filter((k) => k.startsWith('__pwned_'));
const handlerAttributes = (root: ParentNode) => [...root.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${el.tagName.toLowerCase()}[${a.name}]`));
const tiles = (f: BootedForm, box: string) => [...f.d.querySelectorAll(`#${box} > div`)] as HTMLElement[];
const button = (tile: HTMLElement, label: string) => [...tile.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label) || b.title === label) as HTMLButtonElement;
const listing = (extra: Record<string, unknown>) => ({
  id: '1', listing_id: 'L-1', status: 'Draft', address: {}, features: {}, agent_info: {}, raw_data: {}, media: [], ...extra,
});
async function openEdit(extra: Record<string, unknown>, mediaRows?: unknown): Promise<BootedForm> {
  return bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: listing(extra), mediaRows, settle: 1500 });
}

describe('the saved photos of a listing, as the page first draws them (the JSON the listing carries)', () => {
  const MEDIA = [
    { url: 'https://example.test/1.jpg', id: NASTY_ID, caption: 7 },                    // a caption that is not text
    { url: 'javascript:window.__pwned_js=1', id: 'js' },                                // not a web address
    null, 5, 'junk', [1, 2],                                                            // not records
    { url: 'https://example.test/2.jpg', id: 'fp', caption: 'Floor plan of the unit' },
    { heroUrl: BREAKOUT, id: 'three' },
    { thumbUrl: '//evil.test/x.jpg', id: 'protocol-relative' },
    { url: '/media/own.jpg', id: 'own' },
  ];

  it('draws a tile for every record with a web address, as text and attribute values, with no inline handler', async () => {
    const f = await openEdit({ media: MEDIA });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const photos = tiles(f, 'salePhotoPreview');
      const floors = tiles(f, 'saleFloorplanPreview');
      expect(photos.map((t) => t.querySelector('img')!.getAttribute('src'))).toEqual(['https://example.test/1.jpg', BREAKOUT, '/media/own.jpg']);
      expect(photos.map((t) => t.getAttribute('data-media-id'))).toEqual([NASTY_ID, 'three', 'own']);
      expect(floors.map((t) => t.querySelector('img')!.getAttribute('src'))).toEqual(['https://example.test/2.jpg']);
      expect([...photos, ...floors].map((t) => t.querySelector('img')!.getAttribute('draggable'))).toEqual(['false', 'false', 'false', 'false']);   // the picture is not the drag source; the photo tile is
      expect(photos.map((t) => t.draggable)).toEqual([true, true, true]);
      expect(handlerAttributes(f.d.getElementById('salePhotoPreview')!)).toEqual([]);
      expect(handlerAttributes(f.d.getElementById('saleFloorplanPreview')!)).toEqual([]);
      expect(f.d.getElementById('salePhotoCount')!.textContent).toBe('3 / 100 uploaded');
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('removing a tile removes the media with the id it holds, whatever characters that id has', async () => {
    const f = await openEdit({ media: MEDIA });
    try {
      const first = tiles(f, 'salePhotoPreview')[0];
      button(first, '×').click();
      expect(tiles(f, 'salePhotoPreview')).toHaveLength(2);
      const del = f.requests.filter((r) => r.method === 'DELETE');
      expect(del.map((r) => r.url)).toEqual([`/api/crm/listings/L-1/media/${encodeURIComponent(NASTY_ID)}`]);
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('dragging a tile onto another saves the order of the ids the tiles hold (an id with a quote in it is still that id)', async () => {
    const f = await openEdit({ media: MEDIA });
    try {
      const container = f.d.getElementById('salePhotoPreview')!;
      const [first, , last] = tiles(f, 'salePhotoPreview');
      last.ondrop!.call(last, { preventDefault() {}, dataTransfer: { getData: () => '0' } } as any);       // the first tile dropped on the last
      await sleep(50);                                                                                      // (the page answers the save with a toast; the window must still be open)
      const patch = f.requests.filter((r) => r.method === 'PATCH' && /media-order$/.test(r.url));
      expect(patch).toHaveLength(1);
      expect(JSON.parse(patch[0].body).ordered_media_ids).toEqual(['three', 'own', NASTY_ID]);
      expect([...container.children].map((t) => t.getAttribute('data-media-id'))).toEqual(['three', 'own', NASTY_ID]);
      expect(first.getAttribute('data-media-id')).toBe(NASTY_ID);
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });
});

describe('the saved photos of a listing, as the media manager draws them (the rows the server answers)', () => {
  const ROWS = [
    { media_key: NASTY_KEY, url: 'https://example.test/k1.jpg', media_type: 'Photo', preferred_photo_yn: true },
    { media_key: 'k2', url: 'javascript:window.__pwned_js=1', media_type: 'Photo' },
    { media_key: 'k3', url: 'https://example.test/k3.jpg', media_type: 'Photo' },
    { media_key: '', url: 'https://example.test/empty-key.jpg', media_type: 'Photo' },     // an empty key is no key
    null, 'junk', 7,
    { media_key: 'fp1', url: 'https://example.test/fp.jpg', media_type: 'FloorPlan' },
    { url: 'https://example.test/nokey.jpg', media_type: 'Photo' },                     // no key: it cannot be moved, made the cover or removed
    { media_key: 42, url: 'https://example.test/numeric-key.jpg', media_type: 'Photo' },
  ];

  it('draws a tile for every row that has a key, as text and attribute values, with no inline handler', async () => {
    const f = await openEdit({}, ROWS);
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const photos = tiles(f, 'salePhotoPreview');
      expect(photos.map((t) => t.getAttribute('data-media-key'))).toEqual([NASTY_KEY, 'k2', 'k3', '42']);
      expect(tiles(f, 'saleFloorplanPreview').map((t) => t.getAttribute('data-media-key'))).toEqual(['fp1']);
      expect(photos.map((t) => t.querySelector('img')?.getAttribute('src') ?? null)).toEqual(['https://example.test/k1.jpg', null, 'https://example.test/k3.jpg', 'https://example.test/numeric-key.jpg']);
      expect(photos.map((t) => t.querySelector('img')?.getAttribute('draggable') ?? null)).toEqual(['false', null, 'false', 'false']);
      expect(photos.map((t) => t.draggable)).toEqual([true, true, true, true]);
      expect(photos[0].textContent).toContain('COVER');
      expect(handlerAttributes(f.d.getElementById('salePhotoPreview')!)).toEqual([]);
      expect(handlerAttributes(f.d.getElementById('saleFloorplanPreview')!)).toEqual([]);
      expect(f.d.getElementById('salePhotoCount')!.textContent).toBe('4 / 100 uploaded');
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('Set cover, the move buttons and the remove button act on the key the tile holds', async () => {
    const f = await openEdit({}, ROWS);
    try {
      const [, second, third] = tiles(f, 'salePhotoPreview');
      button(second, 'Set cover').click();
      await sleep(50);
      expect(f.requests.filter((r) => r.method === 'PATCH' && r.url === '/api/crm/listings/L-1/media/k2').map((r) => JSON.parse(r.body))).toEqual([{ preferred_photo_yn: true }]);
      button(third, 'Move earlier').click();
      await sleep(50);
      const order = f.requests.filter((r) => r.method === 'PATCH' && /media-order$/.test(r.url)).map((r) => JSON.parse(r.body).ordered_media_ids);
      expect(order).toEqual([[NASTY_KEY, 'k3', 'k2', '42']]);
      button(tiles(f, 'salePhotoPreview')[0], '×').click();
      await sleep(50);
      expect(f.requests.filter((r) => r.method === 'DELETE').map((r) => r.url)).toEqual([`/api/crm/listings/L-1/media/${encodeURIComponent(NASTY_KEY)}`]);
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('a floor plan has no cover or move buttons, and can be removed', async () => {
    const f = await openEdit({}, ROWS);
    try {
      const [plan] = tiles(f, 'saleFloorplanPreview');
      expect(button(plan, 'Set cover')).toBeUndefined();
      expect(button(plan, 'Move earlier')).toBeUndefined();
      expect(button(plan, '×')).toBeDefined();
      expect(plan.draggable).toBe(false);
    } finally { f.close(); }
  });

  // three rows with plain keys: the order, the numbers and the actions of the tiles are the ones to read
  const THREE = [
    { media_key: 'a', url: ' https://example.test/a.jpg ', media_type: 'Photo' },           // an address with spaces around it
    { media_key: 'b', url: ['https://example.test/b.jpg'], media_type: 'Photo' },           // a list is not an address: the row keeps a blank tile, so it can still be removed
    { media_key: 'c', url: 'https://example.test/c.jpg', media_type: 'Photo' },
  ];
  const order = (f: BootedForm) => f.requests.filter((r) => r.method === 'PATCH' && /media-order$/.test(r.url)).map((r) => ({ url: r.url, keys: JSON.parse(r.body).ordered_media_ids }));

  it('reads an address with spaces around it, keeps a blank tile for a row it cannot draw, and numbers its tiles by place', async () => {
    const f = await openEdit({}, THREE);
    try {
      const photos = tiles(f, 'salePhotoPreview');
      expect(photos.map((t) => t.querySelector('img')?.getAttribute('src') ?? null)).toEqual(['https://example.test/a.jpg', null, 'https://example.test/c.jpg']);
      expect(photos[1].querySelector('div.bg-gray-100')).not.toBeNull();                       // the blank tile
      expect(button(photos[1], '×')).toBeDefined();
      expect(photos.map((t) => t.querySelector('p')!.textContent)).toEqual(['Photo 1', 'Photo 2', 'Photo 3']);
      expect(f.d.getElementById('salePhotoCount')!.textContent).toBe('3 / 100 uploaded');
      const buttons = [...f.d.querySelectorAll('#salePhotoPreview button')];
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.map((b) => b.getAttribute('type'))).toEqual(buttons.map(() => 'button'));          // no tile button submits the form it sits in
    } finally { f.close(); }
  });

  it('the move buttons save the new order, earlier and later, for the listing the tiles belong to, and number the tiles again', async () => {
    const f = await openEdit({}, THREE);
    try {
      button(tiles(f, 'salePhotoPreview')[0], 'Move later').click();
      await sleep(50);
      expect(tiles(f, 'salePhotoPreview').map((t) => t.getAttribute('data-media-key'))).toEqual(['b', 'a', 'c']);
      button(tiles(f, 'salePhotoPreview')[2], 'Move earlier').click();
      await sleep(50);
      expect(tiles(f, 'salePhotoPreview').map((t) => t.getAttribute('data-media-key'))).toEqual(['b', 'c', 'a']);
      expect(tiles(f, 'salePhotoPreview').map((t) => t.querySelector('p')!.textContent)).toEqual(['Photo 1', 'Photo 2', 'Photo 3']);
      expect(order(f)).toEqual([
        { url: '/api/crm/listings/L-1/media-order', keys: ['b', 'a', 'c'] },
        { url: '/api/crm/listings/L-1/media-order', keys: ['b', 'c', 'a'] },
      ]);
    } finally { f.close(); }
  });

  it('dragging a tile carries its key, and dropping it on another saves the keys in the new order', async () => {
    const f = await openEdit({}, THREE);
    try {
      const [a, , c] = tiles(f, 'salePhotoPreview');
      const carried: string[][] = [];
      a.ondragstart!.call(a, { dataTransfer: { setData: (type: string, value: string) => carried.push([type, value]) } } as any);
      expect(carried).toEqual([['text/plain', 'a']]);
      c.ondrop!.call(c, { preventDefault() {}, dataTransfer: { getData: () => 'a' } } as any);
      await sleep(50);
      expect(tiles(f, 'salePhotoPreview').map((t) => t.getAttribute('data-media-key'))).toEqual(['b', 'c', 'a']);
      expect(order(f)).toEqual([{ url: '/api/crm/listings/L-1/media-order', keys: ['b', 'c', 'a'] }]);
    } finally { f.close(); }
  });

  it('draws nothing for what is not a row with a key, whoever asks it to', async () => {
    const f = await openEdit({});
    try {
      const box = f.d.createElement('div');
      for (const bad of [null, undefined, 'junk', 7, [1], {}, { media_key: '' }, { media_key: {} }, { media_key: ['k'] }, { url: 'https://example.test/nokey.jpg' }]) f.w._renderMediaTile(box, bad, 0, 'L-1');
      expect(box.children).toHaveLength(0);
      f.w._renderMediaTile(box, { media_key: 'ok', url: 'https://example.test/ok.jpg', media_type: 'Photo' }, 0, 'L-1');
      expect(box.children).toHaveLength(1);
      f.w._renderMediaTile(box, { media_key: 7, url: 'https://example.test/seven.jpg', media_type: 'Photo' }, 1, 'L-1');
      expect([...box.children].map((t) => t.getAttribute('data-media-key'))).toEqual(['ok', '7']);
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });
});

describe('how a stored entry spells its address and its id (the JSON the listing carries)', () => {
  const SPELLINGS = [
    { url: ' https://example.test/pad.jpg ', id: 'pad' },                                    // an address with spaces around it
    { url: ['https://example.test/list.jpg'], id: 'list' },                                   // a list is not an address
    { thumbUrl: 'https://example.test/thumb.jpg', id: 'thumb' },                              // only a thumbnail
    { url: 'https://example.test/mid.jpg', id: {}, media_id: 'mid' },                         // an id that is not text is no id: the next spelling is read
    { url: 'https://example.test/mk.jpg', MediaKey: 'mk' },
    { url: 'https://example.test/num.jpg', id: 7 },                                           // a number is an id
  ];

  it('reads each spelling, and numbers its tiles by their place in the box', async () => {
    const f = await openEdit({ media: SPELLINGS });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const photos = tiles(f, 'salePhotoPreview');
      expect(photos.map((t) => t.querySelector('img')!.getAttribute('src'))).toEqual(['https://example.test/pad.jpg', 'https://example.test/thumb.jpg', 'https://example.test/mid.jpg', 'https://example.test/mk.jpg', 'https://example.test/num.jpg']);
      expect(photos.map((t) => t.getAttribute('data-media-id'))).toEqual(['pad', 'thumb', 'mid', 'mk', '7']);
      expect(photos.map((t) => t.querySelector('p')!.textContent)).toEqual(['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5']);
      expect(photos.map((t) => t.querySelector('.fa-grip-vertical')!.parentElement!.textContent!.trim())).toEqual(['1', '2', '3', '4', '5']);
      const buttons = [...f.d.querySelectorAll('#salePhotoPreview button')];
      expect(buttons.map((b) => b.getAttribute('type'))).toEqual(buttons.map(() => 'button'));
    } finally { f.close(); }
  });
});

describe('the photos an agent has chosen and not saved yet', () => {
  const file = (f: BootedForm, name: string, type = 'image/jpeg') => new f.w.File(['x'], name, { type });
  async function boot(): Promise<BootedForm> {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 800 });
    f.w.URL.createObjectURL = () => 'blob:preview';
    return f;
  }
  const choose = (f: BootedForm, files: unknown[], type = 'photo') => f.w.handleSaleMediaUpload({ target: { files, value: 'x' } }, type);

  it('shows a file name as text: a file can be called <img src=x onerror=...>.jpg', async () => {
    const f = await boot();
    try {
      choose(f, [file(f, `${H('name')}.jpg`), file(f, `${H('pdf')}.pdf`, 'application/pdf')]);
      const tilesNow = tiles(f, 'salePhotoPreview');
      expect(tilesNow).toHaveLength(2);
      expect(tilesNow[0].querySelector('p')!.textContent).toBe(`${H('name')}.jpg`);
      expect(tilesNow[1].querySelector('p')!.textContent).toBe(`${H('pdf')}.pdf`);
      expect(f.d.querySelector('#salePhotoPreview img[src="x"]')).toBeNull();
      expect(handlerAttributes(f.d.getElementById('salePhotoPreview')!)).toEqual([]);
      expect(tilesNow[0].querySelector('img')!.getAttribute('src')).toBe('blob:preview');
      expect(tilesNow[0].querySelector('img')!.getAttribute('draggable')).toBe('false');
      expect(button(tilesNow[1], '×')).toBeDefined();                                       // a PDF can be dropped from the list too
      const buttons = [...f.d.querySelectorAll('#salePhotoPreview button')];
      expect(buttons.map((b) => b.getAttribute('type'))).toEqual(buttons.map(() => 'button'));
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('the move buttons arrange the unsaved photos, and the remove button drops one', async () => {
    const f = await boot();
    try {
      choose(f, [file(f, 'a.jpg'), file(f, 'b.jpg'), file(f, 'c.jpg')]);
      const order = () => f.w.eval('_pendingMediaFiles.filter(function (e) { return !e._removed; }).sort(function (a, b) { return a.order - b.order; }).map(function (e) { return e.file.name; })');
      expect(order()).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
      button(tiles(f, 'salePhotoPreview')[2], 'Move earlier').click();
      expect(order()).toEqual(['a.jpg', 'c.jpg', 'b.jpg']);
      expect(tiles(f, 'salePhotoPreview').map((t) => t.querySelector('p')!.textContent)).toEqual(['a.jpg', 'c.jpg', 'b.jpg']);
      button(tiles(f, 'salePhotoPreview')[0], 'Move later').click();
      expect(order()).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
      button(tiles(f, 'salePhotoPreview')[1], '×').click();
      expect(tiles(f, 'salePhotoPreview').map((t) => t.querySelector('p')!.textContent)).toEqual(['c.jpg', 'b.jpg']);
      expect(f.d.getElementById('salePhotoCount')!.textContent).toBe('2 / 100 uploaded');
      expect(order()).toEqual(['c.jpg', 'b.jpg']);                                          // the file of the tile that was removed is the one dropped
    } finally { f.close(); }
  });

  it('a floor plan preview has no move buttons', async () => {
    const f = await boot();
    try {
      choose(f, [file(f, 'plan.png', 'image/png')], 'floorplan');
      const [plan] = tiles(f, 'saleFloorplanPreview');
      expect(button(plan, 'Move earlier')).toBeUndefined();
      expect(button(plan, '×')).toBeDefined();
    } finally { f.close(); }
  });
});

describe('the "Listing Published" panel', () => {
  async function panel(lid: string, publicUrl: unknown, realPlusUrl: unknown) {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 800 });
    const copied: string[] = [];
    Object.defineProperty(f.w.navigator, 'clipboard', { value: { writeText: (t: string) => { copied.push(t); return Promise.resolve(); } }, configurable: true });
    f.w.showSalePublishedPanel(lid, publicUrl, realPlusUrl);
    return { f, copied, el: f.d.getElementById('salePublishUrlPanel') as HTMLElement };
  }

  it('shows the listing id and the two addresses as text and attribute values', async () => {
    const { f, copied, el } = await panel(H('lid'), 'https://example.test/l/1" onmouseover="window.__pwned_p=1', 'https://example.test/r/1" onfocus="window.__pwned_r=1');
    try {
      expect(el.style.display).toBe('flex');
      expect(el.querySelector('strong')!.textContent).toBe(H('lid'));
      expect((f.d.getElementById('salePublicUrlInput') as HTMLInputElement).value).toBe('https://example.test/l/1" onmouseover="window.__pwned_p=1');
      expect((f.d.getElementById('saleRealPlusUrlInput') as HTMLInputElement).value).toBe('https://example.test/r/1" onfocus="window.__pwned_r=1');
      const link = el.querySelector('a')!;
      expect(link.getAttribute('href')).toBe('https://example.test/l/1" onmouseover="window.__pwned_p=1');
      expect([...link.attributes].map((a) => a.name).sort()).toEqual(['class', 'href', 'rel', 'target']);
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(handlerAttributes(el)).toEqual([]);
      expect(el.querySelector('img[src="x"]')).toBeNull();
      button(el, 'Copy').click();
      [...el.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes('Copy'))[1].click();
      expect(copied).toEqual(['https://example.test/l/1" onmouseover="window.__pwned_p=1', 'https://example.test/r/1" onfocus="window.__pwned_r=1']);
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('an address that is not a web address is shown but not linked', async () => {
    const { f, el } = await panel('SL-1', 'javascript:window.__pwned_j=1', 'https://example.test/r/1');
    try {
      expect(el.querySelector('a')).toBeNull();
      expect((f.d.getElementById('salePublicUrlInput') as HTMLInputElement).value).toBe('javascript:window.__pwned_j=1');
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('links an address with spaces around it as the address, and none of its buttons submits the form', async () => {
    const { f, el } = await panel('SL-1', '  https://example.test/l/1  ', 'https://example.test/r/1');
    try {
      expect(el.querySelector('a')!.getAttribute('href')).toBe('https://example.test/l/1');
      const buttons = [...el.querySelectorAll('button')];
      expect(buttons).toHaveLength(3);                                                      // Copy, Copy, Go to Dashboard
      expect(buttons.map((b) => b.getAttribute('type'))).toEqual(['button', 'button', 'button']);
    } finally { f.close(); }
  });

  it('is what a submit that publishes shows, with the id and the addresses the server answered as text', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', {
      settle: 1200,
      created: { listing_id: H('lid'), publicUrl: 'https://example.test/l/9', realPlusUrl: 'https://example.test/r/9" onfocus="window.__pwned_r=1' },
    });
    try {
      (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;      // not on the RLS: no REBNY fields are required
      (f.d.getElementById('saleStatus') as HTMLSelectElement).value = 'Active';
      f.w.submitSalesListing();
      await until(() => !!f.d.getElementById('salePublishUrlPanel'), 6000);
      const el = f.d.getElementById('salePublishUrlPanel') as HTMLElement;
      expect(el).not.toBeNull();
      expect(el.querySelector('strong')!.textContent).toBe(H('lid'));
      expect(el.querySelector('img[src="x"]')).toBeNull();
      expect((f.d.getElementById('salePublicUrlInput') as HTMLInputElement).value).toBe('https://example.test/l/9');
      expect((f.d.getElementById('saleRealPlusUrlInput') as HTMLInputElement).value).toBe('https://example.test/r/9" onfocus="window.__pwned_r=1');
      expect(el.querySelector('a')!.getAttribute('href')).toBe('https://example.test/l/9');
      expect(handlerAttributes(el)).toEqual([]);
      expect(pwned(f)).toEqual([]);
    } finally { f.close(); }
  });

  it('shown twice, it is one panel (the second replaces the first)', async () => {
    const { f } = await panel('SL-1', 'https://example.test/l/1', 'https://example.test/r/1');
    try {
      f.w.showSalePublishedPanel('SL-2', 'https://example.test/l/2', 'https://example.test/r/2');
      expect(f.d.querySelectorAll('#salePublishUrlPanel')).toHaveLength(1);
      expect(f.d.querySelectorAll('#salePublicUrlInput')).toHaveLength(1);
      expect((f.d.getElementById('salePublicUrlInput') as HTMLInputElement).value).toBe('https://example.test/l/2');
      await sleep(10);
    } finally { f.close(); }
  });
});
