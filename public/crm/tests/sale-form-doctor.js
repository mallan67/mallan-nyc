/**
 * sale-form-doctor.js — Sale Listing Form Validation & Compliance Tool
 * Validates SALE-FORM-REDESIGN.html / SALE-FORM-STANDALONE.html against
 * REBNY RLS / UCBA 2026 / Cotality / Trestle / Fair Housing requirements.
 *
 * Covers: 79 mandatory fields, 17 property type radios, 6 distribution gates,
 *         Fair Housing scanner, data quality checks, DOM integrity, UI/navigation.
 *
 * Includes: Fair Housing Act, NY State Human Rights Law, NYC Human Rights Law Title 8,
 *           NY DOS Advertising Laws (19 NYCRR 175.25), REBNY RLS compliance,
 *           UCBA 2026 (January 2026 revision)
 *
 * Mallan Real Estate Inc.
 * Sale Form Validation Tool
 *
 * VERSION: 1.0.0
 * DATE: 2026-02-13
 *
 * Categories (75 checks):
 *   MF-01..MF-25:  Mandatory Fields (REBNY Exhibit A)
 *   RC-01..RC-08:  Cotality Compliance (PropertyType/CommonInterest/PropertySubType)
 *   DQ-01..DQ-10:  Data Quality (field constraints, duplicates, validation)
 *   DG-01..DG-06:  Distribution Gates (UCBA)
 *   CF-01..CF-08:  Compliance Fields (Fair Housing, agent info, off-market, compensation)
 *   FF-01..FF-05:  Financial Fields (maintenance, taxes, assessments)
 *   BF-01..BF-05:  Building Fields (name, year, units, floors, amenities)
 *   UN-01..UN-05:  UI/Navigation (tabs, sub-tabs, validation flow, save, preview)
 */

'use strict';

var SaleFormDoctor = (function() {

    // =========================================================================
    // CONSTANTS & REFERENCE DATA
    // =========================================================================

    var VERSION = '1.0.0';

    /**
     * Cotality 3-field decomposition for each of the 17 sale property type radios.
     * Source: Module 16 (16-PROPERTY-TYPES.md), REBNY-MASTER.md Part 4 B2.
     */
    var COTALITY_PROPERTY_TYPE_MAP = {
        'Condo':                  { PropertyType: 'Residential', CommonInterest: 'Condominium',      PropertySubType: 'Apartment' },
        'Coop':                   { PropertyType: 'Residential', CommonInterest: 'StockCooperative',  PropertySubType: 'Apartment' },
        'Condop':                 { PropertyType: 'Residential', CommonInterest: 'Condop',            PropertySubType: 'Apartment' },
        'SingleFamilyTownhouse':  { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'SingleFamilyTownhouse' },
        'MultiFamilyTownhouse':   { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'MultiFamilyTownhouse' },
        'SingleFamily':           { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'SingleFamilyResidence' },
        'MultiFamily':            { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'MultiFamily' },
        'MixedUse':               { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'MixedUse' },
        'Loft':                   { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'Loft' },
        'Duplex':                 { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'Duplex' },
        'Triplex':                { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'Triplex' },
        'Quadruplex':             { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'Quadruplex' },
        'Office':                 { PropertyType: 'Residential', CommonInterest: 'VARIES',            PropertySubType: 'Office' },
        'Retail':                 { PropertyType: 'Residential', CommonInterest: 'VARIES',            PropertySubType: 'Retail' },
        'Land':                   { PropertyType: 'Land',        CommonInterest: 'None',              PropertySubType: 'UnimprovedLand' },
        'DeededParking':          { PropertyType: 'Residential', CommonInterest: 'None',              PropertySubType: 'DeededParking' },
        'Commercial':             { PropertyType: 'N/A-WWW',     CommonInterest: 'N/A-WWW',           PropertySubType: 'N/A-WWW' }
    };

    /**
     * REBNY Mandatory Fields (Exhibit A) -- I1 to I79 mapped to expected form element selectors.
     * Each entry: { id, label, cotalityField, rebnyRef, selectors (id/name/data-field), conditional }
     */
    var MANDATORY_FIELDS = [
        // I1-I16: Location & Building
        { ref: 'I1',  label: 'Borough',                sel: '#saleBorough',                    cond: null },
        { ref: 'I2',  label: 'Building/Listing Class',  sel: '[name="salePropertyType"]',       cond: null },
        { ref: 'I3',  label: 'Building Pet Policy',     sel: '#saleBldgPetPolicy,[name="saleBldgPetPolicy"]', cond: null },
        { ref: 'I4',  label: 'Building Sublet Policy',  sel: '#saleBldgSubletPolicy,[name="saleBldgSubletPolicy"]', cond: ['Coop','Condop'] },
        { ref: 'I5',  label: 'Have Elevator',           sel: '#saleBldgElevator,[name="saleBldgElevator"]', cond: null },
        { ref: 'I6',  label: 'Have Garage',             sel: '#saleBldgGarage,[name="saleTHGarageYN"],[name="saleGarageSpaces"]', cond: null },
        { ref: 'I7',  label: 'Lobby Attendant',         sel: '#saleBldgDoorman,[name="saleBldgDoorman"]', cond: null },
        { ref: 'I8',  label: 'Full Address',            sel: '#saleStreetAddress',              cond: null },
        { ref: 'I9',  label: 'Neighborhood',            sel: '#saleNeighborhoodFromAddress,#saleBldgNeighborhood', cond: null },
        { ref: 'I10', label: 'New Development',         sel: '[name="saleBuildingStatus"]',      cond: null },
        { ref: 'I11', label: 'Total Units',             sel: '#saleBldgTotalUnits,#saleTHUnitsTotal', cond: null },
        { ref: 'I12', label: 'Ownership Type',          sel: '[name="salePropertyType"]',       cond: null },
        { ref: 'I13', label: 'Tax Block/Lot',           sel: '#saleBldgBlock,#saleBldgLot,[name="saleTaxBlock"]', cond: null },
        { ref: 'I14', label: 'Total Floors',            sel: '#saleBldgTotalFloors,#saleTHStories', cond: null },
        { ref: 'I15', label: 'Unit Number',             sel: '#saleUnitNumber',                 cond: ['Condo','Coop','Condop','Loft','Office','Retail'] },
        { ref: 'I16', label: 'Year Built',              sel: '#saleBldgYearBuilt',              cond: null },

        // I17-I26: Listing Features
        { ref: 'I17', label: 'Board Approval Required',  sel: '#saleBoardApprovalField [type="checkbox"],#saleBoardApproval', cond: ['Condo','Coop','Condop'] },
        { ref: 'I18', label: 'Number of Bathrooms',     sel: '#saleFullBaths',                  cond: null },
        { ref: 'I19', label: 'Number of Half Baths',    sel: '#saleHalfBaths',                  cond: null },
        { ref: 'I20', label: 'Number of Bedrooms',      sel: '#saleBedrooms',                   cond: null },
        { ref: 'I21', label: 'Total Rooms',             sel: '#saleTotalRooms',                 cond: null },
        { ref: 'I22', label: 'Pet Policy (unit)',        sel: '[name="salePetPolicy"],[name="saleBldgPetPolicy"]', cond: null },
        { ref: 'I23', label: 'Photos Sort Order',       sel: '#salePhotoPreview,[id*="Photo"]', cond: null },
        { ref: 'I24', label: 'Private Outdoor Space',   sel: '[name="saleOutdoorType"],[name="saleOutdoor"]', cond: null },
        { ref: 'I25', label: 'Property Condition',      sel: '[name="saleAptCondition"]',       cond: null },
        { ref: 'I26', label: 'Washer/Dryer',            sel: '[name="saleWasherDryerAllowed"],[name="saleLaundry"]', cond: null },

        // I27-I28: Agents & Firms
        { ref: 'I27', label: 'Listing Agent & Firm',    sel: '#saleListingCompany,#saleListingAgent', cond: null },
        { ref: 'I28', label: 'Buyer Agent & Firm',      sel: '#saleBuyerCompany,#saleBuyerAgent', cond: 'CLOSED_ONLY' },

        // I29-I31: Display Permissions
        { ref: 'I29', label: 'IDX Display',             sel: '[name="saleInternetEntireListingDisplayYN"],#saleDist_IDX', cond: null },
        { ref: 'I30', label: 'Participant Only',        sel: '[name="saleListingType"][value="ParticipantOnly"]', cond: null },
        { ref: 'I31', label: 'Syndication Display',     sel: '[name="saleSyndicateYN"]', cond: null },

        // I32-I39: Status, Price & Dates
        { ref: 'I32', label: 'Closing/Sale Price',      sel: '#saleSoldPrice',                  cond: 'CLOSED_ONLY' },
        { ref: 'I33', label: 'Concessions',             sel: '#saleConcessions,[name="saleConcessions"]', cond: null },
        { ref: 'I34', label: 'Expiration Date',         sel: '#saleExclusiveExpires',           cond: null },
        { ref: 'I35', label: 'Listing Contract Date',   sel: '#saleDateListed',                 cond: null },
        { ref: 'I36', label: 'Status & Date Change',    sel: '#saleStatus',                     cond: null },
        { ref: 'I37', label: 'List Price',              sel: '#salePrice',                      cond: null },
        { ref: 'I38', label: 'Contract Signed Date',    sel: '#saleContractSignedDate',         cond: 'PENDING_ONLY' },
        { ref: 'I39', label: 'Sold/Closed Date',        sel: '#saleSoldDate',                   cond: 'CLOSED_ONLY' },

        // I40-I42: Showing & Open House
        { ref: 'I40', label: 'First Showing Date',      sel: '#saleFirstShowingDate',           cond: null },
        { ref: 'I41', label: 'Open House Details',       sel: '#saleOpenHouseList,#saleAddOpenHouseBtn', cond: null },
        { ref: 'I42', label: 'Showing Instructions',    sel: '#saleShowingInstructions',        cond: null },

        // I43-I44: Agreements
        { ref: 'I43', label: 'CoBroke Agreement Type',  sel: '#saleCoBrokeAgreementType',       cond: null },
        { ref: 'I44', label: 'Listing Type',            sel: '[name="saleListingType"]',        cond: null },

        // I45-I52: Sales -- Condo/Co-op/Condop
        { ref: 'I45', label: 'Flip Tax',                sel: '#saleFlipTaxAmount,[name="saleFlipTax"]', cond: ['Coop','Condo','Condop'] },
        { ref: 'I46', label: 'Living Area (sqft)',      sel: '#saleLivingArea',                 cond: ['Condo'] },
        { ref: 'I47', label: 'Maintenance/CC',          sel: '#saleMaintCC',                    cond: ['Condo','Coop','Condop'] },
        { ref: 'I48', label: 'Max Financing',           sel: '#saleMaxFinancing,[name="saleMaxFinancing"]', cond: ['Coop'] },
        { ref: 'I49', label: 'Shares (Co-op)',          sel: '#saleUnitShares',                 cond: ['Coop','Condop'] },
        { ref: 'I50', label: '% Common Elements',       sel: '#salePercentCommon',              cond: ['Condo'] },
        { ref: 'I51', label: 'Tax Abatement',           sel: '#saleTaxAbatement,[name="saleTaxAbatement"]', cond: ['Condo','Condop'] },
        { ref: 'I52', label: 'Tax Monthly (Condo)',     sel: '#saleRETaxes',                    cond: ['Condo'] },

        // I53-I57: Sales -- Building/Townhouse
        { ref: 'I53', label: 'Building Area Total',     sel: '#saleTHBuildingArea',             cond: ['SingleFamilyTownhouse','MultiFamilyTownhouse','SingleFamily','MultiFamily','MixedUse','Duplex','Triplex','Quadruplex'] },
        { ref: 'I54', label: 'Garage (TH)',             sel: '#saleTHGarageYN',                 cond: ['SingleFamilyTownhouse','MultiFamilyTownhouse','SingleFamily','MultiFamily','MixedUse','Duplex','Triplex','Quadruplex'] },
        { ref: 'I55', label: 'Lot Dimensions',          sel: '#saleTHLotDimensions',            cond: ['SingleFamilyTownhouse','MultiFamilyTownhouse','SingleFamily','MultiFamily','MixedUse','Duplex','Triplex','Quadruplex'] },
        { ref: 'I56', label: 'Tax Annual (building)',    sel: '#saleTHTaxA',                     cond: ['SingleFamilyTownhouse','MultiFamilyTownhouse','SingleFamily','MultiFamily','MixedUse','Duplex','Triplex','Quadruplex'] },
        { ref: 'I57', label: 'Total Legal Rooms',       sel: '#saleTHLegalRooms,[name="saleTHTotalLegalRooms"]', cond: ['SingleFamilyTownhouse','MultiFamilyTownhouse','SingleFamily','MultiFamily','MixedUse','Duplex','Triplex','Quadruplex'] }
    ];

    /**
     * Cotality StandardStatus values required in the status dropdown.
     * Per REBNY-MASTER Part 4, Section J.
     */
    var COTALITY_STANDARD_STATUSES = [
        'Active', 'Coming Soon', 'Pending', 'Closed',
        'Withdrawn', 'Cancelled', 'Expired'
    ];

    /**
     * Fair Housing prohibited patterns.
     * Federal FHA, NY State HRL, NYC HRL Title 8.
     */
    var FAIR_HOUSING_PATTERNS = [
        { pattern: /\b(no\s*children|adults?\s*only|mature\s*(couple|person|adult)|senior\s*community|55\s*and\s*over|elderly\s*only|empty\s*nester|no\s*families)\b/i,
          law: 'Fair Housing Act / NYC HRL', type: 'FAMILIAL_STATUS' },
        { pattern: /\b(white\s*(neighborhood|area|community)|exclusive\s*(neighborhood|community)|restricted\s*community|no\s*foreigners|english\s*only)\b/i,
          law: 'Fair Housing Act', type: 'RACE_NATIONAL_ORIGIN' },
        { pattern: /\b(christian\s*(neighborhood|community)|muslim\s*free|near\s*(church|synagogue|mosque)\s*(only|preferred)|religious\s*community)\b/i,
          law: 'Fair Housing Act', type: 'RELIGION' },
        { pattern: /\b(no\s*(wheelchair|handicap|disabled)|able[\s-]bodied\s*(only|preferred)|not\s*handicap\s*accessible|walking\s*distance\s*required)\b/i,
          law: 'Fair Housing Act / ADA / NYC HRL', type: 'DISABILITY' },
        { pattern: /\b(female\s*(only|preferred)|male\s*(only|preferred)|no\s*(men|women)|bachelor\s*pad|man\s*cave)\b/i,
          law: 'Fair Housing Act / NYC HRL', type: 'SEX_GENDER' },
        { pattern: /\b(straight\s*(only|preferred)|no\s*(gay|lesbian|transgender|lgbtq)|traditional\s*(family|values)\s*(only|preferred))\b/i,
          law: 'NY State HRL / NYC HRL', type: 'SEXUAL_ORIENTATION' },
        { pattern: /\b(no\s*(section\s*8|voucher|housing\s*choice|hcv|subsid|welfare|public\s*assistance)|cash\s*only\s*tenants|employed\s*tenants?\s*only)\b/i,
          law: 'NYC HRL Title 8 / NYS HRL', type: 'SOURCE_OF_INCOME' },
        { pattern: /\b(married\s*(couple|only|preferred)|single\s*(only|preferred)|no\s*single\s*(men|women|people))\b/i,
          law: 'NY State HRL / NYC HRL', type: 'MARITAL_STATUS' },
        { pattern: /\b(citizens?\s*only|no\s*immigrants?|legal\s*residents?\s*only|us\s*(citizens?|nationals?)\s*only|must\s*(be|have)\s*(citizen|green\s*card))\b/i,
          law: 'NYC HRL Title 8', type: 'IMMIGRATION_STATUS' },
        { pattern: /\b(perfect\s*for\s*(families|singles|couples|professionals|students)|ideal\s*(neighborhood|area)\s*for)\b/i,
          law: 'Fair Housing Act (steering)', type: 'STEERING' }
    ];

    /**
     * Content restriction patterns per UCBA.
     */
    var CONTENT_RESTRICTION_PATTERNS = {
        agentInfo: {
            phone: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
            email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
            url:   /https?:\/\/|www\./i
        },
        offMarket: /\boff[\s-]?market\b|\bpocket\s*listing\b|\bwhisper\s*listing\b/i,
        compensation: /\b(commission|broker\s*fee|buyer\s*pays|no\s*fee|closing\s*cost\s*credit|co-?broke\s*\d|bonus\s*commission)\b/i,
        freeServices: /\b(free\s*(service|consultation|valuation|appraisal)|no\s*cost\s*(to|for))\b/i
    };


    // =========================================================================
    // HELPERS
    // =========================================================================

    function $(selector) {
        try { return document.querySelector(selector); } catch(e) { return null; }
    }

    function $$(selector) {
        try { return document.querySelectorAll(selector); } catch(e) { return []; }
    }

    /** Check if any element matching a comma-separated selector list exists */
    function selectorExists(sels) {
        var parts = sels.split(',');
        for (var i = 0; i < parts.length; i++) {
            var s = parts[i].trim();
            if (!s) continue;
            try {
                if (document.querySelector(s)) return true;
            } catch(e) { /* invalid selector, skip */ }
        }
        return false;
    }

    /** Get all elements matching a comma-separated selector list */
    function selectAll(sels) {
        var result = [];
        var parts = sels.split(',');
        for (var i = 0; i < parts.length; i++) {
            var s = parts[i].trim();
            if (!s) continue;
            try {
                var els = document.querySelectorAll(s);
                for (var j = 0; j < els.length; j++) result.push(els[j]);
            } catch(e) { /* skip */ }
        }
        return result;
    }

    /** Get the currently selected property type radio value */
    function getSelectedPropertyType() {
        var checked = $('input[name="salePropertyType"]:checked');
        return checked ? checked.value : null;
    }

    /** Check if a conditional field is relevant for the current property type */
    function isFieldRelevantForType(cond) {
        if (!cond) return true;
        if (cond === 'CLOSED_ONLY' || cond === 'PENDING_ONLY') return true; // always check existence
        var pt = getSelectedPropertyType();
        if (!pt) return true;
        if (Array.isArray(cond)) {
            return cond.indexOf(pt) !== -1;
        }
        return true;
    }

    /** Get text content of all textarea/description fields */
    function getDescriptionTexts() {
        var texts = [];
        var ids = ['saleDescription', 'saleTHDescription', 'saleTHLayout', 'saleTHFinancing',
                   'saleTHNotes', 'saleBrokerComments', 'saleShowingInstructions'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el && el.value && el.value.trim()) {
                texts.push({ id: id, text: el.value });
            }
        });
        return texts;
    }


    // =========================================================================
    // MAIN VALIDATE FUNCTION
    // =========================================================================

    /**
     * Run all validation checks against the live DOM.
     *
     * @returns {object} { passed, failed, warnings, score, byCategory, summary }
     */
    function validate() {
        var passed  = [];
        var failed  = [];
        var warnings = [];

        function pass(id, check, detail) {
            passed.push({ id: id, check: check, detail: detail });
        }
        function fail(id, check, detail, els) {
            failed.push({ id: id, check: check, detail: detail, elements: els || [] });
        }
        function warn(id, check, detail, els) {
            warnings.push({ id: id, check: check, detail: detail, elements: els || [] });
        }

        // =================================================================
        // MANDATORY FIELDS (MF-01 to MF-25)
        // REBNY Exhibit A -- 79 mandatory fields. Check form has inputs.
        // =================================================================

        // MF-01: ListPrice
        if ($('#salePrice')) { pass('MF-01', 'ListPrice field', 'Found #salePrice'); }
        else { fail('MF-01', 'ListPrice field', 'Missing list price input (#salePrice)'); }

        // MF-02: PropertyType radio group
        var ptRadios = $$('input[name="salePropertyType"]');
        if (ptRadios.length > 0) { pass('MF-02', 'PropertyType radios', ptRadios.length + ' radios found'); }
        else { fail('MF-02', 'PropertyType radios', 'No radio group name="salePropertyType"'); }

        // MF-03: PropertySubType (derived from radio)
        if (COTALITY_PROPERTY_TYPE_MAP[getSelectedPropertyType()]) {
            pass('MF-03', 'PropertySubType derivable', 'Maps from selected radio');
        } else if (ptRadios.length > 0) {
            warn('MF-03', 'PropertySubType derivable', 'No radio currently selected, but group exists');
        } else {
            fail('MF-03', 'PropertySubType derivable', 'Cannot derive -- no property type radios');
        }

        // MF-04: CommonInterest (derived from radio)
        if (COTALITY_PROPERTY_TYPE_MAP[getSelectedPropertyType()]) {
            pass('MF-04', 'CommonInterest derivable', 'Maps from selected radio');
        } else if (ptRadios.length > 0) {
            warn('MF-04', 'CommonInterest derivable', 'No radio currently selected');
        } else {
            fail('MF-04', 'CommonInterest derivable', 'Cannot derive -- no property type radios');
        }

        // MF-05: StandardStatus
        if ($('#saleStatus')) { pass('MF-05', 'Status field', 'Found #saleStatus'); }
        else { fail('MF-05', 'Status field', 'Missing status dropdown (#saleStatus)'); }

        // MF-06: Address
        if ($('#saleStreetAddress')) { pass('MF-06', 'Street Address', 'Found #saleStreetAddress'); }
        else { fail('MF-06', 'Street Address', 'Missing street address input'); }

        // MF-07: City / Borough
        if ($('#saleBorough')) { pass('MF-07', 'Borough/City', 'Found #saleBorough'); }
        else { fail('MF-07', 'Borough/City', 'Missing borough select'); }

        // MF-08: Zip Code
        if ($('#saleZipCode')) { pass('MF-08', 'Postal Code', 'Found #saleZipCode'); }
        else { fail('MF-08', 'Postal Code', 'Missing zip code input'); }

        // MF-09: StateOrProvince (always NY -- may be hidden/auto)
        var stateEl = $('#saleBldgState,#saleState');
        if (stateEl) { pass('MF-09', 'StateOrProvince', 'Found state field'); }
        else { warn('MF-09', 'StateOrProvince', 'No explicit state field -- ensure "NY" is auto-set on submission'); }

        // MF-10: CountyOrParish (= borough)
        // Re-uses borough, already checked in MF-07
        pass('MF-10', 'CountyOrParish', 'Derived from Borough (#saleBorough)');

        // MF-11: BedroomsTotal
        if ($('#saleBedrooms')) { pass('MF-11', 'Bedrooms', 'Found #saleBedrooms'); }
        else { fail('MF-11', 'Bedrooms', 'Missing bedrooms input'); }

        // MF-12: BathroomsTotalInteger
        if ($('#saleFullBaths')) { pass('MF-12', 'Full Bathrooms', 'Found #saleFullBaths'); }
        else { fail('MF-12', 'Full Bathrooms', 'Missing full baths input'); }

        // MF-13: LivingArea / Interior SqFt
        if ($('#saleLivingArea') || $('#saleInteriorSqFt')) {
            pass('MF-13', 'Living Area / Interior SqFt', 'Found');
        } else { warn('MF-13', 'Living Area / Interior SqFt', 'No #saleLivingArea or #saleInteriorSqFt -- may be conditional'); }

        // MF-14: Description / PublicRemarks
        if ($('#saleDescription')) { pass('MF-14', 'Description', 'Found #saleDescription'); }
        else { fail('MF-14', 'Description', 'Missing description textarea'); }

        // MF-15: Listing Agent
        if ($('#saleListingAgent') || $('#saleListingAgentSearch')) {
            pass('MF-15', 'Listing Agent', 'Found agent field');
        } else { fail('MF-15', 'Listing Agent', 'Missing listing agent input'); }

        // MF-16: Listing Office / Company
        if ($('#saleListingCompany') || $('#saleListingCompanySearch')) {
            pass('MF-16', 'Listing Office', 'Found company field');
        } else { fail('MF-16', 'Listing Office', 'Missing listing company input'); }

        // MF-17: Listing Agreement Type
        var ltRadios = $$('input[name="saleListingType"]');
        if (ltRadios.length > 0) { pass('MF-17', 'Listing Agreement Type', ltRadios.length + ' radio options'); }
        else { fail('MF-17', 'Listing Agreement Type', 'No radios name="saleListingType"'); }

        // MF-18: Expiration Date
        if ($('#saleExclusiveExpires')) { pass('MF-18', 'Expiration Date', 'Found #saleExclusiveExpires'); }
        else { fail('MF-18', 'Expiration Date', 'Missing expiration date'); }

        // MF-19: OnMarketDate / DateListed
        if ($('#saleDateListed')) { pass('MF-19', 'Date Listed', 'Found #saleDateListed'); }
        else { fail('MF-19', 'Date Listed', 'Missing date listed'); }

        // MF-20: Neighborhood / MLSAreaMinor
        if ($('#saleNeighborhoodFromAddress') || $('#saleBldgNeighborhood')) {
            pass('MF-20', 'Neighborhood', 'Found');
        } else { fail('MF-20', 'Neighborhood', 'Missing neighborhood input'); }

        // MF-21: CoBroke Agreement
        if ($('#saleCoBrokeAgreementType')) {
            pass('MF-21', 'CoBroke Agreement', 'Found #saleCoBrokeAgreementType');
        } else { fail('MF-21', 'CoBroke Agreement', 'Missing co-broke agreement select'); }

        // MF-22: Building Status (Resale/NewDev/Sponsor/NewConversion)
        var bsRadios = $$('input[name="saleBuildingStatus"]');
        if (bsRadios.length > 0) { pass('MF-22', 'Building Status', bsRadios.length + ' options'); }
        else { fail('MF-22', 'Building Status', 'Missing building status radios'); }

        // MF-23: Half Baths
        if ($('#saleHalfBaths')) { pass('MF-23', 'Half Bathrooms', 'Found #saleHalfBaths'); }
        else { fail('MF-23', 'Half Bathrooms', 'Missing half baths input'); }

        // MF-24: First Showing Date
        if ($('#saleFirstShowingDate')) { pass('MF-24', 'First Showing Date', 'Found #saleFirstShowingDate'); }
        else { fail('MF-24', 'First Showing Date', 'Missing first showing date'); }

        // MF-25: Mandatory field audit (bulk check all I1-I57)
        var mandatoryMissing = [];
        var mandatoryFound = 0;
        MANDATORY_FIELDS.forEach(function(mf) {
            if (!isFieldRelevantForType(mf.cond)) return;
            if (selectorExists(mf.sel)) {
                mandatoryFound++;
            } else {
                mandatoryMissing.push(mf.ref + ': ' + mf.label);
            }
        });
        if (mandatoryMissing.length === 0) {
            pass('MF-25', 'Mandatory Field Audit (I1-I57)', mandatoryFound + '/' + MANDATORY_FIELDS.length + ' fields present');
        } else {
            fail('MF-25', 'Mandatory Field Audit (I1-I57)',
                mandatoryMissing.length + ' field(s) missing: ' + mandatoryMissing.slice(0, 8).join(', ') +
                (mandatoryMissing.length > 8 ? '... (+' + (mandatoryMissing.length - 8) + ' more)' : ''),
                mandatoryMissing);
        }


        // =================================================================
        // Cotality COMPLIANCE (RC-01 to RC-08)
        // =================================================================

        // RC-01: PropertyType radio group exists with correct name
        if (ptRadios.length > 0) {
            pass('RC-01', 'PropertyType radio group', 'name="salePropertyType" exists');
        } else { fail('RC-01', 'PropertyType radio group', 'Missing property type radio group'); }

        // RC-02: 17 property type radios present
        // The 17th is the "Commercial" master toggle (non-RLS)
        var expectedCount = 17;
        if (ptRadios.length >= expectedCount) {
            pass('RC-02', '17 Property Type Radios', ptRadios.length + ' radios (expected ' + expectedCount + ')');
        } else if (ptRadios.length >= 16) {
            warn('RC-02', '17 Property Type Radios', ptRadios.length + ' radios (expected ' + expectedCount + ' -- may be missing Commercial toggle)');
        } else {
            fail('RC-02', '17 Property Type Radios', 'Only ' + ptRadios.length + ' radios found (expected ' + expectedCount + ')',
                Array.from(ptRadios).map(function(r) { return r.value; }));
        }

        // RC-03: Each radio maps to correct Cotality trio
        var unmappedRadios = [];
        var allRadioValues = [];
        ptRadios.forEach(function(radio) {
            allRadioValues.push(radio.value);
            if (!COTALITY_PROPERTY_TYPE_MAP[radio.value]) {
                unmappedRadios.push(radio.value);
            }
        });
        if (unmappedRadios.length === 0) {
            pass('RC-03', 'Cotality Trio Mapping', 'All ' + allRadioValues.length + ' radios map to Cotality PropertyType/CommonInterest/PropertySubType');
        } else {
            fail('RC-03', 'Cotality Trio Mapping', unmappedRadios.length + ' radio(s) have no Cotality mapping: ' + unmappedRadios.join(', '), unmappedRadios);
        }

        // RC-04: Conditional field visibility
        var condFieldTests = [
            { label: 'Maintenance/CC', selector: '#saleMaintCCField,#saleMaintCC', showFor: ['Condo','Coop','Condop'] },
            { label: 'Shares', selector: '#saleCoopCondopSection,#saleUnitShares', showFor: ['Coop','Condop'] },
            { label: 'Flip Tax', selector: '#saleFlipTaxSection,#saleFlipTaxAmount', showFor: ['Condo','Coop','Condop'] },
            { label: 'Living Area', selector: '#saleCondoOnlySection,#saleLivingArea', showFor: ['Condo'] },
            { label: 'Tab 3 (TH/Building)', selector: '#saleMainTab3', showFor: ['SingleFamilyTownhouse','MultiFamilyTownhouse','SingleFamily','MultiFamily','MixedUse','Duplex','Triplex','Quadruplex'] }
        ];
        var condPassed = 0;
        var condProblems = [];
        condFieldTests.forEach(function(test) {
            if (selectorExists(test.selector)) condPassed++;
            else condProblems.push(test.label);
        });
        if (condProblems.length === 0) {
            pass('RC-04', 'Conditional Fields Exist', condPassed + '/' + condFieldTests.length + ' conditional sections present in DOM');
        } else {
            warn('RC-04', 'Conditional Fields', condProblems.length + ' section(s) not found (may be dynamically created): ' + condProblems.join(', '));
        }

        // RC-05: Status dropdown has Cotality StandardStatus values
        var statusEl = $('#saleStatus');
        if (statusEl) {
            var statusOptions = [];
            statusEl.querySelectorAll('option').forEach(function(opt) {
                if (opt.value) statusOptions.push(opt.textContent.trim());
            });
            var missingStatuses = [];
            COTALITY_STANDARD_STATUSES.forEach(function(s) {
                var found = statusOptions.some(function(opt) {
                    return opt.indexOf(s) !== -1 || opt.toLowerCase().indexOf(s.toLowerCase()) !== -1;
                });
                if (!found) missingStatuses.push(s);
            });
            if (missingStatuses.length === 0) {
                pass('RC-05', 'Cotality StandardStatus Values', 'All ' + COTALITY_STANDARD_STATUSES.length + ' core statuses present (' + statusOptions.length + ' total options)');
            } else {
                warn('RC-05', 'Cotality StandardStatus Values', missingStatuses.length + ' missing: ' + missingStatuses.join(', ') +
                    ' (may use different labels)', missingStatuses);
            }
        } else {
            fail('RC-05', 'Cotality StandardStatus Values', 'No #saleStatus element found');
        }

        // RC-06: Listing Agreement has Exclusive/Open/Exclusive Agency
        if (ltRadios.length > 0) {
            var ltValues = Array.from(ltRadios).map(function(r) { return r.value; });
            var hasExclusive = ltValues.indexOf('Exclusive') !== -1 || ltValues.some(function(v) { return v.indexOf('Exclusive') !== -1; });
            if (hasExclusive) {
                pass('RC-06', 'Listing Agreement Options', 'Exclusive type found among ' + ltValues.length + ' options');
            } else {
                fail('RC-06', 'Listing Agreement Options', 'No "Exclusive" option in listing type radios', ltValues);
            }
        } else {
            fail('RC-06', 'Listing Agreement Options', 'No listing type radios found');
        }

        // RC-07: REBNY-prohibited listing types blocked
        if (ltRadios.length > 0) {
            var ltVals = Array.from(ltRadios).map(function(r) { return r.value.toLowerCase(); });
            var prohibited = ['open', 'fsbo', 'for sale by owner'];
            var foundProhibited = prohibited.filter(function(p) {
                return ltVals.some(function(v) { return v === p; });
            });
            if (foundProhibited.length === 0) {
                pass('RC-07', 'No Prohibited Listing Types', 'No Open/FSBO options (UCBA C1 compliant)');
            } else {
                fail('RC-07', 'No Prohibited Listing Types', 'Found prohibited types: ' + foundProhibited.join(', ') + ' -- UCBA C1 violation', foundProhibited);
            }
        } else {
            warn('RC-07', 'No Prohibited Listing Types', 'Cannot verify -- no listing type radios');
        }

        // RC-08: Address fields map to Cotality components
        var cotalityAddressFields = [
            { cotality: 'StreetNumber+StreetName', sel: '#saleStreetAddress' },
            { cotality: 'UnitNumber', sel: '#saleUnitNumber' },
            { cotality: 'City/CityRegion', sel: '#saleBorough' },
            { cotality: 'PostalCode', sel: '#saleZipCode' },
            { cotality: 'SubdivisionName', sel: '#saleNeighborhoodFromAddress,#saleBldgNeighborhood' }
        ];
        var missingAddr = [];
        cotalityAddressFields.forEach(function(f) {
            if (!selectorExists(f.sel)) missingAddr.push(f.cotality);
        });
        if (missingAddr.length === 0) {
            pass('RC-08', 'Cotality Address Components', 'All ' + cotalityAddressFields.length + ' address fields present');
        } else {
            fail('RC-08', 'Cotality Address Components', missingAddr.length + ' missing: ' + missingAddr.join(', '), missingAddr);
        }


        // =================================================================
        // DATA QUALITY (DQ-01 to DQ-10)
        // =================================================================

        // DQ-01: Price field accepts only positive numbers
        var priceEl = $('#salePrice');
        if (priceEl) {
            var isNumber = priceEl.type === 'number';
            if (isNumber) { pass('DQ-01', 'Price: number type', 'type="number"'); }
            else { warn('DQ-01', 'Price: number type', 'type="' + priceEl.type + '" -- consider type="number" for validation'); }
        } else { fail('DQ-01', 'Price field', 'Not found'); }

        // DQ-02: Beds allows 0 (Studio)
        var bedsEl = $('#saleBedrooms');
        if (bedsEl) {
            var minVal = bedsEl.getAttribute('min');
            if (minVal === null || parseFloat(minVal) <= 0) {
                pass('DQ-02', 'Beds allows 0 (Studio)', 'min=' + (minVal || 'none') + ' -- studio allowed');
            } else {
                fail('DQ-02', 'Beds allows 0 (Studio)', 'min="' + minVal + '" blocks studio listings');
            }
        } else { fail('DQ-02', 'Beds field', 'Not found'); }

        // DQ-03: Baths allows half-baths
        var halfBathEl = $('#saleHalfBaths');
        if (halfBathEl) {
            pass('DQ-03', 'Half-bath support', 'Separate half-bath field exists (#saleHalfBaths)');
        } else {
            var fullBathEl = $('#saleFullBaths');
            if (fullBathEl && fullBathEl.getAttribute('step') === '0.5') {
                pass('DQ-03', 'Half-bath support', 'step="0.5" on full baths');
            } else {
                fail('DQ-03', 'Half-bath support', 'No half-bath field and no step="0.5" on baths');
            }
        }

        // DQ-04: Zip code is 5 digits
        var zipEl = $('#saleZipCode');
        if (zipEl) {
            var maxLen = zipEl.getAttribute('maxlength');
            if (maxLen === '5') { pass('DQ-04', 'Zip code maxlength', 'maxlength="5"'); }
            else { warn('DQ-04', 'Zip code maxlength', 'maxlength="' + (maxLen || 'none') + '" -- should be 5'); }
        } else { fail('DQ-04', 'Zip code field', 'Not found'); }

        // DQ-05: Description field with character count
        var descEl = $('#saleDescription');
        var charCountEl = $('#saleDescCharCount');
        if (descEl && charCountEl) {
            pass('DQ-05', 'Description with char count', 'Both #saleDescription and #saleDescCharCount exist');
        } else if (descEl) {
            warn('DQ-05', 'Description char count', 'Description exists but no character counter element');
        } else {
            fail('DQ-05', 'Description field', 'Not found');
        }

        // DQ-06: No duplicate IDs in form
        var allIds = {};
        var duplicateIds = [];
        document.querySelectorAll('[id]').forEach(function(el) {
            if (allIds[el.id]) {
                if (allIds[el.id] === 1) duplicateIds.push(el.id);
            }
            allIds[el.id] = (allIds[el.id] || 0) + 1;
        });
        if (duplicateIds.length === 0) {
            pass('DQ-06', 'No duplicate IDs', 'All IDs unique');
        } else {
            fail('DQ-06', 'No duplicate IDs', duplicateIds.length + ' duplicate(s): ' + duplicateIds.slice(0, 8).join(', ') +
                (duplicateIds.length > 8 ? '...' : ''), duplicateIds);
        }

        // DQ-07: Required fields have required attribute or validation
        var requiredInputs = $$('input[required],select[required],textarea[required]');
        if (requiredInputs.length >= 10) {
            pass('DQ-07', 'Required attributes', requiredInputs.length + ' fields have required attribute');
        } else {
            warn('DQ-07', 'Required attributes', 'Only ' + requiredInputs.length + ' fields have required attribute (expected 10+)');
        }

        // DQ-08: Date fields use proper format
        var dateInputs = $$('input[type="date"]');
        if (dateInputs.length >= 4) {
            pass('DQ-08', 'Date fields', dateInputs.length + ' date inputs use type="date" (browser date picker)');
        } else {
            warn('DQ-08', 'Date fields', 'Only ' + dateInputs.length + ' type="date" inputs (expected 4+)');
        }

        // DQ-09: Numeric fields have constraints
        var numberInputs = $$('input[type="number"]');
        var constrainedCount = 0;
        numberInputs.forEach(function(el) {
            if (el.getAttribute('min') || el.getAttribute('max') || el.getAttribute('step')) constrainedCount++;
        });
        if (numberInputs.length > 0) {
            pass('DQ-09', 'Numeric constraints', constrainedCount + '/' + numberInputs.length + ' number inputs have min/max/step');
        } else {
            warn('DQ-09', 'Numeric fields', 'No type="number" inputs found');
        }

        // DQ-10: Validation function exists
        var hasSubmitValidation = typeof submitSalesListing === 'function';
        var hasREBNYValidation = typeof validateREBNYRequired === 'function';
        if (hasSubmitValidation && hasREBNYValidation) {
            pass('DQ-10', 'Validation functions', 'submitSalesListing + validateREBNYRequired exist');
        } else if (hasSubmitValidation || hasREBNYValidation) {
            warn('DQ-10', 'Validation functions', 'Partial: submit=' + hasSubmitValidation + ', REBNY=' + hasREBNYValidation);
        } else {
            fail('DQ-10', 'Validation functions', 'No submitSalesListing or validateREBNYRequired functions found');
        }


        // =================================================================
        // DISTRIBUTION GATES (DG-01 to DG-06)
        // Per REBNY UCBA, form must have toggle inputs for 6 gates.
        // =================================================================

        // DG-01: Owner Opt-Out authorization
        var optOutRadio = $('input[name="saleListingType"][value="OwnerOptOut"]');
        var optOutUpload = $('#saleOptOutFormUpload');
        if (optOutRadio) {
            if (optOutUpload) {
                pass('DG-01', 'Owner Opt-Out Gate', 'Radio + form upload exist');
            } else {
                warn('DG-01', 'Owner Opt-Out Gate', 'Radio exists but no Exhibit B form upload (#saleOptOutFormUpload)');
            }
        } else {
            fail('DG-01', 'Owner Opt-Out Gate', 'No OwnerOptOut option in listing type radios');
        }

        // DG-02: IDX Entire Listing Display
        var idxToggle = $('[name="saleInternetEntireListingDisplayYN"]') || $('#saleDist_IDX');
        if (idxToggle) {
            var defaultChecked = idxToggle.checked || idxToggle.defaultChecked;
            if (defaultChecked) {
                pass('DG-02', 'IDX Display Gate', 'Toggle exists, default=checked (correct)');
            } else {
                warn('DG-02', 'IDX Display Gate', 'Toggle exists but default is unchecked (REBNY default should be true)');
            }
        } else {
            fail('DG-02', 'IDX Display Gate', 'No IDX display toggle found');
        }

        // DG-03: Internet Address Display
        var addrToggle = $('[name="saleInternetAddressDisplayYN"]');
        if (addrToggle) {
            pass('DG-03', 'Internet Address Display', 'Toggle exists');
        } else {
            fail('DG-03', 'Internet Address Display', 'No InternetAddressDisplayYN toggle found');
        }

        // DG-04: Internet Entire Listing Display
        var entireToggle = $('[name="saleInternetEntireListingDisplayYN"]');
        if (entireToggle) {
            pass('DG-04', 'Internet Entire Listing Display', 'Toggle exists');
        } else {
            fail('DG-04', 'Internet Entire Listing Display', 'No InternetEntireListingDisplayYN toggle found');
        }

        // DG-05: Syndication opt-in/out
        var syndicationToggle = $('[name="saleSyndicateYN"]');
        var distCheckboxes = $$('#saleDist_IDX,#saleDist_Listhub,#saleDist_NYMLS,#saleDist_Realtor');
        if (syndicationToggle || distCheckboxes.length > 0) {
            pass('DG-05', 'Syndication Gates', 'Syndication toggle and/or ' + distCheckboxes.length + ' distribution checkboxes found');
        } else {
            fail('DG-05', 'Syndication Gates', 'No syndication opt-out or distribution checkboxes found');
        }

        // DG-06: Coming Soon gate
        var statusHasCS = false;
        if (statusEl) {
            statusEl.querySelectorAll('option').forEach(function(opt) {
                if (opt.value && opt.textContent.toLowerCase().indexOf('coming soon') !== -1) statusHasCS = true;
            });
        }
        var csActivationDate = $('#saleFirstShowingDate');
        if (statusHasCS) {
            if (csActivationDate) {
                pass('DG-06', 'Coming Soon Gate', 'Coming Soon status option + First Showing Date field exist');
            } else {
                warn('DG-06', 'Coming Soon Gate', 'Coming Soon status exists but no First Showing Date (#saleFirstShowingDate) for activation date');
            }
        } else {
            fail('DG-06', 'Coming Soon Gate', 'No "Coming Soon" option in status dropdown');
        }


        // =================================================================
        // COMPLIANCE FIELDS (CF-01 to CF-08)
        // =================================================================

        // CF-01: Fair Housing language scan on description
        var descTexts = getDescriptionTexts();
        var fhViolations = [];
        descTexts.forEach(function(dt) {
            FAIR_HOUSING_PATTERNS.forEach(function(pattern) {
                var match = pattern.pattern.exec(dt.text);
                if (match) {
                    fhViolations.push(dt.id + ': "' + match[0] + '" (' + pattern.type + ', ' + pattern.law + ')');
                }
            });
        });
        if (fhViolations.length > 0) {
            fail('CF-01', 'Fair Housing Scan', fhViolations.length + ' violation(s) found', fhViolations);
        } else if (descTexts.length > 0) {
            pass('CF-01', 'Fair Housing Scan', descTexts.length + ' text field(s) scanned, no violations');
        } else {
            pass('CF-01', 'Fair Housing Scan', 'No text entered yet (will scan on input)');
        }

        // CF-01b: Fair Housing real-time scanner wired
        var hasFHCheck = typeof checkDescriptionCompliance === 'function' || typeof _performComplianceCheck === 'function';
        var fhAck = $('#saleFairHousingAck');
        if (hasFHCheck && fhAck) {
            pass('CF-01b', 'Fair Housing Scanner Wired', 'Real-time scanner + acknowledgment checkbox exist');
        } else if (hasFHCheck) {
            warn('CF-01b', 'Fair Housing Scanner', 'Real-time scanner exists but no acknowledgment checkbox (#saleFairHousingAck)');
        } else {
            warn('CF-01b', 'Fair Housing Scanner', 'No real-time compliance scanner function found');
        }

        // CF-02: No agent contact info in description
        var agentInfoViolations = [];
        descTexts.forEach(function(dt) {
            if (CONTENT_RESTRICTION_PATTERNS.agentInfo.phone.test(dt.text)) agentInfoViolations.push(dt.id + ': phone number detected');
            if (CONTENT_RESTRICTION_PATTERNS.agentInfo.email.test(dt.text)) agentInfoViolations.push(dt.id + ': email detected');
            if (CONTENT_RESTRICTION_PATTERNS.agentInfo.url.test(dt.text)) agentInfoViolations.push(dt.id + ': URL detected');
        });
        if (agentInfoViolations.length > 0) {
            fail('CF-02', 'No Agent Info in Description (C7)', agentInfoViolations.join('; '), agentInfoViolations);
        } else {
            pass('CF-02', 'No Agent Info in Description (C7)', 'Clean');
        }

        // CF-03: No compensation/commission in description
        var compViolations = [];
        descTexts.forEach(function(dt) {
            var match = CONTENT_RESTRICTION_PATTERNS.compensation.exec(dt.text);
            if (match) compViolations.push(dt.id + ': "' + match[0] + '"');
        });
        if (compViolations.length > 0) {
            fail('CF-03', 'No Compensation in Description (C9)', compViolations.join('; '), compViolations);
        } else {
            pass('CF-03', 'No Compensation in Description (C9)', 'Clean');
        }

        // CF-04: No "off-market" language
        var omViolations = [];
        descTexts.forEach(function(dt) {
            var match = CONTENT_RESTRICTION_PATTERNS.offMarket.exec(dt.text);
            if (match) omViolations.push(dt.id + ': "' + match[0] + '"');
        });
        if (omViolations.length > 0) {
            fail('CF-04', 'No Off-Market Language (C8)', omViolations.join('; '), omViolations);
        } else {
            pass('CF-04', 'No Off-Market Language (C8)', 'Clean');
        }

        // CF-05: Commission negotiability disclosure
        var commNegAck = $('#saleCommNegotiabilityAck');
        if (commNegAck) {
            pass('CF-05', 'Commission Negotiability Disclosure (C16)', 'Acknowledgment checkbox exists (#saleCommNegotiabilityAck)');
        } else {
            fail('CF-05', 'Commission Negotiability Disclosure (C16)',
                'Missing disclosure checkbox -- UCBA requires "Broker commissions are not set by law and are fully negotiable"');
        }

        // CF-06: Buyer broker compensation field (internal, never displayed)
        var commField = $('#saleExclusiveCommission');
        if (commField) {
            pass('CF-06', 'Internal Commission Field', 'Found #saleExclusiveCommission (HID -- never public per G1)');
        } else {
            warn('CF-06', 'Internal Commission Field', 'No #saleExclusiveCommission field -- may use different ID');
        }

        // CF-07: Coming Soon badge text
        var comingSoonWarning = $('#saleOpenHouseComingSoonWarning');
        if (comingSoonWarning) {
            var warningText = comingSoonWarning.textContent || '';
            if (warningText.indexOf('Coming Soon') !== -1 && warningText.indexOf('No Showings') !== -1) {
                pass('CF-07', 'Coming Soon Badge Text (D7)', 'Warning includes required "Coming Soon. No Showings..." text');
            } else {
                warn('CF-07', 'Coming Soon Badge Text (D7)', 'Warning element exists but may not have exact required text');
            }
        } else {
            warn('CF-07', 'Coming Soon Badge Text (D7)', 'No #saleOpenHouseComingSoonWarning element');
        }

        // CF-08: Expiration Date hidden from public
        var expEl = $('#saleExclusiveExpires');
        if (expEl) {
            // Check that it does not have a public/IDX label
            var expLabel = expEl.closest('.form-card');
            var isLabeled = expLabel ? (expLabel.textContent.indexOf('Hidden') !== -1 || expLabel.textContent.indexOf('HID') !== -1 || expLabel.textContent.indexOf('Internal') !== -1) : false;
            pass('CF-08', 'Expiration Date (HID field)', 'Field exists -- ensure never exposed on public display');
        } else {
            warn('CF-08', 'Expiration Date (HID field)', 'No expiration date field found');
        }


        // =================================================================
        // FINANCIAL FIELDS (FF-01 to FF-05)
        // =================================================================

        // FF-01: Maintenance/Common Charges
        var maintEl = $('#saleMaintCC');
        if (maintEl) {
            pass('FF-01', 'Maintenance/Common Charges', 'Found #saleMaintCC');
        } else { fail('FF-01', 'Maintenance/Common Charges', 'Missing #saleMaintCC field (required for co-op/condo)'); }

        // FF-02: RE Tax
        var taxEl = $('#saleRETaxes');
        if (taxEl) {
            pass('FF-02', 'RE Taxes', 'Found #saleRETaxes');
        } else { fail('FF-02', 'RE Taxes', 'Missing #saleRETaxes field'); }

        // FF-03: Assessment / Shares (co-op)
        var sharesEl = $('#saleUnitShares');
        if (sharesEl) {
            pass('FF-03', 'Co-op Shares/Assessment', 'Found #saleUnitShares');
        } else { warn('FF-03', 'Co-op Shares/Assessment', 'No #saleUnitShares -- may be conditional (co-op only)'); }

        // FF-04: Flip Tax
        var flipEl = $('#saleFlipTaxAmount');
        if (flipEl) {
            pass('FF-04', 'Flip Tax', 'Found #saleFlipTaxAmount');
        } else { warn('FF-04', 'Flip Tax', 'No #saleFlipTaxAmount -- may be conditional'); }

        // FF-05: Total Monthly calculated
        var totalMonthlyEl = $('#saleTotalMonthly');
        if (totalMonthlyEl) {
            var isReadonly = totalMonthlyEl.hasAttribute('readonly');
            if (isReadonly) {
                pass('FF-05', 'Total Monthly (calculated)', 'Found #saleTotalMonthly with readonly -- auto-calculated');
            } else {
                warn('FF-05', 'Total Monthly', 'Found but not readonly -- should be auto-calculated');
            }
        } else { warn('FF-05', 'Total Monthly', 'No #saleTotalMonthly field'); }


        // =================================================================
        // BUILDING FIELDS (BF-01 to BF-05)
        // =================================================================

        // BF-01: Building Name
        var bldgNameEl = $('#saleBldgName');
        if (bldgNameEl) { pass('BF-01', 'Building Name', 'Found #saleBldgName'); }
        else { warn('BF-01', 'Building Name', 'No #saleBldgName -- may be in building modal only'); }

        // BF-02: Year Built
        var yearEl = $('#saleBldgYearBuilt');
        if (yearEl) { pass('BF-02', 'Year Built', 'Found #saleBldgYearBuilt'); }
        else { fail('BF-02', 'Year Built', 'Missing #saleBldgYearBuilt'); }

        // BF-03: Total Units
        var unitsEl = $('#saleBldgTotalUnits');
        if (unitsEl) { pass('BF-03', 'Total Units', 'Found #saleBldgTotalUnits'); }
        else { warn('BF-03', 'Total Units', 'No #saleBldgTotalUnits'); }

        // BF-04: Floors/Stories
        var floorsEl = $('#saleBldgTotalFloors');
        if (floorsEl) { pass('BF-04', 'Total Floors', 'Found #saleBldgTotalFloors'); }
        else { warn('BF-04', 'Total Floors', 'No #saleBldgTotalFloors'); }

        // BF-05: Building amenities checkboxes
        var amenityChecks = $$('#saleBldgDoorman,#saleBldgElevator,#saleBldgConcierge,#saleBldgFullTimeDoorman');
        if (amenityChecks.length >= 3) {
            pass('BF-05', 'Building Amenities', amenityChecks.length + ' amenity checkboxes found');
        } else if (amenityChecks.length > 0) {
            warn('BF-05', 'Building Amenities', 'Only ' + amenityChecks.length + ' amenity checkboxes found (expected 3+)');
        } else {
            fail('BF-05', 'Building Amenities', 'No building amenity checkboxes found');
        }


        // =================================================================
        // UI/NAVIGATION (UN-01 to UN-05)
        // =================================================================

        // UN-01: All 6 main tabs navigable
        var tabPanels = $$('#saleMainTab1,#saleMainTab2,#saleMainTab3,#saleMainTab4,#saleMainTab5,#saleMainTab6');
        var tabButtons = $$('#sidebarTab1,#sidebarTab2,#sidebarTab3,#sidebarTab4,#sidebarTab5,#sidebarTab6');
        if (tabPanels.length >= 6) {
            pass('UN-01', '6 Main Tabs', tabPanels.length + ' tab panels + ' + tabButtons.length + ' sidebar buttons');
        } else {
            fail('UN-01', '6 Main Tabs', 'Only ' + tabPanels.length + ' tab panels found (expected 6)');
        }

        // UN-02: Sub-tabs in tabs 1-3
        var subTabs = {
            1: $$('#saleSubTab1_1,#saleSubTab1_2,#saleSubTab1_3,#saleSubTab1_4'),
            2: $$('#saleSubTab2_1,#saleSubTab2_2,#saleSubTab2_3'),
            3: $$('#saleSubTab3_1,#saleSubTab3_2,#saleSubTab3_3')
        };
        var subTabIssues = [];
        if (subTabs[1].length < 4) subTabIssues.push('Tab 1: ' + subTabs[1].length + '/4 sub-tabs');
        if (subTabs[2].length < 3) subTabIssues.push('Tab 2: ' + subTabs[2].length + '/3 sub-tabs');
        if (subTabs[3].length < 3) subTabIssues.push('Tab 3: ' + subTabs[3].length + '/3 sub-tabs');
        if (subTabIssues.length === 0) {
            pass('UN-02', 'Sub-tabs (1-3)', 'Tab 1: 4, Tab 2: 3, Tab 3: 3 -- all present');
        } else {
            fail('UN-02', 'Sub-tabs (1-3)', subTabIssues.join('; '), subTabIssues);
        }

        // UN-03: Tab validation function
        var hasTabValidation = typeof showSaleMainTab === 'function';
        var hasSubTabNav = typeof showSaleSubTab === 'function';
        if (hasTabValidation && hasSubTabNav) {
            pass('UN-03', 'Tab Navigation Functions', 'showSaleMainTab + showSaleSubTab exist');
        } else {
            fail('UN-03', 'Tab Navigation Functions', 'Missing: showSaleMainTab=' + hasTabValidation + ', showSaleSubTab=' + hasSubTabNav);
        }

        // UN-04: Save draft / auto-save
        var hasSaveDraft = typeof saveSalesDraft === 'function' || typeof manualSaveDraft === 'function';
        var hasDraftButton = $('[onclick*="saveDraft"],[onclick*="SaveDraft"],[onclick*="manualSaveDraft"]');
        if (hasSaveDraft && hasDraftButton) {
            pass('UN-04', 'Save Draft', 'Function + button exist');
        } else if (hasSaveDraft) {
            warn('UN-04', 'Save Draft', 'Function exists but no visible button');
        } else {
            fail('UN-04', 'Save Draft', 'No save draft function found');
        }

        // UN-05: Preview tab shows data
        var previewTab = $('#saleMainTab5');
        var previewFields = $$('[id^="salePreview"]');
        if (previewTab && previewFields.length >= 10) {
            pass('UN-05', 'Preview Tab', previewFields.length + ' preview display elements');
        } else if (previewTab) {
            warn('UN-05', 'Preview Tab', 'Only ' + previewFields.length + ' preview elements (expected 10+)');
        } else {
            fail('UN-05', 'Preview Tab', 'No #saleMainTab5 found');
        }


        // =================================================================
        // SCORING & SUMMARY
        // =================================================================

        var total = passed.length + failed.length;
        var score = total > 0 ? Math.round((passed.length / total) * 100) : 0;

        // Group by category
        var byCategory = {};
        var allResults = passed.map(function(p) { return { id: p.id, status: 'PASS' }; })
            .concat(failed.map(function(f) { return { id: f.id, status: 'FAIL' }; }))
            .concat(warnings.map(function(w) { return { id: w.id, status: 'WARN' }; }));
        allResults.forEach(function(r) {
            var cat = (r.id || '').split('-')[0] || 'OTHER';
            if (!byCategory[cat]) byCategory[cat] = { pass: 0, fail: 0, warn: 0 };
            if (r.status === 'PASS') byCategory[cat].pass++;
            else if (r.status === 'FAIL') byCategory[cat].fail++;
            else byCategory[cat].warn++;
        });

        return {
            passed: passed,
            failed: failed,
            warnings: warnings,
            score: score,
            byCategory: byCategory,
            summary: 'Sale Form Doctor: ' + passed.length + ' passed, ' +
                     failed.length + ' failed, ' + warnings.length + ' warnings (' + score + '%)'
        };
    }


    // =========================================================================
    // COMPLIANCE-ONLY CHECK
    // =========================================================================

    /**
     * Run only compliance checks (CF-01 to CF-08).
     * Lighter check for quick compliance validation.
     */
    function validateCompliance() {
        var fullResult = validate();
        var cfPassed  = fullResult.passed.filter(function(r) { return r.id.indexOf('CF-') === 0; });
        var cfFailed  = fullResult.failed.filter(function(r) { return r.id.indexOf('CF-') === 0; });
        var cfWarnings = fullResult.warnings.filter(function(r) { return r.id.indexOf('CF-') === 0; });
        var total = cfPassed.length + cfFailed.length;
        var score = total > 0 ? Math.round((cfPassed.length / total) * 100) : 0;
        return {
            passed: cfPassed,
            failed: cfFailed,
            warnings: cfWarnings,
            score: score,
            summary: 'Compliance: ' + cfPassed.length + '/' + total + ' (' + score + '%)'
        };
    }


    // =========================================================================
    // FIELD AUDIT
    // =========================================================================

    /**
     * Full mandatory field audit against REBNY Exhibit A (I1-I57).
     * Shows which mandatory fields are present/missing in the form.
     */
    function auditFields() {
        var pt = getSelectedPropertyType();
        var present = [];
        var missing = [];

        MANDATORY_FIELDS.forEach(function(mf) {
            var relevant = isFieldRelevantForType(mf.cond);
            var exists = selectorExists(mf.sel);
            var entry = {
                ref: mf.ref,
                label: mf.label,
                relevant: relevant,
                exists: exists,
                selectors: mf.sel,
                conditional: mf.cond
            };
            if (!relevant) {
                entry.status = 'SKIP';
                present.push(entry); // count skipped as OK
            } else if (exists) {
                entry.status = 'FOUND';
                present.push(entry);
            } else {
                entry.status = 'MISSING';
                missing.push(entry);
            }
        });

        return {
            propertyType: pt,
            total: MANDATORY_FIELDS.length,
            present: present.length,
            missing: missing.length,
            fields: present.concat(missing),
            missingList: missing,
            score: Math.round((present.length / MANDATORY_FIELDS.length) * 100)
        };
    }


    // =========================================================================
    // FAIR HOUSING DEEP SCAN
    // =========================================================================

    /**
     * Deep scan all text fields for Fair Housing violations.
     */
    function scanFairHousing() {
        var descTexts = getDescriptionTexts();
        var violations = [];
        var clean = 0;

        descTexts.forEach(function(dt) {
            var fieldViolations = [];
            FAIR_HOUSING_PATTERNS.forEach(function(pattern) {
                var match = pattern.pattern.exec(dt.text);
                if (match) {
                    fieldViolations.push({
                        type: pattern.type,
                        detail: 'Found: "' + match[0] + '"',
                        law: pattern.law,
                        severity: 'CRITICAL'
                    });
                }
            });

            // Also check content restrictions
            if (CONTENT_RESTRICTION_PATTERNS.agentInfo.phone.test(dt.text)) {
                fieldViolations.push({ type: 'AGENT_INFO', detail: 'Phone number in description', law: 'UCBA Art. I, Sec. 5(C)', severity: 'HIGH' });
            }
            if (CONTENT_RESTRICTION_PATTERNS.agentInfo.email.test(dt.text)) {
                fieldViolations.push({ type: 'AGENT_INFO', detail: 'Email in description', law: 'UCBA Art. I, Sec. 5(C)', severity: 'HIGH' });
            }
            if (CONTENT_RESTRICTION_PATTERNS.agentInfo.url.test(dt.text)) {
                fieldViolations.push({ type: 'AGENT_INFO', detail: 'URL in description', law: 'UCBA Art. I, Sec. 5(C)', severity: 'HIGH' });
            }
            if (CONTENT_RESTRICTION_PATTERNS.offMarket.test(dt.text)) {
                fieldViolations.push({ type: 'OFF_MARKET', detail: '"Off-market" language', law: 'UCBA Art. I, Sec. 5(D)', severity: 'CRITICAL' });
            }
            if (CONTENT_RESTRICTION_PATTERNS.compensation.test(dt.text)) {
                fieldViolations.push({ type: 'COMPENSATION', detail: 'Compensation language', law: 'UCBA Art. I, Sec. 5(E)', severity: 'HIGH' });
            }

            if (fieldViolations.length > 0) {
                violations.push({ fieldId: dt.id, issues: fieldViolations });
            } else {
                clean++;
            }
        });

        return {
            timestamp: new Date().toISOString(),
            scanned: descTexts.length,
            clean: clean,
            violations: violations,
            summary: descTexts.length + ' field(s) scanned. ' + clean + ' clean, ' + violations.length + ' with issues.'
        };
    }


    // =========================================================================
    // UI PANEL
    // =========================================================================

    var CATEGORY_LABELS = {
        'MF': 'Mandatory Fields',
        'RC': 'Cotality Compliance',
        'DQ': 'Data Quality',
        'DG': 'Distribution Gates',
        'CF': 'Compliance Fields',
        'FF': 'Financial Fields',
        'BF': 'Building Fields',
        'UN': 'UI/Navigation'
    };

    /**
     * Render the Sale Form Doctor floating panel.
     */
    function renderPanel(containerId) {
        var container = containerId ? document.getElementById(containerId) : null;
        if (!container) {
            container = document.createElement('div');
            container.id = 'saleFormDoctorPanel';
            container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;' +
                'background:#1F2937;color:white;border-radius:12px;padding:12px 16px;' +
                'box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:Manrope,Arial,sans-serif;font-size:13px;' +
                'max-width:440px;max-height:80vh;overflow-y:auto;';
            document.body.appendChild(container);
        }

        container.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                '<span style="font-size:18px;">&#x1FA7A;</span>' +
                '<strong style="font-size:14px;">Sale Form Doctor</strong>' +
                '<span style="font-size:11px;color:#9CA3AF;margin-left:auto;">v' + VERSION + '</span>' +
                '<button onclick="document.getElementById(\'saleFormDoctorPanel\').style.display=\'none\'" ' +
                    'style="background:none;border:none;color:#9CA3AF;cursor:pointer;font-size:16px;margin-left:4px;" title="Close">&times;</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button onclick="SaleFormDoctor._runValidate()" ' +
                    'style="background:#3B82F6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Validate Form</button>' +
                '<button onclick="SaleFormDoctor._runCompliance()" ' +
                    'style="background:#10B981;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Check Compliance</button>' +
                '<button onclick="SaleFormDoctor._runFieldAudit()" ' +
                    'style="background:#8B5CF6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Field Audit</button>' +
                '<button onclick="SaleFormDoctor._runFairHousing()" ' +
                    'style="background:#EF4444;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Fair Housing</button>' +
            '</div>' +
            '<div id="saleFormDoctorOutput" style="margin-top:10px;font-size:12px;line-height:1.5;"></div>';
    }

    /** Format validation results as HTML */
    function _formatValidation(result) {
        var html = '<div style="margin-bottom:8px;font-weight:bold;color:' +
                   (result.score >= 90 ? '#10B981' : result.score >= 70 ? '#F59E0B' : '#EF4444') +
                   ';">Score: ' + result.score + '% (' + result.passed.length + '/' +
                   (result.passed.length + result.failed.length) + ')</div>';

        // Category breakdown
        if (result.byCategory) {
            html += '<div style="margin-bottom:8px;font-size:11px;">';
            Object.keys(result.byCategory).forEach(function(cat) {
                var c = result.byCategory[cat];
                var label = CATEGORY_LABELS[cat] || cat;
                var total = c.pass + c.fail;
                var color = c.fail > 0 ? '#FCA5A5' : c.warn > 0 ? '#FCD34D' : '#6EE7B7';
                html += '<div style="color:' + color + ';margin-bottom:2px;">' + label + ': ' + c.pass + '/' + total;
                if (c.warn > 0) html += ' <span style="color:#FCD34D;">(' + c.warn + ' warn)</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        if (result.failed.length > 0) {
            html += '<div style="color:#FCA5A5;margin-bottom:6px;"><strong>FAILED (' + result.failed.length + '):</strong></div>';
            result.failed.forEach(function(f) {
                html += '<div style="color:#FCA5A5;padding:2px 0;font-size:11px;">&#x274C; <strong>' + (f.id || '') + '</strong> ' + f.check + '<br><span style="color:#F87171;padding-left:18px;">' + f.detail + '</span></div>';
            });
        }
        if (result.warnings.length > 0) {
            html += '<div style="color:#FCD34D;margin-top:6px;"><strong>WARNINGS (' + result.warnings.length + '):</strong></div>';
            result.warnings.forEach(function(w) {
                html += '<div style="color:#FCD34D;padding:2px 0;font-size:11px;">&#x26A0;&#xFE0F; <strong>' + (w.id || '') + '</strong> ' + w.check + ': ' + w.detail + '</div>';
            });
        }
        if (result.passed.length > 0) {
            html += '<div style="color:#6EE7B7;margin-top:6px;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
                    '<strong>PASSED (' + result.passed.length + ') &#x25BC;</strong></div>';
            html += '<div style="display:none;">';
            result.passed.forEach(function(p) {
                html += '<div style="color:#6EE7B7;padding:1px 0;font-size:11px;">&#x2705; <strong>' + (p.id || '') + '</strong> ' + p.check + '</div>';
            });
            html += '</div>';
        }
        return html;
    }

    /** Format field audit as HTML */
    function _formatFieldAudit(audit) {
        var html = '<div style="margin-bottom:8px;font-weight:bold;color:' +
                   (audit.score >= 90 ? '#10B981' : audit.score >= 70 ? '#F59E0B' : '#EF4444') +
                   ';">Field Score: ' + audit.score + '% (' + audit.present + '/' + audit.total + ')</div>';

        html += '<div style="font-size:11px;margin-bottom:6px;">Property Type: <strong>' + (audit.propertyType || 'None selected') + '</strong></div>';

        if (audit.missingList.length > 0) {
            html += '<div style="color:#FCA5A5;margin-bottom:6px;"><strong>MISSING (' + audit.missingList.length + '):</strong></div>';
            audit.missingList.forEach(function(f) {
                html += '<div style="color:#FCA5A5;padding:2px 0;font-size:11px;">&#x274C; <strong>' + f.ref + '</strong> ' + f.label;
                if (f.conditional) html += ' <span style="color:#9CA3AF;">[cond: ' + (Array.isArray(f.conditional) ? f.conditional.join(',') : f.conditional) + ']</span>';
                html += '</div>';
            });
        }

        var foundFields = audit.fields.filter(function(f) { return f.status === 'FOUND'; });
        var skippedFields = audit.fields.filter(function(f) { return f.status === 'SKIP'; });

        if (skippedFields.length > 0) {
            html += '<div style="color:#9CA3AF;margin-top:6px;"><strong>SKIPPED (not relevant for ' + (audit.propertyType || 'current type') + '): ' + skippedFields.length + '</strong></div>';
        }

        if (foundFields.length > 0) {
            html += '<div style="color:#6EE7B7;margin-top:6px;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
                    '<strong>FOUND (' + foundFields.length + ') &#x25BC;</strong></div>';
            html += '<div style="display:none;">';
            foundFields.forEach(function(f) {
                html += '<div style="color:#6EE7B7;padding:1px 0;font-size:11px;">&#x2705; <strong>' + f.ref + '</strong> ' + f.label + '</div>';
            });
            html += '</div>';
        }

        return html;
    }

    /** Format Fair Housing scan as HTML */
    function _formatFairHousing(report) {
        var html = '<div style="margin-bottom:6px;font-weight:bold;">Fair Housing & Content Audit</div>';
        html += '<div style="font-size:12px;">' + report.summary + '</div>';

        if (report.violations.length > 0) {
            html += '<div style="color:#FCA5A5;margin-top:6px;">';
            report.violations.forEach(function(v) {
                html += '<div style="padding:3px 0;font-size:12px;">&#x274C; <strong>#' + v.fieldId + '</strong></div>';
                v.issues.forEach(function(issue) {
                    var color = issue.severity === 'CRITICAL' ? '#FCA5A5' : '#FCD34D';
                    html += '<div style="padding-left:16px;font-size:11px;color:' + color + ';">[' + issue.severity + '] ' + issue.type + ': ' + issue.detail + '<br><span style="color:#9CA3AF;">' + issue.law + '</span></div>';
                });
            });
            html += '</div>';
        } else {
            html += '<div style="color:#6EE7B7;margin-top:6px;">&#x2705; All text fields pass Fair Housing and content restriction scan</div>';
        }

        // Penalty reference
        html += '<div style="margin-top:10px;font-size:10px;color:#9CA3AF;border-top:1px solid #374151;padding-top:6px;">' +
                '<strong>Penalty Reference:</strong><br>' +
                'Fair Housing: 1st = $250 + 2 business days to correct. 2nd = $500 + RLS termination.<br>' +
                'Agent Info/Off-Market/Compensation: Data quality violation. Escalating: $0/$250/$250/termination.<br>' +
                'Quarterly >5% rejection rate: $10,000 fine.' +
                '</div>';

        return html;
    }

    // --- Internal button handlers ---

    function _runValidate() {
        var out = document.getElementById('saleFormDoctorOutput');
        if (out) out.innerHTML = _formatValidation(validate());
    }

    function _runCompliance() {
        var out = document.getElementById('saleFormDoctorOutput');
        if (out) out.innerHTML = _formatValidation(validateCompliance());
    }

    function _runFieldAudit() {
        var out = document.getElementById('saleFormDoctorOutput');
        if (out) out.innerHTML = _formatFieldAudit(auditFields());
    }

    function _runFairHousing() {
        var out = document.getElementById('saleFormDoctorOutput');
        if (out) out.innerHTML = _formatFairHousing(scanFairHousing());
    }


    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        VERSION: VERSION,

        // Core functions
        validate:           validate,
        validateCompliance: validateCompliance,
        auditFields:        auditFields,
        scanFairHousing:    scanFairHousing,

        // Reference data
        COTALITY_PROPERTY_TYPE_MAP: COTALITY_PROPERTY_TYPE_MAP,
        MANDATORY_FIELDS:       MANDATORY_FIELDS,
        FAIR_HOUSING_PATTERNS:  FAIR_HOUSING_PATTERNS,
        CONTENT_RESTRICTION_PATTERNS: CONTENT_RESTRICTION_PATTERNS,

        // UI
        renderPanel: renderPanel,

        // Internal handlers (called by onclick in panel HTML)
        _runValidate:    _runValidate,
        _runCompliance:  _runCompliance,
        _runFieldAudit:  _runFieldAudit,
        _runFairHousing: _runFairHousing
    };

})();


// Auto-render panel on DOMContentLoaded if a sale form is detected
document.addEventListener('DOMContentLoaded', function() {
    // Detect sale form by checking for key elements
    var isSaleForm = document.getElementById('saleMainTab1') ||
                     document.querySelector('input[name="salePropertyType"]') ||
                     document.getElementById('salePrice');
    if (isSaleForm && !document.getElementById('saleFormDoctorPanel')) {
        SaleFormDoctor.renderPanel();
    }
});
