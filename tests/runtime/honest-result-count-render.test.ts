/// <reference types="jest" />
/**
 * THE NUMBER THE BROKER READS.
 *
 * `updateResultsCount` printed `filteredListings.length + ' Results'`. That is
 * the size of what was FETCHED, not the size of the result universe. A live
 * Manhattan Active-residential search matches 4,622 listings and the browser
 * asks for one window of them, so the header said "200 Results" for a search
 * with 4,622 matches.
 *
 * A silently truncated count is worse for a broker than an inflated one: it
 * reads as "this inventory does not exist", and they stop looking.
 *
 * The server now returns the final-universe count together with what that
 * number MEANS — EXACT_FINAL_UNIVERSE when the whole provider universe was
 * traversed, LOWER_BOUND_TRUNCATED when traversal stopped early. The renderer
 * must carry that distinction through: "200 Results" and "200+ Results" are
 * different claims and only one of them is true of a bounded read.
 *
 * TWO WAYS TO GET THIS WRONG, both guarded here:
 *
 *   1. flattening a lower bound into a bare total
 *   2. pairing a server total with a set the server did not produce — a
 *      provisional preview is a local re-filter of whatever catalogue happens to
 *      be loaded, so a server count over it would describe two different sets in
 *      one sentence
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const REPO = resolve(__dirname, '../..');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

/**
 * Execute the real updateResultsCount body against a fake DOM and return what
 * the header would say. Source assertions cannot prove a rendered string.
 */
function renderCount(state: Record<string, unknown>): string {
  const start = engine.indexOf('function updateResultsCount()');
  const end = engine.indexOf('\n        }', engine.indexOf('bottomCurrentPageEl', start));
  const body = engine.slice(start, end + '\n        }'.length);

  let rendered = '';
  const byId: Record<string, string> = {};
  const el = () => ({
    set textContent(v: string) {
      rendered = v;
    },
    get textContent() {
      return rendered;
    },
  });
  const idEl = (id: string) => ({
    set textContent(v: string) {
      byId[id] = String(v);
    },
    get textContent() {
      return byId[id];
    },
  });
  const sandbox: Record<string, unknown> = {
    searchResultsState: state,
    listings: [],
    Math,
    document: {
      querySelectorAll: () => [el()],
      getElementById: (id: string) => idEl(id),
    },
    console: { log() {}, warn() {}, error() {} },
  };
  sandbox.globalThis = sandbox;
  runInNewContext(body + ';updateResultsCount();', sandbox);
  (renderCount as any).lastPageText = byId.totalPages;
  return rendered;
}

/** What the "of N" slot showed on the last renderCount() call. */
const lastPageText = () => (renderCount as any).lastPageText;

const authoritative = (count: number, isExact: boolean, rows = 20) => ({
  filteredListings: Array.from({ length: rows }, (_, i) => ({ id: i })),
  perPage: 20,
  currentPage: 1,
  resultProvenance: 'authoritative',
  serverCount: { value: count, isExact },
  // The server withholds this whenever the count is a lower bound.
  serverTotalPages: isExact ? Math.ceil(count / 20) : null,
});

describe('an exact count is printed as a total', () => {
  it('reports the universe size, not the fetched window', () => {
    // 4,622 matches, 20 rows on screen. The old renderer said "20 Results".
    expect(renderCount(authoritative(4_622, true))).toBe('4622 Results');
  });

  it('a small exact count still reads normally', () => {
    expect(renderCount(authoritative(7, true, 7))).toBe('7 Results');
  });

  it('zero is an answer, not an error', () => {
    expect(renderCount(authoritative(0, true, 0))).toBe('0 Results');
  });
});

describe('a lower bound is never printed as a total', () => {
  it('marks a truncated traversal', () => {
    expect(renderCount(authoritative(1_000, false))).toBe('1000+ Results');
  });

  it('the distinction survives at the same numeric value', () => {
    // Same number, two different claims. If these ever render identically the
    // meaning has been flattened away.
    expect(renderCount(authoritative(200, true))).not.toBe(
      renderCount(authoritative(200, false)),
    );
  });
});

describe('a server count is never shown over a set the server did not produce', () => {
  it('a provisional preview falls back to what is actually on screen', () => {
    // A local re-filter of the loaded catalogue. Pairing it with a server total
    // would describe two different sets in one sentence.
    const state = { ...authoritative(4_622, true), resultProvenance: 'provisional' };
    expect(renderCount(state)).toBe('20 Results');
  });

  it('a failed search reports nothing rather than the previous total', () => {
    const state = {
      ...authoritative(4_622, true),
      resultProvenance: 'none',
      filteredListings: [],
    };
    expect(renderCount(state)).toBe('0 Results');
  });

  it('an authoritative set with no server count uses the rows it has', () => {
    // Older callers that never received a count must degrade to the honest
    // local number rather than render undefined.
    const state = { ...authoritative(4_622, true), serverCount: null };
    expect(renderCount(state)).toBe('20 Results');
  });
});

describe('the declared count cannot outlive its own answer', () => {
  it('downgrading provenance clears it', () => {
    // Otherwise a stale "4,622 Results" sits above a local preview.
    const start = engine.indexOf('function _setResultProvenance(');
    const block = engine.slice(start, start + 900);
    expect(block).toMatch(/provenance !== 'authoritative'/);
    expect(block).toMatch(/serverCount = null/);
  });

  it('every path that adopts a server answer records that answer’s count', () => {
    const toolbar = readFileSync(
      resolve(REPO, 'public/crm/js/listing/toolbar-functions.js'),
      'utf8',
    );
    for (const src of [engine, toolbar]) {
      expect(src).toMatch(/serverCount\s*=\s*\(result && result\.count\)/);
    }
  });
});

describe('the served artifact carries the same renderer', () => {
  it('the built shell marks lower bounds', () => {
    expect(built).toMatch(/\+ Results/);
  });
});

/**
 * A LOWER BOUND MUST NOT NAME THE LAST PAGE.
 *
 * These two claims cannot both be shown:
 *
 *     1000+ Results
 *     Page 1 of 5
 *
 * The `+` says more inventory may exist; `of 5` says page 5 is the end. The
 * server sends totalPages: null whenever the traversal stopped early, and
 * deriving one locally from the lower-bound count would re-fabricate exactly the
 * number it declined to claim.
 */
describe('the last page is only named when it is known', () => {
  it('an exact count names it', () => {
    renderCount(authoritative(140, true));
    expect(lastPageText()).toBe('7');
  });

  it('a lower bound shows no final page', () => {
    renderCount(authoritative(1_000, false));
    expect(lastPageText()).not.toBe('50');
    expect(lastPageText()).toBe('—');
  });

  it('the contradiction can never render together', () => {
    const text = renderCount(authoritative(1_000, false));
    expect(text).toBe('1000+ Results');
    // If this ever became a number, the header and the pager would be making
    // opposite claims about the same search.
    expect(lastPageText()).toBe('—');
  });

  it('a local preview still gets a real page count from its own rows', () => {
    // Nothing was withheld here — the set on screen IS the whole set.
    renderCount({ ...authoritative(4_622, true), resultProvenance: 'provisional' });
    expect(lastPageText()).toBe('1');
  });
});
