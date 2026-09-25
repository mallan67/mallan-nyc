        // ║      RENTAL-ONLY: resolveRentalListingSubtype, applyRentalFieldRules          ║
        // ║                                                                              ║
        // ╚══════════════════════════════════════════════════════════════════════════════╝

        /**
         * Resolve the rental listing subtype from user selections
         * @param {string} propertyType - Selected property type
         * @returns {string} - Resolved subtype: COOP, CONDO, CONDOP, TOWNHOUSE, SINGLE_FAMILY, RENTAL_BUILDING, MULTI_FAMILY, MIXED_USE
         */
        function resolveRentalListingSubtype(propertyType) {
            // Handle Non-RLS Commercial property types with subtype
            if (propertyType === 'Commercial') {
                var commercialOwnership = document.querySelector('input[name="rentalCommercialOwnership"]:checked');
                var ownershipVal = commercialOwnership ? commercialOwnership.value : '';
                switch (ownershipVal) {
                    case 'CommercialCondo':
                    case 'CommercialCondop':
                        return 'COMMERCIAL_CONDO';
                    case 'CommercialCoop':
                        return 'COMMERCIAL_COOP';
                    case 'WholeBuilding':
                    default:
                        return 'COMMERCIAL_BUILDING';
                }
            }

            // Handle Office/Retail (RLS-eligible) with building type sub-selector
            if (propertyType === 'Office' || propertyType === 'Retail') {
                var buildingType = document.querySelector('input[name="rentalOfficeRetailOwnership"]:checked')?.value || '';
                var prefix = propertyType === 'Office' ? 'OFFICE' : 'RETAIL';
                switch (buildingType) {
                    case 'Condo':   return prefix + '_CONDO';
                    case 'Coop':    return prefix + '_COOP';
                    case 'Condop':  return prefix + '_CONDOP';
                    case 'Townhouse': return prefix + '_TOWNHOUSE';
                    case 'MixedUse':  return prefix + '_MIXED_USE';
                    case 'FeeSimple': return prefix;
                    default: return prefix;
                }
            }

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
                case 'RentalBuilding':
                    return 'RENTAL_BUILDING';
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
                default:
                    return 'RENTAL_BUILDING'; // Default for rental listings
            }
        }

        /**
         * Rental field visibility rules by resolved subtype
         * NO board application, board approval, board interview, or flip tax for: townhouses, single family, buildings, mixed use, rental buildings
         */
        var RENTAL_FIELD_VISIBILITY_RULES = {
            // Board Approval - Co-op and Condop only (includes commercial co-op + Office/Retail co-op/condop)
            rentalBoardApprovalField: ['COOP', 'CONDOP', 'COMMERCIAL_COOP', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Board Interview - Co-op and Condop only
            rentalBoardInterviewField: ['COOP', 'CONDOP', 'COMMERCIAL_COOP', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // First Right of Refusal - Condo and Condop
            rentalFirstRefusalField: ['CONDO', 'CONDOP', 'COMMERCIAL_CONDO', 'OFFICE_CONDO', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_CONDOP'],
            // Board Application - Condo, Co-op, Condop
            rentalBoardApplicationField: ['COOP', 'CONDO', 'CONDOP', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Sublease Allowed - Co-op specific
            rentalSubleaseAllowedField: ['COOP', 'COMMERCIAL_COOP', 'OFFICE_COOP', 'RETAIL_COOP'],
            // Building Requirements section - managed types
            rentalBuildingRequirementsSection: ['COOP', 'CONDO', 'CONDOP', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Meet and Greet - all managed types
            rentalMeetAndGreetField: ['COOP', 'CONDO', 'CONDOP', 'COMMERCIAL_CONDO', 'COMMERCIAL_COOP', 'OFFICE_CONDO', 'OFFICE_COOP', 'OFFICE_CONDOP', 'RETAIL_CONDO', 'RETAIL_COOP', 'RETAIL_CONDOP'],
            // Note: rentalCommercialOwnershipSection and rentalCommercialSection2 are now inside
            // the collapsible Commercial section and managed by toggleFormSection(), not visibility rules
        };

        /**
         * Apply rental field visibility rules based on current selections
         */
        // Toggle rental commercial ownership section and re-apply rules
        function toggleRentalCommercialOwnership() {
            applyRentalFieldRules();
        }

        // Show/hide date and price fields based on rental listing status
        function updateRentalStatusFields() {
            var status = (document.getElementById('rentalStatus') || {}).value || '';
            var offMarket = document.getElementById('rentalOffMarketDateField');
            var leased = document.getElementById('rentalLeasedDateField');
            var leasedRent = document.getElementById('rentalLeasedRentField');

            // Hide all first
            if (offMarket) offMarket.style.display = 'none';
            if (leased) leased.style.display = 'none';
            if (leasedRent) leasedRent.style.display = 'none';

            // Off Market / Withdrawn / Canceled / Expired -> show Off Market Date.
            // Both spellings of canceled: `Canceled` is the live Cotality value,
            // `Cancelled` the one Mallan invented and stored on real rows.
            if (['PermOffMarket', 'TempOffMarket', 'Expired', 'Withdrawn', 'Canceled', 'Cancelled'].includes(status)) {
                if (offMarket) offMarket.style.display = '';
            }
            // Leased → show Leased Date + Leased Rent
            if (['Leased', 'LeasedThruUs'].includes(status)) {
                if (leased) leased.style.display = '';
                if (leasedRent) leasedRent.style.display = '';
            }
        }

        function applyRentalFieldRules() {
            // Get current property type selection
            var propertyTypeEl = document.querySelector('input[name="rentalPropertyType"]:checked');
            var propertyType = propertyTypeEl ? propertyTypeEl.value : 'RentalBuilding';

            // Toggle Office/Retail building type sub-selector
            toggleOfficeRetailBuildingType('rental');

            // Commercial sections are now inside the collapsible Commercial panel
            // and managed by toggleFormSection() — no manual show/hide needed here

            // Handle Commercial distribution lockdown (Non-RLS commercial = WWW only)
            if (propertyType === 'Commercial') {
                applyCommercialDistribution('rental');
            } else {
                clearCommercialDistribution('rental');
            }

            // Resolve the rental listing subtype
            var subtype = resolveRentalListingSubtype(propertyType);

            // Apply visibility rules
            Object.keys(RENTAL_FIELD_VISIBILITY_RULES).forEach(fieldId => {
                var element = document.getElementById(fieldId);
                if (element) {
                    var visibleFor = RENTAL_FIELD_VISIBILITY_RULES[fieldId];
                    if (visibleFor.includes(subtype)) {
                        element.style.display = '';
                        element.classList.remove('hidden');
                    } else {
                        element.style.display = 'none';
                        element.classList.add('hidden');
                    }
                }
            });
        }

        // Initialize rental form rules on page load
        document.addEventListener('DOMContentLoaded', function() {
            // Rental Property Type radio buttons
            var rentalPropertyTypeRadios = document.querySelectorAll('input[name="rentalPropertyType"]');
            rentalPropertyTypeRadios.forEach(radio => {
                radio.addEventListener('change', applyRentalFieldRules);
            });

            // Rental Commercial Ownership radio buttons
            var rentalCommercialRadios = document.querySelectorAll('input[name="rentalCommercialOwnership"]');
            rentalCommercialRadios.forEach(radio => {
                radio.addEventListener('change', applyRentalFieldRules);
            });

            // Rental Office/Retail Building Type radio buttons
            var rentalOfficeRetailRadios = document.querySelectorAll('input[name="rentalOfficeRetailOwnership"]');
            rentalOfficeRetailRadios.forEach(radio => {
                radio.addEventListener('change', applyRentalFieldRules);
            });

            // Initial application of rental rules
            applyRentalFieldRules();

            // Initialize sale form validation
            initSaleValidation();
        });

