/**
 * ONE ANSWER TO: "IS THIS THE RESULT SET, OR ONE PAGE OF IT?"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * `searchResultsState.filteredListings` holds ONE SERVER PAGE whenever the
 * search ran authoritatively. Six independent consumers read it as though it
 * were the whole result set, and each one got the scope wrong on its own:
 *
 *   selection cleanup   pruned selectedListings to the ids on THIS page and
 *                       persisted the result, so paging from 1 to 2 deleted
 *                       every listing the broker had picked — while the server
 *                       response promises `selectionsAreDurableBy: ListingKey`.
 *   column sort         sorted the fifty rows on screen while the pager read
 *                       "Page 3 of 93", presenting a page-local order as a
 *                       global one. It fails invisibly: every page looks
 *                       correctly ordered.
 *   reports             rendered a radio labelled "All Results (N)" where N was
 *                       the current page length, and built CSV/print/email
 *                       bodies from it — brokerage output, sent to clients.
 *   averages row        computed price and PPSF over one page and presented
 *                       them as the market statistics for the search.
 *   status flags        filtered picked/liked/shown within one page.
 *   removed listings    re-applied a session suppression to each page load.
 *
 * The information needed to tell page from universe already existed —
 * `resultProvenance`, `serverCount`, `serverTotalPages` — and only the
 * pagination guard consulted it. The problem was never missing data; it was
 * that every consumer had to remember to ask, and none of them did.
 *
 * So the question gets ONE owner. A consumer that needs to know now asks, and a
 * consumer that never asks is visibly making a claim it has not checked.
 *
 * Loaded before search-engine.js so every later script can call it.
 */
(function () {
    'use strict';

    /**
     * The scope of what is currently in `filteredListings`.
     *
     * `isCompleteUniverse` false means these rows are a WINDOW. Anything that
     * counts, sorts, averages, reports on, or prunes against them is describing
     * the window, not the search, and must either say so or ask the server.
     */
    window.getResultScope = function getResultScope() {
        var st = (typeof searchResultsState !== 'undefined' && searchResultsState)
            ? searchResultsState
            : {};
        var rows = st.filteredListings || [];
        var sc = st.serverCount;

        // The SAME test updateResultsCount uses. A provisional preview is a
        // local re-filter of whatever catalogue happens to be loaded, so pairing
        // it with a server total would describe two different sets at once.
        var authoritative = st.resultProvenance === 'authoritative';
        var haveServerCount = !!(sc && typeof sc.value === 'number');
        var isOnePage = authoritative && haveServerCount;

        return {
            rows: rows,
            /** Rows actually in memory right now. */
            loadedCount: rows.length,
            /** True when `rows` IS the search result, not a window onto it. */
            isCompleteUniverse: !isOnePage,
            /** Size of the search result. Equals loadedCount only when complete. */
            universeCount: isOnePage ? sc.value : rows.length,
            /** 'exact' | 'lower_bound' | null from the server; 'local' when not paged. */
            countMeaning: isOnePage ? (sc.meaning || null) : 'local',
            /** Whether universeCount is exact. A lower bound may never be stated flatly. */
            isExact: isOnePage ? !!sc.isExact : true
        };
    };

    /**
     * A human-readable qualifier for any figure derived from `rows`.
     *
     * Returns '' when the rows ARE the universe, so a complete answer is stated
     * plainly and only a partial one carries a caveat. Printing "of 50 loaded"
     * when 50 is the whole search would be its own kind of wrong.
     */
    window.describeResultScope = function describeResultScope() {
        var s = window.getResultScope();
        if (s.isCompleteUniverse) return '';
        return 'of ' + s.loadedCount + ' loaded' +
            (s.isExact ? ' (' + s.universeCount + ' total)' : ' (' + s.universeCount + '+ total)');
    };
}());
