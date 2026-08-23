        // ═══════════════════════════════════════════════════════════════════════════════
        // SELECTION FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        function toggleListingSelection(listingId) {
            var index = searchResultsState.selectedListings.indexOf(listingId);
            if (index > -1) {
                searchResultsState.selectedListings.splice(index, 1);
            } else {
                searchResultsState.selectedListings.push(listingId);
            }
            localStorage.setItem('selectedListings', JSON.stringify(searchResultsState.selectedListings));
            updateSelectionActionBar();
            renderSearchResults();
        }

        function toggleSelectAll() {
            var checkbox = document.getElementById('selectAllCheckbox') || document.getElementById('gridSelectAll');
            if (checkbox && checkbox.checked) {
                searchResultsState.selectedListings = getFilteredListings().map(l => l.id);
            } else {
                searchResultsState.selectedListings = [];
            }
            localStorage.setItem('selectedListings', JSON.stringify(searchResultsState.selectedListings));
            updateSelectionActionBar();
            renderSearchResults();
        }

        function updateSelectionActionBar() {
            var count = searchResultsState.selectedListings.length;
            document.querySelectorAll('#selectedCount').forEach(function(el) { el.textContent = count; });
            document.querySelectorAll('#selectedCountDisplay').forEach(function(el) { el.textContent = count; });

            var actionBar = document.getElementById('selectionActionBar');
            if (actionBar) {
                actionBar.style.display = count > 0 ? 'flex' : 'none';
            }
            // Update selection pill color
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

        function openWorkWithSelected() {
            if (searchResultsState.selectedListings.length === 0) {
                showToast('Please select at least one listing.', 'warning');
                return;
            }
            // If a client is already selected, save directly to their portfolio
            if (currentWorkspaceClientId) {
                saveSelectedToClient();
            } else {
                // Open the customer dropdown to pick a client first
                var dd = document.getElementById('workWithCustomerDropdown2') || document.getElementById('workWithCustomerDropdown');
                if (dd) {
                    dd.classList.toggle('hidden');
                    populateClientList(dd.querySelector('[id^="clientList"]'));
                }
            }
        }

        function removeFromResults() {
            // Validate: only keep IDs that exist in the current result set
            var currentIds = (searchResultsState.filteredListings || listings).map(function(l) { return l.id; });
            searchResultsState.selectedListings = searchResultsState.selectedListings.filter(function(id) {
                return currentIds.indexOf(id) !== -1;
            });

            if (searchResultsState.selectedListings.length === 0) {
                showToast('Please select at least one listing to remove.', 'warning');
                return;
            }

            var removeCount = searchResultsState.selectedListings.length;
            var removeSet = {};
            searchResultsState.selectedListings.forEach(function(id) { removeSet[id] = true; });

            // Actually remove from the filtered results (or create filtered copy of listings)
            var source = searchResultsState.filteredListings || listings.slice();
            searchResultsState.filteredListings = source.filter(function(l) {
                return !removeSet[l.id];
            });

            // Store removed IDs so they stay removed during this session
            var removedKey = 'removedListings_' + LOGGED_IN_AGENT.id;
            var alreadyRemoved = JSON.parse(localStorage.getItem(removedKey)) || [];
            searchResultsState.selectedListings.forEach(function(id) {
                if (alreadyRemoved.indexOf(id) === -1) alreadyRemoved.push(id);
            });
            localStorage.setItem(removedKey, JSON.stringify(alreadyRemoved));

            // Clear selection and re-render
            searchResultsState.selectedListings = [];
            localStorage.setItem('selectedListings', JSON.stringify([]));
            searchResultsState.currentPage = 1;
            updateSelectionActionBar();
            renderSearchResults();

            // Update total count display
            var totalEl = document.getElementById('totalResults');
            if (totalEl) totalEl.textContent = (searchResultsState.filteredListings || []).length + ' Results';

            if (typeof showFlagToast === 'function') {
                showFlagToast('Removed ' + removeCount + ' listing' + (removeCount !== 1 ? 's' : '') + ' from results');
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT WORKFLOW FUNCTIONS
        // ═══════════════════════════════════════════════════════════════════════════════

        function toggleWorkWithCustomer(event) {
            // Close all customer dropdowns first
            var dd1 = document.getElementById('workWithCustomerDropdown');
            var dd2 = document.getElementById('workWithCustomerDropdown2');

            // Find which dropdown is closest to the click
            var btn = event ? event.currentTarget || event.target : null;
            var targetDD = dd1;
            if (btn) {
                var parent = btn.closest('.relative');
                if (parent) {
                    var localDD = parent.querySelector('[id^="workWithCustomerDropdown"]');
                    if (localDD) targetDD = localDD;
                }
            }

            // Close the other dropdown
            if (targetDD === dd1 && dd2) dd2.classList.add('hidden');
            if (targetDD === dd2 && dd1) dd1.classList.add('hidden');

            // Toggle target dropdown
            var isOpening = targetDD.classList.contains('hidden');
            targetDD.classList.toggle('hidden');

            // Populate client list when opening
            if (isOpening) {
                populateClientList(targetDD.querySelector('[id^="clientList"]'));
            }
        }

        function buildClientListHTML(clients) {
            if (clients.length === 0) {
                return '<div class="px-4 py-3 text-sm text-gray-400 text-center">No clients found</div>';
            }
            return clients.map(function(client) {
                var typeColor = client.type === 'buyer' ? 'bg-blue-100 text-blue-700' : client.type === 'seller' ? 'bg-green-100 text-green-700' : client.type === 'renter' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600';
                return '<button onclick="selectClient(\'' + client.id + '\')" class="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm flex items-center gap-3 transition-colors">' +
                    '<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">' + (client.name.charAt(0) || '?') + '</div>' +
                    '<div class="flex-1 min-w-0"><div class="font-medium text-gray-900 truncate">' + client.name + '</div>' +
                    '<div class="text-xs text-gray-500 truncate">' + (client.email || '') + '</div></div>' +
                    '<span class="px-1.5 py-0.5 text-[10px] font-medium rounded ' + typeColor + ' flex-shrink-0">' + (client.type || 'Client') + '</span>' +
                    '</button>';
            }).join('');
        }

        function populateClientList(container) {
            // Populate both client lists
            var containers = container ? [container] : [document.getElementById('clientList'), document.getElementById('clientList2')];
            var html = buildClientListHTML(searchResultsState.clients);
            containers.forEach(function(c) { if (c) c.innerHTML = html; });
        }

        function selectClient(clientId) {
            var client = searchResultsState.clients.find(function(c) { return c.id === clientId; });
            if (client) {
                currentWorkspaceClientId = clientId;
                // Update button labels to show selected client
                document.querySelectorAll('[onclick*="toggleWorkWithCustomer"]').forEach(function(btn) {
                    btn.innerHTML = '<i class="fas fa-user-check text-green-600"></i> ' + client.name + ' <i class="fas fa-chevron-down text-xs"></i>';
                });
                // Show "Save to Client" button
                var saveBtn = document.getElementById('saveToClientBtn');
                if (saveBtn) {
                    saveBtn.classList.remove('hidden');
                    saveBtn.classList.add('flex');
                    document.getElementById('saveToClientName').textContent = client.name.split(' ')[0];
                }
                // Re-render to show like/dislike icons on cards
                if (typeof renderSearchResults === 'function') renderSearchResults();
            }
            // Close all dropdowns
            document.querySelectorAll('[id^="workWithCustomerDropdown"]').forEach(function(d) { d.classList.add('hidden'); });
        }

        function filterClients(event) {
            var input = event ? event.target : document.getElementById('clientSearchInput');
            var search = (input ? input.value : '').toLowerCase();
            var filtered = searchResultsState.clients.filter(function(c) {
                return c.name.toLowerCase().includes(search) || (c.email && c.email.toLowerCase().includes(search));
            });
            // Update the client list that's in the same dropdown as the input
            var dropdown = input ? input.closest('[id^="workWithCustomerDropdown"]') : null;
            var container = dropdown ? dropdown.querySelector('[id^="clientList"]') : document.getElementById('clientList');
            if (container) container.innerHTML = buildClientListHTML(filtered);
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // SAVE SELECTED LISTINGS TO CLIENT PORTFOLIO
        // REBNY RLS compliance: I-29 Owner Opt-Out gate, I-28 address suppression,
        // localStorage scoped by LOGGED_IN_AGENT.id + clientId
        // ═══════════════════════════════════════════════════════════════════════════════

        function saveSelectedToClient() {
            var clientId = currentWorkspaceClientId;
            if (!clientId) { showToast('Please select a client first.', 'warning'); return; }
            if (searchResultsState.selectedListings.length === 0) { showToast('No listings selected.', 'warning'); return; }

            var client = customerDB[clientId];
            if (!client) { showToast('Client not found.', 'error'); return; }

            // Initialize portfolio if needed
            if (!client.portfolio) client.portfolio = { listings: [] };

            var added = 0;
            var already = 0;
            var blocked = 0;

            searchResultsState.selectedListings.forEach(function(listingId) {
                var listing = listings.find(function(l) { return l.id === listingId; });
                if (!listing) return;

                // REBNY RLS Distribution Gates: Block non-displayable listings from client portfolio
                var listingPerm = listing.permissions || {};
                if (listingPerm.ownerOptOut === true) {
                    console.warn('[REBNY RLS] Blocked: Listing ' + listingId + ' — Owner Opt-Out (Permissions=OwnerOptOut)');
                    blocked++;
                    return;
                }
                if (listing.internetDisplayYN === false) {
                    console.warn('[REBNY RLS] Blocked: Listing ' + listingId + ' — InternetEntireListingDisplayYN=false');
                    blocked++;
                    return;
                }

                var exists = client.portfolio.listings.some(function(pl) { return pl.id === listingId; });
                if (!exists) {
                    client.portfolio.listings.push({
                        id: listingId,
                        // Store ONLY safe Cotality fields — never store prohibited RLS fields
                        address: listing.addressDisplayYN !== false ? listing.address : 'Address Upon Request',
                        addedDate: new Date().toISOString(),
                        status: 'new', // new, liked, disliked, viewed
                        addedBy: LOGGED_IN_AGENT.id,
                        notes: ''
                    });
                    added++;
                } else {
                    already++;
                }
            });

            // Save to localStorage (agent-scoped per REBNY brokerage rules)
            var key = 'clientPortfolio_' + LOGGED_IN_AGENT.id + '_' + clientId;
            localStorage.setItem(key, JSON.stringify(client.portfolio));

            // Log activity
            if (typeof logClientActivity === 'function') {
                logClientActivity(clientId, 'portfolio', 'Added ' + added + ' listing(s) to portfolio');
            }

            // Feedback
            var msg = added + ' listing(s) saved to ' + client.name + "'s portfolio";
            if (already > 0) msg += ' (' + already + ' already existed)';
            if (blocked > 0) msg += ' (' + blocked + ' blocked — Owner Opt-Out)';
            if (typeof showToast === 'function') {
                showToast(msg, added > 0 ? 'success' : 'info');
            } else {
                alert(msg);
            }
        }

        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT FEEDBACK: LIKE / DISLIKE ON LISTING CARDS
        // Agent marks on behalf of client. Stored per-agent-per-client in localStorage.
        // Like/dislike is agent-entered metadata (not RLS data) — no Cotality tagging required.
        // ═══════════════════════════════════════════════════════════════════════════════

        function markClientFeedback(listingId, feedback) {
            if (!currentWorkspaceClientId) return;
            var client = customerDB[currentWorkspaceClientId];
            if (!client) return;
            if (!client.portfolio) client.portfolio = { listings: [] };

            var pl = client.portfolio.listings.find(function(p) { return p.id === listingId; });
            if (pl) {
                // Toggle: clicking same feedback again resets to 'new'
                pl.status = (pl.status === feedback) ? 'new' : feedback;
            } else {
                // Not in portfolio yet — add it with feedback (auto-save)
                var listing = listings.find(function(l) { return l.id === listingId; });
                var feedbackPerm = listing ? (listing.permissions || {}) : {};
                if (listing && (feedbackPerm.ownerOptOut === true || listing.internetDisplayYN === false)) {
                    console.warn('[REBNY RLS] Blocked: Listing ' + listingId + ' — Owner Opt-Out or InternetEntireListingDisplayYN=false');
                    return;
                }
                client.portfolio.listings.push({
                    id: listingId,
                    address: listing && listing.addressDisplayYN !== false ? listing.address : 'Address Upon Request',
                    addedDate: new Date().toISOString(),
                    status: feedback,
                    addedBy: LOGGED_IN_AGENT.id,
                    notes: ''
                });
            }
            // Save to localStorage (agent-scoped)
            var key = 'clientPortfolio_' + LOGGED_IN_AGENT.id + '_' + currentWorkspaceClientId;
            localStorage.setItem(key, JSON.stringify(client.portfolio));
            // Re-render to update icon states
            if (typeof renderSearchResults === 'function') renderSearchResults();
        }

        // Helper: get client feedback status for a listing
        function getClientFeedbackStatus(listingId) {
            if (!currentWorkspaceClientId) return null;
            var client = customerDB[currentWorkspaceClientId];
            if (!client || !client.portfolio) return null;
            var pl = client.portfolio.listings.find(function(p) { return p.id === listingId; });
            return pl ? pl.status : null;
        }
