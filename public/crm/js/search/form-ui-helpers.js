        function addQuickSearchAddressRow(btn) {
            var row = btn.closest('.flex.items-center');
            var container = row.parentElement;
            var newRow = document.createElement('div');
            newRow.className = 'flex items-center gap-1.5';
            newRow.innerHTML = `
                <input type="text" placeholder="Address or Building Name" class="flex-1 border rounded px-2 py-1.5 text-xs">
                <input type="text" placeholder="Unit" class="w-14 border rounded px-2 py-1.5 text-xs text-center">
                <button type="button" onclick="removeQuickSearchAddressRow(this)" class="w-6 h-6 bg-red-500 text-white rounded hover:bg-red-600 flex items-center justify-center text-xs flex-shrink-0" title="Remove this address"><i class="fas fa-minus" style="font-size:9px"></i></button>
            `;
            container.appendChild(newRow);
            newRow.querySelector('input[type="text"]').focus();
        }

        // Add another row in Advanced Search (Listing ID / Zip / Address)
        function addAdvancedSearchRow() {
            var container = document.getElementById('advancedSearchExtraRows');
            var newRow = document.createElement('div');
            newRow.className = 'flex items-end gap-3';
            newRow.innerHTML = `
                <div class="flex-1">
                    <input type="text" placeholder="Address or Building Name" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                </div>
                <div class="w-[100px]">
                    <input type="text" placeholder="Unit #" class="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm">
                </div>
                <div>
                    <button type="button" onclick="this.parentElement.parentElement.remove()" class="w-9 h-[42px] bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center justify-center text-xs flex-shrink-0" title="Remove this row"><i class="fas fa-minus"></i></button>
                </div>
            `;
            container.appendChild(newRow);
            newRow.querySelector('input[type="text"]').focus();
        }

        // Remove an added Address + Unit row
        function removeQuickSearchAddressRow(btn) {
            var row = btn.closest('.flex.items-center');
            row.remove();
        }

        // Collapsible form sections
        function toggleFormSection(header) {
            var body = header.nextElementSibling;
            var chevron = header.querySelector('.fa-chevron-down, .fa-chevron-right');
            if (!body || !body.classList.contains('form-section-body')) return;
            if (body.style.display === 'none') {
                body.style.display = '';
                if (chevron) { chevron.classList.remove('fa-chevron-right'); chevron.classList.add('fa-chevron-down'); }
                var hint = header.querySelector('.text-xs.text-gray-400');
                if (hint) hint.textContent = '(Click to collapse)';
            } else {
                body.style.display = 'none';
                if (chevron) { chevron.classList.remove('fa-chevron-down'); chevron.classList.add('fa-chevron-right'); }
                var hint = header.querySelector('.text-xs.text-gray-400');
                if (hint) hint.textContent = '(Click to expand)';
            }
        }

        // ═══ Open House Date Preset Buttons ═══
        function setOpenHouseDatePreset(preset, drpId) {
            var wrapper = document.querySelector('.drp-wrapper[data-drp="' + drpId + '"]');
            if (!wrapper) return;

            var today = new Date();
            today.setHours(0,0,0,0);
            var from = new Date(today);
            var to = new Date(today);

            // THESE BOUNDARIES MATCH lib/search/open-house-window.ts.
            // The picker must display the range that actually executes;
            // two different answers to "this weekend" is how a broker ends
            // up trusting a result set that was never what they asked for.
            if (preset === 'today') {
                // from = to = today (already set)
            } else if (preset === 'weekend') {
                var day = today.getDay(); // 0 = Sunday
                if (day === 0) {
                    // ON SUNDAY THE WEEKEND IS TODAY. The previous code sent
                    // the broker to NEXT Saturday and hid the open houses
                    // happening that afternoon.
                    from = new Date(today);
                    to = new Date(today);
                } else if (day === 6) {
                    from = new Date(today);
                    to = new Date(today);
                    to.setDate(today.getDate() + 1);
                } else {
                    from = new Date(today);
                    from.setDate(today.getDate() + (6 - day));
                    to = new Date(from);
                    to.setDate(from.getDate() + 1);
                }
            } else if (preset === '7days') {
                // Seven days INCLUSIVE of today: today plus six.
                to.setDate(today.getDate() + 6);
            } else if (preset === '30days') {
                to.setDate(today.getDate() + 29);
            }
            // THE TOKEN IS THE CRITERION. The dates below are only what the
            // picker DISPLAYS; the server recomputes the window in
            // America/New_York from this token, so a broker on a laptop set to
            // another timezone still searches the New York day.
            //
            // One vocabulary: the HTML still calls this with the legacy '7days'
            // and '30days' labels, normalised here in the single place that
            // knows both, rather than translated again server-side.
            var CANONICAL_OH_PRESET = {
                today: 'today', weekend: 'weekend',
                '7days': 'next7', next7: 'next7',
                '30days': 'next30', next30: 'next30'
            };
            var token = CANONICAL_OH_PRESET[preset];
            if (token) wrapper.setAttribute('data-oh-preset', token);
            else wrapper.removeAttribute('data-oh-preset');

            // Store on wrapper
            var fromStr = formatDateMDY(from);
            var toStr = formatDateMDY(to);
            wrapper.setAttribute('data-from', fromStr);
            wrapper.setAttribute('data-to', toStr);

            // Update trigger display
            var textEl = wrapper.querySelector('.drp-text');
            var clearBtn = wrapper.querySelector('.drp-clear');
            if (textEl) {
                textEl.textContent = fromStr + ' - ' + toStr;
                textEl.classList.add('has-value');
            }
            if (clearBtn) clearBtn.style.display = '';

            // Highlight the active preset button
            var allBtns = document.querySelectorAll('.oh-preset[data-oh="' + drpId + '"]');
            allBtns.forEach(function(b) {
                b.classList.remove('bg-blue-100', 'border-blue-400', 'text-blue-700');
            });
            var clicked = event && event.target ? event.target.closest('.oh-preset') : null;
            if (clicked) {
                clicked.classList.add('bg-blue-100', 'border-blue-400', 'text-blue-700');
            }
        }

        function clearOpenHousePreset(drpId) {
            // The token must go with the highlight. A stale token would keep
            // executing a preset window the broker can no longer see selected.
            var w = document.querySelector('.drp-wrapper[data-drp="' + drpId + '"]')
                || document.querySelector('[data-drp="' + drpId + '"]');
            if (w) w.removeAttribute('data-oh-preset');
            var allBtns = document.querySelectorAll('.oh-preset[data-oh="' + drpId + '"]');
            allBtns.forEach(function(b) {
                b.classList.remove('bg-blue-100', 'border-blue-400', 'text-blue-700');
            });
        }
