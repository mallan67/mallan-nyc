/// <reference types="jest" />
/**
 * Sale-form photo reorder (2026-06-23). Reported: "I cannot arrange the photos" with a MOUSE.
 *
 * Root cause: each draggable tile contained an <img> with no draggable="false". Browsers make
 * images natively draggable, so a mouse-drag started an IMAGE drag and the tile's
 * dragstart/drop never fired — reordering did nothing. Fix: the photo images (both the keyed
 * manager and the legacy preview) are not draggable, so the TILE is the drag source, PLUS
 * ◀/▶ click-to-move buttons (_moveMediaTile) that reorder with no drag at all and persist via
 * the existing /media-order PATCH (_persistMediaRowOrder).
 *
 * 2026-10-07: the tiles are built with DOM calls (a stored address, id or key is an attribute
 * value, never markup), so the guard now lives in ONE builder, _tileImage, and these assertions
 * read that builder and the code that calls it. That a real tile's picture is not draggable and
 * that its buttons move it is proven on the real page in crm-sale-media-tiles.test.ts.
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

describe('sale form — photo images are not natively draggable (so the TILE drag works)', () => {
  it('the tile picture builder makes the image not draggable', () => {
    expect(fnText('_tileImage')).toMatch(/img\.draggable = false;/);
  });
  it('keyed-manager tile image is made by it', () => {
    expect(fnText('_renderMediaTile')).toContain('_tileImage(url,');
  });
  it('legacy-preview tile image is made by it', () => {
    expect(fnText('_populateSaleFormFromApi')).toContain('_tileImage(url,');
  });
  it('no photo tile image is left without the draggable guard', () => {
    // the only <img> the page makes is the guarded one, and the old string-built forms are gone
    expect(FORM.match(/createElement\('img'\)/g)).toHaveLength(1);
    expect(fnText('_tileImage')).toContain("createElement('img')");
    expect(FORM).not.toContain(`'<img src="' + m.url + '"`);
    expect(FORM).not.toContain(`'<img src="' + url + '"`);
    expect(FORM).not.toContain(`'<img src="' + previewUrl + '"`);
  });
});

describe('sale form — click-to-move reorder buttons (drag-free)', () => {
  it('photo tiles render ◀/▶ buttons wired to _moveMediaTile (only for non-floorplans)', () => {
    const tile = fnText('_renderMediaTile');
    const guard = tile.search(/if \(!isFloor\) \{\s*var move\b/);
    expect(guard).toBeGreaterThan(-1);
    const block = tile.slice(guard);
    expect(block).toContain('_moveMediaTile(listingId, mediaKey, -1)'); // move earlier
    expect(block).toContain('_moveMediaTile(listingId, mediaKey, 1)');  // move later
    expect(block).toContain("'◀'");
    expect(block).toContain("'▶'");
    // floorplans get no move buttons: nothing before the non-floorplan guard moves a tile
    expect(tile.slice(0, guard)).not.toContain('_moveMediaTile(');
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
