/**
 * Market Alerts — CRM Module
 * Now powered by /api/crm/market-intelligence/query (live Trestle data).
 */
/* global MallanAPI */

async function initMarketAlerts() {
  var c = document.getElementById('market-alerts');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Scanning for market alerts...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/market-intelligence/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_type: 'sale' })
    });
    if (!res.ok) throw new Error(res.error);
    renderMarketAlerts(c, res.data.alerts || [], res.data.disclaimer);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load market alerts.</div>';
  }
}

function renderMarketAlerts(container, alerts, disclaimer) {
  var sevColors = {
    critical: { bg: '#fef2f2', border: '#fca5a5', icon: 'fa-exclamation-circle', iconColor: '#dc2626' },
    warning: { bg: '#fffbeb', border: '#fcd34d', icon: 'fa-exclamation-triangle', iconColor: '#d97706' },
    info: { bg: '#eff6ff', border: '#93c5fd', icon: 'fa-info-circle', iconColor: '#2563eb' }
  };

  if (alerts.length === 0) {
    container.innerHTML =
      '<div style="padding:20px 24px;">' +
        '<h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Market Alerts</h3>' +
        '<p style="font-size:12px;color:#6b7280;margin-bottom:24px;">Automatic detection of significant market changes.</p>' +
      '</div>' +
      '<div style="padding:40px;text-align:center;color:#059669;">' +
        '<i class="fas fa-check-circle" style="font-size:32px;margin-bottom:8px;"></i>' +
        '<p style="font-size:14px;font-weight:600;">No alerts</p>' +
        '<p style="font-size:12px;color:#6b7280;">No significant market changes detected in the current data.</p>' +
      '</div>' +
      '<p style="font-size:10px;color:#9ca3af;padding:16px 24px;line-height:1.5;">' + (disclaimer || '') + '</p>';
    return;
  }

  var cards = alerts.map(function(a) {
    var s = sevColors[a.severity] || sevColors.info;
    return '<div style="background:' + s.bg + ';border:1px solid ' + s.border + ';border-radius:10px;padding:14px 16px;display:flex;gap:12px;align-items:start;">' +
      '<i class="fas ' + s.icon + '" style="color:' + s.iconColor + ';font-size:18px;margin-top:2px;"></i>' +
      '<div style="flex:1;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
          '<span style="font-size:13px;font-weight:700;color:#111827;">' + a.neighborhood + '</span>' +
          '<span style="font-size:10px;font-weight:600;text-transform:uppercase;color:' + s.iconColor + ';">' + a.severity + '</span>' +
        '</div>' +
        '<p style="font-size:12px;color:#374151;margin:0;">' + a.message + '</p>' +
      '</div>' +
    '</div>';
  }).join('');

  container.innerHTML =
    '<div style="padding:20px 24px;">' +
      '<h3 style="font-size:16px;font-weight:700;margin-bottom:4px;">Market Alerts (' + alerts.length + ')</h3>' +
      '<p style="font-size:12px;color:#6b7280;margin-bottom:16px;">Automatic detection of significant market changes in your areas.</p>' +
    '</div>' +
    '<div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:10px;">' +
      cards +
    '</div>' +
    '<p style="font-size:10px;color:#9ca3af;padding:0 24px 16px;line-height:1.5;">' + (disclaimer || '') + '</p>';
}

window.initMarketAlerts = initMarketAlerts;
