/// <reference types="jest" />
/**
 * Track 1 — CRM sale-form building auto-load + media manager live defects.
 *
 * Confirmed by Maya in incognito on the correct redesign URL
 * (/crm/sale-listing?id=308773 → SALE-FORM-REDESIGN.html, listing SL-0004):
 *
 *   Building:
 *     - The street address "333 East 46th Street" was shown in the Building
 *       Name field (#saleBldgName); the modal Street Address (#saleBldgStreetAddress)
 *       was blank; the main-form Neighborhood (#saleNeighborhoodFromAddress)
 *       stayed on its "Auto-populated" placeholder instead of "Turtle Bay".
 *
 *   Root causes (proven from source, NOT cache):
 *     1. fetchBuildingsFromAPI sets building.name = b.name || b.building_name.
 *        A building with no vanity name returns its street address as the name;
 *        populateBuildingFromIDX copied it into #saleBldgName, then
 *        collectSaleFormData persisted data.BuildingName = saleBldgName, and
 *        edit-load restored it back via SALE_FIELD_MAP.
 *     2. #saleBldgStreetAddress has NO SALE_FIELD_MAP restore entry → blank on load.
 *     3. #saleNeighborhoodFromAddress was written by NO code path → placeholder forever.
 *
 *   Fix: a shared `_syncSaleBuildingAddressFields()` helper, invoked from
 *   populateBuildingFromIDX (lookup), _populateSaleFormFromApi (edit restore),
 *   and saveSaleBuilding (previously a no-op alert stub).
 *
 *   Media:
 *     - The legacy positional preview renders first and is only replaced when
 *       the keyed renderServerMediaRows() succeeds; it returned silently on any
 *       non-OK fetch, stranding the OLD UI. The GET route resolves BOTH the
 *       numeric DB id (308773) AND the string listing_id (SL-0004); the fix adds
 *       a numeric-id fallback retry + a non-silent warning so the keyed manager
 *       is never stranded behind the legacy preview.
 *
 * Style: node-env static source guards (repo convention — live DOM is covered by
 * crm:test + Playwright) PLUS one behavioral assertion that extracts the shipped
 * helper and runs it against a minimal DOM shim.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const MEDIA_ROUTE_PATH = resolve(__dirname, '../../app/api/crm/listings/[id]/media/route.ts');
const formHtml = readFileSync(FORM_PATH, 'utf8');
const mediaRouteTs = readFileSync(MEDIA_ROUTE_PATH, 'utf8');

/** Extract a top-level `function name(...) { ... }` declaration via brace match. */
function extractFn(src: string, name: string): string {
  const sig = `function ${name}(`;
  let start = src.indexOf(sig);
  if (start === -1) throw new Error(`function not found: ${name}`);
  // Preserve a leading `async ` so an extracted async function stays async
  // (otherwise its `await`s become top-level and fail to parse on eval).
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const braceStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

describe('Track 1 building — source guards', () => {
  it('shared _syncSaleBuildingAddressFields helper exists', () => {
    expect(formHtml).toMatch(/function _syncSaleBuildingAddressFields\(\)/);
  });

  it('populateBuildingFromIDX invokes the sync (lookup path)', () => {
    const fn = extractFn(formHtml, 'populateBuildingFromIDX');
    expect(fn).toMatch(/_syncSaleBuildingAddressFields\(\)/);
  });

  it('_populateSaleFormFromApi invokes the sync AFTER restoring saleStreetAddress (edit-load path)', () => {
    const fn = extractFn(formHtml, '_populateSaleFormFromApi');
    const setStreet = fn.indexOf("setVal('saleStreetAddress'");
    const sync = fn.indexOf('_syncSaleBuildingAddressFields()');
    expect(setStreet).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(setStreet);
  });

  it('saveSaleBuilding is no longer a bare alert() stub and runs the sync', () => {
    const fn = extractFn(formHtml, 'saveSaleBuilding');
    expect(fn).toMatch(/_syncSaleBuildingAddressFields\(\)/);
    // The old no-op stub was `alert('Building information saved successfully!')`.
    expect(fn).not.toMatch(/alert\(\s*['"]/); // no actual alert() call (comment mention is fine)
  });
});

describe('Track 1 building — behavioral (DOM shim of the shipped helper)', () => {
  type El = { value: string; options?: Array<{ value: string; text: string }>; selectedIndex?: number };

  function run(els: Record<string, El>): Record<string, El> {
    const document = { getElementById: (id: string) => els[id] || null };
    const src = extractFn(formHtml, '_syncSaleBuildingAddressFields');
    // eslint-disable-next-line no-new-func
    const factory = new Function('document', `${src}; return _syncSaleBuildingAddressFields;`);
    factory(document)();
    return els;
  }

  it('strips address-as-name, backfills modal Street Address, mirrors neighborhood label', () => {
    const els = run({
      saleStreetAddress: { value: '333 East 46th Street' },
      saleBldgName: { value: '333 East 46Th Street' }, // address wrongly saved as the name
      saleBldgStreetAddress: { value: '' },
      saleBldgNeighborhood: {
        value: 'TurtleBay',
        options: [
          { value: '', text: 'Select Neighborhood' },
          { value: 'TurtleBay', text: 'Turtle Bay' },
        ],
        selectedIndex: 1,
      },
      saleNeighborhoodFromAddress: { value: '' },
    });
    expect(els.saleBldgName.value).toBe('');                          // (1) cleared
    expect(els.saleBldgStreetAddress.value).toBe('333 East 46th Street'); // (2) backfilled
    expect(els.saleNeighborhoodFromAddress.value).toBe('Turtle Bay');     // (3) mirrored label
  });

  it('preserves a genuine vanity Building Name (only the address-equal case is cleared)', () => {
    const els = run({
      saleStreetAddress: { value: '15 Central Park West' },
      saleBldgName: { value: 'Fifteen Central Park West' },
      saleBldgStreetAddress: { value: '' },
      saleBldgNeighborhood: { value: '', options: [{ value: '', text: 'Select Neighborhood' }], selectedIndex: 0 },
      saleNeighborhoodFromAddress: { value: '' },
    });
    expect(els.saleBldgName.value).toBe('Fifteen Central Park West');
  });

  it('does not overwrite a Street Address the agent already typed in the modal', () => {
    const els = run({
      saleStreetAddress: { value: '333 East 46th Street' },
      saleBldgName: { value: 'The Grand' },
      saleBldgStreetAddress: { value: '200 East 66th Street' }, // distinct, pre-entered
      saleBldgNeighborhood: { value: '', options: [{ value: '', text: 'Select Neighborhood' }], selectedIndex: 0 },
      saleNeighborhoodFromAddress: { value: '' },
    });
    expect(els.saleBldgStreetAddress.value).toBe('200 East 66th Street');
    expect(els.saleBldgName.value).toBe('The Grand');
  });
});

describe('Track 1 media — keyed manager never stranded behind legacy preview', () => {
  it('renderServerMediaRows accepts a fallbackId and retries the numeric DB id', () => {
    const fn = extractFn(formHtml, 'renderServerMediaRows');
    expect(formHtml).toMatch(/function renderServerMediaRows\(listingId,\s*fallbackId\)/);
    expect(fn).toMatch(/fallbackId\s*&&\s*fallbackId\s*!==\s*listingId/);
  });

  it('a non-OK media load surfaces a warning (no silent strand of the old UI)', () => {
    const fn = extractFn(formHtml, 'renderServerMediaRows');
    expect(fn).toMatch(/showToast\([^)]*could not load/i);
  });

  it('tile actions use the CANONICAL data.listing_id, not the numeric fallback (Codex #295)', () => {
    const fn = extractFn(formHtml, 'renderServerMediaRows');
    // media-order PATCH resolves only listing_id, so tiles must carry the
    // canonical id the GET echoes — never the numeric DB id used as a fallback.
    expect(fn).toMatch(/var actionId\s*=\s*String\(\(data && data\.listing_id\)\s*\|\|\s*listingId\s*\|\|\s*''\)/);
    expect(fn).toMatch(/_renderMediaTile\(photoContainer, m, idx, actionId\)/);
    expect(fn).toMatch(/_renderMediaTile\(floorContainer, m, idx, actionId\)/);
    // actionId must NEVER fall back to the numeric fallbackId for actions, and
    // the retry must NOT rebind listingId to the numeric id.
    expect(fn).not.toMatch(/actionId\s*=[^;]*fallbackId/);
    expect(fn).not.toMatch(/listingId\s*=\s*fallbackId/);
  });

  it('legacy-preview reorder also prefers the canonical listing_id (not the numeric DB id)', () => {
    // The legacy fallback block's drag-reorder must hit /SL-0004/media-order too.
    expect(formHtml).toMatch(/var editId = _saleEditListingId \|\| _saleEditDbId;/);
    expect(formHtml).not.toMatch(/var editId = _saleEditDbId \|\| _saleEditListingId;/);
  });

  it('the edit-load call site passes the numeric DB id as the fallback', () => {
    const fn = extractFn(formHtml, '_populateSaleFormFromApi');
    expect(fn).toMatch(
      /renderServerMediaRows\(\s*listing\.listing_id[^,]*,\s*listing\.id != null \? String\(listing\.id\) : ''/,
    );
  });

  it('media GET route resolves BOTH the numeric DB id AND the string listing_id', () => {
    // numeric path
    expect(mediaRouteTs).toMatch(/parseInt\(id\)/);
    expect(mediaRouteTs).toMatch(/where:\s*\{\s*id:\s*BigInt\(numericId\)\s*\}/);
    // listing_id path
    expect(mediaRouteTs).toMatch(/where:\s*\{\s*listing_id:\s*id\s*\}/);
  });

  it('media GET route returns canonical listing_id on EVERY success branch', () => {
    // active rows, all-deleted, and legacy-preview all echo listing_id so the
    // form can always derive a canonical action id.
    const successReturns = (mediaRouteTs.match(/return NextResponse\.json\(\{\s*listing_id:\s*listing\.listing_id/g) || []);
    expect(successReturns.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Track 1 media — behavioral: canonical id flows to tiles via a numeric-id session', () => {
  it('a numeric /crm/sale-listing?id=308773 session binds tiles to canonical SL-0004, never 308773', async () => {
    const src = `${extractFn(formHtml, '_fetchListingMedia')}\n${extractFn(formHtml, 'renderServerMediaRows')}`;
    const captured: string[] = [];
    const fakeDoc = {
      getElementById: (id: string) => {
        if (id === 'salePhotoPreview' || id === 'saleFloorplanPreview') return { innerHTML: '' };
        if (id === 'salePhotoCount') return { textContent: '' };
        return null;
      },
    };
    // GET always echoes the canonical listing_id even when resolved by numeric id.
    const fetchMock = async (_url: string) => ({
      ok: true,
      json: async () => ({
        listing_id: 'SL-0004',
        media: [
          { media_type: 'Photo', media_key: 'k1', url: 'u1' },
          { media_type: 'FloorPlan', media_key: 'f1', url: 'u2' },
        ],
      }),
    });
    const renderTile = (_c: unknown, _m: unknown, _i: number, listingId: string) => { captured.push(listingId); };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const runner = new Function(
      'document', 'fetch', 'showToast', '_renderMediaTile',
      `${src}; return renderServerMediaRows;`,
    );
    // Numeric id as BOTH primary and fallback — the worst case Maya flagged.
    await runner(fakeDoc, fetchMock, () => {}, renderTile)('308773', '308773');

    expect(captured.length).toBe(2);                  // 1 photo + 1 floorplan tile
    expect([...new Set(captured)]).toEqual(['SL-0004']); // every tile bound to canonical id
    expect(captured).not.toContain('308773');          // never the numeric DB id
  });
});
