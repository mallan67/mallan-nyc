/**
 * Listing Auditor — CRM Module
 * Pre-submission quality + compliance checker.
 */
/* global MallanAPI */

const ListingAuditor = { audits: [], currentAudit: null };

function auditScoreColor(score) {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

async function initListingAuditor() {
  const c = document.getElementById('listing-auditor');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading audit history...</div>';
  try {
    const res = await MallanAPI._fetch('/api/crm/listing-audit?limit=50');
    if (res.ok) ListingAuditor.audits = res.items;
    renderListingAuditor();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load.</div>'; }
}

function renderListingAuditor() {
  const c = document.getElementById('listing-auditor');
  if (!c) return;
  const audits = ListingAuditor.audits || [];
  const passed = audits.filter(a => a.passed).length;
  const failed = audits.filter(a => !a.passed).length;

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${audits.length}</div>
        <div style="font-size:12px;color:#6b7280;">Total Audits</div>
      </div>
      <div style="background:#dcfce7;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#166534;">${passed}</div>
        <div style="font-size:12px;color:#166534;">Passed</div>
      </div>
      <div style="background:#fecaca;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#991b1b;">${failed}</div>
        <div style="font-size:12px;color:#991b1b;">Failed</div>
      </div>
    </div>

    <div style="display:flex;gap:12px;padding:16px 24px;align-items:center;">
      <input id="audit-listing-id" type="text" placeholder="Enter Listing ID to audit" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      <button onclick="runAudit()" style="background:#C4A052;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Run Audit</button>
    </div>

    ${ListingAuditor.currentAudit ? renderAuditResult(ListingAuditor.currentAudit) : ''}

    <div style="padding:0 24px 24px;">
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Audit History</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;">Listing</th>
          <th style="padding:8px 12px;text-align:center;">Score</th>
          <th style="padding:8px 12px;text-align:center;">Status</th>
          <th style="padding:8px 12px;text-align:center;">Issues</th>
          <th style="padding:8px 12px;text-align:center;">Photos</th>
          <th style="padding:8px 12px;text-align:right;">Date</th>
        </tr></thead>
        <tbody>
          ${audits.map(a => `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px;font-weight:600;">${a.listing_id}</td>
            <td style="padding:8px 12px;text-align:center;font-weight:700;color:${auditScoreColor(a.score)};">${a.score}</td>
            <td style="padding:8px 12px;text-align:center;"><span style="color:${a.passed ? '#059669' : '#ef4444'};font-weight:600;">${a.passed ? 'PASS' : 'FAIL'}</span></td>
            <td style="padding:8px 12px;text-align:center;">${(a.issues || []).length}</td>
            <td style="padding:8px 12px;text-align:center;">${a.photo_count}</td>
            <td style="padding:8px 12px;text-align:right;">${new Date(a.created_at).toLocaleDateString()}</td>
          </tr>`).join('')}
          ${audits.length === 0 ? '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">No audits yet.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

function renderAuditResult(audit) {
  const issues = audit.issues || [];
  const warnings = audit.warnings || [];
  return `
    <div style="margin:0 24px 16px;padding:16px;border:2px solid ${audit.passed ? '#86efac' : '#fca5a5'};border-radius:8px;background:${audit.passed ? '#f0fdf4' : '#fef2f2'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-size:16px;font-weight:700;">Listing: ${audit.listing_id}</span>
        <div style="display:flex;gap:12px;align-items:center;">
          <span style="font-size:28px;font-weight:800;color:${auditScoreColor(audit.score)};">${audit.score}</span>
          <span style="font-size:14px;font-weight:700;color:${audit.passed ? '#059669' : '#ef4444'};">${audit.passed ? 'PASS' : 'FAIL'}</span>
        </div>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">${audit.filled_count}/${audit.field_count} fields filled | ${audit.photo_count} photos</div>
      ${issues.length > 0 ? `<div style="margin-bottom:8px;"><strong style="color:#991b1b;font-size:12px;">Errors (${issues.length}):</strong>${issues.map(i => `<div style="font-size:12px;color:#991b1b;padding:2px 0;">- ${i.field}: ${i.message}${i.rule ? ` [${i.rule}]` : ''}</div>`).join('')}</div>` : ''}
      ${warnings.length > 0 ? `<div><strong style="color:#854d0e;font-size:12px;">Warnings (${warnings.length}):</strong>${warnings.map(w => `<div style="font-size:12px;color:#854d0e;padding:2px 0;">- ${w.field}: ${w.message}</div>`).join('')}</div>` : ''}
    </div>
  `;
}

async function runAudit() {
  const listingId = document.getElementById('audit-listing-id')?.value?.trim();
  if (!listingId) { alert('Enter a listing ID'); return; }
  try {
    const res = await MallanAPI._fetch('/api/crm/listing-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listing_id: listingId }) });
    if (res.ok) {
      ListingAuditor.currentAudit = res;
      await initListingAuditor();
    } else alert(res.error || 'Audit failed');
  } catch { alert('Failed to run audit'); }
}

window.initListingAuditor = initListingAuditor;
window.runAudit = runAudit;
