/**
 * CMA Engine — CRM Module
 * Comparable Market Analysis reports with auto-comp finding.
 */
/* global MallanAPI */

const CmaEngine = { reports: [], currentReport: null };

async function initCmaEngine() {
  const c = document.getElementById('cma-engine');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading CMA reports...</div>';
  try {
    const res = await MallanAPI._fetch('/api/crm/cma?limit=50');
    if (res.ok) CmaEngine.reports = res.items;
    renderCmaEngine();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load CMA data.</div>'; }
}

function renderCmaEngine() {
  const c = document.getElementById('cma-engine');
  if (!c) return;
  const reports = CmaEngine.reports || [];

  c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;">
      <span style="font-size:13px;color:#6b7280;">${reports.length} reports</span>
      <button onclick="showCreateCmaModal()" style="background:#C4A052;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">+ New CMA</button>
    </div>
    <div style="padding:0 24px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
      ${reports.map(r => `
        <div onclick="showCmaDetail('${r.id}')" style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;cursor:pointer;">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${r.property_address}</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">${r.neighborhood || ''} ${r.borough || ''}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:18px;font-weight:700;color:#059669;">${r.estimated_value ? '$' + Number(r.estimated_value).toLocaleString() : 'Pending'}</span>
            <span style="background:${r.status === 'final' ? '#dcfce7' : r.status === 'sent' ? '#dbeafe' : '#f3f4f6'};padding:2px 8px;border-radius:10px;font-size:11px;">${r.status}</span>
          </div>
          ${r.price_range_low && r.price_range_high ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">Range: $${Number(r.price_range_low).toLocaleString()} - $${Number(r.price_range_high).toLocaleString()}</div>` : ''}
        </div>
      `).join('')}
      ${reports.length === 0 ? '<div style="color:#9ca3af;font-size:13px;grid-column:1/-1;">No CMA reports yet. Create one to auto-find comparable listings.</div>' : ''}
    </div>
  `;
}

function showCreateCmaModal() {
  const m = document.createElement('div');
  m.id = 'cma-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:500px;padding:24px;position:relative;max-height:90vh;overflow-y:auto;">
    <button onclick="document.getElementById('cma-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
    <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">New CMA Report</h2>
    ${['property_address|Property Address|text', 'neighborhood|Neighborhood|text', 'borough|Borough|text', 'listing_type|Type|select:sale,rent', 'property_type|Property Type|text', 'bedrooms|Bedrooms|number', 'bathrooms|Bathrooms|number', 'living_area|Living Area (sqft)|number'].map(f => {
      const [id, label, type] = f.split('|');
      if (type.startsWith('select:')) {
        const opts = type.split(':')[1].split(',');
        return `<div style="margin-bottom:12px;"><label for="cma-${id}" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">${label}</label><select id="cma-${id}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">${opts.map(o => `<option value="${o}">${o}</option>`).join('')}</select></div>`;
      }
      return `<div style="margin-bottom:12px;"><label for="cma-${id}" style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">${label}</label><input id="cma-${id}" type="${type}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;"></div>`;
    }).join('')}
    <button onclick="createCma()" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Generate CMA</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function createCma() {
  const data = {};
  ['property_address','neighborhood','borough','listing_type','property_type','bedrooms','bathrooms','living_area'].forEach(f => {
    const el = document.getElementById('cma-' + f);
    if (el) data[f] = el.type === 'number' ? (el.value ? Number(el.value) : undefined) : el.value;
  });
  if (!data.property_address) { alert('Property address is required'); return; }
  try {
    const res = await MallanAPI._fetch('/api/crm/cma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { document.getElementById('cma-modal')?.remove(); await initCmaEngine(); }
    else alert(res.error || 'Failed');
  } catch { alert('Failed to create CMA'); }
}

async function showCmaDetail(id) {
  const m = document.createElement('div');
  m.id = 'cma-detail';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = '<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:700px;max-height:85vh;overflow-y:auto;padding:24px;position:relative;"><div style="color:#6b7280;">Loading...</div></div>';
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });

  try {
    const res = await MallanAPI._fetch('/api/crm/cma/' + id);
    if (!res.ok) throw new Error(res.error);
    const r = res.item;
    const comps = r.comps || [];
    const subj = r.subject_details || {};

    m.querySelector('div > div').innerHTML = `
      <button onclick="document.getElementById('cma-detail').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px;">${r.property_address}</h2>
      <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${r.neighborhood || ''} ${r.borough || ''} | ${subj.bedrooms || '?'} bed / ${subj.bathrooms || '?'} bath / ${subj.living_area ? subj.living_area + ' sqft' : '?'}</div>

      <div style="display:flex;gap:16px;margin-bottom:20px;">
        <div style="background:#dcfce7;padding:16px 24px;border-radius:10px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:#166534;">$${r.estimated_value ? Number(r.estimated_value).toLocaleString() : 'N/A'}</div>
          <div style="font-size:12px;color:#166534;">Estimated Value</div>
        </div>
        <div style="padding:16px;text-align:center;">
          <div style="font-size:14px;color:#6b7280;">$${r.price_range_low ? Number(r.price_range_low).toLocaleString() : '?'} - $${r.price_range_high ? Number(r.price_range_high).toLocaleString() : '?'}</div>
          <div style="font-size:12px;color:#6b7280;">Price Range</div>
        </div>
      </div>

      <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Comparable Listings (${comps.length})</h3>
      <table style="width:100%;font-size:12px;border-collapse:collapse;margin-bottom:16px;">
        <tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;">Address</th><th style="text-align:right;padding:6px 8px;">Price</th><th style="text-align:right;padding:6px 8px;">Adjusted</th><th style="text-align:center;padding:6px 8px;">Beds</th><th style="text-align:center;padding:6px 8px;">Match</th></tr>
        ${comps.map(c => `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:6px 8px;">${c.address || c.listing_id}</td><td style="text-align:right;padding:6px 8px;">$${c.list_price?.toLocaleString()}</td><td style="text-align:right;padding:6px 8px;font-weight:600;">$${c.adjusted_price?.toLocaleString()}</td><td style="text-align:center;padding:6px 8px;">${c.bedrooms ?? '-'}</td><td style="text-align:center;padding:6px 8px;">${c.similarity_score}%</td></tr>`).join('')}
      </table>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="updateCmaStatus('${r.id}','final')" style="background:#059669;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Mark Final</button>
        <button onclick="updateCmaStatus('${r.id}','sent')" style="background:#3b82f6;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Mark Sent</button>
      </div>
    `;
  } catch { m.querySelector('div > div').innerHTML = '<div style="color:#dc2626;">Failed to load CMA.</div>'; }
}

async function updateCmaStatus(id, status) {
  await MallanAPI._fetch('/api/crm/cma/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  document.getElementById('cma-detail')?.remove();
  await initCmaEngine();
}

window.initCmaEngine = initCmaEngine;
window.showCreateCmaModal = showCreateCmaModal;
window.createCma = createCma;
window.showCmaDetail = showCmaDetail;
window.updateCmaStatus = updateCmaStatus;
