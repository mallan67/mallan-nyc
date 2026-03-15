/**
 * Neighborhood Sentiment Index (#10) — CRM Module
 * Aggregates buyer sentiment from demand signals, search activity, and inventory.
 * Uses existing /api/crm/demand and /api/crm/market-pulse endpoints.
 */
/* global MallanAPI */

async function initNeighborhoodSentiment() {
  var c = document.getElementById('neighborhood-sentiment');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading sentiment data...</div>';

  try {
    var [demandRes, pulseRes] = await Promise.all([
      MallanAPI._fetch('/api/crm/demand?limit=100'),
      MallanAPI._fetch('/api/crm/market-pulse?limit=100')
    ]);

    var demands = demandRes.indices || demandRes.items || [];
    var snapshots = pulseRes.snapshots || pulseRes.items || [];

    // Build lookup from snapshots
    var snapshotMap = {};
    (snapshots).forEach(function(s) { snapshotMap[s.neighborhood] = s; });

    // Compute sentiment per neighborhood
    var sentiments = demands.map(function(d) {
      var snap = snapshotMap[d.neighborhood] || {};
      var demandScore = d.score || 0;
      var trend = d.trend || 'stable';
      var inventory = snap.inventory || 0;
      var avgDom = snap.avg_dom || 60;

      // Sentiment = demand strength + low inventory + fast absorption
      var sentimentScore = 0;
      sentimentScore += demandScore * 0.5; // 50% from demand
      sentimentScore += Math.max(0, (100 - inventory)) * 0.25; // 25% from low inventory (capped)
      sentimentScore += Math.max(0, (100 - avgDom)) * 0.25; // 25% from fast absorption

      var label = sentimentScore >= 70 ? 'Very Positive' : sentimentScore >= 50 ? 'Positive' : sentimentScore >= 30 ? 'Neutral' : 'Negative';
      var color = sentimentScore >= 70 ? '#059669' : sentimentScore >= 50 ? '#3b82f6' : sentimentScore >= 30 ? '#f59e0b' : '#ef4444';

      var reasons = [];
      if (demandScore >= 60) reasons.push('high buyer search activity');
      else if (demandScore <= 25) reasons.push('low buyer interest');
      if (inventory <= 30) reasons.push('low inventory');
      else if (inventory >= 100) reasons.push('high inventory');
      if (avgDom <= 30) reasons.push('fast absorption');
      else if (avgDom >= 90) reasons.push('slow sales');
      if (trend === 'up') reasons.push('demand trending up');
      else if (trend === 'down') reasons.push('demand declining');

      return {
        neighborhood: d.neighborhood,
        borough: d.borough || 'Manhattan',
        score: Math.round(sentimentScore),
        label: label,
        color: color,
        trend: trend,
        reasons: reasons.length > 0 ? reasons : ['balanced market'],
        demand: demandScore,
        inventory: inventory,
        avgDom: avgDom
      };
    }).sort(function(a, b) { return b.score - a.score; });

    renderSentiment(c, sentiments);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load sentiment data.</div>';
  }
}

function renderSentiment(container, sentiments) {
  if (sentiments.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">No demand data yet. Data populates from daily Demand Signals cron.</div>';
    return;
  }

  var rows = sentiments.map(function(s) {
    var trendIcon = s.trend === 'up' ? '<i class="fas fa-arrow-up" style="color:#059669;"></i>' :
                    s.trend === 'down' ? '<i class="fas fa-arrow-down" style="color:#ef4444;"></i>' :
                    '<i class="fas fa-minus" style="color:#9ca3af;"></i>';
    return '<tr style="border-top:1px solid #f3f4f6;">' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:600;">' + s.neighborhood + '</td>' +
      '<td style="padding:10px 12px;font-size:13px;color:#6b7280;">' + s.borough + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' +
        '<span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:' + s.color + ';color:white;font-weight:700;font-size:12px;line-height:36px;text-align:center;">' + s.score + '</span>' +
      '</td>' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:600;color:' + s.color + ';">' + s.label + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' + trendIcon + '</td>' +
      '<td style="padding:10px 12px;font-size:12px;color:#6b7280;">' + s.reasons.join(', ') + '</td>' +
    '</tr>';
  }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Neighborhood Sentiment Index</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Aggregate buyer sentiment from search activity, inventory levels, and absorption speed</p>
    </div>
    <div style="padding:16px 24px;">
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Neighborhood</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Borough</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Score</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Sentiment</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Trend</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Key Factors</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

window.initNeighborhoodSentiment = initNeighborhoodSentiment;
