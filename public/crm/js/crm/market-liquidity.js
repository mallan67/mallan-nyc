/**
 * Market Liquidity Index — CRM Module
 * Now powered by /api/crm/market-intelligence/query (live Trestle data).
 */
/* global MallanAPI */

async function initMarketLiquidity() {
  var c = document.getElementById('market-liquidity');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Computing liquidity from live RLS data...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/market-intelligence/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_type: 'sale' })
    });
    if (!res.ok) throw new Error(res.error);
    renderMarketLiquidity(c, res.data.liquidity || [], res.data.disclaimer);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load liquidity data.</div>';
  }
}

function liqColor(idx) {
  if (idx >= 0.70) return '#059669';
  if (idx >= 0.50) return '#3b82f6';
  if (idx >= 0.30) return '#f59e0b';
  return '#ef4444';
}

function renderMarketLiquidity(container, neighborhoods, disclaimer) {
  if (neighborhoods.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">No liquidity data available. Try refreshing.</div>';
    return;
  }

  var rows = neighborhoods.map(function(n) {
    var barWidth = Math.round(n.index * 100);
    var color = liqColor(n.index);
    var comps = n.components || {};
    var detail = 'DOM: ' + (comps.absorptionSpeed?.value || '-') + ' | Inventory: ' + (comps.inventoryLevel?.value || '-') + ' | New: ' + (comps.supplyTrend?.value || '-');

    return '<tr style="border-top:1px solid #f3f4f6;" title="' + detail + '">' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:600;">' + n.neighborhood + '</td>' +
      '<td style="padding:10px 12px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<div style="flex:1;background:#f3f4f6;border-radius:9999px;height:8px;overflow:hidden;">' +
            '<div style="background:' + color + ';height:100%;width:' + barWidth + '%;border-radius:9999px;"></div>' +
          '</div>' +
          '<span style="font-size:14px;font-weight:700;color:' + color + ';min-width:40px;text-align:right;">' + n.index.toFixed(2) + '</span>' +
        '</div>' +
      '</td>' +
      '<td style="padding:10px 12px;font-size:12px;font-weight:600;color:' + color + ';">' + n.label + '</td>' +
      '<td style="padding:10px 12px;font-size:11px;color:#6b7280;max-width:300px;">' + n.interpretation + '</td>' +
    '</tr>';
  }).join('');

  container.innerHTML =
    '<div style="padding:20px 24px;">' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Market Liquidity Index</h3>' +
      '<p style="font-size:12px;color:#6b7280;margin-bottom:16px;">How easy is it to buy or sell in each neighborhood? Scores from 0.00 (stagnant) to 1.00 (highly liquid).</p>' +
    '</div>' +
    '<div style="padding:0 24px 24px;overflow-x:auto;">' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
        '<thead><tr style="background:#f8fafc;">' +
          '<th style="padding:8px 12px;text-align:left;">Neighborhood</th>' +
          '<th style="padding:8px 12px;text-align:left;min-width:200px;">Liquidity</th>' +
          '<th style="padding:8px 12px;text-align:left;">Rating</th>' +
          '<th style="padding:8px 12px;text-align:left;">Interpretation</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<p style="font-size:10px;color:#9ca3af;padding:0 24px 16px;line-height:1.5;">' + (disclaimer || '') + '</p>';
}

window.initMarketLiquidity = initMarketLiquidity;
