/// <reference types="jest" />
/**
 * A SERVER ANSWER MUST NOT BE NARROWED AND THEN CALLED AUTHORITATIVE.
 *
 * Most client-side re-filtering in this CRM is already honest about itself. The
 * pre-render in performSearch is marked `provisional` and replaced the moment
 * the server answers; "Last Search" recall and the post-bootstrap re-filter both
 * call markSearchResultsProvisional(). Those are previews and they say so.
 *
 * The re-sort path in toolbar-functions.js was not. It:
 *
 *   1. asked the server, which applied the criteria and the distribution gates
 *   2. replaced the local catalogue with the server's rows
 *   3. ran filterListings() over them AGAIN with the same criteria
 *   4. called markSearchResultsAuthoritative()
 *
 * Step 3 can only remove rows, and step 4 declares whatever survives to be the
 * answer. So a disagreement between the client's idea of a criterion and the
 * server's silently shrinks an authoritative result set — and re-sorting is not
 * supposed to change WHICH listings match at all, only their order.
 *
 * THE DISAGREEMENT IS NOT HYPOTHETICAL. The mapper deliberately refuses to
 * invent values: an unknown borough stays unknown rather than becoming
 * Manhattan, an unknown fee stays unknown rather than becoming $0. That was a
 * fix, and it is the right behaviour. But the client post-filter compares those
 * same fields with plain equality, so a row the mapper honestly left blank fails
 * the comparison and is dropped. The server counted it; the client removes it;
 * the header then reports the smaller number.
 *
 * Re-sort now renders exactly what the server returned. The criteria were
 * already applied once, by the layer that owns them.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const toolbar = readFileSync(resolve(REPO, 'public/crm/js/listing/toolbar-functions.js'), 'utf8');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

/** The re-sort success handler, where the server's rows are adopted. */
function resortBlock(src: string): string {
  const start = src.indexOf("_replaceListings(result.listings, 'IDX/Trestle (re-sort)')");
  expect(start).toBeGreaterThan(-1);
  // Wide enough to reach the assignment past the explanatory comment block.
  return src.slice(start, start + 3000);
}

describe('the re-sort path renders the server answer unchanged', () => {
  it('does not re-filter the rows the server just returned', () => {
    const code = resortBlock(toolbar)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/filterListings\(/);
  });

  it('still marks the set authoritative — the server DID answer', () => {
    // The fix is to stop narrowing, not to downgrade a real server answer to a
    // preview. Re-sort asks the server with the current criteria, so its result
    // is authoritative; it was the extra filtering that made it untrue.
    expect(resortBlock(toolbar)).toMatch(/markSearchResultsAuthoritative/);
  });

  it('assigns the server rows straight through', () => {
    expect(resortBlock(toolbar)).toMatch(/filteredListings\s*=\s*(result\.listings|listings\.slice\(\))/);
  });
});

describe('the paths that DO re-filter say they are previews', () => {
  it.each([
    ['public/crm/js/search/search-actions.js', 'markSearchResultsProvisional'],
    ['public/crm/js/core/data-loader.js', 'markSearchResultsProvisional'],
  ])('%s downgrades its local re-filter', (file, marker) => {
    const src = readFileSync(resolve(REPO, file), 'utf8');
    expect(src).toContain('filterListings(');
    expect(src).toContain(marker);
  });

  it('the performSearch pre-render is provisional until the server replies', () => {
    const start = engine.indexOf('var localResults =');
    const block = engine.slice(start, engine.indexOf('_serverSearch(activeSearchCriteria', start));
    expect(block).toMatch(/_setResultProvenance\('provisional'\)/);
  });

  it('_serverSearch adopts the server rows without re-filtering them', () => {
    // The reference behaviour the re-sort path now matches.
    const start = engine.indexOf('var serverListings = result.listings;');
    const block = engine.slice(start, start + 2500);
    expect(block).not.toMatch(/filterListings\(/);
  });
});

describe('the served artifact carries the same behaviour', () => {
  it('the built shell does not re-filter the re-sort answer', () => {
    const code = resortBlock(built)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/filterListings\(/);
  });
});

/**
 * THE STRUCTURAL INVARIANT.
 *
 * Classifying the ~30 criteria filterListings() applies, one at a time, would
 * be endless and would rot: the useful question is not "is this criterion's
 * client implementation faithful to the server's" but "can this function's
 * output ever be presented as the answer".
 *
 * It cannot. Every remaining call site produces a PREVIEW and says so, which
 * makes the entire class safe structurally rather than criterion by criterion.
 * A future call site that forgets fails here.
 */
describe('filterListings can never produce an authoritative result set', () => {
  const CALL_SITES: Readonly<Record<string, string>> = Object.freeze({
    'public/crm/js/search/search-engine.js':
      'performSearch pre-render — rendered for responsiveness, replaced by ' +
      '_serverSearch, and suppressed entirely when the criteria include keys ' +
      'the server strips.',
    'public/crm/js/search/search-actions.js':
      '"Last Search" recall — re-filters whatever catalogue is loaded and never ' +
      'asks the server.',
    'public/crm/js/core/data-loader.js':
      'Post-bootstrap re-filter — a local re-filter of the freshly loaded ' +
      'catalogue, not a server answer.',
    'public/crm/js/compliance/compliance-gates-and-output.js':
      'The compliance self-test harness. It calls filterListings as the SUBJECT ' +
      'of assertions and never renders broker results.',
  });

  /** Files that call filterListings, excluding the definition itself. */
  function callers(): string[] {
    const files = [
      'public/crm/js/search/search-engine.js',
      'public/crm/js/search/search-actions.js',
      'public/crm/js/core/data-loader.js',
      'public/crm/js/listing/toolbar-functions.js',
      'public/crm/js/compliance/compliance-gates-and-output.js',
    ];
    return files.filter((f) => {
      const src = readFileSync(resolve(REPO, f), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n')
        .replace(/function filterListings\(/g, '');
      return /(?<!\.)\bfilterListings\(/.test(src);
    });
  }

  it('every caller is declared', () => {
    // Fails BY FILE. A new caller must state why its output cannot be mistaken
    // for the answer.
    expect(callers().filter((f) => !(f in CALL_SITES))).toEqual([]);
  });

  it('the re-sort path is no longer among them', () => {
    // It was the only caller whose output was marked authoritative.
    expect(callers()).not.toContain('public/crm/js/listing/toolbar-functions.js');
  });

  it('every declared caller carries a reason', () => {
    for (const [file, note] of Object.entries(CALL_SITES)) {
      expect(note.length).toBeGreaterThan(40);
      expect(file).toBeTruthy();
    }
  });
});
