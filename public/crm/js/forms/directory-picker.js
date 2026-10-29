// ═══════════════════════════════════════════════════════════════════════════════
// LIVE COTALITY DIRECTORY PICKER (Add/Edit forms)
//
// A single-select type-ahead over the live Cotality Member and Office directory (GET /api/crm/directory/members|offices, agent/broker auth).
// Used by the listing forms to record a co-listing agent from a real Member record: the form stores MemberKey, MemberMlsId, MemberFullName and
// the member's own OfficeKey / OfficeMlsId / OfficeName exactly as Cotality delivers them; nothing is typed in by hand or guessed.
//
//   MallanDirectory.lookupMember(mlsId)      -> Promise<member | null>      exact MLS ID lookup (inactive members included)
//   MallanDirectory.attach(root, cfg)        -> controller { setValue(member), getValue(), clear() }
//     cfg.placeholder   input placeholder
//     cfg.getFirm()     optional: text that narrows the search to members whose office name contains it
//     cfg.onPick(m)     called with the picked member
//     cfg.onClear()     called when the selection is cleared
//
// A member is { key, mlsId, fullName, status, officeKey, officeMlsId, officeName }. All directory text is rendered with textContent.
// ═══════════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    var DEBOUNCE_MS = 250;
    var MIN_TEXT = 2;

    function api() { return global.MallanAPI; }

    function get(path) {
        var a = api();
        if (!a || typeof a._fetch !== 'function') return Promise.reject(new Error('MallanAPI unavailable'));
        return a._fetch(path);
    }

    function cleanText(text) { return String(text || '').replace(/[,\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function isId(text) { return /^\d{1,12}$/.test(text); }

    function searchMembers(text, firm) {
        var params = [];
        if (isId(text)) params.push('mlsId=' + encodeURIComponent(text));
        else params.push('name=' + encodeURIComponent(text));
        var f = cleanText(firm);
        if (f.length >= MIN_TEXT) params.push('firm=' + encodeURIComponent(f));
        params.push('limit=10');
        return get('/api/crm/directory/members?' + params.join('&')).then(function (body) { return (body && body.members) || []; });
    }

    function lookupMember(mlsId) {
        var id = cleanText(mlsId);
        if (!isId(id)) return Promise.resolve(null);
        return get('/api/crm/directory/members?mlsId=' + encodeURIComponent(id) + '&includeInactive=1&limit=1')
            .then(function (body) { var rows = (body && body.members) || []; return rows[0] || null; });
    }

    function make(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function attach(root, cfg) {
        cfg = cfg || {};
        var input = make('input', 'field-input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = cfg.placeholder || 'Search agent name or MLS ID';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        var list = make('div', 'hidden bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto');
        list.setAttribute('role', 'listbox');
        list.style.position = 'absolute';
        list.style.zIndex = '30';
        list.style.minWidth = '16rem';
        var card = make('div', 'mt-2 bg-white rounded-lg p-2 border text-xs hidden');
        var wrap = make('div', 'relative');
        wrap.appendChild(input);
        wrap.appendChild(list);
        root.appendChild(wrap);
        root.appendChild(card);

        var state = { value: null, seq: 0, timer: null, active: -1, options: [] };

        function close() {
            list.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            state.options = [];
            state.active = -1;
            while (list.firstChild) list.removeChild(list.firstChild);
        }

        function showCard() {
            while (card.firstChild) card.removeChild(card.firstChild);
            var m = state.value;
            if (!m) { card.classList.add('hidden'); return; }
            var line1 = make('div', 'font-medium text-gray-800', m.fullName || ('Agent MLS ' + m.mlsId));
            var line2 = make('div', 'text-gray-500', 'MLS ' + m.mlsId + (m.status && m.status !== 'Active' ? ' · ' + m.status : ''));
            var line3 = make('div', 'text-gray-500', m.officeName ? m.officeName + (m.officeMlsId ? ' · Office MLS ' + m.officeMlsId : '') : 'Office not recorded by Cotality');
            card.appendChild(line1); card.appendChild(line2); card.appendChild(line3);
            card.classList.remove('hidden');
        }

        function pick(member) {
            state.value = member;
            input.value = '';
            close();
            showCard();
            if (cfg.onPick) cfg.onPick(member);
        }

        function clear() {
            state.value = null;
            input.value = '';
            close();
            showCard();
            if (cfg.onClear) cfg.onClear();
        }

        function setActive(index) {
            state.active = index;
            state.options.forEach(function (node, i) {
                node.classList.toggle('bg-blue-50', i === index);
                node.setAttribute('aria-selected', i === index ? 'true' : 'false');
            });
        }

        function render(rows, failed) {
            while (list.firstChild) list.removeChild(list.firstChild);
            state.options = [];
            if (failed) {
                list.appendChild(make('div', 'px-2 py-1 text-xs text-amber-700', 'Directory unavailable. Try again, or enter the agent’s MLS ID.'));
            } else if (!rows.length) {
                list.appendChild(make('div', 'px-2 py-1 text-xs text-gray-500', 'No match in the Cotality directory.'));
            }
            rows.forEach(function (row) {
                var node = make('div', 'px-2 py-1 cursor-pointer text-xs border-b border-gray-100 hover:bg-blue-50');
                node.setAttribute('role', 'option');
                node.setAttribute('aria-selected', 'false');
                node.appendChild(make('div', 'font-medium text-gray-800', row.fullName || ('Agent MLS ' + row.mlsId)));
                node.appendChild(make('div', 'text-gray-500', (row.officeName ? row.officeName + ' · ' : '') + 'MLS ' + row.mlsId + (row.status && row.status !== 'Active' ? ' · ' + row.status : '')));
                // mousedown (not click) so the input does not blur and close the list first
                node.addEventListener('mousedown', function (event) { event.preventDefault(); pick(row); });
                list.appendChild(node);
                state.options.push(node);
            });
            list.classList.remove('hidden');
            input.setAttribute('aria-expanded', 'true');
            if (state.options.length) setActive(0);
        }

        function lookup() {
            var text = cleanText(input.value);
            if (!isId(text) && text.length < MIN_TEXT) { close(); return; }
            var mine = ++state.seq;
            var firm = cfg.getFirm ? cfg.getFirm() : '';
            searchMembers(text, firm).then(function (rows) {
                if (mine !== state.seq) return; // a newer keystroke superseded this lookup
                render(rows, false);
            }).catch(function () {
                if (mine !== state.seq) return;
                render([], true);
            });
        }

        input.addEventListener('input', function () {
            clearTimeout(state.timer);
            state.timer = setTimeout(lookup, DEBOUNCE_MS);
        });
        input.addEventListener('keydown', function (event) {
            var open = !list.classList.contains('hidden') && state.options.length > 0;
            if (event.key === 'ArrowDown' && open) { event.preventDefault(); setActive(Math.min(state.options.length - 1, state.active + 1)); }
            else if (event.key === 'ArrowUp' && open) { event.preventDefault(); setActive(Math.max(0, state.active - 1)); }
            else if (event.key === 'Escape' && open) { event.preventDefault(); close(); }
            else if (event.key === 'Enter' && open) {
                event.preventDefault();
                state.options[Math.max(0, state.active)].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            }
        });
        input.addEventListener('blur', function () { setTimeout(close, 120); });

        return {
            getValue: function () { return state.value; },
            setValue: function (member) { state.value = member || null; input.value = ''; close(); showCard(); },
            clear: clear,
            refresh: lookup,
        };
    }

    global.MallanDirectory = { attach: attach, lookupMember: lookupMember, searchMembers: searchMembers };
})(window);
