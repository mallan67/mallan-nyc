/**
 * Document Vault — CRM Module
 * Document management, signature tracking, compliance checking.
 */
/* global MallanAPI */

const DocVault = { documents: [], filters: { doc_type: '', status: '' } };

const DOC_TYPE_LABELS = { contract: 'Contract', disclosure: 'Disclosure', co_broke: 'Co-Broke Agreement', rider: 'Rider', amendment: 'Amendment', other: 'Other' };
const DOC_STATUS_COLORS = { uploaded: '#6b7280', sent: '#3b82f6', viewed: '#f59e0b', signed: '#059669', countersigned: '#7c3aed', expired: '#ef4444' };

async function initDocumentVault() {
  const c = document.getElementById('document-vault');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading documents...</div>';
  try {
    const params = new URLSearchParams();
    if (DocVault.filters.doc_type) params.set('doc_type', DocVault.filters.doc_type);
    if (DocVault.filters.status) params.set('status', DocVault.filters.status);
    params.set('limit', '100');
    const res = await MallanAPI._fetch('/api/crm/documents?' + params.toString());
    if (res.ok) DocVault.documents = res.items;
    renderDocumentVault();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load documents.</div>'; }
}

function renderDocumentVault() {
  const c = document.getElementById('document-vault');
  if (!c) return;
  const docs = DocVault.documents;

  c.innerHTML = `
    <div style="display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;align-items:center;">
      <select id="dv-type-filter" onchange="filterDocs()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Types</option>
        ${Object.entries(DOC_TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <select id="dv-status-filter" onchange="filterDocs()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
        <option value="">All Statuses</option>
        ${Object.keys(DOC_STATUS_COLORS).map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <button onclick="showUploadDocModal()" style="margin-left:auto;background:#C4A052;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">+ Upload Document</button>
    </div>
    <div style="padding:0 24px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;">Name</th>
          <th style="padding:8px 12px;text-align:left;">Type</th>
          <th style="padding:8px 12px;text-align:left;">Deal</th>
          <th style="padding:8px 12px;text-align:center;">Status</th>
          <th style="padding:8px 12px;text-align:center;">Signatures</th>
          <th style="padding:8px 12px;text-align:right;">Date</th>
        </tr></thead>
        <tbody>
          ${docs.map(d => `<tr style="border-bottom:1px solid #f1f5f9;cursor:pointer;" onclick="showDocDetail('${d.id}')">
            <td style="padding:8px 12px;font-weight:600;">${d.name}</td>
            <td style="padding:8px 12px;">${DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</td>
            <td style="padding:8px 12px;">${d.deal?.property_address || '-'}</td>
            <td style="padding:8px 12px;text-align:center;"><span style="color:${DOC_STATUS_COLORS[d.status] || '#6b7280'};font-weight:600;">${d.status}</span></td>
            <td style="padding:8px 12px;text-align:center;">${d._count?.signatures || 0}</td>
            <td style="padding:8px 12px;text-align:right;">${new Date(d.created_at).toLocaleDateString()}</td>
          </tr>`).join('')}
          ${docs.length === 0 ? '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">No documents.</td></tr>' : ''}
        </tbody>
      </table>
    </div>
  `;
}

async function filterDocs() {
  DocVault.filters.doc_type = document.getElementById('dv-type-filter')?.value || '';
  DocVault.filters.status = document.getElementById('dv-status-filter')?.value || '';
  await initDocumentVault();
}

function showUploadDocModal() {
  const m = document.createElement('div');
  m.id = 'doc-upload-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:420px;padding:24px;position:relative;">
    <button onclick="document.getElementById('doc-upload-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
    <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Upload Document</h2>
    <div style="margin-bottom:12px;"><label for="doc-name" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Name</label><input id="doc-name" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <div style="margin-bottom:12px;"><label for="doc-type" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Type</label><select id="doc-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">${Object.entries(DOC_TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div style="margin-bottom:12px;"><label for="doc-url" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">File URL</label><input id="doc-url" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <div style="margin-bottom:12px;"><label for="doc-deal" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Deal ID (optional)</label><input id="doc-deal" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;"><input type="checkbox" id="doc-sig"> Requires Signature</label>
    <button onclick="uploadDoc()" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Upload</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function uploadDoc() {
  const data = {
    name: document.getElementById('doc-name')?.value,
    doc_type: document.getElementById('doc-type')?.value,
    file_url: document.getElementById('doc-url')?.value,
    deal_id: document.getElementById('doc-deal')?.value || undefined,
    requires_signature: document.getElementById('doc-sig')?.checked,
  };
  if (!data.name || !data.file_url) { alert('Name and File URL required'); return; }
  try {
    const res = await MallanAPI._fetch('/api/crm/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { document.getElementById('doc-upload-modal')?.remove(); await initDocumentVault(); }
    else alert(res.error || 'Failed');
  } catch { alert('Failed to upload'); }
}

async function showDocDetail(id) {
  const m = document.createElement('div');
  m.id = 'doc-detail';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = '<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:550px;max-height:85vh;overflow-y:auto;padding:24px;position:relative;"><div style="color:#6b7280;">Loading...</div></div>';
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  try {
    const res = await MallanAPI._fetch('/api/crm/documents/' + id);
    if (!res.ok) throw new Error(res.error);
    const d = res.item;
    m.querySelector('div > div').innerHTML = `
      <button onclick="document.getElementById('doc-detail').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">${d.name}</h2>
      <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${DOC_TYPE_LABELS[d.doc_type] || d.doc_type} | <span style="color:${DOC_STATUS_COLORS[d.status]};font-weight:600;">${d.status}</span></div>
      ${d.deal ? `<div style="font-size:13px;margin-bottom:8px;">Deal: ${d.deal.property_address || d.deal_id}</div>` : ''}
      ${d.file_url ? `<div style="margin-bottom:16px;"><a href="${d.file_url}" target="_blank" style="color:#3b82f6;font-size:13px;">View File</a></div>` : ''}
      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Signatures (${d.signatures?.length || 0})</h3>
      ${(d.signatures || []).map(s => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
          <div><span style="font-weight:600;">${s.signer_name}</span> <span style="color:#6b7280;">(${s.signer_role})</span></div>
          <span style="color:${s.status === 'signed' ? '#059669' : '#f59e0b'};font-weight:600;">${s.status}</span>
        </div>
      `).join('')}
      ${d.notes ? `<div style="margin-top:12px;font-size:13px;color:#6b7280;">${d.notes}</div>` : ''}
    `;
  } catch { m.querySelector('div > div').innerHTML = '<div style="color:#dc2626;">Failed to load document.</div>'; }
}

window.initDocumentVault = initDocumentVault;
window.filterDocs = filterDocs;
window.showUploadDocModal = showUploadDocModal;
window.uploadDoc = uploadDoc;
window.showDocDetail = showDocDetail;
