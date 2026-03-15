/**
 * Offer Outcome Intelligence (#13) — CRM Module
 * Aggregate historical offer results: avg accepted offer vs list price.
 * Uses /api/crm/commissions (deals with close prices) as data source.
 */
/* global MallanAPI */

async function initOfferIntelligence() {
  var c = document.getElementById('offer-intelligence');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading offer data...</div>';

  try {
    // Fetch deals and market pulse for neighborhood-level analysis
    var [dealsRes, pulseRes] = await Promise.all([
      MallanAPI._fetch('/api/crm/commissions?limit=200'),
      MallanAPI._fetch('/api/crm/market-pulse?limit=100')
    ]);

    var deals = dealsRes.payments || dealsRes.items || [];
    var snapshots = pulseRes.snapshots || pulseRes.items || [];

    renderOfferIntelligence(c, deals, snapshots);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load offer data.</div>';
  }
}

function renderOfferIntelligence(container, deals, snapshots) {
  // Aggregate by neighborhood
  var byNeighborhood = {};
  deals.forEach(function(d) {
    var nh = d.neighborhood || d.listing_neighborhood || 'Unknown';
    if (!byNeighborhood[nh]) byNeighborhood[nh] = { deals: 0, totalRatio: 0, count: 0 };
    byNeighborhood[nh].deals++;
    if (d.close_price && d.list_price && d.list_price > 0) {
      var ratio = d.close_price / d.list_price;
      byNeighborhood[nh].totalRatio += ratio;
      byNeighborhood[nh].count++;
    }
  });

  var neighborhoods = Object.keys(byNeighborhood).map(function(nh) {
    var data = byNeighborhood[nh];
    var avgRatio = data.count > 0 ? data.totalRatio / data.count : null;
    return {
      neighborhood: nh,
      deals: data.deals,
      avgRatio: avgRatio,
      avgPct: avgRatio ? Math.round(avgRatio * 100) : null
    };
  }).filter(function(n) { return n.avgRatio !== null; })
    .sort(function(a, b) { return (b.avgPct || 0) - (a.avgPct || 0); });

  var totalDeals = deals.length;
  var overallRatio = neighborhoods.reduce(function(s, n) { return s + (n.avgRatio || 0); }, 0) / Math.max(neighborhoods.length, 1);
  var overallPct = Math.round(overallRatio * 100);

  var rows = neighborhoods.map(function(n) {
    var color = (n.avgPct || 0) >= 100 ? '#059669' : (n.avgPct || 0) >= 97 ? '#3b82f6' : (n.avgPct || 0) >= 95 ? '#f59e0b' : '#ef4444';
    var label = (n.avgPct || 0) >= 100 ? 'Above asking' : (n.avgPct || 0) >= 98 ? 'At asking' : 'Below asking';
    return '<tr style="border-top:1px solid #f3f4f6;">' +
      '<td style="padding:10px 12px;font-size:13px;font-weight:600;">' + n.neighborhood + '</td>' +
      '<td style="padding:10px 12px;text-align:center;font-size:13px;">' + n.deals + '</td>' +
      '<td style="padding:10px 12px;text-align:center;font-size:14px;font-weight:700;color:' + color + ';">' + n.avgPct + '%</td>' +
      '<td style="padding:10px 12px;font-size:12px;color:' + color + ';">' + label + '</td>' +
    '</tr>';
  }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Offer Outcome Intelligence</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Average accepted offer vs list price by neighborhood</p>
    </div>
    <div style="padding:16px 24px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
        <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Total Deals</p>
          <p style="font-size:28px;font-weight:800;color:#111827;margin:0;">${totalDeals}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Avg Close vs List</p>
          <p style="font-size:28px;font-weight:800;color:${overallPct >= 98 ? '#059669' : '#f59e0b'};margin:0;">${overallPct || '--'}%</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Neighborhoods</p>
          <p style="font-size:28px;font-weight:800;color:#111827;margin:0;">${neighborhoods.length}</p>
        </div>
      </div>

      ${neighborhoods.length > 0 ? `
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Neighborhood</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Deals</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Avg Close/List</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Trend</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ` : '<div style="padding:40px;text-align:center;color:#9ca3af;">No closed deals with price data available yet.</div>'}

      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Based on closed deals in the CRM. More data = more accurate neighborhood averages.
      </p>
    </div>
  `;
}

window.initOfferIntelligence = initOfferIntelligence;
