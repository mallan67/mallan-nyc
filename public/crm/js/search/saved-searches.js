
        // SAVED SEARCH FUNCTIONS — API-backed (MallanAPI.savedSearches)
        //
        // Search Consolidation Packet 2. A saved search is the parameters of a Search that
        // EXECUTED: `_serverSearch` records the executor's parameters on every successful
        // response in `window._lastExecutedSearch`, and saving posts exactly those under the
        // versioned contract { criteria_version: 2, params }. This module holds NO vocabulary
        // of its own — no key allow-list, no re-encoding, no alert-engine mirror. Loading a
        // saved search restores the form from the stored parameters and PROVES the restore by
        // re-serializing the form and comparing; any difference is refused by name before a
        // search runs, so a saved search can never execute broader than it was saved.
        function toggleSavedSearchDropdown() {
            var dropdown = document.getElementById('savedSearchDropdown');
            if (dropdown) dropdown.classList.toggle('hidden');
            if (dropdown && !dropdown.classList.contains('hidden')) populateSavedSearchList();
        }
        function _fmtWhen(iso) {
            if (!iso) return '';
            var d = new Date(iso);
            return isNaN(d.getTime()) ? '' : d.toLocaleString();
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
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-semibold rounded-full">' + escapeHtml(search.alert_frequency) + '</span>'
                        : '';
                    var clientBadge = search.lead_id
                        ? '<span class="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-semibold rounded-full"><i class="fas fa-user text-[7px]"></i></span>'
                        : '';
                    // Count badge: the stored total from the Search executor (stamped when the
                    // search was saved, executed or alerted) with the time it was taken. Never a
                    // second matcher. Loading the search re-asks the executor.
                    var countBadge = '';
                    if (search.criteria_state === 'invalid') {
                        var why = 'This saved search cannot be executed exactly: ' + ((search.invalid_reasons || []).join('; ') || 'stored criteria are not executable') + '. Recreate it from a new Search.';
                        countBadge = '<span class="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-semibold rounded-full" title="' + escapeHtml(why) + '">not executable</span>';
                    } else if (typeof search.result_count === 'number') {
                        var when = _fmtWhen(search.last_run);
                        var title = 'Search executor total' + (when ? ' at ' + when : '') + (search.criteria_state === 'migrated' ? ' · legacy criteria converted exactly' : '') + '. Load to run again.';
                        countBadge = '<span class="ml-1 px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-semibold rounded-full" title="' + escapeHtml(title) + '">' + escapeHtml(String(search.result_count)) + '</span>';
                    } else {
                        countBadge = '<span class="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-semibold rounded-full" title="No count yet — load the search to run it.">not run</span>';
                    }
                    var dateStr = search.updated_at ? new Date(search.updated_at).toLocaleDateString() : '';
                    return '<div class="flex items-center justify-between px-3 py-2 hover:bg-gray-100">'
                        + '<button onclick="loadSavedSearch(\'' + escapeHtml(String(search.id)) + '\')" class="text-left flex-1">'
                        + '<div class="font-medium text-sm">' + escapeHtml(search.name) + alertBadge + clientBadge + countBadge + '</div>'
                        + '<div class="text-xs text-gray-500">' + dateStr + '</div>'
                        + '</button>'
                        + '<button onclick="deleteSavedSearch(\'' + escapeHtml(String(search.id)) + '\')" class="p-1 text-red-500 hover:bg-red-100 rounded" aria-label="Delete">'
                        + '<i class="fas fa-trash text-xs"></i>'
                        + '</button>'
                        + '</div>';
                }).join('');
            }).catch(function(err) {
                console.error('[SavedSearches] Failed to load:', err);
                container.innerHTML = '<p class="p-3 text-sm text-red-500 text-center">Failed to load saved searches</p>';
            });
        }
        /** The last search the executor actually ran (recorded by _serverSearch). */
        function _executedSearch() {
            return (window._lastExecutedSearch && window._lastExecutedSearch.params) ? window._lastExecutedSearch : null;
        }
        function openSaveSearchModal() {
            document.getElementById('savedSearchDropdown').classList.add('hidden');
            document.getElementById('saveSearchModal').classList.remove('hidden');
            _populateSaveSearchClientDropdown();
            _showCriteriaSummary();
            _refreshSaveState();
        }
        /** Saving needs an executed search; say so instead of inventing criteria. */
        function _refreshSaveState() {
            var sel = document.getElementById('savedSearchAlertFreq');
            var hint = document.getElementById('savedSearchAlertGateHint');
            var executed = _executedSearch();
            if (executed) {
                if (sel) { sel.disabled = false; sel.title = ''; }
                if (hint) { hint.textContent = ''; hint.classList.add('hidden'); }
                return;
            }
            var msg = 'Run a search first. A saved search is exactly what the Search executor ran, so alerts and counts always match it.';
            if (sel) { sel.value = ''; sel.disabled = true; sel.title = msg; }
            if (hint) { hint.textContent = msg; hint.classList.remove('hidden'); }
        }
        function _populateSaveSearchClientDropdown() {
            var select = document.getElementById('savedSearchClientId');
            if (!select || typeof MallanAPI === 'undefined') return;
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
        /** Human summary of executed parameters (display only; the parameters themselves are saved). */
        function _describeParams(p) {
            var parts = [];
            if (!p) return parts;
            parts.push(p.type === 'rental' ? 'Rental' : 'Sale');
            if (p.status) parts.push('Status: ' + p.status.split(',').join(', '));
            if (p.minPrice || p.maxPrice) parts.push('$' + (p.minPrice ? Number(p.minPrice).toLocaleString() : '0') + ' - $' + (p.maxPrice ? Number(p.maxPrice).toLocaleString() : 'Any'));
            if (p.minBeds != null || p.maxBeds != null) parts.push((p.minBeds != null ? p.minBeds : 'any') + (p.maxBeds != null ? '-' + p.maxBeds : '+') + ' beds');
            if (p.minBaths || p.maxBaths) parts.push((p.minBaths || 'any') + (p.maxBaths ? '-' + p.maxBaths : '+') + ' baths');
            if (p.borough) parts.push(p.borough.split(',').join(', '));
            if (p.neighborhood) { var n = p.neighborhood.split(','); parts.push(n.length === 1 ? n[0] : n.length + ' neighborhoods'); }
            if (p.ownership) parts.push(p.ownership.split(',').join(', '));
            if (p.StructureType) parts.push(p.StructureType.split(',').join(', '));
            if (p.zip) parts.push('ZIP ' + p.zip);
            if (p.listingId) parts.push('ID ' + p.listingId);
            if (p.sort) parts.push('sort ' + p.sort);
            return parts;
        }
        function _showCriteriaSummary() {
            var summary = document.getElementById('savedSearchCriteriaSummary');
            if (!summary) return;
            var executed = _executedSearch();
            if (!executed) {
                summary.innerHTML = '<p class="text-xs text-amber-700"><i class="fas fa-info-circle mr-1"></i> No executed search to save yet.</p>';
                return;
            }
            var parts = _describeParams(executed.params);
            var total = typeof executed.total === 'number' ? ' <span class="text-gray-500">(' + executed.total.toLocaleString() + ' results)</span>' : '';
            summary.innerHTML = '<p class="text-xs text-blue-700"><i class="fas fa-search mr-1"></i> <strong>Executed search:</strong> ' + escapeHtml(parts.join(' | ')) + total + '</p>';
        }
        function closeSaveSearchModal() {
            var modal = document.getElementById('saveSearchModal');
            if (modal) modal.classList.add('hidden');
        }
        function saveCurrentSearch() {
            var name = document.getElementById('savedSearchName').value;
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
            var executed = _executedSearch();
            if (!executed) {
                showToast('Run a search first — a saved search is exactly what the Search executor ran.', 'warning');
                return;
            }
            var payload = {
                name: name,
                criteria: { criteria_version: 2, params: executed.params },
                lead_id: clientId || null,
                alert_frequency: alertFreq || null,
                alert_enabled: !!alertFreq,
            };
            MallanAPI.savedSearches.create(payload).then(function(result) {
                document.getElementById('savedSearchName').value = '';
                var notes = document.getElementById('savedSearchNotes'); if (notes) notes.value = '';
                document.getElementById('savedSearchClientId').selectedIndex = 0;
                document.getElementById('savedSearchAlertFreq').selectedIndex = 0;
                closeSaveSearchModal();
                populateSavedSearchList();
                var msg = 'Search "' + name + '" saved';
                if (result && typeof result.result_count === 'number') msg += ' (' + result.result_count.toLocaleString() + ' results)';
                else if (result && result.count_status === 'unavailable') msg += ' (count unavailable right now)';
                msg += '.';
                if (clientId) msg += ' Assigned to client.';
                if (alertFreq) msg += ' ' + alertFreq.charAt(0).toUpperCase() + alertFreq.slice(1) + ' alerts enabled.';
                showToast(msg, 'success');
            }).catch(function(err) {
                showToast('Failed to save search: ' + err.message, 'error');
            });
        }
        // ── Restore: stored parameters → form controls, then PROVE parity ───────
        function _splitCsv(v) {
            return v == null ? [] : String(v).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        }
        function _checkTokens(scope, selectors, tokens, label, issues) {
            if (!scope) { if (tokens.length) issues.push(label + ': no active form to restore into'); return; }
            selectors.forEach(function(sel) { scope.querySelectorAll(sel).forEach(function(cb) { cb.checked = false; }); });
            tokens.forEach(function(tok) {
                var want = String(tok).replace(/"/g, '\\"');
                var cb = null;
                for (var i = 0; i < selectors.length && !cb; i++) cb = scope.querySelector(selectors[i] + '[data-value="' + want + '"]:not([data-sub-status])');
                if (!cb) { issues.push(label + ' = ' + tok + ': no control for this value'); return; }
                if (cb.disabled) { issues.push(label + ' = ' + tok + ': control is disabled'); return; }
                cb.checked = true;
            });
        }
        /** Drive the form from executed parameters. Returns the list of what could NOT be restored. */
        function _paramsToFormFields(p) {
            var issues = [];
            if (!p) return ['no parameters'];
            var tab = p.type === 'rental' ? 'rent' : 'sale';
            if (typeof toggleSearchTab === 'function') toggleSearchTab(tab); else currentSearchTab = tab;
            var prefix = tab === 'rent' ? 'rental' : 'sale';
            _setSelectValue(prefix === 'rental' ? 'rentalMinRent' : 'saleMinPrice', p.minPrice);
            _setSelectValue(prefix === 'rental' ? 'rentalMaxRent' : 'saleMaxPrice', p.maxPrice);
            _setSelectValue(prefix + 'MinBeds', p.minBeds);
            _setSelectValue(prefix + 'MaxBeds', p.maxBeds);
            _setSelectValue(prefix + 'MinBaths', p.minBaths);
            _setSelectValue(prefix + 'MaxBaths', p.maxBaths);
            var zipEl = document.getElementById(prefix + 'QuickZip');
            if (p.zip) { if (zipEl) zipEl.value = p.zip; else issues.push('zip: no control'); }
            var rlsEl = document.getElementById(prefix + 'QuickRls');
            if (p.listingId) { if (rlsEl) rlsEl.value = p.listingId; else issues.push('listingId: no control'); }
            var tagsId = typeof _resolveActiveNeighborhoodTagsId === 'function' ? _resolveActiveNeighborhoodTagsId() : prefix + 'NeighborhoodTags';
            if (p.neighborhood || p.borough) {
                if (typeof selectNeighborhood !== 'function') issues.push('neighborhood/borough: chip control unavailable');
                else {
                    _splitCsv(p.borough).forEach(function(b) { selectNeighborhood(b, '', true, '', tagsId); });
                    _splitCsv(p.neighborhood).forEach(function(n) {
                        var borough = typeof _findBoroughForNeighborhood === 'function' ? (_findBoroughForNeighborhood(n) || '') : '';
                        selectNeighborhood(n, borough, false, '', tagsId);
                    });
                }
            }
            var statusScope = document.getElementById(prefix + 'StatusOptions') || document.getElementById('searchBasicMode');
            _checkTokens(statusScope, ['[data-field="MlsStatus"]'], _splitCsv(p.status), 'status', issues);
            var basicForm = document.getElementById('searchBasicMode');
            var typeTokens = _splitCsv(p.ownership).concat(_splitCsv(p.StructureType));
            _checkTokens(basicForm, ['[data-field="CommonInterest"]', '[data-criterion="StructureType"]', '[data-field="StructureType"]'], typeTokens, 'ownership / building type', issues);
            if (p.sort) {
                if (p.sort === 'newest') { searchResultsState.sortField = 'listedDate'; searchResultsState.sortOrder = 'desc'; }
                else if (p.sort === 'price_asc') { searchResultsState.sortField = 'price'; searchResultsState.sortOrder = 'asc'; }
                else if (p.sort === 'price_desc') { searchResultsState.sortField = 'price'; searchResultsState.sortOrder = 'desc'; }
                else issues.push('sort = ' + p.sort + ': unknown sort');
            }
            return issues;
        }
        function _normParam(k, v) {
            var parts = _splitCsv(v).map(function(s) { var n = Number(s); return (s !== '' && !isNaN(n)) ? String(n) : s; });
            return parts.sort().join(',');
        }
        /** Re-serialize the restored form and compare with the stored parameters. Any difference is a refusal. */
        function _restoreParity(saved) {
            if (typeof window.serializeSearchCriteria !== 'function' || typeof collectSearchCriteria !== 'function') return [{ key: 'form', saved: '', form: 'serializer unavailable' }];
            var ser = window.serializeSearchCriteria(collectSearchCriteria());
            if (ser.refused && ser.refused.length) return ser.refused.map(function(r) { return { key: r, saved: '', form: 'refused' }; });
            var form = ser.params || {};
            if (typeof _serverSortKey === 'function') form.sort = _serverSortKey();
            var keys = {};
            Object.keys(saved).forEach(function(k) { keys[k] = 1; });
            Object.keys(form).forEach(function(k) { keys[k] = 1; });
            var diffs = [];
            Object.keys(keys).forEach(function(k) {
                if (k === 'limit' || k === 'skip' || k === 'offset') return;
                var a = _normParam(k, saved[k]), b = _normParam(k, form[k]);
                if (k === 'sort' && !saved[k]) return;
                if (a !== b) diffs.push({ key: k, saved: a, form: b });
            });
            return diffs;
        }
        function loadSavedSearch(searchId) {
            document.getElementById('savedSearchDropdown').classList.add('hidden');
            if (typeof MallanAPI === 'undefined') {
                showToast('API not available', 'error');
                return;
            }
            MallanAPI.savedSearches.get(searchId).then(function(search) {
                if (!search) { showToast('Saved search not found', 'warning'); return; }
                if (search.criteria_state === 'invalid' || !search.executable_params) {
                    showToast('This saved search cannot be executed exactly: ' + ((search.invalid_reasons || []).join('; ') || 'stored criteria are not executable') + '. Recreate it from a new Search.', 'error');
                    return;
                }
                var params = search.executable_params;
                if (typeof clearSearchForm === 'function') clearSearchForm();
                var issues = _paramsToFormFields(params);
                window._lastRestoreIssues = issues;
                if (issues.length) {
                    showToast('Saved search not loaded — the form cannot reproduce it exactly: ' + issues.join('; '), 'error');
                    return;
                }
                var diffs = _restoreParity(params);
                if (diffs.length) {
                    showToast('Saved search not run — the restored form differs from what was saved: ' + diffs.map(function(d) { return d.key + ' (saved "' + d.saved + '", form "' + d.form + '")'; }).join('; '), 'error');
                    return;
                }
                showToast('Loaded: ' + search.name + (search.criteria_state === 'migrated' ? ' (legacy criteria converted exactly)' : ''), 'success');
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
                showToast('Saved search deleted', 'success');
            }).catch(function(err) {
                showToast('Failed to delete: ' + err.message, 'error');
            });
        }
        /** Helper: set a <select> value, exact match or (numeric) closest option. Parity is proven afterwards. */
        function _setSelectValue(elementId, value) {
            if (value == null || value === '') return;
            var el = document.getElementById(elementId);
            if (!el) return;
            for (var i = 0; i < el.options.length; i++) {
                if (el.options[i].value == value) {
                    el.selectedIndex = i;
                    return;
                }
            }
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
        function reviseSearch() {
            backToSearch();
        }
