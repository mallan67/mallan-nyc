/**
 * Manhattan Market Report Builder — CRM Module
 * AI-powered market report generation with property type breakdowns.
 */
/* global MallanAPI, showToast */

var MR_PROPERTY_TYPES = ['Condo', 'Co-op', 'Condop', 'Townhouse'];
var MR_NEIGHBORHOODS = [
  'Upper East Side', 'Upper West Side', 'Midtown', 'Chelsea', 'Tribeca',
  'SoHo', 'West Village', 'East Village', 'Gramercy', 'Murray Hill',
  'Financial District', 'Flatiron', 'Harlem', 'Battery Park City',
  'Hell\'s Kitchen', 'Carnegie Hill', 'Lenox Hill', 'Yorkville'
];

async function initMarketReportBuilder() {
  var c = document.getElementById('market-report-builder');
  if (!c) return;

  var typeChecks = MR_PROPERTY_TYPES.map(function(t) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;">' +
      '<input type="checkbox" class="mr-type" value="' + t + '" checked style="accent-color:#B8860B;"> ' + t +
    '</label>';
  }).join('');

  var nhOptions = MR_NEIGHBORHOODS.map(function(n) {
    return '<option value="' + n + '">' + n + '</option>';
  }).join('');

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Manhattan Market Report Builder</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">AI-powered market analysis for sales &amp; rentals by property type</p>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="width:8px;height:8px;border-radius:50%;background:#B8860B;"></span>
          <span style="font-size:11px;color:#B8860B;font-weight:600;">Powered by Claude AI</span>
        </div>
      </div>
    </div>

    <div style="padding:24px;display:grid;grid-template-columns:320px 1fr;gap:24px;">
      <!-- Controls -->
      <div>
        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
          <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Report Settings</h3>

          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Report Type</label>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button id="mr-type-both" onclick="mrSetType('both')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #B8860B;background:#fffbeb;color:#B8860B;">Both</button>
              <button id="mr-type-sale" onclick="mrSetType('sale')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #e2e8f0;background:white;color:#374151;">Sale</button>
              <button id="mr-type-rent" onclick="mrSetType('rent')" style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #e2e8f0;background:white;color:#374151;">Rental</button>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Property Types</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
              ${typeChecks}
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <label style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Neighborhoods (optional)</label>
            <select id="mr-neighborhoods" multiple size="4" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;margin-top:6px;">
              <option value="">All Manhattan</option>
              ${nhOptions}
            </select>
            <p style="font-size:10px;color:#9ca3af;margin-top:4px;">Hold Ctrl/Cmd to select multiple. Leave blank for all Manhattan.</p>
          </div>

          <button onclick="generateReport()" id="mr-generate-btn" style="width:100%;padding:12px;background:#B8860B;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
            <i class="fas fa-magic" style="margin-right:6px;"></i> Generate Report
          </button>
        </div>
      </div>

      <!-- Report Output -->
      <div id="mr-output">
        <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
          <i class="fas fa-chart-bar" style="font-size:48px;margin-bottom:12px;display:block;"></i>
          <p style="font-size:14px;">Configure settings and click Generate Report</p>
          <p style="font-size:12px;margin-top:4px;">The AI will analyze current market data and write a professional narrative</p>
        </div>
      </div>
    </div>
  `;

  window._mrReportType = 'both';
}

function mrSetType(type) {
  window._mrReportType = type;
  ['both', 'sale', 'rent'].forEach(function(t) {
    var btn = document.getElementById('mr-type-' + t);
    if (btn) {
      btn.style.border = t === type ? '2px solid #B8860B' : '2px solid #e2e8f0';
      btn.style.background = t === type ? '#fffbeb' : 'white';
      btn.style.color = t === type ? '#B8860B' : '#374151';
    }
  });
}

async function generateReport() {
  var output = document.getElementById('mr-output');
  var btn = document.getElementById('mr-generate-btn');
  if (!output) return;

  var types = Array.from(document.querySelectorAll('.mr-type:checked')).map(function(el) { return el.value; });
  if (types.length === 0) { showToast('Select at least one property type', 'error'); return; }

  var nhSelect = document.getElementById('mr-neighborhoods');
  var neighborhoods = [];
  if (nhSelect) {
    for (var i = 0; i < nhSelect.options.length; i++) {
      if (nhSelect.options[i].selected && nhSelect.options[i].value) {
        neighborhoods.push(nhSelect.options[i].value);
      }
    }
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i> Generating (30-60s)...';
  output.innerHTML = '<div style="padding:60px;text-align:center;color:#B8860B;"><i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:16px;display:block;"></i><p style="font-size:14px;font-weight:600;">Analyzing market data with AI...</p><p style="font-size:12px;color:#6b7280;margin-top:4px;">Querying listings, computing stats, generating narrative</p></div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/market-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report_type: window._mrReportType || 'both',
        property_types: types,
        neighborhoods: neighborhoods.length > 0 ? neighborhoods : undefined,
      })
    });

    if (!res.ok || !res.report) {
      output.innerHTML = '<div style="padding:24px;color:#dc2626;">' + (res.error || 'Failed to generate report') + '</div>';
      return;
    }

    renderReport(output, res.report);
  } catch (e) {
    output.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to generate report. Check API key configuration.</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic" style="margin-right:6px;"></i> Generate Report';
  }
}

function renderReport(container, report) {
  // Stats cards by property type
  var statCards = report.sections.map(function(s) {
    var isRent = s.listing_type === 'rent';
    var priceLabel = isRent ? '/mo' : '';
    var typeLabel = isRent ? 'Rental' : 'Sale';
    var typeColor = isRent ? '#8b5cf6' : '#059669';

    return '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;border-top:3px solid ' + typeColor + ';">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<h4 style="font-size:14px;font-weight:700;color:#111827;margin:0;">' + s.property_type + '</h4>' +
        '<span style="font-size:10px;font-weight:600;color:' + typeColor + ';background:' + (isRent ? '#f5f3ff' : '#f0fdf4') + ';padding:2px 8px;border-radius:9999px;">' + typeLabel + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">' +
        '<div><span style="color:#6b7280;">Active</span><p style="font-weight:700;color:#111827;margin:2px 0 0;font-size:16px;">' + s.stats.active_count + '</p></div>' +
        '<div><span style="color:#6b7280;">Median Price</span><p style="font-weight:700;color:#111827;margin:2px 0 0;font-size:16px;">$' + s.stats.median_price.toLocaleString() + priceLabel + '</p></div>' +
        '<div><span style="color:#6b7280;">$/sqft</span><p style="font-weight:700;color:#111827;margin:2px 0 0;">$' + s.stats.avg_price_per_sqft.toLocaleString() + '</p></div>' +
        '<div><span style="color:#6b7280;">Avg DOM</span><p style="font-weight:700;color:#111827;margin:2px 0 0;">' + s.stats.avg_dom + ' days</p></div>' +
        '<div><span style="color:#6b7280;">New (30d)</span><p style="font-weight:700;color:#111827;margin:2px 0 0;">' + s.stats.new_listings + '</p></div>' +
        '<div><span style="color:#6b7280;">Closed (90d)</span><p style="font-weight:700;color:#111827;margin:2px 0 0;">' + s.stats.closed_count + '</p></div>' +
      '</div>' +
    '</div>';
  }).join('');

  // Format narrative paragraphs
  var narrativeHtml = report.narrative.split('\n\n').map(function(p) {
    return '<p style="margin:0 0 12px;line-height:1.7;">' + p.trim() + '</p>';
  }).join('');

  container.innerHTML = `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <!-- Report Header -->
      <div style="background:linear-gradient(135deg,#111827,#1f2937);padding:24px 28px;color:white;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <div style="width:40px;height:40px;border-radius:8px;background:rgba(184,134,11,0.2);display:flex;align-items:center;justify-content:center;">
            <span style="font-size:20px;font-weight:800;color:#B8860B;">M</span>
          </div>
          <div>
            <h2 style="font-size:20px;font-weight:800;margin:0;letter-spacing:-0.02em;">${report.title}</h2>
            <p style="font-size:13px;opacity:0.7;margin:2px 0 0;">${report.period} &middot; Mallan Real Estate Inc.</p>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div style="padding:20px 28px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <h3 style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;">Market Snapshot</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
          ${statCards}
        </div>
      </div>

      <!-- AI Narrative -->
      <div style="padding:28px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;display:flex;align-items:center;gap:8px;">
          <i class="fas fa-pen-fancy" style="color:#B8860B;"></i> Market Analysis
        </h3>
        <div style="font-size:14px;color:#374151;">
          ${narrativeHtml}
        </div>
      </div>

      <!-- Disclaimer -->
      <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <p style="font-size:10px;color:#9ca3af;margin:0;">${report.disclaimer}</p>
      </div>

      <!-- Actions -->
      <div style="padding:16px 28px;border-top:1px solid #e5e7eb;display:flex;gap:8px;">
        <button onclick="copyReportToClipboard()" style="padding:8px 16px;background:#111827;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
          <i class="fas fa-copy" style="margin-right:4px;"></i> Copy to Clipboard
        </button>
        <button onclick="window.print()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
          <i class="fas fa-print" style="margin-right:4px;"></i> Print
        </button>
      </div>
    </div>
  `;
}

function copyReportToClipboard() {
  var output = document.getElementById('mr-output');
  if (!output) return;
  var text = output.innerText;
  navigator.clipboard.writeText(text).then(function() {
    showToast('Report copied to clipboard', 'success');
  }).catch(function() {
    showToast('Failed to copy', 'error');
  });
}

window.initMarketReportBuilder = initMarketReportBuilder;
window.mrSetType = mrSetType;
window.generateReport = generateReport;
window.copyReportToClipboard = copyReportToClipboard;
