/// <reference types="jest" />
/**
 * STEP 1, ITEM 3 — A REPORT SHOWS THE MEDIA THAT EXISTS.
 *
 * `reports.js` built the photo grid from a fabricated count, not from the media:
 *
 *     var pCount = l.photoCount || 6;                       // line 1799
 *     for (var pi = 0; pi < Math.min(pCount, 9); pi++) {
 *         var imgUrl = imgArr[pi % imgArr.length] ...        // MODULO
 *
 * Three separate falsehoods came out of those two lines:
 *
 *   1. The badge read `(l.photoCount||6) + ' photos'`, so a listing with an
 *      unknown count — or an explicit ZERO — was reported to the client as
 *      having six photos.
 *   2. `pi % imgArr.length` wraps. A listing with two real photos rendered a
 *      six-tile grid: the same two images cycled three times, each tile
 *      numbered 1 through 6, presented as six distinct views of the property.
 *   3. With no images at all, `imgArr[pi % 0]` is `undefined`, so all six tiles
 *      fell through to the placeholder — six numbered tiles of nothing.
 *
 * A client receiving that report counts the photos. So does an agent deciding
 * whether a listing needs a shoot.
 *
 * The rule: explicit 0 stays 0, unknown stays unknown, and the grid renders the
 * actual media once each — no padding, no repeats.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const REPORTS = 'public/crm/js/output/reports.js';
const PACKAGE = 'public/crm/js/output/report-package.js';

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously', url: 'https://mallan.test/crm/', virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as any;
  win.escapeHtml = (s: string) => String(s == null ? '' : s);
  // cotality-field-map.js is loaded at index.html:105, ahead of reports.js at :142.
  const script = win.document.createElement('script');
  script.textContent = readFileSync(join(REPO, 'public/crm/js/core/cotality-field-map.js'), 'utf8');
  win.document.body.appendChild(script);
  return win;
}

const photo = (n: number) => ({ url: 'https://cdn.test/' + n + '.jpg', isPrimary: n === 1 });

describe('the count reported is the count that exists', () => {
  it('reports an unknown photo count as unknown, not as 6', () => {
    const win = mount();
    expect(win.reportedPhotoCount({ photoCount: null, images: [] })).toBeNull();
  });

  it('reports an explicit zero as zero', () => {
    const win = mount();
    expect(win.reportedPhotoCount({ photoCount: 0, images: [] })).toBe(0);
  });

  it('reports the provider count when the provider supplied one', () => {
    const win = mount();
    expect(win.reportedPhotoCount({ photoCount: 14, images: [photo(1)] })).toBe(14);
  });

  it('falls back to the media actually held, never to a constant', () => {
    const win = mount();
    expect(win.reportedPhotoCount({ photoCount: null, images: [photo(1), photo(2)] })).toBe(2);
  });
});

describe('the grid renders the media that exists, once each', () => {
  it('renders nothing when there is no media', () => {
    const win = mount();
    expect(win.reportPhotoTiles({ photoCount: null, images: [] })).toEqual([]);
  });

  it('does not pad a two-photo listing out to six tiles', () => {
    const win = mount();
    expect(win.reportPhotoTiles({ photoCount: 6, images: [photo(1), photo(2)] })).toHaveLength(2);
  });

  it('never repeats the same photo', () => {
    const win = mount();
    const tiles = win.reportPhotoTiles({ photoCount: 9, images: [photo(1), photo(2), photo(3)] });
    expect(new Set(tiles.map((t: any) => t.url)).size).toBe(tiles.length);
  });

  it('still caps a large gallery at the nine the layout holds', () => {
    const win = mount();
    const many = Array.from({ length: 20 }, (_, i) => photo(i + 1));
    expect(win.reportPhotoTiles({ photoCount: 20, images: many })).toHaveLength(9);
  });

  it('honours the off-market single-photo rule the report already applies', () => {
    // REBNY RLS, Feb 2025: off-market listings show the primary photo only.
    const win = mount();
    const off = { status: 'CLOSED', photoCount: 8, images: [photo(1), photo(2), photo(3)] };
    expect(win.reportPhotoTiles(off)).toHaveLength(1);
  });
});

describe('the fabricated constant is gone from both report generators', () => {
  /** Executable lines only — a comment describing the removed defect is not the defect. */
  const code = (rel: string) =>
    readFileSync(join(REPO, rel), 'utf8')
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith('//'))
      .join(String.fromCharCode(10));

  it.each([REPORTS, PACKAGE])('%s no longer defaults a photo count to 6', (rel) => {
    expect(code(rel)).not.toMatch(/photoCount\s*\|\|\s*6/);
    expect(code(rel)).not.toMatch(/pCount\s*\|\|\s*6/);
  });

  it('reports.js no longer indexes photos by modulo', () => {
    expect(code(REPORTS)).not.toMatch(/imgArr\[\s*pi\s*%/);
  });
});
