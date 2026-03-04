// ─── 19: SALE FORM VALIDATORS ─────────────────────────────────────────
// Extracted sale form validation logic for browser-based testing.
// Run inside SALE-FORM-REDESIGN.html context (requires DOM + form globals).
// ──────────────────────────────────────────────────────────────────────
(function() {
        function activateSaleValidation() {
            window._saleValidationActivated = true;
            updateSaleValidationSummary();
        }
        
        // Validate required fields for submission
        function validateREBNYRequired(formType) {
            var fields = SALE_REQUIRED_FIELDS;
            var missing = [];
            fields.forEach(function(field) {
                if (!isFieldRelevant(field)) return;
                if (!isStatusRelevant(field)) return;
                if (!fieldHasValue(field)) {
                    missing.push(field.label);
                }
            });
            return missing;
        }
        
        // ═══════════════════════════════════════════════════════════
        // STATUS STATE MACHINE (Valid Transitions)
        // ═══════════════════════════════════════════════════════════
        
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
        };
        
        // ═══════════════════════════════════════════════════════════
        // CRM → RESO MlsStatus MAPPING
        // ═══════════════════════════════════════════════════════════
        
        var CRM_TO_RESO_STATUS = {
            'Draft': 'ComingSoon', 'Future': 'ComingSoon', 'ComingSoon': 'ComingSoon',
            'Active': 'Active', 'BackOnMarket': 'Active',
            'OfferOut': 'ActiveUnderContract', 'OfferThruUs': 'ActiveUnderContract',
            'OfferAccepted': 'ActiveUnderContract', 'OAThruUs': 'ActiveUnderContract',
            'ContractOut': 'Pending', 'COThruUs': 'Pending',
            'ContractSigned': 'Pending', 'ContractSignedThruUs': 'Pending', 'BoardApproved': 'Pending',
            'Sold': 'Closed', 'SoldThruUs': 'Closed',
            'Withdrawn': 'Withdrawn', 'Cancelled': 'Canceled',
            'PermOffMarket': 'Withdrawn', 'TempOffMarket': 'Hold', 'Expired': 'Expired',
        };
        
        function getResoMlsStatus(crmStatus) {
            return CRM_TO_RESO_STATUS[crmStatus] || 'Active';
        }
        
        // ═══════════════════════════════════════════════════════════
        // RESO 3-FIELD PROPERTY TYPE MAPPING
        // Maps CRM property type radio values to RESO standard
        // ═══════════════════════════════════════════════════════════
        
        function getResoPropertyFields(crmValue, formType) {
            var officeRetailOwnership = formType
                ? document.querySelector('input[name="' + formType + 'OfficeRetailOwnership"]:checked')?.value
                : null;
        
            var MAP = {
                'Condo':                    { PropertyType: 'Residential', CommonInterest: 'Condominium',  PropertySubType: 'Apartment' },
                'Coop':                     { PropertyType: 'Residential', CommonInterest: 'Cooperative',  PropertySubType: 'Apartment' },
                'Condop':                   { PropertyType: 'Residential', CommonInterest: 'Condop',       PropertySubType: 'Apartment' },
                'SingleFamilyTownhouse':    { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'SingleFamilyTownhouse' },
                'MultiFamilyTownhouse':     { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'MultiFamilyTownhouse' },
                'SingleFamily':             { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'SingleFamilyResidence' },
                'MultiFamily':              { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'MultiFamily' },
                'MixedUse':                 { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'MixedUse' },
                'Loft':                     { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Loft' },
                'Duplex':                   { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Duplex' },
                'Triplex':                  { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Triplex' },
                'Quadruplex':               { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Quadruplex' },
                'Office':                   { PropertyType: 'Residential', CommonInterest: getBuildingTypeMapping(officeRetailOwnership), PropertySubType: 'Office' },
                'Retail':                   { PropertyType: 'Residential', CommonInterest: getBuildingTypeMapping(officeRetailOwnership), PropertySubType: 'Retail' },
                'Land':                     { PropertyType: 'Land',        CommonInterest: 'None',         PropertySubType: 'UnimprovedLand' },
                'DeededParking':            { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'DeededParking' },
                'Commercial':               { PropertyType: 'Commercial',  CommonInterest: 'None',         PropertySubType: '' },
            };
            return MAP[crmValue] || { PropertyType: 'Residential', CommonInterest: 'None', PropertySubType: '' };
        }
        
        // ═══════════════════════════════════════════════════════════
        // STATUS CHANGE HANDLER — Validates transitions + updates UI
        // ═══════════════════════════════════════════════════════════
        
        function validateStatusChange(formType) {
            var statusEl = document.getElementById('saleStatus');
            var panelEl = document.getElementById('saleValidationPanel');
            var listEl = document.getElementById('saleMissingFieldsList');
            var draftBadge = document.getElementById('saleDraftBadge');
            if (!statusEl) return;
        
            var newStatus = statusEl.value;
            var prevStatus = statusEl.dataset.prevStatus || 'Draft';
        
            // Check valid transition per STATUS_TRANSITIONS state machine
            if (prevStatus && STATUS_TRANSITIONS[prevStatus]) {
                var allowed = STATUS_TRANSITIONS[prevStatus];
                if (allowed.length > 0 && !allowed.includes(newStatus) && newStatus !== prevStatus) {
                    alert('Invalid status transition: ' + prevStatus + ' \u2192 ' + newStatus + '\n\nAllowed transitions from ' + prevStatus + ':\n\u2022 ' + allowed.join('\n\u2022 '));
                    statusEl.value = prevStatus;
                    return false;
                }
            }
        
            // Show warning for active/live statuses with missing required fields
            if (REBNY_ACTIVE_STATUSES.includes(newStatus)) {
                var missing = validateREBNYRequired('sale');
                if (missing.length > 0) {
                    if (panelEl) {
                        panelEl.classList.remove('hidden');
                        if (listEl) listEl.innerHTML = missing.map(m => '<li>' + m + '</li>').join('');
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
        
            // Trigger status-dependent updates
            updateSaleStatusFields();
            handleSaleComingSoon();
            updateStatusTracking();
            return true;
        }
        
        // ═══════════════════════════════════════════════════════════
        // BATCH CONTENT SCANNER (for submission validation)
        // Uses the unified FAIR_HOUSING_VIOLATIONS + REBNY_DESCRIPTION_VIOLATIONS arrays
        // ═══════════════════════════════════════════════════════════
        
        function scanAllContent() {
            var descFields = [
                { id: 'saleDescription', flagsId: 'saleFairHousingFlags' },
                { id: 'saleTHDescription', flagsId: 'saleTHDescriptionFlags' },
                { id: 'saleTHLayout', flagsId: 'saleTHLayoutFlags' },
                { id: 'saleTHFinancing', flagsId: 'saleTHFinancingFlags' },
                { id: 'saleTHNotes', flagsId: 'saleTHNotesFlags' },
                { id: 'saleShowingInstructions', flagsId: 'saleShowingFlags' },
                { id: 'saleBrokerComments', flagsId: 'saleBrokerCommentsFlags' },
                { id: 'saleBldgDescription', flagsId: 'saleBldgDescriptionFlags' },
            ];
            var totalViolations = 0;
        
            descFields.forEach(f => {
                var el = document.getElementById(f.id);
                if (!el || !el.value.trim()) return;
                _performComplianceCheck(f.id, f.flagsId);
                var flags = document.getElementById(f.flagsId);
                if (flags && (flags.querySelector('.bg-red-50') || flags.querySelector('.bg-orange-50'))) {
                    totalViolations++;
                }
            });
        
            return totalViolations;
        }
        
        // ═══════════════════════════════════════════════════════════
        // DISPLAY PERMISSION CASCADE (REBNY I29/I58-I61)
        // InternetEntireListingDisplayYN → IDX/Address/AVM/Comment
        // ═══════════════════════════════════════════════════════════
        
        function setupDisplayCascade() {
            var entireEl = document.getElementById('saleInternetEntireListingDisplayYN');
            if (!entireEl) return;
        
            var cascadeTargets = ['saleIDXEntireListingDisplayYN', 'saleInternetAddressDisplayYN'];
        
            // For checkboxes
            entireEl.addEventListener('change', function() {
                cascadeTargets.forEach(targetId => {
                    var targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        if (!entireEl.checked) {
                            targetEl.checked = false;
                            targetEl.disabled = true;
                            targetEl.closest('label')?.classList.add('opacity-50');
                        } else {
                            targetEl.disabled = false;
                            targetEl.closest('label')?.classList.remove('opacity-50');
                        }
                    }
                });
                // Also cascade AVM radio
                if (!entireEl.checked) {
                    var avmNo = document.querySelector('input[name="saleInternetAVMDisplayYN"][value="No"]');
                    if (avmNo) avmNo.checked = true;
                    document.querySelectorAll('input[name="saleInternetAVMDisplayYN"]').forEach(r => r.disabled = true);
                } else {
                    document.querySelectorAll('input[name="saleInternetAVMDisplayYN"]').forEach(r => r.disabled = false);
                }
            });
        }
        
        // ═══════════════════════════════════════════════════════════
        // DATE CROSS-VALIDATION (REBNY / Trestle Requirements)
        // ═══════════════════════════════════════════════════════════
        
        function validateDates() {
            var errors = [];
            var getVal = (id) => document.getElementById(id)?.value || '';
        
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
        
            return errors;
        }
        
        // ═══════════════════════════════════════════════════════════
        // OPT-OUT FORM VISIBILITY TOGGLE
        // ═══════════════════════════════════════════════════════════
        
        function toggleOptOutFormVisibility() {
            var isOptOut = document.querySelector('input[name="saleListingType"][value="OwnerOptOut"]')?.checked;
            var section = document.getElementById('saleOptOutFormSection');
            if (section) section.style.display = isOptOut ? '' : 'none';
        }
})();
