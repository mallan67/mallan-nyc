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

function fmtPrice(p, isRent) {
  if (!p || p === 0) return '$0';
  if (isRent) return '$' + p.toLocaleString() + '/mo';
  if (p >= 1000000) return '$' + (p / 1000000).toFixed(p % 1000000 === 0 ? 0 : 1) + 'M';
  return '$' + p.toLocaleString();
}

function renderReport(container, report) {
  var ctx = MallanAPI.getContext();
  var agentName = ctx?.user?.name || ctx?.user?.full_name || 'Your Agent';
  var agentEmail = ctx?.user?.email || '';
  var agentPhone = ctx?.user?.phone || '';
  var agentLicense = ctx?.user?.license_no || '';

  var activeSections = report.sections.filter(function(s) { return s.stats.active_count > 0; });

  var statCards = report.sections.map(function(s) {
    var isRent = s.listing_type === 'rent';
    var typeLabel = isRent ? 'Rental' : 'Sale';
    var typeColor = isRent ? '#8b5cf6' : '#059669';
    var hasData = s.stats.active_count > 0;

    if (!hasData) return '';

    // Sample listings table
    var samplesHtml = '';
    if (s.sample_listings && s.sample_listings.length > 0) {
      var rows = s.sample_listings.map(function(l) {
        return '<tr style="border-top:1px solid #f3f4f6;">' +
          '<td style="padding:5px 8px;font-size:11px;font-weight:500;">' + l.address + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;font-weight:600;text-align:right;">' + fmtPrice(l.price, isRent) + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:center;">' + l.beds + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:center;">' + l.baths + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right;">' + (l.sqft ? l.sqft.toLocaleString() : '—') + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:center;">' + l.dom + '</td>' +
          '<td style="padding:5px 8px;font-size:10px;color:#6b7280;">' + l.company + '</td>' +
        '</tr>';
      }).join('');

      samplesHtml = '<div style="margin-top:12px;border-top:1px solid #f3f4f6;padding-top:8px;">' +
        '<p style="font-size:9px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Sample Listings</p>' +
        '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f9fafb;">' +
          '<th style="padding:4px 8px;text-align:left;font-size:9px;color:#9ca3af;">Address</th>' +
          '<th style="padding:4px 8px;text-align:right;font-size:9px;color:#9ca3af;">Price</th>' +
          '<th style="padding:4px 8px;text-align:center;font-size:9px;color:#9ca3af;">BR</th>' +
          '<th style="padding:4px 8px;text-align:center;font-size:9px;color:#9ca3af;">BA</th>' +
          '<th style="padding:4px 8px;text-align:right;font-size:9px;color:#9ca3af;">SqFt</th>' +
          '<th style="padding:4px 8px;text-align:center;font-size:9px;color:#9ca3af;">DOM</th>' +
          '<th style="padding:4px 8px;text-align:left;font-size:9px;color:#9ca3af;">Brokerage</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    return '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;border-left:4px solid ' + typeColor + ';">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<h4 style="font-size:15px;font-weight:700;color:#111827;margin:0;">' + s.property_type + '</h4>' +
        '<span style="font-size:10px;font-weight:600;color:' + typeColor + ';background:' + (isRent ? '#f5f3ff' : '#f0fdf4') + ';padding:3px 10px;border-radius:9999px;">' + typeLabel + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font-size:12px;">' +
        '<div><span style="color:#9ca3af;font-size:10px;">Active</span><p style="font-weight:700;color:#111827;margin:2px 0 0;font-size:18px;">' + s.stats.active_count + '</p></div>' +
        '<div><span style="color:#9ca3af;font-size:10px;">Median</span><p style="font-weight:700;color:#111827;margin:2px 0 0;font-size:18px;">' + fmtPrice(s.stats.median_price, isRent) + '</p></div>' +
        '<div><span style="color:#9ca3af;font-size:10px;">$/SqFt</span><p style="font-weight:700;color:#111827;margin:2px 0 0;font-size:18px;">$' + s.stats.avg_price_per_sqft.toLocaleString() + '</p></div>' +
        '<div><span style="color:#9ca3af;font-size:10px;">Avg DOM</span><p style="font-weight:700;color:#111827;margin:2px 0 0;font-size:18px;">' + s.stats.avg_dom + '<span style="font-size:11px;color:#9ca3af;"> days</span></p></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6;font-size:12px;">' +
        '<div><span style="color:#9ca3af;font-size:10px;">New (30d)</span><p style="font-weight:600;color:#111827;margin:2px 0 0;">' + s.stats.new_listings_30d + '</p></div>' +
        '<div><span style="color:#9ca3af;font-size:10px;">Avg Maintenance</span><p style="font-weight:600;color:#111827;margin:2px 0 0;">' + (s.stats.avg_maintenance > 0 ? '$' + s.stats.avg_maintenance.toLocaleString() + '/mo' : 'N/A') + '</p></div>' +
        '<div><span style="color:#9ca3af;font-size:10px;">Price Range</span><p style="font-weight:600;color:#111827;margin:2px 0 0;">' + fmtPrice(s.stats.price_range.min, isRent) + ' – ' + fmtPrice(s.stats.price_range.max, isRent) + '</p></div>' +
      '</div>' +
      samplesHtml +
    '</div>';
  }).filter(Boolean).join('');

  var narrativeHtml = report.narrative.split('\n\n').map(function(p) {
    if (!p.trim()) return '';
    return '<p style="margin:0 0 14px;line-height:1.8;font-size:14px;color:#374151;">' + p.trim() + '</p>';
  }).join('');

  // Build the full branded report
  var reportHtml = `
    <div id="mr-report-content" style="background:white;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <!-- Company Header -->
      <div style="background:#111827;padding:28px 32px;">
        <p style="font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:0.2em;text-transform:uppercase;margin:0 0 6px;">Mallan Real Estate Inc.</p>
        <h1 style="font-size:24px;font-weight:300;color:white;margin:0;letter-spacing:-0.01em;">${report.title}</h1>
        <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
          <span style="font-size:13px;color:rgba(255,255,255,0.6);">${report.period}</span>
          <span style="width:1px;height:12px;background:rgba(255,255,255,0.2);"></span>
          <span style="font-size:13px;color:rgba(255,255,255,0.6);">${report.total_listings || 0} listings analyzed</span>
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

      <!-- Market Data by Property Type -->
      <div style="padding:24px 32px;background:white;">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 16px;">Market Data by Property Type</h3>
        <div style="display:grid;grid-template-columns:1fr;gap:16px;">
          ${statCards || '<p style="color:#9ca3af;font-size:13px;">No active listings found for the selected filters. Try broadening your search.</p>'}
        </div>
      </div>

      <!-- AI Narrative -->
      <div style="padding:32px;">
        <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 18px;display:flex;align-items:center;gap:8px;">
          <i class="fas fa-pen-fancy" style="color:#B8860B;"></i> Market Analysis
        </h3>
        ${narrativeHtml}
      </div>

      <!-- Footer -->
      <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e5e7eb;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
          <div>
            <p style="font-size:12px;font-weight:600;color:#374151;margin:0;">${agentName}</p>
            <p style="font-size:11px;color:#9ca3af;margin:1px 0 0;">Mallan Real Estate Inc. &middot; (646) 258-4460 &middot; mallan.nyc</p>
          </div>
          <p style="font-size:11px;color:#9ca3af;margin:0;">400 East 90th Street, Suite 17C, New York, NY 10128</p>
        </div>
        <p style="font-size:9px;color:#b0b0b0;margin:0;line-height:1.5;">${report.disclaimer}</p>
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
