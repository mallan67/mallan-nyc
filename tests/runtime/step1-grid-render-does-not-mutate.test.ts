/// <reference types="jest" />
/**
 * STEP 1a's LAST DOWNSTREAM HOLE — and the widest one.
 *
 * `renderGridView()` opens its row loop with:
 *
 *     if (listing.price  == null) listing.price  = 0;
 *     if (!listing.status)        listing.status = 'ACTIVE';
 *     if (!listing.permissions)   listing.permissions = {};
 *     ... and four more
 *
 * `getFilteredListings()` returns references into the shared `listings` array,
 * so this does not default a display copy — it REWRITES the inventory. And it
 * runs on every grid render, over every row.
 *
 * Grid is the default results view. So the mapper returning null, and both
 * loaders preserving that null, bought nothing: the first paint of the first
 * search overwrote all of it with 0 and 'ACTIVE' before the broker read a
 * single row. Anything that reads `listings` afterwards — selection, reports,
 * the CMA, saved searches — reads the invented values, not the provider's.
 *
 * The renderer may format however it likes. It may not edit the record.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

function mount() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><table id="resultsTable"></table></body></html>', {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as any;
  win.escapeHtml = (s: string) => String(s);
  win.searchResultsState = { visibleColumns: [], selectedListings: [], sortField: null, sortOrder: 'asc', viewMode: 'grid' };

  for (const rel of ['public/crm/js/render/grid-column-defs.js', 'public/crm/js/render/render-grid.js']) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }
  return win;
}

/** A provider row with identity and nothing else established. */
const unknownRow = () => ({
  id: 'RLS20000001', lid: 'RLS20000001',
  price: null, totalMonthly: null, beds: null, baths: null,
  address: null, status: null, permissions: undefined,
});

describe('rendering the results grid does not rewrite the results', () => {
  const render = (win: any, rows: any[]) => {
    win.getFilteredListings = () => rows;
    win.renderGridView();
  };

  it.each(['price', 'totalMonthly', 'beds', 'baths'])('does not write 0 over an unknown %s', (field) => {
    const win = mount();
    const rows = [unknownRow()];
    render(win, rows);
    expect((rows[0] as any)[field]).toBeNull();
  });

  it('does not write ACTIVE over an unknown status', () => {
    const win = mount();
    const rows = [unknownRow()];
    render(win, rows);
    expect(rows[0].status).not.toBe('ACTIVE');
    expect(rows[0].status).toBeNull();
  });

  it('does not manufacture an address', () => {
    const win = mount();
    const rows = [unknownRow()];
    render(win, rows);
    expect(rows[0].address).toBeNull();
  });

  it('does not attach an empty permissions object to the record', () => {
    // An empty permissions object reads as "no restriction on this listing" to
    // every gate that checks it. Unknown permissions are not absent ones.
    const win = mount();
    const rows = [unknownRow()];
    render(win, rows);
    expect(rows[0].permissions).toBeUndefined();
  });

  it('leaves the record byte-identical after a render', () => {
    const win = mount();
    const rows = [unknownRow()];
    const before = JSON.stringify(rows[0]);
    render(win, rows);
    expect(JSON.stringify(rows[0])).toBe(before);
  });

  it('still renders rows — not mutating is not the same as not working', () => {
    const win = mount();
    render(win, [{ ...unknownRow(), price: 1250000, status: 'ACTIVE', address: '15 E 91st St' }]);
    const html = win.document.getElementById('resultsTable').innerHTML;
    expect(html).toContain('RLS20000001');
    expect(html).not.toContain('Render error');
  });
});
