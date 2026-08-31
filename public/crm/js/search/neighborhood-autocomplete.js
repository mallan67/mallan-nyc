// ═══════════════════════════════════════════════════════════════════════════════
// NEIGHBORHOOD AUTOCOMPLETE — multi-select search for basic search mode
// Provides type-ahead neighborhood search with tag-based multi-select.
// Uses the same neighborhood list as the Advanced Search tree + Map.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    // ── THE ONE NEIGHBOURHOOD VOCABULARY, LOADED NOT HARD-CODED ──────────────
    //
    // This carried its own array of ~130 names. It offered `Stuyvesant Town` and
    // `Union Square`, which the live Cotality feed does not carry, so the UI
    // invited a selection the server can only refuse — and it omitted live
    // neighbourhoods with real inventory, which no broker could then reach.
    //
    // Four lists existed for one concept: this one, the server contract, the
    // neighbourhood->borough table in search-engine.js, and the map polygon names.
    // Copying the 240 live names into this array would have made a fifth. It now
    // loads the SAME generated file the server vocabulary is generated from, so
    // neither can be edited independently.
    //
    // MAP POLYGON NAMES REMAIN A SEPARATE VOCABULARY answering a different
    // question (which shape to draw). The bridge lives in the map layer.
    //
    // Evidence: artifacts/section5-closure-probe + subdivision-borough-uniqueness,
    // 240 values read exhaustively, each proven unique to one borough.
    var NEIGHBORHOODS = {};

    // Built from the loaded vocabulary. Empty until the fetch resolves, which is
    // correct: an autocomplete that suggests nothing is visibly not ready, whereas
    // one suggesting a stale hard-coded list looks ready and is wrong.
    var _searchList = [];

    function buildSearchList() {
        _searchList = [];
        Object.keys(NEIGHBORHOODS).forEach(function(borough) {
            // The borough itself stays selectable — it is a separate criterion
            // (CityRegion), not a neighbourhood, and is marked as such.
            _searchList.push({ name: borough, borough: '', display: borough, isBoroughLevel: true });
            NEIGHBORHOODS[borough].forEach(function(n) {
                _searchList.push({ name: n, borough: borough, display: n + ', ' + borough, isBoroughLevel: false });
            });
        });
    }

    (function loadNeighborhoodVocabulary() {
        // The SAME absolute path every other CRM data loader uses — panels.js and
        // transit-search.js both fetch '/crm/data/...' unconditionally.
        //
        // My first version derived the path from window.location, copying the shape
        // of the retired alias loader. It had a branch that resolved to '/data/...'
        // when the page is served at '/crm' with no trailing slash, and a failed
        // fetch here is SILENT by design — the box simply suggests nothing — so a
        // broker would have found neighbourhoods unselectable with no error anywhere.
        fetch('/crm/data/neighborhood-vocabulary.generated.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.byBorough) return;
                // PROVIDER SPELLING IS PRESERVED EXACTLY. Cotality spells it
                // `StatenIsland`; the label shown to a broker is cosmetic and must
                // never be sent as the value, which is the borough trap geography.ts
                // documents.
                NEIGHBORHOODS = data.byBorough;
                buildSearchList();
            })
            .catch(function () { /* non-fatal: the box simply suggests nothing */ });
    })();

    // Track selected neighborhoods per input (keyed by tagsContainerId)
    var _selected = {};

    // Clear all neighborhood selections and tags (called by clearSearchForm)
    window.clearAllNeighborhoods = function() {
        for (var key in _selected) { delete _selected[key]; }
        ['saleNeighborhoodTags', 'rentalNeighborhoodTags', 'buildingNeighborhoodTags', 'advancedNeighborhoodTags'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
    };

    function getSelected(tagsId) {
        if (!_selected[tagsId]) _selected[tagsId] = [];
        return _selected[tagsId];
    }

    // Main autocomplete function — called from oninput
    window.neighborhoodAutocomplete = function(query, dropdownId, tagsId) {
        var dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;

        var q = query.trim().toLowerCase();
        if (q.length < 1) {
            dropdown.classList.add('hidden');
            return;
        }

        var selected = getSelected(tagsId);
        var selectedNames = selected.map(function(s) { return s.name; });

        // Filter matches
        var matches = _searchList.filter(function(item) {
            if (selectedNames.indexOf(item.name) !== -1) return false;
            return item.name.toLowerCase().indexOf(q) !== -1 ||
                   item.borough.toLowerCase().indexOf(q) !== -1 ||
                   item.display.toLowerCase().indexOf(q) !== -1;
        }).slice(0, 12);

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400">No neighborhoods found</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        dropdown.innerHTML = matches.map(function(item) {
            var boroughBadge = item.isBoroughLevel
                ? '<span class="ml-auto text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-semibold">Borough</span>'
                : '<span class="ml-auto text-xs text-gray-600 font-medium">' + escapeHtml(item.borough) + '</span>';
            return '<div class="px-3 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center gap-2" ' +
                   'onclick="selectNeighborhood(\'' + item.name.replace(/'/g, "\\'") + '\',\'' + item.borough + '\',' + item.isBoroughLevel + ',\'' + dropdownId + '\',\'' + tagsId + '\')">' +
                   '<i class="fas fa-map-pin text-blue-500 text-xs"></i>' +
                   '<span class="text-sm font-medium text-gray-900">' + escapeHtml(item.name) + '</span>' +
                   boroughBadge + '</div>';
        }).join('');

        dropdown.classList.remove('hidden');
    };

    // Select a neighborhood — add tag, clear input
    window.selectNeighborhood = function(name, borough, isBoroughLevel, dropdownId, tagsId) {
        var selected = getSelected(tagsId);
        if (selected.some(function(s) { return s.name === name; })) return;

        selected.push({ name: name, borough: borough, isBoroughLevel: isBoroughLevel });
        renderTags(tagsId);

        // Clear input + hide dropdown
        var dropdown = document.getElementById(dropdownId);
        if (dropdown) dropdown.classList.add('hidden');

        // Find the input — it's the sibling before the dropdown
        var input = dropdown ? dropdown.previousElementSibling : null;
        if (input && input.tagName !== 'INPUT') input = dropdown.parentElement.querySelector('input[type="text"]');
        if (input) { input.value = ''; input.focus(); }
    };

    /**
     * SET the whole selection for one tag container.
     *
     * Added 2026-08-30 so canonical Search state can RENDER geography back into
     * whichever view the agent opens. `selectNeighborhood` adds one entry and
     * `removeNeighborhoodTag` removes one; neither expresses "the selection is
     * now exactly this", which is what rendering a canonical value requires.
     *
     * The setter lives HERE, with the widget that owns `_selected`, rather than
     * the caller reaching into that state. It also resolves each name back to its
     * borough and borough-level flag from this module's own list, so the caller
     * only carries names — the canonical shape — and this module stays the single
     * authority on what a neighbourhood entry is.
     */
    window.setNeighborhoodSelection = function(tagsId, neighborhoodNames, boroughNames) {
        var id = tagsId || 'saleNeighborhoodTags';
        var next = [];
        (boroughNames || []).forEach(function(name) {
            next.push({ name: name, borough: '', isBoroughLevel: true });
        });
        (neighborhoodNames || []).forEach(function(name) {
            var known = _searchList.filter(function(entry) {
                return !entry.isBoroughLevel && entry.name === name;
            })[0];
            next.push({ name: name, borough: known ? known.borough : '', isBoroughLevel: false });
        });
        _selected[id] = next;
        renderTags(id);
    };

    // Remove a neighborhood tag
    window.removeNeighborhoodTag = function(name, tagsId) {
        var selected = getSelected(tagsId);
        _selected[tagsId] = selected.filter(function(s) { return s.name !== name; });
        renderTags(tagsId);
    };

    // Render selected tags
    function renderTags(tagsId) {
        var container = document.getElementById(tagsId);
        if (!container) return;
        var selected = getSelected(tagsId);

        if (selected.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = selected.map(function(item) {
            var label = item.isBoroughLevel ? item.name : item.name;
            var boroughHint = item.borough ? ' <span class="text-[11px] text-gray-500 font-normal">(' + escapeHtml(item.borough) + ')</span>' : '';
            return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">' +
                   '<i class="fas fa-map-pin text-blue-500 text-[10px]"></i>' +
                   label + boroughHint +
                   '<button type="button" onclick="removeNeighborhoodTag(\'' + item.name.replace(/'/g, "\\'") + '\',\'' + tagsId + '\')" class="ml-0.5 text-blue-400 hover:text-blue-700">&times;</button>' +
                   '</span>';
        }).join('');
    }

    // Get selected neighborhoods (for search engine integration).
    // Filters out borough-level entries (Manhattan, Brooklyn, Queens, Bronx,
    // Staten Island) so they do not get serialized as `neighborhood=...` to
    // the backend — those entries belong on `criteria.borough`. See
    // getSelectedBoroughs below.
    window.getSelectedNeighborhoods = function(tagsId) {
        return getSelected(tagsId || 'saleNeighborhoodTags')
            .filter(function(s) { return !s.isBoroughLevel; })
            .map(function(s) { return s.name; });
    };

    // Get selected borough-level entries. Borough chips appear in the same
    // autocomplete list (with a "Borough" badge), but route to a different
    // backend OData field — `CityRegion` instead of `SubdivisionName`.
    // collectSearchCriteria() in search-engine.js calls this to populate
    // criteria.borough.
    window.getSelectedBoroughs = function(tagsId) {
        return getSelected(tagsId || 'saleNeighborhoodTags')
            .filter(function(s) { return s.isBoroughLevel; })
            .map(function(s) { return s.name; });
    };

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('[id$="NeighborhoodDropdown"]') && !e.target.closest('[id$="NeighborhoodInput"]')) {
            document.querySelectorAll('[id$="NeighborhoodDropdown"]').forEach(function(d) {
                d.classList.add('hidden');
            });
        }
    });
})();
