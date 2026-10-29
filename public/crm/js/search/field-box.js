// ═══════════════════════════════════════════════════════════════════════════════
// FIELD BOX — what you type, what you pick and what is suggested all sit in ONE box
//
// The neighborhood and address fields used to drop their suggestions and their chosen
// values under the input as separate floating panels: the chosen neighborhood or building
// landed outside the box and the suggestion panel covered the controls below it
// (acceptance walkthrough 2026-10-27: A1-ui, A5-ui, D1-ui). mountFieldBox() rebuilds such a
// field so that one bordered box holds the chips, the text input and, while typing, the
// suggestion list. The box grows in the page flow; nothing floats and nothing sits outside.
//
//   mountFieldBox(input, list, chips)
//     input  the text input
//     list   its suggestion element (#…Dropdown / #…AddrResults), shown/hidden by its owner
//     chips  the chip container (#…Tags), optional
//
//   mountFieldBoxes()        mounts every neighborhood and address field on the page
//   fieldBoxNote(input, t)   a muted note inside the box (the matched building), '' removes it
//
// Mounting is idempotent. The input, list and chip elements keep their ids, so the
// autocomplete code (neighborhood-autocomplete.js, search-engine.js) keeps working on them.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
    // Width, skin and type-size classes describe the box from now on; the input is borderless inside it
    var TO_BOX = /^(w-|flex-1$|flex-auto$|rounded|border|shadow|text-(xs|sm|base|lg)$)/;
    var OFF_INPUT = /^(pr-\d|pl-\d|w-|flex-1$|flex-auto$|rounded|border|shadow)/;
    var OFF_LIST = /^(absolute|z-|shadow|mt-|border|rounded|bg-white$|w-full$)/;
    var OFF_ICON = /^(absolute|right-|top-|-translate|translate)/;

    function classes(el) { return String(el.className || '').split(/\s+/).filter(Boolean); }

    function mountFieldBox(input, list, chips) {
        if (!input) return null;
        var existing = input.closest('.mfield');
        if (existing) return existing;

        var box = document.createElement('div');
        box.className = 'mfield';
        var row = document.createElement('div');
        row.className = 'mfield-row';

        var keep = [];
        classes(input).forEach(function (c) {
            if (TO_BOX.test(c)) box.classList.add(c);
            if (!OFF_INPUT.test(c) && !TO_BOX.test(c)) keep.push(c);
        });
        input.className = keep.concat('mfield-input').join(' ');
        input.setAttribute('data-placeholder', input.getAttribute('placeholder') || '');

        var wrapper = input.parentNode;
        wrapper.insertBefore(box, input);
        box.appendChild(row);
        if (chips) { chips.classList.add('mfield-chips'); row.appendChild(chips); }
        row.appendChild(input);

        // A search icon that was pinned to the input's right edge now rides at the end of the row
        Array.prototype.slice.call(wrapper.children).forEach(function (el) {
            if (el.tagName === 'I' && el.classList.contains('absolute')) {
                el.className = classes(el).filter(function (c) { return !OFF_ICON.test(c); }).concat('mfield-icon').join(' ');
                row.appendChild(el);
            }
        });

        if (list) {
            list.className = classes(list).filter(function (c) { return !OFF_LIST.test(c); }).concat('mfield-list').join(' ');
            box.appendChild(list);
        }

        // Clicking the box itself (not a chip or the list) edits the field
        box.addEventListener('mousedown', function (e) {
            if (e.target === box || e.target === row || e.target === chips) { e.preventDefault(); input.focus(); }
        });
        // Backspace on an empty input takes the last chip away, as in any tag field
        if (chips) {
            input.addEventListener('keydown', function (e) {
                if (e.key !== 'Backspace' || input.value) return;
                var last = chips.lastElementChild;
                var remove = last && last.querySelector('button');
                if (remove) { e.preventDefault(); remove.click(); }
            });
            // With chips in the box the long placeholder gives way to a short one
            var placeholders = function () {
                input.setAttribute('placeholder', chips.children.length ? 'Add another…' : input.getAttribute('data-placeholder') || '');
            };
            placeholders();
            if (typeof MutationObserver !== 'undefined') new MutationObserver(placeholders).observe(chips, { childList: true });
        }
        // The note describes the value that was picked; typing something else drops it
        input.addEventListener('input', function () { fieldBoxNote(input, ''); });
        return box;
    }

    function fieldBoxNote(input, text) {
        var row = input && input.parentNode && input.parentNode.classList && input.parentNode.classList.contains('mfield-row') ? input.parentNode : null;
        if (!row) return;
        var note = row.querySelector('.mfield-note');
        if (!text) { if (note) note.remove(); return; }
        if (!note) { note = document.createElement('span'); note.className = 'mfield-note'; row.appendChild(note); }
        note.textContent = text;
        note.title = text;
    }

    function mountFieldBoxes(root) {
        root = root || document;
        var mounted = 0;
        root.querySelectorAll('input[id$="NeighborhoodInput"]').forEach(function (input) {
            var base = input.id.replace(/Input$/, '');
            if (mountFieldBox(input, document.getElementById(base + 'Dropdown'), document.getElementById(base + 'Tags'))) mounted++;
        });
        root.querySelectorAll('[id$="AddrResults"]').forEach(function (list) {
            var input = document.getElementById(list.id.replace(/AddrResults$/, 'Address'));
            // A field that collects several buildings keeps them as chips in the box (#compBuildingList)
            var chips = input ? document.getElementById(input.id.replace(/Address$/, 'List')) : null;
            if (input && mountFieldBox(input, list, chips)) mounted++;
        });
        return mounted;
    }

    window.mountFieldBox = mountFieldBox;
    window.mountFieldBoxes = mountFieldBoxes;
    window.fieldBoxNote = fieldBoxNote;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mountFieldBoxes(); });
    else mountFieldBoxes();
})();
