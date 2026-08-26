        // ═══════════════════════════════════════════════════════════════════════════════
        // ADDITIONAL TOOLBAR FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        // Social share with REBNY compliance (broker attribution + Equal Housing)
        function shareSocialPost() {
            var platforms = [];
            document.querySelectorAll('.social-platform:checked').forEach(function(cb){ platforms.push(cb.value); });
            if (platforms.length === 0) { showToast('Please select at least one platform.', 'warning'); return; }
            showToast('Post shared to: ' + platforms.join(', ') + ' with broker attribution & Equal Housing notice.', 'success');
        }

        function toggleSelectionDropdown() {
            var dropdown = document.getElementById('selectionDropdown');
            if (dropdown) dropdown.classList.toggle('hidden');
        }

        function selectSomeCustomers() {
            showToast('Some Customers selection mode - shows listings for specific selected customers', 'info');
            toggleSelectionDropdown();
        }

        function selectAllCustomers() {
            showToast('All Customers selection mode - shows listings for all customers', 'info');
            toggleSelectionDropdown();
        }

        function toggleSortDropdown() {
            var dropdown = document.getElementById('sortDropdown');
            if (dropdown) dropdown.classList.toggle('hidden');
        }

        function setSortField(field) {
            if (searchResultsState) {
                searchResultsState.sortField = field;
            }
            var label = document.getElementById('sortLabel');
            if (label) {
                var labels = {
                    'price': 'Price',
                    'address': 'Address',
                    'dom': 'Days on Market',
                    'listedDate': 'Listed Date',
                    'beds': 'Bedrooms',
                    'intSqft': 'Square Feet'
                };
                label.textContent = labels[field] || field;
            }
            toggleSortDropdown();
            if (typeof renderSearchResults === 'function') {
                renderSearchResults();
            }
        }

        // Toggle sort order (asc/desc) and re-fetch from Trestle if needed
        function toggleSortOrder() {
            if (!searchResultsState) return;
            searchResultsState.sortOrder = searchResultsState.sortOrder === 'asc' ? 'desc' : 'asc';

            // For price sort, re-fetch from server with correct ordering
            // (local sort only covers the 500 loaded listings)
            var field = searchResultsState.sortField;
            var order = searchResultsState.sortOrder;
            if ((field === 'price' || field === 'listedDate' || field === 'dom') && typeof MallanAPI !== 'undefined') {
                // CANONICAL MALLAN SORT KEYS, not provider fragments.
                //
                // This built `<field> <dir>` from a local fieldMap and sent it as
                // raw $orderby. Two of the three mappings were wrong:
                // 'listedDate' pointed at ModificationTimestamp (when the record
                // was last TOUCHED, not when it was LISTED), and 'dom' pointed at
                // DaysOnMarket, which the provider suppresses for ordering — so
                // sorting by DOM did not sort badly, it 400'd the whole search.
                // The server now owns the vocabulary and refuses by name.
                var sortKeyMap = {
                    'price': order === 'desc' ? 'price_desc' : 'price_asc',
                    'listedDate': order === 'desc' ? 'listed_desc' : 'listed_asc'
                };
                var sortKey = sortKeyMap[field];
                if (!sortKey) return;

                // THE WHOLE CRITERIA SET, THROUGH THE ONE SERIALIZER.
                //
                // This used to hand-rebuild params and forward FIVE criteria out
                // of roughly thirty-five — price, beds, baths, and a neighborhood
                // only when there happened to be exactly one. Status, checkboxes,
                // sqft, rooms, year, dates, zip, unit, address, listing id,
                // ownership, subtype, borough and every additional neighborhood
                // were dropped, so changing the sort order silently widened the
                // search to a nearly unfiltered set. A client-side re-filter used
                // to hide that; it is gone, because hiding it was the other half
                // of the same defect.
                //
                // buildIdxSearchParams is the single serializer. A re-sort must
                // ask the same question in a different order, not a different
                // question.
                var params = window.buildIdxSearchParams(
                    (typeof activeSearchCriteria !== 'undefined' && activeSearchCriteria)
                        ? activeSearchCriteria
                        : {}
                );
                params.limit = 200;
                params.sort = sortKey;

                _serverSearchActive = true;
                MallanAPI.idx.search(params).then(function(result) {
                    _serverSearchActive = false;
                    if (result.listings && result.listings.length > 0) {
                        _replaceListings(result.listings, 'IDX/Trestle (re-sort)');
                        // RENDER THE SERVER ANSWER, DO NOT NARROW IT.
                        //
                        // This used to run filterListings(listings, criteria)
                        // over the rows the server had just returned, and then
                        // call markSearchResultsAuthoritative() on whatever
                        // survived. Re-filtering can only REMOVE rows, so any
                        // disagreement between the client's idea of a criterion
                        // and the server's silently shrank an authoritative
                        // result set — and a re-sort is not supposed to change
                        // WHICH listings match, only their order.
                        //
                        // The disagreement is real, not theoretical: the mapper
                        // deliberately leaves unknown values unknown (an unknown
                        // borough must not become Manhattan), while the client
                        // post-filter compares those same fields with plain
                        // equality, so an honestly-blank row fails the
                        // comparison and disappears. The server counted it; the
                        // client dropped it; the header reported the smaller
                        // number.
                        //
                        // The criteria were already applied, by the layer that
                        // owns them. `listings` is exactly result.listings here
                        // — _replaceListings replaced the catalogue wholesale.
                        searchResultsState.filteredListings = listings.slice();
                        // The re-sort answer carries its own declared count. Without
                        // this the header would keep whatever the previous search
                        // reported, over a different set of rows.
                        searchResultsState.serverCount = (result && result.count) || null;
                        searchResultsState.serverTotalPages = (result && result.totalPages) || null;
                        searchResultsState.currentPage = 1;
                        // The server answered for the current criteria, so this
                        // set is authoritative again. `_replaceListings` above
                        // downgraded it to a preview on the way through, which is
                        // right for a background reload but wrong here.
                        if (typeof markSearchResultsAuthoritative === 'function') markSearchResultsAuthoritative();
                        if (typeof initializeSearchResults === 'function') initializeSearchResults();
                        if (typeof updateResultsCount === 'function') updateResultsCount();
                    }
                }).catch(function(err) {
                    _serverSearchActive = false;
                    console.warn('[Sort] Server re-fetch failed:', err.message);
                    // Was: silently `renderSearchResults()` — a client-side sort
                    // of whatever was already there, with no signal. The rows on
                    // screen are no longer a completed answer for these criteria,
                    // so say so and drop them out of authoritative state rather
                    // than presenting a re-ordered stale set as the result.
                    if (typeof markSearchResultsProvisional === 'function') markSearchResultsProvisional();
                    showToast('Could not re-sort — the search did not complete. Showing the previous order.', 'error');
                    renderSearchResults();
                });
                return;
            }

            renderSearchResults();
        }

        function showAllResults() {
            // Clear selection and show all results
            if (searchResultsState) {
                searchResultsState.selectedListings = [];
                updateSelectionUI();
            }
        }

        function scrollColumnsLeft() {
            var headers = document.getElementById('gridColumnHeaders');
            if (headers) headers.scrollBy({ left: -200, behavior: 'smooth' });
        }

        function scrollColumnsRight() {
            var headers = document.getElementById('gridColumnHeaders');
            if (headers) headers.scrollBy({ left: 200, behavior: 'smooth' });
        }

        function updateSelectionUI() {
            var count = searchResultsState?.selectedListings?.length || 0;
            document.querySelectorAll('#selectedCountDisplay').forEach(function(el) { el.textContent = count; });
            document.querySelectorAll('#selectedCount').forEach(function(el) { el.textContent = count; });

            var actionBar = document.getElementById('selectionActionBar');
            if (actionBar) {
                actionBar.style.display = count > 0 ? 'flex' : 'none';
            }
            var pill = document.getElementById('selectionPill');
            if (pill) {
                if (count > 0) {
                    pill.classList.remove('bg-gray-100', 'text-gray-600');
                    pill.classList.add('bg-blue-100', 'text-blue-700');
                } else {
                    pill.classList.remove('bg-blue-100', 'text-blue-700');
                    pill.classList.add('bg-gray-100', 'text-gray-600');
                }
            }
        }

        // Toggle Internal Commission section (expand/collapse)
        // Access gated: only broker portal can interact
        function toggleInternalSection(banner) {
            // Hard gate: block non-broker access
            if (currentPortal !== 'broker') {
                banner.closest('.internal-commission-section').style.display = 'none';
                return;
            }
            var body = banner.nextElementSibling;
            var chevron = banner.querySelector('.internal-chevron');
            if (!body) return;
            if (body.style.display === 'none') {
                body.style.display = '';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            } else {
                body.style.display = 'none';
                if (chevron) chevron.style.transform = 'rotate(-90deg)';
            }
        }

        // Filter listings on Manage Sales/Rental Listings pages
        function filterMgmtListings(btn, status, type) {
            var container = btn.closest('.tab-content');
            if (!container) return;
            // Update active pill styling
            container.querySelectorAll('.listing-status-filter').forEach(b => {
                b.classList.remove('bg-orange-500', 'bg-green-600', 'text-white');
                b.classList.add('bg-gray-100', 'text-gray-600');
            });
            if (status === 'active' && type === 'sales') {
                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-orange-500', 'text-white');
            } else if (status === 'active' && type === 'rentals') {
                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-green-600', 'text-white');
            } else {
                btn.classList.remove('bg-gray-100', 'text-gray-600');
                btn.classList.add('bg-gray-700', 'text-white');
            }
            // Filter table rows
            container.querySelectorAll('.mgmt-listing').forEach(row => {
                if (status === 'all' || row.dataset.status === status) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#selectionDropdown') && !e.target.closest('[onclick*="toggleSelectionDropdown"]')) {
                document.getElementById('selectionDropdown')?.classList.add('hidden');
            }
            if (!e.target.closest('#sortDropdown') && !e.target.closest('[onclick*="toggleSortDropdown"]')) {
                document.getElementById('sortDropdown')?.classList.add('hidden');
            }
            if (!e.target.closest('#viewModeDropdown') && !e.target.closest('[onclick*="toggleViewModeDropdown"]')) {
                document.querySelectorAll('#viewModeDropdown').forEach(d => d.classList.add('hidden'));
            }
            if (!e.target.closest('[id^="workWithCustomerDropdown"]') && !e.target.closest('[onclick*="toggleWorkWithCustomer"]')) {
                document.querySelectorAll('[id^="workWithCustomerDropdown"]').forEach(function(d) { d.classList.add('hidden'); });
            }
            if (!e.target.closest('#savedSearchDropdown') && !e.target.closest('[onclick*="toggleSavedSearchDropdown"]')) {
                document.getElementById('savedSearchDropdown')?.classList.add('hidden');
            }
        });

        // === And/Or Toggle Switch ===
        function toggleAndOr(el) {
            var dot = el.querySelector('div');
            var isOr = el.getAttribute('aria-checked') === 'true';
            if (isOr) {
                // Switch to AND
                el.classList.remove('bg-blue-500');
                el.classList.add('bg-gray-300');
                dot.classList.remove('right-0.5');
                dot.classList.add('left-0.5');
                dot.style.left = '2px'; dot.style.right = '';
                el.setAttribute('aria-checked', 'false');
            } else {
                // Switch to OR
                el.classList.remove('bg-gray-300');
                el.classList.add('bg-blue-500');
                dot.classList.remove('left-0.5');
                dot.classList.add('right-0.5');
                dot.style.right = '2px'; dot.style.left = '';
                el.setAttribute('aria-checked', 'true');
            }
        }

        // === Subway Button Click Handlers ===
        document.addEventListener('DOMContentLoaded', function() {
            // Make all subway buttons/spans toggleable
            document.querySelectorAll('button[class*="subway-"], span[class*="cursor-pointer"][class*="rounded-full"]').forEach(function(btn) {
                if (btn.textContent.trim().match(/^[A-Z0-9JLNQRSW]$|^SIR$/) && !btn.hasAttribute('data-subway-init')) {
                    btn.setAttribute('data-subway-init', 'true');
                    btn.setAttribute('role', 'checkbox');
                    btn.setAttribute('aria-checked', 'false');
                    btn.setAttribute('tabindex', '0');
                    btn.setAttribute('aria-label', 'Subway line ' + btn.textContent.trim());
                    btn.addEventListener('click', function() {
                        var checked = this.getAttribute('aria-checked') === 'true';
                        this.setAttribute('aria-checked', String(!checked));
                        this.classList.toggle('ring-2');
                        this.classList.toggle('ring-offset-1');
                        this.classList.toggle('ring-blue-500');
                        this.classList.toggle('opacity-50', checked);
                    });
                    btn.addEventListener('keydown', function(e) {
                        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.click(); }
                    });
                }
            });
        });

        // === Mortgage Calculator ===
        function updateMortgageCalc() {
            var price = parseFloat(document.getElementById('mortgagePrice')?.value) || 0;
            var downPct = parseFloat(document.getElementById('mortgageDownPayment')?.value) || 20;
            var rate = parseFloat(document.getElementById('mortgageRate')?.value) || 6.5;
            var term = parseInt(document.getElementById('mortgageTerm')?.value) || 30;

            var downPayment = price * (downPct / 100);
            var loanAmount = price - downPayment;
            var monthlyRate = (rate / 100) / 12;
            var numPayments = term * 12;

            var monthly = 0;
            if (monthlyRate > 0 && numPayments > 0) {
                monthly = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
            }

            var estMortgage = document.getElementById('estMortgage');
            var estTotal = document.getElementById('estTotalMonthly');
            if (estMortgage) estMortgage.textContent = '$' + Math.round(monthly).toLocaleString();
            if (estTotal) estTotal.textContent = '$' + Math.round(monthly).toLocaleString();
        }

