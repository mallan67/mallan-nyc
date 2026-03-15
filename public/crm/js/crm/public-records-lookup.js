/**
 * Public Records Lookup — CRM Module
 * ACRIS ownership history + DOB permits/violations + property tax.
 * Uses /api/public-records (aggregator) and /api/acris (detailed).
 * Accessible from client profile or standalone.
 */
/* global MallanAPI, showToast */

async function initPublicRecords() {
  var c = document.getElementById('public-records-lookup');
  if (!c) return;

  c.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Property Records Lookup</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">ACRIS ownership, DOB permits &amp; violations, property tax — from NYC Open Data</p>
    </div>
    <div style="padding:20px 24px;">
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <input id="pr-bbl" type="text" placeholder="BBL (e.g. 1012340056)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:180px;">
        <span style="color:#9ca3af;font-size:13px;line-height:36px;">or</span>
        <input id="pr-house" type="text" placeholder="House # (e.g. 400)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;width:100px;">
        <input id="pr-street" type="text" placeholder="Street (e.g. East 90th Street)" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;flex:1;min-width:200px;">
        <button onclick="runPublicRecords()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
          <i class="fas fa-search" style="margin-right:4px;"></i> Look Up
        </button>
      </div>
      <div id="pr-result"></div>
    </div>
  `;
}

async function runPublicRecords() {
  var bbl = (document.getElementById('pr-bbl')?.value || '').trim();
  var house = (document.getElementById('pr-house')?.value || '').trim();
  var street = (document.getElementById('pr-street')?.value || '').trim();
  var result = document.getElementById('pr-result');
  if (!result) return;

  if (!bbl && !street) { showToast('Enter a BBL or street address', 'error'); return; }

  result.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7280;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:8px;">Searching NYC records...</p></div>';

  try {
    var params = [];
    if (bbl) params.push('bbl=' + encodeURIComponent(bbl));
    if (house) params.push('houseNumber=' + encodeURIComponent(house));
    if (street) params.push('street=' + encodeURIComponent(street));

    var res = await MallanAPI._fetch('/api/public-records?' + params.join('&'));
    renderPublicRecords(result, res);
  } catch (e) {
    result.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to fetch records. Try a different BBL or address.</div>';
  }
}

function renderPublicRecords(container, data) {
  var sections = [];

  // ACRIS — Ownership History
  if (data.acris && data.acris.length > 0) {
    var acrisRows = data.acris.slice(0, 15).map(function(doc) {
      var parties = (doc.parties || []).map(function(p) {
        return '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:4px;font-size:10px;' +
          (p.party_type === '1' ? 'background:#dcfce7;color:#059669;' : 'background:#eff6ff;color:#2563eb;') + '">' +
          (p.party_type === '1' ? 'Seller' : 'Buyer') + ': ' + (p.name || '—') + '</span>';
      }).join(' ');

      return '<tr style="border-top:1px solid #f3f4f6;">' +
        '<td style="padding:8px 10px;font-size:12px;font-weight:500;">' + (doc.doc_type || '—') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + (doc.recorded_datetime ? new Date(doc.recorded_datetime).toLocaleDateString() : '—') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;font-weight:600;">' + (doc.doc_amount ? '$' + Number(doc.doc_amount).toLocaleString() : '—') + '</td>' +
        '<td style="padding:8px 10px;">' + parties + '</td>' +
      '</tr>';
    }).join('');

    sections.push(
      '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:12px;">' +
        '<div style="padding:12px 16px;background:#f0fdf4;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;">' +
          '<i class="fas fa-file-contract" style="color:#059669;"></i>' +
          '<h3 style="font-size:14px;font-weight:700;color:#111827;margin:0;">Ownership History (ACRIS)</h3>' +
          '<span style="font-size:11px;color:#6b7280;">' + data.acris.length + ' records</span>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
          '<thead><tr style="background:#f9fafb;">' +
            '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Type</th>' +
            '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Date</th>' +
            '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Amount</th>' +
            '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Parties</th>' +
          '</tr></thead>' +
          '<tbody>' + acrisRows + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  // DOB Violations
  if (data.violations && data.violations.length > 0) {
    var violRows = data.violations.slice(0, 10).map(function(v) {
      var isOpen = v.violation_status !== 'RESOLVE' && v.violation_status !== 'DISMISSED';
      return '<tr style="border-top:1px solid #f3f4f6;">' +
        '<td style="padding:8px 10px;font-size:12px;">' + (v.issue_date ? new Date(v.issue_date).toLocaleDateString() : '—') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + (v.violation_type || '—') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;"><span style="padding:2px 6px;border-radius:9999px;font-size:10px;font-weight:600;' +
          (isOpen ? 'background:#fef2f2;color:#ef4444;' : 'background:#f0fdf4;color:#059669;') + '">' +
          (v.violation_status || 'Unknown') + '</span></td>' +
        '<td style="padding:8px 10px;font-size:11px;color:#6b7280;max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (v.description || v.violation_description || '—') + '</td>' +
      '</tr>';
    }).join('');

    sections.push(
      '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:12px;">' +
        '<div style="padding:12px 16px;background:#fef2f2;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;">' +
          '<i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>' +
          '<h3 style="font-size:14px;font-weight:700;color:#111827;margin:0;">DOB Violations</h3>' +
          '<span style="font-size:11px;color:#6b7280;">' + data.violations.length + ' records</span>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f9fafb;">' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Date</th>' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Type</th>' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Status</th>' +
          '<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;">Description</th>' +
        '</tr></thead><tbody>' + violRows + '</tbody></table></div>'
    );
  }

  // DOB Complaints
  if (data.complaints && data.complaints.length > 0) {
    sections.push(
      '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<i class="fas fa-flag" style="color:#f59e0b;"></i>' +
          '<h3 style="font-size:14px;font-weight:700;color:#111827;margin:0;">DOB Complaints</h3>' +
          '<span style="font-size:11px;color:#6b7280;">' + data.complaints.length + ' filed</span>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
        data.complaints.slice(0, 8).map(function(c) {
          return '<span style="padding:4px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:11px;color:#92400e;">' +
            (c.complaint_category || c.status || 'Complaint') + ' — ' +
            (c.received_date ? new Date(c.received_date).toLocaleDateString() : 'Unknown') + '</span>';
        }).join('') + '</div></div>'
    );
  }

  if (sections.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;"><i class="fas fa-search" style="font-size:32px;margin-bottom:8px;display:block;"></i><p>No records found for this address. Try a different BBL or check the address format.</p></div>';
    return;
  }

  container.innerHTML = sections.join('');
}

// Callable from client profile or listing context
window.lookupRecordsForAddress = function(houseNumber, street, targetId) {
  document.getElementById('pr-house').value = houseNumber || '';
  document.getElementById('pr-street').value = street || '';
  runPublicRecords();
};

window.initPublicRecords = initPublicRecords;
window.runPublicRecords = runPublicRecords;
