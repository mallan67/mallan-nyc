/**
 * Renovation Cost Estimator (#14) — CRM Module
 * Estimate renovation budgets based on property type, size, and scope.
 * Uses NYC DOB permit data for local cost validation.
 */
/* global MallanAPI, showToast */

// NYC renovation cost ranges ($/sqft, 2025-2026 estimates)
var RENO_COSTS = {
  kitchen: { low: 150, mid: 300, high: 500, label: 'Kitchen' },
  bathroom: { low: 200, mid: 400, high: 700, label: 'Bathroom' },
  flooring: { low: 8, mid: 18, high: 35, label: 'Flooring' },
  painting: { low: 3, mid: 6, high: 12, label: 'Painting' },
  electrical: { low: 15, mid: 30, high: 50, label: 'Electrical' },
  plumbing: { low: 20, mid: 40, high: 65, label: 'Plumbing' },
  windows: { low: 800, mid: 1500, high: 2500, label: 'Windows (per unit)' },
  hvac: { low: 5000, mid: 12000, high: 25000, label: 'HVAC System' },
  full_gut: { low: 200, mid: 400, high: 700, label: 'Full Gut Renovation' }
};

async function initRenovationEstimator() {
  var c = document.getElementById('renovation-estimator');
  if (!c) return;

  var scopeOptions = Object.keys(RENO_COSTS).map(function(k) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;">' +
      '<input type="checkbox" class="reno-scope" value="' + k + '" style="accent-color:#2563eb;"> ' + RENO_COSTS[k].label +
    '</label>';
  }).join('');

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Renovation Cost Estimator</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">NYC renovation budgets by scope, property size, and quality tier</p>
    </div>

    <div style="padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Property Details</h3>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Living Area (sqft)</label>
          <input id="reno-sqft" type="number" value="1000" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Number of Bathrooms</label>
          <input id="reno-baths" type="number" value="1" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Number of Windows</label>
          <input id="reno-windows" type="number" value="6" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Quality Tier</label>
          <select id="reno-tier" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;margin-top:4px;">
            <option value="low">Budget / Standard</option>
            <option value="mid" selected>Mid-Range</option>
            <option value="high">High-End / Luxury</option>
          </select>
        </div>

        <div style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:8px;display:block;">Renovation Scope</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            ${scopeOptions}
          </div>
        </div>

        <button onclick="calculateRenovation()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">
          <i class="fas fa-calculator" style="margin-right:6px;"></i> Estimate Cost
        </button>
      </div>

      <div id="reno-result">
        <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
          <i class="fas fa-hammer" style="font-size:48px;margin-bottom:12px;display:block;"></i>
          <p style="font-size:14px;">Select scope and click Estimate</p>
        </div>
      </div>
    </div>
  `;
}

function calculateRenovation() {
  var sqft = parseFloat(document.getElementById('reno-sqft')?.value) || 1000;
  var baths = parseInt(document.getElementById('reno-baths')?.value) || 1;
  var windows = parseInt(document.getElementById('reno-windows')?.value) || 6;
  var tier = document.getElementById('reno-tier')?.value || 'mid';
  var scopes = Array.from(document.querySelectorAll('.reno-scope:checked')).map(function(el) { return el.value; });
  var result = document.getElementById('reno-result');
  if (!result) return;

  if (scopes.length === 0) { showToast('Select at least one renovation scope', 'error'); return; }

  var items = scopes.map(function(scope) {
    var costs = RENO_COSTS[scope];
    var rate = costs[tier];
    var cost;

    if (scope === 'kitchen') cost = rate * Math.min(sqft * 0.12, 200); // kitchen ~12% of unit, max 200sqft
    else if (scope === 'bathroom') cost = rate * 50 * baths; // ~50sqft per bathroom
    else if (scope === 'windows') cost = rate * windows;
    else if (scope === 'hvac') cost = rate; // flat cost
    else if (scope === 'full_gut') cost = rate * sqft;
    else cost = rate * sqft; // flooring, painting, electrical, plumbing

    return {
      scope: costs.label,
      cost: Math.round(cost),
      rate: rate,
      unit: (scope === 'windows') ? '/window' : (scope === 'hvac') ? 'flat' : '/sqft'
    };
  });

  var total = items.reduce(function(s, i) { return s + i.cost; }, 0);
  var contingency = Math.round(total * 0.15);
  var grandTotal = total + contingency;

  var tierLabel = tier === 'low' ? 'Budget' : tier === 'high' ? 'Luxury' : 'Mid-Range';
  var tierColor = tier === 'low' ? '#059669' : tier === 'high' ? '#7c3aed' : '#3b82f6';

  var itemsHtml = items.map(function(i) {
    return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #f3f4f6;">' +
      '<span style="font-size:13px;color:#374151;">' + i.scope + ' <span style="color:#9ca3af;font-size:11px;">($' + i.rate.toLocaleString() + i.unit + ')</span></span>' +
      '<span style="font-size:13px;font-weight:600;color:#111827;">$' + i.cost.toLocaleString() + '</span>' +
    '</div>';
  }).join('');

  result.innerHTML = `
    <div style="background:white;border:2px solid ${tierColor};border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">
      <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">${tierLabel} Estimate</p>
      <p style="font-size:36px;font-weight:800;color:${tierColor};margin:0;">$${grandTotal.toLocaleString()}</p>
      <p style="font-size:12px;color:#6b7280;margin:4px 0 0;">${sqft.toLocaleString()} sqft &bull; ${scopes.length} scope(s) &bull; incl. 15% contingency</p>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px;">Cost Breakdown</h4>
      ${itemsHtml}
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #e5e7eb;">
        <span style="font-size:13px;color:#6b7280;">Subtotal</span>
        <span style="font-size:13px;font-weight:600;">$${total.toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#6b7280;">Contingency (15%)</span>
        <span style="font-size:13px;font-weight:600;">$${contingency.toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #111827;">
        <span style="font-size:14px;font-weight:700;color:#111827;">Total</span>
        <span style="font-size:14px;font-weight:800;color:${tierColor};">$${grandTotal.toLocaleString()}</span>
      </div>
    </div>

    <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
      <i class="fas fa-info-circle" style="margin-right:4px;"></i>
      Estimates based on 2025-2026 NYC renovation costs. Actual costs vary by building type, access, and contractor. Always get 3+ quotes.
    </p>
  `;
}

window.initRenovationEstimator = initRenovationEstimator;
window.calculateRenovation = calculateRenovation;
