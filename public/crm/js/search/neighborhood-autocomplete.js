// ═══════════════════════════════════════════════════════════════════════════════
// NEIGHBORHOOD AUTOCOMPLETE + TREES — live Cotality geography
//
// Boroughs (CityRegion) and neighborhoods (SubdivisionName) are free-text fields in
// Cotality with no picklist. The only valid list is what Cotality returns right now, read
// through /api/crm/neighborhoods/cotality (lib/idx/geography.ts) when the page loads.
// Nothing is typed into this file.
//
// Typing is forgiving (case and punctuation ignored, shorthand such as UES / LIC / FiDi /
// Bed-Stuy accepted); what is sent to the server is the live name, and the server's resolver
// expands it to every exact spelling Cotality carries before the OData request is built.
// Borough chips send the exact live CityRegion value ("StatenIsland"), shown as "Staten Island".
// ═══════════════════════════════════════════════════════════════════════════════

(function() {
    var GEO_PATH = '/api/crm/neighborhoods/cotality';
    var _inventory = null;   // the live inventory as served
    var _searchList = [];    // flat pick list: boroughs then neighborhoods
    var _loading = null;

    function geoKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

    function buildSearchList(inv) {
        _searchList = [];
        (inv.liveBoroughs || []).forEach(function(b) {
            // Typing shorthand (bk, qns, si, bx …) matches the borough exactly
            var keys = [geoKey(b.value), geoKey(b.display)];
            Object.keys(inv.boroughAliases || {}).forEach(function(a) { if (inv.boroughAliases[a] === geoKey(b.value)) keys.push(a); });
            _searchList.push({ name: b.display, value: b.value, borough: '', display: b.display, isBoroughLevel: true, keys: keys, count: 0 });
        });
        (inv.catalog || []).forEach(function(c) {
            _searchList.push({ name: c.name, value: c.name, borough: c.boroughDisplay, boroughValue: c.borough,
                display: c.name + ', ' + c.boroughDisplay, isBoroughLevel: false, keys: [c.key],
                count: (c.onMarketSale || 0) + (c.onMarketRental || 0), sale: c.onMarketSale || 0, rental: c.onMarketRental || 0,
                spellings: c.spellings || [c.name] });
        });
    }

    // Load (once) the live inventory. Resolves to the inventory or null when Cotality is unavailable.
    window.loadLiveGeography = function(force) {
        if (_inventory && !force) return Promise.resolve(_inventory);
        if (_loading) return _loading;
        if (typeof MallanAPI === 'undefined' || !MallanAPI._fetch) return Promise.resolve(null);
        _loading = MallanAPI._fetch(GEO_PATH + (force ? '?refresh=1' : '')).then(function(inv) {
            if (!inv || !inv.catalog) throw new Error('empty geography');
            _inventory = inv;
            window.MALLAN_GEO = inv;
            buildSearchList(inv);
            renderNeighborhoodTrees();
            try { window.dispatchEvent(new CustomEvent('mallan:geo:ready', { detail: inv })); } catch (e) {}
            console.log('[CRM Search] live Cotality geography: ' + inv.catalog.length + ' neighborhoods, ' + (inv.liveBoroughs || []).length +
                ' boroughs, pulled ' + inv.pulledAt + (inv.countsComplete ? '' : ' (counts incomplete)'));
            return inv;
        }).catch(function(err) {
            console.error('[CRM Search] live Cotality geography unavailable:', err && err.message);
            if (typeof showToast === 'function') showToast('Neighborhood list could not be read from Cotality. Type an exact neighborhood name, or try again.', 'warning');
            return null;
        }).finally(function() { _loading = null; });
        return _loading;
    };

    window.liveGeography = function() { return _inventory; };

    // Borough (display) a live neighborhood name is filed under, from the inventory.
    window.geoBoroughOf = function(name) {
        var k = geoKey(name);
        for (var i = 0; i < _searchList.length; i++) {
            var it = _searchList[i];
            if (!it.isBoroughLevel && it.keys[0] === k) return it.borough;
        }
        return '';
    };

    // Match typed input against the live list: exact key or alias first, then prefix, then contains.
    function matchItems(query, excludeNames) {
        var q = geoKey(query);
        if (!q) return [];
        var alias = _inventory && _inventory.aliases ? _inventory.aliases[q] : null;
        var scored = [];
        _searchList.forEach(function(item) {
            if (excludeNames.indexOf(item.name) !== -1) return;
            var score = -1;
            for (var i = 0; i < item.keys.length; i++) {
                var k = item.keys[i];
                if (k === q || (alias && k === alias)) { score = 3; break; }
                if (k.indexOf(q) === 0) score = Math.max(score, 2);
                else if (k.indexOf(q) !== -1) score = Math.max(score, 1);
            }
            if (score < 0 && !item.isBoroughLevel && geoKey(item.borough).indexOf(q) === 0) score = 0;
            if (score >= 0) scored.push({ item: item, score: score });
        });
        // Exact matches first; among equals a borough outranks a neighborhood, then the busier place
        scored.sort(function(a, b) { return (b.score - a.score) || (Number(b.item.isBoroughLevel) - Number(a.item.isBoroughLevel)) || (b.item.count - a.item.count) || a.item.name.localeCompare(b.item.name); });
        return scored.map(function(s) { return s.item; });
    }

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

        var q = query.trim();
        if (q.length < 1) {
            dropdown.classList.add('hidden');
            return;
        }
        if (!_inventory) {
            dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400">Loading neighborhoods from Cotality…</div>';
            dropdown.classList.remove('hidden');
            window.loadLiveGeography().then(function(inv) { if (inv) window.neighborhoodAutocomplete(query, dropdownId, tagsId); });
            return;
        }

        var selectedNames = getSelected(tagsId).map(function(s) { return s.name; });
        var matches = matchItems(q, selectedNames).slice(0, 12);

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="px-3 py-2 text-gray-400">No Cotality neighborhood matches "' + escapeHtml(q) + '"</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        dropdown.innerHTML = matches.map(function(item) {
            var right = item.isBoroughLevel
                ? '<span class="ml-auto text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-semibold">Borough</span>'
                : '<span class="ml-auto text-xs text-gray-600 font-medium">' + escapeHtml(item.borough) +
                  (item.count ? ' <span class="text-gray-400">· ' + item.count.toLocaleString() + ' on market</span>' : '') + '</span>';
            var spellingsNote = (!item.isBoroughLevel && item.spellings.length > 1) ? ' title="Cotality spellings: ' + escapeHtml(item.spellings.join(', ')) + '"' : '';
            return '<div class="px-3 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center gap-2" data-pick="1"' + spellingsNote +
                   ' onclick="selectNeighborhood(\'' + item.name.replace(/'/g, "\\'") + '\',\'' + escapeHtml(item.borough) + '\',' + item.isBoroughLevel + ',\'' + dropdownId + '\',\'' + tagsId + '\')">' +
                   '<i class="fas fa-map-pin text-blue-500 text-xs"></i>' +
                   '<span class="text-sm font-medium text-gray-900">' + escapeHtml(item.name) + '</span>' +
                   right + '</div>';
        }).join('');

        dropdown.classList.remove('hidden');
    };

    // Select a neighborhood or borough — add tag, clear input. `name` is the live display name.
    window.selectNeighborhood = function(name, borough, isBoroughLevel, dropdownId, tagsId) {
        var selected = getSelected(tagsId);
        if (selected.some(function(s) { return s.name === name; })) return;

        var entry = { name: name, borough: borough || '', isBoroughLevel: !!isBoroughLevel, value: name };
        if (isBoroughLevel && _inventory) {
            // Exact live CityRegion value behind the display name
            (_inventory.liveBoroughs || []).forEach(function(b) { if (b.display === name || b.value === name) entry.value = b.value; });
        } else if (!borough && typeof window.geoBoroughOf === 'function') {
            entry.borough = window.geoBoroughOf(name);
        }
        selected.push(entry);
        renderTags(tagsId);

        // Clear input + hide dropdown
        var dropdown = document.getElementById(dropdownId);
        if (dropdown) dropdown.classList.add('hidden');

        // The input shares the dropdown's id stem (…Input / …Dropdown); the chip now sits in the same box
        var input = dropdownId ? document.getElementById(dropdownId.replace(/Dropdown$/, 'Input')) : null;
        if (!input && dropdown) input = dropdown.closest('.mfield, .relative') ? dropdown.closest('.mfield, .relative').querySelector('input[type="text"]') : null;
        if (input) { input.value = ''; input.focus(); }
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
            var boroughHint = item.borough ? ' <span class="text-[11px] text-gray-500 font-normal">(' + escapeHtml(item.borough) + ')</span>' : '';
            return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">' +
                   '<i class="fas fa-map-pin text-blue-500 text-[10px]"></i>' +
                   escapeHtml(item.name) + boroughHint +
                   '<button type="button" onclick="removeNeighborhoodTag(\'' + item.name.replace(/'/g, "\\'") + '\',\'' + tagsId + '\')" class="ml-0.5 text-blue-400 hover:text-blue-700">&times;</button>' +
                   '</span>';
        }).join('');
    }

    // Selected neighborhoods (live display names; the server expands each to every live spelling).
    // Borough chips are excluded here — they are CityRegion criteria (getSelectedBoroughs).
    window.getSelectedNeighborhoods = function(tagsId) {
        return getSelected(tagsId || 'saleNeighborhoodTags')
            .filter(function(s) { return !s.isBoroughLevel; })
            .map(function(s) { return s.name; });
    };

    // Selected boroughs as the exact live CityRegion values ("StatenIsland").
    window.getSelectedBoroughs = function(tagsId) {
        return getSelected(tagsId || 'saleNeighborhoodTags')
            .filter(function(s) { return s.isBoroughLevel; })
            .map(function(s) { return s.value || s.name; });
    };

    // ── Neighborhood trees (advanced search, Comparable Reports): generated from the live inventory ──
    // Each neighborhood box carries data-neighborhood (live name); each borough summary box carries
    // data-borough (live CityRegion value). Counts sit outside the <label> so label text stays the name.
    function renderNeighborhoodTrees() {
        if (!_inventory) return;
        var byBorough = {};
        (_inventory.liveBoroughs || []).forEach(function(b) { byBorough[b.value] = { display: b.display, items: [] }; });
        (_inventory.catalog || []).forEach(function(c) {
            if (!byBorough[c.borough]) byBorough[c.borough] = { display: c.boroughDisplay, items: [] };
            byBorough[c.borough].items.push(c);
        });
        var html = '<details open><summary class="font-semibold cursor-pointer hover:bg-gray-50 p-1"><input type="checkbox" class="w-3 h-3 mr-1" onclick="event.stopPropagation()"> NYC ' +
            '<span class="text-[10px] font-normal text-gray-400">live Cotality · ' + (_inventory.catalog || []).length + ' neighborhoods</span></summary>';
        Object.keys(byBorough).sort(function(a, b) { return byBorough[a].display.localeCompare(byBorough[b].display); }).forEach(function(value) {
            var group = byBorough[value];
            var onMarket = group.items.reduce(function(a, c) { return a + (c.onMarketSale || 0) + (c.onMarketRental || 0); }, 0);
            html += '<details class="ml-3"><summary class="font-bold cursor-pointer hover:bg-gray-50 p-1"><input type="checkbox" class="w-3 h-3 mr-1" data-borough="' + escapeHtml(value) + '" onclick="event.stopPropagation()"> ' +
                escapeHtml(group.display) + ' <span class="text-[10px] font-normal text-gray-400">' + group.items.length + (onMarket ? ' · ' + onMarket.toLocaleString() + ' on market' : '') + '</span></summary>' +
                '<div class="ml-3 text-xs">';
            group.items.sort(function(a, b) { return a.name.localeCompare(b.name); }).forEach(function(c) {
                var count = (c.onMarketSale || 0) + (c.onMarketRental || 0);
                html += '<div class="p-1 hover:bg-blue-50 flex items-center"><label class="cursor-pointer"><input type="checkbox" class="w-3 h-3 mr-1" data-neighborhood="' + escapeHtml(c.name) + '"> ' + escapeHtml(c.name) + '</label>' +
                    (count ? '<span class="ml-auto text-[10px] text-gray-400">' + count.toLocaleString() + '</span>' : '') + '</div>';
            });
            html += '</div></details>';
        });
        html += '</details>';
        document.querySelectorAll('.neighborhood-tree').forEach(function(tree) { tree.innerHTML = html; });
    }
    window.renderNeighborhoodTrees = renderNeighborhoodTrees;

    // Enter in a neighborhood box picks the top match
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' || !e.target.id || !/NeighborhoodInput$/.test(e.target.id)) return;
        var dropdown = document.getElementById(e.target.id.replace('Input', 'Dropdown'));
        var first = dropdown && !dropdown.classList.contains('hidden') ? dropdown.querySelector('[data-pick]') : null;
        if (first) { e.preventDefault(); e.stopPropagation(); first.click(); }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('[id$="NeighborhoodDropdown"]') && !e.target.closest('[id$="NeighborhoodInput"]')) {
            document.querySelectorAll('[id$="NeighborhoodDropdown"]').forEach(function(d) {
                d.classList.add('hidden');
            });
        }
    });

    // Load the live inventory as soon as the API is ready
    if (typeof MallanAPI !== 'undefined' && MallanAPI.onReady) MallanAPI.onReady(function() { window.loadLiveGeography(); });
    else document.addEventListener('DOMContentLoaded', function() { window.loadLiveGeography(); });
})();
