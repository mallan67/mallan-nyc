// ═══════════════════════════════════════════════════════════════════════════════
// AGENT / OFFICE SEARCH PICKERS (CRM Search)
//
// Five separate filters over LIVE Cotality Property fields. The primary and co-list sides are never merged:
//   listAgent     Primary Listing Agent     ListAgentMlsId / ListAgentFullName
//   coListAgent   Co-Listing Agent          CoListAgent, CoListAgent2, CoListAgent3  (MlsId / FullName)
//   anyAgent      Agent Involved Anywhere   primary + every co-list slot; a convenience that replaces neither
//   listOffice    Primary Listing Office    ListOfficeMlsId / ListOfficeName
//   coListOffice  Co-Listing Office         CoListOffice, CoListOffice2  (MlsId / Name)
//
// Picking a person or office from the live Cotality directory (GET /api/crm/directory/members|offices, agent/broker auth)
// stores the MLS ID, which is exact. Typed text that is not picked is sent as a name match; that is lossy, because the same
// person's name is written differently across listings, so the list says so. Office names match every office whose name
// contains the text, which is how a firm with several office records is searched.
// All text is rendered with textContent; directory data is never interpreted as HTML.
// ═══════════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    var FIELDS = ['listAgent', 'coListAgent', 'anyAgent', 'listOffice', 'coListOffice'];
    var KIND = { listAgent: 'agent', coListAgent: 'agent', anyAgent: 'agent', listOffice: 'office', coListOffice: 'office' };
    var MAX_CHOSEN = 5;      // the server accepts at most five tokens per filter
    var MIN_TEXT = 2;
    var DEBOUNCE_MS = 250;
    var RESULT_LIMIT = 10;

    var pickers = {};

    function make(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function isId(text) { return /^\d{1,12}$/.test(text); }
    function cleanText(text) { return String(text || '').replace(/[,\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }

    function tokenOf(entry) { return entry.id != null && entry.id !== '' ? String(entry.id) : String(entry.text || ''); }

    function endpoint(field, text) {
        var kind = KIND[field];
        var params = [];
        if (isId(text)) params.push('mlsId=' + encodeURIComponent(text));
        else params.push('name=' + encodeURIComponent(text));
        params.push('includeInactive=1', 'limit=' + RESULT_LIMIT);
        return '/api/crm/directory/' + (kind === 'agent' ? 'members' : 'offices') + '?' + params.join('&');
    }

    function renderChips(picker) {
        var box = picker.chipsEl;
        while (box.firstChild) box.removeChild(box.firstChild);
        picker.chosen.forEach(function (entry, index) {
            var chip = make('span', 'inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-800 rounded px-2 py-0.5 text-xs mr-1 mb-1');
            chip.setAttribute('data-picker-chip', tokenOf(entry));
            chip.appendChild(make('span', '', entry.label || tokenOf(entry)));
            var remove = make('button', 'text-blue-500 hover:text-blue-800 leading-none', '×');
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Remove ' + (entry.label || tokenOf(entry)));
            remove.addEventListener('click', function () {
                picker.chosen.splice(index, 1);
                renderChips(picker);
                notifyChange(picker);
            });
            chip.appendChild(remove);
            box.appendChild(chip);
        });
    }

    function notifyChange(picker) {
        if (typeof global.updateFilterCount === 'function') global.updateFilterCount();
        try { picker.root.dispatchEvent(new CustomEvent('agent-office:change', { bubbles: true, detail: { field: picker.field } })); } catch (e) { /* old browsers */ }
    }

    function closeList(picker) {
        picker.results.classList.add('hidden');
        picker.input.setAttribute('aria-expanded', 'false');
        picker.active = -1;
        picker.options = [];
        while (picker.results.firstChild) picker.results.removeChild(picker.results.firstChild);
    }

    function choose(picker, entry) {
        var token = tokenOf(entry);
        if (!token) return;
        var exists = picker.chosen.some(function (c) { return tokenOf(c) === token; });
        if (!exists) {
            if (picker.chosen.length >= MAX_CHOSEN) {
                picker.hint.textContent = 'At most ' + MAX_CHOSEN + ' per filter.';
                return;
            }
            picker.chosen.push(entry);
            renderChips(picker);
        }
        picker.input.value = '';
        picker.hint.textContent = '';
        closeList(picker);
        notifyChange(picker);
    }

    function setActive(picker, index) {
        picker.active = index;
        picker.options.forEach(function (node, i) {
            var on = i === index;
            node.classList.toggle('bg-blue-50', on);
            node.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) picker.input.setAttribute('aria-activedescendant', node.id);
        });
    }

    function addOption(picker, entry, primary, secondary) {
        var node = make('div', 'px-2 py-1 cursor-pointer text-xs border-b border-gray-100 last:border-0 hover:bg-blue-50');
        node.id = 'aop-' + picker.field + '-' + picker.options.length;
        node.setAttribute('role', 'option');
        node.setAttribute('aria-selected', 'false');
        node.appendChild(make('div', 'font-medium text-gray-800', primary));
        if (secondary) node.appendChild(make('div', 'text-gray-500', secondary));
        // mousedown (not click) so the input does not blur and close the list first
        node.addEventListener('mousedown', function (event) { event.preventDefault(); choose(picker, entry); });
        picker.results.appendChild(node);
        picker.options.push(node);
    }

    function textOption(picker, text) {
        var kind = KIND[picker.field];
        if (isId(text)) {
            addOption(picker, { id: text, label: (kind === 'agent' ? 'Agent MLS ' : 'Office MLS ') + text }, 'Use MLS ID ' + text, 'Exact match');
        } else if (kind === 'office') {
            addOption(picker, { text: text, label: 'name contains “' + text + '”' }, 'All offices whose name contains “' + text + '”', 'Matches every office record of a firm');
        } else {
            addOption(picker, { text: text, label: 'name “' + text + '”' }, 'Match “' + text + '” as typed text', 'Less exact: names are written differently across listings. Pick a person below for an exact match.');
        }
    }

    function showResults(picker, text, rows, failed) {
        while (picker.results.firstChild) picker.results.removeChild(picker.results.firstChild);
        picker.options = [];
        textOption(picker, text);
        if (failed) {
            picker.results.appendChild(make('div', 'px-2 py-1 text-xs text-amber-700', 'Directory unavailable. The typed text above will still be searched.'));
        } else if (!rows.length) {
            picker.results.appendChild(make('div', 'px-2 py-1 text-xs text-gray-500', 'No match in the Cotality directory.'));
        }
        var kind = KIND[picker.field];
        rows.forEach(function (row) {
            if (kind === 'agent') {
                var where = row.officeName ? row.officeName : (row.officeMlsId ? 'Office ' + row.officeMlsId : '');
                var inactive = row.status && row.status !== 'Active' ? ' · ' + row.status : '';
                addOption(picker, { id: row.mlsId, label: row.fullName || ('Agent MLS ' + row.mlsId) }, row.fullName || ('Agent MLS ' + row.mlsId),
                    (where ? where + ' · ' : '') + 'MLS ' + row.mlsId + inactive);
            } else {
                var branch = row.mainOfficeMlsId && row.mainOfficeMlsId !== row.mlsId ? ' · branch of office ' + row.mainOfficeMlsId : '';
                var state = row.status && row.status !== 'Active' ? ' · ' + row.status : '';
                addOption(picker, { id: row.mlsId, label: row.name || ('Office MLS ' + row.mlsId) }, row.name || ('Office MLS ' + row.mlsId),
                    'Office MLS ' + row.mlsId + branch + state);
            }
        });
        picker.results.classList.remove('hidden');
        picker.input.setAttribute('aria-expanded', 'true');
        setActive(picker, 0);
    }

    function lookup(picker) {
        var text = cleanText(picker.input.value);
        if (!isId(text) && text.length < MIN_TEXT) { closeList(picker); return; }
        var mine = ++picker.seq;
        var api = global.MallanAPI;
        if (!api || typeof api._fetch !== 'function') { showResults(picker, text, [], true); return; }
        api._fetch(endpoint(picker.field, text)).then(function (body) {
            if (mine !== picker.seq) return; // a newer keystroke superseded this lookup
            var rows = KIND[picker.field] === 'agent' ? (body && body.members) : (body && body.offices);
            showResults(picker, text, Array.isArray(rows) ? rows : [], false);
        }).catch(function () {
            if (mine !== picker.seq) return;
            showResults(picker, text, [], true);
        });
    }

    function wire(root) {
        var field = root.getAttribute('data-agent-picker');
        if (FIELDS.indexOf(field) === -1 || root.getAttribute('data-picker-ready') === 'true') return;
        var input = root.querySelector('[data-picker-input]');
        var results = root.querySelector('[data-picker-results]');
        var chipsEl = root.querySelector('[data-picker-chosen]');
        var hint = root.querySelector('[data-picker-hint]');
        if (!input || !results || !chipsEl || !hint) return;
        var picker = { field: field, root: root, input: input, results: results, chipsEl: chipsEl, hint: hint, chosen: [], options: [], active: -1, seq: 0, timer: null };
        pickers[field] = picker;
        root.setAttribute('data-picker-ready', 'true');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        results.setAttribute('role', 'listbox');

        input.addEventListener('input', function () {
            picker.hint.textContent = '';
            clearTimeout(picker.timer);
            picker.timer = setTimeout(function () { lookup(picker); }, DEBOUNCE_MS);
        });
        input.addEventListener('keydown', function (event) {
            var open = !results.classList.contains('hidden') && picker.options.length > 0;
            if (event.key === 'ArrowDown' && open) { event.preventDefault(); setActive(picker, Math.min(picker.options.length - 1, picker.active + 1)); }
            else if (event.key === 'ArrowUp' && open) { event.preventDefault(); setActive(picker, Math.max(0, picker.active - 1)); }
            else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); closeList(picker); }
            else if (event.key === 'Enter' && open) {
                // Selecting an option must not also run the search (the page runs Search on Enter).
                event.preventDefault(); event.stopPropagation();
                picker.options[Math.max(0, picker.active)].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            } else if (event.key === 'Backspace' && !input.value && picker.chosen.length) {
                picker.chosen.pop(); renderChips(picker); notifyChange(picker);
            }
        });
        input.addEventListener('blur', function () { setTimeout(function () { closeList(picker); }, 120); });
    }

    function init() {
        FIELDS.forEach(function (field) {
            var root = document.querySelector('[data-agent-picker="' + field + '"]');
            if (root) wire(root);
        });
    }

    // The entries a filter will actually search: the chosen chips plus any typed text that was not picked.
    function entriesOf(picker) {
        var entries = picker.chosen.slice();
        var typed = cleanText(picker.input.value);
        if (typed && (isId(typed) || typed.length >= MIN_TEXT) && !entries.some(function (e) { return tokenOf(e) === typed; })) {
            entries.push(isId(typed)
                ? { id: typed, label: (KIND[picker.field] === 'agent' ? 'Agent MLS ' : 'Office MLS ') + typed }
                : { text: typed, label: 'name “' + typed + '”' });
        }
        return entries.slice(0, MAX_CHOSEN);
    }

    // collect(): { listAgent: '39361,Maya Allan', ... } for every filter that has something to search.
    function collect() {
        var out = {};
        FIELDS.forEach(function (field) {
            var picker = pickers[field];
            if (!picker) return;
            var tokens = entriesOf(picker).map(tokenOf).filter(Boolean);
            if (tokens.length) out[field] = tokens.join(',');
        });
        return out;
    }

    // getState()/setState(): the same entries ({id|text, label}) the search used; saved searches store and restore them with no
    // network call, so a reloaded search shows exactly what ran.
    function getState() {
        var out = {};
        FIELDS.forEach(function (field) {
            var picker = pickers[field];
            if (!picker) return;
            var entries = entriesOf(picker);
            if (entries.length) out[field] = entries.map(function (c) { return { id: c.id, text: c.text, label: c.label }; });
        });
        return out;
    }

    function setState(state) {
        clear();
        if (!state || typeof state !== 'object') return;
        FIELDS.forEach(function (field) {
            var picker = pickers[field];
            var list = state[field];
            if (!picker || !Array.isArray(list)) return;
            picker.chosen = list.filter(function (c) { return c && (c.id || c.text); }).slice(0, MAX_CHOSEN).map(function (c) {
                return { id: c.id != null ? String(c.id) : undefined, text: c.text != null ? String(c.text) : undefined, label: c.label ? String(c.label) : (c.id != null ? String(c.id) : String(c.text)) };
            });
            renderChips(picker);
        });
        if (typeof global.updateFilterCount === 'function') global.updateFilterCount();
    }

    function clear() {
        FIELDS.forEach(function (field) {
            var picker = pickers[field];
            if (!picker) return;
            clearTimeout(picker.timer);
            picker.seq++;
            picker.chosen = [];
            picker.input.value = '';
            picker.hint.textContent = '';
            renderChips(picker);
            closeList(picker);
        });
    }

    // Filters holding picked chips. Typed text is already counted by the form's own text-input count, so it is not counted twice.
    function chosenCount() {
        var count = 0;
        FIELDS.forEach(function (field) { if (pickers[field] && pickers[field].chosen.length) count++; });
        return count;
    }

    global.AgentOfficeSearch = { init: init, collect: collect, getState: getState, setState: setState, clear: clear, chosenCount: chosenCount, FIELDS: FIELDS.slice() };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    global.addEventListener('mallan:data:ready', init);
})(window);
