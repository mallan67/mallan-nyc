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
    var _identities = [];
    var _boroughLabels = {};

    /** Same fold as the server contract: case, space and punctuation insensitive. */
    function _fold(v) { return String(v).toLowerCase().replace(/[^a-z]/g, ''); }

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

    // ── LOADING, FAILED AND READY ARE THREE STATES ───────────────────────────
    //
    // They were one. The list was empty while loading AND after a failed fetch,
    // and both rendered 'No neighborhoods found' — an affirmative answer that is
    // definitely wrong in both cases. A broker could not tell 'not ready yet'
    // from 'that place does not exist', and the catch was empty so nothing was
    // reported anywhere.
    var _vocabState = 'loading';   // 'loading' | 'ready' | 'failed'

    function neighborhoodVocabStatus() { return _vocabState; }

    (function loadNeighborhoodVocabulary() {
        // The SAME absolute path every other CRM data loader uses — panels.js and
        // transit-search.js both fetch '/crm/data/...' unconditionally.
        fetch('/crm/data/neighborhood-vocabulary.generated.json')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (!data || !Array.isArray(data.identities) || data.identities.length === 0) {
                    throw new Error('empty vocabulary');
                }
                _identities = data.identities;
                _boroughLabels = data.boroughLabels || {};
                // ACCEPT AND OFFER ARE DIFFERENT SETS, AND THE BROWSER NEEDS BOTH.
                //
                // `_identities` holds every identity the provider carries, because
                // resolve() must recognise a SAVED search containing a valid name the
                // dropdown does not offer. Shipping only the offered subset is what
                // made Saved Search restore tell the broker that `Union Square` "is no
                // longer available to search" and silently drop it — a valid,
                // searchable, historically real neighbourhood.
                //
                // The dropdown itself shows only `offered`.
                //
                // ONE ENTRY PER IDENTITY, not one per provider spelling: SoHo, Soho and
                // SOHO are one neighbourhood and appear once, while the union of
                // spellings executes server-side so capitalisation loses nothing.
                NEIGHBORHOODS = {};
                _identities.forEach(function (i) {
                    if (!i.offered) return;
                    // The BROKER LABEL for the borough. The provider value is
                    // StatenIsland; nobody should ever read that in a dropdown.
                    //
                    // Every identity now HAS a borough — identity is (borough x name)
                    // — so nothing is dropped here. The previous version skipped any
                    // identity whose borough was null, which silently removed
                    // Downtown Brooklyn and Midwood from the autocomplete entirely.
                    var label = i.boroughLabel || _boroughLabels[i.borough] || i.borough;
                    if (!label) return;
                    if (!NEIGHBORHOODS[label]) NEIGHBORHOODS[label] = [];
                    NEIGHBORHOODS[label].push(i.label);
                });
                buildSearchList();
                _vocabState = 'ready';
                document.dispatchEvent(new CustomEvent('mallan:neighborhoods-ready'));
            })
            .catch(function (err) {
                // NOT SILENT. A failed load must never look like a real answer.
                _vocabState = 'failed';
                if (window.console && console.warn) {
                    console.warn('[neighborhoods] vocabulary failed to load:', err && err.message);
                }
                document.dispatchEvent(new CustomEvent('mallan:neighborhoods-failed'));
            });
    })();

    // ── THE ONE BROWSER GEOGRAPHY AUTHORITY ──────────────────────────────────
    //
    // search-engine.js carried a hard-coded neighbourhood->borough table and
    // saved-searches.js called into it, so the claim that four vocabularies had
    // become one was false. That table also placed MOTT HAVEN IN MANHATTAN; the
    // live feed puts it in the Bronx on 574 of 575 rows.
    window.MallanNeighborhoods = {
        state: neighborhoodVocabStatus,
        identities: function () { return _identities.slice(); },
        /** Provider CityRegion value for a neighbourhood, or '' when unknown/split. */
        boroughFor: function (name) {
            var i = this.resolve(name);
            return (i && i.borough) || '';
        },
        /** Broker label for a provider borough value. StatenIsland -> Staten Island. */
        boroughLabel: function (providerValue) {
            return _boroughLabels[providerValue] || providerValue || '';
        },
        /** The identity a typed/stored/polygon name means, or null if not live. */
        resolve: function (name) {
            if (typeof name !== 'string') return null;
            var key = _fold(name);
            if (!key) return null;
            for (var n = 0; n < _identities.length; n++) {
                var idn = _identities[n];
                if (_fold(idn.label) === key) return idn;
                for (var k = 0; k < idn.spellings.length; k++) {
                    if (_fold(idn.spellings[k]) === key) return idn;
                }
            }
            return null;
        }
    };

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
            // THREE STATES, THREE MESSAGES. This said "No neighborhoods found"
            // whatever the reason, so a vocabulary that had not loaded yet — or had
            // failed to load entirely, silently, with an empty catch — gave the
            // broker a confident answer about NYC geography. "That place does not
            // exist" and "I have not loaded the list" are different facts.
            var msg;
            if (_vocabState === 'loading') {
                msg = '<i class="fas fa-circle-notch fa-spin mr-2"></i>Loading neighborhoods…';
            } else if (_vocabState === 'failed') {
                msg = '<i class="fas fa-triangle-exclamation mr-2"></i>' +
                      'Neighborhood list unavailable — reload the page to try again.';
            } else {
                msg = 'No neighborhoods found';
            }
            dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400">' + msg + '</div>';
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
