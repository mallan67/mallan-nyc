/**
 * Manhattan Market Report Builder — CRM Module
 * AI-powered market report with company branding, agent info, send capability.
 */
/* global MallanAPI, showToast */

var MR_PROPERTY_TYPES = ['Condo', 'Co-op', 'Condop', 'Townhouse'];
var MR_NEIGHBORHOODS = [
  'Upper East Side', 'Upper West Side', 'Midtown', 'Chelsea', 'Tribeca',
  'SoHo', 'West Village', 'East Village', 'Gramercy', 'Murray Hill',
  'Financial District', 'Flatiron', 'Harlem', 'Battery Park City',
  "Hell's Kitchen", 'Carnegie Hill', 'Lenox Hill', 'Yorkville'
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
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">AI-powered market analysis — preview, then send to clients</p>
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
            <p style="font-size:10px;color:#9ca3af;margin-top:4px;">Hold Ctrl/Cmd to select multiple</p>
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
  output.innerHTML = '<div style="padding:60px;text-align:center;color:#B8860B;"><i class="fas fa-spinner fa-spin" style="font-size:32px;margin-bottom:16px;display:block;"></i><p style="font-size:14px;font-weight:600;">Analyzing market data with AI...</p></div>';

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
  // Get agent info from context
  var ctx = MallanAPI.getContext();
  var agentName = ctx?.user?.name || ctx?.user?.full_name || 'Your Agent';
  var agentEmail = ctx?.user?.email || '';
  var agentPhone = ctx?.user?.phone || '';
  var agentLicense = ctx?.user?.license_no || '';

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

  var narrativeHtml = report.narrative.split('\n\n').map(function(p) {
    if (!p.trim()) return '';
    return '<p style="margin:0 0 14px;line-height:1.8;font-size:14px;color:#374151;">' + p.trim() + '</p>';
  }).join('');

  // Build the full branded report
  var reportHtml = `
    <div id="mr-report-content" style="background:white;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <!-- Company Banner -->
      <div style="background:linear-gradient(135deg,#111827 0%,#1f2937 50%,#111827 100%);padding:32px;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(184,134,11,0.15);display:flex;align-items:center;justify-content:center;border:1px solid rgba(184,134,11,0.3);">
            <span style="font-size:24px;font-weight:900;color:#B8860B;">M</span>
          </div>
          <div style="text-align:left;">
            <h1 style="font-size:22px;font-weight:800;color:white;margin:0;letter-spacing:-0.02em;">MALLAN REAL ESTATE INC.</h1>
            <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0;letter-spacing:0.15em;">LICENSED REAL ESTATE BROKERAGE &middot; NEW YORK</p>
          </div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;margin-top:16px;">
          <h2 style="font-size:20px;font-weight:700;color:white;margin:0;">${report.title}</h2>
          <p style="font-size:13px;color:rgba(255,255,255,0.6);margin:4px 0 0;">${report.period}</p>
        </div>
      </div>

      <!-- Agent Info Bar -->
      <div style="background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:#B8860B;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">
            ${agentName.split(' ').map(function(n) { return n[0]; }).join('').substring(0,2)}
          </div>
          <div>
            <p style="font-size:14px;font-weight:700;color:#111827;margin:0;">Prepared by ${agentName}</p>
            <p style="font-size:11px;color:#6b7280;margin:1px 0 0;">
              ${agentEmail ? agentEmail + ' &middot; ' : ''}${agentPhone ? agentPhone + ' &middot; ' : ''}Mallan Real Estate Inc.
            </p>
          </div>
        </div>
        <div style="text-align:right;">
          <p style="font-size:10px;color:#9ca3af;margin:0;">${new Date(report.generated_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
          ${agentLicense ? '<p style="font-size:9px;color:#9ca3af;margin:1px 0 0;">Lic# ' + agentLicense + '</p>' : ''}
        </div>
      </div>

      <!-- Stats Grid -->
      <div style="padding:24px 32px;background:white;border-bottom:1px solid #f3f4f6;">
        <h3 style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 14px;">Market Snapshot</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
          ${statCards}
        </div>
      </div>

      <!-- AI Narrative -->
      <div style="padding:32px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 18px;display:flex;align-items:center;gap:8px;">
          <i class="fas fa-pen-fancy" style="color:#B8860B;"></i> Market Analysis
        </h3>
        ${narrativeHtml}
      </div>

      <!-- Contact Footer -->
      <div style="background:#111827;padding:24px 32px;color:white;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div>
            <p style="font-size:13px;font-weight:600;margin:0;">${agentName}</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.6);margin:2px 0 0;">Mallan Real Estate Inc. &middot; 400 East 90th Street, Suite 17C, New York, NY 10128</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:12px;color:#B8860B;font-weight:600;margin:0;">(646) 258-4460</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:2px 0 0;">mallan.nyc</p>
          </div>
        </div>
        <div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:12px;padding-top:10px;display:flex;align-items:center;gap:8px;">
          <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239CA3AF'%3E%3Cpath d='M4 4h12v12H4z'/%3E%3Ctext x='5' y='13' font-size='8' fill='white' font-weight='bold'%3EEHO%3C/text%3E%3C/svg%3E" style="width:16px;height:16px;" alt="Equal Housing Opportunity">
          <p style="font-size:9px;color:rgba(255,255,255,0.4);margin:0;">Equal Housing Opportunity. ${report.disclaimer}</p>
        </div>
      </div>
    </div>

    <!-- Action Bar (outside printable area) -->
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <button onclick="mrCopyHtml()" style="padding:10px 20px;background:#111827;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <i class="fas fa-copy" style="margin-right:6px;"></i> Copy as HTML
      </button>
      <button onclick="mrCopyText()" style="padding:10px 20px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <i class="fas fa-file-alt" style="margin-right:6px;"></i> Copy as Text
      </button>
      <button onclick="mrPrintReport()" style="padding:10px 20px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <i class="fas fa-print" style="margin-right:6px;"></i> Print / Save PDF
      </button>
      <button onclick="mrEmailReport()" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
        <i class="fas fa-paper-plane" style="margin-right:6px;"></i> Email to Client
      </button>
    </div>
  `;

  container.innerHTML = reportHtml;
}

function mrCopyHtml() {
  var el = document.getElementById('mr-report-content');
  if (!el) return;
  var html = el.outerHTML;
  navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([el.innerText], { type: 'text/plain' }) })]).then(function() {
    showToast('Report HTML copied — paste into email', 'success');
  }).catch(function() {
    navigator.clipboard.writeText(el.innerText).then(function() { showToast('Text copied', 'success'); });
  });
}

function mrCopyText() {
  var el = document.getElementById('mr-report-content');
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(function() { showToast('Report text copied', 'success'); });
}

function mrPrintReport() {
  var el = document.getElementById('mr-report-content');
  if (!el) return;
  var win = window.open('', '_blank');
  win.opener = null;
  win.document.write('<!DOCTYPE html><html><head><title>Market Report</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>' + el.outerHTML + '</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 500);
}

function mrEmailReport() {
  var el = document.getElementById('mr-report-content');
  if (!el) return;
  var text = el.innerText.substring(0, 2000);
  var subject = 'Manhattan Market Report — Mallan Real Estate';
  window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text + '\n\nFull report available at mallan.nyc');
  showToast('Email client opened', 'success');
}

window.initMarketReportBuilder = initMarketReportBuilder;
window.mrSetType = mrSetType;
window.generateReport = generateReport;
window.mrCopyHtml = mrCopyHtml;
window.mrCopyText = mrCopyText;
window.mrPrintReport = mrPrintReport;
window.mrEmailReport = mrEmailReport;
