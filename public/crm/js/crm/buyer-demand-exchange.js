/**
 * Private Buyer Demand Exchange (#1) — CRM Module
 * Anonymized buyer demand signals per building/neighborhood.
 */
/* global MallanAPI */

async function initBuyerDemandExchange() {
  var c = document.getElementById('buyer-demand-exchange');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading buyer demand...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/buyer-demand-exchange');
    if (!res.ok) { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load.</div>'; return; }
    renderDemandExchange(c, res);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load buyer demand data.</div>';
  }
}

function demandColor(level) {
  if (level === 'very_high') return '#059669';
  if (level === 'high') return '#3b82f6';
  if (level === 'moderate') return '#f59e0b';
  return '#ef4444';
}

function renderDemandExchange(container, data) {
  var neighborhoods = data.neighborhoods || [];

  var rows = neighborhoods.map(function(n) {
    var color = demandColor(n.demand_level);
    var label = n.demand_level.replace('_', ' ');
    label = label.charAt(0).toUpperCase() + label.slice(1);
    return '<tr style="border-top:1px solid #f3f4f6;cursor:pointer;" onclick="drillDemand(\'' + n.neighborhood.replace(/'/g, "\\'") + '\')">' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:600;color:#2563eb;">' + n.neighborhood + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' +
        '<span style="display:inline-block;min-width:28px;height:28px;border-radius:50%;background:' + color + ';color:white;font-weight:700;font-size:12px;line-height:28px;text-align:center;">' + n.active_buyers + '</span>' +
      '</td>' +
      '<td style="padding:10px 12px;font-size:12px;font-weight:600;color:' + color + ';">' + label + '</td>' +
      '<td style="padding:10px 12px;text-align:center;font-size:13px;">' + n.avg_intent + '/100</td>' +
    '</tr>';
  }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Private Buyer Demand Exchange</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Anonymized buyer interest by neighborhood — click a row for detail</p>
        </div>
        <div style="padding:6px 14px;background:#059669;color:white;border-radius:9999px;font-size:13px;font-weight:600;">
          ${data.total_active_buyers || 0} Active Buyers
        </div>
      </div>
    </div>
    <div style="padding:16px 24px;">
      <div id="demand-drill" style="display:none;margin-bottom:16px;"></div>
      ${neighborhoods.length > 0 ? `
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Neighborhood</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Buyers</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Demand</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Avg Intent</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div style="padding:40px;text-align:center;color:#9ca3af;">No active buyer profiles yet. Data populates from buyer intent cron.</div>'}
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        <i class="fas fa-lock" style="margin-right:4px;"></i>
        All data is anonymized. Buyer identities are never exposed. Useful for attracting off-market sellers and sourcing pre-market inventory.
      </p>
    </div>
  `;
}

async function drillDemand(neighborhood) {
  var drill = document.getElementById('demand-drill');
  if (!drill) return;
  drill.style.display = '';
  drill.innerHTML = '<div style="padding:16px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading detail...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/buyer-demand-exchange?neighborhood=' + encodeURIComponent(neighborhood));
    if (!res.ok) { drill.innerHTML = '<div style="padding:16px;color:#dc2626;">Failed.</div>'; return; }

    var budgetHtml = res.budget_range ?
      '$' + (res.budget_range.min || 0).toLocaleString() + ' – $' + (res.budget_range.max || 0).toLocaleString() :
      'Not specified';

    var layoutsHtml = (res.preferred_layouts || []).map(function(l) {
      return '<span style="padding:4px 10px;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:11px;font-weight:600;">' + l.layout + ' (' + l.count + ')</span>';
    }).join(' ');

    var stagesHtml = Object.entries(res.stages || {}).map(function(e) {
      return '<span style="font-size:12px;color:#6b7280;">' + e[0] + ': <strong>' + e[1] + '</strong></span>';
    }).join(' &bull; ');

    drill.innerHTML = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="font-size:16px;font-weight:700;color:#1e40af;margin:0;">${neighborhood}</h3>
          <button onclick="document.getElementById('demand-drill').style.display='none'" style="background:none;border:none;color:#6b7280;cursor:pointer;font-size:16px;"><i class="fas fa-times"></i></button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;">
          <div><p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 2px;">Active Buyers</p><p style="font-size:20px;font-weight:800;color:#1e40af;margin:0;">${res.active_buyers}</p></div>
          <div><p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 2px;">Budget Range</p><p style="font-size:13px;font-weight:600;color:#111827;margin:0;">${budgetHtml}</p></div>
          <div><p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 2px;">Avg Intent</p><p style="font-size:20px;font-weight:800;color:#1e40af;margin:0;">${res.avg_intent_strength}/100</p></div>
          <div><p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 2px;">Demand Level</p><p style="font-size:13px;font-weight:600;color:${demandColor(res.demand_level)};margin:0;">${(res.demand_level || '').replace('_', ' ')}</p></div>
        </div>
        <div style="margin-bottom:8px;"><span style="font-size:11px;font-weight:600;color:#6b7280;">Preferred Layouts:</span> ${layoutsHtml || '<span style="color:#9ca3af;font-size:12px;">—</span>'}</div>
        <div><span style="font-size:11px;font-weight:600;color:#6b7280;">Buyer Stages:</span> ${stagesHtml || '<span style="color:#9ca3af;font-size:12px;">—</span>'}</div>
      </div>
    `;
  } catch (e) {
    drill.innerHTML = '<div style="padding:16px;color:#dc2626;">Failed to load detail.</div>';
  }
}

window.initBuyerDemandExchange = initBuyerDemandExchange;
window.drillDemand = drillDemand;
