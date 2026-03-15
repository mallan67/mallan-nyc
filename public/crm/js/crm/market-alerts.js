/**
 * Market Shock Detection (#16) — CRM Module
 * Detect sudden changes in inventory, demand, or pricing.
 * Uses demand index trends and market pulse snapshots.
 */
/* global MallanAPI */

async function initMarketAlerts() {
  var c = document.getElementById('market-alerts');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Scanning for market shocks...</div>';

  try {
    var [demandRes, pulseRes] = await Promise.all([
      MallanAPI._fetch('/api/crm/demand?limit=100'),
      MallanAPI._fetch('/api/crm/market-pulse?limit=100')
    ]);

    var demands = demandRes.indices || demandRes.items || [];
    var snapshots = pulseRes.snapshots || pulseRes.items || [];

    renderMarketAlerts(c, demands, snapshots);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load market data.</div>';
  }
}

function renderMarketAlerts(container, demands, snapshots) {
  var alerts = [];

  // Detect demand shocks (trend_delta > 15% or < -15%)
  demands.forEach(function(d) {
    var delta = d.trend_delta || 0;
    if (Math.abs(delta) >= 15) {
      alerts.push({
        type: delta > 0 ? 'surge' : 'drop',
        severity: Math.abs(delta) >= 30 ? 'critical' : 'warning',
        neighborhood: d.neighborhood,
        borough: d.borough || 'Manhattan',
        metric: 'Demand',
        change: (delta > 0 ? '+' : '') + Math.round(delta) + '%',
        detail: 'Demand index ' + (delta > 0 ? 'surged' : 'dropped') + ' ' + Math.abs(Math.round(delta)) + '% — score now ' + d.score + '/100',
        score: d.score
      });
    }

    // Low demand alert
    if (d.score <= 15 && d.trend === 'down') {
      alerts.push({
        type: 'drop',
        severity: 'info',
        neighborhood: d.neighborhood,
        borough: d.borough || 'Manhattan',
        metric: 'Demand',
        change: d.score + '/100',
        detail: 'Very low demand with declining trend — potential buyer drought',
        score: d.score
      });
    }

    // Hot market alert
    if (d.score >= 85 && d.trend === 'up') {
      alerts.push({
        type: 'surge',
        severity: 'info',
        neighborhood: d.neighborhood,
        borough: d.borough || 'Manhattan',
        metric: 'Demand',
        change: d.score + '/100',
        detail: 'Exceptionally high demand trending upward — potential bidding wars',
        score: d.score
      });
    }
  });

  // Detect inventory shocks from snapshots
  // (Would compare periods — simplified for now based on inventory vs DOM ratio)
  snapshots.forEach(function(s) {
    if (s.avg_dom && s.avg_dom <= 15 && s.inventory <= 10) {
      alerts.push({
        type: 'surge',
        severity: 'warning',
        neighborhood: s.neighborhood,
        borough: s.borough || '',
        metric: 'Inventory',
        change: s.inventory + ' listings',
        detail: 'Critically low inventory (' + s.inventory + ' listings) with rapid absorption (' + s.avg_dom + ' avg DOM)',
        score: 0
      });
    }
  });

  // Sort: critical first, then warning, then info
  var severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort(function(a, b) { return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9); });

  var alertsHtml = alerts.length === 0 ?
    '<div style="padding:40px;text-align:center;color:#9ca3af;"><i class="fas fa-check-circle" style="font-size:48px;margin-bottom:12px;display:block;color:#059669;"></i><p style="font-size:14px;">No significant market shocks detected</p><p style="font-size:12px;">Markets are operating within normal parameters</p></div>' :
    alerts.map(function(a) {
      var icon = a.type === 'surge' ? 'fa-arrow-up' : 'fa-arrow-down';
      var borderColor = a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6';
      var bgColor = a.severity === 'critical' ? '#fef2f2' : a.severity === 'warning' ? '#fffbeb' : '#eff6ff';
      var badge = a.severity === 'critical' ? '<span style="background:#ef4444;color:white;font-size:10px;padding:2px 6px;border-radius:9999px;font-weight:600;">CRITICAL</span>' :
                  a.severity === 'warning' ? '<span style="background:#f59e0b;color:white;font-size:10px;padding:2px 6px;border-radius:9999px;font-weight:600;">WARNING</span>' :
                  '<span style="background:#3b82f6;color:white;font-size:10px;padding:2px 6px;border-radius:9999px;font-weight:600;">ALERT</span>';

      return '<div style="background:' + bgColor + ';border-left:4px solid ' + borderColor + ';border-radius:8px;padding:14px 16px;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
          '<i class="fas ' + icon + '" style="color:' + borderColor + ';"></i>' +
          badge +
          '<span style="font-size:14px;font-weight:700;color:#111827;">' + a.neighborhood + '</span>' +
          '<span style="font-size:12px;color:#6b7280;">(' + a.metric + ': ' + a.change + ')</span>' +
        '</div>' +
        '<p style="font-size:13px;color:#374151;margin:0;">' + a.detail + '</p>' +
      '</div>';
    }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Market Shock Detection</h2>
          <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Sudden changes in demand, inventory, or pricing</p>
        </div>
        <div style="display:flex;gap:8px;">
          <span style="padding:4px 10px;background:#fef2f2;color:#ef4444;border-radius:9999px;font-size:11px;font-weight:600;">${alerts.filter(function(a){return a.severity==='critical';}).length} Critical</span>
          <span style="padding:4px 10px;background:#fffbeb;color:#f59e0b;border-radius:9999px;font-size:11px;font-weight:600;">${alerts.filter(function(a){return a.severity==='warning';}).length} Warning</span>
          <span style="padding:4px 10px;background:#eff6ff;color:#3b82f6;border-radius:9999px;font-size:11px;font-weight:600;">${alerts.filter(function(a){return a.severity==='info';}).length} Info</span>
        </div>
      </div>
    </div>
    <div style="padding:16px 24px;">${alertsHtml}</div>
  `;
}

window.initMarketAlerts = initMarketAlerts;
