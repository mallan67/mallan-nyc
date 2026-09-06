        function updateRentalAgentList(type) {
            if (type !== 'tenant') return;
            var companySelect = document.getElementById('rentalTenantAgentCompany');
            var agentSelect = document.getElementById('rentalTenantAgent');
            if (!companySelect || !agentSelect) return;
            var company = companySelect.value;
            agentSelect.innerHTML = '<option value="">-- Select Agent --</option>';
            document.getElementById('rentalTenantAgentInfo').style.display = 'none';
            if (!company) return;
            // Roster lookup integration point: GET /api/crm/agents?company=<company>
            // Populates agentSelect with the company's licensed agents. No
            // hardcoded agent fixtures.
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

            // The canonical (server) status is shown from the save response; the browser does not translate.
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
                if (cdomEl) cdomEl.textContent = days; // CDOM equals DOM here; cross-relist tracking lives server-side in lib/compliance/dom-tracker.ts
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
                showToast('Please fill in all required fields before submitting.', 'warning');
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

