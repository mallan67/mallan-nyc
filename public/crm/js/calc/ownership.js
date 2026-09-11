// ═══════════════════════════════════════════════════════════════════════════════════════════════
// OWNERSHIP / RENTAL ECONOMICS CORE — yield, break-even, carrying cost, equity, vacancy
//
// Tranche 1 group 3. Augments CrmCalc. Pure: no DOM, plain object in, plain object out, same
// contract as groups 1 and 2.
//
// ── BREAK-EVEN WAS A FIFTH COPY OF THE TAX TABLES ──────────────────────────────────────────────
//
// js/dashboard/panels/tools/breakeven-price.js had the right algebra and the wrong rate:
//
//     var transferRate = 0.01425 + 0.004;   // flat, regardless of price
//     P = (M + F) / (1 - C - T)
//
// T is not a constant. NYC RPTT is 1.00% below $500,000 and 1.425% at or above it; NYS transfer is
// 0.40% below $3,000,000 and 0.65% at or above. So the flat rate OVERSTATED the price needed below
// $500K and UNDERSTATED it at $3M+ - telling a seller they could break even at a price that does
// not cover their costs.
//
// It is also inherently circular: the rate depends on the price being solved for, and a co-op flip
// tax is a percentage of that same price. So this does not pick a rate - it SOLVES against
// CrmCalc.netProceeds, the one authority, by bisection, and the test verifies the answer by
// settlement (running the net sheet at the solved price and checking the seller nets zero) rather
// than by re-running the same formula.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

(function (root) {
    'use strict';
    if (typeof root.CrmCalc === 'undefined') {
        throw new Error('js/calc/ownership.js requires js/calc/transaction-costs.js to load first.');
    }
    var CrmCalc = root.CrmCalc;
    var VERSION = 1;

    // Average days in a month. Stated as an assumption wherever it is used, because "per day"
    // figures silently differ by 1.5% depending on whether you divide by 30 or by 30.44.
    var DAYS_PER_MONTH = 30.44;

    function _num(v, fallback) {
        var n = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v;
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }
    function _positive(v, name) {
        var n = _num(v, NaN);
        if (!isFinite(n) || n <= 0) throw new Error('A ' + name + ' greater than zero is required (got ' + v + ').');
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
    // RENTAL YIELD
    // ═══════════════════════════════════════════════════════════════════════
    function rentalYield(input) {
        input = input || {};
        var value = _positive(input.propertyValue, 'property value');
        var rent = _num(input.monthlyRent, 0);
        var expenses = _num(input.annualExpenses, 0);

        var A = [], L = [], W = [];
        _assume(A, 'propertyValue', 'Property value', value, 'USD', 'user');
        _assume(A, 'monthlyRent', 'Monthly rent', rent, 'USD', 'user');
        _assume(A, 'annualExpenses', 'Annual operating expenses', expenses, 'USD', input.annualExpenses === undefined ? 'default' : 'user',
            'Taxes, insurance, maintenance, management, common charges — NOT mortgage payments.');

        var gross = rent * 12;
        var net = gross - expenses;

        _line(L, 'annualGrossRent', 'Annual gross rent', gross, null, null);
        _line(L, 'annualExpenses', 'Less operating expenses', -expenses, null, null);
        _line(L, 'annualNetRent', 'Annual net rent', net, null, null);

        if (net < 0) W.push('Operating expenses exceed gross rent, so the net yield is negative.');

        return _wrap('rental-yield', input, A, L, {
            annualGrossRent: gross, annualNetRent: net,
            grossYieldPct: (gross / value) * 100,
            netYieldPct: (net / value) * 100,
            expenseRatioPct: gross > 0 ? (expenses / gross) * 100 : 0,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BREAK-EVEN SALE PRICE — solved against the one tax authority
    // ═══════════════════════════════════════════════════════════════════════
    function breakEvenSalePrice(input) {
        input = input || {};
        var payoff = _num(input.mortgagePayoff, 0);
        var commissionPct = _num(input.commissionPct, 0);
        if (commissionPct >= 100) {
            throw new Error('A break-even price cannot be reached: the commission alone consumes the whole sale price.');
        }
        var propertyType = input.propertyType || 'condo';

        var A = [], L = [], W = [];
        _assume(A, 'mortgagePayoff', 'Mortgage payoff', payoff, 'USD', 'user');
        _assume(A, 'commissionPct', 'Brokerage commission', commissionPct, '%', input.commissionPct === undefined ? 'default' : 'user',
            'Commissions are not set by law and are fully negotiable.');
        _assume(A, 'propertyType', 'Property type', propertyType, null, input.propertyType ? 'user' : 'default');
        if (input.flipTaxPct !== undefined) _assume(A, 'flipTaxPct', 'Flip tax', _num(input.flipTaxPct, 0), '%', 'user');
        if (input.attorneyFee !== undefined) _assume(A, 'attorneyFee', 'Attorney fee', _num(input.attorneyFee, 0), 'USD', 'user');
        if (input.otherCosts !== undefined) _assume(A, 'otherCosts', 'Other selling costs', _num(input.otherCosts, 0), 'USD', 'user');

        /** Net to the seller at a candidate price, through the ONE net-proceeds core. */
        function netAt(price) {
            return CrmCalc.netProceeds({
                price: price, propertyType: propertyType, commissionPct: commissionPct,
                attorneyFee: input.attorneyFee, otherCosts: input.otherCosts,
                flipTaxPct: input.flipTaxPct, mortgagePayoff: payoff,
            }).totals.netProceeds;
        }

        // Bisection rather than a closed form: the transfer-tax RATE changes with the price being
        // solved for, so no single denominator is correct across the bands.
        var lo = 1;
        var hi = Math.max(payoff * 2, 1000000);
        var guard = 0;
        while (netAt(hi) < 0 && guard++ < 60) hi *= 2;
        if (netAt(hi) < 0) throw new Error('A break-even price cannot be reached with these costs.');

        for (var i = 0; i < 200; i++) {
            var mid = (lo + hi) / 2;
            if (netAt(mid) < 0) lo = mid; else hi = mid;
        }
        var price = Math.ceil(hi * 100) / 100;

        var sheet = CrmCalc.netProceeds({
            price: price, propertyType: propertyType, commissionPct: commissionPct,
            attorneyFee: input.attorneyFee, otherCosts: input.otherCosts,
            flipTaxPct: input.flipTaxPct, mortgagePayoff: payoff,
        });
        sheet.lines.forEach(function (l) { L.push(l); });
        _line(L, 'mortgagePayoff', 'Mortgage payoff', payoff, null, null);

        if (price >= 3000000) {
            W.push('At or above $3,000,000 the NYS transfer tax is 0.65%, not 0.40%. A flat-rate estimate ' +
                'understates the price needed to break even.');
        }

        return _wrap('break-even-price', input, A, L, {
            breakEvenPrice: price,
            sellingCosts: sheet.totals.sellingCosts,
            mortgagePayoff: payoff,
            netAtBreakEven: sheet.totals.netProceeds,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CARRYING COST
    // ═══════════════════════════════════════════════════════════════════════
    function carryingCost(input) {
        input = input || {};
        var months = _positive(input.months, 'number of months');

        var parts = {
            monthlyMortgage: 'Mortgage', monthlyMaintenance: 'Maintenance / common charges',
            monthlyPropertyTax: 'Property tax', monthlyInsurance: 'Insurance',
            monthlyUtilities: 'Utilities', monthlyOther: 'Other',
        };
        var A = [], L = [], W = [];
        var monthly = 0;
        Object.keys(parts).forEach(function (k) {
            var v = _num(input[k], 0);
            monthly += v;
            _assume(A, k, parts[k], v, 'USD', input[k] === undefined ? 'default' : 'user');
            if (v) _line(L, k, parts[k] + ' (monthly)', v, null, null);
        });
        _assume(A, 'months', 'Holding period', months, 'months', 'user');
        _assume(A, 'daysPerMonth', 'Days per month', DAYS_PER_MONTH, 'days', 'default',
            'Average calendar month. A "per day" figure differs by ~1.5% if 30 is used instead.');

        return _wrap('carrying-cost', input, A, L, {
            monthlyTotal: monthly,
            totalCost: monthly * months,
            dailyCost: monthly / DAYS_PER_MONTH,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EQUITY
    // ═══════════════════════════════════════════════════════════════════════
    function equity(input) {
        input = input || {};
        var market = _positive(input.marketValue, 'market value');
        var mortgage = _num(input.mortgageBalance, 0);
        var liens = _num(input.otherLiens, 0);
        var purchase = input.purchasePrice === undefined || input.purchasePrice === null || input.purchasePrice === ''
            ? null : _num(input.purchasePrice, null);

        var A = [], L = [], W = [];
        _assume(A, 'marketValue', 'Current market value', market, 'USD', 'user');
        _assume(A, 'mortgageBalance', 'Mortgage balance', mortgage, 'USD', 'user');
        _assume(A, 'otherLiens', 'Other liens', liens, 'USD', input.otherLiens === undefined ? 'default' : 'user',
            'Second mortgages, HELOCs, judgments — debt against the same property.');
        if (purchase !== null) _assume(A, 'purchasePrice', 'Original purchase price', purchase, 'USD', 'user');

        var eq = market - mortgage - liens;

        _line(L, 'marketValue', 'Market value', market, null, null);
        _line(L, 'mortgageBalance', 'Less mortgage balance', -mortgage, null, null);
        if (liens) _line(L, 'otherLiens', 'Less other liens', -liens, null, null);
        _line(L, 'equity', 'Equity', eq, null, null);

        if (eq < 0) W.push('Debt exceeds market value — this position is underwater.');

        return _wrap('equity', input, A, L, {
            equity: eq,
            equityPct: (eq / market) * 100,
            ltvPct: (mortgage / market) * 100,
            // Liens are debt too. Reporting only first-mortgage LTV overstates borrowing capacity.
            cltvPct: ((mortgage + liens) / market) * 100,
            appreciation: purchase !== null && purchase > 0 ? market - purchase : null,
            appreciationPct: purchase !== null && purchase > 0 ? ((market - purchase) / purchase) * 100 : null,
        }, W);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VACANCY COST
    // ═══════════════════════════════════════════════════════════════════════
    function vacancyCost(input) {
        input = input || {};
        var rent = _positive(input.monthlyRent, 'monthly rent');

        var months;
        var monthsSource = 'user';
        if (input.vacancyStart && input.vacancyEnd) {
            var s = new Date(String(input.vacancyStart) + 'T00:00:00Z');
            var e = new Date(String(input.vacancyEnd) + 'T00:00:00Z');
            if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new Error('A valid vacancy start and end date are required.');
            if (e <= s) throw new Error('The vacancy end date must be after the start date.');
            months = (e.getTime() - s.getTime()) / (DAYS_PER_MONTH * 86400000);
        } else {
            months = _num(input.vacancyMonths, 0);
            if (!(months > 0)) throw new Error('A vacancy length greater than zero months is required.');
        }

        var A = [], L = [], W = [];
        _assume(A, 'monthlyRent', 'Monthly rent', rent, 'USD', 'user');
        _assume(A, 'vacancyMonths', 'Vacancy length', months, 'months', monthsSource,
            input.vacancyStart ? 'Derived from the dates entered, at ' + DAYS_PER_MONTH + ' days per month.' : null);

        var carryParts = {
            monthlyMortgage: 'Mortgage', monthlyPropertyTax: 'Property tax',
            monthlyInsurance: 'Insurance', monthlyMaintenance: 'Maintenance',
        };
        var monthlyCarry = 0;
        Object.keys(carryParts).forEach(function (k) {
            var v = _num(input[k], 0);
            monthlyCarry += v;
            _assume(A, k, carryParts[k] + ' (monthly)', v, 'USD', input[k] === undefined ? 'default' : 'user');
        });

        var turnParts = {
            marketingCosts: 'Marketing', cleaningCosts: 'Cleaning',
            paintingCosts: 'Painting', repairCosts: 'Repairs',
        };
        var turnover = 0;
        Object.keys(turnParts).forEach(function (k) {
            var v = _num(input[k], 0);
            turnover += v;
            _assume(A, k, turnParts[k], v, 'USD', input[k] === undefined ? 'default' : 'user');
        });

        var lostRent = rent * months;
        var carrying = monthlyCarry * months;

        _line(L, 'lostRent', 'Lost rent', lostRent, null, null);
        _line(L, 'carryingDuringVacancy', 'Carrying costs during vacancy', carrying, null, null);
        _line(L, 'turnoverCosts', 'Turnover costs', turnover, null, 'One-off costs to re-let.');

        var total = lostRent + carrying + turnover;

        return _wrap('vacancy-cost', input, A, L, {
            vacancyMonths: months, lostRent: lostRent,
            carryingDuringVacancy: carrying, turnoverCosts: turnover,
            totalCost: total,
            // Expressed against rent so it can be weighed against a price reduction: "this vacancy
            // costs the equivalent of N months' rent" is the comparison a landlord actually makes.
            equivalentMonthsOfRent: total / rent,
        }, W);
    }

    CrmCalc.rentalYield = rentalYield;
    CrmCalc.breakEvenSalePrice = breakEvenSalePrice;
    CrmCalc.carryingCost = carryingCost;
    CrmCalc.equity = equity;
    CrmCalc.vacancyCost = vacancyCost;
})(typeof window !== 'undefined' ? window : globalThis);
