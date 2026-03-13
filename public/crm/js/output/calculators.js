// ═══════════════════════════════════════════════════════════
// FINANCIAL CALCULATORS — Agent tools for listing analysis
// Cash on Cash, Closing Costs, Buy vs Sell, Rent vs Buy, ROI, Mortgage
// ═══════════════════════════════════════════════════════════

// ── NYC Tax Tables ──────────────────────────────────────────

var MANSION_TAX_RATES = [
    { min: 1000000, max: 1999999, rate: 0.01 },
    { min: 2000000, max: 2999999, rate: 0.0125 },
    { min: 3000000, max: 4999999, rate: 0.015 },
    { min: 5000000, max: 9999999, rate: 0.025 },
    { min: 10000000, max: 14999999, rate: 0.0325 },
    { min: 15000000, max: 19999999, rate: 0.035 },
    { min: 20000000, max: 24999999, rate: 0.0375 },
    { min: 25000000, max: Infinity, rate: 0.039 }
];

function getMansionTax(price) {
    if (price < 1000000) return 0;
    for (var i = 0; i < MANSION_TAX_RATES.length; i++) {
        if (price >= MANSION_TAX_RATES[i].min && price <= MANSION_TAX_RATES[i].max) {
            return price * MANSION_TAX_RATES[i].rate;
        }
    }
    return 0;
}

function getNYCTransferTax(price) {
    return price < 500000 ? price * 0.01 : price * 0.01425;
}

function getNYSTransferTax(price) {
    return price < 3000000 ? price * 0.004 : price * 0.0065;
}

function getMortgageRecordingTax(loanAmt, isCoop) {
    if (isCoop) return 0;
    return loanAmt < 500000 ? loanAmt * 0.018 : loanAmt * 0.01925;
}

function monthlyMortgagePayment(principal, annualRate, years) {
    if (!principal || !annualRate || !years) return 0;
    var r = annualRate / 100 / 12;
    var n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ── Calculator State ────────────────────────────────────────

var _calcListingId = null;

function getCalcListing() {
    if (!_calcListingId || typeof window.allListings === 'undefined') return null;
    return window.allListings.find(function(l) { return l.id === _calcListingId; }) || null;
}

function calcVal(id) {
    var el = document.getElementById(id);
    return el ? (parseFloat(el.value.replace(/[,$]/g, '')) || 0) : 0;
}

function calcSet(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = typeof val === 'number' ? (val < 0 ? '-$' + Math.abs(val).toLocaleString(undefined, {maximumFractionDigits: 0}) : '$' + val.toLocaleString(undefined, {maximumFractionDigits: 0})) : val;
}

function calcSetPct(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val.toFixed(1) + '%';
}

// ── Open Calculator Modal ───────────────────────────────────

function openCalculatorModal(tab, listingId) {
    _calcListingId = listingId;
    var existing = document.getElementById('calculatorModal');
    if (existing) existing.remove();

    var listing = getCalcListing();
    var price = listing ? (listing.price || 0) : 0;
    var maintCC = listing ? (listing.maintCC || listing.maintenance || 0) : 0;
    var taxes = listing ? (listing.taxes || listing.reTaxes || 0) : 0;
    var propType = listing ? (listing.propertyType || listing.subType || '') : '';
    var isCoop = propType.toLowerCase().indexOf('co-op') !== -1 || propType.toLowerCase().indexOf('coop') !== -1;

    var modal = document.createElement('div');
    modal.id = 'calculatorModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-start justify-center pt-8 pb-8 overflow-y-auto';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };

    modal.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl w-full max-w-[800px] mx-4 flex flex-col max-h-[90vh]" onclick="event.stopPropagation()">'
        + '<div class="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">'
        + '<h2 class="text-lg font-bold text-gray-900"><i class="fas fa-calculator text-[#B8860B] mr-2"></i>Financial Calculators</h2>'
        + '<button onclick="document.getElementById(\'calculatorModal\').remove()" class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"><i class="fas fa-times text-gray-500"></i></button>'
        + '</div>'
        // Tab bar
        + '<div class="border-b px-4 overflow-x-auto">'
        + '<div class="flex gap-1 min-w-max">'
        + '<button onclick="switchCalcTab(\'mortgage\')" id="calcTabMortgage" class="calc-tab px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 border-transparent hover:bg-gray-50 whitespace-nowrap"><i class="fas fa-home mr-1"></i> Mortgage</button>'
        + '<button onclick="switchCalcTab(\'closing\')" id="calcTabClosing" class="calc-tab px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 border-transparent hover:bg-gray-50 whitespace-nowrap"><i class="fas fa-receipt mr-1"></i> Closing Costs</button>'
        + '<button onclick="switchCalcTab(\'cashoncash\')" id="calcTabCashoncash" class="calc-tab px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 border-transparent hover:bg-gray-50 whitespace-nowrap"><i class="fas fa-hand-holding-dollar mr-1"></i> Cash on Cash</button>'
        + '<button onclick="switchCalcTab(\'roi\')" id="calcTabRoi" class="calc-tab px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 border-transparent hover:bg-gray-50 whitespace-nowrap"><i class="fas fa-chart-line mr-1"></i> ROI</button>'
        + '<button onclick="switchCalcTab(\'rentvsbuy\')" id="calcTabRentvsbuy" class="calc-tab px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 border-transparent hover:bg-gray-50 whitespace-nowrap"><i class="fas fa-scale-balanced mr-1"></i> Rent vs Buy</button>'
        + '<button onclick="switchCalcTab(\'buyvssell\')" id="calcTabBuyvssell" class="calc-tab px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 border-transparent hover:bg-gray-50 whitespace-nowrap"><i class="fas fa-house-chimney mr-1"></i> Buy vs Sell</button>'
        + '</div></div>'
        // Tab Panels
        + '<div class="flex-1 overflow-y-auto p-6">'
        + buildMortgagePanel(price, maintCC, taxes)
        + buildClosingPanel(price, isCoop)
        + buildCashOnCashPanel(price, maintCC, taxes)
        + buildROIPanel(price, maintCC, taxes)
        + buildRentVsBuyPanel(price, maintCC, taxes)
        + buildBuyVsSellPanel(price)
        + '</div>'
        // Footer
        + '<div class="sticky bottom-0 bg-white border-t px-6 py-3 flex justify-between items-center rounded-b-2xl">'
        + '<p class="text-[10px] text-gray-400">Estimates only. Consult a financial advisor for actual figures.</p>'
        + '<div class="flex gap-2">'
        + '<button onclick="printCurrentCalc()" class="px-3 py-1.5 border rounded-lg text-xs font-semibold hover:bg-gray-50"><i class="fas fa-print mr-1"></i> Print</button>'
        + '<button onclick="emailCurrentCalc()" class="px-3 py-1.5 bg-[#B8860B] text-white rounded-lg text-xs font-semibold hover:bg-[#9A7209]"><i class="fas fa-envelope mr-1"></i> Email to Client</button>'
        + '</div></div></div>';

    document.body.appendChild(modal);
    switchCalcTab(tab || 'mortgage');
}

function switchCalcTab(tab) {
    document.querySelectorAll('.calc-tab').forEach(function(t) {
        t.classList.remove('border-[#B8860B]', 'text-[#B8860B]');
        t.classList.add('border-transparent');
    });
    document.querySelectorAll('.calc-panel').forEach(function(p) { p.classList.add('hidden'); });
    var tabBtn = document.getElementById('calcTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (tabBtn) { tabBtn.classList.add('border-[#B8860B]', 'text-[#B8860B]'); tabBtn.classList.remove('border-transparent'); }
    var panel = document.getElementById('calcPanel' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (panel) panel.classList.remove('hidden');
}

// ── Input Helper ────────────────────────────────────────────

function calcInput(id, label, value, prefix, suffix) {
    var pre = prefix ? '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">' + prefix + '</span>' : '';
    var suf = suffix ? '<span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">' + suffix + '</span>' : '';
    var pl = prefix ? 'pl-7' : '';
    var pr = suffix ? 'pr-8' : '';
    return '<div><label class="block text-xs font-semibold text-gray-600 mb-1">' + label + '</label>'
        + '<div class="relative">' + pre
        + '<input type="text" id="' + id + '" value="' + (value || '') + '" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ' + pl + ' ' + pr + '" oninput="recalcCurrentTab()">'
        + suf + '</div></div>';
}

function resultRow(label, id, bold, color) {
    var cls = bold ? 'font-bold text-base' : 'text-sm';
    var clr = color || (bold ? '#B8860B' : '#1a1a1a');
    return '<div class="flex justify-between items-center py-1.5 ' + (bold ? 'border-t-2 border-gray-200 pt-3 mt-2' : 'border-b border-gray-50') + '">'
        + '<span class="text-gray-600 text-sm">' + label + '</span>'
        + '<span id="' + id + '" class="' + cls + '" style="color:' + clr + '">$0</span></div>';
}

// ── Panel 1: Mortgage / Monthly Cost Calculator ─────────────

function buildMortgagePanel(price, maintCC, taxes) {
    return '<div id="calcPanelMortgage" class="calc-panel hidden">'
        + '<h3 class="text-base font-bold text-gray-900 mb-1"><i class="fas fa-home text-[#B8860B] mr-2"></i>Mortgage & Monthly Cost Calculator</h3>'
        + '<p class="text-xs text-gray-500 mb-4">See the full monthly cost of owning this property.</p>'
        + '<div class="grid grid-cols-2 gap-3 mb-4">'
        + calcInput('mtgPrice', 'Purchase Price', price, '$')
        + calcInput('mtgDown', 'Down Payment %', '20', '', '%')
        + calcInput('mtgRate', 'Interest Rate', '6.75', '', '%')
        + calcInput('mtgTerm', 'Loan Term (years)', '30')
        + calcInput('mtgMaint', 'Maintenance / CC', maintCC, '$', '/mo')
        + calcInput('mtgTax', 'Property Tax', taxes, '$', '/mo')
        + calcInput('mtgInsurance', 'Insurance', '300', '$', '/mo')
        + calcInput('mtgOther', 'Other Monthly', '0', '$', '/mo')
        + '</div>'
        + '<div class="bg-gray-50 rounded-xl p-4 space-y-1">'
        + '<div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Monthly Breakdown</div>'
        + resultRow('Mortgage Payment (P&I)', 'mtgResultPI')
        + resultRow('Maintenance / CC', 'mtgResultMaint')
        + resultRow('Property Tax', 'mtgResultTax')
        + resultRow('Insurance', 'mtgResultIns')
        + resultRow('Other', 'mtgResultOther')
        + resultRow('TOTAL MONTHLY COST', 'mtgResultTotal', true)
        + '<div class="mt-3 pt-2 border-t border-gray-200">'
        + resultRow('Down Payment Amount', 'mtgResultDown')
        + resultRow('Loan Amount', 'mtgResultLoan')
        + resultRow('Total Interest (over term)', 'mtgResultInterest')
        + '</div></div></div>';
}

function calcMortgage() {
    var price = calcVal('mtgPrice');
    var downPct = calcVal('mtgDown') / 100;
    var rate = calcVal('mtgRate');
    var term = calcVal('mtgTerm');
    var maint = calcVal('mtgMaint');
    var tax = calcVal('mtgTax');
    var ins = calcVal('mtgInsurance');
    var other = calcVal('mtgOther');

    var downAmt = price * downPct;
    var loanAmt = price - downAmt;
    var monthlyPI = monthlyMortgagePayment(loanAmt, rate, term);
    var totalMonthly = monthlyPI + maint + tax + ins + other;
    var totalInterest = (monthlyPI * term * 12) - loanAmt;

    calcSet('mtgResultPI', monthlyPI);
    calcSet('mtgResultMaint', maint);
    calcSet('mtgResultTax', tax);
    calcSet('mtgResultIns', ins);
    calcSet('mtgResultOther', other);
    calcSet('mtgResultTotal', totalMonthly);
    calcSet('mtgResultDown', downAmt);
    calcSet('mtgResultLoan', loanAmt);
    calcSet('mtgResultInterest', totalInterest > 0 ? totalInterest : 0);
}

// ── Panel 2: Closing Costs Calculator ───────────────────────

function buildClosingPanel(price, isCoop) {
    return '<div id="calcPanelClosing" class="calc-panel hidden">'
        + '<h3 class="text-base font-bold text-gray-900 mb-1"><i class="fas fa-receipt text-[#B8860B] mr-2"></i>Closing Cost Calculator</h3>'
        + '<p class="text-xs text-gray-500 mb-4">Estimate buyer or seller closing costs in NYC.</p>'
        + '<div class="flex gap-2 mb-4">'
        + '<button onclick="switchClosingRole(\'buyer\')" id="closingRoleBuyer" class="px-4 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-semibold">Buyer</button>'
        + '<button onclick="switchClosingRole(\'seller\')" id="closingRoleSeller" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50">Seller</button>'
        + '</div>'
        + '<div class="grid grid-cols-2 gap-3 mb-4">'
        + calcInput('ccPrice', 'Purchase Price', price, '$')
        + '<div><label class="block text-xs font-semibold text-gray-600 mb-1">Property Type</label>'
        + '<select id="ccPropType" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" onchange="recalcCurrentTab()">'
        + '<option value="coop"' + (isCoop ? ' selected' : '') + '>Co-op</option>'
        + '<option value="condo"' + (!isCoop ? ' selected' : '') + '>Condo</option>'
        + '<option value="townhouse">Townhouse</option>'
        + '</select></div>'
        + '<div><label class="block text-xs font-semibold text-gray-600 mb-1">New Development?</label>'
        + '<select id="ccNewDev" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" onchange="recalcCurrentTab()">'
        + '<option value="no">No</option><option value="yes">Yes</option></select></div>'
        + calcInput('ccDownPct', 'Down Payment %', '20', '', '%')
        + '</div>'
        + '<div class="bg-gray-50 rounded-xl p-4 space-y-1" id="closingCostResults">'
        + '<div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2" id="closingResultsTitle">Buyer Closing Costs</div>'
        + '<div id="closingLineItems"></div>'
        + resultRow('TOTAL CLOSING COSTS', 'ccTotal', true)
        + '<div id="ccPctLine" class="text-xs text-gray-500 text-right mt-1"></div>'
        + '</div></div>';
}

var _closingRole = 'buyer';

function switchClosingRole(role) {
    _closingRole = role;
    document.getElementById('closingRoleBuyer').className = role === 'buyer' ? 'px-4 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-semibold' : 'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50';
    document.getElementById('closingRoleSeller').className = role === 'seller' ? 'px-4 py-2 bg-[#B8860B] text-white rounded-lg text-sm font-semibold' : 'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50';
    recalcCurrentTab();
}

function calcClosing() {
    var price = calcVal('ccPrice');
    var propType = document.getElementById('ccPropType').value;
    var newDev = document.getElementById('ccNewDev').value === 'yes';
    var downPct = calcVal('ccDownPct') / 100;
    var loanAmt = price * (1 - downPct);
    var isCoop = propType === 'coop';
    var isCondo = propType === 'condo';

    var items = [];
    var total = 0;

    if (_closingRole === 'buyer') {
        document.getElementById('closingResultsTitle').textContent = 'Buyer Closing Costs';
        // Mansion Tax
        var mansion = getMansionTax(price);
        if (mansion > 0) items.push(['Mansion Tax (' + (MANSION_TAX_RATES.find(function(r){ return price >= r.min && price <= r.max; }) || {rate:0}).rate * 100 + '%)', mansion]);
        // Title Insurance (not for co-ops)
        if (!isCoop) items.push(['Title Insurance', Math.round(price * 0.004) > 2000 ? Math.round(price * 0.004) : 3500]);
        // Attorney
        items.push(['Attorney Fee', 3500]);
        // Recording (not co-op)
        if (!isCoop) items.push(['Recording Fees', 750]);
        // Lien Search
        items.push(['Lien Search / UCC', isCoop ? 500 : 350]);
        // Co-op specifics
        if (isCoop) {
            items.push(['Board Application Fee', 500]);
            items.push(['Move-in Deposit', 1000]);
        }
        // Condo specifics
        if (isCondo) {
            items.push(['Move-in Fee', 500]);
        }
        // Mortgage Recording Tax (not co-op)
        if (loanAmt > 0) {
            var mortRecTax = getMortgageRecordingTax(loanAmt, isCoop);
            if (mortRecTax > 0) items.push(['Mortgage Recording Tax', mortRecTax]);
        }
        // Bank attorney
        if (loanAmt > 0) items.push(['Bank Attorney', 1000]);
        // Appraisal
        if (loanAmt > 0) items.push(['Appraisal', 750]);
        // New dev: buyer pays transfer taxes
        if (newDev) {
            items.push(['NYC Transfer Tax (sponsor)', getNYCTransferTax(price)]);
            items.push(['NYS Transfer Tax (sponsor)', getNYSTransferTax(price)]);
        }
    } else {
        document.getElementById('closingResultsTitle').textContent = 'Seller Closing Costs';
        // NYC Transfer Tax
        items.push(['NYC Transfer Tax (' + (price < 500000 ? '1%' : '1.425%') + ')', getNYCTransferTax(price)]);
        // NYS Transfer Tax
        items.push(['NYS Transfer Tax (' + (price < 3000000 ? '0.4%' : '0.65%') + ')', getNYSTransferTax(price)]);
        // Attorney
        items.push(['Attorney Fee', 3500]);
        // Broker commission (standard)
        items.push(['Broker Commission (est. 5%)', price * 0.05]);
        // Co-op flip tax
        if (isCoop) items.push(['Flip Tax (est. 2%)', price * 0.02]);
        // Move-out
        items.push(['Move-out Fee / Deposit', 500]);
        // Payoff fees
        items.push(['Mortgage Payoff / Recording', 500]);
    }

    var lineItemsHTML = '';
    items.forEach(function(item) {
        total += item[1];
        lineItemsHTML += '<div class="flex justify-between items-center py-1.5 border-b border-gray-100">'
            + '<span class="text-gray-600 text-sm">' + item[0] + '</span>'
            + '<span class="text-sm font-semibold">$' + Math.round(item[1]).toLocaleString() + '</span></div>';
    });

    document.getElementById('closingLineItems').innerHTML = lineItemsHTML;
    calcSet('ccTotal', Math.round(total));
    document.getElementById('ccPctLine').textContent = price > 0 ? '(' + (total / price * 100).toFixed(2) + '% of purchase price)' : '';
}

// ── Panel 3: Cash on Cash Return ────────────────────────────

function buildCashOnCashPanel(price, maintCC, taxes) {
    return '<div id="calcPanelCashoncash" class="calc-panel hidden">'
        + '<h3 class="text-base font-bold text-gray-900 mb-1"><i class="fas fa-hand-holding-dollar text-[#B8860B] mr-2"></i>Cash on Cash Return Calculator</h3>'
        + '<p class="text-xs text-gray-500 mb-4">Annual pre-tax cash return as % of total cash invested.</p>'
        + '<div class="grid grid-cols-2 gap-3 mb-4">'
        + calcInput('cocPrice', 'Purchase Price', price, '$')
        + calcInput('cocDown', 'Down Payment %', '20', '', '%')
        + calcInput('cocClosing', 'Closing Costs %', '3', '', '%')
        + calcInput('cocReno', 'Renovation', '0', '$')
        + calcInput('cocRent', 'Monthly Rent', '', '$', '/mo')
        + calcInput('cocVacancy', 'Vacancy Rate %', '5', '', '%')
        + calcInput('cocRate', 'Mortgage Rate %', '6.75', '', '%')
        + calcInput('cocTerm', 'Loan Term', '30', '', 'yrs')
        + calcInput('cocTax', 'Annual Property Tax', taxes ? taxes * 12 : '', '$', '/yr')
        + calcInput('cocInsurance', 'Annual Insurance', '3600', '$', '/yr')
        + calcInput('cocMaint', 'Annual Maint/CC', maintCC ? maintCC * 12 : '', '$', '/yr')
        + calcInput('cocMgmt', 'Management Fee %', '8', '', '%')
        + '</div>'
        + '<div class="bg-gray-50 rounded-xl p-4 space-y-1">'
        + '<div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Results</div>'
        + resultRow('Total Cash Invested', 'cocInvested')
        + resultRow('Effective Gross Income', 'cocGross')
        + resultRow('Total Annual Expenses', 'cocExpenses')
        + resultRow('Annual Mortgage Payment', 'cocMortgage')
        + resultRow('Annual Cash Flow', 'cocCashFlow', true)
        + '<div class="flex justify-between items-center py-2 border-t-2 border-gray-200 mt-2 pt-3">'
        + '<span class="text-gray-800 font-bold">Cash on Cash Return</span>'
        + '<span id="cocReturn" class="text-xl font-bold text-[#B8860B]">0.0%</span></div>'
        + '</div></div>';
}

function calcCashOnCash() {
    var price = calcVal('cocPrice');
    var downPct = calcVal('cocDown') / 100;
    var closingPct = calcVal('cocClosing') / 100;
    var reno = calcVal('cocReno');
    var rent = calcVal('cocRent');
    var vacancyPct = calcVal('cocVacancy') / 100;
    var rate = calcVal('cocRate');
    var term = calcVal('cocTerm');
    var annualTax = calcVal('cocTax');
    var annualIns = calcVal('cocInsurance');
    var annualMaint = calcVal('cocMaint');
    var mgmtPct = calcVal('cocMgmt') / 100;

    var downAmt = price * downPct;
    var closingAmt = price * closingPct;
    var totalInvested = downAmt + closingAmt + reno;
    var loanAmt = price - downAmt;
    var annualGross = rent * 12;
    var vacancyLoss = annualGross * vacancyPct;
    var effectiveGross = annualGross - vacancyLoss;
    var mgmtFee = effectiveGross * mgmtPct;
    var totalExpenses = annualTax + annualIns + annualMaint + mgmtFee;
    var annualMortgage = monthlyMortgagePayment(loanAmt, rate, term) * 12;
    var cashFlow = effectiveGross - totalExpenses - annualMortgage;
    var cocReturn = totalInvested > 0 ? (cashFlow / totalInvested * 100) : 0;

    calcSet('cocInvested', totalInvested);
    calcSet('cocGross', effectiveGross);
    calcSet('cocExpenses', totalExpenses);
    calcSet('cocMortgage', annualMortgage);
    calcSet('cocCashFlow', cashFlow);
    calcSetPct('cocReturn', cocReturn);
}

// ── Panel 4: ROI Calculator ─────────────────────────────────

function buildROIPanel(price, maintCC, taxes) {
    return '<div id="calcPanelRoi" class="calc-panel hidden">'
        + '<h3 class="text-base font-bold text-gray-900 mb-1"><i class="fas fa-chart-line text-[#B8860B] mr-2"></i>ROI Calculator</h3>'
        + '<p class="text-xs text-gray-500 mb-4">Return on investment with 5-year projection.</p>'
        + '<div class="grid grid-cols-2 gap-3 mb-4">'
        + calcInput('roiPrice', 'Purchase Price', price, '$')
        + calcInput('roiDown', 'Down Payment %', '20', '', '%')
        + calcInput('roiClosing', 'Closing Costs', '75000', '$')
        + calcInput('roiReno', 'Renovation', '0', '$')
        + calcInput('roiRent', 'Annual Gross Rent', '', '$', '/yr')
        + calcInput('roiVacancy', 'Vacancy %', '5', '', '%')
        + calcInput('roiTax', 'Annual Property Tax', taxes ? taxes * 12 : '', '$')
        + calcInput('roiInsurance', 'Annual Insurance', '3600', '$')
        + calcInput('roiMaint', 'Annual Maintenance', maintCC ? maintCC * 12 : '', '$')
        + calcInput('roiMgmt', 'Management %', '8', '', '%')
        + calcInput('roiRate', 'Mortgage Rate %', '6.75', '', '%')
        + calcInput('roiAppreciation', 'Annual Appreciation %', '3', '', '%')
        + '</div>'
        + '<div class="bg-gray-50 rounded-xl p-4 space-y-1">'
        + '<div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Results</div>'
        + resultRow('Total Investment', 'roiInvestment')
        + resultRow('Net Operating Income (NOI)', 'roiNOI')
        + '<div class="flex justify-between items-center py-1.5 border-b border-gray-100"><span class="text-gray-600 text-sm">Cap Rate</span><span id="roiCapRate" class="text-sm font-semibold">0.0%</span></div>'
        + resultRow('Annual Mortgage', 'roiMortgageAmt')
        + resultRow('Annual Cash Flow', 'roiCashFlow')
        + '<div class="border-t-2 border-gray-200 mt-3 pt-3">'
        + '<div class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">5-Year Projection</div>'
        + resultRow('Property Value (Yr 5)', 'roiValue5')
        + resultRow('Equity Gain', 'roiEquity5')
        + resultRow('Cumulative Cash Flow', 'roiCumCash5')
        + '<div class="flex justify-between items-center py-2 border-t border-gray-200 mt-2 pt-3">'
        + '<span class="text-gray-800 font-bold">Total 5yr ROI</span>'
        + '<span id="roiTotal5" class="text-xl font-bold text-[#B8860B]">0.0%</span></div>'
        + '<div class="flex justify-between items-center py-1"><span class="text-gray-600 text-sm">Annualized ROI</span><span id="roiAnnual5" class="text-sm font-semibold">0.0%</span></div>'
        + '</div></div></div>';
}

function calcROI() {
    var price = calcVal('roiPrice');
    var downPct = calcVal('roiDown') / 100;
    var closing = calcVal('roiClosing');
    var reno = calcVal('roiReno');
    var annualRent = calcVal('roiRent');
    var vacancyPct = calcVal('roiVacancy') / 100;
    var annualTax = calcVal('roiTax');
    var annualIns = calcVal('roiInsurance');
    var annualMaint = calcVal('roiMaint');
    var mgmtPct = calcVal('roiMgmt') / 100;
    var rate = calcVal('roiRate');
    var appreciation = calcVal('roiAppreciation') / 100;

    var downAmt = price * downPct;
    var totalInvestment = downAmt + closing + reno;
    var loanAmt = price - downAmt;
    var effectiveRent = annualRent * (1 - vacancyPct);
    var mgmtFee = effectiveRent * mgmtPct;
    var totalExp = annualTax + annualIns + annualMaint + mgmtFee;
    var noi = effectiveRent - totalExp;
    var capRate = price > 0 ? (noi / price * 100) : 0;
    var annualMortgage = monthlyMortgagePayment(loanAmt, rate, 30) * 12;
    var cashFlow = noi - annualMortgage;

    // 5 year
    var value5 = price * Math.pow(1 + appreciation, 5);
    var equityGain = value5 - price;
    var cumCash = cashFlow * 5;
    var totalReturn = equityGain + cumCash;
    var roi5 = totalInvestment > 0 ? (totalReturn / totalInvestment * 100) : 0;
    var annualROI = totalInvestment > 0 ? (Math.pow(1 + totalReturn / totalInvestment, 1/5) - 1) * 100 : 0;

    calcSet('roiInvestment', totalInvestment);
    calcSet('roiNOI', noi);
    document.getElementById('roiCapRate').textContent = capRate.toFixed(1) + '%';
    calcSet('roiMortgageAmt', annualMortgage);
    calcSet('roiCashFlow', cashFlow);
    calcSet('roiValue5', value5);
    calcSet('roiEquity5', equityGain);
    calcSet('roiCumCash5', cumCash);
    document.getElementById('roiTotal5').textContent = (roi5 >= 0 ? '+' : '') + roi5.toFixed(1) + '%';
    document.getElementById('roiAnnual5').textContent = (annualROI >= 0 ? '+' : '') + annualROI.toFixed(1) + '%';
}

// ── Panel 5: Rent vs Buy ────────────────────────────────────

function buildRentVsBuyPanel(price, maintCC, taxes) {
    return '<div id="calcPanelRentvsbuy" class="calc-panel hidden">'
        + '<h3 class="text-base font-bold text-gray-900 mb-1"><i class="fas fa-scale-balanced text-[#B8860B] mr-2"></i>Rent vs Buy Comparison</h3>'
        + '<p class="text-xs text-gray-500 mb-4">Compare the cost of renting vs buying over time.</p>'
        + '<div class="grid grid-cols-2 gap-4 mb-4">'
        + '<div class="space-y-3"><div class="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Buying</div>'
        + calcInput('rvbPrice', 'Purchase Price', price, '$')
        + calcInput('rvbDown', 'Down Payment %', '20', '', '%')
        + calcInput('rvbRate', 'Mortgage Rate %', '6.75', '', '%')
        + calcInput('rvbTerm', 'Loan Term', '30', '', 'yrs')
        + calcInput('rvbMaint', 'Monthly Maint/CC', maintCC || '', '$')
        + calcInput('rvbTax', 'Monthly Tax', taxes || '', '$')
        + calcInput('rvbBuyIns', 'Monthly Insurance', '300', '$')
        + calcInput('rvbAppreciation', 'Annual Appreciation %', '3', '', '%')
        + '</div>'
        + '<div class="space-y-3"><div class="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Renting</div>'
        + calcInput('rvbRent', 'Monthly Rent', '', '$')
        + calcInput('rvbRentIns', "Renter's Insurance", '50', '$', '/mo')
        + calcInput('rvbRentIncrease', 'Annual Rent Increase %', '3', '', '%')
        + calcInput('rvbInvestReturn', 'Investment Return % (if renting)', '7', '', '%')
        + calcInput('rvbYears', 'Comparison Period', '10', '', 'years')
        + '</div></div>'
        + '<div class="bg-gray-50 rounded-xl p-4 space-y-1">'
        + '<div class="grid grid-cols-2 gap-4 mb-3">'
        + '<div class="text-center"><div class="text-xs font-bold text-blue-600 uppercase">Buying</div>'
        + '<div id="rvbBuyMonthly" class="text-lg font-bold text-gray-900">$0/mo</div><div class="text-[10px] text-gray-500">Monthly cost</div></div>'
        + '<div class="text-center"><div class="text-xs font-bold text-green-600 uppercase">Renting</div>'
        + '<div id="rvbRentMonthly" class="text-lg font-bold text-gray-900">$0/mo</div><div class="text-[10px] text-gray-500">Monthly cost</div></div></div>'
        + '<div class="border-t pt-3">'
        + resultRow('Total Cost of Buying', 'rvbTotalBuy')
        + resultRow('Equity Built', 'rvbEquity')
        + resultRow('Appreciation', 'rvbAppreciationAmt')
        + resultRow('Net Cost of Buying', 'rvbNetBuy', false, '#2563eb')
        + '<div class="h-2"></div>'
        + resultRow('Total Cost of Renting', 'rvbTotalRent')
        + resultRow('Investment Returns', 'rvbInvestGain')
        + resultRow('Net Cost of Renting', 'rvbNetRent', false, '#16a34a')
        + '</div>'
        + '<div class="mt-3 pt-3 border-t-2 border-gray-200 text-center">'
        + '<div id="rvbVerdict" class="text-base font-bold text-[#B8860B]"></div>'
        + '</div></div></div>';
}

function calcRentVsBuy() {
    var price = calcVal('rvbPrice');
    var downPct = calcVal('rvbDown') / 100;
    var rate = calcVal('rvbRate');
    var term = calcVal('rvbTerm');
    var maint = calcVal('rvbMaint');
    var tax = calcVal('rvbTax');
    var buyIns = calcVal('rvbBuyIns');
    var appreciation = calcVal('rvbAppreciation') / 100;
    var rent = calcVal('rvbRent');
    var rentIns = calcVal('rvbRentIns');
    var rentIncrease = calcVal('rvbRentIncrease') / 100;
    var investReturn = calcVal('rvbInvestReturn') / 100;
    var years = calcVal('rvbYears') || 10;

    var downAmt = price * downPct;
    var loanAmt = price - downAmt;
    var monthlyPI = monthlyMortgagePayment(loanAmt, rate, term);
    var buyMonthly = monthlyPI + maint + tax + buyIns;
    var rentMonthly = rent + rentIns;

    // Calculate over years
    var totalBuyCost = 0;
    var totalRentCost = 0;
    var currentRent = rent + rentIns;
    for (var y = 0; y < years; y++) {
        totalBuyCost += buyMonthly * 12;
        totalRentCost += currentRent * 12;
        currentRent *= (1 + rentIncrease);
    }

    // Equity: approximate principal paid
    var balance = loanAmt;
    var monthlyRate = rate / 100 / 12;
    for (var m = 0; m < years * 12; m++) {
        var interest = balance * monthlyRate;
        var principalPaid = monthlyPI - interest;
        balance -= principalPaid;
    }
    var equityBuilt = loanAmt - Math.max(0, balance);
    var appreciationAmt = price * (Math.pow(1 + appreciation, years) - 1);
    var netBuy = totalBuyCost - equityBuilt - appreciationAmt;

    // Investment return on down payment if renting
    var investGain = downAmt * (Math.pow(1 + investReturn, years) - 1);
    var netRent = totalRentCost - investGain;

    document.getElementById('rvbBuyMonthly').textContent = '$' + Math.round(buyMonthly).toLocaleString() + '/mo';
    document.getElementById('rvbRentMonthly').textContent = '$' + Math.round(rentMonthly).toLocaleString() + '/mo';
    calcSet('rvbTotalBuy', totalBuyCost);
    calcSet('rvbEquity', equityBuilt);
    calcSet('rvbAppreciationAmt', appreciationAmt);
    calcSet('rvbNetBuy', netBuy);
    calcSet('rvbTotalRent', totalRentCost);
    calcSet('rvbInvestGain', investGain);
    calcSet('rvbNetRent', netRent);

    var diff = Math.abs(netBuy - netRent);
    var verdict = netBuy < netRent
        ? 'BUYING saves $' + Math.round(diff).toLocaleString() + ' over ' + years + ' years'
        : 'RENTING saves $' + Math.round(diff).toLocaleString() + ' over ' + years + ' years';
    document.getElementById('rvbVerdict').textContent = verdict;
}

// ── Panel 6: Buy vs Sell Analysis ───────────────────────────

function buildBuyVsSellPanel(price) {
    return '<div id="calcPanelBuyvssell" class="calc-panel hidden">'
        + '<h3 class="text-base font-bold text-gray-900 mb-1"><i class="fas fa-house-chimney text-[#B8860B] mr-2"></i>Buy vs Sell Analysis</h3>'
        + '<p class="text-xs text-gray-500 mb-4">Should the client sell now or hold longer?</p>'
        + '<div class="grid grid-cols-2 gap-3 mb-4">'
        + calcInput('bvsCurrentValue', 'Current Property Value', price, '$')
        + calcInput('bvsOriginalPrice', 'Original Purchase Price', '', '$')
        + calcInput('bvsYearsOwned', 'Years Owned', '', '')
        + calcInput('bvsMortgageBalance', 'Current Mortgage Balance', '', '$')
        + calcInput('bvsMonthlyExpenses', 'Monthly Expenses', '', '$', '/mo')
        + calcInput('bvsAppreciation', 'Expected Appreciation %', '3', '', '%')
        + calcInput('bvsClosingPct', 'Selling Closing Costs %', '5.5', '', '%')
        + calcInput('bvsHoldYears', 'Hold How Many More Years?', '3', '', 'yrs')
        + '</div>'
        + '<div class="bg-gray-50 rounded-xl p-4">'
        + '<div class="grid grid-cols-2 gap-6">'
        + '<div><div class="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">Sell Now</div>'
        + resultRow('Sale Price', 'bvsSellPrice')
        + resultRow('Less Closing Costs', 'bvsSellClosing')
        + resultRow('Less Mortgage Payoff', 'bvsSellMortgage')
        + resultRow('Net Proceeds', 'bvsSellNet', true)
        + resultRow('Total Return', 'bvsSellReturn')
        + '<div class="flex justify-between items-center py-1"><span class="text-gray-600 text-sm">Annualized Return</span><span id="bvsSellAnnual" class="text-sm font-semibold">0.0%</span></div>'
        + '</div>'
        + '<div><div class="text-xs font-bold text-green-600 uppercase tracking-wider mb-3">Hold ' + '<span id="bvsHoldLabel">3</span>' + ' More Years</div>'
        + resultRow('Projected Value', 'bvsHoldValue')
        + resultRow('Less Closing Costs', 'bvsHoldClosing')
        + resultRow('Less Mortgage Payoff', 'bvsHoldMortgage')
        + resultRow('Less Expenses', 'bvsHoldExpenses')
        + resultRow('Net Proceeds', 'bvsHoldNet', true)
        + resultRow('Total Return', 'bvsHoldReturn')
        + '<div class="flex justify-between items-center py-1"><span class="text-gray-600 text-sm">Annualized Return</span><span id="bvsHoldAnnual" class="text-sm font-semibold">0.0%</span></div>'
        + '</div></div></div></div>';
}

function calcBuyVsSell() {
    var currentValue = calcVal('bvsCurrentValue');
    var originalPrice = calcVal('bvsOriginalPrice');
    var yearsOwned = calcVal('bvsYearsOwned') || 1;
    var mortgage = calcVal('bvsMortgageBalance');
    var monthlyExp = calcVal('bvsMonthlyExpenses');
    var appreciation = calcVal('bvsAppreciation') / 100;
    var closingPct = calcVal('bvsClosingPct') / 100;
    var holdYears = calcVal('bvsHoldYears') || 3;

    document.getElementById('bvsHoldLabel').textContent = holdYears;

    // Sell Now
    var sellClosing = currentValue * closingPct;
    var sellNet = currentValue - sellClosing - mortgage;
    var sellReturn = sellNet - (originalPrice - mortgage); // simplified
    var totalReturn = currentValue - sellClosing - originalPrice;
    var sellAnnual = originalPrice > 0 && yearsOwned > 0 ? (Math.pow(currentValue / originalPrice, 1/yearsOwned) - 1) * 100 : 0;

    calcSet('bvsSellPrice', currentValue);
    calcSet('bvsSellClosing', -sellClosing);
    calcSet('bvsSellMortgage', -mortgage);
    calcSet('bvsSellNet', sellNet);
    calcSet('bvsSellReturn', totalReturn);
    document.getElementById('bvsSellAnnual').textContent = (sellAnnual >= 0 ? '+' : '') + sellAnnual.toFixed(1) + '%';

    // Hold
    var holdValue = currentValue * Math.pow(1 + appreciation, holdYears);
    var holdClosing = holdValue * closingPct;
    var holdMortgageEst = Math.max(0, mortgage - (mortgage / 30 * holdYears)); // rough paydown
    var holdExpenses = monthlyExp * 12 * holdYears;
    var holdNet = holdValue - holdClosing - holdMortgageEst - holdExpenses;
    var holdTotalReturn = holdValue - holdClosing - holdExpenses - originalPrice;
    var totalYears = yearsOwned + holdYears;
    var holdAnnual = originalPrice > 0 && totalYears > 0 ? (Math.pow(holdValue / originalPrice, 1/totalYears) - 1) * 100 : 0;

    calcSet('bvsHoldValue', holdValue);
    calcSet('bvsHoldClosing', -holdClosing);
    calcSet('bvsHoldMortgage', -holdMortgageEst);
    calcSet('bvsHoldExpenses', -holdExpenses);
    calcSet('bvsHoldNet', holdNet);
    calcSet('bvsHoldReturn', holdTotalReturn);
    document.getElementById('bvsHoldAnnual').textContent = (holdAnnual >= 0 ? '+' : '') + holdAnnual.toFixed(1) + '%';
}

// ── Recalc Dispatcher ───────────────────────────────────────

function recalcCurrentTab() {
    // Find visible panel
    var panels = document.querySelectorAll('.calc-panel');
    for (var i = 0; i < panels.length; i++) {
        if (!panels[i].classList.contains('hidden')) {
            var id = panels[i].id.replace('calcPanel', '').toLowerCase();
            if (id === 'mortgage') calcMortgage();
            else if (id === 'closing') calcClosing();
            else if (id === 'cashoncash') calcCashOnCash();
            else if (id === 'roi') calcROI();
            else if (id === 'rentvsbuy') calcRentVsBuy();
            else if (id === 'buyvssell') calcBuyVsSell();
            break;
        }
    }
}

// Auto-calc when switching tabs
var _origSwitchCalcTab = switchCalcTab;
switchCalcTab = function(tab) {
    _origSwitchCalcTab(tab);
    setTimeout(recalcCurrentTab, 50);
};

// ── Print & Email Calculators ───────────────────────────────

function printCurrentCalc() {
    var panels = document.querySelectorAll('.calc-panel');
    var activePanel = null;
    for (var i = 0; i < panels.length; i++) {
        if (!panels[i].classList.contains('hidden')) { activePanel = panels[i]; break; }
    }
    if (!activePanel) return;

    var title = activePanel.querySelector('h3') ? activePanel.querySelector('h3').textContent : 'Financial Calculator';
    var results = activePanel.querySelector('.bg-gray-50');

    var printHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title>';
    printHTML += '<style>body{font-family:"Segoe UI",sans-serif;font-size:11pt;color:#333;padding:24px;max-width:700px;margin:0 auto;}';
    printHTML += '.header{text-align:center;border-bottom:2px solid #B8860B;padding-bottom:12px;margin-bottom:20px;}';
    printHTML += '.header h1{font-size:14pt;color:#1a1a1a;margin:0 0 4px;}';
    printHTML += '.header p{font-size:9pt;color:#666;margin:2px 0;}';
    printHTML += '.results{border:1px solid #eee;border-radius:8px;padding:16px;margin-top:16px;}';
    printHTML += '.footer{text-align:center;border-top:1px solid #ddd;padding-top:8px;font-size:8pt;color:#999;margin-top:24px;}';
    printHTML += '</style></head><body>';
    var _co = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : {};
    printHTML += '<div class="header"><h1>' + (_co.company || 'MALLAN REAL ESTATE INC.') + '</h1>';
    printHTML += '<p>' + (_co.address || '') + (_co.phone ? ' | ' + _co.phone : '') + '</p>';
    printHTML += '<p>Licensed Real Estate Brokerage' + (_co.companyLicense ? ' | Lic. ' + _co.companyLicense : '') + '</p></div>';
    printHTML += '<h2 style="font-size:14pt;color:#B8860B;margin-bottom:12px;">' + title + '</h2>';
    if (results) printHTML += '<div class="results">' + results.innerHTML + '</div>';
    printHTML += '<div class="footer"><p>Estimates only. Consult a financial advisor for actual figures.</p>';
    printHTML += '<p>&copy; ' + new Date().getFullYear() + ' Mallan Real Estate Inc. | Generated ' + new Date().toLocaleDateString() + '</p></div>';
    printHTML += '</body></html>';

    openPrintableWindow(printHTML, { features: 'width=750,height=600', autoPrint: true, printDelay: 300 });
}

function emailCurrentCalc() {
    var panels = document.querySelectorAll('.calc-panel');
    var activePanel = null;
    for (var i = 0; i < panels.length; i++) {
        if (!panels[i].classList.contains('hidden')) { activePanel = panels[i]; break; }
    }
    if (!activePanel) return;

    var title = activePanel.querySelector('h3') ? activePanel.querySelector('h3').textContent : 'Financial Calculator';
    var results = activePanel.querySelector('.bg-gray-50');
    var text = title + '\n\n';

    // Extract text from result rows
    if (results) {
        var rows = results.querySelectorAll('div[class*="flex justify-between"]');
        rows.forEach(function(row) {
            var spans = row.querySelectorAll('span');
            if (spans.length >= 2) {
                text += spans[0].textContent + ': ' + spans[1].textContent + '\n';
            }
        });
    }

    var _co2 = typeof AGENT_PROFILE !== 'undefined' ? AGENT_PROFILE : {};
    text += '\n---\nPrepared by ' + (_co2.company || 'Mallan Real Estate Inc.') + '\n' + (_co2.phone || '') + ' | ' + (_co2.email || '') + '\nEstimates only. Consult a financial advisor.';

    // Copy and open mailto
    navigator.clipboard.writeText(text).catch(function() {});
    var subject = encodeURIComponent(title + ' — Mallan Real Estate');
    var body = encodeURIComponent(text);
    window.open('mailto:?subject=' + subject + '&body=' + body, '_self');
}
