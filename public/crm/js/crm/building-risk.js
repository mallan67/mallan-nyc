/**
 * Building Risk Intelligence — CRM Module
 * Lookup building risk scores by BBL or BIN from NYC open data.
 */
/* global MallanAPI, showToast */

const GRADE_COLORS_RISK = { A: '#059669', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

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
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="brisk-bbl" type="text" placeholder="BBL (e.g. 1012340056)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:180px;">
          <input id="brisk-bin" type="text" placeholder="BIN (optional)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:140px;">
          <button onclick="runBuildingRisk()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            <i class="fas fa-search" style="margin-right:4px;"></i> Analyze
          </button>
        </div>
      </div>
    </div>
    <div id="brisk-result" style="padding:24px;">
      <div style="text-align:center;padding:40px;color:#9ca3af;">
        <i class="fas fa-building" style="font-size:48px;margin-bottom:12px;display:block;"></i>
        <p style="font-size:14px;">Enter a BBL to analyze building risk</p>
        <p style="font-size:12px;margin-top:4px;">Find BBL on NYC ACRIS or building profile pages</p>
      </div>
    </div>
  `;
}

async function runBuildingRisk() {
  var bbl = (document.getElementById('brisk-bbl')?.value || '').trim();
  var bin = (document.getElementById('brisk-bin')?.value || '').trim();
  var result = document.getElementById('brisk-result');
  if (!result) return;

  if (!bbl) {
    showToast('BBL is required', 'error');
    return;
  }

  result.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Analyzing building risk...</div>';

  try {
    var params = 'bbl=' + encodeURIComponent(bbl);
    if (bin) params += '&bin=' + encodeURIComponent(bin);
    var res = await MallanAPI._fetch('/api/buildings/risk?' + params);

    if (!res.ok && res.error) {
      result.innerHTML = '<div style="padding:24px;color:#dc2626;">' + res.error + '</div>';
      return;
    }

    renderBuildingRisk(result, res);
  } catch (e) {
    result.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load building risk data.</div>';
  }
}

function renderBuildingRisk(container, r) {
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
    <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;margin-bottom:24px;">
      <!-- Grade Circle -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${gradeColor};display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span style="font-size:36px;font-weight:800;color:${gradeColor};">${r.grade}</span>
          <span style="font-size:11px;font-weight:600;color:#6b7280;">${r.risk_score}/100</span>
        </div>
        <span style="font-size:12px;font-weight:600;color:${gradeColor};">${r.grade_label}</span>
      </div>

      <!-- Summary -->
      <div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
          <p style="font-size:13px;color:#374151;margin:0;">${r.summary}</p>
        </div>

        <!-- Quick Stats -->
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

    <!-- Component Breakdown -->
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

// Export for CRM
window.initBuildingRisk = initBuildingRisk;
window.runBuildingRisk = runBuildingRisk;
