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

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  CRM → RESO MlsStatus MAPPING (Item 41)                       ║
        // ╚══════════════════════════════════════════════════════════════════╝

        var CRM_TO_RESO_STATUS = {
            // Sale statuses
            'Draft':                 'ComingSoon',
            'Future':                'ComingSoon',
            'ComingSoon':            'ComingSoon',
            'Active':                'Active',
            'BackOnMarket':          'Active',
            'OfferOut':              'ActiveUnderContract',
            'OfferThruUs':           'ActiveUnderContract',
            'OfferAccepted':         'ActiveUnderContract',
            'OAThruUs':              'ActiveUnderContract',
            'ContractOut':           'Pending',
            'COThruUs':              'Pending',
            'ContractSigned':        'Pending',
            'ContractSignedThruUs':  'Pending',
            'BoardApproved':         'Pending',
            'Sold':                  'Closed',
            'SoldThruUs':            'Closed',
            'Withdrawn':             'Withdrawn',
            'Cancelled':             'Canceled',
            'PermOffMarket':         'Withdrawn',
            'TempOffMarket':         'Hold',
            'Expired':               'Expired',
            // Rental statuses
            'AppOut':                'ActiveUnderContract',
            'AppThruUs':             'ActiveUnderContract',
            'AppAccepted':           'Pending',
            'Leased':                'Closed',
            'LeasedThruUs':          'Closed',
        };

        function getResoMlsStatus(crmStatus) {
            return CRM_TO_RESO_STATUS[crmStatus] || 'Active';
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  RESO 3-FIELD PROPERTY TYPE MAPPING (Item 32/58)               ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Maps CRM property type radio values to RESO 3-field standard
        // Used by both sale and rental forms on data collection/submission
        function getResoPropertyFields(crmValue, formType) {
            // For Office/Retail, CommonInterest comes from the building type sub-selector
            var officeRetailOwnership = formType
                ? document.querySelector('input[name="' + formType + 'OfficeRetailOwnership"]:checked')?.value
                : null;

            var MAP = {
                // Residential
                'Condo':                    { PropertyType: 'Residential', CommonInterest: 'Condominium',  PropertySubType: 'Apartment' },
                'Coop':                     { PropertyType: 'Residential', CommonInterest: 'Cooperative',  PropertySubType: 'Apartment' },
                'Condop':                   { PropertyType: 'Residential', CommonInterest: 'Condop',       PropertySubType: 'Apartment' },
                'SingleFamilyTownhouse':    { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'SingleFamilyTownhouse' },
                'MultiFamilyTownhouse':     { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'MultiFamilyTownhouse' },
                'SingleFamily':             { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'SingleFamilyResidence' },
                'MultiFamily':              { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'MultiFamily' },
                'MixedUse':                 { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'MixedUse' },
                'Loft':                     { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Loft' },
                'RentalBuilding':           { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Apartment' },
                // Small Multi-Family (Whole Building)
                'Duplex':                   { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Duplex' },
                'Triplex':                  { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Triplex' },
                'Quadruplex':               { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'Quadruplex' },
                // Commercial (RLS-eligible) — CommonInterest from building type sub-selector
                'Office':                   { PropertyType: 'Residential', CommonInterest: getBuildingTypeMapping(officeRetailOwnership), PropertySubType: 'Office' },
                'Retail':                   { PropertyType: 'Residential', CommonInterest: getBuildingTypeMapping(officeRetailOwnership), PropertySubType: 'Retail' },
                // Special
                'Land':                     { PropertyType: 'Land',        CommonInterest: 'None',         PropertySubType: 'UnimprovedLand' },
                'DeededParking':            { PropertyType: 'Residential', CommonInterest: 'None',         PropertySubType: 'DeededParking' },
                // Non-RLS Commercial (WWW only)
                'Commercial':               { PropertyType: 'Commercial',  CommonInterest: 'None',         PropertySubType: '' },
            };
            return MAP[crmValue] || { PropertyType: 'Residential', CommonInterest: 'None', PropertySubType: '' };
        }

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  RENTAL TENANT'S AGENT LOOKUP (Item 33)                        ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // Reuse sale agent database for rental tenant agent lookup
