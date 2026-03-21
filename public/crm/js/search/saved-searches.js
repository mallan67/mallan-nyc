        // ═══════════════════════════════════════════════════════════════════════════════
        // SAVED SEARCH FUNCTIONS — API-backed (MallanAPI.savedSearches)
        // ═══════════════════════════════════════════════════════════════════════════════

        function toggleSavedSearchDropdown() {
            document.getElementById('savedSearchDropdown').classList.toggle('hidden');
        }

        function populateSavedSearchList() {
            var container = document.getElementById('savedSearchList');
            if (!container) return;

            container.innerHTML = '<p class="p-3 text-sm text-gray-400 text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

            if (typeof MallanAPI === 'undefined') {
                container.innerHTML = '<p class="p-3 text-sm text-gray-500 text-center">API not available</p>';
                return;
            }

            MallanAPI.savedSearches.list().then(function(result) {
                var searches = result.savedSearches || [];
                searchResultsState.savedSearches = searches;

                if (searches.length === 0) {
                    container.innerHTML = '<p class="p-3 text-sm text-gray-500 text-center">No saved searches yet</p>';
                    return;
                }

                container.innerHTML = searches.map(function(search) {
                    var alertBadge = search.alert_enabled && search.alert_frequency
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-semibold rounded-full">' + search.alert_frequency + '</span>'
                        : '';
                    var clientBadge = search.lead_id
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-semibold rounded-full"><i class="fas fa-user text-[7px]"></i></span>'
                        : '';
                    var dateStr = search.updated_at ? new Date(search.updated_at).toLocaleDateString() : '';
                    return '<div class="flex items-center justify-between px-3 py-2 hover:bg-gray-100">'
                        + '<button onclick="loadSavedSearch(\'' + search.id + '\')" class="text-left flex-1">'
                        + '<div class="font-medium text-sm">' + escapeHtml(search.name) + alertBadge + clientBadge + '</div>'
                        + '<div class="text-xs text-gray-500">' + dateStr + '</div>'
                        + '</button>'
                        + '<button onclick="deleteSavedSearch(\'' + search.id + '\')" class="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Delete">'
                        + '<i class="fas fa-trash text-xs"></i>'
                        + '</button>'
                        + '</div>';
                }).join('');
            }).catch(function(err) {
                console.error('[SavedSearches] Failed to load:', err);
                container.innerHTML = '<p class="p-3 text-sm text-red-500 text-center">Failed to load saved searches</p>';
            });
        }

        function openSaveSearchModal() {
            document.getElementById('savedSearchDropdown').classList.add('hidden');
            document.getElementById('saveSearchModal').classList.remove('hidden');

            // Populate client dropdown
            _populateSaveSearchClientDropdown();

            // Show criteria summary
            _showCriteriaSummary();
        }

        function _populateSaveSearchClientDropdown() {
            var select = document.getElementById('savedSearchClientId');
            if (!select || typeof MallanAPI === 'undefined') return;

            // Keep the default option
            select.innerHTML = '<option value="">-- No client (agent only) --</option>';

            MallanAPI.clients.list({ limit: 200 }).then(function(result) {
                var clients = result.clients || result.leads || [];
                clients.forEach(function(c) {
                    var name = (c.first_name || '') + ' ' + (c.last_name || '');
                    if (c.secondary_first_name) {
                        name += ' & ' + c.secondary_first_name;
                        if (c.secondary_last_name && c.secondary_last_name !== c.last_name) {
                            name += ' ' + c.secondary_last_name;
                        }
                    }
                    var opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = name.trim() + (c.email ? ' (' + c.email + ')' : '');
                    select.appendChild(opt);
                });
            }).catch(function() {
                // Non-blocking — client list is optional
            });
        }

        function _showCriteriaSummary() {
            var summary = document.getElementById('savedSearchCriteriaSummary');
            if (!summary || !activeSearchCriteria) return;

            var c = activeSearchCriteria;
            var parts = [];
            if (c.searchTab) parts.push(c.searchTab === 'rent' ? 'Rental' : c.searchTab === 'building' ? 'Building' : 'Sale');
            if (c.priceMin || c.priceMax) {
                var price = '$' + (c.priceMin ? c.priceMin.toLocaleString() : '0') + ' - $' + (c.priceMax ? c.priceMax.toLocaleString() : 'Any');
                parts.push(price);
            }
            if (c.bedsMin != null) parts.push(c.bedsMin + '+ beds');
            if (c.bathsMin) parts.push(c.bathsMin + '+ baths');
            if (c.neighborhoods && c.neighborhoods.length > 0) {
                parts.push(c.neighborhoods.length === 1 ? c.neighborhoods[0] : c.neighborhoods.length + ' neighborhoods');
            }
            if (c.sqftMin) parts.push(c.sqftMin + '+ sqft');

            summary.innerHTML = parts.length > 0
                ? '<p class="text-xs text-blue-700"><i class="fas fa-search mr-1"></i> <strong>Criteria:</strong> ' + escapeHtml(parts.join(' | ')) + '</p>'
                : '<p class="text-xs text-blue-700"><i class="fas fa-info-circle mr-1"></i> Current search criteria will be saved.</p>';
        }

        /** Map activeSearchCriteria → API criteria format */
        function _criteriaToApiFormat(c) {
            if (!c) return { listing_type: 'sale' };
            // Building tab doesn't have its own type — default to 'sale' but the _search_tab
            // preserves the original tab so loadSavedSearch restores it correctly
            return {
                listing_type: c.searchTab === 'rent' ? 'rental' : 'sale',
                min_price: c.priceMin || undefined,
                max_price: c.priceMax || undefined,
                min_beds: c.bedsMin != null ? c.bedsMin : undefined,
                max_beds: c.bedsMax != null ? c.bedsMax : undefined,
                min_baths: c.bathsMin || undefined,
                max_baths: c.bathsMax || undefined,
                min_sqft: c.sqftMin || undefined,
                max_sqft: c.sqftMax || undefined,
                min_rooms: c.roomsMin || undefined,
                max_rooms: c.roomsMax || undefined,
                neighborhoods: c.neighborhoods && c.neighborhoods.length > 0 ? c.neighborhoods : undefined,
                borough: c.borough || undefined,
                zip: c.zip || undefined,
                status: c.statuses && c.statuses.length > 0 ? c.statuses : undefined,
                property_type: c.ownership && c.ownership.length > 0 ? c.ownership : undefined,
                address: c.address || undefined,
                listing_id: c.rlsId || undefined,
                // Building-specific
                min_year: c.yearMin || undefined,
                max_year: c.yearMax || undefined,
                min_floors: c.floorsMin || undefined,
                max_floors: c.floorsMax || undefined,
                min_units: c.unitsMin || undefined,
                max_units: c.unitsMax || undefined,
                building_name: c.buildingName || undefined,
                // Date ranges
                date_from: c.dateFrom || undefined,
                date_to: c.dateTo || undefined,
                date_type: c.dateActivityType || undefined,
                close_date_from: c.soldDateFrom || c.contractDateFrom || undefined,
                close_date_to: c.soldDateTo || c.contractDateTo || undefined,
                // View state
                _search_tab: c.searchTab || 'sale',
            };
        }

        /** Restore API criteria → form fields and re-run search */
        function _criteriaToFormFields(criteria) {
            if (!criteria) return;

            // Set search tab
            var tab = criteria._search_tab || (criteria.listing_type === 'rental' ? 'rent' : 'sale');
            if (typeof toggleSearchTab === 'function') {
                toggleSearchTab(tab);
            } else {
                currentSearchTab = tab;
            }

            // Determine element ID prefix based on tab
            var prefix = tab === 'rent' ? 'rental' : 'sale';

            // Price
            _setSelectValue(prefix === 'rental' ? 'rentalMinRent' : 'saleMinPrice', criteria.min_price);
            _setSelectValue(prefix === 'rental' ? 'rentalMaxRent' : 'saleMaxPrice', criteria.max_price);

            // Beds
            _setSelectValue(prefix + 'MinBeds', criteria.min_beds);
            _setSelectValue(prefix + 'MaxBeds', criteria.max_beds);

            // Baths
            _setSelectValue(prefix + 'MinBaths', criteria.min_baths);
            _setSelectValue(prefix + 'MaxBaths', criteria.max_baths);

            // Rooms
            _setSelectValue(prefix + 'MinRooms', criteria.min_rooms);
            _setSelectValue(prefix + 'MaxRooms', criteria.max_rooms);

            // Sqft
            _setSelectValue(prefix + 'MinSqft', criteria.min_sqft);
            _setSelectValue(prefix + 'MaxSqft', criteria.max_sqft);

            // Address
            var addrId = tab === 'rent' ? 'rentalSearchAddress' : tab === 'building' ? 'buildingSearchAddress' : 'saleSearchAddress';
            var addrEl = document.getElementById(addrId);
            if (addrEl && criteria.address) addrEl.value = criteria.address;

            // Zip
            var zipId = tab === 'rent' ? 'rentalQuickZip' : tab === 'building' ? 'buildingQuickZip' : 'saleQuickZip';
            var zipEl = document.getElementById(zipId);
            if (zipEl && criteria.zip) zipEl.value = criteria.zip;

            // RLS ID
            var rlsId = tab === 'rent' ? 'rentalQuickRls' : tab === 'building' ? 'buildingQuickRls' : 'saleQuickRls';
            var rlsEl = document.getElementById(rlsId);
            if (rlsEl && criteria.listing_id) rlsEl.value = criteria.listing_id;

            // Neighborhoods
            if (criteria.neighborhoods && criteria.neighborhoods.length > 0 && typeof selectNeighborhood === 'function') {
                var tagsId = typeof _resolveActiveNeighborhoodTagsId === 'function' ? _resolveActiveNeighborhoodTagsId() : 'saleNeighborhoodTags';
                criteria.neighborhoods.forEach(function(n) {
                    var borough = typeof _findBoroughForNeighborhood === 'function' ? _findBoroughForNeighborhood(n) : '';
                    selectNeighborhood(n, borough, !borough, '', tagsId);
                });
            }

            // Building-specific fields
            if (tab === 'building' || criteria.min_year || criteria.max_year) {
                _setSelectValue('buildingMinYear', criteria.min_year);
                _setSelectValue('buildingMaxYear', criteria.max_year);
                _setSelectValue('buildingMinUnits', criteria.min_units);
                _setSelectValue('buildingMaxUnits', criteria.max_units);
                _setSelectValue('buildingMinFloors', criteria.min_floors);
                _setSelectValue('buildingMaxFloors', criteria.max_floors);
            }

            // Restore date range pickers
            var drpPrefix = tab === 'rent' ? 'rental' : 'sale';
            if (criteria.date_from || criteria.date_to) {
                var drpName = drpPrefix + 'ListedUpdated';
                _setDrpDates(drpName, criteria.date_from, criteria.date_to);
                // Also set the activity type dropdown (Listed/Updated)
                if (criteria.date_type) {
                    var actEl = document.getElementById(drpPrefix === 'rental' ? 'rentalListingActivityType' : 'saleListingActivityType');
                    if (actEl) actEl.value = criteria.date_type;
                }
            }
            if (criteria.close_date_from || criteria.close_date_to) {
                var soldDrpName = drpPrefix + (drpPrefix === 'rental' ? 'RentedDate' : 'SoldDate');
                _setDrpDates(soldDrpName, criteria.close_date_from, criteria.close_date_to);
            }

            // Restore status checkboxes
            if (criteria.status && Array.isArray(criteria.status) && criteria.status.length > 0) {
                // Map saved statuses back to checkbox data-value attributes
                var statusReverseMap = {
                    'ACTIVE': 'Active', 'COMING_SOON': 'ComingSoon', 'PENDING': 'Pending',
                    'CLOSED': 'Closed', 'WITHDRAWN': 'Withdrawn', 'CANCELED': 'Canceled',
                    'EXPIRED': 'Expired', 'HOLD': 'Hold'
                };
                // First uncheck all status checkboxes in the active form
                var activeForm = document.getElementById(tab === 'rent' ? 'searchBasicModeRental' : 'searchBasicMode');
                if (activeForm) {
                    activeForm.querySelectorAll('[data-field="MlsStatus"]').forEach(function(cb) { cb.checked = false; });
                }
                // Then check the saved ones
                criteria.status.forEach(function(s) {
                    var resoVal = statusReverseMap[s] || s;
                    var cb = activeForm ? activeForm.querySelector('[data-field="MlsStatus"][data-value="' + resoVal + '"]') : null;
                    if (cb) cb.checked = true;
                });
            }

            // Restore ownership checkboxes
            if (criteria.property_type && Array.isArray(criteria.property_type) && criteria.property_type.length > 0) {
                var ownerForm = document.getElementById(tab === 'rent' ? 'searchBasicModeRental' : 'searchBasicMode');
                if (ownerForm) {
                    ownerForm.querySelectorAll('[data-field="CommonInterest"]').forEach(function(cb) { cb.checked = false; });
                    criteria.property_type.forEach(function(pt) {
                        var cb = ownerForm.querySelector('[data-field="CommonInterest"][data-value="' + pt + '"]');
                        if (!cb) cb = ownerForm.querySelector('[data-field="CommonInterest"][value="' + pt + '"]');
                        if (cb) cb.checked = true;
                    });
                }
            }
        }

        /** Helper: set a <select> value, trying exact match then closest */
        function _setSelectValue(elementId, value) {
            if (value == null) return;
            var el = document.getElementById(elementId);
            if (!el) return;
            // Try exact match
            for (var i = 0; i < el.options.length; i++) {
                if (el.options[i].value == value) {
                    el.selectedIndex = i;
                    return;
                }
            }
            // Try closest match for numeric selects
            var numVal = Number(value);
            if (!isNaN(numVal)) {
                var best = 0, bestDiff = Infinity;
                for (var j = 0; j < el.options.length; j++) {
                    var optVal = Number(el.options[j].value);
                    if (!isNaN(optVal) && Math.abs(optVal - numVal) < bestDiff) {
                        bestDiff = Math.abs(optVal - numVal);
                        best = j;
                    }
                }
                if (bestDiff < Infinity) el.selectedIndex = best;
            }
        }

        /** Helper: programmatically set a date range picker's dates */
        function _setDrpDates(drpName, fromStr, toStr) {
            var wrapper = document.querySelector('[data-drp="' + drpName + '"]');
            if (!wrapper) return;

            // Convert ISO date (YYYY-MM-DD) or MM/DD/YYYY to MM/DD/YYYY
            function toMDY(str) {
                if (!str) return null;
                // Already MM/DD/YYYY?
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
                // ISO YYYY-MM-DD
                var parts = str.split('-');
                if (parts.length === 3) return parts[1] + '/' + parts[2] + '/' + parts[0];
                return null;
            }

            var fromMDY = toMDY(fromStr);
            var toMDY2 = toMDY(toStr);

            if (fromMDY) {
                wrapper.setAttribute('data-from', fromMDY);
                if (toMDY2) wrapper.setAttribute('data-to', toMDY2);

                // Update the visible trigger text
                var trigger = wrapper.querySelector('.drp-trigger');
                if (trigger) {
                    var textEl = trigger.querySelector('.drp-text');
                    var clearBtn = trigger.querySelector('.drp-clear');
                    if (textEl) {
                        textEl.textContent = fromMDY + (toMDY2 ? ' - ' + toMDY2 : '');
                        textEl.classList.add('has-value');
                    }
                    if (clearBtn) clearBtn.style.display = '';
                }
            }
        }

        function closeSaveSearchModal() {
            document.getElementById('saveSearchModal').classList.add('hidden');
        }

        // ESC key to close save-search modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var sm = document.getElementById('saveSearchModal');
                if (sm && !sm.classList.contains('hidden')) { closeSaveSearchModal(); return; }
            }
        });

        function saveCurrentSearch() {
            var name = document.getElementById('savedSearchName').value;
            var notes = document.getElementById('savedSearchNotes').value;
            var clientId = document.getElementById('savedSearchClientId').value;
            var alertFreq = document.getElementById('savedSearchAlertFreq').value;

            if (!name) {
                showToast('Please enter a search name.', 'warning');
                return;
            }

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available. Please refresh.', 'error');
                return;
            }

            var criteria = _criteriaToApiFormat(activeSearchCriteria);

            var payload = {
                name: name,
                criteria: criteria,
                lead_id: clientId || null,
                alert_frequency: alertFreq || null,
                alert_enabled: !!alertFreq,
            };

            MallanAPI.savedSearches.create(payload).then(function(result) {
                document.getElementById('savedSearchName').value = '';
                document.getElementById('savedSearchNotes').value = '';
                document.getElementById('savedSearchClientId').selectedIndex = 0;
                document.getElementById('savedSearchAlertFreq').selectedIndex = 0;
                closeSaveSearchModal();
                populateSavedSearchList();

                var msg = 'Search "' + name + '" saved!';
                if (clientId) msg += ' Assigned to client.';
                if (alertFreq) msg += ' ' + alertFreq.charAt(0).toUpperCase() + alertFreq.slice(1) + ' alerts enabled.';
                showToast(msg, 'success');
            }).catch(function(err) {
                showToast('Failed to save search: ' + err.message, 'error');
            });
        }

        function loadSavedSearch(searchId) {
            document.getElementById('savedSearchDropdown').classList.add('hidden');

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available', 'error');
                return;
            }

            MallanAPI.savedSearches.get(searchId).then(function(search) {
                if (!search || !search.criteria) {
                    showToast('Saved search has no criteria', 'warning');
                    return;
                }

                // Clear current form
                if (typeof clearSearchForm === 'function') clearSearchForm();

                // Restore form fields from saved criteria
                _criteriaToFormFields(search.criteria);

                showToast('Loaded: ' + search.name, 'success');

                // Re-run the search with restored criteria
                setTimeout(function() {
                    if (typeof performSearch === 'function') performSearch();
                }, 100);
            }).catch(function(err) {
                showToast('Failed to load search: ' + err.message, 'error');
            });
        }

        function deleteSavedSearch(searchId) {
            if (!confirm('Delete this saved search?')) return;

            if (typeof MallanAPI === 'undefined') {
                showToast('API not available', 'error');
                return;
            }

            MallanAPI.savedSearches.delete(searchId).then(function() {
                populateSavedSearchList();
                showToast('Search deleted', 'success');
            }).catch(function(err) {
                showToast('Failed to delete: ' + err.message, 'error');
            });
        }

        function reviseSearch() {
            backToSearch();
        }

        function populateSavedSearchesSection() {
            var container = document.getElementById('savedSearchesSectionList');
            if (!container || typeof MallanAPI === 'undefined') return;
            container.innerHTML = '<div class="p-6 text-center text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>Loading...</div>';
            MallanAPI.savedSearches.list().then(function(result) {
                var searches = result.savedSearches || [];
                if (searches.length === 0) {
                    container.innerHTML = '<div class="p-8 text-center text-gray-400">No saved searches yet. Run a search and click Save.</div>';
                    return;
                }
                var E = typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s||''); };
                container.innerHTML = searches.map(function(s) {
                    var dateStr = s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '';
                    var alertBadge = s.alert_enabled ? '<span class="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full ml-1">'+E(s.alert_frequency||'alert')+'</span>' : '';
                    var clientBadge = s.lead_id ? '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-full ml-1"><i class="fas fa-user text-[8px]"></i></span>' : '';
                    return '<div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50">' +
                        '<div class="flex-1 min-w-0">' +
                        '<div class="font-semibold text-sm text-gray-900 truncate">'+E(s.name)+alertBadge+clientBadge+'</div>' +
                        '<div class="text-xs text-gray-400">'+dateStr+'</div>' +
                        '</div>' +
                        '<div class="flex items-center gap-2 ml-3">' +
                        '<button onclick="loadSavedSearch(\''+E(s.id)+'\')" class="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700">Run</button>' +
                        '<button onclick="deleteSavedSearch(\''+E(s.id)+'\')" class="p-1 text-red-400 hover:bg-red-50 rounded"><i class="fas fa-trash text-xs"></i></button>' +
                        '</div></div>';
                }).join('');
            }).catch(function() {
                container.innerHTML = '<div class="p-6 text-center text-red-400">Failed to load. Check your connection.</div>';
            });
        }

