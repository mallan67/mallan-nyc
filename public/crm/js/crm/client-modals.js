        // ═══════════════════════════════════════════════════════════════════════════════
        // CLIENT MODAL FUNCTIONS (Enhanced 4-Section)
        // ═══════════════════════════════════════════════════════════════════════════════

        var currentWorkspaceClientId = null;
        var _commentingListingId = null;

        function openAddClientModal(editId) {
            var dd = document.getElementById('workWithCustomerDropdown');
            if (dd) dd.classList.add('hidden');
            var modal = document.getElementById('addClientModal');
            // Move modal to body level so it's visible from any section tab
            // (fixes: modal nested inside section-main which has display:none on other tabs)
            if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
            var titleEl = document.getElementById('addClientModalTitle');
            var btnEl = document.getElementById('saveClientBtn');
            document.getElementById('editClientId').value = editId || '';

            if (editId && customerDB[editId]) {
                titleEl.textContent = 'Edit Client';
                btnEl.textContent = 'Save Changes';
                prefillClientModal(customerDB[editId]);
            } else {
                titleEl.textContent = 'Add New Client';
                btnEl.textContent = 'Add Client';
                clearClientModal();
            }
            modal.classList.remove('hidden');
        }

        function closeAddClientModal() {
            document.getElementById('addClientModal').classList.add('hidden');
            document.getElementById('editClientId').value = '';
        }

        function toggleModalSection(id) {
            var sec = document.getElementById(id);
            var icon = document.getElementById(id + '-icon');
            if (sec.classList.contains('hidden')) {
                sec.classList.remove('hidden');
                if (icon) icon.style.transform = 'rotate(180deg)';
            } else {
                sec.classList.add('hidden');
                if (icon) icon.style.transform = '';
            }
        }

        // ── Delivery Schedule Label Logic ──
        // Dynamically update "of the Month" / "of the Week" and show/hide schedule row
        function updateDeliveryScheduleUI(freqName, daySelectId, labelId) {
            var freq = '';
            var checked = document.querySelector('input[name="' + freqName + '"]:checked');
            if (checked) freq = checked.value;
            var daySelect = document.getElementById(daySelectId);
            var label = document.getElementById(labelId);
            var scheduleRow = daySelect ? daySelect.closest('.border-t') : null;
            if (freq === 'realtime' || freq === 'daily') {
                if (scheduleRow) scheduleRow.style.display = 'none';
            } else {
                if (scheduleRow) scheduleRow.style.display = '';
                if (freq === 'weekly') {
                    if (label) label.textContent = 'of the Week';
                    // Update options to days of week
                    if (daySelect) {
                        daySelect.innerHTML = '<option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option><option value="thu">Thursday</option><option value="fri">Friday</option><option value="sat">Saturday</option><option value="sun">Sunday</option>';
                    }
                } else {
                    if (label) label.textContent = 'of the Month';
                    // Restore day-of-month options
                    if (daySelect) {
                        daySelect.innerHTML = '<option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option><option value="4">4th</option><option value="5">5th</option><option value="10">10th</option><option value="15">15th</option><option value="20">20th</option><option value="25">25th</option>';
                    }
                }
            }
        }
        // Attach listeners for agent frequency pills
        document.querySelectorAll('input[name="newClientAgentFreq"]').forEach(function(r) {
            r.addEventListener('change', function() { updateDeliveryScheduleUI('newClientAgentFreq', 'newClientAgentDeliveryDay', 'agentDeliveryLabel'); });
        });
        // Attach listeners for customer frequency pills
        document.querySelectorAll('input[name="newClientAlertFreq"]').forEach(function(r) {
            r.addEventListener('change', function() { updateDeliveryScheduleUI('newClientAlertFreq', 'newClientCustomerDeliveryDay', 'customerDeliveryLabel'); });
        });

        function addCoViewerRow() {
            var list = document.getElementById('coViewersList');
            var idx = list.children.length;
            var row = document.createElement('div');
            row.className = 'grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 p-2 bg-gray-50 rounded-lg relative';
            row.innerHTML = '<input type="text" placeholder="Name" class="cv-name border rounded px-2 py-1.5 text-sm col-span-2 sm:col-span-1">' +
                '<input type="email" placeholder="Email" class="cv-email border rounded px-2 py-1.5 text-sm">' +
                '<input type="tel" placeholder="Phone" class="cv-phone border rounded px-2 py-1.5 text-sm">' +
                '<div class="flex items-center gap-1"><select class="cv-relation border rounded px-2 py-1.5 text-sm flex-1"><option>Spouse</option><option>Partner</option><option>Parent</option><option>Co-Buyer</option><option>Attorney</option><option>Other</option></select>' +
                '<button type="button" onclick="this.closest(\'.grid\').remove()" class="p-1 text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button></div>';
            list.appendChild(row);
        }

        function clearClientModal() {
            document.getElementById('newClientName').value = '';
            document.getElementById('newClientEmail').value = '';
            document.getElementById('newClientPhone').value = '';
            var typeRadios = document.querySelectorAll('input[name="newClientType"]');
            typeRadios.forEach(function(r) { r.checked = r.value === 'buyer'; });
            document.getElementById('newClientInvite').checked = false;
            document.getElementById('newClientMinPrice').value = '';
            document.getElementById('newClientMaxPrice').value = '';
            document.getElementById('newClientMinBeds').value = '';
            document.getElementById('newClientMaxBeds').value = '';
            document.getElementById('newClientMinBaths').value = '';
            document.getElementById('newClientMaxBaths').value = '';
            document.querySelectorAll('#newClientPropertyTypes input').forEach(function(cb) { cb.checked = false; });
            document.getElementById('newClientNeighborhoods').value = '';
            document.getElementById('newClientMoveIn').value = '';
            document.querySelectorAll('#newClientMustHaves input').forEach(function(cb) { cb.checked = false; });
            var notesEl = document.getElementById('newClientNotes');
            if (notesEl) notesEl.value = '';
            document.getElementById('coViewersList').innerHTML = '';
            // New Matches settings
            var alertEn = document.getElementById('newClientAlertEnabled');
            if (alertEn) alertEn.value = 'true';
            var priceEl = document.getElementById('newClientPriceAlertEnabled');
            if (priceEl) priceEl.checked = true;
            document.querySelectorAll('input[name="newClientCheckFreq"]').forEach(function(r) { r.checked = r.value === '5min'; });
            document.querySelectorAll('input[name="newClientEmailTemplate"]').forEach(function(r) { r.checked = r.value === 'detailed'; });
            document.querySelectorAll('input[name="newClientAgentFreq"]').forEach(function(r) { r.checked = r.value === 'monthly'; });
            document.querySelectorAll('input[name="newClientAlertFreq"]').forEach(function(r) { r.checked = r.value === 'monthly'; });
            var agentDay = document.getElementById('newClientAgentDeliveryDay');
            if (agentDay) agentDay.value = '1';
            var custDay = document.getElementById('newClientCustomerDeliveryDay');
            if (custDay) custDay.value = '1';
            // Reset delivery schedule labels and visibility
            updateDeliveryScheduleUI('newClientAgentFreq', 'newClientAgentDeliveryDay', 'agentDeliveryLabel');
            updateDeliveryScheduleUI('newClientAlertFreq', 'newClientCustomerDeliveryDay', 'customerDeliveryLabel');
            // Closed alert defaults
            var closedEn = document.getElementById('newClientClosedAlertEnabled');
            if (closedEn) closedEn.checked = false;
            var closedType = document.getElementById('newClientClosedAlertType');
            if (closedType) closedType.value = 'newsletter';
            var closedFreq = document.getElementById('newClientClosedAlertFreq');
            if (closedFreq) closedFreq.value = 'quarterly';
            var closedSec = document.getElementById('closedAlertSettingsSection');
            if (closedSec) closedSec.classList.add('hidden');
            // Collapse all sections
            ['prefsSection', 'coViewersSection', 'alertsSection'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.classList.add('hidden');
                var icon = document.getElementById(id + '-icon');
                if (icon) icon.style.transform = '';
            });
        }

        function prefillClientModal(c) {
            // Reset all collapsible sections to hidden FIRST
            // (prevents toggle-based expansion from going wrong on repeat opens)
            ['prefsSection', 'coViewersSection', 'alertsSection'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.classList.add('hidden');
                var icon = document.getElementById(id + '-icon');
                if (icon) icon.style.transform = '';
            });
            document.getElementById('newClientName').value = c.name || '';
            document.getElementById('newClientEmail').value = c.email || '';
            document.getElementById('newClientPhone').value = c.phone || '';
            var ct = c.clientType || c.type.toLowerCase();
            document.querySelectorAll('input[name="newClientType"]').forEach(function(r) { r.checked = r.value === ct; });
            document.getElementById('newClientInvite').checked = c.inviteStatus === 'active' || c.inviteStatus === 'accepted';
            // Preferences
            if (c.preferences) {
                var p = c.preferences;
                document.getElementById('newClientMinPrice').value = p.minPrice ? '$' + Number(p.minPrice).toLocaleString() : '';
                document.getElementById('newClientMaxPrice').value = p.maxPrice ? '$' + Number(p.maxPrice).toLocaleString() : '';
                document.getElementById('newClientMinBeds').value = p.minBeds || '';
                document.getElementById('newClientMaxBeds').value = p.maxBeds || '';
                document.getElementById('newClientMinBaths').value = p.minBaths || '';
                document.getElementById('newClientMaxBaths').value = p.maxBaths || '';
                document.querySelectorAll('#newClientPropertyTypes input').forEach(function(cb) { cb.checked = (p.propertyTypes || []).includes(cb.value); });
                document.getElementById('newClientNeighborhoods').value = (p.neighborhoods || []).join(', ');
                document.getElementById('newClientMoveIn').value = p.moveInDate || '';
                document.querySelectorAll('#newClientMustHaves input').forEach(function(cb) { cb.checked = (p.mustHaves || []).includes(cb.value); });
                var notesEl = document.getElementById('newClientNotes');
                if (notesEl) notesEl.value = p.notes || '';
                // Expand prefs section
                toggleModalSection('prefsSection');
            }
            // Co-viewers
            document.getElementById('coViewersList').innerHTML = '';
            if (c.coViewers && c.coViewers.length) {
                c.coViewers.forEach(function(cv) {
                    addCoViewerRow();
                    var rows = document.getElementById('coViewersList').children;
                    var lastRow = rows[rows.length - 1];
                    lastRow.querySelector('.cv-name').value = cv.name || '';
                    lastRow.querySelector('.cv-email').value = cv.email || '';
                    lastRow.querySelector('.cv-phone').value = cv.phone || '';
                    lastRow.querySelector('.cv-relation').value = cv.relation || 'Spouse';
                });
                toggleModalSection('coViewersSection');
            }
            // New Matches / Listing delivery
            if (c.alertSettings) {
                var a = c.alertSettings;
                document.getElementById('newClientAlertEnabled').value = a.enabled ? 'true' : 'false';
                var priceAlertEl = document.getElementById('newClientPriceAlertEnabled');
                if (priceAlertEl) priceAlertEl.checked = a.priceAlerts !== false;
                document.querySelectorAll('input[name="newClientCheckFreq"]').forEach(function(r) { r.checked = r.value === (a.checkFreq || '5min'); });
                document.querySelectorAll('input[name="newClientEmailTemplate"]').forEach(function(r) { r.checked = r.value === (a.emailTemplate || 'detailed'); });
                document.querySelectorAll('input[name="newClientAgentFreq"]').forEach(function(r) { r.checked = r.value === (a.agentFreq || 'monthly'); });
                document.querySelectorAll('input[name="newClientAlertFreq"]').forEach(function(r) { r.checked = r.value === (a.frequency || 'monthly'); });
                // Update schedule UI before setting day values (rebuilds options for weekly)
                updateDeliveryScheduleUI('newClientAgentFreq', 'newClientAgentDeliveryDay', 'agentDeliveryLabel');
                updateDeliveryScheduleUI('newClientAlertFreq', 'newClientCustomerDeliveryDay', 'customerDeliveryLabel');
                // Now set day values (after options are rebuilt)
                var agentDayEl = document.getElementById('newClientAgentDeliveryDay');
                if (agentDayEl) agentDayEl.value = a.agentDeliveryDay || '1';
                var custDayEl = document.getElementById('newClientCustomerDeliveryDay');
                if (custDayEl) custDayEl.value = a.customerDeliveryDay || '1';
                toggleModalSection('alertsSection');
            }
            // Closed alert settings
            if (c.clientStatus === 'closed' && c.closedAlertSettings) {
                var closedSec = document.getElementById('closedAlertSettingsSection');
                if (closedSec) closedSec.classList.remove('hidden');
                var closedEn = document.getElementById('newClientClosedAlertEnabled');
                if (closedEn) closedEn.checked = c.closedAlertSettings.enabled;
                var closedType = document.getElementById('newClientClosedAlertType');
                if (closedType) closedType.value = c.closedAlertSettings.type || 'newsletter';
                var closedFreq = document.getElementById('newClientClosedAlertFreq');
                if (closedFreq) closedFreq.value = c.closedAlertSettings.frequency || 'quarterly';
            } else {
                var closedSec = document.getElementById('closedAlertSettingsSection');
                if (closedSec) closedSec.classList.add('hidden');
            }
        }

        function saveNewClient() {
            var name = document.getElementById('newClientName').value.trim();
            var email = document.getElementById('newClientEmail').value.trim();
            var phone = document.getElementById('newClientPhone').value.trim();
            var editId = document.getElementById('editClientId').value;

            if (!name || !email) {
                showToast('Please fill in Name and Email (required fields)', 'warning');
                return;
            }

            var clientType = (document.querySelector('input[name="newClientType"]:checked') || {}).value || 'buyer';
            var typeMap = { buyer: 'Buyer', renter: 'Renter', seller: 'Seller', landlord: 'Landlord' };
            var colorMap = { buyer: 'blue', renter: 'green', seller: 'amber', landlord: 'purple' };

            // Gather preferences
            var selectedTypes = [];
            document.querySelectorAll('#newClientPropertyTypes input:checked').forEach(function(cb) { selectedTypes.push(cb.value); });
            var selectedMustHaves = [];
            document.querySelectorAll('#newClientMustHaves input:checked').forEach(function(cb) { selectedMustHaves.push(cb.value); });
            var neighborhoods = document.getElementById('newClientNeighborhoods').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

            var parseBudget = function(v) { return v ? Number(v.replace(/[^0-9.]/g, '')) || null : null; };
            var preferences = {
                propertyTypes: selectedTypes,
                neighborhoods: neighborhoods,
                minBeds: document.getElementById('newClientMinBeds').value || null,
                maxBeds: document.getElementById('newClientMaxBeds').value || null,
                minBaths: document.getElementById('newClientMinBaths').value || null,
                maxBaths: document.getElementById('newClientMaxBaths').value || null,
                minPrice: parseBudget(document.getElementById('newClientMinPrice').value),
                maxPrice: parseBudget(document.getElementById('newClientMaxPrice').value),
                moveInDate: document.getElementById('newClientMoveIn').value || '',
                mustHaves: selectedMustHaves,
                notes: (document.getElementById('newClientNotes') || {}).value || ''
            };

            // Gather co-viewers
            var coViewers = [];
            document.querySelectorAll('#coViewersList > div').forEach(function(row) {
                var cvName = row.querySelector('.cv-name').value.trim();
                if (cvName) {
                    coViewers.push({
                        name: cvName,
                        email: row.querySelector('.cv-email').value.trim(),
                        phone: row.querySelector('.cv-phone').value.trim(),
                        relation: row.querySelector('.cv-relation').value
                    });
                }
            });

            // New Matches / Listing delivery settings
            var alertSettings = {
                enabled: true,
                checkFreq: (document.querySelector('input[name="newClientCheckFreq"]:checked') || {}).value || '5min',
                emailTemplate: (document.querySelector('input[name="newClientEmailTemplate"]:checked') || {}).value || 'detailed',
                agentFreq: (document.querySelector('input[name="newClientAgentFreq"]:checked') || {}).value || 'monthly',
                agentDeliveryDay: document.getElementById('newClientAgentDeliveryDay') ? document.getElementById('newClientAgentDeliveryDay').value : '1',
                frequency: (document.querySelector('input[name="newClientAlertFreq"]:checked') || {}).value || 'monthly',
                customerDeliveryDay: document.getElementById('newClientCustomerDeliveryDay') ? document.getElementById('newClientCustomerDeliveryDay').value : '1',
                newListingAlerts: true,
                priceAlerts: document.getElementById('newClientPriceAlertEnabled') ? document.getElementById('newClientPriceAlertEnabled').checked : true
            };
            // Closed alert settings
            var closedAlertSettings = {
                enabled: document.getElementById('newClientClosedAlertEnabled') ? document.getElementById('newClientClosedAlertEnabled').checked : false,
                type: document.getElementById('newClientClosedAlertType') ? document.getElementById('newClientClosedAlertType').value : 'newsletter',
                frequency: document.getElementById('newClientClosedAlertFreq') ? document.getElementById('newClientClosedAlertFreq').value : 'quarterly'
            };

            var invited = document.getElementById('newClientInvite').checked;
            var budgetLabel = '';
            if (preferences.minPrice || preferences.maxPrice) {
                var isRental = clientType === 'renter';
                var fmt = function(v) { return isRental ? '$' + Number(v).toLocaleString() + '/mo' : '$' + (Number(v)/1000000).toFixed(0) + 'M'; };
                if (preferences.minPrice && preferences.maxPrice) budgetLabel = fmt(preferences.minPrice) + '-' + fmt(preferences.maxPrice).replace('$','');
                else if (preferences.minPrice) budgetLabel = fmt(preferences.minPrice) + '+';
                else budgetLabel = 'Up to ' + fmt(preferences.maxPrice);
            }

            var clientKey = editId || name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-+$/, '');
            var initials = name.split(' ').map(function(n) { return n[0]; }).join('').substring(0, 2).toUpperCase();

            if (editId && customerDB[editId]) {
                // Update existing
                var existing = customerDB[editId];
                existing.name = name;
                existing.initials = initials;
                existing.email = email;
                existing.phone = phone;
                existing.type = typeMap[clientType];
                existing.clientType = clientType;
                existing.color = colorMap[clientType];
                existing.budget = budgetLabel || existing.budget;
                existing.preferences = preferences;
                existing.coViewers = coViewers;
                existing.alertSettings = alertSettings;
                existing.closedAlertSettings = closedAlertSettings;
                if (invited && (existing.inviteStatus === 'not_invited' || existing.inviteStatus === 'sent')) existing.inviteStatus = 'accepted';
                existing.tags = neighborhoods.slice(0, 3);
            } else {
                // Create new
                customerDB[clientKey] = {
                    name: name, initials: initials, email: email, phone: phone || '',
                    type: typeMap[clientType], clientType: clientType,
                    budget: budgetLabel, color: colorMap[clientType],
                    agentId: LOGGED_IN_AGENT.id, agentName: LOGGED_IN_AGENT.name,
                    tags: neighborhoods.slice(0, 3),
                    preferences: preferences, coViewers: coViewers,
                    alertSettings: alertSettings,
                    closedAlertSettings: closedAlertSettings,
                    matchedListings: [], sendHistory: [], lastDelivery: null, nextDelivery: null,
                    clientStatus: 'active', closedDate: null, closedType: null, closedProperty: null,
                    portfolio: { picked: 0, liked: 0, disliked: 0, shown: 0, emailed: 0, newMatches: 0, listings: [] },
                    savedSearches: [], showings: [],
                    loginHistory: [], lastLogin: '', viewHistory: [],
                    inviteStatus: invited ? 'sent' : 'not_invited',
                    inviteSentDate: invited ? new Date().toISOString().slice(0, 10) : null,
                    inviteResendCount: 0,
                    inviteDate: new Date().toISOString().slice(0, 10),
                    lastActivity: new Date().toISOString().slice(0, 10)
                };
                searchResultsState.clients.push({ id: clientKey, name: name, email: email, type: typeMap[clientType] });
            }

            closeAddClientModal();

            // ── Save to API (real database) ──
            var nameParts = name.split(' ');
            var firstName = nameParts[0] || '';
            var lastName = nameParts.slice(1).join(' ') || '';

            if (editId) {
                // Update existing client via API
                fetch('/api/crm/clients/' + editId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        first_name: firstName,
                        last_name: lastName,
                        phone: phone,
                        portal_role: clientType,
                        roles: [clientType]
                    })
                }).then(function(r) { return r.json(); }).then(function(res) {
                    if (res.error) { showToast('Update failed: ' + res.error, 'error'); return; }
                    // Save preferences
                    if (neighborhoods.length > 0 || preferences.minPrice || preferences.maxPrice) {
                        fetch('/api/crm/clients/' + editId + '/preferences', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                property_types: preferences.propertyTypes,
                                neighborhoods: neighborhoods,
                                min_beds: preferences.minBeds ? parseInt(preferences.minBeds) : null,
                                max_beds: preferences.maxBeds ? parseInt(preferences.maxBeds) : null,
                                min_baths: preferences.minBaths ? parseInt(preferences.minBaths) : null,
                                max_baths: preferences.maxBaths ? parseInt(preferences.maxBaths) : null,
                                min_price: preferences.minPrice,
                                max_price: preferences.maxPrice,
                                must_haves: preferences.mustHaves,
                                notes: preferences.notes,
                                move_in_date: preferences.moveInDate || null
                            })
                        }).catch(function() {});
                    }
                    showToast('Client updated', 'success');
                    loadClientsFromAPI();
                }).catch(function(err) { showToast('Network error: ' + err.message, 'error'); });
            } else {
                // Create new client via API
                fetch('/api/crm/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        first_name: firstName,
                        last_name: lastName,
                        email: email,
                        phone: phone,
                        portal_role: clientType,
                        roles: [clientType],
                        source: 'manual'
                    })
                }).then(function(r) { return r.json(); }).then(function(res) {
                    if (res.error) { showToast('Failed: ' + res.error, 'error'); return; }
                    var newId = res.id;
                    // Save preferences for the new client
                    if (newId && (neighborhoods.length > 0 || preferences.minPrice || preferences.maxPrice)) {
                        fetch('/api/crm/clients/' + newId + '/preferences', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                property_types: preferences.propertyTypes,
                                neighborhoods: neighborhoods,
                                min_beds: preferences.minBeds ? parseInt(preferences.minBeds) : null,
                                max_beds: preferences.maxBeds ? parseInt(preferences.maxBeds) : null,
                                min_baths: preferences.minBaths ? parseInt(preferences.minBaths) : null,
                                max_baths: preferences.maxBaths ? parseInt(preferences.maxBaths) : null,
                                min_price: preferences.minPrice,
                                max_price: preferences.maxPrice,
                                must_haves: preferences.mustHaves,
                                notes: preferences.notes,
                                move_in_date: preferences.moveInDate || null
                            })
                        }).catch(function() {});
                    }
                    showToast('Client "' + name + '" added', 'success');
                    loadClientsFromAPI();
                }).catch(function(err) { showToast('Network error: ' + err.message, 'error'); });
            }
        }

        function editClientPreferences(clientId) {
            openAddClientModal(clientId);
        }
