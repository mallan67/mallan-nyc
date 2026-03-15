/**
 * Pre-Market Inventory Network (#2) — CRM Module
 * Identify potential sellers before they list using readiness signals.
 * Uses existing /api/crm/seller-leads endpoint (seller readiness system).
 */
/* global MallanAPI */

async function initPremarketInventory() {
  var c = document.getElementById('premarket-inventory');
  if (!c) return;
  c.innerHTML = '<div style="padding:24px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Loading pre-market signals...</div>';

  try {
    var res = await MallanAPI._fetch('/api/crm/seller-leads?limit=100');
    var leads = res.leads || res.items || [];
    renderPremarket(c, leads);
  } catch (e) {
    c.innerHTML = '<div style="padding:24px;color:#dc2626;">Failed to load pre-market data.</div>';
  }
}

function gradeColor(grade) {
  if (grade === 'A') return '#059669';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

function renderPremarket(container, leads) {
  // Group by neighborhood
  var byNeighborhood = {};
  leads.forEach(function(l) {
    var nh = l.neighborhood || l.borough || 'Unknown';
    if (!byNeighborhood[nh]) byNeighborhood[nh] = { total: 0, highProb: 0, leads: [] };
    byNeighborhood[nh].total++;
    if (l.readiness_score >= 60 || l.score_grade === 'A' || l.score_grade === 'B') {
      byNeighborhood[nh].highProb++;
    }
    byNeighborhood[nh].leads.push(l);
  });

  var nhSummary = Object.entries(byNeighborhood)
    .map(function(e) { return { neighborhood: e[0], total: e[1].total, highProb: e[1].highProb }; })
    .sort(function(a, b) { return b.highProb - a.highProb; });

  // Summary stats
  var totalLeads = leads.length;
  var highProb = leads.filter(function(l) { return l.readiness_score >= 60; }).length;
  var avgScore = totalLeads > 0 ? Math.round(leads.reduce(function(s, l) { return s + (l.readiness_score || 0); }, 0) / totalLeads) : 0;

  // Top prospects table
  var sorted = leads.slice().sort(function(a, b) { return (b.readiness_score || 0) - (a.readiness_score || 0); });
  var topRows = sorted.slice(0, 25).map(function(l) {
    var gc = gradeColor(l.score_grade);
    var statusBadge = l.status === 'contacted' ? '<span style="background:#eff6ff;color:#2563eb;font-size:10px;padding:2px 6px;border-radius:9999px;">Contacted</span>' :
                      l.status === 'replied' ? '<span style="background:#dcfce7;color:#059669;font-size:10px;padding:2px 6px;border-radius:9999px;">Replied</span>' :
                      l.status === 'meeting' ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;padding:2px 6px;border-radius:9999px;">Meeting</span>' :
                      l.status === 'signed' ? '<span style="background:#059669;color:white;font-size:10px;padding:2px 6px;border-radius:9999px;">Signed</span>' :
                      l.status === 'declined' ? '<span style="background:#fee2e2;color:#991b1b;font-size:10px;padding:2px 6px;border-radius:9999px;">Declined</span>' :
                      '<span style="background:#f3f4f6;color:#6b7280;font-size:10px;padding:2px 6px;border-radius:9999px;">New</span>';

    return '<tr style="border-top:1px solid #f3f4f6;">' +
      '<td style="padding:8px 12px;font-size:13px;font-weight:500;">' + (l.address || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:12px;color:#6b7280;">' + (l.borough || '') + '</td>' +
      '<td style="padding:8px 12px;text-align:center;"><span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:' + gc + ';color:white;font-weight:700;font-size:11px;line-height:28px;">' + (l.score_grade || '?') + '</span></td>' +
      '<td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:600;color:' + gc + ';">' + (l.readiness_score || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:center;">' + statusBadge + '</td>' +
    '</tr>';
  }).join('');

  var nhCards = nhSummary.slice(0, 8).map(function(n) {
    return '<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">' +
      '<p style="font-size:11px;font-weight:600;color:#6b7280;margin:0 0 4px;">' + n.neighborhood + '</p>' +
      '<p style="font-size:20px;font-weight:800;color:#111827;margin:0;">' + n.total + '</p>' +
      '<p style="font-size:10px;color:#059669;margin:2px 0 0;">' + n.highProb + ' high probability</p>' +
    '</div>';
  }).join('');

  container.innerHTML = `
    <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0;">Pre-Market Inventory Network</h2>
      <p style="font-size:13px;color:#6b7280;margin:4px 0 0;">Properties likely to sell soon — identified from ownership, mortgage, renovation, and demand signals</p>
    </div>
    <div style="padding:16px 24px;">
      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
        <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Total Prospects</p>
          <p style="font-size:28px;font-weight:800;color:#111827;margin:0;">${totalLeads}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">High Probability</p>
          <p style="font-size:28px;font-weight:800;color:#059669;margin:0;">${highProb}</p>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <p style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin:0 0 6px;">Avg Readiness Score</p>
          <p style="font-size:28px;font-weight:800;color:#3b82f6;margin:0;">${avgScore}</p>
        </div>
      </div>

      <!-- By Neighborhood -->
      ${nhCards ? '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">' + nhCards + '</div>' : ''}

      <!-- Top Prospects Table -->
      ${topRows ? `
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;"><h3 style="font-size:14px;font-weight:700;color:#374151;margin:0;">Top Prospects</h3></div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Address</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Borough</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Grade</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Score</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Status</th>
            </tr>
          </thead>
          <tbody>${topRows}</tbody>
        </table>
      </div>` : '<div style="padding:40px;text-align:center;color:#9ca3af;">No seller leads yet. Add properties via Seller Readiness tool.</div>'}

      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        <i class="fas fa-info-circle" style="margin-right:4px;"></i>
        Signals: ownership duration, mortgage age, renovation permits, building risk, page visits, CMA requests. Scored daily.
      </p>
    </div>
  `;
}

window.initPremarketInventory = initPremarketInventory;
