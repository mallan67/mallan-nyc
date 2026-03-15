/**
 * Property Liquidity Score (#12) — CRM Module
 * Auto-loads agent's listings with liquidity scores. No manual ID entry.
 */
/* global MallanAPI */

async function initPropertyLiquidity() {
  var c = document.getElementById('property-liquidity');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Scoring your listings...</div>';

  try {
    var ctx = MallanAPI.getContext();
    var agentId = ctx?.user?.id;
    if (!agentId) { c.innerHTML = '<div style="padding:24px;color:#dc2626;">Not logged in.</div>'; return; }

    var res = await MallanAPI._fetch('/api/crm/transaction-probability?agent_id=' + agentId);
    var listings = res.listings || [];

    if (listings.length === 0) {
      c.innerHTML = '<div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;"><h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Property Liquidity</h2></div><div style="text-align:center;padding:40px;color:#9ca3af;"><p>No active listings to score.</p></div>';
      return;
    }

    // Compute liquidity from factors
    var scored = listings.map(function(l) {
      var avgScore = (l.factors || []).reduce(function(s, f) { return s + f.score; }, 0) / Math.max((l.factors || []).length, 1);
      return { ...l, liquidity: Math.round(avgScore) };
    }).sort(function(a, b) { return b.liquidity - a.liquidity; });

    var rows = scored.map(function(l) {
      var lc = l.liquidity >= 75 ? '#059669' : l.liquidity >= 55 ? '#3b82f6' : l.liquidity >= 35 ? '#f59e0b' : '#ef4444';
      var label = l.liquidity >= 75 ? 'Highly Liquid' : l.liquidity >= 55 ? 'Liquid' : l.liquidity >= 35 ? 'Moderate' : 'Illiquid';
      return '<tr style="border-top:1px solid #f3f4f6;">' +
        '<td style="padding:10px 12px;font-size:13px;font-weight:500;">' + l.address + '</td>' +
        '<td style="padding:10px 12px;font-size:13px;">$' + l.list_price.toLocaleString() + '</td>' +
        '<td style="padding:10px 12px;text-align:center;">' + l.days_on_market + '</td>' +
        '<td style="padding:10px 12px;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<div style="flex:1;background:#f3f4f6;border-radius:9999px;height:8px;overflow:hidden;">' +
              '<div style="background:' + lc + ';height:100%;width:' + l.liquidity + '%;border-radius:9999px;"></div>' +
            '</div>' +
            '<span style="font-size:13px;font-weight:700;color:' + lc + ';min-width:30px;">' + l.liquidity + '</span>' +
          '</div>' +
        '</td>' +
        '<td style="padding:10px 12px;font-size:12px;font-weight:600;color:' + lc + ';">' + label + '</td>' +
      '</tr>';
    }).join('');

    c.innerHTML = '<div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;"><h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Property Liquidity</h2><p style="font-size:13px;color:#6b7280;margin:4px 0 0;">' + scored.length + ' listings scored</p></div>' +
      '<div style="padding:16px 24px;"><div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f9fafb;">' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Address</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Price</th>' +
        '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">DOM</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Liquidity</th>' +
        '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Level</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to score listings.</div>';
  }
}

window.initPropertyLiquidity = initPropertyLiquidity;
window.runPropertyLiquidity = initPropertyLiquidity;
