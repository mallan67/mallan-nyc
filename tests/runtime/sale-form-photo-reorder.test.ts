/// <reference types="jest" />
/**
 * Sale-form photo reorder (2026-06-23). Reported: "I cannot arrange the photos" with a MOUSE.
 *
 * Root cause: each draggable tile contained an <img> with no draggable="false". Browsers make
 * images natively draggable, so a mouse-drag started an IMAGE drag and the tile's
 * dragstart/drop never fired — reordering did nothing. Fix: draggable="false" on the photo
 * images (both the keyed manager and the legacy preview) so the TILE is the drag source, PLUS
 * ◀/▶ click-to-move buttons (_moveMediaTile) that reorder with no drag at all and persist via
 * the existing /media-order PATCH (_persistMediaRowOrder).
 *
 * Source-structure assertions (repo sale-form harness; no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

describe('sale form — photo images are not natively draggable (so the TILE drag works)', () => {
  it('keyed-manager tile image has draggable="false"', () => {
    expect(FORM).toMatch(/<img src="' \+ m\.url \+ '" draggable="false"/);
  });
  it('legacy-preview tile image has draggable="false"', () => {
    expect(FORM).toMatch(/<img src="' \+ url \+ '" draggable="false"/);
  });
  it('no photo tile image is left without the draggable guard', () => {
    // the old un-guarded forms must be gone
    expect(FORM).not.toContain(`'<img src="' + m.url + '" class="w-full h-24 object-cover`);
    expect(FORM).not.toContain(`'<img src="' + url + '" class="w-full h-24 object-cover`);
  });
});

describe('sale form — click-to-move reorder buttons (drag-free)', () => {
  it('photo tiles render ◀/▶ buttons wired to _moveMediaTile (only for non-floorplans)', () => {
    const i = FORM.indexOf('var moveBtns = isFloor ?');
    expect(i).toBeGreaterThan(-1);
    const block = FORM.slice(i, i + 700);
    expect(block).toContain("_moveMediaTile("); // (source escapes the quote: _moveMediaTile(\'...)
    expect(block).toContain(",-1)"); // move earlier
    expect(block).toContain(",1)");  // move later
    expect(block).toMatch(/isFloor \? ''/); // floorplans get no move buttons
  });

  it('_moveMediaTile swaps neighbors and persists via _persistMediaRowOrder', () => {
    const i = FORM.indexOf('function _moveMediaTile(');
    expect(i).toBeGreaterThan(-1);
    const fn = FORM.slice(i, i + 1900);
    expect(fn).toContain('previousElementSibling'); // move earlier
    expect(fn).toContain('nextElementSibling');     // move later
    // Codex #433: skip unsaved upload-preview tiles (no data-media-key) so visible == persisted order.
    expect(fn).toContain("while (sib && !sib.getAttribute('data-media-key'))");
    expect(fn).toContain('_persistMediaRowOrder(listingId, orderedKeys)');
  });

  it('the reorder still posts to the /media-order route (unchanged persistence path)', () => {
    expect(FORM).toMatch(/_persistMediaRowOrder[\s\S]*?\/media-order/);
  });
});
