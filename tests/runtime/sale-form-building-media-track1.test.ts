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
  const start = src.indexOf(sig);
  if (start === -1) throw new Error(`function not found: ${name}`);
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
});
