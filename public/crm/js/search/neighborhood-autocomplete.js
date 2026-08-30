// ═══════════════════════════════════════════════════════════════════════════════
// NEIGHBORHOOD AUTOCOMPLETE — multi-select search for basic search mode
// Provides type-ahead neighborhood search with tag-based multi-select.
// Uses the same neighborhood list as the Advanced Search tree + Map.
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    // All NYC neighborhoods organized by borough (matches Advanced Search tree)
    var NEIGHBORHOODS = {
        'Bronx': [
            'Allerton','Baychester','Bedford Park','Belmont','City Island','Co-op City',
            'Fordham','Kingsbridge','Morris Park','Pelham Bay','Central Riverdale',
            'Fieldston','North Riverdale','Spuyten Duyvil','Throgs Neck','Woodlawn'
        ],
        'Brooklyn': [
            'Bath Beach','Bay Ridge','Fort Hamilton','Bedford - Stuyvesant','Ocean Hill',
            'Stuyvesant Heights','Bensonhurst','Boerum Hill','Borough Park','Brighton Beach',
            'Brooklyn Heights','Bushwick','Carroll Gardens','Cobble Hill','Coney Island',
            'Crown Heights','Ditmas Park','Downtown Brooklyn','Dumbo','Dyker Heights',
            'Flatbush','Fort Greene','Gowanus','Greenpoint','Park Slope','Prospect Heights',
            'Red Hook','Sheepshead Bay','Sunset Park','Williamsburg','Windsor Terrace'
        ],
        'Manhattan': [
            'Battery Park City','Carnegie Hill','Central Harlem','Chelsea','Chinatown',
            'Civic Center','East Harlem','East Village','Financial District','Flatiron',
            'Gramercy Park','Greenwich Village','Hamilton Heights','Hell\'s Kitchen',
            'Hudson Square','Hudson Yards','Inwood','Kips Bay','Lenox Hill','Lincoln Square',
            'Little Italy','Lower East Side','Manhattan Valley','Manhattanville','Marble Hill',
            'Meatpacking District','Midtown','Midtown East','Midtown West','Morningside Heights',
            'Murray Hill','NoHo','NoMad','Nolita','Peter Cooper Village','Roosevelt Island',
            'SoHo','Stuyvesant Town','Sugar Hill','Sutton Place','Times Square','Tribeca',
            'Tudor City','Turtle Bay','Two Bridges','Union Square','Upper East Side',
            'Upper West Side','Washington Heights','West Harlem','West Village','Yorkville'
        ],
        'Queens': [
            'Astoria','Bayside','Corona','Elmhurst','Flushing','Forest Hills',
            'Hunters Point','Jackson Heights','Jamaica','Kew Gardens',
            'Long Island City (LIC)','Rego Park','Ridgewood','Sunnyside','Whitestone','Woodside'
        ],
        'Staten Island': [
            'Annadale','Arden Heights','Dongan Hills','Great Kills','New Dorp',
            'St. George','Stapleton','Todt Hill'
        ]
    };

    // Build flat search list with borough labels
    var _searchList = [];
    Object.keys(NEIGHBORHOODS).forEach(function(borough) {
        // Add borough itself as selectable
        _searchList.push({ name: borough, borough: '', display: borough, isBoroughLevel: true });
        NEIGHBORHOODS[borough].forEach(function(n) {
            _searchList.push({ name: n, borough: borough, display: n + ', ' + borough, isBoroughLevel: false });
        });
    });

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
