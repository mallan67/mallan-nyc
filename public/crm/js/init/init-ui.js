        // ═══════════════════════════════════════════════════════════════════════════════
        // SOFT PLACEHOLDER TEXT FOR ALL SELECTS
        // ═══════════════════════════════════════════════════════════════════════════════
        // Applies gray-400 color to selects showing their default empty-value option.
        // When a real value is chosen the text turns dark; resetting turns it gray again.
        (function initSelectPlaceholders() {
            document.querySelectorAll('select').forEach(function (sel) {
                function update() {
                    sel.classList.toggle('placeholder-active', !sel.value || sel.value === '');
                }
                update(); // initial state
                sel.addEventListener('change', update);
            });
        })();

        // === Closing Costs Calculator (informational estimate — not legal/tax advice) ===
        function calculateClosingCosts() {
            var price = parseFloat(document.querySelector('#closingCostCalc input[type="text"]')?.value?.replace(/[^0-9.]/g, '')) || 0;
            var taxRate = 0.01; // ~1% NYC transfer tax
            var attorneyFee = 3500;
            var titleInsurance = price * 0.005;
            var mansion = price > 1000000 ? price * 0.01 : 0;
            var total = (price * taxRate) + attorneyFee + titleInsurance + mansion;
            showToast('Estimated Closing Costs for $' + price.toLocaleString() + ': $' + Math.round(total).toLocaleString() + ' (Transfer Tax + Title Insurance + Attorney + ' + (mansion > 0 ? 'Mansion Tax' : 'No Mansion Tax') + ')', 'info');
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CUSTOM SELECT DROPDOWNS — Always Open Downward (SEARCH SECTIONS)
        // ═══════════════════════════════════════════════════════════════════════════════
        // Replaces native <select> elements with custom dropdowns that use position:fixed
        // to escape overflow:hidden containers and always render below the trigger.

        (function initCustomSelectDropdowns() {
            var searchContainerIds = [
                'searchBasicMode',
                'searchBasicModeRental',
                'searchBasicModeBuilding',
                'searchAdvancedMode'
            ];

            function convertSelect(sel) {
                // Skip if already converted or if inside date-range-picker footer
                if (sel.hasAttribute('data-csd')) return;
                if (sel.closest('.drp-footer')) return;
                sel.setAttribute('data-csd', '1');

                // Determine font-size class from original select
                var fontSize = '12px';
                if (sel.classList.contains('text-sm')) fontSize = '14px';
                if (sel.classList.contains('text-xs')) fontSize = '12px';

                // Create wrapper — inherits sizing/flex from original select
                var wrap = document.createElement('div');
                wrap.className = 'csd-wrap';
                // Transfer inline style (flex, min-width, max-width, etc.)
                if (sel.style.cssText) {
                    wrap.style.cssText = sel.style.cssText;
                }
                // Transfer layout classes (w-*, flex-*, min-w-*, max-w-*, mt-*, etc.)
                sel.className.split(/\s+/).forEach(function(c) {
                    if (/^(w-|flex|min-w|max-w|mt-|mb-|ml-|mr-|self-|shrink|grow)/.test(c)) wrap.classList.add(c);
                });

                sel.parentNode.insertBefore(wrap, sel);
                // Hide original select but keep it in DOM for ID/value access
                sel.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;overflow:hidden;';
                wrap.appendChild(sel);

                // Create visible trigger button
                var btn = document.createElement('div');
                btn.className = 'csd-btn';
                btn.style.fontSize = fontSize;

                var label = document.createElement('span');
                label.className = 'csd-label';
                var arrow = document.createElement('span');
                arrow.className = 'csd-arrow';
                arrow.innerHTML = '&#9662;';

                // "Custom" option — the box itself takes the typed amount (Maya 2026-10-27: "custom when you
                // select it should allow to write the price inside the box … in all boxes with custom").
                // The typed amount becomes the select's own value through a hidden typed option, so every
                // reader of sel.value (criteria collector, saved searches, calculators) sees the number;
                // the value stays 'custom' only while nothing has been typed yet.
                var customIdx = -1;
                for (var ci = 0; ci < sel.options.length; ci++) if (sel.options[ci].value === 'custom') customIdx = ci;
                var isMoney = customIdx >= 0 && Array.prototype.some.call(sel.options, function (o) { return o.text.indexOf('$') !== -1; });
                var allowDecimal = customIdx >= 0 && Array.prototype.some.call(sel.options, function (o) { return /^\d+\.\d/.test(o.value); });
                var backIdx = 0; // "Back to the list" returns to the default option (calculators default to a preset)
                for (var bi = 0; bi < sel.options.length; bi++) if (sel.options[bi].defaultSelected && sel.options[bi].value !== 'custom') backIdx = bi;
                var custom = null; // { prefix, input, clear } while the box is in typing mode
                function typedOption() { return sel.querySelector('option[data-typed]'); }
                function sanitize(raw) {
                    var s = String(raw == null ? '' : raw).replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
                    if (allowDecimal) { var parts = s.split('.'); s = parts.shift() + (parts.length ? '.' + parts.join('') : ''); }
                    return s;
                }
                function formatTyped(v) {
                    if (!v || !isMoney) return v;
                    var n = Number(v);
                    return isNaN(n) ? v : n.toLocaleString('en-US');
                }
                function setTyped(digits) {
                    var opt = typedOption();
                    if (!digits) { if (opt) opt.remove(); sel.selectedIndex = customIdx; return; }
                    if (!opt) { opt = document.createElement('option'); opt.setAttribute('data-typed', '1'); opt.hidden = true; sel.appendChild(opt); }
                    opt.value = digits;
                    opt.text = (isMoney ? '$' : '') + formatTyped(digits);
                    opt.selected = true;
                }
                function inCustomMode() {
                    var o = sel.options[sel.selectedIndex];
                    return customIdx >= 0 && !!o && (o.value === 'custom' || o.hasAttribute('data-typed'));
                }
                function leaveToList() {
                    sel.selectedIndex = backIdx;
                    syncLabel();
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                }
                function enterCustom() {
                    if (custom) return;
                    var first = sel.options[0] ? sel.options[0].text : '';
                    custom = {};
                    if (isMoney) {
                        custom.prefix = document.createElement('span');
                        custom.prefix.className = 'csd-prefix';
                        custom.prefix.textContent = '$';
                        btn.insertBefore(custom.prefix, arrow);
                    }
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'csd-input';
                    input.setAttribute('inputmode', allowDecimal ? 'decimal' : 'numeric');
                    input.setAttribute('autocomplete', 'off');
                    input.placeholder = /^(min|max)\b/i.test(first) ? 'Type ' + first.toLowerCase() : 'Type value';
                    input.setAttribute('aria-label', (first || 'Custom') + ' — type a value');
                    input.addEventListener('click', function (e) { e.stopPropagation(); }); // typing never opens the list
                    input.addEventListener('input', function () {
                        var digits = sanitize(input.value);
                        if (input.value !== digits) input.value = digits;
                        setTyped(digits);
                    });
                    input.addEventListener('blur', function () {
                        input.value = formatTyped(sanitize(input.value));
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                    input.addEventListener('keydown', function (e) {
                        if (e.key === 'Escape') { e.stopPropagation(); leaveToList(); }
                    });
                    custom.input = input;
                    custom.clear = document.createElement('span');
                    custom.clear.className = 'csd-clear';
                    custom.clear.innerHTML = '&times;';
                    custom.clear.title = 'Back to the list';
                    custom.clear.setAttribute('role', 'button');
                    custom.clear.addEventListener('click', function (e) { e.stopPropagation(); leaveToList(); });
                    btn.insertBefore(input, arrow);
                    btn.insertBefore(custom.clear, arrow);
                    btn.classList.add('csd-custom');
                    label.style.display = 'none';
                }
                function exitCustom() {
                    if (!custom) return;
                    [custom.prefix, custom.input, custom.clear].forEach(function (n) { if (n) n.remove(); });
                    custom = null;
                    label.style.display = '';
                    btn.classList.remove('csd-custom');
                    var opt = typedOption();
                    if (opt) opt.remove();
                }
                // The visible box always mirrors the select's current option. Clear, Last Search and a
                // saved search set the select without a click in the panel; the box kept reading "$1M"
                // after the select was back on "Min Price" (acceptance walkthrough 2026-10-27, A7-clear).
                function syncLabel() {
                    var selOpt = sel.options[sel.selectedIndex];
                    if (inCustomMode()) {
                        enterCustom();
                        if (document.activeElement !== custom.input) {
                            custom.input.value = formatTyped(selOpt.hasAttribute('data-typed') ? selOpt.value : '');
                        }
                        return;
                    }
                    exitCustom();
                    label.textContent = selOpt ? selOpt.text : '';
                    // If first option has empty value, treat as placeholder
                    label.classList.toggle('placeholder', !sel.value || sel.value === '');
                }
                btn.appendChild(label);
                btn.appendChild(arrow);
                syncLabel(); // after label and arrow are in the box: a select that starts on "Custom" inserts before the arrow
                sel._csdSync = syncLabel;
                // Restore a saved / last search whose amount is not a preset: the box shows it as typed.
                sel._csdSetCustom = function (value) {
                    var digits = sanitize(value);
                    if (customIdx < 0 || !digits) return false;
                    setTyped(digits);
                    syncLabel();
                    return true;
                };
                sel._csdFocusCustom = function () { if (custom) custom.input.focus(); };
                sel.addEventListener('change', syncLabel);

                wrap.insertBefore(btn, sel);

                // Create dropdown panel — appended to body so it escapes all overflow
                var panel = document.createElement('div');
                panel.className = 'csd-panel';
                panel.style.fontSize = fontSize;
                panel.setAttribute('data-csd-panel', '1');
                document.body.appendChild(panel);

                // Build option items
                function buildItems() {
                    panel.innerHTML = '';
                    for (var i = 0; i < sel.options.length; i++) {
                        if (sel.options[i].hasAttribute('data-typed')) continue; // the typed amount is not a list entry
                        var item = document.createElement('div');
                        item.className = 'csd-item';
                        if (i === sel.selectedIndex || (i === customIdx && inCustomMode())) item.classList.add('active');
                        item.textContent = sel.options[i].text;
                        item.setAttribute('data-i', i);
                        item.addEventListener('click', (function(idx) {
                            return function(e) {
                                e.stopPropagation();
                                sel.selectedIndex = idx;
                                syncLabel();
                                if (idx === customIdx) sel._csdFocusCustom(); // "Custom" picked: type straight into the box
                                panel.classList.remove('open');
                                // Trigger change event (fires onchange handlers + addEventListener)
                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                            };
                        })(i));
                        panel.appendChild(item);
                    }
                }
                buildItems();

                // Open/close dropdown
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // Close all other panels
                    document.querySelectorAll('.csd-panel.open').forEach(function(p) {
                        if (p !== panel) p.classList.remove('open');
                    });
                    var isOpen = panel.classList.contains('open');
                    if (isOpen) {
                        panel.classList.remove('open');
                    } else {
                        buildItems(); // refresh in case options changed
                        panel.classList.add('open');
                        // Position fixed below trigger
                        var rect = btn.getBoundingClientRect();
                        panel.style.top = (rect.bottom + 2) + 'px';
                        panel.style.left = rect.left + 'px';
                        panel.style.minWidth = rect.width + 'px';
                        // Scroll active item into view
                        var activeItem = panel.querySelector('.csd-item.active');
                        if (activeItem) {
                            setTimeout(function() { activeItem.scrollIntoView({ block: 'nearest' }); }, 10);
                        }
                    }
                });

                // Store reference for reposition on scroll
                btn._csdPanel = panel;
            }

            // Initialize all selects in search containers
            function initAll() {
                searchContainerIds.forEach(function(id) {
                    var container = document.getElementById(id);
                    if (!container) return;
                    container.querySelectorAll('select').forEach(convertSelect);
                });
            }

            // Re-read every converted select after a programmatic change (Clear, Last Search, saved
            // search, defaults) so each box shows the option its select is on.
            window.syncCustomSelects = function(root) {
                (root || document).querySelectorAll('select').forEach(function(sel) {
                    if (sel._csdSync) sel._csdSync();
                    sel.classList.toggle('placeholder-active', !sel.value || sel.value === '');
                });
            };

            // Run on DOMContentLoaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initAll);
            } else {
                initAll();
            }

            // Close all panels on outside click
            document.addEventListener('click', function(e) {
                if (!e.target.closest('.csd-btn') && !e.target.closest('.csd-panel')) {
                    document.querySelectorAll('.csd-panel.open').forEach(function(p) {
                        p.classList.remove('open');
                    });
                }
            });

            // Reposition open panels on scroll
            function repositionPanels() {
                var openPanel = document.querySelector('.csd-panel.open');
                if (!openPanel) return;
                // Find its trigger
                var allBtns = document.querySelectorAll('.csd-btn');
                for (var i = 0; i < allBtns.length; i++) {
                    if (allBtns[i]._csdPanel === openPanel) {
                        var rect = allBtns[i].getBoundingClientRect();
                        if (rect.bottom < 0 || rect.top > window.innerHeight) {
                            openPanel.classList.remove('open');
                        } else {
                            openPanel.style.top = (rect.bottom + 2) + 'px';
                            openPanel.style.left = rect.left + 'px';
                            openPanel.style.minWidth = rect.width + 'px';
                        }
                        break;
                    }
                }
            }
            var mainContent = document.getElementById('mainContent');
            if (mainContent) mainContent.addEventListener('scroll', repositionPanels);
            window.addEventListener('scroll', repositionPanels);
            window.addEventListener('resize', repositionPanels);
        })();


        // ── Co-Exclusive Agent Functions ──

        function toggleCoExclusiveType(prefix, type) {
            var internalDiv = document.getElementById(prefix + 'CoExclusiveInternal');
            var externalDiv = document.getElementById(prefix + 'CoExclusiveExternal');
            if (type === 'internal') {
                if (internalDiv) internalDiv.classList.remove('hidden');
                if (externalDiv) externalDiv.classList.add('hidden');
            } else {
                if (internalDiv) internalDiv.classList.add('hidden');
                if (externalDiv) externalDiv.classList.remove('hidden');
            }
        }

        function updateCoExclusiveAgentList(prefix) {
            // Populate agent dropdown based on selected company. Roster lookup
            // is wired through the REBNY broker-roster API at the moment a
            // company is selected — no hardcoded agents.
            var companySel = document.getElementById(prefix + 'CoExclusiveCompany');
            var agentSel = document.getElementById(prefix + 'CoExclusiveAgent');
            if (!companySel || !agentSel) return;
            var company = companySel.value;
            if (!company) { agentSel.innerHTML = '<option value="">-- Select Company First --</option>'; return; }
            // Empty until the roster lookup populates it; integration point with
            // /api/crm/agents?company=<company> goes here.
            agentSel.innerHTML = '<option value="">-- Select Agent --</option>';
        }

        function selectCoExclusiveAgent(prefix, source) {
            var name = '--', phone = '--', email = '--', license = '--';
            if (source === 'internal') {
                var sel = document.getElementById(prefix + 'CoExclusiveInternalAgent');
                if (sel && sel.selectedIndex > 0) {
                    var opt = sel.options[sel.selectedIndex];
                    name = opt.dataset.name || opt.text;
                    phone = opt.dataset.phone || '--';
                    email = opt.dataset.email || '--';
                    license = opt.dataset.license || '--';
                }
            } else {
                var sel = document.getElementById(prefix + 'CoExclusiveAgent');
                if (sel && sel.selectedIndex > 0) {
                    var opt = sel.options[sel.selectedIndex];
                    name = opt.dataset.name || opt.text;
                    phone = opt.dataset.phone || '--';
                    email = opt.dataset.email || '--';
                    license = opt.dataset.license || '--';
                }
            }
            var infoDiv = document.getElementById(prefix + 'CoExclusiveAgentInfo');
            if (infoDiv && name !== '--') {
                infoDiv.classList.remove('hidden');
                var n = document.getElementById(prefix + 'CoExclusiveAgentName');
                var p = document.getElementById(prefix + 'CoExclusiveAgentPhone');
                var e = document.getElementById(prefix + 'CoExclusiveAgentEmail');
                var l = document.getElementById(prefix + 'CoExclusiveAgentLicense');
                if (n) n.textContent = name;
                if (p) p.textContent = phone;
                if (e) e.textContent = email;
                if (l) l.textContent = license;
            }
        }

        // ── Hook Co-Exclusive show/hide into listing type change ──

        // Enhance existing handleSaleListingTypeChange to show/hide Co-Exclusive section
        var _origHandleSaleListingTypeChange = typeof handleSaleListingTypeChange === 'function' ? handleSaleListingTypeChange : null;
        function handleSaleListingTypeChangeEnhanced(val) {
            if (_origHandleSaleListingTypeChange) _origHandleSaleListingTypeChange(val);
            var coExSection = document.getElementById('saleCoExclusiveSection');
            if (coExSection) {
                coExSection.classList.toggle('hidden', val !== 'Co-Exclusive');
            }
        }
        // Patch all sale listing type radios
        document.querySelectorAll('input[name="saleListingType"]').forEach(r => {
            r.setAttribute('onchange', "handleSaleListingTypeChangeEnhanced(this.value)");
        });

        var _origHandleRentalListingTypeChange = typeof handleRentalListingTypeChange === 'function' ? handleRentalListingTypeChange : null;
        function handleRentalListingTypeChangeEnhanced(val) {
            if (_origHandleRentalListingTypeChange) _origHandleRentalListingTypeChange(val);
            var coExSection = document.getElementById('rentalCoExclusiveSection');
            if (coExSection) {
                coExSection.classList.toggle('hidden', val !== 'Co-Exclusive');
            }
        }
        document.querySelectorAll('input[name="rentalListingType"]').forEach(r => {
            r.setAttribute('onchange', "handleRentalListingTypeChangeEnhanced(this.value)");
        });




        // ═══════════════════════════════════════════════════════════════
