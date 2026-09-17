// ═══════════════════════════════════════════════════════════════════════════════════════════════
// INVESTMENT CALCULATION CORE — cap rate, cash-on-cash, ROI, §1031
//
// Tranche 1 group 2. Augments CrmCalc (js/calc/transaction-costs.js) so every consumer has ONE
// entry point. Pure: no DOM, plain object in, plain object out, same contract as group 1 -
// { calculator, version, inputs, assumptions[], lines[], totals{}, warnings[], disclaimer }.
//
// ── WHAT WAS CARRIED OVER, AND WHAT WAS WRONG ──────────────────────────────────────────────────
//
// Cap rate and cash-on-cash in js/dashboard/panels/tools/** were checked line by line and are
// standard. Carried over unchanged in substance.
//
// ROI was not. It had two SILENT modelling gaps:
//   · it counted appreciation in full and never subtracted the cost of selling, overstating the
//     return for anyone who would actually transact;
//   · it computed equity from the remaining mortgage and then never counted principal paydown as a
//     return, understating leveraged holds.
// Neither was visible or changeable. Both are explicit assumptions here, and the exit costs are
// computed by CrmCalc.netProceeds - the SAME core the seller net sheet uses - so the transfer-tax
// tables exist once. That is the whole point of this tranche: one calculation authority feeding
// Search comparison, CMA, valuation, buy-vs-rent, the seller net sheet and client reports, instead
// of each growing its own arithmetic.
//
// ── §1031 IS NOT AN ELIGIBILITY OPINION ────────────────────────────────────────────────────────
//
// Owner instruction 2026-09-09: it "should not imply that a transaction qualifies for §1031 merely
// because the numbers work. Qualification depends on facts outside a calculator."
//
// So this models the 45/180-day clock and the gain arithmetic, and stops there. `eligibility` is
// permanently `determined: false`; the statutory requirements are returned as facts to satisfy with
// `satisfied: null` - never ticked by the calculator; and deferral is described as POTENTIAL. A
// calculator cannot see holding intent, related-party history, the qualified intermediary's conduct
// or the taxpayer's other transactions, so it must not speak as though it can.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

(function (root) {
    'use strict';
    if (typeof root.CrmCalc === 'undefined') {
        throw new Error('js/calc/investment.js requires js/calc/transaction-costs.js to load first.');
    }
    var CrmCalc = root.CrmCalc;
    var VERSION = 1;

    function _num(v, fallback) {
        var n = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v;
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }
    function _positive(v, name) {
        var n = _num(v, NaN);
        if (!isFinite(n) || n <= 0) throw new Error('A ' + name + ' greater than zero is required (got ' + v + ').');
        return n;
    }
    function _pct(v, name, fallback) {
        var n = _num(v, fallback);
        if (!isFinite(n) || n < 0 || n > 100) throw new Error('The ' + name + ' must be between 0 and 100 percent (got ' + v + ').');
        return n;
    }
    function _assume(list, key, label, value, unit, source, note) {
        list.push({ key: key, label: label, value: value, unit: unit || null, source: source, note: note || null });
        return value;
    }
    function _line(list, key, label, amount, basis, note) {
        list.push({ key: key, label: label, amount: amount, basis: basis || null, note: note || null, countsTowardTotal: true });
    }
    function _wrap(calculator, input, A, L, totals, W) {
        return {
            calculator: calculator, version: VERSION, inputs: input,
            assumptions: A, lines: L, totals: totals, warnings: W || [],
            disclaimer: CrmCalc.DISCLAIMER,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CAP RATE — NOI over price. Deliberately EXCLUDES debt service: a rate
    // that moved with the buyer's mortgage would not be a capitalisation rate.
    // ═══════════════════════════════════════════════════════════════════════
    function capRate(input) {
        input = input || {};
        var price = _positive(input.price, 'price');
        var gross = _num(input.grossAnnualRent, 0);
        var vacancyPct = _pct(input.vacancyRatePct, 'vacancy rate', 5);
        var opex = _num(input.operatingExpenses, 0);

        var A = [], L = [], W = [];
        _assume(A, 'price', 'Purchase price / value', price, 'USD', 'user');
        _assume(A, 'grossAnnualRent', 'Gross annual rent', gross, 'USD', 'user');
        _assume(A, 'vacancyRatePct', 'Vacancy allowance', vacancyPct, '%', input.vacancyRatePct === undefined ? 'default' : 'user',
            'Applied to gross rent to reach effective gross income.');
        _assume(A, 'operatingExpenses', 'Annual operating expenses', opex, 'USD', 'user',
            'Taxes, insurance, maintenance, management, common charges — NOT mortgage payments.');

        var egi = gross * (1 - vacancyPct / 100);
        var noi = egi - opex;

        _line(L, 'grossAnnualRent', 'Gross annual rent', gross, null, null);
        _line(L, 'vacancyLoss', 'Less vacancy (' + vacancyPct + '%)', -(gross - egi), null, null);
        _line(L, 'operatingExpenses', 'Less operating expenses', -opex, null, null);
        _line(L, 'noi', 'Net operating income', noi, null, 'Before debt service, by definition.');

        if (input.annualDebtService) {
            W.push('Debt service is excluded from a cap rate by definition, so the figure entered does not affect it. ' +
                'Use cash-on-cash for a leveraged return.');
        }
        if (noi < 0) W.push('Operating expenses exceed effective gross income, so the cap rate is negative.');

        return _wrap('cap-rate', input, A, L, {
            effectiveGrossIncome: egi, noi: noi, capRatePct: (noi / price) * 100,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CASH-ON-CASH — annual cash flow AFTER debt service, over cash actually in
    // ═══════════════════════════════════════════════════════════════════════
    function cashOnCash(input) {
        input = input || {};
        _positive(input.purchasePrice, 'purchase price');
        var down = _num(input.downPayment, 0);
        var closing = _num(input.closingCosts, 0);
        var capex = _num(input.initialCapex, 0);
        var cashInvested = down + closing + capex;
        if (cashInvested <= 0) throw new Error('Total cash invested must be greater than zero (down payment + closing costs + capital improvements).');

        var rent = _num(input.annualRent, 0);
        var taxes = _num(input.propertyTaxes, 0);
        var insurance = _num(input.insurance, 0);
        var maintenance = _num(input.maintenance, 0);
        var management = _num(input.managementFees, 0);
        var vacancy = _num(input.vacancyAllowance, 0);
        var debt = _num(input.annualDebtService, 0);

        var A = [], L = [], W = [];
        _assume(A, 'purchasePrice', 'Purchase price', _num(input.purchasePrice, 0), 'USD', 'user');
        _assume(A, 'downPayment', 'Down payment', down, 'USD', 'user');
        _assume(A, 'closingCosts', 'Closing costs', closing, 'USD', 'user');
        _assume(A, 'initialCapex', 'Up-front capital improvements', capex, 'USD', input.initialCapex === undefined ? 'default' : 'user',
            'Counted as cash invested — it is money in before the first dollar of return.');
        _assume(A, 'annualRent', 'Annual rent collected', rent, 'USD', 'user');
        _assume(A, 'annualDebtService', 'Annual debt service', debt, 'USD', 'user', 'Principal and interest.');
        ['propertyTaxes', 'insurance', 'maintenance', 'managementFees', 'vacancyAllowance'].forEach(function (k) {
            var labels = {
                propertyTaxes: 'Property taxes', insurance: 'Insurance', maintenance: 'Maintenance',
                managementFees: 'Management fees', vacancyAllowance: 'Vacancy allowance',
            };
            _assume(A, k, labels[k], _num(input[k], 0), 'USD', input[k] === undefined ? 'default' : 'user');
        });

        var expenses = taxes + insurance + maintenance + management + vacancy;
        var cashFlow = rent - expenses - debt;

        _line(L, 'annualRent', 'Annual rent', rent, null, null);
        _line(L, 'operatingExpenses', 'Less operating expenses', -expenses, null, null);
        _line(L, 'debtService', 'Less debt service', -debt, null, null);
        _line(L, 'annualCashFlow', 'Annual cash flow', cashFlow, null, null);

        if (cashFlow < 0) W.push('This property is cash-flow negative at these figures.');

        return _wrap('cash-on-cash', input, A, L, {
            cashInvested: cashInvested, annualCashFlow: cashFlow,
            monthlyCashFlow: cashFlow / 12, cashOnCashPct: (cashFlow / cashInvested) * 100,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ROI — total and annualised, with the exit modelled honestly
    // ═══════════════════════════════════════════════════════════════════════
    function roi(input) {
        input = input || {};
        var purchase = _positive(input.purchasePrice, 'purchase price');
        var current = _positive(input.currentValue, 'current value');
        var years = _num(input.holdingYears, 0);
        if (!isFinite(years) || years <= 0) throw new Error('A holding period greater than zero years is required (got ' + input.holdingYears + ').');

        var down = _num(input.downPayment, 0);
        var closing = _num(input.closingCosts, 0);
        var cashInvested = down + closing + _num(input.initialCapex, 0);
        if (cashInvested <= 0) throw new Error('Total cash invested must be greater than zero.');

        var rental = _num(input.totalRentalIncome, 0);
        var opex = _num(input.totalOperatingExpenses, 0);
        var paydown = _num(input.principalPaidDown, 0);
        var includeSale = input.includeSaleCosts === true;

        var A = [], L = [], W = [];
        _assume(A, 'purchasePrice', 'Purchase price', purchase, 'USD', 'user');
        _assume(A, 'currentValue', 'Current / projected value', current, 'USD', 'user');
        _assume(A, 'holdingYears', 'Holding period', years, 'years', 'user');
        _assume(A, 'downPayment', 'Down payment', down, 'USD', 'user');
        _assume(A, 'closingCosts', 'Purchase closing costs', closing, 'USD', 'user');
        _assume(A, 'totalRentalIncome', 'Rental income over the hold', rental, 'USD', input.totalRentalIncome === undefined ? 'default' : 'user');
        _assume(A, 'totalOperatingExpenses', 'Operating expenses over the hold', opex, 'USD', input.totalOperatingExpenses === undefined ? 'default' : 'user');
        _assume(A, 'principalPaidDown', 'Mortgage principal paid down', paydown, 'USD', input.principalPaidDown === undefined ? 'default' : 'user',
            'Counted as a return: it is equity built out of cash flow.');
        _assume(A, 'includeSaleCosts', 'Model the cost of selling', includeSale, null, input.includeSaleCosts === undefined ? 'default' : 'user',
            includeSale ? 'Exit costs computed by the same net-proceeds core the seller net sheet uses.'
                        : 'OFF — the return below ignores what it would cost to sell, so it is a paper return.');

        var appreciation = current - purchase;
        var netRental = rental - opex;

        _line(L, 'appreciation', 'Appreciation', appreciation, null, null);
        _line(L, 'netRentalIncome', 'Net rental income over the hold', netRental, null, null);
        if (paydown) _line(L, 'principalPaidDown', 'Mortgage principal paid down', paydown, null, 'Equity built out of cash flow.');

        var saleCosts = 0;
        if (includeSale) {
            var commissionPct = _num(input.commissionPct, 0);
            _assume(A, 'commissionPct', 'Brokerage commission on sale', commissionPct, '%', input.commissionPct === undefined ? 'default' : 'user',
                'Commissions are not set by law and are fully negotiable.');
            var sheet = CrmCalc.netProceeds({
                price: current,
                propertyType: input.propertyType || 'condo',
                commissionPct: commissionPct,
                attorneyFee: input.sellerAttorneyFee,
                flipTaxPct: input.flipTaxPct,
            });
            saleCosts = sheet.totals.sellingCosts;
            _line(L, 'saleCosts', 'Less cost of selling', -saleCosts, null,
                'From the shared net-proceeds core — transfer taxes, commission, attorney.');
        } else {
            W.push('The cost of selling is NOT included. This is a paper return: transfer taxes and commission ' +
                'would reduce it. Switch "Model the cost of selling" on for a realisable figure.');
        }

        var totalProfit = appreciation + netRental + paydown - saleCosts;
        var end = cashInvested + totalProfit;

        // A wipe-out annualises as -100%, not NaN: Math.pow of a negative base with a fractional
        // exponent is NaN, and a report must never render that.
        var annualised = end > 0 ? (Math.pow(end / cashInvested, 1 / years) - 1) * 100 : -100;

        _line(L, 'totalProfit', 'Total profit', totalProfit, null, null);

        return _wrap('roi', input, A, L, {
            cashInvested: cashInvested, appreciation: appreciation, netRentalIncome: netRental,
            saleCosts: saleCosts, totalProfit: totalProfit,
            totalRoiPct: (totalProfit / cashInvested) * 100,
            annualisedRoiPct: annualised,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // §1031 — the clock and the arithmetic. NOT an eligibility opinion.
    // ═══════════════════════════════════════════════════════════════════════
    var DAY = 86400000;
    function _utcDate(v, name) {
        var d = (v instanceof Date) ? v : new Date(String(v) + (String(v).length === 10 ? 'T00:00:00Z' : ''));
        if (!d || isNaN(d.getTime())) throw new Error('A valid ' + name + ' date is required (got ' + v + ').');
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    function _iso(ms) { return new Date(ms).toISOString().slice(0, 10); }

    function exchange1031(input) {
        input = input || {};
        var saleMs = _utcDate(input.saleClosingDate, 'sale closing');
        var todayMs = input.today ? _utcDate(input.today, 'current') : _utcDate(new Date(), 'current');

        var identifyMs = saleMs + 45 * DAY;
        var exchangeMs = saleMs + 180 * DAY;

        var salePrice = _positive(input.salePrice, 'sale price');
        var basis = _num(input.adjustedBasis, 0);
        var sellingCosts = _num(input.sellingCosts, 0);
        var replacement = _num(input.replacementPrice, 0);
        var boot = _num(input.bootReceived, 0);

        var A = [], L = [], W = [];
        _assume(A, 'saleClosingDate', 'Relinquished property closing', _iso(saleMs), null, 'user', 'Starts both statutory clocks.');
        _assume(A, 'salePrice', 'Relinquished sale price', salePrice, 'USD', 'user');
        _assume(A, 'adjustedBasis', 'Adjusted basis', basis, 'USD', 'user', 'From the taxpayer\'s own records — not derived here.');
        _assume(A, 'sellingCosts', 'Selling costs', sellingCosts, 'USD', 'user');
        _assume(A, 'replacementPrice', 'Replacement property price', replacement, 'USD', input.replacementPrice === undefined ? 'default' : 'user');
        _assume(A, 'bootReceived', 'Boot received', boot, 'USD', input.bootReceived === undefined ? 'default' : 'user',
            'Cash or non-like-kind property received. Boot is generally taxable.');

        var realised = salePrice - sellingCosts - basis;
        var recognised = Math.max(0, Math.min(boot, Math.max(0, realised)));
        var deferred = Math.max(0, realised - recognised);

        _line(L, 'salePrice', 'Relinquished sale price', salePrice, null, null);
        _line(L, 'sellingCosts', 'Less selling costs', -sellingCosts, null, null);
        _line(L, 'adjustedBasis', 'Less adjusted basis', -basis, null, null);
        _line(L, 'realisedGain', 'Realised gain', realised, 'IRC §1001', null);
        _line(L, 'recognisedGain', 'Gain recognisable on boot received', recognised, 'IRC §1031(b)',
            'Boot is generally taxable in the year received.');
        _line(L, 'potentiallyDeferredGain', 'Potentially deferred gain', deferred, 'IRC §1031(a)',
            'Potentially deferred gain — subject to the requirements below being met on the facts.');

        if (replacement > 0 && replacement < salePrice) {
            W.push('The replacement property is priced lower than the relinquished property. A shortfall in value or ' +
                'in debt replaced generally produces boot, which is taxable.');
        }
        if (todayMs > identifyMs) W.push('The 45-day identification period has passed.');
        if (todayMs > exchangeMs) W.push('The 180-day exchange period has passed.');

        return {
            calculator: 'exchange-1031',
            version: VERSION,
            inputs: input,
            assumptions: A,
            lines: L,
            totals: {
                realisedGain: realised,
                recognisedGain: recognised,
                potentiallyDeferredGain: deferred,
            },
            timeline: {
                saleClosing: _iso(saleMs),
                identifyBy: _iso(identifyMs),
                exchangeBy: _iso(exchangeMs),
                daysToIdentify: Math.round((identifyMs - todayMs) / DAY),
                daysToExchange: Math.round((exchangeMs - todayMs) / DAY),
                identificationPassed: todayMs > identifyMs,
                exchangePassed: todayMs > exchangeMs,
            },
            // A calculator sees numbers and dates. It does not see holding intent, related-party
            // history, the intermediary's conduct, or the taxpayer's other transactions - so it does
            // not reach a conclusion about them, and this flag never becomes true.
            eligibility: {
                determined: false,
                note: 'This tool does not determine whether a transaction meets IRC §1031. Treatment depends on ' +
                      'facts outside this calculation, including holding intent and use, related-party rules, and the ' +
                      'conduct of the exchange. Confirm with the taxpayer\'s attorney and accountant.',
            },
            // Facts to satisfy, never ticked here: `satisfied` is null because the calculator has no
            // basis to assert either way.
            requirements: [
                { key: 'qualifiedIntermediary', label: 'A qualified intermediary holds the proceeds; the taxpayer must not receive them', satisfied: null },
                { key: 'likeKind', label: 'Both properties are like-kind real property held for investment or productive use in a trade or business', satisfied: null },
                { key: 'identify45', label: 'Replacement property identified in writing within 45 days of the relinquished closing', satisfied: null },
                { key: 'close180', label: 'Replacement property acquired within 180 days of the relinquished closing', satisfied: null },
                { key: 'noBoot', label: 'Cash or non-like-kind property received is boot and is generally taxable', satisfied: null },
            ],
            warnings: W,
            disclaimer: CrmCalc.DISCLAIMER + ' This is not tax advice and does not determine §1031 treatment.',
        };
    }

    CrmCalc.capRate = capRate;
    CrmCalc.cashOnCash = cashOnCash;
    CrmCalc.roi = roi;
    CrmCalc.exchange1031 = exchange1031;
})(typeof window !== 'undefined' ? window : globalThis);
