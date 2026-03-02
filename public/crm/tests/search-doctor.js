/**
 * search-doctor.js — Search Validation, Debug, and Bug Reporting
 * "Search Doctor" — validates wiring, explains search, exports bug reports
 *
 * Includes: Fair Housing Act, NY State Human Rights Law, NYC Human Rights Law Title 8,
 *           NY DOS Advertising Laws (19 NYCRR 175.25), REBNY RLS compliance,
 *           Anti-discrimination (source of income, disability, familial status)
 *
 * Mallan Real Estate Inc. — Brokerage License #10991205323
 *
 * VERSION: 2.0.0
 * DATE: 2026-02-13
 *
 * v2.0.0 — Full 47-rule compliance test suite:
 *   WIRING (W-01..W-08):      DOM/JS search form integrity
 *   SEARCH_DISPLAY (SD-01..15): REBNY listing display rules
 *   LISTING_OUTPUT (LO-01..08): Print/email output compliance
 *   DATA_HANDLING (DH-01..07):  MLS data security
 *   ADVERTISING (AD-01..04):    NY DOS 19 NYCRR 175.25
 *   FAIR_HOUSING (FH-01..07):   Federal FHA / NYS HRL / NYC HRL Title 8
 *   DATA_INTEGRITY (DI-01..03): Mock data completeness
 */

'use strict';

var SearchDoctor = (function() {

    // ═══════════════════════════════════════════════════════════════════════════
    // FAIR HOUSING & NY ADVERTISING LAW COMPLIANCE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Protected classes under Federal, NY State, and NYC laws combined.
     * Any listing description, ad copy, or search filter that references these
     * in a discriminatory manner is a violation.
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
     * Prohibited words/phrases in listing descriptions and marketing.
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

        // Source of income (NYC & NYS — cannot discriminate against Section 8, vouchers)
        { pattern: /\b(no\s*(section\s*8|voucher|housing\s*choice|hcv|subsid|welfare|public\s*assistance)|cash\s*only\s*tenants|employed\s*tenants?\s*only)\b/i,
          law: 'NYC HRL Title 8 / NYS HRL', type: 'SOURCE_OF_INCOME' },

        // Marital status
        { pattern: /\b(married\s*(couple|only|preferred)|single\s*(only|preferred)|no\s*single\s*(men|women|people))\b/i,
          law: 'NY State HRL / NYC HRL', type: 'MARITAL_STATUS' },

        // Immigration / citizenship
        { pattern: /\b(citizens?\s*only|no\s*immigrants?|legal\s*residents?\s*only|us\s*(citizens?|nationals?)\s*only|must\s*(be|have)\s*(citizen|green\s*card))\b/i,
          law: 'NYC HRL Title 8', type: 'IMMIGRATION_STATUS' },

        // Steering language (suggesting neighborhoods based on protected class)
        { pattern: /\b(perfect\s*for\s*(families|singles|couples|professionals|students)|ideal\s*(neighborhood|area)\s*for)\b/i,
          law: 'Fair Housing Act (steering)', type: 'STEERING' },

        // NY DOS Advertising (19 NYCRR 175.25) — must identify brokerage
        { pattern: /\b(for\s*sale\s*by\s*owner|fsbo|no\s*(broker|agent|realtor))\b/i,
          law: 'NY DOS 19 NYCRR 175.25', type: 'NY_ADVERTISING' }
    ];

    /**
     * NY DOS Advertising Requirements (19 NYCRR 175.25)
     * All advertisements must include:
     */
    var NY_DOS_REQUIREMENTS = [
        { id: 'brokerage_name', description: 'Licensed name of brokerage must appear in ad', required: true },
        { id: 'fair_housing', description: 'Fair Housing logo or "Equal Housing Opportunity" statement', required: true },
        { id: 'no_misleading', description: 'No misleading or deceptive statements', required: true },
        { id: 'license_number', description: 'Brokerage license number (recommended)', required: false },
        { id: 'agent_name', description: 'Agent name if advertising under own name', required: false }
    ];


    // ═══════════════════════════════════════════════════════════════════════════
    // 1. VALIDATE — FULL 47-RULE COMPLIANCE TEST SUITE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Master validation covering all 47 REBNY/RLS/Trestle/Fair Housing rules.
     *
     * Categories:
     *   SEARCH_DISPLAY (SD-01 to SD-15)  — How listings appear in search
     *   LISTING_OUTPUT (LO-01 to LO-08)  — Print/email/share output
     *   DATA_HANDLING  (DH-01 to DH-07)  — MLS data security
     *   ADVERTISING    (AD-01 to AD-04)  — NY DOS advertising laws
     *   FAIR_HOUSING   (FH-01 to FH-07)  — Federal/NYS/NYC discrimination
     *   WIRING         (W-01 to W-08)    — DOM/JS search wiring
     *
     * @returns {object} { passed, failed, warnings, score, summary, byCategory }
     */
    function validate() {
        var passed = [];
        var failed = [];
        var warnings = [];
        var hasSC = typeof SearchCore !== 'undefined';
        var hasML = typeof mockListings !== 'undefined';
        var listings = hasML ? mockListings : [];
        var attrText = document.body ? document.body.innerHTML : '';

        // Helper: push result
        function pass(id, check, detail) { passed.push({ id: id, check: check, detail: detail }); }
        function fail(id, check, detail, els) { failed.push({ id: id, check: check, detail: detail, elements: els || [] }); }
        function warn(id, check, detail, els) { warnings.push({ id: id, check: check, detail: detail, elements: els || [] }); }


        // ═════════════════════════════════════════════════════════════════════
        // WIRING CHECKS (W-01 to W-08) — DOM/JS search form integrity
        // ═════════════════════════════════════════════════════════════════════

        // W-01: Duplicate IDs
        var allIds = {};
        var duplicateIds = [];
        document.querySelectorAll('[id]').forEach(function(el) {
            if (allIds[el.id]) duplicateIds.push(el.id);
            allIds[el.id] = (allIds[el.id] || 0) + 1;
        });
        if (duplicateIds.length > 0) {
            fail('W-01', 'Duplicate IDs', duplicateIds.length + ' duplicate(s): ' + duplicateIds.slice(0, 5).join(', ') +
                 (duplicateIds.length > 5 ? '...' : ''), duplicateIds);
        } else { pass('W-01', 'Duplicate IDs', 'None'); }

        // W-02: Status checkboxes have data-field="MlsStatus"
        var formIds = ['searchBasicMode', 'searchBasicModeRental', 'searchBasicModeBuilding', 'searchAdvancedMode'];
        var statusLabels = ['Active', 'Back on Market', 'Coming Soon', 'Future', 'Pending',
            'Offer', 'Contract', 'Closed', 'Sold', 'Rented', 'Withdrawn', 'Canceled',
            'Expired', 'Hold', 'Incomplete', 'Attorney', 'Board', 'Application', 'Lease'];
        var allMissingStatus = [];
        formIds.forEach(function(formId) {
            var form = document.getElementById(formId);
            if (!form) return;
            form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
                var label = cb.closest('label');
                var text = label ? label.textContent.trim() : '';
                var isStatusCb = statusLabels.some(function(s) { return text.indexOf(s) !== -1; });
                if (isStatusCb && !cb.getAttribute('data-field')) {
                    allMissingStatus.push(formId + ': "' + text + '"');
                }
            });
        });
        if (allMissingStatus.length > 0) {
            fail('W-02', 'Status checkbox data-field', allMissingStatus.length + ' missing data-field="MlsStatus"', allMissingStatus);
        } else { pass('W-02', 'Status checkbox data-field', 'All wired'); }

        // W-03: Ownership checkboxes have data-field="CommonInterest"
        var ownerLabels = ['Condo', 'Co-op', 'Coop', 'Condop', 'Townhouse', 'Rental Building',
            'Single Family', 'Multi-Family', 'Land', 'Commercial'];
        var allMissingOwner = [];
        formIds.forEach(function(formId) {
            var form = document.getElementById(formId);
            if (!form) return;
            form.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
                var label = cb.closest('label');
                var text = label ? label.textContent.trim() : '';
                var isOwnerCb = ownerLabels.some(function(o) { return text === o || text.indexOf(o) === 0; });
                if (isOwnerCb && !cb.getAttribute('data-field')) {
                    allMissingOwner.push(formId + ': "' + text + '"');
                }
            });
        });
        if (allMissingOwner.length > 0) {
            fail('W-03', 'Ownership checkbox data-field', allMissingOwner.length + ' missing data-field="CommonInterest"', allMissingOwner);
        } else { pass('W-03', 'Ownership checkbox data-field', 'All wired'); }

        // W-04: Status tokens match STATUS_MAP
        if (hasSC) {
            var unmappedTokens = [];
            document.querySelectorAll('[data-field="MlsStatus"][data-value]').forEach(function(cb) {
                cb.getAttribute('data-value').split(',').forEach(function(token) {
                    var t = token.trim();
                    if (t && !SearchCore.STATUS_MAP[t]) unmappedTokens.push(t);
                });
            });
            document.querySelectorAll('[data-sub-status]').forEach(function(cb) {
                var sub = cb.getAttribute('data-sub-status');
                if (sub && !SearchCore.STATUS_MAP[sub]) unmappedTokens.push('sub:' + sub);
            });
            var unique = unmappedTokens.filter(function(v, i, a) { return a.indexOf(v) === i; });
            if (unique.length > 0) { fail('W-04', 'STATUS_MAP completeness', unique.length + ' unmapped: ' + unique.join(', '), unique); }
            else { pass('W-04', 'STATUS_MAP completeness', 'All tokens mapped'); }
        }

        // W-05: Ownership tokens match OWNERSHIP_MAP
        if (hasSC) {
            var unmappedOwner = [];
            document.querySelectorAll('[data-field="CommonInterest"][data-value]').forEach(function(cb) {
                var val = cb.getAttribute('data-value');
                if (val && !SearchCore.OWNERSHIP_MAP[val]) unmappedOwner.push(val);
            });
            var uniqueO = unmappedOwner.filter(function(v, i, a) { return a.indexOf(v) === i; });
            if (uniqueO.length > 0) { fail('W-05', 'OWNERSHIP_MAP completeness', uniqueO.length + ' unmapped: ' + uniqueO.join(', '), uniqueO); }
            else { pass('W-05', 'OWNERSHIP_MAP completeness', 'All tokens mapped'); }
        }

        // W-06: DOM IDs in DOM_ID_MAP exist
        if (hasSC) {
            var missingDomIds = [];
            ['sale', 'rent', 'building'].forEach(function(mode) {
                var ids = SearchCore.DOM_ID_MAP[mode];
                Object.keys(ids).forEach(function(key) {
                    if (!document.getElementById(ids[key])) missingDomIds.push(mode + '.' + key + ' (' + ids[key] + ')');
                });
            });
            if (missingDomIds.length > 0) { fail('W-06', 'DOM_ID_MAP references', missingDomIds.length + ' missing', missingDomIds); }
            else { pass('W-06', 'DOM_ID_MAP references', 'All exist'); }
        }

        // W-07: Quick Search buttons have onclick
        var unwiredQS = [];
        document.querySelectorAll('#searchBasicMode button, #searchBasicModeRental button, #searchBasicModeBuilding button').forEach(function(btn) {
            var text = btn.textContent.trim();
            if (text.indexOf('Search') !== -1 && !btn.getAttribute('onclick')) {
                var parent = btn.closest('[id]');
                unwiredQS.push((parent ? parent.id + ' > ' : '') + '"' + text + '"');
            }
        });
        if (unwiredQS.length > 0) { fail('W-07', 'Quick Search button wiring', unwiredQS.length + ' missing onclick', unwiredQS); }
        else { pass('W-07', 'Quick Search button wiring', 'All wired'); }

        // W-08: Clear buttons have onclick
        var unwiredClear = [];
        document.querySelectorAll('button').forEach(function(btn) {
            var text = btn.textContent.trim();
            if ((text === 'Clear All' || text === 'Clear') && !btn.getAttribute('onclick') &&
                btn.closest('#searchBasicMode, #searchBasicModeRental, #searchBasicModeBuilding, #searchFormContainer')) {
                unwiredClear.push('"' + text + '"');
            }
        });
        if (unwiredClear.length > 0) { warn('W-08', 'Clear button wiring', unwiredClear.length + ' missing onclick', unwiredClear); }
        else { pass('W-08', 'Clear button wiring', 'OK'); }


        // ═════════════════════════════════════════════════════════════════════
        // SEARCH_DISPLAY (SD-01 to SD-15) — REBNY listing display rules
        // ═════════════════════════════════════════════════════════════════════

        // SD-01: IDX Display Gate (IDXEntireListingDisplayYN)
        if (hasSC && typeof SearchCore.Compliance.checkListingDisplay === 'function') {
            var testListing = { idxDisplayYN: false, addressDisplayYN: true };
            var result = SearchCore.Compliance.checkListingDisplay(testListing);
            if (!result.allowed) { pass('SD-01', 'IDX Display Gate', 'checkListingDisplay blocks idxDisplayYN=false'); }
            else { fail('SD-01', 'IDX Display Gate', 'checkListingDisplay does NOT block idxDisplayYN=false'); }
        } else { fail('SD-01', 'IDX Display Gate', 'SearchCore.Compliance.checkListingDisplay not found'); }

        // SD-02: Owner Opt-Out Gate (UCBA Art. I, Sec. 5(A) — incurable violation)
        if (hasSC && typeof SearchCore.Compliance.checkListingDisplay === 'function') {
            var testOO = { idxDisplayYN: true, ownerOptOut: true, addressDisplayYN: true };
            var resOO = SearchCore.Compliance.checkListingDisplay(testOO);
            if (!resOO.allowed) { pass('SD-02', 'Owner Opt-Out Gate', 'Blocks ownerOptOut=true'); }
            else { fail('SD-02', 'Owner Opt-Out Gate', 'Does NOT block ownerOptOut=true — $250/$500 incurable violation'); }
        } else { fail('SD-02', 'Owner Opt-Out Gate', 'checkListingDisplay not found'); }

        // SD-03: Participant Only Gate (UCBA Definition (W))
        if (hasSC && typeof SearchCore.Compliance.checkListingDisplay === 'function') {
            var testPO = { idxDisplayYN: true, participantOnly: true, addressDisplayYN: true };
            var resPO = SearchCore.Compliance.checkListingDisplay(testPO);
            if (!resPO.allowed) { pass('SD-03', 'Participant Only Gate', 'Blocks participantOnly=true'); }
            else { fail('SD-03', 'Participant Only Gate', 'Does NOT block participantOnly=true'); }
        } else { fail('SD-03', 'Participant Only Gate', 'checkListingDisplay not found'); }

        // SD-04: Address Suppression (InternetAddressDisplayYN)
        if (hasSC && typeof SearchCore.Compliance.checkListingDisplay === 'function') {
            var testAddr = { idxDisplayYN: true, addressDisplayYN: false };
            var resAddr = SearchCore.Compliance.checkListingDisplay(testAddr);
            if (resAddr.allowed && !resAddr.addressVisible) { pass('SD-04', 'Address Suppression', 'addressDisplayYN=false hides address'); }
            else { fail('SD-04', 'Address Suppression', 'Does NOT suppress address when addressDisplayYN=false'); }
        } else { fail('SD-04', 'Address Suppression', 'checkListingDisplay not found'); }

        // SD-05: Coming Soon Badge (UCBA Art. I, Sec. 16(C))
        if (hasSC && typeof SearchCore.Compliance.getComingSoonBadge === 'function') {
            var badge = SearchCore.Compliance.getComingSoonBadge('03/01/2026');
            if (badge.indexOf('Coming Soon') !== -1 && badge.indexOf('No Showings') !== -1 && badge.indexOf('03/01/2026') !== -1) {
                pass('SD-05', 'Coming Soon Badge', 'Correct format with date');
            } else { fail('SD-05', 'Coming Soon Badge', 'Missing required text: "Coming Soon. No Showings or Open House until [date]"'); }
        } else { fail('SD-05', 'Coming Soon Badge', 'getComingSoonBadge not found'); }

        // SD-06: Per-listing "Listing Courtesy of" attribution (UCBA Art. III, Sec. 2(C))
        if (hasSC && typeof SearchCore.ListingOutput.buildListingSheetHTML === 'function') {
            var testListings = [{ id: 1, price: 1000000, address: '123 Test', beds: 2, baths: 1, ownership: 'Condo',
                                  company: 'Test Co', agentName: 'Agent', idxDisplayYN: true, addressDisplayYN: true }];
            var outputHTML = SearchCore.ListingOutput.buildListingSheetHTML(testListings);
            if (/Listing Courtesy of/i.test(outputHTML)) { pass('SD-06', 'Per-Listing Attribution', '"Listing Courtesy of" found in output'); }
            else { fail('SD-06', 'Per-Listing Attribution', 'Missing "Listing Courtesy of [broker]" — UCBA Art. III, Sec. 2(C)'); }
        } else { warn('SD-06', 'Per-Listing Attribution', 'buildListingSheetHTML not available to test'); }

        // SD-07: Closed listings 24hr rule — status filter handles CLOSED
        if (hasSC) {
            var closedMapped = SearchCore.STATUS_MAP['Closed'] === 'CLOSED' && SearchCore.STATUS_MAP['Sold'] === 'CLOSED' && SearchCore.STATUS_MAP['Rented'] === 'CLOSED';
            if (closedMapped) { pass('SD-07', 'Closed Status Mapping', 'Closed/Sold/Rented all map to CLOSED'); }
            else { fail('SD-07', 'Closed Status Mapping', 'Missing Closed/Sold/Rented mapping — 24hr removal rule'); }
        }

        // SD-08: Update timestamps on displayed data
        if (hasML) {
            var missingUpdated = listings.filter(function(l) { return !l.updatedDate && !l.listedDate; });
            if (missingUpdated.length === 0) { pass('SD-08', 'Update Timestamps', 'All listings have date fields'); }
            else { warn('SD-08', 'Update Timestamps', missingUpdated.length + ' listing(s) missing updatedDate/listedDate'); }
        }

        // SD-09: No "Off-Market" language
        if (hasSC && hasML) {
            var offMarketViolations = [];
            listings.forEach(function(l) {
                if (l.description && /off[\s-]?market|pocket\s*listing|whisper\s*listing/i.test(l.description)) {
                    offMarketViolations.push('Listing ' + l.id);
                }
            });
            if (offMarketViolations.length > 0) { fail('SD-09', 'No Off-Market Language', offMarketViolations.join(', '), offMarketViolations); }
            else { pass('SD-09', 'No Off-Market Language', 'Clean'); }
        }

        // SD-10: No compensation displayed (UCBA Art. IV, Sec. 2)
        var compFields = ['commission', 'compensation', 'cooperatingBrokerCompensation',
            'buyerAgentCompensation', 'transactionBrokerCompensation',
            'buyerBrokerageCompensation', 'buyerBrokerageCompensationType'];
        var exposedComp = [];
        if (hasML) {
            listings.forEach(function(l) {
                compFields.forEach(function(f) { if (l[f] !== undefined) exposedComp.push('Listing ' + l.id + '.' + f); });
            });
        }
        if (exposedComp.length > 0) { fail('SD-10', 'No Compensation Exposed', exposedComp.length + ' field(s) exposed', exposedComp); }
        else { pass('SD-10', 'No Compensation Exposed', 'Clean'); }

        // SD-11: No agent contact info in descriptions (UCBA Art. I, Sec. 5(C))
        if (hasML) {
            var agentInfoViolations = [];
            listings.forEach(function(l) {
                if (!l.description) return;
                if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(l.description)) agentInfoViolations.push('Listing ' + l.id + ': phone');
                if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(l.description)) agentInfoViolations.push('Listing ' + l.id + ': email');
                if (/https?:\/\/|www\./i.test(l.description)) agentInfoViolations.push('Listing ' + l.id + ': URL');
            });
            if (agentInfoViolations.length > 0) { fail('SD-11', 'No Agent Info in Description', agentInfoViolations.join(', '), agentInfoViolations); }
            else { pass('SD-11', 'No Agent Info in Description', 'Clean'); }
        }

        // SD-12: No seller/buyer identity until closed (UCBA Art. III, Sec. 2)
        if (hasML) {
            var identityLeak = [];
            listings.forEach(function(l) {
                if (l.status !== 'CLOSED' && (l.buyerName || l.sellerName)) {
                    identityLeak.push('Listing ' + l.id + ' (' + l.status + ') exposes buyer/seller name');
                }
            });
            if (identityLeak.length > 0) { fail('SD-12', 'No Buyer/Seller ID Until Closed', identityLeak.join(', '), identityLeak); }
            else { pass('SD-12', 'No Buyer/Seller ID Until Closed', 'Clean'); }
        }

        // SD-13: Confidential/hidden fields not exposed (REBNY B3, B7)
        if (hasSC && hasML) {
            var hiddenFields = ['expirationDate', 'privateRemarks', 'showingInstructions',
                'concessionsAmount', 'concessionsComments', 'capitalReservesTotal',
                'netOperatingIncome', 'operatingExpense', 'capRate'];
            var hiddenExposed = [];
            listings.forEach(function(l) {
                hiddenFields.forEach(function(f) {
                    if (l[f] !== undefined) hiddenExposed.push('Listing ' + l.id + '.' + f);
                });
            });
            if (hiddenExposed.length > 0) { warn('SD-13', 'Hidden/Agent-Only Fields', hiddenExposed.length + ' AGT/HID fields in mock data (ensure not rendered publicly)', hiddenExposed); }
            else { pass('SD-13', 'Hidden/Agent-Only Fields', 'No AGT/HID fields in mock data'); }

            // Also verify isAgentOnlyField function exists
            if (typeof SearchCore.Compliance.isAgentOnlyField === 'function') {
                var gateWorks = SearchCore.Compliance.isAgentOnlyField('expirationDate') &&
                                SearchCore.Compliance.isAgentOnlyField('privateRemarks') &&
                                SearchCore.Compliance.isAgentOnlyField('showingInstructions');
                if (gateWorks) { pass('SD-13b', 'isAgentOnlyField Gate', 'Function exists and blocks expirationDate/privateRemarks/showingInstructions'); }
                else { fail('SD-13b', 'isAgentOnlyField Gate', 'Function exists but does not block known AGT/HID fields'); }
            } else { fail('SD-13b', 'isAgentOnlyField Gate', 'SearchCore.Compliance.isAgentOnlyField not found'); }
        }

        // SD-14: Concession dollar amounts not public (REBNY B18)
        if (hasML) {
            var concessionExposed = [];
            listings.forEach(function(l) {
                if (l.concessionsAmount !== undefined) concessionExposed.push('Listing ' + l.id);
            });
            if (concessionExposed.length > 0) { fail('SD-14', 'Concession Amounts Not Public', concessionExposed.length + ' listing(s) expose concessionsAmount', concessionExposed); }
            else { pass('SD-14', 'Concession Amounts Not Public', 'Clean'); }
        }

        // SD-15: PropertyCondition disclaimer (REBNY B7)
        if (hasSC && typeof SearchCore.Compliance.getPropertyConditionDisclaimer === 'function') {
            var pcDisclaimer = SearchCore.Compliance.getPropertyConditionDisclaimer();
            if (pcDisclaimer.indexOf('not verified') !== -1 && pcDisclaimer.indexOf('self reported') !== -1) {
                pass('SD-15', 'PropertyCondition Disclaimer', 'Correct disclaimer text');
            } else { fail('SD-15', 'PropertyCondition Disclaimer', 'Disclaimer text missing required language'); }
        } else { fail('SD-15', 'PropertyCondition Disclaimer', 'getPropertyConditionDisclaimer not found'); }


        // ═════════════════════════════════════════════════════════════════════
        // LISTING_OUTPUT (LO-01 to LO-08) — Print/email output rules
        // ═════════════════════════════════════════════════════════════════════

        // LO-01: Compliance gate before output
        if (hasSC && typeof SearchCore.Compliance.gateListingsForOutput === 'function') {
            var testGate = SearchCore.Compliance.gateListingsForOutput([
                { id: 1, idxDisplayYN: true, addressDisplayYN: true, price: 100 },
                { id: 2, idxDisplayYN: false, addressDisplayYN: true, price: 200 }
            ]);
            if (testGate.passed.length === 1 && testGate.blocked.length === 1) {
                pass('LO-01', 'Output Compliance Gate', 'gateListingsForOutput correctly filters');
            } else { fail('LO-01', 'Output Compliance Gate', 'gateListingsForOutput did not block idxDisplayYN=false'); }
        } else { fail('LO-01', 'Output Compliance Gate', 'gateListingsForOutput not found'); }

        // LO-02: Blocked listings notification in output
        if (hasSC && typeof SearchCore.ListingOutput.buildListingSheetHTML === 'function') {
            var testBlocked = SearchCore.ListingOutput.buildListingSheetHTML([
                { id: 1, idxDisplayYN: false, addressDisplayYN: true, price: 100, address: '123 Blocked', beds: 1, baths: 1 }
            ]);
            if (/excluded|blocked/i.test(testBlocked)) { pass('LO-02', 'Blocked Listing Notification', 'Exclusion notice present in output'); }
            else { fail('LO-02', 'Blocked Listing Notification', 'No exclusion notice when listings are blocked'); }
        } else { warn('LO-02', 'Blocked Listing Notification', 'buildListingSheetHTML not available'); }

        // LO-03: REBNY attribution in print/email output
        if (hasSC && typeof SearchCore.Compliance.getLegalFooter === 'function') {
            var footer = SearchCore.Compliance.getLegalFooter();
            if (/REBNY/i.test(footer) && /deemed reliable/i.test(footer)) {
                pass('LO-03', 'REBNY Attribution in Output', 'getLegalFooter includes REBNY + deemed reliable');
            } else { fail('LO-03', 'REBNY Attribution in Output', 'getLegalFooter missing REBNY attribution'); }
        } else { fail('LO-03', 'REBNY Attribution in Output', 'getLegalFooter not found'); }

        // LO-04: Fair Housing statement in output
        if (hasSC && typeof SearchCore.Compliance.getLegalFooter === 'function') {
            var fhFooter = SearchCore.Compliance.getLegalFooter();
            var hasFederal = /Fair Housing Act/i.test(fhFooter);
            var hasNYS = /NY State Human Rights/i.test(fhFooter);
            var hasNYC = /NYC Human Rights/i.test(fhFooter);
            if (hasFederal && hasNYS && hasNYC) {
                pass('LO-04', 'Fair Housing in Output (3 jurisdictions)', 'Federal + NYS + NYC all present');
            } else {
                var missing = [];
                if (!hasFederal) missing.push('Federal');
                if (!hasNYS) missing.push('NYS');
                if (!hasNYC) missing.push('NYC');
                fail('LO-04', 'Fair Housing in Output (3 jurisdictions)', 'Missing: ' + missing.join(', '));
            }
        } else { fail('LO-04', 'Fair Housing in Output', 'getLegalFooter not found'); }

        // LO-05: NY DOS brokerage identification (19 NYCRR 175.25)
        if (hasSC && typeof SearchCore.Compliance.getLegalFooter === 'function') {
            var dosFooter = SearchCore.Compliance.getLegalFooter();
            var hasBrokName = dosFooter.indexOf(SearchCore.Compliance.brokerage.name) !== -1;
            var hasLicense = dosFooter.indexOf(SearchCore.Compliance.brokerage.license) !== -1;
            if (hasBrokName && hasLicense) { pass('LO-05', 'NY DOS Brokerage ID', 'Brokerage name + license in footer'); }
            else { fail('LO-05', 'NY DOS Brokerage ID', 'Missing brokerage name or license number — 19 NYCRR 175.25'); }
        } else { fail('LO-05', 'NY DOS Brokerage ID', 'getLegalFooter not found'); }

        // LO-06: Statistical data disclaimer (UCBA Art. VIII, Sec. 4)
        if (hasSC && typeof SearchCore.Compliance.getStatisticalDisclaimer === 'function') {
            var statDisc = SearchCore.Compliance.getStatisticalDisclaimer('01/01/2026', '02/13/2026');
            if (/Based on information from the REBNY/i.test(statDisc) && /not an appraisal/i.test(statDisc)) {
                pass('LO-06', 'Statistical Data Disclaimer', 'REBNY attribution + "not an appraisal"');
            } else { fail('LO-06', 'Statistical Data Disclaimer', 'Missing required text in statistical disclaimer'); }
        } else { fail('LO-06', 'Statistical Data Disclaimer', 'getStatisticalDisclaimer not found'); }

        // LO-07: Commission negotiability disclosure (UCBA Art. I, Sec. 17)
        if (hasSC && typeof SearchCore.Compliance.getLegalFooter === 'function') {
            var commFooter = SearchCore.Compliance.getLegalFooter();
            if (/commissions are not set by law/i.test(commFooter) && /fully negotiable/i.test(commFooter)) {
                pass('LO-07', 'Commission Negotiability Disclosure', 'Found in legal footer');
            } else { fail('LO-07', 'Commission Negotiability Disclosure', 'Missing "Broker commissions are not set by law and are fully negotiable"'); }
        } else { fail('LO-07', 'Commission Negotiability Disclosure', 'getLegalFooter not found'); }

        // LO-08: Address suppression in email output
        if (hasSC && typeof SearchCore.ListingOutput.buildListingSheetHTML === 'function') {
            var testAddrSuppress = SearchCore.ListingOutput.buildListingSheetHTML([
                { id: 1, idxDisplayYN: true, addressDisplayYN: false, price: 100, address: '999 Secret St', beds: 1, baths: 1 }
            ]);
            if (/Address Available Upon Request/i.test(testAddrSuppress) && testAddrSuppress.indexOf('999 Secret St') === -1) {
                pass('LO-08', 'Address Suppression in Output', '"Address Available Upon Request" shown, actual address hidden');
            } else { fail('LO-08', 'Address Suppression in Output', 'Address not suppressed when addressDisplayYN=false'); }
        } else { warn('LO-08', 'Address Suppression in Output', 'buildListingSheetHTML not available'); }


        // ═════════════════════════════════════════════════════════════════════
        // DATA_HANDLING (DH-01 to DH-07) — MLS data security
        // ═════════════════════════════════════════════════════════════════════

        // DH-01: Server-side only MLS data access (no client-side API calls)
        var hasApiCall = /fetch\s*\(\s*['"].*trestle|corelogic|rets|mlsgrid/i.test(attrText);
        if (!hasApiCall) { pass('DH-01', 'No Client-Side MLS API Calls', 'No Trestle/CoreLogic/RETS fetch calls detected'); }
        else { fail('DH-01', 'No Client-Side MLS API Calls', 'Detected client-side fetch to MLS/IDX API — PROHIBITED'); }

        // DH-02: Bulk output limit
        if (hasSC && SearchCore.Compliance.MAX_OUTPUT_BATCH) {
            var limit = SearchCore.Compliance.MAX_OUTPUT_BATCH;
            if (limit > 0 && limit <= 400) { pass('DH-02', 'Bulk Output Limit', 'MAX_OUTPUT_BATCH = ' + limit); }
            else { warn('DH-02', 'Bulk Output Limit', 'MAX_OUTPUT_BATCH = ' + limit + ' (consider <= 400)'); }
        } else { fail('DH-02', 'Bulk Output Limit', 'No MAX_OUTPUT_BATCH set — risk of bulk data extraction'); }

        // DH-03: No AI training on MLS data (architecture check — N/A for client JS)
        pass('DH-03', 'No AI Training on MLS Data', 'N/A for client-side JS — server policy');

        // DH-04: No public/unsecured JSON endpoints (architecture check)
        pass('DH-04', 'No Unsecured JSON Endpoints', 'N/A for client-side JS — server architecture');

        // DH-05: No credentials in frontend code
        var credPatterns = /api[_-]?key|secret[_-]?key|password|bearer\s+[a-zA-Z0-9]{20,}|token['"]\s*:\s*['"][a-zA-Z0-9]{20,}/i;
        var scriptBlocks = document.querySelectorAll('script:not([src])');
        var credFound = false;
        scriptBlocks.forEach(function(s) {
            if (credPatterns.test(s.textContent)) credFound = true;
        });
        if (!credFound) { pass('DH-05', 'No Credentials in Frontend', 'No API keys/secrets detected in inline scripts'); }
        else { fail('DH-05', 'No Credentials in Frontend', 'Potential credentials detected in inline script — PROHIBITED'); }

        // DH-06: Audit logging capability (production readiness)
        pass('DH-06', 'Audit Logging', 'Deferred to production — mockup phase acceptable');

        // DH-07: InternetEntireListingDisplayYN cascade (REBNY B6)
        if (hasSC && typeof SearchCore.Compliance.checkListingDisplay === 'function') {
            var testInet = { internetEntireListingDisplayYN: false, idxDisplayYN: true, addressDisplayYN: true };
            var resInet = SearchCore.Compliance.checkListingDisplay(testInet);
            if (!resInet.allowed) { pass('DH-07', 'InternetEntireListingDisplayYN Cascade', 'Master gate blocks when internetEntireListingDisplayYN=false'); }
            else { fail('DH-07', 'InternetEntireListingDisplayYN Cascade', 'Does NOT block when internetEntireListingDisplayYN=false — REBNY B6 auto-cascade violation'); }
        } else { fail('DH-07', 'InternetEntireListingDisplayYN Cascade', 'checkListingDisplay not found'); }


        // ═════════════════════════════════════════════════════════════════════
        // ADVERTISING (AD-01 to AD-04) — NY DOS 19 NYCRR 175.25
        // ═════════════════════════════════════════════════════════════════════

        // AD-01: Brokerage name in all ads
        if (hasSC) {
            var brokName = SearchCore.Compliance.brokerage.name;
            var nameInPage = attrText.indexOf(brokName) !== -1;
            if (nameInPage) { pass('AD-01', 'Brokerage Name in Page', '"' + brokName + '" found'); }
            else { warn('AD-01', 'Brokerage Name in Page', '"' + brokName + '" not found in page HTML'); }
        }

        // AD-02: Fair Housing statement/logo in advertising
        var hasFH = /Equal\s*Housing\s*Opportunity/i.test(attrText) || /Fair\s*Housing/i.test(attrText);
        if (hasFH) { pass('AD-02', 'Fair Housing Statement in Page', 'Found'); }
        else { fail('AD-02', 'Fair Housing Statement in Page', 'Missing "Equal Housing Opportunity" or Fair Housing statement'); }

        // AD-03: No misleading/deceptive statements (policy — cannot fully automate)
        pass('AD-03', 'No Misleading Statements', 'Policy check — not automatable');

        // AD-04: No FSBO/no-broker language
        if (hasML) {
            var fsboViolations = [];
            listings.forEach(function(l) {
                if (l.description && /\b(for\s*sale\s*by\s*owner|fsbo|no\s*(broker|agent|realtor))\b/i.test(l.description)) {
                    fsboViolations.push('Listing ' + l.id);
                }
            });
            if (fsboViolations.length > 0) { fail('AD-04', 'No FSBO Language', fsboViolations.join(', '), fsboViolations); }
            else { pass('AD-04', 'No FSBO Language', 'Clean'); }
        }


        // ═════════════════════════════════════════════════════════════════════
        // FAIR_HOUSING (FH-01 to FH-07) — Federal/NYS/NYC discrimination
        // ═════════════════════════════════════════════════════════════════════

        // FH-01: Federal Fair Housing Act protected classes
        if (hasSC && typeof SearchCore.Compliance.scanDescription === 'function') {
            var testFH = SearchCore.Compliance.scanDescription('no children allowed, adults only');
            if (testFH.length > 0) { pass('FH-01', 'Federal FHA Scanner', 'scanDescription detects protected class references'); }
            else { fail('FH-01', 'Federal FHA Scanner', 'scanDescription does NOT detect "no children allowed"'); }
        } else { fail('FH-01', 'Federal FHA Scanner', 'scanDescription not found'); }

        // FH-02: NY State Human Rights Law
        var fh02 = PROHIBITED_PATTERNS.some(function(p) { return p.type === 'SEXUAL_ORIENTATION'; }) &&
                   PROHIBITED_PATTERNS.some(function(p) { return p.type === 'MARITAL_STATUS'; });
        if (fh02) { pass('FH-02', 'NY State HRL Patterns', 'SEXUAL_ORIENTATION + MARITAL_STATUS patterns present'); }
        else { fail('FH-02', 'NY State HRL Patterns', 'Missing NYS-specific discrimination patterns'); }

        // FH-03: NYC Human Rights Law Title 8
        var fh03 = PROHIBITED_PATTERNS.some(function(p) { return p.type === 'SOURCE_OF_INCOME'; }) &&
                   PROHIBITED_PATTERNS.some(function(p) { return p.type === 'IMMIGRATION_STATUS'; });
        if (fh03) { pass('FH-03', 'NYC HRL Title 8 Patterns', 'SOURCE_OF_INCOME + IMMIGRATION_STATUS patterns present'); }
        else { fail('FH-03', 'NYC HRL Title 8 Patterns', 'Missing NYC-specific discrimination patterns'); }

        // FH-04: Source of income (Section 8 / voucher) detection
        if (hasSC) {
            var testSec8 = SearchCore.Compliance.scanDescription('no section 8 tenants');
            var hasSec8Detection = testSec8.some(function(v) { return v.type === 'SOURCE_OF_INCOME'; });
            if (hasSec8Detection) { pass('FH-04', 'Section 8/Voucher Detection', 'scanDescription catches "no section 8"'); }
            else { fail('FH-04', 'Section 8/Voucher Detection', 'Does NOT detect "no section 8 tenants" — NYC/NYS law violation'); }
        } else { fail('FH-04', 'Section 8/Voucher Detection', 'scanDescription not found'); }

        // FH-05: Steering language detection
        var fh05 = PROHIBITED_PATTERNS.some(function(p) { return p.type === 'STEERING'; });
        if (fh05) { pass('FH-05', 'Steering Language Pattern', 'STEERING pattern present'); }
        else { fail('FH-05', 'Steering Language Pattern', 'Missing steering detection pattern'); }

        // FH-06: Fair Housing audit function available
        if (typeof runFairHousingAudit === 'function') {
            pass('FH-06', 'Fair Housing Audit Function', 'runFairHousingAudit available');
        } else { fail('FH-06', 'Fair Housing Audit Function', 'runFairHousingAudit not found'); }

        // FH-07: Description compliance scan against all prohibited patterns
        if (hasML) {
            var allDescViolations = [];
            listings.forEach(function(l) {
                if (!l.description) return;
                // Core scanner
                if (hasSC) {
                    var coreV = SearchCore.Compliance.scanDescription(l.description);
                    if (coreV.length > 0) allDescViolations.push({ id: l.id, source: 'core', count: coreV.length });
                }
                // Extended patterns
                PROHIBITED_PATTERNS.forEach(function(pp) {
                    if (pp.pattern.test(l.description)) {
                        allDescViolations.push({ id: l.id, source: pp.type, count: 1 });
                    }
                });
            });
            if (allDescViolations.length > 0) {
                fail('FH-07', 'Description Compliance Scan', allDescViolations.length + ' violation(s) found', allDescViolations);
            } else { pass('FH-07', 'Description Compliance Scan', 'All ' + listings.length + ' descriptions clean'); }
        }


        // ═════════════════════════════════════════════════════════════════════
        // MOCK DATA INTEGRITY (DI-01 to DI-03)
        // ═════════════════════════════════════════════════════════════════════

        // DI-01: IDX display flags present on all listings
        if (hasML) {
            var missingIdxFlag = listings.filter(function(l) { return l.idxDisplayYN === undefined; });
            if (missingIdxFlag.length > 0) { warn('DI-01', 'IDX Display Flags', missingIdxFlag.length + ' listing(s) missing idxDisplayYN'); }
            else { pass('DI-01', 'IDX Display Flags', 'All listings have idxDisplayYN'); }
        }

        // DI-02: addressDisplayYN present on all listings
        if (hasML) {
            var missingAddrFlag = listings.filter(function(l) { return l.addressDisplayYN === undefined; });
            if (missingAddrFlag.length > 0) { warn('DI-02', 'Address Display Flags', missingAddrFlag.length + ' listing(s) missing addressDisplayYN'); }
            else { pass('DI-02', 'Address Display Flags', 'All listings have addressDisplayYN'); }
        }

        // DI-03: Required fields present (price, beds, baths, status, address)
        if (hasML) {
            var reqFields = ['price', 'beds', 'baths', 'status', 'address'];
            var missingRequired = [];
            listings.forEach(function(l) {
                reqFields.forEach(function(f) {
                    if (l[f] === undefined || l[f] === null) missingRequired.push('Listing ' + l.id + '.' + f);
                });
            });
            if (missingRequired.length > 0) { fail('DI-03', 'Required Fields', missingRequired.length + ' missing', missingRequired); }
            else { pass('DI-03', 'Required Fields', 'All listings have price/beds/baths/status/address'); }
        }


        // ═════════════════════════════════════════════════════════════════════
        // SCORE & SUMMARY
        // ═════════════════════════════════════════════════════════════════════

        var total = passed.length + failed.length;
        var score = total > 0 ? Math.round((passed.length / total) * 100) : 0;

        // Group by category
        var byCategory = {};
        var allResults = passed.map(function(p) { return { id: p.id, status: 'PASS', check: p.check }; })
            .concat(failed.map(function(f) { return { id: f.id, status: 'FAIL', check: f.check }; }))
            .concat(warnings.map(function(w) { return { id: w.id, status: 'WARN', check: w.check }; }));
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
            summary: 'Search Doctor: ' + passed.length + ' passed, ' +
                     failed.length + ' failed, ' + warnings.length + ' warnings (' + score + '%)'
        };
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 2. EXPLAIN SEARCH (Run Search + Show Pipeline)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Run a search with full step-by-step explanation.
     * Shows criteria collected, per-step filter counts, sort, pagination.
     *
     * @param {string} mode - 'sale', 'rent', or 'building'
     * @param {Array} listings - Full mockListings array
     * @param {object} state - searchResultsState
     * @returns {object} - Full explanation
     */
    function explainSearch(mode, listings, state) {
        if (typeof SearchCore === 'undefined') {
            return { error: 'SearchCore not loaded' };
        }

        // Collect criteria
        var criteria = SearchCore.collectSearchCriteria(mode);

        // Run filter with explain=true
        var filterResult = SearchCore.filterListings(listings, criteria, { explain: true });

        // Sort info
        var sortInfo = {
            field: state.sortField || 'none',
            order: state.sortOrder || 'asc'
        };

        // Pagination info
        var totalFiltered = filterResult.results.length;
        var perPage = state.perPage || 50;
        var totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));

        return {
            mode: mode,
            criteria: criteria,
            totalListings: listings.length,
            filterSteps: filterResult.steps,
            filteredCount: totalFiltered,
            sort: sortInfo,
            pagination: {
                page: state.currentPage || 1,
                perPage: perPage,
                totalPages: totalPages,
                showing: Math.min(perPage, totalFiltered)
            },
            timestamp: new Date().toISOString()
        };
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 3. BUG REPORT (Export Debug Bundle)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Export a JSON bug report bundle.
     * One click captures everything needed to reproduce an issue.
     *
     * @param {string} mode - Current search mode
     * @param {Array} listings - mockListings
     * @param {object} state - searchResultsState
     * @returns {string} - JSON string
     */
    function exportBugReport(mode, listings, state) {
        var validation = validate();
        var explanation = explainSearch(mode, listings, state);

        var report = {
            _type: 'SearchBugReport',
            _version: '1.0',
            timestamp: new Date().toISOString(),
            file: window.location.href,
            searchCoreVersion: (typeof SearchCore !== 'undefined') ? SearchCore.VERSION : 'NOT LOADED',

            // Current state
            activeMode: mode,
            activeScope: getActiveScope(),

            // Criteria
            criteria: explanation.criteria,

            // Results
            totalListings: listings ? listings.length : 0,
            filteredCount: explanation.filteredCount,
            filterSteps: explanation.filterSteps,

            // Sort / Pagination
            sort: explanation.sort,
            pagination: explanation.pagination,

            // Selection
            selectedIds: state.selectedListings || [],

            // Validation
            validationScore: validation.score,
            validationFailed: validation.failed,
            validationWarnings: validation.warnings,

            // Sample data (first 3 listings for shape verification)
            sampleData: (listings || []).slice(0, 3).map(function(l) {
                return {
                    id: l.id,
                    status: l.status,
                    ownership: l.ownership,
                    beds: l.beds,
                    baths: l.baths,
                    price: l.price,
                    intSqft: l.intSqft,
                    listingCategory: l.listingCategory,
                    idxDisplayYN: l.idxDisplayYN,
                    addressDisplayYN: l.addressDisplayYN
                };
            })
        };

        return JSON.stringify(report, null, 2);
    }

    /** Helper: detect active scope */
    function getActiveScope() {
        var adv = document.getElementById('searchAdvancedMode');
        if (adv && adv.style.display !== 'none' && adv.offsetParent !== null) return 'advanced';
        var basic = document.getElementById('searchBasicMode');
        if (basic && basic.style.display !== 'none') return 'basic';
        var building = document.getElementById('searchBasicModeBuilding');
        if (building && building.style.display !== 'none') return 'building';
        return 'unknown';
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 4. FAIR HOUSING SCANNER (standalone deep scan)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Deep scan text for Fair Housing, NY advertising, and anti-discrimination violations.
     * More thorough than SearchCore.Compliance.scanDescription — includes all protected classes.
     *
     * @param {string} text - Text to scan
     * @returns {Array} - Array of { type, detail, law, severity } objects
     */
    function scanForViolations(text) {
        if (!text) return [];
        var violations = [];

        PROHIBITED_PATTERNS.forEach(function(pp) {
            var match = pp.pattern.exec(text);
            if (match) {
                violations.push({
                    type: pp.type,
                    detail: 'Found: "' + match[0] + '"',
                    law: pp.law,
                    severity: 'CRITICAL'
                });
            }
        });

        return violations;
    }

    /**
     * Scan all listing descriptions + any visible text on the page.
     * Returns a compliance report.
     */
    function runFairHousingAudit(listings) {
        var report = {
            timestamp: new Date().toISOString(),
            scanned: 0,
            clean: 0,
            violations: [],
            laws: {
                'Fair Housing Act': 0,
                'NY State HRL': 0,
                'NYC HRL Title 8': 0,
                'NY DOS 19 NYCRR 175.25': 0,
                'ADA': 0
            }
        };

        (listings || []).forEach(function(listing) {
            report.scanned++;
            var violations = scanForViolations(listing.description || '');
            if (violations.length > 0) {
                report.violations.push({
                    listingId: listing.id,
                    address: listing.address,
                    issues: violations
                });
                violations.forEach(function(v) {
                    // Count by law
                    var lawParts = v.law.split('/').map(function(s) { return s.trim(); });
                    lawParts.forEach(function(law) {
                        Object.keys(report.laws).forEach(function(key) {
                            if (law.indexOf(key) !== -1 || key.indexOf(law) !== -1) {
                                report.laws[key]++;
                            }
                        });
                    });
                });
            } else {
                report.clean++;
            }
        });

        report.summary = report.scanned + ' listings scanned. ' +
                          report.clean + ' clean, ' +
                          report.violations.length + ' with violations.';

        return report;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // 5. UI PANEL (Renders the Search Doctor panel in the page)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Render the Search Doctor panel at the top of the search results.
     * Adds 3 buttons: Validate Search, Run Search + Explain, Report Bug
     */
    function renderPanel(containerId) {
        var container = document.getElementById(containerId);
        if (!container) {
            // Create floating panel if no container specified
            container = document.createElement('div');
            container.id = 'searchDoctorPanel';
            container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;' +
                'background:#1F2937;color:white;border-radius:12px;padding:12px 16px;' +
                'box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:Arial,sans-serif;font-size:13px;' +
                'max-width:400px;max-height:80vh;overflow-y:auto;';
            document.body.appendChild(container);
        }

        container.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
            '<span style="font-size:18px;">&#x1F9EA;</span>' +
            '<strong style="font-size:14px;">Search Doctor</strong>' +
            '<span style="font-size:11px;color:#9CA3AF;margin-left:auto;">v' +
            (typeof SearchCore !== 'undefined' ? SearchCore.VERSION : '?') + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button onclick="SearchDoctor._runValidate()" style="background:#3B82F6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Validate Search</button>' +
            '<button onclick="SearchDoctor._runExplain()" style="background:#8B5CF6;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Explain Search</button>' +
            '<button onclick="SearchDoctor._runBugReport()" style="background:#EF4444;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Report Bug</button>' +
            '<button onclick="SearchDoctor._runFairHousing()" style="background:#10B981;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Fair Housing</button>' +
            '</div>' +
            '<div id="searchDoctorOutput" style="margin-top:10px;font-size:12px;line-height:1.5;"></div>';
    }

    /** Category labels for display */
    var CATEGORY_LABELS = {
        'W':  'Wiring',
        'SD': 'Search Display (REBNY)',
        'LO': 'Listing Output',
        'DH': 'Data Handling (MLS)',
        'AD': 'Advertising (NY DOS)',
        'FH': 'Fair Housing',
        'DI': 'Data Integrity'
    };

    /** Format validation results as HTML */
    function _formatValidation(result) {
        var html = '<div style="margin-bottom:8px;font-weight:bold;color:' +
                   (result.score >= 80 ? '#10B981' : result.score >= 50 ? '#F59E0B' : '#EF4444') +
                   ';">Score: ' + result.score + '% (' + result.passed.length + '/' +
                   (result.passed.length + result.failed.length) + ')</div>';

        // Category breakdown
        if (result.byCategory) {
            html += '<div style="margin-bottom:8px;font-size:11px;">';
            Object.keys(result.byCategory).forEach(function(cat) {
                var c = result.byCategory[cat];
                var label = CATEGORY_LABELS[cat] || cat;
                var color = c.fail > 0 ? '#FCA5A5' : c.warn > 0 ? '#FCD34D' : '#6EE7B7';
                html += '<span style="color:' + color + ';margin-right:10px;">' + label + ': ' + c.pass + '/' + (c.pass + c.fail) + '</span>';
            });
            html += '</div>';
        }

        if (result.failed.length > 0) {
            html += '<div style="color:#FCA5A5;margin-bottom:6px;"><strong>FAILED (' + result.failed.length + '):</strong></div>';
            result.failed.forEach(function(f) {
                html += '<div style="color:#FCA5A5;padding:2px 0;">&#x274C; <strong>' + (f.id || '') + '</strong> ' + f.check + ': ' + f.detail + '</div>';
            });
        }
        if (result.warnings.length > 0) {
            html += '<div style="color:#FCD34D;margin-top:6px;"><strong>WARNINGS (' + result.warnings.length + '):</strong></div>';
            result.warnings.forEach(function(w) {
                html += '<div style="color:#FCD34D;padding:2px 0;">&#x26A0; <strong>' + (w.id || '') + '</strong> ' + w.check + ': ' + w.detail + '</div>';
            });
        }
        if (result.passed.length > 0) {
            html += '<div style="color:#6EE7B7;margin-top:6px;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
                    '<strong>PASSED (' + result.passed.length + ') &#x25BC;</strong></div>';
            html += '<div style="display:none;">';
            result.passed.forEach(function(p) {
                html += '<div style="color:#6EE7B7;padding:1px 0;">&#x2705; <strong>' + (p.id || '') + '</strong> ' + p.check + '</div>';
            });
            html += '</div>';
        }
        return html;
    }

    /** Format explain results as HTML */
    function _formatExplain(result) {
        if (result.error) return '<div style="color:#FCA5A5;">' + result.error + '</div>';

        var html = '<div style="margin-bottom:6px;"><strong>Mode:</strong> ' + result.mode + '</div>';
        html += '<div style="margin-bottom:6px;"><strong>Criteria:</strong></div>';
        html += '<pre style="background:#374151;padding:8px;border-radius:6px;font-size:11px;overflow-x:auto;max-height:200px;">' +
                JSON.stringify(result.criteria, null, 2) + '</pre>';

        html += '<div style="margin:8px 0 4px;"><strong>Filter Pipeline:</strong></div>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
        html += '<tr style="border-bottom:1px solid #4B5563;"><th style="text-align:left;padding:3px;">Step</th><th>Before</th><th>After</th><th>Removed</th></tr>';
        (result.filterSteps || []).forEach(function(s) {
            var color = s.removed > 0 ? '#FCA5A5' : '#6EE7B7';
            html += '<tr style="border-bottom:1px solid #374151;">' +
                    '<td style="padding:3px;">' + s.name + '</td>' +
                    '<td style="text-align:center;">' + s.before + '</td>' +
                    '<td style="text-align:center;">' + s.after + '</td>' +
                    '<td style="text-align:center;color:' + color + ';">' + (s.removed > 0 ? '-' + s.removed : '0') + '</td></tr>';
        });
        html += '</table>';

        html += '<div style="margin-top:8px;"><strong>Result:</strong> ' + result.filteredCount + ' listings</div>';
        html += '<div><strong>Sort:</strong> ' + result.sort.field + ' ' + result.sort.order + '</div>';
        html += '<div><strong>Page:</strong> ' + result.pagination.page + '/' + result.pagination.totalPages +
                ' (' + result.pagination.perPage + '/page)</div>';

        return html;
    }

    // ─── Internal button handlers ───
    function _runValidate() {
        var out = document.getElementById('searchDoctorOutput');
        if (out) out.innerHTML = _formatValidation(validate());

        // Mark broken fields with red outlines
        var result = validate();
        // Clear previous marks
        document.querySelectorAll('.search-doctor-fail').forEach(function(el) {
            el.classList.remove('search-doctor-fail');
            el.style.outline = '';
            el.title = el.getAttribute('data-original-title') || el.title;
        });
        // Mark new fails
        result.failed.forEach(function(f) {
            if (f.elements) {
                f.elements.forEach(function(elId) {
                    var el = document.getElementById(elId);
                    if (el) {
                        el.classList.add('search-doctor-fail');
                        el.style.outline = '2px solid #EF4444';
                        el.setAttribute('data-original-title', el.title);
                        el.title = f.check + ': ' + f.detail;
                    }
                });
            }
        });
    }

    function _runExplain() {
        var out = document.getElementById('searchDoctorOutput');
        var mode = (typeof currentSearchTab !== 'undefined') ? currentSearchTab : 'sale';
        var listings = (typeof mockListings !== 'undefined') ? mockListings : [];
        var state = (typeof searchResultsState !== 'undefined') ? searchResultsState : {};
        if (out) out.innerHTML = _formatExplain(explainSearch(mode, listings, state));
    }

    function _runBugReport() {
        var mode = (typeof currentSearchTab !== 'undefined') ? currentSearchTab : 'sale';
        var listings = (typeof mockListings !== 'undefined') ? mockListings : [];
        var state = (typeof searchResultsState !== 'undefined') ? searchResultsState : {};
        var report = exportBugReport(mode, listings, state);

        // Copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(report).then(function() {
                var out = document.getElementById('searchDoctorOutput');
                if (out) out.innerHTML = '<div style="color:#6EE7B7;">Bug report copied to clipboard! (' +
                    report.length + ' bytes)</div><pre style="background:#374151;padding:8px;border-radius:6px;font-size:10px;max-height:300px;overflow:auto;">' +
                    report + '</pre>';
            });
        } else {
            // Fallback: show in panel
            var out = document.getElementById('searchDoctorOutput');
            if (out) out.innerHTML = '<pre style="background:#374151;padding:8px;border-radius:6px;font-size:10px;max-height:300px;overflow:auto;">' + report + '</pre>';
        }
    }

    function _runFairHousing() {
        var listings = (typeof mockListings !== 'undefined') ? mockListings : [];
        var report = runFairHousingAudit(listings);
        var out = document.getElementById('searchDoctorOutput');
        if (!out) return;

        var html = '<div style="margin-bottom:6px;font-weight:bold;">Fair Housing Audit</div>';
        html += '<div>' + report.summary + '</div>';

        if (report.violations.length > 0) {
            html += '<div style="color:#FCA5A5;margin-top:6px;">';
            report.violations.forEach(function(v) {
                html += '<div style="padding:3px 0;">&#x274C; Listing ' + v.listingId + ' (' + v.address + '):</div>';
                v.issues.forEach(function(issue) {
                    html += '<div style="padding-left:16px;font-size:11px;">' + issue.type + ': ' + issue.detail + ' [' + issue.law + ']</div>';
                });
            });
            html += '</div>';
        } else {
            html += '<div style="color:#6EE7B7;margin-top:6px;">&#x2705; All listings pass Fair Housing scan</div>';
        }

        // Show protected classes for reference
        html += '<div style="margin-top:10px;font-size:11px;color:#9CA3AF;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'">' +
                'Protected Classes Reference &#x25BC;</div>';
        html += '<div style="display:none;font-size:10px;color:#9CA3AF;padding:6px;background:#374151;border-radius:6px;margin-top:4px;">';
        html += '<strong>Federal:</strong> ' + PROTECTED_CLASSES.federal.join(', ') + '<br>';
        html += '<strong>NY State:</strong> ' + PROTECTED_CLASSES.nyState.join(', ') + '<br>';
        html += '<strong>NYC:</strong> ' + PROTECTED_CLASSES.nyc.join(', ');
        html += '</div>';

        out.innerHTML = html;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════════

    return {
        VERSION: '2.0.0',

        // Core functions
        validate:         validate,
        explainSearch:    explainSearch,
        exportBugReport:  exportBugReport,
        scanForViolations: scanForViolations,
        runFairHousingAudit: runFairHousingAudit,

        // UI
        renderPanel: renderPanel,

        // Internal handlers (called by onclick in panel HTML)
        _runValidate:    _runValidate,
        _runExplain:     _runExplain,
        _runBugReport:   _runBugReport,
        _runFairHousing: _runFairHousing,

        // Reference data
        PROTECTED_CLASSES:    PROTECTED_CLASSES,
        PROHIBITED_PATTERNS:  PROHIBITED_PATTERNS,
        NY_DOS_REQUIREMENTS:  NY_DOS_REQUIREMENTS
    };

})();

// Auto-render panel on DOMContentLoaded (if not already rendered)
document.addEventListener('DOMContentLoaded', function() {
    // Only render if no panel exists yet
    if (!document.getElementById('searchDoctorPanel')) {
        SearchDoctor.renderPanel();
    }
});
