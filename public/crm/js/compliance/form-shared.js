        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║                                                                              ║
        // ║       SALE FORM — Conditional Rendering (Property Type Visibility)            ║
        // ║       SALE-ONLY: resolveListingSubtype, applySalesFieldRules                  ║
        // ║                                                                              ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        /**
         * Resolve the listing subtype from user selections
         * @param {string} propertyType - Selected property type (Condo, Coop, Condop, etc.)
         * @param {string} commercialOwnership - Selected commercial ownership (if Commercial selected)
         * @param {string} buildingStatus - Building status (Resale, NewDevelopment, SponsorUnit, NewConversion)
         * @returns {string} - Resolved subtype: COOP, CONDO, CONDOP, TOWNHOUSE, SINGLE_FAMILY, MULTI_FAMILY, MIXED_USE, LAND, COMMERCIAL_CONDO, COMMERCIAL_COOP, COMMERCIAL_BUILDING
         */
        function resolveListingSubtype(propertyType, commercialOwnership, buildingStatus) {
            // Handle Non-RLS Commercial property types with subtype
            if (propertyType === 'Commercial') {
                switch (commercialOwnership) {
                    case 'CommercialCondo':
                        return 'COMMERCIAL_CONDO';
                    case 'CommercialCondop':
                        return 'COMMERCIAL_CONDO'; // Treat like commercial condo
                    case 'CommercialCoop':
                        return 'COMMERCIAL_COOP';
                    case 'WholeBuilding':
                    case 'LandOnly':
                    default:
                        return 'COMMERCIAL_BUILDING';
                }
            }

            // Handle Office/Retail (RLS-eligible) with building type sub-selector
            if (propertyType === 'Office' || propertyType === 'Retail') {
                var buildingType = document.querySelector('input[name="saleOfficeRetailOwnership"]:checked')?.value || '';
                var prefix = propertyType === 'Office' ? 'OFFICE' : 'RETAIL';
                switch (buildingType) {
                    case 'Condo':   return prefix + '_CONDO';
                    case 'Coop':    return prefix + '_COOP';
                    case 'Condop':  return prefix + '_CONDOP';
                    case 'Townhouse': return prefix + '_TOWNHOUSE';
                    case 'MixedUse':  return prefix + '_MIXED_USE';
                    case 'FeeSimple': return prefix;
                    default: return prefix; // No building type selected yet
                }
            }

            // Map standard property types
            switch (propertyType) {
                case 'Coop':
                    return 'COOP';
                case 'Condo':
                    return 'CONDO';
                case 'Condop':
                    return 'CONDOP';
                case 'SingleFamilyTownhouse':
                    return 'SINGLE_FAMILY_TOWNHOUSE';
                case 'MultiFamilyTownhouse':
                    return 'MULTI_FAMILY_TOWNHOUSE';
                case 'SingleFamily':
                    return 'SINGLE_FAMILY';
                case 'MultiFamily':
                    return 'MULTI_FAMILY';
                case 'MixedUse':
                    return 'MIXED_USE';
                case 'Loft':
                    return 'LOFT';
                case 'Duplex':
                    return 'DUPLEX_BUILDING';
                case 'Triplex':
                    return 'TRIPLEX_BUILDING';
                case 'Quadruplex':
                    return 'QUADRUPLEX_BUILDING';
                case 'Land':
                    return 'LAND';
                case 'DeededParking':
                    return 'DEEDED_PARKING';
                default:
                    return 'CONDO'; // Default fallback
            }
        }

        /**
         * Field visibility rules by resolved subtype
         * true = visible, false = hidden
         */
        // Field visibility rules by resolved subtype — true = visible for these subtypes
        var SALES_FIELD_VISIBILITY_RULES = {
            // Co-op/Condop: Shares, Unit Sq Ft
            saleCoopCondopSection: ['COOP', 'CONDOP', 'COMMERCIAL_COOP', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Condo only: Percent of Common Elements, Living Area
            saleCondoOnlySection: ['CONDO', 'COMMERCIAL_CONDO', 'OFFICE_CONDO', 'RETAIL_CONDO'],
            // Maintenance/CC frequency (all managed types)
            saleMaintCCFreqField: ['COOP', 'CONDO', 'CONDOP', 'LOFT', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Tax deduction (co-op/condo/condop)
            saleTaxDeductionField: ['COOP', 'CONDO', 'CONDOP', 'LOFT', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Flip tax (all managed types)
            saleFlipTaxSection: ['COOP', 'CONDO', 'CONDOP', 'LOFT', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Board approval (co-op/condop — boards review purchases)
            saleBoardApprovalField: ['COOP', 'CONDOP', 'COMMERCIAL_COOP', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Board interview (co-op/condop)
            saleBoardInterviewField: ['COOP', 'CONDOP', 'COMMERCIAL_COOP', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // First right of refusal (condo/condop)
            saleFirstRefusalField: ['CONDO', 'CONDOP', 'COMMERCIAL_CONDO', 'OFFICE_CONDO', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_CONDOP'],
            // Meet and Greet (all managed types)
            saleMeetAndGreetField: ['COOP', 'CONDO', 'CONDOP', 'LOFT', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Board Application (co-op/condo/condop)
            saleBoardApplicationField: ['COOP', 'CONDO', 'CONDOP', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Maint/CC amount (all managed types)
            saleMaintCCField: ['COOP', 'CONDO', 'CONDOP', 'LOFT', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // RE Taxes - NOT for Co-op (taxes included in maintenance)
            saleRETaxesField: ['CONDO', 'CONDOP', 'LOFT', 'SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING', 'LAND', 'DEEDED_PARKING', 'COMMERCIAL_CONDO', 'COMMERCIAL_BUILDING', 'OFFICE_CONDO', 'OFFICE_CONDOP', 'OFFICE_TOWNHOUSE', 'OFFICE_MIXED_USE', 'OFFICE', 'RETAIL_CONDO', 'RETAIL_CONDOP', 'RETAIL_TOWNHOUSE', 'RETAIL_MIXED_USE', 'RETAIL'],
            // Total Monthly (Maint/CC + RE Taxes) - same as RE Taxes
            saleTotalMonthlyField: ['CONDO', 'CONDOP', 'LOFT', 'SINGLE_FAMILY_TOWNHOUSE', 'MULTI_FAMILY_TOWNHOUSE', 'SINGLE_FAMILY', 'MULTI_FAMILY', 'MIXED_USE', 'DUPLEX_BUILDING', 'TRIPLEX_BUILDING', 'QUADRUPLEX_BUILDING', 'LAND', 'DEEDED_PARKING', 'COMMERCIAL_CONDO', 'COMMERCIAL_BUILDING', 'OFFICE_CONDO', 'OFFICE_CONDOP', 'OFFICE_TOWNHOUSE', 'OFFICE_MIXED_USE', 'OFFICE', 'RETAIL_CONDO', 'RETAIL_CONDOP', 'RETAIL_TOWNHOUSE', 'RETAIL_MIXED_USE', 'RETAIL']
        };

        /**
         * Status-driven required dates
         */
        var STATUS_REQUIRED_FIELDS = {
            'Active': ['saleDateListed', 'salePrice', 'saleExclusiveExpires'],
            'Future': ['saleDateListed', 'salePrice', 'saleExclusiveExpires'],
            'ComingSoon': ['saleDateListed', 'salePrice', 'saleExclusiveExpires'],
            'ContractSigned': ['saleContractSignedDate'],
            'ContractSignedThruUs': ['saleContractSignedDate'],
            'Sold': ['saleSoldDate', 'saleSoldPrice'],
            'SoldThruUs': ['saleSoldDate', 'saleSoldPrice'],
            'PermOffMarket': ['saleOffMarketDate'],
            'TempOffMarket': ['saleOffMarketDate'],
            'Expired': ['saleOffMarketDate'],
        };

        /**
         * Apply field visibility and required rules based on current selections
         */
        function applySalesFieldRules() {
            // Get current selections
            var propertyTypeEl = document.querySelector('input[name="salePropertyType"]:checked');
            var commercialOwnershipEl = document.querySelector('input[name="saleCommercialOwnership"]:checked');
            var statusEl = document.querySelector('#add-sales-listing select[required]');

            var propertyType = propertyTypeEl ? propertyTypeEl.value : 'Condo';
            var commercialOwnership = commercialOwnershipEl ? commercialOwnershipEl.value : null;
            var buildingStatus = document.querySelector('input[name="saleBuildingStatus"]:checked')?.value || 'Resale';
            var status = statusEl ? statusEl.value : 'Active';

            // Toggle Office/Retail building type sub-selector
            toggleOfficeRetailBuildingType('sale');

            // Resolve the listing subtype
            var subtype = resolveListingSubtype(propertyType, commercialOwnership, buildingStatus);

            // Apply visibility rules
            Object.keys(SALES_FIELD_VISIBILITY_RULES).forEach(fieldId => {
                var element = document.getElementById(fieldId);
                if (element) {
                    var visibleFor = SALES_FIELD_VISIBILITY_RULES[fieldId];
                    if (visibleFor.includes(subtype)) {
                        element.style.display = '';
                        element.classList.remove('hidden');
                    } else {
                        element.style.display = 'none';
                        element.classList.add('hidden');
                    }
                }
            });

            // Handle Commercial distribution lockdown (Non-RLS commercial = WWW only)
            if (propertyType === 'Commercial') {
                applyCommercialDistribution('sale');
            } else {
                clearCommercialDistribution('sale');
            }

            // Commercial sections are now inside the collapsible Commercial panel
            // Toggle the commercial specs section (saleCommercialSection2) based on commercial type
            var commercialSection2 = document.getElementById('saleCommercialSection2');
            if (commercialSection2) {
                if (subtype.startsWith('COMMERCIAL')) {
                    commercialSection2.style.display = '';
                } else {
                    commercialSection2.style.display = 'none';
                }
            }

            // Update Co-op/Condop section header text based on type
            var coopSection = document.getElementById('saleCoopCondopSection');
            if (coopSection) {
                var header = coopSection.querySelector('h4');
                if (header) {
                    if (subtype === 'COMMERCIAL_COOP' || subtype === 'OFFICE_COOP' || subtype === 'RETAIL_COOP') {
                        header.textContent = 'Commercial Co-op Details';
                    } else if (subtype === 'CONDOP' || subtype === 'OFFICE_CONDOP' || subtype === 'RETAIL_CONDOP') {
                        header.textContent = 'Condop Details';
                    } else {
                        header.textContent = 'Co-op / Condop Details';
                    }
                }
            }

            // Update validation summary when property type changes (conditional fields change)
            if (typeof updateSaleValidationSummary === 'function') updateSaleValidationSummary();
        }

        // Legacy function for backwards compatibility
        function toggleSaleCommercialOwnership() {
            applySalesFieldRules();
        }

        // ╔══════════════════════════════════════════════════════════════════════════════╗
        // ║  SHARED: Office/Retail Building Type, Commercial Distribution, Building Sync ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        /**
         * Show/hide Office/Retail building type sub-selector
         * @param {string} formType - 'sale' or 'rental'
         */
        function toggleOfficeRetailBuildingType(formType) {
            var propTypeEl = document.querySelector('input[name="' + formType + 'PropertyType"]:checked');
            var propType = propTypeEl ? propTypeEl.value : '';
            var selectorId = formType + 'OfficeRetailBuildingType';
            var selector = document.getElementById(selectorId);
            if (!selector) return;

            if (propType === 'Office' || propType === 'Retail') {
                selector.style.display = '';
            } else {
                selector.style.display = 'none';
                // Clear building type radios when hidden
                var radios = selector.querySelectorAll('input[type="radio"]');
                radios.forEach(r => r.checked = false);
            }
        }

        /**
         * Lock distribution to WWW-only for non-RLS commercial listings
         * Stricter than Owner Opt-Out: disables ALL channels except WWW
         * @param {string} formType - 'sale' or 'rental'
         */
        function applyCommercialDistribution(formType) {
            var prefix = formType + 'Dist_';
            var channels = ['IDX', 'VOW', 'Syndication', 'Listhub', 'NYMLS', 'Realtor', 'RPX', 'RLS'];
            channels.forEach(ch => {
                var el = document.getElementById(prefix + ch);
                if (el) {
                    el.checked = false;
                    el.disabled = true;
                }
            });
            // Check and enable WWW
            var www = document.getElementById(prefix + 'WWW');
            if (www) {
                www.checked = true;
                www.disabled = false;
            }
            // Show warning banner
            var warning = document.getElementById(formType + 'WWWOnlyWarning');
            if (warning) warning.style.display = '';
        }

        /**
         * Re-enable all distribution channels when switching away from non-RLS commercial
         * @param {string} formType - 'sale' or 'rental'
         */
        function clearCommercialDistribution(formType) {
            var prefix = formType + 'Dist_';
            var channels = ['IDX', 'VOW', 'Syndication', 'Listhub', 'NYMLS', 'Realtor', 'RPX', 'RLS', 'WWW'];
            channels.forEach(ch => {
                var el = document.getElementById(prefix + ch);
                if (el) el.disabled = false;
            });
            // Hide warning banner
            var warning = document.getElementById(formType + 'WWWOnlyWarning');
            if (warning) warning.style.display = 'none';
        }

        /**
         * Map building ownership type to Cotality CommonInterest value
         * Used by Office/Retail building type sub-selector
         * @param {string} buildingType - Selected building ownership type
         * @returns {string} - Cotality CommonInterest value
         */
        function getBuildingTypeMapping(buildingType) {
            switch (buildingType) {
                case 'Condo':     return 'Condominium';
                case 'Coop':      return 'Cooperative';
                case 'Condop':    return 'Condop';
                case 'Townhouse': return 'None';
                case 'MixedUse':  return 'None';
                case 'FeeSimple': return 'None';
                default:          return 'None';
            }
        }

        /**
         * Auto-select matching building type radio when a building is selected from search
         * Called from selectBuilding() after address auto-population
         * @param {string} formType - 'sale' or 'rental'
         * @param {string} buildingType - Building type from database (e.g. 'Apartment', 'Condo', 'Coop', 'Townhouse', 'MixedUse')
         */
        function syncBuildingTypeToPropertyForm(formType, buildingType) {
            var propTypeEl = document.querySelector('input[name="' + formType + 'PropertyType"]:checked');
            var propType = propTypeEl ? propTypeEl.value : '';

            // Only sync if current property type is Office or Retail
            if (propType !== 'Office' && propType !== 'Retail') return;

            // Map building database type to Office/Retail ownership radio value
            var typeMap = {
                'Apartment':  'Condo',    // Most apartment buildings are condos
                'Condo':      'Condo',
                'Condominium':'Condo',
                'Coop':       'Coop',
                'Co-op':      'Coop',
                'Cooperative':'Coop',
                'Condop':     'Condop',
                'Townhouse':  'Townhouse',
                'MixedUse':   'MixedUse',
                'Mixed Use':  'MixedUse',
            };

            var mappedValue = typeMap[buildingType] || '';
            if (!mappedValue) return;

            // Select the matching radio in the building type sub-selector
            var radioName = formType + 'OfficeRetailOwnership';
            var radio = document.querySelector('input[name="' + radioName + '"][value="' + mappedValue + '"]');
            if (radio) {
                radio.checked = true;
                // Trigger field rules update
                if (formType === 'sale') {
                    applySalesFieldRules();
                } else {
                    applyRentalFieldRules();
                }
            }
        }

        // Toggle form section collapse/expand (Residential/Commercial headers)
        function toggleFormSection(header) {
            var body = header.nextElementSibling;
            var chevron = header.querySelector('.fa-chevron-down, .fa-chevron-right');
            if (!body || !body.classList.contains('form-section-body')) return;
            if (body.style.display === 'none') {
                body.style.display = '';
                if (chevron) { chevron.classList.remove('fa-chevron-right'); chevron.classList.add('fa-chevron-down'); }
                // Update hint text
                var hint = header.querySelector('.text-xs.text-gray-400');
                if (hint) hint.textContent = '(Click to collapse)';
            } else {
                body.style.display = 'none';
                if (chevron) { chevron.classList.remove('fa-chevron-down'); chevron.classList.add('fa-chevron-right'); }
                var hint = header.querySelector('.text-xs.text-gray-400');
                if (hint) hint.textContent = '(Click to expand)';
            }
        }

        // Add another Address + Unit row in Quick Search sections
