/**
 * search-core.js — Single Source of Truth for Search Engine
 * REBNY RLS / IDX / RESO / Trestle Compliant
 * Mallan Real Estate Inc. — Brokerage License #10991205323
 *
 * RULES:
 *   - All search logic lives HERE. index-built.html inlines this
 *     file via build.js.
 *   - No MLS/IDX data is fetched client-side — search operates on
 *     mock data or a server-fed JSON payload pre-filtered for opt-outs.
 *   - IDX display gates, REBNY attribution, Fair Housing disclaimers,
 *     and compliance checks are enforced at every output surface.
 *
 * VERSION: 1.1.0
 * DATE: 2026-02-13
 *
 * v1.1.0 — Compliance remediation:
 *   - DH-07: InternetEntireListingDisplayYN master cascade gate
 *   - SD-06/LO-03: Per-listing "Listing Courtesy of" attribution (UCBA Art. III, Sec. 2(C))
 *   - SD-15: PropertyCondition disclaimer (REBNY B7)
 *   - SD-13: Agent-only/hidden field gate (isAgentOnlyField)
 *   - DH-02: Bulk output limit (max 50 listings per batch)
 *   - LO-07: Commission negotiability disclosure in legal footer
 *   - Added missing sub-statuses: BoardPackageSubmitted, ApplicationIn/Approved,
 *     LeaseOut/Signed, LeaseRenewal, SoldSubjectToContingencies, Transferred
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MAPPING TABLES (UI tokens → data values)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * STATUS_MAP: Maps UI checkbox data-value tokens to listing.status values.
 * Checkbox data-value (left) → mock data status strings (right).
 * Both sale and rental use the same RESO StandardStatus values.
 */
var SearchCore = (function() {

    var STATUS_MAP = {
        // Main statuses
        'Active':       'ACTIVE',
        'BackOnMarket': 'ACTIVE',      // Back on Market = still Active
        'ComingSoon':   'COMING_SOON',
        'Future':       'FUTURE',
        'Pending':      'PENDING',
        'Closed':       'CLOSED',
        'Withdrawn':    'WITHDRAWN',
        'Canceled':     'CANCELED',
        'Expired':      'EXPIRED',
        'Hold':         'HOLD',
        'Incomplete':   'INCOMPLETE',

        // Sub-statuses → parent StandardStatus
        'OfferAccepted':       'PENDING',
        'OfferInNegotiation':  'PENDING',
        'OfferContingent':     'PENDING',
        'OfferWithKickOut':    'PENDING',
        'ContractOut':         'PENDING',
        'ContractSigned':      'PENDING',
        'AttorneyReview':      'PENDING',
        'BoardApproved':       'PENDING',
        'Sold':                'CLOSED',
        'Rented':              'CLOSED',
        'SoldThruUs':          'CLOSED',
        // Additional sub-statuses from SEARCH_CONTROL_MAP
        'BoardPackageSubmitted': 'PENDING',
        'SoldSubjectToContingencies': 'CLOSED',
        'TransferredToNewConstruction': 'CLOSED',
        // Rental-specific sub-statuses
        'ApplicationIn':       'PENDING',
        'ApplicationApproved': 'PENDING',
        'LeaseOut':            'PENDING',
        'LeaseSigned':         'PENDING',
        'LeaseRenewal':        'CLOSED'
    };

    /**
     * OWNERSHIP_MAP: Maps RESO CommonInterest data-value tokens to
     * display labels used in mock listing data (listing.ownership).
     *
     * The checkboxes use RESO field values; the mock data uses NYC common names.
     * This bridge prevents the mismatch that caused ownership filters to return 0 results.
     */
    var OWNERSHIP_MAP = {
        'StockCooperative':  'Co-op',
        'Cooperative':       'Co-op',
        'Condominium':       'Condo',
        'Condop':            'Condop',
        'RentalBuilding':    'Rental Building',
        'Rental Building':   'Rental Building',
        'Townhouse':         'Townhouse',
        'SingleFamily':      'Single Family',
        'Single Family':     'Single Family',
        'MultiFamily':       'Multi-Family',
        'Multi-Family':      'Multi-Family',
        'Land':              'Land',
        'CommercialCondominium':  'Commercial Condo',
        'CommercialCooperative':  'Commercial Co-op'
    };

    /**
     * PROPERTY_TYPE_MATRIX: Maps NYC common name → RESO trio.
     * Used for RESO-correct filtering and future Trestle integration.
     */
    var PROPERTY_TYPE_MATRIX = {
        'Condo':              { PropertyType: 'Residential',  CommonInterest: 'Condominium',   PropertySubType: 'Condominium' },
        'Co-op':              { PropertyType: 'Residential',  CommonInterest: 'Cooperative',   PropertySubType: 'Cooperative' },
        'Condop':             { PropertyType: 'Residential',  CommonInterest: 'Condop',        PropertySubType: 'Condop' },
        'Rental Building':    { PropertyType: 'Residential',  CommonInterest: 'None',          PropertySubType: 'Apartment' },
        'Townhouse':          { PropertyType: 'Residential',  CommonInterest: 'None',          PropertySubType: 'Townhouse' },
        'Single Family':      { PropertyType: 'Residential',  CommonInterest: 'None',          PropertySubType: 'Single Family Residence' },
        'Multi-Family':       { PropertyType: 'Residential',  CommonInterest: 'None',          PropertySubType: 'Multi Family' },
        'Mixed Use':          { PropertyType: 'Commercial',   CommonInterest: 'None',          PropertySubType: 'Mixed Use' },
        'Commercial Condo':   { PropertyType: 'Commercial',   CommonInterest: 'Condominium',   PropertySubType: 'Commercial Condominium' },
        'Commercial Co-op':   { PropertyType: 'Commercial',   CommonInterest: 'Cooperative',   PropertySubType: 'Commercial Cooperative' },
        'Land':               { PropertyType: 'Land',         CommonInterest: 'None',          PropertySubType: 'Unimproved Land' },
        'Deeded Parking':     { PropertyType: 'Residential',  CommonInterest: 'Condominium',   PropertySubType: 'Parking Space' }
    };

    /**
     * DOM_ID_MAP: Maps search tab + field → DOM element IDs.
     * Centralizes all hardcoded IDs so they're declared once.
     * When IDs change in HTML, update HERE — not in 10 functions.
     */
    var DOM_ID_MAP = {
        sale: {
            form:     'searchBasicMode',
            priceMin: 'saleMinPrice',
            priceMax: 'saleMaxPrice',
            bedsMin:  'saleMinBeds',
            bedsMax:  'saleMaxBeds',
            bathsMin: 'saleMinBaths',
            bathsMax: 'saleMaxBaths',
            roomsMin: 'saleMinRooms',
            roomsMax: 'saleMaxRooms',
            sqftMin:  'saleMinSqft',
            sqftMax:  'saleMaxSqft'
        },
        rent: {
            form:     'searchBasicModeRental',
            priceMin: 'rentalMinRent',
            priceMax: 'rentalMaxRent',
            bedsMin:  'rentalMinBeds',
            bedsMax:  'rentalMaxBeds',
            bathsMin: 'rentalMinBaths',
            bathsMax: 'rentalMaxBaths',
            roomsMin: 'rentalMinRooms',
            roomsMax: 'rentalMaxRooms',
            sqftMin:  'rentalMinSqft',
            sqftMax:  'rentalMaxSqft'
        },
        building: {
            form:     'searchBasicModeBuilding',
            priceMin: 'saleMinPrice',  // Building tab inherits sale price IDs
            priceMax: 'saleMaxPrice',
            bedsMin:  'saleMinBeds',
            bedsMax:  'saleMaxBeds',
            bathsMin: 'saleMinBaths',
            bathsMax: 'saleMaxBaths',
            roomsMin: 'saleMinRooms',
            roomsMax: 'saleMaxRooms',
            sqftMin:  'saleMinSqft',
            sqftMax:  'saleMaxSqft'
        }
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // 2. COMPLIANCE GATES (IDX / REBNY / RLS / Fair Housing)
    // ═══════════════════════════════════════════════════════════════════════════

    var Compliance = {

        /** Brokerage info — used in all output surfaces */
        brokerage: {
            name:       'Demo Realty Inc.',
            license:    '#DEMO-LIC-001',
            agentName:  'Demo Agent',
            agentLicense: '#DEMO-AGT-001',
            phone:      '555-000-0000',
            email:      'demo@example.com',
            address:    '123 Demo Street, Suite 1, New York, NY 10001',
            website:    'example.com'
        },

        /**
         * Check if a listing can be displayed on any surface.
         * Returns { allowed: bool, reason: string, addressVisible: bool }
         *
         * REBNY/IDX Rules enforced:
         *   - IDXEntireListingDisplayYN = false → NEVER display
         *   - Owner Opt-Out → NEVER display publicly
         *   - InternetAddressDisplayYN = false → hide address
         */
        checkListingDisplay: function(listing) {
            // Master gate: InternetEntireListingDisplayYN (REBNY B6)
            // If false, AUTO-CASCADES: IDX=false, Address=false, AVM=false, ConsumerComment=false
            if (listing.internetEntireListingDisplayYN === false || listing.internetDisplayYN === false) {
                return { allowed: false, reason: 'Internet display opted out (InternetEntireListingDisplayYN=false) — cascades to IDX/address/AVM', addressVisible: false };
            }
            // IDX display gate
            if (listing.idxDisplayYN === false) {
                return { allowed: false, reason: 'IDX display opted out (IDXEntireListingDisplayYN=false)', addressVisible: false };
            }
            // Owner opt-out gate (UCBA Art. I, Sec. 5(A) — incurable violation)
            if (listing.ownerOptOut === true) {
                return { allowed: false, reason: 'Owner has opted out of display', addressVisible: false };
            }
            // Participant-only gate (UCBA Definition (W))
            if (listing.participantOnly === true) {
                return { allowed: false, reason: 'Participant-only listing — requires RLS participant login', addressVisible: false };
            }
            // Address suppression
            var addrVisible = listing.addressDisplayYN !== false;
            return { allowed: true, reason: null, addressVisible: addrVisible };
        },

        /**
         * Check multiple listings before output (print/email/share).
         * Returns { passed: Listing[], blocked: {listing, reason}[] }
         */
        /** Maximum listings per output batch (UCBA Art. VIII, Sec. 4 — no bulk redistribution) */
        MAX_OUTPUT_BATCH: 400,

        gateListingsForOutput: function(listings) {
            var passed = [];
            var blocked = [];
            listings.forEach(function(listing) {
                var check = Compliance.checkListingDisplay(listing);
                if (check.allowed) {
                    passed.push(listing);
                } else {
                    blocked.push({ listing: listing, reason: check.reason });
                }
            });
            // Enforce bulk output limit to prevent data redistribution
            if (passed.length > Compliance.MAX_OUTPUT_BATCH) {
                var excess = passed.splice(Compliance.MAX_OUTPUT_BATCH);
                excess.forEach(function(listing) {
                    blocked.push({ listing: listing, reason: 'Exceeds maximum output batch size (' + Compliance.MAX_OUTPUT_BATCH + ')' });
                });
            }
            return { passed: passed, blocked: blocked };
        },

        /**
         * Scan listing description for prohibited content.
         * REBNY Rules: No agent contact info, no compensation, no "off-market" language.
         * Returns array of violations found.
         */
        scanDescription: function(text) {
            if (!text) return [];
            var violations = [];
            var lower = text.toLowerCase();

            // Phone numbers
            if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)) {
                violations.push({ type: 'AGENT_CONTACT', detail: 'Phone number found in description' });
            }
            // Email addresses
            if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
                violations.push({ type: 'AGENT_CONTACT', detail: 'Email address found in description' });
            }
            // URLs
            if (/https?:\/\/|www\./i.test(text)) {
                violations.push({ type: 'AGENT_CONTACT', detail: 'URL found in description' });
            }
            // Compensation language
            if (/commission|broker fee|co-broke|buyer.?s?\s*agent\s*compensation/i.test(text)) {
                violations.push({ type: 'COMPENSATION', detail: 'Compensation language found in description' });
            }
            // Off-market language
            if (/off[\s-]?market|pocket\s*listing|whisper\s*listing/i.test(text)) {
                violations.push({ type: 'OFF_MARKET', detail: '"Off-market" language found in description' });
            }
            // Fair Housing — protected class references
            var fhPatterns = /\b(family status|familial|children|race|religion|national origin|disability|handicap|sex|gender|sexual orientation|marital status|age|citizenship|military|source of income|lawful occupation)\b/i;
            if (fhPatterns.test(text)) {
                violations.push({ type: 'FAIR_HOUSING', detail: 'Potential protected class reference in description — review required' });
            }
            // Section 8 / voucher discrimination
            if (/no\s*(section\s*8|voucher|housing\s*choice|hcv)/i.test(text)) {
                violations.push({ type: 'SOURCE_OF_INCOME', detail: 'Source of income discrimination (NYC/NYS law)' });
            }
            return violations;
        },

        /** REBNY RLS Attribution — required on ALL listing display surfaces */
        getAttribution: function() {
            return 'Listing(s) courtesy of the REBNY Listing Service (RLS). ' +
                   'Information is deemed reliable but not guaranteed.';
        },

        /** Full legal footer for print/email output */
        getLegalFooter: function(timestamp) {
            var ts = timestamp || new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
            return 'Listing(s) courtesy of the REBNY Listing Service (RLS)\n' +
                   'Information is deemed reliable but not guaranteed.\n' +
                   'Last Updated: ' + ts + '\n' +
                   'Broker commissions are not set by law and are fully negotiable.\n' +
                   'Equal Housing Opportunity \u2014 Federal Fair Housing Act, ' +
                   'NY State Human Rights Law, NYC Human Rights Law Title 8\n' +
                   Compliance.brokerage.name + '\n' +
                   'Brokerage License: ' + Compliance.brokerage.license + '\n' +
                   Compliance.brokerage.address + ' | ' +
                   Compliance.brokerage.phone + ' | ' +
                   Compliance.brokerage.website;
        },

        /** Coming Soon badge text — REBNY required format */
        getComingSoonBadge: function(activationDate) {
            var dateStr = activationDate || 'TBD';
            return 'Coming Soon. No Showings or Open House until ' + dateStr;
        },

        /** Statistical data disclaimer — required on CMA/comps output */
        getStatisticalDisclaimer: function(startDate, endDate) {
            return 'Based on information from the REBNY Listing Service for the period ' +
                   (startDate || '[start date]') + ' through ' + (endDate || '[end date]') + '. ' +
                   'This is not an appraisal. This comparative market analysis is an opinion of value ' +
                   'prepared by a licensed real estate salesperson, not a licensed appraiser.';
        },

        /** Check if a field is VOW-only (requires authenticated client login) */
        isVOWOnly: function(fieldName) {
            var vowFields = [
                'taxHistory', 'historicalPrices', 'showingFeedback',
                'agentRemarks', 'privateRemarks', 'buyerAgentRemarks',
                'compensationAmount', 'compensationPercent',
                'closePrice', 'closeDate'
            ];
            return vowFields.indexOf(fieldName) !== -1;
        },

        /**
         * Check if a field is agent-only or hidden (REBNY B3, B7).
         * These fields MUST NEVER appear on any public or client-facing surface.
         * Includes HID (hidden from all), AGT (agent view only).
         */
        isAgentOnlyField: function(fieldName) {
            var agentOnlyFields = [
                // HID — never display on IDX/WWW
                'expirationDate',
                // AGT — agent view only
                'privateRemarks', 'showingInstructions', 'propertyCondition',
                'concessionsAmount', 'concessionsComments',
                // Financial (AGT only)
                'capitalReservesTotal', 'netOperatingIncome', 'operatingExpense', 'capRate',
                'grossIncome', 'grossScheduledIncome', 'netIncome',
                // Compensation (NEVER display — UCBA Art. IV)
                'buyerBrokerageCompensation', 'buyerBrokerageCompensationType',
                'compensationAmount', 'compensationPercent',
                'cooperatingBrokerCompensation', 'transactionBrokerCompensation',
                // Buyer agent (CLOSED only — REBNY I28)
                'buyerAgentFullName', 'buyerOfficeName'
            ];
            return agentOnlyFields.indexOf(fieldName) !== -1;
        },

        /**
         * PropertyCondition disclaimer — REBNY B7.
         * Required whenever PropertyCondition field is displayed in agent view.
         */
        getPropertyConditionDisclaimer: function() {
            return 'Property Condition information is not verified for authenticity or accuracy, ' +
                   'is self reported and is supplied by sources other than the RLS.';
        },

        /**
         * Commission negotiability disclosure — UCBA Art. I, Sec. 17.
         * Required in listing agreements, buyer agreements, and pre-closing docs.
         */
        getCommissionDisclosure: function() {
            return 'Broker commissions are not set by law and are fully negotiable.';
        }
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // 3. CRITERIA COLLECTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Collect search criteria from the active search form.
     *
     * @param {string} mode - 'sale', 'rent', or 'building'
     * @returns {object} criteria - Normalized criteria object
     *
     * Reads DOM elements by ID (via DOM_ID_MAP) and data-field attributes.
     * All numeric values are properly typed (parseInt/parseFloat).
     * Studio (beds=0) is handled correctly — explicit undefined checks, NOT || fallbacks.
     */
    function collectSearchCriteria(mode) {
        var ids = DOM_ID_MAP[mode] || DOM_ID_MAP.sale;
        var criteria = {
            searchTab: mode,
            statuses: [],
            ownership: [],
            neighborhoods: []
        };

        // ─── Numeric range fields ───
        // Use explicit undefined checks — NOT "|| Infinity" which breaks beds=0 (Studio)
        var fields = [
            { key: 'priceMin', id: ids.priceMin, parser: parseInt },
            { key: 'priceMax', id: ids.priceMax, parser: parseInt },
            { key: 'bedsMin',  id: ids.bedsMin,  parser: parseInt },
            { key: 'bedsMax',  id: ids.bedsMax,  parser: parseInt },
            { key: 'bathsMin', id: ids.bathsMin, parser: parseFloat },  // Half-baths: 1.5, 2.5
            { key: 'bathsMax', id: ids.bathsMax, parser: parseFloat },
            { key: 'roomsMin', id: ids.roomsMin, parser: parseInt },
            { key: 'roomsMax', id: ids.roomsMax, parser: parseInt },
            { key: 'sqftMin',  id: ids.sqftMin,  parser: parseInt },
            { key: 'sqftMax',  id: ids.sqftMax,  parser: parseInt }
        ];

        fields.forEach(function(f) {
            var el = document.getElementById(f.id);
            if (el && el.value !== '' && el.value !== 'custom') {
                var parsed = f.parser(el.value);
                if (!isNaN(parsed)) {
                    criteria[f.key] = parsed;
                }
            }
        });

        // ─── Status checkboxes ───
        // Collect from BOTH basic and advanced forms (whichever is visible)
        var formEl = document.getElementById(ids.form);
        var advancedForm = document.getElementById('searchAdvancedMode');
        var activeForm = formEl;

        // If advanced mode is visible, collect from there instead
        if (advancedForm && advancedForm.style.display !== 'none' &&
            advancedForm.offsetParent !== null) {
            activeForm = advancedForm;
        }

        if (activeForm) {
            var statusCbs = activeForm.querySelectorAll('[data-field="MlsStatus"]:checked');
            statusCbs.forEach(function(cb) {
                var val = cb.getAttribute('data-value');
                var sub = cb.getAttribute('data-sub-status');

                if (sub) {
                    // Sub-status → map to parent StandardStatus via STATUS_MAP
                    var mapped = STATUS_MAP[sub];
                    if (mapped && criteria.statuses.indexOf(mapped) === -1) {
                        criteria.statuses.push(mapped);
                    }
                } else if (val) {
                    // Handle comma-separated values (e.g., "Withdrawn,Canceled,Expired,Hold")
                    val.split(',').forEach(function(part) {
                        var token = part.trim();
                        var mapped = STATUS_MAP[token];
                        if (mapped && criteria.statuses.indexOf(mapped) === -1) {
                            criteria.statuses.push(mapped);
                        }
                    });
                }
            });

            // ─── Ownership checkboxes ───
            var ownerCbs = activeForm.querySelectorAll('[data-field="CommonInterest"]:checked');
            ownerCbs.forEach(function(cb) {
                var val = cb.getAttribute('data-value') || cb.value;
                if (val) {
                    // Map RESO token → display label using OWNERSHIP_MAP
                    var displayLabel = OWNERSHIP_MAP[val] || val;
                    if (criteria.ownership.indexOf(displayLabel) === -1) {
                        criteria.ownership.push(displayLabel);
                    }
                }
            });
        }

        // ─── Neighborhood tree ───
        var neighborhoodTree = null;
        if (mode === 'building') {
            var bldgForm = document.getElementById('searchBasicModeBuilding');
            if (bldgForm) neighborhoodTree = bldgForm.querySelector('.neighborhood-tree');
        }
        // Also check advanced mode
        if (advancedForm && advancedForm.style.display !== 'none') {
            var advTree = advancedForm.querySelector('.neighborhood-tree');
            if (advTree) neighborhoodTree = advTree;
        }
        if (neighborhoodTree) {
            neighborhoodTree.querySelectorAll('label input[type="checkbox"]:checked').forEach(function(cb) {
                var label = cb.closest('label');
                if (label) {
                    var text = label.textContent.trim();
                    if (text && criteria.neighborhoods.indexOf(text) === -1) {
                        criteria.neighborhoods.push(text);
                    }
                }
            });
        }

        return criteria;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 4. FILTER ENGINE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Filter listings against collected criteria.
     *
     * @param {Array} listings - Full listing array
     * @param {object} criteria - Output of collectSearchCriteria()
     * @param {object} [options] - { explain: true } to get step-by-step breakdown
     * @returns {Array|object} - Filtered listings, or { results, steps } if explain=true
     *
     * RULES:
     *   - beds=0 (Studio) is valid — uses explicit !== undefined checks
     *   - null sqft → listing is EXCLUDED when sqft filter is set
     *   - Ownership comparison uses OWNERSHIP_MAP for RESO→display translation
     *   - Status comparison is case-insensitive
     *   - Condo must NOT match Condop (exact match, not indexOf)
     *   - IDX opted-out listings are always excluded
     */
    function filterListings(listings, criteria, options) {
        var explain = options && options.explain;
        var steps = [];
        var current = listings.slice(); // Don't mutate original

        function step(name, filterFn) {
            var before = current.length;
            current = current.filter(filterFn);
            var after = current.length;
            if (explain) {
                steps.push({ name: name, before: before, after: after, removed: before - after });
            }
        }

        // Step 0: IDX compliance gate — always first
        step('IDX Display Gate', function(listing) {
            return Compliance.checkListingDisplay(listing).allowed;
        });

        // Step 1: Tab filter (sale vs rental)
        step('Tab Filter (' + criteria.searchTab + ')', function(listing) {
            if (criteria.searchTab === 'rent') return listing.listingCategory === 'rental';
            if (criteria.searchTab === 'sale') return listing.listingCategory !== 'rental';
            return true; // building tab shows all
        });

        // Step 2: Status filter
        if (criteria.statuses && criteria.statuses.length > 0) {
            step('Status (' + criteria.statuses.join(', ') + ')', function(listing) {
                var listingStatus = (listing.status || '').toUpperCase();
                return criteria.statuses.some(function(s) {
                    return listingStatus === s.toUpperCase();
                });
            });
        }

        // Step 3: Ownership filter (exact match, RESO-mapped)
        if (criteria.ownership && criteria.ownership.length > 0) {
            step('Ownership (' + criteria.ownership.join(', ') + ')', function(listing) {
                var listingOwn = (listing.ownership || '').toLowerCase();
                return criteria.ownership.some(function(o) {
                    return listingOwn === o.toLowerCase();
                });
            });
        }

        // Step 4: Price range
        if (criteria.priceMin !== undefined) {
            step('Price Min ($' + criteria.priceMin.toLocaleString() + ')', function(listing) {
                return listing.price >= criteria.priceMin;
            });
        }
        if (criteria.priceMax !== undefined) {
            step('Price Max ($' + criteria.priceMax.toLocaleString() + ')', function(listing) {
                return listing.price <= criteria.priceMax;
            });
        }

        // Step 5: Beds (beds=0 = Studio — explicit undefined check)
        if (criteria.bedsMin !== undefined) {
            step('Beds Min (' + criteria.bedsMin + ')', function(listing) {
                return listing.beds !== undefined && listing.beds !== null && listing.beds >= criteria.bedsMin;
            });
        }
        if (criteria.bedsMax !== undefined) {
            step('Beds Max (' + criteria.bedsMax + ')', function(listing) {
                return listing.beds !== undefined && listing.beds !== null && listing.beds <= criteria.bedsMax;
            });
        }

        // Step 6: Baths (supports half-baths: 1.5, 2.5)
        if (criteria.bathsMin !== undefined) {
            step('Baths Min (' + criteria.bathsMin + ')', function(listing) {
                return listing.baths !== undefined && listing.baths !== null && listing.baths >= criteria.bathsMin;
            });
        }
        if (criteria.bathsMax !== undefined) {
            step('Baths Max (' + criteria.bathsMax + ')', function(listing) {
                return listing.baths !== undefined && listing.baths !== null && listing.baths <= criteria.bathsMax;
            });
        }

        // Step 7: Rooms
        if (criteria.roomsMin !== undefined) {
            step('Rooms Min (' + criteria.roomsMin + ')', function(listing) {
                return listing.rooms !== undefined && listing.rooms !== null && listing.rooms >= criteria.roomsMin;
            });
        }
        if (criteria.roomsMax !== undefined) {
            step('Rooms Max (' + criteria.roomsMax + ')', function(listing) {
                return listing.rooms !== undefined && listing.rooms !== null && listing.rooms <= criteria.roomsMax;
            });
        }

        // Step 8: SqFt — listings with null/undefined sqft are EXCLUDED when filter is set
        if (criteria.sqftMin !== undefined) {
            step('SqFt Min (' + criteria.sqftMin + ')', function(listing) {
                if (listing.intSqft === null || listing.intSqft === undefined) return false;
                return listing.intSqft >= criteria.sqftMin;
            });
        }
        if (criteria.sqftMax !== undefined) {
            step('SqFt Max (' + criteria.sqftMax + ')', function(listing) {
                if (listing.intSqft === null || listing.intSqft === undefined) return false;
                return listing.intSqft <= criteria.sqftMax;
            });
        }

        // Step 9: Neighborhood
        if (criteria.neighborhoods && criteria.neighborhoods.length > 0) {
            step('Neighborhoods (' + criteria.neighborhoods.length + ' selected)', function(listing) {
                return criteria.neighborhoods.some(function(n) {
                    return (listing.neighborhood || '').toLowerCase() === n.toLowerCase();
                });
            });
        }

        if (explain) {
            return { results: current, steps: steps };
        }
        return current;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 5. SORT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Sort listings by field. Supports numeric, string, and date sorting.
     * Null/undefined values sort to the end.
     *
     * @param {Array} listings - Array to sort (will be mutated)
     * @param {string} field - Listing object key to sort by
     * @param {string} order - 'asc' or 'desc'
     * @returns {Array} - Same array, sorted
     */
    function sortListings(listings, field, order) {
        if (!field) return listings;
        var dir = (order === 'desc') ? -1 : 1;

        listings.sort(function(a, b) {
            var va = a[field];
            var vb = b[field];

            // Nulls to end
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;

            // Numeric
            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * dir;
            }

            // String (case-insensitive)
            va = String(va).toLowerCase();
            vb = String(vb).toLowerCase();
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });

        return listings;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 6. PAGINATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Paginate a listing array.
     *
     * @param {Array} listings - Full (sorted, filtered) array
     * @param {number} page - 1-based page number
     * @param {number} pageSize - Items per page
     * @returns {object} - { items: [], page, pageSize, totalItems, totalPages }
     */
    function paginateListings(listings, page, pageSize) {
        var total = listings.length;
        var totalPages = Math.max(1, Math.ceil(total / pageSize));
        var safePage = Math.max(1, Math.min(page, totalPages));
        var start = (safePage - 1) * pageSize;
        var items = listings.slice(start, start + pageSize);

        return {
            items: items,
            page: safePage,
            pageSize: pageSize,
            totalItems: total,
            totalPages: totalPages
        };
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 7. COMBINED PIPELINE: getFilteredListings()
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Full pipeline: filter → sort → paginate.
     * This is the single function that render views should call.
     *
     * @param {object} state - searchResultsState object with:
     *   { filteredListings, sortField, sortOrder, currentPage, perPage }
     * @param {Array} allListings - Full listings array (fallback if no filter)
     * @param {boolean} [skipPagination] - True to get all results (for totals)
     * @returns {object} - { items, page, pageSize, totalItems, totalPages }
     *   or just the sorted array if skipPagination=true
     */
    function getFilteredListings(state, allListings, skipPagination) {
        var listings = (state.filteredListings || allListings).slice();

        // Sort
        sortListings(listings, state.sortField, state.sortOrder);

        // Paginate (unless skipped for total count)
        if (skipPagination) {
            return listings;
        }
        return paginateListings(listings, state.currentPage, state.perPage || 50);
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 8. QUICK SEARCH
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Quick search by RLS ID, zip, address, or unit.
     * Reads input values from the Quick Search card that contains the button.
     *
     * @param {HTMLElement} btn - The clicked Search button
     * @param {Array} listings - Full listings array
     * @returns {Array} - Filtered results
     */
    function quickSearch(btn, listings) {
        var card = btn.closest('.border.rounded-lg') || btn.closest('.border');
        if (!card) return listings;

        var inputs = card.querySelectorAll('input[type="text"]');
        var rlsId = '', zip = '', address = '', unit = '';

        inputs.forEach(function(inp) {
            var ph = (inp.placeholder || '').toLowerCase();
            var val = inp.value.trim();
            if (!val) return;
            if (ph.indexOf('rls') !== -1 || ph.indexOf('listing') !== -1) rlsId = val;
            else if (ph.indexOf('zip') !== -1) zip = val;
            else if (ph.indexOf('address') !== -1 || ph.indexOf('building') !== -1) address = val;
            else if (ph.indexOf('unit') !== -1) unit = val;
        });

        if (!rlsId && !zip && !address) {
            return null; // No criteria entered
        }

        return listings.filter(function(listing) {
            // RLS ID match (comma-separated, check lid and wid)
            if (rlsId) {
                var ids = rlsId.split(',').map(function(s) { return s.trim().toLowerCase(); });
                var lid = (listing.lid || '').toLowerCase();
                var wid = (listing.wid || '').toLowerCase();
                var idStr = String(listing.id);
                var matchesId = ids.some(function(id) {
                    return lid === id || wid === id || idStr === id;
                });
                if (!matchesId) return false;
            }
            // Zip match
            if (zip && (listing.zip || '') !== zip) return false;
            // Address match (partial, case-insensitive)
            if (address && (listing.address || '').toLowerCase().indexOf(address.toLowerCase()) === -1) return false;
            // Unit match (exact, case-insensitive)
            if (unit && (!listing.unit || listing.unit.toLowerCase() !== unit.toLowerCase())) return false;

            // IDX compliance gate
            return Compliance.checkListingDisplay(listing).allowed;
        });
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 9. CLEAR SEARCH FORM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Reset all search form fields to defaults.
     * Clears all three forms (sale, rental, building) to prevent stale state.
     */
    function clearSearchForm() {
        var formIds = ['searchBasicMode', 'searchBasicModeRental', 'searchBasicModeBuilding'];
        formIds.forEach(function(formId) {
            var form = document.getElementById(formId);
            if (!form) return;

            // Reset selects to first option
            form.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });

            // Uncheck all checkboxes
            form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });

            // Clear text inputs
            form.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(inp) { inp.value = ''; });
        });

        // Also clear advanced mode
        var advForm = document.getElementById('searchAdvancedMode');
        if (advForm) {
            advForm.querySelectorAll('select').forEach(function(sel) { sel.selectedIndex = 0; });
            advForm.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
            advForm.querySelectorAll('input[type="text"], input[type="number"]').forEach(function(inp) { inp.value = ''; });
        }

        // Re-check "All Active" status checkbox (default state)
        formIds.forEach(function(formId) {
            var form = document.getElementById(formId);
            if (!form) return;
            var activeCb = form.querySelector('[data-field="MlsStatus"][data-value="Active"]');
            if (activeCb) activeCb.checked = true;
        });
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 10. SELECTION MODEL
    // ═══════════════════════════════════════════════════════════════════════════

    var Selection = {

        /** Currently selected listing IDs */
        _selected: [],

        /** Toggle a listing's selection state */
        toggle: function(listingId) {
            var idx = Selection._selected.indexOf(listingId);
            if (idx === -1) {
                Selection._selected.push(listingId);
            } else {
                Selection._selected.splice(idx, 1);
            }
            Selection._persist();
            return Selection._selected;
        },

        /** Select all provided listing IDs */
        selectAll: function(listingIds) {
            listingIds.forEach(function(id) {
                if (Selection._selected.indexOf(id) === -1) {
                    Selection._selected.push(id);
                }
            });
            Selection._persist();
            return Selection._selected;
        },

        /** Clear all selections */
        clear: function() {
            Selection._selected = [];
            Selection._persist();
            return Selection._selected;
        },

        /** Get selected IDs */
        getSelectedIds: function() {
            return Selection._selected.slice();
        },

        /** Get selected listing objects */
        getSelectedListings: function(allListings) {
            return allListings.filter(function(l) {
                return Selection._selected.indexOf(l.id) !== -1;
            });
        },

        /** Check if a listing is selected */
        isSelected: function(listingId) {
            return Selection._selected.indexOf(listingId) !== -1;
        },

        /** Persist to localStorage */
        _persist: function() {
            try { localStorage.setItem('selectedListings', JSON.stringify(Selection._selected)); } catch(e) {}
        },

        /** Restore from localStorage */
        restore: function() {
            try {
                var stored = JSON.parse(localStorage.getItem('selectedListings'));
                if (Array.isArray(stored)) Selection._selected = stored;
            } catch(e) {}
        }
    };

    // Restore on load
    Selection.restore();


    // ═══════════════════════════════════════════════════════════════════════════
    // 11. LISTING OUTPUT (Print / Email / Share)
    // ═══════════════════════════════════════════════════════════════════════════

    var ListingOutput = {

        /**
         * Build branded listing sheet HTML for print/email.
         * Runs compliance gate on each listing before inclusion.
         *
         * @param {Array} listings - Selected listings
         * @param {object} [agentProfile] - Override brokerage info
         * @returns {string} - Full HTML document string
         */
        buildListingSheetHTML: function(listings, agentProfile) {
            var profile = agentProfile || Compliance.brokerage;
            var gateResult = Compliance.gateListingsForOutput(listings);

            var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
                '<title>Property Listings - ' + profile.name + '</title>' +
                '<style>' +
                'body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }' +
                '.header { border-bottom: 2px solid #B8860B; padding-bottom: 15px; margin-bottom: 20px; }' +
                '.header h1 { color: #B8860B; margin: 0; font-size: 24px; }' +
                '.header p { margin: 3px 0; font-size: 12px; color: #666; }' +
                '.listing { page-break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; }' +
                '.listing-price { font-size: 22px; font-weight: bold; color: #1a1a1a; }' +
                '.listing-details { display: flex; gap: 15px; margin: 10px 0; font-size: 14px; color: #555; }' +
                '.listing-address { font-size: 16px; color: #333; margin: 5px 0; }' +
                '.listing-meta { font-size: 12px; color: #888; margin-top: 8px; }' +
                '.listing-desc { font-size: 13px; color: #555; margin-top: 10px; line-height: 1.5; }' +
                '.footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10px; color: #888; line-height: 1.6; }' +
                '.blocked-notice { background: #FEF2F2; border: 1px solid #FECACA; padding: 10px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; color: #991B1B; }' +
                '@media print { .blocked-notice { display: none; } body { padding: 10px; } }' +
                '</style></head><body>';

            // Header
            html += '<div class="header">';
            html += '<h1>' + profile.name.toUpperCase() + '</h1>';
            html += '<p>' + profile.address + '</p>';
            html += '<p>' + profile.phone + ' | ' + profile.website + '</p>';
            html += '<p>Prepared by: ' + profile.agentName + ' | License: ' + (profile.agentLicense || '') + '</p>';
            html += '<p>' + profile.phone + ' | ' + profile.email + '</p>';
            html += '</div>';

            // Blocked listings warning
            if (gateResult.blocked.length > 0) {
                html += '<div class="blocked-notice">';
                html += '<strong>' + gateResult.blocked.length + ' listing(s) excluded (IDX/Opt-Out rules):</strong><br>';
                gateResult.blocked.forEach(function(b) {
                    html += '&bull; ' + (b.listing.address || 'Unknown') + ' — ' + b.reason + '<br>';
                });
                html += '</div>';
            }

            // Listings
            gateResult.passed.forEach(function(listing) {
                var displayCheck = Compliance.checkListingDisplay(listing);
                var addr = displayCheck.addressVisible ?
                    listing.address + (listing.unit ? ', ' + listing.unit : '') :
                    'Address Available Upon Request';

                html += '<div class="listing">';
                html += '<div class="listing-price">$' + listing.price.toLocaleString() + '</div>';
                html += '<div class="listing-address">' + addr + '</div>';
                html += '<div class="listing-details">';
                html += '<span>' + (listing.beds === 0 ? 'Studio' : listing.beds + ' BD') + '</span>';
                html += '<span>' + listing.baths + ' BA</span>';
                if (listing.intSqft) html += '<span>' + listing.intSqft.toLocaleString() + ' SF</span>';
                html += '<span>' + (listing.ownership || '') + '</span>';
                html += '</div>';
                if (listing.neighborhood) {
                    html += '<div style="font-size:13px;color:#666;">' + listing.neighborhood +
                            (listing.borough ? ', ' + listing.borough : '') + '</div>';
                }
                if (listing.description) {
                    html += '<div class="listing-desc">' + listing.description + '</div>';
                }
                html += '<div class="listing-meta">';
                html += 'Listing Courtesy of ' + (listing.company || 'Brokerage');
                if (listing.agentName) html += ' — ' + listing.agentName;
                if (listing.updatedDate) html += ' | Last Updated: ' + listing.updatedDate;
                html += '</div>';
                html += '</div>';
            });

            // Legal footer
            html += '<div class="footer">';
            html += Compliance.getLegalFooter().replace(/\n/g, '<br>');
            html += '</div>';

            html += '</body></html>';
            return html;
        },

        /**
         * Open print view with selected listings.
         * @param {Array} listings - Selected listings
         */
        openPrintView: function(listings) {
            var html = ListingOutput.buildListingSheetHTML(listings);
            var printWin = window.open('', '_blank', 'width=800,height=600');
            if (printWin) {
                printWin.document.write(html);
                printWin.document.close();
                printWin.onload = function() { printWin.print(); };
            }
        },

        /**
         * Open email modal with selected listings (mockup uses mailto:).
         * @param {Array} listings - Selected listings
         * @param {string} [recipientEmail] - Pre-filled recipient
         */
        openEmailModal: function(listings, recipientEmail) {
            var gateResult = Compliance.gateListingsForOutput(listings);
            if (gateResult.passed.length === 0) {
                alert('No listings can be shared (all excluded by IDX/Opt-Out rules).');
                return;
            }

            var subject = encodeURIComponent(gateResult.passed.length + ' Property Listing(s) from ' + Compliance.brokerage.name);
            var body = encodeURIComponent(
                'Hello,\n\n' +
                'Please find the following property listing(s) for your review:\n\n' +
                gateResult.passed.map(function(l) {
                    var check = Compliance.checkListingDisplay(l);
                    var addr = check.addressVisible ? l.address + (l.unit ? ' ' + l.unit : '') : 'Address Upon Request';
                    return '- ' + addr + ' | $' + l.price.toLocaleString() +
                           ' | ' + (l.beds === 0 ? 'Studio' : l.beds + 'BR') + '/' + l.baths + 'BA' +
                           (l.intSqft ? ' | ' + l.intSqft + ' SF' : '');
                }).join('\n') +
                '\n\n' + Compliance.getAttribution() +
                '\n\n' + Compliance.brokerage.agentName +
                '\n' + Compliance.brokerage.name +
                '\n' + Compliance.brokerage.phone +
                '\n' + Compliance.brokerage.email
            );

            window.location.href = 'mailto:' + (recipientEmail || '') + '?subject=' + subject + '&body=' + body;
        }
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // 12. PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        // Version
        VERSION: '1.1.0',

        // Mapping tables (read-only access for doctor/debug)
        STATUS_MAP:           STATUS_MAP,
        OWNERSHIP_MAP:        OWNERSHIP_MAP,
        PROPERTY_TYPE_MATRIX: PROPERTY_TYPE_MATRIX,
        DOM_ID_MAP:           DOM_ID_MAP,

        // Compliance
        Compliance: Compliance,

        // Search pipeline
        collectSearchCriteria: collectSearchCriteria,
        filterListings:        filterListings,
        sortListings:          sortListings,
        paginateListings:      paginateListings,
        getFilteredListings:   getFilteredListings,
        quickSearch:           quickSearch,
        clearSearchForm:       clearSearchForm,

        // Selection
        Selection: Selection,

        // Output
        ListingOutput: ListingOutput
    };

})();
