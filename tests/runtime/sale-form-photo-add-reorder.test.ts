/// <reference types="jest" />
/**
 * Sale-form: reorder photos at ANY stage (2026-06-23). Reported: "when I add a photo the arrow
 * does not work" — newly added photos were unsaved previews (data-media-index, no arrows) and
 * were only reorderable after Save Draft uploaded them into keyed tiles.
 *
 * Fix:
 *  - SAVED listing (has id): handleSaleMediaUpload uploads the just-added photos immediately and
 *    re-renders the keyed manager, so they become reorderable keyed tiles right away.
 *  - UNSAVED listing (no id): preview tiles get their own ◀/▶ (_movePendingTile) + draggable="false",
 *    and _movePendingTile resyncs _pendingMediaFiles[].order so the upload keeps the arranged order.
 *
 * Source-structure assertions (repo sale-form harness; no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

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
  it('preview photo tiles render ◀/▶ wired to _movePendingTile, image draggable="false"', () => {
    const i = FORM.indexOf('function handleSaleMediaUpload(');
    const fn = FORM.slice(i, FORM.indexOf('function removePendingMedia('));
    expect(fn).toContain('_movePendingTile(');
    expect(fn).toMatch(/<img src="' \+ previewUrl \+ '" draggable="false"/);
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
