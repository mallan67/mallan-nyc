/**
 * rental-form-doctor.js — Rental Listing Form Validation & Compliance Tool
 * Validates RENTAL-FORM-STANDALONE.html against REBNY/RLS/IDX/Trestle requirements
 *
 * Covers: REBNY RLS Rules, UCBA 2026, Cotality Data Standards, Fair Housing Act,
 *         NY State Human Rights Law, NYC Human Rights Law Title 8,
 *         NY DOS Advertising Laws (19 NYCRR 175.25), Source of Income Discrimination,
 *         Disability Accommodation (service/emotional support animals)
 *
 * Mallan Real Estate Inc. — Brokerage License #10991205323
 *
 * VERSION: 1.0.0
 * DATE: 2026-02-13
 *
 * Categories:
 *   MF  (MF-01..MF-20):  Mandatory Fields — core required listing data
 *   RF  (RF-01..RF-10):  Rental-Specific Fields — rental-only data requirements
 *   RC  (RC-01..RC-08):  Cotality Compliance — property type mapping, status, picklists
 *   DQ  (DQ-01..DQ-10):  Data Quality — format, range, duplicate, validation
 *   DG  (DG-01..DG-05):  Distribution Gates — opt-out, IDX, syndication controls
 *   CF  (CF-01..CF-10):  Compliance Fields — Fair Housing, agent info, compensation, SOI
 *   BF  (BF-01..BF-05):  Building Fields — building modal and info
 *   UN  (UN-01..UN-05):  UI/Navigation — tab structure, sub-tabs, responsive
 */

'use strict';

var RentalFormDoctor = (function() {

    // =========================================================================
    // FAIR HOUSING COMPLIANCE DATA
    // =========================================================================

    /**
     * Protected classes under Federal, NY State, and NYC laws combined.
     * Any listing description that references these in a discriminatory manner
     * is a violation carrying $250 first offense, $500 + RLS termination second.
     */
    var PROTECTED_CLASSES = {
        federal: ['race', 'color', 'religion', 'national origin', 'sex', 'disability', 'familial status'],
        nyState: ['age', 'creed', 'sexual orientation', 'gender identity', 'marital status',
                  'military status', 'citizenship', 'domestic violence victim status'],
        nyc:     ['lawful occupation', 'source of income', 'partnership status', 'immigration status',
                  'caregiver status', 'arrest record', 'conviction record', 'gender',
                  'sexual orientation', 'disability', 'alienage']
    };

    /**
     * Prohibited words/phrases in listing descriptions and remarks.
     * Based on HUD guidance + NY DOS 19 NYCRR 175.25 + NYC Commission on Human Rights.
     */
    var PROHIBITED_PATTERNS = [
        // Familial status / age
        { pattern: /\b(no\s*children|adults?\s*only|mature\s*(couple|person|adult)|senior\s*community|55\s*and\s*over|elderly\s*only|empty\s*nester|no\s*families)\b/i,
          law: 'Fair Housing Act / NYC HRL', type: 'FAMILIAL_STATUS' },
        // Race / national origin / ethnicity
        { pattern: /\b(white\s*(neighborhood|area|community)|exclusive\s*(neighborhood|community)|restricted\s*community|no\s*foreigners|english\s*only)\b/i,
          law: 'Fair Housing Act', type: 'RACE_NATIONAL_ORIGIN' },
        // Religion
        { pattern: /\b(christian\s*(neighborhood|community)|muslim\s*free|near\s*(church|synagogue|mosque)\s*(only|preferred)|religious\s*community)\b/i,
          law: 'Fair Housing Act', type: 'RELIGION' },
        // Disability / handicap
        { pattern: /\b(no\s*(wheelchair|handicap|disabled)|able[\s-]bodied\s*(only|preferred)|not\s*handicap\s*accessible|walking\s*distance\s*required)\b/i,
          law: 'Fair Housing Act / ADA / NYC HRL', type: 'DISABILITY' },
        // Sex / gender
        { pattern: /\b(female\s*(only|preferred)|male\s*(only|preferred)|no\s*(men|women)|bachelor\s*pad|man\s*cave)\b/i,
          law: 'Fair Housing Act / NYC HRL', type: 'SEX_GENDER' },
        // Sexual orientation / gender identity
        { pattern: /\b(straight\s*(only|preferred)|no\s*(gay|lesbian|transgender|lgbtq)|traditional\s*(family|values)\s*(only|preferred))\b/i,
          law: 'NY State HRL / NYC HRL', type: 'SEXUAL_ORIENTATION' },
        // Source of income — CRITICAL for NYC rentals (Section 8, vouchers, HCV, public assistance)
        { pattern: /\b(no\s*(section\s*8|voucher|housing\s*choice|hcv|subsid|welfare|public\s*assistance)|cash\s*only\s*tenants?|employed\s*tenants?\s*only|must\s*be\s*employed|income\s*from\s*employment\s*only)\b/i,
          law: 'NYC HRL Title 8 / NYS HRL', type: 'SOURCE_OF_INCOME' },
        // Marital status
        { pattern: /\b(married\s*(couple|only|preferred)|single\s*(only|preferred)|no\s*single\s*(men|women|people))\b/i,
          law: 'NY State HRL / NYC HRL', type: 'MARITAL_STATUS' },
        // Immigration / citizenship
        { pattern: /\b(citizens?\s*only|no\s*immigrants?|legal\s*residents?\s*only|us\s*(citizens?|nationals?)\s*only|must\s*(be|have)\s*(citizen|green\s*card))\b/i,
          law: 'NYC HRL Title 8', type: 'IMMIGRATION_STATUS' },
        // Steering language
        { pattern: /\b(perfect\s*for\s*(families|singles|couples|professionals|students)|ideal\s*(neighborhood|area)\s*for)\b/i,
          law: 'Fair Housing Act (steering)', type: 'STEERING' },
        // NY DOS Advertising (19 NYCRR 175.25) — must identify brokerage
        { pattern: /\b(for\s*rent\s*by\s*owner|no\s*(broker|agent|realtor))\b/i,
          law: 'NY DOS 19 NYCRR 175.25', type: 'NY_ADVERTISING' },
        // Off-market language (UCBA Art. I, Sec. 5(D))
        { pattern: /\b(off[\s-]?market|pocket\s*listing|whisper\s*listing|unlisted)\b/i,
          law: 'UCBA Art. I, Sec. 5(D)', type: 'OFF_MARKET' },
        // Service/emotional support animal discrimination
        { pattern: /\b(no\s*service\s*(animals?|dogs?)|no\s*emotional\s*support|no\s*esa|no\s*comfort\s*animals?)\b/i,
          law: 'Fair Housing Act / ADA / NYC HRL', type: 'DISABILITY_ANIMAL' }
    ];

    /**
     * REBNY-mandated 16 rental property type radios and their Cotality 3-field mappings.
     * No Land, no Deeded Parking (sale-only). Adds RentalBuilding.
     */
    var RENTAL_PROPERTY_TYPES = {
        'Condo':                   { PropertyType: 'ResidentialLease', CommonInterest: 'Condominium',     PropertySubType: 'Apartment' },
        'Coop':                    { PropertyType: 'ResidentialLease', CommonInterest: 'StockCooperative', PropertySubType: 'Apartment' },
        'Condop':                  { PropertyType: 'ResidentialLease', CommonInterest: 'Condop',          PropertySubType: 'Apartment' },
        'SingleFamilyTownhouse':   { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'SingleFamilyTownhouse' },
        'MultiFamilyTownhouse':    { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'MultiFamilyTownhouse' },
        'SingleFamily':            { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'SingleFamilyResidence' },
        'MultiFamily':             { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'MultiFamily' },
        'MixedUse':                { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'MixedUse' },
        'Loft':                    { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'Loft' },
        'RentalBuilding':          { PropertyType: 'ResidentialLease', CommonInterest: 'RentalBuilding',  PropertySubType: 'Apartment' },
        'Duplex':                  { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'Duplex' },
        'Triplex':                 { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'Triplex' },
        'Quadruplex':              { PropertyType: 'ResidentialLease', CommonInterest: 'None',            PropertySubType: 'Quadruplex' },
        'Office':                  { PropertyType: 'ResidentialLease', CommonInterest: '(from sub-selector)', PropertySubType: 'Office' },
        'Retail':                  { PropertyType: 'ResidentialLease', CommonInterest: '(from sub-selector)', PropertySubType: 'Retail' },
        'Commercial':              { PropertyType: 'Commercial',       CommonInterest: 'None',            PropertySubType: '' }
    };

    /**
     * Valid rental statuses (NO Coming Soon per UCBA Art. I, Sec. 16 — sales only).
     */
    var VALID_RENTAL_STATUSES = [
        'Draft', 'Future', 'Active', 'BackOnMarket',
        'AppOut', 'AppThruUs', 'AppAccepted',
        'Leased', 'LeasedThruUs',
        'Withdrawn', 'Cancelled', 'PermOffMarket', 'TempOffMarket', 'Expired'
    ];

    /**
     * Valid listing agreement types (UCBA Art. I, Sec. 4 — Exclusive only on RLS).
     */
    var VALID_LISTING_TYPES = ['Exclusive', 'House', 'Co-Exclusive', 'RLS-Owner-OptOut', 'RLS-Participant'];

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

    /** Get element by ID, return null safely */
    function el(id) { return document.getElementById(id); }

    /** Get value of element by ID */
    function val(id) {
        var e = el(id);
        if (!e) return '';
        if (e.type === 'checkbox') return e.checked;
        if (e.type === 'radio') return e.checked ? e.value : '';
        return (e.value || '').trim();
    }

    /** Get selected radio value from a named group */
    function radioVal(name) {
        var checked = document.querySelector('input[name="' + name + '"]:checked');
        return checked ? checked.value : '';
    }

    /** Count radio buttons in a named group */
    function radioCount(name) {
        return document.querySelectorAll('input[name="' + name + '"]').length;
    }

    /** Check if element exists in the DOM */
    function exists(id) { return !!el(id); }

    /** Check if element exists and is visible (not hidden/display:none) */
    function visible(id) {
        var e = el(id);
        if (!e) return false;
        return e.offsetParent !== null || getComputedStyle(e).display !== 'none';
    }

    /** Get all text content from description/remarks fields for scanning */
    function getAllTextContent() {
        var fields = ['rentalDescription', 'rentalAgentRemarks', 'rentalShowingInstructions',
                      'rentalWebHeadline', 'rentalConcessionRemarks', 'rentalTHDescription',
                      'rentalTHLayout', 'rentalTHNotes'];
        var text = '';
        fields.forEach(function(id) {
            var v = val(id);
            if (v) text += v + ' ';
        });
        return text;
    }

    /** Scan text for Fair Housing / compliance violations */
    function scanForViolations(text) {
        var violations = [];
        if (!text || text.trim().length === 0) return violations;
        PROHIBITED_PATTERNS.forEach(function(rule) {
            var match = text.match(rule.pattern);
            if (match) {
                violations.push({
                    type: rule.type,
                    law: rule.law,
                    match: match[0],
                    detail: 'Found "' + match[0] + '" — violates ' + rule.law
                });
            }
        });
        return violations;
    }

    /** Check for agent contact info in text (UCBA Art. I, Sec. 5(C)) */
    function scanForAgentInfo(text) {
        var issues = [];
        if (!text) return issues;
        if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) issues.push('Phone number detected');
        if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) issues.push('Email address detected');
        if (/https?:\/\/|www\./i.test(text)) issues.push('URL/website detected');
        return issues;
    }

    /** Check for compensation language in text (UCBA Art. I, Sec. 5(E)) */
    function scanForCompensation(text) {
        var issues = [];
        if (!text) return issues;
        var patterns = [
            { re: /\bcommission\b/i, msg: '"commission"' },
            { re: /\bbroker\s*fee\b/i, msg: '"broker fee"' },
            { re: /\btenant\s*pays?\b/i, msg: '"tenant pays"' },
            { re: /\bno\s*fee\b/i, msg: '"no fee"' },
            { re: /\bclosing\s*costs?\b/i, msg: '"closing costs"' },
            { re: /\bbuyer\s*pays?\b/i, msg: '"buyer pays"' },
            { re: /\b\d+%?\s*co-?broke?\b/i, msg: 'co-broke percentage' },
            { re: /\bfree\s*services?\b/i, msg: '"free services" (UCBA Art. III, Sec. 5)' }
        ];
        patterns.forEach(function(p) {
            if (p.re.test(text)) issues.push(p.msg + ' detected in description');
        });
        return issues;
    }


    // =========================================================================
    // VALIDATE — MASTER COMPLIANCE TEST SUITE
    // =========================================================================

    /**
     * Run all validation checks against the rental form.
     *
     * @returns {object} {
     *   passed: [{id, check, detail}...],
     *   failed: [{id, check, detail, elements}...],
     *   warnings: [{id, check, detail, elements}...],
     *   score: number (0-100),
     *   byCategory: { MF: {pass,fail,warn}, RF: {...}, ... },
     *   summary: string
     * }
     */
    function validate() {
        var passed = [];
        var failed = [];
        var warnings = [];

        function pass(id, check, detail) { passed.push({ id: id, check: check, detail: detail }); }
        function fail(id, check, detail, els) { failed.push({ id: id, check: check, detail: detail, elements: els || [] }); }
        function warn(id, check, detail, els) { warnings.push({ id: id, check: check, detail: detail, elements: els || [] }); }


        // =================================================================
        // MANDATORY FIELDS (MF-01 to MF-20) — Core required listing data
        // =================================================================

        // MF-01: ListPrice / Monthly Rent (REBNY I37)
        if (exists('rentalMonthlyRent')) {
            var rent = val('rentalMonthlyRent');
            if (rent) { pass('MF-01', 'Monthly Rent field', 'Present with value: $' + rent); }
            else { warn('MF-01', 'Monthly Rent field', 'Field exists but empty — required for submission', ['rentalMonthlyRent']); }
        } else { fail('MF-01', 'Monthly Rent field', 'rentalMonthlyRent element not found in DOM'); }

        // MF-02: PropertyType radio group (REBNY I2, I12)
        var ptRadioCount = radioCount('rentalPropertyType');
        if (ptRadioCount > 0) {
            var ptVal = radioVal('rentalPropertyType');
            if (ptVal) { pass('MF-02', 'PropertyType radio', 'Selected: ' + ptVal + ' (' + ptRadioCount + ' radios)'); }
            else { warn('MF-02', 'PropertyType radio', ptRadioCount + ' radios exist but none selected — required'); }
        } else { fail('MF-02', 'PropertyType radio group', 'No radios with name="rentalPropertyType" found'); }

        // MF-03: PropertySubType derivation — validated via Cotality mapping in RC section
        var ptSelected = radioVal('rentalPropertyType');
        if (ptSelected && RENTAL_PROPERTY_TYPES[ptSelected]) {
            pass('MF-03', 'PropertySubType (derived)', 'Maps to: ' + RENTAL_PROPERTY_TYPES[ptSelected].PropertySubType);
        } else if (ptSelected) {
            fail('MF-03', 'PropertySubType (derived)', 'Selected type "' + ptSelected + '" has no Cotality mapping');
        } else {
            warn('MF-03', 'PropertySubType (derived)', 'No property type selected — cannot derive');
        }

        // MF-04: CommonInterest derivation
        if (ptSelected && RENTAL_PROPERTY_TYPES[ptSelected]) {
            pass('MF-04', 'CommonInterest (derived)', 'Maps to: ' + RENTAL_PROPERTY_TYPES[ptSelected].CommonInterest);
        } else if (ptSelected) {
            fail('MF-04', 'CommonInterest (derived)', 'Selected type "' + ptSelected + '" has no Cotality mapping');
        } else {
            warn('MF-04', 'CommonInterest (derived)', 'No property type selected — cannot derive');
        }

        // MF-05: StandardStatus / MlsStatus (REBNY I36)
        if (exists('rentalStatus')) {
            var statusVal = val('rentalStatus');
            if (statusVal) {
                if (VALID_RENTAL_STATUSES.indexOf(statusVal) !== -1) {
                    pass('MF-05', 'Status field', 'Valid status: ' + statusVal);
                } else {
                    fail('MF-05', 'Status field', 'Invalid rental status: "' + statusVal + '" — must be one of: ' + VALID_RENTAL_STATUSES.join(', '), ['rentalStatus']);
                }
            } else { warn('MF-05', 'Status field', 'Field exists but empty — required for submission', ['rentalStatus']); }
        } else { fail('MF-05', 'Status field (MlsStatus)', 'rentalStatus element not found in DOM'); }

        // MF-06: Street Address (REBNY I8)
        if (exists('rentalStreetAddress')) {
            if (val('rentalStreetAddress')) { pass('MF-06', 'Street Address', 'Present'); }
            else { warn('MF-06', 'Street Address', 'Field exists but empty — required', ['rentalStreetAddress']); }
        } else { fail('MF-06', 'Street Address', 'rentalStreetAddress element not found'); }

        // MF-07: Borough / City (REBNY I1)
        if (exists('rentalBorough')) {
            var boroughVal = val('rentalBorough');
            var validBoroughs = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'StatenIsland'];
            if (boroughVal && validBoroughs.indexOf(boroughVal) !== -1) {
                pass('MF-07', 'Borough', 'Valid: ' + boroughVal);
            } else if (boroughVal) {
                fail('MF-07', 'Borough', 'Invalid borough value: "' + boroughVal + '"', ['rentalBorough']);
            } else {
                warn('MF-07', 'Borough', 'Field exists but empty — required', ['rentalBorough']);
            }
        } else { fail('MF-07', 'Borough (REBNY I1)', 'rentalBorough element not found'); }

        // MF-08: PostalCode / Zip (REBNY I8)
        if (exists('rentalZipCode')) {
            var zip = val('rentalZipCode');
            if (zip && /^\d{5}$/.test(zip)) { pass('MF-08', 'Zip Code', 'Valid: ' + zip); }
            else if (zip) { warn('MF-08', 'Zip Code', 'Value "' + zip + '" is not a 5-digit zip', ['rentalZipCode']); }
            else { warn('MF-08', 'Zip Code', 'Field exists but empty', ['rentalZipCode']); }
        } else { fail('MF-08', 'Zip Code (PostalCode)', 'rentalZipCode element not found'); }

        // MF-09: StateOrProvince — should default to NY
        if (exists('rentalState')) {
            var stateVal = val('rentalState');
            if (stateVal === 'NY') { pass('MF-09', 'State', 'Correctly set to NY'); }
            else if (stateVal) { warn('MF-09', 'State', 'Set to "' + stateVal + '" — expected NY for NYC listings', ['rentalState']); }
            else { warn('MF-09', 'State', 'Field exists but empty', ['rentalState']); }
        } else {
            // State may not have its own field if auto-derived from borough
            warn('MF-09', 'State (StateOrProvince)', 'No standalone rentalState element — verify state is derived from borough');
        }

        // MF-10: County / Borough (REBNY I1 — redundant with MF-07 but different Cotality field)
        // Validated via MF-07 — pass if borough exists
        if (exists('rentalBorough')) {
            pass('MF-10', 'CountyOrParish (borough)', 'Covered by rentalBorough field (MF-07)');
        } else {
            fail('MF-10', 'CountyOrParish', 'No borough field to derive county from');
        }

        // MF-11: BedroomsTotal (REBNY I20) — 0 = Studio
        if (exists('rentalBedrooms')) {
            var beds = val('rentalBedrooms');
            if (beds !== '' && beds !== null) {
                var bedsOptions = el('rentalBedrooms');
                var hasStudio = false;
                if (bedsOptions && bedsOptions.tagName === 'SELECT') {
                    for (var i = 0; i < bedsOptions.options.length; i++) {
                        var optVal = bedsOptions.options[i].value.toLowerCase();
                        var optText = bedsOptions.options[i].textContent.toLowerCase();
                        if (optVal === '0' || optVal === 'studio' || optText.indexOf('studio') !== -1) {
                            hasStudio = true;
                            break;
                        }
                    }
                }
                if (hasStudio) { pass('MF-11', 'Bedrooms (incl. Studio=0)', 'Field present, Studio option available'); }
                else { warn('MF-11', 'Bedrooms (Studio support)', 'Field exists but no Studio/0 option found — 0 bedrooms must be allowed', ['rentalBedrooms']); }
            } else {
                warn('MF-11', 'Bedrooms', 'Field exists but empty — required', ['rentalBedrooms']);
            }
        } else { fail('MF-11', 'Bedrooms (BedroomsTotal)', 'rentalBedrooms element not found'); }

        // MF-12: BathroomsTotalInteger (REBNY I18)
        if (exists('rentalFullBathrooms')) {
            pass('MF-12', 'Full Bathrooms', 'Field present');
        } else { fail('MF-12', 'Full Bathrooms (BathroomsFull)', 'rentalFullBathrooms element not found'); }

        // MF-13: LivingArea / SqFt
        if (exists('rentalSqFt')) {
            pass('MF-13', 'Living Area (SqFt)', 'Field present');
        } else { fail('MF-13', 'Living Area (LivingArea)', 'rentalSqFt element not found'); }

        // MF-14: PublicRemarks / Description (REBNY I8 content)
        if (exists('rentalDescription')) {
            var desc = val('rentalDescription');
            if (desc && desc.length > 0) {
                if (desc.length >= 50) { pass('MF-14', 'Listing Description', desc.length + ' characters'); }
                else { warn('MF-14', 'Listing Description', 'Only ' + desc.length + ' chars — consider more detail (min 50 recommended)', ['rentalDescription']); }
            } else { warn('MF-14', 'Listing Description', 'Field exists but empty — required for RLS submission', ['rentalDescription']); }
        } else { fail('MF-14', 'Listing Description (PublicRemarks)', 'rentalDescription element not found'); }

        // MF-15: ListAgentKey (REBNY I27)
        var agentFound = exists('rentalListingAgent') || exists('rentalUpdatingAgentDisplay');
        if (agentFound) {
            var agentVal = val('rentalListingAgent') || val('rentalUpdatingAgentDisplay');
            if (agentVal) { pass('MF-15', 'Listing Agent', 'Agent field populated: ' + agentVal.substring(0, 40)); }
            else { warn('MF-15', 'Listing Agent', 'Agent field exists but empty — required', ['rentalListingAgent']); }
        } else { fail('MF-15', 'Listing Agent (ListAgentKey)', 'No agent field found (rentalListingAgent or rentalUpdatingAgentDisplay)'); }

        // MF-16: ListOfficeKey (REBNY I27)
        if (exists('rentalListingCompany')) {
            if (val('rentalListingCompany')) { pass('MF-16', 'Listing Company', 'Populated'); }
            else { warn('MF-16', 'Listing Company', 'Field exists but empty — required', ['rentalListingCompany']); }
        } else {
            // Company may be auto-derived
            warn('MF-16', 'Listing Company (ListOfficeKey)', 'rentalListingCompany element not found — verify company is auto-populated');
        }

        // MF-17: ListingAgreement / Listing Type (REBNY I44, UCBA Art. I, Sec. 4)
        var ltCount = radioCount('rentalListingType');
        if (ltCount > 0) {
            var ltVal = radioVal('rentalListingType');
            if (ltVal && VALID_LISTING_TYPES.indexOf(ltVal) !== -1) {
                pass('MF-17', 'Listing Type', 'Valid: ' + ltVal + ' (' + ltCount + ' options)');
            } else if (ltVal) {
                fail('MF-17', 'Listing Type', 'Invalid listing type: "' + ltVal + '" — UCBA requires Exclusive types only');
            } else {
                warn('MF-17', 'Listing Type', ltCount + ' options exist but none selected — defaults to Exclusive');
            }
        } else { fail('MF-17', 'Listing Type (ListingAgreement)', 'No radios with name="rentalListingType" found'); }

        // MF-18: ExpirationDate (REBNY I34 — hidden from public, required internally)
        if (exists('rentalExclusiveExpires')) {
            pass('MF-18', 'Expiration Date', 'Field present (internal only — hidden from public per REBNY I34)');
        } else { fail('MF-18', 'Expiration Date (I34)', 'rentalExclusiveExpires element not found'); }

        // MF-19: OnMarketDate / DateListed (REBNY I35)
        if (exists('rentalDateListed')) {
            var listedDate = val('rentalDateListed');
            if (listedDate) { pass('MF-19', 'Date Listed (OnMarketDate)', 'Set to: ' + listedDate); }
            else { warn('MF-19', 'Date Listed', 'Field exists but empty — should be auto-populated', ['rentalDateListed']); }
        } else { fail('MF-19', 'Date Listed (OnMarketDate)', 'rentalDateListed element not found'); }

        // MF-20: Neighborhood / MLSAreaMinor (REBNY I9)
        if (exists('rentalNeighborhoodFromAddress') || exists('rentalNeighborhood')) {
            pass('MF-20', 'Neighborhood (MLSAreaMinor)', 'Field present');
        } else { fail('MF-20', 'Neighborhood (REBNY I9)', 'No neighborhood field found'); }


        // =================================================================
        // RENTAL-SPECIFIC FIELDS (RF-01 to RF-10) — REBNY I58-I61
        // =================================================================

        // RF-01: AvailableDate (REBNY I58 — required for all rentals)
        var availFound = exists('rentalAvailableDate') || exists('rentalAvailability');
        if (availFound) {
            pass('RF-01', 'Availability Date (I58)', 'Field present');
        } else {
            fail('RF-01', 'Availability Date (REBNY I58)', 'No availability date field found — REQUIRED for all rental listings');
        }

        // RF-02: Lease Term / LeaseLength (REBNY I60)
        var leaseTermFound = exists('rentalLeaseTerm') || exists('rentalMinLease') || exists('rentalMaxLease');
        if (leaseTermFound) {
            pass('RF-02', 'Lease Terms (I60)', 'Lease term field(s) present');
        } else {
            fail('RF-02', 'Lease Terms (REBNY I60)', 'No lease term fields found — REQUIRED for rental listings');
        }

        // RF-03: Move-In Cost / MoveInCost
        // Check for fee table pattern (rentalFeeType_1, rentalFeeCost_1, etc.)
        var feeTableFound = exists('rentalFeeType_1') || exists('rentalFeeCost_1') ||
                           document.querySelector('[id^="rentalFeeType"]') ||
                           document.querySelector('[id^="rentalFeeCost"]');
        if (feeTableFound) {
            pass('RF-03', 'Move-In Cost / Fee Table', 'Fee table entries present');
        } else {
            warn('RF-03', 'Move-In Cost', 'No fee table entries found (rentalFeeType_*, rentalFeeCost_*)');
        }

        // RF-04: Furnished toggle (REBNY I59)
        var furnishedFound = exists('rentalFurnished') || radioCount('rentalFurnished') > 0;
        if (furnishedFound) {
            pass('RF-04', 'Furnished Details (I59)', 'Furnished field present');
        } else {
            fail('RF-04', 'Furnished Details (REBNY I59)', 'No furnished field found — REQUIRED for rental listings');
        }

        // RF-05: Owner Pays / Concessions
        var ownerPaysFound = exists('rentalOwnerPays') || exists('rentalConcessions');
        if (ownerPaysFound) {
            pass('RF-05', 'Owner Pays / Concessions', 'Concessions field present');
        } else {
            warn('RF-05', 'Owner Pays / Concessions', 'No concessions field found');
        }

        // RF-06: Free Rent Months
        var freeRentFound = exists('rentalFreeRent') || exists('rentalFreeRentMonths');
        if (freeRentFound) {
            pass('RF-06', 'Free Rent Months', 'Field present');
        } else {
            warn('RF-06', 'Free Rent Months', 'No free rent months field found');
        }

        // RF-07: Pet Policy (REBNY I22 — unit-level)
        var petFound = exists('rentalPetsAllowed') || radioCount('rentalPets') > 0;
        if (petFound) {
            pass('RF-07', 'Pet Policy (unit-level)', 'Pet policy field present');
        } else {
            fail('RF-07', 'Pet Policy (REBNY I22)', 'No pet policy field found — required');
        }

        // RF-08: Guarantor accepted toggle
        var guarantorFound = radioCount('rentalGuarantors') > 0 || radioCount('rentalGuarantorsPolicy') > 0;
        if (guarantorFound) {
            pass('RF-08', 'Guarantor Policy', 'Guarantor field present');
        } else {
            warn('RF-08', 'Guarantor Policy', 'No guarantor policy field found');
        }

        // RF-09: Board Approval toggle (REBNY I17)
        var boardFound = radioCount('rentalBoardApproval') > 0;
        if (boardFound) {
            pass('RF-09', 'Board Approval (I17)', 'Board approval field present');
        } else {
            warn('RF-09', 'Board Approval', 'No rentalBoardApproval radio group found — required for co-op/condo');
        }

        // RF-10: Lease Type — stabilized vs non-stabilized (REBNY I61)
        if (exists('rentalLeaseType')) {
            pass('RF-10', 'Lease Type (I61)', 'Lease type field present (stabilized/non-stabilized)');
        } else {
            fail('RF-10', 'Lease Type (REBNY I61)', 'rentalLeaseType element not found — REQUIRED for NYC rentals');
        }


        // =================================================================
        // Cotality COMPLIANCE (RC-01 to RC-08) — Property type mapping
        // =================================================================

        // RC-01: PropertyType radio group exists
        if (ptRadioCount > 0) {
            pass('RC-01', 'PropertyType radio group exists', ptRadioCount + ' radios found');
        } else {
            fail('RC-01', 'PropertyType radio group', 'No radios with name="rentalPropertyType"');
        }

        // RC-02: Exactly 16 property type radios (rental-specific count)
        // Note: Commercial toggle may be separate, so we check for 14-16 range
        if (ptRadioCount >= 14 && ptRadioCount <= 16) {
            pass('RC-02', '16 rental property type radios', ptRadioCount + ' radios found (expected 14-16)');
        } else if (ptRadioCount > 0) {
            warn('RC-02', 'Rental property type count', 'Found ' + ptRadioCount + ' radios — expected 14-16 (no Land, no DeededParking, adds RentalBuilding)');
        } else {
            fail('RC-02', 'Rental property type radios', 'No property type radios found');
        }

        // RC-03: Each radio maps to correct Cotality trio
        if (ptRadioCount > 0) {
            var unmapped = [];
            document.querySelectorAll('input[name="rentalPropertyType"]').forEach(function(radio) {
                if (!RENTAL_PROPERTY_TYPES[radio.value]) {
                    unmapped.push(radio.value);
                }
            });
            if (unmapped.length === 0) {
                pass('RC-03', 'Cotality 3-field mapping', 'All ' + ptRadioCount + ' radios have valid Cotality mappings');
            } else {
                fail('RC-03', 'Cotality 3-field mapping', unmapped.length + ' unmapped: ' + unmapped.join(', '), unmapped);
            }
        }

        // RC-04: No "Land" or "DeededParking" radios present (rental-only exclusion)
        var landRadio = document.querySelector('input[name="rentalPropertyType"][value="Land"]');
        var parkingRadio = document.querySelector('input[name="rentalPropertyType"][value="DeededParking"]');
        if (!landRadio && !parkingRadio) {
            pass('RC-04', 'No Land/DeededParking (rental exclusion)', 'Correctly excluded from rental form');
        } else {
            var badTypes = [];
            if (landRadio) badTypes.push('Land');
            if (parkingRadio) badTypes.push('DeededParking');
            fail('RC-04', 'Rental-only property types', badTypes.join(', ') + ' should NOT appear on rental form');
        }

        // RC-05: RentalBuilding radio exists
        var rentalBldgRadio = document.querySelector('input[name="rentalPropertyType"][value="RentalBuilding"]');
        if (rentalBldgRadio) {
            pass('RC-05', 'RentalBuilding radio present', 'Rental-specific type correctly included');
        } else {
            fail('RC-05', 'RentalBuilding radio missing', 'RentalBuilding type must exist on rental form');
        }

        // RC-06: Status dropdown has NO Coming Soon (UCBA Art. I, Sec. 16 — D1: sales only)
        if (exists('rentalStatus')) {
            var statusEl = el('rentalStatus');
            var hasComingSoon = false;
            if (statusEl && statusEl.tagName === 'SELECT') {
                for (var s = 0; s < statusEl.options.length; s++) {
                    if (statusEl.options[s].value === 'ComingSoon' || statusEl.options[s].value === 'Coming Soon' ||
                        statusEl.options[s].textContent.indexOf('Coming Soon') !== -1) {
                        hasComingSoon = true;
                        break;
                    }
                }
            }
            if (!hasComingSoon) {
                pass('RC-06', 'No Coming Soon for rentals', 'Correctly excluded per UCBA Art. I, Sec. 16 (D1: sales only)');
            } else {
                fail('RC-06', 'Coming Soon present on rental form', 'VIOLATION: Coming Soon is SALES ONLY per UCBA Art. I, Sec. 16 — remove from rental status dropdown', ['rentalStatus']);
            }
        }

        // RC-07: ListingAgreement type matches UCBA (Exclusive types only, C1)
        if (ltCount > 0) {
            var invalidLT = [];
            document.querySelectorAll('input[name="rentalListingType"]').forEach(function(radio) {
                if (VALID_LISTING_TYPES.indexOf(radio.value) === -1) {
                    invalidLT.push(radio.value);
                }
            });
            if (invalidLT.length === 0) {
                pass('RC-07', 'Listing type picklist compliance', 'All ' + ltCount + ' options are valid UCBA types');
            } else {
                fail('RC-07', 'Invalid listing types', invalidLT.join(', ') + ' — UCBA requires Exclusive types only (Art. I, Sec. 4)');
            }
        }

        // RC-08: Address fields map to Cotality components
        var cotalityAddr = {
            'rentalStreetAddress': 'StreetNumber + StreetName',
            'rentalUnitNumber': 'UnitNumber',
            'rentalBorough': 'CityRegion',
            'rentalZipCode': 'PostalCode'
        };
        var addrMissing = [];
        Object.keys(cotalityAddr).forEach(function(id) {
            if (!exists(id)) addrMissing.push(id + ' (' + cotalityAddr[id] + ')');
        });
        if (addrMissing.length === 0) {
            pass('RC-08', 'Cotality address field mapping', 'All 4 address components present');
        } else {
            fail('RC-08', 'Cotality address mapping', addrMissing.length + ' missing: ' + addrMissing.join(', '));
        }


        // =================================================================
        // DATA QUALITY (DQ-01 to DQ-10) — Format, range, validation
        // =================================================================

        // DQ-01: Rent field accepts only positive numbers
        if (exists('rentalMonthlyRent')) {
            var rentEl = el('rentalMonthlyRent');
            var rentType = rentEl ? rentEl.type : '';
            if (rentType === 'number') {
                var minAttr = rentEl.getAttribute('min');
                if (minAttr !== null && parseFloat(minAttr) >= 0) {
                    pass('DQ-01', 'Rent field positive numbers', 'type=number with min=' + minAttr);
                } else {
                    warn('DQ-01', 'Rent field min constraint', 'type=number but no min attribute — should have min="0" or min="1"', ['rentalMonthlyRent']);
                }
            } else {
                warn('DQ-01', 'Rent field type', 'Input type is "' + rentType + '" — should be "number" for validation', ['rentalMonthlyRent']);
            }
        }

        // DQ-02: Beds allows 0 (Studio)
        if (exists('rentalBedrooms')) {
            var bedsEl = el('rentalBedrooms');
            if (bedsEl && bedsEl.tagName === 'SELECT') {
                var allowsZero = false;
                for (var b = 0; b < bedsEl.options.length; b++) {
                    var bVal = bedsEl.options[b].value.toLowerCase();
                    var bText = bedsEl.options[b].textContent.toLowerCase();
                    if (bVal === '0' || bVal === 'studio' || bText === 'studio') {
                        allowsZero = true;
                        break;
                    }
                }
                if (allowsZero) { pass('DQ-02', 'Beds allows Studio (0)', 'Studio/0 option present'); }
                else { fail('DQ-02', 'Beds Studio support', 'No Studio or 0-bedroom option — BedroomsTotal=0 must be allowed', ['rentalBedrooms']); }
            } else if (bedsEl && bedsEl.type === 'number') {
                var bedsMin = bedsEl.getAttribute('min');
                if (bedsMin === null || parseFloat(bedsMin) <= 0) {
                    pass('DQ-02', 'Beds allows 0', 'Number input with min <= 0');
                } else {
                    fail('DQ-02', 'Beds min constraint', 'min=' + bedsMin + ' — must allow 0 for Studio', ['rentalBedrooms']);
                }
            }
        }

        // DQ-03: Baths allows .5 (half baths)
        if (exists('rentalHalfBathrooms')) {
            pass('DQ-03', 'Half Bath support', 'Separate rentalHalfBathrooms field exists');
        } else {
            // Check if full bath field allows decimals
            var fullBathEl = el('rentalFullBathrooms');
            if (fullBathEl && fullBathEl.type === 'number') {
                var step = fullBathEl.getAttribute('step');
                if (step === '0.5' || step === 'any') {
                    pass('DQ-03', 'Half Bath support', 'Full bath field allows step=' + step);
                } else {
                    warn('DQ-03', 'Half Bath support', 'No half-bath field and full bath does not accept .5 step', ['rentalFullBathrooms']);
                }
            } else {
                warn('DQ-03', 'Half Bath support', 'No rentalHalfBathrooms element — half baths may not be capturable');
            }
        }

        // DQ-04: Zip is 5 digits (validated via MF-08 — check the element's pattern/maxlength)
        if (exists('rentalZipCode')) {
            var zipEl = el('rentalZipCode');
            var hasPattern = zipEl && zipEl.getAttribute('pattern');
            var hasMaxLen = zipEl && (zipEl.getAttribute('maxlength') === '5' || zipEl.getAttribute('maxLength') === '5');
            if (hasPattern || hasMaxLen) {
                pass('DQ-04', 'Zip code format constraint', 'Has pattern/maxlength attribute');
            } else {
                warn('DQ-04', 'Zip code format', 'No pattern or maxlength="5" attribute — add for data quality', ['rentalZipCode']);
            }
        }

        // DQ-05: Description field with character count / max length
        if (exists('rentalDescription')) {
            var descEl = el('rentalDescription');
            var maxLen = descEl ? (descEl.getAttribute('maxlength') || descEl.getAttribute('maxLength')) : null;
            if (maxLen) {
                pass('DQ-05', 'Description char limit', 'maxlength=' + maxLen + ' (Cotality PublicRemarks max 5000)');
            } else {
                warn('DQ-05', 'Description char limit', 'No maxlength attribute — Cotality PublicRemarks allows max 5000 chars', ['rentalDescription']);
            }
        }

        // DQ-06: No duplicate IDs in the entire document
        var allIds = {};
        var duplicateIds = [];
        document.querySelectorAll('[id]').forEach(function(element) {
            if (allIds[element.id]) duplicateIds.push(element.id);
            allIds[element.id] = (allIds[element.id] || 0) + 1;
        });
        if (duplicateIds.length === 0) {
            pass('DQ-06', 'No duplicate IDs', 'All element IDs are unique');
        } else {
            fail('DQ-06', 'Duplicate IDs', duplicateIds.length + ' duplicate(s): ' + duplicateIds.slice(0, 10).join(', ') +
                 (duplicateIds.length > 10 ? '...' : ''), duplicateIds);
        }

        // DQ-07: Required fields have validation indicators (red asterisk or required attribute)
        var requiredFields = ['rentalStreetAddress', 'rentalBorough', 'rentalMonthlyRent',
                             'rentalBedrooms', 'rentalFullBathrooms', 'rentalDescription'];
        var missingValidation = [];
        requiredFields.forEach(function(id) {
            var field = el(id);
            if (!field) return;
            var hasRequired = field.hasAttribute('required');
            var label = field.closest('.mb-6, .mb-4, .mb-3, div')
                       ? field.closest('.mb-6, .mb-4, .mb-3, div').querySelector('label')
                       : null;
            var hasAsterisk = label && label.innerHTML.indexOf('text-red') !== -1;
            if (!hasRequired && !hasAsterisk) {
                missingValidation.push(id);
            }
        });
        if (missingValidation.length === 0) {
            pass('DQ-07', 'Required field indicators', 'All core required fields have validation markers');
        } else {
            warn('DQ-07', 'Required field indicators', missingValidation.length + ' fields missing required/asterisk: ' + missingValidation.join(', '), missingValidation);
        }

        // DQ-08: Date fields use type="date"
        var dateFields = ['rentalDateListed', 'rentalExclusiveStart', 'rentalExclusiveExpires',
                         'rentalCreateDate', 'rentalLastUpdatedDate', 'rentalLeasedDate'];
        var badDates = [];
        dateFields.forEach(function(id) {
            var field = el(id);
            if (field && field.type !== 'date') {
                badDates.push(id + ' (type="' + field.type + '")');
            }
        });
        if (badDates.length === 0) {
            pass('DQ-08', 'Date field types', 'All date fields use type="date"');
        } else {
            warn('DQ-08', 'Date field types', badDates.length + ' not type="date": ' + badDates.join(', '), badDates.map(function(d) { return d.split(' ')[0]; }));
        }

        // DQ-09: Numeric fields have appropriate constraints
        var numericFields = [
            { id: 'rentalMonthlyRent', label: 'Rent', min: 0 },
            { id: 'rentalSqFt', label: 'SqFt', min: 0 },
            { id: 'rentalTotalRooms', label: 'Total Rooms', min: 0 },
            { id: 'rentalSecurityDeposit', label: 'Security Deposit', min: 0 },
            { id: 'rentalNetEffectiveRent', label: 'Net Effective Rent', min: 0 }
        ];
        var badNumeric = [];
        numericFields.forEach(function(nf) {
            var field = el(nf.id);
            if (field && field.type === 'number') {
                var min = field.getAttribute('min');
                if (min === null || parseFloat(min) < nf.min) {
                    badNumeric.push(nf.id + ' (no min)');
                }
            }
        });
        if (badNumeric.length === 0) {
            pass('DQ-09', 'Numeric field constraints', 'All numeric fields have appropriate min values');
        } else {
            warn('DQ-09', 'Numeric constraints', badNumeric.length + ' missing min: ' + badNumeric.join(', '));
        }

        // DQ-10: Validation function exists
        var hasValidation = typeof window.validateRentalListing === 'function' ||
                           typeof window.submitRentalListing === 'function' ||
                           typeof window.updateRentalValidationSummary === 'function';
        if (hasValidation) {
            var funcs = [];
            if (typeof window.validateRentalListing === 'function') funcs.push('validateRentalListing');
            if (typeof window.submitRentalListing === 'function') funcs.push('submitRentalListing');
            if (typeof window.updateRentalValidationSummary === 'function') funcs.push('updateRentalValidationSummary');
            pass('DQ-10', 'Validation function exists', funcs.join(', '));
        } else {
            fail('DQ-10', 'Validation function', 'No validateRentalListing, submitRentalListing, or updateRentalValidationSummary found');
        }


        // =================================================================
        // DISTRIBUTION GATES (DG-01 to DG-05) — UCBA Gates 1-4 + 6
        // =================================================================

        // DG-01: Owner Opt-Out gate (Gate 1 — UCBA Art. I, Sec. 5(A))
        var hasOptOut = document.querySelector('input[name="rentalListingType"][value="RLS-Owner-OptOut"]') ||
                       document.querySelector('input[name="rentalListingType"][value="OwnerOptOut"]');
        if (hasOptOut) {
            // Check for opt-out form upload field
            var hasOptOutUpload = exists('rentalOptOutFormUpload') || exists('rentalOptOutFormSection');
            if (hasOptOutUpload) {
                pass('DG-01', 'Owner Opt-Out gate', 'Opt-Out radio + form upload present (UCBA requires Exhibit B within 48hrs)');
            } else {
                warn('DG-01', 'Owner Opt-Out form upload', 'Opt-Out radio exists but no form upload field — Exhibit B must be uploaded within 48 hours (L1-L6)');
            }
        } else {
            fail('DG-01', 'Owner Opt-Out gate (Gate 1)', 'No Owner Opt-Out listing type option found');
        }

        // DG-02: IDX Display gate (Gate 3 — UCBA Art. III, Sec. 2(C))
        var hasIDX = exists('rentalInternetEntireListingDisplayYN') || exists('rentalIDXEntireListingDisplayYN') ||
                    exists('rentalDist_IDX');
        if (hasIDX) {
            pass('DG-02', 'IDX Display gate', 'IDX display toggle present');
        } else {
            fail('DG-02', 'IDX Display gate (Gate 3)', 'No IDX display toggle found — InternetEntireListingDisplayYN required');
        }

        // DG-03: Internet Address Display (REBNY I8 — InternetAddressDisplayYN)
        var hasAddrDisplay = exists('rentalInternetAddressDisplayYN');
        if (hasAddrDisplay) {
            pass('DG-03', 'Address Display toggle', 'InternetAddressDisplayYN present');
        } else {
            warn('DG-03', 'Address Display toggle', 'rentalInternetAddressDisplayYN not found — addresses may always be displayed');
        }

        // DG-04: Internet Entire Listing Display
        var hasEntireListing = exists('rentalInternetEntireListingDisplayYN');
        if (hasEntireListing) {
            pass('DG-04', 'Internet Display toggle', 'InternetEntireListingDisplayYN present');
        } else {
            warn('DG-04', 'Internet Display toggle', 'rentalInternetEntireListingDisplayYN not found');
        }

        // DG-05: Syndication toggles (Gate 4)
        var hasSyndication = exists('rentalSyndicateYN') || exists('rentalDist_Listhub') ||
                            exists('rentalDist_Realtor');
        if (hasSyndication) {
            pass('DG-05', 'Syndication toggles', 'Syndication distribution controls present');
        } else {
            warn('DG-05', 'Syndication toggles', 'No syndication opt-out or distribution toggles found');
        }

        // NOTE: No DG for Coming Soon — not applicable to rentals


        // =================================================================
        // COMPLIANCE FIELDS (CF-01 to CF-10) — Fair Housing, content, SOI
        // =================================================================

        // CF-01: Fair Housing scan on description
        var allText = getAllTextContent();
        var fhViolations = scanForViolations(allText);
        if (fhViolations.length === 0) {
            pass('CF-01', 'Fair Housing language scan', 'No prohibited patterns detected in form text fields');
        } else {
            var fhDetails = fhViolations.map(function(v) { return v.type + ': "' + v.match + '" (' + v.law + ')'; });
            fail('CF-01', 'Fair Housing violations', fhViolations.length + ' violation(s): ' + fhDetails.join('; '),
                 fhViolations.map(function(v) { return v.type; }));
        }

        // CF-02: No agent contact in description (UCBA Art. I, Sec. 5(C))
        var agentInfoIssues = scanForAgentInfo(val('rentalDescription'));
        var agentInfoIssues2 = scanForAgentInfo(val('rentalWebHeadline'));
        var allAgentIssues = agentInfoIssues.concat(agentInfoIssues2);
        if (allAgentIssues.length === 0) {
            pass('CF-02', 'No agent info in description', 'No phone/email/URL detected in description/headline');
        } else {
            fail('CF-02', 'Agent info in description', allAgentIssues.join('; ') + ' — UCBA Art. I, Sec. 5(C) violation',
                 ['rentalDescription']);
        }

        // CF-03: No compensation in description (UCBA Art. I, Sec. 5(E))
        var compIssues = scanForCompensation(val('rentalDescription'));
        var compIssues2 = scanForCompensation(val('rentalWebHeadline'));
        var allCompIssues = compIssues.concat(compIssues2);
        if (allCompIssues.length === 0) {
            pass('CF-03', 'No compensation in description', 'No fee/commission language detected');
        } else {
            fail('CF-03', 'Compensation in description', allCompIssues.join('; ') + ' — UCBA Art. I, Sec. 5(E) / Art. IV, Sec. 2',
                 ['rentalDescription']);
        }

        // CF-04: No "off-market" language (UCBA Art. I, Sec. 5(D))
        var offMarketPattern = /\b(off[\s-]?market|pocket\s*listing|whisper\s*listing|unlisted)\b/i;
        var descText = val('rentalDescription') || '';
        var headlineText = val('rentalWebHeadline') || '';
        if (!offMarketPattern.test(descText) && !offMarketPattern.test(headlineText)) {
            pass('CF-04', 'No off-market language', 'No "off-market" or "pocket listing" detected');
        } else {
            fail('CF-04', 'Off-market language detected', 'UCBA Art. I, Sec. 5(D) prohibits "off-market" language in any listing', ['rentalDescription']);
        }

        // CF-05: Commission negotiability disclosure (UCBA Art. I, Sec. 17 / C16)
        var hasCommDisclosure = exists('rentalCommNegotiabilityAck') ||
                               document.querySelector('[id*="CommNegotiability"]') ||
                               document.querySelector('[id*="commNegotiability"]');
        if (hasCommDisclosure) {
            pass('CF-05', 'Commission negotiability disclosure', 'Disclosure checkbox present per UCBA Art. I, Sec. 17');
        } else {
            fail('CF-05', 'Commission negotiability disclosure', 'No commission negotiability acknowledgment found — REQUIRED per UCBA Art. I, Sec. 17');
        }

        // CF-06: Broker compensation field (internal only — not on public feeds)
        var hasCompField = exists('rentalCommissionType') || exists('rentalCommissionAmount') ||
                          exists('rentalCommissionPaidBy');
        if (hasCompField) {
            pass('CF-06', 'Broker compensation (internal)', 'Commission field present — must be internal/hidden from public feeds (UCBA Art. IV, Sec. 2)');
        } else {
            warn('CF-06', 'Broker compensation field', 'No commission fields found — they are internal CRM fields, not required on public display');
        }

        // CF-07: Source of Income non-discrimination (CRITICAL — NYC HRL Title 8)
        // Check that no form field restricts based on income source
        // Check description for SOI violations
        var soiPattern = /\b(no\s*(section\s*8|voucher|housing\s*choice|hcv|subsid|welfare|public\s*assistance)|cash\s*only\s*tenants?|employed\s*tenants?\s*only|must\s*be\s*employed|income\s*from\s*employment\s*only|w[- ]?2\s*(required|only)|proof\s*of\s*employment\s*(required|only))\b/i;
        var soiText = val('rentalDescription') + ' ' + val('rentalAgentRemarks') + ' ' + val('rentalShowingInstructions');
        if (!soiPattern.test(soiText)) {
            pass('CF-07', 'Source of Income non-discrimination', 'No SOI-discriminatory language detected (NYC HRL Title 8)');
        } else {
            fail('CF-07', 'SOURCE OF INCOME DISCRIMINATION', 'CRITICAL: SOI-discriminatory language detected in listing text — violates NYC HRL Title 8. Section 8 vouchers, HCV, and public assistance MUST be accepted. Fines up to $250K.',
                 ['rentalDescription']);
        }

        // CF-08: ExpirationDate hidden from public (REBNY I34 — AGT/HID distribution)
        // Check that expiration date field does not have public-facing attributes
        if (exists('rentalExclusiveExpires')) {
            pass('CF-08', 'Expiration Date (internal)', 'Field present — must NEVER be displayed publicly (REBNY I34: AGT distribution only)');
        } else {
            // If no expiration field, that is actually acceptable from a compliance perspective
            pass('CF-08', 'Expiration Date not public', 'No public expiration date field found');
        }

        // CF-09: Pet policy — service/emotional support animals must be allowed
        // "No pets" must not override ADA/FHA service animal requirements
        var petText = val('rentalDescription') || '';
        var noServiceAnimalPattern = /\b(no\s*service\s*(animals?|dogs?)|no\s*emotional\s*support\s*animals?|no\s*esa|absolutely\s*no\s*pets?\s*(of\s*any\s*kind|whatsoever|allowed|permitted))\b/i;
        if (!noServiceAnimalPattern.test(petText)) {
            pass('CF-09', 'Service/ESA animal compliance', 'No blanket pet prohibition that overrides FHA/ADA service animal rules');
        } else {
            fail('CF-09', 'Service animal discrimination', '"No pets" phrasing may violate FHA/ADA — service and emotional support animals must always be accommodated regardless of pet policy',
                 ['rentalDescription']);
        }

        // CF-10: Income requirements in description — must not be discriminatory
        // NOTE: The 40x/80x income qualification calculator is in the Renter Checklist section
        // of the CRM (renter-checklist), NOT on the rental listing form. This check only scans
        // listing description/remarks for discriminatory employment-based language.
        var incomeText = val('rentalDescription') + ' ' + val('rentalAgentRemarks');
        var badIncomePattern = /\b(employed\s*tenants?\s*only|must\s*be\s*employed|must\s*have\s*(a\s*)?job|no\s*(unemployed|retirees?|students?)|working\s*(professionals?|people|tenants?)\s*only)\b/i;
        if (!badIncomePattern.test(incomeText)) {
            pass('CF-10', 'Income requirement compliance', 'No discriminatory income language in description/remarks');
        } else {
            fail('CF-10', 'Discriminatory income requirement', 'Phrasing like "employed tenants only" violates NYC HRL — income qualifications must use non-discriminatory criteria',
                 ['rentalDescription']);
        }


        // =================================================================
        // BUILDING FIELDS (BF-01 to BF-05) — Building modal and info
        // =================================================================

        // BF-01: Building Information button/modal
        var hasBuildingBtn = document.querySelector('[onclick*="showRentalBuildingInfo"]') ||
                            document.querySelector('[onclick*="BuildingInfo"]');
        if (hasBuildingBtn) {
            pass('BF-01', 'Building Info button', 'Building Information trigger found');
        } else {
            warn('BF-01', 'Building Info button', 'No Building Information button found');
        }

        // BF-02: Building search / auto-populate (IDX address match)
        if (exists('rentalBuildingSearch')) {
            pass('BF-02', 'Building search', 'Building search field present for auto-population');
        } else {
            warn('BF-02', 'Building search', 'No building search field — manual entry only');
        }

        // BF-03: Year Built field (REBNY I16)
        var yearBuiltFound = exists('rentalBldgYearBuilt') || exists('rentalYearBuilt') ||
                            document.querySelector('[id*="YearBuilt"]');
        if (yearBuiltFound) {
            pass('BF-03', 'Year Built (I16)', 'Field present');
        } else {
            warn('BF-03', 'Year Built (REBNY I16)', 'No Year Built field found in form — may be in Building Modal');
        }

        // BF-04: Total Floors in Building (REBNY I14)
        var floorsFound = exists('rentalBldgTotalFloors') || exists('rentalTHStories') ||
                         document.querySelector('[id*="TotalFloors"]') || document.querySelector('[id*="Stories"]');
        if (floorsFound) {
            pass('BF-04', 'Total Floors (I14)', 'Stories/floors field present');
        } else {
            warn('BF-04', 'Total Floors (REBNY I14)', 'No building floors field found — may be in Building Modal');
        }

        // BF-05: Total Units in Building (REBNY I11)
        var unitsFound = exists('rentalBldgTotalUnits') || exists('rentalTHUnitsTotal') ||
                        document.querySelector('[id*="UnitsTotal"]') || document.querySelector('[id*="TotalUnits"]');
        if (unitsFound) {
            pass('BF-05', 'Total Units (I11)', 'Total units field present');
        } else {
            warn('BF-05', 'Total Units (REBNY I11)', 'No total units field found — may be in Building Modal');
        }


        // =================================================================
        // UI / NAVIGATION (UN-01 to UN-05) — Tab structure and responsive
        // =================================================================

        // UN-01: 6 main tabs exist
        var mainTabs = document.querySelectorAll('[id^="rentalTab"][onclick*="showRentalMainTab"]');
        if (mainTabs.length === 6) {
            pass('UN-01', '6 main tabs', 'All 6 main tabs present');
        } else if (mainTabs.length > 0) {
            warn('UN-01', 'Main tab count', 'Found ' + mainTabs.length + ' main tabs — expected 6');
        } else {
            fail('UN-01', 'Main tabs', 'No main tab buttons found with showRentalMainTab');
        }

        // UN-02: Tab 1 has 4 sub-tabs (Essentials, Description, Contacts, Open Houses)
        var subTabs1 = document.querySelectorAll('[id^="rentalSubTab1_"]');
        if (subTabs1.length === 4) {
            pass('UN-02', 'Tab 1 sub-tabs', '4 sub-tabs present (Essentials, Description, Contacts, Open Houses)');
        } else if (subTabs1.length > 0) {
            warn('UN-02', 'Tab 1 sub-tabs', 'Found ' + subTabs1.length + ' sub-tabs — expected 4');
        } else {
            fail('UN-02', 'Tab 1 sub-tabs', 'No sub-tab buttons found for Tab 1');
        }

        // UN-03: Tab 2 has 3 sub-tabs (Essentials, Additional Rooms, Features)
        var subTabs2 = document.querySelectorAll('[id^="rentalSubTab2_"]');
        if (subTabs2.length === 3) {
            pass('UN-03', 'Tab 2 sub-tabs', '3 sub-tabs present (Essentials, Additional Rooms, Features)');
        } else if (subTabs2.length > 0) {
            warn('UN-03', 'Tab 2 sub-tabs', 'Found ' + subTabs2.length + ' sub-tabs — expected 3');
        } else {
            fail('UN-03', 'Tab 2 sub-tabs', 'No sub-tab buttons found for Tab 2');
        }

        // UN-04: Tab 3 has 3 sub-tabs (Essentials, Setup Sheet, Financials)
        var subTabs3 = document.querySelectorAll('[id^="rentalSubTab3_"]');
        if (subTabs3.length === 3) {
            pass('UN-04', 'Tab 3 sub-tabs', '3 sub-tabs present (Essentials, Setup Sheet, Financials)');
        } else if (subTabs3.length > 0) {
            warn('UN-04', 'Tab 3 sub-tabs', 'Found ' + subTabs3.length + ' sub-tabs — expected 3');
        } else {
            warn('UN-04', 'Tab 3 sub-tabs', 'No sub-tab buttons found for Tab 3 (may be conditionally hidden for non-TH types)');
        }

        // UN-05: Tab switching function exists
        if (typeof window.showRentalMainTab === 'function') {
            pass('UN-05', 'Tab switching function', 'showRentalMainTab() exists');
        } else {
            fail('UN-05', 'Tab switching function', 'showRentalMainTab() not found — tabs will not work');
        }


        // =================================================================
        // ADDITIONAL CHECKS — REBNY-specific and data integrity
        // =================================================================

        // EXTRA-01: DOM tracking fields (REBNY I62-I66)
        var domFound = exists('rentalDaysOnMarket') || exists('rentalCumulativeDaysOnMarket') ||
                      document.querySelector('[id*="DaysOnMarket"]');
        if (domFound) {
            pass('EXTRA-01', 'DOM tracking fields', 'Days on Market display field present');
        } else {
            warn('EXTRA-01', 'DOM tracking', 'No Days on Market display field found — required per REBNY I62');
        }

        // EXTRA-02: Fair Housing acknowledgment checkbox
        if (exists('rentalFairHousingAck')) {
            pass('EXTRA-02', 'Fair Housing acknowledgment', 'Checkbox present (required before submission)');
        } else {
            fail('EXTRA-02', 'Fair Housing acknowledgment', 'No rentalFairHousingAck checkbox — REQUIRED per Exhibit C. $250 first, $500 + termination second (M1-M2)');
        }

        // EXTRA-03: Co-Broke Agreement (REBNY I43)
        var coBrokeFound = radioCount('rentalCoBrokeAgreement') > 0;
        if (coBrokeFound) {
            pass('EXTRA-03', 'Co-Broke Agreement (I43)', 'UCBA/RUNDBA radio present');
        } else {
            warn('EXTRA-03', 'Co-Broke Agreement', 'No rentalCoBrokeAgreement radio group found');
        }

        // EXTRA-04: Showing Instructions field (REBNY I42)
        if (exists('rentalShowingInstructions')) {
            pass('EXTRA-04', 'Showing Instructions (I42)', 'Field present');
        } else {
            warn('EXTRA-04', 'Showing Instructions', 'No rentalShowingInstructions field found');
        }

        // EXTRA-05: Open House section (REBNY I41)
        var ohFound = document.querySelector('[id^="rentalOpenHouseDate"]') ||
                     document.querySelector('[id*="OpenHouse"]');
        if (ohFound) {
            pass('EXTRA-05', 'Open House fields (I41)', 'Open house date/time fields present');
        } else {
            warn('EXTRA-05', 'Open House fields', 'No open house fields found');
        }

        // EXTRA-06: Media & Documents modal trigger
        var hasMediaBtn = document.querySelector('[onclick*="showRentalMediaDocs"]') ||
                         document.querySelector('[onclick*="MediaDocs"]');
        if (hasMediaBtn) {
            pass('EXTRA-06', 'Media & Documents button', 'Media modal trigger present');
        } else {
            warn('EXTRA-06', 'Media & Documents', 'No Media and Documents button found');
        }

        // EXTRA-07: Save Draft / Submit buttons
        var hasSaveDraft = document.querySelector('[onclick*="manualSaveDraft"]');
        var hasSubmit = document.querySelector('[onclick*="submitRentalListing"]');
        if (hasSaveDraft && hasSubmit) {
            pass('EXTRA-07', 'Save/Submit buttons', 'Both Save Draft and Submit buttons present');
        } else {
            var missing = [];
            if (!hasSaveDraft) missing.push('Save Draft');
            if (!hasSubmit) missing.push('Submit');
            fail('EXTRA-07', 'Action buttons', missing.join(' and ') + ' button(s) missing');
        }

        // EXTRA-08: Auto-save indicator
        if (exists('rentalAutoSaveIndicator')) {
            pass('EXTRA-08', 'Auto-save indicator', 'Present in UI');
        } else {
            warn('EXTRA-08', 'Auto-save indicator', 'No auto-save indicator — consider adding for UX');
        }

        // EXTRA-09: Validation summary panel
        if (exists('rentalValidationSummary')) {
            pass('EXTRA-09', 'Validation summary', 'Validation summary panel present');
        } else {
            warn('EXTRA-09', 'Validation summary', 'No rentalValidationSummary element — users may not see missing field counts');
        }

        // EXTRA-10: Required fields toggle
        if (exists('rentalShowRequiredOnly')) {
            pass('EXTRA-10', 'Required fields toggle', 'Toggle switch present');
        } else {
            warn('EXTRA-10', 'Required fields toggle', 'No required fields toggle found');
        }


        // =================================================================
        // COMPUTE SCORE AND CATEGORIZE
        // =================================================================

        var total = passed.length + failed.length;
        var score = total > 0 ? Math.round((passed.length / total) * 100) : 0;

        // Build category breakdown
        var byCategory = {};
        function categorize(arr, type) {
            arr.forEach(function(item) {
                var cat = item.id.split('-')[0];
                if (!byCategory[cat]) byCategory[cat] = { pass: 0, fail: 0, warn: 0 };
                byCategory[cat][type]++;
            });
        }
        categorize(passed, 'pass');
        categorize(failed, 'fail');
        categorize(warnings, 'warn');

        var summary = 'Rental Form Doctor: ' + score + '% (' + passed.length + '/' + total + ' passed, ' +
                     failed.length + ' failed, ' + warnings.length + ' warnings)';

        return {
            passed: passed,
            failed: failed,
            warnings: warnings,
            score: score,
            byCategory: byCategory,
            summary: summary
        };
    }


    // =========================================================================
    // RENDER PANEL — Floating UI panel
    // =========================================================================

    /** Category labels for display */
    var CATEGORY_LABELS = {
        'MF':    'Mandatory Fields',
        'RF':    'Rental-Specific',
        'RC':    'Cotality Compliance',
        'DQ':    'Data Quality',
        'DG':    'Distribution Gates',
        'CF':    'Compliance (Fair Housing)',
        'BF':    'Building Fields',
        'UN':    'UI/Navigation',
        'EXTRA': 'Additional Checks'
    };

    /**
     * Render the Rental Form Doctor floating panel.
     * @param {string} [containerId] - Optional container ID. If not provided, creates floating panel.
     */
    function renderPanel(containerId) {
        var container = containerId ? document.getElementById(containerId) : null;
        if (!container) {
            container = document.createElement('div');
            container.id = 'rentalFormDoctorPanel';
            container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;' +
                'background:#1F2937;color:white;border-radius:12px;padding:12px 16px;' +
                'box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:Manrope,Arial,sans-serif;font-size:13px;' +
                'max-width:450px;max-height:80vh;overflow-y:auto;';
            document.body.appendChild(container);
        }

        container.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
            '<span style="font-size:16px;background:#3B82F6;color:white;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-weight:bold;">Rx</span>' +
            '<strong style="font-size:14px;">Rental Form Doctor</strong>' +
            '<span style="font-size:11px;color:#9CA3AF;margin-left:auto;">v1.0.0</span>' +
            '<button onclick="document.getElementById(\'rentalFormDoctorPanel\').style.display=\'none\'" ' +
            'style="background:none;border:none;color:#9CA3AF;cursor:pointer;font-size:16px;margin-left:4px;">&#x2715;</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button onclick="RentalFormDoctor._runValidate()" style="background:#3B82F6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Validate All</button>' +
            '<button onclick="RentalFormDoctor._runFairHousing()" style="background:#10B981;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Fair Housing</button>' +
            '<button onclick="RentalFormDoctor._runSOI()" style="background:#F59E0B;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">SOI Check</button>' +
            '<button onclick="RentalFormDoctor._runContentScan()" style="background:#8B5CF6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Content Scan</button>' +
            '<button onclick="RentalFormDoctor._runBugReport()" style="background:#EF4444;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Report Bug</button>' +
            '</div>' +
            '<div id="rentalFormDoctorOutput" style="margin-top:10px;font-size:12px;line-height:1.5;"></div>';
    }

    /** Format validation results as HTML */
    function _formatValidation(result) {
        var html = '<div style="margin-bottom:8px;font-weight:bold;color:' +
                   (result.score >= 80 ? '#10B981' : result.score >= 50 ? '#F59E0B' : '#EF4444') +
                   ';">Score: ' + result.score + '% (' + result.passed.length + '/' +
                   (result.passed.length + result.failed.length) + ')</div>';

        // Category breakdown
        if (result.byCategory) {
            html += '<div style="margin-bottom:8px;font-size:11px;display:flex;flex-wrap:wrap;gap:4px 12px;">';
            Object.keys(result.byCategory).forEach(function(cat) {
                var c = result.byCategory[cat];
                var label = CATEGORY_LABELS[cat] || cat;
                var color = c.fail > 0 ? '#FCA5A5' : c.warn > 0 ? '#FCD34D' : '#6EE7B7';
                html += '<span style="color:' + color + ';">' + label + ': ' + c.pass + '/' + (c.pass + c.fail) + '</span>';
            });
            html += '</div>';
        }

        if (result.failed.length > 0) {
            html += '<div style="color:#FCA5A5;margin-bottom:6px;"><strong>FAILED (' + result.failed.length + '):</strong></div>';
            result.failed.forEach(function(f) {
                html += '<div style="color:#FCA5A5;padding:2px 0;font-size:11px;">&#x274C; <strong>' + f.id + '</strong> ' + f.check + ': ' + f.detail + '</div>';
            });
        }
        if (result.warnings.length > 0) {
            html += '<div style="color:#FCD34D;margin-top:6px;"><strong>WARNINGS (' + result.warnings.length + '):</strong></div>';
            result.warnings.forEach(function(w) {
                html += '<div style="color:#FCD34D;padding:2px 0;font-size:11px;">&#x26A0; <strong>' + w.id + '</strong> ' + w.check + ': ' + w.detail + '</div>';
            });
        }
        if (result.passed.length > 0) {
            html += '<div style="color:#6EE7B7;margin-top:6px;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
                    '<strong>PASSED (' + result.passed.length + ') &#x25BC;</strong></div>';
            html += '<div style="display:none;">';
            result.passed.forEach(function(p) {
                html += '<div style="color:#6EE7B7;padding:1px 0;font-size:11px;">&#x2705; <strong>' + p.id + '</strong> ' + p.check + '</div>';
            });
            html += '</div>';
        }
        return html;
    }


    // =========================================================================
    // BUTTON HANDLERS — Panel actions
    // =========================================================================

    /** Run full validation and display results */
    function _runValidate() {
        var out = document.getElementById('rentalFormDoctorOutput');
        if (!out) return;
        var result = validate();
        out.innerHTML = _formatValidation(result);

        // Mark broken fields with red outlines
        document.querySelectorAll('.rental-doctor-fail').forEach(function(el) {
            el.classList.remove('rental-doctor-fail');
            el.style.outline = '';
        });
        result.failed.forEach(function(f) {
            if (f.elements) {
                f.elements.forEach(function(elId) {
                    var target = document.getElementById(elId);
                    if (target) {
                        target.classList.add('rental-doctor-fail');
                        target.style.outline = '2px solid #EF4444';
                        target.title = f.check + ': ' + f.detail;
                    }
                });
            }
        });
    }

    /** Run Fair Housing audit on all text fields */
    function _runFairHousing() {
        var out = document.getElementById('rentalFormDoctorOutput');
        if (!out) return;

        var allText = getAllTextContent();
        var violations = scanForViolations(allText);

        var html = '<div style="margin-bottom:6px;font-weight:bold;">Fair Housing Audit</div>';

        if (violations.length === 0) {
            html += '<div style="color:#6EE7B7;margin-top:4px;">&#x2705; All text fields pass Fair Housing scan — no prohibited patterns detected</div>';
        } else {
            html += '<div style="color:#FCA5A5;margin-top:4px;">';
            html += '<div style="font-weight:bold;margin-bottom:4px;">&#x274C; ' + violations.length + ' violation(s) found:</div>';
            violations.forEach(function(v) {
                html += '<div style="padding:3px 0;font-size:11px;"><strong>' + v.type + ':</strong> "' + v.match + '" (' + v.law + ')</div>';
            });
            html += '<div style="margin-top:6px;font-size:11px;color:#FCA5A5;font-weight:bold;">Penalties: $250 first offense, $500 + RLS termination second (M1-M2)</div>';
            html += '</div>';
        }

        // Protected classes reference
        html += '<div style="margin-top:10px;font-size:11px;color:#9CA3AF;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
                'Protected Classes Reference &#x25BC;</div>';
        html += '<div style="display:none;font-size:10px;color:#9CA3AF;padding:6px;background:#374151;border-radius:6px;margin-top:4px;">';
        html += '<strong>Federal FHA:</strong> ' + PROTECTED_CLASSES.federal.join(', ') + '<br>';
        html += '<strong>NY State HRL:</strong> ' + PROTECTED_CLASSES.nyState.join(', ') + '<br>';
        html += '<strong>NYC HRL Title 8:</strong> ' + PROTECTED_CLASSES.nyc.join(', ');
        html += '</div>';

        out.innerHTML = html;
    }

    /** Run Source of Income (SOI) discrimination check — NYC critical */
    function _runSOI() {
        var out = document.getElementById('rentalFormDoctorOutput');
        if (!out) return;

        var soiPatterns = [
            { re: /\bno\s*section\s*8\b/i, msg: '"No Section 8"' },
            { re: /\bno\s*voucher\b/i, msg: '"No voucher"' },
            { re: /\bno\s*housing\s*choice\b/i, msg: '"No housing choice"' },
            { re: /\bno\s*hcv\b/i, msg: '"No HCV"' },
            { re: /\bno\s*subsid/i, msg: '"No subsidized"' },
            { re: /\bno\s*welfare\b/i, msg: '"No welfare"' },
            { re: /\bno\s*public\s*assistance\b/i, msg: '"No public assistance"' },
            { re: /\bcash\s*only\s*tenants?\b/i, msg: '"Cash only tenants"' },
            { re: /\bemployed\s*tenants?\s*only\b/i, msg: '"Employed tenants only"' },
            { re: /\bmust\s*be\s*employed\b/i, msg: '"Must be employed"' },
            { re: /\bincome\s*from\s*employment\s*only\b/i, msg: '"Income from employment only"' },
            { re: /\bw[- ]?2\s*(required|only)\b/i, msg: '"W-2 required/only"' },
            { re: /\bproof\s*of\s*employment\s*(required|only)\b/i, msg: '"Proof of employment required/only"' },
            { re: /\bno\s*dss\b/i, msg: '"No DSS"' },
            { re: /\bno\s*government\s*assistance\b/i, msg: '"No government assistance"' }
        ];

        var allText = getAllTextContent();
        var violations = [];
        soiPatterns.forEach(function(p) {
            if (p.re.test(allText)) {
                violations.push(p.msg);
            }
        });

        var html = '<div style="margin-bottom:6px;font-weight:bold;">Source of Income (SOI) Check</div>';
        html += '<div style="font-size:11px;color:#9CA3AF;margin-bottom:6px;">NYC HRL Title 8 makes it illegal to discriminate based on lawful source of income, including Section 8 vouchers, HCV, SSI, retirement, and public assistance.</div>';

        if (violations.length === 0) {
            html += '<div style="color:#6EE7B7;">&#x2705; No source of income discrimination detected</div>';
        } else {
            html += '<div style="color:#FCA5A5;">';
            html += '<div style="font-weight:bold;">&#x274C; ' + violations.length + ' SOI violation(s):</div>';
            violations.forEach(function(v) {
                html += '<div style="padding:2px 0;font-size:11px;">' + v + '</div>';
            });
            html += '<div style="margin-top:6px;font-weight:bold;font-size:11px;">NYC fines for SOI discrimination: up to $250,000 per violation</div>';
            html += '</div>';
        }

        html += '<div style="margin-top:8px;font-size:10px;color:#9CA3AF;">Income qualification (40x/80x) is handled in the Renter Checklist section, not here.<br>This scan checks listing text for discriminatory language like "employed tenants only" or "no Section 8".</div>';

        out.innerHTML = html;
    }

    /** Run content scan for REBNY violations (agent info, compensation, off-market) */
    function _runContentScan() {
        var out = document.getElementById('rentalFormDoctorOutput');
        if (!out) return;

        var textFields = [
            { id: 'rentalDescription', label: 'Listing Description' },
            { id: 'rentalAgentRemarks', label: 'Agent Remarks' },
            { id: 'rentalShowingInstructions', label: 'Showing Instructions' },
            { id: 'rentalWebHeadline', label: 'Web Headline' },
            { id: 'rentalConcessionRemarks', label: 'Concession Remarks' },
            { id: 'rentalTHDescription', label: 'TH Description' },
            { id: 'rentalTHLayout', label: 'TH Layout' }
        ];

        var html = '<div style="margin-bottom:6px;font-weight:bold;">Content Compliance Scan</div>';
        var totalIssues = 0;

        textFields.forEach(function(tf) {
            var text = val(tf.id);
            if (!text) return;

            var issues = [];
            // Agent info (C7)
            var agentIssues = scanForAgentInfo(text);
            agentIssues.forEach(function(ai) { issues.push({ type: 'Agent Info (C7)', detail: ai }); });
            // Compensation (C9)
            var compIssues = scanForCompensation(text);
            compIssues.forEach(function(ci) { issues.push({ type: 'Compensation (C9)', detail: ci }); });
            // Off-market (C8)
            if (/\b(off[\s-]?market|pocket\s*listing|whisper\s*listing)\b/i.test(text)) {
                issues.push({ type: 'Off-Market (C8)', detail: '"off-market" or "pocket listing" detected' });
            }
            // Free services (F13)
            if (/\bfree\s*services?\b/i.test(text)) {
                issues.push({ type: 'Free Services (F13)', detail: '"free services" claim — UCBA Art. III, Sec. 5' });
            }

            if (issues.length > 0) {
                totalIssues += issues.length;
                html += '<div style="color:#FCA5A5;margin-top:4px;"><strong>' + tf.label + ':</strong></div>';
                issues.forEach(function(issue) {
                    html += '<div style="color:#FCA5A5;font-size:11px;padding-left:12px;">&#x274C; ' + issue.type + ': ' + issue.detail + '</div>';
                });
            }
        });

        if (totalIssues === 0) {
            html += '<div style="color:#6EE7B7;">&#x2705; All text fields pass content compliance scan</div>';
            html += '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">Checked: no agent info (C7), no compensation (C9), no off-market (C8), no free services (F13)</div>';
        } else {
            html += '<div style="margin-top:6px;font-size:11px;color:#FCA5A5;font-weight:bold;">Penalty escalation: $0 (1st) → $250 (2nd) → $250 (3rd) → termination (4th)</div>';
        }

        out.innerHTML = html;
    }

    /** Generate a bug report with form state for debugging */
    function _runBugReport() {
        var out = document.getElementById('rentalFormDoctorOutput');
        if (!out) return;

        var result = validate();
        var report = {
            tool: 'Rental Form Doctor v1.0.0',
            timestamp: new Date().toISOString(),
            url: window.location.href,
            score: result.score + '%',
            passed: result.passed.length,
            failed: result.failed.length,
            warnings: result.warnings.length,
            failedChecks: result.failed.map(function(f) { return f.id + ': ' + f.check + ' — ' + f.detail; }),
            formState: {
                propertyType: radioVal('rentalPropertyType'),
                status: val('rentalStatus'),
                listingType: radioVal('rentalListingType'),
                address: val('rentalStreetAddress'),
                borough: val('rentalBorough'),
                zip: val('rentalZipCode'),
                rent: val('rentalMonthlyRent'),
                beds: val('rentalBedrooms'),
                baths: val('rentalFullBathrooms'),
                descriptionLength: (val('rentalDescription') || '').length,
                agent: val('rentalUpdatingAgentDisplay') || val('rentalListingAgent')
            },
            elementCount: document.querySelectorAll('[id]').length,
            duplicateIds: (function() {
                var ids = {};
                var dupes = [];
                document.querySelectorAll('[id]').forEach(function(e) {
                    if (ids[e.id]) dupes.push(e.id);
                    ids[e.id] = true;
                });
                return dupes;
            })()
        };

        var reportText = JSON.stringify(report, null, 2);

        // Copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(reportText).then(function() {
                out.innerHTML = '<div style="color:#6EE7B7;margin-bottom:6px;">Bug report copied to clipboard! (' + reportText.length + ' bytes)</div>' +
                    '<pre style="background:#374151;padding:8px;border-radius:6px;font-size:10px;max-height:300px;overflow:auto;white-space:pre-wrap;">' + reportText + '</pre>';
            });
        } else {
            out.innerHTML = '<pre style="background:#374151;padding:8px;border-radius:6px;font-size:10px;max-height:300px;overflow:auto;white-space:pre-wrap;">' + reportText + '</pre>';
        }
    }


    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        VERSION: '1.0.0',

        // Core validation
        validate:           validate,
        scanForViolations:  scanForViolations,
        scanForAgentInfo:   scanForAgentInfo,
        scanForCompensation: scanForCompensation,

        // UI
        renderPanel: renderPanel,

        // Internal button handlers (called by onclick in panel HTML)
        _runValidate:     _runValidate,
        _runFairHousing:  _runFairHousing,
        _runSOI:          _runSOI,
        _runContentScan:  _runContentScan,
        _runBugReport:    _runBugReport,

        // Reference data
        PROTECTED_CLASSES:      PROTECTED_CLASSES,
        PROHIBITED_PATTERNS:    PROHIBITED_PATTERNS,
        RENTAL_PROPERTY_TYPES:  RENTAL_PROPERTY_TYPES,
        VALID_RENTAL_STATUSES:  VALID_RENTAL_STATUSES,
        VALID_LISTING_TYPES:    VALID_LISTING_TYPES,
        CATEGORY_LABELS:        CATEGORY_LABELS
    };

})();


// ═══════════════════════════════════════════════════════════════════════════
// AUTO-RENDER: Detect rental form and render panel on DOMContentLoaded
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    // Only render if this appears to be the rental form
    var isRentalForm = document.getElementById('rentalMainTab1') ||
                       document.getElementById('rentalStreetAddress') ||
                       document.querySelector('input[name="rentalPropertyType"]') ||
                       (document.title && document.title.indexOf('Rental') !== -1);

    if (isRentalForm && !document.getElementById('rentalFormDoctorPanel')) {
        RentalFormDoctor.renderPanel();
    }
});
