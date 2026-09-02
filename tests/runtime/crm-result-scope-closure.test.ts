/// <reference types="jest" />
/**
 * ONE PAGE IS NOT THE RESULT SET, AND EVERY CONSUMER MUST KNOW IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT FAMILY
 *
 * On the authoritative path `searchResultsState.filteredListings` holds ONE
 * SERVER PAGE. Six consumers read it as the whole result set, each getting the
 * scope wrong independently:
 *
 *   selection cleanup  pruned selectedListings to the ids on THIS page and
 *                      PERSISTED it — paging 1 -> 2 deleted the broker's picks,
 *                      while the server response promises
 *                      `selectionsAreDurableBy: "ListingKey"`.
 *   column sort        reordered fifty rows while the pager read "Page 3 of 93".
 *   reports            defaulted to a radio labelled "All Results (N)" with N the
 *                      page length, and built CSV / print / email bodies from it.
 *   averages row       presented page statistics as the search's market figures.
 *   status flags       filtered picked/liked/shown within one page.
 *   removed listings   re-applied a session suppression to each loaded page,
 *                      punching holes in a counted page.
 *
 * The state needed to tell page from universe already existed. Only the
 * pagination guard consulted it. These guards check that the consumers now do.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const SCOPE = read('public/crm/js/search/result-scope.js');
const DISPATCHER = read('public/crm/js/render/render-dispatcher.js');
const PAGINATION = read('public/crm/js/search/pagination.js');
const REPORTS = read('public/crm/js/output/reports.js');
const DEAD = read('public/crm/js/init/init-disable-dead-controls.js');
const INDEX = read('public/crm/index.html');
const BUILT = read('public/crm/index-built.html');

describe('the scope question has ONE owner', () => {
  it('the owner exists and is loaded before the consumers', () => {
    // Load order matters: search-engine, render-dispatcher, reports and
    // pagination all call it, and a helper defined after its callers is a
    // ReferenceError at click time rather than a test failure.
    const scopeIdx = INDEX.indexOf('js/search/result-scope.js');
    const engineIdx = INDEX.indexOf('js/search/search-engine.js');
    expect(scopeIdx).toBeGreaterThan(-1);
    expect(scopeIdx).toBeLessThan(engineIdx);
    for (const later of [
      'js/render/render-dispatcher.js',
      'js/output/reports.js',
      'js/search/pagination.js',
    ]) {
      expect(INDEX.indexOf(later)).toBeGreaterThan(scopeIdx);
    }
  });

  it('it decides scope the same way updateResultsCount already did', () => {
    // A second, subtly different rule for "is this authoritative" would let the
    // count and the consumers disagree about the same set.
    expect(SCOPE).toContain("resultProvenance === 'authoritative'");
    expect(SCOPE).toContain("typeof sc.value === 'number'");
  });

  it('it ships in the built bundle', () => {
    expect(BUILT).toContain('getResultScope');
  });
});

describe('selection survives pagination', () => {
  it('the page-scoped prune only runs when the rows ARE the universe', () => {
    // THE DATA-LOSS DEFECT. The prune itself is sound over a locally-held
    // catalogue and catastrophic over a page, so it is gated rather than
    // deleted.
    const init = DISPATCHER.slice(
      DISPATCHER.indexOf('function initializeSearchResults()'),
      DISPATCHER.indexOf('renderSearchResults();', DISPATCHER.indexOf('function initializeSearchResults()')),
    );
    expect(init).toContain('window.getResultScope()');
    expect(init).toContain('if (scope.isCompleteUniverse)');
    // The persist must sit INSIDE the guard — writing a page-pruned set to
    // localStorage is what made the loss permanent.
    const guardIdx = init.indexOf('if (scope.isCompleteUniverse)');
    expect(init.indexOf("localStorage.setItem('selectedListings'")).toBeGreaterThan(guardIdx);
  });

  it('the session removal suppression is gated the same way', () => {
    const init = DISPATCHER.slice(
      DISPATCHER.indexOf('function initializeSearchResults()'),
      DISPATCHER.indexOf('renderSearchResults();', DISPATCHER.indexOf('function initializeSearchResults()')),
    );
    expect(init).toContain('removed.length > 0 && scope.isCompleteUniverse');
  });
});

describe('sorting orders the search, not the screen', () => {
  it('a server-sortable column re-cuts the universe from page 1', () => {
    // A different ordering means a different page 1; staying on page 3 would
    // show rows 101-150 of a sequence the broker never saw the start of.
    expect(PAGINATION).toContain('SERVER_SORTABLE_COLUMNS');
    expect(PAGINATION).toContain('searchResultsState.sortKey = serverSort[nextOrder]');
    expect(PAGINATION).toContain('searchResultsState.currentPage = 1');
    expect(PAGINATION).toContain('window._requestResultPage(1)');
  });

  it('only columns with a CANONICAL server sort are offered', () => {
    // The contract defines six keys over three facts. Claiming any other column
    // sorts the whole universe would be inventing an ordering the provider
    // cannot apply.
    const map = PAGINATION.slice(
      PAGINATION.indexOf('var SERVER_SORTABLE_COLUMNS'),
      PAGINATION.indexOf('};', PAGINATION.indexOf('var SERVER_SORTABLE_COLUMNS')),
    );
    expect(map).toContain('price_asc');
    expect(map).toContain('price_desc');
    expect(map).toContain('listed_asc');
    expect(map).toContain('listed_desc');
    for (const notSortable of ['beds', 'baths', 'intSqft', 'address', 'neighborhood']) {
      expect(map).not.toContain(`${notSortable}:`);
    }
  });

  it('a column with no server sort REFUSES rather than sorting the page', () => {
    const fn = PAGINATION.slice(
      PAGINATION.indexOf('function toggleColumnSort(field)'),
      PAGINATION.indexOf('function toggleAveragesExpanded'),
    );
    expect(fn).toContain('if (!serverSort)');
    // And it must not move the header arrow, which would claim an ordering that
    // was never applied.
    const refusal = fn.slice(fn.indexOf('if (!serverSort)'), fn.indexOf('searchResultsState.sortField = field'));
    expect(refusal).toContain('return;');
    expect(refusal).not.toContain('sortOrder =');
  });
});

describe('figures state which population they describe', () => {
  it('page averages are labelled as page averages', () => {
    const fn = PAGINATION.slice(
      PAGINATION.indexOf('function updateAveragesRow()'),
      PAGINATION.indexOf('function openListingInNewTab'),
    );
    expect(fn).toContain('window.getResultScope()');
    expect(fn).toContain('page of');
    // The count beside them describes the SEARCH, so it uses the universe.
    expect(fn).toContain('scope.universeCount');
    // A lower bound may never be stated flatly.
    expect(fn).toContain("scope.isExact ? '' : '+'");
  });

  it('a report never calls one page "All Results"', () => {
    expect(REPORTS).toContain('reportAllLabel');
    expect(REPORTS).toContain("'Listings on this page'");
    expect(REPORTS).toContain('reportScopeNote');
    // The honest label is conditional on scope, not hard-coded either way.
    expect(REPORTS).toContain('reportScope.isCompleteUniverse');
  });
});

describe('local filtering does not silently resize a counted page', () => {
  const ENGINE = read('public/crm/js/search/search-engine.js');

  it('a gate removal on an authoritative page is reported as an INTEGRITY error', () => {
    // The server applies the same distribution gates before counting, so on a
    // paged result this filter should remove nothing. If it removes something,
    // server and client disagree — a defect to surface, not absorb. The rows
    // are still removed: a non-displayable listing must never reach a screen.
    expect(DISPATCHER).toContain('var _beforeGates = listings.length;');
    expect(DISPATCHER).toContain('searchResultsState.clientGateRemovals');
    expect(DISPATCHER).toContain('INTEGRITY:');
    // Reported only when the rows are a WINDOW; over a local catalogue the
    // filter is ordinary and an error would be noise.
    const block = DISPATCHER.slice(DISPATCHER.indexOf('var _gateRemovals'), DISPATCHER.indexOf('A FLAG FILTER'));
    expect(block).toContain('!_scope.isCompleteUniverse');
  });

  it('a page-local flag filter is recorded and stated beside the count', () => {
    // picked/liked/shown have no server counterpart, so on a paged result they
    // narrow only the loaded rows. Left unsaid, a handful of rows sit beneath
    // '3,674 Results' and read as though the search found that many picked.
    expect(DISPATCHER).toContain('searchResultsState.flagFilterIsPageLocal');
    expect(ENGINE).toContain('resultsScopeNote');
    expect(ENGINE).toContain('flagFilterIsPageLocal');
    expect(read('public/crm/html/search-form-and-results.html')).toContain('id="resultsScopeNote"');
  });

  it('the note clears itself when the filter is not page-local', () => {
    // A stale caveat is its own wrong answer.
    const noteBlock = ENGINE.slice(ENGINE.indexOf('var scopeNoteEl'), ENGINE.indexOf('var scopeNoteEl') + 900);
    expect(noteBlock).toContain("scopeNoteEl.textContent = ''");
  });
});

describe('the map states its coverage instead of implying completeness', () => {
  const MAP = read('public/crm/js/render/results-map.js');
  const FORM = read('public/crm/html/search-form-and-results.html');

  it('a listing it cannot place is COUNTED, not just skipped', () => {
    // Placement is still refused — inventing a position would be worse than
    // omitting the pin. What changes is that the omission is no longer silent.
    expect(MAP).toContain('_unplaceable++');
    expect(MAP).toContain('searchResultsState.mapUnplaceableCount');
  });

  it('the gap is stated ON THE MAP, not only in the console', () => {
    // The broker reading the map is the person who needs to know it is missing
    // pins; a console warning reaches the developer instead.
    expect(FORM).toContain('id="resultsMapCoverageNote"');
    expect(MAP).toContain("getElementById('resultsMapCoverageNote')");
    expect(MAP).toContain('could not be placed on the map');
  });

  it('the notice clears itself when every listing is placed', () => {
    const block = MAP.slice(MAP.indexOf('var _coverageEl'), MAP.indexOf('return { type:'));
    expect(block).toContain("_coverageEl.style.display = 'none'");
  });

  it('an APPROXIMATE pin is still labelled as approximate', () => {
    // The centroid fallback derives a position rather than inventing a precise
    // one, and must keep saying so — an approximate pin presented as exact is
    // the defect this guard exists to prevent regressing.
    expect(MAP).toContain('approx: approx');
    expect(MAP).toContain('Approximate location');
  });
});

describe('selection is durable by identity, across pages and actions', () => {
  const SEL = read('public/crm/js/listing/listing-selection.js');

  it('select-all UNIONS the page in rather than replacing the selection', () => {
    // It assigned `selectedListings = getFilteredListings().map(...)`, so
    // ticking the box on page 2 discarded every pick made on page 1.
    const fn = SEL.slice(SEL.indexOf('function toggleSelectAll()'), SEL.indexOf('function updateSelectionActionBar'));
    expect(fn).toContain('var pageIds =');
    expect(fn).toContain('merged.indexOf(id) === -1');
    expect(fn).not.toContain('selectedListings = getFilteredListings().map');
  });

  it('unticking removes only this page, never the whole selection', () => {
    // It assigned `= []`, clearing listings the broker had picked on pages they
    // were no longer looking at.
    const fn = SEL.slice(SEL.indexOf('function toggleSelectAll()'), SEL.indexOf('function updateSelectionActionBar'));
    expect(fn).toContain('pageIds.indexOf(id) === -1');
    expect(fn).not.toMatch(/selectedListings = \[\];/);
  });

  it('removeFromResults does not prune the selection to the visible page first', () => {
    // It filtered selectedListings down to ids on this page and assigned the
    // result back — losing off-page picks BEFORE the removal ran, and then
    // judging the "select at least one" guard by that truncated set.
    const fn = SEL.slice(SEL.indexOf('function removeFromResults()'), SEL.indexOf('CLIENT WORKFLOW FUNCTIONS'));
    expect(fn).toContain('var selected = (searchResultsState.selectedListings || []).slice();');
    const beforeGuard = fn.slice(0, fn.indexOf('if (selected.length === 0)'));
    expect(beforeGuard).not.toContain('currentIds.indexOf(id) !== -1');
  });

  it('a post-removal header never prints the page length as the result total', () => {
    const fn = SEL.slice(SEL.indexOf('function removeFromResults()'), SEL.indexOf('CLIENT WORKFLOW FUNCTIONS'));
    expect(fn).toContain('window.getResultScope');
    expect(fn).toContain('shown on this page');
  });
});

describe('output surfaces consume the snapshot without silently narrowing it', () => {
  /**
   * The whole compare function, anchored on DECLARATIONS.
   *
   * Fixed-width windows were used first and silently truncated the region
   * before the refusal branch, so a guard reported the refusal missing when it
   * was simply past the cut. A character count is a guess about code length.
   */
  const compareFn = () => {
    const start = PAGINATION.indexOf('async function addToCompareAndOpen');
    // Ends at the NEXT SECTION, not at the next `function ` token — the body
    // is full of inline callbacks (`forEach(function (id) {`), and matching
    // those cut the region off before the refusal branch.
    const end = PAGINATION.indexOf('function runCmaFromDetail');
    if (start < 0 || end <= start) throw new Error('anchor lost: addToCompareAndOpen');
    return PAGINATION.slice(start, end);
  };
  it('Compare RESOLVES a selected listing from the server rather than warning about it', () => {
    // Naming the omission beat dropping it silently, but it still handed the
    // broker a different comparison than the one they asked for: five selected,
    // three compared, with a toast. A warning does not un-change a decision set.
    //
    // Selection is durable by listing identity, so a row that is not on the
    // loaded page is fetched BY that identity — the broker does not reopen
    // pages to reconstitute a selection the system already holds.
    const fn = compareFn();
    expect(fn).toContain('MallanAPI.idx.search({');
    // THE IDENTITY DOMAIN IS THE POINT, not merely that a fetch happens.
    // The Search row id is a Cotality ListingKey; ListingId is a different
    // provider field with a non-overlapping value space. The first version
    // sent Search ids through `listingId`, which renders `ListingId eq ...`
    // and — probed live — returns count 0. Hydration never ran, and an
    // assertion on 'a search happens' passed anyway.
    expect(fn).toContain("listingKey: providerKeys.join(',')");
    expect(fn).not.toContain('listingId: unresolvedIds');
  });

  it('Compare does not send Mallan-local identifiers to the provider', () => {
    // An SL-/RL- listing has no provider key. Asking Cotality about it is
    // asking the wrong system; it stays unresolved and fails closed instead.
    const fn = compareFn();
    expect(fn).toContain('/^(SL-|RL-)/i');
    expect(fn).toContain('providerKeys');
  });

  it('Compare proves the returned rows are the ones it asked for', () => {
    // A non-empty response is not evidence that it answered THIS question.
    const fn = compareFn();
    expect(fn).toContain('not requested');
    expect(fn).toContain('requested[String(row.id)]');
  });

  it('Compare FAILS CLOSED when the full comparison cannot be constructed', () => {
    // No partial comparison opens by default. A smaller comparison is a
    // different answer, not a degraded version of the same one.
    const fn = compareFn();
    expect(fn).toContain('Cannot compare:');
    expect(fn).toContain('Nothing has been compared');
    // The refusal must return BEFORE the comparison renders.
    const refusalIdx = fn.indexOf('Cannot compare:');
    const guardIdx = fn.indexOf('if (compareListings.length < 2)');
    expect(refusalIdx).toBeLessThan(guardIdx);
  });

  it('a hydrated row joins the loaded catalogue so later views resolve it too', () => {
    // Otherwise the same listing would need re-fetching on every surface, and
    // could resolve differently in each.
    const fn = compareFn();
    expect(fn).toContain('listings.push(row)');
  });
  it('the toolbar re-sort asks the server and refuses unsupported fields', () => {
    // A second sort path exists beside toggleColumnSort. Both must agree, or
    // one control orders the universe and the other orders the screen.
    const TOOLBAR = read('public/crm/js/listing/toolbar-functions.js');
    expect(TOOLBAR).toContain('price_desc');
    expect(TOOLBAR).toContain('listed_desc');
    expect(TOOLBAR).toContain('if (!sortKey) return;');
    // And it must go through the ONE serializer, not hand-rebuild params.
    expect(TOOLBAR).toContain('window.buildIdxSearchParams(');
  });

  it('both sort paths offer the SAME fields — no control sorts more than the server can', () => {
    const TOOLBAR = read('public/crm/js/listing/toolbar-functions.js');
    const toolbarMap = TOOLBAR.slice(TOOLBAR.indexOf('var sortKeyMap'), TOOLBAR.indexOf('var sortKey ='));
    const columnMap = PAGINATION.slice(
      PAGINATION.indexOf('var SERVER_SORTABLE_COLUMNS'),
      PAGINATION.indexOf('};', PAGINATION.indexOf('var SERVER_SORTABLE_COLUMNS')),
    );
    for (const field of ['price', 'listedDate']) {
      expect(toolbarMap).toContain(field);
      expect(columnMap).toContain(field);
    }
  });
});

describe('a report that was never sent does not look sent', () => {
  it('the simulated outcome is not drawn as a success', () => {
    // Both outcomes drew the same green tick and green text, differing only by
    // the parenthetical '(simulated)'. A caveat inside a success state reads as
    // a footnote on a success: a broker seeing a green check and '3 listings
    // sent to Jane' has every reason to believe the client received it.
    const sendBlock = REPORTS.slice(
      REPORTS.indexOf('// A SIMULATED SEND IS NOT A SUCCESS'),
      REPORTS.indexOf('Configure real email delivery'),
    );
    expect(sendBlock.length).toBeGreaterThan(0);
    expect(sendBlock).toContain('NOT SENT');
    // The success tick must be conditional on a REAL send.
    expect(sendBlock).toContain('realSend');
    expect(sendBlock).toContain('Nothing was delivered');
  });

  it('the recipient is still named, so the broker knows who it would have reached', () => {
    // Truthfulness is not achieved by withholding useful detail.
    const sendBlock = REPORTS.slice(
      REPORTS.indexOf('// A SIMULATED SEND IS NOT A SUCCESS'),
      REPORTS.indexOf('Configure real email delivery'),
    );
    expect(sendBlock).toContain('would have gone to');
  });

  it('a real send still reads as delivered', () => {
    // Over-correcting into permanent doubt would be its own defect.
    const sendBlock = REPORTS.slice(
      REPORTS.indexOf('// A SIMULATED SEND IS NOT A SUCCESS'),
      REPORTS.indexOf('Configure real email delivery'),
    );
    expect(sendBlock).toContain('Email delivered!');
    expect(sendBlock).toContain('#059669');
  });
});

describe('a dead control is not left looking alive', () => {
  it('the unwired "Search in results" box is disabled', () => {
    expect(DEAD).toContain('#resultsSearchInput');
  });

  it('and it is still genuinely unwired — guard the guard', () => {
    // If someone implements it, this guard should fail so the disable is
    // removed with it rather than silently suppressing a working control.
    const handlers = [
      read('public/crm/js/search/search-engine.js'),
      read('public/crm/js/render/render-dispatcher.js'),
      read('public/crm/js/search/pagination.js'),
    ].join('\n');
    expect(handlers).not.toContain('resultsSearchInput');
  });
});
