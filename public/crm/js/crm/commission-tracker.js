/**
 * Commission Tracker — CRM Module
 * Deal commission tracking, payments, and P&L.
 */
/* global MallanAPI */

const CommTracker = { payments: [], pnl: null };
const PAY_STATUS_COLORS = { pending: '#f59e0b', received: '#059669', paid: '#3b82f6', void: '#ef4444' };

async function initCommissionTracker() {
  const c = document.getElementById('commAnalyticsView');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;">Loading commissions...</div>';
  try {
    const [payRes, pnlRes] = await Promise.all([
      MallanAPI._fetch('/api/crm/commissions?limit=100'),
      MallanAPI._fetch('/api/crm/commissions/stats'),
    ]);
    if (payRes.ok) CommTracker.payments = payRes.items;
    if (pnlRes.ok) CommTracker.pnl = pnlRes;
    renderCommissionTracker();
  } catch { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load.</div>'; }
}

function renderCommissionTracker() {
  const c = document.getElementById('commAnalyticsView');
  if (!c) return;
  const pnl = CommTracker.pnl || {};
  const payments = CommTracker.payments || [];

  c.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;">${pnl.total_deals || 0}</div>
        <div style="font-size:12px;color:#6b7280;">Total Deals</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#059669;">$${(pnl.total_gross || 0).toLocaleString()}</div>
        <div style="font-size:12px;color:#6b7280;">Gross Commission</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:#3b82f6;">$${(pnl.total_agent_earned || 0).toLocaleString()}</div>
        <div style="font-size:12px;color:#6b7280;">Agent Earned</div>
      </div>
      <div style="background:white;border-radius:8px;padding:16px;border:1px solid #e2e8f0;text-align:center;">
        <div style="font-size:24px;font-weight:700;color:${pnl.pending_receivables > 0 ? '#f59e0b' : '#059669'};">$${(pnl.pending_receivables || 0).toLocaleString()}</div>
        <div style="font-size:12px;color:#6b7280;">Pending Receivables</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;">
      <span style="font-size:14px;font-weight:600;">Payments (${payments.length})</span>
      <button onclick="showAddPaymentModal()" style="background:#C4A052;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">+ Record Payment</button>
    </div>
    <div style="padding:0 24px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;">Deal</th>
          <th style="padding:8px 12px;text-align:left;">Type</th>
          <th style="padding:8px 12px;text-align:right;">Amount</th>
          <th style="padding:8px 12px;text-align:center;">Status</th>
          <th style="padding:8px 12px;text-align:right;">Date</th>
          <th style="padding:8px 12px;text-align:left;">Reference</th>
        </tr></thead>
        <tbody>
          ${payments.map(p => `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 12px;">${p.deal?.property_address || p.deal_id}</td>
            <td style="padding:8px 12px;">${p.payment_type.replace(/_/g, ' ')}</td>
            <td style="padding:8px 12px;text-align:right;font-weight:600;">$${Number(p.amount).toLocaleString()}</td>
            <td style="padding:8px 12px;text-align:center;"><span style="color:${PAY_STATUS_COLORS[p.status] || '#6b7280'};font-weight:600;">${p.status}</span></td>
            <td style="padding:8px 12px;text-align:right;">${p.date ? new Date(p.date).toLocaleDateString() : '-'}</td>
            <td style="padding:8px 12px;font-size:12px;color:#6b7280;">${p.reference || '-'}</td>
          </tr>`).join('')}
          ${payments.length === 0 ? '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">No commission payments recorded.</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    ${pnl.deals && pnl.deals.length > 0 ? `
      <div style="padding:0 24px 24px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Deal P&L</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;">Property</th><th style="text-align:right;padding:6px 8px;">Gross</th><th style="text-align:right;padding:6px 8px;">Agent Fee</th><th style="text-align:right;padding:6px 8px;">Company Fee</th><th style="text-align:right;padding:6px 8px;">Received</th><th style="text-align:right;padding:6px 8px;">Balance</th></tr>
          ${pnl.deals.map(d => `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px 8px;">${d.property_address || d.deal_id}</td>
            <td style="text-align:right;padding:6px 8px;">$${d.gross_commission.toLocaleString()}</td>
            <td style="text-align:right;padding:6px 8px;">$${d.agent_fee.toLocaleString()}</td>
            <td style="text-align:right;padding:6px 8px;">$${d.company_fee.toLocaleString()}</td>
            <td style="text-align:right;padding:6px 8px;">$${d.received.toLocaleString()}</td>
            <td style="text-align:right;padding:6px 8px;color:${d.balance > 0 ? '#f59e0b' : '#059669'};font-weight:600;">$${d.balance.toLocaleString()}</td>
          </tr>`).join('')}
        </table>
      </div>
    ` : ''}
  `;
}

function showAddPaymentModal() {
  const m = document.createElement('div');
  m.id = 'pay-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  m.innerHTML = `<div role="dialog" aria-modal="true" style="background:white;border-radius:12px;width:420px;padding:24px;position:relative;">
    <button onclick="document.getElementById('pay-modal').remove()" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#9ca3af;" aria-label="Close">&times;</button>
    <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;">Record Payment</h2>
    <div style="margin-bottom:12px;"><label for="pay-deal" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Deal ID</label><input id="pay-deal" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <div style="margin-bottom:12px;"><label for="pay-type" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Type</label><select id="pay-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"><option value="received">Received</option><option value="agent_split">Agent Split</option><option value="company_split">Company Split</option><option value="referral">Referral</option><option value="adjustment">Adjustment</option></select></div>
    <div style="margin-bottom:12px;"><label for="pay-amount" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Amount ($)</label><input id="pay-amount" type="number" step="0.01" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <div style="margin-bottom:12px;"><label for="pay-date" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Date</label><input id="pay-date" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <div style="margin-bottom:12px;"><label for="pay-ref" style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Reference</label><input id="pay-ref" placeholder="Check #, wire ref" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
    <button onclick="recordPayment()" style="width:100%;background:#C4A052;color:white;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;">Record</button>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

async function recordPayment() {
  const data = {
    deal_id: document.getElementById('pay-deal')?.value,
    payment_type: document.getElementById('pay-type')?.value,
    amount: parseFloat(document.getElementById('pay-amount')?.value) || 0,
    date: document.getElementById('pay-date')?.value || undefined,
    reference: document.getElementById('pay-ref')?.value || undefined,
  };
  if (!data.deal_id || !data.amount) { alert('Deal ID and amount required'); return; }
  try {
    const res = await MallanAPI._fetch('/api/crm/commissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { document.getElementById('pay-modal')?.remove(); await initCommissionTracker(); }
    else alert(res.error || 'Failed');
  } catch { alert('Failed'); }
}

window.initCommissionTracker = initCommissionTracker;
window.showAddPaymentModal = showAddPaymentModal;
window.recordPayment = recordPayment;
