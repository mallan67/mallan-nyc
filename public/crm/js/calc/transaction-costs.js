// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TRANSACTION-COST CALCULATION CORE — pure, structured, reusable
//
// Tranche 1 of moving the 12 calculators out of the retired dashboard shell (js/dashboard/panels/
// tools/**) into the canonical CRM.
//
// THIS FILE TOUCHES NO DOM. It takes a plain object and returns a plain object. That is deliberate:
// the dashboard versions read `document.getElementById(id).value` and painted HTML, which makes them
// unusable by a CMA, a valuation report, a buy-vs-rent report or a client email - and that is exactly
// how a second implementation of the same arithmetic gets written later, and how "Buy vs Rent
// calculator" and "Buy vs Rent report" end up disagreeing. Owner instruction 2026-09-09: the
// calculators must "return reusable structured results, not just paint numbers into HTML".
//
// THE RESULT SHAPE, which reports render as-is:
//   { calculator, version, inputs, assumptions[], lines[], totals{}, warnings[], disclaimer }
//     assumptions[] every variable that moved the number: key, label, value, unit, source
//                   ('user' | 'default' | 'statutory'). NOTHING is hidden inside the arithmetic -
//                   no silent commission, appreciation, rate, vacancy or escalation.
//     lines[]       itemised: key, label, amount, basis (the legal citation where there is one), note.
//
// ── PROVENANCE OF THE RATES ────────────────────────────────────────────────────────────────────
// Carried over from js/dashboard/panels/tools/buyer-closing-costs.js and seller-closing-costs.js
// after checking every band against the statute, because "one table was right" is not evidence the
// rest is. The mansion-tax schedule there was correct (all eight bands - unlike the deleted
// SALE-FORM-WITH-TOOLS fork, which was missing three). The buyer calculator had a real defect it did
// not know about: no property type, so it charged NYC mortgage recording tax on CO-OP purchases. A
// co-op loan is a security interest in shares, not a recorded real-property mortgage, so no MRT is
// due. On a $2M co-op at 25% down that is ~$28,875 the buyer does not owe. Fixed here.
//
// These are ESTIMATES for an agent's working conversation, not a closing statement. Rates and
// customs change; the disclaimer travels with every result so it cannot be dropped by a renderer.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

var CrmCalc = (function () {
    'use strict';

    var VERSION = 1;

    var DISCLAIMER =
        'Estimate only, for discussion. Not a closing statement, a commitment to lend, or tax or legal ' +
        'advice. Actual costs depend on the contract, the building and the lender. Confirm with your ' +
        'attorney and accountant. Mallan Real Estate Inc.';

    var PROPERTY_TYPES = ['condo', 'coop', 'townhouse'];

    // ─── Guards — bad input is refused, never turned into a plausible number ──
    function _num(v, fallback) {
        var n = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v;
        return (typeof n === 'number' && isFinite(n)) ? n : fallback;
    }
    function _requirePrice(price) {
        var p = _num(price, NaN);
        if (!isFinite(p) || p <= 0) throw new Error('A sale price greater than zero is required (got ' + price + ').');
        return p;
    }
    function _requirePropertyType(t) {
        var v = String(t || 'condo').toLowerCase();
        if (PROPERTY_TYPES.indexOf(v) === -1) {
            throw new Error('Unknown property type "' + t + '". Expected one of: ' + PROPERTY_TYPES.join(', ') + '.');
        }
        return v;
    }

    function _assume(list, key, label, value, unit, source, note) {
        list.push({ key: key, label: label, value: value, unit: unit || null, source: source, note: note || null });
        return value;
    }
    function _line(list, key, label, amount, basis, note, countsTowardTotal) {
        list.push({
            key: key, label: label, amount: Math.max(0, amount) === amount ? amount : amount,
            basis: basis || null, note: note || null,
            countsTowardTotal: countsTowardTotal === false ? false : true,
        });
    }
    function _sum(lines) {
        return lines.reduce(function (s, l) { return s + (l.countsTowardTotal === false ? 0 : l.amount); }, 0);
    }

    // ─── NYC mansion tax (buyer) — NYS Tax Law §1402-a supplemental tax ──────
    // Eight bands since 2019. Applies to residential including co-ops.
    var MANSION_BANDS = [
        { min: 25000000, rate: 0.0390, label: '3.90%' },
        { min: 20000000, rate: 0.0375, label: '3.75%' },
        { min: 15000000, rate: 0.0350, label: '3.50%' },
        { min: 10000000, rate: 0.0325, label: '3.25%' },
        { min: 5000000, rate: 0.0225, label: '2.25%' },
        { min: 3000000, rate: 0.0150, label: '1.50%' },
        { min: 2000000, rate: 0.0125, label: '1.25%' },
        { min: 1000000, rate: 0.0100, label: '1.00%' },
    ];
    function mansionTaxBand(price) {
        for (var i = 0; i < MANSION_BANDS.length; i++) {
            if (price >= MANSION_BANDS[i].min) return MANSION_BANDS[i];
        }
        return { min: 0, rate: 0, label: 'N/A (under $1M)' };
    }

    // ─── NYC mortgage recording tax (borrower's share) ───────────────────────
    // 1.80% under $500,000; 1.925% at or above. NO MRT on a co-op: the loan is a security interest
    // in shares, not a recorded real-property mortgage.
    function mortgageRecordingTaxRate(loanAmount) {
        return loanAmount < 500000 ? 0.018 : 0.01925;
    }

    // ─── Seller transfer taxes ───────────────────────────────────────────────
    function rpttRate(price) { return price < 500000 ? 0.01 : 0.01425; }          // NYC RPTT, residential
    function nysTransferRate(price) { return price < 3000000 ? 0.004 : 0.0065; }   // NYS, residential $3M+

    function _monthlyPayment(loan, ratePct, termYears) {
        if (loan <= 0 || ratePct <= 0) return 0;
        var r = (ratePct / 100) / 12;
        var n = termYears * 12;
        return loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUYER CLOSING COSTS
    // ═══════════════════════════════════════════════════════════════════════
    function buyerClosingCosts(input) {
        input = input || {};
        var price = _requirePrice(input.price);
        var propertyType = _requirePropertyType(input.propertyType);
        var financing = input.financing !== false && input.financing !== undefined ? !!input.financing : false;

        var A = [];
        var L = [];
        var W = [];

        _assume(A, 'price', 'Purchase price', price, 'USD', 'user');
        _assume(A, 'propertyType', 'Property type', propertyType, null, input.propertyType ? 'user' : 'default');

        var downPct = 0;
        var loan = 0;
        if (financing) {
            downPct = _num(input.downPaymentPct, 20);
            if (downPct < 0 || downPct > 100) throw new Error('Down payment must be between 0 and 100 percent (got ' + input.downPaymentPct + ').');
            _assume(A, 'downPaymentPct', 'Down payment', downPct, '%', input.downPaymentPct === undefined ? 'default' : 'user');
            loan = price * (1 - downPct / 100);
        } else {
            _assume(A, 'financing', 'Financing', false, null, 'user', 'All cash — no loan, so no mortgage recording tax.');
        }

        // Mansion tax
        var band = mansionTaxBand(price);
        _line(L, 'mansionTax', 'NYC Mansion Tax (' + band.label + ')', price * band.rate,
            'NYS Tax Law §1402-a (supplemental tax, 2019 schedule)',
            band.rate === 0 ? 'Not due below $1,000,000.' : null);

        // Mortgage recording tax — with the co-op exemption
        var mrt = 0;
        var mrtNote = null;
        if (!financing) {
            mrtNote = 'No loan, so none is due.';
        } else if (propertyType === 'coop') {
            mrtNote = 'Not due on a co-op: the loan is a security interest in shares, not a recorded real-property mortgage.';
            W.push('Co-op purchase: no NYC mortgage recording tax is due. A condo or townhouse at this loan size would owe about ' +
                Math.round(loan * mortgageRecordingTaxRate(loan)).toLocaleString() + ' USD.');
        } else {
            var mrtRate = mortgageRecordingTaxRate(loan);
            mrt = loan * mrtRate;
            _assume(A, 'mortgageRecordingTaxRate', 'Mortgage recording tax rate', mrtRate * 100, '%', 'statutory',
                loan < 500000 ? 'Borrower share, loans under $500,000.' : 'Borrower share, loans of $500,000 or more.');
        }
        _line(L, 'mortgageRecordingTax', 'NYC Mortgage Recording Tax', mrt,
            'NYC Admin. Code §11-2601 et seq. (borrower share)', mrtNote);

        // Negotiated / service costs — all inputs, all visible
        var attorney = _num(input.attorneyFee, 3500);
        _assume(A, 'attorneyFee', 'Buyer attorney fee', attorney, 'USD', input.attorneyFee === undefined ? 'default' : 'user');
        _line(L, 'attorneyFee', 'Attorney', attorney, null, 'Varies by attorney and deal complexity.');

        if (propertyType !== 'coop') {
            var titleRate = _num(input.titleInsurancePct, 0.45);
            _assume(A, 'titleInsurancePct', 'Title insurance', titleRate, '%', input.titleInsurancePct === undefined ? 'default' : 'user',
                'Rate is filed with NYS DFS and varies by policy and price.');
            _line(L, 'titleInsurance', 'Title insurance', price * (titleRate / 100), null, 'Not applicable to a co-op (shares, not real property).');
        } else {
            _line(L, 'titleInsurance', 'Title insurance', 0, null, 'Not applicable to a co-op.');
        }

        var boardApp = _num(input.boardApplicationFee, propertyType === 'coop' ? 1000 : 500);
        _assume(A, 'boardApplicationFee', 'Board application / processing', boardApp, 'USD', input.boardApplicationFee === undefined ? 'default' : 'user');
        _line(L, 'boardApplicationFee', 'Board application / processing', boardApp, null, null);

        var moveIn = _num(input.moveInFee, 500);
        _assume(A, 'moveInFee', 'Move-in fee / deposit', moveIn, 'USD', input.moveInFee === undefined ? 'default' : 'user');
        _line(L, 'moveInFee', 'Move-in fee', moveIn, null, 'Often refundable — confirm with the building.');

        var misc = _num(input.otherCosts, 0);
        if (misc) { _assume(A, 'otherCosts', 'Other costs', misc, 'USD', 'user'); }
        _line(L, 'otherCosts', 'Other', misc, null, null);

        var closingCosts = _sum(L);
        var downPayment = financing ? price * (downPct / 100) : price;

        // Monthly carrying — reported separately; it is not a closing cost.
        var ratePct = 0;
        var termYears = 30;
        var monthlyMortgage = 0;
        if (financing) {
            ratePct = _num(input.mortgageRatePct, 6.75);
            termYears = _num(input.termYears, 30);
            _assume(A, 'mortgageRatePct', 'Mortgage rate', ratePct, '%', input.mortgageRatePct === undefined ? 'default' : 'user',
                input.mortgageRatePct === undefined ? 'Illustrative only — not a quoted rate or a commitment to lend.' : null);
            _assume(A, 'termYears', 'Loan term', termYears, 'years', input.termYears === undefined ? 'default' : 'user');
            monthlyMortgage = _monthlyPayment(loan, ratePct, termYears);
        }
        var monthlyMaint = _num(input.monthlyMaintenance, 0);
        var monthlyTax = _num(input.monthlyPropertyTax, 0);
        if (monthlyMaint) _assume(A, 'monthlyMaintenance', 'Monthly maintenance / common charges', monthlyMaint, 'USD', 'user');
        if (monthlyTax) _assume(A, 'monthlyPropertyTax', 'Monthly property tax', monthlyTax, 'USD', 'user');

        return {
            calculator: 'buyer-closing-costs',
            version: VERSION,
            inputs: input,
            assumptions: A,
            lines: L,
            totals: {
                closingCosts: closingCosts,
                downPayment: downPayment,
                loanAmount: loan,
                cashRequired: downPayment + closingCosts,
                monthlyMortgage: monthlyMortgage,
                monthlyTotal: monthlyMortgage + monthlyMaint + monthlyTax,
            },
            warnings: W,
            disclaimer: DISCLAIMER,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SELLER CLOSING COSTS
    // ═══════════════════════════════════════════════════════════════════════
    function sellerClosingCosts(input) {
        input = input || {};
        var price = _requirePrice(input.price);
        var propertyType = _requirePropertyType(input.propertyType);

        var A = [];
        var L = [];
        var W = [];

        _assume(A, 'price', 'Sale price', price, 'USD', 'user');
        _assume(A, 'propertyType', 'Property type', propertyType, null, input.propertyType ? 'user' : 'default');

        var rr = rpttRate(price);
        _assume(A, 'rpttRate', 'NYC transfer tax rate', rr * 100, '%', 'statutory',
            price < 500000 ? 'Residential, under $500,000.' : 'Residential, $500,000 or more.');
        _line(L, 'rptt', 'NYC Real Property Transfer Tax (' + (rr * 100).toFixed(3) + '%)', price * rr,
            'NYC Admin. Code §11-2102 (residential rate)', null);

        var nr = nysTransferRate(price);
        _assume(A, 'nysTransferRate', 'NYS transfer tax rate', nr * 100, '%', 'statutory',
            price < 3000000 ? '$2 per $500 of consideration.' : 'Residential conveyance of $3,000,000 or more.');
        _line(L, 'nysTransferTax', 'NYS Transfer Tax (' + (nr * 100).toFixed(2) + '%)', price * nr,
            'NYS Tax Law §1402', null);

        if (propertyType === 'coop') {
            var flipPct = _num(input.flipTaxPct, 0);
            _assume(A, 'flipTaxPct', 'Flip tax', flipPct, '%', input.flipTaxPct === undefined ? 'default' : 'user',
                'Set by the building, not by statute — confirm with the managing agent.');
            _line(L, 'flipTax', 'Flip Tax (co-op)', price * (flipPct / 100), null,
                flipPct === 0 ? 'None entered — many co-ops charge 1–3%.' : 'Building-specific.');
        }

        var attorney = _num(input.attorneyFee, 3000);
        _assume(A, 'attorneyFee', 'Seller attorney fee', attorney, 'USD', input.attorneyFee === undefined ? 'default' : 'user');
        _line(L, 'attorneyFee', 'Attorney', attorney, null, null);

        var other = _num(input.otherCosts, 0);
        if (other) _assume(A, 'otherCosts', 'Other costs', other, 'USD', 'user');
        _line(L, 'otherCosts', 'Other', other, null, null);

        // Mansion tax is statutorily the BUYER's. It appears here only when a deal negotiated it onto
        // the seller, and it is labelled as such so nobody reads it as a standard seller cost.
        var mansionOnSeller = _num(input.mansionTaxPaidBySeller, 0);
        if (mansionOnSeller > 0) {
            var b = mansionTaxBand(price);
            _assume(A, 'mansionTaxPaidBySeller', 'Mansion tax absorbed by seller', mansionOnSeller, 'USD', 'user',
                'Statutorily the buyer\'s tax — include only if the contract shifts it.');
            _line(L, 'mansionTaxNegotiated', 'Mansion Tax absorbed by seller (' + b.label + ')', mansionOnSeller,
                'NYS Tax Law §1402-a — buyer\'s tax unless negotiated', 'Non-standard: only when the contract shifts it.');
        }

        return {
            calculator: 'seller-closing-costs',
            version: VERSION,
            inputs: input,
            assumptions: A,
            lines: L,
            totals: { closingCosts: _sum(L) },
            warnings: W,
            disclaimer: DISCLAIMER,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NET PROCEEDS — the seller side, less the loan
    // ═══════════════════════════════════════════════════════════════════════
    function netProceeds(input) {
        input = input || {};
        var price = _requirePrice(input.price);
        var seller = sellerClosingCosts(input);

        var A = seller.assumptions.slice();
        var L = seller.lines.slice();
        var W = seller.warnings.slice();

        // Commission is ALWAYS an input and ALWAYS reported. The deleted fork hardcoded a 6% haircut
        // (`sellNet = proceeds || (val * 0.94)`) and rendered it as "Sell Now Net" with no disclosure.
        var commissionPct = _num(input.commissionPct, 0);
        _assume(A, 'commissionPct', 'Brokerage commission', commissionPct, '%', input.commissionPct === undefined ? 'default' : 'user');
        _line(L, 'commission', 'Brokerage commission (' + commissionPct + '%)', price * (commissionPct / 100), null,
            'Commissions are not set by law and are fully negotiable.');

        var payoff = _num(input.mortgagePayoff, 0);
        if (payoff) _assume(A, 'mortgagePayoff', 'Mortgage payoff', payoff, 'USD', 'user');

        var sellingCosts = _sum(L);

        return {
            calculator: 'net-proceeds',
            version: VERSION,
            inputs: input,
            assumptions: A,
            lines: L,
            totals: {
                salePrice: price,
                sellingCosts: sellingCosts,
                mortgagePayoff: payoff,
                // Deliberately NOT clamped at zero: an underwater sale must show as negative.
                netProceeds: price - sellingCosts - payoff,
            },
            warnings: W,
            disclaimer: DISCLAIMER,
        };
    }

    return {
        VERSION: VERSION,
        DISCLAIMER: DISCLAIMER,
        PROPERTY_TYPES: PROPERTY_TYPES,
        buyerClosingCosts: buyerClosingCosts,
        sellerClosingCosts: sellerClosingCosts,
        netProceeds: netProceeds,
        // exposed for reports and for the investment/ownership tranches that build on them
        mansionTaxBand: mansionTaxBand,
        mortgageRecordingTaxRate: mortgageRecordingTaxRate,
        rpttRate: rpttRate,
        nysTransferRate: nysTransferRate,
        monthlyPayment: _monthlyPayment,
    };
})();

if (typeof window !== 'undefined') window.CrmCalc = CrmCalc;
if (typeof module !== 'undefined' && module.exports) module.exports = CrmCalc;
