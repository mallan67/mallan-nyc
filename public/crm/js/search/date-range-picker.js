        // ═══════════════════════════════════════════════════════════════════════════════
        // DATE RANGE PICKER — Dual-Month Calendar Component (SHARED)
        // ═══════════════════════════════════════════════════════════════════════════════

        // State for active picker
        var activeDRP = null;
        var drpFromDate = null;
        var drpToDate = null;
        var drpViewMonth = null; // { year, month } for left calendar
        var drpSelectingFrom = true; // true = picking From, false = picking To

        function formatDateMDY(d) {
            if (!d) return '';
            var mm = String(d.getMonth() + 1).padStart(2, '0');
            var dd = String(d.getDate()).padStart(2, '0');
            return mm + '/' + dd + '/' + d.getFullYear();
        }

        function parseDateMDY(str) {
            if (!str) return null;
            var parts = String(str).split('/');
            if (parts.length !== 3) return null;
            var mm = parseInt(parts[0], 10);
            var dd = parseInt(parts[1], 10);
            var yyyy = parseInt(parts[2], 10);
            if (isNaN(mm) || isNaN(dd) || isNaN(yyyy)) return null;

            var d = new Date(yyyy, mm - 1, dd);
            if (isNaN(d.getTime())) return null;

            // STRICT: an impossible date is REFUSED, never repaired.
            //
            // `new Date(2026, 1, 31)` does not fail — JavaScript rolls 02/31/2026
            // forward into March. The old check only tested isNaN, so a broker's
            // impossible date became a DIFFERENT valid date, and `isoFromMDY` then
            // handed that silently-corrected value to canonical state. Silent
            // repair is exactly what the value contract forbids: the search would
            // answer a question the broker did not ask, and look right doing it.
            if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
                return null;
            }
            return d;
        }

        // ─── CANONICAL ISO BOUNDARY ─────────────────────────────────────────
        //
        // This picker PRESENTS dates as MM/DD/YYYY and stores that spelling in
        // data-from / data-to. Advanced Search uses native <input type="date">,
        // which requires YYYY-MM-DD. Those are two different notations for the
        // same fact, and canonical state holds exactly one of them: ISO, as the
        // value contract requires (`range_date` is 'YYYY-MM-DD').
        //
        // WHAT THIS PREVENTS. Canonical state briefly copied the two
        // representations straight into each other. '08/30/2026' written into a
        // native date input is rejected outright and silently blanks the control;
        // '2026-08-30' written back into this wrapper is then read by
        // parseDateMDY, which splits on '/' and returns null — so the range
        // disappears. A date criterion that vanishes on a view change is the
        // silent-loss failure this whole state model exists to end.
        //
        // The conversion lives HERE, with the module that owns the MDY notation,
        // exactly as `setNeighborhoodSelection` lives with the widget that owns
        // the tag state. Callers deal only in canonical ISO.
        function isoFromMDY(str) {
            var d = parseDateMDY(str);
            if (!d) return '';
            var mm = String(d.getMonth() + 1).padStart(2, '0');
            var dd = String(d.getDate()).padStart(2, '0');
            return d.getFullYear() + '-' + mm + '-' + dd;
        }

        function mdyFromISO(str) {
            if (!str) return '';
            var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str).trim());
            if (!m) return '';
            return m[2] + '/' + m[3] + '/' + m[1];
        }

        /** The stored range for a picker, in CANONICAL ISO. */
        window.getDateRangeISO = function (drpId) {
            var wrapper = document.querySelector('[data-drp="' + drpId + '"]');
            if (!wrapper) return null;
            return {
                from: isoFromMDY(wrapper.getAttribute('data-from')),
                to: isoFromMDY(wrapper.getAttribute('data-to'))
            };
        };

        /**
         * Set a picker's range from CANONICAL ISO, updating both the stored
         * attributes and the visible trigger text — otherwise the agent sees a
         * stale label over a changed value.
         */
        window.setDateRangeISO = function (drpId, fromISO, toISO) {
            var wrapper = document.querySelector('[data-drp="' + drpId + '"]');
            if (!wrapper) return;
            var from = mdyFromISO(fromISO);
            var to = mdyFromISO(toISO);

            if (from) wrapper.setAttribute('data-from', from);
            else wrapper.removeAttribute('data-from');
            if (to) wrapper.setAttribute('data-to', to);
            else wrapper.removeAttribute('data-to');

            // EITHER BOUND MAY BE OMITTED — the canonical `range_date` contract
            // permits an open-ended range, and "sold since January" is as real a
            // search as "sold between January and June".
            //
            // Label, has-value and the Clear button were all decided from `from`
            // alone, so a canonical value carrying only `max` was stored correctly
            // and then displayed as EMPTY. The agent would see no filter, and
            // clearing what looks like nothing is how a real criterion gets lost.
            var hasValue = !!(from || to);
            var trigger = wrapper.querySelector('.drp-trigger');
            var textEl = trigger ? trigger.querySelector('.drp-text') : null;
            var clearBtn = trigger ? trigger.querySelector('.drp-clear') : null;
            if (textEl) {
                if (from && to) textEl.textContent = from + ' - ' + to;
                else if (from) textEl.textContent = 'From ' + from;
                else if (to) textEl.textContent = 'Until ' + to;
                else textEl.textContent = textEl.getAttribute('data-placeholder') || 'Select Date Range';
                textEl.classList.toggle('has-value', hasValue);
            }
            if (clearBtn) clearBtn.style.display = hasValue ? '' : 'none';
        };

        function sameDay(a, b) {
            if (!a || !b) return false;
            return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
        }

        function betweenDays(d, from, to) {
            if (!d || !from || !to) return false;
            var t = d.getTime();
            var f = from.getTime();
            var e = to.getTime();
            return t > Math.min(f, e) && t < Math.max(f, e);
        }

        function buildMonthGrid(year, month, container) {
            container.innerHTML = '';
            var dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            dows.forEach(function(d) {
                var el = document.createElement('div');
                el.className = 'drp-dow';
                el.textContent = d;
                container.appendChild(el);
            });
            var firstDay = new Date(year, month, 1).getDay();
            var daysInMonth = new Date(year, month + 1, 0).getDate();
            var today = new Date();
            // Previous month padding
            var prevDays = new Date(year, month, 0).getDate();
            for (var i = firstDay - 1; i >= 0; i--) {
                var el = document.createElement('div');
                el.className = 'drp-day other-month';
                el.textContent = prevDays - i;
                container.appendChild(el);
            }
            // Current month days
            for (var d = 1; d <= daysInMonth; d++) {
                var el = document.createElement('div');
                el.className = 'drp-day';
                var thisDate = new Date(year, month, d);
                if (sameDay(thisDate, today)) el.classList.add('today');
                if (sameDay(thisDate, drpFromDate) || sameDay(thisDate, drpToDate)) el.classList.add('selected');
                if (drpFromDate && drpToDate && betweenDays(thisDate, drpFromDate, drpToDate)) el.classList.add('in-range');
                el.textContent = d;
                el.setAttribute('data-date', year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
                el.addEventListener('click', function() { onDRPDayClick(this); });
                container.appendChild(el);
            }
            // Next month padding
            var totalCells = container.children.length;
            var remaining = (totalCells <= 42) ? 42 - totalCells : 0;
            for (var i = 1; i <= remaining; i++) {
                var el = document.createElement('div');
                el.className = 'drp-day other-month';
                el.textContent = i;
                container.appendChild(el);
            }
        }

        function renderDRPCalendar() {
            if (!activeDRP) return;
            var popup = _drpCachedPopup;
            if (!popup) return;
            var leftGrid = popup.querySelector('.drp-grid-left');
            var rightGrid = popup.querySelector('.drp-grid-right');
            var leftTitle = popup.querySelector('.drp-title-left');
            var rightTitle = popup.querySelector('.drp-title-right');
            var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            leftTitle.textContent = months[drpViewMonth.month] + ' ' + drpViewMonth.year;
            var rightMonth = drpViewMonth.month + 1;
            var rightYear = drpViewMonth.year;
            if (rightMonth > 11) { rightMonth = 0; rightYear++; }
            rightTitle.textContent = months[rightMonth] + ' ' + rightYear;
            buildMonthGrid(drpViewMonth.year, drpViewMonth.month, leftGrid);
            buildMonthGrid(rightYear, rightMonth, rightGrid);
            // Update footer inputs
            var fromInput = popup.querySelector('.drp-from-input');
            var toInput = popup.querySelector('.drp-to-input');
            if (fromInput) fromInput.value = formatDateMDY(drpFromDate);
            if (toInput) toInput.value = formatDateMDY(drpToDate);
        }

        function onDRPDayClick(dayEl) {
            if (dayEl.classList.contains('other-month')) return;
            var dateStr = dayEl.getAttribute('data-date');
            var parts = dateStr.split('-');
            var clickedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            if (drpSelectingFrom || (drpFromDate && drpToDate)) {
                // Start new range
                drpFromDate = clickedDate;
                drpToDate = null;
                drpSelectingFrom = false;
            } else {
                // Complete range
                drpToDate = clickedDate;
                // Ensure from <= to
                if (drpToDate < drpFromDate) {
                    var temp = drpFromDate;
                    drpFromDate = drpToDate;
                    drpToDate = temp;
                }
                drpSelectingFrom = true;
            }
            renderDRPCalendar();
        }

        function drpPrevMonth() {
            drpViewMonth.month--;
            if (drpViewMonth.month < 0) { drpViewMonth.month = 11; drpViewMonth.year--; }
            renderDRPCalendar();
        }

        function drpNextMonth() {
            drpViewMonth.month++;
            if (drpViewMonth.month > 11) { drpViewMonth.month = 0; drpViewMonth.year++; }
            renderDRPCalendar();
        }

        function drpSetToday() {
            var today = new Date();
            drpFromDate = today;
            drpToDate = today;
            drpViewMonth = { year: today.getFullYear(), month: today.getMonth() };
            drpSelectingFrom = true;
            renderDRPCalendar();
        }

        // Cached popup element — reused across all date pickers (appended to body)
        var _drpCachedPopup = null;

        function _getDRPPopup() {
            if (_drpCachedPopup) return _drpCachedPopup;
            var popup = document.createElement('div');
            popup.className = 'drp-popup';
            popup.id = 'drpSharedPopup';
            popup.innerHTML = '' +
                '<div class="drp-months">' +
                    '<div class="drp-month">' +
                        '<div class="drp-month-header">' +
                            '<button onclick="drpPrevMonth()">&#8249;</button>' +
                            '<span class="drp-title-left"></span>' +
                            '<span></span>' +
                        '</div>' +
                        '<div class="drp-grid drp-grid-left"></div>' +
                    '</div>' +
                    '<div class="drp-month">' +
                        '<div class="drp-month-header">' +
                            '<span></span>' +
                            '<span class="drp-title-right"></span>' +
                            '<button onclick="drpNextMonth()">&#8250;</button>' +
                        '</div>' +
                        '<div class="drp-grid drp-grid-right"></div>' +
                    '</div>' +
                '</div>' +
                '<div class="drp-footer">' +
                    '<button type="button" onclick="drpSetToday()" style="padding:4px 10px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">Today</button>' +
                    '<label>From</label>' +
                    '<input type="text" class="drp-from-input" placeholder="MM/DD/YYYY" onchange="drpManualDateInput(this, \'from\')">' +
                    '<label>To</label>' +
                    '<input type="text" class="drp-to-input" placeholder="MM/DD/YYYY" onchange="drpManualDateInput(this, \'to\')">' +
                    '<div class="drp-actions">' +
                        '<button class="drp-apply" onclick="applyDateRange()">Apply</button>' +
                        '<button onclick="cancelDateRange()">Cancel</button>' +
                        '<button onclick="clearDateRangeFromPopup()">Clear</button>' +
                    '</div>' +
                '</div>';
            popup.addEventListener('click', function(e) { e.stopPropagation(); });
            document.body.appendChild(popup);
            _drpCachedPopup = popup;
            return popup;
        }

        function openDateRangePicker(triggerEl) {
            var wrapper = triggerEl.closest('.drp-wrapper');
            // Close any other open picker
            closeAllDRP();
            activeDRP = wrapper;

            // Get or create the shared popup (appended to body, not wrapper — avoids overflow clipping)
            var popupEl = _getDRPPopup();

            // Initialize view
            var now = new Date();
            drpViewMonth = { year: now.getFullYear(), month: now.getMonth() };
            // Check if wrapper already has stored dates
            var storedFrom = wrapper.getAttribute('data-from');
            var storedTo = wrapper.getAttribute('data-to');
            if (storedFrom) {
                drpFromDate = parseDateMDY(storedFrom);
                drpToDate = parseDateMDY(storedTo);
                if (drpFromDate) drpViewMonth = { year: drpFromDate.getFullYear(), month: drpFromDate.getMonth() };
                drpSelectingFrom = true;
            } else {
                drpFromDate = null;
                drpToDate = null;
                drpSelectingFrom = true;
            }
            popupEl.classList.add('open');
            // Position fixed popup relative to trigger (viewport coords)
            var trigger = wrapper.querySelector('.drp-trigger');
            var rect = trigger.getBoundingClientRect();
            var popupW = 520;
            var popupH = 380; // approximate popup height
            var leftPos = rect.left + (rect.width / 2) - (popupW / 2);
            // Keep within viewport horizontally
            if (leftPos < 8) leftPos = 8;
            if (leftPos + popupW > window.innerWidth - 8) leftPos = window.innerWidth - popupW - 8;
            // Position below trigger, or above if not enough room below
            var topPos = rect.bottom + 4;
            if (topPos + popupH > window.innerHeight - 8 && rect.top > popupH + 8) {
                topPos = rect.top - popupH - 4;
            }
            popupEl.style.top = topPos + 'px';
            popupEl.style.left = leftPos + 'px';
            renderDRPCalendar();
        }

        function drpManualDateInput(input, which) {
            var d = parseDateMDY(input.value);
            if (!d) return;
            if (which === 'from') drpFromDate = d;
            else drpToDate = d;
            if (drpFromDate && drpToDate && drpToDate < drpFromDate) {
                var temp = drpFromDate;
                drpFromDate = drpToDate;
                drpToDate = temp;
            }
            renderDRPCalendar();
        }

        function applyDateRange() {
            if (!activeDRP) return;
            var trigger = activeDRP.querySelector('.drp-trigger');
            var textEl = trigger.querySelector('.drp-text');
            var clearBtn = trigger.querySelector('.drp-clear');
            if (drpFromDate && drpToDate) {
                textEl.textContent = formatDateMDY(drpFromDate) + ' - ' + formatDateMDY(drpToDate);
                textEl.classList.add('has-value');
                clearBtn.style.display = '';
                activeDRP.setAttribute('data-from', formatDateMDY(drpFromDate));
                activeDRP.setAttribute('data-to', formatDateMDY(drpToDate));
            } else if (drpFromDate) {
                textEl.textContent = formatDateMDY(drpFromDate);
                textEl.classList.add('has-value');
                clearBtn.style.display = '';
                activeDRP.setAttribute('data-from', formatDateMDY(drpFromDate));
                activeDRP.removeAttribute('data-to');
            }
            closeAllDRP();
        }

        function cancelDateRange() {
            closeAllDRP();
        }

        function clearDateRangeFromPopup() {
            drpFromDate = null;
            drpToDate = null;
            drpSelectingFrom = true;
            renderDRPCalendar();
        }

        function clearDateRange(clearBtn) {
            var wrapper = clearBtn.closest('.drp-wrapper');
            var trigger = wrapper.querySelector('.drp-trigger');
            var textEl = trigger.querySelector('.drp-text');
            textEl.textContent = 'Select Date Range';
            textEl.classList.remove('has-value');
            clearBtn.style.display = 'none';
            wrapper.removeAttribute('data-from');
            wrapper.removeAttribute('data-to');
        }

        function closeAllDRP() {
            if (_drpCachedPopup) {
                _drpCachedPopup.classList.remove('open');
            }
            // Also close any legacy popups that may still be inside wrappers
            document.querySelectorAll('.drp-popup.open').forEach(function(p) {
                p.classList.remove('open');
            });
            activeDRP = null;
        }

        // Close picker when clicking outside (wrapper OR the shared popup on body)
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.drp-wrapper') && !e.target.closest('#drpSharedPopup')) {
                closeAllDRP();
            }
        });

        // Reposition popup on scroll (since it's position:fixed)
        function repositionDRP() {
            if (!activeDRP || !_drpCachedPopup || !_drpCachedPopup.classList.contains('open')) return;
            var trigger = activeDRP.querySelector('.drp-trigger');
            if (!trigger) return;
            var rect = trigger.getBoundingClientRect();
            var popupW = 520;
            var popupH = 380;
            var leftPos = rect.left + (rect.width / 2) - (popupW / 2);
            if (leftPos < 8) leftPos = 8;
            if (leftPos + popupW > window.innerWidth - 8) leftPos = window.innerWidth - popupW - 8;
            // If trigger scrolled out of view, close the picker
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
                closeAllDRP();
                return;
            }
            // Position below trigger, or above if not enough room below
            var topPos = rect.bottom + 4;
            if (topPos + popupH > window.innerHeight - 8 && rect.top > popupH + 8) {
                topPos = rect.top - popupH - 4;
            }
            _drpCachedPopup.style.top = topPos + 'px';
            _drpCachedPopup.style.left = leftPos + 'px';
        }
        // Attach scroll listener to main content area and window
        var mainContentEl = document.getElementById('mainContent');
        if (mainContentEl) mainContentEl.addEventListener('scroll', repositionDRP);
        window.addEventListener('scroll', repositionDRP);
        window.addEventListener('resize', repositionDRP);

        // ═══════════════════════════════════════════════════════════════════════════════
        // SIDEBAR SECTION & PARENT TOGGLE FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        /**
         * Collapse/expand a major sidebar section (Admin Dashboard, Broker/Agent, Tools)
         */
