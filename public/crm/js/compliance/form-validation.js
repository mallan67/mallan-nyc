        // ============================================================
        // AUTO-SAVE DRAFT SYSTEM
        // Saves form data to localStorage with debounce
        // ============================================================

        var autoSaveTimers = { sale: null, rental: null };

        function autoSaveDraft(formType) {
            clearTimeout(autoSaveTimers[formType]);
            autoSaveTimers[formType] = setTimeout(() => {
                performAutoSave(formType);
            }, 2000); // 2-second debounce
        }

        function performAutoSave(formType) {
            var indicator = document.getElementById(formType + 'AutoSaveIndicator');
            var textEl = document.getElementById(formType + 'AutoSaveText');
            if (indicator) {
                indicator.classList.remove('hidden');
                textEl.textContent = 'Saving...';
                indicator.classList.remove('text-green-600');
                indicator.classList.add('text-gray-400');
            }

            // Collect form data
            var formData = {};
            var containerId = formType === 'sale' ? 'add-sales-listing' : 'add-listing';
            var container = document.getElementById(containerId);
            if (!container) return;

            container.querySelectorAll('input, select, textarea').forEach(field => {
                var key = field.id || field.name;
                if (!key) return;
                if (field.type === 'radio') {
                    if (field.checked) formData[key] = field.value;
                } else if (field.type === 'checkbox') {
                    formData[key] = field.checked;
                } else {
                    formData[key] = field.value;
                }
            });

            formData._savedAt = new Date().toISOString();
            formData._formType = formType;

            try {
                localStorage.setItem('mallan_draft_' + formType, JSON.stringify(formData));
            } catch (e) {
                // Auto-save failed silently
            }

            // Update indicator
            setTimeout(() => {
                if (textEl) {
                    var now = new Date();
                    var timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    textEl.textContent = 'Draft saved ' + timeStr;
                    indicator.classList.remove('text-gray-400');
                    indicator.classList.add('text-green-600');
                }
                // Update last updated display
                var lastUpdated = document.getElementById(formType === 'sale' ? 'saleLastUpdated' : 'rentalLastUpdated');
                if (lastUpdated) {
                    lastUpdated.textContent = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                }
            }, 500);
        }

        function manualSaveDraft(formType) {
            performAutoSave(formType);
            // Show toast notification
            var toast = document.createElement('div');
            toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-semibold z-50 flex items-center gap-2';
            toast.innerHTML = '<i class="fas fa-check-circle"></i> Draft saved successfully';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        // Attach auto-save listeners to both forms on DOMContentLoaded
        document.addEventListener('DOMContentLoaded', function() {
            ['sale', 'rental'].forEach(formType => {
                var containerId = formType === 'sale' ? 'add-sales-listing' : 'add-listing';
                var container = document.getElementById(containerId);
                if (!container) return;
                container.addEventListener('input', () => autoSaveDraft(formType));
                container.addEventListener('change', () => autoSaveDraft(formType));
            });
        });

        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║                                                                              ║
        // ║              SHARED HELPERS — Used by Both Sale & Rental                     ║
        // ║                                                                              ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        // Statuses that require REBNY validation (cannot be set without required fields)
        var REBNY_ACTIVE_STATUSES = ['Active', 'ComingSoon', 'BackOnMarket', 'OfferOut', 'OfferThruUs', 'OfferAccepted', 'OAThruUs', 'ContractOut', 'COThruUs', 'ContractSigned', 'ContractSignedThruUs', 'BoardApproved', 'Sold', 'SoldThruUs', 'AppOut', 'AppThruUs', 'AppAccepted', 'Leased', 'LeasedThruUs'];

        // Check if a single field has a value (works for radio, select, input, textarea)
        function fieldHasValue(field) {
            if (field.type === 'radio') {
                if (field.name) return !!document.querySelector('input[name="' + field.name + '"]:checked');
                return false;
            }
            if (field.id) {
                var el = document.getElementById(field.id);
                if (!el) return true; // Element not found = skip (may be hidden/conditional)
                if (field.type === 'select') return el.value && el.value.trim() !== '' && el.value !== 'Draft';
                return el.value && el.value.trim() !== '';
            }
            return true;
        }


        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║                                                                              ║
        // ║         SALE FORM — Required Fields, Validation & Summary                    ║
        // ║         Everything below is SALE-ONLY until the next section header           ║
        // ║                                                                              ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        // SALE required fields — matches REBNY/Trestle Exhibit A mandatory fields
        var SALE_REQUIRED_FIELDS = [
            // --- Tab 1: Listing Information / Essentials ---
            { id: 'saleUpdatingCompany', label: 'Updating Company', type: 'select', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleUpdatingAgent', label: 'Updating Agent', type: 'select', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleCoBrokeAgreementType', label: 'CoBroke Agreement Type', type: 'select', tab: 1, section: 'Listing Information/Essentials' },
            { name: 'salePropertyType', label: 'Property Type', type: 'radio', tab: 1, section: 'Listing Information/Essentials' },
            { name: 'saleBuildingStatus', label: 'Building Status', type: 'radio', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleDateListed', label: 'Date Listed', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleExclusiveStart', label: 'Exclusive Start Date', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleExclusiveExpires', label: 'Exclusive Expires', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleFirstCoBroke', label: 'First Date To Co-Broke Listing', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleOffMarketDate', label: 'Off Market Date', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleContractSignedDate', label: 'Contract Signed Date', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'salePrice', label: 'Price', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'saleMaintCC', label: 'Maint/CC', type: 'input', tab: 1, section: 'Listing Information/Essentials', conditional: ['COOP','CONDO','CONDOP','COMMERCIAL_CONDO','COMMERCIAL_COOP'] },
            { id: 'saleUnitShares', label: 'Shares', type: 'input', tab: 1, section: 'Listing Information/Essentials', conditional: ['COOP','CONDOP','COMMERCIAL_COOP'] },
            { id: 'saleFlipTaxAmount', label: 'Flip Tax Amount', type: 'input', tab: 1, section: 'Listing Information/Essentials', conditional: ['COOP','CONDO','CONDOP','COMMERCIAL_CONDO','COMMERCIAL_COOP'] },
            { id: 'saleExclusiveCommission', label: 'Exclusive Agent Commission', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { name: 'saleAptCondition', label: 'Condition of Apartment', type: 'radio', tab: 1, section: 'Listing Information/Essentials' },
            // --- Tab 1: Listing Information / Description ---
            { id: 'saleDescription', label: 'Listing Description', type: 'textarea', tab: 1, section: 'Listing Information/Description' },
            // --- Tab 1: Listing Information / Contacts ---
            { id: 'saleListingCompany', label: 'Listing Agent Company', type: 'select', tab: 1, section: 'Listing Information/Contacts' },
            { id: 'saleListingAgent', label: 'Listing Agent', type: 'select', tab: 1, section: 'Listing Information/Contacts' },
            { id: 'saleBuyerCompany', label: "Buyer's Agent Contact", type: 'select', tab: 1, section: 'Listing Information/Contacts', statusOnly: ['ContractSigned','ContractSignedThruUs','Sold','SoldThruUs'] },
            // --- Tab 2: Unit Information / Essentials ---
            { id: 'saleBedrooms', label: 'Bedrooms', type: 'input', tab: 2, section: 'Unit Information/Essentials' },
            { id: 'saleFullBaths', label: 'Full Bathrooms', type: 'input', tab: 2, section: 'Unit Information/Essentials' },
            { id: 'saleHalfBaths', label: 'Half Bathrooms', type: 'input', tab: 2, section: 'Unit Information/Essentials' },
            { id: 'saleFloorInBuilding', label: 'Floor in Building', type: 'input', tab: 2, section: 'Unit Information/Essentials' },
            { name: 'saleGarageSpaces', label: 'Garage Spaces Assigned', type: 'radio', tab: 2, section: 'Unit Information/Essentials' },
            { name: 'saleHasViews', label: 'Views', type: 'radio', tab: 2, section: 'Unit Information/Essentials' },
            // --- Tab 2: Unit Information / Features ---
            { name: 'saleWasherDryerAllowed', label: 'Washer/Dryer Allowed', type: 'radio', tab: 2, section: 'Unit Information/Features' },
            { name: 'saleCoolingYN', label: 'Cooling', type: 'radio', tab: 2, section: 'Unit Information/Features' },
            { name: 'fireplace', label: 'Fireplace', type: 'radio', tab: 2, section: 'Unit Information/Features' },
            // --- Tab 1: Conditional Co-op/Condo fields ---
            { id: 'saleLivingArea', label: 'Living Area (Sq Ft)', type: 'input', tab: 1, section: 'Listing Information/Condo Details', conditional: ['CONDO','COMMERCIAL_CONDO'] },
            // --- Tab 3: Townhouse/Building Info / Essentials ---
            { id: 'saleTHStories', label: 'Stories (Property)', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials' },
            { id: 'saleTHUnitsTotal', label: '# Residential Units', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials' },
            { id: 'saleTHLotSize', label: 'Lot Size', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials' },
            { id: 'saleTHLotSizeUnits', label: 'Lot Size Units', type: 'select', tab: 3, section: 'Townhouse-Building/Essentials' },
            { id: 'saleTHLotDimensions', label: 'Lot Dimensions', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials' },
            { id: 'saleTHBuildingArea', label: 'Building Area Total', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials' },
        ];

        // SALE: Check if a conditional field is relevant based on SALE property type
        function isFieldRelevant(field) {
            if (!field.conditional) return true;
            var ptEl = document.querySelector('input[name="salePropertyType"]:checked');
            if (!ptEl) return false;
            var subtype = resolveListingSubtype(ptEl.value, (document.querySelector('input[name="saleCommercialOwnership"]:checked') || {}).value || null, (document.querySelector('input[name="saleBuildingStatus"]:checked') || {}).value || 'Resale');
            return field.conditional.includes(subtype);
        }

        // SALE: Check if a status-conditional field is relevant based on SALE status
        function isStatusRelevant(field) {
            if (!field.statusOnly) return true;
            var statusEl = document.getElementById('saleStatus');
            if (!statusEl) return true;
            return field.statusOnly.includes(statusEl.value);
        }

        // SALE: Dynamic validation summary — updates panel, tab stars, field-level errors
        function updateSaleValidationSummary() {
            var summaryEl = document.getElementById('saleValidationSummary');
            if (!summaryEl) return;

            // Don't show errors until agent has attempted Next/Submit
            if (!window._saleValidationActivated) return;

            var missingBySection = {};
            var missingByTab = {};

            SALE_REQUIRED_FIELDS.forEach(function(field) {
                if (!isFieldRelevant(field)) return;
                if (!isStatusRelevant(field)) return;

                var empty = !fieldHasValue(field);

                // Update field-level red star
                var starEl = null;
                if (field.id) {
                    var el = document.getElementById(field.id);
                    if (el) {
                        var label = el.closest('div')?.querySelector('.sale-req-star');
                        if (label) starEl = label;
                        var errEl = el.closest('div')?.querySelector('.sale-field-error');
                        if (errEl) {
                            if (empty) errEl.classList.remove('hidden');
                            else errEl.classList.add('hidden');
                        }
                        if (empty) el.classList.add('border-red-400');
                        else el.classList.remove('border-red-400');
                    }
                } else if (field.name) {
                    var radios = document.querySelectorAll('input[name="' + field.name + '"]');
                    if (radios.length > 0) {
                        var container = radios[0].closest('.mb-6') || radios[0].closest('div');
                        if (container) starEl = container.querySelector('.sale-req-star');
                    }
                }
                if (starEl) {
                    if (empty) starEl.classList.remove('hidden');
                    else starEl.classList.add('hidden');
                }

                if (empty) {
                    if (!missingBySection[field.section]) missingBySection[field.section] = [];
                    missingBySection[field.section].push(field.label);
                    missingByTab[field.tab] = true;
                }
            });

            // Update tab stars
            ['1','2','3','4','5','6'].forEach(function(t) {
                var star = document.getElementById('saleTab' + t + 'Star');
                if (star) {
                    if (missingByTab[parseInt(t)]) star.classList.remove('hidden');
                    else star.classList.add('hidden');
                }
            });

            // Build summary HTML
            var sections = Object.keys(missingBySection);
            if (sections.length === 0) {
                summaryEl.innerHTML = '<p class="text-sm text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i> All required fields complete</p>';
                return;
            }

            var html = '';
            sections.forEach(function(section) {
                html += '<div>';
                html += '<p class="font-semibold text-red-600 mb-1">' + section + ':</p>';
                html += '<ul class="text-red-500 space-y-0.5">';
                missingBySection[section].forEach(function(label) {
                    html += '<li>&bull; ' + label + ' Required</li>';
                });
                html += '</ul></div>';
            });
            summaryEl.innerHTML = html;
        }

        // SALE: Wire real-time validation on all sale form inputs
        // Gate: validation summary only shows after first failed Next/Submit
        window._saleValidationActivated = false;

        function initSaleValidation() {
            var container = document.getElementById('add-sales-listing');
            if (!container) return;
            // Wire real-time listeners — they check the gate inside updateSaleValidationSummary
            container.addEventListener('input', function() { updateSaleValidationSummary(); });
            container.addEventListener('change', function() { updateSaleValidationSummary(); });
            // Do NOT run on load — wait for first failed validation
        }

        function activateSaleValidation() {
            window._saleValidationActivated = true;
            updateSaleValidationSummary();
        }


        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║                                                                              ║
        // ║        RENTAL FORM — Required Fields & Validation                            ║
        // ║        Everything below is RENTAL-ONLY until the next section header          ║
        // ║                                                                              ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        // RENTAL required fields — matches REBNY/Trestle Exhibit A mandatory fields
        var RENTAL_REQUIRED_FIELDS_LIST = [
            // --- Tab 1: Listing Information / Essentials ---
            { id: 'rentalUpdatingCompany', label: 'Updating Company', type: 'select', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'rentalUpdatingAgent', label: 'Updating Agent', type: 'select', tab: 1, section: 'Listing Information/Essentials' },
            { name: 'rentalPropertyType', label: 'Property Type', type: 'radio', tab: 1, section: 'Listing Information/Essentials' },
            { name: 'rentalBuildingStatus', label: 'Building Status', type: 'radio', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'rentalStatus', label: 'Listing Status', type: 'select', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'rentalDateListed', label: 'Date Listed', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'rentalAvailableDate', label: 'Available Date', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'rentalExclusiveStart', label: 'Exclusive Start Date', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            { id: 'rentalMonthlyRent', label: 'Monthly Rent', type: 'input', tab: 1, section: 'Listing Information/Essentials' },
            // --- Tab 1: Listing Information / Description ---
            { id: 'rentalDescription', label: 'Listing Description', type: 'textarea', tab: 1, section: 'Listing Information/Description' },
            // --- Tab 2: Unit Information / Address ---
            { id: 'rentalStreetAddress', label: 'Street Address', type: 'input', tab: 2, section: 'Unit Information/Address' },
            { id: 'rentalCity', label: 'City', type: 'input', tab: 2, section: 'Unit Information/Address' },
            { id: 'rentalState', label: 'State', type: 'select', tab: 2, section: 'Unit Information/Address' },
            { id: 'rentalZip', label: 'Zip Code', type: 'input', tab: 2, section: 'Unit Information/Address' },
            // --- Tab 2: Unit Information / Essentials ---
            { id: 'rentalBedrooms', label: 'Bedrooms', type: 'select', tab: 2, section: 'Unit Information/Essentials' },
            { id: 'rentalFullBathrooms', label: 'Full Bathrooms', type: 'select', tab: 2, section: 'Unit Information/Essentials' },
            // --- Tab 3: Townhouse/Building Info (conditional — only required when visible) ---
            { id: 'rentalTHStories', label: 'Stories (Property)', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials', conditional: ['SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING'] },
            { id: 'rentalTHUnitsTotal', label: '# Residential Units', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials', conditional: ['SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING'] },
            { id: 'rentalTHLotSize', label: 'Lot Size', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials', conditional: ['SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING'] },
            { id: 'rentalTHLotSizeUnits', label: 'Lot Size Units', type: 'select', tab: 3, section: 'Townhouse-Building/Essentials', conditional: ['SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING'] },
            { id: 'rentalTHLotDimensions', label: 'Lot Dimensions', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials', conditional: ['SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING'] },
            { id: 'rentalTHBuildingArea', label: 'Building Area (Sq Ft)', type: 'input', tab: 3, section: 'Townhouse-Building/Essentials', conditional: ['SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING'] },
        ];

        // Gate: rental validation summary only shows after first failed Next/Submit
        window._rentalValidationActivated = false;

        function activateRentalValidation() {
            window._rentalValidationActivated = true;
            updateRentalValidationSummary();
        }

        function updateRentalValidationSummary() {
            var summaryEl = document.getElementById('rentalValidationSummary');
            if (!summaryEl) return;

            // Don't show errors until agent has attempted Next/Submit
            if (!window._rentalValidationActivated) return;

            var missingBySection = {};
            RENTAL_REQUIRED_FIELDS_LIST.forEach(function(field) {
                // Skip conditional fields if not relevant
                if (field.conditional) {
                    var ptEl = document.querySelector('input[name="rentalPropertyType"]:checked');
                    if (!ptEl) return;
                    var subtype = typeof resolveRentalListingSubtype === 'function' ? resolveRentalListingSubtype(ptEl.value) : ptEl.value;
                    if (!field.conditional.includes(subtype)) return;
                }
                if (!fieldHasValue(field)) {
                    if (!missingBySection[field.section]) missingBySection[field.section] = [];
                    missingBySection[field.section].push(field.label);
                }
            });

            var sections = Object.keys(missingBySection);
            if (sections.length === 0) {
                summaryEl.innerHTML = '<p class="text-sm text-green-600 font-medium"><i class="fas fa-check-circle mr-1"></i> All required fields complete</p>';
                return;
            }

            var html = '';
            sections.forEach(function(section) {
                html += '<div>';
                html += '<p class="font-semibold text-red-600 mb-1">' + section + ':</p>';
                html += '<ul class="text-red-500 space-y-0.5">';
                missingBySection[section].forEach(function(label) {
                    html += '<li>&bull; ' + label + ' Required</li>';
                });
                html += '</ul></div>';
            });
            summaryEl.innerHTML = html;
        }

        // Wire real-time rental validation listeners (gated by _rentalValidationActivated)
        (function() {
            document.addEventListener('DOMContentLoaded', function() {
                var container = document.getElementById('add-rental-listing');
                if (!container) return;
                container.addEventListener('input', function() { updateRentalValidationSummary(); });
                container.addEventListener('change', function() { updateRentalValidationSummary(); });
            });
        })();


        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║                                                                              ║
        // ║      SHARED — REBNY Validation Dispatcher & Status Change Handler            ║
        // ║      Calls Sale or Rental validation based on formType parameter              ║
        // ║                                                                              ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        // Lookup: maps formType -> required fields array
        var REBNY_REQUIRED_FIELDS = {
            sale: SALE_REQUIRED_FIELDS,
            rental: RENTAL_REQUIRED_FIELDS_LIST
        };

        // Validate required fields for a given form type ('sale' or 'rental')
        function validateREBNYRequired(formType) {
            var fields = REBNY_REQUIRED_FIELDS[formType] || [];
            var missing = [];
            fields.forEach(function(field) {
                if (formType === 'sale') {
                    if (!isFieldRelevant(field)) return;
                    if (!isStatusRelevant(field)) return;
                }
                if (formType === 'rental' && field.conditional) {
                    // Check if this conditional rental field is currently relevant
                    var ptEl = document.querySelector('input[name="rentalPropertyType"]:checked');
                    if (!ptEl) return; // No property type selected, skip conditional fields
                    var subtype = resolveRentalListingSubtype(ptEl.value);
                    if (!field.conditional.includes(subtype)) return; // Not relevant for this property type
                }
                if (!fieldHasValue(field)) {
                    missing.push(field.label);
                }
            });
            return missing;
        }

        // Handle status dropdown change — blocks Active if required fields missing
        function validateStatusChange(formType) {
            var statusEl = document.getElementById(formType === 'sale' ? 'saleStatus' : 'rentalStatus');
            var panelEl = document.getElementById(formType + 'ValidationPanel');
            var listEl = document.getElementById(formType + 'MissingFieldsList');
            var draftBadge = document.getElementById(formType + 'DraftBadge');
            if (!statusEl) return;

            var newStatus = statusEl.value;
            var prevStatus = statusEl.dataset.prevStatus || 'Draft';

            // Check valid transition per STATUS_TRANSITIONS state machine
            if (typeof STATUS_TRANSITIONS !== 'undefined' && prevStatus && STATUS_TRANSITIONS[prevStatus]) {
                var allowed = STATUS_TRANSITIONS[prevStatus];
                if (allowed.length > 0 && !allowed.includes(newStatus) && newStatus !== prevStatus) {
                    showToast('Invalid status transition: ' + prevStatus + ' → ' + newStatus + '. Allowed: ' + allowed.join(', '), 'error');
                    statusEl.value = prevStatus;
                    return false;
                }
            }

            // Show warning for active/live statuses with missing required fields (does not block)
            if (REBNY_ACTIVE_STATUSES.includes(newStatus)) {
                var missing = validateREBNYRequired(formType);
                if (missing.length > 0) {
                    // Show warning panel but allow the status change
                    if (panelEl) {
                        panelEl.classList.remove('hidden');
                        listEl.innerHTML = missing.map(m => '<li>' + m + '</li>').join('');
                    }
                } else {
                    if (panelEl) panelEl.classList.add('hidden');
                }
            }

            // Update previous status tracking
            statusEl.dataset.prevStatus = newStatus;
            if (panelEl) panelEl.classList.add('hidden');

            // Update draft badge
            if (draftBadge) {
                if (newStatus === 'Draft' || newStatus === 'Future') {
                    draftBadge.style.display = '';
                    draftBadge.querySelector('i').className = 'fas fa-file-alt';
                    draftBadge.innerHTML = '<i class="fas fa-file-alt"></i> ' + (newStatus === 'Draft' ? 'DRAFT' : 'FUTURE');
                    draftBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-300';
                } else if (newStatus === 'Active' || newStatus === 'ComingSoon' || newStatus === 'BackOnMarket') {
                    draftBadge.innerHTML = '<i class="fas fa-broadcast-tower"></i> ' + newStatus.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                    draftBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300';
                } else {
                    draftBadge.innerHTML = '<i class="fas fa-file-contract"></i> ' + newStatus.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
                    draftBadge.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300';
                }
            }
            return true;
        }

        // ============================================================
        // FAIR HOUSING COMPLIANCE CHECKER
        // Real-time detection of prohibited language per:
        // - Federal Fair Housing Act (42 U.S.C. 3604(c))
        // - NY State Human Rights Law
        // - NY DOS Advertising Guidelines (19 NYCRR 175.29)
        // - REBNY RLS Policies
