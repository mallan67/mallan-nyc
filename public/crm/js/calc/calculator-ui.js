// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CALCULATOR UI — one generic renderer over the calculation contract
//
// Every calculator in js/calc/** returns the same shape:
//   { calculator, version, inputs, assumptions[], lines[], totals{}, warnings[], disclaimer }
//
// So there is ONE renderer, not one per calculator. It builds the form from `assumptions` - which is
// precisely the owner requirement that every variable be visible and editable: if a number moved the
// result, it is an assumption, and if it is an assumption it gets a field. A calculator cannot hide a
// commission, rate, vacancy or escalation from this UI without also hiding it from every report.
//
// The renderer deliberately knows nothing about mansion tax, co-ops or 1031s. It renders a contract.
// Adding a calculator means adding a pure function, not a page.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

var CrmCalcUI = (function () {
    'use strict';

    /** Calculators this UI can mount, in the order an agent meets them. */
    var REGISTRY = {
        'buyer-closing-costs': {
            label: 'Buyer Closing Costs',
            group: 'Transaction costs',
            run: function (i) { return CrmCalc.buyerClosingCosts(i); },
            seed: { price: 1500000, propertyType: 'condo', financing: true, downPaymentPct: 20 },
            headline: [['cashRequired', 'Cash required at closing'], ['closingCosts', 'Closing costs'], ['monthlyTotal', 'Estimated monthly']],
        },
        'seller-closing-costs': {
            label: 'Seller Closing Costs',
            group: 'Transaction costs',
            run: function (i) { return CrmCalc.sellerClosingCosts(i); },
            seed: { price: 1500000, propertyType: 'condo' },
            headline: [['closingCosts', 'Total seller costs']],
        },
        'net-proceeds': {
            label: 'Seller Net Proceeds',
            group: 'Transaction costs',
            run: function (i) { return CrmCalc.netProceeds(i); },
            seed: { price: 1500000, propertyType: 'condo', commissionPct: 5, mortgagePayoff: 0 },
            headline: [['netProceeds', 'Net proceeds to seller'], ['sellingCosts', 'Selling costs'], ['salePrice', 'Sale price']],
        },

        'cap-rate': {
            label: 'Cap Rate',
            group: 'Investment',
            run: function (i) { return CrmCalc.capRate(i); },
            seed: { price: 2000000, grossAnnualRent: 180000, vacancyRatePct: 5, operatingExpenses: 60000 },
            headline: [['capRatePct', 'Cap rate', 'percent'], ['noi', 'Net operating income'], ['effectiveGrossIncome', 'Effective gross income']],
        },
        'cash-on-cash': {
            label: 'Cash-on-Cash Return',
            group: 'Investment',
            run: function (i) { return CrmCalc.cashOnCash(i); },
            seed: {
                purchasePrice: 1000000, downPayment: 250000, closingCosts: 30000, initialCapex: 0,
                annualRent: 84000, propertyTaxes: 12000, insurance: 3000, maintenance: 6000,
                managementFees: 4200, vacancyAllowance: 4200, annualDebtService: 48000,
            },
            headline: [['cashOnCashPct', 'Cash-on-cash', 'percent'], ['annualCashFlow', 'Annual cash flow'], ['cashInvested', 'Cash invested']],
        },
        'roi': {
            label: 'Return on Investment',
            group: 'Investment',
            run: function (i) { return CrmCalc.roi(i); },
            seed: {
                purchasePrice: 1000000, currentValue: 1400000, downPayment: 250000, closingCosts: 30000,
                totalRentalIncome: 300000, totalOperatingExpenses: 120000, principalPaidDown: 0,
                holdingYears: 5, propertyType: 'condo', includeSaleCosts: true, commissionPct: 5,
            },
            headline: [['totalRoiPct', 'Total ROI', 'percent'], ['annualisedRoiPct', 'Annualised', 'percent'], ['totalProfit', 'Total profit']],
        },
        'exchange-1031': {
            label: '1031 Exchange',
            group: 'Investment',
            run: function (i) { return CrmCalc.exchange1031(i); },
            seed: {
                saleClosingDate: '2026-03-02', salePrice: 3000000, adjustedBasis: 1200000,
                sellingCosts: 200000, replacementPrice: 3500000, bootReceived: 0,
            },
            headline: [['potentiallyDeferredGain', 'Potentially deferred gain'], ['recognisedGain', 'Recognisable on boot'], ['realisedGain', 'Realised gain']],
        },
    };

    var _state = {}; // calculatorKey -> current inputs

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _money(n) {
        var v = Math.round(Number(n) || 0);
        return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US');
    }
    function _fieldId(key) { return 'crmcalc-f-' + key; }

    /** An assumption whose value is one of a known set renders as a select, not a free-text box. */
    var CHOICES = {
        propertyType: function () { return CrmCalc.PROPERTY_TYPES; },
        financingInstrument: function () { return ['recorded_mortgage', 'cooperative_share_loan']; },
    };

    function _renderField(a) {
        var id = _fieldId(a.key);
        var h = '<div class="flex flex-col gap-1">';
        h += '<label for="' + id + '" class="text-[11px] font-semibold text-gray-600">' + _esc(a.label) +
            (a.unit && a.unit !== 'USD' ? ' <span class="text-gray-400">(' + _esc(a.unit) + ')</span>' : '') + '</label>';

        if (CHOICES[a.key]) {
            h += '<select id="' + id + '" data-calc-field="' + _esc(a.key) + '" class="border rounded-lg px-2 py-1.5 text-sm">';
            CHOICES[a.key]().forEach(function (opt) {
                h += '<option value="' + _esc(opt) + '"' + (String(a.value) === String(opt) ? ' selected' : '') + '>' + _esc(opt.replace(/_/g, ' ')) + '</option>';
            });
            h += '</select>';
        } else if (typeof a.value === 'boolean') {
            h += '<select id="' + id + '" data-calc-field="' + _esc(a.key) + '" class="border rounded-lg px-2 py-1.5 text-sm">' +
                '<option value="true"' + (a.value ? ' selected' : '') + '>Yes</option>' +
                '<option value="false"' + (!a.value ? ' selected' : '') + '>No</option></select>';
        } else {
            h += '<input id="' + id + '" data-calc-field="' + _esc(a.key) + '" type="text" value="' + _esc(a.value) +
                '" class="border rounded-lg px-2 py-1.5 text-sm" inputmode="decimal">';
        }

        // Provenance is shown, not implied. A default must never read as the operator's own number.
        if (a.source === 'default') {
            h += '<span class="text-[10px] text-amber-700" data-source="default">Default' + (a.note ? ' — ' + _esc(a.note) : '') + '</span>';
        } else if (a.source === 'statutory') {
            h += '<span class="text-[10px] text-gray-500" data-source="statutory">Statutory' + (a.note ? ' — ' + _esc(a.note) : '') + '</span>';
        } else if (a.note) {
            h += '<span class="text-[10px] text-gray-500" data-source="user">' + _esc(a.note) + '</span>';
        }
        return h + '</div>';
    }

    function _render(container, key) {
        var def = REGISTRY[key];
        var result;
        try {
            result = def.run(_state[key]);
        } catch (err) {
            container.innerHTML = '<div class="p-4 border border-red-200 bg-red-50 rounded-xl text-sm text-red-700" data-calc-error="1">' +
                _esc(err && err.message ? err.message : 'That input cannot be calculated.') + '</div>';
            return null;
        }

        var h = '<div class="space-y-4" data-calculator="' + _esc(key) + '">';
        h += '<h2 class="text-lg font-bold text-gray-900">' + _esc(def.label) + '</h2>';

        // Headline totals
        h += '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">';
        def.headline.forEach(function (pair) {
            var v = result.totals[pair[0]];
            if (v === undefined) return;
            var shown = pair[2] === 'percent' ? (Math.round(Number(v) * 100) / 100).toFixed(2) + '%' : _money(v);
            h += '<div class="border rounded-xl p-3 bg-gray-50" data-total="' + _esc(pair[0]) + '">' +
                '<p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">' + _esc(pair[1]) + '</p>' +
                '<p class="text-xl font-bold ' + (Number(v) < 0 ? 'text-red-600' : 'text-gray-900') + '">' + shown + '</p></div>';
        });
        h += '</div>';

        // ── Optional contract sections, rendered when a calculation supplies them ──
        // Still contract-driven: the renderer knows "a result may carry a statutory clock, an
        // eligibility position and requirements", not anything about §1031 in particular.
        if (result.eligibility && result.eligibility.determined === false) {
            h += '<div class="border border-amber-300 bg-amber-50 rounded-xl p-3" data-eligibility="undetermined">' +
                '<p class="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">Not an eligibility determination</p>' +
                '<p class="text-xs text-amber-800">' + _esc(result.eligibility.note) + '</p></div>';
        }
        if (result.timeline) {
            h += '<div class="border rounded-xl p-4" data-timeline="1"><h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Statutory clock</h3>' +
                '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">';
            [['identifyBy', 'Identify by'], ['exchangeBy', 'Exchange by'],
             ['daysToIdentify', 'Days to identify'], ['daysToExchange', 'Days to exchange']].forEach(function (p) {
                var v = result.timeline[p[0]];
                if (v === undefined) return;
                var late = (p[0] === 'daysToIdentify' && result.timeline.identificationPassed) ||
                           (p[0] === 'daysToExchange' && result.timeline.exchangePassed);
                h += '<div data-clock="' + _esc(p[0]) + '"><p class="text-[11px] text-gray-500">' + _esc(p[1]) + '</p>' +
                    '<p class="font-semibold ' + (late ? 'text-red-600' : 'text-gray-900') + '">' + _esc(v) + '</p></div>';
            });
            h += '</div></div>';
        }
        if (result.requirements && result.requirements.length) {
            h += '<div class="border rounded-xl p-4" data-requirements="1">' +
                '<h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Requirements — assessed on the facts, not by this tool</h3><ul class="space-y-1">';
            result.requirements.forEach(function (q) {
                // `satisfied: null` means the calculator has no basis to assert either way. It renders
                // as "not assessed" — never as a tick, which would read as a legal conclusion.
                var mark = q.satisfied === null ? 'Not assessed' : (q.satisfied ? 'Met' : 'Not met');
                h += '<li class="text-xs text-gray-700 flex gap-2" data-requirement="' + _esc(q.key) + '">' +
                    '<span class="text-[10px] font-semibold uppercase text-gray-400 shrink-0 w-24" data-satisfied="' + _esc(String(q.satisfied)) + '">' + _esc(mark) + '</span>' +
                    '<span>' + _esc(q.label) + '</span></li>';
            });
            h += '</ul></div>';
        }

        // Every variable that moved the number
        h += '<div class="border rounded-xl p-4"><h3 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Assumptions</h3>';
        h += '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">';
        result.assumptions.forEach(function (a) { h += _renderField(a); });
        h += '</div></div>';

        // Itemised lines with their basis
        h += '<div class="border rounded-xl overflow-hidden"><table class="w-full text-sm"><tbody>';
        result.lines.forEach(function (l) {
            h += '<tr class="border-b last:border-0" data-line="' + _esc(l.key) + '">' +
                '<td class="px-3 py-2"><span class="font-medium text-gray-800">' + _esc(l.label) + '</span>' +
                (l.basis ? '<div class="text-[10px] text-gray-400">' + _esc(l.basis) + '</div>' : '') +
                (l.note ? '<div class="text-[10px] text-gray-500">' + _esc(l.note) + '</div>' : '') +
                '</td><td class="px-3 py-2 text-right font-semibold text-gray-900">' + _money(l.amount) + '</td></tr>';
        });
        h += '</tbody></table></div>';

        if (result.warnings && result.warnings.length) {
            h += '<div class="border border-amber-200 bg-amber-50 rounded-xl p-3" data-warnings="1">';
            result.warnings.forEach(function (w) { h += '<p class="text-xs text-amber-800">' + _esc(w) + '</p>'; });
            h += '</div>';
        }

        h += '<p class="text-[10px] text-gray-500 leading-relaxed" data-disclaimer="1">' + _esc(result.disclaimer) + '</p>';
        h += '</div>';

        container.innerHTML = h;
        _bind(container, key);
        return result;
    }

    function _bind(container, key) {
        var fields = container.querySelectorAll('[data-calc-field]');
        for (var i = 0; i < fields.length; i++) {
            fields[i].addEventListener('change', function (ev) {
                var changed = ev && ev.target ? ev.target.getAttribute('data-calc-field') : null;
                var next = {};
                var all = container.querySelectorAll('[data-calc-field]');
                for (var j = 0; j < all.length; j++) {
                    var el = all[j];
                    var name = el.getAttribute('data-calc-field');
                    var raw = el.value;
                    if (raw === 'true' || raw === 'false') next[name] = raw === 'true';
                    else if (raw !== '' && !isNaN(parseFloat(String(raw).replace(/[$,\s]/g, '')))) next[name] = parseFloat(String(raw).replace(/[$,\s]/g, ''));
                    else next[name] = raw;
                }
                // Changing WHAT is being bought must re-default HOW it is financed. Otherwise the
                // instrument rendered for the previous type is carried forward: switching a financed
                // condo to a co-op would keep 'recorded_mortgage' and keep charging mortgage
                // recording tax, which is the exact defect this tranche exists to fix. The engine
                // cannot catch it - a recorded mortgage on co-op real property is a legitimate
                // (different) transaction, so it does not throw.
                if (changed === 'propertyType') delete next.financingInstrument;

                // Carry forward anything the form does not surface (e.g. financing=false).
                _state[key] = Object.assign({}, _state[key], next);
                if (changed === 'propertyType') delete _state[key].financingInstrument;
                _render(container, key);
            });
        }
    }

    /** Mount a calculator into a container. Returns the first result, for callers that want the data. */
    function mount(container, key, inputs) {
        if (!container || !REGISTRY[key]) return null;
        _state[key] = Object.assign({}, REGISTRY[key].seed, inputs || {});
        return _render(container, key);
    }

    /**
     * Register every calculator as a canonical route on the ONE routing authority.
     * Standalone routes are a convenience, not the only way in: the calculations themselves are
     * CrmCalc.* and are callable from a listing, a client workspace, a CMA or a report without this UI.
     */
    function registerRoutes() {
        if (typeof CrmRouting === 'undefined' || !CrmRouting) return [];
        var registered = [];
        Object.keys(REGISTRY).forEach(function (key) {
            var path = '/tools/' + key;
            CrmRouting.registerPanel(path, function () {
                var host = (typeof CRM !== 'undefined' && CRM && CRM.getContent) ? CRM.getContent() : document.getElementById('content');
                if (typeof CRM !== 'undefined' && CRM && CRM.setPanelTitle) CRM.setPanelTitle(REGISTRY[key].label);
                mount(host, key);
            });
            registered.push(path);
        });
        return registered;
    }

    function list() {
        return Object.keys(REGISTRY).map(function (k) {
            return { key: k, label: REGISTRY[k].label, group: REGISTRY[k].group, route: '/tools/' + k };
        });
    }

    return { mount: mount, registerRoutes: registerRoutes, list: list, REGISTRY: REGISTRY };
})();

if (typeof window !== 'undefined') {
    window.CrmCalcUI = CrmCalcUI;
    // Register on the ONE routing authority as soon as the page is up. Registration only adds route
    // patterns; it installs no listener of its own — CrmRouting owns the only one.
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('DOMContentLoaded', function () { CrmCalcUI.registerRoutes(); });
    }
}
