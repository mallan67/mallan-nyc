        function validateDates(formType) {
            var errors = [];
            var getVal = (id) => document.getElementById(id)?.value || '';

            if (formType === 'sale') {
                var listingDate = getVal('saleDateListed') || getVal('saleExclusiveStart');
                var contractDate = getVal('saleContractSignedDate');
                var soldDate = getVal('saleSoldDate');
                var expirationDate = getVal('saleExclusiveExpires');

                // D1: CloseDate >= PurchaseContractDate
                if (soldDate && contractDate && new Date(soldDate) < new Date(contractDate)) {
                    errors.push('Sold Date cannot be before Contract Signed Date');
                }
                // D2: PurchaseContractDate >= ListingContractDate
                if (contractDate && listingDate && new Date(contractDate) < new Date(listingDate)) {
                    errors.push('Contract Signed Date cannot be before Date Listed');
                }
                // D3: ExpirationDate <= 10 years from now
                if (expirationDate) {
                    var maxExpire = new Date();
                    maxExpire.setFullYear(maxExpire.getFullYear() + 10);
                    if (new Date(expirationDate) > maxExpire) {
                        errors.push('Expiration Date cannot be more than 10 years from today');
                    }
                }
                // D4: ListingContractDate not > 1 year from now
                if (listingDate) {
                    var maxListing = new Date();
                    maxListing.setFullYear(maxListing.getFullYear() + 1);
                    if (new Date(listingDate) > maxListing) {
                        errors.push('Date Listed cannot be more than 1 year from today');
                    }
                }
            } else {
                var listingDate = getVal('rentalDateListed');
                var leasedDate = getVal('rentalLeasedDate');
                var expirationDate = getVal('rentalExclusiveExpires');

                if (leasedDate && listingDate && new Date(leasedDate) < new Date(listingDate)) {
                    errors.push('Leased Date cannot be before Date Listed');
                }
                if (expirationDate) {
                    var maxExpire = new Date();
                    maxExpire.setFullYear(maxExpire.getFullYear() + 10);
                    if (new Date(expirationDate) > maxExpire) {
                        errors.push('Expiration Date cannot be more than 10 years from today');
                    }
                }
            }

            return errors;
        }

        // Wire date validation to submit functions
        var origValidateSalesListing = window.validateSalesListing;
        window.validateSalesListing = function() {
            var dateErrors = validateDates('sale');
            if (dateErrors.length > 0) {
                alert('Date Validation Errors:\n\n' + dateErrors.join('\n'));
                return false;
            }
            // Also run content scanners
            var contentViolations = scanAllContent('sale');
            if (contentViolations.length > 0) {
                var proceed = confirm('REBNY Content Violations Found:\n\n' + contentViolations.map(v => '• ' + v.type + ': "' + v.match + '"').join('\n') + '\n\nSubmitting with violations may result in fines. Continue anyway?');
                if (!proceed) return false;
            }
            return origValidateSalesListing ? origValidateSalesListing() : true;
        };

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  COMING SOON ENFORCEMENT (Sale Only — 14 Day Max)             ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Enhance handleSaleComingSoon to add 14-day enforcement
        var origHandleSaleComingSoon = window.handleSaleComingSoon;
        window.handleSaleComingSoon = function() {
            if (origHandleSaleComingSoon) origHandleSaleComingSoon();

            var statusEl = document.getElementById('saleStatus');
            if (!statusEl || statusEl.value !== 'ComingSoon') return;

            // Show ActivationDate field if Coming Soon
            var activationField = document.getElementById('saleActivationDateContainer');
            if (!activationField) {
                // Create ActivationDate field dynamically
                var dateSection = document.getElementById('saleFirstShowingDate')?.closest('.grid');
                if (dateSection) {
                    var container = document.createElement('div');
                    container.id = 'saleActivationDateContainer';
                    container.innerHTML = `
                        <label class="block text-sm font-medium text-gray-700 mb-2">Activation Date <span class="text-red-500">*</span></label>
                        <input type="date" id="saleActivationDate" class="w-full border rounded-lg px-4 py-2 text-sm" required>
                        <p class="text-xs text-amber-600 mt-1"><i class="fas fa-clock mr-1"></i>Must be within 14 days. REBNY Coming Soon max: 14 calendar days.</p>
                    `;
                    dateSection.appendChild(container);

                    // Add 14-day max validation
                    var activationInput = container.querySelector('#saleActivationDate');
                    var today = new Date();
                    var maxDate = new Date(today);
                    maxDate.setDate(maxDate.getDate() + 14);
                    activationInput.min = today.toISOString().split('T')[0];
                    activationInput.max = maxDate.toISOString().split('T')[0];
                    activationInput.addEventListener('change', function() {
                        var selected = new Date(this.value);
                        if (selected > maxDate) {
                            alert('Coming Soon period cannot exceed 14 calendar days per REBNY rules.');
                            this.value = maxDate.toISOString().split('T')[0];
                        }
                    });
                }
            }
            if (activationField) activationField.style.display = '';
        };

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  STATUS STATE MACHINE (Valid Transitions)                      ║
        // ╚══════════════════════════════════════════════════════════════════╝

        var STATUS_TRANSITIONS = {
            'Draft':         ['Future', 'Active', 'ComingSoon'],
            'Future':        ['Active', 'ComingSoon', 'Draft'],
            'ComingSoon':    ['Active', 'Withdrawn', 'Expired'],
            'Active':        ['OfferOut', 'OfferThruUs', 'BackOnMarket', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired'],
            'BackOnMarket':  ['OfferOut', 'OfferThruUs', 'ContractOut', 'COThruUs', 'TempOffMarket', 'Withdrawn', 'Expired'],
            'OfferOut':      ['Active', 'OfferAccepted', 'OAThruUs', 'BackOnMarket'],
            'OfferThruUs':   ['Active', 'OfferAccepted', 'OAThruUs', 'BackOnMarket'],
            'OfferAccepted': ['ContractOut', 'COThruUs', 'Active', 'BackOnMarket'],
            'OAThruUs':      ['ContractOut', 'COThruUs', 'Active', 'BackOnMarket'],
            'ContractOut':   ['ContractSigned', 'ContractSignedThruUs', 'Active', 'BackOnMarket'],
            'COThruUs':      ['ContractSigned', 'ContractSignedThruUs', 'Active', 'BackOnMarket'],
            'ContractSigned':['BoardApproved', 'Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
            'ContractSignedThruUs': ['BoardApproved', 'Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
            'BoardApproved': ['Sold', 'SoldThruUs', 'Active', 'BackOnMarket'],
            'Sold':          [],
            'SoldThruUs':    [],
            'Withdrawn':     ['Active', 'Draft'],
            'Cancelled':     ['Draft'],
            'PermOffMarket': [],
            'TempOffMarket': ['Active', 'BackOnMarket'],
            'Expired':       ['Active', 'Draft'],
            // Rental-specific
            'AppOut':        ['Active', 'AppAccepted', 'BackOnMarket'],
            'AppThruUs':     ['Active', 'AppAccepted', 'BackOnMarket'],
            'AppAccepted':   ['Leased', 'LeasedThruUs', 'Active', 'BackOnMarket'],
            'Leased':        [],
            'LeasedThruUs':  [],
        };

        // CRM → provider status / property-type mapping copy: REMOVED (Packet 2 closure). The SERVER owns the Mallan form → Cotality vocabulary conversion
        // (lib/crm/listing-form-mapping.ts); the browser sends Mallan form state only.

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  RENTAL TENANT'S AGENT LOOKUP (Item 33)                        ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Reuse sale agent database for rental tenant agent lookup
        function updateRentalAgentList(type) {
            if (type !== 'tenant') return;
            var companySelect = document.getElementById('rentalTenantAgentCompany');
            var agentSelect = document.getElementById('rentalTenantAgent');
            if (!companySelect || !agentSelect) return;
            var company = companySelect.value;
            agentSelect.innerHTML = '<option value="">-- Select Agent --</option>';
            document.getElementById('rentalTenantAgentInfo').style.display = 'none';
            if (!company) return;
            // Mock agent data (same as sale form — production will use REBNY API)
            var agents = {
                mallan: [{ name: 'Demo Agent', id: 'MALR-001', phone: '555-000-0000', email: 'demo@example.com', license: 'DEMO-LIC-001' }],
                compass: [{ name: 'Agent Smith', id: 'COMP-101', phone: '212-555-0101', email: 'smith@compass.com', license: '10401234567' }],
                douglas: [{ name: 'Agent Jones', id: 'DELI-201', phone: '212-555-0201', email: 'jones@elliman.com', license: '10402345678' }],
                corcoran: [{ name: 'Agent Brown', id: 'CORC-301', phone: '212-555-0301', email: 'brown@corcoran.com', license: '10403456789' }],
            };
            var list = agents[company] || [{ name: 'Sample Agent', id: company.toUpperCase() + '-001', phone: '212-555-0000', email: 'agent@example.com', license: '1040000000' }];
            list.forEach(a => {
                var opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                opt.dataset.phone = a.phone;
                opt.dataset.email = a.email;
                opt.dataset.license = a.license;
                agentSelect.appendChild(opt);
            });
        }

        function populateRentalAgentInfo(type) {
            if (type !== 'tenant') return;
            var agentSelect = document.getElementById('rentalTenantAgent');
            var selected = agentSelect?.options[agentSelect.selectedIndex];
            if (!selected || !selected.value) {
                document.getElementById('rentalTenantAgentInfo').style.display = 'none';
                return;
            }
            document.getElementById('rentalTenantAgentId').textContent = selected.value;
            document.getElementById('rentalTenantAgentPhone').textContent = selected.dataset.phone || '--';
            document.getElementById('rentalTenantAgentEmail').textContent = selected.dataset.email || '--';
            document.getElementById('rentalTenantAgentLicense').textContent = selected.dataset.license || '--';
            document.getElementById('rentalTenantAgentInfo').style.display = 'block';
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  OPT-OUT FORM VISIBILITY TOGGLE                                ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Show/hide opt-out form upload based on listing type
        function toggleOptOutFormVisibility(formType) {
            var isOptOut = formType === 'sale'
                ? document.querySelector('input[name="saleListingType"][value="OwnerOptOut"]')?.checked
                : document.querySelector('input[name="rentalListingType"][value="OwnerOptOut"]')?.checked;
            var section = document.getElementById(formType + 'OptOutFormSection');
            if (section) section.style.display = isOptOut ? '' : 'none';
        }

        // Wire to existing listing type change handlers
        var origHandleSaleLTChange = window.handleSaleListingTypeChange;
        window.handleSaleListingTypeChange = function(value) {
            if (origHandleSaleLTChange) origHandleSaleLTChange(value);
            toggleOptOutFormVisibility('sale');
        };
        var origHandleRentalLTChange = window.handleRentalListingTypeChange;
        window.handleRentalListingTypeChange = function(value) {
            if (origHandleRentalLTChange) origHandleRentalLTChange(value);
            toggleOptOutFormVisibility('rental');
        };

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  FURNISHED CONDITIONAL FIELDS (Item 44)                         ║
        // ╚══════════════════════════════════════════════════════════════════╝

        function toggleFurnishedFields() {
            var val = document.getElementById('rentalFurnished')?.value;
            var details = document.getElementById('rentalFurnishedDetails');
            if (details) details.style.display = (val === 'Furnished' || val === 'Partially') ? '' : 'none';
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  DOM TRACKING & STATUS TIMESTAMP (Items 59-60)                  ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Update DOM counters and status displays when status changes
        function updateStatusTracking(formType) {
            var now = new Date();
            var timestamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
                              now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // Update status change timestamp
            var tsEl = document.getElementById(formType + 'StatusChangeTimestamp');
            if (tsEl) tsEl.textContent = timestamp;

            // Update RESO MlsStatus display
            var statusEl = document.getElementById(formType + 'Status');
            var resoEl = document.getElementById(formType + 'ResoMlsStatus');
            if (statusEl && resoEl) resoEl.textContent = 'set by server on save';

            // Compute DOM (days since first Active)
            var activeKey = formType + '_firstActiveDate';
            var statusVal = statusEl?.value || '';
            if (['Active', 'BackOnMarket'].includes(statusVal) && !window[activeKey]) {
                window[activeKey] = now;
            }
            if (window[activeKey]) {
                var days = Math.floor((now - window[activeKey]) / (1000 * 60 * 60 * 24));
                var domEl = document.getElementById(formType + 'DaysOnMarket');
                if (domEl) domEl.textContent = days;
                var cdomEl = document.getElementById(formType + 'CumulativeDaysOnMarket');
                if (cdomEl) cdomEl.textContent = days; // In mockup, same as DOM; production tracks across relists
            }
        }

        // Wire to existing validateStatusChange — augment it
        var origValidateStatusChange = window.validateStatusChange;
        window.validateStatusChange = function(formType) {
            if (origValidateStatusChange) origValidateStatusChange(formType);
            updateStatusTracking(formType);
        };

        // Update character count for sale description
        function updateSaleCharCount() {
            var textarea = document.getElementById('saleDescription');
            if (!textarea) return;
            var counter = textarea.closest('.mb-4, div')?.querySelector('.text-xs.text-gray-500');
            if (counter && counter.textContent.includes('/')) {
                counter.textContent = textarea.value.length + ' / 5000 characters';
            }
        }

        // Validate Sales Listing form
        function validateSalesListing() {
            var requiredFields = document.querySelectorAll('#add-sale-tab [required]');
            var isValid = true;
            var firstInvalid = null;

            requiredFields.forEach(field => {
                if (!field.value || field.value.trim() === '') {
                    isValid = false;
                    field.classList.add('border-red-500', 'bg-red-50');
                    if (!firstInvalid) firstInvalid = field;
                } else {
                    field.classList.remove('border-red-500', 'bg-red-50');
                }
            });

            if (!isValid && firstInvalid) {
                firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstInvalid.focus();
                alert('Please fill in all required fields before submitting.');
            }

            return isValid;
        }

        function addOpenHouse() {
            var openHousesList = document.getElementById('openHousesList') || document.getElementById('saleOpenHouseList');
            if (!openHousesList) return;

            // Remove placeholder text if it exists
            var placeholder = openHousesList.querySelector('p');
            if (placeholder) {
                openHousesList.innerHTML = '';
            }

            var openHouseHTML = `
                <div class="border border-gray-300 rounded-lg p-4 bg-gray-50">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="text-sm font-semibold text-gray-900">Open House</h4>
                        <button onclick="this.closest('.border').remove()" class="text-red-600 hover:text-red-700 text-xs">
                            <i class="fas fa-times"></i> Remove
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Date <span class="text-red-500">*</span></label>
                            <input type="date" class="w-full border rounded-lg px-3 py-2 text-sm" required>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Start Time <span class="text-red-500">*</span></label>
                            <input type="time" class="w-full border rounded-lg px-3 py-2 text-sm" required>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">End Time <span class="text-red-500">*</span></label>
                            <input type="time" class="w-full border rounded-lg px-3 py-2 text-sm" required>
                        </div>
                    </div>
                    <div class="flex gap-4 text-sm">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="openHouseType${Date.now()}" class="w-4 h-4" checked> Public
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="openHouseType${Date.now()}" class="w-4 h-4"> Broker Only
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="w-4 h-4"> By Appointment
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="w-4 h-4"> Virtual
                        </label>
                    </div>
                </div>
            `;

            openHousesList.insertAdjacentHTML('beforeend', openHouseHTML);
        }

