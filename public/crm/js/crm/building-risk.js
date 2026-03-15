/**
 * Building Risk Intelligence — CRM Module
 * Search by address (house number + street) — auto-resolves BBL via public records.
 */
/* global MallanAPI, showToast */

var GRADE_COLORS_RISK = { A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

async function initBuildingRisk() {
  var c = document.getElementById('building-risk');
  if (!c) return;

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Building Risk Intelligence</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">NYC DOB violations, complaints, ECB penalties &amp; permit activity</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input id="brisk-house" type="text" placeholder="House # (e.g. 400)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:100px;">
          <input id="brisk-street" type="text" placeholder="Street (e.g. East 90th Street)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:220px;">
          <button onclick="runBuildingRisk()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-search" style="margin-right:4px;"></i> Analyze
          </button>
        </div>
      </div>
    </div>
    <div id="brisk-result" style="padding:24px;">
      <div style="text-align:center;padding:40px;color:#9ca3af;">
        <i class="fas fa-building" style="font-size:48px;margin-bottom:12px;display:block;"></i>
        <p style="font-size:14px;">Enter a building address to analyze risk</p>
        <p style="font-size:12px;margin-top:4px;">Data from NYC Department of Buildings &amp; OATH/ECB</p>
      </div>
    </div>
  `;
}

async function runBuildingRisk() {
  var house = (document.getElementById('brisk-house')?.value || '').trim();
  var street = (document.getElementById('brisk-street')?.value || '').trim();
  var result = document.getElementById('brisk-result');
  if (!result) return;

  if (!street) {
    showToast('Enter a street address', 'error');
    return;
  }

  result.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Looking up building and analyzing risk...</div>';

  try {
    // Step 1: Resolve BBL from address via public-records
    var params = [];
    if (house) params.push('houseNumber=' + encodeURIComponent(house));
    if (street) params.push('street=' + encodeURIComponent(street));

    var prRes = await MallanAPI._fetch('/api/public-records?' + params.join('&'));
    var bbl = prRes.bbl;

    if (!bbl) {
      // Try to extract from ACRIS response
      if (prRes.acris && prRes.acris.length > 0 && prRes.acris[0].borough && prRes.acris[0].block && prRes.acris[0].lot) {
        bbl = prRes.acris[0].borough + prRes.acris[0].block.padStart(5, '0') + prRes.acris[0].lot.padStart(4, '0');
      }
    }

    if (!bbl) {
      result.innerHTML = '<div style="padding:24px;color:#f59e0b;"><i class="fas fa-info-circle" style="margin-right:4px;"></i>Could not resolve BBL for this address. Try a different format (e.g. "400 East 90th Street").</div>';
      return;
    }

    // Step 2: Run building risk analysis
    var res = await MallanAPI._fetch('/api/buildings/risk?bbl=' + encodeURIComponent(bbl));

    if (!res.ok && res.error) {
      result.innerHTML = '<div style="padding:24px;color:#dc2626;">' + res.error + '</div>';
      return;
    }

    renderBuildingRisk(result, res, house + ' ' + street);
  } catch (e) {
    result.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to analyze building risk. Try a different address.</div>';
  }
}

function renderBuildingRisk(container, r, addressLabel) {
  var gradeColor = GRADE_COLORS_RISK[r.grade] || '#6b7280';

  var componentsHtml = (r.components || []).map(function(c) {
    var barWidth = Math.min(c.score, 100);
    var barColor = c.score <= 20 ? '#059669' : c.score <= 40 ? '#f59e0b' : c.score <= 60 ? '#f97316' : '#ef4444';
    return '<div style="margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="font-size:13px;font-weight:600;color:#374151;">' + c.name + '</span>' +
        '<span style="font-size:12px;color:#6b7280;">' + c.detail + '</span>' +
      '</div>' +
      '<div style="background:#f3f4f6;border-radius:9999px;height:8px;overflow:hidden;">' +
        '<div style="background:' + barColor + ';height:100%;width:' + barWidth + '%;border-radius:9999px;transition:width 0.5s;"></div>' +
      '</div>' +
    '</div>';
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <p style="font-size:16px;font-weight:700;color:#111827;margin:0;">${addressLabel || 'Building Analysis'}</p>
      <p style="font-size:11px;color:#6b7280;margin:2px 0 0;">BBL: ${r.bbl}${r.bin ? ' | BIN: ' + r.bin : ''}</p>
    </div>

    <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;margin-bottom:24px;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${gradeColor};display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span style="font-size:36px;font-weight:800;color:${gradeColor};">${r.grade}</span>
          <span style="font-size:11px;font-weight:600;color:#6b7280;">${r.risk_score}/100</span>
        </div>
        <span style="font-size:12px;font-weight:600;color:${gradeColor};">${r.grade_label}</span>
      </div>
      <div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
          <p style="font-size:13px;color:#374151;margin:0;">${r.summary}</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
            <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 4px;">Open Violations</p>
            <p style="font-size:24px;font-weight:700;color:${r.violations.open > 5 ? '#ef4444' : r.violations.open > 0 ? '#f59e0b' : '#059669'};margin:0;">${r.violations.open}</p>
            <p style="font-size:10px;color:#9ca3af;margin:2px 0 0;">${r.violations.class1_hazardous} hazardous</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
            <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 4px;">Complaints (12mo)</p>
            <p style="font-size:24px;font-weight:700;color:${r.complaints.recent_12mo > 5 ? '#ef4444' : r.complaints.recent_12mo > 0 ? '#f59e0b' : '#059669'};margin:0;">${r.complaints.recent_12mo}</p>
            <p style="font-size:10px;color:#9ca3af;margin:2px 0 0;">${r.complaints.total} total</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
            <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 4px;">ECB Penalties</p>
            <p style="font-size:24px;font-weight:700;color:${r.ecb.balance_due > 10000 ? '#ef4444' : r.ecb.open > 0 ? '#f59e0b' : '#059669'};margin:0;">${r.ecb.open}</p>
            <p style="font-size:10px;color:#9ca3af;margin:2px 0 0;">$${r.ecb.balance_due.toLocaleString()} due</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
            <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 4px;">Permits (3yr)</p>
            <p style="font-size:24px;font-weight:700;color:${r.permits.active > 0 ? '#059669' : '#f59e0b'};margin:0;">${r.permits.active}</p>
            <p style="font-size:10px;color:#9ca3af;margin:2px 0 0;">${r.permits.total_3yr} filed</p>
          </div>
        </div>
      </div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;">
      <h3 style="font-size:14px;font-weight:700;color:#374151;margin:0 0 16px;">Risk Component Breakdown</h3>
      ${componentsHtml}
    </div>

    <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
      <i class="fas fa-info-circle" style="margin-right:4px;"></i>
      Data from NYC Department of Buildings &amp; OATH/ECB via NYC Open Data. Computed ${new Date(r.computed_at).toLocaleString()}.
    </p>
  `;
}

window.initBuildingRisk = initBuildingRisk;
window.runBuildingRisk = runBuildingRisk;
