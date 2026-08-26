/// <reference types="jest" />
/**
 * PAGINATION IS A SERVER ROUND TRIP, NEVER A LOCAL SLICE.
 *
 * The controls moved `currentPage` and re-rendered over whatever rows were
 * already loaded. That pages perfectly through the WINDOW and calls it the
 * answer — the same page-local defect this workstream removed everywhere else,
 * arriving at the last hop. A live Manhattan Active-residential search matches
 * 4,622 listings; no amount of local paging reaches result 201.
 *
 * One page transition now carries the whole request identity:
 *
 *     current canonical criteria   (through the ONE serializer)
 *   + canonical sort key
 *   + requested final-universe page
 *   -> server
 *   -> authoritative rows + count disposition
 *
 * Two things it must NOT do, both asserted below: invent a last page from a
 * lower-bound count, and lose the broker's selection because new rows arrived.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const REPO = resolve(__dirname, '../..');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const pagination = readFileSync(resolve(REPO, 'public/crm/js/search/pagination.js'), 'utf8');
const apiClient = readFileSync(resolve(REPO, 'public/crm/js/core/api-client.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

/**
 * Run the real pagination controls against a stub _requestResultPage and report
 * which page they asked for. Source greps cannot prove navigation arithmetic.
 */
function navigate(
  action: 'first' | 'prev' | 'next' | 'last' | 'perPage',
  state: Record<string, unknown>,
): number | null {
  const start = pagination.indexOf('function _goToPage(');
  const end = pagination.indexOf('// Column sort toggle');
  const body = pagination.slice(start, end);

  let asked: number | null = null;
  const sandbox: Record<string, unknown> = {
    searchResultsState: state,
    window: {
      _requestResultPage: (n: number) => {
        asked = n;
      },
    },
    renderSearchResults: () => {},
    getFilteredListings: () => (state.filteredListings as unknown[]) || [],
    document: { getElementById: () => ({ value: '20' }) },
    Math,
    parseInt,
    console: { log() {}, warn() {}, error() {} },
  };
  sandbox.globalThis = sandbox;
  const call = {
    first: 'goToFirstPage()',
    prev: 'goToPrevPage()',
    next: 'goToNextPage()',
    last: 'goToLastPage()',
    perPage: 'changePerPage()',
  }[action];
  runInNewContext(body + ';' + call + ';', sandbox);
  return asked;
}

const authoritative = (over: Record<string, unknown> = {}) => ({
  resultProvenance: 'authoritative',
  currentPage: 3,
  perPage: 20,
  filteredListings: Array.from({ length: 20 }, (_, i) => ({ id: i })),
  serverTotalPages: 7,
  serverHasMore: true,
  ...over,
});

describe('the controls ask the server for a page', () => {
  it('Next requests the next page number', () => {
    expect(navigate('next', authoritative())).toBe(4);
  });

  it('Previous requests the previous page number', () => {
    expect(navigate('prev', authoritative())).toBe(2);
  });

  it('First requests page 1', () => {
    expect(navigate('first', authoritative())).toBe(1);
  });

  it('Last requests the known final page', () => {
    expect(navigate('last', authoritative())).toBe(7);
  });

  it('changing page size re-cuts from page 1', () => {
    // Page size changes what a page IS, so keeping the page number would carry
    // over a position that meant something different a moment ago.
    expect(navigate('perPage', authoritative())).toBe(1);
  });

  it('Previous does nothing on page 1', () => {
    expect(navigate('prev', authoritative({ currentPage: 1 }))).toBeNull();
  });

  it('Next stops at the known last page', () => {
    expect(navigate('next', authoritative({ currentPage: 7 }))).toBeNull();
  });
});

describe('an unknown last page is never invented', () => {
  const lowerBound = (over: Record<string, unknown> = {}) =>
    authoritative({ serverTotalPages: null, serverHasMore: true, ...over });

  it('Next keeps going on a lower bound, driven by hasMore', () => {
    expect(navigate('next', lowerBound())).toBe(4);
  });

  it('Next stops when the server says there is no more', () => {
    expect(navigate('next', lowerBound({ serverHasMore: false }))).toBeNull();
  });

  it('Last does nothing when no final page has been proven', () => {
    // Jumping to "the end" of a universe whose end is unknown would have to
    // guess, and the server deliberately withheld that number.
    expect(navigate('last', lowerBound())).toBeNull();
  });
});

describe('a provisional set still pages locally', () => {
  it('there is no server universe behind a preview to page', () => {
    const state = {
      resultProvenance: 'provisional',
      currentPage: 1,
      perPage: 20,
      filteredListings: Array.from({ length: 60 }, (_, i) => ({ id: i })),
      serverTotalPages: null,
      serverHasMore: false,
    };
    expect(navigate('next', state)).toBe(2);
  });
});

describe('the page request carries the whole request identity', () => {
  const block = engine.slice(
    engine.indexOf('function _requestResultPage('),
    engine.indexOf('// Server-side search: query Trestle API'),
  );

  it('serializes criteria through the ONE serializer', () => {
    expect(block).toMatch(/buildIdxSearchParams\(/);
  });

  it('sends the requested page and the current page size', () => {
    expect(block).toMatch(/params\.page = targetPage/);
    expect(block).toMatch(/params\.limit = searchResultsState\.perPage/);
  });

  it('carries the canonical sort key', () => {
    expect(block).toMatch(/params\.sort = searchResultsState\.sortKey/);
  });

  it('adopts the server count disposition with the rows', () => {
    expect(block).toMatch(/serverCount = result\.count/);
    expect(block).toMatch(/typeof result\.totalPages === 'number'/);
  });

  it('fails closed rather than showing the previous page under a new heading', () => {
    expect(block).toMatch(/filteredListings = \[\]/);
    expect(block).toMatch(/_setResultProvenance\('none'\)/);
  });

  it('never slices filteredListings as authoritative pagination', () => {
    const code = block
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/filteredListings\.slice\(/);
  });
});

describe('selection survives a page change', () => {
  it('the page request never writes selectedListings', () => {
    // selectedListings lives on searchResultsState and is persisted
    // independently, so swapping the rows on screen cannot discard listings the
    // broker picked on an earlier page. This pins that it stays that way.
    const block = engine.slice(
      engine.indexOf('function _requestResultPage('),
      engine.indexOf('// Server-side search: query Trestle API'),
    );
    expect(block).not.toMatch(/selectedListings\s*=/);
    expect(block).not.toMatch(/workingSet\s*=/);
  });
});

describe('the wire carries the page', () => {
  it('the API client forwards it', () => {
    expect(apiClient).toMatch(/qs\.push\('page=' \+ params\.page\)/);
  });

  it('the served artifact carries the server-backed controls', () => {
    expect(built).toMatch(/_requestResultPage/);
  });
});

/**
 * THE MAP ANSWERS A DIFFERENT QUESTION FROM THE GRID.
 *
 * Pins answer "where is this inventory"; the grid answers "which rows am I
 * reading now". Feeding the map the current page would have cut it from ~200
 * pins to one page's worth the moment pagination became real — a regression in
 * the area-scanning workflow, paid for a fix it had nothing to do with.
 *
 * So the map keeps its own bounded read of the SAME criteria and sort, and
 * paging deliberately does not disturb it.
 */
describe('the map keeps its own bounded universe', () => {
  it('the search loads it separately from the page', () => {
    expect(engine).toMatch(/function _loadMapUniverse\(/);
    expect(engine).toMatch(/_loadMapUniverse\(params\)/);
  });

  it('it is bounded rather than unbounded', () => {
    const block = engine.slice(engine.indexOf('function _loadMapUniverse('), engine.indexOf('function _requestResultPage('));
    expect(block).toMatch(/mapParams\.limit = 500/);
    expect(block).toMatch(/mapParams\.page = 1/);
  });

  it('a failed map read never takes the result set down with it', () => {
    // The grid is the answer; the map is support.
    const block = engine.slice(engine.indexOf('function _loadMapUniverse('), engine.indexOf('function _requestResultPage('));
    expect(block).toMatch(/\.catch\(/);
    expect(block).not.toMatch(/_setResultProvenance\('none'\)/);
  });

  it('the renderer prefers the map universe and falls back to visible rows', () => {
    const map = readFileSync(resolve(REPO, 'public/crm/js/render/results-map.js'), 'utf8');
    expect(map).toMatch(/searchResultsState\.mapListings/);
    expect(map).toMatch(/getFilteredListings\(true\)/);
  });

  it('paging does not re-fetch the map universe', () => {
    // Pins are still answering the same question, and 500 rows per page turn
    // would be a real cost for no change on screen.
    const block = engine.slice(
      engine.indexOf('function _requestResultPage('),
      engine.indexOf('// Server-side search: query Trestle API'),
    );
    expect(block).not.toMatch(/_loadMapUniverse\(/);
  });

  it('a stale map universe cannot outlive its criteria', () => {
    const block = engine.slice(engine.indexOf('function _setResultProvenance('), engine.indexOf('function _setResultProvenance(') + 1800);
    expect(block).toMatch(/mapListings = null/);
  });
});

/**
 * A SERVER PAGE MUST NOT BE PAGINATED AGAIN.
 *
 * Once filteredListings holds ONE SERVER PAGE, slicing it by currentPage
 * paginates a page: page 3 takes rows 41-60 of a 20-row array and renders
 * nothing, so every page after the first looks like an empty search. A
 * PROVISIONAL set still needs the slice — it holds the whole locally-filtered
 * catalogue, and the slice is what turns it into a page.
 */
describe('the renderer does not re-paginate a server page', () => {
  function visible(state: Record<string, unknown>): unknown[] {
    const dispatcher = readFileSync(
      resolve(REPO, 'public/crm/js/render/render-dispatcher.js'),
      'utf8',
    );
    const start = dispatcher.indexOf('// PAGINATE LOCALLY ONLY WHEN');
    const end = dispatcher.indexOf('return listings;', start) + 'return listings;'.length;
    const body = dispatcher.slice(start, end);
    const sandbox: Record<string, unknown> = {
      searchResultsState: state,
      listings: (state.filteredListings as unknown[]).slice(),
      skipPagination: false,
      Math,
    };
    sandbox.globalThis = sandbox;
    return runInNewContext(
      '(function(){ var listings = globalThis.listings; ' + body + ' })()',
      sandbox,
    ) as unknown[];
  }

  it('an authoritative page 3 still renders its twenty rows', () => {
    // The regression this prevents: 20 rows in, nothing out.
    const rows = visible({
      resultProvenance: 'authoritative',
      serverCount: { value: 4_622, isExact: true },
      currentPage: 3,
      perPage: 20,
      filteredListings: Array.from({ length: 20 }, (_, i) => ({ id: i })),
    });
    expect(rows).toHaveLength(20);
  });

  it('a provisional set is still sliced into a page', () => {
    const rows = visible({
      resultProvenance: 'provisional',
      serverCount: null,
      currentPage: 2,
      perPage: 20,
      filteredListings: Array.from({ length: 60 }, (_, i) => ({ id: i })),
    });
    expect(rows).toHaveLength(20);
    expect((rows[0] as any).id).toBe(20);
  });

  it('an authoritative set with no server count is still sliced', () => {
    // Older callers that never received a count hold the whole catalogue.
    const rows = visible({
      resultProvenance: 'authoritative',
      serverCount: null,
      currentPage: 2,
      perPage: 20,
      filteredListings: Array.from({ length: 60 }, (_, i) => ({ id: i })),
    });
    expect(rows).toHaveLength(20);
    expect((rows[0] as any).id).toBe(20);
  });
});

/**
 * SEQUENTIAL NEXT RESUMES; A JUMP RESCANS.
 *
 * A read budget that bounds one request is correct. Without continuation it
 * also bounds how much inventory is reachable, which is a different and much
 * worse thing — the authorized provider population is around 591,000 rows.
 *
 * The two behaviours are kept distinct on purpose: sending a resume position
 * for a non-sequential move would return the wrong page while looking like it
 * worked.
 */
describe('the continuation travels with sequential Next only', () => {
  const block = engine.slice(
    engine.indexOf('function _requestResultPage('),
    engine.indexOf('// Server-side search: query Trestle API'),
  );

  it('only the immediately following page carries it', () => {
    expect(block).toMatch(/targetPage === \(searchResultsState\.currentPage \|\| 1\) \+ 1/);
    expect(block).toMatch(/params\.continuation = searchResultsState\.serverContinuation/);
  });

  it('the position is stored from whatever the server sent', () => {
    expect(engine).toMatch(/serverContinuation = result\.continuation \|\| null/);
  });

  it('a stale position cannot outlive its criteria', () => {
    const prov = engine.slice(
      engine.indexOf('function _setResultProvenance('),
      engine.indexOf('function _setResultProvenance(') + 1300,
    );
    expect(prov).toMatch(/serverContinuation = null/);
  });

  it('the API client forwards it as an opaque value', () => {
    expect(apiClient).toMatch(/qs\.push\('continuation=' \+ encodeURIComponent\(params\.continuation\)\)/);
  });
});

/**
 * AN UNFINISHED PAGE IS FINISHED, NOT ADVANCED PAST.
 *
 * If the read budget ends mid-page the server says PAGE_INCOMPLETE_BUDGET.
 * Rendering those rows and letting the broker press Next would make the page
 * boundaries a fiction — page 1 = rows 1-20, page 2 = rows 21-70. Nothing is
 * lost, but "page 1" then means "however far we got", which is not a page.
 */
describe('the client finishes an unfinished page before advancing', () => {
  const block = engine.slice(
    engine.indexOf('function _handlePageResult('),
    engine.indexOf('function _pageRequestFailed('),
  );

  it('recognises the incomplete state', () => {
    expect(block).toMatch(/PAGE_INCOMPLETE_BUDGET/);
  });

  it('continues the SAME page rather than moving on', () => {
    expect(block).toMatch(/_continuePage\(targetPage/);
  });

  it('asks only for what the page is still owed', () => {
    // Requesting a fresh full page would overshoot, and the extra rows would
    // belong to page 2.
    const cont = engine.slice(
      engine.indexOf('function _continuePage('),
      engine.indexOf('function _requestResultPage('),
    );
    expect(cont).toMatch(/owed = \(searchResultsState\.perPage \|\| 50\) -/);
    expect(cont).toMatch(/params\.limit = Math\.max\(1, owed\)/);
  });

  it('the fill is BOUNDED, and a bounded-out page keeps its incomplete state', () => {
    // A search where nearly everything is gated must not spend unbounded round
    // trips on one page; when the bound bites the page is rendered as-is,
    // still labelled incomplete rather than silently called finished.
    expect(engine).toMatch(/_MAX_PAGE_FILL_SEGMENTS = \d+/);
    expect(block).toMatch(/_fillAttempts < _MAX_PAGE_FILL_SEGMENTS/);
    expect(block).toMatch(/pageCompleteness = result\.pageCompleteness/);
  });

  it('rows assembled across segments are concatenated, not replaced', () => {
    // Replacing would discard the first segment and silently shorten the page.
    expect(block).toMatch(/_pendingPageRows \|\| \[\]\)\.concat\(/);
  });

  it('the accumulator is cleared once the page is delivered', () => {
    // Otherwise the next page would start with the previous page's leftovers.
    expect(block).toMatch(/_pendingPageRows = null/);
    expect(block).toMatch(/_fillAttempts = 0/);
  });

  it('a failure clears the accumulator too', () => {
    const req = engine.slice(
      engine.indexOf('function _requestResultPage('),
      engine.indexOf('function _handlePageResult('),
    );
    expect(req).toMatch(/_pendingPageRows = null/);
  });
});
