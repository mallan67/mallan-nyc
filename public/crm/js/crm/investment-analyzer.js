/**
 * Property Investment Analyzer — CRM Module
 * Calculate rental yield, cap rate, price appreciation estimate, and demand trend.
 * Client-side calculator using market data from API.
 */
/* global MallanAPI, showToast */

async function initInvestmentAnalyzer() {
  var c = document.getElementById('investment-analyzer');
  if (!c) return;

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Property Investment Analyzer</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Evaluate rental yield, cap rate, and appreciation potential</p>
    </div>

    <div style="padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <!-- Input Form -->
      <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Property Details</h3>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Purchase Price</label>
          <input id="inv-price" type="number" placeholder="1500000" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Monthly Rent (estimated)</label>
          <input id="inv-rent" type="number" placeholder="4500" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div>
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Down Payment %</label>
            <input id="inv-down" type="number" value="20" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Mortgage Rate %</label>
            <input id="inv-rate" type="number" value="6.5" step="0.1" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div>
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Monthly HOA/Common</label>
            <input id="inv-hoa" type="number" value="800" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Annual Taxes</label>
            <input id="inv-tax" type="number" value="12000" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Annual Insurance</label>
          <input id="inv-insurance" type="number" value="2400" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Vacancy Rate %</label>
          <input id="inv-vacancy" type="number" value="5" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <button onclick="calculateInvestment()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">
          <i class="fas fa-calculator" style="margin-right:6px;"></i> Calculate Returns
        </button>
      </div>

      <!-- Results -->
      <div id="inv-results">
        <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
          <i class="fas fa-chart-pie" style="font-size:48px;margin-bottom:12px;display:block;"></i>
          <p style="font-size:14px;">Enter property details and click Calculate</p>
        </div>
      </div>
    </div>
  `;
}

function calculateInvestment() {
  var price = parseFloat(document.getElementById('inv-price')?.value) || 0;
  var rent = parseFloat(document.getElementById('inv-rent')?.value) || 0;
  var downPct = parseFloat(document.getElementById('inv-down')?.value) || 20;
  var ratePct = parseFloat(document.getElementById('inv-rate')?.value) || 6.5;
  var hoa = parseFloat(document.getElementById('inv-hoa')?.value) || 0;
  var tax = parseFloat(document.getElementById('inv-tax')?.value) || 0;
  var insurance = parseFloat(document.getElementById('inv-insurance')?.value) || 0;
  var vacancyPct = parseFloat(document.getElementById('inv-vacancy')?.value) || 5;
  var result = document.getElementById('inv-results');
  if (!result || price <= 0 || rent <= 0) { showToast('Enter price and rent', 'error'); return; }

  // Calculations
  var annualRent = rent * 12;
  var effectiveRent = annualRent * (1 - vacancyPct / 100);
  var annualExpenses = (hoa * 12) + tax + insurance;
  var noi = effectiveRent - annualExpenses;

  // Gross Yield
  var grossYield = (annualRent / price) * 100;

  // Net Yield (Cap Rate)
  var capRate = (noi / price) * 100;

  // Mortgage
  var downPayment = price * (downPct / 100);
  var loanAmount = price - downPayment;
  var monthlyRate = (ratePct / 100) / 12;
  var numPayments = 30 * 12;
  var monthlyMortgage = loanAmount > 0 ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1) : 0;
  var annualMortgage = monthlyMortgage * 12;

  // Cash-on-Cash Return
  var annualCashFlow = noi - annualMortgage;
  var cashOnCash = downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0;

  // Monthly breakdown
  var monthlyNOI = noi / 12;
  var monthlyCashFlow = annualCashFlow / 12;

  function metricColor(v) { return v >= 5 ? '#059669' : v >= 2 ? '#3b82f6' : v >= 0 ? '#f59e0b' : '#ef4444'; }

  result.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:white;border:2px solid ${metricColor(grossYield)};border-radius:12px;padding:16px;text-align:center;">
        <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Gross Yield</p>
        <p style="font-size:28px;font-weight:800;color:${metricColor(grossYield)};margin:0;">${grossYield.toFixed(2)}%</p>
      </div>
      <div style="background:white;border:2px solid ${metricColor(capRate)};border-radius:12px;padding:16px;text-align:center;">
        <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Cap Rate (NOI)</p>
        <p style="font-size:28px;font-weight:800;color:${metricColor(capRate)};margin:0;">${capRate.toFixed(2)}%</p>
      </div>
      <div style="background:white;border:2px solid ${metricColor(cashOnCash)};border-radius:12px;padding:16px;text-align:center;">
        <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Cash-on-Cash</p>
        <p style="font-size:28px;font-weight:800;color:${metricColor(cashOnCash)};margin:0;">${cashOnCash.toFixed(2)}%</p>
      </div>
      <div style="background:white;border:2px solid ${monthlyCashFlow >= 0 ? '#059669' : '#ef4444'};border-radius:12px;padding:16px;text-align:center;">
        <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Monthly Cash Flow</p>
        <p style="font-size:28px;font-weight:800;color:${monthlyCashFlow >= 0 ? '#059669' : '#ef4444'};margin:0;">$${Math.round(monthlyCashFlow).toLocaleString()}</p>
      </div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;">Monthly Breakdown</h4>
      <div style="display:grid;gap:6px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">Gross Rent</span><span style="font-weight:600;color:#059669;">+$${rent.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">Vacancy (${vacancyPct}%)</span><span style="font-weight:600;color:#ef4444;">-$${Math.round(rent * vacancyPct / 100).toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">HOA/Common</span><span style="font-weight:600;color:#ef4444;">-$${hoa.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">Taxes</span><span style="font-weight:600;color:#ef4444;">-$${Math.round(tax / 12).toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">Insurance</span><span style="font-weight:600;color:#ef4444;">-$${Math.round(insurance / 12).toLocaleString()}</span></div>
        <div style="border-top:1px solid #e5e7eb;padding-top:6px;display:flex;justify-content:space-between;"><span style="font-weight:600;color:#374151;">NOI</span><span style="font-weight:700;color:${monthlyNOI >= 0 ? '#059669' : '#ef4444'};">$${Math.round(monthlyNOI).toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:#6b7280;">Mortgage (${ratePct}%, 30yr)</span><span style="font-weight:600;color:#ef4444;">-$${Math.round(monthlyMortgage).toLocaleString()}</span></div>
        <div style="border-top:2px solid #111827;padding-top:6px;display:flex;justify-content:space-between;"><span style="font-weight:700;color:#111827;">Cash Flow</span><span style="font-weight:800;color:${monthlyCashFlow >= 0 ? '#059669' : '#ef4444'};">$${Math.round(monthlyCashFlow).toLocaleString()}</span></div>
      </div>
    </div>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-top:12px;">
      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px;">Investment Summary</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#6b7280;">
        <div>Down Payment: <strong style="color:#111827;">$${downPayment.toLocaleString()}</strong></div>
        <div>Loan Amount: <strong style="color:#111827;">$${loanAmount.toLocaleString()}</strong></div>
        <div>Annual NOI: <strong style="color:#111827;">$${Math.round(noi).toLocaleString()}</strong></div>
        <div>Annual Cash Flow: <strong style="color:${annualCashFlow >= 0 ? '#059669' : '#ef4444'};">$${Math.round(annualCashFlow).toLocaleString()}</strong></div>
      </div>
    </div>
  `;
}

window.initInvestmentAnalyzer = initInvestmentAnalyzer;
window.calculateInvestment = calculateInvestment;
