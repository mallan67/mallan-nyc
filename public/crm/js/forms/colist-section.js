// ═══════════════════════════════════════════════════════════════════════════════
// CO-LISTING AGENTS (Add/Edit forms): Cotality Property CoListAgent{,2,3}* and CoListOffice{,2}*
//
// Live Cotality (verified 2026-10-06) keeps up to THREE co-listing agents (CoListAgent, CoListAgent2, CoListAgent3) and up to TWO co-listing
// offices (CoListOffice, CoListOffice2; there is no third office). CoListAgentKey / -MlsId / -FullName equal the Member's MemberKey / MemberMlsId /
// MemberFullName, and CoListOfficeKey / -MlsId / -Name equal the Office's OfficeKey / OfficeMlsId / OfficeName. A co-listing agent exists
// independently of the listing agreement (210,150 live listings carry one; only 10,037 are CoExclusiveAgency), and the co-list side is stored
// separately from the primary ListAgent* / ListOffice* fields: it is never merged into them.
//
// Each agent is picked from the live Cotality Member directory (MallanDirectory), so the form records exactly what Cotality returns. The offices are
// the picked agents' own offices (deduplicated, at most two); they are never typed in and never inferred from the listing agreement.
//
//   var section = MallanCoList.mount({ container, emptyText, onChange })
//   section.add()                 add an empty agent block (at most three)
//   section.collect(data)         write every CoList* key into the payload (empty string for unused slots, so a removed agent is cleared on save)
//   section.hydrate(raw, typed)   rebuild the blocks from a stored listing (typed = the row's co_list_* columns); resolves once offices are looked up
//   section.getAgents()           the picked members, in order
//   section.clear()
//
// All directory text is rendered with textContent.
// ═══════════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    var MAX_AGENTS = 3;
    var MAX_OFFICES = 2;
    var AGENT_SUFFIX = ['', '2', '3'];
    var OFFICE_SUFFIX = ['', '2'];

    function clean(v) { return v == null ? '' : String(v).trim(); }
    function make(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function officeKeyOf(member) { return clean(member.officeMlsId) || clean(member.officeKey) || clean(member.officeName); }

    // The offices of the picked agents, in order of first appearance, one entry per distinct office.
    function officesOf(members) {
        var seen = {};
        var out = [];
        members.forEach(function (m) {
            var k = officeKeyOf(m);
            if (!k || seen[k]) return;
            seen[k] = true;
            out.push({ key: clean(m.officeKey), mlsId: clean(m.officeMlsId), name: clean(m.officeName) });
        });
        return out;
    }

    function mount(opts) {
        var container = opts.container;
        var emptyText = opts.emptyText || 'No co-listing agents added.';
        var rows = [];
        var stored = { offices: [] };

        function changed() {
            renderEmpty();
            renumber();
            if (opts.onChange) opts.onChange(getAgents());
        }

        function renderEmpty() {
            var note = container.querySelector('[data-colist-empty]');
            if (rows.length === 0) {
                if (!note) {
                    note = make('p', 'text-sm text-gray-500 italic', emptyText);
                    note.setAttribute('data-colist-empty', 'true');
                    container.appendChild(note);
                }
            } else if (note) {
                note.parentNode.removeChild(note);
            }
        }

        function renumber() {
            rows.forEach(function (row, i) { row.title.textContent = 'Co-List Agent #' + (i + 1); });
        }

        function getAgents() {
            return rows.map(function (r) { return r.member; }).filter(Boolean);
        }

        function wouldExceedOffices(candidateRow, member) {
            var members = rows.map(function (r) { return r === candidateRow ? member : r.member; }).filter(Boolean);
            return officesOf(members).length > MAX_OFFICES;
        }

        function addRow(prefill) {
            if (rows.length >= MAX_AGENTS) return null;
            var el = make('div', 'border border-gray-200 rounded-lg p-4 mb-3 bg-gray-50');
            el.setAttribute('data-colist-row', 'true');
            var header = make('div', 'flex items-center justify-between mb-2');
            var title = make('h5', 'text-sm font-medium text-gray-700', 'Co-List Agent');
            var remove = make('button', 'text-red-600 hover:text-red-700 text-xs', 'Remove');
            remove.type = 'button';
            remove.setAttribute('data-colist-remove', 'true');
            header.appendChild(title);
            header.appendChild(remove);
            var firmLabel = make('label', 'field-label', 'Firm or office (optional)');
            var firm = make('input', 'field-input mb-2');
            firm.type = 'text';
            firm.autocomplete = 'off';
            firm.placeholder = 'Narrow the search to a firm or office name';
            firm.setAttribute('data-colist-firm', 'true');
            var agentLabel = make('label', 'field-label', 'Agent (Cotality Member)');
            var pickerRoot = make('div', '');
            pickerRoot.setAttribute('data-colist-picker', 'true');
            var error = make('p', 'text-xs text-red-600 mt-1', '');
            error.setAttribute('data-colist-error', 'true');
            [header, firmLabel, firm, agentLabel, pickerRoot, error].forEach(function (n) { el.appendChild(n); });

            var row = { el: el, title: title, member: null, picker: null, error: error };
            row.picker = global.MallanDirectory.attach(pickerRoot, {
                placeholder: 'Search agent name or MLS ID',
                getFirm: function () { return firm.value; },
                onPick: function (member) {
                    if (getAgents().some(function (m) { return m.mlsId && m.mlsId === member.mlsId; })) {
                        row.picker.clear();
                        error.textContent = 'This agent is already listed as a co-listing agent.';
                        return;
                    }
                    if (wouldExceedOffices(row, member)) {
                        row.picker.clear();
                        error.textContent = 'Cotality records at most two co-listing offices, so this agent’s office cannot be added.';
                        return;
                    }
                    error.textContent = '';
                    row.member = member;
                    changed();
                },
                onClear: function () { row.member = null; },
            });
            remove.addEventListener('click', function () {
                rows.splice(rows.indexOf(row), 1);
                if (el.parentNode) el.parentNode.removeChild(el);
                changed();
            });
            rows.push(row);
            container.appendChild(el);
            if (prefill) { row.member = prefill; row.picker.setValue(prefill); }
            changed();
            return row;
        }

        function clear() {
            rows.slice().forEach(function (r) { if (r.el.parentNode) r.el.parentNode.removeChild(r.el); });
            rows = [];
            stored = { offices: [] };
            changed();
        }

        // Write every co-list provider key. Unused slots are written as '' so an agent removed in the form is cleared on save.
        function collect(data) {
            var agents = getAgents();
            AGENT_SUFFIX.forEach(function (suffix, i) {
                var a = agents[i];
                data['CoListAgent' + suffix + 'MlsId'] = a ? clean(a.mlsId) : '';
                data['CoListAgent' + suffix + 'FullName'] = a ? clean(a.fullName) : '';
                data['CoListAgent' + suffix + 'Key'] = a ? clean(a.key) : '';
            });
            var offices = officesOf(agents);
            // If the agents' offices could not be resolved (directory unavailable on load), keep the stored offices instead of erasing them.
            if (!offices.length && agents.length && stored.offices.length) offices = stored.offices;
            OFFICE_SUFFIX.forEach(function (suffix, i) {
                var o = offices[i];
                data['CoListOffice' + suffix + 'MlsId'] = o ? clean(o.mlsId) : '';
                data['CoListOffice' + suffix + 'Name'] = o ? clean(o.name) : '';
                data['CoListOffice' + suffix + 'Key'] = o ? clean(o.key) : '';
            });
            return data;
        }

        // Rebuild from a stored listing. The names come straight from the stored keys; each agent's office is then resolved from the live
        // directory by MLS ID so the cards show it and a re-save writes the same offices back.
        function hydrate(raw, typed) {
            raw = raw || {};
            typed = typed || {};
            clear();
            var members = [];
            AGENT_SUFFIX.forEach(function (suffix, i) {
                var mlsId = clean(raw['CoListAgent' + suffix + 'MlsId']) || (i === 0 ? clean(typed.co_list_agent_mls_id) : '');
                var fullName = clean(raw['CoListAgent' + suffix + 'FullName']);
                if (!mlsId && !fullName) return;
                members.push({ key: clean(raw['CoListAgent' + suffix + 'Key']), mlsId: mlsId, fullName: fullName, status: '', officeKey: '', officeMlsId: '', officeName: '' });
            });
            stored.offices = OFFICE_SUFFIX.map(function (suffix, i) {
                var mlsId = clean(raw['CoListOffice' + suffix + 'MlsId']) || (i === 0 ? clean(typed.co_list_office_mls_id) : '');
                var name = clean(raw['CoListOffice' + suffix + 'Name']);
                var key = clean(raw['CoListOffice' + suffix + 'Key']);
                return mlsId || name || key ? { key: key, mlsId: mlsId, name: name } : null;
            }).filter(Boolean);
            var built = members.map(function (m) { return { member: m, row: addRow(m) }; });
            var lookups = built.map(function (b) {
                if (!b.member.mlsId || !global.MallanDirectory) return Promise.resolve();
                return global.MallanDirectory.lookupMember(b.member.mlsId).then(function (live) {
                    if (!live) return;
                    b.row.member = live;
                    b.row.picker.setValue(live);
                }).catch(function () { /* directory unavailable: the stored names stay and the stored offices are preserved on save */ });
            });
            return Promise.all(lookups).then(function () { changed(); });
        }

        // The page ships a static "no co-listing agents" note inside the container; the section owns the container from here on.
        while (container.firstChild) container.removeChild(container.firstChild);
        renderEmpty();
        return { add: function () { return addRow(null); }, clear: clear, collect: collect, hydrate: hydrate, getAgents: getAgents, officesOf: function () { return officesOf(getAgents()); } };
    }

    global.MallanCoList = { mount: mount, MAX_AGENTS: MAX_AGENTS, MAX_OFFICES: MAX_OFFICES };
})(window);
