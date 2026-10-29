/// <reference types="jest" />
/**
 * Sale-form: reorder photos at ANY stage (2026-06-23). Reported: "when I add a photo the arrow
 * does not work" — newly added photos were unsaved previews (data-media-index, no arrows) and
 * were only reorderable after Save Draft uploaded them into keyed tiles.
 *
 * Fix:
 *  - SAVED listing (has id): handleSaleMediaUpload uploads the just-added photos immediately and
 *    re-renders the keyed manager, so they become reorderable keyed tiles right away.
 *  - UNSAVED listing (no id): preview tiles get their own ◀/▶ (_movePendingTile) + a picture that is
 *    not draggable, and _movePendingTile resyncs _pendingMediaFiles[].order so the upload keeps the
 *    arranged order.
 *
 * 2026-10-07: a preview tile is built with DOM calls by _pendingTile (a file can be called
 * <img src=x onerror=...>.jpg, and its name is text), so the preview assertions read that builder.
 * That its buttons act on their own file is proven on the real page in crm-sale-media-tiles.test.ts.
 *
 * Source-structure assertions (repo sale-form harness; no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

/** The text of a top-level `function name(...) { ... }` declaration, by brace matching. */
function fnText(name: string): string {
  const start = FORM.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function not found: ${name}`);
  const open = FORM.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < FORM.length; i++) {
    if (FORM[i] === '{') depth++;
    else if (FORM[i] === '}' && --depth === 0) return FORM.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces for ${name}`);
}

describe('sale form — saved listing uploads-on-add so photos are instantly reorderable', () => {
  it('handleSaleMediaUpload uploads the added photos + re-renders the keyed manager when the listing has an id', () => {
    const i = FORM.indexOf('function handleSaleMediaUpload(');
    const fn = FORM.slice(i, FORM.indexOf('function removePendingMedia('));
    expect(fn).toMatch(/_editId\s*=\s*\([\s\S]*?_saleEditListingId[\s\S]*?_saleEditDbId/);
    expect(fn).toMatch(/if \(_editId[\s\S]*?uploadPendingMedia\(_editId,/);
    expect(fn).toContain('renderServerMediaRows(_editId)');
  });
});

describe('sale form — unsaved preview photos are reorderable pre-save', () => {
  it('preview photo tiles render ◀/▶ wired to _movePendingTile, image not draggable', () => {
    // handleSaleMediaUpload gives each chosen file its own tile…
    expect(fnText('handleSaleMediaUpload')).toContain('_pendingTile(file,');
    // …and the tile of a photo carries the buttons and a picture that is not draggable
    const tile = fnText('_pendingTile');
    expect(tile).toContain('_movePendingTile(div, -1)'); // move earlier
    expect(tile).toContain('_movePendingTile(div, 1)');  // move later
    expect(tile).toContain('_tileImage(previewUrl,');
    expect(fnText('_tileImage')).toMatch(/img\.draggable = false;/);
    // photos only: a floor plan or a PDF is not reordered here
    expect(tile).toMatch(/if \(mediaType === 'photo'\) \{[\s\S]*?_movePendingTile\(div, -1\)/);
  });

  it('_movePendingTile moves among pending tiles (data-media-index) and resyncs _pendingMediaFiles order', () => {
    const i = FORM.indexOf('function _movePendingTile(');
    expect(i).toBeGreaterThan(-1);
    const fn = FORM.slice(i, i + 1000);
    expect(fn).toContain("sib.getAttribute('data-media-index') === null"); // skip keyed tiles
    expect(fn).toMatch(/_pendingMediaFiles\[parseInt\(idxAttr, 10\)\]/);
    expect(fn).toContain('entry.order = pos++');
  });
});

describe('sale form — upload-on-add safety (Codex #434)', () => {
  it('upload-on-add appends after existing photos (omits order) instead of posting order=0', () => {
    // the call passes appendAfterExisting…
    expect(FORM).toContain('uploadPendingMedia(_editId, { appendAfterExisting: true })');
    // …and uploadPendingMedia only sends `order` when NOT appending
    const i = FORM.indexOf('async function uploadPendingMedia(');
    const fn = FORM.slice(i, i + 3600);
    expect(fn).toMatch(/if \(!\(opts && opts\.appendAfterExisting\)\) \{\s*formData\.append\('order'/);
  });

  it('uploadPendingMedia has a re-entrancy lock so concurrent saves cannot double-upload', () => {
    const i = FORM.indexOf('async function uploadPendingMedia(');
    const fn = FORM.slice(i, i + 3600);
    expect(fn).toContain('if (_uploadPendingMediaBusy)');
    expect(fn).toContain('_uploadPendingMediaBusy = true');
    expect(fn).toMatch(/finally \{\s*_uploadPendingMediaBusy = false/);
  });
});
